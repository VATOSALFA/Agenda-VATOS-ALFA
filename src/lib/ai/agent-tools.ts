import { getDb } from '@/lib/firebase-server';
import { FieldValue } from 'firebase-admin/firestore';
import { getClientReservations, getClientReservation, validateAgentBooking, assertLiveAgentMutation } from './agent-reservations';
import { hasPendingDeposit, isUpcomingReservation } from './agent-utils';
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getAvailableSlots, createPublicReservation } from '@/lib/actions/booking';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseClientCustomDuration } from '@/lib/client-notes-helper';
import { chatContextStorage } from '@/lib/ai/agent-context';
import {
  formatTime12h,
  matchBarberName,
  normalizeTimeTo24h,
  cleanSearchStr,
  getMexicoDateInfo,
  resolveTargetDates,
  resolveServices,
  getBarberServiceDuration,
  isBarberCapableOfServices,
} from '@/lib/ai/agent-utils';
import {
  calcularAnticipoParaServicios,
  crearPreferenciaMercadoPagoChat,
} from '@/lib/ai/agent-payments';
import {
  consultarPaseAlfaYPromocionesTool,
  computeClientLoyaltySummary,
} from '@/lib/ai/agent-loyalty-knowledge';
import {
  consultarServiciosTool,
  consultarBarberosTool,
  consultarProductosTool,
  consultarUbicacionTool,
  consultarPoliticasYTerminosTool,
  resolveProducts,
} from '@/lib/ai/agent-catalog-tools';

export {
  consultarServiciosTool,
  consultarBarberosTool,
  consultarProductosTool,
  consultarUbicacionTool,
  consultarPoliticasYTerminosTool,
  consultarPaseAlfaYPromocionesTool,
  resolveProducts,
};

async function syncConversationClientIdentity(
  db: FirebaseFirestore.Firestore,
  identity: {
    clientId?: string;
    name?: string;
    phone?: string;
    email?: string;
  }
) {
  const ctx = chatContextStorage.getStore();
  if (!ctx) return;

  if (identity.clientId) ctx.clientId = identity.clientId;
  if (identity.name && identity.name !== 'Cliente') ctx.clientName = identity.name;
  if (identity.phone) ctx.clientPhone = identity.phone;
  if (identity.email) ctx.clientEmail = identity.email;

  if (ctx.conversationId) {
    try {
      const updatePayload: Record<string, any> = {
        updated_at: new Date(),
      };
      if (identity.clientId) updatePayload.cliente_id = identity.clientId;
      if (identity.name && identity.name !== 'Cliente') updatePayload.cliente_nombre = identity.name;
      if (identity.phone) updatePayload.cliente_telefono = identity.phone;
      if (identity.email) updatePayload.cliente_correo = identity.email;

      await db.collection('conversaciones').doc(ctx.conversationId).set(updatePayload, { merge: true });
    } catch (_) {
      // No bloquear flujo por actualización de metadatos de conversación
    }
  }
}

export const consultarDisponibilidadTool = ai.defineTool(
  {
    name: 'consultar_disponibilidad',
    description:
      'Consulta los horarios libres reales en la agenda de VATOS ALFA. Puede consultar para una fecha específica o buscar automáticamente en los próximos 3 a 7 días los horarios más próximos disponibles con un barbero específico o con todos los barberos. Calcula automáticamente la duración exacta por barbero/experto según la configuración del servicio (por ejemplo: Beatriz tarda 30 min, Lalo tarda 60 min en corte), permitiendo encontrar espacios continuos reales y precisos.',
    inputSchema: z.object({
      fecha: z
        .string()
        .optional()
        .describe('Fecha en formato AAAA-MM-DD según el calendario actual del contexto. También acepta hoy, mañana y pasado mañana. Si no se especifica día, busca los próximos días.'),
      profesionalId: z.string().optional().describe('ID opcional del barbero'),
      barberoNombre: z
        .string()
        .optional()
        .describe('Nombre del barbero (ej. Beatriz, Bety, Lalo, Eduardo, Ivon, Lupita, Alfredo)'),
      servicioNombre: z
        .string()
        .optional()
        .describe('Nombre del servicio o combinación de servicios (ej. "Corte de cabello", "Corte de cabello + Barba express", "Corte y barba"). Si se omite, se asume Corte de cabello por defecto.'),
      serviciosNombres: z
        .array(z.string())
        .optional()
        .describe('Lista opcional de nombres de los servicios si son varios. Si un servicio se repite (ej. 2 cortes de cabello o corte para dos personas), INCLÚYELO REPETIDO en la lista (ej: ["Corte de cabello", "Corte de cabello", "Arreglo de ceja"]) o indica la cantidad (ej: ["2 cortes de cabello", "arreglo de ceja"])'),
      duracionMinutos: z.number().int().positive().max(720).optional().describe('Duración manual forzada en minutos (opcional). Si se omite, el sistema calcula automáticamente la duración exacta de cada barbero según el servicio o las notas personalizadas del cliente.'),
      clienteTelefono: z.string().optional().describe('Teléfono del cliente (opcional para detectar notas del cliente y duraciones especiales personalizadas)'),
      clienteNombre: z.string().optional().describe('Nombre del cliente'),
      diasABuscar: z
        .number()
        .optional()
        .describe('Número de días a consultar a partir de la fecha inicial (por defecto 4 para encontrar lo más próximo)'),
    }),
    outputSchema: z.object({
      diaMasProximo: z.string().optional().describe('El día más cercano que tiene al menos un horario disponible'),
      opcionesMasProximas: z.array(z.string()).optional().describe('Las 2 o 3 opciones más tempranas del día más próximo'),
      disponibilidadPorFecha: z.array(
        z.object({
          fecha: z.string(),
          diaSemana: z.string(),
          barberoId: z.string(),
          barberoNombre: z.string(),
          duracionMinutos: z.number().int().positive().max(720).optional(),
          horarios: z.array(z.string()),
        })
      ),
      resumenTexto: z.string(),
      duracionConsultada: z.number().optional(),
      serviciosConsultados: z.string().optional(),
      mensaje: z.string().optional(),
    }),
  },
  async ({ fecha, profesionalId, barberoNombre, servicioNombre, serviciosNombres, duracionMinutos, diasABuscar, clienteTelefono }) => {
    try {
      const db = getDb();

      // Cargar posibles notas del expediente del cliente (desde contexto o búsqueda rápida)
      const currentCtx = chatContextStorage.getStore();
      let resolvedNotes = currentCtx?.clientNotes || '';
      if (!resolvedNotes && (clienteTelefono || currentCtx?.clientPhone)) {
        try {
          const tPhone = (clienteTelefono || currentCtx?.clientPhone || '').replace(/\D/g, '').slice(-10);
          if (tPhone) {
            const snap = await db.collection('clientes').where('telefono', '==', tPhone).limit(1).get();
            if (!snap.empty) {
              resolvedNotes = snap.docs[0].data().notas || snap.docs[0].data().nota || '';
            }
          }
        } catch (_) {}
      }

      // Cargar servicios activos
      const servsSnap = await db.collection('servicios').where('active', '==', true).get();
      const allServices = servsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Resolver servicios siempre para tener la lista de servicios a evaluar
      const resolved = resolveServices({
        allServices,
        servicesNames: serviciosNombres,
        serviceName: servicioNombre,
      });

      const selectedServices = resolved.services;
      const evaluatedServiceName = resolved.displayTitle || resolved.names.join(' + ');

      const profsSnap = await db.collection('profesionales').where('active', '==', true).get();
      const barbers = profsSnap.docs
        .filter((d) => !d.data().deleted)
        .map((d) => ({
          id: d.id,
          name: d.data().name || '',
          publicName: d.data().publicName || d.data().name || 'Barbero',
        }));

      let targetBarbers = barbers;
      if (profesionalId) {
        targetBarbers = barbers.filter((b) => b.id === profesionalId);
      } else if (barberoNombre) {
        const matched = barbers.filter((b) => matchBarberName(barberoNombre, b));
        targetBarbers = matched;
      }

      // Filtrar sólo barberos habilitados para realizar los servicios solicitados
      targetBarbers = targetBarbers.filter((b) => isBarberCapableOfServices(selectedServices, b.id));

      const config = (await db.collection('settings').doc('sofia').get()).data() || {};
      const todayIso = getMexicoDateInfo().todayIso;
      const latest = Date.parse(`${todayIso}T12:00:00Z`) + (config.maxDaysInFuture ?? 14) * 86400000;
      const datesToCheck = resolveTargetDates({ fechaInput: fecha, diasABuscar }).filter(date => Date.parse(`${date}T12:00:00Z`) <= latest);
      const earliest = Date.now() + (config.minReservationBuffer ?? 30) * 60000;

      const results: Array<{
        fecha: string;
        diaSemana: string;
        barberoId: string;
        barberoNombre: string;
        duracionMinutos: number;
        horarios: string[];
      }> = [];

      for (const curDate of datesToCheck) {
        const parsed = new Date(curDate + 'T12:00:00');
        const dayLabel = format(parsed, "EEEE d 'de' MMMM", { locale: es });

        for (const b of targetBarbers) {
          try {
            let customClientDuration: number | null = null;
            if (resolvedNotes) {
              customClientDuration = parseClientCustomDuration(resolvedNotes, b.publicName || b.name);
            }

            const baseDuration = selectedServices.reduce((total, service) => total +
              (customClientDuration && /corte/i.test(service.name || service.nombre || '') ? customClientDuration : getBarberServiceDuration([service], b.id, 30)), 0);
            const barberDuration = Math.max(baseDuration, duracionMinutos || 0);

            const isSimulation = Boolean(
              currentCtx?.simulation ||
              currentCtx?.conversationId?.startsWith('sim') ||
              clienteTelefono?.startsWith('sim') ||
              currentCtx?.clientPhone?.startsWith('sim')
            );

            const res = await getAvailableSlots({
              date: curDate,
              professionalId: b.id,
              durationMinutes: barberDuration,
              minReservationBufferMinutes: config.minReservationBuffer ?? 30,
              isSandbox: isSimulation,
            });

            if (res && 'slots' in res && Array.isArray(res.slots)) {
              res.slots = res.slots.filter(time => Date.parse(`${curDate}T${time}:00-06:00`) >= earliest);
            }
            if (res && 'slots' in res && Array.isArray((res as any).slots) && (res as any).slots.length > 0) {
              results.push({
                fecha: curDate,
                diaSemana: dayLabel,
                barberoId: b.id,
                barberoNombre: b.publicName,
                duracionMinutos: barberDuration,
                horarios: (res as any).slots,
              });
            }
          } catch (slotErr) {
            console.error(`Error fetching slots for barber ${b.id} on ${curDate}:`, slotErr);
          }
        }
      }

      let resumenTexto = '';
      let diaMasProximo: string | undefined;
      let opcionesMasProximas: string[] = [];

      if (results.length === 0) {
        const srvTxt = evaluatedServiceName ? ` para ${evaluatedServiceName}` : '';
        resumenTexto = `No hay horarios disponibles${srvTxt} en las fechas consultadas (${datesToCheck.join(', ')}).`;
      } else {
        const diasConDisponibilidad = Array.from(new Set(results.map((r) => r.fecha)));
        const primerDiaFecha = diasConDisponibilidad[0];
        const resultadosPrimerDia = results.filter((r) => r.fecha === primerDiaFecha);

        const slotsPrimerDia: Array<{ hora: string; hora12: string; barberoNombre: string }> = [];
        for (const r of resultadosPrimerDia) {
          for (const h of r.horarios) {
            slotsPrimerDia.push({
              hora: h,
              hora12: formatTime12h(h),
              barberoNombre: r.barberoNombre,
            });
          }
        }
        slotsPrimerDia.sort((a, b) => a.hora.localeCompare(b.hora));

        const horasMap = new Map<string, string[]>();
        for (const s of slotsPrimerDia) {
          if (!horasMap.has(s.hora12)) {
            horasMap.set(s.hora12, []);
          }
          if (!horasMap.get(s.hora12)!.includes(s.barberoNombre)) {
            horasMap.get(s.hora12)!.push(s.barberoNombre);
          }
        }

        const todasLasHoras = Array.from(horasMap.entries());
        opcionesMasProximas = todasLasHoras.map(([hora12, barberos]) => {
          return `${hora12} con ${barberos.join(' o ')}`;
        });

        const diaSemanaLabel = resultadosPrimerDia[0].diaSemana;
        diaMasProximo = `${diaSemanaLabel} (${primerDiaFecha})`;

        const desglosePrimerDia = resultadosPrimerDia
          .map((r) => {
            const all12h = r.horarios.map((h) => formatTime12h(h)).join(', ');
            return `- ${r.barberoNombre}: ${all12h}`;
          })
          .join('\n');

        resumenTexto = `HORARIOS DISPONIBLES EN TIEMPO REAL (IDÉNTICOS A LA PÁGINA WEB):\n` +
          `- Día: ${diaSemanaLabel} (${primerDiaFecha})\n` +
          `${desglosePrimerDia}\n\n` +
          `INSTRUCCIÓN OBLIGATORIA PARA EL ASISTENTE (JANET): Comparte TODOS los horarios disponibles del ${diaSemanaLabel} para el barbero solicitado (o las opciones del día si no especificó barbero), SIN OMITIR NINGÚN HORARIO (por ejemplo, incluye también los de las 7:00 PM, 7:30 PM, 8:30 PM si aparecen en la lista). Los horarios que menciones deben coincidir al 100% con los de la página web para no desperdiciar ningún espacio disponible de los barberos. No desgloses días posteriores (${diasConDisponibilidad.slice(1).join(', ') || 'ninguno más'}) a menos que el cliente pida otra fecha.\n\n` +
          `Referencia de días posteriores (solo por si el cliente pide otra fecha):\n` +
          results
            .map((r) => {
              const all12h = r.horarios.map((h) => formatTime12h(h)).join(', ');
              return `${r.diaSemana} con ${r.barberoNombre}: ${all12h}`;
            })
            .join('\n');
      }

      return {
        diaMasProximo,
        opcionesMasProximas,
        disponibilidadPorFecha: results.map((r) => ({
          ...r,
          horarios12h: r.horarios.map((h) => formatTime12h(h)),
        })),
        resumenTexto,
        serviciosConsultados: evaluatedServiceName,
        duracionConsultada: results.length > 0 ? results[0].duracionMinutos : undefined,
      };
    } catch (e: any) {
      console.error('Error in consultar_disponibilidad:', e);
      return {
        disponibilidadPorFecha: [],
        resumenTexto: `Error consultando disponibilidad: ${e.message}`,
        mensaje: e.message,
      };
    }
  }
);

export const verificarORegistrarClienteTool = ai.defineTool(
  {
    name: 'verificar_o_registrar_cliente',
    description:
      'Verifica si el cliente ya está registrado en la base de datos de VATOS ALFA mediante su celular o correo electrónico y vincula su identidad automáticamente a la conversación del chat. Si el cliente NO está registrado pero ya proporcionó su nombre completo, celular (10 dígitos) y correo electrónico, lo registra formalmente en la base de datos de clientes con su número de cliente asignado.',
    inputSchema: z.object({
      celular: z.string().describe('Número de celular o WhatsApp del cliente (10 dígitos en México, ej. 4421234567)'),
      correoElectronico: z.string().optional().describe('Correo electrónico del cliente (ej. cliente@gmail.com)'),
      nombreCompleto: z.string().optional().describe('Nombre completo del cliente (nombre y apellido)'),
    }),
    outputSchema: z.object({
      registrado: z.boolean(),
      clienteId: z.string().optional(),
      nombre: z.string().optional(),
      celular: z.string().optional(),
      correo: z.string().optional(),
      numeroCliente: z.union([z.number(), z.string()]).optional(),
      paseAlfaResumen: z.string().optional(),
      faltanDatos: z.array(z.string()).optional(),
      mensaje: z.string(),
    }),
  },
  async ({ celular, correoElectronico, nombreCompleto }) => {
    try {
      const cleanPhone = (celular || '').replace(/\D/g, '').slice(-10);
      const cleanEmail = (correoElectronico || '').trim().toLowerCase();
      const db = getDb();
      const clientsRef = db.collection('clientes');

      let existingDoc: any = null;

      // 1. Buscar por teléfono si tiene al menos 10 dígitos
      if (cleanPhone && cleanPhone.length >= 10) {
        for (const phoneVariant of [cleanPhone, `52${cleanPhone}`, `521${cleanPhone}`]) {
          const q = await clientsRef.where('telefono', '==', phoneVariant).limit(1).get();
          if (!q.empty) {
            existingDoc = q.docs[0];
            break;
          }
        }
      }

      // 2. Si no se encontró por teléfono, buscar por correo
      if (!existingDoc && cleanEmail && cleanEmail.includes('@')) {
        const q = await clientsRef.where('correo', '==', cleanEmail).limit(1).get();
        if (!q.empty) {
          existingDoc = q.docs[0];
        } else {
          const qLegacy = await clientsRef.where('email', '==', cleanEmail).limit(1).get();
          if (!qLegacy.empty) existingDoc = qLegacy.docs[0];
        }
      }

      // 3. Si ya existe en la base de datos
      if (existingDoc) {
        const data = existingDoc.data();
        const currentEmail = data.correo || data.email || '';

        if ((!currentEmail || !currentEmail.includes('@')) && cleanEmail && cleanEmail.includes('@')) {
          await clientsRef.doc(existingDoc.id).update({ correo: cleanEmail, updated_at: FieldValue.serverTimestamp() });
          data.correo = cleanEmail;
        }

        const currentPhone = String(data.telefono || '').replace(/\D/g, '');
        if (currentPhone.length < 10 && cleanPhone && cleanPhone.length >= 10) {
          await clientsRef.doc(existingDoc.id).update({ telefono: cleanPhone, updated_at: FieldValue.serverTimestamp() });
          data.telefono = cleanPhone;
        }

        const resolvedFullName = `${data.nombre || ''} ${data.apellido || ''}`.trim() || 'Cliente';
        const resolvedPhone = data.telefono || cleanPhone;
        const resolvedEmail = data.correo || data.email || cleanEmail;

        await syncConversationClientIdentity(db, {
          clientId: existingDoc.id,
          name: resolvedFullName,
          phone: resolvedPhone,
          email: resolvedEmail,
        });

        const loyalty = computeClientLoyaltySummary(data);

        const hasEmail = Boolean(resolvedEmail) && String(resolvedEmail).includes('@');
        const hasPhone = Boolean(resolvedPhone) && String(resolvedPhone).replace(/\D/g, '').length >= 10;

        const missing: string[] = [];
        if (!hasPhone) missing.push('celular');
        if (!hasEmail) missing.push('correo electrónico');

        if (missing.length > 0) {
          return {
            registrado: false,
            clienteId: existingDoc.id,
            nombre: resolvedFullName,
            celular: resolvedPhone,
            correo: resolvedEmail,
            paseAlfaResumen: loyalty.resumenTexto,
            faltanDatos: missing,
            mensaje: `El cliente fue encontrado en la base de datos pero le falta: ${missing.join(', ')}. Es requisito indispensable solicitárselo antes de agendar.`,
          };
        }

        return {
          registrado: true,
          clienteId: existingDoc.id,
          nombre: resolvedFullName,
          celular: resolvedPhone,
          correo: resolvedEmail,
          numeroCliente: data.numero_cliente,
          paseAlfaResumen: loyalty.resumenTexto,
          mensaje: `El cliente ya está registrado en la base de datos de VATOS ALFA y su identidad quedó vinculada al chat. Puedes proceder a agendar su cita con crear_cita.`,
        };
      }

      // 4. Si NO existe en la base de datos: verificar si contamos con los datos para registrarlo
      const missing: string[] = [];
      if (!nombreCompleto || nombreCompleto.trim().length < 2 || /cliente/i.test(nombreCompleto)) missing.push('nombre completo');
      if (!cleanPhone || cleanPhone.length < 10) missing.push('celular (10 dígitos)');
      if (!cleanEmail || !cleanEmail.includes('@')) missing.push('correo electrónico');

      if (missing.length > 0) {
        return {
          registrado: false,
          faltanDatos: missing,
          mensaje: `El cliente NO está registrado en la base de datos. Para poder agendar su cita, es OBLIGATORIO que le solicites con amabilidad los siguientes datos faltantes: ${missing.join(', ')}.`,
        };
      }

      // 5. Proceder a registrarlo en Firestore
      const nameParts = (nombreCompleto || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || '';
      const fullNewName = `${firstName} ${lastName}`.trim();

      let nextClientNumber = 1;
      try {
        const maxSnap = await clientsRef.where('numero_cliente', '>=', 0).orderBy('numero_cliente', 'desc').limit(1).get();
        if (!maxSnap.empty) {
          const val = Number(maxSnap.docs[0].data().numero_cliente);
          if (!isNaN(val)) nextClientNumber = val + 1;
        }
      } catch (_) {}

      const newClientDoc = {
        nombre: firstName,
        apellido: lastName,
        telefono: cleanPhone,
        correo: cleanEmail,
        numero_cliente: nextClientNumber,
        creado_en: FieldValue.serverTimestamp(),
        origen: 'asistente_virtual_janet',
      };

      const added = await clientsRef.add(newClientDoc);

      await syncConversationClientIdentity(db, {
        clientId: added.id,
        name: fullNewName,
        phone: cleanPhone,
        email: cleanEmail,
      });

      return {
        registrado: true,
        clienteId: added.id,
        nombre: fullNewName,
        celular: cleanPhone,
        correo: cleanEmail,
        numeroCliente: nextClientNumber,
        mensaje: `¡Cliente registrado exitosamente en la base de datos de VATOS ALFA con el ID #${nextClientNumber} y vinculado a este chat! Ahora procede a crear su cita con crear_cita.`,
      };
    } catch (err: any) {
      console.error('Error in verificarORegistrarClienteTool:', err);
      return {
        registrado: false,
        mensaje: `Error al verificar o registrar cliente: ${err.message}`,
      };
    }
  }
);

export const crearCitaTool = ai.defineTool(
  {
    name: 'crear_cita',
    description:
      'Registra una cita con los servicios, profesional, fecha y hora explícitamente aceptados por el cliente. Requiere que el cliente tenga número celular y correo electrónico para poder registrarse en la base de datos.',
    inputSchema: z.object({
      fecha: z.string().describe('Fecha de la cita AAAA-MM-DD según el calendario actual de la conversación. No usar fechas pasadas ni cambiar la fecha solicitada.'),
      hora: z.string().describe('Hora de inicio (ejemplo 17:00 o 5:00 PM)'),
      profesionalId: z.string().optional().describe('ID del barbero'),
      barberoNombre: z.string().optional().describe('Nombre del barbero (ej. Beatriz, Bety, Lalo, Eduardo, Ivon, Lupita, Alfredo)'),
      servicioIds: z.array(z.string()).optional().describe('Lista con IDs de servicio'),
      servicioNombre: z.string().optional().describe('Nombre del servicio o combinacion de servicios (ej. "Corte de cabello", "Corte de cabello + Barba express", "Corte y barba")'),
      serviciosNombres: z.array(z.string()).optional().describe('Lista opcional de nombres de los servicios si son varios. Si un servicio se repite (ej. 2 personas o 2 cortes), INCLÚYELO REPETIDO en la lista (ej: ["Corte de cabello", "Corte de cabello", "Arreglo de ceja"]) o con multiplicador (ej: ["2 cortes de cabello", "arreglo de ceja"])'),
      productoNombre: z.string().optional().describe('Nombre de un producto fisico que el cliente desea comprar o apartar junto a su cita (ej. "Cera para peinar", "After shave", "Polvo textura")'),
      productosNombres: z.array(z.string()).optional().describe('Lista opcional de nombres de productos fisicos a apartar junto a la cita'),
      nombreCliente: z.string().describe('Nombre del cliente. Si ya conoces al cliente en la conversación, USA SU NOMBRE DIRECTAMENTE SIN PEDÍRSELO. Solo pídelo si no se tiene nombre registrado o si agenda para otra persona.'),
      telefonoCliente: z.string().describe('Teléfono o celular del cliente (10 dígitos).'),
      correoCliente: z.string().optional().describe('Correo electrónico del cliente (ej. cliente@gmail.com). REQUISITO OBLIGATORIO para agendar y registrar al cliente en la base de datos.'),
      notas: z.string().optional().describe('Notas o peticiones especiales'),
      duracionMinutos: z.number().int().positive().max(720).optional().describe('Duración total en minutos calculada para la cita (incluyendo duraciones personalizadas de notas de cliente o cabello difícil si aplica)'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      citaId: z.string().optional(),
      requiereAnticipo: z.boolean().optional(),
      montoTotal: z.number().optional(),
      montoAnticipo: z.number().optional(),
      saldoPendiente: z.number().optional(),
      linkPago: z.string().optional(),
      mensaje: z.string(),
      detalles: z.string().optional(),
    }),
  },
  async ({ fecha, hora, profesionalId, barberoNombre, servicioIds, servicioNombre, serviciosNombres, productoNombre, productosNombres, nombreCliente, telefonoCliente, correoCliente, notas, duracionMinutos }) => {
    try {
      const db = getDb();
      const targetFecha = (fecha || '').trim();
      const normalizedTime = normalizeTimeTo24h(hora);
      await validateAgentBooking(targetFecha, normalizedTime, true);
      const time12h = formatTime12h(normalizedTime);

      // Resolver barbero
      let finalProfId = profesionalId;
      let finalBarberName = barberoNombre || 'tu barbero';

      const profsSnap = await db.collection('profesionales').where('active', '==', true).get();
      const barbers = profsSnap.docs
        .filter((d) => !d.data().deleted)
        .map((d) => ({
          id: d.id,
          name: d.data().name || '',
          publicName: d.data().publicName || d.data().name || 'Barbero',
        }));

      if (barberoNombre) {
        const found = barbers.find((b) => matchBarberName(barberoNombre, b));
        if (!found) throw new Error('No se encontró el barbero solicitado. Confirma el nombre antes de agendar.');
        if (found) {
          finalProfId = found.id;
          finalBarberName = found.publicName;
        }
      }

      if (!finalProfId) throw new Error('Confirma el profesional con el cliente antes de crear la cita.');
      if (!barbers.some(b => b.id === finalProfId)) throw new Error('El profesional no está disponible.');
      finalBarberName = barbers.find(b => b.id === finalProfId)!.publicName;

      if (!servicioIds?.length && !serviciosNombres?.length && !servicioNombre) throw new Error('Confirma los servicios antes de crear la cita.');

      const servsSnap = await db.collection('servicios').where('active', '==', true).get();
      const allServices = servsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const resolved = resolveServices({
        allServices,
        serviceIds: servicioIds,
        servicesNames: serviciosNombres,
        serviceName: servicioNombre,
      });

      const finalServIds = resolved.ids;
      const finalServName = resolved.displayTitle || resolved.names.join(' + ');
      const selectedServices = resolved.services;
      if (!isBarberCapableOfServices(selectedServices, finalProfId)) throw new Error('El profesional no realiza todos los servicios seleccionados.');

      const currentCtx = chatContextStorage.getStore();
      let resolvedClientNotes = currentCtx?.clientNotes || '';
      if (!resolvedClientNotes && (telefonoCliente || currentCtx?.clientPhone)) {
        try {
          const tPhone = (telefonoCliente || currentCtx?.clientPhone || '').replace(/\D/g, '').slice(-10);
          if (tPhone) {
            const snap = await db.collection('clientes').where('telefono', '==', tPhone).limit(1).get();
            if (!snap.empty) {
              resolvedClientNotes = snap.docs[0].data().notas || snap.docs[0].data().nota || '';
            }
          }
        } catch (_) {}
      }

      let customClientDuration: number | null = null;
      if (resolvedClientNotes && finalBarberName) {
        customClientDuration = parseClientCustomDuration(resolvedClientNotes, finalBarberName);
      }
      const baseDuration = selectedServices.reduce((total, service) => total +
        (customClientDuration && /corte/i.test(service.name || service.nombre || '') ? customClientDuration : getBarberServiceDuration([service], finalProfId!, 30)), 0);
      const finalDuration = Math.max(baseDuration, duracionMinutos || 0);

      const overrideIndex = selectedServices.findIndex(service => selectedServices.length === 1 || /corte/i.test(service.name || service.nombre || ''));
      const normalTotal = getBarberServiceDuration(selectedServices, finalProfId!, 30);
      const bookingDuration = overrideIndex >= 0
        ? finalDuration - (normalTotal - getBarberServiceDuration([selectedServices[overrideIndex]], finalProfId!, 30))
        : undefined;
      if (overrideIndex < 0 && finalDuration !== normalTotal) throw new Error('La duración especial de esta combinación requiere revisión de recepción.');

      const resolvedProducts = await resolveProducts(db, productosNombres, productoNombre);
      const extraProductsAmount = resolvedProducts.reduce((sum, p) => sum + (p.precio * (p.cantidad || 1)), 0);

      const chatContext = chatContextStorage.getStore();
      const userExplicitlyAnsweredUpsell = Boolean(
        chatContext?.userMessage &&
        /(solo el corte|solo corte|nada m[aá]s|sin nada|as[ií] est[aá] bien|no gracias|no, gracias|solo eso|sin producto|s[ií].*(cera|polvo|barba|ceja|mascarilla|shampoo|after)|agrega|apartame|ap[aá]rtame)/i.test(
          chatContext.userMessage
        )
      );

      // Guardián determinista de venta cruzada ("Como Buena Vendedora"):
      // Si aún no se le ha ofrecido un producto (como Cera para peinar) o servicio extra en esta conversación hoy,
      // interceptamos el cierre para que Janet ofrezca UNA SOLA VEZ antes de crear la cita.
      if (
        chatContext &&
        !chatContext.alreadyOfferedUpsellToday &&
        !userExplicitlyAnsweredUpsell &&
        resolvedProducts.length === 0 &&
        selectedServices.length <= 1
      ) {
        if (chatContext.conversationId) {
          try {
            await db.collection('conversaciones').doc(chatContext.conversationId).set(
              { fecha_ultima_oferta_cruzada: new Date() },
              { merge: true }
            );
          } catch (_) {}
        }
        return {
          exito: false,
          mensaje:
            `¡DETENTE ANTES DE CERRAR LA CITA! El horario del ${targetFecha} a las ${time12h} con ${finalBarberName} está disponible, pero como buena vendedora de VATOS ALFA aún NO le has ofrecido venta cruzada al cliente. ` +
            `NO digas todavía que su cita ya está agendada ni entregues folio. ` +
            `En su lugar, confírmale con entusiasmo que tienes libre el espacio de las ${time12h} con ${finalBarberName} y pregúntale amablemente UNA SOLA VEZ si antes de cerrar su cita le gustaría que le apartes una Cera para peinar ($179.00 MXN) o Polvo textura ($180.00 MXN) para su peinado diario, o bien agregar un Arreglo de barba exprés ($100.00 MXN) o Arreglo de ceja ($30.00 MXN). ` +
            `En cuanto te responda sí o no en el siguiente mensaje, llamarás inmediatamente a crear_cita.`,
        };
      }

      const anticipoCalc = await calcularAnticipoParaServicios(selectedServices, extraProductsAmount, normalizedTime);

      const nameParts = (nombreCliente || 'Cliente').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || 'Alfa';

      const productsSummary = resolvedProducts.map((p) => `${p.nombre} (x${p.cantidad})`).join(', ');
      const extraNotes = [
        notas ? notas : '',
        productsSummary ? `Productos apartados: ${productsSummary}` : '',
        anticipoCalc.requiereAnticipo ? `Requiere anticipo: $${anticipoCalc.montoAnticipo}` : 'Agendado por Asistente Virtual Janet',
      ].filter(Boolean).join(' | ');

      const resolvedEmail = (correoCliente || chatContext?.clientEmail || '').trim().toLowerCase();
      const cleanPhone = (telefonoCliente || chatContext?.clientPhone || '').replace(/\D/g, '').slice(-10);

      if (!resolvedEmail || !resolvedEmail.includes('@')) {
        return {
          exito: false,
          mensaje: 'No es posible crear la cita todavía: en VATOS ALFA es REQUISITO OBLIGATORIO que todo cliente cuente con correo electrónico registrado antes de agendar. Por favor solicítale con amabilidad su correo electrónico al cliente para poder registrarlo en el sistema y agendar su cita.',
        };
      }

      if (!cleanPhone || cleanPhone.length < 10) {
        return {
          exito: false,
          mensaje: 'No es posible crear la cita todavía: se requiere un número de celular válido de 10 dígitos para registrar la cita y enviar las confirmaciones. Por favor solicítale su celular al cliente.',
        };
      }

      const isSimulation = Boolean(
        chatContext?.simulation ||
        chatContext?.clientPhone?.startsWith('sim') ||
        telefonoCliente?.startsWith('sim') ||
        chatContext?.conversationId?.startsWith('sim')
      );

      const res = await createPublicReservation({
        client: {
          name: firstName,
          lastName: lastName,
          phone: cleanPhone || telefonoCliente,
          email: resolvedEmail,
        },
        serviceIds: finalServIds,
        professionalId: finalProfId!,
        date: targetFecha,
        time: normalizedTime,
        duration: bookingDuration,
        customDuration: bookingDuration,
        notes: extraNotes,
        origin: isSimulation ? 'simulador' : 'chatbot',
        canal_reserva: isSimulation ? 'chatbot_sandbox' : 'chatbot',
        isSandbox: isSimulation,
        status: anticipoCalc.requiereAnticipo ? 'Pendiente de pago' : 'Reservado',
        amountDue: anticipoCalc.montoAnticipo,
        totalAmount: anticipoCalc.montoTotal,
        paymentStatus: anticipoCalc.requiereAnticipo ? 'pending_payment' : 'pendiente',
        productItems: resolvedProducts,
      });

      if ('error' in res && res.error) {
        let alternativeSlotsText = '';
        try {
          const barberDuration = finalDuration || getBarberServiceDuration(selectedServices, finalProfId!, 30);
          const slotsRes = await getAvailableSlots({
            date: targetFecha,
            professionalId: finalProfId!,
            durationMinutes: barberDuration,
            isSandbox: isSimulation,
          });
          const validSlots = (slotsRes as any).slots || [];
          if (validSlots.length > 0) {
            const formatted = validSlots.map((s: string) => formatTime12h(s)).join(', ');
            alternativeSlotsText = ` Horarios disponibles reales donde sí cabe la duración completa (${finalServName} - ${barberDuration} min) con ${finalBarberName} para esa fecha: ${formatted}.`;
          }
        } catch (_) {}

        return {
          exito: false,
          mensaje: `No fue posible registrar la cita: ${res.error}.${alternativeSlotsText} Explica el motivo real y confirma otra opción con el cliente.`,
        };
      }

      const reservationId = (res as any).reservationId || (res as any).id;
      const bookedClientId = (res as any).clientId || chatContext?.clientId;

      if (reservationId) {
        try {
          const targetCol = isSimulation ? 'reservas_sandbox' : 'reservas';
          await db.collection(targetCol).doc(reservationId).set(
            {
              origen: 'chatbot',
              canal_reserva: 'chatbot_janet',
              whatsappConfirmationSent: true,
              confirmationSentViaApp: true,
            },
            { merge: true }
          );
        } catch (_) {}
      }

      await syncConversationClientIdentity(db, {
        clientId: bookedClientId,
        name: `${firstName} ${lastName}`.trim(),
        phone: cleanPhone,
        email: resolvedEmail,
      });

      if (chatContext?.conversationId) {
        try {
          await db.collection('conversaciones').doc(chatContext.conversationId).set(
            {
              fecha_ultima_oferta_cruzada: new Date(),
              updated_at: new Date(),
            },
            { merge: true }
          );
        } catch (_) {}
      }

      if (anticipoCalc.requiereAnticipo) {
        const fullTitle = resolvedProducts.length > 0
          ? `${finalServName} + ${resolvedProducts.map((p) => p.nombre).join(', ')} (${targetFecha} ${time12h})`
          : `${finalServName} (${targetFecha} ${time12h})`;

        const pref = await crearPreferenciaMercadoPagoChat({
          reservationId,
          title: fullTitle,
          amount: anticipoCalc.montoAnticipo,
          clientName: nombreCliente,
          clientPhone: telefonoCliente,
        });

        const linkPago = pref?.initPoint || '';

        if (linkPago) {
          const targetCol = isSimulation ? 'reservas_sandbox' : 'reservas';
          await db.collection(targetCol).doc(reservationId).set(
            {
              link_pago_anticipo: linkPago,
              updated_at: new Date(),
            },
            { merge: true }
          );
        }

        if (!linkPago) {
          return { exito: true, citaId: reservationId, requiereAnticipo: true, montoTotal: anticipoCalc.montoTotal, montoAnticipo: anticipoCalc.montoAnticipo, saldoPendiente: anticipoCalc.saldoPendiente, linkPago: '', mensaje: 'La cita quedó registrada pendiente de pago, pero no se pudo generar el enlace. No crees otra cita: solicita recepción para completar el anticipo.' };
        }
        const productosTexto = resolvedProducts.length > 0
          ? ` y te aparté ${resolvedProducts.map((p) => `${p.nombre} por $${p.precio} MXN`).join(', ')}`
          : '';

        return {
          exito: true,
          citaId: reservationId,
          requiereAnticipo: true,
          montoTotal: anticipoCalc.montoTotal,
          montoAnticipo: anticipoCalc.montoAnticipo,
          saldoPendiente: anticipoCalc.saldoPendiente,
          linkPago,
          mensaje: `Cita pre-apartada. Se requiere un anticipo de $${anticipoCalc.montoAnticipo} MXN para confirmar.`,
          detalles: `Cita pre-apartada para ${targetFecha} a las ${time12h} con ${finalBarberName} para ${finalServName}${productosTexto}. Total: $${anticipoCalc.montoTotal} MXN. Anticipo requerido: $${anticipoCalc.montoAnticipo} MXN. Saldo a liquidar en sucursal: $${anticipoCalc.saldoPendiente} MXN.\n\nEnlace de pago seguro de Mercado Pago:\n${linkPago}\n\nDEBES compartirle este enlace al cliente en su propia línea para que realice su anticipo. IMPORTANTE: Escribe tu respuesta en texto completamente limpio, SIN asteriscos y SIN paréntesis alrededor de los precios o fechas.`,
        };
      }

      const productosTexto = resolvedProducts.length > 0
        ? ` y te aparté ${resolvedProducts.map((p) => `${p.nombre} por $${p.precio} MXN`).join(', ')}`
        : '';

      let templateConfirmacion = '';
      try {
        const whatsappCfgDoc = await db.collection('configuracion').doc('whatsapp').get();
        if (whatsappCfgDoc.exists) {
          templateConfirmacion = whatsappCfgDoc.data()?.whatsappMessageTemplate || '';
        }
      } catch (_) {}

      if (!templateConfirmacion) {
        templateConfirmacion = '¡Hola *{nombre}*, tu cita está confirmada! 🎉\n\n💈 *Servicio(s):* {servicios}\n📅 *Fecha:* {fecha}\n⏰ *Hora:* {hora}\n👤 *Profesional:* {profesional}\n📍 *Ubicación:* {ubicacion}\n\nAgradecemos tu puntualidad y asistencia.\nEn caso de llegar después y tener clientes en espera, la cita podrá reprogramarse según disponibilidad.\n\n¡Te esperamos 💈!\n\nvatosalfa.com';
      }

      let friendlyFecha = targetFecha;
      try {
        const [y, m, d] = targetFecha.split('-').map(Number);
        const dObj = new Date(y, m - 1, d);
        friendlyFecha = format(dObj, "EEEE, d 'de' MMMM, yyyy", { locale: es });
        friendlyFecha = friendlyFecha.charAt(0).toUpperCase() + friendlyFecha.slice(1);
      } catch (_) {}

      const serviciosConfirmados = finalServName + (productosTexto ? ` (+ ${resolvedProducts.map((p) => p.nombre).join(', ')})` : '');
      const mensajeConfirmacionFormateado = templateConfirmacion
        .replace(/{nombre}/g, firstName || 'Cliente')
        .replace(/{servicios}/g, serviciosConfirmados)
        .replace(/{fecha}/g, friendlyFecha)
        .replace(/{hora}/g, time12h)
        .replace(/{profesional}/g, finalBarberName)
        .replace(/{ubicacion}/g, 'VATOS ALFA Barber Shop (Av. Cerro Sombrerete 1001)');

      return {
        exito: true,
        citaId: reservationId,
        requiereAnticipo: false,
        montoTotal: anticipoCalc.montoTotal,
        montoAnticipo: 0,
        saldoPendiente: anticipoCalc.montoTotal,
        mensaje: '¡Cita confirmada y registrada en la agenda con éxito!',
        plantillaConfirmacion: mensajeConfirmacionFormateado,
        detalles: `Cita confirmada para ${friendlyFecha} a las ${time12h} con ${finalBarberName} para ${finalServName}${productosTexto}. Total: $${anticipoCalc.montoTotal} MXN a liquidar al terminar en sucursal.\n\nPLANTILLA OFICIAL DE CONFIRMACIÓN (Envía este formato al cliente):\n${mensajeConfirmacionFormateado}`,
      };
    } catch (e: any) {
      console.error('Error in crear_cita:', e);
      return { exito: false, mensaje: e.message || 'No se pudo crear la cita.' };
    }
  }
);

export const agregarProductoACitaTool = ai.defineTool(
  {
    name: 'agregar_producto_a_cita',
    description:
      'Agrega un producto físico (cera para peinar, aftershave, sérum, shampoo, polvo textura, etc.) a una cita ya existente del cliente. Actualiza los productos de la cita en la agenda (activando la insignia P), actualiza el total y recalcula el anticipo si aplica.',
    inputSchema: z.object({
      citaId: z.string().optional().describe('ID de la reserva si se conoce'),
      telefonoCliente: z.string().optional().describe('Teléfono del cliente para localizar su cita activa'),
      productoNombre: z.string().describe('Nombre del producto a agregar (ej: Cera para peinar, After shave, Polvo textura)'),
      productosNombres: z.array(z.string()).optional().describe('Lista opcional si son varios productos'),
      cantidad: z.number().int().min(1).max(100).optional().describe('Cantidad de piezas (por defecto 1)'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      citaId: z.string().optional(),
      montoTotalAnterior: z.number().optional(),
      montoTotalNuevo: z.number().optional(),
      productosAgregados: z.array(z.string()).optional(),
      requiereAnticipo: z.boolean().optional(),
      montoAnticipo: z.number().optional(),
      saldoPendiente: z.number().optional(),
      linkPago: z.string().optional(),
      mensaje: z.string(),
      detalles: z.string().optional(),
    }),
  },
  async ({ citaId, telefonoCliente, productoNombre, productosNombres, cantidad = 1 }) => {
    try {
      const db = getDb();
      const resDoc = await getClientReservation(citaId, telefonoCliente);
      const targetCitaId = resDoc.id;
      const resData = resDoc.data();
      const resolvedProducts = await resolveProducts(db, productosNombres, productoNombre);

      if (resolvedProducts.length === 0) {
        return {
          exito: false,
          mensaje: `No encontramos el producto "${productoNombre}" en el catálogo activo.`,
        };
      }

      const currentItems = Array.isArray(resData.items) ? [...resData.items] : [];
      let addedTotal = 0;
      const addedNames: string[] = [];

      for (const prod of resolvedProducts) {
        const qty = cantidad > 1 ? cantidad : (prod.cantidad || 1);
        const productSnapshot = await db.collection('productos').doc(prod.id).get();
        if (Number(productSnapshot.data()?.stock || 0) < qty) throw new Error(`No hay existencias suficientes de ${prod.nombre}.`);
        const itemTotal = prod.precio * qty;
        addedTotal += itemTotal;
        addedNames.push(`${prod.nombre} (x${qty})`);

        currentItems.push({
          id: prod.id,
          nombre: prod.nombre,
          precio: prod.precio,
          cantidad: qty,
          tipo: 'producto',
          barbero_id: resData.barbero_id || '',
        });
      }

      const prevTotal = Number(resData.total || 0);
      const newTotal = prevTotal + addedTotal;

      let requiereAnticipo = false;
      let montoAnticipo = Number(resData.anticipo_esperado || 0);
      let saldoPendiente = Math.max(0, newTotal - montoAnticipo);
      let linkPago = resData.link_pago_anticipo || '';

      const yaPagado = ['approved', 'accredited', 'paid', 'deposit_paid', 'pagado'].includes(cleanSearchStr(resData.pago_estado || '')) || resData.anticipo_pagado === true;

      if (!yaPagado) {
        const productsTotal = currentItems.filter(item => item.tipo === 'producto').reduce((sum, item) => sum + Number(item.precio || 0) * Number(item.cantidad || 1), 0);
        const services = currentItems.filter(item => item.tipo !== 'producto').map(item => ({ ...item, price: Number(item.precio || 0) }));
        const calculation = await calcularAnticipoParaServicios(services, productsTotal, resData.hora_inicio);
        montoAnticipo = Math.min(newTotal, Math.max(montoAnticipo, calculation.montoAnticipo));
        if (montoAnticipo > 0) {
          requiereAnticipo = true;
          saldoPendiente = Math.round((newTotal - montoAnticipo) * 100) / 100;

          const time12h = formatTime12h(resData.hora_inicio || '');
          const pref = await crearPreferenciaMercadoPagoChat({
            reservationId: targetCitaId!,
            title: `Cita + Productos: ${addedNames.join(', ')} (${resData.fecha} ${time12h})`,
            amount: montoAnticipo,
            clientName: resData.cliente_nombre || '',
            clientPhone: resData.cliente_telefono || '',
          });

          if (!pref?.initPoint) throw new Error('No se pudo generar el enlace de anticipo actualizado. El producto no fue agregado; solicita apoyo de recepción.');
          linkPago = pref.initPoint;
        }
      } else {
        const paidAmount = Number(resData.monto_pagado || resData.monto_pagado_real || (typeof resData.anticipo_pagado === 'number' ? resData.anticipo_pagado : 0) || montoAnticipo);
        saldoPendiente = Math.max(0, newTotal - paidAmount);
      }

      const updateData: any = {
        items: currentItems,
        total: newTotal,
        saldo_pendiente: saldoPendiente,
      };

      if (requiereAnticipo) {
        updateData.requiere_pago_anticipado = true;
        updateData.anticipo_esperado = montoAnticipo;
        if (!yaPagado) {
          updateData.estado = 'Pendiente de pago';
          updateData.pago_estado = 'pending_payment';
        }
        if (linkPago) {
          updateData.link_pago_anticipo = linkPago;
        }
      }

      await db.collection('reservas').doc(targetCitaId!).update(updateData);

      const time12h = formatTime12h(resData.hora_inicio || '');
      return {
        exito: true,
        citaId: targetCitaId,
        montoTotalAnterior: prevTotal,
        montoTotalNuevo: newTotal,
        productosAgregados: addedNames,
        requiereAnticipo,
        montoAnticipo: requiereAnticipo ? montoAnticipo : 0,
        saldoPendiente,
        linkPago,
        mensaje: `¡Producto agregado con éxito a tu cita! Se agregaron: ${addedNames.join(', ')}.`,
        detalles: `Se agregaron ${addedNames.join(', ')} a tu cita del ${resData.fecha} a las ${time12h}. Total actualizado: $${newTotal} MXN.${requiereAnticipo ? ` Según la configuración vigente se requiere un anticipo de $${montoAnticipo} MXN.\n\nEnlace de pago seguro de Mercado Pago:\n${linkPago}\n\nPídele al cliente en su propia línea que realice su anticipo y comparta su comprobante por este chat. IMPORTANTE: Escribe tu respuesta en texto completamente limpio, SIN asteriscos y SIN paréntesis alrededor de los precios o fechas.` : ` Saldo pendiente a liquidar en sucursal: $${saldoPendiente} MXN.`}`,
      };
    } catch (e: any) {
      console.error('Error in agregar_producto_a_cita:', e);
      return {
        exito: false,
        mensaje: e.message || 'No se pudo agregar el producto a la cita.',
      };
    }
  }
);

export const consultarCitasClienteTool = ai.defineTool(
  {
    name: 'consultar_citas_cliente',
    description: 'Consulta las citas futuras o programadas que tiene el cliente buscando por su numero de telefono.',
    inputSchema: z.object({
      telefono: z.string().describe('Numero de telefono del cliente'),
    }),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        fecha: z.string(),
        hora: z.string(),
        servicio: z.string(),
        barbero: z.string(),
        estado: z.string(),
      })
    ),
  },
  async ({ telefono }) => {
    try {
      const db = getDb();
      const reservations = await getClientReservations(telefono);

      const profsSnap = await db.collection('profesionales').get();
      const barberMap = new Map<string, string>();
      profsSnap.docs.forEach((d) => {
        barberMap.set(d.id, d.data().publicName || d.data().name || 'Barbero');
      });

      const filtered = reservations.map(d => ({ ...d.data(), id: d.id } as any))
        .map((r) => ({
          id: r.id,
          fecha: r.fecha,
          hora: r.hora_inicio,
          servicio: r.servicio || 'Corte de cabello',
          barbero: barberMap.get(r.barbero_id || r.profesionalId) || r.barbero_nombre || 'Barbero asignado',
          estado: r.estado || 'confirmada',
        }));

      return filtered;
    } catch (e: any) {
      console.error('Error in consultar_citas_cliente:', e);
      return [];
    }
  }
);

export const cancelarCitaTool = ai.defineTool(
  {
    name: 'cancelar_cita',
    description: 'Cancela una cita del cliente por su ID o cancela su próxima cita activa si no se tiene el ID.',
    inputSchema: z.object({
      citaId: z.string().optional().describe('ID de la reserva'),
      telefono: z.string().optional().describe('Teléfono del cliente para localizar la cita si no se tiene el ID'),
      motivo: z.string().optional().describe('Motivo de la cancelacion'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
    }),
  },
  async ({ citaId, telefono, motivo }) => {
    try {
      const db = getDb();
      const doc = await getClientReservation(citaId, telefono);
      const ref = doc.ref;
      await db.runTransaction(async transaction => {
        const fresh = await transaction.get(ref);
        const data = fresh.data();
        const initial = doc.data();
        const clientMatch = (!initial.cliente_id || data?.cliente_id === initial.cliente_id) &&
          (!initial.cliente_telefono || data?.cliente_telefono === initial.cliente_telefono);
        if (!data || !isUpcomingReservation(data) || !clientMatch || data.fecha !== initial.fecha || data.hora_inicio !== initial.hora_inicio) {
          throw new Error('La cita cambió o ya no está activa. Consulta nuevamente antes de cancelar.');
        }
        transaction.update(ref, {
          estado: 'Cancelado',
          cancelada_por_cliente: true,
          etiqueta_recordatorio: 'cancelada',
          motivo_cancelacion: motivo || 'Cancelada por cliente via Asistente Virtual Janet',
          cancelada_en: new Date(),
          updated_at: new Date(),
        });
      });

      return { exito: true, mensaje: 'Tu cita ha sido cancelada correctamente en la agenda.' };
    } catch (e: any) {
      console.error('Error in cancelar_cita:', e);
      return { exito: false, mensaje: e.message || 'Error al cancelar la cita.' };
    }
  }
);

export const confirmarCitaClienteTool = ai.defineTool(
  {
    name: 'confirmar_cita_cliente',
    description:
      'Confirma la cita próxima o activa del cliente en la agenda de la barbería. Utilízala cuando el cliente responda con "Confirmar", "Confirmo", "1", "Sí asisto", "Ahí estaré" o cualquier confirmación similar ante un recordatorio de cita.',
    inputSchema: z.object({
      telefono: z.string().describe('Número de teléfono del cliente'),
      citaId: z.string().optional().describe('ID opcional de la reserva si se conoce'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      citaId: z.string().optional(),
      fecha: z.string().optional(),
      hora: z.string().optional(),
      barbero: z.string().optional(),
      servicio: z.string().optional(),
      mensaje: z.string(),
    }),
  },
  async ({ telefono, citaId }) => {
    try {
      const db = getDb();
      const reservation = await getClientReservation(citaId, telefono);
      const targetId = reservation.id;
      const targetData = reservation.data();
      if (hasPendingDeposit(targetData)) return { exito: false, mensaje: 'La cita sigue pendiente de validar el anticipo. Confirmar asistencia no confirma el pago. Recepción puede revisar el comprobante.' };
      const now = new Date();
      await db.runTransaction(async transaction => {
        const fresh = await transaction.get(reservation.ref);
        const current = fresh.data();
        if (!current || !isUpcomingReservation(current) || hasPendingDeposit(current) || current.fecha !== targetData.fecha || current.hora_inicio !== targetData.hora_inicio || current.cliente_telefono !== targetData.cliente_telefono || current.cliente_id !== targetData.cliente_id) throw new Error('La cita cambió o tiene un anticipo pendiente. Consulta sus datos nuevamente.');
        transaction.update(reservation.ref, {
          estado: current.estado || 'Reservado',
          confirmada_por_cliente: true,
          confirmada_en: now,
          etiqueta_recordatorio: 'confirmada',
          whatsappConfirmationSent: true,
          updated_at: now,
          notas: (current.notas ? current.notas + ' | ' : '') + 'Confirmada por cliente vía Asistente Virtual Janet',
        });
      });

      let barberName = targetData.professionalNames || targetData.barbero_nombre || '';
      if (!barberName && targetData.barbero_id) {
        try {
          const bDoc = await db.collection('profesionales').doc(targetData.barbero_id).get();
          if (bDoc.exists) {
            barberName = bDoc.data()?.publicName || bDoc.data()?.name || '';
          }
        } catch (_) {}
      }

      const formattedTime = formatTime12h(targetData.hora_inicio);

      return {
        exito: true,
        citaId: targetId,
        fecha: targetData.fecha,
        hora: formattedTime,
        barbero: barberName || 'tu barbero',
        servicio: targetData.servicio || 'tu servicio',
        mensaje: `¡Excelente! Tu cita para el ${targetData.fecha} a las ${formattedTime} con ${barberName || 'tu barbero'} para ${targetData.servicio || 'tu servicio'} ha quedado 100% confirmada. ¡Te esperamos en VATOS ALFA!`,
      };
    } catch (e: any) {
      console.error('Error in confirmar_cita_cliente:', e);
      return { exito: false, mensaje: e.message || 'Error al confirmar la cita.' };
    }
  }
);

export const anotarListaEsperaTool = ai.defineTool(
  {
    name: 'anotar_en_lista_espera',
    description:
      'Anota a un cliente en la lista de espera oficial de la barbería cuando un día u horario solicitado esté completamente lleno o saturado, para avisarle si se libera un espacio por cancelación.',
    inputSchema: z.object({
      nombreCliente: z.string().describe('Nombre del cliente'),
      telefonoCliente: z.string().describe('Teléfono del cliente'),
      fecha: z.string().describe('Fecha deseada en formato AAAA-MM-DD'),
      horarioPreferido: z.string().describe('Momento o rango preferido (ej: "por la tarde", "alrededor de las 5:00 PM", "cualquier hora")'),
      barberoNombre: z.string().optional().describe('Barbero de preferencia si solicitó uno específico'),
      servicioNombre: z.string().optional().describe('Servicio o servicios que desea'),
      notas: z.string().optional().describe('Detalles o peticiones adicionales'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
      idRegistro: z.string().optional(),
    }),
  },
  async ({ nombreCliente, telefonoCliente, fecha, horarioPreferido, barberoNombre, servicioNombre, notas }) => {
    try {
      assertLiveAgentMutation();
      const db = getDb();
      const docRef = await db.collection('lista_espera').add({
        nombre: nombreCliente,
        telefono: telefonoCliente,
        fecha,
        horario_preferido: horarioPreferido,
        barbero_preferido: barberoNombre || 'Cualquiera',
        servicio: servicioNombre || 'Corte de cabello',
        notas: notas || '',
        estado: 'pendiente',
        creado_en: new Date(),
        origen: 'asistente_virtual_janet',
      });

      return {
        exito: true,
        idRegistro: docRef.id,
        mensaje: `Te he anotado en nuestra lista de espera para el ${fecha} (${horarioPreferido})${barberoNombre ? ` con ${barberoNombre}` : ''}. Si algún cliente cancela o se abre un lugar, te avisaremos de inmediato por este mismo chat.`,
      };
    } catch (e: any) {
      console.error('Error in anotar_en_lista_espera:', e);
      return { exito: false, mensaje: e.message || 'No se pudo anotar en la lista de espera.' };
    }
  }
);

export const reagendarCitaTool = ai.defineTool(
  {
    name: 'reagendar_cita',
    description: 'Reagenda o cambia la fecha y hora de una cita existente de un cliente.',
    inputSchema: z.object({
      citaId: z.string().describe('ID de la reserva existente a reagendar'),
      nuevaFecha: z.string().describe('Nueva fecha en formato AAAA-MM-DD'),
      nuevaHora: z.string().describe('Nueva hora en formato HH:mm (ejemplo 16:30)'),
      profesionalId: z.string().optional().describe('ID opcional del barbero si desea cambiar de profesional'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
    }),
  },
  async ({ citaId, nuevaFecha, nuevaHora, profesionalId }) => {
    try {
      const db = getDb();
      await validateAgentBooking(nuevaFecha, nuevaHora);
      const reservation = await getClientReservation(citaId);
      const ref = reservation.ref;
      const data = reservation.data();
      const originalProf = data.barbero_id || data.profesionalId;
      const finalProf = profesionalId || originalProf;
      const items: any[] = data.items || [];
      if (items.some(item => item.barbero_id && item.barbero_id !== originalProf)) throw new Error('Esta cita incluye varios profesionales. Recepción debe coordinar el cambio.');
      if (finalProf !== originalProf) throw new Error('Para cambiar de profesional en una cita existente, solicita apoyo de recepción para recalcular duración y servicios.');
      const minutes = (time: string) => Number(time.split(':')[0]) * 60 + Number(time.split(':')[1]);
      const duration = minutes(data.hora_fin || '') - minutes(data.hora_inicio || '');
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('No se pudo determinar la duración de la cita. Solicita apoyo de recepción.');
      if (data.fecha === nuevaFecha && data.hora_inicio === nuevaHora) return { exito: true, mensaje: 'La cita ya está registrada en ese horario.' };
      const slots = await getAvailableSlots({ date: nuevaFecha, professionalId: finalProf, durationMinutes: duration });
      if (!('slots' in slots) || !slots.slots?.includes(nuevaHora)) throw new Error('Ese horario no está disponible para la duración completa de la cita. Consulta otro horario.');
      const end = minutes(nuevaHora) + duration;
      const endTime = `${Math.floor(end / 60).toString().padStart(2, '0')}:${(end % 60).toString().padStart(2, '0')}`;
      await db.runTransaction(async transaction => {
        const fresh = await transaction.get(ref);
        const current = fresh.data();
        const sameDay = await transaction.get(db.collection('reservas').where('fecha', '==', nuevaFecha));
        if (!current || !isUpcomingReservation(current) || current.fecha !== data.fecha || current.hora_inicio !== data.hora_inicio || current.hora_fin !== data.hora_fin || current.barbero_id !== data.barbero_id || current.cliente_id !== data.cliente_id || current.cliente_telefono !== data.cliente_telefono) throw new Error('La cita cambió durante la operación. Consulta sus datos nuevamente.');
        const conflict = sameDay.docs.some(doc => {
          const other = doc.data();
          if (doc.id === citaId || /cancelad|no asiste/i.test(other.estado || '')) return false;
          const sameBarber = other.barbero_id === finalProf || other.profesionalId === finalProf || other.items?.some((item: any) => item.barbero_id === finalProf);
          return sameBarber && nuevaHora < other.hora_fin && endTime > other.hora_inicio;
        });
        if (conflict) throw new Error('El horario acaba de ocuparse. Consulta otra opción.');
        transaction.update(ref, {
          fecha: nuevaFecha,
          hora_inicio: nuevaHora,
          hora_fin: endTime,
          barbero_id: finalProf,
          profesionalId: finalProf,
          confirmada_por_cliente: false,
          whatsappConfirmationSent: false,
          etiqueta_recordatorio: 'reagendada',
          updated_at: new Date(),
          notas: (current.notas || '') + ` | Reagendada a ${nuevaFecha} ${nuevaHora} por Asistente Virtual Janet`,
        });
      });

      return {
        exito: true,
        mensaje: `¡Cita reagendada con éxito para el ${nuevaFecha} a las ${nuevaHora}!`,
      };
    } catch (e: any) {
      console.error('Error in reagendar_cita:', e);
      return { exito: false, mensaje: e.message || 'Error al reagendar la cita.' };
    }
  }
);

export const solicitarRecepcionTool = ai.defineTool(
  {
    name: 'solicitar_recepcion',
    description: 'ÚNICAMENTE se usa cuando el cliente pide explícitamente hablar con una persona humana o recepcionista presencial (ej: "pásame a un humano", "quiero hablar con una persona", "comunícame con el encargado"). NUNCA la uses para preguntas de ubicación, dirección, cómo llegar, precios, servicios, horarios o citas.',
    inputSchema: z.object({
      conversationId: z.string().describe('ID de la conversacion'),
      motivo: z.string().describe('Motivo o duda por la cual requiere atencion humana'),
    }),
    outputSchema: z.object({
      exito: z.boolean(),
      mensaje: z.string(),
    }),
  },
  async ({ motivo }) => {
    try {
      const db = getDb();
      const context = chatContextStorage.getStore();
      const trustedId = context?.conversationId;
      if (context) context.humanHandoffRequested = true;
      if (!trustedId) throw new Error('Falta el contexto de la conversación.');
      await db.collection('conversaciones').doc(trustedId).set(
        {
          modo_atencion: 'requiere_atencion',
          requiere_atencion_humana: true,
          motivo_atencion_humana: motivo,
          mensajes_no_leidos: FieldValue.increment(1),
          updated_at: new Date(),
        },
        { merge: true }
      );

      return {
        exito: true,
        mensaje: 'He avisado a nuestro equipo de recepción. En breve un recepcionista continuará la conversación contigo.',
      };
    } catch (e: any) {
      console.error('Error in solicitar_recepcion:', e);
      return { exito: false, mensaje: e.message };
    }
  }
);

export function getAgentTools({ userPickingSlot }: { userPickingSlot?: boolean } = {}) {
  return [
    verificarORegistrarClienteTool,
    consultarUbicacionTool,
    consultarServiciosTool,
    consultarBarberosTool,
    consultarDisponibilidadTool,
    ...(userPickingSlot ? [] : [crearCitaTool]),
    agregarProductoACitaTool,
    reagendarCitaTool,
    consultarCitasClienteTool,
    cancelarCitaTool,
    solicitarRecepcionTool,
    consultarProductosTool,
    confirmarCitaClienteTool,
    anotarListaEsperaTool,
    consultarPoliticasYTerminosTool,
    consultarPaseAlfaYPromocionesTool,
  ];
}

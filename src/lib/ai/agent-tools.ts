import { getDb } from '@/lib/firebase-server';
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

export const consultarServiciosTool = ai.defineTool(
  {
    name: 'consultar_servicios',
    description:
      'Obtiene el catálogo de servicios activos de VATOS ALFA con sus IDs, nombres, duración base en minutos, duración específica por cada barbero/experto (ej. Beatriz 30 min, Lalo 60 min, Ivon 40 min), precio en pesos mexicanos y si requiere anticipo.',
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
        duracion: z.number(),
        duracionPorBarbero: z.record(z.string(), z.number()).optional(),
        duracionesDetalle: z.string().optional(),
        barberosHabilitados: z.array(z.string()).optional(),
        precio: z.number(),
        requiereAnticipo: z.boolean(),
        montoAnticipo: z.number(),
        politicaAnticipo: z.string(),
      })
    ),
  },
  async () => {
    try {
      const db = getDb();
      const [servsSnap, profsSnap] = await Promise.all([
        db.collection('servicios').where('active', '==', true).get(),
        db.collection('profesionales').where('active', '==', true).get(),
      ]);

      const profMap: Record<string, string> = {};
      profsSnap.docs.forEach((d) => {
        const pData = d.data();
        profMap[d.id] = pData.publicName || pData.name || 'Barbero';
      });

      let globalMin = 190;
      let globalPct = 50;
      let globalActive = true;
      try {
        const cfgDoc = await db.collection('configuracion').doc('servicios').get();
        if (cfgDoc.exists) {
          const cfg = cfgDoc.data()!;
          if (typeof cfg.anticipo_monto_minimo_activo === 'boolean') globalActive = cfg.anticipo_monto_minimo_activo;
          if (Number(cfg.anticipo_monto_minimo) > 0) globalMin = Number(cfg.anticipo_monto_minimo);
          if (Number(cfg.anticipo_porcentaje_defecto) > 0) globalPct = Number(cfg.anticipo_porcentaje_defecto);
        }
      } catch (_) {}

      return servsSnap.docs.map((doc) => {
        const d = doc.data();
        const price = Number(d.price || d.precio || 0);
        const reqDirect = Boolean(d.requiere_anticipo || d.payment_type === 'online-deposit');
        const reqThreshold = globalActive && price >= globalMin;
        const req = reqDirect || reqThreshold;
        let depositAmount = 0;
        if (reqDirect) {
          const amtType = d.payment_amount_type || d.tipo_anticipo || '%';
          const amtVal = Number(d.payment_amount_value || d.monto_anticipo || 50);
          depositAmount = amtType === '$' ? amtVal : price * (amtVal / 100);
        } else if (reqThreshold) {
          depositAmount = price * (globalPct / 100);
        }

        const customDurations: Record<string, number> = {};
        const detailsArr: string[] = [];
        if (d.durationPorProfesional && typeof d.durationPorProfesional === 'object') {
          for (const [profId, dur] of Object.entries(d.durationPorProfesional)) {
            const barberName = profMap[profId];
            if (barberName && dur !== undefined && dur !== null && dur !== '') {
              const durNum = Number(dur);
              if (!isNaN(durNum) && durNum > 0) {
                customDurations[barberName] = durNum;
                detailsArr.push(`${barberName}: ${durNum} min`);
              }
            }
          }
        }

        const barberosHabilitados: string[] = [];
        if (Array.isArray(d.professionals) && d.professionals.length > 0) {
          d.professionals.forEach((pId: string) => {
            if (profMap[pId]) barberosHabilitados.push(profMap[pId]);
          });
        }

        return {
          id: doc.id,
          nombre: d.name || d.nombre || 'Servicio',
          duracion: Number(d.duration || d.duracion || 30),
          duracionPorBarbero: Object.keys(customDurations).length > 0 ? customDurations : undefined,
          duracionesDetalle: detailsArr.length > 0 ? detailsArr.join(' | ') : undefined,
          barberosHabilitados: barberosHabilitados.length > 0 ? barberosHabilitados : undefined,
          precio: price,
          requiereAnticipo: req,
          montoAnticipo: Math.round(depositAmount),
          politicaAnticipo: req
            ? `Requiere anticipo de $${Math.round(depositAmount)} MXN (${reqDirect ? 'configurado en el servicio' : `50% por superar $${globalMin} MXN`})`
            : `Sin anticipo individual (aplica 50% de anticipo si se combina con otros servicios sumando $${globalMin}+ MXN)`,
        };
      });
    } catch (e: any) {
      console.error('Error in consultar_servicios:', e);
      return [];
    }
  }
);

export const consultarBarberosTool = ai.defineTool(
  {
    name: 'consultar_barberos',
    description: 'Obtiene la lista de barberos/profesionales activos en la barberia con sus IDs y nombres.',
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
      })
    ),
  },
  async () => {
    try {
      const db = getDb();
      const snap = await db.collection('profesionales').where('active', '==', true).get();
      return snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          nombre: d.publicName || d.name || 'Barbero',
        };
      });
    } catch (e: any) {
      console.error('Error in consultar_barberos:', e);
      return [];
    }
  }
);

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
  async ({ fecha, profesionalId, barberoNombre, servicioNombre, serviciosNombres, duracionMinutos, diasABuscar, clienteTelefono, clienteNombre }) => {
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
        } catch (noteErr) {
          // ignore
        }
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
      const barbers = profsSnap.docs.map((d) => ({
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
            // Verificar si el cliente tiene duración personalizada en sus notas para este barbero
            let customClientDuration: number | null = null;
            if (resolvedNotes) {
              customClientDuration = parseClientCustomDuration(resolvedNotes, b.publicName || b.name);
            }

            // Calcular la duración específica para ESTE barbero
            const baseDuration = selectedServices.reduce((total, service) => total +
              (customClientDuration && /corte/i.test(service.name || service.nombre || '') ? customClientDuration : getBarberServiceDuration([service], b.id, 30)), 0);
            const barberDuration = Math.max(baseDuration, duracionMinutos || 0);

            const res = await getAvailableSlots({
              date: curDate,
              professionalId: b.id,
              durationMinutes: barberDuration,
              minReservationBufferMinutes: config.minReservationBuffer ?? 30,
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
        // Encontrar las fechas que tienen al menos un espacio libre
        const diasConDisponibilidad = Array.from(new Set(results.map((r) => r.fecha)));
        const primerDiaFecha = diasConDisponibilidad[0];
        const resultadosPrimerDia = results.filter((r) => r.fecha === primerDiaFecha);

        // Reunir y ordenar cronológicamente los slots del primer día
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

        // Agrupar barberos por hora para opciones claras y limpias (ej. 10:00 AM con Lupita o Alfredo)
        const horasMap = new Map<string, string[]>();
        for (const s of slotsPrimerDia) {
          if (!horasMap.has(s.hora12)) {
            horasMap.set(s.hora12, []);
          }
          if (!horasMap.get(s.hora12)!.includes(s.barberoNombre)) {
            horasMap.get(s.hora12)!.push(s.barberoNombre);
          }
        }

        const primerasHoras = Array.from(horasMap.entries()).slice(0, 3);
        opcionesMasProximas = primerasHoras.map(([hora12, barberos]) => {
          return `${hora12} con ${barberos.join(' o ')}`;
        });

        const diaSemanaLabel = resultadosPrimerDia[0].diaSemana;
        diaMasProximo = `${diaSemanaLabel} (${primerDiaFecha})`;

        resumenTexto = `HORARIO MÁS PRÓXIMO DISPONIBLE:\n` +
          `- Día más cercano con citas: ${diaSemanaLabel} (${primerDiaFecha})\n` +
          `- Opciones más próximas: ${opcionesMasProximas.join(', ')}\n\n` +
          `INSTRUCCIÓN OBLIGATORIA PARA SOFÍA: Ofrece únicamente estas 2 o 3 opciones del ${diaSemanaLabel}. NUNCA envíes listas largas ni menciones los otros días posteriores (${diasConDisponibilidad.slice(1).join(', ') || 'ninguno más'}). Responde de forma muy concisa, humana y conversacional (máximo 2 a 3 oraciones).\n\n` +
          `Referencia adicional (solo por si el cliente pide otra fecha):\n` +
          results
            .map((r) => {
              const sample12h = r.horarios.slice(0, 3).map((h) => formatTime12h(h)).join(', ');
              return `${r.diaSemana} con ${r.barberoNombre}: ${sample12h}`;
            })
            .join('\n');
      }

      return {
        diaMasProximo,
        opcionesMasProximas,
        disponibilidadPorFecha: results,
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

export async function resolveProducts(
  db: any,
  productNames?: string[],
  singleProductName?: string
): Promise<Array<{ id: string; nombre: string; precio: number; cantidad: number }>> {
  const namesToFind: string[] = [];
  if (singleProductName && singleProductName.trim()) {
    namesToFind.push(singleProductName.trim());
  }
  if (Array.isArray(productNames)) {
    productNames.forEach((n) => {
      if (n && n.trim()) namesToFind.push(n.trim());
    });
  }

  if (namesToFind.length === 0) return [];

  const snap = await db.collection('productos').where('active', '==', true).get();
  const allProducts = snap.docs.map((d: any) => {
    const data = d.data();
    return {
      id: d.id,
      nombre: data.nombre || '',
      precio: Number(data.public_price || data.precio_venta || data.precio || 0),
      stock: Number(data.stock || 0),
    };
  });

  const resolved: Array<{ id: string; nombre: string; precio: number; cantidad: number }> = [];

  for (const query of namesToFind) {
    const qClean = cleanSearchStr(query);
    let match = allProducts.find((p: any) => {
      const nClean = cleanSearchStr(p.nombre);
      return nClean.includes(qClean) || qClean.includes(nClean);
    });

    if (!match) {
      const words = qClean.split(/\s+/).filter((w: string) => w.length > 2 && !['una', 'uno', 'para', 'con', 'por', 'las', 'los', 'del'].includes(w));
      if (words.length > 0) {
        match = allProducts.find((p: any) => {
          const nClean = cleanSearchStr(p.nombre);
          return words.some((w: string) => nClean.includes(w));
        });
      }
    }

    if (!match) throw new Error(`No se encontró el producto ${query}. Confirma el nombre antes de continuar.`);
    if (match) {
      const requestedQuantity = (resolved.find(item => item.id === match.id)?.cantidad || 0) + 1;
      if (match.stock < requestedQuantity) throw new Error(`No hay existencias suficientes de ${match.nombre}.`);
      const existing = resolved.find((r) => r.id === match.id);
      if (existing) {
        existing.cantidad += 1;
      } else {
        resolved.push({
          id: match.id,
          nombre: match.nombre,
          precio: match.precio,
          cantidad: 1,
        });
      }
    }
  }

  return resolved;
}

export const crearCitaTool = ai.defineTool(
  {
    name: 'crear_cita',
    description:
      'Registra una cita con los servicios, profesional, fecha y hora explícitamente aceptados por el cliente. No usar ante una consulta de información. Devuelve si queda pendiente de anticipo.',
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
      telefonoCliente: z.string().describe('Teléfono del cliente. USA EL TELÉFONO DE LA CONVERSACIÓN DIRECTAMENTE SIN PEDÍRSELO. Solo pídelo si agenda para otra persona.'),
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
  async ({ fecha, hora, profesionalId, barberoNombre, servicioIds, servicioNombre, serviciosNombres, productoNombre, productosNombres, nombreCliente, telefonoCliente, notas, duracionMinutos }) => {
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
      const barbers = profsSnap.docs.map((d) => ({
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

      if (!finalProfId || !barbers.some(b => b.id === finalProfId)) throw new Error('El profesional no está disponible.');
      finalBarberName = barbers.find(b => b.id === finalProfId)!.publicName;

      if (!servicioIds?.length && !serviciosNombres?.length && !servicioNombre) throw new Error('Confirma los servicios antes de crear la cita.');
      // Resolver servicios con soporte para múltiples servicios
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

      // Resolver notas del cliente para duraciones personalizadas
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
        } catch (noteErr) {
          // ignore
        }
      }

      let customClientDuration: number | null = null;
      if (resolvedClientNotes && finalBarberName) {
        customClientDuration = parseClientCustomDuration(resolvedClientNotes, finalBarberName);
      }
      const baseDuration = selectedServices.reduce((total, service) => total +
        (customClientDuration && /corte/i.test(service.name || service.nombre || '') ? customClientDuration : getBarberServiceDuration([service], finalProfId!, 30)), 0);
      const finalDuration = Math.max(baseDuration, duracionMinutos || 0);

      // El motor compartido aplica duration al primer corte, no al bloque completo.
      const overrideIndex = selectedServices.findIndex(service => selectedServices.length === 1 || /corte/i.test(service.name || service.nombre || ''));
      const normalTotal = getBarberServiceDuration(selectedServices, finalProfId!, 30);
      const bookingDuration = overrideIndex >= 0
        ? finalDuration - (normalTotal - getBarberServiceDuration([selectedServices[overrideIndex]], finalProfId!, 30))
        : undefined;
      if (overrideIndex < 0 && finalDuration !== normalTotal) throw new Error('La duración especial de esta combinación requiere revisión de recepción.');

      // Resolver productos físicos opcionales
      const resolvedProducts = await resolveProducts(db, productosNombres, productoNombre);
      const extraProductsAmount = resolvedProducts.reduce((sum, p) => sum + (p.precio * (p.cantidad || 1)), 0);

      // Calcular anticipo con servicios + productos
      const anticipoCalc = await calcularAnticipoParaServicios(selectedServices, extraProductsAmount);

      const nameParts = (nombreCliente || 'Cliente').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || 'Alfa';

      const productsSummary = resolvedProducts.map((p) => `${p.nombre} (x${p.cantidad})`).join(', ');
      const extraNotes = [
        notas ? notas : '',
        productsSummary ? `Productos apartados: ${productsSummary}` : '',
        anticipoCalc.requiereAnticipo ? `Requiere anticipo: $${anticipoCalc.montoAnticipo}` : 'Agendado por Asistente Virtual Sofía',
      ].filter(Boolean).join(' | ');

      const res = await createPublicReservation({
        client: {
          name: firstName,
          lastName: lastName,
          phone: telefonoCliente,
        },
        serviceIds: finalServIds,
        professionalId: finalProfId!,
        date: targetFecha,
        time: normalizedTime,
        duration: bookingDuration,
        customDuration: bookingDuration,
        notes: extraNotes,
        origin: 'chatbot',
        canal_reserva: 'chatbot',
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
          });
          const validSlots = (slotsRes as any).slots || [];
          if (validSlots.length > 0) {
            const formatted = validSlots.map((s: string) => formatTime12h(s)).join(', ');
            alternativeSlotsText = ` Horarios disponibles reales donde sí cabe la duración completa (${finalServName} - ${barberDuration} min) con ${finalBarberName} para esa fecha: ${formatted}.`;
          }
        } catch (e) {
          // ignore
        }

        return {
          exito: false,
          mensaje: `No fue posible registrar la cita: ${res.error}.${alternativeSlotsText} Explica el motivo real y confirma otra opción con el cliente.`,
        };
      }

      const reservationId = (res as any).reservationId || (res as any).id;

      // Si requiere anticipo, generar preferencia de Mercado Pago y asociar enlace
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

        // Guardar link de pago en la reserva
        if (linkPago) {
          await db.collection('reservas').doc(reservationId).set(
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

      return {
        exito: true,
        citaId: reservationId,
        requiereAnticipo: false,
        montoTotal: anticipoCalc.montoTotal,
        montoAnticipo: 0,
        saldoPendiente: anticipoCalc.montoTotal,
        mensaje: '¡Cita confirmada y registrada en la agenda con éxito!',
        detalles: `Cita confirmada para ${targetFecha} a las ${time12h} con ${finalBarberName} para ${finalServName}${productosTexto}. Total: $${anticipoCalc.montoTotal} MXN a liquidar al terminar en sucursal.`,
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
        const calculation = await calcularAnticipoParaServicios(services, productsTotal);
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

      // Mapear nombres de barberos
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
        if (!data || !isUpcomingReservation(data) || data.cliente_id !== doc.data().cliente_id || data.cliente_telefono !== doc.data().cliente_telefono || data.fecha !== doc.data().fecha || data.hora_inicio !== doc.data().hora_inicio) throw new Error('La cita cambió. Consulta nuevamente antes de cancelar.');
        transaction.update(ref, {
        estado: 'Cancelado',
        cancelada_por_cliente: true,
        etiqueta_recordatorio: 'cancelada',
        motivo_cancelacion: motivo || 'Cancelada por cliente via Asistente Virtual Sofía',
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
        notas: (current.notas ? current.notas + ' | ' : '') + 'Confirmada por cliente vía WhatsApp',
      });
      });

      let barberName = targetData.professionalNames || targetData.barbero_nombre || '';
      if (!barberName && targetData.barbero_id) {
        try {
          const bDoc = await db.collection('profesionales').doc(targetData.barbero_id).get();
          if (bDoc.exists) {
            barberName = bDoc.data()?.publicName || bDoc.data()?.name || '';
          }
        } catch (e) {}
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

export const consultarProductosTool = ai.defineTool(
  {
    name: 'consultar_productos',
    description:
      'Consulta el catálogo de productos físicos a la venta en VATOS ALFA Barber Shop (ceras, pomadas, aftershave, shampoo, aceites para barba, minoxidil, etc.) con sus precios, descripciones y existencias (stock).',
    inputSchema: z.object({
      termino: z
        .string()
        .optional()
        .describe('Término de búsqueda o nombre del producto (ej: cera, pomada, minoxidil, aftershave, shampoo, barba). Déjalo vacío para ver los productos principales.'),
    }),
    outputSchema: z.object({
      totalEncontrados: z.number(),
      productos: z.array(
        z.object({
          id: z.string(),
          nombre: z.string(),
          precio: z.number(),
          stock: z.number(),
          disponible: z.boolean(),
          descripcion: z.string(),
        })
      ),
      resumenTexto: z.string(),
    }),
  },
  async ({ termino }) => {
    try {
      const db = getDb();
      const snap = await db.collection('productos').where('active', '==', true).get();
      let allProducts = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nombre: data.nombre || '',
          precio: Number(data.public_price || data.precio_venta || data.precio || 0),
          stock: Number(data.stock || 0),
          disponible: Number(data.stock || 0) > 0,
          descripcion: data.description || data.descripcion || '',
        };
      });

      if (termino && termino.trim()) {
        const qClean = cleanSearchStr(termino);
        const filtered = allProducts.filter((p) => {
          const nClean = cleanSearchStr(p.nombre);
          const dClean = cleanSearchStr(p.descripcion);
          return nClean.includes(qClean) || dClean.includes(qClean);
        });
        if (filtered.length > 0) {
          allProducts = filtered;
        }
      }

      const topProducts = allProducts.slice(0, 6);
      const resumenTexto = topProducts
        .map((p) => `• ${p.nombre}: $${p.precio} MXN (${p.disponible ? `disponible, quedan ${p.stock} piezas` : 'agotado temporalmente'}) - ${p.descripcion.slice(0, 90)}...`)
        .join('\n');

      return {
        totalEncontrados: topProducts.length,
        productos: topProducts,
        resumenTexto: resumenTexto || 'No se encontraron productos en el catálogo con ese término.',
      };
    } catch (e: any) {
      console.error('Error in consultar_productos:', e);
      return {
        totalEncontrados: 0,
        productos: [],
        resumenTexto: 'No se pudo consultar el catálogo de productos en este momento.',
      };
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
        origen: 'asistente_sofia',
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
          notas: (current.notas || '') + ` | Reagendada a ${nuevaFecha} ${nuevaHora} por Asistente Virtual Sofía`,
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

export const consultarUbicacionTool = ai.defineTool(
  {
    name: 'consultar_ubicacion',
    description: 'Obtiene la dirección física exacta, referencias para llegar, teléfono y horarios de apertura de la barbería VATOS ALFA.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      nombre: z.string(),
      direccion: z.string(),
      ciudad: z.string(),
      referencias: z.string(),
      telefono: z.string(),
      horarios: z.string(),
      mapsGoogle: z.string(),
    }),
  },
  async () => {
    try {
      const db = getDb();
      const snap = await db.collection('locales').limit(1).get();
      if (!snap.empty) {
        const data = snap.docs[0].data();
        return {
          nombre: data.name || 'VATOS ALFA Barber Shop',
          direccion: data.address || 'Av. Cerro Sombrerete 1001, Col. Cipreses',
          ciudad: 'Santiago de Querétaro, Qro., México',
          referencias: 'Sobre Av. Cerro Sombrerete, Col. Cipreses. Contamos con cajones de estacionamiento al frente.',
          telefono: data.phone || '4428727279',
          horarios: 'Lunes a Sábado de 10:00 AM a 9:00 PM, Domingos de 10:00 AM a 8:00 PM',
          mapsGoogle: 'https://maps.google.com/?q=Av+Cerro+Sombrerete+1001+Cipreses+Queretaro',
        };
      }
    } catch (e) {
      // fallback
    }

    return {
      nombre: 'VATOS ALFA Barber Shop',
      direccion: 'Av. Cerro Sombrerete 1001, Col. Cipreses',
      ciudad: 'Santiago de Querétaro, Qro., México',
      referencias: 'Sobre Av. Cerro Sombrerete (zona Cipreses). Contamos con estacionamiento al frente.',
      telefono: '4428727279',
      horarios: 'Lunes a Sábado de 10:00 AM a 9:00 PM, Domingos de 10:00 AM a 8:00 PM',
      mapsGoogle: 'https://maps.google.com/?q=Av+Cerro+Sombrerete+1001+Cipreses+Queretaro',
    };
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
  async ({ conversationId, motivo }) => {
    try {
      const db = getDb();
      const context = chatContextStorage.getStore();
      const trustedId = context?.conversationId;
      if (context) context.humanHandoffRequested = true;
      if (!trustedId) throw new Error('Falta el contexto de la conversación.');
      await db.collection('conversaciones').doc(trustedId).set(
        {
          modo_atencion: 'humano_al_mando',
          motivo_atencion_humana: motivo,
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

export const consultarPoliticasYTerminosTool = ai.defineTool(
  {
    name: 'consultar_terminos_y_privacidad',
    description:
      'Consulta los Términos y Condiciones oficiales de servicio, políticas de puntualidad, anticipos, cancelaciones y reembolsos, y el Aviso de Privacidad integral de VATOS ALFA Barber Shop. Devuelve los resúmenes y los enlaces web oficiales para compartir con el cliente.',
    inputSchema: z.object({
      tema: z
        .enum(['terminos', 'privacidad', 'cancelaciones_y_anticipos', 'ambos'])
        .optional()
        .describe('Tema a consultar: "terminos" para reglas de citas y servicio, "privacidad" para manejo y protección de datos personales, "cancelaciones_y_anticipos" para reglas de anticipo/reembolso, o "ambos".'),
    }),
    outputSchema: z.object({
      urlTerminos: z.string(),
      urlPrivacidad: z.string(),
      resumenTerminos: z.string(),
      resumenPrivacidad: z.string(),
      politicaCancelacionYAnticipos: z.string(),
      textoDetallado: z.string().optional(),
    }),
  },
  async ({ tema = 'ambos' }) => {
    try {
      const db = getDb();
      let customTerms = '';
      let customPrivacy = '';

      try {
        const settingsDoc = await db.collection('settings').doc('website').get();
        if (settingsDoc.exists) {
          const data = settingsDoc.data()!;
          if (data.termsText) customTerms = data.termsText.trim();
          if (data.privacyText) customPrivacy = data.privacyText.trim();
        }
      } catch (err) {
        console.error('Error reading website settings for terms/privacy:', err);
      }

      const urlTerminos = 'https://vatosalfa.com/terminos';
      const urlPrivacidad = 'https://vatosalfa.com/privacidad';

      const resumenTerminos =
        '1. Tolerancia máxima de 10 minutos para iniciar la cita. Tras 10 min sin presencia ni aviso previo, se marca como "No Show" y se libera el espacio.\n' +
        '2. Anticipos de garantía: Aplican para citas iguales o mayores a $190 MXN (o servicios específicos). Se abonan en línea por Mercado Pago o transferencia y se descuentan del total en recepción.\n' +
        '3. Cancelaciones y Reagendaciones: Si se notifica con al menos 2 horas de anticipación, el 100% del anticipo se guarda como saldo a favor válido por 30 días. Cancelaciones con menos de 2 horas o No-Show causan la pérdida del anticipo.\n' +
        '4. Si la barbería debe cancelar por causas de fuerza mayor, el cliente recibe reagendación prioritaria o el reembolso del 100% de su anticipo.\n' +
        '5. Derecho de admisión y respeto mutuo en el establecimiento.';

      const politicaCancelacionYAnticipos =
        '• Con aviso de 2 horas o más: Tu anticipo queda 100% respaldado como saldo a favor en tu cuenta para reagendar en los siguientes 30 días.\n' +
        '• Con menos de 2 horas o inasistencia (No Show tras 10 min de tolerancia): Se pierde el anticipo por concepto de apartado y tiempo reservado del barbero.\n' +
        '• Por causas imputables a la barbería: Reagendación prioritaria inmediata o devolución del 100% del anticipo pagado.';

      const resumenPrivacidad =
        '• Responsable: VATOS ALFA Barber Shop (Santiago de Querétaro, Qro.).\n' +
        '• Datos recabados: Nombre, número de WhatsApp/teléfono y correo electrónico.\n' +
        '• Finalidad: Exclusivamente para agendar citas, identificación del cliente y envío de recordatorios o confirmaciones por WhatsApp.\n' +
        '• Confidencialidad: NO se venden ni comparten datos con terceros para publicidad. Solo se utilizan proveedores tecnológicos indispensables para operar (Google Cloud/Firebase).\n' +
        '• Derechos ARCO: El cliente puede solicitar acceso, rectificación, cancelación u oposición de sus datos escribiendo a contacto@vatosalfa.com.';

      let textoDetallado = '';
      if (customTerms && (tema === 'terminos' || tema === 'ambos' || tema === 'cancelaciones_y_anticipos')) {
        textoDetallado += `Términos registrados:\n${customTerms.substring(0, 1200)}...\n\n`;
      }
      if (customPrivacy && (tema === 'privacidad' || tema === 'ambos')) {
        textoDetallado += `Privacidad registrada:\n${customPrivacy.substring(0, 800)}...`;
      }

      return {
        urlTerminos,
        urlPrivacidad,
        resumenTerminos,
        resumenPrivacidad,
        politicaCancelacionYAnticipos,
        textoDetallado: textoDetallado || undefined,
      };
    } catch (e: any) {
      console.error('Error in consultar_terminos_y_privacidad:', e);
      return {
        urlTerminos: 'https://vatosalfa.com/terminos',
        urlPrivacidad: 'https://vatosalfa.com/privacidad',
        resumenTerminos: 'Tolerancia de 10 minutos, cancelaciones con 2 horas de anticipación conservan saldo por 30 días.',
        resumenPrivacidad: 'Datos usados exclusivamente para citas y recordatorios, no se comparten con terceros.',
        politicaCancelacionYAnticipos: 'Avisando con 2h se conserva el saldo a favor; menos de 2h o inasistencia se pierde el anticipo.',
      };
    }
  }
);

export function getAgentTools({ userPickingSlot }: { userPickingSlot?: boolean } = {}) {
  return [
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
  ];
}

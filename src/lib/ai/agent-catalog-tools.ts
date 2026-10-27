import { getDb } from '@/lib/firebase-server';
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { formatTime12h, cleanSearchStr } from '@/lib/ai/agent-utils';

export const consultarServiciosTool = ai.defineTool(
  {
    name: 'consultar_servicios',
    description:
      'Obtiene el catálogo de servicios y paquetes activos de VATOS ALFA con sus IDs, nombres, descripción detallada de lo que incluye cada servicio o paquete, duración base en minutos, duración específica por cada barbero/experto (ej. Beatriz 30 min, Lalo 60 min, Ivon 40 min), precio en pesos mexicanos y si requiere anticipo.',
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
        descripcion: z.string().optional(),
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
        if (pData.deleted) return;
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

      return servsSnap.docs
        .filter((doc) => !doc.data().deleted)
        .map((doc) => {
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
            descripcion: String(d.description || d.descripcion || '').trim() || undefined,
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
    description:
      'Obtiene la lista de barberos y profesionales activos de VATOS ALFA con su nombre público, qué servicios realiza cada uno, qué días de la semana labora regularmente y sus horarios habituales por día (sin exponer datos personales ni privados).',
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        nombre: z.string(),
        serviciosRealizados: z.array(z.string()).optional(),
        diasLaborales: z.array(z.string()).optional(),
        horariosSemanales: z.record(z.string(), z.string()).optional(),
      })
    ),
  },
  async () => {
    try {
      const db = getDb();
      const [profsSnap, servsSnap] = await Promise.all([
        db.collection('profesionales').where('active', '==', true).get(),
        db.collection('servicios').where('active', '==', true).get(),
      ]);

      const serviceMap = new Map<string, string>();
      servsSnap.docs.forEach((s) => {
        const sData = s.data();
        serviceMap.set(s.id, sData.name || sData.nombre || 'Servicio');
      });

      const dayNamesOrder = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
      const dayLabels: Record<string, string> = {
        lunes: 'Lunes',
        martes: 'Martes',
        miercoles: 'Miércoles',
        jueves: 'Jueves',
        viernes: 'Viernes',
        sabado: 'Sábado',
        domingo: 'Domingo',
      };

      return profsSnap.docs
        .filter((doc) => !doc.data().deleted)
        .map((doc) => {
          const d = doc.data();
          const workingDays: string[] = [];
          const horariosSemanales: Record<string, string> = {};
          if (d.schedule && typeof d.schedule === 'object') {
            dayNamesOrder.forEach((dayKey) => {
              const dayCfg = d.schedule[dayKey];
              if (dayCfg?.enabled) {
                const label = dayLabels[dayKey] || (dayKey.charAt(0).toUpperCase() + dayKey.slice(1));
                workingDays.push(label);
                if (dayCfg.start && dayCfg.end) {
                  horariosSemanales[label] = `${formatTime12h(dayCfg.start)} a ${formatTime12h(dayCfg.end)}`;
                }
              }
            });
          }

          const profServices: string[] = [];
          if (Array.isArray(d.services) && d.services.length > 0) {
            d.services.forEach((sId: string) => {
              const sName = serviceMap.get(sId);
              if (sName) profServices.push(sName);
            });
          }

          return {
            id: doc.id,
            nombre: d.publicName || d.name || 'Barbero',
            serviciosRealizados: profServices.length > 0 ? profServices : undefined,
            diasLaborales: workingDays.length > 0 ? workingDays : undefined,
            horariosSemanales: Object.keys(horariosSemanales).length > 0 ? horariosSemanales : undefined,
          };
        });
    } catch (e: any) {
      console.error('Error in consultar_barberos:', e);
      return [];
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

export const consultarUbicacionTool = ai.defineTool(
  {
    name: 'consultar_ubicacion',
    description: 'Obtiene la dirección física exacta, referencias para llegar, teléfono y horarios reales de apertura de las sucursales activas de VATOS ALFA.',
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
      const [snap, sofiaDoc] = await Promise.all([
        db.collection('locales').get(),
        db.collection('settings').doc('sofia').get(),
      ]);
      const customRefs = sofiaDoc.exists ? sofiaDoc.data()?.addressReferences : '';

      const activeDocs = snap.docs.filter((d) => d.data().active !== false);
      const targetDoc = activeDocs[0] || snap.docs[0];

      if (targetDoc) {
        const data = targetDoc.data();
        let formattedHours = 'Lunes a Sábado de 10:00 AM a 9:00 PM, Domingos de 10:00 AM a 8:00 PM';
        if (data.schedule && typeof data.schedule === 'object') {
          const mon = data.schedule.lunes;
          const sun = data.schedule.domingo;
          if (mon?.enabled && mon.start && mon.end) {
            const monRange = `${formatTime12h(mon.start)} a ${formatTime12h(mon.end)}`;
            const sunRange = sun?.enabled && sun.start && sun.end
              ? `, Domingos de ${formatTime12h(sun.start)} a ${formatTime12h(sun.end)}`
              : '';
            formattedHours = `Lunes a Sábado de ${monRange}${sunRange}`;
          }
        }

        return {
          nombre: data.name || 'VATOS ALFA Barber Shop',
          direccion: data.address || 'Av. Cerro Sombrerete 1001, Col. Cipreses',
          ciudad: 'Santiago de Querétaro, Qro., México',
          referencias: customRefs || 'Sobre Av. Cerro Sombrerete, Col. Cipreses. Contamos con cajones de estacionamiento al frente.',
          telefono: data.phone || '4428727279',
          horarios: formattedHours,
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
        '• Datos recabados: Nombre, número de teléfono y correo electrónico.\n' +
        '• Finalidad: Exclusivamente para agendar citas, identificación del cliente y envío de recordatorios o confirmaciones.\n' +
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

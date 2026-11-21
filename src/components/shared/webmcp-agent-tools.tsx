'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const VATOS_ALFA_CATALOG = {
  negocio: 'VATOS ALFA Barber Shop',
  ciudad: 'Santiago de Querétaro, Qro., México',
  sucursal: {
    nombre: 'Sucursal Sombrerete (Matriz)',
    direccion: 'Av. Sombrerete 1001, Col. Cipreses, Santiago de Querétaro, Qro., C.P. 76125',
    telefono: '+52 442 872 7279',
    horarios: 'Lunes a Sábado 10:00 - 20:30 hrs, Domingo 10:00 - 16:00 hrs',
    reservaEnLinea: 'https://vatosalfa.com/reservar',
  },
  servicios: [
    { nombre: 'Corte de cabello', precioMXN: 140, categoria: 'cortes', duracionMin: 40 },
    { nombre: 'Arreglo de barba y afeitado clásico con toalla caliente', precioMXN: 165, categoria: 'barba', duracionMin: 40 },
    { nombre: 'Arreglo de barba express', precioMXN: 100, categoria: 'barba', duracionMin: 20 },
    { nombre: 'Diseño de barba', precioMXN: 150, categoria: 'barba', duracionMin: 30 },
    { nombre: 'Facial completo con masajeador', precioMXN: 190, categoria: 'faciales', duracionMin: 40 },
    { nombre: 'Depilación facial', precioMXN: 120, categoria: 'faciales', duracionMin: 20 },
    { nombre: 'Lavado de cabello', precioMXN: 30, categoria: 'cortes', duracionMin: 15 },
    { nombre: 'Arreglo de ceja', precioMXN: 30, categoria: 'faciales', duracionMin: 10 },
    { nombre: 'Depilación nasal con cera', precioMXN: 30, categoria: 'faciales', duracionMin: 10 },
    { nombre: 'Grecas', precioMXN: 70, categoria: 'cortes', duracionMin: 20 },
    { nombre: 'Paquete 1: El Caballero Alfa (Corte + Barba con toalla caliente)', precioMXN: 259, categoria: 'paquetes', duracionMin: 60 },
    { nombre: 'Paquete 2: Renovación Alfa (Corte + Facial completo)', precioMXN: 310, categoria: 'paquetes', duracionMin: 60 },
    { nombre: 'Paquete 3: Héroe en Descanso (Corte + Ceja + Lavado + Facial completo)', precioMXN: 329, categoria: 'paquetes', duracionMin: 75 },
  ],
  programaLealtad: {
    nombre: 'Pase Alfa Club',
    beneficioPrincipal: 'La Décima va por la Casa (10.° corte de cabello gratis al acumular 9 visitas)',
    cashback: 'Alfa Coins en cada servicio (3% a 10% según nivel Alfa Member, Alfa Gold o Alfa Black VIP)',
  },
};

export function WebMcpAgentTools() {
  const pathname = usePathname() || '/';
  const router = useRouter();

  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/reservar') ||
    pathname.startsWith('/promociones') ||
    pathname.startsWith('/blog');

  useEffect(() => {
    if (typeof window === 'undefined' || !isPublicRoute) return;

    const modelCtx =
      (navigator as any).modelContext ||
      (document as any).modelContext;

    if (!modelCtx || typeof modelCtx.registerTool !== 'function') return;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const regOptions = controller ? { signal: controller.signal } : undefined;

    const tools = [
      {
        name: 'consultar_catalogo_servicios_vatos_alfa',
        description:
          'Consulta los servicios, cortes de cabello, fades, arreglo de barba con toalla caliente, faciales y paquetes VIP con precios oficiales en MXN de VATOS ALFA Barber Shop en Querétaro.',
        inputSchema: {
          type: 'object',
          properties: {
            categoria: {
              type: 'string',
              enum: ['todos', 'cortes', 'barba', 'paquetes', 'faciales'],
              description: 'Categoría de servicios de barbería a consultar.',
            },
          },
          required: ['categoria'],
        },
        execute: async (input: { categoria?: string }) => {
          try {
            const res = await fetch('/llms.txt');
            if (res.ok) {
              const liveMarkdown = await res.text();
              return {
                negocio: VATOS_ALFA_CATALOG.negocio,
                moneda: 'MXN',
                fuenteEnTiempoReal: 'https://vatosalfa.com/llms.txt',
                catalogoActualizadoMarkdown: liveMarkdown,
                urlReserva: VATOS_ALFA_CATALOG.sucursal.reservaEnLinea,
              };
            }
          } catch {
            // Fallback to local summary if offline
          }
          const cat = (input?.categoria || 'todos').toLowerCase();
          const list =
            cat === 'todos'
              ? VATOS_ALFA_CATALOG.servicios
              : VATOS_ALFA_CATALOG.servicios.filter((s) => s.categoria === cat);
          return {
            negocio: VATOS_ALFA_CATALOG.negocio,
            moneda: 'MXN',
            servicios: list,
            programaLealtad: VATOS_ALFA_CATALOG.programaLealtad,
            urlReserva: VATOS_ALFA_CATALOG.sucursal.reservaEnLinea,
          };
        },
      },
      {
        name: 'consultar_sucursal_y_horarios_vatos_alfa',
        description:
          'Devuelve la dirección exacta en Av. Sombrerete 1001 (Querétaro), teléfono, WhatsApp, horarios de apertura y enlace para agendar cita en VATOS ALFA Barber Shop.',
        inputSchema: {
          type: 'object',
          properties: {
            sucursal: {
              type: 'string',
              description: 'Nombre de la sucursal en Querétaro (ej. Sombrerete).',
            },
          },
          required: ['sucursal'],
        },
        execute: async () => VATOS_ALFA_CATALOG.sucursal,
      },
      {
        name: 'agendar_cita_vatos_alfa',
        description:
          'Dirige al usuario al flujo oficial de reserva de cita en línea de VATOS ALFA Barber Shop Querétaro para el servicio o paquete seleccionado.',
        inputSchema: {
          type: 'object',
          properties: {
            servicio: {
              type: 'string',
              description: 'Servicio o paquete deseado (ej. Corte de cabello, El Caballero Alfa).',
            },
            fecha: {
              type: 'string',
              description: 'Fecha preferida en formato YYYY-MM-DD.',
            },
          },
          required: ['servicio'],
        },
        execute: async (input: { servicio?: string; fecha?: string }) => {
          const params = new URLSearchParams();
          if (input?.servicio) params.set('servicio', input.servicio);
          if (input?.fecha) params.set('fecha', input.fecha);
          const targetUrl = params.toString() ? `/reservar?${params.toString()}` : '/reservar';
          router.push(targetUrl);
          return { status: 'navigating', url: `https://vatosalfa.com${targetUrl}` };
        },
      },
    ];

    const unregisters: Array<() => void> = [];
    for (const tool of tools) {
      try {
        const res = modelCtx.registerTool(tool, regOptions);
        if (typeof res === 'function') {
          unregisters.push(res);
        } else if (res && typeof res.unregister === 'function') {
          unregisters.push(() => res.unregister());
        }
      } catch {
        // Ignore if browser implementation differs
      }
    }

    return () => {
      try {
        controller?.abort();
        unregisters.forEach((u) => u());
        if (typeof modelCtx.unregisterTool === 'function') {
          tools.forEach((t) => modelCtx.unregisterTool(t.name));
        }
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [isPublicRoute, router]);

  if (!isPublicRoute) return null;

  // Declarative WebMCP form (invisible visually via sr-only, 100% accessible to AI agents and Lighthouse WebMCP form audits)
  return (
    <form
      action="/reservar"
      method="GET"
      className="sr-only"
      aria-label="Reservar cita en VATOS ALFA Barber Shop Querétaro"
      {...({
        toolname: 'reservar_cita_barberia_vatos_alfa',
        tooldescription:
          'Reservar cita de corte de cabello, fade, arreglo de barba con toalla caliente o paquete VIP en VATOS ALFA Barber Shop Querétaro (Sucursal Sombrerete, Av. Sombrerete 1001).',
      } as any)}
    >
      <label htmlFor="webmcp-servicio-input">Servicio o paquete de barbería</label>
      <input
        id="webmcp-servicio-input"
        type="text"
        name="servicio"
        defaultValue="Corte de cabello"
        {...({
          toolparamdescription:
            'Nombre del servicio o paquete a reservar (ej. Corte de cabello, Arreglo de barba, Paquete El Caballero Alfa, Renovación Alfa, Héroe en Descanso).',
        } as any)}
      />

      <label htmlFor="webmcp-fecha-input">Fecha deseada para la cita</label>
      <input
        id="webmcp-fecha-input"
        type="date"
        name="fecha"
        {...({
          toolparamdescription: 'Fecha deseada para la cita en la barbería en formato YYYY-MM-DD.',
        } as any)}
      />

      <label htmlFor="webmcp-sucursal-input">Sucursal en Querétaro</label>
      <input
        id="webmcp-sucursal-input"
        type="text"
        name="sucursal"
        defaultValue="Sombrerete"
        {...({
          toolparamdescription: 'Sucursal de VATOS ALFA Barber Shop en Querétaro (Sombrerete).',
        } as any)}
      />

      <button type="submit">Continuar a Reservar Cita en VATOS ALFA</button>
    </form>
  );
}

import { NextResponse } from 'next/server';
import { getPublicLandingData } from '@/lib/public-landing-data';

export const revalidate = 60;

function formatMxn(val: unknown): string {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return '$0.00 MXN';
  return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

export async function GET() {
  const data = await getPublicLandingData();

  const rawServices = Array.isArray(data.services) ? data.services : [];
  const activeServices = rawServices
    .filter((s: any) => s && s.active !== false && s.deleted !== true)
    .sort((a: any, b: any) => Number(a.order ?? 999) - Number(b.order ?? 999));

  const isPackageService = (s: any) => {
    const name = String(s.name || s.nombre || '').toLowerCase();
    const cat = String(s.category || s.categoria || '').toLowerCase();
    return (
      cat.includes('paquete') ||
      /^[1-9]\s/.test(name) ||
      name.includes('paquete') ||
      name.includes('caballero alfa') ||
      name.includes('renovación alfa') ||
      name.includes('renovacion alfa') ||
      name.includes('héroe en descanso') ||
      name.includes('heroe en descanso')
    );
  };

  const individualServices = activeServices.filter((s: any) => !isPackageService(s));
  const packageServices = activeServices.filter((s: any) => isPackageService(s));

  const serviceLines =
    individualServices.length > 0
      ? individualServices.map((s: any) => {
          const name = String(s.name || s.nombre || 'Servicio').trim();
          const priceStr = formatMxn(s.price ?? s.precio);
          const desc = String(s.description || s.descripcion || '').trim();
          return desc
            ? `- **${name} (${priceStr}):** ${desc}`
            : `- **${name}:** ${priceStr}`;
        })
      : [
          '- **Corte de cabello para caballero:** Consulta tarifa vigente en https://vatosalfa.com/reservar',
          '- **Arreglo de barba y afeitado clásico con toalla caliente:** Consulta tarifa vigente en https://vatosalfa.com/reservar',
        ];

  const packageLines =
    packageServices.length > 0
      ? packageServices.map((s: any) => {
          const name = String(s.name || s.nombre || 'Paquete VIP').trim();
          const priceStr = formatMxn(s.price ?? s.precio);
          const desc = String(s.description || s.descripcion || '').trim();
          return desc
            ? `- **${name} (${priceStr}):** ${desc}`
            : `- **${name}:** ${priceStr}`;
        })
      : [
          '- **Paquetes VIP (Corte + Barba / Facial):** Consulta tarifas actualizadas en https://vatosalfa.com/reservar',
        ];

  const locales = Array.isArray(data.locales) ? data.locales : [];
  const primaryLocal = locales[0] || {};
  const branchName = String(primaryLocal.name || 'Sucursal Sombrerete (Matriz Querétaro)').trim();
  const branchAddress = String(
    primaryLocal.address || 'Av. Sombrerete 1001, Col. Cipreses, Santiago de Querétaro, Qro., C.P. 76125, México'
  ).trim();
  const branchPhone = String(primaryLocal.phone || '+52 442 872 7279').trim();

  const sellosRequeridos = Number(data.paseAlfaConfig?.sellosRequeridos || 10);
  const visitasPagadasRequeridas = Math.max(1, sellosRequeridos - 1);

  const markdown = `# VATOS ALFA Barber Shop — Querétaro

> VATOS ALFA Barber Shop es la barbería líder en Santiago de Querétaro (${branchName}: ${branchAddress}), especializada en cortes de cabello para caballero, desvanecidos (low fade, mid fade, high fade, taper fade, skin fade), diseño y arreglo de barba con ritual de toalla caliente y navaja libre, faciales con vapor de ozono y paquetes VIP sin tiempos de espera mediante citas puntuales en línea.

## Navegación Principal y Reserva Directa

- [Página Oficial VATOS ALFA Barber Shop](https://vatosalfa.com/): Información general, ubicación en Querétaro, horarios en tiempo real, catálogo actualizado y club de lealtad.
- [Reservar Cita en Línea](https://vatosalfa.com/reservar): Sistema oficial de agendamiento en tiempo real para elegir barbero profesional, servicio, paquete, fecha y horario exacto con confirmación inmediata.
- [Promociones y Beneficios Vigentes](https://vatosalfa.com/promociones): Ofertas activas, descuentos por día y beneficios exclusivos del Pase Alfa Club.
- [Blog y Guía de Estilo Masculino](https://vatosalfa.com/blog): Consejos de expertos barberos en Querétaro sobre tipos de rostro, cortes de cabello en tendencia, cuidado de barba y grooming masculino.
- [Manifiesto de Capacidades Agénticas (ARD / AI Catalog)](https://vatosalfa.com/.well-known/ai-catalog.json): Catálogo estructurado de herramientas y recursos para agentes de inteligencia artificial.

## Servicios Individuales y Tarifas Vigentes en Tiempo Real (MXN)

${serviceLines.join('\n')}

## Paquetes VIP y Tarifas Vigentes en Tiempo Real (MXN)

${packageLines.join('\n')}

## Ubicación, Contacto y Horarios en Querétaro

- **Sucursal:** ${branchName}.
- **Dirección:** ${branchAddress}.
- **Teléfono y WhatsApp:** ${branchPhone}.
- **Horario de Atención:** Lunes a Sábado de 10:00 a 20:30 hrs; Domingo de 10:00 a 16:00 hrs.
- **Zonas cercanas atendidas:** Sombrerete, Cipreses, Loma Dorada, Parque Industrial Benito Juárez, Jurica, Juriquilla, El Refugio, Zákia, Milenio III, Centro Histórico de Querétaro y todo el municipio de Santiago de Querétaro.

## Programa de Lealtad Pase Alfa Club y App Móvil

- **La Décima va por la Casa:** Al acumular ${visitasPagadasRequeridas} visitas pagadas, el ${sellosRequeridos}.° corte de cabello es totalmente gratis.
- **Alfa Coins (Cashback):** Recompensa en monedero digital por cada servicio pagado según el nivel del cliente (Alfa Member, Alfa Gold y Alfa Black VIP).
- **Regalo de Cumpleaños y Juntos es Mejor:** Beneficios exclusivos para clientes registrados en la App Móvil VATOS ALFA (disponible en iOS y Android) y en la plataforma web.
`;

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/firebase-client';
import { doc, onSnapshot } from 'firebase/firestore';

export type TemaTemporadaId =
  | 'ninguno'
  | 'halloween'
  | 'dia_muertos'
  | 'navidad'
  | 'ano_nuevo'
  | 'san_valentin'
  | 'primavera'
  | 'dia_madres'
  | 'dia_padre'
  | 'patrias';

export interface TemporadaAppConfig {
  activo: boolean;
  mostrarEnApp?: boolean;
  mostrarEnWeb?: boolean;
  mostrarEnAgenda?: boolean;
  modo: 'automatico' | 'manual';
  temaForzado: TemaTemporadaId;
  intensidad: 'sutil' | 'normal';
}

export function detectAutoSeason(date = new Date()): TemaTemporadaId {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (month === 1 && day >= 1 && day <= 7) return 'ano_nuevo';
  if (month === 2 && day >= 1 && day <= 16) return 'san_valentin';
  if (month === 3 && day >= 18 && day <= 26) return 'primavera';
  if (month === 5 && day >= 1 && day <= 12) return 'dia_madres';
  if (month === 6 && day >= 10 && day <= 22) return 'dia_padre';
  if (month === 9 && day >= 1 && day <= 17) return 'patrias';
  if (month === 10 && day >= 12 && day <= 29) return 'halloween';
  if ((month === 10 && day >= 30) || (month === 11 && day <= 4)) return 'dia_muertos';
  if ((month === 11 && day >= 25) || (month === 12 && day <= 30)) return 'navidad';
  if (month === 12 && day === 31) return 'ano_nuevo';

  return 'ninguno';
}

interface ParticleDef {
  id: number;
  leftPercent: number;
  scale: number;
  duration: number;
  delay: number;
  swayAmp: number;
  variant: number;
  depth: 'near' | 'mid' | 'far';
}

const WEB_PARTICLE_SPECS: ParticleDef[] = [
  { id: 0, leftPercent: 6, scale: 1.25, duration: 8.5, delay: 0, swayAmp: 25, variant: 0, depth: 'near' },
  { id: 1, leftPercent: 15, scale: 0.85, duration: 12.0, delay: 1.5, swayAmp: 15, variant: 1, depth: 'far' },
  { id: 2, leftPercent: 24, scale: 1.05, duration: 9.8, delay: 0.6, swayAmp: 20, variant: 2, depth: 'mid' },
  { id: 3, leftPercent: 33, scale: 1.2, duration: 9.0, delay: 2.2, swayAmp: 22, variant: 0, depth: 'near' },
  { id: 4, leftPercent: 42, scale: 0.8, duration: 13.0, delay: 1.0, swayAmp: 14, variant: 1, depth: 'far' },
  { id: 5, leftPercent: 51, scale: 1.0, duration: 10.2, delay: 2.8, swayAmp: 18, variant: 2, depth: 'mid' },
  { id: 6, leftPercent: 60, scale: 0.9, duration: 11.5, delay: 0.4, swayAmp: 16, variant: 0, depth: 'far' },
  { id: 7, leftPercent: 69, scale: 1.15, duration: 9.4, delay: 1.8, swayAmp: 22, variant: 1, depth: 'mid' },
  { id: 8, leftPercent: 78, scale: 1.3, duration: 8.8, delay: 1.2, swayAmp: 24, variant: 2, depth: 'near' },
  { id: 9, leftPercent: 87, scale: 1.0, duration: 10.6, delay: 2.5, swayAmp: 18, variant: 0, depth: 'mid' },
  { id: 10, leftPercent: 95, scale: 0.82, duration: 12.5, delay: 0.8, swayAmp: 15, variant: 1, depth: 'far' },
];

export function SeasonalEffectsWebOverlay() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  const [config, setConfig] = useState<TemporadaAppConfig>({
    activo: true,
    mostrarEnApp: true,
    mostrarEnWeb: true,
    mostrarEnAgenda: true,
    modo: 'automatico',
    temaForzado: 'halloween',
    intensidad: 'sutil',
  });

  useEffect(() => {
    setMounted(true);
    if (!db) return;

    const unsub = onSnapshot(
      doc(db, 'configuracion', 'app_movil'),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const raw = data?.temporada_config || data?.pase_alfa?.temporada_config;
        if (raw) {
          const savedTheme =
            raw.temaForzado === 'buen_fin' || raw.temaForzado === 'aniversario'
              ? 'halloween'
              : raw.temaForzado || 'halloween';

          setConfig({
            activo: raw.activo !== undefined ? Boolean(raw.activo) : true,
            mostrarEnApp: raw.mostrarEnApp !== undefined ? Boolean(raw.mostrarEnApp) : true,
            mostrarEnWeb: raw.mostrarEnWeb !== undefined ? Boolean(raw.mostrarEnWeb) : true,
            mostrarEnAgenda: raw.mostrarEnAgenda !== undefined ? Boolean(raw.mostrarEnAgenda) : true,
            modo: raw.modo === 'manual' ? 'manual' : 'automatico',
            temaForzado: savedTheme,
            intensidad: raw.intensidad === 'normal' ? 'normal' : 'sutil',
          });
        }
      },
      (err) => {
        console.warn('Error escuchando temporada_config en web:', err);
      }
    );

    return () => unsub();
  }, []);

  const autoTheme = useMemo(() => detectAutoSeason(new Date()), []);

  const effectiveTheme: TemaTemporadaId = useMemo(() => {
    if (!config.activo) return 'ninguno';
    if (config.modo === 'manual') return config.temaForzado;
    return autoTheme;
  }, [config, autoTheme]);

  // Channel checking: Agenda (Staff/Recepción) vs Página Web (Portal Clientes)
  const shouldRenderOnCurrentRoute = useMemo(() => {
    if (!config.activo) return false;

    const isAgendaOrAdmin =
      pathname?.startsWith('/agenda') ||
      pathname?.startsWith('/settings') ||
      pathname?.startsWith('/ventas') ||
      pathname?.startsWith('/clientes') ||
      pathname?.startsWith('/productos') ||
      pathname?.startsWith('/reportes') ||
      pathname?.startsWith('/finanzas') ||
      pathname?.startsWith('/administracion') ||
      pathname?.startsWith('/caja') ||
      pathname?.startsWith('/comisiones');

    if (isAgendaOrAdmin) {
      return config.mostrarEnAgenda !== false;
    }

    return config.mostrarEnWeb !== false;
  }, [config, pathname]);

  const visibleParticles = useMemo(() => {
    if (effectiveTheme === 'patrias') return WEB_PARTICLE_SPECS;
    if (config.intensidad === 'sutil') return WEB_PARTICLE_SPECS.slice(0, 7);
    return WEB_PARTICLE_SPECS;
  }, [config.intensidad, effectiveTheme]);

  if (!mounted || effectiveTheme === 'ninguno' || !shouldRenderOnCurrentRoute) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden select-none"
      aria-hidden="true"
    >
      <style>{`
        @keyframes web-spider-drop {
          0%, 100% { transform: translateY(0); }
          14% { transform: translateY(240px); }
          18% { transform: translateY(215px); }
          22% { transform: translateY(230px); }
          40% { transform: translateY(230px); }
          58% { transform: translateY(0); }
        }
        @keyframes web-spider-sway {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(5deg); }
        }
        @keyframes web-fall {
          0% {
            transform: translate3d(0, -40px, 0) rotate(0deg) scaleY(1);
            opacity: 0;
          }
          10% { opacity: 0.95; }
          90% { opacity: 0.9; }
          100% {
            transform: translate3d(var(--sway-x, 20px), 105vh, 0) rotate(var(--rot-z, 180deg)) scaleY(0.8);
            opacity: 0;
          }
        }
        @keyframes web-spring-rise {
          0% {
            transform: translate3d(0, 102vh, 0) rotate(0deg);
            opacity: 0;
          }
          15% { opacity: 0.92; }
          85% { opacity: 0.85; }
          100% {
            transform: translate3d(var(--sway-x, 20px), 15vh, 0) rotate(var(--rot-z, 120deg));
            opacity: 0;
          }
        }
        @keyframes web-car-drive-1 {
          0% { transform: translate3d(-120px, 0, 0); }
          100% { transform: translate3d(calc(100vw + 120px), 0, 0); }
        }
        @keyframes web-car-drive-2 {
          0% { transform: translate3d(-120px, 0, 0); }
          100% { transform: translate3d(calc(100vw + 120px), 0, 0); }
        }
        @keyframes web-car-bounce {
          0%, 100% { transform: translateY(-1.5px); }
          50% { transform: translateY(1.5px); }
        }
        @keyframes web-corner-breath {
          0%, 100% { transform: rotate(-3deg) scale(0.97); }
          50% { transform: rotate(3deg) scale(1.03); }
        }
        @keyframes web-flower-grow-stay {
          0% {
            transform: translateY(105%) scale(0.15);
            opacity: 0;
          }
          18% {
            opacity: 1;
          }
          75% {
            transform: translateY(-2%) scale(1.04);
            opacity: 1;
          }
          100% {
            transform: translateY(0%) scale(1);
            opacity: 1;
          }
        }
        @keyframes web-flower-grow-fade {
          0% {
            transform: translateY(105%) scale(0.15);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          42% {
            transform: translateY(0%) scale(1) rotate(0deg);
            opacity: 1;
          }
          58% {
            transform: translateY(0%) scale(1.03) rotate(2.5deg);
            opacity: 1;
          }
          76% {
            transform: translateY(0%) scale(1) rotate(-2deg);
            opacity: 0.65;
          }
          100% {
            transform: translateY(4px) scale(0.94);
            opacity: 0;
          }
        }
        @keyframes web-flower-breeze {
          0%, 100% { transform: rotate(-2.5deg); }
          50% { transform: rotate(2.5deg); }
        }
      `}</style>

      {/* =====================================================================
          1. HALLOWEEN: Telaraña en Esquina + Araña Viuda Negra 3D en Capa Superior
         ===================================================================== */}
      {effectiveTheme === 'halloween' && (
        <>
          {/* Telaraña Fija Compacta en la Esquina Superior Izquierda */}
          <div
            className="fixed top-0 left-0 w-16 h-16 sm:w-20 sm:h-20 z-[9999]"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }}
          >
            <svg width="100%" height="100%" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="webSilkWebHigh" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.72" />
                  <stop offset="50%" stopColor="#E2E8F0" stopOpacity="0.48" />
                  <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.18" />
                </linearGradient>
              </defs>
              {/* Líneas Radiales de Anclaje */}
              <path
                d="M0 0 L94 13 M0 0 L82 38 M0 0 L64 64 M0 0 L38 82 M0 0 L13 94"
                stroke="url(#webSilkWebHigh)"
                strokeWidth="0.95"
                fill="none"
              />
              {/* Espirales Catenarias de Seda */}
              <path
                d="M24 4 Q20 12 17 17 Q12 20 4 24
                   M42 6 Q36 19 29 29 Q19 36 6 42
                   M60 9 Q51 27 42 42 Q27 51 9 60
                   M78 12 Q67 35 52 52 Q35 67 12 78"
                stroke="url(#webSilkWebHigh)"
                strokeWidth="0.8"
                fill="none"
              />
              {/* Gotas de Rocío Brillantes */}
              <circle cx="29" cy="29" r="1.3" fill="#FFFFFF" opacity="0.85" />
              <circle cx="42" cy="42" r="1.4" fill="#FFFFFF" opacity="0.75" />
              <circle cx="52" cy="52" r="1.5" fill="#FDE047" opacity="0.8" />
            </svg>
          </div>

          {/* Araña Viuda Negra 3D con Hilo Largo Continuo Anclado Arriba (Solo baja 2 veces y se oculta) */}
          <div
            className="fixed -top-48 right-10 sm:right-28 md:right-40 origin-top z-[9999]"
            style={{
              animation: 'web-spider-drop 9.5s cubic-bezier(0.22, 1, 0.36, 1) 0.3s 2 both',
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.55))',
            }}
          >
            <div
              className="origin-top"
              style={{ animation: 'web-spider-sway 3.2s ease-in-out 6 both' }}
            >
              <svg width="50" height="310" viewBox="0 0 64 340">
                <defs>
                  <linearGradient id="silkStrandWebHigh" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
                    <stop offset="60%" stopColor="#E2E8F0" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
                  </linearGradient>
                  <radialGradient id="abdom3DWebHigh" cx="38%" cy="32%" r="65%">
                    <stop offset="0%" stopColor="#475569" />
                    <stop offset="35%" stopColor="#1E293B" />
                    <stop offset="75%" stopColor="#090D16" />
                    <stop offset="100%" stopColor="#020408" />
                  </radialGradient>
                  <radialGradient id="thor3DWebHigh" cx="42%" cy="35%" r="60%">
                    <stop offset="0%" stopColor="#334155" />
                    <stop offset="50%" stopColor="#0F172A" />
                    <stop offset="100%" stopColor="#020617" />
                  </radialGradient>
                </defs>

                {/* Hilo de seda ininterrumpido hasta la araña (300px) */}
                <line x1="32" y1="0" x2="32" y2="290" stroke="url(#silkStrandWebHigh)" strokeWidth="1.4" />

                {/* Sombra Proyectada */}
                <ellipse cx="34" cy="300" rx="8.5" ry="10.5" fill="rgba(0,0,0,0.35)" />

                {/* 8 Patas Articuladas 3D */}
                <g stroke="#1E293B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
                  <path d="M28 305 L16 294 L9 299 L4 306" />
                  <path d="M27 307 L13 302 L7 309 L3 316" />
                  <path d="M27 309 L14 311 L8 319 L5 326" />
                  <path d="M29 311 L18 318 L13 327 L11 333" />
                  <path d="M36 305 L48 294 L55 299 L60 306" />
                  <path d="M37 307 L51 302 L57 309 L61 316" />
                  <path d="M37 309 L50 311 L56 319 L59 326" />
                  <path d="M35 311 L46 318 L51 327 L53 333" />
                </g>

                {/* Reflejos de Quitina en Patas */}
                <g stroke="rgba(203, 213, 225, 0.55)" strokeWidth="0.7" strokeLinecap="round" fill="none">
                  <path d="M28 305 L16 294 M27 307 L13 302 M36 305 L48 294 M37 307 L51 302" />
                </g>

                {/* Abdomen 3D con Reloj de Arena Rojo Carmesí */}
                <ellipse cx="32" cy="295" rx="7.8" ry="10" fill="url(#abdom3DWebHigh)" stroke="#334155" strokeWidth="0.6" />
                <path d="M30 291 L34 291 L32.3 295 L34 299 L30 299 L31.7 295 Z" fill="#DC2626" />
                <ellipse cx="29.2" cy="291.5" rx="2.2" ry="3.4" fill="rgba(255,255,255,0.28)" transform="rotate(-15 29.2 291.5)" />

                {/* Cefalotórax y Ojos Brillantes */}
                <ellipse cx="32" cy="308" rx="5.2" ry="4.8" fill="url(#thor3DWebHigh)" stroke="#334155" strokeWidth="0.6" />
                <circle cx="30.5" cy="311" r="0.9" fill="#F59E0B" />
                <circle cx="33.5" cy="311" r="0.9" fill="#F59E0B" />
              </svg>
            </div>
          </div>
        </>
      )}

      {/* =====================================================================
          2. DÍA DE MUERTOS: Calaverita & Cempasúchil Fijo en Esquina
         ===================================================================== */}
      {effectiveTheme === 'dia_muertos' && (
        <div
          className="fixed top-1 left-1.5 z-[9999]"
          style={{
            animation: 'web-corner-breath 4s ease-in-out infinite',
            filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))',
          }}
        >
          <svg width="76" height="60" viewBox="0 0 118 95">
            <path
              d="M0 0 L52 0 L52 30 L44 24 L36 30 L28 24 L20 30 L12 24 L0 30 Z"
              fill="#9333EA"
              opacity={0.88}
            />
            <circle cx="16" cy="12" r="3" fill="#FEF08A" opacity={0.9} />
            <circle cx="34" cy="12" r="3" fill="#FEF08A" opacity={0.9} />

            {/* Calaverita de Azúcar 3D */}
            <g transform="translate(8, 12)">
              <ellipse cx="23" cy="24" rx="14" ry="15" fill="rgba(0,0,0,0.3)" />
              <path
                d="M9 20 C9 9, 35 9, 35 20 C35 25, 32 28, 30 30 L30 36 C30 38, 14 38, 14 36 L14 30 C12 28, 9 25, 9 20 Z"
                fill="#FFFBEB"
                stroke="#F59E0B"
                strokeWidth="1.2"
              />
              <path d="M17 13 Q22 9 27 13" stroke="#E11D48" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <circle cx="22" cy="11.5" r="1.8" fill="#F59E0B" />
              <circle cx="16.5" cy="21" r="4.2" fill="#1E1B4B" stroke="#F97316" strokeWidth="1.1" />
              <circle cx="27.5" cy="21" r="4.2" fill="#1E1B4B" stroke="#F97316" strokeWidth="1.1" />
              <circle cx="16.5" cy="21" r="1.4" fill="#FACC15" />
              <circle cx="27.5" cy="21" r="1.4" fill="#FACC15" />
              <path d="M22 24 L19.8 28 L24.2 28 Z" fill="#1E1B4B" />
              <path d="M15 32.5 L29 32.5 M18 30.5 L18 34.5 M22 30.5 L22 34.5 M26 30.5 L26 34.5" stroke="#1E1B4B" strokeWidth="1" strokeLinecap="round" />
            </g>
          </svg>
        </div>
      )}

      {/* =====================================================================
          3. NAVIDAD: Gorrito de Santa en Esquina Superior
         ===================================================================== */}
      {effectiveTheme === 'navidad' && (
        <div
          className="fixed top-1 left-1.5 z-[9999]"
          style={{
            animation: 'web-corner-breath 3.6s ease-in-out infinite',
            filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))',
          }}
        >
          <svg width="68" height="58" viewBox="0 0 92 82">
            <defs>
              <linearGradient id="santaVelvetWebHigh" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F87171" />
                <stop offset="35%" stopColor="#DC2626" />
                <stop offset="80%" stopColor="#991B1B" />
                <stop offset="100%" stopColor="#450A0A" />
              </linearGradient>
            </defs>
            <path
              d="M12 42 C16 14, 46 6, 68 26 C74 32, 77 42, 73 50 C66 42, 56 32, 46 36 L12 42 Z"
              fill="url(#santaVelvetWebHigh)"
            />
            <path
              d="M6 42 C6 36, 16 34, 30 35 C44 36, 56 40, 56 46 C56 52, 44 54, 28 52 C14 50, 6 48, 6 42 Z"
              fill="#FFFFFF"
              stroke="#CBD5E1"
              strokeWidth="1.2"
            />
            <circle cx="73" cy="52" r="9.5" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.2" />
            <path d="M16 39 C12 33, 20 30, 22 37 Z" fill="#15803D" />
            <circle cx="21" cy="39" r="2.4" fill="#DC2626" />
          </svg>
        </div>
      )}

      {/* =====================================================================
          4. AÑO NUEVO & DÍA DE REYES: Corona en Esquina + Carritos de Juguete
         ===================================================================== */}
      {effectiveTheme === 'ano_nuevo' && (
        <>
          <div
            className="fixed top-1 left-1.5 z-[9999]"
            style={{
              animation: 'web-corner-breath 3.8s ease-in-out infinite',
              filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))',
            }}
          >
            <svg width="64" height="50" viewBox="0 0 86 68">
              <path
                d="M14 42 L10 16 L26 28 L40 10 L54 28 L70 16 L66 42 Z"
                fill="#F59E0B"
                stroke="#78350F"
                strokeWidth="1.2"
              />
              <rect x="13" y="42" width="54" height="7" rx="3" fill="#F59E0B" stroke="#78350F" strokeWidth="0.8" />
              <circle cx="26" cy="36" r="2.8" fill="#10B981" />
              <circle cx="40" cy="35" r="3.4" fill="#EF4444" />
              <circle cx="54" cy="36" r="2.8" fill="#3B82F6" />
              <circle cx="40" cy="9" r="3" fill="#FEF08A" />
            </svg>
          </div>

          {/* Carrito de Carreras Rojo Rodando por Arriba (2 pasadas y termina) */}
          <div
            className="fixed top-20 left-0 z-[9999]"
            style={{
              animation: 'web-car-drive-1 8.5s ease-in-out 0.2s 2 both',
              filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
            }}
          >
            <div style={{ animation: 'web-car-bounce 0.22s ease-in-out 80 both' }}>
              <svg width="76" height="40" viewBox="0 0 76 40">
                <line x1="4" y1="10" x2="11" y2="10" stroke="#FBBF24" strokeWidth="2" />
                <circle cx="3.5" cy="6.5" r="3" stroke="#F59E0B" strokeWidth="1.6" fill="none" />
                <circle cx="3.5" cy="13.5" r="3" stroke="#F59E0B" strokeWidth="1.6" fill="none" />
                <path
                  d="M12 26 C12 20, 16 18, 22 18 L29 10 C33 7, 45 7, 50 11 L57 18 L66 19 C71 20, 73 23, 73 27 L72 30 C72 31.5, 70 32, 67 32 L16 32 C13 32, 12 30, 12 26 Z"
                  fill="#EF4444"
                />
                <path d="M31 11.5 C34 9, 44 9, 48 12 L53 18 L25 18 Z" fill="#38BDF8" />
                <circle cx="25" cy="31" r="6.5" fill="#0F172A" />
                <circle cx="25" cy="31" r="3.8" fill="#E2E8F0" />
                <circle cx="58" cy="31" r="6.5" fill="#0F172A" />
                <circle cx="58" cy="31" r="3.8" fill="#E2E8F0" />
              </svg>
            </div>
          </div>

          {/* Carrito Deportivo Azul Rodando por Abajo (2 pasadas y termina) */}
          <div
            className="fixed bottom-12 left-0 z-[9999]"
            style={{
              animation: 'web-car-drive-2 9.5s linear 2.5s 2 both',
              filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
            }}
          >
            <div style={{ animation: 'web-car-bounce 0.22s ease-in-out 90 both' }}>
              <svg width="72" height="36" viewBox="0 0 76 40">
                <path
                  d="M12 26 C12 20, 16 18, 22 18 L29 10 C33 7, 45 7, 50 11 L57 18 L66 19 C71 20, 73 23, 73 27 L72 30 C72 31.5, 70 32, 67 32 L16 32 C13 32, 12 30, 12 26 Z"
                  fill="#2563EB"
                />
                <path d="M31 11.5 C34 9, 44 9, 48 12 L53 18 L25 18 Z" fill="#BAE6FD" />
                <circle cx="25" cy="31" r="6.5" fill="#0F172A" />
                <circle cx="25" cy="31" r="3.8" fill="#E2E8F0" />
                <circle cx="58" cy="31" r="6.5" fill="#0F172A" />
                <circle cx="58" cy="31" r="3.8" fill="#E2E8F0" />
              </svg>
            </div>
          </div>
        </>
      )}

      {/* =====================================================================
          5. SAN VALENTÍN: Corazón Flechado 3D en Esquina Superior
         ===================================================================== */}
      {effectiveTheme === 'san_valentin' && (
        <div
          className="fixed top-1 left-1.5 z-[9999]"
          style={{
            animation: 'web-corner-breath 3.5s ease-in-out infinite',
            filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))',
          }}
        >
          <svg width="64" height="56" viewBox="0 0 86 76">
            <line x1="8" y1="54" x2="68" y2="14" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M68 14 L59 15 L64 22 Z" fill="#F59E0B" />
            <path
              d="M38 58 C38 58, 12 42, 12 24 C12 14, 20 8, 28 8 C33 8, 38 12, 38 16 C38 12, 43 8, 48 8 C56 8, 64 14, 64 24 C64 42, 38 58, 38 58 Z"
              fill="#E11D48"
              stroke="#FECDD3"
              strokeWidth="0.8"
            />
            <ellipse cx="25" cy="19" rx="6" ry="3.2" fill="rgba(255,255,255,0.55)" transform="rotate(-28 25 19)" />
          </svg>
        </div>
      )}

      {/* =====================================================================
          6. DÍA DE LAS MADRES: Rosa Roja con Tallo en Esquina Superior
         ===================================================================== */}
      {effectiveTheme === 'dia_madres' && (
        <div
          className="fixed top-1 left-1.5 z-[9999]"
          style={{
            animation: 'web-corner-breath 3.8s ease-in-out infinite',
            filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))',
          }}
        >
          <svg width="52" height="60" viewBox="0 0 48 56">
            <path d="M20 28 Q22 40 16 52" stroke="#15803D" strokeWidth="2.8" strokeLinecap="round" fill="none" />
            <path d="M20 36 C28 33, 35 37, 32 43 C27 44, 22 40, 20 36 Z" fill="#16A34A" />
            {[0, 72, 144, 216, 288].map((deg) => (
              <path
                key={deg}
                d="M20 20 C11 17, 7 8, 15 6 C18 5, 22 5, 25 6 C33 8, 29 17, 20 20 Z"
                fill="#E11D48"
                stroke="#881337"
                strokeWidth="0.4"
                transform={`rotate(${deg} 20 20)`}
              />
            ))}
            <circle cx="20" cy="19.5" r="5.5" fill="#9F1239" />
            <path
              d="M16.5 19 C17 15.5, 23 15.5, 23.5 19 C23.5 22, 18 22.5, 17.5 19.5"
              stroke="#FECDD3"
              strokeWidth="1.1"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      )}

      {/* =====================================================================
          7. DÍA DEL PADRE: Corona Dorada + Mostacho Imperial + Moño en Esquina
         ===================================================================== */}
      {effectiveTheme === 'dia_padre' && (
        <div
          className="fixed top-1 left-1.5 z-[9999]"
          style={{
            animation: 'web-corner-breath 4s ease-in-out infinite',
            filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.45))',
          }}
        >
          <svg width="68" height="55" viewBox="0 0 94 74">
            <path
              d="M22 26 L18 11 L31 19 L42 8 L53 19 L66 11 L62 26 Z"
              fill="#F59E0B"
              stroke="#FEF08A"
              strokeWidth="1"
            />
            <path
              d="M42 39 C36 32, 26 30, 18 37 C12 42, 8 39, 10 34 C12 30, 16 34, 18 32 C24 25, 36 25, 42 32 C48 25, 60 25, 66 32 C68 34, 72 30, 74 34 C76 39, 72 42, 66 37 C58 30, 48 32, 42 39 Z"
              fill="#271202"
              stroke="#F59E0B"
              strokeWidth="1.2"
            />
            <path
              d="M38 50 L24 43 C22 46, 22 54, 24 57 L38 50 Z M46 50 L60 43 C62 46, 62 54, 60 57 L46 50 Z"
              fill="#B91C1C"
              stroke="#FCA5A5"
              strokeWidth="0.6"
            />
            <rect x="38.5" y="46.5" width="7" height="7" rx="2" fill="#F59E0B" />
          </svg>
        </div>
      )}

      {/* =====================================================================
          8. FIESTAS PATRIAS: Bandera de México Ondeando en Esquina Superior
         ===================================================================== */}
      {effectiveTheme === 'patrias' && (
        <div
          className="fixed top-1 left-1.5 z-[9999]"
          style={{
            animation: 'web-corner-breath 3.5s ease-in-out infinite',
            filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))',
          }}
        >
          <svg width="72" height="58" viewBox="0 0 98 82">
            <path d="M14 14 Q26 9, 39 12 L35 48 Q22 45, 10 50 Z" fill="#006847" />
            <path d="M39 12 Q51 15, 64 17 L60 53 Q47 51, 35 48 Z" fill="#FFFFFF" />
            <path d="M64 17 Q77 19, 90 14 L86 50 Q73 55, 60 53 Z" fill="#CE1126" />
            <circle cx="49.5" cy="31" r="4.5" fill="#B45309" />
            <line x1="15" y1="8" x2="6" y2="74" stroke="#FBBF24" strokeWidth="3.2" strokeLinecap="round" />
            <circle cx="15.5" cy="7.5" r="3.2" fill="#F59E0B" />
          </svg>
        </div>
      )}

      {/* =====================================================================
          9. PRIMAVERA: Jardín Botánico con Flores con Pétalos Creciendo Desde Abajo
             - La flor de la izquierda crece y SE QUEDA fija.
             - Las demás flores crecen poco a poco y luego se difuminan hasta desaparecer.
         ===================================================================== */}
      {effectiveTheme === 'primavera' && (
        <div
          className="fixed bottom-0 left-0 right-0 h-32 pointer-events-none z-[9999] overflow-hidden"
          style={{ filter: 'drop-shadow(0 -2px 6px rgba(0,0,0,0.28))' }}
        >
          {/* 1. FLOR DE LA IZQUIERDA (Crece poco a poco y SE QUEDA fija con brisa suave) */}
          <div
            className="absolute bottom-0 left-3 sm:left-6 origin-bottom"
            style={{
              animation: 'web-flower-grow-stay 3.6s cubic-bezier(0.22, 1, 0.36, 1) 0.1s 1 both',
            }}
          >
            <div
              className="origin-bottom"
              style={{ animation: 'web-flower-breeze 4.2s ease-in-out infinite' }}
            >
              <svg width="86" height="118" viewBox="0 0 86 118">
                {/* Tallo orgánico y hojas */}
                <path
                  d="M42 118 Q56 80 38 48 Q32 34 44 24"
                  stroke="#15803D"
                  strokeWidth="3.2"
                  fill="none"
                  strokeLinecap="round"
                />
                <path d="M44 88 C24 84, 16 70, 32 70 C40 70, 44 80, 44 88 Z" fill="#22C55E" />
                <path d="M41 64 C58 58, 66 44, 50 46 C42 48, 40 56, 41 64 Z" fill="#16A34A" />
                {/* Flor Rosa con Pétalos Completos (8 pétalos exteriores + 8 interiores + pistilo) */}
                <g transform="translate(44, 23)">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                    <path
                      key={`outer-${deg}`}
                      d="M0 0 C-5 -6, -6 -16, 0 -18 C6 -16, 5 -6, 0 0 Z"
                      fill="#EC4899"
                      stroke="#BE185D"
                      strokeWidth="0.4"
                      transform={`rotate(${deg})`}
                    />
                  ))}
                  {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((deg) => (
                    <path
                      key={`inner-${deg}`}
                      d="M0 0 C-3.5 -4, -4 -12, 0 -13.5 C4 -12, 3.5 -4, 0 0 Z"
                      fill="#F472B6"
                      transform={`rotate(${deg})`}
                    />
                  ))}
                  <circle cx="0" cy="0" r="5" fill="#F59E0B" />
                  <circle cx="0" cy="0" r="3" fill="#FEF08A" />
                </g>
              </svg>
            </div>
          </div>

          {/* 2. FLOR CENTRO-IZQUIERDA (Crece poco a poco y luego se difumina) */}
          <div
            className="absolute bottom-0 left-[22%] sm:left-[24%] origin-bottom"
            style={{
              animation: 'web-flower-grow-fade 8.5s cubic-bezier(0.22, 1, 0.36, 1) 0.45s 1 both',
            }}
          >
            <svg width="78" height="98" viewBox="0 0 78 98">
              <path
                d="M38 98 Q26 68 42 36"
                stroke="#16A34A"
                strokeWidth="2.8"
                fill="none"
                strokeLinecap="round"
              />
              <path d="M35 72 C18 66, 14 54, 28 56 C34 57, 36 65, 35 72 Z" fill="#4ADE80" />
              <path d="M37 54 C52 48, 56 36, 44 38 C38 40, 36 47, 37 54 Z" fill="#22C55E" />
              {/* Flor Girasol / Margarita Dorada con 10 Pétalos */}
              <g transform="translate(42, 32)">
                {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg) => (
                  <path
                    key={`p2-${deg}`}
                    d="M0 0 C-4 -5, -4.5 -14, 0 -16 C4.5 -14, 4 -5, 0 0 Z"
                    fill="#FBBF24"
                    stroke="#D97706"
                    strokeWidth="0.4"
                    transform={`rotate(${deg})`}
                  />
                ))}
                <circle cx="0" cy="0" r="5" fill="#9A3412" />
                <circle cx="0" cy="0" r="2.8" fill="#F59E0B" />
              </g>
            </svg>
          </div>

          {/* 3. FLOR CENTRAL (Crece poco a poco y luego se difumina) */}
          <div
            className="absolute bottom-0 left-[46%] sm:left-[48%] origin-bottom"
            style={{
              animation: 'web-flower-grow-fade 9.2s cubic-bezier(0.22, 1, 0.36, 1) 0.85s 1 both',
            }}
          >
            <svg width="80" height="106" viewBox="0 0 80 106">
              <path
                d="M40 106 Q52 72 36 38"
                stroke="#15803D"
                strokeWidth="2.9"
                fill="none"
                strokeLinecap="round"
              />
              <path d="M43 76 C26 70, 20 58, 34 60 C40 61, 43 69, 43 76 Z" fill="#22C55E" />
              <path d="M41 58 C56 52, 62 40, 48 42 C42 43, 40 51, 41 58 Z" fill="#4ADE80" />
              {/* Flor Violeta Primavera con 8 Pétalos Dobles */}
              <g transform="translate(36, 34)">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                  <path
                    key={`p3-out-${deg}`}
                    d="M0 0 C-4.8 -5.5, -5.5 -15, 0 -17 C5.5 -15, 4.8 -5.5, 0 0 Z"
                    fill="#9333EA"
                    stroke="#6B21A8"
                    strokeWidth="0.4"
                    transform={`rotate(${deg})`}
                  />
                ))}
                {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((deg) => (
                  <path
                    key={`p3-in-${deg}`}
                    d="M0 0 C-3.2 -4, -3.8 -11, 0 -12.5 C3.8 -11, 3.2 -4, 0 0 Z"
                    fill="#C084FC"
                    transform={`rotate(${deg})`}
                  />
                ))}
                <circle cx="0" cy="0" r="4.6" fill="#FACC15" />
                <circle cx="0" cy="0" r="2.4" fill="#FEF08A" />
              </g>
            </svg>
          </div>

          {/* 4. FLOR CENTRO-DERECHA (Crece poco a poco y luego se difumina) */}
          <div
            className="absolute bottom-0 left-[70%] sm:left-[72%] origin-bottom"
            style={{
              animation: 'web-flower-grow-fade 8.8s cubic-bezier(0.22, 1, 0.36, 1) 0.6s 1 both',
            }}
          >
            <svg width="78" height="98" viewBox="0 0 78 98">
              <path
                d="M40 98 Q28 68 44 36"
                stroke="#16A34A"
                strokeWidth="2.8"
                fill="none"
                strokeLinecap="round"
              />
              <path d="M36 70 C20 64, 16 52, 30 54 C35 55, 37 63, 36 70 Z" fill="#22C55E" />
              {/* Flor Coral / Rosa con 8 Pétalos */}
              <g transform="translate(44, 32)">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                  <path
                    key={`p4-${deg}`}
                    d="M0 0 C-4.5 -5, -5 -14, 0 -16 C5 -14, 4.5 -5, 0 0 Z"
                    fill="#FB7185"
                    stroke="#E11D48"
                    strokeWidth="0.4"
                    transform={`rotate(${deg})`}
                  />
                ))}
                <circle cx="0" cy="0" r="4.5" fill="#F59E0B" />
                <circle cx="0" cy="0" r="2.5" fill="#FEF08A" />
              </g>
            </svg>
          </div>

          {/* 5. FLOR DE LA DERECHA (Crece poco a poco y luego se difumina) */}
          <div
            className="absolute bottom-0 right-4 sm:right-8 origin-bottom"
            style={{
              animation: 'web-flower-grow-fade 9.6s cubic-bezier(0.22, 1, 0.36, 1) 1.05s 1 both',
            }}
          >
            <svg width="84" height="114" viewBox="0 0 84 114">
              <path
                d="M44 114 Q30 76 48 44 Q54 32 42 22"
                stroke="#15803D"
                strokeWidth="3.1"
                fill="none"
                strokeLinecap="round"
              />
              <path d="M40 84 C58 78, 66 64, 50 66 C42 67, 40 76, 40 84 Z" fill="#22C55E" />
              <path d="M43 60 C26 54, 20 42, 34 44 C41 45, 43 53, 43 60 Z" fill="#4ADE80" />
              {/* Flor Carmesí / Magenta con Pétalos Dobles */}
              <g transform="translate(42, 22)">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                  <path
                    key={`p5-out-${deg}`}
                    d="M0 0 C-5 -6, -6 -16, 0 -18 C6 -16, 5 -6, 0 0 Z"
                    fill="#E11D48"
                    stroke="#9F1239"
                    strokeWidth="0.4"
                    transform={`rotate(${deg})`}
                  />
                ))}
                {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((deg) => (
                  <path
                    key={`p5-in-${deg}`}
                    d="M0 0 C-3.5 -4, -4 -11.5, 0 -13 C4 -11.5, 3.5 -4, 0 0 Z"
                    fill="#FDA4AF"
                    transform={`rotate(${deg})`}
                  />
                ))}
                <circle cx="0" cy="0" r="4.8" fill="#FACC15" />
                <circle cx="0" cy="0" r="2.6" fill="#FEF08A" />
              </g>
            </svg>
          </div>
        </div>
      )}

      {/* =====================================================================
          10. PARTÍCULAS CAYENDO / FLOTANDO (CAPA SUPERIOR Z-[9999] — SOLO 2 CICLOS)
         ===================================================================== */}
      {effectiveTheme !== 'halloween' &&
        visibleParticles.map((spec) => {
          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${spec.leftPercent}%`,
            top: 0,
            animation:
              effectiveTheme === 'primavera'
                ? `web-spring-rise ${spec.duration}s linear ${spec.delay}s 2 both`
                : `web-fall ${spec.duration}s linear ${spec.delay}s 2 both`,
            ['--sway-x' as any]: `${spec.swayAmp * (spec.variant % 2 === 0 ? 1 : -1)}px`,
            ['--rot-z' as any]: `${120 + spec.variant * 40}deg`,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
          };

          return (
            <div key={`${effectiveTheme}-${spec.id}`} style={style}>
              {/* DÍA DE MUERTOS: Flor Completa de Cempasúchil */}
              {effectiveTheme === 'dia_muertos' && (
                <svg width={32 * spec.scale} height={32 * spec.scale} viewBox="0 0 40 40">
                  <circle cx="20.8" cy="21.2" r="14" fill="rgba(0,0,0,0.22)" />
                  {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                    <path
                      key={deg}
                      d="M20 20 C16.5 11, 15.5 4.5, 18.2 3.5 C19.3 3, 20.7 3, 21.8 3.5 C24.5 4.5, 23.5 11, 20 20 Z"
                      fill="#F97316"
                      stroke="#EA580C"
                      strokeWidth="0.4"
                      transform={`rotate(${deg} 20 20)`}
                    />
                  ))}
                  {[15, 60, 105, 150, 195, 240, 285, 330].map((deg) => (
                    <path
                      key={deg}
                      d="M20 20 C17.2 13, 16.5 8, 18.6 7 C19.5 6.5, 20.5 6.5, 21.4 7 C23.5 8, 22.8 13, 20 20 Z"
                      fill="#FACC15"
                      transform={`rotate(${deg} 20 20)`}
                    />
                  ))}
                  <circle cx="20" cy="20" r="3.4" fill="#EA580C" />
                </svg>
              )}

              {/* NAVIDAD: Cristales Dendríticos & Bokeh */}
              {effectiveTheme === 'navidad' && (
                spec.depth === 'near' && spec.variant === 0 ? (
                  <svg width={28 * spec.scale} height={28 * spec.scale} viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="13" fill="rgba(224, 242, 254, 0.6)" />
                    <circle cx="16" cy="16" r="7" fill="rgba(255, 255, 255, 0.9)" />
                  </svg>
                ) : (
                  <svg width={26 * spec.scale} height={26 * spec.scale} viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="11" fill="rgba(224,242,254,0.25)" />
                    <g stroke="#FFFFFF" strokeLinecap="round" strokeWidth="1.4">
                      <line x1="16" y1="3" x2="16" y2="29" />
                      <line x1="4.7" y1="9.5" x2="27.3" y2="22.5" />
                      <line x1="27.3" y1="9.5" x2="4.7" y2="22.5" />
                    </g>
                    <circle cx="16" cy="16" r="2.2" fill="#FFFFFF" />
                  </svg>
                )
              )}

              {/* SAN VALENTÍN: Corazones Rubí y Pétalos */}
              {effectiveTheme === 'san_valentin' && (
                spec.variant % 2 === 0 ? (
                  <svg width={26 * spec.scale} height={26 * spec.scale} viewBox="0 0 32 32">
                    <path
                      d="M16 27 C16 27, 4 19.5, 4 10.5 C4 6, 7.5 3, 11.5 3 C14 3, 16 5, 16 7 C16 5, 18 3, 20.5 3 C24.5 3, 28 6, 28 10.5 C28 19.5, 16 27, 16 27 Z"
                      fill="#E11D48"
                    />
                    <ellipse cx="10" cy="8.5" rx="2.8" ry="1.6" fill="rgba(255,255,255,0.55)" transform="rotate(-30 10 8.5)" />
                  </svg>
                ) : (
                  <svg width={24 * spec.scale} height={24 * spec.scale} viewBox="0 0 32 32">
                    <path
                      d="M16 27 C6 22, 3 11, 9 5.5 C12 3, 15 5.5, 16 7 C17 5.5, 20 3, 23 5.5 C29 11, 26 22, 16 27 Z"
                      fill="#FB7185"
                    />
                  </svg>
                )
              )}

              {/* DÍA DE LAS MADRES: Botones de Rosas Rojas */}
              {effectiveTheme === 'dia_madres' && (
                <svg width={28 * spec.scale} height={28 * spec.scale} viewBox="0 0 40 40">
                  <path d="M8 14 Q4 8 11 10 Z M32 14 Q36 8 29 10 Z" fill="#16A34A" />
                  {[0, 72, 144, 216, 288].map((deg) => (
                    <path
                      key={deg}
                      d="M20 20 C11 17, 7 8, 15 6 C18 5, 22 5, 25 6 C33 8, 29 17, 20 20 Z"
                      fill="#E11D48"
                      stroke="#881337"
                      strokeWidth="0.4"
                      transform={`rotate(${deg} 20 20)`}
                    />
                  ))}
                  <circle cx="20" cy="19.5" r="5" fill="#9F1239" />
                </svg>
              )}

              {/* DÍA DEL PADRE: Mostachos Imperiales, Moños y Navajas */}
              {effectiveTheme === 'dia_padre' && (
                spec.variant === 0 ? (
                  <svg width={30 * spec.scale} height={30 * spec.scale} viewBox="0 0 36 36">
                    <path
                      d="M18 19 C15 15, 10 14, 6 18 C3 21, 1 19, 2 16 C3 14, 5 16, 6 15 C9 11, 15 11, 18 15 C21 11, 27 11, 30 15 C31 16, 33 14, 34 16 C35 19, 33 21, 30 18 C26 14, 21 15, 18 19 Z"
                      fill="#451A03"
                      stroke="#F59E0B"
                      strokeWidth="0.7"
                    />
                  </svg>
                ) : spec.variant === 1 ? (
                  <svg width={28 * spec.scale} height={28 * spec.scale} viewBox="0 0 36 36">
                    <path
                      d="M16 18 L5 11 C3 14, 3 22, 5 25 L16 18 Z M20 18 L31 11 C33 14, 33 22, 31 25 L20 18 Z"
                      fill="#0F172A"
                      stroke="#C5A880"
                      strokeWidth="0.8"
                    />
                    <rect x="15" y="14.5" width="6" height="7" rx="2" fill="#C5A880" />
                  </svg>
                ) : (
                  <svg width={28 * spec.scale} height={28 * spec.scale} viewBox="0 0 36 36">
                    <path d="M6 22 L22 10 L25 13 L9 25 Z" fill="#E2E8F0" stroke="#475569" strokeWidth="0.7" />
                    <path d="M18 14 C24 16, 30 22, 32 27 C29 29, 23 23, 17 17 Z" fill="#78350F" stroke="#F59E0B" strokeWidth="0.7" />
                  </svg>
                )
              )}

              {/* FIESTAS PATRIAS: Serpentinas y Escarapelas Tricolores */}
              {effectiveTheme === 'patrias' && (
                spec.variant === 1 ? (
                  <svg width={26 * spec.scale} height={26 * spec.scale} viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="10" fill="#006847" />
                    <circle cx="16" cy="16" r="6.8" fill="#FFFFFF" />
                    <circle cx="16" cy="16" r="3.8" fill="#CE1126" />
                  </svg>
                ) : (
                  <svg width={26 * spec.scale} height={26 * spec.scale} viewBox="0 0 32 32">
                    <path
                      d="M5 4 Q16 2 22 9 Q28 16 18 22 Q10 27 20 30 L14 31 Q4 27 12 20 Q21 14 15 8 Q10 4 5 4 Z"
                      fill={spec.variant === 0 ? '#10B981' : '#EF4444'}
                    />
                  </svg>
                )
              )}

              {/* PRIMAVERA: Mariposas y Flores Flotando */}
              {effectiveTheme === 'primavera' && (
                <svg width={24 * spec.scale} height={24 * spec.scale} viewBox="0 0 28 28">
                  <path
                    d="M14 14 C8 6, 2 8, 5 15 C2 20, 8 23, 14 16 C20 23, 26 20, 23 15 C26 8, 20 6, 14 14 Z"
                    fill={spec.variant % 2 === 0 ? '#F472B6' : '#4ADE80'}
                    opacity={0.9}
                  />
                </svg>
              )}

              {/* AÑO NUEVO: Destellos Estelares */}
              {effectiveTheme === 'ano_nuevo' && (
                <svg width={22 * spec.scale} height={22 * spec.scale} viewBox="0 0 28 28">
                  <path
                    d="M14 2 C14.6 11, 15 13.4, 26 14 C15 14.6, 14.6 17, 14 26 C13.4 17, 13 14.6, 2 14 C13 13.4, 13.4 11, 14 2 Z"
                    fill="#FEF08A"
                  />
                </svg>
              )}
            </div>
          );
        })}
    </div>
  );
}

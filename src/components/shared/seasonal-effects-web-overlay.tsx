'use client';

import React, { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const SeasonalEffectsCanvas = dynamic(
  () => import('./seasonal-effects-canvas').then((m) => m.SeasonalEffectsCanvas),
  { ssr: false }
);

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

const DEFAULT_CONFIG: TemporadaAppConfig = {
  activo: true,
  mostrarEnApp: true,
  mostrarEnWeb: true,
  mostrarEnAgenda: true,
  modo: 'automatico',
  temaForzado: 'halloween',
  intensidad: 'sutil',
};

function normalizeSeasonalConfig(data: any): TemporadaAppConfig | null {
  const raw = data?.temporada_config || data?.pase_alfa?.temporada_config;
  if (!raw) return null;

  const savedTheme =
    raw.temaForzado === 'buen_fin' || raw.temaForzado === 'aniversario'
      ? 'halloween'
      : raw.temaForzado || 'halloween';

  return {
    activo: raw.activo !== undefined ? Boolean(raw.activo) : true,
    mostrarEnApp: raw.mostrarEnApp !== undefined ? Boolean(raw.mostrarEnApp) : true,
    mostrarEnWeb: raw.mostrarEnWeb !== undefined ? Boolean(raw.mostrarEnWeb) : true,
    mostrarEnAgenda: raw.mostrarEnAgenda !== undefined ? Boolean(raw.mostrarEnAgenda) : true,
    modo: raw.modo === 'manual' ? 'manual' : 'automatico',
    temaForzado: savedTheme,
    intensidad: raw.intensidad === 'normal' ? 'normal' : 'sutil',
  };
}

export function SeasonalEffectsWebOverlay({
  initialConfig,
}: {
  initialConfig?: TemporadaAppConfig | null;
} = {}) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  const [config, setConfig] = useState<TemporadaAppConfig>(initialConfig ?? DEFAULT_CONFIG);

  const isAgendaOrAdmin = Boolean(
    pathname?.startsWith('/agenda') ||
      pathname?.startsWith('/settings') ||
      pathname?.startsWith('/ventas') ||
      pathname?.startsWith('/sales') ||
      pathname?.startsWith('/clientes') ||
      pathname?.startsWith('/clients') ||
      pathname?.startsWith('/productos') ||
      pathname?.startsWith('/products') ||
      pathname?.startsWith('/reportes') ||
      pathname?.startsWith('/reports') ||
      pathname?.startsWith('/finanzas') ||
      pathname?.startsWith('/administracion') ||
      pathname?.startsWith('/admin') ||
      pathname?.startsWith('/caja') ||
      pathname?.startsWith('/comisiones')
  );

  useEffect(() => {
    setMounted(true);

    // En páginas públicas usar el config del servidor directamente; evitar streams WebChannel (onSnapshot)
    if (!isAgendaOrAdmin && initialConfig) {
      return;
    }

    let isCancelled = false;
    let unsubscribe = () => {};

    (async () => {
      try {
        const [{ db }, firestore] = await Promise.all([
          import('@/lib/firebase-client'),
          import('firebase/firestore'),
        ]);
        if (isCancelled || !db) return;

        const docRef = firestore.doc(db, 'configuracion', 'app_movil');

        if (isAgendaOrAdmin) {
          unsubscribe = firestore.onSnapshot(
            docRef,
            (snap) => {
              if (!isCancelled && snap.exists()) {
                const normalized = normalizeSeasonalConfig(snap.data());
                if (normalized) setConfig(normalized);
              }
            },
            (err) => {
              console.warn('Error escuchando temporada_config en web:', err);
            }
          );
        } else {
          const snap = await firestore.getDoc(docRef);
          if (!isCancelled && snap.exists()) {
            const normalized = normalizeSeasonalConfig(snap.data());
            if (normalized) setConfig(normalized);
          }
        }
      } catch (err) {
        console.warn('Error cargando temporada_config en web:', err);
      }
    })();

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [isAgendaOrAdmin, initialConfig]);

  const autoTheme = useMemo(() => detectAutoSeason(new Date()), []);

  const effectiveTheme: TemaTemporadaId = useMemo(() => {
    if (!config.activo) return 'ninguno';
    if (config.modo === 'manual') return config.temaForzado;
    return autoTheme;
  }, [config, autoTheme]);

  // Channel checking: Agenda (Staff/Recepción) vs Página Web (Portal Clientes)
  const shouldRenderOnCurrentRoute = useMemo(() => {
    if (!config.activo) return false;
    if (isAgendaOrAdmin) {
      return config.mostrarEnAgenda !== false;
    }
    return config.mostrarEnWeb !== false;
  }, [config, isAgendaOrAdmin]);

  if (!mounted || effectiveTheme === 'ninguno' || !shouldRenderOnCurrentRoute) {
    return null;
  }

  return (
    <SeasonalEffectsCanvas
      effectiveTheme={effectiveTheme}
      intensidad={config.intensidad}
    />
  );
}

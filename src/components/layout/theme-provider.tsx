'use client';

import { createContext, useContext, useMemo, ReactNode, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const AdminThemeSync = dynamic(
  () => import('./admin-theme-sync').then((m) => m.AdminThemeSync),
  { ssr: false }
);

interface ThemeColors {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  foreground: string;
  cardColor: string;
  goldColor?: string;
  buttonNavyColor?: string;
  accentBlueColor?: string;
  dangerColor?: string;
  headerDarkColor?: string;
  agendaReservadoColor?: string;
  agendaConfirmadoColor?: string;
  agendaEnEsperaColor?: string;
  agendaAsisteColor?: string;
  agendaNoAsisteColor?: string;
  agendaPendienteColor?: string;
  agendaPagoCompletoColor?: string;
  agendaAnticipoColor?: string;
  agendaCanceladoColor?: string;
}

interface ThemeContextType {
  setThemeColors: (colors: Partial<ThemeColors>) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function hexToHsl(hex: string): string {
  if (!hex) return '0 0% 0%';
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0% 0%';

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const HSL_VAR_MAP: Array<[keyof ThemeColors, string]> = [
  ['primaryColor', '--primary'],
  ['secondaryColor', '--secondary'],
  ['accentColor', '--accent'],
  ['backgroundColor', '--background'],
  ['foreground', '--foreground'],
  ['cardColor', '--card'],
  ['goldColor', '--gold'],
  ['buttonNavyColor', '--button-navy'],
  ['accentBlueColor', '--accent-blue'],
  ['dangerColor', '--danger-soft'],
  ['headerDarkColor', '--header-dark'],
];

const RAW_VAR_MAP: Array<[keyof ThemeColors, string]> = [
  ['agendaReservadoColor', '--agenda-reservado'],
  ['agendaConfirmadoColor', '--agenda-confirmado'],
  ['agendaEnEsperaColor', '--agenda-en-espera'],
  ['agendaAsisteColor', '--agenda-asiste'],
  ['agendaNoAsisteColor', '--agenda-no-asiste'],
  ['agendaPendienteColor', '--agenda-pendiente'],
  ['agendaPagoCompletoColor', '--agenda-pago-completo'],
  ['agendaAnticipoColor', '--agenda-anticipo'],
  ['agendaCanceladoColor', '--agenda-cancelado'],
];

function applyThemeToRoot(colors: Partial<ThemeColors>) {
  if (typeof document === 'undefined' || !colors) return;
  const root = document.documentElement;
  for (const [key, cssVar] of HSL_VAR_MAP) {
    const val = colors[key];
    if (val) root.style.setProperty(cssVar, hexToHsl(val));
  }
  for (const [key, cssVar] of RAW_VAR_MAP) {
    const val = colors[key];
    if (val) root.style.setProperty(cssVar, val);
  }
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: Partial<ThemeColors> | null;
}) {
  const pathname = usePathname() || '';
  const isPublicPage =
    pathname === '/' ||
    pathname.startsWith('/reservar') ||
    pathname.startsWith('/reserva') ||
    pathname === '/privacidad' ||
    pathname === '/terminos' ||
    pathname === '/agenda/display' ||
    pathname.startsWith('/cita') ||
    pathname.startsWith('/promociones') ||
    pathname.startsWith('/blog') ||
    pathname.startsWith('/auth/mobile-google');

  useEffect(() => {
    if (initialTheme) {
      applyThemeToRoot(initialTheme);
    }
  }, [initialTheme]);

  useEffect(() => {
    if (isPublicPage) return;
    import('@/lib/notification-sound')
      .then((m) => m.initAudioUnlock())
      .catch(() => {});
  }, [isPublicPage]);

  const setThemeColors = useCallback((colors: Partial<ThemeColors>) => {
    applyThemeToRoot(colors);
  }, []);

  const value = useMemo(
    () => ({
      setThemeColors,
    }),
    [setThemeColors]
  );

  const shouldSyncFromFirestore = !isPublicPage || !initialTheme;

  return (
    <ThemeContext.Provider value={value}>
      {shouldSyncFromFirestore && <AdminThemeSync applyTheme={applyThemeToRoot} />}
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

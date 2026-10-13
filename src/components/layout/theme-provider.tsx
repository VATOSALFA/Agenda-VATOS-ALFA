
'use client';

import { createContext, useContext, useState, useMemo, ReactNode, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { initAudioUnlock } from '@/lib/notification-sound';

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

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100);

    return `${h} ${s}% ${l}%`;
}


export function ThemeProvider({ children }: { children: ReactNode }) {
    const { data: empresaData, loading } = useFirestoreQuery<any>('empresa', 'main');

    useEffect(() => {
        initAudioUnlock();
    }, []);

    useEffect(() => {
        if (!loading && empresaData.length > 0) {
            // Find the first document that has a theme property, or default to the first one
            const companyDoc = empresaData.find((d: any) => d.theme) || empresaData[0];

            if (companyDoc && companyDoc.theme) {
                const theme = companyDoc.theme;
                const root = document.documentElement;
                if (theme.primaryColor) root.style.setProperty('--primary', hexToHsl(theme.primaryColor));
                if (theme.secondaryColor) root.style.setProperty('--secondary', hexToHsl(theme.secondaryColor));
                if (theme.accentColor) root.style.setProperty('--accent', hexToHsl(theme.accentColor));
                if (theme.backgroundColor) root.style.setProperty('--background', hexToHsl(theme.backgroundColor));
                if (theme.foreground) root.style.setProperty('--foreground', hexToHsl(theme.foreground));
                if (theme.cardColor) root.style.setProperty('--card', hexToHsl(theme.cardColor));
                if (theme.goldColor) root.style.setProperty('--gold', hexToHsl(theme.goldColor));
                if (theme.buttonNavyColor) root.style.setProperty('--button-navy', hexToHsl(theme.buttonNavyColor));
                if (theme.accentBlueColor) root.style.setProperty('--accent-blue', hexToHsl(theme.accentBlueColor));
                if (theme.dangerColor) root.style.setProperty('--danger-soft', hexToHsl(theme.dangerColor));
                if (theme.headerDarkColor) root.style.setProperty('--header-dark', hexToHsl(theme.headerDarkColor));
                if (theme.agendaReservadoColor) root.style.setProperty('--agenda-reservado', theme.agendaReservadoColor);
                if (theme.agendaConfirmadoColor) root.style.setProperty('--agenda-confirmado', theme.agendaConfirmadoColor);
                if (theme.agendaEnEsperaColor) root.style.setProperty('--agenda-en-espera', theme.agendaEnEsperaColor);
                if (theme.agendaAsisteColor) root.style.setProperty('--agenda-asiste', theme.agendaAsisteColor);
                if (theme.agendaNoAsisteColor) root.style.setProperty('--agenda-no-asiste', theme.agendaNoAsisteColor);
                if (theme.agendaPendienteColor) root.style.setProperty('--agenda-pendiente', theme.agendaPendienteColor);
                if (theme.agendaPagoCompletoColor) root.style.setProperty('--agenda-pago-completo', theme.agendaPagoCompletoColor);
                if (theme.agendaAnticipoColor) root.style.setProperty('--agenda-anticipo', theme.agendaAnticipoColor);
                if (theme.agendaCanceladoColor) root.style.setProperty('--agenda-cancelado', theme.agendaCanceladoColor);
            }
        }
    }, [empresaData, loading]);

    const setThemeColors = (colors: Partial<ThemeColors>) => {
        const root = document.documentElement;
        if (colors.primaryColor) root.style.setProperty('--primary', hexToHsl(colors.primaryColor));
        if (colors.secondaryColor) root.style.setProperty('--secondary', hexToHsl(colors.secondaryColor));
        if (colors.accentColor) root.style.setProperty('--accent', hexToHsl(colors.accentColor));
        if (colors.backgroundColor) root.style.setProperty('--background', hexToHsl(colors.backgroundColor));
        if (colors.foreground) root.style.setProperty('--foreground', hexToHsl(colors.foreground));
        if (colors.cardColor) root.style.setProperty('--card', hexToHsl(colors.cardColor));
        if (colors.goldColor) root.style.setProperty('--gold', hexToHsl(colors.goldColor));
        if (colors.buttonNavyColor) root.style.setProperty('--button-navy', hexToHsl(colors.buttonNavyColor));
        if (colors.accentBlueColor) root.style.setProperty('--accent-blue', hexToHsl(colors.accentBlueColor));
        if (colors.dangerColor) root.style.setProperty('--danger-soft', hexToHsl(colors.dangerColor));
        if (colors.headerDarkColor) root.style.setProperty('--header-dark', hexToHsl(colors.headerDarkColor));
        if (colors.agendaReservadoColor) root.style.setProperty('--agenda-reservado', colors.agendaReservadoColor);
        if (colors.agendaConfirmadoColor) root.style.setProperty('--agenda-confirmado', colors.agendaConfirmadoColor);
        if (colors.agendaEnEsperaColor) root.style.setProperty('--agenda-en-espera', colors.agendaEnEsperaColor);
        if (colors.agendaAsisteColor) root.style.setProperty('--agenda-asiste', colors.agendaAsisteColor);
        if (colors.agendaNoAsisteColor) root.style.setProperty('--agenda-no-asiste', colors.agendaNoAsisteColor);
        if (colors.agendaPendienteColor) root.style.setProperty('--agenda-pendiente', colors.agendaPendienteColor);
        if (colors.agendaPagoCompletoColor) root.style.setProperty('--agenda-pago-completo', colors.agendaPagoCompletoColor);
        if (colors.agendaAnticipoColor) root.style.setProperty('--agenda-anticipo', colors.agendaAnticipoColor);
        if (colors.agendaCanceladoColor) root.style.setProperty('--agenda-cancelado', colors.agendaCanceladoColor);
    };

    const value = useMemo(() => ({
        setThemeColors,
    }), []);

    return (
        <ThemeContext.Provider value={value}>
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

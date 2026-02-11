
'use client';

import { createContext, useContext, useState, useMemo, ReactNode, useEffect } from 'react';
import { useFirestoreQuery } from '@/hooks/use-firestore';
import { useAuth } from '@/contexts/firebase-auth-context';

interface ThemeColors {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    foreground: string;
    cardColor: string;
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

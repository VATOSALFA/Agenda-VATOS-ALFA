'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ShieldCheck, 
  FileText, 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  Mail 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LegalPageShellProps {
  activeTab: 'privacidad' | 'terminos';
  title: string;
  subtitle: string;
  badgeText: string;
  lastUpdated?: string;
  companyName?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyAddress?: string;
  children: React.ReactNode;
}

/**
 * Formateador de texto legal que detecta capítulos, subtítulos y viñetas
 * para dotar a los textos jurídicos de una jerarquía visual premium y moderna.
 */
export function LegalTextFormatter({ text }: { text: string }) {
  if (!text) return null;

  // Dividir el texto en bloques de párrafos
  const paragraphs = text.split(/\n\s*\n/);

  return (
    <div className="space-y-6 text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
      {paragraphs.map((para, idx) => {
        const trimmed = para.trim();
        if (!trimmed) return null;

        // Detectar si el bloque comienza con un encabezado de Capítulo o Título Mayor
        const isChapter = /^(CAPÍTULO|TITULO|TÍTULO)\s+[IVXLCDM\d]+/i.test(trimmed);
        const isNumberedSection = /^(\d+\.\s+[A-ZÁÉÍÓÚÑ\s]{3,})/i.test(trimmed);
        const isAllUppercaseHeader = trimmed.length < 90 && trimmed === trimmed.toUpperCase() && !trimmed.includes('.') && !trimmed.startsWith('-');

        if (isChapter || isNumberedSection || isAllUppercaseHeader) {
          const lines = trimmed.split('\n');
          const headerLine = lines[0];
          const remainingLines = lines.slice(1).join('\n');

          return (
            <div key={idx} className="pt-4 first:pt-0">
              <div className="border-l-4 border-blue-500 pl-3.5 py-1 mb-3 bg-blue-500/5 rounded-r-lg">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  {headerLine}
                </h2>
              </div>
              {remainingLines && (
                <div className="whitespace-pre-line pl-1 space-y-2">
                  {remainingLines}
                </div>
              )}
            </div>
          );
        }

        // Detectar si son listas de viñetas
        const isBulletList = trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.includes('\n- ') || trimmed.includes('\n• ');
        if (isBulletList) {
          const lines = trimmed.split('\n');
          return (
            <div key={idx} className="space-y-1.5 pl-2">
              {lines.map((line, lIdx) => {
                const cleanLine = line.trim();
                if (cleanLine.startsWith('- ') || cleanLine.startsWith('• ')) {
                  return (
                    <div key={lIdx} className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300 text-xs sm:text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                      <span>{cleanLine.replace(/^[-•]\s*/, '')}</span>
                    </div>
                  );
                }
                return (
                  <p key={lIdx} className="font-semibold text-slate-900 dark:text-white text-xs sm:text-sm pt-1">
                    {cleanLine}
                  </p>
                );
              })}
            </div>
          );
        }

        // Párrafo estándar
        return (
          <p key={idx} className="whitespace-pre-line">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export function LegalPageShell({
  activeTab,
  title,
  subtitle,
  badgeText,
  lastUpdated = 'Octubre 2026',
  companyName = 'VATOS ALFA Barber Shop',
  companyEmail = 'vatosalfa.adm@gmail.com',
  companyPhone = '442 405 4509',
  companyAddress = 'Av. Sombrerete 1001, Col. Cipreses, Querétaro, Qro.',
  children,
}: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] text-foreground flex flex-col font-sans">
      
      {/* 1. Header Oficial de Navegación VATOS ALFA */}
      <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          
          {/* Logo y Nombre de Marca */}
          <div className="flex items-center gap-3">
            <Link href="/" prefetch={false} className="flex items-center gap-2.5 group">
              <Image 
                src="/logo-v-400x400.webp" 
                alt="VATOS ALFA" 
                width={36}
                height={36}
                priority
                className="h-9 w-9 rounded-full object-cover border border-slate-300 aspect-square group-hover:scale-105 transition-transform" 
              />
              <span className="font-extrabold text-base tracking-tight text-foreground group-hover:text-blue-500 transition-colors">
                {companyName}
              </span>
            </Link>
          </div>

          {/* Acciones del Header */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link 
              href="/" 
              prefetch={false}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-foreground transition-colors py-1.5 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Volver al Inicio</span>
              <span className="sm:hidden">Inicio</span>
            </Link>

            <Link href="/reservar" prefetch={false}>
              <Button 
                variant="alfa" 
                size="sm" 
                className="h-9 px-3.5 sm:px-4 text-xs font-bold rounded-xl shadow-[0_4px_15px_rgba(32,42,73,0.6)] cursor-pointer"
              >
                Reservar Cita
              </Button>
            </Link>
          </div>

        </div>
      </header>

      {/* 2. Hero Oficial Legal con Franja Azul y Haz de Luz Oblicuo */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white border-b border-[#2d3a60]/60 py-10 sm:py-14 md:py-16 px-4">
        {/* Haz de luz oblicuo animado */}
        <div className="header-light-beam" aria-hidden="true" />

        <div className="container max-w-4xl mx-auto relative z-10 text-center">
          
          {/* Badge Oficial de Confianza Legal */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-300 text-xs font-bold uppercase tracking-wider mb-4 shadow-[0_0_20px_rgba(59,130,246,0.25)]">
            <ShieldCheck className="h-4 w-4 text-[#C5A880] shrink-0" />
            <span>{badgeText}</span>
          </div>

          {/* Título Principal */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white mb-4 leading-tight">
            {title}
          </h1>

          {/* Subtítulo Descriptivo */}
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed font-medium mb-6">
            {subtitle}
          </p>

          {/* Metadatos Rápidos */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-[#C5A880]" />
              <span>Última actualización: <strong className="text-white font-medium">{lastUpdated}</strong></span>
            </span>
            <span className="hidden sm:inline text-slate-700">•</span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-blue-400" />
              <span>Sucursal Sombrerete • Querétaro, México</span>
            </span>
          </div>

        </div>
      </section>

      {/* 3. Selector de Pestañas entre Documentos Legales */}
      <div className="bg-white dark:bg-slate-900 border-b border-border/80 sticky top-16 z-40 shadow-xs">
        <div className="container max-w-4xl mx-auto px-4 flex items-center justify-center">
          <nav className="flex gap-2 sm:gap-4 py-2.5 overflow-x-auto scrollbar-none" aria-label="Navegación legal">
            <Link
              href="/privacidad"
              prefetch={false}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0",
                activeTab === 'privacidad'
                  ? "bg-[#202A49] text-white shadow-md border border-[#2d3a60]"
                  : "text-slate-600 dark:text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <ShieldCheck className={cn("h-4 w-4", activeTab === 'privacidad' ? "text-[#C5A880]" : "text-slate-400")} />
              <span>Aviso de Privacidad</span>
            </Link>

            <Link
              href="/terminos"
              prefetch={false}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0",
                activeTab === 'terminos'
                  ? "bg-[#202A49] text-white shadow-md border border-[#2d3a60]"
                  : "text-slate-600 dark:text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <FileText className={cn("h-4 w-4", activeTab === 'terminos' ? "text-[#C5A880]" : "text-slate-400")} />
              <span>Términos y Condiciones</span>
            </Link>
          </nav>
        </div>
      </div>

      {/* 4. Contenedor Principal del Documento */}
      <main className="flex-1 container max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          
          {/* Cabecera interna del documento */}
          <div className="px-6 py-4 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span>Documento Oficial Vigente y Vinculante</span>
            </div>
            <div className="text-slate-500">
              Querétaro, Qro. &bull; México
            </div>
          </div>

          {/* Cuerpo del Documento */}
          <div className="p-6 sm:p-8 md:p-10">
            {children}
          </div>

          {/* Pie interno del documento con correo oficial */}
          <div className="px-6 py-4 bg-slate-50/60 dark:bg-slate-800/30 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
            <span>{companyName} &bull; Todos los derechos reservados conforme a la legislación mexicana.</span>
            <div className="flex items-center gap-1.5 text-slate-500">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span>Contacto:</span>
              <a 
                href={`mailto:${companyEmail}`}
                className="font-medium text-slate-700 dark:text-slate-300 hover:text-blue-500 hover:underline transition-colors"
              >
                {companyEmail}
              </a>
            </div>
          </div>
        </div>
      </main>

      {/* 6. Footer Oficial */}
      <footer className="py-10 border-t border-border/80 bg-background text-center text-xs text-muted-foreground">
        <div className="container max-w-4xl mx-auto px-4 flex flex-col items-center gap-3">
          <p>© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>
          <div className="flex flex-wrap justify-center gap-5 font-medium">
            <Link href="/" prefetch={false} className="hover:text-foreground transition-colors">
              Inicio
            </Link>
            <Link href="/blog" prefetch={false} className="hover:text-foreground transition-colors">
              Blog
            </Link>
            <Link href="/privacidad" prefetch={false} className="hover:text-foreground transition-colors font-semibold text-foreground">
              Aviso de Privacidad
            </Link>
            <Link href="/terminos" prefetch={false} className="hover:text-foreground transition-colors font-semibold text-foreground">
              Términos y Condiciones
            </Link>
            <Link href="/login" prefetch={false} className="hover:text-foreground transition-colors">
              Acceso Staff
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}

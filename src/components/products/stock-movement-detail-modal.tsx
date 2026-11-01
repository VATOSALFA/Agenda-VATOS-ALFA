'use client';

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { 
  Boxes, 
  X, 
  ArrowRight, 
  Calendar, 
  User, 
  Store, 
  Tag, 
  MessageSquare,
  Hash
} from 'lucide-react';
import type { StockMovement } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StockMovementDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  movement: StockMovement | null;
}

export function StockMovementDetailModal({
  isOpen,
  onOpenChange,
  movement,
}: StockMovementDetailModalProps) {
  if (!movement) return null;

  const date = movement.date instanceof Timestamp
    ? movement.date.toDate()
    : new Date(movement.date || Date.now());

  const diff = (movement.to || 0) - (movement.from || 0);
  const isPositive = diff > 0;
  const isNeutral = diff === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={true}
        className="w-[95vw] sm:w-full max-w-lg max-h-[90dvh] sm:max-h-[88vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-background"
      >
        {/* Cabecera Oficial VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Boxes className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Detalle del Movimiento
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 mt-0.5">
                  Registro completo de auditoría en inventario
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
              aria-label="Cerrar modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Contenido con Scroll Vertical Suave */}
        <div className="p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-4">
          
          {/* 1. Tarjeta Principal: Producto y Ajuste de Stock */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 sm:p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">
                  Producto
                </span>
                <p className="font-bold text-base sm:text-lg text-foreground leading-snug">
                  {movement.product_name || 'Producto desconocido'}
                </p>
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0 font-medium">
                {movement.concepto || movement.cause || 'Ajuste'}
              </Badge>
            </div>

            {/* Visualización del Flujo de Stock */}
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="text-center">
                  <span className="text-[10px] text-muted-foreground block">Anterior</span>
                  <span className="text-base sm:text-lg font-bold text-foreground/80 font-sans">
                    {movement.from}
                  </span>
                </div>

                <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />

                <div className="text-center">
                  <span className="text-[10px] text-muted-foreground block">Nuevo</span>
                  <span className="text-base sm:text-lg font-black text-foreground font-sans">
                    {movement.to}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-muted-foreground block mb-0.5">Variación</span>
                <span
                  className={cn(
                    "inline-flex items-center text-xs font-bold px-2 py-1 rounded-md font-sans",
                    isPositive
                      ? "text-blue-400 bg-blue-500/10 border border-blue-500/20"
                      : isNeutral
                      ? "text-slate-400 bg-muted/40 border border-border/60"
                      : "text-red-400 bg-red-500/10 border border-red-500/20"
                  )}
                >
                  {isPositive ? `+${diff}` : `${diff}`} {Math.abs(diff) === 1 ? 'unidad' : 'unidades'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Grid de Metadatos Operativos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Sucursal */}
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Store className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-[11px] uppercase tracking-wider">Sucursal</span>
              </div>
              <p className="text-xs font-medium text-foreground pl-5">
                {movement.local_name || movement.local_id || 'Principal'}
              </p>
            </div>

            {/* Responsable / Staff */}
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-[11px] uppercase tracking-wider">Registrado Por</span>
              </div>
              <p className="text-xs font-medium text-foreground pl-5">
                {movement.staff_name || 'Sistema'}
              </p>
            </div>

            {/* Fecha y Hora */}
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-1 sm:col-span-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-[11px] uppercase tracking-wider">Fecha y Hora Exacta</span>
              </div>
              <p className="text-xs font-medium text-foreground pl-5 capitalize">
                {format(date, "EEEE, dd 'de' MMMM 'de' yyyy • HH:mm:ss", { locale: es })}
              </p>
            </div>

            {/* Motivo / Clasificación si existe */}
            {movement.cause && movement.cause !== movement.concepto && (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-1 sm:col-span-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="font-semibold text-[11px] uppercase tracking-wider">Motivo Operativo</span>
                </div>
                <p className="text-xs font-medium text-foreground pl-5">
                  {movement.cause}
                </p>
              </div>
            )}
          </div>

          {/* 3. Comentario u Observación Completa */}
          <div className="rounded-xl border border-border/60 bg-muted/10 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold text-[11px] uppercase tracking-wider">Comentarios / Observaciones</span>
            </div>
            {movement.comment ? (
              <div className="bg-card/70 border border-border/60 rounded-lg p-3 text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed font-sans">
                {movement.comment}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic pl-5">
                Sin comentarios u observaciones adicionales registradas.
              </p>
            )}
          </div>

          {/* 4. Folio e Identificadores de Auditoría */}
          <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1 font-mono">
              <Hash className="h-3 w-3 text-slate-400 shrink-0" />
              <span>ID Movimiento:</span>
              <span className="text-foreground/80">{movement.id}</span>
            </div>
            {movement.product_id && (
              <div className="flex items-center gap-1 font-mono">
                <span>Prod ID:</span>
                <span className="text-foreground/80">{movement.product_id}</span>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-border/60 bg-muted/20 flex items-center justify-end shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-border/60 text-xs px-4"
          >
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

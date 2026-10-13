'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Palette, Sparkles, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OfficialColorToken {
  id: string;
  name: string;
  hex: string;
  description: string;
  category?: 'alfa' | 'accent' | 'status' | 'neutral';
}

export const VATOS_ALFA_PALETTE: OfficialColorToken[] = [
  {
    id: 'gold',
    name: 'Dorado Pase Alfa',
    hex: '#C5A880',
    description: 'Pase Alfa Club, sellos de lealtad, ALFA COINS e insignias VIP',
    category: 'alfa',
  },
  {
    id: 'button-navy',
    name: 'Azul Botones Alfa',
    hex: '#202A49',
    description: 'Botones principales de acción y barras institucionales',
    category: 'alfa',
  },
  {
    id: 'accent-blue',
    name: 'Azul Acento Móvil',
    hex: '#3B82F6',
    description: 'Bordes de 2px en modales, submenús y saldos positivos',
    category: 'accent',
  },
  {
    id: 'danger',
    name: 'Rojo Negativo / Alertas',
    hex: '#EF4444',
    description: 'Saldos negativos, faltantes de caja, cancelaciones y errores',
    category: 'status',
  },
  {
    id: 'header-dark',
    name: 'Azul Marino Cabeceras',
    hex: '#10172B',
    description: 'Fondo de encabezados de modales oficiales con haz de luz',
    category: 'alfa',
  },
  {
    id: 'secondary-blue',
    name: 'Azul Secundario',
    hex: '#314177',
    description: 'Acentos corporativos y comprobantes',
    category: 'alfa',
  },
  {
    id: 'neutral-slate',
    name: 'Gris Neutro Pizarra',
    hex: '#64748B',
    description: 'Iconos bare y divisores sutiles',
    category: 'neutral',
  },
  {
    id: 'bg-canvas',
    name: 'Fondo Claro Lienzo',
    hex: '#F8F9FC',
    description: 'Superficie de fondo general del portal y LinkPro',
    category: 'neutral',
  },
  {
    id: 'card-white',
    name: 'Blanco Tarjetas',
    hex: '#FFFFFF',
    description: 'Superficie de tarjetas y módulos limpios',
    category: 'neutral',
  },
  {
    id: 'text-dark',
    name: 'Negro Tipográfico',
    hex: '#000000',
    description: 'Contraste para títulos y lectura nítida',
    category: 'neutral',
  },
  {
    id: 'agenda-reservado',
    name: 'Reservado (Agenda)',
    hex: '#93C5FD',
    description: 'Azul citas agendadas por recepción o web',
    category: 'status',
  },
  {
    id: 'agenda-confirmado',
    name: 'Confirmado (Agenda)',
    hex: '#FDE047',
    description: 'Amarillo citas confirmadas por el cliente',
    category: 'status',
  },
  {
    id: 'agenda-en-espera',
    name: 'En Espera (Agenda)',
    hex: '#86EFAC',
    description: 'Verde cliente en recepción esperando turno',
    category: 'status',
  },
  {
    id: 'agenda-asiste',
    name: 'Asiste (Agenda)',
    hex: '#F9A8D4',
    description: 'Rosa cliente en atención en sillón',
    category: 'status',
  },
  {
    id: 'agenda-no-asiste',
    name: 'No Asiste (Agenda)',
    hex: '#FDBA74',
    description: 'Naranja citas no asistidas',
    category: 'status',
  },
  {
    id: 'agenda-pendiente',
    name: 'Pendiente de Pago (Agenda)',
    hex: '#FCA5A5',
    description: 'Rojo suave citas con saldo por liquidar',
    category: 'status',
  },
  {
    id: 'agenda-pago-completo',
    name: 'Pago Completo [$] (Agenda)',
    hex: '#22C55E',
    description: 'Verde distintivo de cita liquidada al 100%',
    category: 'status',
  },
  {
    id: 'agenda-anticipo',
    name: 'Anticipo Pagado [A] (Agenda)',
    hex: '#F97316',
    description: 'Naranja distintivo de anticipo abonado',
    category: 'status',
  },
  {
    id: 'agenda-cancelado',
    name: 'Cancelado (Agenda)',
    hex: '#D1D5DB',
    description: 'Gris citas canceladas',
    category: 'neutral',
  },
];

interface ColorPickerProps {
  label: string;
  description?: string;
  color: string;
  onChange: (color: string) => void;
  defaultColor?: string;
}

export function ColorPicker({ label, description, color, onChange, defaultColor }: ColorPickerProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [customHex, setCustomHex] = useState(color);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(color);
    toast({
      title: '¡Copiado!',
      description: `${color.toUpperCase()} copiado al portapapeles.`,
    });
  };

  const handleHexChange = (value: string) => {
    setCustomHex(value);
    // Verificar si es un hex válido (#FFF o #FFFFFF)
    if (/^#([0-9A-F]{3}){1,2}$/i.test(value)) {
      onChange(value);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-border/60 bg-muted/5 hover:bg-muted/15 transition-all">
        {/* Disparador de Popover en el swatch */}
        <PopoverTrigger asChild>
          <button
            type="button"
            className="group relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-border/70 cursor-pointer shadow-2xs shrink-0 transition-transform hover:scale-105 active:scale-95 overflow-hidden flex items-center justify-center"
            style={{ backgroundColor: color }}
            title="Abrir paleta de colores"
          >
            <span className="sr-only">Seleccionar color para {label}</span>
          </button>
        </PopoverTrigger>

        {/* Información de texto */}
        <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setIsOpen(true)}>
          <Label className="text-xs font-semibold text-foreground truncate block cursor-pointer">
            {label}
          </Label>
          {description && (
            <p className="text-[10px] text-muted-foreground truncate hidden sm:block">
              {description}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground font-sans truncate sm:hidden">
            {color.toUpperCase()}
          </p>
        </div>

        {/* Badge Hexadecimal con botón de copiar */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="hidden sm:inline-flex text-[11px] font-sans font-medium uppercase px-2 py-0.5 rounded-md border border-border/60 bg-background/80 hover:bg-muted/40 text-foreground transition-colors cursor-pointer"
          >
            {color}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="h-7 w-7 text-slate-400 hover:text-foreground rounded-lg"
            title="Copiar código hexadecimal"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <PopoverContent
        align="start"
        className="w-72 sm:w-80 p-3 space-y-3 border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]"
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-slate-400" />
              {label}
            </h4>
            {defaultColor && defaultColor.toLowerCase() !== color.toLowerCase() && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(defaultColor);
                  setCustomHex(defaultColor);
                }}
                className="h-6 px-1.5 text-[10px] text-slate-400 hover:text-foreground gap-1"
                title="Restablecer a tono predeterminado"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Restablecer</span>
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Elige un tono oficial de VATOS ALFA o define uno personalizado.
          </p>
        </div>

        {/* Paleta Oficial en cuadrícula de botones rápidos */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Paleta Oficial VATOS ALFA
          </span>
          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
            {VATOS_ALFA_PALETTE.map((preset) => {
              const isSelected = color.toLowerCase() === preset.hex.toLowerCase();
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onChange(preset.hex);
                    setCustomHex(preset.hex);
                  }}
                  className={cn(
                    "flex items-center gap-2 p-1.5 rounded-lg border text-left transition-all",
                    isSelected
                      ? "border-blue-500 bg-blue-500/10 font-semibold"
                      : "border-border/60 hover:bg-muted/40 bg-card"
                  )}
                >
                  <span
                    className="w-4 h-4 rounded-md border border-black/10 shrink-0 shadow-2xs"
                    style={{ backgroundColor: preset.hex }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-foreground truncate leading-tight">
                      {preset.name}
                    </p>
                    <p className="text-[9px] text-muted-foreground uppercase font-sans">
                      {preset.hex}
                    </p>
                  </div>
                  {isSelected && (
                    <Check className="h-3 w-3 text-blue-500 shrink-0 ml-auto" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Input manual de Hex y Selector Nativo */}
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Código Hex / Selector Libre
          </span>
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  onChange(e.target.value);
                  setCustomHex(e.target.value);
                }}
                className="w-8 h-8 p-0.5 rounded-lg border border-border/70 cursor-pointer bg-transparent block"
                title="Abrir selector de color del sistema"
              />
            </div>
            <Input
              value={customHex}
              onChange={(e) => handleHexChange(e.target.value)}
              placeholder="#202A49"
              className="h-8 text-xs font-sans uppercase flex-1"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

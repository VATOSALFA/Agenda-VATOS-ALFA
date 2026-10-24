'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Palette,
  Type,
  Play,
  Check,
  RotateCcw,
  X,
  Bot,
  CheckCircle2,
  Mic,
  CornerDownLeft,
} from 'lucide-react';

export type NotificationToneId =
  | 'cristal'
  | 'pulso_wa'
  | 'marimba'
  | 'campana_vip'
  | 'sonar_suave'
  | 'doble_beep';

export type BubbleColorThemeId =
  | 'navy_alfa'
  | 'royal_blue'
  | 'midnight_slate'
  | 'gold_vip'
  | 'ocean_teal'
  | 'obsidian';

export type ClientBubbleStyleId = 'default' | 'soft_blue' | 'high_contrast';

export type ChatFontSizeId = 'xs' | 'sm' | 'base' | 'lg';

export interface ChatPreferences {
  soundEnabled: boolean;
  notificationTone: NotificationToneId;
  notificationVolume: number; // 0.1 - 1.0
  bubbleColorTheme: BubbleColorThemeId;
  clientBubbleStyle: ClientBubbleStyleId;
  fontSize: ChatFontSizeId;
  chatDensity: 'compact' | 'comfortable';
  enterToSend: boolean;
  showAudioTranscription: boolean;
}

export const CHAT_PREFS_STORAGE_KEY = 'vatos_alfa_chat_preferences_v1';

export const DEFAULT_CHAT_PREFERENCES: ChatPreferences = {
  soundEnabled: true,
  notificationTone: 'cristal',
  notificationVolume: 0.75,
  bubbleColorTheme: 'navy_alfa',
  clientBubbleStyle: 'default',
  fontSize: 'sm',
  chatDensity: 'comfortable',
  enterToSend: true,
  showAudioTranscription: true,
};

export const NOTIFICATION_TONES: {
  id: NotificationToneId;
  name: string;
  description: string;
}[] = [
  {
    id: 'cristal',
    name: 'Cristal Alfa',
    description: 'Doble campana armónica institucional',
  },
  {
    id: 'pulso_wa',
    name: 'Pulso Mensajería',
    description: 'Tono ágil estilo chat moderno',
  },
  {
    id: 'marimba',
    name: 'Acorde Ejecutivo',
    description: 'Tríada cálida ascendente de 3 notas',
  },
  {
    id: 'campana_vip',
    name: 'Campana Dorada VIP',
    description: 'Toque elegante de concierge',
  },
  {
    id: 'sonar_suave',
    name: 'Brisa Suave',
    description: 'Onda discreta y relajante',
  },
  {
    id: 'doble_beep',
    name: 'Digital Pro',
    description: 'Doble pulso nítido para recepción activa',
  },
];

export const BUBBLE_COLOR_THEMES: {
  id: BubbleColorThemeId;
  name: string;
  subtitle: string;
  staffClasses: string;
  botClasses: string;
  swatchBg: string;
  swatchBorder: string;
}[] = [
  {
    id: 'navy_alfa',
    name: 'Azul Vatos Alfa',
    subtitle: 'Institucional Oficial',
    staffClasses: 'bg-[#202A49] text-white border border-blue-500/40',
    botClasses: 'bg-[#18223c] text-white border border-blue-500/25',
    swatchBg: '#202A49',
    swatchBorder: '#3B82F6',
  },
  {
    id: 'royal_blue',
    name: 'Azul Real Vibrante',
    subtitle: 'Alto contraste moderno',
    staffClasses: 'bg-[#1d4ed8] text-white border border-blue-400/50',
    botClasses: 'bg-[#1e3a8a] text-white border border-blue-400/35',
    swatchBg: '#1D4ED8',
    swatchBorder: '#60A5FA',
  },
  {
    id: 'gold_vip',
    name: 'Pase Alfa Dorado',
    subtitle: 'Edición Club VIP',
    staffClasses: 'bg-[#231f18] text-[#f8f5ee] border border-[#C5A880]/55',
    botClasses: 'bg-[#1a1813] text-[#f3ede2] border border-[#C5A880]/35',
    swatchBg: '#231F18',
    swatchBorder: '#C5A880',
  },
  {
    id: 'ocean_teal',
    name: 'Azul Petróleo',
    subtitle: 'Fresco y descansado',
    staffClasses: 'bg-[#0f293a] text-white border border-sky-500/45',
    botClasses: 'bg-[#0b1f2d] text-white border border-sky-500/30',
    swatchBg: '#0F293A',
    swatchBorder: '#0284C7',
  },
  {
    id: 'midnight_slate',
    name: 'Pizarra Ejecutivo',
    subtitle: 'Sobrio y profesional',
    staffClasses: 'bg-[#1e293b] text-white border border-slate-500/45',
    botClasses: 'bg-[#151e2e] text-white border border-slate-600/40',
    swatchBg: '#1E293B',
    swatchBorder: '#64748B',
  },
  {
    id: 'obsidian',
    name: 'Carbón Nocturno',
    subtitle: 'Minimalista oscuro',
    staffClasses: 'bg-[#111827] text-slate-100 border border-slate-700',
    botClasses: 'bg-[#0b0f19] text-slate-100 border border-slate-800',
    swatchBg: '#111827',
    swatchBorder: '#4B5563',
  },
];

export const CLIENT_BUBBLE_STYLES: {
  id: ClientBubbleStyleId;
  name: string;
  classes: string;
}[] = [
  {
    id: 'default',
    name: 'Estándar del Sistema',
    classes: 'bg-card border border-border/70 text-foreground',
  },
  {
    id: 'soft_blue',
    name: 'Pizarra Azulado',
    classes: 'bg-[#162033] border border-blue-500/30 text-slate-100',
  },
  {
    id: 'high_contrast',
    name: 'Alto Contraste',
    classes: 'bg-slate-900 border-2 border-slate-600 text-white',
  },
];

export const FONT_SIZE_OPTIONS: {
  id: ChatFontSizeId;
  label: string;
  pxLabel: string;
  textClass: string;
}[] = [
  { id: 'xs', label: 'Compacto', pxLabel: '12px', textClass: 'text-xs' },
  { id: 'sm', label: 'Estándar', pxLabel: '14px', textClass: 'text-sm' },
  { id: 'base', label: 'Grande', pxLabel: '16px', textClass: 'text-base' },
  { id: 'lg', label: 'Extra Grande', pxLabel: '18px', textClass: 'text-lg' },
];

export function getBubbleClassesForTheme(
  themeId: BubbleColorThemeId,
  sender: 'bot' | 'recepcion' | boolean = 'recepcion'
): string {
  const found =
    BUBBLE_COLOR_THEMES.find((t) => t.id === themeId) || BUBBLE_COLOR_THEMES[0];
  const isBot = sender === 'bot' || sender === true;
  return isBot ? found.botClasses : found.staffClasses;
}

export function getClientBubbleClasses(styleId: ClientBubbleStyleId): string {
  const found =
    CLIENT_BUBBLE_STYLES.find((s) => s.id === styleId) || CLIENT_BUBBLE_STYLES[0];
  return found.classes;
}

export function getChatFontSizeClass(sizeId: ChatFontSizeId): string {
  const found = FONT_SIZE_OPTIONS.find((f) => f.id === sizeId) || FONT_SIZE_OPTIONS[1];
  return found.textClass;
}

/**
 * Reproduce el tono de notificación sintetizado con Web Audio API.
 */
export function playChatNotificationSound(
  tone: NotificationToneId = 'cristal',
  volume: number = 0.75
) {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const safeVol = Math.max(0.05, Math.min(1, volume)) * 0.32;
    const now = ctx.currentTime;

    const playNote = (
      freq: number,
      startTime: number,
      duration: number,
      type: OscillatorType = 'sine',
      peakGain: number = safeVol
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    };

    switch (tone) {
      case 'pulso_wa': {
        // Silbido moderno estilo mensajería (G5 -> D6 rápido)
        playNote(783.99, now, 0.11, 'sine', safeVol);
        playNote(1174.66, now + 0.09, 0.22, 'sine', safeVol * 1.1);
        break;
      }
      case 'marimba': {
        // Tríada ascendente C5 -> E5 -> G5
        playNote(523.25, now, 0.14, 'triangle', safeVol);
        playNote(659.25, now + 0.09, 0.14, 'triangle', safeVol);
        playNote(783.99, now + 0.18, 0.28, 'triangle', safeVol * 1.1);
        break;
      }
      case 'campana_vip': {
        // Campana elegante de concierge (A5 -> E6)
        playNote(880, now, 0.25, 'sine', safeVol);
        playNote(1318.51, now + 0.12, 0.45, 'sine', safeVol * 0.9);
        break;
      }
      case 'sonar_suave': {
        // Onda suave y cálida (F4 -> C5)
        playNote(349.23, now, 0.22, 'sine', safeVol * 0.85);
        playNote(523.25, now + 0.14, 0.35, 'sine', safeVol * 0.85);
        break;
      }
      case 'doble_beep': {
        // Doble pulso digital ejecutivo (B5 -> B5)
        playNote(987.77, now, 0.08, 'sine', safeVol);
        playNote(987.77, now + 0.12, 0.12, 'sine', safeVol);
        break;
      }
      case 'cristal':
      default: {
        // Cristal Alfa original (D5 -> A5)
        playNote(587.33, now, 0.15, 'sine', safeVol);
        playNote(880, now + 0.1, 0.3, 'sine', safeVol);
        break;
      }
    }
  } catch (_) {}
}

export const getSentBubbleClasses = getBubbleClassesForTheme;
export const getFontSizeClass = getChatFontSizeClass;
export const playChatNotificationTone = playChatNotificationSound;

interface ChatSettingsModalProps {
  isOpen?: boolean;
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: ChatPreferences;
  onUpdatePreferences?: (next: ChatPreferences) => void;
  onSavePreferences?: (next: ChatPreferences) => void;
  assistantName?: string;
}

const shortColorNames: Record<BubbleColorThemeId, string> = {
  navy_alfa: 'Azul Alfa',
  royal_blue: 'Azul Real',
  gold_vip: 'Pase Dorado',
  ocean_teal: 'Petróleo',
  midnight_slate: 'Pizarra',
  obsidian: 'Carbón',
};

export function ChatSettingsModal({
  isOpen,
  open,
  onOpenChange,
  preferences,
  onUpdatePreferences,
  onSavePreferences,
  assistantName = 'Janet',
}: ChatSettingsModalProps) {
  const modalOpen = open !== undefined ? open : !!isOpen;
  const handleSave = (next: ChatPreferences) => {
    onUpdatePreferences?.(next);
    onSavePreferences?.(next);
  };

  const updateField = <K extends keyof ChatPreferences>(
    key: K,
    value: ChatPreferences[K]
  ) => {
    handleSave({
      ...preferences,
      [key]: value,
    });
  };

  const handleResetDefaults = () => {
    handleSave(DEFAULT_CHAT_PREFERENCES);
    playChatNotificationSound(
      DEFAULT_CHAT_PREFERENCES.notificationTone,
      DEFAULT_CHAT_PREFERENCES.notificationVolume
    );
  };

  const fontSizeClass = getChatFontSizeClass(preferences.fontSize);
  const staffBubbleClass = getBubbleClassesForTheme(
    preferences.bubbleColorTheme,
    'recepcion'
  );
  const clientBubbleClass = getClientBubbleClasses(
    preferences.clientBubbleStyle
  );

  return (
    <Dialog open={modalOpen} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={true}
        className="sm:max-w-lg max-h-[90vh] p-0 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-background flex flex-col"
      >
        {/* Cabecera Oficial VATOS ALFA */}
        <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-3.5 sm:p-4 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="header-light-beam" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal className="w-5 h-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide">
                  Personalización del Chat
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                  Ajusta colores, tamaño de letra y sonidos a tu gusto
                </DialogDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
              aria-label="Cerrar ajustes"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Contenido con Scroll Azul Vatos Alfa */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-4 flex-1">
          {/* 1. VISTA PREVIA COMPACTA */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-2.5 sm:p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-semibold pb-1 border-b border-border/40">
              <span className="text-slate-300">Vista Previa</span>
              <span className="font-normal font-sans lowercase text-muted-foreground">
                {FONT_SIZE_OPTIONS.find((f) => f.id === preferences.fontSize)?.label} • {FONT_SIZE_OPTIONS.find((f) => f.id === preferences.fontSize)?.pxLabel}
              </span>
            </div>

            <div className="space-y-1.5 pt-0.5">
              {/* Mensaje de Cliente */}
              <div className="flex flex-col items-start">
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl rounded-tl-xs px-3 py-1.5 shadow-xs leading-relaxed",
                    clientBubbleClass,
                    fontSizeClass
                  )}
                >
                  <span>¡Hola! ¿Tienen espacio hoy a las 5:00 PM? 💈</span>
                  <span className="float-right ml-2.5 mt-0.5 text-[10px] opacity-70">16:15</span>
                </div>
              </div>

              {/* Mensaje de Recepción */}
              <div className="flex flex-col items-end">
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl rounded-tr-xs px-3 py-1.5 shadow-xs leading-relaxed",
                    staffBubbleClass,
                    fontSizeClass
                  )}
                >
                  <span>¡Claro que sí! Con gusto te esperamos a las 5:00 PM. ✂️</span>
                  <span className="float-right ml-2 mt-0.5 text-[10px] text-slate-300/80 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5 text-blue-400 inline" />
                    <span>Recepción • 16:16</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. TAMAÑO DE LETRA (BARRA SEGMENTADA ULTRA MINIMALISTA) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-slate-400" />
                Tamaño de Letra
              </label>
            </div>
            <div className="grid grid-cols-4 p-1 bg-muted/40 rounded-xl border border-border/50 gap-1">
              {FONT_SIZE_OPTIONS.map((opt) => {
                const isSelected = preferences.fontSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateField('fontSize', opt.id)}
                    className={cn(
                      "py-1.5 px-1 rounded-lg text-xs transition-all text-center flex flex-col items-center justify-center cursor-pointer",
                      isSelected
                        ? "bg-[#202A49] text-white shadow-xs border border-blue-500/50 font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    <span className="text-[10px] opacity-70 font-sans">{opt.pxLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. COLOR DE MENSAJES (PÍLDORAS COMPACTAS) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-slate-400" />
                Color de tus Mensajes
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {BUBBLE_COLOR_THEMES.map((theme) => {
                const isSelected = preferences.bubbleColorTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => updateField('bubbleColorTheme', theme.id)}
                    className={cn(
                      "h-8 px-2.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between gap-1.5 cursor-pointer",
                      isSelected
                        ? "border-2 border-blue-500 bg-blue-500/10 text-foreground font-semibold shadow-xs"
                        : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 border shadow-xs"
                        style={{
                          backgroundColor: theme.swatchBg,
                          borderColor: theme.swatchBorder,
                        }}
                      />
                      <span className="truncate text-xs">{shortColorNames[theme.id] || theme.name}</span>
                    </div>
                    {isSelected && <Check className="w-3 h-3 text-blue-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Estilo de tarjeta de mensajes del cliente */}
            <div className="pt-1 space-y-1">
              <span className="text-[11px] text-muted-foreground block">
                Burbuja de mensajes del cliente:
              </span>
              <div className="grid grid-cols-3 p-1 bg-muted/40 rounded-xl border border-border/50 gap-1">
                {CLIENT_BUBBLE_STYLES.map((st) => {
                  const isSelected = preferences.clientBubbleStyle === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => updateField('clientBubbleStyle', st.id)}
                      className={cn(
                        "py-1 px-1.5 rounded-lg text-xs font-medium transition-all text-center truncate cursor-pointer",
                        isSelected
                          ? "bg-[#202A49] text-white shadow-xs border border-blue-500/50 font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      )}
                    >
                      {st.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. TONO DE NOTIFICACIONES */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                {preferences.soundEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                )}
                Tono de Notificación
              </label>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {preferences.soundEnabled ? 'Sonido activo' : 'Silenciado'}
                </span>
                <Switch
                  checked={preferences.soundEnabled}
                  onCheckedChange={(checked) => updateField('soundEnabled', checked)}
                />
              </div>
            </div>

            {preferences.soundEnabled && (
              <div className="space-y-2 pt-0.5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {NOTIFICATION_TONES.map((tone) => {
                    const isSelected = preferences.notificationTone === tone.id;
                    return (
                      <button
                        key={tone.id}
                        type="button"
                        onClick={() => {
                          updateField('notificationTone', tone.id);
                          playChatNotificationSound(tone.id, preferences.notificationVolume);
                        }}
                        className={cn(
                          "h-8 px-2.5 rounded-xl border text-xs font-medium transition-all flex items-center justify-between gap-1.5 cursor-pointer group",
                          isSelected
                            ? "border-2 border-blue-500 bg-blue-500/10 text-foreground font-semibold shadow-xs"
                            : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        )}
                        title={`Seleccionar y probar: ${tone.name}`}
                      >
                        <span className="truncate">{tone.name}</span>
                        <Volume2 className={cn(
                          "w-3 h-3 shrink-0 transition-colors",
                          isSelected ? "text-blue-400" : "text-slate-400 group-hover:text-foreground"
                        )} />
                      </button>
                    );
                  })}
                </div>

                {/* Control de Volumen */}
                <div className="flex items-center gap-2.5 pt-0.5">
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    Volumen ({Math.round(preferences.notificationVolume * 100)}%):
                  </span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={preferences.notificationVolume}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      updateField('notificationVolume', val);
                    }}
                    onMouseUp={() =>
                      playChatNotificationSound(
                        preferences.notificationTone,
                        preferences.notificationVolume
                      )
                    }
                    onTouchEnd={() =>
                      playChatNotificationSound(
                        preferences.notificationTone,
                        preferences.notificationVolume
                      )
                    }
                    className="flex-1 accent-blue-500 cursor-pointer h-1.5 bg-muted rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 5. PREFERENCIAS ADICIONALES (LISTA LIMPIA CON DIVISORES) */}
          <div className="space-y-1.5 pt-1 border-t border-border/50">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Preferencias
            </span>
            <div className="rounded-xl border border-border/50 bg-card/50 divide-y divide-border/40 overflow-hidden text-xs">
              <div className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-foreground block">Enviar con tecla Enter</span>
                  <span className="text-[10px] text-muted-foreground block">Shift + Enter para salto de línea</span>
                </div>
                <Switch
                  checked={preferences.enterToSend}
                  onCheckedChange={(checked) => updateField('enterToSend', checked)}
                />
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-foreground block">Transcripción de Audios</span>
                  <span className="text-[10px] text-muted-foreground block">Mostrar texto de notas de voz</span>
                </div>
                <Switch
                  checked={preferences.showAudioTranscription}
                  onCheckedChange={(checked) =>
                    updateField('showAudioTranscription', checked)
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Minimalista */}
        <div className="p-3 bg-muted/30 border-t border-border/60 flex items-center justify-between gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetDefaults}
            className="text-xs h-8 px-2.5 text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            Restablecer
          </Button>

          <Button
            type="button"
            variant="alfa"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 px-5 font-bold"
          >
            Guardar y Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

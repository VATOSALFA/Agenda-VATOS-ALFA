'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Send,
  X,
  Maximize2,
  Minimize2,
  Loader2,
  Clock,
  Archive,
  Bell,
  Plus,
  Check,
  FileText,
  MoreVertical,
  BarChart3,
  Scissors,
  CalendarCheck,
  PackageSearch,
  ClipboardList,
  ShieldAlert,
  ArrowRightLeft,
  ExternalLink,
  Smile,
  Paperclip,
  Camera,
  Mic,
  Trash2,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Palette,
  Type,
  Play,
  RotateCcw,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/firebase-auth-context';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getGerenciaDashboardSnapshot,
  processGerenciaAgentMessage,
  executeApprovedGerenciaAction,
  rejectGerenciaActionProposal,
  toggleGerenciaReminderAction,
  createGerenciaReminderAction,
  type GerenciaChatMessage,
  type GerenciaReminderItem,
} from '@/lib/actions/gerencia-agent';
import {
  getCeoExecutiveDashboardSnapshot,
  getCeoSessionMessages,
  processCeoAgentMessage,
  executeApprovedCeoAction,
} from '@/lib/actions/ceo-agent';
import {
  playChatNotificationSound,
  type NotificationToneId,
} from '@/components/admin/conversations/chat-settings-modal';

// ============================================================================
// PREFERENCIAS VISUALES Y DE SONIDO DEL CHAT CON JANET (PERSISTIDAS EN LOCAL)
// ============================================================================
const JANET_EXEC_PREFS_KEY = 'vatos_alfa_janet_exec_chat_prefs_v1';
const JANET_RECENT_EMOJIS_KEY = 'vatos_alfa_janet_exec_recent_emojis_v1';

type ExecBubbleThemeId =
  | 'navy_alfa'
  | 'royal_blue'
  | 'gold_vip'
  | 'ocean_teal'
  | 'midnight_slate'
  | 'obsidian';

type ExecFontSizeId = 'compact' | 'standard' | 'large' | 'xlarge';

interface ExecChatPrefs {
  bubbleTheme: ExecBubbleThemeId;
  fontSize: ExecFontSizeId;
  notificationTone: NotificationToneId;
  soundAndVibration: boolean;
  showAudioTranscription: boolean;
  enterToSend: boolean;
}

const DEFAULT_EXEC_CHAT_PREFS: ExecChatPrefs = {
  bubbleTheme: 'navy_alfa',
  fontSize: 'standard',
  notificationTone: 'cristal',
  soundAndVibration: true,
  showAudioTranscription: true,
  enterToSend: true,
};

const EXEC_BUBBLE_THEMES: {
  id: ExecBubbleThemeId;
  name: string;
  subtitle: string;
  userBg: string;
  userBorder: string;
  userText: string;
}[] = [
  {
    id: 'navy_alfa',
    name: 'Azul Vatos Alfa',
    subtitle: 'Institucional Oficial',
    userBg: '#202A49',
    userBorder: '#3B82F6',
    userText: '#FFFFFF',
  },
  {
    id: 'royal_blue',
    name: 'Azul Real Vibrante',
    subtitle: 'Alto contraste moderno',
    userBg: '#1D4ED8',
    userBorder: '#60A5FA',
    userText: '#FFFFFF',
  },
  {
    id: 'gold_vip',
    name: 'Pase Alfa Dorado',
    subtitle: 'Edición Club VIP',
    userBg: '#231F18',
    userBorder: '#C5A880',
    userText: '#F8F5EE',
  },
  {
    id: 'ocean_teal',
    name: 'Azul Petróleo',
    subtitle: 'Fresco y descansado',
    userBg: '#0F293A',
    userBorder: '#0284C7',
    userText: '#FFFFFF',
  },
  {
    id: 'midnight_slate',
    name: 'Pizarra Ejecutivo',
    subtitle: 'Sobrio y profesional',
    userBg: '#1E293B',
    userBorder: '#64748B',
    userText: '#FFFFFF',
  },
  {
    id: 'obsidian',
    name: 'Carbón Nocturno',
    subtitle: 'Minimalista oscuro',
    userBg: '#111827',
    userBorder: '#4B5563',
    userText: '#F1F5F9',
  },
];

const EXEC_FONT_SIZES: {
  id: ExecFontSizeId;
  label: string;
  px: number;
}[] = [
  { id: 'compact', label: 'Compacto', px: 12 },
  { id: 'standard', label: 'Estándar', px: 14 },
  { id: 'large', label: 'Grande', px: 16 },
  { id: 'xlarge', label: 'Extra Grande', px: 18 },
];

const EXEC_TONES: {
  id: NotificationToneId;
  name: string;
  desc: string;
}[] = [
  { id: 'cristal', name: 'Cristal Alfa', desc: 'Doble campana armónica institucional' },
  { id: 'pulso_wa', name: 'Pulso Mensajería', desc: 'Tono ágil estilo WhatsApp' },
  { id: 'marimba', name: 'Acorde Ejecutivo', desc: 'Tríada cálida ascendente' },
  { id: 'campana_vip', name: 'Campana Dorada VIP', desc: 'Toque elegante de concierge' },
  { id: 'sonar_suave', name: 'Brisa Suave', desc: 'Alerta discreta y relajante' },
];

// ============================================================================
// CATÁLOGO DE EMOJIS ESTILO WHATSAPP (IDÉNTICO AL CHAT CON CLIENTES)
// ============================================================================
const EMOJI_CATEGORIES: {
  id: string;
  label: string;
  icon: string;
  emojis: string[];
}[] = [
  {
    id: 'caritas',
    label: 'Caritas',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊',
      '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
      '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🫣', '🤫', '🤔', '🫡', '🤐', '🤨',
      '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔',
      '😪', '🤤', '😴', '😷', '🤒', '🤕', '🥳', '🤠', '😎', '🤓', '🧐', '😕',
    ],
  },
  {
    id: 'manos',
    label: 'Gestos',
    icon: '🙌',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '👌', '🤌', '🤏', '✌️', '🤞',
      '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '🫵', '👍', '👎',
      '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️',
      '💪', '🦾', '❤️', '💙', '🖤', '🤍', '💯', '🔥',
    ],
  },
  {
    id: 'barberia',
    label: 'Barbería',
    icon: '💈',
    emojis: [
      '💈', '✂️', '🪒', '🧔', '🧔‍♂️', '👨', '👱‍♂️', '🧴', '🧼', '🧽', '🚿', '🛁',
      '🪞', '👑', '🎩', '🧢', '🕶️', '👔', '🧥', '⌚', '💼', '🏆', '🥇', '🎖️',
      '⭐', '🌟', '✨', '⚡', '💎', '⚜️', '🛡️', '⚔️', '🦁', '🐺', '🦅', '☕',
    ],
  },
  {
    id: 'agenda',
    label: 'Citas',
    icon: '📅',
    emojis: [
      '📅', '📆', '🗓️', '⏰', '⏱️', '⌚', '⏳', '🔔', '📍', '📌', '🗺️', '🧭',
      '🚗', '🚙', '🏍️', '🅿️', '🏢', '💈', '💳', '💵', '💰', '🧾', '📱', '📲',
      '☎️', '📞', '💬', '🗨️', '📩', '✅', '☑️', '✔️', '❌', '❗', '❓', 'ℹ️',
    ],
  },
];

interface FloatingCeoMessage {
  id: string;
  rol: 'user' | 'assistant';
  contenido: string;
  creado_en: string;
  subagentes?: string[];
  adjuntoUrl?: string | null;
  adjuntoNombre?: string | null;
  esAudio?: boolean;
  audioDuracion?: number | null;
  audioTranscripcion?: string | null;
  propuestaAccion?: {
    id: string;
    tituloPropuesta: string;
    justificacionEstrategica: string;
    estado: string;
  } | null;
}

export function JanetFloatingAssistant() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const isGeneralOwner =
    user?.role === 'Administrador general' &&
    (user?.uid === 'JxK6BLZPOBcBpjnuVZPsgmIHbZ12' ||
      user?.email?.toLowerCase() === 'vatosalfa@gmail.com');

  const isBranchManager = user?.role === 'Administrador local';
  const canUseAssistant = isGeneralOwner || isBranchManager;

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Posición arrastrable del botón circular con persistencia en localStorage
  const [btnPos, setBtnPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
  } | null>(null);

  // Modo de agente (CEO para Dueño, Gerencia para Beatriz) y pestaña activa
  const [activeAgentMode, setActiveAgentMode] = useState<'ceo' | 'gerencia'>('gerencia');
  const [activeTab, setActiveTab] = useState<'chat' | 'recordatorios'>('chat');

  // Preferencias visuales y de sonido del chat
  const [chatPrefs, setChatPrefs] = useState<ExecChatPrefs>(DEFAULT_EXEC_CHAT_PREFS);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Sub-modales de herramientas del chat (Emojis, Clip Adjuntar, Cámara en Vivo, Foto de Perfil, Visor de Imagen)
  const [isEmojiModalOpen, setIsEmojiModalOpen] = useState(false);
  const [activeEmojiCat, setActiveEmojiCat] = useState<string>('caritas');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([
    '💈', '✂️', '🔥', '🙌', '👍', '😊', '📅', '🏆', '💰', '✅',
  ]);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [isJanetPhotoModalOpen, setIsJanetPhotoModalOpen] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);

  // Cámara en vivo integrada
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedCameraDataUrl, setCapturedCameraDataUrl] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Adjunto pendiente (imagen o documento)
  const [pendingAttachment, setPendingAttachment] = useState<{
    dataUrl: string;
    fileName: string;
    mimeType: string;
    isImage: boolean;
  } | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Grabación de Nota de Voz y Dictado en Vivo
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveVoiceTranscript, setLiveVoiceTranscript] = useState('');
  const [playingAudioMsgId, setPlayingAudioMsgId] = useState<string | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechRecognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef<string>('');
  const activeAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // Estado de Janet Gerencia
  const [gerenciaLoading, setGerenciaLoading] = useState(false);
  const [gerenciaSending, setGerenciaSending] = useState(false);
  const [gerenciaSessionId, setGerenciaSessionId] = useState('');
  const [gerenciaMessages, setGerenciaMessages] = useState<GerenciaChatMessage[]>([]);
  const [gerenciaReminders, setGerenciaReminders] = useState<GerenciaReminderItem[]>([]);
  const [gerenciaStockAlerts, setGerenciaStockAlerts] = useState<
    Array<{ id: string; nombre: string; stock: number; min: number }>
  >([]);
  const [gerenciaKpis, setGerenciaKpis] = useState({
    citasActivasHoy: 0,
    citasSinConfirmarHoy: 0,
    ventasHoyCount: 0,
    ventasHoyTotal: 0,
    alertasStockCount: 0,
    recordatoriosPendientesCount: 0,
  });

  // Estado de Janet CEO
  const [ceoLoading, setCeoLoading] = useState(false);
  const [ceoSending, setCeoSending] = useState(false);
  const [ceoSessionId, setCeoSessionId] = useState('');
  const [ceoMessages, setCeoMessages] = useState<FloatingCeoMessage[]>([]);

  // Inputs y autorización
  const [inputPrompt, setInputPrompt] = useState('');
  const [proposalAuthCodeMap, setProposalAuthCodeMap] = useState<Record<string, string>>({});
  const [executingPropId, setExecutingPropId] = useState<string | null>(null);

  // Nuevo recordatorio rápido
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderCat, setNewReminderCat] = useState<
    'inventario' | 'insumos' | 'equipo' | 'operacion_general'
  >('insumos');
  const [addingReminder, setAddingReminder] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isGeneralOwner) {
      setActiveAgentMode('ceo');
    } else {
      setActiveAgentMode('gerencia');
    }
  }, [isGeneralOwner]);

  // Cargar preferencias visuales y emojis recientes desde localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedPrefs = localStorage.getItem(JANET_EXEC_PREFS_KEY);
      if (savedPrefs) {
        setChatPrefs({ ...DEFAULT_EXEC_CHAT_PREFS, ...JSON.parse(savedPrefs) });
      }
      const savedEmojis = localStorage.getItem(JANET_RECENT_EMOJIS_KEY);
      if (savedEmojis) {
        const parsed = JSON.parse(savedEmojis);
        if (Array.isArray(parsed) && parsed.length > 0) setRecentEmojis(parsed);
      }
    } catch (_) {}
  }, []);

  const updateChatPrefs = (next: ExecChatPrefs) => {
    setChatPrefs(next);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(JANET_EXEC_PREFS_KEY, JSON.stringify(next));
      } catch (_) {}
    }
  };

  const activeBubbleTheme =
    EXEC_BUBBLE_THEMES.find((t) => t.id === chatPrefs.bubbleTheme) || EXEC_BUBBLE_THEMES[0];
  const activeFontPx =
    (EXEC_FONT_SIZES.find((f) => f.id === chatPrefs.fontSize) || EXEC_FONT_SIZES[1]).px;

  // Inicializar posición arrastrable
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('janet_floating_pos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          const x = Math.min(Math.max(12, parsed.x), window.innerWidth - 76);
          const y = Math.min(Math.max(12, parsed.y), window.innerHeight - 76);
          setBtnPos({ x, y });
          return;
        }
      }
    } catch (_) {}

    const defaultX = Math.max(12, window.innerWidth - 78);
    const defaultY = Math.max(12, window.innerHeight - 155);
    setBtnPos({ x: defaultX, y: defaultY });
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const curX = btnPos?.x ?? window.innerWidth - 78;
    const curY = btnPos?.y ?? window.innerHeight - 155;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: curX,
      origY: curY,
      hasMoved: false,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 5) {
      dragRef.current.hasMoved = true;
    }
    if (dragRef.current.hasMoved) {
      const newX = Math.min(Math.max(12, dragRef.current.origX + dx), window.innerWidth - 72);
      const newY = Math.min(Math.max(12, dragRef.current.origY + dy), window.innerHeight - 72);
      setBtnPos({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const wasMoved = dragRef.current.hasMoved;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (btnPos && wasMoved) {
      try {
        localStorage.setItem('janet_floating_pos', JSON.stringify(btnPos));
      } catch (_) {}
    }
    dragRef.current = null;

    if (!wasMoved) {
      setIsOpen(true);
    }
  };

  const getFreshToken = useCallback(async () => {
    const auth = getAuth();
    const current = auth.currentUser;
    if (!current) throw new Error('Sesión no disponible.');
    return await current.getIdToken(false);
  }, []);

  const loadGerenciaData = useCallback(async () => {
    if (!canUseAssistant) return;
    try {
      setGerenciaLoading(true);
      const token = await getFreshToken();
      const snap = await getGerenciaDashboardSnapshot(token);
      setGerenciaKpis(snap.kpisDia);
      setGerenciaReminders(snap.recordatorios || []);
      setGerenciaStockAlerts(snap.alertasStock || []);
      setGerenciaSessionId(snap.sesionActivaId || '');
      setGerenciaMessages(snap.mensajesRecientes || []);
    } catch (err: any) {
      console.error('Error cargando Janet Gerencia:', err);
    } finally {
      setGerenciaLoading(false);
    }
  }, [canUseAssistant, getFreshToken]);

  const loadCeoData = useCallback(async () => {
    if (!isGeneralOwner) return;
    try {
      setCeoLoading(true);
      const token = await getFreshToken();
      const snap = await getCeoExecutiveDashboardSnapshot(token);
      const latestSessionId = snap.sesiones?.[0]?.id || '';
      setCeoSessionId(latestSessionId);
      if (latestSessionId) {
        const msgsRes = await getCeoSessionMessages(token, latestSessionId);
        setCeoMessages((msgsRes.messages || []) as FloatingCeoMessage[]);
      }
    } catch (err: any) {
      console.error('Error cargando Janet CEO flotante:', err);
    } finally {
      setCeoLoading(false);
    }
  }, [isGeneralOwner, getFreshToken]);

  useEffect(() => {
    if (!authLoading && canUseAssistant) {
      loadGerenciaData();
      if (isGeneralOwner) {
        loadCeoData();
      }
    }
  }, [authLoading, canUseAssistant, isGeneralOwner, loadGerenciaData, loadCeoData]);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, gerenciaMessages, ceoMessages, activeTab, activeAgentMode, ceoSending, gerenciaSending]);

  // Limpieza de cámara y micrófono al desmontar
  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  // Control de cámara en vivo cuando se abre el modal de cámara
  const stopCameraStream = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = useCallback(
    async (mode: 'user' | 'environment') => {
      stopCameraStream();
      setCameraError(null);
      if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
        setCameraError('Tu navegador no permite abrir la cámara en vivo directamente. Usa el botón de abajo para tomar o elegir una foto.');
        return;
      }
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          await cameraVideoRef.current.play().catch(() => {});
        }
      } catch {
        setCameraError('No se pudo acceder a la cámara. Verifica los permisos o selecciona una foto desde tu dispositivo.');
      }
    },
    [stopCameraStream]
  );

  useEffect(() => {
    if (isCameraModalOpen && !capturedCameraDataUrl) {
      startCameraStream(cameraFacingMode);
    } else if (!isCameraModalOpen) {
      stopCameraStream();
      setCapturedCameraDataUrl(null);
      setCameraError(null);
    }
  }, [isCameraModalOpen, cameraFacingMode, capturedCameraDataUrl, startCameraStream, stopCameraStream]);

  if (authLoading || !canUseAssistant) {
    return null;
  }

  const assistantDisplayName =
    activeAgentMode === 'ceo' && isGeneralOwner ? 'Janet CEO' : 'Janet Gerencia';

  const triggerFeedbackTone = (overrideTone?: NotificationToneId) => {
    if (!chatPrefs.soundAndVibration && !overrideTone) return;
    playChatNotificationSound(overrideTone || chatPrefs.notificationTone, 0.75);
  };

  // =========================================================================
  // MANEJO DE ARCHIVOS, FOTOS Y CÁMARA
  // =========================================================================
  const handleFileSelected = (file?: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Archivo muy grande',
        description: 'El tamaño máximo permitido es de 8 MB.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingAttachment({
          dataUrl: reader.result,
          fileName: file.name || 'archivo_adjunto',
          mimeType: file.type || 'application/octet-stream',
          isImage: file.type.startsWith('image/'),
        });
        setIsAttachModalOpen(false);
        setIsCameraModalOpen(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePasteClipboard = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleFileSelected(file);
          break;
        }
      }
    }
  };

  const handleTakeCameraSnapshot = () => {
    if (!cameraVideoRef.current || !cameraCanvasRef.current) return;
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedCameraDataUrl(dataUrl);
    stopCameraStream();
  };

  const handleConfirmCameraSnapshot = () => {
    if (!capturedCameraDataUrl) return;
    setPendingAttachment({
      dataUrl: capturedCameraDataUrl,
      fileName: `Foto_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      isImage: true,
    });
    setIsCameraModalOpen(false);
    setCapturedCameraDataUrl(null);
  };

  // =========================================================================
  // MANEJO DE EMOJIS ESTILO WHATSAPP
  // =========================================================================
  const handleSelectEmoji = (emoji: string) => {
    setInputPrompt((prev) => prev + emoji);
    const updated = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 14);
    setRecentEmojis(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(JANET_RECENT_EMOJIS_KEY, JSON.stringify(updated));
      } catch (_) {}
    }
  };

  // =========================================================================
  // DICTADO Y GRABACIÓN DE NOTA DE VOZ (MEDIA RECORDER + SPEECH RECOGNITION)
  // =========================================================================
  const formatRecordTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleStartVoiceRecording = async () => {
    if (isRecordingVoice) return;
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      toast({
        variant: 'destructive',
        title: 'Micrófono no disponible',
        description: 'Tu navegador no permite acceso directo al micrófono.',
      });
      return;
    }

    setLiveVoiceTranscript('');
    liveTranscriptRef.current = '';

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      // Reconocimiento de voz en español en paralelo para dictado instantáneo en vivo
      try {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.lang = 'es-MX';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event: any) => {
            let fullText = '';
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript + ' ';
            }
            const cleaned = fullText.trim();
            if (cleaned) {
              liveTranscriptRef.current = cleaned;
              setLiveVoiceTranscript(cleaned);
            }
          };
          recognition.onerror = () => {};
          recognition.start();
          speechRecognitionRef.current = recognition;
        }
      } catch (_) {}

      recorder.start(250);
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Permiso de Micrófono',
        description: 'Permite el acceso al micrófono para dictar o enviar notas de voz a Janet.',
      });
    }
  };

  const cleanupRecordingResources = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) {}
      speechRecognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  };

  const handleCancelVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
    }
    cleanupRecordingResources();
    audioChunksRef.current = [];
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
    setLiveVoiceTranscript('');
    liveTranscriptRef.current = '';
  };

  // Opción A: Pasar lo dictado a la caja de texto para editar antes de enviar
  const handleConvertDictationToText = () => {
    const dictated = liveTranscriptRef.current.trim();
    handleCancelVoiceRecording();
    if (dictated) {
      setInputPrompt((prev) => (prev ? `${prev} ${dictated}` : dictated));
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      toast({
        title: 'Usa el botón Enviar',
        description: 'Para transcribir con IA directa, presiona el botón azul de enviar.',
      });
    }
  };

  // Opción B: Enviar como Nota de Voz directa (con transcripción IA de Gemini)
  const handleFinishAndSendVoiceNote = () => {
    if (!mediaRecorderRef.current || !isRecordingVoice) return;
    const durationSec = Math.max(1, recordingSeconds);
    const capturedHint = liveTranscriptRef.current.trim();
    const recorder = mediaRecorderRef.current;
    const mimeType = recorder.mimeType || 'audio/webm';

    setIsRecordingVoice(false);
    setRecordingSeconds(0);
    setLiveVoiceTranscript('');
    liveTranscriptRef.current = '';

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (_) {}
      speechRecognitionRef.current = null;
    }

    recorder.onstop = async () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      audioChunksRef.current = [];

      if (audioBlob.size === 0) return;

      const audioDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string) || '');
        reader.readAsDataURL(audioBlob);
      });

      await handleSend(capturedHint, {
        audioDataUrl,
        audioMimeType: mimeType,
        audioDuration: durationSec,
      });
    };

    try {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        cleanupRecordingResources();
      }
    } catch {
      cleanupRecordingResources();
    }
  };

  const handleToggleAudioPlayback = (msgId: string, audioUrl?: string | null) => {
    if (!audioUrl) return;
    if (playingAudioMsgId === msgId && activeAudioElementRef.current) {
      activeAudioElementRef.current.pause();
      activeAudioElementRef.current = null;
      setPlayingAudioMsgId(null);
      return;
    }
    if (activeAudioElementRef.current) {
      activeAudioElementRef.current.pause();
      activeAudioElementRef.current = null;
    }
    try {
      const audio = new Audio(audioUrl);
      activeAudioElementRef.current = audio;
      setPlayingAudioMsgId(msgId);
      audio.onended = () => {
        setPlayingAudioMsgId(null);
        activeAudioElementRef.current = null;
      };
      audio.onerror = () => {
        setPlayingAudioMsgId(null);
        activeAudioElementRef.current = null;
      };
      audio.play().catch(() => {
        setPlayingAudioMsgId(null);
      });
    } catch {
      setPlayingAudioMsgId(null);
    }
  };

  // =========================================================================
  // ENVÍO DE MENSAJES A JANET CEO O JANET GERENCIA
  // =========================================================================
  const handleResetConversation = () => {
    if (activeAgentMode === 'ceo' && isGeneralOwner) {
      setCeoSessionId('');
      setCeoMessages([]);
      toast({
        title: 'Nueva conversación con Janet CEO',
        description: 'Sesión ejecutiva reiniciada y lista.',
      });
    } else {
      setGerenciaSessionId('');
      setGerenciaMessages([]);
      toast({
        title: 'Nueva conversación con Janet Gerencia',
        description: 'Sesión operativa reiniciada y lista.',
      });
    }
  };

  const handleSend = async (
    overrideText?: string,
    voicePayload?: {
      audioDataUrl: string;
      audioMimeType: string;
      audioDuration: number;
    }
  ) => {
    const rawText = (overrideText !== undefined ? overrideText : inputPrompt).trim();
    const currentAttach = pendingAttachment;

    if (!rawText && !currentAttach && !voicePayload) return;

    const displayText =
      rawText ||
      (voicePayload
        ? `🎤 Nota de voz (${voicePayload.audioDuration}s)`
        : currentAttach
        ? `📎 ${currentAttach.fileName}`
        : '');

    if (overrideText === undefined) {
      setInputPrompt('');
    }
    if (currentAttach) {
      setPendingAttachment(null);
    }

    // 1. MODO JANET CEO (ADMINISTRADOR GENERAL)
    if (activeAgentMode === 'ceo' && isGeneralOwner) {
      if (ceoSending) return;
      try {
        setCeoSending(true);
        setActiveTab('chat');

        const tempId = `temp_${Date.now()}`;
        const tempMsg: FloatingCeoMessage = {
          id: tempId,
          rol: 'user',
          contenido: displayText,
          creado_en: new Date().toISOString(),
          adjuntoUrl: currentAttach?.dataUrl || voicePayload?.audioDataUrl || null,
          adjuntoNombre: currentAttach?.fileName || null,
          esAudio: Boolean(voicePayload),
          audioDuracion: voicePayload?.audioDuration || null,
          audioTranscripcion: voicePayload && rawText ? rawText : null,
        };
        setCeoMessages((prev) => [...prev, tempMsg]);

        const token = await getFreshToken();
        const res = await processCeoAgentMessage({
          idToken: token,
          sessionId: ceoSessionId || undefined,
          userMessage: rawText,
          modelChoice: 'pro',
          attachmentDataUrl: currentAttach?.dataUrl,
          attachmentName: currentAttach?.fileName,
          audioDataUrl: voicePayload?.audioDataUrl,
          audioMimeType: voicePayload?.audioMimeType,
          audioDuration: voicePayload?.audioDuration,
        });

        triggerFeedbackTone();
        setCeoSessionId(res.sessionId);
        setCeoMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === tempId && res.audioTranscription
              ? {
                  ...m,
                  contenido: res.audioTranscription,
                  audioTranscripcion: res.audioTranscription,
                }
              : m
          );
          return [
            ...updated,
            {
              id: res.messageId,
              rol: 'assistant',
              contenido: res.reply,
              creado_en: new Date().toISOString(),
              subagentes: res.subagentsInvoked,
            },
          ];
        });

        if (res.subagentsInvoked?.includes('enviar_consigna_a_gerencia_sucursal')) {
          loadGerenciaData();
        }
      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Error en Janet CEO',
          description: err?.message || 'No se pudo procesar tu instrucción.',
        });
      } finally {
        setCeoSending(false);
      }
      return;
    }

    // 2. MODO JANET GERENCIA (ADMINISTRADORA DE LOCAL / SUCURSAL)
    if (gerenciaSending) return;
    try {
      setGerenciaSending(true);
      setActiveTab('chat');

      const tempId = `temp_${Date.now()}`;
      const tempMsg: GerenciaChatMessage = {
        id: tempId,
        rol: 'user',
        contenido: displayText,
        creado_en: new Date().toISOString(),
        adjuntoUrl: currentAttach?.dataUrl || voicePayload?.audioDataUrl || null,
        adjuntoNombre: currentAttach?.fileName || null,
        esAudio: Boolean(voicePayload),
        audioDuracion: voicePayload?.audioDuration || null,
        audioTranscripcion: voicePayload && rawText ? rawText : null,
      };
      setGerenciaMessages((prev) => [...prev, tempMsg]);

      const token = await getFreshToken();
      const res = await processGerenciaAgentMessage({
        idToken: token,
        sessionId: gerenciaSessionId || undefined,
        userMessage: rawText,
        attachmentDataUrl: currentAttach?.dataUrl,
        attachmentName: currentAttach?.fileName,
        audioDataUrl: voicePayload?.audioDataUrl,
        audioMimeType: voicePayload?.audioMimeType,
        audioDuration: voicePayload?.audioDuration,
      });

      triggerFeedbackTone();
      setGerenciaSessionId(res.sessionId);
      setGerenciaMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === tempId && res.audioTranscription
            ? {
                ...m,
                contenido: res.audioTranscription,
                audioTranscripcion: res.audioTranscription,
              }
            : m
        );
        return [...updated, res.message];
      });
      loadGerenciaData();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error en Janet Gerencia',
        description: err?.message || 'No se pudo procesar la solicitud operativa.',
      });
    } finally {
      setGerenciaSending(false);
    }
  };

  const handleApproveGerenciaProposal = async (propId: string, tipoAccion: string) => {
    const code = proposalAuthCodeMap[propId] || '';
    if (tipoAccion === 'eliminar_venta' && !code.trim()) {
      toast({
        variant: 'destructive',
        title: 'Código requerido',
        description: 'Ingresa tu código de autorización para eliminar la venta.',
      });
      return;
    }

    try {
      setExecutingPropId(propId);
      const token = await getFreshToken();
      const res = await executeApprovedGerenciaAction({
        idToken: token,
        propuestaId: propId,
        authCode: code,
      });

      if (!res.success) {
        toast({
          variant: 'destructive',
          title: 'No se pudo ejecutar',
          description: res.message,
        });
        return;
      }

      toast({
        title: 'Operación Aplicada',
        description: res.message,
      });

      setGerenciaMessages((prev) =>
        prev.map((m) =>
          m.propuestaAccion?.id === propId
            ? {
                ...m,
                propuestaAccion: {
                  ...m.propuestaAccion,
                  estado: 'ejecutada',
                },
              }
            : m
        )
      );
      loadGerenciaData();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err?.message || 'Error al ejecutar la operación.',
      });
    } finally {
      setExecutingPropId(null);
    }
  };

  const handleRejectGerenciaProposal = async (propId: string) => {
    try {
      setExecutingPropId(propId);
      const token = await getFreshToken();
      await rejectGerenciaActionProposal({ idToken: token, propuestaId: propId });
      setGerenciaMessages((prev) =>
        prev.map((m) =>
          m.propuestaAccion?.id === propId
            ? {
                ...m,
                propuestaAccion: {
                  ...m.propuestaAccion,
                  estado: 'rechazada',
                },
              }
            : m
        )
      );
    } catch (_) {
    } finally {
      setExecutingPropId(null);
    }
  };

  const handleApproveCeoProposal = async (propId: string) => {
    const pin = proposalAuthCodeMap[propId] || '';
    if (!pin.trim()) {
      toast({
        variant: 'destructive',
        title: 'PIN Maestro Requerido',
        description: 'Ingresa tu PIN Maestro Ejecutivo para autorizar el cambio.',
      });
      return;
    }

    try {
      setExecutingPropId(propId);
      const token = await getFreshToken();
      const res = await executeApprovedCeoAction({
        idToken: token,
        proposalId: propId,
        masterPin: pin,
      });

      if (!res.success) {
        toast({
          variant: 'destructive',
          title: 'Autorización rechazada',
          description: res.message,
        });
        return;
      }

      toast({
        title: 'Acción Ejecutiva Aplicada',
        description: res.message,
      });

      setCeoMessages((prev) =>
        prev.map((m) =>
          m.propuestaAccion?.id === propId
            ? {
                ...m,
                propuestaAccion: {
                  ...m.propuestaAccion,
                  estado: 'ejecutada',
                },
              }
            : m
        )
      );
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err?.message || 'Error al aplicar propuesta ejecutiva.',
      });
    } finally {
      setExecutingPropId(null);
    }
  };

  const handleCompleteReminder = async (reminderId: string) => {
    try {
      const token = await getFreshToken();
      await toggleGerenciaReminderAction({
        idToken: token,
        reminderId,
        completed: true,
      });
      setGerenciaReminders((prev) => prev.filter((r) => r.id !== reminderId));
      setGerenciaKpis((prev) => ({
        ...prev,
        recordatoriosPendientesCount: Math.max(0, prev.recordatoriosPendientesCount - 1),
      }));
      toast({
        title: 'Pendiente completado',
        description: 'El recordatorio fue marcado como realizado.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo actualizar el recordatorio.',
      });
    }
  };

  const handleAddQuickReminder = async () => {
    if (!newReminderTitle.trim() || addingReminder) return;
    try {
      setAddingReminder(true);
      const token = await getFreshToken();
      await createGerenciaReminderAction({
        idToken: token,
        categoria: newReminderCat,
        titulo: newReminderTitle.trim(),
        detalle: 'Recordatorio operativo registrado desde el asistente de sucursal.',
      });
      setNewReminderTitle('');
      await loadGerenciaData();
      toast({
        title: 'Recordatorio guardado',
        description: 'Se agregó a tu lista de pendientes de sucursal.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo guardar el recordatorio.',
      });
    } finally {
      setAddingReminder(false);
    }
  };

  // Formateador de texto con soporte de **negritas** y viñetas limpias (idéntico al chat de clientes)
  const renderFormattedMessageText = (rawText: string) => {
    if (!rawText) return null;
    const lines = rawText.split('\n');
    return lines.map((line, lineIdx) => {
      const formattedLine = line
        .replace(/^[\s]*[\*\-]\s+/, '• ')
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '**$1**');
      const segments = formattedLine.split(/(\*\*.*?\*\*)/g);
      return (
        <React.Fragment key={`line_${lineIdx}`}>
          {lineIdx > 0 && <br />}
          {segments.map((seg, segIdx) => {
            if (seg.startsWith('**') && seg.endsWith('**') && seg.length >= 4) {
              const boldContent = seg.slice(2, -2).replace(/\*/g, '');
              return (
                <strong key={`seg_${segIdx}`} className="font-bold">
                  {boldContent}
                </strong>
              );
            }
            return <span key={`seg_${segIdx}`}>{seg.replace(/\*/g, '')}</span>;
          })}
        </React.Fragment>
      );
    });
  };

  const formatMsgTime = (iso?: string) => {
    if (!iso) return 'Ahora';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 'Ahora';
      return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Ahora';
    }
  };

  // Renderizado unificado del contenido de cada burbuja (voz, imagen, archivo, texto)
  const renderMessageBubbleBody = (msg: {
    id: string;
    rol: 'user' | 'assistant';
    contenido: string;
    creado_en: string;
    adjuntoUrl?: string | null;
    adjuntoNombre?: string | null;
    esAudio?: boolean;
    audioDuracion?: number | null;
    audioTranscripcion?: string | null;
  }) => {
    const isUser = msg.rol === 'user';
    const isImageAttachment =
      !msg.esAudio &&
      Boolean(
        msg.adjuntoUrl &&
          (msg.adjuntoUrl.startsWith('data:image/') ||
            /\.(jpg|jpeg|png|webp|gif)$/i.test(msg.adjuntoNombre || ''))
      );

    return (
      <div
        style={
          isUser
            ? {
                backgroundColor: activeBubbleTheme.userBg,
                borderColor: activeBubbleTheme.userBorder,
                color: activeBubbleTheme.userText,
                fontSize: `${activeFontPx}px`,
                lineHeight: `${activeFontPx + 6}px`,
              }
            : {
                fontSize: `${activeFontPx}px`,
                lineHeight: `${activeFontPx + 6}px`,
              }
        }
        className={cn(
          'max-w-[86%] rounded-2xl px-3.5 py-2.5 shadow-xs transition-colors',
          isUser
            ? 'border rounded-br-xs'
            : 'bg-muted/35 text-foreground border border-border/60 rounded-bl-xs'
        )}
      >
        {/* 1. Imagen Adjunta (Clic para pantalla completa) */}
        {isImageAttachment && msg.adjuntoUrl && (
          <div className="mb-2">
            <img
              src={msg.adjuntoUrl}
              alt={msg.adjuntoNombre || 'Imagen adjunta'}
              onClick={() => setFullscreenImageUri(msg.adjuntoUrl || null)}
              className="max-h-48 w-auto rounded-xl object-cover border border-white/15 cursor-pointer hover:opacity-95 transition-opacity"
            />
          </div>
        )}

        {/* 2. Tarjeta de Documento / Archivo Adjunto */}
        {!msg.esAudio && !isImageAttachment && msg.adjuntoNombre && (
          <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-black/20 border border-white/10 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="text-xs font-semibold truncate">{msg.adjuntoNombre}</span>
          </div>
        )}

        {/* 3. Nota de Voz con Onda de Audio + Transcripción (Idéntica al Chat con Clientes) */}
        {msg.esAudio ? (
          <div className="min-w-[210px] space-y-1.5">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleToggleAudioPlayback(msg.id, msg.adjuntoUrl)}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                title={playingAudioMsgId === msg.id ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
              >
                {playingAudioMsgId === msg.id ? (
                  <VolumeX className="h-4 w-4 text-blue-300 animate-pulse" />
                ) : (
                  <Volume2 className="h-4 w-4 text-white" />
                )}
              </button>

              {/* Barras de onda de voz */}
              <div className="flex-1 flex items-center gap-1 h-6">
                {[8, 15, 11, 19, 13, 21, 10, 17, 13, 7, 14, 9].map((barH, idx) => (
                  <span
                    key={`bar_${idx}`}
                    style={{ height: `${barH}px` }}
                    className={cn(
                      'w-1 rounded-full transition-all',
                      playingAudioMsgId === msg.id ? 'bg-blue-300 animate-pulse' : 'bg-white/75'
                    )}
                  />
                ))}
              </div>

              <span className="text-[11px] font-bold font-sans shrink-0 opacity-90">
                {formatRecordTime(msg.audioDuracion || 2)}
              </span>
            </div>

            {chatPrefs.showAudioTranscription && (msg.audioTranscripcion || msg.contenido) && (
              <div className="pt-1.5 border-t border-white/20 text-xs opacity-95 italic">
                “{msg.audioTranscripcion || msg.contenido}”
              </div>
            )}
          </div>
        ) : (
          /* 4. Texto Estándar Formateado */
          <div className="whitespace-pre-wrap break-words">
            {renderFormattedMessageText(msg.contenido)}
          </div>
        )}

        {/* Hora del mensaje */}
        <div
          className={cn(
            'text-[9.5px] mt-1 text-right font-sans select-none',
            isUser ? 'text-white/65' : 'text-muted-foreground'
          )}
        >
          {formatMsgTime(msg.creado_en)}
        </div>
      </div>
    );
  };

  const pendingBadgeCount =
    gerenciaKpis.recordatoriosPendientesCount + gerenciaKpis.alertasStockCount;

  const isCurrentlySending = gerenciaSending || ceoSending;

  return (
    <>
      {/* Inputs de archivo ocultos para Galería, Documentos y Cámara Nativa */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFileSelected(e.target.files?.[0]);
          if (galleryInputRef.current) galleryInputRef.current.value = '';
        }}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          handleFileSelected(e.target.files?.[0]);
          if (docInputRef.current) docInputRef.current.value = '';
        }}
      />
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFileSelected(e.target.files?.[0]);
          if (nativeCameraInputRef.current) nativeCameraInputRef.current.value = '';
        }}
      />

      {/* =========================================================================
          BOTÓN FLOTANTE CIRCULAR ARRASTRABLE (IDÉNTICO A LA APP MÓVIL)
          - Video animado en bucle con fallback a imagen
          - Luz láser continua girando sobre el contorno exacto (idéntico al botón "+" inferior)
          - Doble efecto oficial: láser perimetral continuo + haz de luz oblicuo
          - Sin letreros ni globitos (limpio 100%)
          - Arrastre táctil y ratón para no estorbar en ninguna sección
          ========================================================================= */}
      {!isOpen && btnPos && (
        <div
          style={{
            left: `${btnPos.x}px`,
            top: `${btnPos.y}px`,
            touchAction: 'none',
          }}
          className="fixed z-50 select-none animate-in fade-in zoom-in-90 duration-300"
        >
          {/* Aura azul eléctrica sutil de respiración */}
          <div className="absolute inset-[-6px] rounded-full bg-blue-600/25 blur-sm animate-pulse pointer-events-none" />

          {/* Botón interactivo con el efecto de luz láser oficial Vatos Alfa */}
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="btn-vatos-alfa relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-[1.5px] border-none overflow-hidden inline-flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.5),0_0_14px_rgba(59,130,246,0.35)] hover:scale-105 active:scale-95 transition-transform cursor-grab active:cursor-grabbing outline-none select-none z-10"
            title={
              isGeneralOwner
                ? 'Janet CEO · Arrastra para mover o toca para abrir'
                : 'Janet Gerencia · Arrastra para mover o toca para abrir'
            }
          >
            {/* 1. Haz de luz láser que recorre el contorno exterior exacto (idéntico a Button alfa y botón +) */}
            <span
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none animate-conic-laser z-0"
              aria-hidden="true"
            />

            {/* 2. Cuerpo interior del botón (degradado navy profundo) */}
            <span className="relative z-[1] inline-flex items-center justify-center w-full h-full text-white overflow-hidden select-none pointer-events-none rounded-full bg-gradient-to-b from-[#18223c] to-[#0d1424]">
              {/* 3. Haz de luz oblicuo que viaja periódicamente de izquierda a derecha */}
              <span
                className="absolute inset-0 w-1/2 h-full -skew-x-20 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-btn-light-sweep pointer-events-none z-[2]"
                aria-hidden="true"
              />

              {/* 4. Avatar de Janet en video en bucle sin letreros ni globitos */}
              <span className="relative z-10 w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-slate-950">
                <video
                  src="/janet-avatar.mp4"
                  poster="/janet-avatar.png"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover select-none pointer-events-none"
                  draggable={false}
                />
              </span>
            </span>
          </button>
        </div>
      )}

      {/* =========================================================================
          PANTALLA DE CHAT CON JANET (100% PANTALLA COMPLETA EN MÓVIL, VENTANA EN DESKTOP)
          ========================================================================= */}
      {isOpen && (
        <div
          className={cn(
            'fixed z-[100] bg-background flex flex-col transition-all duration-200 overflow-hidden',
            isExpanded
              ? 'inset-0 w-full h-[100dvh] rounded-none border-none'
              : 'inset-0 w-full h-[100dvh] rounded-none sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[480px] sm:h-[710px] sm:max-h-[92vh] sm:rounded-2xl sm:border-2 sm:border-blue-500 sm:shadow-[0_20px_50px_rgba(32,42,73,0.55)]'
          )}
        >
          {/* CABECERA OFICIAL VATOS ALFA (IDÉNTICA AL CHAT CON CLIENTES) */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white px-3.5 py-2.5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full gap-2">
              {/* Avatar con Borde Láser (Clic para ver en grande) + Nombre + Estado En Línea */}
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsJanetPhotoModalOpen(true)}
                  className="relative w-10 h-10 rounded-full p-[1.5px] overflow-hidden bg-[#0A132C] inline-flex items-center justify-center shrink-0 cursor-pointer hover:scale-105 transition-transform"
                  title="Ver foto de perfil de Janet"
                >
                  <span
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] pointer-events-none animate-conic-laser z-0"
                    aria-hidden="true"
                  />
                  <span className="relative z-10 w-full h-full rounded-full overflow-hidden bg-slate-950 flex items-center justify-center">
                    <video
                      src="/janet-avatar.mp4"
                      poster="/janet-avatar.png"
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover select-none pointer-events-none"
                      draggable={false}
                    />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsJanetPhotoModalOpen(true)}
                  className="min-w-0 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-white tracking-wide truncate">
                      {assistantDisplayName}
                    </h3>
                    <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                  </div>
                  <p className="text-[10.5px] text-slate-300 truncate">
                    {activeAgentMode === 'ceo' && isGeneralOwner
                      ? 'En línea • Dirección y Finanzas'
                      : 'En línea • Copiloto de Sucursal'}
                  </p>
                </button>
              </div>

              {/* Barra de Herramientas de Cabecera: Preferencias Visuales, Reiniciar, 3 Puntos, Expandir, Cerrar */}
              <div className="flex items-center gap-0.5 shrink-0">
                {/* 1. Preferencias Visuales del Chat (SlidersHorizontal igual que en App Clientes) */}
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="h-8 w-8 rounded-lg text-blue-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                  title="Preferencias visuales y sonidos del chat"
                  aria-label="Configuración de mensajes"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>

                {/* 2. Reiniciar Conversación (RefreshCw igual que en App Clientes) */}
                <button
                  type="button"
                  onClick={handleResetConversation}
                  className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                  title="Iniciar nueva conversación limpia"
                  aria-label="Reiniciar chat"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>

                {/* 3. Menú de Tres Puntitos (Todas las Opciones y Acciones Rápidas en Lista) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                      title="Opciones, Insumos y Comandos Rápidos"
                      aria-label="Más opciones"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-64 bg-[#10172b] border-2 border-blue-500 text-white rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.22)] p-1.5 z-[130]"
                  >
                    <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                      Vista del Asistente
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => setActiveTab('chat')}
                      className={cn(
                        'rounded-lg text-xs font-semibold cursor-pointer',
                        activeTab === 'chat' && 'bg-blue-600/30 text-white'
                      )}
                    >
                      <Sparkles className="mr-2 h-3.5 w-3.5 text-blue-400" />
                      <span>Pantalla de Chat con Janet</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setActiveTab('recordatorios')}
                      className={cn(
                        'rounded-lg text-xs font-semibold cursor-pointer',
                        activeTab === 'recordatorios' && 'bg-blue-600/30 text-[#C5A880]'
                      )}
                    >
                      <Bell className="mr-2 h-3.5 w-3.5 text-[#C5A880]" />
                      <span>
                        Insumos y Recordatorios{' '}
                        {pendingBadgeCount > 0 ? `(${pendingBadgeCount})` : ''}
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="bg-slate-800" />

                    {/* Cambio de Modo (Exclusivo Dueño) */}
                    {isGeneralOwner && (
                      <>
                        <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                          Modo de Asistente
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            setActiveAgentMode('ceo');
                            setActiveTab('chat');
                          }}
                          className={cn(
                            'rounded-lg text-xs font-semibold cursor-pointer',
                            activeAgentMode === 'ceo' && 'bg-blue-600/30 text-[#C5A880]'
                          )}
                        >
                          <Sparkles className="mr-2 h-3.5 w-3.5 text-[#C5A880]" />
                          <span>Modo Janet CEO (Dirección)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setActiveAgentMode('gerencia');
                            setActiveTab('chat');
                          }}
                          className={cn(
                            'rounded-lg text-xs font-semibold cursor-pointer',
                            activeAgentMode === 'gerencia' && 'bg-blue-600/30 text-blue-300'
                          )}
                        >
                          <ArrowRightLeft className="mr-2 h-3.5 w-3.5 text-blue-400" />
                          <span>Modo Janet Gerencia (Bety)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          asChild
                          className="rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          <Link href="/ceo" onClick={() => setIsOpen(false)}>
                            <ExternalLink className="mr-2 h-3.5 w-3.5 text-[#C5A880]" />
                            <span>Abrir Sala Ejecutiva Completa (/ceo)</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-slate-800" />
                      </>
                    )}

                    {/* Acciones Rápidas en Lista Ordenada */}
                    <DropdownMenuLabel className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1">
                      Comandos Rápidos
                    </DropdownMenuLabel>

                    {activeAgentMode === 'ceo' && isGeneralOwner ? (
                      <>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              'Dame el Estado de Resultados (P&L) de este mes hasta hoy con mi utilidad neta real y el reparto de gerencia.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <BarChart3 className="mr-2 h-3.5 w-3.5 text-[#C5A880]" />
                          <span>Consultar Estado de Resultados</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              'Haz una auditoría forense de los últimos 14 días: ventas eliminadas, uso del código 1234 y cortes de caja.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <ShieldAlert className="mr-2 h-3.5 w-3.5 text-red-400" />
                          <span>Auditoría Forense Anti-Robo</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              'Envía una consigna a Janet Gerencia para recordar a Beatriz hacer inventario físico de productos y revisar insumos de barbería.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <ClipboardList className="mr-2 h-3.5 w-3.5 text-blue-400" />
                          <span>Recordar Inventario a Bety</span>
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              '¿Cómo vamos hoy en la sucursal? Dime el resumen de citas del día, cuáles faltan por confirmar y las ventas cobradas hoy.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <ClipboardList className="mr-2 h-3.5 w-3.5 text-blue-400" />
                          <span>Resumen del Día de Sucursal</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setActiveTab('chat');
                            setInputPrompt(
                              'Bloquéale el horario a [Nombre del barbero] mañana de 10:00 a 14:00 por motivo de '
                            );
                          }}
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <Scissors className="mr-2 h-3.5 w-3.5 text-slate-300" />
                          <span>Cerrar Horario de Barbero</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setActiveTab('chat');
                            setInputPrompt(
                              'Habilítale un horario especial a [Nombre del barbero] el día [YYYY-MM-DD] de 10:00 a 15:00'
                            );
                          }}
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <CalendarCheck className="mr-2 h-3.5 w-3.5 text-[#C5A880]" />
                          <span>Habilitar Horario Especial</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleSend(
                              'Revisa el inventario de productos y mis recordatorios pendientes de insumos para decirme qué hace falta pedir o contar.'
                            )
                          }
                          className="rounded-lg text-xs cursor-pointer focus:bg-blue-500/20"
                        >
                          <PackageSearch className="mr-2 h-3.5 w-3.5 text-blue-400" />
                          <span>Checar Stock e Insumos</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* 4. Maximizar / Minimizar en Desktop */}
                <button
                  type="button"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="hidden sm:flex h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 items-center justify-center transition-colors cursor-pointer"
                  title={isExpanded ? 'Contraer ventana' : 'Ampliar a pantalla completa'}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* 5. Botón Cerrar */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                  title="Cerrar asistente"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* =====================================================================
              VISTA 1: INSUMOS Y RECORDATORIOS DE SUCURSAL
              ===================================================================== */}
          {activeTab === 'recordatorios' ? (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-[#C5A880]" />
                  <span>Insumos y Pendientes de Sucursal</span>
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer"
                >
                  ← Volver al Chat
                </button>
              </div>

              {/* Formulario rápido para agregar recordatorio */}
              <div className="p-3 rounded-xl border border-border/60 bg-muted/15 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">
                    {isGeneralOwner
                      ? 'Dejar consigna para Beatriz'
                      : 'Nuevo recordatorio operativo'}
                  </span>
                  <select
                    value={newReminderCat}
                    onChange={(e) => setNewReminderCat(e.target.value as any)}
                    className="text-[11px] bg-background border border-border/60 rounded-lg px-2 py-1 text-foreground"
                  >
                    <option value="insumos">Insumos Barbería</option>
                    <option value="inventario">Conteo Inventario</option>
                    <option value="equipo">Equipo / Barberos</option>
                    <option value="operacion_general">Operación General</option>
                  </select>
                </div>
                <div className="flex gap-1.5">
                  <Input
                    value={newReminderTitle}
                    onChange={(e) => setNewReminderTitle(e.target.value)}
                    placeholder="Ej. Comprar navajas, papel cuello y hacer inventario..."
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddQuickReminder();
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddQuickReminder}
                    disabled={addingReminder || !newReminderTitle.trim()}
                    className="btn-vatos-alfa h-8 px-3 rounded-lg text-xs font-bold shrink-0"
                  >
                    {addingReminder ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Lista de recordatorios */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#C5A880]" />
                    <span>Recordatorios Pendientes ({gerenciaReminders.length})</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      handleSend(
                        'Janet, revisa el inventario de productos y dime qué tenemos con stock bajo o agotado y qué recordatorios tengo pendientes.'
                      )
                    }
                    className="text-[11px] font-semibold text-blue-400 hover:underline cursor-pointer"
                  >
                    Pedir reporte a Janet
                  </button>
                </div>

                {gerenciaReminders.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3 rounded-xl border border-border/50 text-center">
                    Todo al día. No hay recordatorios pendientes.
                  </p>
                ) : (
                  gerenciaReminders.map((rem) => (
                    <div
                      key={rem.id}
                      className="p-2.5 rounded-xl border border-border/60 bg-background flex items-start justify-between gap-2.5"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0 border-border/60 text-muted-foreground uppercase"
                          >
                            {rem.categoria}
                          </Badge>
                          <span className="text-[10px] text-[#C5A880] font-medium">
                            {rem.origen}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground">{rem.titulo}</p>
                        {rem.detalle && (
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            {rem.detalle}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCompleteReminder(rem.id)}
                        className="h-7 px-2.5 rounded-lg border border-border/60 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-blue-500 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                        title="Marcar como realizado"
                      >
                        <Check className="h-3.5 w-3.5 text-blue-400" />
                        <span>Listo</span>
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Alertas de Stock de Productos */}
              <div className="space-y-2 pt-1">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Archive className="h-3.5 w-3.5 text-slate-400" />
                  <span>Productos por Contar / Resurtir ({gerenciaStockAlerts.length})</span>
                </h4>
                {gerenciaStockAlerts.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2.5 rounded-xl border border-border/50">
                    Todos los productos activos tienen stock saludable.
                  </p>
                ) : (
                  <div className="divide-y divide-border/50 rounded-xl border border-border/60 overflow-hidden">
                    {gerenciaStockAlerts.map((prod) => (
                      <div
                        key={prod.id}
                        className="py-2 px-3 flex items-center justify-between text-xs bg-background"
                      >
                        <span className="font-medium text-foreground truncate pr-2">
                          {prod.nombre}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] font-semibold shrink-0 font-sans',
                            prod.stock <= 0 ? 'text-red-400' : 'text-blue-400'
                          )}
                        >
                          Stock: {prod.stock} (Mín: {prod.min})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* =====================================================================
               VISTA 2: PANTALLA DE CHAT CON JANET (EXPERIENCIA COMPLETA ESTILO APP)
               ===================================================================== */
            <>
              {/* Lista de Mensajes */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                {activeAgentMode === 'ceo' && isGeneralOwner ? (
                  ceoMessages.length === 0 ? (
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-border/60 bg-slate-900 mt-0.5">
                        <img
                          src="/janet-avatar.png"
                          alt="Janet"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div
                        style={{
                          fontSize: `${activeFontPx}px`,
                          lineHeight: `${activeFontPx + 6}px`,
                        }}
                        className="max-w-[85%] rounded-2xl rounded-bl-xs px-3.5 py-2.5 bg-muted/35 text-foreground border border-border/60 space-y-1.5"
                      >
                        <p className="font-bold text-foreground flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-[#C5A880] shrink-0" />
                          <span>Hola, soy Janet CEO</span>
                        </p>
                        <p className="text-muted-foreground">
                          Estoy lista para darte el Estado de Resultados en vivo, auditar movimientos de recepción, analizar fotos o estados de cuenta, o escuchar tus notas de voz.
                        </p>
                      </div>
                    </div>
                  ) : (
                    ceoMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex flex-col gap-1.5',
                          msg.rol === 'user' ? 'items-end' : 'items-start'
                        )}
                      >
                        <div
                          className={cn(
                            'flex items-end gap-2 w-full',
                            msg.rol === 'user' ? 'justify-end' : 'justify-start'
                          )}
                        >
                          {msg.rol === 'assistant' && (
                            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-border/60 bg-slate-900 mb-0.5">
                              <img
                                src="/janet-avatar.png"
                                alt="Janet"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          {renderMessageBubbleBody(msg)}
                        </div>

                        {msg.propuestaAccion && (
                          <div className="w-full max-w-[92%] rounded-xl border-2 border-blue-500 bg-background p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-foreground">
                                {msg.propuestaAccion.tituloPropuesta}
                              </span>
                              <Badge variant="outline" className="text-[10px]">
                                {msg.propuestaAccion.estado}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {msg.propuestaAccion.justificacionEstrategica}
                            </p>
                            {msg.propuestaAccion.estado === 'pendiente_aprobacion' && (
                              <div className="flex items-center gap-1.5 pt-1">
                                <Input
                                  type="password"
                                  placeholder="PIN Maestro..."
                                  value={proposalAuthCodeMap[msg.propuestaAccion.id] || ''}
                                  onChange={(e) =>
                                    setProposalAuthCodeMap((prev) => ({
                                      ...prev,
                                      [msg.propuestaAccion!.id]: e.target.value,
                                    }))
                                  }
                                  className="h-8 text-xs"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveCeoProposal(msg.propuestaAccion!.id)}
                                  disabled={executingPropId === msg.propuestaAccion.id}
                                  className="btn-vatos-alfa h-8 px-3 text-xs font-bold shrink-0"
                                >
                                  Autorizar
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )
                ) : gerenciaMessages.length === 0 ? (
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-border/60 bg-slate-900 mt-0.5">
                      <img
                        src="/janet-avatar.png"
                        alt="Janet"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div
                      style={{
                        fontSize: `${activeFontPx}px`,
                        lineHeight: `${activeFontPx + 6}px`,
                      }}
                      className="max-w-[85%] rounded-2xl rounded-bl-xs px-3.5 py-2.5 bg-muted/35 text-foreground border border-border/60 space-y-1.5"
                    >
                      <p className="font-bold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-[#C5A880] shrink-0" />
                        <span>Hola Bety, soy Janet Gerencia</span>
                      </p>
                      <p className="text-muted-foreground">
                        Puedes escribirme o dictarme por nota de voz para cerrar o abrir horarios de barberos, consultar o cancelar citas y ventas, o revisar inventario e insumos.
                      </p>
                    </div>
                  </div>
                ) : (
                  gerenciaMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'flex flex-col gap-1.5',
                        msg.rol === 'user' ? 'items-end' : 'items-start'
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-end gap-2 w-full',
                          msg.rol === 'user' ? 'justify-end' : 'justify-start'
                        )}
                      >
                        {msg.rol === 'assistant' && (
                          <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-border/60 bg-slate-900 mb-0.5">
                            <img
                              src="/janet-avatar.png"
                              alt="Janet"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        {renderMessageBubbleBody(msg)}
                      </div>

                      {/* Tarjeta de Confirmación Operativa */}
                      {msg.propuestaAccion && (
                        <div className="w-full max-w-[94%] rounded-xl border-2 border-blue-500 bg-background p-3 space-y-2 shadow-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {msg.propuestaAccion.tituloPropuesta}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {msg.propuestaAccion.estado === 'ejecutada'
                                ? 'Aplicada'
                                : msg.propuestaAccion.estado === 'rechazada'
                                ? 'Cancelada'
                                : 'Confirmar'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {msg.propuestaAccion.justificacionOperativa}
                          </p>
                          <div className="grid grid-cols-2 gap-2 text-[11px] p-2 rounded-lg bg-muted/20 border border-border/50">
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Actual:</span>
                              <span className="font-medium text-foreground">
                                {msg.propuestaAccion.resumenAntes}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Resultado:</span>
                              <span className="font-medium text-blue-400">
                                {msg.propuestaAccion.resumenDespues}
                              </span>
                            </div>
                          </div>

                          {msg.propuestaAccion.estado === 'pendiente_aprobacion' && (
                            <div className="space-y-2 pt-1">
                              {msg.propuestaAccion.tipoAccion === 'eliminar_venta' && (
                                <Input
                                  type="password"
                                  placeholder="Código de autorización (ej. 1234)..."
                                  value={proposalAuthCodeMap[msg.propuestaAccion.id] || ''}
                                  onChange={(e) =>
                                    setProposalAuthCodeMap((prev) => ({
                                      ...prev,
                                      [msg.propuestaAccion!.id]: e.target.value,
                                    }))
                                  }
                                  className="h-8 text-xs"
                                />
                              )}
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleRejectGerenciaProposal(msg.propuestaAccion!.id)
                                  }
                                  disabled={executingPropId === msg.propuestaAccion.id}
                                  className="h-8 text-xs rounded-lg"
                                >
                                  Descartar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleApproveGerenciaProposal(
                                      msg.propuestaAccion!.id,
                                      msg.propuestaAccion!.tipoAccion
                                    )
                                  }
                                  disabled={executingPropId === msg.propuestaAccion.id}
                                  className="btn-vatos-alfa h-8 px-3 text-xs font-bold rounded-lg"
                                >
                                  {executingPropId === msg.propuestaAccion.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    'Confirmar y Aplicar'
                                  )}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {/* Indicador de Escritura Animado (Idéntico a TypingIndicator del Chat con Clientes) */}
                {isCurrentlySending && (
                  <div className="flex items-end gap-2">
                    <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-border/60 bg-slate-900">
                      <img
                        src="/janet-avatar.png"
                        alt="Janet"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="rounded-2xl rounded-bl-xs px-3.5 py-2 bg-muted/35 border border-border/60 space-y-1">
                      <p className="text-[10.5px] font-semibold text-blue-400">
                        {assistantDisplayName} está analizando...
                      </p>
                      <div className="flex items-center gap-1.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Banner de Previsualización de Imagen / Archivo Adjunto Pendiente */}
              {pendingAttachment && (
                <div className="px-3.5 py-2 bg-[#10172b] border-t border-[#2d3a60] flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {pendingAttachment.isImage ? (
                      <img
                        src={pendingAttachment.dataUrl}
                        alt="Vista previa"
                        className="w-11 h-11 rounded-lg object-cover border border-blue-500 shrink-0"
                      />
                    ) : (
                      <FileText className="h-6 w-6 text-blue-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {pendingAttachment.isImage ? 'Foto seleccionada' : pendingAttachment.fileName}
                      </p>
                      <p className="text-[10.5px] text-slate-400 truncate">
                        {inputPrompt.trim()
                          ? 'Se enviará con tu mensaje'
                          : 'Escribe tu indicación o presiona enviar'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingAttachment(null)}
                    className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-semibold transition-colors shrink-0 cursor-pointer"
                  >
                    Quitar
                  </button>
                </div>
              )}

              {/* =================================================================
                  BARRA INFERIOR DE ENTRADA CON LAS 4 HERRAMIENTAS FUNCIONALES
                  (Emojis, Clip Adjuntar, Cámara, Dictado de Voz / Enviar)
                  ================================================================= */}
              <div className="p-2.5 border-t border-border/60 bg-background shrink-0">
                {isRecordingVoice ? (
                  /* MODO GRABACIÓN / DICTADO DE VOZ EN VIVO */
                  <div className="flex items-center gap-2 bg-muted/25 border border-red-500/35 rounded-full px-2.5 py-1.5 animate-in fade-in duration-150">
                    <button
                      type="button"
                      onClick={handleCancelVoiceRecording}
                      className="w-8 h-8 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-400 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                      title="Cancelar grabación"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                      <span className="text-xs font-bold text-foreground font-sans shrink-0">
                        {formatRecordTime(recordingSeconds)}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {liveVoiceTranscript
                          ? `“${liveVoiceTranscript}”`
                          : 'Escuchando tu voz...'}
                      </span>
                    </div>

                    {liveVoiceTranscript && (
                      <button
                        type="button"
                        onClick={handleConvertDictationToText}
                        className="px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-[11px] font-semibold text-foreground shrink-0 transition-colors cursor-pointer"
                        title="Pasar dictado a texto para editar"
                      >
                        Texto
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleFinishAndSendVoiceNote}
                      className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-xs transition-colors cursor-pointer"
                      title="Enviar nota de voz a Janet"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  /* MODO NORMAL CON LAS 4 HERRAMIENTAS DEL CHAT */
                  <div className="flex items-center gap-1">
                    {/* 1. Selector de Emojis Estilo WhatsApp */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsAttachModalOpen(false);
                        setIsEmojiModalOpen((prev) => !prev);
                      }}
                      className="h-9 w-9 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                      title="Emojis"
                    >
                      <Smile className="h-4 w-4" />
                    </button>

                    {/* 2. Clip Adjuntar Archivos / Galería */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsEmojiModalOpen(false);
                        setIsAttachModalOpen((prev) => !prev);
                      }}
                      className={cn(
                        'h-9 w-9 rounded-lg hover:bg-muted/40 flex items-center justify-center shrink-0 transition-colors cursor-pointer',
                        pendingAttachment ? 'text-blue-400' : 'text-slate-400 hover:text-foreground'
                      )}
                      title="Compartir fotos o documentos desde tu dispositivo"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>

                    {/* 3. Cámara en Vivo */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsEmojiModalOpen(false);
                        setIsAttachModalOpen(false);
                        setIsCameraModalOpen(true);
                      }}
                      className="h-9 w-9 rounded-lg text-slate-400 hover:text-foreground hover:bg-muted/40 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                      title="Abrir cámara para tomar foto"
                    >
                      <Camera className="h-4 w-4" />
                    </button>

                    {/* Campo de Texto Principal */}
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputPrompt}
                      onChange={(e) => setInputPrompt(e.target.value)}
                      onPaste={handlePasteClipboard}
                      style={{ fontSize: `${activeFontPx}px` }}
                      placeholder={
                        pendingAttachment
                          ? `Pregúntale a ${assistantDisplayName} sobre este adjunto...`
                          : `Escribe o dicta para ${assistantDisplayName}...`
                      }
                      className="flex-1 h-9 rounded-full bg-muted/30 border border-border/70 px-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 transition-colors min-w-0"
                      onKeyDown={(e) => {
                        if (chatPrefs.enterToSend && e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />

                    {/* 4. Micrófono (Dictado / Nota de Voz) y Enviar */}
                    {inputPrompt.trim().length > 0 || pendingAttachment ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={handleStartVoiceRecording}
                          disabled={isCurrentlySending}
                          className="h-9 w-9 rounded-full text-slate-400 hover:text-foreground hover:bg-muted/40 flex items-center justify-center transition-colors cursor-pointer"
                          title="Dictar por voz"
                        >
                          <Mic className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSend()}
                          disabled={isCurrentlySending}
                          className="w-9 h-9 rounded-full bg-[#202A49] hover:bg-[#18223c] border border-blue-500/50 text-white flex items-center justify-center shadow-xs transition-colors shrink-0 cursor-pointer"
                          title="Enviar mensaje"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartVoiceRecording}
                        disabled={isCurrentlySending}
                        className="w-9 h-9 rounded-full bg-[#202A49] hover:bg-[#18223c] border border-blue-500/50 text-white flex items-center justify-center shadow-xs transition-colors shrink-0 cursor-pointer"
                        title="Toca para dictar o grabar nota de voz a Janet"
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* =====================================================================
              SUB-MODAL 1: SELECTOR DE EMOJIS ESTILO WHATSAPP
              ===================================================================== */}
          {isEmojiModalOpen && (
            <div className="absolute inset-0 z-[120] bg-black/60 flex flex-col justify-end animate-in fade-in duration-150">
              <div
                className="flex-1"
                onClick={() => setIsEmojiModalOpen(false)}
              />
              <div className="bg-[#10172b] border-t-2 border-blue-500 rounded-t-2xl p-3 space-y-2.5 max-h-[65%] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Smile className="h-4 w-4 text-blue-400" />
                    <span>Emojis Vatos Alfa</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEmojiModalOpen(false)}
                    className="h-7 w-7 rounded-lg text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Categorías */}
                <div className="grid grid-cols-4 gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                  {EMOJI_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveEmojiCat(cat.id)}
                      className={cn(
                        'py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer',
                        activeEmojiCat === cat.id
                          ? 'bg-[#202A49] text-white border border-blue-500/40'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      <span>{cat.icon}</span>
                      <span className="truncate">{cat.label}</span>
                    </button>
                  ))}
                </div>

                {/* Recientes */}
                {recentEmojis.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Recientes
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {recentEmojis.map((em, i) => (
                        <button
                          key={`rec_${i}`}
                          type="button"
                          onClick={() => handleSelectEmoji(em)}
                          className="w-9 h-9 rounded-lg bg-slate-900/70 hover:bg-slate-800 flex items-center justify-center text-lg shrink-0 cursor-pointer"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cuadrícula de Emojis */}
                <div className="flex-1 overflow-y-auto grid grid-cols-7 sm:grid-cols-8 gap-1.5 pt-1">
                  {(
                    EMOJI_CATEGORIES.find((c) => c.id === activeEmojiCat)?.emojis || []
                  ).map((em, idx) => (
                    <button
                      key={`em_${idx}`}
                      type="button"
                      onClick={() => handleSelectEmoji(em)}
                      className="h-9 rounded-lg hover:bg-slate-800/80 flex items-center justify-center text-xl transition-transform active:scale-90 cursor-pointer"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              SUB-MODAL 2: CLIP — COMPARTIR FOTOS Y ARCHIVOS DESDE EL DISPOSITIVO
              ===================================================================== */}
          {isAttachModalOpen && (
            <div className="absolute inset-0 z-[120] bg-black/60 flex flex-col justify-end animate-in fade-in duration-150">
              <div
                className="flex-1"
                onClick={() => setIsAttachModalOpen(false)}
              />
              <div className="bg-[#10172b] border-t-2 border-blue-500 rounded-t-2xl overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Paperclip className="h-4 w-4 text-slate-300" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white">
                        Compartir desde tu Dispositivo
                      </h4>
                      <p className="text-[10.5px] text-slate-300">
                        Envía fotos, estados de cuenta, recibos o capturas a {assistantDisplayName}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAttachModalOpen(false)}
                    className="h-7 w-7 rounded-lg text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-3.5 space-y-2">
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="w-full p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-blue-500/60 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <ImageIcon className="h-5 w-5 text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">Galería de Fotos e Imágenes</p>
                      <p className="text-[11px] text-slate-400">
                        Selecciona una captura, foto de corte, recibo o inventario
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsAttachModalOpen(false);
                      setIsCameraModalOpen(true);
                    }}
                    className="w-full p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-blue-500/60 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <Camera className="h-5 w-5 text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">Cámara del Dispositivo en Vivo</p>
                      <p className="text-[11px] text-slate-400">
                        Toma una foto al instante con tu cámara para que Janet la revise
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    className="w-full p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-blue-500/60 flex items-center gap-3 text-left transition-colors cursor-pointer"
                  >
                    <FileText className="h-5 w-5 text-[#C5A880] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">
                        Adjuntar Comprobante / Estado de Cuenta / PDF
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Comparte un documento, reporte o comprobante SPEI para análisis
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              SUB-MODAL 3: CÁMARA DEL DISPOSITIVO EN VIVO
              ===================================================================== */}
          {isCameraModalOpen && (
            <div className="absolute inset-0 z-[125] bg-[#090d18] flex flex-col animate-in fade-in duration-150">
              <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <Camera className="h-4 w-4 text-slate-300" />
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white">
                      Cámara del Dispositivo
                    </h4>
                    <p className="text-[10.5px] text-slate-300">
                      Toma una foto en vivo para enviarla a {assistantDisplayName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCameraModalOpen(false)}
                  className="h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 p-3.5 flex flex-col justify-between gap-3 overflow-hidden">
                <div className="relative flex-1 rounded-xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center">
                  {capturedCameraDataUrl ? (
                    <img
                      src={capturedCameraDataUrl}
                      alt="Captura"
                      className="w-full h-full object-contain"
                    />
                  ) : cameraError ? (
                    <div className="p-5 text-center space-y-2.5 max-w-xs">
                      <AlertCircle className="h-7 w-7 text-slate-400 mx-auto" />
                      <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
                    </div>
                  ) : (
                    <video
                      ref={cameraVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <canvas ref={cameraCanvasRef} className="hidden" />

                <div className="flex items-center justify-between gap-2 shrink-0">
                  {capturedCameraDataUrl ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCapturedCameraDataUrl(null)}
                        className="h-9 text-xs gap-1.5 border-slate-700 text-slate-200"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Tomar otra</span>
                      </Button>
                      <Button
                        type="button"
                        variant="alfa"
                        size="sm"
                        onClick={handleConfirmCameraSnapshot}
                        className="h-9 text-xs px-5 font-bold"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        <span>Usar esta Foto</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCameraFacingMode((prev) =>
                              prev === 'user' ? 'environment' : 'user'
                            )
                          }
                          className="h-9 text-xs border-slate-700 bg-slate-900 text-slate-200"
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          <span>Girar</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => nativeCameraInputRef.current?.click()}
                          className="h-9 text-xs border-slate-700 bg-slate-900 text-slate-200"
                        >
                          <ImageIcon className="h-3.5 w-3.5 mr-1" />
                          <span>Galería</span>
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="alfa"
                        size="sm"
                        disabled={Boolean(cameraError)}
                        onClick={handleTakeCameraSnapshot}
                        className="h-9 text-xs px-4 font-bold"
                      >
                        <Camera className="h-3.5 w-3.5 mr-1" />
                        <span>Capturar Foto</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              SUB-MODAL 4: PREFERENCIAS VISUALES Y SONIDOS DEL CHAT (IDÉNTICO A LA APP)
              ===================================================================== */}
          {isSettingsModalOpen && (
            <div className="absolute inset-0 z-[125] bg-black/70 flex flex-col justify-end animate-in fade-in duration-150">
              <div className="bg-[#0c1222] border-t-2 border-blue-500 rounded-t-2xl max-h-[92%] flex flex-col overflow-hidden shadow-2xl">
                {/* Header del modal de configuración */}
                <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0 relative overflow-hidden">
                  <div className="header-light-beam" aria-hidden="true" />
                  <div className="relative z-10 flex items-center gap-2.5">
                    <SlidersHorizontal className="h-4 w-4 text-slate-300 shrink-0" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-white">
                        Configuración de Mensajes
                      </h4>
                      <p className="text-[10.5px] text-slate-300">
                        Personaliza colores, tamaño de letra y tono de notificaciones
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSettingsModalOpen(false)}
                    className="relative z-10 h-8 w-8 rounded-lg text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Cuerpo scrollable de Preferencias */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
                  {/* Vista Previa en Vivo */}
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      VISTA PREVIA EN VIVO
                    </span>
                    <div className="flex justify-end">
                      <div
                        style={{
                          backgroundColor: activeBubbleTheme.userBg,
                          borderColor: activeBubbleTheme.userBorder,
                          color: activeBubbleTheme.userText,
                          fontSize: `${activeFontPx}px`,
                        }}
                        className="px-3.5 py-2 rounded-2xl rounded-br-xs border font-medium max-w-[85%]"
                      >
                        ¡Hola {assistantDisplayName}! Dame el resumen del día de hoy 💈
                      </div>
                    </div>
                  </div>

                  {/* 1. Tamaño de Letra del Chat */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Type className="h-4 w-4 text-blue-400" />
                      <span className="text-xs font-bold text-white">
                        Tamaño de Letra del Chat
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {EXEC_FONT_SIZES.map((f) => {
                        const selected = chatPrefs.fontSize === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => updateChatPrefs({ ...chatPrefs, fontSize: f.id })}
                            className={cn(
                              'p-2 rounded-xl border text-center transition-all cursor-pointer',
                              selected
                                ? 'bg-[#202A49] border-blue-500 text-white shadow-xs'
                                : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                            )}
                          >
                            <span className="text-xs font-bold block">{f.label}</span>
                            <span className="text-[10px] text-slate-400 font-sans">
                              {f.px}px
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Color de la Tarjeta de tus Mensajes */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Palette className="h-4 w-4 text-blue-400" />
                      <span className="text-xs font-bold text-white">
                        Color de la Tarjeta de tus Mensajes
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {EXEC_BUBBLE_THEMES.map((theme) => {
                        const selected = chatPrefs.bubbleTheme === theme.id;
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            onClick={() =>
                              updateChatPrefs({ ...chatPrefs, bubbleTheme: theme.id })
                            }
                            className={cn(
                              'p-2 rounded-xl border flex items-center gap-2.5 text-left transition-all cursor-pointer',
                              selected
                                ? 'bg-slate-900 border-blue-500 shadow-xs'
                                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                            )}
                          >
                            <span
                              style={{
                                backgroundColor: theme.userBg,
                                borderColor: theme.userBorder,
                              }}
                              className="w-6 h-6 rounded-full border-2 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-bold text-white block truncate">
                                {theme.name}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">
                                {theme.subtitle}
                              </span>
                            </div>
                            {selected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Tono de Notificaciones de Mensajes */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Volume2 className="h-4 w-4 text-blue-400" />
                      <span className="text-xs font-bold text-white">
                        Tono de Notificaciones de Mensajes
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-200 font-medium">
                        Sonido al recibir respuestas de Janet
                      </span>
                      <Switch
                        checked={chatPrefs.soundAndVibration}
                        onCheckedChange={(val) =>
                          updateChatPrefs({ ...chatPrefs, soundAndVibration: val })
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      {EXEC_TONES.map((tone) => {
                        const selected = chatPrefs.notificationTone === tone.id;
                        return (
                          <div
                            key={tone.id}
                            onClick={() => {
                              updateChatPrefs({ ...chatPrefs, notificationTone: tone.id });
                              triggerFeedbackTone(tone.id);
                            }}
                            className={cn(
                              'p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all',
                              selected
                                ? 'bg-[#202A49]/70 border-blue-500'
                                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                            )}
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white">{tone.name}</p>
                              <p className="text-[10.5px] text-slate-400">{tone.desc}</p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerFeedbackTone(tone.id);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Play className="h-3 w-3" />
                              <span>Probar</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4. Transcripción de Notas de Voz y Restaurar */}
                  <div className="space-y-2 pb-2">
                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-200 font-medium">
                        Mostrar transcripción en notas de voz
                      </span>
                      <Switch
                        checked={chatPrefs.showAudioTranscription}
                        onCheckedChange={(val) =>
                          updateChatPrefs({ ...chatPrefs, showAudioTranscription: val })
                        }
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => updateChatPrefs(DEFAULT_EXEC_CHAT_PREFS)}
                      className="w-full py-2 rounded-xl border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restaurar valores originales</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =====================================================================
              SUB-MODAL 5: FOTO / VIDEO DE PERFIL DE JANET EN PANTALLA COMPLETA
              ===================================================================== */}
          {isJanetPhotoModalOpen && (
            <div className="absolute inset-0 z-[130] bg-black/90 flex flex-col justify-between p-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">{assistantDisplayName}</h4>
                  <p className="text-xs text-slate-400">VATOS ALFA Barber Shop</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsJanetPhotoModalOpen(false)}
                  className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="my-auto mx-auto w-full max-w-[300px] aspect-square rounded-2xl overflow-hidden border-2 border-blue-500 shadow-[0_10px_40px_rgba(59,130,246,0.35)] bg-slate-950">
                <video
                  src="/janet-avatar.mp4"
                  poster="/janet-avatar.png"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="text-center pb-2">
                <p className="text-xs text-slate-400">
                  Asistente Ejecutiva de Inteligencia Artificial • En línea 24/7
                </p>
              </div>
            </div>
          )}

          {/* =====================================================================
              SUB-MODAL 6: VISOR DE IMÁGENES ADJUNTAS EN PANTALLA COMPLETA
              ===================================================================== */}
          {fullscreenImageUri && (
            <div className="absolute inset-0 z-[130] bg-black/95 flex flex-col justify-between p-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">Imagen Adjunta</h4>
                <button
                  type="button"
                  onClick={() => setFullscreenImageUri(null)}
                  className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="my-auto flex items-center justify-center overflow-hidden">
                <img
                  src={fullscreenImageUri}
                  alt="Vista completa"
                  className="max-w-full max-h-[75vh] object-contain rounded-xl"
                />
              </div>
              <div />
            </div>
          )}
        </div>
      )}
    </>
  );
}

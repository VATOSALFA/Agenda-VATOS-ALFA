'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Smile,
  Search,
  Clock,
  Scissors,
  Hand,
  Calendar,
  Heart,
  Sparkles,
  X,
} from 'lucide-react';

export interface EmojiItem {
  char: string;
  keywords: string;
}

export interface EmojiCategory {
  id: string;
  name: string;
   emojis: EmojiItem[];
}

const RECENT_EMOJIS_KEY = 'vatos_alfa_recent_emojis_v1';

const DEFAULT_RECENT_EMOJIS = [
  '💈', '✂️', '😊', '😂', '👍', '🙌', '🔥', '✨', '👌', '🤝', '📅', '⏰', '📍', '💳', '✅', '❤️', '😎', '🙏', '👑', '💯', '🪒',
];

export const WHATSAPP_EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'caritas',
    name: 'Caritas y Emociones',
    emojis: [
      { char: '😀', keywords: 'sonrisa feliz alegre cara' },
      { char: '😃', keywords: 'sonrisa grande feliz' },
      { char: '😄', keywords: 'risa alegre contento' },
      { char: '😁', keywords: 'dientes sonrisa radiante' },
      { char: '😆', keywords: ' carcajada risa ojos cerrados' },
      { char: '😅', keywords: 'sudor risa nerviosa alivio' },
      { char: '🤣', keywords: 'risa suelo carcajada lol' },
      { char: '😂', keywords: 'llorar risa lagrimas lol' },
      { char: '🙂', keywords: 'sonrisa ligera amable' },
      { char: '🙃', keywords: 'al reves broma sarcasmo' },
      { char: '🫠', keywords: 'derritiendo calor verguenza' },
      { char: '😉', keywords: 'guino ojo complice' },
      { char: '😊', keywords: 'sonrojado feliz amable' },
      { char: '😇', keywords: 'angel inocente bendecido' },
      { char: '🥰', keywords: 'enamorado corazones carino' },
      { char: '😍', keywords: 'ojos corazon encanta amor' },
      { char: '🤩', keywords: 'estrellas increible fan genial' },
      { char: '😘', keywords: 'beso corazon' },
      { char: '😗', keywords: 'beso silbido' },
      { char: '☺️', keywords: 'sonrisa calida' },
      { char: '😚', keywords: 'beso ojos cerrados' },
      { char: '😙', keywords: 'beso sonrisa' },
      { char: '🥲', keywords: 'sonrisa lagrima conmovido' },
      { char: '😋', keywords: 'rico delicioso lengua' },
      { char: '😛', keywords: 'lengua broma' },
      { char: '😜', keywords: 'guino lengua loco' },
      { char: '🤪', keywords: 'loco divertido fiesta' },
      { char: '😝', keywords: 'lengua ojos cerrados' },
      { char: '🤑', keywords: 'dinero rico pesos' },
      { char: '🤗', keywords: 'abrazo cordial' },
      { char: '🤭', keywords: 'risa mano boca secreto' },
      { char: '🫢', keywords: 'sorpresa boca tapada' },
      { char: '🫣', keywords: 'espiando tapando ojos' },
      { char: '🤫', keywords: 'silencio shh secreto' },
      { char: '🤔', keywords: 'pensando duda mmm' },
      { char: '🫡', keywords: 'saludo militar a la orden jefe' },
      { char: '🤐', keywords: 'boca cerrada cierre' },
      { char: '🤨', keywords: 'ceja levantada sospecha' },
      { char: '😐', keywords: 'neutral serio' },
      { char: '😑', keywords: 'sin expresion' },
      { char: '😶', keywords: 'sin palabras callado' },
      { char: '🫥', keywords: 'invisible desaparecido' },
      { char: '😏', keywords: 'sonrisa picara' },
      { char: '😒', keywords: 'desagrado aburrido' },
      { char: '🙄', keywords: 'ojos en blanco' },
      { char: '😬', keywords: 'mueca incomodo' },
      { char: '😮‍💨', keywords: 'suspiro alivio cansancio' },
      { char: '🤥', keywords: 'mentira pinocho' },
      { char: '😌', keywords: 'aliviado tranquilo paz' },
      { char: '😔', keywords: 'triste pensativo' },
      { char: '😪', keywords: 'sueno cansado' },
      { char: '🤤', keywords: 'babeando antojo' },
      { char: '😴', keywords: 'durmiendo zzz' },
      { char: '😷', keywords: 'cubrebocas enfermo' },
      { char: '🤒', keywords: 'fiebre termometro' },
      { char: '🤕', keywords: 'venda herido' },
      { char: '🤢', keywords: 'nausea' },
      { char: '🤮', keywords: 'vomito' },
      { char: '🤧', keywords: 'estornudo gripe' },
      { char: '🥵', keywords: 'calor fuego sudando' },
      { char: '🥶', keywords: 'frio congelado hielo' },
      { char: '🥴', keywords: 'mareado fiesta' },
      { char: '😵', keywords: 'mareado sorprendido' },
      { char: '🤯', keywords: 'mente explotando increible wow' },
      { char: '🤠', keywords: 'vaquero sombrero norte' },
      { char: '🥳', keywords: 'fiesta cumpleanos celebracion' },
      { char: '🥸', keywords: 'disfraz bigote lentes' },
      { char: '😎', keywords: 'cool lentes sol estilo' },
      { char: '🤓', keywords: 'nerd lentes inteligente' },
      { char: '🧐', keywords: 'monoculo elegante analizando' },
      { char: '😕', keywords: 'confundido' },
      { char: '🫤', keywords: 'indeciso' },
      { char: '😟', keywords: 'preocupado' },
      { char: '🙁', keywords: 'triste leve' },
      { char: '😮', keywords: 'sorpresa oh' },
      { char: '😯', keywords: 'sorprendido' },
      { char: '😲', keywords: 'asombrado' },
      { char: '😳', keywords: 'sonrojado sorprendido' },
      { char: '🥺', keywords: 'por favor ojitos tiernos' },
      { char: '🥹', keywords: 'emocionado lagrimas orgullo' },
      { char: '😦', keywords: 'sorpresa' },
      { char: '😧', keywords: 'angustia' },
      { char: '😨', keywords: 'miedo susto' },
      { char: '😰', keywords: 'sudor frio preocupado' },
      { char: '😥', keywords: 'alivio triste' },
      { char: '😢', keywords: 'llorando lagrima triste' },
      { char: '😭', keywords: 'llorando mucho llanto' },
      { char: '😱', keywords: 'grito susto sorpresa' },
      { char: '😖', keywords: 'frustrado' },
      { char: '😣', keywords: 'esfuerzo' },
      { char: '😞', keywords: 'decepcionado' },
      { char: '😓', keywords: 'sudor pena' },
      { char: '😩', keywords: 'agotado cansado' },
      { char: '😫', keywords: 'cansado' },
      { char: '🥱', keywords: 'bostezo sueno' },
      { char: '😤', keywords: 'orgullo decidido vapor' },
      { char: '😡', keywords: 'enojado furioso' },
      { char: '😠', keywords: 'molesto' },
      { char: '🤬', keywords: 'groserias muy enojado' },
    ],
  },
  {
    id: 'manos',
    name: 'Manos, Gestos y Personas',
    emojis: [
      { char: '👋', keywords: 'hola adios saludo mano' },
      { char: '🤚', keywords: 'mano levantada alto' },
      { char: '🖐️', keywords: 'cinco dedos mano abierta' },
      { char: '✋', keywords: 'mano stop chocalas' },
      { char: '🖖', keywords: 'saludo vulcano' },
      { char: '🫱', keywords: 'mano derecha ofrecer' },
      { char: '🫲', keywords: 'mano izquierda' },
      { char: '🫳', keywords: 'mano abajo' },
      { char: '🫴', keywords: 'mano arriba ofrecer' },
      { char: '👌', keywords: 'ok perfecto excelente bien' },
      { char: '🤌', keywords: 'italiano que perfeccion' },
      { char: '🤏', keywords: 'poquito pequeno' },
      { char: '✌️', keywords: 'paz victoria dos' },
      { char: '🤞', keywords: 'dedos cruzados suerte' },
      { char: '🫰', keywords: 'corazon coreano dinero' },
      { char: '🤟', keywords: 'te quiero rock' },
      { char: '🤘', keywords: 'rock metal cuernos' },
      { char: '🤙', keywords: 'llamame shaka relax' },
      { char: '👈', keywords: 'izquierda apuntar' },
      { char: '👉', keywords: 'derecha apuntar aqui' },
      { char: '👆', keywords: 'arriba apuntar' },
      { char: '🖕', keywords: 'dedo medio' },
      { char: '👇', keywords: 'abajo apuntar aqui' },
      { char: '☝️', keywords: 'uno atencion arriba' },
      { char: '🫵', keywords: 'tu apuntando' },
      { char: '👍', keywords: 'like bien arriba si ok' },
      { char: '👎', keywords: 'dislike mal abajo no' },
      { char: '✊', keywords: 'puno fuerza' },
      { char: '👊', keywords: 'puno choque bro' },
      { char: '🤛', keywords: 'puno izquierdo' },
      { char: '🤜', keywords: 'puno derecho' },
      { char: '👏', keywords: 'aplausos bravo felicidades' },
      { char: '🙌', keywords: 'manos arriba celebracion genial' },
      { char: '🫶', keywords: 'manos corazon amor gracias' },
      { char: '👐', keywords: 'manos abiertas' },
      { char: '🤲', keywords: 'palmas juntas recibir' },
      { char: '🤝', keywords: 'apreton manos trato acuerdo amigo' },
      { char: '🙏', keywords: 'gracias por favor oracion bendiciones' },
      { char: '✍️', keywords: 'escribiendo firmar nota' },
      { char: '💪', keywords: 'fuerza brazo gym fuerte' },
      { char: '🦾', keywords: 'brazo robotico fuerza' },
      { char: '🤳', keywords: 'selfie foto celular' },
      { char: '💅', keywords: 'cuidado estilo' },
      { char: '🙋‍♂️', keywords: 'hombre levantando mano yo' },
      { char: '🙆‍♂️', keywords: 'hombre ok' },
      { char: '🙅‍♂️', keywords: 'hombre no' },
      { char: '🤷‍♂️', keywords: 'no se duda hombre' },
      { char: '🤦‍♂️', keywords: 'facepalm olvido hombre' },
      { char: '🙇‍♂️', keywords: 'reverencia disculpa gracias' },
      { char: '🕺', keywords: 'bailando fiesta caballero' },
    ],
  },
  {
    id: 'barberia',
    name: 'Barbería, Estilo y VIP',
    emojis: [
      { char: '💈', keywords: 'barberia poste barbero vatos alfa' },
      { char: '✂️', keywords: 'tijeras corte cabello pelo' },
      { char: '🪒', keywords: 'navaja afeitado barba rasurar' },
      { char: '🧔', keywords: 'barba barbudo caballero' },
      { char: '🧔‍♂️', keywords: 'hombre barba estilo' },
      { char: '💇‍♂️', keywords: 'corte cabello hombre peluqueria' },
      { char: '💆‍♂️', keywords: 'masaje facial spa relax' },
      { char: '🧴', keywords: 'locion cera pomada shampoo producto' },
      { char: '🧼', keywords: 'jabon limpieza toalla facial' },
      { char: '🧽', keywords: 'esponja limpieza' },
      { char: '🪮', keywords: 'peine cabello peinado' },
      { char: '🪞', keywords: 'espejo look reflejo' },
      { char: '🚿', keywords: 'lavado agua ducha' },
      { char: '👑', keywords: 'corona rey vip alfa' },
      { char: '🎩', keywords: 'sombrero caballero elegante' },
      { char: '🧢', keywords: 'gorra estilo urbano' },
      { char: '🕶️', keywords: 'lentes sol oscuro cool' },
      { char: '👔', keywords: 'corbata camisa ejecutivo formal' },
      { char: '👕', keywords: 'playera ropa' },
      { char: '🧥', keywords: 'saco abrigo elegante' },
      { char: '👖', keywords: 'pantalon jeans' },
      { char: '👟', keywords: 'tenis calzado urbano' },
      { char: '👞', keywords: 'zapato formal caballero' },
      { char: '⌚', keywords: 'reloj tiempo lujo' },
      { char: '💎', keywords: 'diamante lujo vip joya' },
      { char: '🏆', keywords: 'trofeo campeon premio pase alfa' },
      { char: '🥇', keywords: 'medalla oro primer lugar' },
      { char: '🎖️', keywords: 'insignia honor vip' },
      { char: '⭐', keywords: 'estrella favorito calificacion' },
      { char: '🌟', keywords: 'estrella brillante exito' },
      { char: '✨', keywords: 'brillos limpio nuevo magia' },
      { char: '🔥', keywords: 'fuego increible top tendencia' },
      { char: '⚡', keywords: 'rayo rapido energia express' },
      { char: '💯', keywords: 'cien perfecto excelente' },
      { char: '🎯', keywords: 'diana exacto objetivo' },
      { char: '🦁', keywords: 'leon alfa lider melena' },
      { char: '🐺', keywords: 'lobo manada alfa' },
      { char: '🦅', keywords: 'aguila altura' },
    ],
  },
  {
    id: 'citas',
    name: 'Citas, Ubicación y Pagos',
    emojis: [
      { char: '📅', keywords: 'calendario fecha cita dia' },
      { char: '📆', keywords: 'agenda calendario dia' },
      { char: '🗓️', keywords: 'calendario espiral agenda' },
      { char: '🕒', keywords: 'reloj hora tres horario' },
      { char: '🕓', keywords: 'reloj hora cuatro' },
      { char: '🕔', keywords: 'reloj hora cinco' },
      { char: '⏰', keywords: 'despertador alarma puntualidad hora' },
      { char: '⏱️', keywords: 'cronometro tiempo duracion' },
      { char: '⏳', keywords: 'reloj arena espera pendiente' },
      { char: '⌛', keywords: 'reloj arena tiempo' },
      { char: '📍', keywords: 'pin ubicacion direccion mapa sucursal' },
      { char: '📌', keywords: 'tachuela nota importante' },
      { char: '🗺️', keywords: 'mapa ubicacion llegar' },
      { char: '🧭', keywords: 'brujula direccion' },
      { char: '🚗', keywords: 'auto coche estacionamiento llegar' },
      { char: '🚙', keywords: 'camioneta estacionamiento' },
      { char: '🏍️', keywords: 'moto motocicleta' },
      { char: '🅿️', keywords: 'estacionamiento parking cajon' },
      { char: '🏢', keywords: 'edificio local sucursal' },
      { char: '🏪', keywords: 'tienda comercio' },
      { char: '💳', keywords: 'tarjeta credito debito pago' },
      { char: '💰', keywords: 'bolsa dinero precio pesos' },
      { char: '💵', keywords: 'billete efectivo pago' },
      { char: '💸', keywords: 'dinero transferencia pago' },
      { char: '🪙', keywords: 'moneda alfacoin puntos' },
      { char: '🏦', keywords: 'banco spei transferencia clabe' },
      { char: '🧾', keywords: 'recibo ticket comprobante nota' },
      { char: '📲', keywords: 'celular app movil transferencia' },
      { char: '📱', keywords: 'telefono smartphone app' },
      { char: '📞', keywords: 'telefono llamada contacto' },
      { char: '☎️', keywords: 'telefono fijo recepcion' },
      { char: '💬', keywords: 'mensaje chat burbuja' },
      { char: '🗨️', keywords: 'chat comentario' },
      { char: '📩', keywords: 'correo mensaje recibido' },
      { char: '🔔', keywords: 'campana notificacion recordatorio' },
      { char: '🔕', keywords: 'silencio sin notificacion' },
      { char: '✅', keywords: 'check confirmado listo si verde' },
      { char: '☑️', keywords: 'check marcado' },
      { char: '✔️', keywords: 'palomita listo' },
      { char: '❌', keywords: 'cruz cancelar no error' },
      { char: '⚠️', keywords: 'advertencia aviso importante' },
      { char: 'ℹ️', keywords: 'informacion detalles' },
      { char: '🔒', keywords: 'candado cerrado seguro privado' },
      { char: '🔓', keywords: 'candado abierto' },
      { char: '🔑', keywords: 'llave acceso' },
      { char: '🛡️', keywords: 'escudo seguridad garantia' },
      { char: '📎', keywords: 'clip archivo adjunto' },
      { char: '📄', keywords: 'documento archivo pdf' },
    ],
  },
  {
    id: 'corazones',
    name: 'Corazones, Fiesta y Más',
    emojis: [
      { char: '❤️', keywords: 'corazon rojo amor gracias' },
      { char: '💙', keywords: 'corazon azul vatos alfa' },
      { char: '🩵', keywords: 'corazon celeste' },
      { char: '🖤', keywords: 'corazon negro elegante' },
      { char: '🤍', keywords: 'corazon blanco' },
      { char: '🧡', keywords: 'corazon naranja' },
      { char: '🤎', keywords: 'corazon cafe' },
      { char: '❤️‍🔥', keywords: 'corazon fuego pasion' },
      { char: '💔', keywords: 'corazon roto' },
      { char: '❣️', keywords: 'corazon exclamacion' },
      { char: '💕', keywords: 'dos corazones' },
      { char: '💞', keywords: 'corazones girando' },
      { char: '💓', keywords: 'corazon latiendo' },
      { char: '💗', keywords: 'corazon creciendo' },
      { char: '💖', keywords: 'corazon brillante' },
      { char: '💘', keywords: 'corazon flecha' },
      { char: '💝', keywords: 'corazon regalo' },
      { char: '🎉', keywords: 'fiesta confeti felicidades' },
      { char: '🎊', keywords: 'confeti celebracion' },
      { char: '🎈', keywords: 'globo cumpleanos fiesta' },
      { char: '🎂', keywords: 'pastel cumpleanos festejo' },
      { char: '🎁', keywords: 'regalo cortesia promocion' },
      { char: '🎀', keywords: 'mono regalo' },
      { char: '🎆', keywords: 'fuegos artificiales' },
      { char: '🎇', keywords: 'bengala celebracion' },
      { char: '🥂', keywords: 'brindis copas celebracion' },
      { char: '🍻', keywords: 'cervezas brindis amigos' },
      { char: '🍺', keywords: 'cerveza tarro cortesia' },
      { char: '🥃', keywords: 'whisky vaso trago' },
      { char: '☕', keywords: 'cafe taza cortesia' },
      { char: '🥤', keywords: 'refresco bebida agua' },
      { char: '🧊', keywords: 'hielo fresco' },
      { char: '🎵', keywords: 'musica nota' },
      { char: '🎶', keywords: 'notas musicales ambiente' },
      { char: '🎧', keywords: 'audifonos musica' },
      { char: '🎤', keywords: 'microfono audio voz' },
      { char: '📸', keywords: 'camara flash foto' },
      { char: '📷', keywords: 'camara foto' },
      { char: '🎥', keywords: 'video camara cine' },
      { char: '🛍️', keywords: 'bolsas compras tienda productos' },
      { char: '🛒', keywords: 'carrito compras tienda' },
      { char: '📦', keywords: 'paquete caja pedido' },
      { char: '🏷️', keywords: 'etiqueta promocion descuento' },
      { char: '💡', keywords: 'idea foco consejo tip' },
      { char: '🚀', keywords: 'cohete rapido lanzamiento' },
      { char: '☀️', keywords: 'sol buenos dias manana' },
      { char: '🌙', keywords: 'luna buenas noches tarde' },
      { char: '🌧️', keywords: 'lluvia clima' },
    ],
  },
];

interface WhatsAppEmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
}

export function WhatsAppEmojiPicker({
  onSelectEmoji,
  disabled = false,
  align = 'end',
}: WhatsAppEmojiPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('caritas');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(DEFAULT_RECENT_EMOJIS);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(RECENT_EMOJIS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRecentEmojis(parsed);
        }
      }
    } catch (_) {}
  }, []);

  const handlePick = (emoji: string) => {
    onSelectEmoji(emoji);
    setRecentEmojis((prev) => {
      const updated = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 21);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
        } catch (_) {}
      }
      return updated;
    });
  };

  const filteredEmojis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const all: EmojiItem[] = [];
    const seen = new Set<string>();
    for (const cat of WHATSAPP_EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (
          !seen.has(item.char) &&
          (item.keywords.toLowerCase().includes(q) ||
            cat.name.toLowerCase().includes(q) ||
            item.char.includes(q))
        ) {
          seen.add(item.char);
          all.push(item);
        }
      }
    }
    return all;
  }, [searchQuery]);

  const currentCategory = useMemo(() => {
    return WHATSAPP_EMOJI_CATEGORIES.find((c) => c.id === activeTab) || WHATSAPP_EMOJI_CATEGORIES[0];
  }, [activeTab]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-8 w-8 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="Insertar emojis estilo WhatsApp"
        >
          <Smile className="w-4 h-4 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-80 sm:w-96 p-0 rounded-xl z-50 mb-2 border-2 border-blue-500 bg-[#0f1628] text-white shadow-[0_10px_30px_rgba(59,130,246,0.22)] overflow-hidden"
      >
        {/* Cabecera y Buscador de Emojis */}
        <div className="p-2.5 bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] border-b border-slate-800 space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Smile className="w-3.5 h-3.5 text-slate-300" />
              Emojis
            </span>
            <span className="text-[10px] text-slate-300">
              Estilo WhatsApp • Clic para insertar
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar emoji (ej. corte, risa, fuego, cita, ok)..."
              className="h-7 pl-8 pr-7 text-xs bg-[#0b101e] border-slate-700/80 text-white placeholder:text-slate-500 rounded-lg focus-visible:ring-1 focus-visible:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Pestañas de Categorías (Ocultas cuando se busca por texto) */}
        {!searchQuery.trim() && (
          <div className="flex items-center justify-between px-2 py-1.5 bg-[#131c33] border-b border-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveTab('recientes')}
              className={`flex-1 py-1 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'recientes'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Recientes y frecuentes"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('caritas')}
              className={`flex-1 py-1 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'caritas'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Caritas y Emociones"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('manos')}
              className={`flex-1 py-1 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'manos'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Manos y Gestos"
            >
              <Hand className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('barberia')}
              className={`flex-1 py-1 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'barberia'
                  ? 'bg-blue-500/20 text-[#C5A880] border border-[#C5A880]/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Barbería, Estilo y VIP"
            >
              <Scissors className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('citas')}
              className={`flex-1 py-1 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'citas'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Citas, Ubicación y Pagos"
            >
              <Calendar className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('corazones')}
              className={`flex-1 py-1 rounded-lg flex items-center justify-center transition-colors ${
                activeTab === 'corazones'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              title="Corazones, Celebración y Objetos"
            >
              <Heart className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Cuadrícula de Emojis con Scroll Azul Vatos Alfa */}
        <div className="p-2.5 max-h-64 overflow-y-auto space-y-2.5">
          {filteredEmojis !== null ? (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block px-1">
                Resultados ({filteredEmojis.length})
              </span>
              {filteredEmojis.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  No se encontraron emojis para &ldquo;{searchQuery}&rdquo;
                </p>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {filteredEmojis.map((item, idx) => (
                    <button
                      key={`${item.char}-${idx}`}
                      type="button"
                      onClick={() => handlePick(item.char)}
                      className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-blue-500/20 hover:scale-110 active:scale-95 transition-all cursor-pointer select-none"
                      title={item.keywords}
                    >
                      {item.char}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'recientes' ? (
            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 px-1">
                <Clock className="w-3 h-3 text-slate-400" /> Usados recientemente
              </span>
              <div className="grid grid-cols-7 gap-1">
                {recentEmojis.map((emoji, idx) => (
                  <button
                    key={`rec-${idx}`}
                    type="button"
                    onClick={() => handlePick(emoji)}
                    className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-blue-500/20 hover:scale-110 active:scale-95 transition-all cursor-pointer select-none"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Barra rápida de recientes arriba */}
              <div className="pb-1.5 border-b border-slate-800/80">
                <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider block px-1 mb-1">
                  Frecuentes
                </span>
                <div className="grid grid-cols-7 gap-1">
                  {recentEmojis.slice(0, 7).map((emoji, idx) => (
                    <button
                      key={`freq-${idx}`}
                      type="button"
                      onClick={() => handlePick(emoji)}
                      className="w-9 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-blue-500/20 hover:scale-110 active:scale-95 transition-all cursor-pointer select-none"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1 px-1">
                  <Sparkles className="w-3 h-3 text-[#C5A880]" />
                  {currentCategory.name}
                </span>
                <div className="grid grid-cols-7 gap-1">
                  {currentCategory.emojis.map((item, idx) => (
                    <button
                      key={`${currentCategory.id}-${idx}`}
                      type="button"
                      onClick={() => handlePick(item.char)}
                      className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-blue-500/20 hover:scale-110 active:scale-95 transition-all cursor-pointer select-none"
                      title={item.keywords}
                    >
                      {item.char}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

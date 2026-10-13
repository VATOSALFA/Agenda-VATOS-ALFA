'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShieldCheck,
  CreditCard,
  Clock,
  Save,
  Loader2,
  AlertTriangle,
  Info,
  CalendarCheck2,
  CalendarX2,
  UserX,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Minus,
  Plus,
  Trash2,
  Edit,
  SlidersHorizontal,
  Calendar,
  DollarSign,
  Scissors,
  Hourglass,
  Tag,
  UserCheck,
  FileText,
  Bell,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase-client';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { logAuditAction } from '@/lib/audit-logger';
import { cn } from '@/lib/utils';
import {
  DEFAULT_BOOKING_RULES,
  ReglasReservasConfig,
  ReglaPersonalizada,
  CondicionMomentoTipo,
  ConsecuenciaTipo,
  TipoAvisoAgenda,
  ReglaAvisoAgenda,
  DEFAULT_AVISOS_AGENDA_RULES,
} from '@/lib/booking-rules';

export default function BookingRulesPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rules, setRules] = useState<ReglasReservasConfig>(DEFAULT_BOOKING_RULES);

  // Secciones base minimizadas por defecto
  const [openSections, setOpenSections] = useState<{
    general: boolean;
    antifraud: boolean;
    cancellation: boolean;
    timing: boolean;
    agendaNotices: boolean;
    customRules: boolean;
  }>({
    general: false,
    antifraud: false,
    cancellation: false,
    timing: false,
    agendaNotices: false,
    customRules: false,
  });

  // Estado de apertura para reglas personalizadas (minimizadas por defecto)
  const [openCustomRules, setOpenCustomRules] = useState<Record<string, boolean>>({});

  // Estado del Modal de Nueva / Editar Regla de Reserva
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const [formNombre, setFormNombre] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formActiva, setFormActiva] = useState(true);

  // En qué momento se aplica
  const [formCondTipo, setFormCondTipo] = useState<CondicionMomentoTipo>('dias_semana');
  const [formDias, setFormDias] = useState<string[]>(['viernes', 'sabado', 'domingo']);
  const [formMontoMinimo, setFormMontoMinimo] = useState<number>(250);
  const [formCantidadServicios, setFormCantidadServicios] = useState<number>(2);
  const [formDuracionMinima, setFormDuracionMinima] = useState<number>(60);
  const [formHoraInicio, setFormHoraInicio] = useState<string>('18:00');
  const [formHoraFin, setFormHoraFin] = useState<string>('21:00');
  const [formCategoria, setFormCategoria] = useState<string>('Paquetes');

  // Qué consecuencia tiene
  const [formConsTipo, setFormConsTipo] = useState<ConsecuenciaTipo>('exigir_anticipo');
  const [formTipoAnticipo, setFormTipoAnticipo] = useState<'porcentaje' | 'monto_fijo'>('porcentaje');
  const [formValorAnticipo, setFormValorAnticipo] = useState<number>(50);
  const [formTiempoAnticipacionHoras, setFormTiempoAnticipacionHoras] = useState<number>(24);
  const [formMensajeCliente, setFormMensajeCliente] = useState<string>('');

  // Estado del Modal de Nueva / Editar Regla de Aviso de Agenda
  const [isAvisoModalOpen, setIsAvisoModalOpen] = useState(false);
  const [editingAvisoRuleId, setEditingAvisoRuleId] = useState<string | null>(null);
  const [formAvisoNombre, setFormAvisoNombre] = useState('');
  const [formAvisoDescripcion, setFormAvisoDescripcion] = useState('');
  const [formAvisoActiva, setFormAvisoActiva] = useState(true);
  const [formAvisoTipo, setFormAvisoTipo] = useState<TipoAvisoAgenda>('recordatorio_whatsapp');
  const [formAvisoAnticipacionMinutos, setFormAvisoAnticipacionMinutos] = useState<number>(120);
  const [formAvisoUrgenteMinutos, setFormAvisoUrgenteMinutos] = useState<number>(60);
  const [formAvisoOmitirMinutos, setFormAvisoOmitirMinutos] = useState<number>(45);
  const [formAvisoToleranciaMinutos, setFormAvisoToleranciaMinutos] = useState<number>(10);
  const [formAvisoCanal, setFormAvisoCanal] = useState<'whatsapp' | 'pantalla' | 'ambos'>('whatsapp');

  const toggleSection = (
    section: 'general' | 'antifraud' | 'cancellation' | 'timing' | 'agendaNotices' | 'customRules'
  ) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleCustomRule = (ruleId: string) => {
    setOpenCustomRules((prev) => ({ ...prev, [ruleId]: !prev[ruleId] }));
  };

  const handleExpandAll = () => {
    setOpenSections({
      general: true,
      antifraud: true,
      cancellation: true,
      timing: true,
      agendaNotices: true,
      customRules: true,
    });
    const allCustom: Record<string, boolean> = {};
    (rules.reglas_personalizadas || []).forEach((r) => {
      allCustom[r.id] = true;
    });
    setOpenCustomRules(allCustom);
  };

  const handleCollapseAll = () => {
    setOpenSections({
      general: false,
      antifraud: false,
      cancellation: false,
      timing: false,
      agendaNotices: false,
      customRules: false,
    });
    setOpenCustomRules({});
  };

  useEffect(() => {
    if (!db) return;

    const fetchRules = async () => {
      setLoading(true);
      try {
        // 1. Cargar configuracion/reglas_reservas
        const reglasRef = doc(db, 'configuracion', 'reglas_reservas');
        const reglasSnap = await getDoc(reglasRef);

        // 2. Cargar configuracion/servicios para retrocompatibilidad
        const serviciosRef = doc(db, 'configuracion', 'servicios');
        const serviciosSnap = await getDoc(serviciosRef);

        const currentRules: ReglasReservasConfig = { ...DEFAULT_BOOKING_RULES };

        if (serviciosSnap.exists()) {
          const sData = serviciosSnap.data();
          if (typeof sData.anticipo_monto_minimo_activo === 'boolean') {
            currentRules.anticipo_monto_minimo_activo = sData.anticipo_monto_minimo_activo;
          }
          if (Number(sData.anticipo_monto_minimo) > 0) {
            currentRules.anticipo_monto_minimo = Number(sData.anticipo_monto_minimo);
          }
          if (Number(sData.anticipo_porcentaje_defecto) > 0) {
            currentRules.anticipo_porcentaje_defecto = Number(sData.anticipo_porcentaje_defecto);
          }
        }

        if (reglasSnap.exists()) {
          const rData = reglasSnap.data() as Partial<ReglasReservasConfig>;
          Object.assign(currentRules, rData);
          if (Array.isArray(rData.reglas_personalizadas)) {
            currentRules.reglas_personalizadas = rData.reglas_personalizadas;
          }
          if (Array.isArray(rData.reglas_avisos_agenda) && rData.reglas_avisos_agenda.length > 0) {
            currentRules.reglas_avisos_agenda = rData.reglas_avisos_agenda;
          }
        }

        // Asegurar que las reglas base de avisos de agenda siempre existan
        const baseAvisos = [...DEFAULT_AVISOS_AGENDA_RULES];
        const loadedAvisos = currentRules.reglas_avisos_agenda || [];
        const mergedAvisos = [...loadedAvisos];
        baseAvisos.forEach((baseRule) => {
          const existing = mergedAvisos.find((r) => r.id === baseRule.id || r.tipo === baseRule.tipo);
          if (!existing) {
            mergedAvisos.unshift(baseRule);
          }
        });
        currentRules.reglas_avisos_agenda = mergedAvisos;

        if (!currentRules.penalizacion_inasistencias_descripcion) {
          currentRules.penalizacion_inasistencias_descripcion =
            DEFAULT_BOOKING_RULES.penalizacion_inasistencias_descripcion;
        }
        if (!currentRules.anticipo_monto_minimo_descripcion) {
          currentRules.anticipo_monto_minimo_descripcion =
            DEFAULT_BOOKING_RULES.anticipo_monto_minimo_descripcion;
        }
        if (!currentRules.cancelacion_politica_descripcion) {
          currentRules.cancelacion_politica_descripcion =
            DEFAULT_BOOKING_RULES.cancelacion_politica_descripcion;
        }

        setRules(currentRules);
      } catch (error) {
        console.error('Error cargando reglas de reserva:', error);
        toast({
          variant: 'destructive',
          title: 'Error al cargar reglas',
          description: 'No se pudieron obtener las reglas de reserva actuales.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, [toast]);

  const handleSave = async () => {
    if (!db) return;
    setIsSaving(true);

    try {
      const payload: ReglasReservasConfig = {
        ...rules,
        anticipo_monto_minimo: Number(rules.anticipo_monto_minimo) || 0,
        anticipo_porcentaje_defecto: Number(rules.anticipo_porcentaje_defecto) || 50,
        anticipo_monto_minimo_descripcion: rules.anticipo_monto_minimo_descripcion || '',
        max_inasistencias_permitidas: Math.max(1, Number(rules.max_inasistencias_permitidas) || 2),
        penalizacion_anticipo_porcentaje: Number(rules.penalizacion_anticipo_porcentaje) || 50,
        penalizacion_inasistencias_descripcion: rules.penalizacion_inasistencias_descripcion || '',
        cancelacion_politica_activa: rules.cancelacion_politica_activa !== false,
        cancelacion_tiempo_minimo_horas: Math.max(1, Number(rules.cancelacion_tiempo_minimo_horas) || 2),
        cancelacion_retencion_anticipo_porcentaje: Math.min(100, Math.max(0, Number(rules.cancelacion_retencion_anticipo_porcentaje) || 100)),
        cancelacion_saldo_favor_vigencia_dias: Math.max(1, Number(rules.cancelacion_saldo_favor_vigencia_dias) || 30),
        cancelacion_politica_descripcion: rules.cancelacion_politica_descripcion || '',
        tiempo_minimo_anticipacion_minutos: Number(rules.tiempo_minimo_anticipacion_minutos) || 30,
        dias_maximos_futuro: Number(rules.dias_maximos_futuro) || 14,
        tolerancia_puntualidad_minutos: Number(rules.tolerancia_puntualidad_minutos) || 10,
        intervalo_horarios_minutos: Number(rules.intervalo_horarios_minutos) || 30,
        reglas_personalizadas: rules.reglas_personalizadas || [],
        reglas_avisos_agenda: rules.reglas_avisos_agenda || DEFAULT_AVISOS_AGENDA_RULES,
        actualizado_el: Timestamp.now(),
        actualizado_por: user?.email || 'admin',
      };

      // 1. Guardar en documento principal configuracion/reglas_reservas
      const reglasRef = doc(db, 'configuracion', 'reglas_reservas');
      await setDoc(reglasRef, payload, { merge: true });

      // 2. Mantener sincronizado configuracion/servicios (retrocompatibilidad)
      const serviciosRef = doc(db, 'configuracion', 'servicios');
      await setDoc(
        serviciosRef,
        {
          anticipo_monto_minimo_activo: payload.anticipo_monto_minimo_activo,
          anticipo_monto_minimo: payload.anticipo_monto_minimo,
          anticipo_porcentaje_defecto: payload.anticipo_porcentaje_defecto,
          anticipo_monto_minimo_descripcion: payload.anticipo_monto_minimo_descripcion,
          penalizacion_inasistencias_activa: payload.penalizacion_inasistencias_activa,
          max_inasistencias_permitidas: payload.max_inasistencias_permitidas,
          penalizacion_anticipo_porcentaje: payload.penalizacion_anticipo_porcentaje,
          penalizacion_inasistencias_descripcion: payload.penalizacion_inasistencias_descripcion,
          reglas_personalizadas: payload.reglas_personalizadas || [],
          reglas_avisos_agenda: payload.reglas_avisos_agenda || [],
          actualizado_el: Timestamp.now(),
          actualizado_por: user?.email || 'admin',
        },
        { merge: true }
      );

      // 3. Mantener sincronizado settings/website slotInterval (retrocompatibilidad total)
      const websiteRef = doc(db, 'settings', 'website');
      await setDoc(
        websiteRef,
        {
          slotInterval: Number(payload.intervalo_horarios_minutos) || 30,
          minReservationTime: Math.round((Number(payload.tiempo_minimo_anticipacion_minutos) || 30) / 60),
          maxFutureTime: Number(payload.dias_maximos_futuro) || 14
        },
        { merge: true }
      );

      // 4. Auditoría
      await logAuditAction({
        action: 'Modificar Reglas de Reservas',
        details: `Umbral: $${payload.anticipo_monto_minimo} (${payload.anticipo_porcentaje_defecto}%). Reglas pers.: ${(payload.reglas_personalizadas || []).length}. Reglas avisos: ${(payload.reglas_avisos_agenda || []).length}.`,
        userId: user?.uid || 'unknown',
        userName: user?.displayName || user?.email || 'Unknown',
        userRole: user?.role,
        severity: 'info',
      });

      toast({
        title: '¡Reglas Guardadas!',
        description: 'Las políticas de reserva y avisos de agenda han sido actualizadas con éxito.',
      });
    } catch (error: any) {
      console.error('Error guardando reglas de reserva:', error);
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: error.message || 'No se pudieron guardar las reglas.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --- MANEJADORES DE AVISOS DE AGENDA ---
  const handleOpenNewAvisoModal = () => {
    setEditingAvisoRuleId(null);
    setFormAvisoNombre('');
    setFormAvisoDescripcion('');
    setFormAvisoActiva(true);
    setFormAvisoTipo('recordatorio_whatsapp');
    setFormAvisoAnticipacionMinutos(120);
    setFormAvisoUrgenteMinutos(60);
    setFormAvisoOmitirMinutos(45);
    setFormAvisoToleranciaMinutos(10);
    setFormAvisoCanal('whatsapp');
    setIsAvisoModalOpen(true);
  };

  const handleOpenEditAvisoModal = (aviso: ReglaAvisoAgenda) => {
    setEditingAvisoRuleId(aviso.id);
    setFormAvisoNombre(aviso.nombre);
    setFormAvisoDescripcion(aviso.descripcion || '');
    setFormAvisoActiva(aviso.activa !== false);
    setFormAvisoTipo(aviso.tipo || 'recordatorio_whatsapp');
    setFormAvisoAnticipacionMinutos(aviso.tiempo_anticipacion_minutos ?? 120);
    setFormAvisoUrgenteMinutos(aviso.tiempo_urgente_minutos ?? 60);
    setFormAvisoOmitirMinutos(aviso.omitir_si_creada_en_minutos ?? 45);
    setFormAvisoToleranciaMinutos(aviso.tolerancia_retraso_minutos ?? 10);
    setFormAvisoCanal(aviso.canal || (aviso.tipo === 'recordatorio_whatsapp' ? 'whatsapp' : 'pantalla'));
    setIsAvisoModalOpen(true);
  };

  const getDefaultAvisoName = (tipo: TipoAvisoAgenda) => {
    switch (tipo) {
      case 'recordatorio_whatsapp':
        return 'Recordatorio Preventivo de WhatsApp';
      case 'cita_atrasada_asistencia':
        return 'Alerta de Cita Atrasada sin Asistencia';
      case 'anticipo_pendiente':
        return 'Aviso de Cita con Anticipo Pendiente';
      case 'cliente_nuevo':
        return 'Aviso de Cliente Nuevo en Recepción';
      case 'servicio_especial':
        return 'Aviso de Cita Larga / Paquete';
      default:
        return 'Regla para Aviso de Agenda';
    }
  };

  const handleSaveAvisoModal = () => {
    const finalName = formAvisoNombre.trim() || getDefaultAvisoName(formAvisoTipo);
    const newAviso: ReglaAvisoAgenda = {
      id: editingAvisoRuleId || `aviso_${Date.now()}`,
      nombre: finalName,
      descripcion: formAvisoDescripcion.trim() || undefined,
      activa: formAvisoActiva,
      tipo: formAvisoTipo,
      tiempo_anticipacion_minutos:
        formAvisoTipo === 'recordatorio_whatsapp' || formAvisoTipo === 'servicio_especial' || formAvisoTipo === 'personalizado'
          ? Number(formAvisoAnticipacionMinutos) || 120
          : undefined,
      tiempo_urgente_minutos:
        formAvisoTipo === 'recordatorio_whatsapp'
          ? Number(formAvisoUrgenteMinutos) || 60
          : undefined,
      omitir_si_creada_en_minutos:
        formAvisoTipo === 'recordatorio_whatsapp'
          ? Number(formAvisoOmitirMinutos) || 45
          : undefined,
      tolerancia_retraso_minutos:
        formAvisoTipo === 'cita_atrasada_asistencia'
          ? Number(formAvisoToleranciaMinutos) || 10
          : undefined,
      canal: formAvisoCanal,
      es_sistema: editingAvisoRuleId === 'aviso_recordatorio_whatsapp' || editingAvisoRuleId === 'aviso_cita_atrasada',
      creada_el: new Date().toISOString(),
    };

    setRules((prev) => {
      const currentList = prev.reglas_avisos_agenda || DEFAULT_AVISOS_AGENDA_RULES;
      const updatedList = editingAvisoRuleId
        ? currentList.map((r) => (r.id === editingAvisoRuleId ? { ...r, ...newAviso } : r))
        : [...currentList, newAviso];
      return { ...prev, reglas_avisos_agenda: updatedList };
    });

    setIsAvisoModalOpen(false);
    toast({
      title: editingAvisoRuleId ? 'Regla de aviso actualizada' : 'Nueva regla de aviso creada',
      description: `"${finalName}" configurada. Guarda cambios para sincronizar con la agenda.`,
    });
  };

  const updateAvisoRule = (ruleId: string, updates: Partial<ReglaAvisoAgenda>) => {
    setRules((prev) => {
      const currentList = prev.reglas_avisos_agenda || DEFAULT_AVISOS_AGENDA_RULES;
      const updated = currentList.map((r) =>
        r.id === ruleId ? { ...r, ...updates } : r
      );
      return { ...prev, reglas_avisos_agenda: updated };
    });
  };

  const handleDeleteAvisoRule = (ruleId: string) => {
    setRules((prev) => {
      const currentList = prev.reglas_avisos_agenda || DEFAULT_AVISOS_AGENDA_RULES;
      const filtered = currentList.filter((r) => r.id !== ruleId);
      return { ...prev, reglas_avisos_agenda: filtered };
    });
    toast({
      title: 'Regla de aviso eliminada',
      description: 'La regla de aviso ha sido removida.',
    });
  };

  const getAvisoIcon = (tipo: TipoAvisoAgenda) => {
    switch (tipo) {
      case 'recordatorio_whatsapp':
        return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
      case 'cita_atrasada_asistencia':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'anticipo_pendiente':
        return <CreditCard className="h-4 w-4 text-muted-foreground" />;
      case 'cliente_nuevo':
        return <UserCheck className="h-4 w-4 text-muted-foreground" />;
      case 'servicio_especial':
        return <Scissors className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // --- MODAL HANDLERS ---
  const handleOpenNewRuleModal = () => {
    setEditingRuleId(null);
    setFormNombre('');
    setFormDescripcion('');
    setFormActiva(true);
    setFormCondTipo('dias_semana');
    setFormDias(['viernes', 'sabado', 'domingo']);
    setFormMontoMinimo(250);
    setFormCantidadServicios(2);
    setFormDuracionMinima(60);
    setFormHoraInicio('18:00');
    setFormHoraFin('21:00');
    setFormCategoria('Paquetes');
    setFormConsTipo('exigir_anticipo');
    setFormTipoAnticipo('porcentaje');
    setFormValorAnticipo(50);
    setFormTiempoAnticipacionHoras(24);
    setFormMensajeCliente('');
    setIsModalOpen(true);
  };

  const handleOpenEditRuleModal = (rule: ReglaPersonalizada) => {
    setEditingRuleId(rule.id);
    setFormNombre(rule.nombre);
    setFormDescripcion(rule.descripcion || '');
    setFormActiva(rule.activa !== false);
    setFormCondTipo(rule.condicion.tipo || 'dias_semana');
    setFormDias(rule.condicion.dias || ['viernes', 'sabado', 'domingo']);
    setFormMontoMinimo(rule.condicion.monto_minimo || 250);
    setFormCantidadServicios(rule.condicion.cantidad_minima_servicios || 2);
    setFormDuracionMinima(rule.condicion.duracion_minima_minutos || 60);
    setFormHoraInicio(rule.condicion.hora_inicio || '18:00');
    setFormHoraFin(rule.condicion.hora_fin || '21:00');
    setFormCategoria(rule.condicion.categoria || 'Paquetes');
    setFormConsTipo(rule.consecuencia.tipo || 'exigir_anticipo');
    setFormTipoAnticipo(rule.consecuencia.tipo_anticipo || 'porcentaje');
    setFormValorAnticipo(rule.consecuencia.valor_anticipo ?? 50);
    setFormTiempoAnticipacionHoras(rule.consecuencia.tiempo_anticipacion_horas || 24);
    setFormMensajeCliente(rule.consecuencia.mensaje_cliente || '');
    setIsModalOpen(true);
  };

  const getDefaultRuleName = (tipo: CondicionMomentoTipo) => {
    switch (tipo) {
      case 'dias_semana':
        return 'Anticipo en fines de semana';
      case 'monto_minimo':
        return 'Regla por monto de cita';
      case 'cantidad_servicios':
        return 'Regla por servicios múltiples';
      case 'duracion_minima':
        return 'Regla por duración de cita';
      case 'horario_estelar':
        return 'Regla por horario pico';
      case 'cliente_nuevo':
        return 'Regla para clientes nuevos';
      case 'categoria_servicio':
        return 'Regla por categoría de servicio';
      default:
        return 'Regla Personalizada';
    }
  };

  const handleSaveRuleModal = () => {
    const finalName = formNombre.trim() || getDefaultRuleName(formCondTipo);

    const newRule: ReglaPersonalizada = {
      id: editingRuleId || `regla_${Date.now()}`,
      nombre: finalName,
      descripcion: formDescripcion.trim() || undefined,
      activa: formActiva,
      condicion: {
        tipo: formCondTipo,
        dias: formCondTipo === 'dias_semana' ? formDias : undefined,
        monto_minimo: formCondTipo === 'monto_minimo' ? Number(formMontoMinimo) || 0 : undefined,
        cantidad_minima_servicios:
          formCondTipo === 'cantidad_servicios' ? Number(formCantidadServicios) || 1 : undefined,
        duracion_minima_minutos:
          formCondTipo === 'duracion_minima' ? Number(formDuracionMinima) || 30 : undefined,
        hora_inicio: formCondTipo === 'horario_estelar' ? formHoraInicio : undefined,
        hora_fin: formCondTipo === 'horario_estelar' ? formHoraFin : undefined,
        categoria: formCondTipo === 'categoria_servicio' ? formCategoria : undefined,
      },
      consecuencia: {
        tipo: formConsTipo,
        tipo_anticipo: formConsTipo === 'exigir_anticipo' ? formTipoAnticipo : undefined,
        valor_anticipo:
          formConsTipo === 'exigir_anticipo' ? Number(formValorAnticipo) || 0 : undefined,
        tiempo_anticipacion_horas:
          formConsTipo === 'anticipacion_minima' ? Number(formTiempoAnticipacionHoras) || 1 : undefined,
        mensaje_cliente: formMensajeCliente.trim() || undefined,
      },
      creada_el: new Date().toISOString(),
    };

    setRules((prev) => {
      const currentList = prev.reglas_personalizadas || [];
      const updatedList = editingRuleId
        ? currentList.map((r) => (r.id === editingRuleId ? newRule : r))
        : [...currentList, newRule];
      return { ...prev, reglas_personalizadas: updatedList };
    });

    setIsModalOpen(false);
    toast({
      title: editingRuleId ? 'Regla actualizada' : 'Nueva regla agregada',
      description: `"${finalName}" agregada. Guarda cambios para sincronizar con la agenda.`,
    });
  };

  const handleToggleRuleActive = (ruleId: string, currentActive: boolean) => {
    setRules((prev) => {
      const updated = (prev.reglas_personalizadas || []).map((r) =>
        r.id === ruleId ? { ...r, activa: !currentActive } : r
      );
      return { ...prev, reglas_personalizadas: updated };
    });
  };

  const handleDeleteRule = (ruleId: string) => {
    const ruleToDelete = (rules.reglas_personalizadas || []).find((r) => r.id === ruleId);
    setRules((prev) => ({
      ...prev,
      reglas_personalizadas: (prev.reglas_personalizadas || []).filter((r) => r.id !== ruleId),
    }));
    toast({
      title: 'Regla eliminada',
      description: `Se eliminó la regla "${ruleToDelete?.nombre || 'Personalizada'}".`,
    });
  };

  const getMomentoSummary = (c: ReglaPersonalizada['condicion']) => {
    switch (c.tipo) {
      case 'dias_semana': {
        const dias = c.dias || [];
        const nombresCortos: Record<string, string> = {
          lunes: 'Lun',
          martes: 'Mar',
          miercoles: 'Mié',
          jueves: 'Jue',
          viernes: 'Vie',
          sabado: 'Sáb',
          domingo: 'Dom',
        };
        const formateados = dias.map((d) => nombresCortos[d] || d).join(', ');
        return `Días: ${formateados || 'Sin días seleccionados'}`;
      }
      case 'monto_minimo':
        return `Monto de cita: $${c.monto_minimo || 0}+ MXN`;
      case 'cantidad_servicios':
        return `Servicios: ${c.cantidad_minima_servicios || 2}+ en la misma cita`;
      case 'duracion_minima':
        return `Duración: ${c.duracion_minima_minutos || 60}+ minutos`;
      case 'horario_estelar':
        return `Horario: ${c.hora_inicio || '18:00'} a ${c.hora_fin || '21:00'} hrs`;
      case 'cliente_nuevo':
        return 'Aplica a Clientes Nuevos (1ª cita)';
      case 'categoria_servicio':
        return `Categoría: ${c.categoria || 'Especial'}`;
      default:
        return 'Condición configurada';
    }
  };

  const getConsecuenciaSummary = (cons: ReglaPersonalizada['consecuencia']) => {
    switch (cons.tipo) {
      case 'exigir_anticipo':
        return cons.tipo_anticipo === 'monto_fijo'
          ? `Anticipo fijo: $${cons.valor_anticipo || 0} MXN`
          : `Anticipo: ${cons.valor_anticipo || 50}%`;
      case 'bloquear_online':
        return 'Bloquear reserva online (contactar sucursal)';
      case 'anticipacion_minima':
        return `Anticipación mínima: ${cons.tiempo_anticipacion_horas || 24} hrs`;
      case 'aviso_informativo':
        return 'Mostrar aviso especial al cliente';
      default:
        return 'Acción configurada';
    }
  };

  const getRuleIcon = (tipo: CondicionMomentoTipo) => {
    switch (tipo) {
      case 'dias_semana':
        return <Calendar className="h-4 w-4 text-muted-foreground" />;
      case 'monto_minimo':
        return <DollarSign className="h-4 w-4 text-muted-foreground" />;
      case 'cantidad_servicios':
        return <Scissors className="h-4 w-4 text-muted-foreground" />;
      case 'duracion_minima':
        return <Hourglass className="h-4 w-4 text-muted-foreground" />;
      case 'horario_estelar':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'cliente_nuevo':
        return <UserCheck className="h-4 w-4 text-muted-foreground" />;
      case 'categoria_servicio':
        return <Tag className="h-4 w-4 text-muted-foreground" />;
      default:
        return <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getCriterioName = (tipo: CondicionMomentoTipo) => {
    switch (tipo) {
      case 'dias_semana':
        return 'Días específicos de la semana';
      case 'monto_minimo':
        return 'Monto acumulado de la cita';
      case 'cantidad_servicios':
        return 'Cantidad de servicios combinados';
      case 'duracion_minima':
        return 'Duración total de la cita';
      case 'horario_estelar':
        return 'Franja horaria / Horas pico';
      case 'cliente_nuevo':
        return 'Cliente nuevo (Primera cita)';
      case 'categoria_servicio':
        return 'Categoría de servicio específica';
      default:
        return tipo;
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center space-x-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Cargando reglas de reservas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 pb-12">
      {/* HEADER DE LA PÁGINA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">Reglas de Reservas</h3>
          <p className="text-xs text-muted-foreground">
            Políticas de anticipos, escudo contra inasistencias (*no-shows*), tolerancias de agenda y cancelaciones.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            variant="alfa"
            className="text-xs h-8 px-4 flex items-center gap-1.5 font-semibold"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Guardar</span>
          </Button>
          <Button
            type="button"
            onClick={handleOpenNewAvisoModal}
            variant="outline"
            className="text-xs h-8 px-2.5 flex items-center gap-1.5 border-border/80 hover:bg-muted font-medium"
          >
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Regla de Aviso</span>
          </Button>
          <Button
            type="button"
            onClick={handleOpenNewRuleModal}
            variant="outline"
            className="text-xs h-8 px-2.5 flex items-center gap-1.5 border-border/80 hover:bg-muted font-medium"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Regla Personalizada</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExpandAll}
            className="text-xs h-8 px-2 flex items-center gap-1 border-border/80 hover:bg-muted font-medium"
            title="Expandir todas las reglas"
          >
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden md:inline">Expandir</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCollapseAll}
            className="text-xs h-8 px-2 flex items-center gap-1 border-border/80 hover:bg-muted font-medium"
            title="Minimizar todas las reglas"
          >
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden md:inline">Minimizar</span>
          </Button>
        </div>
      </div>

      {/* BLOQUE 1: REGLA GENERAL DE ANTICIPOS */}
      <Card className="border border-border/70 shadow-xs transition-all overflow-hidden bg-card">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => toggleSection('general')}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
                Anticipo Automático por Monto Mínimo
              </CardTitle>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={rules.anticipo_monto_minimo_activo}
                  onCheckedChange={(checked) =>
                    setRules((prev) => ({ ...prev, anticipo_monto_minimo_activo: checked }))
                  }
                />
              </div>

              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                aria-label={openSections.general ? 'Minimizar' : 'Maximizar'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection('general');
                }}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    openSections.general && 'rotate-180'
                  )}
                />
              </button>
            </div>
          </div>
        </CardHeader>

        {openSections.general && (
          <CardContent className="pt-3 pb-4 px-4 border-t border-border/50 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Exige automáticamente un cobro de anticipo en línea cuando el total acumulado de la cita alcance o supere el monto indicado.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Monto total mínimo acumulado ($ MXN)</Label>
                <Input
                  type="number"
                  min="0"
                  step="10"
                  className="font-medium h-9 text-xs"
                  value={rules.anticipo_monto_minimo}
                  disabled={!rules.anticipo_monto_minimo_activo}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      anticipo_monto_minimo: Number(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Si la suma de servicios de la reserva es igual o superior a esta cantidad, se exigirá anticipo.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Porcentaje de anticipo a cobrar (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  className="font-medium h-9 text-xs"
                  value={rules.anticipo_porcentaje_defecto}
                  disabled={!rules.anticipo_monto_minimo_activo}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      anticipo_porcentaje_defecto: Number(e.target.value) || 50,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Porcentaje del total que el cliente debe pagar en línea para confirmar su espacio.
                </p>
              </div>

              {/* CAMPO DE DESCRIPCIÓN Y NOTAS DE LA REGLA */}
              <div className="col-span-1 md:col-span-2 space-y-1.5 pt-1">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  Descripción y motivo de la regla (recordatorio del negocio)
                </Label>
                <Textarea
                  rows={2}
                  className="text-xs font-normal leading-relaxed resize-none"
                  placeholder="Explica a qué se refiere esta regla general de anticipo..."
                  value={rules.anticipo_monto_minimo_descripcion || ''}
                  disabled={!rules.anticipo_monto_minimo_activo}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      anticipo_monto_minimo_descripcion: e.target.value,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Documenta la política general de anticipo por monto acumulado para claridad del equipo.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* BLOQUE 2: ESCUDO ANTIFRAUDE E INASISTENCIAS */}
      <Card className="border border-border/70 shadow-xs transition-all overflow-hidden bg-card">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => toggleSection('antifraud')}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
                Escudo Antifraude e Inasistencias (No-Shows)
              </CardTitle>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={rules.penalizacion_inasistencias_activa}
                  onCheckedChange={(checked) =>
                    setRules((prev) => ({ ...prev, penalizacion_inasistencias_activa: checked }))
                  }
                />
              </div>

              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                aria-label={openSections.antifraud ? 'Minimizar' : 'Maximizar'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection('antifraud');
                }}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    openSections.antifraud && 'rotate-180'
                  )}
                />
              </button>
            </div>
          </div>
        </CardHeader>

        {openSections.antifraud && (
          <CardContent className="pt-3 pb-4 px-4 border-t border-border/50 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Protege el tiempo de tus barberos exigiendo anticipo de garantía a clientes que acumulen inasistencias o cancelaciones recurrentes.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Inasistencias / Cancelaciones permitidas</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  className="font-medium h-9 text-xs"
                  value={rules.max_inasistencias_permitidas}
                  disabled={!rules.penalizacion_inasistencias_activa}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      max_inasistencias_permitidas: Number(e.target.value) || 2,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Al alcanzar este número de faltas, el sistema le exigirá anticipo obligatorio a este cliente.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Porcentaje de anticipo de garantía (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  className="font-medium h-9 text-xs"
                  value={rules.penalizacion_anticipo_porcentaje}
                  disabled={!rules.penalizacion_inasistencias_activa}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      penalizacion_anticipo_porcentaje: Number(e.target.value) || 50,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Porcentaje del total que se le exigirá de garantía sin importar el monto del servicio.
                </p>
              </div>

              {/* CAMPO DE DESCRIPCIÓN Y NOTAS DE LA REGLA */}
              <div className="col-span-1 md:col-span-2 space-y-1.5 pt-1">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  Descripción y motivo de la regla (recordatorio del negocio)
                </Label>
                <Textarea
                  rows={2}
                  className="text-xs font-normal leading-relaxed resize-none"
                  placeholder="Explica a qué se refiere esta regla para que no se olvide con el paso del tiempo..."
                  value={rules.penalizacion_inasistencias_descripcion || ''}
                  disabled={!rules.penalizacion_inasistencias_activa}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      penalizacion_inasistencias_descripcion: e.target.value,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Esta descripción documenta para todo el equipo de recepción y administración la razón de ser de este escudo contra inasistencias.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* BLOQUE 3: POLÍTICA DE CANCELACIONES Y RETENCIÓN DE ANTICIPO */}
      <Card className="border border-border/70 shadow-xs transition-all overflow-hidden bg-card">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => toggleSection('cancellation')}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <CalendarX2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
                Política de Cancelaciones y Retención de Anticipo
              </CardTitle>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={rules.cancelacion_politica_activa}
                  onCheckedChange={(checked) =>
                    setRules((prev) => ({ ...prev, cancelacion_politica_activa: checked }))
                  }
                />
              </div>

              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                aria-label={openSections.cancellation ? 'Minimizar' : 'Maximizar'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection('cancellation');
                }}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    openSections.cancellation && 'rotate-180'
                  )}
                />
              </button>
            </div>
          </div>
        </CardHeader>

        {openSections.cancellation && (
          <CardContent className="pt-3 pb-4 px-4 border-t border-border/50 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Establece el tiempo mínimo para cancelar o reagendar sin penalización y el porcentaje de anticipo retenido ante cancelaciones tardías o inasistencias (alineado con la sección 4 de Términos y Condiciones).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tiempo mínimo sin penalización (horas)</Label>
                <Input
                  type="number"
                  min="1"
                  max="72"
                  step="1"
                  className="font-medium h-9 text-xs"
                  value={rules.cancelacion_tiempo_minimo_horas}
                  disabled={!rules.cancelacion_politica_activa}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      cancelacion_tiempo_minimo_horas: Number(e.target.value) || 2,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Al cancelar con al menos {rules.cancelacion_tiempo_minimo_horas} hrs de antelación, el anticipo queda como saldo a favor.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Retención por cancelación tardía (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  className="font-medium h-9 text-xs"
                  value={rules.cancelacion_retencion_anticipo_porcentaje}
                  disabled={!rules.cancelacion_politica_activa}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      cancelacion_retencion_anticipo_porcentaje: Number(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Porcentaje retenido sin reembolso como compensación al barbero por el bloqueo del horario.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Vigencia del saldo a favor (días)</Label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  step="5"
                  className="font-medium h-9 text-xs"
                  value={rules.cancelacion_saldo_favor_vigencia_dias}
                  disabled={!rules.cancelacion_politica_activa}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      cancelacion_saldo_favor_vigencia_dias: Number(e.target.value) || 30,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Días naturales para aplicar el saldo a favor en una nueva cita tras cancelar a tiempo.
                </p>
              </div>

              {/* CAMPO DE DESCRIPCIÓN Y NOTAS DE LA REGLA */}
              <div className="col-span-1 md:col-span-3 space-y-1.5 pt-1">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  Descripción y respaldo legal de la política (Términos y Condiciones)
                </Label>
                <Textarea
                  rows={2}
                  className="text-xs font-normal leading-relaxed resize-none"
                  placeholder="Explica la política de cancelación y retención de anticipo..."
                  value={rules.cancelacion_politica_descripcion || ''}
                  disabled={!rules.cancelacion_politica_activa}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      cancelacion_politica_descripcion: e.target.value,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Esta política está alineada con la sección 4 de los Términos y Condiciones oficiales de VATOS ALFA visibles en el proceso de reserva online.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* BLOQUE 4: TIEMPOS Y TOLERANCIAS DE CITA */}
      <Card className="border border-border/70 shadow-xs transition-all overflow-hidden bg-card">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => toggleSection('timing')}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
                Tiempos y Tolerancias de Reserva
              </CardTitle>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                aria-label={openSections.timing ? 'Minimizar' : 'Maximizar'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection('timing');
                }}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    openSections.timing && 'rotate-180'
                  )}
                />
              </button>
            </div>
          </div>
        </CardHeader>

        {openSections.timing && (
          <CardContent className="pt-3 pb-4 px-4 border-t border-border/50 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configura los márgenes de tiempo para agendar en línea y la tolerancia de llegada antes de marcar retraso o liberar la silla.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Anticipación mínima (minutos)</Label>
                <Input
                  type="number"
                  min="0"
                  step="5"
                  className="font-medium h-9 text-xs"
                  value={rules.tiempo_minimo_anticipacion_minutos}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      tiempo_minimo_anticipacion_minutos: Number(e.target.value) || 0,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Tiempo mínimo antes de la cita para permitir agendar (ej. 30 min).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Ventana máxima a futuro (días)</Label>
                <Input
                  type="number"
                  min="1"
                  max="90"
                  className="font-medium h-9 text-xs"
                  value={rules.dias_maximos_futuro}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      dias_maximos_futuro: Number(e.target.value) || 14,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Hasta cuántos días adelante pueden agendar los clientes (ej. 14 días).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tolerancia de puntualidad (minutos)</Label>
                <Input
                  type="number"
                  min="0"
                  max="60"
                  className="font-medium h-9 text-xs"
                  value={rules.tolerancia_puntualidad_minutos}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      tolerancia_puntualidad_minutos: Number(e.target.value) || 10,
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Minutos de espera antes de marcar retraso o liberar la silla (ej. 10 min).
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Intervalo de horarios de cita</Label>
                <Select
                  value={String(rules.intervalo_horarios_minutos || 30)}
                  onValueChange={(val) =>
                    setRules((prev) => ({
                      ...prev,
                      intervalo_horarios_minutos: Number(val) || 30,
                    }))
                  }
                >
                  <SelectTrigger className="font-medium h-9 text-xs">
                    <SelectValue placeholder="Selecciona intervalo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutos</SelectItem>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="45">45 minutos</SelectItem>
                    <SelectItem value="60">1 hora (60 min)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Separación entre los turnos disponibles para reservar en línea.
                </p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* BLOQUE 5: REGLAS PARA AVISOS DE AGENDA */}
      <Card className="border border-border/70 shadow-xs transition-all overflow-hidden bg-card">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => toggleSection('agendaNotices')}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Bell className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
                Reglas para Avisos de Agenda
              </CardTitle>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                aria-label={openSections.agendaNotices ? 'Minimizar' : 'Maximizar'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection('agendaNotices');
                }}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    openSections.agendaNotices && 'rotate-180'
                  )}
                />
              </button>
            </div>
          </div>
        </CardHeader>

        {openSections.agendaNotices && (
          <CardContent className="pt-3 pb-4 px-4 border-t border-border/50 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Controla las alertas operativas para el personal en la agenda: recordatorios de WhatsApp para citas próximas, citas atrasadas por clasificar y avisos automáticos.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleOpenNewAvisoModal}
                className="text-xs h-7 px-2.5 flex items-center gap-1.5 shrink-0 self-start sm:self-auto border-border/80 hover:bg-muted font-medium"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Agregar Aviso</span>
              </Button>
            </div>

            <div className="space-y-2.5">
              {(rules.reglas_avisos_agenda || DEFAULT_AVISOS_AGENDA_RULES).map((aviso) => {
                const isSystem = Boolean(aviso.es_sistema || aviso.id === 'aviso_recordatorio_whatsapp' || aviso.id === 'aviso_cita_atrasada');
                return (
                  <div
                    key={aviso.id}
                    className="p-3.5 rounded-lg border border-border/60 bg-muted/15 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {getAvisoIcon(aviso.tipo)}
                        <span className="font-semibold text-xs text-foreground truncate">
                          {aviso.nombre}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-normal border border-border/60 px-1.5 py-0.5 rounded">
                          {aviso.canal === 'whatsapp' ? 'WhatsApp' : aviso.canal === 'ambos' ? 'WhatsApp + Pantalla' : 'Recepción'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={aviso.activa !== false}
                            onCheckedChange={(checked) =>
                              updateAvisoRule(aviso.id, { activa: checked })
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEditAvisoModal(aviso)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title="Editar detalles"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {!isSystem && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteAvisoRule(aviso.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Eliminar regla"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Parámetros específicos */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border/40">
                      {aviso.tipo === 'recordatorio_whatsapp' && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-[11px] font-semibold text-foreground">
                              Primer aviso en recepción (minutos antes)
                            </Label>
                            <Input
                              type="number"
                              min="10"
                              max="720"
                              step="10"
                              className="h-8 font-medium text-xs max-w-[140px]"
                              value={aviso.tiempo_anticipacion_minutos ?? 120}
                              onChange={(e) =>
                                updateAvisoRule(aviso.id, {
                                  tiempo_anticipacion_minutos: Number(e.target.value) || 0,
                                })
                              }
                            />
                            <p className="text-[10px] text-muted-foreground">
                              Momento en que la cita entra a la lista de avisos de recepción ({Math.round((aviso.tiempo_anticipacion_minutos ?? 120) / 60)} hrs antes).
                            </p>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] font-semibold text-foreground">
                              Aviso urgente / muy próxima (minutos antes)
                            </Label>
                            <Input
                              type="number"
                              min="5"
                              max="180"
                              step="5"
                              className="h-8 font-medium text-xs max-w-[140px]"
                              value={aviso.tiempo_urgente_minutos ?? 60}
                              onChange={(e) =>
                                updateAvisoRule(aviso.id, {
                                  tiempo_urgente_minutos: Number(e.target.value) || 0,
                                })
                              }
                            />
                            <p className="text-[10px] text-muted-foreground">
                              Destaca con advertencia si la cita está a {aviso.tiempo_urgente_minutos ?? 60} min o menos.
                            </p>
                          </div>

                          <div className="space-y-1 md:col-span-2 pt-1 border-t border-border/40">
                            <Label className="text-[11px] font-semibold text-foreground">
                              Omitir recordatorio si se agenda con poca anticipación (minutos)
                            </Label>
                            <Input
                              type="number"
                              min="5"
                              max="180"
                              step="5"
                              className="h-8 font-medium text-xs max-w-[140px]"
                              value={aviso.omitir_si_creada_en_minutos ?? 45}
                              onChange={(e) =>
                                updateAvisoRule(aviso.id, {
                                  omitir_si_creada_en_minutos: Number(e.target.value) || 0,
                                })
                              }
                            />
                            <p className="text-[10px] text-muted-foreground">
                              Si un cliente agenda con {aviso.omitir_si_creada_en_minutos ?? 45} min o menos de anticipación, el botón de recordatorio queda deshabilitado (&quot;No requerido&quot;) y solo se envía confirmación.
                            </p>
                          </div>
                        </>
                      )}

                      {aviso.tipo === 'cita_atrasada_asistencia' && (
                        <div className="space-y-1 md:col-span-2">
                          <Label className="text-[11px] font-semibold text-foreground">
                            Minutos de tolerancia tras la hora de inicio de la cita
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            max="60"
                            step="5"
                            className="h-8 font-medium text-xs max-w-[140px]"
                            value={aviso.tolerancia_retraso_minutos ?? 10}
                            onChange={(e) =>
                              updateAvisoRule(aviso.id, {
                                tolerancia_retraso_minutos: Number(e.target.value) || 0,
                              })
                            }
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Tras cumplirse {aviso.tolerancia_retraso_minutos ?? 10} min sin marcar asistencia, la cita aparece para clasificar si asistió o faltó.
                          </p>
                        </div>
                      )}

                      {aviso.tipo !== 'recordatorio_whatsapp' && aviso.tipo !== 'cita_atrasada_asistencia' && (
                        <div className="space-y-1 md:col-span-2">
                          <Label className="text-[11px] font-semibold text-foreground">
                            Tiempo de activación (minutos)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            step="5"
                            className="h-8 font-medium text-xs max-w-[140px]"
                            value={aviso.tiempo_anticipacion_minutos ?? 60}
                            onChange={(e) =>
                              updateAvisoRule(aviso.id, {
                                tiempo_anticipacion_minutos: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </div>
                      )}

                      {/* Campo de descripción */}
                      <div className="space-y-1 md:col-span-2 pt-1 border-t border-border/40">
                        <Label className="text-[11px] font-semibold text-foreground">
                          Descripción o nota explicativa
                        </Label>
                        <Textarea
                          rows={2}
                          className="text-xs leading-relaxed resize-none"
                          value={aviso.descripcion || ''}
                          placeholder="Escribe una explicación para recepción..."
                          onChange={(e) =>
                            updateAvisoRule(aviso.id, { descripcion: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      {/* BLOQUE 6: REGLAS PERSONALIZADAS ADICIONALES */}
      <Card className="border border-border/70 shadow-xs transition-all overflow-hidden bg-card">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none hover:bg-muted/20 transition-colors"
          onClick={() => toggleSection('customRules')}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
              <CardTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
                Reglas Personalizadas Adicionales
              </CardTitle>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                aria-label={openSections.customRules ? 'Minimizar' : 'Maximizar'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSection('customRules');
                }}
              >
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform duration-200',
                    openSections.customRules && 'rotate-180'
                  )}
                />
              </button>
            </div>
          </div>
        </CardHeader>

        {openSections.customRules && (
          <CardContent className="pt-3 pb-4 px-4 border-t border-border/50 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Crea condiciones a la medida para saber en qué momento se aplican (días, montos, duración o clientes) y qué consecuencia tienen al reservar.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleOpenNewRuleModal}
                className="text-xs h-7 px-2.5 flex items-center gap-1.5 shrink-0 self-start sm:self-auto border-border/80 hover:bg-muted font-medium"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Agregar Regla</span>
              </Button>
            </div>

            {(rules.reglas_personalizadas || []).length === 0 ? (
              <div className="border border-dashed border-border/80 bg-muted/10 p-6 text-center rounded-lg space-y-2">
                <p className="font-semibold text-xs text-foreground">No tienes reglas personalizadas registradas</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Puedes configurar reglas especiales como anticipo exclusivo en fines de semana o para clientes con citas largas.
                </p>
                <Button
                  type="button"
                  onClick={handleOpenNewRuleModal}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 px-3 border-border/80 hover:bg-muted font-medium mt-1"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Crear Regla
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {(rules.reglas_personalizadas || []).map((rule) => {
                  const isOpen = !!openCustomRules[rule.id];
                  return (
                    <div
                      key={rule.id}
                      className="rounded-lg border border-border/60 bg-muted/15 overflow-hidden transition-all"
                    >
                      <div
                        className="py-2.5 px-3.5 cursor-pointer select-none hover:bg-muted/30 transition-colors flex items-center justify-between gap-3"
                        onClick={() => toggleCustomRule(rule.id)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getRuleIcon(rule.condicion.tipo)}
                          <span className="font-semibold text-xs text-foreground truncate">
                            {rule.nombre}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={rule.activa}
                              onCheckedChange={() => handleToggleRuleActive(rule.id, rule.activa)}
                            />
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Editar regla"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditRuleModal(rule);
                            }}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Eliminar regla"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRule(rule.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>

                          <button
                            type="button"
                            aria-label={isOpen ? 'Minimizar' : 'Maximizar'}
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCustomRule(rule.id);
                            }}
                          >
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition-transform duration-200',
                                isOpen && 'rotate-180'
                              )}
                            />
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="pt-2 pb-3 px-3.5 border-t border-border/40 space-y-3 bg-card">
                          {rule.descripcion && (
                            <p className="text-xs text-muted-foreground italic">
                              {rule.descripcion}
                            </p>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div className="p-2.5 rounded-md bg-muted/20 border border-border/50 space-y-1">
                              <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                                Momento de aplicación:
                              </span>
                              <p className="font-medium text-foreground">
                                {getMomentoSummary(rule.condicion)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                Criterio: {getCriterioName(rule.condicion.tipo)}
                              </p>
                            </div>

                            <div className="p-2.5 rounded-md bg-muted/20 border border-border/50 space-y-1">
                              <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
                                Consecuencia:
                              </span>
                              <p className="font-medium text-foreground">
                                {getConsecuenciaSummary(rule.consecuencia)}
                              </p>
                              {rule.consecuencia.mensaje_cliente && (
                                <p className="text-[11px] text-muted-foreground italic">
                                  Mensaje: &quot;{rule.consecuencia.mensaje_cliente}&quot;
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* BOTÓN INFERIOR DE GUARDADO GLOBAL */}
      <div className="sticky bottom-0 z-10 py-3 bg-background/90 backdrop-blur-md border-t border-border/40 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          variant="alfa"
          className="font-semibold px-6 h-9 text-xs flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Guardando cambios...
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              Guardar Reglas de Reservas
            </>
          )}
        </Button>
      </div>

      {/* MODAL / DIALOG PARA AGREGAR O EDITAR REGLA */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent
          hideCloseButton={true}
          className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-card"
        >
          {/* Cabecera Oficial de Modal con Haz de Luz Oblicuo */}
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="flex items-center gap-3 relative z-10">
              <SlidersHorizontal className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-base font-bold text-white tracking-tight">
                  {editingRuleId ? 'Editar Regla de Reserva' : 'Nueva Regla de Reserva'}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Define cuándo se aplica la regla y qué consecuencia tendrá al reservar.
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 relative z-10"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* 1. Datos básicos */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  1. Identificación de la Regla
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {formActiva ? 'Activa' : 'Inactiva'}
                  </span>
                  <Switch checked={formActiva} onCheckedChange={setFormActiva} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Nombre de la regla *</Label>
                  <Input
                    placeholder="Ej. Anticipo fin de semana"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Descripción o nota interna</Label>
                  <Input
                    placeholder="Ej. Alta demanda en sábados y domingos"
                    value={formDescripcion}
                    onChange={(e) => setFormDescripcion(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 2. ¿En qué momento se aplica? */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  2. ¿En qué momento se aplica? (Condición / Disparador)
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Criterio de activación</Label>
                <Select
                  value={formCondTipo}
                  onValueChange={(val: CondicionMomentoTipo) => setFormCondTipo(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecciona el criterio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dias_semana">📅 Días específicos de la semana (ej. Fin de semana)</SelectItem>
                    <SelectItem value="monto_minimo">💰 Monto acumulado de la cita (ej. Mayor o igual a $X)</SelectItem>
                    <SelectItem value="cantidad_servicios">✂️ Cantidad de servicios (ej. 2 o más servicios)</SelectItem>
                    <SelectItem value="duracion_minima">⏳ Duración total de la cita (ej. Citas de 60+ min)</SelectItem>
                    <SelectItem value="horario_estelar">🌙 Franja horaria / Horas pico (ej. De 18:00 a 21:00)</SelectItem>
                    <SelectItem value="cliente_nuevo">👤 Cliente nuevo (Primera cita sin historial)</SelectItem>
                    <SelectItem value="categoria_servicio">⭐ Categoría de servicio (ej. Paquetes o Tratamientos)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Parámetros condicionales según tipo de momento */}
              {formCondTipo === 'dias_semana' && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Días en que se aplicará:</Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormDias(['viernes', 'sabado', 'domingo'])}
                        className="text-[11px] h-6 px-2 text-blue-500 hover:bg-blue-500/10"
                      >
                        Fin de semana
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormDias(['lunes', 'martes', 'miercoles', 'jueves'])}
                        className="text-[11px] h-6 px-2 text-blue-500 hover:bg-blue-500/10"
                      >
                        Lun - Jue
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormDias(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'])}
                        className="text-[11px] h-6 px-2 text-blue-500 hover:bg-blue-500/10"
                      >
                        Todos
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {[
                      { id: 'lunes', label: 'Lun' },
                      { id: 'martes', label: 'Mar' },
                      { id: 'miercoles', label: 'Mié' },
                      { id: 'jueves', label: 'Jue' },
                      { id: 'viernes', label: 'Vie' },
                      { id: 'sabado', label: 'Sáb' },
                      { id: 'domingo', label: 'Dom' },
                    ].map((day) => {
                      const isSelected = formDias.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => {
                            setFormDias((prev) =>
                              isSelected ? prev.filter((d) => d !== day.id) : [...prev, day.id]
                            );
                          }}
                          className={`py-2 px-1 rounded-lg text-xs font-semibold text-center border transition-all ${
                            isSelected
                              ? 'bg-[#202A49] text-white border-[#202A49] shadow-xs'
                              : 'bg-background hover:bg-muted text-muted-foreground border-border/80'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {formCondTipo === 'monto_minimo' && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <Label className="text-xs font-semibold">Monto mínimo acumulado de la cita ($ MXN)</Label>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    value={formMontoMinimo}
                    onChange={(e) => setFormMontoMinimo(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                    placeholder="Ej. 250"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Se activará si el total de la cita alcanza o supera esta cantidad.
                  </p>
                </div>
              )}

              {formCondTipo === 'cantidad_servicios' && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <Label className="text-xs font-semibold">Mínimo de servicios en la misma cita</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={formCantidadServicios}
                    onChange={(e) => setFormCantidadServicios(Number(e.target.value) || 1)}
                    className="h-9 text-xs"
                    placeholder="Ej. 2"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Se activará si el cliente selecciona al menos este número de servicios.
                  </p>
                </div>
              )}

              {formCondTipo === 'duracion_minima' && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <Label className="text-xs font-semibold">Duración mínima total (minutos)</Label>
                  <Input
                    type="number"
                    min="15"
                    step="15"
                    value={formDuracionMinima}
                    onChange={(e) => setFormDuracionMinima(Number(e.target.value) || 30)}
                    className="h-9 text-xs"
                    placeholder="Ej. 60"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Aplica si la duración total de la cita alcanza o supera este tiempo.
                  </p>
                </div>
              )}

              {formCondTipo === 'horario_estelar' && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Hora de inicio</Label>
                    <Input
                      type="time"
                      value={formHoraInicio}
                      onChange={(e) => setFormHoraInicio(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Hora de fin</Label>
                    <Input
                      type="time"
                      value={formHoraFin}
                      onChange={(e) => setFormHoraFin(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              )}

              {formCondTipo === 'cliente_nuevo' && (
                <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
                  Esta regla se activará automáticamente cuando un cliente reserve por primera vez (sin historial previo de citas en el sistema).
                </div>
              )}

              {formCondTipo === 'categoria_servicio' && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <Label className="text-xs font-semibold">Categoría o palabra clave del servicio</Label>
                  <Input
                    value={formCategoria}
                    onChange={(e) => setFormCategoria(e.target.value)}
                    className="h-9 text-xs"
                    placeholder="Ej. Paquetes, Barba, Tratamientos"
                  />
                </div>
              )}
            </div>

            {/* 3. ¿Qué consecuencia tiene? */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-400" />
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  3. ¿Qué consecuencia tiene? (Acción / Resultado)
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Acción a ejecutar</Label>
                <Select
                  value={formConsTipo}
                  onValueChange={(val: ConsecuenciaTipo) => setFormConsTipo(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecciona la consecuencia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exigir_anticipo">💳 Exigir cobro de anticipo obligatorio</SelectItem>
                    <SelectItem value="bloquear_online">🚫 Bloquear reserva online (contactar local)</SelectItem>
                    <SelectItem value="anticipacion_minima">⏳ Exigir mayor tiempo de anticipación</SelectItem>
                    <SelectItem value="aviso_informativo">📢 Mostrar aviso / política especial al cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Opciones de consecuencia */}
              {formConsTipo === 'exigir_anticipo' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Modalidad de cobro</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFormTipoAnticipo('porcentaje')}
                        className={`h-9 rounded-lg text-xs font-semibold border transition-all ${
                          formTipoAnticipo === 'porcentaje'
                            ? 'bg-[#202A49] text-white border-[#202A49] shadow-xs'
                            : 'bg-background hover:bg-muted text-muted-foreground border-border/80'
                        }`}
                      >
                        Porcentaje (%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormTipoAnticipo('monto_fijo')}
                        className={`h-9 rounded-lg text-xs font-semibold border transition-all ${
                          formTipoAnticipo === 'monto_fijo'
                            ? 'bg-[#202A49] text-white border-[#202A49] shadow-xs'
                            : 'bg-background hover:bg-muted text-muted-foreground border-border/80'
                        }`}
                      >
                        Monto Fijo ($)
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      {formTipoAnticipo === 'porcentaje' ? 'Porcentaje de anticipo (%)' : 'Monto de anticipo ($ MXN)'}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max={formTipoAnticipo === 'porcentaje' ? 100 : 5000}
                      value={formValorAnticipo}
                      onChange={(e) => setFormValorAnticipo(Number(e.target.value) || 0)}
                      className="h-9 text-xs"
                      placeholder={formTipoAnticipo === 'porcentaje' ? 'Ej. 50' : 'Ej. 150'}
                    />
                  </div>
                </div>
              )}

              {formConsTipo === 'bloquear_online' && (
                <div className="p-3 bg-rose-500/10 rounded-lg border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
                  Cuando esta condición se cumpla, el cliente no podrá confirmar la cita por internet y se le invitará a llamar o acudir directo a la sucursal.
                </div>
              )}

              {formConsTipo === 'anticipacion_minima' && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <Label className="text-xs font-semibold">Horas mínimas de anticipación requeridas</Label>
                  <Input
                    type="number"
                    min="1"
                    max="168"
                    value={formTiempoAnticipacionHoras}
                    onChange={(e) => setFormTiempoAnticipacionHoras(Number(e.target.value) || 24)}
                    className="h-9 text-xs"
                    placeholder="Ej. 24"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    El cliente deberá reservar con al menos estas horas de antelación.
                  </p>
                </div>
              )}

              {/* Mensaje al cliente */}
              <div className="space-y-1.5 pt-2 border-t border-border/50">
                <Label className="text-xs font-semibold">Mensaje explicativo para el cliente (opcional)</Label>
                <Textarea
                  placeholder="Ej. Para agendar en fines de semana solicitamos un anticipo de garantía del 50% para confirmar tu espacio..."
                  value={formMensajeCliente}
                  onChange={(e) => setFormMensajeCliente(e.target.value)}
                  className="text-xs min-h-[60px]"
                />
                <p className="text-[11px] text-muted-foreground">
                  Este mensaje se mostrará en el resumen de reserva del cliente para explicar el motivo del anticipo o regla.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border/50 bg-muted/10 flex items-center justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              className="text-xs h-8 px-3 rounded-lg"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="alfa"
              onClick={handleSaveRuleModal}
              className="text-xs h-8 px-4 font-semibold"
            >
              {editingRuleId ? 'Actualizar Regla' : 'Agregar Regla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL / DIALOG PARA AGREGAR O EDITAR REGLA DE AVISO DE AGENDA */}
      <Dialog open={isAvisoModalOpen} onOpenChange={setIsAvisoModalOpen}>
        <DialogContent
          hideCloseButton={true}
          className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl shadow-2xl border-2 border-blue-500 bg-card"
        >
          {/* Cabecera Oficial de Modal con Haz de Luz Oblicuo */}
          <div className="relative overflow-hidden bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
            <div className="header-light-beam absolute inset-0 pointer-events-none" />
            <div className="flex items-center gap-3 relative z-10">
              <Bell className="h-5 w-5 text-slate-300 shrink-0" />
              <div>
                <DialogTitle className="text-base font-bold text-white tracking-tight">
                  {editingAvisoRuleId ? 'Editar Regla de Aviso' : 'Nueva Regla de Aviso'}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300">
                  Condiciones de notificación para la recepción de la agenda.
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAvisoModalOpen(false)}
              className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 relative z-10"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* 1. Identificación */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  1. Identificación del Aviso
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {formAvisoActiva ? 'Activa' : 'Inactiva'}
                  </span>
                  <Switch checked={formAvisoActiva} onCheckedChange={setFormAvisoActiva} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nombre de la regla de aviso *</Label>
                <Input
                  placeholder="Ej. Recordatorio de WhatsApp, Aviso de Anticipo Pendiente..."
                  value={formAvisoNombre}
                  onChange={(e) => setFormAvisoNombre(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Descripción / Nota para el recepcionista</Label>
                <Textarea
                  placeholder="Explica cuándo y qué debe hacer recepción al ver este aviso..."
                  value={formAvisoDescripcion}
                  onChange={(e) => setFormAvisoDescripcion(e.target.value)}
                  rows={2}
                  className="text-xs"
                />
              </div>
            </div>

            {/* 2. Tipo de Aviso y Criterio */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 space-y-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  2. Tipo de Aviso y Criterio de Activación
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Criterio o Disparador</Label>
                <Select
                  value={formAvisoTipo}
                  onValueChange={(val: TipoAvisoAgenda) => {
                    setFormAvisoTipo(val);
                    if (!formAvisoNombre) {
                      setFormAvisoNombre(getDefaultAvisoName(val));
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecciona el tipo de aviso" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recordatorio_whatsapp">💬 Recordatorio por WhatsApp para citas próximas</SelectItem>
                    <SelectItem value="cita_atrasada_asistencia">⏰ Alerta de cita atrasada sin registrar asistencia</SelectItem>
                    <SelectItem value="anticipo_pendiente">💳 Cita con anticipo pendiente por cobrar o validar</SelectItem>
                    <SelectItem value="cliente_nuevo">👤 Cliente nuevo en su primera visita (Bienvenida)</SelectItem>
                    <SelectItem value="servicio_especial">✂️ Cita con servicios de larga duración o paquetes</SelectItem>
                    <SelectItem value="personalizado">🔔 Aviso operativo personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Parámetros condicionales */}
              {formAvisoTipo === 'recordatorio_whatsapp' && (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Primer aviso (minutos antes)</Label>
                      <Input
                        type="number"
                        min="10"
                        max="720"
                        step="10"
                        className="h-9 text-xs font-medium"
                        value={formAvisoAnticipacionMinutos}
                        onChange={(e) => setFormAvisoAnticipacionMinutos(Number(e.target.value) || 0)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Ej: 120 = 2 horas antes de la cita.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Aviso urgente (minutos antes)</Label>
                      <Input
                        type="number"
                        min="5"
                        max="180"
                        step="5"
                        className="h-9 text-xs font-medium"
                        value={formAvisoUrgenteMinutos}
                        onChange={(e) => setFormAvisoUrgenteMinutos(Number(e.target.value) || 0)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Ej: 60 = 1 hora antes (alerta naranja).
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Omitir recordatorio si se agenda con poca anticipación (minutos)</Label>
                    <Input
                      type="number"
                      min="5"
                      max="180"
                      step="5"
                      className="h-9 text-xs font-medium max-w-[140px]"
                      value={formAvisoOmitirMinutos}
                      onChange={(e) => setFormAvisoOmitirMinutos(Number(e.target.value) || 0)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Ej: 45 min. Si el cliente agenda vía telefónica o WhatsApp con 45 min o menos de antelación, el botón de recordatorio queda deshabilitado (&quot;No requerido&quot;) y solo se envía confirmación.
                    </p>
                  </div>
                </div>
              )}

              {formAvisoTipo === 'cita_atrasada_asistencia' && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <Label className="text-xs font-semibold">Minutos de tolerancia tras la hora de inicio</Label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    step="5"
                    className="h-9 text-xs font-medium"
                    value={formAvisoToleranciaMinutos}
                    onChange={(e) => setFormAvisoToleranciaMinutos(Number(e.target.value) || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Tiempo de espera antes de exigir marcar si asistió o no (ej. 10 minutos).
                  </p>
                </div>
              )}

              {formAvisoTipo !== 'recordatorio_whatsapp' && formAvisoTipo !== 'cita_atrasada_asistencia' && (
                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <Label className="text-xs font-semibold">Anticipación del aviso (minutos antes de la cita)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="10"
                    className="h-9 text-xs font-medium"
                    value={formAvisoAnticipacionMinutos}
                    onChange={(e) => setFormAvisoAnticipacionMinutos(Number(e.target.value) || 0)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    0 = Al iniciar el día de la cita; o especifica los minutos antes de la hora programada.
                  </p>
                </div>
              )}
            </div>

            {/* 3. Canal de Notificación */}
            <div className="p-3.5 rounded-xl bg-muted/20 border border-border/60 space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                3. Canal de Notificación
              </Label>
              <div className="space-y-1.5">
                <Select
                  value={formAvisoCanal}
                  onValueChange={(val: 'whatsapp' | 'pantalla' | 'ambos') => setFormAvisoCanal(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecciona el canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">💬 WhatsApp (Envío directo con botón)</SelectItem>
                    <SelectItem value="pantalla">🖥️ Recepción en Pantalla (Alerta visual en agenda)</SelectItem>
                    <SelectItem value="ambos">🔔 Ambos (Pantalla + WhatsApp)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border/50 bg-muted/10 flex items-center justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAvisoModalOpen(false)}
              className="text-xs h-8 px-3 rounded-lg"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="alfa"
              onClick={handleSaveAvisoModal}
              className="text-xs h-8 px-4 font-semibold"
            >
              {editingAvisoRuleId ? 'Actualizar Regla de Aviso' : 'Guardar Regla de Aviso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

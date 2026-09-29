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
import {
  ShieldCheck,
  CreditCard,
  Clock,
  Save,
  Loader2,
  AlertTriangle,
  Info,
  CalendarCheck2,
  UserX,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase-client';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/firebase-auth-context';
import { logAuditAction } from '@/lib/audit-logger';
import {
  DEFAULT_BOOKING_RULES,
  ReglasReservasConfig,
} from '@/lib/booking-rules';

export default function BookingRulesPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rules, setRules] = useState<ReglasReservasConfig>(DEFAULT_BOOKING_RULES);

  useEffect(() => {
    if (!db) return;

    const fetchRules = async () => {
      setLoading(true);
      try {
        // 1. Intentar cargar configuracion/reglas_reservas
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
        max_inasistencias_permitidas: Math.max(1, Number(rules.max_inasistencias_permitidas) || 2),
        penalizacion_anticipo_porcentaje: Number(rules.penalizacion_anticipo_porcentaje) || 50,
        tiempo_minimo_anticipacion_minutos: Number(rules.tiempo_minimo_anticipacion_minutos) || 30,
        dias_maximos_futuro: Number(rules.dias_maximos_futuro) || 14,
        tolerancia_puntualidad_minutos: Number(rules.tolerancia_puntualidad_minutos) || 10,
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
          actualizado_el: Timestamp.now(),
          actualizado_por: user?.email || 'admin',
        },
        { merge: true }
      );

      // 3. Auditoría
      await logAuditAction({
        action: 'Modificar Reglas de Reservas',
        details: `Umbral: $${payload.anticipo_monto_minimo} (${payload.anticipo_porcentaje_defecto}%). Inasistencias máx: ${payload.max_inasistencias_permitidas}.`,
        userId: user?.uid || 'unknown',
        userName: user?.displayName || user?.email || 'Unknown',
        userRole: user?.role,
        severity: 'info',
      });

      toast({
        title: '¡Reglas Guardadas!',
        description: 'Las políticas de reserva y anticipos han sido actualizadas con éxito.',
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center space-x-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Cargando reglas de reservas...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-foreground">Reglas de Reservas</h3>
        <p className="text-sm text-muted-foreground">
          Define la política global de anticipos, el escudo contra inasistencias (*no-shows*) y las tolerancias de tiempo de tu negocio.
        </p>
      </div>

      {/* BLOQUE 1: REGLA GENERAL DE ANTICIPOS */}
      <Card className="border border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/20 shrink-0 mt-0.5">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base md:text-lg font-bold">
                    Anticipo Automático por Monto Mínimo (Regla General)
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">
                    Regla por Defecto
                  </Badge>
                </div>
                <CardDescription className="text-xs md:text-sm mt-0.5">
                  Exige automáticamente un cobro de anticipo en línea cuando el total acumulado de la cita alcance o supere el monto indicado.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3 self-end md:self-center bg-muted/40 px-3 py-1.5 rounded-lg border border-border/60">
              <span className="text-xs font-semibold">
                {rules.anticipo_monto_minimo_activo ? 'Activado' : 'Desactivado'}
              </span>
              <Switch
                checked={rules.anticipo_monto_minimo_activo}
                onCheckedChange={(checked) =>
                  setRules((prev) => ({ ...prev, anticipo_monto_minimo_activo: checked }))
                }
              />
            </div>
          </div>
        </CardHeader>

        {rules.anticipo_monto_minimo_activo && (
          <CardContent className="pt-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border/50">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Monto mínimo acumulado ($ MXN)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="10"
                    className="pl-7 font-medium h-10"
                    value={rules.anticipo_monto_minimo}
                    onChange={(e) =>
                      setRules((prev) => ({ ...prev, anticipo_monto_minimo: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Si el total de la cita es igual o mayor a este importe (ej. $190), se solicitará anticipo.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Porcentaje de anticipo (%)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    className="pr-7 font-medium h-10"
                    value={rules.anticipo_porcentaje_defecto}
                    onChange={(e) =>
                      setRules((prev) => ({
                        ...prev,
                        anticipo_porcentaje_defecto: Number(e.target.value) || 50,
                      }))
                    }
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Porcentaje del total que el cliente debe pagar en línea (ej. 50%).
                </p>
              </div>
            </div>

            <div className="p-3 bg-muted/30 rounded-xl border border-border/60 flex items-start gap-2.5 text-xs text-muted-foreground">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                <strong>Jerarquía de Precedencia:</strong> Si un servicio individual tiene su propio anticipo específico configurado (por ejemplo, un tratamiento con anticipo fijo de $100), prevalece la regla de ese servicio. Si el servicio no tiene regla independiente, se aplica esta regla general.
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* BLOQUE 2: ESCUDO ANTIFRAUDE E INASISTENCIAS (NO-SHOWS) */}
      <Card className="border border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20 shrink-0 mt-0.5">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base md:text-lg font-bold">
                    Escudo Antifraude e Inasistencias (No-Shows)
                  </CardTitle>
                  <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30">
                    Máxima Prioridad
                  </Badge>
                </div>
                <CardDescription className="text-xs md:text-sm mt-0.5">
                  Protege el tiempo de tus barberos exigiendo anticipo de garantía a clientes que acumulen inasistencias o cancelaciones recurrentes.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3 self-end md:self-center bg-muted/40 px-3 py-1.5 rounded-lg border border-border/60">
              <span className="text-xs font-semibold">
                {rules.penalizacion_inasistencias_activa ? 'Activado' : 'Desactivado'}
              </span>
              <Switch
                checked={rules.penalizacion_inasistencias_activa}
                onCheckedChange={(checked) =>
                  setRules((prev) => ({ ...prev, penalizacion_inasistencias_activa: checked }))
                }
              />
            </div>
          </div>
        </CardHeader>

        {rules.penalizacion_inasistencias_activa && (
          <CardContent className="pt-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border/50">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Faltas o cancelaciones para activar la regla</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    className="font-medium h-10"
                    value={rules.max_inasistencias_permitidas}
                    onChange={(e) =>
                      setRules((prev) => ({
                        ...prev,
                        max_inasistencias_permitidas: Number(e.target.value) || 2,
                      }))
                    }
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  A partir de este número de citas canceladas o no asistidas (ej. 2), se le solicitará anticipo obligatorio sin importar el monto.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Porcentaje de anticipo a cobrarles (%)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    className="pr-7 font-medium h-10"
                    value={rules.penalizacion_anticipo_porcentaje}
                    onChange={(e) =>
                      setRules((prev) => ({
                        ...prev,
                        penalizacion_anticipo_porcentaje: Number(e.target.value) || 50,
                      }))
                    }
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Porcentaje de garantía a solicitar en línea (ej. 50%).
                </p>
              </div>
            </div>

            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 flex items-start gap-2.5 text-xs text-blue-200">
              <Sparkles className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong>Experiencia fluida y respetuosa:</strong> El cliente agendará de forma totalmente habitual. No verá avisos molestos ni pantallas distintas; simplemente el sistema le solicitará el anticipo en el paso de pago como cualquier cita regular con anticipo.
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* BLOQUE 3: TIEMPOS Y TOLERANCIAS DE CITA */}
      <Card className="border border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-500 border border-emerald-500/20 shrink-0 mt-0.5">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base md:text-lg font-bold">
                Tiempos y Tolerancias de Reserva
              </CardTitle>
              <CardDescription className="text-xs md:text-sm mt-0.5">
                Configura los márgenes de tiempo para agendar y la tolerancia de llegada.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-border/50">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Anticipación mínima (minutos)</Label>
              <Input
                type="number"
                min="0"
                step="5"
                className="font-medium h-10"
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
                className="font-medium h-10"
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
                className="font-medium h-10"
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
          </div>
        </CardContent>
      </Card>

      {/* BOTÓN FLOTANTE / INFERIOR DE GUARDADO */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-[#202A49] hover:bg-[#182038] text-white font-bold px-6 h-11 shadow-lg flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando cambios...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Guardar Reglas de Reservas
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

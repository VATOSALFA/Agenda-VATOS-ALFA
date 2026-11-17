'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Star,
  Search,
  Scissors,
  User,
  MapPin,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Sparkles,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ServiceRatingRecord {
  id: string;
  tipo?: string;
  reservationId?: string;
  folio?: string;
  barberoId?: string;
  barberoNombre: string;
  clienteId?: string;
  clienteNombre: string;
  clienteTelefono?: string;
  servicioId?: string;
  servicioNombre: string;
  sucursal: string;
  estrellas: number;
  comentario?: string;
  fechaCita?: string;
  horaCita?: string;
  totalCita?: number;
  fecha_iso?: string;
  createdAt?: any;
  estado?: string;
}

function normalizeDoc(id: string, data: Record<string, any>): ServiceRatingRecord | null {
  const stars = Number(data.estrellas ?? data.calificacion ?? 0);
  if (data.tipo !== 'calificacion_servicio' && !(stars > 0 && data.barberoNombre)) {
    return null;
  }
  return {
    id,
    tipo: data.tipo || 'calificacion_servicio',
    reservationId: data.reservationId || '',
    folio: data.folio || '',
    barberoId: data.barberoId || '',
    barberoNombre: data.barberoNombre || 'Barbero',
    clienteId: data.clienteId || '',
    clienteNombre: data.clienteNombre || 'Cliente',
    clienteTelefono: data.clienteTelefono || '',
    servicioId: data.servicioId || '',
    servicioNombre: data.servicioNombre || 'Servicio',
    sucursal: data.sucursal || 'Sucursal',
    estrellas: Math.max(1, Math.min(5, Math.round(stars || 5))),
    comentario: data.comentario || data.mensaje || '',
    fechaCita: data.fechaCita || '',
    horaCita: data.horaCita || '',
    totalCita: Number(data.totalCita || 0),
    fecha_iso: data.fecha_iso || '',
    createdAt: data.createdAt,
    estado: data.estado || 'nuevo',
  };
}

export function ServiceRatingsPanel() {
  const [settingsRatings, setSettingsRatings] = useState<Map<string, ServiceRatingRecord>>(new Map());
  const [rootRatings, setRootRatings] = useState<Map<string, ServiceRatingRecord>>(new Map());
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBarber, setSelectedBarber] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedStars, setSelectedStars] = useState('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const q1 = query(
      collection(db, 'settings', 'app_movil', 'opiniones'),
      orderBy('createdAt', 'desc')
    );
    const unsub1 = onSnapshot(
      q1,
      (snap) => {
        const next = new Map<string, ServiceRatingRecord>();
        snap.docs.forEach((d) => {
          const parsed = normalizeDoc(d.id, d.data());
          if (parsed) next.set(d.id, parsed);
        });
        setSettingsRatings(next);
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    const q2 = query(collection(db, 'opiniones_app'), orderBy('createdAt', 'desc'));
    const unsub2 = onSnapshot(
      q2,
      (snap) => {
        const next = new Map<string, ServiceRatingRecord>();
        snap.docs.forEach((d) => {
          const parsed = normalizeDoc(d.id, d.data());
          if (parsed) next.set(d.id, parsed);
        });
        setRootRatings(next);
      },
      () => {}
    );

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const allRatings = useMemo(() => {
    const merged = new Map<string, ServiceRatingRecord>();
    rootRatings.forEach((val, key) => merged.set(key, val));
    settingsRatings.forEach((val, key) => merged.set(key, val));
    return Array.from(merged.values()).sort((a, b) => {
      const tA = a.fecha_iso ? new Date(a.fecha_iso).getTime() : 0;
      const tB = b.fecha_iso ? new Date(b.fecha_iso).getTime() : 0;
      return tB - tA;
    });
  }, [settingsRatings, rootRatings]);

  const barbers = useMemo(
    () => Array.from(new Set(allRatings.map((r) => r.barberoNombre).filter(Boolean))).sort(),
    [allRatings]
  );

  const branches = useMemo(
    () => Array.from(new Set(allRatings.map((r) => r.sucursal).filter(Boolean))).sort(),
    [allRatings]
  );

  const filteredRatings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return allRatings.filter((r) => {
      if (selectedBarber !== 'all' && r.barberoNombre !== selectedBarber) return false;
      if (selectedBranch !== 'all' && r.sucursal !== selectedBranch) return false;
      if (selectedStars !== 'all' && String(r.estrellas) !== selectedStars) return false;
      if (term) {
        const haystack = [
          r.clienteNombre,
          r.clienteTelefono,
          r.barberoNombre,
          r.servicioNombre,
          r.sucursal,
          r.folio,
          r.comentario,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [allRatings, searchTerm, selectedBarber, selectedBranch, selectedStars]);

  const stats = useMemo(() => {
    const total = allRatings.length;
    const avg =
      total > 0
        ? (allRatings.reduce((acc, r) => acc + r.estrellas, 0) / total).toFixed(1)
        : '0.0';
    const pendingReview = allRatings.filter((r) => r.estado !== 'revisado').length;
    const fiveStars = allRatings.filter((r) => r.estrellas === 5).length;
    return { total, avg, pendingReview, fiveStars };
  }, [allRatings]);

  const handleMarkReviewed = async (id: string) => {
    setUpdatingId(id);
    try {
      await Promise.all([
        updateDoc(doc(db, 'settings', 'app_movil', 'opiniones', id), {
          estado: 'revisado',
        }).catch(() => {}),
        updateDoc(doc(db, 'opiniones_app', id), {
          estado: 'revisado',
        }).catch(() => {}),
      ]);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total de Calificaciones
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-[#0F172A]">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Promedio General
            </CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl font-bold text-[#0F172A]">
              <span>{stats.avg}</span>
              <Star className="h-5 w-5 fill-sky-400 text-sky-500" />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Nuevas por Revisar
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-600">{stats.pendingReview}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Servicios de 5 Estrellas
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-[#C5A880]">{stats.fiveStars}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filtros y Lista */}
      <Card className="border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-bold text-[#0F172A]">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Calificaciones de Servicio (App Móvil)
              </CardTitle>
              <CardDescription>
                Evaluaciones enviadas por clientes después de completar y pagar su cita.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit border-blue-200 bg-blue-50 text-blue-700">
              {filteredRatings.length} resultados
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar cliente, barbero, folio..."
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-slate-400" />
              <select
                value={selectedBarber}
                onChange={(e) => setSelectedBarber(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Todos los barberos</option>
                {barbers.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Todas las sucursales</option>
                {branches.map((br) => (
                  <option key={br} value={br}>
                    {br}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedStars}
                onChange={(e) => setSelectedStars(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">Todas las estrellas</option>
                <option value="5">5 estrellas</option>
                <option value="4">4 estrellas</option>
                <option value="3">3 estrellas</option>
                <option value="2">2 estrellas</option>
                <option value="1">1 estrella</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Cargando calificaciones...
            </div>
          ) : filteredRatings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
              <Star className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="font-semibold text-slate-700">No hay calificaciones registradas</p>
              <p className="mt-1 text-xs text-slate-500">
                Cuando un cliente califique su servicio desde la app aparecerá aquí.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRatings.map((item) => {
                const isNew = item.estado !== 'revisado';
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-xl border p-4 transition-colors',
                      isNew
                        ? 'border-blue-200 bg-blue-50/40'
                        : 'border-slate-200 bg-white'
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={cn(
                                  'h-4 w-4',
                                  s <= item.estrellas
                                    ? 'fill-sky-400 text-sky-500'
                                    : 'text-slate-300'
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-sm font-bold text-[#0F172A]">
                            {item.estrellas}/5
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              isNew
                                ? 'border-blue-300 bg-blue-100 text-blue-800'
                                : 'border-border/60 bg-muted/40 text-muted-foreground'
                            }
                          >
                            {isNew ? 'Nueva' : 'Revisada'}
                          </Badge>
                          {item.folio && (
                            <Badge variant="outline" className="border-slate-200 text-slate-600">
                              #{item.folio}
                            </Badge>
                          )}
                        </div>

                        <div className="grid gap-x-6 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="flex items-center gap-1.5">
                            <User className="h-4 w-4 text-slate-400" />
                            <span className="font-semibold text-[#0F172A]">
                              {item.clienteNombre}
                            </span>
                            {item.clienteTelefono && (
                              <span className="text-xs text-slate-500">
                                ({item.clienteTelefono})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Scissors className="h-4 w-4 text-blue-500" />
                            <span>
                              Barbero:{' '}
                              <strong className="text-[#0F172A]">{item.barberoNombre}</strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Sparkles className="h-4 w-4 text-slate-400" />
                            <span>{item.servicioNombre}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4 text-slate-400" />
                            <span>{item.sucursal}</span>
                          </div>
                        </div>

                        {(item.fechaCita || item.horaCita) && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>
                              Cita: {item.fechaCita} {item.horaCita}
                            </span>
                            {item.fecha_iso && (
                              <span>
                                · Enviada:{' '}
                                {new Date(item.fecha_iso).toLocaleString('es-MX', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </span>
                            )}
                          </div>
                        )}

                        {item.comentario && (
                          <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                            <p className="leading-relaxed">{item.comentario}</p>
                          </div>
                        )}
                      </div>

                      {isNew && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingId === item.id}
                          onClick={() => handleMarkReviewed(item.id)}
                          className="shrink-0 border-blue-200 text-blue-700 hover:bg-blue-50"
                        >
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          {updatingId === item.id ? 'Guardando...' : 'Marcar revisada'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

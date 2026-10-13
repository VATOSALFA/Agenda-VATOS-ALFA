
'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Search, Upload, Combine, Download, ChevronDown, AlertTriangle, Edit, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, User, UserPlus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Mail, MessageCircle, SlidersHorizontal, ShieldAlert, Filter, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Client, Local, Reservation, Sale, Profesional } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { NewClientForm } from "@/components/clients/new-client-form";
import { ClientDetailModal } from "@/components/clients/client-detail-modal";
import { NewReservationForm } from "@/components/reservations/new-reservation-form";
import { CombineClientsModal } from "@/components/clients/combine-clients-modal";
import { format, startOfDay, endOfDay, parseISO, getMonth, getYear, subMonths } from "date-fns";
import { es } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { deleteDoc, doc, where, Timestamp, collection, query, getDocs } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { UploadClientsModal } from "@/components/clients/upload-clients-modal";
import * as XLSX from 'xlsx';
import { useAuth } from "@/contexts/firebase-auth-context";
import { useDebounce } from "@/hooks/use-debounce";
import { useFeatures } from "@/hooks/use-features";
import Image from 'next/image';
import { logAuditAction } from '@/lib/audit-logger';

interface EmpresaSettings {
  receipt_logo_url?: string;
}

export const dynamic = 'force-dynamic';

const months = Array.from({ length: 12 }, (_, i) => ({
  value: i.toString(),
  label: format(new Date(2000, i, 1), 'LLLL', { locale: es })
}));

const currentCalendarYear = new Date().getFullYear();
const availableYears = Array.from({ length: 6 }, (_, i) => currentCalendarYear - i);


const FiltersSidebar = ({
  onApply,
  onReset,
  dateRange, setDateRange,
  localFilter, setLocalFilter,
  birthdayMonthFilter, setBirthdayMonthFilter,
  newClientsMonthFilter, setNewClientsMonthFilter,
  newClientsYearFilter, setNewClientsYearFilter,
  professionalFilter, setProfessionalFilter,
  inactiveTimeFilter, setInactiveTimeFilter,
  topSpentFilter, setTopSpentFilter,
  locales,
  professionals,
  isLoading,
  isLocalAdmin,
  logoUrl,
  empresaLoading
}: {
  onApply: () => void,
  onReset: () => void,
  dateRange: DateRange | undefined,
  setDateRange: (range: DateRange | undefined) => void,
  localFilter: string,
  setLocalFilter: (val: string) => void,
  birthdayMonthFilter: string,
  setBirthdayMonthFilter: (val: string) => void,
  newClientsMonthFilter: string,
  setNewClientsMonthFilter: (val: string) => void,
  newClientsYearFilter: string,
  setNewClientsYearFilter: (val: string) => void,
  professionalFilter: string,
  setProfessionalFilter: (val: string) => void,
  inactiveTimeFilter: string,
  setInactiveTimeFilter: (val: string) => void,
  topSpentFilter: string,
  setTopSpentFilter: (val: string) => void,
  locales: Local[],
  professionals: Profesional[],
  isLoading: boolean,
  isLocalAdmin: boolean,
  logoUrl?: string,
  empresaLoading: boolean
}) => {

  return (
    <div className="space-y-3 flex flex-col h-full text-xs">
      <div className="flex items-center gap-2 pb-2 border-b border-border/50 text-foreground font-semibold">
        <SlidersHorizontal className="h-4 w-4 text-slate-400 shrink-0" />
        <span className="text-sm">Filtros avanzados</span>
      </div>

      <div className="space-y-2.5">
        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Periodo de consumo</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={"outline"} className="w-full justify-start text-left font-normal h-8 text-xs px-2.5">
                <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="flex-grow truncate">
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>{format(dateRange.from, "dd/MM/yy", { locale: es })} - {format(dateRange.to, "dd/MM/yy", { locale: es })}</>
                    ) : (
                      format(dateRange.from, "dd/MM/yy", { locale: es })
                    )
                  ) : (
                    <span className="text-muted-foreground">Desde / hasta</span>
                  )}
                </span>
                {dateRange && (
                  <X className="ml-1 h-3.5 w-3.5 text-muted-foreground hover:text-foreground shrink-0" onClick={(e) => { e.stopPropagation(); setDateRange(undefined); }} />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={1} locale={es} />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Clientes nuevos</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <Select value={newClientsMonthFilter} onValueChange={setNewClientsMonthFilter} disabled={isLoading}>
              <SelectTrigger className="w-full h-8 text-xs px-2"><SelectValue placeholder="Mes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los meses</SelectItem>
                {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={newClientsYearFilter} onValueChange={setNewClientsYearFilter} disabled={isLoading}>
              <SelectTrigger className="w-full h-8 text-xs px-2"><SelectValue placeholder="Año" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los años</SelectItem>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mejores clientes</Label>
          <Select value={topSpentFilter} onValueChange={setTopSpentFilter} disabled={isLoading}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los clientes</SelectItem>
              <SelectItem value="top10">Top 10 que más consumen</SelectItem>
              <SelectItem value="top25">Top 25 que más consumen</SelectItem>
              <SelectItem value="top50">Top 50 que más consumen</SelectItem>
              <SelectItem value="min500">Consumo mayor a $500</SelectItem>
              <SelectItem value="min1000">Consumo mayor a $1,000</SelectItem>
              <SelectItem value="min2000">Consumo mayor a $2,000</SelectItem>
              <SelectItem value="min5000">Consumo mayor a $5,000</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tiempo sin visita</Label>
          <Select value={inactiveTimeFilter} onValueChange={setInactiveTimeFilter} disabled={isLoading}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="2">Más de 2 meses</SelectItem>
              <SelectItem value="3">Más de 3 meses</SelectItem>
              <SelectItem value="4">Más de 4 meses</SelectItem>
              <SelectItem value="6">Más de 6 meses</SelectItem>
              <SelectItem value="12">Más de 1 año</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Mes de cumpleaños</Label>
          <Select value={birthdayMonthFilter} onValueChange={setBirthdayMonthFilter} disabled={isLoading}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccione un mes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los meses</SelectItem>
              {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Local / Sede</Label>
          <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLoading || isLocalAdmin}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
            <SelectContent>
              {!isLocalAdmin && <SelectItem value="todos">Todos los locales</SelectItem>}
              {locales.map((l: Local) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Profesional</Label>
          <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={isLoading}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {professionals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5 pt-2 border-t border-border/50">
        <Button
          className="btn-vatos-alfa w-full h-8 rounded-xl text-xs font-bold text-white tracking-wide shadow-sm"
          onClick={onApply}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Buscando...</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              <span>Buscar</span>
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={onReset}
          disabled={isLoading}
        >
          Restablecer filtros
        </Button>
      </div>

      {logoUrl && !empresaLoading && (
        <div className="mt-auto pt-3 flex justify-center pb-1 opacity-70 hover:opacity-100 transition-opacity">
          <Image src={logoUrl} alt="Logo" width={120} height={50} className="max-h-10 w-auto object-contain" />
        </div>
      )}
    </div>
  );
}

const ClientSearchBar = React.memo(function ClientSearchBar({
  onSearch,
}: {
  onSearch: (term: string) => void;
}) {
  const [localValue, setLocalValue] = useState('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onSearch(val);
    }, 250);
  };

  const handleClear = () => {
    setLocalValue('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      onSearch(localValue);
    }
  };

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Busca por nombre, apellido, email, teléfono o número de cliente"
        className="pl-10 pr-10 h-10"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        name="client_search_query"
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-sm focus:outline-none"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});

export default function ClientsPage() {
  const { user, db } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const canSeeClientes = useMemo(() => {
    if (!user) return false;
    if (user.role === 'Administrador general') return true;
    return user.permissions?.includes('ver_clientes') ?? false;
  }, [user]);

  useEffect(() => {
    if (user && !canSeeClientes) {
      toast({
        variant: 'destructive',
        title: 'Acceso no autorizado',
        description: 'No tienes permisos para ver la sección de clientes.'
      });
      router.replace('/agenda');
    }
  }, [user, canSeeClientes, router, toast]);

  const { enableMarketing } = useFeatures();
  const [searchTerm, setSearchTerm] = useState('');
  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCombineModalOpen, setIsCombineModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  type SortField = 'numero_cliente' | 'nombre' | 'apellido' | 'creado_en' | 'gasto_total' | null;
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [localFilter, setLocalFilter] = useState('todos');
  const [birthdayMonthFilter, setBirthdayMonthFilter] = useState('todos');
  const [newClientsMonthFilter, setNewClientsMonthFilter] = useState('todos');
  const [newClientsYearFilter, setNewClientsYearFilter] = useState('todos');
  const [professionalFilter, setProfessionalFilter] = useState('todos');
  const [inactiveTimeFilter, setInactiveTimeFilter] = useState('todos');
  const [topSpentFilter, setTopSpentFilter] = useState('todos');

  const [activeFilters, setActiveFilters] = useState({
    dateRange: dateRange,
    local: 'todos',
    birthdayMonth: 'todos',
    newClientsMonth: 'todos',
    newClientsYear: 'todos',
    professional: 'todos',
    inactiveTime: 'todos',
    topSpent: 'todos'
  });

  const [queryKey, setQueryKey] = useState(0);

  const { data: clients, loading: clientsLoading } = useFirestoreQuery<Client>('clientes', queryKey);
  const { data: locales, loading: localesLoading } = useFirestoreQuery<Local>('locales', queryKey);
  const { data: professionals, loading: professionalsLoading } = useFirestoreQuery<Profesional>('profesionales', queryKey);
  const { data: empresaData, loading: empresaLoading } = useFirestoreQuery<EmpresaSettings>('empresa', 'main', where('__name__', '==', 'main'));
  const logoUrl = empresaData?.[0]?.receipt_logo_url;

  const historyQueryConstraints = useMemo(() => {
    const constraints = [];
    if (activeFilters.dateRange?.from) {
      constraints.push(where('fecha_hora_venta', '>=', Timestamp.fromDate(startOfDay(activeFilters.dateRange.from))));
    }
    if (activeFilters.dateRange?.to) {
      constraints.push(where('fecha_hora_venta', '<=', Timestamp.fromDate(endOfDay(activeFilters.dateRange.to))));
    }
    return constraints;
  }, [activeFilters.dateRange]);

  const { data: sales, loading: salesLoading } = useFirestoreQuery<Sale>('ventas', `sales-${queryKey}`, ...historyQueryConstraints);

  // LAZY LOAD STATE: Store history only when needed
  const [historicalSales, setHistoricalSales] = useState<Sale[]>([]);
  const [historicalReservations, setHistoricalReservations] = useState<Reservation[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);

  const clientSpentMap = useMemo(() => {
    const map = new Map<string, number>();
    const salesSource = hasLoadedHistory ? historicalSales : sales;

    // Inicializar con gasto_total del cliente si existe
    clients.forEach(c => {
      map.set(c.id, typeof c.gasto_total === 'number' ? c.gasto_total : 0);
    });

    // Calcular con precisión sumando las ventas
    if (salesSource && salesSource.length > 0) {
      const salesSum = new Map<string, number>();
      salesSource.forEach(sale => {
        const clientId = sale.cliente_id;
        if (!clientId) return;

        if (activeFilters.dateRange) {
          let saleDate: Date | null = null;
          if (sale.fecha_hora_venta instanceof Timestamp) saleDate = sale.fecha_hora_venta.toDate();
          else if ((sale.fecha_hora_venta as any)?.seconds) saleDate = new Date((sale.fecha_hora_venta as any).seconds * 1000);
          else if (typeof sale.fecha_hora_venta === 'string') saleDate = parseISO(sale.fecha_hora_venta);

          if (saleDate) {
            if (activeFilters.dateRange.from && saleDate < startOfDay(activeFilters.dateRange.from)) return;
            if (activeFilters.dateRange.to && saleDate > endOfDay(activeFilters.dateRange.to)) return;
          }
        }

        const total = Number(sale.total) || 0;
        salesSum.set(clientId, (salesSum.get(clientId) || 0) + total);
      });

      salesSum.forEach((amt, clientId) => {
        map.set(clientId, amt);
      });
    }

    return map;
  }, [clients, sales, historicalSales, hasLoadedHistory, activeFilters.dateRange]);

  const isLoading = clientsLoading || localesLoading || professionalsLoading || isHistoryLoading;

  const canViewPhone = useMemo(() => {
    if (user?.role === 'Administrador general' || user?.role === 'Administrador local') return true;
    return user?.permissions?.includes('ver_numero_telefono');
  }, [user]);

  useEffect(() => {
    if (user?.local_id) {
      setLocalFilter(user.local_id);
      setActiveFilters(prev => ({ ...prev, local: user.local_id! }));
    }
  }, [user]);

  const handleApplyFilters = async () => {
    if (!db) return;

    // Check if we need historical data for the selected filters
    const needsHistory =
      inactiveTimeFilter !== 'todos' ||
      professionalFilter !== 'todos' ||
      localFilter !== 'todos' ||
      topSpentFilter !== 'todos' ||
      dateRange !== undefined;

    if (needsHistory && !hasLoadedHistory) {
      setIsHistoryLoading(true);
      toast({ title: "Cargando historial...", description: "Obteniendo datos para filtros avanzados." });

      try {
        const [salesSnap, reservationsSnap] = await Promise.all([
          getDocs(collection(db, 'ventas')),
          getDocs(collection(db, 'reservas'))
        ]);

        const salesData = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
        const reservationsData = reservationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reservation));

        setHistoricalSales(salesData);
        setHistoricalReservations(reservationsData);
        setHasLoadedHistory(true);
      } catch (error) {
        console.error("Error loading history for filters:", error);
        toast({
          variant: "destructive",
          title: "Error al cargar filtros",
          description: "No se pudo obtener el historial completo."
        });
      } finally {
        setIsHistoryLoading(false);
      }
    }

    if (topSpentFilter !== 'todos') {
      setSortField('gasto_total');
      setSortDirection('desc');
    } else if ((newClientsMonthFilter !== 'todos' || newClientsYearFilter !== 'todos') && !sortField) {
      setSortField('creado_en');
      setSortDirection('desc');
    }

    setActiveFilters({
      dateRange,
      local: localFilter,
      birthdayMonth: birthdayMonthFilter,
      newClientsMonth: newClientsMonthFilter,
      newClientsYear: newClientsYearFilter,
      professional: professionalFilter,
      inactiveTime: inactiveTimeFilter,
      topSpent: topSpentFilter
    });
    setCurrentPage(1);
    toast({ title: "Filtros aplicados" });
  };

  const handleResetFilters = () => {
    setDateRange(undefined);
    setLocalFilter(user?.local_id || 'todos');
    setBirthdayMonthFilter('todos');
    setNewClientsMonthFilter('todos');
    setNewClientsYearFilter('todos');
    setProfessionalFilter('todos');
    setInactiveTimeFilter('todos');
    setTopSpentFilter('todos');
    setSortField(null);
    setSortDirection('asc');
    setActiveFilters({
      dateRange: undefined,
      local: user?.local_id || 'todos',
      birthdayMonth: 'todos',
      newClientsMonth: 'todos',
      newClientsYear: 'todos',
      professional: 'todos',
      inactiveTime: 'todos',
      topSpent: 'todos'
    });
    setCurrentPage(1);
    setQueryKey(prev => prev + 1);
    toast({ title: "Filtros restablecidos" });
  };

  const filteredClients = useMemo(() => {
    let filtered = [...clients];

    const hasAdvancedFilters =
      activeFilters.local !== 'todos' ||
      activeFilters.dateRange !== undefined ||
      activeFilters.birthdayMonth !== 'todos' ||
      activeFilters.newClientsMonth !== 'todos' ||
      activeFilters.newClientsYear !== 'todos' ||
      activeFilters.professional !== 'todos' ||
      activeFilters.inactiveTime !== 'todos' ||
      activeFilters.topSpent !== 'todos';

    if (hasAdvancedFilters) {

      // --- OPTIMIZATION: Pre-calculate Last Visit Map ---
      // Instead of iterating historicalSales for EVERY client (O(NxM)), 
      // we iterate history ONCE (O(M)) and map outcomes.
      const clientLastVisitMap = new Map<string, Date>();

      if (activeFilters.inactiveTime !== 'todos' && hasLoadedHistory) {
        historicalSales.forEach(s => {
          const clientId = s.cliente_id;
          if (!clientId) return;

          let saleDate: Date | null = null;
          if (s.fecha_hora_venta instanceof Timestamp) {
            saleDate = s.fecha_hora_venta.toDate();
          } else if (typeof s.fecha_hora_venta === 'string') {
            saleDate = parseISO(s.fecha_hora_venta);
          }

          if (saleDate) {
            const currentLast = clientLastVisitMap.get(clientId);
            if (!currentLast || saleDate > currentLast) {
              clientLastVisitMap.set(clientId, saleDate);
            }
          }
        });

        historicalReservations.forEach(r => {
          const clientId = r.cliente_id;
          if (!clientId) return;
          if (r.estado !== 'Asiste' && r.estado !== 'Pagado' && r.estado !== 'Confirmado') return;

          const resDate = typeof r.fecha === 'string' ? parseISO(r.fecha) : null;
          if (resDate) {
            const currentLast = clientLastVisitMap.get(clientId);
            if (!currentLast || resDate > currentLast) {
              clientLastVisitMap.set(clientId, resDate);
            }
          }
        });
      }
      // ----------------------------------------------------

      // Filter by Inactive Time
      if (activeFilters.inactiveTime !== 'todos') {
        const monthsInactive = parseInt(activeFilters.inactiveTime, 10);
        const thresholdDate = subMonths(new Date(), monthsInactive);

        if (hasLoadedHistory) {
          filtered = filtered.filter(client => {
            const lastVisit = clientLastVisitMap.get(client.id);

            if (lastVisit) {
              return lastVisit < thresholdDate;
            } else {
              // If never visited, check creation date
              let createdDate: Date = new Date();
              if (client.creado_en instanceof Timestamp) {
                createdDate = client.creado_en.toDate();
              } else if ((client.creado_en as any)?.seconds) {
                createdDate = new Date((client.creado_en as any).seconds * 1000);
              }
              return createdDate < thresholdDate;
            }
          });
        }
      }

      if (activeFilters.local !== 'todos' || activeFilters.professional !== 'todos' || activeFilters.dateRange) {
        const clientIdsFromHistory = new Set<string>();

        const salesToCheck = hasLoadedHistory ? historicalSales : sales;

        // Optimization: Use Sets for faster lookup if list is large
        salesToCheck.forEach(s => {
          if (activeFilters.local !== 'todos' && s.local_id !== activeFilters.local) return;

          if (activeFilters.dateRange && hasLoadedHistory) {
            let saleDate: Date | null = null;
            if (s.fecha_hora_venta instanceof Timestamp) saleDate = s.fecha_hora_venta.toDate();
            else if ((s.fecha_hora_venta as any)?.seconds) saleDate = new Date((s.fecha_hora_venta as any).seconds * 1000);
            else if (typeof s.fecha_hora_venta === 'string') saleDate = parseISO(s.fecha_hora_venta);

            if (saleDate) {
              if (activeFilters.dateRange.from && saleDate < activeFilters.dateRange.from) return;
              if (activeFilters.dateRange.to && saleDate > endOfDay(activeFilters.dateRange.to)) return;
            }
          }

          let matchesProfessional = true;
          if (activeFilters.professional !== 'todos') {
            matchesProfessional = s.items?.some(item => item.barbero_id === activeFilters.professional) || false;
          }

          if (matchesProfessional && s.cliente_id) {
            clientIdsFromHistory.add(s.cliente_id);
          }
        });

        if (activeFilters.professional !== 'todos' && hasLoadedHistory) {
          historicalReservations.forEach(r => {
            if (r.estado === 'Cancelado') return;
            if (activeFilters.local !== 'todos' && r.local_id !== activeFilters.local) return;
            // Date logic optimization
            if (activeFilters.dateRange) {
              const resDate = typeof r.fecha === 'string' ? parseISO(r.fecha) : new Date();
              if (activeFilters.dateRange.from && resDate < activeFilters.dateRange.from) return;
              if (activeFilters.dateRange.to && resDate > endOfDay(activeFilters.dateRange.to)) return;
            }

            const matchesProf = r.items?.some(i => i.barbero_id === activeFilters.professional) || r.barbero_id === activeFilters.professional;
            if (matchesProf && r.cliente_id) {
              clientIdsFromHistory.add(r.cliente_id);
            }
          });
        }

        filtered = filtered.filter(c => clientIdsFromHistory.has(c.id));
      }

      if (activeFilters.birthdayMonth !== 'todos') {
        const monthToFilter = parseInt(activeFilters.birthdayMonth, 10);
        filtered = filtered.filter(client => {
          if (!client.fecha_nacimiento) return false;
          // Optimization: Check type once (most clients follow same pattern)
          const birthDate = typeof client.fecha_nacimiento === 'string'
            ? parseISO(client.fecha_nacimiento)
            : new Date((client.fecha_nacimiento as Timestamp).seconds * 1000);
          return getMonth(birthDate) === monthToFilter;
        });
      }

      // Filter by New Clients (Registration Month & Year)
      if (activeFilters.newClientsMonth !== 'todos' || activeFilters.newClientsYear !== 'todos') {
        const monthToFilter = activeFilters.newClientsMonth !== 'todos' ? parseInt(activeFilters.newClientsMonth, 10) : null;
        const yearToFilter = activeFilters.newClientsYear !== 'todos' ? parseInt(activeFilters.newClientsYear, 10) : null;

        filtered = filtered.filter(client => {
          if (!client.creado_en) return false;
          let createdDate: Date | null = null;
          if (client.creado_en instanceof Timestamp) {
            createdDate = client.creado_en.toDate();
          } else if ((client.creado_en as any)?.seconds) {
            createdDate = new Date((client.creado_en as any).seconds * 1000);
          } else if (typeof client.creado_en === 'string') {
            createdDate = parseISO(client.creado_en);
          }
          if (!createdDate || isNaN(createdDate.getTime())) return false;

          if (monthToFilter !== null && getMonth(createdDate) !== monthToFilter) {
            return false;
          }
          if (yearToFilter !== null && getYear(createdDate) !== yearToFilter) {
            return false;
          }
          return true;
        });
      }

      // Filter by Top Spenders (Mejores Clientes)
      if (activeFilters.topSpent !== 'todos') {
        if (activeFilters.topSpent === 'top10') {
          filtered = [...filtered]
            .sort((a, b) => (clientSpentMap.get(b.id) || 0) - (clientSpentMap.get(a.id) || 0))
            .filter(c => (clientSpentMap.get(c.id) || 0) > 0)
            .slice(0, 10);
        } else if (activeFilters.topSpent === 'top25') {
          filtered = [...filtered]
            .sort((a, b) => (clientSpentMap.get(b.id) || 0) - (clientSpentMap.get(a.id) || 0))
            .filter(c => (clientSpentMap.get(c.id) || 0) > 0)
            .slice(0, 25);
        } else if (activeFilters.topSpent === 'top50') {
          filtered = [...filtered]
            .sort((a, b) => (clientSpentMap.get(b.id) || 0) - (clientSpentMap.get(a.id) || 0))
            .filter(c => (clientSpentMap.get(c.id) || 0) > 0)
            .slice(0, 50);
        } else if (activeFilters.topSpent.startsWith('min')) {
          const minAmount = parseInt(activeFilters.topSpent.replace('min', ''), 10);
          filtered = filtered.filter(c => (clientSpentMap.get(c.id) || 0) >= minAmount);
        }
      }
    }


    if (searchTerm) {
      const normalizeText = (text: string) => text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
      const searchTerms = normalizeText(searchTerm).split(' ').filter(Boolean);

      filtered = filtered.filter(client => {
        const clientDataString = normalizeText([
          client.nombre,
          client.apellido,
          client.telefono,
          client.correo,
          client.numero_cliente,
        ].join(' '));

        return searchTerms.every(term => clientDataString.includes(term));
      });
    }

    return filtered;
  }, [clients, sales, searchTerm, activeFilters, historicalSales, historicalReservations, hasLoadedHistory, clientSpentMap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const getDateValue = (date: any): number => {
    if (!date) return 0;
    if (date instanceof Timestamp) return date.toDate().getTime();
    if (date?.seconds) return date.seconds * 1000;
    if (typeof date === 'string') return parseISO(date).getTime();
    return 0;
  };

  const sortedClients = useMemo(() => {
    if (!sortField) return filteredClients;

    return [...filteredClients].sort((a, b) => {
      let valA: any;
      let valB: any;

      switch (sortField) {
        case 'numero_cliente':
          valA = Number(a.numero_cliente) || 0;
          valB = Number(b.numero_cliente) || 0;
          break;
        case 'nombre':
          valA = (a.nombre || '').toLowerCase();
          valB = (b.nombre || '').toLowerCase();
          break;
        case 'apellido':
          valA = (a.apellido || '').toLowerCase();
          valB = (b.apellido || '').toLowerCase();
          break;
        case 'creado_en':
          valA = getDateValue(a.creado_en);
          valB = getDateValue(b.creado_en);
          break;
        case 'gasto_total':
          valA = clientSpentMap.get(a.id) || 0;
          valB = clientSpentMap.get(b.id) || 0;
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredClients, sortField, sortDirection, clientSpentMap]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection(field === 'gasto_total' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />;
    if (sortDirection === 'asc') return <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" />;
    return <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />;
  };

  const hasActiveFilters = useMemo(() => {
    return (
      activeFilters.local !== 'todos' ||
      activeFilters.dateRange !== undefined ||
      activeFilters.birthdayMonth !== 'todos' ||
      activeFilters.newClientsMonth !== 'todos' ||
      activeFilters.newClientsYear !== 'todos' ||
      activeFilters.professional !== 'todos' ||
      activeFilters.inactiveTime !== 'todos' ||
      activeFilters.topSpent !== 'todos' ||
      Boolean(searchTerm)
    );
  }, [activeFilters, searchTerm]);

  const totalPages = Math.ceil(sortedClients.length / itemsPerPage);
  const paginatedClients = sortedClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );


  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailModalOpen(true);
  };

  const handleOpenEditModal = (client: Client) => {
    setEditingClient(client);
    setIsClientModalOpen(true);
  };

  const handleOpenNewModal = () => {
    setEditingClient(null);
    setIsClientModalOpen(true);
  }

  const handleDeleteClient = async () => {
    if (!clientToDelete || deleteConfirmationText !== 'ELIMINAR' || !db) return;
    try {
      await deleteDoc(doc(db, "clientes", clientToDelete.id));
      toast({
        title: "Cliente Eliminado",
        description: `${clientToDelete.nombre} ${clientToDelete.apellido} ha sido eliminado permanentemente.`,
      });
      setQueryKey(prevKey => prevKey + 1);
    } catch (error) {
      console.error("Error deleting client: ", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar el cliente. Inténtalo de nuevo.",
      });
    } finally {
      setClientToDelete(null);
      setDeleteConfirmationText('');
    }
  };

  const handleDataUpdated = () => {
    setQueryKey(prevKey => prevKey + 1);
  };

  const formatDate = (date: any, formatString: string = 'PP') => {
    if (!date) return 'N/A';
    let dateObj: Date;
    if (date.seconds) {
      dateObj = new Date(date.seconds * 1000);
    } else if (typeof date === 'string') {
      dateObj = parseISO(date);
    } else {
      return 'Fecha inválida';
    }

    if (isNaN(dateObj.getTime())) return 'Fecha inválida';

    return format(dateObj, formatString, { locale: es });
  };

  const triggerDownload = async () => {
    if (filteredClients.length === 0) {
      toast({
        title: "No hay datos para exportar",
        description: "No hay clientes en la lista actual.",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Generando reporte...",
      description: "Esto puede tardar unos segundos.",
    });

    // Ensure history is loaded for accurate report (total spent, visits)
    let salesForReport = historicalSales;
    let reservationsForReport = historicalReservations;

    if (!hasLoadedHistory && db) {
      toast({ title: "Cargando historial completo...", description: "Necesario para el reporte." });
      try {
        const [salesSnap, reservationsSnap] = await Promise.all([
          getDocs(collection(db, 'ventas')),
          getDocs(collection(db, 'reservas'))
        ]);
        salesForReport = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
        reservationsForReport = reservationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reservation));

        setHistoricalSales(salesForReport);
        setHistoricalReservations(reservationsForReport);
        setHasLoadedHistory(true);
      } catch (e) {
        console.error("Error fetching for export", e);
        toast({ variant: "destructive", title: "Error en reporte", description: "No se pudieron cargar todos los datos." })
      }
    }

    const dataForExcel = filteredClients.map(client => {
      const clientReservations = reservationsForReport.filter(r => r.cliente_id === client.id);
      const clientSales = salesForReport.filter(s => s.cliente_id === client.id);

      const totalAppointments = clientReservations.length;
      const attendedAppointments = clientReservations.filter(r => r.estado === 'Asiste' || r.estado === 'Pagado').length;
      const unattendedAppointments = clientReservations.filter(r => r.estado === 'No asiste').length;
      const cancelledAppointments = clientReservations.filter(r => r.estado === 'Cancelado').length;
      const totalSpent = clientSales.reduce((acc, sale) => acc + (sale.total || 0), 0);

      return {
        'Nombre': client.nombre || '',
        'Apellido': client.apellido || '',
        'Correo': client.correo || '',
        'Teléfono': client.telefono || '',
        'Fecha de Nacimiento': client.fecha_nacimiento ? formatDate(client.fecha_nacimiento, 'dd/MM/yy') : 'N/A',
        'Cliente desde': client.creado_en ? formatDate(client.creado_en, 'dd/MM/yy') : 'N/A',
        'Número de cliente': client.numero_cliente || '',
        'Citas totales': client.citas_totales ?? totalAppointments,
        'Citas asistidas': client.citas_asistidas ?? attendedAppointments,
        'Citas no asistidas': client.citas_no_asistidas ?? unattendedAppointments,
        'Citas canceladas': client.citas_canceladas ?? cancelledAppointments,
        'Gasto total': client.gasto_total ?? totalSpent,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

    XLSX.writeFile(workbook, `clientes_VATOS_ALFA_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
      title: "Descarga iniciada",
      description: "Tu archivo de Excel se está descargando.",
    });
  };

  const handleDownloadRequest = async () => {
    if (!authCode || !db) {
      toast({ variant: 'destructive', title: 'Código requerido' });
      return;
    }
    const authCodeQuery = query(
      collection(db, 'codigos_autorizacion'),
      where('code', '==', authCode),
      where('active', '==', true),
      where('download', '==', true)
    );
    const querySnapshot = await getDocs(authCodeQuery);
    if (querySnapshot.empty) {
      toast({ variant: 'destructive', title: 'Código inválido o sin permiso' });
    } else {
      toast({ title: 'Código correcto', description: 'Iniciando descarga...' });
      triggerDownload();
      setIsDownloadModalOpen(false);
      await logAuditAction({
        action: 'Autorización por Código',
        details: `Acción autorizada: Descargar reporte de clientes filtrado.`,
        userId: user?.uid || 'unknown',
        userName: user?.displayName || user?.email || 'Unknown',
        userRole: user?.role,
        authCode: authCode,
        severity: 'info',
        localId: localFilter !== 'todos' ? localFilter : 'unknown'
      });
      setAuthCode('');
    }
  };

  const isLocalAdmin = user?.role !== 'Administrador general';

  if (user && !canSeeClientes) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[60vh] space-y-3">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Acceso no autorizado</h2>
        <p className="text-muted-foreground max-w-md">No tienes permiso para ver la base de clientes. Redirigiendo a tu agenda...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Base de clientes</h2>
          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(true)}
              title="Cargar clientes"
              aria-label="Cargar clientes"
              className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
              <Upload className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleOpenNewModal}
              title="Nuevo cliente"
              aria-label="Nuevo cliente"
              className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
              <UserPlus className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className={cn(
            "lg:col-span-1",
            showMobileFilters ? "block" : "hidden lg:block"
          )}>
            <div className="rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
              <FiltersSidebar
                onApply={() => {
                  handleApplyFilters();
                  setShowMobileFilters(false);
                }}
                onReset={handleResetFilters}
                dateRange={dateRange} setDateRange={setDateRange}
                localFilter={localFilter} setLocalFilter={setLocalFilter}
                birthdayMonthFilter={birthdayMonthFilter} setBirthdayMonthFilter={setBirthdayMonthFilter}
                newClientsMonthFilter={newClientsMonthFilter} setNewClientsMonthFilter={setNewClientsMonthFilter}
                newClientsYearFilter={newClientsYearFilter} setNewClientsYearFilter={setNewClientsYearFilter}
                professionalFilter={professionalFilter}
                setProfessionalFilter={setProfessionalFilter}
                inactiveTimeFilter={inactiveTimeFilter}
                setInactiveTimeFilter={setInactiveTimeFilter}
                topSpentFilter={topSpentFilter}
                setTopSpentFilter={setTopSpentFilter}
                professionals={professionals}
                locales={locales}
                isLoading={isLoading}
                isLocalAdmin={user?.role === 'Administrador local' || Boolean(user?.local_id)}
                logoUrl={logoUrl}
                empresaLoading={empresaLoading}
              />
            </div>
          </aside>

          <main className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <div className="flex-1 flex items-center gap-2">
                <ClientSearchBar onSearch={handleSearchChange} />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className={cn(
                    "lg:hidden h-9 px-2.5 text-xs flex items-center gap-1.5 shrink-0 border-border/80",
                    showMobileFilters && "border-blue-500 bg-blue-500/10 text-blue-600 font-semibold"
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
                  <span className="hidden xs:inline">Filtros</span>
                  {hasActiveFilters && (
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  )}
                </Button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 text-xs">
                    Acciones <ChevronDown className="ml-1.5 h-3.5 w-3.5 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => {
                    setTimeout(() => setIsCombineModalOpen(true), 150);
                  }}>
                    <Combine className="mr-2 h-4 w-4" />
                    <span>Combinar clientes</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => {
                    setTimeout(() => setIsDownloadModalOpen(true), 150);
                  }}>
                    <Download className="mr-2 h-4 w-4" />
                    <span>Descargar este listado</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground px-0.5">
              <span>
                {isLoading ? (
                  "Cargando clientes..."
                ) : (
                  <>
                    Se {filteredClients.length === 1 ? 'encontró' : 'encontraron'}{' '}
                    <strong className="text-slate-900 font-semibold">{filteredClients.length.toLocaleString('es-MX')}</strong>{' '}
                    {filteredClients.length === 1 ? 'cliente' : 'clientes'}
                    {hasActiveFilters && (
                      <span className="text-slate-500 ml-1">
                        (de {clients.length.toLocaleString('es-MX')} en total)
                      </span>
                    )}
                  </>
                )}
              </span>

              {!isLoading && paginatedClients.length > 0 && (
                <div className="flex items-center gap-3 ml-auto">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">Por pág:</span>
                    <Select
                      value={`${itemsPerPage}`}
                      onValueChange={(value) => {
                        setItemsPerPage(Number(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="h-7 w-[64px] text-xs px-2">
                        <SelectValue placeholder={itemsPerPage} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <span className="text-xs text-slate-700 font-medium whitespace-nowrap">
                    Página {currentPage} de {Math.max(1, totalPages)}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages || totalPages === 0}
                    >
                      Siguiente
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* VISTA MÓVIL: Tarjetas compactas sin scroll horizontal (sm:hidden) */}
            <div className="sm:hidden space-y-2.5">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i} className="p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </Card>
                ))
              ) : paginatedClients.map((client) => {
                const spent = clientSpentMap.get(client.id) || 0;
                const formattedSpent = `$${spent.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const hasPhone = client.telefono && client.telefono.trim().length > 0;
                const cleanPhone = client.telefono?.replace(/\D/g, '') || '';
                const whatsappUrl = hasPhone
                  ? `https://wa.me/${cleanPhone.length === 10 ? '52' + cleanPhone : cleanPhone}?text=Hola+${client.nombre},+te+extrañamos+en+VATOS+ALFA!`
                  : '#';

                return (
                  <div
                    key={client.id}
                    className="rounded-xl border border-border/70 bg-card p-3 shadow-sm space-y-2"
                  >
                    {/* Fila superior: Avatar, Nombre, ID y Acciones */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="h-9 w-9 border border-border/60 shrink-0">
                          <AvatarImage src={client.fotoUrl || client.avatarUrl || (client as any).foto_perfil_url} alt={client.nombre} className="object-cover" />
                          <AvatarFallback className="text-xs font-bold bg-muted text-foreground">
                            {client.nombre?.charAt(0)}{client.apellido?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm text-foreground truncate">
                              {client.nombre} {client.apellido}
                            </span>
                            {client.numero_cliente && (
                              <span className="font-mono text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/40">
                                #{client.numero_cliente}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {client.correo || 'Sin correo registrado'}
                          </p>
                        </div>
                      </div>

                      {/* Iconos limpios de acción */}
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={() => handleViewDetails(client)}
                          className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                          title="Ver detalles"
                        >
                          <User className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(client)}
                          className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setClientToDelete(client)}
                          className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-destructive transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Fila inferior: Teléfono, Registro y Consumo */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {canViewPhone && hasPhone ? (
                          <span className="font-medium text-foreground">{client.telefono}</span>
                        ) : (
                          <span>{canViewPhone ? 'Sin teléfono' : '****-****'}</span>
                        )}
                        {hasPhone && enableMarketing && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                            title="Enviar WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(client.creado_en)}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white bg-muted/60 px-2 py-0.5 rounded text-xs">
                          {formattedSpent}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!isLoading && paginatedClients.length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-xs">
                  {searchTerm ? "No se encontraron clientes." : "No hay clientes que coincidan con los filtros."}
                </p>
              )}
            </div>

            {/* VISTA ESCRITORIO: Tabla compacta de alta densidad (hidden sm:block) */}
            <Card className="hidden sm:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="h-8 bg-muted/30">
                      <TableHead className="py-1.5 px-3 text-xs h-8 cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => handleSort('numero_cliente')}>
                        <span className="flex items-center">Nº Cliente <SortIcon field="numero_cliente" /></span>
                      </TableHead>
                      <TableHead className="py-1.5 px-3 text-xs h-8 cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => handleSort('nombre')}>
                        <span className="flex items-center">Nombre <SortIcon field="nombre" /></span>
                      </TableHead>
                      <TableHead className="py-1.5 px-3 text-xs h-8 cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => handleSort('apellido')}>
                        <span className="flex items-center">Apellido <SortIcon field="apellido" /></span>
                      </TableHead>
                      <TableHead className="py-1.5 px-3 text-xs h-8">Correo</TableHead>
                      <TableHead className="py-1.5 px-3 text-xs h-8">Teléfono</TableHead>
                      <TableHead className="py-1.5 px-3 text-xs h-8 cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => handleSort('creado_en')}>
                        <span className="flex items-center">Cliente desde <SortIcon field="creado_en" /></span>
                      </TableHead>
                      <TableHead className="py-1.5 px-3 text-xs h-8 cursor-pointer select-none hover:bg-muted/50 transition-colors text-right" onClick={() => handleSort('gasto_total')}>
                        <span className="flex items-center justify-end">Consumo <SortIcon field="gasto_total" /></span>
                      </TableHead>
                      {enableMarketing && <TableHead className="py-1.5 px-3 text-xs h-8 w-[50px]">Contacto</TableHead>}
                      <TableHead className="py-1.5 px-3 text-xs h-8 text-right">Opciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: itemsPerPage }).map((_, i) => (
                        <TableRow key={i} className="h-9">
                          <TableCell className="py-1.5 px-3 text-xs"><Skeleton className="h-4 w-12" /></TableCell>
                          <TableCell className="py-1.5 px-3 text-xs"><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell className="py-1.5 px-3 text-xs"><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell className="py-1.5 px-3 text-xs"><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell className="py-1.5 px-3 text-xs"><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell className="py-1.5 px-3 text-xs"><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell className="py-1.5 px-3 text-xs text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                          {enableMarketing && <TableCell className="py-1.5 px-3 text-xs"><Skeleton className="h-6 w-6" /></TableCell>}
                          <TableCell className="py-1.5 px-3 text-xs text-right"><Skeleton className="h-6 w-16 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : paginatedClients.map((client) => {
                      const hasPhone = client.telefono && client.telefono.trim().length > 0;
                      const cleanPhone = client.telefono?.replace(/\D/g, '') || '';

                      return (
                        <TableRow key={client.id} className="h-9 hover:bg-muted/30 transition-colors">
                          <TableCell className="py-1.5 px-3 text-xs font-mono">{client.numero_cliente || 'N/A'}</TableCell>
                          <TableCell className="py-1.5 px-3 text-xs font-medium">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6 border border-primary/20 shrink-0">
                                <AvatarImage src={client.fotoUrl || client.avatarUrl || (client as any).foto_perfil_url} alt={client.nombre} className="object-cover" />
                                <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                  {client.nombre?.charAt(0)}{client.apellido?.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate max-w-[120px]">{client.nombre}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5 px-3 text-xs truncate max-w-[120px]">{client.apellido}</TableCell>
                          <TableCell className="py-1.5 px-3 text-xs truncate max-w-[160px]">{client.correo}</TableCell>
                          <TableCell className="py-1.5 px-3 text-xs whitespace-nowrap">{canViewPhone ? client.telefono : '****-****'}</TableCell>
                          <TableCell className="py-1.5 px-3 text-xs whitespace-nowrap">{formatDate(client.creado_en)}</TableCell>
                          <TableCell className="py-1.5 px-3 text-xs text-right font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {(() => {
                              const spent = clientSpentMap.get(client.id) || 0;
                              return `$${spent.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            })()}
                          </TableCell>
                          {enableMarketing && (
                            <TableCell className="py-1 px-3">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-800 dark:hover:text-white">
                                    <MessageCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {hasPhone && (
                                    <DropdownMenuItem onClick={() => {
                                      const message = activeFilters.inactiveTime !== 'todos'
                                        ? `Hola ${client.nombre}, te extrañamos en VATOS ALFA. ¡Vuelve pronto!`
                                        : `Hola ${client.nombre}`;
                                      window.open(`https://wa.me/${cleanPhone.length === 10 ? '52' + cleanPhone : cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
                                    }}>
                                      <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                                    </DropdownMenuItem>
                                  )}
                                  {client.correo && (
                                    <DropdownMenuItem onClick={() => {
                                      const subject = activeFilters.inactiveTime !== 'todos' ? "¡Te extrañamos!" : "Hola desde VATOS ALFA";
                                      const body = activeFilters.inactiveTime !== 'todos' ? `Hola ${client.nombre},\n\nHace tiempo que no te vemos. ¡Reserva tu próxima cita hoy!` : `Hola ${client.nombre},`;
                                      window.open(`mailto:${client.correo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
                                    }}>
                                      <Mail className="mr-2 h-4 w-4" /> Email
                                    </DropdownMenuItem>
                                  )}
                                  {!hasPhone && !client.correo && (
                                    <div className="p-2 text-xs text-muted-foreground">Sin datos de contacto</div>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                          <TableCell className="py-1 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                                onClick={() => handleViewDetails(client)}
                                title="Ver detalles"
                              >
                                <User className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                                onClick={() => handleOpenEditModal(client)}
                                title="Editar"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-destructive transition-colors"
                                onClick={() => setClientToDelete(client)}
                                title="Eliminar"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {!isLoading && paginatedClients.length === 0 && (
                  <p className="text-center py-10 text-muted-foreground text-xs">
                    {searchTerm ? "No se encontraron clientes." : "No hay clientes que coincidan con los filtros."}
                  </p>
                )}
              </CardContent>
            </Card>

            {!isLoading && paginatedClients.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-end gap-4 sm:gap-6 py-4">
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium">Resultados por página</p>
                  <Select
                    value={`${itemsPerPage}`}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue placeholder={itemsPerPage} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm font-medium">
                  Página {currentPage} de {totalPages}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent hideCloseButton={true} className="max-w-xl p-0 overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] border-2 border-blue-500 bg-background flex flex-col">
          {/* CABECERA OFICIAL VATOS ALFA */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white px-4 sm:px-5 py-3 border-b border-blue-900/40 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <User className="h-4 w-4 text-slate-300 shrink-0" />
                <div>
                  <DialogTitle className="text-sm sm:text-base font-bold text-white tracking-wide">
                    {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300">
                    {editingClient ? 'Modifica los datos del cliente.' : 'Registra un nuevo cliente en el sistema.'}
                  </DialogDescription>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsClientModalOpen(false);
                  setEditingClient(null);
                }}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <NewClientForm
              onFormSubmit={() => {
                setIsClientModalOpen(false);
                setEditingClient(null);
                setQueryKey(prev => prev + 1);
              }}
              onCancel={() => {
                setIsClientModalOpen(false);
                setEditingClient(null);
              }}
              client={editingClient}
            />
          </div>
        </DialogContent>
      </Dialog>

      {selectedClient && (
        <>
          <ClientDetailModal
            client={clients.find(c => c.id === selectedClient.id) || selectedClient}
            isOpen={isDetailModalOpen}
            onOpenChange={setIsDetailModalOpen}
            onNewReservation={() => {
              setIsDetailModalOpen(false);
              setIsReservationModalOpen(true);
            }}
          />

          <Dialog open={isReservationModalOpen} onOpenChange={setIsReservationModalOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva Reserva para {selectedClient.nombre}</DialogTitle>
              </DialogHeader>
              <NewReservationForm
                initialData={{ cliente_id: selectedClient.id }}
                onFormSubmit={() => {
                  setIsReservationModalOpen(false);
                  toast({ title: "Reserva creada exitosamente" });
                }}
              />
            </DialogContent>
          </Dialog>
        </>
      )}

      <CombineClientsModal
        isOpen={isCombineModalOpen}
        onOpenChange={setIsCombineModalOpen}
        onClientsCombined={handleDataUpdated}
      />

      <UploadClientsModal
        isOpen={isUploadModalOpen}
        onOpenChange={setIsUploadModalOpen}
        onUploadComplete={handleDataUpdated}
      />

      {clientToDelete && (
        <Dialog open={!!clientToDelete} onOpenChange={(open) => {
          if (!open) {
            setClientToDelete(null);
            setDeleteConfirmationText('');
          }
        }}>
          <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
            {/* Header Oficial Vatos Alfa */}
            <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
              <div className="header-light-beam" aria-hidden="true" />
              <div className="relative z-10 flex items-center gap-3 min-w-0">
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                    ¿Eliminar Cliente?
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300">
                    Esta acción no se puede deshacer
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setClientToDelete(null);
                  setDeleteConfirmationText('');
                }}
                className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Esta acción eliminará permanentemente al cliente <strong className="text-foreground">{clientToDelete.nombre} {clientToDelete.apellido}</strong> y todo su historial asociado (citas, ventas y notas).
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="delete-confirm" className="text-xs font-semibold text-foreground">
                  Para confirmar, escribe <strong className="text-destructive font-mono">ELIMINAR</strong>
                </Label>
                <Input
                  id="delete-confirm"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="ELIMINAR"
                  className="h-9 rounded-xl border-border/80 focus-visible:ring-destructive"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setClientToDelete(null);
                  setDeleteConfirmationText('');
                }}
                className="rounded-xl h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteClient();
                }}
                disabled={deleteConfirmationText !== 'ELIMINAR'}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl h-9 px-4 text-xs font-semibold shadow-sm"
              >
                Sí, eliminar cliente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isDownloadModalOpen} onOpenChange={setIsDownloadModalOpen}>
        <DialogContent hideCloseButton={true} className="sm:max-w-md p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background">
          {/* Header Oficial Vatos Alfa */}
          <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
            <div className="header-light-beam" aria-hidden="true" />
            <div className="relative z-10 flex items-center justify-between w-full">
              <div className="flex items-center gap-3 min-w-0">
                <ShieldAlert className="h-5 w-5 text-slate-300 shrink-0" />
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
                    Requiere Autorización
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-300">
                    Descarga segura de listado de clientes
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setAuthCode('');
                  setIsDownloadModalOpen(false);
                }}
                className="h-8 w-8 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Para descargar este listado completo con información sensible, es necesario un código de autorización de administrador.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="auth-code" className="text-xs font-semibold text-foreground">
                Código de Autorización
              </Label>
              <Input
                id="auth-code"
                type="password"
                placeholder="Ingresa el código de autorización"
                value={authCode}
                onChange={e => setAuthCode(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleDownloadRequest();
                  }
                }}
                className="h-9 rounded-xl border-border/80 focus-visible:ring-blue-500"
                autoFocus
              />
            </div>
          </div>

          <div className="p-4 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setAuthCode('');
                setIsDownloadModalOpen(false);
              }}
              className="rounded-xl h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleDownloadRequest}
              disabled={isDownloading}
              className="btn-vatos-alfa rounded-xl h-9 px-4 text-xs font-bold text-white shadow-md"
            >
              {isDownloading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Procesando...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  <span>Aceptar y Descargar</span>
                </span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

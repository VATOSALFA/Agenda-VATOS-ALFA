
'use client';

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Search, Upload, Combine, Download, ChevronDown, AlertTriangle, Edit, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, User, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFirestoreQuery } from "@/hooks/use-firestore";
import type { Client, Local, Reservation, Sale, Profesional } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { NewClientForm } from "@/components/clients/new-client-form";
import { ClientDetailModal } from "@/components/clients/client-detail-modal";
import { NewReservationForm } from "@/components/reservations/new-reservation-form";
import { CombineClientsModal } from "@/components/clients/combine-clients-modal";
import { format, startOfDay, endOfDay, parseISO, getMonth, subMonths } from "date-fns";
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
import Image from 'next/image';

interface EmpresaSettings {
  receipt_logo_url?: string;
}

export const dynamic = 'force-dynamic';

const months = Array.from({ length: 12 }, (_, i) => ({
  value: i.toString(),
  label: format(new Date(2000, i, 1), 'LLLL', { locale: es })
}));


const FiltersSidebar = ({
  onApply,
  onReset,
  dateRange, setDateRange,
  localFilter, setLocalFilter,
  birthdayMonthFilter, setBirthdayMonthFilter,
  professionalFilter, setProfessionalFilter,
  inactiveTimeFilter, setInactiveTimeFilter,
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
  professionalFilter: string,
  setProfessionalFilter: (val: string) => void,
  inactiveTimeFilter: string,
  setInactiveTimeFilter: (val: string) => void,
  locales: Local[],
  professionals: Profesional[],
  isLoading: boolean,
  isLocalAdmin: boolean,
  logoUrl?: string,
  empresaLoading: boolean
}) => {

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div>
        <h3 className="text-xl font-bold">Filtros avanzados</h3>
        <div className="space-y-3 mt-4">
          <div className="space-y-1">
            <Label>Periodo de consumo</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  <span className="flex-grow">
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>{format(dateRange.from, "LLL dd, y", { locale: es })} - {format(dateRange.to, "LLL dd, y", { locale: es })}</>
                      ) : (
                        format(dateRange.from, "LLL dd, y", { locale: es })
                      )
                    ) : (
                      <span>Desde / hasta</span>
                    )}
                  </span>
                  {dateRange && (
                    <X className="ml-2 h-4 w-4 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); setDateRange(undefined); }} />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={1} locale={es} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label>Tiempo sin visita</Label>
            <Select value={inactiveTimeFilter} onValueChange={setInactiveTimeFilter} disabled={isLoading}>
              <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
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
            <Label>Mes de cumpleaños</Label>
            <Select value={birthdayMonthFilter} onValueChange={setBirthdayMonthFilter} disabled={isLoading}>
              <SelectTrigger><SelectValue placeholder="Seleccione un mes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los meses</SelectItem>
                {months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Local/sede</Label>
            <Select value={localFilter} onValueChange={setLocalFilter} disabled={isLoading || isLocalAdmin}>
              <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
              <SelectContent>
                {!isLocalAdmin && <SelectItem value="todos">Todos los locales</SelectItem>}
                {locales.map((l: Local) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Profesional</Label>
            <Select value={professionalFilter} onValueChange={setProfessionalFilter} disabled={isLoading}>
              <SelectTrigger><SelectValue placeholder="Seleccione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {professionals.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2 pt-4 border-t">
          <Button className="w-full" onClick={onApply} disabled={isLoading}>
            {isLoading ? "Cargando..." : "Buscar"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onReset} disabled={isLoading}>Restablecer</Button>
        </div>
      </div>
      <div className="mt-auto pt-6 flex justify-center pb-4">
        {empresaLoading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : logoUrl ? (
          <Image src={logoUrl} alt="Logo de la empresa" width={250} height={200} className="object-contain" />
        ) : null}
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const { user, db } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // 300ms debounce
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
  const [authCode, setAuthCode] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  type SortField = 'numero_cliente' | 'nombre' | 'apellido' | 'creado_en' | null;
  type SortDirection = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [localFilter, setLocalFilter] = useState('todos');
  const [birthdayMonthFilter, setBirthdayMonthFilter] = useState('todos');
  const [professionalFilter, setProfessionalFilter] = useState('todos');
  const [inactiveTimeFilter, setInactiveTimeFilter] = useState('todos');

  const [activeFilters, setActiveFilters] = useState({
    dateRange: dateRange,
    local: 'todos',
    birthdayMonth: 'todos',
    professional: 'todos',
    inactiveTime: 'todos'
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

    setActiveFilters({
      dateRange,
      local: localFilter,
      birthdayMonth: birthdayMonthFilter,
      professional: professionalFilter,
      inactiveTime: inactiveTimeFilter
    });
    setCurrentPage(1);
    toast({ title: "Filtros aplicados" });
  };

  const handleResetFilters = () => {
    setDateRange(undefined);
    setLocalFilter(user?.local_id || 'todos');
    setBirthdayMonthFilter('todos');
    setProfessionalFilter('todos');
    setInactiveTimeFilter('todos');
    setActiveFilters({
      dateRange: undefined,
      local: user?.local_id || 'todos',
      birthdayMonth: 'todos',
      professional: 'todos',
      inactiveTime: 'todos'
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
      activeFilters.professional !== 'todos' ||
      activeFilters.inactiveTime !== 'todos';

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

      if ((activeFilters.local !== 'todos' || activeFilters.professional !== 'todos' || activeFilters.dateRange) && (sales.length > 0 || hasLoadedHistory)) {
        const clientIdsFromHistory = new Set<string>();
        let hasHistoryFilter = false;

        const salesToCheck = hasLoadedHistory ? historicalSales : sales;

        // Optimization: Use Sets for faster lookup if list is large
        salesToCheck.forEach(s => {
          if (activeFilters.local !== 'todos' && s.local_id !== activeFilters.local) return;

          let matchesProfessional = true;
          if (activeFilters.professional !== 'todos') {
            matchesProfessional = s.items?.some(item => item.barbero_id === activeFilters.professional);
          }

          if (matchesProfessional) {
            clientIdsFromHistory.add(s.cliente_id);
            hasHistoryFilter = true;
          }
        });

        if (activeFilters.professional !== 'todos' && hasLoadedHistory) {
          historicalReservations.forEach(r => {
            if (r.estado === 'Cancelado') return;
            if (activeFilters.local !== 'todos' && r.local_id !== activeFilters.local) return;
            // Date logic optimization: Convert string to Date once if heavily reused, but here simple comparison is OK.
            if (activeFilters.dateRange) {
              const resDate = typeof r.fecha === 'string' ? parseISO(r.fecha) : new Date();
              if (activeFilters.dateRange.from && resDate < activeFilters.dateRange.from) return;
              if (activeFilters.dateRange.to && resDate > activeFilters.dateRange.to) return;
            }

            const matchesProf = r.items?.some(i => i.barbero_id === activeFilters.professional) || r.barbero_id === activeFilters.professional;
            if (matchesProf) {
              clientIdsFromHistory.add(r.cliente_id);
              hasHistoryFilter = true;
            }
          });
        }

        if (hasHistoryFilter) {
          filtered = filtered.filter(c => clientIdsFromHistory.has(c.id));
        }
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
    }


    if (debouncedSearchTerm) {
      const searchTerms = debouncedSearchTerm.toLowerCase().split(' ').filter(Boolean);
      filtered = filtered.filter(client => {
        const clientDataString = [
          client.nombre,
          client.apellido,
          client.telefono,
          client.correo,
          client.numero_cliente,
        ].join(' ').toLowerCase();

        return searchTerms.every(term => clientDataString.includes(term));
      });
    }

    return filtered;
  }, [clients, sales, debouncedSearchTerm, activeFilters, historicalSales, historicalReservations, hasLoadedHistory]);

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
        default:
          return 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredClients, sortField, sortDirection]);

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
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />;
    if (sortDirection === 'asc') return <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" />;
    return <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />;
  };

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
      setAuthCode('');
    }
  };

  const isLocalAdmin = user?.role !== 'Administrador general';

  return (
    <>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Base de clientes</h2>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => setIsUploadModalOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Cargar clientes
            </Button>
            <Button onClick={handleOpenNewModal}>
              <PlusCircle className="mr-2 h-4 w-4" /> Nuevo cliente
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <aside className="lg:col-span-1">
            <FiltersSidebar
              onApply={handleApplyFilters}
              onReset={handleResetFilters}
              dateRange={dateRange} setDateRange={setDateRange}
              localFilter={localFilter} setLocalFilter={setLocalFilter}
              birthdayMonthFilter={birthdayMonthFilter} setBirthdayMonthFilter={setBirthdayMonthFilter}
              professionalFilter={professionalFilter}
              setProfessionalFilter={setProfessionalFilter}
              inactiveTimeFilter={inactiveTimeFilter}
              setInactiveTimeFilter={setInactiveTimeFilter}
              professionals={professionals}
              locales={locales}
              isLoading={isLoading}
              isLocalAdmin={user?.role === 'Administrador local' || Boolean(user?.local_id)}
              logoUrl={logoUrl}
              empresaLoading={empresaLoading}
            />
          </aside>

          <main className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Busca por nombre, apellido, email, teléfono o número de cliente"
                  className="pl-10 h-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline">Crear una audiencia con este listado</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Acciones <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setIsCombineModalOpen(true)}>
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
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => handleSort('numero_cliente')}>
                        <span className="flex items-center">Nº Cliente <SortIcon field="numero_cliente" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => handleSort('nombre')}>
                        <span className="flex items-center">Nombre <SortIcon field="nombre" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => handleSort('apellido')}>
                        <span className="flex items-center">Apellido <SortIcon field="apellido" /></span>
                      </TableHead>
                      <TableHead>Correo</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead className="cursor-pointer select-none hover:bg-muted/50 transition-colors" onClick={() => handleSort('creado_en')}>
                        <span className="flex items-center">Cliente desde <SortIcon field="creado_en" /></span>
                      </TableHead>
                      <TableHead className="w-[50px]">Mensaje</TableHead>
                      <TableHead className="text-right">Opciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: itemsPerPage }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : paginatedClients.map((client) => {
                      const hasPhone = client.telefono && client.telefono.trim().length > 0;
                      const cleanPhone = client.telefono?.replace(/\D/g, '') || '';
                      const whatsappUrl = hasPhone
                        ? `https://wa.me/${cleanPhone.length === 10 ? '52' + cleanPhone : cleanPhone}?text=Hola+${client.nombre},+te+extrañamos+en+VATOS+ALFA!`
                        : '#';

                      return (
                        <TableRow key={client.id}>
                          <TableCell>{client.numero_cliente || 'N/A'}</TableCell>
                          <TableCell className="font-medium">{client.nombre}</TableCell>
                          <TableCell>{client.apellido}</TableCell>
                          <TableCell>{client.correo}</TableCell>
                          <TableCell>{canViewPhone ? client.telefono : '****-****'}</TableCell>
                          <TableCell>{formatDate(client.creado_en)}</TableCell>
                          <TableCell>
                            {hasPhone && (
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                title="Enviar mensaje de WhatsApp"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-circle"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewDetails(client)}>
                                <User className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEditModal(client)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setClientToDelete(client)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {!isLoading && paginatedClients.length === 0 && (
                  <p className="text-center py-10 text-muted-foreground">
                    {searchTerm ? "No se encontraron clientes." : "No hay clientes que coincidan con los filtros."}
                  </p>
                )}
              </CardContent>
            </Card>

            {!isLoading && paginatedClients.length > 0 && (
              <div className="flex items-center justify-end space-x-2 py-4">
                <div className="flex-1 text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </div>
                <div className="space-x-2">
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
          </DialogHeader>
          <NewClientForm
            onClientCreated={() => {
              setIsClientModalOpen(false);
              setEditingClient(null);
              setQueryKey(prev => prev + 1);
            }}
            onCancel={() => {
              setIsClientModalOpen(false);
              setEditingClient(null);
            }}
            initialData={editingClient}
          />
        </DialogContent>
      </Dialog>

      {selectedClient && (
        <>
          <ClientDetailModal
            client={selectedClient}
            isOpen={isDetailModalOpen}
            onClose={() => setIsDetailModalOpen(false)}
            onOpenReservation={() => {
              setIsDetailModalOpen(false);
              setIsReservationModalOpen(true);
            }}
            onEdit={(client) => {
              setIsDetailModalOpen(false);
              setEditingClient(client);
              setIsClientModalOpen(true);
            }}
          />

          <Dialog open={isReservationModalOpen} onOpenChange={setIsReservationModalOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nueva Reserva para {selectedClient.nombre}</DialogTitle>
              </DialogHeader>
              <NewReservationForm
                preSelectedClientId={selectedClient.id}
                onReservationCreated={() => {
                  setIsReservationModalOpen(false);
                  toast({ title: "Reserva creada exitosamente" });
                }}
                onCancel={() => setIsReservationModalOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </>
      )}

      <CombineClientsModal
        isOpen={isCombineModalOpen}
        onClose={() => setIsCombineModalOpen(false)}
        onClientsCombined={handleDataUpdated}
      />

      <UploadClientsModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onClientsUploaded={handleDataUpdated}
      />

      {clientToDelete && (
        <Dialog open={!!clientToDelete} onOpenChange={(open) => {
          if (!open) {
            setClientToDelete(null);
            setDeleteConfirmationText('');
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center"><AlertTriangle className="h-6 w-6 mr-2 text-destructive" />¿Estás absolutamente seguro?</DialogTitle>
              <DialogDescription>
                Esta acción no se puede deshacer. Esto eliminará permanentemente al cliente <strong>{clientToDelete.nombre} {clientToDelete.apellido}</strong> y toda la información asociada.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="delete-confirm">Para confirmar, escribe <strong>ELIMINAR</strong></Label>
              <Input
                id="delete-confirm"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="ELIMINAR"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setClientToDelete(null); setDeleteConfirmationText(''); }}>Cancelar</Button>
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteClient();
                }}
                disabled={deleteConfirmationText !== 'ELIMINAR'}
                className="bg-destructive hover:bg-destructive/90"
              >
                Sí, eliminar cliente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={isDownloadModalOpen} onOpenChange={setIsDownloadModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              Requiere Autorización
            </AlertDialogTitle>
            <AlertDialogDescription>
              Para descargar este listado completo con información sensible, es necesario un código de autorización.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="auth-code">Código de Autorización</Label>
            <Input id="auth-code" type="password" placeholder="Ingrese el código" value={authCode} onChange={e => setAuthCode(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAuthCode('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDownloadRequest}>Aceptar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

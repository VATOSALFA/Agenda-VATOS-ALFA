

import { Timestamp } from "firebase/firestore";

export interface Client {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  fecha_nacimiento?: string | Timestamp | Date | null;
  notas?: string;
  creado_en: Timestamp; // Firestore Timestamp
  citas_totales?: number;
  citas_asistidas?: number;
  citas_no_asistidas?: number;
  citas_canceladas?: number;
  gasto_total?: number;
  numero_cliente?: string;
  reviewRequestSent?: boolean;
}

export interface Local {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  schedule: Schedule;
  timezone: string;
  acceptsOnline: boolean;
  delivery: boolean;
}


export interface Profesional {
    id: string;
    userId: string;
    name: string;
    email: string;
    avatar: string;
    dataAiHint?: string;
    active: boolean;
    acceptsOnline: boolean;
    biography: string;
    services: string[];
    schedule?: Schedule;
    order: number;
    local_id: string; // Added local_id to associate professional with a local
    defaultCommission?: Commission;
    comisionesPorServicio?: { [key: string]: Commission };
    comisionesPorProducto?: { [key: string]: Commission };
}

export interface Reservation {
    id: string;
    items: SaleItem[];
    cliente_id: string;
    servicio: string; // Concatenated services for simple display
    barbero_id: string;
    hora_inicio: string;
    hora_fin: string;
    fecha: string;
    estado: string;
    pago_estado?: string;
    customer?: Client; // Updated from string to Client object
    professionalNames?: string; // transient property
    type?: 'appointment' | 'block';
    start?: number; // transient
    duration?: number; // transient
    precio?: number;
    notas?: string;
    nota_interna?: string;
    creado_en: Timestamp; // Firestore Timestamp
    canal_reserva?: string;
    local_id?: string; // Added local_id to reservations
    notifications?: {
      whatsapp_notification: boolean;
      whatsapp_reminder: boolean;
    };
}

export interface TimeBlock {
    id: string;
    barbero_id: string;
    motivo: string;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    type?: 'block';
    customer?: { nombre: string }; // For unified rendering
    start?: number; // transient
    duration?: number; // transient
    color?: string; // transient
    local_id?: string;
}

export interface Schedule {
    lunes: ScheduleDay;
    martes: ScheduleDay;
    miercoles: ScheduleDay;
    jueves: ScheduleDay;
    viernes: ScheduleDay;
    sabado: ScheduleDay;
    domingo: ScheduleDay;
    [key: string]: ScheduleDay;
}

export interface ScheduleDay {
    enabled: boolean;
    start: string;
    end: string;
}

export interface Commission {
    value: number;
    type: '%' | '$';
}

export interface Product {
    id: string;
    nombre: string;
    barcode?: string;
    brand_id: string;
    category_id: string;
    presentation_id: string;
    public_price: number;
    stock: number;
    purchase_cost?: number;
    internal_price?: number;
    commission?: Commission;
    comisionesPorProfesional?: { [key: string]: Commission };
    includes_vat?: boolean;
    description?: string;
    stock_alarm_threshold?: number;
    notification_email?: string;
    created_at?: Timestamp;
    updated_at?: Timestamp;
    active: boolean;
    order: number;
    images?: string[];
}

export interface ProductCategory {
    id: string;
    name: string;
    order: number;
}

export interface ServiceCategory extends ProductCategory {}


export interface ProductBrand {
    id: string;
    name: string;
    order: number;
}

export interface ProductPresentation {
    id: string;
    name: string;
    order: number;
}

export interface Service {
    id: string;
    name: string;
    duration: number;
    price: number;
    category: string;
    active: boolean;
    order: number;
    defaultCommission?: Commission;
    comisionesPorProfesional?: { [profesionalId: string]: Commission };
}

export interface CartItem {
    id: string;
    nombre: string;
    precio: number;
    cantidad: number;
    tipo: 'producto' | 'servicio';
}

export interface Sale {
  id: string;
  cliente_id: string;
  client?: Client; // Transient property
  fecha_hora_venta: any;
  items: SaleItem[];
  local_id: string;
  metodo_pago: string;
  subtotal: number;
  descuento: {
    valor: number;
    tipo: 'fixed' | 'percentage';
  };
  total: number;
  creado_por_id?: string;
  creado_por_nombre?: string;
  reservationId?: string;
  detalle_pago_combinado?: {
    efectivo: number;
    tarjeta: number;
  };
  professionalNames?: string; // transient
}

export interface SaleItem {
  barbero_id: string;
  cantidad: number;
  id: string;
  nombre: string;
  precio: number;
  precio_unitario?: number;
  subtotal: number;
  tipo: 'servicio' | 'producto';
  servicio?: string;
  descuento?: {
    valor: number;
    tipo: 'fixed' | 'percentage';
    monto: number;
  };
  commissionPaid?: boolean;
}

export interface Egreso {
  id: string;
  fecha: Timestamp; // Firestore Timestamp
  monto: number;
  concepto: string;
  aQuien: string; // professional ID
  aQuienNombre?: string; // transient
  aQuienId?: string;
  comentarios?: string;
  local_id?: string;
}

export interface IngresoManual {
  id: string;
  fecha: Timestamp; // Firestore Timestamp
  monto: number;
  concepto: string;
  comentarios?: string;
  local_id: string;
}

export interface StockMovement {
    id: string;
    date: any;
    local_id: string;
    product_id: string;
    presentation_id: string;
    from: number;
    to: number;
    cause: string;
    staff_id: string;
    comment: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  celular?: string;
  permissions?: string[];
  local_id?: string;
  avatarUrl?: string;
}

export interface Role {
  id: string;
  title: string;
  description: string;
  permissions: string[];
}

export interface AuthCode {
  id: string;
  name: string;
  active: boolean;
  code: string;
  reserves: boolean;
  cashbox: boolean;
  download: boolean;
}

export interface CashClosing {
    id: string;
    fecha_corte: Timestamp;
    persona_entrega_id: string;
    persona_entrega_nombre: string;
    persona_recibe: string;
    fondo_base: number;
    monto_entregado: number;
    total_calculado: number;
    total_sistema: number;
    diferencia: number;
    comentarios?: string;
    detalle_conteo: Record<string, number>;
}

export interface Template {
  id: string;
  name: string;
  body: string;
  contentSid: string;
}

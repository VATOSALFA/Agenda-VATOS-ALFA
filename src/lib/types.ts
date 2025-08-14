

import { Timestamp } from "firebase/firestore";

export interface Client {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  fecha_nacimiento?: string | { seconds: number; nanoseconds: number; };
  notas?: string;
  creado_en: any; // Firestore Timestamp
  citas_totales?: number;
  citas_asistidas?: number;
  citas_no_asistidas?: number;
  citas_canceladas?: number;
  gasto_total?: number;
  numero_cliente?: string;
}

export interface Local {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  schedule: Schedule;
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
    defaultCommission?: { value: number; type: '%' | '$' };
    comisionesPorServicio?: { [key: string]: { value: number, type: '%' | '$' } };
    comisionesPorProducto?: { [key: string]: { value: number, type: '%' | '$' } };
}

export interface Reservation {
    id: string;
    items: { servicio: string; barbero_id: string; nombre?: string; }[];
    cliente_id: string;
    servicio: string; // Concatenated services for simple display
    hora_inicio: string;
    hora_fin: string;
    fecha: string;
    estado: string;
    pago_estado?: string;
    customer?: Client; // Updated from string to Client object
    professionalName?: string; // transient property
    type?: 'appointment' | 'block';
    start?: number; // transient
    duration?: number; // transient
    precio?: number;
    notas?: string;
    nota_interna?: string;
    creado_en: Timestamp; // Firestore Timestamp
    canal_reserva?: string;
    local_id?: string; // Added local_id to reservations
}

export interface Schedule {
    lunes: ScheduleDay;
    martes: ScheduleDay;
    miercoles: ScheduleDay;
    jueves: ScheduleDay;
    viernes: ScheduleDay;
    sabado: ScheduleDay;
    domingo: ScheduleDay;
}

export interface ScheduleDay {
    enabled: boolean;
    start: string;
    end: string;
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
    commission?: {
        value: number;
        type: '%' | '$';
    }
    comisionesPorProfesional?: { [key: string]: { value: number, type: '%' | '$' } };
    includes_vat?: boolean;
    description?: string;
    stock_alarm_threshold?: number;
    notification_email?: string;
    created_at?: any;
    active: boolean;
    order: number;
    images?: string[];
}

export interface ProductCategory {
    id: string;
    name: string;
    order: number;
}

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
    defaultCommission?: {
        value: number;
        type: '%' | '$';
    };
    comisionesPorProfesional?: { [profesionalId: string]: { value: number, type: '%' | '$' } };
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
  fecha_hora_venta: any;
  items: SaleItem[];
  local_id: string;
  metodo_pago: string;
  total: number;
  creado_por_id?: string;
  creado_por_nombre?: string;
}

export interface SaleItem {
  barbero_id: string;
  cantidad: number;
  id: string;
  nombre: string;
  precio: number;
  subtotal: number;
  tipo: 'servicio' | 'producto';
  servicio?: string;
}

export interface Egreso {
  id: string;
  fecha: any; // Firestore Timestamp
  monto: number;
  concepto: string;
  aQuien: string; // professional ID
  aQuienNombre?: string; // transient
  comentarios?: string;
  local_id?: string;
}

export interface StockMovement {
    id: string;
    date: any; // Firestore Timestamp
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
  password?: string;
  permissions?: string[];
  local_id?: string;
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

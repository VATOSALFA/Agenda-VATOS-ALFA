

export interface Client {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  fecha_nacimiento?: string | { seconds: number; nanoseconds: number; };
  notas?: string;
  creado_en: any; // Firestore Timestamp
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
}

export interface Reservation {
    id: string;
    barbero_id: string;
    cliente_id: string;
    servicio: string;
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
    }
}

export interface CartItem {
    id: string;
    nombre: string;
    precio: number;
    cantidad: number;
    tipo: 'producto' | 'servicio';
}

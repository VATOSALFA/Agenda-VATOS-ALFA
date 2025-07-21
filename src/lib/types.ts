

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

export interface Barber {
  id: string;
  nombre_completo: string;
  estado: 'disponible' | 'ocupado' | 'bloqueado';
  horario_trabajo?: { [key: string]: { inicio: string, fin: string } };
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
    nombre: string;
    precio: number;
    duracion: number; // en horas
}

export interface CartItem {
    id: string;
    nombre: string;
    precio: number;
    cantidad: number;
    tipo: 'producto' | 'servicio';
}

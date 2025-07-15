
export interface Client {
  id: string;
  nombre: string;
  apellido: string;
  correo: string;
  telefono: string;
  fecha_nacimiento?: string;
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
    precio: number;
    stock: number;
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

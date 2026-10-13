export interface LookbookStyle {
  id: string;
  titulo: string;
  subtitulo: string;
  descripcion: string;
  tiempo: string;
  nivelFijacion: string;
  imagenUrl: string;
  servicioNombre: string;
  serviceMatchId?: string;
  herramientas: string[];
}

export const LOOKBOOK_STYLES: LookbookStyle[] = [
  {
    id: 'style_fade_clasico',
    titulo: 'Low Fade & Barba Perfilada',
    subtitulo: 'El favorito de los caballeros',
    descripcion: 'Desvanecido bajo y limpio con transición impecable hacia la piel. Contornos trazados con navaja libre y barba perfilada con simetría milimétrica.',
    tiempo: '40 min',
    nivelFijacion: 'Mate Natural',
    imagenUrl: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80',
    servicioNombre: 'Corte de cabello',
    serviceMatchId: 'corte-cabello',
    herramientas: ['Navaja libre', 'Clippers profesionales', 'Bálsamo refrescante'],
  },
  {
    id: 'style_pompadour',
    titulo: 'Pompadour Ejecutivo',
    subtitulo: 'Elegancia clásica contemporánea',
    descripcion: 'Volumen superior estructurado con caída natural hacia atrás. Laterales rebajados a tijera y acabado impecable para oficina o eventos de gala.',
    tiempo: '45 min',
    nivelFijacion: 'Firmeza Media / Brillo Suave',
    imagenUrl: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
    servicioNombre: 'Corte de cabello',
    serviceMatchId: 'corte-cabello',
    herramientas: ['Tijera japonesa', 'Secadora iónica', 'Pomada base agua'],
  },
  {
    id: 'style_crop_texturizado',
    titulo: 'Texturizado Urbano (Crop)',
    subtitulo: 'Moderno, fresco y juvenil',
    descripcion: 'Capas superiores con textura desordenada controlada y flequillo recto o despuntado. Mid fade en laterales para máximo contraste y frescura.',
    tiempo: '35 min',
    nivelFijacion: 'Mate Alto',
    imagenUrl: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80',
    servicioNombre: 'Corte de cabello',
    serviceMatchId: 'corte-cabello',
    herramientas: ['Navajín de entresacar', 'Polvo volumizador', 'Trimmer de detalle'],
  },
  {
    id: 'style_grecas_freestyle',
    titulo: 'Líneas & Grecas Freestyle',
    subtitulo: 'Identidad y arte urbano',
    descripcion: 'Diseño geométrico a mano alzada tallado sobre degradado oscuro. Líneas nítidas de alta precisión que destacan en cualquier ángulo.',
    tiempo: '25 min',
    nivelFijacion: 'Natural',
    imagenUrl: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&w=800&q=80',
    servicioNombre: 'Grecas',
    serviceMatchId: 'grecas',
    herramientas: ['Trimmer de grabado', 'Navaja de precisión', 'Lápiz de trazado'],
  },
  {
    id: 'style_ritual_completo',
    titulo: 'Ritual Barba & Toalla Caliente',
    subtitulo: 'Experiencia sensorial clásica',
    descripcion: 'Afeitado tradicional con toalla caliente vaporizada con aceites esenciales de eucalipto, apertura de poros, espuma tibia y navaja clásica.',
    tiempo: '35 min',
    nivelFijacion: 'Hidratación Profunda',
    imagenUrl: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=800&q=80',
    servicioNombre: 'Arreglo de barba expres',
    serviceMatchId: 'arreglo-barba-expres',
    herramientas: ['Toalla vaporizada', 'Brocha de tejón', 'Loción after-shave'],
  },
];

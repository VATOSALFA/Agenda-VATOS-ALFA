---
name: vatos-alfa-design-system
description: Directrices oficiales de UI/UX y Sistema de Diseño de VATOS ALFA. Define reglas estrictas para el estilizado de iconos (sin contenedores ni píldoras de fondo), la paleta de colores institucional (#202A49, #C5A880, grises neutros; CERO verde y morado) y la arquitectura visual compacta para móviles.
---

# Sistema de Diseño VATOS ALFA (Directrices de UI/UX)

Este documento define los estándares visuales y de interacción obligatorios para cualquier interfaz, componente o vista desarrollada en la plataforma web y móvil de **VATOS ALFA Barbería**.

---

## 1. Regla Fundamental de Iconos (Sin Contenedores)

> [!IMPORTANT]
> **LOS ICONOS NUNCA DEBEN TENER CONTENEDORES NI FONDOS DE COLOR.**
> Está estrictamente prohibido envolver los iconos en círculos, cuadrados o píldoras con fondos semitransparentes como `bg-primary/10`, `bg-muted`, `bg-emerald-500/15`, `bg-purple-500/15`, `rounded-full p-2`, etc.

### ❌ Lo que NO se debe hacer:
```tsx
// INCORRECTO: Icono envuelto en contenedor o píldora con fondo
<div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
    <Users className="w-5 h-5" />
</div>

<div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
    <Smartphone className="w-4 h-4" />
</div>
```

### ✅ Lo que SIEMPRE se debe hacer (Icono Limpio / Bare Icon):
```tsx
// CORRECTO: Icono directo, limpio y minimalista
<Users className="h-4 w-4 text-muted-foreground/70" />

<Smartphone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />

// Cuando representa un elemento VIP, Pase Alfa o AlfaCoins:
<Sparkles className="h-3.5 w-3.5 text-[#C5A880]" />
```

### 1.1. Botones de Acción e Iconos de Barra / Cabecera:
Los botones de acción rápida en cabeceras y barras de herramientas (como QR, Nuevo, Web, Ajustes, Notificaciones, etc.) deben mantener una escala sutil y estilizada idéntica a la barra de agenda:
- Tamaño de icono: `h-4 w-4` (16px) con trazo fino.
- Botón contenedor: `h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors` (en barra oscura/navy) o `text-muted-foreground hover:text-foreground hover:bg-muted/50` (en superficies claras).
- NUNCA usar iconos gigantescos (`h-5 w-5` o `h-6 w-6`) ni botones toscos en cabeceras o barras de utilidades.

---

## 2. Paleta de Colores Institucional

La identidad de VATOS ALFA es sobria, elegante, masculina y prémium.

### Colores Permitidos:
1. **Azul Profundo Navy Vatos Alfa:**
   - Hex: `#202A49` (Secundario/Hover: `#182038`, Oscuro: `#10172b`).
   - Uso: Botones principales de acción, cabeceras oficiales, acentos de marca.
2. **Azul Eléctrico / Cyan de Acento Móvil:**
   - Clase: `border-blue-500` / `ring-blue-500`
   - Uso: Bordes y contornos destacados en submenús flotantes, popovers y modales estilo App Móvil.
3. **Dorado Mate Alfa (Pase Alfa / VIP):**
   - Hex: `#C5A880` (Acentos/Bordes: `#C5A880/30`, Fondo sutil: `#C5A880/10`).
   - Uso: Exclusivo para Pase Alfa Club, Sellos de Lealtad, AlfaCoins, beneficios VIP y membresías.
4. **Escala de Grises y Neutros:**
   - Texto principal: `text-foreground`
   - Texto secundario / metadatos: `text-muted-foreground`, `text-slate-400`
   - Bordes: `border-border/60`, `border-border/40`
   - Fondos sutiles: `bg-muted/20`, `bg-muted/40`, `bg-card`

### 🚫 Colores Prohibidos:
- **CERO AMARILLO / ÁMBAR:** Prohibido rotundamente usar amarillo, ámbar (`bg-amber-*`, `text-amber-*`, `border-amber-*`, `yellow-*`, o fondos mostaza/amarillentos) en tarjetas, badges, diferencias de conteo o métricas.
- **CERO VERDES** (`bg-emerald-*`, `text-emerald-*`, `bg-green-*`, etc.) en métricas, tarjetas o indicadores generales.
- **CERO MORADOS / VIOLETAS** (`bg-purple-*`, `text-purple-*`, `text-violet-*`, etc.).
- **Manejo de Diferencias, Advertencias o Saldos:**
  - **Faltante / Saldo negativo:** Usar rojo institucional suave (`text-red-400`, `border-red-500/30`, `bg-red-500/5`).
  - **Sobrante / Saldo positivo:** Usar azul institucional (`text-blue-400`, `border-blue-500/30`, `bg-blue-500/5`).
  - **Exacto / Normal:** Usar escala neutra (`text-foreground`, `border-border/60`, `bg-card/60`).
  - **Dorado Mate (`#C5A880`):** Únicamente para Pase Alfa Club / VIP, jamás como color de advertencia o sustituto de amarillo.

---

## 3. Optimización Móvil y Densidad de Información

En dispositivos móviles (`< 640px`):
1. **Evitar tarjetas gigantescas:**
   - La altura de las tarjetas de métricas o KPIs no debe exceder los 60-70px en móvil.
   - El padding estándar en móvil es `p-2.5` a `p-3.5` (nunca `p-6` o `p-8`).
2. **Evitar scroll innecesario:**
   - Ocultar textos explicativos redundantes o párrafos secundarios en móvil usando `hidden sm:block`.
   - Mostrar solo la métrica esencial, su etiqueta y el icono limpio.
3. **Listas y Tablas Compactas:**
   - Filas de tablas con padding vertical contenido (`py-2 sm:py-3`).
   - Avatares pequeños (`h-7 w-7` a `h-8 w-8`).
   - Badges discretos (`py-0 h-4 text-[10px]`).

---

## 4. Estructura de Tarjetas KPI Recomendada

```tsx
<Card className="border border-border/60 bg-card/60 shadow-xs">
    <CardContent className="p-2.5 sm:p-3.5">
        <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">
                Total Registros
            </span>
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground/70 shrink-0" />
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                {metricValue}
            </span>
        </div>
        {/* Descripción visible solo en pantallas medianas/grandes */}
        <p className="text-[10px] text-muted-foreground/80 mt-0.5 hidden sm:block truncate">
            Sincronizados en tiempo real
        </p>
    </CardContent>
</Card>
```

---

---

## 5. Borde Azul Institucional en Submenús y Popovers

Para mantener coherencia absoluta con la interfaz de la **App Móvil de VATOS ALFA**, todos los submenús flotantes (`DropdownMenuContent`), tarjetas emergentes (`PopoverContent`) deben incluir el borde azul distintivo:

### Reglas de Estilizado:
1. **Borde Azul Vibrante:**
   - Clase: `border-2 border-blue-500`
   - Esquinas redondeadas suaves: `rounded-xl`
2. **Sombra con Resplandor Azul Sutil:**
   - Clase: `shadow-[0_10px_30px_rgba(59,130,246,0.18)]` o `shadow-xl`
3. **Espaciado y Fondo:**
   - Fondo: `bg-[#151b2e]` (en dark header) o `bg-popover`
   - Padding interno: `p-1.5` para menús de opciones compactas.
   - Efecto hover en ítems: `focus:bg-blue-500/20` o `hover:bg-blue-500/10`.

```tsx
// Ejemplo estándar para submenús desplegables:
<DropdownMenuContent 
  align="end" 
  className="w-56 bg-[#151b2e] border-2 border-blue-500 text-white rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-1.5"
>
  <DropdownMenuItem className="rounded-lg focus:bg-blue-500/20">
    <Calendar className="mr-2 h-4 w-4" />
    <span>Crear nueva reserva</span>
  </DropdownMenuItem>
</DropdownMenuContent>
```

---

## 6. Cabecera Oficial de Modales (Franja Azul con Difuminado y Haz de Luz en Diagonal)

Todos los modales de la aplicación (como **"Detalle de la Reserva"**, **"Bloquear Horario"**, **"Habilitar Horario"**, **"Registrar Anticipo"**, **"Cancelar Cita"**, etc.) deben llevar obligatoriamente la cabecera institucional en franja azul con haz de luz oblicuo animado.

### Reglas Estrictas de Cabecera:
1. **Contenedor Principal (`DialogContent`):**
   - Siempre debe llevar: `hideCloseButton={true}` (para evitar la X blanca flotante predeterminada).
   - Clases obligatorias: `p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background flex flex-col`.
2. **Franja Azul Institucional con Degradado:**
   - Clase de fondo: `bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden`.
3. **Efecto de Haz de Luz en Diagonal (`header-light-beam`):**
   - Debe incluir la capa `<div className="header-light-beam" aria-hidden="true" />` como primer hijo del encabezado. Esta capa genera el destello oblicuo que viaja periódicamente de izquierda a derecha.
4. **Icono Limpio (Sin Contenedor):**
   - Icono representativo (`h-5 w-5 text-slate-300 shrink-0`), **nunca encerrado en círculos o fondos de color**.
5. **Tipografía y Textos:**
   - Título: `<DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">`.
   - Subtítulo: `<DialogDescription className="text-xs text-slate-300 mt-0.5">` o metadatos en pastillas translúcidas (`bg-white/10 text-[11px]`).
6. **Botón de Cierre (X) Integrado:**
   - Botón discreto en el extremo derecho:
     ```tsx
     <button
       type="button"
       onClick={() => onOpenChange(false)}
       className="p-1 text-slate-300 hover:text-white transition-colors"
       aria-label="Cerrar modal"
     >
       <X className="h-5 w-5" />
     </button>
     ```

### Plantilla Estándar Reutilizable para Modales:
```tsx
<Dialog open={isOpen} onOpenChange={onOpenChange}>
  <DialogContent 
    hideCloseButton={true} 
    className="sm:max-w-lg p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800 bg-background flex flex-col"
  >
    {/* Cabecera Oficial VATOS ALFA */}
    <div className="bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d] text-white p-4 sm:p-5 border-b border-[#2d3a60]/60 flex items-center justify-between shrink-0 relative overflow-hidden">
      {/* Haz de luz oblicuo animado */}
      <div className="header-light-beam" aria-hidden="true" />

      <div className="relative z-10 flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <CalendarX2 className="h-5 w-5 text-slate-300 shrink-0" />
          <div>
            <DialogTitle className="text-base sm:text-lg font-bold text-white tracking-wide">
              Título del Modal
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-300 mt-0.5">
              Descripción clara o instrucciones del modal.
            </DialogDescription>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="p-1 text-slate-300 hover:text-white transition-colors"
          aria-label="Cerrar modal"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>

    {/* Cuerpo del Modal */}
    <div className="p-5 space-y-4">
      {/* Formularios, campos o contenido */}
    </div>
  </DialogContent>
</Dialog>
```

---

## 7. Botón Principal Institucional Vatos Alfa (Estilo App Móvil con Doble Efecto de Luz)

Para los botones de acción principal (como **"Guardar Reserva"**, **"Cobrar Total"**, **"Confirmar Asistencia"**, etc.), en lugar de un botón plano o estático, se debe usar el **botón prémium con doble animación de luz** copiado exactamente de `ShinyButton.tsx` de la App Móvil de VATOS ALFA.

### Arquitectura de Construcción (Idéntica a `ShinyButton.tsx` Móvil):
1. **Contenedor Exterior (0px Inset / Borde de Luz Exacto):**
   - El botón exterior lleva `padding: 1.5px`, `border: none`, `overflow: hidden`, `position: relative`.
   - El grosor de 1.5px del padding define el canal exacto por donde pasa la luz en el perímetro exterior. Al usar padding y `overflow: hidden`, **la luz toca directamente el borde exterior absoluto (0px inset)** sin dejar ningún espacio oscuro ni remetido.
2. **Haz de Luz Angular Giratorio (Conic Laser Spin):**
   - Centrado en el botón (`top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none animate-conic-laser`).
   - Gira 360° continuos cada 3.4s (`@keyframes conicLaserSpin`).
   - Gradiente cónico con los colores oficiales de la app móvil (`#2563EB`, `#3B82F6`, `#60A5FA`, `#FFFFFF`, `#BAE6FD`).
3. **Cuerpo Interior Concéntrico:**
   - Ubicado sobre el haz de luz con `relative z-[1] w-full h-full`.
   - Radio concéntrico exacto: si el botón exterior es `rounded-xl` (12px), el cuerpo interior tiene `rounded-[10.5px]` (12px - 1.5px) para asegurar curvatura paralela perfecta sin desalineaciones.
   - Fondo parejo degradado navy: `bg-gradient-to-b from-[#18223c] to-[#0d1424]`.
   - **Prohibido** pintar franjas blancas o claras fijas en el fondo. El fondo debe ser uniforme para que únicamente la animación dinámica sea visible.
4. **Haz de Luz Interno Dinámico (Light Sweep):**
   - Un destello inclinado a -20° que viaja periódicamente de izquierda a derecha sobre el cuerpo interior cada 3.5s (`animate-btn-light-sweep`).
5. **Contenido en Primer Plano:**
   - Texto blanco nítido (`text-white font-bold` o `font-semibold`), centrado con `relative z-10`.

### Uso en Código:
El componente base `<Button>` (`src/components/ui/button.tsx`) inyecta automáticamente ambas capas animadas cuando se usa `variant="alfa"` o la clase `btn-vatos-alfa`:

```tsx
// Opción A: Mediante la variante oficial del componente Button (Recomendado)
<Button 
  variant="alfa" 
  size="sm" 
  className="rounded-xl px-5 text-xs font-semibold"
>
  Guardar Reserva
</Button>

// Opción B: Mediante la clase de utilidad global
<Button 
  type="submit" 
  className="btn-vatos-alfa rounded-xl h-10 px-6 text-xs"
>
  Cobrar Total
</Button>
```

---

## 8. Estándar de Tablas Compactas de Alta Densidad ("Pegaditas")

Para evitar tablas con alturas excesivas y espacios vacíos innecesarios (que ocurren con el `p-4` por defecto de las tablas de shadcn), todas las tablas de administración (Clientes, Caja, Ventas, Reportes, etc.) deben mantener una estructura densa y compacta idéntica a la vista de Base de Clientes.

### Reglas de Estructura:
1. **Encabezado (`<TableHeader>`):**
   - Altura contenida: `<TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">`.
   - Celdas de encabezado: `<TableHead className="py-1 px-3 text-xs font-semibold text-foreground/70">`.
2. **Filas de Datos (`<TableBody>`):**
   - Altura de fila estricta: `<TableRow className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">`.
   - Si la fila es seleccionable: `className={cn("h-9 cursor-pointer hover:bg-muted/30 transition-colors border-b border-border/40", selectedItem?.id === item.id && "bg-muted/40")}`.
3. **Celdas de Datos (`<TableCell>`):**
   - Padding obligatorio: `py-1.5 px-3 text-xs`.
   - **Prohibido:** Dejar el padding por defecto `p-4` o usar `py-4`, `py-3` en tablas de datos.
4. **Botones de Acciones en Filas:**
   - Usar bare icons sin contenedor: `<button className="text-slate-400 hover:text-white transition-colors p-1" title="Acciones">`.
   - Para submenús de acciones, solo el icono de flecha hacia abajo (`<ChevronDown className="h-4 w-4" />`), sin texto "Acciones" ni contenedor visible.

### Plantilla Estándar para Tablas:
```tsx
<div className="hidden sm:block overflow-x-auto">
  <Table>
    <TableHeader>
      <TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">
        <TableHead className="py-1 px-3 text-xs font-semibold">Folio</TableHead>
        <TableHead className="py-1 px-3 text-xs font-semibold">Fecha</TableHead>
        <TableHead className="py-1 px-3 text-xs font-semibold">Cliente</TableHead>
        <TableHead className="py-1 px-3 text-xs font-semibold text-right">Total</TableHead>
        <TableHead className="py-1 px-3 text-xs text-right">Opciones</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map((item) => (
        <TableRow key={item.id} className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">
          <TableCell className="py-1.5 px-3 text-xs font-mono">{item.id.slice(0, 8)}</TableCell>
          <TableCell className="py-1.5 px-3 text-xs">{item.fecha}</TableCell>
          <TableCell className="py-1.5 px-3 text-xs font-medium">{item.cliente}</TableCell>
          <TableCell className="py-1.5 px-3 text-xs text-right font-medium">${item.total.toFixed(2)}</TableCell>
          <TableCell className="py-1.5 px-3 text-xs text-right">
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => handleView(item)}
                className="text-slate-400 hover:text-white transition-colors p-1"
                title="Ver detalle"
              >
                <Eye className="h-4 w-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-white transition-colors p-1"
                    title="Acciones"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] bg-[#151b2e] text-white p-1.5">
                  <DropdownMenuItem onClick={() => handleEdit(item)}>Editar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDelete(item)} className="text-destructive">Eliminar</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
```

---

## 9. Estándar de Tipografía, Precios y Formato de Números (Moneda MXN)

Para mantener una interfaz armónica, profesional y consistente en toda la agenda, los números correspondientes a precios, tarifas y dinero deben seguir un formato tipográfico y numérico estricto.

### 9.1. Regla de Tipografía (PROHIBIDO `font-mono` en Precios y Etiquetas)
- **Tipografía Sans-Serif Estándar:** Todos los precios, subtotales, totales y contadores deben utilizar la tipografía sans-serif predeterminada del sistema.
- **Prohibición de Monospace (`font-mono`):** Está **estrictamente prohibido** utilizar `font-mono` para precios (`$60.00`) o contadores en badges (`2 de 5 seleccionados`). 
- **Única Excepción para `font-mono`:** Se reserva exclusivamente para datos técnicos de base de datos como UUIDs, folios cortos o hashes criptográficos (`item.id.slice(0, 8)`).

### 9.2. Formato Obligatorio de 2 Decimales (`formatMoney`)
- Todo precio o importe monetario debe incluir **siempre 2 decimales**, formateados con la función de utilidad `formatMoney(value)` de `@/lib/utils` o con `.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
- **Ejemplo correcto:** `$60.00`, `$150.00`, `$1,250.00`.
- **Ejemplo incorrecto:** `$60`, `$150` (sin decimales ni formato regional).

### 9.3. Escala y Peso Visual de Precios
1. **En Listas, Tarjetas de Servicios y Selectores de Modales:**
   - Clase: `text-xs font-semibold shrink-0 text-foreground` o `text-xs font-medium shrink-0 text-foreground/80`.
   - NUNCA usar tamaños arbitrarios o desproporcionados como `text-[11px]`.
2. **En Tablas Compactas:**
   - Clase: `<TableCell className="py-1.5 px-3 text-xs font-medium text-foreground">${formatMoney(item.precio)}</TableCell>`.
3. **En Subtotales y Totales de Cita / Venta:**
   - Clase: `text-sm font-bold text-foreground` o `text-base font-bold text-foreground`.
4. **En Insignias / Badges de Conteo o Estado:**
   - Clase: `text-[10px]` o `text-[11px] font-medium` (NUNCA `font-mono`).

### ❌ Lo que NO se debe hacer:
```tsx
// INCORRECTO: Tipografía monospace, sin decimales, tamaño arbitrario y gris descolorido
{service.price !== undefined && (
    <span className="font-mono text-[11px] text-muted-foreground shrink-0">
        ${Number(service.price).toLocaleString('es-MX')}
    </span>
)}
```

### ✅ Lo que SIEMPRE se debe hacer:
```tsx
// CORRECTO: Tipografía sans-serif nativa, 2 decimales con formatMoney, tamaño text-xs y contraste nítido
import { formatMoney } from '@/lib/utils';

{service.price !== undefined && (
    <span className={cn("text-xs font-semibold shrink-0", isChecked ? "text-foreground" : "text-foreground/80")}>
        ${formatMoney(Number(service.price))}
    </span>
)}
```

---

## 10. Estándar de Configuradores de Horario Semanal (Alta Densidad y Sin Scroll)

Para evitar scroll excesivo en modales de profesionales o sucursales, los 7 días de la semana deben configurarse en una lista unificada compacta.

### Reglas de Diseño:
1. **Contenedor Único Dividido:** Usar un único contenedor con bordes y divisores internos (`rounded-xl border border-border/60 bg-card/60 divide-y divide-border/40 overflow-hidden shadow-xs`), en lugar de 7 tarjetas individuales separadas con márgenes redundantes.
2. **Fila Horizontal en Escritorio:**
   - **Izquierda:** Switch (`scale-90`) + Nombre del día + Badge de estado (`Laboral` / `Descanso`).
   - **Centro:** Selectores de hora en línea (`De [10:00 ▾] a [21:00 ▾]`), con triggers compactos (`h-7 w-[82px] text-xs font-medium`).
   - **Derecha:** Botones de acción limpia con bare icons (`+ Descanso`, `Copiar a todos`).
3. **Comportamiento en Móvil (`< 640px`):**
   - Fila 1: Switch, Nombre del día, Badge y botones de acción.
   - Fila 2: Selectores de horario en línea `De [10:00 ▾] a [21:00 ▾]`.
4. **Descansos Intermedios (`breaks`):** Se anidan como subfilas compactas directamente debajo del día correspondiente (`p-1.5 px-2.5 rounded-lg bg-muted/20 border border-border/30 text-xs`).

---

## 11. Estándar Oficial de Barras de Scroll (Scrollbars en Azul Vatos Alfa)

Todas las áreas y secciones con desplazamiento en la interfaz (`overflow-y-auto`, `overflow-auto`, desplegables de selección, modales, grids de la agenda y `ScrollArea`) deben utilizar obligatoriamente la barra de scroll estilizada en **Azul Acento Móvil (`#3B82F6`)**.

### ❌ Prohibido:
- Barras de scroll nativas del sistema operativo (anchas, grises o con botones triangulares de flechas arriba/abajo).
- Pistas de scroll (tracks) grises pesadas que reduzcan el espacio visual.

### ✅ Especificación Visual Oficial:
- **Ancho ultra delgado y sutil:** 5px a 6px con terminaciones redondeadas (`rounded-full` / `9999px`).
- **Pista / track transparente:** `background: transparent`.
- **Barra (thumb) en reposo:** Azul institucional translúcido (`rgba(59, 130, 246, 0.45)`).
- **Barra (thumb) en hover / interacción activa:** Azul Acento Móvil vibrante (`#3B82F6` / `#2563EB`).
- **Botones de flecha eliminados:** `::-webkit-scrollbar-button { display: none !important; }`.
- **Soporte estándar W3C/Firefox:** `scrollbar-width: thin; scrollbar-color: rgba(59, 130, 246, 0.45) transparent;`.

---

## 12. Estándar Oficial de Vistas de Configuración, Tarjetas de Beneficios y Portadas 16:9 (Minimalismo y Densidad)

Para garantizar consistencia, orden visual y cero redundancias en los módulos administrativos y de configuración (ej. App Móvil, Pase Alfa, Beneficios, Niveles, etc.), se deben seguir estrictamente estas pautas:

### 12.1. Encabezado de Página Dinámico y Minimalista
- La cabecera superior debe mostrar únicamente el título limpio del módulo o beneficio activo (ej. `Pase Alfa`, `Regalo de cumpleaños`, `Alfa Coins`, `Niveles`, `Galería`, `Promociones`, `Buzón`, `Uso y Tiendas`).
- **PROHIBIDO** incluir rutas de migas de pan como `App Móvil VATOS ALFA /` o párrafos explicativos extensos debajo del título.
- Al editar un beneficio o elemento individual, el título superior de la página debe actualizarse dinámicamente con el nombre del beneficio (ej. `Regalo de cumpleaños` o `Alfa Coins`), evitando duplicar títulos dentro de la tarjeta.

### 12.2. Botón Único de Retorno ("Regresar a la lista")
- Debe ubicarse en el extremo superior derecho del encabezado de la página:
  ```tsx
  <div className="flex items-center justify-between gap-3 pb-3 border-b border-border/60">
      <h2 className="text-xl font-bold tracking-tight text-foreground">{displayTitle}</h2>
      {isEditing && (
          <button
              type="button"
              onClick={handleBack}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-foreground transition-colors cursor-pointer select-none"
          >
              <ChevronLeft className="w-4 h-4 text-slate-400" />
              <span>Regresar a la lista</span>
          </button>
      )}
  </div>
  ```
- **PROHIBIDO** encerrar este botón en contenedores o marcos (`variant="outline"`, bordes grises o fondos pesados). Debe ser un enlace limpio con bare icon + texto.
- **PROHIBIDO** duplicar botones de cancelar o regresar dentro del formulario o en el pie de página.

### 12.3. Estructura de la Tarjeta de Edición (Cero Textos Redundantes)
- La tarjeta no debe incluir títulos repetitivos como `Editar: [Nombre]`.
- La primera fila de la tarjeta debe contener **únicamente el switch de visibilidad (`Visible / Pausado`) alineado al extremo derecho**, sin ningún texto en el lado izquierdo:
  ```tsx
  <div className="flex items-center justify-end pb-2.5 border-b border-border/50">
      <div className="flex items-center gap-2">
          <Label htmlFor="item-active" className="text-xs font-medium cursor-pointer text-muted-foreground">
              {activo ? 'Visible' : 'Pausado'}
          </Label>
          <Switch id="item-active" checked={activo} onCheckedChange={setActivo} className="scale-90" />
      </div>
  </div>
  ```

### 12.4. Estándar de Fotografía / Portada (Relación 16:9 y Botón de Ojo)
- Todas las portadas e imágenes de beneficios deben presentarse en formato panorámico estándar **16:9** (`1280 × 720 px`, `aspect-video`).
- Queda prohibido forzar contenedores cuadrados (1:1) cuando la imagen recomendada sea 16:9.
- El componente `ImageUploader` debe configurarse obligatoriamente con:
  - `aspectRatio="16/9"`
  - `showPreview={true}` (muestra un botón flotante con el icono de ojo sobre la imagen para abrir la previsualización a pantalla completa en su modal oficial con borde azul de 2px).
  - `showRemove={true}`
  - `objectFit="cover"`
  - Estilo: `w-full aspect-video border-2 border-dashed rounded-xl bg-slate-950/90 hover:bg-slate-950 transition-all cursor-pointer shadow-2xs`

### 12.5. Botón de Guardado Oficial
- Variante `.btn-vatos-alfa` o `variant="alfa"`.
- Etiqueta ultra limpia: solo el icono de disquete y la palabra `Guardar`:
  ```tsx
  <Button variant="alfa" onClick={handleSave} className="font-semibold text-xs px-5 h-8.5 cursor-pointer">
      <Save className="w-3.5 h-3.5 mr-1.5" />
      Guardar
  </Button>
  ```
- **PROHIBIDO** textos largos o redundantes como "Guardar Configuración del Pase Alfa" o "Guardar Cambios del Beneficio".

---

## 13. Estándar Oficial de Campos de Texto Extensos / Plantillas (Edición en Modal Maximizado)

Para evitar campos de texto gigantescos (`<Textarea>`) que saturen visualmente la interfaz, generen scroll vertical excesivo y provoquen fatiga visual al usuario, **todos los textos largos, políticas, avisos de privacidad, descripciones de más de 200 caracteres, prompts maestros y plantillas de mensajes deben representarse en una fila compacta con un botón para abrir un modal de redacción**.

### 13.1. Fila Compacta en la Vista Principal
En la tarjeta o sección, el campo se muestra únicamente como una fila limpia con hover sutil:
```tsx
<div className="p-3 sm:px-4 sm:py-2.5 rounded-xl border border-border/70 bg-muted/15 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
  <div className="flex items-center gap-2 min-w-0">
    <span className="text-xs font-semibold text-foreground">
      {tituloDelCampo}
    </span>
    {valor && (
      <span className="text-[10px] text-muted-foreground font-sans hidden sm:inline">
        ({valor.length} caracteres)
      </span>
    )}
  </div>
  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={() => openEditorModal(titulo, descripcion, campo, supportsTags)}
    className="h-7.5 px-3 text-xs font-semibold rounded-lg shrink-0 border-border/80 hover:bg-[#202A49] hover:text-white transition-colors cursor-pointer"
  >
    Editar
  </Button>
</div>
```

### 13.2. Modal Oficial de Lectura y Redacción
Al presionar **Editar**, se abre un modal maximizado oficial (`Dialog` de tamaño `max-w-3xl w-[95vw]`):
1. **Contenedor:** `border-2 border-blue-500 rounded-2xl shadow-[0_10px_30px_rgba(59,130,246,0.18)] p-0 overflow-hidden`.
2. **Cabecera Institucional:** Franja con degradado `#10172b` via `#1c2847` to `#12192d`, haz de luz `.header-light-beam`, icono bare `FileText`, título nítido en blanco, descripción suave en `text-slate-300`, badges con conteo dinámico de palabras y caracteres, y botón de cierre `X`.
3. **Etiquetas Dinámicas (si aplica):** Si el campo admite variables (ej. `{nombre}`, `{fecha}`, `{hora}`, `{profesional}`), se incluye una barra superior de badges clicables para insertarlas o copiarlas directamente al texto con un solo clic.
4. **Área de Redacción:** `<Textarea className="flex-1 min-h-[260px] sm:min-h-[360px] text-xs sm:text-sm font-sans leading-relaxed resize-none p-3.5 rounded-xl border-border/80 focus:border-blue-500">`.
5. **Pie de Modal:** Botón `Cancelar` y botón `Aplicar y Guardar Ahora` con `variant="alfa"`.

# Reglas y Estándares de Desarrollo de VATOS ALFA

Este repositorio cuenta con directrices de diseño y arquitectura de software que deben respetarse rigurosamente en cada modificación o nuevo componente.

---

## 1. Reglas Estrictas de Iconos y UI
1. **Los iconos NUNCA deben tener contenedores:**
   - Prohibido encerrar iconos en píldoras, círculos o cajas con fondos de color (`bg-primary/10`, `rounded-full p-2`, `bg-emerald-500/10`, etc.).
   - Los iconos siempre deben ser limpios ("bare icons"), con color neutro (`text-muted-foreground`, `text-slate-400`) o dorado mate (`#C5A880`) cuando se trate de Pase Alfa/VIP.
   - En cabeceras y barras de acción rápida, los iconos deben medir `h-4 w-4` (16px) dentro de botones discretos de `h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10`.
2. **Paleta de Colores Institucional:**
   - **Azul Navy:** `#202A49` (botones de acción principal, encabezados oficiales).
   - **Azul Acento App Móvil:** `border-2 border-blue-500` para contornos y márgenes de submenús flotantes y modales.
   - **Dorado Mate:** `#C5A880` (exclusivo para Pase Alfa Club, sellos de lealtad, AlfaCoins, insignias VIP).
   - **Grises Neutros:** `text-muted-foreground`, `border-border/60`, `bg-muted/20`.
   - **Colores Prohibidos:** Está estrictamente prohibido usar **amarillo o ámbar** (`amber`, `yellow`, mostaza o cualquier tono amarillento), **verde** (`emerald`, `green`), **morado** (`purple`, `violet`, `indigo`) o tonos chillones en la interfaz. Para advertencias, faltantes o saldos negativos, usar grises neutros (`border-border/60`, `text-muted-foreground`), azul institucional (`text-blue-400`), o rojo suave (`text-red-400`, `border-red-500/30`) si es estrictamente un error o faltante. NUNCA usar amarillo ni ámbar.
3. **Márgenes y Bordes de Submenús y Modales (Estilo App Móvil):**
   - Todos los submenús desplegables (`DropdownMenuContent`) y modales deben llevar borde azul de 2px: `border-2 border-blue-500 rounded-xl shadow-[0_10px_30px_rgba(59,130,246,0.18)]`.
4. **Botón Principal Institucional Vatos Alfa (Estilo App Móvil con Doble Efecto de Luz):**
   - Todos los botones principales de acción (Guardar Reserva, Cobrar Total, Confirmar Asistencia, Iniciar Sesión, etc.) deben llevar la clase `.btn-vatos-alfa` o `variant="alfa"`.
   - **Estructura idéntica a la App Móvil (`ShinyButton.tsx`):** Un contenedor exterior con `padding: 1.5px; overflow: hidden;` por donde viaja la luz láser giratoria en el contorno exterior exacto (0px de remetido hacia adentro).
   - **Fondo uniforme:** Prohibido pintar franjas blancas o claras fijas en el fondo; el degradado debe ser parejo (`linear-gradient(180deg, #18223c 0%, #0d1424 100%)`) para que solo la animación oblicua sea visible.
   - **Doble efecto de luz:** Debe incorporar el rayo láser perimetral exterior continuo y el haz de luz oblicuo que viaja periódicamente de izquierda a derecha.
5. **Cabecera Oficial de Modales (Franja Azul con Haz de Luz Diagonal):**
   - Todos los modales deben tener su cabecera en una franja azul institucional con degradado (`bg-gradient-to-r from-[#10172b] via-[#1c2847] to-[#12192d]`) acompañada del haz de luz oblicuo animado (`.header-light-beam`).
   - Icono limpio sin contenedor (`text-slate-300`), título en blanco nítido, descripción en gris suave (`text-slate-300`) y botón de cierre `X` en el extremo derecho del encabezado.
   - El `DialogContent` debe llevar `hideCloseButton={true}` y `p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-800`. Prohibido dejar modales con cabecera blanca plana o sin estilo.
6. **Estándar de Tablas Compactas ("Pegaditas" / Alta Densidad):**
   - Todas las tablas del sistema deben ser densas, compactas y profesionales, eliminando el exceso de espacio en blanco vertical:
     - **Cabecera:** `<TableRow className="h-8 bg-muted/30 hover:bg-muted/30 border-b border-border/60">` con celdas `<TableHead className="py-1 px-3 text-xs font-semibold">`.
     - **Filas de datos:** `<TableRow className="h-9 hover:bg-muted/30 transition-colors border-b border-border/40">`.
     - **Celdas:** `<TableCell className="py-1.5 px-3 text-xs">` (PROHIBIDO usar el padding por defecto `p-4` que crea filas gigantescas y espaciadas).
     - **Botones de acción en tabla:** Siempre bare icons limpios (`h-4 w-4` dentro de `<button className="text-slate-400 hover:text-white transition-colors p-1">`), sin texto "Acciones" ni cajas o fondos contenedores.
7. **Estándar de Tipografía, Precios y Formato de Números (Moneda MXN):**
   - **Tipografía Sans-Serif Nativa (PROHIBIDO `font-mono` en Precios y Etiquetas):**
     - Todos los precios, montos monetarios, tarifas de servicios, totales y contadores deben presentarse en la tipografía sans-serif estándar del sistema (`font-sans`).
     - Está estrictamente prohibido usar `font-mono` para precios (`$60.00`) o contadores en badges (`2 de 5 seleccionados`). La clase `font-mono` queda reservada única y exclusivamente para identificadores técnicos (hashes, UUIDs o folios de base de datos como `item.id.slice(0, 8)`).
   - **Tamaño y Peso Visual:**
     - En listas, tarjetas de servicios y selectores de modales: `text-xs font-semibold text-foreground` o `text-xs font-medium text-foreground/80` (con `shrink-0`). NUNCA usar tamaños arbitrarios o desproporcionados como `text-[11px]` en monospace.
     - En celdas de tablas compactas: `text-xs font-medium text-foreground` o `text-xs font-semibold text-foreground`.
     - En totales destacados o confirmaciones: `text-sm font-bold text-foreground` o `text-base`.
     - En insignias/badges de conteo o estado: `text-[10px]` o `text-[11px] font-medium`.
   - **Formato Oficial de Moneda (Siempre 2 Decimales):**
     - Todo importe monetario debe formatearse siempre con 2 decimales usando `formatMoney(value)` de `@/lib/utils` o `.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
     - Ejemplo: Mostrar siempre **`$60.00`**, **`$150.00`**, **`$1,250.00`** (NUNCA mostrar enteros planos como `$60` ni omitir los centavos).
   - **Contraste Seguro:**
     - El texto de precio debe usar `text-foreground` o `text-foreground/90`, evitando tonos apagados (`text-muted-foreground`) que pierdan contraste en pantallas móviles o modo oscuro.
8. **Estándar Oficial de Barras de Scroll (Scrollbars en Azul Vatos Alfa):**
   - Todas las áreas y secciones con desplazamiento del sistema (`overflow-y-auto`, `overflow-auto`, desplegables de servicios/clientes, modales, grids de la agenda y `ScrollArea`) deben usar obligatoriamente la barra de scroll estilizada en **Azul Acento Móvil (`#3B82F6`)**.
   - **Prohibido el scrollbar nativo gris:** Queda estrictamente prohibido permitir barras de scroll nativas del sistema operativo (anchas, grises o con botones triangulares de flechas).
   - **Especificación visual:**
     - Ancho ultra fino y elegante: 5px a 6px con terminaciones redondeadas (`rounded-full` / `9999px`).
     - Pista / track transparente (`background: transparent`).
     - Barra (thumb) en reposo: Azul institucional translúcido (`rgba(59, 130, 246, 0.45)`).
     - Barra (thumb) en hover / interacción: Azul Acento Móvil vibrante (`#3B82F6` / `#2563EB`).
     - Botones nativos de flechas eliminados (`::-webkit-scrollbar-button { display: none !important; }`).
     - Soporte estándar W3C/Firefox (`scrollbar-width: thin; scrollbar-color: rgba(59, 130, 246, 0.45) transparent;`).

---

## 2. Optimización y Densidad Móvil
- Las tarjetas, métricas y modales deben ser compactos en pantallas móviles (`< 640px`).
- Usar paddings contenidos (`p-2.5` a `p-3.5`) para evitar scroll vertical excesivo.
- Subtítulos o párrafos explicativos largos deben ocultarse en pantallas móviles (`hidden sm:block`) para mantener una vista limpia y ordenada.
- **Configuradores de Horario Semanal:** Deben presentarse en una sola tarjeta contenedora unificada con divisores (`divide-y`), alineando el switch, nombre del día, selectores de hora en línea (`De HH:mm a HH:mm`) y botones de acción en una sola fila horizontal (`py-2 px-3.5`). Queda prohibido separar cada día en tarjetas pesadas o de múltiples filas que fuercen scroll vertical innecesario.

---

## 3. Skills del Repositorio
- Consulta el skill oficial en [.agents/skills/vatos-alfa-design-system/SKILL.md](file:///c:/Users/pbjos/OneDrive/Documentos/Agenda-VATOS-ALFA-main/Agenda-VATOS-ALFA-main/.agents/skills/vatos-alfa-design-system/SKILL.md) para más detalles y ejemplos de código.

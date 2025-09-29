# Alcance y Funcionalidades del Proyecto: Alfa Manager

Este documento detalla todas las funcionalidades implementadas en el sistema de gestión "Alfa Manager" hasta la fecha.

## Módulo 1: Sistema de Agendamiento para Clientes (Flujo Público)

- **Selección de Servicios:** Los clientes pueden iniciar su reserva seleccionando uno o más servicios desde una lista categorizada.
- **Selección de Horario y Profesional:** El sistema permite elegir un profesional específico o "cualquiera", seleccionar una fecha en el calendario y ver los horarios disponibles en función de la duración de los servicios y la disponibilidad del profesional.
- **Confirmación de Datos:** Un formulario solicita los datos del cliente (nombre, apellido, correo, teléfono) para finalizar la reserva.
- **Página de Éxito:** Tras confirmar, el cliente es redirigido a una página que confirma que su cita ha sido agendada correctamente.
- **Notificaciones Automáticas:** El cliente recibe una notificación por WhatsApp confirmando los detalles de su reserva (si la opción está habilitada).

## Módulo 2: Agenda Central (Vista Principal del Staff)

- **Vista Diaria por Profesional:** La vista principal muestra las columnas de cada profesional con sus citas del día seleccionado.
- **Visualización de Citas:** Las citas se muestran como bloques en la agenda, con colores que representan su estado (Reservado, Confirmado, Asiste, etc.).
- **Navegación y Filtros:**
  - Se puede navegar día por día o volver al día actual.
  - Se puede filtrar la vista por sucursal y por profesional.
- **Creación de Reservas Internas:** Haciendo clic en un espacio vacío, se abre un modal para crear una nueva reserva, seleccionando cliente, servicios y profesionales.
- **Bloqueo de Horarios:** Permite bloquear rangos de tiempo en la agenda de un profesional por motivos como almuerzo, descansos o ausencias.
- **Gestión de Citas:**
  - **Detalle de Reserva:** Al hacer clic en una cita, se abre un modal con toda la información.
  - **Cambio de Estado:** Es posible cambiar el estado de una reserva (Confirmado, Asiste, No asiste, etc.).
  - **Editar y Cancelar:** Las citas se pueden editar o cancelar. La cancelación actualiza las estadísticas del cliente.
  - **Registrar Pago:** Desde el detalle de la cita, se puede iniciar el proceso de registro de venta asociado a esa reserva.
- **Vista Semanal:** Cada profesional tiene una vista de su propia agenda semanal para ver sus citas de un vistazo.

## Módulo 3: Gestión de Clientes

- **Base de Datos Centralizada:** Una tabla muestra a todos los clientes registrados.
- **Búsqueda y Filtros:** Se puede buscar por nombre, teléfono o correo, y aplicar filtros avanzados por fecha de consumo o mes de cumpleaños.
- **Creación y Edición:** Se pueden crear nuevos clientes manualmente o editar los existentes.
- **Carga Masiva:** Permite importar una base de datos de clientes desde un archivo Excel (.xlsx) o CSV.
- **Combinar Duplicados:** Una herramienta para encontrar y fusionar registros de clientes duplicados por email o teléfono.
- **Ficha de Cliente:** Un modal de detalle muestra toda la información del cliente, incluyendo su historial de citas y compras, y estadísticas clave (gasto total, citas asistidas, etc.).

## Módulo 4: Sistema de Caja y Ventas

- **Registro de Ventas (TPV):** Un panel lateral (sheet) permite registrar ventas, añadiendo servicios y/o productos al carrito.
- **Cálculo de Totales:** El sistema calcula automáticamente el subtotal, descuentos y total.
- **Múltiples Métodos de Pago:** Soporta pagos en efectivo, tarjeta y pagos combinados.
- **Caja Diaria:** La vista de caja muestra el flujo de ingresos y egresos para el día y local seleccionado.
  - **Resumen Financiero:** Tarjetas con el total de ventas, egresos y el resultado del flujo de caja.
- **Gestión de Ingresos/Egresos:** Permite registrar manualmente otros ingresos (ej. aportes) y egresos (ej. pago a proveedores).
- **Pago de Comisiones:** Un modal calcula y permite registrar el pago de comisiones a profesionales basado en las ventas del día.
- **Cierre de Caja (Corte):** Un modal para realizar el corte de caja al final del día, contando el efectivo y comparándolo con el total del sistema.
- **Autorización por Código:** Acciones sensibles como editar o eliminar egresos requieren un código de autorización.

## Módulo 5: Gestión de Productos (Inventario)

- **Listado de Inventario:** Una tabla muestra todos los productos con su nombre, categoría, marca, precio, y stock.
- **Gestión de Stock:** Permite aumentar o disminuir el stock de un producto manualmente.
- **Alarmas de Stock:** Se puede configurar un umbral mínimo de stock y un email de notificación para recibir alertas de bajo inventario.
- **Gestión de Catálogos:** Se pueden crear, editar y eliminar categorías, marcas y formatos/presentaciones para los productos.
- **Carga Masiva:** Permite importar un inventario completo desde un archivo Excel o CSV.

## Módulo 6: Administración y Configuración

- **Gestión de Profesionales:** Crear, editar y ordenar la lista de profesionales. Configurar sus datos, servicios que realizan y horarios de trabajo.
- **Gestión de Servicios:** Crear, editar y categorizar los servicios que ofrece el negocio, definiendo duración, precio y comisión por defecto.
- **Gestión de Comisiones:**
  - **Por Profesional:** Asignar comisiones específicas por servicio para cada profesional.
  - **Por Servicio:** Asignar comisiones específicas por profesional para cada servicio.
  - **Por Producto:** Asignar comisiones específicas por profesional para cada producto.
- **Gestión de Locales:** Crear y administrar múltiples sucursales, cada una con su propia dirección y horario de atención.
- **Gestión de Usuarios y Permisos:**
  - **Creación de Usuarios:** Registrar nuevos usuarios en el sistema (distintos a los profesionales) con un email y contraseña.
  - **Roles y Permisos:** Un sistema granular permite asignar roles (Administrador, Recepcionista, etc.) y personalizar los permisos para cada rol, controlando el acceso a cada sección y funcionalidad de la plataforma.
- **Configuración de Notificaciones:**
  - **Activación Global:** Activar o desactivar globalmente las notificaciones de WhatsApp para "Reserva", "Recordatorio", "Cumpleaños" y "Opinión de Google Maps".
  - **Configuración de Tiempo:** Definir cuándo se deben enviar los recordatorios (ej. "el mismo día, 2 horas antes").

## Módulo 7: Reportes

- **Reporte de Ventas de Productos:** Estadísticas detalladas sobre la venta de productos, con filtros por fecha y producto. Incluye recaudación total, unidades vendidas y rankings.
- **Reporte de Comisiones:** Un reporte detallado para calcular las comisiones de cada profesional en un período seleccionado, con desglose por venta.
- **Reporte de Cierres de Caja:** Historial de todos los cortes de caja realizados.
- **(Próximamente)** Reportes de Reservas y Ventas Generales.

## Módulo 8: Comunicaciones

- **Panel de Conversaciones:** Un chat integrado para ver y responder los mensajes de WhatsApp recibidos de los clientes.
- **Notificaciones por WhatsApp:** El sistema está integrado con Twilio para enviar notificaciones de plantilla automáticas y mensajes directos.
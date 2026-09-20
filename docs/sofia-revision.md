# Revisión de Sofía — 20 de septiembre de 2026

## Alcance

Cambios limitados al orquestador `src/lib/actions/ai-agent.ts`, módulos `src/lib/ai/agent-*`, pruebas de Sofía y este informe. Se conservaron los cambios previos en conversaciones, caja, ventas, comisiones y tipos. No se modificó el motor compartido de reservas, las funciones desplegables, reglas de Firebase ni el webhook de pagos. No se desplegó ni se enviaron mensajes, cobraron anticipos o crearon citas reales.

## Correcciones

- Calendario dinámico en America/Mexico_City, incluso al cambiar de día o año. Fechas pasadas e imposibles se rechazan; no se trasladan silenciosamente a mañana.
- Instrucciones conversacionales sin fechas, precios ni horarios de ejemplo que pudieran confundirse con datos actuales. Se requiere aceptación del cliente y resultado exitoso de la herramienta para anunciar una operación.
- Historial sin duplicar el mensaje actual; saludo inicial correcto. La solicitud de recepción reconoce palabras completas y acentos, y se respetan las pausas humanas.
- Las herramientas identifican citas a partir del teléfono de la conversación, consideran los formatos mexicanos de 10, 12 y 13 dígitos y evitan coincidencias por teléfonos vacíos o parciales.
- Se excluyen citas pasadas y terminadas. Si hay varias citas y no se eligió una, se solicita aclaración. IDs de otras personas no permiten modificar su cita.
- Cancelación con estado `Cancelado`, compatible con la agenda. Cancelación y confirmación verifican nuevamente la cita dentro de una transacción.
- Confirmar asistencia no confirma un anticipo pendiente ni reactiva citas canceladas. Un mensaje o captura no prueba un pago.
- Reagendado consulta disponibilidad, mantiene duración, actualiza hora de fin y profesional principal, restablece indicadores de confirmación y comprueba colisiones de reservas en una transacción.
- La disponibilidad y creación respetan anticipación mínima, máximo de días y desactivación de agendamiento automático. El horario comercial de respuesta consulta los horarios de los locales.
- Servicios desconocidos ya no se reemplazan por un corte. Profesionales inexistentes no se sustituyen silenciosamente. Se verifican servicios habilitados por profesional.
- Duración de servicios combinados y repetidos compatible con el contrato del motor compartido, que aplica la duración personalizada al primer corte y suma los demás servicios.
- Enlaces de pago preservados íntegros; se informa si no pudo generarse el enlace. Se evita sustituir un enlace actualizado por otro que cobra un monto anterior.
- Las preferencias de anticipo de Sofía pueden añadir un requisito, respetando el mínimo obligatorio del motor compartido. El anticipo nunca excede el total. Productos respetan configuración de anticipo y estados de pago normalizados; se verifican existencias antes de añadirlos.
- El simulador puede consultar, pero no crear/modificar reservas reales, añadir productos ni registrar lista de espera real. Los intentos devuelven una explicación explícita.
- Ante una caída de IA, el respaldo no adivina una nueva reserva. Solicita recepción para crear o reagendar. Si la IA falla después de intentar una operación, no se ejecuta una segunda escritura desde el respaldo.

## Verificación

- `node tests/sofia/regression.cjs`: 20 casos con base de datos, disponibilidad y modelo simulados. No requiere credenciales ni usa servicios reales.
- `npm run typecheck -- --incremental false`: comprobación TypeScript del proyecto.
- `git diff --check`: revisión de espacios y conflictos de formato.

Las pruebas verifican lógica local; no equivalen a una prueba con Firestore real, Gemini, Mercado Pago o WhatsApp. No se ejecutó el build que genera versión y assets públicos, para mantener los cambios dentro del alcance.

## Pendientes para operación completa

1. En esta copia, `processAgentMessage` se invoca desde conversaciones/simulador. No se encontró una conexión desplegable que reciba y envíe WhatsApp: `firebase.json` despliega `functions/`, cuyo código indica que las funciones de Twilio fueron retiradas. El código alternativo en `src/functions/` no es el directorio desplegable configurado. Se necesita identificar proveedor e integración actual; no se debe adivinar ni sustituir un canal existente.
2. Validar en un entorno de pruebas las credenciales del modelo, lectura/escritura de Firebase, generación de enlace y notificación de pago. Verificar autenticación del canal, firma de webhooks, deduplicación de mensajes y asociación de teléfono antes de conectar el motor a mensajes externos.
3. Probar reserva, anticipo, confirmación, cancelación, reagendado y atención humana de extremo a extremo antes de desplegar.
4. Cambios de profesional y citas con varios profesionales requieren recepción. Cambios que se superponen con el horario anterior pueden ser rechazados conservadoramente porque la consulta compartida cuenta la cita original como ocupada.
5. Las fotos se guardan en el chat, pero no se analizan visualmente. La lista de espera registra solicitudes; no se comprobó un mecanismo de aviso automático. No se anuncian esas capacidades como completadas.
6. No se cambiaron las reglas financieras globales. Desactivar el anticipo adicional de Sofía no elimina los anticipos obligatorios configurados por servicio o en la configuración general.
7. La creación utiliza el motor existente: su comprobación de disponibilidad y escritura no constituyen una única transacción. Una garantía absoluta contra reservas simultáneas entre todos los canales necesita revisar ese motor compartido. Esta revisión no lo modifica por el alcance solicitado. Las verificaciones de inventario tampoco sustituyen una reserva transaccional de stock.

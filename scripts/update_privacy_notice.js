const admin = require('firebase-admin');
const path = require('path');

const credPath = path.resolve(__dirname, '../backend-credentials.json');
admin.initializeApp({
  credential: admin.credential.cert(require(credPath))
});

const db = admin.firestore();

const privacyNoticeDocument = `AVISO DE PRIVACIDAD INTEGRAL
VATOS ALFA BARBER SHOP
Última actualización y entrada en vigor: Octubre 2026 • Santiago de Querétaro, Qro.

CAPÍTULO I. IDENTIDAD Y DOMICILIO DEL RESPONSABLE
VATOS ALFA BARBER SHOP (en lo sucesivo, el "RESPONSABLE" o "VATOS ALFA"), con domicilio comercial y fiscal en Santiago de Querétaro, Estado de Querétaro, México, portal web oficial https://vatosalfa.com, y canal institucional del Departamento de Protección de Datos Personales: contacto@vatosalfa.com, es el responsable del uso, tratamiento, almacenamiento y protección de sus datos personales. El presente Aviso de Privacidad se emite en estricto cumplimiento con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), su Reglamento (RLFPDPPP) y los Lineamientos del Aviso de Privacidad expedidos por el Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales (INAI).

CAPÍTULO II. CATEGORÍAS DE DATOS PERSONALES RECABADOS
Para el cumplimiento de las finalidades señaladas en el presente documento, VATOS ALFA recaba y trata las siguientes categorías de datos personales:

2.1 Datos de Identificación y Contacto:
- Nombre y apellidos completos.
- Número de teléfono móvil celular (para llamadas operativas y mensajería transaccional vía SMS y WhatsApp).
- Dirección de correo electrónico.
- Fecha de nacimiento (opcional, destinada al beneficio de cortesías o promociones en el mes de su cumpleaños).
- Firma autógrafa o electrónica (en notas de recepción, hojas de consentimiento o comprobantes de servicio).

2.2 Datos Patrimoniales y Financieros:
- Comprobantes y registros de pago de anticipos o liquidaciones (número de orden, monto, fecha y hora).
- Historial de transacciones comerciales y consumo en sucursal.
- Datos de facturación fiscal electrónica CFDI 4.0: Registro Federal de Contribuyentes (RFC), Razón Social o Nombre fiscal, Régimen Fiscal, Código Postal del domicilio fiscal y Uso de CFDI.
*Protección de Datos Bancarios bajo Estándar Internacional PCI-DSS*: Se hace constar formalmente que VATOS ALFA NO almacena, no visualiza ni tiene acceso a los números completos de dieciséis (16) dígitos de tarjetas de crédito o débito, fechas de vencimiento ni códigos de validación dinámica (CVV/CVC). Toda transacción electrónica remota es procesada de forma encriptada a través de pasarelas de pago de terceros certificadas (Mercado Pago / Stripe) bajo el estándar internacional PCI-DSS (Payment Card Industry Data Security Standard). Los datos de facturación son resguardados en estricto cumplimiento con el Código Fiscal de la Federación (CFF).

2.3 Datos Personales Sensibles (Salud Dérmica, Alergias y Bioseguridad):
En cumplimiento de los artículos 3 fracción VI, 8 y 9 de la LFPDPPP, se informa que para la prestación segura de ciertos servicios de barbería que involucran el uso de navaja tradicional directa a la dermis (shavette con navaja desechable estéril) o aplicación de químicos capilares (tintes, decoloración, peróxido o lociones aftershave), VATOS ALFA solicitará y registrará bajo su consentimiento expreso los siguientes datos sensibles:
- Manifestaciones sobre afecciones dermatológicas activas en rostro o cuero cabelludo (dermatitis, psoriasis, acné activo, foliculitis, micosis, presencia de lunares con relieve, verrugas, queloides o cicatrices quirúrgicas recientes).
- Alergias o hipersensibilidad cutánea conocida a colorantes, químicos, sales metálicas, alcohol, mentol o fragancias.
- Uso de fármacos anticoagulantes o antecedentes de trastornos de cicatrización o coagulación.
*Finalidad Exclusiva de los Datos Sensibles*: Proteger la vida, salud e integridad física del CLIENTE, adecuar la técnica artesanal para evitar micro-cortes cutáneos superficiales, prevenir choques alérgicos o reacciones adversas graves, y delimitar responsabilidades en caso de omisión. Dichos datos son confidenciales y se mantienen bajo medidas de seguridad reforzadas.

2.4 Datos Biométricos y Multimedia (Videovigilancia e Imagen):
- Circuito Cerrado de Televisión (CCTV / Videovigilancia): Grabaciones en video y secuencias de movimiento captadas por las cámaras de seguridad instaladas en las áreas de recepción y zonas comunes de las sucursales, destinadas a la seguridad y control del establecimiento.
- Fotografías y Videos de Portafolio Profesional: Tomas voluntarias del resultado de cortes de cabello, peinados o arreglos de barba para exhibición comercial e institucional en redes sociales oficiales (Instagram, TikTok, Facebook).

2.5 Datos Personales de Menores de Edad (Niños y Adolescentes):
En servicios brindados a menores de edad, sus datos de identificación (nombre y edad) son recabados y autorizados exclusivamente a través de sus padres, madres o tutores legales en ejercicio de la patria potestad o tutela jurídica, conforme al principio del Interés Superior de la Niñez y la legislación civil aplicable.

2.6 Datos de Navegación Electrónica (Cookies y Tecnologías Digitales):
Dirección IP de conexión, tipo de navegador, sistema operativo, identificadores de sesión digital, tiempo de permanencia, páginas visitadas en el portal y registros de almacenamiento local (Local Storage y Session Storage) utilizados en nuestra plataforma web y Progressive Web App (PWA).

CAPÍTULO III. FINALIDADES DEL TRATAMIENTO DE LOS DATOS PERSONALES
El tratamiento de sus datos personales responde a las siguientes finalidades:

3.1 Finalidades Primarias (Necesarias para la existencia, mantenimiento y cumplimiento de la relación jurídica y de servicio entre el CLIENTE y VATOS ALFA):
a) Agendamiento, registro, confirmación, reprogramación y seguimiento operativo de citas en la agenda de reservas.
b) Creación y actualización del expediente y perfil del cliente en el sistema para control de citas, barbero seleccionado y preferencias de estilo.
c) Identificación y validación de la identidad del cliente al ingresar a la sucursal de atención.
d) Cobro de anticipos (depósitos en garantía), liquidación de cuentas en caja y expedición de comprobantes de pago o Comprobantes Fiscales Digitales por Internet (CFDI 4.0).
e) Evaluación previa de seguridad dérmica y capilar para la aplicación adecuada de navajas o químicos cosméticos, previniendo lesiones o dermatitis por contacto.
f) Preservar la seguridad física, orden e integridad de los clientes, colaboradores, visitantes y patrimonio del establecimiento a través de los sistemas de videovigilancia (CCTV).
g) Atención de quejas, dudas, solicitudes de ajustes de cortesía dentro del periodo de garantía (48 horas) o aclaraciones operativas.
h) Cumplimiento de obligaciones legales, sanitarias, fiscales y mercantiles ante autoridades administrativas o judiciales.

3.2 Finalidades Secundarias (No indispensables para la prestación del servicio contratado, pero que permiten brindarle una mejor experiencia de atención):
a) Envío de recordatorios automáticos de citas y notificaciones de estatus vía WhatsApp, SMS o correo electrónico.
b) Notificación de cortesías, descuentos exclusivos o promociones especiales en el mes de su cumpleaños.
c) Envío de información comercial sobre promociones de temporada, lanzamientos de nuevos servicios o productos cosméticos de barbería.
d) Aplicación de encuestas de calidad, satisfacción del cliente y evaluación del desempeño de los barberos.
e) Publicación voluntaria de imágenes o videos de cortes de cabello en redes sociales oficiales de VATOS ALFA con propósitos de portafolio comercial.

3.3 Mecanismo para Manifestar la Negativa a Finalidades Secundarias:
Si el CLIENTE no desea que sus datos personales sean tratados para las finalidades secundarias señaladas, podrá manifestar su negativa en cualquier momento:
- Enviando un correo electrónico a contacto@vatosalfa.com con el asunto "Negativa a Finalidades Secundarias", o
- Respondiendo con la palabra "BAJA" al WhatsApp oficial de atención.
La negativa al uso de sus datos para finalidades secundarias no será motivo para negarle la prestación de los servicios o venta de productos de VATOS ALFA.

CAPÍTULO IV. TRANSFERENCIAS DE DATOS PERSONALES
4.1 Transferencias que No Requieren Consentimiento (Art. 37 de la LFPDPPP):
Sus datos personales podrán ser transferidos sin su consentimiento únicamente en los supuestos previstos por el artículo 37 de la ley:
a) Proveedores de Cómputo e Infraestructura en la Nube: Google LLC (Google Cloud Platform / Firebase), para el almacenamiento cifrado y respaldo de bases de datos.
b) Pasarelas de Pago y Entidades Financieras: Mercado Pago y plataformas bancarias homologadas, exclusivamente para procesar pagos de anticipos y cobros con tarjeta.
c) Plataformas de Telecomunicaciones: Meta Platforms Ireland Limited (WhatsApp Business API) y servicios de correo electrónico transaccional, única y estrictamente para la remisión de avisos operativos de reserva.
d) Autoridades Hacendarias, Judiciales o Administrativas: Servicio de Administración Tributaria (SAT), PROFECO y autoridades competentes en caso de requerimiento legal fundado y motivado, o para la defensa de derechos ante contracargos bancarios o controversias legales.

4.2 Cláusula Anticomercialización:
VATOS ALFA declara solemnemente que NO vende, NO renta, NO cede y NO comercializa las bases de datos de sus clientes con terceros, intermediarios de mercadotecnia, despachos de cobranza externa ni compañías de telemarketing.

CAPÍTULO V. PROCEDIMIENTO FORMAL PARA EL EJERCICIO DE DERECHOS ARCO
Usted tiene derecho a conocer qué datos personales tenemos de usted, para qué los usamos y las condiciones del uso que les damos (Acceso); solicitar la corrección de su información en caso de que esté desactualizada, sea inexacta o incompleta (Rectificación); que la eliminemos de nuestros registros o bases de datos cuando considere que la misma no está siendo utilizada conforme a los principios, deberes y obligaciones previstos en la ley (Cancelación); así como oponerse al uso de sus datos personales para fines específicos (Oposición).

5.1 Canal Designado y Oficial de Privacidad:
Para el ejercicio de cualquiera de sus Derechos ARCO, el titular o su representante legal deberán enviar una solicitud formal por escrito al correo electrónico oficial: contacto@vatosalfa.com, o bien, presentarla físicamente por escrito en la recepción de la sucursal de VATOS ALFA.

5.2 Requisitos Indispensables de la Solicitud (Art. 29 de la LFPDPPP):
La solicitud deberá contener y acompañar:
1. El nombre del titular y correo electrónico o domicilio para comunicarle la respuesta.
2. Copia fotostática o digital legible de identificación oficial vigente (INE o Pasaporte). En caso de representante legal, el documento que acredite la representación (poder notarial o carta poder ratificada ante dos testigos e identificaciones). Para menores de edad, acta de nacimiento e identificación del tutor.
3. La descripción clara y precisa de los datos personales respecto de los que se busca ejercer alguno de los derechos ARCO y el derecho concreto que desea ejercer.
4. En caso de Rectificación, adjuntar la documentación que sustente la modificación solicitada.
5. Cualquier otro elemento o dato que facilite la localización de los datos personales en el sistema (por ejemplo, número de teléfono móvil registrado o fecha de su última visita).

5.3 Plazos Legales de Determinación y Ejecución (Art. 32 de la LFPDPPP):
- Determinación: VATOS ALFA comunicará al titular en un plazo máximo de veinte (20) días hábiles contados desde la recepción de la solicitud completa, la determinación adoptada sobre la procedencia de la misma.
- Ejecución: Si resulta procedente, se hará efectiva dentro de los quince (15) días hábiles siguientes a la fecha en que se notifique la respuesta.
- Prórroga Legal: Los plazos señalados podrán ser ampliados una sola vez por un periodo igual cuando así lo justifiquen las circunstancias debidamente fundadas del caso.

5.4 Gratuidad del Procedimiento:
El ejercicio de los derechos ARCO es totalmente gratuito. El titular únicamente asumirá los gastos de reproducción en copias físicas o costos de envío postal en caso de solicitar respuestas certificadas.

CAPÍTULO VI. REVOCACIÓN DEL CONSENTIMIENTO Y LIMITACIÓN DE USO O DIVULGACIÓN
6.1 Revocación del Consentimiento:
El titular puede revocar en cualquier momento el consentimiento que nos haya otorgado para el tratamiento de sus datos personales, siempre y cuando no exista una obligación legal o fiscal que nos obligue a conservarlos (como la retención obligatoria de CFDI y pólizas contables por 5 años exigida por el Código Fiscal de la Federación).

6.2 Limitación de Uso y Registro REPEP:
Para limitar el uso o divulgación de sus datos para promociones comerciales, usted puede:
a) Solicitar su inscripción en la Lista de Exclusión Publicitaria Interna de VATOS ALFA mediante correo a contacto@vatosalfa.com.
b) Registrar su número telefónico en el Registro Público para Evitar Publicidad (REPEP) de la Procuraduría Federal del Consumidor (PROFECO), ingresando a https://repep.profeco.gob.mx o comunicándose al teléfono 800 962 8000.

CAPÍTULO VII. TRATAMIENTO DE DATOS EN EL CIRCUITO CERRADO DE VIDEOVIGILANCIA (CCTV)
Con la finalidad primordial de resguardar la seguridad e integridad física de clientes, colaboradores, visitantes y las instalaciones de VATOS ALFA, las sucursales cuentan con un sistema de videovigilancia mediante cámaras de circuito cerrado (CCTV) instaladas en áreas comunes y accesos.
- Las imágenes y videos captados son almacenados en servidores seguros con cifrado de acceso restringido al personal administrativo.
- Periodo de Retención: Las grabaciones se conservan durante un plazo máximo de treinta (30) días naturales, transcurrido el cual son eliminadas y sobreescritas automáticamente, salvo que exista un requerimiento ministerial, judicial o investigación de siniestro en curso.

CAPÍTULO VIII. USO DE COOKIES, WEB BEACONS Y TECNOLOGÍAS WEB
En nuestro portal web oficial https://vatosalfa.com y en la aplicación de reservas empleamos cookies técnicas, web beacons y tecnologías de almacenamiento local en el navegador (Local Storage / Session Storage) con las siguientes finalidades:
- Mantener la sesión activa del usuario y recordar preferencias visuales.
- Facilitar el flujo interactivo de agendamiento y retención temporal de los servicios seleccionados.
- Recopilar métricas estadísticas de rendimiento para optimizar la velocidad y estabilidad del sitio.
*Control de Cookies*: El usuario puede deshabilitar o bloquear el almacenamiento de cookies en cualquier momento a través de la configuración de seguridad y privacidad de su navegador web (Google Chrome, Apple Safari, Mozilla Firefox, Microsoft Edge, etc.). Se advierte que deshabilitar cookies esenciales puede inhabilitar ciertas funciones del motor de reservas en línea.

CAPÍTULO IX. MEDIDAS DE SEGURIDAD FÍSICAS, TÉCNICAS Y ADMINISTRATIVAS
VATOS ALFA implementa estrictas medidas de seguridad administrativas, técnicas y físicas para salvaguardar sus datos personales contra pérdidas, robos, alteraciones, accesos no autorizados o divulgación ilícita. Estas medidas comprenden:
- Transmisión encriptada de extremo a extremo mediante protocolos SSL/TLS con certificados de seguridad HTTPS.
- Alojamiento en servidores empresariales con autenticación de doble factor y cortafuegos perimetrales.
- Políticas de acceso restringido asignadas por perfiles de usuario según el principio de necesidad funcional.
- Acuerdos de confidencialidad legalmente vinculantes con todos los barberos y colaboradores de la empresa.

CAPÍTULO X. AUTORIDAD GARANTE DE PROTECCIÓN DE DATOS (INAI)
Si el titular considera que su derecho a la protección de datos personales ha sido lesionado por cualquier conducta o actuación de VATOS ALFA, o presume que en el tratamiento de sus datos existe alguna violación a las disposiciones de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) o su Reglamento, se le informa que tiene el derecho pleno de interponer la correspondiente queja, denuncia o procedimiento de protección de derechos ante el Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales (INAI).
Para mayor información y asesoría ciudadana, puede consultar el portal web oficial en https://home.inai.org.mx o comunicarse al Centro de Atención a la Sociedad (TEL-INAI) marcando al 800 835 4324.

CAPÍTULO XI. MODIFICACIONES AL AVISO DE PRIVACIDAD
VATOS ALFA se reserva el derecho de actualizar, modificar o complementar el presente Aviso de Privacidad en cualquier momento para reflejar reformas legales, criterios del INAI, modificaciones operativas internas o la introducción de nuevos servicios. Cualquier cambio sustancial será notificado oportunamente a través de nuestro sitio web oficial https://vatosalfa.com/privacidad.

CAPÍTULO XII. CONSENTIMIENTO Y ACEPTACIÓN
Al utilizar nuestro sitio web, agendar una cita por medios digitales, telefónicos o presenciales, y/o al proporcionar sus datos personales a nuestro personal, el CLIENTE manifiesta haber leído, comprendido y aceptado en su totalidad los términos del presente Aviso de Privacidad Integral, consintiendo expresamente el tratamiento de sus datos personales, patrimoniales y sensibles en apego a los términos aquí regulados.`;

async function updatePrivacyNotice() {
  try {
    await db.collection('settings').doc('website').set({
      privacyText: privacyNoticeDocument,
      privacyUrl: 'https://vatosalfa.com/privacidad'
    }, { merge: true });
    console.log('SUCCESS: settings/website updated successfully with full 12-chapter blind-tested privacy notice.');
    process.exit(0);
  } catch (err) {
    console.error('ERROR updating privacy notice:', err);
    process.exit(1);
  }
}

updatePrivacyNotice();

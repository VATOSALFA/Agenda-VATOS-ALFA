const admin = require('firebase-admin');
const path = require('path');

const credPath = path.resolve(__dirname, '../backend-credentials.json');
admin.initializeApp({
  credential: admin.credential.cert(require(credPath))
});

const db = admin.firestore();

const termsDocument = `TÉRMINOS Y CONDICIONES GENERALES DE SERVICIO
VATOS ALFA BARBER SHOP
Última actualización y entrada en vigor: Octubre 2026 • Santiago de Querétaro, Qro.

CAPÍTULO I. DECLARACIONES Y CONSENTIMIENTO ELECTRÓNICO
1.1 Naturaleza del Contrato: El presente documento constituye un contrato de adhesión de prestación de servicios y compraventa mercantil celebrado entre el cliente o usuario (en lo sucesivo, el "CLIENTE") y VATOS ALFA BARBER SHOP (en lo sucesivo, el "ESTABLECIMIENTO").
1.2 Consentimiento Expreso: Al agendar una cita mediante nuestra plataforma web oficial (https://vatosalfa.com/reservar), vía telefónica, mensajería instantánea (WhatsApp), redes sociales o presencialmente en sucursal, así como al realizar el pago total o parcial de un anticipo, el CLIENTE declara ser mayor de edad con plena capacidad legal y acepta sin reserva ni condición alguna la totalidad de las cláusulas aquí estipuladas, conforme a los artículos 89, 89 bis y demás relativos del Código de Comercio en materia de consentimiento por medios electrónicos.

CAPÍTULO II. POLÍTICA DE CITAS, PUNTUALIDAD Y PROTOCOLO DE TOLERANCIA
2.1 Tolerancia Máxima Estricta de 10 Minutos: Se otorga una tolerancia máxima e improrrogable de diez (10) minutos naturales contados a partir de la hora formalmente reservada.
2.2 Cancelación Automática por Inasistencia ("No-Show"): Transcurridos los 10 minutos de tolerancia sin que el CLIENTE se haya presentado en la recepción, la cita quedará cancelada de forma automática y el barbero quedará en absoluta libertad de disponer del horario para atender a otros clientes, liberando al ESTABLECIMIENTO de cualquier obligación de atención en dicho turno.
2.3 Llegadas con Retraso (5 a 10 Minutos): Si el CLIENTE se presenta dentro de los 10 minutos de cortesía pero con retraso, el profesional evaluará técnicamente si es posible ejecutar el servicio completo o si deberá adaptar el procedimiento al tiempo restante para no demorar la cita subsecuente. En tal caso, se liquidará la tarifa completa pactada del servicio reservado.

CAPÍTULO III. POLÍTICA DE ANTICIPOS (DEPÓSITOS DE GARANTÍA) Y REGLAS DE RESERVA
3.1 Naturaleza del Anticipo: El anticipo constituye un depósito de garantía y pago a cuenta en concepto de arras confirmatorias que formaliza el apartado exclusivo de la agenda del profesional seleccionado, el bloqueo de la silla de trabajo y la disposición previa de insumos estériles.
3.2 Criterios de Exigibilidad de Anticipo:
a) Umbral por Importe Acumulado: Cuando la suma de servicios seleccionados alcance o supere $190.00 MXN, el sistema exigirá en línea el pago de un anticipo base del 50% del total para confirmar el espacio.
b) Servicios Especiales o Paquetes: Procedimientos de alta duración que requieran 60 minutos o más de ocupación de agenda.
c) Escudo Antifraude por Inasistencias Reincidentes: Aquellos clientes que acumulen en el sistema dos (2) o más inasistencias ("No-Shows") o cancelaciones no notificadas, quedarán clasificados bajo régimen de garantía reforzada, exigiéndoseles anticipo obligatorio del 50% para cualquier cita futura, sin importar el monto o tipo de servicio.
3.3 Ventana de Reserva: El sistema permite agendar con un tiempo mínimo de anticipación de 30 minutos y con una ventana máxima a futuro de 14 días naturales. Las citas agendadas con 45 minutos o menos de antelación recibirán confirmación inmediata y se omitirá el envío de recordatorios posteriores por su inmediatez.
3.4 Acreditación en Caja: Todo anticipo pagado será acreditado y descontado automáticamente del saldo final a liquidar en la caja del ESTABLECIMIENTO al término del servicio.
3.5 Ventana de Tolerancia para Pago de Anticipo: Al crear una reservación sujeta a anticipo en línea, el CLIENTE dispone de una tolerancia máxima e improrrogable de veinte (20) minutos naturales para acreditar su pago. Transcurrido dicho periodo de 20 minutos sin recepción del pago, la reserva preliminar se cancelará de forma automática en el sistema para reincorporar el horario a la disponibilidad general.

CAPÍTULO IV. CANCELACIONES, REAGENDACIONES Y RETENCIÓN DE ANTICIPOS
4.1 Cancelación Oportuna (Al menos 2 Horas de Anticipación): Si el CLIENTE notifica su cancelación o solicita reagendar con un mínimo de dos (2) horas de antelación a la cita, el 100% de su anticipo se conservará como saldo a favor en su cuenta para ser utilizado en una nueva reservación dentro de los siguientes treinta (30) días naturales. Concluido este plazo, el saldo a favor caducará de pleno derecho.
4.2 Cancelación Tardía (Menos de 2 Horas): Al no permitir la reasignación del turno a otro cliente, las cancelaciones solicitadas con menos de 2 horas de anticipación causarán la retención definitiva del 100% del anticipo como compensación por costos operativos y perjuicio económico al barbero.
4.3 Inasistencia Injustificada ("No-Show"): La falta de comparecencia sin aviso previo dará lugar a la pérdida del 100% del anticipo y al registro de falta en el expediente del CLIENTE.
4.4 No Devolución en Efectivo ni Transferencia: En apego a comisiones de pasarelas de pago y gastos de gestión, los anticipos cancelados oportunamente se acreditarán exclusivamente como saldo a favor para servicios en la barbería, no procediendo devoluciones en efectivo ni transferencias bancarias.
4.5 Cancelación por Causas del Establecimiento: Si por caso fortuito o causas atribuibles a la barbería se debiera reprogramar o cancelar una cita confirmada, el CLIENTE tendrá derecho a reagendación prioritaria inmediata o al reembolso íntegro del 100% del anticipo liquidado.

CAPÍTULO V. RIESGOS INHERENTES DE LOS SERVICIOS DE BARBERÍA, NAVAJA TRADICIONAL Y DESLINDE DE RESPONSABILIDAD
5.1 Reconocimiento de Riesgos en Afeitado con Navaja: El CLIENTE reconoce y acepta que el perfilado de barba, afeitado clásico y desvanecido al ras ("skin fade") ejecutados con navaja de barbero (shavette con navaja desechable estéril) son técnicas artesanales directas sobre la dermis. A pesar de los estrictos protocolos de bioseguridad, desinfección y destreza profesional, dichos procedimientos conllevan el riesgo inevitable de micro-cortes cutáneos superficiales, enrojecimiento temporal o irritación folicular ("razor burn"), propios de la naturaleza del vello, textura de la piel o sensibilidad individual.
5.2 Obligación de Manifestación de Salud por parte del CLIENTE: Antes de iniciar el servicio, el CLIENTE tiene la obligación estricta de advertir al barbero si padece:
- Afecciones dermatológicas activas en rostro o cuero cabelludo (dermatitis, psoriasis, acné activo, herpes, micosis o foliculitis).
- Presencia de lunares abultados, verrugas, queloides, cicatrices quirúrgicas recientes o quemaduras.
- Uso de medicamentos anticoagulantes, tratamientos dermatológicos con ácidos o problemas de cicatrización/coagulación.
- Piel hipersensible o alergia conocida al alcohol, mentol, eucalipto o lociones aftershave.
5.3 Exoneración por Omisión de Información: Si el CLIENTE omite manifestar cualquiera de las condiciones anteriores, el ESTABLECIMIENTO y sus profesionales quedan total y expresamente deslindados de toda responsabilidad civil, médica o indemnizatoria por cualquier reacción derivada de dicha omisión.

CAPÍTULO VI. PROCEDIMIENTOS QUÍMICOS Y TRATAMIENTOS (TINTES, DECOLORACIÓN, PLATINADOS Y ALACIADOS)
6.1 Prueba de Sensibilidad Cutánea ("Patch Test"): En servicios químicos, el CLIENTE tiene derecho a solicitar una prueba de alergia previa con 24 a 48 horas de antelación. Si decide someterse al servicio el mismo día sin prueba previa, asume conscientemente el riesgo de cualquier reacción alérgica imprevista.
6.2 Diagnóstico Capilar e Historial Previo: La decoloración altera la fibra capilar y el resultado depende del historial químico del cabello. Si el CLIENTE ha aplicado previamente tintes negros, tintes de caja, sales metálicas o tratamientos incompatibles y no lo informa, el ESTABLECIMIENTO no se hace responsable por quiebre de la hebra capilar ni por discrepancias en el tono alcanzado.

CAPÍTULO VII. ATENCIÓN A MENORES DE EDAD (NIÑOS Y ADOLESCENTES)
7.1 Presencia y Acompañamiento Obligatorio: La atención a menores de catorce (14) años requiere la presencia física continua y supervisión de su padre, madre o tutor legal durante todo el servicio.
7.2 Riesgo por Movimientos Bruscos: El tutor legal reconoce que las herramientas de barbería (tijeras de filo dulce, máquinas de corte con cuchillas de alta frecuencia y herramientas de perfilado) demandan inmovilidad del cliente. Si el menor llora intensamente, patalea o realiza movimientos bruscos intempestivos, el profesional estará facultado para suspender de inmediato el servicio para preservar la seguridad física del menor. En caso de suscitarse algún rasguño o micro-corte superficial provocado directamente por el movimiento repentino del menor fuera del control del barbero, el padre o tutor legal exime formalmente a VATOS ALFA y a su personal de cualquier responsabilidad legal o indemnizatoria.

CAPÍTULO VIII. POLÍTICA DE CONFORMIDAD, NO REEMBOLSOS Y GARANTÍA DE AJUSTES
8.1 Inexistencia de Reembolsos en Servicios Terminados: Toda vez que los servicios de barbería y estilismo son prestaciones intangibles consumidas en el acto, bajo ninguna circunstancia procederá el reembolso de dinero en efectivo, transferencia bancaria ni cancelación de cargo con tarjeta una vez concluido y entregado el servicio.
8.2 Validación en el Sillón de Trabajo: Al concluir el servicio, el profesional mostrará el resultado al CLIENTE con espejos de ángulo múltiple. El CLIENTE tiene la obligación de manifestar en ese momento si requiere mayor rebaje o ajuste. El levantarse del sillón y liquidar la cuenta constituye la aceptación formal y plena conformidad con el servicio recibido.
8.3 Ventana de Ajuste de Cortesía (48 Horas): Si dentro de las cuarenta y ocho (48) horas naturales posteriores a su cita el CLIENTE detecta alguna asimetría o detalle técnico menor, podrá acudir a la sucursal para un ajuste de cortesía sin costo, previa cita y valoración técnica. No procederán ajustes si el CLIENTE solicita un estilo totalmente diferente al acordado en la cita original o si transcurrieron más de 48 horas.

CAPÍTULO IX. PREVENCIÓN DE FRAUDES Y BLINDAJE CONTRA CONTRACARGOS ("CHARGEBACKS")
9.1 Reconocimiento de Cargo Legítimo: El CLIENTE reconoce que toda transacción efectuada con tarjeta bancaria o pasarelas electrónicas (Mercado Pago, Stripe o terminales del local) corresponde a la contratación consentida de servicios o productos.
9.2 Validez Probatoria Digital: Los registros electrónicos del sistema (dirección IP, número telefónico verificado, confirmaciones emitidas por WhatsApp, comprobantes de pago digital y video-grabaciones de seguridad del local) constituyen prueba plena del servicio pactado o recibido.
9.3 Consecuencias de Contracargo Fraudulento: El inicio infundado de un contracargo o disputa bancaria por un servicio efectivamente prestado o por una retención de anticipo validada bajo este contrato faculta al ESTABLECIMIENTO para:
a) Bloquear permanentemente al CLIENTE de la plataforma de reservas en línea.
b) Ejercer las acciones legales civiles, mercantiles o penales conducentes para recuperar el monto disputado, más los intereses moratorios y recargos administrativos generados por la pasarela de pago.

CAPÍTULO X. VENTA DE PRODUCTOS COSMÉTICOS Y DE CUIDADO PERSONAL
10.1 Restricción Sanitaria en Devoluciones (COFEPRIS): Conforme a la regulación sanitaria vigente en la República Mexicana, los productos cosméticos, ceras, pomadas, aceites para barba, tónicos, lociones y shampoos no admiten cambio ni devolución una vez que su empaque, precinto de seguridad o contenido ha sido abierto o manipulado.
10.2 Defectos de Fabricación: Únicamente procederá el cambio de producto por defecto evidente de fábrica dentro de los tres (3) días naturales posteriores a la compra, presentando el ticket original y el producto íntegro en su empaque original sin muestras de uso.

CAPÍTULO XI. DERECHO DE ADMISIÓN, HIGIENE Y NORMAS DE CONDUCTA
11.1 Derecho de Admisión y Permanencia: En estricto apego al artículo 58 de la Ley Federal de Protección al Consumidor y con el propósito de garantizar la seguridad de la clientela y del personal, el ESTABLECIMIENTO se reserva el derecho de negar el acceso o suspender el servicio ante:
- Personas en evidente estado de ebriedad o bajo la influencia manifiesta de sustancias ilícitas o estupefacientes.
- Personas que muestren conductas violentas, agresiones verbales o físicas, hostigamiento, acoso o actitudes discriminatorias hacia clientes o colaboradores.
- Personas que presenten condiciones infectocontagiosas activas en cuero cabelludo o piel (ej. pediculosis/piojos, tiña o micosis avanzada) que vulneren las normas sanitarias del salón.

CAPÍTULO XII. RESPONSABILIDAD SOBRE OBJETOS PERSONALES
12.1 Custodia de Pertenencias: El cuidado y resguardo de prendas, bolsos, carteras, teléfonos móviles, joyería o cualquier otro objeto de valor es responsabilidad exclusiva del CLIENTE. El ESTABLECIMIENTO no se hace responsable por pérdidas, daños, robos u olvidos de pertenencias dentro de las instalaciones o estacionamientos.

CAPÍTULO XIII. DERECHOS DE IMAGEN Y FOTOGRAFÍA EN REDES SOCIALES
13.1 Fotografías y Videos Promocionales: El CLIENTE podrá ser invitado por el profesional a fotografiarse o grabarse al finalizar el servicio para exhibir el corte en las redes sociales oficiales de VATOS ALFA (Instagram, TikTok, Facebook).
13.2 Carácter Voluntario y Revocable: Dichas tomas son 100% voluntarias. El CLIENTE tiene el derecho inalienable de manifestar su negativa verbal en cualquier momento, en cuyo caso no se realizará captura audiovisual alguna de su persona.

CAPÍTULO XIV. CASO FORTUITO Y FUERZA MAYOR
14.1 Eximente de Responsabilidad Operativa: Ninguna de las partes será responsable por retrasos o cancelaciones derivados de eventos imprevisibles fuera del control razonable de la empresa, tales como interrupciones intempestivas del fluido eléctrico por CFE, cortes del suministro de agua potable, sismos, inundaciones o disposiciones sanitarias de autoridades gubernamentales. En tales eventos, se reagendará la cita con carácter prioritario sin cobro de penalización alguna.

CAPÍTULO XV. LEGISLACIÓN APLICABLE, ATENCIÓN A QUEJAS Y JURISDICCIÓN
15.1 Canal Interno de Conciliación Directa: Antes de acudir a cualquier instancia administrativa o jurisdiccional, el CLIENTE y el ESTABLECIMIENTO acuerdan agotar de buena fe la resolución de controversias a través del canal oficial de atención a clientes (contacto@vatosalfa.com o vía WhatsApp corporativo).
15.2 Jurisdicción Territorial: Para la interpretación, resolución de disputas y cumplimiento de los presentes Términos y Condiciones, las partes se someten expresamente a las leyes federales de los Estados Unidos Mexicanos, a la competencia de la Procuraduría Federal del Consumidor (PROFECO) en su ámbito administrativo, y a la jurisdicción de los Tribunales Competentes de la ciudad de Santiago de Querétaro, Estado de Querétaro, renunciando expresamente a cualquier otro fuero que pudiera corresponderles por razón de sus domicilios presentes o futuros.

CAPÍTULO XVI. PROGRAMA DE LEALTAD "PASE ALFA CLUB" Y BASES PARTICULARES DE PROMOCIONES
16.1 Naturaleza del Programa: El ESTABLECIMIENTO pone a disposición de sus clientes el programa de recompensas y membresía digital "Pase Alfa Club" a través de su plataforma web y aplicación móvil oficial.
16.2 Carácter Personal e Intransferible: Los sellos de visita acumulados, AlfaCoins, beneficios, cortesías y niveles VIP están indisolublemente vinculados al número de teléfono celular registrado por el CLIENTE. Son estrictamente personales, no transferibles a terceros y bajo ninguna circunstancia serán canjeables, reembolsables ni liquidables en dinero en efectivo ni transferencia bancaria.
16.3 Bases, Requisitos y Términos Particulares Independientes: Toda recompensa, cortesía (incluyendo, de manera enunciativa más no limitativa, la 10ª visita gratis, el beneficio de cumpleaños, cortesías de bienvenida o cupones de descuento temporal) se rige de forma estricta por sus propias Bases y Condiciones Particulares publicadas y consultables de manera individual e independiente en la ficha técnica de cada beneficio en la web o app móvil.
16.4 Prevalencia de Bases Específicas: En caso de cualquier duda o discrepancia operativa entre las reglas generales y la mecánica específica de un beneficio o promoción, prevalecerán en todo momento las Bases y Términos Particulares vigentes publicados en la tarjeta del beneficio correspondiente.
16.5 Modificación de Recompensas: El ESTABLECIMIENTO se reserva el derecho de ajustar, sustituir o dar por concluido el catálogo de promociones y beneficios conforme a las fechas de vigencia publicadas en la plataforma, respetando siempre los beneficios formalmente canjeados con anterioridad por el CLIENTE.`;

async function updateTerms() {
  try {
    await db.collection('settings').doc('website').set({
      termsText: termsDocument
    }, { merge: true });
    console.log('SUCCESS: settings/website updated successfully with full 15-chapter terms.');
    process.exit(0);
  } catch (err) {
    console.error('ERROR updating settings/website:', err);
    process.exit(1);
  }
}

updateTerms();

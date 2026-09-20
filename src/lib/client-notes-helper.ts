/**
 * Utilidad para interpretar notas del expediente del cliente en recepción.
 * Permite detectar si un cliente requiere tiempos de atención personalizados
 * (por ejemplo, cabello difícil, corte más detallado o especificaciones por barbero).
 */

/**
 * Analiza las notas de un cliente para extraer duraciones personalizadas en minutos.
 *
 * Ejemplos que detecta:
 * - "Lupita realiza este cliente en 45 min " -> 45 (si el barbero es Lupita)
 * - "Lupita se tarda 45 min" -> 45
 * - "45 min con Lupita" -> 45
 * - "Lupita 45 minutos" -> 45
 * - "Corte con Lupita en 45 min" -> 45
 * - "Se tarda 45 min por cabello difícil" -> 45
 * - "Cliente de 45 min" -> 45
 */
export function parseClientCustomDuration(
  notes: string | undefined | null,
  barberName?: string
): number | null {
  if (!notes || typeof notes !== 'string') return null;
  const cleanNotes = notes.trim();
  if (!cleanNotes) return null;

  const norm = (str: string) =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const normNotes = norm(cleanNotes);
  const normBarber = barberName ? norm(barberName.trim()) : '';

  // 1. Si se especificó un barbero (ej. "Lupita"), buscar patrones donde se asocie directamente a este barbero
  if (normBarber) {
    const barberSpecificPatterns = [
      new RegExp(`${normBarber}[^\\.\\n,]*?(\\d+)\\s*(?:min|minuto|m\\b)`, 'i'),
      new RegExp(`(\\d+)\\s*(?:min|minuto|m\\b)[^\\.\\n,]*?${normBarber}`, 'i'),
    ];

    for (const regex of barberSpecificPatterns) {
      const match = normNotes.match(regex);
      if (match && match[1]) {
        const mins = Number(match[1]);
        if (mins >= 10 && mins <= 240) return mins;
      }
    }
  }

  // 2. Si la nota menciona a OTRO barbero conocido pero NO a este barbero, no aplicar regla general
  const knownBarbers = ['lupita', 'beatriz', 'bety', 'ivon', 'lalo', 'eduardo', 'alfredo', 'cesar', 'angel'];
  const mentionsOtherBarbers = knownBarbers.filter(
    (b) => normNotes.includes(b) && (!normBarber || !normBarber.includes(b))
  );

  if (normBarber && mentionsOtherBarbers.length > 0 && !normNotes.includes(normBarber)) {
    return null;
  }

  // 3. Regla general para el cliente si la nota no está restringida a un barbero exclusivo
  const generalPatterns = [
    /(?:realiza|atiende|tarda|lleva|hace|dura|duracion|tiempo|corte)[^\.\n,]*?(\d+)\s*(?:min|minuto|m\b)/i,
    /(\d+)\s*(?:min|minuto|m\b)[^\.\n,]*?(?:corte|servicio|atencion)/i,
    /(?:duración|duracion|tiempo)\s*[:=]?\s*(\d+)\s*(?:min|minuto|m\b)/i,
  ];

  for (const regex of generalPatterns) {
    const match = normNotes.match(regex);
    if (match && match[1]) {
      const mins = Number(match[1]);
      if (mins >= 10 && mins <= 240) return mins;
    }
  }

  return null;
}

export interface CountryPhoneConfig {
  code: string;
  country: string;
  flag: string;
  label: string;
  minDigits: number;
  maxDigits: number;
  placeholder: string;
}

export const COUNTRY_PHONE_CODES: CountryPhoneConfig[] = [
  { code: '+52', country: 'México', flag: '🇲🇽', label: '🇲🇽 +52', minDigits: 10, maxDigits: 10, placeholder: '4421234567' },
  { code: '+1', country: 'EE.UU. / Canadá', flag: '🇺🇸', label: '🇺🇸 +1', minDigits: 10, maxDigits: 10, placeholder: '3055551234' },
  { code: '+506', country: 'Costa Rica', flag: '🇨🇷', label: '🇨🇷 +506', minDigits: 8, maxDigits: 8, placeholder: '72794782' },
  { code: '+57', country: 'Colombia', flag: '🇨🇴', label: '🇨🇴 +57', minDigits: 10, maxDigits: 10, placeholder: '3001234567' },
  { code: '+34', country: 'España', flag: '🇪🇸', label: '🇪🇸 +34', minDigits: 9, maxDigits: 9, placeholder: '612345678' },
  { code: '+54', country: 'Argentina', flag: '🇦🇷', label: '🇦🇷 +54', minDigits: 10, maxDigits: 11, placeholder: '91123456789' },
  { code: '+56', country: 'Chile', flag: '🇨🇱', label: '🇨🇱 +56', minDigits: 9, maxDigits: 9, placeholder: '912345678' },
  { code: '+51', country: 'Perú', flag: '🇵🇪', label: '🇵🇪 +51', minDigits: 9, maxDigits: 9, placeholder: '912345678' },
  { code: '+502', country: 'Guatemala', flag: '🇬🇹', label: '🇬🇹 +502', minDigits: 8, maxDigits: 8, placeholder: '51234567' },
  { code: '+503', country: 'El Salvador', flag: '🇸🇻', label: '🇸🇻 +503', minDigits: 8, maxDigits: 8, placeholder: '71234567' },
  { code: '+504', country: 'Honduras', flag: '🇭🇳', label: '🇭🇳 +504', minDigits: 8, maxDigits: 8, placeholder: '91234567' },
  { code: '+505', country: 'Nicaragua', flag: '🇳🇮', label: '🇳🇮 +505', minDigits: 8, maxDigits: 8, placeholder: '81234567' },
  { code: '+507', country: 'Panamá', flag: '🇵🇦', label: '🇵🇦 +507', minDigits: 7, maxDigits: 8, placeholder: '61234567' },
  { code: '+58', country: 'Venezuela', flag: '🇻🇪', label: '🇻🇪 +58', minDigits: 10, maxDigits: 10, placeholder: '4121234567' },
  { code: '+593', country: 'Ecuador', flag: '🇪🇨', label: '🇪🇨 +593', minDigits: 9, maxDigits: 9, placeholder: '991234567' },
  { code: '+55', country: 'Brasil', flag: '🇧🇷', label: '🇧🇷 +55', minDigits: 10, maxDigits: 11, placeholder: '11912345678' },
  { code: '+33', country: 'Francia', flag: '🇫🇷', label: '🇫🇷 +33', minDigits: 9, maxDigits: 9, placeholder: '612345678' },
  { code: '+49', country: 'Alemania', flag: '🇩🇪', label: '🇩🇪 +49', minDigits: 10, maxDigits: 11, placeholder: '15123456789' },
  { code: '+44', country: 'Reino Unido', flag: '🇬🇧', label: '🇬🇧 +44', minDigits: 10, maxDigits: 10, placeholder: '7911123456' },
  { code: '+39', country: 'Italia', flag: '🇮🇹', label: '🇮🇹 +39', minDigits: 9, maxDigits: 10, placeholder: '3123456789' },
  { code: 'OTHER', country: 'Otro País (Código + Número)', flag: '🌐', label: '🌐 +Otro', minDigits: 8, maxDigits: 15, placeholder: 'Ej: 50672794782' },
];

const SORTED_KNOWN_CODES = COUNTRY_PHONE_CODES
  .filter((c) => c.code !== 'OTHER')
  .sort((a, b) => b.code.length - a.code.length);

export function getCountryPhoneConfig(countryCode: string): CountryPhoneConfig {
  return COUNTRY_PHONE_CODES.find((c) => c.code === countryCode) || COUNTRY_PHONE_CODES[0];
}

/**
 * Construye el valor de teléfono para almacenar en base de datos / estado:
 * - Para México (+52): guarda exactamente los 10 dígitos sin prefijo (ej. "4421234567") para mantener 100% compatibilidad.
 * - Para extranjero: guarda con prefijo '+' + código de país + número (ej. "+50672794782").
 */
export function buildStoredPhone(countryCode: string, localDigits: string): string {
  const digits = String(localDigits || '').replace(/\D/g, '');
  if (!digits) return '';
  if (countryCode === '+52') {
    return digits.slice(0, 10);
  }
  if (countryCode === 'OTHER') {
    return `+${digits.slice(0, 15)}`;
  }
  const config = getCountryPhoneConfig(countryCode);
  return `${countryCode}${digits.slice(0, config.maxDigits)}`;
}

/**
 * Descompone un teléfono almacenado en { countryCode, localDigits }.
 */
export function parseStoredPhone(storedPhone?: string | null): { countryCode: string; localDigits: string } {
  if (!storedPhone) return { countryCode: '+52', localDigits: '' };
  const trimmed = String(storedPhone).trim();
  const allDigits = trimmed.replace(/\D/g, '');
  if (!allDigits) return { countryCode: '+52', localDigits: '' };

  if (trimmed.startsWith('+')) {
    const normalizedPlus = `+${allDigits}`;
    for (const c of SORTED_KNOWN_CODES) {
      if (normalizedPlus.startsWith(c.code)) {
        const rest = normalizedPlus.slice(c.code.length);
        return { countryCode: c.code, localDigits: rest.slice(0, c.maxDigits) };
      }
    }
    return { countryCode: 'OTHER', localDigits: allDigits.slice(0, 15) };
  }

  // Si no empieza con '+' y tiene <= 10 dígitos, es número mexicano estándar
  if (allDigits.length <= 10) {
    return { countryCode: '+52', localDigits: allDigits };
  }

  // Si tiene 12 dígitos y empieza con 52, es mexicano con lada internacional
  if ((allDigits.length === 12 && allDigits.startsWith('52')) || (allDigits.length === 13 && allDigits.startsWith('521'))) {
    return { countryCode: '+52', localDigits: allDigits.slice(-10) };
  }

  // Intentar detectar si coincide con algún país conocido (ej. 50672794782 -> +506 y 8 dígitos)
  const withPlus = `+${allDigits}`;
  for (const c of SORTED_KNOWN_CODES) {
    if (c.code !== '+52' && withPlus.startsWith(c.code)) {
      const rest = withPlus.slice(c.code.length);
      if (rest.length >= c.minDigits && rest.length <= c.maxDigits) {
        return { countryCode: c.code, localDigits: rest };
      }
    }
  }

  return { countryCode: 'OTHER', localDigits: allDigits.slice(0, 15) };
}

/**
 * Procesa lo que el usuario escribe o pega en el input de teléfono.
 * Si pega un número con '+' (ej. "+506 72794782"), detecta automáticamente el país.
 */
export function handlePhoneInputChange(
  rawInputValue: string,
  currentCountryCode: string
): { countryCode: string; localDigits: string; storedPhone: string } {
  const trimmed = String(rawInputValue || '').trim();

  if (trimmed.startsWith('+')) {
    const allDigits = trimmed.replace(/\D/g, '');
    const normalizedPlus = `+${allDigits}`;
    for (const c of SORTED_KNOWN_CODES) {
      if (normalizedPlus.startsWith(c.code) && allDigits.length > c.code.length - 1) {
        const rest = normalizedPlus.slice(c.code.length).slice(0, c.maxDigits);
        return {
          countryCode: c.code,
          localDigits: rest,
          storedPhone: buildStoredPhone(c.code, rest),
        };
      }
    }
    const cleanOther = allDigits.slice(0, 15);
    return {
      countryCode: 'OTHER',
      localDigits: cleanOther,
      storedPhone: buildStoredPhone('OTHER', cleanOther),
    };
  }

  const config = getCountryPhoneConfig(currentCountryCode);
  const digits = trimmed.replace(/\D/g, '').slice(0, config.maxDigits);
  return {
    countryCode: currentCountryCode,
    localDigits: digits,
    storedPhone: buildStoredPhone(currentCountryCode, digits),
  };
}

/**
 * Valida si un teléfono (nacional o extranjero) es válido y está completo.
 */
export function isValidPhoneNumber(storedPhone?: string | null, explicitCountryCode?: string, explicitLocalDigits?: string): boolean {
  const { countryCode, localDigits } =
    explicitCountryCode !== undefined && explicitLocalDigits !== undefined
      ? { countryCode: explicitCountryCode, localDigits: explicitLocalDigits }
      : parseStoredPhone(storedPhone);

  const digits = String(localDigits || '').replace(/\D/g, '');
  if (!digits) return false;

  const config = getCountryPhoneConfig(countryCode);
  if (digits.length < config.minDigits || digits.length > config.maxDigits) {
    return false;
  }

  // Rechazar números falsos con todos los dígitos iguales (ej. 0000000000 o 99999999)
  if (/^(\d)\1{6,}$/.test(digits)) {
    return false;
  }

  return true;
}

/**
 * Formatea cualquier teléfono almacenado para enlaces wa.me/ y API de WhatsApp:
 * - Si es mexicano de 10 dígitos ("4421234567") -> "524421234567"
 * - Si es extranjero ("+50672794782") -> "50672794782"
 */
export function formatPhoneForWhatsApp(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const trimmed = String(rawPhone).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  if (trimmed.startsWith('+')) {
    return digits;
  }

  if (digits.length === 10) {
    return '52' + digits;
  }

  return digits;
}

/**
 * Normaliza un teléfono para búsquedas y comparaciones en Firestore (clientes y reservas).
 * Soporta tanto números mexicanos de 10 dígitos como números extranjeros (+50672794782).
 */
export function normalizePhoneForLookup(rawPhone?: string | null): {
  primary: string;
  variants: string[];
  isValid: boolean;
} {
  if (!rawPhone) return { primary: '', variants: [], isValid: false };
  const trimmed = String(rawPhone).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return { primary: '', variants: [], isValid: false };

  const { countryCode, localDigits } = parseStoredPhone(trimmed);
  const valid = isValidPhoneNumber(trimmed, countryCode, localDigits);

  if (countryCode === '+52') {
    const last10 = localDigits.slice(-10);
    if (last10.length !== 10) {
      return { primary: last10, variants: last10 ? [last10] : [], isValid: false };
    }
    const variants = Array.from(new Set([
      last10,
      `+52${last10}`,
      `+52 ${last10}`,
      `52${last10}`,
      trimmed,
    ]));
    return { primary: last10, variants, isValid: valid };
  }

  // Número internacional
  const fullDigits = countryCode === 'OTHER' ? localDigits : `${countryCode.replace(/\D/g, '')}${localDigits}`;
  const plusFormat = `+${fullDigits}`;
  const variants = Array.from(new Set([
    plusFormat,
    fullDigits,
    trimmed,
  ]));
  return { primary: plusFormat, variants, isValid: valid };
}

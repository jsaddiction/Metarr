/**
 * Language Name Utilities
 *
 * Converts ISO 639-1 language codes to full language names for display.
 * Database stores ISO codes (e.g., "en"), UI displays full names (e.g., "English").
 */

/**
 * ISO 639-1 language code to full language name mapping
 * Covers the most common languages found in movie metadata
 */
const LANGUAGE_NAMES: Record<string, string> = {
  // Major languages
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',

  // European languages
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  el: 'Greek',
  tr: 'Turkish',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sk: 'Slovak',
  sl: 'Slovenian',
  sr: 'Serbian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',

  // Asian languages
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  tl: 'Tagalog',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  mr: 'Marathi',
  ur: 'Urdu',
  fa: 'Persian',
  he: 'Hebrew',

  // Other languages
  ca: 'Catalan',
  eu: 'Basque',
  gl: 'Galician',
  cy: 'Welsh',
  ga: 'Irish',
  is: 'Icelandic',
  mt: 'Maltese',
  sq: 'Albanian',
  mk: 'Macedonian',
  bs: 'Bosnian',
  kk: 'Kazakh',
  hy: 'Armenian',
  ka: 'Georgian',
  az: 'Azerbaijani',
  sw: 'Swahili',
  af: 'Afrikaans',

  // Less common but sometimes seen
  la: 'Latin',
  sa: 'Sanskrit',
  eo: 'Esperanto',
  vo: 'Volapük',
  io: 'Ido',
  ia: 'Interlingua',
};

/**
 * Converts an ISO 639-1 language code to its full language name
 *
 * @param isoCode - Two-letter ISO 639-1 language code (e.g., "en", "ja", "fr")
 * @returns Full language name, or "Unknown" if code is null/not found, or uppercase code as fallback
 *
 * @example
 * getLanguageName('en') // => "English"
 * getLanguageName('ja') // => "Japanese"
 * getLanguageName(null) // => "Unknown"
 * getLanguageName('xyz') // => "XYZ" (fallback for unknown codes)
 */
export function getLanguageName(isoCode: string | null | undefined): string {
  if (!isoCode) {
    return 'Unknown';
  }

  const code = isoCode.toLowerCase();
  return LANGUAGE_NAMES[code] || isoCode.toUpperCase();
}

/**
 * Converts multiple ISO codes to language names
 *
 * @param isoCodes - Array of ISO 639-1 language codes
 * @returns Array of full language names
 *
 * @example
 * getLanguageNames(['en', 'fr', 'ja'])
 * // => ["English", "French", "Japanese"]
 */
export function getLanguageNames(isoCodes: (string | null)[]): string[] {
  return isoCodes.map((code) => getLanguageName(code));
}

/**
 * Gets all supported language codes
 *
 * @returns Array of ISO 639-1 language codes
 */
export function getSupportedLanguageCodes(): string[] {
  return Object.keys(LANGUAGE_NAMES);
}

/**
 * Checks if a language code is supported
 *
 * @param isoCode - ISO 639-1 language code to check
 * @returns true if the code is in the mapping, false otherwise
 */
export function isLanguageSupported(isoCode: string | null | undefined): boolean {
  if (!isoCode) {
    return false;
  }
  return isoCode.toLowerCase() in LANGUAGE_NAMES;
}

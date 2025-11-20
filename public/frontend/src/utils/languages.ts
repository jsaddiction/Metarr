/**
 * Language name utilities for frontend display
 * Converts ISO 639-1 codes to full language names
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

  // Asian languages
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  ur: 'Urdu',
  fa: 'Persian',
  he: 'Hebrew',

  // Other
  ca: 'Catalan',
  ga: 'Irish',
  is: 'Icelandic',
  sw: 'Swahili',
  af: 'Afrikaans',
};

/**
 * Converts an ISO 639-1 language code to its full name
 *
 * @param isoCode - Two-letter ISO 639-1 language code
 * @returns Full language name, "Unknown" if null, or uppercase code if not found
 *
 * @example
 * getLanguageName('en') // => "English"
 * getLanguageName('ja') // => "Japanese"
 * getLanguageName(null) // => "Unknown"
 * getLanguageName('xyz') // => "XYZ"
 */
export function getLanguageName(isoCode: string | null | undefined): string {
  if (!isoCode) {
    return 'Unknown';
  }

  const code = isoCode.toLowerCase();
  return LANGUAGE_NAMES[code] || isoCode.toUpperCase();
}

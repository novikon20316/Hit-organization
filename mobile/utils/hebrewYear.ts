// utils/hebrewYear.ts
// Converts a Gregorian academic-year label (e.g. "2024-2025", as stored on
// project.academicYear) into its Hebrew-calendar year letters (e.g.
// "תשפ״ה"). Ports web/lib/hebrewYear.ts's academicYearToHebrew — see that
// file's comments for why the fixed +3761 offset is exact for this use case.

const HUNDREDS: Record<number, string> = {
  100: 'ק', 200: 'ר', 300: 'ש', 400: 'ת',
  500: 'תק', 600: 'תר', 700: 'תש', 800: 'תת', 900: 'תתק',
};
const TENS: Record<number, string> = { 10: 'י', 20: 'כ', 30: 'ל', 40: 'מ', 50: 'נ', 60: 'ס', 70: 'ע', 80: 'פ', 90: 'צ' };
const UNITS: Record<number, string> = { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט' };

function numberToHebrewLetters(num: number): string {
  if (num <= 0 || num >= 1000) return '';
  let remaining = num;
  let letters = '';

  const hundreds = Math.floor(remaining / 100) * 100;
  if (hundreds > 0) {
    letters += HUNDREDS[hundreds];
    remaining -= hundreds;
  }

  // 15/16 are written ט"ו / ט"ז rather than combining י with ה/ו, which
  // would spell a name of God — a standard convention in Hebrew numbering.
  if (remaining === 15) return letters + 'טו';
  if (remaining === 16) return letters + 'טז';

  const tens = Math.floor(remaining / 10) * 10;
  if (tens > 0) {
    letters += TENS[tens];
    remaining -= tens;
  }
  if (remaining > 0) {
    letters += UNITS[remaining];
  }
  return withFinalForm(letters);
}

const FINAL_FORMS: Record<string, string> = { כ: 'ך', מ: 'ם', נ: 'ן', פ: 'ף', צ: 'ץ' };

function withFinalForm(letters: string): string {
  if (letters.length === 0) return letters;
  const last = letters[letters.length - 1];
  return FINAL_FORMS[last] ? letters.slice(0, -1) + FINAL_FORMS[last] : letters;
}

function withPunctuation(letters: string): string {
  if (letters.length === 0) return letters;
  if (letters.length === 1) return `${letters}׳`;
  return `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}

/**
 * @param academicYear e.g. "2024-2025" (or any string containing a 4-digit
 *   start year). Returns null when no year can be parsed out.
 */
export function academicYearToHebrew(academicYear: string | null | undefined): string | null {
  if (!academicYear) return null;
  const match = academicYear.match(/\d{4}/);
  if (!match) return null;

  const startYear = parseInt(match[0], 10);
  const hebrewYear = startYear + 3761;
  const letters = numberToHebrewLetters(hebrewYear % 1000);
  if (!letters) return null;

  return withPunctuation(letters);
}

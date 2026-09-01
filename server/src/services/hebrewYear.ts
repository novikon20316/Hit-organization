// src/services/hebrewYear.ts
// Converts a Gregorian academic-year label (e.g. "2024-2025", as stored on
// project.academicYear) into its Hebrew-calendar year letters (e.g. "תשפ״ה").
// Ported from web/lib/hebrewYear.ts (this repo doesn't share code between
// server/web/mobile — each surface keeps its own copy of small pure utils).
//
// An academic year starting in Gregorian year Y runs from ~September Y
// through the following summer, entirely inside Hebrew year Y+3761 (Rosh
// Hashanah of that Hebrew year falls in Sept/Oct of Y, and the next one
// doesn't arrive until Sept/Oct of Y+1) — so a single fixed offset is exact
// for this use case, no calendar-library dependency needed.

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
  if (remaining === 15) {
    letters += 'טו';
    return letters;
  }
  if (remaining === 16) {
    letters += 'טז';
    return letters;
  }

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

// The last letter of the whole numeral takes its final (sofit) form when
// one exists — e.g. 5780 is ת-ש-פ but written תש״ף, not תש״פ.
const FINAL_FORMS: Record<string, string> = { כ: 'ך', מ: 'ם', נ: 'ן', פ: 'ף', צ: 'ץ' };

function withFinalForm(letters: string): string {
  if (letters.length === 0) return letters;
  const last = letters[letters.length - 1] ?? '';
  const final = FINAL_FORMS[last];
  return final ? letters.slice(0, -1) + final : letters;
}

function withPunctuation(letters: string): string {
  if (letters.length === 0) return letters;
  if (letters.length === 1) return `${letters}׳`; // geresh, e.g. ה׳
  return `${letters.slice(0, -1)}״${letters.slice(-1)}`; // gershayim, e.g. תשפ״ה
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

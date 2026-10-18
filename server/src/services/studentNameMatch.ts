// src/services/studentNameMatch.ts
//
// Tolerant "is this the same person" check between the name on the approved-
// students roster (always Hebrew, as the faculty uploaded it) and the name a
// student typed at signup — which, on live data (2026-10-15), real students
// typed in ENGLISH 6 times out of 8. So an exact or same-script comparison
// would lock most real students out.
//
// Each name part is reduced to a consonant "sound skeleton" that is the same
// for Hebrew and Latin spellings — e.g. "נוביק" and "Novik" both → NVK,
// "כהן" and "Cohen" both → KN. Vowels, silent letters (א ה ע י) and doubled
// letters are dropped, and sound-alike classes (ב/v/w, פ/f/p, כ/ק/c/k/q) are
// merged. A name matches when AT LEAST ONE part (first or last name) of the
// roster name sound-matches a typed part — chosen with the user. On live data
// (2026-10-15): every real student who had already registered passes (8/8),
// and only 1 of 80 wrong (student, someone else's roster entry) pairings
// passes, from a shared common name part. Parts whose skeleton is a single
// consonant don't count on their own (too many names collapse to one letter).

const HEBREW_CLASS: Record<string, string> = {
  'ב': 'V', 'ג': 'G', 'ד': 'D', 'ה': '', 'ו': 'V', 'ז': 'Z', 'ח': 'H', 'ט': 'T',
  'י': '', 'כ': 'K', 'ך': 'K', 'ל': 'L', 'מ': 'M', 'ם': 'M', 'נ': 'N', 'ן': 'N',
  'ס': 'S', 'ע': '', 'פ': 'P', 'ף': 'P', 'צ': 'C', 'ץ': 'C', 'ק': 'K', 'ר': 'R',
  'ש': 'S', 'ת': 'T', 'א': '',
};

function latinSkeleton(word: string): string {
  return word.toLowerCase()
    .replace(/sch|sh/g, 'S')
    .replace(/ch|kh/g, 'H')
    .replace(/tz|ts/g, 'C')
    .replace(/z/g, 'Z')
    .replace(/ph|f|p/g, 'P')
    .replace(/w|v|b/g, 'V')
    .replace(/ck|q|k/g, 'K')
    .replace(/c(?=[aou]|$)/g, 'K')
    .replace(/c/g, 'S')
    .replace(/x/g, 'KS')
    .replace(/[aeiouyhj]/g, '')
    .replace(/[a-z]/g, (m) => m.toUpperCase());
}

function hebrewSkeleton(word: string): string {
  return [...word].map((c) => HEBREW_CLASS[c] ?? '').join('');
}

/** Consonant sound skeleton of one name part, same alphabet for both scripts. */
export function nameSkeleton(word: string): string {
  const cleaned = word.normalize('NFKC').replace(/[֑-ׇ]/g, ''); // strip niqqud
  const raw = /[א-ת]/.test(cleaned) ? hebrewSkeleton(cleaned) : latinSkeleton(cleaned);
  return raw.replace(/(.)\1+/g, '$1'); // "Cohenn" / "ממן" doubled letters
}

function nameParts(name: string): string[] {
  return name.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}

function partsSoundAlike(a: string, b: string): boolean {
  const x = nameSkeleton(a);
  const y = nameSkeleton(b);
  if (x.length < 2 || y.length < 2) return false;
  // Exact skeleton match. Allowing one sound of slack was tried and let more
  // unrelated pairs through on live data (3/80 vs 1/80) for no extra true
  // matches — the skeleton already absorbs spelling variants.
  return x === y;
}

/** True when at least one part of the roster name sound-matches a part of
 *  any of the names the student typed (displayName / He / En). */
export function nameMatchesRoster(rosterFullName: string, typedNames: Array<string | null | undefined>): boolean {
  const rosterParts = nameParts(rosterFullName);
  const typedParts = typedNames.filter((n): n is string => typeof n === 'string').flatMap(nameParts);
  return rosterParts.some((r) => typedParts.some((t) => partsSoundAlike(r, t)));
}

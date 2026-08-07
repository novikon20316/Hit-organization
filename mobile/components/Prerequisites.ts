// components/Prerequisites.ts
//
// Client-side mirror of server/src/services/prerequisites.ts and
// web/lib/prerequisites.ts — mobile's Browseprojects.tsx reads project docs
// straight off a live Firestore listener, not through a server endpoint, so
// there's no backend layer to normalize legacy data on the way out. A
// project created before minGrade shipped still has `prerequisites` as a
// plain string[] in Firestore; normalizePrerequisites accepts both shapes so
// callers never have to branch on which one they got.

export interface PrerequisiteSpec {
  subject: string;
  minGrade?: number;
}

export function normalizePrerequisites(raw: unknown): PrerequisiteSpec[] {
  if (!Array.isArray(raw)) return [];
  const result: PrerequisiteSpec[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      const subject = entry.trim();
      if (subject) result.push({ subject });
      continue;
    }
    if (entry && typeof entry === 'object' && typeof (entry as { subject?: unknown }).subject === 'string') {
      const subject = ((entry as { subject: string }).subject).trim();
      if (!subject) continue;
      const rawGrade = (entry as { minGrade?: unknown }).minGrade;
      const minGrade = typeof rawGrade === 'number' && Number.isFinite(rawGrade) && rawGrade >= 0 && rawGrade <= 100
        ? rawGrade
        : undefined;
      result.push(minGrade != null ? { subject, minGrade } : { subject });
    }
  }
  return result;
}

/** Renders one prerequisite for display, e.g. "Computer Science (min grade: 80)". */
export function formatPrerequisite(p: PrerequisiteSpec, lang: 'he' | 'en'): string {
  if (p.minGrade == null) return p.subject;
  return lang === 'he' ? `${p.subject} (ציון מינימלי: ${p.minGrade})` : `${p.subject} (min grade: ${p.minGrade})`;
}

// src/services/prerequisites.ts
//
// A project's prerequisites — course subjects a student must have completed
// (optionally with a minimum grade) to be eligible to apply. Structured as
// {subject, minGrade?} rather than a bare course-name string so a supervisor
// can require e.g. "Computer Science, minimum grade 80" instead of just
// listing the course name with no threshold. minGrade is per-subject and
// optional — omitted means "must have taken this course," no grade
// threshold — see PrerequisitesEditor.tsx (web) / NewProjectModal.tsx
// (mobile).
//
// Every project created before this shipped stored prerequisites as a plain
// string[] (just course names) — normalizePrerequisites accepts both shapes
// so nothing already in Firestore needs a migration.

export interface PrerequisiteSpec {
  subject: string;
  minGrade?: number;
}

/** Normalizes raw prerequisites input (new {subject, minGrade?}[] shape, the
 *  legacy plain string[] shape, or anything untrusted from a request body)
 *  into structured PrerequisiteSpec[]. Drops entries with an empty/missing
 *  subject; keeps minGrade only when it's a finite number in [0, 100]. */
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

/** Renders one prerequisite for display or an AI prompt, e.g.
 *  "Computer Science (min grade: 80)" — just the subject when no threshold
 *  was set. */
export function formatPrerequisite(p: PrerequisiteSpec, lang: 'he' | 'en' = 'en'): string {
  if (p.minGrade == null) return p.subject;
  return lang === 'he' ? `${p.subject} (ציון מינימלי: ${p.minGrade})` : `${p.subject} (min grade: ${p.minGrade})`;
}

// app/faculty_admin/templates/types.ts
// Matches the real backend schema (server/src/controllers/facultyTemplateController.ts)
// — a project/thesis proposal catalog entry, not a milestone template (see
// app/workflow-templates/types.ts for that unrelated concept).

export type TemplateDegree = 'bachelors' | 'masters';
export type TemplateType = 'project' | 'thesis';
export type TemplateStatus = 'approved' | 'published' | 'pending' | 'rejected';

export interface FacultyTemplate {
  id: string;
  facultyId: string;
  titleHe: string;
  titleEn: string;
  descriptionHe: string;
  descriptionEn: string;
  skills: string;
  degree: TemplateDegree;
  type: TemplateType;
  supervisorId: string;
  createdBy: string;
  status: TemplateStatus;
  rejectionReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const DEGREES: { key: TemplateDegree; he: string; en: string }[] = [
  { key: 'bachelors', he: 'תואר ראשון', en: "Bachelor's" },
  { key: 'masters', he: 'תואר שני', en: "Master's" },
];

export const TYPES: { key: TemplateType; he: string; en: string }[] = [
  { key: 'project', he: 'פרויקט', en: 'Project' },
  { key: 'thesis', he: 'תזה', en: 'Thesis' },
];

export function degreeLabel(degree: TemplateDegree, lang: 'he' | 'en'): string {
  return DEGREES.find((d) => d.key === degree)?.[lang] ?? degree;
}

export function typeLabel(type: TemplateType, lang: 'he' | 'en'): string {
  return TYPES.find((t) => t.key === type)?.[lang] ?? type;
}

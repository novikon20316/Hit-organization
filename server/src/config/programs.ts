// src/config/programs.ts
// Which degrees each program (major) is offered in, with its Hebrew name —
// mirrors web/lib/faculties.ts's HIT_FACULTIES programs (keep in sync). Used
// where the server must describe programs to people, e.g. the per-faculty
// student-roster template (services/rosterTemplate.ts).

export interface ProgramInfo {
  facultyId: string;
  major: string;
  degreeType: 'bachelors' | 'masters';
  labelHe: string;
}

export const FACULTY_LABEL_HE: Record<string, string> = {
  sciences: 'הפקולטה למדעים',
  electrical: 'הפקולטה להנדסת חשמל ואלקטרוניקה',
  industrial: 'הפקולטה להנדסת תעשייה וניהול טכנולוגיה',
  learning_tech: 'הפקולטה לטכנולוגיות למידה',
  medical_tech: 'הפקולטה לטכנולוגיות רפואיות',
  design: 'הפקולטה לעיצוב',
  data_science: 'המחלקה למדעי הנתונים',
};

export const PROGRAMS: ProgramInfo[] = [
  { facultyId: 'sciences', major: 'computer_science', degreeType: 'bachelors', labelHe: 'B.Sc במדעי המחשב' },
  { facultyId: 'sciences', major: 'applied_mathematics', degreeType: 'bachelors', labelHe: 'B.Sc במתמטיקה שימושית' },
  { facultyId: 'sciences', major: 'computer_science', degreeType: 'masters', labelHe: 'M.Sc במדעי המחשב' },
  { facultyId: 'electrical', major: 'electrical_engineering', degreeType: 'bachelors', labelHe: 'B.Sc בהנדסת חשמל ואלקטרוניקה' },
  { facultyId: 'electrical', major: 'electrical_engineering', degreeType: 'masters', labelHe: 'M.Sc בהנדסת חשמל ואלקטרוניקה' },
  { facultyId: 'industrial', major: 'industrial_engineering_management', degreeType: 'bachelors', labelHe: 'B.Sc בהנדסת תעשייה וניהול' },
  { facultyId: 'industrial', major: 'technology_management', degreeType: 'bachelors', labelHe: 'B.Sc בניהול טכנולוגיה' },
  { facultyId: 'industrial', major: 'technology_management', degreeType: 'masters', labelHe: 'M.Sc בניהול טכנולוגיה' },
  { facultyId: 'learning_tech', major: 'instructional_technologies', degreeType: 'bachelors', labelHe: 'B.A בטכנולוגיות למידה' },
  { facultyId: 'learning_tech', major: 'instructional_technologies', degreeType: 'masters', labelHe: 'M.A בטכנולוגיות למידה' },
  { facultyId: 'medical_tech', major: 'digital_medical_technologies', degreeType: 'bachelors', labelHe: 'B.Sc בטכנולוגיות דיגיטליות ברפואה' },
  { facultyId: 'design', major: 'industrial_design', degreeType: 'bachelors', labelHe: 'B.Des בעיצוב תעשייתי' },
  { facultyId: 'design', major: 'interior_design', degreeType: 'bachelors', labelHe: 'B.Des בעיצוב פנים' },
  { facultyId: 'design', major: 'visual_communication_design', degreeType: 'bachelors', labelHe: 'B.Des בעיצוב תקשורת חזותית' },
  { facultyId: 'design', major: 'design_for_technological_environment', degreeType: 'masters', labelHe: 'M.Des בעיצוב לסביבה טכנולוגית' },
  { facultyId: 'data_science', major: 'data_science', degreeType: 'masters', labelHe: 'M.Sc במדעי הנתונים' },
];

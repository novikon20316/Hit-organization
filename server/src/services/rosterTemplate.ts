// src/services/rosterTemplate.ts
//
// Builds the approved-students roster import template (.xlsx) live, scoped
// to whoever downloads it: a system_admin picks a faculty; a coordinator gets
// their own faculty, narrowed to the programs their coordinatorScopes cover
// (a CS coordinator gets only computer_science, a design coordinator only
// design's programs). Milestone counts and names come from the faculty's
// current workflow templates (getActiveMilestonesFor — the same resolution
// the import and the enrollment use), so the file never goes stale.
//
// Layout must stay in step with studentRoster.ts's importer: sheet 1
// "Students" holds only the header row (column names are the import keys);
// guidance lives in header notes, input prompts, and the Instructions /
// Programs sheets. Validation + conditional formatting grey out the
// in-progress columns unless InProgress = YES, and milestone columns beyond
// the row's program.

import ExcelJS from 'exceljs';
import type { AuthUser } from './scopeAuthorization.js';
import { PROGRAMS, FACULTY_LABEL_HE, type ProgramInfo } from '../config/programs.js';
import { deriveProcessType, findApprovedTemplateId, getActiveMilestonesFor, type ProcessType } from './workflowTemplates.js';

const LAST_ROW = 5001; // header + MAX_IMPORT_ROWS (5000)
const NAVY = 'FF1F3A8A';
const TEAL = 'FF0F766E';
const FONT = 'Arial';
const TRACK_HE: Record<ProcessType, string> = {
  bsc_project: 'תואר ראשון – פרויקט',
  msc_project: 'תואר שני – פרויקט',
  msc_thesis: 'תואר שני – תזה',
};

export interface RosterTemplateScope {
  facultyId: string;
  programs: ProgramInfo[];
  /** Tracks offered per masters program (a scope may limit thesis/project). */
  tracksFor: (p: ProgramInfo) => ('project' | 'thesis')[];
}

/** Which faculty/programs this user's template covers. Throws a message for
 *  the client on a bad/missing faculty. */
export function resolveRosterTemplateScope(user: AuthUser, requestedFacultyId: string | undefined, asAdmin: boolean): RosterTemplateScope {
  const facultyId = asAdmin ? (requestedFacultyId ?? '') : (user.facultyId ?? '');
  if (!FACULTY_LABEL_HE[facultyId]) throw new Error(asAdmin ? 'Choose a faculty.' : 'Your account has no faculty assigned.');
  const facultyPrograms = PROGRAMS.filter((p) => p.facultyId === facultyId);
  const scopes = asAdmin ? [] : (user.coordinatorScopes ?? []).filter((s) => s.facultyId === facultyId);
  const matching = (p: ProgramInfo) => scopes.filter((s) => (!s.major || s.major === p.major) && (!s.degreeLevel || s.degreeLevel === p.degreeType));
  const scoped = scopes.length ? facultyPrograms.filter((p) => matching(p).length > 0) : facultyPrograms;
  const programs = scoped.length ? scoped : facultyPrograms;
  const tracksFor = (p: ProgramInfo): ('project' | 'thesis')[] => {
    if (p.degreeType === 'bachelors') return ['project'];
    const m = scopes.length ? matching(p) : [];
    if (!m.length || m.some((s) => !s.processType)) return ['project', 'thesis'];
    return (['project', 'thesis'] as const).filter((t) => m.some((s) => s.processType === t));
  };
  return { facultyId, programs, tracksFor };
}

interface ProgramRow {
  key: string;
  label: string;
  major: string;
  degreeType: 'bachelors' | 'masters';
  processType: ProcessType;
  names: string[];
  fromTemplate: boolean;
}

async function programRows(scope: RosterTemplateScope): Promise<{ named: ProgramRow[]; all: ProgramRow[] }> {
  const named: ProgramRow[] = [];
  const all: ProgramRow[] = [];
  const seen = new Set<string>();
  const add = async (major: string | null, degreeType: 'bachelors' | 'masters', track: 'project' | 'thesis', label: string, list: ProgramRow[] | null) => {
    const processType = deriveProcessType(degreeType, track);
    const key = `${scope.facultyId}|${major ?? ''}|${processType}`;
    if (seen.has(key)) return;
    seen.add(key);
    const resolved = await getActiveMilestonesFor(scope.facultyId, processType, major);
    const approved = (major ? await findApprovedTemplateId(scope.facultyId, processType, major) : null)
      ?? await findApprovedTemplateId(scope.facultyId, processType, null);
    const row: ProgramRow = {
      key, label, major: major ?? '', degreeType, processType,
      names: [...resolved.milestones].sort((a, b) => a.order - b.order).map((m) => m.nameHe || m.nameEn || m.type),
      fromTemplate: !!approved,
    };
    all.push(row);
    list?.push(row);
  };
  for (const p of scope.programs) {
    for (const t of scope.tracksFor(p)) await add(p.major, p.degreeType, t, p.labelHe, named);
  }
  // A row left with Major blank resolves against the faculty-wide template.
  for (const r of [...named]) await add(null, r.degreeType, r.processType === 'msc_thesis' ? 'thesis' : 'project', '(ללא Major)', null);
  return { named, all };
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb }, bgColor: { argb } });

export async function buildRosterTemplate(scope: RosterTemplateScope): Promise<{ buffer: Buffer; filename: string }> {
  const { named, all } = await programRows(scope);
  const fac = scope.facultyId;
  const degrees = [...new Set(scope.programs.map((p) => p.degreeType))].sort((a) => (a === 'bachelors' ? -1 : 1));
  const majors = [...new Set(scope.programs.map((p) => p.major))];
  const hasMasters = degrees.includes('masters');
  const nMs = Math.max(1, ...all.map((r) => r.names.length));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HIT Final Projects system';

  // ── Students (first sheet — the importer reads sheet #1) ──
  const ws = wb.addWorksheet('Students', { views: [{ rightToLeft: true, state: 'frozen', xSplit: 2, ySplit: 1 }] });
  const msNote = (k: number) => [
    `אבן דרך ${k} — YES = כבר הושלמה. אבני דרך שהושלמו חייבות להיות רצופות מ-Milestone1.`, '',
    ...named.map((r) => `${r.label} · ${TRACK_HE[r.processType]}: ${r.names[k - 1] ?? '— (אין אבן דרך כזו)'}`),
  ].join('\n');
  const cols: { h: string; w: number; color: string; note: string }[] = [
    { h: 'StudentId', w: 14, color: NAVY, note: 'חובה. ת.ז. — 9 ספרות בדיוק (נשמר כטקסט כדי לשמור אפסים מובילים).' },
    { h: 'FullName', w: 24, color: NAVY, note: 'חובה. שם מלא — נבדק מול השם שהסטודנט/ית מקליד/ה בהרשמה.' },
    { h: 'DegreeType', w: 13, color: NAVY, note: 'חובה. ' + degrees.map((d) => `${d} (${d === 'bachelors' ? 'תואר ראשון' : 'תואר שני'})`).join(' / ') },
    { h: 'Major', w: 30, color: NAVY, note: 'התוכנית — קובעת את אבני הדרך:\n' + majors.map((m) => `${m} — ${scope.programs.find((p) => p.major === m)?.labelHe ?? m}`).join('\n') },
    { h: 'FacultyId', w: 14, color: NAVY, note: `${fac} בלבד בקובץ הזה. העלאה של מנהל/ת מערכת: חובה. רכז/ת: אפשר להשאיר ריק.` },
    { h: 'InProgress', w: 12, color: TEAL, note: 'האם הסטודנט/ית כבר באמצע הפרויקט/התזה? YES או NO.\nNO (או ריק) — מתחיל/ה מההתחלה; שאר העמודות מימין נשארות אפורות.\nYES — ממלאים את העמודות הבאות.' },
    ...(hasMasters ? [{ h: 'ProjectType', w: 12, color: TEAL, note: 'project (פרויקט גמר) או thesis (תזה). בתואר ראשון תמיד project — אפשר להשאיר ריק.' }] : []),
    { h: 'ProjectTitleHe', w: 30, color: TEAL, note: 'חובה כש-InProgress=YES. שם הפרויקט/התזה בעברית.' },
    { h: 'ProjectTitleEn', w: 30, color: TEAL, note: 'רשות. שם הפרויקט באנגלית (ריק = כמו העברית).' },
    { h: 'SupervisorEmail', w: 28, color: TEAL, note: 'חובה כש-InProgress=YES. האימייל של המנחה — משתמש קיים במערכת עם תפקיד מנחה.' },
    { h: 'SecondarySupervisorEmail', w: 28, color: TEAL, note: 'רשות. אימייל מנחה משני (משתמש קיים במערכת).' },
    { h: 'StartDate', w: 13, color: TEAL, note: 'חובה כש-InProgress=YES. תאריך תחילת הפרויקט (dd/mm/yyyy).' },
    ...Array.from({ length: nMs }, (_, i) => ({ h: `Milestone${i + 1}`, w: 12, color: TEAL, note: msNote(i + 1) })),
  ];
  const idx: Record<string, number> = {};
  cols.forEach((c, i) => { idx[c.h] = i + 1; });
  const L = (h: string) => colLetter(idx[h]!);
  const header = ws.getRow(1);
  header.height = 24;
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.h;
    cell.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(c.color);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.note = c.note;
    ws.getColumn(i + 1).width = c.w;
  });
  // Column-level formats only (no cells created below the header, so the
  // importer still sees an untouched template as 0 rows).
  ws.getColumn(idx.StudentId!).numFmt = '@';
  ws.getColumn(idx.StartDate!).numFmt = 'dd/mm/yyyy';

  // ── Lists (dropdown sources) ──
  const ls = wb.addWorksheet('Lists');
  const lists: [string, string[]][] = [
    ['DegreeType', degrees], ['FacultyId', [fac]], ['Major', majors], ['YesNo', ['YES', 'NO']], ['ProjectType', ['project', 'thesis']],
  ];
  const listRef: Record<string, string> = {};
  lists.forEach(([title, values], i) => {
    const col = colLetter(i + 1);
    ls.getCell(`${col}1`).value = title;
    ls.getCell(`${col}1`).font = { name: FONT, bold: true };
    values.forEach((v, r) => { ls.getCell(`${col}${r + 2}`).value = v; });
    ls.getColumn(i + 1).width = title === 'Major' ? 38 : 14;
    listRef[title] = `Lists!$${col}$2:$${col}$${values.length + 1}`;
  });

  // ── Programs (this scope's programs, live from the workflow templates) ──
  const pg = wb.addWorksheet('Programs', { views: [{ rightToLeft: true, state: 'frozen', xSplit: 6, ySplit: 1 }] });
  const pgHeader = ['Key', 'Count', 'תוכנית', 'Major', 'מסלול', 'מקור אבני הדרך', ...Array.from({ length: nMs }, (_, i) => `Milestone${i + 1}`)];
  pgHeader.forEach((h, i) => {
    const c = pg.getCell(1, i + 1);
    c.value = h; c.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = solid(NAVY);
    pg.getColumn(i + 1).width = [40, 7, 26, 30, 20, 32][i] ?? 22;
  });
  all.forEach((r, i) => {
    const values = [r.key, r.names.length, r.label, r.major || '(ריק)', TRACK_HE[r.processType],
      r.fromTemplate ? 'תבנית תהליך מאושרת' : 'ברירת מחדל — אין עדיין תבנית מאושרת', ...r.names];
    values.forEach((v, j) => { pg.getCell(i + 2, j + 1).value = v; });
    pg.getCell(i + 2, 1).font = { name: FONT, color: { argb: 'FF6B7280' } };
  });
  const lastProg = all.length + 1;
  wb.definedNames.add(`Programs!$A$2:$A$${lastProg}`, 'ProgKeys');
  wb.definedNames.add(`Programs!$B$2:$B$${lastProg}`, 'ProgCounts');

  // ── Validation ──
  const dv = (ws as unknown as { dataValidations: { add: (a: string, v: ExcelJS.DataValidation) => void } }).dataValidations;
  const range = (h: string) => `${L(h)}2:${L(h)}${LAST_ROW}`;
  const prompt = (title: string, text: string, error = text) => ({ showInputMessage: true, promptTitle: title, prompt: text, showErrorMessage: true, errorTitle: title, error });
  dv.add(range('StudentId'), { type: 'textLength', operator: 'equal', formulae: [9], allowBlank: true, ...prompt('StudentId', '9 ספרות, כולל אפסים מובילים', 'ת.ז. חייבת להיות 9 ספרות בדיוק') });
  dv.add(range('DegreeType'), { type: 'list', formulae: [listRef.DegreeType!], allowBlank: true, ...prompt('DegreeType', degrees.join(' / ')) });
  dv.add(range('Major'), { type: 'list', formulae: [listRef.Major!], allowBlank: true, ...prompt('Major', 'התוכנית (קובעת את אבני הדרך)') });
  dv.add(range('FacultyId'), { type: 'list', formulae: [listRef.FacultyId!], allowBlank: true, ...prompt('FacultyId', `${fac} (או ריק בהעלאה של רכז/ת)`) });
  dv.add(range('InProgress'), { type: 'list', formulae: [listRef.YesNo!], allowBlank: true, ...prompt('InProgress', 'YES = באמצע הפרויקט/התזה; NO = מתחיל/ה מההתחלה') });
  const F2 = `$${L('InProgress')}2`;
  if (hasMasters) {
    const pt = `${L('ProjectType')}2`;
    dv.add(range('ProjectType'), { type: 'custom', formulae: [`AND(${F2}="YES",OR(${pt}="project",${pt}="thesis",${pt}="פרויקט",${pt}="תזה"))`], allowBlank: true,
      ...prompt('ProjectType', 'project (פרויקט גמר) או thesis (תזה)', 'project או thesis — ורק כש-InProgress = YES') });
  }
  for (const [h, text] of [['ProjectTitleHe', 'שם הפרויקט/התזה בעברית'], ['ProjectTitleEn', 'שם באנגלית (רשות)'],
    ['SupervisorEmail', 'אימייל המנחה (משתמש קיים במערכת)'], ['SecondarySupervisorEmail', 'אימייל מנחה משני (רשות)']] as const) {
    dv.add(range(h), { type: 'custom', formulae: [`${F2}="YES"`], allowBlank: true, ...prompt(h, text, 'ממלאים רק כש-InProgress = YES') });
  }
  const sd = `${L('StartDate')}2`;
  dv.add(range('StartDate'), { type: 'custom', formulae: [`AND(${F2}="YES",ISNUMBER(${sd}),${sd}<=TODAY())`], allowBlank: true,
    ...prompt('StartDate', 'תאריך תחילת הפרויקט, dd/mm/yyyy', 'תאריך תקין שאינו בעתיד — ורק כש-InProgress = YES') });
  const m1 = L('Milestone1');
  const mN = L(`Milestone${nMs}`);
  dv.add(`${m1}2:${mN}${LAST_ROW}`, { type: 'list', formulae: [listRef.YesNo!], allowBlank: true,
    ...prompt('Milestone', 'YES = אבן הדרך כבר הושלמה. שמות: הערת הכותרת או גיליון Programs') });

  // ── Conditional formatting: grey = not applicable, red = filled anyway ──
  const facCell = `IF($${L('FacultyId')}2="","${fac}",$${L('FacultyId')}2)`;
  const thesis = hasMasters ? `OR($${L('ProjectType')}2="thesis",$${L('ProjectType')}2="תזה")` : 'FALSE';
  const key = `${facCell}&"|"&$${L('Major')}2&"|"&IF($${L('DegreeType')}2="bachelors","bsc_project",IF(${thesis},"msc_thesis","msc_project"))`;
  const count = `IFERROR(INDEX(ProgCounts,MATCH(${key},ProgKeys,0)),${nMs})`;
  const firstIp = hasMasters ? L('ProjectType') : L('ProjectTitleHe');
  const grey = { fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: 'FFE5E7EB' } } };
  const red = { fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: 'FFFCA5A5' } } };
  ws.addConditionalFormatting({
    ref: `${firstIp}2:${L('StartDate')}${LAST_ROW}`,
    rules: [
      { type: 'expression', priority: 1, formulae: [`AND(${firstIp}2<>"",${F2}<>"YES")`], style: red },
      { type: 'expression', priority: 2, formulae: [`${F2}<>"YES"`], style: grey },
    ],
  });
  const na = `OR(${F2}<>"YES",COLUMN(${m1}2)-${idx.Milestone1! - 1}>${count})`;
  ws.addConditionalFormatting({
    ref: `${m1}2:${mN}${LAST_ROW}`,
    rules: [
      { type: 'expression', priority: 3, formulae: [`AND(${m1}2<>"",${na})`], style: red },
      { type: 'expression', priority: 4, formulae: [na], style: grey },
    ],
  });

  // ── Instructions ──
  const ins = wb.addWorksheet('Instructions', { views: [{ rightToLeft: true }] });
  ins.getColumn(1).width = 4;
  const scopeLabel = scope.programs.length < PROGRAMS.filter((p) => p.facultyId === fac).length
    ? ` · ${[...new Set(scope.programs.map((p) => p.labelHe))].join(', ')}` : '';
  const noTemplate = named.filter((r) => !r.fromTemplate);
  const lines: [string, 'title' | 'h' | null][] = [
    [`הוראות — ייבוא רשימת סטודנטים מאושרים · ${FACULTY_LABEL_HE[fac]}${scopeLabel}`, 'title'],
    ['', null],
    [`הקובץ נוצר ${new Date().toLocaleDateString('he-IL')} מתבניות תהליך העבודה העדכניות של התוכניות שבאחריותך.`, null],
    ['', null],
    ['חלק א׳ — לכל סטודנט/ית', 'h'],
    ['1. ממלאים רק את הגיליון "Students" (הגיליון הראשון). לא משנים את שורת הכותרת ולא את סדר הגיליונות.', null],
    ['2. שורה אחת לכל סטודנט/ית, החל משורה 2. עד 5,000 שורות בקובץ.', null],
    ['3. StudentId — חובה, 9 ספרות. FullName — חובה (נבדק מול השם בהרשמה). DegreeType — חובה.', null],
    [`4. Major — התוכנית (רשימה נפתחת). FacultyId — ${fac}; רכז/ת יכול/ה להשאיר ריק.`, null],
    ['', null],
    ['חלק ב׳ — סטודנט/ית שכבר באמצע הפרויקט/התזה (רשות)', 'h'],
    ['5. InProgress = NO (או ריק): מתחיל/ה מההתחלה כרגיל. שאר העמודות נשארות אפורות וריקות.', null],
    [`6. InProgress = YES: ממלאים את העמודות הירוקות-כהות —${hasMasters ? ' ProjectType,' : ''} ProjectTitleHe, SupervisorEmail, StartDate, ואבני הדרך.`, null],
    [`7. Milestone1…Milestone${nMs} — YES לכל אבן דרך שכבר הושלמה, לפי הסדר. תאים אפורים לא רלוונטיים לתוכנית/למסלול של השורה. שם כל אבן דרך — בהערה על כותרת העמודה ובגיליון Programs.`, null],
    ['8. המנחה (ומנחה משני) חייבים להיות משתמשים קיימים במערכת עם תפקיד מנחה — אחרת השורה תיכשל עם הסבר.', null],
    ['9. בכניסה הראשונה של הסטודנט/ית: המערכת יוצרת את הפרויקט/התזה עם המנחה, מסמנת את אבני הדרך שהושלמו, והסטודנט/ית ממשיך/ה מאבן הדרך הבאה.', null],
    ['10. מועדי הגשה: אבן הדרך הנוכחית — היום + משך הזמן שלה; כל אבן דרך אחריה מקבלת מועד רק כשהקודמת מסתיימת.', null],
    ['11. אבני דרך שהושלמו ויש להן ציון — המנחה מזין/ה את הציון בכרטיס הפרויקט ("חסר ציון"). אבני דרך של אישור/דחייה בלבד מסומנות כמאושרות, בלי ציון.', null],
    ['', null],
    ['חלק ג׳ — העלאה', 'h'],
    ['12. ייבוא/ייצוא ← "🎓 ייבוא רשימת סטודנטים מאושרים (Excel)". בסיום מוצג סיכום עם סיבה לכל שורה שנכשלה.', null],
    ['13. העלאה חוזרת בטוחה: אותו ת.ז.+פקולטה+תואר מתעדכן ולא משוכפל. סטודנט/ית שכבר נרשם/ה לא יידרס/תידרס.', null],
    ...(noTemplate.length ? [[`14. לתוכניות/מסלולים הבאים אין עדיין תבנית תהליך מאושרת, ולכן יש להם ${noTemplate[0]!.names.length} אבני דרך כברירת מחדל: `
      + noTemplate.map((r) => `${r.label} (${TRACK_HE[r.processType]})`).join(', ') + '. אחרי אישור תבנית — הורידו קובץ חדש.', null] as [string, null]] : []),
  ];
  lines.forEach(([text, kind], i) => {
    const c = ins.getCell(i + 1, 2);
    c.value = text;
    c.font = { name: FONT, bold: !!kind, size: kind === 'title' ? 14 : 11, color: { argb: kind === 'h' ? NAVY : 'FF000000' } };
  });

  // The importer reads the FIRST sheet — keep Students first.
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const singleMajor = majors.length === 1 && scope.programs.length < PROGRAMS.filter((p) => p.facultyId === fac).length ? `-${majors[0]}` : '';
  return { buffer, filename: `student-roster-${fac}${singleMajor}.xlsx` };
}

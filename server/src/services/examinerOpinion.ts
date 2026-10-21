// src/services/examinerOpinion.ts
//
// The examiner's written opinion form (see workflowTemplates.ts's
// examinerOpinionForm) — first built for Electrical Engineering's M.Sc.
// thesis "טופס בוחן לעבודת תזה מחקרית": each assigned examiner (internal, by
// uid, or external, by access token) picks a conclusion and a
// confidentiality request and writes a detailed opinion, then signs
// digitally. Once every examiner of the current round has answered, the
// conclusions decide what happens next (resolveOutcome): all 'continue' →
// the administrative coordinator enters and approves the final grade; any
// 'revise'/'reject' → back to the coordinator and supervisor, who may send
// the thesis back to the student, after which only the examiners who asked
// for changes review it again.
//
// Shared by the internal-examiner/staff endpoints (examinerOpinionController.ts)
// and the external-examiner token endpoints (examinerAccessController.ts).
//
// STORAGE: the opinions themselves (conclusion, confidential parts, the
// examiner's name), upload drafts and archived rounds live in their own
// collections — examinerOpinions / examinerOpinionDrafts /
// examinerOpinionHistory — never on the milestone doc, which the project's
// students and supervisor can read directly (firestore.rules). None of the
// three is mentioned in firestore.rules, so every client is denied (default
// deny); only the Admin SDK reads them, through buildOpinionView's filtering.
// Doc ids embed the examiner's key, which for an external examiner is their
// access token — another reason these must stay server-only.

import admin from 'firebase-admin';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
// @ts-ignore — word-extractor ships no type definitions.
import WordExtractor from 'word-extractor';
import { db } from '../config/firebase.js';
import { academicYearToHebrew } from './hebrewYear.js';
import { isDefenseDateConfirmed, type ExaminerOpinionFormSpec, type FormFieldSpec } from './workflowTemplates.js';
import { signEvaluation, verifyEvaluationSignature, type EvaluationSignature, type SignedPayload } from './evaluationSignature.js';
import { resolveStaffForScope } from './scopeAuthorization.js';
import { notifyUser } from './notify.js';
import { targetScreenFor } from './notificationTargets.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Jerusalem';

export interface StoredOpinion {
  conclusion: string;
  confidentiality: string;
  opinion: string;
  confidentialOpinion: string;
  institution: string;
  examinerName: string;
  external: boolean;
  fileUrls: string[];
  /** The examiner's own filled Word form, when they uploaded it. */
  uploadedFormUrl: string | null;
  submittedAt: string;
  round: number;
  signature: EvaluationSignature;
}

export interface PanelMember { key: string; name: string; external: boolean }

export const OPINIONS = 'examinerOpinions';
export const OPINION_DRAFTS = 'examinerOpinionDrafts';
export const OPINION_HISTORY = 'examinerOpinionHistory';
export const opinionDocId = (milestoneId: string, key: string) => `${milestoneId}__${key}`;

/** The current opinions of the given panel, keyed by examiner key. */
export async function loadOpinions(milestoneId: string, keys: string[], tx?: FirebaseFirestore.Transaction): Promise<Record<string, StoredOpinion>> {
  if (keys.length === 0) return {};
  const refs = keys.map((k) => db.collection(OPINIONS).doc(opinionDocId(milestoneId, k)));
  const snaps = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  const out: Record<string, StoredOpinion> = {};
  snaps.forEach((s, i) => { if (s.exists) out[keys[i]!] = s.data() as StoredOpinion; });
  return out;
}

/** Every examiner of the milestone — internal uids plus external examiners'
 *  access tokens (same union as maybeFinalizeAutoCalculatedGrade). */
function targetScreenOf(role: string): { targetScreen?: string } {
  const screen = targetScreenFor(role, 'milestone_action');
  return screen ? { targetScreen: screen } : {};
}

export async function opinionPanel(m: FirebaseFirestore.DocumentData): Promise<PanelMember[]> {
  const internal: string[] = m.examinerIds ?? [];
  const external = ((m.defensePanel ?? []) as Array<{ type?: string; ref?: string; displayName?: string }>)
    .filter((p) => p.type === 'external' && p.ref);
  const snaps = await Promise.all(internal.map((uid) => db.collection('users').doc(uid).get()));
  return [
    ...internal.map((uid, i) => ({ key: uid, name: snaps[i]?.data()?.displayName ?? uid, external: false })),
    ...external.map((p) => ({ key: p.ref!, name: p.displayName ?? '', external: true })),
  ];
}

/** What a signature over an opinion covers: every field the examiner
 *  wrote or chose, and the review round. */
function signedOpinionPayload(o: Pick<StoredOpinion, 'conclusion' | 'confidentiality' | 'opinion' | 'confidentialOpinion' | 'institution' | 'round'>): SignedPayload {
  return { opinion: { conclusion: o.conclusion, confidentiality: o.confidentiality, opinion: o.opinion, confidentialOpinion: o.confidentialOpinion, institution: o.institution, round: o.round } };
}

export function opinionGate(m: FirebaseFirestore.DocumentData): { open: true } | { open: false; he: string; en: string } {
  if (m.gradeApproved) return { open: false, he: 'הציון הסופי כבר אושר — הטופס נעול.', en: 'The final grade was already approved — the form is locked.' };
  if (m.opinionOutcome) return { open: false, he: 'כל הבוחנים הגישו את חוות דעתם — הטופס נעול.', en: 'Every examiner has submitted — the form is locked.' };
  if (m.status === 'rejected') return { open: false, he: 'העבודה הוחזרה לסטודנט/ית לתיקונים — הטופס ייפתח עם הגשת הגרסה המתוקנת.', en: 'The thesis was returned to the student for corrections — the form opens when the corrected version is submitted.' };
  if (!m.submittedAt) return { open: false, he: 'הטופס ייפתח לאחר שהסטודנט/ית יגיש/תגיש את העבודה.', en: 'The form opens once the student submits the thesis.' };
  return { open: true };
}

function titledName(name: string, gender: string | null | undefined): { he: string; en: string } {
  if (gender === 'male') return { he: `מר ${name}`, en: `Mr. ${name}` };
  if (gender === 'female') return { he: `גברת ${name}`, en: `Ms. ${name}` };
  return { he: name, en: name };
}

/** The read-only header lines, in both languages. */
export async function resolveOpinionHeader(m: FirebaseFirestore.DocumentData, spec: ExaminerOpinionFormSpec, panel: PanelMember[]) {
  const projectSnap = await db.collection('projects').doc(m.projectId ?? '').get();
  const project = projectSnap.exists ? projectSnap.data()! : {};
  const ids = [...(m.studentIds ?? []), m.supervisorId, m.secondarySupervisorId].filter(Boolean) as string[];
  const snaps = await Promise.all([...new Set(ids)].map((id) => db.collection('users').doc(id).get()));
  const users = Object.fromEntries(snaps.map((s) => [s.id, s.data() ?? {}]));
  const nameOf = (id: string) => users[id]?.displayName || users[id]?.displayNameHe || id;
  const students: string[] = m.studentIds ?? [];
  const resolve = (f: FormFieldSpec): { he: string | null; en: string | null } => {
    switch (f.autoFill) {
      case 'studentTitledName': {
        const parts = students.map((id) => titledName(nameOf(id), users[id]?.gender));
        return { he: parts.map((p) => p.he).join(', ') || null, en: parts.map((p) => p.en).join(', ') || null };
      }
      case 'studentName': { const v = students.map(nameOf).join(', ') || null; return { he: v, en: v }; }
      case 'supervisorNames':
      case 'supervisorName': {
        const v = [m.supervisorId, ...(f.autoFill === 'supervisorNames' ? [m.secondarySupervisorId] : [])].filter(Boolean).map(nameOf).join(', ') || null;
        return { he: v, en: v };
      }
      case 'projectNameHe': return { he: project.titleHe || null, en: project.titleHe || null };
      case 'projectNameEn': return { he: project.titleEn || null, en: project.titleEn || null };
      case 'examinerNames': { const v = panel.map((p) => p.name).filter(Boolean).join(', ') || null; return { he: v, en: v }; }
      case 'academicYear': { const v = academicYearToHebrew(project.academicYear ?? null); return { he: v, en: v }; }
      case 'defenseDate': {
        const v = isDefenseDateConfirmed(m.status) && m.dueDate ? dayjs(m.dueDate.toDate()).tz(TZ).format('DD/MM/YYYY') : null;
        return { he: v, en: v };
      }
      default: return { he: null, en: null };
    }
  };
  return (spec.headerFields ?? []).map((f) => {
    const v = resolve(f);
    return { key: f.key, labelHe: f.labelHe, labelEn: f.labelEn, value: v.he, valueEn: v.en };
  });
}

export type OpinionViewer =
  | { kind: 'examiner'; key: string }
  | { kind: 'supervisor' }
  | { kind: 'staff' };

/** The form as one viewer may see it — staff: everything; an examiner: only
 *  their own opinion; the supervisor: each opinion as its examiner's
 *  confidentiality request allows (no name when 'hide_name', no
 *  confidential part when 'hide_marked'; attached files only when nothing
 *  was requested, since a file can't be redacted). */
export async function buildOpinionView(
  milestoneId: string,
  m: FirebaseFirestore.DocumentData,
  viewer: OpinionViewer,
  /** Pre-fill for the examiner's own name/institution (an external
   *  examiner's come from their access token). */
  defaults?: { name: string; institution: string },
) {
  const spec: ExaminerOpinionFormSpec = m.examinerOpinionForm;
  const panel = await opinionPanel(m);
  const header = await resolveOpinionHeader(m, spec, panel);
  const opinions = await loadOpinions(milestoneId, panel.map((p) => p.key));
  const effectOf = (value: string) => spec.confidentialityOptions.find((o) => o.value === value)?.effect ?? 'none';

  const examiners = await Promise.all(panel.map(async (p, index) => {
    const o = opinions[p.key];
    const isSelf = viewer.kind === 'examiner' && viewer.key === p.key;
    const base = { index, submitted: !!o, isSelf };
    if (viewer.kind === 'examiner' && !isSelf) return { ...base, key: null, name: null, opinion: null };
    if (!o) return { ...base, key: viewer.kind === 'staff' || isSelf ? p.key : null, name: viewer.kind === 'supervisor' ? null : p.name, opinion: null };
    const valid = await verifyEvaluationSignature(milestoneId, o.signature, signedOpinionPayload(o));
    const effect = effectOf(o.confidentiality);
    if (viewer.kind === 'supervisor') {
      const hideName = effect === 'hide_name';
      return {
        ...base,
        key: null,
        name: hideName ? null : o.examinerName,
        opinion: {
          conclusion: o.conclusion,
          confidentiality: o.confidentiality,
          opinion: o.opinion,
          confidentialOpinion: null,
          institution: hideName ? null : o.institution,
          fileUrls: effect === 'none' ? o.fileUrls : [],
          uploadedFormUrl: null,
          submittedAt: o.submittedAt,
          round: o.round,
          signature: hideName ? null : { ...o.signature, digest: undefined, valid },
          signedAnonymously: hideName,
        },
      };
    }
    return {
      ...base,
      key: p.key,
      name: o.examinerName || p.name,
      opinion: { ...o, signature: { ...o.signature, digest: undefined, valid }, signedAnonymously: false },
    };
  }));

  const studentIds: string[] = m.studentIds ?? [];
  const studentSnaps = await Promise.all(studentIds.map((id) => db.collection('users').doc(id).get()));
  const selfMember = viewer.kind === 'examiner' ? panel.find((p) => p.key === viewer.key) : undefined;
  const gate = opinionGate(m);

  return {
    milestoneId,
    titleHe: spec.titleHe,
    titleEn: spec.titleEn,
    header,
    conclusions: spec.conclusions,
    confidentialityOptions: spec.confidentialityOptions,
    round: m.examinerOpinionRound ?? 1,
    viewer: {
      kind: viewer.kind,
      canEdit: viewer.kind === 'examiner' && gate.open,
      lockedReasonHe: viewer.kind === 'examiner' && !gate.open ? gate.he : null,
      lockedReasonEn: viewer.kind === 'examiner' && !gate.open ? gate.en : null,
      // An internal examiner's institution defaults to HIT; an external
      // examiner types theirs.
      defaultName: defaults?.name || selfMember?.name || null,
      defaultInstitution: defaults?.institution || (selfMember && !selfMember.external ? 'HIT - מכון טכנולוגי חולון' : ''),
    },
    examiners,
    outcome: m.opinionOutcome ?? null,
    sendBack: m.opinionSendBack ?? null,
    finalGrade: viewer.kind === 'examiner' ? null : m.finalGrade ?? null,
    finalGradeByStudent: viewer.kind === 'examiner' ? null : m.finalGradeByStudent ?? null,
    gradeApproved: !!m.gradeApproved,
    students: studentSnaps.map((s) => ({ id: s.id, name: s.data()?.displayName ?? s.id })),
    history: viewer.kind === 'staff'
      ? (await db.collection(OPINION_HISTORY).where('milestoneId', '==', milestoneId).get()).docs
        .map((d) => d.data() as StoredOpinion & { key: string })
        .sort((a, b) => a.round - b.round)
        .map((h) => ({ ...h, key: undefined, signature: { ...h.signature, digest: undefined } }))
      : [],
  };
}

export interface OpinionInput {
  conclusion: unknown;
  confidentiality: unknown;
  opinion: unknown;
  confidentialOpinion?: unknown;
  institution?: unknown;
  examinerName?: unknown;
}

export class OpinionError extends Error {
  constructor(public he: string, public en: string, public status = 400) { super(en); }
}

/** Validates and stores one examiner's opinion, signs it, and resolves the
 *  outcome if this was the last one. `signerUid` is the uid (internal) or
 *  access token (external). */
export async function submitOpinion(params: {
  milestoneRef: FirebaseFirestore.DocumentReference;
  key: string;
  external: boolean;
  signerName: string;
  signerFacultyId: string;
  input: OpinionInput;
  fileUrls: string[];
  uploadedFormUrl: string | null;
}): Promise<{ outcome: string | null }> {
  const snap = await params.milestoneRef.get();
  if (!snap.exists) throw new OpinionError('אבן הדרך לא נמצאה.', 'Milestone not found.', 404);
  const m = snap.data()!;
  const spec: ExaminerOpinionFormSpec | undefined = m.examinerOpinionForm;
  if (!spec) throw new OpinionError('אבן דרך זו אינה משתמשת בטופס חוות דעת בוחן.', 'This milestone does not use the examiner opinion form.');
  const panel = await opinionPanel(m);
  if (!panel.some((p) => p.key === params.key)) throw new OpinionError('רק בוחן/ת שהוקצה/ה רשאי/ת למלא טופס זה.', 'Only an assigned examiner may fill in this form.', 403);
  const gate = opinionGate(m);
  if (!gate.open) throw new OpinionError(gate.he, gate.en, 409);

  const { input } = params;
  const conclusion = typeof input.conclusion === 'string' ? input.conclusion : '';
  const confidentiality = typeof input.confidentiality === 'string' ? input.confidentiality : '';
  const opinion = typeof input.opinion === 'string' ? input.opinion.trim().slice(0, 20000) : '';
  const confidentialOpinion = typeof input.confidentialOpinion === 'string' ? input.confidentialOpinion.trim().slice(0, 20000) : '';
  const institution = typeof input.institution === 'string' ? input.institution.trim().slice(0, 200) : '';
  if (!spec.conclusions.some((c) => c.value === conclusion)) throw new OpinionError('יש לבחור מסקנה.', 'Choose a conclusion.');
  const confOption = spec.confidentialityOptions.find((o) => o.value === confidentiality);
  if (!confOption) throw new OpinionError('יש לבחור את בקשת החיסיון.', 'Choose a confidentiality option.');
  if (!opinion && params.fileUrls.length === 0) throw new OpinionError('יש לכתוב את חוות הדעת או לצרף אותה כקובץ.', 'Write the opinion or attach it as a file.');
  if (!institution) throw new OpinionError('יש למלא את שם המוסד.', 'Fill in the institution.');
  if (confOption.effect === 'hide_marked' && !confidentialOpinion) {
    throw new OpinionError('בחרת שחלקים לא יועברו — יש לכתוב אותם בשדה החלקים החסויים.', 'You asked for parts to be withheld — write them in the confidential-parts field.');
  }

  const round: number = m.examinerOpinionRound ?? 1;
  const examinerName = (typeof input.examinerName === 'string' && input.examinerName.trim()) || params.signerName;
  const index = panel.findIndex((p) => p.key === params.key);
  const body = { conclusion, confidentiality, opinion, confidentialOpinion: confOption.effect === 'hide_marked' ? confidentialOpinion : '', institution, round };
  const signature = await signEvaluation({
    milestoneId: params.milestoneRef.id,
    signerUid: params.key,
    signerName: examinerName,
    role: 'examiner',
    positionHe: `בוחן/ת ${index + 1}`,
    positionEn: `Examiner ${index + 1}`,
    facultyId: params.signerFacultyId,
    scores: signedOpinionPayload(body),
  });
  const stored: StoredOpinion = {
    ...body,
    examinerName,
    external: params.external,
    fileUrls: params.fileUrls,
    uploadedFormUrl: params.uploadedFormUrl,
    submittedAt: new Date().toISOString(),
    signature,
  };
  await db.collection(OPINIONS).doc(opinionDocId(params.milestoneRef.id, params.key)).set({ ...stored, milestoneId: params.milestoneRef.id, key: params.key });
  await params.milestoneRef.update({ updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  const outcome = await resolveOutcome(params.milestoneRef);
  return { outcome };
}

/** Once every panel member has an opinion for the current round, decides
 *  the outcome (any 'reject' → reject, else any 'revise' → revise, else
 *  continue), records it, and notifies the administrative coordinator(s) in
 *  scope and the supervisor(s). Transactional so two last submissions can't
 *  both resolve it. */
export async function resolveOutcome(milestoneRef: FirebaseFirestore.DocumentReference): Promise<string | null> {
  const panelSnap = await milestoneRef.get();
  const panel = await opinionPanel(panelSnap.data() ?? {});
  let result: 'continue' | 'revise' | 'reject' | null = null;
  let m: FirebaseFirestore.DocumentData = {};
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(milestoneRef);
    m = snap.data() ?? {};
    if (m.opinionOutcome || panel.length === 0) return;
    const spec: ExaminerOpinionFormSpec = m.examinerOpinionForm;
    const opinions = await loadOpinions(milestoneRef.id, panel.map((p) => p.key), tx);
    if (!panel.every((p) => opinions[p.key])) return;
    const outcomes = panel.map((p) => spec.conclusions.find((c) => c.value === opinions[p.key]!.conclusion)?.outcome ?? 'revise');
    result = outcomes.includes('reject') ? 'reject' : outcomes.includes('revise') ? 'revise' : 'continue';
    tx.update(milestoneRef, {
      opinionOutcome: { result, decidedAt: new Date().toISOString(), round: m.examinerOpinionRound ?? 1 },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  if (!result) return null;

  // Notify — best effort, never fails the submission.
  try {
    const projectSnap = await db.collection('projects').doc(m.projectId ?? '').get();
    const project = projectSnap.data() ?? {};
    const scope = { facultyId: project.facultyId ?? m.facultyId ?? '', major: project.major || undefined, degreeLevel: project.degreeType || undefined, processType: project.projectType || undefined };
    const coordinators = await resolveStaffForScope('administrative_secretary', scope, [], [], false);
    const supervisors = [m.supervisorId, m.secondarySupervisorId].filter(Boolean) as string[];
    const title = project.titleHe || project.titleEn || '';
    const texts = {
      continue: { he: 'כל הבוחנים אישרו את העבודה — ניתן להזין ולאשר את הציון הסופי.', en: 'All examiners approved the thesis — the final grade can now be entered and approved.' },
      revise: { he: 'בוחן/ת ביקש/ה תיקונים מהותיים בעבודה — יש לעדכן את הסטודנט/ית.', en: 'An examiner requested major corrections — please update the student.' },
      reject: { he: 'בוחן/ת קבע/ה שהעבודה אינה ראויה להתקבל — יש לעדכן את הסטודנט/ית.', en: 'An examiner found the thesis not acceptable — please update the student.' },
    }[result as 'continue' | 'revise' | 'reject'];
    await Promise.all([
      ...coordinators.map((uid) => notifyUser({
        recipientId: uid,
        type: 'milestone_submitted',
        inAppType: 'examiner_opinions_complete',
        titleHe: `📝 חוות דעת הבוחנים הושלמו — ${title}`,
        titleEn: `📝 Examiner opinions complete — ${title}`,
        bodyHe: texts.he,
        bodyEn: texts.en,
        relatedProjectId: m.projectId ?? null,
        relatedMilestoneId: milestoneRef.id,
        ...targetScreenOf('administrative_secretary'),
      }).catch((err) => console.error('resolveOutcome: coordinator notify failed:', err))),
      ...supervisors.map((uid) => notifyUser({
        recipientId: uid,
        type: 'milestone_submitted',
        inAppType: 'examiner_opinions_complete',
        titleHe: `📝 חוות דעת הבוחנים הושלמו — ${title}`,
        titleEn: `📝 Examiner opinions complete — ${title}`,
        bodyHe: texts.he,
        bodyEn: texts.en,
        relatedProjectId: m.projectId ?? null,
        relatedMilestoneId: milestoneRef.id,
        ...targetScreenOf('supervisor'),
      }).catch((err) => console.error('resolveOutcome: supervisor notify failed:', err))),
    ]);
  } catch (err) {
    console.error('resolveOutcome: notification fan-out failed:', err);
  }
  return result;
}

/** After the coordinator sends the thesis back: the corrected version was
 *  just submitted — tell the examiners who still owe an opinion. */
export async function notifyExaminersOfResubmission(milestoneId: string): Promise<void> {
  try {
    const snap = await db.collection('milestones').doc(milestoneId).get();
    const m = snap.data();
    if (!m?.examinerOpinionForm) return;
    const opinions = await loadOpinions(milestoneId, m.examinerIds ?? []);
    const internal: string[] = (m.examinerIds ?? []).filter((uid: string) => !opinions[uid]);
    await Promise.all(internal.map((uid) => notifyUser({
      recipientId: uid,
      type: 'milestone_submitted',
      inAppType: 'thesis_resubmitted',
      titleHe: '📄 גרסה מתוקנת של העבודה הוגשה',
      titleEn: '📄 A corrected version of the thesis was submitted',
      bodyHe: 'הסטודנט/ית הגיש/ה גרסה מתוקנת — נא למלא את טופס הבוחן מחדש.',
      bodyEn: 'The student submitted a corrected version — please fill in the examiner form again.',
      relatedProjectId: m.projectId ?? null,
      relatedMilestoneId: milestoneId,
      ...targetScreenOf('internal_examiner'),
    }).catch((err) => console.error('notifyExaminersOfResubmission: notify failed:', err))));
  } catch (err) {
    console.error('notifyExaminersOfResubmission failed:', err);
  }
}

// ─── Reading an uploaded Word form ──────────────────────────────────────────
// The paper form's checkboxes are plain "[ ]" text; an examiner marks one by
// typing inside it (X, V, ✓...) or with a Word checkbox (☒). Matching is by
// the option's leading number (conclusions "1."-"4.") or its text, so a
// slightly edited form still works. Everything is only a PRE-FILL: the
// examiner reviews it in the online form before signing.

const MARK = /\[\s*[^\]\s]+\s*\]|[☒☑✓✔√✗✘]|^\s*[XxVv]\s/;

function normalize(s: string): string {
  return s.replace(/[‎‏‪-‮]/g, '').replace(/[\t ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function fieldAfter(lines: string[], label: RegExp): string {
  for (const line of lines) {
    const match = line.match(label);
    if (match) {
      const value = line.slice((match.index ?? 0) + match[0].length).replace(/_+/g, ' ').trim();
      if (value) return value;
    }
  }
  return '';
}

export async function parseUploadedOpinionForm(buffer: Buffer, spec: ExaminerOpinionFormSpec) {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  return parseOpinionFormText(String(doc.getBody() ?? ''), spec);
}

export function parseOpinionFormText(text: string, spec: ExaminerOpinionFormSpec): {
  conclusion: string | null;
  confidentiality: string | null;
  examinerName: string;
  institution: string;
  extraText: string;
} {
  const lines: string[] = text.split(/\r?\n/).map(normalize).filter(Boolean);

  // Word-overlap matching, tolerant of punctuation, gender suffixes ("מבקש/ת")
  // and small wording differences between the paper form and the labels.
  const tokens = (str: string) => normalize(str)
    .replace(/\/(ת|ה|ית)/g, '')
    .replace(/[.,:;"'״׳()\[\]\-—–]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !/^\d+$/.test(w));
  const overlap = (line: string, label: string) => {
    const want = tokens(label);
    if (want.length === 0) return 0;
    const have = new Set(tokens(line));
    return want.filter((w) => have.has(w)).length / want.length;
  };
  const isOptionLine = (line: string, label: string) => overlap(line, label) >= 0.6;
  const markedOption = <T extends { labelHe: string }>(options: T[]): T | undefined => {
    const marked = lines.filter((l) => MARK.test(l));
    return options.find((o) => marked.some((l) => isOptionLine(l, o.labelHe)));
  };
  const conclusion = markedOption(spec.conclusions)?.value ?? null;
  const confidentiality = markedOption(spec.confidentialityOptions)?.value ?? null;

  // Lines that aren't part of the blank template — e.g. an opinion written
  // into the same file — become the opinion's pre-fill.
  const templateHints = ['טופס בוחן', 'ימולא על ידי', 'שם הבוחן', 'המוסד', 'עבודת תזה מחקרית לתואר שני של', 'בהדרכת', 'הנושא', 'מסקנות', 'בקשת חסיון', 'טופס זה חסוי', 'בהשמטת שם', 'ת א ר י ך'];
  const optionLabels = [...spec.conclusions, ...spec.confidentialityOptions].map((o) => o.labelHe);
  const extra = lines.filter((l) =>
    !templateHints.some((h) => l.includes(h)) &&
    !/^[_\s]+$/.test(l) &&
    !optionLabels.some((label) => isOptionLine(l, label)),
  );

  return {
    conclusion,
    confidentiality,
    examinerName: fieldAfter(lines, /שם הבוחן\/?ת?\s*:/),
    institution: fieldAfter(lines, /המוסד\s*:/),
    extraText: extra.join('\n').slice(0, 20000),
  };
}

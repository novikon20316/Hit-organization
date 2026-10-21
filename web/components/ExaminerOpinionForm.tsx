'use client';

// components/ExaminerOpinionForm.tsx
// The examiner's written opinion form (server: services/examinerOpinion.ts;
// template: examinerOpinionForm) — first built for Electrical Engineering's
// M.Sc. "טופס בוחן לעבודת תזה מחקרית". An examiner fills it online or
// uploads their filled Word form, which pre-fills the online form for them
// to check before signing. The supervisor sees each opinion as its
// examiner's confidentiality request allows; the administrative coordinator
// sees everything and acts on the outcome (approve the final grade, or send
// the thesis back for corrections).
//
// Used inline on the external examiner's access page and inside
// ExaminerOpinionFormModal everywhere else — the data source is passed in
// (`source`), since external examiners go through their access token.

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type ExaminerOpinionParseResult, type ExaminerOpinionView } from '@/lib/apiClient';
import { SignatureBlock } from './EvaluationFormModal';

export interface ExaminerOpinionSource {
  load: () => Promise<ExaminerOpinionView>;
  parse: (file: File) => Promise<ExaminerOpinionParseResult>;
  submit: (formData: FormData) => Promise<unknown>;
}

export function internalOpinionSource(milestoneId: string): ExaminerOpinionSource {
  return {
    load: () => apiClient.getExaminerOpinionForm(milestoneId),
    parse: (file) => apiClient.parseExaminerOpinionUpload(milestoneId, file),
    submit: (formData) => apiClient.submitExaminerOpinion(milestoneId, formData),
  };
}

export function externalOpinionSource(token: string): ExaminerOpinionSource {
  return {
    load: () => apiClient.getExternalExaminerOpinionForm(token),
    parse: (file) => apiClient.parseExternalExaminerOpinionUpload(token, file),
    submit: (formData) => apiClient.submitExternalExaminerOpinion(token, formData),
  };
}

const OUTCOME_TEXT = {
  continue: { he: 'כל הבוחנים אישרו את העבודה — ממתין להזנת הציון הסופי ואישורו על ידי הרכז/ת המנהלי/ת.', en: 'All examiners approved the thesis — awaiting the final grade from the administrative coordinator.' },
  revise: { he: 'בוחן/ת ביקש/ה תיקונים מהותיים — העבודה חזרה לרכז/ת המנהלי/ת ולמנחה.', en: 'An examiner requested major corrections — the thesis is back with the administrative coordinator and the supervisor.' },
  reject: { he: 'בוחן/ת קבע/ה שהעבודה אינה ראויה להתקבל — העבודה חזרה לרכז/ת המנהלי/ת ולמנחה.', en: 'An examiner found the thesis not acceptable — it is back with the administrative coordinator and the supervisor.' },
} as const;

export function ExaminerOpinionForm({ source, onChanged }: { source: ExaminerOpinionSource; onChanged?: () => void }) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [view, setView] = useState<ExaminerOpinionView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [confidentiality, setConfidentiality] = useState('');
  const [opinion, setOpinion] = useState('');
  const [confidentialOpinion, setConfidentialOpinion] = useState('');
  const [institution, setInstitution] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadedFormName, setUploadedFormName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Coordinator actions
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [sendBackNote, setSendBackNote] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await source.load();
      setView(data);
      setLoadError('');
      const own = data.examiners.find((e) => e.isSelf)?.opinion;
      setConclusion(own?.conclusion ?? '');
      setConfidentiality(own?.confidentiality ?? '');
      setOpinion(own?.opinion ?? '');
      setConfidentialOpinion(own?.confidentialOpinion ?? '');
      setInstitution(own?.institution ?? data.viewer.defaultInstitution ?? '');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : he ? 'טעינת הטופס נכשלה' : 'Failed to load the form');
    }
  }, [source, he]);

  useEffect(() => { load(); }, [load]);

  if (!view) {
    return loadError
      ? <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{loadError}</p>
      : <p className="text-sm text-muted">{he ? 'טוען…' : 'Loading…'}</p>;
  }

  const labelOf = (list: Array<{ value: string; labelHe: string; labelEn: string }>, value: string) => {
    const item = list.find((x) => x.value === value);
    return item ? (he ? item.labelHe : item.labelEn) : value;
  };
  const hideMarked = view.confidentialityOptions.find((o) => o.value === confidentiality)?.effect === 'hide_marked';
  const canSubmit = !!conclusion && !!confidentiality && !!institution.trim() && (opinion.trim() || attachments.length > 0) && (!hideMarked || confidentialOpinion.trim());

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    setError('');
    setParseNote('');
    try {
      const { prefill } = await source.parse(file);
      setUploadedFormName(file.name);
      if (prefill.conclusion) setConclusion(prefill.conclusion);
      if (prefill.confidentiality) setConfidentiality(prefill.confidentiality);
      if (prefill.institution) setInstitution(prefill.institution);
      if (prefill.extraText && !opinion.trim()) setOpinion(prefill.extraText);
      const missing = [!prefill.conclusion && (he ? 'מסקנה' : 'conclusion'), !prefill.confidentiality && (he ? 'בקשת חיסיון' : 'confidentiality request')].filter(Boolean);
      setParseNote(missing.length
        ? (he ? `הטופס נקרא. לא זוהו: ${missing.join(', ')} — יש לבחור ידנית. בדוק/י את כל הפרטים לפני החתימה.` : `The form was read. Not detected: ${missing.join(', ')} — choose manually. Check every detail before signing.`)
        : (he ? 'הטופס נקרא והפרטים מולאו. בדוק/י אותם לפני החתימה.' : 'The form was read and the details filled in. Check them before signing.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'קריאת הטופס נכשלה' : 'Could not read the form');
    } finally {
      setParsing(false);
    }
  };

  const handleSubmit = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('conclusion', conclusion);
      formData.append('confidentiality', confidentiality);
      formData.append('opinion', opinion);
      formData.append('institution', institution);
      if (hideMarked) formData.append('confidentialOpinion', confidentialOpinion);
      attachments.forEach((f) => formData.append('files', f));
      await source.submit(formData);
      setMessage(he ? 'חוות הדעת נחתמה והוגשה.' : 'The opinion was signed and submitted.');
      setAttachments([]);
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'שליחת הטופס נכשלה' : 'Failed to submit the form');
    } finally {
      setBusy(false);
    }
  };

  const approveGrade = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.approveThesisFinalGrade(view.milestoneId, Object.fromEntries(view.students.map((s) => [s.id, Number(grades[s.id])])));
      setMessage(he ? 'הציון הסופי אושר ונשמר.' : 'The final grade was approved and saved.');
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'אישור הציון נכשל' : 'Failed to approve the grade');
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async () => {
    setBusy(true);
    setError('');
    try {
      await apiClient.sendThesisBackForCorrections(view.milestoneId, sendBackNote);
      setMessage(he ? 'העבודה הוחזרה לסטודנט/ית לתיקונים.' : 'The thesis was returned to the student for corrections.');
      onChanged?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'החזרת העבודה נכשלה' : 'Failed to send the thesis back');
    } finally {
      setBusy(false);
    }
  };

  const radio = 'mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]';
  const editing = view.viewer.kind === 'examiner' && view.viewer.canEdit;
  const self = view.examiners.find((e) => e.isSelf);

  return (
    <div dir={he ? 'rtl' : 'ltr'} className="text-ink">
      <h2 className="text-lg font-bold">{he ? view.titleHe : view.titleEn}</h2>
      <p className="text-xs text-muted">{he ? '(ימולא על ידי הבוחן)' : '(to be filled in by the examiner)'}</p>

      <dl className="mt-4 grid gap-2 rounded-lg border border-line p-3 text-sm">
        {view.viewer.kind === 'examiner' && (
          <div className="flex gap-2"><dt className="shrink-0 font-semibold">{he ? 'שם הבוחן/ת:' : 'Examiner:'}</dt><dd>{self?.opinion?.examinerName ?? view.viewer.defaultName ?? ''}</dd></div>
        )}
        {view.header.map((h) => (
          <div key={h.key} className="flex gap-2">
            <dt className="shrink-0 font-semibold">{he ? h.labelHe : h.labelEn}:</dt>
            <dd>{(he ? h.value : h.valueEn ?? h.value) ?? <span className="text-muted">—</span>}</dd>
          </div>
        ))}
        {view.viewer.kind === 'examiner' && (
          <p className="text-xs text-muted">{he ? 'בפקולטה להנדסת חשמל ואלקטרוניקה, HIT - מכון טכנולוגי חולון.' : 'Faculty of Electrical and Electronics Engineering, HIT — Holon Institute of Technology.'}</p>
        )}
      </dl>

      {view.outcome && (
        <p className="mt-4 rounded-md bg-surface px-3 py-2 text-sm font-medium" role="status">{he ? OUTCOME_TEXT[view.outcome.result].he : OUTCOME_TEXT[view.outcome.result].en}</p>
      )}
      {view.sendBack && !view.outcome && (
        <p className="mt-4 rounded-md bg-surface px-3 py-2 text-sm">
          {he ? `העבודה הוחזרה לתיקונים (סבב ${view.sendBack.round}). ` : `The thesis was returned for corrections (round ${view.sendBack.round}). `}
          {view.viewer.kind !== 'examiner' && <span className="text-muted">{view.sendBack.note}</span>}
        </p>
      )}
      {view.gradeApproved && view.finalGrade != null && view.viewer.kind !== 'examiner' && (
        <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm font-semibold text-success">{he ? `הציון הסופי אושר: ${view.finalGrade}` : `Final grade approved: ${view.finalGrade}`}</p>
      )}

      {editing && (
        <div className="mt-5 grid gap-5">
          {/* Upload the filled Word form → pre-fill */}
          <div className="rounded-lg border border-dashed border-line p-3">
            <p className="text-sm font-semibold">{he ? 'מילאת את הטופס בקובץ Word? אפשר להעלות אותו' : 'Filled in the Word form? You can upload it'}</p>
            <p className="mt-1 text-xs text-muted">{he ? 'המערכת תקרא את הטופס ותמלא את הפרטים למטה. הקובץ יצורף לחוות הדעת.' : 'The system reads the form and fills in the details below. The file is attached to your opinion.'}</p>
            <input
              type="file"
              accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => handleUpload(e.target.files?.[0])}
              disabled={parsing}
              aria-label={he ? 'העלאת טופס הבוחן הממולא' : 'Upload the filled examiner form'}
              className="mt-2 w-full text-sm"
            />
            {parsing && <p className="mt-2 text-xs text-muted">{he ? 'קורא את הטופס…' : 'Reading the form…'}</p>}
            {uploadedFormName && <p className="mt-2 text-xs text-muted">📎 {uploadedFormName}</p>}
            {parseNote && <p className="mt-2 rounded-md bg-surface px-2 py-1.5 text-xs" role="status">{parseNote}</p>}
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{he ? 'המוסד' : 'Institution'}</span>
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </label>

          <fieldset>
            <legend className="text-sm font-semibold">{he ? 'מסקנות' : 'Conclusion'}</legend>
            <div className="mt-2 grid gap-2">
              {view.conclusions.map((c) => (
                <label key={c.value} className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm ${conclusion === c.value ? 'border-primary bg-surface' : 'border-line'}`}>
                  <input type="radio" name="conclusion" value={c.value} checked={conclusion === c.value} onChange={() => setConclusion(c.value)} className={radio} />
                  <span>{he ? c.labelHe : c.labelEn}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">{he ? 'בקשת חיסיון' : 'Confidentiality request'}</legend>
            <p className="mt-1 text-xs text-muted">{he ? 'טופס זה חסוי בפני הסטודנט והמנחה/ים. חוות הדעת המפורטת מובאת לידיעת הסטודנט והמנחה בהתאם לבקשתך.' : 'This form is confidential from the student and supervisor(s). The detailed opinion is shared with them according to your request.'}</p>
            <div className="mt-2 grid gap-2">
              {view.confidentialityOptions.map((o) => (
                <label key={o.value} className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 text-sm ${confidentiality === o.value ? 'border-primary bg-surface' : 'border-line'}`}>
                  <input type="radio" name="confidentiality" value={o.value} checked={confidentiality === o.value} onChange={() => setConfidentiality(o.value)} className={radio} />
                  <span>{he ? o.labelHe : o.labelEn}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{he ? 'חוות דעת מפורטת' : 'Detailed opinion'}</span>
            <textarea rows={8} value={opinion} onChange={(e) => setOpinion(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </label>
          {hideMarked && (
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">{he ? 'החלקים שלא יועברו לסטודנט ולמנחה' : 'Parts not to be passed on to the student and supervisor'}</span>
              <textarea rows={4} value={confidentialOpinion} onChange={(e) => setConfidentialOpinion(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{he ? 'צירוף חוות הדעת כקובץ (אופציונלי)' : 'Attach the opinion as a file (optional)'}</span>
            <input type="file" multiple onChange={(e) => setAttachments(Array.from(e.target.files ?? []))} className="w-full text-sm" />
            {confidentiality && view.confidentialityOptions.find((o) => o.value === confidentiality)?.effect !== 'none' && (
              <span className="mt-1 block text-xs text-muted">{he ? 'שים/י לב: בבקשת חיסיון, קבצים מצורפים לא יוצגו למנחה — רק לרכז/ת.' : 'Note: with a confidentiality request, attached files are shown to the coordinator only, not the supervisor.'}</span>
            )}
          </label>

          <div>
            <p className="text-xs text-muted">{he ? 'בהגשה הטופס ייחתם דיגיטלית בשמך, עם התאריך וקוד חתימה ייחודי. ניתן לעדכן ולחתום מחדש עד שכל הבוחנים יגישו.' : 'Submitting signs the form digitally in your name, with the date and a unique signature code. You can update and re-sign until every examiner has submitted.'}</p>
            <button type="button" onClick={handleSubmit} disabled={busy || !canSubmit} className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
              {busy ? '…' : he ? '✍️ חתום/י והגש/י' : '✍️ Sign & submit'}
            </button>
          </div>
        </div>
      )}

      {view.viewer.kind === 'examiner' && !view.viewer.canEdit && view.viewer.lockedReasonHe && (
        <p className="mt-4 rounded-md bg-surface px-3 py-2 text-sm text-muted">{he ? view.viewer.lockedReasonHe : view.viewer.lockedReasonEn}</p>
      )}

      {/* Submitted opinions, as this viewer may see them */}
      <div className="mt-6 grid gap-4">
        {view.examiners.filter((e) => e.opinion && !(editing && e.isSelf)).map((e) => {
          const o = e.opinion!;
          const label = e.name ?? (he ? `בוחן/ת ${e.index + 1} (שם חסוי)` : `Examiner ${e.index + 1} (name withheld)`);
          return (
            <section key={e.index} className="rounded-lg border border-line p-3" aria-label={label}>
              <p className="text-sm font-semibold">{label}{o.institution ? ` · ${o.institution}` : ''}</p>
              <p className="mt-2 text-sm"><span className="font-semibold">{he ? 'מסקנה: ' : 'Conclusion: '}</span>{labelOf(view.conclusions, o.conclusion)}</p>
              <p className="mt-1 text-sm"><span className="font-semibold">{he ? 'בקשת חיסיון: ' : 'Confidentiality: '}</span>{labelOf(view.confidentialityOptions, o.confidentiality)}</p>
              {o.opinion && <p className="mt-2 whitespace-pre-wrap rounded-md bg-surface p-2 text-sm">{o.opinion}</p>}
              {o.confidentialOpinion && (
                <div className="mt-2 rounded-md border border-danger p-2 text-sm">
                  <p className="text-xs font-semibold text-danger">{he ? 'חלקים חסויים (לא מועברים לסטודנט ולמנחה)' : 'Confidential parts (not passed on to the student and supervisor)'}</p>
                  <p className="mt-1 whitespace-pre-wrap">{o.confidentialOpinion}</p>
                </div>
              )}
              {(o.fileUrls.length > 0 || o.uploadedFormUrl) && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {o.uploadedFormUrl && <a href={o.uploadedFormUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-line px-2 py-1 hover:border-primary">📄 {he ? 'הטופס שהועלה' : 'Uploaded form'}</a>}
                  {o.fileUrls.map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-line px-2 py-1 hover:border-primary">📎 {he ? `קובץ ${i + 1}` : `File ${i + 1}`}</a>)}
                </div>
              )}
              <div className="mt-3">
                {o.signedAnonymously
                  ? <p className="text-xs text-success">✓ {he ? 'נחתם דיגיטלית (שם הבוחן/ת חסוי לבקשתו/ה)' : "Digitally signed (the examiner's name is withheld at their request)"}</p>
                  : <SignatureBlock he={he} label={he ? 'חתימה' : 'Signature'} signature={o.signature} pendingText="" />}
              </div>
            </section>
          );
        })}
        {view.viewer.kind !== 'examiner' && view.examiners.filter((e) => !e.opinion).map((e) => (
          <p key={`p${e.index}`} className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">
            {e.name ? (he ? `ממתין לחוות הדעת של ${e.name}` : `Awaiting ${e.name}'s opinion`) : he ? `ממתין לחוות דעת של בוחן/ת ${e.index + 1}` : `Awaiting examiner ${e.index + 1}'s opinion`}
          </p>
        ))}
      </div>

      {/* Administrative coordinator actions */}
      {view.viewer.kind === 'staff' && view.outcome?.result === 'continue' && !view.gradeApproved && (
        <div className="mt-6 rounded-lg border border-line p-3">
          <p className="text-sm font-semibold">{he ? 'הזנת הציון הסופי ואישורו' : 'Enter and approve the final grade'}</p>
          <div className="mt-3 grid gap-2">
            {view.students.map((s) => (
              <label key={s.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-[8rem]">{s.name}</span>
                <input type="number" min={0} max={100} value={grades[s.id] ?? ''} onChange={(e) => setGrades({ ...grades, [s.id]: e.target.value })} className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-center text-sm" aria-label={he ? `ציון סופי — ${s.name}` : `Final grade — ${s.name}`} />
                <span className="text-xs text-muted">/100</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{he ? 'האישור ייחתם דיגיטלית בשמך. השמירה במכלול תתבצע כשהחיבור למכלול יופעל.' : 'The approval is signed digitally in your name. Saving to Michlol happens once the Michlol connection is enabled.'}</p>
          <button
            type="button"
            onClick={approveGrade}
            disabled={busy || view.students.some((s) => grades[s.id] === undefined || grades[s.id] === '' || Number(grades[s.id]) < 0 || Number(grades[s.id]) > 100)}
            className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {he ? '✍️ אשר/י וחתום/י' : '✍️ Approve & sign'}
          </button>
        </div>
      )}
      {view.viewer.kind === 'staff' && (view.outcome?.result === 'revise' || view.outcome?.result === 'reject') && (
        <div className="mt-6 rounded-lg border border-line p-3">
          <p className="text-sm font-semibold">{he ? 'החזרת העבודה לסטודנט/ית לתיקונים' : 'Return the thesis to the student for corrections'}</p>
          <p className="mt-1 text-xs text-muted">
            {he
              ? 'הסטודנט/ית יראה/תראה את ההודעה ויגיש/תגיש גרסה מתוקנת. רק הבוחנים שביקשו שינויים יבחנו אותה שוב.'
              : 'The student sees your message and submits a corrected version. Only the examiners who asked for changes review it again.'}
          </p>
          <textarea rows={3} value={sendBackNote} onChange={(e) => setSendBackNote(e.target.value)} placeholder={he ? 'הודעה לסטודנט/ית (חובה)' : 'Message to the student (required)'} className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
          <button type="button" onClick={sendBack} disabled={busy || !sendBackNote.trim()} className="mt-2 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface disabled:opacity-60">
            {he ? 'החזר/י לתיקונים' : 'Return for corrections'}
          </button>
        </div>
      )}

      {view.viewer.kind === 'staff' && view.history.length > 0 && (
        <details className="mt-6 rounded-lg border border-line p-3 text-sm">
          <summary className="cursor-pointer font-semibold">{he ? `חוות דעת מסבבים קודמים (${view.history.length})` : `Opinions from earlier rounds (${view.history.length})`}</summary>
          <div className="mt-2 grid gap-2">
            {view.history.map((h, i) => (
              <div key={i} className="rounded-md bg-surface p-2">
                <p className="font-semibold">{h.examinerName} · {he ? `סבב ${h.round}` : `Round ${h.round}`}</p>
                <p>{labelOf(view.conclusions, h.conclusion)}</p>
                {h.opinion && <p className="mt-1 whitespace-pre-wrap text-muted">{h.opinion}</p>}
              </div>
            ))}
          </div>
        </details>
      )}

      {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {message && <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">{message}</p>}
    </div>
  );
}

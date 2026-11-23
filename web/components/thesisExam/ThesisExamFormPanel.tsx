'use client';

// components/thesisExam/ThesisExamFormPanel.tsx
// The faculty's "טופס מבחן תיזה" (server's services/thesisExam.ts
// CS_THESIS_EXAM_FORM). The header is filled by the system.
//
// Since 2026-11-23 the supervisor is the exam's chairman and fills the whole
// form — research 40% (their opinion), writing 40% (agreed with the
// examiners), defense 20% — and sending it is their signature. The examiners
// grade nothing: they see the project's details and, once the chairman sent
// the form, sign it (here, from the emailed link, or on the outside
// examiner's access page). Reviewers (committee / heads / coordinator) read it.
//
// Older exams, where the examiners filled their own forms, still render
// their forms (`legacy`). The data source is passed in, so the outside
// examiner's page and the emailed sign link reuse this panel.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ThesisExamChairForm, ThesisExamChairFormInput, ThesisExamFormView, ThesisExamSignatureInfo, ThesisExamSubmittedForm } from '@/lib/apiClient';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export interface ThesisExamFormSource {
  load: () => Promise<ThesisExamFormView>;
  /** The supervisor (exam chairman) sends the form — logged-in page only. */
  submitChair?: (body: ThesisExamChairFormInput) => Promise<unknown>;
  /** An examiner signs the chairman's form. */
  sign?: () => Promise<unknown>;
  /** Older exams only: the supervisor's separate research grade. */
  submitSupervisor?: (research: number) => Promise<unknown>;
}

export function ThesisExamFormPanel({ source, lang, onSubmitted }: { source: ThesisExamFormSource; lang: 'he' | 'en'; onSubmitted?: () => void }) {
  const he = lang === 'he';
  const [view, setView] = useState<ThesisExamFormView | null>(null);
  const [error, setError] = useState('');
  const [components, setComponents] = useState<Record<string, number | ''>>({});
  const [research, setResearch] = useState<number | ''>('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  /** Which send is waiting on the in-app confirm dialog. */
  const [confirming, setConfirming] = useState<null | 'chair' | 'sign' | 'research'>(null);

  const load = useCallback(async () => {
    try {
      setView(await source.load());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'הטעינה נכשלה' : 'Failed to load');
    }
  }, [source, he]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  if (error && !view) return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>;
  if (!view) return <p className="text-sm text-muted">…</p>;
  const { form } = view;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השליחה נכשלה' : 'Sending failed');
    } finally {
      setBusy(false);
    }
  };

  const askChair = () => {
    if (form.gradeComponents.some((c) => components[c.key] === '' || components[c.key] == null)) { setError(he ? 'יש למלא ציון לכל אחד משלושת הרכיבים.' : 'Fill in a score for each of the three components.'); return; }
    if (form.gradeComponents.some((c) => Number(components[c.key]) < 1 || Number(components[c.key]) > 100)) { setError(he ? 'ציון כל רכיב בין 1 ל-100.' : 'Each component score is 1–100.'); return; }
    setError('');
    setConfirming('chair');
  };

  const askResearch = () => {
    if (research === '' || research < 1 || research > 100) { setError(he ? 'ציון המחקר בין 1 ל-100.' : 'The research score is 1–100.'); return; }
    setError('');
    setConfirming('research');
  };

  const confirmSend = async () => {
    const which = confirming;
    if (which === 'chair' && source.submitChair) {
      await run(() => source.submitChair!({ components: Object.fromEntries(form.gradeComponents.map((c) => [c.key, Number(components[c.key])])), comments }));
    } else if (which === 'sign' && source.sign) {
      await run(() => source.sign!());
    } else if (which === 'research' && source.submitSupervisor) {
      await run(() => source.submitSupervisor!(Number(research)));
    }
    setConfirming(null);
  };

  const locked = (he ? view.lockedReasonHe : view.lockedReasonEn);
  const draftFinal = form.gradeComponents.every((c) => components[c.key] !== '' && components[c.key] != null)
    ? Math.round(form.gradeComponents.reduce((sum, c) => sum + Number(components[c.key]) * c.weight, 0) / 10) / 10
    : null;

  let body: ReactNode;
  if (view.chair) {
    body = (
      <>
        <ChairFormView chair={view.chair} view={view} lang={lang} />
        <Signatures view={view} lang={lang} />
        {view.canSign && source.sign && (
          <div className="mt-4 rounded-lg border border-primary/40 bg-paper p-3 text-sm">
            <p>{he ? 'בלחיצה על "חתימה" את/ה מאשר/ת את טופס הבחינה כפי שמילא אותו יו"ר הבחינה. החתימה נשמרת דיגיטלית.' : "By clicking \"Sign\" you approve the exam form as the exam's chairman filled it. The signature is stored digitally."}</p>
            {error && <p className="mt-2 text-danger" role="alert">{error}</p>}
            <button type="button" onClick={() => setConfirming('sign')} disabled={busy} className="mt-3 rounded-full bg-primary px-5 py-2 font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
              {busy ? '…' : he ? '✍️ חתימה על הטופס' : '✍️ Sign the form'}
            </button>
          </div>
        )}
      </>
    );
  } else if (view.viewerKind === 'supervisor' && view.canEdit && source.submitChair) {
    body = (
      <>
        <p className="mt-4 rounded-md bg-paper px-3 py-2 text-sm text-muted">
          {he
            ? 'כיו"ר הבחינה, את/ה ממלא/ת את שלושת רכיבי הציון. ציון כתיבת התזה נקבע בדיון בינך לבין הבוחנים. לאחר השליחה הטופס ייחתם בשמך, וכל בוחן/ת יקבל/תקבל דוא"ל לחתימה. רק לאחר שכולם יחתמו הטופס יעבור לאישור ראש בית הספר ללימודים מתקדמים.'
            : "As the exam's chairman you fill in all three grade components. The thesis writing grade is agreed in discussion with the examiners. Once sent, the form is signed in your name and each examiner is emailed to sign it. Only after everyone signs does it go to the grad school head for approval."}
        </p>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-xs text-muted"><th className="text-start">{he ? 'מרכיב הציון' : 'Component'}</th><th>{he ? 'משקל' : 'Weight'}</th><th>{he ? 'ציון (1-100)' : 'Score (1-100)'}</th></tr></thead>
          <tbody>
            {form.gradeComponents.map((c) => (
              <tr key={c.key} className="border-t border-line align-top">
                <td className="py-2">
                  <label htmlFor={`comp-${c.key}`}>{he ? c.labelHe : c.labelEn}</label>
                  <span className="block text-xs text-muted">{he ? c.noteHe : c.noteEn}</span>
                </td>
                <td className="py-2 text-center">{c.weight}%</td>
                <td className="py-2 text-center">
                  <input id={`comp-${c.key}`} type="number" min={1} max={100} value={components[c.key] ?? ''} onChange={(e) => setComponents((s) => ({ ...s, [c.key]: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-20 rounded-md border border-line bg-paper px-2 py-1 text-center text-sm" />
                </td>
              </tr>
            ))}
            <tr className="border-t border-line font-bold">
              <td className="py-2">{he ? 'ציון סופי (משוקלל)' : 'Final grade (weighted)'}</td>
              <td />
              <td className="py-2 text-center">{draftFinal ?? '—'}</td>
            </tr>
          </tbody>
        </table>
        <label htmlFor="exam-comments" className="mt-4 block text-sm font-semibold">{he ? 'הערות (לא חובה)' : 'Comments (optional)'}</label>
        <textarea id="exam-comments" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
        <GradeKey view={view} lang={lang} />
        {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
        <button type="button" onClick={askChair} disabled={busy} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
          {busy ? '…' : he ? 'חתימה ושליחה לבוחנים' : 'Sign and send to the examiners'}
        </button>
      </>
    );
  } else if (view.legacy || view.supervisorGrade || view.legacyResearchOpen) {
    // Older exams — the examiners filled their own forms.
    body = view.viewerKind === 'reviewer' && view.all ? <ReviewerForms view={view} lang={lang} />
      : view.viewerKind === 'supervisor' ? <LegacySupervisorGrade view={view} lang={lang} research={research} setResearch={setResearch} onSubmit={askResearch} busy={busy} error={error} canSubmit={!!source.submitSupervisor} />
      : view.mine ? <SubmittedForm form={view.mine} view={view} lang={lang} />
      : <p className="mt-4 rounded-md bg-surface px-3 py-2 text-sm text-muted" role="status">{locked}</p>;
  } else {
    body = <p className="mt-4 rounded-md bg-surface px-3 py-2 text-sm text-muted" role="status">{locked ?? (he ? 'הטופס טרם נשלח.' : 'The form has not been sent yet.')}</p>;
  }

  return (
    <div className="text-ink">
      <h2 className="text-lg font-bold">{he ? form.titleHe : form.titleEn}</h2>

      <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-lg border border-line bg-paper p-3 text-sm sm:grid-cols-2">
        {view.header.filter((h) => h.value).map((h) => (
          <div key={h.key} className="flex gap-2">
            <dt className="shrink-0 text-muted">{he ? h.labelHe : h.labelEn}:</dt>
            <dd className="font-medium">{h.value}</dd>
          </div>
        ))}
      </dl>

      {body}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'sign' ? (he ? 'חתימה על טופס הבחינה' : 'Sign the exam form') : (he ? 'חתימה ושליחה' : 'Sign and send')}
        message={confirming === 'sign'
          ? (he ? 'לחתום על טופס הבחינה? לא ניתן לבטל את החתימה.' : "Sign the exam form? The signature can't be undone.")
          : confirming === 'chair'
            ? (he ? `לאחר השליחה הטופס ייחתם דיגיטלית בשמך ולא ניתן יהיה לשנותו, והבוחנים יתבקשו לחתום עליו. ציון סופי: ${draftFinal ?? '—'}. לשלוח?` : `Once sent, the form is digitally signed in your name and can't be changed, and the examiners are asked to sign it. Final grade: ${draftFinal ?? '—'}. Send?`)
            : (he ? 'לאחר השליחה הציון ייחתם דיגיטלית ולא ניתן יהיה לשנותו. לשלוח?' : 'Once sent, the grade is digitally signed and cannot be changed. Send?')}
        confirmLabel={confirming === 'sign' ? (he ? 'חתימה' : 'Sign') : (he ? 'שליחה' : 'Send')}
        cancelLabel={he ? 'ביטול' : 'Cancel'}
        busy={busy}
        onConfirm={() => { void confirmSend(); }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

function GradeKey({ view, lang }: { view: ThesisExamFormView; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  return (
    <details className="mt-3 rounded-md border border-line bg-paper p-2 text-xs">
      <summary className="cursor-pointer font-semibold">{he ? 'מפתח ציונים ודגשים' : 'Grade key'}</summary>
      <table className="mt-2 w-full">
        <tbody>
          {view.form.gradeKey.map((g) => (
            <tr key={g.range} className="border-t border-line align-top">
              <td className="py-1 pe-2 font-semibold">{g.range}</td>
              <td className="py-1 pe-2">{he ? g.statusHe : g.statusEn}</td>
              <td className="py-1 text-muted">{he ? g.publicationHe : g.publicationEn}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Signature({ sig, he }: { sig: ThesisExamSignatureInfo; he: boolean }) {
  return (
    <p className="text-xs text-muted">
      ✍️ {he ? `נחתם דיגיטלית על ידי ${sig.signerName}` : `Digitally signed by ${sig.signerName}`} · {new Date(sig.signedAt).toLocaleString(he ? 'he-IL' : 'en-GB')} · {sig.code}
    </p>
  );
}

function ChairFormView({ chair, view, lang }: { chair: ThesisExamChairForm; view: ThesisExamFormView; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  const value = (key: string) => (key === 'research' ? chair.research : key === 'writing' ? chair.writing : chair.defense);
  return (
    <section className="mt-4 rounded-lg border border-line bg-paper p-3 text-sm">
      <h3 className="font-bold">{he ? 'ציון משוקלל' : 'Weighted grade'}</h3>
      <ul className="mt-2 grid gap-1">
        {view.form.gradeComponents.map((c) => (
          <li key={c.key} className="flex justify-between gap-2">
            <span>
              {he ? c.labelHe : c.labelEn} ({c.weight}%)
              <span className="block text-xs text-muted">{he ? c.noteHe : c.noteEn}</span>
            </span>
            <span className="font-semibold">{value(c.key) ?? '—'}</span>
          </li>
        ))}
        <li className="flex justify-between gap-2 border-t border-line pt-1 font-bold">
          <span>{he ? 'ציון סופי' : 'Final grade'}</span>
          <span>{chair.finalGrade ?? '—'}</span>
        </li>
      </ul>
      {chair.comments && (
        <div className="mt-2">
          <p className="font-semibold">{he ? 'הערות' : 'Comments'}</p>
          <p className="whitespace-pre-wrap">{chair.comments}</p>
        </div>
      )}
      <div className="mt-2">
        <p className="text-xs font-semibold">{he ? `יו"ר הבחינה: ${chair.chairName}` : `Exam chairman: ${chair.chairName}`}</p>
        <Signature sig={chair.signature} he={he} />
      </div>
      <GradeKey view={view} lang={lang} />
    </section>
  );
}

function Signatures({ view, lang }: { view: ThesisExamFormView; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  if (view.signatures.length === 0) return null;
  return (
    <section className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
      <h3 className="font-bold">{he ? `חתימות הבוחנים (${view.signedCount}/${view.signatures.length})` : `Examiners' signatures (${view.signedCount}/${view.signatures.length})`}</h3>
      <ul className="mt-2 grid gap-2">
        {view.signatures.map((s) => (
          <li key={s.index}>
            <span className="font-medium">{s.name}{s.isMe ? (he ? ' (את/ה)' : ' (you)') : ''}</span>
            {s.signed && s.signature
              ? <Signature sig={s.signature} he={he} />
              : <span className="block text-xs text-danger">{he ? 'ממתין לחתימה' : 'Awaiting signature'}</span>}
          </li>
        ))}
      </ul>
      {view.signedCount < view.signatures.length && (
        <p className="mt-2 text-xs text-muted">{he ? 'הטופס יעבור לאישור ראש בית הספר ללימודים מתקדמים לאחר שכל הבוחנים יחתמו.' : 'The form goes to the grad school head once every examiner signs.'}</p>
      )}
    </section>
  );
}

// ── Older exams (before 2026-11-23) ─────────────────────────────────────────

function LegacySupervisorGrade({ view, lang, research, setResearch, onSubmit, busy, error, canSubmit }: {
  view: ThesisExamFormView; lang: 'he' | 'en'; research: number | ''; setResearch: (v: number | '') => void; onSubmit: () => void; busy: boolean; error: string; canSubmit: boolean;
}) {
  const he = lang === 'he';
  const c = view.form.gradeComponents.find((g) => g.key === 'research');
  if (!c) return null;
  const given = view.supervisorGrade;
  return (
    <div className="mt-4 grid gap-2 text-sm">
      {given ? (
        <>
          <div className="flex justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2">
            <span>{he ? c.labelHe : c.labelEn} ({c.weight}%)</span>
            <span className="font-semibold">{given.research}</span>
          </div>
          <Signature sig={given.signature} he={he} />
        </>
      ) : view.legacyResearchOpen && canSubmit ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2">
            <label htmlFor="supervisor-research">{he ? c.labelHe : c.labelEn} ({c.weight}%) — {he ? 'ציון 1-100' : 'score 1-100'}</label>
            <input id="supervisor-research" type="number" min={1} max={100} value={research} onChange={(e) => setResearch(e.target.value === '' ? '' : Number(e.target.value))} className="w-20 rounded-md border border-line bg-paper px-2 py-1 text-center text-sm" />
          </div>
          <GradeKey view={view} lang={lang} />
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <button type="button" onClick={onSubmit} disabled={busy} className="justify-self-start rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
            {busy ? '…' : he ? 'חתימה ושליחה' : 'Sign and send'}
          </button>
        </>
      ) : (
        <p className="rounded-md bg-surface px-3 py-2 text-muted" role="status">{(he ? view.lockedReasonHe : view.lockedReasonEn) ?? (he ? 'טרם ניתן ציון.' : 'No grade given yet.')}</p>
      )}
    </div>
  );
}

function SubmittedForm({ form, view, lang }: { form: ThesisExamSubmittedForm; view: ThesisExamFormView; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  const writing = view.form.gradeComponents.find((c) => c.key === 'writing');
  return (
    <div className="mt-4 grid gap-2 text-sm">
      <ol className="grid gap-1">
        {view.form.questions.map((q, i) => (
          <li key={q.key} className="flex justify-between gap-2 border-b border-line py-1">
            <span>{i + 1}. {he ? q.labelHe : q.labelEn}</span>
            <span className="font-semibold">{form.ratings[q.key]}</span>
          </li>
        ))}
      </ol>
      {form.comments && (
        <div>
          <p className="font-semibold">{he ? 'הערות כלליות' : 'General comments'}</p>
          <p className="whitespace-pre-wrap text-ink">{form.comments}</p>
        </div>
      )}
      <ul className="grid gap-1">
        {writing && (
          <li className="flex justify-between gap-2">
            <span>{he ? writing.labelHe : writing.labelEn} ({writing.weight}%)</span>
            <span className="font-semibold">{form.components.writing ?? '—'}</span>
          </li>
        )}
        <li className="flex justify-between gap-2 text-muted">
          <span>{he ? 'ממוצע סעיפים 1–5 (תרומה לרכיב מבחן ההגנה)' : 'Average of items 1–5 (share of the defense component)'}</span>
          <span className="font-semibold">{form.defenseContribution}</span>
        </li>
      </ul>
      <Signature sig={form.signature} he={he} />
    </div>
  );
}

function ReviewerForms({ view, lang }: { view: ThesisExamFormView; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  const s = view.summary;
  const source = (key: string) => key === 'research' ? (he ? 'ציון המנחה' : "Supervisor's grade") : key === 'writing' ? (he ? 'ממוצע הבוחנים' : "Examiners' average") : (he ? 'מחושב אוטומטית: ממוצע סעיפים 1–5 של כל הבוחנים' : 'Computed: the average of items 1–5 across all examiners');
  return (
    <div className="mt-4 grid gap-4">
      <p className="text-sm text-muted">{he ? `${view.submittedCount} מתוך ${view.examinerCount} בוחנים הגישו.` : `${view.submittedCount} of ${view.examinerCount} examiners submitted.`}</p>
      {s && (
        <section className="rounded-lg border border-line bg-paper p-3 text-sm">
          <h3 className="font-bold">{he ? 'ציון משוקלל' : 'Combined grade'}</h3>
          <ul className="mt-2 grid gap-1">
            {view.form.gradeComponents.map((c) => (
              <li key={c.key} className="flex justify-between gap-2">
                <span>
                  {he ? c.labelHe : c.labelEn} ({c.weight}%)
                  <span className="block text-xs text-muted">{source(c.key)}</span>
                </span>
                <span className="font-semibold">{s[c.key as 'research' | 'writing' | 'defense'] ?? '—'}</span>
              </li>
            ))}
            <li className="flex justify-between gap-2 border-t border-line pt-1 font-bold">
              <span>{he ? 'ציון סופי' : 'Final grade'}</span>
              <span>{s.finalGrade ?? '—'}</span>
            </li>
          </ul>
          {view.supervisorGrade && <div className="mt-1"><Signature sig={view.supervisorGrade.signature} he={he} /></div>}
        </section>
      )}
      {view.all!.map((e) => (
        <section key={e.index} className="rounded-lg border border-line bg-surface p-3">
          <h3 className="text-sm font-bold">{he ? `שופט/ת ${e.index + 1}: ${e.name}` : `Judge ${e.index + 1}: ${e.name}`}</h3>
          {e.form ? <SubmittedForm form={e.form} view={view} lang={lang} /> : <p className="mt-1 text-sm text-muted">{he ? 'טרם הוגש' : 'Not submitted yet'}</p>}
        </section>
      ))}
      <GradeKey view={view} lang={lang} />
    </div>
  );
}

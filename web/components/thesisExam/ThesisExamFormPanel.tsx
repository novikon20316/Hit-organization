'use client';

// components/thesisExam/ThesisExamFormPanel.tsx
// The faculty's "טופס מבחן תיזה" (server's services/thesisExam.ts
// CS_THESIS_EXAM_FORM). The header is filled by the system. Each grade
// component has one owner (CS faculty, 2026-11-17):
//   research (40%) — the supervisor only; examiners never see it,
//   writing (40%)  — each examiner,
//   defense (20%)  — computed: mean of ratings 1–5 per examiner, averaged.
// An examiner fills the ratings, comments and the writing score and signs by
// submitting; the supervisor gives only the research score; a reviewer
// (committee / heads) reads every form plus the combined grade. The data
// source is passed in, so the outside examiner's access page reuses it.

import { useCallback, useEffect, useState } from 'react';
import type { ThesisExamFormInput, ThesisExamFormView, ThesisExamSubmittedForm } from '@/lib/apiClient';

export interface ThesisExamFormSource {
  load: () => Promise<ThesisExamFormView>;
  submit: (body: ThesisExamFormInput) => Promise<unknown>;
  /** The supervisor's research grade — only on the logged-in page. */
  submitSupervisor?: (research: number) => Promise<unknown>;
}

type Component = ThesisExamFormView['form']['gradeComponents'][number];

function ownerNote(c: Component, he: boolean): string {
  if (c.source === 'supervisor') return he ? 'ממולא על ידי המנחה בלבד' : 'Filled in by the supervisor only';
  if (c.source === 'computed') return he ? 'מחושב אוטומטית: ממוצע סעיפים 1–5 של כל הבוחנים' : 'Computed: the average of items 1–5 across all examiners';
  return '';
}

function avgRatings(form: ThesisExamFormView['form'], ratings: Record<string, number | ''>): number | null {
  if (form.questions.some((q) => ratings[q.key] === '' || ratings[q.key] == null)) return null;
  const avg = form.questions.reduce((sum, q) => sum + Number(ratings[q.key]), 0) / form.questions.length;
  return Math.round(avg * 100) / 10;
}

export function ThesisExamFormPanel({ source, lang, onSubmitted }: { source: ThesisExamFormSource; lang: 'he' | 'en'; onSubmitted?: () => void }) {
  const he = lang === 'he';
  const [view, setView] = useState<ThesisExamFormView | null>(null);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState<Record<string, number | ''>>({});
  const [components, setComponents] = useState<Record<string, number | ''>>({});
  const [research, setResearch] = useState<number | ''>('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);

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
  const examinerComponents = form.gradeComponents.filter((c) => c.source === 'examiner');
  const myDefense = avgRatings(form, ratings);

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

  const submit = async () => {
    if (form.questions.some((q) => ratings[q.key] === '' || ratings[q.key] == null)) { setError(he ? 'יש לדרג את כל השאלות.' : 'Rate every question.'); return; }
    if (examinerComponents.some((c) => components[c.key] === '' || components[c.key] == null)) { setError(he ? 'יש למלא ציון לכל מרכיב.' : 'Fill in a score for every component.'); return; }
    if (examinerComponents.some((c) => Number(components[c.key]) < 1 || Number(components[c.key]) > 100)) { setError(he ? 'ציון כל מרכיב בין 1 ל-100.' : 'Each component score is 1–100.'); return; }
    if (!window.confirm(he ? 'לאחר השליחה הטופס ייחתם דיגיטלית ולא ניתן יהיה לשנותו. לשלוח?' : 'Once sent, the form is digitally signed and cannot be changed. Send?')) return;
    await run(() => source.submit({
      ratings: Object.fromEntries(form.questions.map((q) => [q.key, Number(ratings[q.key])])),
      components: Object.fromEntries(examinerComponents.map((c) => [c.key, Number(components[c.key])])),
      comments,
    }));
  };

  const submitResearch = async () => {
    if (!source.submitSupervisor) return;
    if (research === '' || research < 1 || research > 100) { setError(he ? 'ציון המחקר בין 1 ל-100.' : 'The research score is 1–100.'); return; }
    if (!window.confirm(he ? 'לאחר השליחה הציון ייחתם דיגיטלית ולא ניתן יהיה לשנותו. לשלוח?' : 'Once sent, the grade is digitally signed and cannot be changed. Send?')) return;
    await run(() => source.submitSupervisor!(Number(research)));
  };

  return (
    <div className="text-ink">
      <h2 className="text-lg font-bold">{he ? form.titleHe : form.titleEn}</h2>

      <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-lg border border-line bg-paper p-3 text-sm sm:grid-cols-2">
        {view.header.map((h) => (
          <div key={h.key} className="flex gap-2">
            <dt className="shrink-0 text-muted">{he ? h.labelHe : h.labelEn}:</dt>
            <dd className="font-medium">{h.value ?? '—'}</dd>
          </div>
        ))}
      </dl>

      {view.viewerKind === 'reviewer' && view.all ? (
        <ReviewerForms view={view} lang={lang} />
      ) : view.viewerKind === 'supervisor' ? (
        <SupervisorGrade view={view} lang={lang} research={research} setResearch={setResearch} onSubmit={submitResearch} busy={busy} error={error} canSubmit={!!source.submitSupervisor} />
      ) : view.mine ? (
        <SubmittedForm form={view.mine} view={view} lang={lang} />
      ) : view.canEdit ? (
        <>
          <p className="mt-4 text-sm font-semibold">
            {he
              ? `נא לענות על השאלות הבאות (דירוג מ-${form.ratingScale.min} (${form.ratingScale.minLabelHe}) ועד ${form.ratingScale.max} (${form.ratingScale.maxLabelHe})):`
              : `Answer the following (rating ${form.ratingScale.min} (${form.ratingScale.minLabelEn}) to ${form.ratingScale.max} (${form.ratingScale.maxLabelEn})):`}
          </p>
          <ol className="mt-2 grid gap-2">
            {form.questions.map((q, i) => (
              <li key={q.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm">
                <label htmlFor={`rating-${q.key}`} className="min-w-0 flex-1">{i + 1}. {he ? q.labelHe : q.labelEn}</label>
                <select
                  id={`rating-${q.key}`}
                  value={ratings[q.key] ?? ''}
                  onChange={(e) => setRatings((r) => ({ ...r, [q.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="rounded-md border border-line bg-paper px-2 py-1 text-sm"
                >
                  <option value="">—</option>
                  {Array.from({ length: form.ratingScale.max - form.ratingScale.min + 1 }, (_, k) => form.ratingScale.min + k).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </li>
            ))}
          </ol>

          <label htmlFor="exam-comments" className="mt-4 block text-sm font-semibold">{he ? 'הערות כלליות' : 'General comments'}</label>
          <textarea id="exam-comments" rows={4} value={comments} onChange={(e) => setComments(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />

          <p className="mt-4 text-sm font-semibold">{he ? 'מפתח לקביעת הציון' : 'Grade breakdown'}</p>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-start text-xs text-muted"><th className="text-start">{he ? 'מרכיב הציון' : 'Component'}</th><th>{he ? 'משקל' : 'Weight'}</th><th>{he ? 'ציון (1-100)' : 'Score (1-100)'}</th></tr></thead>
            <tbody>
              {form.gradeComponents.map((c) => (
                <tr key={c.key} className="border-t border-line align-top">
                  <td className="py-1.5">
                    <label htmlFor={c.source === 'examiner' ? `comp-${c.key}` : undefined}>{he ? c.labelHe : c.labelEn}</label>
                    {c.source !== 'examiner' && <span className="block text-xs text-muted">{ownerNote(c, he)}</span>}
                  </td>
                  <td className="text-center">{c.weight}%</td>
                  <td className="text-center">
                    {c.source === 'examiner' ? (
                      <input id={`comp-${c.key}`} type="number" min={1} max={100} value={components[c.key] ?? ''} onChange={(e) => setComponents((s) => ({ ...s, [c.key]: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-20 rounded-md border border-line bg-paper px-2 py-1 text-center text-sm" />
                    ) : c.source === 'computed' ? (
                      <span className="text-xs text-muted" title={he ? 'התרומה שלך לרכיב' : 'Your contribution to this component'}>{myDefense ?? '—'}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <GradeKey view={view} lang={lang} />

          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
          <button type="button" onClick={submit} disabled={busy} className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60">
            {busy ? '…' : he ? 'חתימה ושליחה' : 'Sign and send'}
          </button>
        </>
      ) : (
        <p className="mt-4 rounded-md bg-surface px-3 py-2 text-sm text-muted" role="status">{he ? view.lockedReasonHe : view.lockedReasonEn}</p>
      )}
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

function Signature({ sig, he }: { sig: ThesisExamSubmittedForm['signature']; he: boolean }) {
  return (
    <p className="text-xs text-muted">
      ✍️ {he ? `נחתם דיגיטלית על ידי ${sig.signerName}` : `Digitally signed by ${sig.signerName}`} · {new Date(sig.signedAt).toLocaleString(he ? 'he-IL' : 'en-GB')} · {sig.code}
    </p>
  );
}

function SupervisorGrade({ view, lang, research, setResearch, onSubmit, busy, error, canSubmit }: {
  view: ThesisExamFormView; lang: 'he' | 'en'; research: number | ''; setResearch: (v: number | '') => void; onSubmit: () => void; busy: boolean; error: string; canSubmit: boolean;
}) {
  const he = lang === 'he';
  const c = view.form.gradeComponents.find((g) => g.source === 'supervisor');
  if (!c) return null;
  const given = view.supervisorGrade;
  return (
    <div className="mt-4 grid gap-2 text-sm">
      <p className="text-muted">
        {he
          ? 'רכיב זה נקבע על ידי המנחה בלבד ואינו גלוי לבוחנים. את שאר הרכיבים ממלאים הבוחנים בטופס שלהם.'
          : "This component is set by the supervisor only and is not shown to the examiners. The examiners fill the other components on their own form."}
      </p>
      {given ? (
        <>
          <div className="flex justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2">
            <span>{he ? c.labelHe : c.labelEn} ({c.weight}%)</span>
            <span className="font-semibold">{given.research}</span>
          </div>
          <Signature sig={given.signature} he={he} />
        </>
      ) : view.canEdit && canSubmit ? (
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
        {view.form.gradeComponents.filter((c) => c.source === 'examiner').map((c) => (
          <li key={c.key} className="flex justify-between gap-2">
            <span>{he ? c.labelHe : c.labelEn} ({c.weight}%)</span>
            <span className="font-semibold">{form.components[c.key] ?? '—'}</span>
          </li>
        ))}
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
  const valueOf = (c: Component) => (s ? s[c.key as 'research' | 'writing' | 'defense'] : null);
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
                  <span className="block text-xs text-muted">
                    {c.source === 'supervisor' ? (he ? 'ציון המנחה' : "Supervisor's grade") : c.source === 'examiner' ? (he ? 'ממוצע הבוחנים' : "Examiners' average") : ownerNote(c, he)}
                  </span>
                </span>
                <span className="font-semibold">{valueOf(c) ?? (c.source === 'supervisor' ? (he ? 'ממתין למנחה' : 'Awaiting supervisor') : '—')}</span>
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

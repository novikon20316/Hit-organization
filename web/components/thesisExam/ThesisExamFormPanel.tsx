'use client';

// components/thesisExam/ThesisExamFormPanel.tsx
// The faculty's "טופס מבחן תיזה" (server's services/thesisExam.ts
// CS_THESIS_EXAM_FORM). The header is filled by the system; an examiner fills
// the ratings, comments and grade components and signs by submitting; a
// reviewer (committee / heads) reads every examiner's form. The data source
// is passed in, so the outside examiner's access page reuses it by token.

import { useCallback, useEffect, useState } from 'react';
import type { ThesisExamFormInput, ThesisExamFormView, ThesisExamSubmittedForm } from '@/lib/apiClient';

export interface ThesisExamFormSource {
  load: () => Promise<ThesisExamFormView>;
  submit: (body: ThesisExamFormInput) => Promise<unknown>;
}

function weighted(form: ThesisExamFormView['form'], components: Record<string, number | ''>): number | null {
  if (form.gradeComponents.some((c) => components[c.key] === '' || components[c.key] == null)) return null;
  const total = form.gradeComponents.reduce((sum, c) => sum + Number(components[c.key]) * c.weight, 0) / 100;
  return Math.round(total * 10) / 10;
}

export function ThesisExamFormPanel({ source, lang, onSubmitted }: { source: ThesisExamFormSource; lang: 'he' | 'en'; onSubmitted?: () => void }) {
  const he = lang === 'he';
  const [view, setView] = useState<ThesisExamFormView | null>(null);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState<Record<string, number | ''>>({});
  const [components, setComponents] = useState<Record<string, number | ''>>({});
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
  const final = weighted(form, components);

  const submit = async () => {
    if (form.questions.some((q) => ratings[q.key] === '' || ratings[q.key] == null)) { setError(he ? 'יש לדרג את כל השאלות.' : 'Rate every question.'); return; }
    if (final == null) { setError(he ? 'יש למלא ציון לכל מרכיב.' : 'Fill in a score for every component.'); return; }
    if (form.gradeComponents.some((c) => Number(components[c.key]) < 1 || Number(components[c.key]) > 100)) { setError(he ? 'ציון כל מרכיב בין 1 ל-100.' : 'Each component score is 1–100.'); return; }
    if (!window.confirm(he ? 'לאחר השליחה הטופס ייחתם דיגיטלית ולא ניתן יהיה לשנותו. לשלוח?' : 'Once sent, the form is digitally signed and cannot be changed. Send?')) return;
    setBusy(true);
    setError('');
    try {
      await source.submit({
        ratings: Object.fromEntries(form.questions.map((q) => [q.key, Number(ratings[q.key])])),
        components: Object.fromEntries(form.gradeComponents.map((c) => [c.key, Number(components[c.key])])),
        comments,
      });
      await load();
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השליחה נכשלה' : 'Sending failed');
    } finally {
      setBusy(false);
    }
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

      {view.all ? (
        <ReviewerForms view={view} lang={lang} />
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
                <tr key={c.key} className="border-t border-line">
                  <td className="py-1.5"><label htmlFor={`comp-${c.key}`}>{he ? c.labelHe : c.labelEn}</label></td>
                  <td className="text-center">{c.weight}%</td>
                  <td className="text-center">
                    <input id={`comp-${c.key}`} type="number" min={1} max={100} value={components[c.key] ?? ''} onChange={(e) => setComponents((s) => ({ ...s, [c.key]: e.target.value === '' ? '' : Number(e.target.value) }))} className="w-20 rounded-md border border-line bg-paper px-2 py-1 text-center text-sm" />
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold">
                <td className="py-1.5">{he ? 'ציון סופי (1-100)' : 'Final grade (1-100)'}</td>
                <td />
                <td className="text-center">{final ?? '—'}</td>
              </tr>
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
        {view.form.gradeComponents.map((c) => (
          <li key={c.key} className="flex justify-between gap-2">
            <span>{he ? c.labelHe : c.labelEn} ({c.weight}%)</span>
            <span className="font-semibold">{form.components[c.key]}</span>
          </li>
        ))}
        <li className="flex justify-between gap-2 border-t border-line pt-1 font-bold">
          <span>{he ? 'ציון סופי' : 'Final grade'}</span>
          <span>{form.finalGrade}</span>
        </li>
      </ul>
      <p className="text-xs text-muted">
        ✍️ {he ? `נחתם דיגיטלית על ידי ${form.signature.signerName}` : `Digitally signed by ${form.signature.signerName}`} · {new Date(form.signature.signedAt).toLocaleString(he ? 'he-IL' : 'en-GB')} · {form.signature.code}
      </p>
    </div>
  );
}

function ReviewerForms({ view, lang }: { view: ThesisExamFormView; lang: 'he' | 'en' }) {
  const he = lang === 'he';
  return (
    <div className="mt-4 grid gap-4">
      <p className="text-sm text-muted">{he ? `${view.submittedCount} מתוך ${view.examinerCount} בוחנים הגישו.` : `${view.submittedCount} of ${view.examinerCount} examiners submitted.`}</p>
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

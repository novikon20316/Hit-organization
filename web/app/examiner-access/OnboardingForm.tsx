'use client';

// app/examiner-access/OnboardingForm.tsx
// One-time onboarding an external examiner completes via their access link:
// professional identity (role/title/institution), bank account details, and
// a tax coordination document — all reused across every future defense this
// same examiner (by email) is invited to, so they're never asked twice. The
// evaluation document is the one per-defense exception: only offered when
// this specific token has no online opinion recorded (see OpinionForm.tsx/
// DataScienceExaminerEvaluationForm.tsx) — the two are alternatives.
//
// Bank details and the tax document are write-once — the server 409s a
// resubmission, and this form shows a read-only "already submitted" state
// instead of ever offering to overwrite them (see examinerFinancial.ts).

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { useLanguage } from '@/contexts/LanguageContext';

interface OnboardingFormProps {
  token: string;
}

const inputCls = 'w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Done({ text }: { text: string }) {
  return <p className="text-sm font-semibold text-success">✅ {text}</p>;
}

export function OnboardingForm({ token }: OnboardingFormProps) {
  const { lang } = useLanguage();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof apiClient.getExaminerOnboardingStatus>> | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    apiClient
      .getExaminerOnboardingStatus(token)
      .then(setStatus)
      .catch((err) => {
        console.error('OnboardingForm: status load error', err);
        setLoadError(true);
      });
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load on mount; load()'s setState calls happen after its awaited network call resolves, not synchronously in this effect
    load();
  }, [load]);

  // Identity fields
  const [role, setRole] = useState('');
  const [title, setTitle] = useState('');
  const [institution, setInstitution] = useState('');
  const [identitySubmitting, setIdentitySubmitting] = useState(false);
  const [identityError, setIdentityError] = useState('');
  const [identitySaved, setIdentitySaved] = useState(false);

  useEffect(() => {
    if (status?.identity) {
      setRole(status.identity.role);
      setTitle(status.identity.title);
      setInstitution(status.identity.institution);
    }
  }, [status]);

  const handleSubmitIdentity = async () => {
    setIdentityError('');
    if (!role.trim() || !title.trim() || !institution.trim()) {
      setIdentityError(lang === 'he' ? 'יש למלא את כל השדות' : 'All fields are required');
      return;
    }
    setIdentitySubmitting(true);
    try {
      await apiClient.submitExaminerIdentity(token, { role: role.trim(), title: title.trim(), institution: institution.trim() });
      setIdentitySaved(true);
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : lang === 'he' ? 'השמירה נכשלה' : 'Save failed');
    } finally {
      setIdentitySubmitting(false);
    }
  };

  // Bank details
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankSubmitting, setBankSubmitting] = useState(false);
  const [bankError, setBankError] = useState('');

  const handleSubmitBank = async () => {
    setBankError('');
    if (!bankName.trim() || !branch.trim() || !accountNumber.trim() || !accountHolderName.trim()) {
      setBankError(lang === 'he' ? 'יש למלא את כל השדות' : 'All fields are required');
      return;
    }
    setBankSubmitting(true);
    try {
      await apiClient.submitExaminerBankDetails(token, {
        bankName: bankName.trim(), branch: branch.trim(), accountNumber: accountNumber.trim(), accountHolderName: accountHolderName.trim(),
      });
      load();
    } catch (err) {
      setBankError(err instanceof Error ? err.message : lang === 'he' ? 'השמירה נכשלה' : 'Save failed');
    } finally {
      setBankSubmitting(false);
    }
  };

  // Tax document
  const [taxFile, setTaxFile] = useState<File | null>(null);
  const [taxSubmitting, setTaxSubmitting] = useState(false);
  const [taxError, setTaxError] = useState('');

  const handleSubmitTax = async () => {
    setTaxError('');
    if (!taxFile) {
      setTaxError(lang === 'he' ? 'יש לבחור קובץ' : 'Please choose a file');
      return;
    }
    setTaxSubmitting(true);
    try {
      await apiClient.submitExaminerTaxDocument(token, taxFile);
      load();
    } catch (err) {
      setTaxError(err instanceof Error ? err.message : lang === 'he' ? 'ההעלאה נכשלה' : 'Upload failed');
    } finally {
      setTaxSubmitting(false);
    }
  };

  // Evaluation document (only relevant when there's no online opinion)
  const [evalFile, setEvalFile] = useState<File | null>(null);
  const [evalSubmitting, setEvalSubmitting] = useState(false);
  const [evalError, setEvalError] = useState('');

  const handleSubmitEval = async () => {
    setEvalError('');
    if (!evalFile) {
      setEvalError(lang === 'he' ? 'יש לבחור קובץ' : 'Please choose a file');
      return;
    }
    setEvalSubmitting(true);
    try {
      await apiClient.submitExaminerEvaluationDocument(token, evalFile);
      load();
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : lang === 'he' ? 'ההעלאה נכשלה' : 'Upload failed');
    } finally {
      setEvalSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="mt-5 rounded-[var(--radius)] border border-line bg-surface p-4 text-sm">
        <p className="text-danger" role="alert">{lang === 'he' ? 'טעינת פרטי הרישום נכשלה.' : 'Failed to load onboarding details.'}</p>
        <button type="button" onClick={load} className="mt-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
          {lang === 'he' ? 'נסה שוב' : 'Retry'}
        </button>
      </div>
    );
  }
  if (!status) return null;

  return (
    <div className="mt-5">
      <p className="text-sm font-semibold text-ink">
        {lang === 'he' ? '📋 פרטים לתשלום (יידרשו פעם אחת בלבד)' : '📋 Payment details (required only once)'}
      </p>

      <Card title={lang === 'he' ? 'פרטים מקצועיים' : 'Professional details'}>
        {identitySaved || status.identity ? (
          <div className="grid gap-1 text-sm text-ink">
            <p>{lang === 'he' ? 'תפקיד:' : 'Role:'} <b>{role}</b></p>
            <p>{lang === 'he' ? 'תואר:' : 'Title:'} <b>{title}</b></p>
            <p>{lang === 'he' ? 'מוסד אקדמי:' : 'Institution:'} <b>{institution}</b></p>
          </div>
        ) : null}
        <div className="mt-3 grid gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{lang === 'he' ? 'תפקיד (למשל מרצה בכיר)' : 'Role (e.g. Senior Lecturer)'}</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{lang === 'he' ? 'תואר (למשל ד"ר / פרופ\')' : "Title (e.g. Dr. / Prof.)"}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">{lang === 'he' ? 'מוסד אקדמי' : 'Academic institution'}</span>
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} className={inputCls} />
          </label>
        </div>
        {!!identityError && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{identityError}</p>}
        <button
          type="button"
          onClick={handleSubmitIdentity}
          disabled={identitySubmitting}
          className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {identitySubmitting ? '…' : lang === 'he' ? 'שמירה' : 'Save'}
        </button>
      </Card>

      <Card title={lang === 'he' ? '🏦 פרטי חשבון בנק' : '🏦 Bank account details'}>
        {status.hasBankAccount ? (
          <Done text={lang === 'he' ? 'הפרטים כבר נשלחו' : 'Details already submitted'} />
        ) : (
          <>
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">{lang === 'he' ? 'שם הבנק' : 'Bank name'}</span>
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">{lang === 'he' ? 'סניף' : 'Branch'}</span>
                <input value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">{lang === 'he' ? 'מספר חשבון' : 'Account number'}</span>
                <input dir="ltr" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">{lang === 'he' ? 'שם בעל החשבון' : 'Account holder name'}</span>
                <input value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} className={inputCls} />
              </label>
            </div>
            {!!bankError && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{bankError}</p>}
            <button
              type="button"
              onClick={handleSubmitBank}
              disabled={bankSubmitting}
              className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {bankSubmitting ? '…' : lang === 'he' ? 'שליחה' : 'Submit'}
            </button>
          </>
        )}
      </Card>

      <Card title={lang === 'he' ? '📎 אישור ניכוי מס במקור' : '📎 Tax coordination document'}>
        {status.hasTaxDocument ? (
          <Done text={lang === 'he' ? 'המסמך כבר הועלה' : 'Document already uploaded'} />
        ) : (
          <>
            <input
              type="file"
              onChange={(e) => setTaxFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink"
            />
            {!!taxError && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{taxError}</p>}
            <button
              type="button"
              onClick={handleSubmitTax}
              disabled={taxSubmitting}
              className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
            >
              {taxSubmitting ? '…' : lang === 'he' ? 'העלאה' : 'Upload'}
            </button>
          </>
        )}
      </Card>

      {!status.hasOnlineEvaluation && (
        <Card title={lang === 'he' ? '📝 מסמך הערכה (אם לא מולא באופן מקוון)' : '📝 Evaluation document (if not filled online)'}>
          {status.hasEvaluationDocument ? (
            <Done text={lang === 'he' ? 'המסמך כבר הועלה' : 'Document already uploaded'} />
          ) : (
            <>
              <p className="mb-2 text-xs text-muted">
                {lang === 'he'
                  ? 'אם אינך ממלא/ת את טופס ההערכה המקוון למטה, ניתן להעלות כאן מסמך הערכה סרוק במקום.'
                  : "If you aren't filling out the online evaluation form below, you may upload a scanned evaluation document here instead."}
              </p>
              <input
                type="file"
                onChange={(e) => setEvalFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-ink"
              />
              {!!evalError && <p className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{evalError}</p>}
              <button
                type="button"
                onClick={handleSubmitEval}
                disabled={evalSubmitting}
                className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {evalSubmitting ? '…' : lang === 'he' ? 'העלאה' : 'Upload'}
              </button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

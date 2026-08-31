'use client';

// app/admin/panel/StudentStatusesModal.tsx
// System_admin-only settings modal for editing the admin-manageable Primary
// and Secondary student status option lists (see server/src/services/
// studentStatuses.ts). Same get-then-edit-then-PUT shape as
// AcademicCalendarModal, but for two lists of add/remove/reorder-able rows
// instead of a few number fields — inline-editable rows, matching how this
// modal's spec describes the interaction (add appends a blank row directly,
// no separate row-editor popup like MilestoneRowModal's).

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import type { StudentStatusOption } from './types';

interface StudentStatusesModalProps {
  onClose: () => void;
}

let rowSeq = 0;
function newRowId() {
  rowSeq += 1;
  return `new-${rowSeq}`;
}

// Local editable row — `key` stays '' for a brand-new option (server mints
// one on save); `rowId` is a client-only React key so newly-added rows
// (which have no `key` yet) can still be tracked/removed reliably.
interface EditableRow extends StudentStatusOption {
  rowId: string;
}

function toEditable(opts: StudentStatusOption[]): EditableRow[] {
  return opts.map((o) => ({ ...o, rowId: o.key || newRowId() }));
}

export function StudentStatusesModal({ onClose }: StudentStatusesModalProps) {
  const { lang, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [primary, setPrimary] = useState<EditableRow[]>([]);
  const [secondary, setSecondary] = useState<EditableRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getStudentStatusOptions()
      .then((res) => {
        if (cancelled) return;
        setPrimary(toEditable(res.primary));
        setSecondary(toEditable(res.secondary));
      })
      .catch(() => {
        if (!cancelled) setError(lang === 'he' ? 'טעינת רשימות הסטטוס נכשלה' : 'Failed to load the status lists');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load-on-mount only
  }, []);

  const addRow = (setList: Dispatch<SetStateAction<EditableRow[]>>) => {
    setList((prev) => [...prev, { key: '', labelHe: '', labelEn: '', rowId: newRowId() }]);
  };

  const removeRow = (setList: Dispatch<SetStateAction<EditableRow[]>>, rowId: string) => {
    setList((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const updateRow = (
    setList: Dispatch<SetStateAction<EditableRow[]>>,
    rowId: string,
    field: 'labelHe' | 'labelEn',
    value: string
  ) => {
    setList((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, [field]: value } : r)));
  };

  const handleSave = async () => {
    const cleanPrimary = primary.filter((r) => r.labelHe.trim() || r.labelEn.trim());
    const cleanSecondary = secondary.filter((r) => r.labelHe.trim() || r.labelEn.trim());
    if (cleanPrimary.length === 0 || cleanSecondary.length === 0) {
      setError(lang === 'he' ? 'יש להשאיר לפחות שורה אחת בכל רשימה' : 'Each list needs at least one row');
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await apiClient.updateStudentStatusOptions({
        primary: cleanPrimary.map((r) => ({ key: r.key || undefined, labelHe: r.labelHe.trim(), labelEn: r.labelEn.trim() })),
        secondary: cleanSecondary.map((r) => ({ key: r.key || undefined, labelHe: r.labelHe.trim(), labelEn: r.labelEn.trim() })),
      });
      setPrimary(toEditable(res.primary));
      setSecondary(toEditable(res.secondary));
      setSaved(true);
      setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'עדכון רשימות הסטטוס נכשל' : 'Failed to update the status lists');
    } finally {
      setSaving(false);
    }
  };

  const renderList = (title: string, rows: EditableRow[], setList: Dispatch<SetStateAction<EditableRow[]>>) => (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">
          {title} ({rows.length})
        </span>
        <button
          type="button"
          onClick={() => addRow(setList)}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:bg-primary-hover"
        >
          ＋ {t('add')}
        </button>
      </div>
      <div className="mt-2 grid gap-2">
        {rows.map((row) => (
          <div key={row.rowId} className="flex items-center gap-2 rounded-lg border border-line bg-paper p-2.5">
            <input
              dir="rtl"
              value={row.labelHe}
              onChange={(e) => updateRow(setList, row.rowId, 'labelHe', e.target.value)}
              placeholder={lang === 'he' ? 'תווית (עברית)' : 'Label (Hebrew)'}
              className={rowInputCls}
            />
            <input
              dir="ltr"
              value={row.labelEn}
              onChange={(e) => updateRow(setList, row.rowId, 'labelEn', e.target.value)}
              placeholder={lang === 'he' ? 'תווית (אנגלית)' : 'Label (English)'}
              className={rowInputCls}
            />
            <button
              type="button"
              onClick={() => removeRow(setList, row.rowId)}
              className="shrink-0 rounded-md px-1.5 py-1 text-sm text-muted hover:bg-surface hover:text-danger"
              aria-label="remove"
            >
              ✕
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-muted">{lang === 'he' ? 'אין שורות' : 'No rows yet'}</p>}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">🏷️ {lang === 'he' ? 'סטטוסים של סטודנטים' : 'Student Statuses'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-muted">…</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-muted">
              {lang === 'he'
                ? 'עריכת תווית של סטטוס קיים מעדכנת אותה מיידית לכל הסטודנטים המוגדרים אליו. מחיקת שורה אינה פוגעת בסטודנטים שכבר הוגדרו לסטטוס הזה — היא רק מסתירה את האפשרות מרשימות עתידיות.'
                : "Editing an existing status's label updates it immediately for every student already set to it. Deleting a row doesn't affect students already set to it — it just hides that option going forward."}
            </p>

            {renderList(lang === 'he' ? 'סטטוס ראשי' : 'Primary Status', primary, setPrimary)}
            {renderList(lang === 'he' ? 'סטטוס משני' : 'Secondary Status', secondary, setSecondary)}

            {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
            {saved && (
              <p className="mt-4 rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">
                ✅ {lang === 'he' ? 'הרשימות עודכנו' : 'Status lists updated'}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {saving ? '…' : t('save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const rowInputCls =
  'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-primary focus:outline-none';

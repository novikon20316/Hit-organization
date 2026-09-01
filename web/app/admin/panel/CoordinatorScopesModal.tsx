'use client';

// app/admin/panel/CoordinatorScopesModal.tsx
// Ported from mobile/components/modals/CoordinatorScopesModal.tsx —
// system_admin's editor for a coordinator's own operational scope — which
// population of students/projects they oversee. Opened from EditUserModal
// when the user being edited holds the coordinator role. Scopes live in
// local state on the parent (EditUserModal) until Save, which persists them
// via apiClient.updateUserRoleAdmin's coordinatorScopes field — enforced
// server-side by services/scopeAuthorization.ts's withinCoordinatorScope,
// which every coordinator write endpoint now checks (falling back to the
// coordinator's plain facultyId when no scopes are configured).
//
// An account can hold multiple scopes at once (e.g. "CS bachelor's" AND
// "Design master's" from one login) — real institutions split the
// coordinator role in ways a single facultyId can't express: by degree
// level within a major, by whole major, or even by thesis-vs-project track
// within a major's master's program. Each scope reuses the same
// Faculty -> Major -> Degree Level -> Process Type narrowing as
// PermissionsEditorModal's rules (via ScopeDescriptorFields), just without
// separate view/action grants — a coordinator already has full standard
// actions within whatever scope they're assigned.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { ScopeDescriptorFields } from './ScopeDescriptorFields';
import { scopeLabel, newScopeId, type CoordinatorScope, type ScopeDescriptor } from '@/lib/permissions';
import { useModalA11y } from '@/hooks/useModalA11y';

interface CoordinatorScopesModalProps {
  open: boolean;
  onClose: () => void;
  scopes: CoordinatorScope[];
  onChange: (next: CoordinatorScope[]) => void;
}

function emptyDraft(): CoordinatorScope {
  return { id: newScopeId(), facultyId: 'sciences' };
}

export function CoordinatorScopesModal({ open, onClose, scopes, onChange }: CoordinatorScopesModalProps) {
  const { lang } = useLanguage();
  // null = list screen; a draft = the add/edit form screen.
  const [draft, setDraft] = useState<CoordinatorScope | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, open, onClose);

  if (!open) return null;

  const openNewScope = () => setDraft(emptyDraft());
  const openEditScope = (scope: CoordinatorScope) => setDraft({ ...scope });
  const cancelForm = () => setDraft(null);

  const saveScope = () => {
    if (!draft) return;
    const exists = scopes.some((sc) => sc.id === draft.id);
    onChange(exists ? scopes.map((sc) => (sc.id === draft.id ? draft : sc)) : [...scopes, draft]);
    setDraft(null);
  };

  const deleteScope = (id: string) => onChange(scopes.filter((sc) => sc.id !== id));

  const patchDraft = (patch: Partial<ScopeDescriptor>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        {!draft ? (
          <>
            {/* ── List screen ── */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">📋 {lang === 'he' ? 'היקף אחריות רכז' : 'Coordinator Scope'}</h2>
              <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-lg text-muted hover:text-ink">
                ✕
              </button>
            </div>

            <p className="mt-3 text-sm font-medium text-ink">
              {lang === 'he' ? `${scopes.length} תחומי אחריות` : `${scopes.length} scopes`}
            </p>
            <p className="text-xs text-muted">{lang === 'he' ? 'ניתן להוסיף כמה שצריך' : 'add as many as needed'}</p>

            <div className="mt-3 grid gap-2">
              {scopes.length === 0 && (
                <p className="mt-4 text-center text-sm text-muted">
                  {lang === 'he'
                    ? 'אין עדיין תחומי אחריות — הוסף אחד למטה (בלעדיו, הרכז מוגבל לפקולטה השלמה שנבחרה למעלה)'
                    : 'No scopes yet — add one below (without it, the coordinator falls back to the whole faculty selected above)'}
                </p>
              )}

              {scopes.map((scope) => (
                <div key={scope.id} className="rounded-lg border border-line bg-paper p-3">
                  <p className="truncate text-sm font-semibold text-ink">
                    {scopeLabel(scope, lang, (id) => facultyLabel(id as FacultyId, lang))}
                  </p>
                  <div className="mt-2 flex gap-3">
                    <button type="button" onClick={() => openEditScope(scope)} className="text-xs font-medium text-primary hover:underline">
                      {lang === 'he' ? 'ערוך' : 'Edit'}
                    </button>
                    <button type="button" onClick={() => deleteScope(scope.id)} className="text-xs font-medium text-danger hover:underline">
                      {lang === 'he' ? 'מחק' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={openNewScope}
                className="mt-1 rounded-lg border border-dashed border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-paper"
              >
                ＋ {lang === 'he' ? 'הוסף תחום אחריות' : 'Add Scope'}
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
              >
                {lang === 'he' ? 'סגור' : 'Done'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── Add/edit scope form ── */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'תחום אחריות' : 'Scope'}</h2>
              <button type="button" onClick={cancelForm} aria-label={lang === 'he' ? 'ביטול' : 'Cancel'} className="text-lg text-muted hover:text-ink">
                ✕
              </button>
            </div>

            <div className="mt-4">
              <ScopeDescriptorFields scope={draft} onChange={patchDraft} />
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={saveScope}
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
              >
                {lang === 'he' ? 'שמור תחום' : 'Save Scope'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

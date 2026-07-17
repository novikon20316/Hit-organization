'use client';

// app/admin/panel/PermissionsEditorModal.tsx
// Ported from mobile/components/modals/PermissionsEditorModal.tsx —
// system_admin's per-user granular permission editor, opened from
// EditUserModal for any user being edited. UI ONLY for now — rules live in
// local state on the parent (EditUserModal) and are NOT sent to the server;
// nothing here is enforced anywhere yet.
//
// Elastic scope-rule model (see lib/permissions.ts): an account can hold any
// number of ScopeRules, each narrowing Faculty -> optional Major -> optional
// Degree Level -> optional Process Type (master's only), with its own
// View/Action permission grants — rather than one fixed grid shape. The
// scope-narrowing fields themselves are shared with CoordinatorScopesModal
// via ScopeDescriptorFields.
//
// Same two-screen structure as mobile: a list screen (add/edit/delete rules)
// and a form screen for the rule currently being added or edited, toggled by
// whether `draft` is set.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { ScopeDescriptorFields } from './ScopeDescriptorFields';
import {
  VIEW_TYPES, ACTION_TYPES, scopeLabel, newScopeId,
  type ScopeRule, type ScopeDescriptor, type ViewType, type ActionType,
} from '@/lib/permissions';

interface PermissionsEditorModalProps {
  open: boolean;
  onClose: () => void;
  rules: ScopeRule[];
  onChange: (next: ScopeRule[]) => void;
}

function emptyDraft(): ScopeRule {
  return { id: newScopeId(), facultyId: 'sciences', view: [], actions: [] };
}

export function PermissionsEditorModal({ open, onClose, rules, onChange }: PermissionsEditorModalProps) {
  const { lang } = useLanguage();
  // null = list screen; a draft = the add/edit form screen.
  const [draft, setDraft] = useState<ScopeRule | null>(null);

  if (!open) return null;

  const openNewRule = () => setDraft(emptyDraft());
  const openEditRule = (rule: ScopeRule) => setDraft({ ...rule, view: [...rule.view], actions: [...rule.actions] });
  const cancelForm = () => setDraft(null);

  const saveRule = () => {
    if (!draft) return;
    const exists = rules.some((r) => r.id === draft.id);
    onChange(exists ? rules.map((r) => (r.id === draft.id ? draft : r)) : [...rules, draft]);
    setDraft(null);
  };

  const deleteRule = (id: string) => onChange(rules.filter((r) => r.id !== id));

  const patchDraft = (patch: Partial<ScopeDescriptor>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const toggleView = (key: ViewType) =>
    setDraft((d) => (d ? { ...d, view: d.view.includes(key) ? d.view.filter((k) => k !== key) : [...d.view, key] } : d));
  const toggleAction = (key: ActionType) =>
    setDraft((d) => (d ? { ...d, actions: d.actions.includes(key) ? d.actions.filter((k) => k !== key) : [...d.actions, key] } : d));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        {!draft ? (
          <>
            {/* ── List screen ── */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">🔐 {lang === 'he' ? 'הרשאות מפורטות' : 'Granular Permissions'}</h2>
              <button type="button" onClick={onClose} className="text-lg text-muted hover:text-ink">
                ✕
              </button>
            </div>

            <p className="mt-3 text-sm font-medium text-ink">
              {lang === 'he' ? `${rules.length} כללי הרשאה` : `${rules.length} scope rules`}
            </p>
            <p className="text-xs text-muted">
              {lang === 'he' ? 'כל כלל מגדיר פקולטה/מגמה/תואר/מסלול משלו' : "each rule scopes its own faculty/major/degree/track"}
            </p>

            <div className="mt-3 grid gap-2">
              {rules.length === 0 && (
                <p className="mt-4 text-center text-sm text-muted">
                  {lang === 'he' ? 'אין עדיין כללי הרשאה — הוסף אחד למטה' : 'No scope rules yet — add one below'}
                </p>
              )}

              {rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-line bg-paper p-3">
                  <p className="truncate text-sm font-semibold text-ink">
                    {scopeLabel(rule, lang, (id) => facultyLabel(id as FacultyId, lang))}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {lang === 'he'
                      ? `👁️ ${rule.view.length} צפייה · ⚡ ${rule.actions.length} פעולות`
                      : `👁️ ${rule.view.length} view · ⚡ ${rule.actions.length} action`}
                  </p>
                  <div className="mt-2 flex gap-3">
                    <button type="button" onClick={() => openEditRule(rule)} className="text-xs font-medium text-primary hover:underline">
                      {lang === 'he' ? 'ערוך' : 'Edit'}
                    </button>
                    <button type="button" onClick={() => deleteRule(rule.id)} className="text-xs font-medium text-danger hover:underline">
                      {lang === 'he' ? 'מחק' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={openNewRule}
                className="mt-1 rounded-lg border border-dashed border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-paper"
              >
                ＋ {lang === 'he' ? 'הוסף כלל הרשאה' : 'Add Scope Rule'}
              </button>
            </div>

            <p className="mt-4 text-xs text-muted">
              {lang === 'he'
                ? 'טרם מחובר לשרת — השינויים נשמרים רק להצגה כרגע'
                : 'Not yet connected to the server — changes are for preview only right now'}
            </p>

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
            {/* ── Add/edit rule form ── */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">{lang === 'he' ? 'כלל הרשאה' : 'Scope Rule'}</h2>
              <button type="button" onClick={cancelForm} className="text-lg text-muted hover:text-ink">
                ✕
              </button>
            </div>

            <div className="mt-4">
              <ScopeDescriptorFields scope={draft} onChange={patchDraft} />
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-sm font-medium text-ink">👁️ {lang === 'he' ? 'צפייה' : 'View'}</p>
              <div className="grid gap-1.5">
                {VIEW_TYPES.map((v) => (
                  <label key={v.key} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
                    <input
                      type="checkbox"
                      checked={draft.view.includes(v.key)}
                      onChange={() => toggleView(v.key)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <span className="text-sm text-ink">{v.label[lang]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-sm font-medium text-ink">⚡ {lang === 'he' ? 'פעולות' : 'Actions'}</p>
              <div className="grid gap-1.5">
                {ACTION_TYPES.map((a) => (
                  <label key={a.key} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
                    <input
                      type="checkbox"
                      checked={draft.actions.includes(a.key)}
                      onChange={() => toggleAction(a.key)}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    <span className="text-sm text-ink">{a.label[lang]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={saveRule}
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
              >
                {lang === 'he' ? 'שמור כלל' : 'Save Rule'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

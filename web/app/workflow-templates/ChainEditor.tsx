'use client';

// app/workflow-templates/ChainEditor.tsx
// Ordered approval/rejection-routing chain editor — shared by
// new/page.tsx's propose-version form (template-level defaultRouting) and
// MilestoneRowModal.tsx (per-milestone override of that default). Each stage
// names who reviews at that point (role), whether they grade or just
// approve, and where a rejection at that stage routes (back to the student,
// or to another stage in this same chain — self-loop allowed).

import { useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CommitteeRecord } from '@/lib/apiClient';
import { CHAIN_ROLES, chainRoleLabel, type ChainStage } from './types';

function makeStageId(): string {
  return `stage_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyStage(): ChainStage {
  return { id: makeStageId(), role: 'coordinator', action: 'approve', rejectTo: 'student' };
}

interface ChainEditorProps {
  stages: ChainStage[];
  onChange: (stages: ChainStage[]) => void;
  /** Committees eligible for this template's own faculty/major — used only
   *  to populate the picker shown on a 'committee'-role stage (see
   *  ChainStage.committeeId's doc comment). Omitted/empty just shows the
   *  "no committee configured" hint on every committee stage. */
  committees?: CommitteeRecord[];
  isReadOnly?: boolean;
}

export function ChainEditor({ stages, onChange, committees = [], isReadOnly = false }: ChainEditorProps) {
  const { lang, t } = useLanguage();

  // A single candidate committee is the only possible choice — pin it
  // automatically rather than making staff click a one-option dropdown.
  // Only fires when it would actually change something, so it's safe as a
  // plain effect (no infinite loop from onChange producing a new array).
  useEffect(() => {
    if (committees.length !== 1) return;
    const onlyId = committees[0]!.id;
    const needsFill = stages.some((s) => s.role === 'committee' && !s.committeeId);
    if (!needsFill) return;
    onChange(stages.map((s) => (s.role === 'committee' && !s.committeeId ? { ...s, committeeId: onlyId } : s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange is a fresh closure each render; guarding on needsFill above (not in the dep list) is what actually prevents the loop
  }, [stages, committees]);

  const updateStage = (idx: number, patch: Partial<ChainStage>) => {
    onChange(stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeStage = (idx: number) => {
    const removedId = stages[idx]?.id;
    onChange(
      stages
        .filter((_, i) => i !== idx)
        // A rejectTo pointing at the removed stage falls back to 'student'
        // rather than being left dangling (server would reject it anyway).
        .map((s) => (s.rejectTo === removedId ? { ...s, rejectTo: 'student' } : s))
    );
  };
  const moveStage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    onChange(next);
  };
  const addStage = () => onChange([...stages, emptyStage()]);

  return (
    <div className="grid gap-2">
      {stages.map((stage, idx) => {
        const rejectsForward = stage.rejectTo !== 'student' && stages.findIndex((s) => s.id === stage.rejectTo) > idx;
        return (
          <div key={stage.id} className="rounded-md border border-line bg-surface p-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[10px] font-bold text-primary">{idx + 1}</span>
              <select
                value={stage.role}
                onChange={(e) => updateStage(idx, { role: e.target.value as ChainStage['role'] })}
                disabled={isReadOnly}
                className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                {CHAIN_ROLES.map((r) => (
                  <option key={r.key} value={r.key}>{lang === 'he' ? r.he : r.en}</option>
                ))}
              </select>
              <select
                value={stage.action}
                onChange={(e) => updateStage(idx, { action: e.target.value as ChainStage['action'] })}
                disabled={isReadOnly}
                className="shrink-0 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="grade">{lang === 'he' ? 'מדרג' : 'Grades'}</option>
                <option value="approve">{lang === 'he' ? 'מאשר' : 'Approves'}</option>
              </select>
              <div className="flex shrink-0 gap-0.5">
                <button type="button" onClick={() => moveStage(idx, -1)} disabled={isReadOnly || idx === 0} className="rounded px-1 text-xs text-muted hover:bg-paper disabled:opacity-30" aria-label="up">▲</button>
                <button type="button" onClick={() => moveStage(idx, 1)} disabled={isReadOnly || idx === stages.length - 1} className="rounded px-1 text-xs text-muted hover:bg-paper disabled:opacity-30" aria-label="down">▼</button>
                <button type="button" onClick={() => removeStage(idx)} disabled={isReadOnly} className="rounded px-1 text-xs hover:bg-paper disabled:opacity-30" aria-label="remove">🗑️</button>
              </div>
            </div>
            <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
              {lang === 'he' ? 'אם נדחה, יעבור אל' : 'If rejected, goes to'}
              <select
                value={stage.rejectTo}
                onChange={(e) => updateStage(idx, { rejectTo: e.target.value })}
                disabled={isReadOnly}
                className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="student">{lang === 'he' ? 'הסטודנט' : 'Student'}</option>
                {stages.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {i === idx
                      ? `${chainRoleLabel(s.role, lang)} (${lang === 'he' ? 'לשלב זה עצמו' : 'this same stage'})`
                      : chainRoleLabel(s.role, lang)}
                  </option>
                ))}
              </select>
            </label>
            {rejectsForward && (
              <p className="mt-1 text-[11px] text-accent">
                ⚠️ {lang === 'he' ? 'הדחייה קופצת קדימה בשרשרת — ודא שזה מכוון' : 'This rejection jumps forward in the chain — double-check this is intentional'}
              </p>
            )}
            {stage.role === 'committee' && (
              committees.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-danger">
                  ⚠️ {lang === 'he' ? 'לא נמצאה ועדה מוגדרת עבור פקולטה/מגמה זו' : 'No committee is configured for this faculty/major yet'}
                </p>
              ) : (
                <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                  {lang === 'he' ? 'איזו ועדה' : 'Which committee'}
                  <select
                    value={stage.committeeId ?? ''}
                    onChange={(e) => updateStage(idx, { committeeId: e.target.value || undefined })}
                    disabled={isReadOnly}
                    className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="" disabled={committees.length > 1}>
                      {lang === 'he' ? '— בחר ועדה —' : '— Choose a committee —'}
                    </option>
                    {committees.map((c) => (
                      <option key={c.id} value={c.id}>{c.major}</option>
                    ))}
                  </select>
                </label>
              )
            )}
          </div>
        );
      })}
      <button type="button" onClick={addStage} disabled={isReadOnly} className="rounded-md border border-dashed border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper disabled:opacity-30">
        ＋ {t('add')}
      </button>
    </div>
  );
}

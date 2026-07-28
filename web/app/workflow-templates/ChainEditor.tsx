'use client';

// app/workflow-templates/ChainEditor.tsx
// Ordered approval/rejection-routing chain editor — shared by
// ProposeVersionModal.tsx (template-level defaultRouting) and
// MilestoneRowModal.tsx (per-milestone override of that default). Each stage
// names who reviews at that point (role), whether they grade or just
// approve, and where a rejection at that stage routes (back to the student,
// or to another stage in this same chain — self-loop allowed).

import { useLanguage } from '@/contexts/LanguageContext';
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
}

export function ChainEditor({ stages, onChange }: ChainEditorProps) {
  const { lang, t } = useLanguage();

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
                className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
              >
                {CHAIN_ROLES.map((r) => (
                  <option key={r.key} value={r.key}>{lang === 'he' ? r.he : r.en}</option>
                ))}
              </select>
              <select
                value={stage.action}
                onChange={(e) => updateStage(idx, { action: e.target.value as ChainStage['action'] })}
                className="shrink-0 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
              >
                <option value="grade">{lang === 'he' ? 'מדרג' : 'Grades'}</option>
                <option value="approve">{lang === 'he' ? 'מאשר' : 'Approves'}</option>
              </select>
              <div className="flex shrink-0 gap-0.5">
                <button type="button" onClick={() => moveStage(idx, -1)} disabled={idx === 0} className="rounded px-1 text-xs text-muted hover:bg-paper disabled:opacity-30" aria-label="up">▲</button>
                <button type="button" onClick={() => moveStage(idx, 1)} disabled={idx === stages.length - 1} className="rounded px-1 text-xs text-muted hover:bg-paper disabled:opacity-30" aria-label="down">▼</button>
                <button type="button" onClick={() => removeStage(idx)} className="rounded px-1 text-xs hover:bg-paper" aria-label="remove">🗑️</button>
              </div>
            </div>
            <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
              {lang === 'he' ? 'אם נדחה, יעבור אל' : 'If rejected, goes to'}
              <select
                value={stage.rejectTo}
                onChange={(e) => updateStage(idx, { rejectTo: e.target.value })}
                className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink"
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
          </div>
        );
      })}
      <button type="button" onClick={addStage} className="rounded-md border border-dashed border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper">
        ＋ {t('add')}
      </button>
    </div>
  );
}

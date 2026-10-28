'use client';

// app/administrative_coordinator/dashboard/DefenseLogisticsModal.tsx
// Set-or-edit a defense's logistics — fields live in the shared
// components/DefenseLogisticsForm.tsx, under the 'project-coordinator' base path.
import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { DefenseLogisticsForm } from '@/components/DefenseLogisticsForm';
import type { ProjectGroup } from './types';
import { FieldGuideOverlay } from '@/components/guidance/FieldGuideOverlay';
import { DEFENSE_LOGISTICS_FIELD_GUIDE, DEFENSE_LOGISTICS_GUIDE_KEY } from './fieldGuide';

interface DefenseLogisticsModalProps {
  group: ProjectGroup;
  onClose: () => void;
  onSaved: () => void;
}

export function DefenseLogisticsModal({ group, onClose, onSaved }: DefenseLogisticsModalProps) {
  const { lang, t } = useLanguage();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  const inputCls = 'w-full rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-2 text-sm text-administrative-coordinator-on-surface focus:border-administrative-coordinator-primary focus:bg-administrative-coordinator-surface-container-lowest focus:outline-none';
  // The project doc mirrors the logistics once set (see assignDefense), so a
  // stored time means this is an edit of an already-scheduled defense.
  const isEdit = !!group.defenseTime;

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-administrative-coordinator-lg bg-administrative-coordinator-surface-container-lowest p-6 text-administrative-coordinator-on-surface shadow-lg outline-none"
      >
        <FieldGuideOverlay guideKey={DEFENSE_LOGISTICS_GUIDE_KEY} steps={DEFENSE_LOGISTICS_FIELD_GUIDE} />
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-administrative-coordinator-on-surface">
            🛡 {isEdit ? (lang === 'he' ? 'עריכת פרטי ההגנה' : 'Edit Defense Details') : lang === 'he' ? 'תאם הגנה' : 'Schedule Defense'}
          </h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-administrative-coordinator-on-surface-variant hover:text-administrative-coordinator-on-surface">
            ✕
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-administrative-coordinator-surface-container-low p-3">
          <p className="text-sm font-semibold text-administrative-coordinator-on-surface">{group.projectTitle}</p>
          <p className="mt-0.5 text-xs text-administrative-coordinator-on-surface-variant">👥 {group.members.map((m) => m.name).join(', ')}</p>
          {group.defenseDate && (
            <p className="mt-0.5 text-xs text-administrative-coordinator-on-surface-variant">
              📅 {t('defenseDate')} {new Date(group.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
            </p>
          )}
        </div>

        <DefenseLogisticsForm
          basePath="project-coordinator"
          projectId={group.id}
          milestoneId={null}
          confirmedDate={group.defenseDate ? new Date(group.defenseDate) : null}
          initial={isEdit ? group : undefined}
          inputClassName={inputCls}
          primaryButtonClassName="w-full rounded-lg bg-administrative-coordinator-primary py-2.5 text-sm font-semibold text-administrative-coordinator-on-primary hover:opacity-90 disabled:opacity-60"
          tooltip={(key) => DEFENSE_LOGISTICS_FIELD_GUIDE.find((s) => s.key === key)?.description}
          onSaved={() => {
            onSaved();
            onClose();
          }}
        />
      </div>
    </div>
  );
}

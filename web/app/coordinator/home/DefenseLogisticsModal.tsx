'use client';

// app/coordinator/home/DefenseLogisticsModal.tsx
// Set-or-edit a defense's logistics (format, date, time, place, Zoom) — the
// fields themselves live in the shared components/DefenseLogisticsForm.tsx,
// used under the 'coordinator' base path here (see apiClient.assignDefenseLogistics).

import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { DefenseLogisticsForm } from '@/components/DefenseLogisticsForm';
import type { AssignedMilestone, Project } from './types';
import { FieldGuideOverlay } from '@/components/guidance/FieldGuideOverlay';
import { DEFENSE_LOGISTICS_FIELD_GUIDE, DEFENSE_LOGISTICS_GUIDE_KEY } from './fieldGuide';
import { parseServerDate } from './DefenseTab';

interface DefenseLogisticsModalProps {
  project: Project;
  milestone: AssignedMilestone;
  onClose: () => void;
  onSaved: () => void;
}

export function DefenseLogisticsModal({ project, milestone, onClose, onSaved }: DefenseLogisticsModalProps) {
  const { lang } = useLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, true, onClose);

  const inputCls = 'w-full rounded-lg border border-coordinator-outline-variant bg-coordinator-surface-container-low px-3 py-2 text-sm text-coordinator-on-surface focus:border-coordinator-primary focus:bg-coordinator-surface-container-lowest focus:outline-none';
  const title = lang === 'he' ? project.titleHe : project.titleEn;
  const isEdit = milestone.status === 'scheduled';

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-black/40 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-coordinator-lg bg-coordinator-surface-container-lowest p-6 text-coordinator-on-surface shadow-lg outline-none"
      >
        <FieldGuideOverlay guideKey={DEFENSE_LOGISTICS_GUIDE_KEY} steps={DEFENSE_LOGISTICS_FIELD_GUIDE} />
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-coordinator-on-surface">
            📍 {isEdit ? (lang === 'he' ? 'עריכת פרטי ההגנה' : 'Edit Defense Details') : lang === 'he' ? 'פרטי ההגנה' : 'Defense Logistics'}
          </h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-coordinator-on-surface-variant hover:text-coordinator-on-surface">
            ✕
          </button>
        </div>
        {title && <p className="mt-1 truncate text-sm text-coordinator-on-surface-variant">📁 {title}</p>}

        <DefenseLogisticsForm
          basePath="coordinator"
          projectId={project.id}
          milestoneId={milestone.id}
          confirmedDate={parseServerDate(milestone.dueDate)}
          initial={isEdit ? milestone : undefined}
          inputClassName={inputCls}
          primaryButtonClassName="rounded-lg bg-coordinator-primary px-3.5 py-2 text-sm font-semibold text-coordinator-on-primary hover:bg-coordinator-primary-container disabled:opacity-60"
          secondaryButtonClassName="rounded-lg border border-coordinator-outline-variant px-3.5 py-2 text-sm font-medium text-coordinator-on-surface hover:bg-coordinator-surface-container-low"
          tooltip={(key) => DEFENSE_LOGISTICS_FIELD_GUIDE.find((s) => s.key === key)?.description}
          onSaved={onSaved}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

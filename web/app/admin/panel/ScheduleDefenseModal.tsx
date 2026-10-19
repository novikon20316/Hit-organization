'use client';

// app/admin/panel/ScheduleDefenseModal.tsx
// Set-or-edit a defense's logistics from the admin panel — fields live in
// the shared components/DefenseLogisticsForm.tsx, under the 'admin' base
// path (same assignDefense controller as coordinator/administrative coordinator).

import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { DefenseLogisticsForm } from '@/components/DefenseLogisticsForm';
import type { AdminProjectRecord } from './types';

interface ScheduleDefenseModalProps {
  project: AdminProjectRecord;
  onClose: () => void;
  onSaved: () => void;
}

function parseProjectDate(value: AdminProjectRecord['defenseDate']): Date | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return typeof value._seconds === 'number' ? new Date(value._seconds * 1000) : null;
}

export function ScheduleDefenseModal({ project, onClose, onSaved }: ScheduleDefenseModalProps) {
  const { lang } = useLanguage();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  const projectTitle = lang === 'he' ? project.titleHe : project.titleEn;
  const isEdit = project.defenseSchedulingState === 'scheduled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-admin-lg bg-admin-surface-container-lowest p-6 text-admin-on-surface shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-admin-on-surface">
          🛡 {isEdit ? (lang === 'he' ? 'עריכת פרטי ההגנה' : 'Edit Defense Details') : lang === 'he' ? 'תאם הגנה' : 'Schedule Defense'}
        </h2>
        {projectTitle && <p className="mt-1 truncate text-sm text-admin-on-surface-variant">📁 {projectTitle}</p>}

        <DefenseLogisticsForm
          basePath="admin"
          projectId={project.id}
          milestoneId={null}
          confirmedDate={parseProjectDate(project.defenseDate)}
          initial={isEdit ? project : undefined}
          inputClassName={inputCls}
          primaryButtonClassName="rounded-lg bg-admin-primary px-3.5 py-2 text-sm font-semibold text-admin-on-primary hover:bg-admin-primary-container disabled:opacity-60"
          secondaryButtonClassName="rounded-lg border border-admin-outline-variant px-3.5 py-2 text-sm font-medium text-admin-on-surface hover:bg-admin-surface-container-low"
          onSaved={() => {
            onSaved();
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-admin-outline-variant bg-admin-surface-container-low px-3 py-2 text-sm text-admin-on-surface focus:border-admin-primary focus:bg-admin-surface-container-lowest focus:outline-none';

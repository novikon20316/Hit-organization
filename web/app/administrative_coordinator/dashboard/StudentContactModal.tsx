'use client';

// app/administrative_coordinator/dashboard/StudentContactModal.tsx
// Popup shown when she clicks a student's name inside a project card, so she
// can actually reach them — email/phone straight from their own user doc,
// via clickable mailto:/tel: links.

import { useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';

export interface ContactMember {
  name: string;
  email: string;
  phoneNumber: string | null;
}

interface StudentContactModalProps {
  member: ContactMember | null;
  onClose: () => void;
}

export function StudentContactModal({ member, onClose }: StudentContactModalProps) {
  const { lang } = useLanguage();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, !!member, onClose);

  if (!member) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-administrative-coordinator bg-administrative-coordinator-surface-container-lowest p-5 shadow-lg outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-base font-semibold text-administrative-coordinator-on-surface">👤 {member.name}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-administrative-coordinator-on-surface-variant hover:text-administrative-coordinator-on-surface">
            ✕
          </button>
        </div>

        <div className="mt-4 grid gap-2.5">
          {member.email ? (
            <a
              href={`mailto:${member.email}`}
              className="flex items-center gap-2 rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-2.5 text-sm text-administrative-coordinator-on-surface hover:border-administrative-coordinator-primary hover:text-administrative-coordinator-primary"
              dir="ltr"
            >
              ✉️ {member.email}
            </a>
          ) : (
            <p className="text-sm italic text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'לא הוגדר אימייל' : 'No email on file'}</p>
          )}

          {member.phoneNumber ? (
            <a
              href={`tel:${member.phoneNumber}`}
              className="flex items-center gap-2 rounded-lg border border-administrative-coordinator-outline-variant bg-administrative-coordinator-surface-container-low px-3 py-2.5 text-sm text-administrative-coordinator-on-surface hover:border-administrative-coordinator-primary hover:text-administrative-coordinator-primary"
              dir="ltr"
            >
              📞 {member.phoneNumber}
            </a>
          ) : (
            <p className="text-sm italic text-administrative-coordinator-on-surface-variant">{lang === 'he' ? 'לא הוגדר טלפון' : 'No phone number on file'}</p>
          )}
        </div>
      </div>
    </div>
  );
}

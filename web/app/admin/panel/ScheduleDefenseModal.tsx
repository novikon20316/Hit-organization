'use client';

// app/admin/panel/ScheduleDefenseModal.tsx
// Ported from mobile's ScheduleDefenseModal + panel.tsx's
// handleScheduleDefense. Uses the generalized assignDefenseLogistics('admin', ...)
// apiClient method — same assignDefense controller as coordinator/
// administrative coordinator, just mounted under /api/admin.

import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { DefenseBuildingPicker } from '@/components/DefenseBuildingPicker';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { AdminProjectRecord } from './types';

interface ScheduleDefenseModalProps {
  project: AdminProjectRecord;
  onClose: () => void;
  onSaved: () => void;
}

export function ScheduleDefenseModal({ project, onClose, onSaved }: ScheduleDefenseModalProps) {
  const { lang } = useLanguage();
  const [time, setTime] = useState('');
  const [room, setRoom] = useState('');
  const [building, setBuilding] = useState('');
  const [onlineDefenseLink, setOnlineDefenseLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useModalA11y(modalRef, true, onClose);

  const handleSave = async () => {
    if (!time.trim() || !room.trim() || !building) {
      setError(lang === 'he' ? 'יש למלא שעה, חדר ובניין' : 'Time, room, and building are all required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.assignDefenseLogistics('admin', project.id, {
        time: time.trim(),
        room: room.trim(),
        building,
        ...(onlineDefenseLink.trim() ? { onlineDefenseLink: onlineDefenseLink.trim() } : {}),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שמירת פרטי ההגנה נכשלה' : 'Failed to save defense logistics');
    } finally {
      setSaving(false);
    }
  };

  const projectTitle = lang === 'he' ? project.titleHe : project.titleEn;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <h2 className="text-lg font-semibold text-ink">🛡 {lang === 'he' ? 'תאם הגנה' : 'Schedule Defense'}</h2>
        {projectTitle && <p className="mt-1 truncate text-sm text-muted">📁 {projectTitle}</p>}

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'שעה' : 'Time'}</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="HH:MM" className={inputCls} />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'חדר' : 'Room'}</span>
          <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder={lang === 'he' ? 'חדר 101' : 'Room 101'} className={inputCls} />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'בניין' : 'Building'}</span>
          <DefenseBuildingPicker value={building} onChange={setBuilding} />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            {lang === 'he' ? 'קישור להגנה מקוונת (אופציונלי)' : 'Online defense link (optional)'}
          </span>
          <input
            value={onlineDefenseLink}
            onChange={(e) => setOnlineDefenseLink(e.target.value)}
            placeholder="https://zoom.us/j/..."
            className={inputCls}
          />
        </label>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink hover:bg-paper">
            {lang === 'he' ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? '…' : lang === 'he' ? 'שמור' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

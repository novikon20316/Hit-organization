'use client';

// app/coordinator/home/DefenseLogisticsModal.tsx
// Ported from mobile's defense logistics modal in coordinator/home.tsx — the
// date itself was already locked in by the examiner date-matching flow, the
// coordinator only sets time/room/building here. Mirrors the same modal
// already built for administrative_secretary/admin, just under the
// 'coordinator' base path (see apiClient.assignDefenseLogistics).

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { DefenseBuildingPicker } from '@/components/DefenseBuildingPicker';
import type { AssignedMilestone, Project } from './types';

interface DefenseLogisticsModalProps {
  project: Project;
  milestone: AssignedMilestone;
  onClose: () => void;
  onSaved: () => void;
}

export function DefenseLogisticsModal({ project, milestone, onClose, onSaved }: DefenseLogisticsModalProps) {
  const { lang } = useLanguage();
  const [time, setTime] = useState('');
  const [room, setRoom] = useState('');
  const [building, setBuilding] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!time.trim() || !room.trim() || !building) {
      setError(lang === 'he' ? 'יש למלא שעה, חדר ובניין' : 'Time, room, and building are all required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.assignDefenseLogistics('coordinator', project.id, { time: time.trim(), room: room.trim(), building });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'שמירת פרטי ההגנה נכשלה' : 'Failed to save defense logistics');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';
  const title = lang === 'he' ? project.titleHe : project.titleEn;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">📍 {lang === 'he' ? 'פרטי ההגנה' : 'Defense Logistics'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        {title && <p className="mt-1 truncate text-sm text-muted">📁 {title}</p>}
        {milestone.defenseDate && (
          <p className="mt-1 text-xs text-muted">
            {lang === 'he' ? 'תאריך שנקבע:' : 'Confirmed date:'} {milestone.defenseDate}
          </p>
        )}

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'שעה' : 'Time'}</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="HH:MM" className={inputCls} />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'חדר' : 'Room'}</span>
          <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder={lang === 'he' ? 'חדר 101' : 'Room 101'} className={inputCls} />
        </label>

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'בניין' : 'Building'}</span>
          <DefenseBuildingPicker value={building} onChange={setBuilding} />
        </div>

        {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

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

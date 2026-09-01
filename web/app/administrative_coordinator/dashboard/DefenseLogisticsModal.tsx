'use client';

// app/administrative_coordinator/dashboard/DefenseLogisticsModal.tsx
import { useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { DefenseBuildingPicker } from '@/components/DefenseBuildingPicker';
import { useModalA11y } from '@/hooks/useModalA11y';
import type { ProjectGroup } from './types';

interface DefenseLogisticsModalProps {
  group: ProjectGroup;
  onClose: () => void;
  onSaved: () => void;
}

export function DefenseLogisticsModal({ group, onClose, onSaved }: DefenseLogisticsModalProps) {
  const { lang, t } = useLanguage();
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
      await apiClient.assignDefenseLogistics('project-coordinator', group.id, {
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

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--radius)] bg-surface p-6 shadow-lg outline-none"
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-ink">🛡 {lang === 'he' ? 'תאם הגנה' : 'Schedule Defense'}</h2>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגור' : 'Close'} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="mt-3 rounded-lg bg-paper p-3">
          <p className="text-sm font-semibold text-ink">{group.projectTitle}</p>
          <p className="mt-0.5 text-xs text-muted">👥 {group.members.map((m) => m.name).join(', ')}</p>
          {group.defenseDate && (
            <p className="mt-0.5 text-xs text-muted">
              📅 {t('defenseDate')} {new Date(group.defenseDate).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US')}
            </p>
          )}
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{t('defenseTime')}</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="HH:MM" className={inputCls} />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{t('defenseRoom')}</span>
          <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder={lang === 'he' ? 'חדר 101' : 'Room 101'} className={inputCls} />
        </label>

        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'בניין' : 'Building'}</span>
          <DefenseBuildingPicker value={building} onChange={setBuilding} />
        </div>

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

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? '…' : lang === 'he' ? 'שמור' : 'Save'}
        </button>
      </div>
    </div>
  );
}

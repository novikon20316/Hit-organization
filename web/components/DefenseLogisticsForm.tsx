'use client';

// components/DefenseLogisticsForm.tsx
// The one set-or-edit form for a defense's logistics, shared by the
// coordinator, administrative coordinator and system_admin modals (each
// keeps its own themed wrapper and passes its own class names). Talks to
// coordinatorController.ts's assignDefense, which creates/updates/deletes the
// Zoom meeting itself when the server has Zoom configured — otherwise this
// form asks staff to paste a meeting link.

import { useEffect, useState, type ReactNode } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { DefenseBuildingPicker } from '@/components/DefenseBuildingPicker';
import { InfoTooltip } from '@/components/InfoTooltip';
import {
  defenseModeIcon,
  defenseModeLabel,
  resolveDefenseMode,
  type DefenseLogisticsFields,
  type DefenseMode,
  type DefenseStaffBasePath,
} from '@/lib/defenseDisplay';

const MODES: DefenseMode[] = ['in_person', 'zoom', 'hybrid'];

function FieldLabel({ tip, children }: { tip?: { he: string; en: string }; children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-sm font-medium">
      {children}
      {tip && <InfoTooltip text={tip} />}
    </span>
  );
}

/** Local 'YYYY-MM-DD' for a date input (staff and the server both work in
 *  Asia/Jerusalem, so the browser's local day is the defense day). */
function manualLinkInitial(initial?: DefenseLogisticsFields): string {
  // Legacy docs (no zoomMeeting) with a link were always staff-pasted.
  if (!initial?.onlineDefenseLink) return '';
  return !initial.zoomMeeting || initial.zoomMeeting.createdBy === 'manual' ? initial.onlineDefenseLink : '';
}

function toDateInputValue(d: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface DefenseLogisticsFormProps {
  basePath: DefenseStaffBasePath;
  projectId: string;
  /** Needed only for "Open as host" on a system-created Zoom meeting. */
  milestoneId?: string | null;
  /** The currently agreed defense date (from the examiner date-matching flow or a previous edit). */
  confirmedDate: Date | null;
  /** Existing logistics — present when editing an already-scheduled defense. */
  initial?: DefenseLogisticsFields;
  inputClassName: string;
  primaryButtonClassName: string;
  secondaryButtonClassName?: string;
  /** Per-field (i) tooltip text, keyed by field ('mode' | 'date' | 'time' | 'room' | 'building' | 'onlineLink'). */
  tooltip?: (key: string) => { he: string; en: string } | undefined;
  onSaved: () => void;
  onCancel?: () => void;
}

export function DefenseLogisticsForm({
  basePath,
  projectId,
  milestoneId,
  confirmedDate,
  initial,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  tooltip,
  onSaved,
  onCancel,
}: DefenseLogisticsFormProps) {
  const { lang } = useLanguage();
  const isEdit = !!initial?.defenseTime;
  const originalDate = toDateInputValue(confirmedDate);

  const [mode, setMode] = useState<DefenseMode>(initial ? resolveDefenseMode(initial) : 'in_person');
  const [date, setDate] = useState(originalDate);
  const [time, setTime] = useState(initial?.defenseTime ?? '');
  const [durationMinutes, setDurationMinutes] = useState(initial?.defenseDurationMinutes ?? 90);
  const [room, setRoom] = useState(initial?.defenseRoom ?? '');
  const [building, setBuilding] = useState(initial?.defenseBuilding ?? '');
  const existingApiMeeting = initial?.zoomMeeting?.createdBy === 'api';
  const [manualLink, setManualLink] = useState(manualLinkInitial(initial));
  const [showManualLink, setShowManualLink] = useState(!!manualLinkInitial(initial));
  const [zoomConfigured, setZoomConfigured] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getDefenseConfig(basePath)
      .then((c) => !cancelled && setZoomConfigured(c.zoomConfigured))
      .catch(() => !cancelled && setZoomConfigured(false));
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  const needsPlace = mode !== 'zoom';
  const needsOnline = mode !== 'in_person';
  // A pasted link always wins on the server; with Zoom configured the field
  // is an optional override, without it it's the only way to get a link.
  const needsManualLink = needsOnline && (zoomConfigured === false || showManualLink) && !manualLink.trim();
  const dateChanged = !!date && date !== originalDate;
  const he = lang === 'he';

  const handleSave = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) {
      setError(he ? 'יש להזין שעה בפורמט HH:MM' : 'Enter a time in HH:MM format');
      return;
    }
    if (needsPlace && (!room.trim() || !building)) {
      setError(he ? 'יש למלא חדר ובניין' : 'Room and building are required');
      return;
    }
    if (needsManualLink) {
      setError(he ? 'יש להדביק קישור לפגישת Zoom' : 'Paste a Zoom meeting link');
      return;
    }
    if (!date) {
      setError(he ? 'יש לבחור תאריך' : 'Choose a date');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.assignDefenseLogistics(basePath, projectId, {
        mode,
        time: time.trim(),
        durationMinutes,
        ...(dateChanged ? { date } : {}),
        ...(needsPlace ? { room: room.trim(), building } : {}),
        ...(needsOnline && (zoomConfigured === false || showManualLink) && manualLink.trim() ? { manualZoomLink: manualLink.trim() } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'שמירת פרטי ההגנה נכשלה' : 'Failed to save defense logistics');
    } finally {
      setSaving(false);
    }
  };

  const openAsHost = async () => {
    if (!milestoneId) return;
    try {
      const { startUrl } = await apiClient.getDefenseZoomStartUrl(basePath, milestoneId);
      window.open(startUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'לא ניתן לפתוח את הפגישה' : 'Could not open the meeting');
    }
  };

  const copyLink = async () => {
    if (!initial?.onlineDefenseLink) return;
    try {
      await navigator.clipboard.writeText(initial.onlineDefenseLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (permissions/insecure context) — the link is still visible to select by hand.
    }
  };

  return (
    <div>
      <div data-field-guide-id="mode" className="mt-4">
        <FieldLabel tip={tooltip?.('mode')}>{he ? 'אופן ההגנה' : 'Defense format'}</FieldLabel>
        <div role="radiogroup" aria-label={he ? 'אופן ההגנה' : 'Defense format'} className="grid grid-cols-3 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium ${
                mode === m ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink hover:border-primary'
              }`}
            >
              <span aria-hidden="true">{defenseModeIcon(m)}</span> {m === 'in_person' ? (he ? 'פרונטלי' : 'In person') : m === 'zoom' ? 'Zoom' : he ? 'היברידי' : 'Hybrid'}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">{defenseModeLabel(mode, lang)}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label data-field-guide-id="date" className="block">
          <FieldLabel tip={tooltip?.('date')}>{he ? 'תאריך' : 'Date'}</FieldLabel>
          <input type="date" value={date} min={toDateInputValue(new Date())} onChange={(e) => setDate(e.target.value)} className={inputClassName} />
        </label>
        <label data-field-guide-id="time" className="block">
          <FieldLabel tip={tooltip?.('time')}>{he ? 'שעה' : 'Time'}</FieldLabel>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClassName} />
        </label>
      </div>
      {dateChanged && (
        <p className="mt-2 rounded-md bg-[#FBF3E3] px-3 py-2 text-xs text-accent" role="status">
          ⚠️ {he
            ? 'שינוי התאריך יעדכן את הסטודנטים, המנחה והבוחנים, ובוחנים חיצוניים יקבלו קוד גישה חדש ליום ההגנה.'
            : 'Changing the date notifies the students, supervisor and examiners, and external examiners get a new defense-day access code.'}
        </p>
      )}

      <label className="mt-4 block">
        <FieldLabel tip={tooltip?.('duration')}>{he ? 'משך (דקות)' : 'Duration (minutes)'}</FieldLabel>
        <input
          type="number"
          min={15}
          max={480}
          step={15}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value) || 90)}
          className={inputClassName}
        />
      </label>

      {needsPlace && (
        <>
          <div data-field-guide-id="building" className="mt-4">
            <FieldLabel tip={tooltip?.('building')}>{he ? 'בניין' : 'Building'}</FieldLabel>
            <DefenseBuildingPicker value={building} onChange={setBuilding} />
          </div>
          <label data-field-guide-id="room" className="mt-4 block">
            <FieldLabel tip={tooltip?.('room')}>{he ? 'חדר' : 'Room'}</FieldLabel>
            <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder={he ? 'חדר 101' : 'Room 101'} className={inputClassName} />
          </label>
        </>
      )}

      {needsOnline && (
        <div data-field-guide-id="onlineLink" className="mt-4 rounded-lg border border-line bg-paper p-3">
          <FieldLabel tip={tooltip?.('onlineLink')}>💻 {he ? 'פגישת Zoom' : 'Zoom meeting'}</FieldLabel>
          {existingApiMeeting && initial?.onlineDefenseLink && !showManualLink ? (
            <>
              <p className="break-all text-xs text-ink">{initial.onlineDefenseLink}</p>
              {initial.zoomMeeting?.meetingId && (
                <p className="mt-1 text-xs text-muted">
                  {he ? 'מזהה פגישה:' : 'Meeting ID:'} {initial.zoomMeeting.meetingId}
                  {initial.zoomMeeting.passcode ? ` · ${he ? 'סיסמה:' : 'Passcode:'} ${initial.zoomMeeting.passcode}` : ''}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={copyLink} className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:border-primary">
                  {copied ? (he ? 'הועתק ✓' : 'Copied ✓') : he ? 'העתק קישור' : 'Copy link'}
                </button>
                {milestoneId && (
                  <button type="button" onClick={openAsHost} className="rounded-md border border-line px-2.5 py-1 text-xs text-ink hover:border-primary">
                    {he ? 'פתח כמארח' : 'Open as host'}
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                {he ? 'שינוי תאריך/שעה יעדכן את הפגישה ב-Zoom אוטומטית.' : 'Changing the date/time updates the Zoom meeting automatically.'}
              </p>
            </>
          ) : zoomConfigured ? (
            <p className="text-xs text-muted">
              {he ? 'פגישת Zoom תיווצר אוטומטית בשמירה, והקישור יישלח לכל המשתתפים.' : 'A Zoom meeting is created automatically on save and the link is sent to everyone.'}
            </p>
          ) : null}
          {zoomConfigured === false || showManualLink ? (
            <label className="mt-2 block">
              <span className="mb-1 block text-xs text-muted">
                {zoomConfigured === false
                  ? he ? 'יצירה אוטומטית אינה מוגדרת — הדביקו קישור לפגישה:' : 'Automatic creation is not set up — paste a meeting link:'
                  : he ? 'קישור ידני (במקום הפגישה האוטומטית):' : 'Manual link (instead of the automatic meeting):'}
              </span>
              <input value={manualLink} onChange={(e) => setManualLink(e.target.value)} placeholder="https://zoom.us/j/..." className={inputClassName} />
            </label>
          ) : (
            <button type="button" onClick={() => setShowManualLink(true)} className="mt-2 text-xs text-primary hover:underline">
              {he ? 'יש לי כבר קישור — הזנה ידנית' : 'I already have a link — enter it manually'}
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <div className="mt-6 flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButtonClassName}>
            {he ? 'ביטול' : 'Cancel'}
          </button>
        )}
        <button type="button" onClick={handleSave} disabled={saving || zoomConfigured === null} className={primaryButtonClassName}>
          {saving ? '…' : isEdit ? (he ? 'שמור שינויים' : 'Save changes') : he ? 'שמור' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// components/modals/ScheduleDefenseModal.tsx
// The one set-or-edit modal for a defense's logistics (format, date, time,
// place, Zoom) on mobile — used by the coordinator, administrative
// coordinator and admin screens. Mirrors web's components/DefenseLogisticsForm.tsx
// and posts to the same assignDefense controller, which creates/updates/
// deletes the Zoom meeting itself when the server has Zoom configured.
import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator, Alert, Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import DefenseBuildingPicker from '../DefenseBuildingPicker';
import { tx } from '../i18n';
import { ScheduleDefenseModalStyles } from '../../constants/styles';
import { apiClient } from '@/src/api/apiClient';
import { InfoTooltip } from '@/components/InfoTooltip';
import { FieldGuideOverlay } from '@/components/guidance/FieldGuideOverlay';
import { FieldGuideTarget } from '@/components/guidance/FieldGuideTarget';
import type { FieldGuideStep } from '@/components/guidance/types';
import {
  defenseModeIcon,
  defenseModeLabel,
  resolveDefenseMode,
  type DefenseLogisticsFields,
  type DefenseMode,
  type DefenseStaffBasePath,
} from '@/utils/defenseDisplay';

type Lang = 'he' | 'en';

const MODES: DefenseMode[] = ['in_person', 'zoom', 'hybrid'];

function FieldLabel({ text, tip, isRtl }: { text: string; tip?: { he: string; en: string }; isRtl: boolean }) {
  return (
    <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center' }}>
      <Text style={s.label}>{text}</Text>
      {tip && <InfoTooltip textHe={tip.he} textEn={tip.en} />}
    </View>
  );
}

/** Local 'YYYY-MM-DD' (staff and the server both work in Asia/Jerusalem). */
function toDateValue(d: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function manualLinkInitial(initial?: DefenseLogisticsFields): string {
  // Legacy docs (no zoomMeeting) with a link were always staff-pasted.
  if (!initial?.onlineDefenseLink) return '';
  return !initial.zoomMeeting || initial.zoomMeeting.createdBy === 'manual' ? initial.onlineDefenseLink : '';
}

interface Props {
  visible: boolean;
  basePath: DefenseStaffBasePath;
  projectId: string | null;
  projectTitle?: string;
  /** Needed only for "Open as host" on a system-created Zoom meeting. */
  milestoneId?: string | null;
  /** The currently agreed defense date. */
  confirmedDate: Date | null;
  /** Existing logistics — present when editing an already-scheduled defense. */
  initial?: DefenseLogisticsFields;
  lang: Lang;
  isRtl: boolean;
  guideKey?: string;
  guideSteps?: FieldGuideStep[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ScheduleDefenseModal(props: Props) {
  // Remount the form per open so its state always starts from `initial`.
  if (!props.visible) return null;
  return <ScheduleDefenseForm {...props} />;
}

function ScheduleDefenseForm({
  visible, basePath, projectId, projectTitle, milestoneId, confirmedDate, initial,
  lang, isRtl, guideKey, guideSteps, onClose, onSaved,
}: Props) {
  const he = lang === 'he';
  const isEdit = !!initial?.defenseTime;
  const originalDate = toDateValue(confirmedDate);

  const [mode, setMode] = useState<DefenseMode>(initial ? resolveDefenseMode(initial) : 'in_person');
  const [date, setDate] = useState(originalDate);
  const [time, setTime] = useState(initial?.defenseTime ?? '');
  const [duration, setDuration] = useState(String(initial?.defenseDurationMinutes ?? 90));
  const [room, setRoom] = useState(initial?.defenseRoom ?? '');
  const [building, setBuilding] = useState(initial?.defenseBuilding ?? '');
  const [manualLink, setManualLink] = useState(manualLinkInitial(initial));
  const [showManualLink, setShowManualLink] = useState(!!manualLinkInitial(initial));
  const [zoomConfigured, setZoomConfigured] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.get(`/api/${basePath}/defense-config`)
      .then((res) => { if (!cancelled) setZoomConfigured(!!res.data?.zoomConfigured); })
      .catch(() => { if (!cancelled) setZoomConfigured(false); });
    return () => { cancelled = true; };
  }, [basePath]);

  const needsPlace = mode !== 'zoom';
  const needsOnline = mode !== 'in_person';
  const useManualLink = zoomConfigured === false || showManualLink;
  const existingApiMeeting = initial?.zoomMeeting?.createdBy === 'api' && !!initial?.onlineDefenseLink;
  const dateChanged = !!date && date !== originalDate;
  const tip = (key: string) => guideSteps?.find((s) => s.key === key)?.description;
  const fail = (msg: string) => Alert.alert(he ? 'שגיאה' : 'Error', msg);

  const handleSave = async () => {
    if (!projectId) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) return fail(he ? 'יש להזין שעה בפורמט HH:MM' : 'Enter a time in HH:MM format');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(he ? 'יש להזין תאריך בפורמט YYYY-MM-DD' : 'Enter a date in YYYY-MM-DD format');
    if (needsPlace && (!room.trim() || !building)) return fail(he ? 'יש למלא חדר ובניין' : 'Room and building are required');
    if (needsOnline && useManualLink && !manualLink.trim()) return fail(he ? 'יש להדביק קישור לפגישת Zoom' : 'Paste a Zoom meeting link');
    const durationMinutes = parseInt(duration, 10);
    setSaving(true);
    try {
      await apiClient.post(`/api/${basePath}/projects/${projectId}/assign-defense`, {
        mode,
        time: time.trim(),
        ...(Number.isInteger(durationMinutes) ? { durationMinutes } : {}),
        ...(dateChanged ? { date } : {}),
        ...(needsPlace ? { room: room.trim(), building } : {}),
        ...(needsOnline && useManualLink && manualLink.trim() ? { manualZoomLink: manualLink.trim() } : {}),
      });
      Alert.alert('✅', he ? 'פרטי ההגנה נשמרו בהצלחה' : 'Defense logistics saved successfully');
      onSaved();
      onClose();
    } catch (e: any) {
      fail(e.response?.data?.message || (he ? 'שמירת פרטי ההגנה נכשלה' : 'Failed to save defense logistics'));
    } finally {
      setSaving(false);
    }
  };

  const openAsHost = async () => {
    if (!milestoneId) return;
    try {
      const res = await apiClient.get(`/api/${basePath}/milestones/${encodeURIComponent(milestoneId)}/zoom-start-url`);
      if (res.data?.startUrl) Linking.openURL(res.data.startUrl);
    } catch (e: any) {
      fail(e.response?.data?.message || (he ? 'לא ניתן לפתוח את הפגישה' : 'Could not open the meeting'));
    }
  };

  const inputStyle = [s.input, isRtl && { textAlign: 'right' as const }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={s.modal} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {guideKey && guideSteps && <FieldGuideOverlay guideKey={guideKey} steps={guideSteps} />}
        <Text style={s.title}>
          🛡 {isEdit ? (he ? 'עריכת פרטי ההגנה' : 'Edit Defense Details') : tx('scheduleDefense', lang)}
        </Text>
        {projectTitle ? <Text style={s.subtitle} numberOfLines={2}>📁 {projectTitle}</Text> : null}

        <FieldGuideTarget fieldKey="mode">
          <View>
            <FieldLabel isRtl={isRtl} tip={tip('mode')} text={he ? 'אופן ההגנה' : 'Defense format'} />
            <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 6 }} accessibilityRole="radiogroup">
              {MODES.map((m) => {
                const selected = mode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMode(m)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[s.input, { flex: 1, alignItems: 'center', paddingVertical: 10 }, selected && { borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}
                  >
                    <Text style={{ fontSize: 13, fontWeight: selected ? '700' : '500' }}>
                      {defenseModeIcon(m)} {m === 'in_person' ? (he ? 'פרונטלי' : 'In person') : m === 'zoom' ? 'Zoom' : he ? 'היברידי' : 'Hybrid'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={s.subtitle}>{defenseModeLabel(mode, lang)}</Text>
          </View>
        </FieldGuideTarget>

        <FieldGuideTarget fieldKey="date">
          <View>
            <FieldLabel isRtl={isRtl} tip={tip('date')} text={he ? 'תאריך (YYYY-MM-DD)' : 'Date (YYYY-MM-DD)'} />
            <TextInput style={inputStyle} value={date} onChangeText={setDate} placeholder="2026-12-31" placeholderTextColor="#9CA3AF" autoCapitalize="none" />
            {dateChanged && (
              <Text style={[s.subtitle, { color: '#B45309', marginTop: 6 }]}>
                ⚠️ {he
                  ? 'שינוי התאריך יעדכן את הסטודנטים, המנחה והבוחנים, ובוחנים חיצוניים יקבלו קוד גישה חדש.'
                  : 'Changing the date notifies everyone, and external examiners get a new access code.'}
              </Text>
            )}
          </View>
        </FieldGuideTarget>

        <FieldGuideTarget fieldKey="time">
          <View>
            <FieldLabel isRtl={isRtl} tip={tip('time')} text={tx('defenseTime', lang)} />
            <TextInput style={inputStyle} value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor="#9CA3AF" />
          </View>
        </FieldGuideTarget>

        <FieldLabel isRtl={isRtl} tip={tip('duration')} text={he ? 'משך (דקות)' : 'Duration (minutes)'} />
        <TextInput style={inputStyle} value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="90" placeholderTextColor="#9CA3AF" />

        {needsPlace && (
          <>
            <FieldGuideTarget fieldKey="building">
              <View>
                <FieldLabel isRtl={isRtl} tip={tip('building')} text={tx('defenseBuilding', lang)} />
                <DefenseBuildingPicker value={building} onChange={setBuilding} lang={lang} />
              </View>
            </FieldGuideTarget>
            <FieldGuideTarget fieldKey="room">
              <View>
                <FieldLabel isRtl={isRtl} tip={tip('room')} text={tx('defenseRoom', lang)} />
                <TextInput style={inputStyle} value={room} onChangeText={setRoom} placeholder={he ? 'חדר 101' : 'Room 101'} placeholderTextColor="#9CA3AF" />
              </View>
            </FieldGuideTarget>
          </>
        )}

        {needsOnline && (
          <FieldGuideTarget fieldKey="onlineLink">
            <View>
              <FieldLabel isRtl={isRtl} tip={tip('onlineLink')} text={`💻 ${he ? 'פגישת Zoom' : 'Zoom meeting'}`} />
              {existingApiMeeting && !showManualLink ? (
                <View>
                  <Text style={s.subtitle} selectable>{initial?.onlineDefenseLink}</Text>
                  {initial?.zoomMeeting?.meetingId ? (
                    <Text style={s.subtitle} selectable>
                      {he ? 'מזהה פגישה:' : 'Meeting ID:'} {initial.zoomMeeting.meetingId}
                      {initial.zoomMeeting.passcode ? ` · ${he ? 'סיסמה:' : 'Passcode:'} ${initial.zoomMeeting.passcode}` : ''}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: isRtl ? 'row-reverse' : 'row', gap: 12 }}>
                    <Pressable onPress={() => Clipboard.setStringAsync(initial?.onlineDefenseLink ?? '')} accessibilityRole="button">
                      <Text style={{ color: '#2563EB', fontWeight: '600' }}>{he ? 'העתק קישור' : 'Copy link'}</Text>
                    </Pressable>
                    {milestoneId ? (
                      <Pressable onPress={openAsHost} accessibilityRole="button">
                        <Text style={{ color: '#2563EB', fontWeight: '600' }}>{he ? 'פתח כמארח' : 'Open as host'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : zoomConfigured && !showManualLink ? (
                <Text style={s.subtitle}>
                  {he ? 'פגישת Zoom תיווצר אוטומטית בשמירה, והקישור יישלח לכל המשתתפים.' : 'A Zoom meeting is created automatically on save and the link is sent to everyone.'}
                </Text>
              ) : null}
              {useManualLink ? (
                <TextInput
                  style={inputStyle}
                  value={manualLink}
                  onChangeText={setManualLink}
                  placeholder="https://zoom.us/j/..."
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
              ) : (
                <Pressable onPress={() => setShowManualLink(true)} accessibilityRole="button">
                  <Text style={{ color: '#2563EB', marginTop: 6 }}>{he ? 'יש לי כבר קישור — הזנה ידנית' : 'I already have a link — enter it manually'}</Text>
                </Pressable>
              )}
            </View>
          </FieldGuideTarget>
        )}

        <Pressable
          style={[s.saveBtn, (saving || zoomConfigured === null) && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving || zoomConfigured === null}
          accessibilityRole="button"
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.saveBtnText}>{isEdit ? (he ? 'שמור שינויים' : 'Save changes') : he ? 'שמור' : 'Save'}</Text>}
        </Pressable>

        <Pressable style={s.cancelBtn} onPress={onClose} accessibilityRole="button">
          <Text style={s.cancelBtnText}>{he ? 'ביטול' : 'Cancel'}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const s = ScheduleDefenseModalStyles;

// components/modals/ProposeMeetingModal.tsx
// Lets a supervisor offer 1-5 candidate date/time slots for a meeting with
// an applicant — see server/src/controllers/supervisorController.ts's
// proposeMeeting. The student then picks one (ApplicationStatusCard.tsx on
// their side). Scheduling a meeting never decides the application —
// Approve/Reject stay available in dashboard.tsx throughout.
//
// No native date-picker dependency in this app yet (see app/examinor/
// home.tsx's own candidate-defense-date rows for the same precedent) — each
// slot is a plain YYYY-MM-DD + HH:MM text-field pair, validated per row.
import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { ScheduleDefenseModalStyles as s } from '../../constants/styles';

type Lang = 'he' | 'en';

interface ApplicationRef {
  id: string;
  projectTitleHe: string;
  projectTitleEn: string;
  studentName: string;
}

interface SlotDraft {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

const MAX_SLOTS = 5;
const emptySlot = (): SlotDraft => ({ date: '', time: '' });

function toIso(slot: SlotDraft): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date) || !/^\d{2}:\d{2}$/.test(slot.time)) return null;
  const d = new Date(`${slot.date}T${slot.time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface Props {
  visible: boolean;
  application: ApplicationRef | null;
  lang: Lang;
  isRtl: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (slots: string[]) => void | Promise<void>;
}

export default function ProposeMeetingModal({ visible, application, lang, isRtl, submitting, onClose, onSubmit }: Props) {
  const [slots, setSlots] = useState<SlotDraft[]>([emptySlot()]);
  const [error, setError] = useState('');

  const reset = () => { setSlots([emptySlot()]); setError(''); };
  const handleClose = () => { reset(); onClose(); };

  const updateSlot = (i: number, field: keyof SlotDraft, value: string) =>
    setSlots((prev) => prev.map((sl, idx) => (idx === i ? { ...sl, [field]: value } : sl)));
  const addSlot = () => setSlots((prev) => (prev.length < MAX_SLOTS ? [...prev, emptySlot()] : prev));
  const removeSlot = (i: number) => setSlots((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    setError('');
    const isoSlots: string[] = [];
    for (const slot of slots) {
      if (!slot.date && !slot.time) continue;
      const iso = toIso(slot);
      if (!iso) {
        setError(lang === 'he' ? 'תאריך/שעה לא תקינים (YYYY-MM-DD, HH:MM)' : 'Invalid date/time (YYYY-MM-DD, HH:MM)');
        return;
      }
      if (new Date(iso).getTime() <= Date.now()) {
        setError(lang === 'he' ? 'יש לבחור מועד עתידי' : 'Times must be in the future');
        return;
      }
      isoSlots.push(iso);
    }
    if (isoSlots.length === 0) {
      setError(lang === 'he' ? 'יש להזין לפחות מועד אחד' : 'At least one time is required');
      return;
    }
    await onSubmit(isoSlots);
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={s.modal} contentContainerStyle={s.content}>
        <Text style={s.title}>📅 {lang === 'he' ? 'הצע מועדים לפגישה' : 'Propose Meeting Times'}</Text>

        {application && (
          <Text style={s.subtitle} numberOfLines={2}>
            📁 {lang === 'he' ? application.projectTitleHe : application.projectTitleEn} · {application.studentName}
          </Text>
        )}

        <Text style={[s.label, isRtl && { textAlign: 'right' }]}>
          {lang === 'he' ? 'הצע עד 5 מועדים — הסטודנט/ית יבחר/תבחר אחד מהם.' : 'Offer up to 5 times — the student will pick one.'}
        </Text>

        {slots.map((slot, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
            <TextInput
              style={[s.input, { flex: 1 }, isRtl && { textAlign: 'right' }]}
              value={slot.date}
              onChangeText={(v) => updateSlot(i, 'date', v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
            />
            <TextInput
              style={[s.input, { width: 90 }, isRtl && { textAlign: 'right' }]}
              value={slot.time}
              onChangeText={(v) => updateSlot(i, 'time', v)}
              placeholder="HH:MM"
              placeholderTextColor="#9CA3AF"
            />
            {slots.length > 1 && (
              <Pressable
                onPress={() => removeSlot(i)}
                accessibilityRole="button"
                accessibilityLabel={lang === 'he' ? 'הסר מועד' : 'Remove time'}
                style={{ padding: 6 }}
              >
                <Text style={{ color: '#B91C1C', fontSize: 16 }}>✕</Text>
              </Pressable>
            )}
          </View>
        ))}

        {slots.length < MAX_SLOTS && (
          <Pressable onPress={addSlot} accessibilityRole="button" style={{ marginTop: 10 }}>
            <Text style={{ color: '#2E86FF', fontWeight: '600', fontSize: 13 }}>
              + {lang === 'he' ? 'הוסף מועד נוסף' : 'Add another time'}
            </Text>
          </Pressable>
        )}

        {!!error && <Text style={{ color: '#D32F2F', marginTop: 12, fontSize: 13 }}>{error}</Text>}

        <Pressable style={[s.saveBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmit} disabled={submitting} accessibilityRole="button">
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{lang === 'he' ? 'שלח הצעה' : 'Send Proposal'}</Text>}
        </Pressable>

        <Pressable style={s.cancelBtn} onPress={handleClose} accessibilityRole="button">
          <Text style={s.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

import React, { useState } from 'react';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator, StyleSheet,
} from 'react-native';
import DefenseBuildingPicker from '../DefenseBuildingPicker';
import { tx } from '../i18n';

type Lang = 'he' | 'en';

interface ProjectRecord {
  id: string;
  titleHe: string;
  titleEn: string;
}

interface Props {
  visible: boolean;
  project: ProjectRecord | null;
  lang: Lang;
  isRtl: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (fields: { time: string; room: string; building: string }) => void | Promise<void>;
}

export default function ScheduleDefenseModal({ visible, project, lang, isRtl, saving, onClose, onSave }: Props) {
  const [time, setTime] = useState('');
  const [room, setRoom] = useState('');
  const [building, setBuilding] = useState('');

  const reset = () => { setTime(''); setRoom(''); setBuilding(''); };
  const handleClose = () => { reset(); onClose(); };
  const handleSave = async () => {
    await onSave({ time: time.trim(), room: room.trim(), building });
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={s.modal} contentContainerStyle={s.content}>
        <Text style={s.title}>🛡 {tx('scheduleDefense', lang)}</Text>

        {project && (
          <Text style={s.subtitle} numberOfLines={2}>
            📁 {lang === 'he' ? project.titleHe : project.titleEn}
          </Text>
        )}

        <Text style={s.label}>{tx('defenseTime', lang)}</Text>
        <TextInput
          style={[s.input, isRtl && { textAlign: 'right' }]}
          value={time}
          onChangeText={setTime}
          placeholder="HH:MM"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={s.label}>{tx('defenseRoom', lang)}</Text>
        <TextInput
          style={[s.input, isRtl && { textAlign: 'right' }]}
          value={room}
          onChangeText={setRoom}
          placeholder={lang === 'he' ? 'חדר 101' : 'Room 101'}
          placeholderTextColor="#9CA3AF"
        />

        <Text style={s.label}>{tx('defenseBuilding', lang)}</Text>
        <DefenseBuildingPicker value={building} onChange={setBuilding} lang={lang} />

        <Pressable style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.saveBtnText}>{lang === 'he' ? 'שמור' : 'Save'}</Text>
          }
        </Pressable>

        <Pressable style={s.cancelBtn} onPress={handleClose}>
          <Text style={s.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const s = StyleSheet.create({
  modal:        { flex: 1, backgroundColor: '#F8FAFC' },
  content:      { padding: 20, paddingBottom: 60 },
  title:        { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 8 },
  subtitle:     { fontSize: 13, color: '#64748B', marginBottom: 16 },
  label:        { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 10 },
  input:        { borderWidth: 1.5, borderColor: '#CBD5E1', borderRadius: 8,
                  padding: 11, fontSize: 14, color: '#1E293B', backgroundColor: '#fff' },
  saveBtn:      { backgroundColor: '#10B981', borderRadius: 12, padding: 15,
                  alignItems: 'center', marginTop: 20, marginBottom: 10 },
  saveBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:    { padding: 12, alignItems: 'center' },
  cancelBtnText:{ color: '#64748B', fontSize: 15 },
});

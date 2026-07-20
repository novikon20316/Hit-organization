import React, { useState } from 'react';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator,
} from 'react-native';
import DefenseBuildingPicker from '../DefenseBuildingPicker';
import { tx } from '../i18n';
import { ScheduleDefenseModalStyles } from '../../constants/styles';

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
  onSave: (fields: { time: string; room: string; building: string; onlineDefenseLink?: string }) => void | Promise<void>;
}

export default function ScheduleDefenseModal({ visible, project, lang, isRtl, saving, onClose, onSave }: Props) {
  const [time, setTime] = useState('');
  const [room, setRoom] = useState('');
  const [building, setBuilding] = useState('');
  const [onlineDefenseLink, setOnlineDefenseLink] = useState('');

  const reset = () => { setTime(''); setRoom(''); setBuilding(''); setOnlineDefenseLink(''); };
  const handleClose = () => { reset(); onClose(); };
  const handleSave = async () => {
    await onSave({
      time: time.trim(),
      room: room.trim(),
      building,
      ...(onlineDefenseLink.trim() ? { onlineDefenseLink: onlineDefenseLink.trim() } : {}),
    });
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

        <Text style={s.label}>{lang === 'he' ? 'קישור להגנה מקוונת (אופציונלי)' : 'Online defense link (optional)'}</Text>
        <TextInput
          style={[s.input, isRtl && { textAlign: 'right' }]}
          value={onlineDefenseLink}
          onChangeText={setOnlineDefenseLink}
          placeholder="https://zoom.us/j/..."
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
        />

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

const s = ScheduleDefenseModalStyles;

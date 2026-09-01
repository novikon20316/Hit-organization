// components/modals/StudentStatusesModal.tsx
//
// system_admin settings screen for the two admin-manageable Primary/
// Secondary student status option lists (see server/src/services/
// studentStatuses.ts). Each section is a plain add/remove/edit row list —
// same interaction pattern as the milestone-row editor in
// app/(tabs)/WorkflowTemplateManager.tsx. Rows without a `key` yet are
// brand-new entries; the server mints a key for them on save. Rows that
// already had a key keep it so students already set to that status aren't
// orphaned (see studentStatuses.ts's validateOptionList).

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { MaintenanceModalStyles, StudentStatusesModalStyles } from '../../constants/styles';
import type { StatusOption } from '@/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  lang: 'he' | 'en';
};

// Local-only row shape — `localId` exists purely so React (and our add/
// remove/edit handlers) have a stable key for brand-new rows that don't
// have a server-minted `key` yet. Never sent to the server.
type EditableOption = { localId: string; key?: string; labelHe: string; labelEn: string };

function makeLocalId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toEditable(list: StatusOption[]): EditableOption[] {
  return list.map((o) => ({ localId: makeLocalId(), key: o.key, labelHe: o.labelHe, labelEn: o.labelEn }));
}

export default function StudentStatusesModal({ visible, onClose, lang }: Props) {
  const isHe = lang === 'he';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [primary, setPrimary] = useState<EditableOption[]>([]);
  const [secondary, setSecondary] = useState<EditableOption[]>([]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        setLoading(true);
        const res = await apiClient.get('/api/student-statuses');
        setPrimary(toEditable(res.data?.primary ?? []));
        setSecondary(toEditable(res.data?.secondary ?? []));
      } catch (e) {
        console.error('Failed to load student status options:', e);
        Alert.alert(
          isHe ? 'שגיאה' : 'Error',
          isHe ? 'טעינת רשימות הסטטוסים נכשלה' : 'Failed to load the status lists'
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  const addRow = (section: 'primary' | 'secondary') => {
    const row: EditableOption = { localId: makeLocalId(), labelHe: '', labelEn: '' };
    if (section === 'primary') setPrimary((prev) => [...prev, row]);
    else setSecondary((prev) => [...prev, row]);
  };

  const removeRow = (section: 'primary' | 'secondary', localId: string) => {
    if (section === 'primary') setPrimary((prev) => prev.filter((r) => r.localId !== localId));
    else setSecondary((prev) => prev.filter((r) => r.localId !== localId));
  };

  const updateRow = (
    section: 'primary' | 'secondary',
    localId: string,
    field: 'labelHe' | 'labelEn',
    value: string
  ) => {
    const updater = (prev: EditableOption[]) =>
      prev.map((r) => (r.localId === localId ? { ...r, [field]: value } : r));
    if (section === 'primary') setPrimary(updater);
    else setSecondary(updater);
  };

  const handleSave = async () => {
    const emptyRow = [...primary, ...secondary].find((r) => !r.labelHe.trim() && !r.labelEn.trim());
    if (emptyRow) {
      Alert.alert(
        isHe ? 'שגיאה' : 'Error',
        isHe ? 'לכל שורה יש להזין תווית בעברית או באנגלית' : 'Every row needs a label in Hebrew or English'
      );
      return;
    }
    try {
      setSaving(true);
      const payload = {
        primary: primary.map((r) => (r.key ? { key: r.key, labelHe: r.labelHe.trim(), labelEn: r.labelEn.trim() } : { labelHe: r.labelHe.trim(), labelEn: r.labelEn.trim() })),
        secondary: secondary.map((r) => (r.key ? { key: r.key, labelHe: r.labelHe.trim(), labelEn: r.labelEn.trim() } : { labelHe: r.labelHe.trim(), labelEn: r.labelEn.trim() })),
      };
      const res = await apiClient.put('/api/admin/student-statuses', payload);
      setPrimary(toEditable(res.data?.primary ?? payload.primary));
      setSecondary(toEditable(res.data?.secondary ?? payload.secondary));
      Alert.alert('✅', isHe ? 'רשימות הסטטוסים עודכנו בהצלחה' : 'Status lists updated successfully');
      onClose();
    } catch (e: any) {
      Alert.alert(
        isHe ? 'שגיאה' : 'Error',
        e.response?.data?.message || (isHe ? 'עדכון רשימות הסטטוסים נכשל' : 'Failed to update the status lists')
      );
    } finally {
      setSaving(false);
    }
  };

  const renderSection = (
    title: string,
    section: 'primary' | 'secondary',
    rows: EditableOption[]
  ) => (
    <View style={s.section}>
      <View style={rs.sectionHeaderRow}>
        <Text style={s.sectionLabel}>{title}</Text>
        <Pressable style={rs.addBtn} onPress={() => addRow(section)} accessibilityRole="button">
          <Text style={rs.addBtnText}>＋ {isHe ? 'הוסף' : 'Add'}</Text>
        </Pressable>
      </View>

      {rows.length === 0 && (
        <Text style={rs.emptyText}>
          {isHe ? 'אין אפשרויות — הוסף שורה ראשונה' : 'No options yet — add the first row'}
        </Text>
      )}

      {rows.map((row) => (
        <View key={row.localId} style={rs.row}>
          <View style={rs.rowInputs}>
            <TextInput
              style={rs.rowInput}
              value={row.labelHe}
              onChangeText={(v) => updateRow(section, row.localId, 'labelHe', v)}
              placeholder={isHe ? 'תווית (עברית)' : 'Label (Hebrew)'}
              placeholderTextColor="#94A3B8"
              textAlign="right"
            />
            <TextInput
              style={[rs.rowInput, { marginTop: 6 }]}
              value={row.labelEn}
              onChangeText={(v) => updateRow(section, row.localId, 'labelEn', v)}
              placeholder={isHe ? 'תווית (אנגלית)' : 'Label (English)'}
              placeholderTextColor="#94A3B8"
            />
          </View>
          <Pressable
            style={rs.deleteBtn}
            onPress={() => removeRow(section, row.localId)}
            accessibilityRole="button"
            accessibilityLabel={isHe ? 'מחק שורה' : 'Remove row'}
          >
            <Text>🗑️</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { maxHeight: '92%' }]}>

          {/* ── Header ── */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.headerIcon}>
                <Text style={s.headerIconText}>🏷️</Text>
              </View>
              <View>
                <Text style={s.headerTitle}>
                  {isHe ? 'סטטוסי סטודנטים' : 'Student Statuses'}
                </Text>
                <Text style={s.headerSub}>
                  {isHe ? 'ניהול רשימות הסטטוס הראשי והמשני' : 'Manage the primary & secondary status lists'}
                </Text>
              </View>
            </View>
            <Pressable
              style={s.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={isHe ? 'סגור' : 'Close'}
            >
              <Text style={s.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#2E86FF" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
              {renderSection(isHe ? '🥇 סטטוס ראשי' : '🥇 Primary Status', 'primary', primary)}
              <View style={s.divider} />
              {renderSection(isHe ? '🥈 סטטוס משני' : '🥈 Secondary Status', 'secondary', secondary)}
            </ScrollView>
          )}

          {/* ── Footer ── */}
          <View style={s.footer}>
            <Pressable
              style={[s.saveBtn, saving && s.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || loading}
              accessibilityRole="button"
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.saveBtnText}>{isHe ? '💾 שמור' : '💾 Save'}</Text>
              }
            </Pressable>
            <Pressable style={s.cancelBtn} onPress={onClose} accessibilityRole="button">
              <Text style={s.cancelBtnText}>{isHe ? 'ביטול' : 'Cancel'}</Text>
            </Pressable>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const s = MaintenanceModalStyles;
const rs = StudentStatusesModalStyles;

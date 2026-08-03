// components/modals/BulkDueDateModal.tsx
//
// Lets coordinator / administrative coordinator / system_admin shift one due
// date across many projects' milestones at once — for faculty-wide delays
// (holidays, illness, war, etc.) instead of adjusting one milestone at a
// time. Calls PUT /api/milestones/bulk-due-date (see bulkUpdateMilestoneDueDates
// in server/src/controllers/milestoneController.ts).

import React, { useState } from 'react';
import {
  Modal, View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import type { Lang } from '../i18n';
import { BulkDueDateModalStyles } from '../../constants/styles';

const MILESTONE_TYPE_OPTIONS: Array<{ value: string; he: string; en: string }> = [
  { value: '',                 he: 'כל אבני הדרך',    en: 'All milestone types' },
  { value: 'research_proposal', he: 'הצעת מחקר',       en: 'Research Proposal' },
  { value: 'progress_report',   he: 'דו"ח התקדמות',    en: 'Progress Report' },
  { value: 'final_report',      he: 'דו"ח מסכם',       en: 'Final Report' },
  { value: 'defense',           he: 'הגנה',            en: 'Defense' },
];

export interface BulkDueDateProjectOption {
  id: string;
  label: string;
  /** e.g. the enrolled student name(s) — shown under the label and matched
   *  against the search box, so a specific student can be found among many
   *  projects instead of scrolling the whole list. */
  sublabel?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  lang: Lang;
  projects: BulkDueDateProjectOption[];
  onSaved?: () => void;
}

export default function BulkDueDateModal({ visible, onClose, lang, projects, onSaved }: Props) {
  const isRtl = lang === 'he';
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [milestoneType, setMilestoneType] = useState('');
  const [dueDateText, setDueDateText] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSelectedIds([]);
    setSearch('');
    setMilestoneType('');
    setDueDateText('');
    setReason('');
  };

  const handleClose = () => { reset(); onClose(); };

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const q = search.trim().toLowerCase();
  const filteredProjects = q
    ? projects.filter((p) => p.label.toLowerCase().includes(q) || p.sublabel?.toLowerCase().includes(q))
    : projects;

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור לפחות פרויקט אחד' : 'Select at least one project',
      );
      return;
    }
    const parsed = new Date(dueDateText.trim());
    if (!dueDateText.trim() || isNaN(parsed.getTime())) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש להזין תאריך יעד תקין' : 'Enter a valid due date',
      );
      return;
    }
    if (!reason.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לציין סיבה לשינוי' : 'A reason for the change is required',
      );
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.put('/api/milestones/bulk-due-date', {
        projectIds: selectedIds,
        milestoneType: milestoneType || undefined,
        dueDate: parsed.toISOString(),
        reason: reason.trim(),
      });
      if (res.data.pendingApproval) {
        // coordinator/administrative coordinator — needs program_head/faculty_admin
        // sign-off before it actually takes effect (P1 #12).
        Alert.alert(
          '⏳',
          lang === 'he'
            ? 'הבקשה נשלחה לאישור ראש התוכנית/הפקולטה ותיושם רק לאחר אישור.'
            : 'This request was sent for program-head/faculty-admin approval and will only take effect once approved.',
        );
      } else {
        Alert.alert(
          '✅',
          lang === 'he'
            ? `${res.data.updatedCount ?? ''} אבני דרך עודכנו בהצלחה`
            : `${res.data.updatedCount ?? ''} milestone(s) updated successfully`,
        );
      }
      onSaved?.();
      handleClose();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || (lang === 'he' ? 'העדכון נכשל' : 'Update failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        <Text style={[s.title, isRtl && s.textRight]}>
          📅 {lang === 'he' ? 'עדכון תאריכי יעד מרוכז' : 'Bulk Due-Date Update'}
        </Text>
        <Text style={[s.subtitle, isRtl && s.textRight]}>
          {lang === 'he'
            ? 'לשימוש בעיכובים כלליים (חגים, מלחמה, כוח עליון וכו׳) — ניתן לעדכן אבני דרך שאינן במצב "ממתין" בלבד.'
            : 'For general delays (holidays, war, force majeure, etc.) — can update milestones regardless of their current status.'}
        </Text>

        <Text style={[s.fieldLabel, isRtl && s.textRight]}>
          {lang === 'he' ? 'בחר פרויקטים' : 'Select projects'}
          {selectedIds.length > 0 ? `  (${selectedIds.length} ${lang === 'he' ? 'נבחרו' : 'selected'})` : ''}
        </Text>
        <TextInput
          style={[s.input, isRtl && s.textRight]}
          value={search}
          onChangeText={setSearch}
          placeholder={lang === 'he' ? 'חיפוש לפי שם סטודנט/פרויקט...' : 'Search by student or project name...'}
          placeholderTextColor="#9CA3AF"
        />
        <View style={s.projectList}>
          {filteredProjects.length === 0 ? (
            <Text style={s.emptyText}>
              {projects.length === 0
                ? (lang === 'he' ? 'אין פרויקטים להצגה' : 'No projects available')
                : (lang === 'he' ? 'לא נמצאו תוצאות' : 'No matches found')}
            </Text>
          ) : (
            filteredProjects.map((p) => {
              const isActive = selectedIds.includes(p.id);
              return (
                <Pressable
                  key={p.id}
                  style={[s.projectRow, isActive && s.projectRowActive]}
                  onPress={() => toggleProject(p.id)}
                >
                  <View style={[s.checkbox, isActive && s.checkboxActive]}>
                    {isActive && <Text style={s.checkmark}>✓</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.projectRowText, isActive && s.projectRowTextActive]} numberOfLines={1}>
                      {p.label}
                    </Text>
                    {!!p.sublabel && (
                      <Text style={s.projectRowSublabel} numberOfLines={1}>{p.sublabel}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
        {filteredProjects.length > 0 && (
          <Pressable onPress={() => setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredProjects.map((p) => p.id)])))}>
            <Text style={s.selectAll}>
              {search.trim()
                ? (lang === 'he' ? 'בחר את כל התוצאות' : 'Select all matches')
                : (lang === 'he' ? 'בחר את כל הפרויקטים' : 'Select all projects')}
            </Text>
          </Pressable>
        )}

        <Text style={[s.fieldLabel, isRtl && s.textRight]}>
          {lang === 'he' ? 'סוג אבן דרך' : 'Milestone type'}
        </Text>
        <View style={s.chipRow}>
          {MILESTONE_TYPE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[s.chip, milestoneType === opt.value && s.chipActive]}
              onPress={() => setMilestoneType(opt.value)}
            >
              <Text style={[s.chipText, milestoneType === opt.value && s.chipTextActive]}>
                {lang === 'he' ? opt.he : opt.en}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[s.fieldLabel, isRtl && s.textRight]}>
          {lang === 'he' ? 'תאריך יעד חדש' : 'New due date'}
        </Text>
        <TextInput
          style={[s.input, isRtl && s.textRight]}
          value={dueDateText}
          onChangeText={setDueDateText}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={[s.fieldLabel, isRtl && s.textRight]}>
          {lang === 'he' ? 'סיבה (נדרש)' : 'Reason (required)'}
        </Text>
        <TextInput
          style={[s.input, s.inputMultiline, isRtl && s.textRight]}
          value={reason}
          onChangeText={setReason}
          multiline
          placeholder={lang === 'he' ? 'לדוגמה: עיכוב עקב מצב מלחמה' : 'e.g. Delay due to wartime disruption'}
          placeholderTextColor="#9CA3AF"
        />

        <Pressable style={[s.submitBtn, saving && s.submitBtnDisabled]} onPress={handleSubmit} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitBtnText}>{lang === 'he' ? 'עדכן תאריכים' : 'Update Due Dates'}</Text>
          }
        </Pressable>

        <Pressable style={s.cancelBtn} onPress={handleClose}>
          <Text style={s.cancelBtnText}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const s = BulkDueDateModalStyles;

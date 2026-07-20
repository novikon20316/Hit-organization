// components/modals/PermissionsEditorModal.tsx
//
// system_admin's per-user granular permission editor, opened from
// EditUserModal. Rules live in local state on the parent (admin/panel.tsx)
// until Save, which persists them via role-update's permissionRules field —
// enforced server-side by server/src/services/scopeAuthorization.ts.
//
// Elastic scope-rule model (see constants/permissions.ts): an account can
// hold any number of ScopeRules, each narrowing Faculty → optional Major →
// optional Degree Level → optional Process Type (master's only), with its
// own View/Action permission grants — rather than one fixed grid shape.
// The scope-narrowing fields themselves are shared with CoordinatorScopesModal
// via ScopeDescriptorFields.

import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable } from 'react-native';
import { FACULTY_COLORS } from '../shared';
import ScopeDescriptorFields from './ScopeDescriptorFields';
import {
  VIEW_TYPES, ACTION_TYPES, scopeLabel, newScopeId,
  type ScopeRule, type ScopeDescriptor,
} from '../../constants/permissions';
import { PermissionsEditorModalStyles } from '../../constants/styles';

type Props = {
  visible:  boolean;
  onClose:  () => void;
  lang:     'he' | 'en';
  rules:    ScopeRule[];
  onChange: (next: ScopeRule[]) => void;
};

function emptyDraft(): ScopeRule {
  return { id: newScopeId(), facultyId: 'sciences', view: [], actions: [] };
}

export default function PermissionsEditorModal({ visible, onClose, lang, rules, onChange }: Props) {
  // null = list screen; a draft = the add/edit form screen.
  const [draft, setDraft] = useState<ScopeRule | null>(null);

  const facultyLabel = (facultyId: string) => (FACULTY_COLORS[facultyId] ?? FACULTY_COLORS.default).label[lang];

  const openNewRule = () => setDraft(emptyDraft());
  const openEditRule = (rule: ScopeRule) => setDraft({ ...rule, view: [...rule.view], actions: [...rule.actions] });
  const cancelForm = () => setDraft(null);

  const saveRule = () => {
    if (!draft) return;
    const exists = rules.some((r) => r.id === draft.id);
    onChange(exists ? rules.map((r) => (r.id === draft.id ? draft : r)) : [...rules, draft]);
    setDraft(null);
  };

  const deleteRule = (id: string) => onChange(rules.filter((r) => r.id !== id));

  const patchDraft = (patch: Partial<ScopeDescriptor>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const toggleType = <T extends string>(list: T[], key: T): T[] =>
    list.includes(key) ? list.filter((k) => k !== key) : [...list, key];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={draft ? cancelForm : onClose}>
      <View style={s.root}>
        {!draft ? (
          <>
            {/* ── List screen ── */}
            <View style={s.header}>
              <Text style={s.headerTitle}>
                {lang === 'he' ? '🔐 הרשאות מפורטות' : '🔐 Granular Permissions'}
              </Text>
              <Pressable onPress={onClose}><Text style={s.close}>✕</Text></Pressable>
            </View>

            <View style={s.countBar}>
              <Text style={s.countText}>
                {lang === 'he' ? `${rules.length} כללי הרשאה` : `${rules.length} scope rules`}
              </Text>
              <Text style={s.countHint}>
                {lang === 'he' ? 'כל כלל מגדיר פקולטה/מגמה/תואר/מסלול משלו' : 'each rule scopes its own faculty/major/degree/track'}
              </Text>
            </View>

            <ScrollView contentContainerStyle={s.scroll}>
              {rules.length === 0 && (
                <Text style={{ textAlign: 'center', color: '#9BA8C0', marginTop: 24, fontSize: 13 }}>
                  {lang === 'he' ? 'אין עדיין כללי הרשאה — הוסף אחד למטה' : 'No scope rules yet — add one below'}
                </Text>
              )}

              {rules.map((rule) => (
                <View key={rule.id} style={s.facultySection}>
                  <View style={s.facultyHeader}>
                    <View style={[s.facultyDot, { backgroundColor: (FACULTY_COLORS[rule.facultyId] ?? FACULTY_COLORS.default).primary }]} />
                    <Text style={s.facultyName} numberOfLines={1}>{scopeLabel(rule, lang, facultyLabel)}</Text>
                  </View>
                  <View style={s.degreeBlock}>
                    <Text style={{ fontSize: 12, color: '#8899BB', marginBottom: 8 }}>
                      {lang === 'he'
                        ? `👁️ ${rule.view.length} צפייה  ·  ⚡ ${rule.actions.length} פעולות`
                        : `👁️ ${rule.view.length} view  ·  ⚡ ${rule.actions.length} action`}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable onPress={() => openEditRule(rule)}>
                        <Text style={s.selectAllText}>{lang === 'he' ? 'ערוך' : 'Edit'}</Text>
                      </Pressable>
                      <Pressable onPress={() => deleteRule(rule.id)}>
                        <Text style={[s.selectAllText, { color: '#EF4444' }]}>{lang === 'he' ? 'מחק' : 'Delete'}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}

              <Pressable style={[s.groupTab, { backgroundColor: '#EFF6FF', marginTop: 8 }]} onPress={openNewRule}>
                <Text style={[s.groupTabText, { color: '#2E86FF' }]}>
                  ＋ {lang === 'he' ? 'הוסף כלל הרשאה' : 'Add Scope Rule'}
                </Text>
              </Pressable>
            </ScrollView>

            <View style={s.footer}>
              <Pressable style={s.doneBtn} onPress={onClose}>
                <Text style={s.doneBtnText}>{lang === 'he' ? 'סגור' : 'Done'}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {/* ── Add/edit rule form ── */}
            <View style={s.header}>
              <Text style={s.headerTitle}>
                {lang === 'he' ? 'כלל הרשאה' : 'Scope Rule'}
              </Text>
              <Pressable onPress={cancelForm}><Text style={s.close}>✕</Text></Pressable>
            </View>

            <ScrollView contentContainerStyle={s.scroll}>
              <ScopeDescriptorFields lang={lang} scope={draft} onChange={patchDraft} />

              {/* View permissions */}
              <Text style={[s.degreeLabel, { marginTop: 16 }]}>{lang === 'he' ? '👁️ צפייה' : '👁️ View'}</Text>
              {VIEW_TYPES.map((t) => {
                const isActive = draft.view.includes(t.key);
                return (
                  <Pressable key={t.key} style={s.permRow} onPress={() => setDraft({ ...draft, view: toggleType(draft.view, t.key) })}>
                    <View style={[s.checkbox, isActive && s.checkboxActive]}>
                      {isActive && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <Text style={s.permLabel}>{t.label[lang]}</Text>
                  </Pressable>
                );
              })}

              {/* Action permissions */}
              <Text style={[s.degreeLabel, { marginTop: 16 }]}>{lang === 'he' ? '⚡ פעולות' : '⚡ Actions'}</Text>
              {ACTION_TYPES.map((t) => {
                const isActive = draft.actions.includes(t.key);
                return (
                  <Pressable key={t.key} style={s.permRow} onPress={() => setDraft({ ...draft, actions: toggleType(draft.actions, t.key) })}>
                    <View style={[s.checkbox, isActive && s.checkboxActive]}>
                      {isActive && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <Text style={s.permLabel}>{t.label[lang]}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={s.footer}>
              <Pressable style={s.doneBtn} onPress={saveRule}>
                <Text style={s.doneBtnText}>{lang === 'he' ? 'שמור כלל' : 'Save Rule'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const s = PermissionsEditorModalStyles;

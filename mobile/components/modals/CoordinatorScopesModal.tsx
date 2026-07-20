// components/modals/CoordinatorScopesModal.tsx
//
// system_admin's editor for a coordinator's own operational scope — which
// population of students/projects they oversee. Opened from EditUserModal
// when the user being edited holds the coordinator role. Scopes live in
// local state on the parent (admin/panel.tsx) until Save, which persists
// them via role-update's coordinatorScopes field — enforced server-side by
// services/scopeAuthorization.ts's withinCoordinatorScope, which every
// coordinator write endpoint now checks (falling back to the coordinator's
// plain facultyId when no scopes are configured).
//
// An account can hold multiple scopes at once (e.g. "CS bachelor's" AND
// "Design master's" from one login) — real institutions split the
// coordinator role in ways a single facultyId can't express: by degree
// level within a major, by whole major, or even by thesis-vs-project track
// within a major's master's program. Each scope reuses the same
// Faculty → Major → Degree Level → Process Type narrowing as
// PermissionsEditorModal's rules (via ScopeDescriptorFields), just without
// separate view/action grants — a coordinator already has full standard
// actions within whatever scope they're assigned.

import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, Pressable } from 'react-native';
import { FACULTY_COLORS } from '../shared';
import ScopeDescriptorFields from './ScopeDescriptorFields';
import {
  scopeLabel, newScopeId,
  type CoordinatorScope, type ScopeDescriptor,
} from '../../constants/permissions';
import { PermissionsEditorModalStyles } from '../../constants/styles';

type Props = {
  visible:  boolean;
  onClose:  () => void;
  lang:     'he' | 'en';
  scopes:   CoordinatorScope[];
  onChange: (next: CoordinatorScope[]) => void;
};

function emptyDraft(): CoordinatorScope {
  return { id: newScopeId(), facultyId: 'sciences' };
}

export default function CoordinatorScopesModal({ visible, onClose, lang, scopes, onChange }: Props) {
  // null = list screen; a draft = the add/edit form screen.
  const [draft, setDraft] = useState<CoordinatorScope | null>(null);

  const facultyLabel = (facultyId: string) => (FACULTY_COLORS[facultyId] ?? FACULTY_COLORS.default).label[lang];

  const openNewScope = () => setDraft(emptyDraft());
  const openEditScope = (scope: CoordinatorScope) => setDraft({ ...scope });
  const cancelForm = () => setDraft(null);

  const saveScope = () => {
    if (!draft) return;
    const exists = scopes.some((sc) => sc.id === draft.id);
    onChange(exists ? scopes.map((sc) => (sc.id === draft.id ? draft : sc)) : [...scopes, draft]);
    setDraft(null);
  };

  const deleteScope = (id: string) => onChange(scopes.filter((sc) => sc.id !== id));

  const patchDraft = (patch: Partial<ScopeDescriptor>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={draft ? cancelForm : onClose}>
      <View style={s.root}>
        {!draft ? (
          <>
            {/* ── List screen ── */}
            <View style={s.header}>
              <Text style={s.headerTitle}>
                {lang === 'he' ? '📋 היקף אחריות רכז' : '📋 Coordinator Scope'}
              </Text>
              <Pressable onPress={onClose}><Text style={s.close}>✕</Text></Pressable>
            </View>

            <View style={s.countBar}>
              <Text style={s.countText}>
                {lang === 'he' ? `${scopes.length} תחומי אחריות` : `${scopes.length} scopes`}
              </Text>
              <Text style={s.countHint}>
                {lang === 'he' ? 'ניתן להוסיף כמה שצריך' : 'add as many as needed'}
              </Text>
            </View>

            <ScrollView contentContainerStyle={s.scroll}>
              {scopes.length === 0 && (
                <Text style={{ textAlign: 'center', color: '#9BA8C0', marginTop: 24, fontSize: 13 }}>
                  {lang === 'he'
                    ? 'אין עדיין תחומי אחריות — הוסף אחד למטה (בלעדיו, הרכז מוגבל לפקולטה השלמה שנבחרה למעלה)'
                    : "No scopes yet — add one below (without it, the coordinator falls back to the whole faculty selected above)"}
                </Text>
              )}

              {scopes.map((scope) => (
                <View key={scope.id} style={s.facultySection}>
                  <View style={s.facultyHeader}>
                    <View style={[s.facultyDot, { backgroundColor: (FACULTY_COLORS[scope.facultyId] ?? FACULTY_COLORS.default).primary }]} />
                    <Text style={s.facultyName} numberOfLines={1}>{scopeLabel(scope, lang, facultyLabel)}</Text>
                  </View>
                  <View style={s.degreeBlock}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable onPress={() => openEditScope(scope)}>
                        <Text style={s.selectAllText}>{lang === 'he' ? 'ערוך' : 'Edit'}</Text>
                      </Pressable>
                      <Pressable onPress={() => deleteScope(scope.id)}>
                        <Text style={[s.selectAllText, { color: '#EF4444' }]}>{lang === 'he' ? 'מחק' : 'Delete'}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}

              <Pressable style={[s.groupTab, { backgroundColor: '#EFF6FF', marginTop: 8 }]} onPress={openNewScope}>
                <Text style={[s.groupTabText, { color: '#2E86FF' }]}>
                  ＋ {lang === 'he' ? 'הוסף תחום אחריות' : 'Add Scope'}
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
            {/* ── Add/edit scope form ── */}
            <View style={s.header}>
              <Text style={s.headerTitle}>
                {lang === 'he' ? 'תחום אחריות' : 'Scope'}
              </Text>
              <Pressable onPress={cancelForm}><Text style={s.close}>✕</Text></Pressable>
            </View>

            <ScrollView contentContainerStyle={s.scroll}>
              <ScopeDescriptorFields lang={lang} scope={draft} onChange={patchDraft} />
            </ScrollView>

            <View style={s.footer}>
              <Pressable style={s.doneBtn} onPress={saveScope}>
                <Text style={s.doneBtnText}>{lang === 'he' ? 'שמור תחום' : 'Save Scope'}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const s = PermissionsEditorModalStyles;

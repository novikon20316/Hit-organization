import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { tx } from '../../components/i18n';
import { ROLE_LABELS } from '../../constants'; // adjust path if needed
import { FACULTY_COLORS } from '../../components/shared'; // adjust path if needed
import { AppUser, MyProject, Application } from '@/types'

type Lang = 'he' | 'en';

interface Examiner {
  type: 'internal' | 'external';
  internalUserId?: string;
  name: string;
  email: string;
  institution: string;
  expertise: string;
  priority: 1 | 2 | 3;
  notes: string;
}

interface Props {
  recommendModal: boolean;
  lang: Lang;
  isRtl: boolean;

  // state
  extName: string;
  extEmail: string;
  extInstitution: string;
  extExpertise: string;
  myProjects: MyProject[];
  selectedProjectForRec: MyProject | null;
  recExaminers: [] | Examiner[];
  internalUsers: AppUser[];
  recSubmitting: boolean;

  // setters
  setRecommendModal: (v: boolean) => void;
  setExtName: (v: string) => void;
  setExtEmail: (v: string) => void;
  setExtInstitution: (v: string) => void;
  setExtExpertise: (v: string) => void;
  setRecExaminers: React.Dispatch<React.SetStateAction<Examiner[]>>;
  setSelectedProjectForRec: (v: MyProject | null) => void;

  // actions
  handleSubmitRecommendation: () => void;

  styles: any;
}

export default function RecommendedExaminerModal({
  recommendModal,
  lang,
  isRtl,
  setRecommendModal,

  myProjects,
  selectedProjectForRec,
  recExaminers,
  internalUsers,
  extName,
  extEmail,
  extInstitution,
  extExpertise,
  recSubmitting,

  setRecExaminers,
  setSelectedProjectForRec,
  setExtName,
  setExtEmail,
  setExtInstitution,
  setExtExpertise,

  handleSubmitRecommendation,
  styles,
}: Props) {
  return (
    <Modal visible={recommendModal} animationType="slide" presentationStyle="pageSheet">
  <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent}>
    <View style={[styles.modalHeader, isRtl && styles.rowReverse]}>
      <Text style={styles.modalTitle}>{tx('examinerRecommendTitle', lang)}</Text>
      <Pressable onPress={() => { setRecommendModal(false); setRecExaminers([]); setSelectedProjectForRec(null); }}>
        <Text style={styles.modalClose}>✕</Text>
      </Pressable>
    </View>

    <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginBottom: 4 }]}>
      {lang === 'he' ? 'בחר פרויקט' : 'Select Project'}
    </Text>
    {myProjects.map((p) => (
      <Pressable
        key={p.id}
        style={[styles.examinerOption,
          selectedProjectForRec?.id === p.id && styles.examinerOptionActive,
          { marginBottom: 6 }
        ]}
        onPress={() => setSelectedProjectForRec(p)}
      >
        <Text style={[
          styles.examinerOptionText,
          selectedProjectForRec?.id === p.id && { color: '#fff' },
          isRtl && styles.textRight,
        ]}>
          {lang === 'he' ? p.titleHe : p.titleEn}
        </Text>
      </Pressable>
    ))}

    {/* Added examiners list */}
    {recExaminers.length > 0 && (
      <View style={{ marginTop: 16, marginBottom: 8 }}>
        <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
          {lang === 'he' ? 'בוחנים שנוספו:' : 'Added Examiners:'}
        </Text>
        {recExaminers.map((ex, i) => (
          <View key={i} style={{
            flexDirection: isRtl ? 'row-reverse' : 'row',
            alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: '#F8FAFF', borderRadius: 10, padding: 12,
            borderWidth: 1, borderColor: '#E0E8FF', marginBottom: 6,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111', textAlign: isRtl ? 'right' : 'left' }}>
                {ex.name}
              </Text>
              <Text style={{ fontSize: 11, color: '#8899BB', textAlign: isRtl ? 'right' : 'left' }}>
                {ex.type === 'internal'
                  ? tx('examinerInternal', lang)
                  : `${tx('examinerExternal', lang)} · ${ex.institution}`}
                {' · '}{tx('examinerPriority', lang)} {ex.priority}
              </Text>
            </View>
            <Pressable
              onPress={() => setRecExaminers(prev => prev.filter((_, idx) => idx !== i))}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: '#EF4444', fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
        ))}
      </View>
    )}

    {/* Add internal examiner */}
    <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 12 }]}>
      {tx('examinerSearchInternal', lang)}
    </Text>
    {internalUsers.map((u: any) => {
      const alreadyAdded = recExaminers.some(e => e.internalUserId === u.id);
      return (
        <Pressable
          key={u.id}
          style={[styles.examinerOption, alreadyAdded && styles.examinerOptionActive, { marginBottom: 6 }]}
          onPress={() => {
            if (alreadyAdded) return;
            const priority = (recExaminers.length + 1) as 1 | 2 | 3;
            setRecExaminers(prev => [...prev, {
              type: 'internal',
              internalUserId: u.id,
              name: u.displayName,
              email: u.email ?? '',
              institution: 'HIT',
              expertise: '',
              priority: Math.min(priority, 3) as 1 | 2 | 3,
              notes: '',
            }]);
          }}
        >
          <Text style={[styles.examinerOptionText, alreadyAdded && { color: '#fff' }, isRtl && styles.textRight]}>
            {alreadyAdded ? '✓ ' : ''}{u.displayName} · {u.email}
          </Text>
        </Pressable>
      );
    })}

    {/* Add external examiner */}
    <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 16 }]}>
      {tx('examinerAddExternal', lang)}
    </Text>
    {[
        { label: tx('examinerExternalName', lang),        value: extName,        set: setExtName,        kb: 'default' as const        },
        { label: tx('examinerExternalEmail', lang),       value: extEmail,       set: setExtEmail,       kb: 'email-address' as const  },
        { label: tx('examinerExternalInstitution', lang), value: extInstitution, set: setExtInstitution, kb: 'default' as const        },
        { label: tx('examinerExternalExpertise', lang),   value: extExpertise,   set: setExtExpertise,   kb: 'default' as const        },
        ].map((field) => (
        <View key={field.label} style={{ marginBottom: 8 }}>
          <Text style={[{ fontSize: 12, color: '#8899BB', marginBottom: 4 }, isRtl && styles.textRight]}>
            {field.label}
          </Text>
          <TextInput
            style={[styles.input, isRtl && styles.textRight]}
            value={field.value}
            onChangeText={field.set}
            keyboardType={field.kb}
            // store in a ref so all fields compose into one examiner on "Add"
            // For simplicity we use a flat approach below
          />
        </View>
    ))}
    <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 16 }]}>
      {tx('examinerAddExternal', lang)}
    </Text>
    {[
      { label: tx('examinerExternalName', lang),        value: extName,        set: setExtName,        kb: 'default' as const        },
      { label: tx('examinerExternalEmail', lang),       value: extEmail,       set: setExtEmail,       kb: 'email-address' as const  },
      { label: tx('examinerExternalInstitution', lang), value: extInstitution, set: setExtInstitution, kb: 'default' as const        },
      { label: tx('examinerExternalExpertise', lang),   value: extExpertise,   set: setExtExpertise,   kb: 'default' as const        },
    ].map((f) => (
      <View key={f.label} style={{ marginBottom: 8 }}>
        <Text style={[{ fontSize: 12, color: '#8899BB', marginBottom: 4 }, isRtl && styles.textRight]}>{f.label}</Text>
        <TextInput
          style={[styles.input, isRtl && styles.textRight]}
          value={f.value}
          onChangeText={f.set}
          keyboardType={f.kb}
          placeholderTextColor="#9BA8C0"
        />
      </View>
    ))}
    <Pressable
      style={[styles.meetingBtn, { marginBottom: 12 }]}
      onPress={() => {
        if (!extName.trim() || !extEmail.trim()) {
          Alert.alert(lang === 'he' ? 'שגיאה' : 'Error',
            lang === 'he' ? 'שם ואימייל הם שדות חובה' : 'Name and email are required');
          return;
        }
        const priority = (recExaminers.length + 1) as 1 | 2 | 3;
        setRecExaminers(prev => [...prev, {
          type: 'external',
          name: extName.trim(),
          email: extEmail.trim(),
          institution: extInstitution.trim(),
          expertise: extExpertise.trim(),
          priority: Math.min(priority, 3) as 1 | 2 | 3,
          notes: '',
        }]);
        setExtName(''); setExtEmail(''); setExtInstitution(''); setExtExpertise('');
      }}
    >
      <Text style={styles.meetingBtnText}>+ {tx('examinerAddExternal', lang)}</Text>
    </Pressable>

    {/* Also add the 4 new state vars near the top of the component */}

    <Pressable
      style={[styles.submitBtn, recSubmitting && { opacity: 0.6 }]}
      onPress={handleSubmitRecommendation}
      disabled={recSubmitting}
    >
      {recSubmitting
        ? <ActivityIndicator color="#fff" />
        : <Text style={styles.submitBtnText}>{tx('examinerRecommendSubmit', lang)}</Text>
      }
    </Pressable>
  </ScrollView>
</Modal>
  );
}
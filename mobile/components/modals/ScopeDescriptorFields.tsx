// components/modals/ScopeDescriptorFields.tsx
//
// The Faculty → optional Major → optional Degree Level → optional Process
// Type picker shared by PermissionsEditorModal (system_admin's granular
// permission rules) and CoordinatorScopesModal (a coordinator's own
// operational scope) — same narrowing logic, just used for different
// purposes downstream. See constants/permissions.ts's ScopeDescriptor.

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { FACULTY_COLORS } from '../shared';
import {
  PERMISSION_FACULTY_IDS, DEGREE_LEVELS, PROCESS_TYPES, majorsForFaculty, degreeLevelsForFaculty,
  type ScopeDescriptor, type PermissionFacultyId,
} from '../../constants/permissions';
import { PermissionsEditorModalStyles } from '../../constants/styles';

type Props = {
  lang:     'he' | 'en';
  scope:    ScopeDescriptor;
  onChange: (patch: Partial<ScopeDescriptor>) => void;
};

export default function ScopeDescriptorFields({ lang, scope, onChange }: Props) {
  const majors = scope.facultyId !== 'all' ? majorsForFaculty(scope.facultyId) : [];
  const availableDegreeLevels = degreeLevelsForFaculty(scope.facultyId);
  const degreeLevelOptions = DEGREE_LEVELS.filter((d) => availableDegreeLevels.includes(d.key));

  return (
    <>
      {/* Faculty */}
      <Text style={s.degreeLabel}>{lang === 'he' ? 'פקולטה' : 'Faculty'}</Text>
      {PERMISSION_FACULTY_IDS.map((fid) => {
        const fc = FACULTY_COLORS[fid] ?? FACULTY_COLORS.default;
        const isActive = scope.facultyId === fid;
        return (
          <Pressable
            key={fid}
            style={s.permRow}
            onPress={() => {
              const validLevels = degreeLevelsForFaculty(fid);
              const degreeLevel = scope.degreeLevel && validLevels.includes(scope.degreeLevel) ? scope.degreeLevel : undefined;
              onChange({
                facultyId: fid as PermissionFacultyId,
                major: undefined,
                degreeLevel,
                processType: degreeLevel === 'masters' ? scope.processType : undefined,
              });
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <View style={[s.checkbox, isActive && s.checkboxActive]}>
              {isActive && <Text style={s.checkmark}>✓</Text>}
            </View>
            <View style={[s.facultyDot, { backgroundColor: fc.primary }]} />
            <Text style={s.permLabel}>{fc.label[lang]}</Text>
          </Pressable>
        );
      })}

      {/* Major (only when a specific faculty, not 'all') */}
      {scope.facultyId !== 'all' && (
        <>
          <Text style={[s.degreeLabel, { marginTop: 16 }]}>{lang === 'he' ? 'מגמה (אופציונלי)' : 'Major (optional)'}</Text>
          <Pressable
            style={s.permRow}
            onPress={() => onChange({ major: undefined })}
            accessibilityRole="radio"
            accessibilityState={{ checked: !scope.major }}
          >
            <View style={[s.checkbox, !scope.major && s.checkboxActive]}>
              {!scope.major && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.permLabel}>{lang === 'he' ? 'כל המגמות בפקולטה' : 'All majors in this faculty'}</Text>
          </Pressable>
          {majors.map((m) => {
            const isActive = scope.major === m.slug;
            return (
              <Pressable
                key={m.slug}
                style={s.permRow}
                onPress={() => onChange({ major: m.slug })}
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive }}
              >
                <View style={[s.checkbox, isActive && s.checkboxActive]}>
                  {isActive && <Text style={s.checkmark}>✓</Text>}
                </View>
                <Text style={s.permLabel}>{m.label[lang]}</Text>
              </Pressable>
            );
          })}
        </>
      )}

      {/* Degree level */}
      <Text style={[s.degreeLabel, { marginTop: 16 }]}>{lang === 'he' ? 'תואר (אופציונלי)' : 'Degree Level (optional)'}</Text>
      <Pressable
        style={s.permRow}
        onPress={() => onChange({ degreeLevel: undefined, processType: undefined })}
        accessibilityRole="radio"
        accessibilityState={{ checked: !scope.degreeLevel }}
      >
        <View style={[s.checkbox, !scope.degreeLevel && s.checkboxActive]}>
          {!scope.degreeLevel && <Text style={s.checkmark}>✓</Text>}
        </View>
        <Text style={s.permLabel}>{lang === 'he' ? 'שני התארים' : 'Both degree levels'}</Text>
      </Pressable>
      {degreeLevelOptions.map((d) => {
        const isActive = scope.degreeLevel === d.key;
        return (
          <Pressable
            key={d.key}
            style={s.permRow}
            onPress={() => onChange({
              degreeLevel: d.key,
              processType: d.key === 'masters' ? scope.processType : undefined,
            })}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <View style={[s.checkbox, isActive && s.checkboxActive]}>
              {isActive && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.permLabel}>{d.label[lang]}</Text>
          </Pressable>
        );
      })}

      {/* Process type — master's only */}
      {scope.degreeLevel === 'masters' && (
        <>
          <Text style={[s.degreeLabel, { marginTop: 16 }]}>{lang === 'he' ? 'מסלול (אופציונלי)' : 'Process Type (optional)'}</Text>
          <Pressable
            style={s.permRow}
            onPress={() => onChange({ processType: undefined })}
            accessibilityRole="radio"
            accessibilityState={{ checked: !scope.processType }}
          >
            <View style={[s.checkbox, !scope.processType && s.checkboxActive]}>
              {!scope.processType && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.permLabel}>{lang === 'he' ? 'שני המסלולים' : 'Both tracks'}</Text>
          </Pressable>
          {PROCESS_TYPES.map((p) => {
            const isActive = scope.processType === p.key;
            return (
              <Pressable
                key={p.key}
                style={s.permRow}
                onPress={() => onChange({ processType: p.key })}
                accessibilityRole="radio"
                accessibilityState={{ checked: isActive }}
              >
                <View style={[s.checkbox, isActive && s.checkboxActive]}>
                  {isActive && <Text style={s.checkmark}>✓</Text>}
                </View>
                <Text style={s.permLabel}>{p.label[lang]}</Text>
              </Pressable>
            );
          })}
        </>
      )}
    </>
  );
}

const s = PermissionsEditorModalStyles;

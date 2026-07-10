// components/DefenseBuildingPicker.tsx
// Shared building selector for defense logistics — buildings 1-8 are usable,
// building 9 is under construction and shown disabled. Keep in sync with
// DEFENSE_ALLOWED_BUILDINGS in server/src/controllers/coordinatorController.ts.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Lang } from './i18n';

export const DEFENSE_BUILDINGS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const AVAILABLE_DEFENSE_BUILDINGS = ['1', '2', '3', '4', '5', '6', '7', '8'];

interface Props {
  value: string;
  onChange: (building: string) => void;
  lang: Lang;
}

export default function DefenseBuildingPicker({ value, onChange, lang }: Props) {
  return (
    <View style={s.row}>
      {DEFENSE_BUILDINGS.map((b) => {
        const disabled = !AVAILABLE_DEFENSE_BUILDINGS.includes(b);
        const selected = value === b;
        return (
          <Pressable
            key={b}
            disabled={disabled}
            style={[s.chip, selected && s.chipSelected, disabled && s.chipDisabled]}
            onPress={() => onChange(b)}
          >
            <Text style={[s.chipText, selected && s.chipTextSelected, disabled && s.chipTextDisabled]}>
              {b}
            </Text>
            {disabled && (
              <Text style={s.chipSubText}>
                {lang === 'he' ? 'בבנייה' : 'Under construction'}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row:              { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip:             { minWidth: 44, alignItems: 'center', borderWidth: 1.5, borderColor: '#CBD5E1',
                       borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#fff' },
  chipSelected:     { backgroundColor: '#2E86FF', borderColor: '#2E86FF' },
  chipDisabled:     { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  chipText:         { fontSize: 15, fontWeight: '700', color: '#374151' },
  chipTextSelected: { color: '#fff' },
  chipTextDisabled: { color: '#94A3B8' },
  chipSubText:      { fontSize: 8, color: '#94A3B8', marginTop: 2 },
});

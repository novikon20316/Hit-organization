// components/DefenseBuildingPicker.tsx
// Shared building selector for defense logistics — buildings 1-8 are usable,
// building 9 is under construction and shown disabled. Keep in sync with
// DEFENSE_ALLOWED_BUILDINGS in server/src/controllers/coordinatorController.ts.

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Lang } from './i18n';
import { DefenseBuildingPickerStyles } from '../constants/styles';

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
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
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

const s = DefenseBuildingPickerStyles;

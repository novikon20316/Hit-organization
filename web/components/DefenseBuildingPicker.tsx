'use client';

// components/DefenseBuildingPicker.tsx
// Ported from mobile/components/DefenseBuildingPicker.tsx — keep in sync
// with DEFENSE_ALLOWED_BUILDINGS in server/src/controllers/coordinatorController.ts.

import { useLanguage } from '@/contexts/LanguageContext';

export const DEFENSE_BUILDINGS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const AVAILABLE_DEFENSE_BUILDINGS = ['1', '2', '3', '4', '5', '6', '7', '8'];

interface DefenseBuildingPickerProps {
  value: string;
  onChange: (building: string) => void;
}

export function DefenseBuildingPicker({ value, onChange }: DefenseBuildingPickerProps) {
  const { lang } = useLanguage();

  return (
    <div role="group" aria-label={lang === 'he' ? 'בניין ההגנה' : 'Defense building'} className="flex flex-wrap gap-2">
      {DEFENSE_BUILDINGS.map((b) => {
        const disabled = !AVAILABLE_DEFENSE_BUILDINGS.includes(b);
        const selected = value === b;
        return (
          <button
            key={b}
            type="button"
            disabled={disabled}
            onClick={() => onChange(b)}
            aria-pressed={selected}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              selected ? 'border-primary bg-primary text-primary-ink' : disabled ? 'border-line bg-paper text-muted' : 'border-line bg-surface text-ink hover:border-primary'
            }`}
          >
            {b}
            {disabled && <span className="mt-0.5 block text-[10px] leading-tight">{lang === 'he' ? 'בבנייה' : 'Under construction'}</span>}
          </button>
        );
      })}
    </div>
  );
}

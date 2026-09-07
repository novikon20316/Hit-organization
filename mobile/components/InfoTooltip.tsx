// components/InfoTooltip.tsx
// Small tap-to-reveal (i) info button dropped next to a field's label to
// explain that field's purpose — mobile counterpart of web's
// components/InfoTooltip.tsx. Precise anchored popovers are finicky on RN,
// so this opens a small centered modal instead (same tap-outside-to-dismiss
// pattern OnboardingTourOverlay's own card uses), rather than trying to
// position a floating card next to the button.
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { InfoTooltipStyles as s } from '@/constants/styles';

interface InfoTooltipProps {
  textHe: string;
  textEn: string;
  /** Accessible label for the button itself. */
  accessibilityLabel?: string;
}

export function InfoTooltip({ textHe, textEn, accessibilityLabel }: InfoTooltipProps) {
  const { language } = useActiveRole();
  const [open, setOpen] = useState(false);
  const isHe = language === 'he';

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={s.button}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (isHe ? 'מידע נוסף' : 'More info')}
        hitSlop={8}
      >
        <Text style={s.buttonText}>i</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
            <Text style={s.cardText}>{isHe ? textHe : textEn}</Text>
            <Pressable style={s.closeBtn} onPress={() => setOpen(false)} accessibilityRole="button">
              <Text style={s.closeBtnText}>{isHe ? 'סגור' : 'Close'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

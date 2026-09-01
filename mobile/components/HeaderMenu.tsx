// components/HeaderMenu.tsx
//
// A "☰" trigger that opens a dropdown list of labeled actions — the shared
// mechanism behind TopBar's hamburger menu (see components/shared.tsx) and
// reusable by any screen that needs to declutter a row of header buttons
// into a single corner control without dropping any of their functionality.
// Deliberately a top-anchored dropdown, not FloatingActionMenu's bottom-
// corner cascading pills — a hamburger opening downward from a header reads
// naturally, and several screens already have their own bottom-corner FAB
// (ChatbotFab / "+"), so a second FAB-style widget up top would visually
// collide with those.

import React, { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { HeaderMenuStyles } from '../constants/styles';

export interface HeaderMenuItem {
  key:     string;
  icon:    string;
  label:   string;
  onPress: () => void;
  badge?:  number;
  /** Styles the label red — for destructive/sign-out-type actions. */
  danger?: boolean;
  /** Renders a thin divider above this item, to group related actions. */
  dividerBefore?: boolean;
}

interface Props {
  items: HeaderMenuItem[];
  isRtl: boolean;
  /** Unread-style count shown as a small dot on the trigger itself, before it's even opened. */
  triggerBadge?: number;
}

export default function HeaderMenu({ items, isRtl, triggerBadge }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={s.trigger}
        onPress={() => setOpen(true)}
        accessibilityLabel={isRtl ? 'תפריט' : 'Menu'}
        accessibilityRole="button"
      >
        <Text style={s.triggerIcon}>☰</Text>
        {!!triggerBadge && triggerBadge > 0 && (
          <View style={s.badgeDot}>
            <Text style={s.badgeDotText}>{triggerBadge > 9 ? '9+' : triggerBadge}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <View style={[s.panel, isRtl ? s.panelLeft : s.panelRight]}>
            {items.map((item) => (
              <React.Fragment key={item.key}>
                {item.dividerBefore && <View style={s.rowDivider} />}
                <Pressable
                  style={[s.row, isRtl && s.rowReverse]}
                  onPress={() => { setOpen(false); item.onPress(); }}
                  accessibilityRole="button"
                >
                  <Text style={s.rowIcon}>{item.icon}</Text>
                  <Text
                    style={[s.rowLabel, item.danger && s.rowLabelDanger, isRtl && { textAlign: 'right' }]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {!!item.badge && item.badge > 0 && (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{item.badge > 9 ? '9+' : item.badge}</Text>
                    </View>
                  )}
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = HeaderMenuStyles;

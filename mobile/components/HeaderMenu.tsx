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
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  /** Small uppercase heading rendered above this item (implies dividerBefore
   *  when it isn't the first item) — how `fullScreen` mode groups a long
   *  item list into named sections instead of one flat list. Ignored in the
   *  default dropdown mode, which stays short enough not to need it. */
  sectionTitle?: string;
}

interface Props {
  items: HeaderMenuItem[];
  isRtl: boolean;
  /** Unread-style count shown as a small dot on the trigger itself, before it's even opened. */
  triggerBadge?: number;
  /** Renders as a full-screen, slide-up sheet with section headers and a
   *  close (✕) button instead of the default small top-corner dropdown —
   *  for callers (system_admin's TopBar) whose item list is long enough
   *  that a dropdown would run off the screen. */
  fullScreen?: boolean;
  /** fullScreen only — title shown in the sheet's header bar. */
  title?: string;
}

export default function HeaderMenu({ items, isRtl, triggerBadge, fullScreen, title }: Props) {
  const [open, setOpen] = useState(false);

  const renderItem = (item: HeaderMenuItem, index: number) => (
    <React.Fragment key={item.key}>
      {(item.dividerBefore || (fullScreen && item.sectionTitle && index > 0)) && <View style={s.rowDivider} />}
      {fullScreen && item.sectionTitle && (
        <Text style={[s.sectionTitle, isRtl && { textAlign: 'right' }]}>{item.sectionTitle}</Text>
      )}
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
  );

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

      {fullScreen ? (
        <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setOpen(false)}>
          <SafeAreaView style={s.fullScreenRoot} edges={['top']}>
            <View style={[s.fullScreenHeader, isRtl && s.rowReverse]}>
              <Text style={[s.fullScreenTitle, isRtl && { textAlign: 'right' }]}>{title}</Text>
              <Pressable
                style={s.closeBtn}
                onPress={() => setOpen(false)}
                accessibilityLabel={isRtl ? 'סגור' : 'Close'}
                accessibilityRole="button"
              >
                <Text style={s.closeBtnText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.fullScreenScroll}>
              {items.map((item, i) => renderItem(item, i))}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      ) : (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
            <View style={[s.panel, isRtl ? s.panelLeft : s.panelRight]}>
              {items.map((item, i) => renderItem(item, i))}
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const s = HeaderMenuStyles;

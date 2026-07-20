// components/ResponsiveScreen.tsx
//
// Every screen in this app is built full-bleed for a phone-width viewport.
// On a tablet/foldable, that means form fields and cards stretch edge-to-edge
// at 2-3x their intended width instead of just... being a phone-sized column
// centered on a bigger canvas. This wraps a screen's content so it caps at a
// comfortable reading/form width on large screens and centers itself, while
// being a complete no-op on an actual phone (width <= the breakpoint).
//
// Deliberately a wrapper you opt a screen INTO, not a global layout change —
// most of this app's screens are already fine on a phone; this only matters
// once a screen is opened on something wider.

import React from 'react';
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

// Below this, treat as a phone — behave exactly as before (no wrapping div,
// no width cap). Above it (tablet portrait and up), cap and center.
const TABLET_BREAKPOINT = 600;
const MAX_CONTENT_WIDTH = 720;

interface ResponsiveScreenProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  maxWidth?: number;
}

export function ResponsiveScreen({ children, style, maxWidth = MAX_CONTENT_WIDTH }: ResponsiveScreenProps) {
  const { width } = useWindowDimensions();
  const isLargeScreen = width > TABLET_BREAKPOINT;

  if (!isLargeScreen) {
    // Phone — identical to not having this wrapper at all.
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      {/* flex: 1 here too — a ScrollView child needs a height-bounded
       *  parent to scroll correctly; width-only sizing would let it
       *  collapse to content height instead of filling the screen. */}
      <View style={[{ flex: 1, width: '100%', maxWidth }, style]}>{children}</View>
    </View>
  );
}

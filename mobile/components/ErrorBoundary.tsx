// components/ErrorBoundary.tsx
//
// No error boundary existed anywhere in this app — any uncaught render
// exception (a null-deref, a malformed API response feeding straight into
// JSX, etc.) took down the entire app to a white screen with no in-app
// recovery; the only way out was force-closing and relaunching. Wraps the
// root <Stack> in app/_layout.tsx so a crash in one screen's render can be
// recovered from without restarting the app. React error boundaries must be
// class components — there's no hook equivalent.

import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
    // Stashed in state (not just logged) because Metro/device console logs
    // aren't reachable once this happens on a real user's build — the "Copy
    // details" button below is currently the only way to get the actual
    // stack out of a crash like this instead of just the bare message.
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleRetry = () => {
    this.setState({ error: null, componentStack: null });
  };

  handleCopyDetails = () => {
    const { error, componentStack } = this.state;
    const details = [
      error?.message ?? 'Unknown error',
      error?.stack ?? '(no stack available)',
      componentStack ? `\nComponent stack:${componentStack}` : '',
    ].join('\n');
    Clipboard.setStringAsync(details).catch(() => {});
  };

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4FF', padding: 24 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1a1a2e', textAlign: 'center', marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginBottom: 20 }}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </Text>

          <ScrollView
            style={{ maxHeight: 160, width: '100%', backgroundColor: '#fff', borderRadius: 8, marginBottom: 20 }}
            contentContainerStyle={{ padding: 12 }}
          >
            <Text style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace' }}>
              {this.state.error.stack || '(no stack available)'}
              {this.state.componentStack ? `\n\nComponent stack:${this.state.componentStack}` : ''}
            </Text>
          </ScrollView>

          <Pressable
            onPress={this.handleCopyDetails}
            style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#1a1a2e', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginBottom: 12 }}
            accessibilityRole="button"
          >
            <Text style={{ color: '#1a1a2e', fontWeight: '600' }}>Copy details</Text>
          </Pressable>

          <Pressable
            onPress={this.handleRetry}
            style={{ backgroundColor: '#1a1a2e', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

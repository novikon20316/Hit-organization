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
import { View, Text, Pressable } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Uncaught render error:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
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
          <Pressable
            onPress={this.handleRetry}
            style={{ backgroundColor: '#1a1a2e', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

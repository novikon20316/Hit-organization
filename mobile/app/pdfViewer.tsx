// app/pdfviewer.tsx

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  SafeAreaView,
  Pressable,
  Linking,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';

export default function PdfViewer() {
  const router = useRouter();
  const { url } = useLocalSearchParams<{ url: string }>();

  const fileType = useMemo(() => {
    if (!url) return 'unknown';

    const lower = url.toLowerCase();

    if (lower.includes('.pdf')) return 'pdf';

    if (
      lower.includes('.doc') ||
      lower.includes('.docx')
    ) {
      return 'word';
    }

    return 'unknown';
  }, [url]);

  const viewerUrl = useMemo(() => {
    if (!url) return '';

    // PDF can open directly
    if (fileType === 'pdf') {
      return url;
    }

    // Word files via Office online viewer
    if (fileType === 'word') {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
        url
      )}`;
    }

    return url;
  }, [url, fileType]);

  const handleOpenExternally = async () => {
    if (!url) return;

    try {
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert(
        'Error',
        'Could not open file externally'
      );
    }
  };

  if (!url) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text>No file URL found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View
        style={{
          height: 60,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB',
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#2563EB',
            }}
          >
            ← Back
          </Text>
        </Pressable>

        <Text
          style={{
            fontSize: 17,
            fontWeight: '700',
          }}
        >
          {fileType === 'pdf'
            ? 'PDF Viewer'
            : fileType === 'word'
            ? 'Word Viewer'
            : 'Document Viewer'}
        </Text>

        <Pressable onPress={handleOpenExternally}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: '#2563EB',
            }}
          >
            Open
          </Text>
        </Pressable>
      </View>

      {/* Viewer */}
      <WebView
        source={{ uri: viewerUrl }}
        startInLoadingState
        renderLoading={() => (
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        )}
        style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}
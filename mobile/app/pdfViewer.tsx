import React, { useEffect, useState } from 'react';
import {
  View, Text, ActivityIndicator,
  SafeAreaView, Pressable, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Paths, File } from 'expo-file-system';

export default function PdfViewer() {
  const router = useRouter();
  const { url } = useLocalSearchParams<{ url: string }>();
  const [status, setStatus] = useState<'downloading' | 'done' | 'error'>('downloading');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!url) return;
    downloadAndOpen(url);
  }, [url]);

  const downloadAndOpen = async (fileUrl: string) => {
    try {
      setStatus('downloading');
      setProgress(0);

      const filename = fileUrl.split('/').pop()?.split('?')[0] ?? 'document.pdf';

      // v19: use Paths.cache for temp directory
      const tempFile = new File(Paths.cache, filename);

      // Download via fetch
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      setProgress(50);

      // Convert blob to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      setProgress(80);

      // Write file using v19 API
      await tempFile.write(base64);

      setProgress(100);
      setStatus('done');

      // Share/open with native viewer
      await Sharing.shareAsync(tempFile.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Open PDF',
      });

      router.back();

    } catch (e) {
      console.error('Download error:', e);
      setStatus('error');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{
        height: 60, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
      }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#2563EB' }}>← Back</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700' }}>PDF Viewer</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        {status === 'downloading' && (
          <>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={{ marginTop: 16, fontSize: 16, color: '#374151' }}>
              {progress > 0 ? `Downloading... ${progress}%` : 'Connecting...'}
            </Text>
          </>
        )}
        {status === 'done' && (
          <>
            <Text style={{ fontSize: 40 }}>✅</Text>
            <Text style={{ marginTop: 12, fontSize: 16, color: '#374151' }}>
              File ready
            </Text>
          </>
        )}
        {status === 'error' && (
          <>
            <Text style={{ fontSize: 40 }}>❌</Text>
            <Text style={{ marginTop: 12, fontSize: 16, color: '#DC2626', textAlign: 'center' }}>
              Failed to download file
            </Text>
            <Pressable
              onPress={() => url && downloadAndOpen(url)}
              style={{
                marginTop: 20, backgroundColor: '#2563EB',
                paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
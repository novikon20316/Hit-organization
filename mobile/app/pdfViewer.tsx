import React, { useEffect, useState } from 'react';
import {
  View, Text, ActivityIndicator,
  SafeAreaView, Pressable, Platform, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function PdfViewer() {
  const router = useRouter();
  const { url } = useLocalSearchParams<{ url: string }>();

  const [status,   setStatus]   = useState<'downloading' | 'ready' | 'error'>('downloading');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [localUri, setLocalUri] = useState('');
  const [filename, setFilename] = useState('document.pdf');
  const [fileUrl,  setFileUrl]  = useState('');

  useEffect(() => {
    if (!url) return;
    const decoded = decodeURIComponent(url);
    setFileUrl(decoded);
    downloadFile(decoded);
  }, [url]);

  const downloadFile = async (rawUrl: string) => {
    try {
      setStatus('downloading');
      setProgress(0);
      setErrorMsg('');

      // ── Safe filename ─────────────────────────────────────────────────────
      const rawName  = rawUrl.split('?')[0].split('/').pop() ?? 'document';
      const decoded  = decodeURIComponent(rawName);
      const safe     = decoded.endsWith('.pdf') ? decoded : `${decoded}.pdf`;
      const destUri  = `${FileSystem.cacheDirectory}${safe}`;

      setFilename(safe);
      setProgress(20);

      // ── Download (use cache if available) ─────────────────────────────────
      const existing = await FileSystem.getInfoAsync(destUri);
      if (!existing.exists) {
        const result = await FileSystem.downloadAsync(rawUrl, destUri);
        if (result.status !== 200) {
          throw new Error(`Download failed — HTTP ${result.status}`);
        }
      }

      setProgress(100);
      setLocalUri(destUri);
      setStatus('ready');

    } catch (e: any) {
      console.error('Download error:', e);
      setErrorMsg(e?.message ?? 'Unknown error');
      setStatus('error');
    }
  };

  // ── Open with Sharing (works in Expo Go on both platforms) ────────────────
  // On iOS → opens "Save to Files / Open With" native sheet
  // On Android → opens "Open with" app picker (PDF viewer apps)
  const handleOpen = async () => {
    if (!localUri) return;
    try {
      await Sharing.shareAsync(localUri, {
        mimeType:    'application/pdf',
        UTI:         'com.adobe.pdf',
        dialogTitle: 'Open PDF',
      });
    } catch (e: any) {
      // Fallback: open the original Cloudinary URL in the browser
      const supported = await Linking.canOpenURL(fileUrl);
      if (supported) await Linking.openURL(fileUrl);
    }
  };

  // ── Open original URL in browser as last resort ───────────────────────────
  const handleOpenInBrowser = async () => {
    if (!fileUrl) return;
    await Linking.openURL(fileUrl);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>

      {/* Header */}
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

      {/* Body */}
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>

        {/* ── Downloading ── */}
        {status === 'downloading' && (
          <>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={{ marginTop: 16, fontSize: 16, color: '#374151' }}>
              {progress === 0  ? 'Connecting...'  :
               progress < 100  ? 'Downloading...' :
                                 'Almost ready...'}
            </Text>
            <View style={{
              marginTop: 20, width: '80%', height: 8,
              backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden',
            }}>
              <View style={{
                height: '100%', width: `${progress}%`,
                backgroundColor: '#2563EB', borderRadius: 4,
              }} />
            </View>
            <Text style={{ marginTop: 8, fontSize: 13, color: '#9CA3AF' }}>{progress}%</Text>
          </>
        )}

        {/* ── Ready ── */}
        {status === 'ready' && (
          <>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>📄</Text>

            <Text style={{
              fontSize: 15, fontWeight: '700', color: '#111827',
              textAlign: 'center', marginBottom: 6,
            }}>
              {filename}
            </Text>

            <Text style={{
              fontSize: 13, color: '#6B7280',
              textAlign: 'center', marginBottom: 32,
              lineHeight: 20,
            }}>
              {Platform.OS === 'ios'
                ? 'Tap "Open / Save" to save the file to your Files app or open it in another app.'
                : 'Tap "Open PDF" to view or save the file using your PDF app.'}
            </Text>

            {/* Primary action */}
            <Pressable
              onPress={handleOpen}
              style={{
                backgroundColor: '#2563EB', borderRadius: 12,
                paddingVertical: 14, paddingHorizontal: 32,
                width: '100%', alignItems: 'center', marginBottom: 12,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                {Platform.OS === 'ios' ? '📂  Open / Save to Files' : '📂  Open PDF'}
              </Text>
            </Pressable>

            {/* Secondary: open in browser */}
            <Pressable
              onPress={handleOpenInBrowser}
              style={{
                borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 12,
                paddingVertical: 13, paddingHorizontal: 32,
                width: '100%', alignItems: 'center', marginBottom: 12,
              }}
            >
              <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>
                🌐  Open in Browser
              </Text>
            </Pressable>

            {/* Back */}
            <Pressable onPress={() => router.back()}>
              <Text style={{ color: '#9CA3AF', fontSize: 14, marginTop: 8 }}>← Go Back</Text>
            </Pressable>
          </>
        )}

        {/* ── Error ── */}
        {status === 'error' && (
          <>
            <Text style={{ fontSize: 48 }}>❌</Text>
            <Text style={{ marginTop: 12, fontSize: 16, color: '#DC2626', textAlign: 'center' }}>
              Failed to download file
            </Text>
            {errorMsg ? (
              <Text style={{ marginTop: 8, fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
                {errorMsg}
              </Text>
            ) : null}

            {/* Retry download */}
            <Pressable
              onPress={() => fileUrl && downloadFile(fileUrl)}
              style={{
                marginTop: 20, backgroundColor: '#2563EB',
                paddingHorizontal: 24, paddingVertical: 12,
                borderRadius: 8, width: '100%', alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>🔄  Retry</Text>
            </Pressable>

            {/* Open in browser fallback */}
            <Pressable
              onPress={handleOpenInBrowser}
              style={{
                borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 8,
                paddingHorizontal: 24, paddingVertical: 12,
                width: '100%', alignItems: 'center',
              }}
            >
              <Text style={{ color: '#374151', fontWeight: '600' }}>🌐  Open in Browser</Text>
            </Pressable>
          </>
        )}

      </View>
    </SafeAreaView>
  );
}
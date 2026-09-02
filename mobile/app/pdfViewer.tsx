import React, { useEffect, useState } from 'react';
import {
  View, Text, ActivityIndicator,
  Pressable, Platform, Linking,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';

// Extensions this viewer knows about — anything else falls back to the
// generic "download + hand off to another app" flow below rather than
// mis-tagging an unrecognized file as a PDF (the previous, unconditional
// `${decoded}.pdf` rename did exactly that for every non-PDF file).
const KNOWN_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'zip', 'doc', 'docx', 'ppt', 'pptx'];
const OFFICE_EXTENSIONS = ['doc', 'docx', 'ppt', 'pptx'];
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  zip: 'application/zip', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function extensionOf(rawUrl: string): string {
  const rawName = rawUrl.split('?')[0].split('/').pop() ?? '';
  const decoded = decodeURIComponent(rawName);
  return decoded.includes('.') ? decoded.split('.').pop()!.toLowerCase() : '';
}

export default function PdfViewer() {
  const router = useRouter();
  const { url } = useLocalSearchParams<{ url: string }>();

  const [status,   setStatus]   = useState<'downloading' | 'ready' | 'error'>('downloading');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [localUri, setLocalUri] = useState('');
  const [filename, setFilename] = useState('document');
  const [fileUrl,  setFileUrl]  = useState('');

  const ext = fileUrl ? extensionOf(fileUrl) : '';
  // Word/PowerPoint render in-app via Microsoft's free Office Online viewer
  // (their servers fetch the file from its own public Cloudinary URL and
  // render it — same approach as web's MilestoneFilePanel.tsx) instead of
  // the download-then-hand-to-another-app flow below, which doesn't render
  // anything itself. Needs a URL Microsoft's servers can actually reach —
  // won't work against a local/dev-only URL.
  const isOffice = OFFICE_EXTENSIONS.includes(ext);

  useEffect(() => {
    if (!url) return;
    const decoded = decodeURIComponent(url);
    setFileUrl(decoded);
    if (OFFICE_EXTENSIONS.includes(extensionOf(decoded))) {
      // No local download needed — the WebView below points straight at
      // Microsoft's viewer with the real URL embedded in it.
      setStatus('ready');
      return;
    }
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
      const fileExt  = extensionOf(rawUrl);
      // A legacy Cloudinary "raw" URL predating milestoneController.ts's
      // `format` fix can lack any extension at all — same issue
      // MilestoneFilePanel.tsx's guessMimeFromUrl works around on the web
      // side. Falls back to assuming PDF (today's original behavior) only
      // when there's truly no extension to go on; a real, known extension
      // is never overwritten.
      const safe     = KNOWN_EXTENSIONS.includes(fileExt) ? decoded : `${decoded}.pdf`;
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
  // On Android → opens "Open with" app picker (a PDF/Office-capable app)
  const handleOpen = async () => {
    if (!localUri) return;
    const mimeType = MIME_BY_EXTENSION[extensionOf(localUri)] ?? 'application/pdf';
    try {
      await Sharing.shareAsync(localUri, {
        mimeType,
        dialogTitle: 'Open document',
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
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#2563EB' }}>← Back</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700' }}>Document Viewer</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* ── Office (Word/PowerPoint) — rendered in-app via Microsoft's viewer ── */}
      {isOffice && status === 'ready' && fileUrl ? (
        <>
          <WebView
            source={{ uri: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}` }}
            style={{ flex: 1 }}
            startInLoadingState
            renderLoading={() => (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#2563EB" />
              </View>
            )}
          />
          <Pressable
            onPress={handleOpenInBrowser}
            style={{
              margin: 16, borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 12,
              paddingVertical: 13, alignItems: 'center',
            }}
            accessibilityRole="button"
          >
            <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>🌐  Open in Browser</Text>
          </Pressable>
        </>
      ) : (

      /* Body */
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
              accessibilityRole="button"
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
              accessibilityRole="button"
            >
              <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>
                🌐  Open in Browser
              </Text>
            </Pressable>

            {/* Back */}
            <Pressable onPress={() => router.back()} accessibilityRole="button">
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
              accessibilityRole="button"
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
              accessibilityRole="button"
            >
              <Text style={{ color: '#374151', fontWeight: '600' }}>🌐  Open in Browser</Text>
            </Pressable>
          </>
        )}

      </View>
      )}
    </SafeAreaView>
  );
}
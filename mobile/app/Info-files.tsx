// app/coordinator/info-files.tsx  (move to app/admin/ if that's where this role's screens live)
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet,
  ActivityIndicator, Alert, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '@/src/api/apiClient';
import { tx, type Lang } from '../components/i18n';

interface InfoFile {
  id: string;
  titleHe: string;
  titleEn: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  createdAt: string | null;
}

export default function InfoFilesAdmin() {
  const [lang] = useState<Lang>('he');
  const isRtl = lang === 'he';

  const [files, setFiles]             = useState<InfoFile[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);

  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/info-files');
      setFiles(res.data.files ?? []);
    } catch (e) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'טעינת הקבצים נכשלה' : 'Failed to load files',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lang]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFiles();
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    });
    if (result.canceled || !result.assets?.length) return;
    setPickedFile(result.assets[0]);
  };

  const handleUpload = async () => {
    if (!pickedFile) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש לבחור קובץ' : 'Please pick a file',
      );
      return;
    }
    if (!titleHe.trim() && !titleEn.trim()) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'יש להזין כותרת' : 'Please enter a title',
      );
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: pickedFile.uri,
        name: pickedFile.name,
        type: pickedFile.mimeType ?? 'application/octet-stream',
      } as any);
      formData.append('titleHe', titleHe.trim());
      formData.append('titleEn', titleEn.trim());

      await apiClient.post('/api/admin/info-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Alert.alert('✅', lang === 'he' ? 'הקובץ הועלה בהצלחה' : 'File uploaded successfully');
      setTitleHe('');
      setTitleEn('');
      setPickedFile(null);
      fetchFiles();
    } catch (e) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'העלאת הקובץ נכשלה' : 'Failed to upload file',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (file: InfoFile) => {
    Alert.alert(
      lang === 'he' ? 'מחיקת קובץ' : 'Delete file',
      lang === 'he' ? `האם למחוק את "${file.titleHe || file.titleEn}"?` : `Delete "${file.titleEn || file.titleHe}"?`,
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'he' ? 'מחק' : 'Delete', style: 'destructive',
          onPress: async () => {
            setDeletingId(file.id);
            try {
              await apiClient.delete(`/api/admin/info-files/${file.id}`);
              setFiles(prev => prev.filter(f => f.id !== file.id));
            } catch (e) {
              Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2E86FF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <Text style={[styles.header, isRtl && styles.textRight]}>
        {lang === 'he' ? 'ניהול מסמכים לסטודנטים' : 'Manage Student Info Files'}
      </Text>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ── Upload form ── */}
        <View style={styles.uploadCard}>
          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>
            {lang === 'he' ? 'כותרת בעברית' : 'Title (Hebrew)'}
          </Text>
          <TextInput
            style={[styles.input, isRtl && styles.textRight]}
            value={titleHe}
            onChangeText={setTitleHe}
            placeholder={lang === 'he' ? 'לדוגמה: מדריך לבחירת פרויקט' : 'e.g. Project selection guide'}
            placeholderTextColor="#9BA8C0"
          />

          <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 10 }]}>
            {lang === 'he' ? 'כותרת באנגלית' : 'Title (English)'}
          </Text>
          <TextInput
            style={[styles.input, isRtl && styles.textRight]}
            value={titleEn}
            onChangeText={setTitleEn}
            placeholder="e.g. Project selection guide"
            placeholderTextColor="#9BA8C0"
          />

          <Pressable style={styles.pickBtn} onPress={handlePickFile}>
            <Text style={styles.pickBtnText}>
              {pickedFile ? `✓ ${pickedFile.name}` : `📄 ${lang === 'he' ? 'בחר קובץ' : 'Pick a file'}`}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
            onPress={handleUpload}
            disabled={uploading}
          >
            {uploading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.uploadBtnText}>{lang === 'he' ? 'העלה קובץ' : 'Upload file'}</Text>
            }
          </Pressable>
        </View>

        {/* ── Existing files list ── */}
        <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 24, marginBottom: 8 }]}>
          {lang === 'he' ? 'קבצים שהועלו' : 'Uploaded files'}
        </Text>

        {files.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#8899BB', textAlign: isRtl ? 'right' : 'left' }}>
            {lang === 'he' ? 'אין קבצים עדיין' : 'No files yet'}
          </Text>
        ) : (
          files.map((f) => (
            <View key={f.id} style={[styles.fileRow, isRtl && styles.rowReverse]}>
              <Pressable style={{ flex: 1, flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center' }}
                onPress={() => Linking.openURL(f.fileUrl)}
              >
                <Text style={{ fontSize: 18, marginRight: isRtl ? 0 : 10, marginLeft: isRtl ? 10 : 0 }}>📄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fileTitle, isRtl && styles.textRight]}>
                    {lang === 'he' ? (f.titleHe || f.titleEn) : (f.titleEn || f.titleHe)}
                  </Text>
                  <Text style={[styles.fileMeta, isRtl && styles.textRight]}>{f.fileName}</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => handleDelete(f)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                {deletingId === f.id
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <Text style={{ color: '#EF4444', fontWeight: '700' }}>✕</Text>
                }
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#F0F4FF' },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:    { fontSize: 20, fontWeight: 'bold', color: '#1a1a2e', padding: 20, paddingBottom: 8 },
  content:   { paddingHorizontal: 20, paddingBottom: 40 },
  uploadCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  textRight: { textAlign: 'right' },
  fieldLabel: { fontSize: 12, color: '#8899BB', marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#E0E8FF', borderRadius: 10,
    padding: 10, fontSize: 14, backgroundColor: '#F8FAFF', color: '#111',
  },
  pickBtn: {
    marginTop: 14, borderWidth: 1, borderColor: '#2E86FF', borderStyle: 'dashed',
    borderRadius: 10, padding: 12, alignItems: 'center',
  },
  pickBtnText: { color: '#2E86FF', fontWeight: '600', fontSize: 13 },
  uploadBtn: {
    backgroundColor: '#2E86FF', borderRadius: 10, padding: 14,
    alignItems: 'center', marginTop: 12,
  },
  uploadBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E0E8FF',
  },
  fileTitle: { fontSize: 13, fontWeight: '700', color: '#111' },
  fileMeta:  { fontSize: 11, color: '#8899BB', marginTop: 2 },
  rowReverse: { flexDirection: 'row-reverse' },
});
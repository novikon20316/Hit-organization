// app/coordinator/info-files.tsx  (move to app/admin/ if that's where this role's screens live)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert, Linking, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '@/src/api/apiClient';
import { tx, type Lang } from '../components/i18n';
import { InfoFilesStyles } from '../constants/styles';
import { FACULTY_COLORS } from '../components/shared';
import { PERMISSION_FACULTY_IDS, majorsForFaculty } from '../constants/permissions';
import { HIT_FACULTIES } from '../constants/faculties';

interface InfoFile {
  id: string;
  titleHe: string;
  titleEn: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  createdAt: string | null;
  facultyIds: string[];
  majors: string[];
  degreeTypes: string[];
}

interface FacultyContentItem {
  id: string;
  type: 'procedure' | 'announcement';
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
  facultyIds: string[];
  majors: string[];
  degreeTypes: string[];
}

// Visibility scoping — leaving an axis empty means "unrestricted" for that
// axis (matches every file, as before this feature). A student must match
// ALL non-empty axes; the actual filtering happens server-side in
// getInfoFiles, this screen only builds/displays the scope.
const SELECTABLE_FACULTIES = PERMISSION_FACULTY_IDS.filter((id) => id !== 'all');
const ALL_MAJORS = (() => {
  const seen = new Set<string>();
  const out: { slug: string; label: Record<'he' | 'en', string> }[] = [];
  for (const faculty of HIT_FACULTIES) {
    for (const program of faculty.programs) {
      if (seen.has(program.slug)) continue;
      seen.add(program.slug);
      out.push({ slug: program.slug, label: program.label });
    }
  }
  return out;
})();
const DEGREE_TYPES = ['bachelors', 'masters'] as const;

function scopeSummary(f: InfoFile, lang: Lang): string {
  const parts: string[] = [];
  if (f.facultyIds?.length) {
    parts.push(f.facultyIds.map((id) => FACULTY_COLORS[id]?.label[lang] ?? id).join(', '));
  }
  if (f.majors?.length) {
    parts.push(f.majors.map((slug) => ALL_MAJORS.find((m) => m.slug === slug)?.label[lang] ?? slug).join(', '));
  }
  if (f.degreeTypes?.length) {
    parts.push(
      f.degreeTypes
        .map((d) => (d === 'bachelors' ? (lang === 'he' ? 'תואר ראשון' : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")))
        .join(', ')
    );
  }
  if (parts.length === 0) return lang === 'he' ? '🌐 כולם' : '🌐 Everyone';
  return `🎯 ${parts.join(' · ')}`;
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

  // Visibility scoping — each empty means unrestricted for that axis.
  const [scopeFacultyIds, setScopeFacultyIds] = useState<string[]>([]);
  const [scopeMajors, setScopeMajors] = useState<string[]>([]);
  const [scopeDegreeTypes, setScopeDegreeTypes] = useState<string[]>([]);

  // Cascades to just the selected faculties' majors once any are picked —
  // otherwise the full cross-faculty list, since a major on its own is a
  // valid (if unusual) restriction too.
  const availableMajors = useMemo(() => {
    if (scopeFacultyIds.length === 0) return ALL_MAJORS;
    const seen = new Set<string>();
    const out: typeof ALL_MAJORS = [];
    for (const facultyId of scopeFacultyIds) {
      for (const m of majorsForFaculty(facultyId)) {
        if (seen.has(m.slug)) continue;
        seen.add(m.slug);
        out.push(m);
      }
    }
    return out;
  }, [scopeFacultyIds]);

  const toggleIn = (list: string[], value: string, setList: (v: string[]) => void) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const toggleFaculty = (facultyId: string) => {
    const next = scopeFacultyIds.includes(facultyId)
      ? scopeFacultyIds.filter((v) => v !== facultyId)
      : [...scopeFacultyIds, facultyId];
    setScopeFacultyIds(next);
    // Drop any selected major that no longer belongs to the (now narrower)
    // set of faculties, so the stored scope never silently contradicts itself.
    const validSlugs = new Set(
      next.length === 0 ? ALL_MAJORS.map((m) => m.slug) : next.flatMap((f) => majorsForFaculty(f).map((m) => m.slug))
    );
    setScopeMajors((prev) => prev.filter((m) => validSlugs.has(m)));
  };

  // ── Faculty procedures / announcements — free-text companion to the file
  // uploads above (requirements doc section 15). Separate scope state so
  // filling one form doesn't leak into the other.
  const [contentItems, setContentItems] = useState<FacultyContentItem[]>([]);
  const [contentType, setContentType] = useState<'procedure' | 'announcement'>('announcement');
  const [contentTitleHe, setContentTitleHe] = useState('');
  const [contentTitleEn, setContentTitleEn] = useState('');
  const [contentBodyHe, setContentBodyHe] = useState('');
  const [contentBodyEn, setContentBodyEn] = useState('');
  const [contentScopeFacultyIds, setContentScopeFacultyIds] = useState<string[]>([]);
  const [contentScopeMajors, setContentScopeMajors] = useState<string[]>([]);
  const [contentScopeDegreeTypes, setContentScopeDegreeTypes] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [deletingContentId, setDeletingContentId] = useState<string | null>(null);

  const contentAvailableMajors = useMemo(() => {
    if (contentScopeFacultyIds.length === 0) return ALL_MAJORS;
    const seen = new Set<string>();
    const out: typeof ALL_MAJORS = [];
    for (const facultyId of contentScopeFacultyIds) {
      for (const m of majorsForFaculty(facultyId)) {
        if (seen.has(m.slug)) continue;
        seen.add(m.slug);
        out.push(m);
      }
    }
    return out;
  }, [contentScopeFacultyIds]);

  const toggleContentFaculty = (facultyId: string) => {
    const next = contentScopeFacultyIds.includes(facultyId)
      ? contentScopeFacultyIds.filter((v) => v !== facultyId)
      : [...contentScopeFacultyIds, facultyId];
    setContentScopeFacultyIds(next);
    const validSlugs = new Set(
      next.length === 0 ? ALL_MAJORS.map((m) => m.slug) : next.flatMap((f) => majorsForFaculty(f).map((m) => m.slug))
    );
    setContentScopeMajors((prev) => prev.filter((m) => validSlugs.has(m)));
  };

  const fetchContent = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/faculty-content');
      setContentItems(res.data.items ?? []);
    } catch (e) {
      // Non-fatal — the file list above is the primary content of this screen.
    }
  }, []);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const handlePostContent = async () => {
    if (!contentTitleHe.trim() && !contentTitleEn.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להזין כותרת' : 'Please enter a title');
      return;
    }
    if (!contentBodyHe.trim() && !contentBodyEn.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש להזין תוכן' : 'Please enter body text');
      return;
    }
    setPosting(true);
    try {
      await apiClient.post('/api/admin/faculty-content', {
        type: contentType,
        titleHe: contentTitleHe.trim(),
        titleEn: contentTitleEn.trim(),
        bodyHe: contentBodyHe.trim(),
        bodyEn: contentBodyEn.trim(),
        facultyIds: contentScopeFacultyIds,
        majors: contentScopeMajors,
        degreeTypes: contentScopeDegreeTypes,
      });
      setContentTitleHe('');
      setContentTitleEn('');
      setContentBodyHe('');
      setContentBodyEn('');
      setContentScopeFacultyIds([]);
      setContentScopeMajors([]);
      setContentScopeDegreeTypes([]);
      fetchContent();
    } catch (e) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'הפרסום נכשל' : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteContent = (item: FacultyContentItem) => {
    Alert.alert(
      lang === 'he' ? 'מחיקת תוכן' : 'Delete content',
      lang === 'he' ? `האם למחוק את "${item.titleHe || item.titleEn}"?` : `Delete "${item.titleEn || item.titleHe}"?`,
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'he' ? 'מחק' : 'Delete', style: 'destructive',
          onPress: async () => {
            setDeletingContentId(item.id);
            try {
              await apiClient.delete(`/api/admin/faculty-content/${item.id}`);
              setContentItems((prev) => prev.filter((c) => c.id !== item.id));
            } catch (e) {
              Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed');
            } finally {
              setDeletingContentId(null);
            }
          },
        },
      ],
    );
  };

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
      formData.append('facultyIds', JSON.stringify(scopeFacultyIds));
      formData.append('majors', JSON.stringify(scopeMajors));
      formData.append('degreeTypes', JSON.stringify(scopeDegreeTypes));

      await apiClient.post('/api/admin/info-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Alert.alert('✅', lang === 'he' ? 'הקובץ הועלה בהצלחה' : 'File uploaded successfully');
      setTitleHe('');
      setTitleEn('');
      setPickedFile(null);
      setScopeFacultyIds([]);
      setScopeMajors([]);
      setScopeDegreeTypes([]);
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

          {/* ── Visibility scoping (optional) ── */}
          <View style={styles.scopeBox}>
            <Text style={[styles.scopeHint, isRtl && styles.textRight]}>
              {lang === 'he'
                ? '🎯 חשיפה (אופציונלי) — השאר ריק כדי להציג לכולם'
                : '🎯 Visibility (optional) — leave everything blank to show this to everyone'}
            </Text>

            <Text style={[styles.scopeGroupLabel, isRtl && styles.textRight]}>
              {lang === 'he' ? 'פקולטה' : 'Faculty'}
            </Text>
            <View style={styles.chipRow}>
              {SELECTABLE_FACULTIES.map((id) => {
                const active = scopeFacultyIds.includes(id);
                return (
                  <Pressable
                    key={id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleFaculty(id)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {FACULTY_COLORS[id]?.label[lang] ?? id}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.scopeGroupLabel, isRtl && styles.textRight]}>
              {lang === 'he' ? 'מגמה' : 'Major'}
            </Text>
            <View style={styles.chipRow}>
              {availableMajors.map((m) => {
                const active = scopeMajors.includes(m.slug);
                return (
                  <Pressable
                    key={m.slug}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleIn(scopeMajors, m.slug, setScopeMajors)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label[lang]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.scopeGroupLabel, isRtl && styles.textRight]}>
              {lang === 'he' ? 'תואר' : 'Degree'}
            </Text>
            <View style={styles.chipRow}>
              {DEGREE_TYPES.map((d) => {
                const active = scopeDegreeTypes.includes(d);
                return (
                  <Pressable
                    key={d}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleIn(scopeDegreeTypes, d, setScopeDegreeTypes)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {d === 'bachelors' ? (lang === 'he' ? 'תואר ראשון' : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

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
              <View style={[styles.scopeBadge, isRtl && styles.scopeBadgeRtl]}>
                <Text style={styles.scopeBadgeText}>{scopeSummary(f, lang)}</Text>
              </View>
              <Pressable onPress={() => handleDelete(f)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                {deletingId === f.id
                  ? <ActivityIndicator size="small" color="#EF4444" />
                  : <Text style={{ color: '#EF4444', fontWeight: '700' }}>✕</Text>
                }
              </Pressable>
            </View>
          ))
        )}

        {/* ── Faculty procedures / announcements ── */}
        <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 28, marginBottom: 8 }]}>
          📢 {lang === 'he' ? 'נהלים והודעות שוטפות' : 'Procedures & Announcements'}
        </Text>

        <View style={styles.uploadCard}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['announcement', 'procedure'] as const).map((v) => {
              const active = contentType === v;
              return (
                <Pressable
                  key={v}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setContentType(v)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {v === 'announcement' ? (lang === 'he' ? '📣 הודעה' : '📣 Announcement') : (lang === 'he' ? '📘 נוהל' : '📘 Procedure')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, isRtl && styles.textRight]}>{lang === 'he' ? 'כותרת בעברית' : 'Title (Hebrew)'}</Text>
          <TextInput style={[styles.input, isRtl && styles.textRight]} value={contentTitleHe} onChangeText={setContentTitleHe} placeholderTextColor="#9BA8C0" />

          <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 10 }]}>{lang === 'he' ? 'כותרת באנגלית' : 'Title (English)'}</Text>
          <TextInput style={[styles.input, isRtl && styles.textRight]} value={contentTitleEn} onChangeText={setContentTitleEn} placeholderTextColor="#9BA8C0" />

          <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 10 }]}>{lang === 'he' ? 'תוכן בעברית' : 'Body (Hebrew)'}</Text>
          <TextInput
            style={[styles.input, isRtl && styles.textRight, { minHeight: 70, textAlignVertical: 'top' }]}
            value={contentBodyHe} onChangeText={setContentBodyHe} multiline placeholderTextColor="#9BA8C0"
          />

          <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 10 }]}>{lang === 'he' ? 'תוכן באנגלית' : 'Body (English)'}</Text>
          <TextInput
            style={[styles.input, isRtl && styles.textRight, { minHeight: 70, textAlignVertical: 'top' }]}
            value={contentBodyEn} onChangeText={setContentBodyEn} multiline placeholderTextColor="#9BA8C0"
          />

          <View style={styles.scopeBox}>
            <Text style={[styles.scopeHint, isRtl && styles.textRight]}>
              {lang === 'he' ? '🎯 חשיפה (אופציונלי) — השאר ריק כדי להציג לכולם' : '🎯 Visibility (optional) — leave blank to show everyone'}
            </Text>

            <Text style={[styles.scopeGroupLabel, isRtl && styles.textRight]}>{lang === 'he' ? 'פקולטה' : 'Faculty'}</Text>
            <View style={styles.chipRow}>
              {SELECTABLE_FACULTIES.map((id) => {
                const active = contentScopeFacultyIds.includes(id);
                return (
                  <Pressable key={id} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleContentFaculty(id)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{FACULTY_COLORS[id]?.label[lang] ?? id}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.scopeGroupLabel, isRtl && styles.textRight]}>{lang === 'he' ? 'מגמה' : 'Major'}</Text>
            <View style={styles.chipRow}>
              {contentAvailableMajors.map((m) => {
                const active = contentScopeMajors.includes(m.slug);
                return (
                  <Pressable key={m.slug} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleIn(contentScopeMajors, m.slug, setContentScopeMajors)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label[lang]}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.scopeGroupLabel, isRtl && styles.textRight]}>{lang === 'he' ? 'תואר' : 'Degree'}</Text>
            <View style={styles.chipRow}>
              {DEGREE_TYPES.map((d) => {
                const active = contentScopeDegreeTypes.includes(d);
                return (
                  <Pressable key={d} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleIn(contentScopeDegreeTypes, d, setContentScopeDegreeTypes)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {d === 'bachelors' ? (lang === 'he' ? 'תואר ראשון' : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable style={[styles.uploadBtn, posting && { opacity: 0.6 }]} onPress={handlePostContent} disabled={posting}>
            {posting ? <ActivityIndicator color="#fff" /> : <Text style={styles.uploadBtnText}>{lang === 'he' ? 'פרסם' : 'Post'}</Text>}
          </Pressable>
        </View>

        <Text style={[styles.fieldLabel, isRtl && styles.textRight, { marginTop: 16, marginBottom: 8 }]}>
          {lang === 'he' ? 'נהלים והודעות שפורסמו' : 'Published procedures & announcements'}
        </Text>

        {contentItems.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#8899BB', textAlign: isRtl ? 'right' : 'left' }}>
            {lang === 'he' ? 'אין תוכן עדיין' : 'Nothing published yet'}
          </Text>
        ) : (
          contentItems.map((c) => (
            <View key={c.id} style={[styles.fileRow, isRtl && styles.rowReverse]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileTitle, isRtl && styles.textRight]}>
                  {c.type === 'announcement' ? '📣 ' : '📘 '}{lang === 'he' ? (c.titleHe || c.titleEn) : (c.titleEn || c.titleHe)}
                </Text>
                <Text style={[styles.fileMeta, isRtl && styles.textRight]} numberOfLines={2}>
                  {lang === 'he' ? (c.bodyHe || c.bodyEn) : (c.bodyEn || c.bodyHe)}
                </Text>
              </View>
              <Pressable onPress={() => handleDeleteContent(c)} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                {deletingContentId === c.id
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

const styles = InfoFilesStyles;
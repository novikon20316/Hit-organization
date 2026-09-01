// app/student/info.tsx
//
// Shown by app/student/home.tsx when studentState === 'ineligible' — i.e. a
// bachelor's student not yet in their final year, or a master's student past
// their 1st year (see computeIsEligible on the server). Not a standalone route:
// rendered as a sub-screen inside home.tsx's SafeAreaView + top bar, the same
// way BrowseProjects / ActiveDashboard are.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Linking, Alert, RefreshControl,
} from 'react-native';
import { apiClient } from '@/src/api/apiClient';
import { tx, type Lang } from '../../components/i18n';

interface InfoFile {
  id: string;
  titleHe: string;
  titleEn: string;
  fileUrl: string;
  fileName: string;
}

interface FacultyContentItem {
  id: string;
  type: 'procedure' | 'announcement';
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
}

interface Props {
  lang: Lang;
  isRtl: boolean;
  studentName?: string;
  studentDegree?: string; // 'bachelors' | 'masters'
}

export default function InfoScreen({ lang, isRtl, studentDegree }: Props) {
  const isBachelor = studentDegree === 'bachelors';

  const [files, setFiles]           = useState<InfoFile[]>([]);
  const [content, setContent]       = useState<FacultyContentItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      const [filesRes, contentRes] = await Promise.all([
        apiClient.get('/api/info-files'),
        apiClient.get('/api/faculty-content'),
      ]);
      setFiles(filesRes.data.files ?? []);
      setContent(contentRes.data.items ?? []);
    } catch (e) {
      Alert.alert(
        lang === 'he' ? 'שגיאה' : 'Error',
        lang === 'he' ? 'טעינת הקבצים נכשלה' : 'Failed to load files',
      );
    } finally {
      setFilesLoading(false);
      setRefreshing(false);
    }
  }, [lang]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFiles();
  };

  const announcements = content.filter((c) => c.type === 'announcement');
  const procedures = content.filter((c) => c.type === 'procedure');

  const handleOpen = async (url: string) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else Alert.alert(lang === 'he' ? 'לא ניתן לפתוח' : 'Unable to open file');
    } catch {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error opening file');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Not-eligible banner */}
      <View style={{
        backgroundColor: '#FFFBEB', borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: '#FDE68A', marginBottom: 20,
        alignItems: isRtl ? 'flex-end' : 'flex-start',
      }}>
        <Text style={{ fontSize: 22, marginBottom: 8 }}>⏳</Text>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#92400E', marginBottom: 6, textAlign: isRtl ? 'right' : 'left' }}>
          {tx('studentNotEligibleTitle', lang)}
        </Text>
        <Text style={{ fontSize: 13, color: '#78350F', lineHeight: 20, textAlign: isRtl ? 'right' : 'left' }}>
          {tx('studentNotEligibleSub', lang)}
        </Text>
      </View>

      {announcements.map((a) => (
        <View key={a.id} style={{
          backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: '#FDE68A', marginBottom: 12,
        }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 4, textAlign: isRtl ? 'right' : 'left' }}>
            📣 {lang === 'he' ? (a.titleHe || a.titleEn) : (a.titleEn || a.titleHe)}
          </Text>
          <Text style={{ fontSize: 13, color: '#78350F', lineHeight: 19, textAlign: isRtl ? 'right' : 'left' }}>
            {lang === 'he' ? (a.bodyHe || a.bodyEn) : (a.bodyEn || a.bodyHe)}
          </Text>
        </View>
      ))}

      {/* Info card: track-specific */}
      <View style={{
        backgroundColor: '#EFF6FF', borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 16,
      }}>
        <Text style={{ fontSize: 18, marginBottom: 8 }}>📘</Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E3A5F', marginBottom: 4, textAlign: isRtl ? 'right' : 'left' }}>
          {isBachelor
            ? tx('bachelorProjectInfo', lang)
            : tx('masterThesisInfo', lang)}
        </Text>
        <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20, textAlign: isRtl ? 'right' : 'left' }}>
          {isBachelor
            ? (lang === 'he'
                ? 'פרויקט הגמר הוא פרויקט קבוצתי או אישי המשלב יישום מעשי של הנלמד בתואר. הוא כולל בחירת נושא, אישור מנחה, הגשות ביניים, תוצר סופי והצגה.'
                : "The final project integrates practical application of your degree's content. It includes topic selection, supervisor approval, interim submissions, a final product, and a presentation.")
            : (lang === 'he'
                ? 'תזה לתואר שני היא עבודת מחקר מקורית. התהליך כולל הצעת מחקר, עבודה מודרכת, שיפוט על ידי בוחנים, הגנה וציון סופי.'
                : "A master's thesis is an original research work. The process includes a research proposal, guided work, examination by reviewers, a defense session, and a final grade.")}
        </Text>
      </View>

      {/* Info section: key steps */}
      <View style={{
        backgroundColor: '#fff', borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: '#E0E8FF',
      }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#111', marginBottom: 14, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he' ? '📋 שלבים עיקריים בתהליך:' : '📋 Main Process Steps:'}
        </Text>
        {(isBachelor
          ? [
              { he: 'בחירת נושא ומנחה', en: 'Topic & Supervisor Selection' },
              { he: 'הגשת אפיון', en: 'Specification Submission' },
              { he: 'דוח ביניים', en: 'Interim Report' },
              { he: 'תוצר סופי ומצגת', en: 'Final Product & Presentation' },
            ]
          : [
              { he: 'בחירת מנחה ונושא', en: 'Supervisor & Topic Selection' },
              { he: 'הצעת מחקר', en: 'Research Proposal' },
              { he: 'עבודה פעילה ודוחות התקדמות', en: 'Active Work & Progress Reports' },
              { he: 'הגשה לשיפוט', en: 'Submission for Examination' },
              { he: 'הגנה וציון סופי', en: 'Defense & Final Grade' },
            ]
        ).map((step, i) => (
          <View key={i} style={{ flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 10 }}>
            <View style={{
              width: 24, height: 24, borderRadius: 12,
              backgroundColor: '#2E86FF', alignItems: 'center', justifyContent: 'center',
              marginRight: isRtl ? 0 : 10, marginLeft: isRtl ? 10 : 0,
            }}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{i + 1}</Text>
            </View>
            <Text style={{ fontSize: 14, color: '#374151', flex: 1, textAlign: isRtl ? 'right' : 'left' }}>
              {lang === 'he' ? step.he : step.en}
            </Text>
          </View>
        ))}
      </View>

      {/* Documents & guidance files */}
      <View style={{
        backgroundColor: '#fff', borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: '#E0E8FF', marginTop: 16,
      }}>
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#111', marginBottom: 14, textAlign: isRtl ? 'right' : 'left' }}>
          {lang === 'he' ? '📎 מסמכים והסברים' : '📎 Documents & Guidance'}
        </Text>

        {filesLoading ? (
          <ActivityIndicator size="small" color="#2E86FF" />
        ) : files.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#8899BB', textAlign: isRtl ? 'right' : 'left' }}>
            {lang === 'he' ? 'אין קבצים זמינים כרגע' : 'No files available yet'}
          </Text>
        ) : (
          files.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => handleOpen(f.fileUrl)}
              style={{
                flexDirection: isRtl ? 'row-reverse' : 'row', alignItems: 'center',
                backgroundColor: '#F8FAFF', borderRadius: 10, padding: 12,
                borderWidth: 1, borderColor: '#E0E8FF', marginBottom: 8,
              }}
              accessibilityRole="link"
            >
              <Text style={{ fontSize: 18, marginRight: isRtl ? 0 : 10, marginLeft: isRtl ? 10 : 0 }}>📄</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111', flex: 1, textAlign: isRtl ? 'right' : 'left' }}>
                {lang === 'he' ? (f.titleHe || f.titleEn) : (f.titleEn || f.titleHe)}
              </Text>
              <Text style={{ fontSize: 14 }}>⬇️</Text>
            </Pressable>
          ))
        )}
      </View>

      {procedures.length > 0 && (
        <View style={{
          backgroundColor: '#fff', borderRadius: 16, padding: 20,
          borderWidth: 1, borderColor: '#E0E8FF', marginTop: 16,
        }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111', marginBottom: 14, textAlign: isRtl ? 'right' : 'left' }}>
            {lang === 'he' ? '📘 נהלים' : '📘 Procedures'}
          </Text>
          {procedures.map((p) => (
            <View key={p.id} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111', textAlign: isRtl ? 'right' : 'left' }}>
                {lang === 'he' ? (p.titleHe || p.titleEn) : (p.titleEn || p.titleHe)}
              </Text>
              <Text style={{ fontSize: 13, color: '#374151', lineHeight: 19, marginTop: 2, textAlign: isRtl ? 'right' : 'left' }}>
                {lang === 'he' ? (p.bodyHe || p.bodyEn) : (p.bodyEn || p.bodyHe)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

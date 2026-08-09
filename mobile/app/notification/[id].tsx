// app/notification/[id].tsx — full-screen view of a single notification,
// reached by tapping a row in (tabs)/notifications.tsx.
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Lang } from '../../components/i18n';
import { TYPE_STYLE } from '../(tabs)/notifications';
import { NotificationDetailStyles } from '../../constants/styles';

const s = NotificationDetailStyles;

export default function NotificationDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    type?:       string;
    titleHe?:    string;
    titleEn?:    string;
    bodyHe?:     string;
    bodyEn?:     string;
    createdAt?:  string;
    targetRoute?: string;
    lang?:       string;
  }>();

  const [lang, setLang] = useState<Lang>(params.lang === 'en' ? 'en' : 'he');
  const isRtl = lang === 'he';

  const style = TYPE_STYLE[params.type ?? ''] ?? TYPE_STYLE.project_published;
  const title = (lang === 'he' ? params.titleHe : params.titleEn) ?? '';
  const body  = (lang === 'he' ? params.bodyHe  : params.bodyEn)  ?? '';

  const date      = params.createdAt ? new Date(params.createdAt) : null;
  const timestamp = date && !isNaN(date.getTime())
    ? date.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={[s.topRow, isRtl && s.rowReverse]}>
          <Pressable
            style={s.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/notifications' as any))}
          >
            <Text style={s.backText}>{isRtl ? '→' : '←'}</Text>
          </Pressable>
          <Pressable style={s.langBtn} onPress={() => setLang(lang === 'he' ? 'en' : 'he')}>
            <Text style={s.langText}>{lang === 'he' ? 'EN' : 'עב'}</Text>
          </Pressable>
        </View>

        <View style={[s.iconBubble, { backgroundColor: style.bg }]}>
          <Text style={s.iconText}>{style.icon}</Text>
        </View>

        <Text style={[s.title, isRtl && s.textRight]}>{title}</Text>
        {!!timestamp && <Text style={[s.timestamp, isRtl && s.textRight]}>{timestamp}</Text>}

        <View style={s.bodyCard}>
          <Text style={[s.bodyText, isRtl && s.textRight]}>{body}</Text>
        </View>

        {!!params.targetRoute && (
          <Pressable style={s.actionBtn} onPress={() => router.replace(params.targetRoute as any)}>
            <Text style={s.actionBtnText}>
              {lang === 'he' ? 'עבור לדשבורד' : 'Go to dashboard'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

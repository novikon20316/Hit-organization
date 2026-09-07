// components/DeleteStudentButton.tsx
//
// Small reusable "Delete student" row action for administrative_secretary
// ("administrative coordinator") and grad_school_head's own "Users"/
// "Students List" tabs. Calls the same permanent-erase endpoint system_admin's
// panel.tsx already uses (eraseUser there) — adminController.ts's
// eraseUserBySystemAdmin now also accepts these two roles acting within their
// own scope (isStudentWithinStaffScope), so no separate endpoint was needed.

import React, { useState } from 'react';
import { Pressable, Text, Alert } from 'react-native';
import { apiClient } from '../src/api/apiClient';

interface Props {
  lang: 'he' | 'en';
  studentId: string;
  studentName: string;
  onDeleted: () => void;
  style?: any;
  textStyle?: any;
}

export default function DeleteStudentButton({ lang, studentId, studentName, onDeleted, style, textStyle }: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = () => {
    Alert.alert(
      lang === 'he' ? 'מחיקת סטודנט לצמיתות' : 'Permanently Delete Student',
      lang === 'he'
        ? `הפעולה תמחק לצמיתות את החשבון, הכניסה למערכת והפרופיל האישי של ${studentName}, וכן את ההתראות והבקשות שלו/שלה. אם יש לו/לה פרויקט פעיל, המחיקה תיחסם. לא ניתן לבטל פעולה זו. להמשיך?`
        : `This will permanently delete ${studentName}'s account, login, and personal profile, along with their notifications and applications. Blocked if they have an active project. This cannot be undone. Continue?`,
      [
        { text: lang === 'he' ? 'ביטול' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'he' ? 'מחק לצמיתות' : 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await apiClient.post(`/api/admin/users/${studentId}/erase`);
              onDeleted();
            } catch (e: any) {
              Alert.alert(
                lang === 'he' ? 'שגיאה' : 'Error',
                e.response?.data?.message || (lang === 'he' ? 'מחיקת הסטודנט נכשלה' : 'Failed to delete student')
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Pressable disabled={deleting} onPress={handleDelete} style={style} accessibilityRole="button" accessibilityState={{ disabled: deleting }}>
      <Text style={textStyle}>
        🗑️ {deleting ? (lang === 'he' ? 'מוחק…' : 'Deleting…') : (lang === 'he' ? 'מחק סטודנט' : 'Delete student')}
      </Text>
    </Pressable>
  );
}

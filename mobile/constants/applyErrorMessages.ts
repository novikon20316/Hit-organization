// constants/applyErrorMessages.ts
//
// Maps the exact English rejection messages applyApplication
// (server/src/controllers/applicationController.ts) can return to a
// bilingual string, so the apply modal can show the real reason an
// application was rejected instead of collapsing every non-409 failure into
// one generic "שגיאה בהגשת המועמדות" message (see AUDIT trail: this is what
// hid a track-mismatch 403 from a student who'd picked a track her fixed
// trackPolicy didn't allow). Mirrors web/lib/applyErrorMessages.ts.
import { type Lang } from '@/components/i18n';

const APPLY_ERROR_MESSAGES: Record<string, { he: string; en: string }> = {
  'This project is no longer accepting applications.': {
    he: 'פרויקט זה כבר אינו פתוח להגשות',
    en: 'This project is no longer accepting applications.',
  },
  'This project has already reached its student capacity.': {
    he: 'פרויקט זה הגיע למכסת הסטודנטים המרבית',
    en: 'This project has already reached its student capacity.',
  },
  'This project is not open to your major.': {
    he: 'פרויקט זה אינו פתוח למגמה שלך',
    en: 'This project is not open to your major.',
  },
  'This project is not open to your degree type.': {
    he: 'פרויקט זה אינו פתוח לתואר שלך',
    en: 'This project is not open to your degree type.',
  },
  'This project is not open to your track.': {
    he: 'פרויקט זה אינו פתוח למסלול שלך',
    en: 'This project is not open to your track.',
  },
  'You are not eligible to apply under this track.': {
    he: 'אינך זכאי/ת להגיש מועמדות למסלול זה',
    en: 'You are not eligible to apply under this track.',
  },
  'Invalid track selection for this project.': {
    he: 'בחירת מסלול לא תקינה עבור פרויקט זה',
    en: 'Invalid track selection for this project.',
  },
  'This project offers more than one track — please choose one when applying.': {
    he: 'פרויקט זה מציע יותר ממסלול אחד — יש לבחור מסלול',
    en: 'This project offers more than one track — please choose one when applying.',
  },
  'Transcript and CV must be PDF files.': {
    he: 'גיליון הציונים וקורות החיים חייבים להיות קבצי PDF',
    en: 'Transcript and CV must be PDF files.',
  },
  'Project not found.': {
    he: 'הפרויקט לא נמצא',
    en: 'Project not found.',
  },
};

export function translateApplyError(serverMessage: string | undefined, lang: Lang): string {
  const entry = serverMessage ? APPLY_ERROR_MESSAGES[serverMessage] : undefined;
  if (entry) return entry[lang];
  return lang === 'he' ? 'שגיאה בהגשת המועמדות' : 'Failed to submit application';
}

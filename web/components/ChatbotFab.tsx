'use client';

// components/ChatbotFab.tsx
// Realizes the Stitch design "Academic Assistant: AI Chatbot Overlay" (project
// "Unified Academic Project Manager"): a floating chat panel instead of the
// old "coming soon" tooltip. There is still no AI backend (see server/) —
// replies come from simple local keyword matching, not a model — so the
// assistant only ever answers with pointers into the app itself and never
// claims to read a user's real project data. Mounted once, globally, by
// DashboardShell for every role except system_admin.
//
// mobile/components/ChatbotFab.tsx keeps its own "coming soon" placeholder;
// porting this same overlay to React Native is a separate, larger change.

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { roleLabel, type AppRole } from '@/lib/i18n';

interface ChatbotFabProps {
  corner?: 'bottom-start' | 'bottom-end';
}

interface ChatMessage {
  id: string;
  from: 'assistant' | 'user';
  text: string;
  time: string;
}

const QUICK_ACTIONS: Array<{ en: string; he: string }> = [
  { en: 'Check my next milestone', he: 'מהי אבן הדרך הבאה שלי?' },
  { en: 'Where do I submit files?', he: 'איפה מעלים קבצים?' },
  { en: 'How do I contact my supervisor?', he: 'איך יוצרים קשר עם המנחה?' },
];

function formatTime(date: Date, lang: 'en' | 'he') {
  return date.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' });
}

// Keyword-matched canned replies — the closest thing to "AI" this can
// honestly offer without a real backend. Falls through to a generic pointer
// at the Messages page for anything unrecognized.
function replyTo(text: string, lang: 'en' | 'he'): string {
  const q = text.toLowerCase();
  if (/milestone|deadline|due|אבן|מועד/.test(q)) {
    return lang === 'he'
      ? 'ניתן לראות את אבני הדרך והמועדים הקרובים בעמוד הפרויקט שלך, תחת "אבני דרך".'
      : 'You can see your upcoming milestones and due dates on your project page, under "Milestones".';
  }
  if (/file|upload|submit|document|קובץ|קבצים|להעלות/.test(q)) {
    return lang === 'he'
      ? 'קבצים מועלים דרך עמוד הפרויקט שלך, בלשונית הקבצים של אבן הדרך הרלוונטית.'
      : 'Files are uploaded from your project page, in the file panel for the relevant milestone.';
  }
  if (/supervisor|mentor|contact|email|message|מנחה|קשר|הודעה/.test(q)) {
    return lang === 'he'
      ? 'אפשר ליצור קשר עם המנחה שלך דרך עמוד ההודעות באפליקציה.'
      : 'You can reach your supervisor through the Messages page in the app.';
  }
  return lang === 'he'
    ? 'עדיין אני לומד לענות על שאלות כאלה. לעזרה ממוקדת יותר, נסו את עמוד ההודעות או פנו לרכז שלכם.'
    : "I'm still learning to answer questions like that. For more specific help, try the Messages page or reach out to your coordinator.";
}

// Defaults to the "end" corner — the sidebar (see SidebarShell.tsx) always
// sits at the inline-start edge (right in Hebrew/RTL, left in English/LTR),
// so anchoring this at "end" keeps it on the opposite corner from the menu
// in both languages instead of overlapping it.
export function ChatbotFab({ corner = 'bottom-end' }: ChatbotFabProps) {
  const { lang } = useLanguage();
  const { userData, activeRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useModalA11y(panelRef, isOpen, () => setIsOpen(false));

  // Seed the greeting the first time the panel opens, personalized like the
  // source design ("Hello Supervisor...") once we know who's asking.
  useEffect(() => {
    if (!isOpen || messages.length > 0) return;
    const name = (lang === 'he' ? userData?.displayNameHe : userData?.displayNameEn) || '';
    const role = activeRole ? roleLabel(activeRole as AppRole, lang) : '';
    const greeting =
      lang === 'he'
        ? `שלום${name ? ` ${name}` : role ? ` (${role})` : ''}. אני כאן כדי לעזור עם משימות ניהול הפרויקט שלך.`
        : `Hello${name ? ` ${name}` : role ? `, ${role}` : ''}. I'm here to help with your academic project tasks.`;
    setMessages([{ id: String(nextId.current++), from: 'assistant', text: greeting, time: formatTime(new Date(), lang) }]);
  }, [isOpen, messages.length, lang, userData, activeRole]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight });
  }, [messages, isTyping]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: String(nextId.current++), from: 'user', text: trimmed, time: formatTime(new Date(), lang) }]);
    setDraft('');
    setIsTyping(true);
    // Simulated thinking delay so the reply doesn't feel like a static echo.
    window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: String(nextId.current++), from: 'assistant', text: replyTo(trimmed, lang), time: formatTime(new Date(), lang) },
      ]);
      setIsTyping(false);
    }, 600);
  };

  const isStart = corner === 'bottom-start';

  return (
    <div className={`fixed bottom-8 z-40 ${isStart ? 'start-8' : 'end-8'}`}>
      {isOpen && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="false"
          aria-label={lang === 'he' ? 'עוזר AI אקדמי' : 'Academic AI Assistant'}
          className={`absolute bottom-full mb-3 flex h-[600px] max-h-[calc(100vh-160px)] w-[400px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-chatbot-outline-variant bg-chatbot-surface shadow-xl outline-none ${isStart ? 'start-0' : 'end-0'}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-chatbot-outline-variant bg-chatbot-surface-container-lowest px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chatbot-primary-container text-base">🤖</div>
              <div>
                <h2 className="text-sm font-semibold leading-tight text-chatbot-primary">
                  {lang === 'he' ? 'עוזר AI אקדמי' : 'Academic AI Assistant'}
                </h2>
                <span className="flex items-center gap-1 text-[11px] text-chatbot-on-surface-variant">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {lang === 'he' ? 'מחובר' : 'Online'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label={lang === 'he' ? 'סגור' : 'Close'}
              className="rounded p-1 text-chatbot-on-surface-variant transition-colors hover:text-chatbot-primary"
            >
              ✕
            </button>
          </div>

          {/* Message history */}
          <div ref={historyRef} className="chatbot-scroll flex flex-1 flex-col gap-3 overflow-y-auto bg-chatbot-surface-container-lowest p-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex max-w-[85%] flex-col gap-1 ${m.from === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                <div
                  className={`whitespace-pre-wrap rounded-lg p-2.5 text-sm shadow-sm ${
                    m.from === 'user'
                      ? 'rounded-tr-sm bg-chatbot-primary text-chatbot-on-primary'
                      : 'rounded-tl-sm border border-chatbot-outline-variant/50 bg-chatbot-surface-container-low text-chatbot-on-surface'
                  }`}
                >
                  {m.text}
                </div>
                <span className="px-1 text-[11px] text-chatbot-on-surface-variant/70">{m.time}</span>
              </div>
            ))}
            {isTyping && (
              <div className="flex max-w-[85%] items-center gap-1 self-start rounded-lg rounded-tl-sm border border-chatbot-outline-variant/50 bg-chatbot-surface-container-low px-3 py-2.5 text-chatbot-on-surface-variant shadow-sm">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-chatbot-on-surface-variant [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-chatbot-on-surface-variant [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-chatbot-on-surface-variant" />
              </div>
            )}
          </div>

          {/* Quick action pills */}
          <div className="chatbot-scroll flex gap-2 overflow-x-auto whitespace-nowrap border-t border-chatbot-outline-variant/30 bg-chatbot-surface-container-lowest px-4 py-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.en}
                type="button"
                onClick={() => send(lang === 'he' ? action.he : action.en)}
                className="shrink-0 rounded-full border border-chatbot-outline-variant px-3 py-1.5 text-xs text-chatbot-on-surface-variant transition-colors hover:bg-chatbot-surface-container hover:text-chatbot-primary"
              >
                {lang === 'he' ? action.he : action.en}
              </button>
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2 border-t border-chatbot-outline-variant bg-chatbot-surface p-3"
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              dir={lang === 'he' ? 'rtl' : 'ltr'}
              placeholder={lang === 'he' ? 'שאלו על פרויקטים, ציונים או דוחות...' : 'Ask about projects, grades, or reports...'}
              className="flex-1 rounded-lg border border-chatbot-outline-variant bg-chatbot-surface-container-lowest px-3 py-2 text-sm text-chatbot-on-surface placeholder:text-chatbot-on-surface-variant/60 focus:border-chatbot-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label={lang === 'he' ? 'שלח' : 'Send'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-chatbot-primary text-chatbot-on-primary shadow-sm transition-colors hover:bg-chatbot-primary-container disabled:opacity-40"
            >
              ➤
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl shadow-lg hover:bg-primary-hover"
        aria-label={lang === 'he' ? 'עוזר AI' : 'AI Assistant'}
        aria-expanded={isOpen}
      >
        {isOpen ? '✕' : '🤖'}
      </button>
    </div>
  );
}

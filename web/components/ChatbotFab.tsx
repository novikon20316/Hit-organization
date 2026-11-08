'use client';

// components/ChatbotFab.tsx
// Realizes the Stitch design "Academic Assistant: AI Chatbot Overlay" (project
// "Unified Academic Project Manager"): a floating help-chat panel. Answers
// come from POST /api/assistant/ask (server's assistantService.ts), which
// answers only from the user manual of the role the user is viewing as — it
// is never given the user's projects, grades or other data, and nothing is
// stored server-side; the conversation lives only in this component. Mounted
// once, globally, by DashboardShell for every role except system_admin.
//
// mobile/app/chatbot.tsx is the full-screen counterpart, calling the same
// endpoint.

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModalA11y } from '@/hooks/useModalA11y';
import { roleLabel, type AppRole } from '@/lib/i18n';
import { apiClient, ApiError } from '@/lib/apiClient';

interface ChatbotFabProps {
  corner?: 'bottom-start' | 'bottom-end';
}

interface ChatMessage {
  id: string;
  from: 'assistant' | 'user';
  text: string;
  time: string;
  /** Shown here only, never sent to the server: the greeting, error notices,
   *  and a question whose request failed (so the history the server gets
   *  keeps alternating user/assistant turns). */
  local?: boolean;
}

type QuickAction = { en: string; he: string };

const QUICK_ACTIONS_BY_ROLE: Partial<Record<AppRole, QuickAction[]>> = {
  student: [
    { en: 'How do I submit a milestone?', he: 'איך מגישים אבן דרך?' },
    { en: 'How do I apply to a project?', he: 'איך מגישים מועמדות לפרויקט?' },
    { en: 'Where do I see my grades?', he: 'איפה רואים את הציונים?' },
  ],
  supervisor: [
    { en: 'How do I grade a submission?', he: 'איך נותנים ציון להגשה?' },
    { en: 'How do I approve an application?', he: 'איך מאשרים מועמדות?' },
    { en: 'How do I update a grade?', he: 'איך מעדכנים ציון?' },
  ],
};

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { en: 'What can I do in my role?', he: 'מה אפשר לעשות בתפקיד שלי?' },
  { en: 'Where do I approve requests?', he: 'איפה מאשרים בקשות?' },
  { en: 'Where are the reports?', he: 'איפה נמצאים הדוחות?' },
];

const MAX_QUESTION_CHARS = 1000;
/** Server cap is 12 turns; send the latest 11 so the history still starts
 *  (and ends) with a user question. */
const MAX_HISTORY_TURNS = 11;

function formatTime(date: Date, lang: 'en' | 'he') {
  return date.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' });
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
        ? `שלום${name ? ` ${name}` : role ? ` (${role})` : ''}. אפשר לשאול אותי איך עושים דברים במערכת — אני עונה לפי מדריך המשתמש של התפקיד שלך.`
        : `Hello${name ? ` ${name}` : role ? `, ${role}` : ''}. Ask me how to do things in the system — I answer from the user manual for your role.`;
    setMessages([{ id: String(nextId.current++), from: 'assistant', text: greeting, time: formatTime(new Date(), lang), local: true }]);
  }, [isOpen, messages.length, lang, userData, activeRole]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight });
  }, [messages, isTyping]);

  const send = async (text: string) => {
    const trimmed = text.trim().slice(0, MAX_QUESTION_CHARS);
    if (!trimmed || isTyping) return;
    const userMessage: ChatMessage = { id: String(nextId.current++), from: 'user', text: trimmed, time: formatTime(new Date(), lang) };
    const history = [...messages.filter((m) => !m.local), userMessage]
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({ role: m.from, content: m.text }));
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setIsTyping(true);
    try {
      if (!activeRole) throw new Error('no active role');
      const { answer } = await apiClient.askAssistant(activeRole, history);
      setMessages((prev) => [...prev, { id: String(nextId.current++), from: 'assistant', text: answer, time: formatTime(new Date(), lang) }]);
    } catch (err) {
      const notice =
        err instanceof ApiError && err.message
          ? err.message
          : lang === 'he' ? 'העוזר אינו זמין כרגע. נסו שוב מאוחר יותר.' : 'The assistant is unavailable right now. Please try again later.';
      setMessages((prev) => [
        ...prev.map((m) => (m.id === userMessage.id ? { ...m, local: true } : m)),
        { id: String(nextId.current++), from: 'assistant', text: notice, time: formatTime(new Date(), lang), local: true },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const quickActions = (activeRole && QUICK_ACTIONS_BY_ROLE[activeRole as AppRole]) || DEFAULT_QUICK_ACTIONS;

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
            {quickActions.map((action) => (
              <button
                key={action.en}
                type="button"
                onClick={() => send(lang === 'he' ? action.he : action.en)}
                disabled={isTyping}
                className="shrink-0 rounded-full border border-chatbot-outline-variant px-3 py-1.5 text-xs text-chatbot-on-surface-variant transition-colors hover:bg-chatbot-surface-container hover:text-chatbot-primary disabled:opacity-50"
              >
                {lang === 'he' ? action.he : action.en}
              </button>
            ))}
          </div>

          <p className="border-t border-chatbot-outline-variant/30 bg-chatbot-surface-container-lowest px-4 pt-2 text-[11px] leading-snug text-chatbot-on-surface-variant">
            {lang === 'he'
              ? 'התשובות נוצרות בבינה מלאכותית (Anthropic) לפי מדריך המשתמש, וייתכנו טעויות. העוזר אינו רואה את הנתונים שלך — אל תכתבו פרטים אישיים.'
              : "Answers are AI-generated (Anthropic) from the user manual and may contain mistakes. The assistant can't see your data — don't type personal details."}
          </p>

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
              maxLength={MAX_QUESTION_CHARS}
              placeholder={lang === 'he' ? 'איך עושים...?' : 'How do I...?'}
              aria-label={lang === 'he' ? 'שאלה לעוזר' : 'Question for the assistant'}
              className="flex-1 rounded-lg border border-chatbot-outline-variant bg-chatbot-surface-container-lowest px-3 py-2 text-sm text-chatbot-on-surface placeholder:text-chatbot-on-surface-variant/60 focus:border-chatbot-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || isTyping}
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

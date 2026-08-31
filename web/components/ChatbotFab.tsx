'use client';

// components/ChatbotFab.tsx
// Ported from mobile/components/ChatbotFab.tsx — genuinely just a "coming
// soon" placeholder on mobile too (no chatbot logic exists on either
// client or server yet). Mounted once, globally, by DashboardShell for
// every role except system_admin.

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ChatbotFabProps {
  corner?: 'bottom-start' | 'bottom-end';
}

// Defaults to the "end" corner — the sidebar (see SidebarShell.tsx) always
// sits at the inline-start edge (right in Hebrew/RTL, left in English/LTR),
// so anchoring this at "end" keeps it on the opposite corner from the menu
// in both languages instead of overlapping it.
export function ChatbotFab({ corner = 'bottom-end' }: ChatbotFabProps) {
  const { lang } = useLanguage();
  const [showMessage, setShowMessage] = useState(false);

  return (
    <div className={`fixed bottom-8 z-40 ${corner === 'bottom-start' ? 'start-8' : 'end-8'}`}>
      {showMessage && (
        <div className="absolute bottom-full mb-2 w-56 rounded-lg border border-line bg-surface p-3 text-xs text-ink shadow-lg">
          {lang === 'he' ? 'העוזר החכם יגיע בקרוב.' : 'The AI assistant is coming soon.'}
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowMessage((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl shadow-lg hover:bg-primary-hover"
        aria-label={lang === 'he' ? 'עוזר AI' : 'AI Assistant'}
      >
        🤖
      </button>
    </div>
  );
}

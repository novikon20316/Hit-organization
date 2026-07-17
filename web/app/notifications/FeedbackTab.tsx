'use client';

// app/notifications/FeedbackTab.tsx
// Ported from mobile/components/FeedbackChat.tsx.

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';

interface FeedbackMessage {
  id: string;
  text: string;
  classification: 'pending' | 'real' | 'noise';
  status: 'open' | 'resolved' | null;
  createdAt: string | null;
}

export function FeedbackTab() {
  const { lang } = useLanguage();
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = async () => {
    try {
      const res = await apiClient.getMyFeedback();
      setMessages(res.messages ?? []);
    } catch (err) {
      console.error('Failed to load feedback messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchMessages' setState calls happen after its awaited network call resolves, not synchronously in this effect
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 10_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await apiClient.submitFeedback(trimmed);
      await fetchMessages();
    } catch (err) {
      console.error('Failed to send feedback:', err);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col">
      <p className="mb-4 rounded-lg bg-paper p-3 text-sm text-ink">
        {lang === 'he'
          ? '💬 שתפו תקלות, בקשות לפיצ׳רים או כל משוב שיעזור לנו לשפר את האפליקציה. הודעות שאינן רלוונטיות יימחקו אוטומטית.'
          : '💬 Share bugs, feature requests, or any feedback that could improve the app. Irrelevant messages are erased automatically.'}
      </p>

      {loading ? (
        <p className="text-center text-sm text-muted">…</p>
      ) : messages.length === 0 ? (
        <p className="text-center text-sm text-muted">💬 {lang === 'he' ? 'אין הודעות עדיין' : 'No messages yet'}</p>
      ) : (
        <div className="grid gap-2">
          {messages.map((m) => (
            <div key={m.id} className="rounded-lg bg-paper p-3">
              <p className="text-sm text-ink">{m.text}</p>
              {m.classification === 'real' && (
                <p className="mt-1 text-xs font-medium text-primary">
                  {m.status === 'resolved' ? (lang === 'he' ? '✅ טופל' : '✅ Resolved') : lang === 'he' ? '📨 נשלח לצוות' : '📨 Sent to the team'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={lang === 'he' ? 'כתבו הודעה...' : 'Type a message...'}
          rows={2}
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="rounded-lg bg-primary px-4 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {sending ? '…' : '➤'}
        </button>
      </div>
    </div>
  );
}

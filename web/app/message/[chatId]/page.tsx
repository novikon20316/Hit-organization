'use client';

// app/message/[chatId]/page.tsx
// Ported from mobile/app/message/[chatId].tsx.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getRoleAccent } from '@/lib/facultyColors';

interface Message {
  id: string;
  type: 'text' | 'image';
  text: string;
  imageUrl: string | null;
  senderId: string;
  createdAt: string | null;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isMoreThan5MinApart(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) > 5 * 60 * 1000;
}

export default function ChatConversationPage() {
  const router = useRouter();
  const params = useParams<{ chatId: string }>();
  const searchParams = useSearchParams();
  const { firebaseUser } = useAuth();
  const { lang } = useLanguage();
  const chatId = params.chatId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Before this flips false, a zero-length messages array is ambiguous
  // (real empty chat vs. still loading vs. a failed fetch) — without it,
  // any of those three rendered the same "No messages yet, say hi!" empty
  // state, self-correcting silently on the next 3s poll at best.
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [headerName, setHeaderName] = useState(searchParams.get('otherName') ?? '');
  const [headerRole, setHeaderRole] = useState(searchParams.get('otherRole') ?? '');
  const listRef = useRef<HTMLDivElement>(null);
  // Tracks the newest message already held locally so subsequent polls can
  // ask the server for only what's new (see apiClient.getChatMessages) —
  // a ref, not state, since it's read/written inside the poll loop without
  // needing to trigger a re-render itself.
  const lastMessageTimeRef = useRef<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!chatId) return;
    try {
      const since = lastMessageTimeRef.current ?? undefined;
      const res = await apiClient.getChatMessages(chatId, since);
      const incoming = Array.isArray(res) ? res : [];
      if (incoming.length > 0) {
        lastMessageTimeRef.current = incoming[incoming.length - 1]!.createdAt ?? lastMessageTimeRef.current;
      }
      setMessages((prev) => {
        if (!since) return incoming; // initial load — replace outright
        if (incoming.length === 0) return prev; // steady-state poll, nothing new
        const seen = new Set(prev.map((m) => m.id));
        const deduped = incoming.filter((m) => !seen.has(m.id));
        return deduped.length > 0 ? [...prev, ...deduped] : prev;
      });
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, [chatId]);

  useEffect(() => {
    // Reset the incremental cursor + any previous chat's messages before
    // the first fetch for a (possibly) new chatId — without this, merging
    // would apply the OLD chat's cursor/messages to the new one if this
    // component instance is reused across navigations instead of remounted.
    lastMessageTimeRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting for a (possibly) new chatId before the fetch below runs
    setMessages([]);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setLoadingMessages(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling on mount; fetchMessages' setState calls happen after its awaited network call resolves, not synchronously in this effect
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (headerName || !chatId) return;
    apiClient
      .getChatMeta(chatId)
      .then((meta) => {
        const other = meta.participants?.find((p) => p.id !== firebaseUser?.uid);
        if (other) {
          setHeaderName(other.name ?? 'Unknown');
          setHeaderRole(other.role ?? '');
        }
      })
      .catch((err) => console.error('Failed to look up chat metadata:', err));
  }, [chatId, firebaseUser, headerName]);

  useEffect(() => {
    if (!chatId) return;
    apiClient.markChatRead(chatId).catch(() => {});
  }, [chatId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || !firebaseUser || sending) return;
    setSending(true);
    setText('');
    try {
      await apiClient.sendChatMessage(chatId, trimmed, firebaseUser.uid);
      await fetchMessages();
    } catch (err) {
      console.error('Send message error:', err);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handlePickImage = () => fileInputRef.current?.click();

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file || !chatId || uploadingImage) return;
    setUploadingImage(true);
    try {
      const imageUrl = await apiClient.uploadChatImage(file);
      await apiClient.sendChatImageMessage(chatId, imageUrl);
      await fetchMessages();
    } catch (err) {
      console.error('Send image error:', err);
    } finally {
      setUploadingImage(false);
    }
  };

  const initialsOf = headerName
    ? headerName
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';
  const accentColor = getRoleAccent(headerRole);

  return (
    <div className="flex h-screen flex-col bg-paper">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <button type="button" onClick={() => router.back()} className="text-lg text-ink">
          {lang === 'he' ? '→' : '←'}
        </button>
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: accentColor }}>
          {initialsOf}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{headerName || '…'}</p>
          {headerRole && (
            <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${accentColor}22`, color: accentColor }}>
              {headerRole.replace('_', ' ')}
            </span>
          )}
        </div>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted">{lang === 'he' ? 'טוען…' : 'Loading…'}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-3xl">💬</p>
            <p className="mt-2 text-sm text-muted">{lang === 'he' ? 'אין הודעות עדיין. אמור שלום!' : 'No messages yet. Say hi!'}</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-1">
            {messages.map((item, index) => {
              const mine = item.senderId === firebaseUser?.uid;
              const prev = messages[index - 1];
              const showTime = !prev || isMoreThan5MinApart(item.createdAt, prev.createdAt);
              return (
                <div key={item.id}>
                  {showTime && item.createdAt && <p className="my-2 text-center text-xs text-muted">{formatTime(item.createdAt)}</p>}
                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    {item.type === 'image' && item.imageUrl ? (
                      <button
                        type="button"
                        onClick={() => setViewerUrl(item.imageUrl)}
                        className={`max-w-[75%] overflow-hidden rounded-2xl p-1 text-sm ${mine ? 'bg-primary' : 'bg-surface'}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary URL, not a local asset */}
                        <img src={item.imageUrl} alt="" className="max-h-72 w-full rounded-xl object-cover" />
                        {item.text && <p className={`px-2 py-1.5 text-left ${mine ? 'text-primary-ink' : 'text-ink'}`}>{item.text}</p>}
                      </button>
                    ) : (
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-primary text-primary-ink' : 'bg-surface text-ink'}`}>{item.text}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-line bg-surface p-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelected} className="hidden" />
          <button
            type="button"
            onClick={handlePickImage}
            disabled={uploadingImage}
            aria-label={lang === 'he' ? 'שלח תמונה' : 'Send an image'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-ink hover:bg-paper disabled:opacity-40"
          >
            {uploadingImage ? '…' : '📎'}
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={lang === 'he' ? 'כתוב הודעה...' : 'Write a message…'}
            rows={1}
            maxLength={4000}
            className="flex-1 resize-none rounded-lg border border-line bg-paper px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!text.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink hover:bg-primary-hover disabled:opacity-40"
          >
            {sending ? '…' : '➤'}
          </button>
        </div>
      </div>

      {viewerUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6"
          onClick={() => setViewerUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary URL, not a local asset */}
          <img src={viewerUrl} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </div>
  );
}

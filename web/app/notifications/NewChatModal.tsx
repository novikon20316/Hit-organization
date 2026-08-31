'use client';

// app/notifications/NewChatModal.tsx
// Ported from mobile/app/message/new.tsx.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { getRoleAccent, withAlpha } from '@/lib/facultyColors';

interface CandidateUser {
  id: string;
  name: string;
  email: string;
  role: string;
  facultyId: string;
}

interface NewChatModalProps {
  existingChatIds: Set<string>;
  onClose: () => void;
  onChatCreated: (chatId: string, otherName: string, otherRole: string) => void;
}

function noContactsText(role: string, lang: 'he' | 'en'): string {
  if (role === 'student') return lang === 'he' ? 'יש להגיש מועמדות לפרויקט תחילה כדי לשוחח עם מנחה.' : 'Apply to a project first to chat with a supervisor.';
  if (role === 'supervisor') return lang === 'he' ? 'עדיין לא הוגשו מועמדויות לפרויקטים שלך.' : 'No students have applied to your projects yet.';
  return lang === 'he' ? 'לא נמצאו אנשי קשר.' : 'No contacts found.';
}

export function NewChatModal({ existingChatIds, onClose, onChatCreated }: NewChatModalProps) {
  const { lang } = useLanguage();
  const [myRole, setMyRole] = useState('');
  const [candidates, setCandidates] = useState<CandidateUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [mode, setMode] = useState<'chat' | 'broadcast'>('chat');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastResult, setBroadcastResult] = useState('');
  const [error, setError] = useState('');
  // Distinct from "genuinely no contacts" — a failed fetch used to leave
  // myRole/candidates at their empty defaults with no indication anything
  // went wrong, so the UI showed a plausible-sounding "no contacts" message
  // (e.g. the student-specific "apply to a project first" copy) instead of
  // a real network/server error.
  const [loadError, setLoadError] = useState('');
  const mountedRef = useRef(true);

  const loadCandidates = () => {
    setLoading(true);
    setLoadError('');
    apiClient
      .getChatCandidates()
      .then((res) => {
        if (!mountedRef.current) return;
        setMyRole(res.myRole ?? '');
        setCandidates(res.candidates ?? []);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setLoadError(err instanceof Error ? err.message : lang === 'he' ? 'טעינת אנשי הקשר נכשלה' : 'Failed to load contacts');
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    loadCandidates();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount only; loadCandidates closes over lang for its error message, re-running it on every language toggle isn't needed
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const visible = candidates.filter((c) => !existingChatIds.has(c.id));
    return q ? visible.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : visible;
  }, [candidates, search, existingChatIds]);

  const canBroadcast = myRole === 'system_admin' || myRole === 'faculty_admin';

  const handleSelectUser = async (other: CandidateUser) => {
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const res = await apiClient.findOrCreateDirectChat(other.id);
      onChatCreated(res.chatId, other.name, other.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the conversation');
    } finally {
      setCreating(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMsg.trim()) {
      setError(lang === 'he' ? 'יש למלא כותרת והודעה' : 'Please fill in both title and message.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await apiClient.sendChatBroadcast({ title: broadcastTitle.trim(), message: broadcastMsg.trim() });
      setBroadcastResult(lang === 'he' ? `✅ נשלח ל-${res.count} נמענים` : `✅ Delivered to ${res.count} recipients`);
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Broadcast failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius)] bg-surface shadow-lg">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="text-base font-semibold text-ink">{lang === 'he' ? 'הודעה חדשה' : 'New Message'}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        {canBroadcast && (
          <div className="flex gap-1 border-b border-line p-2">
            {(['chat', 'broadcast'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${mode === m ? 'bg-primary text-primary-ink' : 'text-muted'}`}
              >
                {m === 'chat' ? `💬 ${lang === 'he' ? 'ישיר' : 'Direct'}` : `📢 ${lang === 'he' ? 'שידור' : 'Broadcast'}`}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'broadcast' ? (
            <div className="grid gap-3">
              <p className="text-xs text-muted">
                {myRole === 'system_admin'
                  ? lang === 'he' ? 'שליחה לכל המשתמשים במערכת' : 'Send to all users in the system'
                  : lang === 'he' ? 'שליחה לכל המשתמשים בפקולטה שלך' : 'Send to all users in your faculty'}
              </p>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת' : 'Title'}</span>
                <input
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder={lang === 'he' ? 'לדוגמה: תחזוקת מערכת' : 'e.g. System Maintenance'}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'הודעה' : 'Message'}</span>
                <textarea
                  rows={4}
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder={lang === 'he' ? 'כתוב את הודעת השידור כאן...' : 'Write your broadcast message here...'}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none"
                />
              </label>
              {broadcastResult && <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success" role="status">{broadcastResult}</p>}
              {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
              <button
                type="button"
                onClick={handleBroadcast}
                disabled={creating}
                className="rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
              >
                {creating ? '…' : `📢 ${lang === 'he' ? 'שלח שידור' : 'Send Broadcast'}`}
              </button>
            </div>
          ) : (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={lang === 'he' ? 'חפש לפי שם או אימייל...' : 'Search by name or email…'}
                className="mb-3 w-full rounded-lg border border-line bg-paper px-3.5 py-2 text-sm text-ink focus:border-primary focus:outline-none"
              />
              {error && <p className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
              {loadError && (
                <div className="mb-3 flex items-center justify-between rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
                  <span>⚠️ {loadError}</span>
                  <button type="button" onClick={loadCandidates} className="font-medium underline">
                    {lang === 'he' ? 'נסה שוב' : 'Retry'}
                  </button>
                </div>
              )}

              {loading ? (
                <p className="text-center text-sm text-muted">…</p>
              ) : loadError ? null : filtered.length === 0 ? (
                <p className="text-center text-sm text-muted">{candidates.length === 0 ? noContactsText(myRole, lang) : lang === 'he' ? 'אין תוצאות' : 'No users match your search'}</p>
              ) : (
                <div className="grid gap-1.5">
                  {filtered.map((u) => {
                    const color = getRoleAccent(u.role);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        disabled={creating}
                        onClick={() => handleSelectUser(u)}
                        className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2 text-start hover:border-primary disabled:opacity-60"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: color }}>
                          {u.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{u.name}</span>
                          <span className="block truncate text-xs text-muted" dir="ltr">
                            {u.email}
                          </span>
                        </span>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: withAlpha(color, 0.12), color }}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

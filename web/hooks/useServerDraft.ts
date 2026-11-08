'use client';

// hooks/useServerDraft.ts
// E3 — autosaves an examiner's unsent form on the server, private to them
// (server/src/services/formDrafts.ts: internal examiners by account,
// external ones by their access link after the email code), so closing the
// tab or switching device loses nothing. Restores the draft when the form
// opens, saves 2s after the last change, and the form calls clear() after a
// successful submit. Drafts expire after 60 days.
//
// Only plain fields go in a draft — never files (attachments are re-picked).

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/apiClient';

export const examinerDraftPath = (milestoneId: string, formKey: string) =>
  `/api/examiner/drafts/${encodeURIComponent(milestoneId)}/${formKey}`;
export const externalDraftPath = (token: string, formKey: string) =>
  `/api/examiner-access/${encodeURIComponent(token)}/drafts/${formKey}`;

const SAVE_DELAY_MS = 2000;
// After clear(), the form usually reloads its submitted values — treat
// whatever it settles on in this window as the new baseline, not a draft.
const REBASE_WINDOW_MS = 3000;

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * @param path    examinerDraftPath/externalDraftPath, or null to disable
 *                (e.g. the viewer can't edit this form)
 * @param value   the form's current draftable fields
 * @param restore applies a restored draft to the form
 * @param ready   false until the form has its initial values
 */
export function useServerDraft<T>(path: string | null, value: T, restore: (data: T) => void, ready = true) {
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [status, setStatus] = useState<DraftStatus>('idle');
  const json = JSON.stringify(value);
  const jsonRef = useRef(json);
  const restoreRef = useRef(restore);
  useEffect(() => {
    jsonRef.current = json;
    restoreRef.current = restore;
  });

  // JSON of the last value known to be on the server (or the untouched form).
  const lastSaved = useRef<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const rebaseUntil = useRef(0);

  useEffect(() => {
    // A closed form (path null) reloads its draft next time it opens.
    if (!path) loadedFor.current = null;
    if (!path || !ready || loadedFor.current === path) return;
    loadedFor.current = path;
    const baseline = jsonRef.current;
    lastSaved.current = null;
    apiClient.get<{ draft: { data: T; updatedAt: string } | null }>(path)
      .then(({ draft }) => {
        if (loadedFor.current !== path) return;
        // Don't clobber anything typed while the draft was loading.
        if (draft && jsonRef.current === baseline) {
          restoreRef.current(draft.data);
          setRestoredAt(draft.updatedAt);
          lastSaved.current = JSON.stringify(draft.data);
        } else {
          lastSaved.current = baseline;
        }
      })
      .catch(() => {
        lastSaved.current = baseline;
      });
  }, [path, ready]);

  // A change waiting out the debounce — flushed if the form closes first.
  const pending = useRef<{ path: string; json: string } | null>(null);
  const send = useCallback((p: string, j: string) => {
    pending.current = null;
    lastSaved.current = j;
    setStatus('saving');
    apiClient.put(p, { data: JSON.parse(j) })
      .then(() => setStatus('saved'))
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    if (!path || lastSaved.current === null || json === lastSaved.current) return;
    if (Date.now() < rebaseUntil.current) {
      lastSaved.current = json;
      return;
    }
    pending.current = { path, json };
    const timer = setTimeout(() => send(path, json), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [path, json, send]);

  useEffect(() => () => {
    if (pending.current?.path === path) send(pending.current.path, pending.current.json);
  }, [path, send]);

  /** After a successful submit — the draft has served its purpose. */
  const clear = useCallback(() => {
    if (!path) return;
    pending.current = null;
    lastSaved.current = jsonRef.current;
    rebaseUntil.current = Date.now() + REBASE_WINDOW_MS;
    setRestoredAt(null);
    setStatus('idle');
    apiClient.delete(path).catch(() => {});
  }, [path]);

  return { restoredAt, status, clear };
}

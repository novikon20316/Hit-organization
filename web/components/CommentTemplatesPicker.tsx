'use client';

// components/CommentTemplatesPicker.tsx
// The grader's own saved feedback snippets (server
// commentTemplatesController.ts — personal, nobody else sees them). Sits
// next to a comment box: pick one to append it to the comment (still
// editable before sending), save the current comment as a new one, or
// delete one.

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient, type CommentTemplate } from '@/lib/apiClient';

interface CommentTemplatesPickerProps {
  currentText: string;
  onInsert: (text: string) => void;
}

export function CommentTemplatesPicker({ currentText, onInsert }: CommentTemplatesPickerProps) {
  const { lang } = useLanguage();
  const he = lang === 'he';
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<CommentTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || templates) return;
    apiClient.getCommentTemplates()
      .then((r) => setTemplates(r.templates))
      .catch(() => setError(he ? 'טעינת ההערות השמורות נכשלה' : 'Failed to load saved comments'));
  }, [open, templates, he]);

  const save = async (next: CommentTemplate[]) => {
    setBusy(true);
    setError('');
    try {
      const r = await apiClient.updateCommentTemplates(next);
      setTemplates(r.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : he ? 'השמירה נכשלה' : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const text = currentText.trim();
  const alreadySaved = !!templates?.some((t) => t.text === text);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary"
      >
        📋 {he ? 'הערות שמורות' : 'Saved comments'}
      </button>
      {open && (
        <div className="absolute end-0 z-10 mt-1 w-72 rounded-md border border-line bg-surface p-2 shadow-lg">
          {!templates ? (
            <p className="p-2 text-xs text-muted" role={error ? 'alert' : 'status'}>{error || (he ? 'טוען…' : 'Loading…')}</p>
          ) : (
            <>
              {templates.length === 0 && (
                <p className="p-2 text-xs text-muted">{he ? 'עוד אין הערות שמורות. כתבו הערה ושמרו אותה כאן.' : 'No saved comments yet. Write one and save it here.'}</p>
              )}
              <ul className="max-h-56 overflow-y-auto">
                {templates.map((t) => (
                  <li key={t.id} className="flex items-start gap-1 rounded hover:bg-paper">
                    <button
                      type="button"
                      onClick={() => { onInsert(t.text); setOpen(false); }}
                      className="min-w-0 flex-1 px-2 py-1.5 text-start text-xs text-ink"
                      title={t.text}
                    >
                      <span className="line-clamp-2">{t.text}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => save(templates.filter((x) => x.id !== t.id))}
                      disabled={busy}
                      aria-label={he ? 'מחק הערה שמורה' : 'Delete saved comment'}
                      className="px-1.5 py-1.5 text-xs text-muted hover:text-danger disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => save([...templates, { id: '', text }])}
                disabled={busy || !text || alreadySaved || templates.length >= 30}
                className="mt-1 w-full rounded-md border border-line px-2 py-1.5 text-xs font-medium text-ink hover:border-primary disabled:opacity-50"
              >
                ＋ {he ? 'שמור את ההערה הנוכחית' : 'Save the current comment'}
              </button>
              {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

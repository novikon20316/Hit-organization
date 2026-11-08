// src/services/assistantDocuments.ts
//
// S6 — lets the help assistant answer a student from their faculty's general
// procedure documents (admin Info Files), not only the role manual. Only
// files every student in that faculty/degree/major/track can already open —
// never project-scoped files — so what goes into the prompt is public
// procedure text, never anything about the student (decided 2026-11-08).
// The student's own record is used only to choose which public files apply.
//
// Extracted text is cached in infoFileTexts/{fileId} (server-only — no
// Firestore rule) and re-extracted when the file is replaced.

// @ts-ignore — word-extractor ships no type definitions.
import WordExtractor from 'word-extractor';
import pdfParse from 'pdf-parse';
import { db } from '../config/firebase.js';
import { resolveEffectiveTrack } from '../config/studentTrack.js';

const CACHE = 'infoFileTexts';
const MAX_DOC_CHARS = 15_000;
const MAX_TOTAL_CHARS = 40_000;
const MAX_FILES = 6;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export interface AssistantDocument {
  title: string;
  text: string;
}

async function extractText(fileUrl: string, fileName: string, mimeType: string): Promise<string> {
  const lower = `${fileName} ${fileUrl.split('?')[0]}`.toLowerCase();
  const isPdf = mimeType === 'application/pdf' || lower.includes('.pdf');
  const isWord = /\.(docx?)\b/.test(lower) || mimeType.includes('word');
  if (!isPdf && !isWord) return '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  let buffer: Buffer;
  try {
    const res = await fetch(fileUrl, { signal: controller.signal });
    if (!res.ok) return '';
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_DOWNLOAD_BYTES) return '';
    buffer = Buffer.from(ab);
  } finally {
    clearTimeout(timeout);
  }
  if (isPdf) return ((await pdfParse(buffer)).text ?? '').trim();
  const doc = await new WordExtractor().extract(buffer);
  return String(doc.getBody() ?? '').trim();
}

async function cachedText(fileId: string, fileUrl: string, fileName: string, mimeType: string): Promise<string> {
  const ref = db.collection(CACHE).doc(fileId);
  const cached = (await ref.get()).data();
  if (cached && cached.fileUrl === fileUrl) return cached.text ?? '';
  let text = '';
  try {
    text = (await extractText(fileUrl, fileName, mimeType)).slice(0, MAX_DOC_CHARS);
  } catch (err) {
    console.warn('assistant document extraction failed:', fileId, err);
  }
  // Cache failures too (empty text), so a broken file isn't re-fetched on
  // every question; replacing the file changes fileUrl and retries.
  await ref.set({ fileUrl, text, extractedAt: new Date() });
  return text;
}

/** The general (non-project) Info Files this student can see, as text. */
export async function studentAssistantDocuments(uid: string, lang: 'he' | 'en'): Promise<AssistantDocument[]> {
  const student = (await db.collection('users').doc(uid).get()).data();
  if (!student) return [];
  const track = resolveEffectiveTrack(student);
  const snap = await db.collection('infoFiles').orderBy('createdAt', 'desc').get();
  const matching = snap.docs.filter((d) => {
    const f = d.data();
    const has = (list: unknown, value: unknown) => !Array.isArray(list) || list.length === 0 || list.includes(value);
    return f.isVisible !== false
      && !(Array.isArray(f.projectIds) && f.projectIds.length > 0)
      && has(f.facultyIds, student.facultyId)
      && has(f.majors, student.major)
      && has(f.degreeTypes, student.degreeType)
      && has(f.trackTypes, track);
  }).slice(0, MAX_FILES);

  const docs: AssistantDocument[] = [];
  let total = 0;
  for (const d of matching) {
    const f = d.data();
    if (!f.fileUrl) continue;
    const text = await cachedText(d.id, f.fileUrl, f.fileName ?? '', f.mimeType ?? '');
    if (!text) continue;
    const room = MAX_TOTAL_CHARS - total;
    if (room <= 500) break;
    const title = (lang === 'en' ? f.titleEn || f.titleHe : f.titleHe || f.titleEn) || f.fileName || '';
    docs.push({ title, text: text.slice(0, room) });
    total += Math.min(text.length, room);
  }
  return docs;
}

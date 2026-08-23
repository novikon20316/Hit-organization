'use client';

// app/info-files/page.tsx
// Ported from mobile/app/Info-files.tsx — upload form + existing-files list
// with delete. The read side students see already exists at
// app/student/home/InfoScreen.tsx, calling the same GET /api/info-files.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { useRequireRole } from '@/hooks/useRequireRole';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiClient } from '@/lib/apiClient';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { VALID_FACULTY_IDS, type AppRole } from '@/lib/roles';
import { facultyLabel, type FacultyId } from '@/lib/i18n';
import { majorsForFaculty, degreeLevelsForFaculty } from '@/lib/permissions';
import { HIT_FACULTIES, stripDegreePrefix } from '@/lib/faculties';

const INFO_FILE_ROLES: AppRole[] = ['system_admin', 'coordinator', 'supervisor'];
// A supervisor has no faculty-wide authority — they can only ever attach a
// file to specific project(s) of their own. coordinator/system_admin choose
// between that and today's faculty/major/degree-wide scoping.
const PROJECT_ONLY_ROLES: AppRole[] = ['supervisor'];

interface ProjectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface MilestoneTypeOption {
  type: string;
  labelHe: string;
  labelEn: string;
}
const SELECTABLE_FACULTIES = VALID_FACULTY_IDS.filter((id) => id !== 'all');
// majorsForFaculty() already dedupes-by-slug and strips the degree prefix
// (see lib/permissions.ts) — reused here instead of a local re-implementation
// so a master's program sharing a slug with a bachelor's one (e.g. Computer
// Science) isn't silently shadowed.
const ALL_MAJORS = (() => {
  const seen = new Set<string>();
  const out: { slug: string; label: Record<'he' | 'en', string> }[] = [];
  for (const faculty of HIT_FACULTIES) {
    for (const m of majorsForFaculty(faculty.key)) {
      if (seen.has(m.slug)) continue;
      seen.add(m.slug);
      out.push(m);
    }
  }
  return out;
})();
interface InfoFile {
  id: string;
  titleHe: string;
  titleEn: string;
  fileUrl: string;
  fileName: string;
  facultyIds: string[];
  majors: string[];
  degreeTypes: string[];
  projectIds: string[];
  milestoneType: string | null;
  isVisible: boolean;
}

interface FacultyContentItem {
  id: string;
  type: 'procedure' | 'announcement';
  titleHe: string;
  titleEn: string;
  bodyHe: string;
  bodyEn: string;
  facultyIds: string[];
  majors: string[];
  degreeTypes: string[];
  createdAt: string | null;
}

function scopeSummary(f: { facultyIds: string[]; majors: string[]; degreeTypes: string[] }, lang: 'he' | 'en'): string {
  const parts: string[] = [];
  if (f.facultyIds?.length) parts.push(f.facultyIds.map((id) => facultyLabel(id as FacultyId, lang)).join(', '));
  if (f.majors?.length) {
    parts.push(
      f.majors
        .map((slug) => stripDegreePrefix(ALL_MAJORS.find((m) => m.slug === slug)?.label[lang] ?? slug))
        .join(', ')
    );
  }
  if (f.degreeTypes?.length) {
    parts.push(
      f.degreeTypes
        .map((d) => (d === 'bachelors' ? (lang === 'he' ? "תואר ראשון" : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")))
        .join(', ')
    );
  }
  if (parts.length === 0) return lang === 'he' ? '🌐 כולם' : '🌐 Everyone';
  return `🎯 ${parts.join(' · ')}`;
}

// Project-scoped files never fall into the faculty/major/degree axes above
// (the two modes are mutually exclusive server-side) — this branches first
// so such a file never misleadingly reads as "🌐 Everyone".
function fileScopeSummary(f: InfoFile, lang: 'he' | 'en'): string {
  if (f.projectIds.length > 0) {
    const count = f.projectIds.length;
    const projectsLabel = lang === 'he'
      ? `📁 ${count} ${count === 1 ? 'פרויקט' : 'פרויקטים'}`
      : `📁 ${count} project${count === 1 ? '' : 's'}`;
    return f.milestoneType
      ? `${projectsLabel} · ${lang === 'he' ? 'מ־' : 'from '}${f.milestoneType}`
      : projectsLabel;
  }
  return scopeSummary(f, lang);
}

export default function InfoFilesPage() {
  const { loading: guardLoading, isAllowed } = useRequireRole(INFO_FILE_ROLES);
  const { userData } = useAuth();
  const { lang, t } = useLanguage();
  const role = userData?.role as AppRole | undefined;
  const isProjectOnlyRole = !!role && PROJECT_ONLY_ROLES.includes(role);

  const [files, setFiles] = useState<InfoFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [deletingFile, setDeletingFile] = useState<InfoFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busyFileId, setBusyFileId] = useState<string | null>(null);

  // ── Scope mode: faculty-wide (today's pickers below) vs specific
  // project(s) — a supervisor is locked to 'projects' (they have no
  // faculty-wide authority); coordinator/system_admin choose either.
  const [scopeMode, setScopeMode] = useState<'faculty' | 'projects'>(isProjectOnlyRole ? 'projects' : 'faculty');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- role (and so isProjectOnlyRole) only becomes known once userData loads asynchronously; this just corrects the initial guess the first time that becomes true, same pattern as the FREE_CHOICE_CROSS_FACULTY_ROLES effect in workflow-templates/page.tsx
    if (isProjectOnlyRole) setScopeMode('projects');
  }, [isProjectOnlyRole]);

  const [myProjects, setMyProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [scopeProjectIds, setScopeProjectIds] = useState<string[]>([]);
  const [milestoneOptions, setMilestoneOptions] = useState<MilestoneTypeOption[]>([]);
  const [scopeMilestoneType, setScopeMilestoneType] = useState('');
  const [scopeIsVisible, setScopeIsVisible] = useState(true);

  useEffect(() => {
    if (!isAllowed || !role) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; the loading flag is set synchronously so the picker doesn't flash "no projects" before the request resolves
    setProjectsLoading(true);
    (async () => {
      try {
        if (role === 'supervisor') {
          const res = await apiClient.getSupervisorDashboard();
          if (cancelled) return;
          setMyProjects(res.myProjects.map((p) => {
            const proj = p as Record<string, unknown> & { id: string; titleHe?: string; titleEn?: string; enrolledStudents?: Array<{ name?: string }> };
            return {
              id: proj.id,
              label: (lang === 'he' ? proj.titleHe : proj.titleEn) || proj.titleHe || proj.titleEn || proj.id,
              sublabel: (proj.enrolledStudents ?? []).map((s) => s.name).filter(Boolean).join(', '),
            };
          }));
        } else {
          const res = await apiClient.getActiveProjects();
          if (cancelled) return;
          setMyProjects(res.InProgress.map((p) => {
            const proj = p as Record<string, unknown> & { id: string; projectTitleHe?: string; projectTitleEn?: string; students?: Array<{ name?: string }> };
            return {
              id: proj.id,
              label: (lang === 'he' ? proj.projectTitleHe : proj.projectTitleEn) || proj.projectTitleHe || proj.projectTitleEn || proj.id,
              sublabel: (proj.students ?? []).map((s) => s.name).filter(Boolean).join(', '),
            };
          }));
        }
      } catch {
        if (!cancelled) setMyProjects([]);
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount; re-fetching on every lang toggle would be wasteful, labels are re-picked from already-fetched raw fields elsewhere
  }, [isAllowed, role]);

  // Milestone-type options for the currently-selected project(s) — union of
  // each selected project's own milestone docs, deduped by type. Refetches
  // whenever the selection changes; a project removed from the selection
  // just drops out of the union on the next successful fetch.
  useEffect(() => {
    if (scopeProjectIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clears stale options synchronously when the selection empties out, rather than leaving the previous project's milestone list visible
      setMilestoneOptions([]);
      setScopeMilestoneType('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(scopeProjectIds.map((id) => apiClient.getMilestones({ projectId: id })));
        if (cancelled) return;
        const seen = new Set<string>();
        const options: MilestoneTypeOption[] = [];
        results.forEach((res) => {
          (res.milestones ?? []).forEach((m) => {
            const milestone = m as Record<string, unknown> & { type?: unknown; nameHe?: string; nameEn?: string };
            if (typeof milestone.type !== 'string' || seen.has(milestone.type)) return;
            seen.add(milestone.type);
            options.push({ type: milestone.type, labelHe: milestone.nameHe ?? milestone.type, labelEn: milestone.nameEn ?? milestone.type });
          });
        });
        setMilestoneOptions(options);
        if (!options.some((o) => o.type === scopeMilestoneType)) setScopeMilestoneType('');
      } catch {
        if (!cancelled) setMilestoneOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeMilestoneType intentionally excluded, it's only read to decide whether to clear a now-invalid selection
  }, [scopeProjectIds]);

  const filteredMyProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return myProjects;
    return myProjects.filter((p) => p.label.toLowerCase().includes(q) || p.sublabel?.toLowerCase().includes(q));
  }, [myProjects, projectSearch]);

  const toggleScopeProject = (id: string) => {
    setScopeProjectIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  // A supervisor only manages files tied to their own projects — the
  // faculty-wide list and other supervisors' project files aren't relevant
  // (nor actionable — the server rejects edits to them) to them, so the list
  // view is narrowed here. coordinator/system_admin keep seeing everything,
  // matching their broad-oversight role everywhere else in this app.
  const visibleFiles = useMemo(() => {
    if (role !== 'supervisor') return files;
    const myIds = new Set(myProjects.map((p) => p.id));
    return files.filter((f) => f.projectIds.some((id) => myIds.has(id)));
  }, [files, role, myProjects]);

  const canManageFile = (f: InfoFile): boolean => {
    if (role !== 'supervisor') return true;
    const myIds = new Set(myProjects.map((p) => p.id));
    return f.projectIds.some((id) => myIds.has(id));
  };

  // ── Faculty procedures / announcements — free-text companion to the file
  // uploads above (requirements doc section 15). Separate scope state from
  // the file-upload form so filling one form doesn't leak into the other.
  const [contentItems, setContentItems] = useState<FacultyContentItem[]>([]);
  const [contentType, setContentType] = useState<'procedure' | 'announcement'>('announcement');
  const [contentTitleHe, setContentTitleHe] = useState('');
  const [contentTitleEn, setContentTitleEn] = useState('');
  const [contentBodyHe, setContentBodyHe] = useState('');
  const [contentBodyEn, setContentBodyEn] = useState('');
  const [contentScopeFacultyIds, setContentScopeFacultyIds] = useState<string[]>([]);
  const [contentScopeMajors, setContentScopeMajors] = useState<string[]>([]);
  const [contentScopeDegreeTypes, setContentScopeDegreeTypes] = useState<string[]>([]);
  const [selectAllContent, setSelectAllContent] = useState(false);
  const [posting, setPosting] = useState(false);
  const [contentError, setContentError] = useState('');
  const [deletingContent, setDeletingContent] = useState<FacultyContentItem | null>(null);
  const [deletingContentBusy, setDeletingContentBusy] = useState(false);

  // Visibility scoping — each empty means unrestricted for that axis (the
  // file stays visible to everyone along that dimension). A student must
  // match ALL three non-empty axes to see the file; enforced server-side in
  // getInfoFiles, not just here. Leaving all three empty used to be the only
  // way to target "everyone" — now that must be an explicit choice (the
  // "Show to everyone" checkbox below), so an empty selection with the
  // checkbox unchecked is rejected at submit time instead of silently
  // meaning "all".
  const [scopeFacultyIds, setScopeFacultyIds] = useState<string[]>([]);
  const [scopeMajors, setScopeMajors] = useState<string[]>([]);
  const [scopeDegreeTypes, setScopeDegreeTypes] = useState<string[]>([]);
  const [selectAllFiles, setSelectAllFiles] = useState(false);

  // Cascades to just the selected faculties' majors once any are picked —
  // otherwise the full cross-faculty list, since a major on its own is a
  // valid (if unusual) restriction too.
  const availableMajorsFor = (facultyIds: string[]) => {
    if (facultyIds.length === 0) return ALL_MAJORS;
    const seen = new Set<string>();
    const out: typeof ALL_MAJORS = [];
    for (const facultyId of facultyIds) {
      for (const m of majorsForFaculty(facultyId)) {
        if (seen.has(m.slug)) continue;
        seen.add(m.slug);
        out.push(m);
      }
    }
    return out;
  };

  const availableMajors = useMemo(() => availableMajorsFor(scopeFacultyIds), [scopeFacultyIds]);
  const contentAvailableMajors = useMemo(() => availableMajorsFor(contentScopeFacultyIds), [contentScopeFacultyIds]);

  // Union (not intersection) across the selected faculties — facultyIds is an
  // OR within its own axis, so e.g. picking data_science (masters-only) and
  // electrical_engineering (both) together should still offer both degree
  // types (each faculty just contributes whichever of its own students match).
  // With only data_science selected, that union collapses to masters-only,
  // which is exactly what stops staff from picking bachelors for it.
  const availableDegreeTypesFor = (facultyIds: string[]): ('bachelors' | 'masters')[] => {
    if (facultyIds.length === 0) return ['bachelors', 'masters'];
    const set = new Set<'bachelors' | 'masters'>();
    facultyIds.forEach((f) => degreeLevelsForFaculty(f).forEach((l) => set.add(l)));
    return (['bachelors', 'masters'] as const).filter((l) => set.has(l));
  };
  const availableDegreeTypes = useMemo(() => availableDegreeTypesFor(scopeFacultyIds), [scopeFacultyIds]);
  const contentAvailableDegreeTypes = useMemo(() => availableDegreeTypesFor(contentScopeFacultyIds), [contentScopeFacultyIds]);

  const toggleIn = (list: string[], value: string, setList: (v: string[]) => void) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  // Shared by both the file-upload and content-composer scope pickers — drops
  // any selected major or degree type that no longer belongs to the (now
  // narrower) set of faculties, so the stored scope never silently
  // contradicts itself.
  const makeToggleFaculty = (
    facultyIds: string[], setFacultyIds: (v: string[]) => void,
    setMajors: (fn: (prev: string[]) => string[]) => void,
    setDegreeTypes: (fn: (prev: string[]) => string[]) => void,
  ) => (facultyId: string) => {
    const next = facultyIds.includes(facultyId) ? facultyIds.filter((v) => v !== facultyId) : [...facultyIds, facultyId];
    setFacultyIds(next);
    const validSlugs = new Set(
      next.length === 0 ? ALL_MAJORS.map((m) => m.slug) : next.flatMap((f) => majorsForFaculty(f).map((m) => m.slug))
    );
    setMajors((prev) => prev.filter((m) => validSlugs.has(m)));
    const validDegrees = new Set(availableDegreeTypesFor(next));
    setDegreeTypes((prev) => prev.filter((d) => validDegrees.has(d as 'bachelors' | 'masters')));
  };

  const toggleFaculty = makeToggleFaculty(scopeFacultyIds, setScopeFacultyIds, setScopeMajors, setScopeDegreeTypes);
  const toggleContentFaculty = makeToggleFaculty(contentScopeFacultyIds, setContentScopeFacultyIds, setContentScopeMajors, setContentScopeDegreeTypes);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await apiClient.getInfoFiles();
      setFiles(res.files ?? []);
    } catch {
      setError(lang === 'he' ? 'טעינת הקבצים נכשלה' : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchFiles' setState calls happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchFiles();
  }, [isAllowed, fetchFiles]);

  const fetchContent = useCallback(async () => {
    try {
      const res = await apiClient.getFacultyContent();
      setContentItems(res.items ?? []);
    } catch {
      setContentError(lang === 'he' ? 'טעינת התוכן נכשלה' : 'Failed to load content');
    }
  }, [lang]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; fetchContent's setState calls happen after its awaited network call resolves, not synchronously in this effect
    if (isAllowed) fetchContent();
  }, [isAllowed, fetchContent]);

  const handlePostContent = async () => {
    if (!contentTitleHe.trim() && !contentTitleEn.trim()) {
      setContentError(lang === 'he' ? 'יש להזין כותרת' : 'Please enter a title');
      return;
    }
    if (!contentBodyHe.trim() && !contentBodyEn.trim()) {
      setContentError(lang === 'he' ? 'יש להזין תוכן' : 'Please enter body text');
      return;
    }
    if (!selectAllContent && contentScopeFacultyIds.length === 0 && contentScopeMajors.length === 0 && contentScopeDegreeTypes.length === 0) {
      setContentError(
        lang === 'he'
          ? 'יש לבחור פקולטה, מגמה או תואר אחד לפחות — או לסמן "הצג לכולם"'
          : 'Select at least one faculty, major, or degree — or check "Show to everyone"'
      );
      return;
    }
    setPosting(true);
    setContentError('');
    try {
      await apiClient.createFacultyContent({
        type: contentType,
        titleHe: contentTitleHe.trim(),
        titleEn: contentTitleEn.trim(),
        bodyHe: contentBodyHe.trim(),
        bodyEn: contentBodyEn.trim(),
        facultyIds: selectAllContent ? [] : contentScopeFacultyIds,
        majors: selectAllContent ? [] : contentScopeMajors,
        degreeTypes: selectAllContent ? [] : contentScopeDegreeTypes,
      });
      setContentTitleHe('');
      setContentTitleEn('');
      setContentBodyHe('');
      setContentBodyEn('');
      setContentScopeFacultyIds([]);
      setContentScopeMajors([]);
      setContentScopeDegreeTypes([]);
      setSelectAllContent(false);
      await fetchContent();
    } catch (err) {
      setContentError(err instanceof Error ? err.message : lang === 'he' ? 'הפרסום נכשל' : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteContent = async () => {
    if (!deletingContent) return;
    setDeletingContentBusy(true);
    try {
      await apiClient.deleteFacultyContent(deletingContent.id);
      setContentItems((prev) => prev.filter((c) => c.id !== deletingContent.id));
      setDeletingContent(null);
    } catch {
      setContentError(lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed');
    } finally {
      setDeletingContentBusy(false);
    }
  };

  const handleUpload = async () => {
    if (!pickedFile) {
      setError(lang === 'he' ? 'יש לבחור קובץ' : 'Please pick a file');
      return;
    }
    if (!titleHe.trim() && !titleEn.trim()) {
      setError(lang === 'he' ? 'יש להזין כותרת' : 'Please enter a title');
      return;
    }
    if (scopeMode === 'projects') {
      if (scopeProjectIds.length === 0) {
        setError(lang === 'he' ? 'יש לבחור פרויקט אחד לפחות' : 'Select at least one project');
        return;
      }
    } else if (!selectAllFiles && scopeFacultyIds.length === 0 && scopeMajors.length === 0 && scopeDegreeTypes.length === 0) {
      setError(
        lang === 'he'
          ? 'יש לבחור פקולטה, מגמה או תואר אחד לפחות — או לסמן "הצג לכולם"'
          : 'Select at least one faculty, major, or degree — or check "Show to everyone"'
      );
      return;
    }
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', pickedFile);
      formData.append('titleHe', titleHe.trim());
      formData.append('titleEn', titleEn.trim());
      if (scopeMode === 'projects') {
        formData.append('projectIds', JSON.stringify(scopeProjectIds));
        if (scopeMilestoneType) formData.append('milestoneType', scopeMilestoneType);
        formData.append('isVisible', String(scopeIsVisible));
      } else {
        formData.append('facultyIds', JSON.stringify(selectAllFiles ? [] : scopeFacultyIds));
        formData.append('majors', JSON.stringify(selectAllFiles ? [] : scopeMajors));
        formData.append('degreeTypes', JSON.stringify(selectAllFiles ? [] : scopeDegreeTypes));
      }
      await apiClient.uploadInfoFile(formData);
      setTitleHe('');
      setTitleEn('');
      setPickedFile(null);
      setScopeFacultyIds([]);
      setScopeMajors([]);
      setScopeDegreeTypes([]);
      setSelectAllFiles(false);
      setScopeProjectIds([]);
      setScopeMilestoneType('');
      setScopeIsVisible(true);
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'העלאת הקובץ נכשלה' : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceFile = async (f: InfoFile, file: File) => {
    setBusyFileId(f.id);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      await apiClient.updateInfoFile(f.id, formData);
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'החלפת הקובץ נכשלה' : 'Failed to replace file');
    } finally {
      setBusyFileId(null);
    }
  };

  const handleToggleVisible = async (f: InfoFile) => {
    setBusyFileId(f.id);
    setError('');
    try {
      const formData = new FormData();
      formData.append('isVisible', String(!f.isVisible));
      await apiClient.updateInfoFile(f.id, formData);
      await fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : lang === 'he' ? 'עדכון הנראות נכשל' : 'Failed to update visibility');
    } finally {
      setBusyFileId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingFile) return;
    setDeleting(true);
    try {
      await apiClient.deleteInfoFile(deletingFile.id);
      setFiles((prev) => prev.filter((f) => f.id !== deletingFile.id));
      setDeletingFile(null);
    } catch {
      setError(lang === 'he' ? 'המחיקה נכשלה' : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  if (guardLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-muted">…</p>
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-primary focus:bg-surface focus:outline-none';

  return (
    <DashboardShell title={lang === 'he' ? 'ניהול מסמכים לסטודנטים' : 'Manage Student Info Files'} subtitle={lang === 'he' ? 'מסמכים והסברים המוצגים לסטודנטים' : 'Documents and guidance shown to students'}>
      <div className="mb-6 rounded-[var(--radius)] border border-line bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת בעברית' : 'Title (Hebrew)'}</span>
            <input dir="rtl" value={titleHe} onChange={(e) => setTitleHe(e.target.value)} placeholder={lang === 'he' ? 'לדוגמה: מדריך לבחירת פרויקט' : 'e.g. Project selection guide'} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת באנגלית' : 'Title (English)'}</span>
            <input dir="ltr" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="e.g. Project selection guide" className={inputCls} />
          </label>
        </div>

        <label className="relative mt-3 block overflow-hidden rounded-lg border border-dashed border-line bg-paper px-3 py-2.5 text-center text-sm text-ink hover:border-primary">
          {pickedFile ? `✓ ${pickedFile.name}` : `📄 ${lang === 'he' ? 'בחר קובץ' : 'Pick a file'}`}
          <input
            type="file"
            accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>

        {!isProjectOnlyRole && (
          <div className="mt-4 flex gap-1.5">
            {(['faculty', 'projects'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setScopeMode(m)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  scopeMode === m ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink hover:border-primary'
                }`}
              >
                {m === 'faculty' ? (lang === 'he' ? '🏫 פקולטה/מגמה/תואר' : '🏫 Faculty-wide') : (lang === 'he' ? '📁 פרויקטים ספציפיים' : '📁 Specific project(s)')}
              </button>
            ))}
          </div>
        )}

        {scopeMode === 'faculty' && (
          <div className="mt-4 grid gap-3 rounded-lg border border-line bg-paper p-3">
            <p className="text-xs font-medium text-muted">
              {lang === 'he'
                ? '🎯 חשיפה — בחר פקולטה, מגמה או תואר אחד לפחות, או סמן "הצג לכולם"'
                : '🎯 Visibility — select at least one faculty, major, or degree, or check "Show to everyone"'}
            </p>

            <label className="flex items-center gap-2 text-xs font-medium text-ink">
              <input
                type="checkbox"
                checked={selectAllFiles}
                onChange={(e) => {
                  setSelectAllFiles(e.target.checked);
                  if (e.target.checked) {
                    setScopeFacultyIds([]);
                    setScopeMajors([]);
                    setScopeDegreeTypes([]);
                  }
                }}
              />
              {lang === 'he' ? '🌐 הצג לכולם (בחר הכל)' : '🌐 Show to everyone (select all)'}
            </label>

            <div className={selectAllFiles ? 'opacity-50' : undefined}>
              <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
              <div className="flex flex-wrap gap-1.5">
                {SELECTABLE_FACULTIES.map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={selectAllFiles}
                    onClick={() => toggleFaculty(id)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                      scopeFacultyIds.includes(id) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                    }`}
                  >
                    {facultyLabel(id, lang)}
                  </button>
                ))}
              </div>
            </div>

            <div className={selectAllFiles ? 'opacity-50' : undefined}>
              <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'מגמה' : 'Major'}</span>
              <div className="flex flex-wrap gap-1.5">
                {availableMajors.map((m) => (
                  <button
                    key={m.slug}
                    type="button"
                    disabled={selectAllFiles}
                    onClick={() => toggleIn(scopeMajors, m.slug, setScopeMajors)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                      scopeMajors.includes(m.slug) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                    }`}
                  >
                    {stripDegreePrefix(m.label[lang])}
                  </button>
                ))}
              </div>
            </div>

            <div className={selectAllFiles ? 'opacity-50' : undefined}>
              <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'תואר' : 'Degree'}</span>
              <div className="flex flex-wrap gap-1.5">
                {availableDegreeTypes.map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={selectAllFiles}
                    onClick={() => toggleIn(scopeDegreeTypes, d, setScopeDegreeTypes)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                      scopeDegreeTypes.includes(d) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                    }`}
                  >
                    {d === 'bachelors' ? (lang === 'he' ? "תואר ראשון" : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")}
                  </button>
                ))}
              </div>
              {scopeFacultyIds.length > 0 && availableDegreeTypes.length === 1 && (
                <p className="mt-1 text-xs text-muted">
                  {lang === 'he' ? 'הפקולטה/ות שנבחרו מציעות תואר אחד בלבד' : 'The selected faculty/ies only offer one degree level'}
                </p>
              )}
            </div>
          </div>
        )}

        {scopeMode === 'projects' && (
          <div className="mt-4 grid gap-3 rounded-lg border border-line bg-paper p-3">
            <p className="text-xs font-medium text-muted">
              {lang === 'he' ? '📁 בחר פרויקט/ים — ניתן לבחור כמה' : '📁 Select project(s) — multiple allowed'}
              {scopeProjectIds.length > 0 && <span className="ms-1 font-normal">({scopeProjectIds.length} {lang === 'he' ? 'נבחרו' : 'selected'})</span>}
            </p>
            <input
              type="text"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder={lang === 'he' ? 'חיפוש לפי שם סטודנט/פרויקט...' : 'Search by student or project name...'}
              className={inputCls}
            />
            <div className="grid max-h-48 gap-1.5 overflow-y-auto">
              {projectsLoading ? (
                <p className="text-xs text-muted">…</p>
              ) : filteredMyProjects.length === 0 ? (
                <p className="text-xs text-muted">{myProjects.length === 0 ? (lang === 'he' ? 'אין פרויקטים זמינים' : 'No projects available') : (lang === 'he' ? 'לא נמצאו תוצאות' : 'No matches found')}</p>
              ) : (
                filteredMyProjects.map((p) => {
                  const active = scopeProjectIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleScopeProject(p.id)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-start text-xs ${
                        active ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink'
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${active ? 'border-white' : 'border-muted'}`}>
                        {active && '✓'}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {p.label}
                        {p.sublabel && <span className={`ms-1.5 truncate ${active ? 'text-primary-ink/80' : 'text-muted'}`}>— {p.sublabel}</span>}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {scopeProjectIds.length > 0 && (
              <div>
                <span className="mb-1.5 block text-xs font-medium text-ink">
                  {lang === 'he' ? 'זמין החל מאבן דרך' : 'Available from milestone'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setScopeMilestoneType('')}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      scopeMilestoneType === '' ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                    }`}
                  >
                    {lang === 'he' ? 'ללא (זמין מיד)' : 'None (available immediately)'}
                  </button>
                  {milestoneOptions.map((o) => (
                    <button
                      key={o.type}
                      type="button"
                      onClick={() => setScopeMilestoneType(o.type)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        scopeMilestoneType === o.type ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                      }`}
                    >
                      {lang === 'he' ? o.labelHe : o.labelEn}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs font-medium text-ink">
              <input type="checkbox" checked={scopeIsVisible} onChange={(e) => setScopeIsVisible(e.target.checked)} />
              {lang === 'he' ? '🔘 גלוי לסטודנטים כעת' : '🔘 Visible to students now'}
            </label>
          </div>
        )}

        {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {uploading ? '…' : lang === 'he' ? 'העלה קובץ' : 'Upload file'}
        </button>
      </div>

      <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'קבצים שהועלו' : 'Uploaded files'}</p>

      {loading ? (
        <p className="text-sm text-muted">{t('loading')}</p>
      ) : visibleFiles.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'אין קבצים עדיין' : 'No files yet'}</p>
      ) : (
        <div className="grid gap-2">
          {visibleFiles.map((f) => {
            const canManage = canManageFile(f);
            const busy = busyFileId === f.id;
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-line bg-surface p-3">
                <a href={f.fileUrl} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2.5">
                  <span className="text-lg">📄</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{lang === 'he' ? f.titleHe || f.titleEn : f.titleEn || f.titleHe}</span>
                    <span className="block truncate text-xs text-muted">{f.fileName}</span>
                  </span>
                </a>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {fileScopeSummary(f, lang)}
                </span>
                {!f.isVisible && (
                  <span className="shrink-0 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-medium text-danger">
                    🚫 {lang === 'he' ? 'מוסתר' : 'Hidden'}
                  </span>
                )}
                {canManage && (
                  <>
                    <label className={`shrink-0 cursor-pointer px-2 py-1 text-sm hover:opacity-70 ${busy ? 'pointer-events-none opacity-50' : ''}`} title={lang === 'he' ? 'החלף קובץ' : 'Replace file'}>
                      🔄
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const picked = e.target.files?.[0];
                          e.target.value = '';
                          if (picked) handleReplaceFile(f, picked);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleToggleVisible(f)}
                      disabled={busy}
                      className="shrink-0 px-2 py-1 text-sm hover:opacity-70 disabled:opacity-50"
                      title={f.isVisible ? (lang === 'he' ? 'הסתר מסטודנטים' : 'Hide from students') : (lang === 'he' ? 'הצג לסטודנטים' : 'Show to students')}
                    >
                      {f.isVisible ? '👁️' : '🚫'}
                    </button>
                    <button type="button" onClick={() => setDeletingFile(f)} disabled={busy} className="shrink-0 px-2 py-1 text-sm font-semibold text-danger hover:opacity-70 disabled:opacity-50">
                      ✕
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingFile}
        title={lang === 'he' ? 'מחיקת קובץ' : 'Delete file'}
        message={
          deletingFile
            ? lang === 'he'
              ? `האם למחוק את "${deletingFile.titleHe || deletingFile.titleEn}"?`
              : `Delete "${deletingFile.titleEn || deletingFile.titleHe}"?`
            : ''
        }
        confirmLabel={lang === 'he' ? 'מחק' : 'Delete'}
        cancelLabel={t('cancel')}
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingFile(null)}
      />

      {/* ── Faculty procedures / announcements ──────────────────────────── */}
      <div className="mb-6 mt-8 rounded-[var(--radius)] border border-line bg-surface p-5">
        <p className="mb-3 text-sm font-semibold text-ink">
          📢 {lang === 'he' ? 'נהלים והודעות שוטפות' : 'Procedures & Announcements'}
        </p>

        <div className="mb-3 flex gap-1.5">
          {(['announcement', 'procedure'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setContentType(v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                contentType === v ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-paper text-ink hover:border-primary'
              }`}
            >
              {v === 'announcement' ? (lang === 'he' ? '📣 הודעה' : '📣 Announcement') : (lang === 'he' ? '📘 נוהל' : '📘 Procedure')}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת בעברית' : 'Title (Hebrew)'}</span>
            <input dir="rtl" value={contentTitleHe} onChange={(e) => setContentTitleHe(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'כותרת באנגלית' : 'Title (English)'}</span>
            <input dir="ltr" value={contentTitleEn} onChange={(e) => setContentTitleEn(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תוכן בעברית' : 'Body (Hebrew)'}</span>
            <textarea dir="rtl" rows={3} value={contentBodyHe} onChange={(e) => setContentBodyHe(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">{lang === 'he' ? 'תוכן באנגלית' : 'Body (English)'}</span>
            <textarea dir="ltr" rows={3} value={contentBodyEn} onChange={(e) => setContentBodyEn(e.target.value)} className={inputCls} />
          </label>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border border-line bg-paper p-3">
          <p className="text-xs font-medium text-muted">
            {lang === 'he'
              ? '🎯 חשיפה — בחר פקולטה, מגמה או תואר אחד לפחות, או סמן "הצג לכולם"'
              : '🎯 Visibility — select at least one faculty, major, or degree, or check "Show to everyone"'}
          </p>
          <label className="flex items-center gap-2 text-xs font-medium text-ink">
            <input
              type="checkbox"
              checked={selectAllContent}
              onChange={(e) => {
                setSelectAllContent(e.target.checked);
                if (e.target.checked) {
                  setContentScopeFacultyIds([]);
                  setContentScopeMajors([]);
                  setContentScopeDegreeTypes([]);
                }
              }}
            />
            {lang === 'he' ? '🌐 הצג לכולם (בחר הכל)' : '🌐 Show to everyone (select all)'}
          </label>
          <div className={selectAllContent ? 'opacity-50' : undefined}>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'פקולטה' : 'Faculty'}</span>
            <div className="flex flex-wrap gap-1.5">
              {SELECTABLE_FACULTIES.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={selectAllContent}
                  onClick={() => toggleContentFaculty(id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    contentScopeFacultyIds.includes(id) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {facultyLabel(id, lang)}
                </button>
              ))}
            </div>
          </div>
          <div className={selectAllContent ? 'opacity-50' : undefined}>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'מגמה' : 'Major'}</span>
            <div className="flex flex-wrap gap-1.5">
              {contentAvailableMajors.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  disabled={selectAllContent}
                  onClick={() => toggleIn(contentScopeMajors, m.slug, setContentScopeMajors)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    contentScopeMajors.includes(m.slug) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {stripDegreePrefix(m.label[lang])}
                </button>
              ))}
            </div>
          </div>
          <div className={selectAllContent ? 'opacity-50' : undefined}>
            <span className="mb-1.5 block text-xs font-medium text-ink">{lang === 'he' ? 'תואר' : 'Degree'}</span>
            <div className="flex flex-wrap gap-1.5">
              {contentAvailableDegreeTypes.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={selectAllContent}
                  onClick={() => toggleIn(contentScopeDegreeTypes, d, setContentScopeDegreeTypes)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                    contentScopeDegreeTypes.includes(d) ? 'border-primary bg-primary text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary'
                  }`}
                >
                  {d === 'bachelors' ? (lang === 'he' ? "תואר ראשון" : "Bachelor's") : (lang === 'he' ? 'תואר שני' : "Master's")}
                </button>
              ))}
            </div>
            {contentScopeFacultyIds.length > 0 && contentAvailableDegreeTypes.length === 1 && (
              <p className="mt-1 text-xs text-muted">
                {lang === 'he' ? 'הפקולטה/ות שנבחרו מציעות תואר אחד בלבד' : 'The selected faculty/ies only offer one degree level'}
              </p>
            )}
          </div>
        </div>

        {contentError && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{contentError}</p>}

        <button
          type="button"
          onClick={handlePostContent}
          disabled={posting}
          className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-ink hover:bg-primary-hover disabled:opacity-60"
        >
          {posting ? '…' : lang === 'he' ? 'פרסם' : 'Post'}
        </button>
      </div>

      <p className="mb-2 text-sm font-semibold text-ink">{lang === 'he' ? 'נהלים והודעות שפורסמו' : 'Published procedures & announcements'}</p>

      {contentItems.length === 0 ? (
        <p className="text-sm text-muted">{lang === 'he' ? 'אין תוכן עדיין' : 'Nothing published yet'}</p>
      ) : (
        <div className="grid gap-2">
          {contentItems.map((c) => (
            <div key={c.id} className="rounded-[var(--radius)] border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{c.type === 'announcement' ? '📣' : '📘'}</span>
                    <span className="truncate text-sm font-medium text-ink">{lang === 'he' ? c.titleHe || c.titleEn : c.titleEn || c.titleHe}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{lang === 'he' ? c.bodyHe || c.bodyEn : c.bodyEn || c.bodyHe}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{scopeSummary(c, lang)}</span>
                <button type="button" onClick={() => setDeletingContent(c)} className="shrink-0 px-2 py-1 text-sm font-semibold text-danger hover:opacity-70">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingContent}
        title={lang === 'he' ? 'מחיקת תוכן' : 'Delete content'}
        message={
          deletingContent
            ? lang === 'he'
              ? `האם למחוק את "${deletingContent.titleHe || deletingContent.titleEn}"?`
              : `Delete "${deletingContent.titleEn || deletingContent.titleHe}"?`
            : ''
        }
        confirmLabel={lang === 'he' ? 'מחק' : 'Delete'}
        cancelLabel={t('cancel')}
        destructive
        busy={deletingContentBusy}
        onConfirm={handleDeleteContent}
        onCancel={() => setDeletingContent(null)}
      />
    </DashboardShell>
  );
}

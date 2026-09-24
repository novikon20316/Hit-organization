// components/CreateOwnProjectButton.tsx
//
// Lets any staff member who holds supervisor/secondary_supervisor among
// their roles post their own project, even when that isn't their
// highest-ranked role and so isn't the dashboard they land on (see
// firebase/roles.ts's highestRankedRole — a coordinator who's also a
// supervisor otherwise has no way to reach the supervisor dashboard's own
// "New Project" button/tab). Drop this into any other staff dashboard's
// Projects-equivalent section.
//
// Mirrors the creation flow in app/supervisor/dashboard.tsx (same modal,
// same endpoint), minus the supervisor-dashboard-only extras that don't
// apply to a secondary entry point like this one: major restriction
// (assignedMajors — read from that supervisor's own dashboard fetch, not
// available here) and the "class selection" cosmetic addition.
import React, { useState } from 'react';
import { Pressable, Text, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiClient } from '@/src/api/apiClient';
import { useActiveRole } from '@/contexts/ActiveRoleContext';
import { sharedStyles } from '@/constants';
import { FACULTY_COLORS } from './shared';
import NewProjectModal from './modals/NewProjectModal';
import type { PrerequisiteSpec } from './Prerequisites';

interface Props {
  lang: 'he' | 'en';
  isRtl: boolean;
  onCreated: () => void;
}

export default function CreateOwnProjectButton({ lang, isRtl, onCreated }: Props) {
  const { roles, facultyId } = useActiveRole();
  const [showNewProject, setShowNewProject] = useState(false);
  const [titleHe, setTitleHe] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [descHe, setDescHe] = useState('');
  const [descEn, setDescEn] = useState('');
  const [skills, setSkills] = useState('');
  const [prerequisites, setPrerequisites] = useState<PrerequisiteSpec[]>([]);
  const [minAverageGrade, setMinAverageGrade] = useState<number | null>(null);
  const [minCreditPoints, setMinCreditPoints] = useState<number | null>(null);
  const [degreeTypes, setDegreeTypes] = useState<('bachelors' | 'masters')[]>(['bachelors']);
  const [projectTypes, setProjectTypes] = useState<('project' | 'thesis')[]>(['project']);
  const [maxStudents, setMaxStudents] = useState(1);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [projectFile, setProjectFile] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [creating, setCreating] = useState(false);

  const canCreateOwnProject = roles.includes('supervisor') || roles.includes('secondary_supervisor');
  // Cross-faculty roles (system_admin/administrative_secretary) can have
  // facultyId 'all', which isn't a real single faculty a project can belong
  // to — see web/lib/roles.ts's CROSS_FACULTY_ROLES comment. Never true for
  // supervisor/secondary_supervisor themselves, so this only excludes the
  // rare case where a cross-faculty admin also happens to hold one of those
  // roles without a specific home faculty set.
  if (!canCreateOwnProject || !facultyId || facultyId === 'all') return null;

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    setUploadingFile(true);
    try {
      // Uploads through the server (authenticated) rather than straight to
      // Cloudinary — the old path posted directly via a hardcoded unsigned
      // preset anyone could extract from the client bundle and abuse; see
      // AUDIT_CODE_QUALITY_BUTTONS_CLOUDINARY_2026_09_24.md finding #1.
      const formData = new FormData();
      formData.append('files', { uri: asset.uri, type: 'application/pdf', name: asset.name } as any);
      const response = await apiClient.post<{ url: string }>('/api/supervisor/projects/upload-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: (data: any) => data,
      });
      setProjectFile(response.data.url);
      setProjectName(asset.name);
    } catch {} finally {
      setUploadingFile(false);
    }
  };

  const resetForm = () => {
    setTitleHe(''); setTitleEn(''); setDescHe(''); setDescEn(''); setSkills('');
    setPrerequisites([]); setMinAverageGrade(null); setMinCreditPoints(null);
    setSelectedProgram(null); setProjectFile(null); setProjectName(null);
    setDegreeTypes(['bachelors']); setProjectTypes(['project']); setMaxStudents(1);
  };

  const handleCreate = async () => {
    if (!titleHe.trim() || !titleEn.trim()) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'כותרת בשתי השפות היא שדה חובה' : 'Title in both languages is required');
      return;
    }
    if (degreeTypes.length === 0 || projectTypes.length === 0) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', lang === 'he' ? 'יש לבחור לפחות סוג תואר אחד וסוג פרויקט אחד' : 'Select at least one degree type and one project type');
      return;
    }
    setCreating(true);
    try {
      await apiClient.post('/api/supervisor/projects', {
        titleHe,
        titleEn,
        descriptionHe: descHe,
        descriptionEn: descEn,
        degreeTypes,
        projectTypes,
        projectFileUrl: projectFile,
        NumberOfStudents: maxStudents,
        requiredSkills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        prerequisites: prerequisites
          .filter((p) => p.subject.trim())
          .map((p) => ({ subject: p.subject.trim(), ...(p.minGrade != null ? { minGrade: p.minGrade } : {}) })),
        ...(minAverageGrade != null ? { minAverageGrade } : {}),
        ...(minCreditPoints != null ? { minCreditPoints } : {}),
        facultyId,
      });
      setShowNewProject(false);
      resetForm();
      onCreated();
      Alert.alert('✅', lang === 'he' ? 'הפרויקט פורסם בהצלחה!' : 'Project published successfully!');
    } catch (e: any) {
      Alert.alert(lang === 'he' ? 'שגיאה' : 'Error', e?.response?.data?.message || (lang === 'he' ? 'פרסום הפרויקט נכשל' : 'Failed to create project.'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Pressable
        style={{ backgroundColor: '#2E86FF', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 14 }}
        onPress={() => setShowNewProject(true)}
        accessibilityRole="button"
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
          + {lang === 'he' ? 'פרסום פרויקט חדש (כמנחה)' : 'Post New Project (as Supervisor)'}
        </Text>
      </Pressable>

      <NewProjectModal
        visible={showNewProject}
        setVisible={setShowNewProject}
        mode="supervisor"
        lang={lang}
        isRtl={isRtl}
        titleHe={titleHe} setTitleHe={setTitleHe}
        titleEn={titleEn} setTitleEn={setTitleEn}
        descHe={descHe} setDescHe={setDescHe}
        descEn={descEn} setDescEn={setDescEn}
        skills={skills} setSkills={setSkills}
        prerequisites={prerequisites} setPrerequisites={setPrerequisites}
        minAverageGrade={minAverageGrade} setMinAverageGrade={setMinAverageGrade}
        minCreditPoints={minCreditPoints} setMinCreditPoints={setMinCreditPoints}
        faculty={facultyId}
        degreeTypes={degreeTypes} setDegreeTypes={setDegreeTypes}
        projectTypes={projectTypes} setProjectTypes={setProjectTypes}
        selectedProgram={selectedProgram} setSelectedProgram={setSelectedProgram}
        onCreate={handleCreate}
        creating={creating}
        maxStudents={maxStudents} setMaxStudents={setMaxStudents}
        projectName={projectName} setProjectName={setProjectName}
        projectFile={projectFile} setProjectFile={setProjectFile}
        pickFile={pickFile}
        uploadingFile={uploadingFile}
        facultyColors={FACULTY_COLORS}
        styles={sharedStyles}
      />
    </>
  );
}

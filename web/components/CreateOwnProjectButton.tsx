'use client';

// components/CreateOwnProjectButton.tsx
// Lets any staff member who holds supervisor/secondary_supervisor among
// their roles post their own project, even when that isn't their
// highest-ranked role and so isn't the dashboard they land on (see
// lib/roles.ts's resolveActiveRole — a coordinator who's also a supervisor
// otherwise has no way to reach /supervisor/dashboard's own "New Project"
// button). Drop this into any other staff dashboard's Projects-equivalent
// section — reuses the exact same modal/endpoint the supervisor dashboard
// itself uses.
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { NewProjectModal } from '@/app/supervisor/dashboard/NewProjectModal';

interface CreateOwnProjectButtonProps {
  onCreated: () => void;
}

export function CreateOwnProjectButton({ onCreated }: CreateOwnProjectButtonProps) {
  const { lang } = useLanguage();
  const { roles, userData } = useAuth();
  const [showNewProject, setShowNewProject] = useState(false);

  const canCreateOwnProject = roles.includes('supervisor') || roles.includes('secondary_supervisor');
  const facultyId = userData?.facultyId;
  // Cross-faculty roles (system_admin/administrative_secretary) can have
  // facultyId 'all', which isn't a real single faculty a project can belong
  // to — see lib/roles.ts's CROSS_FACULTY_ROLES comment. Never true for
  // supervisor/secondary_supervisor themselves, so this only excludes the
  // rare case where a cross-faculty admin also happens to hold one of those
  // roles without a specific home faculty set.
  if (!canCreateOwnProject || !facultyId || facultyId === 'all') return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowNewProject(true)}
        className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-ink hover:bg-primary-hover"
      >
        + {lang === 'he' ? 'פרסום פרויקט חדש (כמנחה)' : 'Post New Project (as Supervisor)'}
      </button>

      {showNewProject && (
        <NewProjectModal facultyId={facultyId} onClose={() => setShowNewProject(false)} onCreated={onCreated} />
      )}
    </>
  );
}

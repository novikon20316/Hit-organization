// hooks/useMilestones.ts
//
// Live-listener hook. Works for any role — pass projectId to scope to one project,
// or leave it undefined to load all milestones the caller can see.

import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot,
  orderBy, getDoc, doc, Timestamp,
} from 'firebase/firestore';
import { db } from '../src/firebase/firebase';
import type { MilestoneData } from '../app/(tabs)/Milestonetimeline';

interface Options {
  projectId?:   string;    // scope to a single project
  supervisorId?:string;    // scope to all of one supervisor's projects
  studentId?:   string;    // scope to student's active project
  facultyId?:   string;    // scope to a whole faculty (coordinator / admin)
  statusFilter?: string[]; // e.g. ['submitted'] for "needs grading" views
}

export function useMilestones(options: Options = {}) {
  const [milestones, setMilestones] = useState<MilestoneData[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    let q = query(
      collection(db, 'milestones'),
      orderBy('dueDate', 'asc'),
    );

    // Apply filters
    if (options.projectId) {
      q = query(q, where('projectId', '==', options.projectId));
    }
    if (options.supervisorId) {
      q = query(q, where('supervisorId', '==', options.supervisorId));
    }
    if (options.studentId) {
      q = query(q, where('studentIds', 'array-contains', options.studentId));
    }
    if (options.facultyId) {
      q = query(q, where('facultyId', '==', options.facultyId));
    }
    if (options.statusFilter?.length) {
      q = query(q, where('status', 'in', options.statusFilter));
    }

    const unsub = onSnapshot(q, (snap) => {
      const items: MilestoneData[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id:                    d.id,
          type:                  data.type,
          nameHe:                data.nameHe,
          nameEn:                data.nameEn,
          descriptionHe:         data.descriptionHe,
          descriptionEn:         data.descriptionEn,
          status:                data.status,
          dueDate:               data.dueDate,
          submittedAt:           data.submittedAt ?? null,
          approvalChainHe:       data.approvalChainHe ?? [],
          approvalChainEn:       data.approvalChainEn ?? [],
          requiresExaminers:     data.requiresExaminers ?? false,
          supervisorGradeId:     data.supervisorGradeId ?? null,
          coordinatorApprovedAt: data.coordinatorApprovedAt ?? null,
          examinerIds:           data.examinerIds ?? [],
          defenseDate:           data.defenseDate ?? null,
          defenseRoom:           data.defenseRoom ?? null,
          finalGrade:            data.finalGrade ?? null,
          fileUrls:              data.fileUrls ?? [],
        } as MilestoneData;
      });
      setMilestones(items);
      setLoading(false);
    }, (err) => {
      console.error('useMilestones error:', err);
      setError(err.message);
      setLoading(false);
    });

    return () => unsub();
  }, [
    options.projectId,
    options.supervisorId,
    options.studentId,
    options.facultyId,
    options.statusFilter?.join(','),
  ]);

  // Derived helpers
  const nextPending = milestones.find(
    (m) => m.status === 'pending' || m.status === 'submitted'
  ) ?? null;

  const completedCount = milestones.filter((m) => m.status === 'completed').length;
  const progress = milestones.length > 0
    ? Math.round((completedCount / milestones.length) * 100)
    : 0;

  const overdueCount = milestones.filter((m) => {
    if (m.status === 'completed') return false;
    const days = m.dueDate.toMillis() - Date.now();
    return days < 0;
  }).length;

  return {
    milestones,
    loading,
    error,
    nextPending,
    progress,
    completedCount,
    overdueCount,
  };
}
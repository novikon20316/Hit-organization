import { useState, useEffect } from 'react';
import { apiClient } from '../src/api/apiClient';

interface Options {
  projectId?: string;
  supervisorId?: string;
  studentId?: string;
  facultyId?: string;
  statusFilter?: string[];
}

export function useMilestones(options: Options = {}) {
  const [milestones, setMilestones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { projectId, supervisorId, studentId, facultyId, statusFilter } = options;
  const statusFilterSerialized = statusFilter?.join(',');

  useEffect(() => {
    const fetchMilestonesFromServer = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Pass the original options to the API call
        const queryParams = {
          projectId,
          supervisorId,
          studentId,
          facultyId,
          statusFilter: statusFilterSerialized ? statusFilterSerialized.split(',') : undefined // Axios will read this array cleanly
        };

        const response = await apiClient.getMilestones(queryParams);
        setMilestones(response?.milestones || []);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch academic roadmap.');
        console.log("Axios Base URL:", err.config?.baseURL);
        console.log("Axios Full URL:", err.config?.url);
        console.log("Axios Params:", err.config?.params);
      } finally {
        setLoading(false);
      }
    };

    fetchMilestonesFromServer();
    
  // 🔑 2. Put the individual variables here. ESLint will be completely happy now!
  }, [projectId, supervisorId, studentId, facultyId, statusFilterSerialized]);

  // All your derived UI helper metrics (progress, overdue counts) remain exactly the same!
  const completedCount = milestones.filter((m) => m.status === 'completed').length;
  const progress = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

  return { milestones, loading, error, progress };
}
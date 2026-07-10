import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { apiClient } from '../../src/api/apiClient';
import { useLocalSearchParams } from 'expo-router';

interface Milestone {
  id: string;
  type: string;
  status: string;
}

// Canonical milestone sequence — Firestore returns docs in no particular
// order, so sort explicitly rather than trusting query result order.
const MILESTONE_TYPE_ORDER: Record<string, number> = {
  research_proposal: 0,
  progress_report: 1,
  final_report: 2,
  defense: 3,
};

// 'coordinator_approved' is the only completion status any server code path
// actually sets (coordinatorController.ts). Other statuses in the type union
// ('graded', 'both_examiners_graded', 'completed', ...) are aspirational —
// nothing writes them yet, so treating them as "done" would be speculative.
const DONE_STATUSES = new Set(['coordinator_approved']);

export default function ProjectMilestonesScreen() {
    const { projectId, lang } = useLocalSearchParams();
    const [loading, setLoading] = useState(true);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const total = milestones.length;
    const completed = milestones.filter((m) => DONE_STATUSES.has(m.status)).length;

    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  useEffect(() => {
    if (!projectId) return;

    const fetchMilestones = async () => {
      try {
        // 🚀 REPLACED: Call your clean backend routing pipeline
        const response = await apiClient.get(`/api/projects/${projectId}/milestones`);
        const fetchedMilestones: Milestone[] = response.data?.milestones || [];
        const sorted = [...fetchedMilestones].sort(
          (a, b) => (MILESTONE_TYPE_ORDER[a.type] ?? 99) - (MILESTONE_TYPE_ORDER[b.type] ?? 99)
        );
        setMilestones(sorted);
      } catch (err) {
        console.error("Error fetching milestones:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMilestones();

    const interval = setInterval(fetchMilestones, 10000);
    return () => clearInterval(interval);
  }, [projectId]);

  if (loading) {
    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: '#F8FAFC',
      }}
      contentContainerStyle={{
        padding: 16,
      }}
    >
      {milestones.map((m) => (
        <View
          key={m.id}
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            padding: 18,
            marginBottom: 14,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              marginBottom: 8,
            }}
          >
            {m.type}
          </Text>

          <Text
            style={{
              fontSize: 15,
              color: '#64748B',
            }}
          >
            Status: {m.status}
          </Text>
        </View>
      ))}
      <View style={{ alignItems: 'center', marginTop: 30 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10 }}>
            {lang === 'he' ? 'אחוז התקדמות' : 'Progress'}
        </Text>

        <View
            style={{
            width: 110,
            height: 110,
            borderRadius: 55,
            borderWidth: 10,
            borderColor: '#D1FAE5',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#fff',
            }}
        >
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#10B981' }}>
            {percent}%
            </Text>
        </View>
        </View>
    </ScrollView>
  );
}
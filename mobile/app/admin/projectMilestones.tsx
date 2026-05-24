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

export default function ProjectMilestonesScreen() {
    const { projectId, lang } = useLocalSearchParams();
    const [loading, setLoading] = useState(true);
    const [milestones, setMilestones] = useState<Milestone[]>([]);
    const total = milestones.length;
    const completed = milestones.filter(
    (m) => m.status === 'done' || m.status === 'completed'
    ).length;

    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  useEffect(() => {
    if (!projectId) return;

    const fetchMilestones = async () => {
      try {
        // 🚀 REPLACED: Call your clean backend routing pipeline
        const response = await apiClient.get(`/api/projects/${projectId}/milestones`);
        const fetchedMilestones = response.data?.milestones || [];
        setMilestones(fetchedMilestones);
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
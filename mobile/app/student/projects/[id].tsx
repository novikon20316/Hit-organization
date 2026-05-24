// app/student/project/[id].tsx

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {ProjectPageStyles} from '@/constants'
import {apiClient} from '@/src/api/apiClient';

type Milestone = {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  submitted?: boolean;
  submissionText?: string;
};

type Project = {
  title: string;
  description: string;
  milestones: Milestone[];
};

export default function ProjectPage() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});

  // ─────────────────────────────────────
  // Load project
  // ─────────────────────────────────────
  const fetchProject = async () => {
    try {
      if (!id) return;
      const response = await apiClient.get(`/api/student/projects/${id}`);
      setProject(response.data);
    } catch (err) {
      Alert.alert('Error', 'Failed to load project via gateway cloud network');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProject();
  }, [id]);

  // ─────────────────────────────────────
  // Submit milestone
  // ─────────────────────────────────────
  const submitMilestone = async (milestoneId: string) => {
    if (!project || !id) return;

    const text = textInputs[milestoneId];
    if (!text || text.trim().length === 0) {
      Alert.alert('Error', 'Please write something before submitting');
      return;
    }

    try {
      setSubmitting(milestoneId);
      const response = await apiClient.post(`/api/student/projects/${id}/milestones/${milestoneId}/submit`, { text });
      
      setProject({ ...project, milestones: response.data.milestones });
      Alert.alert('Success', 'Milestone submitted!');
    } catch (err) {
      Alert.alert('Error', 'Failed to safely store document submission');
    } finally {
      setSubmitting(null);
    }
  };

  // ─────────────────────────────────────
  // Loading
  // ─────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.center}>
        <Text>Project not found</Text>
      </View>
    );
  }

  // ─────────────────────────────────────
  // UI
  // ─────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Project header */}
      <View style={styles.header}>
        <Text style={styles.title}>{project.title}</Text>
        <Text style={styles.desc}>{project.description}</Text>
      </View>

      {/* Milestones */}
      <Text style={styles.sectionTitle}>Milestones</Text>

      {project.milestones?.map((m) => (
        <View key={m.id} style={styles.card}>
          <Text style={styles.mTitle}>{m.title}</Text>

          {m.description && (
            <Text style={styles.mDesc}>{m.description}</Text>
          )}

          {m.deadline && (
            <Text style={styles.deadline}>Deadline: {m.deadline}</Text>
          )}

          {m.submitted ? (
            <Text style={styles.submitted}>✅ Submitted</Text>
          ) : (
            <>
              <TextInput
                placeholder="Write your submission..."
                value={textInputs[m.id] || ''}
                onChangeText={(text) =>
                  setTextInputs((prev) => ({ ...prev, [m.id]: text }))
                }
                style={styles.input}
                multiline
              />

              <Pressable
                style={styles.button}
                onPress={() => submitMilestone(m.id)}
                disabled={submitting === m.id}
              >
                <Text style={styles.buttonText}>
                  {submitting === m.id ? 'Submitting...' : 'Submit'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ─────────────────────────────────────
// Styles
// ─────────────────────────────────────
const styles = ProjectPageStyles
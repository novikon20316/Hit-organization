// app/student/project/[id].tsx

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/src/firebase/firebase';

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
  useEffect(() => {
    const fetchProject = async () => {
      try {
        if (!id) return;

        const ref = doc(db, 'projects', id as string);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setProject(snap.data() as Project);
        } else {
          Alert.alert('Error', 'Project not found');
        }
      } catch (err) {
        console.log(err);
        Alert.alert('Error', 'Failed to load project');
      } finally {
        setLoading(false);
      }
    };

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

      const updatedMilestones = project.milestones.map((m) =>
        m.id === milestoneId
          ? { ...m, submitted: true, submissionText: text }
          : m
      );

      await updateDoc(doc(db, 'projects', id as string), {
        milestones: updatedMilestones,
      });

      setProject({ ...project, milestones: updatedMilestones });

      Alert.alert('Success', 'Milestone submitted!');
    } catch (err) {
      console.log(err);
      Alert.alert('Error', 'Failed to submit milestone');
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
const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  desc: {
    marginTop: 6,
    color: '#555',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 12,
  },
  mTitle: {
    fontWeight: '600',
    fontSize: 16,
  },
  mDesc: {
    color: '#555',
    marginTop: 4,
  },
  deadline: {
    marginTop: 6,
    fontSize: 12,
    color: 'red',
  },
  submitted: {
    marginTop: 10,
    color: 'green',
    fontWeight: '600',
  },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  button: {
    marginTop: 10,
    backgroundColor: '#2E86FF',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
});
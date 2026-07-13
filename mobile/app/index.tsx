// app/index.tsx
import { Redirect } from "expo-router";
import { auth } from "../src/firebase/firebase";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { apiClient } from "../src/api/apiClient"; // Use full-stack api wrapper

export default function Index() {
  const [redirectPath, setRedirectPath] = useState<string | null>(null);

  useEffect(() => {
    const checkUserRole = async () => {
      const user = auth.currentUser;

      // Not logged in
      if (!user) {
        setRedirectPath("/(auth)/login");
        return;
      }

      try {
        // 🚀 MOVE TO BACKEND: Instead of direct firestore getDoc, fetch verified profile via API
        const response = await apiClient.get('/api/users/me');
        const role = response.data?.role;

        // Redirect based on backend verified role
        switch (role) {
          case "student":
            setRedirectPath("/student/home");
            break;
          case "supervisor":
          case "secondary_supervisor":
            setRedirectPath("/supervisor/dashboard");
            break;
          case "system_admin":
          case "admin":
            setRedirectPath("/admin/panel");
            break;
          case "coordinator":
            setRedirectPath("/coordinator/home");
            break;
          case "faculty_admin":
            setRedirectPath("/faculty_admin/dashboard");
            break;
          case "program_head":
            setRedirectPath("/program_head/program_head_dashboard");
            break;
          case "administrative_secretary":
            setRedirectPath("/administrative_secretary/administrative_secretary_dashboard");
            break;
          case "grad_school_head":
            setRedirectPath("/grad_school_head/grad_school_head_dashboard");
            break;
          case "internal_examiner":
            setRedirectPath("/examinor/home");
            break;
          default:
            setRedirectPath("/(auth)/login");
        }
      } catch (error) {
        console.log("Backend role resolution error:", error);
        setRedirectPath("/(auth)/login");
      }
    };

    checkUserRole();
  }, []);

  if (!redirectPath) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2E86FF" />
      </View>
    );
  }

  return <Redirect href={redirectPath as any} />;
}
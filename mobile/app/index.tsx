// app/index.tsx
import { Redirect, usePathname } from "expo-router";
import { auth } from "../src/firebase/firebase";
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { apiClient } from "../src/api/apiClient"; // Use full-stack api wrapper

export default function Index() {
  const [redirectPath, setRedirectPath] = useState<string | null>(null);
  // Read fresh at render time — doesn't depend on whether this screen's own
  // effect cleanup actually ran (a native-vs-web navigator-lifecycle detail
  // that's easy to get wrong either way). If the live route has already
  // moved on to something this screen didn't itself set (e.g. the user
  // tapped "Sign Up" from wherever the login redirect below landed them),
  // a slow-resolving role check has nothing left to redirect away from.
  const pathname = usePathname();

  useEffect(() => {
    // Guards against a late-arriving response acting on stale state: this
    // component's `/api/users/me` call can take a while (network + retries
    // upstream), and if the user has already navigated elsewhere in the
    // meantime (e.g. tapped "Sign Up" from the login screen this same
    // effect sent them to), a resolving promise calling setRedirectPath
    // re-fires this component's <Redirect> and yanks them back — this
    // showed up as "tap Sign Up, it flashes briefly, then bounces to
    // login." Whether or not this screen is still actually mounted at that
    // point is a native-vs-web navigator-lifecycle detail that's easy to
    // get wrong either way; not writing to state after cancelled is correct
    // regardless of which it turns out to be.
    let cancelled = false;
    const safeSetRedirectPath = (path: string) => {
      if (!cancelled) setRedirectPath(path);
    };

    const checkUserRole = async () => {
      const user = auth.currentUser;

      // Not logged in
      if (!user) {
        safeSetRedirectPath("/(auth)/login");
        return;
      }

      try {
        // 🚀 MOVE TO BACKEND: Instead of direct firestore getDoc, fetch verified profile via API
        const response = await apiClient.get('/api/users/me');
        const role = response.data?.role;

        // Redirect based on backend verified role
        switch (role) {
          case "student":
            safeSetRedirectPath("/student/home");
            break;
          case "supervisor":
          case "secondary_supervisor":
            safeSetRedirectPath("/supervisor/dashboard");
            break;
          case "system_admin":
          case "admin":
            safeSetRedirectPath("/admin/overview");
            break;
          case "coordinator":
            safeSetRedirectPath("/coordinator/home");
            break;
          case "faculty_admin":
            safeSetRedirectPath("/faculty_admin/dashboard");
            break;
          case "program_head":
            safeSetRedirectPath("/program_head/program_head_dashboard");
            break;
          case "administrative_secretary":
            safeSetRedirectPath("/administrative_coordinator/administrative_coordinator_dashboard");
            break;
          case "grad_school_head":
            safeSetRedirectPath("/grad_school_head/grad_school_head_dashboard");
            break;
          case "internal_examiner":
            safeSetRedirectPath("/examinor/home");
            break;
          default:
            safeSetRedirectPath("/(auth)/login");
        }
      } catch (error) {
        console.log("Backend role resolution error:", error);
        safeSetRedirectPath("/(auth)/login");
      }
    };

    checkUserRole();
    return () => { cancelled = true; };
  }, []);

  const stillOnThisScreen = pathname === "/" || pathname === "/index";

  if (!redirectPath || !stillOnThisScreen) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2E86FF" />
      </View>
    );
  }

  return <Redirect href={redirectPath as any} />;
}
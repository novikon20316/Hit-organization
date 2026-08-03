'use client';

// app/page.tsx
// Root route: no dashboard of its own — it just resolves auth state and
// sends people to the right place. Signed out -> /login. Signed in -> their
// role's home route (same mapping mobile uses via getHomeRoute).

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getHomeRoute } from '@/lib/roles';

export default function RootPage() {
  const router = useRouter();
  const { firebaseUser, userData, activeRole, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) {
      router.replace('/login');
      return;
    }
    router.replace(getHomeRoute(activeRole ?? userData?.role));
  }, [loading, firebaseUser, userData, activeRole, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <p className="text-sm text-muted">…</p>
    </div>
  );
}

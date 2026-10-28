// lib/lastScreen.ts
// Remembers the last page the user was on before opening /notifications,
// where the feedback chat lives — so a feedback message can say which
// screen it's about without asking the user. Module-level, so it survives
// client-side navigation but resets on a full reload (then it's simply
// unknown). Fed from SidebarShell, which every role's layout renders.

let lastScreen: string | null = null;

export function rememberScreen(path: string): void {
  if (path.startsWith('/notifications')) return;
  lastScreen = path;
}

export function getLastScreen(): string | null {
  return lastScreen;
}

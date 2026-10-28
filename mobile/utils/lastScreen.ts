// utils/lastScreen.ts
// Remembers the last screen the user was on before opening the
// notifications tab, where the feedback chat lives — so a feedback message
// can say which screen it's about without asking the user. Same idea as
// web/lib/lastScreen.ts; fed from the root layout's pathname.

let lastScreen: string | null = null;

export function rememberScreen(path: string): void {
  if (path.startsWith('/notifications')) return;
  lastScreen = path;
}

export function getLastScreen(): string | null {
  return lastScreen;
}

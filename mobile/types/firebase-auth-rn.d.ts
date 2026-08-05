// mobile/types/firebase-auth-rn.d.ts
//
// firebase/auth genuinely ships getReactNativePersistence for React Native
// at runtime (Metro resolves the package's "react-native" exports condition
// to @firebase/auth/dist/rn/index.rn.js, which does export it) — but that
// package's exports map lists a bare "types" condition ahead of
// "react-native", so tsc's type resolution always lands on the generic
// dist/auth-public.d.ts instead, which omits it. This augments (not
// replaces — the leading `import` below is what makes this a module
// augmentation rather than a fresh ambient declaration) the real module
// with just the missing type; nothing changes at runtime.
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(
    storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
  ): Persistence;
}

// Web counterpart to secureStorage.ts — Metro picks this file automatically
// for web builds (the .web.ts suffix), native builds keep using the real
// SecureStore-backed implementation. expo-secure-store has no web
// implementation at all — even importing it throws "Cannot find native
// module 'ExpoSecureStore'" on web — so this can't just be a Platform.OS
// branch inside the same file; the native-only import itself must never be
// bundled for web.
//
// localStorage has no SecureStore-style size cap or key-character
// restriction, so no chunking/sanitizing is needed here.

async function getItem(key: string): Promise<string | null> {
  return localStorage.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
}

async function removeItem(key: string): Promise<void> {
  localStorage.removeItem(key);
}

// Matches the ReactNativeAsyncStorage shape expected by firebase/auth's getReactNativePersistence.
export const secureStorage = {
  getItem,
  setItem,
  removeItem,
};

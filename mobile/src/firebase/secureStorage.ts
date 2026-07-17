import * as SecureStore from "expo-secure-store";

// SecureStore rejects keys with characters outside [A-Za-z0-9._-], but Firebase's
// persistence keys look like "firebase:authUser:<apiKey>:[DEFAULT]". Sanitize deterministically.
function sanitizeKey(key: string): string {
  return key.replace(/[^\w.-]/g, "_");
}

// SecureStore values are capped around 2048 bytes (enforced on Android's encrypted
// SharedPreferences backing). Firebase's persisted auth blob (id token + refresh token +
// user metadata) regularly exceeds that, so split it across indexed keys.
const CHUNK_SIZE = 1800;

function chunkKey(base: string, index: number): string {
  return `${base}__${index}`;
}

async function setItem(key: string, value: string): Promise<void> {
  const base = sanitizeKey(key);
  const countKey = `${base}__count`;

  const previousCountStr = await SecureStore.getItemAsync(countKey);
  const previousCount = previousCountStr ? parseInt(previousCountStr, 10) : 0;

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }

  await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(base, i), chunk)));

  // Clear any now-unused chunks left over from a previously longer value.
  if (previousCount > chunks.length) {
    await Promise.all(
      Array.from({ length: previousCount - chunks.length }, (_, i) =>
        SecureStore.deleteItemAsync(chunkKey(base, chunks.length + i))
      )
    );
  }

  await SecureStore.setItemAsync(countKey, String(chunks.length));
}

async function getItem(key: string): Promise<string | null> {
  const base = sanitizeKey(key);
  const countStr = await SecureStore.getItemAsync(`${base}__count`);
  if (!countStr) return null;

  const count = parseInt(countStr, 10);
  const chunks = await Promise.all(
    Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(base, i)))
  );

  if (chunks.some((chunk) => chunk === null)) return null;
  return chunks.join("");
}

async function removeItem(key: string): Promise<void> {
  const base = sanitizeKey(key);
  const countStr = await SecureStore.getItemAsync(`${base}__count`);
  const count = countStr ? parseInt(countStr, 10) : 0;

  await Promise.all([
    SecureStore.deleteItemAsync(`${base}__count`),
    ...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(base, i))),
  ]);
}

// Matches the ReactNativeAsyncStorage shape expected by firebase/auth's getReactNativePersistence.
export const secureStorage = {
  getItem,
  setItem,
  removeItem,
};

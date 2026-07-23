// `crypto.randomUUID()` doesn't exist in React Native's Hermes runtime on
// native (only in browsers/web) — used here only to make a unique storage
// filename, not for anything security-sensitive, so a plain Math.random-based
// v4 UUID avoids pulling in a whole native module (expo-crypto) for it.
export function randomUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

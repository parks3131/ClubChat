// lib/supabase.ts throws at import time if these aren't set. Unit tests
// that only need a *sibling* export from a module which happens to also
// import lib/supabase.ts (e.g. formatDateOfBirth in lib/profile.ts) still
// trigger that import — these are dummy values so tests never need real
// credentials or a running Supabase instance.
process.env.EXPO_PUBLIC_SUPABASE_URL ||= "http://localhost:54321";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key";

// @react-native-async-storage/async-storage's native module isn't
// available under plain Jest (no simulator/device backing it) — jest-expo
// doesn't mock this one for us since it's a separate community package,
// not core Expo. This is the mock the package's own docs recommend.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

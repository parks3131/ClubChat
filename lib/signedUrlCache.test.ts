import { clearSignedUrlCache, signStorageUrls } from "./signedUrlCache";
import { supabase } from "./supabase";

jest.mock("./supabase", () => ({
  supabase: { storage: { from: jest.fn() } },
}));

const mockFrom = supabase.storage.from as jest.MockedFunction<typeof supabase.storage.from>;

// Supabase embeds `iat` at one-second resolution in the signature, so a real
// re-sign of the same path yields a different URL. The counter reproduces
// that: if the memo ever re-signs, the URL visibly changes.
let signCount = 0;
const createSignedUrls = jest.fn(async (paths: string[]) => {
  signCount += 1;
  return {
    data: paths.map((path) => ({ path, signedUrl: `https://cdn.test/${path}?token=sig-${signCount}` })),
    error: null,
  };
});

beforeEach(() => {
  clearSignedUrlCache();
  signCount = 0;
  createSignedUrls.mockClear();
  mockFrom.mockReturnValue({ createSignedUrls } as never);
});

test("a second fetch of the same path returns the identical URL without re-signing", async () => {
  const first = await signStorageUrls("message-photos", ["club/a.jpg"]);
  const second = await signStorageUrls("message-photos", ["club/a.jpg"]);

  expect(second.get("club/a.jpg")).toBe(first.get("club/a.jpg"));
  expect(createSignedUrls).toHaveBeenCalledTimes(1);
});

test("only the uncached paths are sent to be signed", async () => {
  await signStorageUrls("message-photos", ["club/a.jpg"]);
  await signStorageUrls("message-photos", ["club/a.jpg", "club/b.jpg"]);

  expect(createSignedUrls).toHaveBeenNthCalledWith(2, ["club/b.jpg"], expect.any(Number));
});

test("the same path in two buckets is cached separately", async () => {
  const photos = await signStorageUrls("message-photos", ["club/a.jpg"]);
  const posts = await signStorageUrls("club-post-photos", ["club/a.jpg"]);

  expect(posts.get("club/a.jpg")).not.toBe(photos.get("club/a.jpg"));
  expect(createSignedUrls).toHaveBeenCalledTimes(2);
});

test("a duplicated path within one batch is signed once", async () => {
  await signStorageUrls("message-photos", ["club/a.jpg", "club/a.jpg"]);

  expect(createSignedUrls).toHaveBeenCalledWith(["club/a.jpg"], expect.any(Number));
});

test("an entry near expiry is re-signed rather than served stale", async () => {
  const first = await signStorageUrls("message-photos", ["club/a.jpg"]);

  const eightDays = 8 * 24 * 60 * 60 * 1000;
  jest.spyOn(Date, "now").mockReturnValue(Date.now() + eightDays);
  const second = await signStorageUrls("message-photos", ["club/a.jpg"]);
  jest.spyOn(Date, "now").mockRestore();

  expect(second.get("club/a.jpg")).not.toBe(first.get("club/a.jpg"));
  expect(createSignedUrls).toHaveBeenCalledTimes(2);
});

test("no network call is made when every path is already cached", async () => {
  await signStorageUrls("message-photos", ["club/a.jpg"]);
  createSignedUrls.mockClear();

  await signStorageUrls("message-photos", ["club/a.jpg"]);

  expect(createSignedUrls).not.toHaveBeenCalled();
});

test("an empty path list never calls storage", async () => {
  const result = await signStorageUrls("message-photos", []);

  expect(result.size).toBe(0);
  expect(createSignedUrls).not.toHaveBeenCalled();
});

test("clearing the cache forces a fresh signature", async () => {
  const first = await signStorageUrls("message-photos", ["club/a.jpg"]);
  clearSignedUrlCache();
  const second = await signStorageUrls("message-photos", ["club/a.jpg"]);

  expect(second.get("club/a.jpg")).not.toBe(first.get("club/a.jpg"));
});

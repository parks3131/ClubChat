import { File } from "expo-file-system";
import { Platform } from "react-native";

// React Native's Blob polyfill can't convert a local file:// URI's fetch()
// response into a Blob on native — Supabase Storage's upload throws
// "Creating blobs from 'ArrayBuffer' and ArrayBufferView are not
// supported" deep inside that conversion. Web's blob: URLs (from
// pickImageOnWeb/pickDocumentOnWeb) go through the browser's real
// fetch/Blob implementation unaffected, so only native needs the
// workaround: expo-file-system's File.arrayBuffer() reads the raw bytes
// directly, bypassing Blob entirely.
export async function readUploadBody(uri: string): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return response.blob();
  }
  return new File(uri).arrayBuffer();
}

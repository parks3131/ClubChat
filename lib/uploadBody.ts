import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

// React Native's Blob polyfill can't convert a local file:// URI's fetch()
// response into a Blob on native — Supabase Storage's upload throws
// "Creating blobs from 'ArrayBuffer' and ArrayBufferView are not
// supported" deep inside that conversion. Web's blob: URLs (from
// pickImageOnWeb/pickDocumentOnWeb) go through the browser's real
// fetch/Blob implementation unaffected, so only native needs a
// workaround. Tried expo-file-system's brand-new SDK 57 File.arrayBuffer()
// first — worked on iOS but reproduced the identical Blob crash on
// Android, so this uses Supabase's own officially-documented React
// Native upload pattern instead: read the file as base64 (the
// well-established legacy FileSystem API, not the just-shipped one) and
// decode it into a real ArrayBuffer via base64-arraybuffer.
export async function readUploadBody(uri: string): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    return response.blob();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return decode(base64);
}

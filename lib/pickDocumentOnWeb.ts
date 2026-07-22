// expo-document-picker's own web implementation opens its hidden file
// input via `input.dispatchEvent(new MouseEvent("click"))` (same call
// pattern expo-image-picker's web shim used) instead of `input.click()`
// — the exact same real-user-activation gotcha pickImageOnWeb.ts was
// written to bypass. Mirrors that file's fix rather than waiting to hit
// the bug again: a real `.click()` reliably opens the native file dialog
// where a dispatched synthetic event can silently get swallowed by some
// browser configurations. Native platforms are unaffected (expo-document-
// picker's native module doesn't go through this DOM shim at all).
export function pickDocumentOnWeb(): Promise<{ uri: string; name: string; mimeType: string; size: number } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "*/*";
    input.style.display = "none";

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      resolve(
        file
          ? { uri: URL.createObjectURL(file), name: file.name, mimeType: file.type || "application/octet-stream", size: file.size }
          : null
      );
    });

    document.body.appendChild(input);
    input.click();
  });
}

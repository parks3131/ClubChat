// expo-image-picker's web shim (ExponentImagePicker.web.ts) opens its hidden
// file input via `input.dispatchEvent(new MouseEvent("click"))` instead of
// `input.click()`. A synthetic dispatched event only fires JS listeners —
// some real browser configurations (e.g. content-blocking/privacy
// extensions) don't treat that as a genuine user-initiated action and
// silently swallow the native file dialog, even though the click handler
// itself still runs. `.click()` is specced to simulate a real click
// including the browser's default action, which is what actually opens the
// dialog reliably. This bypasses the library's web path entirely rather
// than patching node_modules (native platforms are unaffected — they use a
// real native module, not this DOM shim).
export function pickImageOnWeb(options?: { captureCamera?: boolean }): Promise<{ uri: string; mimeType: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // Hints mobile browsers to open the camera directly rather than a
    // gallery/file picker — ignored (harmlessly falls back to the normal
    // picker) on desktop browsers with no camera-capture affordance.
    if (options?.captureCamera) input.setAttribute("capture", "environment");
    input.style.display = "none";

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      resolve(file ? { uri: URL.createObjectURL(file), mimeType: file.type || "image/jpeg" } : null);
    });

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * The one way this app writes a file to disk.
 *
 * In the browser that is an `<a download>` link, which is the only option available. Inside
 * the desktop webview it is not an option at all: with no download handler registered,
 * WKWebView cancels the navigation and WebView2 saves the file somewhere the user never
 * chose. Neither reports anything back, so a failed export looks exactly like a dead button.
 * The desktop build therefore hands the bytes to the Tauri shell, which opens a native
 * "Save as" dialog and writes the file itself.
 */

import { invoke } from "@tauri-apps/api/core";

/** Matches `FILE_NAME_HEADER` in the Tauri shell. */
const FILE_NAME_HEADER = "x-glance-file-name";

const SAVE_COMMAND = "save_export_file";

declare global {
  interface Window {
    /**
     * Injected by Tauri into every webview. Present regardless of `withGlobalTauri`, unlike
     * `window.__TAURI__`, which this app turns off.
     */
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;
}

/**
 * Write `blob` to disk as `fileName`, asking the user where when running on the desktop.
 *
 * Resolves `false` if the user dismissed the save dialog, which is a normal outcome and not
 * something to report. Rejects if the file could not be written, so that callers can surface
 * the reason rather than leaving the button looking broken.
 */
export async function saveBlob(blob: Blob, fileName: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    downloadBlobViaLink(blob, fileName);
    return true;
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Sent as a raw body rather than a JSON argument: exports reach tens of megabytes, and a
  // byte array in JSON costs roughly four times that. The name travels as a header instead,
  // percent-encoded so that non-ASCII structure names survive as a header value.
  return await invoke<boolean>(SAVE_COMMAND, bytes, {
    headers: { [FILE_NAME_HEADER]: encodeURIComponent(fileName) },
  });
}

/** Browser save path: a synthetic link click against an object URL. */
function downloadBlobViaLink(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in this tick can cancel the download before it starts, because the click only
  // schedules it. One turn of the event loop is enough for the fetch to be under way.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

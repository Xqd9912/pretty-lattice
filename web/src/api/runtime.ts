/**
 * Where the API lives, and how we are allowed to talk to it.
 *
 * In the browser (`prl gui`, or `bun run dev` behind the Vite proxy) the page and the API
 * share an origin, so a relative "/api/..." path already points at the right place and no
 * token is involved.
 *
 * In the desktop app the page is loaded from the app itself, not from the server, so the
 * same relative path would resolve back to the webview. The Tauri shell therefore injects
 * the server's real address and a per-launch token into `window.__PRETTY_LATTICE_API__`
 * before any of our code runs, and we route every request through that.
 */

export interface DesktopApiConfig {
  baseUrl: string;
  token: string;
}

declare global {
  interface Window {
    __PRETTY_LATTICE_API__?: DesktopApiConfig;
  }
}

export const API_TOKEN_HEADER = "x-pretty-lattice-token";

function desktopConfig(): DesktopApiConfig | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.__PRETTY_LATTICE_API__;
}

export function isDesktopRuntime(): boolean {
  return desktopConfig() !== undefined;
}

/** Absolute URL for an API path. Returns the path unchanged in the browser. */
export function apiUrl(path: string): string {
  const config = desktopConfig();
  if (!config) {
    return path;
  }
  return `${config.baseUrl.replace(/\/$/, "")}${path}`;
}

/** fetch() against the API, with the desktop token attached when there is one. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const config = desktopConfig();
  if (!config) {
    return fetch(path, init);
  }

  const headers = new Headers(init.headers);
  headers.set(API_TOKEN_HEADER, config.token);
  return fetch(apiUrl(path), { ...init, headers });
}

import { afterEach, describe, expect, mock, test } from "bun:test";

interface RecordedInvoke {
  cmd: string;
  payload: unknown;
  options: { headers?: Record<string, string> } | undefined;
}

const invocations: RecordedInvoke[] = [];
let invokeResult: Promise<unknown> = Promise.resolve(true);

mock.module("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, payload: unknown, options?: { headers?: Record<string, string> }) => {
    invocations.push({ cmd, payload, options });
    return invokeResult;
  },
}));

const { saveBlob } = await import("../src/export/saveFile");

afterEach(() => {
  invocations.length = 0;
  invokeResult = Promise.resolve(true);
  delete window.__TAURI_INTERNALS__;
});

describe("saveBlob in the browser", () => {
  test("clicks a download link and keeps the object URL alive past the click", async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = () => {
      const url = `blob:test-${created.length}`;
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };

    const clicked: Array<{ download: string; href: string; connected: boolean }> = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicked.push({
        download: this.download,
        href: this.href,
        connected: this.isConnected,
      });
    };

    try {
      const saved = await saveBlob(new Blob(["r,g\n1,2"]), "pair-distribution.csv");

      expect(saved).toBe(true);
      expect(invocations).toHaveLength(0);
      expect(clicked).toEqual([
        { download: "pair-distribution.csv", href: "blob:test-0", connected: true },
      ]);
      // Revoking in the click's own tick can cancel the download before it starts.
      expect(revoked).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(revoked).toEqual(["blob:test-0"]);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
    }
  });
});

describe("saveBlob on the desktop", () => {
  test("sends raw bytes with the file name as a percent-encoded header", async () => {
    window.__TAURI_INTERNALS__ = {};

    const saved = await saveBlob(new Blob([new Uint8Array([137, 80, 78, 71])]), "chart.png");

    expect(saved).toBe(true);
    expect(invocations).toHaveLength(1);
    const [call] = invocations;
    expect(call!.cmd).toBe("save_export_file");
    expect(Array.from(call!.payload as Uint8Array)).toEqual([137, 80, 78, 71]);
    expect(call!.options?.headers).toEqual({ "x-glance-file-name": "chart.png" });
  });

  test("percent-encodes non-ASCII file names so they survive as a header value", async () => {
    window.__TAURI_INTERNALS__ = {};

    await saveBlob(new Blob(["x"]), "结构 图.png");

    expect(invocations[0]!.options?.headers).toEqual({
      "x-glance-file-name": "%E7%BB%93%E6%9E%84%20%E5%9B%BE.png",
    });
  });

  test("reports a dismissed save dialog as not saved", async () => {
    window.__TAURI_INTERNALS__ = {};
    invokeResult = Promise.resolve(false);

    expect(await saveBlob(new Blob(["x"]), "chart.csv")).toBe(false);
  });

  test("propagates a write failure instead of swallowing it", async () => {
    window.__TAURI_INTERNALS__ = {};
    invokeResult = Promise.reject(new Error("Could not write /tmp/chart.csv"));

    await expect(saveBlob(new Blob(["x"]), "chart.csv")).rejects.toThrow(
      "Could not write /tmp/chart.csv",
    );
  });
});

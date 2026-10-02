/**
 * Shared CDP client for the lightbox probes.
 *
 * Why this file exists
 * --------------------
 * Every probe in this folder has to do the same three things before it can
 * measure anything, and getting the ORDER wrong produces failures that look
 * like product bugs:
 *
 *   1. Enable Page/Runtime/Log/Network. If you enable after navigating, the
 *      events race the first paint and you get phantom "console error" or
 *      "request missing" reports.
 *   2. Emulation.setTouchEmulationEnabled. Headless Chrome reports
 *      `(hover: hover)` = true and fires NO touch events at all, so any swipe
 *      probe silently measures a desktop and "passes" for the wrong reason.
 *   3. Page.navigate LAST.
 *
 * A fresh --user-data-dir per launch is not optional: reusing a profile dir
 * that another agent's Chrome still holds makes Chrome exit with
 * "Permission denied" and the probe reports a failure that has nothing to do
 * with the site.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HOST = "127.0.0.1";

/** Ports 9401-9409 only: other agents hold the rest of the range. */
export const PORT = Number(process.env.CDP_PORT || 9401);

async function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://${HOST}:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Chrome devtools never came up on ${port}`);
}

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "cdp-lb-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${PORT}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const version = await waitForPort(PORT);

  // Attach to the about:blank target, then make a dedicated page target.
  const list = await (await fetch(`http://${HOST}:${PORT}/json/list`)).json();
  const target = list.find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        `page threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`,
      );
    }
    return r.result.value;
  };

  return {
    send,
    evaluate,
    events,
    browser: version.Browser,

    /** Navigate and wait for the SPA to finish painting. */
    async goto(url, settleMs = 1200) {
      await send("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, settleMs));
    },

    /** Resolved request log: url + encodedDataLength per network event. */
    requests(filterRe) {
      const byId = new Map();
      for (const e of events) {
        if (e.method === "Network.requestWillBeSent") {
          byId.set(e.params.requestId, { url: e.params.request.url, bytes: 0 });
        }
        if (e.method === "Network.loadingFinished" && byId.has(e.params.requestId)) {
          byId.get(e.params.requestId).bytes = e.params.encodedDataLength;
        }
      }
      const all = [...byId.values()];
      return filterRe ? all.filter((r) => filterRe.test(r.url)) : all;
    },

    consoleErrors() {
      const out = [];
      for (const e of events) {
        if (e.method === "Log.entryAdded" && e.params.entry.level === "error") {
          out.push(e.params.entry.text);
        }
        if (
          e.method === "Runtime.exceptionThrown" ||
          (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")
        ) {
          out.push(
            e.params.exceptionDetails?.exception?.description ||
              e.params.args?.map((a) => a.value ?? a.description).join(" "),
          );
        }
      }
      return out;
    },

    async shot(path) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      const { writeFileSync } = await import("node:fs");
      writeFileSync(path, Buffer.from(data, "base64"));
      return path;
    },

    async close() {
      try {
        ws.close();
      } catch {}
      proc.kill();
      // Wait for the debug port to actually free before the next launch. A
      // follow-up launch that races this fails with "Chrome devtools never came
      // up", which reads like a Chrome problem and is really a shutdown race.
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        try {
          await fetch(`http://${HOST}:${PORT}/json/version`);
        } catch {
          return;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    },
  };
}

/** iPhone 16 viewport. Applied AFTER the domains are enabled, see the header. */
export async function phone(c, width = 393, height = 852, dpr = 3) {
  await c.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: true,
  });
  await c.send("Emulation.setUserAgentOverride", {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
  });
}

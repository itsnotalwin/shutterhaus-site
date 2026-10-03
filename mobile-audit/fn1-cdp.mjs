// Minimal raw-CDP driver over the global WebSocket (node >= 22). fn-aud1 namespace.
import { writeFileSync } from "node:fs";

export const SITE = "https://shutterhausvisuals.co.za/";
export const SHOTS =
  "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\shots\\";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connect() {
  const v = await (await fetch("http://127.0.0.1:9333/json/version")).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("ws fail"));
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method) {
      for (const l of listeners) l(m);
    }
  };
  const raw = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });
  return { ws, raw, listeners, close: () => ws.close() };
}

export async function newPage(conn) {
  const { targetId } = await conn.raw("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await conn.raw("Target.attachToTarget", { targetId, flatten: true });
  const send = (m, p = {}) => conn.raw(m, p, sessionId);

  const bucket = { logs: [], errors: [], failed: [], responses: [], finished: [] };
  const onEvent = (m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Log.entryAdded") {
      bucket.logs.push(m.params.entry);
      if (m.params.entry.level === "error") bucket.errors.push(m.params.entry);
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      bucket.errors.push({
        level: "error",
        source: "exceptionThrown",
        text: (d.exception && d.exception.description) || d.text,
        url: d.url,
        line: d.lineNumber,
      });
    } else if (m.method === "Network.loadingFailed") {
      bucket.failed.push({
        type: m.params.type,
        errorText: m.params.errorText,
        blockedReason: m.params.blockedReason,
        canceled: m.params.canceled,
        requestId: m.params.requestId,
      });
    } else if (m.method === "Network.responseReceived") {
      bucket.responses.push({
        url: m.params.response.url,
        status: m.params.response.status,
        type: m.params.type,
        requestId: m.params.requestId,
      });
    } else if (m.method === "Network.loadingFinished") {
      bucket.finished.push({
        url: m.params.requestId,
        encodedDataLength: m.params.encodedDataLength,
        requestId: m.params.requestId,
      });
    }
  };
  conn.listeners.add(onEvent);

  // Enable every domain FIRST, before metrics override or navigation.
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("DOM.enable");

  const waiters = [];
  const waitFor = (method, timeout = 20000) =>
    new Promise((res) => {
      const w = (m) => {
        if (m.sessionId === sessionId && m.method === method) {
          conn.listeners.delete(w);
          clearTimeout(t);
          res(m.params);
        }
      };
      const t = setTimeout(() => {
        conn.listeners.delete(w);
        res(null);
      }, timeout);
      conn.listeners.add(w);
    });

  const page = {
    sessionId,
    send,
    bucket,
    waitFor,
    reset() {
      bucket.logs.length = 0;
      bucket.errors.length = 0;
      bucket.failed.length = 0;
      bucket.responses.length = 0;
      bucket.finished.length = 0;
    },
    dispose() {
      conn.listeners.delete(onEvent);
    },
  };
  return page;
}

export async function device(page, w, h, dpr = 3, mobile = true) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: dpr,
    mobile,
    screenWidth: w,
    screenHeight: h,
  });
  await page.send("Emulation.setTouchEmulationEnabled", {
    enabled: mobile,
    maxTouchPoints: mobile ? 5 : 1,
  });
}

export async function goto(page, url) {
  const loaded = page.waitFor("Page.loadEventFired", 25000);
  await page.send("Page.navigate", { url });
  await loaded;
  await sleep(1500);
}

export async function evalJs(page, expr) {
  const r = await page.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) {
    return {
      __error:
        (r.exceptionDetails.exception && r.exceptionDetails.exception.description) ||
        r.exceptionDetails.text ||
        "eval error",
    };
  }
  return r.result.value;
}

export async function shot(page, name) {
  const r = await page.send("Page.captureScreenshot", { format: "png" });
  const p = SHOTS + name;
  writeFileSync(p, Buffer.from(r.data, "base64"));
  return p;
}

export async function scrollShot(page, name, y) {
  await evalJs(page, `window.scrollTo(0, ${y}); 1`);
  await sleep(700);
  return shot(page, name);
}
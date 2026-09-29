// Dumps WHY Chrome refuses the custom domain, instead of guessing.
// The verify suite only saw "Privacy error" — this asks Chrome directly.
const PORT = process.env.CDP_PORT || "9222";
const URL_ = process.argv[2];

const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(v.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) =>
  new Promise((res) => {
    const msgId = ++id;
    pending.set(msgId, res);
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
};

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Security.enable", {}, sessionId);
await send("Page.enable", {}, sessionId);
await send("Page.navigate", { url: URL_ }, sessionId);
await new Promise((r) => setTimeout(r, 9000));

const ev = async (expr) =>
  (await send(
    "Runtime.evaluate",
    { expression: expr, returnByValue: true },
    sessionId,
  ))?.result?.value;

console.log("title :", await ev("document.title"));
console.log("text  :", (await ev("document.body.innerText") || "").slice(0, 700));

const sec = await send(
  "Security.securityStateChanged",
  {},
  sessionId,
);
console.log("sec   :", JSON.stringify(sec));
process.exit(0);

const URL = process.argv[2] ?? "https://itsnotalwin.github.io/shutterhaus-site/";
const CDP = "http://127.0.0.1:9222";
const t = await (await fetch(`${CDP}/json/new?url=about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method === "Log.entryAdded") errors.push(`[${d.params.entry.level}] ${d.params.entry.text} ${d.params.entry.url ?? ""}`);
  else if (d.method === "Runtime.exceptionThrown") errors.push(`[exception] ${d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text}`);
  else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(`[console] ${d.params.args.map(a => a.value ?? a.description).join(" ")}`);
};
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
await send("Page.navigate", { url: URL });
await sleep(6000);
console.log("URL:", await ev("location.href"));
console.log("TITLE:", await ev("document.title"));
console.log("SCRIPTS:", JSON.stringify(await ev("[...document.scripts].map(s=>s.src)")));
console.log("APP_HTML_LEN:", await ev("document.getElementById('app')?.innerHTML.length"));
console.log("APP_HEAD:", JSON.stringify(await ev("document.getElementById('app')?.innerHTML.slice(0,300)")));
console.log("LOGO:", await ev("!!document.querySelector('.logo')"));
console.log("=== ERRORS ===");
console.log(errors.slice(0, 10).join("\n") || "(none)");
ws.close(); process.exit(0);

/** Minimal CDP client shared by browser regression checks. */
export async function browser() {
  const endpoint = `http://127.0.0.1:${process.env.CDP_PORT ?? 9222}`;
  const target = await (await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    } else for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(key, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Browser evaluation failed');
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Condition not met: ${expression}`);
  };
  const viewport = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  const click = async (selector) => {
    const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
    const params = { key, code, windowsVirtualKeyCode, modifiers };
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params, text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.bringToFront');
  return { send, evaluate, until, viewport, click, key, on: listener => listeners.add(listener), close: async () => { socket.close(); await fetch(`${endpoint}/json/close/${target.id}`); } };
}

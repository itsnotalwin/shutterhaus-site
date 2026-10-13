import { SITE } from "./config";
import { escapeHtml } from "./layout";

export function mountContactForm(): () => void {
  const form = document.getElementById("cform") as HTMLFormElement | null;
  const note = document.getElementById("cform-note");
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!form || !note || !submit) return () => {};
  const lifecycle = new AbortController();
  let sending = false;

  // Preselect the package the visitor tapped "Book now" on.
  //
  // "Book now" on a tier card links to `contact.html?package=<tier name>`, so
  // arriving from a card arrives already having chosen that package. Matched
  // against the select's own options rather than assigning a value outright:
  // setting an unknown value silently leaves the select on option 0, which
  // would show "Starter" for someone who tapped "Signature". A no-match is
  // therefore a no-op, not a wrong answer.
  //
  // Runs on arrival; the contact page is not repainted by gallery responses.
  const draftKey = 'shutterhaus-enquiry-draft-v1';
  let restored = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    if (saved && Date.now() - saved.at < 24 * 60 * 60 * 1000) {
      for (const [key,value] of Object.entries(saved.fields)) {
        const input = form?.elements.namedItem(key) as HTMLInputElement | null;
        if (input && typeof value === 'string') input.value = value;
      }
      restored = true;
    }
  } catch { /* Storage can be disabled; the live form still works. */ }
  const saveDraft = () => {
    const fields: Record<string,string> = {};
    for (const key of ['name','email','kind','message']) {
      fields[key] = (form?.elements.namedItem(key) as HTMLInputElement | null)?.value ?? '';
    }
    try { sessionStorage.setItem(draftKey, JSON.stringify({at:Date.now(), fields})); } catch { /* optional */ }
  };
  const clearDraft = () => { try { sessionStorage.removeItem(draftKey); } catch { /* optional */ } };
  form.addEventListener('input', saveDraft, { signal: lifecycle.signal });
  form.addEventListener('change', saveDraft, { signal: lifecycle.signal });
  const wanted = new URLSearchParams(location.search).get("package");
  const kind = document.getElementById("cform-kind") as HTMLSelectElement | null;
  if (wanted && kind) {
    const hit = Array.from(kind.options).find((o) => o.value === wanted);
    if (hit && !restored) kind.value = wanted;
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    const fd = new FormData(form);
    const get = (k: string) => String(fd.get(k) ?? "").trim();

    // Honeypot. A real visitor cannot see or focus this field, so anything in it
    // came from a script filling every input it finds. Pretend it worked: a bot
    // told "sent" learns to retry with the field left empty, whereas an error
    // tells it the trap exists. Nothing is posted either way.
    if (get("_website")) {
      if (note) note.textContent = "Thanks, got it. I'll reply shortly.";
      form.reset();
      clearDraft();
      return;
    }

    if (!get("name") || !get("email") || !get("message")) {
      if (note) note.textContent = "Please fill in name, email and message.";
      const missing = ["name", "email", "message"].find((key) => !get(key));
      form.querySelector<HTMLElement>(`[name="${missing}"]`)?.focus();
      return;
    }

    // Reject malformed addresses. Domain spelling and delivery are the server's
    // job; this only rejects things that are definitely not addresses.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(get("email"))) {
      if (note) note.textContent = "That email address doesn't look right. Check it?";
      form.querySelector<HTMLElement>('[name="email"]')?.focus();
      return;
    }

    if (!form.reportValidity()) return;

    if (SITE.contact.formEndpoint) {
      saveDraft();
      sending = true;
      form.setAttribute("aria-busy", "true");
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Sending…";
      }
      if (note) note.textContent = "Sending your message…";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(SITE.contact.formEndpoint, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: fd,
          signal: AbortSignal.any([controller.signal, lifecycle.signal]),
        });
        if (lifecycle.signal.aborted) return;
        if (!res.ok) throw new Error(`form endpoint ${res.status}`);
        if (note) note.textContent = "Thanks, got it. I'll reply shortly.";
        form.reset();
        clearDraft();
        return;
      } catch {
        if (lifecycle.signal.aborted) return;
        if (note) note.innerHTML = `That didn't send. Your message is saved here. <a href="mailto:${escapeHtml(SITE.contact.email)}">Email me directly</a> or try again.`;
        return;
      } finally {
        clearTimeout(timeout);
        sending = false;
        form.removeAttribute("aria-busy");
        if (submit) {
          submit.disabled = false;
          submit.textContent = "Send message";
        }
      }
    }

    const subject = encodeURIComponent(`Enquiry — ${get("kind")}`);
    const body = encodeURIComponent(
      `${get("message")}\n\n— ${get("name")} (${get("email")})`,
    );
    location.href = `mailto:${SITE.contact.email}?subject=${subject}&body=${body}`;
    // Don't promise a hand-off we can't confirm: on a phone with no mail app
    // this does nothing at all. Show the address so they can copy it instead.
    if (note) {
      note.innerHTML = `If nothing opened, email me directly: <a href="mailto:${escapeHtml(SITE.contact.email)}">${escapeHtml(SITE.contact.email)}</a>`;
    }
  }, { signal: lifecycle.signal });
  return () => lifecycle.abort();
}


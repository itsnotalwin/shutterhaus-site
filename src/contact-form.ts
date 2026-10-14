import { SITE } from './config';

const DRAFT_KEY = 'shutterhaus-enquiry-draft-v1';
const fields = ['name', 'email', 'kind', 'message'] as const;
type Draft = Partial<Record<(typeof fields)[number], string>>;
let memoryDraft: Draft = {};
let appliedPackage = false;

/** Drafts stay in this tab's session; storage restrictions never block enquiry. */
export function wireContact(): void {
  const form = document.querySelector<HTMLFormElement>('#cform');
  const note = document.querySelector<HTMLElement>('#cform-note');
  if (!form || !note) return;
  const control = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  let draft = memoryDraft;
  try { draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') as Draft; } catch { /* In-memory fallback. */ }
  if (draft && typeof draft === 'object') for (const field of fields) {
    if (typeof draft[field] === 'string') control(field).value = draft[field]!;
  }
  const wanted = new URLSearchParams(location.search).get('package');
  const kind = control('kind') as HTMLSelectElement;
  if (!kind.value) kind.selectedIndex = 0;
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const restoredVisit = navigation?.type === 'reload' || navigation?.type === 'back_forward';
  if (!appliedPackage && wanted && !(restoredVisit && draft?.kind) && [...kind.options].some(o => o.value === wanted)) kind.value = wanted;
  appliedPackage = true;
  const save = () => {
    memoryDraft = Object.fromEntries(fields.map(name => [name, control(name).value]));
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(memoryDraft)); } catch { /* Storage may be disabled. */ }
  };
  const clear = () => {
    memoryDraft = {};
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage may be disabled. */ }
  };
  form.addEventListener('input', save);
  form.addEventListener('change', save);
  let sending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) || '').trim();
    if (value('_website')) return;
    fields.forEach(name => control(name).removeAttribute('aria-invalid'));
    const missing = ['name', 'email', 'message'].find(name => !value(name));
    const invalidEmail = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value('email'));
    if (missing || invalidEmail) {
      const field = control(missing || 'email');
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', 'cform-note');
      note.textContent = missing ? 'Please fill in name, email and message.' : "That email address doesn't look right. Check it?";
      field.focus();
      return;
    }
    save();
    if (!SITE.contact.formEndpoint) {
      const subject = encodeURIComponent(`Enquiry — ${value('kind')}`);
      const body = encodeURIComponent(`${value('message')}\n\n— ${value('name')} (${value('email')})`);
      location.href = `mailto:${SITE.contact.email}?subject=${subject}&body=${body}`;
      note.textContent = `If nothing opened, email me directly: ${SITE.contact.email}`;
      return;
    }
    sending = true;
    submit.disabled = true;
    submit.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    note.textContent = 'Sending your enquiry…';
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(SITE.contact.formEndpoint, {method:'POST', headers:{Accept:'application/json'}, body:data, signal:controller.signal});
      if (!response.ok) throw new Error(`Form response ${response.status}`);
      note.textContent = "Thanks, got it. I'll reply shortly.";
      form.reset();
      clear();
    } catch {
      note.textContent = "That didn't send. Your draft is saved in this tab. Try again or email me directly instead.";
    } finally {
      clearTimeout(timeout);
      sending = false;
      submit.disabled = false;
      submit.textContent = 'Send message';
      form.removeAttribute('aria-busy');
    }
  });
}

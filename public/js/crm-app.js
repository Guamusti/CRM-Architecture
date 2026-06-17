'use strict';
/* CRM white-label — frontend profesional sin build (React UMD + htm, CSP-safe).
   SEGURIDAD: aquí NO hay lógica de seguridad. Los permisos del rol solo
   ocultan controles como mejora de UX; el backend decide y valida SIEMPRE.
   - Sin dangerouslySetInnerHTML, sin innerHTML, sin scripts inline.
   - Sin dependencias CDN nuevas (React/ReactDOM/htm/Tailwind self-hosted).
   - No se registran tokens ni datos personales en consola. */

const { useState, useEffect, useCallback, useRef, useMemo } = React;
const html = htm.bind(React.createElement);

// ================================================================
// API y sesión
// ================================================================
function getSession() {
  try { return JSON.parse(sessionStorage.getItem('crm_session')) || null; }
  catch { return null; }
}
function setSession(s) {
  if (s) sessionStorage.setItem('crm_session', JSON.stringify(s));
  else sessionStorage.removeItem('crm_session');
}

async function api(path, { method = 'GET', body, query } = {}) {
  const session = getSession();
  const qs = query
    ? '?' + new URLSearchParams(Object.fromEntries(
        Object.entries(query).filter(([, v]) => v !== '' && v != null)
      )).toString()
    : '';
  const res = await fetch(`/api${path}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && session) { setSession(null); window.location.reload(); return; }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `Error ${res.status}`);
  return json;
}

// ================================================================
// Catálogos, permisos (espejo UX) y formato
// ================================================================
const LEAD_STATUS = { new: 'Nuevo', contacted: 'Contactado', qualified: 'Cualificado', unqualified: 'No cualificado', converted: 'Convertido', lost: 'Perdido' };
const PRIORITY = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
const SOURCE = { web: 'Web', referral: 'Referido', cold_call: 'Puerta fría', email: 'Email', social: 'RRSS', event: 'Evento', partner: 'Partner', inbound: 'Inbound', other: 'Otro' };
const COMPANY_STATUS = { prospect: 'Prospecto', active: 'Activa', customer: 'Cliente', inactive: 'Inactiva', former_customer: 'Ex-cliente' };
const TASK_STATUS = { pending: 'Pendiente', in_progress: 'En curso', done: 'Hecha', cancelled: 'Cancelada' };
const OPP_STATUS = { open: 'Abierta', won: 'Ganada', lost: 'Perdida' };
const ROLES = { owner: 'Owner', admin: 'Admin', manager: 'Manager', worker: 'Comercial', caja: 'Caja' };
const ENTITY_LABEL = { lead: 'Lead', company: 'Empresa', contact: 'Contacto', opportunity: 'Oportunidad' };
const FIELD_TYPES = { text: 'Texto', number: 'Número', date: 'Fecha', boolean: 'Sí/No', select: 'Lista' };
const CONSENT = { not_requested: 'No solicitado', requested: 'Solicitado', granted: 'Concedido', revoked: 'Revocado' };
const LEGAL_BASIS = { legitimate_interest: 'Interés legítimo', contract: 'Relación contractual', consent: 'Consentimiento', legal_obligation: 'Obligación legal' };

const ROLE_PERMS = {
  owner: ['read', 'create', 'update', 'delete', 'assign', 'close', 'pipeline', 'export', 'gdpr', 'admin', 'import'],
  admin: ['read', 'create', 'update', 'delete', 'assign', 'close', 'pipeline', 'export', 'gdpr', 'admin', 'import'],
  manager: ['read', 'create', 'update', 'assign', 'close', 'export', 'import'],
  worker: ['read', 'create', 'update'],
  caja: [],
};
function can(action) {
  const session = getSession();
  return (ROLE_PERMS[session?.user?.role] || []).includes(action);
}

const STATUS_COLOR = {
  new: 'bg-slate-100 text-slate-600', contacted: 'bg-sky-100 text-sky-700',
  qualified: 'bg-indigo-100 text-indigo-700', unqualified: 'bg-slate-100 text-slate-500',
  converted: 'bg-emerald-100 text-emerald-700', lost: 'bg-red-100 text-red-700',
  open: 'bg-sky-100 text-sky-700', won: 'bg-emerald-100 text-emerald-700',
  prospect: 'bg-amber-100 text-amber-700', active: 'bg-emerald-100 text-emerald-700',
  customer: 'bg-indigo-100 text-indigo-700', inactive: 'bg-slate-100 text-slate-500',
  former_customer: 'bg-slate-100 text-slate-500',
  pending: 'bg-amber-100 text-amber-700', in_progress: 'bg-sky-100 text-sky-700',
  done: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-slate-100 text-slate-500',
};
const PRIORITY_COLOR = { low: 'bg-slate-200 text-slate-700', medium: 'bg-sky-100 text-sky-700', high: 'bg-amber-100 text-amber-700', urgent: 'bg-red-100 text-red-700' };
const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const fmtNum = (v) => v == null ? '—' : Number(v).toLocaleString('es-ES');
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('es-ES') : '—';
const fmtDateTime = (v) => v ? new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const initials = (s) => (s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Preferencias de UI por usuario (columnas, vistas guardadas). Solo
// configuración de presentación; nunca datos sensibles ni tokens.
function prefKey(kind, resource) {
  const u = getSession()?.user?.id || 'anon';
  return `crm_${kind}_${u}_${resource}`;
}
function loadPref(kind, resource, def) {
  try { const v = JSON.parse(localStorage.getItem(prefKey(kind, resource))); return v ?? def; }
  catch { return def; }
}
function savePref(kind, resource, val) {
  try { localStorage.setItem(prefKey(kind, resource), JSON.stringify(val)); } catch { /* almacenamiento no disponible */ }
}

// ================================================================
// Iconos SVG inline (sin dependencias). stroke = currentColor.
// ================================================================
const ICON_PATHS = {
  dashboard: 'M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M10 20v-5h4v5',
  pipeline: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z',
  forecast: 'M4 19V5M4 19h16M8 16v-4M12 16V8M16 16v-6',
  lead: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  building: 'M4 21V5l8-2v18M12 21V9l8 2v10M7 8v.01M7 12v.01M16 13v.01M16 17v.01',
  contacts: 'M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  opportunity: 'M4 8h16v11H4zM9 8V6h6v2M4 13h16',
  task: 'M9 11l3 3 7-7M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9',
  product: 'M21 7.5 12 12 3 7.5 12 3zM3 7.5V17l9 4.5M21 7.5V17l-9 4.5M12 12v9.5',
  bolt: 'M13 3 4 14h7l-1 7 9-11h-7z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  billing: 'M3 7h18v10H3zM3 11h18',
  shield: 'M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 13H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 3.4V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 .3 1.9',
  search: 'M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  chevronDown: 'm6 9 6 6 6-6',
  chevronLeft: 'm15 6-6 6 6 6',
  chevronRight: 'm9 6 6 6-6 6',
  columns: 'M4 4h16v16H4zM9 4v16M15 4v16',
  filter: 'M4 5h16M7 12h10M10 19h4',
  tag: 'M3 12 12 3h8v8L11 20zM7.5 7.5h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L18 10l-4-4L4 16zM14 6l4 4',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
  convert: 'M4 7h11l-3-3M20 17H9l3 3',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  check: 'M5 12l5 5L20 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  inbox: 'M3 13h5l1 3h6l1-3h5M5 5h14l2 8v6H3v-6z',
  star: 'M12 4l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z',
  logout: 'M15 12H4m0 0 4-4m-4 4 4 4M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4',
};
function Icon({ name, className = 'w-5 h-5' }) {
  const d = ICON_PATHS[name];
  if (!d) return html`<span class=${className}></span>`;
  return html`<svg class=${className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d=${d} /></svg>`;
}

// ================================================================
// Primitivas de UI
// ================================================================
function Badge({ value, map, colorMap }) {
  if (value === null || value === undefined || value === '') return html`<span class="text-slate-400">—</span>`;
  const color = (colorMap && colorMap[value]) || STATUS_COLOR[value] || 'bg-slate-100 text-slate-600';
  return html`<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}">${(map && map[value]) || value}</span>`;
}

function Toast({ toast }) {
  if (!toast) return null;
  const color = toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600';
  return html`<div class="fixed bottom-4 right-4 z-[60] ${color} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm max-w-md animate-[fadein_.15s_ease]" role="status">${toast.msg}</div>`;
}

function Spinner({ label = 'Cargando…' }) {
  return html`
    <div class="flex items-center justify-center gap-2 p-8 text-slate-400 text-sm">
      <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" class="opacity-25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      ${label}
    </div>`;
}

function TableSkeleton({ rows = 6, cols = 5 }) {
  return html`
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <div class="h-9 bg-slate-50 border-b"></div>
      ${Array.from({ length: rows }).map((_, i) => html`
        <div key=${i} class="flex gap-4 px-4 py-3 border-b last:border-0">
          ${Array.from({ length: cols }).map((__, j) => html`
            <div key=${j} class="h-3 rounded bg-slate-100 animate-pulse" style=${{ width: `${100 / cols}%` }}></div>`)}
        </div>`)}
    </div>`;
}

function EmptyState({ icon = 'inbox', title, hint, action }) {
  return html`
    <div class="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
      <div class="mx-auto w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <${Icon} name=${icon} className="w-6 h-6" />
      </div>
      <div class="font-medium text-slate-700">${title}</div>
      ${hint && html`<div class="text-sm text-slate-400 mt-1">${hint}</div>`}
      ${action && html`<div class="mt-4">${action}</div>`}
    </div>`;
}

function ErrorState({ message, onRetry }) {
  return html`
    <div class="bg-red-50 border border-red-100 rounded-xl p-6 text-center">
      <div class="font-medium text-red-700">No se pudo cargar</div>
      <div class="text-sm text-red-500 mt-1">${message}</div>
      ${onRetry && html`<button class="mt-3 text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-100" onClick=${onRetry}>Reintentar</button>`}
    </div>`;
}

function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
}

function ModalShell({ onClose, children, size = 'max-w-lg' }) {
  useEscape(onClose);
  return html`
    <div class="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="bg-white rounded-2xl shadow-xl w-full ${size} max-h-[90vh] overflow-y-auto">${children}</div>
    </div>`;
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try { await onConfirm(); onClose(); }
    catch { setBusy(false); }
  }
  return html`
    <${ModalShell} onClose=${onClose} size="max-w-sm">
      <div class="p-6 space-y-3">
        <div class="text-lg font-semibold">${title}</div>
        <div class="text-sm text-slate-600">${message}</div>
        <div class="flex gap-2 justify-end pt-2">
          <button class="px-4 py-2 rounded-lg border text-sm" onClick=${onClose}>Cancelar</button>
          <button disabled=${busy} class="px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50 ${danger ? 'bg-red-600' : 'bg-indigo-600'}" onClick=${go}>
            ${busy ? 'Un momento…' : confirmLabel}
          </button>
        </div>
      </div>
    <//>`;
}

function PromptDialog({ title, label, placeholder, confirmLabel = 'Confirmar', required, onSubmit, onClose }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault();
    if (required && !value.trim()) return;
    setBusy(true);
    try { await onSubmit(value.trim()); onClose(); }
    catch { setBusy(false); }
  }
  return html`
    <${ModalShell} onClose=${onClose} size="max-w-sm">
      <form class="p-6 space-y-3" onSubmit=${go}>
        <div class="text-lg font-semibold">${title}</div>
        ${label && html`<div class="text-xs text-slate-600">${label}</div>`}
        <textarea class="w-full border rounded-lg px-3 py-2 text-sm" rows="3" maxLength="500"
          placeholder=${placeholder} required=${!!required} value=${value} onInput=${(e) => setValue(e.target.value)}></textarea>
        <div class="flex gap-2 justify-end">
          <button type="button" class="px-4 py-2 rounded-lg border text-sm" onClick=${onClose}>Cancelar</button>
          <button disabled=${busy} class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50">${confirmLabel}</button>
        </div>
      </form>
    <//>`;
}

// Menú desplegable simple (cierra al clicar fuera)
function Dropdown({ button, children, align = 'right', panelClass = 'w-56' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return html`
    <div class="relative" ref=${ref}>
      <div onClick=${() => setOpen(!open)}>${button}</div>
      ${open && html`
        <div class="absolute z-30 mt-1 ${align === 'right' ? 'right-0' : 'left-0'} ${panelClass} bg-white border rounded-xl shadow-lg p-1">
          ${typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>`}
    </div>`;
}

// ================================================================
// Formulario genérico (modal) con campos personalizados
// ================================================================
function FormModal({ title, fields, customDefs = [], initial, onSave, onClose }) {
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of fields) {
      let val = initial?.[f.name];
      if (f.type === 'datetime' && val) val = new Date(val).toISOString().slice(0, 16);
      if (f.type === 'date' && val) val = String(val).slice(0, 10);
      v[f.name] = val ?? '';
    }
    return v;
  });
  const [custom, setCustom] = useState(() => {
    const c = {};
    for (const d of customDefs) c[d.key] = initial?.custom?.[d.key] ?? (d.field_type === 'boolean' ? false : '');
    return c;
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function serialize() {
    const out = {};
    for (const f of fields) {
      let v = values[f.name];
      if (f.type === 'checkbox') { out[f.name] = !!v; continue; }
      if (v === '' || v == null) { if (initial) out[f.name] = null; continue; }
      if (f.type === 'number') v = Number(v);
      if (f.type === 'datetime') v = new Date(v).toISOString();
      out[f.name] = v;
    }
    if (customDefs.length) {
      out.custom = {};
      for (const d of customDefs) {
        let v = custom[d.key];
        if (d.field_type === 'boolean') { out.custom[d.key] = !!v; continue; }
        if (v === '' || v == null) { if (initial) out.custom[d.key] = null; continue; }
        if (d.field_type === 'number') v = Number(v);
        out.custom[d.key] = v;
      }
    }
    return out;
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await onSave(serialize()); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function customInput(d) {
    const v = custom[d.key];
    const set = (val) => setCustom({ ...custom, [d.key]: val });
    if (d.field_type === 'boolean') return html`
      <label class="flex items-center gap-2 mt-1">
        <input type="checkbox" checked=${!!v} onChange=${(e) => set(e.target.checked)} />
        <span class="text-sm">${d.label}</span>
      </label>`;
    if (d.field_type === 'select') return html`
      <select class="w-full border rounded-lg px-3 py-2 mt-1" value=${v} onChange=${(e) => set(e.target.value)}>
        <option value="">—</option>
        ${(d.options || []).map((o) => html`<option key=${o} value=${o}>${o}</option>`)}
      </select>`;
    return html`
      <input class="w-full border rounded-lg px-3 py-2 mt-1"
        type=${d.field_type === 'number' ? 'number' : d.field_type === 'date' ? 'date' : 'text'}
        step=${d.field_type === 'number' ? 'any' : undefined} maxLength="500"
        value=${v} onInput=${(e) => set(e.target.value)} />`;
  }

  return html`
    <${ModalShell} onClose=${onClose}>
      <form onSubmit=${submit} class="p-6 space-y-3">
        <div class="text-lg font-semibold">${title}</div>
        ${error && html`<div class="bg-red-50 text-red-700 text-sm rounded-lg p-2">${error}</div>`}
        ${fields.map((f) => html`
          <label key=${f.name} class="block">
            <span class="text-xs font-medium text-slate-600">${f.label}${f.required ? ' *' : ''}</span>
            ${f.type === 'select' ? html`
              <select class="w-full border rounded-lg px-3 py-2 mt-1" required=${!!f.required}
                value=${values[f.name]} onChange=${(e) => setValues({ ...values, [f.name]: e.target.value })}>
                <option value="">—</option>
                ${Object.entries(f.options).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
              </select>` : f.type === 'checkbox' ? html`
              <div class="mt-1"><input type="checkbox" checked=${values[f.name] === true || values[f.name] === 'true'}
                onChange=${(e) => setValues({ ...values, [f.name]: e.target.checked })} /></div>` : f.type === 'textarea' ? html`
              <textarea class="w-full border rounded-lg px-3 py-2 mt-1" rows="3" maxLength=${f.max || 500}
                value=${values[f.name]} onInput=${(e) => setValues({ ...values, [f.name]: e.target.value })}></textarea>` : html`
              <input class="w-full border rounded-lg px-3 py-2 mt-1" required=${!!f.required}
                type=${f.type === 'datetime' ? 'datetime-local' : f.type || 'text'}
                maxLength=${f.max || 200} step=${f.type === 'number' ? '0.01' : undefined}
                minLength=${f.minLength || undefined}
                value=${values[f.name]} onInput=${(e) => setValues({ ...values, [f.name]: e.target.value })} />`}
          </label>`)}
        ${customDefs.length > 0 && html`
          <div class="border-t pt-3">
            <div class="text-xs font-semibold text-slate-400 uppercase mb-1">Campos personalizados</div>
            ${customDefs.map((d) => html`
              <label key=${d.key} class="block mb-2">
                ${d.field_type !== 'boolean' && html`<span class="text-xs font-medium text-slate-600">${d.label}</span>`}
                ${customInput(d)}
              </label>`)}
          </div>`}
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="px-4 py-2 rounded-lg border text-sm" onClick=${onClose}>Cancelar</button>
          <button disabled=${busy} class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50">
            ${busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    <//>`;
}

// ================================================================
// Importación CSV con previsualización y errores por fila
// ================================================================
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('El CSV necesita cabecera y al menos una fila');
  const split = (line) => line.split(';').length > line.split(',').length ? line.split(';') : line.split(',');
  const headers = split(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    const row = {};
    headers.forEach((h, i) => {
      const v = (cells[i] || '').trim();
      if (v !== '') row[h] = v;
    });
    return row;
  });
  return { headers, rows };
}

function ImportModal({ resource, columnsHint, onDone, onClose, notify }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);   // { headers, rows }
  const [parseError, setParseError] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  function preview() {
    setResult(null); setParseError(null);
    try {
      const p = parseCsv(text);
      if (p.rows.length > 500) throw new Error('Máximo 500 filas por importación');
      setParsed(p);
    } catch (err) { setParsed(null); setParseError(err.message); }
  }

  async function run() {
    if (!parsed) return;
    setBusy(true);
    try {
      const res = await api(`/crm/import/${resource}`, { method: 'POST', body: { rows: parsed.rows } });
      setResult(res.data);
      if (res.data.created) { notify(`${res.data.created} registros importados`); onDone(); }
    } catch (err) { notify(err.message, 'error'); }
    finally { setBusy(false); }
  }

  const errorRows = new Set((result?.errors || []).map((e) => e.row));

  return html`
    <${ModalShell} onClose=${onClose} size="max-w-3xl">
      <div class="p-6 space-y-3">
        <div class="text-lg font-semibold">Importar ${ENTITY_LABEL[singularEntityType(resource)] || resource} desde CSV</div>
        <div class="text-xs text-slate-500">
          Primera línea: cabeceras (separador coma o punto y coma). Columnas admitidas:
          <code class="bg-slate-100 px-1 rounded">${columnsHint}</code>
        </div>
        <textarea class="w-full border rounded-lg p-2 font-mono text-xs" rows="6"
          placeholder=${`${columnsHint.split(', ').slice(0, 3).join(',')}\n...`}
          value=${text} onInput=${(e) => { setText(e.target.value); setParsed(null); setResult(null); }}></textarea>
        ${parseError && html`<div class="bg-red-50 text-red-700 text-sm rounded-lg p-2">${parseError}</div>`}

        ${parsed && html`
          <div>
            <div class="text-xs font-medium text-slate-500 mb-1">Vista previa (${parsed.rows.length} filas)</div>
            <div class="border rounded-lg overflow-auto max-h-60">
              <table class="w-full text-xs">
                <thead class="bg-slate-50 sticky top-0"><tr>
                  <th class="px-2 py-1 text-left text-slate-400">#</th>
                  ${parsed.headers.map((h) => html`<th key=${h} class="px-2 py-1 text-left font-medium">${h}</th>`)}
                </tr></thead>
                <tbody>
                  ${parsed.rows.slice(0, 50).map((r, i) => html`
                    <tr key=${i} class="border-t ${errorRows.has(i + 1) ? 'bg-red-50' : ''}">
                      <td class="px-2 py-1 text-slate-400">${i + 1}</td>
                      ${parsed.headers.map((h) => html`<td key=${h} class="px-2 py-1 whitespace-nowrap">${r[h] ?? ''}</td>`)}
                    </tr>`)}
                </tbody>
              </table>
            </div>
          </div>`}

        ${result && html`
          <div class="text-sm bg-slate-50 rounded-lg p-2">
            <div>Importados: <b class="text-emerald-700">${result.created}</b> · Fallidos: <b class="text-red-600">${result.failed}</b></div>
            ${result.errors.map((e) => html`<div key=${e.row} class="text-xs text-red-600">Fila ${e.row}: ${e.error}</div>`)}
          </div>`}

        <div class="flex gap-2 justify-end pt-1">
          <button class="px-4 py-2 rounded-lg border text-sm" onClick=${onClose}>Cerrar</button>
          ${!parsed
            ? html`<button disabled=${!text.trim()} class="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm disabled:opacity-50" onClick=${preview}>Previsualizar</button>`
            : html`<button disabled=${busy} class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50" onClick=${run}>
                ${busy ? 'Importando…' : `Importar ${parsed.rows.length} filas`}</button>`}
        </div>
      </div>
    <//>`;
}

// ================================================================
// Etiquetas (tags) de un registro
// ================================================================
function TagEditor({ entityType, entityId, notify }) {
  const [assigned, setAssigned] = useState(null);
  const [all, setAll] = useState([]);
  const [text, setText] = useState('');
  const editable = can('update');

  const load = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([
        api('/crm/tags', { query: { entity_type: entityType, entity_id: entityId } }),
        api('/crm/tags'),
      ]);
      setAssigned(a.data); setAll(t.data);
    } catch (err) { notify(err.message, 'error'); }
  }, [entityType, entityId]);
  useEffect(() => { load(); }, [load]);

  async function addByName(name) {
    const clean = name.trim();
    if (!clean) return;
    try {
      let tag = all.find((t) => t.name.toLowerCase() === clean.toLowerCase());
      if (!tag) { const res = await api('/crm/tags', { method: 'POST', body: { name: clean } }); tag = res.data; }
      await api('/crm/tags/assign', { method: 'POST', body: { tag_id: tag.id, entity_type: entityType, entity_id: entityId } });
      setText(''); await load();
    } catch (err) { notify(err.message, 'error'); }
  }

  async function remove(tagId) {
    try {
      await api('/crm/tags/unassign', { method: 'POST', body: { tag_id: tagId, entity_type: entityType, entity_id: entityId } });
      await load();
    } catch (err) { notify(err.message, 'error'); }
  }

  if (assigned === null) return html`<div class="text-xs text-slate-400">Cargando etiquetas…</div>`;
  const suggestions = all.filter((t) => !assigned.some((a) => a.id === t.id));

  return html`
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-slate-300"><${Icon} name="tag" className="w-4 h-4" /></span>
      ${assigned.length === 0 && html`<span class="text-xs text-slate-400">Sin etiquetas</span>`}
      ${assigned.map((t) => html`
        <span key=${t.id} class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style=${{ backgroundColor: (t.color || '#e2e8f0') + '33', color: t.color || '#475569' }}>
          ${t.name}
          ${editable && html`<button class="hover:text-red-600" title="Quitar" onClick=${() => remove(t.id)}>×</button>`}
        </span>`)}
      ${editable && html`
        <span class="inline-flex items-center">
          <input list="tags-${entityId}" class="border rounded-lg px-2 py-0.5 text-xs w-32" placeholder="+ etiqueta" maxLength="50"
            value=${text} onInput=${(e) => setText(e.target.value)}
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); addByName(text); } }} />
          <datalist id="tags-${entityId}">
            ${suggestions.map((t) => html`<option key=${t.id} value=${t.name}></option>`)}
          </datalist>
        </span>`}
    </div>`;
}

// ================================================================
// Timeline de actividad + notas
// ================================================================
function NotesAndActivity({ entityType, entityId, notify }) {
  const [notes, setNotes] = useState(null);
  const [activity, setActivity] = useState(null);
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    const [n, a] = await Promise.all([
      api('/crm/notes', { query: { entity_type: entityType, entity_id: entityId, page_size: 20 } }),
      api('/crm/activities', { query: { entity_type: entityType, entity_id: entityId, page_size: 20 } }),
    ]);
    setNotes(n.data); setActivity(a.data);
  }, [entityType, entityId]);
  useEffect(() => { load().catch((e) => notify(e.message, 'error')); }, [load]);

  async function addNote(e) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await api('/crm/notes', { method: 'POST', body: { entity_type: entityType, entity_id: entityId, body: body.trim() } });
      setBody(''); await load();
    } catch (err) { notify(err.message, 'error'); }
  }

  return html`
    <div class="space-y-5">
      <div>
        <div class="text-sm font-semibold mb-2">Notas internas</div>
        ${can('create') && html`
          <form onSubmit=${addNote} class="flex gap-2 mb-3">
            <input class="flex-1 border rounded-lg px-3 py-1.5 text-sm" placeholder="Escribe una nota…" maxLength="5000"
              value=${body} onInput=${(e) => setBody(e.target.value)} />
            <button class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm">Añadir</button>
          </form>`}
        ${notes === null ? html`<${Spinner} />` : notes.length === 0
          ? html`<div class="text-sm text-slate-400">Sin notas todavía.</div>`
          : notes.map((n) => html`
            <div key=${n.id} class="bg-amber-50 border border-amber-100 rounded-lg p-2.5 mb-1.5 text-sm">
              <div class="whitespace-pre-wrap">${n.body}</div>
              <div class="text-xs text-slate-400 mt-1">${n.created_by_name || ''} · ${fmtDateTime(n.created_at)}</div>
            </div>`)}
      </div>
      <div>
        <div class="text-sm font-semibold mb-2">Historial de actividad</div>
        ${activity === null ? html`<${Spinner} />` : activity.length === 0
          ? html`<div class="text-sm text-slate-400">Sin actividad registrada.</div>`
          : html`
            <ol class="relative border-l border-slate-200 ml-2 space-y-3">
              ${activity.map((a) => html`
                <li key=${a.id} class="ml-4">
                  <span class="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-indigo-400 border-2 border-white"></span>
                  <div class="text-sm text-slate-700"><span class="font-medium">${a.actor_name || 'Sistema'}</span> · ${a.action}</div>
                  <div class="text-xs text-slate-400">${fmtDateTime(a.created_at)}</div>
                </li>`)}
            </ol>`}
      </div>
    </div>`;
}

// ================================================================
// Tareas relacionadas con un registro
// ================================================================
function RelatedTasks({ entityType, entityId, users, notify }) {
  const [tasks, setTasks] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api('/crm/tasks', { query: { entity_type: entityType, entity_id: entityId, page_size: 50 } });
      setTasks(res.data);
    } catch (err) { notify(err.message, 'error'); }
  }, [entityType, entityId]);
  useEffect(() => { load(); }, [load]);

  const fields = [
    { name: 'title', label: 'Título', required: true, max: 200 },
    { name: 'description', label: 'Descripción', type: 'textarea', max: 2000 },
    { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITY },
    { name: 'assigned_to', label: 'Asignar a', type: 'select', options: Object.fromEntries(users.map((u) => [u.id, u.name])) },
    { name: 'due_at', label: 'Vencimiento', type: 'datetime' },
  ];

  async function create(payload) {
    await api('/crm/tasks', { method: 'POST', body: { ...payload, entity_type: entityType, entity_id: entityId } });
    notify('Tarea creada'); await load();
  }

  async function toggle(t) {
    try {
      await api(`/crm/tasks/${t.id}`, { method: 'PATCH', body: { status: t.status === 'done' ? 'pending' : 'done' } });
      await load();
    } catch (err) { notify(err.message, 'error'); }
  }

  return html`
    <div>
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-semibold">Tareas</div>
        ${can('create') && html`<button class="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white" onClick=${() => setCreating(true)}>+ Tarea</button>`}
      </div>
      ${tasks === null ? html`<${Spinner} />` : tasks.length === 0
        ? html`<div class="text-sm text-slate-400">Sin tareas asociadas.</div>`
        : tasks.map((t) => html`
          <div key=${t.id} class="flex items-center gap-2 py-1.5 border-b last:border-0">
            <button class="w-4 h-4 rounded border ${t.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'} flex items-center justify-center"
              title="Marcar" disabled=${!can('update')} onClick=${() => toggle(t)}>
              ${t.status === 'done' && html`<${Icon} name="check" className="w-3 h-3" />`}
            </button>
            <div class="flex-1 min-w-0">
              <div class="text-sm truncate ${t.status === 'done' ? 'line-through text-slate-400' : ''}">${t.title}</div>
              <div class="text-xs text-slate-400">${t.due_at ? `Vence ${fmtDateTime(t.due_at)}` : 'Sin fecha'}</div>
            </div>
            <${Badge} value=${t.priority} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />
          </div>`)}
      ${creating && html`<${FormModal} title="Nueva tarea" fields=${fields} onSave=${create} onClose=${() => setCreating(false)} />`}
    </div>`;
}

// ================================================================
// Líneas de producto de una oportunidad (presupuesto)
// ================================================================
function OpportunityItems({ opportunityId, products, editable, notify, onTotal }) {
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api(`/crm/opportunities/${opportunityId}/items`);
      setItems(res.data.items); setTotal(res.data.total);
    } catch (err) { notify(err.message, 'error'); }
  }, [opportunityId]);
  useEffect(() => { load(); }, [load]);

  async function addLine(payload) {
    const res = await api(`/crm/opportunities/${opportunityId}/items`, { method: 'POST', body: payload });
    notify('Línea añadida');
    if (onTotal) onTotal(res.data.opportunity_total);
    await load();
  }
  async function removeLine(itemId) {
    try {
      const res = await api(`/crm/opportunities/${opportunityId}/items/${itemId}`, { method: 'DELETE' });
      if (onTotal) onTotal(res.data.opportunity_total);
      await load();
    } catch (err) { notify(err.message, 'error'); }
  }

  const itemFields = [
    { name: 'product_id', label: 'Producto del catálogo (opcional)', type: 'select', options: Object.fromEntries(products.map((p) => [p.id, p.name])) },
    { name: 'name', label: 'Nombre (si no eliges producto)', max: 160 },
    { name: 'quantity', label: 'Cantidad', type: 'number' },
    { name: 'unit_price', label: 'Precio unitario (€)', type: 'number' },
    { name: 'discount_percent', label: 'Descuento (%)', type: 'number' },
  ];

  return html`
    <div>
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-semibold">Líneas / presupuesto</div>
        ${editable && can('update') && html`<button class="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white" onClick=${() => setAdding(true)}>+ Añadir línea</button>`}
      </div>
      ${items === null ? html`<${Spinner} />` : items.length === 0
        ? html`<div class="text-sm text-slate-400">Sin líneas. El importe se gestiona manualmente.</div>`
        : html`
          <table class="w-full text-sm">
            <thead><tr class="text-left text-xs text-slate-400 border-b">
              <th class="py-1">Concepto</th><th class="py-1 text-right">Cant.</th>
              <th class="py-1 text-right">Precio</th><th class="py-1 text-right">Dto.</th>
              <th class="py-1 text-right">Total</th><th></th>
            </tr></thead>
            <tbody>
              ${items.map((it) => html`
                <tr key=${it.id} class="border-b last:border-0">
                  <td class="py-1">${it.name}</td>
                  <td class="py-1 text-right">${Number(it.quantity)}</td>
                  <td class="py-1 text-right">${fmtMoney(it.unit_price)}</td>
                  <td class="py-1 text-right">${Number(it.discount_percent)}%</td>
                  <td class="py-1 text-right font-medium">${fmtMoney(it.line_total)}</td>
                  <td class="py-1 text-right">${editable && can('update') && html`<button class="text-red-500 text-xs" onClick=${() => removeLine(it.id)}>✕</button>`}</td>
                </tr>`)}
            </tbody>
            <tfoot><tr class="border-t-2"><td colSpan="4" class="py-1 text-right font-semibold">Total</td><td class="py-1 text-right font-bold">${fmtMoney(total)}</td><td></td></tr></tfoot>
          </table>`}
      ${adding && html`<${FormModal} title="Añadir línea" fields=${itemFields} onSave=${addLine} onClose=${() => setAdding(false)} />`}
    </div>`;
}

// ================================================================
// Ficha 360 (drawer con pestañas, tags, timeline, tareas, acciones)
// ================================================================
function FieldGrid({ row, fields, customDefs = [] }) {
  return html`
    <div class="grid grid-cols-2 gap-x-4 gap-y-3">
      ${fields.map((f) => html`
        <div key=${f.name}>
          <div class="text-xs text-slate-400">${f.label}</div>
          <div class="text-sm">${f.render ? f.render(row[f.name], row) : (row[f.name] ?? '—')}</div>
        </div>`)}
      ${customDefs.map((d) => html`
        <div key=${d.key}>
          <div class="text-xs text-slate-400">${d.label}</div>
          <div class="text-sm">${row.custom?.[d.key] === true ? 'Sí' : row.custom?.[d.key] === false ? 'No' : (row.custom?.[d.key] ?? '—')}</div>
        </div>`)}
    </div>`;
}

// ================================================================
// Toolbar: columnas configurables + vistas guardadas
// ================================================================
function ColumnPicker({ resource, columns, hidden, setHidden }) {
  return html`
    <${Dropdown} align="right" panelClass="w-56" button=${html`
      <button class="inline-flex items-center gap-1 border rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
        <${Icon} name="columns" className="w-4 h-4" /> Columnas
      </button>`}>
      <div class="max-h-72 overflow-y-auto">
        <div class="px-2 py-1 text-xs text-slate-400">Mostrar columnas</div>
        ${columns.map((c, i) => html`
          <label key=${c.name} class="flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" checked=${!hidden.includes(c.name)} disabled=${i === 0}
              onChange=${(e) => {
                const next = e.target.checked ? hidden.filter((n) => n !== c.name) : [...hidden, c.name];
                setHidden(next); savePref('cols', resource, next);
              }} />
            ${c.label}
          </label>`)}
      </div>
    <//>`;
}

function SavedViews({ resource, query, applyQuery, notify }) {
  const [views, setViews] = useState(() => loadPref('views', resource, []));
  function persist(v) { setViews(v); savePref('views', resource, v); }
  function saveCurrent() {
    const name = window.prompt('Nombre de la vista guardada:');
    if (!name || !name.trim()) return;
    const v = [...views.filter((x) => x.name !== name.trim()), { name: name.trim(), query }];
    persist(v); notify('Vista guardada');
  }
  return html`
    <${Dropdown} align="left" panelClass="w-60" button=${html`
      <button class="inline-flex items-center gap-1 border rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
        <${Icon} name="star" className="w-4 h-4" /> Vistas
      </button>`}>
      ${(close) => html`
        <div>
          ${views.length === 0 && html`<div class="px-2 py-1.5 text-xs text-slate-400">Sin vistas guardadas</div>`}
          ${views.map((v) => html`
            <div key=${v.name} class="flex items-center gap-1 px-2 py-1.5 text-sm rounded-lg hover:bg-slate-50">
              <button class="flex-1 text-left" onClick=${() => { applyQuery(v.query); close(); }}>${v.name}</button>
              <button class="text-slate-300 hover:text-red-500" onClick=${() => persist(views.filter((x) => x.name !== v.name))}>×</button>
            </div>`)}
          <div class="border-t mt-1 pt-1">
            <button class="w-full text-left px-2 py-1.5 text-sm text-indigo-600 rounded-lg hover:bg-indigo-50" onClick=${() => { saveCurrent(); close(); }}>+ Guardar vista actual</button>
          </div>
        </div>`}
    <//>`;
}

// ================================================================
// Vista de tabla (módulo de registros)
// ================================================================
function singularEntityType(resource) {
  return { leads: 'lead', companies: 'company', contacts: 'contact', opportunities: 'opportunity', tasks: 'task' }[resource] || null;
}

function TableView({ resource, columns, filters, formFields, detailFields, title, singular, notify, users, products,
                    recordActions, customDefs = [], importColumnsHint, transformPayload, editable = true,
                    permCreate = 'create', permEdit = 'update', permDelete = 'delete', openId, onConsumedOpenId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1 });
  const [query, setQuery] = useState({});
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [hidden, setHidden] = useState(() => loadPref('cols', resource, []));
  const entityType = singularEntityType(resource);

  const load = useCallback(async (page = 1) => {
    setError(null);
    try {
      const res = await api(`/crm/${resource}`, { query: { ...query, page, page_size: 25 } });
      setData(res.data); setPagination(res.pagination);
    } catch (err) { setError(err.message); setData([]); }
  }, [resource, query]);
  useEffect(() => { load(1); }, [load]);

  // Apertura de registro por id (desde búsqueda global / enlaces)
  useEffect(() => {
    if (!openId) return;
    let alive = true;
    api(`/crm/${resource}/${openId}`).then((r) => { if (alive) setSelected(r.data); })
      .catch((e) => notify(e.message, 'error'))
      .finally(() => onConsumedOpenId && onConsumedOpenId());
    return () => { alive = false; };
  }, [openId]);

  async function save(payload) {
    if (transformPayload) payload = transformPayload(payload);
    if (editing?.id) {
      const res = await api(`/crm/${resource}/${editing.id}`, { method: 'PATCH', body: payload });
      notify(`${singular} actualizado`);
      if (selected?.id === editing.id) setSelected(res.data);
    } else {
      await api(`/crm/${resource}`, { method: 'POST', body: payload });
      notify(`${singular} creado`);
    }
    await load(pagination.page);
  }

  function askDelete(row) {
    setConfirm({
      title: `Eliminar ${singular.toLowerCase()}`,
      message: `¿Eliminar "${row.name || row.title || row.first_name || ''}"? Es recuperable por soporte (borrado lógico).`,
      confirmLabel: 'Eliminar', danger: true,
      onConfirm: async () => {
        await api(`/crm/${resource}/${row.id}`, { method: 'DELETE' });
        notify(`${singular} eliminado`); setSelected(null); await load(pagination.page);
      },
    });
  }

  async function closeOpp(status) {
    if (status === 'won') {
      setConfirm({
        title: 'Marcar como ganada', message: '¿Confirmas que esta oportunidad se ha ganado?', confirmLabel: 'Sí, ganada',
        onConfirm: async () => {
          const res = await api(`/crm/opportunities/${selected.id}/close`, { method: 'POST', body: { status: 'won' } });
          notify('Oportunidad ganada'); setSelected(res.data); await load(pagination.page);
        },
      });
    } else {
      setPrompt({
        title: 'Marcar como perdida', label: 'Motivo de pérdida (obligatorio)', required: true, confirmLabel: 'Marcar perdida',
        onSubmit: async (reason) => {
          const res = await api(`/crm/opportunities/${selected.id}/close`, { method: 'POST', body: { status: 'lost', lost_reason: reason } });
          notify('Oportunidad marcada como perdida'); setSelected(res.data); await load(pagination.page);
        },
      });
    }
  }

  const visibleCols = columns.filter((c) => !hidden.includes(c.name));
  const activeFilters = (filters || []).filter((f) => query[f.name]);

  const helpers = { reload: () => load(pagination.page), close: () => setSelected(null), notify,
    confirm: setConfirm, prompt: setPrompt, refreshRecord: (r) => setSelected(r) };

  return html`
    <div>
      <!-- Toolbar -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <div class="relative mr-auto">
          <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300"><${Icon} name="search" className="w-4 h-4" /></span>
          <input class="border rounded-lg pl-8 pr-3 py-1.5 text-sm w-56" placeholder=${`Buscar en ${title.toLowerCase()}…`} maxLength="100"
            value=${query.search || ''} onInput=${(e) => setQuery({ ...query, search: e.target.value })} />
        </div>
        ${(filters || []).map((f) => html`
          <select key=${f.name} class="border rounded-lg px-2 py-1.5 text-sm ${query[f.name] ? 'border-indigo-300 text-indigo-700' : 'text-slate-600'}"
            value=${query[f.name] || ''} onChange=${(e) => setQuery({ ...query, [f.name]: e.target.value })}>
            <option value="">${f.label}: todos</option>
            ${Object.entries(f.options).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
          </select>`)}
        ${activeFilters.length > 0 && html`<button class="text-xs text-slate-400 hover:text-slate-600" onClick=${() => setQuery({})}>Limpiar</button>`}
        <${SavedViews} resource=${resource} query=${query} applyQuery=${setQuery} notify=${notify} />
        <${ColumnPicker} resource=${resource} columns=${columns} hidden=${hidden} setHidden=${setHidden} />
        ${importColumnsHint && can('import') && html`
          <button class="border rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1" onClick=${() => setImporting(true)}>
            <${Icon} name="download" className="w-4 h-4" /> Importar</button>`}
        ${can(permCreate) && html`
          <button class="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 text-sm inline-flex items-center gap-1" onClick=${() => setEditing({})}>
            <${Icon} name="plus" className="w-4 h-4" /> Nuevo</button>`}
      </div>

      <!-- Tabla / estados -->
      ${error ? html`<${ErrorState} message=${error} onRetry=${() => load(pagination.page)} />`
        : data === null ? html`<${TableSkeleton} cols=${visibleCols.length} />`
        : data.length === 0 ? html`
          <${EmptyState} title=${`Sin ${title.toLowerCase()}`}
            hint=${activeFilters.length || query.search ? 'Prueba a ajustar los filtros o la búsqueda.' : `Crea tu primer registro para empezar.`}
            action=${can(permCreate) && !(activeFilters.length || query.search) ? html`<button class="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm" onClick=${() => setEditing({})}>+ Nuevo ${singular.toLowerCase()}</button>` : null} />`
        : html`
          <div class="bg-white rounded-xl shadow overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="text-left text-xs text-slate-400 border-b bg-slate-50/50">
                ${visibleCols.map((c) => html`<th key=${c.name} class="px-4 py-2.5 font-medium">${c.label}</th>`)}
              </tr></thead>
              <tbody>
                ${data.map((row) => html`
                  <tr key=${row.id} class="border-b last:border-0 hover:bg-indigo-50/40 cursor-pointer" onClick=${() => setSelected(row)}>
                    ${visibleCols.map((c) => html`<td key=${c.name} class="px-4 py-2.5">${c.render ? c.render(row[c.name], row) : (row[c.name] ?? html`<span class="text-slate-300">—</span>`)}</td>`)}
                  </tr>`)}
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between mt-3 text-sm text-slate-500">
            <div>${fmtNum(pagination.total ?? 0)} resultados</div>
            <div class="flex items-center gap-2">
              <button disabled=${pagination.page <= 1} class="px-2 py-1 border rounded-lg disabled:opacity-30" onClick=${() => load(pagination.page - 1)}><${Icon} name="chevronLeft" className="w-4 h-4" /></button>
              <span>Página ${pagination.page} / ${Math.max(pagination.total_pages || 1, 1)}</span>
              <button disabled=${pagination.page >= (pagination.total_pages || 1)} class="px-2 py-1 border rounded-lg disabled:opacity-30" onClick=${() => load(pagination.page + 1)}><${Icon} name="chevronRight" className="w-4 h-4" /></button>
            </div>
          </div>`}

      ${editing !== null && html`
        <${FormModal} title=${editing.id ? `Editar ${singular.toLowerCase()}` : `Nuevo ${singular.toLowerCase()}`}
          fields=${formFields} customDefs=${customDefs} initial=${editing.id ? editing : null}
          onSave=${save} onClose=${() => setEditing(null)} />`}

      ${importing && html`
        <${ImportModal} resource=${resource} columnsHint=${importColumnsHint} notify=${notify}
          onDone=${() => load(1)} onClose=${() => setImporting(false)} />`}

      ${selected && html`
        <${RecordDrawerHost}
          entityType=${entityType} record=${selected} resource=${resource}
          detailFields=${detailFields || columns} customDefs=${customDefs} users=${users} products=${products}
          canEdit=${can(permEdit) && editable} canDelete=${can(permDelete)}
          onEdit=${() => setEditing(selected)} onDelete=${() => askDelete(selected)}
          onClose=${() => setSelected(null)} closeOpp=${closeOpp}
          recordActions=${recordActions ? recordActions(selected, helpers) : []}
          reload=${() => load(pagination.page)} notify=${notify} />`}

      ${confirm && html`<${ConfirmDialog} ...${confirm} onClose=${() => setConfirm(null)} />`}
      ${prompt && html`<${PromptDialog} ...${prompt} onClose=${() => setPrompt(null)} />`}
    </div>`;
}

// Envoltura que conecta RecordDrawer con su cierre (evita closures complejas)
function RecordDrawerHost({ entityType, record, resource, detailFields, customDefs, users, products,
                           canEdit, canDelete, onEdit, onDelete, onClose, closeOpp, recordActions, reload, notify }) {
  const title = record.name || record.title || `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Registro';
  const subtitle = ENTITY_LABEL[entityType] || '';
  useEscape(onClose);
  return html`
    <div class="fixed inset-0 z-40 bg-slate-900/30" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <${RecordDrawerInner}
          entityType=${entityType} record=${record} title=${title} subtitle=${subtitle}
          detailFields=${detailFields} customDefs=${customDefs} users=${users} products=${products}
          canEdit=${canEdit} canDelete=${canDelete} onEdit=${onEdit} onDelete=${onDelete} onClose=${onClose}
          closeOpp=${closeOpp} recordActions=${recordActions} reload=${reload} notify=${notify} />
      </div>
    </div>`;
}

function RecordDrawerInner({ entityType, record, title, subtitle, detailFields, customDefs, users, products,
                            canEdit, canDelete, onEdit, onDelete, onClose, closeOpp, recordActions, reload, notify }) {
  const [tab, setTab] = useState('summary');
  const isOpp = entityType === 'opportunity';
  const tabs = [['summary', 'Resumen'], ['activity', 'Actividad'], ['tasks', 'Tareas'], ...(isOpp ? [['items', 'Líneas']] : [])];
  return html`
    <div class="flex flex-col h-full">
      <div class="px-5 pt-4 border-b">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold shrink-0">${initials(title)}</div>
            <div class="min-w-0">
              <div class="font-semibold truncate">${title}</div>
              <div class="text-xs text-slate-400 truncate">${subtitle}</div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${(recordActions || []).map((a, i) => html`
              <button key=${i} class="text-xs px-2 py-1 rounded-lg border hover:bg-slate-50 ${a.danger ? 'border-red-200 text-red-600' : a.primary ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-600'}" onClick=${a.onClick}>${a.label}</button>`)}
            ${canEdit && html`<button class="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" onClick=${onEdit}>Editar</button>`}
            ${canDelete && html`<button class="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50" onClick=${onDelete}>Eliminar</button>`}
            <button class="text-slate-400 hover:text-slate-700 ml-1" onClick=${onClose}><${Icon} name="x" className="w-5 h-5" /></button>
          </div>
        </div>
        ${ENTITY_LABEL[entityType] && html`<div class="py-3"><${TagEditor} entityType=${entityType} entityId=${record.id} notify=${notify} /></div>`}
        <div class="flex gap-1 -mb-px">
          ${tabs.map(([id, label]) => html`
            <button key=${id} class="px-3 py-2 text-sm border-b-2 ${tab === id ? 'border-indigo-600 text-indigo-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'}" onClick=${() => setTab(id)}>${label}</button>`)}
        </div>
      </div>
      <div class="p-5 overflow-y-auto flex-1">
        ${tab === 'summary' && html`
          <div class="space-y-5">
            <${FieldGrid} row=${record} fields=${detailFields} customDefs=${customDefs} />
            ${isOpp && html`<div class="text-sm">Estado: <${Badge} value=${record.status} map=${OPP_STATUS} /></div>`}
            ${isOpp && record.status === 'open' && can('close') && html`
              <div class="flex gap-2 pt-3 border-t">
                <button class="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white" onClick=${() => closeOpp('won')}>Marcar ganada</button>
                <button class="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-600" onClick=${() => closeOpp('lost')}>Marcar perdida</button>
              </div>`}
          </div>`}
        ${tab === 'activity' && html`<${NotesAndActivity} entityType=${entityType} entityId=${record.id} notify=${notify} />`}
        ${tab === 'tasks' && html`<${RelatedTasks} entityType=${entityType} entityId=${record.id} users=${users} notify=${notify} />`}
        ${tab === 'items' && isOpp && html`<${OpportunityItems} opportunityId=${record.id} products=${products} editable=${record.status === 'open'} notify=${notify} onTotal=${() => reload && reload()} />`}
      </div>
    </div>`;
}

// ================================================================
// Dashboard ejecutivo
// ================================================================
function KpiCard({ label, value, sub, alert, accent }) {
  return html`
    <div class="bg-white rounded-xl shadow p-4">
      <div class="text-xs text-slate-400">${label}</div>
      <div class="text-2xl font-bold ${alert ? 'text-red-600' : accent ? 'text-indigo-600' : ''}">${value}</div>
      ${sub && html`<div class="text-xs text-slate-400 mt-0.5">${sub}</div>`}
    </div>`;
}

function Dashboard({ notify, brandColor, goto }) {
  const [data, setData] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [myTasks, setMyTasks] = useState(null);
  const [error, setError] = useState(null);
  const me = getSession()?.user;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, p, t] = await Promise.all([
        api('/crm/dashboard'),
        api('/crm/pipeline'),
        api('/crm/tasks', { query: { assigned_to: me?.id, status: 'pending', page_size: 6 } }),
      ]);
      setData(d.data); setPipeline(p.data); setMyTasks(t.data);
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!data || !pipeline) return html`<${Spinner} />`;

  const o = data.opportunities;
  const openStages = pipeline.stages.filter((s) => !s.is_won && !s.is_lost);
  const maxStage = Math.max(1, ...openStages.map((s) => s.opportunities.reduce((a, x) => a + Number(x.amount || 0), 0)));

  return html`
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold">Hola, ${me?.name?.split(' ')[0] || ''}</h2>
          <div class="text-sm text-slate-400">Resumen comercial de tu organización</div>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <${KpiCard} label="Oportunidades abiertas" value=${o.open_count} />
        <${KpiCard} label="Valor del pipeline" value=${fmtMoney(o.open_value)} />
        <${KpiCard} label="Forecast ponderado" value=${fmtMoney(o.weighted_value)} accent=${true} />
        <${KpiCard} label="Win rate (mes)" value=${o.win_rate_this_month == null ? '—' : `${o.win_rate_this_month}%`} />
        <${KpiCard} label="Ganado (mes)" value=${fmtMoney(o.won_value_this_month)} sub=${`${o.won_this_month} oportunidades`} />
        <${KpiCard} label="Tareas vencidas" value=${data.tasks.overdue_tasks} alert=${data.tasks.overdue_tasks > 0} />
      </div>

      <div class="grid lg:grid-cols-3 gap-4">
        <!-- Embudo pipeline -->
        <div class="bg-white rounded-xl shadow p-4 lg:col-span-2">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold">Pipeline por etapa</div>
            <button class="text-xs text-indigo-600 hover:underline" onClick=${() => goto('pipeline')}>Ver Kanban →</button>
          </div>
          ${openStages.length === 0 ? html`<div class="text-sm text-slate-400">Sin etapas configuradas.</div>`
            : openStages.map((s) => {
                const val = s.opportunities.reduce((a, x) => a + Number(x.amount || 0), 0);
                return html`
                  <div key=${s.id} class="mb-2.5">
                    <div class="flex justify-between text-sm mb-1">
                      <span class="font-medium">${s.name} <span class="text-slate-400">(${s.opportunities.length})</span></span>
                      <span>${fmtMoney(val)}</span>
                    </div>
                    <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div class="h-full rounded-full" style=${{ width: `${val / maxStage * 100}%`, backgroundColor: s.color || brandColor }}></div>
                    </div>
                  </div>`;
              })}
        </div>
        <!-- Mis tareas -->
        <div class="bg-white rounded-xl shadow p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold">Mis tareas pendientes</div>
            <button class="text-xs text-indigo-600 hover:underline" onClick=${() => goto('tasks')}>Ver todas →</button>
          </div>
          ${myTasks === null ? html`<${Spinner} />` : myTasks.length === 0
            ? html`<div class="text-sm text-slate-400">Nada pendiente. ✨</div>`
            : myTasks.map((t) => html`
              <div key=${t.id} class="flex items-center justify-between py-1.5 border-b last:border-0">
                <span class="truncate mr-2 text-sm">${t.title}</span>
                <span class="text-xs whitespace-nowrap ${t.due_at && new Date(t.due_at) < new Date() ? 'text-red-600' : 'text-slate-400'}">${t.due_at ? fmtDate(t.due_at) : '—'}</span>
              </div>`)}
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl shadow p-4">
          <div class="text-sm font-semibold mb-2">Leads por estado</div>
          ${data.leads_by_status.length === 0 ? html`<div class="text-sm text-slate-400">Sin leads.</div>`
            : data.leads_by_status.map((l) => html`
              <div key=${l.status} class="flex justify-between items-center text-sm py-1 border-b last:border-0">
                <${Badge} value=${l.status} map=${LEAD_STATUS} /><span class="font-medium">${l.count}</span>
              </div>`)}
        </div>
        <div class="bg-white rounded-xl shadow p-4">
          <div class="text-sm font-semibold mb-2">Próximos seguimientos (7 días)</div>
          ${data.upcoming_follow_ups.length === 0 ? html`<div class="text-sm text-slate-400">Nada pendiente.</div>`
            : data.upcoming_follow_ups.map((l) => html`
              <div key=${l.id} class="flex justify-between text-sm py-1 border-b last:border-0">
                <span class="truncate mr-2">${l.title}</span>
                <span class="text-slate-500 whitespace-nowrap">${fmtDateTime(l.next_follow_up_at)}</span>
              </div>`)}
        </div>
      </div>
    </div>`;
}

// ================================================================
// Pipeline Kanban (drag & drop nativo)
// ================================================================
function Pipeline({ notify, users, products, customDefs, brandColor }) {
  const [pipeline, setPipeline] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [ownerFilter, setOwnerFilter] = useState('');
  const [dragId, setDragId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [prompt, setPrompt] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api('/crm/pipeline').then((r) => setPipeline(r.data)).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function moveStage(oppId, stageId, fromStageId) {
    if (stageId === fromStageId) return;
    try { await api(`/crm/opportunities/${oppId}`, { method: 'PATCH', body: { stage_id: stageId } }); load(); }
    catch (err) { notify(err.message, 'error'); }
  }

  function askClose(opp, status) {
    if (status === 'won') {
      setConfirm({ title: 'Marcar como ganada', message: `¿Confirmas que "${opp.title}" se ha ganado?`, confirmLabel: 'Sí, ganada',
        onConfirm: async () => { await api(`/crm/opportunities/${opp.id}/close`, { method: 'POST', body: { status: 'won' } }); notify('Oportunidad ganada'); load(); } });
    } else {
      setPrompt({ title: 'Marcar como perdida', label: 'Motivo de pérdida (obligatorio)', required: true, confirmLabel: 'Marcar perdida',
        onSubmit: async (reason) => { await api(`/crm/opportunities/${opp.id}/close`, { method: 'POST', body: { status: 'lost', lost_reason: reason } }); notify('Oportunidad perdida'); load(); } });
    }
  }

  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!pipeline) return html`<${Spinner} />`;

  const openStages = pipeline.stages.filter((s) => !s.is_won && !s.is_lost);
  const filterOpp = (o) => !ownerFilter || o.owner_user_id === ownerFilter;

  const oppFormFields = [
    { name: 'title', label: 'Título', required: true, max: 200 },
    { name: 'stage_id', label: 'Etapa', type: 'select', required: true, options: Object.fromEntries(openStages.map((s) => [s.id, s.name])) },
    { name: 'amount', label: 'Importe (€)', type: 'number' },
    { name: 'probability', label: 'Probabilidad (%)', type: 'number' },
    { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITY },
    { name: 'product_id', label: 'Producto/Servicio', type: 'select', options: Object.fromEntries(products.map((p) => [p.id, p.name])) },
    { name: 'owner_user_id', label: 'Responsable', type: 'select', options: Object.fromEntries(users.map((u) => [u.id, u.name])) },
    { name: 'expected_close_date', label: 'Cierre previsto', type: 'date' },
    { name: 'next_step', label: 'Próximo paso', type: 'textarea', max: 500 },
    { name: 'next_follow_up_at', label: 'Próximo seguimiento', type: 'datetime' },
    { name: 'main_pain', label: 'Dolor principal', type: 'textarea', max: 500 },
  ];
  const detailFields = [
    { name: 'amount', label: 'Importe', render: fmtMoney },
    { name: 'probability', label: 'Probabilidad', render: (v) => v == null ? '—' : `${v}%` },
    { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
    { name: 'owner_name', label: 'Responsable' },
    { name: 'company_name', label: 'Empresa' },
    { name: 'expected_close_date', label: 'Cierre previsto', render: fmtDate },
    { name: 'next_follow_up_at', label: 'Próximo seguimiento', render: fmtDateTime },
  ];

  return html`
    <div>
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <h2 class="text-lg font-semibold mr-auto">Pipeline</h2>
        <select class="border rounded-lg px-2 py-1.5 text-sm" value=${ownerFilter} onChange=${(e) => setOwnerFilter(e.target.value)}>
          <option value="">Todos los responsables</option>
          ${users.map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}
        </select>
        ${can('create') && html`<button class="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm inline-flex items-center gap-1" onClick=${() => setCreating(true)}><${Icon} name="plus" className="w-4 h-4" /> Nueva oportunidad</button>`}
      </div>
      <div class="flex gap-3 overflow-x-auto pb-4">
        ${pipeline.stages.map((stage) => {
          const opps = stage.opportunities.filter(filterOpp);
          const total = opps.reduce((a, x) => a + Number(x.amount || 0), 0);
          const isClosed = stage.is_won || stage.is_lost;
          return html`
            <div key=${stage.id} class="w-72 shrink-0 bg-slate-50 rounded-xl border ${dragId && !isClosed ? 'border-indigo-200' : ''}"
              onDragOver=${(e) => { if (!isClosed) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
              onDrop=${(e) => { if (isClosed) return; e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); const from = e.dataTransfer.getData('from'); setDragId(null); moveStage(id, stage.id, from); }}>
              <div class="px-3 py-2 border-b flex items-center justify-between" style=${{ borderTopColor: stage.color || brandColor, borderTopWidth: '3px', borderTopLeftRadius: '0.75rem', borderTopRightRadius: '0.75rem' }}>
                <span class="text-sm font-semibold" style=${{ color: stage.color || undefined }}>${stage.name}</span>
                <span class="text-xs text-slate-400">${opps.length} · ${fmtMoney(total)}</span>
              </div>
              <div class="p-2 space-y-2 min-h-24">
                ${opps.length === 0 && html`<div class="text-xs text-slate-300 text-center py-4">Suelta aquí</div>`}
                ${opps.map((opp) => html`
                  <div key=${opp.id} draggable=${can('update') && !isClosed}
                    onDragStart=${(e) => { e.dataTransfer.setData('text/plain', opp.id); e.dataTransfer.setData('from', stage.id); e.dataTransfer.effectAllowed = 'move'; setDragId(opp.id); }}
                    onDragEnd=${() => setDragId(null)}
                    class="bg-white rounded-lg shadow-sm border p-2.5 cursor-pointer hover:border-indigo-300 ${dragId === opp.id ? 'opacity-40' : ''}"
                    onClick=${() => setSelected(opp)}>
                    <div class="text-sm font-medium truncate">${opp.title}</div>
                    <div class="text-xs text-slate-500 truncate">${opp.company_name || '—'}</div>
                    <div class="flex items-center justify-between mt-1.5">
                      <span class="text-sm font-semibold">${fmtMoney(opp.amount)}</span>
                      <${Badge} value=${opp.priority} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />
                    </div>
                    ${opp.owner_name && html`<div class="flex items-center gap-1 mt-1.5 text-xs text-slate-400"><span class="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[9px]">${initials(opp.owner_name)}</span>${opp.owner_name}</div>`}
                    ${can('update') && !isClosed && html`
                      <div class="mt-2 flex gap-1" onClick=${(e) => e.stopPropagation()}>
                        <select class="flex-1 text-xs border rounded px-1 py-0.5" value=${stage.id} onChange=${(e) => moveStage(opp.id, e.target.value, stage.id)}>
                          ${openStages.map((s) => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}
                        </select>
                        ${can('close') && html`
                          <button title="Ganada" class="text-emerald-600 border border-emerald-200 rounded px-1.5 text-xs" onClick=${() => askClose(opp, 'won')}>✓</button>
                          <button title="Perdida" class="text-red-500 border border-red-200 rounded px-1.5 text-xs" onClick=${() => askClose(opp, 'lost')}>✗</button>`}
                      </div>`}
                  </div>`)}
              </div>
            </div>`;
        })}
      </div>

      ${creating && html`
        <${FormModal} title="Nueva oportunidad" fields=${oppFormFields} customDefs=${customDefs.opportunity || []}
          onSave=${async (payload) => { await api('/crm/opportunities', { method: 'POST', body: payload }); notify('Oportunidad creada'); load(); }}
          onClose=${() => setCreating(false)} />`}

      ${selected && html`
        <${RecordDrawerHost} entityType="opportunity" record=${selected} resource="opportunities"
          detailFields=${detailFields} customDefs=${customDefs.opportunity || []} users=${users} products=${products}
          canEdit=${false} canDelete=${false} onEdit=${() => {}} onDelete=${() => {}}
          onClose=${() => setSelected(null)} closeOpp=${(status) => { askClose(selected, status); setSelected(null); }}
          recordActions=${[]} reload=${load} notify=${notify} />`}

      ${confirm && html`<${ConfirmDialog} ...${confirm} onClose=${() => setConfirm(null)} />`}
      ${prompt && html`<${PromptDialog} ...${prompt} onClose=${() => setPrompt(null)} />`}
    </div>`;
}

// ================================================================
// Forecast de ventas
// ================================================================
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
}
function Forecast({ notify, users, brandColor }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [owner, setOwner] = useState('');
  const load = useCallback(() => {
    setError(null);
    api('/crm/forecast', { query: { months: 6, owner_user_id: owner || undefined } })
      .then((r) => setData(r.data)).catch((e) => setError(e.message));
  }, [owner]);
  useEffect(() => { load(); }, [load]);

  if (error) return html`<${ErrorState} message=${error} onRetry=${load} />`;
  if (!data) return html`<${Spinner} />`;

  const wonByMonth = Object.fromEntries(data.won_by_month.map((r) => [r.month, r]));
  const maxVal = Math.max(1, ...data.open_by_month.map((r) => Number(r.open_value)));
  const totalOpen = data.open_by_month.reduce((a, r) => a + Number(r.open_value), 0);
  const totalWeighted = data.open_by_month.reduce((a, r) => a + Number(r.weighted_value), 0);

  return html`
    <div>
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <h2 class="text-lg font-semibold mr-auto">Forecast de ventas</h2>
        <select class="border rounded-lg px-2 py-1.5 text-sm" value=${owner} onChange=${(e) => setOwner(e.target.value)}>
          <option value="">Todos los responsables</option>
          ${users.map((u) => html`<option key=${u.id} value=${u.id}>${u.name}</option>`)}
        </select>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <${KpiCard} label="Pipeline próximos 6 meses" value=${fmtMoney(totalOpen)} />
        <${KpiCard} label="Forecast ponderado" value=${fmtMoney(totalWeighted)} accent=${true} />
        <${KpiCard} label="Sin fecha de cierre" value=${fmtMoney(data.open_without_date.open_value)} sub=${`${data.open_without_date.count} oportunidades`} />
      </div>
      <div class="bg-white rounded-xl shadow p-4">
        <div class="text-sm font-semibold mb-3">Por mes de cierre previsto</div>
        ${data.open_by_month.length === 0 ? html`<${EmptyState} title="Sin previsión" hint="No hay oportunidades con fecha de cierre en el periodo." />`
          : html`<div class="space-y-3">
              ${data.open_by_month.map((r) => html`
                <div key=${r.month}>
                  <div class="flex justify-between text-sm mb-1">
                    <span class="font-medium">${monthLabel(r.month)} <span class="text-slate-400">(${r.count})</span></span>
                    <span>${fmtMoney(r.open_value)} · <span class="text-indigo-600">pond. ${fmtMoney(r.weighted_value)}</span></span>
                  </div>
                  <div class="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-indigo-200" style=${{ width: `${Number(r.open_value) / maxVal * 100}%` }}>
                      <div class="h-full" style=${{ width: `${Number(r.weighted_value) / Math.max(Number(r.open_value), 1) * 100}%`, backgroundColor: brandColor }}></div>
                    </div>
                  </div>
                  ${wonByMonth[r.month] && html`<div class="text-xs text-emerald-600 mt-0.5">Ganado: ${fmtMoney(wonByMonth[r.month].won_value)} (${wonByMonth[r.month].count})</div>`}
                </div>`)}
            </div>`}
      </div>
      ${data.won_by_month.length > 0 && html`
        <div class="bg-white rounded-xl shadow p-4 mt-4">
          <div class="text-sm font-semibold mb-2">Ganado por mes (histórico reciente)</div>
          ${data.won_by_month.map((r) => html`
            <div key=${r.month} class="flex justify-between text-sm py-1 border-b last:border-0">
              <span>${monthLabel(r.month)} <span class="text-slate-400">(${r.count})</span></span>
              <span class="font-medium text-emerald-600">${fmtMoney(r.won_value)}</span>
            </div>`)}
        </div>`}
    </div>`;
}

// ================================================================
// Configuración (usuarios, productos, campos personalizados, marca)
// ================================================================
function AdminUsers({ notify }) {
  const [users, setUsers] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => { api('/crm/admin/users').then((r) => setUsers(r.data)).catch((e) => notify(e.message, 'error')); }, []);
  useEffect(() => { load(); }, [load]);

  const createFields = [
    { name: 'name', label: 'Nombre', required: true, max: 120 },
    { name: 'email', label: 'Email', type: 'email', required: true, max: 254 },
    { name: 'password', label: 'Contraseña temporal (mín. 10)', type: 'password', required: true, minLength: 10, max: 128 },
    { name: 'role', label: 'Rol', type: 'select', required: true, options: ROLES },
  ];
  const editFields = [
    { name: 'name', label: 'Nombre', max: 120 },
    { name: 'role', label: 'Rol', type: 'select', options: ROLES },
    { name: 'is_active', label: 'Activo', type: 'checkbox' },
  ];
  async function save(payload) {
    if (editing?.id) { await api(`/crm/admin/users/${editing.id}`, { method: 'PATCH', body: payload }); notify('Usuario actualizado'); }
    else { await api('/crm/admin/users', { method: 'POST', body: payload }); notify('Usuario creado'); }
    load();
  }
  if (!users) return html`<${Spinner} />`;
  return html`
    <div>
      <div class="flex justify-between items-center mb-3">
        <div class="text-sm font-semibold">Usuarios (${users.length})</div>
        <button class="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm" onClick=${() => setEditing({})}>+ Invitar usuario</button>
      </div>
      <div class="bg-white rounded-xl shadow overflow-x-auto">
        <table class="w-full text-sm">
          <thead><tr class="text-left text-xs text-slate-400 border-b bg-slate-50/50">
            <th class="px-4 py-2">Nombre</th><th class="px-4 py-2">Email</th><th class="px-4 py-2">Rol</th><th class="px-4 py-2">Estado</th><th class="px-4 py-2"></th>
          </tr></thead>
          <tbody>
            ${users.map((u) => html`
              <tr key=${u.id} class="border-b last:border-0">
                <td class="px-4 py-2">${u.name}</td>
                <td class="px-4 py-2">${u.email}</td>
                <td class="px-4 py-2"><${Badge} value=${u.role} map=${ROLES} /></td>
                <td class="px-4 py-2">${u.is_active ? html`<span class="text-emerald-600">Activo</span>` : html`<span class="text-red-600">Desactivado</span>`}</td>
                <td class="px-4 py-2 text-right">${u.id !== getSession()?.user?.id && html`<button class="text-xs border rounded px-2 py-1" onClick=${() => setEditing(u)}>Editar</button>`}</td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      ${editing !== null && html`<${FormModal} title=${editing.id ? 'Editar usuario' : 'Invitar usuario'} fields=${editing.id ? editFields : createFields} initial=${editing.id ? editing : null} onSave=${save} onClose=${() => setEditing(null)} />`}
    </div>`;
}

function AdminBranding({ notify, onBrandChange }) {
  const [settings, setSettings] = useState(null);
  useEffect(() => { api('/crm/settings').then((r) => setSettings(r.data)).catch((e) => notify(e.message, 'error')); }, []);
  if (!settings) return html`<${Spinner} />`;
  async function save(e) {
    e.preventDefault();
    try {
      const res = await api('/crm/settings', { method: 'PATCH', body: { brand_name: settings.brand_name || null, brand_color: settings.brand_color || null } });
      notify('Marca actualizada'); onBrandChange(res.data);
    } catch (err) { notify(err.message, 'error'); }
  }
  return html`
    <form onSubmit=${save} class="bg-white rounded-xl shadow p-5 max-w-md space-y-3">
      <div class="text-sm font-semibold">Marca de tu CRM (white-label)</div>
      <label class="block">
        <span class="text-xs text-slate-600">Nombre visible</span>
        <input class="w-full border rounded-lg px-3 py-2 mt-1" maxLength="60" value=${settings.brand_name || ''} onInput=${(e) => setSettings({ ...settings, brand_name: e.target.value })} />
      </label>
      <label class="block">
        <span class="text-xs text-slate-600">Color de marca</span>
        <div class="flex items-center gap-2 mt-1">
          <input type="color" class="h-9 w-16 border rounded" value=${settings.brand_color || '#4f46e5'} onInput=${(e) => setSettings({ ...settings, brand_color: e.target.value })} />
          <span class="text-xs text-slate-400">${settings.brand_color || '#4f46e5'}</span>
        </div>
      </label>
      <button class="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm">Guardar</button>
    </form>`;
}

function Settings({ notify, productsView, customFieldsView, onBrandChange, users, products }) {
  const [section, setSection] = useState('users');
  const sections = [['users', 'Usuarios'], ['products', 'Productos'], ['fields', 'Campos personalizados'], ['brand', 'Marca']];
  return html`
    <div>
      <h2 class="text-lg font-semibold mb-4">Configuración</h2>
      <div class="flex gap-1 mb-4 border-b">
        ${sections.map(([id, label]) => html`
          <button key=${id} onClick=${() => setSection(id)} class="px-3 py-2 text-sm border-b-2 ${section === id ? 'border-indigo-600 text-indigo-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'}">${label}</button>`)}
      </div>
      ${section === 'users' && html`<${AdminUsers} notify=${notify} />`}
      ${section === 'products' && html`<${TableView} key="products" ...${productsView} notify=${notify} users=${users} products=${products} />`}
      ${section === 'fields' && html`<${TableView} key="fields" ...${customFieldsView} notify=${notify} users=${users} products=${products} />`}
      ${section === 'brand' && html`<${AdminBranding} notify=${notify} onBrandChange=${onBrandChange} />`}
    </div>`;
}

// ================================================================
// Pantalla "pendiente de backend"
// ================================================================
function ComingSoon({ title, icon, description, bullets }) {
  return html`
    <div>
      <div class="flex items-center gap-2 mb-1"><h2 class="text-lg font-semibold">${title}</h2>
        <span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Pendiente de backend</span></div>
      <div class="text-sm text-slate-400 mb-5">${description}</div>
      <div class="bg-white rounded-xl shadow p-6 max-w-2xl">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center"><${Icon} name=${icon} className="w-6 h-6" /></div>
          <div class="text-sm text-slate-500">Esta pantalla es una previsualización funcional. La lógica se activará cuando el equipo de backend exponga los endpoints correspondientes (ver <code class="bg-slate-100 px-1 rounded">docs/CRM_MODULES.md</code>).</div>
        </div>
        <ul class="space-y-2">
          ${bullets.map((b, i) => html`<li key=${i} class="flex items-start gap-2 text-sm text-slate-600"><span class="text-indigo-400 mt-0.5"><${Icon} name="check" className="w-4 h-4" /></span>${b}</li>`)}
        </ul>
        <button disabled class="mt-5 px-4 py-2 rounded-lg bg-slate-100 text-slate-400 text-sm cursor-not-allowed">Disponible próximamente</button>
      </div>
    </div>`;
}

// ================================================================
// Definiciones de vistas
// ================================================================
function leadViews(users, products) {
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const ownerMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return {
    title: 'Leads', singular: 'Lead', resource: 'leads',
    importColumnsHint: 'title, status, source, priority, main_pain, estimated_value, next_step',
    columns: [
      { name: 'title', label: 'Lead', render: (v) => html`<span class="font-medium text-slate-700">${v}</span>` },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${LEAD_STATUS} />` },
      { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
      { name: 'source', label: 'Fuente', render: (v) => SOURCE[v] || v },
      { name: 'product_id', label: 'Producto', render: (v) => productMap[v] || '—' },
      { name: 'estimated_value', label: 'Valor est.', render: fmtMoney },
      { name: 'owner_user_id', label: 'Responsable', render: (v) => ownerMap[v] || '—' },
      { name: 'next_follow_up_at', label: 'Seguimiento', render: fmtDateTime },
    ],
    filters: [
      { name: 'status', label: 'Estado', options: LEAD_STATUS },
      { name: 'priority', label: 'Prioridad', options: PRIORITY },
      { name: 'source', label: 'Fuente', options: SOURCE },
      { name: 'product_id', label: 'Producto', options: productMap },
    ],
    formFields: [
      { name: 'title', label: 'Título', required: true, max: 200 },
      { name: 'status', label: 'Estado', type: 'select', options: LEAD_STATUS },
      { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITY },
      { name: 'source', label: 'Fuente', type: 'select', options: SOURCE },
      { name: 'product_id', label: 'Producto/Servicio', type: 'select', options: productMap },
      { name: 'owner_user_id', label: 'Responsable', type: 'select', options: ownerMap },
      { name: 'estimated_value', label: 'Valor estimado (€)', type: 'number' },
      { name: 'main_pain', label: 'Dolor principal', type: 'textarea', max: 500 },
      { name: 'next_step', label: 'Próximo paso', type: 'textarea', max: 500 },
      { name: 'next_follow_up_at', label: 'Próximo seguimiento', type: 'datetime' },
      { name: 'lost_reason', label: 'Motivo de pérdida', type: 'textarea', max: 500 },
    ],
    detailFields: [
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${LEAD_STATUS} />` },
      { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
      { name: 'source', label: 'Fuente', render: (v) => SOURCE[v] || v },
      { name: 'product_id', label: 'Producto', render: (v) => productMap[v] || '—' },
      { name: 'estimated_value', label: 'Valor estimado', render: fmtMoney },
      { name: 'owner_user_id', label: 'Responsable', render: (v) => ownerMap[v] || '—' },
      { name: 'main_pain', label: 'Dolor principal' },
      { name: 'next_step', label: 'Próximo paso' },
      { name: 'next_follow_up_at', label: 'Próximo seguimiento', render: fmtDateTime },
      { name: 'lost_reason', label: 'Motivo de pérdida' },
      { name: 'created_at', label: 'Creado', render: fmtDateTime },
    ],
    recordActions: (row, h) => (can('close') && row.status !== 'converted' && row.status !== 'lost') ? [{
      label: 'Convertir', primary: true,
      onClick: () => h.confirm({
        title: 'Convertir lead', message: `¿Convertir "${row.title}" en oportunidad?`, confirmLabel: 'Convertir',
        onConfirm: async () => { await api(`/crm/leads/${row.id}/convert`, { method: 'POST', body: {} }); h.notify('Lead convertido en oportunidad'); h.close(); h.reload(); },
      }),
    }] : [],
  };
}

function companyViews(users) {
  const ownerMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return {
    title: 'Cuentas', singular: 'Cuenta', resource: 'companies',
    importColumnsHint: 'name, legal_name, tax_id, industry, email, phone, city, province, postal_code',
    columns: [
      { name: 'name', label: 'Empresa', render: (v) => html`<span class="font-medium text-slate-700">${v}</span>` },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${COMPANY_STATUS} />` },
      { name: 'industry', label: 'Sector' },
      { name: 'city', label: 'Ciudad' },
      { name: 'email', label: 'Email' },
      { name: 'phone', label: 'Teléfono' },
    ],
    filters: [{ name: 'status', label: 'Estado', options: COMPANY_STATUS }],
    formFields: [
      { name: 'name', label: 'Nombre', required: true, max: 200 },
      { name: 'legal_name', label: 'Razón social', max: 200 },
      { name: 'tax_id', label: 'CIF/NIF', max: 20 },
      { name: 'status', label: 'Estado', type: 'select', options: COMPANY_STATUS },
      { name: 'industry', label: 'Sector', max: 100 },
      { name: 'email', label: 'Email', type: 'email', max: 254 },
      { name: 'phone', label: 'Teléfono', max: 30 },
      { name: 'website', label: 'Web (https://…)', max: 255 },
      { name: 'address', label: 'Dirección', max: 255 },
      { name: 'city', label: 'Ciudad', max: 100 },
      { name: 'province', label: 'Provincia', max: 100 },
      { name: 'postal_code', label: 'CP', max: 10 },
      { name: 'owner_user_id', label: 'Responsable', type: 'select', options: ownerMap },
    ],
    detailFields: [
      { name: 'legal_name', label: 'Razón social' },
      { name: 'tax_id', label: 'CIF/NIF' },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${COMPANY_STATUS} />` },
      { name: 'industry', label: 'Sector' },
      { name: 'email', label: 'Email' },
      { name: 'phone', label: 'Teléfono' },
      { name: 'website', label: 'Web' },
      { name: 'address', label: 'Dirección' },
      { name: 'city', label: 'Ciudad' },
      { name: 'province', label: 'Provincia' },
      { name: 'owner_user_id', label: 'Responsable', render: (v) => ownerMap[v] || '—' },
      { name: 'created_at', label: 'Creada', render: fmtDateTime },
    ],
  };
}

function contactViews(users) {
  const ownerMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return {
    title: 'Contactos', singular: 'Contacto', resource: 'contacts',
    importColumnsHint: 'first_name, last_name, email, phone, job_title',
    columns: [
      { name: 'first_name', label: 'Nombre', render: (v, r) => html`<span class="font-medium text-slate-700">${v} ${r.last_name || ''}</span>` },
      { name: 'email', label: 'Email' },
      { name: 'phone', label: 'Teléfono' },
      { name: 'job_title', label: 'Cargo' },
      { name: 'consent_status', label: 'Consentimiento', render: (v) => CONSENT[v] || v },
    ],
    filters: [],
    formFields: [
      { name: 'first_name', label: 'Nombre', required: true, max: 100 },
      { name: 'last_name', label: 'Apellidos', max: 150 },
      { name: 'email', label: 'Email', type: 'email', max: 254 },
      { name: 'phone', label: 'Teléfono', max: 30 },
      { name: 'job_title', label: 'Cargo', max: 120 },
      { name: 'owner_user_id', label: 'Responsable', type: 'select', options: ownerMap },
      { name: 'legal_basis', label: 'Base jurídica (RGPD)', type: 'select', options: LEGAL_BASIS },
      { name: 'consent_status', label: 'Consentimiento', type: 'select', options: CONSENT },
    ],
    detailFields: [
      { name: 'email', label: 'Email' },
      { name: 'phone', label: 'Teléfono' },
      { name: 'job_title', label: 'Cargo' },
      { name: 'legal_basis', label: 'Base jurídica', render: (v) => LEGAL_BASIS[v] || v },
      { name: 'consent_status', label: 'Consentimiento', render: (v) => CONSENT[v] || v },
      { name: 'created_at', label: 'Creado', render: fmtDateTime },
    ],
    recordActions: (row, h) => {
      const actions = [];
      if (can('export')) actions.push({
        label: 'Exportar (RGPD)',
        onClick: async () => {
          try {
            const res = await api(`/crm/contacts/${row.id}/export`);
            const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = `contacto-${row.id}.json`; a.click();
            URL.revokeObjectURL(a.href);
          } catch (err) { h.notify(err.message, 'error'); }
        },
      });
      if (can('gdpr') && !row.anonymized_at) actions.push({
        label: 'Anonimizar', danger: true,
        onClick: () => h.confirm({
          title: 'Anonimizar contacto', danger: true, confirmLabel: 'Anonimizar',
          message: 'Esto borra de forma IRREVERSIBLE los datos personales y las notas del contacto. ¿Continuar?',
          onConfirm: async () => { await api(`/crm/contacts/${row.id}/anonymize`, { method: 'POST' }); h.notify('Contacto anonimizado'); h.close(); h.reload(); },
        }),
      });
      return actions;
    },
  };
}

function opportunityViews(users, products, stages) {
  const ownerMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const stageMap = Object.fromEntries(stages.map((s) => [s.id, s.name]));
  const openStages = stages.filter((s) => !s.is_won && !s.is_lost);
  return {
    title: 'Oportunidades', singular: 'Oportunidad', resource: 'opportunities',
    columns: [
      { name: 'title', label: 'Oportunidad', render: (v) => html`<span class="font-medium text-slate-700">${v}</span>` },
      { name: 'stage_id', label: 'Etapa', render: (v) => stageMap[v] || '—' },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${OPP_STATUS} />` },
      { name: 'amount', label: 'Importe', render: fmtMoney },
      { name: 'probability', label: 'Prob.', render: (v) => v == null ? '—' : `${v}%` },
      { name: 'owner_user_id', label: 'Responsable', render: (v) => ownerMap[v] || '—' },
      { name: 'expected_close_date', label: 'Cierre', render: fmtDate },
    ],
    filters: [
      { name: 'status', label: 'Estado', options: OPP_STATUS },
      { name: 'stage_id', label: 'Etapa', options: stageMap },
      { name: 'priority', label: 'Prioridad', options: PRIORITY },
      { name: 'product_id', label: 'Producto', options: productMap },
    ],
    formFields: [
      { name: 'title', label: 'Título', required: true, max: 200 },
      { name: 'stage_id', label: 'Etapa', type: 'select', required: true, options: Object.fromEntries(openStages.map((s) => [s.id, s.name])) },
      { name: 'amount', label: 'Importe (€)', type: 'number' },
      { name: 'probability', label: 'Probabilidad (%)', type: 'number' },
      { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITY },
      { name: 'product_id', label: 'Producto/Servicio', type: 'select', options: productMap },
      { name: 'owner_user_id', label: 'Responsable', type: 'select', options: ownerMap },
      { name: 'expected_close_date', label: 'Cierre previsto', type: 'date' },
      { name: 'next_step', label: 'Próximo paso', type: 'textarea', max: 500 },
      { name: 'next_follow_up_at', label: 'Próximo seguimiento', type: 'datetime' },
      { name: 'main_pain', label: 'Dolor principal', type: 'textarea', max: 500 },
    ],
    detailFields: [
      { name: 'stage_id', label: 'Etapa', render: (v) => stageMap[v] || '—' },
      { name: 'amount', label: 'Importe', render: fmtMoney },
      { name: 'probability', label: 'Probabilidad', render: (v) => v == null ? '—' : `${v}%` },
      { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
      { name: 'product_id', label: 'Producto', render: (v) => productMap[v] || '—' },
      { name: 'owner_user_id', label: 'Responsable', render: (v) => ownerMap[v] || '—' },
      { name: 'expected_close_date', label: 'Cierre previsto', render: fmtDate },
      { name: 'next_step', label: 'Próximo paso' },
      { name: 'next_follow_up_at', label: 'Próximo seguimiento', render: fmtDateTime },
      { name: 'lost_reason', label: 'Motivo de pérdida' },
      { name: 'created_at', label: 'Creada', render: fmtDateTime },
    ],
  };
}

function taskViews(users) {
  const ownerMap = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return {
    title: 'Tareas', singular: 'Tarea', resource: 'tasks',
    columns: [
      { name: 'title', label: 'Tarea', render: (v) => html`<span class="font-medium text-slate-700">${v}</span>` },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${TASK_STATUS} />` },
      { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
      { name: 'assigned_to', label: 'Asignada a', render: (v) => ownerMap[v] || '—' },
      { name: 'due_at', label: 'Vence', render: (v) => v && new Date(v) < new Date() ? html`<span class="text-red-600">${fmtDateTime(v)}</span>` : fmtDateTime(v) },
    ],
    filters: [
      { name: 'status', label: 'Estado', options: TASK_STATUS },
      { name: 'priority', label: 'Prioridad', options: PRIORITY },
      { name: 'assigned_to', label: 'Responsable', options: ownerMap },
    ],
    formFields: [
      { name: 'title', label: 'Título', required: true, max: 200 },
      { name: 'description', label: 'Descripción', type: 'textarea', max: 2000 },
      { name: 'status', label: 'Estado', type: 'select', options: TASK_STATUS },
      { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITY },
      { name: 'assigned_to', label: 'Asignada a', type: 'select', options: ownerMap },
      { name: 'due_at', label: 'Vencimiento', type: 'datetime' },
    ],
    detailFields: [
      { name: 'description', label: 'Descripción' },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${TASK_STATUS} />` },
      { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
      { name: 'assigned_to', label: 'Asignada a', render: (v) => ownerMap[v] || '—' },
      { name: 'due_at', label: 'Vence', render: fmtDateTime },
      { name: 'created_at', label: 'Creada', render: fmtDateTime },
    ],
    permDelete: 'update',
  };
}

function productsView() {
  return {
    title: 'Productos', singular: 'Producto', resource: 'products',
    columns: [
      { name: 'name', label: 'Producto', render: (v) => html`<span class="font-medium text-slate-700">${v}</span>` },
      { name: 'description', label: 'Descripción' },
      { name: 'price', label: 'Precio', render: fmtMoney },
      { name: 'is_active', label: 'Activo', render: (v) => v ? html`<span class="text-emerald-600">Sí</span>` : html`<span class="text-slate-400">No</span>` },
    ],
    filters: [],
    formFields: [
      { name: 'name', label: 'Nombre', required: true, max: 120 },
      { name: 'description', label: 'Descripción', type: 'textarea', max: 500 },
      { name: 'price', label: 'Precio (€)', type: 'number' },
      { name: 'is_active', label: 'Activo', type: 'checkbox' },
    ],
    detailFields: [
      { name: 'description', label: 'Descripción' },
      { name: 'price', label: 'Precio', render: fmtMoney },
      { name: 'is_active', label: 'Activo', render: (v) => v ? 'Sí' : 'No' },
      { name: 'created_at', label: 'Creado', render: fmtDateTime },
    ],
    permCreate: 'admin', permEdit: 'admin', permDelete: 'admin',
  };
}

function customFieldsView() {
  return {
    title: 'Campos personalizados', singular: 'Campo', resource: 'custom-fields',
    columns: [
      { name: 'label', label: 'Etiqueta', render: (v) => html`<span class="font-medium text-slate-700">${v}</span>` },
      { name: 'key', label: 'Clave' },
      { name: 'entity_type', label: 'Entidad', render: (v) => ENTITY_LABEL[v] || v },
      { name: 'field_type', label: 'Tipo', render: (v) => FIELD_TYPES[v] || v },
      { name: 'options', label: 'Opciones', render: (v) => Array.isArray(v) ? v.join(', ') : '—' },
    ],
    filters: [{ name: 'entity_type', label: 'Entidad', options: ENTITY_LABEL }],
    formFields: [
      { name: 'entity_type', label: 'Entidad', type: 'select', required: true, options: ENTITY_LABEL },
      { name: 'key', label: 'Clave (minúsculas y _, ej: num_locales)', required: true, max: 40 },
      { name: 'label', label: 'Etiqueta visible', required: true, max: 80 },
      { name: 'field_type', label: 'Tipo', type: 'select', required: true, options: FIELD_TYPES },
      { name: 'options_csv', label: 'Opciones (separadas por coma, solo tipo Lista)', max: 500 },
    ],
    detailFields: [
      { name: 'key', label: 'Clave' },
      { name: 'entity_type', label: 'Entidad', render: (v) => ENTITY_LABEL[v] || v },
      { name: 'field_type', label: 'Tipo', render: (v) => FIELD_TYPES[v] || v },
      { name: 'options', label: 'Opciones', render: (v) => Array.isArray(v) ? v.join(', ') : '—' },
    ],
    editable: false,
    permCreate: 'admin', permEdit: 'admin', permDelete: 'admin',
    transformPayload: (payload) => {
      const { options_csv, ...rest } = payload;
      if (options_csv) rest.options = String(options_csv).split(',').map((s) => s.trim()).filter(Boolean);
      return rest;
    },
  };
}

// ================================================================
// Búsqueda global
// ================================================================
const SEARCH_RESOURCES = [
  { resource: 'leads', label: 'Leads', icon: 'lead', name: (r) => r.title },
  { resource: 'companies', label: 'Cuentas', icon: 'building', name: (r) => r.name },
  { resource: 'contacts', label: 'Contactos', icon: 'contacts', name: (r) => `${r.first_name} ${r.last_name || ''}`.trim() },
  { resource: 'opportunities', label: 'Oportunidades', icon: 'opportunity', name: (r) => r.title },
];

function GlobalSearch({ onOpen }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (term.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const all = await Promise.all(SEARCH_RESOURCES.map((s) =>
          api(`/crm/${s.resource}`, { query: { search: term.trim(), page_size: 5 } }).then((r) => ({ ...s, rows: r.data })).catch(() => ({ ...s, rows: [] }))
        ));
        setResults(all.filter((g) => g.rows.length));
        setOpen(true);
      } catch { /* búsqueda silenciosa */ }
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  return html`
    <div class="relative w-full max-w-md" ref=${ref}>
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><${Icon} name="search" className="w-4 h-4" /></span>
      <input class="w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-slate-50 focus:bg-white" placeholder="Buscar leads, cuentas, contactos…" maxLength="100"
        value=${term} onFocus=${() => results && setOpen(true)} onInput=${(e) => setTerm(e.target.value)} />
      ${open && results && html`
        <div class="absolute z-40 mt-1 w-full bg-white border rounded-xl shadow-lg max-h-96 overflow-y-auto">
          ${results.length === 0 ? html`<div class="p-4 text-sm text-slate-400 text-center">Sin resultados para "${term}"</div>`
            : results.map((g) => html`
              <div key=${g.resource}>
                <div class="px-3 pt-2 pb-1 text-xs font-semibold text-slate-400 uppercase">${g.label}</div>
                ${g.rows.map((r) => html`
                  <button key=${r.id} class="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-indigo-50 text-left"
                    onClick=${() => { setOpen(false); setTerm(''); setResults(null); onOpen(g.resource, r.id); }}>
                    <span class="text-slate-300"><${Icon} name=${g.icon} className="w-4 h-4" /></span>
                    <span class="truncate">${g.name(r)}</span>
                  </button>`)}
              </div>`)}
        </div>`}
    </div>`;
}

// ================================================================
// Navegación lateral + shell
// ================================================================
const MODULES = {
  dashboard: { label: 'Dashboard', icon: 'dashboard', group: 'main' },
  pipeline: { label: 'Pipeline', icon: 'pipeline', group: 'main' },
  forecast: { label: 'Forecast', icon: 'forecast', group: 'main' },
  leads: { label: 'Leads', icon: 'lead', group: 'records' },
  companies: { label: 'Cuentas', icon: 'building', group: 'records' },
  contacts: { label: 'Contactos', icon: 'contacts', group: 'records' },
  opportunities: { label: 'Oportunidades', icon: 'opportunity', group: 'records' },
  tasks: { label: 'Tareas', icon: 'task', group: 'records' },
  products: { label: 'Productos', icon: 'product', group: 'records' },
  automations: { label: 'Automatizaciones', icon: 'bolt', group: 'soon', soon: true },
  email: { label: 'Email y Calendario', icon: 'mail', group: 'soon', soon: true },
  billing: { label: 'Facturación', icon: 'billing', group: 'soon', soon: true },
  security: { label: 'Seguridad (MFA)', icon: 'shield', group: 'soon', soon: true },
  settings: { label: 'Configuración', icon: 'settings', group: 'bottom', admin: true },
};
const GROUPS = [['main', null], ['records', 'Registros'], ['soon', 'Próximamente']];

function Sidebar({ module, goto, brandName, brandColor, open, setOpen }) {
  const visible = (id, m) => !(m.admin && !can('admin'));
  function NavBtn(id, m) {
    if (!visible(id, m)) return null;
    const active = module === id;
    return html`
      <button key=${id} onClick=${() => { goto(id); setOpen(false); }}
        class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${active ? 'text-white font-medium' : 'text-slate-600 hover:bg-slate-100'}"
        style=${active ? { backgroundColor: brandColor } : {}}>
        <${Icon} name=${m.icon} className="w-5 h-5 shrink-0" />
        <span class="truncate">${m.label}</span>
        ${m.soon && html`<span class="ml-auto text-[9px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}">pronto</span>`}
      </button>`;
  }
  return html`
    <aside class="${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform fixed md:static z-40 w-64 h-full bg-white border-r flex flex-col">
      <div class="h-14 flex items-center gap-2 px-4 border-b" style=${{ borderBottomColor: brandColor, borderBottomWidth: '2px' }}>
        <div class="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0" style=${{ backgroundColor: brandColor }}>${initials(brandName)}</div>
        <div class="font-bold truncate" style=${{ color: brandColor }}>${brandName}</div>
      </div>
      <nav class="flex-1 overflow-y-auto p-2 space-y-1">
        ${GROUPS.map(([g, label]) => {
          const items = Object.entries(MODULES).filter(([, m]) => m.group === g && (!m.admin || can('admin')));
          if (!items.length) return null;
          return html`
            <div key=${g} class="pt-2">
              ${label && html`<div class="px-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">${label}</div>`}
              ${items.map(([id, m]) => NavBtn(id, m))}
            </div>`;
        })}
      </nav>
      <div class="p-2 border-t">
        ${Object.entries(MODULES).filter(([, m]) => m.group === 'bottom' && (!m.admin || can('admin'))).map(([id, m]) => NavBtn(id, m))}
      </div>
    </aside>`;
}

// ================================================================
// App
// ================================================================
function App() {
  const [session, setSessionState] = useState(getSession());
  const [module, setModule] = useState('dashboard');
  const [openRecord, setOpenRecord] = useState(null); // { resource, id }
  const [toast, setToast] = useState(null);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [stages, setStages] = useState([]);
  const [customDefs, setCustomDefs] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadCatalogs = useCallback(() => {
    api('/crm/users').then((r) => setUsers(r.data)).catch(() => {});
    api('/crm/products', { query: { page_size: 100 } }).then((r) => setProducts(r.data)).catch(() => {});
    api('/crm/pipeline').then((r) => setStages(r.data.stages)).catch(() => {});
    api('/crm/custom-fields').then((r) => {
      const byEntity = {};
      for (const d of r.data) (byEntity[d.entity_type] = byEntity[d.entity_type] || []).push(d);
      setCustomDefs(byEntity);
    }).catch(() => {});
  }, []);
  useEffect(() => { if (session) loadCatalogs(); }, [session]);

  if (!session) return html`<${Login} onLogin=${() => setSessionState(getSession())} />`;

  const settings = session.organization?.settings || {};
  const brandName = settings.brand_name || session.organization?.name || 'CRM';
  const brandColor = settings.brand_color || '#4f46e5';

  function onBrandChange(newSettings) {
    const updated = { ...session, organization: { ...session.organization, settings: newSettings } };
    setSession(updated); setSessionState(updated);
  }
  function goto(m) { setModule(m); setOpenRecord(null); }
  function openFromSearch(resource, id) {
    const map = { leads: 'leads', companies: 'companies', contacts: 'contacts', opportunities: 'opportunities' };
    setModule(map[resource] || resource);
    setOpenRecord({ resource, id });
  }

  if (!can('read')) {
    return html`
      <div class="min-h-screen flex items-center justify-center bg-slate-100">
        <div class="bg-white rounded-2xl shadow p-8 text-center space-y-3 max-w-sm">
          <div class="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center"><${Icon} name="shield" className="w-6 h-6" /></div>
          <div class="font-semibold">Tu rol no tiene acceso al CRM</div>
          <div class="text-sm text-slate-400">Contacta con un administrador de tu organización.</div>
          <button class="text-sm text-indigo-600 hover:underline" onClick=${() => { setSession(null); setSessionState(null); }}>Salir</button>
        </div>
      </div>`;
  }

  const tableProps = {
    leads: { ...leadViews(users, products), customDefs: customDefs.lead || [] },
    companies: { ...companyViews(users), customDefs: customDefs.company || [] },
    contacts: { ...contactViews(users), customDefs: customDefs.contact || [] },
    opportunities: { ...opportunityViews(users, products, stages), customDefs: customDefs.opportunity || [] },
    tasks: taskViews(users),
    products: productsView(),
  };
  const consumeOpen = () => setOpenRecord(null);

  return html`
    <div class="h-screen flex bg-slate-100 overflow-hidden">
      ${sidebarOpen && html`<div class="fixed inset-0 bg-black/30 z-30 md:hidden" onClick=${() => setSidebarOpen(false)}></div>`}
      <${Sidebar} module=${module} goto=${goto} brandName=${brandName} brandColor=${brandColor} open=${sidebarOpen} setOpen=${setSidebarOpen} />
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Topbar -->
        <header class="h-14 bg-white border-b flex items-center gap-3 px-4 shrink-0">
          <button class="md:hidden text-slate-500" onClick=${() => setSidebarOpen(true)}><${Icon} name="menu" className="w-6 h-6" /></button>
          <${GlobalSearch} onOpen=${openFromSearch} />
          <div class="ml-auto flex items-center gap-3">
            <${Dropdown} align="right" panelClass="w-52" button=${html`
              <button class="flex items-center gap-2 text-sm">
                <span class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold">${initials(session.user.name)}</span>
                <span class="hidden sm:block text-slate-600">${session.user.name}</span>
                <${Icon} name="chevronDown" className="w-4 h-4 text-slate-400" />
              </button>`}>
              <div class="px-3 py-2 border-b">
                <div class="text-sm font-medium truncate">${session.user.name}</div>
                <div class="text-xs text-slate-400">${ROLES[session.user.role] || session.user.role} · ${session.organization?.name || ''}</div>
              </div>
              ${can('admin') && html`<button class="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50" onClick=${() => goto('settings')}>Configuración</button>`}
              <button class="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-50" onClick=${() => goto('security')}>Seguridad (MFA)</button>
              <button class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm rounded-lg hover:bg-red-50 text-red-600" onClick=${() => { setSession(null); setSessionState(null); }}>
                <${Icon} name="logout" className="w-4 h-4" /> Cerrar sesión</button>
            <//>
          </div>
        </header>

        <!-- Contenido -->
        <main class="flex-1 overflow-y-auto p-4 md:p-6">
          ${module === 'dashboard' && html`<${Dashboard} notify=${notify} brandColor=${brandColor} goto=${goto} />`}
          ${module === 'pipeline' && html`<${Pipeline} notify=${notify} users=${users} products=${products} customDefs=${customDefs} brandColor=${brandColor} />`}
          ${module === 'forecast' && html`<${Forecast} notify=${notify} users=${users} brandColor=${brandColor} />`}
          ${tableProps[module] && html`
            <${TableView} key=${module} ...${tableProps[module]} notify=${notify} users=${users} products=${products}
              openId=${openRecord && openRecord.resource === module ? openRecord.id : null} onConsumedOpenId=${consumeOpen} />`}
          ${module === 'settings' && can('admin') && html`
            <${Settings} notify=${notify} onBrandChange=${onBrandChange} users=${users} products=${products}
              productsView=${productsView()} customFieldsView=${customFieldsView()} />`}
          ${module === 'automations' && html`
            <${ComingSoon} title="Automatizaciones" icon="bolt"
              description="Reglas del pipeline para no perder oportunidades."
              bullets=${[
                'Disparadores: lead sin actividad N días, oportunidad estancada, fecha de cierre vencida.',
                'Acciones: crear tarea, reasignar responsable, cambiar etapa, enviar aviso.',
                'Registro completo en el log de auditoría existente.',
                'Contrato de API propuesto en docs/CRM_MODULES.md (sección API pendiente).',
              ]} />`}
          ${module === 'email' && html`
            <${ComingSoon} title="Email y Calendario" icon="mail"
              description="Sincroniza correo y reuniones con cada registro."
              bullets=${[
                'Conexión con Google / Microsoft 365 vía OAuth.',
                'Registro automático de emails y eventos en el timeline del contacto.',
                'Plantillas de email y seguimiento de aperturas.',
                'El modelo de actividad actual ya admite eventos externos.',
              ]} />`}
          ${module === 'billing' && html`
            <${ComingSoon} title="Facturación y planes" icon="billing"
              description="Suscripción de la organización y límites por plan."
              bullets=${[
                'Planes por nº de usuarios y registros (integración Stripe).',
                'Gestión de método de pago y facturas descargables.',
                'Avisos de uso y actualización/baja de plan.',
                'Sin almacenar datos de tarjeta: tokenización en el proveedor.',
              ]} />`}
          ${module === 'security' && html`
            <${ComingSoon} title="Seguridad de la cuenta (MFA)" icon="shield"
              description="Refuerza el acceso de tu equipo."
              bullets=${[
                'Doble factor (TOTP) obligatorio configurable para owner/admin.',
                'Tokens de refresco y revocación de sesiones.',
                'Política de contraseñas y bloqueo por intentos.',
                'Historial de inicios de sesión y dispositivos.',
              ]} />`}
        </main>
      </div>
      <${Toast} toast=${toast} />
    </div>`;
}

// ================================================================
// Login + Signup
// ================================================================
function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ organization_name: '', name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = mode === 'login'
        ? await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password } })
        : await api('/auth/signup', { method: 'POST', body: form });
      setSession(res.data); onLogin();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return html`
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-100 to-white p-4">
      <form onSubmit=${submit} class="bg-white rounded-2xl shadow-xl p-8 w-[26rem] space-y-4">
        <div class="text-center">
          <div class="w-12 h-12 mx-auto rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg mb-2">C</div>
          <div class="text-xl font-bold text-slate-800">${mode === 'login' ? 'Bienvenido de nuevo' : 'Crea tu CRM'}</div>
          <div class="text-sm text-slate-500">${mode === 'login' ? 'Accede con tu cuenta' : 'Da de alta tu empresa en un minuto'}</div>
        </div>
        ${error && html`<div class="bg-red-50 text-red-700 text-sm rounded-lg p-2">${error}</div>`}
        ${mode === 'signup' && html`
          <input class="w-full border rounded-lg px-3 py-2" placeholder="Nombre de tu empresa" required minLength="2" maxLength="200" value=${form.organization_name} onInput=${set('organization_name')} />
          <input class="w-full border rounded-lg px-3 py-2" placeholder="Tu nombre" required minLength="2" maxLength="120" value=${form.name} onInput=${set('name')} />`}
        <input class="w-full border rounded-lg px-3 py-2" type="email" placeholder="Email" required value=${form.email} onInput=${set('email')} />
        <input class="w-full border rounded-lg px-3 py-2" type="password" placeholder="Contraseña" required minLength=${mode === 'signup' ? 10 : 8} value=${form.password} onInput=${set('password')} />
        <button disabled=${busy} class="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
          ${busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <button type="button" class="w-full text-sm text-indigo-600 hover:underline" onClick=${() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}>
          ${mode === 'login' ? '¿Primera vez? Crea la cuenta de tu empresa' : 'Ya tengo cuenta: entrar'}
        </button>
      </form>
    </div>`;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);

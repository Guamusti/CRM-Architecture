'use strict';
/* CRM white-label — frontend sin build (React UMD + htm, compatible con CSP).
   REGLA: aquí no hay lógica de seguridad. Los permisos solo ocultan
   controles como mejora de UX; el backend decide siempre. */

const { useState, useEffect, useCallback } = React;
const html = htm.bind(React.createElement);

// ----------------------------------------------------------------
// API y sesión
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// Catálogos y permisos (espejo UX de la matriz del backend)
// ----------------------------------------------------------------
const LEAD_STATUS = { new: 'Nuevo', contacted: 'Contactado', qualified: 'Cualificado', unqualified: 'No cualificado', converted: 'Convertido', lost: 'Perdido' };
const PRIORITY = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
const SOURCE = { web: 'Web', referral: 'Referido', cold_call: 'Puerta fría', email: 'Email', social: 'RRSS', event: 'Evento', partner: 'Partner', inbound: 'Inbound', other: 'Otro' };
const COMPANY_STATUS = { prospect: 'Prospecto', active: 'Activa', customer: 'Cliente', inactive: 'Inactiva', former_customer: 'Ex-cliente' };
const TASK_STATUS = { pending: 'Pendiente', in_progress: 'En curso', done: 'Hecha', cancelled: 'Cancelada' };
const ROLES = { owner: 'Owner', admin: 'Admin', manager: 'Manager', worker: 'Comercial', caja: 'Caja' };
const ENTITY_LABEL = { lead: 'Lead', company: 'Empresa', contact: 'Contacto', opportunity: 'Oportunidad' };
const FIELD_TYPES = { text: 'Texto', number: 'Número', date: 'Fecha', boolean: 'Sí/No', select: 'Lista' };

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

const PRIORITY_COLOR = { low: 'bg-slate-200 text-slate-700', medium: 'bg-sky-100 text-sky-700', high: 'bg-amber-100 text-amber-700', urgent: 'bg-red-100 text-red-700' };
const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('es-ES') : '—';
const fmtDateTime = (v) => v ? new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// ----------------------------------------------------------------
// Componentes básicos
// ----------------------------------------------------------------
function Badge({ value, map, colorMap }) {
  if (!value) return html`<span class="text-slate-400">—</span>`;
  const color = (colorMap && colorMap[value]) || 'bg-slate-100 text-slate-600';
  return html`<span class="px-2 py-0.5 rounded-full text-xs font-medium ${color}">${(map && map[value]) || value}</span>`;
}

function Toast({ toast }) {
  if (!toast) return null;
  const color = toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600';
  return html`<div class="fixed bottom-4 right-4 z-50 ${color} text-white px-4 py-2 rounded-lg shadow-lg text-sm max-w-md">${toast.msg}</div>`;
}

function Spinner() {
  return html`<div class="p-8 text-center text-slate-400">Cargando…</div>`;
}

// ----------------------------------------------------------------
// Login + Signup (alta self-service de organización)
// ----------------------------------------------------------------
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
      setSession(res.data);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return html`
    <div class="min-h-screen flex items-center justify-center">
      <form onSubmit=${submit} class="bg-white rounded-2xl shadow-xl p-8 w-[26rem] space-y-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-indigo-600">CRM</div>
          <div class="text-sm text-slate-500">
            ${mode === 'login' ? 'Accede con tu cuenta' : 'Crea la cuenta de tu empresa'}
          </div>
        </div>
        ${error && html`<div class="bg-red-50 text-red-700 text-sm rounded-lg p-2">${error}</div>`}
        ${mode === 'signup' && html`
          <input class="w-full border rounded-lg px-3 py-2" placeholder="Nombre de tu empresa" required minLength="2" maxLength="200"
            value=${form.organization_name} onInput=${set('organization_name')} />
          <input class="w-full border rounded-lg px-3 py-2" placeholder="Tu nombre" required minLength="2" maxLength="120"
            value=${form.name} onInput=${set('name')} />`}
        <input class="w-full border rounded-lg px-3 py-2" type="email" placeholder="Email" required
          value=${form.email} onInput=${set('email')} />
        <input class="w-full border rounded-lg px-3 py-2" type="password" placeholder="Contraseña"
          required minLength=${mode === 'signup' ? 10 : 8}
          value=${form.password} onInput=${set('password')} />
        <button disabled=${busy} class="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 font-medium disabled:opacity-50">
          ${busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <button type="button" class="w-full text-sm text-indigo-600 hover:underline"
          onClick=${() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}>
          ${mode === 'login' ? '¿Primera vez? Crea la cuenta de tu empresa' : 'Ya tengo cuenta: entrar'}
        </button>
      </form>
    </div>`;
}

// ----------------------------------------------------------------
// Formulario genérico (modal) con soporte de campos personalizados
// ----------------------------------------------------------------
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
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit=${submit} class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-3">
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
              <input type="checkbox" class="block mt-1" checked=${values[f.name] === true || values[f.name] === 'true'}
                onChange=${(e) => setValues({ ...values, [f.name]: e.target.checked })} />` : f.type === 'textarea' ? html`
              <textarea class="w-full border rounded-lg px-3 py-2 mt-1" rows="3" maxLength=${f.max || 500}
                value=${values[f.name]} onInput=${(e) => setValues({ ...values, [f.name]: e.target.value })}></textarea>` : html`
              <input class="w-full border rounded-lg px-3 py-2 mt-1" required=${!!f.required}
                type=${f.type === 'datetime' ? 'datetime-local' : f.type || 'text'}
                maxLength=${f.max || 200} step=${f.type === 'number' ? '0.01' : undefined}
                minLength=${f.minLength || undefined}
                value=${values[f.name]} onInput=${(e) => setValues({ ...values, [f.name]: e.target.value })} />`}
          </label>`)}
        ${customDefs.length > 0 && html`
          <div class="border-t pt-2">
            <div class="text-xs font-semibold text-slate-400 uppercase mb-1">Campos personalizados</div>
            ${customDefs.map((d) => html`
              <label key=${d.key} class="block mb-2">
                ${d.field_type !== 'boolean' && html`<span class="text-xs font-medium text-slate-600">${d.label}</span>`}
                ${customInput(d)}
              </label>`)}
          </div>`}
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="px-4 py-2 rounded-lg border" onClick=${onClose}>Cancelar</button>
          <button disabled=${busy} class="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50">
            ${busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>`;
}

// ----------------------------------------------------------------
// Importación CSV (parseo en cliente -> filas JSON al backend)
// ----------------------------------------------------------------
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('El CSV necesita cabecera y al menos una fila');
  const split = (line) => line.split(';').length > line.split(',').length ? line.split(';') : line.split(',');
  const headers = split(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row = {};
    headers.forEach((h, i) => {
      const v = (cells[i] || '').trim();
      if (v !== '') row[h] = v;
    });
    return row;
  });
}

function ImportModal({ resource, columnsHint, onDone, onClose, notify }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const rows = parseCsv(text);
      if (rows.length > 500) throw new Error('Máximo 500 filas por importación');
      const res = await api(`/crm/import/${resource}`, { method: 'POST', body: { rows } });
      setResult(res.data);
      if (res.data.created) { notify(`${res.data.created} registros importados`); onDone(); }
    } catch (err) { notify(err.message, 'error'); }
    finally { setBusy(false); }
  }

  return html`
    <div class="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-3">
        <div class="text-lg font-semibold">Importar CSV</div>
        <div class="text-xs text-slate-500">
          Primera línea: cabeceras (separador coma o punto y coma). Columnas admitidas:
          <code class="bg-slate-100 px-1 rounded">${columnsHint}</code>
        </div>
        <textarea class="w-full border rounded-lg p-2 font-mono text-xs" rows="10"
          placeholder=${`${columnsHint.split(', ').slice(0, 3).join(',')}\n...`}
          value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
        ${result && html`
          <div class="text-sm bg-slate-50 rounded-lg p-2">
            <div>Importados: <b class="text-emerald-700">${result.created}</b> · Fallidos: <b class="text-red-600">${result.failed}</b></div>
            ${result.errors.map((e) => html`<div key=${e.row} class="text-xs text-red-600">Fila ${e.row}: ${e.error}</div>`)}
          </div>`}
        <div class="flex gap-2 justify-end">
          <button class="px-4 py-2 rounded-lg border" onClick=${onClose}>Cerrar</button>
          <button disabled=${busy || !text.trim()} class="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50" onClick=${run}>
            ${busy ? 'Importando…' : 'Importar'}
          </button>
        </div>
      </div>
    </div>`;
}

// ----------------------------------------------------------------
// Notas + actividad de una entidad
// ----------------------------------------------------------------
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
    <div class="space-y-4">
      <div>
        <div class="text-sm font-semibold mb-2">Notas internas</div>
        ${can('create') && html`
          <form onSubmit=${addNote} class="flex gap-2 mb-2">
            <input class="flex-1 border rounded-lg px-3 py-1.5 text-sm" placeholder="Añadir nota…" maxLength="5000"
              value=${body} onInput=${(e) => setBody(e.target.value)} />
            <button class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm">Añadir</button>
          </form>`}
        ${notes === null ? html`<${Spinner} />` : notes.length === 0
          ? html`<div class="text-sm text-slate-400">Sin notas</div>`
          : notes.map((n) => html`
            <div key=${n.id} class="bg-amber-50 border border-amber-100 rounded-lg p-2 mb-1 text-sm">
              <div>${n.body}</div>
              <div class="text-xs text-slate-400 mt-1">${fmtDateTime(n.created_at)}</div>
            </div>`)}
      </div>
      <div>
        <div class="text-sm font-semibold mb-2">Historial de actividad</div>
        ${activity === null ? html`<${Spinner} />` : activity.length === 0
          ? html`<div class="text-sm text-slate-400">Sin actividad</div>`
          : activity.map((a) => html`
            <div key=${a.id} class="text-xs text-slate-500 border-l-2 border-slate-200 pl-2 mb-1">
              <span class="font-medium text-slate-700">${a.actor_name || 'Sistema'}</span> · ${a.action} · ${fmtDateTime(a.created_at)}
            </div>`)}
      </div>
    </div>`;
}

// ----------------------------------------------------------------
// Ficha de detalle (drawer lateral)
// ----------------------------------------------------------------
function Drawer({ title, onClose, children, actions }) {
  return html`
    <div class="fixed inset-0 z-30 bg-black/30" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto">
        <div class="sticky top-0 bg-white border-b px-5 py-3 flex items-center justify-between gap-2">
          <div class="font-semibold truncate">${title}</div>
          <div class="flex gap-2 items-center shrink-0">
            ${actions}
            <button class="text-slate-400 hover:text-slate-700 text-xl leading-none" onClick=${onClose}>×</button>
          </div>
        </div>
        <div class="p-5">${children}</div>
      </div>
    </div>`;
}

function FieldGrid({ row, fields, customDefs = [] }) {
  return html`
    <div class="grid grid-cols-2 gap-x-4 gap-y-2 mb-5">
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

// ----------------------------------------------------------------
// Vista de tabla genérica con filtros, paginación e importación
// ----------------------------------------------------------------
function TableView({ resource, columns, filters, formFields, detailFields, title, singular, notify,
                     extraDrawerActions, customDefs = [], importColumnsHint, transformPayload, editable = true }) {
  const [data, setData] = useState(null);
  const [pagination, setPagination] = useState({ page: 1 });
  const [query, setQuery] = useState({});
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async (page = 1) => {
    try {
      const res = await api(`/crm/${resource}`, { query: { ...query, page, page_size: 25 } });
      setData(res.data); setPagination(res.pagination);
    } catch (err) { notify(err.message, 'error'); }
  }, [resource, query]);

  useEffect(() => { load(1); }, [load]);

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

  async function remove(row) {
    if (!window.confirm(`¿Eliminar "${row.name || row.title || row.first_name}"? (recuperable por soporte)`)) return;
    try {
      await api(`/crm/${resource}/${row.id}`, { method: 'DELETE' });
      notify(`${singular} eliminado`);
      setSelected(null);
      await load(pagination.page);
    } catch (err) { notify(err.message, 'error'); }
  }

  return html`
    <div>
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <h2 class="text-lg font-semibold mr-auto">${title}</h2>
        <input class="border rounded-lg px-3 py-1.5 text-sm w-44" placeholder="Buscar…" maxLength="100"
          onInput=${(e) => setQuery({ ...query, search: e.target.value })} value=${query.search || ''} />
        ${(filters || []).map((f) => html`
          <select key=${f.name} class="border rounded-lg px-2 py-1.5 text-sm" value=${query[f.name] || ''}
            onChange=${(e) => setQuery({ ...query, [f.name]: e.target.value })}>
            <option value="">${f.label}: todos</option>
            ${Object.entries(f.options).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
          </select>`)}
        ${importColumnsHint && can('import') && html`
          <button class="border rounded-lg px-3 py-1.5 text-sm" onClick=${() => setImporting(true)}>Importar CSV</button>`}
        ${can('create') && html`
          <button class="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm" onClick=${() => setEditing({})}>+ Nuevo</button>`}
      </div>

      ${data === null ? html`<${Spinner} />` : html`
        <div class="bg-white rounded-xl shadow overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-left text-xs text-slate-400 border-b">
              ${columns.map((c) => html`<th key=${c.name} class="px-4 py-2 font-medium">${c.label}</th>`)}
            </tr></thead>
            <tbody>
              ${data.length === 0 && html`<tr><td colSpan=${columns.length} class="px-4 py-6 text-center text-slate-400">Sin resultados</td></tr>`}
              ${data.map((row) => html`
                <tr key=${row.id} class="border-b last:border-0 hover:bg-indigo-50/50 cursor-pointer" onClick=${() => setSelected(row)}>
                  ${columns.map((c) => html`<td key=${c.name} class="px-4 py-2">${c.render ? c.render(row[c.name], row) : (row[c.name] ?? '—')}</td>`)}
                </tr>`)}
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between mt-3 text-sm text-slate-500">
          <div>${pagination.total ?? 0} resultados</div>
          <div class="flex gap-2">
            <button disabled=${pagination.page <= 1} class="px-2 py-1 border rounded disabled:opacity-30"
              onClick=${() => load(pagination.page - 1)}>‹</button>
            <span>Página ${pagination.page} / ${Math.max(pagination.total_pages || 1, 1)}</span>
            <button disabled=${pagination.page >= (pagination.total_pages || 1)} class="px-2 py-1 border rounded disabled:opacity-30"
              onClick=${() => load(pagination.page + 1)}>›</button>
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
        <${Drawer} title=${selected.name || selected.title || `${selected.first_name || ''} ${selected.last_name || ''}`}
          onClose=${() => setSelected(null)}
          actions=${html`
            ${extraDrawerActions && extraDrawerActions(selected, { reload: () => load(pagination.page), close: () => setSelected(null), notify })}
            ${can('update') && editable && html`<button class="text-sm px-2 py-1 border rounded-lg" onClick=${() => setEditing(selected)}>Editar</button>`}
            ${can('delete') && html`<button class="text-sm px-2 py-1 border border-red-200 text-red-600 rounded-lg" onClick=${() => remove(selected)}>Eliminar</button>`}`}>
          <${FieldGrid} row=${selected} fields=${detailFields || columns} customDefs=${customDefs} />
          ${singularEntityType(resource) && html`
            <${NotesAndActivity} entityType=${singularEntityType(resource)} entityId=${selected.id} notify=${notify} />`}
        <//>`}
    </div>`;
}

function singularEntityType(resource) {
  return { leads: 'lead', companies: 'company', contacts: 'contact', opportunities: 'opportunity', tasks: 'task' }[resource] || null;
}

// ----------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------
function Dashboard({ notify }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api('/crm/dashboard').then((r) => setData(r.data)).catch((e) => notify(e.message, 'error'));
  }, []);
  if (!data) return html`<${Spinner} />`;
  const o = data.opportunities;
  const cards = [
    { label: 'Oportunidades abiertas', value: o.open_count },
    { label: 'Valor del pipeline', value: fmtMoney(o.open_value) },
    { label: 'Valor ponderado', value: fmtMoney(o.weighted_value) },
    { label: 'Win rate (mes)', value: o.win_rate_this_month == null ? '—' : `${o.win_rate_this_month}%` },
    { label: 'Ganadas este mes', value: `${o.won_this_month} (${fmtMoney(o.won_value_this_month)})` },
    { label: 'Tareas vencidas', value: data.tasks.overdue_tasks, alert: data.tasks.overdue_tasks > 0 },
  ];
  return html`
    <div>
      <h2 class="text-lg font-semibold mb-4">Dashboard comercial</h2>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        ${cards.map((c) => html`
          <div key=${c.label} class="bg-white rounded-xl shadow p-4">
            <div class="text-xs text-slate-400">${c.label}</div>
            <div class="text-xl font-bold ${c.alert ? 'text-red-600' : ''}">${c.value}</div>
          </div>`)}
      </div>
      <div class="grid md:grid-cols-2 gap-4">
        <div class="bg-white rounded-xl shadow p-4">
          <div class="text-sm font-semibold mb-2">Leads por estado</div>
          ${data.leads_by_status.length === 0 ? html`<div class="text-sm text-slate-400">Sin leads</div>`
            : data.leads_by_status.map((l) => html`
              <div key=${l.status} class="flex justify-between text-sm py-1 border-b last:border-0">
                <${Badge} value=${l.status} map=${LEAD_STATUS} />
                <span class="font-medium">${l.count}</span>
              </div>`)}
        </div>
        <div class="bg-white rounded-xl shadow p-4">
          <div class="text-sm font-semibold mb-2">Próximos seguimientos (7 días)</div>
          ${data.upcoming_follow_ups.length === 0 ? html`<div class="text-sm text-slate-400">Nada pendiente</div>`
            : data.upcoming_follow_ups.map((l) => html`
              <div key=${l.id} class="flex justify-between text-sm py-1 border-b last:border-0">
                <span class="truncate mr-2">${l.title}</span>
                <span class="text-slate-500 whitespace-nowrap">${fmtDateTime(l.next_follow_up_at)}</span>
              </div>`)}
        </div>
      </div>
    </div>`;
}

// ----------------------------------------------------------------
// Líneas de producto de una oportunidad (presupuesto)
// ----------------------------------------------------------------
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
    <div class="mb-5">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-semibold">Líneas / presupuesto</div>
        ${editable && can('update') && html`
          <button class="text-xs px-2 py-1 rounded-lg bg-indigo-600 text-white" onClick=${() => setAdding(true)}>+ Añadir línea</button>`}
      </div>
      ${items === null ? html`<${Spinner} />` : items.length === 0
        ? html`<div class="text-sm text-slate-400">Sin líneas. El importe es manual.</div>`
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
                  <td class="py-1 text-right">
                    ${editable && can('update') && html`
                      <button class="text-red-500 text-xs" onClick=${() => removeLine(it.id)}>✕</button>`}
                  </td>
                </tr>`)}
            </tbody>
            <tfoot><tr class="border-t-2">
              <td colSpan="4" class="py-1 text-right font-semibold">Total</td>
              <td class="py-1 text-right font-bold">${fmtMoney(total)}</td><td></td>
            </tr></tfoot>
          </table>`}
      ${adding && html`
        <${FormModal} title="Añadir línea" fields=${itemFields}
          onSave=${addLine} onClose=${() => setAdding(false)} />`}
    </div>`;
}

// ----------------------------------------------------------------
// Kanban del pipeline
// ----------------------------------------------------------------
function Pipeline({ notify, users, products, customDefs }) {
  const [pipeline, setPipeline] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    api('/crm/pipeline').then((r) => setPipeline(r.data)).catch((e) => notify(e.message, 'error'));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function moveStage(opp, stageId) {
    try {
      await api(`/crm/opportunities/${opp.id}`, { method: 'PATCH', body: { stage_id: stageId } });
      load();
    } catch (err) { notify(err.message, 'error'); }
  }

  async function close(opp, status) {
    let lost_reason = null;
    if (status === 'lost') {
      lost_reason = window.prompt('Motivo de pérdida (obligatorio):');
      if (!lost_reason) return;
    } else if (!window.confirm('¿Marcar como GANADA?')) return;
    try {
      await api(`/crm/opportunities/${opp.id}/close`, { method: 'POST', body: { status, ...(lost_reason ? { lost_reason } : {}) } });
      notify(status === 'won' ? 'Oportunidad ganada 🎉' : 'Oportunidad perdida');
      load();
    } catch (err) { notify(err.message, 'error'); }
  }

  if (!pipeline) return html`<${Spinner} />`;
  const openStages = pipeline.stages.filter((s) => !s.is_won && !s.is_lost);

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

  return html`
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">Pipeline</h2>
        ${can('create') && html`
          <button class="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm" onClick=${() => setCreating(true)}>+ Nueva oportunidad</button>`}
      </div>
      <div class="flex gap-3 overflow-x-auto pb-4">
        ${pipeline.stages.map((stage) => html`
          <div key=${stage.id} class="w-64 shrink-0 bg-slate-50 rounded-xl border">
            <div class="px-3 py-2 border-b flex items-center justify-between">
              <span class="text-sm font-semibold" style=${{ color: stage.color || undefined }}>${stage.name}</span>
              <span class="text-xs text-slate-400">${stage.opportunities.length}</span>
            </div>
            <div class="p-2 space-y-2 min-h-16">
              ${stage.opportunities.map((opp) => html`
                <div key=${opp.id} class="bg-white rounded-lg shadow-sm border p-2 cursor-pointer hover:border-indigo-300"
                  onClick=${() => setSelected(opp)}>
                  <div class="text-sm font-medium truncate">${opp.title}</div>
                  <div class="text-xs text-slate-500">${opp.company_name || ''}</div>
                  <div class="flex items-center justify-between mt-1">
                    <span class="text-sm font-semibold">${fmtMoney(opp.amount)}</span>
                    <${Badge} value=${opp.priority} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />
                  </div>
                  ${can('update') && html`
                    <div class="mt-2 flex gap-1" onClick=${(e) => e.stopPropagation()}>
                      <select class="flex-1 text-xs border rounded px-1 py-0.5" value=${stage.id}
                        onChange=${(e) => moveStage(opp, e.target.value)}>
                        ${openStages.map((s) => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}
                      </select>
                      ${can('close') && html`
                        <button title="Ganada" class="text-emerald-600 border border-emerald-200 rounded px-1.5 text-xs" onClick=${() => close(opp, 'won')}>✓</button>
                        <button title="Perdida" class="text-red-500 border border-red-200 rounded px-1.5 text-xs" onClick=${() => close(opp, 'lost')}>✗</button>`}
                    </div>`}
                </div>`)}
            </div>
          </div>`)}
      </div>

      ${creating && html`
        <${FormModal} title="Nueva oportunidad" fields=${oppFormFields} customDefs=${customDefs.opportunity || []}
          onSave=${async (payload) => { await api('/crm/opportunities', { method: 'POST', body: payload }); notify('Oportunidad creada'); load(); }}
          onClose=${() => setCreating(false)} />`}

      ${selected && html`
        <${Drawer} title=${selected.title} onClose=${() => setSelected(null)}>
          <${FieldGrid} row=${selected} fields=${[
            { name: 'amount', label: 'Importe', render: fmtMoney },
            { name: 'probability', label: 'Probabilidad', render: (v) => v == null ? '—' : `${v}%` },
            { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
            { name: 'owner_name', label: 'Responsable' },
            { name: 'company_name', label: 'Empresa' },
            { name: 'expected_close_date', label: 'Cierre previsto', render: fmtDate },
            { name: 'next_follow_up_at', label: 'Próximo seguimiento', render: fmtDateTime },
          ]} />
          <${OpportunityItems} opportunityId=${selected.id} products=${products} editable=${true}
            notify=${notify} onTotal=${() => load()} />
          <${NotesAndActivity} entityType="opportunity" entityId=${selected.id} notify=${notify} />
        <//>`}
    </div>`;
}

// ----------------------------------------------------------------
// Panel de administración (usuarios, productos, campos, marca)
// ----------------------------------------------------------------
function AdminUsers({ notify }) {
  const [users, setUsers] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api('/crm/admin/users').then((r) => setUsers(r.data)).catch((e) => notify(e.message, 'error'));
  }, []);
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
    if (editing?.id) {
      await api(`/crm/admin/users/${editing.id}`, { method: 'PATCH', body: payload });
      notify('Usuario actualizado');
    } else {
      await api('/crm/admin/users', { method: 'POST', body: payload });
      notify('Usuario creado');
    }
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
          <thead><tr class="text-left text-xs text-slate-400 border-b">
            <th class="px-4 py-2">Nombre</th><th class="px-4 py-2">Email</th>
            <th class="px-4 py-2">Rol</th><th class="px-4 py-2">Estado</th><th class="px-4 py-2"></th>
          </tr></thead>
          <tbody>
            ${users.map((u) => html`
              <tr key=${u.id} class="border-b last:border-0">
                <td class="px-4 py-2">${u.name}</td>
                <td class="px-4 py-2">${u.email}</td>
                <td class="px-4 py-2"><${Badge} value=${u.role} map=${ROLES} /></td>
                <td class="px-4 py-2">${u.is_active ? 'Activo' : html`<span class="text-red-600">Desactivado</span>`}</td>
                <td class="px-4 py-2 text-right">
                  ${u.id !== getSession()?.user?.id && html`
                    <button class="text-xs border rounded px-2 py-1" onClick=${() => setEditing(u)}>Editar</button>`}
                </td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      ${editing !== null && html`
        <${FormModal} title=${editing.id ? 'Editar usuario' : 'Invitar usuario'}
          fields=${editing.id ? editFields : createFields} initial=${editing.id ? editing : null}
          onSave=${save} onClose=${() => setEditing(null)} />`}
    </div>`;
}

function AdminBranding({ notify, onBrandChange }) {
  const [settings, setSettings] = useState(null);
  useEffect(() => {
    api('/crm/settings').then((r) => setSettings(r.data)).catch((e) => notify(e.message, 'error'));
  }, []);
  if (!settings) return html`<${Spinner} />`;

  async function save(e) {
    e.preventDefault();
    try {
      const res = await api('/crm/settings', {
        method: 'PATCH',
        body: {
          brand_name: settings.brand_name || null,
          brand_color: settings.brand_color || null,
        },
      });
      notify('Marca actualizada');
      onBrandChange(res.data);
    } catch (err) { notify(err.message, 'error'); }
  }

  return html`
    <form onSubmit=${save} class="bg-white rounded-xl shadow p-4 max-w-md space-y-3">
      <div class="text-sm font-semibold">Marca de tu CRM</div>
      <label class="block">
        <span class="text-xs text-slate-600">Nombre visible (cabecera)</span>
        <input class="w-full border rounded-lg px-3 py-2 mt-1" maxLength="60"
          value=${settings.brand_name || ''} onInput=${(e) => setSettings({ ...settings, brand_name: e.target.value })} />
      </label>
      <label class="block">
        <span class="text-xs text-slate-600">Color de marca</span>
        <input type="color" class="block mt-1 h-9 w-16 border rounded"
          value=${settings.brand_color || '#4f46e5'} onInput=${(e) => setSettings({ ...settings, brand_color: e.target.value })} />
      </label>
      <button class="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm">Guardar</button>
    </form>`;
}

function Admin({ notify, productsView, customFieldsView, onBrandChange }) {
  const [section, setSection] = useState('users');
  const sections = [
    ['users', 'Usuarios'], ['products', 'Productos'], ['fields', 'Campos personalizados'], ['brand', 'Marca'],
  ];
  return html`
    <div>
      <h2 class="text-lg font-semibold mb-4">Administración</h2>
      <div class="flex gap-1 mb-4">
        ${sections.map(([id, label]) => html`
          <button key=${id} onClick=${() => setSection(id)}
            class="px-3 py-1.5 rounded-lg text-sm ${section === id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-200'}">
            ${label}
          </button>`)}
      </div>
      ${section === 'users' && html`<${AdminUsers} notify=${notify} />`}
      ${section === 'products' && html`<${TableView} key="products" ...${productsView} notify=${notify} />`}
      ${section === 'fields' && html`<${TableView} key="fields" ...${customFieldsView} notify=${notify} />`}
      ${section === 'brand' && html`<${AdminBranding} notify=${notify} onBrandChange=${onBrandChange} />`}
    </div>`;
}

// ----------------------------------------------------------------
// Definiciones de vistas de tabla
// ----------------------------------------------------------------
function leadViews(users, products, notify) {
  const productMap = Object.fromEntries(products.map((p) => [p.id, p.name]));
  return {
    title: 'Leads', singular: 'Lead', resource: 'leads',
    importColumnsHint: 'title, status, source, priority, main_pain, estimated_value, next_step',
    columns: [
      { name: 'title', label: 'Lead' },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${LEAD_STATUS} />` },
      { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
      { name: 'source', label: 'Fuente', render: (v) => SOURCE[v] || v },
      { name: 'product_id', label: 'Producto', render: (v) => productMap[v] || '—' },
      { name: 'estimated_value', label: 'Valor est.', render: fmtMoney },
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
      { name: 'owner_user_id', label: 'Responsable', type: 'select', options: Object.fromEntries(users.map((u) => [u.id, u.name])) },
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
      { name: 'main_pain', label: 'Dolor principal' },
      { name: 'next_step', label: 'Próximo paso' },
      { name: 'next_follow_up_at', label: 'Próximo seguimiento', render: fmtDateTime },
      { name: 'lost_reason', label: 'Motivo de pérdida' },
      { name: 'created_at', label: 'Creado', render: fmtDateTime },
    ],
    extraDrawerActions: (row, { reload, close }) =>
      can('close') && row.status !== 'converted' && row.status !== 'lost' && html`
        <button class="text-sm px-2 py-1 rounded-lg bg-emerald-600 text-white"
          onClick=${async () => {
            if (!window.confirm('¿Convertir este lead en oportunidad?')) return;
            try {
              await api(`/crm/leads/${row.id}/convert`, { method: 'POST', body: {} });
              notify('Lead convertido en oportunidad');
              close(); reload();
            } catch (err) { notify(err.message, 'error'); }
          }}>Convertir</button>`,
  };
}

function companyViews(users) {
  return {
    title: 'Empresas', singular: 'Empresa', resource: 'companies',
    importColumnsHint: 'name, legal_name, tax_id, industry, email, phone, city, province, postal_code',
    columns: [
      { name: 'name', label: 'Empresa' },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${COMPANY_STATUS} />` },
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
      { name: 'owner_user_id', label: 'Responsable', type: 'select', options: Object.fromEntries(users.map((u) => [u.id, u.name])) },
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
      { name: 'created_at', label: 'Creada', render: fmtDateTime },
    ],
  };
}

function contactViews(users, notify) {
  return {
    title: 'Contactos', singular: 'Contacto', resource: 'contacts',
    importColumnsHint: 'first_name, last_name, email, phone, job_title',
    columns: [
      { name: 'first_name', label: 'Nombre', render: (v, r) => `${v} ${r.last_name || ''}` },
      { name: 'email', label: 'Email' },
      { name: 'phone', label: 'Teléfono' },
      { name: 'job_title', label: 'Cargo' },
      { name: 'consent_status', label: 'Consentimiento', render: (v) => ({ not_requested: '—', requested: 'Solicitado', granted: 'Concedido', revoked: 'Revocado' })[v] || v },
    ],
    filters: [],
    formFields: [
      { name: 'first_name', label: 'Nombre', required: true, max: 100 },
      { name: 'last_name', label: 'Apellidos', max: 150 },
      { name: 'email', label: 'Email', type: 'email', max: 254 },
      { name: 'phone', label: 'Teléfono', max: 30 },
      { name: 'job_title', label: 'Cargo', max: 120 },
      { name: 'owner_user_id', label: 'Responsable', type: 'select', options: Object.fromEntries(users.map((u) => [u.id, u.name])) },
      { name: 'legal_basis', label: 'Base jurídica (RGPD)', type: 'select', options: { legitimate_interest: 'Interés legítimo', contract: 'Relación contractual', consent: 'Consentimiento', legal_obligation: 'Obligación legal' } },
      { name: 'consent_status', label: 'Consentimiento', type: 'select', options: { not_requested: 'No solicitado', requested: 'Solicitado', granted: 'Concedido', revoked: 'Revocado' } },
    ],
    detailFields: [
      { name: 'email', label: 'Email' },
      { name: 'phone', label: 'Teléfono' },
      { name: 'job_title', label: 'Cargo' },
      { name: 'legal_basis', label: 'Base jurídica' },
      { name: 'consent_status', label: 'Consentimiento' },
      { name: 'created_at', label: 'Creado', render: fmtDateTime },
    ],
    extraDrawerActions: (row, { reload, close }) => html`
      ${can('export') && html`
        <button class="text-sm px-2 py-1 border rounded-lg"
          onClick=${async () => {
            try {
              const res = await api(`/crm/contacts/${row.id}/export`);
              const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `contacto-${row.id}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            } catch (err) { notify(err.message, 'error'); }
          }}>Exportar (RGPD)</button>`}
      ${can('gdpr') && !row.anonymized_at && html`
        <button class="text-sm px-2 py-1 border border-red-200 text-red-600 rounded-lg"
          onClick=${async () => {
            if (!window.confirm('Anonimizar borra de forma IRREVERSIBLE los datos personales y las notas del contacto. ¿Continuar?')) return;
            try {
              await api(`/crm/contacts/${row.id}/anonymize`, { method: 'POST' });
              notify('Contacto anonimizado');
              close(); reload();
            } catch (err) { notify(err.message, 'error'); }
          }}>Anonimizar</button>`}`,
  };
}

function taskViews(users) {
  return {
    title: 'Tareas comerciales', singular: 'Tarea', resource: 'tasks',
    columns: [
      { name: 'title', label: 'Tarea' },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${TASK_STATUS} />` },
      { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
      { name: 'due_at', label: 'Vence', render: (v) => v && new Date(v) < new Date() ? html`<span class="text-red-600">${fmtDateTime(v)}</span>` : fmtDateTime(v) },
    ],
    filters: [
      { name: 'status', label: 'Estado', options: TASK_STATUS },
      { name: 'priority', label: 'Prioridad', options: PRIORITY },
    ],
    formFields: [
      { name: 'title', label: 'Título', required: true, max: 200 },
      { name: 'description', label: 'Descripción', type: 'textarea', max: 2000 },
      { name: 'status', label: 'Estado', type: 'select', options: TASK_STATUS },
      { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITY },
      { name: 'assigned_to', label: 'Asignada a', type: 'select', options: Object.fromEntries(users.map((u) => [u.id, u.name])) },
      { name: 'due_at', label: 'Vencimiento', type: 'datetime' },
    ],
    detailFields: [
      { name: 'description', label: 'Descripción' },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${TASK_STATUS} />` },
      { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
      { name: 'due_at', label: 'Vence', render: fmtDateTime },
      { name: 'created_at', label: 'Creada', render: fmtDateTime },
    ],
  };
}

function productsAdminView() {
  return {
    title: 'Catálogo de productos/servicios', singular: 'Producto', resource: 'products',
    columns: [
      { name: 'name', label: 'Producto' },
      { name: 'description', label: 'Descripción' },
      { name: 'price', label: 'Precio', render: fmtMoney },
      { name: 'is_active', label: 'Activo', render: (v) => v ? 'Sí' : 'No' },
    ],
    filters: [],
    formFields: [
      { name: 'name', label: 'Nombre', required: true, max: 120 },
      { name: 'description', label: 'Descripción', type: 'textarea', max: 500 },
      { name: 'price', label: 'Precio (€)', type: 'number' },
      { name: 'is_active', label: 'Activo', type: 'checkbox' },
    ],
  };
}

function customFieldsAdminView() {
  return {
    title: 'Campos personalizados', singular: 'Campo', resource: 'custom-fields',
    columns: [
      { name: 'label', label: 'Etiqueta' },
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
    // La API espera options como array; los campos no se editan (crear/borrar)
    editable: false,
    transformPayload: (payload) => {
      const { options_csv, ...rest } = payload;
      if (options_csv) rest.options = String(options_csv).split(',').map((s) => s.trim()).filter(Boolean);
      return rest;
    },
  };
}

// ----------------------------------------------------------------
// Forecast de ventas por mes (bruto, ponderado y ganado)
// ----------------------------------------------------------------
function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
}

function Forecast({ notify, users }) {
  const [data, setData] = useState(null);
  const [owner, setOwner] = useState('');

  const load = useCallback(() => {
    api('/crm/forecast', { query: { months: 6, owner_user_id: owner || undefined } })
      .then((r) => setData(r.data)).catch((e) => notify(e.message, 'error'));
  }, [owner]);
  useEffect(() => { load(); }, [load]);

  if (!data) return html`<${Spinner} />`;

  const wonByMonth = Object.fromEntries(data.won_by_month.map((r) => [r.month, r]));
  const months = [...new Set([...data.open_by_month.map((r) => r.month), ...data.won_by_month.map((r) => r.month)])].sort();
  const maxVal = Math.max(1, ...data.open_by_month.map((r) => Number(r.open_value)), ...data.won_by_month.map((r) => Number(r.won_value)));
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
        <div class="bg-white rounded-xl shadow p-4">
          <div class="text-xs text-slate-400">Pipeline próximos 6 meses</div>
          <div class="text-xl font-bold">${fmtMoney(totalOpen)}</div>
        </div>
        <div class="bg-white rounded-xl shadow p-4">
          <div class="text-xs text-slate-400">Forecast ponderado</div>
          <div class="text-xl font-bold text-indigo-600">${fmtMoney(totalWeighted)}</div>
        </div>
        <div class="bg-white rounded-xl shadow p-4">
          <div class="text-xs text-slate-400">Sin fecha de cierre</div>
          <div class="text-xl font-bold">${fmtMoney(data.open_without_date.open_value)}
            <span class="text-xs text-slate-400">(${data.open_without_date.count})</span></div>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow p-4">
        <div class="text-sm font-semibold mb-3">Por mes de cierre previsto</div>
        ${months.length === 0 ? html`<div class="text-sm text-slate-400">No hay oportunidades con fecha de cierre en el periodo.</div>`
          : html`
            <div class="space-y-3">
              ${data.open_by_month.map((r) => html`
                <div key=${r.month}>
                  <div class="flex justify-between text-sm mb-1">
                    <span class="font-medium">${monthLabel(r.month)} <span class="text-slate-400">(${r.count})</span></span>
                    <span>${fmtMoney(r.open_value)} · <span class="text-indigo-600">pond. ${fmtMoney(r.weighted_value)}</span></span>
                  </div>
                  <div class="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div class="h-full bg-indigo-200" style=${{ width: `${Number(r.open_value) / maxVal * 100}%` }}>
                      <div class="h-full bg-indigo-600" style=${{ width: `${Number(r.weighted_value) / Math.max(Number(r.open_value), 1) * 100}%` }}></div>
                    </div>
                  </div>
                  ${wonByMonth[r.month] && html`
                    <div class="text-xs text-emerald-600 mt-0.5">Ganado: ${fmtMoney(wonByMonth[r.month].won_value)} (${wonByMonth[r.month].count})</div>`}
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

// ----------------------------------------------------------------
// Shell principal
// ----------------------------------------------------------------
function App() {
  const [session, setSessionState] = useState(getSession());
  const [tab, setTab] = useState('dashboard');
  const [toast, setToast] = useState(null);
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [customDefs, setCustomDefs] = useState({});

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadCatalogs = useCallback(() => {
    api('/crm/users').then((r) => setUsers(r.data)).catch(() => {});
    api('/crm/products', { query: { page_size: 100 } }).then((r) => setProducts(r.data)).catch(() => {});
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
    setSession(updated);
    setSessionState(updated);
  }

  const tabs = [
    ['dashboard', 'Dashboard'], ['pipeline', 'Pipeline'], ['forecast', 'Forecast'], ['leads', 'Leads'],
    ['companies', 'Empresas'], ['contacts', 'Contactos'], ['tasks', 'Tareas'],
    ...(can('admin') ? [['admin', 'Administración']] : []),
  ];

  const views = {
    leads: { ...leadViews(users, products, notify), customDefs: customDefs.lead || [] },
    companies: { ...companyViews(users), customDefs: customDefs.company || [] },
    contacts: { ...contactViews(users, notify), customDefs: customDefs.contact || [] },
    tasks: taskViews(users),
  };

  if (!can('read')) {
    return html`
      <div class="min-h-screen flex items-center justify-center">
        <div class="bg-white rounded-2xl shadow p-8 text-center space-y-3">
          <div class="font-semibold">Tu rol no tiene acceso al CRM</div>
          <button class="text-sm text-indigo-600 hover:underline" onClick=${() => { setSession(null); setSessionState(null); }}>Salir</button>
        </div>
      </div>`;
  }

  return html`
    <div class="min-h-screen">
      <header class="bg-white border-b sticky top-0 z-20" style=${{ borderTopWidth: '3px', borderTopColor: brandColor }}>
        <div class="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
          <div class="font-bold truncate max-w-48" style=${{ color: brandColor }}>${brandName}</div>
          <nav class="flex gap-1 overflow-x-auto">
            ${tabs.map(([id, label]) => html`
              <button key=${id} onClick=${() => { setTab(id); if (id !== 'admin') loadCatalogs(); }}
                class="px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${tab === id ? 'text-white' : 'text-slate-600 hover:bg-slate-100'}"
                style=${tab === id ? { backgroundColor: brandColor } : {}}>
                ${label}
              </button>`)}
          </nav>
          <div class="ml-auto flex items-center gap-3 text-sm">
            <span class="text-slate-500 whitespace-nowrap">${session.user.name} · ${ROLES[session.user.role] || session.user.role}</span>
            <button class="text-slate-400 hover:text-red-600" onClick=${() => { setSession(null); setSessionState(null); }}>Salir</button>
          </div>
        </div>
      </header>
      <main class="max-w-7xl mx-auto px-4 py-6">
        ${tab === 'dashboard' && html`<${Dashboard} notify=${notify} />`}
        ${tab === 'pipeline' && html`<${Pipeline} notify=${notify} users=${users} products=${products} customDefs=${customDefs} />`}
        ${tab === 'forecast' && html`<${Forecast} notify=${notify} users=${users} />`}
        ${tab === 'admin' && html`
          <${Admin} notify=${notify} onBrandChange=${onBrandChange}
            productsView=${productsAdminView()} customFieldsView=${customFieldsAdminView()} />`}
        ${views[tab] && html`<${TableView} key=${tab} ...${views[tab]} notify=${notify} />`}
      </main>
      <${Toast} toast=${toast} />
    </div>`;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);

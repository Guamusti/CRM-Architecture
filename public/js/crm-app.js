'use strict';
/* Zyra CRM — frontend sin build (React UMD + htm, compatible con CSP).
   REGLA: aquí no hay lógica de seguridad. Los permisos solo ocultan
   controles como mejora de UX; el backend decide siempre. */

const { useState, useEffect, useCallback } = React;
const html = htm.bind(React.createElement);

// ----------------------------------------------------------------
// API
// ----------------------------------------------------------------
function getSession() {
  try { return JSON.parse(sessionStorage.getItem('zyra_crm_session')) || null; }
  catch { return null; }
}
function setSession(s) {
  if (s) sessionStorage.setItem('zyra_crm_session', JSON.stringify(s));
  else sessionStorage.removeItem('zyra_crm_session');
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
const PRODUCT = { tpv: 'TPV', erp: 'ERP', inventario: 'Inventario', fichajes: 'Fichajes', tareas: 'Tareas', crm: 'CRM', suite: 'Suite completa' };
const COMPANY_STATUS = { prospect: 'Prospecto', active: 'Activa', customer: 'Cliente', inactive: 'Inactiva', former_customer: 'Ex-cliente' };
const TASK_STATUS = { pending: 'Pendiente', in_progress: 'En curso', done: 'Hecha', cancelled: 'Cancelada' };

const ROLE_PERMS = {
  owner: ['read', 'create', 'update', 'delete', 'assign', 'close', 'pipeline', 'export', 'gdpr'],
  admin: ['read', 'create', 'update', 'delete', 'assign', 'close', 'pipeline', 'export', 'gdpr'],
  manager: ['read', 'create', 'update', 'assign', 'close', 'export'],
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
  return html`<div class="fixed bottom-4 right-4 z-50 ${color} text-white px-4 py-2 rounded-lg shadow-lg text-sm">${toast.msg}</div>`;
}

function Spinner() {
  return html`<div class="p-8 text-center text-slate-400">Cargando…</div>`;
}

// ----------------------------------------------------------------
// Login
// ----------------------------------------------------------------
function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api('/auth/login', { method: 'POST', body: { email, password } });
      setSession(res.data);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return html`
    <div class="min-h-screen flex items-center justify-center">
      <form onSubmit=${submit} class="bg-white rounded-2xl shadow-xl p-8 w-96 space-y-4">
        <div class="text-center">
          <div class="text-2xl font-bold text-indigo-600">Zyra CRM</div>
          <div class="text-sm text-slate-500">Accede con tu cuenta</div>
        </div>
        ${error && html`<div class="bg-red-50 text-red-700 text-sm rounded-lg p-2">${error}</div>`}
        <input class="w-full border rounded-lg px-3 py-2" type="email" placeholder="Email" required
          value=${email} onInput=${(e) => setEmail(e.target.value)} />
        <input class="w-full border rounded-lg px-3 py-2" type="password" placeholder="Contraseña" required minLength="8"
          value=${password} onInput=${(e) => setPassword(e.target.value)} />
        <button disabled=${busy} class="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 font-medium disabled:opacity-50">
          ${busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>`;
}

// ----------------------------------------------------------------
// Formulario genérico (modal)
// ----------------------------------------------------------------
function FormModal({ title, fields, initial, onSave, onClose }) {
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
    return out;
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await onSave(serialize()); onClose(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
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
              </select>` : f.type === 'textarea' ? html`
              <textarea class="w-full border rounded-lg px-3 py-2 mt-1" rows="3" maxLength=${f.max || 500}
                value=${values[f.name]} onInput=${(e) => setValues({ ...values, [f.name]: e.target.value })}></textarea>` : html`
              <input class="w-full border rounded-lg px-3 py-2 mt-1" required=${!!f.required}
                type=${f.type === 'datetime' ? 'datetime-local' : f.type || 'text'}
                maxLength=${f.max || 200} step=${f.type === 'number' ? '0.01' : undefined}
                value=${values[f.name]} onInput=${(e) => setValues({ ...values, [f.name]: e.target.value })} />`}
          </label>`)}
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
        <div class="sticky top-0 bg-white border-b px-5 py-3 flex items-center justify-between">
          <div class="font-semibold truncate">${title}</div>
          <div class="flex gap-2 items-center">
            ${actions}
            <button class="text-slate-400 hover:text-slate-700 text-xl leading-none" onClick=${onClose}>×</button>
          </div>
        </div>
        <div class="p-5">${children}</div>
      </div>
    </div>`;
}

function FieldGrid({ row, fields }) {
  return html`
    <div class="grid grid-cols-2 gap-x-4 gap-y-2 mb-5">
      ${fields.map((f) => html`
        <div key=${f.name}>
          <div class="text-xs text-slate-400">${f.label}</div>
          <div class="text-sm">${f.render ? f.render(row[f.name], row) : (row[f.name] ?? '—')}</div>
        </div>`)}
    </div>`;
}

// ----------------------------------------------------------------
// Vista de tabla genérica con filtros y paginación
// ----------------------------------------------------------------
function TableView({ resource, columns, filters, formFields, detailFields, title, singular, notify, extraDrawerActions, onCreatedExtra }) {
  const [data, setData] = useState(null);
  const [pagination, setPagination] = useState({ page: 1 });
  const [query, setQuery] = useState({});
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (nuevo) | row

  const load = useCallback(async (page = 1) => {
    try {
      const res = await api(`/crm/${resource}`, { query: { ...query, page, page_size: 25 } });
      setData(res.data); setPagination(res.pagination);
    } catch (err) { notify(err.message, 'error'); }
  }, [resource, query]);

  useEffect(() => { load(1); }, [load]);

  async function save(payload) {
    if (editing?.id) {
      const res = await api(`/crm/${resource}/${editing.id}`, { method: 'PATCH', body: payload });
      notify(`${singular} actualizado`);
      if (selected?.id === editing.id) setSelected(res.data);
    } else {
      await api(`/crm/${resource}`, { method: 'POST', body: payload });
      notify(`${singular} creado`);
      if (onCreatedExtra) onCreatedExtra();
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
        <input class="border rounded-lg px-3 py-1.5 text-sm w-48" placeholder="Buscar…" maxLength="100"
          onInput=${(e) => setQuery({ ...query, search: e.target.value })} value=${query.search || ''} />
        ${(filters || []).map((f) => html`
          <select key=${f.name} class="border rounded-lg px-2 py-1.5 text-sm" value=${query[f.name] || ''}
            onChange=${(e) => setQuery({ ...query, [f.name]: e.target.value })}>
            <option value="">${f.label}: todos</option>
            ${Object.entries(f.options).map(([k, v]) => html`<option key=${k} value=${k}>${v}</option>`)}
          </select>`)}
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
          fields=${formFields} initial=${editing.id ? editing : null}
          onSave=${save} onClose=${() => setEditing(null)} />`}

      ${selected && html`
        <${Drawer} title=${selected.name || selected.title || `${selected.first_name || ''} ${selected.last_name || ''}`}
          onClose=${() => setSelected(null)}
          actions=${html`
            ${extraDrawerActions && extraDrawerActions(selected, { reload: () => load(pagination.page), close: () => setSelected(null), notify })}
            ${can('update') && html`<button class="text-sm px-2 py-1 border rounded-lg" onClick=${() => setEditing(selected)}>Editar</button>`}
            ${can('delete') && html`<button class="text-sm px-2 py-1 border border-red-200 text-red-600 rounded-lg" onClick=${() => remove(selected)}>Eliminar</button>`}`}>
          <${FieldGrid} row=${selected} fields=${detailFields || columns} />
          <${NotesAndActivity} entityType=${singularEntityType(resource)} entityId=${selected.id} notify=${notify} />
        <//>`}
    </div>`;
}

function singularEntityType(resource) {
  return { leads: 'lead', companies: 'company', contacts: 'contact', opportunities: 'opportunity', tasks: 'task' }[resource];
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
// Kanban del pipeline
// ----------------------------------------------------------------
function Pipeline({ notify, users }) {
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
    { name: 'zyra_product', label: 'Producto Zyra', type: 'select', options: PRODUCT },
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
            <div class="px-3 py-2 border-b flex items-center justify-between" style=${{ borderTopColor: stage.color }}>
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
        <${FormModal} title="Nueva oportunidad" fields=${oppFormFields}
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
          <${NotesAndActivity} entityType="opportunity" entityId=${selected.id} notify=${notify} />
        <//>`}
    </div>`;
}

// ----------------------------------------------------------------
// Definiciones de vistas de tabla
// ----------------------------------------------------------------
function leadViews(users, notify) {
  const ownerOptions = Object.fromEntries(users.map((u) => [u.id, u.name]));
  return {
    title: 'Leads', singular: 'Lead', resource: 'leads',
    columns: [
      { name: 'title', label: 'Lead' },
      { name: 'status', label: 'Estado', render: (v) => html`<${Badge} value=${v} map=${LEAD_STATUS} />` },
      { name: 'priority', label: 'Prioridad', render: (v) => html`<${Badge} value=${v} map=${PRIORITY} colorMap=${PRIORITY_COLOR} />` },
      { name: 'source', label: 'Fuente', render: (v) => SOURCE[v] || v },
      { name: 'zyra_product', label: 'Producto', render: (v) => PRODUCT[v] || '—' },
      { name: 'estimated_value', label: 'Valor est.', render: fmtMoney },
      { name: 'next_follow_up_at', label: 'Seguimiento', render: fmtDateTime },
    ],
    filters: [
      { name: 'status', label: 'Estado', options: LEAD_STATUS },
      { name: 'priority', label: 'Prioridad', options: PRIORITY },
      { name: 'source', label: 'Fuente', options: SOURCE },
      { name: 'zyra_product', label: 'Producto', options: PRODUCT },
    ],
    formFields: [
      { name: 'title', label: 'Título', required: true, max: 200 },
      { name: 'status', label: 'Estado', type: 'select', options: LEAD_STATUS },
      { name: 'priority', label: 'Prioridad', type: 'select', options: PRIORITY },
      { name: 'source', label: 'Fuente', type: 'select', options: SOURCE },
      { name: 'zyra_product', label: 'Producto Zyra', type: 'select', options: PRODUCT },
      { name: 'owner_user_id', label: 'Responsable', type: 'select', options: ownerOptions },
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
      { name: 'zyra_product', label: 'Producto', render: (v) => PRODUCT[v] || '—' },
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
  const ownerOptions = Object.fromEntries(users.map((u) => [u.id, u.name]));
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
      { name: 'assigned_to', label: 'Asignada a', type: 'select', options: ownerOptions },
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

// ----------------------------------------------------------------
// Shell principal
// ----------------------------------------------------------------
const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'leads', label: 'Leads' },
  { id: 'companies', label: 'Empresas' },
  { id: 'contacts', label: 'Contactos' },
  { id: 'tasks', label: 'Tareas' },
];

function App() {
  const [session, setSessionState] = useState(getSession());
  const [tab, setTab] = useState('dashboard');
  const [toast, setToast] = useState(null);
  const [users, setUsers] = useState([]);

  const notify = useCallback((msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (session) api('/crm/users').then((r) => setUsers(r.data)).catch(() => {});
  }, [session]);

  if (!session) return html`<${Login} onLogin=${() => setSessionState(getSession())} />`;

  const views = {
    leads: leadViews(users, notify),
    companies: companyViews(users),
    contacts: contactViews(users, notify),
    tasks: taskViews(users),
  };

  return html`
    <div class="min-h-screen">
      <header class="bg-white border-b sticky top-0 z-20">
        <div class="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
          <div class="font-bold text-indigo-600">Zyra <span class="text-slate-700 font-medium">CRM</span></div>
          <nav class="flex gap-1 overflow-x-auto">
            ${TABS.map((t) => html`
              <button key=${t.id} onClick=${() => setTab(t.id)}
                class="px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}">
                ${t.label}
              </button>`)}
          </nav>
          <div class="ml-auto flex items-center gap-3 text-sm">
            <span class="text-slate-500">${session.user.name} · ${session.user.role}</span>
            <button class="text-slate-400 hover:text-red-600" onClick=${() => { setSession(null); setSessionState(null); }}>Salir</button>
          </div>
        </div>
      </header>
      <main class="max-w-7xl mx-auto px-4 py-6">
        ${tab === 'dashboard' && html`<${Dashboard} notify=${notify} />`}
        ${tab === 'pipeline' && html`<${Pipeline} notify=${notify} users=${users} />`}
        ${views[tab] && html`<${TableView} key=${tab} ...${views[tab]} notify=${notify} />`}
      </main>
      <${Toast} toast=${toast} />
    </div>`;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);

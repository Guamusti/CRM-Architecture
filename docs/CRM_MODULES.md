# Módulos CRM — estado actual vs. pendiente (referencia Salesforce/Pipedrive)

Inventario funcional del producto desde la óptica del frontend. Para la visión
de negocio y el mapa vs Salesforce ver `docs/PRODUCT.md`.

## Estado por módulo

| Módulo | Estado | Endpoints usados (backend existente) |
|---|---|---|
| Dashboard ejecutivo | ✅ Implementado | `GET /crm/dashboard`, `GET /crm/pipeline`, `GET /crm/tasks` |
| Pipeline Kanban (DnD) | ✅ Implementado | `GET /crm/pipeline`, `PATCH /crm/opportunities/:id`, `POST /crm/opportunities/:id/close` |
| Forecast | ✅ Implementado | `GET /crm/forecast` |
| Leads | ✅ Implementado | `GET/POST/PATCH/DELETE /crm/leads`, `POST /crm/leads/:id/convert` |
| Cuentas (empresas) | ✅ Implementado | `GET/POST/PATCH/DELETE /crm/companies` |
| Contactos | ✅ Implementado | `…/contacts`, `GET /crm/contacts/:id/export`, `POST /crm/contacts/:id/anonymize` |
| Oportunidades (tabla) | ✅ Implementado | `…/opportunities`, `…/opportunities/:id/items` |
| Tareas | ✅ Implementado | `GET/POST/PATCH/DELETE /crm/tasks` |
| Productos (catálogo) | ✅ Implementado | `…/products` (escritura: rol `admin`) |
| Notas + timeline | ✅ Implementado | `GET/POST /crm/notes`, `GET /crm/activities` |
| Etiquetas (tags) | ✅ Implementado | `GET/POST /crm/tags`, `POST /crm/tags/assign|unassign` |
| Campos personalizados | ✅ Implementado | `…/custom-fields` |
| Usuarios y roles | ✅ Implementado | `GET/POST/PATCH /crm/admin/users` |
| Branding (white-label) | ✅ Implementado | `GET/PATCH /crm/settings` |
| Importación CSV | ✅ Implementado | `POST /crm/import/:resource` |
| Búsqueda global | ✅ Implementado | `GET /crm/{leads,companies,contacts,opportunities}?search=` |
| Automatizaciones | 🟠 Pantalla preview | — (ver API pendiente) |
| Email / Calendario | 🟠 Pantalla preview | — (ver API pendiente) |
| Facturación / planes | 🟠 Pantalla preview | — (ver API pendiente) |
| Seguridad / MFA | 🟠 Pantalla preview | — (ver API pendiente) |

Las pantallas 🟠 muestran una previsualización marcada como "Pendiente de
backend"; **no simulan datos** ni hacen llamadas. Se activarán cuando exista el
endpoint correspondiente.

## Mejoras de frontend incorporadas en esta iteración

- Navegación lateral por módulos (antes pestañas superiores).
- Dashboard ejecutivo (KPIs, embudo por etapa, mis tareas).
- Kanban con drag & drop nativo y totales por columna.
- Tablas con vistas guardadas y columnas configurables (localStorage por usuario).
- Ficha 360 con pestañas (Resumen/Actividad/Tareas/Líneas), tags y acciones rápidas.
- Importación CSV con previsualización y errores por fila.
- Búsqueda global multi-entidad.
- Estados de loading/empty/error y diálogos de confirmación/prompt (sin `window.confirm`).
- Cierre por `Escape` en modales y fichas.

---

## API pendiente (contratos propuestos para backend)

> Estas rutas **no existen todavía**. Se documentan aquí como contrato esperado
> para que el equipo de backend (lane `codex/security-commercial-core`) las
> implemente con las mismas garantías que el resto: auth obligatoria,
> autorización por rol, aislamiento por tenant (`organization_id` del JWT),
> validación de entrada, queries parametrizadas, registro en `crm_activity_log`
> y rate limiting en escrituras.

### 1. Automatizaciones
Reglas "cuando ocurre X, haz Y" sobre entidades del CRM.

```
GET    /api/crm/automations                 -> { data: [Automation], pagination }
POST   /api/crm/automations                 (perm: crm:admin)
PATCH  /api/crm/automations/:id             (perm: crm:admin)
DELETE /api/crm/automations/:id             (perm: crm:admin)
GET    /api/crm/automations/:id/runs        -> historial de ejecuciones (auditoría)

Automation {
  id, name, is_active,
  trigger: {
    type: 'lead_idle' | 'opportunity_stale' | 'close_date_overdue' | 'stage_changed',
    params: { days?: number, stage_id?: uuid }
  },
  conditions: [{ field, op: 'eq'|'neq'|'gt'|'lt'|'contains', value }],
  actions: [
    { type: 'create_task', params: { title, assignee: 'owner'|uuid, due_in_days } } |
    { type: 'reassign', params: { user_id } } |
    { type: 'set_stage', params: { stage_id } } |
    { type: 'notify', params: { user_id } }
  ]
}
```
Notas: ejecución idempotente; cada acción genera entrada en `crm_activity_log`
con `action: 'automation_run'`. Sin envío de email hasta tener el módulo Email.

### 2. Email y Calendario
```
GET    /api/crm/integrations/email/status        -> { connected, provider, address }
POST   /api/crm/integrations/email/connect       -> { auth_url }   (OAuth Google/MS365)
DELETE /api/crm/integrations/email               (desconectar)
GET    /api/crm/integrations/email/messages      ?entity_type&entity_id  (timeline)
POST   /api/crm/email/send                        { to, subject, body, entity_type, entity_id }
```
Notas: tokens OAuth cifrados en backend, nunca expuestos al cliente. Mensajes y
eventos se reflejan en el timeline existente (`crm_activity_log` / notas).

### 3. Facturación / planes (Stripe)
```
GET    /api/crm/billing/subscription   -> { plan, status, seats, current_period_end }
GET    /api/crm/billing/invoices       -> { data: [{ id, amount, pdf_url, date }] }
POST   /api/crm/billing/checkout       { plan } -> { checkout_url }   (Stripe Checkout)
POST   /api/crm/billing/portal         -> { portal_url }              (Stripe Billing Portal)
```
Notas: **no** almacenar datos de tarjeta (tokenización en Stripe). Webhooks de
Stripe para sincronizar estado de suscripción. Límites por plan aplicados en backend.

### 4. Seguridad / MFA
```
POST   /api/auth/mfa/setup     -> { otpauth_url, secret_masked }   (TOTP)
POST   /api/auth/mfa/verify    { code } -> activa MFA para el usuario
POST   /api/auth/mfa/disable   { code }
GET    /api/auth/sessions      -> sesiones/dispositivos activos
DELETE /api/auth/sessions/:id  -> revocar sesión
```
Notas: secreto TOTP cifrado en backend; el login pasa a requerir el código
cuando MFA está activo. Acompañar de refresh tokens y bloqueo por intentos
(coordinado con la lane de seguridad).

---

## Contratos que el frontend ya consume (referencia rápida)

- Listados: `{ data: [...], pagination: { page, page_size, total, total_pages } }`,
  query `?page&page_size&search&<filtros>`.
- Registro único: `{ data: {...} }`.
- Errores: `{ error: { code, message } }` (mensaje seguro, sin stack).
- Auth: `POST /api/auth/login` y `POST /api/auth/signup` →
  `{ data: { token, user: {id,name,role}, organization: {name, settings} } }`.

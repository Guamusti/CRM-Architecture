# Módulos CRM — estado actual vs. pendiente (referencia Salesforce/Pipedrive)

Inventario funcional del producto desde la óptica del frontend. Para la visión
de negocio y el mapa vs Salesforce ver `docs/PRODUCT.md`.

## Estado por módulo

| Módulo | Estado | Endpoints usados (backend existente) |
|---|---|---|
| Dashboard ejecutivo | ✅ Implementado | `GET /crm/dashboard`, `GET /crm/pipeline`, `GET /crm/tasks` |
| Pipeline Kanban (DnD) | ✅ Implementado | `GET /crm/pipeline`, `PATCH /crm/opportunities/:id`, `POST /crm/opportunities/:id/close` |
| Forecast | ✅ Implementado | `GET /crm/forecast?from&months` (abierto/ponderado/ganado/perdido por mes) + tira en Dashboard |
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
| Automatizaciones | ✅ Backend disponible / frontend conectado | `GET/POST/PATCH/DELETE /crm/automations`, `POST /crm/automations/run`, `GET /crm/automations/:id/runs` |
| Email / Calendario | ✅ Backend disponible / frontend conectado | `…/integrations/email/*`, `POST /crm/email/send`, `…/integrations/calendar/status`, `GET/POST/PATCH/DELETE /crm/calendar/events` |
| Facturación / planes | ✅ Backend disponible / frontend conectado | `GET /crm/billing/summary`, `…/subscription`, `…/invoices`, `POST /crm/billing/checkout`, `…/portal` |
| Seguridad / MFA | ✅ Backend disponible / frontend conectado | `GET /auth/mfa/status`, `POST /auth/mfa/setup`, `…/verify`, `…/disable`, `GET /auth/sessions`, `DELETE /auth/sessions/:id` |

> Ya **no queda ninguna pantalla "pendiente del backend" ni "pronto"**. Las
> integraciones externas que dependen de configuración del servidor (Stripe,
> OAuth de email/calendario) **no se muestran como error**: si el backend
> responde "no configurado" (HTTP 501 / `NOT_CONFIGURED`), la UI muestra un
> aviso profesional de "requiere configuración".

## Integraciones conectadas en esta iteración (antes "pronto")

Todas estas pantallas dejan de ser preview y consumen el backend real.

### Automatizaciones (`stale_lead_task`)
- Lista de reglas, crear/editar/activar-pausar/borrar.
- "Ejecutar ahora" (`POST /crm/automations/run`).
- Historial de ejecuciones por regla (`GET /crm/automations/:id/runs`).
- Maneja `402 PAYMENT_REQUIRED` mostrando el límite del plan (inline + toast).
- Contrato create/update: `{ name, rule_type:'stale_lead_task', is_active, config:{ stale_days, task_title, due_in_days } }`.

### Email y Calendario
- Tabs **Email / Calendario / Integración**.
- Email: estado del proveedor, envío (`POST /crm/email/send`; en dev funciona en
  "modo consola" y la UI lo refleja), historial de mensajes.
- Calendario: lista, crear/editar/borrar eventos.
- Integración: estado y conexión/desconexión del proveedor.
- Email y eventos pueden vincularse a lead/empresa/contacto/oportunidad.

### Facturación / planes (Stripe)
- Plan, estado, fin de prueba y uso vs. límites (barras).
- Facturas (también con lista vacía).
- Botones de checkout por plan (`starter|professional|business|enterprise`) y portal.
- Si Stripe **no está configurado** en el servidor, la sección de suscripción
  muestra "requiere configuración" (sin error crudo).

### Seguridad / MFA
- Estado MFA (`GET /auth/mfa/status`).
- Activación: contraseña → `setup` (muestra `otpauth_url` + secreto, sin librería
  QR externa) → código → `verify`. Recovery codes mostrados **una sola vez**.
- Desactivación con contraseña + código.
- Sesiones activas con revocación.
- Login: si `POST /auth/login` devuelve `mfa_required` + `challenge_token`, la UI
  pide el segundo factor antes de crear sesión (no persiste el challenge).

## Dependencias de entorno (servidor)

Estas funciones son **end-to-end desde la UI**, pero su comportamiento real
depende de variables de entorno del backend (fuera de la lane de frontend):

- **Stripe** (facturación): sin claves configuradas, checkout/portal responden
  "no configurado" y la UI lo indica como "requiere configuración".
- **Email/Calendario** (OAuth Google/MS365): sin proveedor configurado, el envío
  cae a "modo consola" y la conexión aparece como pendiente de configurar.
- **MFA**: operativo sin dependencias externas (TOTP).

---

## Contratos que el frontend ya consume (referencia rápida)

- Listados: `{ data: [...], pagination: { page, page_size, total, total_pages } }`,
  query `?page&page_size&search&<filtros>`.
- Registro único: `{ data: {...} }`.
- Errores: `{ error: { code, message } }` (mensaje seguro, sin stack).
- Auth: `POST /api/auth/login` y `POST /api/auth/signup` →
  `{ data: { access_token|token, refresh_token?, user: {id,name,role}, organization: {name, settings} } }`.
  Login con MFA: `{ data: { mfa_required:true, challenge_token, expires_in, user, organization } }`.
  El frontend normaliza `access_token`/`token` y guarda la sesión solo en
  `sessionStorage` (nunca tokens MFA/recovery/challenge en `localStorage`).

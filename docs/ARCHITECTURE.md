# CRM white-label — Arquitectura

> Pivote de producto: lo que nació como módulo CRM interno de Zyra es ahora
> un **CRM SaaS multi-tenant replicable y vendible** a empresas (white-label).
> Visión de producto y mapa de funcionalidades: [PRODUCT.md](PRODUCT.md).
> La integración con Zyra pasa a ser "Zyra como un tenant más".

## 1. Diagnóstico de partida

El repositorio `CRM-Architecture` parte vacío: el CRM se desarrolla desde cero,
desacoplado del monolito Zyra actual, pero **replicando sus convenciones**
(Node.js + Express + PostgreSQL/Supabase, JWT con roles, frontend HTML/React
CDN/Tailwind sin build) para que la integración futura sea de bajo coste.

Decisiones tomadas por falta de código existente (todas reversibles en la integración):

| Decisión | Motivo | Punto de integración futuro |
|---|---|---|
| Tenant = `organization_id` (UUID) | Genérico; mapeable a `store_id` de Zyra | Vista/columna de mapeo |
| Auth propia mínima (`/api/auth/login`, bcrypt, JWT HS256) | El CRM debe funcionar standalone | Sustituir `src/middlewares/auth.js` por el verificador de Zyra |
| Tablas `organizations` y `users` mínimas | FK de integridad y auditoría | Sincronizar o referenciar tablas Zyra |
| CommonJS + Express 4 | Patrón habitual del stack descrito de Zyra | Ninguno |

## 2. Estructura

```
migrations/        SQL versionado (runner: scripts/migrate.js)
scripts/           migrate.js, seed-dev.js (solo desarrollo)
src/
  config/          env (fail-fast en secretos), pool PG
  middlewares/     auth (JWT), permissions (matriz por rol), validate (zod),
                   rateLimit, errorHandler (errores normalizados, sin stack)
  validators/      esquemas zod .strict() por entidad
  repositories/    SQL 100% parametrizado + whitelists de columnas
  services/        negocio: tenant, scoping worker, transacciones + auditoría
  controllers/     thin controllers
  routes/crm/      montaje de rutas, todas tras requireAuth
tests/             node:test (permisos, validadores, paginación)
docs/              este documento + SECURITY.md (threat model)
```

Flujo de una petición:
`rateLimit → helmet/cors → requireAuth (JWT) → requirePermission (rol) →
validate (zod strict) → controller → service (tenant + scoping + transacción +
activity log) → repository (SQL parametrizado) → errorHandler`

## 3. Modelo de datos

Todas las tablas CRM tienen: `organization_id` (NOT NULL, FK), `created_at`,
`updated_at` (trigger), `created_by`, `updated_by`, `deleted_at` (soft delete),
e índices parciales `WHERE deleted_at IS NULL` por tenant/estado/responsable/seguimiento.

- `organizations`, `users` — tenant y usuarios (mínimos, standalone)
- `crm_pipeline_stages` — etapas configurables (position, probability_default, is_won/is_lost)
- `crm_companies` — cuentas; campos RGPD (`legal_basis`, `data_retention_until`)
- `crm_contacts` — personas físicas; RGPD completo (`consent_status`, `consent_source`, `consent_at`, `anonymized_at`)
- `crm_leads` — estado, fuente, prioridad, responsable, dolor principal, producto Zyra, valor estimado, próximo paso, fecha seguimiento, motivo de pérdida
- `crm_opportunities` — etapa, importe, probabilidad, cierre vía flujo dedicado
- `crm_tasks` — polimórficas (lead/company/contact/opportunity)
- `crm_notes` — notas internas separadas de los datos personales
- `crm_tags` + `crm_entity_tags` — etiquetado polimórfico
- `crm_activity_log` — **append-only** (trigger que bloquea UPDATE/DELETE);
  registra actor, acción, diff de cambios, IP y user-agent. Cumple el doble rol
  de historial de actividad y log de auditoría en Fase 1; si se necesita
  separar auditoría técnica, se añade `crm_audit_log` en Fase 3.
- `crm_custom_fields`: pospuesto (YAGNI); el diseño no lo bloquea.

## 4. Modelo de permisos

| Acción | owner | admin | manager | worker | caja |
|---|---|---|---|---|---|
| Leer | ✓ | ✓ | ✓ | solo asignados | ✗ |
| Crear | ✓ | ✓ | ✓ | notas/tareas (limitado) | ✗ |
| Editar | ✓ | ✓ | ✓ | solo asignados | ✗ |
| Asignar responsable | ✓ | ✓ | ✓ | ✗ | ✗ |
| Cerrar oportunidad | ✓ | ✓ | ✓ | ✗ | ✗ |
| Borrar (soft) | ✓ | ✓ | ✗ | ✗ | ✗ |
| Gestionar pipeline | ✓ | ✓ | ✗ | ✗ | ✗ |

La matriz vive en `src/middlewares/permissions.js` (server-side). El scoping de
`worker` (solo registros asignados) se aplica en la capa de servicio, tanto en
listados (filtro forzado) como en accesos por id (verificación + log de seguridad).

## 5. Endpoints

Todos bajo `/api/crm`, autenticados, validados, paginados y auditados:

- CRUD: `companies`, `contacts`, `leads`, `opportunities`, `tasks`
  (`GET` lista, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id` soft)
- `POST /opportunities/:id/close` — flujo de cierre won/lost (lost_reason obligatorio en lost)
- `GET /pipeline` — etapas + oportunidades abiertas agrupadas (kanban)
- `POST|PATCH|DELETE /pipeline/stages[/:id]`
- `POST /notes`, `GET /notes`, `DELETE /notes/:id`
- `GET /activities` — historial filtrable por entidad
- `GET /dashboard` — leads por estado, valor de pipeline (bruto y ponderado),
  win rate del mes, tareas vencidas, próximos seguimientos
- `POST /api/auth/login` — rate-limited (10/15min)

## 6. Plan por fases

- **Fase 1 (hecha)** — Migraciones, seguridad transversal, CRUD completo,
  pipeline, cierre de oportunidades, notas, actividad, dashboard, tests unitarios.
- **Fase 2 (hecha)** — Frontend `public/crm.html` + `public/js/crm-app.js`
  (React UMD + htm por CDN, sin build y compatible con CSP — sin Babel ni
  `unsafe-eval`): dashboard, kanban con cambio de etapa y cierre won/lost,
  tablas de leads/empresas/contactos/tareas con filtros y paginación, fichas
  de detalle con notas e historial, formularios de creación/edición. El
  frontend solo oculta botones por UX; el backend decide siempre.
- **Fase 3 (hecha)** — Conversión lead→oportunidad transaccional y auditada,
  API de etiquetas (crear/asignar/quitar), exportación RGPD de contacto
  (registrada en auditoría) y anonimización irreversible (datos personales +
  notas asociadas; reservada a owner/admin). Endpoint `/api/crm/users` para
  selects de asignación.
- **Fase P (hecha) — Productización white-label**: signup self-service
  (org + owner + pipeline), gestión de usuarios con reglas anti-lockout,
  catálogo de productos por tenant (sustituye al enum fijo de productos Zyra),
  campos personalizados por tenant (definiciones + valores jsonb validados),
  branding por organización (nombre y color), importación CSV (hasta 500
  filas validadas una a una) y email único global para el login.
- **Fase 4 — Comercialización**: verificación de email, recuperación de
  contraseña, facturación (Stripe) y límites por plan, MFA. Ver PRODUCT.md.
- **Fase 5 — Integraciones externas**: email, calendario, WhatsApp (los campos
  `source` y el activity log ya están preparados). Zyra se integra como un
  tenant más de la plataforma.

## 7. RGPD

- Base jurídica registrada por empresa/contacto (`legal_basis`, por defecto interés legítimo).
- Consentimiento preparado para campañas futuras (`consent_status/source/at`).
- `data_retention_until` para política de retención; `anonymized_at` en contactos.
- Notas internas en tabla separada de los datos personales.
- Activity log = trazabilidad de todo acceso de escritura.
- Minimización: solo datos de contacto profesional; sin categorías especiales.
- Los logs de aplicación nunca incluyen datos personales (regla en `logger.js`).
- Exportación: `GET /api/crm/contacts/:id/export` (owner/admin/manager, auditada).
- Anonimización: `POST /api/crm/contacts/:id/anonymize` (owner/admin) — borra
  irreversiblemente nombre/email/teléfono/cargo/consentimiento y retira las
  notas asociadas; queda registrada en el activity log.

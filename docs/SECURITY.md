# Zyra CRM — Plan de seguridad y threat model

## Principios

Zero trust y mínimo privilegio: ninguna petición se fía del cliente. Identidad
y tenant salen exclusivamente del JWT verificado; permisos y scoping se deciden
server-side en cada operación.

## Threat model

### Actores
- **Atacante externo no autenticado** (internet).
- **Usuario autenticado de otro tenant** (cliente de Zyra malicioso o comprometido).
- **Usuario interno con rol bajo** (worker/caja) intentando escalar.
- **Atacante con credenciales robadas** (phishing, reuso de contraseñas).

### Activos
- Datos personales de contactos comerciales (RGPD).
- Datos de negocio: pipeline, importes, clientes, motivos de pérdida.
- Credenciales y tokens de usuarios.
- Integridad del registro de auditoría.

### Superficies de ataque
- Endpoints HTTP públicos (`/api/auth/login`, `/api/crm/*`).
- Parámetros de query (filtros, orden, paginación) y bodies JSON.
- Cabeceras (Authorization, Origin, User-Agent que se persiste en el log).
- Base de datos (si una capa superior falla).

### Riesgos y mitigaciones implementadas

| Riesgo | Mitigación |
|---|---|
| SQL injection | 100% queries parametrizadas; nombres de columna solo de whitelists declaradas en código (`entityConfigs.js`), nunca del usuario |
| IDOR / fuga entre tenants | Toda query incluye `organization_id` del JWT; las FKs cruzadas se verifican contra el tenant (`assertRefsInTenant`); los 404 no distinguen "no existe" de "no es tuyo" |
| Mass assignment | Esquemas zod `.strict()`: cualquier campo no declarado se rechaza; `organization_id`, `created_by`, `status` de cierre, etc. no son escribibles vía API |
| Escalada de privilegios | Matriz de permisos server-side; `worker` con scoping forzado en servicio; `caja` sin acceso; intentos denegados se registran como eventos de seguridad |
| Fuerza bruta en login | Rate limit 10/15min por IP; bcrypt; comparación constante aunque el usuario no exista; mensajes que no revelan existencia de cuentas |
| XSS | API solo JSON; CSP restrictiva vía Helmet; React (Fase 2) escapa por defecto y queda prohibido `dangerouslySetInnerHTML` |
| CSRF | No aplica: auth por header `Authorization: Bearer`, sin cookies de sesión; CORS sin credenciales y con whitelist de orígenes |
| DoS básico | Rate limiting por capas (global, escritura, login), body JSON ≤ 100 KB, paginación con tope 100, kanban con LIMIT |
| Fuga de información en errores | Handler centralizado: nunca stack traces ni SQL al cliente; errores PG mapeados a mensajes genéricos |
| Manipulación de auditoría | `crm_activity_log` append-only con trigger que bloquea UPDATE/DELETE; escrito en la misma transacción que la mutación |
| Borrado malicioso | Soft delete (`deleted_at`) reservado a owner/admin, auditado y recuperable |
| Secretos | Solo por entorno; fail-fast si `JWT_SECRET` falta o es corto; `.env` ignorado por git; seed sin contraseñas fijas |
| Enumeración por timing en login | Hash dummy comparado siempre |

### Riesgos pendientes (aceptados en Fase 1, planificados)

- **Sin refresh tokens ni revocación de JWT**: un token robado vale hasta su
  expiración (8h). Mitigación futura: lista de revocación o sesiones cortas + refresh.
- **Sin MFA**: recomendable para owner/admin antes de producción.
- **Rate limiting en memoria**: con varias instancias necesita store compartido (Redis).
- **`rejectUnauthorized: false` en TLS de BD** (necesario con el pooler de
  Supabase): fijar CA en producción si el proveedor lo permite.
- **Sin RLS de PostgreSQL**: el aislamiento de tenant es de aplicación. Si se
  consolida Supabase, añadir RLS como segunda barrera (defensa en profundidad).
- **Exportación/anonimización RGPD**: campos preparados, endpoints en Fase 3.
- **Sin bloqueo de cuenta tras N fallos**: el rate limit por IP no cubre ataques
  distribuidos; añadir contador por cuenta en Fase 3.

## Reglas operativas

- Ningún endpoint CRM sin `requireAuth` + `requirePermission`.
- Ninguna query sin `organization_id` parametrizado.
- Ningún log con datos personales o tokens.
- Toda mutación pasa por transacción con registro de actividad.
- Toda entidad nueva debe declarar config (whitelist) y esquemas zod antes de exponerse.

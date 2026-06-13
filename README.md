# Zyra CRM

Módulo CRM multi-tenant para Zyra (SaaS B2B para pequeños negocios en España).
Backend Node.js + Express + PostgreSQL, diseñado con seguridad zero-trust,
auditoría append-only y preparación RGPD desde el primer commit.

- Arquitectura y plan por fases: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Seguridad y threat model: [docs/SECURITY.md](docs/SECURITY.md)

## Puesta en marcha

```bash
npm install
cp .env.example .env   # rellenar DATABASE_URL y JWT_SECRET
npm run migrate        # aplica migrations/*.sql en orden
npm run seed:dev       # solo desarrollo: org demo + owner + pipeline
npm run dev            # o npm start
npm test               # tests de permisos, validadores y paginación
```

## Uso rápido

```bash
# Login (la contraseña la imprime seed:dev una sola vez)
curl -s localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@demo.local","password":"<password>"}'

# Con el token:
curl -s localhost:3000/api/crm/dashboard -H "Authorization: Bearer $TOKEN"
curl -s localhost:3000/api/crm/leads -X POST \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Panadería San Blas","priority":"high","source":"referral","zyra_product":"tpv"}'
```

## Estado

Fases 1–3 completadas:
- **Backend**: auth, permisos por rol, multi-tenant, CRUD de
  companies/contacts/leads/opportunities/tasks, pipeline configurable, cierre
  de oportunidades, conversión lead→oportunidad, etiquetas, notas, historial
  de actividad, dashboard y RGPD (exportación + anonimización de contactos).
- **Frontend**: `http://localhost:3000/crm` — dashboard, kanban, tablas con
  filtros, fichas de detalle con notas e historial, formularios (React + htm
  por CDN, sin build, compatible con CSP).

Siguiente: Fase 4 (integración con Zyra) — ver plan en docs/ARCHITECTURE.md.

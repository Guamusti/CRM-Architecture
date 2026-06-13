# CRM white-label

CRM SaaS multi-tenant **replicable y vendible a empresas**: cada cliente se da
de alta en autoservicio, configura su catálogo, pipeline, campos
personalizados y marca, e invita a su equipo. Backend Node.js + Express +
PostgreSQL con seguridad zero-trust, auditoría append-only y RGPD de serie.

- Visión de producto (mapa vs Salesforce): [docs/PRODUCT.md](docs/PRODUCT.md)
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

Fases 1–3 + Fase P (productización) completadas:
- **Núcleo CRM**: leads, empresas, contactos, oportunidades, pipeline kanban
  configurable, conversión lead→oportunidad, tareas, notas, etiquetas,
  historial de actividad, dashboard y RGPD (exportar/anonimizar contactos).
- **Producto SaaS**: signup self-service de organizaciones, gestión de
  usuarios y roles, catálogo de productos por empresa, campos personalizados
  por empresa, branding white-label (nombre + color), importación CSV.
- **Frontend** en `http://localhost:3000/crm` (React + htm self-hosted, sin
  build, CSP estricta). El signup está en la propia pantalla de login.

Siguiente: Fase 4 (comercialización: email, facturación, MFA) — ver docs/PRODUCT.md.

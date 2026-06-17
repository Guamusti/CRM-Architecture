# CRM white-label — Visión de producto

Producto SaaS multi-tenant replicable: cada empresa cliente se da de alta,
configura su catálogo, su pipeline, sus campos y su marca, e invita a su
equipo. Posicionamiento: la simplicidad de un Pipedrive con los rasgos
diferenciales de Salesforce que una pyme realmente usa (personalización,
permisos, trazabilidad), sin su complejidad ni su coste.

## Mapa de funcionalidades (referencia: Salesforce Sales Cloud)

| Capacidad Salesforce | Estado aquí | Notas |
|---|---|---|
| Leads / Accounts / Contacts / Opportunities | ✅ | Núcleo desde Fase 1 |
| Pipeline configurable por etapas | ✅ | Etapas, probabilidad por defecto, won/lost |
| Conversión lead→oportunidad | ✅ | Transaccional y auditada |
| Activities (tareas, notas, timeline) | ✅ | Tareas polimórficas, notas, activity log |
| Custom fields | ✅ | Definiciones por tenant + valores validados (text/number/date/boolean/select) |
| Products / Price Book | ✅ | Catálogo por tenant + líneas de producto en oportunidades (cantidad, precio, descuento, total calculado en BD) |
| Reports & Dashboards | ✅ (básico) | KPIs de pipeline, win rate, seguimientos; informes configurables en roadmap |
| Data import | ✅ | CSV (parseo cliente) → validación fila a fila, hasta 500 filas |
| Roles y perfiles | ✅ | 5 roles con matriz server-side y scoping de comercial |
| Multi-tenant / org provisioning | ✅ | Signup self-service: org + owner + pipeline en un paso |
| Branding | ✅ | Nombre y color de marca por organización (white-label) |
| API REST | ✅ | Toda la funcionalidad es API-first |
| Audit trail | ✅ | Append-only con actor, diff, IP |
| RGPD (exportar/anonimizar) | ✅ | Ventaja frente a CRMs americanos para el mercado europeo |
| Forecasting | ✅ | Forecast por mes de cierre (bruto y ponderado), filtrable por responsable |
| Email/calendar sync (Activity Capture) | 🔜 | Roadmap; el modelo de actividad ya lo soporta |
| Cadencias / Sales Engagement | 🔜 | Roadmap |
| Workflow automation | 🔜 | Roadmap (reglas: "si lead sin tocar 7 días → tarea") |
| AI scoring (Einstein) | ❌ | Fuera de alcance inicial |
| CPQ / contratos / comisiones | ❌ | Fuera de alcance (segmento enterprise) |

Fuentes de la investigación:
[Salesforce Sales Cloud guide](https://www.salesforce.com/sales/cloud/guide/),
[Noltic: Sales Cloud features 2026](https://noltic.com/stories/salesforce-sales-cloud-features),
[Zeeg: Sales Cloud 2026](https://zeeg.me/en/blog/post/salesforce-sales-cloud),
[Pipedrive vs HubSpot vs Salesforce](https://www.pipedrive.com/en/blog/hubspot-vs-salesforce-vs-pipedrive),
[Salesflare: comparativa 2026](https://blog.salesflare.com/compare-salesforce-zoho-hubspot-pipedrive).

## Modelo de negocio previsto

- **SaaS por suscripción**: precio por usuario/mes por organización (tipo
  Salesforce Starter, 25 €/usuario/mes como referencia de mercado).
- **Onboarding autoservicio**: signup → pipeline por defecto → importar CSV →
  invitar equipo. Sin intervención manual.
- **White-label**: el cliente ve su marca, no la nuestra.
- **Datos en Europa + RGPD de serie**: argumento de venta para pymes españolas.

## Qué falta para producción comercial (priorizado)

1. Verificación de email en signup + recuperación de contraseña (necesita proveedor de email).
2. Facturación/suscripciones (Stripe) y límites por plan (usuarios, registros).
3. MFA para owner/admin; refresh tokens; rate limit con Redis.
4. RLS en PostgreSQL como segunda barrera de tenant.
5. Forecast mensual y informes configurables.
6. Automatizaciones básicas de pipeline.
7. Términos de servicio, DPA y registro de subencargados (RGPD art. 28).

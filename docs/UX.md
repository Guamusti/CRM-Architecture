# UX — CRM white-label (frontend profesional)

Documento funcional del frontend (`public/crm.html` + `public/js/crm-app.js`).
Stack sin build: React 18 (UMD) + htm + Tailwind, todo **self-hosted** en
`public/vendor/` (sin CDNs externos, CSP estricta `script-src 'self'`).

> Principio transversal: **el frontend nunca decide permisos**. La función
> `can(action)` solo oculta botones como mejora de UX; el backend autoriza y
> valida cada petición. Si un control oculto se invocara igualmente, el backend
> responde 401/403.

## Mapa de pantallas

Layout: **navegación lateral** (sidebar) + **topbar** (búsqueda global + menú de
usuario) + área de contenido por módulo.

### Sidebar (módulos)
- **Principal**: Dashboard, Pipeline, Forecast.
- **Registros**: Leads, Cuentas (empresas), Contactos, Oportunidades, Tareas, Productos.
- **Próximamente** (preview, sin backend): Automatizaciones, Email y Calendario,
  Facturación, Seguridad (MFA). Marcadas con chip "pronto".
- **Inferior**: Configuración (solo `admin`).

### Dashboard ejecutivo
- 6 KPIs: oportunidades abiertas, valor de pipeline, forecast ponderado,
  win rate del mes, ganado del mes, tareas vencidas (en rojo si > 0).
- "Pipeline por etapa" (barras con importe por etapa) con enlace al Kanban.
- "Mis tareas pendientes" (del usuario actual) con enlace a Tareas.
- "Leads por estado" y "Próximos seguimientos (7 días)".
- Fuentes: `GET /crm/dashboard`, `GET /crm/pipeline`, `GET /crm/tasks`.

### Pipeline (Kanban)
- Columnas por etapa con **contador e importe total** por columna.
- **Drag & drop nativo** (sin dependencias) para mover oportunidades entre
  etapas abiertas; alternativa accesible con `<select>` por tarjeta.
- Tarjeta: título, empresa, importe, prioridad, responsable (avatar).
- Acciones rápidas por tarjeta: mover etapa, marcar ganada (confirm),
  marcar perdida (motivo obligatorio vía prompt).
- Filtro por responsable. Clic en tarjeta abre la ficha 360.
- Fuentes: `GET /crm/pipeline`, `PATCH /crm/opportunities/:id`,
  `POST /crm/opportunities/:id/close`.

### Forecast
- KPIs (pipeline 6 meses, ponderado, sin fecha) y barras bruto vs ponderado
  por mes de cierre previsto; histórico de ganado por mes. Filtro por responsable.
- Fuente: `GET /crm/forecast`.

### Módulos de registros (tabla)
Patrón común (`TableView`) para Leads / Cuentas / Contactos / Oportunidades /
Tareas / Productos:
- Buscador, filtros por campo, **vistas guardadas** y **columnas configurables**
  (persistidas en `localStorage` por usuario; solo preferencias de UI).
- Estados profesionales: **loading** (skeleton), **vacío** (con CTA), **error**
  (con reintento). Paginación servidor.
- Importación CSV (Leads/Cuentas/Contactos) con **previsualización** y errores
  por fila antes de confirmar.
- Botón "Nuevo" y filas clicables → ficha 360.

### Ficha 360 (drawer lateral)
- Cabecera: avatar (iniciales), título, tipo, **editor de etiquetas** (tags),
  acciones rápidas (Convertir lead, Exportar/Anonimizar contacto, Editar, Eliminar).
- Pestañas: **Resumen** (campos + campos personalizados; cierre won/lost en
  oportunidades), **Actividad** (notas + timeline de auditoría), **Tareas**
  (relacionadas, crear/completar), **Líneas** (solo oportunidades: presupuesto).
- Cierre con tecla `Escape`, clic fuera o botón ×.

### Configuración (admin)
- Usuarios (invitar/editar/activar), Productos (catálogo), Campos personalizados
  (crear/borrar por entidad), Marca (nombre y color white-label).

### Pantallas "pendiente de backend"
Previsualización con chip "Pendiente de backend", descripción del valor y
botón deshabilitado. Contratos propuestos en `docs/CRM_MODULES.md`.

## Flujos principales

1. **Alta de organización**: Login → "Crea la cuenta de tu empresa" → signup →
   sesión iniciada con pipeline por defecto.
2. **Captar y cualificar lead**: Leads → Nuevo → ficha 360 (notas, tareas,
   tags) → Convertir → oportunidad en el pipeline.
3. **Gestionar oportunidad**: Pipeline → arrastrar entre etapas → ficha →
   pestaña Líneas (añadir productos del catálogo) → cerrar ganada/perdida.
4. **Previsión**: Forecast por mes; Dashboard para visión ejecutiva.
5. **Búsqueda global**: topbar → resultados agrupados por entidad → abre la
   ficha del registro directamente.
6. **Importación**: módulo → Importar → pegar CSV → previsualizar → importar
   con informe de errores por fila.
7. **Configurar el CRM (admin)**: usuarios, catálogo, campos personalizados, marca.

## Criterios de aceptación

- [x] Navegación lateral por módulos con estado activo y agrupación.
- [x] Dashboard ejecutivo con KPIs reales y accesos directos.
- [x] Kanban usable con drag & drop y totales por columna.
- [x] Tablas con búsqueda, filtros, vistas guardadas y columnas configurables.
- [x] Ficha 360 con pestañas, timeline, notas, tags, tareas y acciones rápidas.
- [x] Importación CSV con previsualización y errores por fila.
- [x] Estados de loading / vacío / error / confirmación en todas las vistas.
- [x] UI para usuarios, campos personalizados y branding (backend existente).
- [x] Pantallas "pendiente de backend" claramente marcadas (no simulan datos).
- [x] Búsqueda global funcional sobre leads/cuentas/contactos/oportunidades.
- [x] Sin XSS: sin `dangerouslySetInnerHTML`, sin innerHTML, sin scripts inline.
- [x] Sin dependencias CDN nuevas; sin tokens en consola.
- [x] El frontend solo oculta controles por rol; el backend autoriza siempre.

## Notas de accesibilidad / pendientes UX
- Drag & drop tiene alternativa por `<select>` (táctil/teclado).
- Búsqueda usa `ILIKE` del backend (sensible a acentos): "clinica" ≠ "clínica".
  Mejora futura sugerida (backend): búsqueda sin acentos (`unaccent`).
- Posibles siguientes pasos: reordenar columnas por drag, exportar tabla a CSV,
  vista "Mi día" de tareas y seguimientos.

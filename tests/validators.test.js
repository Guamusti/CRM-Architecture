'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../src/validators/crm.schemas');

test('mass assignment: campos no declarados son rechazados', () => {
  assert.throws(() =>
    schemas.leadCreate.parse({ title: 'Lead', organization_id: 'x', role: 'owner' })
  );
  assert.throws(() =>
    schemas.companyCreate.parse({ name: 'Acme', created_by: 'attacker-id' })
  );
  assert.throws(() =>
    schemas.opportunityUpdate.parse({ status: 'won' }) // cierre solo vía /close
  );
});

test('límites de longitud aplicados', () => {
  assert.throws(() => schemas.leadCreate.parse({ title: 'a'.repeat(201) }));
  assert.throws(() =>
    schemas.noteCreate.parse({
      entity_type: 'lead',
      entity_id: '00000000-0000-0000-0000-000000000000',
      body: 'a'.repeat(5001),
    })
  );
});

test('enums estrictos en estados y prioridades', () => {
  assert.throws(() => schemas.leadCreate.parse({ title: 'L', status: 'hacked' }));
  assert.throws(() => schemas.leadCreate.parse({ title: 'L', priority: 'maxima' }));
  const ok = schemas.leadCreate.parse({ title: 'L', priority: 'high', status: 'new' });
  assert.equal(ok.priority, 'high');
});

test('emails y UUIDs validados', () => {
  assert.throws(() => schemas.contactCreate.parse({ first_name: 'Ana', email: 'no-es-email' }));
  assert.throws(() => schemas.contactCreate.parse({ first_name: 'Ana', company_id: '1 OR 1=1' }));
  const ok = schemas.contactCreate.parse({ first_name: '  Ana ', email: 'ANA@Test.com' });
  assert.equal(ok.first_name, 'Ana');
  assert.equal(ok.email, 'ana@test.com');
});

test('cierre de oportunidad valida estados', () => {
  assert.throws(() => schemas.opportunityClose.parse({ status: 'open' }));
  const ok = schemas.opportunityClose.parse({ status: 'lost', lost_reason: 'precio' });
  assert.equal(ok.status, 'lost');
});

test('conversión de lead: solo campos permitidos', () => {
  assert.throws(() => schemas.leadConvert.parse({ status: 'converted' }));
  const ok = schemas.leadConvert.parse({ amount: 500 });
  assert.equal(ok.amount, 500);
});

test('tags: nombre obligatorio y asignación con UUIDs válidos', () => {
  assert.throws(() => schemas.tagCreate.parse({ name: '' }));
  assert.throws(() => schemas.tagAssign.parse({ tag_id: 'x', entity_type: 'lead', entity_id: 'y' }));
  const ok = schemas.tagAssign.parse({
    tag_id: '00000000-0000-0000-0000-000000000001',
    entity_type: 'lead',
    entity_id: '00000000-0000-0000-0000-000000000002',
  });
  assert.equal(ok.entity_type, 'lead');
});

test('productización: esquemas de admin estrictos', () => {
  // select sin opciones rechazado
  assert.throws(() => schemas.customFieldCreate.parse({
    entity_type: 'lead', key: 'nivel', label: 'Nivel', field_type: 'select',
  }));
  // clave con mayúsculas/espacios rechazada
  assert.throws(() => schemas.customFieldCreate.parse({
    entity_type: 'lead', key: 'Mi Campo', label: 'X', field_type: 'text',
  }));
  const ok = schemas.customFieldCreate.parse({
    entity_type: 'lead', key: 'nivel', label: 'Nivel', field_type: 'select', options: ['A', 'B'],
  });
  assert.equal(ok.field_type, 'select');
  // contraseña corta en alta de usuario
  assert.throws(() => schemas.userCreate.parse({ name: 'X Y', email: 'x@y.com', password: 'corta', role: 'worker' }));
  // brand_color debe ser hex
  assert.throws(() => schemas.settingsUpdate.parse({ brand_color: 'rojo' }));
  // custom values: clave inválida rechazada
  assert.throws(() => schemas.leadCreate.parse({ title: 'L', custom: { 'DROP TABLE': 1 } }));
  const lead = schemas.leadCreate.parse({ title: 'L', custom: { tratamiento: 'Ortodoncia' } });
  assert.equal(lead.custom.tratamiento, 'Ortodoncia');
});

test('líneas de oportunidad: requieren producto o nombre', () => {
  assert.throws(() => schemas.opportunityItemCreate.parse({ quantity: 2 }));
  assert.throws(() => schemas.opportunityItemCreate.parse({ name: 'X', quantity: 0 }));
  assert.throws(() => schemas.opportunityItemCreate.parse({ name: 'X', discount_percent: 150 }));
  const ok = schemas.opportunityItemCreate.parse({ name: 'Servicio', quantity: 3, unit_price: 100, discount_percent: 10 });
  assert.equal(ok.quantity, 3);
  const fromProduct = schemas.opportunityItemCreate.parse({ product_id: '00000000-0000-0000-0000-000000000001' });
  assert.equal(fromProduct.product_id, '00000000-0000-0000-0000-000000000001');
});

test('forecast: meses acotados', () => {
  assert.throws(() => schemas.forecastQuery.parse({ months: 0 }));
  assert.throws(() => schemas.forecastQuery.parse({ months: 99 }));
  const ok = schemas.forecastQuery.parse({ months: 12 });
  assert.equal(ok.months, 12);
});

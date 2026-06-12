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

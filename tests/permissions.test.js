'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hasPermission, isLimitedRole } = require('../src/middlewares/permissions');

test('owner y admin tienen acceso total al CRM', () => {
  for (const role of ['owner', 'admin']) {
    for (const action of ['crm:read', 'crm:create', 'crm:update', 'crm:delete', 'crm:assign', 'crm:close', 'crm:pipeline:manage']) {
      assert.equal(hasPermission(role, action), true, `${role} debe tener ${action}`);
    }
  }
});

test('manager no puede borrar ni gestionar pipeline', () => {
  assert.equal(hasPermission('manager', 'crm:delete'), false);
  assert.equal(hasPermission('manager', 'crm:pipeline:manage'), false);
  assert.equal(hasPermission('manager', 'crm:close'), true);
  assert.equal(hasPermission('manager', 'crm:assign'), true);
});

test('worker tiene acceso limitado y con scoping', () => {
  assert.equal(hasPermission('worker', 'crm:read'), true);
  assert.equal(hasPermission('worker', 'crm:create'), true);
  assert.equal(hasPermission('worker', 'crm:update'), true);
  assert.equal(hasPermission('worker', 'crm:delete'), false);
  assert.equal(hasPermission('worker', 'crm:close'), false);
  assert.equal(isLimitedRole('worker'), true);
  assert.equal(isLimitedRole('manager'), false);
});

test('caja no tiene ningún acceso al CRM', () => {
  for (const action of ['crm:read', 'crm:create', 'crm:update', 'crm:delete', 'crm:close']) {
    assert.equal(hasPermission('caja', action), false);
  }
});

test('rol desconocido no tiene permisos', () => {
  assert.equal(hasPermission('superhacker', 'crm:read'), false);
  assert.equal(hasPermission(undefined, 'crm:read'), false);
});

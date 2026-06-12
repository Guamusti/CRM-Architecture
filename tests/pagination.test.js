'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePagination, MAX_PAGE_SIZE } = require('../src/utils/pagination');

test('paginación con valores por defecto', () => {
  const p = parsePagination({});
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, 25);
  assert.equal(p.offset, 0);
});

test('page_size limitado al máximo (anti scraping/DoS)', () => {
  const p = parsePagination({ page_size: '999999' });
  assert.equal(p.pageSize, MAX_PAGE_SIZE);
});

test('valores inválidos no rompen ni permiten offsets negativos', () => {
  const p = parsePagination({ page: '-5', page_size: 'abc' });
  assert.equal(p.page, 1);
  assert.ok(p.offset >= 0);
});

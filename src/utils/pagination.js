'use strict';
// Paginación obligatoria en todos los listados.

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let pageSize = parseInt(query.page_size, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function paginatedResponse(rows, total, { page, pageSize }) {
  return {
    data: rows,
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  };
}

module.exports = { parsePagination, paginatedResponse, MAX_PAGE_SIZE };

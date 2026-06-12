'use strict';
// Runner de migraciones simple y determinista: aplica los .sql de
// /migrations en orden alfabético y registra los aplicados.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no definida');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name varchar(200) PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (ya aplicada)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`> Aplicando ${file}…`);
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      console.log(`✓ ${file}`);
    } catch (err) {
      console.error(`✗ Error en ${file}: ${err.message}`);
      await pool.end();
      process.exit(1);
    }
  }
  await pool.end();
  console.log('Migraciones completadas.');
}

main();

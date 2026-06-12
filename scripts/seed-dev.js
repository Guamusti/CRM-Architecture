'use strict';
// Seed SOLO para desarrollo: crea una organización demo, un usuario
// owner y el pipeline por defecto. Se niega a ejecutarse en producción.
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('seed-dev no puede ejecutarse en producción');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const existing = await pool.query(`SELECT id FROM organizations WHERE name = 'Demo Org' LIMIT 1`);
  if (existing.rows.length) {
    console.log('Demo Org ya existe, nada que hacer.');
    await pool.end();
    return;
  }

  // Contraseña aleatoria por ejecución: nunca credenciales fijas en código
  const password = crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(password, 10);

  const org = await pool.query(
    `INSERT INTO organizations (name) VALUES ('Demo Org') RETURNING id`
  );
  const orgId = org.rows[0].id;
  const user = await pool.query(
    `INSERT INTO users (organization_id, email, password_hash, name, role)
     VALUES ($1, 'owner@demo.local', $2, 'Owner Demo', 'owner') RETURNING id`,
    [orgId, hash]
  );
  await pool.query('SELECT crm_create_default_pipeline($1, $2)', [orgId, user.rows[0].id]);
  await pool.end();

  console.log('Seed de desarrollo creado:');
  console.log(`  organización: Demo Org (${orgId})`);
  console.log('  usuario:      owner@demo.local');
  console.log(`  contraseña:   ${password}`);
  console.log('Guarda la contraseña: no se vuelve a mostrar.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // PostgreSQL 연결 (초기 AWS RDS → 현재 Supabase Session Pooler)
});

module.exports = pool;
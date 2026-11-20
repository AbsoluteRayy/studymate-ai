import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function initDB() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL belum diatur di dalam file .env!");
  }

  const client = await pool.connect();
  try {
    // Tabel daftar sesi chat & judulnya (untuk fitur Auto-Title, Rename, & Mode AI)
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        mode TEXT DEFAULT 'database',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Pastikan kolom mode tersedia pada tabel chat_sessions yang sudah ada sebelumnya
    await client.query(`
      ALTER TABLE chat_sessions
      ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'database'
    `);

    // Tabel riwayat pertanyaan & jawaban
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id SERIAL PRIMARY KEY,
        session_id TEXT,
        mode TEXT DEFAULT 'database',
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      ALTER TABLE chat_history
      ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'database'
    `);

    console.log("✅ Database PostgreSQL (Neon.tech) & tabel sesi dual-mode siap digunakan.");
    return pool;
  } finally {
    client.release();
  }
}

export default pool;
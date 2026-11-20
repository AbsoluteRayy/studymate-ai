import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { initDB } from "./db.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ============================
// Inisialisasi Database SQLite
// ============================
let db;
initDB()
  .then((database) => {
    db = database;
  })
  .catch((err) => {
    console.error("❌ Gagal menghubungkan SQLite:", err);
  });

// ============================
// Koneksi ke Qwen 3 8B (Google Colab)
// ============================
const client = new OpenAI({
  baseURL: process.env.COLAB_BASE_URL,
  apiKey: process.env.COLAB_API_KEY,
});

// ============================
// Fungsi Helper: Ekstrak Judul Ringkas & To The Point dari Balasan AI
// ============================
function extractSmartTitle(aiReply, userPrompt) {
  // 1. Jika balasan AI adalah penolakan di luar domain Basis Data
  if (aiReply.startsWith("Maaf, saya adalah **StudyMate AI**")) {
    return "Topik di Luar Basis Data";
  }

  // 2. Ambil Heading Markdown pertama (# Judul / ## Subjudul) dari balasan AI
  const headingMatch = aiReply.match(/^#{1,3}\s+(.+)$/m);
  if (headingMatch && headingMatch[1]) {
    const cleanHeading = headingMatch[1]
      .replace(/[*_`~#]/g, "")
      .replace(/\(.*?\)/g, "")
      .trim();

    if (cleanHeading.length > 2) {
      return cleanHeading.split(/\s+/).slice(0, 5).join(" ");
    }
  }

  // 3. Fallback: buang kata sapaan/basa-basi user dan ambil kata intinya
  const cleanedPrompt = userPrompt
    .replace(
      /^(halo|hai|hi|ai|studymate|tolong|bisakah|coba|gimana|bagaimana|cara|apa|buatkan|buatin|kau|kamu|aku|saya|dong|ya|sih)\b[\s,?!.]*/gi,
      ""
    )
    .replace(
      /^(halo|hai|hi|ai|studymate|tolong|bisakah|coba|gimana|bagaimana|cara|apa|buatkan|buatin|kau|kamu|aku|saya|dong|ya|sih)\b[\s,?!.]*/gi,
      ""
    )
    .replace(/[?!.]+$/g, "")
    .trim();

  const words = (cleanedPrompt || userPrompt).split(/\s+/).slice(0, 4).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ============================
// Chat Endpoint (Domain: Basis Data + Auto Title 1x)
// ============================
app.post("/chat", async (req, res) => {
  try {
    const { prompt, sessionId, shouldUpdateTitle, isFirstMessage } = req.body;

    console.log("Prompt:", prompt);

    const completion = await client.chat.completions.create({
      model: "qwen/qwen3.8-27b",
      messages: [
        {
          role: "system",
          content: `
Kamu adalah StudyMate AI – Database Learning Assistant, asisten belajar khusus mahasiswa Teknik Informatika untuk mata kuliah **Basis Data (Database Systems)**.

ATURAN PEMBATASAN DOMAIN (WAJIB DIPATUHI):
1. Kamu HANYA boleh menjawab pertanyaan yang berkaitan dengan mata kuliah **Basis Data**, meliputi:
   - Konsep dasar Basis Data, DBMS, RDBMS, dan arsitektur database
   - Pemodelan data & Entity Relationship Diagram (ERD, entitas, atribut, relasi, kardinalitas)
   - Normalisasi database (1NF, 2NF, 3NF, BCNF, anomali data, ketergantungan fungsional)
   - Perancangan tabel, Primary Key, Foreign Key, Candidate Key, Composite Key, dan Constraint
   - Bahasa SQL (DDL, DML, DCL, TCL: CREATE, ALTER, DROP, SELECT, INSERT, UPDATE, DELETE, JOIN, GROUP BY, HAVING, Subquery, View, Stored Procedure, Trigger)
   - Sistem manajemen basis data seperti SQLite, MySQL, PostgreSQL, Oracle, dan SQL Server
   - Indexing, Transaction (ACID), Concurrency Control, dan optimasi query dasar
2. Jika pengguna bertanya tentang topik DI LUAR mata kuliah Basis Data (misalnya politik, olahraga, hiburan, resep masakan, sejarah umum, atau mata kuliah lain seperti jaringan komputer, fisika, kalkulus, dll.), kamu WAJIB menolak dengan sopan menggunakan kalimat berikut:
   "Maaf, saya adalah **StudyMate AI** yang dirancang khusus untuk membantu pembelajaran mata kuliah **Basis Data (Database Systems)**. Silakan ajukan pertanyaan seputar konsep database, ERD, normalisasi, query SQL, atau sistem manajemen basis data."

ATURAN FORMAT JAWABAN:
Jawablah menggunakan Markdown yang rapi:
# Judul
## Subjudul
### Penjelasan
- Bullet Point
1. Langkah Pertama
**Gunakan bold untuk istilah penting.**
> Gunakan blockquote untuk catatan penting.

Jika menjelaskan konsep Basis Data, sertakan:
- **Pengertian**
- **Penjelasan sederhana**
- **Contoh** (sertakan contoh query SQL atau skema tabel jika relevan)
- **Kesimpulan**

Gunakan bahasa Indonesia yang ramah, jelas, akademis namun mudah dipahami mahasiswa.

`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 2048,
    });

    const reply = completion.choices[0].message.content;

    // Buat judul ringkas & to the point (cukup 1x saat chat baru)
    let generatedTitle = null;
    if (shouldUpdateTitle || isFirstMessage) {
      generatedTitle = extractSmartTitle(reply, prompt);
      console.log("🏷️ Auto-Title Final:", generatedTitle);
    }

    // Simpan ke SQLite
    if (db) {
      await db.run(
        "INSERT INTO chat_history (session_id, question, answer) VALUES (?, ?, ?)",
        [sessionId || null, prompt, reply]
      );

      if (sessionId && generatedTitle) {
        await db.run(
          `INSERT INTO chat_sessions (id, title, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP`,
          [sessionId, generatedTitle]
        );
      }
      console.log("💾 Riwayat chat berhasil disimpan ke SQLite.");
    }

    res.json({
      reply,
      title: generatedTitle,
    });
  } catch (error) {
    console.error("====================");
    console.error(error);
    console.error(error.response?.data);
    console.error("====================");

    res.status(500).json({
      reply: "Terjadi kesalahan saat menghubungi server Qwen di Google Colab.",
    });
  }
});

// ============================
// Endpoint Rename Judul Chat
// ============================
app.put("/chats/:id/title", async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Judul tidak boleh kosong." });
    }

    if (db) {
      await db.run(
        `INSERT INTO chat_sessions (id, title, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP`,
        [id, title.trim()]
      );
    }

    console.log(`✏️ Judul sesi [${id}] diubah menjadi: ${title.trim()}`);
    res.json({ success: true, id, title: title.trim() });
  } catch (error) {
    console.error("Gagal rename judul:", error);
    res.status(500).json({ error: "Gagal mengubah judul di database." });
  }
});

// ============================
// Endpoint Hapus Sesi Chat
// ============================
app.delete("/chats/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (db) {
      await db.run("DELETE FROM chat_sessions WHERE id = ?", [id]);
      await db.run("DELETE FROM chat_history WHERE session_id = ?", [id]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Gagal menghapus sesi chat." });
  }
});

// ============================
// Endpoint Cek Isi Database SQLite
// ============================
app.get("/history", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: "Database belum siap." });
    }
    const rows = await db.all(
      "SELECT * FROM chat_history ORDER BY created_at DESC"
    );
    const sessions = await db.all(
      "SELECT * FROM chat_sessions ORDER BY updated_at DESC"
    );
    res.json({
      total: rows.length,
      sessions,
      data: rows,
    });
  } catch (error) {
    res.status(500).json({ error: "Gagal mengambil data dari SQLite." });
  }
});

// ============================
// Jalankan Server
// ============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Backend berjalan di http://localhost:${PORT}`);
});
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { initDB } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

// ============================
// Inisialisasi Database PostgreSQL (Neon.tech)
// ============================
let db;
async function getDB() {
  if (!db) {
    try {
      db = await initDB();
    } catch (err) {
      console.error("❌ Gagal menghubungkan PostgreSQL:", err.message);
    }
  }
  return db;
}

// ============================
// Kumpulan Multi-API Key Groq (Untuk Teks)
// ============================
function getGroqApiKeys() {
  const keysFromList = (process.env.GROQ_API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const individualKeys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ]
    .map((k) => (k || "").trim())
    .filter(Boolean);

  return [...new Set([...keysFromList, ...individualKeys])];
}

let groqRoundRobinIndex = 0;

function getOrderedGroqClients() {
  const keys = getGroqApiKeys();
  if (keys.length === 0) return [];

  const startIdx = groqRoundRobinIndex % keys.length;
  groqRoundRobinIndex = (groqRoundRobinIndex + 1) % keys.length;

  const rotatedKeys = [
    ...keys.slice(startIdx),
    ...keys.slice(0, startIdx),
  ];

  return rotatedKeys.map((apiKey, i) => ({
    label: `Groq Key #${((startIdx + i) % keys.length) + 1}`,
    client: new OpenAI({
      baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      apiKey,
      maxRetries: 0,
    }),
  }));
}

// ============================
// Fungsi Helper: Ekstrak Judul Ringkas & To The Point dari Balasan AI
// ============================
function extractSmartTitle(aiReply, userPrompt, mode = "database") {
  if (
    mode === "database" &&
    aiReply.startsWith("Maaf, saya adalah **StudyMate AI**")
  ) {
    return "Topik di Luar Basis Data";
  }

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

  const fallbackDefault =
    mode === "general" ? "Obrolan Umum" : "Analisis Gambar ERD";

  const cleanedPrompt = (userPrompt || fallbackDefault)
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

  const words = (cleanedPrompt || userPrompt || fallbackDefault)
    .split(/\s+/)
    .slice(0, 4)
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const QUIZ_RULES_PROMPT = `
ATURAN MODE QUIZ INTERAKTIF (WAJIB DIPATUHI):
1. Jika pengguna meminta dibuatkan quiz, kuis, soal latihan, atau pilihan ganda:
   - HANYA tampilkan daftar soal dan pilihan jawaban (A, B, C, D atau A–E) terlebih dahulu.
   - DILARANG KERAS menampilkan kunci jawaban, tanda centang, jawaban benar, atau pembahasan sebelum pengguna mengirimkan jawabannya.
   - Gunakan format bernomor yang rapi dan konsisten seperti ini untuk setiap soal:
     1. Teks pertanyaan nomor 1?
     A. Pilihan A
     B. Pilihan B
     C. Pilihan C
     D. Pilihan D
2. Jika pengguna mengirimkan rekap jawaban mereka (misalnya diawali dengan "Ini jawaban quiz saya..."):
   - Periksa seluruh jawaban berdasarkan soal quiz yang diberikan sebelumnya.
   - Tampilkan **Skor Nilai** (skala 0–100) di bagian paling atas.
   - Tampilkan **Rekap Jumlah Benar & Salah** (contoh: Benar 4 dari 5 soal, Salah 1 soal).
   - Berikan evaluasi dan pembahasan singkat untuk setiap nomor (tandai Benar ✅ atau Salah ❌ beserta jawaban yang seharusnya).
`;

const DATABASE_SYSTEM_PROMPT = `
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
2. Jika pengguna bertanya atau mengunggah gambar tentang topik DI LUAR mata kuliah Basis Data (misalnya politik, olahraga, hiburan, resep masakan, sejarah umum, atau mata kuliah lain seperti jaringan komputer, fisika, kalkulus, dll.), kamu WAJIB menolak dengan sopan menggunakan kalimat berikut:
   "Maaf, saya adalah **StudyMate AI** yang dirancang khusus untuk membantu pembelajaran mata kuliah **Basis Data (Database Systems)**. Silakan ajukan pertanyaan seputar konsep database, ERD, normalisasi, query SQL, atau sistem manajemen basis data."

${QUIZ_RULES_PROMPT}

ATURAN FORMAT JAWABAN:
Jawablah menggunakan Markdown yang rapi, ringkas, padat, dan langsung ke inti:
# Judul
## Subjudul
### Penjelasan
- Bullet Point
1. Langkah Pertama
**Gunakan bold untuk istilah penting.**
> Gunakan blockquote untuk catatan penting.

- Jika membuat tabel data (seperti contoh tabel 1NF, 2NF, 3NF, atau hasil query), WAJIB gunakan format tabel Markdown standar dengan setiap baris dipisah baris baru (newline), dilarang menggabungkan baris dengan "||", dan beri baris kosong sebelum serta sesudah tabel:

| Kolom_1 | Kolom_2 |
| :--- | :--- |
| Data 1 | Data 2 |

- Pastikan setiap kalimat, contoh kode, dan bagian Kesimpulan selesai sepenuhnya tanpa terpotong di tengah kalimat.

Jika menjelaskan konsep Basis Data (bukan mode quiz), sertakan:
- **Pengertian**
- **Penjelasan sederhana**
- **Contoh** (sertakan contoh query SQL atau skema tabel singkat jika relevan)
- **Kesimpulan**

Gunakan bahasa Indonesia yang ramah, jelas, akademis namun mudah dipahami mahasiswa.
`;

const GENERAL_SYSTEM_PROMPT = `
Kamu adalah **StudyMate General**, asisten AI serba bisa yang cerdas, ramah, kreatif, dan membantu pengguna dalam berbagai topik dan kebutuhan apa pun—mulai dari pemrograman (JavaScript, Python, Java, React, Node.js, C++, dll.), jaringan komputer, penulisan, ringkasan materi, analisis gambar, pemecahan masalah, hingga diskusi umum sehari-hari.

${QUIZ_RULES_PROMPT}

ATURAN FORMAT JAWABAN:
Jawablah menggunakan Markdown yang rapi, jelas, terstruktur, dan langsung ke inti:
# Judul
## Subjudul
### Penjelasan
- Bullet Point
1. Langkah Pertama
**Gunakan bold untuk istilah penting.**
> Gunakan blockquote untuk catatan penting.

- Jika membuat tabel data, WAJIB gunakan format tabel Markdown standar dengan setiap baris dipisah baris baru (newline), dilarang menggabungkan baris dengan "||", dan beri baris kosong sebelum serta sesudah tabel:

| Kolom_1 | Kolom_2 |
| :--- | :--- |
| Data 1 | Data 2 |

- Pastikan setiap penjelasan dan contoh kode selesai sepenuhnya tanpa terpotong di tengah kalimat.
- Gunakan bahasa Indonesia yang natural, komunikatif, dan mudah dipahami (atau sesuaikan dengan bahasa yang digunakan pengguna).
`;

// ============================
// Chat Endpoint (Hybrid: Gemini Multi-Vision Stream + Multi-Key Groq | Dual Mode)
// ============================
app.post("/chat", async (req, res) => {
  const {
    prompt,
    image,
    images = [],
    history = [],
    sessionId,
    shouldUpdateTitle,
    isFirstMessage,
    isEdited,
    mode = "database",
  } = req.body;

  const activeMode = mode === "general" ? "general" : "database";
  const activeSystemPrompt =
    activeMode === "general" ? GENERAL_SYSTEM_PROMPT : DATABASE_SYSTEM_PROMPT;

  const rawImages =
    Array.isArray(images) && images.length > 0
      ? images
      : image
      ? [image]
      : [];
  const hasImages = rawImages.length > 0;

  const userTypedPrompt = (prompt && prompt.trim()) || "";
  const defaultImagePrompt =
    rawImages.length > 1
      ? activeMode === "general"
        ? `Analisis dan jelaskan ke-${rawImages.length} gambar yang dikirimkan pengguna ini secara lengkap, jelas, dan terstruktur.`
        : `Analisis dan jelaskan ke-${rawImages.length} gambar Basis Data yang dikirimkan pengguna ini secara lengkap dan terstruktur.`
      : activeMode === "general"
      ? "Analisis dan jelaskan gambar yang dikirimkan pengguna ini secara lengkap, jelas, dan terstruktur."
      : "Analisis dan jelaskan gambar Basis Data yang dikirimkan pengguna ini secara lengkap dan terstruktur.";

  const aiInstructionPrompt =
    userTypedPrompt || (hasImages ? defaultImagePrompt : "");

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let responseClosed = false;
  res.on("close", () => {
    responseClosed = true;
  });

  try {
    if (hasImages && !process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY belum diatur di Environment Variables Vercel / .env."
      );
    }

    const formattedHistory = Array.isArray(history)
      ? history
          .slice(-8)
          .filter((m) => m && m.text)
          .map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
          }))
      : [];

    let fullReply = "";

    if (hasImages) {
      const inlineImageParts = rawImages.map((imgStr, idx) => {
        const matches = String(imgStr).match(
          /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
        );
        if (!matches) {
          throw new Error(`Format gambar ke-${idx + 1} tidak valid.`);
        }
        return {
          inline_data: {
            mime_type: matches[1],
            data: matches[2],
          },
        };
      });

      const historyContext = formattedHistory
        .map((m) => `${m.role === "user" ? "Pengguna" : "AI"}: ${m.content}`)
        .join("\n");

      const combinedPrompt = historyContext
        ? `${activeSystemPrompt}\n\nRiwayat percakapan sebelumnya:\n${historyContext}\n\nInstruksi / Pertanyaan Pengguna saat ini:\n${aiInstructionPrompt}`
        : `${activeSystemPrompt}\n\nInstruksi / Pertanyaan Pengguna:\n${aiInstructionPrompt}`;

      // Langsung gunakan model aktif tercepat tanpa membuang waktu mencoba model 3.5 yang 404
      const geminiModels = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
      ];

      let geminiSuccess = false;
      let lastErrMsg = "Gagal menghubungi Gemini Vision.";

      for (const modelName of geminiModels) {
        try {
          console.log(
            `Streaming ${rawImages.length} gambar ke Gemini (${modelName}) [mode: ${activeMode}]...`
          );
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [{ text: combinedPrompt }, ...inlineImageParts],
                  },
                ],
                generationConfig: {
                  temperature: activeMode === "general" ? 0.6 : 0.4,
                  maxOutputTokens: 4096,
                },
              }),
            }
          );

          if (!geminiRes.ok || !geminiRes.body) {
            const errData = await geminiRes.json().catch(() => ({}));
            lastErrMsg =
              errData?.error?.message || `HTTP ${geminiRes.status}`;
            console.warn(`⚠️ ${modelName} gagal: ${lastErrMsg}`);
            continue;
          }

          const reader = geminiRes.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (responseClosed) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const dataStr = trimmed.slice(6);
              if (dataStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(dataStr);
                const chunkText =
                  parsed?.candidates?.[0]?.content?.parts
                    ?.map((p) => p.text || "")
                    .join("") || "";
                if (chunkText) {
                  fullReply += chunkText;
                  res.write(`data: ${JSON.stringify({ token: chunkText })}\n\n`);
                }
              } catch {
                // Abaikan chunk parsial
              }
            }
          }

          if (fullReply) {
            geminiSuccess = true;
            break;
          }
        } catch (err) {
          lastErrMsg = err.message;
          console.warn(`⚠️ Error ${modelName}:`, err.message);
        }
      }

      if (!geminiSuccess && !responseClosed) {
        throw new Error(lastErrMsg);
      }
    } else {
      const groqClients = getOrderedGroqClients();
      if (groqClients.length === 0) {
        throw new Error(
          "GROQ_API_KEY atau GROQ_API_KEYS belum diatur di Environment Variables."
        );
      }

      let groqSuccess = false;
      let lastGroqError = "Semua API key Groq sedang mencapai batas limit.";

      for (const { label, client } of groqClients) {
        try {
          console.log(
            `Prompt (llama-3.3-70b-versatile via ${label}) [mode: ${activeMode}]:`,
            aiInstructionPrompt
          );
          const stream = await client.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: activeSystemPrompt },
              ...formattedHistory,
              { role: "user", content: aiInstructionPrompt },
            ],
            temperature: activeMode === "general" ? 0.65 : 0.5,
            max_tokens: 4096,
            stream: true,
          });

          for await (const chunk of stream) {
            if (responseClosed) break;
            const token = chunk.choices[0]?.delta?.content || "";
            if (token) {
              fullReply += token;
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
            }
          }

          groqSuccess = true;
          break;
        } catch (err) {
          lastGroqError =
            err?.error?.message || err?.message || "Gagal menghubungi Groq API.";
          console.warn(
            `⚠️ ${label} gagal (${lastGroqError}), mencoba key berikutnya...`
          );

          if (fullReply.length > 0) {
            groqSuccess = true;
            break;
          }
        }
      }

      if (!groqSuccess && !responseClosed) {
        throw new Error(lastGroqError);
      }
    }

    if (responseClosed) {
      res.end();
      return;
    }

    let generatedTitle = null;
    if (shouldUpdateTitle || isFirstMessage) {
      generatedTitle = extractSmartTitle(
        fullReply,
        userTypedPrompt,
        activeMode
      );
      console.log(`🏷️ Auto-Title Final [${activeMode}]:`, generatedTitle);
    }

    // Simpan ke PostgreSQL (Neon.tech)
    const database = await getDB();
    if (database && fullReply.trim()) {
      if (isEdited && sessionId) {
        await database.query("DELETE FROM chat_history WHERE session_id = $1", [
          String(sessionId),
        ]);
        for (let i = 0; i < formattedHistory.length; i += 2) {
          const q = formattedHistory[i]?.content || "";
          const a = formattedHistory[i + 1]?.content || "";
          if (q || a) {
            await database.query(
              "INSERT INTO chat_history (session_id, mode, question, answer) VALUES ($1, $2, $3, $4)",
              [String(sessionId), activeMode, q, a]
            );
          }
        }
      }

      const imageTag =
        rawImages.length > 1
          ? `[Lampiran ${rawImages.length} Gambar]`
          : "[Lampiran Gambar]";

      const savedQuestion = hasImages
        ? userTypedPrompt
          ? `${imageTag} ${userTypedPrompt}`
          : imageTag
        : userTypedPrompt;

      await database.query(
        "INSERT INTO chat_history (session_id, mode, question, answer) VALUES ($1, $2, $3, $4)",
        [
          sessionId ? String(sessionId) : null,
          activeMode,
          savedQuestion,
          fullReply,
        ]
      );

      if (sessionId && generatedTitle) {
        await database.query(
          `INSERT INTO chat_sessions (id, title, mode, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, mode = EXCLUDED.mode, updated_at = CURRENT_TIMESTAMP`,
          [String(sessionId), generatedTitle, activeMode]
        );
      }
      console.log(
        `💾 Riwayat chat [${activeMode}] berhasil disimpan ke PostgreSQL.`
      );
    }

    res.write(
      `data: ${JSON.stringify({ done: true, title: generatedTitle })}\n\n`
    );
    res.end();
  } catch (error) {
    if (responseClosed) {
      res.end();
      return;
    }
    console.error("====================");
    console.error(error);
    console.error(error.response?.data);
    console.error("====================");

    const detailError =
      error?.error?.message ||
      error?.response?.data?.error?.message ||
      error.message ||
      "Terjadi kesalahan saat menghubungi server AI.";

    res.write(
      `data: ${JSON.stringify({
        error: `Error AI: ${detailError}`,
      })}\n\n`
    );
    res.end();
  }
});

// ============================
// Endpoint Rename Judul Chat
// ============================
app.put("/chats/:id/title", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, mode = "database" } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Judul tidak boleh kosong." });
    }

    const database = await getDB();
    if (database) {
      await database.query(
        `INSERT INTO chat_sessions (id, title, mode, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = CURRENT_TIMESTAMP`,
        [String(id), title.trim(), mode === "general" ? "general" : "database"]
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
    const database = await getDB();
    if (database) {
      await database.query("DELETE FROM chat_sessions WHERE id = $1", [
        String(id),
      ]);
      await database.query("DELETE FROM chat_history WHERE session_id = $1", [
        String(id),
      ]);
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Gagal menghapus sesi chat:", error);
    res.status(500).json({ error: "Gagal menghapus sesi chat." });
  }
});

// ============================
// Endpoint Cek Isi Database PostgreSQL
// ============================
app.get("/history", async (req, res) => {
  try {
    const database = await getDB();
    if (!database) {
      return res.status(500).json({ error: "Database belum siap." });
    }
    const historyResult = await database.query(
      "SELECT * FROM chat_history ORDER BY created_at DESC"
    );
    const sessionsResult = await database.query(
      "SELECT * FROM chat_sessions ORDER BY updated_at DESC"
    );
    res.json({
      total: historyResult.rows.length,
      sessions: sessionsResult.rows,
      data: historyResult.rows,
    });
  } catch (error) {
    console.error("Gagal mengambil data dari PostgreSQL:", error);
    res.status(500).json({ error: "Gagal mengambil data dari PostgreSQL." });
  }
});

// ============================
// Sajikan Frontend Web (Hanya untuk Lokal / Non-Vercel)
// ============================
if (process.env.VERCEL !== "1") {
  const frontendDistPath = path.join(__dirname, "../dist");
  app.use(express.static(frontendDistPath));

  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

// ============================
// Helper: Ambil IP Lokal Wi-Fi/LAN
// ============================
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// ============================
// Jalankan Web Server (Lokal) & Export untuk Vercel
// ============================
const PORT = process.env.PORT || 3000;

if (process.env.VERCEL !== "1") {
  app.listen(PORT, "0.0.0.0", () => {
    const localIP = getLocalIP();
    console.log("==================================================");
    console.log(`🚀 Server Web StudyMate-AI Dual Mode aktif!`);
    console.log(`💻 Akses Lokal   : http://localhost:${PORT}`);
    console.log(`📱 Akses Wi-Fi   : http://${localIP}:${PORT}`);
    console.log("==================================================");
  });
}

export default app;
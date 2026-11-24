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
// Kumpulan Multi-API Key Groq & Daftar Auto-Fallback Model Qwen
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

function getGroqQwenModels() {
  const envModels = (process.env.GROQ_QWEN_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
    .filter((m) => !m.includes("qwq"));

  if (envModels.length > 0) {
    // Pastikan qwen/qwen3-32b dicoba lebih dulu jika ada, agar jawaban panjang selesai 1x jalan
    const sorted = [...new Set(envModels)].sort((a, b) => {
      if (a.includes("qwen3-32b")) return -1;
      if (b.includes("qwen3-32b")) return 1;
      return 0;
    });
    return sorted;
  }

  // qwen/qwen3-32b di urutan pertama karena batas OTPM-nya jauh lebih besar (tidak kepotong di 900 token)
  return [
    "qwen/qwen3-32b",
    "qwen/qwen3.8-27b",
  ];
}

function getSafeMaxTokensForModel(modelName) {
  const lower = String(modelName || "").toLowerCase();
  if (lower.includes("qwen3.8-27b")) {
    return 920; // Batas OTPM free tier Groq untuk model ini = 1000
  }
  return 6000;
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
      timeout: 15000,
    }),
  }));
}

// ============================
// Helper: Batasi Ukuran History Agar Tidak Melebihi ITPM Groq
// ============================
function trimHistoryByBudget(historyList, maxChars = 11500) {
  if (!Array.isArray(historyList) || historyList.length === 0) return [];

  const selected = [];
  let usedChars = 0;

  for (let i = historyList.length - 1; i >= 0; i--) {
    const item = historyList[i];
    if (!item || !item.text) continue;

    const role = item.sender === "user" ? "user" : "assistant";
    let content = String(item.text)
      .replace(/<!--\s*ANSWER_KEY:[\s\S]*?-->/gi, "")
      .trim();

    if (content.length > 6500) {
      content = content.slice(0, 6500) + "\n...[dipersingkat]";
    }

    if (usedChars + content.length > maxChars && selected.length >= 2) {
      break;
    }

    selected.unshift({ role, content });
    usedChars += content.length;
  }

  return selected;
}

// ============================
// Fungsi Helper: Ekstrak Judul Ringkas & To The Point dari Balasan AI
// ============================
function extractSmartTitle(aiReply, userPrompt, mode = "database") {
  const cleanReply = aiReply
    .replace(/<!--\s*ANSWER_KEY:[\s\S]*?-->/gi, "")
    .trim();

  if (
    mode === "database" &&
    cleanReply.startsWith("Maaf, saya adalah **StudyMate AI**")
  ) {
    return "Topik di Luar Basis Data";
  }

  const headingMatch = cleanReply.match(/^#{1,3}\s+(.+)$/m);
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
   - Pastikan setiap pertanyaan memiliki tepat SATU jawaban yang benar dan akurat secara akademis.
   - Jangan tampilkan kunci jawaban atau pembahasan di dalam teks soal untuk pengguna.
   - Gunakan format bernomor yang rapi dan konsisten seperti ini untuk setiap soal:
     1. Teks pertanyaan nomor 1?
     A. Pilihan A
     B. Pilihan B
     C. Pilihan C
     D. Pilihan D
   - WAJIB di baris paling akhir setelah seluruh soal selesai, sertakan kunci jawaban dalam format komentar HTML JSON persis seperti berikut (jangan beri teks lain sesudahnya):
     <!-- ANSWER_KEY: {"1":"B","2":"A","3":"D","4":"C","5":"A"} -->
2. Jika pengguna mengirimkan hasil evaluasi quiz dengan skor dan status Benar/Salah yang sudah dihitung sistem:
   - WAJIB gunakan persis angka Skor Nilai, Jumlah Benar, Jumlah Salah, dan status ✅/❌ yang diberikan sistem tanpa mengubah angkanya sedikit pun.
   - Berikan pembahasan singkat dan jelas untuk setiap nomor berdasarkan kunci jawaban resmi yang tercantum.
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
// Helper: Streaming Gemini Native (Cepat Tanpa Hang + Auto-Continue)
// ============================
async function streamFromGemini({
  activeSystemPrompt,
  formattedHistory,
  aiInstructionPrompt,
  inlineImageParts = [],
  existingPartialReply = "",
  activeMode = "database",
  onToken,
  isResponseClosed = () => false,
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY belum diatur di Environment Variables.");
  }

  const historyContext = formattedHistory
    .map((m) => `${m.role === "user" ? "Pengguna" : "AI"}: ${m.content}`)
    .join("\n");

  const basePrompt = historyContext
    ? `${activeSystemPrompt}\n\nRiwayat percakapan sebelumnya:\n${historyContext}\n\nInstruksi / Pertanyaan Pengguna saat ini:\n${aiInstructionPrompt}`
    : `${activeSystemPrompt}\n\nInstruksi / Pertanyaan Pengguna:\n${aiInstructionPrompt}`;

  const geminiModels = [
    "gemini-2.5-flash",
    "gemini-3.8-flash",
    "gemini-2.5-flash-lite",
  ];

  let collectedReply = existingPartialReply || "";
  let lastErrMsg = "Gagal menghubungi Gemini API.";

  for (const modelName of geminiModels) {
    if (isResponseClosed()) break;

    try {
      const isResuming = collectedReply.length > 0;
      const tailSnippet = collectedReply.slice(-500);

      const contentsPayload = !isResuming
        ? [
            {
              role: "user",
              parts: [{ text: basePrompt }, ...inlineImageParts],
            },
          ]
        : [
            {
              role: "user",
              parts: [
                {
                  text: `Permintaan awal: ${aiInstructionPrompt}\n\nJawaban sebelumnya terpotong pada bagian akhir berikut:\n"""\n${tailSnippet}\n"""\n\nLanjutkan langsung persis setelah potongan teks di atas hingga selesai tuntas (jangan ulangi teks yang sudah tertulis).`,
                },
              ],
            },
          ];

      console.log(
        `Streaming ke Gemini Native (${modelName}, resume=${isResuming}) [mode: ${activeMode}]...`
      );

      const generationConfig = {
        temperature: activeMode === "general" ? 0.6 : 0.4,
        maxOutputTokens: 8192,
      };

      // Nonaktifkan thinking budget pada model 2.5-flash agar streaming dimulai < 1 detik & tidak memakan jatah token output
      if (modelName.includes("2.5-flash") && !modelName.includes("lite")) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(18000),
          body: JSON.stringify({
            contents: contentsPayload,
            generationConfig,
          }),
        }
      );

      if (!geminiRes.ok || !geminiRes.body) {
        const errData = await geminiRes.json().catch(() => ({}));
        lastErrMsg = errData?.error?.message || `HTTP ${geminiRes.status}`;
        console.warn(`⚠️ ${modelName} gagal: ${lastErrMsg}`);
        continue;
      }

      const reader = geminiRes.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        if (isResponseClosed()) {
          await reader.cancel().catch(() => {});
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

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
            const candidate = parsed?.candidates?.[0];
            const chunkText =
              candidate?.content?.parts
                ?.map((p) => p.text || "")
                .join("") || "";
            if (chunkText) {
              collectedReply += chunkText;
              onToken(chunkText);
            }
          } catch {
            // Abaikan chunk parsial
          }
        }
      }

      if (collectedReply.length > (existingPartialReply || "").length) {
        return collectedReply;
      }
    } catch (err) {
      lastErrMsg = err.message;
      console.warn(`⚠️ Error ${modelName}:`, err.message);
    }
  }

  if (collectedReply.length > 0) {
    return collectedReply;
  }

  throw new Error(lastErrMsg);
}

// ============================
// Chat Endpoint
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
  const heartbeatInterval = setInterval(() => {
    if (!responseClosed) {
      res.write(": ping\n\n");
    }
  }, 2500);

  res.on("close", () => {
    responseClosed = true;
    clearInterval(heartbeatInterval);
  });

  const emitToken = (tokenText) => {
    if (!responseClosed && tokenText) {
      res.write(`data: ${JSON.stringify({ token: tokenText })}\n\n`);
    }
  };

  try {
    const formattedHistory = trimHistoryByBudget(history, 11500);
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

      fullReply = await streamFromGemini({
        activeSystemPrompt,
        formattedHistory,
        aiInstructionPrompt,
        inlineImageParts,
        activeMode,
        onToken: emitToken,
        isResponseClosed: () => responseClosed,
      });
    } else {
      const groqClients = getOrderedGroqClients();
      const qwenModels = getGroqQwenModels();

      let groqCompleted = false;
      let needsContinuation = false;
      let lastGroqError = "Semua API key dan model Qwen Groq sedang mencapai batas limit.";

      if (groqClients.length > 0) {
        outerModelLoop: for (const modelName of qwenModels) {
          const safeMaxTokens = getSafeMaxTokensForModel(modelName);

          for (const { label, client } of groqClients) {
            if (responseClosed) break outerModelLoop;

            try {
              const isContinuing = fullReply.length > 0;
              const tailSnippet = fullReply.slice(-500);

              console.log(
                `Prompt (${modelName} | max_tokens=${safeMaxTokens} | continue=${isContinuing} via ${label}) [mode: ${activeMode}]`
              );

              const messagesPayload = !isContinuing
                ? [
                    { role: "system", content: activeSystemPrompt },
                    ...formattedHistory,
                    { role: "user", content: aiInstructionPrompt },
                  ]
                : [
                    { role: "system", content: activeSystemPrompt },
                    {
                      role: "user",
                      content: `Permintaan awal pengguna: ${aiInstructionPrompt}\n\nJawaban sebelumnya terpotong pada bagian akhir berikut:\n"""\n${tailSnippet}\n"""\n\nLanjutkan langsung persis setelah potongan teks di atas hingga selesai tuntas (jangan mengulang bagian yang sudah tertulis).`,
                    },
                  ];

              const stream = await client.chat.completions.create({
                model: modelName,
                messages: messagesPayload,
                temperature: activeMode === "general" ? 0.65 : 0.5,
                max_tokens: safeMaxTokens,
                stream: true,
              });

              let thinkBuffer = "";
              let finishedThinking = false;
              let finishReason = "";

              for await (const chunk of stream) {
                if (responseClosed) break;
                const choice = chunk.choices[0];
                if (choice?.finish_reason) {
                  finishReason = choice.finish_reason;
                }
                const rawToken = choice?.delta?.content || "";
                if (!rawToken) continue;

                if (!finishedThinking) {
                  thinkBuffer += rawToken;
                  const trimmedStart = thinkBuffer.trimStart();

                  if (trimmedStart.startsWith("<think>")) {
                    const closeIdx = thinkBuffer.indexOf("</think>");
                    if (closeIdx !== -1) {
                      const afterThink = thinkBuffer
                        .slice(closeIdx + 8)
                        .replace(/^\s+/, "");
                      finishedThinking = true;
                      thinkBuffer = "";
                      if (afterThink) {
                        fullReply += afterThink;
                        emitToken(afterThink);
                      }
                    }
                  } else if (trimmedStart.length >= 7) {
                    finishedThinking = true;
                    fullReply += thinkBuffer;
                    emitToken(thinkBuffer);
                    thinkBuffer = "";
                  }
                } else {
                  fullReply += rawToken;
                  emitToken(rawToken);
                }
              }

              if (!finishedThinking && thinkBuffer) {
                const cleanedLeftover = thinkBuffer
                  .replace(/<think>[\s\S]*?<\/think>/gi, "")
                  .trimStart();
                if (cleanedLeftover) {
                  fullReply += cleanedLeftover;
                  emitToken(cleanedLeftover);
                }
              }

              if (finishReason === "length" && fullReply.length > 0) {
                console.warn(
                  `⚠️ ${modelName} terpotong finish_reason=length, melanjutkan sisa jawaban...`
                );
                needsContinuation = true;
                break;
              }

              groqCompleted = true;
              needsContinuation = false;
              break outerModelLoop;
            } catch (err) {
              lastGroqError =
                err?.error?.message || err?.message || "Gagal menghubungi Groq API.";
              console.warn(
                `⚠️ ${modelName} (${label}) gagal (${lastGroqError}), mencoba fallback berikutnya...`
              );

              if (fullReply.length > 0) {
                needsContinuation = true;
              }

              const isModelLevelError =
                err?.status === 404 ||
                err?.status === 413 ||
                /request too large|does not exist|model_not_found|decommissioned|output tokens per minute/i.test(
                  lastGroqError
                );

              if (isModelLevelError) {
                break;
              }
            }
          }
        }
      }

      if (!groqCompleted && !responseClosed) {
        if (process.env.GEMINI_API_KEY) {
          console.warn(
            needsContinuation
              ? "⚠️ Menyambung sisa jawaban terpotong ke Gemini Native..."
              : "⚠️ Semua model Groq limit/gagal, beralih ke Gemini Native..."
          );
          try {
            fullReply = await streamFromGemini({
              activeSystemPrompt,
              formattedHistory,
              aiInstructionPrompt,
              inlineImageParts: [],
              existingPartialReply: fullReply,
              activeMode,
              onToken: emitToken,
              isResponseClosed: () => responseClosed,
            });
          } catch (geminiFallbackErr) {
            if (fullReply.length === 0) {
              throw geminiFallbackErr;
            }
          }
        } else if (fullReply.length === 0) {
          throw new Error(lastGroqError);
        }
      }
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

    clearInterval(heartbeatInterval);
    if (!responseClosed) {
      res.write(
        `data: ${JSON.stringify({ done: true, title: generatedTitle })}\n\n`
      );
    }
    res.end();
  } catch (error) {
    clearInterval(heartbeatInterval);
    console.error("====================");
    console.error(error);
    console.error("====================");

    if (!responseClosed) {
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
    }
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
// Endpoint Cek Isi Database PostgreSQL (Terisolasi Per Perangkat)
// ============================
app.get("/history", async (req, res) => {
  try {
    const database = await getDB();
    if (!database) {
      return res.status(500).json({ error: "Database belum siap." });
    }

    const rawIds = String(req.query.sessionIds || "").trim();
    if (!rawIds) {
      return res.json({
        total: 0,
        sessions: [],
        data: [],
      });
    }

    const sessionIds = rawIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (sessionIds.length === 0) {
      return res.json({
        total: 0,
        sessions: [],
        data: [],
      });
    }

    const historyResult = await database.query(
      "SELECT * FROM chat_history WHERE session_id = ANY($1::text[]) ORDER BY created_at DESC",
      [sessionIds]
    );
    const sessionsResult = await database.query(
      "SELECT * FROM chat_sessions WHERE id = ANY($1::text[]) ORDER BY updated_at DESC",
      [sessionIds]
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
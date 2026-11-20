import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ============================
// Koneksi ke LM Studio
// ============================

const client = new OpenAI({
  baseURL: "http://127.0.0.1:1234/v1",
  apiKey: "lm-studio",
});

// ============================
// Chat Endpoint
// ============================

app.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    console.log("Prompt:", prompt);

    const completion = await client.chat.completions.create({
      model: "qwen/qwen3-4b-2507",

      messages: [
        {
          role: "system",
          content: `
Kamu adalah StudyMate AI.

Tugasmu adalah menjadi tutor belajar untuk siswa SMP, SMA, dan Mahasiswa.

Jawablah menggunakan Markdown yang rapi.

Gunakan format berikut jika diperlukan:

# Judul

## Subjudul

### Penjelasan

- Bullet Point
- Bullet Point

1. Langkah Pertama
2. Langkah Kedua

**Gunakan bold untuk istilah penting.**

> Gunakan blockquote untuk catatan penting.

Jika menjelaskan konsep, berikan:
- Pengertian
- Penjelasan sederhana
- Contoh
- Kesimpulan

Gunakan bahasa Indonesia yang ramah, jelas, mudah dipahami, dan tidak terlalu kaku.
`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0.7,
      max_tokens: 512,
    });

    res.json({
      reply: completion.choices[0].message.content,
    });
  } catch (error) {
    console.error("====================");
    console.error(error);
    console.error(error.response?.data);
    console.error("====================");

    res.status(500).json({
      reply: "Terjadi kesalahan saat menghubungi LM Studio.",
    });
  }
});

// ============================
// Jalankan Server
// ============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Backend berjalan di http://localhost:${PORT}`);
});
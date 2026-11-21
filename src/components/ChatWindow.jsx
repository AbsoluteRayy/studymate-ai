import "./ChatWindow.css";
import ChatInput from "./ChatInput";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import jsPDF from "jspdf";
import { cleanMarkdown } from "../utils/markdown";

const DATABASE_QUICK_PROMPTS = [
  {
    title: "Normalisasi 1NF–3NF",
    desc: "Jelaskan tahapan normalisasi beserta contoh tabelnya",
    prompt:
      "Jelaskan tahapan normalisasi basis data dari 1NF, 2NF, hingga 3NF beserta contoh tabel sederhana.",
  },
  {
    title: "Perancangan ERD",
    desc: "Cara menentukan entitas, atribut, dan kardinalitas",
    prompt:
      "Bagaimana cara merancang ERD yang benar serta menentukan kardinalitas (1:1, 1:N, M:N)?",
  },
  {
    title: "Query SQL JOIN",
    desc: "Perbedaan INNER, LEFT, dan RIGHT JOIN",
    prompt:
      "Jelaskan perbedaan INNER JOIN, LEFT JOIN, dan RIGHT JOIN dalam SQL beserta contoh query-nya.",
  },
  {
    title: "Primary & Foreign Key",
    desc: "Konsep integritas referensial antar tabel",
    prompt:
      "Apa perbedaan Primary Key, Foreign Key, dan Candidate Key dalam sistem basis data relasional?",
  },
];

const GENERAL_QUICK_PROMPTS = [
  {
    title: "Bantu Coding & Debugging",
    desc: "Buatkan fungsi, komponen, atau perbaiki error kode",
    prompt:
      "Buatkan contoh fungsi JavaScript modern (ES6) untuk mengambil data dari REST API menggunakan async/await beserta penanganan error-nya.",
  },
  {
    title: "Rangkum & Jelaskan Materi",
    desc: "Pahami konsep rumit dengan penjelasan sederhana",
    prompt:
      "Jelaskan perbedaan arsitektur Monolithic dan Microservices secara sederhana beserta kelebihan dan kekurangannya.",
  },
  {
    title: "Brainstorming Ide Proyek",
    desc: "Susun konsep aplikasi, fitur, dan struktur kerjanya",
    prompt:
      "Berikan 3 ide proyek aplikasi web full-stack yang menarik untuk portofolio mahasiswa Teknik Informatika beserta stack teknologinya.",
  },
  {
    title: "Draft Email & Dokumen",
    desc: "Susun tulisan profesional, laporan, atau presentasi",
    prompt:
      "Buatkan kerangka presentasi yang menarik dan terstruktur untuk menjelaskan proyek aplikasi web kepada dosen penguji.",
  },
];

function formatMarkdownTables(text) {
  if (!text) return "";
  return text
    .replace(/^([^\n|]+?)\s+(\|[^|\n]+\|)/gm, "$1\n\n$2")
    .replace(/\|\s*\|\s*(?=[a-zA-Z0-9_:*(-])/g, "|\n|");
}

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);

  const codeElement = Array.isArray(children) ? children[0] : children;
  const className = codeElement?.props?.className || "";
  const match = /language-(\w+)/.exec(className);
  const language = match ? match[1] : "code";

  const rawCode = String(codeElement?.props?.children || "").replace(/\n$/, "");

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Gagal menyalin kode:", err);
    }
  }

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{language}</span>
        <button
          type="button"
          className={`code-copy-btn ${copied ? "copied" : ""}`}
          onClick={handleCopyCode}
          title="Salin kode"
        >
          {copied ? (
            <>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Tersalin</span>
            </>
          ) : (
            <>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2.5" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Salin kode</span>
            </>
          )}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function ChatWindow({
  isSidebarOpen,
  onToggleSidebar,
  messages,
  setMessages,
  chats,
  currentChatId,
  onUpdateTitle,
  onDeleteChat,
  aiMode,
}) {
  const chatAreaRef = useRef(null);
  const menuRef = useRef(null);
  const renameInputRef = useRef(null);

  const scrollPositionsRef = useRef({});
  const activeChatIdRef = useRef(currentChatId);

  const abortControllerRef = useRef(null);
  const typingIntervalRef = useRef(null);
  const tokenQueueRef = useRef("");
  const streamFinishedRef = useRef(false);
  const pendingTitleRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [streamingChatId, setStreamingChatId] = useState(null);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const [editingMsgIndex, setEditingMsgIndex] = useState(null);
  const [editingMsgText, setEditingMsgText] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [isCustomRenamed, setIsCustomRenamed] = useState(false);

  const isGeneral = aiMode === "general";
  const activeQuickPrompts = isGeneral
    ? GENERAL_QUICK_PROMPTS
    : DATABASE_QUICK_PROMPTS;

  const activeChat = chats.find((chat) => chat.id === currentChatId);
  const currentTitle = activeChat ? activeChat.title : "New Chat";

  useEffect(() => {
    const brandName = isGeneral ? "StudyMate General" : "StudyMate AI";
    if (!currentTitle || currentTitle === "New Chat") {
      document.title = brandName;
    } else {
      document.title = currentTitle;
    }
  }, [currentTitle, isGeneral]);

  // Sinkronkan warna background html/body & meta theme-color agar full edge-to-edge sampai bar gestur bawah HP
  useEffect(() => {
    let bgColor = "#1c1d2b"; // Basis Data Dark
    if (darkMode && isGeneral) {
      bgColor = "#1a1614"; // General Dark
    } else if (!darkMode && isGeneral) {
      bgColor = "#f7f4f1"; // General Light
    } else if (!darkMode && !isGeneral) {
      bgColor = "#f4f4f7"; // Basis Data Light
    }

    document.documentElement.style.backgroundColor = bgColor;
    document.body.style.backgroundColor = bgColor;

    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement("meta");
      metaTheme.name = "theme-color";
      document.head.appendChild(metaTheme);
    }
    metaTheme.setAttribute("content", bgColor);
  }, [darkMode, isGeneral]);

  useEffect(() => {
    function handleEscLightbox(e) {
      if (e.key === "Escape" && lightboxImage) {
        setLightboxImage(null);
      }
    }
    window.addEventListener("keydown", handleEscLightbox);
    return () => window.removeEventListener("keydown", handleEscLightbox);
  }, [lightboxImage]);

  function checkScrollPosition() {
    const el = chatAreaRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceFromBottom > 120);
  }

  function handleChatScroll() {
    if (chatAreaRef.current) {
      scrollPositionsRef.current[currentChatId] = chatAreaRef.current.scrollTop;
      checkScrollPosition();
    }
  }

  function handleScrollToBottom() {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTo({
        top: chatAreaRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  useLayoutEffect(() => {
    activeChatIdRef.current = currentChatId;
    const savedScrollTop = scrollPositionsRef.current[currentChatId] ?? 0;

    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = savedScrollTop;
      checkScrollPosition();
    }
    window.scrollTo(0, 0);
  }, [currentChatId]);

  useEffect(() => {
    checkScrollPosition();
  }, [messages]);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsRenaming(false);
    setIsCustomRenamed(false);
    setEditingMsgIndex(null);
    setEditingMsgText("");
    setRenameText(currentTitle);
  }, [currentChatId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  function handleStartRename() {
    setIsMenuOpen(false);
    setRenameText(currentTitle);
    setIsRenaming(true);
  }

  function handleConfirmRename() {
    setIsRenaming(false);
    if (renameText.trim() && renameText.trim() !== currentTitle) {
      setIsCustomRenamed(true);
      onUpdateTitle(currentChatId, renameText.trim(), true);
    } else {
      setRenameText(currentTitle);
    }
  }

  function handleRenameKeyDown(e) {
    if (e.key === "Enter") {
      handleConfirmRename();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
      setRenameText(currentTitle);
    }
  }

  function handleStopGenerating() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    tokenQueueRef.current = "";
    streamFinishedRef.current = true;
    setLoading(false);
    setStreamingChatId(null);
  }

  async function streamAIResponse(payload, targetChatId, prefixText = "") {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    tokenQueueRef.current = "";
    streamFinishedRef.current = false;
    pendingTitleRef.current = null;

    let displayedText = prefixText;
    let receivedAnyToken = false;

    const startTypewriterLoop = () => {
      if (typingIntervalRef.current) return;

      typingIntervalRef.current = setInterval(() => {
        if (tokenQueueRef.current.length > 0) {
          const step = tokenQueueRef.current.length > 350 ? 20 : 12;
          const nextSlice = tokenQueueRef.current.slice(0, step);
          tokenQueueRef.current = tokenQueueRef.current.slice(step);
          displayedText += nextSlice;

          setLoading(false);
          const currentText = displayedText;

          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].sender === "ai") {
              updated[lastIdx] = { ...updated[lastIdx], text: currentText };
            } else {
              updated.push({ sender: "ai", text: currentText });
            }
            return updated;
          });
        } else if (streamFinishedRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;

          if (!receivedAnyToken && !controller.signal.aborted) {
            setMessages((prev) => [
              ...prev,
              {
                sender: "ai",
                text: "Maaf, tidak ada respons yang diterima dari server AI. Silakan coba kirim ulang.",
              },
            ]);
          }

          if (pendingTitleRef.current) {
            onUpdateTitle(targetChatId, pendingTitleRef.current, false);
            pendingTitleRef.current = null;
          }

          setLoading(false);
          setStreamingChatId(null);
        }
      }, 10);
    };

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Gagal terhubung ke server AI (HTTP ${response.status}).`);
      }

      startTypewriterLoop();

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data: ")) continue;

          const dataStr = line.slice(6);
          let parsed;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.token) {
            receivedAnyToken = true;
            tokenQueueRef.current += parsed.token;
          }

          if (parsed.done && parsed.title) {
            pendingTitleRef.current = parsed.title;
          }
        }
      }

      streamFinishedRef.current = true;
    } catch (err) {
      if (err.name === "AbortError") {
        streamFinishedRef.current = true;
        return;
      }
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      throw err;
    }
  }

  async function handleSend(prompt, image = null) {
    const targetChatId = currentChatId;
    const cleanPrompt = (prompt || "").trim();

    const userMessage = {
      sender: "user",
      text: cleanPrompt,
      image: image || null,
    };

    const previousHistory = messages.map((m) => ({
      sender: m.sender,
      text: m.text,
    }));

    const shouldUpdateTitle = !isCustomRenamed && currentTitle === "New Chat";

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setStreamingChatId(targetChatId);

    requestAnimationFrame(() => {
      if (chatAreaRef.current && activeChatIdRef.current === targetChatId) {
        chatAreaRef.current.scrollTo({
          top: chatAreaRef.current.scrollHeight,
          behavior: "smooth",
        });
        scrollPositionsRef.current[targetChatId] =
          chatAreaRef.current.scrollHeight;
      }
      window.scrollTo(0, 0);
    });

    try {
      await streamAIResponse(
        {
          prompt: cleanPrompt,
          image,
          history: previousHistory,
          sessionId: String(targetChatId),
          shouldUpdateTitle,
          mode: aiMode,
        },
        targetChatId
      );
    } catch (error) {
      setLoading(false);
      setStreamingChatId(null);
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text:
            error.message ||
            "Terjadi kesalahan saat menghubungi backend StudyMate AI.",
        },
      ]);
    }
  }

  function handleStartEditMessage(index, currentText) {
    setEditingMsgIndex(index);
    setEditingMsgText(currentText || "");
  }

  async function handleSaveEditMessage(index) {
    const trimmed = editingMsgText.trim();
    const originalMsg = messages[index];
    if (!originalMsg) return;

    if (!trimmed && !originalMsg.image) return;

    const updatedText = trimmed;
    const preservedImage = originalMsg.image || null;

    setEditingMsgIndex(null);
    setEditingMsgText("");

    const keptBefore = messages.slice(0, index);
    const editedUserMessage = {
      sender: "user",
      text: updatedText,
      image: preservedImage,
    };

    const targetChatId = currentChatId;
    const shouldUpdateTitle = !isCustomRenamed && index === 0;

    setMessages([...keptBefore, editedUserMessage]);
    setLoading(true);
    setStreamingChatId(targetChatId);

    const historyPayload = keptBefore.map((m) => ({
      sender: m.sender,
      text: m.text,
    }));

    try {
      await streamAIResponse(
        {
          prompt: updatedText,
          image: preservedImage,
          history: historyPayload,
          sessionId: String(targetChatId),
          shouldUpdateTitle,
          isEdited: true,
          mode: aiMode,
        },
        targetChatId
      );
    } catch (error) {
      setLoading(false);
      setStreamingChatId(null);
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text:
            error.message ||
            "Terjadi kesalahan saat memproses ulang pertanyaan.",
        },
      ]);
    }
  }

  const handleCopy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(cleanMarkdown(text));
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex(null);
      }, 2000);
    } catch (err) {
      console.error(err);
    }
  };

  async function handleGenerateQuiz(content) {
    const targetChatId = currentChatId;
    setLoading(true);
    setStreamingChatId(targetChatId);

    try {
      const domainLabel = isGeneral ? "materi" : "materi Basis Data";
      const prompt = `
Berdasarkan ${domainLabel} berikut:

${content}

Buatkan:

1. 5 soal pilihan ganda yang relevan dengan pembahasan di atas.
2. Setiap soal memiliki 4 opsi (A, B, C, D).
3. Sertakan kunci jawaban dan pembahasan singkat.
4. Gunakan Bahasa Indonesia.
5. Tingkat kesulitan sedang (level mahasiswa).
`;

      await streamAIResponse(
        {
          prompt,
          history: [],
          sessionId: String(targetChatId),
          shouldUpdateTitle: false,
          mode: aiMode,
        },
        targetChatId,
        isGeneral ? "# Quiz Latihan\n\n" : "# Quiz Basis Data\n\n"
      );
    } catch (err) {
      setLoading(false);
      setStreamingChatId(null);
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: "Gagal membuat quiz.",
        },
      ]);
    }
  }

  function handleExportPDF() {
    const doc = new jsPDF();
    const defaultName = isGeneral
      ? "StudyMate General"
      : "StudyMate Basis Data";
    const fileName = currentTitle || defaultName;

    let y = 20;
    doc.setFontSize(20);
    doc.text(
      isGeneral ? "StudyMate AI - General" : "StudyMate AI - Basis Data",
      20,
      y
    );
    y += 12;
    doc.setFontSize(11);
    doc.text(
      isGeneral
        ? "General AI Learning & Productivity Assistant"
        : "Database Systems Learning Assistant",
      20,
      y
    );
    y += 12;
    doc.line(20, y, 190, y);
    y += 10;

    messages.forEach((msg) => {
      const sender = msg.sender === "user" ? "PENGGUNA" : "STUDYMATE AI";
      doc.setFont(undefined, "bold");
      doc.text(sender, 20, y);
      y += 8;
      doc.setFont(undefined, "normal");

      const cleanText = cleanMarkdown(msg.text);
      const lines = doc.splitTextToSize(cleanText, 170);
      doc.text(lines, 20, y);
      y += lines.length * 7 + 8;

      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`${fileName}.pdf`);
  }

  const isBusy = loading || streamingChatId !== null;
  const isEmptyState = messages.length === 0 && !loading;

  return (
    <div className={`chat-window ${darkMode ? "dark" : "light"}`}>
      {/* TOP HEADER BAR */}
      <div className="chat-header">
        <div className="chat-header-left">
          {!isSidebarOpen && (
            <button
              className="header-sidebar-btn"
              onClick={onToggleSidebar}
              title="Tampilkan Sidebar"
              aria-label="Tampilkan Sidebar"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          )}

          <div className="header-title-wrapper" ref={menuRef}>
            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                className="header-rename-input"
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onBlur={handleConfirmRename}
                onKeyDown={handleRenameKeyDown}
              />
            ) : (
              <button
                type="button"
                className="chat-header-title"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                title="Klik untuk opsi obrolan"
              >
                <span className="header-title-label">{currentTitle}</span>
                <svg
                  className="header-dots-icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <circle cx="6" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="18" cy="12" r="2" />
                </svg>
              </button>
            )}

            {isMenuOpen && !isRenaming && (
              <div className="header-dropdown-menu">
                <button
                  type="button"
                  className="header-dropdown-item"
                  onClick={handleStartRename}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                  <span>Rename</span>
                </button>

                <button
                  type="button"
                  className="header-dropdown-item danger"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onDeleteChat(currentChatId);
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  <span>Delete Chat</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tombol Toggle Theme (Matahari / Bulan) */}
        <div className="chat-header-actions">
          <button
            className="theme-toggle-btn"
            onClick={() => setDarkMode(!darkMode)}
            title="Ganti tampilan Terang / Gelap"
            aria-label="Ganti tampilan Terang / Gelap"
          >
            {darkMode ? (
              <>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="4.5" />
                  <line x1="12" y1="2" x2="12" y2="4" />
                  <line x1="12" y1="20" x2="12" y2="22" />
                  <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                  <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                  <line x1="2" y1="12" x2="4" y2="12" />
                  <line x1="20" y1="12" x2="22" y2="12" />
                  <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
                  <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
                </svg>
                <span className="theme-toggle-label">Terang</span>
              </>
            ) : (
              <>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span className="theme-toggle-label">Gelap</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Wrapper Area Chat + Floating Scroll-to-Bottom Button */}
      <div className="chat-area-wrapper">
        <div
          className={`chat-area ${isEmptyState ? "empty-state" : ""}`}
          ref={chatAreaRef}
          onScroll={handleChatScroll}
        >
          {isEmptyState ? (
            <div className="welcome-container">
              <div className="welcome">
                <div className="welcome-badge">
                  {isGeneral
                    ? "General Mode • Asisten Serba Bisa"
                    : "Basis Data • Database Systems"}
                </div>
                <h1>
                  Welcome to{" "}
                  <span>
                    {isGeneral ? "StudyMate General" : "StudyMate AI"}
                  </span>
                </h1>
                {isGeneral ? (
                  <p className="welcome-subtitle">
                    Asisten AI serba bisa untuk segala kebutuhanmu. Tanyakan
                    seputar{" "}
                    <strong>
                      Coding, Penulisan, Analisis Gambar, Brainstorming,
                    </strong>{" "}
                    atau <strong>topik umum lainnya</strong>.
                  </p>
                ) : (
                  <p className="welcome-subtitle">
                    Asisten belajar khusus mata kuliah{" "}
                    <strong>Basis Data</strong>. Tanyakan seputar{" "}
                    <strong>ERD, Normalisasi (1NF–3NF), Relasi Tabel,</strong>{" "}
                    atau <strong>Query SQL</strong>.
                  </p>
                )}
              </div>

              <div className="quick-prompts-grid">
                {activeQuickPrompts.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="quick-prompt-card"
                    onClick={() => handleSend(item.prompt)}
                    disabled={isBusy}
                  >
                    <span className="quick-prompt-title">{item.title}</span>
                    <span className="quick-prompt-desc">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => {
                const isCurrentlyStreamingMsg =
                  streamingChatId === currentChatId &&
                  index === messages.length - 1 &&
                  msg.sender === "ai";

                if (msg.sender === "user") {
                  const isEditingThis = editingMsgIndex === index;

                  return (
                    <div key={index} className="message-row user">
                      {isEditingThis ? (
                        <div className="user-edit-box">
                          {msg.image && (
                            <img
                              src={msg.image}
                              alt="Lampiran"
                              className="user-message-image"
                            />
                          )}
                          <textarea
                            className="user-edit-textarea"
                            rows={3}
                            value={editingMsgText}
                            onChange={(e) => setEditingMsgText(e.target.value)}
                            autoFocus
                          />
                          <div className="user-edit-actions">
                            <button
                              type="button"
                              className="user-edit-cancel-btn"
                              onClick={() => setEditingMsgIndex(null)}
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              className="user-edit-save-btn"
                              onClick={() => handleSaveEditMessage(index)}
                              disabled={isBusy}
                            >
                              Simpan & Kirim Ulang
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="user-message-container">
                          <div className="user-message">
                            {msg.image && (
                              <img
                                src={msg.image}
                                alt="Gambar unggahan"
                                className="user-message-image"
                                style={{ marginBottom: msg.text ? "8px" : "0" }}
                                onClick={() => setLightboxImage(msg.image)}
                                title="Klik untuk memperbesar gambar"
                              />
                            )}
                            {msg.text && <div>{msg.text}</div>}
                          </div>

                          {!isBusy && (
                            <div className="user-message-toolbar">
                              <button
                                type="button"
                                className="user-edit-trigger-btn"
                                onClick={() =>
                                  handleStartEditMessage(index, msg.text)
                                }
                                title="Edit pesan ini"
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                </svg>
                                <span>Edit</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={index} className="message-row ai">
                    <div className="ai-message">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          pre: ({ children }) => (
                            <CodeBlock>{children}</CodeBlock>
                          ),
                        }}
                      >
                        {formatMarkdownTables(msg.text)}
                      </ReactMarkdown>

                      {!isCurrentlyStreamingMsg && (
                        <div className="message-toolbar">
                          <button
                            className="action-btn"
                            onClick={() => handleCopy(msg.text, index)}
                          >
                            {copiedIndex === index ? (
                              <>
                                <svg
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <svg
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.4"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect
                                    x="9"
                                    y="9"
                                    width="13"
                                    height="13"
                                    rx="2.5"
                                  />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          <button
                            className="action-btn"
                            onClick={() => handleGenerateQuiz(msg.text)}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                            <span>Quiz</span>
                          </button>

                          <button
                            className="action-btn"
                            onClick={handleExportPDF}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            <span>Export PDF</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && streamingChatId === currentChatId && (
                <div className="message-row ai">
                  <div className="typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!isEmptyState && showScrollBottom && (
          <button
            type="button"
            className="scroll-to-bottom-btn"
            onClick={handleScrollToBottom}
            title="Gulir ke pesan terbaru"
            aria-label="Gulir ke bawah"
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </button>
        )}
      </div>

      {lightboxImage && (
        <div
          className="image-lightbox-overlay"
          onClick={() => setLightboxImage(null)}
        >
          <img
            src={lightboxImage}
            alt="Tampilan penuh"
            className="image-lightbox-full"
          />
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        onStop={handleStopGenerating}
        isGenerating={isBusy}
        onPreviewImage={(imgUrl) => setLightboxImage(imgUrl)}
      />
    </div>
  );
}

export default ChatWindow;
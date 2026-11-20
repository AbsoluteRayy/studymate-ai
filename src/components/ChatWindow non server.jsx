import "./ChatWindow.css";
import ChatInput from "./ChatInput";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";
import { cleanMarkdown } from "../utils/markdown";

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false);

  // Ambil elemen <code> di dalam <pre> untuk mendapatkan bahasa & isi teks asli
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
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
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
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
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
}) {
  const chatEndRef = useRef(null);
  const menuRef = useRef(null);
  const renameInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [darkMode, setDarkMode] = useState(true);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [isCustomRenamed, setIsCustomRenamed] = useState(false);

  const activeChat = chats.find((chat) => chat.id === currentChatId);
  const currentTitle = activeChat ? activeChat.title : "New Chat";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsRenaming(false);
    setIsCustomRenamed(false);
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

  async function handleSend(prompt) {
    const userMessage = {
      sender: "user",
      text: prompt,
    };

    const updatedHistory = [...messages, userMessage];
    const shouldUpdateTitle = !isCustomRenamed && currentTitle === "New Chat";

    const conversationSummary = updatedHistory
      .slice(-6)
      .map((m) => `${m.sender === "user" ? "User" : "AI"}: ${m.text.substring(0, 150)}`)
      .join("\n");

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await fetch("http://localhost:3000/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          sessionId: String(currentChatId),
          conversationSummary,
          shouldUpdateTitle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.reply || "Gagal mendapatkan balasan");
      }

      const aiMessage = {
        sender: "ai",
        text: data.reply,
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (data.title) {
        onUpdateTitle(currentChatId, data.title, false);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: "Terjadi kesalahan saat menghubungi backend StudyMate AI.",
        },
      ]);
    }

    setLoading(false);
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
    setLoading(true);

    try {
      const prompt = `
Berdasarkan materi Basis Data berikut:

${content}

Buatkan:

1. 5 soal pilihan ganda khusus mata kuliah Basis Data.
2. Setiap soal memiliki 4 opsi (A, B, C, D).
3. Sertakan kunci jawaban dan pembahasan singkat.
4. Gunakan Bahasa Indonesia.
5. Tingkat kesulitan sedang (level mahasiswa Teknik Informatika).
`;

      const response = await fetch("http://localhost:3000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          sessionId: String(currentChatId),
          shouldUpdateTitle: false,
        }),
      });

      const data = await response.json();

      const quizMessage = {
        sender: "ai",
        text: `# Quiz Basis Data\n\n${data.reply}`,
      };

      setMessages((prev) => [...prev, quizMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: "Gagal membuat quiz.",
        },
      ]);
    }

    setLoading(false);
  }

  function handleExportPDF() {
    const doc = new jsPDF();
    const fileName = currentTitle || "StudyMate Basis Data";

    let y = 20;
    doc.setFontSize(20);
    doc.text("StudyMate AI - Basis Data", 20, y);
    y += 12;
    doc.setFontSize(11);
    doc.text("Database Systems Learning Assistant", 20, y);
    y += 12;
    doc.line(20, y, 190, y);
    y += 10;

    messages.forEach((msg) => {
      const sender = msg.sender === "user" ? "MAHASISWA" : "STUDYMATE AI";
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
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
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
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="5" cy="12" r="1" />
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
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
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
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
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

        {/* Tombol Toggle Theme Outline (Matahari / Bulan) */}
        <div className="chat-header-actions">
          <button
            className="theme-toggle-btn"
            onClick={() => setDarkMode(!darkMode)}
            title="Ganti tampilan Terang / Gelap"
          >
            {darkMode ? (
              <>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span>Terang</span>
              </>
            ) : (
              <>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span>Gelap</span>
              </>
            )}
          </button>
        </div>
      </div>

      {messages.length === 0 && (
        <div className="welcome">
          <h1>
            Welcome to <span>StudyMate AI</span>
          </h1>
          <p>
            Database Systems Learning Assistant — Asisten Belajar Mata Kuliah Basis Data
          </p>
        </div>
      )}

      <div className="chat-area">
        {messages.length === 0 && !loading ? (
          <div className="message-row ai">
            <div className="ai-message">
              Halo! Aku <strong>StudyMate AI</strong>, asisten belajar khusus mata kuliah <strong>Basis Data</strong>.
              <br />
              Tanyakan apa saja seputar <strong>ERD, Normalisasi (1NF–3NF), Relasi Tabel, atau Query SQL</strong>!
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => (
              <div key={index} className={`message-row ${msg.sender}`}>
                <div
                  className={
                    msg.sender === "user" ? "user-message" : "ai-message"
                  }
                >
                  <ReactMarkdown
                    components={{
                      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>

                  {msg.sender === "ai" && (
                    <div className="message-toolbar">
                      <button
                        className="action-btn"
                        onClick={() => handleCopy(msg.text, index)}
                      >
                        {copiedIndex === index ? (
                          <>
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
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
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
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
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
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
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
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
            ))}

            {loading && (
              <div className="message-row ai">
                <div className="typing">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            <div ref={chatEndRef}></div>
          </>
        )}
      </div>

      <ChatInput onSend={handleSend} disabled={loading} />
    </div>
  );
}

export default ChatWindow;
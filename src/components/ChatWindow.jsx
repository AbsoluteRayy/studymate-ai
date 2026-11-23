import "./ChatWindow.css";
import "./ChatHeader.css";
import "./ChatMessages.css";
import ChatInput from "./ChatInput";
import ChatHeader from "./ChatHeader";
import MessageBubble from "./MessageBubble";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cleanMarkdown } from "../utils/markdown";
import { exportChatToPDF } from "../utils/exportPdf";
import { useChatStream } from "../hooks/useChatStream";
import {
  DATABASE_QUICK_PROMPTS,
  GENERAL_QUICK_PROMPTS,
} from "../constants/quickPrompts";

function isQuizRequestPrompt(text) {
  if (!text) return false;
  if (/^ini jawaban quiz saya/i.test(text.trim())) return false;
  return /\b(quiz|kuis|pilihan\s+ganda|latihan\s+soal|buatkan\s+soal)\b/i.test(
    text
  );
}

function ChatWindow({
  isSidebarOpen,
  onToggleSidebar,
  messages,
  onUpdateChatMessages,
  chats,
  currentChatId,
  onUpdateTitle,
  onDeleteChat,
  aiMode,
  streamingStates,
  setStreamingStates,
}) {
  const chatAreaRef = useRef(null);
  const chatInputRef = useRef(null);
  const scrollPositionsRef = useRef({});
  const activeChatIdRef = useRef(currentChatId);
  const dragCounterRef = useRef(0);

  const [copiedIndex, setCopiedIndex] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [editingMsgIndex, setEditingMsgIndex] = useState(null);
  const [editingMsgText, setEditingMsgText] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);
  const [isCustomRenamed, setIsCustomRenamed] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const { streamAIResponse, stopGenerating } = useChatStream({
    onUpdateChatMessages,
    onUpdateTitle,
    setStreamingStates,
  });

  const isGeneral = aiMode === "general";
  const activeQuickPrompts = isGeneral
    ? GENERAL_QUICK_PROMPTS
    : DATABASE_QUICK_PROMPTS;

  const activeChat = chats.find(
    (chat) => String(chat.id) === String(currentChatId)
  );
  const currentTitle = activeChat ? activeChat.title : "New Chat";

  const currentStreamPhase = streamingStates?.[String(currentChatId)] || null;
  const isCurrentChatThinking =
    currentStreamPhase === "thinking" ||
    currentStreamPhase === "thinking-quiz";
  const isCurrentChatStreaming =
    currentStreamPhase === "streaming" ||
    currentStreamPhase === "streaming-quiz";
  const isCurrentChatBusy = Boolean(currentStreamPhase);

  useEffect(() => {
    const brandName = isGeneral ? "StudyMate General" : "StudyMate AI";
    document.title =
      !currentTitle || currentTitle === "New Chat" ? brandName : currentTitle;
  }, [currentTitle, isGeneral]);

  useEffect(() => {
    let bgColor = "#1c1d2b";
    if (darkMode && isGeneral) bgColor = "#1a1614";
    else if (!darkMode && isGeneral) bgColor = "#f7f4f1";
    else if (!darkMode && !isGeneral) bgColor = "#f4f4f7";

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
      if (e.key === "Escape" && lightboxImage) setLightboxImage(null);
    }
    window.addEventListener("keydown", handleEscLightbox);
    return () => window.removeEventListener("keydown", handleEscLightbox);
  }, [lightboxImage]);

  function checkScrollPosition() {
    const el = chatAreaRef.current;
    if (!el) return;
    setShowScrollBottom(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }

  function handleChatScroll() {
    if (chatAreaRef.current) {
      scrollPositionsRef.current[currentChatId] = chatAreaRef.current.scrollTop;
      checkScrollPosition();
    }
  }

  function handleScrollToBottom() {
    chatAreaRef.current?.scrollTo({
      top: chatAreaRef.current.scrollHeight,
      behavior: "smooth",
    });
  }

  useLayoutEffect(() => {
    activeChatIdRef.current = currentChatId;
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop =
        scrollPositionsRef.current[currentChatId] ?? 0;
      checkScrollPosition();
    }
    window.scrollTo(0, 0);
  }, [currentChatId]);

  useEffect(() => {
    checkScrollPosition();
  }, [messages]);

  useEffect(() => {
    setIsCustomRenamed(false);
    setEditingMsgIndex(null);
    setEditingMsgText("");
  }, [currentChatId]);

  function setChatThinking(targetChatId, active, isQuiz = false) {
    const idStr = String(targetChatId);
    setStreamingStates((prev) => {
      const next = { ...prev };
      if (active) {
        next[idStr] = isQuiz ? "thinking-quiz" : "thinking";
      } else {
        delete next[idStr];
      }
      return next;
    });
  }

  // ============================
  // Handler Drag-and-Drop Seluruh Area Chat
  // ============================
  function hasDraggedFiles(e) {
    return Array.from(e.dataTransfer?.types || []).includes("Files");
  }

  function handleWindowDragEnter(e) {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (!isCurrentChatBusy) {
      setIsDraggingOver(true);
    }
  }

  function handleWindowDragOver(e) {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = isCurrentChatBusy ? "none" : "copy";
    }
  }

  function handleWindowDragLeave(e) {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  }

  function handleWindowDrop(e) {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);

    if (isCurrentChatBusy) return;
    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      chatInputRef.current?.addFiles(droppedFiles);
    }
  }

  async function handleSend(prompt, images = []) {
    const targetChatId = String(currentChatId);
    const cleanPrompt = (prompt || "").trim();
    const imageList = Array.isArray(images)
      ? images
      : images
      ? [images]
      : [];
    const quizMode = isQuizRequestPrompt(cleanPrompt);

    const userMessage = {
      sender: "user",
      text: cleanPrompt,
      images: imageList,
    };

    const previousHistory = messages.map((m) => ({
      sender: m.sender,
      text: m.text,
    }));

    const shouldUpdateTitle = !isCustomRenamed && currentTitle === "New Chat";

    onUpdateChatMessages(
      targetChatId,
      (prev) => [...prev, userMessage],
      { mode: aiMode, title: "New Chat" }
    );
    setChatThinking(targetChatId, true, quizMode);

    requestAnimationFrame(() => {
      if (
        chatAreaRef.current &&
        String(activeChatIdRef.current) === targetChatId
      ) {
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
          images: imageList,
          history: previousHistory,
          sessionId: targetChatId,
          shouldUpdateTitle,
          mode: aiMode,
        },
        targetChatId,
        "",
        { isQuiz: quizMode }
      );
    } catch (error) {
      setChatThinking(targetChatId, false);
      onUpdateChatMessages(targetChatId, (prev) => [
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

  async function handleSaveEditMessage(index) {
    const trimmed = editingMsgText.trim();
    const originalMsg = messages[index];
    const preservedImages =
      Array.isArray(originalMsg?.images) && originalMsg.images.length > 0
        ? originalMsg.images
        : originalMsg?.image
        ? [originalMsg.image]
        : [];

    if (!originalMsg || (!trimmed && preservedImages.length === 0)) return;

    setEditingMsgIndex(null);
    setEditingMsgText("");

    const keptBefore = messages.slice(0, index);
    const editedUserMessage = {
      sender: "user",
      text: trimmed,
      images: preservedImages,
    };

    const targetChatId = String(currentChatId);
    const shouldUpdateTitle = !isCustomRenamed && index === 0;
    const quizMode = isQuizRequestPrompt(trimmed);

    onUpdateChatMessages(targetChatId, [...keptBefore, editedUserMessage], {
      mode: aiMode,
    });
    setChatThinking(targetChatId, true, quizMode);

    try {
      await streamAIResponse(
        {
          prompt: trimmed,
          images: preservedImages,
          history: keptBefore.map((m) => ({ sender: m.sender, text: m.text })),
          sessionId: targetChatId,
          shouldUpdateTitle,
          isEdited: true,
          mode: aiMode,
        },
        targetChatId,
        "",
        { isQuiz: quizMode }
      );
    } catch (error) {
      setChatThinking(targetChatId, false);
      onUpdateChatMessages(targetChatId, (prev) => [
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

  async function handleCopy(text, index) {
    try {
      await navigator.clipboard.writeText(cleanMarkdown(text));
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleGenerateQuiz(content) {
    const targetChatId = String(currentChatId);
    setChatThinking(targetChatId, true, true);

    try {
      const domainLabel = isGeneral ? "materi" : "materi Basis Data";
      const prompt = `Berdasarkan ${domainLabel} berikut:

${content}

Buatkan 5 soal latihan pilihan ganda dalam Bahasa Indonesia (tingkat kesulitan level mahasiswa).

ATURAN FORMAT WAJIB:
1. HANYA tampilkan pertanyaan dan pilihan jawaban (A, B, C, D).
2. DILARANG KERAS menampilkan kunci jawaban, tanda centang, atau pembahasan sekarang (tunggu pengguna mengumpulkan jawabannya terlebih dahulu).
3. Gunakan format persis seperti ini untuk setiap nomor:
1. Teks pertanyaan?
A. Pilihan A
B. Pilihan B
C. Pilihan C
D. Pilihan D`;

      await streamAIResponse(
        {
          prompt,
          history: [],
          sessionId: targetChatId,
          shouldUpdateTitle: false,
          mode: aiMode,
        },
        targetChatId,
        isGeneral ? "# Quiz Latihan\n\n" : "# Quiz Basis Data\n\n",
        { isQuiz: true }
      );
    } catch {
      setChatThinking(targetChatId, false);
      onUpdateChatMessages(targetChatId, (prev) => [
        ...prev,
        { sender: "ai", text: "Gagal membuat quiz." },
      ]);
    }
  }

  const isEmptyState = messages.length === 0 && !isCurrentChatBusy;

  const thinkingLabelText =
    currentStreamPhase === "thinking-quiz"
      ? "Sedang membuat soal quiz..."
      : isGeneral
      ? "StudyMate sedang berpikir..."
      : "Menganalisis struktur basis data...";

  return (
    <div
      className={`chat-window ${darkMode ? "dark" : "light"}`}
      onDragEnter={handleWindowDragEnter}
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
    >
      <ChatHeader
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={onToggleSidebar}
        currentTitle={currentTitle}
        currentChatId={currentChatId}
        onUpdateTitle={onUpdateTitle}
        onDeleteChat={onDeleteChat}
        onCustomRenamed={() => setIsCustomRenamed(true)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
      />

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
                    disabled={isCurrentChatBusy}
                  >
                    <span className="quick-prompt-title">{item.title}</span>
                    <span className="quick-prompt-desc">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => (
                <MessageBubble
                  key={index}
                  msg={msg}
                  index={index}
                  isBusy={isCurrentChatBusy}
                  isCurrentlyStreamingMsg={
                    isCurrentChatStreaming &&
                    index === messages.length - 1 &&
                    msg.sender === "ai"
                  }
                  isEditingThis={editingMsgIndex === index}
                  editingMsgText={editingMsgText}
                  setEditingMsgText={setEditingMsgText}
                  onStartEdit={(idx, txt) => {
                    setEditingMsgIndex(idx);
                    setEditingMsgText(txt || "");
                  }}
                  onCancelEdit={() => setEditingMsgIndex(null)}
                  onSaveEdit={handleSaveEditMessage}
                  copiedIndex={copiedIndex}
                  onCopy={handleCopy}
                  onGenerateQuiz={handleGenerateQuiz}
                  onSubmitQuizAnswers={handleSend}
                  onExportPDF={() =>
                    exportChatToPDF(messages, currentTitle, isGeneral)
                  }
                  onPreviewImage={(img) => setLightboxImage(img)}
                />
              ))}

              {isCurrentChatThinking && (
                <div className="message-row ai">
                  <div className="ai-thinking-wrapper anim-allow">
                    <div className="typing anim-allow">
                      <span className="anim-allow"></span>
                      <span className="anim-allow"></span>
                      <span className="anim-allow"></span>
                    </div>
                    <span className="ai-thinking-label anim-allow">
                      {thinkingLabelText}
                    </span>
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

      {isDraggingOver && (
        <div className="chat-drop-overlay">
          <div className="chat-drop-card">
            <div className="chat-drop-icon-circle">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="4" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <h3 className="chat-drop-title">Lepaskan Gambar di Sini</h3>
            <p className="chat-drop-sub">
              Seret 1 atau beberapa gambar sekaligus untuk melampirkan ke chat
            </p>
          </div>
        </div>
      )}

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
        ref={chatInputRef}
        onSend={handleSend}
        onStop={() => stopGenerating(currentChatId)}
        isGenerating={isCurrentChatBusy}
        onPreviewImage={(imgUrl) => setLightboxImage(imgUrl)}
      />
    </div>
  );
}

export default ChatWindow;
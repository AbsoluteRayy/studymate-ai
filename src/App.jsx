import { useCallback, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";
const STORAGE_CHATS_KEY = "studymate_chats_v3";
const STORAGE_OWNED_SESSIONS_KEY = "studymate_owned_sessions_v1";
const STORAGE_MODE_KEY = "studymate_ai_mode";

function loadSavedMode() {
  try {
    const saved = localStorage.getItem(STORAGE_MODE_KEY);
    return saved === "general" ? "general" : "database";
  } catch {
    return "database";
  }
}

function loadOwnedSessionIds() {
  try {
    const raw = localStorage.getItem(STORAGE_OWNED_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function registerOwnedSessionId(sessionId) {
  const idStr = String(sessionId);
  try {
    const current = loadOwnedSessionIds();
    if (!current.includes(idStr)) {
      localStorage.setItem(
        STORAGE_OWNED_SESSIONS_KEY,
        JSON.stringify([idStr, ...current])
      );
    }
  } catch {
    // Abaikan jika storage diblokir
  }
}

function unregisterOwnedSessionId(sessionId) {
  const idStr = String(sessionId);
  try {
    const current = loadOwnedSessionIds();
    const filtered = current.filter((id) => id !== idStr);
    localStorage.setItem(STORAGE_OWNED_SESSIONS_KEY, JSON.stringify(filtered));
  } catch {
    // Abaikan jika storage diblokir
  }
}

function loadSavedChats() {
  try {
    // Hapus cache lama v2 yang sempat tercampur riwayat global
    localStorage.removeItem("studymate_chats_v2");

    const raw = localStorage.getItem(STORAGE_CHATS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const ownedSet = new Set(loadOwnedSessionIds());
    return parsed.filter((chat) => ownedSet.has(String(chat.id)));
  } catch {
    return [];
  }
}

function persistChatsSafely(chatsList) {
  try {
    localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(chatsList));
  } catch {
    try {
      const lightweight = chatsList.map((chat, cIdx) => ({
        ...chat,
        messages: (chat.messages || []).map((m) =>
          cIdx > 2 ? { sender: m.sender, text: m.text } : m
        ),
      }));
      localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(lightweight));
    } catch {
      // Abaikan jika storage penuh/diblokir
    }
  }
}

function App() {
  const [aiMode, setAiMode] = useState(loadSavedMode);
  const [chats, setChats] = useState(loadSavedChats);
  const [currentChatId, setCurrentChatId] = useState(() =>
    String(Date.now())
  );
  const [streamingStates, setStreamingStates] = useState({});

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => window.innerWidth > 768
  );

  // Simpan mode terakhir (database / general)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MODE_KEY, aiMode);
    } catch {
      // Abaikan error storage
    }
  }, [aiMode]);

  // Simpan daftar obrolan perangkat ini ke localStorage
  useEffect(() => {
    persistChatsSafely(chats);
  }, [chats]);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Sinkronkan HANYA sesi milik perangkat ini dari PostgreSQL (memulihkan jawaban yang ditinggal saat tab ditutup)
  useEffect(() => {
    let isMounted = true;

    async function syncDeviceHistoryFromServer() {
      const ownedIds = loadOwnedSessionIds();
      if (ownedIds.length === 0) return;

      try {
        const query = encodeURIComponent(ownedIds.join(","));
        const res = await fetch(`${API_BASE_URL}/history?sessionIds=${query}`);
        if (!res.ok) return;

        const payload = await res.json();
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        const rows = Array.isArray(payload.data) ? payload.data : [];

        if (rows.length === 0 && sessions.length === 0) return;

        const ownedSet = new Set(ownedIds);
        const chronologicalRows = [...rows].reverse();
        const messagesBySession = {};

        for (const row of chronologicalRows) {
          const sid = row.session_id ? String(row.session_id) : null;
          if (!sid || !ownedSet.has(sid)) continue;

          if (!messagesBySession[sid]) {
            messagesBySession[sid] = [];
          }
          if (row.question) {
            messagesBySession[sid].push({
              sender: "user",
              text: row.question,
            });
          }
          if (row.answer) {
            messagesBySession[sid].push({
              sender: "ai",
              text: row.answer,
            });
          }
        }

        const sessionMetaMap = {};
        for (const s of sessions) {
          const sid = String(s.id);
          if (ownedSet.has(sid)) {
            sessionMetaMap[sid] = s;
          }
        }

        if (!isMounted) return;

        setChats((prevChats) => {
          const mergedMap = new Map();

          for (const localChat of prevChats) {
            const sid = String(localChat.id);
            if (ownedSet.has(sid)) {
              mergedMap.set(sid, localChat);
            }
          }

          for (const sid of ownedIds) {
            const serverMsgs = messagesBySession[sid] || [];
            const meta = sessionMetaMap[sid];
            const existing = mergedMap.get(sid);

            if (!existing) {
              if (serverMsgs.length > 0) {
                mergedMap.set(sid, {
                  id: sid,
                  title: meta?.title || "New Chat",
                  mode: meta?.mode === "general" ? "general" : "database",
                  messages: serverMsgs,
                  updatedAt: meta?.updated_at
                    ? new Date(meta.updated_at).getTime()
                    : Date.now(),
                });
              }
            } else if (serverMsgs.length > existing.messages.length) {
              const mergedMessages = serverMsgs.map((srvMsg, idx) => {
                const localMatch = existing.messages[idx];
                if (
                  localMatch &&
                  localMatch.sender === "user" &&
                  localMatch.images?.length > 0
                ) {
                  return {
                    ...srvMsg,
                    images: localMatch.images,
                  };
                }
                return srvMsg;
              });

              mergedMap.set(sid, {
                ...existing,
                title:
                  existing.title === "New Chat" && meta?.title
                    ? meta.title
                    : existing.title,
                messages: mergedMessages,
              });
            }
          }

          return Array.from(mergedMap.values()).sort(
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
          );
        });
      } catch {
        // Offline / gunakan cache lokal perangkat
      }
    }

    syncDeviceHistoryFromServer();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleUpdateChatMessages = useCallback(
    (targetChatId, updater, meta = {}) => {
      const idStr = String(targetChatId);
      registerOwnedSessionId(idStr);

      setChats((prevChats) => {
        const exists = prevChats.some((c) => String(c.id) === idStr);
        if (exists) {
          return prevChats.map((chat) => {
            if (String(chat.id) !== idStr) return chat;
            const nextMessages =
              typeof updater === "function"
                ? updater(chat.messages || [])
                : updater;
            return {
              ...chat,
              messages: nextMessages,
              updatedAt: Date.now(),
            };
          });
        }

        const initialMessages =
          typeof updater === "function" ? updater([]) : updater;
        const newChatEntry = {
          id: idStr,
          title: meta.title || "New Chat",
          mode: meta.mode || aiMode,
          messages: initialMessages,
          updatedAt: Date.now(),
        };
        return [newChatEntry, ...prevChats];
      });
    },
    [aiMode]
  );

  const handleUpdateTitle = useCallback(
    async (chatId, newTitle, syncToBackend = false) => {
      const idStr = String(chatId);
      const cleanTitle = (newTitle || "").trim();
      if (!cleanTitle) return;

      setChats((prevChats) =>
        prevChats.map((chat) =>
          String(chat.id) === idStr ? { ...chat, title: cleanTitle } : chat
        )
      );

      if (syncToBackend) {
        try {
          await fetch(`${API_BASE_URL}/chats/${idStr}/title`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: cleanTitle, mode: aiMode }),
          });
        } catch (err) {
          console.error("Gagal menyinkronkan judul:", err);
        }
      }
    },
    [aiMode]
  );

  function handleNewChat() {
    setCurrentChatId(String(Date.now()));
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  }

  function handleSelectChat(chatId) {
    setCurrentChatId(String(chatId));
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  }

  async function handleDeleteChat(chatId) {
    const idStr = String(chatId);
    unregisterOwnedSessionId(idStr);
    setChats((prev) => prev.filter((chat) => String(chat.id) !== idStr));

    if (String(currentChatId) === idStr) {
      setCurrentChatId(String(Date.now()));
    }

    try {
      await fetch(`${API_BASE_URL}/chats/${idStr}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Gagal menghapus sesi di backend:", err);
    }
  }

  function handleSwitchMode(nextMode) {
    const normalized = nextMode === "general" ? "general" : "database";
    if (normalized === aiMode) return;
    setAiMode(normalized);
    setCurrentChatId(String(Date.now()));
  }

  const modeChats = chats.filter((chat) => (chat.mode || "database") === aiMode);
  const activeChat = chats.find(
    (chat) => String(chat.id) === String(currentChatId)
  );
  const activeMessages = activeChat ? activeChat.messages || [] : [];

  return (
    <div className={`app mode-${aiMode}`}>
      {isMobile && isSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <Sidebar
        isOpen={isSidebarOpen}
        isMobile={isMobile}
        onToggle={() => setIsSidebarOpen((prev) => !prev)}
        chats={modeChats}
        currentChatId={currentChatId}
        setCurrentChatId={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        aiMode={aiMode}
        onSwitchMode={handleSwitchMode}
        streamingStates={streamingStates}
      />

      <ChatWindow
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        messages={activeMessages}
        onUpdateChatMessages={handleUpdateChatMessages}
        chats={modeChats}
        currentChatId={currentChatId}
        onUpdateTitle={handleUpdateTitle}
        onDeleteChat={handleDeleteChat}
        aiMode={aiMode}
        streamingStates={streamingStates}
        setStreamingStates={setStreamingStates}
      />
    </div>
  );
}

export default App;
import "./App.css";
import { useState, useEffect, useRef } from "react";

import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import DeleteModal from "./components/DeleteModal";

function App() {
  // Mode AI aktif: "database" (StudyMate Basis Data) atau "general" (StudyMate General)
  const [aiMode, setAiMode] = useState("database");

  // Memuat chat yang memiliki isi percakapan; chat lama tanpa properti mode otomatis masuk ke "database"
  const [chats, setChats] = useState(() => {
    const savedChats = localStorage.getItem("studymate_chats");
    if (savedChats) {
      const parsed = JSON.parse(savedChats);
      return parsed
        .filter((c) => c.messages && c.messages.length > 0)
        .map((c) => ({
          ...c,
          mode: c.mode || "database",
        }));
    }
    return [];
  });

  // Saat pertama kali dibuka atau saat ganti mode, selalu arahkan ke New Chat baru
  const [currentChatId, setCurrentChatId] = useState(() => Date.now());

  const [draftChat, setDraftChat] = useState(() => ({
    id: currentChatId,
    title: "New Chat",
    mode: "database",
    messages: [],
  }));

  // Deteksi Mode Mobile/Tablet atau Zoom >= 250%
  const [isMobileView, setIsMobileView] = useState(
    () => window.innerWidth <= 768
  );

  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => window.innerWidth > 768
  );

  const userDesktopPreference = useRef(true);
  const prevIsMobile = useRef(window.innerWidth <= 768);

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth <= 768;
      setIsMobileView(mobile);

      if (mobile !== prevIsMobile.current) {
        if (mobile) {
          setIsSidebarOpen(false);
        } else {
          setIsSidebarOpen(userDesktopPreference.current);
        }
        prevIsMobile.current = mobile;
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function handleToggleSidebar() {
    setIsSidebarOpen((prev) => {
      const nextState = !prev;
      if (!isMobileView) {
        userDesktopPreference.current = nextState;
      }
      return nextState;
    });
  }

  // Simpan hanya chat yang sudah memiliki pesan ke localStorage
  useEffect(() => {
    const validChats = chats.filter((c) => c.messages && c.messages.length > 0);
    localStorage.setItem("studymate_chats", JSON.stringify(validChats));
  }, [chats]);

  // Filter daftar chat di sidebar khusus sesuai mode AI yang sedang aktif
  const modeChats = chats.filter((c) => (c.mode || "database") === aiMode);

  // Tentukan chat aktif: ambil dari daftar tersimpan jika ada, atau gunakan draftChat
  const existingChat = modeChats.find((chat) => chat.id === currentChatId);
  const currentChat = existingChat || draftChat;

  // Fungsi Switch Mode AI (Basis Data <-> General): selalu mulai di New Chat
  function handleSwitchMode(nextMode) {
    if (nextMode === aiMode) return;

    const newId = Date.now();
    setAiMode(nextMode);
    setDraftChat({
      id: newId,
      title: "New Chat",
      mode: nextMode,
      messages: [],
    });
    setCurrentChatId(newId);
  }

  function setMessages(updater) {
    const targetId = currentChatId;
    const activeModeSnapshot = aiMode;

    setChats((prevChats) => {
      const foundIndex = prevChats.findIndex((c) => c.id === targetId);

      if (foundIndex !== -1) {
        const targetChat = prevChats[foundIndex];
        const nextMessages =
          typeof updater === "function"
            ? updater(targetChat.messages || [])
            : updater;

        const updatedList = [...prevChats];
        updatedList[foundIndex] = {
          ...targetChat,
          messages: nextMessages,
        };
        return updatedList;
      }

      const baseMessages =
        draftChat.id === targetId ? draftChat.messages || [] : [];
      const nextMessages =
        typeof updater === "function" ? updater(baseMessages) : updater;

      if (nextMessages.length === 0) {
        return prevChats;
      }

      const promotedChat = {
        id: targetId,
        title: draftChat.id === targetId ? draftChat.title : "New Chat",
        mode: activeModeSnapshot,
        messages: nextMessages,
      };

      return [promotedChat, ...prevChats];
    });

    setDraftChat((prevDraft) => {
      if (prevDraft.id !== targetId) return prevDraft;
      const nextMessages =
        typeof updater === "function"
          ? updater(prevDraft.messages || [])
          : updater;
      return {
        ...prevDraft,
        messages: nextMessages,
      };
    });
  }

  async function handleUpdateTitle(chatId, newTitle, syncBackend = true) {
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) return;

    setDraftChat((prev) =>
      prev.id === chatId ? { ...prev, title: cleanTitle } : prev
    );

    setChats((prevChats) =>
      prevChats.map((chat) =>
        chat.id === chatId ? { ...chat, title: cleanTitle } : chat
      )
    );

    if (syncBackend) {
      try {
        await fetch(`/chats/${chatId}/title`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: cleanTitle, mode: aiMode }),
        });
      } catch (err) {
        console.error("Gagal menyimpan judul ke PostgreSQL:", err);
      }
    }
  }

  function handleSelectChat(id) {
    setCurrentChatId(id);
    if (isMobileView) {
      setIsSidebarOpen(false);
    }
  }

  function handleNewChat() {
    if (!existingChat && draftChat.messages.length === 0) {
      if (isMobileView) {
        setIsSidebarOpen(false);
      }
      return;
    }

    const newId = Date.now();
    setDraftChat({
      id: newId,
      title: "New Chat",
      mode: aiMode,
      messages: [],
    });
    setCurrentChatId(newId);

    if (isMobileView) {
      setIsSidebarOpen(false);
    }
  }

  function handleDeleteChat(chatId) {
    if (!chats.some((c) => c.id === chatId)) {
      handleNewChat();
      return;
    }
    setChatToDelete(chatId);
    setShowDeleteModal(true);
  }

  async function confirmDeleteChat() {
    const targetId = chatToDelete;

    try {
      await fetch(`/chats/${targetId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Gagal menghapus sesi di PostgreSQL:", err);
    }

    const updatedChats = chats.filter((chat) => chat.id !== targetId);
    setChats(updatedChats);

    if (currentChatId === targetId) {
      const newId = Date.now();
      setDraftChat({
        id: newId,
        title: "New Chat",
        mode: aiMode,
        messages: [],
      });
      setCurrentChatId(newId);
    }

    setShowDeleteModal(false);
    setChatToDelete(null);
  }

  function closeDeleteModal() {
    setShowDeleteModal(false);
    setChatToDelete(null);
  }

  return (
    <div className={`app mode-${aiMode}`}>
      {isMobileView && isSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <Sidebar
        isOpen={isSidebarOpen}
        isMobile={isMobileView}
        onToggle={handleToggleSidebar}
        chats={modeChats}
        currentChatId={currentChatId}
        setCurrentChatId={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        aiMode={aiMode}
        onSwitchMode={handleSwitchMode}
      />

      <ChatWindow
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        messages={currentChat.messages || []}
        setMessages={setMessages}
        chats={modeChats}
        currentChatId={currentChatId}
        onUpdateTitle={handleUpdateTitle}
        onDeleteChat={handleDeleteChat}
        aiMode={aiMode}
      />

      <DeleteModal
        open={showDeleteModal}
        chatTitle={chats.find((c) => c.id === chatToDelete)?.title}
        onClose={closeDeleteModal}
        onConfirm={confirmDeleteChat}
      />
    </div>
  );
}

export default App;
import "./App.css";
import { useState, useEffect, useRef } from "react";

import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import DeleteModal from "./components/DeleteModal";

function App() {
  const [chats, setChats] = useState(() => {
    const savedChats = localStorage.getItem("studymate_chats");
    if (savedChats) {
      return JSON.parse(savedChats);
    }
    return [
      {
        id: 1,
        title: "New Chat",
        messages: [],
      },
    ];
  });

  const [currentChatId, setCurrentChatId] = useState(() => {
    const savedId = localStorage.getItem("studymate_current_chat");
    return savedId ? Number(savedId) : 1;
  });

  // Deteksi Mode Mobile/Tablet atau Zoom >= 250% (lebar viewport <= 768px)
  const [isMobileView, setIsMobileView] = useState(
    () => window.innerWidth <= 768
  );

  // State aktual buka/tutup Sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => window.innerWidth > 768
  );

  // Menyimpan pilihan terakhir user saat berada di zoom <= 200% (desktop)
  const userDesktopPreference = useRef(true);
  // Menyimpan status viewport sebelumnya untuk mendeteksi lintasan batas 250%
  const prevIsMobile = useRef(window.innerWidth <= 768);

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth <= 768;
      setIsMobileView(mobile);

      // Hanya jalankan perubahan otomatis saat melintasi batas 250% (<= 768px)
      if (mobile !== prevIsMobile.current) {
        if (mobile) {
          // Masuk ke >= 250%: paksa sembunyikan sidebar
          setIsSidebarOpen(false);
        } else {
          // Turun kembali ke <= 200%: pulihkan sesuai kemauan terakhir user
          setIsSidebarOpen(userDesktopPreference.current);
        }
        prevIsMobile.current = mobile;
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fungsi toggle manual dari tombol user
  function handleToggleSidebar() {
    setIsSidebarOpen((prev) => {
      const nextState = !prev;
      // Jika sedang di zoom <= 200%, simpan pilihan ini sebagai kemauan user
      if (!isMobileView) {
        userDesktopPreference.current = nextState;
      }
      return nextState;
    });
  }

  useEffect(() => {
    localStorage.setItem("studymate_chats", JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem("studymate_current_chat", currentChatId);
  }, [currentChatId]);

  const currentChat =
    chats.find((chat) => chat.id === currentChatId) || chats[0];

  function setMessages(updater) {
    setChats((prevChats) =>
      prevChats.map((chat) => {
        if (chat.id !== currentChat.id) return chat;
        return {
          ...chat,
          messages:
            typeof updater === "function"
              ? updater(chat.messages)
              : updater,
        };
      })
    );
  }

  // Update Judul (untuk Auto-Title & Rename)
  async function handleUpdateTitle(chatId, newTitle, syncBackend = true) {
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) return;

    setChats((prevChats) =>
      prevChats.map((chat) =>
        chat.id === chatId ? { ...chat, title: cleanTitle } : chat
      )
    );

    if (syncBackend) {
      try {
        await fetch(`http://localhost:3000/chats/${chatId}/title`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: cleanTitle }),
        });
      } catch (err) {
        console.error("Gagal menyimpan judul ke SQLite:", err);
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
    const newChat = {
      id: Date.now(),
      title: "New Chat",
      messages: [],
    };
    setChats((prev) => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    if (isMobileView) {
      setIsSidebarOpen(false);
    }
  }

  function handleDeleteChat(chatId) {
    setChatToDelete(chatId);
    setShowDeleteModal(true);
  }

  async function confirmDeleteChat() {
    const targetId = chatToDelete;

    // Hapus juga sesi dari SQLite backend
    try {
      await fetch(`http://localhost:3000/chats/${targetId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Gagal menghapus sesi di SQLite:", err);
    }

    const updatedChats = chats.filter((chat) => chat.id !== targetId);

    if (updatedChats.length === 0) {
      const newChat = {
        id: Date.now(),
        title: "New Chat",
        messages: [],
      };
      setChats([newChat]);
      setCurrentChatId(newChat.id);
      setShowDeleteModal(false);
      setChatToDelete(null);
      return;
    }

    setChats(updatedChats);

    if (currentChatId === targetId) {
      setCurrentChatId(updatedChats[0].id);
    }

    setShowDeleteModal(false);
    setChatToDelete(null);
  }

  function closeDeleteModal() {
    setShowDeleteModal(false);
    setChatToDelete(null);
  }

  return (
    <div className="app">
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
        chats={chats}
        currentChatId={currentChatId}
        setCurrentChatId={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
      />

      <ChatWindow
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        messages={currentChat.messages}
        setMessages={setMessages}
        chats={chats}
        setChats={setChats}
        currentChatId={currentChatId}
        onUpdateTitle={handleUpdateTitle}
        onDeleteChat={handleDeleteChat}
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
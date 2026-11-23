import "./Sidebar.css";
import { useEffect, useRef, useState } from "react";
import SettingsMenu from "./SettingsMenu";
import BrandLogo from "./BrandLogo";

function Sidebar({
  isOpen,
  isMobile,
  onToggle,
  chats,
  currentChatId,
  setCurrentChatId,
  onNewChat,
  onDeleteChat,
  aiMode,
  onSwitchMode,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [displayedChats, setDisplayedChats] = useState(chats);
  const [slidePhase, setSlidePhase] = useState("idle");
  const prevModeRef = useRef(aiMode);

  useEffect(() => {
    if (prevModeRef.current !== aiMode) {
      prevModeRef.current = aiMode;
      setSearchTerm("");
      setSlidePhase("slide-out");

      const timerOut = setTimeout(() => {
        setDisplayedChats(chats);
        setSlidePhase("slide-in");

        const timerIn = setTimeout(() => {
          setSlidePhase("idle");
        }, 320);

        return () => clearTimeout(timerIn);
      }, 210);

      return () => clearTimeout(timerOut);
    } else {
      setDisplayedChats(chats);
    }
  }, [aiMode, chats]);

  const filteredChats = displayedChats.filter((chat) =>
    chat.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isGeneral = aiMode === "general";

  return (
    <aside
      className={`sidebar ${isOpen ? "open" : "closed"} ${
        isMobile ? "mobile-drawer" : ""
      } ${isGeneral ? "sidebar-general" : "sidebar-database"}`}
    >
      {/* Header Sidebar: Logo Bintang + StudyMate AI di Kiri, Tombol Sidebar di Kanan */}
      <div className="logo">
        <div className="logo-left-group">
          <button
            type="button"
            className="sidebar-brand-btn"
            onClick={onNewChat}
            title="StudyMate AI — New Chat"
          >
            <BrandLogo size={23} />
          </button>

          <div className="logo-brand-stack">
            <h2 className="logo-main-text">StudyMate AI</h2>
            <div className="logo-general-mask">
              <span
                className={`logo-general-subtext anim-allow ${
                  isGeneral ? "visible" : "hidden"
                }`}
              >
                General
              </span>
            </div>
          </div>
        </div>

        <button
          className="sidebar-toggle-btn"
          onClick={onToggle}
          title="Sembunyikan Sidebar"
          aria-label="Sembunyikan Sidebar"
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
      </div>

      {/* Tombol New Chat */}
      <button className="new-chat" onClick={onNewChat}>
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
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>New Chat</span>
      </button>

      {/* Search */}
      <div className="search-container">
        <svg
          className="search-icon"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7.5" />
          <line x1="20.5" y1="20.5" x2="16.5" y2="16.5" />
        </svg>
        <input
          type="text"
          className="search-input"
          placeholder={
            isGeneral ? "Search general chats..." : "Search database chats..."
          }
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Daftar Riwayat Chat */}
      <div className="history">
        <div className="history-title">
          {isGeneral ? "General Chats" : "Today's Chat"}
        </div>

        <div className={`history-list-animated anim-allow ${slidePhase}`}>
          {filteredChats.length === 0 ? (
            <div className="no-result">
              {searchTerm
                ? "Chat tidak ditemukan"
                : isGeneral
                ? "Belum ada obrolan General"
                : "Belum ada obrolan Basis Data"}
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                className={`history-item ${
                  chat.id === currentChatId ? "active" : ""
                }`}
                onClick={() => setCurrentChatId(chat.id)}
                title={chat.title}
              >
                <span className="chat-title">{chat.title}</span>

                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  title="Hapus chat"
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
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Tombol Pengaturan (Roda Gigi) di Pojok Kiri Bawah */}
      <SettingsMenu aiMode={aiMode} onSwitchMode={onSwitchMode} />
    </aside>
  );
}

export default Sidebar;
import { useEffect, useRef, useState } from "react";
import BrandLogo from "./BrandLogo";

function ChatHeader({
  isSidebarOpen,
  onToggleSidebar,
  currentTitle,
  currentChatId,
  onUpdateTitle,
  onDeleteChat,
  onCustomRenamed,
  darkMode,
  onToggleDarkMode,
}) {
  const menuRef = useRef(null);
  const renameInputRef = useRef(null);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState(currentTitle);

  useEffect(() => {
    setIsMenuOpen(false);
    setIsRenaming(false);
    setRenameText(currentTitle);
  }, [currentChatId, currentTitle]);

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
      onCustomRenamed();
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

  return (
    <div className="chat-header">
      <div className="chat-header-left">
        {!isSidebarOpen && (
          <button
            type="button"
            className="header-sidebar-btn has-brand-logo"
            onClick={onToggleSidebar}
            title="Tampilkan Sidebar"
            aria-label="Tampilkan Sidebar"
          >
            <BrandLogo size={23} />
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

      <div className="chat-header-actions">
        <button
          className="theme-toggle-btn"
          onClick={onToggleDarkMode}
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
  );
}

export default ChatHeader;
import "./SettingsMenu.css";
import { useEffect, useRef, useState } from "react";

function SettingsMenu({ aiMode, onSwitchMode }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isGeneral = aiMode === "general";

  function handleSelectMode(targetMode) {
    onSwitchMode(targetMode);
    setIsOpen(false);
  }

  function handleToggleSwitch() {
    onSwitchMode(isGeneral ? "database" : "general");
  }

  return (
    <div className="sidebar-footer-settings" ref={menuRef}>
      {isOpen && (
        <div className="settings-popover anim-allow">
          <div className="settings-popover-header">
            <div className="settings-header-text">
              <span className="settings-popover-title">Switch Mode AI</span>
              <span className="settings-popover-sub">
                Otomatis buka New Chat
              </span>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isGeneral}
              className={`mode-switch-pill anim-allow ${
                isGeneral ? "is-general" : "is-database"
              }`}
              onClick={handleToggleSwitch}
              title="Ganti cepat antara StudyMate Basis Data & General"
            >
              <span className="mode-switch-thumb anim-allow" />
            </button>
          </div>

          <button
            type="button"
            className={`mode-option-card anim-allow ${
              !isGeneral ? "selected-db" : ""
            }`}
            onClick={() => handleSelectMode("database")}
          >
            <span className="mode-dot db-dot" />
            <div className="mode-option-info">
              <span className="mode-option-name">StudyMate Basis Data</span>
              <span className="mode-option-desc">
                Khusus ERD, Normalisasi & SQL
              </span>
            </div>
            {!isGeneral && (
              <svg
                className="mode-check-icon db-check"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className={`mode-option-card anim-allow ${
              isGeneral ? "selected-general" : ""
            }`}
            onClick={() => handleSelectMode("general")}
          >
            <span className="mode-dot general-dot" />
            <div className="mode-option-info">
              <span className="mode-option-name">StudyMate General</span>
              <span className="mode-option-desc">
                Bebas semua topik, coding & umum
              </span>
            </div>
            {isGeneral && (
              <svg
                className="mode-check-icon general-check"
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        </div>
      )}

      <button
        type="button"
        className={`sidebar-settings-btn anim-allow ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Pengaturan Mode AI"
        aria-label="Pengaturan Mode AI"
      >
        <svg
          className="settings-gear-icon anim-allow"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span className="sidebar-settings-label">
          {isGeneral ? "StudyMate General" : "StudyMate Basis Data"}
        </span>
        <span
          className={`settings-mode-indicator ${
            isGeneral ? "orange" : "purple"
          }`}
        />
      </button>
    </div>
  );
}

export default SettingsMenu;
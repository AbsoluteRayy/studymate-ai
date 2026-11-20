import "./DeleteModal.css";
import { useEffect } from "react";

function DeleteModal({ open, chatTitle, onClose, onConfirm }) {
  useEffect(() => {
    function handleEsc(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    if (open) {
      document.addEventListener("keydown", handleEsc);
    }

    return () => {
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon">
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
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </div>
          <h2>Hapus Obrolan?</h2>
        </div>

        <p className="modal-desc">
          Obrolan{" "}
          {chatTitle ? (
            <strong>"{chatTitle}"</strong>
          ) : (
            "ini"
          )}{" "}
          akan dihapus secara permanen dan tidak dapat dipulihkan kembali.
        </p>

        <div className="modal-actions">
          <button type="button" className="cancel-btn" onClick={onClose}>
            Batal
          </button>

          <button type="button" className="confirm-btn" onClick={onConfirm}>
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteModal;
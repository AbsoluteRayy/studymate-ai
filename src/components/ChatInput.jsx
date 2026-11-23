import "./ChatInput.css";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

const MAX_IMAGES = 6;

function EnterKeyIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <path
        d="M11 4H18.5C19.8807 4 21 5.11929 21 6.5V17.5C21 18.8807 19.8807 20 18.5 20H5.5C4.11929 20 3 18.8807 3 17.5V12C3 10.6193 4.11929 9.5 5.5 9.5H9V6.5C9 5.11929 10.1193 4 11 4Z"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 8.5V14.5H9"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 12L8.5 14.5L11.5 17"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <rect x="6" y="6" width="12" height="12" rx="3" fill="#FFFFFF" />
    </svg>
  );
}

function compressImageToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) {
      resolve(null);
      return;
    }

    const supportsTransparency = ["image/png", "image/webp", "image/gif"].includes(
      file.type
    );

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1080;
        let { width, height } = img;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        if (supportsTransparency) {
          const pngDataUrl = canvas.toDataURL("image/png");
          // Jika ukuran PNG terlalu besar (> ~1.5 MB), gunakan WebP yang tetap mendukung transparansi penuh
          if (pngDataUrl.length > 2_000_000) {
            resolve(canvas.toDataURL("image/webp", 0.9));
          } else {
            resolve(pngDataUrl);
          }
        } else {
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        }
      };
      img.onerror = () => resolve(null);
      img.src = event.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const ChatInput = forwardRef(function ChatInput(
  { onSend, onStop, isGenerating, onPreviewImage },
  ref
) {
  const [text, setText] = useState("");
  const [images, setImages] = useState([]);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const attachMenuRef = useRef(null);

  async function processMultipleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    const imageFiles = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/")
    );
    if (imageFiles.length === 0) return;

    const compressedList = await Promise.all(
      imageFiles.map((file) => compressImageToDataUrl(file))
    );
    const validUrls = compressedList.filter(Boolean);

    if (validUrls.length > 0) {
      setImages((prev) => [...prev, ...validUrls].slice(0, MAX_IMAGES));
      textareaRef.current?.focus();
    }
  }

  useImperativeHandle(ref, () => ({
    addFiles: (fileList) => {
      if (!isGenerating) {
        processMultipleFiles(fileList);
      }
    },
  }));

  useEffect(() => {
    function handleClickOutside(e) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setIsAttachMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleGlobalPaste(e) {
      if (isGenerating) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      const pastedFiles = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        processMultipleFiles(pastedFiles);
      }
    }

    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [isGenerating]);

  function handleFileChange(e) {
    if (e.target.files?.length) {
      processMultipleFiles(e.target.files);
    }
    e.target.value = "";
  }

  function handleRemoveImage(indexToRemove) {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  }

  function handleSubmit(e) {
    e?.preventDefault();
    if (isGenerating) return;
    if (!text.trim() && images.length === 0) return;

    onSend(text.trim(), images);
    setText("");
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating) {
        handleSubmit();
      }
    }
  }

  function handleTextareaChange(e) {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  const canSend = !isGenerating && (text.trim().length > 0 || images.length > 0);

  return (
    <div className="chat-input-container">
      <form className="chat-input-box" onSubmit={handleSubmit}>
        {images.length > 0 && (
          <div className="input-image-preview-row">
            {images.map((imgUrl, idx) => (
              <div key={idx} className="input-image-thumb-wrapper">
                <img
                  src={imgUrl}
                  alt={`Preview lampiran ${idx + 1}`}
                  className="input-image-thumb"
                  onClick={() => onPreviewImage?.(imgUrl)}
                  title="Klik untuk memperbesar gambar"
                />
                <button
                  type="button"
                  className="input-image-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage(idx);
                  }}
                  title="Hapus gambar ini"
                  aria-label="Hapus gambar"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="chat-input-row">
          <div className="attach-menu-wrapper" ref={attachMenuRef}>
            <button
              type="button"
              className="attach-plus-btn"
              onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
              disabled={isGenerating || images.length >= MAX_IMAGES}
              title={
                images.length >= MAX_IMAGES
                  ? `Maksimal ${MAX_IMAGES} gambar`
                  : "Lampirkan foto (bisa pilih banyak atau seret langsung)"
              }
              aria-label="Lampirkan foto"
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
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>

            {isAttachMenuOpen && (
              <div className="attach-dropdown-menu">
                <button
                  type="button"
                  className="attach-dropdown-item"
                  onClick={() => {
                    setIsAttachMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <div className="attach-item-text">
                    <span className="attach-item-title">Add photos</span>
                    <span className="attach-item-sub">
                      Select multiple images (max {MAX_IMAGES}) or drag & drop
                    </span>
                  </div>
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden-file-input"
              onChange={handleFileChange}
            />
          </div>

          <textarea
            ref={textareaRef}
            className="chat-textarea"
            rows={1}
            placeholder="Ask StudyMate"
            value={text}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
          />

          <button
            type={isGenerating ? "button" : "submit"}
            onClick={isGenerating ? onStop : undefined}
            className={`send-btn ${isGenerating ? "stopping" : canSend ? "active" : ""}`}
            disabled={!isGenerating && !canSend}
            title={isGenerating ? "Hentikan jawaban AI" : "Kirim pesan (Enter)"}
            aria-label={isGenerating ? "Hentikan jawaban AI" : "Kirim pesan"}
          >
            {isGenerating ? <StopIcon /> : <EnterKeyIcon />}
          </button>
        </div>
      </form>
    </div>
  );
});

export default ChatInput;
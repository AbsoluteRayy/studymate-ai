import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";
import QuizCard, { parseQuizFromMarkdown } from "./QuizCard";

function formatMarkdownTables(text) {
  if (!text) return "";
  return text
    .replace(/^([^\n|]+?)\s+(\|[^|\n]+\|)/gm, "$1\n\n$2")
    .replace(/\|\s*\|\s*(?=[a-zA-Z0-9_:*(-])/g, "|\n|");
}

function MessageBubble({
  msg,
  index,
  isBusy,
  isCurrentlyStreamingMsg,
  isEditingThis,
  editingMsgText,
  setEditingMsgText,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  copiedIndex,
  onCopy,
  onGenerateQuiz,
  onSubmitQuizAnswers,
  onExportPDF,
  onPreviewImage,
}) {
  if (msg.sender === "user") {
    const msgImages =
      Array.isArray(msg.images) && msg.images.length > 0
        ? msg.images
        : msg.image
        ? [msg.image]
        : [];

    return (
      <div className="message-row user">
        {isEditingThis ? (
          <div className="user-edit-box">
            {msgImages.length > 0 && (
              <div
                className={`user-message-images-grid ${
                  msgImages.length > 1 ? "multi" : "single"
                }`}
              >
                {msgImages.map((imgUrl, idx) => (
                  <img
                    key={idx}
                    src={imgUrl}
                    alt={`Lampiran ${idx + 1}`}
                    className="user-message-image"
                  />
                ))}
              </div>
            )}
            <textarea
              className="user-edit-textarea"
              rows={3}
              value={editingMsgText}
              onChange={(e) => setEditingMsgText(e.target.value)}
              autoFocus
            />
            <div className="user-edit-actions">
              <button
                type="button"
                className="user-edit-cancel-btn"
                onClick={onCancelEdit}
              >
                Batal
              </button>
              <button
                type="button"
                className="user-edit-save-btn"
                onClick={() => onSaveEdit(index)}
                disabled={isBusy}
              >
                Simpan & Kirim Ulang
              </button>
            </div>
          </div>
        ) : (
          <div className="user-message-container">
            <div className="user-message">
              {msgImages.length > 0 && (
                <div
                  className={`user-message-images-grid ${
                    msgImages.length > 1 ? "multi" : "single"
                  }`}
                  style={{ marginBottom: msg.text ? "8px" : "0" }}
                >
                  {msgImages.map((imgUrl, idx) => (
                    <img
                      key={idx}
                      src={imgUrl}
                      alt={`Gambar unggahan ${idx + 1}`}
                      className="user-message-image"
                      onClick={() => onPreviewImage(imgUrl)}
                      title="Klik untuk memperbesar gambar"
                    />
                  ))}
                </div>
              )}
              {msg.text && <div>{msg.text}</div>}
            </div>

            {!isBusy && (
              <div className="user-message-toolbar">
                <button
                  type="button"
                  className="user-edit-trigger-btn"
                  onClick={() => onStartEdit(index, msg.text)}
                  title="Edit pesan ini"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                  <span>Edit</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const parsedQuiz = !isCurrentlyStreamingMsg
    ? parseQuizFromMarkdown(msg.text)
    : null;

  return (
    <div className="message-row ai">
      <div className="ai-message">
        {parsedQuiz ? (
          <QuizCard
            quizData={parsedQuiz}
            onSubmitAnswers={onSubmitQuizAnswers}
            disabled={isBusy}
          />
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
            }}
          >
            {formatMarkdownTables(msg.text)}
          </ReactMarkdown>
        )}

        {!isCurrentlyStreamingMsg && (
          <div className="message-toolbar">
            <button
              className="action-btn"
              onClick={() => onCopy(msg.text, index)}
            >
              {copiedIndex === index ? (
                <>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
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
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2.5" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              className="action-btn"
              onClick={() => onGenerateQuiz(msg.text)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
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

            <button className="action-btn" onClick={onExportPDF}>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
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
  );
}

export default MessageBubble;
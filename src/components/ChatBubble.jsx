import "./ChatBubble.css";

function ChatBubble({ sender, text }) {
  return (
    <div
      className={
        sender === "user"
          ? "bubble-container user"
          : "bubble-container ai"
      }
    >
      <div className="bubble">
        {text}
      </div>
    </div>
  );
}

export default ChatBubble;
import { useEffect, useRef, useState } from "react";

export function useChatStream({ setMessages, onUpdateTitle }) {
  const abortControllerRef = useRef(null);
  const typingIntervalRef = useRef(null);
  const tokenQueueRef = useRef("");
  const streamFinishedRef = useRef(false);
  const pendingTitleRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [streamingChatId, setStreamingChatId] = useState(null);

  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  function stopGenerating() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    tokenQueueRef.current = "";
    streamFinishedRef.current = true;
    setLoading(false);
    setStreamingChatId(null);
  }

  async function streamAIResponse(payload, targetChatId, prefixText = "") {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    tokenQueueRef.current = "";
    streamFinishedRef.current = false;
    pendingTitleRef.current = null;

    let displayedText = prefixText;
    let receivedAnyToken = false;

    const startTypewriterLoop = () => {
      if (typingIntervalRef.current) return;

      typingIntervalRef.current = setInterval(() => {
        if (tokenQueueRef.current.length > 0) {
          const step = tokenQueueRef.current.length > 350 ? 20 : 12;
          const nextSlice = tokenQueueRef.current.slice(0, step);
          tokenQueueRef.current = tokenQueueRef.current.slice(step);
          displayedText += nextSlice;

          setLoading(false);
          const currentText = displayedText;

          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].sender === "ai") {
              updated[lastIdx] = { ...updated[lastIdx], text: currentText };
            } else {
              updated.push({ sender: "ai", text: currentText });
            }
            return updated;
          });
        } else if (streamFinishedRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;

          if (!receivedAnyToken && !controller.signal.aborted) {
            setMessages((prev) => [
              ...prev,
              {
                sender: "ai",
                text: "Maaf, tidak ada respons yang diterima dari server AI. Silakan coba kirim ulang.",
              },
            ]);
          }

          if (pendingTitleRef.current) {
            onUpdateTitle(targetChatId, pendingTitleRef.current, false);
            pendingTitleRef.current = null;
          }

          setLoading(false);
          setStreamingChatId(null);
        }
      }, 10);
    };

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Gagal terhubung ke server AI (HTTP ${response.status}).`);
      }

      startTypewriterLoop();

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith("data: ")) continue;

          const dataStr = line.slice(6);
          let parsed;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (parsed.error) throw new Error(parsed.error);

          if (parsed.token) {
            receivedAnyToken = true;
            tokenQueueRef.current += parsed.token;
          }

          if (parsed.done && parsed.title) {
            pendingTitleRef.current = parsed.title;
          }
        }
      }

      streamFinishedRef.current = true;
    } catch (err) {
      if (err.name === "AbortError") {
        streamFinishedRef.current = true;
        return;
      }
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      throw err;
    }
  }

  return {
    loading,
    setLoading,
    streamingChatId,
    setStreamingChatId,
    streamAIResponse,
    stopGenerating,
  };
}
import { useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export function useChatStream({ setMessages, onUpdateTitle }) {
  const [loading, setLoading] = useState(false);
  const [streamingChatId, setStreamingChatId] = useState(null);

  const abortControllerRef = useRef(null);
  const rafIdRef = useRef(null);

  function stopGenerating() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setLoading(false);
    setStreamingChatId(null);
  }

  async function streamAIResponse(payload, targetChatId, initialPrefix = "") {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    let pendingQueue = initialPrefix || "";
    let displayedText = "";
    let isAiBubbleCreated = false;
    let streamFinished = false;
    let receivedTitle = null;

    function appendChunkToMessage(chunk) {
      if (!chunk) return;
      displayedText += chunk;

      if (!isAiBubbleCreated) {
        isAiBubbleCreated = true;
        setLoading(false);
        setMessages((prev) => [...prev, { sender: "ai", text: displayedText }]);
      } else {
        setMessages((prev) => {
          if (prev.length === 0) return [{ sender: "ai", text: displayedText }];
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            sender: "ai",
            text: displayedText,
          };
          return updated;
        });
      }
    }

    // Loop ketik adaptif 60fps: halus saat antrean pendek, ngebut otomatis saat antrean panjang
    const typingPromise = new Promise((resolve) => {
      function tick() {
        if (controller.signal.aborted) {
          rafIdRef.current = null;
          resolve();
          return;
        }

        if (pendingQueue.length > 0) {
          // Ambil minimal 6 karakter atau 1/8 dari sisa antrean agar tidak pernah tertinggal
          let sliceLen = Math.max(6, Math.ceil(pendingQueue.length / 8));

          // Potong di batas spasi terdekat agar kata tidak terbelah setengah
          if (sliceLen < pendingQueue.length) {
            const nextSpace = pendingQueue.indexOf(" ", sliceLen);
            if (nextSpace !== -1 && nextSpace - sliceLen <= 12) {
              sliceLen = nextSpace + 1;
            }
          } else {
            sliceLen = pendingQueue.length;
          }

          const chunk = pendingQueue.slice(0, sliceLen);
          pendingQueue = pendingQueue.slice(sliceLen);
          appendChunkToMessage(chunk);
        }

        if (streamFinished && pendingQueue.length === 0) {
          rafIdRef.current = null;
          resolve();
          return;
        }

        rafIdRef.current = requestAnimationFrame(tick);
      }

      rafIdRef.current = requestAnimationFrame(tick);
    });

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || `Gagal terhubung ke server (${response.status})`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() || "";

        for (const eventBlock of events) {
          const lines = eventBlock.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const jsonStr = trimmed.slice(6);

            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.token) {
                pendingQueue += parsed.token;
              }
              if (parsed.title) {
                receivedTitle = parsed.title;
              }
              if (parsed.done) {
                streamFinished = true;
              }
            } catch (parseErr) {
              if (parseErr.message && !jsonStr.startsWith("{")) {
                continue;
              }
              if (parseErr.message?.startsWith("Error AI:")) {
                throw parseErr;
              }
            }
          }
        }
      }

      streamFinished = true;
      await typingPromise;

      if (receivedTitle && onUpdateTitle) {
        onUpdateTitle(targetChatId, receivedTitle);
      }
    } catch (err) {
      streamFinished = true;
      if (err.name !== "AbortError") {
        throw err;
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
        setStreamingChatId(null);
      }
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
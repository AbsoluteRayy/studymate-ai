import { useRef } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export function useChatStream({
  onUpdateChatMessages,
  onUpdateTitle,
  setStreamingStates,
}) {
  const controllersMapRef = useRef({});
  const rafMapRef = useRef({});

  function updateChatStreamStatus(chatId, status) {
    const idStr = String(chatId);
    setStreamingStates((prev) => {
      const next = { ...prev };
      if (!status) {
        delete next[idStr];
      } else {
        next[idStr] = status;
      }
      return next;
    });
  }

  function stopGenerating(chatId) {
    const idStr = String(chatId);
    if (controllersMapRef.current[idStr]) {
      controllersMapRef.current[idStr].abort();
      delete controllersMapRef.current[idStr];
    }
    if (rafMapRef.current[idStr]) {
      cancelAnimationFrame(rafMapRef.current[idStr]);
      delete rafMapRef.current[idStr];
    }
    updateChatStreamStatus(idStr, null);
  }

  async function streamAIResponse(
    payload,
    targetChatId,
    initialPrefix = "",
    options = {}
  ) {
    const idStr = String(targetChatId);
    const isQuiz = Boolean(options.isQuiz);

    if (controllersMapRef.current[idStr]) {
      controllersMapRef.current[idStr].abort();
    }
    if (rafMapRef.current[idStr]) {
      cancelAnimationFrame(rafMapRef.current[idStr]);
      delete rafMapRef.current[idStr];
    }

    const controller = new AbortController();
    controllersMapRef.current[idStr] = controller;

    let pendingQueue = initialPrefix || "";
    let displayedText = "";
    let isAiBubbleCreated = false;
    let streamFinished = false;
    let receivedTitle = null;

    function appendChunkToTargetChat(chunk) {
      if (!chunk) return;
      displayedText += chunk;

      if (!isAiBubbleCreated) {
        isAiBubbleCreated = true;
        updateChatStreamStatus(idStr, isQuiz ? "streaming-quiz" : "streaming");
        onUpdateChatMessages(idStr, (prev) => [
          ...prev,
          { sender: "ai", text: displayedText, isQuiz },
        ]);
      } else {
        onUpdateChatMessages(idStr, (prev) => {
          if (prev.length === 0) {
            return [{ sender: "ai", text: displayedText, isQuiz }];
          }
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            sender: "ai",
            text: displayedText,
            isQuiz: updated[updated.length - 1].isQuiz || isQuiz,
          };
          return updated;
        });
      }
    }

    const typingPromise = new Promise((resolve) => {
      function tick() {
        if (controller.signal.aborted) {
          delete rafMapRef.current[idStr];
          resolve();
          return;
        }

        if (pendingQueue.length > 0) {
          let sliceLen = Math.max(6, Math.ceil(pendingQueue.length / 8));

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
          appendChunkToTargetChat(chunk);
        }

        if (streamFinished && pendingQueue.length === 0) {
          delete rafMapRef.current[idStr];
          resolve();
          return;
        }

        rafMapRef.current[idStr] = requestAnimationFrame(tick);
      }

      rafMapRef.current[idStr] = requestAnimationFrame(tick);
    });

    try {
      const serializedBody = JSON.stringify(payload);
      const canUseKeepalive = serializedBody.length < 60000;

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serializedBody,
        signal: controller.signal,
        keepalive: canUseKeepalive,
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
        onUpdateTitle(idStr, receivedTitle);
      }
    } catch (err) {
      streamFinished = true;
      if (err.name !== "AbortError") {
        throw err;
      }
    } finally {
      if (controllersMapRef.current[idStr] === controller) {
        delete controllersMapRef.current[idStr];
        updateChatStreamStatus(idStr, null);
      }
    }
  }

  return {
    streamAIResponse,
    stopGenerating,
  };
}
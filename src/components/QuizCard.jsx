import { useEffect, useMemo, useState } from "react";
import "./QuizCard.css";

function renderFormattedInline(text) {
  if (!text) return null;
  const cleaned = text.replace(/\*([^*]+)\*/g, "$1");
  const parts = cleaned.split(/(`[^`]+`)/g);

  return parts.map((part, idx) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={idx}>{part.slice(1, -1)}</code>;
    }
    return <span key={idx}>{part}</span>;
  });
}

function extractHiddenAnswerKey(text) {
  if (!text) return {};
  const match = text.match(/<!--\s*ANSWER_KEY:\s*(\{[\s\S]*?\})\s*-->/i);
  if (!match || !match[1]) return {};
  try {
    const parsed = JSON.parse(match[1]);
    const normalized = {};
    for (const [k, v] of Object.entries(parsed)) {
      normalized[String(k).trim()] = String(v).trim().toUpperCase();
    }
    return normalized;
  } catch {
    return {};
  }
}

export function extractSubmittedAnswersFromUserText(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!/^ini jawaban quiz saya/i.test(trimmed)) return null;

  const restored = {};
  // Mendukung format "1. Jawaban Saya: D ..." maupun format lama/ringkas "1. D ..."
  const regex = /(?:^|\n|\s)(\d+)\.\s*(?:Jawaban\s*Saya:\s*)?([A-E])\b/gi;
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    restored[Number(match[1])] = match[2].toUpperCase();
  }

  return Object.keys(restored).length > 0 ? restored : null;
}

export function parseQuizFromMarkdown(text) {
  if (!text) return null;

  const answerKeyMap = extractHiddenAnswerKey(text);
  const visibleText = text
    .replace(/<!--\s*ANSWER_KEY:[\s\S]*?-->/gi, "")
    .trim();

  const lines = visibleText.split("\n");
  const questions = [];
  let currentQ = null;
  let introLines = [];
  let hasStartedQuestions = false;

  const questionRegex =
    /^(?:###\s*)?(?:\*\*)?(?:Nomor\s*)?(\d+)[.)]\s*(?:\*\*)?\s*(.+)$/i;
  const optionRegex = /^(?:[-*]\s*)?(?:\*\*)?([A-E])[.)]\s*(?:\*\*)?\s*(.+)$/i;

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (!hasStartedQuestions && line.startsWith("#")) {
      introLines.push(line.replace(/^#+\s*/, ""));
      continue;
    }

    const qMatch = line.match(questionRegex);
    if (qMatch && !line.match(/^[A-E][.)]/i)) {
      if (currentQ && currentQ.options.length >= 2) {
        questions.push(currentQ);
      }
      hasStartedQuestions = true;
      const qNum = Number(qMatch[1]);
      currentQ = {
        number: qNum,
        question: qMatch[2].replace(/\*\*/g, "").trim(),
        options: [],
        correctAnswer: answerKeyMap[String(qNum)] || null,
      };
      continue;
    }

    const optMatch = line.match(optionRegex);
    if (optMatch && currentQ) {
      currentQ.options.push({
        key: optMatch[1].toUpperCase(),
        text: optMatch[2].replace(/\*\*/g, "").trim(),
      });
      continue;
    }

    if (currentQ && currentQ.options.length === 0) {
      currentQ.question += " " + line.replace(/\*\*/g, "");
    } else if (!hasStartedQuestions) {
      introLines.push(line.replace(/\*\*/g, ""));
    }
  }

  if (currentQ && currentQ.options.length >= 2) {
    questions.push(currentQ);
  }

  if (questions.length < 2) return null;

  return {
    title: introLines[0] || "Latihan Soal Pilihan Ganda",
    questions,
  };
}

function QuizCard({
  quizData,
  savedUserAnswers = null,
  onSubmitAnswers,
  disabled,
}) {
  const [selectedAnswers, setSelectedAnswers] = useState(
    () => savedUserAnswers || {}
  );
  const [isSubmitted, setIsSubmitted] = useState(() =>
    Boolean(savedUserAnswers && Object.keys(savedUserAnswers).length > 0)
  );

  useEffect(() => {
    if (savedUserAnswers && Object.keys(savedUserAnswers).length > 0) {
      setSelectedAnswers(savedUserAnswers);
      setIsSubmitted(true);
    }
  }, [savedUserAnswers]);

  const totalQuestions = quizData.questions.length;
  const answeredCount = useMemo(
    () => Object.keys(selectedAnswers).length,
    [selectedAnswers]
  );

  const allAnswered = answeredCount === totalQuestions;
  const hasCompleteAnswerKey = useMemo(
    () => quizData.questions.every((q) => Boolean(q.correctAnswer)),
    [quizData]
  );

  const scoreSummary = useMemo(() => {
    if (!isSubmitted || !hasCompleteAnswerKey) return null;
    let correct = 0;
    for (const q of quizData.questions) {
      if (selectedAnswers[q.number] === q.correctAnswer) {
        correct += 1;
      }
    }
    return {
      correct,
      wrong: totalQuestions - correct,
      score: Math.round((correct / totalQuestions) * 100),
    };
  }, [
    isSubmitted,
    hasCompleteAnswerKey,
    quizData,
    selectedAnswers,
    totalQuestions,
  ]);

  function handleSelectOption(questionNumber, optionKey) {
    if (isSubmitted || disabled) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionNumber]: optionKey,
    }));
  }

  function handleSubmit() {
    if (!allAnswered || isSubmitted || disabled) return;
    setIsSubmitted(true);

    if (hasCompleteAnswerKey) {
      let correctCount = 0;

      const detailedRecap = quizData.questions
        .map((q) => {
          const chosenKey = selectedAnswers[q.number];
          const chosenOpt = q.options.find((o) => o.key === chosenKey);
          const correctOpt = q.options.find((o) => o.key === q.correctAnswer);
          const isCorrect = chosenKey === q.correctAnswer;
          if (isCorrect) correctCount += 1;

          return `${q.number}. Jawaban Saya: ${chosenKey}${
            chosenOpt ? ` (${chosenOpt.text})` : ""
          } | Kunci Resmi: ${q.correctAnswer}${
            correctOpt ? ` (${correctOpt.text})` : ""
          } -> ${isCorrect ? "BENAR ✅" : "SALAH ❌"}`;
        })
        .join("\n");

      const wrongCount = totalQuestions - correctCount;
      const finalScore = Math.round((correctCount / totalQuestions) * 100);

      const evaluationPrompt = `Ini jawaban quiz saya (sudah dikoreksi otomatis oleh sistem):

**Hasil Resmi:**
- **Skor Nilai:** ${finalScore} / 100
- **Benar:** ${correctCount} dari ${totalQuestions} soal
- **Salah:** ${wrongCount} soal

**Rincian Per Nomor:**
${detailedRecap}

Tolong tampilkan kembali rekap skor & jumlah benar/salah persis sesuai angka resmi di atas, lalu berikan pembahasan singkat dan jelas untuk setiap nomor!`;

      onSubmitAnswers(evaluationPrompt);
    } else {
      const formattedSubmission = quizData.questions
        .map((q) => {
          const chosenKey = selectedAnswers[q.number];
          const chosenOpt = q.options.find((o) => o.key === chosenKey);
          return `${q.number}. ${chosenKey}${
            chosenOpt ? ` (${chosenOpt.text})` : ""
          }`;
        })
        .join("\n");

      const evaluationPrompt = `Ini jawaban quiz saya:\n\n${formattedSubmission}\n\nTolong periksa semua jawaban saya berdasarkan soal quiz sebelumnya! Pastikan jumlah Benar + Salah = ${totalQuestions} dan Skor = (Jumlah Benar / ${totalQuestions}) x 100. Berikan:\n1. **Skor Nilai** (skala 0–100)\n2. **Rekap Jumlah Benar & Salah**\n3. **Koreksi & Pembahasan Singkat** untuk setiap nomor (tandai Benar ✅ dan Salah ❌ beserta jawaban yang seharusnya).`;

      onSubmitAnswers(evaluationPrompt);
    }
  }

  return (
    <div className="quiz-interactive-container">
      <div className="quiz-header-bar">
        <div className="quiz-header-info">
          <span className="quiz-badge">
            {isSubmitted ? "Quiz Selesai" : "Quiz Interaktif"}
          </span>
          <h3 className="quiz-main-title">{quizData.title}</h3>
        </div>
        <div className="quiz-progress-pill">
          {scoreSummary
            ? `Skor ${scoreSummary.score}/100 • ✅ ${scoreSummary.correct}  ❌ ${scoreSummary.wrong}`
            : isSubmitted
            ? `Selesai (${answeredCount}/${totalQuestions})`
            : `Terjawab ${answeredCount} / ${totalQuestions}`}
        </div>
      </div>

      <div className="quiz-questions-list">
        {quizData.questions.map((q) => {
          const chosen = selectedAnswers[q.number];
          const showEvaluation = isSubmitted && Boolean(q.correctAnswer);
          const isQuestionCorrect = showEvaluation && chosen === q.correctAnswer;

          return (
            <div key={q.number} className="quiz-question-box">
              <div className="quiz-question-header">
                <div className="quiz-number-row">
                  <span className="quiz-number-pill">Nomor {q.number}</span>
                  {showEvaluation && (
                    <span
                      className={`quiz-status-badge ${
                        isQuestionCorrect ? "correct" : "wrong"
                      }`}
                    >
                      {isQuestionCorrect ? "✅ Benar" : "❌ Salah"}
                    </span>
                  )}
                </div>
                <p className="quiz-question-text">
                  {renderFormattedInline(q.question)}
                </p>
              </div>

              <div className="quiz-options-box">
                {q.options.map((opt) => {
                  const isSelected = chosen === opt.key;
                  const isRightAnswer =
                    showEvaluation && opt.key === q.correctAnswer;
                  const isWrongChosen =
                    showEvaluation && isSelected && opt.key !== q.correctAnswer;

                  let stateClass = "";
                  if (showEvaluation) {
                    if (isRightAnswer) stateClass = "correct-answer";
                    else if (isWrongChosen) stateClass = "wrong-answer";
                  } else if (isSelected) {
                    stateClass = "selected";
                  }

                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={`quiz-option-item ${stateClass} ${
                        isSubmitted ? "locked" : ""
                      }`}
                      onClick={() => handleSelectOption(q.number, opt.key)}
                      disabled={isSubmitted || disabled}
                    >
                      <span className="quiz-option-radio">
                        {(isSelected || isRightAnswer) && (
                          <span className="quiz-option-dot" />
                        )}
                      </span>
                      <span className="quiz-option-key">{opt.key}.</span>
                      <span className="quiz-option-text">
                        {renderFormattedInline(opt.text)}
                      </span>
                      {showEvaluation && isRightAnswer && (
                        <span className="quiz-option-emoji">✅</span>
                      )}
                      {showEvaluation && isWrongChosen && (
                        <span className="quiz-option-emoji">❌</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="quiz-footer-actions">
        <button
          type="button"
          className={`quiz-submit-btn ${
            isSubmitted ? "submitted" : allAnswered ? "ready" : ""
          }`}
          onClick={handleSubmit}
          disabled={!allAnswered || isSubmitted || disabled}
        >
          {isSubmitted
            ? "✅ Jawaban Sudah Dikumpulkan — Lihat Pembahasan di Bawah"
            : allAnswered
            ? "Kumpulkan Jawaban"
            : `Jawab Semua Soal (${answeredCount}/${totalQuestions})`}
        </button>
      </div>
    </div>
  );
}

export default QuizCard;
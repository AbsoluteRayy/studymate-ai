import jsPDF from "jspdf";
import { cleanMarkdown } from "./markdown";

export function exportChatToPDF(messages, currentTitle, isGeneral) {
  const doc = new jsPDF();
  const defaultName = isGeneral ? "StudyMate General" : "StudyMate Basis Data";
  const fileName = currentTitle || defaultName;

  let y = 20;
  doc.setFontSize(20);
  doc.text(
    isGeneral ? "StudyMate AI - General" : "StudyMate AI - Basis Data",
    20,
    y
  );
  y += 12;
  doc.setFontSize(11);
  doc.text(
    isGeneral
      ? "General AI Learning & Productivity Assistant"
      : "Database Systems Learning Assistant",
    20,
    y
  );
  y += 12;
  doc.line(20, y, 190, y);
  y += 10;

  messages.forEach((msg) => {
    const sender = msg.sender === "user" ? "PENGGUNA" : "STUDYMATE AI";
    doc.setFont(undefined, "bold");
    doc.text(sender, 20, y);
    y += 8;
    doc.setFont(undefined, "normal");

    const cleanText = cleanMarkdown(msg.text);
    const lines = doc.splitTextToSize(cleanText, 170);
    doc.text(lines, 20, y);
    y += lines.length * 7 + 8;

    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  });

  doc.save(`${fileName}.pdf`);
}
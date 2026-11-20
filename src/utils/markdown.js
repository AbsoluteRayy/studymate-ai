export function cleanMarkdown(text) {
  if (!text) return "";

  return text
    // Heading
    .replace(/^###\s?/gm, "")
    .replace(/^##\s?/gm, "")
    .replace(/^#\s?/gm, "")

    // Bold
    .replace(/\*\*(.*?)\*\*/g, "$1")

    // Italic
    .replace(/\*(.*?)\*/g, "$1")

    // Inline Code
    .replace(/`([^`]+)`/g, "$1")

    // Code Block
    .replace(/```[\s\S]*?```/g, "")

    // Bullet List
    .replace(/^- /gm, "• ")

    // Block Quote
    .replace(/^>\s?/gm, "")

    // Horizontal Line
    .replace(/^---$/gm, "")

    // Multiple Empty Line
    .replace(/\n{3,}/g, "\n\n")

    .trim();
}
export async function askLMStudio(prompt) {
  const response = await fetch("http://127.0.0.1:3000/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
    }),
  });

  if (!response.ok) {
    throw new Error("Backend Error");
  }

  const data = await response.json();

  return data.reply;
}
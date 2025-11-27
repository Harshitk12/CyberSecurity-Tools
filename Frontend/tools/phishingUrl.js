// Frontend/tools/phishingUrl.js
const apiBase = "http://127.0.0.1:8001";// your Flask server

document.addEventListener("DOMContentLoaded", () => {
  const urlInput = document.getElementById("urlInput");
  const checkBtn = document.getElementById("checkBtn");
  const resultSection = document.getElementById("result");
  const verdictEl = document.getElementById("verdict");
  const scoreEl = document.getElementById("score");
  const adviceEl = document.getElementById("advice");
  const featuresTable = document.getElementById("featuresTable");

  document.querySelectorAll(".example").forEach(btn => {
    btn.addEventListener("click", () => urlInput.value = btn.textContent.trim());
  });

  checkBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) { alert("Please enter a URL to check."); return; }

    checkBtn.disabled = true; checkBtn.textContent = "Checking...";
    resultSection.classList.add("hidden");

    try {
      const resp = await fetch(`${apiBase}/api/check_with_gemini`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Unknown error");

      // Show model text and verdict
      const wordsArray = data.model_text.split(' ');
      const firstWord = wordsArray[0];
      resultSection.classList.remove("hidden");
      verdictEl.textContent = (firstWord || "unknown").toUpperCase();
      adviceEl.textContent = data.model_text || "";
      // no numeric score from Gemini in this simple flow
      scoreEl.textContent = "-";

      // style
      verdictEl.style.color = firstWord.toLowerCase() === "phishing" ? "#ff6b6b" : "#7efc6a";
    } catch (err) {
      alert("Error: " + (err.message || err));
    } finally {
      checkBtn.disabled = false; checkBtn.textContent = "Check URL";
    }
  });
});

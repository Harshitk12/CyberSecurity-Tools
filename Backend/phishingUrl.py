# Backend/app.py
import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()  # optional: loads .env file in Backend/

GEMINI_API_KEY = os.getenv("SAFE_BROWSING_API_KEY")  # set this in your environment
if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not set. Set it in environment or .env file.")

# USE the model name you prefer; quickstart examples use gemini-2.5-flash
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

app = Flask(__name__)
CORS(app)  # allow local frontend during dev

def build_prompt_for_url(url: str) -> str:
    """
    Build a concise prompt instructing Gemini to answer clearly.
    We ask the model to reply in a short single-line form (PHISHING or LEGITIMATE)
    and then optionally include one short reason. Backend will parse first word.
    """
    prompt = (
        "You are a cybersecurity assistant. Determine whether the following URL is a phishing URL.\n\n"
        f"URL: {url}\n\n"
        "Answer in one short line. Start your answer with either the single word "
        "'PHISHING' or 'LEGITIMATE' (uppercase). After that you may add a 1-2 sentence reason. "
        "Do NOT include anything else like code blocks.\n\n"
        "If unsure, prefer 'PHISHING'."
    )
    return prompt

def call_gemini(prompt: str):
    """
    Calls Gemini generateContent REST endpoint.
    See Google quickstart for examples. The request uses the x-goog-api-key header.
    (Docs: https://ai.google.dev/gemini-api/docs/quickstart)
    """
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
    }

    # payload follows the quickstart shape: contents -> parts -> text
    payload = {
        "contents": [
            {
                "parts": [
                    { "text": prompt }
                ]
            }
        ]
    }
    resp = requests.post(GEMINI_ENDPOINT, json=payload, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()

def parse_gemini_response(resp_json: dict) -> dict:
    """
    Extract text from response and classify by looking for keywords.
    The official response typically places text at:
    resp['candidates'][0]['content']['parts'][0]['text']
    """
    text = ""
    try:
        candidates = resp_json.get("candidates") or resp_json.get("candidates", [])  # guard
        if candidates and isinstance(candidates, list):
            # new/older variants: check nested fields
            first = candidates[0]
            # some SDKs use 'content' -> 'parts' -> text
            content = first.get("content") or {}
            parts = content.get("parts") or []
            if parts:
                text = parts[0].get("text", "")
        # fallback: some responses put text in 'output' or 'text'
        if not text:
            text = resp_json.get("output", "") or resp_json.get("text", "")
    except Exception:
        text = str(resp_json)

    # normalize and detect
    norm = (text or "").strip().lower()
    if "phish" in norm or norm.startswith("phishing") or "phishing" in norm.split():
        verdict = "phishing"
    elif norm.startswith("legitimate") or "legit" in norm:
        verdict = "legitimate"
    else:
        # if model didn't follow instructions, try heuristics
        # look for explicit keywords
        if any(w in norm for w in ["not phishing", "safe", "legitimate", "benign"]):
            verdict = "legitimate"
        elif any(w in norm for w in ["phishing", "malicious", "scam", "fraud"]):
            verdict = "phishing"
        else:
            # fallback conservative: mark phishing if model expresses doubt or uses 'suspicious'
            verdict = "phishing" if "suspicious" in norm or "suspicious" in norm else "legitimate"

    return {"verdict": verdict, "model_text": text}

@app.route("/api/check_with_gemini", methods=["POST"])
def check_with_gemini():
    data = request.get_json() or {}
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    try:
        prompt = build_prompt_for_url(url)
        gemini_resp = call_gemini(prompt)
        parsed = parse_gemini_response(gemini_resp)
        return jsonify({
            "url": url,
            "verdict": parsed["verdict"],
            "model_text": parsed["model_text"],
            "raw_response": gemini_resp  # optional, useful for debugging (remove in prod)
        })
    except requests.HTTPError as e:
        return jsonify({"error": "Gemini API error", "details": str(e), "response_text": getattr(e.response, 'text', None)}), 502
    except Exception as e:
        return jsonify({"error": "Internal error", "details": str(e)}), 500

if __name__ == "__main__":
    print("Starting Flask on http://127.0.0.1:5000")
    app.run(debug=True, port=5000)

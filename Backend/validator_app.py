from flask import Flask, request, jsonify, send_from_directory
from detector import analyze
import os

app = Flask(__name__, static_url_path="", static_folder=".")

# -------------------------------
# API ENDPOINT
# -------------------------------
@app.route("/api/check", methods=["POST"])
def check_url():
    try:
        data = request.get_json()
        url = data.get("url", "").strip()

        if not url:
            return jsonify({
                "success": False,
                "status": "Error",
                "details": ["No URL provided"]
            }), 400

        issues = analyze(url)

        return jsonify({
            "success": True,
            "url": url,
            "status": "Secure" if not issues else "Suspicious",
            "details": issues
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "status": "Error",
            "details": [str(e)]
        }), 500


# -------------------------------
# FRONTEND ROUTE
# -------------------------------
@app.route("/")
def index():
    return send_from_directory(".", "validator_frontend.html")


# -------------------------------
# RUN SERVER
# -------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

# app.py
import io
import json
import hashlib
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image, ExifTags
import piexif, exifread
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ===== Helper functions =====
def _to_deg(value):
    """Convert EXIF GPS coordinate tuples to decimal degrees."""
    def rat2float(r):
        if isinstance(r, tuple):
            n, d = r
            return float(n) / float(d) if d else 0.0
        return float(r)
    d = rat2float(value[0])
    m = rat2float(value[1]) if len(value) > 1 else 0
    s = rat2float(value[2]) if len(value) > 2 else 0
    return d + (m / 60.0) + (s / 3600.0)

def parse_gps(exif_dict):
    gps_ifd = exif_dict.get("GPS", {})
    if not gps_ifd:
        return None
    try:
        lat = gps_ifd.get(piexif.GPSIFD.GPSLatitude)
        lon = gps_ifd.get(piexif.GPSIFD.GPSLongitude)
        lat_ref = gps_ifd.get(piexif.GPSIFD.GPSLatitudeRef)
        lon_ref = gps_ifd.get(piexif.GPSIFD.GPSLongitudeRef)
        if not (lat and lon and lat_ref and lon_ref):
            return None
        lat_deg = _to_deg(lat)
        lon_deg = _to_deg(lon)
        if lat_ref in [b'S', b's']: lat_deg = -lat_deg
        if lon_ref in [b'W', b'w']: lon_deg = -lon_deg
        return {"latitude": lat_deg, "longitude": lon_deg}
    except Exception:
        return None

def extract_exif_bytes(io_bytes):
    """Return (piexif_data, human_readable_exif)"""
    try:
        data = piexif.load(io_bytes.getvalue())
    except Exception:
        data = {}
    io_bytes.seek(0)
    tags = exifread.process_file(io_bytes, details=False)
    pretty = {str(k): str(v) for k, v in tags.items()}
    return data, pretty

# ===== Routes =====
@app.route("/upload", methods=["POST"])
def upload():
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    file = request.files['image']
    if not file.filename.lower().endswith(('.jpg', '.jpeg', '.png')):
        return jsonify({"error": "Unsupported file type"}), 400

    raw = file.read()
    if len(raw) > 10 * 1024 * 1024:  # 10 MB limit
        return jsonify({"error": "File too large"}), 400

    sha256_hash = hashlib.sha256(raw).hexdigest()

    io_bytes = io.BytesIO(raw)
    piexif_data, pretty_exif = extract_exif_bytes(io_bytes)
    gps = parse_gps(piexif_data)

    sensitive = {
        "gps_present": bool(gps),
        "camera_make": None,
        "camera_model": None,
        "datetime": None,
        "serial_number": None,
        "software": None,
        "lens": None
    }

    # Get structured info
    zeroth = piexif_data.get("0th", {})
    exif_ifd = piexif_data.get("Exif", {})
    for group, table in [("0th", zeroth), ("Exif", exif_ifd)]:
        for tag_id, val in table.items():
            try:
                tag_name = piexif.TAGS[group][tag_id]["name"]
                val = val.decode("utf-8", errors="ignore") if isinstance(val, bytes) else str(val)
                if tag_name == "Make": sensitive["camera_make"] = val
                if tag_name == "Model": sensitive["camera_model"] = val
                if tag_name in ("DateTime", "DateTimeOriginal"): sensitive["datetime"] = val
                if "Serial" in tag_name: sensitive["serial_number"] = val
                if "Lens" in tag_name: sensitive["lens"] = val
                if tag_name == "Software": sensitive["software"] = val
            except Exception:
                pass

    detailed = {
        "ISO": pretty_exif.get("EXIF ISOSpeedRatings"),
        "ExposureTime": pretty_exif.get("EXIF ExposureTime"),
        "Aperture": pretty_exif.get("EXIF FNumber"),
        "FocalLength": pretty_exif.get("EXIF FocalLength"),
    }

    return jsonify({
        "filename": file.filename,
        "hash": sha256_hash,
        "sensitive": sensitive,
        "gps": gps,
        "detailed": detailed,
        "exif_pretty": pretty_exif
    })


@app.route("/strip", methods=["POST"])
def strip_exif():
    """mode = all | gps | camera"""
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    file = request.files['image']
    mode = request.form.get("mode", "all")
    raw = file.read()
    img = Image.open(io.BytesIO(raw))
    try:
        exif_dict = piexif.load(raw)
    except Exception:
        exif_dict = {}

    if mode == "gps" and "GPS" in exif_dict:
        exif_dict["GPS"] = {}
    elif mode == "camera":
        zeroth = exif_dict.get("0th", {})
        exif_ifd = exif_dict.get("Exif", {})
        for t in [piexif.ImageIFD.Make, piexif.ImageIFD.Model, piexif.ExifIFD.BodySerialNumber]:
            zeroth.pop(t, None)
            exif_ifd.pop(t, None)
        exif_dict["0th"], exif_dict["Exif"] = zeroth, exif_ifd
    elif mode == "all":
        exif_dict = {}

    exif_bytes = piexif.dump(exif_dict)
    out = io.BytesIO()
    fmt = img.format or "JPEG"
    if img.mode in ("RGBA", "P"): img = img.convert("RGB")
    img.save(out, format=fmt, exif=exif_bytes)
    out.seek(0)
    return send_file(out, as_attachment=True, download_name=f"stripped_{mode}_{file.filename}")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5009, debug=True)

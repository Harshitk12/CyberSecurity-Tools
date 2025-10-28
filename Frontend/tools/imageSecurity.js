const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const inspectBtn = document.getElementById("inspectBtn");
const stripGpsBtn = document.getElementById("stripGpsBtn");
const stripCamBtn = document.getElementById("stripCamBtn");
const stripAllBtn = document.getElementById("stripAllBtn");
const downloadBtn = document.getElementById("downloadBtn");
const resultsDiv = document.getElementById("results");
const fileInfo = document.getElementById("fileInfo");
const gpsInfo = document.getElementById("gpsInfo");
const detailedPre = document.getElementById("detailed");
const allTagsDiv = document.getElementById("allTags");
const themeToggle = document.getElementById("themeToggle");

let file = null;
let result = null;
let mapInstance = null;

fileInput.addEventListener("change", (e) => {
  file = e.target.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  resultsDiv.classList.add("hidden");
});

document.getElementById("dropZone").addEventListener("dragover", (e) => {
  e.preventDefault();
});
document.getElementById("dropZone").addEventListener("drop", (e) => {
  e.preventDefault();
  file = e.dataTransfer.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  resultsDiv.classList.add("hidden");
});

inspectBtn.onclick = async () => {
  if (!file) return alert("Please select an image!");
  inspectBtn.textContent = "Analyzing...";
  const form = new FormData();
  form.append("image", file);
  try {
    const res = await fetch("http://localhost:5000/upload", {
      method: "POST",
      body: form,
    });
    result = await res.json();
    showResults();
  } catch (err) {
    alert("Error connecting to backend!");
  }
  inspectBtn.textContent = "🔍 Inspect EXIF";
};

function showResults() {
  resultsDiv.classList.remove("hidden");
  stripGpsBtn.classList.remove("hidden");
  stripCamBtn.classList.remove("hidden");
  stripAllBtn.classList.remove("hidden");
  downloadBtn.classList.remove("hidden");

  fileInfo.innerHTML = `
    📁 File: ${result.filename}<br>
    🔐 SHA256: ${result.hash}<br>
    📸 Camera: ${result.sensitive?.camera_make || "Unknown"} ${
    result.sensitive?.camera_model || ""
  }<br>
    🕒 Date: ${result.sensitive?.datetime || "N/A"}<br>
    🌍 GPS: ${result.gps ? "✅ Present" : "❌ None"}
  `;

  gpsInfo.innerHTML = "";
  if (result.gps) {
    gpsInfo.innerHTML = `<div id="map"></div>`;
    const mapDiv = document.getElementById("map");
    mapDiv.style.height = "300px";

    if (mapInstance) mapInstance.remove();
    mapInstance = L.map("map").setView(
      [result.gps.latitude, result.gps.longitude],
      13
    );

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(mapInstance);

    L.marker([result.gps.latitude, result.gps.longitude])
      .addTo(mapInstance)
      .bindPopup(result.filename)
      .openPopup();
  }

  detailedPre.textContent = JSON.stringify(result.detailed, null, 2);

  allTagsDiv.innerHTML = Object.entries(result.exif_pretty || {})
    .map(([k, v]) => `<div><b>${k}</b>: ${v}</div>`)
    .join("");
}

async function strip(mode) {
  if (!file) return;
  const form = new FormData();
  form.append("image", file);
  form.append("mode", mode);
  try {
    const res = await fetch("http://localhost:5000/strip", {
      method: "POST",
      body: form,
    });
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stripped_${mode}_${file.name}`;
    a.click();
  } catch {
    alert("Failed to strip metadata!");
  }
}

stripGpsBtn.onclick = () => strip("gps");
stripCamBtn.onclick = () => strip("camera");
stripAllBtn.onclick = () => strip("all");

downloadBtn.onclick = () => {
  if (!result) return;
  const blob = new Blob([JSON.stringify(result, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `report_${result.filename}.json`;
  a.click();
};

themeToggle.onclick = () => {
  document.body.classList.toggle("dark");
  themeToggle.textContent = document.body.classList.contains("dark")
    ? "☀️ Light Mode"
    : "🌙 Dark Mode";
};

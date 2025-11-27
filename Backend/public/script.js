// --- Dark Mode Logic ---
const themeBtn = document.getElementById('theme-btn');
const html = document.documentElement;
const icon = themeBtn.querySelector('i');

// Check local storage or system preference on load
const savedTheme = localStorage.getItem('theme');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
    html.setAttribute('data-theme', 'dark');
    icon.setAttribute('data-lucide', 'sun');
} else {
    // Ensure light mode icon is set default
    icon.setAttribute('data-lucide', 'moon');
}

themeBtn.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    if (currentTheme === 'dark') {
        html.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        icon.setAttribute('data-lucide', 'moon');
    } else {
        html.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        icon.setAttribute('data-lucide', 'sun');
    }
    lucide.createIcons(); // Refresh icons to update moon/sun
});

// --- Tab Switching ---
function switchTab(tab) {
    // Hide all panels
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    // Deactivate all tab buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    // Show target panel
    document.getElementById(`${tab}-panel`).classList.add('active');
    
    // Activate target button
    // (We find the button that calls this specific tab)
    const btns = document.querySelectorAll('.tab-btn');
    if(tab === 'encode') btns[0].classList.add('active');
    else btns[1].classList.add('active');
}

// --- File Handling Helper ---
function setupFileUpload(dropZoneId, inputId, previewContainerId, imgId, nameSpanId) {
    const dropZone = document.getElementById(dropZoneId);
    const input = document.getElementById(inputId);
    const previewContainer = document.getElementById(previewContainerId);
    const img = document.getElementById(imgId);
    const nameSpan = document.getElementById(nameSpanId);

    // Click to upload
    dropZone.addEventListener('click', () => input.click());

    // File selected via dialog
    input.addEventListener('change', (e) => handleFile(e.target.files[0]));

    // Drag and drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--primary)';
        dropZone.style.backgroundColor = 'var(--drop-hover)';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.backgroundColor = 'var(--drop-bg)';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
        dropZone.style.backgroundColor = 'var(--drop-bg)';
        
        if (e.dataTransfer.files.length) {
            // Update input files with dropped file
            input.files = e.dataTransfer.files;
            handleFile(e.dataTransfer.files[0]);
        }
    });

    function handleFile(file) {
        if (!file) return;
        
        // Basic validation for image type if needed
        if (!file.type.startsWith('image/')) {
            showToast('Please upload an image file.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
            nameSpan.textContent = file.name;
            previewContainer.classList.remove('hidden');
            dropZone.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
}

// Initialize file handlers for both forms
setupFileUpload('encode-drop', 'encode-file', 'encode-preview-container', 'encode-preview', 'encode-filename');
setupFileUpload('decode-drop', 'decode-file', 'decode-preview-container', 'decode-preview', 'decode-filename');

// --- Status Toast ---
const toast = document.getElementById('status-toast');
function showToast(msg, type = 'info') {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    
    // Reset styles
    toast.style.backgroundColor = '';
    toast.style.color = '';

    if (type === 'error') {
        toast.style.backgroundColor = '#ef4444'; // Red
        toast.style.color = '#ffffff';
    } else if (type === 'success') {
        toast.style.backgroundColor = '#22c55e'; // Green
        toast.style.color = '#ffffff';
    } else {
        toast.style.backgroundColor = 'var(--text)'; // Default dark/light contrast
        toast.style.color = 'var(--bg)';
    }
    
    // Auto hide after 3 seconds
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// --- Encode Submission ---
document.getElementById('encode-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    showToast('Encoding... Please wait.');

    try {
        const res = await fetch('/encode', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
            showToast('Success! Downloading image...', 'success');
            // Trigger download
            window.location.href = data.download_url;
        } else {
            showToast(data.error || 'Encoding failed', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Server connection error', 'error');
    }
});

// --- Decode Submission ---
document.getElementById('decode-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    showToast('Decoding... Please wait.');
    document.getElementById('result-area').classList.add('hidden');

    try {
        const res = await fetch('/decode', { method: 'POST', body: formData });
        const data = await res.json();

        if (data.success) {
            showToast('Message extracted!', 'success');
            document.getElementById('decoded-output').textContent = data.message;
            document.getElementById('result-area').classList.remove('hidden');
        } else {
            showToast(data.error || 'Failed to decode', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Server connection error', 'error');
    }
});
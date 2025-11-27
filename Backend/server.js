const express = require('express');
const multer = require('multer');
const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3015;

// --- DIRECTORY SETUP ---
// Uploads go to a private folder in the root to keep them clean
const UPLOAD_DIR = path.join(__dirname, 'uploads');
// Downloads go to 'public/downloads' so the browser can access them via URL
const DOWNLOAD_DIR = path.join(__dirname, 'public', 'downloads');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// --- MIDDLEWARE ---
// Serve static files (HTML, CSS, JS) from the 'public' folder
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configure Multer for handling file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- STEGANOGRAPHY LOGIC ---

// Convert string to binary with an EOF delimiter
function messageToBinary(message) {
    message += "_EOF_"; 
    let binary = "";
    for (let i = 0; i < message.length; i++) {
        let binChar = message[i].charCodeAt(0).toString(2);
        binary += "0".repeat(8 - binChar.length) + binChar;
    }
    return binary;
}

// Convert binary string back to text
function binaryToMessage(binary) {
    let message = "";
    for (let i = 0; i < binary.length; i += 8) {
        let byte = binary.slice(i, i + 8);
        message += String.fromCharCode(parseInt(byte, 2));
    }
    return message;
}

// Calculate complexity (standard deviation) of an 8x8 block
function calculateBlockComplexity(image, startX, startY) {
    let values = [];
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            if (startX + x >= image.bitmap.width || startY + y >= image.bitmap.height) continue;
            const idx = image.getPixelIndex(startX + x, startY + y);
            values.push(image.bitmap.data[idx]);     // R
            values.push(image.bitmap.data[idx + 1]); // G
            values.push(image.bitmap.data[idx + 2]); // B
        }
    }
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

// Get blocks sorted by complexity (Adaptive LSB)
function getSortedBlocks(image) {
    let blocks = [];
    for (let y = 0; y < image.bitmap.height; y += 8) {
        for (let x = 0; x < image.bitmap.width; x += 8) {
            let complexity = calculateBlockComplexity(image, x, y);
            blocks.push({ x, y, complexity });
        }
    }
    return blocks.sort((a, b) => b.complexity - a.complexity);
}

// --- ROUTES ---

// Encode Endpoint
app.post('/encode', upload.single('image'), async (req, res) => {
    if (!req.file || !req.body.message) {
        return res.status(400).json({ error: 'Missing image or message' });
    }

    try {
        const image = await Jimp.read(req.file.path);
        const binaryMessage = messageToBinary(req.body.message);
        
        const capacity = image.bitmap.width * image.bitmap.height * 3;
        if (binaryMessage.length > capacity) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Message is too long for this image.' });
        }

        const sortedBlocks = getSortedBlocks(image);
        let dataIndex = 0;

        for (let block of sortedBlocks) {
            if (dataIndex >= binaryMessage.length) break;
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    let pxX = block.x + x;
                    let pxY = block.y + y;
                    
                    if (pxX >= image.bitmap.width || pxY >= image.bitmap.height) continue;
                    if (dataIndex >= binaryMessage.length) break;

                    let idx = image.getPixelIndex(pxX, pxY);
                    
                    // Modify RGB channels (LSB replacement)
                    for (let i = 0; i < 3; i++) {
                        if (dataIndex < binaryMessage.length) {
                            let val = image.bitmap.data[idx + i];
                            val = (val & 0xFE) | parseInt(binaryMessage[dataIndex]);
                            image.bitmap.data[idx + i] = val;
                            dataIndex++;
                        }
                    }
                }
            }
        }

        const outputFilename = `stego_${uuidv4()}.png`;
        const outputPath = path.join(DOWNLOAD_DIR, outputFilename);
        
        await image.writeAsync(outputPath);
        fs.unlinkSync(req.file.path); // Clean up uploaded file

        // Return path relative to the 'public' folder
        res.json({ success: true, download_url: `/downloads/${outputFilename}` });

    } catch (err) {
        console.error(err);
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Processing failed.' });
    }
});

// Decode Endpoint
app.post('/decode', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    try {
        const image = await Jimp.read(req.file.path);
        const sortedBlocks = getSortedBlocks(image);
        let binaryData = "";
        
        for (let block of sortedBlocks) {
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    let pxX = block.x + x;
                    let pxY = block.y + y;
                    if (pxX >= image.bitmap.width || pxY >= image.bitmap.height) continue;

                    let idx = image.getPixelIndex(pxX, pxY);
                    
                    // Read LSBs
                    for (let i = 0; i < 3; i++) {
                        binaryData += (image.bitmap.data[idx + i] & 1).toString();
                    }
                }
            }
        }

        const fullText = binaryToMessage(binaryData);
        const eofIndex = fullText.indexOf("_EOF_");

        fs.unlinkSync(req.file.path); // Clean up uploaded file

        if (eofIndex !== -1) {
            res.json({ success: true, message: fullText.substring(0, eofIndex) });
        } else {
            res.status(404).json({ error: 'No hidden message found or data corrupted.' });
        }

    } catch (err) {
        console.error(err);
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Decoding failed.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
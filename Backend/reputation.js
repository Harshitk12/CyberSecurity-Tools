// Import required libraries
const express = require('express');
const fetch = require('node-fetch'); // Use require('node-fetch') for older Node.js, or just global 'fetch' for v18+
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Create an express app
const app = express();
const PORT = 3000;

// Get the API key from the environment variables
const VIRUSTOTAL_API_KEY = process.env.VT_API_KEY;
const VIRUSTOTAL_BASE_URL = 'https://www.virustotal.com/api/v3';

// --- Middleware ---
// 1. Enable CORS (Cross-Origin Resource Sharing)
app.use(cors());
// 2. Enable Express to parse JSON bodies
app.use(express.json());

// --- Routes ---
// Serve the static files (index.html, style.css, script.js)
app.use(express.static('.'));

// Create the backend endpoint that our frontend will call
app.post('/check-reputation', async (req, res) => {
    // Get the target and type from the frontend
    const { target, type } = req.body;

    if (!target) {
        return res.status(400).json({ error: 'Missing "target" in request.' });
    }

    // Security check: Only allow 'ip' type
    if (type !== 'ip') {
        return res.status(400).json({ error: 'Invalid check type. This server only checks IPs.' });
    }

    if (!VIRUSTOTAL_API_KEY) {
        return res.status(500).json({ error: 'Server is missing API key.' });
    }

    // Endpoint is now hard-coded for IP addresses
    const endpoint = `${VIRUSTOTAL_BASE_URL}/ip_addresses/${target}`;

    try {
        // Make the call to VirusTotal from the server
        const vtResponse = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'x-apikey': VIRUSTOTAL_API_KEY
            }
        });

        // Handle errors from VirusTotal
        if (vtResponse.status === 401) {
            return res.status(500).json({ error: 'Invalid VirusTotal API Key on server.' });
        }
        if (vtResponse.status === 404) {
            return res.status(404).json({ error: `The IP "${target}" was not found in VirusTotal.` });
        }
        if (!vtResponse.ok) {
            return res.status(500).json({ error: `VirusTotal API error: ${vtResponse.statusText}` });
        }

        // Send the successful data back to the frontend
        const data = await vtResponse.json();
        res.json(data);

    } catch (error) {
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    if (!VIRUSTOTAL_API_KEY) {
        console.warn('WARNING: VT_API_KEY is not set in your .env file. The application will not work.');
    } else {
        console.log('VirusTotal API key loaded successfully.');
    }
});


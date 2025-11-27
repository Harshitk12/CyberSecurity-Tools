const express = require('express');
const path = require('path');
const app = express();
const PORT = 3005;

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Default route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`PDF Analyzer running at http://localhost:${PORT}`);
});
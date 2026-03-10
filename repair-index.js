const fs = require('fs');

try {
    const filePath = 'functions/index.js';
    const content = fs.readFileSync(filePath);

    // Convert to string assuming utf8, but if there are null bytes caused by UTF-16 append, removing them usually fixes source code.
    let text = content.toString('utf8');

    // Check if we have null bytes
    if (text.includes('\u0000')) {
        console.log("Found null bytes. Removing...");
        text = text.replace(/\u0000/g, '');
        fs.writeFileSync(filePath, text, 'utf8');
        console.log("File repaired.");
    } else {
        console.log("No null bytes found.");
    }
} catch (e) {
    console.error("Error:", e);
}

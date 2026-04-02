const fs = require('fs');

const md = fs.readFileSync('markdown.md', 'utf8');
const lines = md.split('\n');

let isInsideCase = false;
let currentContext = '';
let updateBuffer = '';

const rxCase = /cas clinique/i;
const rxQuestion = /^(\d+)[-.)]\s*(.*)/;
const rxChoice = /^([A-Z])[-.)]\s*(.*)/i;
const rxHeader = /^#/;
const rxPage = /^\d+$/; // Page numbers

const questionContexts = [];

for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;
    
    // Ignore simple page numbers
    if (rxPage.test(line)) continue;

    if (rxHeader.test(line)) {
        if (line.match(rxCase)) {
            isInsideCase = true;
            currentContext = '';
            updateBuffer = '';
            continue;
        } else {
            // maybe it's not a case header, just a normal header (Subject or Module)
            // Some questions have # before them: # 14- Amine...
            const qMatch = line.match(/^#?\s*(\d+)\s*[-.)]\s*(.*)/);
            if (qMatch) {
               // it's a question! Fall through to question check
            } else {
               isInsideCase = false;
               currentContext = '';
               updateBuffer = '';
               continue;
            }
        }
    }

    const qMatch = line.match(/^#?\s*(\d+)\s*[-.)]\s*(.*)/);
    if (qMatch) {
        if (isInsideCase) {
            if (updateBuffer.trim()) {
                currentContext += (currentContext ? '\n\n' : '') + updateBuffer.trim();
                updateBuffer = '';
            }
            questionContexts.push({
                qNum: qMatch[1],
                qText: qMatch[2],
                context: currentContext
            });
        }
        continue;
    }

    const cMatch = line.match(rxChoice);
    if (cMatch) {
        continue; // It's a choice, do nothing
    }

    // If it's plain text and we are inside a case:
    if (isInsideCase) {
        updateBuffer += (updateBuffer ? ' ' : '') + rawLine.trim();
    }
}

// Find questions 9,10,11,12 for verification
console.log(questionContexts.filter(q => ['9','10','11','12'].includes(q.qNum) && q.context.includes('pariéto-temporal')));

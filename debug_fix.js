const fs = require('fs');

const md = fs.readFileSync('markdown.md', 'utf8');
const lines = md.split('\n');

let isInsideCase = false;
let currentContext = '';
let updateBuffer = '';
const rxCase = /cas clinique/i;
const rxHeader = /^#/;
const rxPage = /^\d+$/;

const parsedQuestions = [];

for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;
    if (rxPage.test(line)) continue;

    if (rxHeader.test(line)) {
        if (line.match(rxCase)) {
            isInsideCase = true;
            currentContext = '';
            updateBuffer = '';
            continue;
        } else {
            const qMatch = line.match(/^#?\s*(\d+)\s*[-.)]\s*(.*)/);
            if (!qMatch) {
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
            parsedQuestions.push({
                qNum: qMatch[1],
                qText: qMatch[2],
                context: currentContext
            });
        }
        continue;
    }

    if (/^([A-Z])[-.)]\s*(.*)/i.test(line)) continue;

    if (isInsideCase) {
        updateBuffer += (updateBuffer ? ' ' : '') + rawLine.trim();
    }
}

const dbRaw = fs.readFileSync('ataraxie_s8_db.js', 'utf8');
const dbJsonStr = dbRaw.substring(dbRaw.indexOf('{'), dbRaw.lastIndexOf('}') + 1);
const db = JSON.parse(dbJsonStr);

function clean(str) {
    if(!str) return '';
    return str.replace(/\s+/g, ' ').trim();
}

console.log("Parsed " + parsedQuestions.length + " questions with contexts from MD.");
if (parsedQuestions.length > 0) {
    console.log("Sample MD Q: ", parsedQuestions.find(q => q.qNum === "11" && q.context.includes("pariéto")));
}

let noMatchCount = 0;
let dbCases = 0;
db.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                if (q.clinical_context) {
                    dbCases++;
                    const qDbText = clean(q.question_text);
                    const partialMatches = parsedQuestions.filter(p => {
                        const mp = clean(p.qText);
                        return mp === qDbText || mp.includes(qDbText) || qDbText.includes(mp);
                    });
                    if(partialMatches.length === 0) noMatchCount++;
                }
            });
        });
    });
});
console.log("Total DB qs with context:", dbCases);
console.log("No match found for:", noMatchCount);

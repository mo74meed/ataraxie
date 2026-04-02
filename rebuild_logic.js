const fs = require('fs');

const md = fs.readFileSync('markdown.md', 'utf8');
const lines = md.split('\n');

let isInsideCase = false;
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
            updateBuffer = '';
            continue;
        } else {
            const qMatch = line.match(/^#?\s*(\d+)\s*[-.)]\s*(.*)/);
            if (!qMatch) {
               isInsideCase = false;
               updateBuffer = '';
               continue;
            }
        }
    }

    const qMatch = line.match(/^#?\s*(\d+)\s*[-.)]\s*(.*)/);
    if (qMatch) {
        if (isInsideCase) {
            const ctxText = updateBuffer.trim() ? updateBuffer.trim() : null;
            parsedQuestions.push({
                qNum: qMatch[1],
                qText: qMatch[2],
                context: ctxText
            });
            updateBuffer = ''; // consume the buffer explicitly
        }
        continue;
    }

    if (/^([A-Z])[-.)]\s*(.*)/i.test(line)) continue;

    if (isInsideCase) {
        updateBuffer += (updateBuffer ? ' ' : '') + rawLine.trim();
    }
}

const dbRawPath = 'ataraxie_s8_db.js';
const dbRawWWWPath = 'www/ataraxie_s8_db.js';

const dbRaw = fs.readFileSync(dbRawPath, 'utf8');
const dbJsonStr = dbRaw.substring(dbRaw.indexOf('{'), dbRaw.lastIndexOf('}') + 1);
const db = JSON.parse(dbJsonStr);

function clean(str) {
    if(!str) return '';
    return str.replace(/\s+/g, ' ').trim();
}

let overrides = 0;

db.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                const qDbText = clean(q.question_text);
                const qDbHint = q.id.split('-').pop();
                const num = parseInt(qDbHint.replace('Q', ''), 10).toString();
                
                let bestMatch = null;
                const matches = parsedQuestions.filter(p => clean(p.qText) === qDbText);
                if (matches.length > 0) {
                    bestMatch = matches.find(m => m.qNum === num) || matches[0];
                } else {
                    const partialMatches = parsedQuestions.filter(p => {
                        const mp = clean(p.qText);
                        return mp === qDbText || mp.includes(qDbText) || qDbText.includes(mp);
                    });
                    if (partialMatches.length > 0) {
                        bestMatch = partialMatches.find(m => m.qNum === num) || partialMatches[0];
                    }
                }
                
                function isInsideACaseInDb() {
                    return q.clinical_context || (bestMatch && bestMatch.context !== null);
                }
                
                if (bestMatch && isInsideACaseInDb()) {
                    const oldCtx = q.clinical_context ? clean(q.clinical_context) : null;
                    const newCtx = bestMatch.context ? clean(bestMatch.context) : null;
                    if (oldCtx !== newCtx) {
                        q.clinical_context = bestMatch.context;
                        overrides++;
                    }
                }
            });
        });
    });
});

console.log("Applied non-repetitive contexts: ", overrides);

if (overrides > 0) {
    const prefix = dbRaw.substring(0, dbRaw.indexOf('{'));
    const finalContent = prefix + JSON.stringify(db, null, 2) + ';\n';
    
    fs.writeFileSync(dbRawPath, finalContent, 'utf8');
    fs.writeFileSync(dbRawWWWPath, finalContent, 'utf8');
    console.log("Saved ataraxie_s8_db.js and www/ataraxie_s8_db.js with chunked contexts!");
}

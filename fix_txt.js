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
            updateBuffer = ''; 
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
    return str.replace(/\s+|\\n/g, ' ').trim();
}

let overrides = 0;
let qTextOverrides = 0;

db.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                const qDbText = clean(q.question_text);
                const qDbHint = q.id.split('-').pop(); // '01', '17' etc
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
                    return q.clinical_context !== undefined && q.clinical_context !== null || (bestMatch && bestMatch.context !== null);
                }
                
                if (bestMatch && isInsideACaseInDb()) {
                    // Update the context
                    const oldCtx = q.clinical_context;
                    const newCtx = bestMatch.context;
                    if (oldCtx !== newCtx) {
                        q.clinical_context = newCtx;
                        overrides++;
                    }
                    
                    // IF the db question text contains newlines, or extra text, we strip it out and overwrite with exactly what the markdown parser thought the question text was!
                    if (q.question_text !== bestMatch.qText && q.question_text.includes('\\n')) {
                        // The DB string is bloated with \n tags that used to belong to the context. Revert to raw qText
                        q.question_text = bestMatch.qText;
                        qTextOverrides++;
                    } else if (q.question_text.length > bestMatch.qText.length + 10 && q.question_text.includes(bestMatch.qText)) {
                        // DB string has more garbage appended. Strip it to the markdown line!
                        q.question_text = bestMatch.qText;
                        qTextOverrides++;
                    }
                }
            });
        });
    });
});

console.log("Applied context overrides: ", overrides);
console.log("Applied question_text overrides to remove merged context: ", qTextOverrides);

if (overrides > 0 || qTextOverrides > 0) {
    const prefix = dbRaw.substring(0, dbRaw.indexOf('{'));
    const finalContent = prefix + JSON.stringify(db, null, 2) + ';\n';
    
    fs.writeFileSync(dbRawPath, finalContent, 'utf8');
    fs.writeFileSync(dbRawWWWPath, finalContent, 'utf8');
    console.log("Saved ataraxie_s8_db.js and www/ataraxie_s8_db.js having stripped the merged text from the actual questions!");
}

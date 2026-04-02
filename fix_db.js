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

// We store parsed questions.
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
            if (qMatch) {
               // fall through
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
            parsedQuestions.push({
                qNum: qMatch[1],
                qText: qMatch[2],
                context: currentContext
            });
        }
        continue;
    }

    const cMatch = line.match(rxChoice);
    if (cMatch) {
        continue;
    }

    if (isInsideCase) {
        updateBuffer += (updateBuffer ? ' ' : '') + rawLine.trim();
    }
}

// 2. Load DB
const dbRaw = fs.readFileSync('ataraxie_s8_db.js', 'utf8');
// Extract the JSON part
const dbJsonStr = dbRaw.substring(dbRaw.indexOf('{'), dbRaw.lastIndexOf('}') + 1);
const db = JSON.parse(dbJsonStr);

let updateCount = 0;

function clean(str) {
    if(!str) return '';
    return str.replace(/\s+/g, ' ').trim();
}

// 3. Apply Contexts
db.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                // If it has a clinical context, we should try to update it using parsedQuestions.
                if (q.clinical_context) {
                    // Find matching question in parsedQuestions by text similarity
                    // Some DB strings might have minor changes so we compare cleaned strings
                    const qDbText = clean(q.question_text);
                    const qDbHint = q.id.split('-').pop(); // e.g. Q09 -> 09
                    const num = parseInt(qDbHint.replace('Q', ''), 10).toString();
                    
                    const matches = parsedQuestions.filter(p => {
                       return clean(p.qText) === qDbText;
                    });
                    
                    if (matches.length > 0) {
                        // find nearest by number if multiple matches
                        // or just take first
                        let bestMatch = matches.find(m => m.qNum === num) || matches[0];
                        
                        if (q.clinical_context !== bestMatch.context) {
                            q.clinical_context = bestMatch.context;
                            updateCount++;
                        }
                    } else {
                        // try to match just by doing includes
                        const partialMatches = parsedQuestions.filter(p => {
                            return clean(p.qText).includes(qDbText) || qDbText.includes(clean(p.qText));
                        });
                        if(partialMatches.length > 0) {
                            let bestMatch = partialMatches.find(m => m.qNum === num) || partialMatches[0];
                            if (q.clinical_context !== bestMatch.context) {
                                q.clinical_context = bestMatch.context;
                                updateCount++;
                            }
                        }
                    }
                }
            });
        });
    });
});

console.log('Updated ' + updateCount + ' contexts in DB.');

// 4. Save DB
const prefix = dbRaw.substring(0, dbRaw.indexOf('{'));
fs.writeFileSync('ataraxie_s8_db.js', prefix + JSON.stringify(db, null, 2) + ';\n', 'utf8');

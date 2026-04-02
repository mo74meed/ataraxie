const fs = require('fs');

const md = fs.readFileSync('markdown.md', 'utf8');
const lines = md.split('\n');

let isInsideCase = false;
const parsedQuestions = [];

for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    const qMatch = line.match(/^#?\s*(\d+)\s*[-.)]\s*(.*)/);
    if (qMatch) {
       parsedQuestions.push({
           qNum: qMatch[1],
           qText: qMatch[2]
       });
    }
}

const dbRawPath = 'ataraxie_s8_db.js';
const dbRaw = fs.readFileSync(dbRawPath, 'utf8');
const dbJsonStr = dbRaw.substring(dbRaw.indexOf('{'), dbRaw.lastIndexOf('}') + 1);
const db = JSON.parse(dbJsonStr);

function clean(str) {
    if(!str) return '';
    return str.replace(/\s+/g, ' ').trim();
}

let fixes = 0;
db.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                const qDbHint = q.id.split('-').pop(); // '01', '17' etc
                const num = parseInt(qDbHint.replace('Q', ''), 10).toString();
                
                // Matches the question by Number
                // Ensure it belongs to the same general text to avoid cross-subject clashes
                const cDb = clean(q.question_text);
                const candidates = parsedQuestions.filter(p => p.qNum === num && cDb.startsWith(clean(p.qText)));
                
                if (candidates.length > 0) {
                    const best = candidates[0];
                    if (q.question_text.length > best.qText.length + 5) {
                        // The question in DB has extra data beyond what the markdown question line had
                        q.question_text = best.qText;
                        fixes++;
                    }
                }
            });
        });
    });
});

console.log("Trimmed trailing text from " + fixes + " questions.");
const prefix = dbRaw.substring(0, dbRaw.indexOf('{'));
fs.writeFileSync(dbRawPath, prefix + JSON.stringify(db, null, 2) + ';\n', 'utf8');
fs.writeFileSync('www/ataraxie_s8_db.js', prefix + JSON.stringify(db, null, 2) + ';\n', 'utf8');

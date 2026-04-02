const fs = require('fs');
const dbRawPath = 'ataraxie_s8_db.js';
const dbRaw = fs.readFileSync(dbRawPath, 'utf8');
const dbJsonStr = dbRaw.substring(dbRaw.indexOf('{'), dbRaw.lastIndexOf('}') + 1);
const db = JSON.parse(dbJsonStr);

let count = 0;
let fixes = 0;
db.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                if (q.question_text && q.question_text.includes('\\n')) {
                    count++;
                    const parts = q.question_text.split('\\n');
                    // We only want the first part to be the question! The rest is context or garbage that got attached.
                    q.question_text = parts[0];
                    fixes++;
                } else if (q.question_text && q.question_text.includes('\n')) {
                    count++;
                    const parts = q.question_text.split('\n');
                    q.question_text = parts[0];
                    fixes++;
                }
            });
        });
    });
});

console.log("Found: ", count, " Fixed: ", fixes);
const prefix = dbRaw.substring(0, dbRaw.indexOf('{'));
fs.writeFileSync(dbRawPath, prefix + JSON.stringify(db, null, 2) + ';\n', 'utf8');
fs.writeFileSync('www/ataraxie_s8_db.js', prefix + JSON.stringify(db, null, 2) + ';\n', 'utf8');

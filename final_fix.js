const fs = require('fs');

const dbRawPath = 'ataraxie_s8_db.js';
const dbRawWWWPath = 'www/ataraxie_s8_db.js';
const dbRaw = fs.readFileSync(dbRawPath, 'utf8');
const dbJsonStr = dbRaw.substring(dbRaw.indexOf('{'), dbRaw.lastIndexOf('}') + 1);
const db = JSON.parse(dbJsonStr);

let fixedCount = 0;

db.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                if (q.question_text) {
                    let oldTxt = q.question_text;
                    // Properly break multiple sub-questions strung together as '. - ' or '? ' followed by a Capital letter
                    // The regex looks for a period or question mark, followed by space(s), followed by a dash or a capital letter starting a new sentence.
                    // We only want to do this for QROC, or QCM which also suffer from this formatting mash-up. Let's do it universally for formatting safety, but maybe just QROC.
                    if (q.type === 'QROC') {
                        let newTxt = oldTxt.replace(/([.?])\s+(?=-|[A-Z])/g, '\n');
                        // Also space dash directly?
                        // E.g 'central. - Examen' -> 'central.\n- Examen'
                        if (oldTxt !== newTxt) {
                            q.question_text = newTxt;
                            fixedCount++;
                        }
                    }
                }
            });
        });
    });
});

console.log("Fixed text string in objects: ", fixedCount);

if (fixedCount > 0) {
    const prefix = dbRaw.substring(0, dbRaw.indexOf('{'));
    const out = prefix + JSON.stringify(db, null, 2) + ';\n';
    fs.writeFileSync(dbRawPath, out, 'utf8');
    fs.writeFileSync(dbRawWWWPath, out, 'utf8');
    console.log("DB saved");
}

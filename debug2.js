const fs = require('fs');

const dbRawPath = 'ataraxie_s8_db.js';
const dbRaw = fs.readFileSync(dbRawPath, 'utf8');
const dbJsonStr = dbRaw.substring(dbRaw.indexOf('{'), dbRaw.lastIndexOf('}') + 1);
const db = JSON.parse(dbJsonStr);

let q17;
db.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                if(q.id === 'ANA-END-25-Q17') q17 = q;
            })
        })
    })
});

console.log('DB TEXT:');
console.log(q17.question_text);

const md = fs.readFileSync('markdown.md', 'utf8');
const lines = md.split('\n');
for(let line of lines) {
    if(line.includes('17- Citer les indications')) {
        console.log('MD TEXT:', line);
    }
}

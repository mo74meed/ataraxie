const fs = require('fs');
const jsCode = fs.readFileSync('./ataraxie_s8_db.js', 'utf8');
let ATARAXIE_S8_DB;
eval(jsCode + '\n ATARAXIE_S8_DB_global = ATARAXIE_S8_DB;');
const db = ATARAXIE_S8_DB_global;

let undefinedcount = 0;
let q11 = null;
let imgCount = 0;
db.categories.forEach(c => {
    c.submodules.forEach(sm => {
        sm.subjects.forEach(s => {
            s.questions.forEach(q => {
                if (q.question_text === undefined) undefinedcount++;
                if (q.question_text && q.question_text.includes('Définir les Termes suivants') && s.subject_name.includes('Introduction')) {
                    q11 = q;
                }
                if (q.question_text && q.question_text.includes('![image]')) imgCount++;
                if (q.clinical_context && q.clinical_context.includes('![image]')) imgCount++;
            });
        });
    });
});
console.log('Undefined question texts:', undefinedcount);
console.log('Image links found:', imgCount);
console.log('Q11 found:', q11 ? q11.question_text : 'no');

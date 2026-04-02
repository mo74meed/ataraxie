const fs = require("fs");

const dbRawPath = "ataraxie_s8_db.js";
const dbRawWWWPath = "www/ataraxie_s8_db.js";

const dbRaw = fs.readFileSync(dbRawPath, "utf8");
const dbJsonStr = dbRaw.substring(dbRaw.indexOf("{"), dbRaw.lastIndexOf("}") + 1);
const db = JSON.parse(dbJsonStr);

let overrides = 0;

db.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                const text = q.question_text;
                if (!text) return;
                
                let newText = text.replace(/([.?])\s+(?=-|[A-Z])/g, "$1\n");
                
                if (newText !== text) {
                    q.question_text = newText;
                    overrides++;
                }
            });
        });
    });
});

console.log("Updated texts: ", overrides);

if (overrides > 0) {
    const prefix = dbRaw.substring(0, dbRaw.indexOf("{"));
    const finalContent = prefix + JSON.stringify(db, null, 2) + ";\n";
    fs.writeFileSync(dbRawPath, finalContent, "utf8");
    fs.writeFileSync(dbRawWWWPath, finalContent, "utf8");
}

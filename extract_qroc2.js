const fs = require("fs");
const md = fs.readFileSync("markdown.md", "utf8");
const lines = md.split("\n");

const dbPath = "ataraxie_s8_db.js";
const dbWWWPath = "www/ataraxie_s8_db.js";
const dbRaw = fs.readFileSync(dbPath, "utf8");
const parsed = JSON.parse(dbRaw.substring(dbRaw.indexOf("{"), dbRaw.lastIndexOf("}") + 1));

let qrocBlocks = [];
let capturing = false;
let currentBlock = "";
let currentNum = "";

for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    
    if (/^\d+$/.test(line)) {
        continue;
    }
    
    if (line.match(/^#?\s*(\d+)\s*[-.)]\s*(.*)/)) {
        if (capturing) {
            qrocBlocks.push({ num: currentNum, text: currentBlock.trim() });
        }
        let m = line.match(/^#?\s*(\d+)\s*[-.)]\s*(.*)/);
        currentNum = m[1];
        currentBlock = m[2] + "\n";
        capturing = true;
    } else if (line.match(/^[A-Z]\s*[-.)]/) || line.match(/^#\s*cas clinique/i) || line.match(/^#/)) {
        if (capturing) {
            qrocBlocks.push({ num: currentNum, text: currentBlock.trim() });
        }
        capturing = false;
    } else {
        if (capturing) {
            currentBlock += line + "\n";
        }
    }
}
if (capturing) {
    qrocBlocks.push({ num: currentNum, text: currentBlock.trim() });
}

let fixes = 0;
parsed.categories.forEach(cat => {
    cat.submodules.forEach(sub => {
        sub.subjects.forEach(subj => {
            subj.questions.forEach(q => {
                if (q.type === "QROC") {
                    const qDbHint = q.id.split("-").pop();
                    const num = parseInt(qDbHint.replace("Q", ""), 10).toString();
                    
                    let bestBlock = null;
                    const candidates = qrocBlocks.filter(b => b.num === num);
                    if (candidates.length === 1) {
                         bestBlock = candidates[0];
                    } else if (candidates.length > 1) {
                         let qNorm = q.question_text.replace(/\s+/g,'');
                         for(let c of candidates) {
                             if (c.text.replace(/\s+/g,'').startsWith(qNorm.substring(0, 10)) ||
                                 qNorm.startsWith(c.text.replace(/\s+/g,'').substring(0, 10))) {
                                 bestBlock = c; break;
                             }
                         }
                    }
                    if (bestBlock) {
                         let ntLines = bestBlock.text.split("\n").map(l=>l.trim()).filter(l=>l);
                         let joined = ntLines.join("\n");
                         
                         // We also apply the requested fix: Subquestions with ? Et -> ?\nEt
                         joined = joined.replace(/([.?])\s+(?=-|[A-Z])/g, "$1\n");
                         
                         if (joined !== q.question_text) {
                              q.question_text = joined;
                              fixes++;
                         }
                    }
                }
            });
        });
    });
});

console.log("QROC fixes from markdown: ", fixes);
if (fixes > 0) {
    const prefix = dbRaw.substring(0, dbRaw.indexOf("{"));
    const finalContent = prefix + JSON.stringify(parsed, null, 2) + ";\n";
    fs.writeFileSync(dbPath, finalContent, "utf8");
    fs.writeFileSync(dbWWWPath, finalContent, "utf8");
}

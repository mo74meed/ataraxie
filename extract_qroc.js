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
    
    if (/^\d+/.test(line) && !line.match(/^#?\s*(\d+)\s*[-.)]\s*(.*)/)) {
        // Just page numbers
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
    } else if (line.match(/^[A-Z]\s*[-.)]/) || line.match(/^#\s*cas clinique/i)) {
        if (capturing) {
            qrocBlocks.push({ num: currentNum, text: currentBlock.trim() });
        }
        capturing = false;
    } else {
        if (capturing) {
            // Check if it's a QROC continuation or choice.
            // If it's a QROC continuation, we add it with a newline!
            // Wait, we only add a newline if it's a new paragraph format (like "- Examen...")
            // or just append with a space.
            // In markdown, if it's on a new line, let's keep it on a new line.
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
                    
                    // We must be careful to match the right question 
                    // Let's find blocks matching num and having some text similarity
                    let bestBlock = null;
                    const candidates = qrocBlocks.filter(b => b.num === num);
                    if (candidates.length === 1) {
                         bestBlock = candidates[0];
                    } else if (candidates.length > 1) {
                         // Find candidate that matches best
                         // Compare first 10 chars
                         for(let c of candidates) {
                             if(c.text.replace(/\s+/g,'').startsWith(q.question_text.replace(/\s+/g,'').substring(0,10))) {
                                 bestBlock = c; break;
                             }
                         }
                    }
                    if (bestBlock) {
                         // QROC text format
                         // we format standard newlines
                         let nt = bestBlock.text.split("\n").map(l=>l.trim()).filter(l=>l).join("\n");
                         if (nt !== q.question_text) {
                              q.question_text = nt;
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

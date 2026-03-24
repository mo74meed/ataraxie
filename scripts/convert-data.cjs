const fs = require('fs');
const path = require('path');

const raw = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');

// Extract the array from "const QUESTIONS_DATA = [...];"
const startIdx = raw.indexOf('[');
const data = eval('(' + raw.slice(startIdx) + ')');

const output = `import type { ChapterEntry } from '@/data/types';

const QUESTIONS_DATA: ChapterEntry[] = ${JSON.stringify(data, null, 2)};

export default QUESTIONS_DATA;
`;

const outPath = path.join(__dirname, '..', 'src', 'data', 'questions.ts');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, output, 'utf8');

console.log('Done! Entries:', data.length);
console.log('Questions:', data.reduce((s, e) => s + e.questions.length, 0));
console.log('Output:', outPath);

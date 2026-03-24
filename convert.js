const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\moham\\Desktop\\ataraxie\\data.js', 'utf8');
const json = content.replace(/^const QUESTIONS_DATA = /, '').replace(/;\s*$/, '');
fs.writeFileSync('c:\\Users\\moham\\Desktop\\ataraxie\\ataraxie-react\\public\\curriculum.json', json, 'utf8');
console.log('Conversion successful!');

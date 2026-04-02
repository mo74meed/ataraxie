const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('.qcard-enonce { white-space: pre-wrap; }')) {
    html = html.replace('</style>', '\n        .qcard-enonce, .qcard-contexte { white-space: pre-wrap; }\n    </style>');
    fs.writeFileSync('index.html', html, 'utf8');
    console.log('Appended pre-wrap to styles in index.html');
}

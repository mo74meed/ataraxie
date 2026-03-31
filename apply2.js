const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const modalsHTML = \
    <!-- Inline Modals -->
    <div id="inline-prompt-modal" class="reset-modal">
        <div class="reset-modal-content" style="max-width:320px;text-align:center;">
            <h3 id="inline-prompt-title" style="margin-top:0;margin-bottom:12px;font-size:1.1rem"></h3>
            <input type="text" id="inline-prompt-input" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--s3);background:var(--s0);color:var(--p0);margin-bottom:20px;font-family:inherit;box-sizing:border-box;">
            <div style="display:flex;gap:10px;justify-content:center;">
                <button class="reset-btn cancel" id="inline-prompt-cancel">Annuler</button>
                <button class="reset-danger-btn" id="inline-prompt-ok" style="background:var(--p500)">OK</button>
            </div>
        </div>
    </div>
    <div id="inline-confirm-modal" class="reset-modal">
        <div class="reset-modal-content" style="max-width:320px;text-align:center;">
            <h3 id="inline-confirm-title" style="margin-top:0;margin-bottom:12px;font-size:1.1rem"></h3>
            <p id="inline-confirm-msg" style="font-size:0.9rem;color:var(--t2);margin-bottom:20px"></p>
            <div style="display:flex;gap:10px;justify-content:center;">
                <button class="reset-btn cancel" id="inline-confirm-cancel">Annuler</button>
                <button class="reset-danger-btn" id="inline-confirm-ok">Confirmer</button>
            </div>
        </div>
    </div>
\;
if(!html.includes('inline-prompt-modal')) {
    html = html.replace('</body>', modalsHTML + '\\n</body>');
}

const logicJS = \
            function showInlinePrompt(title, defaultVal = '') {
                return new Promise(resolve => {
                    const m = document.getElementById('inline-prompt-modal'), ov = document.getElementById('ov');
                    document.getElementById('inline-prompt-title').textContent = title;
                    const inp = document.getElementById('inline-prompt-input');
                    inp.value = defaultVal;
                    m.classList.add('open'); ov.classList.add('vis');
                    inp.focus();
                    
                    const cleanup = () => { m.classList.remove('open'); ov.classList.remove('vis'); };
                    document.getElementById('inline-prompt-ok').onclick = () => { cleanup(); resolve(inp.value.trim()); };
                    document.getElementById('inline-prompt-cancel').onclick = () => { cleanup(); resolve(null); };
                });
            }
            function showInlineConfirm(title, msg, isDanger=false) {
                return new Promise(resolve => {
                    const m = document.getElementById('inline-confirm-modal'), ov = document.getElementById('ov');
                    document.getElementById('inline-confirm-title').textContent = title;
                    document.getElementById('inline-confirm-msg').textContent = msg;
                    const okBtn = document.getElementById('inline-confirm-ok');
                    if(!isDanger) { okBtn.style.background = 'var(--p500)'; } else { okBtn.style.background = ''; }
                    
                    m.classList.add('open'); ov.classList.add('vis');
                    
                    const cleanup = () => { m.classList.remove('open'); ov.classList.remove('vis'); };
                    okBtn.onclick = () => { cleanup(); resolve(true); };
                    document.getElementById('inline-confirm-cancel').onclick = () => { cleanup(); resolve(false); };
                });
            }
\;

if(!html.includes('function showInlinePrompt')) {
    html = html.replace('function emptyState', logicJS + '\\n            function emptyState');
}

html = html.replace("document.getElementById('btn-new-profile').onclick = () => {", "document.getElementById('btn-new-profile').onclick = async () => {");
html = html.replace(/const name = prompt\\('Nom du profil :'\\);/g, "const name = await showInlinePrompt('Nom du profil :');");

html = html.replace("btn.addEventListener('click', (e) => {", "btn.addEventListener('click', async (e) => {");
html = html.replace(/const newName = prompt\\('Nouveau nom :', p.name\\)/g, "const newName = await showInlinePrompt('Nouveau nom :', p.name)");

html = html.replace(/if \\(confirm\\('Supprimer.*\\?/g, "if (await showInlineConfirm('Supprimer le profil', 'Confirmez-vous cette suppression ?', true)");

html = html.replace("document.getElementById('reset-all-btn').onclick = () => {", "document.getElementById('reset-all-btn').onclick = async () => {");
html = html.replace(/if \\(confirm\\('Êtes-vous sûr de vouloir tout effacer \\?\\'\\)\\)/g, "if (await showInlineConfirm('Tout effacer', 'Êtes-vous sûr de vouloir tout effacer ?', true))");

html = html.replace("document.getElementById('reset-sel-btn').onclick = () => {", "document.getElementById('reset-sel-btn').onclick = async () => {");
html = html.replace(/if \\(!confirm\\(\Effacer \\$\\{sel.length\\}.*\\?\\\\)\\)/g, "if (!(await showInlineConfirm('Effacer', \Effacer \ matière(s) ?\, true)))");

fs.writeFileSync('index.html', html, 'utf8');


        (function () {
            'use strict';
            const CIRC = 2 * Math.PI * 17, L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const PK = 'ataraxie_profiles', APK = 'ataraxie_active_profile', OLD_SK = 'ataraxie_v3';
            let D = [], tQ = 0, sT = null, viewMode = 'mine';
            let tempCmpData = null, currentCmpEntry = null;

            /* ══════════ PROFILE SYSTEM ══════════ */
            function getProfiles() { try { const r = localStorage.getItem(PK); return r ? JSON.parse(r) : [] } catch (e) { return [] } }
            function saveProfiles(p) { localStorage.setItem(PK, JSON.stringify(p)) }
            function getActiveId() { return localStorage.getItem(APK) || null }
            function setActiveId(id) { localStorage.setItem(APK, id) }
            function profileSK(id) { return 'ataraxie_p_' + id }
            function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5) }
            function emptyState() { return { qcm: {}, red: {}, val: {}, sb: {}, sortChildren: {}, ac: null, his: {}, recent: [], official: {} } }

            function migrateIfNeeded() {
                let profiles = getProfiles();
                if (profiles.length === 0) {
                    const oldData = localStorage.getItem(OLD_SK);
                    const id = genId();
                    profiles = [{ id, name: 'Default', createdAt: Date.now() }];
                    saveProfiles(profiles); setActiveId(id);
                    if (oldData) {
                        try { const d = JSON.parse(oldData); if (!d.his) d.his = {}; if (!d.recent) d.recent = []; if (!d.official) d.official = {}; localStorage.setItem(profileSK(id), JSON.stringify(d)); } catch (e) { localStorage.setItem(profileSK(id), JSON.stringify(emptyState())); }
                    } else { localStorage.setItem(profileSK(id), JSON.stringify(emptyState())); }
                }
                if (!getActiveId() || !profiles.find(p => p.id === getActiveId())) {
                    setActiveId(profiles[0].id);
                }
            }

            migrateIfNeeded();
            let activeProfileId = getActiveId();
            let st = ld(), ak = null;

            function ld() { try { const r = localStorage.getItem(profileSK(activeProfileId)); if (r) { const d = JSON.parse(r); if (!d.his) d.his = {}; if (!d.recent) d.recent = []; if (!d.official) d.official = {}; if (!d.sortChildren) d.sortChildren = {}; return d } } catch (e) { } return emptyState() }
            function sv() { 
                clearTimeout(sT); 
                sT = setTimeout(() => { 
                    try { 
                        if (window.FirebaseAuthManager) { window.FirebaseAuthManager.saveProgress(profileSK(activeProfileId), st); }
                        else { localStorage.setItem(profileSK(activeProfileId), JSON.stringify(st)) }
                    } catch (e) { } 
                }, 200) 
            }
            function svNow() { 
                clearTimeout(sT); 
                try { 
                    if (window.FirebaseAuthManager) { return window.FirebaseAuthManager.saveProgress(profileSK(activeProfileId), st); }
                    else { 
                        localStorage.setItem(profileSK(activeProfileId), JSON.stringify(st)); 
                        return Promise.resolve();
                    }
                } catch (e) { return Promise.resolve(); } 
            }
            function mk(m, c, q) { return m + '§' + c + (q !== undefined ? '§' + q : '') }
            function isAns(key, type) {
                if (type === 'qcm') return (st.qcm[key] === "BLANK" || (st.qcm[key] && st.qcm[key].length > 0));
                return getPlainTextFromHtml(st.red[key]).length > 0;
            }

            function switchProfile(id) {
                svNow();
                activeProfileId = id; setActiveId(id);
                st = ld();
                st.sb = {}; // Enforce completely collapsed navbar on switch
                tempCmpData = null;
                const cp = document.getElementById('cmp-panel'); if (cp) cp.classList.remove('open');
                buildSB(); upProg(); upProfileUI();
                goHome();
            }
            function createProfile(name, data) {
                const id = genId(), profiles = getProfiles();
                profiles.push({ id, name, createdAt: Date.now() });
                saveProfiles(profiles);
                localStorage.setItem(profileSK(id), JSON.stringify(data || emptyState()));
                return id;
            }
            function deleteProfile(id) {
                let profiles = getProfiles().filter(p => p.id !== id);
                saveProfiles(profiles); localStorage.removeItem(profileSK(id));
                if (activeProfileId === id) { switchProfile(profiles[0].id); }
            }
            function renameProfile(id, name) {
                const profiles = getProfiles(); const p = profiles.find(x => x.id === id);
                if (p) { p.name = name; saveProfiles(profiles); upProfileUI(); }
            }
            function duplicateProfile(id) {
                if (id === activeProfileId) svNow();
                const profiles = getProfiles(), src = profiles.find(p => p.id === id);
                if (!src) return;
                const data = JSON.parse(localStorage.getItem(profileSK(id)) || JSON.stringify(emptyState()));
                createProfile(src.name + ' copy', data);
            }
            function upProfileUI() {
                const profiles = getProfiles(), active = profiles.find(p => p.id === activeProfileId);
                const nameEl = document.getElementById('profile-name');
                const avatarEl = document.getElementById('profile-avatar');
                if (active && nameEl) { nameEl.textContent = active.name; avatarEl.textContent = active.name.charAt(0).toUpperCase(); }
            }

            /* ══════════ HOME / HISTORY ══════════ */
            function goHome() {
                ak = null; st.ac = null; sv();
                document.getElementById('ws').style.display = '';
                document.getElementById('qc').style.display = 'none';
                document.getElementById('ht').textContent = 'Sélectionnez un chapitre';
                document.getElementById('hs').textContent = '';
                document.querySelectorAll('.sb-ch').forEach(b => b.classList.remove('active'));
                renderHistory(); upSubjectCanvas(); window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            function addRecent(mod, chap, targetQId = null) {
                const key = mk(mod, chap);
                if (!st.recent) st.recent = [];
                const existR = st.recent.find(r => r.key === key);
                const lastQ = targetQId || (existR ? existR.lastQId : null);
                st.recent = st.recent.filter(r => r.key !== key);
                st.recent.unshift({ key, module: mod, chapitre: chap, ts: Date.now(), lastQId: lastQ });
                if (st.recent.length > 25) st.recent.length = 25;
                sv();
            }
            function timeAgo(ts) {
                const s = Math.floor((Date.now() - ts) / 1000);
                if (s < 60) return 'À l\'instant';
                if (s < 3600) return Math.floor(s / 60) + ' min';
                if (s < 86400) return Math.floor(s / 3600) + ' h';
                return Math.floor(s / 86400) + ' j';
            }
            function renderHistory() {
                const c = document.getElementById('home-history');
                upSubjectCanvas();
                if (!st.recent || st.recent.length === 0) { c.innerHTML = '<div class="hist-empty">Aucun historique pour le moment. Sélectionnez un chapitre pour commencer.</div>'; return; }
                let h = '<div class="home-history-title">Reprendre où vous en étiez</div><div class="hist-list">';
                st.recent.forEach(r => {
                    const entry = D.find(d => d.module === r.module && d.chapitre === r.chapitre);
                    if (!entry) return;
                    const ans = cntChAns(entry), tot = entry.questions.length, pct = tot > 0 ? Math.round(ans / tot * 100) : 0;
                    h += `<div class="hist-card" data-mod="${esc(r.module)}" data-chap="${esc(r.chapitre)}" data-last-q="${esc(r.lastQId || '')}">
                        <div class="hist-card-left">
                            <div class="hist-card-module">${esc(r.module)}</div>
                            <div class="hist-card-subject">${esc(r.chapitre)}</div>
                        </div>
                        <div class="hist-card-meta">
                            <span class="hist-card-time">${timeAgo(r.ts)}</span>
                            <div class="hist-card-progress"><div class="hist-card-progress-fill" style="width:${pct}%"></div></div>
                            <span class="hist-card-stat">${ans}/${tot}</span>
                        </div>
                    </div>`;
                });
                h += '</div>'; c.innerHTML = h;
                c.querySelectorAll('.hist-card').forEach(card => {
                    card.addEventListener('click', () => { render(card.dataset.mod, card.dataset.chap, card.dataset.lastQ); hlAct(); if (window.innerWidth <= 1024) togMob(); });
                });
            }

            /* ══════════ RESET ══════════ */
            function showResetModal() {
                document.getElementById('reset-modal').classList.add('open');
                document.getElementById('ov').classList.add('vis');
                document.body.style.overflow = 'hidden';
                showResetTab('all');
                document.getElementById('reset-tab-all').onclick = () => showResetTab('all');
                document.getElementById('reset-tab-subject').onclick = () => showResetTab('subject');
                document.getElementById('reset-cancel').onclick = closeResetModal;
            }
            function closeResetModal() {
                document.getElementById('reset-modal').classList.remove('open');
                document.getElementById('ov').classList.remove('vis');
                document.body.style.overflow = '';
            }
            function showResetTab(tab) {
                document.getElementById('reset-tab-all').classList.toggle('active', tab === 'all');
                document.getElementById('reset-tab-subject').classList.toggle('active', tab === 'subject');
                const body = document.getElementById('reset-body'), foot = document.getElementById('reset-foot');
                if (tab === 'all') {
                    foot.style.display = 'none';
                    body.innerHTML = '<div class="reset-all-section"><p>Cette action supprimera toutes vos réponses, validations et historique pour ce profil. Cette action est irréversible.</p><button class="reset-danger-btn" id="reset-all-btn">Tout effacer</button></div>';
                    document.getElementById('reset-all-btn').onclick = () => {
                        if (confirm('Êtes-vous sûr de vouloir tout effacer ?')) { st = emptyState(); svNow()?.then(() => { closeResetModal(); location.reload(); }); }
                    };
                } else {
                    foot.style.display = '';
                    let h = '<div class="reset-subject-list">';
                    D.forEach(e => {
                        const ck = mk(e.module, e.chapitre), ans = cntChAns(e);
                        h += `<div class="reset-subject-item"><input type="checkbox" data-ck="${esc(ck)}" id="rs-${esc(ck)}"><label for="rs-${esc(ck)}">${esc(e.chapitre)}</label><span class="reset-subject-badge">${ans}/${e.questions.length}</span></div>`;
                    });
                    h += '</div>'; body.innerHTML = h;
                    body.querySelectorAll('.reset-subject-item').forEach(item => {
                        const cb = item.querySelector('input');
                        item.addEventListener('click', (e) => { if (e.target !== cb) cb.checked = !cb.checked; item.classList.toggle('checked', cb.checked); });
                    });
                    document.getElementById('reset-apply').onclick = () => {
                        const sel = [...body.querySelectorAll('input:checked')].map(cb => cb.dataset.ck);
                        if (sel.length === 0) return;
                        if (!confirm(`Effacer ${sel.length} matière(s) ?`)) return;
                        sel.forEach(ck => {
                            for (const k in st.qcm) if (k.startsWith(ck + '§')) delete st.qcm[k];
                            for (const k in st.red) if (k.startsWith(ck + '§')) delete st.red[k];
                            for (const k in st.val) if (k.startsWith(ck + '§')) delete st.val[k];
                            for (const k in st.his) if (k.startsWith(ck + '§')) delete st.his[k];
                            st.recent = (st.recent || []).filter(r => mk(r.module, r.chapitre) !== ck);
                        });
                        svNow()?.then(() => { closeResetModal(); location.reload(); });
                    };
                }
            }

            /* ══════════ PROFILE MODAL ══════════ */
            function showProfileModal() {
                const modal = document.getElementById('profile-modal');
                modal.classList.add('open'); document.getElementById('ov').classList.add('vis');
                document.body.style.overflow = 'hidden';
                renderProfileList();
            }
            function closeProfileModal() {
                document.getElementById('profile-modal').classList.remove('open');
                document.getElementById('ov').classList.remove('vis');
                document.body.style.overflow = '';
            }
            function renderProfileList() {
                const body = document.getElementById('profile-modal-body'), profiles = getProfiles();
                let h = '';
                profiles.forEach(p => {
                    h += `<div class="profile-card${p.id === activeProfileId ? ' active' : ''}" data-id="${p.id}">
                        <div class="profile-avatar" style="font-size:.7rem">${esc(p.name.charAt(0).toUpperCase())}</div>
                        <div class="profile-card-info"><div class="profile-card-name">${esc(p.name)}</div><div class="profile-card-date">Créé le ${new Date(p.createdAt).toLocaleDateString()}</div></div>
                        <div class="profile-card-actions">
                            <button class="profile-card-btn" data-action="rename" data-id="${p.id}" title="Renommer"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                            <button class="profile-card-btn" data-action="dup" data-id="${p.id}" title="Copier"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></button>
                            ${profiles.length > 1 ? `<button class="profile-card-btn danger" data-action="del" data-id="${p.id}" title="Supprimer"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
                        </div>
                    </div>`;
                });
                h += `
                <div class="profile-add-section">
                    <input class="profile-add-input" id="new-profile-name" placeholder="Nom du nouveau profil…">
                    <button class="profile-add-btn" id="add-profile-btn" style="margin-top:10px">Créer</button>
                </div>`;
                body.innerHTML = h;
                body.querySelectorAll('.profile-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        if (e.target.closest('[data-action]')) return;
                        const id = card.dataset.id;
                        if (id !== activeProfileId) switchProfile(id);
                        closeProfileModal();
                    });
                });
                body.querySelectorAll('[data-action="rename"]').forEach(btn => {
                    btn.addEventListener('click', (e) => { e.stopPropagation(); const n = prompt('Nouveau nom:'); if (n && n.trim()) { renameProfile(btn.dataset.id, n.trim()); renderProfileList(); } });
                });
                body.querySelectorAll('[data-action="dup"]').forEach(btn => {
                    btn.addEventListener('click', (e) => { e.stopPropagation(); duplicateProfile(btn.dataset.id); renderProfileList(); });
                });
                body.querySelectorAll('[data-action="del"]').forEach(btn => {
                    btn.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('Supprimer ce profil ?')) { deleteProfile(btn.dataset.id); renderProfileList(); } });
                });
                document.getElementById('add-profile-btn').addEventListener('click', () => {
                    const inp = document.getElementById('new-profile-name'), n = inp.value.trim();
                    if (n) {
                        let data = emptyState();
                        const newId = createProfile(n, data);
                        inp.value = '';
                        switchProfile(newId);
                        closeProfileModal();
                    }
                });
            }

            function adaptDatabase(db) {
                if (!db || !db.categories) return typeof QUESTIONS_DATA !== 'undefined' ? QUESTIONS_DATA : [];
                const adapted = [];
                db.categories.forEach(cat => {
                    cat.submodules.forEach(subm => {
                        // Prefix module with parent category for better grouping if desired, or just use module_name
                        const modName = subm.submodule_name;
                        subm.subjects.forEach(subj => {
                            adapted.push({
                                module: modName,
                                chapitre: subj.subject_name.trim(),
                                questions: subj.questions.map(q => ({
                                    id: q.id,
                                    type: (q.type === 'QCM') ? 'qcm' : 'redaction',
                                    contexte: q.clinical_context || "",
                                    enonce: q.question_text || "",
                                    options: q.choices || [],
                                    correction_officielle_validee: false
                                }))
                            });
                        });
                    });
                });
                return adapted;
            }

            function init() {
                D = (typeof ATARAXIE_S8_DB !== 'undefined')
                    ? adaptDatabase(ATARAXIE_S8_DB)
                    : ((typeof QUESTIONS_DATA !== 'undefined') ? QUESTIONS_DATA : []);

                tQ = D.reduce((s, d) => s + d.questions.length, 0);
                document.getElementById('ft').textContent = tQ + ' questions • Auto-save';

                // Setup Firebase Auth
                if (window.FirebaseAuthManager) {
                    document.getElementById('login-btn').addEventListener('click', () => window.FirebaseAuthManager.login());
                    document.getElementById('logout-btn').addEventListener('click', () => window.FirebaseAuthManager.logout());
                    
                    window.FirebaseAuthManager.init((cloudState, user) => {
                        if (user) {
                            document.getElementById('login-btn').style.display = 'none';
                            document.getElementById('logout-btn').style.display = 'inline-block';
                            document.getElementById('auth-info').style.display = 'flex';
                            document.getElementById('auth-info').textContent = user.email; // or user.displayName
                            
                            // Hot-reload state from localStorage which was updated by firebase-init
                            st = ld(); 
                            
                            // Re-render UI components with synced data
                            buildSB(); upProg(); renderHistory();
                            if (ak) { 
                                const ps = ak.split('§'); 
                                loadChap(ps[0], ps[1]); 
                            } else {
                                goHome();
                            }
                        } else {
                            document.getElementById('login-btn').style.display = 'inline-block';
                            document.getElementById('logout-btn').style.display = 'none';
                            document.getElementById('auth-info').style.display = 'none';
                        }
                    });
                }

                buildSB(); upProg(); upProfileUI(); renderHistory(); startThanksLoop();
                // Always start on home — do NOT auto-restore ak
                document.getElementById('hb').addEventListener('click', togMob);

                document.getElementById('si').addEventListener('input', filter);
                document.getElementById('btn-exp').addEventListener('click', expProg);
                document.getElementById('btn-imp').addEventListener('click', () => document.getElementById('fi-imp').click());
                document.getElementById('fi-imp').addEventListener('change', (e) => {
                    if (e.target.files.length) impProg(e.target.files[0]);
                });
                document.getElementById('btn-reset').addEventListener('click', showResetModal);
                document.getElementById('profile-switcher').addEventListener('click', showProfileModal);
                document.getElementById('profile-modal-close').addEventListener('click', closeProfileModal);
                document.getElementById('sb-brand').addEventListener('click', goHome);
                const stt = document.getElementById('stt');
                window.addEventListener('scroll', () => stt.classList.toggle('vis', window.scrollY > 400));
                stt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

                const cp = document.getElementById('cmp-panel');
                document.getElementById('cmp-close').addEventListener('click', () => {
                    cp.classList.remove('open');
                    document.getElementById('ov').classList.remove('vis');
                    document.body.style.overflow = '';
                });

                document.getElementById('cmp-target-select').addEventListener('change', (e) => {
                    const val = e.target.value;
                    if (val === 'file') {
                        document.getElementById('cmp-file-input').click();
                    } else if (val === 'none') {
                        tempCmpData = null;
                        if (currentCmpEntry) renderCmpList(currentCmpEntry);
                    } else if (val !== 'file_loaded') {
                        const pData = localStorage.getItem(profileSK(val));
                        if (pData) {
                            try { tempCmpData = JSON.parse(pData); if (currentCmpEntry) renderCmpList(currentCmpEntry); } catch (err) { }
                        }
                    }
                });

                document.getElementById('cmp-file-input').addEventListener('change', (e) => {
                    if (e.target.files.length) {
                        const r = new FileReader();
                        r.onload = (ev) => {
                            try {
                                let d = JSON.parse(ev.target.result);
                                d = migrateSaveData(d, D);
                                if (d.qcm) {
                                    tempCmpData = d;
                                    document.getElementById('cmp-target-select').value = 'file_loaded';
                                    if (currentCmpEntry) renderCmpList(currentCmpEntry);
                                } else {
                                    alert("Fichier invalide.");
                                    document.getElementById('cmp-target-select').value = 'none'; tempCmpData = null;
                                    if (currentCmpEntry) renderCmpList(currentCmpEntry);
                                }
                            } catch (err) { alert("Erreur de lecture."); }
                        };
                        r.readAsText(e.target.files[0]);
                    } else {
                        document.getElementById('cmp-target-select').value = 'none';
                        tempCmpData = null;
                        if (currentCmpEntry) renderCmpList(currentCmpEntry);
                    }
                    e.target.value = '';
                });

                document.getElementById('ov').addEventListener('click', () => {
                    const sb = document.getElementById('sb');
                    if (sb.classList.contains('open')) {
                        sb.classList.remove('open');
                    }
                    cp.classList.remove('open');
                    closeResetModal();
                    closeProfileModal();
                    document.getElementById('imp-choice-modal').classList.remove('open');
                    document.getElementById('conf-panel').classList.remove('open');
                    document.getElementById('ov').classList.remove('vis');
                    document.body.style.overflow = '';
                });
            }

            function startThanksLoop() {
                const loop = document.getElementById('thanks-loop');
                if (!loop) return;
                const texts = loop.querySelectorAll('.thanks-text');
                if (texts.length < 2) return;
                let cur = 0;
                setInterval(() => {
                    texts[cur].classList.remove('active');
                    cur = (cur + 1) % texts.length;
                    texts[cur].classList.add('active');
                }, 5000);
            }

            /* ══════════ SIDEBAR (logic unchanged) ══════════ */
            function buildSB() {
                const nav = document.getElementById('nav'); nav.innerHTML = '';
                const mods = new Map(); D.forEach(e => { if (!mods.has(e.module)) mods.set(e.module, []); mods.get(e.module).push(e) });
                mods.forEach((ents, mn) => {
                    const tq = ents.reduce((s, e) => s + e.questions.length, 0); if (tq === 0) return;
                    const op = st.sb[mn] === true, vq = cntModAns(ents);
                    const sortEnabled = st.sortChildren && st.sortChildren[mn] === true;
                    const w = document.createElement('div'); w.className = 'sb-mod'; w.dataset.module = mn;
                    const head = document.createElement('div'); head.className = 'sb-mod-head';
                    const btn = document.createElement('button');
                    btn.className = 'sb-mod-btn' + (op ? ' exp' : '');
                    btn.innerHTML = `<svg class="arr" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg><span class="mname">${esc(mn)}</span><span class="mb ${vq === tq && tq > 0 ? 'mb-done' : 'mb-default'}" data-mb="${esc(mn)}">${vq}/${tq}</span>`;
                    const sortBtn = document.createElement('button');
                    sortBtn.type = 'button';
                    sortBtn.className = 'sb-sort-btn' + (sortEnabled ? ' active' : '');
                    sortBtn.title = sortEnabled ? 'Retour à l’ordre par défaut' : 'Trier les chapitres du plus grand nombre de questions au plus petit';
                    sortBtn.textContent = '↔';
                    sortBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        st.sortChildren = st.sortChildren || {};
                        st.sortChildren[mn] = !st.sortChildren[mn];
                        sv();
                        buildSB();
                        const si = document.getElementById('si');
                        if (si) filter({ target: si });
                        hlAct();
                    });
                    const cl = document.createElement('div'); cl.className = 'sb-chaps' + (op ? ' open' : '');
                    const sortedEnts = sortEnabled ? ents.slice().sort((a, b) => b.questions.length - a.questions.length || ents.indexOf(a) - ents.indexOf(b)) : ents;
                    sortedEnts.forEach(e => {
                        const ck = mk(e.module, e.chapitre), vc = cntChAns(e);
                        const cb = document.createElement('button');
                        cb.className = 'sb-ch' + (ak === ck ? ' active' : ''); cb.dataset.ck = ck;
                        cb.innerHTML = `<span class="cname">${esc(e.chapitre)}</span><span class="cb ${vc === e.questions.length && e.questions.length > 0 ? 'done' : ''}" data-cb="${esc(ck)}">${vc}/${e.questions.length}</span>`;
                        cb.addEventListener('click', () => { render(e.module, e.chapitre); hlAct(); if (window.innerWidth <= 1024) togMob() });
                        cl.appendChild(cb);
                    });
                    btn.addEventListener('click', () => { const o = cl.classList.toggle('open'); btn.classList.toggle('exp', o); st.sb[mn] = o; sv() });
                    head.appendChild(btn);
                    head.appendChild(sortBtn);
                    w.appendChild(head); w.appendChild(cl); nav.appendChild(w);
                });
            }
            function cntModAns(ents) { let c = 0; ents.forEach(e => e.questions.forEach(q => { if (isAns(mk(e.module, e.chapitre, q.id), q.type)) c++ })); return c }
            function cntChAns(e) { return e.questions.filter(q => isAns(mk(e.module, e.chapitre, q.id), q.type)).length }
            function cntChVal(e) { return e.questions.filter(q => st.val[mk(e.module, e.chapitre, q.id)]).length }
            function hlAct() { document.querySelectorAll('.sb-ch').forEach(b => b.classList.toggle('active', b.dataset.ck === ak)) }
            function filter(e) {
                const q = e.target.value.toLowerCase().trim();
                document.querySelectorAll('.sb-mod').forEach(item => {
                    const mn = item.dataset.module.toLowerCase(); const chs = item.querySelectorAll('.sb-ch'); let any = mn.includes(q);
                    chs.forEach(cb => { const m = cb.textContent.toLowerCase().includes(q) || mn.includes(q); cb.style.display = (!q || m) ? '' : 'none'; if (m) any = true });
                    item.style.display = (!q || any) ? '' : 'none';
                    if (q && any) { const cl = item.querySelector('.sb-chaps'); if (cl) cl.classList.add('open'); const b = item.querySelector('.sb-mod-btn'); if (b) b.classList.add('exp') }
                });
            }

            /* ══════════ RENDER CHAPTER (REDESIGNED) ══════════ */
            function render(mod, chap, targetQId = null) {
                ak = mk(mod, chap); st.ac = ak; sv();
                const isOfficialMode = false;
                const entry = D.find(d => d.module === mod && d.chapitre === chap); if (!entry) return;
                document.getElementById('ht').textContent = chap;
                document.getElementById('hs').textContent = mod;
                document.getElementById('ws').style.display = 'none';

                const c = document.getElementById('qc'); c.style.display = ''; c.innerHTML = '';
                const ansC = cntChAns(entry), valC = cntChVal(entry), totC = entry.questions.length;

                /* ── Chapter Banner ── */
                const banner = document.createElement('div'); banner.className = 'ch-banner';
                banner.innerHTML = `
            <div class="ch-banner-left">
                <h3>${esc(chap)}</h3>
                <p>${esc(mod)} — ${totC} question${totC > 1 ? 's' : ''}</p>
            </div>
            <div class="ch-pills">
                <div class="ch-pill ch-pill-ans">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    <span class="ch-pill-num" id="ch-ans">${ansC}</span>
                    <span>/ ${totC} répondues</span>
                </div>
                <div class="ch-pill ch-pill-val">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <span class="ch-pill-num" id="ch-val">${valC}</span>
                    <span>/ ${totC} validées</span>
                </div>
                <button class="ch-btn-cmp" id="btn-cmp" title="Comparer mes réponses">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                </button>
            </div>`;
                c.appendChild(banner);
                document.getElementById('btn-cmp').addEventListener('click', () => { showCmp(entry); });

                if (totC === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'hist-empty';
                    empty.textContent = 'Aucune question n\'est disponible pour ce sujet.';
                    c.appendChild(empty);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                }

                /* ── Question Stream ── */
                const stream = document.createElement('div'); stream.className = 'q-stream';
                let lastCtx = null, delay = 0;

                entry.questions.forEach((q, idx) => {
                    const key = mk(mod, chap, q.id);

                    /* Context */
                    if (q.contexte && q.contexte.trim() && q.contexte.trim() !== lastCtx) {
                        lastCtx = q.contexte.trim();
                        const ct = document.createElement('div'); ct.className = 'ctx-panel'; ct.style.animationDelay = delay + 'ms'; delay += 30;
                        ct.innerHTML = `
                    <div class="ctx-header">
                        <div class="ctx-icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div>
                        <div class="ctx-title">Cas Clinique / Contexte</div>
                    </div>
                    <div class="ctx-divider"></div>
                    <div class="ctx-body">${esc(lastCtx)}</div>
                `;
                        stream.appendChild(ct);
                    } else if (!q.contexte || !q.contexte.trim()) lastCtx = null;

                    const _isAns = isAns(key, q.type), isVal = st.val[key] === true;
                    const officialAns = st.official[key];

                    // In official mode, skip questions without official answers
                    if (isOfficialMode && !officialAns) return;

                    /* Card */
                    const card = document.createElement('div');
                    card.className = 'qcard' + (isOfficialMode ? ' official-readonly' : ''); card.dataset.key = key;
                    card.style.animationDelay = delay + 'ms'; delay += 25;

                    let h = '';

                    // Extract Q number
                    const qMatch = q.id.match(/[_-]Q(\d+)$/i);
                    const qNumStr = qMatch ? 'Q' + qMatch[1] : ('Q' + (idx + 1));

                    // Format subject text
                    let subjectStr = entry.chapitre.replace(/\s*:\s*\(\s*\d+\s*questions?\s*\)$/i, '');
                    subjectStr = subjectStr.replace(/^(\d+)\s*\.\s*/, (m, n) => n.padStart(2, '0') + '. ');

                    /* Head: meta row */
                    h += `<div class="qcard-head">
                        <div class="qcard-meta">
                            ${isOfficialMode ? '<span class="official-badge">Correction Officielle</span>' : `<div class="status-dot dot-his${st.his[key] ? ' on' : ''}" data-key="${key}" title="Historique (Importé)"></div>`}
                            <span class="qcard-type ${q.type}">${q.type === 'qcm' ? 'QCM' : 'Rédaction'}</span>
                            <span class="qcard-qnum">${esc(subjectStr)}</span>
                            ${isOfficialMode ? '' : `<div class="qcard-dots">
                                <div class="status-dot dot-ans${_isAns ? ' on' : ''}" title="Répondue"></div>
                                <div class="status-dot dot-val${isVal ? ' on' : ''}" title="Validée"></div>
                            </div>`}
                        </div>
                    </div>`;

                    /* Enonce */
                    h += `<div class="qcard-enonce"><strong style="color:var(--t1)">${qNumStr}.</strong> ${esc(q.enonce)}</div>`;
                    h += `<div class="qcard-divider"></div>`;

                    /* Options */
                    if (q.type === 'qcm' && q.options && q.options.length) {
                        const ck = isOfficialMode ? (officialAns || []) : (st.qcm[key] || []);
                        h += '<div class="qcard-options">';
                        q.options.forEach((o, oi) => {
                            const isSel = Array.isArray(ck) && ck.includes(oi);
                            h += `<div class="opt-tile${isSel ? (isOfficialMode ? ' official-selected' : ' selected') : ''}" ${isOfficialMode ? '' : `data-key="${esc(key)}" data-oi="${oi}"`}>
                        <div class="opt-tile-letter">${L[oi] || oi}</div>
                        <div class="opt-tile-text">${esc(o)}</div>
                        <div class="opt-tile-check"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg></div>
                    </div>`;
                        });

                        // "Leave Blank" option
                        const isBlank = ck === 'BLANK';
                        if (!isOfficialMode || isBlank) {
                            h += `<div class="opt-tile opt-blank${isBlank ? (isOfficialMode ? ' official-selected selected' : ' selected') : ''}" ${isOfficialMode ? '' : `data-key="${esc(key)}" data-blank="true"`}>
                                <div class="opt-tile-letter"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg></div>
                                <div class="opt-tile-text">Toutes les choix sont fausses</div>
                                <div class="opt-tile-check"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg></div>
                            </div>`;
                        }

                        h += '</div>';
                    } else if (q.type === 'redaction') {
                        const sv2 = normalizeEditorHtml(isOfficialMode ? (officialAns || '') : (st.red[key] || ''));
                        const tools = isOfficialMode ? '' : `<div class="qcard-editor-tools" aria-label="Outils de mise en forme">
                            <button type="button" class="qcard-editor-tool" data-action="bold" title="Gras"><strong>B</strong></button>
                            <button type="button" class="qcard-editor-tool" data-action="italic" title="Italique"><em>I</em></button>
                            <span class="tool-group-sep" aria-hidden="true"></span>
                            <button type="button" class="qcard-editor-tool" data-action="ul" title="Liste a puces">• List</button>
                            <button type="button" class="qcard-editor-tool" data-action="ol" title="Liste numerotee">1. List</button>
                            <span class="tool-group-sep" aria-hidden="true"></span>
                            <button type="button" class="qcard-editor-tool" data-action="indent" title="Niveau enfant">↳</button>
                            <button type="button" class="qcard-editor-tool" data-action="outdent" title="Niveau parent">↰</button>
                        </div>`;
                        if (isOfficialMode) {
                            h += `<div class="qcard-ta-wrap"><div class="qcard-editor-shell"><div class="qcard-editor-meta"><span>Réponse formatée</span><span>Lecture seule</span></div><div class="qcard-editor">${sv2}</div></div></div>`;
                        } else {
                            h += `<div class="qcard-ta-wrap"><div class="qcard-editor-shell"><div class="qcard-editor-meta"><span>Réponse enrichie</span><span>Ctrl+B / Ctrl+I</span></div>${tools}<div class="qcard-editor qcard-editor-edit" contenteditable="true" spellcheck="true" data-placeholder="Rédigez votre réponse ici…" data-key="${esc(key)}">${sv2}</div></div></div>`;
                        }
                    }

                    /* Footer */
                    if (!isOfficialMode) {
                        h += `<div class="qcard-foot">
                    <button class="val-toggle${isVal ? ' on' : ''}" data-key="${esc(key)}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isVal ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M9 12l2 2 4-4'}"/></svg>
                        ${isVal ? 'Correction validée' : 'Marquer comme validée'}
                    </button>
                </div>`;
                    }

                    card.innerHTML = h;
                    stream.appendChild(card);
                });
                c.appendChild(stream);
                wire(c, entry);
                renderMath(c);

                if (targetQId) {
                    const k = mk(mod, chap, targetQId);
                    const el = document.querySelector(`.qcard[data-key="${esc(k)}"]`);
                    if (el) {
                        setTimeout(() => {
                            const hdrOffset = 80;
                            const elementPosition = el.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - hdrOffset;
                            window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                        }, 100);
                    } else {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }

            function renderMath(el) {
                if (typeof renderMathInElement === 'function') {
                    renderMathInElement(el, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false }
                        ],
                        throwOnError: false
                    });
                }
            }

            function sanitizeEditorHtml(raw) {
                const tpl = document.createElement('template');
                tpl.innerHTML = raw || '';
                const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'P', 'BR']);

                function scrub(node) {
                    Array.from(node.childNodes).forEach(child => {
                        if (child.nodeType === Node.ELEMENT_NODE) {
                            const tag = child.tagName.toUpperCase();

                            if (tag === 'DIV') {
                                const p = document.createElement('p');
                                while (child.firstChild) p.appendChild(child.firstChild);
                                child.replaceWith(p);
                                scrub(p);
                                return;
                            }

                            if (!allowed.has(tag)) {
                                while (child.firstChild) node.insertBefore(child.firstChild, child);
                                child.remove();
                                return;
                            }

                            Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                            scrub(child);
                            return;
                        }

                        if (child.nodeType === Node.COMMENT_NODE) child.remove();
                    });
                }

                scrub(tpl.content);
                return tpl.innerHTML.trim();
            }

            function normalizeEditorHtml(value) {
                if (!value) return '';
                if (/<\/?[a-z][\s\S]*>/i.test(value)) return sanitizeEditorHtml(value);
                return esc(value).replace(/\n/g, '<br>');
            }

            function getPlainTextFromHtml(html) {
                const box = document.createElement('div');
                box.innerHTML = html || '';
                return (box.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
            }

            function hasEditorContent(html) {
                return getPlainTextFromHtml(html).length > 0;
            }

            function extractEditorStateHtml(editor) {
                const safe = sanitizeEditorHtml(editor.innerHTML);
                return hasEditorContent(safe) ? safe : '';
            }

            function updateEditorEmptyState(editor) {
                const isEmpty = !hasEditorContent(editor.innerHTML);
                editor.dataset.empty = isEmpty ? 'true' : 'false';
            }

            function refreshEditorToolbar(editor) {
                const wrap = editor.closest('.qcard-ta-wrap');
                if (!wrap) return;

                function setActive(action, state) {
                    const btn = wrap.querySelector(`.qcard-editor-tool[data-action="${action}"]`);
                    if (btn) btn.classList.toggle('active', !!state);
                }

                setActive('bold', document.queryCommandState('bold'));
                setActive('italic', document.queryCommandState('italic'));
                setActive('ul', document.queryCommandState('insertUnorderedList'));
                setActive('ol', document.queryCommandState('insertOrderedList'));
            }

            function isSelectionInsideListItem(editor) {
                const sel = window.getSelection();
                if (!sel || !sel.rangeCount) return false;
                let node = sel.anchorNode;
                if (!node) return false;
                if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
                return !!(node && node.closest && node.closest('li') && editor.contains(node));
            }

            function applyEditorCommand(editor, action) {
                if (!editor) return;

                const map = {
                    bold: 'bold',
                    italic: 'italic',
                    ul: 'insertUnorderedList',
                    ol: 'insertOrderedList',
                    indent: 'indent',
                    outdent: 'outdent'
                };

                const cmd = map[action];
                if (!cmd) return;

                editor.focus();
                document.execCommand(cmd, false, null);
                updateEditorEmptyState(editor);
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                refreshEditorToolbar(editor);
            }

            function insertCleanPaste(editor, html, text) {
                const safe = sanitizeEditorHtml(html || '');
                const payload = safe || esc(text || '').replace(/\n/g, '<br>');
                editor.focus();
                document.execCommand('insertHTML', false, payload);
                updateEditorEmptyState(editor);
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                refreshEditorToolbar(editor);
            }

            /* ══════════ WIRE EVENTS ══════════ */
            function wire(c, entry) {
                const mod = entry.module, chap = entry.chapitre;

                c.querySelectorAll('.opt-tile').forEach(tile => {
                    tile.addEventListener('click', () => {
                        const key = tile.dataset.key;
                        const card = tile.closest('.qcard');
                        const isBlankBtn = tile.dataset.blank === 'true';

                        if (isBlankBtn) {
                            const wasBlank = st.qcm[key] === "BLANK";
                            if (wasBlank) {
                                delete st.qcm[key];
                                tile.classList.remove('selected');
                            } else {
                                st.qcm[key] = "BLANK";
                                card.querySelectorAll('.opt-tile').forEach(t => t.classList.remove('selected'));
                                tile.classList.add('selected');
                            }
                        } else {
                            const oi = parseInt(tile.dataset.oi);
                            if (st.qcm[key] === "BLANK") st.qcm[key] = [];
                            if (!st.qcm[key]) st.qcm[key] = [];

                            const sel = tile.classList.toggle('selected');
                            if (sel) {
                                if (!st.qcm[key].includes(oi)) st.qcm[key].push(oi);
                                // Remove blank selection if any regular option is selected
                                const bBtn = card.querySelector('.opt-blank');
                                if (bBtn) bBtn.classList.remove('selected');
                            }
                            else { st.qcm[key] = st.qcm[key].filter(i => i !== oi) }
                        }

                        const qId = key.split('§')[2];
                        sv(); addRecent(mod, chap, qId);
                        const ans = isAns(key, 'qcm');
                        const dot = card.querySelector('.dot-ans'); if (dot) dot.classList.toggle('on', ans);
                        upProg(); upChStats(entry); upBadges();
                    });
                });

                c.querySelectorAll('.qcard-editor-edit').forEach(editor => {
                    updateEditorEmptyState(editor);

                    editor.addEventListener('input', () => {
                        const qId = editor.dataset.key.split('§')[2];
                        st.red[editor.dataset.key] = extractEditorStateHtml(editor); sv(); addRecent(mod, chap, qId);
                        updateEditorEmptyState(editor);
                        const card = editor.closest('.qcard');
                        const ans = isAns(editor.dataset.key, 'redaction');
                        const dot = card.querySelector('.dot-ans'); if (dot) dot.classList.toggle('on', ans);
                        upProg(); upChStats(entry); upBadges();
                    });

                    editor.addEventListener('keydown', (e) => {
                        const k = e.key.toLowerCase();

                        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (k === 'b' || k === 'i')) {
                            e.preventDefault();
                            applyEditorCommand(editor, k === 'b' ? 'bold' : 'italic');
                            return;
                        }

                        if (e.key === 'Tab' && isSelectionInsideListItem(editor)) {
                            e.preventDefault();
                            applyEditorCommand(editor, e.shiftKey ? 'outdent' : 'indent');
                        }
                    });

                    editor.addEventListener('paste', (e) => {
                        e.preventDefault();
                        const clipboard = e.clipboardData || window.clipboardData;
                        const html = clipboard ? clipboard.getData('text/html') : '';
                        const text = clipboard ? clipboard.getData('text/plain') : '';
                        insertCleanPaste(editor, html, text);
                    });

                    ['focus', 'keyup', 'mouseup'].forEach(evt => {
                        editor.addEventListener(evt, () => refreshEditorToolbar(editor));
                    });
                });

                c.querySelectorAll('.qcard-editor-tool').forEach(btn => {
                    btn.addEventListener('mousedown', (e) => e.preventDefault());
                    btn.addEventListener('click', () => {
                        const wrap = btn.closest('.qcard-ta-wrap');
                        const editor = wrap ? wrap.querySelector('.qcard-editor-edit') : null;
                        applyEditorCommand(editor, btn.dataset.action);
                    });
                });

                c.querySelectorAll('.val-toggle').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const key = btn.dataset.key, card = btn.closest('.qcard'), was = btn.classList.contains('on');
                        if (was) {
                            delete st.val[key]; btn.classList.remove('on');
                            btn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg> Marquer comme validée`;
                            const d = card.querySelector('.dot-val'); if (d) d.classList.remove('on');
                        } else {
                            st.val[key] = true; btn.classList.add('on');
                            btn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Correction validée`;
                            const d = card.querySelector('.dot-val'); if (d) d.classList.add('on');
                        }
                        const qId = key.split('§')[2];
                        sv(); addRecent(mod, chap, qId); upChStats(entry); upBadges();
                    });
                });
                c.querySelectorAll('.dot-his.on').forEach(dot => {
                    dot.addEventListener('click', (e) => {
                        const k = dot.dataset.key, h = st.his[k]; if (!h) return;
                        const ep = document.getElementById('his-pop');
                        const qObj = findQ(k);
                        const card = dot.closest('.qcard');
                        const div = card ? card.querySelector('.qcard-divider') : null;

                        ep.innerHTML = `
                            <div class="his-grid">
                                <div class="his-col">
                                    <div class="his-label">Avant l’import</div>
                                    <div class="his-val before">${formatVal(h.before, qObj)}</div>
                                </div>
                                <div class="his-col">
                                    <div class="his-label">Après l’import</div>
                                    <div class="his-val after">${formatVal(h.after, qObj)}</div>
                                </div>
                            </div>
                            <div style="font-size:0.6rem;color:var(--t4);text-align:right;margin-top:12px">Modifié le ${new Date(h.date).toLocaleDateString()}</div>
                        `;

                        const r = dot.getBoundingClientRect();
                        const cardR = card.getBoundingClientRect();

                        // Vertical positioning: below divider if found, else below dot
                        let topPos = r.bottom + 10;
                        if (div) {
                            const divR = div.getBoundingClientRect();
                            topPos = divR.bottom + 5;
                        }

                        ep.style.top = topPos + 'px';

                        // Centering logic with viewport awareness
                        const popW = Math.min(window.innerWidth - 40, ep.offsetWidth || 400);
                        let leftPos = cardR.left + (cardR.width - popW) / 2;

                        // Ensure it stays within screen bounds
                        leftPos = Math.max(10, Math.min(window.innerWidth - popW - 10, leftPos));

                        ep.style.left = leftPos + 'px';
                        ep.style.width = popW + 'px';
                        ep.classList.add('vis');

                        // One-time reminder: remove after clicking
                        delete st.his[k];
                        dot.classList.remove('on');
                        sv();

                        e.stopPropagation();
                    });
                });
                document.addEventListener('click', () => document.getElementById('his-pop').classList.remove('vis'));
            }

            /* ══════════ PROGRESS ══════════ */
            function upProg() {
                let a = 0; D.forEach(e => e.questions.forEach(q => { if (isAns(mk(e.module, e.chapitre, q.id), q.type)) a++ }));
                const pct = tQ > 0 ? Math.round(a / tQ * 100) : 0;
                document.getElementById('pp').textContent = pct + '%';
                document.getElementById('pc').textContent = a + ' / ' + tQ;
                document.getElementById('pr').style.strokeDashoffset = CIRC - (CIRC * pct / 100);
            }
            function upChStats(entry) {
                const a = cntChAns(entry), v = cntChVal(entry);
                const ea = document.getElementById('ch-ans'), ev = document.getElementById('ch-val');
                if (ea) ea.textContent = a; if (ev) ev.textContent = v;
            }
            function upBadges() {
                document.querySelectorAll('[data-cb]').forEach(b => {
                    const ck = b.dataset.cb, p = ck.split('§');
                    const e = D.find(d => d.module === p[0] && d.chapitre === p[1]); if (!e) return;
                    const vc = cntChAns(e); b.textContent = vc + '/' + e.questions.length;
                    b.classList.toggle('done', vc === e.questions.length && e.questions.length > 0);
                });
                const mods = new Map(); D.forEach(e => { if (!mods.has(e.module)) mods.set(e.module, []); mods.get(e.module).push(e) });
                document.querySelectorAll('[data-mb]').forEach(b => {
                    const mn = b.dataset.mb, ents = mods.get(mn); if (!ents) return;
                    const tq = ents.reduce((s, e) => s + e.questions.length, 0), vq = cntModAns(ents);
                    b.textContent = vq + '/' + tq; b.classList.toggle('mb-done', vq === tq && tq > 0);
                    b.classList.toggle('mb-default', vq !== tq || tq === 0);
                });
            }
            function togMob() {
                const sb = document.getElementById('sb'), ov = document.getElementById('ov');
                const o = sb.classList.toggle('open');
                const anyModalOpen = document.querySelector('.open[id$="-modal"], .open[id$="-panel"]');
                if (!anyModalOpen) {
                    ov.classList.toggle('vis', o);
                    document.body.style.overflow = o ? 'hidden' : '';
                }
            }
            function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

            function showCmp(e) {
                currentCmpEntry = e;
                const sub = document.getElementById('cmp-sub'); if (sub) sub.textContent = e.chapitre;

                const sel = document.getElementById('cmp-target-select');
                const curVal = sel.value;
                let h = '<option value="none">Mes réponses (Seul)</option>';

                const hasOfficial = e.questions.some(q => st.official[mk(e.module, e.chapitre, q.id)]);
                if (hasOfficial) {
                    h += '<option value="official">🌟 Corrections Officielles</option>';
                }

                getProfiles().forEach(p => {
                    if (p.id !== activeProfileId) {
                        h += `<option value="${p.id}">Profil: ${esc(p.name)}</option>`;
                    }
                });
                h += '<option value="file">📂 Importer un fichier...</option>';
                if (curVal === 'file_loaded' && tempCmpData) {
                    h += '<option value="file_loaded" hidden>Fichier importé</option>';
                }
                sel.innerHTML = h;

                if (curVal === 'file_loaded' && tempCmpData) sel.value = 'file_loaded';
                else if (curVal === 'official' && hasOfficial) sel.value = 'official';
                else if (curVal !== 'file' && curVal !== 'file_loaded' && curVal !== 'none' && curVal !== 'official') {
                    if (getProfiles().find(p => p.id === curVal)) sel.value = curVal;
                    else { sel.value = 'none'; tempCmpData = null; }
                } else {
                    sel.value = 'none'; tempCmpData = null;
                }

                document.getElementById('cmp-panel').classList.add('open');
                document.getElementById('ov').classList.add('vis');
                document.body.style.overflow = 'hidden';

                renderCmpList(e);
            }

            function renderCmpList(e) {
                const b = document.getElementById('cmp-body'); b.innerHTML = '';
                let hasQcm = false;
                const selVal = document.getElementById('cmp-target-select').value;

                let isCompare = false;
                let targetQcm = {};
                let targetVal = {};

                if (selVal === 'official') {
                    isCompare = true;
                    targetQcm = st.official || {};
                    e.questions.forEach(q => {
                        const key = mk(e.module, e.chapitre, q.id);
                        if (st.official[key]) targetVal[key] = true;
                    });
                } else if ((selVal !== 'none' && selVal !== 'file') && tempCmpData) {
                    isCompare = true;
                    targetQcm = tempCmpData.qcm || {};
                    targetVal = tempCmpData.val || {};
                }

                if (isCompare) {
                    document.getElementById('cmp-panel').classList.add('wide');
                    const hdr = document.createElement('div'); hdr.className = 'cmp-diff-header';
                    hdr.innerHTML = `<div></div><div>Vous</div><div>${selVal === 'official' ? 'Officiel' : 'Autre'}</div>`;
                    b.appendChild(hdr);
                } else {
                    document.getElementById('cmp-panel').classList.remove('wide');
                }

                e.questions.forEach((q, idx) => {
                    if (q.type === 'qcm') {
                        hasQcm = true;
                        const key = mk(e.module, e.chapitre, q.id);
                        const myAns = st.qcm[key] || [];

                        if (!isCompare) {
                            let l = '';
                            if (myAns === "BLANK") l = 'VIDE';
                            else l = myAns.map(i => L[i]).sort().join('');

                            if (!l) l = '-';
                            const d = document.createElement('div'); d.className = 'cmp-item';
                            d.innerHTML = `<div class="cmp-ans">${idx + 1}-${l}</div>`;
                            b.appendChild(d);
                        } else {
                            const otherAns = targetQcm[key] || [];
                            let myHtml = '';
                            let otherHtml = '';

                            const isMyVal = st.val[key] === true;
                            const isOthVal = targetVal[key] === true;

                            if (myAns === "BLANK" || otherAns === "BLANK") {
                                // Special handling for BLANK in comparison
                                if (myAns === "BLANK" && otherAns === "BLANK") {
                                    myHtml = '<span class="cmp-letter match">VIDE</span>';
                                    otherHtml = '<span class="cmp-letter match">VIDE</span>';
                                } else if (myAns === "BLANK") {
                                    myHtml = `<span class="cmp-letter ${isOthVal ? 'diff-false' : 'mine-only'}">VIDE</span>`;
                                    otherHtml = otherAns.map(i => `<span class="cmp-letter ${isOthVal ? 'match' : 'other-only'}">${L[i]}</span>`).join('');
                                    if (!otherAns.length) otherHtml = '<span class="cmp-letter match">-</span>';
                                } else if (otherAns === "BLANK") {
                                    myHtml = myAns.map(i => `<span class="cmp-letter ${isMyVal ? 'match' : 'mine-only'}">${L[i]}</span>`).join('');
                                    if (!myAns.length) myHtml = '<span class="cmp-letter match">-</span>';
                                    otherHtml = `<span class="cmp-letter ${isMyVal ? 'diff-false' : 'other-only'}">VIDE</span>`;
                                }
                            } else {
                                const allOpts = [...new Set([...myAns, ...otherAns])].sort((a, b) => a - b);
                                if (allOpts.length === 0) {
                                    myHtml = '<span class="cmp-letter match">-</span>';
                                    otherHtml = '<span class="cmp-letter match">-</span>';
                                } else {
                                    allOpts.forEach(i => {
                                        const letter = L[i];
                                        const inMine = myAns.includes(i);
                                        const inOther = otherAns.includes(i);

                                        if (inMine && inOther) {
                                            myHtml += `<span class="cmp-letter match">${letter}</span>`;
                                            otherHtml += `<span class="cmp-letter match">${letter}</span>`;
                                        } else if (inMine && !inOther) {
                                            let c = 'mine-only';
                                            if (isMyVal && !isOthVal) c = 'diff-true';
                                            if (isOthVal && !isMyVal) c = 'diff-false';
                                            myHtml += `<span class="cmp-letter ${c}">${letter}</span>`;
                                        } else if (!inMine && inOther) {
                                            let c = 'other-only';
                                            if (isOthVal && !isMyVal) c = 'diff-true';
                                            if (isMyVal && !isOthVal) c = 'diff-false';
                                            otherHtml += `<span class="cmp-letter ${c}">${letter}</span>`;
                                        }
                                    });
                                }
                                if (!myAns.length && otherAns.length) myHtml = '<span class="cmp-letter match">-</span>';
                                if (myAns.length && !otherAns.length) otherHtml = '<span class="cmp-letter match">-</span>';
                            }

                            const d = document.createElement('div'); d.className = 'cmp-diff-row-grid';
                            d.innerHTML = `
                                <div class="cmp-qnum-diff">Q${idx + 1}</div>
                                <div class="cmp-diff-letters">${myHtml}${isMyVal ? '<span style="color:#10b981; font-weight:bold; font-size:.85rem; line-height:20px; flex-shrink:0" title="Validée (Réponse Correcte)">✓</span>' : ''}</div>
                                <div class="cmp-diff-letters">${otherHtml}${isOthVal ? '<span style="color:#10b981; font-weight:bold; font-size:.85rem; line-height:20px; flex-shrink:0" title="Validée (Réponse Correcte)">✓</span>' : ''}</div>
                            `;
                            d.addEventListener('click', () => {
                                document.getElementById('cmp-close').click();
                                const qcard = document.querySelector(`.qcard[data-key="${esc(key)}"]`);
                                if (qcard) {
                                    setTimeout(() => {
                                        const hdrOffset = 80;
                                        window.scrollTo({ top: qcard.getBoundingClientRect().top + window.pageYOffset - hdrOffset, behavior: 'smooth' });

                                        document.querySelectorAll('.opt-glow').forEach(el => el.classList.remove('opt-glow', 'glow-red', 'glow-green', 'glow-blue', 'glow-purple'));

                                        qcard.querySelectorAll('.opt-tile').forEach(tile => {
                                            const oi = parseInt(tile.dataset.oi);
                                            tile.classList.add('opt-glow');
                                            const inMine = myAns.includes(oi);
                                            const inOth = otherAns.includes(oi);

                                            if (inMine && !inOth) {
                                                if (isMyVal && !isOthVal) tile.classList.add('glow-green');
                                                else if (isOthVal && !isMyVal) tile.classList.add('glow-red');
                                                else tile.classList.add('glow-blue');
                                            }
                                            else if (!inMine && inOth) {
                                                if (isOthVal && !isMyVal) tile.classList.add('glow-green');
                                                else if (isMyVal && !isOthVal) tile.classList.add('glow-red');
                                                else tile.classList.add('glow-purple');
                                            }
                                        });

                                        qcard.classList.add('card-glow-focus');
                                        setTimeout(() => qcard.classList.remove('card-glow-focus'), 1500);
                                    }, 100);
                                }
                            });
                            b.appendChild(d);
                        }
                    }
                });
                if (!hasQcm) {
                    b.innerHTML = '<div class="cmp-empty">Aucun QCM</div>';
                }
                renderMath(document.getElementById('cmp-panel'));
            }

            function expProg() {
                const d = JSON.stringify(st, null, 2);
                const b = new Blob([d], { type: 'application/json' });
                const u = URL.createObjectURL(b);
                const a = document.createElement('a');

                // Get active profile name for the file
                const profiles = getProfiles();
                const active = profiles.find(p => p.id === activeProfileId);
                const pName = active ? active.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'export';

                a.href = u;
                a.download = `${pName}-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(u), 100);
            }

            let pendingImp = null, resolutions = {};

            function migrateSaveData(d, newD) {
                const firstKey = Object.keys(d.qcm || {})[0] || Object.keys(d.red || {})[0];
                if (!firstKey || !/_Q\d+$/.test(firstKey)) return d;

                const translated = {
                    qcm: {}, red: {}, val: {}, his: {},
                    sb: {}, ac: null, recent: [], official: d.official || {}
                };

                const chapterMap = {};
                newD.forEach(cat => {
                    const normMod = cat.module.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
                    const normChap = cat.chapitre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
                    if (!chapterMap[normMod]) chapterMap[normMod] = {};
                    chapterMap[normMod][normChap] = cat;
                });

                function cleanChap(c) {
                    return c.replace(/^\d+(\.\d+)*\.\s*/, '').replace(/\s*:.*/, '').trim();
                }
                function normStr(s) {
                    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
                }

                function getNewCat(oldMod, oldChap) {
                    const nm = normStr(oldMod);
                    let bestModCat = chapterMap[nm];
                    if (!bestModCat) {
                        for (let m in chapterMap) { if (nm.includes(m) || m.includes(nm)) { bestModCat = chapterMap[m]; break; } }
                    }
                    if (!bestModCat) return null;

                    const nc = normStr(cleanChap(oldChap));
                    let bestCat = bestModCat[nc];
                    if (!bestCat) {
                        for (let c in bestModCat) { if (nc.includes(c) || c.includes(nc)) { bestCat = bestModCat[c]; break; } }
                    }
                    return bestCat;
                }

                for (const t of ['qcm', 'red', 'val', 'his']) {
                    if (!d[t]) continue;
                    for (const k in d[t]) {
                        const parts = k.split('§');
                        if (parts.length < 3) continue;
                        const cat = getNewCat(parts[0], parts[1]);
                        if (cat) {
                            const mk = parts[2].match(/_Q(\d+)$/);
                            let qIndex = mk ? parseInt(mk[1], 10) - 1 : parseInt(parts[2].replace(/[^0-9]/g, '')) - 1;
                            if (isNaN(qIndex) || qIndex < 0) qIndex = 0;
                            const q = cat.questions[qIndex];
                            if (q) translated[t][cat.module + '§' + cat.chapitre + '§' + q.id] = d[t][k];
                        }
                    }
                }

                if (d.sb) {
                    for (const k in d.sb) {
                        const nm = normStr(k);
                        let nMod = null;
                        for (let m in chapterMap) { if (nm.includes(m) || m.includes(nm)) { nMod = m; break; } }
                        if (nMod) {
                            const cat = newD.find(c => normStr(c.module) === nMod);
                            if (cat) translated.sb[cat.module] = d.sb[k];
                        }
                    }
                }

                if (d.ac) {
                    const parts = d.ac.split('§');
                    if (parts.length >= 2) {
                        const cat = getNewCat(parts[0], parts[1]);
                        if (cat) translated.ac = cat.module + '§' + cat.chapitre;
                    }
                }

                if (d.recent) {
                    d.recent.forEach(r => {
                        const oldMod = r.mod || r.module;
                        const oldChap = r.chap || r.chapitre;
                        const cat = getNewCat(oldMod, oldChap);
                        if (cat) {
                            translated.recent.push({
                                ...r,
                                module: cat.module,
                                chapitre: cat.chapitre,
                                key: cat.module + '§' + cat.chapitre
                            });
                        }
                    });
                }
                return translated;
            }

            function impProg(f) {
                const r = new FileReader();
                r.onload = (e) => {
                    try {
                        let d = JSON.parse(e.target.result);
                        d = migrateSaveData(d, D);
                        if (d.qcm && d.red && d.val) {
                            // Show import choice modal
                            const modal = document.getElementById('imp-choice-modal');
                            const btns = document.getElementById('imp-choice-btns');
                            btns.innerHTML = '';

                            // Option 1: Merge into current profile
                            const btn1 = document.createElement('button'); btn1.className = 'imp-choice-btn';
                            btn1.innerHTML = 'Fusionner avec le profil actuel<small>Les réponses seront fusionnées. Les conflits seront résolus manuellement.</small>';
                            btn1.addEventListener('click', () => { modal.classList.remove('open'); document.getElementById('ov').classList.remove('vis'); document.body.style.overflow = ''; doImportMerge(d); });
                            btns.appendChild(btn1);

                            // Option 2: Import into new profile
                            const btn2 = document.createElement('button'); btn2.className = 'imp-choice-btn';
                            btn2.innerHTML = 'Importer dans un nouveau profil<small>Crée un nouveau profil avec toutes les réponses importées.</small>';
                            btn2.addEventListener('click', () => { modal.classList.remove('open'); document.getElementById('ov').classList.remove('vis'); document.body.style.overflow = ''; doImportNewProfile(d); });
                            btns.appendChild(btn2);

                            // Option 3: Cancel
                            const btn3 = document.createElement('button'); btn3.className = 'imp-choice-btn';
                            btn3.innerHTML = 'Annuler';
                            btn3.addEventListener('click', () => { modal.classList.remove('open'); document.getElementById('ov').classList.remove('vis'); document.body.style.overflow = ''; });
                            btns.appendChild(btn3);

                            modal.classList.add('open');
                            document.getElementById('ov').classList.add('vis');
                            document.body.style.overflow = 'hidden';
                        } else alert("Fichier invalide.");
                    } catch (err) { alert("Erreur de lecture."); }
                };
                r.readAsText(f);
                document.getElementById('fi-imp').value = '';
            }

            function extractOfficial(d) {
                // If imported data has validated answers, store them as official corrections
                if (!d.val) return;
                for (const k in d.val) {
                    if (d.val[k] === true) {
                        if (d.qcm && d.qcm[k]) st.official[k] = d.qcm[k];
                        else if (d.red && d.red[k]) st.official[k] = d.red[k];
                    }
                }
            }

            function doImportMerge(d) {
                const diffs = [];
                const check = (localMap, impMap, type) => {
                    for (const k in impMap) {
                        if (localMap[k] !== undefined && JSON.stringify(localMap[k]) !== JSON.stringify(impMap[k])) {
                            diffs.push({ key: k, type, local: localMap[k], import: impMap[k] });
                        }
                    }
                };
                check(st.qcm, d.qcm, 'qcm');
                check(st.red, d.red, 'red');
                check(st.val, d.val, 'val');

                if (diffs.length > 0) {
                    pendingImp = d;
                    showConf(diffs, d);
                } else {
                    Object.assign(st.qcm, d.qcm);
                    Object.assign(st.red, d.red);
                    Object.assign(st.val, d.val);
                    extractOfficial(d);
                    svNow()?.then(() => { location.reload(); });
                }
            }

            function doImportNewProfile(d) {
                const name = prompt('Nom du nouveau profil:', 'Import ' + new Date().toLocaleDateString());
                if (!name || !name.trim()) return;
                if (!d.recent) d.recent = [];
                if (!d.his) d.his = {};
                if (!d.official) d.official = {};
                // Extract official corrections into the imported data
                if (d.val) {
                    for (const k in d.val) {
                        if (d.val[k] === true) {
                            if (d.qcm && d.qcm[k]) d.official[k] = d.qcm[k];
                            else if (d.red && d.red[k]) d.official[k] = d.red[k];
                        }
                    }
                }
                const id = createProfile(name.trim(), d);
                switchProfile(id);
            }

            function showConf(diffs, d) {
                const b = document.getElementById('conf-body'); b.innerHTML = '';
                resolutions = {};
                diffs.forEach((df, i) => {
                    resolutions[df.key] = df.import; // Default to import
                    const qObj = findQ(df.key);
                    const item = document.createElement('div'); item.className = 'conf-item collapsed';
                    let qText = qObj ? qObj.enonce : df.key;
                    item.innerHTML = `
                        <div class="conf-q-info"><span>${esc(qText)}</span></div>
                        <div class="conf-grid">
                            <div class="conf-side" data-key="${esc(df.key)}" data-side="local" id="conf-l-${i}">
                                <div class="conf-label">Local (Sera supprimé si Importé choisi)</div>
                                <div class="conf-val">${formatDiff(df.local, df.import, qObj, false)}</div>
                            </div>
                            <div class="conf-side selected" data-key="${esc(df.key)}" data-side="import" id="conf-i-${i}">
                                <div class="conf-label">Importé (Nouveau)</div>
                                <div class="conf-val">${formatDiff(df.import, df.local, qObj, true)}</div>
                            </div>
                        </div>
                    `;
                    b.appendChild(item);
                    item.querySelector('.conf-q-info').onclick = () => item.classList.toggle('collapsed');
                    const lSide = item.querySelector(`[data-side="local"]`);
                    const iSide = item.querySelector(`[data-side="import"]`);
                    lSide.addEventListener('click', () => { lSide.classList.add('selected'); iSide.classList.remove('selected'); resolutions[df.key] = df.local; });
                    iSide.addEventListener('click', () => { iSide.classList.add('selected'); lSide.classList.remove('selected'); resolutions[df.key] = df.import; });
                });
                document.getElementById('conf-panel').classList.add('open');
                document.getElementById('ov').classList.add('vis');
                document.body.style.overflow = 'hidden';

                document.getElementById('conf-all-local').onclick = () => {
                    diffs.forEach((df, idx) => {
                        resolutions[df.key] = df.local;
                        document.getElementById(`conf-l-${idx}`).classList.add('selected');
                        document.getElementById(`conf-i-${idx}`).classList.remove('selected');
                    });
                };
                document.getElementById('conf-all-imp').onclick = () => {
                    diffs.forEach((df, idx) => {
                        resolutions[df.key] = df.import;
                        document.getElementById(`conf-i-${idx}`).classList.add('selected');
                        document.getElementById(`conf-l-${idx}`).classList.remove('selected');
                    });
                };
                document.getElementById('conf-cancel').onclick = () => {
                    document.getElementById('conf-panel').classList.remove('open');
                    document.getElementById('ov').classList.remove('vis');
                    document.body.style.overflow = '';
                };
                document.getElementById('conf-apply').onclick = () => {
                    // Record history for changes
                    for (const k in resolutions) {
                        const df = diffs.find(x => x.key === k);
                        if (JSON.stringify(df.local) !== JSON.stringify(resolutions[k])) {
                            st.his[k] = { before: df.local, after: resolutions[k], date: Date.now() };
                        }
                    }
                    Object.assign(st.qcm, d.qcm);
                    Object.assign(st.red, d.red);
                    Object.assign(st.val, d.val);
                    // Overwrite with chosen resolutions
                    for (const k in resolutions) {
                        const df = diffs.find(x => x.key === k);
                        if (df.type === 'qcm') st.qcm[k] = resolutions[k];
                        else if (df.type === 'red') st.red[k] = resolutions[k];
                        else if (df.type === 'val') st.val[k] = resolutions[k];
                    }
                    extractOfficial(d);
                    svNow()?.then(() => { location.reload(); });
                };
            }

            function findQ(k) {
                const p = k.split('§'); if (p.length < 3) return null;
                const e = D.find(d => d.module === p[0] && d.chapitre === p[1]);
                return e ? e.questions.find(q => q.id === p[2]) : null;
            }

            function formatDiff(v, other, q, isImp) {
                if (v === "BLANK") return '<div class="conf-val-item"><b><span style="color:var(--v500)">[ LAISSÉ VIDE ]</span></b></div>';
                if (Array.isArray(v)) {
                    if (!v.length) return '<div class="conf-val-item"><span style="color:var(--t4)">Vide</span></div>';
                    return v.map(idx => {
                        let txt = q && q.options && q.options[idx] ? q.options[idx] : (L[idx] || idx);
                        // Clean duplication: if txt starts with "X. ", don't prepend "X: "
                        const label = L[idx] || idx;
                        const prefix = label + '. ';
                        let display = txt.startsWith(prefix) ? txt : (label + ': ' + txt);

                        let cls = '';
                        if (isImp && !other.includes(idx)) cls = ' add';
                        if (!isImp && !other.includes(idx)) cls = ' rem';
                        return `<div class="conf-val-item${cls}"><b>${esc(display)}</b></div>`;
                    }).join('');
                }
                if (typeof v === 'boolean') {
                    let cls = (v !== other) ? (isImp ? ' add' : ' rem') : '';
                    return `<div class="conf-val-item${cls}">${v ? '<span style="color:var(--v500)">Validée</span>' : '<span style="color:var(--t4)">Non validée</span>'}</div>`;
                }
                const normalized = normalizeEditorHtml(v);
                if (!normalized || !hasEditorContent(normalized)) return '<div class="conf-val-item"><span style="color:var(--t4)">Vide</span></div>';
                let cls = (v !== other) ? (isImp ? ' add' : ' rem') : '';
                return `<div class="conf-val-item${cls}">${normalized}</div>`;
            }

            function formatVal(v, q) {
                if (v === "BLANK") return '<b><span style="color:var(--v500)">[ LAISSÉ VIDE ]</span></b>';
                if (Array.isArray(v)) {
                    if (!v.length) return '<span style="color:var(--t4)">Vide</span>';
                    return v.map(idx => {
                        let txt = q && q.options && q.options[idx] ? q.options[idx] : (L[idx] || idx);
                        const label = L[idx] || idx;
                        const prefix = label + '. ';
                        let display = txt.startsWith(prefix) ? txt : (label + ': ' + txt);
                        return `<div style="margin-bottom:4px"><b>${esc(display)}</b></div>`;
                    }).join('');
                }
                if (typeof v === 'boolean') return v ? '<span style="color:var(--v500)">Validée</span>' : '<span style="color:var(--t4)">Non validée</span>';
                const normalized = normalizeEditorHtml(v);
                if (!normalized || !hasEditorContent(normalized)) return '<span style="color:var(--t4)">Vide</span>';
                return normalized;
            }

            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
        })();
    
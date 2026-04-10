import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app-check.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithCredential } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, update } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBbPwpQsTdrfPi6WvfhFVhmhpeYzp5Wn0g",
  authDomain: "e-taraxie.firebaseapp.com",
  projectId: "e-taraxie",
  storageBucket: "e-taraxie.firebasestorage.app",
  messagingSenderId: "490683199342",
  appId: "1:490683199342:web:b3c6df504994c01d4cdb7f",
  measurementId: "G-NWJ26Y115H",
  databaseURL: "https://e-taraxie-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);

// AppCheck: wrapped defensively — a ReCaptcha failure on mobile must never
// crash the rest of the app. Firebase will still work, just without AppCheck.
try {
    initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('6LcJDKAsAAAAABrgFjTSx5rhWXnYLbTxRa1Et7Cg'),
        isTokenAutoRefreshEnabled: true
    });
} catch (e) {
    console.warn("[AppCheck] Init failed, continuing without it:", e.message);
}

const auth = getAuth(app);
const db   = getDatabase(app);

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE DETECTION
// Determines which auth strategy to use.
//
// WHY: Chrome on Android + most mobile browsers block cross-origin popups
// (they treat them as unwanted ads). signInWithPopup silently fails or
// throws, then the redirect fallback fires — but if getRedirectResult()
// is not properly awaited BEFORE onAuthStateChanged, the credential is
// discarded and the user sees nothing even though Firebase validated them.
//
// Strategy:
//   Mobile  → always signInWithRedirect (skip popup entirely)
//   Desktop → signInWithPopup, redirect only as true last-resort fallback
//   Capacitor native app → GoogleAuth plugin (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i
        .test(navigator.userAgent);
}

// ─────────────────────────────────────────────────────────────────────────────
// REDIRECT-PENDING SENTINEL
//
// WHY THIS IS THE KEY FIX:
// When signInWithRedirect is used, the page is destroyed and reloaded.
// On the new page load, Firebase calls both getRedirectResult() AND
// onAuthStateChanged almost simultaneously — but onAuthStateChanged can
// fire with user=null BEFORE getRedirectResult() resolves, because
// getRedirectResult() has async network overhead (it exchanges the
// OAuth code for a token).
//
// The result: onUserLoadCallback(null, null) fires → UI shows "logged out"
// → user sees nothing happened.
//
// The fix: we store a sentinel flag in sessionStorage the moment the user
// clicks login. On the return page load, we detect the sentinel, know a
// redirect is in flight, and make onAuthStateChanged WAIT for
// getRedirectResult() to fully resolve before firing the callback.
// ─────────────────────────────────────────────────────────────────────────────
const REDIRECT_FLAG = 'auth_redirect_pending';

function markRedirectPending() {
    try { sessionStorage.setItem(REDIRECT_FLAG, '1'); } catch(e) {}
}

function clearRedirectPending() {
    try { sessionStorage.removeItem(REDIRECT_FLAG); } catch(e) {}
}

function isRedirectPending() {
    try { return sessionStorage.getItem(REDIRECT_FLAG) === '1'; } catch(e) { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let currentUser = null;

// ─────────────────────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function setSyncStatus(state) {
    const el = document.getElementById('auth-sync-status');
    if (!el) return;
    const map = {
      syncing: { text: '↻ Sync...', color: 'var(--a500)' },
      synced:  { text: '● Synced', color: 'var(--g500)' },
      error:   { text: '✖ Erreur', color: '#ef4444' },
      offline: { text: '○ Hors ligne', color: 'var(--t4)' }
    };
    if (map[state]) {
        el.textContent = map[state].text;
        el.style.color  = map[state].color;
    }
}

window.addEventListener('offline', () => setSyncStatus('offline'));
window.addEventListener('online',  () => setSyncStatus('syncing'));


function showSyncModal(message, okText = "OK", cancelText = "Annuler") {
    return new Promise((resolve) => {
        const overlay    = document.getElementById('syncModalOverlay');
        const msgEl      = document.getElementById('syncModalMessage');
        const btnCancel  = document.getElementById('syncModalBtnCancel');
        const btnConfirm = document.getElementById('syncModalBtnConfirm');

        if (!overlay) { resolve(confirm(message)); return; }

        msgEl.innerText       = message;
        btnConfirm.innerText  = okText;
        btnCancel.innerText   = cancelText;
        overlay.style.display = 'flex';

        const cleanup = () => {
            overlay.style.display = 'none';
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
        };
        const onConfirm = () => { cleanup(); resolve(true);  };
        const onCancel  = () => { cleanup(); resolve(false); };

        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
    });
}

function showOfflineSyncModal(localProfiles, cloudProfiles, localAnswers) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('offlineSyncOverlay');
        if (!overlay) {
            showSyncModal(
                `Données hors ligne détectées.\n${localProfiles} profil(s) local, ${cloudProfiles} profil(s) cloud.\n\nFusionner avec le cloud ?`,
                'Fusionner', 'Supprimer'
            ).then(keep => resolve({ action: keep ? 'merge' : 'discard' }));
            return;
        }

        const summary = document.getElementById('offlineSyncSummary');
        summary.innerHTML = `
            <div class="offline-sync-stat">
                <div class="offline-sync-stat-icon local">${localProfiles}</div>
                <div class="offline-sync-stat-text">Profil(s) local<small>${localAnswers} réponse(s)</small></div>
            </div>
            <div class="offline-sync-stat">
                <div class="offline-sync-stat-icon cloud">${cloudProfiles}</div>
                <div class="offline-sync-stat-text">Profil(s) cloud<small>Dernière sync</small></div>
            </div>
        `;

        const profileSelect    = document.getElementById('offlineSyncProfileSelect');
        const profileSection   = document.getElementById('offlineSyncProfileSection');
        const newProfileWrap   = document.getElementById('offlineSyncNewProfileWrap');

        let profilesHtml = '';
        try {
            const profilesList = JSON.parse(localStorage.getItem('ataraxie_profiles') || '[]');
            const activeId     = localStorage.getItem('ataraxie_active_profile');
            profilesHtml = profilesList.map(p =>
                `<option value="${p.id}"${p.id === activeId ? ' selected' : ''}>${p.name}</option>`
            ).join('');
        } catch(e) {}
        profilesHtml += '<option value="__new__">+ Créer un nouveau profil</option>';
        profileSelect.innerHTML = profilesHtml;

        profileSelect.addEventListener('change', function() {
            newProfileWrap.style.display = profileSelect.value === '__new__' ? '' : 'none';
        });
        newProfileWrap.style.display = 'none';

        let selectedAction = 'merge';
        const mergeCard   = document.getElementById('offlineSyncMerge');
        const discardCard = document.getElementById('offlineSyncDiscard');

        function setAction(action) {
            selectedAction = action;
            mergeCard.classList.toggle('active',  action === 'merge');
            discardCard.classList.toggle('active', action === 'discard');
            profileSection.style.display = action === 'merge' ? '' : 'none';
        }

        mergeCard.onclick  = () => setAction('merge');
        discardCard.onclick = () => setAction('discard');
        setAction('merge');

        overlay.style.display = 'flex';

        const cleanup = () => { overlay.style.display = 'none'; };

        document.getElementById('offlineSyncCancel').onclick = () => {
            cleanup(); resolve({ action: 'cancel' });
        };
        document.getElementById('offlineSyncApply').onclick = () => {
            cleanup();
            resolve({
                action: selectedAction,
                targetProfile:  profileSelect.value,
                newProfileName: document.getElementById('offlineSyncNewProfileName')?.value?.trim() || ''
            });
        };
    });
}

function showSyncNotification(message, type) {
    const syncStatus = document.getElementById('auth-sync-status');
    if (syncStatus) {
        const prevContent = syncStatus.textContent;
        syncStatus.style.color = type === 'error' ? '#ef4444' : 'var(--b500)';
        syncStatus.textContent  = message;
        setTimeout(() => {
            syncStatus.textContent = prevContent;
            syncStatus.style.color = '';
        }, 3000);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE AUTH MANAGER
// ─────────────────────────────────────────────────────────────────────────────
window.FirebaseAuthManager = {

    // ── DATA MERGE ──────────────────────────────────────────────────────────
    mergeDataSets: function(cloudData, localData) {
        const merged = { ...cloudData };
        for (const key in localData) {
            if (key === 'ataraxie_profiles') {
                try {
                    let cP   = cloudData[key] ? JSON.parse(cloudData[key]) : [];
                    let lP   = localData[key]  ? JSON.parse(localData[key]) : [];
                    let pMap = new Map();
                    cP.forEach(p => pMap.set(p.id, p));
                    lP.forEach(p => pMap.set(p.id, p));
                    merged[key] = JSON.stringify(Array.from(pMap.values()));
                } catch(e) {
                    merged[key] = localData[key];
                }
                continue;
            }
            if (key.startsWith('ataraxie_p_')) {
                try {
                    const cloud  = cloudData[key] ? JSON.parse(cloudData[key]) : null;
                    const local  = localData[key]  ? JSON.parse(localData[key]) : null;
                    if (!cloud) { merged[key] = localData[key]; continue; }
                    if (!local)  continue;

                    const result = { ...cloud };
                    for (const subKey of ['qcm', 'red', 'val', 'his', 'recent']) {
                        if (local[subKey]) {
                            result[subKey] = result[subKey] || (Array.isArray(local[subKey]) ? [] : {});
                            if (Array.isArray(local[subKey])) {
                                result[subKey] = [...local[subKey], ...result[subKey]];
                                if (subKey === 'recent') {
                                    const seen = new Set();
                                    result[subKey] = result[subKey].filter(r => {
                                        const dup = seen.has(r.key);
                                        seen.add(r.key);
                                        return !dup;
                                    });
                                }
                            } else {
                                Object.assign(result[subKey], local[subKey]);
                            }
                        }
                    }
                    merged[key] = JSON.stringify(result);
                } catch(e) { merged[key] = localData[key]; }
            } else {
                merged[key] = localData[key];
            }
        }

        // Prune orphaned profile data keys
        try {
            const registeredIds = new Set(
                JSON.parse(merged['ataraxie_profiles'] || '[]').map(p => p.id)
            );
            for (const key in merged) {
                if (key.startsWith('ataraxie_p_')) {
                    const profileId = key.replace('ataraxie_p_', '');
                    if (!registeredIds.has(profileId)) {
                        console.log('[Merge] Pruning orphaned profile data:', key);
                        delete merged[key];
                    }
                }
            }
        } catch(e) { console.warn('[Merge] Orphan cleanup skipped:', e); }

        return merged;
    },

    // ── INIT ─────────────────────────────────────────────────────────────────
    // THE CORE FIX: We resolve getRedirectResult() FIRST, then let
    // onAuthStateChanged fire. This is achieved by making onAuthStateChanged
    // await a promise that only resolves after getRedirectResult() completes.
    // This eliminates the race condition where onAuthStateChanged(user=null)
    // fires before the redirect credential is consumed.
    // ─────────────────────────────────────────────────────────────────────────
    init: function(onUserLoadCallback) {
        const self = this;

        // --- Step 1: Build the redirect gate promise ---
        // This promise resolves the moment getRedirectResult() settles
        // (whether it found a user or not). onAuthStateChanged will not
        // invoke onUserLoadCallback until this gate opens.
        let redirectGateOpen = false;
        let openRedirectGate;
        const redirectGate = new Promise(resolve => { openRedirectGate = resolve; });

        // --- Step 2: Consume any pending redirect result ---
        // This MUST run before we register the onAuthStateChanged callback.
        // If a redirect was pending (flag set in sessionStorage), we know to
        // wait. If not, we open the gate immediately so normal loads aren't
        // delayed.
        if (isRedirectPending()) {
            // A redirect was initiated — wait for Firebase to process it.
            getRedirectResult(auth)
                .then((result) => {
                    if (result && result.user) {
                        console.log('[Auth] ✓ Redirect login succeeded:', result.user.email);
                    } else {
                        console.log('[Auth] Redirect returned no user (normal if navigating back).');
                    }
                })
                .catch((error) => {
                    // Common causes on mobile:
                    //   auth/web-storage-unsupported → 3rd-party cookies blocked
                    //   auth/operation-not-supported-in-this-environment
                    //   auth/popup-blocked
                    console.error('[Auth] getRedirectResult error:', error.code, error.message);
                })
                .finally(() => {
                    clearRedirectPending();
                    redirectGateOpen = true;
                    openRedirectGate();
                });
        } else {
            // No redirect in flight — open the gate immediately.
            redirectGateOpen = true;
            openRedirectGate();
        }

        // --- Step 3: Register auth state observer ---
        // We await the redirect gate so onUserLoadCallback is never called
        // with null BEFORE a redirect result has been processed.
        onAuthStateChanged(auth, async (user) => {
            if (!redirectGateOpen) {
                await redirectGate;
            }

            currentUser = user;

            if (user) {
                console.log('[Auth] User is authenticated:', user.email);
                try {
                    const cloudData = await self.syncAndLoadData(user);
                    onUserLoadCallback(cloudData, user);
                } catch (err) {
                    console.error('[Auth] syncAndLoadData failed:', err);
                    // Still authenticate the user even if sync fails
                    onUserLoadCallback(null, user);
                }
            } else {
                console.log('[Auth] No authenticated user.');
                onUserLoadCallback(null, null);
            }
        });

        // --- Step 4: Online re-sync listener (unchanged logic) ---
        window.addEventListener('online', async () => {
            if (!currentUser) return;
            console.log('[Auth] Network restored. Checking for offline data...');

            let localDataDump = {};
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (key && key.startsWith('ataraxie_')) {
                    localDataDump[key] = localStorage.getItem(key);
                }
            }
            if (Object.keys(localDataDump).length === 0) return;

            try {
                const snapshot = await get(child(ref(db), `users/${currentUser.uid}`));
                if (!snapshot.exists()) return;

                const cloudData = snapshot.val().data || {};
                let hasDifferences = false;
                for (let k in localDataDump) {
                    if (localDataDump[k] !== cloudData[k]) { hasDifferences = true; break; }
                }
                if (!hasDifferences) {
                    for (let k in cloudData) {
                        if (cloudData[k] !== localDataDump[k]) { hasDifferences = true; break; }
                    }
                }
                if (!hasDifferences) return;

                let localProfiles = 0, cloudProfiles = 0, localAnswers = 0;
                try { localProfiles = JSON.parse(localDataDump['ataraxie_profiles'] || '[]').length; } catch(e) {}
                try { cloudProfiles = JSON.parse(cloudData['ataraxie_profiles'] || '[]').length; } catch(e) {}
                for (let k in localDataDump) {
                    if (k.startsWith('ataraxie_p_')) {
                        try {
                            const pd = JSON.parse(localDataDump[k]);
                            localAnswers += Object.keys(pd.qcm || {}).length + Object.keys(pd.red || {}).length;
                        } catch(e) {}
                    }
                }

                const result = await showOfflineSyncModal(localProfiles, cloudProfiles, localAnswers);
                if (result.action === 'merge') {
                    const mergedData = window.FirebaseAuthManager.mergeDataSets(cloudData, localDataDump);
                    await update(ref(db, 'users/' + currentUser.uid + '/data'), mergedData);
                    for (let key in mergedData) {
                        if (key.startsWith('ataraxie_')) localStorage.setItem(key, mergedData[key]);
                    }
                    showSyncNotification('✔ Données fusionnées', 'success');
                } else if (result.action === 'discard') {
                    window.FirebaseAuthManager.pullNow();
                    showSyncNotification('✔ Données cloud restaurées', 'success');
                }

                if (typeof refreshUI === 'function') refreshUI();

            } catch(err) {
                console.error('[Auth] Online sync error:', err);
                showSyncNotification('Erreur de synchronisation', 'error');
            }
        });
    },

    // ── LOGIN ────────────────────────────────────────────────────────────────
    // Strategy:
    //   1. Capacitor native app          → GoogleAuth plugin (no change)
    //   2. Mobile browser (any)          → signInWithRedirect directly
    //      WHY: Popups are blocked on mobile Chrome, Samsung Browser, Firefox
    //      for Android, etc. Attempting popup first causes a visible failure
    //      then a redirect — confusing the user and creating a race condition.
    //   3. Desktop browser               → signInWithPopup (best UX, no page
    //      reload), redirect only as true last-resort.
    // ─────────────────────────────────────────────────────────────────────────
    login: async function() {
        // ── Capacitor native (Android / iOS app shell) ───────────────────────
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            try {
                window.Capacitor.Plugins.GoogleAuth.initialize();
                const googleUser = await window.Capacitor.Plugins.GoogleAuth.signIn();
                const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
                await signInWithCredential(auth, credential);
                return;
            } catch (error) {
                console.error('[Auth] Capacitor native auth error:', error);
                alert('Erreur de connexion native: ' + JSON.stringify(error));
                return; // Never fall through to web — redirect breaks Capacitor.
            }
        }

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        // ── Mobile browser → always redirect ────────────────────────────────
        if (isMobileDevice()) {
            console.log('[Auth] Mobile device detected → signInWithRedirect');
            markRedirectPending(); // Set sentinel BEFORE the redirect
            try {
                await signInWithRedirect(auth, provider);
            } catch (error) {
                clearRedirectPending(); // Clean up if redirect itself fails
                console.error('[Auth] signInWithRedirect failed:', error);
            }
            return;
        }

        // ── Desktop browser → popup with redirect fallback ───────────────────
        try {
            console.log('[Auth] Desktop → signInWithPopup');
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.warn('[Auth] Popup failed:', error.code);
            if (
                error.code === 'auth/popup-closed-by-user' ||
                error.code === 'auth/cancelled-popup-request'
            ) {
                return; // User deliberately closed — do nothing.
            }
            // Blocked popup, storage issue, CORS, etc. → fall back to redirect.
            console.log('[Auth] Falling back to signInWithRedirect');
            markRedirectPending();
            try {
                await signInWithRedirect(auth, provider);
            } catch (redirectError) {
                clearRedirectPending();
                console.error('[Auth] Redirect fallback also failed:', redirectError);
            }
        }
    },

    // ── LOGOUT ───────────────────────────────────────────────────────────────
    logout: async function() {
        try {
            await signOut(auth);

            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                await window.Capacitor.Plugins.GoogleAuth.signOut();
            }

            let keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (key && key.startsWith('ataraxie_')) keysToRemove.push(key);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));

            location.reload();
        } catch (error) {
            console.error('[Auth] Logout failed:', error);
        }
    },

    // ── GET USER ─────────────────────────────────────────────────────────────
    getUser: function() {
        return currentUser;
    },

    // ── SYNC AND LOAD DATA ───────────────────────────────────────────────────
    syncAndLoadData: async function(user) {
        if (!user) return null;

        const dbRef    = ref(db);
        const snapshot = await get(child(dbRef, `users/${user.uid}`));

        let localDataDump = {};
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key && key.startsWith('ataraxie_')) {
                localDataDump[key] = localStorage.getItem(key);
            }
        }

        if (!snapshot.exists()) {
            // First login: push all local data to cloud
            const payload = {
                metadata: { email: user.email, linkedAt: Date.now() },
                data: localDataDump
            };
            await set(ref(db, 'users/' + user.uid), payload);
            return localDataDump;
        }

        // Existing account: check for local vs cloud differences
        const docData   = snapshot.val();
        const cloudData = docData.data || {};

        let hasDifferences = false;
        if (Object.keys(localDataDump).length > 0) {
            for (let k in localDataDump) {
                if (localDataDump[k] !== cloudData[k]) { hasDifferences = true; break; }
            }
            if (!hasDifferences) {
                for (let k in cloudData) {
                    if (cloudData[k] !== localDataDump[k]) { hasDifferences = true; break; }
                }
            }
        }

        if (hasDifferences) {
            let localCount = 0, cloudCount = 0;
            try { localCount = JSON.parse(localDataDump['ataraxie_profiles'] || '[]').length; } catch(e) {}
            try { cloudCount = JSON.parse(cloudData['ataraxie_profiles'] || '[]').length; } catch(e) {}

            const keepLocal = await showSyncModal(
                `Des données sauvegardées localement ont été détectées.\n\nLocale : ${localCount} profil(s)\nCloud : ${cloudCount} profil(s)\n\nVoulez-vous synchroniser ces données avec le Cloud (les conserver) ou télécharger les dernières données en ligne (et écraser les données locales) ?`,
                "Conserver (Cloud ↑)",
                "Télécharger (Cloud ↓)"
            );

            if (keepLocal) {
                const mergedData = this.mergeDataSets(cloudData, localDataDump);
                await update(ref(db, 'users/' + user.uid + '/data'), mergedData);
                for (let key in mergedData) {
                    if (key.startsWith('ataraxie_')) localStorage.setItem(key, mergedData[key]);
                }
                return mergedData;
            }
        }

        // Normal sync: overwrite local with cloud
        let keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key && key.startsWith('ataraxie_')) keysToRemove.push(key);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));

        for (let key in cloudData) {
            if (key.startsWith('ataraxie_')) localStorage.setItem(key, cloudData[key]);
        }
        return cloudData;
    },

    // ── SAVE PROGRESS (delta sync) ───────────────────────────────────────────
    saveProgress: async function(profileSK, stateObject) {
        if (!profileSK || typeof profileSK !== 'string' || !profileSK.startsWith('ataraxie_')) {
            console.warn('[Sync] saveProgress: invalid profileSK', profileSK);
            return;
        }

        if (stateObject) {
            const jsonState = JSON.stringify(stateObject);
            setSyncStatus('syncing');
            localStorage.setItem(profileSK, jsonState);

            if (currentUser) {
                try {
                    const updates = {};
                    updates[profileSK] = jsonState;
                    await update(ref(db, 'users/' + currentUser.uid + '/data'), updates);
                    setSyncStatus('synced');
                } catch(e) {
                    console.error('[Sync] Fast-sync error:', e);
                    setSyncStatus('error');
                }
            }
        } else {
            await this.forceSync();
        }
    },

    // ── FORCE SYNC (full upload) ─────────────────────────────────────────────
    forceSync: async function() {
        if (!currentUser) return;
        try {
            setSyncStatus('syncing');
            let fullData = {};
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (key && key.startsWith('ataraxie_')) fullData[key] = localStorage.getItem(key);
            }
            await update(ref(db, 'users/' + currentUser.uid + '/data'), fullData);
            setSyncStatus('synced');
        } catch(e) {
            console.error('[Sync] forceSync error:', e);
            setSyncStatus('error');
        }
    },

    // ── PULL NOW (full download + UI refresh) ────────────────────────────────
    pullNow: async function() {
        if (!currentUser) return;
        try {
            const syncStatusIcon = document.getElementById('auth-sync-status');
            if (syncStatusIcon) {
                syncStatusIcon.style.color = 'var(--b500)';
                syncStatusIcon.textContent = '↻ Syncing...';
            }

            const snapshot = await get(child(ref(db), `users/${currentUser.uid}`));
            if (snapshot.exists()) {
                const cloudData = snapshot.val().data || {};

                let keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    let key = localStorage.key(i);
                    if (key && key.startsWith('ataraxie_')) keysToRemove.push(key);
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));

                for (let key in cloudData) {
                    if (key.startsWith('ataraxie_')) localStorage.setItem(key, cloudData[key]);
                }

                if (typeof window.refreshUI === 'function') {
                    window.refreshUI();
                } else {
                    location.reload();
                }
            }
        } catch(e) {
            console.error('[Sync] pullNow error:', e);
            const syncStatusIcon = document.getElementById('auth-sync-status');
            if (syncStatusIcon) {
                syncStatusIcon.style.color  = '#ef4444';
                syncStatusIcon.textContent  = '✖ Failed';
            }
        }
    }
};

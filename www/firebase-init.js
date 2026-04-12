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

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  ONE-TIME SETUP REQUIRED
//
// 1. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID
//      Authorized JavaScript origins: https://mo74meed.github.io
//      Authorized redirect URIs:      https://e-taraxie.firebaseapp.com/__/auth/handler
//
// 2. Paste your OAuth Client ID into GOOGLE_CLIENT_ID below.
//    It is NOT the Firebase apiKey. Find it in:
//    Google Cloud Console → Credentials → OAuth 2.0 Client IDs → your web client → "Client ID"
//    Format: NUMBERS-LETTERS.apps.googleusercontent.com
//
// 3. OAuth consent screen must be "Published", OR the test Google account must
//    be added to the test users list — otherwise One Tap silently does nothing.
// ─────────────────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '490683199342-k5t3t68esrl262i1jfshldcf2tho7ave.apps.googleusercontent.com';

const app = initializeApp(firebaseConfig);

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
// ─────────────────────────────────────────────────────────────────────────────
function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i
        .test(navigator.userAgent);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE ONE TAP / FedCM
//
// FedCM = Federated Credential Management API.
// Shows a native browser bottom sheet (Android Chrome) or dialog (desktop)
// listing the user's already-logged-in Google accounts.
// The user taps one — done. No redirect. No popup. No page reload.
//
// Supported: Android Chrome 108+, Desktop Chrome 109+
// Falls back gracefully if unavailable or suppressed.
// ─────────────────────────────────────────────────────────────────────────────
function isOneTapSupported() {
    return typeof window.google !== 'undefined' &&
           typeof window.google.accounts !== 'undefined' &&
           typeof window.google.accounts.id !== 'undefined';
}

function loadOneTapScript() {
    return new Promise((resolve) => {
        if (isOneTapSupported()) { resolve(); return; }
        if (document.getElementById('google-gsi-script')) {
            const check = setInterval(() => {
                if (isOneTapSupported()) { clearInterval(check); resolve(); }
            }, 50);
            setTimeout(() => { clearInterval(check); resolve(); }, 3000);
            return;
        }
        const script = document.createElement('script');
        script.id    = 'google-gsi-script';
        script.src   = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload  = () => resolve();
        script.onerror = () => resolve(); // Fail gracefully
        document.head.appendChild(script);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// REDIRECT SENTINEL
// Kept only for the Tier-3 redirect fallback path.
// Written to BOTH sessionStorage and localStorage for resilience —
// Android Chrome may wipe sessionStorage during cross-origin redirects.
// ─────────────────────────────────────────────────────────────────────────────
const REDIRECT_FLAG        = 'auth_redirect_pending';
const REDIRECT_FLAG_BACKUP = 'ataraxie_auth_redirect_backup';

function markRedirectPending() {
    try { sessionStorage.setItem(REDIRECT_FLAG, '1'); } catch(e) {}
    try { localStorage.setItem(REDIRECT_FLAG_BACKUP, '1'); } catch(e) {}
}

function clearRedirectPending() {
    try { sessionStorage.removeItem(REDIRECT_FLAG); } catch(e) {}
    try { localStorage.removeItem(REDIRECT_FLAG_BACKUP); } catch(e) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
let currentUser = null;
let loginInProgress = false;

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

        mergeCard.onclick   = () => setAction('merge');
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

        try {
            const registeredIds = new Set(
                JSON.parse(merged['ataraxie_profiles'] || '[]').map(p => p.id)
            );
            for (const key in merged) {
                if (key.startsWith('ataraxie_p_')) {
                    const profileId = key.replace('ataraxie_p_', '');
                    if (!registeredIds.has(profileId)) {
                        delete merged[key];
                    }
                }
            }
        } catch(e) { console.warn('[Merge] Orphan cleanup skipped:', e); }

        return merged;
    },

    // ── INIT ─────────────────────────────────────────────────────────────────
    // One Tap resolves entirely client-side and fires onAuthStateChanged
    // directly — no redirect, no gate needed for it.
    // getRedirectResult() is still called unconditionally to handle the
    // Tier-3 redirect fallback path if it was ever triggered.
    // ─────────────────────────────────────────────────────────────────────────
    init: function(onUserLoadCallback) {
        const self = this;

        // Always consume any pending redirect result (Tier-3 fallback path).
        // When One Tap is used this resolves instantly with null — zero cost.
        const redirectResultPromise = getRedirectResult(auth)
            .then((result) => {
                if (result && result.user) {
                    console.log('[Auth] ✓ Redirect result captured:', result.user.email);
                }
                return result;
            })
            .catch((error) => {
                console.error('[Auth] getRedirectResult error:', error.code, error.message);
                return null;
            })
            .finally(() => {
                clearRedirectPending();
            });

        // Gate the FIRST onAuthStateChanged call behind redirect result resolution
        // to prevent the race condition on page load.
        //
        // IMPORTANT: we do NOT unsubscribe after first call. If the user was null
        // on page load (not logged in) and then signs in via One Tap, Firebase fires
        // onAuthStateChanged again with the new user. If we had unsubscribed, that
        // second fire would be silently dropped and the UI would never update.
        //
        // Instead we only gate the very first invocation, then let all subsequent
        // calls through immediately (the redirect is already resolved by then).
        let initialGatePassed = false;
        let callbackInProgress = false;

        onAuthStateChanged(auth, async (user) => {
            // On the very first fire, wait for redirect result to settle.
            if (!initialGatePassed) {
                await redirectResultPromise;
                initialGatePassed = true;
            }

            // Prevent overlapping executions (e.g. rapid state changes).
            if (callbackInProgress) return;
            callbackInProgress = true;

            currentUser = user;

            try {
                if (user) {
                    console.log('[Auth] User authenticated:', user.email);
                    try {
                        const cloudData = await self.syncAndLoadData(user);
                        onUserLoadCallback(cloudData, user);
                    } catch (err) {
                        console.error('[Auth] syncAndLoadData failed:', err);
                        onUserLoadCallback(null, user);
                    }
                } else {
                    console.log('[Auth] No authenticated user.');
                    onUserLoadCallback(null, null);
                }
            } finally {
                callbackInProgress = false;
            }
        });

        // Online re-sync listener
        window.addEventListener('online', async () => {
            if (!currentUser) return;

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
    // Four-tier waterfall. Tried in order, each falls back to the next.
    //
    //  Tier 0 — Capacitor native app → GoogleAuth plugin (unchanged)
    //
    //  Tier 1 — Google One Tap / FedCM  ← PRIMARY MOBILE FIX
    //    Shows native Chrome account chooser. No redirect. No popup. No reload.
    //    Works on Android Chrome 108+. Resolves via JWT → signInWithCredential.
    //    Falls back if: library fails to load, user has no Google accounts
    //    signed into Chrome, prompt was dismissed too many times (browser
    //    suppresses it), or GOOGLE_CLIENT_ID is not configured.
    //
    //  Tier 2 — signInWithPopup (desktop only)
    //    Best UX on desktop. Skipped on mobile (popups are blocked).
    //
    //  Tier 3 — signInWithRedirect (true last resort)
    //    Only reached if all above fail. Page reloads.
    //    getRedirectResult() in init() handles the credential on return.
    // ─────────────────────────────────────────────────────────────────────────
    login: async function() {

        if (loginInProgress) {
            console.log('[Auth] Login already in progress, ignoring duplicate request.');
            return;
        }
        loginInProgress = true;

        // ── Tier 0: Capacitor native ─────────────────────────────────────────
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
                return;
            } finally {
                loginInProgress = false;
            }
        }

        // ── Tier 1: Google One Tap / FedCM ──────────────────────────────────
        const clientIdConfigured = !GOOGLE_CLIENT_ID.includes('REPLACE_WITH_YOUR_REAL_CLIENT_ID');

        if (clientIdConfigured) {
            try {
                await loadOneTapScript();

                if (isOneTapSupported()) {
                    const idToken = await new Promise((resolve, reject) => {
                        // 8s timeout — if the prompt doesn't appear, fall through
                        const timeout = setTimeout(() => {
                            reject(new Error('one-tap-timeout'));
                        }, 8000);

                        window.google.accounts.id.initialize({
                            client_id: GOOGLE_CLIENT_ID,
                            callback: (response) => {
                                clearTimeout(timeout);
                                if (response && response.credential) {
                                    resolve(response.credential);
                                } else {
                                    reject(new Error('one-tap-no-credential'));
                                }
                            },
                            use_fedcm_for_prompt: true,  // Native browser UI on Chrome
                            cancel_on_tap_outside: false,
                            context: 'signin',
                        });

                        window.google.accounts.id.prompt((notification) => {
                            if (notification.isNotDisplayed()) {
                                clearTimeout(timeout);
                                // Browser suppressed the prompt (too many dismissals, or
                                // no Google accounts signed into this Chrome profile)
                                reject(new Error('one-tap-not-displayed:' + notification.getNotDisplayedReason()));
                            }
                            if (notification.isSkippedMoment()) {
                                clearTimeout(timeout);
                                reject(new Error('one-tap-skipped:' + notification.getSkippedReason()));
                            }
                            // If displayed: user picks account → callback fires → resolve
                        });
                    });

                    // Exchange Google JWT for Firebase credential — no redirect needed
                    const firebaseCredential = GoogleAuthProvider.credential(idToken);
                    await signInWithCredential(auth, firebaseCredential);
                    console.log('[Auth] ✓ One Tap / FedCM sign-in succeeded');
                    loginInProgress = false;
                    return;
                }
            } catch (oneTapError) {
                console.warn('[Auth] One Tap unavailable, falling through:', oneTapError.message);
                // Continue to Tier 2 / Tier 3
            }
        } else {
            console.warn('[Auth] GOOGLE_CLIENT_ID not set — One Tap disabled. Configure it in firebase-init.js.');
        }

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        // ── Tier 2: signInWithPopup (desktop only) ───────────────────────────
        if (!isMobileDevice()) {
            try {
                console.log('[Auth] Desktop → signInWithPopup');
                await signInWithPopup(auth, provider);
                loginInProgress = false;
                return;
            } catch (error) {
                console.warn('[Auth] Popup failed:', error.code);
                if (
                    error.code === 'auth/popup-closed-by-user' ||
                    error.code === 'auth/cancelled-popup-request'
                ) {
                    loginInProgress = false;
                    return; // User deliberately closed
                }

                const shouldFallbackToRedirect =
                    error.code === 'auth/popup-blocked' ||
                    error.code === 'auth/operation-not-supported-in-this-environment' ||
                    error.code === 'auth/web-storage-unsupported';

                if (!shouldFallbackToRedirect) {
                    console.warn('[Auth] Not falling back to redirect for this popup error.');
                    loginInProgress = false;
                    return;
                }

                // Fall through to Tier 3 for known popup-blocking environments only.
            }
        }

        // ── Tier 3: signInWithRedirect (last resort) ─────────────────────────
        console.log('[Auth] Tier 3 → signInWithRedirect');
        markRedirectPending();
        try {
            await signInWithRedirect(auth, provider);
        } catch (redirectError) {
            clearRedirectPending();
            console.error('[Auth] signInWithRedirect failed:', redirectError);
            loginInProgress = false;
        }
    },

    // ── LOGOUT ───────────────────────────────────────────────────────────────
    logout: async function() {
        try {
            // Revoke One Tap auto-select so the account chooser reappears next time
            if (isOneTapSupported()) {
                try { window.google.accounts.id.disableAutoSelect(); } catch(e) {}
            }

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
            const payload = {
                metadata: { email: user.email, linkedAt: Date.now() },
                data: localDataDump
            };
            await set(ref(db, 'users/' + user.uid), payload);
            return localDataDump;
        }

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

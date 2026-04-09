import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app-check.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    getAuth,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged,
    signInWithCredential
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, update } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

// ─────────────────────────────────────────────
//  FIREBASE SETUP
// ─────────────────────────────────────────────
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

initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LcJDKAsAAAAABrgFjTSx5rhWXnYLbTxRa1Et7Cg'),
    isTokenAutoRefreshEnabled: true
});

const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;


// ─────────────────────────────────────────────
//  PLATFORM DETECTION
//  Detects which environment we're in so login
//  uses exactly the right flow every time.
// ─────────────────────────────────────────────
const Platform = (() => {
    const ua = navigator.userAgent || '';

    // Capacitor native app (Android APK / iOS IPA)
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform());

    // Android mobile browser (Chrome, Firefox, etc.) — NOT inside native APK
    const isAndroidBrowser = !isNative && /Android/i.test(ua);

    // Other mobile browsers (iOS Safari, etc.)
    const isOtherMobile = !isNative && !isAndroidBrowser &&
        /webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    // Anything else = desktop web
    const isDesktop = !isNative && !isAndroidBrowser && !isOtherMobile;

    return { isNative, isAndroidBrowser, isOtherMobile, isDesktop };
})();


// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────
function setSyncStatus(state) {
    const el = document.getElementById('auth-sync-status');
    if (!el) return;
    const map = {
        syncing: { text: '↻ Sync...', color: 'var(--a500)' },
        synced:  { text: '● Synced',  color: 'var(--g500)' },
        error:   { text: '✖ Erreur',  color: '#ef4444'     },
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

        msgEl.innerText        = message;
        btnConfirm.innerText   = okText;
        btnCancel.innerText    = cancelText;
        overlay.style.display  = 'flex';

        const cleanup = () => {
            overlay.style.display = 'none';
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click',  onCancel);
        };
        const onConfirm = () => { cleanup(); resolve(true);  };
        const onCancel  = () => { cleanup(); resolve(false); };

        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click',  onCancel);
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

        const profileSelect      = document.getElementById('offlineSyncProfileSelect');
        const profileSection     = document.getElementById('offlineSyncProfileSection');
        const newProfileWrap     = document.getElementById('offlineSyncNewProfileWrap');

        let profilesHtml = '';
        try {
            const profilesList = JSON.parse(localStorage.getItem('ataraxie_profiles') || '[]');
            const activeId     = localStorage.getItem('ataraxie_active_profile');
            profilesHtml = profilesList.map(p =>
                `<option value="${p.id}"${p.id === activeId ? ' selected' : ''}>${p.name}</option>`
            ).join('');
        } catch(e) {}
        profilesHtml += '<option value="__new__">+ Créer un nouveau profil</option>';
        profileSelect.innerHTML  = profilesHtml;
        newProfileWrap.style.display = 'none';

        profileSelect.addEventListener('change', () => {
            newProfileWrap.style.display = profileSelect.value === '__new__' ? '' : 'none';
        });

        let selectedAction = 'merge';
        const mergeCard   = document.getElementById('offlineSyncMerge');
        const discardCard = document.getElementById('offlineSyncDiscard');

        function setAction(action) {
            selectedAction = action;
            mergeCard.classList.toggle('active',   action === 'merge');
            discardCard.classList.toggle('active',  action === 'discard');
            profileSection.style.display = action === 'merge' ? '' : 'none';
        }

        mergeCard.onclick   = () => setAction('merge');
        discardCard.onclick = () => setAction('discard');
        setAction('merge');

        overlay.style.display = 'flex';

        const cleanup = () => { overlay.style.display = 'none'; };

        document.getElementById('offlineSyncCancel').onclick = () => {
            cleanup();
            resolve({ action: 'cancel' });
        };

        document.getElementById('offlineSyncApply').onclick = () => {
            cleanup();
            resolve({
                action: selectedAction,
                targetProfile: profileSelect.value,
                newProfileName: document.getElementById('offlineSyncNewProfileName')?.value?.trim() || ''
            });
        };
    });
}

function showSyncNotification(message, type) {
    const el = document.getElementById('auth-sync-status');
    if (!el) return;
    const prev = el.textContent;
    el.style.color = type === 'error' ? '#ef4444' : 'var(--b500)';
    el.textContent = message;
    setTimeout(() => { el.textContent = prev; el.style.color = ''; }, 3000);
}


// ─────────────────────────────────────────────
//  MAIN AUTH MANAGER
// ─────────────────────────────────────────────
window.FirebaseAuthManager = {

    // ── Data merge helper ──────────────────────
    mergeDataSets: function(cloudData, localData) {
        const merged = { ...cloudData };
        for (const key in localData) {
            if (key === 'ataraxie_profiles') {
                try {
                    let cP = cloudData[key] ? JSON.parse(cloudData[key]) : [];
                    let lP = localData[key]  ? JSON.parse(localData[key])  : [];
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
                    const cloud = cloudData[key] ? JSON.parse(cloudData[key]) : null;
                    const local = localData[key]  ? JSON.parse(localData[key])  : null;
                    if (!cloud) { merged[key] = localData[key]; continue; }
                    if (!local) continue;

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
                        console.log('mergeDataSets: pruning orphaned key:', key);
                        delete merged[key];
                    }
                }
            }
        } catch(e) { console.warn('mergeDataSets: orphan cleanup skipped', e); }

        return merged;
    },

    // ── Init ──────────────────────────────────
    init: function(onUserLoadCallback) {
        // Consume any pending redirect result first (needed for mobile redirect flow)
        getRedirectResult(auth)
            .then(result => {
                if (result?.user) {
                    console.log('[Auth] Redirect sign-in completed:', result.user.email);
                }
            })
            .catch(err => {
                console.error('[Auth] getRedirectResult error:', err);
            });

        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user) {
                console.log('[Auth] User signed in:', user.email);
                try {
                    const cloudData = await this.syncAndLoadData(user);
                    onUserLoadCallback(cloudData, user);
                } catch (err) {
                    console.error('[Auth] Sync failed, using local fallback:', err);
                    onUserLoadCallback(null, user);
                }
            } else {
                console.log('[Auth] No user signed in.');
                onUserLoadCallback(null, null);
            }
        });

        // Back-online sync
        window.addEventListener('online', async () => {
            if (!currentUser) return;
            console.log('[Auth] Back online — checking for offline diffs...');
            await this._handleOnlineSync();
        });
    },

    // ─────────────────────────────────────────
    //  LOGIN  (the rebuilt part)
    //
    //  3 distinct paths:
    //    1. Capacitor native APK  → GoogleAuth plugin
    //    2. Android mobile browser → signInWithRedirect (popups blocked by Chrome)
    //    3. Desktop / other        → signInWithPopup, fallback to redirect
    // ─────────────────────────────────────────
    login: async function() {

        // ── PATH 1 ── Capacitor native APK / IPA ──
        if (Platform.isNative) {
            await this._loginNative();
            return;
        }

        // ── PATH 2 ── Android mobile browser ──────
        // Chrome on Android blocks cross-origin popups so redirect is mandatory.
        if (Platform.isAndroidBrowser) {
            await this._loginRedirect();
            return;
        }

        // ── PATH 3 ── Desktop / other mobile ──────
        await this._loginPopupWithFallback();
    },

    // --- Internal login methods ---

    /** Native Capacitor (APK) sign-in via GoogleAuth plugin */
    _loginNative: async function() {
        try {
            // Re-initialize in case the plugin wasn't ready at startup
            await window.Capacitor.Plugins.GoogleAuth.initialize();

            const googleUser = await window.Capacitor.Plugins.GoogleAuth.signIn();
            const idToken    = googleUser?.authentication?.idToken;

            if (!idToken) throw new Error('No idToken returned from GoogleAuth plugin.');

            const credential = GoogleAuthProvider.credential(idToken);
            await signInWithCredential(auth, credential);

            console.log('[Auth] Native Capacitor sign-in success.');
        } catch (err) {
            console.error('[Auth] Native Capacitor sign-in failed:', err);
            // Show a user-friendly message — do NOT fall back to web redirect
            // because Capacitor can't handle OAuth redirects reliably.
            this._showLoginError(
                'Connexion impossible via l\'application native.\n' +
                'Vérifiez que vous avez accès à Google et réessayez.'
            );
        }
    },

    /** Redirect-based sign-in (required on Android mobile browsers) */
    _loginRedirect: async function() {
        try {
            const provider = this._buildProvider();
            console.log('[Auth] Starting redirect sign-in (Android browser)...');
            await signInWithRedirect(auth, provider);
            // Page will reload; getRedirectResult() in init() picks it up.
        } catch (err) {
            console.error('[Auth] signInWithRedirect failed:', err);
            this._showLoginError('Connexion échouée. Vérifiez votre connexion et réessayez.');
        }
    },

    /** Popup sign-in for desktop, with graceful redirect fallback */
    _loginPopupWithFallback: async function() {
        const provider = this._buildProvider();
        try {
            console.log('[Auth] Starting popup sign-in (desktop)...');
            await signInWithPopup(auth, provider);
        } catch (err) {
            const blockedCodes = [
                'auth/popup-blocked',
                'auth/popup-closed-by-user',
                'auth/cancelled-popup-request'
            ];
            if (blockedCodes.includes(err.code)) {
                console.warn('[Auth] Popup blocked or closed — falling back to redirect:', err.code);
                try {
                    await signInWithRedirect(auth, provider);
                } catch (redirectErr) {
                    console.error('[Auth] Redirect fallback also failed:', redirectErr);
                    this._showLoginError('Connexion échouée. Réessayez ou autorisez les popups.');
                }
            } else {
                console.error('[Auth] signInWithPopup unexpected error:', err);
                this._showLoginError('Connexion échouée : ' + (err.message || err.code));
            }
        }
    },

    /** Build a configured GoogleAuthProvider */
    _buildProvider: function() {
        const provider = new GoogleAuthProvider();
        // 'select_account' forces the account chooser every time, preventing
        // infinite re-auth loops when the token is already cached.
        provider.setCustomParameters({ prompt: 'select_account' });
        return provider;
    },

    /** Show a login error to the user */
    _showLoginError: function(message) {
        const overlay = document.getElementById('syncModalOverlay');
        if (overlay) {
            showSyncModal(message, 'OK', '').catch(() => {});
        } else {
            alert(message);
        }
    },

    // ── Logout ────────────────────────────────
    logout: async function() {
        try {
            await signOut(auth);

            // Native: also clear Android account picker cache
            if (Platform.isNative) {
                try {
                    await window.Capacitor.Plugins.GoogleAuth.signOut();
                } catch(e) {
                    console.warn('[Auth] Native signOut failed (non-critical):', e);
                }
            }

            // Clear all local app data
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('ataraxie_')) keysToRemove.push(key);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));

            location.reload();
        } catch (err) {
            console.error('[Auth] Logout failed:', err);
        }
    },

    // ── Getters ───────────────────────────────
    getUser: function() {
        return currentUser;
    },

    // ── Sync & load ───────────────────────────
    syncAndLoadData: async function(user) {
        if (!user) return null;

        const dbRef    = ref(db);
        const snapshot = await get(child(dbRef, `users/${user.uid}`));

        let localDataDump = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('ataraxie_')) localDataDump[key] = localStorage.getItem(key);
        }

        if (!snapshot.exists()) {
            // First ever login: push local data to cloud
            await set(ref(db, 'users/' + user.uid), {
                metadata: { email: user.email, linkedAt: Date.now() },
                data: localDataDump
            });
            return localDataDump;
        }

        const cloudData = snapshot.val().data || {};

        if (Object.keys(localDataDump).length > 0 && this._hasDifferences(localDataDump, cloudData)) {
            let localCount = 0, cloudCount = 0;
            try { localCount = JSON.parse(localDataDump['ataraxie_profiles'] || '[]').length; } catch(e) {}
            try { cloudCount = JSON.parse(cloudData['ataraxie_profiles']    || '[]').length; } catch(e) {}

            const keepLocal = await showSyncModal(
                `Des données locales ont été détectées.\n\nLocal : ${localCount} profil(s)\nCloud : ${cloudCount} profil(s)\n\nConserver les données locales (et fusionner) ou télécharger depuis le cloud ?`,
                'Conserver (Cloud ↑)',
                'Télécharger (Cloud ↓)'
            );

            if (keepLocal) {
                const mergedData = this.mergeDataSets(cloudData, localDataDump);
                await update(ref(db, 'users/' + user.uid + '/data'), mergedData);
                for (const key in mergedData) {
                    if (key.startsWith('ataraxie_')) localStorage.setItem(key, mergedData[key]);
                }
                return mergedData;
            }
        }

        // Normal sync: wipe local, inject cloud
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('ataraxie_')) keysToRemove.push(key);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));

        for (const key in cloudData) {
            if (key.startsWith('ataraxie_')) localStorage.setItem(key, cloudData[key]);
        }
        return cloudData;
    },

    // Delta sync: only uploads the modified profile
    saveProgress: async function(profileSK, stateObject) {
        if (!profileSK?.startsWith('ataraxie_')) {
            console.warn('[Sync] saveProgress: invalid key', profileSK);
            return;
        }
        if (stateObject) {
            const json = JSON.stringify(stateObject);
            setSyncStatus('syncing');
            localStorage.setItem(profileSK, json);
            if (currentUser) {
                try {
                    await update(ref(db, 'users/' + currentUser.uid + '/data'), { [profileSK]: json });
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

    forceSync: async function() {
        if (!currentUser) return;
        try {
            setSyncStatus('syncing');
            const fullData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('ataraxie_')) fullData[key] = localStorage.getItem(key);
            }
            await update(ref(db, 'users/' + currentUser.uid + '/data'), fullData);
            setSyncStatus('synced');
        } catch(e) {
            console.error('[Sync] forceSync error:', e);
            setSyncStatus('error');
        }
    },

    pullNow: async function() {
        if (!currentUser) return;
        try {
            setSyncStatus('syncing');
            const snapshot = await get(child(ref(db), `users/${currentUser.uid}`));
            if (!snapshot.exists()) return;

            const cloudData = snapshot.val().data || {};
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('ataraxie_')) keysToRemove.push(key);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            for (const key in cloudData) {
                if (key.startsWith('ataraxie_')) localStorage.setItem(key, cloudData[key]);
            }
            setSyncStatus('synced');

            if (typeof window.refreshUI === 'function') window.refreshUI();
            else location.reload();
        } catch(e) {
            console.error('[Sync] pullNow error:', e);
            setSyncStatus('error');
        }
    },

    // ── Private helpers ───────────────────────
    _hasDifferences: function(a, b) {
        for (const k in a) { if (a[k] !== b[k]) return true; }
        for (const k in b) { if (b[k] !== a[k]) return true; }
        return false;
    },

    _handleOnlineSync: async function() {
        const localDataDump = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('ataraxie_')) localDataDump[key] = localStorage.getItem(key);
        }
        if (Object.keys(localDataDump).length === 0) return;

        try {
            const snapshot = await get(child(ref(db), `users/${currentUser.uid}`));
            if (!snapshot.exists()) return;

            const cloudData = snapshot.val().data || {};
            if (!this._hasDifferences(localDataDump, cloudData)) return;

            let localProfiles = 0, cloudProfiles = 0, localAnswers = 0;
            try { localProfiles = JSON.parse(localDataDump['ataraxie_profiles'] || '[]').length; } catch(e) {}
            try { cloudProfiles = JSON.parse(cloudData['ataraxie_profiles']    || '[]').length; } catch(e) {}
            for (const k in localDataDump) {
                if (k.startsWith('ataraxie_p_')) {
                    try {
                        const pd = JSON.parse(localDataDump[k]);
                        localAnswers += Object.keys(pd.qcm || {}).length + Object.keys(pd.red || {}).length;
                    } catch(e) {}
                }
            }

            const result = await showOfflineSyncModal(localProfiles, cloudProfiles, localAnswers);

            if (result.action === 'merge') {
                const mergedData = this.mergeDataSets(cloudData, localDataDump);
                await update(ref(db, 'users/' + currentUser.uid + '/data'), mergedData);
                for (const key in mergedData) {
                    if (key.startsWith('ataraxie_')) localStorage.setItem(key, mergedData[key]);
                }
                showSyncNotification('✔ Données fusionnées', 'success');
            } else if (result.action === 'discard') {
                await this.pullNow();
                showSyncNotification('✔ Données cloud restaurées', 'success');
            }

            if (typeof refreshUI === 'function') refreshUI();
        } catch(err) {
            console.error('[Sync] Online sync error:', err);
            showSyncNotification('Erreur de synchronisation', 'error');
        }
    }
};

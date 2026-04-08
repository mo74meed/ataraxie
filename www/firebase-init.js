import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app-check.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithCredential } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, update } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

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

// Use Realtime Database instead of Firestore to bypass daily 'Save Count' quotas
const db = getDatabase(app);

let currentUser = null;

function setSyncStatus(state) {
    const el = document.getElementById('auth-sync-status');
    if (!el) return;
    const map = {
      syncing: { text: '↻ Sync...', color: 'var(--a500)' },
      synced:  { text: '● Synced', color: 'var(--g500)' },
      error:   { text: '✖ Erreur', color: '#ef4444' },
      offline: { text: '○ Hors ligne', color: 'var(--t4)' }
    };
    if(map[state]) {
        el.textContent = map[state].text;
        el.style.color = map[state].color;
    }
}

window.addEventListener('offline', () => setSyncStatus('offline'));
window.addEventListener('online', () => setSyncStatus('syncing'));


function showSyncModal(message, okText = "OK", cancelText = "Annuler") {
    return new Promise((resolve) => {
        const overlay = document.getElementById('syncModalOverlay');
        const msgEl = document.getElementById('syncModalMessage');
        const btnCancel = document.getElementById('syncModalBtnCancel');
        const btnConfirm = document.getElementById('syncModalBtnConfirm');

        if (!overlay) {
            resolve(confirm(message));
            return;
        }

        msgEl.innerText = message;
        btnConfirm.innerText = okText;
        btnCancel.innerText = cancelText;

        overlay.style.display = 'flex';

        const cleanup = () => {
            overlay.style.display = 'none';
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
        };

        const onConfirm = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
    });
}

// ══════════ OFFLINE SYNC RESOLUTION MODAL ══════════
function showOfflineSyncModal(localProfiles, cloudProfiles, localAnswers) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('offlineSyncOverlay');
        if (!overlay) {
            // Fallback to basic sync modal if new UI not available
            showSyncModal(
                `Données hors ligne détectées.\n${localProfiles} profil(s) local, ${cloudProfiles} profil(s) cloud.\n\nFusionner avec le cloud ?`,
                'Fusionner', 'Supprimer'
            ).then(keep => resolve({ action: keep ? 'merge' : 'discard' }));
            return;
        }

        // Populate summary
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

        // Populate profile selector
        const profileSelect = document.getElementById('offlineSyncProfileSelect');
        const profileSection = document.getElementById('offlineSyncProfileSection');
        const newProfileWrap = document.getElementById('offlineSyncNewProfileWrap');

        let profilesHtml = '';
        try {
            const profilesList = JSON.parse(localStorage.getItem('ataraxie_profiles') || '[]');
            const activeId = localStorage.getItem('ataraxie_active_profile');
            profilesHtml = profilesList.map(p =>
                `<option value="${p.id}"${p.id === activeId ? ' selected' : ''}>${p.name}</option>`
            ).join('');
        } catch(e) {}
        profilesHtml += '<option value="__new__">+ Créer un nouveau profil</option>';
        profileSelect.innerHTML = profilesHtml;

        profileSelect.addEventListener('change', function handler() {
            newProfileWrap.style.display = profileSelect.value === '__new__' ? '' : 'none';
        });
        newProfileWrap.style.display = 'none';

        // Action card toggle
        let selectedAction = 'merge';
        const mergeCard = document.getElementById('offlineSyncMerge');
        const discardCard = document.getElementById('offlineSyncDiscard');

        function setAction(action) {
            selectedAction = action;
            mergeCard.classList.toggle('active', action === 'merge');
            discardCard.classList.toggle('active', action === 'discard');
            // Hide profile section for discard
            profileSection.style.display = action === 'merge' ? '' : 'none';
        }

        mergeCard.onclick = () => setAction('merge');
        discardCard.onclick = () => setAction('discard');
        setAction('merge');

        // Show modal
        overlay.style.display = 'flex';

        const cleanup = () => {
            overlay.style.display = 'none';
            profileSelect.removeEventListener('change', profileSelect._handler);
        };

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

// ══════════ SYNC NOTIFICATION (non-blocking toast) ══════════
function showSyncNotification(message, type) {
    const syncStatus = document.getElementById('auth-sync-status');
    if (syncStatus) {
        const prevContent = syncStatus.textContent;
        syncStatus.style.color = type === 'error' ? '#ef4444' : 'var(--b500)';
        syncStatus.textContent = message;
        setTimeout(() => {
            syncStatus.textContent = prevContent;
            syncStatus.style.color = '';
        }, 3000);
    }
}

window.FirebaseAuthManager = {
    mergeDataSets: function(cloudData, localData) {
        const merged = { ...cloudData };
        for (const key in localData) {
            if (key === 'ataraxie_profiles') {
                try {
                    let cP = cloudData[key] ? JSON.parse(cloudData[key]) : [];
                    let lP = localData[key] ? JSON.parse(localData[key]) : [];
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
                    const local = localData[key] ? JSON.parse(localData[key]) : null;
                    if (!cloud) { merged[key] = localData[key]; continue; }
                    if (!local) continue;
                    
                    const result = { ...cloud };
                    for (const subKey of ['qcm', 'red', 'val', 'his', 'recent']) {
                        if (local[subKey]) {
                            result[subKey] = result[subKey] || (Array.isArray(local[subKey]) ? [] : {});
                            if (Array.isArray(local[subKey])) {
                                // For things like 'recent' arrays
                                result[subKey] = [...local[subKey], ...result[subKey]];
                                // deduplicate by key if it's the recent array
                                if (subKey === 'recent') {
                                    const seen = new Set();
                                    result[subKey] = result[subKey].filter(r => {
                                        const duplicate = seen.has(r.key);
                                        seen.add(r.key);
                                        return !duplicate;
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

        // Clean up orphaned ataraxie_p_* keys not referenced in ataraxie_profiles registry
        try {
            const registeredIds = new Set(
                JSON.parse(merged['ataraxie_profiles'] || '[]').map(p => p.id)
            );
            for (const key in merged) {
                if (key.startsWith('ataraxie_p_')) {
                    const profileId = key.replace('ataraxie_p_', '');
                    if (!registeredIds.has(profileId)) {
                        console.log('mergeDataSets: pruning orphaned profile data:', key);
                        delete merged[key];
                    }
                }
            }
        } catch(e) { console.warn('mergeDataSets: orphan cleanup skipped', e); }

        return merged;
    },

    init: function(onUserLoadCallback) {
        // Essential for mobile: catch the returning user after a redirect!
        // MUST complete before setting up onAuthStateChanged to avoid race condition
        getRedirectResult(auth).then((redirectResult) => {
            if (redirectResult && redirectResult.user) {
                console.log("✓ User signed in via redirect:", redirectResult.user.email);
                // Force UI update after redirect completes
                setTimeout(() => {
                    if (!currentUser) {
                        console.log("⚠ Auth state listener hasn't fired yet, forcing refresh...");
                        window.location.reload();
                    }
                }, 1500);
            }
        }).catch((error) => {
            console.error("✗ Redirect login error:", error);
        });

        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user) {
                console.log("✓ Auth state changed - User signed in:", user.email);
                try {
                    console.log("→ Syncing and loading data for:", user.uid);
                    const cloudData = await this.syncAndLoadData(user);
                    console.log("✓ Data synced successfully");
                    
                    onUserLoadCallback(cloudData, user);
                } catch (err) {
                    console.error("✗ Failed to sync and load data:", err);
                    // Fallback to null cloudData but still authenticate the user
                    
                    
                    onUserLoadCallback(null, user);
                }
            } else {
                console.log("ℹ No user signed in.");
                
                
                onUserLoadCallback(null, null);
            }
        });

        // Listen for when device comes back online
        window.addEventListener('online', async () => {
            if (!currentUser) return;
            console.log("Network returned online. Checking for offline data...");

            let localDataDump = {};
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (key && key.startsWith('ataraxie_')) {
                    localDataDump[key] = localStorage.getItem(key);
                }
            }

            if (Object.keys(localDataDump).length === 0) return;

            try {
                const dbRef = ref(db);
                const snapshot = await get(child(dbRef, `users/${currentUser.uid}`));
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

                // Count REAL profiles from the registry, not orphaned ataraxie_p_* keys
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

                // Show the new offline sync resolution modal
                const result = await showOfflineSyncModal(localProfiles, cloudProfiles, localAnswers);

                if (result.action === 'merge') {
                    const mergedData = window.FirebaseAuthManager.mergeDataSets(cloudData, localDataDump);
                    await update(ref(db, 'users/' + currentUser.uid + '/data'), mergedData);
                    for (let key in mergedData) {
                        if (key.startsWith('ataraxie_')) {
                            localStorage.setItem(key, mergedData[key]);
                        }
                    }
                    showSyncNotification('✔ Données fusionnées', 'success');
                } else if (result.action === 'discard') {
                    window.FirebaseAuthManager.pullNow();
                    showSyncNotification('✔ Données cloud restaurées', 'success');
                }

                if (typeof refreshUI === 'function') refreshUI();

            } catch(err) {
                console.error("Online sync error:", err);
                showSyncNotification('Erreur de synchronisation', 'error');
            }
        });
    },
    
    login: async function() {
        // Check if running directly inside the compiled Android/iOS Capacitor app
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            try {
                console.log("→ Using native Capacitor GoogleAuth plugin");
                // Initialize plugin just in case
                window.Capacitor.Plugins.GoogleAuth.initialize();
                
                // 1. Native Bottom-Sheet Google Prompt
                const googleUser = await window.Capacitor.Plugins.GoogleAuth.signIn();
                console.log("✓ Native sign-in successful:", googleUser.email);
                
                // 2. Pass Android token to Firebase
                const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
                await signInWithCredential(auth, credential);
                console.log("✓ Firebase credential signed in");
                return; // Stop here if native worked
            } catch (error) {
                console.error("✗ Native Capacitor Auth Error:", error);
                alert("Erreur de connexion native: " + JSON.stringify(error));
                return; // DO NOT FALLBACK. The web fallback breaks Capacitor because Capacitor doesn't handle redirects well.
            }
        }

        // --- Standard Web / GitHub Pages Flow Below ---
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' }); // Prevent infinite loops
        
        // Use regex strictly for mobile browser detection (like Chrome on phone)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        try {
            if (isMobile) {
                console.log("→ Mobile browser detected - using redirect flow");
                console.log("   Redirecting to Google OAuth...");
                await signInWithRedirect(auth, provider);
                console.log("   (Awaiting Google redirect...)");
            } else {
                console.log("→ Desktop browser - using popup flow");
                await signInWithPopup(auth, provider);
                console.log("✓ Popup sign-in successful");
            }
        } catch (error) {
            console.error("✗ Login failed or popup blocked:", error.code, error.message);
            console.log("→ Falling back to redirect...");
            await signInWithRedirect(auth, provider);
        }
    },
    
    logout: async function() {
        try {
            await signOut(auth);
            
            // If native, also sign out from the Android Google Account UI picker cache
            if (window.Capacitor && window.Capacitor.isNativePlatform()) {
                await window.Capacitor.Plugins.GoogleAuth.signOut();
            }

            // Clear all local data so the next session/offline mode is clean
            let keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (key && key.startsWith('ataraxie_')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
            
            location.reload();
        } catch (error) {
            console.error("Logout failed", error);
        }
    },

    getUser: function() {
        return currentUser;
    },
    
    syncAndLoadData: async function(user) {
        if (!user) return null;
        
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, `users/${user.uid}`));

        // 1. Gather any existing local data (useful if they are logging in for the VERY FIRST TIME)
        let localDataDump = {};
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key && key.startsWith('ataraxie_')) {
                localDataDump[key] = localStorage.getItem(key);
            }
        }

        if (!snapshot.exists()) {
            // First login: upload all local profiles and data up to the cloud
            const payload = {
                metadata: { email: user.email, linkedAt: Date.now() },
                data: localDataDump
            };
            await set(ref(db, 'users/' + user.uid), payload);
            return localDataDump; 
        } else {
            // Existing cloud account: download and inject everything into localStorage
            const docData = snapshot.val();
            const cloudData = docData.data || {};

            // Check if there are local offline differences
            let hasDifferences = false;
            if (Object.keys(localDataDump).length > 0) {
                for (let k in localDataDump) {
                    if (localDataDump[k] !== cloudData[k]) { hasDifferences = true; break; }
                }
                for (let k in cloudData) {
                    if (cloudData[k] !== localDataDump[k]) { hasDifferences = true; break; }
                }
            }

            if (hasDifferences) {
                
                // Count REAL profiles from the registry, not orphaned ataraxie_p_* keys
                let localCount = 0, cloudCount = 0;
                try { localCount = JSON.parse(localDataDump['ataraxie_profiles'] || '[]').length; } catch(e) {}
                try { cloudCount = JSON.parse(cloudData['ataraxie_profiles'] || '[]').length; } catch(e) {}
                
                const keepLocal = await showSyncModal(
                    `Des données sauvegardées localement ont été détectées.\n\nLocale : ${localCount} profil(s)\nCloud : ${cloudCount} profil(s)\n\nVoulez-vous synchroniser ces données avec le Cloud (les conserver) ou télécharger les dernières données en ligne (et écraser les données locales) ?`, 
                    "Conserver (Cloud ↑)", 
                    "Télécharger (Cloud ↓)"
                );
                if (keepLocal) {
                    // Update Cloud with securely merged Data
                    const mergedData = this.mergeDataSets(cloudData, localDataDump);
                    await update(ref(db, 'users/' + user.uid + '/data'), mergedData);
                    
                    // Inject back to localStorage cleanly
                    for (let key in mergedData) {
                        if (key.startsWith('ataraxie_')) {
                            localStorage.setItem(key, mergedData[key]);
                        }
                    }
                    return mergedData; 
                }
            }

            // Normal sync: Overwrite local with whatever cloud has.
            // First, delete current local state to prevent mixing old ghost profiles with clean cloud state
            let keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (key && key.startsWith('ataraxie_')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));

            // Inject the new pure cloud state
            for (let key in cloudData) {
                if (key.startsWith('ataraxie_')) {
                    localStorage.setItem(key, cloudData[key]);
                }
            }
            return cloudData;
        }
    },
    
    // Optimized Delta Sync: Only uploads the exact profile that was modified, not the whole database!
    saveProgress: async function(profileSK, stateObject) {
        if (!profileSK || typeof profileSK !== 'string' || !profileSK.startsWith('ataraxie_')) {
            console.warn('saveProgress: invalid profileSK', profileSK);
            return;
        }
        
        if (stateObject) {
            const jsonState = JSON.stringify(stateObject);
            setSyncStatus('syncing');
            localStorage.setItem(profileSK, jsonState);
            
            if (currentUser) {
                try {
                    // Instantly patch ONLY this specific profile in the cloud database
                    const updates = {};
                    updates[profileSK] = jsonState;
                    await update(ref(db, 'users/' + currentUser.uid + '/data'), updates);
                    setSyncStatus('synced');
                } catch(e) { 
                    console.error("Firebase Fast-Sync Error", e); 
                    setSyncStatus('error'); 
                }
            }
        } else {
            await this.forceSync();
        }
    },

    // Completely synchronizes everything to the cloud immediately in one bundle
    forceSync: async function() {
        if (currentUser) {
            try {
                setSyncStatus('syncing');
                let fullData = {};
                for (let i = 0; i < localStorage.length; i++) {
                    let key = localStorage.key(i);
                    if (key && key.startsWith('ataraxie_')) {
                        fullData[key] = localStorage.getItem(key);
                    }
                }
                
                // Only update the 'data' node of the specific user without overwriting metadata (Fix F2)
                await update(ref(db, 'users/' + currentUser.uid + '/data'), fullData);
                setSyncStatus('synced');
            } catch(e) { console.error("Firebase Sync Error", e); setSyncStatus('error'); }
        }
    },

    // Forces a manual pull from the cloud to overwrite local data and refresh UI
    pullNow: async function() {
        if (!currentUser) return;
        try {
            const syncStatusIcon = document.getElementById('auth-sync-status');
            if (syncStatusIcon) {
                syncStatusIcon.style.color = "var(--b500)";
                syncStatusIcon.textContent = "↻ Syncing...";
            }
            
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, `users/${currentUser.uid}`));
            if (snapshot.exists()) {
                const docData = snapshot.val();
                const cloudData = docData.data || {};
                
                let keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    let key = localStorage.key(i);
                    if (key && key.startsWith('ataraxie_')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));

                for (let key in cloudData) {
                    if (key.startsWith('ataraxie_')) {
                        localStorage.setItem(key, cloudData[key]);
                    }
                }
                
                // If Capacitor App, we can't easily trigger the index.html closures nicely, so a reload is the safest and cleanest way to reset the DOM tree
                if (typeof window.refreshUI === 'function') {
                    window.refreshUI();
                } else {
                    location.reload();
                }
            }
        } catch(e) {
            console.error("Firebase Pull Error", e);
            const syncStatusIcon = document.getElementById('auth-sync-status');
            if (syncStatusIcon) {
                syncStatusIcon.style.color = "#ef4444";
                syncStatusIcon.textContent = "✖ Failed";
            }
        }
    }
};









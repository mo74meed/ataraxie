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
  // Crucial for RTDB: You MUST specify the databaseURL if it doesn't auto-detect
  databaseURL: "https://e-taraxie-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Use Realtime Database instead of Firestore to bypass daily 'Save Count' quotas
const db = getDatabase(app);

let currentUser = null;

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

window.FirebaseAuthManager = {
    init: function(onUserLoadCallback) {
        // Essential for mobile: catch the returning user after a redirect!
        // We do not await it here so it doesn't block onAuthStateChanged loading.
        getRedirectResult(auth).then((redirectResult) => {
            if (redirectResult && redirectResult.user) {
                console.log("User signed in via redirect:", redirectResult.user.email);
            }
        }).catch((error) => {
            console.error("Redirect login error:", error);
        });

        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user) {
                console.log("User signed in:", user.email);
                try {
                    const cloudData = await this.syncAndLoadData(user);
                    onUserLoadCallback(cloudData, user);
                } catch (err) {
                    console.error("Failed to sync and load data:", err);
                    // Fallback to null cloudData but still authenticate the user
                    onUserLoadCallback(null, user);
                }
            } else {
                console.log("No user signed in.");
                onUserLoadCallback(null, null);
            }
        });

        // Listen for when device comes back online
        window.addEventListener('online', async () => {
            if (currentUser) {
                console.log("Network returned online. Checking for offline data...");
                let localDataDump = {};
                for (let i = 0; i < localStorage.length; i++) {
                    let key = localStorage.key(i);
                    if (key && key.startsWith('ataraxie_')) {
                        localDataDump[key] = localStorage.getItem(key);
                    }
                }

                if (Object.keys(localDataDump).length > 0) {
                    const dbRef = ref(db);
                    const snapshot = await get(child(dbRef, `users/${currentUser.uid}`));
                    if (snapshot.exists()) {
                        const cloudData = snapshot.val().data || {};
                        let hasDifferences = false;
                        for (let k in localDataDump) {
                            if (localDataDump[k] !== cloudData[k]) { hasDifferences = true; break; }
                        }
                        for (let k in cloudData) {
                            if (cloudData[k] !== localDataDump[k]) { hasDifferences = true; break; }
                        }

                        if (hasDifferences) {
                            const keepLocal = await showSyncModal(
                                "Vous êtes de nouveau en ligne ! Des changements hors ligne ont été détectés.\n\nVoulez-vous sauvegarder ces modifications sur le cloud, ou les supprimer pour éviter tout conflit avec vos autres appareils ?", 
                                "Sauvegarder", 
                                "Supprimer"
                            );
                            if (keepLocal) {
                                // Push offline data to cloud
                                await update(ref(db, 'users/' + currentUser.uid + '/data'), localDataDump);
                                // Non blocking notification instead of alert:
                                const syncStatusIcon = document.getElementById('auth-sync-status');
                                if(syncStatusIcon) {
                                  let prevSyncContent = syncStatusIcon.textContent;
                                  syncStatusIcon.style.color = "var(--p500)";
                                  syncStatusIcon.textContent = "✔ Sauvegardé";
                                  setTimeout(() => { syncStatusIcon.textContent = prevSyncContent; }, 3000);
                                }
                            } else {
                                // Re-pull from cloud
                                window.FirebaseAuthManager.pullNow();
                            }
                        }
                    }
                }
            }
        });
    },
    
    login: async function() {
        // Check if running directly inside the compiled Android/iOS Capacitor app
        if (window.Capacitor && window.Capacitor.isNativePlatform()) {
            try {
                // Initialize plugin just in case
                window.Capacitor.Plugins.GoogleAuth.initialize();
                
                // 1. Native Bottom-Sheet Google Prompt
                const googleUser = await window.Capacitor.Plugins.GoogleAuth.signIn();
                
                // 2. Pass Android token to Firebase
                const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
                await signInWithCredential(auth, credential);
                return; // Stop here if native worked
            } catch (error) {
                console.error("Native Capacitor Auth Error:", error);
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
                await signInWithRedirect(auth, provider);
            } else {
                await signInWithPopup(auth, provider);
            }
        } catch (error) {
            console.error("Login failed or popup blocked. Falling back to redirect:", error);
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
                const keepLocal = await showSyncModal(
                    "Des données sauvegardées localement ont été détectées sur cet appareil.\n\nVoulez-vous synchroniser ces données avec le Cloud (les conserver) ou télécharger les dernières données en ligne (et écraser les données locales) ?", 
                    "Conserver (Cloud ↑)", 
                    "Jeter et Télécharger (Cloud ↓)"
                );
                if (keepLocal) {
                    // Update Cloud with Local Data
                    await update(ref(db, 'users/' + user.uid + '/data'), localDataDump);
                    return localDataDump; // Keep local data and skip cloud overwrite
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
        if (profileSK && stateObject) {
            const jsonState = JSON.stringify(stateObject);
            localStorage.setItem(profileSK, jsonState);
            
            if (currentUser) {
                try {
                    // Instantly patch ONLY this specific profile in the cloud database
                    const updates = {};
                    updates[profileSK] = jsonState;
                    await update(ref(db, 'users/' + currentUser.uid + '/data'), updates);
                } catch(e) { 
                    console.error("Firebase Fast-Sync Error", e); 
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
                let fullData = {};
                for (let i = 0; i < localStorage.length; i++) {
                    let key = localStorage.key(i);
                    if (key && key.startsWith('ataraxie_')) {
                        fullData[key] = localStorage.getItem(key);
                    }
                }
                
                // Only update the 'data' node of the specific user without overwriting metadata
                await set(ref(db, 'users/' + currentUser.uid + '/data'), fullData);
            } catch(e) { console.error("Firebase Sync Error", e); }
        }
    },

    // Forces a manual pull from the cloud to overwrite local data and refresh UI
    pullNow: async function() {
        if (!currentUser) return;
        try {
            const syncStatusIcon = document.getElementById('auth-sync-status');
            if (syncStatusIcon) {
                syncStatusIcon.style.color = "var(--p500)";
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
                location.reload();
            }
        } catch(e) {
            console.error("Firebase Pull Error", e);
            const syncStatusIcon = document.getElementById('auth-sync-status');
            if (syncStatusIcon) {
                syncStatusIcon.style.color = "var(--red)";
                syncStatusIcon.textContent = "✖ Failed";
            }
        }
    }
};
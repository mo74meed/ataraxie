import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app-check.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithCredential } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
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
const db = getDatabase(app);
let currentUser = null;

// ═══════════════════════════════════════════════════════════════════
// FIREBASE AUTH MANAGER - Redux Edition (GitHub Pages Compatible)
// ═══════════════════════════════════════════════════════════════════

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

function showSyncNotification(message, type) {
    const syncStatus = document.getElementById('auth-sync-status');
    if (!syncStatus) return;
    
    const originalText = syncStatus.textContent;
    const originalColor = syncStatus.style.color;
    
    syncStatus.textContent = message;
    syncStatus.style.color = type === 'error' ? '#ef4444' : type === 'success' ? 'var(--g500)' : 'var(--a500)';
    
    setTimeout(() => {
        syncStatus.textContent = originalText;
        syncStatus.style.color = originalColor;
    }, 3000);
}

window.FirebaseAuthManager = {
    
    // ─ GET CURRENT USER ─
    getUser: function() {
        return currentUser;
    },
    
    // ─ INITIALIZATION ─
    init: function(onUserLoadCallback) {
        console.log("🔧 FB Auth: Init starting...");
        console.log("📍 URL:", window.location.href);
        
        // STEP 1: Check if returning from Google redirect
        console.log("→ Checking for redirect result...");
        getRedirectResult(auth)
            .then(result => {
                if (result?.user) {
                    console.log("✅ REDIRECT SUCCESS - User:", result.user.email);
                } else {
                    console.log("ℹ️ No redirect (first load)");
                }
            })
            .catch(err => {
                console.error("❌ Redirect check error:", err.code, err.message);
            });
        
        // STEP 2: Listen for auth changes
        console.log("→ Setting up auth listener...");
        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            
            if (user) {
                console.log("✅ LOGGED IN:", user.email);
                setSyncStatus('syncing');
                
                try {
                    const cloudData = await this.syncAndLoadData(user);
                    setSyncStatus('synced');
                    onUserLoadCallback(cloudData, user);
                } catch (err) {
                    console.error("❌ Sync failed:", err);
                    setSyncStatus('error');
                    onUserLoadCallback(null, user);
                }
            } else {
                console.log("ℹ️ LOGGED OUT");
                setSyncStatus('offline');
                onUserLoadCallback(null, null);
            }
        });
    },
    
    // ─ LOGIN ─
    login: async function() {
        console.log("🔐 LOGIN clicked");
        
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        
        try {
            console.log("🌐 Redirecting to Google...");
            console.log("   Redirect URL will be:", window.location.origin + window.location.pathname);
            await signInWithRedirect(auth, provider);
            // Browser will redirect - code stops here
        } catch (error) {
            console.error("❌ Login error:", error.code, error.message);
            alert("Login failed: " + error.message);
        }
    },
    
    // ─ LOGOUT ─
    logout: async function() {
        console.log("🚪 LOGOUT clicked");
        try {
            await signOut(auth);
            console.log("✅ Logged out");
        } catch (error) {
            console.error("❌ Logout error:", error);
            alert("Logout failed: " + error.message);
        }
    },
    
    // ─ SYNC & LOAD DATA ─
    syncAndLoadData: async function(user) {
        console.log("→ Syncing data...");
        try {
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, `users/${user.uid}`));
            
            if (!snapshot.exists()) {
                console.log("ℹ️ First time user - no cloud data");
                return null;
            }
            
            const cloudData = snapshot.val().data || {};
            console.log("✓ Cloud data loaded");
            return cloudData;
        } catch (err) {
            console.error("Sync error:", err);
            throw err;
        }
    },
    
    // ─ SAVE PROGRESS ─
    saveProgress: async function(profileSK, stateObject) {
        if (!currentUser) {
            console.warn('Save: Not logged in');
            return;
        }
        
        try {
            const userPath = `users/${currentUser.uid}/data/${profileSK}`;
            await set(ref(db, userPath), JSON.stringify(stateObject));
            setSyncStatus('synced');
        } catch (err) {
            console.error('Save error:', err);
            setSyncStatus('error');
        }
    },
    
    // ─ FORCE SYNC ─
    forceSync: async function() {
        if (!currentUser) return;
        console.log("Forcing sync...");
        setSyncStatus('syncing');
        
        try {
            const cloudData = await this.syncAndLoadData(currentUser);
            setSyncStatus('synced');
            // Optionally reload UI here
        } catch (err) {
            console.error('Force sync error:', err);
            setSyncStatus('error');
        }
    },
    
    // ─ HELPER: MERGE DATA ─
    mergeDataSets: function(cloudData, localData) {
        const merged = { ...cloudData };
        for (const key in localData) {
            merged[key] = localData[key];
        }
        return merged;
    },
    
    // ─ HELPER: PULL NOW ─
    pullNow: async function() {
        if (!currentUser) return;
        await this.forceSync();
    }
};

// ═══════════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════════

function setSyncStatus(state) {
    const el = document.getElementById('auth-sync-status');
    if (!el) return;
    const map = {
      syncing: { text: '↻ Sync...', color: 'var(--a500)' },
      synced:  { text: '● Synced', color: 'var(--g500)' },
      error:   { text: '✖ Error', color: '#ef4444' },
      offline: { text: '○ Offline', color: 'var(--t4)' }
    };
    if(map[state]) {
        el.textContent = map[state].text;
        el.style.color = map[state].color;
    }
}

window.addEventListener('offline', () => setSyncStatus('offline'));
window.addEventListener('online', () => setSyncStatus('syncing'));

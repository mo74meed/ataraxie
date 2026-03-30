import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";

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
    },
    
    login: async function() {
        const provider = new GoogleAuthProvider();
        try {
            // Mobile browsers automatically block popups. We use Redirect for mobile, Popup for desktop.
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if (isMobile) {
                await signInWithRedirect(auth, provider);
            } else {
                await signInWithPopup(auth, provider);
            }
        } catch (error) {
            console.error("Login failed", error);
            // If popup is somehow mapped or blocked on desktop, fallback to redirect
            if (error.code === 'auth/popup-blocked') {
                await signInWithRedirect(auth, provider);
            }
        }
    },
    
    logout: async function() {
        try {
            await signOut(auth);
            
            // Restore offline backup if it exists
            const offlineBackupStr = localStorage.getItem('ataraxie_offline_backup');
            if (offlineBackupStr) {
                const offlineBackup = JSON.parse(offlineBackupStr);
                
                // Clear all current online data first
                let keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    let key = localStorage.key(i);
                    if (key && key.startsWith('ataraxie_')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
                
                // Re-inject the pristine offline data
                for (let key in offlineBackup) {
                    localStorage.setItem(key, offlineBackup[key]);
                }
            } else {
                // If they never had offline data, just clear the cloud data so next user starts fresh
                let keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    let key = localStorage.key(i);
                    if (key && key.startsWith('ataraxie_') && key !== 'ataraxie_offline_backup') {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
            }
            
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

        // 1. MAKE AN OFFLINE BACKUP BEFORE WE DO ANYTHING
        let localDataDump = {};
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key && key.startsWith('ataraxie_') && key !== 'ataraxie_offline_backup') {
                localDataDump[key] = localStorage.getItem(key);
            }
        }
        // Only save backup if there's actually something to save, and we haven't already backed it up
        if (Object.keys(localDataDump).length > 0 && !localStorage.getItem('ataraxie_offline_backup')) {
            localStorage.setItem('ataraxie_offline_backup', JSON.stringify(localDataDump));
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

            // Normal sync: Overwrite local with whatever cloud has.
            // First, delete current local state to prevent mixing old ghost profiles with clean cloud state
            let keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (key && key.startsWith('ataraxie_') && key !== 'ataraxie_offline_backup') {
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
    
    // Legacy mapping + generic save that grabs the whole local picture
    saveProgress: async function(profileSK, stateObject) {
        if (profileSK && stateObject) {
            localStorage.setItem(profileSK, JSON.stringify(stateObject));
        }
        this.forceSync();
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
    }
};
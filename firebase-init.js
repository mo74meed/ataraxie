import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
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
        provider.setCustomParameters({ prompt: 'select_account' }); // Prevent infinite loops
        
        // Use regex strictly for mobile detection to avoid desktop popups firing and failing late
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        try {
            if (isMobile) {
                // Instantly redirect on mobile devices without attempting a popup
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
    }
};
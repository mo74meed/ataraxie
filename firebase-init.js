import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore-lite.js";

const firebaseConfig = {
  apiKey: "AIzaSyBbPwpQsTdrfPi6WvfhFVhmhpeYzp5Wn0g",
  authDomain: "e-taraxie.firebaseapp.com",
  projectId: "e-taraxie",
  storageBucket: "e-taraxie.firebasestorage.app",
  messagingSenderId: "490683199342",
  appId: "1:490683199342:web:b3c6df504994c01d4cdb7f",
  measurementId: "G-NWJ26Y115H"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Use the Firestore Lite SDK which utilizes only standard REST fetches (no WebChannels or WebSockets).
// This guarantees zero issues with AdBlockers that block long-polling or streams.
const db = getFirestore(app);

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
        const userRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(userRef);

        if (!docSnap.exists()) {
            // First login: upload all local profiles and data up to the cloud
            let fullData = {};
            for (let i = 0; i < localStorage.length; i++) {
                let key = localStorage.key(i);
                if (key && key.startsWith('ataraxie_')) {
                    fullData[key] = localStorage.getItem(key);
                }
            }
            const payload = {
                metadata: { email: user.email, linkedAt: Date.now() },
                data: fullData
            };
            await setDoc(userRef, payload);
            return fullData; 
        } else {
            // Existing cloud account: download and inject everything into localStorage
            const docData = docSnap.data();
            const cloudData = docData.data || {};

            // Failsafe migration for old accounts that only had "state" but no "data"
            if (Object.keys(cloudData).length === 0 && docData.state) {
                let fullData = {};
                for (let i = 0; i < localStorage.length; i++) {
                    let key = localStorage.key(i);
                    if (key && key.startsWith('ataraxie_')) {
                        fullData[key] = localStorage.getItem(key);
                    }
                }
                await setDoc(userRef, { data: fullData }, { merge: true });
                return fullData;
            }
            
            // Normal sync: Overwrite local with whatever cloud has.
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
                const userRef = doc(db, "users", currentUser.uid);
                await setDoc(userRef, { data: fullData }, { merge: true });
            } catch(e) { console.error("Firebase Sync Error", e); }
        }
    }
};
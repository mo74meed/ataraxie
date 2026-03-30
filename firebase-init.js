import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
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
        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user) {
                console.log("User signed in:", user.email);
                const cloudData = await this.syncAndLoadData(user);
                onUserLoadCallback(cloudData, user);
            } else {
                console.log("No user signed in.");
                onUserLoadCallback(null, null);
            }
        });
    },
    
    login: async function() {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Login failed", error);
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

        const APK = 'ataraxie_active_profile';
        const activeId = localStorage.getItem(APK);
        let activeProfileSK = activeId ? 'ataraxie_p_' + activeId : null;

        if (!docSnap.exists()) {
            let stateToSync = {};
            if (activeProfileSK) {
                const localData = localStorage.getItem(activeProfileSK);
                if (localData) stateToSync = JSON.parse(localData);
            }
            const payload = {
                metadata: { email: user.email, linkedAt: Date.now() },
                state: stateToSync
            };
            await setDoc(userRef, payload);
            return stateToSync; 
        } else {
            const docData = docSnap.data();
            const cloudData = docData.state || {};
            if (activeProfileSK) {
                localStorage.setItem(activeProfileSK, JSON.stringify(cloudData));
            }
            return cloudData;
        }
    },
    
    saveProgress: async function(profileSK, stateObject) {
        localStorage.setItem(profileSK, JSON.stringify(stateObject));
        
        if (currentUser) {
            try {
                const userRef = doc(db, "users", currentUser.uid);
                await setDoc(userRef, { state: stateObject }, { merge: true });
            } catch(e) { console.error("Firebase Save Error", e); }
        }
    }
};
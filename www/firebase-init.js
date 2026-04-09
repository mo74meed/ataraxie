// ╔══════════════════════════════════════════════════════════════╗
// ║               firebase-init.js  —  e-taraxie                ║
// ║  Auth + Realtime DB sync. Works on:                         ║
// ║    • Desktop browsers (Chrome, Firefox, Safari, Edge)       ║
// ║    • Android Chrome / mobile browsers  → redirect flow      ║
// ║    • Android APK via Capacitor         → native plugin      ║
// ╚══════════════════════════════════════════════════════════════╝

import { initializeAppCheck, ReCaptchaV3Provider }
    from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app-check.js";
import { initializeApp }
    from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signInWithCredential,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, update }
    from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";


// ─── Firebase bootstrap ───────────────────────────────────────────────────────

const app = initializeApp({
    apiKey:            "AIzaSyBbPwpQsTdrfPi6WvfhFVhmhpeYzp5Wn0g",
    authDomain:        "e-taraxie.firebaseapp.com",
    projectId:         "e-taraxie",
    storageBucket:     "e-taraxie.firebasestorage.app",
    messagingSenderId: "490683199342",
    appId:             "1:490683199342:web:b3c6df504994c01d4cdb7f",
    measurementId:     "G-NWJ26Y115H",
    databaseURL:       "https://e-taraxie-default-rtdb.firebaseio.com"
});

initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider("6LcJDKAsAAAAABrgFjTSx5rhWXnYLbTxRa1Et7Cg"),
    isTokenAutoRefreshEnabled: true
});

const auth = getAuth(app);
const db   = getDatabase(app);  // Realtime DB — avoids Firestore daily write quotas


// ─── Runtime state ────────────────────────────────────────────────────────────

let _user = null;


// ─── Environment detection ────────────────────────────────────────────────────
// Evaluated once at load time so login() never has to guess.

const Env = Object.freeze({
    // Inside a compiled Capacitor APK / IPA
    native: typeof window.Capacitor !== "undefined" && window.Capacitor.isNativePlatform() === true,

    // Mobile browser on Android (not inside an APK).
    // Chrome on Android silently blocks cross-origin popups — redirect is mandatory.
    androidBrowser: (
        typeof window.Capacitor === "undefined" || !window.Capacitor.isNativePlatform()
    ) && /Android/i.test(navigator.userAgent),
});
// Anything else (desktop, iOS browser) → popup with redirect fallback.


// ─── localStorage helpers ─────────────────────────────────────────────────────

function localDump() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("ataraxie_")) out[k] = localStorage.getItem(k);
    }
    return out;
}

function localClear() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("ataraxie_")) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
}

function localWrite(data) {
    for (const k in data) {
        if (k.startsWith("ataraxie_")) localStorage.setItem(k, data[k]);
    }
}

function dataDiffer(a, b) {
    for (const k in a) { if (a[k] !== b[k]) return true; }
    for (const k in b) { if (b[k] !== a[k]) return true; }
    return false;
}


// ─── UI: sync status badge ────────────────────────────────────────────────────

function setSyncStatus(state) {
    const el = document.getElementById("auth-sync-status");
    if (!el) return;
    const states = {
        syncing: { text: "↻ Sync...",    color: "var(--a500)" },
        synced:  { text: "● Synced",     color: "var(--g500)" },
        error:   { text: "✖ Erreur",     color: "#ef4444"     },
        offline: { text: "○ Hors ligne", color: "var(--t4)"   },
    };
    if (states[state]) {
        el.textContent = states[state].text;
        el.style.color  = states[state].color;
    }
}

window.addEventListener("offline", () => setSyncStatus("offline"));
window.addEventListener("online",  () => setSyncStatus("syncing"));


// ─── UI: generic two-button modal ────────────────────────────────────────────

function showModal(message, okLabel = "OK", cancelLabel = "Annuler") {
    return new Promise(resolve => {
        const overlay = document.getElementById("syncModalOverlay");
        if (!overlay) { resolve(confirm(message)); return; }

        document.getElementById("syncModalMessage").innerText    = message;
        document.getElementById("syncModalBtnConfirm").innerText = okLabel;
        document.getElementById("syncModalBtnCancel").innerText  = cancelLabel;
        overlay.style.display = "flex";

        const btnOk = document.getElementById("syncModalBtnConfirm");
        const btnNo = document.getElementById("syncModalBtnCancel");

        function done(value) {
            overlay.style.display = "none";
            btnOk.removeEventListener("click", yes);
            btnNo.removeEventListener("click", no);
            resolve(value);
        }
        const yes = () => done(true);
        const no  = () => done(false);
        btnOk.addEventListener("click", yes);
        btnNo.addEventListener("click", no);
    });
}


// ─── UI: offline-sync resolution modal ───────────────────────────────────────

function showOfflineModal(localProfiles, cloudProfiles, localAnswers) {
    return new Promise(resolve => {
        const overlay = document.getElementById("offlineSyncOverlay");

        // Fallback: simple modal if the rich UI is not present in this build
        if (!overlay) {
            showModal(
                `Données hors ligne détectées.\n` +
                `${localProfiles} profil(s) local · ${cloudProfiles} profil(s) cloud\n\n` +
                `Fusionner avec le cloud ?`,
                "Fusionner", "Supprimer"
            ).then(ok => resolve({ action: ok ? "merge" : "discard" }));
            return;
        }

        // Stat cards
        document.getElementById("offlineSyncSummary").innerHTML = `
            <div class="offline-sync-stat">
                <div class="offline-sync-stat-icon local">${localProfiles}</div>
                <div class="offline-sync-stat-text">Profil(s) local
                    <small>${localAnswers} réponse(s)</small>
                </div>
            </div>
            <div class="offline-sync-stat">
                <div class="offline-sync-stat-icon cloud">${cloudProfiles}</div>
                <div class="offline-sync-stat-text">Profil(s) cloud
                    <small>Dernière sync</small>
                </div>
            </div>`;

        // Profile picker
        const select      = document.getElementById("offlineSyncProfileSelect");
        const newWrap     = document.getElementById("offlineSyncNewProfileWrap");
        const profileSect = document.getElementById("offlineSyncProfileSection");
        newWrap.style.display = "none";

        try {
            const list     = JSON.parse(localStorage.getItem("ataraxie_profiles") || "[]");
            const activeId = localStorage.getItem("ataraxie_active_profile");
            select.innerHTML =
                list.map(p =>
                    `<option value="${p.id}"${p.id === activeId ? " selected" : ""}>${p.name}</option>`
                ).join("") +
                `<option value="__new__">+ Créer un nouveau profil</option>`;
        } catch (_) {
            select.innerHTML = `<option value="__new__">+ Créer un nouveau profil</option>`;
        }

        select.onchange = () => {
            newWrap.style.display = select.value === "__new__" ? "" : "none";
        };

        // Action cards
        let action = "merge";
        const cardMerge   = document.getElementById("offlineSyncMerge");
        const cardDiscard = document.getElementById("offlineSyncDiscard");

        function pickAction(a) {
            action = a;
            cardMerge.classList.toggle("active",  a === "merge");
            cardDiscard.classList.toggle("active", a === "discard");
            profileSect.style.display = a === "merge" ? "" : "none";
        }
        cardMerge.onclick   = () => pickAction("merge");
        cardDiscard.onclick = () => pickAction("discard");
        pickAction("merge");

        overlay.style.display = "flex";

        document.getElementById("offlineSyncCancel").onclick = () => {
            overlay.style.display = "none";
            resolve({ action: "cancel" });
        };

        document.getElementById("offlineSyncApply").onclick = () => {
            overlay.style.display = "none";
            resolve({
                action,
                targetProfile:  select.value,
                newProfileName: (document.getElementById("offlineSyncNewProfileName")?.value || "").trim(),
            });
        };
    });
}


// ─── UI: non-blocking toast on the sync badge ─────────────────────────────────

function toast(message, isError = false) {
    const el = document.getElementById("auth-sync-status");
    if (!el) return;
    const prev = { text: el.textContent, color: el.style.color };
    el.textContent = message;
    el.style.color  = isError ? "#ef4444" : "var(--b500)";
    setTimeout(() => { el.textContent = prev.text; el.style.color = prev.color; }, 3000);
}


// ─── Data merge: cloud + local → best combined result ────────────────────────

function mergeDataSets(cloudData, localData) {
    const out = { ...cloudData };

    for (const key in localData) {

        // Profile registry: union by id, local wins on conflict
        if (key === "ataraxie_profiles") {
            try {
                const cp  = cloudData[key] ? JSON.parse(cloudData[key]) : [];
                const lp  = localData[key] ? JSON.parse(localData[key]) : [];
                const map = new Map();
                cp.forEach(p => map.set(p.id, p));
                lp.forEach(p => map.set(p.id, p));
                out[key] = JSON.stringify([...map.values()]);
            } catch (_) { out[key] = localData[key]; }
            continue;
        }

        // Individual profile blobs: deep-merge each sub-key
        if (key.startsWith("ataraxie_p_")) {
            try {
                const cloud = cloudData[key] ? JSON.parse(cloudData[key]) : null;
                const local = localData[key] ? JSON.parse(localData[key]) : null;
                if (!cloud) { out[key] = localData[key]; continue; }
                if (!local) continue;

                const merged = { ...cloud };
                for (const sub of ["qcm", "red", "val", "his", "recent"]) {
                    if (!local[sub]) continue;
                    if (Array.isArray(local[sub])) {
                        merged[sub] = [...local[sub], ...(merged[sub] || [])];
                        if (sub === "recent") {
                            const seen = new Set();
                            merged[sub] = merged[sub].filter(r => {
                                if (seen.has(r.key)) return false;
                                seen.add(r.key);
                                return true;
                            });
                        }
                    } else {
                        merged[sub] = { ...(merged[sub] || {}), ...local[sub] };
                    }
                }
                out[key] = JSON.stringify(merged);
            } catch (_) { out[key] = localData[key]; }
            continue;
        }

        // Everything else: local wins
        out[key] = localData[key];
    }

    // Prune orphaned profile data (id not in the profile registry)
    try {
        const registered = new Set(
            JSON.parse(out["ataraxie_profiles"] || "[]").map(p => p.id)
        );
        for (const key in out) {
            if (key.startsWith("ataraxie_p_") && !registered.has(key.slice("ataraxie_p_".length))) {
                delete out[key];
            }
        }
    } catch (_) {}

    return out;
}


// ─── Cloud helpers ────────────────────────────────────────────────────────────

async function cloudRead(uid) {
    const snap = await get(child(ref(db), `users/${uid}`));
    return snap.exists() ? snap.val() : null;
}

async function cloudWriteAll(uid, data) {
    await update(ref(db, `users/${uid}/data`), data);
}

async function cloudInit(uid, email, data) {
    await set(ref(db, `users/${uid}`), {
        metadata: { email, linkedAt: Date.now() },
        data,
    });
}


// ─── Login-time sync ──────────────────────────────────────────────────────────

async function syncOnLogin(user) {
    const local = localDump();
    const doc   = await cloudRead(user.uid);

    // First ever login for this account — push local up
    if (!doc) {
        await cloudInit(user.uid, user.email, local);
        return local;
    }

    const cloud = doc.data || {};

    // No local data — pull cloud straight into localStorage
    if (Object.keys(local).length === 0) {
        localWrite(cloud);
        return cloud;
    }

    // Both sides differ — ask the user
    if (dataDiffer(local, cloud)) {
        let localCount = 0, cloudCount = 0;
        try { localCount = JSON.parse(local["ataraxie_profiles"] || "[]").length; } catch (_) {}
        try { cloudCount = JSON.parse(cloud["ataraxie_profiles"] || "[]").length; } catch (_) {}

        const merge = await showModal(
            `Des données locales ont été détectées.\n\n` +
            `Local : ${localCount} profil(s)   ·   Cloud : ${cloudCount} profil(s)\n\n` +
            `Fusionner avec le cloud, ou tout remplacer par les données en ligne ?`,
            "Fusionner (↑ Cloud)",
            "Télécharger (↓ Cloud)"
        );

        if (merge) {
            const merged = mergeDataSets(cloud, local);
            await cloudWriteAll(user.uid, merged);
            localClear();
            localWrite(merged);
            return merged;
        }
    }

    // Default: cloud is authoritative
    localClear();
    localWrite(cloud);
    return cloud;
}


// ─── Back-online sync ─────────────────────────────────────────────────────────

async function syncOnReconnect() {
    if (!_user) return;

    const local = localDump();
    if (Object.keys(local).length === 0) return;

    try {
        const doc = await cloudRead(_user.uid);
        if (!doc) return;

        const cloud = doc.data || {};
        if (!dataDiffer(local, cloud)) return;

        let localProfiles = 0, cloudProfiles = 0, localAnswers = 0;
        try { localProfiles = JSON.parse(local["ataraxie_profiles"] || "[]").length; } catch (_) {}
        try { cloudProfiles = JSON.parse(cloud["ataraxie_profiles"] || "[]").length; } catch (_) {}
        for (const k in local) {
            if (k.startsWith("ataraxie_p_")) {
                try {
                    const p = JSON.parse(local[k]);
                    localAnswers += Object.keys(p.qcm || {}).length + Object.keys(p.red || {}).length;
                } catch (_) {}
            }
        }

        const result = await showOfflineModal(localProfiles, cloudProfiles, localAnswers);

        if (result.action === "merge") {
            const merged = mergeDataSets(cloud, local);
            await cloudWriteAll(_user.uid, merged);
            localClear();
            localWrite(merged);
            toast("✔ Données fusionnées");
            if (typeof window.refreshUI === "function") window.refreshUI();

        } else if (result.action === "discard") {
            await window.FirebaseAuthManager.pullNow();
            toast("✔ Données cloud restaurées");
        }

    } catch (err) {
        console.error("[Sync] syncOnReconnect error:", err);
        toast("Erreur de synchronisation", true);
    }
}


// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC API  —  window.FirebaseAuthManager
// ═══════════════════════════════════════════════════════════════════════════════

window.FirebaseAuthManager = {

    // ── init ──────────────────────────────────────────────────────────────────
    // Call once at app startup.
    // onReady(cloudData, user) fires whenever auth state resolves.
    // user === null → signed out.  cloudData may be null on error.

    init(onReady) {
        // Consume any pending redirect result before onAuthStateChanged fires
        getRedirectResult(auth).catch(err => {
            console.error("[Auth] getRedirectResult error:", err);
        });

        onAuthStateChanged(auth, async user => {
            _user = user;
            if (user) {
                try {
                    const data = await syncOnLogin(user);
                    onReady(data, user);
                } catch (err) {
                    console.error("[Auth] Post-login sync failed:", err);
                    onReady(null, user);
                }
            } else {
                onReady(null, null);
            }
        });

        window.addEventListener("online", syncOnReconnect);
    },


    // ── login ─────────────────────────────────────────────────────────────────
    //
    //  Three completely separate flows:
    //
    //  Env.native          → Capacitor GoogleAuth plugin
    //                        Gets idToken from plugin → signInWithCredential.
    //                        Never falls back to web: Capacitor WebViews can't
    //                        handle OAuth redirects.
    //
    //  Env.androidBrowser  → signInWithRedirect (mandatory — Chrome on Android
    //                        blocks cross-origin popups unconditionally).
    //
    //  everything else     → signInWithPopup, fallback to redirect only if the
    //                        popup was blocked or dismissed (soft errors).

    async login() {
        if (Env.native)         return this._loginNative();
        if (Env.androidBrowser) return this._loginRedirect();
        return this._loginPopup();
    },


    // ── logout ────────────────────────────────────────────────────────────────

    async logout() {
        try {
            await signOut(auth);

            if (Env.native) {
                try { await window.Capacitor.Plugins.GoogleAuth.signOut(); }
                catch (e) { console.warn("[Auth] Native signOut non-fatal:", e); }
            }

            localClear();
            location.reload();
        } catch (err) {
            console.error("[Auth] logout error:", err);
        }
    },


    // ── saveProgress ──────────────────────────────────────────────────────────
    // Delta sync: only the one changed profile key is pushed to the cloud.

    async saveProgress(profileKey, state) {
        if (typeof profileKey !== "string" || !profileKey.startsWith("ataraxie_")) {
            console.warn("[Sync] saveProgress: invalid key", profileKey);
            return;
        }
        if (!state) { await this.forceSync(); return; }

        const json = JSON.stringify(state);
        localStorage.setItem(profileKey, json);

        if (_user) {
            setSyncStatus("syncing");
            try {
                await update(ref(db, `users/${_user.uid}/data`), { [profileKey]: json });
                setSyncStatus("synced");
            } catch (err) {
                console.error("[Sync] saveProgress error:", err);
                setSyncStatus("error");
            }
        }
    },


    // ── forceSync ─────────────────────────────────────────────────────────────
    // Full push: all local ataraxie_* keys written to cloud in one call.

    async forceSync() {
        if (!_user) return;
        setSyncStatus("syncing");
        try {
            await cloudWriteAll(_user.uid, localDump());
            setSyncStatus("synced");
        } catch (err) {
            console.error("[Sync] forceSync error:", err);
            setSyncStatus("error");
        }
    },


    // ── pullNow ───────────────────────────────────────────────────────────────
    // Overwrites local with the cloud snapshot and refreshes the UI.

    async pullNow() {
        if (!_user) return;
        setSyncStatus("syncing");
        try {
            const doc = await cloudRead(_user.uid);
            if (!doc) { setSyncStatus("error"); return; }

            localClear();
            localWrite(doc.data || {});
            setSyncStatus("synced");

            if (typeof window.refreshUI === "function") window.refreshUI();
            else location.reload();
        } catch (err) {
            console.error("[Sync] pullNow error:", err);
            setSyncStatus("error");
        }
    },


    // ── getUser ───────────────────────────────────────────────────────────────

    getUser() { return _user; },


    // ── mergeDataSets ─────────────────────────────────────────────────────────
    // Exposed for any external callers that need manual merging.

    mergeDataSets,


    // ─────────────────────────────────────────────────────────────────────────
    //  Internal login implementations  (do not call directly)
    // ─────────────────────────────────────────────────────────────────────────

    async _loginNative() {
        try {
            await window.Capacitor.Plugins.GoogleAuth.initialize();
            const gUser = await window.Capacitor.Plugins.GoogleAuth.signIn();
            const token = gUser?.authentication?.idToken;
            if (!token) throw new Error("No idToken returned by GoogleAuth plugin.");
            await signInWithCredential(auth, GoogleAuthProvider.credential(token));
        } catch (err) {
            console.error("[Auth] Native login error:", err);
            showModal(
                "Connexion impossible via l'application.\n" +
                "Vérifiez votre accès à Google et réessayez.",
                "OK", ""
            );
        }
    },

    async _loginRedirect() {
        try {
            const p = new GoogleAuthProvider();
            p.setCustomParameters({ prompt: "select_account" });
            await signInWithRedirect(auth, p);
            // Page reloads; init()'s getRedirectResult() picks up the result.
        } catch (err) {
            console.error("[Auth] signInWithRedirect error:", err);
            showModal("Connexion échouée. Vérifiez votre connexion et réessayez.", "OK", "");
        }
    },

    async _loginPopup() {
        const p = new GoogleAuthProvider();
        p.setCustomParameters({ prompt: "select_account" });
        try {
            await signInWithPopup(auth, p);
        } catch (err) {
            // Soft errors: popup didn't open or was dismissed — not a real auth failure
            const softErrors = [
                "auth/popup-blocked",
                "auth/popup-closed-by-user",
                "auth/cancelled-popup-request",
            ];
            if (softErrors.includes(err.code)) {
                console.warn("[Auth] Popup unavailable, falling back to redirect:", err.code);
                try {
                    await signInWithRedirect(auth, p);
                } catch (e2) {
                    console.error("[Auth] Redirect fallback failed:", e2);
                    showModal("Connexion échouée. Autorisez les popups ou réessayez.", "OK", "");
                }
            } else {
                // Hard error: network, config, or Firebase issue
                console.error("[Auth] signInWithPopup error:", err);
                showModal(`Erreur de connexion : ${err.message || err.code}`, "OK", "");
            }
        }
    },
};

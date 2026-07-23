/* ==========================================================================
   Login-, Registrierungs- und Benutzersystem — Hornhausen-Hof
   ==========================================================================
   Diese Datei ist bewusst KOMPLETT GETRENNT vom Rest der App (js/app.js).
   Der ganze Rest der Website (Bestellungen, Waren & Preise, Handelsrechner,
   Kontakte, Lager, Verkäufe, Statistiken, ...) benutzt weiterhin die "alte"
   Firebase-Schreibweise (das "Compat SDK", z. B. `db.collection("...").doc(
   "...")`). Diese Datei hier benutzt bewusst die NEUE, moderne Firebase-
   Schreibweise (das "Modular SDK", z. B. `doc(db, "users", uid)`). Beide
   Schreibweisen können ganz normal gleichzeitig auf dieselbe Firebase-
   Datenbank zugreifen - das ist kein Problem, es sind nur zwei
   unterschiedliche "Sprachen", um mit derselben Datenbank zu reden.

   Diese Datei ist ein "ES-Modul" (deshalb `type="module"` im <script>-Tag
   in index.html) und wird deshalb NACH den anderen <script>-Tags ausgeführt.
   Module können nicht einfach `window.irgendwas` benutzen, ohne es explizit
   dranzuhängen - deshalb hängt diese Datei ganz bewusst eine kleine, klar
   benannte Schnittstelle an `window` (siehe ganz unten: `window.Benutzer-
   Verwaltung`), damit js/app.js (die "alte" Datei) diese Funktionen nutzen
   kann, ohne selbst ein Modul sein zu müssen.

   ÜBERBLICK, WAS HIER PASSIERT:
   1. Firebase Authentication + Firestore (Modular SDK) initialisieren
   2. Formulare: Login, Registrieren, Google-Benutzername-Wahl
   3. "Passwort vergessen" + "Mit Google anmelden"
   4. Der zentrale "Ist gerade jemand eingeloggt?"-Beobachter
      (onAuthStateChanged), der je nach Status (pending/approved/rejected/
      locked) die richtige Ansicht zeigt und - sobald jemand freigegeben
      ist - der bestehenden App (js/app.js) per Event Bescheid gibt
      ("hof:auth-approved" / "hof:auth-profile-updated" / "hof:auth-signed-out")
   5. Die komplette Benutzerverwaltung für Verwalter (Liste laden, freigeben,
      ablehnen, sperren, Rang ändern, Verwalterrechte vergeben, umbenennen,
      Notiz setzen, löschen, neuen Benutzer direkt anlegen)
   ========================================================================== */

// --- 1. Firebase Modular SDK laden -----------------------------------------
import {
  initializeApp,
  getApp,
  deleteApp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// js/firebase-config.js (weiter oben als normales <script> geladen) hängt
// die Projektdaten bewusst an `window.firebaseConfig`, damit auch diese
// Modul-Datei hier sie lesen kann.
const firebaseConfig = window.firebaseConfig;

// Der Rang, den ein neu registrierter Benutzer automatisch erhält (unterster
// Rang der Hof-Hierarchie) - siehe erstelleBenutzerProfil weiter unten.
const STANDARD_RANG_NEUER_BENUTZER = "Tagelöhner";

if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.warn("auth.js: Firebase-Konfiguration fehlt - Login-System wird nicht gestartet.");
} else {
  // Bewusst KEINE eigene, separat benannte Firebase-App-Instanz, sondern
  // über getApp() dieselbe Standard-App wiederverwenden, die
  // js/firebase-config.js weiter oben bereits per `firebase.initializeApp(...)`
  // (Compat-Schreibweise) angelegt hat - so teilen sich Compat- und Modular-
  // SDK dieselbe Anmelde-Sitzung, wie von Firebase offiziell vorgesehen.
  let app;
  try {
    app = getApp();
  } catch (fehler) {
    app = initializeApp(firebaseConfig);
  }
  const auth = getAuth(app);
  const db = getFirestore(app);

  /* ------------------------------------------------------------------------
     2. Kleine Hilfsfunktionen
     ------------------------------------------------------------------------ */
  function zeigeFeldFehler(el, text) {
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
  }

  function versteckeFeldFehler(el) {
    if (!el) return;
    el.hidden = true;
  }

  // Alle "Schritte" (Formulare + Status-Hinweise) auf dem Login-Bildschirm.
  // Genau einer davon ist immer sichtbar.
  const AUTH_SCHRITTE = [
    "form-login",
    "form-register",
    "form-google-username",
    "auth-status-pending",
    "auth-status-rejected",
    "auth-status-locked",
  ];

  function zeigeAuthSchritt(id) {
    AUTH_SCHRITTE.forEach((schrittId) => {
      const el = document.getElementById(schrittId);
      if (!el) return;
      const istFormular = el.tagName === "FORM";
      el.classList.toggle(istFormular ? "auth-form--active" : "auth-status--active", schrittId === id);
    });
  }

  // Formatiert einen Firestore-Timestamp als deutsches Datum + Uhrzeit.
  function formatiereDeutschesDatum(ts) {
    if (!ts || typeof ts.toDate !== "function") return "unbekannt";
    const d = ts.toDate();
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(
      d.getHours()
    ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} Uhr`;
  }

  // Übersetzt die (englischen) Firebase-Fehlercodes in verständliche,
  // deutsche Meldungen für die häufigsten Fälle.
  function deutscherFehlertext(fehler) {
    const code = fehler && fehler.code;
    switch (code) {
      case "auth/invalid-email":
        return "Diese E-Mail-Adresse ist ungültig.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "E-Mail-Adresse oder Passwort ist falsch.";
      case "auth/email-already-in-use":
        return "Für diese E-Mail-Adresse existiert bereits ein Account.";
      case "auth/weak-password":
        return "Das Passwort ist zu schwach (mindestens 6 Zeichen).";
      case "auth/too-many-requests":
        return "Zu viele Versuche. Bitte warte einen Moment und versuch es erneut.";
      case "auth/popup-closed-by-user":
        return "Google-Anmeldung wurde abgebrochen.";
      default:
        console.error("Firebase-Auth-Fehler:", fehler);
        return "Etwas ist schiefgelaufen. Bitte versuch es erneut.";
    }
  }

  /* ------------------------------------------------------------------------
     3. Benutzernamen-Reservierung (verhindert doppelte Namen)
     ------------------------------------------------------------------------ */
  function benutzernameSchluessel(name) {
    return (name || "").trim().toLowerCase();
  }

  async function istBenutzernameFrei(name, eigeneUid) {
    const schluessel = benutzernameSchluessel(name);
    if (!schluessel) return false;
    const snap = await getDoc(doc(db, "usernames", schluessel));
    if (!snap.exists()) return true;
    return eigeneUid ? snap.data().uid === eigeneUid : false;
  }

  /* ------------------------------------------------------------------------
     4. DOM-Elemente
     ------------------------------------------------------------------------ */
  const el = {
    authScreen: document.getElementById("auth-screen"),
    appRoot: document.getElementById("app-root"),

    formLogin: document.getElementById("form-login"),
    loginEmail: document.getElementById("login-email"),
    loginPassword: document.getElementById("login-password"),
    loginError: document.getElementById("login-error"),
    btnGoogleLogin: document.getElementById("btn-google-login"),
    linkForgotPassword: document.getElementById("link-forgot-password"),
    linkShowRegister: document.getElementById("link-show-register"),

    formRegister: document.getElementById("form-register"),
    registerUsername: document.getElementById("register-username"),
    registerEmail: document.getElementById("register-email"),
    registerPassword: document.getElementById("register-password"),
    registerPassword2: document.getElementById("register-password2"),
    registerError: document.getElementById("register-error"),
    linkShowLogin: document.getElementById("link-show-login"),

    formGoogleUsername: document.getElementById("form-google-username"),
    googleUsernameInput: document.getElementById("google-username-input"),
    googleUsernameError: document.getElementById("google-username-error"),

    btnPendingLogout: document.getElementById("btn-pending-logout"),
    btnRejectedLogout: document.getElementById("btn-rejected-logout"),
    btnLockedLogout: document.getElementById("btn-locked-logout"),
    authStatusLockedText: document.getElementById("auth-status-locked-text"),

    btnLogout: document.getElementById("btn-logout"),
  };

  /* ------------------------------------------------------------------------
     5. Registrierung
     ------------------------------------------------------------------------ */
  if (el.formRegister) {
    el.formRegister.addEventListener("submit", async (event) => {
      event.preventDefault();
      versteckeFeldFehler(el.registerError);

      const username = el.registerUsername.value.trim();
      const email = el.registerEmail.value.trim();
      const passwort = el.registerPassword.value;
      const passwort2 = el.registerPassword2.value;

      if (!username) {
        zeigeFeldFehler(el.registerError, "Bitte gib einen Benutzernamen ein.");
        return;
      }
      if (passwort !== passwort2) {
        zeigeFeldFehler(el.registerError, "Die beiden Passwörter stimmen nicht überein.");
        return;
      }
      if (passwort.length < 6) {
        zeigeFeldFehler(el.registerError, "Das Passwort muss mindestens 6 Zeichen lang sein.");
        return;
      }

      const submitBtn = el.formRegister.querySelector("button[type=submit]");
      if (submitBtn) submitBtn.disabled = true;

      try {
        const frei = await istBenutzernameFrei(username);
        if (!frei) {
          zeigeFeldFehler(el.registerError, "Dieser Benutzername ist bereits vergeben.");
          return;
        }

        const cred = await createUserWithEmailAndPassword(auth, email, passwort);
        await erstelleBenutzerProfil(cred.user.uid, username, email);
        await updateProfile(cred.user, { displayName: username }).catch(() => {});
      } catch (fehler) {
        zeigeFeldFehler(el.registerError, deutscherFehlertext(fehler));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Legt das eigentliche Profil-Dokument (users/{uid}) UND die
  // Namens-Reservierung (usernames/{name}) an.
  async function erstelleBenutzerProfil(uid, username, email) {
    await setDoc(doc(db, "users", uid), {
      username: username.trim(),
      email: email || null,
      rolle: STANDARD_RANG_NEUER_BENUTZER,
      isAdmin: false,
      status: "pending",
      createdAt: serverTimestamp(),
      lastLogin: null,
      adminNote: "",
    });
    await setDoc(doc(db, "usernames", benutzernameSchluessel(username)), { uid });
  }

  /* ------------------------------------------------------------------------
     6. Login (E-Mail + Passwort)
     ------------------------------------------------------------------------ */
  if (el.formLogin) {
    el.formLogin.addEventListener("submit", async (event) => {
      event.preventDefault();
      versteckeFeldFehler(el.loginError);

      const email = el.loginEmail.value.trim();
      const passwort = el.loginPassword.value;
      const submitBtn = el.formLogin.querySelector("button[type=submit]");
      if (submitBtn) submitBtn.disabled = true;

      try {
        await signInWithEmailAndPassword(auth, email, passwort);
      } catch (fehler) {
        zeigeFeldFehler(el.loginError, deutscherFehlertext(fehler));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ------------------------------------------------------------------------
     7. Passwort vergessen
     ------------------------------------------------------------------------ */
  if (el.linkForgotPassword) {
    el.linkForgotPassword.addEventListener("click", async () => {
      versteckeFeldFehler(el.loginError);
      const email = el.loginEmail.value.trim();
      if (!email) {
        zeigeFeldFehler(el.loginError, "Bitte trage zuerst oben deine E-Mail-Adresse ein, dann klicke erneut auf „Passwort vergessen?“.");
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        zeigeFeldFehler(el.loginError, "E-Mail zum Zurücksetzen des Passworts wurde verschickt (bitte auch den Spam-Ordner prüfen).");
      } catch (fehler) {
        zeigeFeldFehler(el.loginError, deutscherFehlertext(fehler));
      }
    });
  }

  /* ------------------------------------------------------------------------
     8. Mit Google anmelden
     ------------------------------------------------------------------------ */
  let ausstehenderGoogleUser = null;

  if (el.btnGoogleLogin) {
    el.btnGoogleLogin.addEventListener("click", async () => {
      versteckeFeldFehler(el.loginError);
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (fehler) {
        zeigeFeldFehler(el.loginError, deutscherFehlertext(fehler));
      }
    });
  }

  if (el.formGoogleUsername) {
    el.formGoogleUsername.addEventListener("submit", async (event) => {
      event.preventDefault();
      versteckeFeldFehler(el.googleUsernameError);
      if (!ausstehenderGoogleUser) return;

      const username = el.googleUsernameInput.value.trim();
      if (!username) {
        zeigeFeldFehler(el.googleUsernameError, "Bitte gib einen Benutzernamen ein.");
        return;
      }

      const submitBtn = el.formGoogleUsername.querySelector("button[type=submit]");
      if (submitBtn) submitBtn.disabled = true;

      try {
        const frei = await istBenutzernameFrei(username);
        if (!frei) {
          zeigeFeldFehler(el.googleUsernameError, "Dieser Benutzername ist bereits vergeben.");
          return;
        }
        await erstelleBenutzerProfil(ausstehenderGoogleUser.uid, username, ausstehenderGoogleUser.email);
        ausstehenderGoogleUser = null;
      } catch (fehler) {
        zeigeFeldFehler(el.googleUsernameError, deutscherFehlertext(fehler));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ------------------------------------------------------------------------
     9. Logout
     ------------------------------------------------------------------------ */
  function abmelden() {
    signOut(auth).catch((fehler) => console.error("Abmelden fehlgeschlagen:", fehler));
  }
  [el.btnLogout, el.btnPendingLogout, el.btnRejectedLogout, el.btnLockedLogout].forEach((btn) => {
    if (btn) btn.addEventListener("click", abmelden);
  });

  /* ------------------------------------------------------------------------
     10. Umschalten zwischen Login- und Registrieren-Formular
     ------------------------------------------------------------------------ */
  if (el.linkShowRegister) {
    el.linkShowRegister.addEventListener("click", () => zeigeAuthSchritt("form-register"));
  }
  if (el.linkShowLogin) {
    el.linkShowLogin.addEventListener("click", () => zeigeAuthSchritt("form-login"));
  }

  /* ------------------------------------------------------------------------
     11. Der zentrale Beobachter: Ist gerade jemand eingeloggt?
     ------------------------------------------------------------------------ */
  let unsubUserDoc = null;
  let bereitsGestartet = false;
  let aktuellerAdmin = null;

  onAuthStateChanged(auth, (firebaseUser) => {
    if (unsubUserDoc) {
      unsubUserDoc();
      unsubUserDoc = null;
    }

    if (!firebaseUser) {
      bereitsGestartet = false;
      aktuellerAdmin = null;
      if (el.appRoot) el.appRoot.hidden = true;
      if (el.authScreen) el.authScreen.hidden = false;
      zeigeAuthSchritt("form-login");
      window.dispatchEvent(new CustomEvent("hof:auth-signed-out"));
      return;
    }

    unsubUserDoc = onSnapshot(
      doc(db, "users", firebaseUser.uid),
      (snap) => {
        if (!snap.exists()) {
          ausstehenderGoogleUser = firebaseUser;
          if (el.appRoot) el.appRoot.hidden = true;
          if (el.authScreen) el.authScreen.hidden = false;
          zeigeAuthSchritt("form-google-username");
          return;
        }

        const daten = snap.data();

        if (daten.status === "approved") {
          if (el.authScreen) el.authScreen.hidden = true;
          if (el.appRoot) el.appRoot.hidden = false;

          aktuellerAdmin = daten.isAdmin
            ? { uid: firebaseUser.uid, username: daten.username || "Unbekannt" }
            : null;

          const detail = { uid: firebaseUser.uid, username: daten.username, rolle: daten.rolle, isAdmin: !!daten.isAdmin };

          if (!bereitsGestartet) {
            bereitsGestartet = true;
            updateDoc(doc(db, "users", firebaseUser.uid), { lastLogin: serverTimestamp() }).catch(() => {});
            window.dispatchEvent(new CustomEvent("hof:auth-approved", { detail }));
          } else {
            window.dispatchEvent(new CustomEvent("hof:auth-profile-updated", { detail }));
          }
        } else {
          aktuellerAdmin = null;

          if (bereitsGestartet) {
            window.location.reload();
            return;
          }

          if (daten.status === "locked" && daten.gesperrtBis && daten.gesperrtBis.toMillis() <= Date.now()) {
            updateDoc(doc(db, "users", firebaseUser.uid), { status: "approved", gesperrtBis: null }).catch(
              (fehler) => console.error("Automatisches Entsperren fehlgeschlagen:", fehler)
            );
            return;
          }

          if (daten.status === "locked" && el.authStatusLockedText) {
            el.authStatusLockedText.textContent = daten.gesperrtBis
              ? `Dein Account ist gesperrt bis ${formatiereDeutschesDatum(daten.gesperrtBis)}. Bitte wende dich an einen Verwalter des Hofes, falls du denkst, dass das ein Fehler ist.`
              : "Dein Account wurde dauerhaft gesperrt. Bitte wende dich an einen Verwalter des Hofes.";
          }

          if (el.appRoot) el.appRoot.hidden = true;
          if (el.authScreen) el.authScreen.hidden = false;
          zeigeAuthSchritt(`auth-status-${daten.status}`);
          window.dispatchEvent(new CustomEvent("hof:auth-signed-out"));
        }
      },
      (fehler) => {
        console.error("Profil konnte nicht geladen werden:", fehler);
      }
    );
  });

  /* ------------------------------------------------------------------------
     11b. Aktivitäts-Log
     ------------------------------------------------------------------------ */
  function protokolliere(aktion, zielUid, zielName, details) {
    if (!aktuellerAdmin) return;
    addDoc(collection(db, "adminLog"), {
      zeitpunkt: serverTimestamp(),
      adminUid: aktuellerAdmin.uid,
      adminName: aktuellerAdmin.username,
      aktion,
      zielUid: zielUid || null,
      zielName: zielName || null,
      details: details || "",
    }).catch((fehler) => console.error("Aktivitäts-Log konnte nicht geschrieben werden:", fehler));
  }

  /* ------------------------------------------------------------------------
     12. Benutzerverwaltung (nur für Verwalter) - öffentliche Schnittstelle
         für js/app.js.
     ------------------------------------------------------------------------ */
  window.BenutzerVerwaltung = {
    onListe(callback) {
      return onSnapshot(
        collection(db, "users"),
        (snap) => {
          const liste = [];
          snap.forEach((docSnap) => liste.push({ uid: docSnap.id, ...docSnap.data() }));
          callback(liste);
        },
        (fehler) => console.error("Benutzerliste konnte nicht geladen werden:", fehler)
      );
    },

    async setzeStatus(uid, neuerStatus, username) {
      await updateDoc(doc(db, "users", uid), { status: neuerStatus });
      const aktion = neuerStatus === "approved" ? "Freigegeben" : neuerStatus === "rejected" ? "Abgelehnt" : "Status geändert";
      protokolliere(aktion, uid, username);
    },
    async setzeRolle(uid, neueRolle, username) {
      await updateDoc(doc(db, "users", uid), { rolle: neueRolle });
      protokolliere("Rang geändert", uid, username, neueRolle);
    },
    async setzeAdmin(uid, istAdminWert, username) {
      await updateDoc(doc(db, "users", uid), { isAdmin: !!istAdminWert });
      protokolliere(istAdminWert ? "Verwalterrechte vergeben" : "Verwalterrechte entzogen", uid, username);
    },
    setzeNotiz(uid, text) {
      return updateDoc(doc(db, "users", uid), { adminNote: text });
    },

    async sperreBenutzer(uid, tage, username) {
      const daten = { status: "locked" };
      if (tage && tage > 0) {
        const bis = new Date(Date.now() + tage * 24 * 60 * 60 * 1000);
        daten.gesperrtBis = Timestamp.fromDate(bis);
      } else {
        daten.gesperrtBis = null;
      }
      await updateDoc(doc(db, "users", uid), daten);
      protokolliere("Gesperrt", uid, username, tage && tage > 0 ? `für ${tage} Tag(e)` : "dauerhaft");
    },

    async entsperreBenutzer(uid, username) {
      await updateDoc(doc(db, "users", uid), { status: "approved", gesperrtBis: null });
      protokolliere("Entsperrt", uid, username);
    },

    async sendePasswortReset(email, uid, username) {
      await sendPasswordResetEmail(auth, email);
      protokolliere("Passwort-Reset verschickt", uid, username);
    },

    async loesche(uid) {
      const profilSnap = await getDoc(doc(db, "users", uid));
      const username = profilSnap.exists() ? profilSnap.data().username : null;

      await deleteDoc(doc(db, "users", uid));
      if (username) {
        await deleteDoc(doc(db, "usernames", benutzernameSchluessel(username))).catch(() => {});
      }
      protokolliere("Gelöscht", uid, username);
    },

    async benenneUm(uid, neuerName, alterName) {
      const neuerSchluessel = benutzernameSchluessel(neuerName);
      const frei = await istBenutzernameFrei(neuerName, uid);
      if (!frei) {
        throw new Error("Dieser Benutzername ist bereits vergeben.");
      }
      await setDoc(doc(db, "usernames", neuerSchluessel), { uid });
      await updateDoc(doc(db, "users", uid), { username: neuerName.trim() });
      const alterSchluessel = benutzernameSchluessel(alterName);
      if (alterSchluessel && alterSchluessel !== neuerSchluessel) {
        await deleteDoc(doc(db, "usernames", alterSchluessel)).catch(() => {});
      }
      protokolliere("Umbenannt", uid, neuerName.trim(), `vorher: „${alterName}“`);
    },

    onLog(callback) {
      return onSnapshot(
        query(collection(db, "adminLog"), orderBy("zeitpunkt", "desc"), limit(50)),
        (snap) => {
          const liste = [];
          snap.forEach((docSnap) => liste.push({ id: docSnap.id, ...docSnap.data() }));
          callback(liste);
        },
        (fehler) => console.error("Aktivitäts-Log konnte nicht geladen werden:", fehler)
      );
    },

    async erstelleNeuenBenutzer({ username, email, rolle }) {
      const frei = await istBenutzernameFrei(username);
      if (!frei) {
        throw new Error("Dieser Benutzername ist bereits vergeben.");
      }

      const zufallsPasswort =
        (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Math.random())) + Date.now();

      const tempApp = initializeApp(firebaseConfig, "hofAdminCreate-" + Date.now());
      const tempAuth = getAuth(tempApp);

      try {
        const cred = await createUserWithEmailAndPassword(tempAuth, email, zufallsPasswort);
        const neueUid = cred.user.uid;

        await setDoc(doc(db, "users", neueUid), {
          username: username.trim(),
          email: email || null,
          rolle: rolle || STANDARD_RANG_NEUER_BENUTZER,
          isAdmin: false,
          status: "approved",
          createdAt: serverTimestamp(),
          lastLogin: null,
          adminNote: "",
        });
        await setDoc(doc(db, "usernames", benutzernameSchluessel(username)), { uid: neueUid });

        await sendPasswordResetEmail(tempAuth, email);

        await signOut(tempAuth);
        protokolliere("Benutzer erstellt", neueUid, username.trim());
      } finally {
        deleteApp(tempApp).catch(() => {});
      }
    },
  };
}

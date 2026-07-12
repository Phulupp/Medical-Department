/* ==========================================================================
   Login-, Registrierungs- und Benutzersystem
   ==========================================================================
   WICHTIG FÜR DICH ALS ANFÄNGER: Diese Datei ist bewusst KOMPLETT GETRENNT
   vom Rest der App (js/app.js). Der ganze Rest der Website (Verkauf, Wiki,
   Personal, Kontakte, ...) benutzt weiterhin die "alte" Firebase-Schreibweise
   (das "Compat SDK", z. B. `db.collection("...").doc("...")`). Diese Datei
   hier benutzt bewusst die NEUE, moderne Firebase-Schreibweise (das
   "Modular SDK", z. B. `doc(db, "users", uid)`), weil das explizit so
   gewünscht war. Beide Schreibweisen können ganz normal gleichzeitig auf
   dieselbe Firebase-Datenbank zugreifen - das ist kein Problem, es sind nur
   zwei unterschiedliche "Sprachen", um mit derselben Datenbank zu reden.

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
   5. Die komplette Benutzerverwaltung für Admins (Liste laden, freigeben,
      ablehnen, sperren, Rolle ändern, Admin-Rechte vergeben, umbenennen,
      Notiz setzen, löschen, neuen Benutzer direkt anlegen)
   ========================================================================== */

// --- 1. Firebase Modular SDK laden -----------------------------------------
// Diese Adressen sind KEIN Download einer Datei in dem Sinne, wie man es
// von node_modules/npm kennt - der Browser lädt den Code direkt von
// Googles Server (genau wie die <script>-Tags mit den "-compat.js"-Dateien
// weiter oben in index.html). Es ist bewusst dieselbe Versionsnummer
// (10.12.2) wie beim Compat SDK, damit beide "Sprachen" sicher zusammenpassen.
import {
  initializeApp,
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
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// js/firebase-config.js (weiter oben als normales <script> geladen) hängt
// die Projektdaten bewusst an `window.firebaseConfig`, damit auch diese
// Modul-Datei hier sie lesen kann (ein normales "const" in einem klassischen
// <script>-Tag wäre für ein Modul sonst nicht sichtbar).
const firebaseConfig = window.firebaseConfig;

// Genau wie beim bestehenden Compat-Code: Wenn Firebase noch nicht
// eingerichtet ist, soll die Seite nicht komplett abstürzen.
if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.warn("auth.js: Firebase-Konfiguration fehlt - Login-System wird nicht gestartet.");
} else {
  // Eigene, benannte Firebase-App-Instanz ("bwmAuth") statt der
  // Standard-Instanz - so gibt es garantiert keinen Konflikt mit der
  // Compat-Instanz, die der Rest der App (js/app.js) benutzt. Beide zeigen
  // trotzdem auf dieselbe Firebase-Datenbank (dieselben firebaseConfig-Werte).
  const app = initializeApp(firebaseConfig, "bwmAuth");
  const auth = getAuth(app);
  const db = getFirestore(app);

  /* ------------------------------------------------------------------------
     2. Kleine Hilfsfunktionen
     ------------------------------------------------------------------------ */

  // Zeigt eine Fehlermeldung in einem <p class="field-error">-Element an -
  // exakt dasselbe Muster wie das bestehende `zeigeFeldFehler` in js/app.js.
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
  // Genau einer davon ist immer sichtbar. Formulare bekommen die bereits
  // bestehende CSS-Klasse ".auth-form--active", die neuen Status-Hinweise
  // (kein <form>, sondern <div>) die neue Klasse ".auth-status--active"
  // (siehe css/style.css - beide sind vom Aufbau her fast identisch).
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
     ------------------------------------------------------------------------
     Jeder Benutzername wird zusätzlich als eigenes, winziges Dokument in der
     Collection "usernames" abgelegt (Dokument-ID = Name in Kleinbuchstaben,
     Inhalt nur die zugehörige uid). Das hat zwei Gründe:
     1. Firestore selbst kennt keine "eindeutigen Felder" - man muss das
        also selbst nachbauen.
     2. Die Sicherheitsregeln erlauben normalen (nicht-freigegebenen)
        Nutzern KEIN Durchsuchen der ganzen "users"-Liste (das dürfen nur
        Admins) - ein einzelnes Dokument gezielt abzufragen ("gibt es
        'Heinrich Hornhausen' schon?") ist aber erlaubt und reicht für die
        Prüfung völlig aus.
     ------------------------------------------------------------------------ */
  function benutzernameSchluessel(name) {
    return (name || "").trim().toLowerCase();
  }

  async function istBenutzernameFrei(name, eigeneUid) {
    const schluessel = benutzernameSchluessel(name);
    if (!schluessel) return false;
    const snap = await getDoc(doc(db, "usernames", schluessel));
    if (!snap.exists()) return true;
    // Falls der Name schon existiert, aber der eigenen uid gehört (z. B.
    // beim Umbenennen auf denselben Namen), zählt das nicht als "vergeben".
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

    btnLogout: document.getElementById("btn-logout"), // der "Abmelden"-Button oben rechts, innerhalb der laufenden App
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
        await erstelleBenutzerProfil(cred.user.uid, username);
        await updateProfile(cred.user, { displayName: username }).catch(() => {});
        // Ab hier übernimmt der onAuthStateChanged-Beobachter weiter unten
        // automatisch und zeigt den "wartet auf Freigabe"-Hinweis an.
      } catch (fehler) {
        zeigeFeldFehler(el.registerError, deutscherFehlertext(fehler));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Legt das eigentliche Profil-Dokument (users/{uid}) UND die
  // Namens-Reservierung (usernames/{name}) an. Wird sowohl bei normaler
  // Registrierung als auch nach dem ersten Google-Login benutzt.
  async function erstelleBenutzerProfil(uid, username) {
    await setDoc(doc(db, "users", uid), {
      username: username.trim(),
      rolle: "Anwärter",
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
        // onAuthStateChanged (weiter unten) übernimmt den Rest.
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
  let ausstehenderGoogleUser = null; // zwischengespeichert, bis der Benutzername gewählt wurde

  if (el.btnGoogleLogin) {
    el.btnGoogleLogin.addEventListener("click", async () => {
      versteckeFeldFehler(el.loginError);
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
        // onAuthStateChanged (weiter unten) erkennt automatisch, ob schon
        // ein Profil existiert oder ob der Benutzername-Schritt nötig ist.
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
        await erstelleBenutzerProfil(ausstehenderGoogleUser.uid, username);
        ausstehenderGoogleUser = null;
        // onAuthStateChanged/onSnapshot (weiter unten) bemerkt automatisch,
        // dass jetzt ein Profil existiert, und zeigt "wartet auf Freigabe".
      } catch (fehler) {
        zeigeFeldFehler(el.googleUsernameError, deutscherFehlertext(fehler));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /* ------------------------------------------------------------------------
     9. Logout (echtes Abmelden - anders als das alte "Nutzer wechseln")
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
     ------------------------------------------------------------------------
     Das ist das Herzstück des neuen Systems. `onAuthStateChanged` wird von
     Firebase automatisch aufgerufen: einmal beim Laden der Seite (Firebase
     merkt sich Logins automatisch im Browser - das ist die "automatische
     Anmeldung"), und danach jedes Mal, wenn sich jemand neu anmeldet oder
     abmeldet.

     Sobald jemand eingeloggt ist, wird zusätzlich das zugehörige
     "users/{uid}"-Dokument LIVE abonniert (onSnapshot) - ändert ein Admin
     währenddessen z. B. die Rolle oder gibt jemanden frei, wirkt sich das
     sofort aus, ohne dass die Seite neu geladen werden muss.
     ------------------------------------------------------------------------ */
  let unsubUserDoc = null;
  let bereitsGestartet = false; // true, sobald die App in dieser Sitzung einmal gestartet wurde

  onAuthStateChanged(auth, (firebaseUser) => {
    if (unsubUserDoc) {
      unsubUserDoc();
      unsubUserDoc = null;
    }

    if (!firebaseUser) {
      // Niemand eingeloggt -> Login-Bildschirm zeigen.
      bereitsGestartet = false;
      if (el.appRoot) el.appRoot.hidden = true;
      if (el.authScreen) el.authScreen.hidden = false;
      zeigeAuthSchritt("form-login");
      window.dispatchEvent(new CustomEvent("bwm:auth-signed-out"));
      return;
    }

    unsubUserDoc = onSnapshot(
      doc(db, "users", firebaseUser.uid),
      (snap) => {
        if (!snap.exists()) {
          // Eingeloggt, aber noch kein Profil vorhanden - passiert nur
          // beim allerersten Google-Login. Benutzernamen abfragen.
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

          const detail = { uid: firebaseUser.uid, username: daten.username, rolle: daten.rolle, isAdmin: !!daten.isAdmin };

          if (!bereitsGestartet) {
            bereitsGestartet = true;
            // Letzten Login-Zeitpunkt einmalig pro Sitzung aktualisieren.
            updateDoc(doc(db, "users", firebaseUser.uid), { lastLogin: serverTimestamp() }).catch(() => {});
            window.dispatchEvent(new CustomEvent("bwm:auth-approved", { detail }));
          } else {
            // App läuft schon - nur die geänderten Werte (z. B. neue
            // Rolle) an die bestehende App durchreichen, OHNE sie neu zu
            // starten.
            window.dispatchEvent(new CustomEvent("bwm:auth-profile-updated", { detail }));
          }
        } else {
          if (bereitsGestartet) {
            // Nutzer war schon aktiv in der App und hat GERADE seinen
            // Zugriff verloren (z. B. wurde live von einem Admin
            // gesperrt). Einfachste und sicherste Lösung: Seite neu
            // laden - danach greift die normale Status-Anzeige von vorn.
            window.location.reload();
            return;
          }
          if (el.appRoot) el.appRoot.hidden = true;
          if (el.authScreen) el.authScreen.hidden = false;
          zeigeAuthSchritt(`auth-status-${daten.status}`);
          window.dispatchEvent(new CustomEvent("bwm:auth-signed-out"));
        }
      },
      (fehler) => {
        console.error("Profil konnte nicht geladen werden:", fehler);
      }
    );
  });

  /* ------------------------------------------------------------------------
     12. Benutzerverwaltung (nur für Admins) - öffentliche Schnittstelle für
         js/app.js, das diese Funktionen aus seinem "Benutzerverwaltung"-
         Bereich unter Einstellungen aufruft.
     ------------------------------------------------------------------------ */
  window.BenutzerVerwaltung = {
    // Abonniert die komplette Nutzerliste live. Nicht-Admins bekommen von
    // Firestore automatisch eine Fehlermeldung (siehe Security Rules) -
    // js/app.js ruft das deshalb nur auf, wenn istAdmin() true ist.
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

    setzeStatus(uid, neuerStatus) {
      return updateDoc(doc(db, "users", uid), { status: neuerStatus });
    },
    setzeRolle(uid, neueRolle) {
      return updateDoc(doc(db, "users", uid), { rolle: neueRolle });
    },
    setzeAdmin(uid, istAdminWert) {
      return updateDoc(doc(db, "users", uid), { isAdmin: !!istAdminWert });
    },
    setzeNotiz(uid, text) {
      return updateDoc(doc(db, "users", uid), { adminNote: text });
    },

    async loesche(uid) {
      // Löscht nur das Firestore-Profil. Das Firebase-Auth-Konto selbst
      // (E-Mail + Passwort) kann aus dem Browser heraus technisch NICHT
      // gelöscht werden (nur die Person selbst, oder ein Server mit
      // Admin-Rechten). Die Person könnte sich also theoretisch weiterhin
      // mit ihrem alten Passwort anmelden, würde dann aber automatisch
      // wieder beim "Benutzernamen wählen"-Schritt landen, weil ihr Profil
      // fehlt - sie hat also KEINEN Zugriff mehr auf die eigentliche App.
      return deleteDoc(doc(db, "users", uid));
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
    },

    // Admin legt direkt einen neuen, bereits freigegebenen Account an -
    // ohne dass die Person sich selbst registrieren muss. Läuft über eine
    // ZWEITE, temporäre Firebase-Instanz, damit die eigene Admin-Sitzung
    // währenddessen nicht beeinflusst/abgemeldet wird.
    async erstelleNeuenBenutzer({ username, email, rolle }) {
      const frei = await istBenutzernameFrei(username);
      if (!frei) {
        throw new Error("Dieser Benutzername ist bereits vergeben.");
      }

      // Zufälliges Wegwerf-Passwort - niemand bekommt es je zu sehen, die
      // neue Person setzt sich gleich per E-Mail ein eigenes Passwort.
      const zufallsPasswort =
        (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Math.random())) + Date.now();

      const tempApp = initializeApp(firebaseConfig, "bwmAdminCreate-" + Date.now());
      const tempAuth = getAuth(tempApp);

      try {
        const cred = await createUserWithEmailAndPassword(tempAuth, email, zufallsPasswort);
        const neueUid = cred.user.uid;

        await setDoc(doc(db, "users", neueUid), {
          username: username.trim(),
          rolle: rolle || "Anwärter",
          isAdmin: false,
          status: "approved", // vom Admin direkt erstellt = bereits geprüft
          createdAt: serverTimestamp(),
          lastLogin: null,
          adminNote: "",
        });
        await setDoc(doc(db, "usernames", benutzernameSchluessel(username)), { uid: neueUid });

        // Firebase verschickt automatisch eine "Passwort festlegen"-E-Mail -
        // dafür ist keine eigene E-Mail-Infrastruktur nötig.
        await sendPasswordResetEmail(tempAuth, email);

        await signOut(tempAuth);
      } finally {
        deleteApp(tempApp).catch(() => {});
      }
    },
  };
}

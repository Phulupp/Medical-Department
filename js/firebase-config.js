/* ==========================================================================
   Firebase-Konfiguration
   ==========================================================================
   Deine Projektdaten sind hier bereits eingetragen.

   WICHTIG: Im Firebase-Projekt muss unter "Sicherheit -> Authentication ->
   Sign-in method" der Anbieter "Anonym" (Anonymous) aktiviert sein - NICHT
   E-Mail/Passwort. Die App nutzt einen unsichtbaren anonymen Login im
   Hintergrund, damit die Firestore-Datenbank geschützt bleibt, während der
   sichtbare Zugang über das gemeinsame Website-Passwort läuft (siehe
   js/app.js, Konstante SITE_PASSWORD).
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyA_spF1gyUXiupaHqeo1Di1MZDq44XD9jY",
  authDomain: "medical-department-bc265.firebaseapp.com",
  projectId: "medical-department-bc265",
  storageBucket: "medical-department-bc265.firebasestorage.app",
  messagingSenderId: "585178618283",
  appId: "1:585178618283:web:6ab4b6086011dd4ca79aee",
};

// Firebase initialisieren (wird von app.js verwendet)
// Defensive Prüfung: falls das Firebase-SDK nicht geladen werden konnte
// (z. B. keine Internetverbindung), soll die Seite trotzdem nicht komplett
// abstürzen - app.js zeigt dann automatisch den Konfigurationshinweis an.
let auth = null;
let db = null;

if (typeof firebase !== "undefined") {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
} else {
  console.warn(
    "Firebase-SDK konnte nicht geladen werden. Bitte Internetverbindung prüfen."
  );
}

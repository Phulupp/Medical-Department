/* ==========================================================================
   Firebase-Konfiguration
   ==========================================================================
   HIER TRÄGST DU DEINE EIGENEN FIREBASE-DATEN EIN.

   So findest du sie:
   1. console.firebase.google.com -> dein Projekt öffnen
   2. Zahnrad (oben links) -> "Projekteinstellungen"
   3. Runterscrollen zu "Meine Apps" -> deine Web-App auswählen
   4. Dort steht ein Block wie unten - einfach die Werte hier reinkopieren.

   WICHTIG: Diese Werte sind KEINE Geheimnisse, die man verstecken müsste -
   sie sagen dem Browser nur, mit welchem Firebase-Projekt er sich verbinden
   soll. Der eigentliche Schutz eurer Daten passiert über die Firestore-
   Sicherheitsregeln (siehe README.md).
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

/* ==========================================================================
   Firebase-Konfiguration
   ==========================================================================
   Deine Projektdaten sind hier bereits eingetragen.

   WICHTIG: Im Firebase-Projekt muss unter "Sicherheit -> Authentication ->
   Sign-in method" der Anbieter "E-Mail/Passwort" aktiviert sein (und
   "Google", falls du den Google-Login nutzen willst). Das echte Login-
   /Benutzersystem lebt in js/auth.js (eigenes Modul, moderne "Modular SDK"-
   Schreibweise) - diese Datei hier stellt nur die gemeinsamen Projektdaten
   bereit, die sowohl vom "alten" Compat-Code hier unten als auch von
   js/auth.js genutzt werden (siehe `window.firebaseConfig` weiter unten).
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyA_spF1gyUXiupaHqeo1Di1MZDq44XD9jY",
  authDomain: "medical-department-bc265.firebaseapp.com",
  projectId: "medical-department-bc265",
  storageBucket: "medical-department-bc265.firebasestorage.app",
  messagingSenderId: "585178618283",
  appId: "1:585178618283:web:6ab4b6086011dd4ca79aee",
};

// Macht dieselben Projektdaten auch für js/auth.js verfügbar (ein "const"
// in einem klassischen <script>-Tag ist für ein ES-Modul sonst nicht
// sichtbar) - so gibt es nur EINE Stelle, an der die Projektdaten gepflegt
// werden müssen, statt sie doppelt zu pflegen.
window.firebaseConfig = firebaseConfig;

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
  // Sicherheitsnetz: Firestore lehnt "undefined" als Feldwert normalerweise
  // komplett ab (auch verschachtelt in Arrays/Objekten) und verwirft dann
  // den GESAMTEN Speichervorgang, nicht nur das betroffene Feld - das hat
  // z. B. beim Medizin-Wiki dazu geführt, dass Änderungen an Kategorie
  // scheinbar "nicht gespeichert" wurden. Mit dieser Einstellung werden
  // undefined-Felder beim Speichern einfach stillschweigend weggelassen,
  // statt den ganzen Schreibvorgang fehlschlagen zu lassen.
  db.settings({ ignoreUndefinedProperties: true });
} else {
  console.warn(
    "Firebase-SDK konnte nicht geladen werden. Bitte Internetverbindung prüfen."
  );
}

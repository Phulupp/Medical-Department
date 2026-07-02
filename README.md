# Medical Department

Ein modernes Verwaltungsprogramm für das Medical Department im **RedM Roleplay**.
Login/Registrierung + Medikamentenliste werden über **Firebase** in Echtzeit
zwischen allen Mitarbeitern synchronisiert (z. B. Heinrich & Grete sehen
dieselben, live aktuellen Daten – egal auf welchem PC).

## ✨ Funktionen

- **Zugang per gemeinsamem Passwort + Namensauswahl** (kein Account-Login, kein `prompt()`)
- **„Wer ist online“-Anzeige** oben in der App, live in Echtzeit
- **Echtzeit-Synchronisierung**: Änderungen sind sofort bei allen Mitarbeitern sichtbar
- **Sidebar-Navigation**: Medikamente, Mitarbeiter (mit Online-Status), Einstellungen (Platzhalter)
- **Medikamententabelle**: Name, Preis, Menge, automatische Zwischensumme pro Zeile
- **Medikamente hinzufügen / löschen / Preise bearbeiten**
- **Automatische Gesamtsumme** (Live-Statistik-Karten)
- **Info-Panel** mit Wirkung/Einsatzgebiet jedes Medikaments (ein-/ausklappbar)
- **Suchfeld** zum schnellen Filtern
- **Eigene, gestaltete Dialogfenster** statt `prompt()`/`confirm()`

## 📁 Projektstruktur

```
Medical_Department/
│
├── index.html              # Struktur: Login, Sidebar, Topbar, Tabelle, Modale
├── css/
│   └── style.css           # Gesamtes Design (Pastellfarben, große runde Elemente)
├── js/
│   ├── firebase-config.js  # HIER TRAGST DU DEINE FIREBASE-DATEN EIN
│   └── app.js               # Logik: Auth, Firestore-Sync, Rendering, Modale
├── assets/                   # Für eigene Icons/Bilder
└── README.md
```

## 🚀 Einrichtung (einmalig, ca. 10 Minuten)

### 1. Firebase-Projekt erstellen
1. Gehe zu [console.firebase.google.com](https://console.firebase.google.com/)
2. „Projekt hinzufügen“ → Namen eingeben (z. B. `medical-department`) → erstellen

### 2. Anonymen Zugang aktivieren
- **Sicherheit → Authentication** → „Los geht's" → Tab „Sign-in method" → Anbieter **„Anonym"** aktivieren

> Warum "Anonym"? Der sichtbare Zugang läuft über ein gemeinsames Website-Passwort (siehe unten), nicht über einzelne E-Mail-Konten. Im Hintergrund meldet sich die App trotzdem anonym bei Firebase an, damit die Datenbank vor Fremdzugriff geschützt bleibt.

### 3. Datenbank erstellen
- **Datenbanken und Speicher → Firestore** → „Datenbank erstellen" → Standort wählen (z. B. `europe-west3`) → **Testmodus** starten

### 4. Sicherheitsregeln setzen
Im Firestore-Bereich → Tab **„Regeln“** → Inhalt ersetzen durch:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

→ „Veröffentlichen“ klicken. (Das bedeutet: Nur eingeloggte Mitarbeiter dürfen Daten lesen/schreiben.)

### 5. Web-App registrieren & Konfiguration kopieren
1. Zahnrad → „Projekteinstellungen“ → runter zu „Meine Apps“ → **`</>`** (Web)
2. Spitznamen eingeben, **kein** Firebase Hosting aktivieren, „App registrieren“
3. Den angezeigten `firebaseConfig`-Block **komplett** in `js/firebase-config.js` einfügen (die Platzhalter-Werte ersetzen)

### 6. Online stellen (GitHub Pages)
Firebase Login funktioniert zuverlässig nur über `http(s)`, nicht beim direkten Doppelklick auf die Datei. Daher:

1. Projekt zu GitHub hochladen (siehe unten)
2. Im Repository: **Settings → Pages** → „Deploy from branch“ → Branch `main`, Ordner `/root` → Speichern
3. Die von GitHub angezeigte Adresse (z. B. `https://dein-name.github.io/Medical-Department/`) im Firebase-Projekt eintragen:
   **Authentication → Settings → Authorized domains → „Domain hinzufügen“** → dort die GitHub-Pages-Adresse (ohne `https://`) eintragen

Danach ist die App unter der GitHub-Pages-Adresse für dich **und** Grete nutzbar – jeder registriert sich einmal mit eigener E-Mail, eigenem Passwort, Namen und Position.

> **Lokal testen ohne GitHub Pages:** In VS Code die Erweiterung „Live Server" installieren und `index.html` per Rechtsklick → „Open with Live Server" öffnen (läuft dann über `http://127.0.0.1`, funktioniert mit Firebase Login).

## 🔑 Zugangspasswort ändern

Das gemeinsame Website-Passwort steht in `js/app.js` ganz oben:

```js
const SITE_PASSWORD = "Otter1311";
```

Einfach den Wert ändern, Datei speichern und wieder hochladen (siehe Schritt 2).

## 🧑‍⚕️ Weitere Mitarbeiter hinzufügen

Bekannte Namen (mit automatisch zugewiesener Position) stehen ebenfalls in `js/app.js`:

```js
const STAFF_LIST = [
  { id: "heinrich", name: "Heinrich Hornhausen", rolle: "Chefarzt" },
  { id: "grete", name: "Grete Hornhausen", rolle: "Stellv. Chefärztin" },
];
```

Neue Zeile nach demselben Muster ergänzen, dann erscheint die Person auch in der Namensauswahl beim Betreten und in der Mitarbeiter-Ansicht. Wer nicht in dieser Liste steht, kann sich trotzdem über „Andere Person..." mit freiem Namen anmelden (erscheint dann als „Mitarbeiter").


## 💊 Standard-Medikamente

Wird beim allerersten Start automatisch in Firestore angelegt:

| Medikament            | Preis | Hinweis |
|------------------------|-------|---------|
| Bandage                | 2$    | Überbrückt Zeit bei Schusswunde |
| Adrenalinspritze       | 3$    | Nur bei Bewusstlosigkeit/Notfall |
| Cola                   | 1$    | Herz-Kreislauf & Ausdauer |
| Schiene                | 2$    | Behandlung von Brüchen |
| Riechsalz              | 8$    | 8$ Bürger / 6$ Departments |
| Schlangengift          | 2$    | Gegengift bei Schlangenbissen |
| Impfung                | 5$    | Schutz gegen Krankheiten |
| Heilsalbe              | 3$    | Gegen Prellungen |
| Fruchtbarkeitssalbe    | 1$    | Für Rancher |
| Vitaminspritze         | 1$    | Für Rancher |

Kann danach beliebig über die Oberfläche erweitert, bearbeitet und gelöscht werden – Änderungen sind sofort bei allen Mitarbeitern sichtbar.

## 🔧 Technisches

- Kein Framework, kein Build-Prozess – Vanilla HTML/CSS/JavaScript
- **Firebase Authentication** (E-Mail/Passwort) für Login & Registrierung
- **Cloud Firestore** als Echtzeit-Datenbank (Medikamentenliste + Mitarbeiterprofile)
- `localStorage` dient nur noch als Offline-Fallback/Zwischenspeicher
- Code ist durchgehend kommentiert (deutsch)

## 📌 Geplante Erweiterungen

- Einstellungen (z. B. Rabatte, Rollen-Rechte)
- Bearbeiten/Entfernen von Mitarbeitern direkt in der Oberfläche

/* ==========================================================================
   Ärztekammer – App-Logik
   Zugang: echtes Login-/Benutzersystem mit eigenen Accounts (E-Mail/Passwort
   oder Google), siehe js/auth.js für den kompletten Anmelde-/Registrierungs-
   Code (moderne "Modular SDK"-Schreibweise, eigenes Modul). Diese Datei hier
   (js/app.js) bleibt bei der "Compat"-Schreibweise für alles andere
   (Medikamente, Wiki, Personal, Kontakte, ...) und wartet nur auf ein Signal
   von js/auth.js ("bwm:auth-approved"), sobald jemand eingeloggt UND von
   einem Admin freigegeben ist - siehe Abschnitt 6 weiter unten.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     1. Konstanten
     ------------------------------------------------------------------------ */
  // Rollen, die Medikamente löschen UND beide Mitarbeiter-Listen verwalten dürfen
  const ADMIN_ROLLEN = ["Ärztliche Direktion", "Chefarzt", "Stellv. Chefarzt"];

  // Ränge (gemeinsam genutzt für Login-Verwaltung UND Stations-Verwaltung)
  const STATIONS_RAENGE = ["Anwärter", "Assistenzarzt", "Facharzt", "Stellv. Oberarzt", "Oberarzt", "Stellv. Chefarzt", "Chefarzt"];

  // Alle 8 Standardränge inkl. "Ärztliche Direktion" - für die
  // Benutzerverwaltung (Rang ist rein organisatorisch, unabhängig von
  // Admin-Rechten). Reihenfolge entspricht dem <select> in index.html.
  const BENUTZER_RAENGE = [
    "Anwärter",
    "Assistenzarzt",
    "Facharzt",
    "Stellv. Oberarzt",
    "Oberarzt",
    "Stellv. Chefarzt",
    "Chefarzt",
    "Ärztliche Direktion",
  ];

  // Die drei tatsächlich existierenden Standorte der Black Wolf Medical.
  // "Ärztliche Direktion" ist bewusst KEIN eigener Standort mehr, sondern
  // eine übergeordnete Funktion, die ein Mitarbeiter zusätzlich zu seinem
  // Standort/Rang innehaben kann (siehe Feld "direktion" je Mitarbeiter-Slot
  // weiter unten) - so kann z. B. Chris Moon gleichzeitig Chefarzt von
  // Rhodes UND Ärztlicher Direktor sein, ohne doppelt in der Liste zu stehen.
  const STATIONEN = {
    rhodes: { label: "Rhodes", max: 8 },
    blackwater: { label: "Blackwater", max: 8 },
    valentine: { label: "Valentine", max: 8 },
  };

  // Kleine, zurückhaltende Icons (Strichzeichnung, "currentColor") für die
  // Personal-Seite - bewusst kein Emoji, damit es zur ruhigen, hochwertigen
  // Anmutung des restlichen Redesigns passt.
  const ICON_CADUCEUS =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"></line><circle cx="12" cy="4.5" r="1.5" fill="currentColor" stroke="none"></circle><path d="M6 8c2.5 1.5 2.5 3.5 0 5 2.5 1.5 2.5 3.5 0 5"></path><path d="M18 8c-2.5 1.5-2.5 3.5 0 5-2.5 1.5-2.5 3.5 0 5"></path></svg>';
  const ICON_PIN =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.7-6.5-11A6.5 6.5 0 0 1 12 3.5 6.5 6.5 0 0 1 18.5 10c0 5.3-6.5 11-6.5 11Z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>';
  // Weitere zurückhaltende Strich-Icons für kleine Aktions-Buttons
  // (Bearbeiten/Löschen/Gesperrt) - ersetzen die vorher genutzten Emojis.
  const ICON_EDIT =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
  const ICON_TRASH =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"></path><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
  const ICON_LOCK =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="1.5"></rect><path d="M8 11V7.5a4 4 0 0 1 8 0V11"></path></svg>';
  // Greif-Punkt-Icon für Drag & Drop (Reihenfolge der Medikamente per Maus verschieben)
  const ICON_DRAG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.4"></circle><circle cx="15" cy="6" r="1.4"></circle><circle cx="9" cy="12" r="1.4"></circle><circle cx="15" cy="12" r="1.4"></circle><circle cx="9" cy="18" r="1.4"></circle><circle cx="15" cy="18" r="1.4"></circle></svg>';
  // Kleines Personen-Symbol für die Mitarbeiterzahl je Standort (Praxisleitung)
  const ICON_USERS =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 19c0-3 3-5 6-5s6 2 6 5"></path><circle cx="8.5" cy="8" r="3.2"></circle><path d="M14.2 4.3c1.6 0.4 2.8 1.9 2.8 3.7 0 1.8-1.2 3.3-2.8 3.7"></path><path d="M15.5 14.1c2.7 0.4 5 2.3 5 4.9"></path></svg>';
  // Info-Symbol für den Hinweis-Kasten unterhalb der Mitarbeiterliste
  const ICON_INFO =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16.5"></line><circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none"></circle></svg>';
  // Kleines "x" zum Entfernen eines Badges aus dem Katalog (Bearbeiten-Modus)
  const ICON_X_KLEIN =
    '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line></svg>';

  // Icon-Set für die Badges der Mitarbeiter (medizinische Fachgebiete +
  // interne Zuständigkeiten). Zurückhaltende Strichzeichnungen, passend zum
  // restlichen Icon-Stil dieser Seite. Zusätzliche, von Admins selbst neu
  // angelegte Badges (die hier nicht aufgeführt sind) bekommen automatisch
  // das generische Etiketten-Icon (siehe badgeIcon() weiter unten).
  const BADGE_ICONS = {
    allgemeinmedizin:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4v7a5 5 0 0 0 10 0V4"></path><line x1="19" y1="6" x2="19" y2="10"></line><circle cx="19" cy="12.3" r="1.7"></circle></svg>',
    chirurgie:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5 8.5 15.5"></path><path d="M8.5 15.5 5 19"></path><circle cx="6.3" cy="17.7" r="1.4"></circle><path d="M14 5l5 5"></path></svg>',
    zahnheilkunde:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4c-2.6 0-4.6 1.7-4.6 4.3 0 2.7 1 4 1.3 6.7.2 1.7.7 3 1.6 3 1.1 0 1-2.6 1.7-4 .7 1.4.6 4 1.7 4 .9 0 1.4-1.3 1.6-3 .3-2.7 1.3-4 1.3-6.7C16.6 5.7 14.6 4 12 4Z"></path></svg>',
    pharmazie:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="6" rx="3"></rect><line x1="12" y1="9" x2="12" y2="15"></line></svg>',
    ausbilder:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8.5 12 4l9.5 4.5-9.5 4.5-9.5-4.5Z"></path><path d="M6.5 10.6v4.4c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.4"></path></svg>',
    verwaltung:
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="1.5"></rect><path d="M9 4V3.3A1.3 1.3 0 0 1 10.3 2h3.4A1.3 1.3 0 0 1 15 3.3V4"></path><line x1="9" y1="10" x2="15" y2="10"></line><line x1="9" y1="13.5" x2="15" y2="13.5"></line><line x1="9" y1="17" x2="13" y2="17"></line></svg>',
  };
  // Generisches Etiketten-Icon für Badges ohne eigenes Symbol (z. B. neu
  // angelegte, individuelle Badges eines Admins).
  const ICON_BADGE_GENERISCH =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.6 3H5a2 2 0 0 0-2 2v6.6c0 .5.2 1 .6 1.4l8.4 8.4c.8.8 2 .8 2.8 0l6.6-6.6c.8-.8.8-2 0-2.8L12.9 3.6c-.4-.4-.9-.6-1.3-.6Z"></path><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"></circle></svg>';

  function badgeIcon(label) {
    const key = (label || "").trim().toLowerCase();
    return BADGE_ICONS[key] || ICON_BADGE_GENERISCH;
  }

  // Standard-Mitarbeiter-/Stationsliste: FESTE Anzahl Plätze je Station
  // (reines Organisations-Tool für die Mitarbeiter-Seite - hat NICHTS mit
  // dem Login zu tun). Leere Plätze haben name: "". Jeder Platz trägt neben
  // Name/Rang zusätzlich zwei getrennte Badge-Felder - "specialties" für
  // medizinische Fachgebiete und "badges" für interne Zuständigkeiten (siehe
  // Kommentar bei PERSONAL_BADGES_DOC weiter unten) - sowie das Feld
  // "direktion": true/false für die Zugehörigkeit zur Ärztlichen Direktion.
  function erzeugeLeereStation(anzahl) {
    const plaetze = [];
    for (let i = 0; i < anzahl; i++) plaetze.push(neuerLeererPlatz());
    return plaetze;
  }

  function neuerLeererPlatz() {
    return { name: "", rolle: "Anwärter", specialties: [], badges: [], direktion: false };
  }

  const DEFAULT_STATIONEN = {
    rhodes: [
      { name: "Chris Moon", rolle: "Chefarzt", specialties: ["Allgemeinmedizin", "Chirurgie"], badges: ["Verwaltung", "Ausbilder"], direktion: true },
      ...erzeugeLeereStation(7),
    ],
    blackwater: erzeugeLeereStation(8),
    valentine: erzeugeLeereStation(8),
  };

  // Standard-Badge-Katalog - siehe PERSONAL_BADGES_DOC. Bewusst in zwei
  // getrennte Listen aufgeteilt (medizinische Fachgebiete vs. interne
  // Zuständigkeiten), damit sich später z. B. leicht "alle mit Fachgebiet
  // Chirurgie" filtern lässt, ohne beides vermischen zu müssen.
  const DEFAULT_PERSONAL_BADGES = {
    fachgebiete: ["Allgemeinmedizin", "Chirurgie", "Zahnheilkunde", "Pharmazie"],
    zustaendigkeiten: ["Ausbilder", "Verwaltung"],
  };

  const STORAGE_KEY_LEGACY = "medicalDepartment.medikamente.v1";
  const STORAGE_KEY_V2 = "medicalDepartment.medikamente.v2";

  const MEDIKAMENTE_DOC = "department/medikamente";
  const MITARBEITER_DOC = "department/mitarbeiter";
  // Verwalteter Badge-Katalog (siehe Abschnitt 10b) - getrennt in
  // medizinische Fachgebiete ("fachgebiete") und interne Zuständigkeiten
  // ("zustaendigkeiten"). Admins können hier jederzeit neue Badges anlegen
  // oder bestehende entfernen, ganz ohne Code-Änderung.
  const PERSONAL_BADGES_DOC = "department/personal-badges";
  const INFOS_DOC = "department/infos";
  const PRESENCE_COLLECTION = "presence";
  const NOTIZEN_COLLECTION = "notizen";
  const VERKAUFSLOG_COLLECTION = "verkaufslog";
  const KONTAKTE_COLLECTION = "kontakte";
  // Verwalteter Rollen-Katalog für die Kontakte-Seite (Beruf/Rolle je
  // Kontakt) - Admins können hier jederzeit neue Rollen anlegen, bestehende
  // umbenennen (mit Kaskade auf betroffene Kontakte) oder löschen, ganz ohne
  // Code-Änderung. "Sonstiges" ist der feste Auffangwert für Kontakte, deren
  // gespeicherte Rolle nicht (mehr) im Katalog vorkommt - dafür ist beim
  // Löschen KEINE Kaskade nötig (siehe entferneKontaktRolle).
  const KONTAKTE_ROLLEN_DOC = "department/kontakte-rollen";
  const KONTAKTE_ROLLEN_FALLBACK = "Sonstiges";
  const DEFAULT_KONTAKTE_ROLLEN = ["Bürger", "Arzt", "Sheriff", "Rancher", "Schmied", "Schreiner", KONTAKTE_ROLLEN_FALLBACK];
  // Dezente, bereits im Design vorhandene Akzentfarben (siehe CSS-Variablen
  // --color-oxblood/-sage/-personal/-slate/-brass) - KEINE neuen Farben.
  // Jede Rolle bekommt darüber deterministisch (per Namens-Hash) eine davon
  // zugewiesen, damit die Badge-Farbe stabil bleibt, ohne pro Rolle manuell
  // eine Farbe pflegen zu müssen.
  const KONTAKT_ROLLEN_FARBEN = ["personal", "oxblood", "sage", "brass", "slate"];

  // Verwalteter Themen-Katalog für die Infos-Seite (Notizen) - NICHT zu
  // verwechseln mit den festen Reitern "Allgemeine Infos/Personal/
  // Herstellung" (NOTIZ_KATEGORIEN weiter unten, unverändert). "Thema" ist
  // ein zusätzliches, rein organisatorisches Etikett je Eintrag (Wichtig/
  // Information/Intern/Besprechung/Sonstiges), das Admins jederzeit ohne
  // Code-Änderung erweitern/umbenennen/löschen können - genau wie der
  // Beruf/Rolle-Katalog der Kontakte-Seite.
  const NOTIZEN_THEMEN_DOC = "department/notizen-themen";
  const NOTIZ_THEMA_FALLBACK = "Sonstiges";
  const DEFAULT_NOTIZ_THEMEN = ["Wichtig", "Information", "Intern", "Besprechung", NOTIZ_THEMA_FALLBACK];
  // Feste Start-Farbzuordnung (dieselben fünf bestehenden Akzentfarben wie
  // überall sonst) - für individuell von Admins angelegte Themen wird
  // deterministisch per Namens-Hash eine davon verwendet.
  const NOTIZ_THEMA_FARBEN_STANDARD = {
    Wichtig: "brass",
    Information: "personal",
    Intern: "sage",
    Besprechung: "personal",
    Sonstiges: "slate",
  };
  const NOTIZ_THEMA_FARBEN = ["brass", "personal", "sage", "oxblood", "slate"];
  const NOTIZEN_SEITENGROESSE = 5; // Einträge je Pagination-Seite

  // Verwalteter Kategorien-Katalog für die Medizin-Wiki-Seite - vorher waren
  // Kategorien reine Freitext-Werte (nur per <datalist> als Vorschlag), jetzt
  // liegt der Katalog in Firestore und Admins können Kategorien anlegen,
  // umbenennen (mit Kaskade auf betroffene Wiki-Einträge) oder löschen -
  // genau wie beim Themen-Katalog der Infos-Seite/Rollen-Katalog der
  // Kontakte-Seite. "Sonstiges" ist wieder der feste, löschsichere
  // Auffangwert für Einträge ohne (mehr) gültige Kategorie.
  const WIKI_KATEGORIEN_DOC = "department/wiki-kategorien";
  const WIKI_KATEGORIE_FALLBACK = "Sonstiges";
  const DEFAULT_WIKI_KATEGORIEN = ["Allgemeine Medizin", "Impfungen", "Veterinärmedizin", WIKI_KATEGORIE_FALLBACK];
  const WIKI_KATEGORIE_FARBEN_STANDARD = {
    "Allgemeine Medizin": "slate",
    Impfungen: "sage",
    Veterinärmedizin: "brass",
    Sonstiges: "slate",
  };
  const WIKI_KATEGORIE_FARBEN = ["brass", "personal", "sage", "oxblood", "slate"];
  const WIKI_SEITENGROESSE = 8; // Einträge je Pagination-Seite (siehe Mockup)

  const ANKUENDIGUNGEN_COLLECTION = "ankuendigungen";
  const HANDBUCH_COLLECTION = "handbuch";
  const ONLINE_SCHWELLE_MS = 45 * 1000;   // Nach 45s ohne Update gilt jemand als offline
  const HEARTBEAT_INTERVALL_MS = 20 * 1000;

  // Ränge, für die der Reiter "Handbuch" (interne Dokumentenbibliothek)
  // überhaupt sichtbar ist - unabhängig von den Admin-Rechten (isAdmin),
  // die stattdessen die BEARBEITUNG einzelner Dokumente steuern (siehe
  // istAdmin() weiter unten). Zusätzlich serverseitig in firestore.rules
  // abgesichert, damit ein nicht berechtigter Nutzer selbst über die
  // Konsole/Firestore direkt nicht an die Inhalte kommt.
  const HANDBUCH_SICHTBARE_RAENGE = [
    "Stellv. Oberarzt",
    "Oberarzt",
    "Stellv. Chefarzt",
    "Chefarzt",
    "Ärztliche Direktion",
  ];

  const DEFAULT_MEDIKAMENTE = [
    { id: "bandage", name: "Bandage", preis: 2, menge: 0, beschreibung: "Heilt nicht direkt, überbrückt aber die Zeit bei einer Schusswunde." },
    { id: "adrenalinspritze", name: "Adrenalinspritze", preis: 3, menge: 0, beschreibung: "Heilt alles – sollte nur bei Bewusstlosigkeit oder im Notfall genutzt werden." },
    { id: "cola", name: "Cola", preis: 1, menge: 0, beschreibung: "Stärkt Herz-Kreislauf und Ausdauer." },
    { id: "schiene", name: "Schiene", preis: 2, menge: 0, beschreibung: "Für die Behandlung von Brüchen." },
    { id: "riechsalz", name: "Riechsalz", preis: 8, menge: 0, beschreibung: "Wirkt wie die Adrenalinspritze, aber schwächer. Verkauf an Bürger ist begrenzt.", hinweis: "8$ für Bürger · 6$ für Departments" },
    { id: "schlangengift", name: "Schlangengift", preis: 2, menge: 0, beschreibung: "Gegengift – hilft gegen Schlangenbisse." },
    { id: "impfung", name: "Impfung", preis: 5, menge: 0, beschreibung: "Schützt gegen Krankheiten." },
    { id: "heilsalbe", name: "Heilsalbe", preis: 3, menge: 0, beschreibung: "Hilft gegen Prellungen." },
    { id: "fruchtbarkeitssalbe", name: "Fruchtbarkeitssalbe", preis: 1, menge: 0, beschreibung: "Für Rancher." },
    { id: "vitaminspritze", name: "Vitaminspritze", preis: 1, menge: 0, beschreibung: "Für Rancher." },
  ];

  // Seed-Daten für die eigenständige Infos-Seite (Wirkung/Einsatzgebiet).
  // Unabhängig von der Medikamentenliste - Admins können hier frei weitere
  // Einträge hinzufügen oder entfernen.
  const DEFAULT_INFOS = [
    { id: "bandage", titel: "Bandage", text: "Heilt nicht direkt, überbrückt aber die Zeit bei einer Schusswunde." },
    { id: "adrenalinspritze", titel: "Adrenalinspritze", text: "Heilt alles – sollte nur bei Bewusstlosigkeit oder im Notfall genutzt werden." },
    { id: "cola", titel: "Cola", text: "Stärkt Herz-Kreislauf und Ausdauer." },
    { id: "schiene", titel: "Schiene", text: "Für die Behandlung von Brüchen." },
    { id: "riechsalz", titel: "Riechsalz", text: "Wirkt wie die Adrenalinspritze, aber schwächer. Verkauf an Bürger ist begrenzt.", hinweis: "8$ für Bürger · 6$ für Departments" },
    { id: "schlangengift", titel: "Schlangengift", text: "Gegengift – hilft gegen Schlangenbisse." },
    { id: "impfung", titel: "Impfung", text: "Schützt gegen Krankheiten." },
    { id: "heilsalbe", titel: "Heilsalbe", text: "Hilft gegen Prellungen." },
    { id: "fruchtbarkeitssalbe", titel: "Fruchtbarkeitssalbe", text: "Für Rancher." },
    { id: "vitaminspritze", titel: "Vitaminspritze", text: "Für Rancher." },
  ];

  // Seed-Daten für das Handbuch (interne Dokumentenbibliothek). Werden nur
  // einmalig angelegt, falls die Firestore-Collection "handbuch" noch leer
  // ist (siehe seedeHandbuchStandarddokumente weiter unten) - danach lebt
  // der Inhalt ausschließlich in Firestore und wird von Admins über den
  // eingebauten Rich-Text-Editor gepflegt.
  const DEFAULT_HANDBUCH_DOKUMENTE = [
    {
      id: "einarbeitungsleitfaden",
      titel: "Einarbeitungsleitfaden",
      beschreibung: "Ablauf und Grundlagen für neue Mitglieder der Black Wolf Medical.",
      reihenfolge: 1,
      inhalt:
        "<h1>Einarbeitungsleitfaden</h1>" +
        "<p>Dieser Leitfaden begleitet neue Mitglieder der Black Wolf Medical durch die ersten Wochen im Dienst. Er ersetzt keine mündliche Einweisung durch die Stationsleitung, fasst aber die wichtigsten Grundlagen verbindlich zusammen.</p>" +
        "<h2>Erste Schritte</h2>" +
        "<ul>" +
        "<li>Zugang zur Registratur einrichten und mit der eigenen Rolle vertraut machen.</li>" +
        "<li>Vorstellung bei der zuständigen Stationsleitung der eigenen Station.</li>" +
        "<li>Bestandsaufnahme des Medikamentenschranks gemeinsam mit einem erfahrenen Kollegen.</li>" +
        "<li>Teilnahme an mindestens einer begleiteten Schicht vor dem ersten Alleindienst.</li>" +
        "</ul>" +
        "<h2>Aufgaben in der Einarbeitungszeit</h2>" +
        "<p>Anwärter und Assistenzärzte übernehmen zu Beginn ausschließlich Aufgaben unter Aufsicht: Grundversorgung, Dokumentation im Verkaufslog sowie die Pflege der Notizen. Eigenständige Entscheidungen bei schweren Fällen bleiben erfahrenerem Personal vorbehalten, bis die Stationsleitung die Freigabe erteilt.</p>" +
        "<hr>" +
        "<h2>Verhalten gegenüber Patienten</h2>" +
        "<p>Jede Behandlung erfolgt ruhig, sachlich und unabhängig davon, wer die Person ist. Auskünfte über Patienten werden ausschließlich innerhalb der Black Wolf Medical und niemals gegenüber Dritten weitergegeben.</p>" +
        "<h2>Ansprechpartner</h2>" +
        "<p>Bei Fragen zur Einarbeitung wenden sich neue Mitglieder zunächst an die eigene Stationsleitung, bei grundsätzlichen Fragen an die Ärztliche Direktion.</p>",
    },
    {
      id: "dienstvorschriften",
      titel: "Dienstvorschriften",
      beschreibung: "Verbindliche Regeln für den laufenden Dienstbetrieb.",
      reihenfolge: 2,
      inhalt:
        "<h1>Dienstvorschriften</h1>" +
        "<p>Diese Vorschriften gelten für alle Mitglieder der Black Wolf Medical, unabhängig von Rang und Station, und regeln den laufenden Dienstbetrieb.</p>" +
        "<h2>Verhalten im Dienst</h2>" +
        "<ul>" +
        "<li>Pünktliches Erscheinen zur vereinbarten Schicht, Abwesenheiten rechtzeitig bei der Stationsleitung melden.</li>" +
        "<li>Vollständige und wahrheitsgemäße Dokumentation jeder Behandlung und jedes Verkaufs.</li>" +
        "<li>Sorgfältiger Umgang mit Medikamenten und Ausrüstung, Bestände regelmäßig kontrollieren.</li>" +
        "</ul>" +
        "<h2>Umgang mit Medikamenten</h2>" +
        "<p>Medikamente werden ausschließlich zu den in der Preisliste festgelegten Konditionen abgegeben. Abweichende Konditionen bedürfen der vorherigen Zustimmung der Stationsleitung.</p>" +
        "<hr>" +
        "<h2>Meldepflichten</h2>" +
        "<p>Besondere Vorkommnisse - etwa Zwischenfälle mit Patienten, Verluste von Ausrüstung oder Konflikte mit anderen Institutionen - werden umgehend über die Notizen-Seite oder direkt an die Stationsleitung gemeldet.</p>" +
        "<h2>Zusammenarbeit mit anderen Institutionen</h2>" +
        "<p>Die Zusammenarbeit mit Sheriff-Department und weiteren Institutionen erfolgt stets höflich und zurückhaltend. Auskünfte über Patienten werden nur im gesetzlich bzw. organisatorisch vorgesehenen Rahmen erteilt.</p>" +
        "<h2>Konsequenzen bei Verstößen</h2>" +
        "<p>Verstöße gegen diese Dienstvorschriften werden von der Stationsleitung oder der Ärztlichen Direktion bewertet und können je nach Schwere von einem klärenden Gespräch bis zur Beendigung der Mitgliedschaft reichen.</p>",
    },
    {
      id: "befoerderungsrichtlinien",
      titel: "Beförderungsrichtlinien",
      beschreibung: "Voraussetzungen und Ablauf für Beförderungen innerhalb der Rangstruktur.",
      reihenfolge: 3,
      inhalt:
        "<h1>Beförderungsrichtlinien</h1>" +
        "<p>Diese Richtlinien regeln, unter welchen Voraussetzungen Mitglieder der Black Wolf Medical in einen höheren Rang befördert werden.</p>" +
        "<h2>Rangstruktur</h2>" +
        "<ul>" +
        "<li>Anwärter</li>" +
        "<li>Assistenzarzt</li>" +
        "<li>Facharzt</li>" +
        "<li>Stellv. Oberarzt</li>" +
        "<li>Oberarzt</li>" +
        "<li>Stellv. Chefarzt</li>" +
        "<li>Chefarzt</li>" +
        "<li>Ärztliche Direktion</li>" +
        "</ul>" +
        "<h2>Voraussetzungen</h2>" +
        "<p>Eine Beförderung setzt in der Regel eine angemessene Zeit im aktuellen Rang, zuverlässige Anwesenheit sowie eine saubere Dienstführung ohne offene Verstöße gegen die Dienstvorschriften voraus.</p>" +
        "<hr>" +
        "<h2>Bewertungskriterien</h2>" +
        "<ol>" +
        "<li>Fachliche und organisatorische Zuverlässigkeit im Dienst.</li>" +
        "<li>Verhalten gegenüber Patienten, Kollegen und anderen Institutionen.</li>" +
        "<li>Bereitschaft, Verantwortung für Station und Einarbeitung neuer Mitglieder zu übernehmen.</li>" +
        "</ol>" +
        "<h2>Ablauf</h2>" +
        "<p>Beförderungen ab dem Rang Stellv. Oberarzt werden ausschließlich von Chefarzt, Stellv. Chefarzt oder der Ärztlichen Direktion entschieden und in der Benutzerverwaltung hinterlegt. Beförderungen unterhalb dieser Schwelle können von der jeweiligen Stationsleitung vorgeschlagen werden.</p>",
    },
  ];

  /* ------------------------------------------------------------------------
     2. Anwendungsstatus
     ------------------------------------------------------------------------ */
  let medikamente = [];
  let suchbegriff = "";
  let medikamenteSortierModus = false; // Erst nach Klick auf "Reihenfolge bearbeiten" per Drag & Drop sortierbar
  let ziehId = null;                   // ID des Medikaments, das gerade per Drag & Drop verschoben wird
  let aktivesMedikamentId = null;
  let aktuellerNutzer = null;       // { uid, name, rolle, admin } - wird von js/auth.js per Event befüllt
  let unsubMedikamente = null;
  let unsubPresence = null;
  let unsubNotizen = null;
  let unsubVerkaufslog = null;
  let unsubMitarbeiter = null;
  let unsubPersonalBadges = null;
  let unsubBenutzerliste = null;
  let unsubInfos = null;
  let unsubAnkuendigungen = null;
  let unsubHandbuch = null;
  let handbuchDokumente = [];       // Live-Liste aller Handbuch-Dokumente (nur geladen, wenn berechtigt)
  let aktivesHandbuchDokumentId = null; // id des gerade geöffneten Dokuments (oder null = Übersicht)
  let handbuchSeedLaeuft = false;   // verhindert doppeltes Anlegen der Standarddokumente
  let stationenDaten = { blackwater: [], rhodes: [], valentine: [] }; // Feste Plätze je Standort
  // Verwalteter Badge-Katalog (siehe PERSONAL_BADGES_DOC) - wird beim Start
  // geladen und live aktuell gehalten, damit neue/entfernte Badges sofort
  // überall (Anzeige + Bearbeiten-Modus) sichtbar werden.
  let personalBadgesKatalog = { fachgebiete: [], zustaendigkeiten: [] };
  let unsubKontakteRollen = null;
  let kontakteRollenKatalog = [];  // Live-Liste der Rollen (siehe KONTAKTE_ROLLEN_DOC)
  let kontakteRollenFarben = {};   // Rolle -> Akzentfarbe (siehe KONTAKTE_ROLLEN_DOC), von Admins änderbar
  let aktiveKontaktRolle = "alle"; // Filter in der Kontakte-Sidebar ("alle" = kein Filter)
  let benutzerListe = [];          // Alle Accounts (nur für Admins geladen) - für die Benutzerverwaltung
  let bekanntePendingUids = null;  // null = Liste noch nie geladen (verhindert Toast beim allerersten Laden)
  let benutzerSuche = "";          // Suchbegriff im Admin Panel (Filter nach Benutzername)
  let aktiverDetailUid = null;     // uid des Benutzers, dessen Detail-Modal gerade offen ist (oder null)
  let unsubAdminLog = null;
  let adminLogEintraege = [];      // Die letzten Aktivitäts-Log-Einträge (nur für Admins geladen)
  let infosListe = [];             // Dynamische Infos-Seite
  let unsubWikiKategorien = null;
  let wikiKategorienKatalog = [];  // Live-Liste der Kategorien (siehe WIKI_KATEGORIEN_DOC)
  let wikiKategorienVerwaltungOffen = false; // Auf-/Zuklappen des Admin-Panels in der Sidebar
  let speicherTimer = null;
  let heartbeatTimer = null;
  let onlineRecomputeTimer = null;
  let letzterPresenceSnapshot = [];  // Zwischenspeicher für periodisches Neu-Berechnen
  let sessionId = null;              // Eindeutige ID pro Browser-Tab (für Presence-Dokument)

  /* ------------------------------------------------------------------------
     3. DOM-Referenzen
     ------------------------------------------------------------------------ */
  const el = {
    authScreen: document.getElementById("auth-screen"),
    appRoot: document.getElementById("app-root"),

    // Hinweis: Die Formulare für Login/Registrieren/Google/Status-Hinweise
    // werden komplett von js/auth.js gesteuert (eigenes Modul) - hier in
    // app.js brauchen wir davon keine DOM-Referenzen mehr.
    authConfigHint: document.getElementById("auth-config-hint"),

    onlineWidgetBtn: document.getElementById("online-widget-btn"),
    onlineCount: document.getElementById("online-count"),
    onlinePanel: document.getElementById("online-panel"),
    onlinePanelList: document.getElementById("online-panel-list"),

    userBadgeBtn: document.getElementById("user-badge-btn"),
    userAvatar: document.getElementById("user-avatar"),
    userName: document.getElementById("user-name"),
    userRole: document.getElementById("user-role"),
    userMenu: document.getElementById("user-menu"),
    btnLogout: document.getElementById("btn-logout"),

    staffGrid: document.getElementById("staff-grid"),
    staffSearchInput: document.getElementById("staff-search-input"),

    boardAdminForm: document.getElementById("board-admin-form"),
    formAnkuendigung: document.getElementById("form-ankuendigung"),
    ankuendigungInput: document.getElementById("ankuendigung-input"),
    boardList: document.getElementById("board-list"),
    boardEmpty: document.getElementById("board-empty"),

    formNote: document.getElementById("form-note"),
    notizTitelInput: document.getElementById("notiz-titel-input"),
    noteInput: document.getElementById("note-input"),
    notizThemaInput: document.getElementById("notiz-thema-input"),
    notizHervorhebenLabel: document.getElementById("notiz-hervorheben-label"),
    notizHervorhebenInput: document.getElementById("notiz-hervorheben-input"),
    notesList: document.getElementById("notes-list"),
    notesEmpty: document.getElementById("notes-empty"),
    notesThemaFilter: document.getElementById("notes-thema-filter"),
    notesSortSelect: document.getElementById("notes-sort-select"),
    btnToggleNotizenThemen: document.getElementById("btn-toggle-notizen-themen"),
    notizenThemenVerwaltung: document.getElementById("notizen-themen-verwaltung"),
    notesPagination: document.getElementById("notes-pagination"),

    formKontakt: document.getElementById("form-kontakt"),
    kontaktNummerInput: document.getElementById("kontakt-nummer-input"),
    kontaktNameInput: document.getElementById("kontakt-name-input"),
    kontaktBerufInput: document.getElementById("kontakt-beruf-input"),
    kontaktNotizInput: document.getElementById("kontakt-notiz-input"),
    kontaktList: document.getElementById("kontakt-list"),
    kontakteEmpty: document.getElementById("kontakte-empty"),
    kontakteNoResults: document.getElementById("kontakte-no-results"),
    kontakteSearch: document.getElementById("kontakte-search"),
    kontakteRollenListe: document.getElementById("kontakte-rollen-liste"),
    kontakteSchnellinfo: document.getElementById("kontakte-schnellinfo"),
    btnToggleKontakteRollen: document.getElementById("btn-toggle-kontakte-rollen"),
    kontakteRollenVerwaltung: document.getElementById("kontakte-rollen-verwaltung"),
    kontakteMainTitel: document.getElementById("kontakte-main-titel"),

    btnCheckout: document.getElementById("btn-checkout"),
    salesLogList: document.getElementById("sales-log-list"),
    salesLogEmpty: document.getElementById("sales-log-empty"),
    salesLogNoResults: document.getElementById("sales-log-no-results"),
    salesLogSearch: document.getElementById("sales-log-search"),
    formSaleEntry: document.getElementById("form-sale-entry"),
    saleKunde: document.getElementById("sale-kunde"),
    saleMedikament: document.getElementById("sale-medikament"),
    saleMenge: document.getElementById("sale-menge"),
    saleDatum: document.getElementById("sale-datum"),
    saleFormVerkaeufer: document.getElementById("sale-form-verkaeufer"),
    saleEntryError: document.getElementById("sale-entry-error"),
    btnAddToCart: document.getElementById("btn-add-to-cart"),
    saleCartEmpty: document.getElementById("sale-cart-empty"),
    saleCartItems: document.getElementById("sale-cart-items"),
    saleCartTotal: document.getElementById("sale-cart-total"),
    saleCartTotalValue: document.getElementById("sale-cart-total-value"),

    infosAdminForm: document.getElementById("infos-admin-form"),
    formAddInfo: document.getElementById("form-add-info"),
    infoEditingId: document.getElementById("info-editing-id"),
    infoFormTitle: document.getElementById("info-form-title"),
    infoFormSubmit: document.getElementById("info-form-submit"),
    infoFormCancel: document.getElementById("info-form-cancel"),
    infoTitelInput: document.getElementById("info-titel-input"),
    infoTextInput: document.getElementById("info-text-input"),
    infoHinweisInput: document.getElementById("info-hinweis-input"),
    infoKategorieInput: document.getElementById("info-kategorie-input"),
    wikiTableBody: document.getElementById("wiki-table-body"),
    wikiKategorienListe: document.getElementById("wiki-kategorien-liste"),
    btnToggleWikiKategorien: document.getElementById("btn-toggle-wiki-kategorien"),
    wikiKategorienVerwaltung: document.getElementById("wiki-kategorien-verwaltung"),
    wikiSchnellinfo: document.getElementById("wiki-schnellinfo"),
    wikiPagination: document.getElementById("wiki-pagination"),

    navAdminToggle: document.getElementById("nav-admin-toggle"),
    navAdminBadge: document.getElementById("nav-admin-badge"),
    viewAdmin: document.getElementById("view-admin"),
    viewAdminLog: document.getElementById("view-admin-log"),

    formAddBenutzer: document.getElementById("form-add-benutzer"),
    neuerBenutzerNameInput: document.getElementById("neuer-benutzer-name-input"),
    neuerBenutzerEmailInput: document.getElementById("neuer-benutzer-email-input"),
    neuerBenutzerRolleInput: document.getElementById("neuer-benutzer-rolle-input"),
    benutzerverwaltungSearchInput: document.getElementById("benutzerverwaltung-search-input"),
    benutzerverwaltungListe: document.getElementById("benutzerverwaltung-liste"),

    modalBenutzerDetails: document.getElementById("modal-benutzer-details"),
    benutzerDetailsName: document.getElementById("benutzer-details-name"),
    benutzerDetailsBody: document.getElementById("benutzer-details-body"),

    adminLogListe: document.getElementById("admin-log-liste"),

    navHandbuchToggle: document.getElementById("nav-handbuch-toggle"),
    handbuchListe: document.getElementById("handbuch-liste"),
    handbuchLeer: document.getElementById("handbuch-leer"),
    handbuchPlatzhalter: document.getElementById("handbuch-platzhalter"),
    handbuchDokumentAnsicht: document.getElementById("handbuch-dokument-ansicht"),
    handbuchBtnZurueck: document.getElementById("handbuch-btn-zurueck"),
    handbuchKopfTitel: document.getElementById("handbuch-kopf-titel"),
    handbuchKopfVersion: document.getElementById("handbuch-kopf-version"),
    handbuchKopfDatum: document.getElementById("handbuch-kopf-datum"),
    handbuchKopfBearbeiter: document.getElementById("handbuch-kopf-bearbeiter"),
    handbuchBtnBearbeiten: document.getElementById("handbuch-btn-bearbeiten"),
    handbuchInhaltAnzeige: document.getElementById("handbuch-inhalt-anzeige"),
    handbuchEditorWrapper: document.getElementById("handbuch-editor-wrapper"),
    handbuchEditorFeld: document.getElementById("handbuch-editor-feld"),
    handbuchBtnSpeichern: document.getElementById("handbuch-btn-speichern"),
    handbuchBtnAbbrechen: document.getElementById("handbuch-btn-abbrechen"),

    tableBody: document.getElementById("med-table-body"),
    emptyState: document.getElementById("empty-state"),
    searchInput: document.getElementById("search-input"),

    statCount: document.getElementById("stat-count"),
    statQuantity: document.getElementById("stat-quantity"),
    statTotal: document.getElementById("stat-total"),
    tableTotal: document.getElementById("table-total"),

    btnAddMedikament: document.getElementById("btn-add-medikament"),
    medKundeInput: document.getElementById("med-kunde-input"),
    modalStatistik: document.getElementById("modal-statistik"),
    modalAdd: document.getElementById("modal-add"),
    inputMedName: document.getElementById("input-med-name"),
    inputMedPrice: document.getElementById("input-med-price"),
    inputMedBeschreibung: document.getElementById("input-med-beschreibung"),
    addError: document.getElementById("add-error"),
    btnConfirmAdd: document.getElementById("btn-confirm-add"),

    modalEditPrice: document.getElementById("modal-edit-price"),
    editPriceName: document.getElementById("edit-price-name"),
    inputEditPrice: document.getElementById("input-edit-price"),
    editError: document.getElementById("edit-error"),
    btnConfirmEdit: document.getElementById("btn-confirm-edit"),

    modalDelete: document.getElementById("modal-delete"),
    deleteText: document.getElementById("delete-text"),
    btnConfirmDelete: document.getElementById("btn-confirm-delete"),

    toast: document.getElementById("toast"),

    navItems: document.querySelectorAll(".nav__item:not(.nav__item--parent)"),
    views: document.querySelectorAll(".view"),
    viewTitle: document.getElementById("view-title"),
    viewSubtitle: document.getElementById("view-subtitle"),
  };

  const VIEW_META = {
    start: { title: "Start", subtitle: "Schwarzes Brett – wichtige Ankündigungen" },
    medikamente: { title: "Medikamente", subtitle: "Übersicht & Verwaltung des Medikamentenbestands" },
    mitarbeiter: { title: "Personal", subtitle: "Verwaltung des medizinischen Personals" },
    handbuch: { title: "Handbuch", subtitle: "Interne Leitfäden, Richtlinien & Dokumentationen – nur für Stellv. Oberarzt und höher sichtbar" },
    kontakte: { title: "Kontakte", subtitle: "Telegramm-Verzeichnis – wer ist wer" },
    verkaufslog: { title: "Verkaufsliste", subtitle: "Verkäufe eintragen & Historie einsehen" },
    notizen: { title: "Infos", subtitle: "Gemeinsame Infos des Teams" },
    infos: { title: "Medizin-Wiki", subtitle: "Wirkung & Einsatzgebiet der Medikamente" },
    einstellungen: { title: "Einstellungen", subtitle: "Konfiguration des Ärztekammer-Systems" },
    admin: { title: "Admin", subtitle: "Benutzerverwaltung – nur für Administratoren sichtbar" },
    "admin-log": { title: "Aktivitäts-Log", subtitle: "Wer hat wann was im Admin Panel geändert – nur für Administratoren sichtbar" },
  };

  /* ------------------------------------------------------------------------
     4. Firebase-Konfigurationsprüfung
     ------------------------------------------------------------------------ */
  function istFirebaseKonfiguriert() {
    return (
      typeof firebase !== "undefined" &&
      typeof firebaseConfig !== "undefined" &&
      firebaseConfig.apiKey &&
      firebaseConfig.apiKey !== "DEIN-API-KEY"
    );
  }

  if (!istFirebaseKonfiguriert()) {
    el.authConfigHint.hidden = false;
    // Die Login-/Registrieren-Formulare selbst werden von js/auth.js
    // gesteuert - dessen eigene Prüfung sorgt dafür, dass ohne gültige
    // Firebase-Konfiguration dort gar nichts erst gestartet wird.
  }

  /* ------------------------------------------------------------------------
     5. Hilfsfunktionen
     ------------------------------------------------------------------------ */
  function erzeugeId(name) {
    const basis = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9äöüß\s-]/gi, "")
      .replace(/\s+/g, "-");
    return `${basis}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function erzeugeSessionId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function formatiereGeld(betrag) {
    const gerundet = Math.round(betrag * 100) / 100;
    return `${gerundet}$`;
  }

  function zeigeToast(nachricht) {
    el.toast.textContent = nachricht;
    el.toast.classList.add("toast--visible");
    clearTimeout(zeigeToast._timer);
    zeigeToast._timer = setTimeout(() => {
      el.toast.classList.remove("toast--visible");
    }, 2400);
  }

  function zeigeFeldFehler(element, nachricht) {
    element.textContent = nachricht;
    element.hidden = false;
  }

  function gefilterteMedikamente() {
    const begriff = suchbegriff.trim().toLowerCase();
    if (!begriff) return medikamente;
    return medikamente.filter((m) => m.name.toLowerCase().includes(begriff));
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Wandelt **fett** und __unterstrichen__ sicher in <strong>/<u> um (für
  // ältere, noch als Markdown gespeicherte Einträge und für das Medizin-Wiki,
  // das weiterhin ein einfaches Textfeld nutzt).
  // WICHTIG: escaped zuerst den kompletten Text (verhindert HTML-Injection),
  // wendet die Formatierung erst danach auf den bereits sicheren Text an.
  function formatiereNotizText(text) {
    let sicher = escapeHtml(text);
    sicher = sicher.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    sicher = sicher.replace(/__(.+?)__/g, "<u>$1</u>");
    return sicher;
  }

  // Erkennt, ob ein gespeicherter Text bereits "echtes" HTML aus dem neuen
  // Rich-Text-Editor ist (Notizen/Ankündigungen) oder noch altes Markdown /
  // reiner Text ist, und behandelt ihn entsprechend richtig.
  function verarbeiteRichInhalt(text) {
    if (/<[a-z][\s\S]*>/i.test(text)) {
      return sanitisiereRichText(text);
    }
    return formatiereNotizText(text);
  }

  // Erlaubt NUR eine kleine, feste Auswahl an Tags/Stilen (fett, unterstrichen,
  // Zeilenumbruch, Schriftfarbe in 4 festen, kräftigen Farben) und verwirft
  // alles andere (Skripte, Bilder, fremde Attribute, ...) - verhindert
  // HTML-Injection aus dem contenteditable-Feld.
  //
  // WICHTIG: Der Vergleich erfolgt über geparste RGB-Zahlen (nicht über
  // exakten String-Vergleich) - unterschiedliche Browser/Chromium-Versionen
  // formatieren "rgb(...)"-Werte manchmal minimal anders (Leerzeichen etc.),
  // ein reiner Text-Vergleich hätte dann die Farbe stillschweigend verworfen.
  const ERLAUBTE_TEXT_FARBEN = [
    { hex: "#b8860b", rgb: [184, 134, 11] }, // Gelb/Gold
    { hex: "#1a7a3c", rgb: [26, 122, 60] }, // Grün
    { hex: "#b71c1c", rgb: [183, 28, 28] }, // Rot
    { hex: "#1a56db", rgb: [26, 86, 219] }, // Blau
  ];

  function parseRgbString(wert) {
    const treffer = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(wert || "");
    if (!treffer) return null;
    return [Number(treffer[1]), Number(treffer[2]), Number(treffer[3])];
  }

  function findeErlaubteTextfarbe(wert) {
    if (!wert) return null;
    const bereinigt = wert.trim().toLowerCase();

    // Fall 1: reiner Hex-Wert, z. B. aus einem "color"-Attribut ("#b71c1c")
    const perHex = ERLAUBTE_TEXT_FARBEN.find((f) => f.hex.toLowerCase() === bereinigt);
    if (perHex) return perHex;

    // Fall 2: "rgb(...)"/"rgba(...)", z. B. aus einer CSS-style-Eigenschaft
    const rgb = parseRgbString(bereinigt);
    if (!rgb) return null;
    return (
      ERLAUBTE_TEXT_FARBEN.find((f) => f.rgb[0] === rgb[0] && f.rgb[1] === rgb[1] && f.rgb[2] === rgb[2]) || null
    );
  }

  function sanitisiereRichText(html) {
    const quelle = document.createElement("div");
    quelle.innerHTML = html;

    function bereinigeKinder(knoten, ziel) {
      Array.from(knoten.childNodes).forEach((kind) => {
        if (kind.nodeType === Node.TEXT_NODE) {
          ziel.appendChild(document.createTextNode(kind.textContent));
          return;
        }
        if (kind.nodeType !== Node.ELEMENT_NODE) return;

        const tag = kind.tagName;

        if (tag === "BR") {
          ziel.appendChild(document.createElement("br"));
          return;
        }
        if (tag === "B" || tag === "STRONG") {
          const neu = document.createElement("strong");
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "U") {
          const neu = document.createElement("u");
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "I" || tag === "EM") {
          const neu = document.createElement("em");
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "UL" || tag === "OL") {
          const neu = document.createElement(tag.toLowerCase());
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "LI") {
          const neu = document.createElement("li");
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "SPAN" || tag === "FONT" || tag === "MARK") {
          // Chrome erzeugt bei execCommand("foreColor") ein <font color="...">
          // (klassisches HTML-Attribut, keine CSS-style-Eigenschaft!) - daher
          // hier BEIDES prüfen: das "color"-Attribut UND style.color.
          const textFarbe =
            (kind.getAttribute && findeErlaubteTextfarbe(kind.getAttribute("color"))) ||
            (kind.style && findeErlaubteTextfarbe(kind.style.color));
          if (textFarbe) {
            const neu = document.createElement("span");
            neu.style.color = textFarbe.hex;
            bereinigeKinder(kind, neu);
            ziel.appendChild(neu);
          } else {
            // Keine erlaubte Farbe -> Tag verwerfen, Text-Inhalt behalten
            bereinigeKinder(kind, ziel);
          }
          return;
        }

        // Alles andere (DIV, P, SCRIPT, IMG, ...): Tag verwerfen, aber
        // Text-Inhalt behalten. Bei Block-Elementen zusätzlich einen
        // Zeilenumbruch einfügen, damit Absätze nicht zusammenlaufen.
        bereinigeKinder(kind, ziel);
        if (tag === "DIV" || tag === "P") {
          ziel.appendChild(document.createElement("br"));
        }
      });
    }

    const ergebnis = document.createElement("div");
    bereinigeKinder(quelle, ergebnis);
    return ergebnis.innerHTML;
  }

  // Formatierungsleisten mit den Feldern verbinden. Alle Rich-Editoren
  // (Ankündigungen, Notizen, Medizin-Wiki) sind contenteditable-Felder -
  // Fett/Unterstrichen/Kursiv/Listen/Schriftfarbe wirken überall sofort
  // WYSIWYG (kein **/__ mehr). Der **/__-Markdown-Zweig unten bleibt nur
  // noch als Rückfallebene für den Fall bestehen, dass irgendwo doch noch
  // ein reines Textfeld mit .format-toolbar verbunden wird.
  //
  // In eine eigene Funktion ausgelagert (statt nur einmalig beim Start über
  // alle zu diesem Zeitpunkt vorhandenen ".format-toolbar"-Elemente zu
  // laufen), damit auch NEU erzeugte Toolbars - z. B. im Bearbeiten-Formular
  // eines einzelnen Notiz-Eintrags, das erst später per JavaScript in den
  // DOM eingefügt wird - genauso funktionieren. Für alle bestehenden,
  // bereits beim Laden vorhandenen Seiten (Ankündigungen, Medizin-Wiki)
  // ändert sich dadurch nichts.
  function bindeFormatToolbar(toolbar) {
    const feld = document.getElementById(toolbar.dataset.target);
    if (!feld) return;

    const istRichEditor = feld.isContentEditable;

    toolbar.querySelectorAll(".format-btn[data-format]").forEach((btn) => {
      if (istRichEditor) {
        // "mousedown" statt "click" + preventDefault, damit das Editor-Feld
        // beim Klick auf den Button nicht den Fokus/die Markierung verliert.
        // btn.dataset.format entspricht direkt einem gültigen execCommand-
        // Namen ("bold"/"italic"/"underline"/"insertUnorderedList"/
        // "insertOrderedList"), daher genügt ein einziger generischer Aufruf.
        btn.addEventListener("mousedown", (event) => {
          event.preventDefault();
          feld.focus();
          document.execCommand(btn.dataset.format);
        });
        return;
      }

      // Rückfallebene für reine Textfelder (Markdown-Marker einfügen) - wird
      // aktuell von keinem Formular mehr genutzt, da auch das Medizin-Wiki
      // jetzt ein contenteditable-Rich-Editor ist.
      btn.addEventListener("click", () => {
        const marker = btn.dataset.format === "bold" ? "**" : "__";
        const start = feld.selectionStart;
        const end = feld.selectionEnd;
        const ausgewaehlt = feld.value.slice(start, end);
        feld.value = feld.value.slice(0, start) + marker + ausgewaehlt + marker + feld.value.slice(end);
        feld.focus();
        if (ausgewaehlt) {
          feld.setSelectionRange(start + marker.length, end + marker.length);
        } else {
          feld.setSelectionRange(start + marker.length, start + marker.length);
        }
      });
    });

    if (!istRichEditor) return;

    // Popover öffnen/schließen (Klick auf den "A"-Auslöser)
    const trigger = toolbar.querySelector('[data-role="color-trigger"]');
    const popover = toolbar.querySelector('[data-role="color-popover"]');
    const underline = toolbar.querySelector('[data-role="color-underline"]');

    if (trigger && popover) {
      trigger.addEventListener("mousedown", (event) => event.preventDefault()); // Fokus im Editor behalten
      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        // Alle anderen offenen Farb-Popover schließen (nur eins gleichzeitig)
        document.querySelectorAll('[data-role="color-popover"]').forEach((p) => {
          if (p !== popover) p.hidden = true;
        });
        popover.hidden = !popover.hidden;
      });
    }

    // Schriftfarb-Buttons (jetzt im Popover)
    toolbar.querySelectorAll("[data-color]").forEach((btn) => {
      btn.addEventListener("mousedown", (event) => {
        event.preventDefault();
        feld.focus();
        if (btn.dataset.color === "__reset__") {
          // Setzt die Schriftfarbe auf die aktuelle Standard-Textfarbe
          // zurück (abhängig vom Hell-/Dunkel-Modus)
          const standardFarbe = getComputedStyle(feld).color;
          document.execCommand("foreColor", false, standardFarbe);
          if (underline) underline.style.background = "transparent";
        } else {
          document.execCommand("foreColor", false, btn.dataset.color);
          if (underline) underline.style.background = btn.dataset.color;
        }
        if (popover) popover.hidden = true;
      });
    });
  }

  document.querySelectorAll(".format-toolbar").forEach(bindeFormatToolbar);

  // Farb-Popover bei Klick außerhalb schließen
  document.addEventListener("click", (event) => {
    document.querySelectorAll('[data-role="color-popover"]').forEach((popover) => {
      if (!popover.hidden && !popover.contains(event.target) && event.target.dataset.role !== "color-trigger") {
        popover.hidden = true;
      }
    });
  });

  function initialenVon(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
  }

  // Avatar-Kürzel für den Badge oben rechts (Anfangsbuchstabe des
  // Benutzernamens). Das frühere Emoji-Avatar war an die alte, jetzt
  // entfernte Login-Liste gekoppelt und hat im neuen Benutzersystem keine
  // Entsprechung mehr.
  function avatarVon(name) {
    return initialenVon(name);
  }

  // Für die Namensauswahl beim Betreten: Direktion zuerst, dann Rhodes, dann
  // Blackwater - innerhalb der Station in Eintragungsreihenfolge.
  function stationsRangFuer(station) {
    const reihenfolge = { direktion: 0, rhodes: 1, blackwater: 2 };
    return reihenfolge[station] !== undefined ? reihenfolge[station] : 99;
  }

  function formatiereZeitstempel(millis) {
    if (!millis) return "gerade eben";
    const datum = new Date(millis);
    return datum.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Formatiert ein "YYYY-MM-DD"-Datum (aus <input type="date">) ins deutsche Format
  function formatiereDatum(isoDatum) {
    const teile = isoDatum.split("-");
    if (teile.length !== 3) return isoDatum;
    return `${teile[2]}.${teile[1]}.${teile[0]}`;
  }

  /* ------------------------------------------------------------------------
     6. Bridge zum neuen Login-/Benutzersystem (js/auth.js, Modular SDK)
     ------------------------------------------------------------------------
     Das komplette Login/Registrierung/Session-Handling passiert jetzt in
     js/auth.js (eigenes ES-Modul, neues Firebase-Auth-System). js/app.js
     bekommt davon nur über zwei Custom-Events etwas mit:

     - "bwm:auth-approved": feuert genau EINMAL pro Sitzung, sobald ein
       Nutzer eingeloggt UND von einem Admin freigegeben ist. Das ist der
       Moment, in dem die eigentliche App (wie früher nach dem alten
       Passwort/Namens-Gate) starten soll.
     - "bwm:auth-profile-updated": feuert, wenn sich am eigenen Profil
       (Rolle, Admin-Status, Benutzername) live etwas ändert, WÄHREND man
       schon eingeloggt ist (z. B. ein Admin ändert die eigene Rolle) - hier
       muss NICHT die ganze App neu gestartet werden, nur die Anzeige
       aktualisiert werden.

     `aktuellerNutzer` hat dieselbe Form wie vorher ({ name, rolle, ... }),
     nur zusätzlich mit `uid` und `admin` - dadurch funktioniert istAdmin()
     und der Rest der App unverändert weiter.
     ------------------------------------------------------------------------ */
  window.addEventListener("bwm:auth-approved", (event) => {
    const { uid, username, rolle, isAdmin } = event.detail || {};
    aktuellerNutzer = { uid, name: username, rolle, admin: !!isAdmin };
    appStarten();
  });

  window.addEventListener("bwm:auth-profile-updated", (event) => {
    if (!aktuellerNutzer) return;
    const { username, rolle, isAdmin } = event.detail || {};
    aktuellerNutzer.name = username;
    aktuellerNutzer.rolle = rolle;
    aktuellerNutzer.admin = !!isAdmin;

    // Anzeige aktualisieren, ohne die App neu zu starten (Abos laufen ja
    // bereits) - v. a. relevant, falls sich der eigene Admin-Status ändert,
    // damit admin-geschützte Bereiche sofort ein-/ausgeblendet werden.
    renderBenutzerBadge();
    if (typeof renderBenutzerverwaltung === "function") renderBenutzerverwaltung();
    if (typeof renderTabelle === "function") renderTabelle();
    if (typeof renderMitarbeiterListe === "function") renderMitarbeiterListe();
    // Rang und Admin-Status können sich live ändern - der "Handbuch"-Reiter
    // (rang-abhängig) und der "Bearbeiten"-Button (admin-abhängig) müssen
    // deshalb sofort neu bewertet werden, nicht erst beim nächsten Login.
    if (typeof aktualisiereHandbuchNavSichtbarkeit === "function") aktualisiereHandbuchNavSichtbarkeit();
    if (typeof aktivesHandbuchDokumentId !== "undefined" && aktivesHandbuchDokumentId && typeof renderHandbuchDokument === "function") {
      renderHandbuchDokument(aktivesHandbuchDokumentId);
    }
  });

  function appStarten() {
    el.authScreen.hidden = true;
    el.appRoot.hidden = false;

    renderBenutzerBadge();
    renderMitarbeiterListe();
    aktualisiereAdminNavSichtbarkeit();
    aktualisiereHandbuchNavSichtbarkeit();

    sessionId = sessionStorage.getItem("medicalDepartment.sessionId") || erzeugeSessionId();
    sessionStorage.setItem("medicalDepartment.sessionId", sessionId);

    abonniereMedikamente();
    starteHeartbeat();
    abonnierePresence();
    abonniereNotizen();
    abonniereVerkaufslog();
    abonniereMitarbeiterliste();
    abonnierePersonalBadges();
    abonniereInfos();
    abonniereAnkuendigungen();
    abonniereKontakte();
    abonniereKontakteRollen();
    abonniereNotizenThemen();
    abonniereWikiKategorien();

    aktualisiereUhrzeit();
    wendeStartseitenPraeferenzAn();

    window.addEventListener("beforeunload", entferneEigenePresence);
  }

  /* ------------------------------------------------------------------------
     7b. Einstellung: Standard-Startseite (nur lokal im Browser gespeichert)
     ------------------------------------------------------------------------ */
  const STARTSEITE_KEY = "medicalDepartment.settings.startseite";

  function wendeStartseitenPraeferenzAn() {
    const praeferenz = localStorage.getItem(STARTSEITE_KEY) || "start";
    if (praeferenz === "start") return; // Start ist ohnehin die Standard-Ansicht

    if (praeferenz === "medikamente" || praeferenz === "verkaufslog") {
      if (typeof wechsleZuVerkaufAnsicht === "function") wechsleZuVerkaufAnsicht(praeferenz);
      return;
    }
    if (praeferenz === "notizen") {
      if (typeof wechsleZuNotizenAnsicht === "function") wechsleZuNotizenAnsicht("allgemein");
      return;
    }
    if (praeferenz === "infos-wiki") {
      const btn = document.querySelector('.nav__item[data-view="infos"]');
      if (btn) btn.click();
      return;
    }
    if (praeferenz === "mitarbeiter") {
      const btn = document.querySelector('.nav__item[data-view="mitarbeiter"]');
      if (btn) btn.click();
      return;
    }
    if (praeferenz === "kontakte") {
      const btn = document.querySelector('.nav__item[data-view="kontakte"]');
      if (btn) btn.click();
      return;
    }
  }

  const startseiteSelect = document.getElementById("startseite-select");
  if (startseiteSelect) {
    startseiteSelect.value = localStorage.getItem(STARTSEITE_KEY) || "start";
    startseiteSelect.addEventListener("change", () => {
      localStorage.setItem(STARTSEITE_KEY, startseiteSelect.value);
      zeigeToast("Standard-Startseite gespeichert.");
    });
  }

  function renderBenutzerBadge() {
    if (!aktuellerNutzer) return;
    el.userAvatar.textContent = avatarVon(aktuellerNutzer.name);
    el.userName.textContent = aktuellerNutzer.name;
    el.userRole.textContent = aktuellerNutzer.rolle;
  }

  el.userBadgeBtn.addEventListener("click", () => {
    el.userMenu.classList.toggle("user-menu--visible");
  });

  document.addEventListener("click", (event) => {
    if (!el.userMenu.contains(event.target) && !el.userBadgeBtn.contains(event.target)) {
      el.userMenu.classList.remove("user-menu--visible");
    }
    if (!el.onlinePanel.contains(event.target) && event.target !== el.onlineWidgetBtn) {
      el.onlinePanel.classList.remove("online-panel--visible");
    }
    // Schwebende Dropdown-Menüs (Verkauf/Infos) bei Klick daneben schließen -
    // wichtig in der Top-Navigation, da sie über dem Inhalt schweben statt
    // fest in einer Sidebar eingebettet zu sein.
    document.querySelectorAll(".nav__group--open").forEach((gruppe) => {
      if (!gruppe.contains(event.target)) {
        gruppe.classList.remove("nav__group--open");
      }
    });
  });

  el.btnLogout.addEventListener("click", () => {
    entferneEigenePresence();
    // Der eigentliche Logout (signOut) passiert in js/auth.js - dieser
    // Button hat dort denselben id="btn-logout" und damit einen eigenen
    // Klick-Listener, der die Firebase-Sitzung wirklich beendet und danach
    // automatisch (über onAuthStateChanged) zurück zum Login-Bildschirm
    // führt. Hier räumen wir nur noch die presence aus dieser laufenden
    // Sitzung auf, bevor abgemeldet wird.
  });

  /* ------------------------------------------------------------------------
     8. Firestore: Medikamente laden & speichern
     ------------------------------------------------------------------------ */
  function docRef(pfad) {
    const teile = pfad.split("/");
    return db.collection(teile[0]).doc(teile[1]);
  }

  function abonniereMedikamente() {
    unsubMedikamente = docRef(MEDIKAMENTE_DOC).onSnapshot(
      (doc) => {
        if (doc.exists && Array.isArray(doc.data().liste)) {
          medikamente = doc.data().liste;
        } else {
          medikamente = ladeLokaleFallbackDaten();
          speichereMedikamenteInFirestore();
        }
        render();
      },
      (fehler) => {
        console.error("Fehler beim Laden der Medikamente aus Firestore:", fehler);
        zeigeToast("Verbindung zur Datenbank fehlgeschlagen.");
      }
    );
  }

  function ladeLokaleFallbackDaten() {
    try {
      const alt = localStorage.getItem(STORAGE_KEY_V2) || localStorage.getItem(STORAGE_KEY_LEGACY);
      if (alt) return JSON.parse(alt);
    } catch (fehler) {
      console.warn("Kein lokaler Fallback-Datensatz gefunden.", fehler);
    }
    return DEFAULT_MEDIKAMENTE.map((m) => ({ ...m }));
  }

  function speichereMedikamenteDebounced() {
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(speichereMedikamenteInFirestore, 350);
  }

  function speichereMedikamenteInFirestore() {
    docRef(MEDIKAMENTE_DOC)
      .set({ liste: medikamente, aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp() })
      .catch((fehler) => {
        console.error("Fehler beim Speichern in Firestore:", fehler);
        zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
      });

    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(medikamente));
    } catch (fehler) {
      console.warn("Konnte lokalen Fallback nicht speichern.", fehler);
    }
  }

  /* ------------------------------------------------------------------------
     8b. Top-Navigation: Uhrzeit-Anzeige (rein kosmetisch, unabhängig)
     ------------------------------------------------------------------------ */
  function aktualisiereUhrzeit() {
    const el2 = document.getElementById("topnav-clock");
    const jetzt = new Date();
    const wochentag = jetzt.toLocaleDateString("de-DE", { weekday: "short" });
    const datum = jetzt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const zeit = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    if (el2) el2.textContent = `${wochentag}, ${datum} · ${zeit}`;

    // Dashboard: Begrüßung + Datum/Uhrzeit (rein kosmetisch, unabhängig vom Login)
    const stunde = jetzt.getHours();
    // "Gute Nacht" ist im Deutschen eine Verabschiedung, keine Begrüßung -
    // deshalb gilt "Guten Abend" bis in die frühen Morgenstunden weiter.
    const tageszeit = stunde < 5 ? "Guten Abend" : stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
    const greetingEl = document.getElementById("dashboard-greeting");
    const nameEl = document.getElementById("dashboard-name");
    if (greetingEl) greetingEl.textContent = `${tageszeit},`;
    if (nameEl) nameEl.textContent = aktuellerNutzer ? `${aktuellerNutzer.name}.` : "—";

    const datumVollEl = document.getElementById("dashboard-datum");
    const uhrzeitEl = document.getElementById("dashboard-uhrzeit");
    if (datumVollEl) {
      datumVollEl.textContent = jetzt.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    }
    if (uhrzeitEl) uhrzeitEl.textContent = `${zeit} Uhr`;
  }
  aktualisiereUhrzeit();
  setInterval(aktualisiereUhrzeit, 30000);

  /* ------------------------------------------------------------------------
     9. Presence: "Wer ist online"
     ------------------------------------------------------------------------ */
  function starteHeartbeat() {
    aktualisierePresence();
    heartbeatTimer = setInterval(aktualisierePresence, HEARTBEAT_INTERVALL_MS);
  }

  function aktualisierePresence() {
    if (!aktuellerNutzer || !sessionId) return;
    db.collection(PRESENCE_COLLECTION)
      .doc(sessionId)
      .set({
        name: aktuellerNutzer.name,
        rolle: aktuellerNutzer.rolle,
        // WICHTIG: bewusst ein normaler Client-Zeitstempel (Date.now()) statt
        // firebase.firestore.FieldValue.serverTimestamp() - letzteres liefert
        // beim eigenen, lokalen Update erst einmal "null", bis die Antwort
        // vom Server zurückkommt. Da unser Live-Listener aber SOFORT mit
        // diesem lokalen (noch unbestätigten) Stand feuert, wurde die eigene
        // Präsenz für ein paar Sekunden fälschlich als "veraltet" (offline)
        // gewertet - das war die Ursache für den verzögerten/fehlenden
        // Online-Status.
        aktualisiertAm: Date.now(),
      })
      .catch((fehler) => console.warn("Presence-Update fehlgeschlagen:", fehler));
  }

  function entferneEigenePresence() {
    if (!sessionId || !db) return;
    db.collection(PRESENCE_COLLECTION).doc(sessionId).delete().catch(() => {});
  }

  function abonnierePresence() {
    unsubPresence = db.collection(PRESENCE_COLLECTION).onSnapshot(
      (snapshot) => {
        letzterPresenceSnapshot = [];
        snapshot.forEach((doc) => {
          const daten = doc.data();
          // aktualisiertAm ist jetzt ein normaler Zahlen-Zeitstempel
          // (Date.now()), kein Firestore-Timestamp-Objekt mehr - daher kein
          // .toMillis() nötig. Fallback auf 0 nur, falls ein sehr alter/
          // fehlerhafter Eintrag noch das alte Format hätte.
          const zeitpunkt = typeof daten.aktualisiertAm === "number" ? daten.aktualisiertAm : 0;
          letzterPresenceSnapshot.push({ name: daten.name, rolle: daten.rolle, aktualisiertAm: zeitpunkt });
        });
        renderOnlineListe();
      },
      (fehler) => console.error("Fehler beim Laden der Online-Liste:", fehler)
    );

    onlineRecomputeTimer = setInterval(renderOnlineListe, 10 * 1000);
  }

  function ermittleOnlineListe() {
    const jetzt = Date.now();
    const gesehen = new Set();
    const online = [];

    letzterPresenceSnapshot.forEach((eintrag) => {
      if (jetzt - eintrag.aktualisiertAm > ONLINE_SCHWELLE_MS) return; // veraltet -> offline
      const key = eintrag.name.toLowerCase();
      if (gesehen.has(key)) return; // gleiche Person nicht doppelt zählen (z. B. 2 Tabs)
      gesehen.add(key);
      online.push(eintrag);
    });

    return online;
  }

  function renderOnlineListe() {
    const online = ermittleOnlineListe();
    el.onlineCount.textContent = online.length;

    const dashboardOnline = document.getElementById("dashboard-online");
    if (dashboardOnline) {
      dashboardOnline.textContent = online.length === 1 ? "1 Mitglied online" : `${online.length} Mitglieder online`;
    }

    el.onlinePanelList.innerHTML = "";
    if (online.length === 0) {
      el.onlinePanelList.innerHTML = `<p class="online-panel__empty">Niemand ist gerade online.</p>`;
      return;
    }

    online.forEach((person) => {
      const zeile = document.createElement("div");
      zeile.className = "online-panel__person";
      zeile.innerHTML = `<span class="online-dot"></span> ${escapeHtml(person.name)}`;
      el.onlinePanelList.appendChild(zeile);
    });

    renderMitarbeiterListe();
  }

  el.onlineWidgetBtn.addEventListener("click", () => {
    el.onlinePanel.classList.toggle("online-panel--visible");
  });

  /* ------------------------------------------------------------------------
     10. Mitarbeiter-Ansicht (bekannte Liste + Online-Status)
     ------------------------------------------------------------------------ */
  let mitarbeiterBearbeitenModus = false; // Erst nach Klick auf "Bearbeiten" sind Felder aktiv
  let aktiveStationReiter = "rhodes"; // Welche Station beim Medizinischen Personal gerade angezeigt wird
  let mitarbeiterSuchbegriff = ""; // Filtert Leitung + Medizinisches Personal nach Name/Position/Abteilung

  // Feste Rangfolge (höchster Rang zuerst) - bestimmt die Sortierung
  // innerhalb eines Standorts sowie bei der Suche.
  const RANGFOLGE = ["Chefarzt", "Stellv. Chefarzt", "Oberarzt", "Stellv. Oberarzt", "Facharzt", "Assistenzarzt", "Anwärter"];
  const STATIONS_SCHLUESSEL = Object.keys(STATIONEN);

  function rangIndex(rolle) {
    const i = RANGFOLGE.indexOf(rolle);
    return i === -1 ? RANGFOLGE.length : i;
  }

  function renderMitarbeiterListe() {
    if (!el.staffGrid) return;
    renderBenutzerBadge(); // Badge-Avatar aktualisieren, sobald die Liste geladen ist

    // Schutz gegen Fokus-Verlust: Wenn gerade ein Namensfeld/Rang-Dropdown/
    // Eingabefeld in Benutzung ist (Tippen oder gerade ausgewählt), wird die
    // Liste NICHT mitten drin komplett neu aufgebaut - das würde das Feld/
    // Dropdown zerstören und den Fokus/die Eingabe verlieren. Der nächste
    // Render (z. B. nach dem Verlassen des Feldes) holt den aktuellen Stand
    // nach.
    // Checkboxen (z. B. "Ärztliche Direktion") sind bewusst ausgenommen: ein
    // Klick darauf ist eine einmalige, abgeschlossene Aktion (kein
    // fortlaufendes Tippen wie bei Textfeldern) - würde man den Re-Render
    // hier ebenfalls blockieren, bliebe z. B. die Direktion-Karte ganz oben
    // so lange veraltet, bis die Checkbox den Fokus verliert.
    const aktivesElement = document.activeElement;
    const istEingabeInBearbeitung =
      el.staffGrid.contains(aktivesElement) &&
      ((aktivesElement.tagName === "INPUT" && aktivesElement.type !== "checkbox") || aktivesElement.tagName === "SELECT");
    if (istEingabeInBearbeitung) {
      return;
    }

    const admin = istAdmin();
    const bearbeitenAktiv = admin && mitarbeiterBearbeitenModus;

    // "Bearbeiten"-Button nur für Admins anzeigen, Beschriftung/Status je nach Modus.
    // Die Toolbar selbst (inkl. Suche) bleibt für alle sichtbar.
    const toggleBtn = document.getElementById("btn-toggle-mitarbeiter-bearbeiten");
    if (toggleBtn) {
      toggleBtn.hidden = !admin;
      toggleBtn.textContent = bearbeitenAktiv ? "Fertig" : "Bearbeiten";
      toggleBtn.classList.toggle("btn--ghost-active", bearbeitenAktiv);
    }

    if (!STATIONS_SCHLUESSEL.includes(aktiveStationReiter)) aktiveStationReiter = STATIONS_SCHLUESSEL[0];

    function treffferSuche(slot) {
      if (!mitarbeiterSuchbegriff) return true;
      const begriff = mitarbeiterSuchbegriff.toLowerCase();
      const badgeText = [...(slot.specialties || []), ...(slot.badges || [])].join(" ").toLowerCase();
      return (
        (slot.name && slot.name.toLowerCase().includes(begriff)) ||
        (slot.rolle && slot.rolle.toLowerCase().includes(begriff)) ||
        badgeText.includes(begriff)
      );
    }

    // Alle Personen aller drei Standorte einsammeln - jede Person "weiß",
    // aus welchem Standort+Slot sie stammt (wichtig fürs Bearbeiten/
    // Verschieben).
    function alleEintraege() {
      const ergebnis = [];
      STATIONS_SCHLUESSEL.forEach((stationKey) => {
        (stationenDaten[stationKey] || []).forEach((slot, index) => {
          ergebnis.push({ stationKey, index, slot });
        });
      });
      return ergebnis;
    }

    const eintraege = alleEintraege();
    const istDu = (slot) => aktuellerNutzer && slot.name && slot.name.toLowerCase() === aktuellerNutzer.name.toLowerCase();

    // Badge-Pille (Icon + Text) - identische Optik in der Anzeige UND als
    // klickbarer Umschalter im Bearbeiten-Modus (siehe badgeUmschalter).
    function badgePille(label) {
      return `<span class="badge-pill">${badgeIcon(label)}<span>${escapeHtml(label)}</span></span>`;
    }

    // Alle Badges einer Person, in fester Katalog-Reihenfolge (erst
    // Fachgebiete, dann Zuständigkeiten) statt in Speicher-Reihenfolge -
    // dadurch bleibt die Anzeige stabil, auch wenn der Katalog sich ändert.
    function badgesFuerSlot(slot) {
      const fachgebiete = personalBadgesKatalog.fachgebiete.filter((f) => (slot.specialties || []).includes(f));
      const zustaendigkeiten = personalBadgesKatalog.zustaendigkeiten.filter((z) => (slot.badges || []).includes(z));
      return [...fachgebiete, ...zustaendigkeiten];
    }

    /* ---------------------------------------------------------------------
       Ärztliche Direktion: eigener, herausgehobener Bereich ganz oben. Zeigt
       ausschließlich Personen, bei denen "direktion: true" gesetzt ist - das
       ist keine eigene Station mehr, sondern eine zusätzliche Funktion, die
       ein Mitarbeiter parallel zu seinem Standort/Rang innehat (siehe
       Checkbox "Ärztliche Direktion" im Bearbeiten-Modus weiter unten).
       --------------------------------------------------------------------- */
    const direktionsEintraege = eintraege.filter((e) => e.slot.name && e.slot.direktion && treffferSuche(e.slot));

    function direktionKarte(e) {
      const { slot } = e;
      return `
        <div class="direktion-card">
          <span class="direktion-card__icon" aria-hidden="true">${ICON_CADUCEUS}</span>
          <span class="direktion-card__info">
            <span class="direktion-card__name">${escapeHtml(slot.name)}${istDu(slot) ? '<span class="org-row__du">Du</span>' : ""}</span>
            <span class="direktion-card__rang">Ärztliche Direktion</span>
            <span class="direktion-card__beschreibung">Verantwortlich für sämtliche medizinischen Angelegenheiten der Black Wolf Medical.</span>
          </span>
        </div>
      `;
    }

    const direktionHtml =
      !direktionsEintraege.length && !bearbeitenAktiv
        ? ""
        : `
        <section class="org-chapter org-chapter--direktion">
          <h2 class="org-chapter__titel">Ärztliche Direktion</h2>
          ${
            direktionsEintraege.length
              ? direktionsEintraege.map(direktionKarte).join("")
              : `<p class="empty-state">Noch niemandem zugewiesen - setze unten bei einem Mitarbeiter das Häkchen "Ärztliche Direktion".</p>`
          }
        </section>
      `;

    /* ---------------------------------------------------------------------
       Praxisleitungen: je eine schlichte Übersichtskarte für Rhodes,
       Blackwater und Valentine - Standort, Chefarzt und (optional) die an
       diesem Standort vorhandenen Fachrichtungen.
       --------------------------------------------------------------------- */
    function fachrichtungenFuerStation(stationKey) {
      const vorhanden = new Set();
      eintraege
        .filter((e) => e.stationKey === stationKey && e.slot.name)
        .forEach((e) => (e.slot.specialties || []).forEach((f) => vorhanden.add(f)));
      return personalBadgesKatalog.fachgebiete.filter((f) => vorhanden.has(f));
    }

    function praxisKarte(stationKey) {
      const chefEintrag = eintraege.find((e) => e.stationKey === stationKey && e.slot.name && e.slot.rolle === "Chefarzt");
      const anzahl = eintraege.filter((e) => e.stationKey === stationKey && e.slot.name).length;
      const fachrichtungen = fachrichtungenFuerStation(stationKey);

      return `
        <div class="praxis-card">
          <div class="praxis-card__kopf">
            <span class="praxis-card__pin" aria-hidden="true">${ICON_PIN}</span>
            <span class="praxis-card__standort">${escapeHtml(STATIONEN[stationKey].label)}</span>
          </div>
          <div class="praxis-card__chefarzt">
            <span class="praxis-card__label">Chefarzt</span>
            <span class="praxis-card__chefarzt-name">${
              chefEintrag ? escapeHtml(chefEintrag.slot.name) : '<span class="praxis-card__unbesetzt">Unbesetzt</span>'
            }</span>
          </div>
          ${
            fachrichtungen.length
              ? `
              <div class="praxis-card__divider"></div>
              <div class="praxis-card__fachrichtungen">
                <span class="praxis-card__label praxis-card__label--gold">Fachrichtungen</span>
                <div class="praxis-card__badges">${fachrichtungen.map(badgePille).join("")}</div>
              </div>
            `
              : ""
          }
          <div class="praxis-card__divider"></div>
          <div class="praxis-card__footer">
            <span aria-hidden="true">${ICON_USERS}</span>${anzahl} Mitarbeiter
          </div>
        </div>
      `;
    }

    const praxisHtml = `
      <section class="org-chapter">
        <h2 class="org-chapter__titel">Praxisleitungen</h2>
        <div class="praxis-grid">
          ${STATIONS_SCHLUESSEL.map(praxisKarte).join("")}
        </div>
      </section>
    `;

    /* ---------------------------------------------------------------------
       Medizinisches Personal: Standort-Tabs + kompakte Liste (kein Table
       mehr) - jeder Mitarbeiter als schlichter Listeneintrag mit Name, Rang
       und seinen Badges.
       --------------------------------------------------------------------- */
    function badgeUmschalter(stationKey, index, kategorie, katalogListe, ausgewaehlt) {
      return katalogListe
        .map(
          (label) => `
          <button
            type="button"
            class="badge-pill badge-pill--umschalter ${ausgewaehlt.includes(label) ? "badge-pill--aktiv" : ""}"
            data-role="slot-badge-umschalten"
            data-kategorie="${kategorie}"
            data-station="${stationKey}"
            data-index="${index}"
            data-label="${escapeHtml(label)}"
          >${badgeIcon(label)}<span>${escapeHtml(label)}</span></button>
        `
        )
        .join("");
    }

    function personalEintragEdit(e) {
      const { stationKey, index, slot } = e;
      return `
        <div class="staff-list__item staff-list__item--edit">
          <div class="staff-edit__zeile">
            <input
              type="text"
              class="org-row__name-input staff-edit__name"
              placeholder="Name eintragen..."
              value="${escapeHtml(slot.name)}"
              data-role="slot-name"
              data-station="${stationKey}"
              data-index="${index}"
            />
            <select class="org-row__rang-select staff-edit__rang" data-role="slot-rolle" data-station="${stationKey}" data-index="${index}">
              ${STATIONS_RAENGE.map((r) => `<option value="${r}" ${r === slot.rolle ? "selected" : ""}>${r}</option>`).join("")}
            </select>
            <select class="org-row__rang-select staff-edit__standort" data-role="slot-standort" data-station="${stationKey}" data-index="${index}">
              ${STATIONS_SCHLUESSEL.map(
                (k) => `<option value="${k}" ${k === stationKey ? "selected" : ""}>${escapeHtml(STATIONEN[k].label)}</option>`
              ).join("")}
            </select>
            <label class="staff-edit__direktion">
              <input type="checkbox" data-role="slot-direktion" data-station="${stationKey}" data-index="${index}" ${
        slot.direktion ? "checked" : ""
      } />
              Ärztliche Direktion
            </label>
          </div>
          <div class="staff-edit__badges">
            <span class="staff-edit__badges-label">Medizinische Fachgebiete</span>
            <div class="staff-edit__badges-row">${badgeUmschalter(stationKey, index, "fachgebiete", personalBadgesKatalog.fachgebiete, slot.specialties || [])}</div>
            <span class="staff-edit__badges-label">Interne Zuständigkeiten</span>
            <div class="staff-edit__badges-row">${badgeUmschalter(stationKey, index, "zustaendigkeiten", personalBadgesKatalog.zustaendigkeiten, slot.badges || [])}</div>
          </div>
        </div>
      `;
    }

    function personalEintrag(e) {
      const { slot } = e;
      if (!slot.name) {
        return `<div class="staff-list__item staff-list__item--empty"><span>Unbesetzt</span></div>`;
      }
      const badges = badgesFuerSlot(slot);
      return `
        <div class="staff-list__item">
          <span class="staff-list__avatar" aria-hidden="true">${ICON_CADUCEUS}</span>
          <span class="staff-list__info">
            <span class="staff-list__name">${escapeHtml(slot.name)}${istDu(slot) ? '<span class="org-row__du">Du</span>' : ""}</span>
            <span class="staff-list__rang">${escapeHtml(slot.rolle)}</span>
          </span>
          <span class="staff-list__badges">${badges.map(badgePille).join("")}</span>
          <span class="staff-list__chevron" aria-hidden="true">›</span>
        </div>
      `;
    }

    const personalEintraegeGefiltert = eintraege
      .filter((e) => e.stationKey === aktiveStationReiter)
      .filter((e) => (e.slot.name ? treffferSuche(e.slot) : !mitarbeiterSuchbegriff))
      .sort((a, b) => {
        if (!a.slot.name && b.slot.name) return 1;
        if (a.slot.name && !b.slot.name) return -1;
        return rangIndex(a.slot.rolle) - rangIndex(b.slot.rolle);
      });

    const personalTabsHtml = STATIONS_SCHLUESSEL.map(
      (stationKey) => `
        <button type="button" class="org-tabs__tab ${stationKey === aktiveStationReiter ? "org-tabs__tab--active" : ""}" data-role="staff-tab" data-station="${stationKey}">
          ${escapeHtml(STATIONEN[stationKey].label)}
        </button>
      `
    ).join("");

    const personalHtml = `
      <section class="org-chapter org-chapter--personal">
        <h2 class="org-chapter__titel">Medizinisches Personal</h2>
        <div class="org-tabs staff-location-tabs">${personalTabsHtml}</div>
        <div class="staff-list">
          ${
            personalEintraegeGefiltert.length
              ? personalEintraegeGefiltert.map((e) => (bearbeitenAktiv ? personalEintragEdit(e) : personalEintrag(e))).join("")
              : `<p class="empty-state">Keine Treffer.</p>`
          }
        </div>
      </section>
    `;

    /* ---------------------------------------------------------------------
       Badges verwalten (nur im Bearbeiten-Modus, nur für Admins sichtbar) -
       Katalog-Einträge entfernen sowie neue Fachgebiete/Zuständigkeiten
       anlegen, ganz ohne Code-Änderung.
       --------------------------------------------------------------------- */
    function badgeKatalogZeile(kategorie, liste) {
      if (!liste.length) return `<p class="empty-state badge-katalog__leer">Noch keine Einträge.</p>`;
      return liste
        .map(
          (label) => `
          <span class="badge-pill badge-pill--verwaltung">
            ${badgeIcon(label)}<span>${escapeHtml(label)}</span>
            <button type="button" class="badge-pill__entfernen" data-role="badge-katalog-entfernen" data-kategorie="${kategorie}" data-label="${escapeHtml(
              label
            )}" title="Badge entfernen" aria-label="„${escapeHtml(label)}“ aus dem Katalog entfernen">${ICON_X_KLEIN}</button>
          </span>
        `
        )
        .join("");
    }

    const badgeKatalogHtml = !bearbeitenAktiv
      ? ""
      : `
      <section class="org-chapter">
        <h2 class="org-chapter__titel">Badges verwalten</h2>
        <div class="badge-katalog">
          <div class="badge-katalog__gruppe">
            <span class="badge-katalog__label">Medizinische Fachgebiete</span>
            <div class="badge-katalog__liste">${badgeKatalogZeile("fachgebiete", personalBadgesKatalog.fachgebiete)}</div>
          </div>
          <div class="badge-katalog__gruppe">
            <span class="badge-katalog__label">Interne Zuständigkeiten</span>
            <div class="badge-katalog__liste">${badgeKatalogZeile("zustaendigkeiten", personalBadgesKatalog.zustaendigkeiten)}</div>
          </div>
          <div class="badge-katalog__neu">
            <select id="badge-katalog-kategorie" class="org-row__rang-select">
              <option value="fachgebiete">Neues Fachgebiet</option>
              <option value="zustaendigkeiten">Neue Zuständigkeit</option>
            </select>
            <input type="text" id="badge-katalog-neu-input" class="field-input" placeholder="Name des Badges..." autocomplete="off" />
            <button type="button" class="btn btn--ghost" id="badge-katalog-hinzufuegen-btn">Hinzufügen</button>
          </div>
        </div>
      </section>
    `;

    const hinweisHtml = `
      <div class="staff-hinweis">
        <span class="staff-hinweis__icon" aria-hidden="true">${ICON_INFO}</span>
        <span>Die Badges zeigen Fachrichtungen und Zuständigkeiten der Mitarbeiter. Änderungen können ausschließlich von Administratoren vorgenommen werden.</span>
      </div>
    `;

    el.staffGrid.innerHTML = `
      ${direktionHtml}
      ${praxisHtml}
      ${personalHtml}
      ${badgeKatalogHtml}
      ${hinweisHtml}
    `;
  }

  // Bearbeiten-Button: schaltet zwischen reiner Ansicht und editierbaren Feldern um
  const btnToggleMitarbeiterBearbeiten = document.getElementById("btn-toggle-mitarbeiter-bearbeiten");
  if (btnToggleMitarbeiterBearbeiten) {
    btnToggleMitarbeiterBearbeiten.addEventListener("click", () => {
      if (!istAdmin()) return;
      mitarbeiterBearbeitenModus = !mitarbeiterBearbeitenModus;
      renderMitarbeiterListe();
    });
  }

  // Änderungen an Name-Feldern/Rang-/Standort-Dropdowns und der "Ärztliche
  // Direktion"-Checkbox direkt in der Mitarbeiterliste
  if (document.body) {
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!el.staffGrid || !el.staffGrid.contains(target)) return;
      if (target.dataset.role === "slot-rolle") {
        aktualisiereSlot(target.dataset.station, Number(target.dataset.index), { rolle: target.value });
        return;
      }
      if (target.dataset.role === "slot-standort") {
        verschiebeMitarbeiterStandort(target.dataset.station, Number(target.dataset.index), target.value);
        return;
      }
      if (target.dataset.role === "slot-direktion") {
        aktualisiereDirektion(target.dataset.station, Number(target.dataset.index), target.checked);
      }
    });

    // Name-Feld: erst beim Verlassen des Feldes speichern (nicht bei jedem Tastendruck)
    document.addEventListener(
      "blur",
      (event) => {
        const target = event.target;
        if (!el.staffGrid || !el.staffGrid.contains(target)) return;
        if (target.dataset.role !== "slot-name") return;
        aktualisiereSlot(target.dataset.station, Number(target.dataset.index), { name: target.value.trim() });
      },
      true
    );

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (target.id === "badge-katalog-neu-input") {
        event.preventDefault();
        const btn = document.getElementById("badge-katalog-hinzufuegen-btn");
        if (btn) btn.click();
        return;
      }
      if (!el.staffGrid || !el.staffGrid.contains(target)) return;
      if (target.dataset.role === "slot-name") target.blur();
    });

    // Standort-Tabs, Badge-Umschalter (Bearbeiten-Modus) und Badge-Katalog-
    // Verwaltung (Entfernen/Hinzufügen) - alles per Klick-Delegation.
    document.addEventListener("click", (event) => {
      const tab = event.target.closest('[data-role="staff-tab"]');
      if (tab && el.staffGrid && el.staffGrid.contains(tab)) {
        aktiveStationReiter = tab.dataset.station;
        renderMitarbeiterListe();
        return;
      }

      const badgeUmschaltBtn = event.target.closest('[data-role="slot-badge-umschalten"]');
      if (badgeUmschaltBtn && el.staffGrid && el.staffGrid.contains(badgeUmschaltBtn)) {
        toggleMitarbeiterBadge(
          badgeUmschaltBtn.dataset.station,
          Number(badgeUmschaltBtn.dataset.index),
          badgeUmschaltBtn.dataset.kategorie,
          badgeUmschaltBtn.dataset.label
        );
        return;
      }

      const entfernenBtn = event.target.closest('[data-role="badge-katalog-entfernen"]');
      if (entfernenBtn && el.staffGrid && el.staffGrid.contains(entfernenBtn)) {
        entferneBadgeAusKatalog(entfernenBtn.dataset.kategorie, entfernenBtn.dataset.label);
        return;
      }

      if (event.target.id === "badge-katalog-hinzufuegen-btn") {
        const kategorieSelect = document.getElementById("badge-katalog-kategorie");
        const neuInput = document.getElementById("badge-katalog-neu-input");
        if (!kategorieSelect || !neuInput) return;
        fuegeBadgeHinzu(kategorieSelect.value, neuInput.value);
      }
    });
  }

  // Mitarbeiter-Suche (live beim Tippen)
  if (el.staffSearchInput) {
    el.staffSearchInput.addEventListener("input", () => {
      mitarbeiterSuchbegriff = el.staffSearchInput.value.trim();
      renderMitarbeiterListe();
    });
  }

  function aktualisiereSlot(station, index, aenderung) {
    if (!istAdmin()) {
      zeigeToast("Nur Admins dürfen die Mitarbeiter-Liste bearbeiten.");
      renderMitarbeiterListe(); // Eingabe zurücksetzen
      return;
    }
    if (!stationenDaten[station] || !stationenDaten[station][index]) return;

    Object.assign(stationenDaten[station][index], aenderung);
    speichereMitarbeiterliste();
  }

  // Setzt/entfernt die Zugehörigkeit zur Ärztlichen Direktion für einen
  // Mitarbeiter - unabhängig von Standort und Rang, damit z. B. ein
  // Chefarzt gleichzeitig Ärztlicher Direktor sein kann, ohne doppelt in der
  // Liste zu erscheinen.
  function aktualisiereDirektion(station, index, wert) {
    if (!istAdmin()) {
      zeigeToast("Nur Admins dürfen die Mitarbeiter-Liste bearbeiten.");
      renderMitarbeiterListe();
      return;
    }
    if (!stationenDaten[station] || !stationenDaten[station][index]) return;
    stationenDaten[station][index].direktion = !!wert;
    speichereMitarbeiterliste();
  }

  // Schaltet ein Fachgebiet ("fachgebiete" -> Feld "specialties") oder eine
  // interne Zuständigkeit ("zustaendigkeiten" -> Feld "badges") für einen
  // Mitarbeiter an/aus. Bewusst zwei getrennte Firestore-Felder (siehe
  // PERSONAL_BADGES_DOC), damit sich später z. B. leicht "alle mit
  // Fachgebiet Chirurgie" oder "alle Ausbilder" filtern lässt.
  function toggleMitarbeiterBadge(station, index, kategorie, label) {
    if (!istAdmin()) {
      zeigeToast("Nur Admins dürfen die Mitarbeiter-Liste bearbeiten.");
      renderMitarbeiterListe();
      return;
    }
    if (!stationenDaten[station] || !stationenDaten[station][index]) return;
    const feld = kategorie === "fachgebiete" ? "specialties" : "badges";
    const slot = stationenDaten[station][index];
    const bisher = Array.isArray(slot[feld]) ? slot[feld] : [];
    slot[feld] = bisher.includes(label) ? bisher.filter((b) => b !== label) : [...bisher, label];
    speichereMitarbeiterliste();
  }

  // Verschiebt einen Mitarbeiter in einen freien Platz eines anderen
  // Standorts (Standort-Wechsel über das Dropdown). Der alte Platz wird
  // dabei geleert, nicht gelöscht - die feste Platzanzahl je Standort
  // bleibt unverändert. Badges und die Zugehörigkeit zur Ärztlichen
  // Direktion wandern mit der Person mit.
  function verschiebeMitarbeiterStandort(vonStation, vonIndex, nachStation) {
    if (!istAdmin()) {
      zeigeToast("Nur Admins dürfen die Mitarbeiter-Liste bearbeiten.");
      renderMitarbeiterListe(); // Auswahl zurücksetzen
      return;
    }
    if (nachStation === vonStation) return;
    if (!stationenDaten[vonStation] || !stationenDaten[vonStation][vonIndex]) return;
    if (!Array.isArray(stationenDaten[nachStation])) return;

    const zielIndex = stationenDaten[nachStation].findIndex((platz) => !platz.name);
    if (zielIndex === -1) {
      const zielLabel = STATIONEN[nachStation] ? STATIONEN[nachStation].label : nachStation;
      zeigeToast(`Kein freier Platz mehr in ${zielLabel} - dort zuerst einen Platz freimachen.`);
      renderMitarbeiterListe(); // Auswahl zurücksetzen
      return;
    }

    const person = stationenDaten[vonStation][vonIndex];
    stationenDaten[nachStation][zielIndex] = {
      name: person.name,
      rolle: person.rolle,
      specialties: Array.isArray(person.specialties) ? [...person.specialties] : [],
      badges: Array.isArray(person.badges) ? [...person.badges] : [],
      direktion: !!person.direktion,
    };
    stationenDaten[vonStation][vonIndex] = neuerLeererPlatz();

    speichereMitarbeiterliste();
  }

  /* ------------------------------------------------------------------------
     10b. Firestore: Mitarbeiter-/Standortliste (nur Personal-Seite,
          NICHTS mit dem Login zu tun)
     ------------------------------------------------------------------------ */
  function abonniereMitarbeiterliste() {
    if (unsubMitarbeiter) return Promise.resolve(); // bereits abonniert

    return new Promise((resolve) => {
      let ersterDurchlauf = true;

      unsubMitarbeiter = docRef(MITARBEITER_DOC).onSnapshot(
        (doc) => {
          if (doc.exists && doc.data().stationen) {
            const geladen = doc.data().stationen;
            if (istAlteDatenstruktur(geladen)) {
              migriereZuNeuerStruktur(geladen);
            } else {
              stationenDaten = geladen;
              normalisiereStationenDaten();
            }
          } else if (doc.exists && Array.isArray(doc.data().liste)) {
            // Migration von der ganz alten, flachen Liste (vor den festen Plätzen)
            migriereAlteFlacheListe(doc.data().liste);
          } else {
            stationenDaten = JSON.parse(JSON.stringify(DEFAULT_STATIONEN));
            speichereMitarbeiterliste();
          }

          renderMitarbeiterListe();

          if (ersterDurchlauf) {
            ersterDurchlauf = false;
            resolve();
          }
        },
        (fehler) => {
          console.error("Fehler beim Laden der Mitarbeiterliste:", fehler);
          if (ersterDurchlauf) {
            ersterDurchlauf = false;
            resolve();
          }
        }
      );
    });
  }

  // Erkennt die alte Datenstruktur (mit eigener "direktion"-Station und/oder
  // ohne die Felder "specialties"/"badges" je Mitarbeiter) - Grundlage für
  // die einmalige, automatische Migration in migriereZuNeuerStruktur().
  function istAlteDatenstruktur(geladen) {
    if (geladen.direktion || geladen.strawberry || geladen.saintdenis) return true;
    return STATIONS_SCHLUESSEL.some((key) => {
      const liste = geladen[key];
      return Array.isArray(liste) && liste.some((slot) => slot && slot.name && !Array.isArray(slot.specialties));
    });
  }

  // Wandelt die alte Datenstruktur (mit eigener "direktion"-Station, ohne
  // Badge-Felder) einmalig in die neue um - bestehende Namen/Ränge bleiben
  // erhalten. Ein in der alten "direktion"-Station hinterlegter Name wird,
  // falls er auch an einem der drei echten Standorte vorkommt (Namensabgleich,
  // ohne Groß-/Kleinschreibung), NICHT doppelt angelegt, sondern dort nur mit
  // "direktion: true" markiert. Wird er nirgends gefunden, wird er
  // stattdessen als neuer Chefarzt-Eintrag in Rhodes ergänzt, damit der Name
  // nicht verloren geht.
  function migriereZuNeuerStruktur(alteDaten) {
    const neu = {};
    STATIONS_SCHLUESSEL.forEach((key) => {
      const alteListe = Array.isArray(alteDaten[key]) ? alteDaten[key] : [];
      neu[key] = alteListe.map((slot) => ({
        name: slot && slot.name ? slot.name : "",
        rolle: slot && slot.rolle ? slot.rolle : "Anwärter",
        specialties: slot && Array.isArray(slot.specialties) ? slot.specialties : [],
        badges: slot && Array.isArray(slot.badges) ? slot.badges : [],
        direktion: !!(slot && slot.direktion),
      }));
    });

    const alteDirektion = Array.isArray(alteDaten.direktion) ? alteDaten.direktion.find((p) => p && p.name) : null;
    if (alteDirektion) {
      const gesuchterName = alteDirektion.name.trim().toLowerCase();
      let gefunden = false;
      STATIONS_SCHLUESSEL.forEach((key) => {
        neu[key].forEach((slot) => {
          if (!gefunden && slot.name && slot.name.trim().toLowerCase() === gesuchterName) {
            slot.direktion = true;
            gefunden = true;
          }
        });
      });
      if (!gefunden) {
        const freierPlatz = neu.rhodes ? neu.rhodes.findIndex((slot) => !slot.name) : -1;
        if (freierPlatz !== -1) {
          neu.rhodes[freierPlatz] = { name: alteDirektion.name, rolle: "Chefarzt", specialties: [], badges: [], direktion: true };
        }
      }
    }

    stationenDaten = neu;
    normalisiereStationenDaten();
    speichereMitarbeiterliste();
  }

  // Stellt sicher, dass jeder Standort exakt die richtige Anzahl Plätze hat
  // (falls sich STATIONEN.max mal ändert oder Daten unvollständig sind) und
  // entfernt dabei gleichzeitig alte, nicht mehr verwendete Standort-
  // Schlüssel (z. B. "direktion", "strawberry", "saintdenis" aus früheren
  // Versionen), indem das Objekt komplett neu aufgebaut wird.
  function normalisiereStationenDaten() {
    const neu = {};
    Object.keys(STATIONEN).forEach((key) => {
      const max = STATIONEN[key].max;
      const bestehend = Array.isArray(stationenDaten[key]) ? stationenDaten[key] : [];
      const bereinigt = bestehend.map((slot) => ({
        name: slot && slot.name ? slot.name : "",
        rolle: slot && slot.rolle ? slot.rolle : "Anwärter",
        specialties: slot && Array.isArray(slot.specialties) ? slot.specialties : [],
        badges: slot && Array.isArray(slot.badges) ? slot.badges : [],
        direktion: !!(slot && slot.direktion),
      }));
      while (bereinigt.length < max) bereinigt.push(neuerLeererPlatz());
      neu[key] = bereinigt.length > max ? bereinigt.slice(0, max) : bereinigt;
    });
    stationenDaten = neu;
  }

  // Wandelt eine ganz alte, flache Mitarbeiterliste (Version mit
  // "liste: [...]" und einem "station"-Feld pro Person, von vor den festen
  // Plätzen) einmalig in die neue Struktur um - bestehende Einträge bleiben
  // dabei erhalten.
  function migriereAlteFlacheListe(alteListe) {
    const alt = { direktion: [], rhodes: erzeugeLeereStation(8), blackwater: erzeugeLeereStation(8), valentine: erzeugeLeereStation(8) };

    const direktionsPerson = alteListe.find((p) => p.station === "direktion");
    if (direktionsPerson) {
      alt.direktion = [{ name: direktionsPerson.name, rolle: "Ärztliche Direktion" }];
    }

    ["blackwater", "rhodes"].forEach((stationKey) => {
      const mitglieder = alteListe.filter((p) => p.station === stationKey);
      mitglieder.forEach((person, index) => {
        if (index < alt[stationKey].length) {
          alt[stationKey][index] = { name: person.name, rolle: person.rolle };
        }
      });
    });

    migriereZuNeuerStruktur(alt);
  }

  function speichereMitarbeiterliste() {
    docRef(MITARBEITER_DOC)
      .set({ stationen: stationenDaten, aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp() })
      .catch((fehler) => {
        console.error("Mitarbeiterliste konnte nicht gespeichert werden:", fehler);
        zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
      });
  }

  /* ------------------------------------------------------------------------
     10c. Firestore: Badge-Katalog (Fachgebiete/Zuständigkeiten) - getrennt
          von der Mitarbeiterliste, damit Admins Badges verwalten können,
          ohne Code zu ändern (siehe PERSONAL_BADGES_DOC).
     ------------------------------------------------------------------------ */
  function abonnierePersonalBadges() {
    if (unsubPersonalBadges) return Promise.resolve(); // bereits abonniert

    return new Promise((resolve) => {
      let ersterDurchlauf = true;

      unsubPersonalBadges = docRef(PERSONAL_BADGES_DOC).onSnapshot(
        (doc) => {
          if (doc.exists && Array.isArray(doc.data().fachgebiete)) {
            personalBadgesKatalog = {
              fachgebiete: doc.data().fachgebiete,
              zustaendigkeiten: Array.isArray(doc.data().zustaendigkeiten) ? doc.data().zustaendigkeiten : [],
            };
          } else {
            personalBadgesKatalog = {
              fachgebiete: [...DEFAULT_PERSONAL_BADGES.fachgebiete],
              zustaendigkeiten: [...DEFAULT_PERSONAL_BADGES.zustaendigkeiten],
            };
            speicherePersonalBadges();
          }

          renderMitarbeiterListe();

          if (ersterDurchlauf) {
            ersterDurchlauf = false;
            resolve();
          }
        },
        (fehler) => {
          console.error("Fehler beim Laden des Badge-Katalogs:", fehler);
          if (ersterDurchlauf) {
            ersterDurchlauf = false;
            resolve();
          }
        }
      );
    });
  }

  function speicherePersonalBadges() {
    docRef(PERSONAL_BADGES_DOC)
      .set({ ...personalBadgesKatalog, aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp() })
      .catch((fehler) => {
        console.error("Badge-Katalog konnte nicht gespeichert werden:", fehler);
        zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
      });
  }

  // Legt ein neues Badge im Katalog an (Admins können so jederzeit weitere
  // Fachgebiete/Zuständigkeiten ergänzen, ohne Code-Änderung).
  function fuegeBadgeHinzu(kategorie, label) {
    if (!istAdmin()) {
      zeigeToast("Nur Admins dürfen Badges verwalten.");
      return;
    }
    const bereinigt = (label || "").trim();
    if (!bereinigt) return;
    if (!Array.isArray(personalBadgesKatalog[kategorie])) return;
    const gibtEsSchon = personalBadgesKatalog[kategorie].some((b) => b.toLowerCase() === bereinigt.toLowerCase());
    if (gibtEsSchon) {
      zeigeToast("Dieses Badge gibt es schon.");
      return;
    }
    personalBadgesKatalog[kategorie] = [...personalBadgesKatalog[kategorie], bereinigt];
    speicherePersonalBadges();
  }

  // Entfernt ein Badge dauerhaft aus dem Katalog UND von allen Mitarbeitern,
  // denen es aktuell zugewiesen ist - verhindert "Karteileichen"-Badges, die
  // im Katalog gar nicht mehr existieren, aber irgendwo noch angezeigt würden.
  function entferneBadgeAusKatalog(kategorie, label) {
    if (!istAdmin()) {
      zeigeToast("Nur Admins dürfen Badges verwalten.");
      return;
    }
    if (!Array.isArray(personalBadgesKatalog[kategorie])) return;
    personalBadgesKatalog[kategorie] = personalBadgesKatalog[kategorie].filter((b) => b !== label);
    speicherePersonalBadges();

    const feld = kategorie === "fachgebiete" ? "specialties" : "badges";
    let geaendert = false;
    STATIONS_SCHLUESSEL.forEach((stationKey) => {
      (stationenDaten[stationKey] || []).forEach((slot) => {
        if (Array.isArray(slot[feld]) && slot[feld].includes(label)) {
          slot[feld] = slot[feld].filter((b) => b !== label);
          geaendert = true;
        }
      });
    });
    if (geaendert) speichereMitarbeiterliste();
  }

  /* ------------------------------------------------------------------------
     10c/10d. Benutzerverwaltung (echte Firebase-Accounts, verwaltet über
     js/auth.js / window.BenutzerVerwaltung - siehe Kommentar dort). Diese
     Sektion lädt/rendert nur die Liste und reicht Klicks an die Funktionen
     aus window.BenutzerVerwaltung weiter; die eigentliche Firestore-Logik
     (inkl. Security Rules) lebt komplett in js/auth.js.
     ------------------------------------------------------------------------ */
  function istAdmin() {
    return !!(aktuellerNutzer && aktuellerNutzer.admin);
  }

  // Abonniert die komplette Nutzerliste - aber NUR, wenn der aktuelle
  // Nutzer Admin ist, weil Firestore Security Rules Nicht-Admins den
  // "list"-Zugriff auf die users-Collection ohnehin verweigern (siehe
  // firestore.rules). Läuft bewusst dauerhaft im Hintergrund ab dem
  // Login (nicht erst beim Öffnen des Admin-Reiters), damit die
  // Anzeige "X ausstehend" am Reiter sowie der Hinweis-Toast bei neuen
  // Registrierungen auch dann funktionieren, wenn der Admin gerade auf
  // einer ganz anderen Seite ist.
  function abonniereBenutzerlisteFallsAdmin() {
    if (!istAdmin()) {
      if (unsubBenutzerliste) {
        unsubBenutzerliste();
        unsubBenutzerliste = null;
      }
      benutzerListe = [];
      bekanntePendingUids = null;
      aktualisiereAdminBadge();
      return;
    }
    if (unsubBenutzerliste || !window.BenutzerVerwaltung) return; // bereits abonniert

    unsubBenutzerliste = window.BenutzerVerwaltung.onListe((liste) => {
      const neuePendingUids = new Set(liste.filter((u) => u.status === "pending").map((u) => u.uid));

      // Neue Registrierungsanfrage(n) erkannt (waren beim letzten Laden
      // noch nicht "pending") -> kurzer Hinweis-Toast, damit ein Admin es
      // auch mitbekommt, wenn er gerade nicht im Admin-Reiter ist. Beim
      // allerersten Laden (bekanntePendingUids ist noch null) wird
      // bewusst KEIN Toast gezeigt, sonst würde jede bereits bestehende
      // Anfrage bei jedem Login fälschlich wie "neu" wirken.
      if (bekanntePendingUids) {
        liste
          .filter((u) => u.status === "pending" && !bekanntePendingUids.has(u.uid))
          .forEach((u) => zeigeToast(`Neue Registrierung: „${u.username || "unbekannt"}“ wartet auf Freigabe.`));
      }
      bekanntePendingUids = neuePendingUids;

      benutzerListe = liste;
      aktualisiereAdminBadge();
      renderBenutzerverwaltung();
    });
  }

  // Analog zu abonniereBenutzerlisteFallsAdmin(), nur für das
  // Aktivitäts-Log-Kärtchen im Admin Panel.
  function abonniereAdminLogFallsAdmin() {
    if (!istAdmin()) {
      if (unsubAdminLog) {
        unsubAdminLog();
        unsubAdminLog = null;
      }
      adminLogEintraege = [];
      return;
    }
    if (unsubAdminLog || !window.BenutzerVerwaltung || !window.BenutzerVerwaltung.onLog) return;

    unsubAdminLog = window.BenutzerVerwaltung.onLog((liste) => {
      adminLogEintraege = liste;
      renderAdminLog();
    });
  }

  function renderAdminLog() {
    if (!el.adminLogListe) return;
    el.adminLogListe.innerHTML = "";

    if (adminLogEintraege.length === 0) {
      el.adminLogListe.innerHTML = `<p class="notes-empty">Noch keine Aktivitäten protokolliert.</p>`;
      return;
    }

    adminLogEintraege.forEach((eintrag) => {
      const zeile = document.createElement("div");
      zeile.className = "admin-log__item";
      const zielText = eintrag.zielName ? ` „${escapeHtml(eintrag.zielName)}“` : "";
      const detailsText = eintrag.details ? ` (${escapeHtml(eintrag.details)})` : "";
      zeile.innerHTML = `
        <span class="admin-log__item-text"><strong>${escapeHtml(eintrag.adminName || "Unbekannt")}</strong> — ${escapeHtml(eintrag.aktion || "")}${zielText}${detailsText}</span>
        <span class="admin-log__item-zeit">${formatiereFirestoreZeitstempel(eintrag.zeitpunkt)}</span>
      `;
      el.adminLogListe.appendChild(zeile);
    });
  }

  // Rechnet aus, wie viele volle Tage seit einem Firestore-Timestamp
  // vergangen sind - für den "wartet seit X Tag(en)"-Hinweis bei
  // ausstehenden Registrierungen.
  function tageSeit(ts) {
    if (!ts || typeof ts.toDate !== "function") return null;
    const vergangeneMs = Date.now() - ts.toDate().getTime();
    return Math.max(0, Math.floor(vergangeneMs / (24 * 60 * 60 * 1000)));
  }

  // Zeigt die Anzahl ausstehender Registrierungsanfragen als kleine
  // Zahl-Pille direkt am "Admin"-Reiter (nur sichtbar, wenn es welche
  // gibt), damit ein Admin es sofort sieht, ohne extra reinklicken zu
  // müssen.
  function aktualisiereAdminBadge() {
    if (!el.navAdminBadge) return;
    const anzahl = benutzerListe.filter((u) => u.status === "pending").length;
    el.navAdminBadge.textContent = String(anzahl);
    el.navAdminBadge.hidden = anzahl === 0;
  }

  // Formatiert einen Firestore-Timestamp (Modular-SDK-Objekt mit .toDate())
  // in ein deutsches Datum+Uhrzeit-Format, oder zeigt "—", falls (noch)
  // kein Wert vorhanden ist (z. B. lastLogin bei einem ganz neuen Account).
  function formatiereFirestoreZeitstempel(ts) {
    if (!ts || typeof ts.toDate !== "function") return "—";
    const datum = ts.toDate();
    return `${String(datum.getDate()).padStart(2, "0")}.${String(datum.getMonth() + 1).padStart(2, "0")}.${datum.getFullYear()} ${String(
      datum.getHours()
    ).padStart(2, "0")}:${String(datum.getMinutes()).padStart(2, "0")}`;
  }

  const BENUTZER_STATUS_LABEL = {
    pending: "Ausstehend",
    approved: "Freigegeben",
    rejected: "Abgelehnt",
    locked: "Gesperrt",
  };

  // Blendet den "Admin"-Reiter in der Top-Navigation nur für echte Admins
  // ein. Wird direkt nach dem Login (appStarten) UND bei jeder Live-
  // Änderung des eigenen Profils aufgerufen (siehe bwm:auth-profile-updated
  // weiter oben) - damit z. B. ein Nutzer, dem gerade live die Admin-Rechte
  // entzogen werden, den Reiter sofort verliert und nicht mehr sieht,
  // statt erst beim nächsten Neuladen der Seite.
  function aktualisiereAdminNavSichtbarkeit() {
    if (el.navAdminToggle) el.navAdminToggle.hidden = !istAdmin();

    // Startet (bzw. beendet) die Live-Nutzerliste direkt hier, nicht erst
    // beim Öffnen des Admin-Reiters - nur so kann die Anzahl-Pille am
    // Reiter und der Toast bei neuen Registrierungen auch dann
    // funktionieren, wenn der Admin gerade auf einer anderen Seite ist.
    abonniereBenutzerlisteFallsAdmin();
    abonniereAdminLogFallsAdmin();

    // Falls jemand gerade auf einer der beiden Admin-Unterseiten ist und in
    // genau diesem Moment seine Admin-Rechte verliert: automatisch zur
    // Startseite zurückschicken, statt ihn auf einer Seite zu lassen, die
    // für ihn eigentlich gar nicht mehr sichtbar sein soll.
    const aufAdminSeite =
      (el.viewAdmin && el.viewAdmin.classList.contains("view--active")) ||
      (el.viewAdminLog && el.viewAdminLog.classList.contains("view--active"));
    if (!istAdmin() && aufAdminSeite) {
      const startNavItem = document.querySelector('.nav__item[data-view="start"]');
      if (startNavItem) startNavItem.click();
    }
  }

  // Baut den Inhalt des Detail-Modals für EINEN Benutzer (Badges, Meta-
  // Infos, Rang, Notiz, alle Aktions-Buttons). Wird sowohl beim Öffnen des
  // Modals als auch bei jeder Live-Aktualisierung der Nutzerliste erneut
  // aufgerufen, damit der Inhalt immer aktuell ist, während das Modal
  // offen ist (z. B. wenn parallel jemand anders eine Änderung macht).
  function baueBenutzerDetailsHtml(person) {
    const statusLabel = BENUTZER_STATUS_LABEL[person.status] || person.status;

    const rollenOptionen = BENUTZER_RAENGE.map(
      (rolle) => `<option value="${escapeHtml(rolle)}" ${rolle === person.rolle ? "selected" : ""}>${escapeHtml(rolle)}</option>`
    ).join("");

    // "geschuetzt: true" (nur manuell in der Firebase-Konsole setzbar, z. B.
    // beim ersten Admin-Account) blockiert serverseitig per Security Rules,
    // dass diesem Account die Admin-Rechte entzogen, der Status weggeändert
    // oder der Account gelöscht werden kann - siehe firestore.rules
    // (verletztUnantastbarkeit()). Hier in der Anzeige blenden wir die
    // entsprechenden Buttons deshalb erst gar nicht ein, statt den Admin
    // erst klicken zu lassen und dann einen Firestore-Fehler zu zeigen.
    const istUnantastbar = !!person.geschuetzt;

    let statusAktionenHtml = "";
    if (person.status === "pending") {
      statusAktionenHtml = `<button type="button" class="btn btn--secondary" data-role="benutzer-freigeben" data-uid="${person.uid}">Freigeben</button>
               <button type="button" class="btn btn--secondary" data-role="benutzer-ablehnen" data-uid="${person.uid}">Ablehnen</button>`;
    } else if (person.status === "locked") {
      statusAktionenHtml = `<button type="button" class="btn btn--secondary" data-role="benutzer-entsperren" data-uid="${person.uid}">Entsperren</button>`;
    } else if (person.status === "rejected") {
      // Eine Ablehnung ist keine endgültige Sackgasse - falls sie aus
      // Versehen passiert ist oder sich die Einschätzung nachträglich
      // ändert, kann ein Admin die Person jederzeit doch noch freigeben
      // (nutzt denselben "Freigeben"-Button/Handler wie bei "pending").
      statusAktionenHtml = `<button type="button" class="btn btn--secondary" data-role="benutzer-freigeben" data-uid="${person.uid}">Doch freigeben</button>`;
    } else if (!istUnantastbar) {
      // Dauer-Auswahl direkt neben dem "Sperren"-Button - "Dauerhaft"
      // setzt keine gesperrtBis-Zeit, die anderen Optionen sperren
      // befristet (siehe sperreBenutzer() in js/auth.js). Die Uhrzeit,
      // ab der die Sperre wieder endet, wird serverseitig über die
      // Firestore Security Rules geprüft, nicht nur im Frontend.
      statusAktionenHtml = `
        <select class="field-input settings-list__sperr-dauer-select" data-role="benutzer-sperr-dauer" data-uid="${person.uid}">
          <option value="0">Dauerhaft</option>
          <option value="1">1 Tag</option>
          <option value="3">3 Tage</option>
          <option value="7">7 Tage</option>
          <option value="30">30 Tage</option>
        </select>
        <button type="button" class="btn btn--secondary" data-role="benutzer-sperren" data-uid="${person.uid}">Sperren</button>`;
    }

    const adminAktionHtml =
      istUnantastbar && person.isAdmin
        ? ""
        : `<button type="button" class="btn btn--secondary" data-role="benutzer-admin-umschalten" data-uid="${person.uid}" data-aktuell="${!!person.isAdmin}">${person.isAdmin ? "Admin entziehen" : "Zum Admin machen"}</button>`;

    // "Passwort zurücksetzen" nur möglich, wenn eine E-Mail-Adresse auf
    // dem Profil hinterlegt ist - fehlt bei Accounts, die vor Einführung
    // dieses Felds registriert wurden (dann wird der Button einfach nicht
    // angezeigt statt später mit einem Firestore-Fehler zu scheitern).
    const passwortResetHtml = person.email
      ? `<button type="button" class="btn btn--secondary" data-role="benutzer-passwort-reset" data-uid="${person.uid}" data-name="${escapeHtml(person.username || "")}" data-email="${escapeHtml(person.email)}">Passwort zurücksetzen</button>`
      : "";

    const loeschenHtml = istUnantastbar
      ? ""
      : `<button type="button" class="icon-btn icon-btn--delete" data-role="benutzer-loeschen" data-uid="${person.uid}" data-name="${escapeHtml(person.username || "")}" title="Löschen">${ICON_TRASH}</button>`;

    const wartetTage = person.status === "pending" ? tageSeit(person.createdAt) : null;
    const wartetHtml =
      wartetTage !== null && wartetTage >= 1
        ? `<span class="settings-list__meta-text">Wartet seit ${wartetTage} Tag${wartetTage === 1 ? "" : "en"}</span>`
        : "";

    return `
      <div class="settings-list__user-main">
        <span class="settings-list__status-pill settings-list__status-pill--${person.status}">${escapeHtml(statusLabel)}</span>
        ${person.isAdmin ? '<span class="settings-list__protected">Admin</span>' : ""}
        ${istUnantastbar ? '<span class="settings-list__protected" title="Kann nicht entzogen, gesperrt oder gelöscht werden">Geschützt</span>' : ""}
      </div>
      <div class="settings-list__user-meta" style="margin-top: 10px;">
        <span class="settings-list__meta-text">Registriert: ${formatiereFirestoreZeitstempel(person.createdAt)}</span>
        <span class="settings-list__meta-text">Letzter Login: ${formatiereFirestoreZeitstempel(person.lastLogin)}</span>
        ${
          person.status === "locked"
            ? `<span class="settings-list__meta-text">${
                person.gesperrtBis
                  ? `Gesperrt bis: ${formatiereFirestoreZeitstempel(person.gesperrtBis)}`
                  : "Dauerhaft gesperrt"
              }</span>`
            : ""
        }
        ${wartetHtml}
      </div>

      <label class="field-label" style="margin-top: 14px;">Rang</label>
      <select class="field-input settings-list__rolle-select" data-role="benutzer-rolle" data-uid="${person.uid}" style="width: 100%; flex: none;">${rollenOptionen}</select>

      <label class="field-label">Interne Notiz (nur für Admins sichtbar)</label>
      <input type="text" class="field-input settings-list__note-input" data-role="benutzer-notiz" data-uid="${person.uid}" placeholder="z. B. Kontext zu einer Sperre..." value="${escapeHtml(person.adminNote || "")}" style="width: 100%; flex: none;" />

      <div class="settings-list__user-actions" style="margin-top: 16px;">
        ${statusAktionenHtml}
        ${adminAktionHtml}
        ${passwortResetHtml}
        <button type="button" class="btn btn--secondary" data-role="benutzer-umbenennen" data-uid="${person.uid}" data-name="${escapeHtml(person.username || "")}">Umbenennen</button>
        ${loeschenHtml}
      </div>
    `;
  }

  // Öffnet das Detail-Modal für genau einen Benutzer - alle Infos und
  // Aktionen laufen jetzt hier zusammen, statt (wie früher) direkt in der
  // Zeile der Liste zu stehen.
  function oeffneBenutzerDetailModal(uid) {
    const person = benutzerListe.find((u) => u.uid === uid);
    if (!person || !el.modalBenutzerDetails) return;
    aktiverDetailUid = uid;
    el.benutzerDetailsName.textContent = person.username || "(ohne Namen)";
    el.benutzerDetailsBody.innerHTML = baueBenutzerDetailsHtml(person);
    oeffneModal(el.modalBenutzerDetails);
  }

  function renderBenutzerverwaltung() {
    if (!el.benutzerverwaltungListe) return;

    aktualisiereAdminNavSichtbarkeit();
    if (!istAdmin()) return;

    abonniereBenutzerlisteFallsAdmin();

    el.benutzerverwaltungListe.innerHTML = "";

    if (benutzerListe.length === 0) {
      el.benutzerverwaltungListe.innerHTML = `<p class="notes-empty">Noch keine Benutzer vorhanden.</p>`;
    } else {
      const suchbegriff = benutzerSuche.trim().toLowerCase();
      const gefiltert = suchbegriff
        ? benutzerListe.filter((u) => (u.username || "").toLowerCase().includes(suchbegriff))
        : benutzerListe;

      // Ausstehende Anfragen zuerst, damit Admins sie nicht übersehen.
      const sortiert = [...gefiltert].sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (b.status === "pending" && a.status !== "pending") return 1;
        return (a.username || "").localeCompare(b.username || "");
      });

      if (sortiert.length === 0) {
        el.benutzerverwaltungListe.innerHTML = `<p class="notes-empty">Kein Benutzer gefunden.</p>`;
      } else {
        // Bewusst eine einfache, vereinfachte Zeile pro Benutzer (Name,
        // Status, Rang) statt aller Aktionen direkt hier - ein Klick auf
        // die Zeile öffnet das Detail-Modal mit allen Infos und Aktionen
        // (siehe oeffneBenutzerDetailModal/baueBenutzerDetailsHtml oben).
        sortiert.forEach((person) => {
          const zeile = document.createElement("div");
          zeile.className = "settings-list__item settings-list__item--clickable";
          zeile.dataset.uid = person.uid;
          zeile.setAttribute("role", "button");
          zeile.setAttribute("tabindex", "0");

          const statusLabel = BENUTZER_STATUS_LABEL[person.status] || person.status;
          const istUnantastbar = !!person.geschuetzt;
          const wartetTage = person.status === "pending" ? tageSeit(person.createdAt) : null;
          const wartetHtml =
            wartetTage !== null && wartetTage >= 1
              ? `<span class="settings-list__wartet-hinweis">wartet seit ${wartetTage} Tag${wartetTage === 1 ? "" : "en"}</span>`
              : "";

          zeile.innerHTML = `
            <div class="settings-list__user-row-main">
              <span class="settings-list__name">${escapeHtml(person.username || "(ohne Namen)")}</span>
              <span class="settings-list__status-pill settings-list__status-pill--${person.status}">${escapeHtml(statusLabel)}</span>
              ${person.isAdmin ? '<span class="settings-list__protected">Admin</span>' : ""}
              ${istUnantastbar ? '<span class="settings-list__protected" title="Kann nicht entzogen, gesperrt oder gelöscht werden">Geschützt</span>' : ""}
              ${wartetHtml}
            </div>
            <span class="settings-list__user-row-rolle">${escapeHtml(person.rolle || "")}</span>
          `;
          el.benutzerverwaltungListe.appendChild(zeile);
        });
      }
    }

    // Detail-Modal live aktualisieren, falls es gerade offen ist (z. B.
    // ändert sich der Status durch genau die Aktion, die man gerade im
    // Modal ausgelöst hat, oder ein anderer Admin ändert währenddessen
    // etwas an derselben Person).
    if (aktiverDetailUid && el.modalBenutzerDetails && el.modalBenutzerDetails.classList.contains("modal-overlay--visible")) {
      const aktuellePerson = benutzerListe.find((u) => u.uid === aktiverDetailUid);
      if (aktuellePerson) {
        el.benutzerDetailsName.textContent = aktuellePerson.username || "(ohne Namen)";
        el.benutzerDetailsBody.innerHTML = baueBenutzerDetailsHtml(aktuellePerson);
      } else {
        // Person wurde gerade gelöscht, während das Modal offen war.
        schliesseModal(el.modalBenutzerDetails);
        aktiverDetailUid = null;
      }
    }
  }

  if (el.formAddBenutzer) {
    el.formAddBenutzer.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!istAdmin() || !window.BenutzerVerwaltung) return;

      const username = el.neuerBenutzerNameInput.value.trim();
      const email = el.neuerBenutzerEmailInput.value.trim();
      const rolle = el.neuerBenutzerRolleInput.value;
      if (!username || !email) return;

      try {
        await window.BenutzerVerwaltung.erstelleNeuenBenutzer({ username, email, rolle });
        el.neuerBenutzerNameInput.value = "";
        el.neuerBenutzerEmailInput.value = "";
        zeigeToast(`„${username}“ wurde angelegt und bekommt eine E-Mail zum Passwort festlegen.`);
      } catch (fehler) {
        console.error("Benutzer konnte nicht erstellt werden:", fehler);
        zeigeToast(fehler && fehler.message ? fehler.message : "Benutzer konnte nicht erstellt werden.");
      }
    });
  }

  if (el.benutzerverwaltungSearchInput) {
    el.benutzerverwaltungSearchInput.addEventListener("input", (event) => {
      benutzerSuche = event.target.value;
      renderBenutzerverwaltung();
    });
  }

  if (el.benutzerverwaltungListe) {
    // Klick (oder Enter/Leertaste bei Tastaturbedienung) auf eine Zeile
    // öffnet das Detail-Modal für genau diesen Benutzer.
    el.benutzerverwaltungListe.addEventListener("click", (event) => {
      const zeile = event.target.closest("[data-uid]");
      if (zeile) oeffneBenutzerDetailModal(zeile.dataset.uid);
    });
    el.benutzerverwaltungListe.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const zeile = event.target.closest("[data-uid]");
      if (!zeile) return;
      event.preventDefault();
      oeffneBenutzerDetailModal(zeile.dataset.uid);
    });
  }

  // Alle eigentlichen Admin-Aktionen (Rolle ändern, Notiz speichern,
  // Freigeben/Ablehnen/Sperren/Entsperren, Admin-Rechte, Passwort-Reset,
  // Umbenennen, Löschen) laufen jetzt über Klicks/Änderungen INNERHALB des
  // Detail-Modals, nicht mehr direkt in der Liste (siehe
  // baueBenutzerDetailsHtml oben für das Markup).
  if (el.benutzerDetailsBody) {
    el.benutzerDetailsBody.addEventListener("change", (event) => {
      if (!istAdmin() || !window.BenutzerVerwaltung) return;

      const rolleSelect = event.target.closest('[data-role="benutzer-rolle"]');
      if (rolleSelect) {
        const person = benutzerListe.find((u) => u.uid === rolleSelect.dataset.uid);
        window.BenutzerVerwaltung.setzeRolle(rolleSelect.dataset.uid, rolleSelect.value, person && person.username).catch(
          (fehler) => console.error("Rolle konnte nicht geändert werden:", fehler)
        );
      }
    });

    // Notiz-Feld: erst beim Verlassen des Feldes speichern (nicht bei jedem
    // Tastendruck), damit nicht bei jedem Buchstaben ein Schreibvorgang
    // ausgelöst wird.
    el.benutzerDetailsBody.addEventListener(
      "blur",
      (event) => {
        if (!istAdmin() || !window.BenutzerVerwaltung) return;
        const notizInput = event.target.closest && event.target.closest('[data-role="benutzer-notiz"]');
        if (notizInput) {
          window.BenutzerVerwaltung.setzeNotiz(notizInput.dataset.uid, notizInput.value).catch((fehler) =>
            console.error("Notiz konnte nicht gespeichert werden:", fehler)
          );
        }
      },
      true
    );

    el.benutzerDetailsBody.addEventListener("click", async (event) => {
      if (!istAdmin() || !window.BenutzerVerwaltung) return;

      const freigebenBtn = event.target.closest('[data-role="benutzer-freigeben"]');
      const ablehnenBtn = event.target.closest('[data-role="benutzer-ablehnen"]');
      const sperrenBtn = event.target.closest('[data-role="benutzer-sperren"]');
      const entsperrenBtn = event.target.closest('[data-role="benutzer-entsperren"]');
      const adminBtn = event.target.closest('[data-role="benutzer-admin-umschalten"]');
      const passwortResetBtn = event.target.closest('[data-role="benutzer-passwort-reset"]');
      const umbenennenBtn = event.target.closest('[data-role="benutzer-umbenennen"]');
      const loeschenBtn = event.target.closest('[data-role="benutzer-loeschen"]');

      try {
        if (freigebenBtn) {
          const person = benutzerListe.find((u) => u.uid === freigebenBtn.dataset.uid);
          await window.BenutzerVerwaltung.setzeStatus(freigebenBtn.dataset.uid, "approved", person && person.username);
          zeigeToast("Benutzer freigegeben.");
        } else if (ablehnenBtn) {
          const person = benutzerListe.find((u) => u.uid === ablehnenBtn.dataset.uid);
          await window.BenutzerVerwaltung.setzeStatus(ablehnenBtn.dataset.uid, "rejected", person && person.username);
          zeigeToast("Registrierung abgelehnt.");
        } else if (sperrenBtn) {
          // Die Dauer-Auswahl steht als <select> direkt daneben im Modal -
          // Wert "0" bedeutet dauerhafte Sperre.
          const dauerSelect = el.benutzerDetailsBody.querySelector(
            `[data-role="benutzer-sperr-dauer"][data-uid="${sperrenBtn.dataset.uid}"]`
          );
          const tage = dauerSelect ? Number(dauerSelect.value) : 0;
          const person = benutzerListe.find((u) => u.uid === sperrenBtn.dataset.uid);
          await window.BenutzerVerwaltung.sperreBenutzer(sperrenBtn.dataset.uid, tage, person && person.username);
          zeigeToast(tage > 0 ? `Benutzer für ${tage} Tag(e) gesperrt.` : "Benutzer dauerhaft gesperrt.");
        } else if (entsperrenBtn) {
          const person = benutzerListe.find((u) => u.uid === entsperrenBtn.dataset.uid);
          await window.BenutzerVerwaltung.entsperreBenutzer(entsperrenBtn.dataset.uid, person && person.username);
          zeigeToast("Benutzer entsperrt.");
        } else if (adminBtn) {
          const neuerWert = adminBtn.dataset.aktuell !== "true";
          const person = benutzerListe.find((u) => u.uid === adminBtn.dataset.uid);
          await window.BenutzerVerwaltung.setzeAdmin(adminBtn.dataset.uid, neuerWert, person && person.username);
          zeigeToast(neuerWert ? "Admin-Rechte vergeben." : "Admin-Rechte entzogen.");
        } else if (passwortResetBtn) {
          const email = passwortResetBtn.dataset.email;
          const name = passwortResetBtn.dataset.name;
          if (email) {
            await window.BenutzerVerwaltung.sendePasswortReset(email, passwortResetBtn.dataset.uid, name);
            zeigeToast(`Passwort-Zurücksetzen-E-Mail an „${name}“ verschickt.`);
          }
        } else if (umbenennenBtn) {
          const alterName = umbenennenBtn.dataset.name;
          const neuerName = window.prompt("Neuer Benutzername:", alterName);
          if (neuerName && neuerName.trim() && neuerName.trim() !== alterName) {
            await window.BenutzerVerwaltung.benenneUm(umbenennenBtn.dataset.uid, neuerName.trim(), alterName);
            zeigeToast("Benutzername geändert.");
          }
        } else if (loeschenBtn) {
          const name = loeschenBtn.dataset.name;
          const uid = loeschenBtn.dataset.uid;
          // Wichtiger Hinweis im Dialog: Das löscht das komplette Profil
          // (Rolle/Rechte/Notiz/Registrierungsdatum usw.) UND den
          // reservierten Benutzernamen sofort und unwiderruflich - die
          // Person hat danach garantiert keinerlei Zugriff mehr auf
          // irgendwelche Daten der App. Der reine Login-Eintrag (E-Mail +
          // Passwort) bleibt aus technischen Gründen in Firebase
          // Authentication selbst bestehen (das kann aus dem Browser
          // heraus nicht gelöscht werden) - falls gewünscht, kann dieser
          // separat und manuell in der Firebase-Konsole entfernt werden
          // (Authentication -> Nutzer -> UID suchen -> Löschen).
          if (
            window.confirm(
              `„${name}“ wirklich vollständig löschen?\n\nDas entfernt Profil, Rolle und alle Rechte sofort - der Zugriff auf die App ist danach garantiert weg.\n\nUID (für die Firebase-Konsole, falls du den reinen Login-Eintrag zusätzlich manuell entfernen willst): ${uid}`
            )
          ) {
            await window.BenutzerVerwaltung.loesche(uid);
            zeigeToast(`„${name}“ wurde gelöscht.`);
            if (el.modalBenutzerDetails) schliesseModal(el.modalBenutzerDetails);
            aktiverDetailUid = null;
          }
        }
      } catch (fehler) {
        console.error("Aktion in der Benutzerverwaltung fehlgeschlagen:", fehler);
        zeigeToast(fehler && fehler.message ? fehler.message : "Aktion fehlgeschlagen.");
      }
    });
  }

  /* ------------------------------------------------------------------------
     10a2. Admin: Unter-Reiter "Benutzer" / "Aktivitäts-Log" - dasselbe
     Muster wie bei Verkauf (Medikamente/Verkaufslog) und Infos (Allgemein/
     Personal/Herstellung): zwei eigene Seiten mit einer kleinen Tab-Leiste
     oben, statt alles auf einer einzigen, langen Seite untereinander zu
     stapeln. Eigenes Datenattribut "data-admin-subview" (statt des schon
     für Verkauf genutzten "data-subview"), damit sich die Klick-Handler
     nicht gegenseitig in die Quere kommen.
     ------------------------------------------------------------------------ */
  let aktiverAdminSubview = "admin"; // Standard-Unterseite beim Öffnen des Admin-Reiters

  const adminTabs = document.querySelectorAll(".org-tabs__tab[data-admin-subview]");
  adminTabs.forEach((item) => {
    item.addEventListener("click", () => {
      wechsleZuAdminAnsicht(item.dataset.adminSubview);
    });
  });

  function wechsleZuAdminAnsicht(subview) {
    if (!istAdmin()) return; // Sicherheitshalber - der ganze Reiter ist für Nicht-Admins ohnehin unsichtbar

    aktiverAdminSubview = subview;

    el.navItems.forEach((i) => i.classList.remove("nav__item--active"));
    if (el.navAdminToggle) el.navAdminToggle.classList.add("nav__item--active");
    adminTabs.forEach((i) => i.classList.toggle("org-tabs__tab--active", i.dataset.adminSubview === subview));

    el.views.forEach((view) => view.classList.remove("view--active"));
    const zielEl = document.getElementById(`view-${subview}`);
    if (zielEl) zielEl.classList.add("view--active");

    const pageHeader = document.getElementById("page-header");
    if (pageHeader) pageHeader.hidden = false;

    const meta = VIEW_META[subview];
    if (meta) {
      el.viewTitle.textContent = meta.title;
      el.viewSubtitle.textContent = meta.subtitle;
    }

    if (subview === "admin") renderBenutzerverwaltung();
    if (subview === "admin-log") renderAdminLog();
  }

  /* ------------------------------------------------------------------------
     10b. Notizen: Sidebar-Untermenü (Allgemein / Personal / Herstellung)
     ------------------------------------------------------------------------ */
  const NOTIZ_KATEGORIEN = {
    allgemein: { label: "Allgemeine Infos" },
    personal: { label: "Personal" },
    herstellung: { label: "Herstellung" },
  };

  let aktiveNotizKategorie = "allgemein"; // Standard-Kategorie beim Öffnen der Seite
  let letzteNotizen = [];                 // Zwischenspeicher für Kategorie-Filterung ohne Neu-Laden
  let notizenSuche = "";
  let unsubNotizenThemen = null;
  let notizenThemenKatalog = [];   // Live-Liste der Themen (siehe NOTIZEN_THEMEN_DOC)
  let notizenThemenVerwaltungOffen = false;
  let aktivesNotizThema = "alle";  // Themen-Filter ("alle" = kein Filter)
  let notizSortierung = "neueste"; // "neueste" oder "aelteste"
  let notizenSeite = 1;            // aktuelle Pagination-Seite

  const navNotizenToggle = document.getElementById("nav-notizen-toggle");
  const notizenTabs = document.querySelectorAll(".org-tabs__tab[data-kategorie]");

  notizenTabs.forEach((item) => {
    item.addEventListener("click", () => {
      wechsleZuNotizenAnsicht(item.dataset.kategorie);
    });
  });

  function wechsleZuNotizenAnsicht(kategorie) {
    aktiveNotizKategorie = kategorie;
    notizenSeite = 1; // Beim Wechsel des Reiters immer wieder auf Seite 1 beginnen

    // Topbar: "Infos" als aktiv markieren, alle anderen Hauptpunkte
    // deaktivieren. Die Kategorie selbst wird direkt auf der Seite über
    // Tabs gesteuert (kein Dropdown mehr).
    el.navItems.forEach((i) => i.classList.remove("nav__item--active"));
    if (navNotizenToggle) navNotizenToggle.classList.add("nav__item--active");
    notizenTabs.forEach((i) => i.classList.toggle("org-tabs__tab--active", i.dataset.kategorie === kategorie));

    // Verkauf-Aktiv-Status entfernen (immer nur ein Hauptpunkt gleichzeitig aktiv)
    if (navVerkaufToggle) {
      navVerkaufToggle.classList.remove("nav__item--active");
    }

    // Hauptansicht wechseln
    el.views.forEach((view) => view.classList.remove("view--active"));
    document.getElementById("view-notizen").classList.add("view--active");

    const pageHeader = document.getElementById("page-header");
    if (pageHeader) pageHeader.hidden = false;

    const kategorieInfo = NOTIZ_KATEGORIEN[kategorie];
    el.viewTitle.textContent = "Infos";
    el.viewSubtitle.textContent = "Interne Informationen & Dokumente";

    aktualisierePlatzhalterNotizfeld();
    renderNotizen();
  }

  const notesSearchInput = document.getElementById("notes-search");
  if (notesSearchInput) {
    notesSearchInput.addEventListener("input", (event) => {
      notizenSuche = event.target.value;
      renderNotizen();
    });
  }

  /* ------------------------------------------------------------------------
     10b2. Verkauf: kein Dropdown mehr - Tabs direkt auf der Seite
     ------------------------------------------------------------------------ */
  let aktiverVerkaufSubview = "medikamente"; // Standard-Unterseite beim Öffnen

  const navVerkaufToggle = document.getElementById("nav-verkauf-toggle");
  const verkaufTabs = document.querySelectorAll(".org-tabs__tab[data-subview]");

  verkaufTabs.forEach((item) => {
    item.addEventListener("click", () => {
      wechsleZuVerkaufAnsicht(item.dataset.subview);
    });
  });

  function wechsleZuVerkaufAnsicht(subview) {
    aktiverVerkaufSubview = subview;

    // Sicherheitshalber immer mit ausgeschaltetem Sortiermodus starten, wenn
    // die Seite (neu) betreten wird.
    if (subview === "medikamente" && medikamenteSortierModus) {
      medikamenteSortierModus = false;
      renderTabelle();
    }

    // Sidebar: "Verkauf" als aktiv markieren
    el.navItems.forEach((i) => i.classList.remove("nav__item--active"));
    if (navVerkaufToggle) navVerkaufToggle.classList.add("nav__item--active");
    verkaufTabs.forEach((i) => i.classList.toggle("org-tabs__tab--active", i.dataset.subview === subview));

    // Hauptansicht wechseln
    el.views.forEach((view) => view.classList.remove("view--active"));
    document.getElementById(`view-${subview}`).classList.add("view--active");

    const pageHeader = document.getElementById("page-header");
    if (pageHeader) pageHeader.hidden = false;

    const meta = VIEW_META[subview];
    if (meta) {
      el.viewTitle.textContent = meta.title;
      el.viewSubtitle.textContent = meta.subtitle;
    }
  }

  function aktualisiereKategorieBadge() {
    const badge = document.getElementById("notes-kategorie-badge");
    if (!badge) return;
    const kategorieInfo = NOTIZ_KATEGORIEN[aktiveNotizKategorie];
    badge.className = `notes-kategorie-badge notes-kategorie-badge--${aktiveNotizKategorie}`;
    badge.textContent = kategorieInfo.label;
  }

  function aktualisierePlatzhalterNotizfeld() {
    if (!el.noteInput) return;
    const kategorieInfo = NOTIZ_KATEGORIEN[aktiveNotizKategorie];
    el.noteInput.setAttribute("data-placeholder", `${kategorieInfo.label} eintragen...`);
  }
  aktualisierePlatzhalterNotizfeld();

  // Leitet für alte Einträge (vor Einführung des Titel-Felds) eine
  // vernünftige Überschrift aus dem bisherigen Text ab, statt eine leere
  // Titel-Zeile anzuzeigen - rein zur Anzeige, verändert nichts in Firestore.
  function ableiteNotizTitelFallback(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    const reinerText = (tmp.textContent || "").trim().replace(/\s+/g, " ");
    if (!reinerText) return "(Ohne Titel)";
    return reinerText.length > 70 ? reinerText.slice(0, 70).trim() + "…" : reinerText;
  }

  function abonniereNotizen() {
    unsubNotizen = db
      .collection(NOTIZEN_COLLECTION)
      .orderBy("zeitpunkt", "desc")
      .limit(50)
      .onSnapshot(
        (snapshot) => {
          const notizen = [];
          snapshot.forEach((doc) => {
            const d = doc.data();
            // Alte "wichtig"-Notizen (aus der Zeit vor dieser Umstellung)
            // werden automatisch als "Allgemeine Infos" behandelt.
            const kategorie = d.kategorie && NOTIZ_KATEGORIEN[d.kategorie] ? d.kategorie : "allgemein";
            const millis = d.zeitpunkt && d.zeitpunkt.toMillis ? d.zeitpunkt.toMillis() : Date.now();
            notizen.push({
              id: doc.id,
              titel: d.titel && d.titel.trim() ? d.titel : ableiteNotizTitelFallback(d.text),
              text: d.text,
              autor: d.autor,
              rolle: d.rolle || "",
              kategorie: kategorie,
              thema: d.thema || "",
              hervorgehoben: !!d.hervorgehoben,
              millis,
              aktualisiertMillis: d.zuletztBearbeitet && d.zuletztBearbeitet.toMillis ? d.zuletztBearbeitet.toMillis() : millis,
            });
          });
          letzteNotizen = notizen;
          renderNotizen();
        },
        (fehler) => console.error("Fehler beim Laden der Notizen:", fehler)
      );
  }

  /* ------------------------------------------------------------------------
     10b3. Firestore: Themen-Katalog der Infos-Seite (siehe NOTIZEN_THEMEN_DOC)
     - NICHT zu verwechseln mit den festen Reitern (NOTIZ_KATEGORIEN oben).
     ------------------------------------------------------------------------ */
  function normalisiertesNotizThema(thema) {
    const wert = (thema || "").trim();
    if (wert && notizenThemenKatalog.includes(wert)) return wert;
    return NOTIZ_THEMA_FALLBACK;
  }

  function notizThemaFarbe(name) {
    const bereinigt = (name || "").trim();
    if (NOTIZ_THEMA_FARBEN_STANDARD[bereinigt]) return NOTIZ_THEMA_FARBEN_STANDARD[bereinigt];
    const schluessel = bereinigt.toLowerCase();
    let hash = 0;
    for (let i = 0; i < schluessel.length; i++) hash = (hash * 31 + schluessel.charCodeAt(i)) >>> 0;
    return NOTIZ_THEMA_FARBEN[hash % NOTIZ_THEMA_FARBEN.length];
  }

  function notizThemaBadge(thema) {
    const anzeige = normalisiertesNotizThema(thema);
    const farbe = notizThemaFarbe(anzeige);
    return `<span class="note-item__kategorie note-item__kategorie--${farbe}">${escapeHtml(anzeige)}</span>`;
  }

  function notizThemenOptionen(aktuellesThema) {
    const ausgewaehlt = normalisiertesNotizThema(aktuellesThema);
    return notizenThemenKatalog
      .map((t) => `<option value="${escapeHtml(t)}"${t === ausgewaehlt ? " selected" : ""}>${escapeHtml(t)}</option>`)
      .join("");
  }

  function abonniereNotizenThemen() {
    if (unsubNotizenThemen) return;
    unsubNotizenThemen = docRef(NOTIZEN_THEMEN_DOC).onSnapshot(
      (doc) => {
        let geaendert = false;
        if (doc.exists && Array.isArray(doc.data().themen) && doc.data().themen.length) {
          notizenThemenKatalog = doc.data().themen;
        } else {
          notizenThemenKatalog = [...DEFAULT_NOTIZ_THEMEN];
          geaendert = true;
        }
        if (!notizenThemenKatalog.includes(NOTIZ_THEMA_FALLBACK)) {
          notizenThemenKatalog = [...notizenThemenKatalog, NOTIZ_THEMA_FALLBACK];
          geaendert = true;
        }
        if (geaendert) speichereNotizenThemen();
        aktualisiereNotizThemaAuswahl();
        renderNotizen();
      },
      (fehler) => console.error("Fehler beim Laden der Info-Themen:", fehler)
    );
  }

  function speichereNotizenThemen() {
    docRef(NOTIZEN_THEMEN_DOC)
      .set({ themen: notizenThemenKatalog, aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp() })
      .catch((fehler) => {
        console.error("Info-Themen konnten nicht gespeichert werden:", fehler);
        zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
      });
  }

  // Hält das Themen-Auswahlfeld im "Neuen Eintrag erstellen"-Formular UND
  // den Themen-Filter in der Filterleiste aktuell.
  function aktualisiereNotizThemaAuswahl() {
    if (el.notizThemaInput) {
      const vorher = el.notizThemaInput.value;
      el.notizThemaInput.innerHTML = notizenThemenKatalog.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
      if (notizenThemenKatalog.includes(vorher)) el.notizThemaInput.value = vorher;
    }

    if (el.notesThemaFilter) {
      const vorherFilter = el.notesThemaFilter.options.length ? el.notesThemaFilter.value : aktivesNotizThema;
      el.notesThemaFilter.innerHTML =
        `<option value="alle">Alle Kategorien</option>` +
        notizenThemenKatalog.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
      el.notesThemaFilter.value = vorherFilter === "alle" || notizenThemenKatalog.includes(vorherFilter) ? vorherFilter : "alle";
    }
  }

  // Legt ein neues Thema im Katalog an (Admins können so jederzeit weitere
  // Kategorien ergänzen, ohne Code-Änderung).
  function fuegeNotizThemaHinzu(name) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Kategorien verwalten.");
    const bereinigt = (name || "").trim();
    if (!bereinigt) return;
    if (notizenThemenKatalog.some((t) => t.toLowerCase() === bereinigt.toLowerCase())) {
      zeigeToast("Diese Kategorie gibt es schon.");
      return;
    }
    notizenThemenKatalog = [...notizenThemenKatalog, bereinigt];
    speichereNotizenThemen();
  }

  // Benennt ein Thema um UND überträgt die Änderung (Kaskade) auf alle
  // Einträge, die aktuell dieses Thema tragen.
  function benenneNotizThemaUm(alterName, neuerNameRoh) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Kategorien verwalten.");
    if (alterName === NOTIZ_THEMA_FALLBACK) return zeigeToast('„Sonstiges“ kann nicht umbenannt werden.');
    const neuerName = (neuerNameRoh || "").trim();
    if (!neuerName) return zeigeToast("Bitte einen Namen eingeben.");
    if (neuerName === alterName) return;
    if (notizenThemenKatalog.some((t) => t.toLowerCase() === neuerName.toLowerCase())) {
      zeigeToast("Diese Kategorie gibt es schon.");
      return;
    }

    notizenThemenKatalog = notizenThemenKatalog.map((t) => (t === alterName ? neuerName : t));
    speichereNotizenThemen();

    const betroffene = letzteNotizen.filter((n) => n.thema === alterName);
    if (betroffene.length) {
      const batch = db.batch();
      betroffene.forEach((n) => batch.update(db.collection(NOTIZEN_COLLECTION).doc(n.id), { thema: neuerName }));
      batch.commit().catch((fehler) => console.error("Themen-Umbenennung konnte nicht auf alle Einträge übertragen werden:", fehler));
    }
    if (aktivesNotizThema === alterName) aktivesNotizThema = neuerName;
    zeigeToast(`Kategorie in „${neuerName}“ umbenannt.`);
  }

  // Entfernt ein Thema dauerhaft aus dem Katalog - bewusst OHNE Kaskade auf
  // bestehende Einträge: ein Eintrag mit einem inzwischen gelöschten Thema
  // wird automatisch als "Sonstiges" angezeigt und gezählt (siehe
  // normalisiertesNotizThema).
  function entferneNotizThema(name) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Kategorien verwalten.");
    if (name === NOTIZ_THEMA_FALLBACK) return zeigeToast('„Sonstiges“ kann nicht gelöscht werden.');
    notizenThemenKatalog = notizenThemenKatalog.filter((t) => t !== name);
    speichereNotizenThemen();
    if (aktivesNotizThema === name) aktivesNotizThema = "alle";
    renderNotizen();
  }

  /* ------------------------------------------------------------------------
     10a2. Kontakte: Telegramm-Verzeichnis (BW-Nummer + Name + Beruf/Rolle +
           Notiz). Die Rollen (Beruf) sind NICHT hart codiert, sondern in
           einem eigenen, von Admins verwaltbaren Firestore-Katalog
           gespeichert (siehe KONTAKTE_ROLLEN_DOC weiter oben) - genau wie
           schon beim Badge-Katalog der Personal-Seite.
     ------------------------------------------------------------------------ */
  let letzteKontakte = [];
  let kontakteSuchbegriff = "";
  let kontakteRollenVerwaltungOffen = false; // Auf-/Zuklappen des Admin-Panels in der Sidebar

  // Liefert die tatsächlich anzuzeigende/zu zählende Rolle eines Kontakts:
  // die gespeicherte Rolle, sofern sie aktuell im Katalog existiert - sonst
  // (z. B. weil ein Admin die Rolle inzwischen gelöscht hat) automatisch
  // "Sonstiges". Dadurch braucht das Löschen einer Rolle KEINE Kaskade auf
  // bestehende Kontakte (siehe entferneKontaktRolle).
  function normalisierterKontaktBeruf(beruf) {
    const wert = (beruf || "").trim();
    if (wert && kontakteRollenKatalog.includes(wert)) return wert;
    return KONTAKTE_ROLLEN_FALLBACK;
  }

  // Start-Farbzuordnung für die Standard-Rollen - wird beim allerersten Laden
  // in Firestore geschrieben und ist DANACH von Admins frei änderbar (siehe
  // "Rollen verwalten"-Panel/setzeKontaktRollenFarbe). Es werden KEINE neuen
  // Farben erfunden, nur die immer schon vorhandenen fünf Akzentfarben
  // (oxblood/sage/personal/slate/brass) unterschiedlich zugewiesen.
  const DEFAULT_KONTAKTE_ROLLEN_FARBEN = {
    "Bürger": "slate",
    Arzt: "oxblood",
    Sheriff: "personal",
    Rancher: "sage",
    Schmied: "brass",
    Schreiner: "slate",
    Sonstiges: "slate",
  };

  // Auswahl-Optionen für den Farb-Dropdown im "Rollen verwalten"-Panel -
  // dieselben fünf Akzentfarben, mit deutscher Bezeichnung.
  const KONTAKT_ROLLEN_FARBOPTIONEN = [
    { wert: "oxblood", label: "Rot" },
    { wert: "personal", label: "Blau" },
    { wert: "sage", label: "Grün" },
    { wert: "brass", label: "Gold" },
    { wert: "slate", label: "Grau" },
  ];

  function kontaktRollenFarbe(name) {
    const bereinigt = (name || "").trim();
    if (kontakteRollenFarben[bereinigt]) return kontakteRollenFarben[bereinigt];
    // Für Rollen ohne (noch) zugewiesene Farbe: deterministisch (per
    // Namens-Hash) eine der fünf Akzentfarben verwenden, statt irgendeine
    // Rolle dauerhaft ungefärbt zu lassen.
    const schluessel = bereinigt.toLowerCase();
    let hash = 0;
    for (let i = 0; i < schluessel.length; i++) hash = (hash * 31 + schluessel.charCodeAt(i)) >>> 0;
    return KONTAKT_ROLLEN_FARBEN[hash % KONTAKT_ROLLEN_FARBEN.length];
  }

  // Admins können die Farbe einer Rolle jederzeit ändern (siehe
  // "Rollen verwalten"-Panel) - unabhängig vom Namen, ohne Code-Änderung.
  function setzeKontaktRollenFarbe(rolle, farbe) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Rollen verwalten.");
    if (!KONTAKT_ROLLEN_FARBEN.includes(farbe)) return;
    kontakteRollenFarben = { ...kontakteRollenFarben, [rolle]: farbe };
    speichereKontakteRollen();
  }

  function kontaktRollenBadge(beruf) {
    const anzeige = normalisierterKontaktBeruf(beruf);
    const farbe = kontaktRollenFarbe(anzeige);
    return `<span class="kontakt-badge kontakt-badge--${farbe}">${escapeHtml(anzeige)}</span>`;
  }

  // <option>-Liste für die Beruf/Rolle-Auswahlfelder (Hinzufügen + Bearbeiten)
  function kontakteRollenOptionen(aktuellerBeruf) {
    const ausgewaehlt = normalisierterKontaktBeruf(aktuellerBeruf);
    return kontakteRollenKatalog
      .map((rolle) => `<option value="${escapeHtml(rolle)}"${rolle === ausgewaehlt ? " selected" : ""}>${escapeHtml(rolle)}</option>`)
      .join("");
  }

  // Hält das feste Beruf/Rolle-Auswahlfeld im "Neuen Kontakt eintragen"-
  // Formular aktuell (dieses Feld wird NICHT bei jedem Kontakt-Render neu
  // aufgebaut, deshalb ein eigener kleiner Sync statt Teil von renderKontakteListe).
  function aktualisiereKontaktBerufAuswahl() {
    if (!el.kontaktBerufInput) return;
    const vorher = el.kontaktBerufInput.value;
    el.kontaktBerufInput.innerHTML = kontakteRollenKatalog.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
    if (kontakteRollenKatalog.includes(vorher)) el.kontaktBerufInput.value = vorher;
  }

  function abonniereKontakte() {
    db.collection(KONTAKTE_COLLECTION).onSnapshot(
      (snapshot) => {
        const kontakte = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          const erstelltMillis = d.zeitpunkt && d.zeitpunkt.toMillis ? d.zeitpunkt.toMillis() : Date.now();
          kontakte.push({
            id: doc.id,
            nummer: d.nummer || "",
            name: d.name || "",
            beruf: d.beruf || "",
            notiz: d.notiz || "",
            autor: d.autor || "",
            millis: erstelltMillis,
            aktualisiertMillis: d.zuletztAktualisiert && d.zuletztAktualisiert.toMillis ? d.zuletztAktualisiert.toMillis() : erstelltMillis,
          });
        });
        // Nach der Nummer sortiert (numerisch, aufsteigend – niedrigste zuerst)
        kontakte.sort((a, b) => {
          const na = Number(a.nummer.replace(/\D/g, "")) || 0;
          const nb = Number(b.nummer.replace(/\D/g, "")) || 0;
          return na - nb;
        });
        letzteKontakte = kontakte;
        renderKontakte();
      },
      (fehler) => console.error("Fehler beim Laden der Kontakte:", fehler)
    );
  }

  // Umbrella-Funktion: aktualisiert Liste, Rollen-Filter (mit Zählern),
  // Schnellinfo-Box und (nur für Admins) das Rollen-Verwaltungs-Panel.
  function renderKontakte() {
    renderKontakteListe();
    renderKontakteRollenFilter();
    renderKontakteSchnellinfo();
    renderKontakteRollenVerwaltung();
  }

  function renderKontakteListe() {
    if (!el.kontaktList) return;

    const aktivesElement = document.activeElement;
    if (el.kontaktList.contains(aktivesElement) && (aktivesElement.tagName === "INPUT" || aktivesElement.tagName === "SELECT")) {
      return; // Nicht mitten im Tippen/Bearbeiten neu aufbauen
    }

    const begriff = kontakteSuchbegriff.trim().toLowerCase();
    const gefiltert = letzteKontakte.filter((k) => {
      if (aktiveKontaktRolle !== "alle" && normalisierterKontaktBeruf(k.beruf) !== aktiveKontaktRolle) return false;
      if (!begriff) return true;
      return (
        k.nummer.toLowerCase().includes(begriff) ||
        k.name.toLowerCase().includes(begriff) ||
        k.notiz.toLowerCase().includes(begriff)
      );
    });

    if (el.kontakteMainTitel) {
      el.kontakteMainTitel.textContent = aktiveKontaktRolle === "alle" ? "Alle Kontakte" : aktiveKontaktRolle;
    }

    el.kontaktList.innerHTML = "";
    el.kontakteEmpty.hidden = letzteKontakte.length !== 0;
    el.kontakteNoResults.hidden = !(letzteKontakte.length > 0 && gefiltert.length === 0);

    gefiltert.forEach((k) => {
      const darfBearbeiten = istAdmin() || (aktuellerNutzer && k.autor === aktuellerNutzer.name);
      const zeile = document.createElement("div");
      zeile.className = "kontakt-row";
      zeile.innerHTML = `
        <span class="kontakt-row__nummer" data-role="copy-kontakt" data-nummer="${escapeHtml(k.nummer)}" title="Klicken zum Kopieren">${escapeHtml(k.nummer)}</span>
        <span class="kontakt-row__name">${escapeHtml(k.name)}</span>
        <span class="kontakt-row__rolle">${kontaktRollenBadge(k.beruf)}</span>
        <span class="kontakt-row__notiz">${k.notiz ? escapeHtml(k.notiz) : "—"}</span>
        <span class="kontakt-row__aktionen">
          ${
            darfBearbeiten
              ? `
                <button type="button" class="icon-btn icon-btn--edit" data-role="toggle-edit-kontakt" data-id="${k.id}" title="Kontakt bearbeiten">${ICON_EDIT}</button>
                <button type="button" class="icon-btn icon-btn--delete" data-role="delete-kontakt" data-id="${k.id}" title="Kontakt löschen">${ICON_TRASH}</button>
              `
              : ""
          }
        </span>
      `;
      el.kontaktList.appendChild(zeile);

      if (darfBearbeiten) {
        const bearbeitenZeile = document.createElement("div");
        bearbeitenZeile.className = "kontakt-edit-form";
        bearbeitenZeile.id = `kontakt-edit-${k.id}`;
        bearbeitenZeile.hidden = true;
        const ziffernOhnePrefix = k.nummer.replace(/^BW-/, "");
        bearbeitenZeile.innerHTML = `
          <div class="kontakt-nummer-field">
            <span class="kontakt-nummer-field__prefix">BW-</span>
            <input type="text" inputmode="numeric" value="${escapeHtml(ziffernOhnePrefix)}" data-role="edit-kontakt-nummer" />
          </div>
          <input type="text" class="field-input" value="${escapeHtml(k.name)}" placeholder="Name" data-role="edit-kontakt-name" style="flex: 1 1 200px;" />
          <select class="field-input" data-role="edit-kontakt-beruf" style="flex: 0 0 150px;">${kontakteRollenOptionen(k.beruf)}</select>
          <input type="text" class="field-input" value="${escapeHtml(k.notiz)}" placeholder="Notiz" data-role="edit-kontakt-notiz" style="flex: 1 1 200px;" />
          <button type="button" class="btn btn--primary" data-role="confirm-edit-kontakt" data-id="${k.id}">Speichern</button>
        `;
        el.kontaktList.appendChild(bearbeitenZeile);
      }
    });
  }

  // Linke Sidebar: Filterliste "Beruf / Rolle" inkl. Kontakt-Zähler je Rolle
  // (unabhängig von der aktuellen Textsuche - genau wie die bestehenden
  // Kategorien-Filter auf der Infos-Seite).
  function renderKontakteRollenFilter() {
    if (!el.kontakteRollenListe) return;

    const zaehler = {};
    letzteKontakte.forEach((k) => {
      const rolle = normalisierterKontaktBeruf(k.beruf);
      zaehler[rolle] = (zaehler[rolle] || 0) + 1;
    });

    const eintraege = [
      { label: "Alle Kontakte", wert: "alle", anzahl: letzteKontakte.length },
      ...kontakteRollenKatalog.map((rolle) => ({ label: rolle, wert: rolle, anzahl: zaehler[rolle] || 0 })),
    ];

    el.kontakteRollenListe.innerHTML = eintraege
      .map(
        (e) => `
          <button type="button" class="wiki-kategorie${e.wert === aktiveKontaktRolle ? " wiki-kategorie--active" : ""}" data-rolle="${escapeHtml(e.wert)}">
            <span>${escapeHtml(e.label)}</span><span class="wiki-kategorie__count">${e.anzahl}</span>
          </button>
        `
      )
      .join("");

    el.kontakteRollenListe.querySelectorAll(".wiki-kategorie").forEach((btn) => {
      btn.addEventListener("click", () => {
        aktiveKontaktRolle = btn.dataset.rolle;
        renderKontakteListe();
        renderKontakteRollenFilter();
      });
    });
  }

  // "Schnellinfo"-Kasten unten in der Sidebar - rein informativ, kein Filter.
  function renderKontakteSchnellinfo() {
    if (!el.kontakteSchnellinfo) return;

    const heute = new Date();
    const istHeute = (millis) => {
      const d = new Date(millis);
      return d.getFullYear() === heute.getFullYear() && d.getMonth() === heute.getMonth() && d.getDate() === heute.getDate();
    };
    const heuteHinzugefuegt = letzteKontakte.filter((k) => istHeute(k.millis)).length;

    let letzteAktualisierung = "—";
    if (letzteKontakte.length) {
      const neuesteMillis = Math.max(...letzteKontakte.map((k) => k.aktualisiertMillis || k.millis));
      letzteAktualisierung = formatiereZeitstempel(neuesteMillis);
    }

    el.kontakteSchnellinfo.innerHTML = `
      <div class="kontakte-schnellinfo__zeile">
        <span>Kontakte insgesamt</span><span class="kontakte-schnellinfo__wert">${letzteKontakte.length}</span>
      </div>
      <div class="kontakte-schnellinfo__zeile">
        <span>Heute hinzugefügt</span><span class="kontakte-schnellinfo__wert">${heuteHinzugefuegt}</span>
      </div>
      <div class="kontakte-schnellinfo__zeile">
        <span>Letzte Aktualisierung</span><span class="kontakte-schnellinfo__wert">${letzteAktualisierung}</span>
      </div>
    `;
  }

  // Admin-Panel "Rollen verwalten": neue Rollen anlegen, bestehende umbenennen
  // (mit Kaskade auf betroffene Kontakte) oder löschen (ohne Kaskade - siehe
  // normalisierterKontaktBeruf). Der feste Auffangwert "Sonstiges" kann weder
  // umbenannt noch gelöscht werden.
  function renderKontakteRollenVerwaltung() {
    if (!el.kontakteRollenVerwaltung) return;
    const admin = istAdmin();
    if (el.btnToggleKontakteRollen) el.btnToggleKontakteRollen.hidden = !admin;
    el.kontakteRollenVerwaltung.hidden = !admin || !kontakteRollenVerwaltungOffen;
    if (!admin || !kontakteRollenVerwaltungOffen) return;

    const aktivesElement = document.activeElement;
    if (el.kontakteRollenVerwaltung.contains(aktivesElement) && (aktivesElement.tagName === "INPUT" || aktivesElement.tagName === "SELECT")) {
      return;
    }

    const farbAuswahl = (rolle) => {
      const aktuelleFarbe = kontaktRollenFarbe(rolle);
      return `
        <select class="field-input rollen-katalog__farbe-select" data-role="rollen-farbe-auswahl" data-rolle="${escapeHtml(rolle)}" title="Badge-Farbe">
          ${KONTAKT_ROLLEN_FARBOPTIONEN.map(
            (opt) => `<option value="${opt.wert}"${opt.wert === aktuelleFarbe ? " selected" : ""}>${opt.label}</option>`
          ).join("")}
        </select>
      `;
    };

    const zeilen = kontakteRollenKatalog
      .map((rolle) => {
        const gesperrt = rolle === KONTAKTE_ROLLEN_FALLBACK;
        return `
          <div class="rollen-katalog__zeile">
            <input type="text" class="field-input" value="${escapeHtml(rolle)}" data-role="rollen-umbenennen-input" data-alt="${escapeHtml(rolle)}" ${gesperrt ? "disabled" : ""} />
            ${farbAuswahl(rolle)}
            ${
              gesperrt
                ? `<span class="rollen-katalog__hinweis" title="Fester Auffangwert für Kontakte ohne (mehr) gültige Rolle">Standardwert – nicht änderbar</span>`
                : `
                  <div class="rollen-katalog__zeile-aktionen">
                    <button type="button" class="btn btn--ghost rollen-katalog__speichern-btn" data-role="rollen-umbenennen" data-alt="${escapeHtml(rolle)}">Speichern</button>
                    <button type="button" class="badge-pill__entfernen" data-role="rollen-entfernen" data-rolle="${escapeHtml(rolle)}" title="Rolle löschen">${ICON_X_KLEIN}</button>
                  </div>
                `
            }
          </div>
        `;
      })
      .join("");

    el.kontakteRollenVerwaltung.innerHTML = `
      <div class="rollen-katalog__liste">${zeilen}</div>
      <div class="rollen-katalog__neu">
        <input type="text" id="rollen-katalog-neu-input" class="field-input" placeholder="Neue Rolle..." autocomplete="off" />
        <button type="button" class="btn btn--ghost" id="rollen-katalog-hinzufuegen-btn">Hinzufügen</button>
      </div>
    `;
  }

  /* ------------------------------------------------------------------------
     10a3. Firestore: Rollen-Katalog der Kontakte-Seite (siehe KONTAKTE_ROLLEN_DOC)
     ------------------------------------------------------------------------ */
  function abonniereKontakteRollen() {
    if (unsubKontakteRollen) return;

    unsubKontakteRollen = docRef(KONTAKTE_ROLLEN_DOC).onSnapshot(
      (doc) => {
        let geaendert = false;
        if (doc.exists && Array.isArray(doc.data().rollen) && doc.data().rollen.length) {
          kontakteRollenKatalog = doc.data().rollen;
        } else {
          kontakteRollenKatalog = [...DEFAULT_KONTAKTE_ROLLEN];
          geaendert = true;
        }
        if (doc.exists && doc.data().farben && typeof doc.data().farben === "object") {
          kontakteRollenFarben = { ...doc.data().farben };
        } else {
          kontakteRollenFarben = { ...DEFAULT_KONTAKTE_ROLLEN_FARBEN };
          geaendert = true;
        }
        // Der Auffangwert "Sonstiges" muss immer vorhanden sein.
        if (!kontakteRollenKatalog.includes(KONTAKTE_ROLLEN_FALLBACK)) {
          kontakteRollenKatalog = [...kontakteRollenKatalog, KONTAKTE_ROLLEN_FALLBACK];
          geaendert = true;
        }
        if (geaendert) speichereKontakteRollen();
        aktualisiereKontaktBerufAuswahl();
        renderKontakte();
      },
      (fehler) => console.error("Fehler beim Laden der Kontakt-Rollen:", fehler)
    );
  }

  function speichereKontakteRollen() {
    docRef(KONTAKTE_ROLLEN_DOC)
      .set({ rollen: kontakteRollenKatalog, farben: kontakteRollenFarben, aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp() })
      .catch((fehler) => {
        console.error("Kontakt-Rollen konnten nicht gespeichert werden:", fehler);
        zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
      });
  }

  // Legt eine neue Rolle im Katalog an (Admins können so jederzeit weitere
  // Berufe/Rollen ergänzen, z. B. Bestatter, Richter, Fotograf, ...).
  function fuegeKontaktRolleHinzu(name) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Rollen verwalten.");
    const bereinigt = (name || "").trim();
    if (!bereinigt) return;
    if (kontakteRollenKatalog.some((r) => r.toLowerCase() === bereinigt.toLowerCase())) {
      zeigeToast("Diese Rolle gibt es schon.");
      return;
    }
    kontakteRollenKatalog = [...kontakteRollenKatalog, bereinigt];
    speichereKontakteRollen();
  }

  // Benennt eine Rolle um UND überträgt die Änderung (Kaskade) auf alle
  // Kontakte, die aktuell diese Rolle tragen.
  function benenneKontaktRolleUm(alterName, neuerNameRoh) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Rollen verwalten.");
    if (alterName === KONTAKTE_ROLLEN_FALLBACK) return zeigeToast('„Sonstiges“ kann nicht umbenannt werden.');
    const neuerName = (neuerNameRoh || "").trim();
    if (!neuerName) return zeigeToast("Bitte einen Namen eingeben.");
    if (neuerName === alterName) return;
    if (kontakteRollenKatalog.some((r) => r.toLowerCase() === neuerName.toLowerCase())) {
      zeigeToast("Diese Rolle gibt es schon.");
      return;
    }

    kontakteRollenKatalog = kontakteRollenKatalog.map((r) => (r === alterName ? neuerName : r));
    // Farbzuweisung unter dem neuen Namen fortführen (nicht auf Standardfarbe zurückfallen).
    if (kontakteRollenFarben[alterName]) {
      const { [alterName]: farbeDesAltenNamens, ...rest } = kontakteRollenFarben;
      kontakteRollenFarben = { ...rest, [neuerName]: farbeDesAltenNamens };
    }
    speichereKontakteRollen();

    const betroffene = letzteKontakte.filter((k) => k.beruf === alterName);
    if (betroffene.length) {
      const batch = db.batch();
      betroffene.forEach((k) => batch.update(db.collection(KONTAKTE_COLLECTION).doc(k.id), { beruf: neuerName }));
      batch.commit().catch((fehler) => console.error("Rollen-Umbenennung konnte nicht auf alle Kontakte übertragen werden:", fehler));
    }
    if (aktiveKontaktRolle === alterName) aktiveKontaktRolle = neuerName;
    zeigeToast(`Rolle in „${neuerName}“ umbenannt.`);
  }

  // Entfernt eine Rolle dauerhaft aus dem Katalog - bewusst OHNE Kaskade auf
  // bestehende Kontakte: ein Kontakt mit einer inzwischen gelöschten Rolle
  // wird automatisch als "Sonstiges" angezeigt und gezählt (siehe
  // normalisierterKontaktBeruf).
  function entferneKontaktRolle(name) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Rollen verwalten.");
    if (name === KONTAKTE_ROLLEN_FALLBACK) return zeigeToast('„Sonstiges“ kann nicht gelöscht werden.');
    kontakteRollenKatalog = kontakteRollenKatalog.filter((r) => r !== name);
    if (kontakteRollenFarben[name]) {
      const { [name]: entfernteFarbe, ...rest } = kontakteRollenFarben;
      kontakteRollenFarben = rest;
    }
    speichereKontakteRollen();
    if (aktiveKontaktRolle === name) aktiveKontaktRolle = "alle";
    renderKontakte();
  }

  // Nummernfeld: nur Ziffern erlauben, "BW-" wird automatisch vorangestellt
  if (el.kontaktNummerInput) {
    el.kontaktNummerInput.addEventListener("input", () => {
      el.kontaktNummerInput.value = el.kontaktNummerInput.value.replace(/\D/g, "");
    });
  }

  if (el.formKontakt) {
    el.formKontakt.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!aktuellerNutzer) return;

      const ziffern = el.kontaktNummerInput.value.trim();
      const name = el.kontaktNameInput.value.trim();
      const beruf = normalisierterKontaktBeruf(el.kontaktBerufInput ? el.kontaktBerufInput.value : "");
      const notiz = el.kontaktNotizInput.value.trim();

      if (!ziffern) {
        zeigeToast("Bitte eine Telegramm-Nummer eingeben.");
        return;
      }
      if (!name) {
        zeigeToast("Bitte einen Namen eingeben.");
        return;
      }

      const nummer = `BW-${ziffern}`;

      if (letzteKontakte.some((k) => k.nummer === nummer)) {
        zeigeToast(`„${nummer}“ ist bereits eingetragen.`);
        return;
      }

      db.collection(KONTAKTE_COLLECTION)
        .add({
          nummer,
          name,
          beruf,
          notiz,
          autor: aktuellerNutzer.name,
          zeitpunkt: firebase.firestore.FieldValue.serverTimestamp(),
          zuletztAktualisiert: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .then(() => {
          el.kontaktNummerInput.value = "";
          el.kontaktNameInput.value = "";
          el.kontaktNotizInput.value = "";
          el.kontaktNummerInput.focus();
          zeigeToast(`„${nummer}“ (${name}) wurde eingetragen.`);
        })
        .catch((fehler) => {
          console.error("Kontakt konnte nicht gespeichert werden:", fehler);
          zeigeToast("Kontakt konnte nicht gespeichert werden.");
        });
    });
  }

  if (el.kontakteSearch) {
    el.kontakteSearch.addEventListener("input", (event) => {
      kontakteSuchbegriff = event.target.value;
      renderKontakteListe();
    });
  }

  if (el.btnToggleKontakteRollen) {
    el.btnToggleKontakteRollen.addEventListener("click", () => {
      kontakteRollenVerwaltungOffen = !kontakteRollenVerwaltungOffen;
      renderKontakteRollenVerwaltung();
    });
  }

  if (el.kontaktList) {
    el.kontaktList.addEventListener("click", (event) => {
      const copyBtn = event.target.closest('[data-role="copy-kontakt"]');
      if (copyBtn) {
        const nummer = copyBtn.dataset.nummer;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(nummer)
            .then(() => zeigeToast(`„${nummer}“ kopiert.`))
            .catch(() => zeigeToast("Kopieren fehlgeschlagen."));
        }
        return;
      }

      const toggleBtn = event.target.closest('[data-role="toggle-edit-kontakt"]');
      if (toggleBtn) {
        const form = document.getElementById(`kontakt-edit-${toggleBtn.dataset.id}`);
        if (form) {
          form.hidden = !form.hidden;
          if (!form.hidden) form.querySelector('[data-role="edit-kontakt-name"]').focus();
        }
        return;
      }

      const confirmBtn = event.target.closest('[data-role="confirm-edit-kontakt"]');
      if (confirmBtn) {
        const form = confirmBtn.closest(".kontakt-edit-form");
        const ziffern = form.querySelector('[data-role="edit-kontakt-nummer"]').value.replace(/\D/g, "");
        const name = form.querySelector('[data-role="edit-kontakt-name"]').value.trim();
        const beruf = normalisierterKontaktBeruf(form.querySelector('[data-role="edit-kontakt-beruf"]').value);
        const notiz = form.querySelector('[data-role="edit-kontakt-notiz"]').value.trim();

        if (!ziffern) return zeigeToast("Bitte eine gültige Nummer eingeben.");
        if (!name) return zeigeToast("Bitte einen Namen eingeben.");

        const neueNummer = `BW-${ziffern}`;
        if (letzteKontakte.some((k) => k.id !== confirmBtn.dataset.id && k.nummer === neueNummer)) {
          return zeigeToast(`„${neueNummer}“ ist bereits vergeben.`);
        }

        db.collection(KONTAKTE_COLLECTION)
          .doc(confirmBtn.dataset.id)
          .update({ nummer: neueNummer, name, beruf, notiz, zuletztAktualisiert: firebase.firestore.FieldValue.serverTimestamp() })
          .then(() => zeigeToast("Kontakt aktualisiert."))
          .catch((fehler) => {
            console.error("Kontakt konnte nicht aktualisiert werden:", fehler);
            zeigeToast("Kontakt konnte nicht aktualisiert werden.");
          });
        return;
      }

      const btn = event.target.closest('[data-role="delete-kontakt"]');
      if (!btn) return;
      const kontakt = letzteKontakte.find((k) => k.id === btn.dataset.id);
      db.collection(KONTAKTE_COLLECTION)
        .doc(btn.dataset.id)
        .delete()
        .then(() => zeigeToast(kontakt ? `„${kontakt.nummer}“ wurde gelöscht.` : "Kontakt wurde gelöscht."))
        .catch((fehler) => {
          console.error("Kontakt konnte nicht gelöscht werden:", fehler);
          zeigeToast("Kontakt konnte nicht gelöscht werden.");
        });
    });
  }

  // Rollen-Verwaltungs-Panel: Hinzufügen/Umbenennen/Löschen per Klick-Delegation.
  if (el.kontakteRollenVerwaltung) {
    el.kontakteRollenVerwaltung.addEventListener("click", (event) => {
      const entfernenBtn = event.target.closest('[data-role="rollen-entfernen"]');
      if (entfernenBtn) {
        entferneKontaktRolle(entfernenBtn.dataset.rolle);
        return;
      }

      const umbenennenBtn = event.target.closest('[data-role="rollen-umbenennen"]');
      if (umbenennenBtn) {
        const zeile = umbenennenBtn.closest(".rollen-katalog__zeile");
        const input = zeile.querySelector('[data-role="rollen-umbenennen-input"]');
        benenneKontaktRolleUm(umbenennenBtn.dataset.alt, input.value);
        return;
      }

      if (event.target.id === "rollen-katalog-hinzufuegen-btn") {
        const neuInput = document.getElementById("rollen-katalog-neu-input");
        if (!neuInput) return;
        fuegeKontaktRolleHinzu(neuInput.value);
      }
    });

    el.kontakteRollenVerwaltung.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (event.target.id === "rollen-katalog-neu-input") {
        event.preventDefault();
        const btn = document.getElementById("rollen-katalog-hinzufuegen-btn");
        if (btn) btn.click();
      }
    });

    el.kontakteRollenVerwaltung.addEventListener("change", (event) => {
      const farbSelect = event.target.closest('[data-role="rollen-farbe-auswahl"]');
      if (!farbSelect) return;
      setzeKontaktRollenFarbe(farbSelect.dataset.rolle, farbSelect.value);
    });
  }

  // Reine Anzeige-Berechnung für die Pagination-Buttons: erste Seite,
  // letzte Seite und ein kleines Fenster um die aktuelle Seite herum,
  // Lücken dazwischen als "…" markiert - bleibt auch bei vielen Seiten
  // schmal und übersichtlich.
  function berechnePaginationSeiten(aktuelle, gesamt) {
    const seiten = [];
    for (let i = 1; i <= gesamt; i++) {
      if (i === 1 || i === gesamt || (i >= aktuelle - 1 && i <= aktuelle + 1)) seiten.push(i);
    }
    const ergebnis = [];
    let letzte = 0;
    seiten.forEach((s) => {
      if (letzte && s - letzte > 1) ergebnis.push("…");
      ergebnis.push(s);
      letzte = s;
    });
    return ergebnis;
  }

  function aktualisiereNotizFormularSichtbarkeit() {
    if (el.notizHervorhebenLabel) el.notizHervorhebenLabel.hidden = !istAdmin();
  }

  function renderNotizen() {
    aktualisiereNotizFormularSichtbarkeit();
    if (el.btnToggleNotizenThemen) el.btnToggleNotizenThemen.hidden = !istAdmin();
    renderNotizenThemenVerwaltung();

    if (!el.notesList) return;

    const aktivesElement = document.activeElement;
    if (
      el.notesList.contains(aktivesElement) &&
      (aktivesElement.tagName === "INPUT" || aktivesElement.tagName === "SELECT" || aktivesElement.isContentEditable)
    ) {
      return; // Nicht mitten im Tippen/Bearbeiten neu aufbauen
    }

    let notizen = letzteNotizen.filter((n) => n.kategorie === aktiveNotizKategorie);

    if (aktivesNotizThema !== "alle") {
      notizen = notizen.filter((n) => normalisiertesNotizThema(n.thema) === aktivesNotizThema);
    }

    const begriff = notizenSuche.trim().toLowerCase();
    if (begriff) {
      notizen = notizen.filter(
        (n) =>
          n.titel.toLowerCase().includes(begriff) ||
          n.text.toLowerCase().includes(begriff) ||
          n.autor.toLowerCase().includes(begriff)
      );
    }

    // Hervorgehobene ("Wichtig" markierte) Einträge zuerst, unabhängig von
    // der gewählten Sortierung - innerhalb der beiden Gruppen greift die
    // gewählte Sortierung (neueste/älteste zuerst).
    notizen.sort((a, b) => {
      if (a.hervorgehoben !== b.hervorgehoben) return a.hervorgehoben ? -1 : 1;
      return notizSortierung === "aelteste" ? a.millis - b.millis : b.millis - a.millis;
    });

    const gesamtSeiten = Math.max(1, Math.ceil(notizen.length / NOTIZEN_SEITENGROESSE));
    if (notizenSeite > gesamtSeiten) notizenSeite = gesamtSeiten;
    if (notizenSeite < 1) notizenSeite = 1;
    const start = (notizenSeite - 1) * NOTIZEN_SEITENGROESSE;
    const seiteEintraege = notizen.slice(start, start + NOTIZEN_SEITENGROESSE);

    el.notesList.innerHTML = "";
    el.notesEmpty.hidden = notizen.length !== 0;
    if (el.notesEmpty && notizen.length === 0) {
      if (begriff || aktivesNotizThema !== "alle") {
        el.notesEmpty.textContent = "Keine Einträge gefunden, die zu deiner Suche/Auswahl passen.";
      } else {
        const kategorieInfo = NOTIZ_KATEGORIEN[aktiveNotizKategorie];
        el.notesEmpty.textContent = `Noch keine „${kategorieInfo.label}"-Einträge vorhanden.`;
      }
    }

    seiteEintraege.forEach((notiz) => {
      const darfBearbeiten = istAdmin() || (aktuellerNutzer && aktuellerNutzer.name === notiz.autor);
      const aktionen = darfBearbeiten
        ? `
          <button type="button" class="icon-btn icon-btn--edit" data-role="toggle-edit-notiz" data-id="${notiz.id}" title="Eintrag bearbeiten">${ICON_EDIT}</button>
          <button type="button" class="icon-btn icon-btn--delete note-item__delete" data-role="delete-notiz" data-id="${notiz.id}" title="Eintrag löschen">${ICON_TRASH}</button>
        `
        : "";
      const rolleText = notiz.rolle ? ` (${escapeHtml(notiz.rolle)})` : "";

      const eintrag = document.createElement("div");
      eintrag.className = `note-item note-item--${notiz.kategorie}${notiz.hervorgehoben ? " note-item--pinned" : ""}`;
      eintrag.innerHTML = `
        <div class="note-item__body">
          <div class="note-item__kopf">
            <h4 class="note-item__titel">${escapeHtml(notiz.titel)}</h4>
            ${notizThemaBadge(notiz.thema)}
          </div>
          <div class="note-item__text">${verarbeiteRichInhalt(notiz.text)}</div>
          <div class="note-item__meta">— ${escapeHtml(notiz.autor)}${rolleText} · ${formatiereZeitstempel(notiz.millis)} Uhr</div>
        </div>
        <div class="note-item__aktionen">${aktionen}</div>
      `;
      el.notesList.appendChild(eintrag);

      if (darfBearbeiten) {
        const bearbeitenForm = document.createElement("div");
        bearbeitenForm.className = "note-item-edit";
        bearbeitenForm.id = `notiz-edit-${notiz.id}`;
        bearbeitenForm.hidden = true;
        bearbeitenForm.innerHTML = `
          <input type="text" class="field-input" value="${escapeHtml(notiz.titel)}" placeholder="Titel..." maxlength="140" data-role="edit-notiz-titel" />
          <div class="format-toolbar" data-target="notiz-edit-text-${notiz.id}">
            <button type="button" class="format-btn" data-format="bold" title="Fett"><strong>F</strong></button>
            <button type="button" class="format-btn" data-format="underline" title="Unterstrichen"><u>U</u></button>
            <button type="button" class="format-btn" data-format="italic" title="Kursiv"><em>K</em></button>
            <span class="format-toolbar__divider"></span>
            <button type="button" class="format-btn" data-format="insertUnorderedList" title="Aufzählung"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none"></circle><line x1="9" y1="6" x2="20" y2="6"></line><line x1="9" y1="12" x2="20" y2="12"></line><line x1="9" y1="18" x2="20" y2="18"></line></svg></button>
            <button type="button" class="format-btn" data-format="insertOrderedList" title="Nummerierung"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><text x="1.5" y="8.5" font-size="6.5" fill="currentColor" stroke="none" font-family="sans-serif">1</text><text x="1.5" y="14.5" font-size="6.5" fill="currentColor" stroke="none" font-family="sans-serif">2</text><text x="1.5" y="20.5" font-size="6.5" fill="currentColor" stroke="none" font-family="sans-serif">3</text><line x1="9" y1="6" x2="20" y2="6"></line><line x1="9" y1="12" x2="20" y2="12"></line><line x1="9" y1="18" x2="20" y2="18"></line></svg></button>
          </div>
          <div class="notes-form__main">
            <div class="rich-editor" id="notiz-edit-text-${notiz.id}" contenteditable="true">${notiz.text}</div>
          </div>
          <div class="notes-form__fusszeile">
            <select class="field-input notes-form__thema-select" data-role="edit-notiz-thema">${notizThemenOptionen(notiz.thema)}</select>
            <label class="notes-form__hervorheben" ${istAdmin() ? "" : "hidden"}>
              <input type="checkbox" data-role="edit-notiz-hervorheben" ${notiz.hervorgehoben ? "checked" : ""} />
              Als „Wichtig" hervorheben
            </label>
            <button type="button" class="btn btn--primary" data-role="confirm-edit-notiz" data-id="${notiz.id}">Speichern</button>
          </div>
        `;
        el.notesList.appendChild(bearbeitenForm);
        // Die neu erzeugte Toolbar dieses Bearbeiten-Formulars ist beim
        // initialen Seitenaufbau noch nicht gebunden gewesen (existierte ja
        // noch nicht) - deshalb hier explizit nachholen (siehe bindeFormatToolbar).
        bearbeitenForm.querySelectorAll(".format-toolbar").forEach(bindeFormatToolbar);
      }
    });

    renderNotizenPagination(notizen.length, gesamtSeiten);
  }

  function renderNotizenPagination(gesamtEintraege, gesamtSeiten) {
    if (!el.notesPagination) return;
    if (gesamtEintraege === 0) {
      el.notesPagination.innerHTML = "";
      return;
    }

    const start = (notizenSeite - 1) * NOTIZEN_SEITENGROESSE + 1;
    const ende = Math.min(notizenSeite * NOTIZEN_SEITENGROESSE, gesamtEintraege);

    const seitenZahlen = berechnePaginationSeiten(notizenSeite, gesamtSeiten)
      .map((s) =>
        s === "…"
          ? `<span class="notes-pagination__ellipsis">…</span>`
          : `<button type="button" class="notes-pagination__btn${s === notizenSeite ? " notes-pagination__btn--aktiv" : ""}" data-seite="${s}">${s}</button>`
      )
      .join("");

    el.notesPagination.innerHTML = `
      <span class="notes-pagination__info">${start}–${ende} von ${gesamtEintraege} Einträgen</span>
      <div class="notes-pagination__buttons">
        <button type="button" class="notes-pagination__btn notes-pagination__btn--nav" data-seite="${notizenSeite - 1}" ${notizenSeite <= 1 ? "disabled" : ""} title="Vorherige Seite">«</button>
        ${seitenZahlen}
        <button type="button" class="notes-pagination__btn notes-pagination__btn--nav" data-seite="${notizenSeite + 1}" ${notizenSeite >= gesamtSeiten ? "disabled" : ""} title="Nächste Seite">»</button>
      </div>
    `;
  }

  // Admin-Panel "Themen verwalten" - analog zum Rollen-Panel der
  // Kontakte-Seite (dieselben CSS-Klassen wiederverwendet).
  function renderNotizenThemenVerwaltung() {
    if (!el.notizenThemenVerwaltung) return;
    const admin = istAdmin();
    el.notizenThemenVerwaltung.hidden = !admin || !notizenThemenVerwaltungOffen;
    if (!admin || !notizenThemenVerwaltungOffen) return;

    const aktivesElement = document.activeElement;
    if (el.notizenThemenVerwaltung.contains(aktivesElement) && (aktivesElement.tagName === "INPUT" || aktivesElement.tagName === "SELECT")) {
      return;
    }

    const zeilen = notizenThemenKatalog
      .map((thema) => {
        const gesperrt = thema === NOTIZ_THEMA_FALLBACK;
        return `
          <div class="rollen-katalog__zeile">
            <input type="text" class="field-input" value="${escapeHtml(thema)}" data-role="thema-umbenennen-input" data-alt="${escapeHtml(thema)}" ${gesperrt ? "disabled" : ""} />
            ${
              gesperrt
                ? `<span class="rollen-katalog__hinweis" title="Fester Auffangwert für Einträge ohne (mehr) gültiges Thema">Standardwert – nicht änderbar</span>`
                : `
                  <div class="rollen-katalog__zeile-aktionen">
                    <button type="button" class="btn btn--ghost rollen-katalog__speichern-btn" data-role="thema-umbenennen" data-alt="${escapeHtml(thema)}">Speichern</button>
                    <button type="button" class="badge-pill__entfernen" data-role="thema-entfernen" data-thema="${escapeHtml(thema)}" title="Thema löschen">${ICON_X_KLEIN}</button>
                  </div>
                `
            }
          </div>
        `;
      })
      .join("");

    el.notizenThemenVerwaltung.innerHTML = `
      <div class="rollen-katalog__liste">${zeilen}</div>
      <div class="rollen-katalog__neu">
        <input type="text" id="thema-katalog-neu-input" class="field-input" placeholder="Neue Kategorie..." autocomplete="off" />
        <button type="button" class="btn btn--ghost" id="thema-katalog-hinzufuegen-btn">Hinzufügen</button>
      </div>
    `;
  }

  el.formNote.addEventListener("submit", (event) => {
    event.preventDefault();
    const titel = el.notizTitelInput ? el.notizTitelInput.value.trim() : "";
    const text = el.noteInput.innerHTML.trim();
    const nurText = el.noteInput.textContent.trim();
    if (!titel) {
      zeigeToast("Bitte einen Titel eingeben.");
      return;
    }
    if (!nurText || !aktuellerNutzer) return;

    const thema = normalisiertesNotizThema(el.notizThemaInput ? el.notizThemaInput.value : "");
    const hervorgehoben = istAdmin() && el.notizHervorhebenInput ? el.notizHervorhebenInput.checked : false;

    db.collection(NOTIZEN_COLLECTION)
      .add({
        titel,
        text: sanitisiereRichText(text),
        autor: aktuellerNutzer.name,
        rolle: aktuellerNutzer.rolle,
        kategorie: aktiveNotizKategorie,
        thema,
        hervorgehoben,
        zeitpunkt: firebase.firestore.FieldValue.serverTimestamp(),
        zuletztBearbeitet: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        el.notizTitelInput.value = "";
        el.noteInput.innerHTML = "";
        if (el.notizHervorhebenInput) el.notizHervorhebenInput.checked = false;
      })
      .catch((fehler) => {
        console.error("Eintrag konnte nicht gespeichert werden:", fehler);
        zeigeToast("Eintrag konnte nicht gespeichert werden.");
      });
  });

  el.notesList.addEventListener("click", (event) => {
    const toggleBtn = event.target.closest('[data-role="toggle-edit-notiz"]');
    if (toggleBtn) {
      const form = document.getElementById(`notiz-edit-${toggleBtn.dataset.id}`);
      if (form) {
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector('[data-role="edit-notiz-titel"]').focus();
      }
      return;
    }

    const confirmBtn = event.target.closest('[data-role="confirm-edit-notiz"]');
    if (confirmBtn) {
      const form = confirmBtn.closest(".note-item-edit");
      const titel = form.querySelector('[data-role="edit-notiz-titel"]').value.trim();
      const textFeld = document.getElementById(`notiz-edit-text-${confirmBtn.dataset.id}`);
      const text = textFeld.innerHTML.trim();
      const nurText = textFeld.textContent.trim();
      const thema = normalisiertesNotizThema(form.querySelector('[data-role="edit-notiz-thema"]').value);
      const hervorhebenInput = form.querySelector('[data-role="edit-notiz-hervorheben"]');
      const hervorgehoben = istAdmin() && hervorhebenInput ? hervorhebenInput.checked : undefined;

      if (!titel) return zeigeToast("Bitte einen Titel eingeben.");
      if (!nurText) return zeigeToast("Der Eintrag darf nicht leer sein.");

      const aenderung = {
        titel,
        text: sanitisiereRichText(text),
        thema,
        zuletztBearbeitet: firebase.firestore.FieldValue.serverTimestamp(),
      };
      if (hervorgehoben !== undefined) aenderung.hervorgehoben = hervorgehoben;

      db.collection(NOTIZEN_COLLECTION)
        .doc(confirmBtn.dataset.id)
        .update(aenderung)
        .then(() => zeigeToast("Eintrag aktualisiert."))
        .catch((fehler) => {
          console.error("Eintrag konnte nicht aktualisiert werden:", fehler);
          zeigeToast("Eintrag konnte nicht aktualisiert werden.");
        });
      return;
    }

    const btn = event.target.closest('[data-role="delete-notiz"]');
    if (!btn) return;

    oeffneBestaetigungsModal(
      "Eintrag löschen",
      "Möchtest du diesen Eintrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
      () => {
        db.collection(NOTIZEN_COLLECTION).doc(btn.dataset.id).delete().catch(() => {
          zeigeToast("Eintrag konnte nicht gelöscht werden.");
        });
      }
    );
  });

  if (el.notesThemaFilter) {
    el.notesThemaFilter.addEventListener("change", (event) => {
      aktivesNotizThema = event.target.value;
      notizenSeite = 1;
      renderNotizen();
    });
  }

  if (el.notesSortSelect) {
    el.notesSortSelect.addEventListener("change", (event) => {
      notizSortierung = event.target.value;
      notizenSeite = 1;
      renderNotizen();
    });
  }

  if (el.notesPagination) {
    el.notesPagination.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-seite]");
      if (!btn || btn.disabled) return;
      const ziel = Number(btn.dataset.seite);
      if (!ziel || ziel < 1) return;
      notizenSeite = ziel;
      renderNotizen();
    });
  }

  if (el.btnToggleNotizenThemen) {
    el.btnToggleNotizenThemen.addEventListener("click", () => {
      notizenThemenVerwaltungOffen = !notizenThemenVerwaltungOffen;
      renderNotizenThemenVerwaltung();
    });
  }

  if (el.notizenThemenVerwaltung) {
    el.notizenThemenVerwaltung.addEventListener("click", (event) => {
      const entfernenBtn = event.target.closest('[data-role="thema-entfernen"]');
      if (entfernenBtn) {
        entferneNotizThema(entfernenBtn.dataset.thema);
        return;
      }

      const umbenennenBtn = event.target.closest('[data-role="thema-umbenennen"]');
      if (umbenennenBtn) {
        const zeile = umbenennenBtn.closest(".rollen-katalog__zeile");
        const input = zeile.querySelector('[data-role="thema-umbenennen-input"]');
        benenneNotizThemaUm(umbenennenBtn.dataset.alt, input.value);
        return;
      }

      if (event.target.id === "thema-katalog-hinzufuegen-btn") {
        const neuInput = document.getElementById("thema-katalog-neu-input");
        if (!neuInput) return;
        fuegeNotizThemaHinzu(neuInput.value);
      }
    });

    el.notizenThemenVerwaltung.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (event.target.id === "thema-katalog-neu-input") {
        event.preventDefault();
        const btn = document.getElementById("thema-katalog-hinzufuegen-btn");
        if (btn) btn.click();
      }
    });
  }

  /* ------------------------------------------------------------------------
     10c. Verkaufslog: Kundennamen-Vorschläge (Datalist + Tab-Vervollständigung
          im Kunde-Feld der Medikamente-Werkzeugleiste)
     ------------------------------------------------------------------------ */
  let bekannteKunden = []; // Eindeutige, bereits verwendete Kundennamen

  function aktualisiereBekannteKundenListe() {
    const namen = new Set();
    letzteVerkaeufe.forEach((v) => {
      if (v.kunde) namen.add(v.kunde);
    });
    bekannteKunden = Array.from(namen).sort((a, b) => a.localeCompare(b, "de"));

    const datalist = document.getElementById("bekannte-kunden-liste");
    if (datalist) {
      datalist.innerHTML = bekannteKunden.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
    }
  }

  // Tab-Vervollständigung im Kunde-Feld: Falls der bisher eingetippte Text
  // eindeutig zu einem bekannten Kundennamen passt, füllt Tab automatisch
  // den Rest auf - man kann es aber einfach überschreiben, keine Pflicht.
  if (el.medKundeInput) {
    el.medKundeInput.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || event.shiftKey) return;

      const eingabe = el.medKundeInput.value.trim();
      if (!eingabe) return;

      const treffer = bekannteKunden.find(
        (name) => name.toLowerCase().startsWith(eingabe.toLowerCase()) && name.toLowerCase() !== eingabe.toLowerCase()
      );

      if (treffer) {
        event.preventDefault();
        el.medKundeInput.value = treffer;
        el.medKundeInput.setSelectionRange(eingabe.length, treffer.length); // Ergänzten Teil markiert lassen
      }
    });
  }

  // Sammel-Checkout aus der Medikamententabelle (mehrere Artikel auf einmal).
  // Der Kunde wird direkt aus dem persistenten Feld in der Werkzeugleiste
  // übernommen - kein zusätzliches Pop-up mehr nötig.
  const btnResetMengen = document.getElementById("btn-reset-mengen");
  if (btnResetMengen) {
    btnResetMengen.addEventListener("click", () => {
      const betroffen = medikamente.filter((m) => (Number(m.menge) || 0) > 0).length;
      if (betroffen === 0) {
        zeigeToast("Es sind gerade keine Mengen eingetragen.");
        return;
      }
      medikamente.forEach((m) => (m.menge = 0));
      render();
      if (el.medKundeInput) el.medKundeInput.value = "";
      zeigeToast("Alle eingetragenen Mengen wurden zurückgesetzt.");
    });
  }

  el.btnCheckout.addEventListener("click", () => {
    const verkaufteArtikel = medikamente.filter((m) => (Number(m.menge) || 0) > 0);

    if (verkaufteArtikel.length === 0) {
      zeigeToast("Keine Mengen eingetragen – nichts zum Abschließen.");
      return;
    }

    const gesamtsumme = verkaufteArtikel.reduce((summe, m) => summe + Number(m.menge) * Number(m.preis), 0);
    const items = verkaufteArtikel.map((m) => ({ name: m.name, menge: Number(m.menge), preis: Number(m.preis) }));
    const kunde = el.medKundeInput ? el.medKundeInput.value.trim() : "";

    db.collection(VERKAUFSLOG_COLLECTION)
      .add({
        mitarbeiter: aktuellerNutzer ? aktuellerNutzer.name : "Unbekannt",
        rolle: aktuellerNutzer ? aktuellerNutzer.rolle : "",
        kunde: kunde || null,
        items: items,
        gesamtsumme: gesamtsumme,
        zeitpunkt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        medikamente.forEach((m) => (m.menge = 0));
        speichereMedikamenteInFirestore();
        render();
        if (el.medKundeInput) el.medKundeInput.value = "";
        zeigeToast(
          kunde
            ? `Verkauf an „${kunde}“ über ${formatiereGeld(gesamtsumme)} eingetragen.`
            : `Verkauf über ${formatiereGeld(gesamtsumme)} eingetragen.`
        );
      })
      .catch((fehler) => {
        console.error("Verkauf konnte nicht gespeichert werden:", fehler);
        zeigeToast("Verkauf konnte nicht gespeichert werden.");
      });
  });

  let letzteVerkaeufe = [];       // Zwischenspeicher für Client-seitige Suche
  let verkaufslogSuche = "";
  let aufgeklappteTage = null;    // Set der aufgeklappten Datums-Gruppen (null = noch nicht initialisiert)

  function abonniereVerkaufslog() {
    unsubVerkaufslog = db
      .collection(VERKAUFSLOG_COLLECTION)
      .orderBy("zeitpunkt", "desc")
      .limit(50)
      .onSnapshot(
        (snapshot) => {
          const verkaeufe = [];
          snapshot.forEach((doc) => {
            const d = doc.data();
            verkaeufe.push({
              id: doc.id,
              mitarbeiter: d.mitarbeiter,
              rolle: d.rolle,
              kunde: d.kunde || null,
              datum: d.datum || null,
              items: d.items || [],
              gesamtsumme: d.gesamtsumme || 0,
              millis: d.zeitpunkt && d.zeitpunkt.toMillis ? d.zeitpunkt.toMillis() : Date.now(),
            });
          });
          letzteVerkaeufe = verkaeufe;
          renderVerkaufslog();
          aktualisiereBekannteKundenListe();
        },
        (fehler) => console.error("Fehler beim Laden des Verkaufslogs:", fehler)
      );
  }

  if (el.salesLogSearch) {
    el.salesLogSearch.addEventListener("input", (event) => {
      verkaufslogSuche = event.target.value;
      renderVerkaufslog();
    });
  }

  function gruppenSchluesselVon(verkauf) {
    // Nutzt das gewählte Datum, falls vorhanden, sonst den Erstellungs-Zeitpunkt
    if (verkauf.datum) return verkauf.datum; // Format YYYY-MM-DD, sortiert gut
    const d = new Date(verkauf.millis);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function renderVerkaufslog() {
    el.salesLogList.innerHTML = "";
    el.salesLogEmpty.hidden = letzteVerkaeufe.length !== 0;

    // Suche anwenden: Kunde, Verkäufer oder Medikamentenname
    const begriff = verkaufslogSuche.trim().toLowerCase();
    const gefiltert = !begriff
      ? letzteVerkaeufe
      : letzteVerkaeufe.filter((v) => {
          const kundeTreffer = v.kunde && v.kunde.toLowerCase().includes(begriff);
          const mitarbeiterTreffer = v.mitarbeiter && v.mitarbeiter.toLowerCase().includes(begriff);
          const itemTreffer = v.items.some((i) => i.name.toLowerCase().includes(begriff));
          return kundeTreffer || mitarbeiterTreffer || itemTreffer;
        });

    el.salesLogNoResults.hidden = !(begriff && gefiltert.length === 0);
    if (gefiltert.length === 0) return;

    // Nach Datum gruppieren (neueste Gruppe zuerst, da letzteVerkaeufe schon
    // absteigend sortiert aus Firestore kommt)
    const gruppen = new Map();
    gefiltert.forEach((verkauf) => {
      const key = gruppenSchluesselVon(verkauf);
      if (!gruppen.has(key)) gruppen.set(key, []);
      gruppen.get(key).push(verkauf);
    });

    // Beim allerersten Rendern: nur die neueste Gruppe aufgeklappt starten
    if (aufgeklappteTage === null) {
      aufgeklappteTage = new Set();
      const ersterKey = gruppen.keys().next().value;
      if (ersterKey) aufgeklappteTage.add(ersterKey);
    }
    // Während einer aktiven Suche: alle Treffer-Gruppen automatisch aufklappen
    if (begriff) gruppen.forEach((_, key) => aufgeklappteTage.add(key));

    const medikamentOptionen = medikamente
      .map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)} (${formatiereGeld(m.preis)})</option>`)
      .join("");

    gruppen.forEach((verkaeufeDesTages, key) => {
      const tagesSumme = verkaeufeDesTages.reduce((s, v) => s + v.gesamtsumme, 0);
      const istAufgeklappt = aufgeklappteTage.has(key);

      const gruppenElement = document.createElement("div");
      gruppenElement.className = `sale-log-group${istAufgeklappt ? "" : " sale-log-group--collapsed"}`;
      gruppenElement.dataset.groupKey = key;

      const header = document.createElement("button");
      header.type = "button";
      header.className = "sale-log-group__header";
      header.dataset.role = "toggle-group";
      header.innerHTML = `
        <span><span class="sale-log-group__chevron">▾</span>${escapeHtml(formatiereDatum(key))}</span>
        <span class="sale-log-group__meta">${verkaeufeDesTages.length} Verkauf/Verkäufe · ${formatiereGeld(tagesSumme)}</span>
      `;
      gruppenElement.appendChild(header);

      const itemsWrapper = document.createElement("div");
      itemsWrapper.className = "sale-log-group__items";

      verkaeufeDesTages.forEach((verkauf) => {
        const itemsText = verkauf.items
          .map(
            (i) => `
              <div class="sale-ticket__line">
                <span class="sale-ticket__line-name">${escapeHtml(i.name)} ×${i.menge}</span>
                <span class="sale-ticket__line-dots"></span>
                <span class="sale-ticket__line-price">${formatiereGeld(i.menge * i.preis)}</span>
              </div>
            `
          )
          .join("");
        const zeitText = formatiereZeitstempel(verkauf.millis);
        const darfLoeschen = istAdmin();
        const kundeName = verkauf.kunde
          ? escapeHtml(verkauf.kunde)
          : `<span class="sale-item__kein-kunde">Kein Kunde angegeben</span>`;

        const eintrag = document.createElement("div");
        eintrag.className = "sale-item";
        eintrag.dataset.id = verkauf.id;
        eintrag.innerHTML = `
          <div class="sale-item__header">
            <span class="sale-item__kunde-name">${kundeName}</span>
            <div class="sale-item__header-right">
              <span class="sale-item__time">${zeitText}</span>
              <button type="button" class="icon-btn icon-btn--edit sale-item__edit-kunde-btn" data-role="toggle-edit-datum" data-id="${verkauf.id}" title="Datum bearbeiten">${ICON_EDIT}</button>
            </div>
          </div>
          <div class="sale-item__verkaeufer">verkauft von ${escapeHtml(verkauf.mitarbeiter)} · ${escapeHtml(verkauf.rolle || "")}</div>
          <div class="sale-ticket__lines">${itemsText}</div>
          <div class="sale-item__footer">
            <div class="sale-item__total">GESAMT <span>${formatiereGeld(verkauf.gesamtsumme)}</span></div>
            <div class="sale-item__actions">
              <button type="button" class="btn btn--ghost sale-item__add-btn" data-role="toggle-add-item" data-id="${verkauf.id}">+ Artikel hinzufügen</button>
              ${darfLoeschen ? `<button type="button" class="icon-btn icon-btn--delete" data-role="delete-verkauf" data-id="${verkauf.id}" title="Verkauf löschen">${ICON_TRASH}</button>` : ""}
            </div>
          </div>
          <div class="sale-item__add-form" id="edit-datum-form-${verkauf.id}" hidden>
            <input type="date" class="field-input" value="${gruppenSchluesselVon(verkauf)}" data-role="edit-datum-input" />
            <button type="button" class="btn btn--primary" data-role="confirm-edit-datum" data-id="${verkauf.id}">Speichern</button>
          </div>
          <div class="sale-item__add-form" id="add-form-${verkauf.id}" hidden>
            <select class="field-input" data-role="add-item-select">
              <option value="">Medikament auswählen...</option>
              ${medikamentOptionen}
            </select>
            <input type="number" class="field-input" min="1" step="1" value="1" data-role="add-item-menge" />
            <button type="button" class="btn btn--primary" data-role="confirm-add-item" data-id="${verkauf.id}">Hinzufügen</button>
          </div>
        `;
        itemsWrapper.appendChild(eintrag);
      });

      gruppenElement.appendChild(itemsWrapper);
      el.salesLogList.appendChild(gruppenElement);
    });
  }

  // Datums-Gruppen auf-/zuklappen
  el.salesLogList.addEventListener("click", (event) => {
    const header = event.target.closest('[data-role="toggle-group"]');
    if (!header) return;
    const gruppenElement = header.closest(".sale-log-group");
    const key = gruppenElement.dataset.groupKey;

    if (aufgeklappteTage.has(key)) {
      aufgeklappteTage.delete(key);
    } else {
      aufgeklappteTage.add(key);
    }
    gruppenElement.classList.toggle("sale-log-group--collapsed");
  });

  // Klicks innerhalb des Verkaufslogs: Löschen, Mini-Formular ein-/ausblenden, bestätigen
  el.salesLogList.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest('[data-role="delete-verkauf"]');
    if (deleteBtn) {
      if (!istAdmin()) return;
      oeffneBestaetigungsModal(
        "Verkauf löschen",
        "Möchtest du diesen Verkauf wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
        () => {
          db.collection(VERKAUFSLOG_COLLECTION)
            .doc(deleteBtn.dataset.id)
            .delete()
            .then(() => zeigeToast("Verkauf gelöscht."))
            .catch(() => zeigeToast("Verkauf konnte nicht gelöscht werden."));
        }
      );
      return;
    }

    const toggleBtn = event.target.closest('[data-role="toggle-add-item"]');
    if (toggleBtn) {
      const form = document.getElementById(`add-form-${toggleBtn.dataset.id}`);
      if (form) form.hidden = !form.hidden;
      return;
    }

    const toggleDatumBtn = event.target.closest('[data-role="toggle-edit-datum"]');
    if (toggleDatumBtn) {
      const form = document.getElementById(`edit-datum-form-${toggleDatumBtn.dataset.id}`);
      if (form) {
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector('[data-role="edit-datum-input"]').focus();
      }
      return;
    }

    const confirmDatumBtn = event.target.closest('[data-role="confirm-edit-datum"]');
    if (confirmDatumBtn) {
      const verkaufId = confirmDatumBtn.dataset.id;
      const zeile = confirmDatumBtn.closest(".sale-item__add-form");
      const input = zeile.querySelector('[data-role="edit-datum-input"]');
      const neuesDatum = input.value;

      if (!neuesDatum) {
        zeigeToast("Bitte ein gültiges Datum wählen.");
        return;
      }

      db.collection(VERKAUFSLOG_COLLECTION)
        .doc(verkaufId)
        .update({ datum: neuesDatum })
        .then(() => zeigeToast("Datum aktualisiert."))
        .catch((fehler) => {
          console.error("Datum konnte nicht gespeichert werden:", fehler);
          zeigeToast("Datum konnte nicht gespeichert werden.");
        });
      return;
    }

    const confirmBtn = event.target.closest('[data-role="confirm-add-item"]');
    if (confirmBtn) {
      const verkaufId = confirmBtn.dataset.id;
      const zeile = confirmBtn.closest(".sale-item__add-form");
      const select = zeile.querySelector('[data-role="add-item-select"]');
      const mengeInput = zeile.querySelector('[data-role="add-item-menge"]');

      const medName = select.value;
      const menge = parseInt(mengeInput.value, 10);

      if (!medName) return zeigeToast("Bitte ein Medikament auswählen.");
      if (isNaN(menge) || menge < 1) return zeigeToast("Bitte eine gültige Menge eingeben.");

      const med = medikamente.find((m) => m.name === medName);
      if (!med) return zeigeToast("Dieses Medikament existiert nicht mehr.");

      const docRefVerkauf = db.collection(VERKAUFSLOG_COLLECTION).doc(verkaufId);
      docRefVerkauf
        .get()
        .then((doc) => {
          if (!doc.exists) return;
          const daten = doc.data();
          const items = daten.items || [];

          const bestehend = items.find((i) => i.name === med.name);
          if (bestehend) {
            bestehend.menge += menge;
          } else {
            items.push({ name: med.name, menge: menge, preis: Number(med.preis) });
          }

          const neueSumme = items.reduce((summe, i) => summe + i.menge * i.preis, 0);

          return docRefVerkauf.update({ items: items, gesamtsumme: neueSumme });
        })
        .then(() => {
          select.value = "";
          mengeInput.value = "1";
          zeigeToast(`${med.name} wurde ergänzt.`);
        })
        .catch((fehler) => {
          console.error("Artikel konnte nicht ergänzt werden:", fehler);
          zeigeToast("Artikel konnte nicht ergänzt werden.");
        });
    }
  });

  /* ------------------------------------------------------------------------
     11. Rendering: Tabelle, Statistik-Karten, Info-Panel
     ------------------------------------------------------------------------ */
  function render() {
    renderTabelle();
    renderStatistik();
  }

  function renderTabelle() {
    const liste = gefilterteMedikamente();
    el.tableBody.innerHTML = "";
    el.emptyState.hidden = liste.length !== 0;

    const darfLoeschen = istAdmin();
    // Reihenfolge ändern nur möglich, wenn die Gesamtliste (unsortiert/
    // ungefiltert) angezeigt wird - bei aktiver Suche wäre Drag & Drop
    // verwirrend, da die Reihenfolge sich immer auf die komplette
    // Medikamentenliste bezieht.
    const darfVerschieben = darfLoeschen && !suchbegriff.trim();
    const sortierAktiv = darfVerschieben && medikamenteSortierModus;

    // "Reihenfolge bearbeiten"-Button: nur für Admins sichtbar, nur nutzbar
    // ohne aktive Suche.
    const toggleSortierBtn = document.getElementById("btn-toggle-med-sortierung");
    if (toggleSortierBtn) {
      toggleSortierBtn.hidden = !darfVerschieben;
      toggleSortierBtn.textContent = sortierAktiv ? "Fertig" : "Reihenfolge bearbeiten";
      toggleSortierBtn.classList.toggle("btn--ghost-active", sortierAktiv);
    }

    liste.forEach((med) => {
      const row = document.createElement("div");
      row.className = "med-row" + (sortierAktiv ? " med-row--sortierbar" : "");
      const menge = Number(med.menge) || 0;
      const zwischensumme = menge * Number(med.preis);

      const loeschButton = darfLoeschen
        ? `<button class="icon-btn icon-btn--delete" data-role="delete" data-id="${med.id}" title="Medikament löschen">${ICON_TRASH}</button>`
        : `<button class="icon-btn icon-btn--locked" disabled title="Nur Admins dürfen löschen">${ICON_LOCK}</button>`;

      const ziehGriff = sortierAktiv
        ? `<span class="icon-btn icon-btn--drag" data-role="zieh-griff" title="Zum Verschieben halten und ziehen">${ICON_DRAG}</span>`
        : "";

      row.innerHTML = `
        <span>
          <div class="med-name">
            <span>${escapeHtml(med.name)}</span>
          </div>
        </span>
        <span class="med-price">${formatiereGeld(med.preis)}</span>
        <span>
          <input type="number" class="qty-input" min="0" step="1" value="${menge}" data-id="${med.id}" data-role="qty" ${sortierAktiv ? "disabled" : ""} />
        </span>
        <span class="subtotal">${formatiereGeld(zwischensumme)}</span>
        <span>
          <div class="row-actions">
            ${ziehGriff}
            ${sortierAktiv ? "" : `<button class="icon-btn icon-btn--edit" data-role="edit" data-id="${med.id}" title="Preis bearbeiten">${ICON_EDIT}</button>${loeschButton}`}
          </div>
        </span>
      `;

      if (sortierAktiv) {
        row.draggable = true;
        row.dataset.id = med.id;
      }

      el.tableBody.appendChild(row);
    });
  }

  // Verschiebt ein Medikament an eine neue Position in der Gesamtliste
  // (per Drag & Drop im Sortier-Modus) und speichert die neue Reihenfolge.
  function verschiebeMedikamentAn(id, zielId) {
    if (!istAdmin()) {
      zeigeToast("Nur Admins dürfen die Reihenfolge ändern.");
      return;
    }
    if (id === zielId) return;

    const vonIndex = medikamente.findIndex((m) => m.id === id);
    const zielIndex = medikamente.findIndex((m) => m.id === zielId);
    if (vonIndex === -1 || zielIndex === -1) return;

    const [verschobenes] = medikamente.splice(vonIndex, 1);
    medikamente.splice(zielIndex, 0, verschobenes);

    speichereMedikamenteInFirestore();
    renderTabelle();
  }

  function renderStatistik() {
    const anzahlMedikamente = medikamente.length;
    const gesamtmenge = medikamente.reduce((summe, m) => summe + (Number(m.menge) || 0), 0);
    const gesamtsumme = medikamente.reduce((summe, m) => summe + (Number(m.menge) || 0) * Number(m.preis), 0);

    el.statCount.textContent = anzahlMedikamente;
    el.statQuantity.textContent = gesamtmenge;
    el.statTotal.textContent = formatiereGeld(gesamtsumme);
    el.tableTotal.textContent = formatiereGeld(gesamtsumme);
  }

  /* ------------------------------------------------------------------------
     11b. Infos-Seite (eigenständig, admin-verwaltet)
     ------------------------------------------------------------------------ */
  let infosGeladen = false; // wird true, sobald abonniereInfos() einmal geladen hat (siehe ergaenzeFehlendeWikiKategorien)

  function abonniereInfos() {
    unsubInfos = docRef(INFOS_DOC).onSnapshot(
      (doc) => {
        if (doc.exists && Array.isArray(doc.data().liste)) {
          infosListe = doc.data().liste;
        } else {
          infosListe = DEFAULT_INFOS.map((i) => ({ ...i }));
          speichereInfos();
        }
        infosGeladen = true;
        renderInfos();
      },
      (fehler) => console.error("Fehler beim Laden der Infos:", fehler)
    );
  }

  let infosSuchbegriff = "";
  let aktiveInfoKategorie = "__alle__";
  let infoSortierung = "az";
  let wikiSeite = 1; // aktuelle Pagination-Seite

  function speichereInfos() {
    docRef(INFOS_DOC)
      .set({ liste: infosListe, aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp() })
      .catch((fehler) => {
        console.error("Infos konnten nicht gespeichert werden:", fehler);
        zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
      });
  }

  /* ------------------------------------------------------------------------
     11b2. Firestore: Kategorien-Katalog der Medizin-Wiki-Seite (siehe
           WIKI_KATEGORIEN_DOC) - admin-verwaltet (Hinzufügen/Umbenennen mit
           Kaskade/Löschen ohne Kaskade), genau wie der Themen-Katalog der
           Infos-Seite und der Rollen-Katalog der Kontakte-Seite.
     ------------------------------------------------------------------------ */
  function normalisierteWikiKategorie(kategorie) {
    const wert = (kategorie || "").trim();
    if (wert && wikiKategorienKatalog.includes(wert)) return wert;
    return WIKI_KATEGORIE_FALLBACK;
  }

  function wikiKategorieFarbe(name) {
    const bereinigt = (name || "").trim();
    if (WIKI_KATEGORIE_FARBEN_STANDARD[bereinigt]) return WIKI_KATEGORIE_FARBEN_STANDARD[bereinigt];
    const schluessel = bereinigt.toLowerCase();
    let hash = 0;
    for (let i = 0; i < schluessel.length; i++) hash = (hash * 31 + schluessel.charCodeAt(i)) >>> 0;
    return WIKI_KATEGORIE_FARBEN[hash % WIKI_KATEGORIE_FARBEN.length];
  }

  function wikiKategorieBadge(kategorie) {
    const anzeige = normalisierteWikiKategorie(kategorie);
    const farbe = wikiKategorieFarbe(anzeige);
    return `<span class="wiki-row__kategorie wiki-row__kategorie--${farbe}">${escapeHtml(anzeige)}</span>`;
  }

  function wikiKategorienOptionen(aktuelleKategorie) {
    const ausgewaehlt = normalisierteWikiKategorie(aktuelleKategorie);
    return wikiKategorienKatalog
      .map((k) => `<option value="${escapeHtml(k)}"${k === ausgewaehlt ? " selected" : ""}>${escapeHtml(k)}</option>`)
      .join("");
  }

  function abonniereWikiKategorien() {
    if (unsubWikiKategorien) return;
    unsubWikiKategorien = docRef(WIKI_KATEGORIEN_DOC).onSnapshot(
      (doc) => {
        let geaendert = false;
        if (doc.exists && Array.isArray(doc.data().kategorien) && doc.data().kategorien.length) {
          wikiKategorienKatalog = doc.data().kategorien;
        } else {
          wikiKategorienKatalog = [...DEFAULT_WIKI_KATEGORIEN];
          geaendert = true;
        }
        if (!wikiKategorienKatalog.includes(WIKI_KATEGORIE_FALLBACK)) {
          wikiKategorienKatalog = [...wikiKategorienKatalog, WIKI_KATEGORIE_FALLBACK];
          geaendert = true;
        }
        if (geaendert) speichereWikiKategorien();
        aktualisiereInfoKategorieAuswahl();
        renderInfos();
      },
      (fehler) => console.error("Fehler beim Laden der Wiki-Kategorien:", fehler)
    );
  }

  function speichereWikiKategorien() {
    docRef(WIKI_KATEGORIEN_DOC)
      .set({ kategorien: wikiKategorienKatalog, aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp() })
      .catch((fehler) => {
        console.error("Wiki-Kategorien konnten nicht gespeichert werden:", fehler);
        zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
      });
  }

  // Hält das Kategorie-Auswahlfeld im Erstellen/Bearbeiten-Formular aktuell.
  // Bei einem noch komplett leeren Formular (neuer Eintrag) wird bewusst die
  // erste "echte" Kategorie statt gleich "Sonstiges" vorausgewählt - wirkt
  // einladender, ändert aber nichts an normalisierteWikiKategorie() selbst
  // (leere/unbekannte Kategorie-WERTE in echten Daten fallen weiterhin auf
  // "Sonstiges" zurück, das betrifft nur diese Vorauswahl im Formular).
  function aktualisiereInfoKategorieAuswahl() {
    if (!el.infoKategorieInput) return;
    const vorher = el.infoKategorieInput.value;
    const startwert = vorher || wikiKategorienKatalog.find((k) => k !== WIKI_KATEGORIE_FALLBACK) || wikiKategorienKatalog[0] || "";
    el.infoKategorieInput.innerHTML = wikiKategorienOptionen(startwert);
    if (wikiKategorienKatalog.includes(vorher)) el.infoKategorieInput.value = vorher;
  }

  // Migrations-Sicherheitsnetz: Die Kategorie war vor dieser Umstellung ein
  // reines Freitextfeld (nur per <datalist> vorgeschlagen). Damit bereits
  // vorhandene Einträge mit einem Kategorie-Wert, der (noch) nicht im neuen
  // Katalog steht, nicht plötzlich unter "Sonstiges" verschwinden, wird jeder
  // in echten Einträgen vorkommende Kategorie-Wert automatisch in den Katalog
  // übernommen - aber ausdrücklich nur EIN EINZIGES Mal pro Sitzung (sobald
  // sowohl der Katalog als auch die Infos-Liste einmal geladen wurden), nicht
  // bei jedem renderInfos()-Aufruf. Würde diese Prüfung dauerhaft laufen,
  // hätte ein Admin nie wirklich eine Kategorie löschen können: Einträge mit
  // der gerade gelöschten Kategorie (kein Kaskaden-Update, siehe
  // entferneWikiKategorie) hätten die Migration beim nächsten Rendern sofort
  // wieder in den Katalog zurückgeschrieben.
  let wikiKategorienMigrationErledigt = false;

  function ergaenzeFehlendeWikiKategorien() {
    if (wikiKategorienMigrationErledigt) return;
    if (!wikiKategorienKatalog.length || !infosGeladen) return; // beide Seiten müssen erst geladen sein
    wikiKategorienMigrationErledigt = true;

    const fehlende = [];
    infosListe.forEach((info) => {
      const k = (info.kategorie || "").trim();
      if (k && !wikiKategorienKatalog.includes(k) && !fehlende.includes(k)) fehlende.push(k);
    });
    if (fehlende.length) {
      wikiKategorienKatalog = [...wikiKategorienKatalog, ...fehlende];
      speichereWikiKategorien();
    }
  }

  function fuegeWikiKategorieHinzu(name) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Kategorien verwalten.");
    const bereinigt = (name || "").trim();
    if (!bereinigt) return;
    if (wikiKategorienKatalog.some((k) => k.toLowerCase() === bereinigt.toLowerCase())) {
      zeigeToast("Diese Kategorie gibt es schon.");
      return;
    }
    wikiKategorienKatalog = [...wikiKategorienKatalog, bereinigt];
    speichereWikiKategorien();
  }

  // Benennt eine Kategorie um UND überträgt die Änderung auf alle
  // betroffenen Wiki-Einträge (die Wiki-Liste liegt als ein einzelnes Array
  // in Firestore, deshalb genügt hier ein einzelnes speichereInfos() statt
  // eines db.batch() wie bei Kontakten/Notizen).
  function benenneWikiKategorieUm(alterName, neuerNameRoh) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Kategorien verwalten.");
    if (alterName === WIKI_KATEGORIE_FALLBACK) return zeigeToast('„Sonstiges“ kann nicht umbenannt werden.');
    const neuerName = (neuerNameRoh || "").trim();
    if (!neuerName) return zeigeToast("Bitte einen Namen eingeben.");
    if (neuerName === alterName) return;
    if (wikiKategorienKatalog.some((k) => k.toLowerCase() === neuerName.toLowerCase())) {
      zeigeToast("Diese Kategorie gibt es schon.");
      return;
    }

    // Erst BEIDE In-Memory-Zustände (Katalog + betroffene Einträge)
    // vollständig konsistent aktualisieren und ERST DANACH etwas speichern -
    // sonst könnte ein (in Tests synchron feuernder) Firestore-Listener
    // zwischendurch einen Zwischenstand sehen, in dem der alte Name schon aus
    // dem Katalog verschwunden, aber noch nicht von allen Einträgen
    // übernommen wurde, und ihn über die Migrations-Automatik fälschlich
    // wieder zurückschreiben (siehe ergaenzeFehlendeWikiKategorien).
    wikiKategorienKatalog = wikiKategorienKatalog.map((k) => (k === alterName ? neuerName : k));
    let geaendert = false;
    infosListe.forEach((info) => {
      if (info.kategorie === alterName) {
        info.kategorie = neuerName;
        geaendert = true;
      }
    });

    speichereWikiKategorien();
    if (geaendert) speichereInfos();

    if (aktiveInfoKategorie === alterName) aktiveInfoKategorie = neuerName;
    zeigeToast(`Kategorie in „${neuerName}“ umbenannt.`);
  }

  // Entfernt eine Kategorie dauerhaft aus dem Katalog - bewusst OHNE Kaskade
  // auf bestehende Wiki-Einträge: ein Eintrag mit einer inzwischen gelöschten
  // Kategorie wird automatisch als "Sonstiges" angezeigt und gezählt (siehe
  // normalisierteWikiKategorie).
  function entferneWikiKategorie(name) {
    if (!istAdmin()) return zeigeToast("Nur Admins dürfen Kategorien verwalten.");
    if (name === WIKI_KATEGORIE_FALLBACK) return zeigeToast('„Sonstiges“ kann nicht gelöscht werden.');
    wikiKategorienKatalog = wikiKategorienKatalog.filter((k) => k !== name);
    speichereWikiKategorien();
    if (aktiveInfoKategorie === name) aktiveInfoKategorie = "__alle__";
    wikiSeite = 1;
    renderInfos();
  }

  function renderWikiKategorienVerwaltung() {
    if (!el.wikiKategorienVerwaltung) return;
    const admin = istAdmin();
    if (el.btnToggleWikiKategorien) el.btnToggleWikiKategorien.hidden = !admin;
    el.wikiKategorienVerwaltung.hidden = !admin || !wikiKategorienVerwaltungOffen;
    if (!admin || !wikiKategorienVerwaltungOffen) return;

    const aktivesElement = document.activeElement;
    if (el.wikiKategorienVerwaltung.contains(aktivesElement) && (aktivesElement.tagName === "INPUT" || aktivesElement.tagName === "SELECT")) {
      return;
    }

    const zeilen = wikiKategorienKatalog
      .map((kategorie) => {
        const gesperrt = kategorie === WIKI_KATEGORIE_FALLBACK;
        return `
          <div class="rollen-katalog__zeile">
            <input type="text" class="field-input" value="${escapeHtml(kategorie)}" data-role="wiki-kategorie-umbenennen-input" data-alt="${escapeHtml(kategorie)}" ${gesperrt ? "disabled" : ""} />
            ${
              gesperrt
                ? `<span class="rollen-katalog__hinweis" title="Fester Auffangwert für Einträge ohne (mehr) gültige Kategorie">Standardwert – nicht änderbar</span>`
                : `
                  <div class="rollen-katalog__zeile-aktionen">
                    <button type="button" class="btn btn--ghost rollen-katalog__speichern-btn" data-role="wiki-kategorie-umbenennen" data-alt="${escapeHtml(kategorie)}">Speichern</button>
                    <button type="button" class="badge-pill__entfernen" data-role="wiki-kategorie-entfernen" data-kategorie="${escapeHtml(kategorie)}" title="Kategorie löschen">${ICON_X_KLEIN}</button>
                  </div>
                `
            }
          </div>
        `;
      })
      .join("");

    el.wikiKategorienVerwaltung.innerHTML = `
      <div class="rollen-katalog__liste">${zeilen}</div>
      <div class="rollen-katalog__neu">
        <input type="text" id="wiki-kategorie-neu-input" class="field-input" placeholder="Neue Kategorie..." autocomplete="off" />
        <button type="button" class="btn btn--ghost" id="wiki-kategorie-hinzufuegen-btn">Hinzufügen</button>
      </div>
    `;
  }

  // "Übersicht"-Kasten unten in der Sidebar - rein informativ, kein Filter
  // (analog zur Schnellinfo-Box der Kontakte-Seite).
  function renderWikiSchnellinfo() {
    if (!el.wikiSchnellinfo) return;
    const heute = new Date();
    const istHeute = (iso) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d.getFullYear() === heute.getFullYear() && d.getMonth() === heute.getMonth() && d.getDate() === heute.getDate();
    };
    const heuteHinzugefuegt = infosListe.filter((info) => istHeute(info.erstelltAm)).length;

    el.wikiSchnellinfo.innerHTML = `
      <div class="kontakte-schnellinfo__zeile">
        <span>Einträge insgesamt</span><span class="kontakte-schnellinfo__wert">${infosListe.length}</span>
      </div>
      <div class="kontakte-schnellinfo__zeile">
        <span>Heute hinzugefügt</span><span class="kontakte-schnellinfo__wert">${heuteHinzugefuegt}</span>
      </div>
      <div class="kontakte-schnellinfo__zeile">
        <span>Kategorien</span><span class="kontakte-schnellinfo__wert">${wikiKategorienKatalog.length}</span>
      </div>
    `;
  }

  // Pagination-Leiste - dieselbe Logik/Optik wie auf der Infos(Notizen)-Seite
  // (siehe berechnePaginationSeiten/renderNotizenPagination), hier mit der
  // für die Wiki-Seite passenden Seitengröße (siehe WIKI_SEITENGROESSE).
  function renderWikiPagination(gesamtEintraege, gesamtSeiten) {
    if (!el.wikiPagination) return;
    if (gesamtEintraege === 0) {
      el.wikiPagination.innerHTML = "";
      return;
    }

    const start = (wikiSeite - 1) * WIKI_SEITENGROESSE + 1;
    const ende = Math.min(wikiSeite * WIKI_SEITENGROESSE, gesamtEintraege);

    const seitenZahlen = berechnePaginationSeiten(wikiSeite, gesamtSeiten)
      .map((s) =>
        s === "…"
          ? `<span class="notes-pagination__ellipsis">…</span>`
          : `<button type="button" class="notes-pagination__btn${s === wikiSeite ? " notes-pagination__btn--aktiv" : ""}" data-seite="${s}">${s}</button>`
      )
      .join("");

    el.wikiPagination.innerHTML = `
      <span class="notes-pagination__info">${start}–${ende} von ${gesamtEintraege} Einträgen</span>
      <div class="notes-pagination__buttons">
        <button type="button" class="notes-pagination__btn notes-pagination__btn--nav" data-seite="${wikiSeite - 1}" ${wikiSeite <= 1 ? "disabled" : ""} title="Vorherige Seite">«</button>
        ${seitenZahlen}
        <button type="button" class="notes-pagination__btn notes-pagination__btn--nav" data-seite="${wikiSeite + 1}" ${wikiSeite >= gesamtSeiten ? "disabled" : ""} title="Nächste Seite">»</button>
      </div>
    `;
  }

  function renderInfos() {
    if (!el.wikiTableBody) return;
    el.infosAdminForm.hidden = !istAdmin();

    ergaenzeFehlendeWikiKategorien();
    renderWikiKategorienVerwaltung();
    renderWikiSchnellinfo();

    // Zählung je Kategorie - Grundlage ist immer der Katalog (nicht mehr rein
    // aus den Einträgen abgeleitet), damit auch (noch) leere Kategorien in
    // der Sidebar sichtbar sind.
    const kategorieZaehlung = {};
    infosListe.forEach((info) => {
      const k = normalisierteWikiKategorie(info.kategorie);
      kategorieZaehlung[k] = (kategorieZaehlung[k] || 0) + 1;
    });

    if (el.wikiKategorienListe) {
      const alleAktiv = aktiveInfoKategorie === "__alle__";
      el.wikiKategorienListe.innerHTML = `
        <button type="button" class="wiki-kategorie ${alleAktiv ? "wiki-kategorie--active" : ""}" data-kategorie="__alle__">
          <span>Alle Medikamente</span><span class="wiki-kategorie__count">${infosListe.length}</span>
        </button>
        ${wikiKategorienKatalog
          .map(
            (k) => `
              <button type="button" class="wiki-kategorie ${k === aktiveInfoKategorie ? "wiki-kategorie--active" : ""}" data-kategorie="${escapeHtml(k)}">
                <span>${escapeHtml(k)}</span><span class="wiki-kategorie__count">${kategorieZaehlung[k] || 0}</span>
              </button>
            `
          )
          .join("")}
      `;
      el.wikiKategorienListe.querySelectorAll(".wiki-kategorie").forEach((btn) => {
        btn.addEventListener("click", () => {
          aktiveInfoKategorie = btn.dataset.kategorie;
          wikiSeite = 1;
          renderInfos();
        });
      });
    }

    // Filtern: Kategorie + Suche (Titel/Inhalt/Kategorie - Zusatz-Hinweis
    // bleibt wie bisher ebenfalls durchsuchbar)
    const begriff = infosSuchbegriff.trim().toLowerCase();
    let gefiltert = infosListe.filter((info) => {
      const k = normalisierteWikiKategorie(info.kategorie);
      const kategoriePasst = aktiveInfoKategorie === "__alle__" || k === aktiveInfoKategorie;
      if (!kategoriePasst) return false;
      if (!begriff) return true;
      return (
        info.titel.toLowerCase().includes(begriff) ||
        info.text.toLowerCase().includes(begriff) ||
        (info.hinweis || "").toLowerCase().includes(begriff) ||
        k.toLowerCase().includes(begriff)
      );
    });

    gefiltert.sort((a, b) => (infoSortierung === "za" ? b.titel.localeCompare(a.titel, "de") : a.titel.localeCompare(b.titel, "de")));

    const mainTitel = document.getElementById("wiki-main-titel");
    if (mainTitel) mainTitel.textContent = aktiveInfoKategorie === "__alle__" ? "Alle Medikamente" : aktiveInfoKategorie;

    const gesamtSeiten = Math.max(1, Math.ceil(gefiltert.length / WIKI_SEITENGROESSE));
    if (wikiSeite > gesamtSeiten) wikiSeite = gesamtSeiten;
    if (wikiSeite < 1) wikiSeite = 1;
    const start = (wikiSeite - 1) * WIKI_SEITENGROESSE;
    const seiteEintraege = gefiltert.slice(start, start + WIKI_SEITENGROESSE);

    el.wikiTableBody.innerHTML = "";
    document.getElementById("infos-empty").hidden = gefiltert.length !== 0;

    seiteEintraege.forEach((info) => {
      const aktionsButtons = istAdmin()
        ? `
          <button type="button" class="wiki-row__action wiki-row__action--bearbeiten" data-role="edit-info" data-id="${info.id}">Bearbeiten</button>
          <button type="button" class="wiki-row__action wiki-row__action--loeschen" data-role="delete-info" data-id="${info.id}">Löschen</button>
        `
        : "";
      const row = document.createElement("div");
      row.className = "wiki-row";
      row.innerHTML = `
        <div class="wiki-row__name-col">
          <span class="wiki-row__name">${escapeHtml(info.titel)}</span>
          ${wikiKategorieBadge(info.kategorie)}
        </div>
        <div class="wiki-row__beschreibung-wrap">
          <div class="wiki-row__beschreibung">${verarbeiteRichInhalt(info.text)}</div>
          ${info.hinweis ? `<span class="info-card__hint">${formatiereNotizText(info.hinweis)}</span>` : ""}
        </div>
        <div class="wiki-row__aktionen">${aktionsButtons}</div>
      `;
      el.wikiTableBody.appendChild(row);
    });

    renderWikiPagination(gefiltert.length, gesamtSeiten);
  }

  const infosSearchInput = document.getElementById("infos-search");
  if (infosSearchInput) {
    infosSearchInput.addEventListener("input", (event) => {
      infosSuchbegriff = event.target.value;
      wikiSeite = 1;
      renderInfos();
    });
  }

  const wikiSortSelect = document.getElementById("wiki-sortierung");
  if (wikiSortSelect) {
    wikiSortSelect.addEventListener("change", () => {
      infoSortierung = wikiSortSelect.value;
      wikiSeite = 1;
      renderInfos();
    });
  }

  if (el.wikiPagination) {
    el.wikiPagination.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-seite]");
      if (!btn || btn.disabled) return;
      const ziel = Number(btn.dataset.seite);
      if (!ziel || ziel < 1) return;
      wikiSeite = ziel;
      renderInfos();
    });
  }

  if (el.btnToggleWikiKategorien) {
    el.btnToggleWikiKategorien.addEventListener("click", () => {
      wikiKategorienVerwaltungOffen = !wikiKategorienVerwaltungOffen;
      renderWikiKategorienVerwaltung();
    });
  }

  if (el.wikiKategorienVerwaltung) {
    el.wikiKategorienVerwaltung.addEventListener("click", (event) => {
      const entfernenBtn = event.target.closest('[data-role="wiki-kategorie-entfernen"]');
      if (entfernenBtn) {
        entferneWikiKategorie(entfernenBtn.dataset.kategorie);
        return;
      }

      const umbenennenBtn = event.target.closest('[data-role="wiki-kategorie-umbenennen"]');
      if (umbenennenBtn) {
        const zeile = umbenennenBtn.closest(".rollen-katalog__zeile");
        const input = zeile.querySelector('[data-role="wiki-kategorie-umbenennen-input"]');
        benenneWikiKategorieUm(umbenennenBtn.dataset.alt, input.value);
        return;
      }

      if (event.target.id === "wiki-kategorie-hinzufuegen-btn") {
        const neuInput = document.getElementById("wiki-kategorie-neu-input");
        if (!neuInput) return;
        fuegeWikiKategorieHinzu(neuInput.value);
      }
    });

    el.wikiKategorienVerwaltung.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (event.target.id === "wiki-kategorie-neu-input") {
        event.preventDefault();
        const btn = document.getElementById("wiki-kategorie-hinzufuegen-btn");
        if (btn) btn.click();
      }
    });
  }

  function setzeInfoFormularZurueck() {
    el.infoEditingId.value = "";
    el.infoTitelInput.value = "";
    el.infoTextInput.innerHTML = "";
    el.infoHinweisInput.value = "";
    if (el.infoKategorieInput) aktualisiereInfoKategorieAuswahl();
    el.infoFormTitle.textContent = "Neuen Wiki-Eintrag hinzufügen";
    el.infoFormSubmit.textContent = "Hinzufügen";
    el.infoFormCancel.hidden = true;
  }

  if (el.formAddInfo) {
    el.formAddInfo.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!istAdmin()) return;

      const titel = el.infoTitelInput.value.trim();
      const text = el.infoTextInput.innerHTML.trim();
      const nurText = el.infoTextInput.textContent.trim();
      const hinweis = el.infoHinweisInput.value.trim();
      const kategorie = el.infoKategorieInput ? normalisierteWikiKategorie(el.infoKategorieInput.value) : "";
      if (!titel || !nurText) return;

      const bearbeiteId = el.infoEditingId.value;

      if (bearbeiteId) {
        const info = infosListe.find((i) => i.id === bearbeiteId);
        if (info) {
          info.titel = titel;
          info.text = sanitisiereRichText(text);
          // WICHTIG: null statt undefined - Firestore lehnt "undefined" als
          // Feldwert komplett ab (auch verschachtelt in einem Array!) und
          // verwirft dann das GESAMTE .set() inkl. aller anderen Änderungen.
          // Da hinweis optional ist, muss ein leeres Feld als null
          // gespeichert werden, nicht als undefined.
          info.hinweis = hinweis || null;
          info.kategorie = kategorie || null;
        }
        speichereInfos();
        renderInfos(); // sofort sichtbar, nicht erst beim nächsten Firestore-Update
        zeigeToast(`„${titel}“ wurde aktualisiert.`);
      } else {
        infosListe.push({
          id: erzeugeId(titel),
          titel,
          text: sanitisiereRichText(text),
          hinweis: hinweis || null,
          kategorie: kategorie || null,
          erstelltAm: new Date().toISOString(),
        });
        speichereInfos();
        renderInfos(); // sofort sichtbar, nicht erst beim nächsten Firestore-Update
        zeigeToast(`„${titel}“ wurde zu den Infos hinzugefügt.`);
      }

      setzeInfoFormularZurueck();
    });
  }

  if (el.infoFormCancel) {
    el.infoFormCancel.addEventListener("click", setzeInfoFormularZurueck);
  }

  if (el.wikiTableBody) {
    el.wikiTableBody.addEventListener("click", (event) => {
      const deleteBtn = event.target.closest('[data-role="delete-info"]');
      if (deleteBtn && istAdmin()) {
        const info = infosListe.find((i) => i.id === deleteBtn.dataset.id);
        if (!info) return;
        oeffneBestaetigungsModal(
          "Info-Eintrag löschen",
          `Möchtest du „${info.titel}“ wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
          () => {
            infosListe = infosListe.filter((i) => i.id !== deleteBtn.dataset.id);
            speichereInfos();
            renderInfos(); // sofort sichtbar, nicht erst beim nächsten Firestore-Update
            zeigeToast(`„${info.titel}“ wurde entfernt.`);
          }
        );
        return;
      }

      const editBtn = event.target.closest('[data-role="edit-info"]');
      if (editBtn && istAdmin()) {
        const info = infosListe.find((i) => i.id === editBtn.dataset.id);
        if (!info) return;

        el.infoEditingId.value = info.id;
        el.infoTitelInput.value = info.titel;
        el.infoTextInput.innerHTML = verarbeiteRichInhalt(info.text);
        el.infoHinweisInput.value = info.hinweis || "";
        if (el.infoKategorieInput) el.infoKategorieInput.innerHTML = wikiKategorienOptionen(info.kategorie);
        el.infoFormTitle.textContent = `„${info.titel}“ bearbeiten`;
        el.infoFormSubmit.textContent = "Speichern";
        el.infoFormCancel.hidden = false;
        el.infoTitelInput.focus();
        el.infosAdminForm.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  /* ------------------------------------------------------------------------
     11c. Start-Seite: Schwarzes Brett (admin-verwaltet)
     ------------------------------------------------------------------------ */
  function abonniereAnkuendigungen() {
    unsubAnkuendigungen = db
      .collection(ANKUENDIGUNGEN_COLLECTION)
      .orderBy("zeitpunkt", "desc")
      .limit(30)
      .onSnapshot(
        (snapshot) => {
          const eintraege = [];
          snapshot.forEach((doc) => {
            const d = doc.data();
            eintraege.push({
              id: doc.id,
              text: d.text,
              autor: d.autor,
              millis: d.zeitpunkt && d.zeitpunkt.toMillis ? d.zeitpunkt.toMillis() : Date.now(),
            });
          });
          renderAnkuendigungen(eintraege);
        },
        (fehler) => console.error("Fehler beim Laden der Ankündigungen:", fehler)
      );
  }

  function renderAnkuendigungen(eintraege) {
    const admin = istAdmin();
    const btnNeu = document.getElementById("btn-neue-ankuendigung");
    // Nur die Sichtbarkeit des Auslöser-Buttons hängt vom Admin-Status ab -
    // ob das Formular selbst offen ist, entscheidet ausschließlich der
    // Toggle-Klick (siehe unten), damit ein Neu-Rendern (z. B. durch einen
    // neuen Eintrag) ein bereits geöffnetes/geschlossenes Formular nicht
    // wieder zurücksetzt.
    if (btnNeu && el.boardAdminForm.hidden) {
      btnNeu.hidden = !admin;
    }
    if (!admin) {
      el.boardAdminForm.hidden = true;
      if (btnNeu) btnNeu.hidden = true;
    }

    el.boardEmpty.hidden = eintraege.length !== 0;
    el.boardList.innerHTML = "";

    eintraege.forEach((eintrag) => {
      const loeschButton = istAdmin()
        ? `<button type="button" class="icon-btn icon-btn--delete" data-role="delete-ankuendigung" data-id="${eintrag.id}" title="Löschen">${ICON_TRASH}</button>`
        : "";

      const karte = document.createElement("div");
      karte.className = "board-item";
      karte.innerHTML = `
        <div class="board-item__text">${verarbeiteRichInhalt(eintrag.text)}</div>
        <div class="board-item__meta">
          <span>— ${escapeHtml(eintrag.autor)} · ${formatiereZeitstempel(eintrag.millis)} Uhr</span>
          ${loeschButton}
        </div>
      `;
      el.boardList.appendChild(karte);
    });
  }

  if (el.formAnkuendigung) {
    el.formAnkuendigung.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!istAdmin()) return;

      const text = el.ankuendigungInput.innerHTML.trim();
      const nurText = el.ankuendigungInput.textContent.trim();
      if (!nurText) return;

      db.collection(ANKUENDIGUNGEN_COLLECTION)
        .add({ text: sanitisiereRichText(text), autor: aktuellerNutzer.name, zeitpunkt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => {
          el.ankuendigungInput.innerHTML = "";
          el.boardAdminForm.hidden = true;
          const btnNeu = document.getElementById("btn-neue-ankuendigung");
          if (btnNeu) btnNeu.hidden = false;
        })
        .catch((fehler) => {
          console.error("Ankündigung konnte nicht gespeichert werden:", fehler);
          zeigeToast("Konnte nicht gespeichert werden.");
        });
    });
  }

  if (el.boardList) {
    el.boardList.addEventListener("click", (event) => {
      const btn = event.target.closest('[data-role="delete-ankuendigung"]');
      if (!btn || !istAdmin()) return;

      oeffneBestaetigungsModal(
        "Ankündigung löschen",
        "Möchtest du diese Ankündigung wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
        () => {
          db.collection(ANKUENDIGUNGEN_COLLECTION).doc(btn.dataset.id).delete().catch(() => {});
        }
      );
    });
  }

  /* ------------------------------------------------------------------------
     11d. Handbuch (interne Dokumentenbibliothek)
     ------------------------------------------------------------------------
     Sichtbarkeit des Reiters: nur für die Ränge in HANDBUCH_SICHTBARE_RAENGE
     (unabhängig von den Admin-Rechten). Bearbeiten einzelner Dokumente:
     ausschließlich für Admins (istAdmin(), genau wie beim Medizin-Wiki und
     dem Schwarzen Brett). Beides zusätzlich serverseitig über
     firestore.rules erzwungen, nicht nur hier im Frontend.

     Jedes Dokument liegt als eigenes Firestore-Dokument in der Collection
     "handbuch" (Dokument-ID = fester Slug, z. B. "einarbeitungsleitfaden")
     mit den Feldern: titel, beschreibung, inhalt (sanitiertes HTML),
     reihenfolge, version, letzteAenderung (Server-Zeitstempel),
     letzterBearbeiter. Weitere Dokumente können jederzeit hinzugefügt
     werden, indem ein weiterer Eintrag in DEFAULT_HANDBUCH_DOKUMENTE oben
     ergänzt wird (wird beim nächsten leeren Start automatisch angelegt)
     oder indem ein Admin direkt ein neues Dokument mit denselben Feldern in
     Firestore anlegt - die Übersicht liest die Collection vollständig
     dynamisch aus, sortiert nach "reihenfolge".
     ------------------------------------------------------------------------ */
  function darfHandbuchSehen() {
    return !!(aktuellerNutzer && HANDBUCH_SICHTBARE_RAENGE.includes(aktuellerNutzer.rolle));
  }

  // Blendet den "Handbuch"-Reiter nur für berechtigte Ränge ein - analog zu
  // aktualisiereAdminNavSichtbarkeit() weiter oben. Wird direkt nach dem
  // Login UND bei jeder Live-Änderung des eigenen Profils aufgerufen, damit
  // ein Nutzer, dessen Rang sich gerade ändert, den Reiter sofort
  // bekommt/verliert, statt erst beim nächsten Neuladen.
  function aktualisiereHandbuchNavSichtbarkeit() {
    if (el.navHandbuchToggle) el.navHandbuchToggle.hidden = !darfHandbuchSehen();

    abonniereHandbuchFallsBerechtigt();

    // Falls jemand gerade auf der Handbuch-Seite ist und in genau diesem
    // Moment die Berechtigung verliert (z. B. Rang wird herabgestuft):
    // automatisch zur Startseite zurückschicken.
    const viewHandbuchEl = document.getElementById("view-handbuch");
    const aufHandbuchSeite = viewHandbuchEl && viewHandbuchEl.classList.contains("view--active");
    if (!darfHandbuchSehen() && aufHandbuchSeite) {
      const startNavItem = document.querySelector('.nav__item[data-view="start"]');
      if (startNavItem) startNavItem.click();
    }
  }

  // Abonniert die Handbuch-Collection live - aber NUR, wenn der aktuelle
  // Nutzer überhaupt berechtigt ist (Firestore Security Rules würden einem
  // nicht berechtigten Nutzer den Zugriff ohnehin verweigern, siehe
  // firestore.rules - hier wird zusätzlich vermieden, dass unnötig eine
  // Fehlermeldung in der Konsole landet).
  function abonniereHandbuchFallsBerechtigt() {
    if (!darfHandbuchSehen()) {
      if (unsubHandbuch) {
        unsubHandbuch();
        unsubHandbuch = null;
      }
      handbuchDokumente = [];
      aktivesHandbuchDokumentId = null;
      return;
    }
    if (unsubHandbuch) return; // bereits abonniert

    unsubHandbuch = db
      .collection(HANDBUCH_COLLECTION)
      .orderBy("reihenfolge", "asc")
      .onSnapshot(
        (snapshot) => {
          const liste = [];
          snapshot.forEach((doc) => liste.push({ id: doc.id, ...doc.data() }));
          handbuchDokumente = liste;

          // Selbstheilend, genau wie bei Medikamenten/Infos: Ist die
          // Collection noch komplett leer, legt ein Admin die drei
          // Standarddokumente automatisch an. Nicht-Admins warten in dem
          // (in der Praxis nur einmaligen) Fall einfach, bis ein Admin die
          // Seite öffnet - die Security Rules erlauben das Anlegen ohnehin
          // nur Admins.
          if (liste.length === 0 && istAdmin() && !handbuchSeedLaeuft) {
            seedeHandbuchStandarddokumente();
          }

          renderHandbuchListe();
          if (aktivesHandbuchDokumentId) renderHandbuchDokument(aktivesHandbuchDokumentId);

          // Falls die Handbuch-Seite gerade aktiv ist (z. B. direkt nach dem
          // allerersten Laden der Standarddokumente, oder falls das zuvor
          // geöffnete Dokument nicht mehr existiert): automatisch das erste
          // Dokument öffnen, statt nur den leeren Platzhalter zu zeigen.
          const viewHandbuchEl2 = document.getElementById("view-handbuch");
          const handbuchIstGeradeAktiv = viewHandbuchEl2 && viewHandbuchEl2.classList.contains("view--active");
          const aktuelleAuswahlNochGueltig = handbuchDokumente.some((d) => d.id === aktivesHandbuchDokumentId);
          if (handbuchIstGeradeAktiv && !aktuelleAuswahlNochGueltig) {
            praesentiereHandbuchStartzustand();
          }
        },
        (fehler) => console.error("Fehler beim Laden des Handbuchs:", fehler)
      );
  }

  function seedeHandbuchStandarddokumente() {
    handbuchSeedLaeuft = true;
    const batch = db.batch();
    DEFAULT_HANDBUCH_DOKUMENTE.forEach((dok) => {
      const ref = db.collection(HANDBUCH_COLLECTION).doc(dok.id);
      batch.set(ref, {
        titel: dok.titel,
        beschreibung: dok.beschreibung,
        inhalt: dok.inhalt,
        reihenfolge: dok.reihenfolge,
        version: 1.0,
        letzteAenderung: firebase.firestore.FieldValue.serverTimestamp(),
        letzterBearbeiter: "System",
      });
    });
    batch
      .commit()
      .catch((fehler) => console.error("Handbuch-Standarddokumente konnten nicht angelegt werden:", fehler))
      .finally(() => {
        handbuchSeedLaeuft = false;
      });
  }

  // Schmale, dauerhaft sichtbare Seitenleiste statt Übersichtsseite -
  // enthält ausschließlich die Dokumenttitel, der aktuell geöffnete Eintrag
  // wird deutlich hervorgehoben (siehe .handbuch-liste-item--active).
  function renderHandbuchListe() {
    if (!el.handbuchListe) return;
    el.handbuchListe.innerHTML = "";
    if (el.handbuchLeer) el.handbuchLeer.hidden = handbuchDokumente.length !== 0;

    handbuchDokumente.forEach((dok) => {
      const eintrag = document.createElement("button");
      eintrag.type = "button";
      eintrag.className = "handbuch-liste-item" + (dok.id === aktivesHandbuchDokumentId ? " handbuch-liste-item--active" : "");
      eintrag.textContent = dok.titel || "Ohne Titel";
      eintrag.addEventListener("click", () => oeffneHandbuchDokument(dok.id));
      el.handbuchListe.appendChild(eintrag);
    });
  }

  // Öffnet ein Dokument rechts neben der (weiterhin sichtbaren) Seitenleiste.
  function oeffneHandbuchDokument(id) {
    aktivesHandbuchDokumentId = id;
    if (el.handbuchPlatzhalter) el.handbuchPlatzhalter.hidden = true;
    if (el.handbuchDokumentAnsicht) el.handbuchDokumentAnsicht.hidden = false;
    // Sicherheitshalber immer im Lesemodus öffnen, nie mitten im
    // Bearbeitungsmodus eines zuvor geöffneten Dokuments.
    if (el.handbuchEditorWrapper) el.handbuchEditorWrapper.hidden = true;
    if (el.handbuchInhaltAnzeige) el.handbuchInhaltAnzeige.hidden = false;
    renderHandbuchDokument(id);
    renderHandbuchListe(); // aktualisiert die Hervorhebung in der Seitenleiste
  }

  // Entfernt die aktuelle Auswahl (z. B. über "Zurück zur Übersicht") - die
  // Seitenleiste selbst bleibt dabei unverändert sichtbar, nur rechts
  // erscheint wieder der schlichte Platzhalter-Hinweis.
  function zeigeHandbuchPlatzhalter() {
    aktivesHandbuchDokumentId = null;
    if (el.handbuchDokumentAnsicht) el.handbuchDokumentAnsicht.hidden = true;
    if (el.handbuchPlatzhalter) el.handbuchPlatzhalter.hidden = false;
    renderHandbuchListe();
  }

  // Wird beim Öffnen des Handbuch-Reiters aufgerufen: bleibt beim zuletzt
  // geöffneten Dokument (falls noch vorhanden), öffnet sonst automatisch das
  // erste Dokument der Liste, oder zeigt den Platzhalter, falls es noch gar
  // keine Dokumente gibt.
  function praesentiereHandbuchStartzustand() {
    if (aktivesHandbuchDokumentId && handbuchDokumente.some((d) => d.id === aktivesHandbuchDokumentId)) {
      oeffneHandbuchDokument(aktivesHandbuchDokumentId);
      return;
    }
    if (handbuchDokumente.length > 0) {
      oeffneHandbuchDokument(handbuchDokumente[0].id);
    } else {
      zeigeHandbuchPlatzhalter();
    }
  }

  // Aktualisiert Kopfzeile + Leseansicht eines Dokuments. Rührt bewusst
  // NICHT an, ob gerade der Lese- oder der Bearbeitungsmodus sichtbar ist -
  // das steuern ausschließlich starteHandbuchBearbeitung()/
  // beendeHandbuchBearbeitung(), damit ein Admin mitten in der Bearbeitung
  // nicht durch ein Live-Update (z. B. durch einen anderen Admin) aus dem
  // Editor gerissen wird.
  function renderHandbuchDokument(id) {
    const dok = handbuchDokumente.find((d) => d.id === id);
    if (!dok) {
      zeigeHandbuchPlatzhalter();
      return;
    }

    if (el.handbuchKopfTitel) el.handbuchKopfTitel.textContent = dok.titel || "—";
    if (el.handbuchKopfVersion) {
      el.handbuchKopfVersion.textContent = typeof dok.version === "number" ? dok.version.toFixed(1) : "1.0";
    }
    if (el.handbuchKopfDatum) el.handbuchKopfDatum.textContent = formatiereFirestoreZeitstempel(dok.letzteAenderung);
    if (el.handbuchKopfBearbeiter) el.handbuchKopfBearbeiter.textContent = dok.letzterBearbeiter || "—";
    if (el.handbuchInhaltAnzeige) el.handbuchInhaltAnzeige.innerHTML = dok.inhalt || "";
    // Den "Bearbeiten"-Button nur anfassen, wenn der Editor gerade NICHT
    // offen ist - sonst könnte ein Live-Update während einer laufenden
    // Bearbeitung (z. B. durch einen anderen Admin an einem anderen
    // Dokument) den Button unter dem geöffneten Editor wieder einblenden.
    const geradeImEditor = el.handbuchEditorWrapper && !el.handbuchEditorWrapper.hidden;
    if (el.handbuchBtnBearbeiten && !geradeImEditor) el.handbuchBtnBearbeiten.hidden = !istAdmin();
  }

  // Wechselt "an Ort und Stelle" (kein separates Fenster/Modal) in den
  // Bearbeitungsmodus - derselbe Inhalt wird im Rich-Text-Editor geöffnet.
  function starteHandbuchBearbeitung() {
    if (!istAdmin() || !aktivesHandbuchDokumentId) return;
    const dok = handbuchDokumente.find((d) => d.id === aktivesHandbuchDokumentId);
    if (!dok || !el.handbuchEditorFeld) return;

    el.handbuchEditorFeld.innerHTML = dok.inhalt || "";
    if (el.handbuchInhaltAnzeige) el.handbuchInhaltAnzeige.hidden = true;
    if (el.handbuchBtnBearbeiten) el.handbuchBtnBearbeiten.hidden = true;
    if (el.handbuchEditorWrapper) el.handbuchEditorWrapper.hidden = false;
    el.handbuchEditorFeld.focus();
    // Sorgt dafür, dass die Enter-Taste von Anfang an <p>-Absätze statt
    // browserabhängiger <div>s erzeugt (wichtig für saubere, vorhersehbare
    // Abstände in der Leseansicht).
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch (fehler) {
      /* ältere Browser kennen dieses Kommando nicht - kein Problem, nur kosmetisch */
    }
  }

  // Beendet den Bearbeitungsmodus (nach "Speichern" oder "Abbrechen") und
  // wechselt automatisch zurück in die normale Leseansicht.
  function beendeHandbuchBearbeitung() {
    if (el.handbuchEditorWrapper) el.handbuchEditorWrapper.hidden = true;
    if (el.handbuchInhaltAnzeige) el.handbuchInhaltAnzeige.hidden = false;
    if (el.handbuchBtnBearbeiten) el.handbuchBtnBearbeiten.hidden = !istAdmin() || !aktivesHandbuchDokumentId;
  }

  // Erlaubt NUR eine kleine, feste Auswahl an Tags (Überschriften 1/2, Fett,
  // Kursiv, Aufzählung, Nummerierung, horizontale Linie, Absätze/Zeilen-
  // umbrüche) und verwirft alles andere (Skripte, Bilder, Tabellen, fremde
  // Attribute, ...) - verhindert HTML-Injection aus dem contenteditable-Feld.
  // Bewusst als eigene Funktion (statt sanitisiereRichText() von oben
  // mitzunutzen): das Handbuch erlaubt eine GRÖSSERE Tag-Auswahl
  // (Überschriften/Listen/Trennlinie) als Notizen/Ankündigungen/Wiki, dafür
  // absichtlich KEINE Schriftfarbe - der Editor bietet sie gar nicht erst an.
  function sanitisiereHandbuchInhalt(html) {
    const quelle = document.createElement("div");
    quelle.innerHTML = html;

    function bereinigeKinder(knoten, ziel) {
      Array.from(knoten.childNodes).forEach((kind) => {
        if (kind.nodeType === Node.TEXT_NODE) {
          ziel.appendChild(document.createTextNode(kind.textContent));
          return;
        }
        if (kind.nodeType !== Node.ELEMENT_NODE) return;

        const tag = kind.tagName;

        if (tag === "BR") {
          ziel.appendChild(document.createElement("br"));
          return;
        }
        if (tag === "HR") {
          ziel.appendChild(document.createElement("hr"));
          return;
        }
        if (tag === "H1" || tag === "H2") {
          const neu = document.createElement(tag.toLowerCase());
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "STRONG" || tag === "B") {
          const neu = document.createElement("strong");
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "EM" || tag === "I") {
          const neu = document.createElement("em");
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "UL" || tag === "OL") {
          const neu = document.createElement(tag.toLowerCase());
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "LI") {
          const neu = document.createElement("li");
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }
        if (tag === "P" || tag === "DIV") {
          // Contenteditable erzeugt je nach Browser DIV statt P für
          // einzelne Absätze - beides wird als Absatz behandelt.
          const neu = document.createElement("p");
          bereinigeKinder(kind, neu);
          ziel.appendChild(neu);
          return;
        }

        // Alles andere (SPAN, FONT, U, MARK, SCRIPT, IMG, TABLE, ...): Tag
        // verwerfen, Text-Inhalt behalten (mit Zeilenumbruch, damit nichts
        // zusammenläuft).
        bereinigeKinder(kind, ziel);
        ziel.appendChild(document.createElement("br"));
      });
    }

    const ergebnis = document.createElement("div");
    bereinigeKinder(quelle, ergebnis);
    return ergebnis.innerHTML;
  }

  if (el.handbuchBtnZurueck) {
    el.handbuchBtnZurueck.addEventListener("click", () => zeigeHandbuchPlatzhalter());
  }

  if (el.handbuchBtnBearbeiten) {
    el.handbuchBtnBearbeiten.addEventListener("click", () => starteHandbuchBearbeitung());
  }

  if (el.handbuchBtnAbbrechen) {
    el.handbuchBtnAbbrechen.addEventListener("click", () => beendeHandbuchBearbeitung());
  }

  if (el.handbuchBtnSpeichern) {
    el.handbuchBtnSpeichern.addEventListener("click", () => {
      if (!istAdmin() || !aktivesHandbuchDokumentId || !aktuellerNutzer || !el.handbuchEditorFeld) return;
      const dok = handbuchDokumente.find((d) => d.id === aktivesHandbuchDokumentId);
      if (!dok) return;

      const inhalt = sanitisiereHandbuchInhalt(el.handbuchEditorFeld.innerHTML.trim());
      // Automatische Versionierung: bei jeder Änderung um 0.1 erhöht (1.0 ->
      // 1.1 -> 1.2, ...) - zusammen mit Datum und Bearbeiter automatisch
      // gepflegt, ohne dass ein Admin das manuell einträgt.
      const bisherigeVersion = typeof dok.version === "number" ? dok.version : 1.0;
      const naechsteVersion = Math.round((bisherigeVersion + 0.1) * 10) / 10;

      el.handbuchBtnSpeichern.disabled = true;
      db.collection(HANDBUCH_COLLECTION)
        .doc(aktivesHandbuchDokumentId)
        .update({
          inhalt,
          version: naechsteVersion,
          letzteAenderung: firebase.firestore.FieldValue.serverTimestamp(),
          letzterBearbeiter: aktuellerNutzer.name,
        })
        .then(() => {
          // Sofort den neuen Inhalt anzeigen, statt kurz den alten Stand zu
          // zeigen, bis das Live-Update aus Firestore zurückkommt (das
          // folgt gleich danach automatisch und bestätigt nur denselben Stand).
          if (el.handbuchInhaltAnzeige) el.handbuchInhaltAnzeige.innerHTML = inhalt;
          if (el.handbuchKopfVersion) el.handbuchKopfVersion.textContent = naechsteVersion.toFixed(1);
          if (el.handbuchKopfBearbeiter) el.handbuchKopfBearbeiter.textContent = aktuellerNutzer.name;
          zeigeToast("Dokument wurde gespeichert.");
          beendeHandbuchBearbeitung();
        })
        .catch((fehler) => {
          console.error("Handbuch-Dokument konnte nicht gespeichert werden:", fehler);
          zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
        })
        .finally(() => {
          el.handbuchBtnSpeichern.disabled = false;
        });
    });
  }

  // Eigene, zusätzliche Toolbar für den Handbuch-Editor (Überschriften 1/2,
  // Fett, Kursiv, Aufzählung, Nummerierung, horizontale Linie). Bewusst NICHT
  // über die bestehende ".format-toolbar"-Logik weiter oben gelöst (die
  // kennt nur Fett/Unterstrichen/Schriftfarbe für Notizen/Ankündigungen/Wiki)
  // - eigene CSS-Klasse ".handbuch-toolbar" und ein eigenes Daten-Attribut
  // "data-handbuch-format", damit beide Handler sich nicht gegenseitig
  // stören und die bestehende Funktionalität unverändert bleibt.
  if (el.handbuchEditorFeld) {
    document.querySelectorAll(".handbuch-toolbar .format-btn[data-handbuch-format]").forEach((btn) => {
      btn.addEventListener("mousedown", (event) => {
        event.preventDefault(); // Fokus/Markierung im Editor nicht verlieren
        el.handbuchEditorFeld.focus();
        try {
          document.execCommand("defaultParagraphSeparator", false, "p");
        } catch (fehler) {
          /* ältere Browser kennen dieses Kommando nicht - kein Problem, nur kosmetisch */
        }

        switch (btn.dataset.handbuchFormat) {
          case "h1":
            document.execCommand("formatBlock", false, "H1");
            break;
          case "h2":
            document.execCommand("formatBlock", false, "H2");
            break;
          case "bold":
            document.execCommand("bold");
            break;
          case "italic":
            document.execCommand("italic");
            break;
          case "ul":
            document.execCommand("insertUnorderedList");
            break;
          case "ol":
            document.execCommand("insertOrderedList");
            break;
          case "hr":
            document.execCommand("insertHorizontalRule");
            break;
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     12. Modal-Steuerung
     ------------------------------------------------------------------------ */
  function oeffneModal(modalElement) {
    modalElement.classList.add("modal-overlay--visible");
  }

  function schliesseModal(modalElement) {
    modalElement.classList.remove("modal-overlay--visible");
  }

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) schliesseModal(overlay);
    });
  });

  // Versteckte Verkaufsstatistik: nur über den kleinen ⓘ-Button in der
  // Medikamenten-Werkzeugleiste erreichbar, sonst nirgends sichtbar.
  const btnVerkaufsstatistik = document.getElementById("btn-verkaufsstatistik");
  if (btnVerkaufsstatistik) {
    btnVerkaufsstatistik.addEventListener("click", () => {
      renderVerkaufsstatistik();
      oeffneModal(el.modalStatistik);
    });
  }

  function renderVerkaufsstatistik() {
    const liste = document.getElementById("stats-modal-list");
    const leer = document.getElementById("stats-modal-empty");
    if (!liste) return;

    // Menge je Medikament aus allen bekannten Verkäufen aufsummieren
    const mengenProArtikel = {};
    letzteVerkaeufe.forEach((verkauf) => {
      verkauf.items.forEach((item) => {
        mengenProArtikel[item.name] = (mengenProArtikel[item.name] || 0) + item.menge;
      });
    });

    const sortiert = Object.entries(mengenProArtikel).sort((a, b) => b[1] - a[1]);

    liste.innerHTML = "";
    leer.hidden = sortiert.length !== 0;

    sortiert.slice(0, 8).forEach(([name, menge], index) => {
      const zeile = document.createElement("div");
      zeile.className = "stats-modal__row";
      zeile.innerHTML = `
        <span class="stats-modal__rank">#${index + 1}</span>
        <span class="stats-modal__name">${escapeHtml(name)}</span>
        <span class="stats-modal__count">${menge}× verkauft</span>
      `;
      liste.appendChild(zeile);
    });
  }

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      schliesseModal(document.getElementById(btn.getAttribute("data-close-modal")));
    });
  });

  // Generisches Öffnen von Modals über ein Attribut (aktuell nur für die
  // beiden Footer-Links "Datenschutz"/"Informationen" gebraucht, die sowohl
  // auf dem Login-Bildschirm als auch in der App erreichbar sein müssen -
  // Modals funktionieren unabhängig davon, ob gerade der Login-Bildschirm
  // oder die App sichtbar ist, deshalb diese Lösung statt eines eigenen
  // Navigationspunkts).
  document.querySelectorAll("[data-open-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = document.getElementById(btn.getAttribute("data-open-modal"));
      if (modal) oeffneModal(modal);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".modal-overlay--visible").forEach(schliesseModal);
  });

  /* ------------------------------------------------------------------------
     14. Medikament hinzufügen
     ------------------------------------------------------------------------ */
  el.btnAddMedikament.addEventListener("click", () => {
    el.inputMedName.value = "";
    el.inputMedPrice.value = "";
    el.inputMedBeschreibung.value = "";
    el.addError.hidden = true;
    oeffneModal(el.modalAdd);
    el.inputMedName.focus();
  });

  el.btnConfirmAdd.addEventListener("click", () => {
    const name = el.inputMedName.value.trim();
    const preis = parseFloat(el.inputMedPrice.value);

    if (!name) return zeigeFeldFehler(el.addError, "Bitte gib einen Namen für das Medikament ein.");
    if (isNaN(preis) || preis < 0) return zeigeFeldFehler(el.addError, "Bitte gib einen gültigen Preis (0 oder größer) ein.");
    if (medikamente.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return zeigeFeldFehler(el.addError, "Ein Medikament mit diesem Namen existiert bereits.");
    }

    medikamente.push({
      id: erzeugeId(name),
      name: name,
      preis: preis,
      menge: 0,
      beschreibung: el.inputMedBeschreibung.value.trim(),
    });

    speichereMedikamenteInFirestore();
    render();
    schliesseModal(el.modalAdd);
    zeigeToast(`„${name}“ wurde hinzugefügt.`);
  });

  /* ------------------------------------------------------------------------
     15. Preis bearbeiten
     ------------------------------------------------------------------------ */
  function oeffnePreisBearbeitenModal(id) {
    const med = medikamente.find((m) => m.id === id);
    if (!med) return;

    aktivesMedikamentId = id;
    el.editPriceName.textContent = med.name;
    el.inputEditPrice.value = med.preis;
    el.editError.hidden = true;
    oeffneModal(el.modalEditPrice);
    el.inputEditPrice.focus();
  }

  el.btnConfirmEdit.addEventListener("click", () => {
    const neuerPreis = parseFloat(el.inputEditPrice.value);
    if (isNaN(neuerPreis) || neuerPreis < 0) {
      return zeigeFeldFehler(el.editError, "Bitte gib einen gültigen Preis (0 oder größer) ein.");
    }

    const med = medikamente.find((m) => m.id === aktivesMedikamentId);
    if (med) {
      med.preis = neuerPreis;
      speichereMedikamenteInFirestore();
      render();
      zeigeToast(`Preis von „${med.name}“ wurde aktualisiert.`);
    }

    schliesseModal(el.modalEditPrice);
    aktivesMedikamentId = null;
  });

  /* ------------------------------------------------------------------------
     16. Löschen-Bestätigung (generisch für Medikamente, Notizen, Verkäufe)
     ------------------------------------------------------------------------ */
  let pendingDeleteAktion = null; // Funktion, die bei Bestätigung ausgeführt wird

  function oeffneBestaetigungsModal(titel, text, aktion) {
    el.modalDelete.querySelector(".modal__header h3").textContent = titel;
    el.deleteText.textContent = text;
    pendingDeleteAktion = aktion;
    oeffneModal(el.modalDelete);
  }

  function oeffneLoeschenModal(id) {
    const med = medikamente.find((m) => m.id === id);
    if (!med) return;

    oeffneBestaetigungsModal(
      "Medikament löschen",
      `Möchtest du „${med.name}“ wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
      () => {
        if (!istAdmin()) {
          zeigeToast("Nur Admins dürfen löschen.");
          return;
        }
        medikamente = medikamente.filter((m) => m.id !== id);
        speichereMedikamenteInFirestore();
        render();
        zeigeToast(`„${med.name}“ wurde gelöscht.`);
      }
    );
  }

  el.btnConfirmDelete.addEventListener("click", () => {
    if (pendingDeleteAktion) pendingDeleteAktion();
    schliesseModal(el.modalDelete);
    pendingDeleteAktion = null;
  });

  /* ------------------------------------------------------------------------
     17. Tabellen-Events: Menge ändern, Bearbeiten- & Löschen-Buttons
     ------------------------------------------------------------------------ */
  el.tableBody.addEventListener("input", (event) => {
    const target = event.target;
    if (target.dataset.role !== "qty") return;

    const med = medikamente.find((m) => m.id === target.dataset.id);
    if (!med) return;

    let wert = parseInt(target.value, 10);
    if (isNaN(wert) || wert < 0) wert = 0;

    med.menge = wert;
    speichereMedikamenteDebounced();
    renderStatistik();
    aktualisiereZwischensummeInZeile(target);
  });

  function aktualisiereZwischensummeInZeile(inputElement) {
    const zeile = inputElement.closest(".med-row");
    if (!zeile) return;
    const med = medikamente.find((m) => m.id === inputElement.dataset.id);
    if (!med) return;

    zeile.querySelector(".subtotal").textContent = formatiereGeld((Number(med.menge) || 0) * Number(med.preis));
  }

  el.tableBody.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-role]");
    if (!btn) return;

    if (btn.dataset.role === "edit") oeffnePreisBearbeitenModal(btn.dataset.id);
    else if (btn.dataset.role === "delete") oeffneLoeschenModal(btn.dataset.id);
  });

  // "Reihenfolge bearbeiten"-Umschalter: aktiviert/deaktiviert den Drag-&-
  // Drop-Sortiermodus für die Medikamentenliste.
  const btnToggleMedSortierung = document.getElementById("btn-toggle-med-sortierung");
  if (btnToggleMedSortierung) {
    btnToggleMedSortierung.addEventListener("click", () => {
      if (!istAdmin()) return;
      medikamenteSortierModus = !medikamenteSortierModus;
      renderTabelle();
    });
  }

  // Drag & Drop: Zeile per Maus halten und an neue Position ziehen. Die
  // gehaltene Maustaste + Bewegung wird vom Browser selbst als "Drag"
  // erkannt (kein eigenes Mousemove-Tracking nötig) - dabei zeigt der
  // Browser automatisch ein Vorschaubild der gezogenen Zeile an.
  el.tableBody.addEventListener("dragstart", (event) => {
    const zeile = event.target.closest(".med-row--sortierbar");
    if (!zeile) return;
    ziehId = zeile.dataset.id;
    zeile.classList.add("med-row--wird-gezogen");
    event.dataTransfer.effectAllowed = "move";
  });

  el.tableBody.addEventListener("dragend", (event) => {
    const zeile = event.target.closest(".med-row--sortierbar");
    if (zeile) zeile.classList.remove("med-row--wird-gezogen");
    el.tableBody.querySelectorAll(".med-row--drueber").forEach((z) => z.classList.remove("med-row--drueber"));
    ziehId = null;
  });

  el.tableBody.addEventListener("dragover", (event) => {
    const zeile = event.target.closest(".med-row--sortierbar");
    if (!zeile || !ziehId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (zeile.dataset.id !== ziehId) {
      el.tableBody.querySelectorAll(".med-row--drueber").forEach((z) => z.classList.remove("med-row--drueber"));
      zeile.classList.add("med-row--drueber");
    }
  });

  el.tableBody.addEventListener("drop", (event) => {
    const zeile = event.target.closest(".med-row--sortierbar");
    if (!zeile || !ziehId) return;
    event.preventDefault();
    verschiebeMedikamentAn(ziehId, zeile.dataset.id);
  });

  /* ------------------------------------------------------------------------
     18. Suchfeld
     ------------------------------------------------------------------------ */
  el.searchInput.addEventListener("input", (event) => {
    suchbegriff = event.target.value;
    renderTabelle();
  });

  /* ------------------------------------------------------------------------
     19. Sidebar-Navigation
     ------------------------------------------------------------------------ */
  el.navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const zielView = item.dataset.view;

      // Sonderfall "Infos": kein Dropdown mehr, sondern normaler Menüpunkt -
      // navigiert zur zuletzt aktiven Kategorie (Tabs regeln den Rest direkt
      // auf der Seite).
      if (zielView === "notizen") {
        wechsleZuNotizenAnsicht(aktiveNotizKategorie);
        return;
      }

      // Sonderfall "Verkauf": ebenfalls kein Dropdown mehr - navigiert zur
      // zuletzt aktiven Unterseite (Medikamente/Verkaufslog), Tabs regeln
      // den Rest direkt auf der Seite.
      if (item === navVerkaufToggle) {
        wechsleZuVerkaufAnsicht(aktiverVerkaufSubview);
        return;
      }

      // Sonderfall "Admin": genau wie bei Verkauf - navigiert zur zuletzt
      // aktiven Unterseite (Benutzer/Aktivitäts-Log).
      if (item === el.navAdminToggle) {
        wechsleZuAdminAnsicht(aktiverAdminSubview);
        return;
      }

      el.navItems.forEach((i) => i.classList.remove("nav__item--active"));
      item.classList.add("nav__item--active");

      el.views.forEach((view) => view.classList.remove("view--active"));
      document.getElementById(`view-${zielView}`).classList.add("view--active");

      // Start-Seite zeigt ihre eigene, persönliche Begrüßung statt des
      // gemeinsamen Seitenkopfs - der wird für diese eine Seite ausgeblendet.
      // Handbuch bekommt aus demselben Grund keinen eigenen Seitenkopf: die
      // Seitenleiste dient dort bereits als Überschrift, und der Platz wird
      // gebraucht, damit möglichst viel vom Dokument ohne Scrollen passt.
      const pageHeader = document.getElementById("page-header");
      if (pageHeader) pageHeader.hidden = zielView === "start" || zielView === "handbuch";

      const meta = VIEW_META[zielView];
      if (meta) {
        el.viewTitle.textContent = meta.title;
        el.viewSubtitle.textContent = meta.subtitle;
      }

      if (zielView === "mitarbeiter") {
        mitarbeiterBearbeitenModus = false; // Sicherheitshalber immer mit Lese-Ansicht starten
        renderMitarbeiterListe();
      }

      if (zielView === "handbuch") {
        praesentiereHandbuchStartzustand(); // bleibt beim zuletzt offenen Dokument oder öffnet automatisch das erste
      }
      // "admin" wird nie hier erreicht - der Sonderfall weiter oben fängt
      // den Klick auf den Admin-Reiter bereits ab (siehe wechsleZuAdminAnsicht).
    });
  });

  // Schnellzugriff-Kacheln auf dem Dashboard - navigieren einfach zum
  // jeweiligen Hauptpunkt der Topbar (kein eigener Navigations-Code nötig).
  document.querySelectorAll(".dashboard-quicklink").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ziel = btn.dataset.quicklink;
      if (ziel === "medikamente") {
        wechsleZuVerkaufAnsicht("medikamente");
        return;
      }
      const navBtn = document.querySelector(`.nav__item[data-view="${ziel}"]`);
      if (navBtn) navBtn.click();
    });
  });

  // "Neue Ankündigung"-Button blendet das Formular ein/aus (steht jetzt
  // standardmäßig eingeklappt - erst Informationen sehen, dann erstellen).
  const btnNeueAnkuendigung = document.getElementById("btn-neue-ankuendigung");
  const btnAnkuendigungAbbrechen = document.getElementById("btn-ankuendigung-abbrechen");
  if (btnNeueAnkuendigung) {
    btnNeueAnkuendigung.addEventListener("click", () => {
      el.boardAdminForm.hidden = false;
      btnNeueAnkuendigung.hidden = true;
      el.boardAdminForm.scrollIntoView({ behavior: "smooth", block: "start" });
      el.ankuendigungInput.focus();
    });
  }
  if (btnAnkuendigungAbbrechen) {
    btnAnkuendigungAbbrechen.addEventListener("click", () => {
      el.boardAdminForm.hidden = true;
      if (btnNeueAnkuendigung) btnNeueAnkuendigung.hidden = false;
      el.ankuendigungInput.innerHTML = "";
    });
  }

  /* ------------------------------------------------------------------------
     20. Enter-Taste bestätigt Dialoge
     ------------------------------------------------------------------------ */
  [el.inputMedName, el.inputMedPrice].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") el.btnConfirmAdd.click();
    });
  });
  el.inputEditPrice.addEventListener("keydown", (event) => {
    if (event.key === "Enter") el.btnConfirmEdit.click();
  });

  /* ------------------------------------------------------------------------
     21. Geheimes Easter Egg (7x auf das Logo klicken)
     ------------------------------------------------------------------------ */
  (function initEasterEgg() {
    const trigger = document.getElementById("easter-egg-trigger");
    const overlay = document.getElementById("easter-egg-overlay");
    const closeBtn = document.getElementById("easter-egg-close");
    if (!trigger || !overlay) return;

    const KLICKS_NOETIG = 7;
    const RESET_ZEIT_MS = 1500;
    let klicks = 0;
    let resetTimer = null;
    const KONFETTI_EMOJIS = ["🤠", "🐎", "💰", "🌵", "⭐", "🔫"];

    trigger.addEventListener("click", () => {
      klicks += 1;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => (klicks = 0), RESET_ZEIT_MS);

      if (klicks >= KLICKS_NOETIG) {
        klicks = 0;
        zeigeEasterEgg();
      }
    });

    function zeigeEasterEgg() {
      overlay.classList.add("easter-egg-overlay--visible");
      erzeugeKonfetti();
    }

    function verstecke() {
      overlay.classList.remove("easter-egg-overlay--visible");
      overlay.querySelectorAll(".easter-egg-confetti").forEach((el) => el.remove());
    }

    function erzeugeKonfetti() {
      for (let i = 0; i < 26; i++) {
        const stueck = document.createElement("span");
        stueck.className = "easter-egg-confetti";
        stueck.textContent = KONFETTI_EMOJIS[Math.floor(Math.random() * KONFETTI_EMOJIS.length)];
        stueck.style.left = `${Math.random() * 100}%`;
        stueck.style.animationDuration = `${2 + Math.random() * 1.5}s`;
        stueck.style.animationDelay = `${Math.random() * 0.6}s`;
        overlay.appendChild(stueck);
      }
    }

    closeBtn.addEventListener("click", verstecke);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) verstecke();
    });
  })();

  /* ------------------------------------------------------------------------
     22. Automatische Update-Prüfung
     ------------------------------------------------------------------------ */
  // Diese Zahl MUSS bei jedem Update von index.html/css/js erhöht werden -
  // zusammen mit dem Wert in version.json. So merkt die App automatisch,
  // wenn eine neuere Version online verfügbar ist (auch wenn jemand
  // tagelang eingeloggt in einem offenen Tab bleibt).
  const APP_VERSION = 94;
  const UPDATE_CHECK_INTERVALL_MS = 3 * 60 * 1000; // alle 3 Minuten prüfen

  (function initUpdateChecker() {
    const banner = document.getElementById("update-banner");
    const btn = document.getElementById("update-banner-btn");
    if (!banner || !btn) return;

    let bereitsErkannt = false;

    function pruefeAufUpdate() {
      if (bereitsErkannt) return;

      fetch(`version.json?t=${Date.now()}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((daten) => {
          if (daten && typeof daten.version === "number" && daten.version > APP_VERSION) {
            bereitsErkannt = true;
            banner.hidden = false;
          }
        })
        .catch(() => {
          /* Kein Internet o.ä. - einfach beim nächsten Intervall erneut versuchen */
        });
    }

    btn.addEventListener("click", () => {
      // Die Firebase-Auth-Sitzung selbst bleibt erhalten (kein Grund, sich
      // wegen eines Website-Updates neu anzumelden) - ein einfacher Reload
      // lädt die neue Version, onAuthStateChanged erkennt danach automatisch
      // die weiterhin bestehende Sitzung.
      window.location.reload();
    });

    // Direkt beim Laden einmal prüfen (mit kleiner Verzögerung) und danach
    // regelmäßig im Hintergrund weiterprüfen, auch während man eingeloggt
    // auf der Login- oder App-Seite bleibt.
    setTimeout(pruefeAufUpdate, 5000);
    setInterval(pruefeAufUpdate, UPDATE_CHECK_INTERVALL_MS);

    // Wenn der Tab nach längerer Zeit wieder in den Vordergrund geholt wird
    // (z. B. am nächsten Abend), sofort erneut prüfen.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") pruefeAufUpdate();
    });
  })();

  /* ------------------------------------------------------------------------
     23. Start
     ------------------------------------------------------------------------
     Kein expliziter Aufruf mehr nötig: js/auth.js prüft beim Laden über
     onAuthStateChanged automatisch, ob schon eine gültige Firebase-Sitzung
     besteht, und feuert danach "bwm:auth-approved" (siehe Bridge weiter
     oben in dieser Datei), was appStarten() auslöst.
     ------------------------------------------------------------------------ */
})();

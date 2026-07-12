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

  // Die Stationierungen (RDR2-Roleplay-Städte) inkl. Farbcode - passend zur
  // farblichen Kennzeichnung im Spiel selbst.
  const STATIONEN = {
    direktion: { label: "Ärztliche Direktion", max: 1, farbe: null },
    rhodes: { label: "Rhodes", max: 8, farbe: "green" },
    blackwater: { label: "Blackwater", max: 8, farbe: "red" },
    valentine: { label: "Valentine", max: 8, farbe: null },
    strawberry: { label: "Strawberry", max: 8, farbe: null },
    saintdenis: { label: "Saint Denis", max: 8, farbe: null },
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

  // Standard-Mitarbeiter-/Stationsliste: FESTE Anzahl Plätze je Station
  // (reines Organisations-Tool für die Mitarbeiter-Seite - hat NICHTS mit
  // dem Login zu tun). Leere Plätze haben name: "". "abteilung" ist nur für
  // Medizinisches Personal relevant (z. B. "Innere Medizin") - bei Leitungs-
  // Rängen wird stattdessen immer der feste Text "Ärztliche Leitung" gezeigt.
  function erzeugeLeereStation(anzahl) {
    const plaetze = [];
    for (let i = 0; i < anzahl; i++) plaetze.push({ name: "", rolle: "Anwärter", abteilung: "" });
    return plaetze;
  }

  const DEFAULT_STATIONEN = {
    direktion: [{ name: "Chris Moon", rolle: "Ärztliche Direktion" }],
    blackwater: erzeugeLeereStation(8),
    // Chris Moon führt zusätzlich zu seiner Ärztlichen Direktion auch als
    // Chefarzt die Station Rhodes - zwei unterschiedliche Rollen, bewusst so.
    rhodes: [{ name: "Chris Moon", rolle: "Chefarzt" }, ...erzeugeLeereStation(7)],
    valentine: erzeugeLeereStation(8),
    strawberry: erzeugeLeereStation(8),
    saintdenis: erzeugeLeereStation(8),
  };

  const STORAGE_KEY_LEGACY = "medicalDepartment.medikamente.v1";
  const STORAGE_KEY_V2 = "medicalDepartment.medikamente.v2";

  const MEDIKAMENTE_DOC = "department/medikamente";
  const MITARBEITER_DOC = "department/mitarbeiter";
  const INFOS_DOC = "department/infos";
  const PRESENCE_COLLECTION = "presence";
  const NOTIZEN_COLLECTION = "notizen";
  const VERKAUFSLOG_COLLECTION = "verkaufslog";
  const KONTAKTE_COLLECTION = "kontakte";
  const ANKUENDIGUNGEN_COLLECTION = "ankuendigungen";
  const ONLINE_SCHWELLE_MS = 45 * 1000;   // Nach 45s ohne Update gilt jemand als offline
  const HEARTBEAT_INTERVALL_MS = 20 * 1000;

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
  let unsubBenutzerliste = null;
  let unsubInfos = null;
  let unsubAnkuendigungen = null;
  let stationenDaten = { direktion: [], blackwater: [], rhodes: [] }; // Feste Plätze je Station
  let benutzerListe = [];          // Alle Accounts (nur für Admins geladen) - für die Benutzerverwaltung
  let bekanntePendingUids = null;  // null = Liste noch nie geladen (verhindert Toast beim allerersten Laden)
  let benutzerSuche = "";          // Suchbegriff im Admin Panel (Filter nach Benutzername)
  let aktiverDetailUid = null;     // uid des Benutzers, dessen Detail-Modal gerade offen ist (oder null)
  let unsubAdminLog = null;
  let adminLogEintraege = [];      // Die letzten Aktivitäts-Log-Einträge (nur für Admins geladen)
  let infosListe = [];             // Dynamische Infos-Seite
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
    noteInput: document.getElementById("note-input"),
    notesList: document.getElementById("notes-list"),
    notesEmpty: document.getElementById("notes-empty"),

    formKontakt: document.getElementById("form-kontakt"),
    kontaktNummerInput: document.getElementById("kontakt-nummer-input"),
    kontaktNameInput: document.getElementById("kontakt-name-input"),
    kontaktNotizInput: document.getElementById("kontakt-notiz-input"),
    kontaktList: document.getElementById("kontakt-list"),
    kontakteEmpty: document.getElementById("kontakte-empty"),
    kontakteNoResults: document.getElementById("kontakte-no-results"),
    kontakteSearch: document.getElementById("kontakte-search"),

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
    infosGrid: document.getElementById("infos-grid"),

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

  // Formatierungsleisten mit den Feldern verbinden. Alle drei Rich-Editoren
  // (Ankündigungen, Notizen, Medizin-Wiki) sind contenteditable-Felder -
  // Fett/Unterstrichen/Schriftfarbe wirken überall sofort WYSIWYG (kein
  // **/__ mehr). Der **/__-Markdown-Zweig unten bleibt nur noch als
  // Rückfallebene für den Fall bestehen, dass irgendwo doch noch ein
  // reines Textfeld mit .format-toolbar verbunden wird.
  document.querySelectorAll(".format-toolbar").forEach((toolbar) => {
    const feld = document.getElementById(toolbar.dataset.target);
    if (!feld) return;

    const istRichEditor = feld.isContentEditable;

    toolbar.querySelectorAll(".format-btn[data-format]").forEach((btn) => {
      if (istRichEditor) {
        // "mousedown" statt "click" + preventDefault, damit das Editor-Feld
        // beim Klick auf den Button nicht den Fokus/die Markierung verliert
        btn.addEventListener("mousedown", (event) => {
          event.preventDefault();
          feld.focus();
          document.execCommand(btn.dataset.format === "bold" ? "bold" : "underline");
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
  });

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
  });

  function appStarten() {
    el.authScreen.hidden = true;
    el.appRoot.hidden = false;

    renderBenutzerBadge();
    renderMitarbeiterListe();
    aktualisiereAdminNavSichtbarkeit();

    sessionId = sessionStorage.getItem("medicalDepartment.sessionId") || erzeugeSessionId();
    sessionStorage.setItem("medicalDepartment.sessionId", sessionId);

    abonniereMedikamente();
    starteHeartbeat();
    abonnierePresence();
    abonniereNotizen();
    abonniereVerkaufslog();
    abonniereMitarbeiterliste();
    abonniereInfos();
    abonniereAnkuendigungen();
    abonniereKontakte();

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

  function renderMitarbeiterListe() {
    if (!el.staffGrid) return;
    renderBenutzerBadge(); // Badge-Avatar aktualisieren, sobald die Liste geladen ist

    // Schutz gegen Fokus-Verlust: Wenn gerade ein Namensfeld/Rang-Dropdown in
    // Benutzung ist (Tippen oder gerade ausgewählt), wird die Liste NICHT
    // mitten drin komplett neu aufgebaut - das würde das Feld/Dropdown
    // zerstören und den Fokus/die Eingabe verlieren. Der nächste Render
    // (z. B. nach dem Verlassen des Feldes) holt den aktuellen Stand nach.
    const aktivesElement = document.activeElement;
    const istEingabeInBearbeitung =
      el.staffGrid.contains(aktivesElement) && (aktivesElement.tagName === "INPUT" || aktivesElement.tagName === "SELECT");
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

    // Ausschließlich anhand der VORHANDENEN Ränge und Standorte gegliedert -
    // keine feste Namensliste, keine Umbenennung bestehender Ränge.
    // "Leitung" fasst alle Führungsränge zusammen (Ärztliche Direktion,
    // Chefarzt, Stellv. Chefarzt, Oberarzt, Stellv. Oberarzt), "Medizinisches
    // Personal" den Rest. Die Standorte (STATIONEN, ohne "direktion") bilden
    // in der Leitung die Gruppierung je Zeile, beim Personal eigene Tabs.
    const LEITUNGS_RANGFOLGE = ["Ärztliche Direktion", "Chefarzt", "Stellv. Chefarzt", "Oberarzt", "Stellv. Oberarzt"];
    const TEAM_RANGFOLGE = ["Facharzt", "Assistenzarzt", "Anwärter"];
    const ALLE_RAENGE = [...LEITUNGS_RANGFOLGE, ...TEAM_RANGFOLGE];
    const STATIONS_SCHLUESSEL = Object.keys(STATIONEN).filter((k) => k !== "direktion");
    if (!STATIONS_SCHLUESSEL.includes(aktiveStationReiter)) aktiveStationReiter = STATIONS_SCHLUESSEL[0];

    function rangIndex(rolle) {
      const i = ALLE_RAENGE.indexOf(rolle);
      return i === -1 ? ALLE_RAENGE.length : i;
    }

    function istLeitungsRang(rolle) {
      return LEITUNGS_RANGFOLGE.includes(rolle);
    }

    function treffferSuche(slot) {
      if (!mitarbeiterSuchbegriff) return true;
      const begriff = mitarbeiterSuchbegriff.toLowerCase();
      return (
        (slot.name && slot.name.toLowerCase().includes(begriff)) ||
        (slot.rolle && slot.rolle.toLowerCase().includes(begriff)) ||
        (slot.abteilung && slot.abteilung.toLowerCase().includes(begriff))
      );
    }

    // Alle Personen aus allen Stationen (inkl. Direktion) einsammeln - jede
    // Person "weiß", aus welchem Station+Slot sie stammt (wichtig fürs
    // Bearbeiten).
    function alleEintraege() {
      const ergebnis = [];
      ["direktion", ...STATIONS_SCHLUESSEL].forEach((stationKey) => {
        (stationenDaten[stationKey] || []).forEach((slot, index) => {
          ergebnis.push({ stationKey, index, slot });
        });
      });
      return ergebnis;
    }

    const eintraege = alleEintraege();
    const istDu = (slot) => aktuellerNutzer && slot.name && slot.name.toLowerCase() === aktuellerNutzer.name.toLowerCase();

    /* ---------------------------------------------------------------------
       Ärztliche Direktion: eigene, herausgehobene Karte ganz oben.
       --------------------------------------------------------------------- */
    const direktionsEintrag = eintraege.find((e) => e.stationKey === "direktion");
    const direktionSlot = direktionsEintrag ? direktionsEintrag.slot : { name: "", rolle: "Ärztliche Direktion" };
    const zeigeDirektion = (direktionSlot.name && treffferSuche(direktionSlot)) || bearbeitenAktiv;

    const direktionHtml = !zeigeDirektion
      ? ""
      : `
        <section class="org-chapter org-chapter--direktion">
          <h2 class="org-chapter__titel">Ärztliche Direktion</h2>
          ${
            bearbeitenAktiv
              ? `
              <div class="direktion-card direktion-card--edit">
                <span class="direktion-card__icon" aria-hidden="true">${ICON_CADUCEUS}</span>
                <input
                  type="text"
                  class="org-row__name-input"
                  placeholder="Name eintragen..."
                  value="${escapeHtml(direktionSlot.name)}"
                  data-role="slot-name"
                  data-station="direktion"
                  data-index="0"
                />
                <span class="direktion-card__rang">Ärztliche Direktion</span>
              </div>
            `
              : `
              <div class="direktion-card">
                <span class="direktion-card__icon" aria-hidden="true">${ICON_CADUCEUS}</span>
                <span class="direktion-card__info">
                  <span class="direktion-card__name">${escapeHtml(direktionSlot.name)}${istDu(direktionSlot) ? '<span class="org-row__du">Du</span>' : ""}</span>
                  <span class="direktion-card__rang">Ärztliche Direktion</span>
                </span>
                <span class="direktion-card__chevron" aria-hidden="true">›</span>
              </div>
            `
          }
        </section>
      `;

    /* ---------------------------------------------------------------------
       Leitung: eine Tabelle über alle Standorte, auf jeder Zeile mit
       Standort beschriftet, Gruppen zusätzlich per Trennlinie abgesetzt.
       --------------------------------------------------------------------- */
    function leitungZeile(e, { ersteInGruppe }) {
      const { stationKey, index, slot } = e;
      // Jede neue Standort-Gruppe bekommt eine dezente Trennlinie/Abstand nach
      // oben, damit z. B. Rhodes-Leitung optisch klar von Blackwater-Leitung
      // abgesetzt ist (die erste Gruppe im Table bekommt per CSS keine
      // zusätzliche Linie, damit es nicht direkt unter dem Tabellenkopf hängt).
      const gruppenStartClass = ersteInGruppe ? " staff-table__row--gruppenstart" : "";

      if (bearbeitenAktiv) {
        // Standort ist im Bearbeiten-Modus ein echtes Auswahlfeld: Beim Wechsel
        // wird die Person in einen freien Platz der Zielstation verschoben.
        const standortSelectHtml = `
          <select class="org-row__rang-select" data-role="slot-standort" data-station="${stationKey}" data-index="${index}">
            ${STATIONS_SCHLUESSEL.map(
              (k) => `<option value="${k}" ${k === stationKey ? "selected" : ""}>${escapeHtml(STATIONEN[k].label)}</option>`
            ).join("")}
          </select>
        `;
        return `
          <div class="staff-table__row staff-table__row--edit staff-table__row--leitung${gruppenStartClass}">
            <span class="staff-table__cell staff-table__cell--standort">${standortSelectHtml}</span>
            <input
              type="text"
              class="org-row__name-input staff-table__cell--name"
              placeholder="Name eintragen..."
              value="${escapeHtml(slot.name)}"
              data-role="slot-name"
              data-station="${stationKey}"
              data-index="${index}"
            />
            <select class="org-row__rang-select staff-table__cell--rang" data-role="slot-rolle" data-station="${stationKey}" data-index="${index}">
              ${STATIONS_RAENGE.map((r) => `<option value="${r}" ${r === slot.rolle ? "selected" : ""}>${r}</option>`).join("")}
            </select>
            <span class="staff-table__cell staff-table__cell--abteilung">Ärztliche Leitung</span>
          </div>
        `;
      }

      // Standort wird bewusst auf JEDER Zeile angezeigt (nicht nur bei der
      // ersten einer Gruppe) - zusammen mit der Trennlinie oben ist so auf
      // einen Blick klar, wer zu welchem Standort gehört.
      const standortHtml = `<span class="staff-table__standort-icon" aria-hidden="true">${ICON_PIN}</span>${escapeHtml(STATIONEN[stationKey].label)}`;

      return `
        <div class="staff-table__row staff-table__row--leitung${gruppenStartClass}">
          <span class="staff-table__cell staff-table__cell--standort">${standortHtml}</span>
          <span class="staff-table__cell staff-table__cell--name">${escapeHtml(slot.name)}${istDu(slot) ? '<span class="org-row__du">Du</span>' : ""}</span>
          <span class="staff-table__cell staff-table__cell--rang">${escapeHtml(slot.rolle)}</span>
          <span class="staff-table__cell staff-table__cell--abteilung">Ärztliche Leitung</span>
          <span class="staff-table__chevron" aria-hidden="true">›</span>
        </div>
      `;
    }

    const leitungZeilenDaten = STATIONS_SCHLUESSEL.flatMap((stationKey) =>
      eintraege
        .filter((e) => e.stationKey === stationKey && e.slot.name && istLeitungsRang(e.slot.rolle) && treffferSuche(e.slot))
        .sort((a, b) => rangIndex(a.slot.rolle) - rangIndex(b.slot.rolle))
        .map((e, i) => ({ e, ersteInGruppe: i === 0 }))
    );

    const leitungHtml = `
      <section class="org-chapter">
        <h2 class="org-chapter__titel">Leitung</h2>
        <div class="staff-table staff-table--leitung">
          <div class="staff-table__head staff-table__row--leitung">
            <span>Standort</span><span>Name</span><span>Position</span><span>Abteilung</span><span></span>
          </div>
          <div class="staff-table__body">
            ${
              leitungZeilenDaten.length
                ? leitungZeilenDaten.map(({ e, ersteInGruppe }) => leitungZeile(e, { ersteInGruppe })).join("")
                : `<p class="empty-state">Keine Treffer.</p>`
            }
          </div>
        </div>
      </section>
    `;

    /* ---------------------------------------------------------------------
       Medizinisches Personal: Tabs pro Standort + Tabelle (Name/Position/
       Abteilung) für den gerade aktiven Standort.
       --------------------------------------------------------------------- */
    function personalZeile(e) {
      const { stationKey, index, slot } = e;
      if (bearbeitenAktiv) {
        return `
          <div class="staff-table__row staff-table__row--edit staff-table__row--personal">
            <input
              type="text"
              class="org-row__name-input staff-table__cell--name"
              placeholder="Name eintragen..."
              value="${escapeHtml(slot.name)}"
              data-role="slot-name"
              data-station="${stationKey}"
              data-index="${index}"
            />
            <select class="org-row__rang-select staff-table__cell--rang" data-role="slot-rolle" data-station="${stationKey}" data-index="${index}">
              ${STATIONS_RAENGE.map((r) => `<option value="${r}" ${r === slot.rolle ? "selected" : ""}>${r}</option>`).join("")}
            </select>
            <input
              type="text"
              class="org-row__name-input staff-table__cell--abteilung"
              placeholder="Abteilung, z. B. Innere Medizin"
              value="${escapeHtml(slot.abteilung || "")}"
              data-role="slot-abteilung"
              data-station="${stationKey}"
              data-index="${index}"
            />
          </div>
        `;
      }
      if (!slot.name) {
        return `<div class="staff-table__row staff-table__row--empty"><span>Unbesetzt</span></div>`;
      }
      return `
        <div class="staff-table__row staff-table__row--personal">
          <span class="staff-table__cell staff-table__cell--name">${escapeHtml(slot.name)}${istDu(slot) ? '<span class="org-row__du">Du</span>' : ""}</span>
          <span class="staff-table__cell staff-table__cell--rang">${escapeHtml(slot.rolle)}</span>
          <span class="staff-table__cell staff-table__cell--abteilung">${slot.abteilung ? escapeHtml(slot.abteilung) : '<span class="staff-table__placeholder">—</span>'}</span>
          <span class="staff-table__chevron" aria-hidden="true">›</span>
        </div>
      `;
    }

    const personalZeilenDaten = eintraege
      .filter((e) => e.stationKey === aktiveStationReiter)
      .filter((e) => (e.slot.name ? !istLeitungsRang(e.slot.rolle) && treffferSuche(e.slot) : !mitarbeiterSuchbegriff))
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
        <div class="staff-table staff-table--personal">
          <div class="staff-table__head staff-table__row--personal">
            <span>Name</span><span>Position</span><span>Abteilung</span><span></span>
          </div>
          <div class="staff-table__body">
            ${
              personalZeilenDaten.length
                ? personalZeilenDaten.map((e) => personalZeile(e)).join("")
                : `<p class="empty-state">Keine Treffer.</p>`
            }
          </div>
        </div>
      </section>
    `;

    el.staffGrid.innerHTML = `
      ${direktionHtml}
      ${leitungHtml}
      ${personalHtml}
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

  // Änderungen an Name-Feldern/Rang-Dropdowns direkt in der Mitarbeiter-Tabelle
  if (document.body) {
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!el.staffGrid || !el.staffGrid.contains(target)) return;
      if (target.dataset.role === "slot-rolle") {
        aktualisiereSlot(target.dataset.station, Number(target.dataset.index), { rolle: target.value });
        return;
      }
      if (target.dataset.role === "slot-standort") {
        verschiebeLeitungMitglied(target.dataset.station, Number(target.dataset.index), target.value);
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

    // Abteilung-Feld (nur Medizinisches Personal, nicht Leitung): ebenfalls
    // erst beim Verlassen des Feldes speichern.
    document.addEventListener(
      "blur",
      (event) => {
        const target = event.target;
        if (!el.staffGrid || !el.staffGrid.contains(target)) return;
        if (target.dataset.role !== "slot-abteilung") return;
        aktualisiereSlot(target.dataset.station, Number(target.dataset.index), { abteilung: target.value.trim() });
      },
      true
    );

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const target = event.target;
      if (!el.staffGrid || !el.staffGrid.contains(target)) return;
      if (target.dataset.role === "slot-name" || target.dataset.role === "slot-abteilung") target.blur();
    });

    // Standort-Tabs beim Medizinischen Personal umschalten
    document.addEventListener("click", (event) => {
      const target = event.target.closest('[data-role="staff-tab"]');
      if (!target || !el.staffGrid || !el.staffGrid.contains(target)) return;
      aktiveStationReiter = target.dataset.station;
      renderMitarbeiterListe();
    });
  }

  // Mitarbeiter-Suche (Leitung + Medizinisches Personal, live beim Tippen)
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

  // Verschiebt ein Leitungsmitglied in einen freien Platz einer anderen
  // Station (Standort-Wechsel über das Dropdown in der Leitungs-Tabelle).
  // Der alte Platz wird dabei geleert, nicht gelöscht - die feste Platzanzahl
  // je Station bleibt unverändert.
  function verschiebeLeitungMitglied(vonStation, vonIndex, nachStation) {
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
      abteilung: person.abteilung || "",
    };
    stationenDaten[vonStation][vonIndex] = { name: "", rolle: "Anwärter", abteilung: "" };

    speichereMitarbeiterliste();
  }

  /* ------------------------------------------------------------------------
     10b. Firestore: Mitarbeiter-/Stationsliste (nur Mitarbeiter-Seite,
          NICHTS mit dem Login zu tun)
     ------------------------------------------------------------------------ */
  function abonniereMitarbeiterliste() {
    if (unsubMitarbeiter) return Promise.resolve(); // bereits abonniert

    return new Promise((resolve) => {
      let ersterDurchlauf = true;

      unsubMitarbeiter = docRef(MITARBEITER_DOC).onSnapshot(
        (doc) => {
          if (doc.exists && doc.data().stationen) {
            stationenDaten = doc.data().stationen;
            normalisiereStationenDaten();
          } else if (doc.exists && Array.isArray(doc.data().liste)) {
            // Migration von der alten, flachen Liste (vor den festen Plätzen)
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

  // Stellt sicher, dass jede Station exakt die richtige Anzahl Plätze hat
  // (falls sich STATIONEN.max mal ändert oder Daten unvollständig sind).
  function normalisiereStationenDaten() {
    Object.keys(STATIONEN).forEach((key) => {
      const max = STATIONEN[key].max;
      if (!Array.isArray(stationenDaten[key])) stationenDaten[key] = [];
      while (stationenDaten[key].length < max) stationenDaten[key].push({ name: "", rolle: "Anwärter" });
      if (stationenDaten[key].length > max) stationenDaten[key] = stationenDaten[key].slice(0, max);
    });
  }

  // Wandelt eine alte, flache Mitarbeiterliste (Version mit "liste: [...]"
  // und einem "station"-Feld pro Person) einmalig in die neuen, festen
  // Plätze um - bestehende Einträge bleiben dabei erhalten.
  function migriereAlteFlacheListe(alteListe) {
    stationenDaten = JSON.parse(JSON.stringify(DEFAULT_STATIONEN));

    const direktionsPerson = alteListe.find((p) => p.station === "direktion");
    if (direktionsPerson) {
      stationenDaten.direktion[0] = { name: direktionsPerson.name, rolle: "Ärztliche Direktion" };
    }

    ["blackwater", "rhodes"].forEach((stationKey) => {
      const mitglieder = alteListe.filter((p) => p.station === stationKey);
      mitglieder.forEach((person, index) => {
        if (index < stationenDaten[stationKey].length) {
          stationenDaten[stationKey][index] = { name: person.name, rolle: person.rolle };
        }
      });
    });

    speichereMitarbeiterliste();
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

  const navNotizenToggle = document.getElementById("nav-notizen-toggle");
  const notizenTabs = document.querySelectorAll(".org-tabs__tab[data-kategorie]");

  notizenTabs.forEach((item) => {
    item.addEventListener("click", () => {
      wechsleZuNotizenAnsicht(item.dataset.kategorie);
    });
  });

  function wechsleZuNotizenAnsicht(kategorie) {
    aktiveNotizKategorie = kategorie;

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
            notizen.push({
              id: doc.id,
              text: d.text,
              autor: d.autor,
              rolle: d.rolle || "",
              kategorie: kategorie,
              millis: d.zeitpunkt && d.zeitpunkt.toMillis ? d.zeitpunkt.toMillis() : Date.now(),
            });
          });
          letzteNotizen = notizen;
          renderNotizen();
        },
        (fehler) => console.error("Fehler beim Laden der Notizen:", fehler)
      );
  }

  /* ------------------------------------------------------------------------
     10a2. Kontakte: Telegramm-Verzeichnis (BW-Nummer + Name + Notiz)
     ------------------------------------------------------------------------ */
  let letzteKontakte = [];
  let kontakteSuchbegriff = "";

  function abonniereKontakte() {
    db.collection(KONTAKTE_COLLECTION).onSnapshot(
      (snapshot) => {
        const kontakte = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          kontakte.push({
            id: doc.id,
            nummer: d.nummer || "",
            name: d.name || "",
            notiz: d.notiz || "",
            autor: d.autor || "",
            millis: d.zeitpunkt && d.zeitpunkt.toMillis ? d.zeitpunkt.toMillis() : Date.now(),
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

  function renderKontakte() {
    if (!el.kontaktList) return;

    const aktivesElement = document.activeElement;
    if (el.kontaktList.contains(aktivesElement) && (aktivesElement.tagName === "INPUT" || aktivesElement.tagName === "SELECT")) {
      return; // Nicht mitten im Tippen/Bearbeiten neu aufbauen
    }

    const begriff = kontakteSuchbegriff.trim().toLowerCase();
    const gefiltert = letzteKontakte.filter((k) => {
      if (!begriff) return true;
      return (
        k.nummer.toLowerCase().includes(begriff) ||
        k.name.toLowerCase().includes(begriff) ||
        k.notiz.toLowerCase().includes(begriff)
      );
    });

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
        <span class="kontakt-row__notiz">${k.notiz ? escapeHtml(k.notiz) : "—"}</span>
        ${
          darfBearbeiten
            ? `
              <button type="button" class="icon-btn icon-btn--edit" data-role="toggle-edit-kontakt" data-id="${k.id}" title="Kontakt bearbeiten">${ICON_EDIT}</button>
              <button type="button" class="icon-btn icon-btn--delete" data-role="delete-kontakt" data-id="${k.id}" title="Kontakt löschen">${ICON_TRASH}</button>
            `
            : ""
        }
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
          <input type="text" class="field-input" value="${escapeHtml(k.notiz)}" placeholder="Notiz" data-role="edit-kontakt-notiz" style="flex: 1 1 200px;" />
          <button type="button" class="btn btn--primary" data-role="confirm-edit-kontakt" data-id="${k.id}">Speichern</button>
        `;
        el.kontaktList.appendChild(bearbeitenZeile);
      }
    });
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
          notiz,
          autor: aktuellerNutzer.name,
          zeitpunkt: firebase.firestore.FieldValue.serverTimestamp(),
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
      renderKontakte();
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
        const notiz = form.querySelector('[data-role="edit-kontakt-notiz"]').value.trim();

        if (!ziffern) return zeigeToast("Bitte eine gültige Nummer eingeben.");
        if (!name) return zeigeToast("Bitte einen Namen eingeben.");

        const neueNummer = `BW-${ziffern}`;
        if (letzteKontakte.some((k) => k.id !== confirmBtn.dataset.id && k.nummer === neueNummer)) {
          return zeigeToast(`„${neueNummer}“ ist bereits vergeben.`);
        }

        db.collection(KONTAKTE_COLLECTION)
          .doc(confirmBtn.dataset.id)
          .update({ nummer: neueNummer, name, notiz })
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

  function renderNotizen() {
    let notizen = letzteNotizen.filter((n) => n.kategorie === aktiveNotizKategorie);

    const begriff = notizenSuche.trim().toLowerCase();
    if (begriff) {
      notizen = notizen.filter(
        (n) => n.text.toLowerCase().includes(begriff) || n.autor.toLowerCase().includes(begriff)
      );
    }

    el.notesList.innerHTML = "";
    el.notesEmpty.hidden = notizen.length !== 0;
    if (el.notesEmpty && notizen.length === 0) {
      if (begriff) {
        el.notesEmpty.textContent = "Keine Notizen gefunden, die zu deiner Suche passen.";
      } else {
        const kategorieInfo = NOTIZ_KATEGORIEN[aktiveNotizKategorie];
        el.notesEmpty.textContent = `Noch keine „${kategorieInfo.label}"-Notizen vorhanden.`;
      }
    }

    notizen.forEach((notiz) => {
      const darfLoeschen = istAdmin() || (aktuellerNutzer && aktuellerNutzer.name === notiz.autor);
      const loeschButton = darfLoeschen
        ? `<button type="button" class="icon-btn icon-btn--delete note-item__delete" data-role="delete-notiz" data-id="${notiz.id}" title="Notiz löschen">${ICON_TRASH}</button>`
        : "";
      const rolleText = notiz.rolle ? ` (${escapeHtml(notiz.rolle)})` : "";

      const eintrag = document.createElement("div");
      eintrag.className = `note-item note-item--${notiz.kategorie}`;
      eintrag.innerHTML = `
        <div class="note-item__body">
          <div class="note-item__text">${verarbeiteRichInhalt(notiz.text)}</div>
          <div class="note-item__meta">— ${escapeHtml(notiz.autor)}${rolleText} · ${formatiereZeitstempel(notiz.millis)} Uhr</div>
        </div>
        ${loeschButton}
      `;
      el.notesList.appendChild(eintrag);
    });
  }

  el.formNote.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = el.noteInput.innerHTML.trim();
    const nurText = el.noteInput.textContent.trim();
    if (!nurText || !aktuellerNutzer) return;

    db.collection(NOTIZEN_COLLECTION)
      .add({
        text: sanitisiereRichText(text),
        autor: aktuellerNutzer.name,
        rolle: aktuellerNutzer.rolle,
        kategorie: aktiveNotizKategorie,
        zeitpunkt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        el.noteInput.innerHTML = "";
      })
      .catch((fehler) => {
        console.error("Notiz konnte nicht gespeichert werden:", fehler);
        zeigeToast("Notiz konnte nicht gespeichert werden.");
      });
  });

  el.notesList.addEventListener("click", (event) => {
    const btn = event.target.closest('[data-role="delete-notiz"]');
    if (!btn) return;

    oeffneBestaetigungsModal(
      "Notiz löschen",
      "Möchtest du diese Notiz wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.",
      () => {
        db.collection(NOTIZEN_COLLECTION).doc(btn.dataset.id).delete().catch(() => {
          zeigeToast("Notiz konnte nicht gelöscht werden.");
        });
      }
    );
  });

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
  function abonniereInfos() {
    unsubInfos = docRef(INFOS_DOC).onSnapshot(
      (doc) => {
        if (doc.exists && Array.isArray(doc.data().liste)) {
          infosListe = doc.data().liste;
        } else {
          infosListe = DEFAULT_INFOS.map((i) => ({ ...i }));
          speichereInfos();
        }
        renderInfos();
      },
      (fehler) => console.error("Fehler beim Laden der Infos:", fehler)
    );
  }

  // Einfache, wiederverwendbare Symbol-Sets (rein SVG, eine Akzentfarbe) -
  // rein visuelle Kategorisierungshilfe, keine willkürliche Deko.
  const WIKI_ICONS = {
    spritze: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="9" width="10" height="6" rx="1"/><line x1="16" y1="12" x2="21" y2="12"/><line x1="6" y1="9" x2="3" y2="6"/><line x1="8" y1="9" x2="8" y2="6.5"/><line x1="10" y1="9" x2="10" y2="6.5"/><line x1="4" y1="18" x2="8" y2="14"/></svg>`,
    verband: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/></svg>`,
    flasche: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h4v3.5l2 2.5v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-2.5z"/><line x1="10" y1="3" x2="14" y2="3"/><line x1="8" y1="13" x2="16" y2="13"/></svg>`,
    kapsel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="6" rx="3"/><line x1="12" y1="9" x2="12" y2="15"/></svg>`,
    generisch: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="4" width="10" height="4" rx="1"/><path d="M8 8h8v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/></svg>`,
  };

  function symbolFuerInfo(titel) {
    const t = (titel || "").toLowerCase();
    if (t.includes("spritze") || t.includes("injekt")) return WIKI_ICONS.spritze;
    if (t.includes("salbe") || t.includes("verband") || t.includes("bandage") || t.includes("schiene")) return WIKI_ICONS.verband;
    if (t.includes("gift") || t.includes("trank") || t.includes("saft") || t.includes("cola") || t.includes("tee")) return WIKI_ICONS.flasche;
    if (t.includes("tablette") || t.includes("kapsel") || t.includes("pille") || t.includes("vitamin")) return WIKI_ICONS.kapsel;
    return WIKI_ICONS.generisch;
  }

  let infosSuchbegriff = "";
  let aktiveInfoKategorie = "__alle__";
  let infoSortierung = "az";

  function speichereInfos() {
    docRef(INFOS_DOC)
      .set({ liste: infosListe, aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp() })
      .catch((fehler) => {
        console.error("Infos konnten nicht gespeichert werden:", fehler);
        zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
      });
  }

  function renderInfos() {
    if (!el.infosGrid) return;
    el.infosAdminForm.hidden = !istAdmin();

    // Kategorien rein dynamisch aus den vorhandenen Einträgen ableiten -
    // keine feste Liste im Code. Einträge ohne eigene Kategorie zählen zu
    // "Sonstiges", damit nichts unsichtbar wird.
    const kategorieZaehlung = {};
    infosListe.forEach((info) => {
      const k = (info.kategorie || "").trim() || "Sonstiges";
      kategorieZaehlung[k] = (kategorieZaehlung[k] || 0) + 1;
    });
    const kategorien = Object.keys(kategorieZaehlung).sort((a, b) => a.localeCompare(b, "de"));

    const kategorienListeEl = document.getElementById("wiki-kategorien-liste");
    if (kategorienListeEl) {
      const alleAktiv = aktiveInfoKategorie === "__alle__";
      kategorienListeEl.innerHTML = `
        <button type="button" class="wiki-kategorie ${alleAktiv ? "wiki-kategorie--active" : ""}" data-kategorie="__alle__">
          <span>Alle Medikamente</span><span class="wiki-kategorie__count">${infosListe.length}</span>
        </button>
        ${kategorien
          .map(
            (k) => `
              <button type="button" class="wiki-kategorie ${k === aktiveInfoKategorie ? "wiki-kategorie--active" : ""}" data-kategorie="${escapeHtml(k)}">
                <span>${escapeHtml(k)}</span><span class="wiki-kategorie__count">${kategorieZaehlung[k]}</span>
              </button>
            `
          )
          .join("")}
      `;
      kategorienListeEl.querySelectorAll(".wiki-kategorie").forEach((btn) => {
        btn.addEventListener("click", () => {
          aktiveInfoKategorie = btn.dataset.kategorie;
          renderInfos();
        });
      });
    }

    // Datalist fürs Kategorie-Eingabefeld im Admin-Formular aktuell halten
    const datalist = document.getElementById("info-kategorien-liste");
    if (datalist) datalist.innerHTML = kategorien.map((k) => `<option value="${escapeHtml(k)}"></option>`).join("");

    // Filtern: Kategorie + Suche
    const begriff = infosSuchbegriff.trim().toLowerCase();
    let gefiltert = infosListe.filter((info) => {
      const k = (info.kategorie || "").trim() || "Sonstiges";
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

    el.infosGrid.innerHTML = "";
    document.getElementById("infos-empty").hidden = gefiltert.length !== 0;

    gefiltert.forEach((info) => {
      const card = document.createElement("div");
      card.className = "info-card";
      const kategorieLabel = (info.kategorie || "").trim() || "Sonstiges";
      const aktionsButtons = istAdmin()
        ? `
          <button type="button" class="icon-btn icon-btn--edit info-card__edit" data-role="edit-info" data-id="${info.id}" title="Eintrag bearbeiten">${ICON_EDIT}</button>
          <button type="button" class="icon-btn icon-btn--delete info-card__delete" data-role="delete-info" data-id="${info.id}" title="Eintrag löschen">${ICON_TRASH}</button>
        `
        : "";
      card.innerHTML = `
        <span class="info-card__icon">${symbolFuerInfo(info.titel)}</span>
        ${aktionsButtons}
        <span class="info-card__name">${escapeHtml(info.titel)}</span>
        <span class="info-card__kategorie">${escapeHtml(kategorieLabel)}</span>
        <span class="info-card__text">${verarbeiteRichInhalt(info.text)}</span>
        ${info.hinweis ? `<span class="info-card__hint">${formatiereNotizText(info.hinweis)}</span>` : ""}
      `;
      el.infosGrid.appendChild(card);
    });
  }

  const infosSearchInput = document.getElementById("infos-search");
  if (infosSearchInput) {
    infosSearchInput.addEventListener("input", (event) => {
      infosSuchbegriff = event.target.value;
      renderInfos();
    });
  }

  const wikiSortSelect = document.getElementById("wiki-sortierung");
  if (wikiSortSelect) {
    wikiSortSelect.addEventListener("change", () => {
      infoSortierung = wikiSortSelect.value;
      renderInfos();
    });
  }

  function setzeInfoFormularZurueck() {
    el.infoEditingId.value = "";
    el.infoTitelInput.value = "";
    el.infoTextInput.innerHTML = "";
    el.infoHinweisInput.value = "";
    if (el.infoKategorieInput) el.infoKategorieInput.value = "";
    el.infoFormTitle.textContent = "Neuen Info-Eintrag hinzufügen";
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
      const kategorie = el.infoKategorieInput ? el.infoKategorieInput.value.trim() : "";
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
          // Da hinweis/kategorie optional sind, muss ein leeres Feld als
          // null gespeichert werden, nicht als undefined.
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

  if (el.infosGrid) {
    el.infosGrid.addEventListener("click", (event) => {
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
        if (el.infoKategorieInput) el.infoKategorieInput.value = info.kategorie || "";
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
      const pageHeader = document.getElementById("page-header");
      if (pageHeader) pageHeader.hidden = zielView === "start";

      const meta = VIEW_META[zielView];
      if (meta) {
        el.viewTitle.textContent = meta.title;
        el.viewSubtitle.textContent = meta.subtitle;
      }

      if (zielView === "mitarbeiter") {
        mitarbeiterBearbeitenModus = false; // Sicherheitshalber immer mit Lese-Ansicht starten
        renderMitarbeiterListe();
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
  const APP_VERSION = 86;
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

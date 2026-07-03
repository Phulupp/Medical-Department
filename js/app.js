/* ==========================================================================
   Ärztekammer – App-Logik
   Zugang: gemeinsames Website-Passwort + Namensauswahl (kein klassischer
   Account-Login). Im Hintergrund läuft trotzdem ein anonymer Firebase-Login,
   damit die Firestore-Datenbank geschützt bleibt und alle Mitarbeiter
   dieselben Daten in Echtzeit sehen (Medikamente + "wer ist online").
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     0. Design (Hell/Dunkel) - wird sofort angewendet, noch bevor der Rest
        der App lädt, damit das Design nicht kurz falsch aufblitzt.
     ------------------------------------------------------------------------ */
  const THEME_STORAGE_KEY = "aerztekammer.theme";

  function wendeGespeichertesThemaAn() {
    const gespeichert = localStorage.getItem(THEME_STORAGE_KEY);
    if (gespeichert === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }
  wendeGespeichertesThemaAn();

  /* ------------------------------------------------------------------------
     1. Konstanten
     ------------------------------------------------------------------------ */
  // Gemeinsames Zugangspasswort für die Website. Zum Ändern: Wert hier
  // ersetzen und die Datei neu hochladen.
  const SITE_PASSWORD = "Otter";

  // PIN, der zusätzlich nötig ist, um sich als geschützter Mitarbeiter
  // (z. B. Heinrich oder Grete) anzumelden - verhindert, dass sich andere
  // Personen fälschlicherweise als diese Namen ausgeben.
  const ADMIN_PIN = "1311";

  // Rollen, die Medikamente löschen UND beide Mitarbeiter-Listen verwalten dürfen
  const ADMIN_ROLLEN = ["Ärztliche Direktion", "Chefarzt", "Stellv. Chefarzt"];

  // Ränge (gemeinsam genutzt für Login-Verwaltung UND Stations-Verwaltung)
  const STATIONS_RAENGE = ["Anwärter", "Assistenzarzt", "Facharzt", "Stellv. Chefarzt", "Chefarzt"];

  // Die beiden Stationierungen (RDR2-Roleplay: Rhodes & Blackwater) inkl.
  // Farbcode - passend zur farblichen Kennzeichnung im Spiel selbst.
  const STATIONEN = {
    direktion: { label: "Ärztliche Direktion", max: 1, farbe: null },
    rhodes: { label: "Rhodes", max: 6, farbe: "green" },
    blackwater: { label: "Blackwater", max: 6, farbe: "red" },
  };

  // Standard-LOGIN-Liste (komplett unabhängig von der Mitarbeiter-/Stations-
  // Liste unten!). Bestimmt einzig und allein, wer sich beim Betreten der
  // Seite anmelden kann. "geschuetzt: true" bedeutet: Für die Anmeldung mit
  // diesem Namen ist der ADMIN_PIN nötig.
  const DEFAULT_LOGIN_MITARBEITER = [
    { id: "heinrich", name: "Heinrich Hornhausen", rolle: "Chefarzt", geschuetzt: true, avatar: "🫏" },
    { id: "grete", name: "Grete Hornhausen", rolle: "Stellv. Chefarzt", geschuetzt: true, avatar: "🦦" },
  ];

  // Standard-Mitarbeiter-/Stationsliste: FESTE Anzahl Plätze je Station
  // (reines Organisations-Tool für die Mitarbeiter-Seite - hat NICHTS mit
  // dem Login zu tun). Leere Plätze haben name: "".
  function erzeugeLeereStation(anzahl) {
    const plaetze = [];
    for (let i = 0; i < anzahl; i++) plaetze.push({ name: "", rolle: "Anwärter" });
    return plaetze;
  }

  const DEFAULT_STATIONEN = {
    direktion: [{ name: "Chris Moon", rolle: "Ärztliche Direktion" }],
    blackwater: erzeugeLeereStation(6),
    rhodes: erzeugeLeereStation(6),
  };

  const STORAGE_KEY_LEGACY = "medicalDepartment.medikamente.v1";
  const STORAGE_KEY_V2 = "medicalDepartment.medikamente.v2";
  const GATE_PASSWORD_OK = "medicalDepartment.gate.passwordOk";
  const GATE_NAME = "medicalDepartment.gate.name";
  const GATE_ROLLE = "medicalDepartment.gate.rolle";

  const MEDIKAMENTE_DOC = "department/medikamente";
  const MITARBEITER_DOC = "department/mitarbeiter";
  const LOGIN_MITARBEITER_DOC = "department/loginMitarbeiter";
  const INFOS_DOC = "department/infos";
  const PRESENCE_COLLECTION = "presence";
  const NOTIZEN_COLLECTION = "notizen";
  const VERKAUFSLOG_COLLECTION = "verkaufslog";
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
  let aktivesMedikamentId = null;
  let aktuellerNutzer = null;       // { name, rolle }
  let unsubMedikamente = null;
  let unsubPresence = null;
  let unsubNotizen = null;
  let unsubVerkaufslog = null;
  let unsubMitarbeiter = null;
  let unsubLoginMitarbeiter = null;
  let unsubInfos = null;
  let unsubAnkuendigungen = null;
  let stationenDaten = { direktion: [], blackwater: [], rhodes: [] }; // Feste Plätze je Station
  let loginMitarbeiterListe = [];  // Eigene, unabhängige Liste NUR fürs Login-Dropdown
  let infosListe = [];             // Dynamische Infos-Seite
  let gewaehltesMitarbeiterGeschuetzt = false;
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

    formGatePassword: document.getElementById("form-gate-password"),
    gatePasswordInput: document.getElementById("gate-password"),
    gatePasswordError: document.getElementById("gate-password-error"),

    formGateName: document.getElementById("form-gate-name"),
    gateNameSelect: document.getElementById("gate-name-select"),
    gateNameCustomWrapper: document.getElementById("gate-name-custom-wrapper"),
    gateNameCustom: document.getElementById("gate-name-custom"),
    gatePinWrapper: document.getElementById("gate-pin-wrapper"),
    gatePinInput: document.getElementById("gate-pin"),
    gateNameError: document.getElementById("gate-name-error"),

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

    boardAdminForm: document.getElementById("board-admin-form"),
    formAnkuendigung: document.getElementById("form-ankuendigung"),
    ankuendigungInput: document.getElementById("ankuendigung-input"),
    boardList: document.getElementById("board-list"),
    boardEmpty: document.getElementById("board-empty"),

    formNote: document.getElementById("form-note"),
    noteInput: document.getElementById("note-input"),
    notesList: document.getElementById("notes-list"),
    notesEmpty: document.getElementById("notes-empty"),

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
    infosGrid: document.getElementById("infos-grid"),

    einstellungenAdmin: document.getElementById("einstellungen-admin"),
    einstellungenLocked: document.getElementById("einstellungen-locked"),

    formAddLogin: document.getElementById("form-add-login"),
    loginNameInput: document.getElementById("login-name-input"),
    loginRolleInput: document.getElementById("login-rolle-input"),
    loginGeschuetztInput: document.getElementById("login-geschuetzt-input"),
    loginVerwaltungListe: document.getElementById("login-verwaltung-liste"),

    tableBody: document.getElementById("med-table-body"),
    emptyState: document.getElementById("empty-state"),
    searchInput: document.getElementById("search-input"),

    statCount: document.getElementById("stat-count"),
    statQuantity: document.getElementById("stat-quantity"),
    statTotal: document.getElementById("stat-total"),
    tableTotal: document.getElementById("table-total"),

    btnAddMedikament: document.getElementById("btn-add-medikament"),
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
    mitarbeiter: { title: "Mitarbeiter", subtitle: "Verwaltung des medizinischen Personals" },
    verkaufslog: { title: "Verkaufslog", subtitle: "Verkäufe eintragen & Historie einsehen" },
    notizen: { title: "Notizen", subtitle: "Gemeinsame Notizen des Teams" },
    infos: { title: "Infos", subtitle: "Wirkung & Einsatzgebiet der Medikamente" },
    einstellungen: { title: "Einstellungen", subtitle: "Konfiguration des Ärztekammer-Systems" },
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
    [el.formGatePassword, el.formGateName].forEach((form) => {
      form.querySelectorAll("input, select, button").forEach((feld) => (feld.disabled = true));
    });
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

  // Wandelt **fett** und __unterstrichen__ sicher in <strong>/<u> um.
  // WICHTIG: escaped zuerst den kompletten Text (verhindert HTML-Injection),
  // wendet die Formatierung erst danach auf den bereits sicheren Text an.
  function formatiereNotizText(text) {
    let sicher = escapeHtml(text);
    sicher = sicher.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    sicher = sicher.replace(/__(.+?)__/g, "<u>$1</u>");
    return sicher;
  }

  // Formatierungsleisten (Fett/Unterstrichen) mit den Textfeldern verbinden.
  // Fügt bei markiertem Text **../__.. um die Auswahl herum ein, sonst an
  // der Cursor-Position mit dem Cursor mittig zwischen den Markern.
  document.querySelectorAll(".format-toolbar").forEach((toolbar) => {
    const textarea = document.getElementById(toolbar.dataset.target);
    if (!textarea) return;

    toolbar.querySelectorAll(".format-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const marker = btn.dataset.format === "bold" ? "**" : "__";
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const ausgewaehlt = textarea.value.slice(start, end);

        const neuerText =
          textarea.value.slice(0, start) + marker + ausgewaehlt + marker + textarea.value.slice(end);
        textarea.value = neuerText;
        textarea.focus();

        if (ausgewaehlt) {
          textarea.setSelectionRange(start + marker.length, end + marker.length);
        } else {
          textarea.setSelectionRange(start + marker.length, start + marker.length);
        }
      });
    });
  });

  function initialenVon(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
  }

  // Gibt das lustige Emoji-Avatar zurück, falls in der Login-Liste eines
  // hinterlegt ist (Inside-Joke), sonst den Anfangsbuchstaben.
  function avatarVon(name) {
    const eintrag = loginMitarbeiterListe.find((m) => m.name.toLowerCase() === (name || "").toLowerCase());
    return eintrag && eintrag.avatar ? eintrag.avatar : initialenVon(name);
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
     6. Zugangssperre: Passwort-Schritt + dynamische Namensauswahl
     ------------------------------------------------------------------------ */
  if (istFirebaseKonfiguriert()) {
    el.formGatePassword.addEventListener("submit", (event) => {
      event.preventDefault();
      el.gatePasswordError.hidden = true;

      if (el.gatePasswordInput.value !== SITE_PASSWORD) {
        zeigeFeldFehler(el.gatePasswordError, "Falsches Passwort. Bitte versuch es erneut.");
        return;
      }

      localStorage.setItem(GATE_PASSWORD_OK, "true");
      vorbereitenNameSchritt();
    });

    el.gateNameSelect.addEventListener("change", () => {
      const istAndere = el.gateNameSelect.value === "__andere__";
      el.gateNameCustomWrapper.hidden = !istAndere;
      if (istAndere) el.gateNameCustom.focus();

      const eintrag = loginMitarbeiterListe.find((m) => m.name === el.gateNameSelect.value);
      gewaehltesMitarbeiterGeschuetzt = !!(eintrag && eintrag.geschuetzt);
      el.gatePinWrapper.hidden = !gewaehltesMitarbeiterGeschuetzt;
      if (gewaehltesMitarbeiterGeschuetzt) el.gatePinInput.focus();
    });

    el.formGateName.addEventListener("submit", (event) => {
      event.preventDefault();
      el.gateNameError.hidden = true;

      let name = el.gateNameSelect.value;
      let rolle;

      if (!name) {
        zeigeFeldFehler(el.gateNameError, "Bitte wähle aus, wer du bist.");
        return;
      }

      if (name === "__andere__") {
        name = el.gateNameCustom.value.trim();
        if (!name) {
          zeigeFeldFehler(el.gateNameError, "Bitte gib deinen Namen ein.");
          return;
        }
        rolle = "Mitarbeiter";
      } else {
        const eintrag = loginMitarbeiterListe.find((m) => m.name === name);
        rolle = eintrag ? eintrag.rolle : "Mitarbeiter";

        if (eintrag && eintrag.geschuetzt) {
          if (el.gatePinInput.value !== ADMIN_PIN) {
            zeigeFeldFehler(el.gateNameError, "Falscher PIN für diesen Namen.");
            return;
          }
        }
      }

      localStorage.setItem(GATE_NAME, name);
      localStorage.setItem(GATE_ROLLE, rolle);

      aktuellerNutzer = { name, rolle };
      anmeldenUndStarten();
    });
  }

  function zeigeGateSchritt(schritt) {
    el.formGatePassword.classList.toggle("auth-form--active", schritt === "password");
    el.formGateName.classList.toggle("auth-form--active", schritt === "name");
  }

  // Meldet sich (falls nötig) anonym bei Firebase an, lädt die Login-Liste
  // und zeigt danach erst den Namens-Schritt an. Der anonyme Login muss hier
  // schon passieren, weil wir Firestore lesen müssen, um die Namensauswahl
  // zu befüllen.
  function vorbereitenNameSchritt() {
    const weiter = () => {
      abonniereLoginMitarbeiterliste();
      zeigeGateSchritt("name");
    };

    if (auth.currentUser) {
      weiter();
      return;
    }

    auth
      .signInAnonymously()
      .then(weiter)
      .catch((fehler) => {
        console.error("Anonymer Login fehlgeschlagen:", fehler);
        zeigeFeldFehler(el.gatePasswordError, "Verbindung fehlgeschlagen. Bitte Internetverbindung prüfen.");
      });
  }

  function populiereNamensDropdown() {
    // Alle dynamisch eingefügten Optionen entfernen (behält nur den
    // Platzhalter an erster und "Andere Person..." an letzter Stelle)
    while (el.gateNameSelect.options.length > 2) {
      el.gateNameSelect.remove(1);
    }

    loginMitarbeiterListe.forEach((person) => {
      const option = document.createElement("option");
      option.value = person.name;
      option.textContent = `${person.name} (${person.rolle})${person.geschuetzt ? " 🔒" : ""}`;
      el.gateNameSelect.insertBefore(option, el.gateNameSelect.lastElementChild);
    });
  }

  // Beim Laden prüfen, ob Passwort & Name schon in diesem Browser hinterlegt
  // sind -> dann direkt durchstarten, ohne erneut zu fragen.
  function pruefeGespeichertenZugang() {
    const passwortOk = localStorage.getItem(GATE_PASSWORD_OK) === "true";
    const gespeicherterName = localStorage.getItem(GATE_NAME);
    const gespeicherteRolle = localStorage.getItem(GATE_ROLLE);

    if (passwortOk && gespeicherterName) {
      aktuellerNutzer = { name: gespeicherterName, rolle: gespeicherteRolle || "Mitarbeiter" };
      anmeldenUndStarten();
    } else if (passwortOk) {
      vorbereitenNameSchritt();
    } else {
      zeigeGateSchritt("password");
    }
  }

  /* ------------------------------------------------------------------------
     7. Anonymer Firebase-Login im Hintergrund
     ------------------------------------------------------------------------ */
  function anmeldenUndStarten() {
    if (!istFirebaseKonfiguriert()) return;

    if (auth.currentUser) {
      appStarten();
      return;
    }

    auth
      .signInAnonymously()
      .then(() => appStarten())
      .catch((fehler) => {
        console.error("Anonymer Login fehlgeschlagen:", fehler);
        zeigeFeldFehler(el.gateNameError, "Verbindung fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.");
      });
  }

  function appStarten() {
    el.authScreen.hidden = true;
    el.appRoot.hidden = false;

    renderBenutzerBadge();
    renderMitarbeiterListe();
    initialisiereVerkaufsformular();

    sessionId = sessionStorage.getItem("medicalDepartment.sessionId") || erzeugeSessionId();
    sessionStorage.setItem("medicalDepartment.sessionId", sessionId);

    abonniereMedikamente();
    starteHeartbeat();
    abonnierePresence();
    abonniereNotizen();
    abonniereVerkaufslog();
    abonniereMitarbeiterliste();
    abonniereLoginMitarbeiterliste();
    abonniereInfos();
    abonniereAnkuendigungen();

    window.addEventListener("beforeunload", entferneEigenePresence);
  }

  function initialisiereVerkaufsformular() {
    if (!el.saleFormVerkaeufer) return;
    el.saleFormVerkaeufer.textContent = aktuellerNutzer ? `${aktuellerNutzer.name} (${aktuellerNutzer.rolle})` : "—";

    const heute = new Date();
    const iso = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, "0")}-${String(heute.getDate()).padStart(2, "0")}`;
    el.saleDatum.value = iso;
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
    if (!el.userMenu.contains(event.target) && event.target !== el.userBadgeBtn) {
      el.userMenu.classList.remove("user-menu--visible");
    }
    if (!el.onlinePanel.contains(event.target) && event.target !== el.onlineWidgetBtn) {
      el.onlinePanel.classList.remove("online-panel--visible");
    }
  });

  el.btnLogout.addEventListener("click", () => {
    entferneEigenePresence();
    localStorage.removeItem(GATE_NAME);
    localStorage.removeItem(GATE_ROLLE);
    // Passwort bleibt bewusst gespeichert, damit man nicht bei jedem
    // Nutzerwechsel erneut das Website-Passwort eintippen muss.
    window.location.reload();
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
        aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp(),
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
          const zeitpunkt = daten.aktualisiertAm && daten.aktualisiertAm.toMillis ? daten.aktualisiertAm.toMillis() : 0;
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
  function renderMitarbeiterListe() {
    if (!el.staffGrid) return;
    renderBenutzerBadge(); // Badge-Avatar aktualisieren, sobald die Liste geladen ist

    const admin = istAdmin();

    // Eine einzelne Zeile: bei Admins direkt editierbar (Name-Feld + Rang-
    // Dropdown), bei allen anderen nur lesbar.
    function slotZeile(stationKey, index, slot) {
      const istDirektion = stationKey === "direktion";
      const istDu = aktuellerNutzer && slot.name && slot.name.toLowerCase() === aktuellerNutzer.name.toLowerCase();
      const duBadge = istDu ? '<span class="staff-card__badge" style="position:static;margin-left:8px;">Du</span>' : "";

      if (!admin) {
        // Reine Lese-Ansicht
        if (!slot.name) return `<div class="station-slot station-slot--frei">— Platz frei —</div>`;
        return `
          <div class="station-slot">
            <span class="station-slot__name">${escapeHtml(slot.name)}${duBadge}</span>
            <span class="station-slot__meta">
              <span class="station-slot__rolle">${escapeHtml(slot.rolle)}</span>
            </span>
          </div>
        `;
      }

      // Editierbare Admin-Ansicht
      const rolleFeld = istDirektion
        ? `<span class="station-slot__rolle">Ärztliche Direktion</span>`
        : `<select class="field-input station-slot__rolle-select" data-role="slot-rolle" data-station="${stationKey}" data-index="${index}">
            ${STATIONS_RAENGE.map((r) => `<option value="${r}" ${r === slot.rolle ? "selected" : ""}>${r}</option>`).join("")}
          </select>`;

      return `
        <div class="station-slot station-slot--edit">
          <input
            type="text"
            class="field-input station-slot__name-input"
            placeholder="Name eintragen..."
            value="${escapeHtml(slot.name)}"
            data-role="slot-name"
            data-station="${stationKey}"
            data-index="${index}"
          />
          ${rolleFeld}
        </div>
      `;
    }

    function stationsBlock(stationKey) {
      const info = STATIONEN[stationKey];
      const plaetze = stationenDaten[stationKey] || [];
      const zeilen = plaetze.map((slot, index) => slotZeile(stationKey, index, slot)).join("");
      return `
        <div class="station-card station-card--${info.farbe}">
          <h3 class="station-card__title">${stationKey === "rhodes" ? "🟢" : "🔴"} ${escapeHtml(info.label)}</h3>
          <div class="station-card__slots">${zeilen}</div>
        </div>
      `;
    }

    const direktionSlot = (stationenDaten.direktion && stationenDaten.direktion[0]) || { name: "", rolle: "Ärztliche Direktion" };

    el.staffGrid.innerHTML = `
      <div class="direction-card">${slotZeile("direktion", 0, direktionSlot)}</div>
      <div class="stations-row">
        ${stationsBlock("blackwater")}
        ${stationsBlock("rhodes")}
      </div>
    `;
  }

  // Änderungen an Name-Feldern/Rang-Dropdowns direkt in der Mitarbeiter-Tabelle
  if (document.body) {
    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!el.staffGrid || !el.staffGrid.contains(target)) return;
      if (target.dataset.role !== "slot-rolle") return;
      aktualisiereSlot(target.dataset.station, Number(target.dataset.index), { rolle: target.value });
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
      if (!el.staffGrid || !el.staffGrid.contains(target)) return;
      if (target.dataset.role === "slot-name") target.blur();
    });
  }

  function aktualisiereSlot(station, index, aenderung) {
    if (!istAdmin()) {
      zeigeToast("Nur Chefarzt, Stellv. Chefarzt & Ärztliche Direktion dürfen die Mitarbeiter-Liste bearbeiten.");
      renderMitarbeiterListe(); // Eingabe zurücksetzen
      return;
    }
    if (!stationenDaten[station] || !stationenDaten[station][index]) return;

    Object.assign(stationenDaten[station][index], aenderung);
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
     10c. Firestore: LOGIN-Liste (unabhängig von der Mitarbeiter-Seite,
          bestimmt einzig, wer sich anmelden kann)
     ------------------------------------------------------------------------ */
  // Verhindert eine komplette Aussperrung, OHNE eine fremde Person (wie
  // "Chris Moon") ins Login einzuschleusen. Stattdessen: einen bereits
  // versehentlich hinzugefügten Notfall-Eintrag entfernen und Heinrich/Grete
  // (die Hauptnutzer der Seite) automatisch auf Admin-Rang anheben, falls
  // gerade niemand Admin-Rechte hat.
  function sichereMindestensEinenAdminZu() {
    let geaendert = false;

    // Alten, versehentlich eingeschleusten Chris-Moon-Notfall-Login entfernen
    const vorherAnzahl = loginMitarbeiterListe.length;
    loginMitarbeiterListe = loginMitarbeiterListe.filter((m) => m.id !== "chris-moon-notfall-admin");
    if (loginMitarbeiterListe.length !== vorherAnzahl) geaendert = true;

    const hatAdmin = loginMitarbeiterListe.some((m) => ADMIN_ROLLEN.includes(m.rolle));
    if (!hatAdmin) {
      const heinrich = loginMitarbeiterListe.find((m) => m.id === "heinrich");
      const grete = loginMitarbeiterListe.find((m) => m.id === "grete");

      if (heinrich) {
        heinrich.rolle = "Chefarzt";
        geaendert = true;
      }
      if (grete) {
        grete.rolle = "Stellv. Chefarzt";
        geaendert = true;
      }

      // Falls weder Heinrich noch Grete in der Liste stehen: ersten
      // vorhandenen Eintrag zum Admin machen, damit niemand ausgesperrt bleibt.
      if (!heinrich && !grete && loginMitarbeiterListe.length > 0) {
        loginMitarbeiterListe[0].rolle = "Chefarzt";
        geaendert = true;
      }
    }

    if (geaendert) speichereLoginMitarbeiterliste();
  }

  function abonniereLoginMitarbeiterliste() {
    if (unsubLoginMitarbeiter) return Promise.resolve(); // bereits abonniert

    return new Promise((resolve) => {
      let ersterDurchlauf = true;

      unsubLoginMitarbeiter = docRef(LOGIN_MITARBEITER_DOC).onSnapshot(
        (doc) => {
          if (doc.exists && Array.isArray(doc.data().liste)) {
            loginMitarbeiterListe = doc.data().liste;
            sichereMindestensEinenAdminZu();
          } else {
            loginMitarbeiterListe = DEFAULT_LOGIN_MITARBEITER.map((m) => ({ ...m }));
            speichereLoginMitarbeiterliste();
          }

          populiereNamensDropdown();
          renderLoginVerwaltung();

          if (ersterDurchlauf) {
            ersterDurchlauf = false;
            resolve();
          }
        },
        (fehler) => {
          console.error("Fehler beim Laden der Login-Liste:", fehler);
          if (ersterDurchlauf) {
            ersterDurchlauf = false;
            resolve();
          }
        }
      );
    });
  }

  function speichereLoginMitarbeiterliste() {
    docRef(LOGIN_MITARBEITER_DOC)
      .set({ liste: loginMitarbeiterListe, aktualisiertAm: firebase.firestore.FieldValue.serverTimestamp() })
      .catch((fehler) => {
        console.error("Login-Liste konnte nicht gespeichert werden:", fehler);
        zeigeToast("Speichern fehlgeschlagen – bitte Internetverbindung prüfen.");
      });
  }

  function istAdmin() {
    return aktuellerNutzer && ADMIN_ROLLEN.includes(aktuellerNutzer.rolle);
  }

  /* ------------------------------------------------------------------------
     10d. Einstellungen: Login-Verwaltung
     ------------------------------------------------------------------------ */
  function renderLoginVerwaltung() {
    if (!el.loginVerwaltungListe) return;

    el.einstellungenAdmin.hidden = !istAdmin();
    el.einstellungenLocked.hidden = istAdmin();
    if (!istAdmin()) return;

    el.loginVerwaltungListe.innerHTML = "";

    if (loginMitarbeiterListe.length === 0) {
      el.loginVerwaltungListe.innerHTML = `<p class="notes-empty">Noch keine Login-Namen eingetragen.</p>`;
      return;
    }

    loginMitarbeiterListe.forEach((person) => {
      const zeile = document.createElement("div");
      zeile.className = "settings-list__item";
      zeile.innerHTML = `
        <span>
          <span class="settings-list__name">${escapeHtml(person.name)}</span>
          <span class="settings-list__role">${escapeHtml(person.rolle)}</span>
          ${person.geschuetzt ? '<span class="settings-list__protected">🔒 PIN-geschützt</span>' : ""}
        </span>
        <button type="button" class="icon-btn icon-btn--delete" data-role="remove-login" data-id="${person.id}" title="Entfernen">🗑</button>
      `;
      el.loginVerwaltungListe.appendChild(zeile);
    });
  }

  if (el.formAddLogin) {
    el.formAddLogin.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!istAdmin()) return;

      const name = el.loginNameInput.value.trim();
      const rolle = el.loginRolleInput.value;
      const geschuetzt = el.loginGeschuetztInput.checked;
      if (!name) return;

      if (loginMitarbeiterListe.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
        zeigeToast("Dieser Name steht bereits in der Login-Liste.");
        return;
      }

      loginMitarbeiterListe.push({ id: erzeugeId(name), name, rolle, geschuetzt });
      speichereLoginMitarbeiterliste();
      el.loginNameInput.value = "";
      el.loginGeschuetztInput.checked = true;
      zeigeToast(`„${name}“ kann sich jetzt anmelden.${geschuetzt ? " (PIN-geschützt)" : ""}`);
    });
  }

  if (el.loginVerwaltungListe) {
    el.loginVerwaltungListe.addEventListener("click", (event) => {
      const btn = event.target.closest('[data-role="remove-login"]');
      if (!btn || !istAdmin()) return;

      const person = loginMitarbeiterListe.find((m) => m.id === btn.dataset.id);
      loginMitarbeiterListe = loginMitarbeiterListe.filter((m) => m.id !== btn.dataset.id);
      speichereLoginMitarbeiterliste();
      if (person) zeigeToast(`„${person.name}“ kann sich nicht mehr anmelden.`);
    });
  }

  /* ------------------------------------------------------------------------
     10b. Notizen: Sidebar-Untermenü (Allgemein / Personal / Herstellung)
     ------------------------------------------------------------------------ */
  const NOTIZ_KATEGORIEN = {
    allgemein: { label: "Allgemeine Infos", icon: "📄" },
    personal: { label: "Personal", icon: "🧑‍⚕️" },
    herstellung: { label: "Herstellung", icon: "🧪" },
  };

  let aktiveNotizKategorie = "allgemein"; // Standard-Kategorie beim Öffnen der Seite
  let letzteNotizen = [];                 // Zwischenspeicher für Kategorie-Filterung ohne Neu-Laden
  let notizenSuche = "";

  const navNotizenToggle = document.getElementById("nav-notizen-toggle");
  const navNotizenSubmenu = document.getElementById("nav-notizen-submenu");
  const navNotizenGroup = navNotizenToggle ? navNotizenToggle.closest(".nav__group") : null;
  const navSubitems = document.querySelectorAll(".nav__subitem");

  if (navNotizenToggle) {
    navNotizenToggle.addEventListener("click", () => {
      const istOffen = navNotizenGroup.classList.contains("nav__group--open");

      if (!istOffen) {
        navNotizenGroup.classList.add("nav__group--open");
      } else if (el.viewTitle && document.getElementById("view-notizen").classList.contains("view--active")) {
        // Schon offen und schon auf der Notizen-Seite -> beim erneuten Klick zuklappen
        navNotizenGroup.classList.remove("nav__group--open");
      }

      wechsleZuNotizenAnsicht(aktiveNotizKategorie);
    });
  }

  navSubitems.forEach((item) => {
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      wechsleZuNotizenAnsicht(item.dataset.kategorie);
    });
  });

  function wechsleZuNotizenAnsicht(kategorie) {
    aktiveNotizKategorie = kategorie;

    // Sidebar: "Notizen" + passenden Unterpunkt aktiv markieren, alle
    // anderen Hauptpunkte deaktivieren
    el.navItems.forEach((i) => i.classList.remove("nav__item--active"));
    navNotizenToggle.classList.add("nav__item--active");
    navNotizenGroup.classList.add("nav__group--open");
    navSubitems.forEach((i) => i.classList.toggle("nav__subitem--active", i.dataset.kategorie === kategorie));

    // Hauptansicht wechseln
    el.views.forEach((view) => view.classList.remove("view--active"));
    document.getElementById("view-notizen").classList.add("view--active");

    const kategorieInfo = NOTIZ_KATEGORIEN[kategorie];
    el.viewTitle.textContent = `Notizen · ${kategorieInfo.label}`;
    el.viewSubtitle.textContent = "Gemeinsame Notizen des Teams";

    aktualisiereKategorieBadge();
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

  function aktualisiereKategorieBadge() {
    const badge = document.getElementById("notes-kategorie-badge");
    if (!badge) return;
    const kategorieInfo = NOTIZ_KATEGORIEN[aktiveNotizKategorie];
    badge.className = `notes-kategorie-badge notes-kategorie-badge--${aktiveNotizKategorie}`;
    badge.textContent = `${kategorieInfo.icon} ${kategorieInfo.label}`;
  }

  function aktualisierePlatzhalterNotizfeld() {
    if (!el.noteInput) return;
    const kategorieInfo = NOTIZ_KATEGORIEN[aktiveNotizKategorie];
    el.noteInput.placeholder = `${kategorieInfo.label} eintragen...`;
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
        ? `<button type="button" class="icon-btn icon-btn--delete note-item__delete" data-role="delete-notiz" data-id="${notiz.id}" title="Notiz löschen">🗑</button>`
        : "";
      const rolleText = notiz.rolle ? ` (${escapeHtml(notiz.rolle)})` : "";

      const eintrag = document.createElement("div");
      eintrag.className = `note-item note-item--${notiz.kategorie}`;
      eintrag.innerHTML = `
        <div class="note-item__body">
          <div class="note-item__text">${formatiereNotizText(notiz.text)}</div>
          <div class="note-item__meta">— ${escapeHtml(notiz.autor)}${rolleText} · ${formatiereZeitstempel(notiz.millis)} Uhr</div>
        </div>
        ${loeschButton}
      `;
      el.notesList.appendChild(eintrag);
    });
  }

  el.formNote.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = el.noteInput.value.trim();
    if (!text || !aktuellerNutzer) return;

    db.collection(NOTIZEN_COLLECTION)
      .add({
        text: text,
        autor: aktuellerNutzer.name,
        rolle: aktuellerNutzer.rolle,
        kategorie: aktiveNotizKategorie,
        zeitpunkt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        el.noteInput.value = "";
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
     10c. Verkaufslog: Warenkorb-Formular (mehrere Artikel pro Verkauf),
          Sammel-Checkout + Log anzeigen
     ------------------------------------------------------------------------ */
  let verkaufsWarenkorb = []; // [{ name, menge, preis }]

  function renderWarenkorb() {
    el.saleCartItems.innerHTML = "";
    el.saleCartEmpty.hidden = verkaufsWarenkorb.length !== 0;
    el.saleCartTotal.hidden = verkaufsWarenkorb.length === 0;

    let summe = 0;
    verkaufsWarenkorb.forEach((item, index) => {
      const zwischensumme = item.menge * item.preis;
      summe += zwischensumme;

      const zeile = document.createElement("div");
      zeile.className = "sale-cart-item";
      zeile.innerHTML = `
        <span>${escapeHtml(item.name)} × ${item.menge} = ${formatiereGeld(zwischensumme)}</span>
        <button type="button" class="icon-btn icon-btn--delete sale-cart-item__remove" data-index="${index}" title="Entfernen">✕</button>
      `;
      el.saleCartItems.appendChild(zeile);
    });

    el.saleCartTotalValue.textContent = formatiereGeld(summe);
  }

  if (el.btnAddToCart) {
    el.btnAddToCart.addEventListener("click", () => {
      el.saleEntryError.hidden = true;

      const medName = el.saleMedikament.value;
      const menge = parseInt(el.saleMenge.value, 10);

      if (!medName) return zeigeFeldFehler(el.saleEntryError, "Bitte ein Medikament auswählen.");
      if (isNaN(menge) || menge < 1) return zeigeFeldFehler(el.saleEntryError, "Bitte eine gültige Menge (mind. 1) eingeben.");

      const med = medikamente.find((m) => m.name === medName);
      if (!med) return zeigeFeldFehler(el.saleEntryError, "Dieses Medikament existiert nicht mehr.");

      const bestehend = verkaufsWarenkorb.find((i) => i.name === med.name);
      if (bestehend) {
        bestehend.menge += menge;
      } else {
        verkaufsWarenkorb.push({ name: med.name, menge: menge, preis: Number(med.preis) });
      }

      renderWarenkorb();
      el.saleMedikament.value = "";
      el.saleMenge.value = "1";
    });
  }

  if (el.saleCartItems) {
    el.saleCartItems.addEventListener("click", (event) => {
      const btn = event.target.closest(".sale-cart-item__remove");
      if (!btn) return;
      verkaufsWarenkorb.splice(Number(btn.dataset.index), 1);
      renderWarenkorb();
    });
  }

  if (el.formSaleEntry) {
    el.formSaleEntry.addEventListener("submit", (event) => {
      event.preventDefault();
      el.saleEntryError.hidden = true;

      const kunde = el.saleKunde.value.trim();
      const datum = el.saleDatum.value;

      if (!kunde) return zeigeFeldFehler(el.saleEntryError, "Bitte Vor- und Nachname des Kunden eingeben.");
      if (!datum) return zeigeFeldFehler(el.saleEntryError, "Bitte ein Datum wählen.");
      if (verkaufsWarenkorb.length === 0) {
        return zeigeFeldFehler(el.saleEntryError, "Bitte mindestens einen Artikel zum Verkauf hinzufügen.");
      }

      const gesamtsumme = verkaufsWarenkorb.reduce((summe, i) => summe + i.menge * i.preis, 0);

      db.collection(VERKAUFSLOG_COLLECTION)
        .add({
          mitarbeiter: aktuellerNutzer ? aktuellerNutzer.name : "Unbekannt",
          rolle: aktuellerNutzer ? aktuellerNutzer.rolle : "",
          kunde: kunde,
          datum: datum,
          items: verkaufsWarenkorb.map((i) => ({ ...i })),
          gesamtsumme: gesamtsumme,
          zeitpunkt: firebase.firestore.FieldValue.serverTimestamp(),
        })
        .then(() => {
          el.saleKunde.value = "";
          verkaufsWarenkorb = [];
          renderWarenkorb();
          zeigeToast(`Verkauf an „${kunde}“ über ${formatiereGeld(gesamtsumme)} eingetragen.`);
        })
        .catch((fehler) => {
          console.error("Verkauf konnte nicht gespeichert werden:", fehler);
          zeigeFeldFehler(el.saleEntryError, "Verkauf konnte nicht gespeichert werden.");
        });
    });
  }

  // Sammel-Checkout aus der Medikamententabelle (mehrere Artikel auf einmal,
  // ohne Kundenname - z. B. für interne Bestandsanpassungen)
  el.btnCheckout.addEventListener("click", () => {
    const verkaufteArtikel = medikamente.filter((m) => (Number(m.menge) || 0) > 0);

    if (verkaufteArtikel.length === 0) {
      zeigeToast("Keine Mengen eingetragen – nichts zum Abschließen.");
      return;
    }

    const gesamtsumme = verkaufteArtikel.reduce((summe, m) => summe + Number(m.menge) * Number(m.preis), 0);
    const items = verkaufteArtikel.map((m) => ({ name: m.name, menge: Number(m.menge), preis: Number(m.preis) }));

    db.collection(VERKAUFSLOG_COLLECTION)
      .add({
        mitarbeiter: aktuellerNutzer ? aktuellerNutzer.name : "Unbekannt",
        rolle: aktuellerNutzer ? aktuellerNutzer.rolle : "",
        kunde: null,
        items: items,
        gesamtsumme: gesamtsumme,
        zeitpunkt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        medikamente.forEach((m) => (m.menge = 0));
        speichereMedikamenteInFirestore();
        render();
        zeigeToast(`Verkauf über ${formatiereGeld(gesamtsumme)} abgeschlossen.`);
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
        const itemsText = verkauf.items.map((i) => `${escapeHtml(i.name)} ×${i.menge} = ${formatiereGeld(i.menge * i.preis)}`).join("<br>");
        const zeitText = formatiereZeitstempel(verkauf.millis);
        const darfLoeschen = istAdmin();
        const kundeAnzeige = verkauf.kunde
          ? `${escapeHtml(verkauf.kunde)} <span style="color:var(--color-text-soft);font-weight:500;">— verkauft von ${escapeHtml(verkauf.mitarbeiter)}</span>`
          : `<span style="color:var(--color-text-soft);font-style:italic;">Kein Kunde angegeben</span> <span style="color:var(--color-text-soft);font-weight:500;">— verkauft von ${escapeHtml(verkauf.mitarbeiter)}</span>`;

        const eintrag = document.createElement("div");
        eintrag.className = "sale-item";
        eintrag.dataset.id = verkauf.id;
        eintrag.innerHTML = `
          <div class="sale-item__header">
            <span class="sale-item__employee">
              ${kundeAnzeige}
              <span style="color:var(--color-text-soft);font-weight:500;"> (${escapeHtml(verkauf.rolle || "")})</span>
              <button type="button" class="icon-btn icon-btn--edit sale-item__edit-kunde-btn" data-role="toggle-edit-kunde" data-id="${verkauf.id}" title="Kunde bearbeiten">✎</button>
            </span>
            <span class="sale-item__time">${zeitText}</span>
          </div>
          <div class="sale-item__items">${itemsText}</div>
          <div class="sale-item__footer">
            <div class="sale-item__total">Gesamt: ${formatiereGeld(verkauf.gesamtsumme)}</div>
            <div class="sale-item__actions">
              <button type="button" class="btn btn--ghost sale-item__add-btn" data-role="toggle-add-item" data-id="${verkauf.id}">+ Artikel hinzufügen</button>
              ${darfLoeschen ? `<button type="button" class="icon-btn icon-btn--delete" data-role="delete-verkauf" data-id="${verkauf.id}" title="Verkauf löschen">🗑</button>` : ""}
            </div>
          </div>
          <div class="sale-item__add-form" id="edit-kunde-form-${verkauf.id}" hidden>
            <input type="text" class="field-input" placeholder="Name des Kunden..." value="${verkauf.kunde ? escapeHtml(verkauf.kunde) : ""}" data-role="edit-kunde-input" />
            <button type="button" class="btn btn--primary" data-role="confirm-edit-kunde" data-id="${verkauf.id}">Speichern</button>
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

    const toggleKundeBtn = event.target.closest('[data-role="toggle-edit-kunde"]');
    if (toggleKundeBtn) {
      const form = document.getElementById(`edit-kunde-form-${toggleKundeBtn.dataset.id}`);
      if (form) {
        form.hidden = !form.hidden;
        if (!form.hidden) form.querySelector('[data-role="edit-kunde-input"]').focus();
      }
      return;
    }

    const confirmKundeBtn = event.target.closest('[data-role="confirm-edit-kunde"]');
    if (confirmKundeBtn) {
      const verkaufId = confirmKundeBtn.dataset.id;
      const zeile = confirmKundeBtn.closest(".sale-item__add-form");
      const input = zeile.querySelector('[data-role="edit-kunde-input"]');
      const neuerName = input.value.trim();

      db.collection(VERKAUFSLOG_COLLECTION)
        .doc(verkaufId)
        .update({ kunde: neuerName || null })
        .then(() => zeigeToast(neuerName ? `Kunde „${neuerName}“ gespeichert.` : "Kunde entfernt."))
        .catch((fehler) => {
          console.error("Kunde konnte nicht gespeichert werden:", fehler);
          zeigeToast("Kunde konnte nicht gespeichert werden.");
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
    populiereMedikamentDropdownVerkauf();
  }

  function populiereMedikamentDropdownVerkauf() {
    if (!el.saleMedikament) return;
    const aktuellerWert = el.saleMedikament.value;

    el.saleMedikament.innerHTML = '<option value="">Bitte auswählen...</option>';
    medikamente.forEach((med) => {
      const option = document.createElement("option");
      option.value = med.name;
      option.textContent = `${med.name} (${formatiereGeld(med.preis)})`;
      el.saleMedikament.appendChild(option);
    });

    // Auswahl nach Möglichkeit beibehalten (z. B. wenn nur die Menge eines anderen Medikaments geändert wurde)
    if ([...el.saleMedikament.options].some((o) => o.value === aktuellerWert)) {
      el.saleMedikament.value = aktuellerWert;
    }
  }

  function renderTabelle() {
    const liste = gefilterteMedikamente();
    el.tableBody.innerHTML = "";
    el.emptyState.hidden = liste.length !== 0;

    const darfLoeschen = istAdmin();
    // Verschieben nur möglich, wenn die Gesamtliste (unsortiert/ungefiltert)
    // angezeigt wird - bei aktiver Suche wäre "nach oben/unten" verwirrend,
    // da die Reihenfolge sich immer auf die komplette Medikamentenliste bezieht.
    const darfVerschieben = darfLoeschen && !suchbegriff.trim();

    liste.forEach((med) => {
      const tr = document.createElement("tr");
      const menge = Number(med.menge) || 0;
      const zwischensumme = menge * Number(med.preis);

      const loeschButton = darfLoeschen
        ? `<button class="icon-btn icon-btn--delete" data-role="delete" data-id="${med.id}" title="Medikament löschen">🗑</button>`
        : `<button class="icon-btn icon-btn--locked" disabled title="Nur Chefarzt & Stellv. Chefärztin dürfen löschen">🔒</button>`;

      let verschiebenButtons = "";
      if (darfVerschieben) {
        const echterIndex = medikamente.findIndex((m) => m.id === med.id);
        const istErste = echterIndex === 0;
        const istLetzte = echterIndex === medikamente.length - 1;
        verschiebenButtons = `
          <button class="icon-btn icon-btn--move" data-role="move-up" data-id="${med.id}" title="Nach oben verschieben" ${istErste ? "disabled" : ""}>▲</button>
          <button class="icon-btn icon-btn--move" data-role="move-down" data-id="${med.id}" title="Nach unten verschieben" ${istLetzte ? "disabled" : ""}>▼</button>
        `;
      }

      tr.innerHTML = `
        <td>
          <div class="med-name">
            <span class="med-name__dot"></span>
            <span>${escapeHtml(med.name)}</span>
          </div>
        </td>
        <td class="med-price">${formatiereGeld(med.preis)}</td>
        <td>
          <input type="number" class="qty-input" min="0" step="1" value="${menge}" data-id="${med.id}" data-role="qty" />
        </td>
        <td class="subtotal">${formatiereGeld(zwischensumme)}</td>
        <td>
          <div class="row-actions">
            ${verschiebenButtons}
            <button class="icon-btn icon-btn--edit" data-role="edit" data-id="${med.id}" title="Preis bearbeiten">✎</button>
            ${loeschButton}
          </div>
        </td>
      `;
      el.tableBody.appendChild(tr);
    });
  }

  function verschiebeMedikament(id, richtung) {
    if (!istAdmin()) {
      zeigeToast("Nur Chefarzt & Stellv. Chefärztin dürfen die Reihenfolge ändern.");
      return;
    }

    const index = medikamente.findIndex((m) => m.id === id);
    if (index === -1) return;

    const zielIndex = richtung === "up" ? index - 1 : index + 1;
    if (zielIndex < 0 || zielIndex >= medikamente.length) return;

    const temp = medikamente[index];
    medikamente[index] = medikamente[zielIndex];
    medikamente[zielIndex] = temp;

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

    el.infosGrid.innerHTML = "";
    infosListe.forEach((info) => {
      const card = document.createElement("div");
      card.className = "info-card";
      const aktionsButtons = istAdmin()
        ? `
          <button type="button" class="icon-btn icon-btn--edit info-card__edit" data-role="edit-info" data-id="${info.id}" title="Eintrag bearbeiten">✎</button>
          <button type="button" class="icon-btn icon-btn--delete info-card__delete" data-role="delete-info" data-id="${info.id}" title="Eintrag löschen">🗑</button>
        `
        : "";
      card.innerHTML = `
        ${aktionsButtons}
        <span class="info-card__name">${escapeHtml(info.titel)}</span>
        <span class="info-card__text">${formatiereNotizText(info.text)}</span>
        ${info.hinweis ? `<span class="info-card__hint">${formatiereNotizText(info.hinweis)}</span>` : ""}
      `;
      el.infosGrid.appendChild(card);
    });
  }

  function setzeInfoFormularZurueck() {
    el.infoEditingId.value = "";
    el.infoTitelInput.value = "";
    el.infoTextInput.value = "";
    el.infoHinweisInput.value = "";
    el.infoFormTitle.textContent = "ℹ️ Neuen Info-Eintrag hinzufügen";
    el.infoFormSubmit.textContent = "Hinzufügen";
    el.infoFormCancel.hidden = true;
  }

  if (el.formAddInfo) {
    el.formAddInfo.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!istAdmin()) return;

      const titel = el.infoTitelInput.value.trim();
      const text = el.infoTextInput.value.trim();
      const hinweis = el.infoHinweisInput.value.trim();
      if (!titel || !text) return;

      const bearbeiteId = el.infoEditingId.value;

      if (bearbeiteId) {
        const info = infosListe.find((i) => i.id === bearbeiteId);
        if (info) {
          info.titel = titel;
          info.text = text;
          info.hinweis = hinweis || undefined;
        }
        speichereInfos();
        zeigeToast(`„${titel}“ wurde aktualisiert.`);
      } else {
        infosListe.push({ id: erzeugeId(titel), titel, text, hinweis: hinweis || undefined });
        speichereInfos();
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
        el.infoTextInput.value = info.text;
        el.infoHinweisInput.value = info.hinweis || "";
        el.infoFormTitle.textContent = `✎ „${info.titel}“ bearbeiten`;
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
    el.boardAdminForm.hidden = !istAdmin();
    el.boardEmpty.hidden = eintraege.length !== 0;
    el.boardList.innerHTML = "";

    eintraege.forEach((eintrag) => {
      const loeschButton = istAdmin()
        ? `<button type="button" class="icon-btn icon-btn--delete" data-role="delete-ankuendigung" data-id="${eintrag.id}" title="Löschen">🗑</button>`
        : "";

      const karte = document.createElement("div");
      karte.className = "board-item";
      karte.innerHTML = `
        <span class="board-item__pin">📌</span>
        <div class="board-item__text">${formatiereNotizText(eintrag.text)}</div>
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

      const text = el.ankuendigungInput.value.trim();
      if (!text) return;

      db.collection(ANKUENDIGUNGEN_COLLECTION)
        .add({ text, autor: aktuellerNutzer.name, zeitpunkt: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => {
          el.ankuendigungInput.value = "";
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

  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      schliesseModal(document.getElementById(btn.getAttribute("data-close-modal")));
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
          zeigeToast("Nur Chefarzt & Stellv. Chefärztin dürfen löschen.");
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
    const zeile = inputElement.closest("tr");
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
    else if (btn.dataset.role === "move-up") verschiebeMedikament(btn.dataset.id, "up");
    else if (btn.dataset.role === "move-down") verschiebeMedikament(btn.dataset.id, "down");
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

      el.navItems.forEach((i) => i.classList.remove("nav__item--active"));
      item.classList.add("nav__item--active");

      // Notizen-Untermenü schließen und dessen Aktiv-Status entfernen,
      // wenn zu einem anderen Hauptpunkt gewechselt wird
      if (navNotizenToggle) {
        navNotizenToggle.classList.remove("nav__item--active");
        navNotizenGroup.classList.remove("nav__group--open");
      }

      el.views.forEach((view) => view.classList.remove("view--active"));
      document.getElementById(`view-${zielView}`).classList.add("view--active");

      const meta = VIEW_META[zielView];
      if (meta) {
        el.viewTitle.textContent = meta.title;
        el.viewSubtitle.textContent = meta.subtitle;
      }

      if (zielView === "mitarbeiter") renderMitarbeiterListe();
      if (zielView === "einstellungen") renderLoginVerwaltung();
    });
  });

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
     20b. Design-Umschalter (Hell/Dunkel) in den Einstellungen
     ------------------------------------------------------------------------ */
  (function initThemeSwitch() {
    const btnLight = document.getElementById("theme-btn-light");
    const btnDark = document.getElementById("theme-btn-dark");
    if (!btnLight || !btnDark) return;

    function aktualisiereButtons() {
      const istDark = document.documentElement.getAttribute("data-theme") === "dark";
      btnLight.classList.toggle("theme-option--active", !istDark);
      btnDark.classList.toggle("theme-option--active", istDark);
    }

    function setzeTheme(theme) {
      if (theme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      aktualisiereButtons();
    }

    btnLight.addEventListener("click", () => setzeTheme("light"));
    btnDark.addEventListener("click", () => setzeTheme("dark"));

    aktualisiereButtons(); // Beim Laden direkt den aktuell aktiven Button markieren
  })();

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
  const APP_VERSION = 25;
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
      // Login-Session zurücksetzen, damit nach dem Update wirklich alles
      // frisch geladen wird (neues Passwort, neuer Name, neuer PIN-Check).
      // Das Website-Passwort selbst bleibt bewusst NICHT gespeichert - so
      // greift auch ein evtl. geändertes SITE_PASSWORD sofort.
      localStorage.removeItem(GATE_PASSWORD_OK);
      localStorage.removeItem(GATE_NAME);
      localStorage.removeItem(GATE_ROLLE);
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
     ------------------------------------------------------------------------ */
  if (istFirebaseKonfiguriert()) {
    pruefeGespeichertenZugang();
  }
})();

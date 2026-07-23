/* ==========================================================================
   HORNHAUSEN-HOF — Hofverwaltung: App-Logik
   ---------------------------------------------------------------------------
   Zugang: echtes Login-/Benutzersystem (siehe js/auth.js). Diese Datei
   (js/app.js) nutzt weiterhin das "Compat"-SDK (firebase.firestore()) für
   alle fachlichen Daten (Waren, Bestellungen, Handelsrechner, Kontakte,
   Lager, Verkäufe, Statistiken) und reagiert nur auf die Events, die
   js/auth.js verschickt, sobald jemand eingeloggt UND freigegeben ist.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     1. Konstanten
     ------------------------------------------------------------------------ */
  const VERSION_AKTUELL = 1;

  // Ränge des Hofes (rein organisatorisch — Verwalterrechte sind unabhängig
  // davon und werden separat je Benutzer vergeben, siehe isAdmin).
  const BENUTZER_RAENGE = ["Tagelöhner", "Knecht", "Hofarbeiter", "Stallmeister", "Hofmeister", "Hofherr"];
  const NEUER_BENUTZER_STANDARD_RANG = "Tagelöhner";

  const PRODUKTE_COLLECTION = "produkte";
  const BESTELLUNGEN_COLLECTION = "bestellungen";
  const ANGEBOTE_COLLECTION = "angebote";
  const KONTAKTE_COLLECTION = "kontakte";
  const VERKAEUFE_COLLECTION = "verkaeufe";
  const PRESENCE_COLLECTION = "presence";
  const KONTAKTE_ROLLEN_DOC = "kataloge/kontakte-rollen";
  const KONTAKTE_ROLLEN_FALLBACK = "Sonstiges";
  const DEFAULT_KONTAKTE_ROLLEN = ["Bürger", "Hofmeister", "Sheriff", "Rancher", "Schmied", "Händler", KONTAKTE_ROLLEN_FALLBACK];

  const ONLINE_SCHWELLE_MS = 45 * 1000;
  const HEARTBEAT_INTERVALL_MS = 20 * 1000;

  const BESTELLUNG_STATUS = ["Offen", "In Bearbeitung", "Abgeschlossen"];

  // Startbestand an Waren, falls die Collection "produkte" noch leer ist —
  // orientiert sich an den Mockups (Weizen, Mais, Zucker, ...).
  const DEFAULT_PRODUKTE = [
    { name: "Weizen", verkaufspreis: 0.25, einkaufspreis: null, lagerMenge: 0, reihenfolge: 1 },
    { name: "Mais", verkaufspreis: 0.25, einkaufspreis: null, lagerMenge: 0, reihenfolge: 2 },
    { name: "Zuckerrohr", verkaufspreis: 0.2, einkaufspreis: null, lagerMenge: 0, reihenfolge: 3 },
    { name: "Hopfen", verkaufspreis: 0.2, einkaufspreis: null, lagerMenge: 0, reihenfolge: 4 },
    { name: "Zwiebel", verkaufspreis: 0.2, einkaufspreis: null, lagerMenge: 0, reihenfolge: 5 },
    { name: "Kartoffel", verkaufspreis: 0.2, einkaufspreis: null, lagerMenge: 0, reihenfolge: 6 },
    { name: "Salatkopf", verkaufspreis: 0.25, einkaufspreis: null, lagerMenge: 0, reihenfolge: 7 },
    { name: "Tomaten", verkaufspreis: 0.25, einkaufspreis: null, lagerMenge: 0, reihenfolge: 8 },
    { name: "Karotten", verkaufspreis: 0.25, einkaufspreis: null, lagerMenge: 0, reihenfolge: 9 },
    { name: "Thymian", verkaufspreis: 0.15, einkaufspreis: null, lagerMenge: 0, reihenfolge: 10 },
    { name: "Oregano", verkaufspreis: 0.2, einkaufspreis: null, lagerMenge: 0, reihenfolge: 11 },
    { name: "Blaubeere", verkaufspreis: 0.2, einkaufspreis: null, lagerMenge: 0, reihenfolge: 12 },
    { name: "Maisbrot", verkaufspreis: 1.25, einkaufspreis: null, lagerMenge: 0, reihenfolge: 13 },
    { name: "Milch", verkaufspreis: 0.3, einkaufspreis: null, lagerMenge: 0, reihenfolge: 14 },
    { name: "Mehl", verkaufspreis: 0.25, einkaufspreis: null, lagerMenge: 0, reihenfolge: 15 },
    { name: "Zucker", verkaufspreis: 0.25, einkaufspreis: null, lagerMenge: 0, reihenfolge: 16 },
    { name: "Mehlsack", verkaufspreis: 3.5, einkaufspreis: null, lagerMenge: 0, reihenfolge: 17 },
    { name: "Zuckersack", verkaufspreis: 3.5, einkaufspreis: null, lagerMenge: 0, reihenfolge: 18 },
    { name: "Stoff", verkaufspreis: 0.2, einkaufspreis: null, lagerMenge: 0, reihenfolge: 19 },
    { name: "Eier", verkaufspreis: 0.25, einkaufspreis: null, lagerMenge: 0, reihenfolge: 20 },
    { name: "Rindfleisch", verkaufspreis: 0.5, einkaufspreis: null, lagerMenge: 0, reihenfolge: 21 },
    { name: "Speck", verkaufspreis: 0.5, einkaufspreis: null, lagerMenge: 0, reihenfolge: 22 },
    { name: "Schweinefleisch", verkaufspreis: 0.5, einkaufspreis: null, lagerMenge: 0, reihenfolge: 23 },
    { name: "Lammfleisch", verkaufspreis: 0.5, einkaufspreis: null, lagerMenge: 0, reihenfolge: 24 },
  ];

  const VIEW_META = {
    uebersicht: { title: "Übersicht", subtitle: "Hier behältst du alles im Blick." },
    bestellungen: { title: "Bestellungen", subtitle: "Verwalte alle Bestellungen und Lieferungen." },
    waren: { title: "Waren & Preise", subtitle: "Verwalte die Verkaufspreise und Einkaufspreise." },
    handelsrechner: { title: "Handelsrechner", subtitle: "Berechne Angebote und Handelskonditionen für Unternehmen." },
    kontakte: { title: "Kontakte", subtitle: "Verwalte deine Kontakte und Telegrammnummern." },
    lager: { title: "Lager", subtitle: "Aktueller Warenbestand und Lagerwert." },
    verkaeufe: { title: "Verkäufe", subtitle: "Trage Verkäufe ein und behalte die Historie im Blick." },
    statistiken: { title: "Statistiken", subtitle: "Auswertung von Verkäufen und Bestellungen." },
    einstellungen: { title: "Einstellungen", subtitle: "Konfiguration der Hofverwaltung." },
    admin: { title: "Verwaltung", subtitle: "Benutzerverwaltung — nur für Verwalter sichtbar." },
    "admin-log": { title: "Aktivitäts-Log", subtitle: "Wer hat wann was geändert — nur für Verwalter sichtbar." },
  };

  /* ------------------------------------------------------------------------
     2. Anwendungsstatus
     ------------------------------------------------------------------------ */
  let aktuellerNutzer = null; // { uid, name, rolle, admin }
  let aktuelleAnsicht = "uebersicht";

  let produkte = [];
  let unsubProdukte = null;
  let bestellungen = [];
  let unsubBestellungen = null;
  let angebote = [];
  let unsubAngebote = null;
  let kontakte = [];
  let unsubKontakte = null;
  let verkaeufe = [];
  let unsubVerkaeufe = null;
  let unsubPresence = null;
  let unsubKontakteRollen = null;
  let kontakteRollenKatalog = [];
  let unsubBenutzerliste = null;
  let benutzerListe = [];
  let bekanntePendingUids = null;
  let unsubAdminLog = null;
  let adminLogEintraege = [];

  let bestellungenStatusFilter = "alle";
  let bestellungenSuche = "";
  let warenSuche = "";
  let kontakteSuche = "";
  let lagerSuche = "";
  let verkaeufeSuche = "";
  let benutzerSuche = "";
  let aktiverDetailUid = null;
  let kontakteRollenVerwaltungOffen = false;

  let heartbeatTimer = null;
  let onlineRecomputeTimer = null;
  let versionCheckTimer = null;
  let sessionId = null;

  let pendingDeleteCallback = null;

  /* ------------------------------------------------------------------------
     3. DOM-Referenzen
     ------------------------------------------------------------------------ */
  const el = {
    authScreen: document.getElementById("auth-screen"),
    appRoot: document.getElementById("app-root"),
    authConfigHint: document.getElementById("auth-config-hint"),

    sidebarNav: document.getElementById("sidebar-nav"),
    navAdminToggle: document.getElementById("nav-admin-toggle"),
    navAdminBadge: document.getElementById("nav-admin-badge"),
    views: document.querySelectorAll(".view"),
    viewTitle: document.getElementById("view-title"),
    viewSubtitle: document.getElementById("view-subtitle"),

    onlineWidgetBtn: document.getElementById("online-widget-btn"),
    onlineCount: document.getElementById("online-count"),
    onlinePanel: document.getElementById("online-panel"),
    onlinePanelList: document.getElementById("online-panel-list"),

    sidebarUserBtn: document.getElementById("sidebar-user-btn"),
    sidebarUserAvatar: document.getElementById("sidebar-user-avatar"),
    sidebarUserName: document.getElementById("sidebar-user-name"),
    sidebarUserRole: document.getElementById("sidebar-user-role"),
    sidebarUserMenu: document.getElementById("sidebar-user-menu"),
    btnLogout: document.getElementById("btn-logout"),

    toast: document.getElementById("toast"),

    // Übersicht
    dashboardGreeting: document.getElementById("dashboard-greeting"),
    dashboardName: document.getElementById("dashboard-name"),
    statOffeneBestellungen: document.getElementById("stat-offene-bestellungen"),
    statOffeneBestellungenSub: document.getElementById("stat-offene-bestellungen-sub"),
    statHeuteVerkauft: document.getElementById("stat-heute-verkauft"),
    statHeuteVerkauftSub: document.getElementById("stat-heute-verkauft-sub"),
    statLagerwert: document.getElementById("stat-lagerwert"),
    statGesamtgewinn: document.getElementById("stat-gesamtgewinn"),
    dashOffeneBestellungen: document.getElementById("dash-offene-bestellungen"),
    dashOffeneBestellungenEmpty: document.getElementById("dash-offene-bestellungen-empty"),
    dashKuerzlicheVerkaeufe: document.getElementById("dash-kuerzliche-verkaeufe"),
    dashKuerzlicheVerkaeufeEmpty: document.getElementById("dash-kuerzliche-verkaeufe-empty"),
    dashWichtigeKontakte: document.getElementById("dash-wichtige-kontakte"),
    dashWichtigeKontakteEmpty: document.getElementById("dash-wichtige-kontakte-empty"),

    // Bestellungen
    bestellungenTabs: document.getElementById("bestellungen-tabs"),
    bestellungenSearch: document.getElementById("bestellungen-search"),
    bestellungenTableBody: document.getElementById("bestellungen-table-body"),
    bestellungenEmpty: document.getElementById("bestellungen-empty"),
    bestellungenNoResults: document.getElementById("bestellungen-no-results"),
    btnAddBestellung: document.getElementById("btn-add-bestellung"),
    modalBestellung: document.getElementById("modal-bestellung"),
    modalBestellungTitel: document.getElementById("modal-bestellung-titel"),
    bestellungEditingId: document.getElementById("bestellung-editing-id"),
    bestellungUnternehmenInput: document.getElementById("bestellung-unternehmen-input"),
    bestellungProduktInput: document.getElementById("bestellung-produkt-input"),
    bestellungMengeInput: document.getElementById("bestellung-menge-input"),
    bestellungDeadlineInput: document.getElementById("bestellung-deadline-input"),
    bestellungStatusInput: document.getElementById("bestellung-status-input"),
    bestellungNotizInput: document.getElementById("bestellung-notiz-input"),
    bestellungError: document.getElementById("bestellung-error"),
    btnConfirmBestellung: document.getElementById("btn-confirm-bestellung"),

    // Waren & Preise
    warenSearch: document.getElementById("waren-search"),
    warenTableBody: document.getElementById("waren-table-body"),
    warenEmpty: document.getElementById("waren-empty"),
    warenNoResults: document.getElementById("waren-no-results"),
    btnAddWare: document.getElementById("btn-add-ware"),
    modalWare: document.getElementById("modal-ware"),
    modalWareTitel: document.getElementById("modal-ware-titel"),
    wareEditingId: document.getElementById("ware-editing-id"),
    wareNameInput: document.getElementById("ware-name-input"),
    wareVerkaufspreisInput: document.getElementById("ware-verkaufspreis-input"),
    wareEinkaufspreisInput: document.getElementById("ware-einkaufspreis-input"),
    wareError: document.getElementById("ware-error"),
    btnConfirmWare: document.getElementById("btn-confirm-ware"),

    // Handelsrechner
    unternehmenListe: document.getElementById("unternehmen-liste"),
    rechnerUnternehmen: document.getElementById("rechner-unternehmen"),
    rechnerProdukt: document.getElementById("rechner-produkt"),
    rechnerMenge: document.getElementById("rechner-menge"),
    rechnerModusRabattRadio: document.querySelector('input[name="rechner-modus"][value="rabatt"]'),
    rechnerModusPreisRadio: document.querySelector('input[name="rechner-modus"][value="preis"]'),
    rechnerModusRabattWrap: document.getElementById("rechner-modus-rabatt"),
    rechnerModusPreisWrap: document.getElementById("rechner-modus-preis"),
    rechnerRabattRange: document.getElementById("rechner-rabatt-range"),
    rechnerRabattInput: document.getElementById("rechner-rabatt-input"),
    rechnerRabattMinus: document.getElementById("rechner-rabatt-minus"),
    rechnerRabattPlus: document.getElementById("rechner-rabatt-plus"),
    rechnerPreisInput: document.getElementById("rechner-preis-input"),
    rechnerStandardpreis: document.getElementById("rechner-standardpreis"),
    rechnerEk: document.getElementById("rechner-ek"),
    rechnerNeuerStueckpreis: document.getElementById("rechner-neuer-stueckpreis"),
    rechnerGesamtpreis: document.getElementById("rechner-gesamtpreis"),
    rechnerGewinnStueck: document.getElementById("rechner-gewinn-stueck"),
    rechnerGesamtgewinn: document.getElementById("rechner-gesamtgewinn"),
    rechnerGewinnmarge: document.getElementById("rechner-gewinnmarge"),
    rechnerEkHinweis: document.getElementById("rechner-ek-hinweis"),
    vorschauUnternehmen: document.getElementById("vorschau-unternehmen"),
    vorschauProdukt: document.getElementById("vorschau-produkt"),
    vorschauMenge: document.getElementById("vorschau-menge"),
    vorschauStandardpreis: document.getElementById("vorschau-standardpreis"),
    vorschauRabatt: document.getElementById("vorschau-rabatt"),
    vorschauNeuerPreis: document.getElementById("vorschau-neuer-preis"),
    vorschauGesamtpreis: document.getElementById("vorschau-gesamtpreis"),
    btnAngebotUebernehmen: document.getElementById("btn-angebot-uebernehmen"),
    btnRechnerReset: document.getElementById("btn-rechner-reset"),
    angeboteTableBody: document.getElementById("angebote-table-body"),
    angeboteEmpty: document.getElementById("angebote-empty"),

    // Kontakte
    formKontakt: document.getElementById("form-kontakt"),
    kontaktNummerInput: document.getElementById("kontakt-nummer-input"),
    kontaktNameInput: document.getElementById("kontakt-name-input"),
    kontaktBerufInput: document.getElementById("kontakt-beruf-input"),
    kontaktNotizInput: document.getElementById("kontakt-notiz-input"),
    kontaktList: document.getElementById("kontakt-list"),
    kontakteEmpty: document.getElementById("kontakte-empty"),
    kontakteNoResults: document.getElementById("kontakte-no-results"),
    kontakteSearch: document.getElementById("kontakte-search"),
    btnToggleKontakteRollen: document.getElementById("btn-toggle-kontakte-rollen"),
    kontakteRollenVerwaltung: document.getElementById("kontakte-rollen-verwaltung"),
    modalKontaktEdit: document.getElementById("modal-kontakt-edit"),
    kontaktEditId: document.getElementById("kontakt-edit-id"),
    kontaktEditNummer: document.getElementById("kontakt-edit-nummer"),
    kontaktEditName: document.getElementById("kontakt-edit-name"),
    kontaktEditRolle: document.getElementById("kontakt-edit-rolle"),
    kontaktEditNotiz: document.getElementById("kontakt-edit-notiz"),
    kontaktEditError: document.getElementById("kontakt-edit-error"),
    btnConfirmKontaktEdit: document.getElementById("btn-confirm-kontakt-edit"),

    // Lager
    lagerSearch: document.getElementById("lager-search"),
    lagerTableBody: document.getElementById("lager-table-body"),
    lagerEmpty: document.getElementById("lager-empty"),
    lagerGesamtwert: document.getElementById("lager-gesamtwert"),

    // Verkäufe
    formVerkauf: document.getElementById("form-verkauf"),
    verkaufUnternehmenInput: document.getElementById("verkauf-unternehmen-input"),
    verkaufProduktInput: document.getElementById("verkauf-produkt-input"),
    verkaufMengeInput: document.getElementById("verkauf-menge-input"),
    verkaufPreisInput: document.getElementById("verkauf-preis-input"),
    verkaeufeSearch: document.getElementById("verkaeufe-search"),
    verkaeufeTableBody: document.getElementById("verkaeufe-table-body"),
    verkaeufeEmpty: document.getElementById("verkaeufe-empty"),

    // Statistiken
    statVerkaeufeAnzahl: document.getElementById("stat-verkaeufe-anzahl"),
    statUmsatzGesamt: document.getElementById("stat-umsatz-gesamt"),
    statBestellungenGesamt: document.getElementById("stat-bestellungen-gesamt"),
    statStatOffene: document.getElementById("stat-stat-offene"),
    statistikTopWaren: document.getElementById("statistik-top-waren"),
    statistikTopWarenEmpty: document.getElementById("statistik-top-waren-empty"),
    statistikTopKunden: document.getElementById("statistik-top-kunden"),
    statistikTopKundenEmpty: document.getElementById("statistik-top-kunden-empty"),

    // Einstellungen
    startseiteSelect: document.getElementById("startseite-select"),

    // Verwaltung
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

    // Modals allgemein
    modalDelete: document.getElementById("modal-delete"),
    deleteTitle: document.getElementById("delete-title"),
    deleteText: document.getElementById("delete-text"),
    btnConfirmDelete: document.getElementById("btn-confirm-delete"),

    updateBanner: document.getElementById("update-banner"),
    updateBannerBtn: document.getElementById("update-banner-btn"),
  };

  /* ------------------------------------------------------------------------
     4. Firebase-Konfigurationsprüfung
     ------------------------------------------------------------------------ */
  function istFirebaseKonfiguriert() {
    return typeof firebase !== "undefined" && typeof firebaseConfig !== "undefined" && firebaseConfig.apiKey;
  }

  let db = null;
  if (istFirebaseKonfiguriert()) {
    db = firebase.firestore();
  } else if (el.authConfigHint) {
    el.authConfigHint.hidden = false;
  }

  /* ------------------------------------------------------------------------
     5. Hilfsfunktionen
     ------------------------------------------------------------------------ */
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function formatGeld(betrag) {
    const zahl = Number(betrag);
    if (!isFinite(zahl)) return "–";
    return `${zahl.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  }

  function formatProzent(zahl, nachkomma) {
    if (zahl === null || zahl === undefined || !isFinite(zahl)) return "–";
    return `${zahl.toFixed(nachkomma == null ? 1 : nachkomma)} %`;
  }

  function formatDatum(ts) {
    if (!ts) return "—";
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  }

  function formatDatumUhrzeit(ts) {
    if (!ts) return "—";
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    return `${formatDatum(ts)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} Uhr`;
  }

  function istHeute(ts) {
    if (!ts) return false;
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    const heute = new Date();
    return d.getFullYear() === heute.getFullYear() && d.getMonth() === heute.getMonth() && d.getDate() === heute.getDate();
  }

  function istDiesenMonat(ts) {
    if (!ts) return false;
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    const heute = new Date();
    return d.getFullYear() === heute.getFullYear() && d.getMonth() === heute.getMonth();
  }

  function zeigeToast(text) {
    el.toast.textContent = text;
    el.toast.classList.add("toast--visible");
    clearTimeout(zeigeToast._timer);
    zeigeToast._timer = setTimeout(() => el.toast.classList.remove("toast--visible"), 2400);
  }

  function zeigeFeldFehler(element, text) {
    if (!element) return;
    element.textContent = text;
    element.hidden = false;
  }

  function versteckeFeldFehler(element) {
    if (!element) return;
    element.hidden = true;
  }

  function istAdmin() {
    return !!(aktuellerNutzer && aktuellerNutzer.admin);
  }

  function initialenAvatar(name) {
    if (!name) return "?";
    const teile = name.trim().split(/\s+/);
    if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
    return (teile[0][0] + teile[teile.length - 1][0]).toUpperCase();
  }

  function statusPillKlasse(status) {
    switch (status) {
      case "Offen":
        return "status-pill--offen";
      case "In Bearbeitung":
        return "status-pill--bearbeitung";
      case "Abgeschlossen":
        return "status-pill--geschlossen";
      case "Übernommen":
        return "status-pill--uebernommen";
      case "Entwurf":
        return "status-pill--entwurf";
      default:
        return "status-pill--entwurf";
    }
  }

  function erzeugeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /* ------------------------------------------------------------------------
     6. Modals (allgemein, funktionieren auch vor dem Login)
     ------------------------------------------------------------------------ */
  function oeffneModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.add("modal-overlay--visible");
  }

  function schliesseModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove("modal-overlay--visible");
  }

  document.querySelectorAll("[data-open-modal]").forEach((btn) => {
    btn.addEventListener("click", () => oeffneModal(btn.getAttribute("data-open-modal")));
  });
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => schliesseModal(btn.getAttribute("data-close-modal")));
  });
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.classList.remove("modal-overlay--visible");
    });
  });

  function fordereLoeschungAn(titel, text, callback) {
    el.deleteTitle.textContent = titel;
    el.deleteText.textContent = text;
    pendingDeleteCallback = callback;
    oeffneModal("modal-delete");
  }

  if (el.btnConfirmDelete) {
    el.btnConfirmDelete.addEventListener("click", async () => {
      if (typeof pendingDeleteCallback === "function") {
        try {
          await pendingDeleteCallback();
        } catch (fehler) {
          console.error(fehler);
          zeigeToast("Löschen fehlgeschlagen.");
        }
      }
      pendingDeleteCallback = null;
      schliesseModal("modal-delete");
    });
  }

  /* ------------------------------------------------------------------------
     7. Navigation (Sidebar)
     ------------------------------------------------------------------------ */
  function zeigeAnsicht(view) {
    aktuelleAnsicht = view;
    el.views.forEach((section) => section.classList.toggle("view--active", section.id === `view-${view}`));

    document.querySelectorAll(".sidebar__item").forEach((btn) => {
      btn.classList.toggle("sidebar__item--active", btn.getAttribute("data-view") === view || (view === "admin-log" && btn.getAttribute("data-view") === "admin"));
    });

    const meta = VIEW_META[view] || { title: view, subtitle: "" };
    el.viewTitle.textContent = meta.title;
    el.viewSubtitle.textContent = meta.subtitle;

    window.scrollTo({ top: 0 });
  }

  if (el.sidebarNav) {
    el.sidebarNav.addEventListener("click", (event) => {
      const btn = event.target.closest(".sidebar__item");
      if (!btn || btn.hidden) return;
      zeigeAnsicht(btn.getAttribute("data-view"));
    });
  }

  document.querySelectorAll("[data-quicklink]").forEach((btn) => {
    btn.addEventListener("click", () => zeigeAnsicht(btn.getAttribute("data-quicklink")));
  });

  document.querySelectorAll("[data-admin-subview]").forEach((btn) => {
    btn.addEventListener("click", () => zeigeAnsicht(btn.getAttribute("data-admin-subview")));
  });

  document.querySelectorAll("#bestellungen-tabs .tabs__tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      bestellungenStatusFilter = tab.getAttribute("data-status-filter");
      document.querySelectorAll("#bestellungen-tabs .tabs__tab").forEach((t) => t.classList.toggle("tabs__tab--active", t === tab));
      renderBestellungen();
    });
  });

  if (el.sidebarUserBtn) {
    el.sidebarUserBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      el.sidebarUserMenu.classList.toggle("sidebar__user-menu--visible");
    });
  }
  document.addEventListener("click", () => {
    el.sidebarUserMenu && el.sidebarUserMenu.classList.remove("sidebar__user-menu--visible");
    el.onlinePanel && el.onlinePanel.classList.remove("online-panel--visible");
  });
  if (el.onlineWidgetBtn) {
    el.onlineWidgetBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      el.onlinePanel.classList.toggle("online-panel--visible");
    });
  }

  /* ------------------------------------------------------------------------
     8. Presence / Online-Anzeige
     ------------------------------------------------------------------------ */
  function erzeugeSessionId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function starteHeartbeat() {
    if (!db || !aktuellerNutzer) return;
    sessionId = sessionId || erzeugeSessionId();
    const schreibe = () => {
      db.collection(PRESENCE_COLLECTION)
        .doc(sessionId)
        .set({ uid: aktuellerNutzer.uid, name: aktuellerNutzer.name, letztesUpdate: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(() => {});
    };
    schreibe();
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(schreibe, HEARTBEAT_INTERVALL_MS);

    if (unsubPresence) unsubPresence();
    unsubPresence = db.collection(PRESENCE_COLLECTION).onSnapshot(
      (snap) => {
        const jetzt = Date.now();
        const aktive = [];
        const gesehen = new Set();
        snap.forEach((docSnap) => {
          const daten = docSnap.data();
          if (!daten.letztesUpdate) return;
          const zeit = daten.letztesUpdate.toMillis ? daten.letztesUpdate.toMillis() : 0;
          if (jetzt - zeit > ONLINE_SCHWELLE_MS) return;
          if (gesehen.has(daten.uid)) return;
          gesehen.add(daten.uid);
          aktive.push(daten.name || "Unbekannt");
        });
        el.onlineCount.textContent = String(aktive.length);
        el.onlinePanelList.innerHTML =
          aktive.length === 0
            ? '<p class="online-panel__empty">Niemand sonst online.</p>'
            : aktive.map((name) => `<div class="online-panel__person">${escapeHtml(name)}</div>`).join("");
      },
      () => {}
    );
  }

  function stoppeHeartbeat() {
    clearInterval(heartbeatTimer);
    clearInterval(onlineRecomputeTimer);
    if (unsubPresence) {
      unsubPresence();
      unsubPresence = null;
    }
    if (sessionId && db) {
      db.collection(PRESENCE_COLLECTION).doc(sessionId).delete().catch(() => {});
    }
  }

  /* ------------------------------------------------------------------------
     9. Waren & Preise
     ------------------------------------------------------------------------ */
  function starteProdukteListener() {
    if (!db) return;
    if (unsubProdukte) unsubProdukte();
    unsubProdukte = db.collection(PRODUKTE_COLLECTION).onSnapshot(
      async (snap) => {
        if (snap.empty) {
          await seedeStandardprodukte();
          return;
        }
        produkte = [];
        snap.forEach((docSnap) => produkte.push({ id: docSnap.id, ...docSnap.data() }));
        produkte.sort((a, b) => (a.reihenfolge || 0) - (b.reihenfolge || 0) || a.name.localeCompare(b.name, "de"));
        befuelleProduktSelects();
        renderWaren();
        renderLager();
        renderHandelsrechner();
        renderUebersicht();
      },
      (fehler) => console.error("Waren konnten nicht geladen werden:", fehler)
    );
  }

  let produkteSeedLaeuft = false;
  async function seedeStandardprodukte() {
    if (produkteSeedLaeuft || !db) return;
    produkteSeedLaeuft = true;
    try {
      const batch = db.batch();
      DEFAULT_PRODUKTE.forEach((p) => {
        const ref = db.collection(PRODUKTE_COLLECTION).doc();
        batch.set(ref, p);
      });
      await batch.commit();
    } catch (fehler) {
      console.error("Standard-Waren konnten nicht angelegt werden:", fehler);
    } finally {
      produkteSeedLaeuft = false;
    }
  }

  function befuelleProduktSelects() {
    const optionsHtml = produkte.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("");
    [el.rechnerProdukt, el.bestellungProduktInput, el.verkaufProduktInput].forEach((select) => {
      if (!select) return;
      const vorher = select.value;
      select.innerHTML = optionsHtml || '<option value="">Keine Waren vorhanden</option>';
      if (vorher && produkte.some((p) => p.id === vorher)) select.value = vorher;
    });
  }

  function gefiltertProdukte() {
    const begriff = warenSuche.trim().toLowerCase();
    if (!begriff) return produkte;
    return produkte.filter((p) => p.name.toLowerCase().includes(begriff));
  }

  function renderWaren() {
    if (!el.warenTableBody) return;
    const liste = gefiltertProdukte();
    el.warenEmpty.hidden = produkte.length !== 0;
    el.warenNoResults.hidden = !(produkte.length > 0 && liste.length === 0);
    el.btnAddWare.hidden = !istAdmin();

    el.warenTableBody.innerHTML = liste
      .map((p) => {
        const aktionen = istAdmin()
          ? `<div class="row-actions">
               <button class="icon-btn" data-ware-edit="${p.id}" title="Bearbeiten">✎</button>
               <button class="icon-btn icon-btn--delete" data-ware-delete="${p.id}" title="Löschen">🗑</button>
             </div>`
          : "";
        return `<div class="reg-row reg-row--body waren-row">
            <span class="reg-name">${escapeHtml(p.name)}</span>
            <span>${formatGeld(p.verkaufspreis)}</span>
            <span>${p.einkaufspreis == null || p.einkaufspreis === "" ? "–" : formatGeld(p.einkaufspreis)}</span>
            <span class="reg-row__actions-col">${aktionen}</span>
          </div>`;
      })
      .join("");
  }

  if (el.warenSearch) {
    el.warenSearch.addEventListener("input", () => {
      warenSuche = el.warenSearch.value;
      renderWaren();
    });
  }

  if (el.btnAddWare) {
    el.btnAddWare.addEventListener("click", () => {
      el.modalWareTitel.textContent = "Neues Produkt";
      el.wareEditingId.value = "";
      el.wareNameInput.value = "";
      el.wareVerkaufspreisInput.value = "";
      el.wareEinkaufspreisInput.value = "";
      versteckeFeldFehler(el.wareError);
      oeffneModal("modal-ware");
    });
  }

  if (el.warenTableBody) {
    el.warenTableBody.addEventListener("click", (event) => {
      const editBtn = event.target.closest("[data-ware-edit]");
      const delBtn = event.target.closest("[data-ware-delete]");
      if (editBtn) {
        const p = produkte.find((x) => x.id === editBtn.getAttribute("data-ware-edit"));
        if (!p) return;
        el.modalWareTitel.textContent = "Produkt bearbeiten";
        el.wareEditingId.value = p.id;
        el.wareNameInput.value = p.name;
        el.wareVerkaufspreisInput.value = p.verkaufspreis;
        el.wareEinkaufspreisInput.value = p.einkaufspreis == null ? "" : p.einkaufspreis;
        versteckeFeldFehler(el.wareError);
        oeffneModal("modal-ware");
      } else if (delBtn) {
        const id = delBtn.getAttribute("data-ware-delete");
        const p = produkte.find((x) => x.id === id);
        fordereLoeschungAn("Produkt löschen", `Möchtest du „${p ? p.name : "dieses Produkt"}“ wirklich löschen?`, async () => {
          await db.collection(PRODUKTE_COLLECTION).doc(id).delete();
          zeigeToast("Produkt gelöscht.");
        });
      }
    });
  }

  if (el.btnConfirmWare) {
    el.btnConfirmWare.addEventListener("click", async () => {
      versteckeFeldFehler(el.wareError);
      const name = el.wareNameInput.value.trim();
      const vk = parseFloat(el.wareVerkaufspreisInput.value);
      const ekRoh = el.wareEinkaufspreisInput.value.trim();
      const ek = ekRoh === "" ? null : parseFloat(ekRoh);

      if (!name) return zeigeFeldFehler(el.wareError, "Bitte gib einen Produktnamen ein.");
      if (!isFinite(vk) || vk < 0) return zeigeFeldFehler(el.wareError, "Bitte gib einen gültigen Verkaufspreis ein.");

      const id = el.wareEditingId.value;
      try {
        if (id) {
          await db.collection(PRODUKTE_COLLECTION).doc(id).update({ name, verkaufspreis: vk, einkaufspreis: ek });
        } else {
          await db.collection(PRODUKTE_COLLECTION).add({
            name,
            verkaufspreis: vk,
            einkaufspreis: ek,
            lagerMenge: 0,
            reihenfolge: produkte.length + 1,
          });
        }
        schliesseModal("modal-ware");
        zeigeToast("Produkt gespeichert.");
      } catch (fehler) {
        zeigeFeldFehler(el.wareError, "Speichern fehlgeschlagen. Bitte erneut versuchen.");
        console.error(fehler);
      }
    });
  }

  /* ------------------------------------------------------------------------
     10. Bestellungen
     ------------------------------------------------------------------------ */
  function starteBestellungenListener() {
    if (!db) return;
    if (unsubBestellungen) unsubBestellungen();
    unsubBestellungen = db
      .collection(BESTELLUNGEN_COLLECTION)
      .orderBy("erstelltAm", "desc")
      .onSnapshot(
        (snap) => {
          bestellungen = [];
          snap.forEach((docSnap) => bestellungen.push({ id: docSnap.id, ...docSnap.data() }));
          renderBestellungen();
          renderUebersicht();
          renderStatistiken();
          befuelleUnternehmenDatalist();
        },
        (fehler) => console.error("Bestellungen konnten nicht geladen werden:", fehler)
      );
  }

  function gefilterteBestellungen() {
    let liste = bestellungen;
    if (bestellungenStatusFilter !== "alle") liste = liste.filter((b) => b.status === bestellungenStatusFilter);
    const begriff = bestellungenSuche.trim().toLowerCase();
    if (begriff) {
      liste = liste.filter(
        (b) => (b.unternehmen || "").toLowerCase().includes(begriff) || (b.produktName || "").toLowerCase().includes(begriff)
      );
    }
    return liste;
  }

  function renderBestellungen() {
    if (!el.bestellungenTableBody) return;
    const liste = gefilterteBestellungen();
    el.bestellungenEmpty.hidden = bestellungen.length !== 0;
    el.bestellungenNoResults.hidden = !(bestellungen.length > 0 && liste.length === 0);

    el.bestellungenTableBody.innerHTML = liste
      .map((b) => {
        const statusOptions = BESTELLUNG_STATUS.map((s) => `<option value="${s}" ${s === b.status ? "selected" : ""}>${s}</option>`).join("");
        return `<div class="reg-row reg-row--body bestellungen-row">
            <span class="reg-name">${escapeHtml(b.unternehmen || "—")}</span>
            <span>${escapeHtml(b.produktName || "—")}</span>
            <span>${b.menge != null ? b.menge : "—"} Stück</span>
            <span>${formatDatum(b.erstelltAm)}</span>
            <span>${b.deadline ? formatDatum(new Date(b.deadline)) : "—"}</span>
            <span><select class="field-input" style="padding:5px 8px;font-size:11.5px;" data-bestellung-status="${b.id}">${statusOptions}</select></span>
            <span class="notiz-text">${b.notiz ? escapeHtml(b.notiz) : "—"}</span>
            <span class="reg-row__actions-col">
              <div class="row-actions">
                <button class="icon-btn" data-bestellung-edit="${b.id}" title="Bearbeiten">✎</button>
                <button class="icon-btn icon-btn--delete" data-bestellung-delete="${b.id}" title="Löschen">🗑</button>
              </div>
            </span>
          </div>`;
      })
      .join("");
  }

  if (el.bestellungenSearch) {
    el.bestellungenSearch.addEventListener("input", () => {
      bestellungenSuche = el.bestellungenSearch.value;
      renderBestellungen();
    });
  }

  function oeffneBestellungModal(bestellung) {
    versteckeFeldFehler(el.bestellungError);
    el.modalBestellungTitel.textContent = bestellung ? "Bestellung bearbeiten" : "Neue Bestellung";
    el.bestellungEditingId.value = bestellung ? bestellung.id : "";
    el.bestellungUnternehmenInput.value = bestellung ? bestellung.unternehmen || "" : "";
    el.bestellungProduktInput.value = bestellung ? bestellung.produktId || "" : el.bestellungProduktInput.value;
    el.bestellungMengeInput.value = bestellung ? bestellung.menge : 1;
    el.bestellungDeadlineInput.value = bestellung && bestellung.deadline ? bestellung.deadline : "";
    el.bestellungStatusInput.value = bestellung ? bestellung.status : "Offen";
    el.bestellungNotizInput.value = bestellung ? bestellung.notiz || "" : "";
    oeffneModal("modal-bestellung");
  }

  if (el.btnAddBestellung) el.btnAddBestellung.addEventListener("click", () => oeffneBestellungModal(null));
  document.querySelectorAll('[data-action="neue-bestellung"]').forEach((btn) =>
    btn.addEventListener("click", () => oeffneBestellungModal(null))
  );

  if (el.bestellungenTableBody) {
    el.bestellungenTableBody.addEventListener("click", (event) => {
      const editBtn = event.target.closest("[data-bestellung-edit]");
      const delBtn = event.target.closest("[data-bestellung-delete]");
      if (editBtn) {
        const b = bestellungen.find((x) => x.id === editBtn.getAttribute("data-bestellung-edit"));
        if (b) oeffneBestellungModal(b);
      } else if (delBtn) {
        const id = delBtn.getAttribute("data-bestellung-delete");
        fordereLoeschungAn("Bestellung löschen", "Möchtest du diese Bestellung wirklich löschen?", async () => {
          await db.collection(BESTELLUNGEN_COLLECTION).doc(id).delete();
          zeigeToast("Bestellung gelöscht.");
        });
      }
    });
    el.bestellungenTableBody.addEventListener("change", (event) => {
      const select = event.target.closest("[data-bestellung-status]");
      if (!select) return;
      db.collection(BESTELLUNGEN_COLLECTION)
        .doc(select.getAttribute("data-bestellung-status"))
        .update({ status: select.value })
        .then(() => zeigeToast("Status aktualisiert."))
        .catch(() => zeigeToast("Status konnte nicht aktualisiert werden."));
    });
  }

  if (el.btnConfirmBestellung) {
    el.btnConfirmBestellung.addEventListener("click", async () => {
      versteckeFeldFehler(el.bestellungError);
      const unternehmen = el.bestellungUnternehmenInput.value.trim();
      const produktId = el.bestellungProduktInput.value;
      const produkt = produkte.find((p) => p.id === produktId);
      const menge = parseInt(el.bestellungMengeInput.value, 10);

      if (!unternehmen) return zeigeFeldFehler(el.bestellungError, "Bitte gib ein Unternehmen ein.");
      if (!produkt) return zeigeFeldFehler(el.bestellungError, "Bitte wähle ein Produkt aus.");
      if (!isFinite(menge) || menge < 1) return zeigeFeldFehler(el.bestellungError, "Bitte gib eine gültige Menge ein.");

      const daten = {
        unternehmen,
        produktId,
        produktName: produkt.name,
        menge,
        deadline: el.bestellungDeadlineInput.value || null,
        status: el.bestellungStatusInput.value,
        notiz: el.bestellungNotizInput.value.trim(),
      };

      try {
        const id = el.bestellungEditingId.value;
        if (id) {
          await db.collection(BESTELLUNGEN_COLLECTION).doc(id).update(daten);
        } else {
          daten.erstelltAm = firebase.firestore.FieldValue.serverTimestamp();
          daten.erstelltVon = aktuellerNutzer ? aktuellerNutzer.name : null;
          await db.collection(BESTELLUNGEN_COLLECTION).add(daten);
        }
        schliesseModal("modal-bestellung");
        zeigeToast("Bestellung gespeichert.");
      } catch (fehler) {
        zeigeFeldFehler(el.bestellungError, "Speichern fehlgeschlagen. Bitte erneut versuchen.");
        console.error(fehler);
      }
    });
  }

  /* ------------------------------------------------------------------------
     11. Handelsrechner
     ------------------------------------------------------------------------ */
  function aktuellesRechnerProdukt() {
    return produkte.find((p) => p.id === el.rechnerProdukt.value) || null;
  }

  function rechnerModus() {
    return el.rechnerModusPreisRadio && el.rechnerModusPreisRadio.checked ? "preis" : "rabatt";
  }

  function berechneHandelsrechner() {
    const produkt = aktuellesRechnerProdukt();
    const menge = Math.max(0, parseInt(el.rechnerMenge.value, 10) || 0);
    const standardpreis = produkt ? Number(produkt.verkaufspreis) : null;
    const ek = produkt && produkt.einkaufspreis != null && produkt.einkaufspreis !== "" ? Number(produkt.einkaufspreis) : null;

    let rabattProzent = 0;
    let neuerStueckpreis = standardpreis || 0;

    if (rechnerModus() === "preis") {
      const eingabe = parseFloat(el.rechnerPreisInput.value);
      neuerStueckpreis = isFinite(eingabe) ? eingabe : standardpreis || 0;
      rabattProzent = standardpreis ? (1 - neuerStueckpreis / standardpreis) * 100 : 0;
      el.rechnerRabattRange.value = Math.max(0, Math.min(100, Math.round(rabattProzent)));
      el.rechnerRabattInput.value = Math.round(rabattProzent * 10) / 10;
    } else {
      rabattProzent = Math.max(0, Math.min(100, parseFloat(el.rechnerRabattInput.value) || 0));
      neuerStueckpreis = (standardpreis || 0) * (1 - rabattProzent / 100);
    }

    const gesamtpreis = neuerStueckpreis * menge;
    const gewinnStueck = ek != null ? neuerStueckpreis - ek : null;
    const gesamtgewinn = gewinnStueck != null ? gewinnStueck * menge : null;
    const gewinnmarge = gewinnStueck != null && neuerStueckpreis > 0 ? (gewinnStueck / neuerStueckpreis) * 100 : null;

    el.rechnerStandardpreis.textContent = standardpreis != null ? formatGeld(standardpreis) : "–";
    el.rechnerEk.textContent = ek != null ? formatGeld(ek) : "–";
    el.rechnerNeuerStueckpreis.textContent = formatGeld(neuerStueckpreis);
    el.rechnerGesamtpreis.textContent = formatGeld(gesamtpreis);
    el.rechnerGewinnStueck.textContent = gewinnStueck != null ? formatGeld(gewinnStueck) : "–";
    el.rechnerGesamtgewinn.textContent = gesamtgewinn != null ? formatGeld(gesamtgewinn) : "–";
    el.rechnerGewinnmarge.textContent = gewinnmarge != null ? formatProzent(gewinnmarge) : "–";
    el.rechnerEkHinweis.hidden = ek != null;

    el.vorschauUnternehmen.textContent = el.rechnerUnternehmen.value.trim() || "—";
    el.vorschauProdukt.textContent = produkt ? produkt.name : "—";
    el.vorschauMenge.textContent = `${menge} Stück`;
    el.vorschauStandardpreis.textContent = standardpreis != null ? formatGeld(standardpreis) : "–";
    el.vorschauRabatt.textContent = formatProzent(rabattProzent, 0);
    el.vorschauNeuerPreis.textContent = formatGeld(neuerStueckpreis);
    el.vorschauGesamtpreis.textContent = formatGeld(gesamtpreis);

    return { produkt, menge, standardpreis, ek, rabattProzent, neuerStueckpreis, gesamtpreis, gewinnStueck, gesamtgewinn, gewinnmarge };
  }

  function renderHandelsrechner() {
    if (el.rechnerProdukt && !el.rechnerProdukt.value && produkte[0]) el.rechnerProdukt.value = produkte[0].id;
    berechneHandelsrechner();
    renderAngebote();
  }

  [el.rechnerUnternehmen, el.rechnerProdukt, el.rechnerMenge, el.rechnerPreisInput].forEach((input) => {
    if (input) input.addEventListener("input", berechneHandelsrechner);
  });
  if (el.rechnerProdukt) el.rechnerProdukt.addEventListener("change", berechneHandelsrechner);

  [el.rechnerModusRabattRadio, el.rechnerModusPreisRadio].forEach((radio) => {
    if (!radio) return;
    radio.addEventListener("change", () => {
      const modus = rechnerModus();
      el.rechnerModusRabattWrap.hidden = modus !== "rabatt";
      el.rechnerModusPreisWrap.hidden = modus !== "preis";
      berechneHandelsrechner();
    });
  });

  if (el.rechnerRabattRange) {
    el.rechnerRabattRange.addEventListener("input", () => {
      el.rechnerRabattInput.value = el.rechnerRabattRange.value;
      berechneHandelsrechner();
    });
  }
  if (el.rechnerRabattInput) {
    el.rechnerRabattInput.addEventListener("input", () => {
      const wert = Math.max(0, Math.min(100, parseFloat(el.rechnerRabattInput.value) || 0));
      el.rechnerRabattRange.value = wert;
      berechneHandelsrechner();
    });
  }
  if (el.rechnerRabattMinus) {
    el.rechnerRabattMinus.addEventListener("click", () => {
      el.rechnerRabattInput.value = Math.max(0, (parseFloat(el.rechnerRabattInput.value) || 0) - 1);
      el.rechnerRabattRange.value = el.rechnerRabattInput.value;
      berechneHandelsrechner();
    });
  }
  if (el.rechnerRabattPlus) {
    el.rechnerRabattPlus.addEventListener("click", () => {
      el.rechnerRabattInput.value = Math.min(100, (parseFloat(el.rechnerRabattInput.value) || 0) + 1);
      el.rechnerRabattRange.value = el.rechnerRabattInput.value;
      berechneHandelsrechner();
    });
  }

  if (el.btnRechnerReset) {
    el.btnRechnerReset.addEventListener("click", () => {
      el.rechnerUnternehmen.value = "";
      el.rechnerMenge.value = 1;
      el.rechnerModusRabattRadio.checked = true;
      el.rechnerModusRabattWrap.hidden = false;
      el.rechnerModusPreisWrap.hidden = true;
      el.rechnerRabattInput.value = 0;
      el.rechnerRabattRange.value = 0;
      el.rechnerPreisInput.value = "";
      berechneHandelsrechner();
    });
  }

  if (el.btnAngebotUebernehmen) {
    el.btnAngebotUebernehmen.addEventListener("click", async () => {
      const ergebnis = berechneHandelsrechner();
      const unternehmen = el.rechnerUnternehmen.value.trim();
      if (!unternehmen) return zeigeToast("Bitte gib ein Unternehmen ein.");
      if (!ergebnis.produkt) return zeigeToast("Bitte wähle ein Produkt aus.");
      if (!ergebnis.menge || ergebnis.menge < 1) return zeigeToast("Bitte gib eine gültige Menge ein.");

      try {
        await db.collection(ANGEBOTE_COLLECTION).add({
          unternehmen,
          produktId: ergebnis.produkt.id,
          produktName: ergebnis.produkt.name,
          menge: ergebnis.menge,
          rabattProzent: Math.round(ergebnis.rabattProzent * 10) / 10,
          stueckpreis: ergebnis.neuerStueckpreis,
          gesamtpreis: ergebnis.gesamtpreis,
          status: "Übernommen",
          erstelltAm: firebase.firestore.FieldValue.serverTimestamp(),
          erstelltVon: aktuellerNutzer ? aktuellerNutzer.name : null,
        });

        await db.collection(BESTELLUNGEN_COLLECTION).add({
          unternehmen,
          produktId: ergebnis.produkt.id,
          produktName: ergebnis.produkt.name,
          menge: ergebnis.menge,
          deadline: null,
          status: "Offen",
          notiz: `Aus Handelsrechner übernommen (${formatProzent(ergebnis.rabattProzent, 0)} Rabatt).`,
          erstelltAm: firebase.firestore.FieldValue.serverTimestamp(),
          erstelltVon: aktuellerNutzer ? aktuellerNutzer.name : null,
        });

        zeigeToast("Angebot als Bestellung übernommen.");
      } catch (fehler) {
        console.error(fehler);
        zeigeToast("Angebot konnte nicht übernommen werden.");
      }
    });
  }

  function starteAngeboteListener() {
    if (!db) return;
    if (unsubAngebote) unsubAngebote();
    unsubAngebote = db
      .collection(ANGEBOTE_COLLECTION)
      .orderBy("erstelltAm", "desc")
      .limit(10)
      .onSnapshot(
        (snap) => {
          angebote = [];
          snap.forEach((docSnap) => angebote.push({ id: docSnap.id, ...docSnap.data() }));
          renderAngebote();
        },
        (fehler) => console.error("Angebote konnten nicht geladen werden:", fehler)
      );
  }

  function renderAngebote() {
    if (!el.angeboteTableBody) return;
    el.angeboteEmpty.hidden = angebote.length !== 0;
    el.angeboteTableBody.innerHTML = angebote
      .map(
        (a) => `<div class="reg-row reg-row--body rechner-angebote-row">
          <span>${formatDatum(a.erstelltAm)}</span>
          <span class="reg-name">${escapeHtml(a.unternehmen)}</span>
          <span>${escapeHtml(a.produktName)}</span>
          <span>${a.menge}</span>
          <span>${formatProzent(a.rabattProzent, 1)}</span>
          <span>${formatGeld(a.stueckpreis)}</span>
          <span>${formatGeld(a.gesamtpreis)}</span>
          <span><span class="status-pill ${statusPillKlasse(a.status)}">${escapeHtml(a.status)}</span></span>
        </div>`
      )
      .join("");
  }

  /* ------------------------------------------------------------------------
     12. Kontakte
     ------------------------------------------------------------------------ */
  function starteKontakteRollenListener() {
    if (!db) return;
    if (unsubKontakteRollen) unsubKontakteRollen();
    unsubKontakteRollen = db.doc(KONTAKTE_ROLLEN_DOC).onSnapshot(
      async (snap) => {
        if (!snap.exists) {
          await db.doc(KONTAKTE_ROLLEN_DOC).set({ rollen: DEFAULT_KONTAKTE_ROLLEN }).catch(() => {});
          return;
        }
        kontakteRollenKatalog = snap.data().rollen || DEFAULT_KONTAKTE_ROLLEN;
        befuelleKontakteRollenSelects();
        renderKontakteRollenVerwaltung();
        renderKontakte();
      },
      (fehler) => console.error("Rollen-Katalog konnte nicht geladen werden:", fehler)
    );
  }

  function befuelleKontakteRollenSelects() {
    const optionsHtml = kontakteRollenKatalog.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
    [el.kontaktBerufInput, el.kontaktEditRolle].forEach((select) => {
      if (!select) return;
      const vorher = select.value;
      select.innerHTML = optionsHtml;
      if (vorher && kontakteRollenKatalog.includes(vorher)) select.value = vorher;
    });
  }

  function renderKontakteRollenVerwaltung() {
    if (!el.btnToggleKontakteRollen) return;
    el.btnToggleKontakteRollen.hidden = !istAdmin();
    if (!istAdmin()) {
      el.kontakteRollenVerwaltung.hidden = true;
      return;
    }
    el.kontakteRollenVerwaltung.hidden = !kontakteRollenVerwaltungOffen;
    el.kontakteRollenVerwaltung.innerHTML = `
      <div class="katalog-zeile" style="flex-wrap:wrap;">
        ${kontakteRollenKatalog
          .map(
            (r) => `<span class="kontakt-badge" style="margin-right:4px;">${escapeHtml(r)}${
              r === KONTAKTE_ROLLEN_FALLBACK ? "" : ` <button type="button" data-rolle-entfernen="${escapeHtml(r)}" style="margin-left:6px;font-weight:700;">✕</button>`
            }</span>`
          )
          .join("")}
      </div>
      <div class="katalog-zeile" style="border:none;padding:0;margin:0;">
        <input type="text" id="neue-kontakte-rolle-input" class="field-input" placeholder="Neue Rolle..." style="flex:1;" />
        <button type="button" class="btn btn--ghost btn--sm" id="btn-neue-kontakte-rolle">Hinzufügen</button>
      </div>`;
  }

  if (el.btnToggleKontakteRollen) {
    el.btnToggleKontakteRollen.addEventListener("click", () => {
      kontakteRollenVerwaltungOffen = !kontakteRollenVerwaltungOffen;
      renderKontakteRollenVerwaltung();
    });
  }

  if (el.kontakteRollenVerwaltung) {
    el.kontakteRollenVerwaltung.addEventListener("click", async (event) => {
      const entfernenBtn = event.target.closest("[data-rolle-entfernen]");
      if (entfernenBtn) {
        const rolle = entfernenBtn.getAttribute("data-rolle-entfernen");
        const neueListe = kontakteRollenKatalog.filter((r) => r !== rolle);
        await db.doc(KONTAKTE_ROLLEN_DOC).update({ rollen: neueListe });
        const batch = db.batch();
        kontakte.filter((k) => k.rolle === rolle).forEach((k) => batch.update(db.collection(KONTAKTE_COLLECTION).doc(k.id), { rolle: KONTAKTE_ROLLEN_FALLBACK }));
        await batch.commit().catch(() => {});
        return;
      }
      if (event.target.id === "btn-neue-kontakte-rolle") {
        const input = document.getElementById("neue-kontakte-rolle-input");
        const wert = input.value.trim();
        if (!wert) return;
        if (kontakteRollenKatalog.includes(wert)) return zeigeToast("Diese Rolle gibt es bereits.");
        const neueListe = [...kontakteRollenKatalog.filter((r) => r !== KONTAKTE_ROLLEN_FALLBACK), wert, KONTAKTE_ROLLEN_FALLBACK];
        await db.doc(KONTAKTE_ROLLEN_DOC).update({ rollen: neueListe });
      }
    });
  }

  function starteKontakteListener() {
    if (!db) return;
    if (unsubKontakte) unsubKontakte();
    unsubKontakte = db.collection(KONTAKTE_COLLECTION).onSnapshot(
      (snap) => {
        kontakte = [];
        snap.forEach((docSnap) => kontakte.push({ id: docSnap.id, ...docSnap.data() }));
        kontakte.sort((a, b) => (a.nummer || "").localeCompare(b.nummer || "", undefined, { numeric: true }));
        renderKontakte();
        renderUebersicht();
        befuelleUnternehmenDatalist();
      },
      (fehler) => console.error("Kontakte konnten nicht geladen werden:", fehler)
    );
  }

  function gefiltertKontakte() {
    const begriff = kontakteSuche.trim().toLowerCase();
    if (!begriff) return kontakte;
    return kontakte.filter(
      (k) => (k.name || "").toLowerCase().includes(begriff) || (k.nummer || "").includes(begriff) || (k.notiz || "").toLowerCase().includes(begriff)
    );
  }

  function renderKontakte() {
    if (!el.kontaktList) return;
    const liste = gefiltertKontakte();
    el.kontakteEmpty.hidden = kontakte.length !== 0;
    el.kontakteNoResults.hidden = !(kontakte.length > 0 && liste.length === 0);

    el.kontaktList.innerHTML = liste
      .map(
        (k) => `<div class="reg-row reg-row--body kontakt-row">
          <span class="kontakt-tel" data-kontakt-copy="BW-${escapeHtml(k.nummer)}" title="Kopieren">BW-${escapeHtml(k.nummer)}</span>
          <span class="reg-name">${escapeHtml(k.name)}</span>
          <span><span class="kontakt-badge">${escapeHtml(k.rolle || KONTAKTE_ROLLEN_FALLBACK)}</span></span>
          <span class="notiz-text">${k.notiz ? escapeHtml(k.notiz) : "—"}</span>
          <span class="reg-row__actions-col">
            <div class="row-actions">
              <button class="icon-btn" data-kontakt-edit="${k.id}" title="Bearbeiten">✎</button>
              <button class="icon-btn icon-btn--delete" data-kontakt-delete="${k.id}" title="Löschen">🗑</button>
            </div>
          </span>
        </div>`
      )
      .join("");
  }

  if (el.kontakteSearch) {
    el.kontakteSearch.addEventListener("input", () => {
      kontakteSuche = el.kontakteSearch.value;
      renderKontakte();
    });
  }

  if (el.kontaktList) {
    el.kontaktList.addEventListener("click", (event) => {
      const copyEl = event.target.closest("[data-kontakt-copy]");
      const editBtn = event.target.closest("[data-kontakt-edit]");
      const delBtn = event.target.closest("[data-kontakt-delete]");
      if (copyEl) {
        navigator.clipboard && navigator.clipboard.writeText(copyEl.getAttribute("data-kontakt-copy")).then(() => zeigeToast("Telegrammnummer kopiert."));
      } else if (editBtn) {
        const k = kontakte.find((x) => x.id === editBtn.getAttribute("data-kontakt-edit"));
        if (!k) return;
        el.kontaktEditId.value = k.id;
        el.kontaktEditNummer.value = k.nummer;
        el.kontaktEditName.value = k.name;
        el.kontaktEditRolle.value = k.rolle || KONTAKTE_ROLLEN_FALLBACK;
        el.kontaktEditNotiz.value = k.notiz || "";
        versteckeFeldFehler(el.kontaktEditError);
        oeffneModal("modal-kontakt-edit");
      } else if (delBtn) {
        const id = delBtn.getAttribute("data-kontakt-delete");
        fordereLoeschungAn("Kontakt löschen", "Möchtest du diesen Kontakt wirklich löschen?", async () => {
          await db.collection(KONTAKTE_COLLECTION).doc(id).delete();
          zeigeToast("Kontakt gelöscht.");
        });
      }
    });
  }

  if (el.formKontakt) {
    el.formKontakt.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nummer = el.kontaktNummerInput.value.trim();
      const name = el.kontaktNameInput.value.trim();
      const rolle = el.kontaktBerufInput.value;
      const notiz = el.kontaktNotizInput.value.trim();
      if (!nummer || !name) return zeigeToast("Bitte Telegrammnummer und Name eintragen.");

      try {
        await db.collection(KONTAKTE_COLLECTION).add({ nummer, name, rolle, notiz, erstelltAm: firebase.firestore.FieldValue.serverTimestamp() });
        el.formKontakt.reset();
        zeigeToast("Kontakt hinzugefügt.");
      } catch (fehler) {
        console.error(fehler);
        zeigeToast("Kontakt konnte nicht gespeichert werden.");
      }
    });
  }

  if (el.btnConfirmKontaktEdit) {
    el.btnConfirmKontaktEdit.addEventListener("click", async () => {
      versteckeFeldFehler(el.kontaktEditError);
      const id = el.kontaktEditId.value;
      const nummer = el.kontaktEditNummer.value.trim();
      const name = el.kontaktEditName.value.trim();
      if (!nummer || !name) return zeigeFeldFehler(el.kontaktEditError, "Bitte Telegrammnummer und Name eintragen.");
      try {
        await db
          .collection(KONTAKTE_COLLECTION)
          .doc(id)
          .update({ nummer, name, rolle: el.kontaktEditRolle.value, notiz: el.kontaktEditNotiz.value.trim() });
        schliesseModal("modal-kontakt-edit");
        zeigeToast("Kontakt gespeichert.");
      } catch (fehler) {
        zeigeFeldFehler(el.kontaktEditError, "Speichern fehlgeschlagen.");
        console.error(fehler);
      }
    });
  }

  function befuelleUnternehmenDatalist() {
    if (!el.unternehmenListe) return;
    const namen = new Set();
    kontakte.forEach((k) => k.name && namen.add(k.name));
    bestellungen.forEach((b) => b.unternehmen && namen.add(b.unternehmen));
    verkaeufe.forEach((v) => v.unternehmen && namen.add(v.unternehmen));
    el.unternehmenListe.innerHTML = Array.from(namen)
      .map((n) => `<option value="${escapeHtml(n)}"></option>`)
      .join("");
  }

  /* ------------------------------------------------------------------------
     13. Lager
     ------------------------------------------------------------------------ */
  function gefiltertLager() {
    const begriff = lagerSuche.trim().toLowerCase();
    if (!begriff) return produkte;
    return produkte.filter((p) => p.name.toLowerCase().includes(begriff));
  }

  function renderLager() {
    if (!el.lagerTableBody) return;
    const liste = gefiltertLager();
    el.lagerEmpty.hidden = produkte.length !== 0;
    let gesamtwert = 0;

    el.lagerTableBody.innerHTML = liste
      .map((p) => {
        const menge = p.lagerMenge || 0;
        const wert = menge * (p.verkaufspreis || 0);
        gesamtwert += wert;
        return `<div class="reg-row reg-row--body" style="grid-template-columns: 34fr 20fr 22fr 24fr;">
            <span class="reg-name">${escapeHtml(p.name)}</span>
            <span><input type="number" class="field-input" style="padding:6px 8px; max-width:100px;" min="0" step="1" value="${menge}" data-lager-menge="${p.id}" /></span>
            <span>${formatGeld(p.verkaufspreis)}</span>
            <span>${formatGeld(wert)}</span>
          </div>`;
      })
      .join("");

    const gesamtLagerwert = produkte.reduce((sum, p) => sum + (p.lagerMenge || 0) * (p.verkaufspreis || 0), 0);
    el.lagerGesamtwert.textContent = formatGeld(gesamtLagerwert);
    el.statLagerwert.textContent = formatGeld(gesamtLagerwert);
  }

  if (el.lagerSearch) {
    el.lagerSearch.addEventListener("input", () => {
      lagerSuche = el.lagerSearch.value;
      renderLager();
    });
  }

  if (el.lagerTableBody) {
    el.lagerTableBody.addEventListener("change", (event) => {
      const input = event.target.closest("[data-lager-menge]");
      if (!input) return;
      const menge = Math.max(0, parseInt(input.value, 10) || 0);
      db.collection(PRODUKTE_COLLECTION)
        .doc(input.getAttribute("data-lager-menge"))
        .update({ lagerMenge: menge })
        .then(() => zeigeToast("Lagerbestand aktualisiert."))
        .catch(() => zeigeToast("Aktualisierung fehlgeschlagen."));
    });
  }

  /* ------------------------------------------------------------------------
     14. Verkäufe
     ------------------------------------------------------------------------ */
  function starteVerkaeufeListener() {
    if (!db) return;
    if (unsubVerkaeufe) unsubVerkaeufe();
    unsubVerkaeufe = db
      .collection(VERKAEUFE_COLLECTION)
      .orderBy("datum", "desc")
      .limit(200)
      .onSnapshot(
        (snap) => {
          verkaeufe = [];
          snap.forEach((docSnap) => verkaeufe.push({ id: docSnap.id, ...docSnap.data() }));
          renderVerkaeufe();
          renderUebersicht();
          renderStatistiken();
          befuelleUnternehmenDatalist();
        },
        (fehler) => console.error("Verkäufe konnten nicht geladen werden:", fehler)
      );
  }

  if (el.verkaufProduktInput) {
    el.verkaufProduktInput.addEventListener("change", () => {
      const p = produkte.find((x) => x.id === el.verkaufProduktInput.value);
      if (p && !el.verkaufPreisInput.value) el.verkaufPreisInput.value = p.verkaufspreis;
      if (p) el.verkaufPreisInput.value = p.verkaufspreis;
    });
  }

  if (el.formVerkauf) {
    el.formVerkauf.addEventListener("submit", async (event) => {
      event.preventDefault();
      const unternehmen = el.verkaufUnternehmenInput.value.trim();
      const produkt = produkte.find((p) => p.id === el.verkaufProduktInput.value);
      const menge = parseInt(el.verkaufMengeInput.value, 10);
      const preis = parseFloat(el.verkaufPreisInput.value);

      if (!unternehmen) return zeigeToast("Bitte Unternehmen/Kunde eintragen.");
      if (!produkt) return zeigeToast("Bitte ein Produkt wählen.");
      if (!isFinite(menge) || menge < 1) return zeigeToast("Bitte eine gültige Menge eintragen.");
      if (!isFinite(preis) || preis < 0) return zeigeToast("Bitte einen gültigen Preis eintragen.");

      try {
        await db.collection(VERKAEUFE_COLLECTION).add({
          unternehmen,
          produktId: produkt.id,
          produktName: produkt.name,
          menge,
          preisProStueck: preis,
          summe: preis * menge,
          datum: firebase.firestore.FieldValue.serverTimestamp(),
          erstelltVon: aktuellerNutzer ? aktuellerNutzer.name : null,
        });
        await db
          .collection(PRODUKTE_COLLECTION)
          .doc(produkt.id)
          .update({ lagerMenge: firebase.firestore.FieldValue.increment(-menge) })
          .catch(() => {});
        el.formVerkauf.reset();
        el.verkaufMengeInput.value = 1;
        zeigeToast("Verkauf eingetragen.");
      } catch (fehler) {
        console.error(fehler);
        zeigeToast("Verkauf konnte nicht gespeichert werden.");
      }
    });
  }

  function gefiltertVerkaeufe() {
    const begriff = verkaeufeSuche.trim().toLowerCase();
    if (!begriff) return verkaeufe;
    return verkaeufe.filter((v) => (v.unternehmen || "").toLowerCase().includes(begriff) || (v.produktName || "").toLowerCase().includes(begriff));
  }

  function renderVerkaeufe() {
    if (!el.verkaeufeTableBody) return;
    const liste = gefiltertVerkaeufe();
    el.verkaeufeEmpty.hidden = verkaeufe.length !== 0;

    el.verkaeufeTableBody.innerHTML = liste
      .slice(0, 100)
      .map(
        (v) => `<div class="reg-row reg-row--body" style="grid-template-columns: 16fr 18fr 20fr 12fr 14fr 14fr 10fr;">
          <span>${formatDatumUhrzeit(v.datum)}</span>
          <span class="reg-name">${escapeHtml(v.unternehmen)}</span>
          <span>${escapeHtml(v.produktName)}</span>
          <span>${v.menge}</span>
          <span>${formatGeld(v.preisProStueck)}</span>
          <span>${formatGeld(v.summe)}</span>
          <span class="reg-row__actions-col">${istAdmin() ? `<button class="icon-btn icon-btn--delete" data-verkauf-delete="${v.id}" title="Löschen">🗑</button>` : ""}</span>
        </div>`
      )
      .join("");
  }

  if (el.verkaeufeSearch) {
    el.verkaeufeSearch.addEventListener("input", () => {
      verkaeufeSuche = el.verkaeufeSearch.value;
      renderVerkaeufe();
    });
  }

  if (el.verkaeufeTableBody) {
    el.verkaeufeTableBody.addEventListener("click", (event) => {
      const delBtn = event.target.closest("[data-verkauf-delete]");
      if (!delBtn) return;
      const id = delBtn.getAttribute("data-verkauf-delete");
      const v = verkaeufe.find((x) => x.id === id);
      fordereLoeschungAn("Verkauf löschen", "Möchtest du diesen Verkauf wirklich löschen? Die Menge wird dem Lager wieder gutgeschrieben.", async () => {
        await db.collection(VERKAEUFE_COLLECTION).doc(id).delete();
        if (v && v.produktId) {
          await db
            .collection(PRODUKTE_COLLECTION)
            .doc(v.produktId)
            .update({ lagerMenge: firebase.firestore.FieldValue.increment(v.menge) })
            .catch(() => {});
        }
        zeigeToast("Verkauf gelöscht.");
      });
    });
  }

  /* ------------------------------------------------------------------------
     15. Statistiken
     ------------------------------------------------------------------------ */
  function renderStatistiken() {
    if (!el.statVerkaeufeAnzahl) return;
    el.statVerkaeufeAnzahl.textContent = String(verkaeufe.length);
    el.statUmsatzGesamt.textContent = formatGeld(verkaeufe.reduce((sum, v) => sum + (v.summe || 0), 0));
    el.statBestellungenGesamt.textContent = String(bestellungen.length);
    el.statStatOffene.textContent = String(bestellungen.filter((b) => b.status !== "Abgeschlossen").length);

    const proWare = {};
    const proKunde = {};
    verkaeufe.forEach((v) => {
      proWare[v.produktName] = (proWare[v.produktName] || 0) + (v.menge || 0);
      proKunde[v.unternehmen] = (proKunde[v.unternehmen] || 0) + (v.summe || 0);
    });

    const topWaren = Object.entries(proWare)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const topKunden = Object.entries(proKunde)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    el.statistikTopWarenEmpty.hidden = topWaren.length !== 0;
    el.statistikTopWaren.innerHTML = topWaren
      .map(
        ([name, menge], index) =>
          `<div class="dash-mini-row"><div class="dash-mini-row__top"><span>${index + 1}. ${escapeHtml(name)}</span><span>${menge} Stück</span></div></div>`
      )
      .join("");

    el.statistikTopKundenEmpty.hidden = topKunden.length !== 0;
    el.statistikTopKunden.innerHTML = topKunden
      .map(
        ([name, summe], index) =>
          `<div class="dash-mini-row"><div class="dash-mini-row__top"><span>${index + 1}. ${escapeHtml(name)}</span><span>${formatGeld(summe)}</span></div></div>`
      )
      .join("");
  }

  /* ------------------------------------------------------------------------
     16. Übersicht (Dashboard)
     ------------------------------------------------------------------------ */
  function renderUebersicht() {
    if (!el.dashOffeneBestellungen) return;

    const offen = bestellungen.filter((b) => b.status !== "Abgeschlossen");
    el.statOffeneBestellungen.textContent = String(offen.length);
    el.statOffeneBestellungenSub.textContent = `${offen.length} Bestellung${offen.length === 1 ? "" : "en"} zu erledigen`;

    const heutigeVerkaeufe = verkaeufe.filter((v) => istHeute(v.datum));
    const heuteSumme = heutigeVerkaeufe.reduce((sum, v) => sum + (v.summe || 0), 0);
    el.statHeuteVerkauft.textContent = formatGeld(heuteSumme);
    el.statHeuteVerkauftSub.textContent = `Aus ${heutigeVerkaeufe.length} Verkauf${heutigeVerkaeufe.length === 1 ? "" : "en"}`;

    const produkteById = {};
    produkte.forEach((p) => (produkteById[p.id] = p));
    const monatsGewinn = verkaeufe
      .filter((v) => istDiesenMonat(v.datum))
      .reduce((sum, v) => {
        const p = produkteById[v.produktId];
        const ek = p && p.einkaufspreis != null ? p.einkaufspreis : 0;
        return sum + ((v.preisProStueck || 0) - ek) * (v.menge || 0);
      }, 0);
    el.statGesamtgewinn.textContent = formatGeld(monatsGewinn);

    const gesamtLagerwert = produkte.reduce((sum, p) => sum + (p.lagerMenge || 0) * (p.verkaufspreis || 0), 0);
    el.statLagerwert.textContent = formatGeld(gesamtLagerwert);

    el.dashOffeneBestellungenEmpty.hidden = offen.length !== 0;
    el.dashOffeneBestellungen.innerHTML = offen
      .slice(0, 6)
      .map(
        (b) => `<div class="dash-mini-row">
          <div class="dash-mini-row__top"><span>${escapeHtml(b.unternehmen)}</span><span class="status-pill ${statusPillKlasse(b.status)}">${escapeHtml(b.status)}</span></div>
          <div class="dash-mini-row__bottom"><span>${escapeHtml(b.produktName)} · ${b.menge} Stück</span><span>${b.deadline ? formatDatum(new Date(b.deadline)) : ""}</span></div>
        </div>`
      )
      .join("");

    el.dashKuerzlicheVerkaeufeEmpty.hidden = verkaeufe.length !== 0;
    el.dashKuerzlicheVerkaeufe.innerHTML = verkaeufe
      .slice(0, 6)
      .map(
        (v) => `<div class="dash-mini-row">
          <div class="dash-mini-row__top"><span>${escapeHtml(v.unternehmen)}</span><span>${formatGeld(v.summe)}</span></div>
          <div class="dash-mini-row__bottom"><span>${escapeHtml(v.produktName)} · ${v.menge} Stück</span><span>${formatDatum(v.datum)}</span></div>
        </div>`
      )
      .join("");

    el.dashWichtigeKontakteEmpty.hidden = kontakte.length !== 0;
    el.dashWichtigeKontakte.innerHTML = kontakte
      .slice(0, 6)
      .map(
        (k) => `<div class="dash-mini-row">
          <div class="dash-mini-row__top"><span>${escapeHtml(k.name)}</span><span>BW-${escapeHtml(k.nummer)}</span></div>
          <div class="dash-mini-row__bottom"><span>${escapeHtml(k.rolle || KONTAKTE_ROLLEN_FALLBACK)}</span><span></span></div>
        </div>`
      )
      .join("");
  }

  /* ------------------------------------------------------------------------
     17. Einstellungen (Standard-Startseite)
     ------------------------------------------------------------------------ */
  const STARTSEITE_KEY = "hornhausenHof.startseite";

  if (el.startseiteSelect) {
    el.startseiteSelect.addEventListener("change", () => {
      localStorage.setItem(STARTSEITE_KEY, el.startseiteSelect.value);
      zeigeToast("Standard-Startseite gespeichert.");
    });
  }

  function ladeStartseite() {
    const gespeichert = localStorage.getItem(STARTSEITE_KEY);
    if (el.startseiteSelect && gespeichert) el.startseiteSelect.value = gespeichert;
    return gespeichert && VIEW_META[gespeichert] ? gespeichert : "uebersicht";
  }

  /* ------------------------------------------------------------------------
     18. Verwaltung (Benutzerverwaltung + Aktivitäts-Log)
     ------------------------------------------------------------------------ */
  function starteBenutzerverwaltung() {
    if (!window.BenutzerVerwaltung || !istAdmin()) return;
    if (unsubBenutzerliste) unsubBenutzerliste();
    unsubBenutzerliste = window.BenutzerVerwaltung.onListe((liste) => {
      benutzerListe = liste;
      const pendingUids = liste.filter((b) => b.status === "pending").map((b) => b.uid);

      if (bekanntePendingUids !== null) {
        const neu = pendingUids.filter((uid) => !bekanntePendingUids.includes(uid));
        if (neu.length > 0) zeigeToast(`${neu.length} neue Registrierung${neu.length === 1 ? "" : "en"} wartet auf Freigabe.`);
      }
      bekanntePendingUids = pendingUids;

      el.navAdminBadge.hidden = pendingUids.length === 0;
      el.navAdminBadge.textContent = String(pendingUids.length);

      renderBenutzerverwaltung();
      if (aktiverDetailUid) renderBenutzerDetails(aktiverDetailUid);
    });

    if (unsubAdminLog) unsubAdminLog();
    unsubAdminLog = window.BenutzerVerwaltung.onLog((liste) => {
      adminLogEintraege = liste;
      renderAdminLog();
    });
  }

  function stoppeBenutzerverwaltung() {
    if (unsubBenutzerliste) {
      unsubBenutzerliste();
      unsubBenutzerliste = null;
    }
    if (unsubAdminLog) {
      unsubAdminLog();
      unsubAdminLog = null;
    }
    bekanntePendingUids = null;
  }

  function gefiltertBenutzer() {
    const begriff = benutzerSuche.trim().toLowerCase();
    if (!begriff) return benutzerListe;
    return benutzerListe.filter((b) => (b.username || "").toLowerCase().includes(begriff) || (b.email || "").toLowerCase().includes(begriff));
  }

  function renderBenutzerverwaltung() {
    if (!el.benutzerverwaltungListe) return;
    const liste = gefiltertBenutzer();
    el.benutzerverwaltungListe.innerHTML = liste
      .map((b) => {
        const statusLabel = b.status === "pending" ? "Wartet auf Freigabe" : b.status === "rejected" ? "Abgelehnt" : b.status === "locked" ? "Gesperrt" : "";
        return `<div class="settings-list__item" data-benutzer-oeffnen="${b.uid}">
          <div>
            <span class="settings-list__name">${escapeHtml(b.username || "Unbekannt")}</span>
            <span class="settings-list__role">${escapeHtml(b.rolle || "—")}</span>
            ${b.isAdmin ? '<span class="settings-list__protected">Verwalter</span>' : ""}
            ${statusLabel ? `<span class="settings-list__wartet">${statusLabel}</span>` : ""}
          </div>
          <span style="opacity:.5;">›</span>
        </div>`;
      })
      .join("");
  }

  if (el.benutzerverwaltungSearchInput) {
    el.benutzerverwaltungSearchInput.addEventListener("input", () => {
      benutzerSuche = el.benutzerverwaltungSearchInput.value;
      renderBenutzerverwaltung();
    });
  }

  if (el.benutzerverwaltungListe) {
    el.benutzerverwaltungListe.addEventListener("click", (event) => {
      const zeile = event.target.closest("[data-benutzer-oeffnen]");
      if (!zeile) return;
      aktiverDetailUid = zeile.getAttribute("data-benutzer-oeffnen");
      renderBenutzerDetails(aktiverDetailUid);
      oeffneModal("modal-benutzer-details");
    });
  }

  function renderBenutzerDetails(uid) {
    const b = benutzerListe.find((x) => x.uid === uid);
    if (!b) return;
    el.benutzerDetailsName.textContent = b.username || "Unbekannt";

    const rangOptions = BENUTZER_RAENGE.map((r) => `<option value="${r}" ${r === b.rolle ? "selected" : ""}>${r}</option>`).join("");

    el.benutzerDetailsBody.innerHTML = `
      <div class="detail-grid">
        ${
          b.status === "pending"
            ? `<div class="detail-row"><span class="detail-row__label">Registrierung</span>
                <button class="btn btn--primary btn--sm" data-benutzer-aktion="freigeben">Freigeben</button>
                <button class="btn btn--danger btn--sm" data-benutzer-aktion="ablehnen">Ablehnen</button></div>`
            : ""
        }
        <div class="detail-row"><span class="detail-row__label">Rang</span>
          <select class="field-input" id="detail-rolle-select" style="max-width:220px;">${rangOptions}</select></div>
        <div class="detail-row"><span class="detail-row__label">Verwalterrechte</span>
          <label class="field-checkbox-row"><input type="checkbox" id="detail-admin-checkbox" ${b.isAdmin ? "checked" : ""}/> Verwalter</label></div>
        <div class="detail-row"><span class="detail-row__label">Status</span>
          ${
            b.status === "locked"
              ? `<button class="btn btn--ghost btn--sm" data-benutzer-aktion="entsperren">Entsperren</button>`
              : `<select class="field-input" id="detail-sperr-dauer" style="max-width:150px;">
                   <option value="0">Dauerhaft</option>
                   <option value="1">1 Tag</option>
                   <option value="7">7 Tage</option>
                   <option value="30">30 Tage</option>
                 </select>
                 <button class="btn btn--danger btn--sm" data-benutzer-aktion="sperren">Sperren</button>`
          }
        </div>
        <div class="detail-row"><span class="detail-row__label">Umbenennen</span>
          <input type="text" class="field-input" id="detail-name-input" value="${escapeHtml(b.username || "")}" style="max-width:220px;" />
          <button class="btn btn--ghost btn--sm" data-benutzer-aktion="umbenennen">Speichern</button></div>
        <div class="detail-row"><span class="detail-row__label">Notiz</span>
          <input type="text" class="field-input" id="detail-notiz-input" value="${escapeHtml(b.adminNote || "")}" style="flex:1;" /></div>
        ${
          b.email
            ? `<div class="detail-row"><span class="detail-row__label">Passwort</span>
                <button class="btn btn--ghost btn--sm" data-benutzer-aktion="passwort-reset">Zurücksetzen-E-Mail senden</button></div>`
            : ""
        }
        <div class="detail-row"><span class="detail-row__label">Registriert</span><span>${formatDatumUhrzeit(b.createdAt)}</span></div>
        <div class="detail-row"><span class="detail-row__label">Letzter Login</span><span>${formatDatumUhrzeit(b.lastLogin)}</span></div>
        <div class="detail-row" style="justify-content:flex-end; border-top:1px solid var(--parch-edge); padding-top:14px;">
          <button class="btn btn--danger btn--sm" data-benutzer-aktion="loeschen">Benutzer löschen</button>
        </div>
      </div>`;

    const rolleSelect = document.getElementById("detail-rolle-select");
    if (rolleSelect) rolleSelect.addEventListener("change", () => window.BenutzerVerwaltung.setzeRolle(uid, rolleSelect.value, b.username));

    const adminCheckbox = document.getElementById("detail-admin-checkbox");
    if (adminCheckbox) adminCheckbox.addEventListener("change", () => window.BenutzerVerwaltung.setzeAdmin(uid, adminCheckbox.checked, b.username));

    const notizInput = document.getElementById("detail-notiz-input");
    if (notizInput)
      notizInput.addEventListener("change", () => window.BenutzerVerwaltung.setzeNotiz(uid, notizInput.value.trim()));

    el.benutzerDetailsBody.querySelectorAll("[data-benutzer-aktion]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const aktion = btn.getAttribute("data-benutzer-aktion");
        try {
          if (aktion === "freigeben") await window.BenutzerVerwaltung.setzeStatus(uid, "approved", b.username);
          else if (aktion === "ablehnen") await window.BenutzerVerwaltung.setzeStatus(uid, "rejected", b.username);
          else if (aktion === "entsperren") await window.BenutzerVerwaltung.entsperreBenutzer(uid, b.username);
          else if (aktion === "sperren") {
            const tage = parseInt(document.getElementById("detail-sperr-dauer").value, 10);
            await window.BenutzerVerwaltung.sperreBenutzer(uid, tage, b.username);
          } else if (aktion === "umbenennen") {
            const neuerName = document.getElementById("detail-name-input").value.trim();
            if (neuerName && neuerName !== b.username) await window.BenutzerVerwaltung.benenneUm(uid, neuerName, b.username);
          } else if (aktion === "passwort-reset") {
            await window.BenutzerVerwaltung.sendePasswortReset(b.email, uid, b.username);
            zeigeToast("Passwort-Zurücksetzen-E-Mail versendet.");
          } else if (aktion === "loeschen") {
            schliesseModal("modal-benutzer-details");
            fordereLoeschungAn("Benutzer löschen", `Möchtest du „${b.username}“ wirklich endgültig löschen?`, async () => {
              await window.BenutzerVerwaltung.loesche(uid);
              aktiverDetailUid = null;
              zeigeToast("Benutzer gelöscht.");
            });
          }
        } catch (fehler) {
          zeigeToast(fehler.message || "Aktion fehlgeschlagen.");
          console.error(fehler);
        }
      });
    });
  }

  if (el.formAddBenutzer) {
    el.formAddBenutzer.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = el.neuerBenutzerNameInput.value.trim();
      const email = el.neuerBenutzerEmailInput.value.trim();
      const rolle = el.neuerBenutzerRolleInput.value;
      try {
        await window.BenutzerVerwaltung.erstelleNeuenBenutzer({ username, email, rolle });
        el.formAddBenutzer.reset();
        zeigeToast(`Benutzer „${username}“ erstellt — Passwort-E-Mail wurde versendet.`);
      } catch (fehler) {
        zeigeToast(fehler.message || "Benutzer konnte nicht erstellt werden.");
        console.error(fehler);
      }
    });
  }

  function renderAdminLog() {
    if (!el.adminLogListe) return;
    el.adminLogListe.innerHTML = adminLogEintraege
      .map(
        (log) => `<div class="admin-log__item">
          <span class="admin-log__item-text"><strong>${escapeHtml(log.adminName || "Unbekannt")}</strong> — ${escapeHtml(log.aktion)}${
            log.zielName ? ` · ${escapeHtml(log.zielName)}` : ""
          }${log.details ? ` (${escapeHtml(log.details)})` : ""}</span>
          <span class="admin-log__item-zeit">${formatDatumUhrzeit(log.zeitpunkt)}</span>
        </div>`
      )
      .join("");
  }

  /* ------------------------------------------------------------------------
     19. Versions-Check (Update-Banner)
     ------------------------------------------------------------------------ */
  async function pruefeVersion() {
    try {
      const antwort = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
      const daten = await antwort.json();
      if (daten.version && daten.version > VERSION_AKTUELL) {
        el.updateBanner.hidden = false;
      }
    } catch (fehler) {
      /* still, kein Problem falls offline */
    }
  }
  if (el.updateBannerBtn) el.updateBannerBtn.addEventListener("click", () => window.location.reload());

  /* ------------------------------------------------------------------------
     20. Start / Stop der App (reagiert auf js/auth.js-Events)
     ------------------------------------------------------------------------ */
  function starteApp(detail) {
    aktuellerNutzer = { uid: detail.uid, name: detail.username, rolle: detail.rolle, admin: !!detail.isAdmin };

    el.sidebarUserAvatar.textContent = initialenAvatar(aktuellerNutzer.name);
    el.sidebarUserName.textContent = aktuellerNutzer.name;
    el.sidebarUserRole.textContent = aktuellerNutzer.rolle;
    el.dashboardName.textContent = aktuellerNutzer.name;
    el.dashboardGreeting.textContent = `Willkommen zurück, ${aktuellerNutzer.name.split(" ")[0]}.`;

    el.navAdminToggle.hidden = !istAdmin();
    if (!istAdmin()) el.navAdminBadge.hidden = true;

    starteHeartbeat();
    starteProdukteListener();
    starteBestellungenListener();
    starteAngeboteListener();
    starteKontakteRollenListener();
    starteKontakteListener();
    starteVerkaeufeListener();
    if (istAdmin()) starteBenutzerverwaltung();

    zeigeAnsicht(ladeStartseite());
    pruefeVersion();
    clearInterval(versionCheckTimer);
    versionCheckTimer = setInterval(pruefeVersion, 5 * 60 * 1000);
  }

  function aktualisiereNutzerProfil(detail) {
    if (!aktuellerNutzer) return;
    const warAdmin = istAdmin();
    aktuellerNutzer.rolle = detail.rolle;
    aktuellerNutzer.admin = !!detail.isAdmin;
    el.sidebarUserRole.textContent = aktuellerNutzer.rolle;
    el.navAdminToggle.hidden = !istAdmin();
    if (!warAdmin && istAdmin()) starteBenutzerverwaltung();
    if (warAdmin && !istAdmin()) {
      stoppeBenutzerverwaltung();
      if (aktuelleAnsicht === "admin" || aktuelleAnsicht === "admin-log") zeigeAnsicht("uebersicht");
    }
    renderWaren();
    renderKontakteRollenVerwaltung();
    renderVerkaeufe();
  }

  function stoppeApp() {
    aktuellerNutzer = null;
    [unsubProdukte, unsubBestellungen, unsubAngebote, unsubKontakte, unsubVerkaeufe, unsubKontakteRollen].forEach((unsub) => unsub && unsub());
    unsubProdukte = unsubBestellungen = unsubAngebote = unsubKontakte = unsubVerkaeufe = unsubKontakteRollen = null;
    stoppeBenutzerverwaltung();
    stoppeHeartbeat();
    clearInterval(versionCheckTimer);
    produkte = [];
    bestellungen = [];
    angebote = [];
    kontakte = [];
    verkaeufe = [];
  }

  window.addEventListener("hof:auth-approved", (event) => starteApp(event.detail));
  window.addEventListener("hof:auth-profile-updated", (event) => aktualisiereNutzerProfil(event.detail));
  window.addEventListener("hof:auth-signed-out", stoppeApp);
})();

/* ==========================================================================
   Medical Department – App-Logik
   Zugang: gemeinsames Website-Passwort + Namensauswahl (kein klassischer
   Account-Login). Im Hintergrund läuft trotzdem ein anonymer Firebase-Login,
   damit die Firestore-Datenbank geschützt bleibt und alle Mitarbeiter
   dieselben Daten in Echtzeit sehen (Medikamente + "wer ist online").
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     1. Konstanten
     ------------------------------------------------------------------------ */
  // Gemeinsames Zugangspasswort für die Website. Zum Ändern: Wert hier
  // ersetzen und die Datei neu hochladen.
  const SITE_PASSWORD = "Otter1311";

  // Bekannte Mitarbeiter (Name -> Position). Wird für die Namensauswahl,
  // die Mitarbeiter-Ansicht und die Anzeige im Badge verwendet.
  const STAFF_LIST = [
    { id: "heinrich", name: "Heinrich Hornhausen", rolle: "Chefarzt" },
    { id: "grete", name: "Grete Hornhausen", rolle: "Stellv. Chefärztin" },
  ];

  const STORAGE_KEY_LEGACY = "medicalDepartment.medikamente.v1";
  const STORAGE_KEY_V2 = "medicalDepartment.medikamente.v2";
  const GATE_PASSWORD_OK = "medicalDepartment.gate.passwordOk";
  const GATE_NAME = "medicalDepartment.gate.name";
  const GATE_ROLLE = "medicalDepartment.gate.rolle";

  const MEDIKAMENTE_DOC = "department/medikamente";
  const PRESENCE_COLLECTION = "presence";
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

  /* ------------------------------------------------------------------------
     2. Anwendungsstatus
     ------------------------------------------------------------------------ */
  let medikamente = [];
  let suchbegriff = "";
  let aktivesMedikamentId = null;
  let aktuellerNutzer = null;       // { name, rolle }
  let unsubMedikamente = null;
  let unsubPresence = null;
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

    btnToggleInfo: document.getElementById("btn-toggle-info"),
    infoPanel: document.getElementById("info-panel"),
    infoPanelGrid: document.getElementById("info-panel-grid"),

    modalEditPrice: document.getElementById("modal-edit-price"),
    editPriceName: document.getElementById("edit-price-name"),
    inputEditPrice: document.getElementById("input-edit-price"),
    editError: document.getElementById("edit-error"),
    btnConfirmEdit: document.getElementById("btn-confirm-edit"),

    modalDelete: document.getElementById("modal-delete"),
    deleteText: document.getElementById("delete-text"),
    btnConfirmDelete: document.getElementById("btn-confirm-delete"),

    toast: document.getElementById("toast"),

    navItems: document.querySelectorAll(".nav__item"),
    views: document.querySelectorAll(".view"),
    viewTitle: document.getElementById("view-title"),
    viewSubtitle: document.getElementById("view-subtitle"),
  };

  const VIEW_META = {
    medikamente: { title: "Medikamente", subtitle: "Übersicht & Verwaltung des Medikamentenbestands" },
    mitarbeiter: { title: "Mitarbeiter", subtitle: "Verwaltung des medizinischen Personals" },
    einstellungen: { title: "Einstellungen", subtitle: "Konfiguration des Medical Department Systems" },
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

  function initialenVon(name) {
    return (name || "?").trim().charAt(0).toUpperCase();
  }

  function findeRolleFuerName(name) {
    const treffer = STAFF_LIST.find((s) => s.name.toLowerCase() === name.toLowerCase());
    return treffer ? treffer.rolle : "Mitarbeiter";
  }

  /* ------------------------------------------------------------------------
     6. Zugangssperre: Passwort-Schritt
     ------------------------------------------------------------------------ */
  // Namensauswahl-Dropdown mit bekannten Mitarbeitern befüllen
  STAFF_LIST.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.name;
    option.textContent = `${person.name} (${person.rolle})`;
    el.gateNameSelect.insertBefore(option, el.gateNameSelect.lastElementChild);
  });

  if (istFirebaseKonfiguriert()) {
    el.formGatePassword.addEventListener("submit", (event) => {
      event.preventDefault();
      el.gatePasswordError.hidden = true;

      if (el.gatePasswordInput.value !== SITE_PASSWORD) {
        zeigeFeldFehler(el.gatePasswordError, "Falsches Passwort. Bitte versuch es erneut.");
        return;
      }

      localStorage.setItem(GATE_PASSWORD_OK, "true");
      zeigeGateSchritt("name");
    });

    el.gateNameSelect.addEventListener("change", () => {
      const istAndere = el.gateNameSelect.value === "__andere__";
      el.gateNameCustomWrapper.hidden = !istAndere;
      if (istAndere) el.gateNameCustom.focus();
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
        rolle = findeRolleFuerName(name);
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
      zeigeGateSchritt("name");
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

    sessionId = sessionStorage.getItem("medicalDepartment.sessionId") || erzeugeSessionId();
    sessionStorage.setItem("medicalDepartment.sessionId", sessionId);

    abonniereMedikamente();
    starteHeartbeat();
    abonnierePresence();

    window.addEventListener("beforeunload", entferneEigenePresence);
  }

  function renderBenutzerBadge() {
    if (!aktuellerNutzer) return;
    el.userAvatar.textContent = initialenVon(aktuellerNutzer.name);
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

    // Alle 10s neu berechnen, damit Leute, die den Tab einfach geschlossen
    // haben (ohne beforeunload), nach der Schwellenzeit automatisch als
    // offline verschwinden.
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
    const online = ermittleOnlineListe();
    const onlineNamen = new Set(online.map((p) => p.name.toLowerCase()));
    const farben = ["mint", "lavender", "blue", "peach"];

    el.staffGrid.innerHTML = "";

    STAFF_LIST.forEach((person, index) => {
      const istOnline = onlineNamen.has(person.name.toLowerCase());
      const istDu = aktuellerNutzer && person.name.toLowerCase() === aktuellerNutzer.name.toLowerCase();

      const card = document.createElement("div");
      card.className = "staff-card";
      card.innerHTML = `
        <div class="staff-card__avatar staff-card__avatar--${farben[index % farben.length]}">${escapeHtml(initialenVon(person.name))}</div>
        <div class="staff-card__info">
          <span class="staff-card__name">${escapeHtml(person.name)}</span>
          <span class="staff-card__role">${escapeHtml(person.rolle)} · ${istOnline ? "🟢 Online" : "⚪ Offline"}</span>
        </div>
        ${istDu ? '<span class="staff-card__badge">Du</span>' : ""}
      `;
      el.staffGrid.appendChild(card);
    });
  }

  /* ------------------------------------------------------------------------
     11. Rendering: Tabelle, Statistik-Karten, Info-Panel
     ------------------------------------------------------------------------ */
  function render() {
    renderTabelle();
    renderStatistik();
    renderInfoPanel();
  }

  function renderTabelle() {
    const liste = gefilterteMedikamente();
    el.tableBody.innerHTML = "";
    el.emptyState.hidden = liste.length !== 0;

    liste.forEach((med) => {
      const tr = document.createElement("tr");
      const menge = Number(med.menge) || 0;
      const zwischensumme = menge * Number(med.preis);

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
            <button class="icon-btn icon-btn--edit" data-role="edit" data-id="${med.id}" title="Preis bearbeiten">✎</button>
            <button class="icon-btn icon-btn--delete" data-role="delete" data-id="${med.id}" title="Medikament löschen">🗑</button>
          </div>
        </td>
      `;
      el.tableBody.appendChild(tr);
    });
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

  function renderInfoPanel() {
    el.infoPanelGrid.innerHTML = "";
    medikamente.forEach((med) => {
      const card = document.createElement("div");
      card.className = "info-card";
      const beschreibung = med.beschreibung && med.beschreibung.trim() ? med.beschreibung : "Keine Beschreibung hinterlegt.";
      card.innerHTML = `
        <span class="info-card__name">${escapeHtml(med.name)}</span>
        <span class="info-card__text">${escapeHtml(beschreibung)}</span>
        ${med.hinweis ? `<span class="info-card__hint">${escapeHtml(med.hinweis)}</span>` : ""}
      `;
      el.infoPanelGrid.appendChild(card);
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
     13. Info-Panel ein-/ausblenden
     ------------------------------------------------------------------------ */
  el.btnToggleInfo.addEventListener("click", () => {
    const istSichtbar = !el.infoPanel.hidden;
    el.infoPanel.hidden = istSichtbar;
    el.btnToggleInfo.classList.toggle("btn--ghost-active", !istSichtbar);
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
     16. Medikament löschen
     ------------------------------------------------------------------------ */
  function oeffneLoeschenModal(id) {
    const med = medikamente.find((m) => m.id === id);
    if (!med) return;

    aktivesMedikamentId = id;
    el.deleteText.textContent = `Möchtest du „${med.name}“ wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`;
    oeffneModal(el.modalDelete);
  }

  el.btnConfirmDelete.addEventListener("click", () => {
    const med = medikamente.find((m) => m.id === aktivesMedikamentId);
    medikamente = medikamente.filter((m) => m.id !== aktivesMedikamentId);

    speichereMedikamenteInFirestore();
    render();
    schliesseModal(el.modalDelete);

    if (med) zeigeToast(`„${med.name}“ wurde gelöscht.`);
    aktivesMedikamentId = null;
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

      el.views.forEach((view) => view.classList.remove("view--active"));
      document.getElementById(`view-${zielView}`).classList.add("view--active");

      const meta = VIEW_META[zielView];
      if (meta) {
        el.viewTitle.textContent = meta.title;
        el.viewSubtitle.textContent = meta.subtitle;
      }

      if (zielView === "mitarbeiter") renderMitarbeiterListe();
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
     21. Start
     ------------------------------------------------------------------------ */
  if (istFirebaseKonfiguriert()) {
    pruefeGespeichertenZugang();
  }
})();

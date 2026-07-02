/* ==========================================================================
   Medical Department – App-Logik
   Verwaltet Medikamente (hinzufügen, löschen, Preis bearbeiten, Menge),
   berechnet automatisch die Gesamtsumme und synchronisiert alles in
   Echtzeit über Firebase (Authentifizierung + Firestore-Datenbank), damit
   mehrere Mitarbeiter dieselben Daten sehen.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     1. Konstanten
     ------------------------------------------------------------------------ */
  // Lokaler Zwischenspeicher-Key (nur als Offline-Fallback, solange Firebase
  // noch nicht konfiguriert ist bzw. keine Verbindung besteht)
  const STORAGE_KEY_LEGACY = "medicalDepartment.medikamente.v1";
  const STORAGE_KEY_V2 = "medicalDepartment.medikamente.v2";

  const MEDIKAMENTE_DOC = "department/medikamente"; // Firestore-Pfad (Collection/Dokument)
  const USERS_COLLECTION = "users";

  // Standard-Medikamentenliste (wird verwendet, wenn Firestore noch leer ist)
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
     2. Anwendungsstatus (State)
     ------------------------------------------------------------------------ */
  let medikamente = [];             // Aktuelle Medikamentenliste (aus Firestore)
  let suchbegriff = "";             // Aktueller Text im Suchfeld
  let aktivesMedikamentId = null;   // Für Bearbeiten-/Löschen-Modale gemerkte ID
  let aktuellerNutzer = null;       // { uid, name, rolle, email }
  let unsubMedikamente = null;      // Firestore-Listener zum Abmelden beim Logout
  let unsubUsers = null;
  let speicherTimer = null;         // Debounce-Timer für Firestore-Schreibvorgänge

  /* ------------------------------------------------------------------------
     3. DOM-Referenzen
     ------------------------------------------------------------------------ */
  const el = {
    authScreen: document.getElementById("auth-screen"),
    appRoot: document.getElementById("app-root"),
    authTabs: document.querySelectorAll(".auth-tab"),
    formLogin: document.getElementById("form-login"),
    formRegister: document.getElementById("form-register"),
    loginEmail: document.getElementById("login-email"),
    loginPassword: document.getElementById("login-password"),
    loginError: document.getElementById("login-error"),
    registerName: document.getElementById("register-name"),
    registerRole: document.getElementById("register-role"),
    registerEmail: document.getElementById("register-email"),
    registerPassword: document.getElementById("register-password"),
    registerError: document.getElementById("register-error"),
    authConfigHint: document.getElementById("auth-config-hint"),

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
    // Firebase wurde noch nicht mit echten Projektdaten befüllt -> Hinweis zeigen,
    // Formulare deaktivieren, damit es keine unklaren Fehler gibt.
    el.authConfigHint.hidden = false;
    [el.formLogin, el.formRegister].forEach((form) => {
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

  /* ------------------------------------------------------------------------
     6. Authentifizierung: Tabs, Login, Registrierung, Logout
     ------------------------------------------------------------------------ */
  el.authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const ziel = tab.dataset.authTab;
      el.authTabs.forEach((t) => t.classList.remove("auth-tab--active"));
      tab.classList.add("auth-tab--active");

      el.formLogin.classList.toggle("auth-form--active", ziel === "login");
      el.formRegister.classList.toggle("auth-form--active", ziel === "register");
    });
  });

  if (istFirebaseKonfiguriert()) {
    el.formLogin.addEventListener("submit", (event) => {
      event.preventDefault();
      el.loginError.hidden = true;

      auth
        .signInWithEmailAndPassword(el.loginEmail.value.trim(), el.loginPassword.value)
        .catch((fehler) => {
          zeigeFeldFehler(el.loginError, uebersetzeAuthFehler(fehler));
        });
    });

    el.formRegister.addEventListener("submit", (event) => {
      event.preventDefault();
      el.registerError.hidden = true;

      const name = el.registerName.value.trim();
      const rolle = el.registerRole.value;
      const email = el.registerEmail.value.trim();
      const passwort = el.registerPassword.value;

      if (!name) {
        zeigeFeldFehler(el.registerError, "Bitte gib deinen vollständigen Namen ein.");
        return;
      }
      if (passwort.length < 6) {
        zeigeFeldFehler(el.registerError, "Das Passwort muss mindestens 6 Zeichen lang sein.");
        return;
      }

      auth
        .createUserWithEmailAndPassword(email, passwort)
        .then((zugangsdaten) =>
          zugangsdaten.user
            .updateProfile({ displayName: name })
            .then(() =>
              db.collection(USERS_COLLECTION).doc(zugangsdaten.user.uid).set({
                name: name,
                rolle: rolle,
                email: email,
                erstelltAm: firebase.firestore.FieldValue.serverTimestamp(),
              })
            )
        )
        .catch((fehler) => {
          zeigeFeldFehler(el.registerError, uebersetzeAuthFehler(fehler));
        });
    });

    auth.onAuthStateChanged((user) => {
      if (user) {
        anwendungStarten(user);
      } else {
        anwendungBeenden();
      }
    });
  }

  function uebersetzeAuthFehler(fehler) {
    const codes = {
      "auth/email-already-in-use": "Diese E-Mail-Adresse wird bereits verwendet.",
      "auth/invalid-email": "Bitte gib eine gültige E-Mail-Adresse ein.",
      "auth/weak-password": "Das Passwort ist zu schwach (mind. 6 Zeichen).",
      "auth/user-not-found": "Kein Konto mit dieser E-Mail-Adresse gefunden.",
      "auth/wrong-password": "Falsches Passwort.",
      "auth/invalid-credential": "E-Mail-Adresse oder Passwort ist falsch.",
      "auth/too-many-requests": "Zu viele Versuche. Bitte warte kurz und versuche es erneut.",
    };
    return codes[fehler.code] || "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
  }

  el.userBadgeBtn.addEventListener("click", () => {
    el.userMenu.classList.toggle("user-menu--visible");
  });

  document.addEventListener("click", (event) => {
    if (!el.userMenu.contains(event.target) && event.target !== el.userBadgeBtn) {
      el.userMenu.classList.remove("user-menu--visible");
    }
  });

  el.btnLogout.addEventListener("click", () => {
    auth.signOut();
  });

  /* ------------------------------------------------------------------------
     7. App starten / beenden (abhängig vom Login-Status)
     ------------------------------------------------------------------------ */
  function anwendungStarten(user) {
    el.authScreen.hidden = true;
    el.appRoot.hidden = false;

    // Benutzerprofil (Name + Rolle) aus Firestore laden
    db.collection(USERS_COLLECTION)
      .doc(user.uid)
      .get()
      .then((doc) => {
        const profil = doc.exists ? doc.data() : { name: user.displayName || user.email, rolle: "Mitarbeiter" };
        aktuellerNutzer = { uid: user.uid, name: profil.name, rolle: profil.rolle, email: user.email };
        renderBenutzerBadge();
      });

    abonniereMedikamente();
    abonniereMitarbeiter();
  }

  function anwendungBeenden() {
    el.authScreen.hidden = false;
    el.appRoot.hidden = true;

    if (unsubMedikamente) unsubMedikamente();
    if (unsubUsers) unsubUsers();
    unsubMedikamente = null;
    unsubUsers = null;
    aktuellerNutzer = null;
    medikamente = [];

    el.formLogin.reset();
    el.formRegister.reset();
    el.loginError.hidden = true;
    el.registerError.hidden = true;
  }

  function renderBenutzerBadge() {
    if (!aktuellerNutzer) return;
    el.userAvatar.textContent = initialenVon(aktuellerNutzer.name);
    el.userName.textContent = aktuellerNutzer.name;
    el.userRole.textContent = aktuellerNutzer.rolle;
  }

  /* ------------------------------------------------------------------------
     8. Firestore: Medikamente laden & speichern (Echtzeit-Synchronisierung)
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
          // Dokument existiert noch nicht -> mit Standardliste (bzw. alten
          // lokalen Daten, falls vorhanden) initial befüllen
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

  // Schreibt die aktuelle Medikamentenliste (debounced) nach Firestore,
  // damit z. B. beim Tippen im Mengenfeld nicht bei jedem Tastendruck
  // ein Schreibvorgang ausgelöst wird.
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

    // Zusätzlich lokal zwischenspeichern (Offline-Komfort)
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(medikamente));
    } catch (fehler) {
      console.warn("Konnte lokalen Fallback nicht speichern.", fehler);
    }
  }

  /* ------------------------------------------------------------------------
     9. Firestore: Mitarbeiterliste (Ansicht "Mitarbeiter")
     ------------------------------------------------------------------------ */
  function abonniereMitarbeiter() {
    unsubUsers = db.collection(USERS_COLLECTION).onSnapshot(
      (snapshot) => {
        const mitarbeiter = [];
        snapshot.forEach((doc) => mitarbeiter.push({ uid: doc.id, ...doc.data() }));
        renderMitarbeiter(mitarbeiter);
      },
      (fehler) => console.error("Fehler beim Laden der Mitarbeiterliste:", fehler)
    );
  }

  function renderMitarbeiter(mitarbeiter) {
    el.staffGrid.innerHTML = "";

    if (mitarbeiter.length === 0) {
      el.staffGrid.innerHTML = `<p class="empty-state">Noch keine Mitarbeiter registriert.</p>`;
      return;
    }

    const farben = ["mint", "lavender", "blue", "peach"];

    mitarbeiter.forEach((person, index) => {
      const istDu = aktuellerNutzer && person.uid === aktuellerNutzer.uid;
      const card = document.createElement("div");
      card.className = "staff-card";
      card.innerHTML = `
        <div class="staff-card__avatar staff-card__avatar--${farben[index % farben.length]}">${escapeHtml(initialenVon(person.name))}</div>
        <div class="staff-card__info">
          <span class="staff-card__name">${escapeHtml(person.name || "Unbekannt")}</span>
          <span class="staff-card__role">${escapeHtml(person.rolle || "Mitarbeiter")}</span>
        </div>
        ${istDu ? '<span class="staff-card__badge">Du</span>' : ""}
      `;
      el.staffGrid.appendChild(card);
    });
  }

  /* ------------------------------------------------------------------------
     10. Rendering: Tabelle, Statistik-Karten, Info-Panel
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
     11. Modal-Steuerung
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
     12. Info-Panel ein-/ausblenden
     ------------------------------------------------------------------------ */
  el.btnToggleInfo.addEventListener("click", () => {
    const istSichtbar = !el.infoPanel.hidden;
    el.infoPanel.hidden = istSichtbar;
    el.btnToggleInfo.classList.toggle("btn--ghost-active", !istSichtbar);
  });

  /* ------------------------------------------------------------------------
     13. Medikament hinzufügen
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
     14. Preis bearbeiten
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
     15. Medikament löschen
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
     16. Tabellen-Events: Menge ändern, Bearbeiten- & Löschen-Buttons
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
     17. Suchfeld
     ------------------------------------------------------------------------ */
  el.searchInput.addEventListener("input", (event) => {
    suchbegriff = event.target.value;
    renderTabelle();
  });

  /* ------------------------------------------------------------------------
     18. Sidebar-Navigation (Ansichten wechseln)
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
    });
  });

  /* ------------------------------------------------------------------------
     19. Enter-Taste in Eingabefeldern bestätigt den jeweiligen Dialog
     ------------------------------------------------------------------------ */
  [el.inputMedName, el.inputMedPrice].forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") el.btnConfirmAdd.click();
    });
  });
  el.inputEditPrice.addEventListener("keydown", (event) => {
    if (event.key === "Enter") el.btnConfirmEdit.click();
  });
})();

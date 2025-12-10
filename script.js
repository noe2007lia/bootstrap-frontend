// Globale Initialisierung für Navigation, Active-State, Mobile-Collapse,
// dynamisches Jahr und UX-Verbesserungen.
// Benötigt jQuery + optional Bootstrap JS für .collapse()

(function ($) {
  "use strict";

  // ---- Konfiguration -------------------------------------------------------
  const PAGE_MAP = {
    home: "index.html",
    cat: "cat.html",
    weather: "weather.html",
    btc: "btc.html",
    ev: "ev.html",
    map: "map.html",
    apis: "apis.html",
  };

  const SELECTORS = {
    navContainer: "#site-nav",
    navLinksWrap: "#navLinks", // <ul id="navLinks">…</ul> in nav.html
    collapsible: ".navbar-collapse", // Bootstrap Collapse Container
    main: "main",
    yearSlot: "#year", // <span id="year"></span> wird auf aktuelles Jahr gesetzt
  };

  // ---- Hilfsfunktionen -----------------------------------------------------

  // Liefert den Ziel-Href für die aktuelle Seite
  function getCurrentHref() {
    const page = document.body.dataset.page || "";
    if (page && PAGE_MAP[page]) return PAGE_MAP[page];

    const path = (location.pathname || "").split("/").pop() || "index.html";
    return path;
  }

  // Aktiven Link markieren
  function highlightActiveLink($root) {
    const currentHref = getCurrentHref();

    $root.find("a[href]").each(function () {
      const href = this.getAttribute("href");
      if (!href || href.startsWith("http")) return;

      const same =
        href === currentHref || (href.endsWith("/") && currentHref === "index.html");

      if (same) {
        this.classList.add("active");
        this.setAttribute("aria-current", "page");

        // Reload derselben Seite vermeiden
        this.addEventListener("click", function (e) {
          e.preventDefault();
        });
      }
    });
  }

  // Mobile-Collapse automatisch schließen
  function wireMobileCollapse($root) {
    const $collapsible = $root.find(SELECTORS.collapsible);
    if (!$collapsible.length) return;

    $collapsible.on("click", "a[href]", function () {
      try {
        $collapsible.collapse("hide");
      } catch (_) {
        // Bootstrap nicht geladen – einfach ignorieren
      }
    });
  }

  // Externe Links im <main> in neuem Tab öffnen
  function markExternalLinks() {
    const $scope = $(SELECTORS.main);
    if (!$scope.length) return;

    $scope.find('a[href^="http"]').each(function () {
      try {
        const url = new URL(this.href);
        if (url.host !== location.host) {
          this.target = "_blank";
          this.rel = "noopener noreferrer";
        }
      } catch (e) {
        // Ungültige URL ignorieren
      }
    });
  }

  // Dynamisches Jahr einsetzen
  function setYear() {
    const el = document.querySelector(SELECTORS.yearSlot);
    if (el) el.textContent = new Date().getFullYear();
  }

  // ---- DOM Ready -----------------------------------------------------------
  $(function () {
    $(SELECTORS.navContainer).load("nav.html", function (response, status, xhr) {
      if (status !== "success") {
        console.warn("Navbar konnte nicht geladen werden:", status, xhr?.status);
        $(SELECTORS.navContainer).html(
          '<nav class="navbar navbar-light bg-light px-3">' +
            '<a class="navbar-brand fw-semibold" href="index.html">Info Website 2025</a>' +
          "</nav>"
        );
        setYear();
        markExternalLinks();
        return;
      }

      const $navRoot = $(SELECTORS.navContainer);

      highlightActiveLink($navRoot);
      wireMobileCollapse($navRoot);

      // Fokusrahmen bei Tastatur
      document.addEventListener("keydown", e => {
        if (e.key === "Tab") document.documentElement.classList.add("using-keyboard");
      });
      document.addEventListener("mousedown", () => {
        document.documentElement.classList.remove("using-keyboard");
      });

      setYear();
      markExternalLinks();
    });
  });
})(jQuery);

$(document).ready(function () {

  // -------------------------
  // Konfiguration / Konstanten
  // -------------------------
  const LAT = 47.3769; // Zürich (für Wetter-Beispiel)
  const LON = 8.5417;

  const WINT_LAT = 47.4988; // Winterthur - Mittelpunkt für Ladestellen
  const WINT_LON = 8.7237;

  const DATA_URL = "https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/ch.bfe.ladestellen-elektromobilitaet.json";

  // Globaler Leaflet map-Handle (eine Karte für alles)
  let map = null;
  let stationsLayer = null;

  // -------------------------
  // Katzenbild
  // -------------------------
  $("#catBtn").on("click", function () {
    $.ajax({
      url: "https://api.thecatapi.com/v1/images/search",
      method: "GET",
      success: function (data) {
        $("#catResult").html(`
          <img src="${data[0].url}" class="img-fluid rounded" alt="Cat">
        `);
      },
      error: function () {
        $("#catResult").text("Fehler beim Laden des Katzenbildes");
      }
    });
  });

  // -------------------------
  // Bitcoin Preis
  // -------------------------
  $("#btcBtn").on("click", function () {
    $.ajax({
      url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,chf",
      method: "GET",
      success: function (data) {
        const usd = data.bitcoin.usd;
        const chf = data.bitcoin.chf;
        $("#btcResult").html(`
          <p>Bitcoin Preis:</p>
          <strong>${usd} USD</strong><br>
          <strong>${chf} CHF</strong>
        `);
      },
      error: function () {
        $("#btcResult").text("Fehler beim Laden des Bitcoin-Preises");
      }
    });
  });

  // -------------------------
  // Wetter (Open-Meteo)
  // -------------------------
  $("#weatherBtn").on("click", function () {
    $.ajax({
      url: `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=1&timezone=Europe/Zurich`,
      method: "GET",
      success: function (weather) {
        const max = weather.daily.temperature_2m_max[0];
        const min = weather.daily.temperature_2m_min[0];
        const rain = weather.daily.precipitation_sum[0];

        $("#weatherResult").html(`
          <p><strong>Zürich Wetter (Heute)</strong></p>
          🔺 Max: ${max}°C<br>
          🔻 Min: ${min}°C<br>
          🌧️ Niederschlag: ${rain} mm
        `);
      },
      error: function () {
        $("#weatherResult").text("Fehler beim Wetterladen");
      }
    });
  });

  // -------------------------
  // Helper: Map initialisieren (einmal)
  // -------------------------
  function ensureMap() {
    if (map) return map;

    map = L.map('mapResult').setView([WINT_LAT, WINT_LON], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    stationsLayer = L.layerGroup().addTo(map);

    // Marker für Zentrum
    L.marker([WINT_LAT, WINT_LON]).addTo(map).bindPopup("Winterthur (Zentrum)");

    return map;
  }

  // -------------------------
  // Stations-UI Elemente
  // -------------------------
  const $stationsContainer = $("#stationsContainer");
  const $reloadBtn = $("#reloadBtn");
  const $toggleMapBtn = $("#toggleMapBtn");
  const $stationsBtn = $("#stationsBtn");

  function showLoading(msg = "Lade Daten...") {
    $stationsContainer.html(`<div class="loading">${msg}</div>`);
  }
  function showError(msg = "Fehler") {
    $stationsContainer.html(`<div class="alert alert-danger">${msg}</div>`);
  }

  // Haversine Distanz (km)
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

// -------------------------
// Lade Stationen & rendern (robust + Fallback + optionales Geocoding)
// -------------------------
async function loadStationsAndRender() {
  try {
    ensureMap();
    showLoading("Lade Ladestellen...");

    const resp = await fetch(DATA_URL, { method: 'GET' });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "<keine textantwort>");
      console.error("Netzwerkfehler beim Abruf der API:", resp.status, resp.statusText, "Antwort-Text (gekürzt):", txt.slice(0, 500));
      showError(`Netzwerkfehler: ${resp.status} ${resp.statusText}. Prüfe URL / CORS.`);
      return;
    }

    const ctype = resp.headers.get('content-type') || "";
    const bodyText = await resp.text();

    if (!/application\/json|text\/json|geo\+json/i.test(ctype) && !bodyText.trim().startsWith("{") && !bodyText.trim().startsWith("[")) {
      console.error("Unerwarteter Content-Type oder Body (kein JSON):", ctype, bodyText.slice(0, 1000));
      showError("Die API liefert kein JSON (oder CORS blockiert die Anfrage). Öffne die DevTools -> Network, um die Antwort zu prüfen.");
      return;
    }

    let data;
    try {
      data = JSON.parse(bodyText);
    } catch (e) {
      console.error("Fehler beim Parsen des JSON-Texts:", e, "Rohantwort (gekürzt):", bodyText.slice(0, 1000));
      showError("Fehler: Antwort kann nicht als JSON geparst werden.");
      return;
    }

    // find array of features (robust)
    function findFirstArray(obj, visited = new Set()) {
      if (!obj || typeof obj !== 'object') return null;
      if (visited.has(obj)) return null;
      visited.add(obj);
      if (Array.isArray(obj) && obj.length > 0) return obj;
      for (const k of Object.keys(obj)) {
        try {
          const val = obj[k];
          if (Array.isArray(val) && val.length > 0) return val;
          if (val && typeof val === 'object') {
            const found = findFirstArray(val, visited);
            if (found) return found;
          }
        } catch (err) {}
      }
      return null;
    }

    let features = null;
    if (data && Array.isArray(data.features) && data.features.length > 0) {
      features = data.features;
    } else if (Array.isArray(data) && data.length > 0) {
      features = data;
    } else {
      features = findFirstArray(data);
    }

    if (!features || !Array.isArray(features) || features.length === 0) {
      console.error("Keine Array-Struktur gefunden in der API-Antwort. Ganze Antwort (gekürzt):", data);
      showError("Unerwartete Datenstruktur von der API (kein Array mit Stationen gefunden). Schau in die Console für Details.");
      return;
    }

    // robuste Koordinaten-Extraktion (vereinfacht)
    function tryNumber(v) {
      if (v === null || v === undefined) return null;
      if (typeof v === 'string') v = v.trim().replace(',', '.');
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }

    function plausibleLat(l) { return typeof l === 'number' && l >= 43 && l <= 49; }
    function plausibleLon(l) { return typeof l === 'number' && l >= 5 && l <= 12; }


    // Stations-Daten extrahieren & sortierenfunction extractCoords(obj) {
  if (!obj || typeof obj !== 'object') return null;

  // 1) GeoJSON geometry.coordinates
  const geom = obj.geometry || obj;
  if (geom && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
    let a = tryNumber(geom.coordinates[0]);
    let b = tryNumber(geom.coordinates[1]);
    if (a !== null && b !== null) {
      if (plausibleLat(b) && plausibleLon(a)) return { lat: b, lon: a };
      if (plausibleLat(a) && plausibleLon(b)) return { lat: a, lon: b };
    }
  }

  // 2) properties with lat/lon names
  const props = obj.properties || obj;
  const maybe = [
    ['latitude','longitude'],
    ['lat','lon'],
    ['lat','lng'],
    ['y','x'],
    ['coord_y','coord_x'],
  ];
  for (const [la, lo] of maybe) {
    const L = tryNumber(props[la]);
    const O = tryNumber(props[lo]);
    if (L !== null && O !== null) {
      if (plausibleLat(L) && plausibleLon(O)) return { lat: L, lon: O };
      if (plausibleLat(O) && plausibleLon(L)) return { lat: O, lon: L };
    }
  }

  // 3) direct fields
  const candidateLat = tryNumber(obj.lat ?? obj.latitude ?? obj.y ?? null);
  const candidateLon = tryNumber(obj.lon ?? obj.longitude ?? obj.x ?? obj.lng ?? null);
  if (plausibleLat(candidateLat) && plausibleLon(candidateLon))
    return { lat: candidateLat, lon: candidateLon };
  if (plausibleLat(candidateLon) && plausibleLon(candidateLat))
    return { lat: candidateLon, lon: candidateLat };

  return null;
}

 catch (err) {
    console.error("Fehler beim Laden/Verarbeiten der Stationen:", err);
    showError("Fehler beim Laden der Ladestellen. Schau in die Konsole.");
}
    const stations = features.map(f => {
  const coords = extractCoords(f);
  const lat = coords?.lat ?? null;
  const lon = coords?.lon ?? null;
  const props = f.properties || f;
  const name = props.name || props.betreiber || "Unbenannte Station";
  const adresse = props.adresse || props.strasse || props.ort || "";
  const power = props.leistungkw || props.max_power || null;
  const operator = props.betreiber || "";

  const dist = (lat !== null && lon !== null)
    ? haversineKm(WINT_LAT, WINT_LON, lat, lon)
    : Infinity;

  return { name, adresse, lat, lon, dist, power, operator };

  
});





  // -------------------------
  // Buttons
  // -------------------------
  $stationsBtn.on("click", function () {
    loadStationsAndRender();
  });
  $reloadBtn.on("click", function () {
    loadStationsAndRender();
  });
  $toggleMapBtn.on("click", function () {
    $("#mapResult").toggle();
    if ($("#mapResult").is(":visible") && map) {
      setTimeout(() => { map.invalidateSize(); }, 200);
    }
  });

  // Karte optional per Klick anzeigen
  $("#mapBtn").on("click", function () {
    ensureMap();
    setTimeout(() => { map.invalidateSize(); }, 200);
  });

});

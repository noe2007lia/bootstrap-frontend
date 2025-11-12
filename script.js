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
// Lade Stationen & rendern (robust + debug)
// -------------------------
async function loadStationsAndRender() {
  try {
    ensureMap();
    showLoading("Lade Ladestellen...");

    const resp = await fetch(DATA_URL, { method: 'GET' });
    // 1) Netzwerkstatus prüfen
    if (!resp.ok) {
      const txt = await resp.text().catch(()=>"<keine textantwort>");
      console.error("Netzwerkfehler beim Abruf der API:", resp.status, resp.statusText, "Antwort-Text (gekürzt):", txt.slice(0,500));
      showError(`Netzwerkfehler: ${resp.status} ${resp.statusText}. Prüfe URL / CORS.`);
      return;
    }

    // 2) Content-Type prüfen
    const ctype = resp.headers.get('content-type') || "";
    const bodyText = await resp.text();

    // Falls die API HTML oder Text zurückliefert -> Fehler (häufiger bei CORS / Proxy / 400)
    if (!/application\/json|text\/json|geo\+json/i.test(ctype) && !bodyText.trim().startsWith("{") && !bodyText.trim().startsWith("[")) {
      console.error("Unerwarteter Content-Type oder Body (kein JSON):", ctype, bodyText.slice(0,1000));
      showError("Die API liefert kein JSON (oder CORS blockiert die Anfrage). Öffne die DevTools -> Network, um die Antwort zu prüfen.");
      return;
    }

    // 3) JSON parse sicher versuchen, mit Fehlerprotokoll
    let data;
    try {
      data = JSON.parse(bodyText);
    } catch (e) {
      console.error("Fehler beim Parsen des JSON-Texts:", e, "Rohantwort (gekürzt):", bodyText.slice(0,1000));
      showError("Fehler: Antwort kann nicht als JSON geparst werden.");
      return;
    }

    // 4) Robust: finde irgendein Array mit Einträgen im Objekt (first-array fallback)
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
        } catch (err) {
          // ignore
        }
      }
      return null;
    }

    // Nutze zuerst data.features falls vorhanden, sonst fallback auf erstes Array im Objekt
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

    // 5) Mapping der Stationen (wie zuvor), aber defensiv
    const stations = features.map(f => {
      // GeoJSON Feature: geometry.coordinates = [lon, lat]
      let lon = null, lat = null;
      if (f && f.geometry && Array.isArray(f.geometry.coordinates)) {
        lon = Number(f.geometry.coordinates[0]);
        lat = Number(f.geometry.coordinates[1]);
      } else if (Array.isArray(f.coordinates)) {
        lon = Number(f.coordinates[0]);
        lat = Number(f.coordinates[1]);
      } else if (f.properties && (f.properties.longitude || f.properties.lat || f.properties.lat_deg)) {
        // Falls API andere property names hat
        lon = Number(f.properties.longitude || f.properties.lon || f.properties.lng || f.properties.x);
        lat = Number(f.properties.latitude || f.properties.lat || f.properties.y);
      } else if (f.lon && f.lat) {
        lon = Number(f.lon);
        lat = Number(f.lat);
      }

      const props = f.properties || f;
      const name = props.name || props.betreiber || props.label || props.title || "Unbenannte Station";
      const adresse = props.adresse || props.strasse || props.ort || props.address || "";
      const power = props.leistungkw || props.max_power || props.power || null;
      const operator = props.betreiber || props.operator || "";

      const dist = (isFinite(lat) && isFinite(lon)) ? haversineKm(WINT_LAT, WINT_LON, lat, lon) : Infinity;
      return { name, adresse, lat, lon, dist, power, operator };
    });

    const validStations = stations.filter(s => isFinite(s.dist) && s.lat !== null && s.lon !== null);
    if (validStations.length === 0) {
      console.error("Stations-Array gefunden, aber keine gültigen Koordinaten extrahiert. Beispiele (erste 5):", stations.slice(0,5));
      showError("Es wurden Einträge gefunden, aber keine gültigen Koordinaten. Prüfe die Struktur der API-Antwort in der Konsole.");
      return;
    }

    const nearest = validStations.sort((a,b) => a.dist - b.dist).slice(0,5);

    // Rendern wie gehabt
    stationsLayer.clearLayers();
    const groupLatLngs = [[WINT_LAT, WINT_LON]];
    let html = '<ul class="list-group">';
    nearest.forEach((s, idx) => {
      html += `
        <li class="list-group-item station-item" data-idx="${idx}">
          <div><strong>${s.name}</strong> <small class="text-muted">(${s.dist.toFixed(2)} km)</small></div>
          ${s.adresse ? `<div><small>${s.adresse}</small></div>` : ''}
          ${s.operator ? `<div><small>Betreiber: ${s.operator}</small></div>` : ''}
          ${s.power ? `<div><small>Leistung: ${s.power} kW</small></div>` : ''}
        </li>
      `;
      const marker = L.marker([s.lat, s.lon])
        .bindPopup(`<strong>${s.name}</strong><br>${s.adresse || ''}<br><small>${s.dist.toFixed(2)} km von Winterthur</small>`);
      marker.addTo(stationsLayer);
      groupLatLngs.push([s.lat, s.lon]);
    });
    html += '</ul>';
    $stationsContainer.html(html);

    const bounds = L.latLngBounds(groupLatLngs);
    map.fitBounds(bounds.pad(0.2));

    $(".station-item").on("click", function () {
      const idx = Number($(this).attr("data-idx"));
      const s = nearest[idx];
      if (!s) return;
      stationsLayer.eachLayer(layer => {
        const latlng = layer.getLatLng();
        if (Math.abs(latlng.lat - s.lat) < 1e-6 && Math.abs(latlng.lng - s.lon) < 1e-6) {
          layer.openPopup();
          map.setView([s.lat, s.lon], Math.max(map.getZoom(), 14), { animate: true });
        }
      });
    });

  } catch (err) {
    console.error(err);
    showError("Fehler beim Laden/Verarbeiten der Daten: " + err.message);
  }
}


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

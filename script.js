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
  // Lade Stationen & rendern
  // -------------------------
  async function loadStationsAndRender() {
    try {
      ensureMap();
      showLoading("Lade Ladestellen...");

      const resp = await fetch(DATA_URL);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();

      // Robust: falls GeoJSON FeatureCollection -> features nutzen
      let features = [];
      if (Array.isArray(data)) {
        features = data;
      } else if (Array.isArray(data.features)) {
        features = data.features;
      } else if (Array.isArray(data.items)) {
        features = data.items; // fallback
      } else {
        // Falls die Struktur anders ist, versuchen wir, das Objekt als Array zu interpretieren
        showError("Unerwartete Datenstruktur von der API.");
        console.error("Empfangene Daten:", data);
        return;
      }

      // Mappe Feature -> station
      const stations = features.map(f => {
        // GeoJSON kann als Feature mit geometry.coordinates [lon, lat]
        let lon = null, lat = null;
        if (f.geometry && Array.isArray(f.geometry.coordinates)) {
          lon = Number(f.geometry.coordinates[0]);
          lat = Number(f.geometry.coordinates[1]);
        } else if (Array.isArray(f.coordinates)) {
          lon = Number(f.coordinates[0]);
          lat = Number(f.coordinates[1]);
        } else if (f.properties && f.properties.longitude && f.properties.latitude) {
          lon = Number(f.properties.longitude);
          lat = Number(f.properties.latitude);
        }

        const props = f.properties || f;
        const name = props.name || props.betreiber || "Unbenannte Station";
        const adresse = props.adresse || props.strasse || props.ort || "";
        const power = props.leistungkw || props.max_power || null;
        const operator = props.betreiber || "";

        const dist = (isFinite(lat) && isFinite(lon)) ? haversineKm(WINT_LAT, WINT_LON, lat, lon) : Infinity;
        return { name, adresse, lat, lon, dist, power, operator, raw: f };
      });

      const validStations = stations.filter(s => isFinite(s.dist) && s.lat !== null && s.lon !== null);
      if (validStations.length === 0) {
        showError("Keine gültigen Stationen-Koordinaten gefunden.");
        return;
      }

      const nearest = validStations.sort((a,b) => a.dist - b.dist).slice(0, 5);

      // Karte: alte Marker entfernen
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
        const marker = L.marker([s.lat, s.lon]).bindPopup(`<strong>${s.name}</strong><br>${s.adresse || ''}<br><small>${s.dist.toFixed(2)} km von Winterthur</small>`);
        marker.addTo(stationsLayer);
        groupLatLngs.push([s.lat, s.lon]);
      });
      html += '</ul>';
      $stationsContainer.html(html);

      // Fit bounds
      const bounds = L.latLngBounds(groupLatLngs);
      map.fitBounds(bounds.pad(0.2));

      // Klick auf Listeneintrag -> Popup öffnen
      $(".station-item").on("click", function () {
        const idx = Number($(this).attr("data-idx"));
        const s = nearest[idx];
        if (!s) return;
        // öffne passende Marker
        let found = false;
        stationsLayer.eachLayer(layer => {
          const latlng = layer.getLatLng();
          // Toleranz für float Vergleich
          if (Math.abs(latlng.lat - s.lat) < 1e-6 && Math.abs(latlng.lng - s.lon) < 1e-6) {
            layer.openPopup();
            map.setView([s.lat, s.lon], Math.max(map.getZoom(), 14), { animate: true });
            found = true;
          }
        });
        if (!found) {
          console.warn("Marker nicht gefunden für station", s);
        }
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

  // Optional: beim ersten Laden automatisch die Karte vorbereiten
  // ensureMap();
});

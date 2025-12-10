// app.js
// Vollständige Implementierung aller Aufgaben a)-e)
// Benötigt: jQuery, Leaflet, Highcharts

// ------------------------
// Konstanten / Konfiguration
// ------------------------
const LAT = 47.3769; // Zürich
const LON = 8.5417;

const WINT_LAT = 47.4988; // Winterthur
const WINT_LON = 8.7237;

const STATIONS_URL = "https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/ch.bfe.ladestellen-elektromobilitaet.json";

let map = null;
let stationsData = null;
let stationMarkers = []; // Leaflet markers

// ------------------------
// Hilfsfunktionen
// ------------------------
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Robust: extrahiere Koordinaten aus Feature
function extractCoords(feature) {
  try {
    if (!feature) return null;
    if (feature.geometry && Array.isArray(feature.geometry.coordinates)) {
      const c = feature.geometry.coordinates;
      // geojson: [lon, lat]
      return { lat: Number(c[1]), lon: Number(c[0]) };
    }
    // fallback: properties
    const p = feature.properties || feature;
    const lat = p.latitude || p.lat || p.y || null;
    const lon = p.longitude || p.lon || p.x || p.lng || null;
    if (lat != null && lon != null) return { lat: Number(lat), lon: Number(lon) };
  } catch (e) {}
  return null;
}

// Kleine Hilfsfunktion zum Anzeigen von Fehlermeldungen
function showMsg(targetSelector, html, type = "info") {
  const el = $(targetSelector);
  el.html(`<div class="alert alert-${type}">${html}</div>`);
}

// ------------------------
// Karten-Init & Geocoding (Pionierstrasse 28 Winterthur)
// ------------------------
function ensureMap() {
  if (map) return map;
  map = L.map('map').setView([WINT_LAT, WINT_LON], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  return map;
}

// Geocode via Nominatim (OpenStreetMap) - returns {lat, lon} or null
async function geocodeAddress(query) {
  try {
    const url = "https://nominatim.openstreetmap.org/search?" +
                new URLSearchParams({
                  q: query,
                  format: "json",
                  limit: 1,
                }).toString();

    const resp = await fetch(url, { headers: { "Accept-Language": "de" }});
    if (!resp.ok) return null;
    const arr = await resp.json();
    if (!arr || arr.length === 0) return null;
    return { lat: Number(arr[0].lat), lon: Number(arr[0].lon) };
  } catch (e) {
    console.error("Geocoding-Fehler", e);
    return null;
  }
}

// Initial zentrieren auf Pionierstrasse 28, Winterthur
async function centerOnPionierstrasse() {
  ensureMap();
  showMsg("#stationsList", "Geokodiere Pionierstrasse 28, Winterthur ...", "info");

  const addr = "Pionierstrasse 28, Winterthur, Switzerland";
  const pos = await geocodeAddress(addr);
  if (pos) {
    map.setView([pos.lat, pos.lon], 15);
    L.marker([pos.lat, pos.lon]).addTo(map).bindPopup("Pionierstrasse 28, Winterthur").openPopup();
    showMsg("#stationsList", "Karte auf Pionierstrasse 28, Winterthur zentriert.", "success");
  } else {
    showMsg("#stationsList", "Konnte Pionierstrasse 28 nicht geokodieren. Karte auf Winterthur zentriert.", "warning");
    map.setView([WINT_LAT, WINT_LON], 12);
  }
}

// ------------------------
// a) Katzenbild
// ------------------------
function bindCatButton() {
  $("#catBtn").on("click", function () {
    $("#catResult").html("Lade...");
    $.ajax({
      url: "https://api.thecatapi.com/v1/images/search",
      method: "GET",
      success: function (data) {
        if (!data || !data[0]) {
          $("#catResult").text("Keine Daten erhalten.");
          return;
        }
        const url = data[0].url;
        $("#catResult").html(`<img src="${url}" class="img-fluid rounded" alt="Katze">`);
      },
      error: function () {
        $("#catResult").text("Fehler beim Laden des Katzenbildes");
      }
    });
  });
}

// ------------------------
// b) Bitcoinpreis
// ------------------------
function bindBtcButton() {
  $("#btcBtn").on("click", function () {
    $("#btcResult").html("Lade...");
    $.ajax({
      url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,chf",
      method: "GET",
      success: function (data) {
        if (!data || !data.bitcoin) {
          $("#btcResult").text("Keine Daten erhalten.");
          return;
        }
        const usd = data.bitcoin.usd;
        const chf = data.bitcoin.chf;
        $("#btcResult").html(`<div><strong>${usd} USD</strong> &nbsp; / &nbsp; <strong>${chf} CHF</strong></div>`);
      },
      error: function () {
        $("#btcResult").text("Fehler beim Laden des Bitcoin-Preises");
      }
    });
  });
}

// ------------------------
// c) Wetter (Open-Meteo) + Highcharts
// ------------------------
async function loadWeatherAndChart() {
  $("#weatherResult").html("Lade Wetterdaten...");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
              `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=5&timezone=Europe/Zurich`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      $("#weatherResult").text("Fehler beim Abruf der Wetterdaten.");
      return;
    }
    const data = await resp.json();
    const daily = data.daily || {};
    const dates = daily.time || [];
    const tmax = daily.temperature_2m_max || [];
    const tmin = daily.temperature_2m_min || [];
    const precip = daily.precipitation_sum || [];

    // Textausgabe
    let html = `<div><strong>Wetter – Zürich (nächste 5 Tage)</strong></div>`;
    html += `<ul class="small">`;
    for (let i = 0; i < dates.length; i++) {
      html += `<li>${dates[i]} — Max: ${tmax[i]}°C, Min: ${tmin[i]}°C, Niederschlag: ${precip[i]} mm</li>`;
    }
    html += `</ul>`;
    $("#weatherResult").html(html);

    // Highcharts: Temperatur (Tmax/Tmin) + Niederschlag (column)
    Highcharts.chart('weatherChart', {
      title: { text: 'Wettervorhersage Zürich (5 Tage)' },
      xAxis: { categories: dates },
      yAxis: [{ // primary yAxis (temperature)
        labels: { format: '{value}°C' },
        title: { text: 'Temperatur' },
        opposite: false
      }, { // secondary yAxis (precipitation)
        title: { text: 'Niederschlag (mm)' },
        labels: { format: '{value} mm' },
        opposite: true
      }],
      series: [
        { name: 'Max Temp', type: 'spline', data: tmax, tooltip: { valueSuffix: '°C' } },
        { name: 'Min Temp', type: 'spline', data: tmin, tooltip: { valueSuffix: '°C' } },
        { name: 'Niederschlag', type: 'column', yAxis: 1, data: precip, tooltip: { valueSuffix: ' mm' } }
      ],
      credits: { enabled: false }
    });

  } catch (e) {
    console.error(e);
    $("#weatherResult").text("Fehler beim Laden der Wetterdaten (Konsole prüfen).");
  }
}

// ------------------------
// d) Ladestellen laden & 5 nächste Stationen berechnen
// ------------------------
async function loadStationsData() {
  showMsg("#stationsList", "Lade Ladestellen-Daten ... (kann etwas dauern)", "info");
  try {
    const resp = await fetch(STATIONS_URL);
    if (!resp.ok) {
      showMsg("#stationsList", `Fehler beim Laden der Stationsdaten: ${resp.status}`, "danger");
      return null;
    }
    const json = await resp.json();
    // Die Datei hat oft eine "features" Array (GeoJSON)
    let arr = null;
    if (Array.isArray(json.features)) arr = json.features;
    else if (Array.isArray(json)) arr = json;
    else {
      // versuche erste gefüllte Array im Objekt
      for (const k of Object.keys(json)) {
        if (Array.isArray(json[k]) && json[k].length) { arr = json[k]; break; }
      }
    }
    if (!arr) {
      showMsg("#stationsList", "Keine Stationsliste im JSON gefunden.", "warning");
      return null;
    }
    stationsData = arr;
    showMsg("#stationsList", "Stationsdaten geladen.", "success");
    return arr;
  } catch (e) {
    console.error(e);
    showMsg("#stationsList", "Fehler beim Laden der Stationsdaten (Konsole prüfen).", "danger");
    return null;
  }
}

function renderNearestStations(centerLat = WINT_LAT, centerLon = WINT_LON, maxCount = 5) {
  if (!stationsData) {
    $("#stationsList").html(`<div class="text-muted small">Keine Stationsdaten geladen. Bitte "Ladestationen laden" klicken.</div>`);
    return;
  }

  // Berechne Distanz und extrahiere Name/Adresse
  const enriched = stationsData.map(s => {
    const coords = extractCoords(s);
    const props = s.properties || s;
    const name = props.name || props.betreiber || props.title || (props.standort_beschr ? props.standort_beschr : "Unbenannte Station");
    const adresse = props.adresse || props.strasse || props.ort || props.gem || "";
    const lat = coords ? coords.lat : null;
    const lon = coords ? coords.lon : null;
    const dist = (lat != null && lon != null) ? haversineKm(centerLat, centerLon, lat, lon) : Infinity;
    return { src: s, name, adresse, lat, lon, dist, props };
  });

  const sorted = enriched.filter(e => e.dist !== Infinity).sort((a,b) => a.dist - b.dist).slice(0, maxCount);
  const $list = $("#stationsList");
  $list.empty();

  if (sorted.length === 0) {
    $list.html(`<div class="small text-muted">Keine Stationen mit Koordinaten gefunden.</div>`);
    return;
  }

  // entferne alte Marker
  stationMarkers.forEach(m => map.removeLayer(m));
  stationMarkers = [];

  sorted.forEach((s, i) => {
    const li = $(`
      <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-start">
        <div>
          <div class="fw-semibold">${s.name}</div>
          <div class="small text-muted">${s.adresse || ""}</div>
        </div>
        <div class="text-end">
          <div class="small">${s.dist.toFixed(2)} km</div>
          <div class="small text-muted">#${i+1}</div>
        </div>
      </button>
    `);
    $list.append(li);

    // Marker setzen
    if (s.lat != null && s.lon != null) {
      const m = L.marker([s.lat, s.lon]).addTo(map).bindPopup(`<strong>${s.name}</strong><br>${s.adresse || ""}`);
      stationMarkers.push(m);

      // Klick auf Listenelement -> Karte zentrieren
      li.on("click", function () {
        map.setView([s.lat, s.lon], 16);
        if (m) m.openPopup();
      });
    }
  });

  showMsg("#stationsList", `${sorted.length} nächste Ladestellen aus ${stationsData.length} geladen.`, "success");
}

// PLZ/Ort Suche in Stationsdaten (einfache Matching-Strategie)
function searchStationsByPlzOrPlace(query) {
  if (!stationsData) {
    showMsg("#stationsList", "Stationsdaten sind nicht geladen.", "warning");
    return;
  }
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    showMsg("#stationsList", "Bitte eine PLZ oder einen Ort eingeben.", "info");
    return;
  }

  // Suche in verschiedenen Properties (robust)
  const matches = [];
  for (const f of stationsData) {
    const p = f.properties || f;
    const fieldsToCheck = [
      p.ort, p.gemeinde, p.plz, p.postleitzahl, p.address, p.adresse, p.strasse, p.bemerkung, p.name, p.standort_beschr
    ];
    const hay = (fieldsToCheck.filter(Boolean).join(" ")).toLowerCase();
    if (!hay) continue;
    if (hay.includes(q)) {
      matches.push(f);
    }
  }

  if (matches.length === 0) {
    showMsg("#stationsList", `Keine Stationen mit "${q}" gefunden. Versuch eine nähere Ortsbezeichnung oder lade alle Stationen.`, "warning");
    return;
  }

  // set stationsData temporär auf matches, render nearest relative to Winterthur (oder first match coords)
  const arrBackup = stationsData;
  stationsData = matches;
  renderNearestStations(WINT_LAT, WINT_LON, Math.min(20, matches.length));
  // restore
  stationsData = arrBackup;
}

// ------------------------
// e) Place search (geocode) und Zentrieren
// ------------------------
async function placeSearchAndCenter(query) {
  if (!query || !query.trim()) {
    showMsg("#stationsList", "Bitte einen Ort eingeben.", "info");
    return;
  }
  showMsg("#stationsList", `Geokodiere "${query}" ...`, "info");
  const pos = await geocodeAddress(query);
  if (!pos) {
    showMsg("#stationsList", `Ort "${query}" nicht gefunden.`, "warning");
    return;
  }
  map.setView([pos.lat, pos.lon], 13);
  L.marker([pos.lat, pos.lon]).addTo(map).bindPopup(`${query}`).openPopup();
  showMsg("#stationsList", `Karte auf ${query} zentriert.`, "success");
}

// ------------------------
// Binden aller Handler beim Ready
// ------------------------
$(document).ready(function () {

  // init map and center on Pionierstrasse 28
  ensureMap();
  centerOnPionierstrasse();

  // a) Katze
  bindCatButton();

  // b) BTC
  bindBtcButton();

  // c) Wetter
  $("#weatherBtn").on("click", function () {
    loadWeatherAndChart();
  });

  // d) Stations
  $("#stationsBtn").on("click", async function () {
    if (!stationsData) {
      await loadStationsData();
    }
    renderNearestStations(WINT_LAT, WINT_LON, 5);
  });

  $("#reloadStationsBtn").on("click", async function () {
    stationsData = null;
    await loadStationsData();
  });

  $("#plzSearchBtn").on("click", function () {
    const q = $("#plzInput").val().trim();
    searchStationsByPlzOrPlace(q);
  });

  // e) place search
  $("#placeSearchBtn").on("click", function () {
    const q = $("#placeInput").val().trim();
    placeSearchAndCenter(q);
  });

});

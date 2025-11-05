$(document).ready(function () {


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

  const LAT = 47.3769;
  const LON = 8.5417;

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

const WINT_LAT = 47.4988;
const WINT_LON = 8.7237;


// app.js
$(function () {
  // Koordinaten Winterthur (einmal deklarieren)
  const WINT_LAT = 47.4988;
  const WINT_LON = 8.7237;

  // Daten-URL
  const DATA_URL = "https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/ch.bfe.ladestellen-elektromobilitaet.json";

  // Leaflet map initialisieren
  const map = L.map('map', { center: [WINT_LAT, WINT_LON], zoom: 13, zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Marker für Winterthur (Zentrum)
  const wintMarker = L.marker([WINT_LAT, WINT_LON]).addTo(map).bindPopup("Winterthur (Stadtzentrum)").openPopup();

  // LayerGroup für Stationen, damit wir sie löschen/neu setzen können
  const stationsLayer = L.layerGroup().addTo(map);

  // Haversine Distanz (km)
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Erdradius km
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // UI Elemente
  const $stationsContainer = $("#stationsContainer");
  const $stationsLoading = $("#stationsLoading");
  const $reloadBtn = $("#reloadBtn");
  const $toggleMapBtn = $("#toggleMapBtn");

  function showLoading(msg = "Lade Daten...") {
    $stationsContainer.html(`<div class="loading" id="stationsLoading">${msg}</div>`);
  }

  function showError(msg = "Fehler beim Laden der Daten") {
    $stationsContainer.html(`<div class="alert alert-danger">${msg}</div>`);
  }

  async function loadStationsAndRender() {
    try {
      showLoading("Daten werden geladen, bitte warten...");
      // fetch JSON
      const resp = await fetch(DATA_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (!Array.isArray(data) || data.length === 0) {
        showError("Keine Stationen in der Datei gefunden.");
        return;
      }

      // Mapée und Distanzberechnung
      const stations = data.map(s => {
        // Die JSON hat geometry.coordinates = [LON, LAT]
        const coords = s.geometry && s.geometry.coordinates ? s.geometry.coordinates : [null, null];
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        const name = s.properties && (s.properties.name || s.properties.betreiber) ? (s.properties.name || s.properties.betreiber) : "Unbenannte Station";
        const adresse = s.properties && (s.properties.adresse || s.properties.strasse || s.properties.ort) ? (s.properties.adresse || s.properties.strasse || s.properties.ort) : "";
        const power = s.properties && s.properties.leistungkw ? s.properties.leistungkw : null;
        const operator = s.properties && s.properties.betreiber ? s.properties.betreiber : "";
        const dist = (isFinite(lat) && isFinite(lon)) ? haversineKm(WINT_LAT, WINT_LON, lat, lon) : Infinity;
        return { name, adresse, lat, lon, dist, power, operator, raw: s };
      });

      // Nur gültige Koordinaten behalten
      const validStations = stations.filter(s => isFinite(s.dist));

      if (validStations.length === 0) {
        showError("Keine gültigen Koordinaten in den Daten gefunden.");
        return;
      }

      // Sortieren & Top 5
      const nearest = validStations.sort((a,b) => a.dist - b.dist).slice(0,5);

      // Karte aktualisieren: entferne alte Marker
      stationsLayer.clearLayers();

      // Fit bounds auf Winterthur + gefundene Stationen
      const groupLatLngs = [[WINT_LAT, WINT_LON]];

      // Erzeuge HTML Liste
      let html = '<ul class="list-group">';
      nearest.forEach((s, idx) => {
        const label = `${s.name}`;
        const addressLine = s.adresse ? `<div><strong>Adresse:</strong> ${s.adresse}</div>` : '';
        const powerLine = s.power ? `<div><strong>Leistung:</strong> ${s.power} kW</div>` : '';
        const operatorLine = s.operator ? `<div><strong>Betreiber:</strong> ${s.operator}</div>` : '';
        html += `
          <li class="list-group-item station-item" data-idx="${idx}">
            <div><strong>${label}</strong> <small class="text-muted">(${s.dist.toFixed(2)} km)</small></div>
            ${addressLine}
            ${operatorLine}
            ${powerLine}
          </li>
        `;
        // Marker hinzufügen
        const marker = L.marker([s.lat, s.lon]).bindPopup(`<strong>${s.name}</strong><br>${s.adresse || ""}<br><small>${s.dist.toFixed(2)} km von Winterthur</small>`);
        marker.addTo(stationsLayer);
        groupLatLngs.push([s.lat, s.lon]);
      });
      html += '</ul>';

      $stationsContainer.html(html);

      // Bounds setzen, so dass alle Marker + Winterthur sichtbar sind
      const bounds = L.latLngBounds(groupLatLngs);
      map.fitBounds(bounds.pad(0.2));

      // Klick auf Listeneintrag -> Popup auf Karte öffnen
      $(".station-item").on("click", function () {
        const idx = Number($(this).attr("data-idx"));
        const s = nearest[idx];
        if (!s) return;
        // find corresponding marker by position (inefficient but fine for 5)
        stationsLayer.eachLayer(layer => {
          const latlng = layer.getLatLng();
          if (latlng.lat === s.lat && latlng.lng === s.lon) {
            layer.openPopup();
            // zentrieren leicht verschoben
            map.setView([s.lat, s.lon], Math.max(map.getZoom(), 14), { animate: true });
          }
        });
      });

    } catch (err) {
      console.error(err);
      showError("Fehler beim Laden/Verarbeiten der Daten: " + err.message);
    }
  }

  // Buttons
  $reloadBtn.on("click", function () {
    loadStationsAndRender();
  });

  $toggleMapBtn.on("click", function () {
    $("#map").toggle();
    // wenn sichtbar, invalidieren -> Leaflet neu rendern
    if ($("#map").is(":visible")) {
      setTimeout(() => { map.invalidateSize(); }, 200);
    }
  });

  // Automatisch beim Laden initial laden
  loadStationsAndRender();
});



  let map;
  $("#mapBtn").on("click", function () {
    if (!map) {
      map = L.map('mapResult').setView([WINT_LAT, WINT_LON], 13);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);
      L.marker([WINT_LAT, WINT_LON]).addTo(map);
    }
  });

});

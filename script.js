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

  $("#stationsBtn").on("click", function () {
    $.ajax({
      url: "https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/ch.bfe.ladestellen-elektromobilitaet.json",
      method: "GET",
      success: function (data) {

        // Distanzberechnung (Haversine)
        const getDistance = (lat1, lon1, lat2, lon2) => {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
          return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        };

        const stationen = data.map(s => ({
          name: s.name,
          lat: s.lat,
          lon: s.lon,
          dist: getDistance(WINT_LAT, WINT_LON, s.lat, s.lon)
        }));

        const nearest = stationen
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 5);

        let html = `<ul class="list-group">`;
        nearest.forEach(s => {
          html += `
            <li class="list-group-item">
              📍 ${s.name} – ${s.dist.toFixed(2)} km
            </li>`;
        });
        html += `</ul>`;

        $("#stationsResult").html(html);
      },
      error: function () {
        $("#stationsResult").text("Fehler beim Laden der Ladestationen");
      }
    });
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

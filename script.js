$(document).ready(function () {

  // ============================
  // GOOGLE BILDERSUCHE (GET)
  // ============================
  $("#googleBtn").on("click", function () {
    const tier = "katze";
    const url =
      "https://www.google.ch/search?tbm=isch&q=" +
      encodeURIComponent(tier);

    window.open(url, "_blank");
  });


  // ============================
  // KATZEN API
  // ============================
  $("#catBtn").on("click", function () {
    $.get("https://api.thecatapi.com/v1/images/search", function (data) {
      $("#catResult").html(
        `<img src="${data[0].url}" class="img-fluid rounded">`
      );
    });
  });


  // ============================
  // BITCOIN API
  // ============================
  $("#btcBtn").on("click", function () {
    $.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=chf",
      function (data) {
        $("#btcResult").html(
          `<strong>${data.bitcoin.chf} CHF</strong>`
        );
      }
    );
  });


  // ============================
  // KARTE + TANKSTELLEN
  // ============================
  let map;

  $("#stationsBtn").on("click", function () {

    if (!map) {
      map = L.map("map").setView([47.3769, 8.5417], 11);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
      }).addTo(map);
    }

    // E-Ladestationen Schweiz
    fetch("https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/ch.bfe.ladestellen-elektromobilitaet.json")
      .then(res => res.json())
      .then(data => {

        data.features.slice(0, 50).forEach(station => {
          const coords = station.geometry.coordinates;
          const lon = coords[0];
          const lat = coords[1];

          L.marker([lat, lon])
            .addTo(map)
            .bindPopup("E-Ladestation");
        });

        $("#stationsResult").html(
          "<div class='alert alert-info'>50 Ladestationen auf der Karte angezeigt.</div>"
        );
      });
  });

});

$(document).ready(function() {
  // 1️⃣ Katzenbild
  $("#catBtn").on("click", function() {
    $("#catResult").html('<img src="https://placekitten.com/300/200" class="img-fluid rounded">');
  });

  // 2️⃣ Wetter
  $("#weatherBtn").on("click", function() {
    $("#weatherResult").text("Ort: Zürich – 21°C, sonnig ☀️");
  });

  // 3️⃣ Bitcoin
  $("#btcBtn").on("click", function() {
    $("#btcResult").text("Bitcoin: 61'000 USD / 56'000 CHF");
  });

  // 4️⃣ Tankstellen
  $("#stationsBtn").on("click", function() {
    $("#stationsResult").html(`
      <ul class="list-group">
        <li class="list-group-item">Shell E-Charge – 1.2 km</li>
        <li class="list-group-item">Ionity Zürich – 2.5 km</li>
        <li class="list-group-item">Fastned Spreitenbach – 4.3 km</li>
        <li class="list-group-item">Tesla Supercharger – 5.0 km</li>
        <li class="list-group-item">Move AG – 6.1 km</li>
      </ul>
    `);
  });

  // 5️⃣ Karte (Dummy)
  $("#mapBtn").on("click", function() {
    $("#mapResult").html('<img src="https://maps.googleapis.com/maps/api/staticmap?center=Zürich&zoom=12&size=400x300" class="img-fluid rounded">');
  });
});

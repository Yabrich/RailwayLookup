const form = document.getElementById("search-form");
const numeroInput = document.getElementById("numero");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

let routeMap = null;
let routeLayerGroup = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const numero = numeroInput.value.trim();

  if (!numero) {
    return;
  }

  statusEl.textContent = "Recherche en cours...";
  statusEl.className = "status";
  resultEl.innerHTML = "";
  form.querySelector("button").disabled = true;

  try {
    const res = await fetch(
      `http://localhost:3000/api/train?numero=${encodeURIComponent(numero)}`
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erreur API");
    }

    const data = await res.json();
    afficherResultats(numero, data);
    statusEl.textContent = "";
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "Erreur lors de la récupération des données : " + err.message;
    statusEl.className = "status error";
  } finally {
    form.querySelector("button").disabled = false;
  }
});

function afficherResultats(numero, data) {
  if (!data.vehicle_journeys || data.vehicle_journeys.length === 0) {
    resultEl.innerHTML =
      "<p>Aucune course trouvée pour ce numéro de train.</p>";
    return;
  }

  if (routeMap) {
    routeMap.remove();
    routeMap = null;
    routeLayerGroup = null;
  }

  const vj = data.vehicle_journeys[0];
  const headsign = vj.headsign || numero;

  let commercialMode = "Type inconnu";
  if (vj.id) {
    const modeSegment = vj.id.split(":").pop();
    if (modeSegment === "LongDistanceTrain") {
      commercialMode = "TGV ou Intercité";
    } else if (modeSegment === "RegionalTrain") {
      commercialMode = "TER";
    } else if (modeSegment) {
      commercialMode = modeSegment;
    }
  }

  const stops = (vj.stop_times || []).map((st) => {
    const stopPoint = st.stop_point || {};
    const coord = stopPoint.coord || null;

    const arrivalRaw = st.arrival_time;
    const departureRaw = st.departure_time;

    return {
      name: stopPoint.name || "Gare inconnue",
      arrival: formatHoraire(arrivalRaw),
      departure: formatHoraire(departureRaw),
      coord:
        coord && coord.lat && coord.lon
          ? {
              lat: Number.parseFloat(coord.lat),
              lon: Number.parseFloat(coord.lon),
            }
          : null,
    };
  });

  let html = `
    <div class="train-info">
      <p>
        <span class="tag">Train n°${headsign}</span>
        <span class="tag">${commercialMode}</span>
      </p>
  `;

  if (stops.length > 0) {
    html += `
      <div class="visualizations">
        <div class="map-container">
          <h3>Trajet sur la carte</h3>
          <div id="map" class="map"></div>
        </div>
        <div class="timeline-container">
          <h3>Parcours du train</h3>
          <div id="timeline" class="timeline"></div>
        </div>
      </div>
      <h3>Gares desservies</h3>
      <table>
        <thead>
          <tr>
            <th>Gare</th>
            <th>Arrivée</th>
            <th>Départ</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const stop of stops) {
      html += `
          <tr>
            <td>${stop.name}</td>
            <td>${stop.arrival}</td>
            <td>${stop.departure}</td>
          </tr>
      `;
    }

    html += `
        </tbody>
      </table>
    `;
  } else {
    html += "<p>Aucun arrêt trouvé dans les données.</p>";
  }

  html += "</div>";

  resultEl.innerHTML = html;

  if (stops.length > 0) {
    renderMap(stops);
    renderTimeline(stops);
  }
}

function renderMap(stops) {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) {
    return;
  }

  const coords = stops
    .map((stop) => stop.coord)
    .filter(
      (coord) =>
        coord &&
        Number.isFinite(coord.lat) &&
        !Number.isNaN(coord.lat) &&
        Number.isFinite(coord.lon) &&
        !Number.isNaN(coord.lon)
    )
    .map((coord) => [coord.lat, coord.lon]);

  if (typeof L === "undefined") {
    mapContainer.classList.add("map--empty");
    mapContainer.innerHTML =
      "<p>La librairie cartographique n'a pas pu être chargée. Vérifiez votre connexion réseau puis réessayez.</p>";
    return;
  }

  if (coords.length === 0) {
    mapContainer.classList.add("map--empty");
    mapContainer.innerHTML =
      "<p>Les coordonnées géographiques ne sont pas disponibles pour ce trajet.</p>";
    return;
  }

  mapContainer.classList.remove("map--empty");
  mapContainer.innerHTML = "";

  routeMap = L.map(mapContainer, {
    zoomControl: true,
  });

  routeLayerGroup = L.layerGroup();

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(routeMap);

  routeLayerGroup.addTo(routeMap);

  const line = L.polyline(coords, {
    color: "#6b21a8",
    weight: 5,
    opacity: 0.7,
    lineJoin: "round",
  }).addTo(routeLayerGroup);

  stops.forEach((stop, index) => {
    if (!stop.coord) {
      return;
    }

    const marker = L.circleMarker([stop.coord.lat, stop.coord.lon], {
      radius: 7,
      color: index === 0 || index === stops.length - 1 ? "#dc2626" : "#6b21a8",
      weight: 3,
      fillColor: "#fdf2f8",
      fillOpacity: 0.9,
    });

    marker
      .bindPopup(
        `<strong>${stop.name}</strong><br />${formatTimesForPopup(
          stop
        )}`
      )
      .addTo(routeLayerGroup);
  });

  routeMap.fitBounds(line.getBounds(), { padding: [40, 40] });
}

function renderTimeline(stops) {
  const timelineEl = document.getElementById("timeline");
  if (!timelineEl) {
    return;
  }

  timelineEl.innerHTML = "";

  stops.forEach((stop, index) => {
    const stopEl = document.createElement("div");
    stopEl.className = "timeline-stop";

    const nodeEl = document.createElement("div");
    nodeEl.className = "timeline-node";
    if (index === 0) {
      nodeEl.classList.add("origin");
    } else if (index === stops.length - 1) {
      nodeEl.classList.add("terminus");
    }

    const labelEl = document.createElement("div");
    labelEl.className = "timeline-label";
    labelEl.textContent = stop.name;

    const timesEl = document.createElement("div");
    timesEl.className = "timeline-times";
    const timesText = formatTimesForTimeline(stop);
    timesEl.innerHTML = timesText || "&nbsp;";

    stopEl.appendChild(nodeEl);
    stopEl.appendChild(labelEl);
    stopEl.appendChild(timesEl);

    timelineEl.appendChild(stopEl);
  });
}

function formatHoraire(value) {
  if (!value || value.length < 4) {
    return "";
  }

  const hours = value.slice(0, 2);
  const minutes = value.slice(2, 4);
  return `${hours}h${minutes}`;
}

function formatTimesForTimeline(stop) {
  const hasArrival = Boolean(stop.arrival);
  const hasDeparture = Boolean(stop.departure);

  if (hasArrival && hasDeparture && stop.arrival !== stop.departure) {
    return `Arrivée : ${stop.arrival}<br />Départ : ${stop.departure}`;
  }

  if (hasArrival) {
    return `Arrivée : ${stop.arrival}`;
  }

  if (hasDeparture) {
    return `Départ : ${stop.departure}`;
  }

  return "";
}

function formatTimesForPopup(stop) {
  const parts = [];

  if (stop.arrival) {
    parts.push(`Arrivée : ${stop.arrival}`);
  }

  if (stop.departure) {
    parts.push(`Départ : ${stop.departure}`);
  }

  return parts.join("<br />") || "Horaires non disponibles";
}
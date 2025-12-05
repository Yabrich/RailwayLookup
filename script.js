const form = document.getElementById("search-form");
const numeroInput = document.getElementById("numero");
const dateInput = document.getElementById("date-search"); // Nouvel input
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const HISTORY_KEY = "trainSearchHistory";
const HISTORY_MAX = 6;
const historyEl = document.getElementById("search-history");

let routeMap = null;
let routeLayerGroup = null;

// Initialiser la date à aujourd'hui par défaut
function initDate() {
  const today = new Date();
  // Format YYYY-MM-DD requis pour l'input date
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  dateInput.value = `${yyyy}-${mm}-${dd}`;
}
initDate();

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

let history = loadHistory();

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
  }
}

function renderHistory() {
  if (!historyEl) return;

  if (history.length === 0) {
    historyEl.innerHTML = "";
    historyEl.style.display = "none";
    return;
  }

  historyEl.style.display = "";
  historyEl.innerHTML = `
    <div class="history-title">Dernières recherches</div>
    <div class="history-list">
      ${history
        .map(
          (n) => `
        <button type="button" class="history-item" data-numero="${n}">
          ${n}
        </button>`
        )
        .join("")}
    </div>
  `;

  historyEl.querySelectorAll(".history-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const num = btn.dataset.numero;
      numeroInput.value = num;
      form.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true })
      );
    });
  });
}

function addToHistory(numero) {
  numero = numero.trim();
  if (!numero) return;

  history = history.filter((n) => n !== numero);
  history.unshift(numero);
  if (history.length > HISTORY_MAX) {
    history = history.slice(0, HISTORY_MAX);
  }

  saveHistory();
  renderHistory();
}

renderHistory();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const numero = numeroInput.value.trim();
  const searchDate = dateInput.value; // ex: 2025-11-14

  if (!numero) {
    return;
  }

  statusEl.textContent = "Recherche en cours...";
  statusEl.className = "status status--loading";
  resultEl.innerHTML = "";
  form.querySelector("button").disabled = true;

  try {
    const res = await fetch(
      `https://getapisncf-apisncf.up.railway.app/api/train?numero=${encodeURIComponent(numero)}`
    );

    if (!res.ok) {
      if(res.status === 404){
        statusEl.textContent = "Aucun train trouvé pour ce numéro. Vérifiez le numéro et réessayez.";
        statusEl.className = "status status--error";
        return;
      }

      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Erreur API");
    }

    const data = await res.json();
    afficherResultats(numero, data, searchDate); // On passe la date choisie
    addToHistory(numero);
    statusEl.textContent = "";
    statusEl.className = "status";
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "Erreur lors de la récupération des données : " + err.message;
    statusEl.className = "status status--error";
  } finally {
    form.querySelector("button").disabled = false;
  }
});

function afficherResultats(numero, data, searchDate) {
  if (!data.vehicle_journeys || data.vehicle_journeys.length === 0) {
    resultEl.innerHTML =
      "<p>😕 Aucun train trouvé pour ce numéro. Vérifie le numéro et réessaye.</p>";
    return;
  }

  if (routeMap) {
    routeMap.remove();
    routeMap = null;
    routeLayerGroup = null;
  }

  // Conversion date input (YYYY-MM-DD) vers format API (YYYYMMDD)
  const filterDateStr = searchDate.replace(/-/g, "");
  
  let vj = data.vehicle_journeys.find((journey) => {
    if (!journey.calendars || !journey.calendars[0].active_periods) return false;
    return journey.calendars[0].active_periods.some(
      (p) => filterDateStr >= p.begin && filterDateStr <= p.end
    );
  });

  if (!vj) {
     // Si pas de train à la date précise, on prévient l'utilisateur
     // mais on peut afficher le premier résultat par défaut ou juste une erreur.
     // Ici, pour être clair, on affiche une erreur spécifique si la date ne matche pas.
     resultEl.innerHTML = `<p>⚠️ Aucun train n°${numero} trouvé circulant le ${searchDate}.</p>`;
     // On pourrait aussi fallback sur vehicle_journeys[0] si vous préférez être permissif.
     // vj = data.vehicle_journeys[0]; 
     return;
  }

  const headsign = vj.headsign || numero;

  let commercialMode = "Type inconnu";
  if (vj.id) {
    const modeSegment = vj.id.split(":").pop();
    if (modeSegment === "LongDistanceTrain") {
      commercialMode = "TGV ou Intercité";
    } else if (modeSegment === "Train") {
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
    
    let stopDurationFormatted = "";
    if (arrivalRaw && departureRaw) {
        const diffSec = parseHHMMSS(departureRaw) - parseHHMMSS(arrivalRaw);
        if (diffSec > 0) {
            const mins = Math.floor(diffSec / 60);
            stopDurationFormatted = `${mins} min`;
        }
    }

    const isDelayed = st.arrival_status === "delayed" || st.departure_status === "delayed";

    return {
      name: stopPoint.name || "Gare inconnue",
      arrival: formatHoraire(arrivalRaw),
      departure: formatHoraire(departureRaw),
      stopduration: stopDurationFormatted,
      isDelayed: isDelayed,
      coord: coord && coord.lat && coord.lon
          ? { lat: Number.parseFloat(coord.lat), lon: Number.parseFloat(coord.lon) }
          : null,
    };
  });

  const travelTimeRaw = diffHHMMSS(vj.stop_times[0].departure_time, vj.stop_times[vj.stop_times.length-1].arrival_time);
  const travelTime = travelTimeRaw.hours + "h et " + travelTimeRaw.minutes + "min" 


  let html = `
    <div class="train-info train-info--enter">
      <p>
        <span class="tag">Train n°${headsign}</span>
        <span class="tag">${commercialMode}</span>
        <span class="tag">Date : ${searchDate}</span>
        <span class="tag">${travelTime} de trajet</span>
      </p>
  `;

  if (stops.length > 0) {
    html += `
      <h3>Itinéraire</h3>
      <div id="timeline" class="timeline"></div>

      <h3>Gares desservies</h3>
      <table>
        <thead>
          <tr>
            <th>Gare</th>
            <th>Arrivée</th>
            <th>Temps d'arrêt</th>
            <th>Départ</th>
          </tr>
        </thead>
        <tbody>
    `;

    let i = 0;
    for (const stop of stops) {
      const delayClass = stop.isDelayed ? "text-delayed" : "";
      html += `
          <tr class="${delayClass}">
            <td>${stop.name}${stop.isDelayed ? " ⚠️" : ""}</td>`;
      
      if(i == 0){
        html += `
            <td></td>
            <td></td>
            <td>${stop.departure}</td>
        `
      }

      else if(i == stops.length-1){
        html += `
            <td>${stop.arrival}</td>
            <td></td>
            <td></td>
        `
      }

      else{
        html += `
            <td>${stop.arrival}</td>
            <td>${stop.stopduration}</td>
            <td>${stop.departure}</td>
        `
      }

      i += 1;
    }

    html += `
        </tbody>
      </table>
      <div class="visualizations">
        <div class="map-container">
          <h3>Trajet sur la carte</h3>
          <div id="map" class="map"></div>
        </div>
      </div>
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
  const timeline = document.getElementById("timeline");
  if (!timeline) return;

  const content = `
    <div class="timeline-inner">
      ${stops
        .map((stop, index) => {
          const isFirst = index === 0;
          const isLast = index === stops.length - 1;

          let timeInfo = "";
          if (isFirst) {
            timeInfo = stop.departure ? `Départ<br>${stop.departure}` : "";
          } else if (isLast) {
            timeInfo = stop.arrival ? `Arrivée<br>${stop.arrival}` : "";
          } else {
            timeInfo = `${stop.arrival || ""}<br>${stop.departure || ""}`;
          }

          return `
            <div class="timeline-stop ${isFirst ? "timeline-stop--start" : ""} ${isLast ? "timeline-stop--end" : ""}">
              <div class="timeline-stop-dot"></div>
              <div class="timeline-stop-name">${stop.name}</div>
              <div class="timeline-stop-time">${timeInfo}</div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  timeline.innerHTML = content;
}

function formatHoraire(value) {
  if (!value || value.length < 4) {
    return "";
  }

  const hours = value.slice(0, 2);
  const minutes = value.slice(2, 4);
  return `${hours}h${minutes}`;
}

function formatDuration(value){
  const minutes = value/100;

  return `${minutes} min`;
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

function parseHHMMSS(str) {
  const h = parseInt(str.slice(0, 2), 10);
  const m = parseInt(str.slice(2, 4), 10);
  const s = parseInt(str.slice(4, 6), 10);
  return h * 3600 + m * 60 + s;
}

function diffHHMMSS(start, end) {
  const t1 = parseHHMMSS(start);
  const t2 = parseHHMMSS(end);

  const diff = t2 - t1;

  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  return { hours, minutes, seconds };
}

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const numero = urlParams.get("numero");
  if (numero) {
    numeroInput.value = numero;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }
});

function initDate() {
  const today = new Date();
  
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  dateInput.value = `${yyyy}-${mm}-${dd}`;
}

initDate();
const form = document.getElementById("search-form");
const numeroInput = document.getElementById("numero");
const dateInput = document.getElementById("date-search");
const timeInput = document.getElementById("time-search");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const boardResultEl = document.getElementById("board-result");
const historyEl = document.getElementById("search-history");

const tabs = document.querySelectorAll(".tab-btn");
const sectionNumber = document.getElementById("search-number");
const sectionStation = document.getElementById("search-station");
const stationNameInput = document.getElementById("station-name");
const stationIdInput = document.getElementById("station-id");
const stationSuggestions = document.getElementById("station-suggestions");
const boardTypeSelect = document.getElementById("board-type");

// Gestion de l'historique séparé
const HISTORY_KEY_NUMBER = "railway_history_number";
const HISTORY_KEY_STATION = "railway_history_station";
const HISTORY_MAX = 6;

let routeMap = null;
let routeLayerGroup = null;
let currentMode = "number";

function initDateTime() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  
  dateInput.value = `${yyyy}-${mm}-${dd}`;
  timeInput.value = `${hh}:${min}`;
}
initDateTime();

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    
    currentMode = tab.dataset.target === "search-number" ? "number" : "station";
    
    if (currentMode === "number") {
      sectionNumber.style.display = "";
      sectionStation.style.display = "none";
      resultEl.style.display = "";
      boardResultEl.style.display = "none";
    } else {
      sectionNumber.style.display = "none";
      sectionStation.style.display = "";
      resultEl.style.display = "none";
      boardResultEl.style.display = "";
      boardResultEl.innerHTML = ""; 
    }
    // Mise à jour de l'affichage de l'historique selon le mode
    renderHistory();
  });
});

//Autocomplétion
let debounceTimer;
stationNameInput.addEventListener("input", (e) => {
  clearTimeout(debounceTimer);
  const query = e.target.value.trim();
  
  if (query.length < 3) {
    stationSuggestions.style.display = "none";
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`https://getapisncf-apisncf.up.railway.app/api/places?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      renderSuggestions(data.places || []);
    } catch (err) {
      console.error("Erreur autocomplétion", err);
    }
  }, 300);
});

function renderSuggestions(places) {
  if (places.length === 0) {
    stationSuggestions.style.display = "none";
    return;
  }
  
  stationSuggestions.innerHTML = places.map(place => `
    <div class="suggestion-item" data-id="${place.id}" data-name="${place.name}">
      ${place.name}
    </div>
  `).join("");
  
  stationSuggestions.style.display = "block";
  
  stationSuggestions.querySelectorAll(".suggestion-item").forEach(item => {
    item.addEventListener("click", () => {
      stationNameInput.value = item.dataset.name;
      stationIdInput.value = item.dataset.id;
      stationSuggestions.style.display = "none";
    });
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete-wrapper")) {
    stationSuggestions.style.display = "none";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  
  statusEl.textContent = "Recherche en cours...";
  statusEl.className = "status status--loading";
  form.querySelector("button").disabled = true;

  if (currentMode === "number") {
    await handleNumberSearch();
  } else {
    await handleStationSearch();
  }
});

async function handleNumberSearch() {
  const numero = numeroInput.value.trim();
  const searchDate = dateInput.value;

  if (!numero) return;
  
  resultEl.innerHTML = "";

  try {
    const res = await fetch(
      `https://getapisncf-apisncf.up.railway.app/api/train?numero=${encodeURIComponent(numero)}`
    );

    if (!res.ok) {
        if(res.status === 404){
            statusEl.textContent = "Aucun train trouvé.";
            statusEl.className = "status status--error";
            return;
        }
        throw new Error("Erreur API");
    }

    const data = await res.json();
    afficherResultats(numero, data, searchDate);
    addToHistory(numero);
    statusEl.textContent = "";
    statusEl.className = "status";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Erreur : " + err.message;
    statusEl.className = "status status--error";
  } finally {
    form.querySelector("button").disabled = false;
  }
}

async function handleStationSearch() {
  const stationId = stationIdInput.value;
  const stationName = stationNameInput.value;
  const boardType = boardTypeSelect.value;
  const dateStr = dateInput.value.replace(/-/g, "");
  const timeStr = timeInput.value.replace(":", "") + "00";
  const dateTime = `${dateStr}T${timeStr}`;

  if (!stationId) {
    statusEl.textContent = "Veuillez sélectionner une gare valide.";
    statusEl.className = "status status--error";
    form.querySelector("button").disabled = false;
    return;
  }

  // Ajout à l'historique gare (on stocke un objet JSON stringifié pour garder ID et Nom)
  addToHistory({name: stationName, id: stationId});

  resultEl.innerHTML = "";
  boardResultEl.innerHTML = "";

  try {
    const res = await fetch(`https://getapisncf-apisncf.up.railway.app/api/board?station_id=${stationId}&type=${boardType}&datetime=${dateTime}`);
    const data = await res.json();
    
    renderBoard(data, boardType);
    statusEl.textContent = "";
    statusEl.className = "status";
  } catch (err) {
    statusEl.textContent = "Erreur : " + err.message;
    statusEl.className = "status status--error";
  } finally {
    form.querySelector("button").disabled = false;
  }
}

function renderBoard(data, type) {
  const key = type === "departures" ? "departures" : "arrivals";
  const rows = data[key];

  if (!rows || rows.length === 0) {
    boardResultEl.innerHTML = "<p>Aucun train trouvé pour cette période.</p>";
    return;
  }

  let html = `
    <table class="board-table">
      <thead>
        <tr>
          <th>Heure</th>
          <th>Train</th>
          <th>Destination / Provenance</th>
          <th>Mode</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(row => {
    const stopTime = row.stop_date_time;
    const info = row.display_informations;
    
    const baseTime = type === "departures" ? stopTime.base_departure_date_time : stopTime.base_arrival_date_time;
    const realTime = type === "departures" ? stopTime.departure_date_time : stopTime.arrival_date_time;
    
    const formattedTime = formatDateTimeAPI(baseTime);
    
    let delayHtml = "";
    if (realTime && baseTime && realTime !== baseTime) {
        const tReal = parseDateTime(realTime);
        const tBase = parseDateTime(baseTime);
        
        if (tReal > 0 && tBase > 0) {
            const diffMin = (tReal - tBase) / 60000;
            if (diffMin > 0) {
                delayHtml = `<span class="delay-badge">+${Math.ceil(diffMin)} min</span>`;
            }
        }
    }

    const trainNum = info.headsign;

    html += `
      <tr class="board-row" onclick="viewTrainDetail('${trainNum}')">
        <td class="time-cell">${formattedTime} ${delayHtml}</td>
        <td><strong>${trainNum}</strong></td>
        <td>${info.direction}</td>
        <td><span class="mode-badge">${info.commercial_mode}</span></td>
        <td><span class="type-badge">${info.physical_mode}</span></td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  boardResultEl.innerHTML = html;
  boardResultEl.style.display = "";
}

function parseDateTime(str) {
    if (!str || str.length < 13) return 0;
    // str format: 20251113T080400
    const year = parseInt(str.substring(0, 4));
    const month = parseInt(str.substring(4, 6)) - 1;
    const day = parseInt(str.substring(6, 8));
    const hour = parseInt(str.substring(9, 11));
    const min = parseInt(str.substring(11, 13));
    const sec = parseInt(str.substring(13, 15)) || 0;
    return new Date(year, month, day, hour, min, sec).getTime();
}

function formatDateTimeAPI(str) {
    if (!str || str.length < 13) return "";
    return `${str.substring(9, 11)}h${str.substring(11, 13)}`;
}

window.viewTrainDetail = (numero) => {
    tabs[0].click();
    numeroInput.value = numero;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
};

window.searchStation = async (stationName) => {
    tabs[1].click();
    
    stationNameInput.value = stationName;
    stationSuggestions.style.display = "none";
    
    statusEl.textContent = "Recherche de la gare...";
    statusEl.className = "status status--loading";
    
    try {
        const res = await fetch(`https://getapisncf-apisncf.up.railway.app/api/places?q=${encodeURIComponent(stationName)}`);
        const data = await res.json();
        
        if(data.places && data.places.length > 0) {
            const place = data.places[0];
            stationIdInput.value = place.id;
            stationNameInput.value = place.name;
            
            handleStationSearch();
        } else {
            statusEl.textContent = "Gare non trouvée.";
            statusEl.className = "status status--error";
        }
    } catch (err) {
        statusEl.textContent = "Erreur de connexion.";
        statusEl.className = "status status--error";
    }
};


// --- HISTORIQUE ---

function loadHistory(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistory(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function addToHistory(item) {
    const key = currentMode === "number" ? HISTORY_KEY_NUMBER : HISTORY_KEY_STATION;
    let history = loadHistory(key);

    if (currentMode === "number") {
        item = item.trim();
        history = history.filter((n) => n !== item);
        history.unshift(item);
    } else {
        history = history.filter((n) => n.id !== item.id);
        history.unshift(item);
    }

    if (history.length > HISTORY_MAX) {
        history = history.slice(0, HISTORY_MAX);
    }

    saveHistory(key, history);
    renderHistory();
}

function renderHistory() {
  const key = currentMode === "number" ? HISTORY_KEY_NUMBER : HISTORY_KEY_STATION;
  const history = loadHistory(key);

  if (!historyEl) return;

  if (history.length === 0) {
    historyEl.innerHTML = "";
    historyEl.style.display = "none";
    return;
  }

  historyEl.style.display = "";
  
  if (currentMode === "number") {
      historyEl.innerHTML = `
        <div class="history-title">Derniers trains</div>
        <div class="history-list">
          ${history
            .map(
              (n) => `
            <button type="button" class="history-item" onclick="applyHistoryNumber('${n}')">
              ${n}
            </button>`
            )
            .join("")}
        </div>
      `;
  } else {
      historyEl.innerHTML = `
        <div class="history-title">Dernières gares</div>
        <div class="history-list">
          ${history
            .map(
              (place) => `
            <button type="button" class="history-item" onclick="applyHistoryStation('${place.name}', '${place.id}')">
              ${place.name}
            </button>`
            )
            .join("")}
        </div>
      `;
  }
}

window.applyHistoryNumber = (val) => {
    numeroInput.value = val;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
};

window.applyHistoryStation = (name, id) => {
    stationNameInput.value = name;
    stationIdInput.value = id;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
};

function getStationBaseId(fullId) {
  if (!fullId) return "";
  const parts = fullId.split(':');
  // On suppose que l'ID numérique est toujours en 3ème position
  return parts.length >= 3 ? parts[2] : fullId;
}

// Initial render
renderHistory();

function afficherResultats(numero, data, searchDate) {
  const filterDateStr = searchDate.replace(/-/g, "");
  if (!data.vehicle_journeys || data.vehicle_journeys.length === 0) {
    resultEl.innerHTML = "<p>😕 Aucun train trouvé pour ce numéro.</p>";
    return;
  }

  // Fallback si pas de calendrier ou correspondance: on prend le premier
  let vj = data.vehicle_journeys.find((journey) => {
    if (!journey.calendars || !journey.calendars[0].active_periods) return false;
    return journey.calendars[0].active_periods.some(
      (p) => filterDateStr >= p.begin && filterDateStr <= p.end
    );
  }) || data.vehicle_journeys[0];

  if (routeMap) {
    routeMap.remove();
    routeMap = null;
    routeLayerGroup = null;
  }

  const headsign = vj.headsign || numero;

  let commercialMode = "Type inconnu";
  if (vj.id) {
    const parts = vj.id.split(":");
    // Essayer de trouver le mode dans l'ID (souvent à la fin ou avant "LongDistanceTrain")
    // Ex: vehicle_journey:SNCF:2025...:LongDistanceTrain
    if (vj.id.includes("LongDistanceTrain")) commercialMode = "TGV / Intercités";
    else if (vj.id.includes("TER")) commercialMode = "TER";
    else if (parts.length > 0) commercialMode = parts[parts.length - 1];
  }

  const disruptionsMap = {};
  if (data.disruptions) {
    data.disruptions.forEach(d => disruptionsMap[d.id] = d);
  }

  const stops = (vj.stop_times || []).map((st) => {
    const stopPoint = st.stop_point || {};
    const coord = stopPoint.coord || null;

    // Horaires théoriques
    const arrivalRaw = st.arrival_time;
    const departureRaw = st.departure_time;
    let isDelayed = false;


    let stopDurationFormatted = "";
    if (arrivalRaw && departureRaw) {
        const diffSec = parseHHMMSS(departureRaw) - parseHHMMSS(arrivalRaw);
        if (diffSec > 0) {
            const mins = Math.floor(diffSec / 60);
            stopDurationFormatted = `${mins} min`;
        }
    }

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
  const travelTime = travelTimeRaw.hours + "h " + travelTimeRaw.minutes + "min" 

  let html = `
    <div class="train-info train-info--enter">
      <p>
        <span class="tag">Train n°${headsign}</span>
        <span class="tag">${commercialMode}</span>
        <span class="tag">Le ${searchDate}</span>
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

      html += `
          <tr>
            <td>
                <a class="station-link" onclick="searchStation('${stop.name.replace(/'/g, "\\'")}')">
                    ${stop.name}
                </a>
            </td>`;
      
      if(i == 0){
        html += `
            <td>-</td>
            <td>-</td>
            <td>${stop.departure}</td>
        `
      }
      else if(i == stops.length-1){
        html += `
            <td>${stop.arrival}</td>
            <td>-</td>
            <td>-</td>
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
  if (!mapContainer) return;

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
    mapContainer.innerHTML = "<p>Erreur chargement carte.</p>";
    return;
  }

  if (coords.length === 0) {
    mapContainer.classList.add("map--empty");
    mapContainer.innerHTML = "<p>Coordonnées non disponibles.</p>";
    return;
  }

  mapContainer.classList.remove("map--empty");
  mapContainer.innerHTML = "";

  routeMap = L.map(mapContainer, { zoomControl: true });
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
    if (!stop.coord) return;
    const marker = L.circleMarker([stop.coord.lat, stop.coord.lon], {
      radius: 7,
      color: index === 0 || index === stops.length - 1 ? "#dc2626" : "#6b21a8",
      weight: 3,
      fillColor: "#fdf2f8",
      fillOpacity: 0.9,
    });
    marker.bindPopup(`<strong>${stop.name}</strong>`).addTo(routeLayerGroup);
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
          if (isFirst) timeInfo = stop.departure;
          else if (isLast) timeInfo = stop.arrival;
          else timeInfo = stop.arrival;

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
  if (!value || value.length < 4) return "-";
  return `${value.slice(0, 2)}h${value.slice(2, 4)}`;
}

function parseHHMMSS(str) {
  if (!str) return 0;
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
  return { hours, minutes };
}

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const numero = urlParams.get("numero");
  if (numero) {
    numeroInput.value = numero;
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  }
});
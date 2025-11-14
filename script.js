const form = document.getElementById("search-form");
const numeroInput = document.getElementById("numero");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

form.addEventListener("submit", async (e) => {
e.preventDefault();
const numero = numeroInput.value.trim();

if (!numero) return;

statusEl.textContent = "Recherche en cours...";
statusEl.className = "status";
resultEl.innerHTML = "";
form.querySelector("button").disabled = true;

try {
    const res = await fetch(
    `http://localhost:3000/api/train?numero=${encodeURIComponent(
        numero
    )}`
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

const vj = data.vehicle_journeys[0];
console.log(data)

const headsign = vj.headsign || numero;
const route =
    vj.route && vj.route.name ? vj.route.name : "Ligne inconnue";
const commercialMode =
    vj.commercial_mode && vj.commercial_mode.name
    ? vj.commercial_mode.name
    : "Mode inconnu";

const stops = (vj.stop_times || []).map((st) => {
    const stopName =
    st.stop_point && st.stop_point.name
        ? st.stop_point.name
        : "Gare inconnue";

    const depart = st.departure_time || "";
    const arrivee = st.arrival_time || "";

    return {
    name: stopName,
    arrival: arrivee,
    departure: depart,
    };
});

let html = `
    <div class="train-info">
    <p>
        <span class="tag">Train ${headsign}</span>
        <span class="tag">${commercialMode}</span>
    </p>
    <p><strong>Ligne :</strong> ${route}</p>
`;

if (stops.length > 0) {
    html += `
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
}
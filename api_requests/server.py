import os
import time
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

SNCF_API_KEY = os.getenv("SNCF_API_KEY")

TRAIN_CACHE = {}
CACHE_DURATION = 120

if not SNCF_API_KEY:
    raise RuntimeError("⚠️ La variable d'environnement SNCF_API_KEY n'est pas définie")

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return response

# --- Route existante : Recherche par numéro de train ---
@app.route("/api/train", methods=["GET"])
def get_train():
    numero = request.args.get("numero")
    
    if not numero or not numero.isalnum():
        return jsonify({"error": "Numéro invalide"}), 400

    current_time = time.time()
    if numero in TRAIN_CACHE:
        timestamp, cached_data = TRAIN_CACHE[numero]
        if current_time - timestamp < CACHE_DURATION:
            print(f"Cache hit pour {numero}")
            return jsonify(cached_data)

    url = "https://api.sncf.com/v1/coverage/sncf/vehicle_journeys"
    params = {"headsign": numero}

    try:
        sncf_response = requests.get(
            url,
            params=params,
            auth=(SNCF_API_KEY, ""),
            timeout=10,
        )
    except requests.RequestException as e:
        return jsonify({"error": "Erreur de connexion à l'API SNCF", "details": str(e)}), 502

    if not sncf_response.ok:
        return jsonify({"error": "Erreur API SNCF", "status_code": sncf_response.status_code}), sncf_response.status_code

    data = sncf_response.json()
    TRAIN_CACHE[numero] = (current_time, data)
    return jsonify(data)

# --- Nouvelle Route : Recherche de gare (Autocomplétion) ---
@app.route("/api/places", methods=["GET"])
def get_places():
    query = request.args.get("q")
    if not query:
        return jsonify([])

    url = "https://api.sncf.com/v1/coverage/sncf/places"
    # On filtre pour ne chercher que les zones d'arrêt (gares)
    params = {"q": query, "type[]": "stop_area"}

    try:
        r = requests.get(url, params=params, auth=(SNCF_API_KEY, ""), timeout=5)
        if not r.ok:
            return jsonify([])
        return jsonify(r.json())
    except Exception as e:
        print("Erreur places:", e)
        return jsonify([])

# --- Nouvelle Route : Tableau des départs/arrivées (Board) ---
@app.route("/api/board", methods=["GET"])
def get_board():
    station_id = request.args.get("station_id")
    board_type = request.args.get("type", "departures") # departures ou arrivals
    datetime_str = request.args.get("datetime") # Format YYYYMMDDTHHMMSS

    if not station_id:
        return jsonify({"error": "Station ID manquant"}), 400

    # L'endpoint change selon qu'on veut les départs ou les arrivées
    endpoint = "departures" if board_type == "departures" else "arrivals"
    url = f"https://api.sncf.com/v1/coverage/sncf/stop_areas/{station_id}/{endpoint}"
    
    params = {}
    if datetime_str:
        params["from_datetime"] = datetime_str

    try:
        r = requests.get(url, params=params, auth=(SNCF_API_KEY, ""), timeout=10)
        if not r.ok:
            return jsonify({"error": "Erreur API SNCF Board"}), r.status_code
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
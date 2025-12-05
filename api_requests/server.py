import os
import time  # [AJOUT] Pour gérer le temps du cache
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

SNCF_API_KEY = os.getenv("SNCF_API_KEY")

# [AJOUT] Cache simple en mémoire : { "8864": (timestamp, data_json) }
TRAIN_CACHE = {}
CACHE_DURATION = 120  # 2 minutes de cache

if not SNCF_API_KEY:
    raise RuntimeError("⚠️ La variable d'environnement SNCF_API_KEY n'est pas définie")

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return response

@app.route("/api/train", methods=["GET"])
def get_train():
    numero = request.args.get("numero")
    
    # [MODIFICATION] Validation de l'entrée (Sécurité)
    if not numero or not numero.isalnum():
        return jsonify({"error": "Numéro invalide (caractères alphanumériques uniquement)"}), 400

    # [AJOUT] Vérification du cache
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

    # [AJOUT] Sauvegarde dans le cache
    TRAIN_CACHE[numero] = (current_time, data)

    return jsonify(data)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
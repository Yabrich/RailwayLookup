import os
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

SNCF_API_KEY = os.getenv("SNCF_API_KEY")

if not SNCF_API_KEY:
    raise RuntimeError("⚠️ La variable d'environnement SNCF_API_KEY n'est pas définie")

# CORS très simple pour autoriser ton frontend local
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    return response


@app.route("/api/train", methods=["GET"])
def get_train():
    """
    Endpoint proxy : /api/train?numero=8864

    - lit le paramètre ?numero=...
    - appelle l'API SNCF vehicle_journeys avec headsign=numero
    - renvoie le JSON brut (ou une version nettoyée si tu veux)
    """
    numero = request.args.get("numero")
    if not numero:
        return jsonify({"error": "Paramètre 'numero' manquant"}), 400

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
        return (
            jsonify(
                {
                    "error": "Erreur de connexion à l'API SNCF",
                    "details": str(e),
                }
            ),
            502,
        )

    if not sncf_response.ok:
        return (
            jsonify(
                {
                    "error": "Erreur API SNCF",
                    "status_code": sncf_response.status_code,
                    "body": sncf_response.text,
                }
            ),
            sncf_response.status_code,
        )

    data = sncf_response.json()

    return jsonify(data)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)

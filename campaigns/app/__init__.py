import logging

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from . import db
from .config import Settings, load_settings


def create_app(settings: Settings | None = None) -> Flask:
    settings = settings or load_settings()
    app = Flask(__name__)
    app.config["SETTINGS"] = settings
    app.json.sort_keys = False
    db.init_db(settings)

    @app.errorhandler(HTTPException)
    def http_error(exc: HTTPException):
        return jsonify({"error": exc.description}), exc.code

    from .routes import bp

    app.register_blueprint(bp)
    logging.basicConfig(level=logging.INFO)
    return app

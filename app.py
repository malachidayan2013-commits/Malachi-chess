from flask import Flask, render_template, request, jsonify, session
from datetime import datetime, timedelta
import random

app = Flask(__name__)
app.secret_key = "change-me-to-a-random-secret"


PLAYERS = {}
INVITATIONS = {}
GAMES = {}
INVITE_COUNTER = 1
GAME_COUNTER = 1
PLAYER_TIMEOUT = timedelta(minutes=5)


def cleanup_players():
    now = datetime.utcnow()
    to_delete = [name for name, info in PLAYERS.items() if now - info["last_seen"] > PLAYER_TIMEOUT]
    for name in to_delete:
        del PLAYERS[name]


def get_current_player():
    name = session.get("name")
    if not name:
        return None
    info = PLAYERS.get(name)
    if not info:
        return None
    info["last_seen"] = datetime.utcnow()
    return name


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/whoami")
def whoami():
    cleanup_players()
    name = get_current_player()
    return jsonify({"name": name})


@app.route("/api/login", methods=["POST"])
def login():
    global PLAYERS
    cleanup_players()
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "יש להזין שם."}), 400
    if len(name) > 20:
        return jsonify({"ok": False, "error": "השם ארוך מדי."}), 400
    if name in PLAYERS:
        return jsonify({"ok": False, "error": "השם כבר תפוס. נסה שם אחר."}), 400

    session["name"] = name
    PLAYERS[name] = {"last_seen": datetime.utcnow(), "game_id": None}
    return jsonify({"ok": True, "name": name})


@app.route("/api/logout", methods=["POST"])
def logout():
    name = session.pop("name", None)
    if name and name in PLAYERS:
        del PLAYERS[name]
    return jsonify({"ok": True})


@app.route("/api/players")
def players():
    cleanup_players()
    current = get_current_player()
    return jsonify(
        {
            "players": [name for name in PLAYERS.keys() if name != current],
            "me": current,
        }
    )


@app.route("/api/invite", methods=["POST"])
def invite():
    global INVITE_COUNTER
    cleanup_players()
    me = get_current_player()
    if not me:
        return jsonify({"ok": False, "error": "עליך להתחבר קודם."}), 401

    data = request.get_json(force=True)
    target = (data.get("target") or "").strip()
    if not target or target == me:
        return jsonify({"ok": False, "error": "עליך להזמין חבר אחר."}), 400
    if target not in PLAYERS:
        return jsonify({"ok": False, "error": "החבר לא מחובר כרגע."}), 400

    invite_id = INVITE_COUNTER
    INVITE_COUNTER += 1
    INVITATIONS[invite_id] = {
        "id": invite_id,
        "from": me,
        "to": target,
        "status": "pending",
        "game_id": None,
    }
    return jsonify({"ok": True, "invite_id": invite_id})


@app.route("/api/invitations")
def invitations():
    cleanup_players()
    me = get_current_player()
    if not me:
        return jsonify({"ok": False, "error": "לא מחובר."}), 401

    incoming = []
    outgoing = []
    for inv in INVITATIONS.values():
        if inv["to"] == me:
            incoming.append(inv)
        if inv["from"] == me:
            outgoing.append(inv)
    return jsonify({"ok": True, "incoming": incoming, "outgoing": outgoing})


@app.route("/api/invitations/respond", methods=["POST"])
def respond_invitation():
    global GAME_COUNTER
    cleanup_players()
    me = get_current_player()
    if not me:
        return jsonify({"ok": False, "error": "לא מחובר."}), 401

    data = request.get_json(force=True)
    invite_id = data.get("invite_id")
    accept = bool(data.get("accept"))
    inv = INVITATIONS.get(invite_id)
    if not inv or inv["to"] != me or inv["status"] != "pending":
        return jsonify({"ok": False, "error": "הזמנה לא תקינה."}), 400

    if not accept:
        inv["status"] = "declined"
        return jsonify({"ok": True, "status": "declined"})

    white, black = (inv["from"], inv["to"])
    if random.choice([True, False]):
        white, black = black, white

    game_id = GAME_COUNTER
    GAME_COUNTER += 1
    inv["status"] = "accepted"
    inv["game_id"] = game_id

    GAMES[game_id] = {
        "id": game_id,
        "white": white,
        "black": black,
        "moves": [],
        "turn": "white",
        "winner": None,
    }

    if white in PLAYERS:
        PLAYERS[white]["game_id"] = game_id
    if black in PLAYERS:
        PLAYERS[black]["game_id"] = game_id

    my_color = "white" if me == white else "black"
    return jsonify(
        {
            "ok": True,
            "status": "accepted",
            "game_id": game_id,
            "color": my_color,
            "opponent": inv["from"] if me == inv["to"] else inv["to"],
        }
    )


@app.route("/api/game/state")
def game_state():
    cleanup_players()
    me = get_current_player()
    if not me:
        return jsonify({"ok": False, "error": "לא מחובר."}), 401

    game_id = request.args.get("game_id", type=int)
    game = GAMES.get(game_id)
    if not game or me not in (game["white"], game["black"]):
        return jsonify({"ok": False, "error": "המשחק לא נמצא."}), 404

    color = "white" if me == game["white"] else "black"
    return jsonify(
        {
            "ok": True,
            "game": game,
            "color": color,
            "opponent": game["black"] if color == "white" else game["white"],
        }
    )


@app.route("/api/game/move", methods=["POST"])
def game_move():
    cleanup_players()
    me = get_current_player()
    if not me:
        return jsonify({"ok": False, "error": "לא מחובר."}), 401

    data = request.get_json(force=True)
    game_id = data.get("game_id")
    move = data.get("move")
    game = GAMES.get(game_id)
    if not game or me not in (game["white"], game["black"]):
        return jsonify({"ok": False, "error": "המשחק לא נמצא."}), 404

    my_color = "white" if me == game["white"] else "black"
    if game["turn"] != my_color:
        return jsonify({"ok": False, "error": "לא התור שלך."}), 400
    if game["winner"]:
        return jsonify({"ok": False, "error": "המשחק כבר הסתיים."}), 400

    if not isinstance(move, dict):
        return jsonify({"ok": False, "error": "מהלך לא חוקי."}), 400

    game["moves"].append(move)
    game["turn"] = "black" if game["turn"] == "white" else "white"
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True)


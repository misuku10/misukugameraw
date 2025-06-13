import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import random
import math

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

players = {}
RADIUS = 20
world_size = 2000
chat_history = []

def get_players_list():
    return [
        {
            "sid": sid,
            "name": player["name"],
            "x": player["x"],
            "y": player["y"],
            "score": player["score"],
            "alive": player["alive"],
            "direction": player.get("direction", "left"),
        }
        for sid, player in players.items()
    ]

def get_leaderboard():
    plist = [
        {
            "sid": sid,
            "name": p["name"],
            "score": p["score"],
        }
        for sid, p in players.items()
    ]
    plist.sort(key=lambda p: (-p["score"], p["name"]))
    return plist

def find_spawn(exclude_sid=None):
    for _ in range(50):
        x = random.randint(RADIUS, world_size - RADIUS)
        y = random.randint(RADIUS, world_size - RADIUS)
        ok = True
        for sid, p in players.items():
            if sid == exclude_sid:
                continue
            if p["alive"] and math.hypot(x - p["x"], y - p["y"]) < RADIUS * 2:
                ok = False
                break
        if ok:
            return x, y
    return RADIUS, RADIUS

@app.after_request
def add_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

@app.route("/")
def index():
    import time
    return render_template("index.html", time=int(time.time()))

@socketio.on("join")
def on_join(data):
    sid = request.sid
    name = data.get("name", "")
    x, y = find_spawn()
    players[sid] = {
        "name": name,
        "x": x,
        "y": y,
        "score": 0,
        "alive": True,
        "direction": "left",
    }
    emit("joined", {**players[sid], "session_id": sid})
    emit("chat_history", chat_history, room=sid)
    broadcast_state()
    emit_leaderboard()

@socketio.on("move")
def on_move(data):
    sid = request.sid
    if sid in players and players[sid]["alive"]:
        px = int(data.get("x", players[sid]["x"]))
        py = int(data.get("y", players[sid]["y"]))
        direction = data.get("direction", players[sid].get("direction", "left"))
        players[sid]["direction"] = direction
        px = min(max(RADIUS, px), world_size - RADIUS)
        py = min(max(RADIUS, py), world_size - RADIUS)
        collide = False
        for other_sid, other in players.items():
            if other_sid == sid or not other["alive"]:
                continue
            dx = px - other["x"]
            dy = py - other["y"]
            dist = (dx**2 + dy**2) ** 0.5
            if dist < RADIUS * 2:
                collide = True
                break
        if not collide:
            players[sid]["x"] = px
            players[sid]["y"] = py
        broadcast_state()
        emit_leaderboard()

@socketio.on("fireball")
def on_fireball(data):
    sid = request.sid
    socketio.emit("fireball", {**data, "sid": sid})

@socketio.on("hit")
def on_hit(data):
    attacker = request.sid
    target = data.get("target")
    if attacker == target:
        return
    if (
        attacker in players and players[attacker]["alive"] and
        target in players and players[target]["alive"]
    ):
        victim_score = players[target]["score"]
        bonus = 3 + max(0, int(victim_score * 0.5))
        players[attacker]["score"] += bonus
        players[target]["alive"] = False
        emit("killed", {"sid": target}, room=target)
        broadcast_state()
        emit_leaderboard()

@socketio.on("revive")
def on_revive():
    sid = request.sid
    if sid not in players:
        return
    x, y = find_spawn(exclude_sid=sid)
    players[sid]["x"] = x
    players[sid]["y"] = y
    players[sid]["alive"] = True
    emit("revived", {"sid": sid, "x": x, "y": y, "name": players[sid]["name"]}, room=sid)
    broadcast_state()
    emit_leaderboard()

@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    if sid in players:
        del players[sid]
    broadcast_state()
    emit_leaderboard()

@socketio.on("chat_msg")
def on_chat_msg(data):
    sid = request.sid
    nick = players[sid]["name"] if sid in players else "???"
    text = data.get("text", "").strip()
    if not isinstance(text, str) or len(text) == 0 or len(text) > 120:
        return
    if "http://" in text or "https://" in text or "www." in text or "@" in text or "/" in text:
        return
    msg = {"nick": nick[:16], "text": text}
    chat_history.append(msg)
    if len(chat_history) > 100:
        chat_history.pop(0)
    socketio.emit("chat_msg", msg)

def broadcast_state():
    socketio.emit("players", get_players_list())

def emit_leaderboard():
    alive_players = [
        {
            "sid": sid,
            "name": p["name"],
            "score": p["score"],
        }
        for sid, p in players.items() if p["alive"]
    ]
    alive_players.sort(key=lambda p: (-p["score"], p["name"]))
    socketio.emit("leaderboard", alive_players)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
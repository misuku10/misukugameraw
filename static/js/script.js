let player = null;
let mySid = null;
let socket = null;
let lastPlayersList = [];
let othersElems = {};
let worldElem = null;
let worldSize = 2000;
let characterElem = null;
let worldCanvas = null;
let gridSize = 400;
let gridCols = worldSize / gridSize;
let gridRows = worldSize / gridSize;
let gridNames = [];
let minimapElem = null;
let cameraScale = 2;
let camX = worldSize / 2, camY = worldSize / 2;
let keysPressed = {};
let mouseAngle = 0;
let lastFireTime = 0;
const fireDelay = 700;
let deathGUI = null;
let leaderboardElem = null;
let lastDirection = "left";
const crownImgSrc = "/static/images/crown.png";
const RADIUS = 25;
const LOCALSTORAGE_SESSION_KEY = "my_game_active_session";
let antiBotOverlay = null;
let gameLoopActive = true;
let isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
let joystick = null;
let joystickData = {active: false, dx: 0, dy: 0};
const maxSpeed = 4;
let velocity = { x: 0, y: 0 };

let onPointerDownShoot, onPointerUpShoot;
let joystickInUse = false;

document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('mousedown', e => { if (e.detail > 1) e.preventDefault(); });

window.addEventListener('keydown', function(e) {
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA"))
        return;
    if (document.activeElement && document.activeElement.id === "name") return;
    const key = e.key.toLowerCase();
    if (["w","a","s","d","ц","ф","ы","в","arrowup","arrowdown","arrowleft","arrowright"].includes(key)) {
        keysPressed[key] = true;
        e.preventDefault();
    }
});

window.addEventListener('keyup', function(e) {
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA"))
        return;
    if (document.activeElement && document.activeElement.id === "name") return;
    const key = e.key.toLowerCase();
    if (["w","a","s","d","ц","ф","ы","в","arrowup","arrowdown","arrowleft","arrowright"].includes(key)) {
        keysPressed[key] = false;
        e.preventDefault();
    }
});
window.addEventListener('blur', function() {
    for (let k in keysPressed) keysPressed[k] = false;
});

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem(LOCALSTORAGE_SESSION_KEY) === "active") {
        showAntiBotOverlay();
    }
    document.getElementById('game-world').style.display = "none";
    document.getElementById('observer-gui').style.display = "flex";
    styleGUI();
    connectSocketIO();
    let style = document.createElement('style');
    style.innerHTML = `
#virtual-world img,
#virtual-world,
#world-container {
  will-change: transform;
}
#joystick {
  box-shadow: 0 2px 16px #0002;
  user-select: none;
  touch-action: none;
  z-index: 200;
}
body.mobile #game-chat-gui, body.mobile #leaderboard {
  font-size: 1.16rem;
}
`;
    document.head.appendChild(style);
    if (isMobile) {
        createJoystick();
        document.body.classList.add('mobile');
    }
    setupShooting();
});

window.addEventListener("storage", function(e) {
    if (e.key === LOCALSTORAGE_SESSION_KEY) {
        if (e.newValue === "active") {
            showAntiBotOverlay();
        } else {
            hideAntiBotOverlay();
        }
    }
});
window.addEventListener("beforeunload", function() {
    localStorage.removeItem(LOCALSTORAGE_SESSION_KEY);
});

function showAntiBotOverlay() {
    if (antiBotOverlay) return;
    antiBotOverlay = document.createElement("div");
    antiBotOverlay.id = "anti-bot-overlay";
    antiBotOverlay.style.position = "fixed";
    antiBotOverlay.style.top = "0";
    antiBotOverlay.style.left = "0";
    antiBotOverlay.style.width = "100vw";
    antiBotOverlay.style.height = "100vh";
    antiBotOverlay.style.background = "rgba(240,240,240,0.97)";
    antiBotOverlay.style.zIndex = "99999";
    antiBotOverlay.style.display = "flex";
    antiBotOverlay.style.flexDirection = "column";
    antiBotOverlay.style.justifyContent = "center";
    antiBotOverlay.style.alignItems = "center";
    antiBotOverlay.style.filter = "grayscale(1)";
    antiBotOverlay.innerHTML = `
        <h1 style="font-size:2.2rem; color:#222; margin-bottom:30px;">Вы уже находитесь в игре</h1>
        <div style="font-size:1.3rem; color:#444;">Завершите игру в другой вкладке,<br>чтобы запустить здесь.</div>
    `;
    document.body.appendChild(antiBotOverlay);
    gameLoopActive = false;
    if (socket && socket.connected) {
        socket.disconnect();
    }
}
function hideAntiBotOverlay() {
    if (antiBotOverlay && antiBotOverlay.parentNode) {
        antiBotOverlay.parentNode.removeChild(antiBotOverlay);
    }
    antiBotOverlay = null;
    gameLoopActive = true;
}

function connectSocketIO() {
    if (socket) return;
    socket = io();

    socket.on('joined', data => {
        mySid = data.session_id || data.sid;
        for (let sid in othersElems) {
            if (othersElems[sid].parentNode) othersElems[sid].parentNode.removeChild(othersElems[sid]);
            if (othersElems[sid].__crownElem && othersElems[sid].__crownElem.parentNode)
                othersElems[sid].__crownElem.parentNode.removeChild(othersElems[sid].__crownElem);
            delete othersElems[sid];
        }
        lastPlayersList = [];
        document.getElementById('observer-gui').style.display = "none";
        document.getElementById('game-world').style.display = "block";
        showWorld();
        showCharacter(data);
        camX = data.x;
        camY = data.y;
        showLeaderboard();
        updateOthersSocket(lastPlayersList);
        startGameLoop();
        const chatDiv = document.getElementById('game-chat-gui');
        if (chatDiv) chatDiv.style.display = "block";
    });

    socket.on('players', players => {
        lastPlayersList = players;
        updateOthersSocket(players);
        drawMinimap();
    });

    socket.on('fireball', fb => { addFireball(fb); });

    socket.on('killed', data => {
        if (mySid === data.sid) showDeathGUI();
    });

    socket.on('leaderboard', updateLeaderboard);

    socket.on('revived', data => {
        if (mySid === data.sid) {
            if (deathGUI) { deathGUI.remove(); deathGUI = null; }
            if (player && typeof data.x === "number" && typeof data.y === "number") {
                player.x = data.x;
                player.y = data.y;
                camX = data.x;
                camY = data.y;
            }
        }
    });

    socket.on('knockback', data => {
        if (data.sid === mySid && player) {
            applyKnockback(player, data.angle, data.force || 6, 16);
        }
        if (data.sid !== mySid && othersElems[data.sid]) {
            if (!othersElems[data.sid].knockback) othersElems[data.sid].knockback = {x:0, y:0};
            othersElems[data.sid].knockback.x = Math.cos(data.angle) * (data.force || 6);
            othersElems[data.sid].knockback.y = Math.sin(data.angle) * (data.force || 6);
            othersElems[data.sid].knockbackTimer = 16;
        }
    });

    chatInitSocket();
}

function styleGUI() {
    const gui = document.getElementById('observer-gui');
    gui.style.position = "fixed";
    gui.style.top = "0";
    gui.style.left = "0";
    gui.style.width = "100vw";
    gui.style.height = "100vh";
    gui.style.display = "flex";
    gui.style.justifyContent = "center";
    gui.style.alignItems = "center";
    gui.style.background = "linear-gradient(135deg, #a26cf6 0%, #7f3fd5 100%)";
    gui.style.zIndex = "1000";
    gui.innerHTML = `
        <form id="gui-form" autocomplete="off">
            <h1 style="color: #202020; font-size: 2.1rem; margin-bottom: 10px; letter-spacing: 1px;">Игра котят</h1>
            <div style="text-align:center; font-size:1.0rem; color:#444; margin-bottom: 18px;">(От Мисуку)</div>
            <input type="text" id="name" maxlength="16" placeholder="Имя" autocomplete="off" style="
                font-size: 1.2rem;
                padding: 12px 18px;
                border-radius: 10px;
                border: 1px solid #bbb;
                margin-bottom: 24px;
                width: 180px;
                background: #fff;
                box-shadow: 0 2px 12px #eee;
            ">
            <button id="spawn-btn" type="submit" style="
                background: #444;
                color: #fff;
                border: none;
                border-radius: 10px;
                padding: 12px 36px;
                font-size: 1.1rem;
                font-weight: bold;
                cursor: pointer;
                letter-spacing: 1px;
                transition: background 0.2s;
            ">Играть</button>
        </form>
    `;
    document.getElementById('gui-form').onsubmit = function(e) {
        e.preventDefault();
        spawn();
        return false;
    };
}

function spawn() {
    const name = document.getElementById('name').value.trim();
    hideNickError();
    if (!name) return;
    if (!isValidNick(name)) {
        showNickError("Имя не должно содержать символы!");
        return;
    }
    if (localStorage.getItem(LOCALSTORAGE_SESSION_KEY) === "active") {
        showAntiBotOverlay();
        return;
    }
    localStorage.setItem(LOCALSTORAGE_SESSION_KEY, "active");
    socket.emit('join', { name: name });
}

function showWorld() {
    worldElem = document.getElementById('game-world');
    worldElem.innerHTML = '';
    generateGridNames();
    worldCanvas = createWorldCanvas();
    drawGridBackground(worldCanvas.getContext('2d'));
    drawWorldBorder(worldCanvas.getContext('2d'));
    let container = document.createElement('div');
    container.style.width = worldSize + 'px';
    container.style.height = worldSize + 'px';
    container.style.position = 'absolute';
    container.id = 'world-container';
    container.appendChild(worldCanvas);
    let worldDiv = document.createElement('div');
    worldDiv.style.width = worldSize + 'px';
    worldDiv.style.height = worldSize + 'px';
    worldDiv.style.position = 'absolute';
    worldDiv.style.background = 'transparent';
    worldDiv.id = 'virtual-world';
    container.appendChild(worldDiv);
    worldElem.appendChild(container);
    createMinimap();
    centerCameraWorld();
}

function showCharacter(data) {
    const worldDiv = document.getElementById('virtual-world');
    if (characterElem && characterElem.parentNode) characterElem.parentNode.removeChild(characterElem);
    characterElem = document.createElement('img');
    characterElem.src = '/static/images/animal.png';
    characterElem.style.position = 'absolute';
    characterElem.style.width = '50px';
    characterElem.style.height = '50px';
    characterElem.style.borderRadius = '50%';
    characterElem.title = data.name;
    characterElem.style.transformOrigin = "50% 50%";
    worldDiv.appendChild(characterElem);
    player = {
        sid: mySid,
        name: data.name,
        x: data.x,
        y: data.y,
        speed: 4,
        knockback: {x:0, y:0},
        knockbackTimer: 0
    };
    updateCharacterPosition();
    setupMouse();
}

function setupMouse() {
    document.addEventListener('mousemove', function(e) {
        if (!player) return;
        let centerX = window.innerWidth/2;
        let centerY = window.innerHeight/2;
        mouseAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    });
}

function setupShooting() {
    if (onPointerDownShoot) document.removeEventListener('pointerdown', onPointerDownShoot);
    if (onPointerUpShoot) document.removeEventListener('pointerup', onPointerUpShoot);

    const activePointers = new Set();

    onPointerDownShoot = function(e) {
        if (!player) return;
        if (joystickInUse) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (activePointers.has(e.pointerId)) return;
        activePointers.add(e.pointerId);

        if (e.pointerType !== 'mouse') {
            let cx = window.innerWidth / 2;
            let cy = window.innerHeight / 2;
            mouseAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
        }
        shootFireball();
    };

    onPointerUpShoot = function(e) {
        activePointers.delete(e.pointerId);
    };

    document.addEventListener('pointerdown', onPointerDownShoot);
    document.addEventListener('pointerup', onPointerUpShoot);
}

function createWorldCanvas() {
    let canvas = document.createElement('canvas');
    canvas.width = worldSize;
    canvas.height = worldSize;
    canvas.style.position = 'absolute';
    canvas.id = 'world-canvas';
    return canvas;
}

function generateGridNames() {
    gridNames = [];
    for (let row = 0; row < gridRows; row++) {
        let rowNames = [];
        let rowChar = String.fromCharCode(65 + row);
        for (let col = 1; col <= gridCols; col++) {
            rowNames.push(rowChar + col);
        }
        gridNames.push(rowNames);
    }
}

function drawGridBackground(ctx) {
    ctx.clearRect(0, 0, worldSize, worldSize);
    ctx.fillStyle = "#e0e0e0";
    ctx.fillRect(0, 0, worldSize, worldSize);
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 2;
    ctx.font = "28px Arial";
    ctx.fillStyle = "#888";
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            let x = col * gridSize;
            let y = row * gridSize;
            ctx.strokeRect(x, y, gridSize, gridSize);
            ctx.fillText(gridNames[row][col], x + 16, y + 40);
        }
    }
}

function drawWorldBorder(ctx) {
    ctx.save();
    ctx.strokeStyle = "#6f39da";
    ctx.lineWidth = 8;
    ctx.globalAlpha = 1;
    ctx.strokeRect(0, 0, worldSize, worldSize);
    ctx.restore();
}

function createMinimap() {
    if (minimapElem) minimapElem.remove();
    minimapElem = document.createElement('canvas');
    minimapElem.width = isMobile ? 50 : 250;
    minimapElem.height = isMobile ? 50 : 250;
    minimapElem.id = 'minimap';
    minimapElem.style.position = 'absolute';
    minimapElem.style.right = isMobile ? '8px' : '24px';
    minimapElem.style.bottom = isMobile ? '8px' : '24px';
    minimapElem.style.background = '#fff';
    minimapElem.style.border = '2px solid #888';
    minimapElem.style.borderRadius = '8px';
    minimapElem.style.zIndex = 20;
    minimapElem.style.opacity = '0.95';
    document.body.appendChild(minimapElem);
    drawMinimap();
}

function drawMinimap() {
    if (!minimapElem) return;
    let ctx = minimapElem.getContext('2d');
    ctx.clearRect(0, 0, minimapElem.width, minimapElem.height);
    let scale = minimapElem.width / worldSize;
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1.2;
    ctx.font = isMobile ? "6px Arial" : "13px Arial";
    ctx.fillStyle = "#444";
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            let x = col * gridSize * scale;
            let y = row * gridSize * scale;
            ctx.strokeRect(x, y, gridSize * scale, gridSize * scale);
            if (minimapElem.width >= 100) {
                ctx.fillText(gridNames[row][col], x + (isMobile ? 2 : 8), y + (isMobile ? 6 : 22));
            }
        }
    }
    if (player) {
        ctx.fillStyle = "#f00";
        ctx.beginPath();
        ctx.arc(player.x * scale, player.y * scale, isMobile ? 1.5 : 7, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    lastPlayersList.forEach(p => {
        if (p.sid === mySid) return;
        ctx.fillStyle = "#09f";
        let px = p.x * scale;
        let py = p.y * scale;
        ctx.beginPath();
        ctx.arc(px, py, isMobile ? 1 : 5, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function centerCameraWorld() {
    const container = document.getElementById('world-container');
    if (!container) return;
    const scaleX = window.innerWidth / worldSize;
    const scaleY = window.innerHeight / worldSize;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (window.innerWidth - worldSize * scale) / 2;
    const offsetY = (window.innerHeight - worldSize * scale) / 2;
    container.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    container.style.left = '';
    container.style.top = '';
    container.style.transformOrigin = '0 0';
}

function centerCamera() {
    if (!player) return;
    camX += (player.x - camX) * 0.10;
    camY += (player.y - camY) * 0.10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const container = document.getElementById('world-container');
    let scale = cameraScale;
    let offsetX = vw / 2 - camX * scale;
    let offsetY = vh / 2 - camY * scale;
    container.style.transform = `scale(${scale}) translate(${offsetX / scale}px, ${offsetY / scale}px)`;
    container.style.transformOrigin = '0 0';
    container.style.left = '';
    container.style.top = '';
}

function applyKnockback(obj, angle, force = 6, duration = 16) {
    obj.knockback = {
        x: Math.cos(angle) * force,
        y: Math.sin(angle) * force
    };
    obj.knockbackTimer = duration;
}

function handlePlayerCollisions() {
    if (!player) return;
    lastPlayersList.forEach(p => {
        if (p.sid === mySid || !p.alive) return;
        let dx = player.x - p.x;
        let dy = player.y - p.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 2 * RADIUS) {
            let angle = Math.atan2(dy, dx);
            applyKnockback(player, angle, 6, 16);
            if (socket) {
                socket.emit("knockback", {
                    target: p.sid,
                    angle: angle + Math.PI,
                    force: 6
                });
            }
        }
    });
}

function getMovementInput() {
    if (isMobile && joystick) {
        let dx = joystickData.dx, dy = joystickData.dy;
        if (dx !== 0 && dy !== 0) {
            const inv = 1 / Math.sqrt(2);
            dx *= inv; dy *= inv;
        }
        return {dx, dy};
    }
    let dx = 0, dy = 0;
    if (keysPressed["arrowup"] || keysPressed["w"] || keysPressed["ц"]) dy -= 1;
    if (keysPressed["arrowdown"] || keysPressed["s"] || keysPressed["ы"]) dy += 1;
    if (keysPressed["arrowleft"] || keysPressed["a"] || keysPressed["ф"]) dx -= 1;
    if (keysPressed["arrowright"] || keysPressed["d"] || keysPressed["в"]) dx += 1;
    if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.sqrt(2);
        dx *= inv; dy *= inv;
    }
    return {dx, dy};
}

let lastFrameTime = performance.now();
function startGameLoop() {
    gameLoopActive = true;
    lastFrameTime = performance.now();
    requestAnimationFrame(gameLoopRAF);
}

function gameLoopRAF(now) {
    if (!gameLoopActive) return;
    let dt = Math.min((now - lastFrameTime) / 16.666, 2);
    lastFrameTime = now;
    if (player) {
        if (player.knockbackTimer > 0) {
            player.x += player.knockback.x * dt;
            player.y += player.knockback.y * dt;
            player.knockback.x *= 0.7;
            player.knockback.y *= 0.7;
            player.knockbackTimer -= 1 * dt;
        } else {
            let {dx, dy} = getMovementInput();
            player.x += dx * maxSpeed * dt;
            player.y += dy * maxSpeed * dt;
            if (Math.abs(dx) > 0.1) {
                lastDirection = dx > 0 ? "right" : "left";
            }
        }
        player.x = Math.max(RADIUS, Math.min(worldSize - RADIUS, player.x));
        player.y = Math.max(RADIUS, Math.min(worldSize - RADIUS, player.y));
        updateCharacterPosition();
    }
    handlePlayerCollisions();
    centerCamera();
    requestAnimationFrame(gameLoopRAF);
}

function shootFireball() {
    const now = Date.now();
    if (now - lastFireTime < fireDelay) return;
    lastFireTime = now;
    if (!player) return;
    const cx = player.x;
    const cy = player.y;
    const speed = 7;
    if (socket && mySid && player) {
        socket.emit('fireball', {
            x: cx,
            y: cy,
            angle: mouseAngle,
            speed: speed
        });
        addFireball({x: cx, y: cy, angle: mouseAngle, speed: speed, sid: mySid, isMine: true});
    }
}

function addFireball(fb) {
    let fireballElem = document.createElement('img');
    fireballElem.src = '/static/images/fireball.png';
    fireballElem.style.position = 'absolute';
    fireballElem.style.width = '32px';
    fireballElem.style.height = '32px';
    fireballElem.style.left = (fb.x - 16) + 'px';
    fireballElem.style.top = (fb.y - 16) + 'px';
    fireballElem.style.transform = `rotate(${fb.angle}rad)`;
    fireballElem.style.pointerEvents = 'none';
    let vworld = document.getElementById('virtual-world');
    if (vworld) vworld.appendChild(fireballElem);
    let step = 0;
    let hitSids = new Set();

    function move() {
        step++;
        fb.x += Math.cos(fb.angle) * fb.speed;
        fb.y += Math.sin(fb.angle) * fb.speed;
        fireballElem.style.left = (fb.x - 16) + 'px';
        fireballElem.style.top = (fb.y - 16) + 'px';
        fireballElem.style.transform = `rotate(${fb.angle}rad)`;
        if (fb.isMine) {
            lastPlayersList.forEach(p => {
                if (p.sid !== mySid && p.alive && !hitSids.has(p.sid)) {
                    let dx = fb.x - p.x;
                    let dy = fb.y - p.y;
                    if (Math.sqrt(dx*dx + dy*dy) < 32) {
                        socket.emit('hit', {target: p.sid});
                        hitSids.add(p.sid);
                    }
                }
            });
        }
        if (
            fb.x < 0 || fb.x > worldSize ||
            fb.y < 0 || fb.y > worldSize ||
            step > 150
        ) {
            if (fireballElem.parentNode) fireballElem.parentNode.removeChild(fireballElem);
            return;
        }
        setTimeout(move, 16);
    }
    move();
}

function roundSubpixel(x) { return Math.round(x * 2) / 2; }

function updateCharacterPosition() {
    if (!characterElem || !player) return;
    const px = player.x - RADIUS;
    const py = player.y - RADIUS;
    characterElem.style.left = "";
    characterElem.style.top = "";
    characterElem.style.transform =
        `translate(${px}px, ${py}px) ${lastDirection === "right" ? "scaleX(-1)" : "scaleX(1)"}`;
    updatePlayerCrown(lastPlayersList, getLeader(lastPlayersList));
    drawMinimap();
    sendMove();
}

function sendMove() {
    if (socket && mySid && player) {
        socket.emit('move', {x: player.x, y: player.y, direction: lastDirection});
    }
}

function getLeader(players) {
    if (!players || players.length === 0) return null;
    const maxScore = Math.max(...players.map(p => p.score || 0));
    if (maxScore > 0) {
        return players.filter(p => p.alive)
            .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    } else {
        return players.find(p => p.alive);
    }
}

function updateOthersSocket(players) {
    const leader = getLeader(players);
    for (let sid in othersElems) {
        const p = players.find(p => p.sid === sid);
        if (!p || p.sid === mySid || !p.alive) {
            if (othersElems[sid].parentNode) othersElems[sid].parentNode.removeChild(othersElems[sid]);
            if (othersElems[sid].__crownElem && othersElems[sid].__crownElem.parentNode)
                othersElems[sid].__crownElem.parentNode.removeChild(othersElems[sid].__crownElem);
            delete othersElems[sid];
        }
    }
    players.forEach(p => {
        if (p.sid === mySid || !p.alive) return;
        if (!othersElems[p.sid]) {
            let img = document.createElement('img');
            img.src = '/static/images/animal.png';
            img.style.position = 'absolute';
            img.style.width = '50px';
            img.style.height = '50px';
            img.style.borderRadius = '50%';
            img.title = p.name;
            img.knockback = {x:0, y:0};
            img.knockbackTimer = 0;
            let vworld = document.getElementById('virtual-world');
            if (vworld) vworld.appendChild(img);
            othersElems[p.sid] = img;
        }
        let crownElem = othersElems[p.sid].__crownElem;
        if (!crownElem) {
            crownElem = document.createElement('img');
            crownElem.src = crownImgSrc;
            crownElem.style.position = 'absolute';
            crownElem.style.width = '36px';
            crownElem.style.height = '28px';
            crownElem.style.pointerEvents = 'none';
            crownElem.style.zIndex = 10;
            let vworld = document.getElementById('virtual-world');
            if (vworld) vworld.appendChild(crownElem);
            othersElems[p.sid].__crownElem = crownElem;
        }
        if (p.direction === "right") {
            othersElems[p.sid].style.transform =
                `translate(${Math.round(p.x - RADIUS)}px, ${Math.round(p.y - RADIUS)}px) scaleX(-1)`;
        } else {
            othersElems[p.sid].style.transform =
                `translate(${Math.round(p.x - RADIUS)}px, ${Math.round(p.y - RADIUS)}px) scaleX(1)`;
        }
        othersElems[p.sid].__last_x = p.x;
        if (leader && p.sid === leader.sid) {
            crownElem.style.display = '';
            crownElem.style.transform = `translate(${Math.round(p.x - RADIUS + 7)}px, ${Math.round(p.y - RADIUS - 8)}px)`;
        } else {
            crownElem.style.display = 'none';
        }
    });
    updatePlayerCrown(players, leader);
}

let myCrownElem = null;
function updatePlayerCrown(players, leader) {
    if (!player || !characterElem) {
        if (myCrownElem && myCrownElem.parentNode) myCrownElem.parentNode.removeChild(myCrownElem);
        myCrownElem = null;
        return;
    }
    if (!myCrownElem) {
        myCrownElem = document.createElement('img');
        myCrownElem.src = crownImgSrc;
        myCrownElem.style.position = 'absolute';
        myCrownElem.style.width = '36px';
        myCrownElem.style.height = '28px';
        myCrownElem.style.pointerEvents = 'none';
        myCrownElem.style.zIndex = 10;
        let vworld = document.getElementById('virtual-world');
        if (vworld) vworld.appendChild(myCrownElem);
    }
    if (leader && player.sid === leader.sid) {
        myCrownElem.style.display = '';
        myCrownElem.style.transform = `translate(${player.x - RADIUS + 7}px, ${player.y - RADIUS - 15}px)`;
    } else {
        myCrownElem.style.display = 'none';
    }
}

function showLeaderboard() {
    if (leaderboardElem) leaderboardElem.remove();
    leaderboardElem = document.createElement('div');
    leaderboardElem.id = "leaderboard";
    leaderboardElem.style.position = "fixed";
    leaderboardElem.style.top = isMobile ? "8px" : "16px";
    leaderboardElem.style.right = isMobile ? "8px" : "16px";
    leaderboardElem.style.background = "#fff";
    leaderboardElem.style.border = "2px solid #bbb";
    leaderboardElem.style.borderRadius = "8px";
    leaderboardElem.style.zIndex = 99;
    leaderboardElem.style.padding = isMobile ? "4px 8px" : "12px 20px";
    leaderboardElem.style.fontSize = isMobile ? "10px" : "16px";
    leaderboardElem.style.minWidth = isMobile ? "100px" : "200px";
    leaderboardElem.innerHTML = `<b>Лидеры</b>`;
    document.body.appendChild(leaderboardElem);
}
function updateLeaderboard(leaderboard) {
    if (!leaderboardElem) return;
    let html = `<b>Лидеры</b><table style="margin-top:0;">`;
    leaderboard.forEach((p, idx) => {
        const trClass = (p.sid === mySid) ? 'highlight' : '';
        html += `<tr class="${trClass}">
            <td style="text-align:right;width:28px;padding-right:0;">${idx + 1}.</td>
            <td class="nickname" style="padding-left:0;">${p.name}</td>
            <td class="score" style="text-align:right;width:48px;padding-right:0;">${p.score}</td>
        </tr>`;
    });
    html += `</table>`;
    leaderboardElem.innerHTML = html;
}

function showDeathGUI() {
    if (deathGUI) deathGUI.remove();
    deathGUI = document.createElement('div');
    deathGUI.id = "death-gui";
    deathGUI.style.position = "fixed";
    deathGUI.style.top = "50%";
    deathGUI.style.left = "50%";
    deathGUI.style.transform = "translate(-50%,-50%)";
    deathGUI.style.background = "#fff";
    deathGUI.style.border = "2px solid #888";
    deathGUI.style.borderRadius = "10px";
    deathGUI.style.padding = "40px 50px";
    deathGUI.style.zIndex = 200;
    deathGUI.innerHTML = `<h2>Вы погибли!</h2><br>
        <button id="revive-btn" style="font-size:20px;padding:10px 40px;">Возродиться</button>`;
    document.body.appendChild(deathGUI);
    document.getElementById("revive-btn").onclick = function() {
        socket.emit("revive");
        deathGUI.remove();
        deathGUI = null;
    };
    localStorage.removeItem(LOCALSTORAGE_SESSION_KEY);
}

function isValidNick(str) {
    return /^[a-zA-Z0-9а-яА-ЯёЁ _\-]{1,16}$/.test(str) && !/(https?:\/\/|www\.|@|\/)/gi.test(str);
}

function showNickError(msg) {
    let err = document.getElementById('nick-error');
    if (!err) {
        err = document.createElement('div');
        err.id = 'nick-error';
        err.style.color = '#d00';
        err.style.fontSize = '1.05rem';
        err.style.marginTop = '-18px';
        err.style.marginBottom = '12px';
        err.style.textAlign = 'center';
        let form = document.getElementById('gui-form');
        if (form) form.insertBefore(err, form.children[1]);
    }
    err.textContent = msg;
    err.style.display = '';
}
function hideNickError() {
    let err = document.getElementById('nick-error');
    if (err) err.style.display = 'none';
}

let chatMessages = [];

function renderChatMessages() {
    const box = document.getElementById('game-chat-messages');
    if (!box) return;
    box.innerHTML = chatMessages.map(msg =>
        `<div><b style="color:#c2f;">${escapeHtml(msg.nick)}</b>: ${escapeHtml(msg.text)}</div>`
    ).join('');
    box.scrollTop = box.scrollHeight;
}

function escapeHtml(str) {
    return str.replace(/[<>&"]/g, s => ({
        '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'
    }[s]));
}

function isValidChatText(str) {
    return /^[a-zA-Z0-9а-яА-ЯёЁ .,!?'"()\[\]{};:+=_\- ]+$/i.test(str)
        && !/(https?:\/\/|www\.|@|\/)/gi.test(str);
}

function chatInitSocket() {
    if (!socket) return;
    socket.on('chat_history', msgs => {
        chatMessages = msgs.slice(-100);
        renderChatMessages();
    });
    socket.on('chat_msg', msg => {
        if (!msg.nick || !msg.text) return;
        chatMessages.push(msg);
        if (chatMessages.length > 100) chatMessages.shift();
        renderChatMessages();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('game-chat-gui')) {
        const chatDiv = document.createElement('div');
        chatDiv.id = 'game-chat-gui';
        chatDiv.style.display = "none";
        chatDiv.innerHTML = `
          <div id="game-chat-messages"></div>
          <form id="game-chat-form" autocomplete="off">
            <input id="game-chat-input" maxlength="120" placeholder="Введите сообщение..." autocomplete="off" />
            <button type="submit">⮞</button>
          </form>
        `;
        document.body.appendChild(chatDiv);
    }
    const gui = document.getElementById('game-chat-gui');
    if (gui) {
        gui.addEventListener('copy', e => e.preventDefault());
        gui.addEventListener('cut', e => e.preventDefault());
        gui.addEventListener('paste', e => {
            let paste = (e.clipboardData || window.clipboardData).getData('text');
            if (!isValidChatText(paste)) e.preventDefault();
        });
    }
    const form = document.getElementById('game-chat-form');
    const input = document.getElementById('game-chat-input');
    if (form && input) {
        form.onsubmit = function(e) {
            e.preventDefault();
            let text = input.value.trim();
            if (!text || !isValidChatText(text)) {
                input.value = '';
                return false;
            }
            if (socket) socket.emit('chat_msg', {text});
            input.value = '';
            return false;
        };
    }
    createChatButton();
    createChatCloseButton();
    document.getElementById('game-chat-gui').style.display = "none";
});

function createJoystick() {
    joystick = document.createElement('div');
    joystick.id = 'joystick';
    joystick.style.position = 'fixed';
    joystick.style.left = '24px';
    joystick.style.bottom = '24px';
    joystick.style.width = '120px';
    joystick.style.height = '120px';
    joystick.style.background = 'rgba(140,140,140,0.07)';
    joystick.style.borderRadius = '50%';
    joystick.style.zIndex = 200;
    joystick.style.touchAction = 'none';
    joystick.innerHTML = `<div id="joystick-handle" style="
        position:absolute;left:45px;top:45px;width:30px;height:30px;
        background:rgba(120,120,120,0.25);border-radius:50%;box-shadow:0 2px 9px #888">
    </div>`;
    document.body.appendChild(joystick);

    const handle = joystick.querySelector('#joystick-handle');
    let origin = {x: 60, y: 60};
    let dragging = false;

    function updateHandle(dx, dy) {
        handle.style.left = (45 + dx * 40) + "px";
        handle.style.top = (45 + dy * 40) + "px";
    }

    joystick.addEventListener('touchstart', e => {
        e.preventDefault();
        dragging = true;
        joystickData.active = true;
        joystickInUse = true;
        handle.style.transition = '';
        document.body.style.userSelect = 'none';
    }, {passive: false});
    joystick.addEventListener('touchmove', e => {
        if (!dragging) return;
        const rect = joystick.getBoundingClientRect();
        const touch = e.touches[0];
        let dx = (touch.clientX - rect.left - origin.x) / 48;
        let dy = (touch.clientY - rect.top - origin.y) / 48;
        let len = Math.sqrt(dx*dx + dy*dy);
        if (len > 1) { dx /= len; dy /= len; }
        joystickData.dx = dx;
        joystickData.dy = dy;
        updateHandle(dx, dy);
    }, {passive: false});
    joystick.addEventListener('touchend', e => {
        dragging = false;
        joystickData.active = false;
        joystickInUse = false;
        joystickData.dx = 0; joystickData.dy = 0;
        handle.style.transition = 'all 0.2s';
        updateHandle(0, 0);
        document.body.style.userSelect = '';
    }, {passive: false});
}

function createChatButton() {
    if (document.getElementById('open-chat-btn')) return;
    if (!isMobile) return;
    const btn = document.createElement('button');
    btn.id = 'open-chat-btn';
    btn.textContent = "Чат";
    btn.className = 'chat-open-btn';
    btn.onclick = () => {
        document.getElementById('game-chat-gui').style.display = "flex";
        btn.style.display = "none";
    };
    document.body.appendChild(btn);
}
function createChatCloseButton() {
    if (document.getElementById('close-chat-btn')) return;
    if (!isMobile) return;
    const closeBtn = document.createElement('button');
    closeBtn.id = 'close-chat-btn';
    closeBtn.textContent = "×";
    closeBtn.className = 'chat-close-btn';
    closeBtn.onclick = () => {
        document.getElementById('game-chat-gui').style.display = "none";
        document.getElementById('open-chat-btn').style.display = "block";
    };
    document.getElementById('game-chat-gui').appendChild(closeBtn);
}
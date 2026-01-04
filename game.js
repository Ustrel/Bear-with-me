const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Screens
const mainMenu = document.getElementById('main-menu');
const gameOverScreen = document.getElementById('game-over-screen');
const gameContainer = document.getElementById('game-container');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverMessage = document.getElementById('game-over-message');

// UI Elements
const scoreEl = document.getElementById('score');
const castleHealthEl = document.getElementById('castle-health');
const moneyEl = document.getElementById('money');
const waveInfoEl = document.getElementById('wave-info');
const startWaveBtn = document.getElementById('start-wave-btn');

// Game State
let currentLevelIndex = 0;
let score = 0;
let money = 100;
let castleHealth = 100;
let maxCastleHealth = 100;
let wave = 0;
let totalWaves = 0;
let gameActive = false;
let waveInProgress = false;
let frameCount = 0;
let spawnTimer = 0;
let bearsToSpawn = [];

// Constants
let TILE_SIZE = 60; // Will be dynamic based on screen size
const TOWER_COST = 50;
const PATH_COLOR = '#C2B280';

// Entities
let bears = [];
let towers = [];
let projectiles = [];
let pathPoints = [];

// Levels Configuration
const levels = [
    {
        name: "The Meadow",
        waves: 5,
        difficultyMultiplier: 1.0,
        path: [ // Normalized coordinates (0-1)
            {x: 0.0, y: 0.2}, {x: 0.3, y: 0.2}, {x: 0.3, y: 0.8},
            {x: 0.7, y: 0.8}, {x: 0.7, y: 0.4}, {x: 0.9, y: 0.4}, {x: 0.9, y: 0.6}
        ]
    },
    {
        name: "The Forest",
        waves: 8,
        difficultyMultiplier: 1.2,
        path: [
            {x: 0.0, y: 0.5}, {x: 0.2, y: 0.5}, {x: 0.2, y: 0.2},
            {x: 0.5, y: 0.2}, {x: 0.5, y: 0.8}, {x: 0.8, y: 0.8}, {x: 0.8, y: 0.5}, {x: 1.0, y: 0.5}
        ]
    },
    {
        name: "The Mountain",
        waves: 10,
        difficultyMultiplier: 1.5,
        path: [
            {x: 0.1, y: 0.0}, {x: 0.1, y: 0.8}, {x: 0.3, y: 0.8},
            {x: 0.3, y: 0.2}, {x: 0.6, y: 0.2}, {x: 0.6, y: 0.9},
            {x: 0.9, y: 0.9}, {x: 0.9, y: 0.5}, {x: 0.5, y: 0.5} // Ends in middle
        ]
    }
];

// Resize handling
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    TILE_SIZE = Math.min(canvas.width, canvas.height) / 15;
}
window.addEventListener('resize', resize);
resize();

// --- Classes ---

class Bear {
    constructor(type) {
        this.pathIndex = 0;
        this.speed = 1.5;
        this.health = 30;
        this.maxHealth = 30;
        this.radius = TILE_SIZE * 0.3;
        this.color = '#8B4513'; // Standard Brown
        this.moneyValue = 10;
        this.damage = 10; // Damage to castle
        this.type = type || 'normal';
        this.attackCooldown = 0;

        // Apply type stats
        if (this.type === 'tank') {
            this.health = 100;
            this.maxHealth = 100;
            this.speed = 0.8;
            this.radius = TILE_SIZE * 0.4;
            this.color = '#3e2723'; // Dark Brown
            this.moneyValue = 30;
            this.damage = 25;
        } else if (this.type === 'attacker') {
            this.health = 50;
            this.maxHealth = 50;
            this.speed = 1.2;
            this.color = '#FF69B4'; // Pink
            this.moneyValue = 20;
            this.damage = 15;
        }

        // Difficulty scaling
        const multiplier = levels[currentLevelIndex].difficultyMultiplier + (wave * 0.1);
        this.health *= multiplier;
        this.maxHealth = this.health;

        // Position at start
        const start = getPathPoint(0);
        this.x = start.x;
        this.y = start.y;
        this.target = getPathPoint(1);
    }

    update() {
        // Attacker logic
        if (this.type === 'attacker') {
            if (this.attackCooldown > 0) this.attackCooldown--;

            // Find nearby tower to attack
            if (this.attackCooldown <= 0) {
                for (const tower of towers) {
                    const dist = Math.hypot(tower.x - this.x, tower.y - this.y);
                    if (dist < TILE_SIZE * 2) {
                        // Attack tower!
                        // For simplicity, let's just destroy it or disable it?
                        // Let's damage it? Towers don't have health yet.
                        // Let's just stun it or remove it.
                        // "Attacks your towers" -> Let's say it destroys them if very close, or shoots back.
                        // Let's make it shoot a projectile at the tower.
                        // Or simpler: if close, destroy tower and pause bear for a bit.
                        if (dist < TILE_SIZE) {
                            const idx = towers.indexOf(tower);
                            if (idx > -1) {
                                towers.splice(idx, 1);
                                this.attackCooldown = 120; // 2 seconds cooldown
                                // Visual effect could be added here
                            }
                        }
                    }
                }
            }
        }

        // Movement
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.speed) {
            this.x = this.target.x;
            this.y = this.target.y;
            this.pathIndex++;
            if (this.pathIndex >= pathPoints.length - 1) {
                this.reachedCastle();
                return;
            }
            this.target = getPathPoint(this.pathIndex + 1);
        } else {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Ears
        const earOffset = this.radius * 0.7;
        const earSize = this.radius * 0.4;
        ctx.beginPath();
        ctx.arc(this.x - earOffset, this.y - earOffset, earSize, 0, Math.PI * 2);
        ctx.arc(this.x + earOffset, this.y - earOffset, earSize, 0, Math.PI * 2);
        ctx.fill();

        // Health bar
        const barWidth = this.radius * 2;
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x - this.radius, this.y - this.radius - 10, barWidth, 4);
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(this.x - this.radius, this.y - this.radius - 10, barWidth * (this.health / this.maxHealth), 4);
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            money += this.moneyValue;
            score += this.moneyValue * 10;
            updateUI();
            return true; // Dead
        }
        return false;
    }

    reachedCastle() {
        castleHealth -= this.damage;
        if (castleHealth < 0) castleHealth = 0;
        updateUI();
        this.health = 0; // Remove bear

        if (castleHealth <= 0) {
            endGame(false);
        }
    }
}

class Tower {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.range = TILE_SIZE * 3.5;
        this.damage = 10;
        this.fireRate = 45;
        this.cooldown = 0;
    }

    update() {
        if (this.cooldown > 0) this.cooldown--;

        if (this.cooldown <= 0) {
            const target = this.findTarget();
            if (target) {
                this.shoot(target);
                this.cooldown = this.fireRate;
            }
        }
    }

    findTarget() {
        let closest = null;
        let minDist = Infinity;

        for (const bear of bears) {
            const dist = Math.hypot(bear.x - this.x, bear.y - this.y);
            if (dist < this.range && dist < minDist) {
                minDist = dist;
                closest = bear;
            }
        }
        return closest;
    }

    shoot(target) {
        projectiles.push(new Projectile(this.x, this.y, target));
    }

    draw() {
        // Base
        ctx.fillStyle = '#696969';
        ctx.fillRect(this.x - TILE_SIZE/3, this.y - TILE_SIZE/3, TILE_SIZE/1.5, TILE_SIZE/1.5);
        // Turret
        ctx.fillStyle = '#A9A9A9';
        ctx.beginPath();
        ctx.arc(this.x, this.y, TILE_SIZE/4, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Projectile {
    constructor(x, y, target) {
        this.x = x;
        this.y = y;
        this.target = target;
        this.speed = 8;
        this.damage = 10;
        this.active = true;
    }

    update() {
        if (!this.target || this.target.health <= 0) {
            this.active = false;
            return;
        }

        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.speed) {
            this.hit();
        } else {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }
    }

    hit() {
        this.active = false;
        if (this.target.takeDamage(this.damage)) {
            const index = bears.indexOf(this.target);
            if (index > -1) bears.splice(index, 1);
        }
    }

    draw() {
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

// --- Helper Functions ---

function getPathPoint(index) {
    const p = pathPoints[index];
    return {
        x: p.x * canvas.width,
        y: p.y * canvas.height
    };
}

function initLevel(levelIndex) {
    currentLevelIndex = levelIndex;
    const level = levels[levelIndex];

    pathPoints = level.path;
    totalWaves = level.waves;
    wave = 0;
    score = 0;
    money = 150; // Starting money
    castleHealth = 100;
    bears = [];
    towers = [];
    projectiles = [];
    gameActive = true;
    waveInProgress = false;

    updateUI();

    mainMenu.classList.remove('active');
    gameOverScreen.classList.remove('active');
    gameContainer.style.display = 'block';

    // Start loop if not running
    if (!requestId) loop();
}

function startWave() {
    if (wave >= totalWaves) return;

    wave++;
    waveInProgress = true;
    startWaveBtn.disabled = true;
    updateUI();

    // Generate wave composition
    bearsToSpawn = [];
    const baseCount = 5 + wave * 2;

    for (let i = 0; i < baseCount; i++) {
        // Mix of bears based on wave number
        let type = 'normal';
        if (wave > 2 && Math.random() < 0.3) type = 'tank';
        if (wave > 1 && Math.random() < 0.2) type = 'attacker';

        bearsToSpawn.push(type);
    }

    spawnTimer = 0;
}

function endGame(victory) {
    gameActive = false;
    gameContainer.style.display = 'none';
    gameOverScreen.classList.add('active');

    if (victory) {
        gameOverTitle.innerText = "Victory!";
        gameOverMessage.innerText = `You defended the honey! Score: ${score}`;
    } else {
        gameOverTitle.innerText = "Game Over";
        gameOverMessage.innerText = "The bears stole all your honey!";
    }
}

function updateUI() {
    scoreEl.innerText = `Score: ${score}`;
    castleHealthEl.innerText = `Castle: ${Math.ceil(castleHealth)}%`;
    moneyEl.innerText = `Honey: ${money}`;
    waveInfoEl.innerText = `Wave: ${wave}/${totalWaves}`;

    if (castleHealth < 30) castleHealthEl.style.color = 'red';
    else castleHealthEl.style.color = '#4a3728';
}

// --- Input ---

canvas.addEventListener('click', (e) => {
    if (!gameActive) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Snap to grid-ish (just check distance to other towers and path)
    if (money >= TOWER_COST && isValidPlacement(x, y)) {
        towers.push(new Tower(x, y));
        money -= TOWER_COST;
        updateUI();
    }
});

function isValidPlacement(x, y) {
    // Check bounds
    if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) return false;

    // Check distance to path
    // We approximate path as line segments
    for (let i = 0; i < pathPoints.length - 1; i++) {
        const p1 = getPathPoint(i);
        const p2 = getPathPoint(i+1);

        // Distance from point to line segment
        const A = x - p1.x;
        const B = y - p1.y;
        const C = p2.x - p1.x;
        const D = p2.y - p1.y;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = p1.x;
            yy = p1.y;
        } else if (param > 1) {
            xx = p2.x;
            yy = p2.y;
        } else {
            xx = p1.x + param * C;
            yy = p1.y + param * D;
        }

        const dx = x - xx;
        const dy = y - yy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < TILE_SIZE * 0.8) return false; // Too close to path
    }

    // Check existing towers
    for (const t of towers) {
        const dist = Math.hypot(t.x - x, t.y - y);
        if (dist < TILE_SIZE) return false;
    }

    return true;
}

// --- Menu Listeners ---

document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const levelIndex = parseInt(btn.dataset.level);
        initLevel(levelIndex);
    });
});

startWaveBtn.addEventListener('click', () => {
    if (!waveInProgress) startWave();
});

document.getElementById('restart-btn').addEventListener('click', () => {
    initLevel(currentLevelIndex);
});

document.getElementById('menu-btn').addEventListener('click', () => {
    gameOverScreen.classList.remove('active');
    mainMenu.classList.add('active');
    gameActive = false;
});


// --- Game Loop ---
let requestId;

function loop() {
    if (!gameActive) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Background (Grass)
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Path
    ctx.strokeStyle = PATH_COLOR;
    ctx.lineWidth = TILE_SIZE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const start = getPathPoint(0);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < pathPoints.length; i++) {
        const p = getPathPoint(i);
        ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Draw Castle
    const end = getPathPoint(pathPoints.length - 1);
    ctx.fillStyle = '#FFD700'; // Gold
    ctx.fillRect(end.x - TILE_SIZE, end.y - TILE_SIZE, TILE_SIZE*2, TILE_SIZE*2);
    // Castle details
    ctx.fillStyle = '#8B4513'; // Door
    ctx.fillRect(end.x - TILE_SIZE/4, end.y, TILE_SIZE/2, TILE_SIZE);

    // Spawning Logic
    if (waveInProgress && bearsToSpawn.length > 0) {
        spawnTimer++;
        if (spawnTimer > 60) { // Spawn every second
            const type = bearsToSpawn.shift();
            bears.push(new Bear(type));
            spawnTimer = 0;
        }
    }

    // Update Entities
    for (const tower of towers) {
        tower.update();
        tower.draw();
    }

    for (let i = bears.length - 1; i >= 0; i--) {
        const bear = bears[i];
        bear.update();
        bear.draw();
        if (bear.health <= 0) {
            bears.splice(i, 1);
        }
    }

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.update();
        p.draw();
        if (!p.active) {
            projectiles.splice(i, 1);
        }
    }

    // Check Wave End
    if (waveInProgress && bears.length === 0 && bearsToSpawn.length === 0) {
        waveInProgress = false;
        startWaveBtn.disabled = false;

        if (wave >= totalWaves) {
            endGame(true);
        }
    }

    frameCount++;
    requestId = requestAnimationFrame(loop);
}
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const waveEl = document.getElementById('waveCount');
const goldEl = document.getElementById('goldCount');
const hpEl = document.getElementById('hpCount');
const messageBox = document.getElementById('messageBox');
const startWaveButton = document.getElementById('startWave');
const abilityVolley = document.getElementById('abilityVolley');
const abilityFreeze = document.getElementById('abilityFreeze');
const towerButtons = [...document.querySelectorAll('.tower-button')];

let selectedTower = 'scout';
let gold = 120;
let keepHp = 100;
let wave = 1;
let runningWave = false;
let waveQueue = 0;
let spawnTimer = 0;
let hoveredSite = null;

const TOWER_DEFS = {
  scout: { label: 'Scout', cost: 50, damage: 12, range: 150, fireRate: 0.62, color: '#7be69a', projectile: '#dfffe3' },
  frost: { label: 'Frost', cost: 80, damage: 9, range: 172, fireRate: 0.75, color: '#7bd8ff', projectile: '#cbf3ff', slow: 1.6 },
  nova: { label: 'Nova', cost: 120, damage: 18, range: 195, fireRate: 1.0, color: '#ff9a57', projectile: '#ffd7a5', splash: 34 }
};

const buildSites = [
  { x: 180, y: 220 },
  { x: 300, y: 125 },
  { x: 330, y: 300 },
  { x: 510, y: 150 },
  { x: 560, y: 420 },
  { x: 690, y: 250 },
  { x: 785, y: 120 },
  { x: 795, y: 360 }
];

const path = [
  { x: 70, y: 320 },
  { x: 180, y: 320 },
  { x: 260, y: 240 },
  { x: 390, y: 240 },
  { x: 470, y: 360 },
  { x: 610, y: 360 },
  { x: 700, y: 212 },
  { x: 850, y: 212 },
  { x: 920, y: 300 }
];

const towers = [];
const zombies = [];
const projectiles = [];
const effects = [];

function setMessage(text) {
  messageBox.textContent = text;
}

function updateHUD() {
  waveEl.textContent = wave;
  goldEl.textContent = gold;
  hpEl.textContent = keepHp;
  abilityVolley.disabled = gold < 40 || !runningWave;
  abilityFreeze.disabled = gold < 35 || !runningWave;
}

function selectTower(type) {
  selectedTower = type;
  towerButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tower === type);
  });
  setMessage(`${TOWER_DEFS[type].label} selected. Click a glowing build site.`);
}

function findBuildSiteAt(x, y) {
  return buildSites.find((site) => Math.hypot(site.x - x, site.y - y) < 26);
}

function buildTower(site) {
  const def = TOWER_DEFS[selectedTower];
  if (gold < def.cost) {
    setMessage(`Not enough gold for ${def.label}.`);
    return;
  }

  const existing = towers.find((tower) => Math.hypot(tower.x - site.x, tower.y - site.y) < 26);
  if (existing) {
    setMessage('That build site is already occupied.');
    return;
  }

  gold -= def.cost;
  towers.push({
    x: site.x,
    y: site.y,
    type: selectedTower,
    cooldown: 0,
    def,
    radius: def.range,
    hitFlash: 0
  });

  setMessage(`${def.label} deployed. The keep is ready.`);
  updateHUD();
}

function spawnZombie() {
  const roll = Math.random();
  let type = 'walker';
  if (wave >= 3 && roll > 0.8) type = 'brute';
  if (wave >= 4 && roll > 0.93) type = 'runner';

  let hp, speed, radius;
  if (type === 'brute') {
    hp = 70 + wave * 15;
    speed = 20 + wave * 0.8;
    radius = 16;
  } else if (type === 'runner') {
    hp = 35 + wave * 9;
    speed = 42 + wave * 1.3;
    radius = 11;
  } else {
    hp = 26 + wave * 8;
    speed = 26 + wave * 1.1;
    radius = 12;
  }

  zombies.push({
    x: path[0].x,
    y: path[0].y,
    segment: 0,
    hp,
    maxHp: hp,
    speed,
    radius,
    type,
    slowTimer: 0,
    color: type === 'brute' ? '#cd7c6d' : type === 'runner' ? '#e6c488' : '#d96d61'
  });
}

function startWave() {
  if (runningWave) return;
  runningWave = true;
  waveQueue = 6 + wave * 3;
  spawnTimer = 0.5;
  setMessage(`Wave ${wave} has begun. Hold the line.`);
  updateHUD();
}

function volleyAbility() {
  if (gold < 40 || !runningWave) return;
  gold -= 40;
  zombies.forEach((zombie) => {
    zombie.hp -= 22 + wave * 2;
    effects.push({ x: zombie.x, y: zombie.y, radius: 26, color: '#fff1a6', life: 0.32, type: 'burst' });
  });
  setMessage('Volley fired — every zombie takes heavy damage.');
  updateHUD();
}

function freezeAbility() {
  if (gold < 35 || !runningWave) return;
  gold -= 35;
  zombies.forEach((zombie) => {
    zombie.slowTimer = 4.5;
  });
  effects.push({ x: 455, y: 330, radius: 130, color: '#8fe7ff', life: 1.2, type: 'pulse' });
  setMessage('Frost Nova shatters the ground — enemy movement slows.');
  updateHUD();
}

function findNearestTarget(tower) {
  let target = null;
  let nearestDistance = Infinity;

  for (const zombie of zombies) {
    const dist = Math.hypot(zombie.x - tower.x, zombie.y - tower.y);
    if (dist <= tower.def.range && dist < nearestDistance) {
      nearestDistance = dist;
      target = zombie;
    }
  }

  return target;
}

function fireProjectile(tower, target) {
  const dx = target.x - tower.x;
  const dy = target.y - tower.y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = 420;

  projectiles.push({
    x: tower.x,
    y: tower.y,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    target,
    damage: tower.def.damage,
    splash: tower.def.splash || 0,
    color: tower.def.projectile,
    life: 1.2,
    slow: tower.def.slow || 0,
    from: tower.type
  });

  tower.cooldown = tower.def.fireRate;
  effects.push({ x: tower.x, y: tower.y, radius: 10, color: tower.def.projectile, life: 0.12, type: 'spark' });
}

function damageZombie(zombie, amount, splash = 0) {
  zombie.hp -= amount;
  zombie.hitFlash = 0.12;

  if (splash > 0) {
    for (const other of zombies) {
      if (other !== zombie) {
        const dist = Math.hypot(other.x - zombie.x, other.y - zombie.y);
        if (dist <= splash) {
          other.hp -= amount * 0.5;
          other.hitFlash = 0.12;
        }
      }
    }
  }
}

function updateWave(dt) {
  if (!runningWave) return;

  spawnTimer -= dt;
  if (waveQueue > 0 && spawnTimer <= 0) {
    spawnZombie();
    waveQueue -= 1;
    spawnTimer = Math.max(0.45, 1.1 - wave * 0.06);
  }

  if (waveQueue === 0 && zombies.length === 0) {
    runningWave = false;
    gold += 25 + wave * 12;
    wave += 1;
    setMessage(`Wave cleared! Gold bonus secured. Wave ${wave} is ready.`);
    updateHUD();
  }
}

function updateTowers(dt) {
  for (const tower of towers) {
    tower.cooldown = Math.max(0, tower.cooldown - dt);
    tower.hitFlash = Math.max(0, tower.hitFlash - dt);

    const target = findNearestTarget(tower);
    if (target && tower.cooldown === 0) {
      fireProjectile(tower, target);
    }
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const p = projectiles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    if (p.target && p.target.hp > 0) {
      const dist = Math.hypot(p.x - p.target.x, p.y - p.target.y);
      if (dist <= p.target.radius + 6) {
        damageZombie(p.target, p.damage, p.splash);
        if (p.slow > 0) p.target.slowTimer = Math.max(p.target.slowTimer, p.slow);
        effects.push({ x: p.target.x, y: p.target.y, radius: p.splash ? p.splash * 0.8 : 18, color: '#ffd4a1', life: 0.25, type: 'hit' });
        projectiles.splice(i, 1);
        continue;
      }
    }

    if (p.life <= 0) {
      projectiles.splice(i, 1);
    }
  }
}

function updateZombies(dt) {
  for (let i = zombies.length - 1; i >= 0; i -= 1) {
    const zombie = zombies[i];
    if (zombie.hp <= 0) {
      gold += zombie.type === 'brute' ? 10 : zombie.type === 'runner' ? 8 : 6;
      effects.push({ x: zombie.x, y: zombie.y, radius: 22, color: '#ffd289', life: 0.26, type: 'pop' });
      zombies.splice(i, 1);
      updateHUD();
      continue;
    }

    zombie.hitFlash = Math.max(0, zombie.hitFlash - dt);
    zombie.slowTimer = Math.max(0, zombie.slowTimer - dt);

    const nextPoint = path[zombie.segment + 1];
    if (!nextPoint) {
      keepHp -= 10;
      setMessage('A zombie has reached the keep!');
      zombies.splice(i, 1);
      updateHUD();
      if (keepHp <= 0) {
        retryRun();
      }
      continue;
    }

    const moveSpeed = zombie.speed * (zombie.slowTimer > 0 ? 0.45 : 1);
    const dx = nextPoint.x - zombie.x;
    const dy = nextPoint.y - zombie.y;
    const dist = Math.hypot(dx, dy);
    const step = moveSpeed * dt;

    if (dist <= step) {
      zombie.x = nextPoint.x;
      zombie.y = nextPoint.y;
      zombie.segment += 1;
    } else {
      zombie.x += (dx / dist) * step;
      zombie.y += (dy / dist) * step;
    }
  }
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    effects[i].life -= dt;
    if (effects[i].life <= 0) effects.splice(i, 1);
  }
}

function retryRun() {
  gold = 120;
  keepHp = 100;
  wave = 1;
  runningWave = false;
  waveQueue = 0;
  zombies.length = 0;
  projectiles.length = 0;
  towers.length = 0;
  setMessage('The keep has fallen. Build again and defend the realm.');
  updateHUD();
}

function drawGround() {
  ctx.fillStyle = '#0f1b17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 54) {
    for (let x = 0; x < canvas.width; x += 54) {
      ctx.fillStyle = ((x / 54 + y / 54) % 2 === 0) ? '#173026' : '#122821';
      ctx.fillRect(x, y, 54, 54);
    }
  }

  ctx.fillStyle = '#244334';
  for (let i = 0; i < 14; i++) {
    const px = 30 + (i * 67) % canvas.width;
    const py = 40 + (i * 83) % (canvas.height - 80);
    ctx.fillRect(px, py, 8, 8);
    ctx.fillRect(px + 16, py + 12, 6, 6);
  }
}

function drawBoard() {
  drawGround();

  const tileW = 72;
  const tileH = 36;
  const originX = 120;
  const originY = 120;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 10; col++) {
      const x = originX + (col - row) * (tileW / 2);
      const y = originY + (col + row) * (tileH / 2);

      ctx.beginPath();
      ctx.moveTo(x, y - tileH / 2);
      ctx.lineTo(x + tileW / 2, y);
      ctx.lineTo(x, y + tileH / 2);
      ctx.lineTo(x - tileW / 2, y);
      ctx.closePath();

      const onPath = path.some((p) => {
        const px = Math.round((p.x - originX) / (tileW / 2));
        const py = Math.round((p.y - originY) / (tileH / 2));
        return px === (col - row) && py === (col + row);
      });

      ctx.fillStyle = onPath ? '#3b5a3d' : '#1d322b';
      ctx.fill();
      ctx.strokeStyle = onPath ? '#98a16d' : '#2c463a';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
}

function drawBuildSites() {
  buildSites.forEach((site) => {
    const occupied = towers.some((tower) => Math.hypot(tower.x - site.x, tower.y - site.y) < 22);
    ctx.beginPath();
    ctx.arc(site.x, site.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = occupied ? 'rgba(120, 200, 145, 0.75)' : 'rgba(245, 186, 95, 0.42)';
    ctx.fill();
    ctx.strokeStyle = occupied ? '#aaf0b1' : '#f0c873';
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function drawPath() {
  ctx.beginPath();
  path.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = '#d9b45a';
  ctx.lineWidth = 26;
  ctx.stroke();

  ctx.beginPath();
  path.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.strokeStyle = '#8d7342';
  ctx.lineWidth = 12;
  ctx.stroke();
}

function drawRangePreview() {
  if (!hoveredSite) return;
  const def = TOWER_DEFS[selectedTower];
  ctx.beginPath();
  ctx.arc(hoveredSite.x, hoveredSite.y, def.range, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(123, 230, 154, 0.45)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTower(tower) {
  const color = tower.def.color;

  ctx.fillStyle = 'rgba(11, 21, 18, 0.9)';
  ctx.beginPath();
  ctx.ellipse(tower.x, tower.y + 14, 22, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillRect(tower.x - 8, tower.y - 8, 16, 24);

  ctx.fillStyle = '#eef9ff';
  ctx.beginPath();
  ctx.arc(tower.x, tower.y - 10, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(tower.x, tower.y - 10, 14, 0, Math.PI * 2);
  ctx.strokeStyle = tower.hitFlash > 0 ? '#ffffff' : 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(tower.x, tower.y, tower.def.range, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawZombie(zombie) {
  const fill = zombie.hitFlash > 0 ? '#f5d5b0' : zombie.color;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a1715';
  ctx.fillRect(zombie.x - 7, zombie.y - 3, 4, 4);
  ctx.fillRect(zombie.x + 3, zombie.y - 3, 4, 4);

  if (zombie.type === 'runner') {
    ctx.strokeStyle = '#fbd67e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(zombie.x - zombie.radius, zombie.y + 8);
    ctx.lineTo(zombie.x + zombie.radius, zombie.y + 8);
    ctx.stroke();
  }

  const barW = zombie.radius * 2;
  const hpRatio = Math.max(0, zombie.hp / zombie.maxHp);
  ctx.fillStyle = 'rgba(17, 22, 20, 0.7)';
  ctx.fillRect(zombie.x - barW / 2, zombie.y - zombie.radius - 12, barW, 4);
  ctx.fillStyle = '#aef4bd';
  ctx.fillRect(zombie.x - barW / 2, zombie.y - zombie.radius - 12, hpRatio * barW, 4);
}

function drawProjectiles() {
  projectiles.forEach((proj) => {
    ctx.fillStyle = proj.color;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawEffects() {
  effects.forEach((effect) => {
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.radius * (1 - effect.life * 0.5), 0, Math.PI * 2);
    ctx.strokeStyle = effect.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = Math.max(0.15, effect.life);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
}

function drawKeep() {
  const keepX = 920;
  const keepY = 300;
  ctx.fillStyle = '#2f4b3b';
  ctx.fillRect(keepX - 30, keepY - 20, 60, 70);
  ctx.fillStyle = '#d3c0a5';
  ctx.fillRect(keepX - 10, keepY - 40, 20, 24);
  ctx.fillStyle = '#dfb872';
  ctx.fillRect(keepX - 20, keepY + 20, 40, 12);

  ctx.strokeStyle = 'rgba(255, 229, 159, 0.36)';
  ctx.lineWidth = 2;
  ctx.strokeRect(keepX - 34, keepY - 25, 68, 76);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBoard();
  drawBuildSites();
  drawPath();
  drawRangePreview();
  drawKeep();
  towers.forEach(drawTower);
  zombies.forEach(drawZombie);
  drawProjectiles();
  drawEffects();
}

function update(dt) {
  updateWave(dt);
  updateTowers(dt);
  updateProjectiles(dt);
  updateZombies(dt);
  updateEffects(dt);
}

let last = performance.now();
function gameLoop(timestamp) {
  const dt = Math.min(0.033, (timestamp - last) / 1000 || 0.016);
  last = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  hoveredSite = findBuildSiteAt(x, y);
});

canvas.addEventListener('mouseleave', () => {
  hoveredSite = null;
});

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const site = findBuildSiteAt(x, y);
  if (site) buildTower(site);
});

towerButtons.forEach((button) => {
  button.addEventListener('click', () => selectTower(button.dataset.tower));
});

startWaveButton.addEventListener('click', startWave);
abilityVolley.addEventListener('click', volleyAbility);
abilityFreeze.addEventListener('click', freezeAbility);
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'q') volleyAbility();
  if (key === 'e') freezeAbility();
  if (key === ' ') {
    event.preventDefault();
    startWave();
  }
});

selectTower('scout');
updateHUD();
requestAnimationFrame(gameLoop);

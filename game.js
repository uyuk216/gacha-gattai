const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d", { alpha: false });
const startScreen = document.querySelector("#start-screen");
const endScreen = document.querySelector("#end-screen");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const finalScore = document.querySelector("#final-score");
const finalBest = document.querySelector("#final-best");
const statusText = document.querySelector("#game-status");

const STAGES = [
  { name: "ちり", color: "#d8dcff", light: "#ffffff", shape: "dust" },
  { name: "小石", color: "#9ea5bd", light: "#e5e8ff", shape: "stone" },
  { name: "たまご", color: "#ffdb91", light: "#fff4c7", shape: "egg" },
  { name: "ひよこ", color: "#ffe45e", light: "#fffbc2", shape: "bird" },
  { name: "ねこ", color: "#ff9e9f", light: "#ffd1dc", shape: "cat" },
  { name: "ライオン", color: "#ffa148", light: "#ffe49b", shape: "lion" },
  { name: "山", color: "#65d9b1", light: "#d0fff0", shape: "mountain" },
  { name: "月", color: "#8d9bff", light: "#e7eaff", shape: "moon" },
  { name: "地球", color: "#3ba8ff", light: "#b8f6ff", shape: "earth" },
  { name: "太陽", color: "#ff7c4f", light: "#fff0a2", shape: "sun" },
  { name: "銀河", color: "#bd76ff", light: "#ffd2ff", shape: "galaxy" },
  { name: "宇宙", color: "#6247dc", light: "#c4a8ff", shape: "cosmos" },
  { name: "神", color: "#fff2b2", light: "#ffffff", shape: "god" },
];

const BASE_RADII = [11, 16, 21, 26, 32, 39, 47, 56, 66, 78, 91, 104, 117];
const MAX_BALLS = 62;
const MAX_PARTICLES = 170;
const TAU = Math.PI * 2;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let width = 0;
let height = 0;
let pixelRatio = 1;
let scaleFactor = 1;
let leftWall = 0;
let rightWall = 0;
let floorY = 0;
let boxTop = 0;
let dangerY = 0;
let lastFrame = 0;
let elapsed = 0;
let balls = [];
let particles = [];
let floaters = [];
let score = 0;
let best = readBest();
let state = "title";
let aimX = 0;
let nextTier = 0;
let gacha = null;
let dropCooldown = 0;
let combo = 0;
let comboUntil = 0;
let comboLabel = null;
let shake = 0;
let hitStop = 0;
let flash = 0;
let screenCrack = null;
let dangerTimer = 0;
let endWait = 0;
let audio = null;
let random = Math.random;

function readBest() {
  try { return Number(localStorage.getItem("mugen-gacha-best") || 0) || 0; }
  catch { return 0; }
}

function saveBest(value) {
  try { localStorage.setItem("mugen-gacha-best", String(value)); }
  catch { /* private browsing or storage disabled */ }
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function rand(min, max) { return min + random() * (max - min); }
function stageRadius(tier) { return BASE_RADII[tier] * scaleFactor; }
function formatScore(value) { return Math.floor(value).toLocaleString("ja-JP"); }

function resize() {
  const previousWidth = width;
  const previousHeight = height;
  const previousBoxTop = boxTop;
  const previousFloorY = floorY;
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  scaleFactor = clamp(width / 390, 0.76, 1.16);
  leftWall = width * 0.055;
  rightWall = width * 0.945;
  floorY = height - Math.max(67, height * 0.08);
  boxTop = Math.min(height * 0.43, height - Math.max(300, height * 0.42));
  boxTop = Math.max(160, boxTop);
  dangerY = boxTop + 49 * scaleFactor;
  if (previousWidth > 0 && previousFloorY > previousBoxTop) {
    const oldPlayHeight = previousFloorY - previousBoxTop;
    const newPlayHeight = floorY - boxTop;
    for (const ball of balls) {
      const oldRadius = ball.r;
      ball.r = stageRadius(ball.tier);
      if (ball.y >= previousBoxTop) {
        const progress = (ball.y - previousBoxTop) / oldPlayHeight;
        ball.y = boxTop + progress * newPlayHeight;
      } else {
        ball.y *= height / Math.max(1, previousHeight);
      }
      ball.x *= width / previousWidth;
      ball.vx *= width / previousWidth;
      ball.vy *= height / Math.max(1, previousHeight);
      ball.x = clamp(ball.x, leftWall + ball.r, rightWall - ball.r);
      ball.y = Math.min(ball.y, floorY - ball.r);
      if (Math.abs(oldRadius - ball.r) > 1) ball.pulse = Math.max(ball.pulse, 0.18);
    }
    if (gacha) gacha.x *= width / previousWidth;
  }
  aimX = clamp(aimX || width / 2, leftWall + 24 * scaleFactor, rightWall - 24 * scaleFactor);
  draw();
}

function unlockAudio() {
  if (!audio) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        const context = new AudioContextClass();
        const master = context.createGain();
        master.gain.value = 0.23;
        master.connect(context.destination);
        audio = { context, master };
      } catch { audio = null; }
    }
  }
  if (audio?.context.state === "suspended") audio.context.resume().catch(() => {});
}

function tone(frequency, duration = 0.11, type = "sine", volume = 0.2, slide = 0) {
  if (!audio) return;
  const { context, master } = audio;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(35, frequency), now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency + slide), now + duration);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.002, volume), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.025);
}

function vibrate(pattern = 12) {
  try { navigator.vibrate?.(pattern); }
  catch { /* vibration is an optional browser feature */ }
}

function beginGame() {
  unlockAudio();
  state = "playing";
  balls = [];
  particles = [];
  floaters = [];
  score = 0;
  elapsed = 0;
  combo = 0;
  comboUntil = 0;
  comboLabel = null;
  dangerTimer = 0;
  dropCooldown = 0.12;
  gacha = null;
  screenCrack = null;
  shake = 0;
  flash = 0;
  hitStop = 0;
  nextTier = randomTier();
  startScreen.classList.add("is-hidden");
  endScreen.classList.add("is-hidden");
  statusText.textContent = "ゲーム開始。落とす場所をタップ。";
  tone(490, 0.13, "triangle", 0.12, 230);
  lastFrame = performance.now();
  draw();
}

function endGame() {
  if (state !== "playing") return;
  state = "over";
  const improved = score > best;
  if (improved) {
    best = score;
    saveBest(best);
  }
  finalScore.textContent = formatScore(score);
  finalBest.textContent = formatScore(best);
  endWait = 0.72;
  screenCrack = { x: width / 2, y: boxTop + (floorY - boxTop) * 0.56, age: 0, strength: 0.6, gameOver: true };
  hitStop = 0.09;
  shake = 13;
  flash = 0.35;
  tone(improved ? 116 : 82, 0.55, "sawtooth", 0.2, -54);
  vibrate([35, 30, 80]);
  statusText.textContent = `ゲームオーバー。スコア ${formatScore(score)}。`;
}

function randomTier() {
  const roll = random();
  if (roll < 0.018) return 2;
  if (roll < 0.19) return 1;
  return 0;
}

function startGacha(x) {
  if (state !== "playing" || gacha || dropCooldown > 0 || balls.length >= MAX_BALLS) return;
  unlockAudio();
  const targetTier = nextTier;
  nextTier = randomTier();
  gacha = { x: clamp(x, leftWall + stageRadius(targetTier), rightWall - stageRadius(targetTier)), age: 0, duration: 0.38, tier: targetTier };
  dropCooldown = 0.26;
  tone(280, 0.07, "square", 0.07, 190);
}

function releaseBall() {
  if (!gacha || balls.length >= MAX_BALLS) return;
  const tier = gacha.tier;
  const radius = stageRadius(tier);
  balls.push({
    id: `${Math.random().toString(36).slice(2)}-${elapsed}`,
    x: clamp(gacha.x, leftWall + radius, rightWall - radius),
    y: boxTop - radius - 5 * scaleFactor,
    vx: rand(-12, 12),
    vy: 22,
    r: radius,
    tier,
    age: 0,
    overflow: 0,
    settled: false,
    glow: 0,
    pulse: 0,
    spin: rand(-0.5, 0.5),
  });
  emit(gacha.x, boxTop - 9 * scaleFactor, STAGES[tier].light, 6, 1.7);
  tone(190 + tier * 36, 0.075, "sine", 0.1, -36);
  gacha = null;
  vibrate(7);
}

function createBall(x, y, tier, vx, vy, age = 0) {
  return {
    id: `${Math.random().toString(36).slice(2)}-${elapsed}-${tier}`,
    x, y, vx, vy, tier, r: stageRadius(tier), age, overflow: 0,
    settled: false, glow: 1, pulse: 0.42, spin: rand(-1, 1),
  };
}

function emit(x, y, color, count = 10, force = 2.8) {
  const room = Math.max(0, MAX_PARTICLES - particles.length);
  const amount = Math.min(count, room);
  for (let i = 0; i < amount; i++) {
    const angle = rand(0, TAU);
    const speed = rand(0.5, force) * scaleFactor;
    particles.push({ x, y, vx: Math.cos(angle) * speed * 52, vy: Math.sin(angle) * speed * 52, life: rand(0.22, 0.65), maxLife: 0, size: rand(1.3, 4.5) * scaleFactor, color, gravity: rand(90, 310) });
    particles.at(-1).maxLife = particles.at(-1).life;
  }
}

function addFloater(x, y, text, color, size, life = 0.78) {
  floaters.push({ x, y, text, color, size: size * scaleFactor, life, maxLife: life, vy: -39 * scaleFactor });
  if (floaters.length > 20) floaters.shift();
}

function merge(first, second) {
  const i = balls.indexOf(first);
  const j = balls.indexOf(second);
  if (i < 0 || j < 0 || first === second) return;
  const tier = Math.min(12, first.tier + 1);
  const x = (first.x + second.x) / 2;
  const y = (first.y + second.y) / 2;
  const vx = (first.vx + second.vx) * 0.23 + rand(-15, 15);
  const vy = Math.min(-56 * scaleFactor, (first.vy + second.vy) * 0.16 - 40 * scaleFactor);
  const comboActive = elapsed < comboUntil;
  combo = comboActive ? combo + 1 : 1;
  comboUntil = elapsed + 2.25;
  const basePoints = [4, 9, 18, 38, 72, 145, 300, 650, 1300, 2600, 6000, 15000, 80000][tier];
  const points = Math.round(basePoints * (1 + Math.min(combo - 1, 18) * 0.16));
  score += points;
  balls.splice(Math.max(i, j), 1);
  balls.splice(Math.min(i, j), 1);

  if (tier === 12) {
    const mergesAgain = first.tier === 12 || second.tier === 12;
    const godPoints = mergesAgain ? 125000 : 80000;
    score += godPoints - basePoints;
    screenCrack = { x, y, age: 0, strength: 1, gameOver: false };
    flash = 0.85;
    shake = Math.max(shake, 24);
    hitStop = 0.13;
    emit(x, y, "#fff4c7", 44, 8);
    emit(x, y, "#bb8bff", 25, 6);
    tone(530, 0.44, "sine", 0.23, 1450);
    tone(110, 0.62, "triangle", 0.2, -34);
    vibrate([35, 22, 45, 30, 120]);
    addFloater(x, y - 20, "神", "#fff5bc", 38, 1.3);
    addFloater(width / 2, height * 0.28, `+${formatScore(godPoints)}`, "#ffe994", 32, 1.25);
  } else {
    const stage = STAGES[tier];
    const particlesForTier = Math.min(32, 9 + tier * 2 + combo * 2);
    emit(x, y, stage.light, particlesForTier, 2.7 + tier * 0.25 + combo * 0.16);
    emit(x, y, stage.color, Math.max(4, Math.floor(particlesForTier * 0.48)), 2.1 + tier * 0.15);
    shake = Math.max(shake, Math.min(9 + tier * 1.2 + combo * 0.8, 21));
    hitStop = Math.max(hitStop, Math.min(0.023 + tier * 0.0028, 0.052));
    flash = Math.max(flash, 0.13 + tier * 0.035);
    const pitch = 360 + tier * 67 + Math.min(combo, 10) * 31;
    tone(pitch, 0.14 + tier * 0.012, tier > 6 ? "sine" : "triangle", 0.16, pitch * (0.38 + tier * 0.015));
    if (tier >= 5) tone(pitch * 1.5, 0.22, "sine", 0.075, pitch * 0.6);
    vibrate(tier > 8 ? [17, 18, 28] : Math.min(38, 8 + tier * 2));
    addFloater(x, y - 11, `+${formatScore(points)}`, tier >= 7 ? "#ffe397" : "#fff", 17 + tier * 1.5);
    if (combo > 1) {
      comboLabel = { text: `${combo} コンボ`, age: 0 };
      addFloater(width / 2, boxTop - 13 * scaleFactor, `${combo} コンボ`, "#ffb8f2", 25 + Math.min(combo, 8) * 1.5, 0.9);
    }
  }

  if (balls.length < MAX_BALLS) balls.push(createBall(x, y, tier, vx, vy, 0));
  statusText.textContent = `${STAGES[tier].name}に進化。スコア ${formatScore(score)}。`;
}

function feedGod(god, other) {
  const a = balls.indexOf(god);
  const b = balls.indexOf(other);
  if (a < 0 || b < 0) return;
  if (other.tier === 12) {
    merge(god, other);
    return;
  }
  const points = Math.round([4, 9, 18, 38, 72, 145, 300, 650, 1300, 2600, 6000, 15000][other.tier] * 2.5);
  balls.splice(b, 1);
  score += points;
  god.pulse = 0.8;
  god.glow = 1;
  god.vy -= 28 * scaleFactor;
  emit(other.x, other.y, "#fff4b2", 13, 4.1);
  tone(880 + Math.min(500, other.tier * 55), 0.13, "sine", 0.17, 450);
  addFloater(god.x, god.y - god.r, `+${formatScore(points)}`, "#fff0ae", 17, 0.8);
}

function solvePhysics(dt) {
  const substeps = 3;
  const step = dt / substeps;
  for (let sub = 0; sub < substeps; sub++) {
    for (const ball of balls) {
      ball.age += step;
      ball.glow = Math.max(0, ball.glow - step * 1.65);
      ball.pulse = Math.max(0, ball.pulse - step * 1.9);
      ball.vy += 1540 * scaleFactor * step;
      ball.vx *= Math.pow(0.995, step * 60);
      ball.vy = Math.min(ball.vy, 1160 * scaleFactor);
      ball.x += ball.vx * step;
      ball.y += ball.vy * step;
      ball.settled = Math.abs(ball.vy) < 20 && Math.abs(ball.vx) < 20;

      if (ball.x - ball.r < leftWall) {
        ball.x = leftWall + ball.r;
        ball.vx = Math.abs(ball.vx) * 0.37;
        ball.vy *= 0.98;
      } else if (ball.x + ball.r > rightWall) {
        ball.x = rightWall - ball.r;
        ball.vx = -Math.abs(ball.vx) * 0.37;
        ball.vy *= 0.98;
      }
      if (ball.y + ball.r > floorY) {
        ball.y = floorY - ball.r;
        if (ball.vy > 80) {
          ball.vy = -ball.vy * 0.23;
          ball.vx *= 0.86;
        } else {
          ball.vy = 0;
          ball.vx *= 0.92;
        }
      }
      if (ball.y < -ball.r * 1.5) {
        ball.y = -ball.r * 1.5;
        ball.vy = Math.max(30, ball.vy);
      }
    }

    const used = new Set();
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distanceSq = dx * dx + dy * dy;
        const reach = a.r + b.r;
        if (distanceSq >= reach * reach) continue;
        if (distanceSq < 0.0001) {
          dx = 0.01;
          dy = 0;
          distanceSq = 0.0001;
        }
        const distance = Math.sqrt(distanceSq);
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = reach - distance;
        const invMassA = 1 / Math.max(a.r * a.r, 1);
        const invMassB = 1 / Math.max(b.r * b.r, 1);
        const invSum = invMassA + invMassB;
        const correction = Math.max(0, overlap - 0.1) * 0.78;
        a.x -= nx * correction * invMassA / invSum;
        a.y -= ny * correction * invMassA / invSum;
        b.x += nx * correction * invMassB / invSum;
        b.y += ny * correction * invMassB / invSum;

        const relativeX = b.vx - a.vx;
        const relativeY = b.vy - a.vy;
        const normalVelocity = relativeX * nx + relativeY * ny;
        if (normalVelocity < 0) {
          const impulse = -(1 + 0.17) * normalVelocity / invSum;
          a.vx -= impulse * nx * invMassA;
          a.vy -= impulse * ny * invMassA;
          b.vx += impulse * nx * invMassB;
          b.vy += impulse * ny * invMassB;
          const friction = (relativeX * -ny + relativeY * nx) * 0.018;
          a.vx += -ny * friction * invMassA;
          a.vy += nx * friction * invMassA;
          b.vx += ny * friction * invMassB;
          b.vy += -nx * friction * invMassB;
        }

        if (used.has(a) || used.has(b)) continue;
        if (a.tier === b.tier && a.tier < 12) {
          used.add(a);
          used.add(b);
          merge(a, b);
          break;
        }
        if (a.tier === 12 || b.tier === 12) {
          used.add(a.tier === 12 ? b : a);
          feedGod(a.tier === 12 ? a : b, a.tier === 12 ? b : a);
          if (!balls.includes(a) || !balls.includes(b)) break;
        }
      }
      if (used.has(a)) continue;
    }
  }
}

function update(dt) {
  elapsed += dt;
  if (dropCooldown > 0) dropCooldown = Math.max(0, dropCooldown - dt);

  if (gacha) {
    gacha.age += dt;
    const interval = 0.047;
    if (Math.floor((gacha.age - dt) / interval) !== Math.floor(gacha.age / interval)) tone(rand(330, 740), 0.025, "square", 0.025, -18);
    if (gacha.age >= gacha.duration) releaseBall();
  }

  if (elapsed > comboUntil) {
    combo = 0;
    comboLabel = null;
  }
  if (comboLabel) comboLabel.age += dt;
  if (state === "playing") {
    if (hitStop > 0) hitStop -= dt;
    else solvePhysics(Math.min(dt, 0.04));
  } else if (hitStop > 0) {
    hitStop = Math.max(0, hitStop - dt);
  }

  if (state === "playing") {
    let inDanger = false;
    for (const ball of balls) {
      const above = ball.y > boxTop + ball.r * 0.3 && ball.y - ball.r < dangerY;
      if (above && ball.age > 0.34 && (ball.settled || Math.abs(ball.vy) < 120 * scaleFactor)) {
        ball.overflow += dt;
        inDanger = true;
      } else {
        ball.overflow = Math.max(0, ball.overflow - dt * 0.8);
      }
      if (ball.overflow >= 1.45) {
        endGame();
        break;
      }
    }
    dangerTimer = inDanger ? Math.min(1.45, dangerTimer + dt) : Math.max(0, dangerTimer - dt * 1.8);
  } else if (state === "over") {
    endWait -= dt;
    if (endWait <= 0) endScreen.classList.remove("is-hidden");
  }

  const particleStep = Math.min(dt, 0.05);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= particleStep;
    p.vy += p.gravity * scaleFactor * particleStep;
    p.vx *= Math.pow(0.982, particleStep * 60);
    p.x += p.vx * particleStep;
    p.y += p.vy * particleStep;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const item = floaters[i];
    item.life -= particleStep;
    item.y += item.vy * particleStep;
    if (item.life <= 0) floaters.splice(i, 1);
  }
  shake = Math.max(0, shake - dt * 44);
  flash = Math.max(0, flash - dt * 1.65);
  if (screenCrack) {
    screenCrack.age += dt;
    if (screenCrack.age > 1.35) screenCrack = null;
  }
}

function roundedRect(x, y, w, h, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, width * 0.78, height);
  sky.addColorStop(0, "#16192d");
  sky.addColorStop(0.45, "#111222");
  sky.addColorStop(1, "#211531");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const haze = ctx.createRadialGradient(width * 0.5, boxTop, 0, width * 0.5, boxTop, width * 0.82);
  haze.addColorStop(0, "rgb(119 67 196 / 15%)");
  haze.addColorStop(1, "rgb(15 15 29 / 0%)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.17;
  ctx.strokeStyle = "#9491c5";
  ctx.lineWidth = 0.6;
  const gap = 30 * scaleFactor;
  for (let x = leftWall; x <= rightWall; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, 30);
    ctx.lineTo(x, floorY);
    ctx.stroke();
  }
  for (let y = 30; y < floorY; y += gap) {
    ctx.beginPath();
    ctx.moveTo(leftWall, y);
    ctx.lineTo(rightWall, y);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < 13; i++) {
    const x = ((i * 87 + 39) % Math.max(1, width));
    const y = ((i * 139 + 61) % Math.max(1, Math.floor(boxTop)));
    const twinkle = 0.28 + (Math.sin(elapsed * 2.1 + i * 8) + 1) * 0.22;
    ctx.fillStyle = `rgba(229, 219, 255, ${twinkle})`;
    ctx.beginPath();
    ctx.arc(x, y, i % 4 === 0 ? 1.7 : 1, 0, TAU);
    ctx.fill();
  }
}

function drawHud() {
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#bcb4e3";
  ctx.font = `800 ${11 * scaleFactor}px -apple-system, sans-serif`;
  ctx.fillText("無限ガチャ合体", leftWall + 3, 26 * scaleFactor);

  ctx.textAlign = "right";
  ctx.fillStyle = "#9290b4";
  ctx.font = `700 ${10 * scaleFactor}px -apple-system, sans-serif`;
  ctx.fillText("スコア", rightWall - 2, 24 * scaleFactor);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${22 * scaleFactor}px -apple-system, sans-serif`;
  ctx.fillText(formatScore(score), rightWall - 2, 48 * scaleFactor);

  ctx.textAlign = "left";
  ctx.fillStyle = "#82809f";
  ctx.font = `700 ${10 * scaleFactor}px -apple-system, sans-serif`;
  ctx.fillText(`ベスト  ${formatScore(Math.max(best, score))}`, leftWall + 3, 48 * scaleFactor);

  if (combo > 1 && elapsed < comboUntil) {
    const strength = Math.min(1, (comboUntil - elapsed) * 1.5);
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(255, 188, 244, ${strength})`;
    ctx.font = `950 ${19 * scaleFactor}px -apple-system, sans-serif`;
    ctx.shadowColor = "#ff70e2";
    ctx.shadowBlur = 16 * strength;
    ctx.fillText(`${combo} コンボ`, width / 2, 70 * scaleFactor);
    ctx.shadowBlur = 0;
  }

  if (state === "playing" && !gacha && dropCooldown <= 0.1) {
    ctx.globalAlpha = 0.5 + Math.sin(elapsed * 3) * 0.16;
    ctx.fillStyle = "#bbb5dc";
    ctx.textAlign = "center";
    ctx.font = `700 ${10 * scaleFactor}px -apple-system, sans-serif`;
    ctx.fillText("落とす場所をタップ", width / 2, boxTop - 79 * scaleFactor);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawBox() {
  const x = leftWall;
  const w = rightWall - leftWall;
  ctx.save();
  ctx.shadowColor = "rgb(146 116 255 / 20%)";
  ctx.shadowBlur = 25;
  ctx.lineWidth = 2 * scaleFactor;
  ctx.strokeStyle = "rgba(177, 176, 240, .52)";
  ctx.beginPath();
  ctx.moveTo(x, boxTop);
  ctx.lineTo(x, floorY);
  ctx.lineTo(rightWall, floorY);
  ctx.lineTo(rightWall, boxTop);
  ctx.stroke();
  ctx.shadowBlur = 0;

  const interior = ctx.createLinearGradient(0, boxTop, 0, floorY);
  interior.addColorStop(0, "rgba(124, 97, 190, .035)");
  interior.addColorStop(0.84, "rgba(101, 73, 145, .07)");
  interior.addColorStop(1, "rgba(197, 148, 255, .14)");
  ctx.fillStyle = interior;
  ctx.beginPath();
  ctx.moveTo(x + 1, boxTop + 1);
  ctx.lineTo(rightWall - 1, boxTop + 1);
  ctx.lineTo(rightWall - 1, floorY - 1);
  ctx.lineTo(x + 1, floorY - 1);
  ctx.fill();

  const dangerous = dangerTimer > 0.02;
  const glow = 0.26 + Math.sin(elapsed * 2.5) * 0.09 + dangerTimer * 0.32;
  ctx.shadowColor = dangerous ? "#ff576d" : "#ff78d4";
  ctx.shadowBlur = (dangerous ? 12 : 8) * scaleFactor;
  ctx.strokeStyle = dangerous ? `rgba(255, 91, 111, ${glow + 0.25})` : `rgba(255, 133, 225, ${glow})`;
  ctx.lineWidth = (dangerous ? 2.5 : 1.5) * scaleFactor;
  ctx.setLineDash([8 * scaleFactor, 6 * scaleFactor]);
  ctx.beginPath();
  ctx.moveTo(x, dangerY);
  ctx.lineTo(rightWall, dangerY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.fillStyle = dangerous ? "#ff7588" : "#d991eb";
  ctx.font = `800 ${8.5 * scaleFactor}px -apple-system, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("あふれ注意", x + 5 * scaleFactor, dangerY - 4 * scaleFactor);
  ctx.restore();
  void w;
}

function drawNext() {
  const x = width / 2;
  const y = boxTop - 29 * scaleFactor;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const tier = gacha ? Math.floor(gacha.age / 0.047) % 4 : nextTier;
  ctx.fillStyle = gacha ? "#ffe4a5" : "#8987a8";
  ctx.font = `800 ${9 * scaleFactor}px -apple-system, sans-serif`;
  ctx.fillText(gacha ? "ガチャ中" : `つぎ：${STAGES[tier].name}`, x, y - 23 * scaleFactor);
  const r = stageRadius(tier);
  const pulse = gacha ? 1 + Math.sin(gacha.age * 55) * 0.17 : 1;
  ctx.shadowColor = gacha ? "#fff1a7" : STAGES[tier].color;
  ctx.shadowBlur = (gacha ? 26 : 13) * scaleFactor;
  drawSphere(x, y, r * 0.64 * pulse, tier, 0);
  ctx.shadowBlur = 0;
  if (gacha) {
    ctx.strokeStyle = `rgba(255, 239, 181, ${0.3 + Math.sin(gacha.age * 44) * 0.2})`;
    ctx.lineWidth = 2 * scaleFactor;
    ctx.beginPath();
    ctx.arc(x, y, r + (5 + Math.sin(gacha.age * 28) * 3) * scaleFactor, elapsed * 6, elapsed * 6 + Math.PI * 1.55);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ball) {
  ctx.save();
  ctx.translate(ball.x, ball.y);
  const wobble = ball.pulse > 0 ? Math.sin((1 - ball.pulse) * 20) * ball.pulse * 0.13 : 0;
  const squash = 1 + wobble;
  ctx.scale(1 + wobble * 0.55, 1 - wobble * 0.6);
  const stage = STAGES[ball.tier];
  if (ball.tier >= 7 || ball.glow > 0) {
    ctx.shadowColor = stage.color;
    ctx.shadowBlur = (9 + ball.glow * 20 + ball.tier * 0.5) * scaleFactor;
  }
  drawSphere(0, 0, ball.r, ball.tier, ball.spin + elapsed * (ball.tier >= 10 ? 0.26 : 0.1));
  ctx.shadowBlur = 0;
  if (ball.tier <= 5 || ball.tier >= 6) drawIcon(0, 0, ball.r, ball.tier, ball.spin + elapsed * 0.12);
  if (ball.tier >= 3 && ball.tier <= 5) drawFace(0, 0, ball.r, ball.tier);
  drawBallLabel(ball);
  ctx.restore();
  void squash;
}

function drawSphere(x, y, radius, tier, rotation = 0) {
  const stage = STAGES[tier];
  const gradient = ctx.createRadialGradient(x - radius * 0.36, y - radius * 0.42, radius * 0.03, x + radius * 0.12, y + radius * 0.14, radius * 1.14);
  gradient.addColorStop(0, stage.light);
  gradient.addColorStop(0.22, stage.color);
  gradient.addColorStop(0.78, stage.color);
  gradient.addColorStop(1, tier < 7 ? "#46475e" : "#1a1a3e");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.lineWidth = Math.max(1, radius * 0.075);
  ctx.strokeStyle = tier < 6 ? "rgba(255,255,255,.38)" : "rgba(255,255,255,.55)";
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.9, 0, TAU);
  ctx.clip();
  const glint = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.48, 0, x - radius * 0.35, y - radius * 0.48, radius * 0.8);
  glint.addColorStop(0, "rgba(255,255,255,.54)");
  glint.addColorStop(0.44, "rgba(255,255,255,.13)");
  glint.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glint;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  if (tier >= 9) {
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.strokeStyle = tier === 12 ? "rgba(255,255,255,.86)" : "rgba(255,250,222,.64)";
    ctx.lineWidth = Math.max(0.8, radius * 0.035);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.83, radius * 0.25, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  if (tier > 6) {
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.beginPath();
    ctx.arc(x - radius * 0.38, y - radius * 0.43, Math.max(1, radius * 0.07), 0, TAU);
    ctx.fill();
  }
}

function drawBallLabel(ball) {
  const radius = ball.r;
  if (radius <= 6) return;
  ctx.fillStyle = "rgba(19,18,39,.78)";
  ctx.font = `900 ${clamp(radius * 0.48, 5, 13)}px -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(STAGES[ball.tier].name, 0, radius * 0.68);
}

function drawFace(x, y, radius, tier) {
  const eyeY = y - radius * 0.08;
  const eyeGap = radius * 0.27;
  const eyeSize = Math.max(1.3, radius * 0.065);
  ctx.fillStyle = "#3d324a";
  ctx.beginPath();
  ctx.arc(x - eyeGap, eyeY, eyeSize, 0, TAU);
  ctx.arc(x + eyeGap, eyeY, eyeSize, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.beginPath();
  ctx.arc(x - eyeGap - eyeSize * .25, eyeY - eyeSize * .3, eyeSize * .27, 0, TAU);
  ctx.arc(x + eyeGap - eyeSize * .25, eyeY - eyeSize * .3, eyeSize * .27, 0, TAU);
  ctx.fill();
  if (tier === 3) {
    ctx.fillStyle = "#fa8f92";
    ctx.beginPath();
    ctx.moveTo(x, eyeY + eyeSize * .4);
    ctx.lineTo(x - eyeSize * .55, eyeY + eyeSize);
    ctx.lineTo(x + eyeSize * .55, eyeY + eyeSize);
    ctx.fill();
  } else if (tier === 4) {
    ctx.strokeStyle = "#674757";
    ctx.lineWidth = Math.max(1, radius * .045);
    ctx.beginPath();
    ctx.arc(x, y + radius * .11, radius * .13, 0.16, Math.PI - 0.16);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.48)";
    ctx.beginPath();
    ctx.arc(x - radius * .43, y + radius * .16, radius * .11, 0, TAU);
    ctx.arc(x + radius * .43, y + radius * .16, radius * .11, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = "#654c37";
    ctx.beginPath();
    ctx.ellipse(x, eyeY + eyeSize * 1.6, eyeSize * .7, eyeSize * .36, 0, 0, TAU);
    ctx.fill();
  }
}

function drawIcon(x, y, r, tier, rotation) {
  ctx.save();
  ctx.translate(x, y);
  const lw = Math.max(1.3, r * 0.055);
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (tier) {
    case 0: {
      ctx.fillStyle = "#fff8d3";
      ctx.shadowColor = "#fff2b2";
      ctx.shadowBlur = r * .26;
      for (const [dx, dy, size] of [[-.33, -.13, .14], [.18, -.27, .11], [.24, .2, .12], [-.2, .31, .075]]) {
        ctx.beginPath(); ctx.arc(r * dx, r * dy, Math.max(.6, r * size), 0, TAU); ctx.fill();
      }
      ctx.shadowBlur = 0;
      break;
    }
    case 1: {
      ctx.fillStyle = "rgba(54,62,87,.66)";
      ctx.beginPath();
      ctx.moveTo(-r * .65, r * .18); ctx.lineTo(-r * .48, -r * .31); ctx.lineTo(-r * .07, -r * .63);
      ctx.lineTo(r * .4, -r * .41); ctx.lineTo(r * .66, -r * .04); ctx.lineTo(r * .44, r * .46);
      ctx.lineTo(-r * .19, r * .57); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.7)";
      ctx.beginPath(); ctx.moveTo(-r * .48, -r * .31); ctx.lineTo(-r * .03, -r * .13); ctx.lineTo(r * .4, -r * .41); ctx.stroke();
      break;
    }
    case 2: {
      ctx.rotate(-.17);
      ctx.fillStyle = "#fff0c1";
      ctx.strokeStyle = "rgba(157,93,65,.5)";
      ctx.beginPath(); ctx.ellipse(0, .015 * r, r * .38, r * .51, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.beginPath(); ctx.ellipse(-r * .1, -r * .19, r * .09, r * .18, -.25, 0, TAU); ctx.fill();
      break;
    }
    case 3: {
      ctx.fillStyle = "#f6a72b";
      ctx.beginPath(); ctx.ellipse(0, -r * .83, r * .11, r * .23, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-r * .12, -r * .72, r * .1, r * .19, -.55, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.66)";
      ctx.beginPath(); ctx.ellipse(r * .3, r * .13, r * .15, r * .25, -.68, 0, TAU); ctx.fill();
      break;
    }
    case 4: {
      ctx.fillStyle = "#ed8589";
      ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.beginPath();
      ctx.moveTo(-r * .66, -r * .22); ctx.lineTo(-r * .52, -r * .94); ctx.lineTo(-r * .06, -r * .58); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r * .06, -r * .58); ctx.lineTo(r * .52, -r * .94); ctx.lineTo(r * .66, -r * .22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(88,57,75,.72)";
      ctx.lineWidth = Math.max(.7, r * .028);
      ctx.beginPath();
      ctx.moveTo(-r * .38, r * .25); ctx.lineTo(-r * .8, r * .18);
      ctx.moveTo(-r * .37, r * .34); ctx.lineTo(-r * .78, r * .43);
      ctx.moveTo(r * .38, r * .25); ctx.lineTo(r * .8, r * .18);
      ctx.moveTo(r * .37, r * .34); ctx.lineTo(r * .78, r * .43); ctx.stroke();
      break;
    }
    case 5: {
      ctx.fillStyle = "#b65b35";
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const angle = i * TAU / 24;
        const radius = r * (i % 2 ? .61 : .83);
        if (i === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ffcf80";
      ctx.beginPath(); ctx.arc(0, 0, r * .56, 0, TAU); ctx.fill();
      break;
    }
    case 6: {
      ctx.fillStyle = "rgba(28,88,67,.72)";
      ctx.beginPath();
      ctx.moveTo(-r * .7, r * .47); ctx.lineTo(-r * .17, -r * .4); ctx.lineTo(r * .1, r * .11); ctx.lineTo(r * .36, -r * .19); ctx.lineTo(r * .74, r * .47); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ecffff";
      ctx.beginPath(); ctx.moveTo(-r * .27, -.22 * r); ctx.lineTo(-.17 * r, -.4 * r); ctx.lineTo(-.07 * r, -.07 * r); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(.29 * r, -.1 * r); ctx.lineTo(.36 * r, -.19 * r); ctx.lineTo(.47 * r, .02 * r); ctx.closePath(); ctx.fill();
      break;
    }
    case 7: {
      ctx.fillStyle = "rgba(27,32,81,.26)";
      ctx.beginPath(); ctx.arc(-r * .12, r * .08, r * .46, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f4f0ff";
      ctx.beginPath(); ctx.arc(-r * .19, -r * .07, r * .37, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7f8ce7";
      ctx.beginPath(); ctx.arc(r * .07, -r * .13, r * .34, -1.12, 1.1); ctx.arc(r * .05, -r * .12, r * .19, 1.02, -.5, true); ctx.fill();
      break;
    }
    case 8: {
      ctx.fillStyle = "#76d5ff";
      ctx.beginPath(); ctx.arc(0, 0, r * .68, 0, TAU); ctx.fill();
      ctx.fillStyle = "#42c98d";
      ctx.beginPath();
      ctx.moveTo(-r * .48, -r * .14); ctx.quadraticCurveTo(-r * .18, -r * .56, r * .09, -r * .33); ctx.quadraticCurveTo(r * .34, -r * .15, r * .55, -.2 * r); ctx.lineTo(r * .43, .16 * r); ctx.quadraticCurveTo(r * .1, .22 * r, r * .05, .58 * r); ctx.quadraticCurveTo(-r * .2, .35 * r, -r * .32, .1 * r); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.beginPath(); ctx.ellipse(-r * .17, -r * .29, r * .12, r * .055, -.5, 0, TAU); ctx.fill();
      break;
    }
    case 9: {
      const spikes = 14;
      ctx.fillStyle = "rgba(255,217,104,.82)";
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const radius = i % 2 ? r * .79 : r * 1.01;
        const angle = rotation + i * Math.PI / spikes;
        if (i === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff3a2";
      ctx.beginPath(); ctx.arc(0, 0, r * .69, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(246,99,49,.25)";
      ctx.beginPath(); ctx.arc(-r * .13, r * .11, r * .45, 0, TAU); ctx.fill();
      break;
    }
    case 10: {
      ctx.rotate(rotation);
      ctx.strokeStyle = "rgba(251,222,255,.84)";
      ctx.beginPath(); ctx.ellipse(0, 0, r * .76, r * .29, -.2, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r * .59, r * .19, .38, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#fff7d1";
      for (let i = 0; i < 5; i++) {
        const angle = i * 2.4 + rotation;
        ctx.beginPath(); ctx.arc(Math.cos(angle) * r * .45, Math.sin(angle) * r * .32, r * .045, 0, TAU); ctx.fill();
      }
      break;
    }
    case 11: {
      ctx.rotate(rotation * .4);
      ctx.strokeStyle = "rgba(214,195,255,.82)";
      ctx.beginPath(); ctx.ellipse(0, 0, r * .72, r * .23, .52, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r * .54, r * .16, -.65, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#fff9d6";
      ctx.beginPath(); ctx.arc(0, 0, r * .16, 0, TAU); ctx.fill();
      break;
    }
    case 12: {
      ctx.rotate(rotation * .22);
      ctx.strokeStyle = "rgba(255,255,245,.88)";
      ctx.beginPath(); ctx.ellipse(0, 0, r * .72, r * .25, -.48, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(255,222,135,.95)";
      ctx.beginPath(); ctx.ellipse(0, 0, r * .54, r * .18, .5, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(0, -r * .06, r * .2, 0, TAU); ctx.fill();
      ctx.fillStyle = "#6247dc";
      ctx.beginPath(); ctx.arc(0, -r * .06, r * .09, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff5ad";
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8 + rotation;
        ctx.beginPath(); ctx.arc(Math.cos(angle) * r * .85, Math.sin(angle) * r * .85, r * .027, 0, TAU); ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    const alpha = clamp(p.life / Math.max(p.maxLife, 0.001), 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 7 * alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size * alpha), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawFloaters() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const item of floaters) {
    const progress = item.life / item.maxLife;
    ctx.globalAlpha = Math.min(1, progress * 1.7);
    ctx.fillStyle = item.color;
    ctx.font = `950 ${item.size}px -apple-system, sans-serif`;
    ctx.shadowColor = item.color;
    ctx.shadowBlur = 12 * progress;
    ctx.fillText(item.text, item.x, item.y);
  }
  ctx.restore();
}

function drawCrack() {
  if (!screenCrack) return;
  const progress = screenCrack.age / 1.35;
  const alpha = (1 - progress) * (screenCrack.gameOver ? 0.47 : 0.82);
  const originX = screenCrack.x;
  const originY = screenCrack.y;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  for (let ray = 0; ray < 15; ray++) {
    const angle = ray * TAU / 15 + 0.06 * Math.sin(ray * 8.4);
    const endX = originX + Math.cos(angle) * Math.max(width, height) * (0.47 + 0.12 * Math.sin(ray * 7));
    const endY = originY + Math.sin(angle) * Math.max(width, height) * (0.47 + 0.12 * Math.cos(ray * 4));
    ctx.strokeStyle = ray % 3 === 0 ? "#fff9dc" : "#f5ddff";
    ctx.lineWidth = (ray % 3 === 0 ? 2 : 0.85) * scaleFactor;
    ctx.shadowColor = "#e7bbff";
    ctx.shadowBlur = 12 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    const pieces = 5;
    for (let j = 1; j <= pieces; j++) {
      const t = j / pieces;
      const bend = (j % 2 ? 1 : -1) * 8 * scaleFactor * (1 - t * 0.45);
      ctx.lineTo(originX + (endX - originX) * t + Math.cos(angle + Math.PI / 2) * bend, originY + (endY - originY) * t + Math.sin(angle + Math.PI / 2) * bend);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawAim() {
  if (state !== "playing" || gacha || dropCooldown > 0.1) return;
  const x = clamp(aimX, leftWall + stageRadius(nextTier), rightWall - stageRadius(nextTier));
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.setLineDash([3, 8]);
  ctx.strokeStyle = "#e8d7ff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, boxTop - 11 * scaleFactor);
  ctx.lineTo(x, dangerY - 4 * scaleFactor);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, boxTop - 8 * scaleFactor, 3 * scaleFactor, 0, TAU);
  ctx.fillStyle = "#ffd8fe";
  ctx.fill();
  ctx.restore();
}

function draw() {
  if (!ctx || !width || !height) return;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const maxShake = reducedMotion.matches ? 0.18 : 1;
  const offsetX = shake > 0 ? rand(-shake, shake) * maxShake : 0;
  const offsetY = shake > 0 ? rand(-shake, shake) * maxShake : 0;
  ctx.save();
  ctx.translate(offsetX, offsetY);
  drawBackground();
  drawBox();
  drawHud();
  drawNext();
  drawAim();
  for (const ball of balls) drawBall(ball);
  drawParticles();
  drawFloaters();
  drawCrack();
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,250,255,${Math.min(0.64, flash * 0.27)})`;
    ctx.fillRect(-offsetX, -offsetY, width, height);
  }
  ctx.restore();
}

function frame(timestamp) {
  const dt = Math.min(0.034, (timestamp - lastFrame) / 1000 || 0.016);
  lastFrame = timestamp;
  if (state === "playing" || state === "over" || particles.length || floaters.length || screenCrack) update(dt);
  draw();
  requestAnimationFrame(frame);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener("pointermove", (event) => {
  aimX = pointFromEvent(event).x;
});
canvas.addEventListener("pointerdown", (event) => {
  if (state !== "playing") return;
  event.preventDefault();
  aimX = pointFromEvent(event).x;
  startGacha(aimX);
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("selectstart", (event) => event.preventDefault());
document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
document.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
window.addEventListener("resize", resize, { passive: true });
window.addEventListener("orientationchange", () => window.setTimeout(resize, 70), { passive: true });
startButton.addEventListener("click", beginGame);
restartButton.addEventListener("click", beginGame);

resize();
requestAnimationFrame((time) => {
  lastFrame = time;
  frame(time + 1);
});

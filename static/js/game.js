(() => {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('gameOverlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const nicknameInput = document.getElementById('nicknameInput');
  const startButton = document.getElementById('startGameButton');
  const restartButton = document.getElementById('restartGameButton');
  const rankingLink = document.getElementById('rankingLink');
  const jumpButton = document.getElementById('touchJump');
  const soundButton = document.getElementById('soundButton');
  const csrfToken = document.getElementById('csrfToken').value;
  const scoreEl = document.getElementById('scoreValue');
  const carrotEl = document.getElementById('carrotValue');
  const levelEl = document.getElementById('levelValue');
  const livesEl = document.getElementById('livesValue');
  const liveLeaderboard = document.getElementById('liveLeaderboard');

  const WORLD_W = 960;
  const WORLD_H = 540;
  const groundY = 440;
  let rafId = 0;
  let previousTime = 0;
  let startedAt = 0;
  let sessionToken = null;
  let soundEnabled = true;
  let audioContext = null;

  const game = {
    running: false,
    paused: false,
    over: false,
    speed: 315,
    distance: 0,
    score: 0,
    carrots: 0,
    lives: 3,
    level: 1,
    combo: 1,
    comboTimer: 0,
    spawnTimer: 0,
    carrotTimer: 0,
    particles: [],
    obstacles: [],
    pickups: [],
    clouds: [
      {x: 120, y: 92, size: 1.1},
      {x: 540, y: 138, size: .8},
      {x: 790, y: 70, size: 1.25}
    ],
    rabbit: {x: 145, y: groundY - 72, w: 58, h: 72, vy: 0, jumps: 0, invuln: 0, squash: 0}
  };

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.width * (WORLD_H / WORLD_W) * dpr);
    ctx.setTransform(canvas.width / WORLD_W, 0, 0, canvas.height / WORLD_H, 0, 0);
  }

  function beep(frequency = 440, duration = .05, type = 'sine', volume = .04) {
    if (!soundEnabled) return;
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + duration);
  }

  function reset() {
    Object.assign(game, {
      running: false, paused: false, over: false, speed: 315, distance: 0,
      score: 0, carrots: 0, lives: 3, level: 1, combo: 1, comboTimer: 0,
      spawnTimer: .9, carrotTimer: .55, particles: [], obstacles: [], pickups: []
    });
    Object.assign(game.rabbit, {x: 145, y: groundY - 72, w: 58, h: 72, vy: 0, jumps: 0, invuln: 0, squash: 0});
    updateHud();
  }

  async function startGame() {
    if (!nicknameInput.value.trim()) {
      nicknameInput.focus();
      return;
    }
    startButton.disabled = true;
    restartButton.disabled = true;
    try {
      const response = await fetch('/api/game/start/', {
        method: 'POST',
        headers: {'X-CSRFToken': csrfToken, 'Content-Type': 'application/json'},
        body: '{}'
      });
      if (!response.ok) throw new Error('No se pudo iniciar la sesión.');
      const data = await response.json();
      sessionToken = data.token;
      reset();
      overlay.classList.add('hidden');
      game.running = true;
      startedAt = performance.now();
      previousTime = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
      beep(620, .08, 'triangle');
    } catch (error) {
      overlayText.textContent = 'No pudimos abrir el sendero. Revisá tu conexión e intentá de nuevo.';
    } finally {
      startButton.disabled = false;
      restartButton.disabled = false;
    }
  }

  function jump() {
    if (!game.running || game.paused || game.over) return;
    const rabbit = game.rabbit;
    if (rabbit.jumps < 2) {
      rabbit.vy = rabbit.jumps === 0 ? -670 : -590;
      rabbit.jumps += 1;
      rabbit.squash = .16;
      emitParticles(rabbit.x + 18, groundY - 4, 5, '#c7d8ae');
      beep(rabbit.jumps === 1 ? 360 : 470, .06, 'square', .025);
    }
  }

  function spawnObstacle() {
    const type = Math.random() < .65 ? 'log' : 'rock';
    const width = type === 'log' ? 62 + Math.random() * 28 : 45 + Math.random() * 20;
    const height = type === 'log' ? 38 : 46 + Math.random() * 18;
    game.obstacles.push({x: WORLD_W + 40, y: groundY - height, w: width, h: height, type, hit: false});
  }

  function spawnCarrot() {
    const high = Math.random() < .45;
    const y = high ? 270 + Math.random() * 60 : 360 + Math.random() * 32;
    game.pickups.push({x: WORLD_W + 30, y, w: 30, h: 44, spin: Math.random() * 6, taken: false});
  }

  function intersects(a, b, inset = 8) {
    return a.x + inset < b.x + b.w - inset && a.x + a.w - inset > b.x + inset &&
      a.y + inset < b.y + b.h - inset && a.y + a.h - inset > b.y + inset;
  }

  function emitParticles(x, y, count, color) {
    for (let i = 0; i < count; i += 1) {
      game.particles.push({x, y, vx: (Math.random() - .5) * 180, vy: -40 - Math.random() * 160, life: .35 + Math.random() * .35, color, size: 3 + Math.random() * 5});
    }
  }

  function update(dt) {
    const rabbit = game.rabbit;
    game.distance += game.speed * dt;
    game.level = Math.min(100, Math.floor(game.distance / 2200) + 1);
    game.speed = Math.min(650, 315 + (game.level - 1) * 22);
    game.score += dt * 22 * game.level;

    rabbit.vy += 1780 * dt;
    rabbit.y += rabbit.vy * dt;
    rabbit.invuln = Math.max(0, rabbit.invuln - dt);
    rabbit.squash = Math.max(0, rabbit.squash - dt);
    if (rabbit.y >= groundY - rabbit.h) {
      rabbit.y = groundY - rabbit.h;
      if (rabbit.vy > 280) rabbit.squash = .12;
      rabbit.vy = 0;
      rabbit.jumps = 0;
    }

    game.spawnTimer -= dt;
    game.carrotTimer -= dt;
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) game.combo = 1;

    if (game.spawnTimer <= 0) {
      spawnObstacle();
      const difficulty = Math.max(.64, 1.45 - game.level * .055);
      game.spawnTimer = difficulty + Math.random() * .75;
    }
    if (game.carrotTimer <= 0) {
      spawnCarrot();
      game.carrotTimer = .8 + Math.random() * 1.05;
    }

    for (const obstacle of game.obstacles) {
      obstacle.x -= game.speed * dt;
      if (!obstacle.hit && rabbit.invuln <= 0 && intersects(rabbit, obstacle, 12)) {
        obstacle.hit = true;
        rabbit.invuln = 1.35;
        rabbit.vy = -360;
        game.lives -= 1;
        game.combo = 1;
        game.comboTimer = 0;
        emitParticles(rabbit.x + 28, rabbit.y + 38, 14, '#b66a4b');
        beep(120, .18, 'sawtooth', .05);
        if (game.lives <= 0) endGame();
      }
    }

    for (const carrot of game.pickups) {
      carrot.x -= game.speed * dt;
      carrot.spin += dt * 5;
      if (!carrot.taken && intersects(rabbit, carrot, 5)) {
        carrot.taken = true;
        game.carrots += 1;
        game.combo = Math.min(8, game.combo + 1);
        game.comboTimer = 3.2;
        game.score += 100 * game.combo;
        emitParticles(carrot.x + 15, carrot.y + 20, 10, '#ef8e3f');
        beep(620 + game.combo * 35, .07, 'triangle', .035);
      }
    }

    game.obstacles = game.obstacles.filter(item => item.x + item.w > -30);
    game.pickups = game.pickups.filter(item => !item.taken && item.x + item.w > -30);

    for (const particle of game.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 520 * dt;
      particle.life -= dt;
    }
    game.particles = game.particles.filter(item => item.life > 0);

    for (const cloud of game.clouds) {
      cloud.x -= game.speed * .025 * cloud.size * dt;
      if (cloud.x < -160) cloud.x = WORLD_W + 120;
    }
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = Math.floor(game.score).toLocaleString('es-AR');
    carrotEl.textContent = game.carrots;
    levelEl.textContent = game.level;
    livesEl.textContent = '♥'.repeat(Math.max(0, game.lives)) + '♡'.repeat(Math.max(0, 3 - game.lives));
  }

  async function endGame() {
    if (game.over) return;
    game.over = true;
    game.running = false;
    const duration = Math.max(2000, Math.round(performance.now() - startedAt));
    overlay.classList.remove('hidden');
    overlayTitle.textContent = `Puntaje: ${Math.floor(game.score).toLocaleString('es-AR')}`;
    overlayText.textContent = 'Guardando tu recorrido en el mapa del bosque…';
    startButton.classList.add('hidden');
    restartButton.classList.remove('hidden');
    rankingLink.classList.remove('hidden');
    nicknameInput.classList.add('hidden');
    document.querySelector('.nickname-field').classList.add('hidden');

    try {
      const response = await fetch('/api/game/score/', {
        method: 'POST',
        headers: {'X-CSRFToken': csrfToken, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          token: sessionToken,
          nickname: nicknameInput.value.trim(),
          score: Math.floor(game.score),
          carrots: game.carrots,
          level: game.level,
          duration_ms: duration
        })
      });
      const data = await response.json();
      overlayText.textContent = response.ok ? `${data.message} Juntaste ${game.carrots} zanahorias.` : (data.error || 'No se pudo guardar el puntaje.');
      loadLeaderboard();
    } catch (error) {
      overlayText.textContent = 'Terminaste la carrera, pero no pudimos guardar el puntaje.';
    }
  }

  function drawRoundedRect(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    sky.addColorStop(0, '#f7fbf2');
    sky.addColorStop(.72, '#edf4df');
    sky.addColorStop(1, '#dfeacb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.fillStyle = '#f4c973';
    ctx.beginPath();
    ctx.arc(820, 92, 42, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of game.clouds) drawCloud(cloud.x, cloud.y, cloud.size);

    ctx.fillStyle = '#d1dfba';
    ctx.beginPath();
    ctx.moveTo(0, 355);
    for (let x = 0; x <= WORLD_W; x += 80) {
      ctx.quadraticCurveTo(x + 40, 300 + Math.sin((x + game.distance * .04) * .01) * 22, x + 80, 355);
    }
    ctx.lineTo(WORLD_W, groundY);
    ctx.lineTo(0, groundY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#a9c482';
    ctx.fillRect(0, groundY, WORLD_W, WORLD_H - groundY);
    ctx.fillStyle = '#8eaa67';
    ctx.fillRect(0, groundY, WORLD_W, 8);

    ctx.strokeStyle = 'rgba(82,105,58,.18)';
    ctx.lineWidth = 2;
    const offset = -(game.distance * .8) % 70;
    for (let x = offset; x < WORLD_W; x += 70) {
      ctx.beginPath();
      ctx.moveTo(x, 486);
      ctx.quadraticCurveTo(x + 24, 470, x + 48, 488);
      ctx.stroke();
    }
  }

  function drawCloud(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.beginPath();
    ctx.arc(0, 10, 27, 0, Math.PI * 2);
    ctx.arc(28, 0, 35, 0, Math.PI * 2);
    ctx.arc(62, 12, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRabbit() {
    const r = game.rabbit;
    const blink = r.invuln > 0 && Math.floor(r.invuln * 12) % 2 === 0;
    if (blink) return;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    const stretch = Math.min(.14, Math.abs(r.vy) / 5000);
    const squash = r.squash > 0 ? .13 : 0;
    ctx.scale(1 + squash - stretch, 1 - squash + stretch);
    ctx.translate(-r.w / 2, -r.h / 2);

    ctx.fillStyle = '#fdfcf8';
    ctx.strokeStyle = '#66574b';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(18, 15, 10, 27, -.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(40, 13, 10, 29, .15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e9b8ac';
    ctx.beginPath(); ctx.ellipse(18, 14, 4, 18, -.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(40, 12, 4, 19, .15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fdfcf8';
    ctx.beginPath(); ctx.ellipse(29, 45, 27, 28, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(29, 67, 28, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#493f38';
    ctx.beginPath(); ctx.arc(20, 41, 3.2, 0, Math.PI * 2); ctx.arc(39, 41, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d98d84';
    ctx.beginPath(); ctx.moveTo(29, 48); ctx.lineTo(24, 52); ctx.lineTo(34, 52); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#66574b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(29, 52); ctx.lineTo(29, 58); ctx.stroke();
    ctx.restore();
  }

  function drawObstacle(o) {
    ctx.save();
    if (o.type === 'log') {
      ctx.fillStyle = '#8a5b3f'; drawRoundedRect(o.x, o.y, o.w, o.h, 14); ctx.fill();
      ctx.fillStyle = '#b9794d'; ctx.beginPath(); ctx.arc(o.x + o.w - 7, o.y + o.h / 2, o.h * .42, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#74482f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x + o.w - 7, o.y + o.h / 2, o.h * .24, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#6f4935'; ctx.beginPath(); ctx.moveTo(o.x + 18, o.y + 4); ctx.lineTo(o.x + 23, o.y + o.h - 4); ctx.stroke();
    } else {
      ctx.fillStyle = '#7d8379';
      ctx.beginPath(); ctx.moveTo(o.x + 4, o.y + o.h); ctx.quadraticCurveTo(o.x, o.y + 20, o.x + 18, o.y + 7); ctx.quadraticCurveTo(o.x + o.w * .7, o.y - 7, o.x + o.w, o.y + o.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(o.x + o.w * .45, o.y + 15, 10, 5, -.35, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawCarrot(c) {
    ctx.save();
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
    ctx.rotate(Math.sin(c.spin) * .18);
    ctx.fillStyle = '#ef8b3c';
    ctx.beginPath(); ctx.moveTo(-10, -10); ctx.quadraticCurveTo(0, 28, 9, -10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#cb672b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 4); ctx.moveTo(-3, 9); ctx.lineTo(4, 12); ctx.stroke();
    ctx.strokeStyle = '#668b48'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-9, -23); ctx.moveTo(0, -11); ctx.lineTo(2, -26); ctx.moveTo(1, -10); ctx.lineTo(11, -21); ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCombo() {
    if (game.combo <= 1 || game.comboTimer <= 0) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    drawRoundedRect(405, 36, 150, 54, 27); ctx.fill();
    ctx.fillStyle = '#405a36'; ctx.font = '700 22px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`COMBO ×${game.combo}`, 480, 70);
    ctx.restore();
  }

  function drawPause() {
    if (!game.paused) return;
    ctx.fillStyle = 'rgba(32,50,28,.58)'; ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = '#fff'; ctx.font = '800 42px system-ui'; ctx.textAlign = 'center'; ctx.fillText('PAUSA', WORLD_W / 2, WORLD_H / 2);
    ctx.font = '500 18px system-ui'; ctx.fillText('Presioná P para continuar', WORLD_W / 2, WORLD_H / 2 + 38);
  }

  function draw() {
    drawBackground();
    for (const carrot of game.pickups) drawCarrot(carrot);
    for (const obstacle of game.obstacles) drawObstacle(obstacle);
    drawRabbit();
    drawParticles();
    drawCombo();
    drawPause();
  }

  function loop(time) {
    const dt = Math.min(.033, (time - previousTime) / 1000 || 0);
    previousTime = time;
    if (game.running && !game.paused && !game.over) update(dt);
    draw();
    if (!game.over) rafId = requestAnimationFrame(loop);
  }

  function togglePause() {
    if (!game.running || game.over) return;
    game.paused = !game.paused;
    previousTime = performance.now();
  }

  async function loadLeaderboard() {
    try {
      const response = await fetch('/api/leaderboard/');
      const data = await response.json();
      if (!data.results.length) {
        liveLeaderboard.innerHTML = '<li class="empty-state">El primer puesto sigue libre.</li>';
        return;
      }
      liveLeaderboard.innerHTML = data.results.slice(0, 5).map((row, index) => `
        <li><span class="rank-number">${String(index + 1).padStart(2, '0')}</span><span class="rank-name">${escapeHtml(row.nickname)}</span><strong>${Number(row.score).toLocaleString('es-AR')}</strong></li>
      `).join('');
    } catch (_) {
      liveLeaderboard.innerHTML = '<li class="empty-state">No pudimos leer el ranking.</li>';
    }
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('keydown', event => {
    if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) { event.preventDefault(); jump(); }
    if (event.code === 'KeyP') togglePause();
  });
  jumpButton.addEventListener('pointerdown', event => { event.preventDefault(); jump(); });
  canvas.addEventListener('pointerdown', jump);
  startButton.addEventListener('click', startGame);
  restartButton.addEventListener('click', () => {
    nicknameInput.classList.remove('hidden');
    document.querySelector('.nickname-field').classList.remove('hidden');
    startGame();
  });
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.textContent = `Sonido: ${soundEnabled ? 'sí' : 'no'}`;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.running && !game.over) game.paused = true;
  });

  resizeCanvas();
  reset();
  draw();
  loadLeaderboard();
})();

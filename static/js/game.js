(() => {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('gameOverlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const nicknameInput = document.getElementById('nicknameInput');
  const startButton = document.getElementById('startGameButton');
  const confirmModeButton = document.getElementById('confirmModeButton');
  const backToModesButton = document.getElementById('backToModesButton');
  const modeStep = document.getElementById('modeStep');
  const nicknameStep = document.getElementById('nicknameStep');
  const selectedModeName = document.getElementById('selectedModeName');
  const restartButton = document.getElementById('restartGameButton');
  const rankingLink = document.getElementById('rankingLink');
  const shareButton = document.getElementById('shareResultButton');
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
  const soundPreferenceKey = 'bunnyQuestSoundEnabled';
  let soundEnabled = localStorage.getItem(soundPreferenceKey) !== 'false';
  let audioContext = null;
  let maxComboReached = 1;
  let finalShareText = '';
  const FOOD_PICKUPS = {
    carrot: {icon: '🥕', label: 'zanahoria', points: 100, combo: 1, color: '#ef8e3f', w: 30, h: 44},
    golden_carrot: {icon: '🥕', label: 'zanahoria dorada', points: 320, combo: 2, scoreMultiplier: 2, color: '#f5c14d', w: 34, h: 48},
    hay: {icon: '🌾', label: 'heno', points: 70, combo: 1, color: '#d8b765', w: 38, h: 34},
    romaine: {icon: '🥬', label: 'lechuga romana', points: 150, combo: 1, time: .8, color: '#7fbd58', w: 36, h: 36},
    escarole: {icon: '🥗', label: 'escarola', points: 190, combo: 2, color: '#9fd36f', w: 36, h: 36},
    celery: {icon: '🌱', label: 'apio', points: 130, combo: 1, wing: 1.2, color: '#82bd66', w: 36, h: 42},
    pellets: {icon: '🟤', label: 'pellets', points: 55, combo: 1, burst: 5, color: '#8b6546', w: 34, h: 30}
  };
  const POWERUPS = {
    clover: {icon: '🛡️', label: 'trébol escudo', points: 120, color: '#53a85c', w: 38, h: 38},
    wing_leaf: {icon: '🪽', label: 'hoja voladora', points: 130, color: '#bfe7cf', w: 44, h: 34},
    mint: {icon: '🌿', label: 'menta', points: 110, color: '#62b987', w: 38, h: 38},
    heart: {icon: '❤️', label: 'corazón', points: 80, color: '#e15d68', w: 36, h: 34}
  };
  const bunnyColor = canvas.dataset.bunnyColor || 'snow';
  const bunnyAccessory = canvas.dataset.bunnyAccessory || 'none';
  const selectedModeInput = document.querySelector('input[name=challengeMode]:checked');
  let currentMode = selectedModeInput?.value || 'normal';
  const modeLabels = {
    normal: 'Normal',
    timed: '60 segundos',
    one_life: 'Una vida',
    high_carrots: 'Zanahorias altas',
    fast_forest: 'Bosque veloz',
    light_grey: 'Light grey'
  };
  const bunnyPalette = {
    snow: {fur: '#fdfcf8', shade: '#f1eee5'},
    cocoa: {fur: '#c99d7e', shade: '#b98262'},
    sand: {fur: '#ead7a7', shade: '#d8bc7f'},
    moon: {fur: '#dfe2df', shade: '#cbd1ce'}
  };

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
    shield: 0,
    scoreMultiplier: 1,
    scoreMultiplierTimer: 0,
    wingTimer: 0,
    mintTimer: 0,
    tutorialStep: 0,
    tutorialTimer: 0,
    toast: null,
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
    rabbit: {x: 145, y: groundY - 72, w: 58, h: 72, vy: 0, jumps: 0, invuln: 0, squash: 0},
    timeLeft: null
  };

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.width * (WORLD_H / WORLD_W) * dpr);
    ctx.setTransform(canvas.width / WORLD_W, 0, 0, canvas.height / WORLD_H, 0, 0);
  }

  function beep(frequency = 440, duration = .05, type = 'sine', volume = .04, delay = 0) {
    if (!soundEnabled) return;
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    const startAt = audioContext.currentTime + delay;
    osc.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(volume, startAt);
    gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
    osc.connect(gain).connect(audioContext.destination);
    osc.start(startAt);
    osc.stop(startAt + duration);
  }

  function playSound(name) {
    if (name === 'level') [740, 980, 1240].forEach((note, i) => beep(note, .11, 'sine', .035, i * .08));
    else if (name === 'combo') [520, 780, 1040].forEach((note, i) => beep(note, .08, 'triangle', .035, i * .045));
    else if (name === 'damage') [180, 130].forEach((note, i) => beep(note, .12, 'sine', .025, i * .08));
    else if (name === 'record') [660, 880, 990, 1320].forEach((note, i) => beep(note, .12, 'triangle', .04, i * .09));
  }

  function reset() {
    Object.assign(game, {
      running: false, paused: false, over: false, speed: 315, distance: 0,
      score: 0, carrots: 0, lives: currentMode === 'one_life' ? 1 : 3, level: 1, combo: 1, comboTimer: 0, shield: 0,
      scoreMultiplier: 1, scoreMultiplierTimer: 0, wingTimer: 0, mintTimer: 0, tutorialStep: 0, tutorialTimer: 3.8, toast: null,
      spawnTimer: 2.2, carrotTimer: .75, particles: [], obstacles: [], pickups: [], timeLeft: currentMode === 'timed' ? 60 : null
    });
    Object.assign(game.rabbit, {x: 145, y: groundY - 72, w: 58, h: 72, vy: 0, jumps: 0, invuln: 0, squash: 0});
    maxComboReached = 1;
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
        body: JSON.stringify({mode: currentMode})
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
      const wingBoost = game.wingTimer > 0 ? 1.18 : 1;
      rabbit.vy = (rabbit.jumps === 0 ? -670 : -590) * wingBoost;
      rabbit.jumps += 1;
      rabbit.squash = .16;
      emitParticles(rabbit.x + 18, groundY - 4, 5, '#c7d8ae');
      beep(rabbit.jumps === 1 ? 360 : 470, .06, 'square', .025);
    }
  }

  function spawnObstacle() {
    if (game.tutorialStep === 0) {
      game.tutorialStep = 1;
      game.tutorialTimer = 3.2;
      game.obstacles.push({x: WORLD_W + 70, y: groundY - 38, w: 58, h: 38, type: 'log', hit: false, soft: false, flap: 0, tutorial: true});
      return;
    }
    const options = game.level < 3 ? ['log', 'rock'] : ['log', 'rock', 'fox', 'puddle', 'branch', 'thorns', 'owl'];
    const type = options[Math.floor(Math.random() * options.length)];
    const specs = {
      log: {w: 62 + Math.random() * 28, h: 38, y: groundY - 38},
      rock: {w: 45 + Math.random() * 20, h: 46 + Math.random() * 18, y: groundY - 56},
      fox: {w: 86, h: 42, y: groundY - 42},
      puddle: {w: 92, h: 18, y: groundY - 14, soft: true},
      branch: {w: 112, h: 28, y: groundY - 158},
      thorns: {w: 100, h: 34, y: groundY - 34},
      owl: {w: 62, h: 44, y: groundY - 215 - Math.random() * 35}
    };
    const spec = specs[type];
    game.obstacles.push({x: WORLD_W + 40, y: spec.y, w: spec.w, h: spec.h, type, hit: false, soft: Boolean(spec.soft), flap: Math.random() * 6});
  }

  function spawnCarrot() {
    const high = currentMode === 'high_carrots' || Math.random() < .45;
    const y = game.tutorialStep < 2 ? 360 : (high ? 270 + Math.random() * 60 : 360 + Math.random() * 32);
    let type = 'carrot';
    const roll = Math.random();
    if (game.distance > 700 && roll > .95) type = 'heart';
    else if (game.distance > 450 && roll > .90) type = ['clover', 'wing_leaf', 'mint'][Math.floor(Math.random() * 3)];
    else if (game.distance > 300 && roll > .76) type = ['golden_carrot', 'hay', 'romaine', 'escarole', 'celery', 'pellets'][Math.floor(Math.random() * 6)];
    if (game.tutorialStep < 2) { type = 'carrot'; game.tutorialStep = 2; game.tutorialTimer = 4.2; }
    const spec = FOOD_PICKUPS[type] || POWERUPS[type] || FOOD_PICKUPS.carrot;
    game.pickups.push({x: WORLD_W + 30, y, w: spec.w, h: spec.h, type, spin: Math.random() * 6, taken: false});
  }

  function showToast(text, color = '#405a36') {
    game.toast = {text, color, life: 1.8};
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
    const speedFactor = game.mintTimer > 0 ? .68 : 1;
    if (game.timeLeft !== null) { game.timeLeft = Math.max(0, game.timeLeft - dt); if (game.timeLeft <= 0) { endGame(); return; } }
    game.distance += game.speed * speedFactor * dt;
    const previousLevel = game.level;
    game.level = Math.min(100, Math.floor(game.distance / 2200) + 1);
    game.speed = Math.min(currentMode === 'fast_forest' ? 760 : 650, 315 + (currentMode === 'fast_forest' ? 95 : 0) + (game.level - 1) * 22);
    if (game.level > previousLevel) playSound('level');
    game.score += dt * 22 * game.level * game.scoreMultiplier;

    rabbit.vy += 1780 * dt;
    rabbit.y += rabbit.vy * dt;
    rabbit.invuln = Math.max(0, rabbit.invuln - dt);
    rabbit.squash = Math.max(0, rabbit.squash - dt);
    game.scoreMultiplierTimer = Math.max(0, game.scoreMultiplierTimer - dt);
    if (game.scoreMultiplierTimer <= 0) game.scoreMultiplier = 1;
    game.wingTimer = Math.max(0, game.wingTimer - dt);
    game.mintTimer = Math.max(0, game.mintTimer - dt);
    game.tutorialTimer = Math.max(0, game.tutorialTimer - dt);
    if (game.toast) { game.toast.life -= dt; if (game.toast.life <= 0) game.toast = null; }
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
      obstacle.x -= game.speed * speedFactor * (obstacle.tutorial ? .62 : 1) * dt;
      if (obstacle.type === 'owl') obstacle.y += Math.sin(game.distance * .02 + obstacle.flap) * 18 * dt;
      if (!obstacle.hit && rabbit.invuln <= 0 && intersects(rabbit, obstacle, obstacle.soft ? 4 : 12)) {
        obstacle.hit = true;
        rabbit.invuln = obstacle.soft ? .55 : 1.35;
        rabbit.vy = obstacle.soft ? -140 : -360;
        game.speed = obstacle.soft ? Math.max(260, game.speed - 90) : game.speed;
        if (!obstacle.soft && game.shield > 0) {
          game.shield -= 1;
          rabbit.invuln = 1.05;
          showToast('🛡️ El trébol bloqueó el golpe', '#4f8b57');
        } else {
          game.lives -= obstacle.soft ? 0 : 1;
        }
        game.combo = 1;
        game.comboTimer = 0;
        emitParticles(rabbit.x + 28, rabbit.y + 38, obstacle.soft ? 9 : 14, obstacle.soft ? '#5da7b1' : '#b66a4b');
        playSound('damage');
        if (game.lives <= 0) endGame();
      }
    }

    for (const carrot of game.pickups) {
      carrot.x -= game.speed * speedFactor * dt;
      carrot.spin += dt * 5;
      if (!carrot.taken && intersects(rabbit, carrot, 5)) {
        carrot.taken = true;
        collectPickup(carrot);
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
      cloud.x -= game.speed * speedFactor * .025 * cloud.size * dt;
      if (cloud.x < -160) cloud.x = WORLD_W + 120;
    }
    updateHud();
  }


  function collectPickup(pickup) {
    const food = FOOD_PICKUPS[pickup.type] || null;
    const power = POWERUPS[pickup.type] || null;
    const spec = food || power || FOOD_PICKUPS.carrot;
    if (food) {
      game.carrots += pickup.type === 'carrot' || pickup.type === 'golden_carrot' ? 1 : 0;
      const previousCombo = game.combo;
      game.combo = Math.min(8, game.combo + (spec.combo || 1));
      if (game.combo >= 6 && game.combo > previousCombo) playSound('combo');
      maxComboReached = Math.max(maxComboReached, game.combo);
      game.comboTimer = 3.2 + (spec.time || 0);
      if (spec.scoreMultiplier) { game.scoreMultiplier = spec.scoreMultiplier; game.scoreMultiplierTimer = 7; }
      if (spec.wing) game.wingTimer = Math.max(game.wingTimer, spec.wing);
      game.score += (spec.points + (spec.burst || 0) * 15) * game.combo * game.scoreMultiplier;
    } else if (pickup.type === 'clover') {
      game.shield = 1; game.score += spec.points; showToast('🛡️ Escudo listo por un golpe', spec.color);
    } else if (pickup.type === 'wing_leaf') {
      game.wingTimer = 6; game.score += spec.points; showToast('🪽 Saltos más largos', spec.color);
    } else if (pickup.type === 'mint') {
      game.mintTimer = 5.5; game.score += spec.points; showToast('🌿 El bosque va más lento', spec.color);
    } else if (pickup.type === 'heart') {
      game.lives = Math.min(3, game.lives + 1); game.score += spec.points; showToast('❤️ Vida recuperada', spec.color);
    }
    if (pickup.type === 'golden_carrot') showToast('🥕 Zanahoria dorada: puntos ×2', spec.color);
    emitParticles(pickup.x + pickup.w / 2, pickup.y + pickup.h / 2, 12, spec.color);
    beep(620 + game.combo * 35, .07, 'triangle', .035);
  }

  function updateHud() {
    scoreEl.textContent = Math.floor(game.score).toLocaleString('es-AR');
    carrotEl.textContent = game.carrots;
    levelEl.textContent = game.level;
    livesEl.textContent = `${game.timeLeft !== null ? '⏱️ ' + Math.ceil(game.timeLeft) + 's · ' : ''}${'♥'.repeat(Math.max(0, game.lives))}${'♡'.repeat(Math.max(0, (currentMode === 'one_life' ? 1 : 3) - game.lives))}${game.shield ? ' 🛡️' : ''}${game.scoreMultiplier > 1 ? ' ×2' : ''}${game.wingTimer > 0 ? ' 🪽' : ''}${game.mintTimer > 0 ? ' 🌿' : ''}`;
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
    shareButton?.classList.remove('hidden');
    modeStep.classList.add('hidden');
    nicknameStep.classList.add('hidden');

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
          max_combo: maxComboReached,
          duration_ms: duration
        })
      });
      const data = await response.json();
      overlayText.innerHTML = response.ok ? resultStory(data) : escapeHtml(data.error || 'No se pudo guardar el puntaje.');
      if (response.ok && data.personal_best) playSound('record');
      loadLeaderboard();
    } catch (error) {
      overlayText.textContent = 'Terminaste la carrera, pero no pudimos guardar el puntaje.';
    }
  }


  function resultStory(data) {
    const score = Math.floor(game.score).toLocaleString('es-AR');
    const lines = [`Nube volvió con ${game.carrots} zanahorias y ${score} puntos.`];
    if (data.personal_best) lines.push('Nuevo récord personal.');
    if (data.next_rival) lines.push(`Te faltaron ${Number(data.next_rival.points_needed).toLocaleString('es-AR')} puntos para superar a ${escapeHtml(data.next_rival.nickname)}.`);
    if (data.achievements?.length) lines.push(`Insignia desbloqueada: ${data.achievements.map(escapeHtml).join(', ')}.`);
    lines.push(`Puesto #${data.rank} del ranking.`);
    finalShareText = lines.join(' ');
    return lines.map(line => `<span class="result-line">${line}</span>`).join('');
  }

  async function shareResult() {
    const text = finalShareText || `Nube volvió con ${game.carrots} zanahorias y ${Math.floor(game.score).toLocaleString('es-AR')} puntos.`;
    if (navigator.share) {
      await navigator.share({title: 'Mi aventura en Bunny Quest', text, url: window.location.href});
    } else {
      await navigator.clipboard?.writeText(`${text} ${window.location.href}`);
      showToast('Resultado copiado', '#405a36');
    }
  }

  function drawRoundedRect(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function currentBiome() {
    if (game.level >= 15) return 'night';
    if (game.level >= 10) return 'sunset';
    if (game.level >= 5) return 'forest';
    return 'meadow';
  }

  function drawBackground() {
    const biome = currentBiome();
    const palettes = {
      meadow: {sky: ['#f7fbf2', '#edf4df', '#dfeacb'], sun: '#f4c973', hill: '#d1dfba', grass: '#a9c482', trim: '#8eaa67'},
      forest: {sky: ['#dfeeda', '#cfe2c4', '#b9d2a8'], sun: '#eecb76', hill: '#8fb06f', grass: '#6f985b', trim: '#527a45'},
      sunset: {sky: ['#ffe0ad', '#f3a26e', '#8b6179'], sun: '#f6b05d', hill: '#b77b62', grass: '#7e8f57', trim: '#596f43'},
      night: {sky: ['#1c2741', '#26375a', '#3c4d64'], sun: '#f4e9a6', hill: '#34465b', grass: '#314b3e', trim: '#22382f'}
    };
    const palette = currentMode === 'light_grey'
      ? {sky: ['#f4f5f6', '#d8dade', '#b9bdc2'], sun: '#f7f7f7', hill: '#a8adb3', grass: '#565b60', trim: '#181a1d'}
      : palettes[biome];
    const sky = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    sky.addColorStop(0, palette.sky[0]); sky.addColorStop(.72, palette.sky[1]); sky.addColorStop(1, palette.sky[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.fillStyle = palette.sun; ctx.beginPath(); ctx.arc(820, biome === 'sunset' ? 170 : 92, biome === 'night' ? 30 : 42, 0, Math.PI * 2); ctx.fill();
    if (biome !== 'night') for (const cloud of game.clouds) drawCloud(cloud.x, cloud.y, cloud.size);

    if (biome === 'forest' || biome === 'night' || currentMode === 'light_grey') {
      ctx.fillStyle = currentMode === 'light_grey' ? 'rgba(18,20,22,.32)' : (biome === 'night' ? 'rgba(20,35,36,.5)' : 'rgba(67,98,55,.38)');
      for (let x = -40; x < WORLD_W; x += 82) {
        ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x + 34, 190 + Math.sin(x) * 18); ctx.lineTo(x + 72, groundY); ctx.fill();
      }
    }

    ctx.fillStyle = palette.hill;
    ctx.beginPath(); ctx.moveTo(0, 355);
    for (let x = 0; x <= WORLD_W; x += 80) ctx.quadraticCurveTo(x + 40, 300 + Math.sin((x + game.distance * .04) * .01) * 22, x + 80, 355);
    ctx.lineTo(WORLD_W, groundY); ctx.lineTo(0, groundY); ctx.closePath(); ctx.fill();

    ctx.fillStyle = palette.grass; ctx.fillRect(0, groundY, WORLD_W, WORLD_H - groundY);
    ctx.fillStyle = palette.trim; ctx.fillRect(0, groundY, WORLD_W, 8);
    ctx.strokeStyle = currentMode === 'light_grey' ? 'rgba(12,14,16,.28)' : (biome === 'night' ? 'rgba(225,241,166,.22)' : 'rgba(82,105,58,.18)'); ctx.lineWidth = 2;
    const offset = -(game.distance * .8) % 70;
    for (let x = offset; x < WORLD_W; x += 70) { ctx.beginPath(); ctx.moveTo(x, 486); ctx.quadraticCurveTo(x + 24, 470, x + 48, 488); ctx.stroke(); }
    if (biome === 'night') {
      ctx.fillStyle = 'rgba(238,244,142,.8)';
      for (let i = 0; i < 16; i += 1) { const x = (i * 73 + game.distance * .18) % WORLD_W; const y = 210 + Math.sin(game.distance * .01 + i) * 70; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
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

    const colors = bunnyPalette[bunnyColor] || bunnyPalette.snow;
    ctx.fillStyle = colors.fur;
    ctx.strokeStyle = '#66574b';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(18, 15, 10, 27, -.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(40, 13, 10, 29, .15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e9b8ac';
    ctx.beginPath(); ctx.ellipse(18, 14, 4, 18, -.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(40, 12, 4, 19, .15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colors.fur;
    ctx.beginPath(); ctx.ellipse(29, 45, 27, 28, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = colors.shade;
    ctx.beginPath(); ctx.ellipse(29, 67, 28, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#493f38';
    ctx.beginPath(); ctx.arc(20, 41, 3.2, 0, Math.PI * 2); ctx.arc(39, 41, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d98d84';
    ctx.beginPath(); ctx.moveTo(29, 48); ctx.lineTo(24, 52); ctx.lineTo(34, 52); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#66574b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(29, 52); ctx.lineTo(29, 58); ctx.stroke();
    drawAccessory(bunnyAccessory);
    ctx.restore();
  }

  function drawAccessory(accessory) {
    if (accessory === 'scarf') {
      ctx.fillStyle = '#4f7046';
      drawRoundedRect(12, 58, 34, 8, 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(42, 61); ctx.lineTo(55, 74); ctx.lineTo(42, 70); ctx.closePath(); ctx.fill();
    } else if (accessory === 'flower') {
      ctx.fillStyle = '#f4c973';
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath(); ctx.ellipse(12 + Math.cos(i * 1.26) * 5, 22 + Math.sin(i * 1.26) * 5, 4, 6, i, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ed8540'; ctx.beginPath(); ctx.arc(12, 22, 3, 0, Math.PI * 2); ctx.fill();
    } else if (accessory === 'bow') {
      ctx.fillStyle = '#ed8540';
      ctx.beginPath(); ctx.moveTo(22, 24); ctx.lineTo(8, 14); ctx.lineTo(9, 34); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(24, 24); ctx.lineTo(40, 14); ctx.lineTo(39, 34); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b65e2c'; ctx.beginPath(); ctx.arc(24, 24, 4, 0, Math.PI * 2); ctx.fill();
    } else if (accessory === 'clover') {
      ctx.fillStyle = '#5f8f4d';
      [[16,20],[22,20],[19,15],[19,25]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); });
      ctx.strokeStyle = '#5f8f4d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(19, 25); ctx.lineTo(14, 34); ctx.stroke();
    }
  }

  function drawObstacle(o) {
    ctx.save();
    if (o.type === 'log') {
      ctx.fillStyle = '#8a5b3f'; drawRoundedRect(o.x, o.y, o.w, o.h, 14); ctx.fill();
      ctx.fillStyle = '#b9794d'; ctx.beginPath(); ctx.arc(o.x + o.w - 7, o.y + o.h / 2, o.h * .42, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#74482f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x + o.w - 7, o.y + o.h / 2, o.h * .24, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#6f4935'; ctx.beginPath(); ctx.moveTo(o.x + 18, o.y + 4); ctx.lineTo(o.x + 23, o.y + o.h - 4); ctx.stroke();
    } else if (o.type === 'fox') {
      ctx.fillStyle = '#b85f37'; drawRoundedRect(o.x, o.y + 8, o.w - 22, o.h - 8, 20); ctx.fill();
      ctx.beginPath(); ctx.moveTo(o.x + o.w - 28, o.y + 14); ctx.lineTo(o.x + o.w, o.y); ctx.lineTo(o.x + o.w - 6, o.y + 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff1dd'; ctx.beginPath(); ctx.ellipse(o.x + 18, o.y + 30, 18, 9, 0, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === 'puddle') {
      ctx.fillStyle = '#5da7b1'; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.beginPath(); ctx.ellipse(o.x + 28, o.y + 6, 18, 4, -.2, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === 'branch') {
      ctx.strokeStyle = '#76513a'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(o.x, o.y + 16); ctx.lineTo(o.x + o.w, o.y + 7); ctx.stroke();
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(o.x + 55, o.y + 12); ctx.lineTo(o.x + 78, o.y - 12); ctx.stroke();
    } else if (o.type === 'thorns') {
      ctx.fillStyle = '#506f3e';
      for (let x = o.x; x < o.x + o.w; x += 20) { ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x + 10, o.y); ctx.lineTo(x + 20, groundY); ctx.closePath(); ctx.fill(); }
    } else if (o.type === 'owl') {
      ctx.fillStyle = '#6c5a4a'; ctx.beginPath(); ctx.ellipse(o.x + 31, o.y + 24, 25, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8b735f'; ctx.beginPath(); ctx.ellipse(o.x + 10, o.y + 22, 20, 8, -.5, 0, Math.PI * 2); ctx.ellipse(o.x + 52, o.y + 22, 20, 8, .5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f6d76f'; ctx.beginPath(); ctx.arc(o.x + 24, o.y + 18, 4, 0, Math.PI * 2); ctx.arc(o.x + 38, o.y + 18, 4, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#7d8379';
      ctx.beginPath(); ctx.moveTo(o.x + 4, o.y + o.h); ctx.quadraticCurveTo(o.x, o.y + 20, o.x + 18, o.y + 7); ctx.quadraticCurveTo(o.x + o.w * .7, o.y - 7, o.x + o.w, o.y + o.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(o.x + o.w * .45, o.y + 15, 10, 5, -.35, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawCarrot(c) {
    if (c.type && c.type !== 'carrot') return drawPickupIcon(c);
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


  function drawPickupIcon(p) {
    const spec = FOOD_PICKUPS[p.type] || POWERUPS[p.type] || FOOD_PICKUPS.carrot;
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
    ctx.rotate(Math.sin(p.spin) * .14);
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.strokeStyle = spec.color;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, p.w * .55, p.h * .55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = '26px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(spec.icon, 0, 1);
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

  function drawStatusBubbles() {
    const labels = [];
    if (game.shield) labels.push('🛡️ Escudo');
    if (game.scoreMultiplier > 1) labels.push('🥕 ×2 puntos');
    if (game.wingTimer > 0) labels.push('🪽 salto largo');
    if (game.mintTimer > 0) labels.push('🌿 lento');
    if (game.tutorialTimer > 0) labels.push(game.tutorialStep < 2 ? 'Tocá para saltar' : 'Agarrá la zanahoria: el combo sube hasta ×8');
    if (game.toast) labels.push(game.toast.text);
    if (!labels.length) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    drawRoundedRect(24, 34, Math.min(540, 24 + labels.join(' · ').length * 10), 44, 22); ctx.fill();
    ctx.fillStyle = game.toast?.color || '#405a36'; ctx.font = '700 18px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(labels.join(' · '), 42, 62);
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
    drawStatusBubbles();
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
      const response = await fetch(`/api/leaderboard/?mode=${encodeURIComponent(currentMode)}`);
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
  function syncModeSelection() {
    selectedModeName.textContent = modeLabels[currentMode] || currentMode;
    document.body.classList.toggle('light-grey-game', currentMode === 'light_grey');
    draw();
  }

  function showNicknameStep() {
    syncModeSelection();
    modeStep.classList.add('hidden');
    nicknameStep.classList.remove('hidden');
    nicknameInput.focus();
  }

  function showModeStep() {
    nicknameStep.classList.add('hidden');
    modeStep.classList.remove('hidden');
  }

  startButton.addEventListener('click', startGame);
  confirmModeButton?.addEventListener('click', showNicknameStep);
  backToModesButton?.addEventListener('click', showModeStep);
  restartButton.addEventListener('click', () => {
    modeStep.classList.add('hidden');
    nicknameStep.classList.add('hidden');
    startGame();
  });
  shareButton?.addEventListener('click', () => { shareResult().catch(() => {}); });
  function renderSoundButton() {
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
    soundButton.textContent = `Sonido: ${soundEnabled ? 'sí' : 'no'}`;
  }
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem(soundPreferenceKey, String(soundEnabled));
    renderSoundButton();
    if (soundEnabled) beep(700, .06, 'triangle', .025);
  });
  document.querySelectorAll('input[name=challengeMode]').forEach(input => {
    input.addEventListener('change', () => { currentMode = input.value; syncModeSelection(); loadLeaderboard(); });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.running && !game.over) game.paused = true;
  });

  renderSoundButton();
  resizeCanvas();
  reset();
  syncModeSelection();
  loadLeaderboard();
})();

// Modal de guía y ranking.
(() => {
  const modal = document.getElementById('gameInfoModal');
  const openButton = document.querySelector('[data-open-game-modal]');
  const closeButton = document.querySelector('[data-close-game-modal]');
  if (!modal || !openButton || !closeButton) return;

  openButton.addEventListener('click', () => {
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  });

  closeButton.addEventListener('click', () => modal.close());
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
  });
})();

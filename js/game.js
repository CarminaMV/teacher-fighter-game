/* ============================================================
   TEACHER FIGHTER — motor del juego (vanilla JS)
   Pantallas: título -> selección -> batalla, + opciones y récords
   ============================================================ */
'use strict';

/* ---------- Dimensiones lógicas del escenario ---------- */
const LOGW = 1280, LOGH = 853;
let GROUND = 150;          // distancia (px) de los pies al borde inferior (según escenario)
const FLOOR_MIN = 120, FLOOR_MAX = LOGW - 120;

/* ---------- Catálogo de personajes ---------- */
const CHARACTERS = [
  { id:'pollo',      name:'EL POLLO',     speed:1.08, power:1.00 },
  { id:'asombroso',  name:'ASOMBROSO',    speed:1.00, power:1.08 },
  { id:'wonder',     name:'WONDER WOMAN', speed:1.18, power:0.92 },
  { id:'rompemuros', name:'ROMPEMUROS',   speed:0.90, power:1.18 },
  { id:'genio',      name:'EL GENIO',     speed:1.02, power:1.04 },
];

/* ---------- Escenarios de batalla ---------- */
const SCENES = [
  { id:'escena1', name:'ESCUELA', src:'Imagenes/Escena1.png', ground:150 },
  { id:'escena2', name:'MALECÓN', src:'Imagenes/Escena2.jpg', ground:140 },
];

const SPRITE_DIR = 'Imagenes/sprites/';
const TARGET_H = 300;   // alto de dibujo de la pose de reposo (px lógicos)
const ACTIONS = ['idle','walk','punch','kick','crouch','jump','win'];

/* Mapa acción -> nº de pose recortada (ver Imagenes/sprites/<id>/) */
const FRAME_MAP = {
  pollo:      { idle:3, walk:1, punch:4, kick:5, crouch:6, jump:7, win:8 },
  asombroso:  { idle:3, walk:1, punch:4, kick:8, crouch:7, jump:9, win:9 },
  wonder:     { idle:3, walk:1, punch:5, kick:9, crouch:8, jump:10, win:10 },
  rompemuros: { idle:3, walk:1, punch:4, kick:8, crouch:7, jump:9, win:9 },
  genio:      { idle:4, walk:1, punch:3, kick:6, crouch:7, jump:5, win:5 },
};

/* Carga el manifiesto de frames de un personaje y arma char.frames + escala */
async function loadFrames(char){
  const dir = SPRITE_DIR + char.id;
  const list = await fetch(encodeURI(dir + '/frames.json')).then(r => r.json());
  const map = FRAME_MAP[char.id];
  char.frames = {};
  ACTIONS.forEach(act => {
    const fr = list[map[act]];
    char.frames[act] = { src: dir + '/' + fr.file, w: fr.w, h: fr.h };
  });
  char.scale = TARGET_H / char.frames.idle.h;
  // Precargar las imágenes de las poses
  await Promise.all(ACTIONS.map(act => new Promise(res => {
    const img = new Image();
    img.onload = res; img.onerror = res;
    img.src = encodeURI(char.frames[act].src);
  })));
}

/* ---------- Controles por defecto ---------- */
const DEFAULT_BINDS = {
  p1:{ left:'KeyA', right:'KeyD', jump:'KeyW', crouch:'KeyS', punch:'KeyF', kick:'KeyG' },
  p2:{ left:'ArrowLeft', right:'ArrowRight', jump:'ArrowUp', crouch:'ArrowDown', punch:'KeyK', kick:'KeyL' },
};
const ACTION_LABELS = { left:'Izquierda', right:'Derecha', jump:'Saltar', crouch:'Agachar', punch:'Puño', kick:'Patada' };

/* ---------- Estado global ---------- */
const state = {
  mode: 1,              // 1 o 2 jugadores
  pickStage: 'p1',      // a quién le toca elegir en la pantalla de selección
  p1Char: null,
  p2Char: null,
  p1Index: null,
  sceneIndex: 0,        // escenario de batalla elegido
  binds: loadBinds(),
  current: 'title',
};

let battle = null;      // runtime del round en curso
let match = null;       // estado del combate (rounds ganados, etc.)
const NEED_WINS = 2;    // hay que ganar 2 rounds
const MAX_ROUNDS = 3;   // al mejor de 3 (2 rounds ganados)

/* ============================================================
   UTILIDADES
   ============================================================ */
const $  = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function loadBinds(){
  try{
    const raw = JSON.parse(localStorage.getItem('tf_binds'));
    if(raw && raw.p1 && raw.p2) return raw;
  }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_BINDS));
}
function saveBinds(){ try{ localStorage.setItem('tf_binds', JSON.stringify(state.binds)); }catch(e){} }

function loadRecords(){
  try{ return JSON.parse(localStorage.getItem('tf_records')) || []; }catch(e){ return []; }
}
function saveRecord(rec){
  const list = loadRecords();
  list.push(rec);
  try{ localStorage.setItem('tf_records', JSON.stringify(list)); }catch(e){}
}

function keyLabel(code){
  if(!code) return '—';
  if(code.startsWith('Key')) return code.slice(3);
  if(code.startsWith('Digit')) return code.slice(5);
  const map = { ArrowLeft:'←', ArrowRight:'→', ArrowUp:'↑', ArrowDown:'↓', Space:'ESPACIO', Enter:'ENTER', ShiftLeft:'⇧', ShiftRight:'⇧D' };
  return map[code] || code.toUpperCase();
}

/* ============================================================
   ESCALADO DEL ESCENARIO (responsive, con letterbox)
   ============================================================ */
function fitStage(){
  const scale = Math.min(window.innerWidth / LOGW, window.innerHeight / LOGH);
  $('#stage').style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);

/* ============================================================
   GESTIÓN DE PANTALLAS
   ============================================================ */
function showScreen(id){
  $$('.screen').forEach(s => s.classList.remove('is-active'));
  const el = document.getElementById('screen-' + id);
  if(el){
    el.classList.add('is-active');
    const bg = el.dataset.bg;
    if(bg && !el.style.backgroundImage) el.style.backgroundImage = `url("${encodeURI(bg)}")`;
  }
  state.current = id;
  // Música según la pantalla
  if(SFX.isEnabled()){
    SFX.startMusic(id === 'battle' ? 'battle' : 'menu');
  }
}

/* ============================================================
   PRECARGA DE IMÁGENES
   ============================================================ */
function preload(){
  const urls = ['Imagenes/Pantalla1.jpg','Imagenes/Pantalla2.jpg']
    .concat(SCENES.map(s => s.src));
  let left = urls.length;
  return new Promise(resolve => {
    urls.forEach(u => {
      const img = new Image();
      const done = () => { if(--left <= 0) resolve(); };
      img.onload = done; img.onerror = done;
      img.src = encodeURI(u);
    });
    setTimeout(resolve, 6000); // tope de seguridad
  });
}

/* ============================================================
   PANTALLA DE SELECCIÓN
   ============================================================ */
function setMode(m){
  state.mode = m;
  $$('#select-mode .mode-btn').forEach(b => b.classList.toggle('is-active', +b.dataset.mode === m));
  resetSelection();
}
function setScene(i){
  state.sceneIndex = i;
  $$('.scene-btn').forEach(b => b.classList.toggle('is-active', +b.dataset.scene === i));
}

function resetSelection(){
  state.p1Char = null; state.p2Char = null; state.p1Index = null; state.pickStage = 'p1';
  $$('.card-hotspot').forEach(h => h.classList.remove('locked-p1','locked-p2','taken'));
  updateSelectPrompt();
}
function updateSelectPrompt(){
  const p = $('#select-prompt');
  if(state.pickStage === 'p1') p.textContent = 'JUGADOR 1: ELIGE TU LUCHADOR';
  else p.textContent = 'JUGADOR 2: ELIGE (NO EL MISMO)';
}
function pickCharacter(index){
  // En 2 jugadores, el P2 no puede elegir el mismo personaje que el P1
  if(state.pickStage === 'p2' && index === state.p1Index){ SFX.block(); return; }

  const char = CHARACTERS[index];
  const hs = $(`.card-hotspot[data-index="${index}"]`);
  SFX.select();
  if(state.pickStage === 'p1'){
    state.p1Char = char; state.p1Index = index;
    hs.classList.add('locked-p1');
    if(state.mode === 2){
      state.pickStage = 'p2';
      hs.classList.add('taken');          // queda no disponible para el P2
      updateSelectPrompt();
    } else {
      // CPU elige un personaje al azar, pero NUNCA el mismo que el jugador
      const opts = CHARACTERS.filter((c, i) => i !== index);
      state.p2Char = opts[Math.floor(Math.random()*opts.length)];
      startMatch();
    }
  } else {
    state.p2Char = char;
    hs.classList.add('locked-p2');
    startMatch();
  }
}

/* ============================================================
   OPCIONES (remapeo de teclas)
   ============================================================ */
let listeningBind = null; // {player, action, el}

function renderBinds(){
  ['p1','p2'].forEach(pl => {
    const box = $('#binds-' + pl);
    box.querySelectorAll('.bind-row').forEach(r => r.remove());
    Object.keys(ACTION_LABELS).forEach(act => {
      const row = document.createElement('div');
      row.className = 'bind-row';
      row.innerHTML = `<span class="bind-label">${ACTION_LABELS[act]}</span>`;
      const btn = document.createElement('button');
      btn.className = 'bind-key';
      btn.textContent = keyLabel(state.binds[pl][act]);
      btn.addEventListener('click', () => startListening(pl, act, btn));
      row.appendChild(btn);
      box.appendChild(row);
    });
  });
}
function startListening(player, action, el){
  if(listeningBind) listeningBind.el.classList.remove('listening');
  listeningBind = { player, action, el };
  el.classList.add('listening');
  el.textContent = '...';
  $('#bind-hint').textContent = 'Pulsa la tecla que quieras asignar (ESC para cancelar).';
}

/* ============================================================
   RÉCORDS
   ============================================================ */
function renderRecords(){
  const body = $('#records-body');
  const list = loadRecords().slice().sort((a,b)=> a.time - b.time).slice(0,10);
  if(!list.length){ body.innerHTML = '<div class="rec-empty">Aún no hay récords. ¡Gana una pelea!</div>'; return; }
  let html = '<table class="rec-table"><thead><tr><th>#</th><th>Ganador</th><th>Rival</th><th>Tiempo</th><th>Modo</th><th>Fecha</th></tr></thead><tbody>';
  list.forEach((r,i)=>{
    html += `<tr><td>${i+1}</td><td>${r.winner}</td><td>${r.loser||'—'}</td><td>${r.time.toFixed(1)}s</td><td>${r.mode}</td><td>${r.date}</td></tr>`;
  });
  html += '</tbody></table>';
  body.innerHTML = html;
}

/* ============================================================
   BATALLA
   ============================================================ */
function makeFighter(char, side, el){
  const bodyW = char.frames.idle.w * char.scale;   // ancho real de la figura
  el.style.backgroundSize = '100% 100%';
  const f = {
    char, side, el,
    bodyW, curW: bodyW, curH: TARGET_H,
    x: side === 'p1' ? LOGW*0.30 : LOGW*0.70,  // centro horizontal
    yOff: 0,          // altura sobre el suelo (salto)
    vy: 0,
    jumpVX: 0,        // impulso horizontal durante el salto
    facing: side === 'p1' ? 1 : -1,
    hp: 100,
    action: 'idle',
    actionUntil: 0,
    hasHit: false,
    cooldownUntil: 0,
    crouching: false,
    // IA
    ai: side === 'p2' && state.mode === 1,
    aiNext: 0,
  };
  setFrame(f, 'idle');
  return f;
}

function setFrame(f, action){
  const fr = f.char.frames[action] || f.char.frames.idle;
  f.el.style.backgroundImage = `url("${encodeURI(fr.src)}")`;
  f.curW = fr.w * f.char.scale;
  f.curH = fr.h * f.char.scale;
  f.el.style.width  = f.curW + 'px';
  f.el.style.height = f.curH + 'px';
}

function startAttack(f, kind, now){
  if(now < f.cooldownUntil || f.action === 'punch' || f.action === 'kick') return;
  f.action = kind;
  f.hasHit = false;
  SFX.whoosh(kind);
  const dur = kind === 'punch' ? 300 : 380;
  f.actionUntil = now + dur;
  f.cooldownUntil = now + dur + (kind === 'punch' ? 90 : 150);
}

/* Inicia un combate completo (al mejor de 3) */
function startMatch(){
  stopBattle();
  match = { wins:{ p1:0, p2:0 }, round:1, matchTime:0, over:false };
  // Aplicar el escenario elegido
  const scene = SCENES[state.sceneIndex] || SCENES[0];
  GROUND = scene.ground;
  $('#screen-battle').style.backgroundImage = `url("${encodeURI(scene.src)}")`;
  showScreen('battle');
  fitStage();
  $('#hud-name-1').textContent = state.p1Char.name;
  $('#hud-name-2').textContent = state.p2Char.name + (state.mode===1 ? ' (CPU)' : '');
  updatePips();
  startRound();
}

/* Inicia un round dentro del combate */
function startRound(){
  if(battle && battle.raf) cancelAnimationFrame(battle.raf);  // evita bucles duplicados
  const carriedKeys = battle ? battle.keys : {};
  $('#result-overlay').classList.add('hidden');
  $('#pause-overlay').classList.add('hidden');

  const f1 = makeFighter(state.p1Char, 'p1', $('#fighter-1'));
  const f2 = makeFighter(state.p2Char, 'p2', $('#fighter-2'));

  battle = {
    f1, f2,
    keys: carriedKeys,
    last: performance.now(),
    time: 0,
    maxTime: 60,
    over: false,
    paused: false,
    started: false,     // bloqueo hasta que termina "¡PELEA!"
    raf: null,
  };

  const label = (match.round >= MAX_ROUNDS) ? 'ROUND FINAL' : 'ROUND ' + match.round;
  $('#round-label').textContent = label;

  updateHUD();
  render();

  SFX.bell();
  announce(label, 950, () => {
    announce('¡PELEA!', 650, () => { if(battle) battle.started = true; });
  });

  battle.last = performance.now();
  battle.raf = requestAnimationFrame(loop);
}

function updatePips(){
  const paint = (id, n) => {
    $$('#' + id + ' span').forEach((s,i)=> s.classList.toggle('won', i < n));
  };
  paint('pips-1', match.wins.p1);
  paint('pips-2', match.wins.p2);
}

function announce(text, ms, cb){
  const el = $('#announce');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => cb && cb(), 180);
  }, ms);
}

function loop(now){
  if(!battle) return;
  battle.raf = requestAnimationFrame(loop);
  let dt = (now - battle.last) / 1000;
  battle.last = now;
  if(dt > 0.05) dt = 0.05;           // estabiliza saltos de frame

  if(battle.paused || battle.over){ return; }

  if(battle.started){
    battle.time += dt;
    if(battle.time >= battle.maxTime){ timeOver(); return; }
  }

  update(battle.f1, battle.f2, dt, now);
  update(battle.f2, battle.f1, dt, now);
  separate(battle.f1, battle.f2);
  resolveAttacks(battle.f1, battle.f2, now);
  resolveAttacks(battle.f2, battle.f1, now);
  render();
  updateHUD();
}

function playerInput(f, binds){
  const k = battle.keys;
  return {
    left:  !!k[binds.left],
    right: !!k[binds.right],
    jump:  !!k[binds.jump],
    crouch:!!k[binds.crouch],
    punch: !!k[binds.punch],
    kick:  !!k[binds.kick],
  };
}

function aiInput(f, opp, now){
  const dist = opp.x - f.x;
  const adist = Math.abs(dist);
  const inp = { left:false, right:false, jump:false, crouch:false, punch:false, kick:false };
  if(!battle.started) return inp;

  if(now > f.aiNext){
    f.aiMode = Math.random();
    f.aiNext = now + 350 + Math.random()*450;
  }
  const m = f.aiMode ?? 0.5;

  if(adist > 150){
    // acercarse
    if(dist > 0) inp.right = true; else inp.left = true;
    if(m > 0.9) inp.jump = true;
  } else {
    // en rango: atacar o retroceder
    if(m < 0.55){ if(Math.random() < 0.5) inp.punch = true; else inp.kick = true; }
    else if(m < 0.75){ if(dist > 0) inp.left = true; else inp.right = true; } // retroceder
    else if(m < 0.85){ inp.crouch = true; } // bloquear
  }
  return inp;
}

function update(f, opp, dt, now){
  const inp = f.ai ? aiInput(f, opp, now)
                   : playerInput(f, state.binds[f.side]);

  const grounded = f.yOff <= 0.0001;
  const attacking = (f.action === 'punch' || f.action === 'kick');

  // Expira ataque
  if(attacking && now >= f.actionUntil){ f.action = 'idle'; }

  // Mirar hacia el rival (si no está atacando)
  if(!attacking){ f.facing = (opp.x >= f.x) ? 1 : -1; }

  // Bloqueo = agacharse en el suelo
  f.crouching = inp.crouch && grounded && !attacking;

  // Movimiento horizontal
  let moving = false;
  if(grounded && !attacking && !f.crouching){
    const sp = 260 * f.char.speed;
    if(inp.left){  f.x -= sp*dt; moving = true; }
    if(inp.right){ f.x += sp*dt; moving = true; }
  } else if(!grounded){
    // control aéreo leve
    const sp = 150 * f.char.speed;
    if(inp.left)  f.x -= sp*dt;
    if(inp.right) f.x += sp*dt;
  }

  // Salto con impulso direccional (para brincar por encima del rival)
  if(inp.jump && grounded && !attacking && !f.crouching){
    f.vy = 820;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    f.jumpVX = dir * 560;      // adelante/atrás = salto largo; sin dirección = vertical
    SFX.jump();
  }
  f.vy -= 2100 * dt;
  f.yOff += f.vy * dt;
  if(f.yOff > 0) f.x += (f.jumpVX || 0) * dt;    // impulso horizontal del salto
  if(f.yOff <= 0){ f.yOff = 0; f.vy = 0; f.jumpVX = 0; }
  f.x = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, f.x));

  // Ataques (también en el aire: puño/patada al caer)
  if(!attacking){
    if(inp.punch) startAttack(f, 'punch', now);
    else if(inp.kick) startAttack(f, 'kick', now);
  }

  // Elegir frame de animación (si no está en golpe activo)
  if(f.action !== 'punch' && f.action !== 'kick'){
    if(!grounded) f.action = 'jump';
    else if(f.crouching) f.action = 'crouch';
    else if(moving) f.action = 'walk';
    else f.action = 'idle';
  }
}

function bodyBox(f){
  const bw = f.bodyW * 0.70;
  return { left:f.x - bw/2, right:f.x + bw/2, top:0, bottom:f.yOff };
}

function separate(a, b){
  const minGap = (a.bodyW*0.50 + b.bodyW*0.50);
  const d = b.x - a.x;
  const overlap = minGap - Math.abs(d);
  // Si alguno está en el aire no se separan: así se puede brincar por encima
  if(overlap > 0 && a.yOff < 40 && b.yOff < 40){
    const push = overlap/2 * (d >= 0 ? 1 : -1);
    a.x -= push; b.x += push;
    a.x = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, a.x));
    b.x = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, b.x));
  }
}

function resolveAttacks(f, opp, now){
  if(f.action !== 'punch' && f.action !== 'kick') return;
  if(f.hasHit) return;
  // Ventana activa del golpe
  const elapsed = (f.action==='punch'?300:380) - (f.actionUntil - now);
  const activeStart = f.action==='punch' ? 70 : 100;
  const activeEnd   = f.action==='punch' ? 190 : 260;
  if(elapsed < activeStart || elapsed > activeEnd) return;

  const reach = f.action==='punch' ? f.bodyW*0.78 : f.bodyW*0.98;
  const hx = f.x + f.facing * reach;      // punta del golpe
  const ob = bodyBox(opp);
  const vClose = Math.abs(f.yOff - opp.yOff) < 175;
  if(vClose && hx >= ob.left - 14 && hx <= ob.right + 14){
    f.hasHit = true;
    const base = f.action==='punch' ? 8 : 14;
    let dmg = base * f.char.power;
    if(opp.crouching){ dmg *= 0.30; SFX.block(); }   // bloqueo reduce daño
    else { SFX.hit(f.action === 'kick'); }
    opp.hp = Math.max(0, opp.hp - dmg);

    // Retroceso
    const kb = (f.action==='punch'?26:42) * (opp.crouching?0.4:1);
    opp.x += f.facing * kb;
    opp.x = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, opp.x));

    // Flash de daño
    opp.el.classList.add('hurt');
    setTimeout(()=> opp.el && opp.el.classList.remove('hurt'), 160);

    if(opp.hp <= 0) knockout(f, opp);
  }
}

function render(){
  [battle.f1, battle.f2].forEach(f => {
    setFrame(f, f.action);
    const left = f.x - f.curW/2;
    const bottom = GROUND + f.yOff;
    f.el.style.left = left + 'px';
    f.el.style.bottom = bottom + 'px';
    f.el.style.transform = `scaleX(${f.facing})`;
    f.el.classList.toggle('block', f.crouching);
  });
}

function updateHUD(){
  const set = (id, hp) => {
    const el = $(id);
    el.style.width = hp + '%';
    el.classList.toggle('low', hp <= 30);
  };
  set('#hp-1', battle.f1.hp);
  set('#hp-2', battle.f2.hp);
  $('#timer').textContent = Math.max(0, Math.ceil(battle.maxTime - battle.time));
}

function knockout(winnerF, loserF){
  SFX.ko();
  endRound(winnerF, loserF, 'K.O.');
}
function timeOver(){
  const { f1, f2 } = battle;
  if(f1.hp === f2.hp){ endRound(null, null, 'EMPATE'); }
  else if(f1.hp > f2.hp) endRound(f1, f2, 'TIEMPO');
  else endRound(f2, f1, 'TIEMPO');
}

/* Fin de un round: reparte punto y decide si el combate continúa */
function endRound(winnerF, loserF, reason){
  if(battle.over) return;
  battle.over = true;
  match.matchTime += battle.time;

  if(winnerF){
    winnerF.action = 'win';
    setFrame(winnerF, 'win');
    match.wins[winnerF.side]++;
    SFX.roundWin();
  }
  updatePips();

  const p1w = match.wins.p1, p2w = match.wins.p2;
  const matchDone = p1w >= NEED_WINS || p2w >= NEED_WINS || match.round >= MAX_ROUNDS;

  const roundMsg = winnerF
    ? (winnerF.side === 'p1' ? '¡ROUND P1!' : (state.mode===1 ? '¡ROUND CPU!' : '¡ROUND P2!'))
    : 'ROUND EMPATADO';

  announce(roundMsg, 1400, () => {
    if(matchDone) endMatch();
    else { match.round++; startRound(); }
  });
}

/* Fin del combate: muestra resultado y guarda récord */
function endMatch(){
  match.over = true;
  const p1w = match.wins.p1, p2w = match.wins.p2;
  const winnerF = p1w > p2w ? battle.f1 : (p2w > p1w ? battle.f2 : null);
  const loserF  = winnerF ? (winnerF === battle.f1 ? battle.f2 : battle.f1) : null;

  const title = $('#result-title');
  const sub = $('#result-sub');

  if(winnerF){
    title.textContent = 'VICTORIA';
    const who = winnerF.side === 'p1' ? 'JUGADOR 1' : (state.mode===1 ? 'CPU' : 'JUGADOR 2');
    sub.innerHTML = `GANA <b>${winnerF.char.name}</b> (${who})<br>` +
                    `${match.wins.p1} — ${match.wins.p2} · ${match.matchTime.toFixed(1)}s`;
    SFX.win();
    const humanWon = winnerF.side === 'p1' || (winnerF.side === 'p2' && state.mode === 2);
    if(humanWon){
      saveRecord({
        winner: winnerF.char.name,
        loser: loserF ? loserF.char.name : '—',
        time: match.matchTime,
        mode: state.mode === 1 ? '1P' : '2P',
        date: new Date().toLocaleDateString('es-ES'),
      });
    }
  } else {
    title.textContent = 'EMPATE';
    sub.textContent = 'Combate igualado.';
  }
  setTimeout(()=> $('#result-overlay').classList.remove('hidden'), 500);
}

function stopBattle(){
  if(battle && battle.raf) cancelAnimationFrame(battle.raf);
  battle = null;
}

/* ============================================================
   ENTRADA DE TECLADO
   ============================================================ */
window.addEventListener('keydown', e => {
  // Remapeo en opciones
  if(listeningBind){
    e.preventDefault();
    if(e.code !== 'Escape'){
      state.binds[listeningBind.player][listeningBind.action] = e.code;
      saveBinds();
    }
    listeningBind.el.classList.remove('listening');
    renderBinds();
    $('#bind-hint').textContent = 'Pulsa un botón y luego la tecla que quieras asignar.';
    listeningBind = null;
    return;
  }

  if(battle){
    // evita el scroll con flechas/espacio
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    battle.keys[e.code] = true;
    if(e.code === 'Escape') togglePause();
  }
});
window.addEventListener('keyup', e => { if(battle) battle.keys[e.code] = false; });
window.addEventListener('blur', ()=> { if(battle) battle.keys = {}; });

function togglePause(){
  if(!battle || battle.over) return;
  battle.paused = !battle.paused;
  $('#pause-overlay').classList.toggle('hidden', !battle.paused);
  if(!battle.paused){ battle.last = performance.now(); }
}

/* ============================================================
   NAVEGACIÓN / CLICS
   ============================================================ */
function hideOverlays(){
  $('#result-overlay').classList.add('hidden');
  $('#pause-overlay').classList.add('hidden');
}
function goTitle(){ stopBattle(); hideOverlays(); showScreen('title'); fitStage(); }
function goSelect(){ stopBattle(); hideOverlays(); resetSelection(); showScreen('select'); fitStage(); }

document.addEventListener('click', e => {
  // Botón de sonido
  if(e.target.closest('#sound-toggle')){ toggleSound(); return; }

  const btn = e.target.closest('[data-action]');
  const card = e.target.closest('.card-hotspot');
  const modeBtn = e.target.closest('.mode-btn');

  const sceneBtn = e.target.closest('.scene-btn');
  if(sceneBtn){ SFX.click(); setScene(+sceneBtn.dataset.scene); return; }

  if(modeBtn){ SFX.click(); setMode(+modeBtn.dataset.mode); return; }
  if(card){ pickCharacter(+card.dataset.index); return; }
  if(!btn) return;

  SFX.click();
  switch(btn.dataset.action){
    case 'jugar':    goSelect(); break;
    case 'opciones': renderBinds(); showScreen('options'); fitStage(); break;
    case 'records':  renderRecords(); showScreen('records'); fitStage(); break;
    case 'salir':    showScreen('exit'); fitStage(); try{ window.close(); }catch(_){} break;
    case 'to-title': goTitle(); break;
    case 'to-select':goSelect(); break;
    case 'reset-binds': state.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS)); saveBinds(); renderBinds(); break;
    case 'clear-records': if(confirm('¿Borrar todos los récords?')){ localStorage.removeItem('tf_records'); renderRecords(); } break;
    case 'pause':    togglePause(); break;
    case 'resume':   togglePause(); break;
    case 'rematch':  startMatch(); break;
  }
});

function toggleSound(){
  const on = !SFX.isEnabled();
  SFX.setEnabled(on);
  const btn = $('#sound-toggle');
  btn.innerHTML = on ? '&#128266;' : '&#128263;';
  btn.classList.toggle('muted', !on);
  if(on){ SFX.unlock(); SFX.startMusic(state.current === 'battle' ? 'battle' : 'menu'); }
}

/* ============================================================
   ARRANQUE
   ============================================================ */
// El audio del navegador necesita un gesto del usuario para arrancar
function firstGesture(){
  SFX.unlock();
  if(SFX.isEnabled()) SFX.startMusic(state.current === 'battle' ? 'battle' : 'menu');
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
}
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', firstGesture);

(async function init(){
  fitStage();
  renderBinds();
  // Icono inicial del botón de sonido
  const stBtn = $('#sound-toggle');
  stBtn.innerHTML = SFX.isEnabled() ? '&#128266;' : '&#128263;';
  stBtn.classList.toggle('muted', !SFX.isEnabled());
  await preload();
  await Promise.all(CHARACTERS.map(c => loadFrames(c).catch(e => console.error('frames', c.id, e))));
  $('#loading').classList.add('hidden');
  showScreen('title');
  fitStage();
})();

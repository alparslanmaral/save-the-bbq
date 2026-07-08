/* ============================================================
   Save the BBQ — Oyun Motoru
   TFT tarzı board: hazırlık fazında birim dizersin,
   savaş fazında her şey otomatik oynar.
   ============================================================ */

const ROWS = 4;
const COLS = 6;
const BENCH_SIZE = 8;
const SHOP_SIZE = 5;
const TICK = 100; // ms

let G = null;          // aktif run durumu
let META = loadMeta(); // kalıcı veri
let loopHandle = null;
let uidCounter = 1;

/* ---------------- Yardımcılar ---------------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------------- Run kurulumu ---------------- */
function newRun() {
  const w = DB.waves;
  G = {
    phase: 'prep',
    level: 1,
    familyMax: w.familyStartHp + skillBonus(META, 'familyHp'),
    gold: w.startingGold + skillBonus(META, 'startGold'),
    board: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    bench: Array(BENCH_SIZE).fill(null),
    shop: [],
    freeRerolls: 0,
    enemies: [],
    zones: [],
    spawnQueue: [],
    spawnTimer: 0,
    incomeTimer: 0,
    traitTimers: {},
    speed: 1,
    elapsed: 0,
    rpEarned: 0,
    bossRewarded: {},
    startTime: Date.now()
  };
  G.familyHp = G.familyMax;
  META.runs++;
  saveMeta(META);
  rollShop(true);
  showScreen('game');
  enterPrep();
}

function mods() {
  return {
    dmg: 1 + skillBonus(META, 'unitDamage'),
    hp: 1 + skillBonus(META, 'unitHp'),
    incomeSpeed: 1 - skillBonus(META, 'incomeSpeed'),
    sellRate: 0.5 + skillBonus(META, 'sellRate'),
    waveGold: skillBonus(META, 'waveGold')
  };
}

/* ---------------- Picnic Basket (Shop) ---------------- */
function rollShop(free = false) {
  if (!free) {
    if (G.freeRerolls > 0) {
      G.freeRerolls--;
    } else {
      if (G.familyHp <= 1) { toast('Ailenin canı yetmiyor!', 'bad'); return; }
      G.familyHp -= 1; // GDD: sepet yenileme 1 can puanına mal olur
    }
  }
  G.shop = [];
  for (let i = 0; i < SHOP_SIZE; i++) G.shop.push(pick(DB.units));
  renderAll();
}

function buyUnit(slotIdx) {
  if (G.phase !== 'prep') return;
  const def = G.shop[slotIdx];
  if (!def) return;
  if (G.gold < def.cost) { toast('Yeterli doların yok!', 'bad'); return; }
  const benchIdx = G.bench.findIndex(s => s === null);
  if (benchIdx === -1) { toast('Bench dolu!', 'bad'); return; }
  G.gold -= def.cost;
  G.bench[benchIdx] = makeUnit(def);
  G.shop[slotIdx] = null;
  tryMerges();
  renderAll();
}

const STAR_MULT = 2.2; // her yıldız: can ve hasar x2.2

function makeUnit(def, star = 1) {
  const m = mods();
  const starMult = Math.pow(STAR_MULT, star - 1);
  const maxHp = Math.round(def.hp * m.hp * starMult);
  return {
    uid: 'u' + uidCounter++,
    def, hp: maxHp, maxHp,
    star, starMult,
    r: -1, c: -1,
    atkCd: 0, abilityCd: 0,
    stunUntil: 0, disabledUntil: 0
  };
}

/* TFT tarzı birleştirme: aynı birimden aynı yıldızda 3 tane
   toplanırsa bir üst yıldıza birleşir (maks 3 yıldız). */
function tryMerges() {
  let merged = true;
  while (merged) {
    merged = false;
    const all = boardUnits().concat(G.bench.filter(Boolean));
    const groups = {};
    all.forEach(u => {
      if (u.star >= 3) return;
      const key = u.def.id + '_' + u.star;
      (groups[key] = groups[key] || []).push(u);
    });
    for (const group of Object.values(groups)) {
      if (group.length < 3) continue;
      // Board'daki bir kopyanın yerini koru, yoksa bench
      const trio = group.slice(0, 3);
      const keeper = trio.find(u => u.r >= 0) || trio[0];
      const spot = keeper.r >= 0 ? { r: keeper.r, c: keeper.c } : null;
      const star = trio[0].star + 1;
      trio.forEach(u => removeUnit(u));
      const nu = makeUnit(trio[0].def, star);
      if (spot) {
        nu.r = spot.r; nu.c = spot.c;
        G.board[spot.r][spot.c] = nu;
      } else {
        const bi = G.bench.findIndex(s => s === null);
        if (bi !== -1) G.bench[bi] = nu;
        else { nu.r = 0; nu.c = 0; G.board[0][0] = nu; } // güvenlik
      }
      toast(`${nu.def.name} ${'⭐'.repeat(star)} oldu!`, 'good');
      merged = true;
    }
  }
}

function sellUnit(unit) {
  const m = mods();
  const copies = Math.pow(3, unit.star - 1); // 1⭐=1, 2⭐=3, 3⭐=9 kopya
  const price = Math.max(1, Math.floor(unit.def.cost * copies * m.sellRate));
  removeUnit(unit);
  G.gold += price;
  toast(`${unit.def.name} satıldı: +${price}$`);
  renderAll();
}

function removeUnit(unit) {
  const bi = G.bench.findIndex(u => u && u.uid === unit.uid);
  if (bi !== -1) G.bench[bi] = null;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (G.board[r][c] && G.board[r][c].uid === unit.uid) G.board[r][c] = null;
  }
}

function boardUnits() {
  const list = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (G.board[r][c]) list.push(G.board[r][c]);
  }
  return list;
}

/* ---------------- Boost (Trait) sistemi ---------------- */
function activeTraits() {
  const counts = {};
  boardUnits().forEach(u => (u.def.traits || []).forEach(t => counts[t] = (counts[t] || 0) + 1));
  const result = {};
  for (const [id, count] of Object.entries(counts)) {
    const trait = DB.traits[id];
    if (!trait) continue;
    let active = null;
    trait.breakpoints.forEach(bp => { if (count >= bp.count) active = bp; });
    result[id] = { trait, count, active };
  }
  return result;
}

function traitBonus(effect) {
  let bonus = 0;
  for (const info of Object.values(activeTraitsCache)) {
    if (info.trait.effect === effect && info.active) bonus = info.active.bonus || 0;
  }
  return bonus;
}

let activeTraitsCache = {};

/* ---------------- Dalga kurulumu ---------------- */
function currentEpisode() {
  return DB.waves.episodes[Math.floor((G.level - 1) / DB.waves.levelsPerEpisode)] || DB.waves.episodes[DB.waves.episodes.length - 1];
}

function isBossLevel() { return !!DB.waves.bossLevels[String(G.level)]; }

function buildSpawnQueue() {
  const w = DB.waves;
  const queue = [];
  const hpMult = 1 + (G.level - 1) * w.hpScalePerLevel;
  const dmgMult = 1 + (G.level - 1) * w.damageScalePerLevel;

  if (isBossLevel()) {
    const bossDef = findBoss(w.bossLevels[String(G.level)]);
    if (bossDef) queue.push({ kind: 'boss', def: bossDef, hpMult: 1, dmgMult: 1, delay: 1.5 });
    (w.bossEscort[String(G.level)] || []).forEach((id, i) => {
      const def = findEnemy(id);
      if (def) queue.push({ kind: 'enemy', def, hpMult, dmgMult, delay: 3 + i * 2.5 });
    });
  } else {
    const ep = currentEpisode();
    const count = Math.round(ep.countBase + (G.level - 1) * ep.countPerLevel);
    for (let i = 0; i < count; i++) {
      const def = findEnemy(pick(ep.pool));
      if (def) queue.push({ kind: 'enemy', def, hpMult, dmgMult, delay: i * ep.spawnInterval });
    }
  }
  return queue.sort((a, b) => a.delay - b.delay);
}

function spawnEnemy(item) {
  const def = item.def;
  const isBoss = item.kind === 'boss';
  const e = {
    uid: 'e' + uidCounter++,
    def, isBoss,
    hp: Math.round(def.hp * item.hpMult),
    maxHp: Math.round(def.hp * item.hpMult),
    dmg: Math.round(def.damage * item.dmgMult),
    x: COLS + 0.7,
    y: isBoss ? ROWS / 2 : rand(0.4, ROWS - 0.4),
    stunUntil: 0, engagedAt: 0, attackCd: 0,
    slow: 0, haste: 1, dmgMult: 1,
    phaseIdx: -1, abilityTimers: [], phaseName: ''
  };
  if (isBoss) {
    applyBossPhase(e);
    $('#boss-banner').textContent = `⚠ BOSS: ${def.name} — ${e.phaseName}`;
    $('#boss-banner').classList.add('show');
    setTimeout(() => $('#boss-banner').classList.remove('show'), 3000);
  }
  G.enemies.push(e);
}

function applyBossPhase(e) {
  const phases = e.def.phases || [];
  const ratio = e.hp / e.maxHp;
  let idx = phases.length - 1;
  for (let i = 0; i < phases.length; i++) {
    if (ratio > phases[i].until) { idx = i; break; }
  }
  if (idx !== e.phaseIdx) {
    e.phaseIdx = idx;
    const p = phases[idx] || {};
    e.phaseName = p.name || '';
    e.speedMult = p.speedMult || 1;
    e.dodge = p.dodge || 0;
    e.stunImmune = !!p.stunImmune;
    e.abilityTimers = (p.abilities || []).map(a => ({ def: a, t: a.interval * 0.6 }));
    if (e.phaseName) toast(`${e.def.name}: "${e.phaseName}"`, 'boss');
  }
}

/* ---------------- Faz geçişleri ---------------- */
function enterPrep() {
  G.phase = 'prep';
  G.freeRerolls = skillBonus(META, 'freeReroll');
  rollShop(true); // her dalga öncesi sepet ücretsiz yenilenir (GDD 3.3)
  // Boss dalgasına ulaşınca +1 RP (GDD 3.1)
  if (isBossLevel() && !G.bossRewarded['reach' + G.level]) {
    G.bossRewarded['reach' + G.level] = true;
    G.rpEarned += 1; META.rp += 1; saveMeta(META);
    toast('Boss dalgasına ulaştın: +1 RP! 🏅', 'good');
  }
  renderAll();
}

function startWave() {
  if (G.phase !== 'prep') return;
  if (boardUnits().length === 0 && G.bench.some(u => u)) {
    toast('Önce bench\'ten board\'a birim sürükle!', 'bad');
    return;
  }
  G.phase = 'combat';
  G.spawnQueue = buildSpawnQueue();
  G.spawnTimer = 0;
  G.waveTime = 0;
  G.zones = [];
  activeTraitsCache = activeTraits();
  G.traitTimers = {};
  renderAll();
}

function endWave(victory) {
  G.enemies = [];
  G.zones = [];
  if (!victory) { gameOver(false); return; }

  const m = mods();
  let reward = DB.waves.goldPerWave + m.waveGold + traitBonus('income');
  G.gold += reward;
  toast(`Dalga temizlendi! +${reward}$`, 'good');

  if (isBossLevel() && !G.bossRewarded['kill' + G.level]) {
    G.bossRewarded['kill' + G.level] = true;
    G.rpEarned += 2; META.rp += 2; saveMeta(META);
    toast('Boss yenildi: +2 RP! 🏆', 'good');
  }

  if (G.level >= DB.waves.totalLevels) { gameOver(true); return; }
  G.level++;
  enterPrep();
}

function computeScore() {
  const seconds = Math.floor((Date.now() - G.startTime) / 1000);
  const timeBonus = Math.max(0, 5400 - seconds) * 10;
  return G.familyHp * 1000 + timeBonus;
}

function gameOver(won) {
  G.phase = 'over';
  const score = won ? computeScore() : 0;
  if (won) {
    META.wins++;
    if (score > META.bestScore) META.bestScore = score;
  }
  saveMeta(META);
  $('#result-title').textContent = won ? '🎉 BBQ KURTARILDI!' : '💀 Piknik Mahvoldu';
  $('#result-sub').textContent = won
    ? `Skinny Vegan yenildi. Aile huzur içinde mangal yapıyor.`
    : `Dalga ${G.level}'de aile pes etti. Ama RP'lerin seninle kalıyor.`;
  $('#result-stats').innerHTML = `
    <div class="stat"><span>Ulaşılan Dalga</span><b>${G.level} / ${DB.waves.totalLevels}</b></div>
    <div class="stat"><span>Kalan Aile Canı</span><b>${Math.max(0, G.familyHp)}</b></div>
    <div class="stat"><span>Bu Run'da Kazanılan RP</span><b>+${G.rpEarned}</b></div>
    ${won ? `<div class="stat"><span>Skor</span><b>${score.toLocaleString('tr')}</b></div>` : ''}
    <div class="stat"><span>Toplam RP</span><b>${META.rp}</b></div>`;
  $('#result-overlay').classList.add('show');
}

/* ---------------- Savaş döngüsü ---------------- */
function combatTick(dt) {
  G.waveTime += dt;
  G.elapsed += dt;

  // Spawn kuyruğu
  while (G.spawnQueue.length && G.spawnQueue[0].delay <= G.waveTime) {
    spawnEnemy(G.spawnQueue.shift());
  }

  // Pasif gelir (GDD 3.1)
  const m = mods();
  G.incomeTimer += dt;
  const incomeEvery = DB.waves.passiveGold.interval * m.incomeSpeed;
  if (G.incomeTimer >= incomeEvery) {
    G.incomeTimer -= incomeEvery;
    G.gold += DB.waves.passiveGold.amount;
  }

  const units = boardUnits();
  const now = G.elapsed;

  // Aura sıfırlama
  G.enemies.forEach(e => { e.slow = 0; e.haste = 1; e.dmgMult = 1; });

  // Birim auraları
  units.forEach(u => {
    if (u.stunUntil > now || u.disabledUntil > now) return;
    const a = u.def.ability || {};
    const pos = unitPos(u);
    if (a.type === 'slow_aura') {
      G.enemies.forEach(e => { if (dist(pos, e) <= a.radius) e.slow = Math.max(e.slow, a.slow); });
    }
    if (a.type === 'weaken_aura') {
      G.enemies.forEach(e => { if (dist(pos, e) <= a.radius) e.dmgMult = Math.min(e.dmgMult, 1 - a.reduce); });
    }
  });

  // Düşman auraları (hyperactive kid vb.)
  G.enemies.forEach(e => {
    const s = e.def.special || {};
    if (s.type === 'haste_aura') {
      G.enemies.forEach(o => { if (o !== e && dist(e, o) <= s.radius) o.haste = Math.max(o.haste, s.mult); });
    }
  });

  // Trait: Family heal
  const famInfo = activeTraitsCache['family'];
  if (famInfo && famInfo.active) {
    G.traitTimers.family = (G.traitTimers.family || 0) + dt;
    if (G.traitTimers.family >= famInfo.active.interval) {
      G.traitTimers.family = 0;
      units.forEach(u => {
        if ((u.def.traits || []).includes('family')) {
          u.hp = Math.min(u.maxHp, u.hp + famInfo.active.amount);
          flashHeal(u.uid);
        }
      });
    }
  }

  // Birim davranışları
  const atkSpeedBonus = traitBonus('attack_speed');
  const cdReduction = traitBonus('cooldown');
  units.forEach(u => unitAct(u, dt, now, m, atkSpeedBonus, cdReduction));

  // Bölgeler (kola / gaz)
  G.zones = G.zones.filter(z => z.until > now);
  G.zones.forEach(z => {
    if (z.type === 'coke') {
      G.enemies.forEach(e => {
        if (z.cells.some(c => Math.floor(e.x) === c.c && Math.floor(e.y) === c.r)) damageEnemy(e, z.dps * dt, null);
      });
      units.forEach(u => {
        if (z.cells.some(c => u.c === c.c && u.r === c.r)) u.hp = Math.min(u.maxHp, u.hp + z.heal * dt);
      });
    }
    if (z.type === 'gas') {
      G.enemies.forEach(e => { if (dist(z, e) <= z.radius) damageEnemy(e, z.dps * dt, null); });
    }
  });

  // Düşman davranışları
  G.enemies.forEach(e => enemyAct(e, dt, now, units));

  // Ölüleri temizle
  G.enemies = G.enemies.filter(e => e.hp > 0);
  units.forEach(u => { if (u.hp <= 0) killUnit(u, now); });

  // Kaybetme / kazanma kontrolü
  if (G.familyHp <= 0) { endWave(false); return; }
  if (G.enemies.length === 0 && G.spawnQueue.length === 0) { endWave(true); return; }
}

function unitPos(u) { return { x: u.c + 0.5, y: u.r + 0.5 }; }

function unitAct(u, dt, now, m, atkSpeedBonus, cdReduction) {
  if (u.stunUntil > now || u.disabledUntil > now) return;
  const a = u.def.ability || { type: 'none' };
  const isMachine = (u.def.traits || []).includes('machine');
  const isDadlore = (u.def.traits || []).includes('dadlore');
  const speedMult = 1 + (isMachine ? atkSpeedBonus : 0);
  const cdMult = 1 - (isDadlore ? cdReduction : 0);
  const pos = unitPos(u);

  if (a.type === 'shooter') {
    u.atkCd -= dt * speedMult;
    if (u.atkCd <= 0) {
      const target = nearestEnemy(pos, a.range);
      if (target) {
        u.atkCd = a.interval;
        fireProjectile(u, target);
        damageEnemy(target, a.damage * m.dmg * u.starMult, u);
      }
    }
  } else if (a.type === 'chain_zap') {
    u.atkCd -= dt * speedMult;
    if (u.atkCd <= 0) {
      let target = nearestEnemy(pos, a.range);
      if (target) {
        u.atkCd = a.interval;
        const hitList = [target];
        let from = target;
        for (let i = 1; i < a.chains; i++) {
          const next = G.enemies.filter(e => !hitList.includes(e) && dist(from, e) <= 2 && e.hp > 0)
            .sort((x, y) => dist(from, x) - dist(from, y))[0];
          if (!next) break;
          hitList.push(next); from = next;
        }
        hitList.forEach(t => { fireProjectile(u, t, 'zap'); damageEnemy(t, a.damage * m.dmg * u.starMult, u); });
      }
    }
  } else if (a.type === 'stunner') {
    u.abilityCd -= dt;
    if (u.abilityCd <= 0) {
      const target = nearestEnemy(pos, a.range);
      if (target && !(target.stunImmune)) {
        u.abilityCd = a.cooldown * cdMult;
        target.stunUntil = now + a.stun * (1 + 0.3 * (u.star - 1));
        fireProjectile(u, target, 'stun');
        showBadge(target.uid, '😵');
      }
    }
  } else if (a.type === 'splash_random') {
    u.abilityCd -= dt;
    if (u.abilityCd <= 0) {
      u.abilityCd = a.interval * cdMult;
      const cells = [];
      for (let i = 0; i < a.cells; i++) cells.push({ r: randInt(0, ROWS - 1), c: randInt(0, COLS - 1) });
      G.zones.push({ type: 'coke', cells, dps: a.dps * m.dmg * u.starMult, heal: a.heal * u.starMult, until: now + a.duration });
    }
  } else if (a.type === 'income') {
    u.abilityCd -= dt;
    if (u.abilityCd <= 0) { u.abilityCd = a.interval; const amt = a.amount * u.star; G.gold += amt; showBadge(u.uid, '+' + amt + '$'); }
  }
}

function killUnit(u, now) {
  const a = u.def.ability || {};
  const pos = unitPos(u);
  if (a.type === 'gas_on_death') {
    G.zones.push({ type: 'gas', x: pos.x, y: pos.y, radius: a.radius, dps: a.dps * mods().dmg * u.starMult, until: now + a.duration });
    toast(`${u.def.name} patladı! ☣️`);
  }
  if (a.type === 'zap_on_death') {
    const killer = nearestEnemy(pos, 1.5);
    if (killer) { damageEnemy(killer, a.damage * mods().dmg * u.starMult, null); showBadge(killer.uid, '⚡'); }
    toast('"I AM WATCHING THAT!" ⚡');
  }
  removeUnit(u);
}

function nearestEnemy(pos, range) {
  let best = null, bd = Infinity;
  G.enemies.forEach(e => {
    if (e.hp <= 0) return;
    const d = dist(pos, e);
    if (d <= range && d < bd) { bd = d; best = e; }
  });
  return best;
}

function damageEnemy(e, amount, source) {
  const s = e.def.special || {};
  const dodgeChance = (s.type === 'dodge' ? s.chance : 0) + (e.dodge || 0);
  if (dodgeChance > 0 && Math.random() < dodgeChance) { showBadge(e.uid, 'MISS'); return; }
  if (s.type === 'armor') amount *= (1 - s.reduce);
  e.hp -= amount;
  if (e.isBoss) applyBossPhase(e);
}

function enemyAct(e, dt, now, units) {
  if (e.stunUntil > now) return;

  // Boss yetenekleri
  if (e.isBoss) {
    e.abilityTimers.forEach(at => {
      at.t -= dt;
      if (at.t <= 0) {
        at.t = at.def.interval;
        bossAbility(e, at.def, now, units);
      }
    });
  }

  // Şifacı düşmanlar
  const s = e.def.special || {};
  if (s.type === 'healer') {
    e.healT = (e.healT || 0) - dt;
    if (e.healT <= 0) {
      e.healT = s.interval;
      const ally = G.enemies.filter(o => o !== e && o.hp < o.maxHp && dist(e, o) <= s.range)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (ally) { ally.hp = Math.min(ally.maxHp, ally.hp + s.amount); showBadge(ally.uid, '+💚'); }
    }
  }
  if (s.type === 'scream') {
    e.screamT = (e.screamT || 0) - dt;
    if (e.screamT <= 0) {
      e.screamT = s.interval;
      units.forEach(u => { if (dist(e, unitPos(u)) <= s.radius) { u.stunUntil = now + s.stun; showBadge(u.uid, '🎵😵'); } });
    }
  }

  // Hedef: en yakın savunma birimi, yoksa aile (GDD 3.1)
  let target = null, bd = Infinity;
  units.forEach(u => {
    const d = dist(e, unitPos(u));
    if (d < bd) { bd = d; target = u; }
  });

  const speed = e.def.speed * (1 - e.slow) * e.haste * (e.speedMult || 1);

  if (target) {
    const tp = unitPos(target);
    if (bd > 0.55) {
      e.engagedAt = 0;
      const dx = tp.x - e.x, dy = tp.y - e.y, len = Math.hypot(dx, dy) || 1;
      e.x += (dx / len) * speed * dt;
      e.y += (dy / len) * speed * dt;
    } else {
      if (!e.engagedAt) e.engagedAt = now;
      e.attackCd -= dt;
      let interval = e.def.interval;
      if (s.type === 'frenzy' && now - e.engagedAt >= s.after) interval /= s.mult;
      if (e.attackCd <= 0) {
        e.attackCd = interval;
        const armor = ((target.def.traits || []).includes('household')) ? traitBonus('armor') : 0;
        target.hp -= e.dmg * e.dmgMult * (1 - armor);
        flashHit(target.uid);
      }
    }
  } else {
    // Aileye yürü
    if (e.x > -0.4) {
      e.x -= speed * dt;
    } else {
      e.attackCd -= dt;
      if (e.attackCd <= 0) {
        e.attackCd = e.def.interval;
        G.familyHp -= 1;
        // Aile karşılık verir (GDD: aileden az da olsa hasar alır)
        damageEnemy(e, DB.waves.familyThornDamage, null);
        flashFamily();
      }
    }
  }
}

function bossAbility(boss, ab, now, units) {
  if (ab.type === 'flash_disable') {
    const u = pick(units.filter(x => x.hp > 0));
    if (u) {
      u.disabledUntil = now + ab.duration;
      showBadge(u.uid, '📵 CANCELLED');
      toast(`${boss.def.name} bir birimi iptal etti!`, 'boss');
    }
  } else if (ab.type === 'summon') {
    for (let i = 0; i < ab.count; i++) {
      const def = findEnemy(ab.enemy);
      if (def) spawnEnemy({ kind: 'enemy', def, hpMult: 1 + (G.level - 1) * 0.06, dmgMult: 1, delay: 0 });
    }
    toast(`${boss.def.name} destek çağırdı!`, 'boss');
  } else if (ab.type === 'aoe_stun') {
    units.forEach(u => {
      if (dist(boss, unitPos(u)) <= ab.radius) { u.stunUntil = now + ab.stun; showBadge(u.uid, '😵'); }
    });
  }
}

/* ---------------- Ana döngü ---------------- */
function startLoop() {
  if (loopHandle) clearInterval(loopHandle);
  loopHandle = setInterval(() => {
    if (!G || G.phase !== 'combat') { renderHud(); return; }
    const dt = (TICK / 1000) * G.speed;
    combatTick(dt);
    renderCombat();
    renderHud();
  }, TICK);
}

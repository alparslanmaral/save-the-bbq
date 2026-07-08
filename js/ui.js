/* ============================================================
   Save the BBQ — Arayüz Katmanı
   Render, sürükle-bırak, ekranlar, yetenek ağacı.
   ============================================================ */

/* ---------------- Ekranlar ---------------- */
function showScreen(name) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name).classList.add('active');
  if (name === 'menu') renderMenu();
  if (name === 'skilltree') renderSkillTree();
}

function renderMenu() {
  $('#menu-rp').textContent = META.rp;
  $('#menu-best').textContent = META.bestScore > 0 ? META.bestScore.toLocaleString('tr') : '—';
  $('#menu-wins').textContent = META.wins;
}

/* ---------------- Yetenek Ağacı ---------------- */
function renderSkillTree() {
  $('#st-rp').textContent = META.rp;
  const wrap = $('#st-nodes');
  wrap.innerHTML = '';
  DB.skilltree.forEach(node => {
    const rank = META.skills[node.id] || 0;
    const maxed = rank >= node.maxRank;
    const affordable = META.rp >= node.cost;
    const el = document.createElement('div');
    el.className = 'st-node' + (maxed ? ' maxed' : '');
    el.innerHTML = `
      <div class="st-emoji">${node.emoji}</div>
      <div class="st-info">
        <b>${node.name}</b>
        <p>${node.desc}</p>
        <div class="st-pips">${Array.from({ length: node.maxRank }, (_, i) =>
          `<span class="pip ${i < rank ? 'on' : ''}"></span>`).join('')}</div>
      </div>
      <button class="btn small ${maxed ? 'disabled' : affordable ? '' : 'disabled'}">
        ${maxed ? 'MAX' : node.cost + ' RP'}
      </button>`;
    el.querySelector('button').onclick = () => {
      if (maxed || META.rp < node.cost) return;
      META.rp -= node.cost;
      META.skills[node.id] = rank + 1;
      saveMeta(META);
      renderSkillTree();
    };
    wrap.appendChild(el);
  });
}

/* ---------------- HUD ---------------- */
function renderHud() {
  if (!G) return;
  const pct = clamp(G.familyHp / G.familyMax * 100, 0, 100);
  $('#hud-family-fill').style.width = pct + '%';
  $('#hud-family-text').textContent = `${Math.max(0, Math.ceil(G.familyHp))} / ${G.familyMax}`;
  $('#hud-gold').textContent = G.gold;
  $('#hud-rp').textContent = META.rp;
  const ep = currentEpisode();
  $('#hud-wave').textContent = `Dalga ${G.level}/${DB.waves.totalLevels}`;
  $('#hud-episode').textContent = (isBossLevel() ? '👑 BOSS — ' : '') + ep.name;
  $('#btn-speed').textContent = 'x' + G.speed;
}

/* ---------------- Board & varlıklar ---------------- */
function buildBoard() {
  const board = $('#board');
  board.innerHTML = '<div id="entities"></div><div id="zones"></div>';
  board.style.setProperty('--rows', ROWS);
  board.style.setProperty('--cols', COLS);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = document.createElement('div');
    cell.className = 'cell ' + ((r + c) % 2 === 0 ? 'a' : 'b');
    cell.dataset.r = r; cell.dataset.c = c;
    cell.style.gridRow = r + 1; cell.style.gridColumn = c + 1;
    board.appendChild(cell);
  }
}

function entityEl(id) { return document.querySelector(`[data-uid="${id}"]`); }

function posStyle(x, y) {
  return `left:${x / COLS * 100}%; top:${y / ROWS * 100}%;`;
}

function renderEntities() {
  const layer = $('#entities');
  const seen = new Set();

  // Board birimleri
  boardUnits().forEach(u => {
    seen.add(u.uid);
    let el = entityEl(u.uid);
    if (!el) {
      el = document.createElement('div');
      el.className = 'entity unit';
      el.dataset.uid = u.uid;
      el.innerHTML = `<div class="stars">${u.star > 1 ? '⭐'.repeat(u.star) : ''}</div>
        <div class="sprite" style="background:${u.def.color}">${u.def.emoji}</div>
        <div class="hpbar"><i></i></div><div class="badge"></div>`;
      layer.appendChild(el);
      makeDraggable(el, u);
    }
    const p = unitPos(u);
    el.style.cssText += posStyle(p.x, p.y);
    el.querySelector('.hpbar i').style.width = clamp(u.hp / u.maxHp * 100, 0, 100) + '%';
    const now = G.elapsed;
    el.classList.toggle('stunned', u.stunUntil > now || u.disabledUntil > now);
  });

  // Düşmanlar
  G.enemies.forEach(e => {
    seen.add(e.uid);
    let el = entityEl(e.uid);
    if (!el) {
      el = document.createElement('div');
      el.className = 'entity enemy' + (e.isBoss ? ' boss' : '');
      el.dataset.uid = e.uid;
      el.innerHTML = `<div class="sprite" style="background:${e.def.color}">${e.def.emoji}</div>
        <div class="hpbar en"><i></i></div><div class="badge"></div>`;
      layer.appendChild(el);
      el.title = e.def.name;
    }
    el.style.cssText += posStyle(clamp(e.x, -0.5, COLS + 1), e.y);
    el.querySelector('.hpbar i').style.width = clamp(e.hp / e.maxHp * 100, 0, 100) + '%';
    el.classList.toggle('stunned', e.stunUntil > G.elapsed);
  });

  // Kaybolanları sil
  $$('#entities .entity').forEach(el => { if (!seen.has(el.dataset.uid)) el.remove(); });
}

function renderZones() {
  const layer = $('#zones');
  layer.innerHTML = '';
  G.zones.forEach(z => {
    if (z.type === 'coke') {
      z.cells.forEach(c => {
        const d = document.createElement('div');
        d.className = 'zone coke';
        d.style.cssText = `left:${c.c / COLS * 100}%; top:${c.r / ROWS * 100}%; width:${100 / COLS}%; height:${100 / ROWS}%;`;
        layer.appendChild(d);
      });
    } else if (z.type === 'gas') {
      const d = document.createElement('div');
      d.className = 'zone gas';
      const w = z.radius * 2 / COLS * 100, h = z.radius * 2 / ROWS * 100;
      d.style.cssText = `left:${(z.x - z.radius) / COLS * 100}%; top:${(z.y - z.radius) / ROWS * 100}%; width:${w}%; height:${h}%;`;
      layer.appendChild(d);
    }
  });
}

function renderCombat() {
  renderEntities();
  renderZones();
}

/* ---------------- Efektler ---------------- */
function fireProjectile(u, target, kind = 'shot') {
  const layer = $('#entities');
  const p = document.createElement('div');
  p.className = 'projectile ' + kind;
  p.textContent = kind === 'zap' ? '⚡' : kind === 'stun' ? '💬' : u.def.emoji;
  const from = unitPos(u);
  p.style.cssText = posStyle(from.x, from.y);
  layer.appendChild(p);
  requestAnimationFrame(() => { p.style.cssText += posStyle(target.x, target.y); });
  setTimeout(() => p.remove(), 220);
}

function showBadge(uid, text) {
  const el = entityEl(uid);
  if (!el) return;
  const b = el.querySelector('.badge');
  b.textContent = text;
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
}

function flashHit(uid) {
  const el = entityEl(uid);
  if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
}

function flashHeal(uid) {
  const el = entityEl(uid);
  if (el) { el.classList.remove('heal'); void el.offsetWidth; el.classList.add('heal'); }
}

function flashFamily() {
  const el = $('#family-camp');
  el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
}

/* ---------------- Bench & Shop ---------------- */
function renderBench() {
  const wrap = $('#bench');
  wrap.innerHTML = '';
  G.bench.forEach((u, i) => {
    const slot = document.createElement('div');
    slot.className = 'bench-slot';
    slot.dataset.bench = i;
    if (u) {
      const chip = document.createElement('div');
      chip.className = 'unit-chip';
      chip.innerHTML = `<div class="sprite" style="background:${u.def.color}">${u.def.emoji}</div>
        ${u.star > 1 ? `<span class="chip-star">${'⭐'.repeat(u.star)}</span>` : ''}
        <span class="chip-hp">${Math.ceil(u.hp)}</span>`;
      chip.title = `${u.def.name} — ${u.def.desc}`;
      slot.appendChild(chip);
      makeDraggable(chip, u);
    }
    wrap.appendChild(slot);
  });
}

function renderShop() {
  const wrap = $('#shop-cards');
  wrap.innerHTML = '';
  G.shop.forEach((def, i) => {
    const card = document.createElement('div');
    card.className = 'shop-card' + (def ? '' : ' empty');
    if (def) {
      const traits = (def.traits || []).map(t => {
        const tr = DB.traits[t];
        return tr ? `<span class="trait-tag" style="--tc:${tr.color}">${tr.emoji} ${tr.name}</span>` : '';
      }).join('');
      card.innerHTML = `
        <div class="sc-top"><div class="sprite big" style="background:${def.color}">${def.emoji}</div>
        <div class="sc-cost">${def.cost}$</div></div>
        <b class="sc-name">${def.name}</b>
        <div class="sc-traits">${traits}</div>
        <p class="sc-desc">${def.desc}</p>
        <div class="sc-hp">❤️ ${def.hp}</div>`;
      card.onclick = () => buyUnit(i);
    } else {
      card.innerHTML = '<span class="sold">Satıldı</span>';
    }
    wrap.appendChild(card);
  });
  const free = G.freeRerolls > 0;
  $('#btn-reroll').innerHTML = free ? '🔄 Sepeti Yenile <b>(ÜCRETSİZ)</b>' : '🔄 Sepeti Yenile <b>(1 ❤️)</b>';
  $('#btn-reroll').disabled = G.phase !== 'prep';
  $('#btn-start-wave').disabled = G.phase !== 'prep';
  $('#btn-start-wave').textContent = isBossLevel() ? '⚔️ BOSS SAVAŞINI BAŞLAT' : '⚔️ Dalgayı Başlat';
}

/* ---------------- Trait paneli ---------------- */
function renderTraits() {
  const wrap = $('#traits-panel');
  const infos = activeTraits();
  const entries = Object.values(infos).sort((a, b) => b.count - a.count);
  if (entries.length === 0) {
    wrap.innerHTML = '<p class="muted">Board\'a birim koyunca boost\'lar burada görünür.</p>';
    return;
  }
  wrap.innerHTML = entries.map(({ trait, count, active }) => {
    const bps = trait.breakpoints.map(bp =>
      `<span class="bp ${active && active.count === bp.count ? 'on' : count >= bp.count ? 'passed' : ''}">${bp.count}</span>`
    ).join('<i>›</i>');
    return `<div class="trait-row ${active ? 'active' : ''}" style="--tc:${trait.color}" title="${trait.desc}">
      <span class="tr-emoji">${trait.emoji}</span>
      <div class="tr-body">
        <b>${trait.name} <small>(${count})</small></b>
        <div class="tr-bps">${bps}</div>
        <small class="tr-fx">${active ? active.text : trait.breakpoints[0].text + ' için ' + trait.breakpoints[0].count + ' birim gerek'}</small>
      </div>
    </div>`;
  }).join('');
}

function renderLevelBox() {
  const lv = DB.waves.leveling;
  const conf = levelConf();
  const maxLevel = lv.levels[lv.levels.length - 1].level;
  const onBoard = boardUnits().length;
  const cap = unitCap();
  $('#lv-num').textContent = 'Lv ' + G.playerLevel;
  $('#lv-cap').textContent = `Birim ${onBoard}/${cap}`;
  $('#lv-cap').classList.toggle('full', onBoard >= cap);
  const pct = G.playerLevel >= maxLevel ? 100 : clamp(G.xp / conf.xpToNext * 100, 0, 100);
  $('#xp-fill').style.width = pct + '%';
  $('#xp-fill').title = G.playerLevel >= maxLevel ? 'MAX' : `${G.xp}/${conf.xpToNext} XP`;
  const btn = $('#btn-buy-xp');
  btn.textContent = `📈 XP Al (${lv.xpBuyCost}$)`;
  btn.disabled = G.phase !== 'prep' || G.playerLevel >= maxLevel || G.gold < lv.xpBuyCost;
  // Dalga tavanı bilgisi
  const wc = waveCap();
  $('#lv-num').title = conf.cap > wc
    ? `Bu bölümün tavanı: ${wc} birim (dalga ${G.level})`
    : `Sonraki seviyede sınır: ${(lv.levels.find(l => l.level === G.playerLevel + 1) || conf).cap}`;
}

function renderAll() {
  renderHud();
  renderLevelBox();
  renderBench();
  renderShop();
  renderTraits();
  renderEntities();
  renderZones();
  $('#prep-bar').classList.toggle('combat', G.phase === 'combat');
}

/* ---------------- Sürükle & Bırak (Pointer Events) ---------------- */
let drag = null;

function makeDraggable(el, unit) {
  el.addEventListener('pointerdown', ev => {
    if (!G || G.phase !== 'prep') return;
    ev.preventDefault();
    drag = { unit, ghost: null };
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML = `<div class="sprite" style="background:${unit.def.color}">${unit.def.emoji}</div>`;
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    moveGhost(ev);
    $('#sell-zone').classList.add('show');
    $('#sell-zone').textContent = `🗑️ Sat: +${Math.max(1, Math.floor(unit.def.cost * mods().sellRate))}$`;
  });
}

function moveGhost(ev) {
  if (!drag) return;
  drag.ghost.style.left = ev.clientX + 'px';
  drag.ghost.style.top = ev.clientY + 'px';
}

window.addEventListener('pointermove', ev => { if (drag) moveGhost(ev); });

window.addEventListener('pointerup', ev => {
  if (!drag) return;
  const unit = drag.unit;
  drag.ghost.remove();
  $('#sell-zone').classList.remove('show');
  const target = document.elementFromPoint(ev.clientX, ev.clientY);
  drag = null;
  if (!target) { renderAll(); return; }

  const cell = target.closest('.cell');
  const benchSlot = target.closest('.bench-slot');
  const sellZone = target.closest('#sell-zone');

  if (sellZone) { sellUnit(unit); return; }

  if (cell) {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    const occupant = G.board[r][c];
    const fromBoard = unit.r >= 0;
    if (!fromBoard && !occupant && boardUnits().length >= unitCap()) {
      toast(`Birim sınırı: ${unitCap()}! Seviye atla veya birim değiştir.`, 'bad');
      renderAll();
      return;
    }
    if (occupant && occupant.uid !== unit.uid) {
      // Yer değiştir
      if (fromBoard) {
        G.board[unit.r][unit.c] = occupant;
        occupant.r = unit.r; occupant.c = unit.c;
      } else {
        const bi = G.bench.findIndex(u => u && u.uid === unit.uid);
        G.bench[bi] = occupant;
        occupant.r = -1; occupant.c = -1;
      }
    } else if (fromBoard) {
      G.board[unit.r][unit.c] = null;
    } else {
      const bi = G.bench.findIndex(u => u && u.uid === unit.uid);
      if (bi !== -1) G.bench[bi] = null;
    }
    G.board[r][c] = unit;
    unit.r = r; unit.c = c;
    renderAll();
    return;
  }

  if (benchSlot) {
    const bi = +benchSlot.dataset.bench;
    if (!G.bench[bi]) {
      if (unit.r >= 0) { G.board[unit.r][unit.c] = null; unit.r = -1; unit.c = -1; }
      else {
        const old = G.bench.findIndex(u => u && u.uid === unit.uid);
        if (old !== -1) G.bench[old] = null;
      }
      G.bench[bi] = unit;
    }
    renderAll();
    return;
  }
  renderAll();
});

/* ---------------- Başlatma ---------------- */
async function init() {
  await loadDatabase();
  buildBoard();
  startLoop();

  $('#btn-new-run').onclick = () => newRun();
  $('#btn-skilltree').onclick = () => showScreen('skilltree');
  $('#btn-howto').onclick = () => $('#howto-overlay').classList.add('show');
  $('#howto-close').onclick = () => $('#howto-overlay').classList.remove('show');
  $('#st-back').onclick = () => showScreen('menu');
  $('#btn-reroll').onclick = () => rollShop(false);
  $('#btn-buy-xp').onclick = () => buyXP();
  $('#btn-start-wave').onclick = () => startWave();
  $('#btn-speed').onclick = () => { G.speed = G.speed === 1 ? 2 : 1; renderHud(); };
  $('#btn-quit').onclick = () => {
    if (G && G.phase === 'combat') { toast('Savaş sırasında çıkamazsın!', 'bad'); return; }
    showScreen('menu');
  };
  $('#result-menu').onclick = () => { $('#result-overlay').classList.remove('show'); showScreen('menu'); };
  $('#result-again').onclick = () => { $('#result-overlay').classList.remove('show'); newRun(); };

  showScreen('menu');
}

document.addEventListener('DOMContentLoaded', init);

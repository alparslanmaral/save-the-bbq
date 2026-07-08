/* ============================================================
   Save the BBQ — İçerik Editörü
   UI üzerinden birim / düşman / boss / boost ekleme-düzenleme.
   Kod yazmadan yeni içerik ekle: form doldur, kaydet, oyna.
   ============================================================ */

let TAB = 'units';
let SELECTED = null; // seçili kaydın id'si

const ABILITY_TYPES = {
  none:          { label: 'Yeteneksiz (sadece tank)', params: [] },
  shooter:       { label: 'Atıcı (en yakın düşmana mermi)', params: [
    ['damage', 'Hasar', 30], ['interval', 'Atış aralığı (sn)', 1], ['range', 'Menzil (hücre)', 7]] },
  chain_zap:     { label: 'Zincir elektrik', params: [
    ['damage', 'Hasar', 25], ['interval', 'Atış aralığı (sn)', 1.5], ['chains', 'Zıplama sayısı', 3], ['range', 'Menzil', 5]] },
  stunner:       { label: 'Sersemletici (stun)', params: [
    ['stun', 'Stun süresi (sn)', 2], ['cooldown', 'Cooldown (sn)', 6], ['range', 'Menzil', 6]] },
  splash_random: { label: 'Rastgele alan (kola tarzı)', params: [
    ['cells', 'Hücre sayısı', 3], ['interval', 'Tekrar aralığı (sn)', 5], ['dps', 'Hasar/sn', 40], ['heal', 'İyileştirme/sn', 10], ['duration', 'Etki süresi (sn)', 3]] },
  gas_on_death:  { label: 'Ölünce gaz bulutu', params: [
    ['dps', 'Hasar/sn', 10], ['radius', 'Yarıçap (hücre)', 1.2], ['duration', 'Süre (sn)', 6]] },
  zap_on_death:  { label: 'Ölünce yıldırım', params: [['damage', 'Hasar', 100]] },
  slow_aura:     { label: 'Yavaşlatma aurası', params: [['radius', 'Yarıçap', 1.5], ['slow', 'Yavaşlatma (0-1)', 0.35]] },
  weaken_aura:   { label: 'Hasar azaltma aurası', params: [['radius', 'Yarıçap', 2], ['reduce', 'Hasar azaltımı (0-1)', 0.15]] },
  income:        { label: 'Dolar üretici', params: [['amount', 'Dolar', 1], ['interval', 'Aralık (sn)', 6]] }
};

const SPECIAL_TYPES = {
  none:       { label: 'Özel yetenek yok', params: [] },
  dodge:      { label: 'Kaçınma (dodge)', params: [['chance', 'Kaçınma şansı (0-1)', 0.1]] },
  frenzy:     { label: 'Çılgınlık (saldırı hızlanır)', params: [['after', 'Kaç sn sonra', 5], ['mult', 'Hız çarpanı', 10]] },
  haste_aura: { label: 'Hızlandırma aurası (diğer düşmanlara)', params: [['radius', 'Yarıçap', 2], ['mult', 'Hız çarpanı', 1.4]] },
  healer:     { label: 'Şifacı (düşmanları iyileştirir)', params: [['amount', 'İyileştirme', 20], ['interval', 'Aralık (sn)', 2], ['range', 'Menzil', 4]] },
  scream:     { label: 'Çığlık (birimleri stunlar)', params: [['stun', 'Stun (sn)', 1], ['interval', 'Aralık (sn)', 8], ['radius', 'Yarıçap', 1.5]] },
  armor:      { label: 'Zırh (hasar azaltır)', params: [['reduce', 'Hasar azaltımı (0-1)', 0.3]] }
};

const BOSS_ABILITIES = {
  flash_disable: { label: 'Flaş / İptal (bir birimi devre dışı bırakır)', params: [['interval', 'Aralık (sn)', 7], ['duration', 'Süre (sn)', 5]] },
  summon:        { label: 'Minyon çağırma', params: [['enemy', 'Düşman ID', 'zabita'], ['count', 'Adet', 1], ['interval', 'Aralık (sn)', 10]] },
  aoe_stun:      { label: 'Alan stun (çığlık)', params: [['interval', 'Aralık (sn)', 8], ['stun', 'Stun (sn)', 2], ['radius', 'Yarıçap', 2]] }
};

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.querySelector('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

const el = sel => document.querySelector(sel);

/* ---------------- Liste ---------------- */
function currentList() {
  if (TAB === 'units') return DB.units;
  if (TAB === 'enemies') return DB.enemies;
  if (TAB === 'bosses') return DB.bosses;
  if (TAB === 'traits') return Object.entries(DB.traits).map(([id, t]) => ({ id, ...t }));
  return [];
}

function isCustom(id) {
  const c = getCustomDB();
  if (TAB === 'traits') return !!(c.traits && c.traits[id]);
  return (c[TAB] || []).some(x => x.id === id);
}

function isDefault(id) {
  const defaults = TAB === 'traits' ? Object.keys(DB.defaults.traits) : DB.defaults[TAB].map(x => x.id);
  return defaults.includes(id);
}

function renderList() {
  const wrap = el('#ed-list');
  wrap.innerHTML = '';
  currentList().forEach(item => {
    const row = document.createElement('div');
    row.className = 'ed-item' + (SELECTED === item.id ? ' selected' : '');
    row.innerHTML = `<span class="ed-emoji" style="background:${item.color || '#ccc'}">${item.emoji || '❔'}</span>
      <b>${item.name}</b>${isCustom(item.id) ? '<span class="ed-flag">özel</span>' : ''}`;
    row.onclick = () => { SELECTED = item.id; renderList(); renderForm(item); };
    wrap.appendChild(row);
  });
}

/* ---------------- Form parçaları ---------------- */
function fieldHTML(id, label, value, type = 'text', step = 'any') {
  return `<label class="ed-field"><span>${label}</span>
    <input id="${id}" type="${type}" step="${step}" value="${value ?? ''}"></label>`;
}

function paramsHTML(prefix, spec, current) {
  return spec.params.map(([key, label, def]) => {
    const v = current && current[key] !== undefined ? current[key] : def;
    const isText = typeof def === 'string';
    return fieldHTML(`${prefix}-${key}`, label, v, isText ? 'text' : 'number');
  }).join('');
}

function readParams(prefix, spec) {
  const out = {};
  spec.params.forEach(([key, , def]) => {
    const raw = el(`#${prefix}-${key}`).value;
    out[key] = typeof def === 'string' ? raw : parseFloat(raw) || 0;
  });
  return out;
}

function traitCheckboxes(selected) {
  return Object.entries(DB.traits).map(([id, t]) => `
    <label class="ed-check">
      <input type="checkbox" name="trait" value="${id}" ${selected.includes(id) ? 'checked' : ''}>
      ${t.emoji} ${t.name}
    </label>`).join('');
}

/* ---------------- Formlar ---------------- */
function renderForm(item) {
  const panel = el('#ed-form-panel');
  if (TAB === 'units') return renderUnitForm(panel, item);
  if (TAB === 'enemies') return renderEnemyForm(panel, item);
  if (TAB === 'bosses') return renderBossForm(panel, item);
  if (TAB === 'traits') return renderTraitForm(panel, item);
}

function commonHeader(item, kindLabel) {
  return `<div class="ed-form-head">
      <h2>${item ? item.name : 'Yeni ' + kindLabel}</h2>
      ${item && isCustom(item.id) && !isDefault(item.id) ? '<button class="btn small warn" id="f-delete">🗑️ Sil</button>' : ''}
      ${item && isCustom(item.id) && isDefault(item.id) ? '<button class="btn small" id="f-revert">↩️ Varsayılana Dön</button>' : ''}
    </div>
    ${fieldHTML('f-id', 'ID (benzersiz, boşluksuz, ör: super_dede)', item ? item.id : '')}
    ${fieldHTML('f-name', 'İsim', item ? item.name : '')}
    <div class="ed-row">
      ${fieldHTML('f-emoji', 'Sembol (emoji — sonra çizimlerinle değişecek)', item ? item.emoji : '⭐')}
      ${fieldHTML('f-color', 'Renk', item ? item.color : '#E8A33D', 'color')}
    </div>
    ${fieldHTML('f-img', 'Görsel yolu (opsiyonel, ör: img/units/x.png)', item ? (item.img || '') : '')}
    <label class="ed-field"><span>Açıklama</span><textarea id="f-desc">${item ? item.desc : ''}</textarea></label>`;
}

function readCommon() {
  const id = el('#f-id').value.trim().toLowerCase().replace(/\s+/g, '_');
  if (!id) { toast('ID zorunlu!', 'bad'); return null; }
  return {
    id,
    name: el('#f-name').value.trim() || id,
    emoji: el('#f-emoji').value.trim() || '⭐',
    color: el('#f-color').value,
    img: el('#f-img').value.trim() || undefined,
    desc: el('#f-desc').value.trim()
  };
}

function abilityTypeSelector(current, types, elemId) {
  const options = Object.entries(types).map(([k, v]) =>
    `<option value="${k}" ${current === k ? 'selected' : ''}>${v.label}</option>`).join('');
  return `<label class="ed-field"><span>Yetenek Türü</span><select id="${elemId}">${options}</select></label>
    <div id="${elemId}-params" class="ed-params"></div>`;
}

function bindAbilityParams(elemId, types, current) {
  const sel = el('#' + elemId);
  const render = () => {
    const spec = types[sel.value];
    el(`#${elemId}-params`).innerHTML = paramsHTML(elemId, spec, current && current.type === sel.value ? current : null);
  };
  sel.onchange = render;
  render();
}

/* --- Savunma birimi formu --- */
function renderUnitForm(panel, item) {
  panel.innerHTML = `
    ${commonHeader(item, 'Savunma Birimi')}
    <div class="ed-row">
      ${fieldHTML('f-hp', 'Can (HP)', item ? item.hp : 500, 'number')}
      ${fieldHTML('f-cost', 'Fiyat ($)', item ? item.cost : 2, 'number')}
    </div>
    <div class="ed-field"><span>Boost'lar</span><div class="ed-checks">${traitCheckboxes(item ? item.traits || [] : [])}</div></div>
    ${abilityTypeSelector(item && item.ability ? item.ability.type : 'shooter', ABILITY_TYPES, 'f-ab')}
    <button class="btn primary" id="f-save">💾 Kaydet</button>`;
  bindAbilityParams('f-ab', ABILITY_TYPES, item ? item.ability : null);
  bindCommonButtons(item);

  el('#f-save').onclick = () => {
    const base = readCommon();
    if (!base) return;
    const abType = el('#f-ab').value;
    const record = {
      ...base,
      hp: parseInt(el('#f-hp').value) || 100,
      cost: parseInt(el('#f-cost').value) || 1,
      traits: [...document.querySelectorAll('input[name=trait]:checked')].map(c => c.value),
      ability: { type: abType, ...readParams('f-ab', ABILITY_TYPES[abType]) }
    };
    saveRecord('units', record);
  };
}

/* --- Düşman formu --- */
function renderEnemyForm(panel, item) {
  panel.innerHTML = `
    ${commonHeader(item, 'Düşman')}
    <div class="ed-row">
      ${fieldHTML('f-hp', 'Can (HP)', item ? item.hp : 300, 'number')}
      ${fieldHTML('f-speed', 'Hız (hücre/sn)', item ? item.speed : 1)}
    </div>
    <div class="ed-row">
      ${fieldHTML('f-dmg', 'Hasar', item ? item.damage : 15, 'number')}
      ${fieldHTML('f-int', 'Saldırı aralığı (sn)', item ? item.interval : 1)}
    </div>
    ${abilityTypeSelector(item && item.special ? item.special.type : 'none', SPECIAL_TYPES, 'f-sp')}
    <button class="btn primary" id="f-save">💾 Kaydet</button>`;
  bindAbilityParams('f-sp', SPECIAL_TYPES, item ? item.special : null);
  bindCommonButtons(item);

  el('#f-save').onclick = () => {
    const base = readCommon();
    if (!base) return;
    const spType = el('#f-sp').value;
    const record = {
      ...base,
      hp: parseInt(el('#f-hp').value) || 100,
      speed: parseFloat(el('#f-speed').value) || 1,
      damage: parseInt(el('#f-dmg').value) || 10,
      interval: parseFloat(el('#f-int').value) || 1,
      special: { type: spType, ...readParams('f-sp', SPECIAL_TYPES[spType]) }
    };
    saveRecord('enemies', record);
  };
}

/* --- Boss formu --- */
function renderBossForm(panel, item) {
  const phases = item && item.phases ? item.phases : [
    { name: 'Faz 1', until: 0.5, speedMult: 1, abilities: [] },
    { name: 'Faz 2', until: 0, speedMult: 1.5, abilities: [] }
  ];
  panel.innerHTML = `
    ${commonHeader(item, 'Boss')}
    <div class="ed-row">
      ${fieldHTML('f-hp', 'Can (HP)', item ? item.hp : 10000, 'number')}
      ${fieldHTML('f-level', 'Hangi dalgada (10/20/30/40/50)', item ? item.level : 10, 'number')}
    </div>
    <div class="ed-row">
      ${fieldHTML('f-speed', 'Hız', item ? item.speed : 0.4)}
      ${fieldHTML('f-dmg', 'Hasar', item ? item.damage : 40, 'number')}
      ${fieldHTML('f-int', 'Saldırı aralığı (sn)', item ? item.interval : 1)}
    </div>
    <h3 class="ed-subtitle">Fazlar</h3>
    <p class="muted small">"Şu can oranına kadar" alanı fazın bittiği HP yüzdesidir (0.8 = %80). Son faz 0 olmalı.</p>
    <div id="f-phases"></div>
    <button class="btn small" id="f-add-phase">＋ Faz Ekle</button>
    <br><br>
    <button class="btn primary" id="f-save">💾 Kaydet</button>`;
  bindCommonButtons(item);

  let phaseData = JSON.parse(JSON.stringify(phases));

  function renderPhases() {
    el('#f-phases').innerHTML = phaseData.map((p, i) => `
      <div class="ed-phase">
        <div class="ed-phase-head"><b>Faz ${i + 1}</b>
          <button class="btn small warn" data-delphase="${i}">Sil</button></div>
        <div class="ed-row">
          ${fieldHTML(`ph-${i}-name`, 'Faz adı', p.name)}
          ${fieldHTML(`ph-${i}-until`, 'Şu can oranına kadar', p.until)}
        </div>
        <div class="ed-row">
          ${fieldHTML(`ph-${i}-speed`, 'Hız çarpanı', p.speedMult || 1)}
          ${fieldHTML(`ph-${i}-dodge`, 'Dodge (0-1)', p.dodge || 0)}
        </div>
        <label class="ed-check"><input type="checkbox" id="ph-${i}-immune" ${p.stunImmune ? 'checked' : ''}> Stun bağışıklığı</label>
        <div class="ed-abilities">
          <b class="small">Faz yetenekleri:</b>
          ${(p.abilities || []).map((a, j) => `
            <div class="ed-ability-row">
              <span>${BOSS_ABILITIES[a.type] ? BOSS_ABILITIES[a.type].label : a.type}
              (${Object.entries(a).filter(([k]) => k !== 'type').map(([k, v]) => k + ':' + v).join(', ')})</span>
              <button class="btn small warn" data-delab="${i}-${j}">✕</button>
            </div>`).join('')}
          <div class="ed-add-ability">
            <select id="ph-${i}-newab">${Object.entries(BOSS_ABILITIES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>
            <button class="btn small" data-addab="${i}">＋ Yetenek</button>
          </div>
        </div>
      </div>`).join('');

    document.querySelectorAll('[data-delphase]').forEach(b => b.onclick = () => {
      syncPhases(); phaseData.splice(+b.dataset.delphase, 1); renderPhases();
    });
    document.querySelectorAll('[data-delab]').forEach(b => b.onclick = () => {
      syncPhases();
      const [pi, ai] = b.dataset.delab.split('-').map(Number);
      phaseData[pi].abilities.splice(ai, 1); renderPhases();
    });
    document.querySelectorAll('[data-addab]').forEach(b => b.onclick = () => {
      syncPhases();
      const pi = +b.dataset.addab;
      const type = el(`#ph-${pi}-newab`).value;
      const spec = BOSS_ABILITIES[type];
      const ab = { type };
      spec.params.forEach(([k, , def]) => ab[k] = def);
      phaseData[pi].abilities = phaseData[pi].abilities || [];
      phaseData[pi].abilities.push(ab);
      renderPhases();
    });
  }

  function syncPhases() {
    phaseData.forEach((p, i) => {
      p.name = el(`#ph-${i}-name`).value;
      p.until = parseFloat(el(`#ph-${i}-until`).value) || 0;
      p.speedMult = parseFloat(el(`#ph-${i}-speed`).value) || 1;
      p.dodge = parseFloat(el(`#ph-${i}-dodge`).value) || 0;
      p.stunImmune = el(`#ph-${i}-immune`).checked;
    });
  }

  renderPhases();
  el('#f-add-phase').onclick = () => {
    syncPhases();
    phaseData.push({ name: 'Yeni Faz', until: 0, speedMult: 1, abilities: [] });
    renderPhases();
  };

  el('#f-save').onclick = () => {
    const base = readCommon();
    if (!base) return;
    syncPhases();
    const record = {
      ...base,
      hp: parseInt(el('#f-hp').value) || 5000,
      level: parseInt(el('#f-level').value) || 10,
      speed: parseFloat(el('#f-speed').value) || 0.4,
      damage: parseInt(el('#f-dmg').value) || 40,
      interval: parseFloat(el('#f-int').value) || 1,
      phases: phaseData
    };
    saveRecord('bosses', record);
  };
}

/* --- Boost (trait) formu --- */
function renderTraitForm(panel, item) {
  const bps = item ? item.breakpoints : [{ count: 2, text: '' }];
  panel.innerHTML = `
    ${commonHeader(item, 'Boost')}
    <label class="ed-field"><span>Etki türü</span>
      <select id="f-effect">
        ${['heal', 'attack_speed', 'income', 'armor', 'cooldown'].map(e =>
          `<option value="${e}" ${item && item.effect === e ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
    </label>
    <h3 class="ed-subtitle">Eşikler (breakpoint)</h3>
    <p class="muted small">heal: interval+amount alanlarını, diğerleri: bonus alanını kullanır.</p>
    <div id="f-bps">${bps.map((bp, i) => bpRow(bp, i)).join('')}</div>
    <button class="btn small" id="f-add-bp">＋ Eşik Ekle</button>
    <br><br>
    <button class="btn primary" id="f-save">💾 Kaydet</button>`;
  bindCommonButtons(item);

  function bpRow(bp, i) {
    return `<div class="ed-phase" data-bp="${i}">
      <div class="ed-row">
        ${fieldHTML(`bp-${i}-count`, 'Birim sayısı', bp.count, 'number')}
        ${fieldHTML(`bp-${i}-bonus`, 'Bonus (0-1 veya $)', bp.bonus ?? '')}
      </div>
      <div class="ed-row">
        ${fieldHTML(`bp-${i}-interval`, 'Aralık sn (heal için)', bp.interval ?? '')}
        ${fieldHTML(`bp-${i}-amount`, 'Miktar (heal için)', bp.amount ?? '')}
      </div>
      ${fieldHTML(`bp-${i}-text`, 'Açıklama metni', bp.text || '')}
    </div>`;
  }

  el('#f-add-bp').onclick = () => {
    const wrap = el('#f-bps');
    const i = wrap.children.length;
    wrap.insertAdjacentHTML('beforeend', bpRow({ count: i + 2, text: '' }, i));
  };

  el('#f-save').onclick = () => {
    const base = readCommon();
    if (!base) return;
    const breakpoints = [...el('#f-bps').children].map((row, i) => {
      const num = k => { const v = parseFloat(el(`#bp-${i}-${k}`).value); return isNaN(v) ? undefined : v; };
      return {
        count: parseInt(el(`#bp-${i}-count`).value) || 1,
        bonus: num('bonus'),
        interval: num('interval'),
        amount: num('amount'),
        text: el(`#bp-${i}-text`).value
      };
    }).sort((a, b) => a.count - b.count);
    const record = { name: base.name, emoji: base.emoji, color: base.color, desc: base.desc, effect: el('#f-effect').value, breakpoints };
    const custom = getCustomDB();
    custom.traits = custom.traits || {};
    custom.traits[base.id] = record;
    saveCustomDB(custom);
    reload(base.id, 'Boost kaydedildi ✅');
  };
}

/* ---------------- Kaydet / sil / geri al ---------------- */
function saveRecord(listName, record) {
  const custom = getCustomDB();
  custom[listName] = custom[listName] || [];
  const idx = custom[listName].findIndex(x => x.id === record.id);
  if (idx !== -1) custom[listName][idx] = record;
  else custom[listName].push(record);
  custom.deleted = (custom.deleted || []).filter(id => id !== record.id);
  saveCustomDB(custom);
  reload(record.id, record.name + ' kaydedildi ✅');
}

function bindCommonButtons(item) {
  const del = el('#f-delete');
  if (del) del.onclick = () => {
    if (!confirm(item.name + ' silinsin mi?')) return;
    const custom = getCustomDB();
    custom[TAB] = (custom[TAB] || []).filter(x => x.id !== item.id);
    custom.deleted = custom.deleted || [];
    custom.deleted.push(item.id);
    saveCustomDB(custom);
    SELECTED = null;
    reload(null, 'Silindi');
  };
  const rev = el('#f-revert');
  if (rev) rev.onclick = () => {
    const custom = getCustomDB();
    if (TAB === 'traits') { delete custom.traits[item.id]; }
    else custom[TAB] = (custom[TAB] || []).filter(x => x.id !== item.id);
    saveCustomDB(custom);
    reload(item.id, 'Varsayılana döndü');
  };
}

async function reload(selectId, msg) {
  await loadDatabase();
  SELECTED = selectId;
  renderList();
  if (selectId) {
    const item = currentList().find(x => x.id === selectId);
    if (item) renderForm(item);
  } else {
    el('#ed-form-panel').innerHTML = '<p class="muted">Soldan bir kayıt seç veya yeni ekle.</p>';
  }
  if (msg) toast(msg, 'good');
}

/* ---------------- Dışa / içe aktar ---------------- */
function download(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function exportAll() {
  download('units.json', DB.units);
  download('enemies.json', DB.enemies);
  download('bosses.json', DB.bosses);
  download('traits.json', DB.traits);
  toast('4 JSON dosyası indirildi. data/ klasörüne koy, commit\'le, yayında! 🚀', 'good');
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const custom = getCustomDB();
      if (Array.isArray(data)) {
        // Tahmin: içeriğe göre hangi liste olduğunu bul
        const target = data[0] && data[0].phases ? 'bosses' : data[0] && data[0].speed !== undefined ? 'enemies' : 'units';
        custom[target] = data;
        toast(`${target} olarak içe aktarıldı`, 'good');
      } else {
        custom.traits = data;
        toast('Boost\'lar içe aktarıldı', 'good');
      }
      saveCustomDB(custom);
      reload(null);
    } catch (e) {
      toast('Geçersiz JSON dosyası', 'bad');
    }
  };
  reader.readAsText(file);
}

/* ---------------- Başlat ---------------- */
async function initEditor() {
  await loadDatabase();
  renderList();

  document.querySelectorAll('.ed-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.ed-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      TAB = tab.dataset.tab;
      SELECTED = null;
      renderList();
      el('#ed-form-panel').innerHTML = '<p class="muted">Soldan bir kayıt seç veya yeni ekle.</p>';
    };
  });

  el('#btn-new').onclick = () => { SELECTED = null; renderList(); renderForm(null); };
  el('#btn-export').onclick = exportAll;
  el('#btn-import').onclick = () => el('#import-file').click();
  el('#import-file').onchange = e => { if (e.target.files[0]) importFile(e.target.files[0]); };
  el('#btn-reset').onclick = () => {
    if (!confirm('Tüm özel içerik silinsin ve varsayılanlara dönülsün mü?')) return;
    localStorage.removeItem(CUSTOM_DB_KEY);
    reload(null, 'Varsayılanlara dönüldü');
  };
}

document.addEventListener('DOMContentLoaded', initEditor);

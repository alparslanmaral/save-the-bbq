/* ============================================================
   Save the BBQ — Database Layer
   JSON dosyalarını yükler, editör panelinden gelen özel
   içerikle (localStorage) birleştirir.
   ============================================================ */

const DB = {
  units: [],
  enemies: [],
  bosses: [],
  traits: {},
  waves: null,
  skilltree: [],
  ready: false
};

const CUSTOM_DB_KEY = 'stbbq_customdb_v1';
const META_KEY = 'stbbq_meta_v1';

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('Yüklenemedi: ' + path);
  return res.json();
}

function getCustomDB() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_DB_KEY)) || { units: [], enemies: [], bosses: [], traits: {}, deleted: [] };
  } catch (e) {
    return { units: [], enemies: [], bosses: [], traits: {}, deleted: [] };
  }
}

function saveCustomDB(custom) {
  localStorage.setItem(CUSTOM_DB_KEY, JSON.stringify(custom));
}

/* Varsayılan listeyle özel listeyi birleştirir:
   - Aynı id varsa özel olan varsayılanı ezer (düzenleme)
   - Yeni id ise listeye eklenir
   - deleted listesindeki id'ler gizlenir */
function mergeList(defaults, customs, deleted) {
  const map = new Map();
  defaults.forEach(d => map.set(d.id, d));
  (customs || []).forEach(c => map.set(c.id, c));
  (deleted || []).forEach(id => map.delete(id));
  return [...map.values()];
}

async function loadDatabase() {
  const [units, enemies, bosses, traits, waves, skilltree] = await Promise.all([
    loadJSON('data/units.json'),
    loadJSON('data/enemies.json'),
    loadJSON('data/bosses.json'),
    loadJSON('data/traits.json'),
    loadJSON('data/waves.json'),
    loadJSON('data/skilltree.json')
  ]);

  const custom = getCustomDB();
  DB.units = mergeList(units, custom.units, custom.deleted);
  DB.enemies = mergeList(enemies, custom.enemies, custom.deleted);
  DB.bosses = mergeList(bosses, custom.bosses, custom.deleted);
  DB.traits = Object.assign({}, traits, custom.traits || {});
  DB.waves = waves;
  DB.skilltree = skilltree;
  DB.defaults = { units, enemies, bosses, traits };
  DB.ready = true;
  return DB;
}

/* ---------- Kalıcı oyuncu verisi (RP, yetenek ağacı, skor) ---------- */
function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY));
    if (m) return m;
  } catch (e) { /* bozuksa sıfırla */ }
  return { rp: 0, skills: {}, bestScore: 0, runs: 0, wins: 0 };
}

function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function skillBonus(meta, type) {
  let total = 0;
  DB.skilltree.forEach(node => {
    const rank = meta.skills[node.id] || 0;
    if (rank > 0 && node.effect.type === type) total += node.effect.value * rank;
  });
  return total;
}

function findUnit(id) { return DB.units.find(u => u.id === id); }
function findEnemy(id) { return DB.enemies.find(e => e.id === id); }
function findBoss(id) { return DB.bosses.find(b => b.id === id); }

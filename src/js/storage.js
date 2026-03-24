const DB_KEY = "parking_db_v01";

function ensureConfigDefaults(cfg = {}) {
  return {
    vagasTotais: Number(cfg.vagasTotais ?? 20),
    toleranciaMin: Number(cfg.toleranciaMin ?? 10),
    valorPrimeiraHora: Number(cfg.valorPrimeiraHora ?? 5),
    valorHoraExtra: Number(cfg.valorHoraExtra ?? 2),
    diariaMax: Number(cfg.diariaMax ?? 0)
  };
}

const defaultDB = {
  config: ensureConfigDefaults(),
  mensalistas: [],
  estacionados: [],
  historico: []
};

function loadDB() {
  const raw = localStorage.getItem(DB_KEY);

  if (!raw) {
    localStorage.setItem(DB_KEY, JSON.stringify(defaultDB));
    return structuredClone(defaultDB);
  }

  try {
    const db = JSON.parse(raw);

    db.config = ensureConfigDefaults(db.config);
    db.mensalistas = Array.isArray(db.mensalistas) ? db.mensalistas : [];
    db.estacionados = Array.isArray(db.estacionados) ? db.estacionados : [];
    db.historico = Array.isArray(db.historico) ? db.historico : [];

    return db;
  } catch {
    localStorage.setItem(DB_KEY, JSON.stringify(defaultDB));
    return structuredClone(defaultDB);
  }
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

export const Storage = {
  getAll() {
    return loadDB();
  },

  setConfig(partial) {
    const db = loadDB();
    db.config = ensureConfigDefaults({ ...db.config, ...partial });
    saveDB(db);
  },

  updateConfig(newConfig) {
    const db = loadDB();
    db.config = ensureConfigDefaults(newConfig);
    saveDB(db);
  },

  // Mensalistas
  listMensalistas() {
    return loadDB().mensalistas;
  },

  upsertMensalista(m) {
    const db = loadDB();
    const idx = db.mensalistas.findIndex(x => x.placa === m.placa);

    if (idx >= 0) db.mensalistas[idx] = { ...db.mensalistas[idx], ...m };
    else db.mensalistas.push(m);

    saveDB(db);
  },

  toggleMensalista(placa) {
    const db = loadDB();
    const m = db.mensalistas.find(x => x.placa === placa);
    if (m) m.ativo = !m.ativo;
    saveDB(db);
  },

  // Estacionados
  listEstacionados() {
    return loadDB().estacionados;
  },

  addEstacionado(v) {
    const db = loadDB();
    db.estacionados.push(v);
    saveDB(db);
  },

  removeEstacionado(placa) {
    const db = loadDB();
    db.estacionados = db.estacionados.filter(x => x.placa !== placa);
    saveDB(db);
  },

  // Histórico
  listHistorico() {
    return loadDB().historico;
  },

  addHistorico(item) {
    const db = loadDB();
    db.historico.unshift(item);
    saveDB(db);
  },

  // util
  reset() {
    localStorage.setItem(DB_KEY, JSON.stringify(defaultDB));
  }
};

export { ensureConfigDefaults };
import { Storage } from "./storage.js";
import { showToast } from "./toast.js";
import { normalizePlaca, isPlacaValida, formatPlaca } from "./validators.js";
import { $, pad2, fmtDateTimeBR, fmtMoney, fmtTempo } from "./helpers.js";

function setFieldError(fieldId, msgElId, message){
  const field = document.getElementById(fieldId);
  const msg = document.getElementById(msgElId);
  if (!field || !msg) return;

  if (message) {
    field.classList.add("invalid");
    msg.textContent = message;
  } else {
    field.classList.remove("invalid");
    msg.textContent = "";
  }
}


let pendingExit = null;
function openModal(isento = false){
  const b = document.getElementById("modalBackdrop");
  if (!b) return;

  const modal = b.querySelector(".modal");
  if (modal) modal.classList.toggle("isento", isento);

  b.hidden = false;
}

function closeModal(){
  const b = document.getElementById("modalBackdrop");
  if (b) b.hidden = true;
  pendingExit = null;
  document.activeElement?.blur?.();
}



const pagesMeta = {
  dashboard: { title: "Dashboard", subtitle: "Visão geral do estacionamento" },
  entrada: { title: "Entrada / Saída", subtitle: "Registrar entrada, localizar e finalizar saída" },
  mensalistas: { title: "Mensalistas", subtitle: "Cadastro e gerenciamento de mensalistas" },
  historico: { title: "Histórico", subtitle: "Movimentações finalizadas e filtros" },
  config: { title: "Configurações", subtitle: "Vagas e regras de preço" }
};

function bindModalEventsOnce(){
  const backdrop = document.getElementById("modalBackdrop");
  const closeBtn = document.getElementById("btnModalClose");
  const cancelBtn = document.getElementById("btnModalCancel");
  const confirmBtn = document.getElementById("btnModalConfirm");

  if (!backdrop || !closeBtn || !cancelBtn || !confirmBtn) return;
  if (confirmBtn.dataset.bound === "1") return;

  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.hidden) closeModal();
  });

  // ✅ Confirmar saída
  confirmBtn.addEventListener("click", () => {
    if (!pendingExit) {
      showToast("error", "Erro", "Nada para finalizar. Selecione um veículo novamente.");
      return;
      

    }
    doFinalizeExit(pendingExit);
    pendingExit = null;
    closeModal();
  });

  confirmBtn.dataset.bound = "1"; // ✅ dentro da função
}

function fillExitModal(data){
  const elPlaca = document.getElementById("mPlaca");
if (!elPlaca) {
  showToast("error", "Erro", "Modal não encontrado no index.html (IDs do modal ausentes).");
  return;
}

  if (!data) {
    showToast("error", "Erro", "Nenhum veículo preparado para saída. Selecione novamente na tabela.");
    return;
  }

  const isento = (data.valor || 0) <= 0;

  document.getElementById("mPlaca").textContent = data.placa;
  document.getElementById("mTipo").textContent = data.tipo;
  document.getElementById("mEntrada").textContent = fmtDateTimeBR(data.entradaISO);
  document.getElementById("mSaida").textContent = fmtDateTimeBR(data.saidaISO);
  document.getElementById("mTempo").textContent = fmtTempo(data.tempoMin);

  // Valor
  document.getElementById("mValor").textContent = isento ? "Isento (R$ 0,00)" : fmtMoney(data.valor);

  // Subtítulo
  const subtitleEl = document.getElementById("modalSubtitle");
  if (subtitleEl) {
    subtitleEl.textContent = isento
      ? "Este veículo está isento. Confirme para registrar a saída."
      : "Revise os dados e confirme para finalizar a saída.";
  }

  // Botão confirmar com valor
  const confirmBtn = document.getElementById("btnModalConfirm");
  if (confirmBtn) {
    confirmBtn.textContent = isento
      ? "Finalizar (R$ 0,00)"
      : `Finalizar (${fmtMoney(data.valor)})`;
  }

  // Motivo da isenção + cálculo
  const calcEl = document.getElementById("mCalcInfo");
  if (calcEl) {
    const motivo = (isento && data.motivoIsencao) ? `Motivo da isenção: ${data.motivoIsencao}\n\n` : "";
    calcEl.textContent = motivo + (data.calcInfo || "");
  }
}

function doFinalizeExit(data){
  if (!data) {
    showToast("error", "Erro", "Falha: dados da saída não encontrados.");
    return;
  }

  Storage.removeEstacionado(data.placa);

  Storage.addHistorico({
    placa: data.placa,
    entradaISO: data.entradaISO,
    saidaISO: data.saidaISO,
    tempoMin: data.tempoMin,
    tipo: data.tipo,
    valor: data.valor,
    calcInfo: data.calcInfo || ""
  });

  $("#saidaSelecionada").textContent = "—";
  $("#saidaBuscaPlaca").value = "";

  renderSaidaTabela(Storage.listEstacionados());
renderDashboardCards?.();
renderDashboardEstacionados?.();

  showToast("success", "Saída finalizada", `Tempo: ${fmtTempo(data.tempoMin)} • Valor: ${fmtMoney(data.valor)}`);

  const recibo = gerarRecibo(data);
  imprimirRecibo(recibo);

  pendingExit = null;
}

// Regra simples de preço (pode ajustar depois)
function calcularValor(tipo, tempoMin){
  if (tipo === "Mensalista") return 0;

  const cfg = ensureConfigDefaults(); // garante que config existe
  const tolerancia = cfg.toleranciaMin;
  const baseHora = cfg.valorPrimeiraHora;
  const adicionalHora = cfg.valorHoraExtra;

  if (tempoMin <= tolerancia) return 0;
  if (tempoMin <= 60) return baseHora;

  const horasExtras = Math.ceil((tempoMin - 60) / 60);
  return baseHora + horasExtras * adicionalHora;
}
function calcularCobrancaDetalhada(tipo, tempoMin){
  const cfg = ensureConfigDefaults(); // usa config atual
  const tolerancia = Number(cfg.toleranciaMin);
  const primeira = Number(cfg.valorPrimeiraHora);
  const extra = Number(cfg.valorHoraExtra);

  // Mensalista
  if (tipo === "Mensalista") {
   return {
  valor: 0,
  horasExtras: 0,
  cobraPrimeiraHora: false,
  motivoIsencao: "Mensalista",
  linha: "Mensalista: valor R$ 0,00.",
  resumo: `Mensalista • Total: ${fmtMoney(0)}`
};
  }

  // Dentro da tolerância
  if (tempoMin <= tolerancia) {
    return {
  valor: 0,
  horasExtras: 0,
  cobraPrimeiraHora: false,
  motivoIsencao: `Tolerância (${tolerancia} min)`,
  linha: `Dentro da tolerância (${tolerancia} min): valor R$ 0,00.`,
  resumo: `Tolerância • Total: ${fmtMoney(0)}`
};
  }

  // Até 60 min: cobra 1ª hora
  if (tempoMin <= 60) {
    return {
      valor: primeira,
      horasExtras: 0,
      cobraPrimeiraHora: true,
      linha: `Cobrança: 1ª hora (${fmtMoney(primeira)}).`,
      resumo: `1ª hora • Total: ${fmtMoney(primeira)}`
    };
  }

  // Acima de 60 min: 1ª hora + horas extras (arredonda para cima)
  const horasExtras = Math.ceil((tempoMin - 60) / 60);
  const valorExtras = horasExtras * extra;
  const total = primeira + valorExtras;

  return {
    valor: total,
    horasExtras,
    cobraPrimeiraHora: true,
    linha: `Cobrança: 1ª hora (${fmtMoney(primeira)}) + ${horasExtras} hora(s) extra (${horasExtras} × ${fmtMoney(extra)} = ${fmtMoney(valorExtras)}).`,
    resumo: `1ª hora + extras • Total: ${fmtMoney(total)}`
  };
}


function diffMin(iniISO, fimISO){
  const ms = new Date(fimISO) - new Date(iniISO);
  return Math.max(0, Math.round(ms/60000));
}


async function loadPage(page) {
  const res = await fetch(`pages/${page}.html`);
  const html = await res.text();
  $("#content").innerHTML = html;

  // ✅ liga os botões do modal em qualquer tela
  bindModalEventsOnce();

  $("#pageTitle").textContent = pagesMeta[page].title;
  $("#pageSubtitle").textContent = pagesMeta[page].subtitle;

  document.querySelectorAll(".menu__item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });

  const initMap = { dashboard: initDashboard, entrada: initEntrada, mensalistas: initMensalistas, historico: initHistorico, config: initConfig };
  initMap[page]?.();
}

document.querySelectorAll(".menu__item").forEach(btn => {
  btn.addEventListener("click", () => loadPage(btn.dataset.page));
});
closeModal();

/* ===================== DASHBOARD ===================== */
function initDashboard(){
  renderDashboardCards();
  renderDashboardEstacionados();

  const btnReset = document.querySelector('[data-action="reset-db"]');
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      Storage.reset();
      renderDashboardCards();
      renderDashboardEstacionados();
      showToast("info", "Reset", "Dados de teste resetados.");

    });
  }
}

function renderDashboardCards(){
  const cfg = ensureConfigDefaults();
  const db = Storage.getAll();
  const total = cfg.vagasTotais;
  const ocupadas = db.estacionados.length;
  const livres = Math.max(0, total - ocupadas);

  // total do dia (somando histórico com data de hoje)
  const hoje = new Date();
  const dia = `${hoje.getFullYear()}-${pad2(hoje.getMonth()+1)}-${pad2(hoje.getDate())}`;
  const totalDia = db.historico
    .filter(x => (x.saidaISO||"").startsWith(dia))
    .reduce((acc,x)=> acc + (x.valor||0), 0);

  const elTotal = $("#cardTotal"); if (elTotal) elTotal.textContent = total;
  const elOcup = $("#cardOcupadas"); if (elOcup) elOcup.textContent = ocupadas;
  const elLiv = $("#cardLivres"); if (elLiv) elLiv.textContent = livres;
  const elDia = $("#cardTotalDia"); if (elDia) elDia.textContent = fmtMoney(totalDia);
}

function renderDashboardEstacionados(){
  const list = Storage.listEstacionados();
  const tbody = $("#dashEstacionadosBody");
  if (!tbody) return;

  tbody.innerHTML = list.length ? "" : `<tr><td colspan="6">Nenhum veículo estacionado no momento.</td></tr>`;

  list.forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.placa}</td>
      <td>${v.modelo}</td>
      <td>${v.cor}</td>
      <td>${fmtDateTimeBR(v.entradaISO)}</td>
      <td><span class="badge ${v.tipo==="Mensalista"?"blue":"gray"}">${v.tipo}</span></td>
      <td class="actions">
        <button class="btn small primary" data-action="saida" data-placa="${v.placa}">Saída</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "saida") {
      // envia o usuário para a tela de entrada/saída e já preenche a busca
      loadPage("entrada").then(() => {
        const inputBusca = $("#saidaBuscaPlaca");
        if (inputBusca) inputBusca.value = btn.dataset.placa;
        buscarSaida();
      });
    }
  }, { once: true });
}
function ensureConfigDefaults() {
  const db = Storage.getAll();
  const cfg = db.config || {};

  const fixed = {
    vagasTotais: Number(cfg.vagasTotais ?? 20),
    toleranciaMin: Number(cfg.toleranciaMin ?? 10),
    valorPrimeiraHora: Number(cfg.valorPrimeiraHora ?? 5),
    valorHoraExtra: Number(cfg.valorHoraExtra ?? 2),
  };

  Storage.setConfig(fixed);
  return fixed;
}

function initConfig(){
  const cfg = ensureConfigDefaults();

  // preencher inputs
  $("#cfgVagas").value = cfg.vagasTotais;
  $("#cfgTol").value = cfg.toleranciaMin;
  $("#cfgPrimeira").value = cfg.valorPrimeiraHora;
  $("#cfgExtra").value = cfg.valorHoraExtra;

  $("#btnCfgSalvar")?.addEventListener("click", salvarConfig);
  $("#btnCfgPadrao")?.addEventListener("click", restaurarConfigPadrao);
}

function salvarConfig(){
  const vagas = Number($("#cfgVagas").value);
  const tol = Number($("#cfgTol").value);
  const primeira = Number($("#cfgPrimeira").value);
  const extra = Number($("#cfgExtra").value);

  if (!Number.isFinite(vagas) || vagas < 1) {
    showToast("error", "Erro", "Vagas totais deve ser >= 1.");
    return;
  }
  if (!Number.isFinite(tol) || tol < 0) {
    showToast("error", "Erro", "Tolerância deve ser >= 0.");
    return;
  }
  if (!Number.isFinite(primeira) || primeira < 0) {
    showToast("error", "Erro", "Valor da 1ª hora deve ser >= 0.");
    return;
  }
  if (!Number.isFinite(extra) || extra < 0) {
    showToast("error", "Erro", "Hora extra deve ser >= 0.");
    return;
  }

  Storage.setConfig({
    vagasTotais: vagas,
    toleranciaMin: tol,
    valorPrimeiraHora: primeira,
    valorHoraExtra: extra
  });

  showToast("success", "Salvo", "Configurações atualizadas.");

  // Se quiser atualizar dashboard instantaneamente quando voltar:
  // (não precisa, mas é legal)
}

function restaurarConfigPadrao(){
  Storage.setConfig({
    vagasTotais: 20,
    toleranciaMin: 10,
    valorPrimeiraHora: 5,
    valorHoraExtra: 2
  });

  $("#cfgVagas").value = 20;
  $("#cfgTol").value = 10;
  $("#cfgPrimeira").value = 5;
  $("#cfgExtra").value = 2;

  showToast("info", "Padrão", "Configurações restauradas para o padrão.");
}


/* ===================== ENTRADA/SAÍDA ===================== */
function initEntrada(){
  // ENTRADA
  bindModalEventsOnce();
  $("#btnRegistrarEntrada")?.addEventListener("click", registrarEntrada);
  $("#btnLimparEntrada")?.addEventListener("click", () => {
    $("#entradaPlaca").value = "";
    $("#entradaModelo").value = "";
    $("#entradaCor").value = "";
    $("#entradaPlaca").focus();
  });

  // Auto-format ao sair do campo
  $("#entradaPlaca")?.addEventListener("blur", () => {
    const v = $("#entradaPlaca").value;
    if (isPlacaValida(v)) $("#entradaPlaca").value = formatPlaca(v);
  });

  // SAÍDA
  $("#btnBuscarSaida")?.addEventListener("click", buscarSaida);
  $("#btnFinalizarSaida")?.addEventListener("click", finalizarSaida);

  $("#entradaPlaca")?.addEventListener("input", () => {
  setFieldError("fieldEntradaPlaca", "entradaPlacaErro", "");
});

  renderSaidaTabela([]);
}

function registrarEntrada(){
  const placaRaw = $("#entradaPlaca")?.value;

  if (!isPlacaValida(placaRaw)) {
    setFieldError("fieldEntradaPlaca", "entradaPlacaErro", "Placa inválida.");
    showToast("error", "Erro", "Placa inválida.");
    $("#entradaPlaca")?.focus();
    return;
  }
  
  const placa = formatPlaca(placaRaw);
  const modelo = ($("#entradaModelo")?.value || "").trim();
  const cor = ($("#entradaCor")?.value || "").trim();

  if (!modelo || !cor) {
    showToast("error", "Erro", "Preencha modelo e cor.");
    return;
  }

  const estacionados = Storage.listEstacionados();
  if (estacionados.some(x => normalizePlaca(x.placa) === normalizePlaca(placa))) {
    showToast("error", "Erro", "Essa placa já está estacionada.");
    return;
  }
  const db = Storage.getAll();
  
  const totalVagas = Number(db.config?.vagasTotais ?? 50);
if (estacionados.length >= totalVagas) {
  showToast("error", "Erro", "Estacionamento lotado.");
  return;
}


  const mensalistas = Storage.listMensalistas();
  const mensalistaAtivo = mensalistas.find(m =>
    normalizePlaca(m.placa) === normalizePlaca(placa) && m.ativo
  );
  const tipo = mensalistaAtivo ? "Mensalista" : "Avulso";

  Storage.addEstacionado({
    placa,
    modelo,
    cor,
    entradaISO: new Date().toISOString(),
    tipo
    
  });

  
  renderSaidaTabela(Storage.listEstacionados());
  renderDashboardCards?.();
  renderDashboardEstacionados?.();

  $("#entradaPlaca").value = "";
  $("#entradaModelo").value = "";
  $("#entradaCor").value = "";
  $("#entradaPlaca").focus();

  showToast("success", "Entrada registrada", `Veículo ${placa} (${tipo}) entrou com sucesso.`);
}



function buscarSaida(){
  const raw = $("#saidaBuscaPlaca")?.value || "";
  const termo = normalizePlaca(raw);

  const list = Storage.listEstacionados();
  const encontrados = termo
    ? list.filter(v => normalizePlaca(v.placa).includes(termo))
    : list;
if (termo && encontrados.length === 0) {
  showToast("info", "Busca", "Nenhum veículo encontrado para essa placa.");
}

  renderSaidaTabela(encontrados);
  
}

function renderSaidaTabela(list){
  const tbody = $("#saidaBody");
  if (!tbody) return;

  tbody.innerHTML = list.length ? "" : `<tr><td colspan="6">Nenhum resultado.</td></tr>`;

  list.forEach(v => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${v.placa}</td>
      <td>${v.modelo}</td>
      <td>${v.cor}</td>
      <td>${fmtDateTimeBR(v.entradaISO)}</td>
      <td><span class="badge ${v.tipo==="Mensalista"?"blue":"gray"}">${v.tipo}</span></td>
      <td class="actions">
        <button class="btn small" data-action="selecionar-saida" data-placa="${v.placa}">Selecionar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.onclick = (e) => {
    const btn = e.target.closest('button[data-action="selecionar-saida"]');
    if (!btn) return;
    $("#saidaSelecionada").textContent = btn.dataset.placa;
  };
}

function finalizarSaida(){
  bindModalEventsOnce();

  const placaSel = ($("#saidaSelecionada")?.textContent || "").trim();
  if (!placaSel || placaSel === "—") {
    showToast("error", "Erro", "Selecione um veículo na tabela para finalizar a saída.");
    return;
  }

  const estacionados = Storage.listEstacionados();
  const v = estacionados.find(x => x.placa === placaSel);
  if (!v) {
    showToast("error", "Erro", "Veículo não encontrado (talvez já tenha saído).");
    return;
  }

  const saidaISO = new Date().toISOString();
  const tempoMin = diffMin(v.entradaISO, saidaISO);

  const det = calcularCobrancaDetalhada(v.tipo, tempoMin);
  const valor = det.valor;

  const cfg = (Storage.getAll().config || {});
  const calcInfo =
    `Tempo: ${fmtTempo(tempoMin)}\n` +
    `Tolerância: ${cfg.toleranciaMin ?? 10} min\n` +
    `1ª hora: ${fmtMoney(cfg.valorPrimeiraHora ?? 5)}\n` +
    `Hora extra: ${fmtMoney(cfg.valorHoraExtra ?? 2)}\n` +
    `${det.linha}\n` +
    `Total: ${fmtMoney(valor)}`;

  // ✅ AQUI é onde você estava falhando: setar o pendingExit
  pendingExit = {
    placa: v.placa,
    tipo: v.tipo,
    entradaISO: v.entradaISO,
    saidaISO,
    tempoMin,
    valor,
    calcInfo
  };

  fillExitModal(pendingExit);
  openModal((pendingExit.valor || 0) <= 0);
}
 


/* ===================== MENSALISTAS ===================== */
function initMensalistas(){
  $("#btnSalvarMensalista")?.addEventListener("click", salvarMensalista);

  $("#btnLimparMensalista")?.addEventListener("click", () => {
    $("#mPlaca").value = "";
    $("#mNome").value = "";
    $("#mTelefone").value = "";
    $("#mValidade").value = "";
    $("#mPlaca").focus();
  });

  // Auto-format ao sair do campo
  $("#mPlaca")?.addEventListener("blur", () => {
    const v = $("#mPlaca").value;
    if (isPlacaValida(v)) $("#mPlaca").value = formatPlaca(v);
  });

  $("#btnBuscarMensalista")?.addEventListener("click", () => renderMensalistas());

  $("#btnLimparFiltroMensalista")?.addEventListener("click", () => {
    $("#mensalistaBusca").value = "";
    renderMensalistas();
  });
$("#mPlaca")?.addEventListener("input", () => {
  setFieldError("fieldMPlaca", "mPlacaErro", "");
});

  renderMensalistas();
}


function salvarMensalista(){
  const placaRaw = $("#mPlaca")?.value;

if (!isPlacaValida(placaRaw)) {
  setFieldError("fieldMPlaca", "mPlacaErro", "Placa inválida. Use ABC-1234 ou ABC1D23.");
  showToast("error", "Erro", "Placa inválida. Corrija e tente novamente.");
  $("#mPlaca")?.focus();
  return;
}
setFieldError("fieldMPlaca", "mPlacaErro", "");


  const placa = formatPlaca(placaRaw);
  const nome = ($("#mNome")?.value || "").trim();
  const telefone = ($("#mTelefone")?.value || "").trim();
  const validade = ($("#mValidade")?.value || "").trim();

  if (!nome || !telefone || !validade) {
    showToast("error", "Erro", "Preencha todos os campos do mensalista.");
    return;
  }

  Storage.upsertMensalista({ placa, nome, telefone, validade, ativo: true });
  showToast("success", "Mensalista salvo", `Mensalista ${placa} cadastrado/atualizado.`);

  $("#mPlaca").value = "";
  $("#mNome").value = "";
  $("#mTelefone").value = "";
  $("#mValidade").value = "";

  renderMensalistas();
}


function renderMensalistas(){
  const q = ( $("#mensalistaBusca")?.value || "" ).trim().toUpperCase();
  const list = Storage.listMensalistas();

  const filtrado = q
    ? list.filter(m => m.placa.includes(q) || (m.nome||"").toUpperCase().includes(q))
    : list;

  const tbody = $("#mensalistasBody");
  if (!tbody) return;

  tbody.innerHTML = filtrado.length ? "" : `<tr><td colspan="6">Nenhum mensalista cadastrado.</td></tr>`;

  filtrado.forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.placa}</td>
      <td>${m.nome}</td>
      <td>${m.telefone}</td>
      <td>${m.validade}</td>
      <td><span class="badge ${m.ativo ? "green":"gray"}">${m.ativo ? "Ativo" : "Inativo"}</span></td>
      <td class="actions">
        <button class="btn small danger" data-action="toggle" data-placa="${m.placa}">
          ${m.ativo ? "Desativar" : "Ativar"}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.onclick = (e) => {
    const btn = e.target.closest('button[data-action="toggle"]');
    if (!btn) return;
    Storage.toggleMensalista(btn.dataset.placa);
    renderMensalistas();
  };
}

/* ===================== HISTÓRICO ===================== */
function initHistorico(){
  $("#btnAplicarFiltroHistorico")?.addEventListener("click", renderHistorico);
  $("#btnLimparFiltroHistorico")?.addEventListener("click", () => {
    $("#hIni").value = "";
    $("#hFim").value = "";
    $("#hTipo").value = "";
    $("#hPlaca").value = "";
    renderHistorico();
  });

  renderHistorico();
}

function renderHistorico(){
  const ini = $("#hIni")?.value; // YYYY-MM-DD
  const fim = $("#hFim")?.value;
  const tipo = ($("#hTipo")?.value || "").trim();
const placa = normalizePlaca($("#hPlaca")?.value);


  const list = Storage.listHistorico();

  const filtrado = list.filter(x => {
    const diaSaida = (x.saidaISO || "").slice(0,10);
    if (ini && diaSaida < ini) return false;
    if (fim && diaSaida > fim) return false;
    if (tipo && x.tipo !== tipo) return false;
    if (placa && !normalizePlaca(x.placa).includes(placa)) return false;

    return true;
  });

  const tbody = $("#historicoBody");
  if (!tbody) return;

  tbody.innerHTML = filtrado.length ? "" : `<tr><td colspan="6">Nenhum registro no período.</td></tr>`;

  filtrado.forEach(x => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${x.placa}</td>
      <td>${fmtDateTimeBR(x.entradaISO)}</td>
      <td>${fmtDateTimeBR(x.saidaISO)}</td>
      <td>${fmtTempo(x.tempoMin)}</td>
      <td><span class="badge ${x.tipo==="Mensalista"?"blue":"gray"}">${x.tipo}</span></td>
      <td>${fmtMoney(x.valor || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}
 function gerarRecibo(data){
  const linha = "================================";
  const sublinha = "--------------------------------";

  return `
${linha}
           ESTACIONAQUI
         RECIBO DE SAÍDA
${linha}

PLACA: ${data.placa}
TIPO: ${data.tipo}

ENTRADA: ${fmtDateTimeBR(data.entradaISO)}
SAÍDA:   ${fmtDateTimeBR(data.saidaISO)}
TEMPO:   ${fmtTempo(data.tempoMin)}

${sublinha}
VALOR TOTAL: ${fmtMoney(data.valor)}
${sublinha}

${data.calcInfo ? `DETALHAMENTO:\n${data.calcInfo}\n${sublinha}` : ""}

Obrigado pela preferência!
Volte sempre.
${linha}
`.trim();
}
function imprimirRecibo(texto){
  const win = window.open("", "Recibo", "width=420,height=700");

  if (!win) {
    showToast("error", "Erro", "Não foi possível abrir a janela de impressão.");
    return;
  }

  win.document.write(`
    <html>
      <body style="font-family: monospace; white-space: pre-wrap; padding:20px;">
${texto.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
<script>window.print();</script>
      </body>
    </html>
  `);

  win.document.close();
}
/* inicial */
loadPage("dashboard");

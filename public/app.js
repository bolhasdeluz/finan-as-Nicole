'use strict';

/* ================= Dados ================= */

const CHAVE = 'financas-nicole-v1';
const CATEGORIAS_PADRAO = [
  'Moradia', 'Contas da casa', 'Mercado', 'Restaurante/Delivery', 'Transporte', 'Saúde',
  'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Cuidados pessoais', 'Pets', 'Presentes',
  'Impostos/Taxas', 'Outros',
];

const TIPOS = {
  flexivel: 'Gasto flexível',
  fixa: 'Gasto fixo',
  renda: 'Renda / entrada',
  'emp-saiu': 'Empréstimo — saiu',
  'emp-entrou': 'Empréstimo — entrou',
  fatura: 'Pagamento de fatura',
};
const TIPOS_CARTAO = ['flexivel', 'fixa', 'emp-saiu'];
const ehGasto = (l) => l.tipo === 'fixa' || l.tipo === 'flexivel';
const ehEmp = (l) => l.tipo === 'emp-saiu' || l.tipo === 'emp-entrou';

const CABECALHO = 'data;descricao;valor;tipo;categoria;essencial;pessoa;parcela';
const REGRAS_GASTO = `- categoria (só para fixa e flexivel): use uma destas: ${CATEGORIAS_PADRAO.join(', ')}
- essencial (só para fixa e flexivel): "sim" se for necessidade (moradia, contas, mercado, saúde, transporte para trabalho); "nao" se for supérfluo (delivery, lazer, compras por impulso)`;

const PROMPT_CONTA = `Anexei meu extrato bancário e um modelo de planilha (modelo-importacao.csv).
Preencha o modelo com as movimentações do extrato, uma por linha, seguindo estas regras:

- Mantenha exatamente o cabeçalho: ${CABECALHO}
- Separador: ponto e vírgula (;). data no formato DD/MM/AAAA
- valor: SEMPRE positivo, com vírgula decimal, sem "R$" (ex.: 1234,56)
- descricao: nome do estabelecimento/pagamento, curto e legível
- tipo, escolha um:
  • fixa: gasto que se repete todo mês (aluguel, condomínio, luz, água, internet, celular, escola, plano de saúde, assinaturas)
  • flexivel: os demais gastos
  • renda: dinheiro que entrou e é meu (salário, freelas, pensão, rendimentos)
  • emprestimo-saiu: dinheiro que saiu como empréstimo para alguém, ou que eu devolvi para quem me emprestou
  • emprestimo-entrou: dinheiro que alguém me devolveu de um empréstimo, ou que eu peguei emprestado
  • fatura: pagamento da fatura do cartão de crédito
- Para achar empréstimos: procure Pix/TED para a mesma pessoa física que sai e depois volta (ou entra e depois sai) com valores parecidos, ou descrições como "empréstimo", "devolução", "te devolvo". Na dúvida, marque como empréstimo; eu confirmo na revisão.
- pessoa: nome da pessoa, só nas linhas de empréstimo
${REGRAS_GASTO}
- parcela: deixe em branco
- NÃO inclua transferências entre contas minhas nem aplicações/resgates de investimento
- Apague as linhas de exemplo do modelo

Devolva apenas o arquivo .csv preenchido, pronto para download.`;

const PROMPT_CARTAO = `Anexei a fatura do meu cartão de crédito e um modelo de planilha (modelo-importacao.csv).
Preencha o modelo com as COMPRAS da fatura, uma por linha, seguindo estas regras:

- Mantenha exatamente o cabeçalho: ${CABECALHO}
- Separador: ponto e vírgula (;). data no formato DD/MM/AAAA (data da compra)
- valor: SEMPRE positivo, com vírgula decimal, sem "R$" (ex.: 1234,56)
- descricao: nome do estabelecimento, curto e legível
- tipo, escolha um:
  • fixa: cobrança que se repete todo mês (assinaturas, streaming, academia, seguro)
  • flexivel: as demais compras
  • emprestimo-saiu: compra que fiz para outra pessoa e que ela vai me pagar de volta (na dúvida, use flexivel)
- pessoa: nome da pessoa, só nas linhas de emprestimo-saiu
${REGRAS_GASTO}
- parcela: se a compra for parcelada, a parcela atual no formato 3/10; senão deixe em branco
- Inclua juros, IOF, multa e anuidade com a categoria Impostos/Taxas
- NÃO inclua o pagamento da fatura anterior nem créditos/estornos (se houver estorno, remova também a compra estornada)
- Apague as linhas de exemplo do modelo

Devolva apenas o arquivo .csv preenchido, pronto para download.`;

function estadoVazio() {
  return { lancamentos: [], fixas: [], rendas: [], cartoes: [], memoria: {} };
}

function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE));
    if (s && Array.isArray(s.lancamentos) && Array.isArray(s.fixas)) return { ...estadoVazio(), ...s };
  } catch (e) { /* ignora */ }
  return estadoVazio();
}

let estado = carregar();
/** grava no navegador sem quebrar quando o armazenamento estiver bloqueado */
function guardar(chave, valor) {
  try { if (valor === null) localStorage.removeItem(chave); else localStorage.setItem(chave, valor); } catch (e) { /* sem armazenamento */ }
}
function salvar() { guardar(CHAVE, JSON.stringify(estado)); agendarEnvio(); }

/** confirmação dentro do app (o navegador pode bloquear a janela nativa) */
function confirmar(msg, textoSim = 'Confirmar') {
  return new Promise((resolve) => {
    const m = $('#modal'), sim = $('#modal-sim'), nao = $('#modal-nao');
    $('#modal-msg').textContent = msg; sim.textContent = textoSim; m.hidden = false; sim.focus();
    const fim = (v) => { m.hidden = true; sim.onclick = nao.onclick = m.onkeydown = null; resolve(v); };
    sim.onclick = () => fim(true); nao.onclick = () => fim(false);
    m.onkeydown = (e) => { if (e.key === 'Escape') fim(false); };
  });
}

const anoMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const hojeISO = () => `${anoMes(new Date())}-${String(new Date().getDate()).padStart(2, '0')}`;
let mesAtual = anoMes(new Date()); // AAAA-MM
let revisao = []; // linhas em revisão na importação
let importacao = { origem: 'conta', cartaoId: '', mes: '' };

/* ================= Utilidades ================= */

const $ = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const soma = (arr) => arr.reduce((t, l) => t + l.valor, 0);
const nomeMes = (ym) => {
  const [a, m] = ym.split('-');
  const s = new Date(+a, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2500);
}

/** "1.234,56" | "1234.56" | "R$ -50,00" -> 1234.56 (sempre positivo) */
function parseValor(txt) {
  let s = String(txt || '').replace(/[R$\s]/g, '').replace(/^\((.*)\)$/, '$1');
  if (!s) return NaN;
  const ultVirg = s.lastIndexOf(','), ultPonto = s.lastIndexOf('.');
  if (ultVirg > -1 && ultPonto > -1) {
    s = ultVirg > ultPonto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (ultVirg > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Math.abs(parseFloat(s));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** DD/MM/AAAA, DD/MM/AA, DD-MM-AAAA, AAAA-MM-DD -> AAAA-MM-DD (ou '') */
function parseData(txt) {
  const s = String(txt || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let a, me, d;
  if (m) { [, a, me, d] = m; } else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (!m) return '';
    [, d, me, a] = m;
    if (a.length === 2) a = '20' + a;
  }
  const dt = new Date(+a, +me - 1, +d);
  if (dt.getMonth() !== +me - 1) return '';
  return `${a}-${String(me).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseEssencial(txt) {
  const s = norm(txt);
  if (['sim', 's', 'yes', 'y', 'true', '1', 'essencial', 'x'].includes(s)) return true;
  if (['nao', 'n', 'no', 'false', '0', 'nao essencial', 'superfluo'].includes(s)) return false;
  return null;
}

function parseTipo(txt) {
  const s = norm(txt);
  if (!s) return '';
  if (s.includes('emprest') || s.startsWith('emp')) {
    return /entr|volt|receb|peguei/.test(s) ? 'emp-entrou' : 'emp-saiu';
  }
  if (s.startsWith('fix')) return 'fixa';
  if (s.includes('fatura')) return 'fatura';
  if (/^(renda|entrada|receita|salario)/.test(s)) return 'renda';
  return 'flexivel';
}

/** CSV simples com suporte a aspas; detecta ; , ou TAB */
function parseCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/)[0];
  const sep = [';', '\t', ','].map((c) => [c, primeira.split(c).length]).sort((x, y) => y[1] - x[1])[0][0];
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

function categorias() {
  const set = new Set(CATEGORIAS_PADRAO);
  estado.lancamentos.forEach((l) => l.categoria && set.add(l.categoria));
  estado.fixas.forEach((f) => f.categoria && set.add(f.categoria));
  return [...set];
}
const pessoas = () => [...new Set(estado.lancamentos.filter(ehEmp).map((l) => l.pessoa))].sort();

/** mês em que o lançamento conta (compras no cartão contam no mês de vencimento da fatura) */
const mesDe = (l) => l.mes || l.data.slice(0, 7);
const doMes = (mes) => estado.lancamentos.filter((l) => mesDe(l) === mes);
const vinculado = (campo, id, mes) => doMes(mes).find((l) => l[campo] === id);
const cartaoPorId = (id) => estado.cartoes.find((c) => c.id === id);

/** mês (AAAA-MM) da fatura em que cai uma compra feita na data informada */
function mesDaFatura(cartao, dataISO) {
  const [a, m, d] = dataISO.split('-').map(Number);
  let idx = m - 1 + (d >= cartao.fechamento ? 1 : 0); // mês em que a fatura fecha
  if (cartao.vencimento <= cartao.fechamento) idx += 1; // vence no mês seguinte ao fechamento
  return anoMes(new Date(a, idx, 1));
}

/** item cadastrado cujo nome aparece na descrição (ou vice-versa) */
function sugerir(lista, descricao, campo = 'nome') {
  const d = norm(descricao);
  return lista.find((x) => { const n = norm(x[campo]); return n && (d.includes(n) || n.includes(d)); });
}

/** saldo por pessoa: positivo = a pessoa te deve; negativo = você deve */
function saldosEmprestimos() {
  const s = {};
  estado.lancamentos.filter(ehEmp).forEach((l) => {
    s[l.pessoa] = (s[l.pessoa] || 0) + (l.tipo === 'emp-saiu' ? l.valor : -l.valor);
  });
  return s;
}

/* ================= Render ================= */

function render() {
  $('#mes-label').textContent = nomeMes(mesAtual);
  $('#lista-categorias').innerHTML = categorias().map((c) => `<option value="${esc(c)}">`).join('');
  $('#lista-pessoas').innerHTML = pessoas().map((p) => `<option value="${esc(p)}">`).join('');
  $('#form-lanc').forma.innerHTML = '<option value="">Pago na conta</option>'
    + estado.cartoes.map((c) => `<option value="${c.id}">Cartão ${esc(c.nome)}</option>`).join('');
  $('#banner-exemplo').hidden = !temExemplos();
  renderResumo(); renderLancamentos(); renderCartoes(); renderFixas(); renderRendas(); renderEmprestimos();
  renderOrigemImportacao();
}

function renderResumo() {
  const ls = doMes(mesAtual);
  const gastos = ls.filter(ehGasto);
  const total = soma(gastos);
  const ess = soma(gastos.filter((l) => l.essencial));
  const fixasAPagar = estado.fixas.filter((f) => !vinculado('fixaId', f.id, mesAtual)).reduce((t, f) => t + f.valor, 0);
  const renda = soma(ls.filter((l) => l.tipo === 'renda'));
  const rendaAReceber = estado.rendas.filter((r) => !vinculado('rendaId', r.id, mesAtual)).reduce((t, r) => t + r.valor, 0);
  const sobra = renda + rendaAReceber - total - fixasAPagar;

  $('#r-renda').textContent = brl(renda);
  $('#r-renda-prev').textContent = rendaAReceber ? `+ ${brl(rendaAReceber)} a receber` : '';
  $('#r-total').textContent = brl(total);
  $('#r-sobra').textContent = brl(sobra);
  $('#r-sobra').className = sobra < 0 ? 'neg' : 'pos';
  $('#r-fixas').textContent = brl(soma(gastos.filter((l) => l.tipo === 'fixa')));
  $('#r-flex').textContent = brl(soma(gastos.filter((l) => l.tipo === 'flexivel')));
  $('#r-cartao').textContent = brl(soma(gastos.filter((l) => l.cartaoId)));
  $('#r-apagar').textContent = brl(fixasAPagar);
  $('#r-ess').textContent = brl(ess);
  $('#r-nao').textContent = brl(total - ess);
  $('#r-barra-ess').style.width = total ? `${(ess / total) * 100}%` : '0';

  const saldos = Object.values(saldosEmprestimos());
  const receber = saldos.filter((v) => v > 0.005).reduce((t, v) => t + v, 0);
  const pagar = -saldos.filter((v) => v < -0.005).reduce((t, v) => t + v, 0);
  $('#r-emprestimos').textContent = receber || pagar
    ? `Empréstimos em aberto: te devem ${brl(receber)} · você deve ${brl(pagar)}` : '';

  const porCat = {};
  gastos.forEach((l) => { porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor; });
  const itens = Object.entries(porCat).sort((x, y) => y[1] - x[1]);
  $('#r-categorias').innerHTML = itens.length
    ? itens.map(([c, v]) => `<li><span>${esc(c)}</span><b>${brl(v)}</b>
        <div class="mini-barra"><div style="width:${(v / itens[0][1]) * 100}%"></div></div></li>`).join('')
    : '<li class="vazio">Sem gastos neste mês.</li>';
}

function tagEssencial(l) {
  if (!ehGasto(l)) return '<span class="so-desk">—</span>';
  return `<button class="mini sec" data-toggle-ess="${l.id}" title="Clique para alternar">
    <span class="tag ${l.essencial ? 'ess' : 'nao'}">${l.essencial ? 'Essencial' : 'Não essencial'}</span></button>`;
}

function valorComSinal(l) {
  const entra = l.tipo === 'renda' || l.tipo === 'emp-entrou';
  return `<span class="${entra ? 'pos' : ''}">${entra ? '+ ' : ''}${brl(l.valor)}</span>`;
}

function rotuloTipo(l) {
  let t = TIPOS[l.tipo] || l.tipo;
  if (ehEmp(l)) t += ` · ${esc(l.pessoa)}`;
  const c = l.cartaoId && cartaoPorId(l.cartaoId);
  if (c) t += ` · 💳 ${esc(c.nome)}`;
  return t;
}

function renderLancamentos() {
  const ls = doMes(mesAtual).sort((x, y) => y.data.localeCompare(x.data));
  $('#lanc-vazio').hidden = ls.length > 0;
  $('#tb-lanc').innerHTML = ls.map((l) => `
    <tr>
      <td>${dataBR(l.data)}</td>
      <td class="p">${esc(l.descricao)}${l.parcela ? ` <small class="legenda">(${esc(l.parcela)})</small>` : ''}</td>
      <td class="${ehGasto(l) ? 'so-desk' : ''}"><small>${rotuloTipo(l)}</small></td>
      <td class="${ehGasto(l) ? '' : 'so-desk'}">${ehGasto(l) ? esc(l.categoria) : '—'}</td>
      <td>${tagEssencial(l)}</td>
      <td class="num v">${valorComSinal(l)}</td>
      <td><button class="del" data-del-lanc="${l.id}" title="Excluir" aria-label="Excluir">✕</button></td>
    </tr>`).join('');
}

function renderCartoes() {
  $('#cartoes-vazio').hidden = estado.cartoes.length > 0;
  $('#lista-cartoes').innerHTML = estado.cartoes.map((c) => {
    const compras = doMes(mesAtual).filter((l) => l.cartaoId === c.id && l.tipo !== 'fatura')
      .sort((x, y) => x.data.localeCompare(y.data));
    const total = soma(compras);
    const pago = doMes(mesAtual).find((l) => l.tipo === 'fatura' && l.cartaoId === c.id);
    return `<div class="bloco">
      <div class="bloco-topo">
        <div><b>💳 ${esc(c.nome)}</b>
          <small class="legenda">fecha dia ${c.fechamento} · vence dia ${c.vencimento}</small></div>
        <button class="del" data-del-cartao="${c.id}" title="Excluir cartão">✕</button>
      </div>
      <p>Fatura de ${nomeMes(mesAtual).toLowerCase()}: <strong>${brl(total)}</strong>
        ${pago ? `<span class="tag pago">Paga ${brl(pago.valor)}</span> <button class="mini sec" data-desfazer-fatura="${c.id}">desfazer</button>`
               : `<span class="tag pendente">Em aberto</span> ${total ? `<button class="mini" data-pagar-fatura="${c.id}">marcar paga</button>` : ''}`}
        <button class="mini sec" data-importar-fatura="${c.id}">Importar fatura</button></p>
      ${compras.length ? `<div class="tabela-wrap"><table class="tabela cards">
        <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Essencial</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${compras.map((l) => `<tr>
          <td>${dataBR(l.data)}</td>
          <td class="p">${esc(l.descricao)}${l.parcela ? ` <small class="legenda">(${esc(l.parcela)})</small>` : ''}</td>
          <td>${ehGasto(l) ? esc(l.categoria) : `<small>${rotuloTipo(l)}</small>`}</td>
          <td>${tagEssencial(l)}</td>
          <td class="num v">${brl(l.valor)}</td>
          <td><button class="del" data-del-lanc="${l.id}" title="Excluir">✕</button></td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="vazio">Nenhuma compra nesta fatura.</p>'}
    </div>`;
  }).join('');
}

function renderFixas() {
  $('#fixas-vazio').hidden = estado.fixas.length > 0;
  const fx = [...estado.fixas].sort((x, y) => (x.dia || 99) - (y.dia || 99));
  $('#tb-fixas').innerHTML = fx.map((f) => {
    const p = vinculado('fixaId', f.id, mesAtual);
    return `<tr>
      <td class="p">${esc(f.nome)}</td>
      <td>${f.dia ? 'dia ' + f.dia : '—'}</td>
      <td>${esc(f.categoria)}</td>
      <td class="num v">${brl(f.valor)}</td>
      <td class="num so-desk">${p ? brl(p.valor) : '—'}</td>
      <td>${p
        ? `<span class="tag pago">Paga</span> <button class="mini sec" data-desfazer="${f.id}">desfazer</button>`
        : `<span class="tag pendente">Pendente</span> <button class="mini" data-pagar="${f.id}">marcar paga</button>`}</td>
      <td><button class="del" data-del-fixa="${f.id}" title="Excluir conta fixa">✕</button></td>
    </tr>`;
  }).join('');
}

function renderRendas() {
  $('#rendas-vazio').hidden = estado.rendas.length > 0;
  $('#tb-rendas').innerHTML = [...estado.rendas].sort((x, y) => (x.dia || 99) - (y.dia || 99)).map((r) => {
    const p = vinculado('rendaId', r.id, mesAtual);
    return `<tr>
      <td class="p">${esc(r.nome)}</td>
      <td>${r.dia ? 'dia ' + r.dia : '—'}</td>
      <td class="num v">${brl(r.valor)}</td>
      <td class="num so-desk">${p ? brl(p.valor) : '—'}</td>
      <td>${p
        ? `<span class="tag pago">Recebida</span> <button class="mini sec" data-desfazer-renda="${r.id}">desfazer</button>`
        : `<span class="tag pendente">A receber</span> <button class="mini" data-receber="${r.id}">marcar recebida</button>`}</td>
      <td><button class="del" data-del-renda="${r.id}" title="Excluir renda">✕</button></td>
    </tr>`;
  }).join('');
  const ent = doMes(mesAtual).filter((l) => l.tipo === 'renda').sort((x, y) => x.data.localeCompare(y.data));
  $('#entradas-vazio').hidden = ent.length > 0;
  $('#tb-entradas').innerHTML = ent.map((l) => `<tr><td>${dataBR(l.data)}</td><td class="p">${esc(l.descricao)}</td>
    <td class="num v pos">${brl(l.valor)}</td></tr>`).join('');
}

function renderEmprestimos() {
  const saldos = saldosEmprestimos();
  const nomes = Object.keys(saldos).sort((a, b) => Math.abs(saldos[b]) - Math.abs(saldos[a]));
  $('#e-receber').textContent = brl(Object.values(saldos).filter((v) => v > 0.005).reduce((t, v) => t + v, 0));
  $('#e-pagar').textContent = brl(-Object.values(saldos).filter((v) => v < -0.005).reduce((t, v) => t + v, 0));
  $('#emp-vazio').hidden = nomes.length > 0;
  $('#lista-pessoas-emp').innerHTML = nomes.map((p) => {
    const s = saldos[p];
    const movs = estado.lancamentos.filter((l) => ehEmp(l) && l.pessoa === p).sort((x, y) => y.data.localeCompare(x.data));
    const status = Math.abs(s) < 0.005 ? '<span class="tag pago">Quitado</span>'
      : s > 0 ? `<span class="tag ess">te deve ${brl(s)}</span>` : `<span class="tag nao">você deve ${brl(-s)}</span>`;
    return `<div class="bloco">
      <div class="bloco-topo"><b>${esc(p)}</b> ${status}</div>
      <table class="tabela cards"><tbody>${movs.map((l) => `<tr>
        <td>${dataBR(l.data)}</td>
        <td>${l.tipo === 'emp-saiu' ? '↗ saiu' : '↙ entrou'}${l.cartaoId ? ' (cartão)' : ''}</td>
        <td class="p">${esc(l.descricao)}</td>
        <td class="num v ${l.tipo === 'emp-entrou' ? 'pos' : ''}">${brl(l.valor)}</td>
        <td><button class="del" data-del-lanc="${l.id}" title="Excluir">✕</button></td></tr>`).join('')}
      </tbody></table></div>`;
  }).join('');
}

/* ================= Navegação ================= */

const ABAS_MAIS = ['fixas', 'renda', 'emprestimos', 'nuvem', 'ajuda'];
function abrirMais(abrir) {
  $('#menu-mais').hidden = !abrir;
  $('#btn-mais').setAttribute('aria-expanded', String(abrir));
}
function irPara(aba) {
  document.querySelectorAll('nav [data-aba], #menu-mais [data-aba]').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === aba));
  $('#btn-mais').classList.toggle('ativa', ABAS_MAIS.includes(aba));
  document.querySelectorAll('.aba').forEach((s) => { s.hidden = s.id !== 'aba-' + aba; });
  abrirMais(false);
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav [data-aba], #menu-mais [data-aba]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.aba)));
$('#btn-mais').onclick = () => abrirMais($('#menu-mais').hidden);
document.addEventListener('click', (e) => {
  if (!$('#menu-mais').hidden && !e.target.closest('#menu-mais, #btn-mais')) abrirMais(false);
});

/* formulários recolhidos no celular, sempre abertos no computador */
const celular = matchMedia('(max-width: 640px)');
document.querySelectorAll('form.form[data-titulo]').forEach((f) => {
  const d = document.createElement('details'); d.className = 'form-dobra';
  const s = document.createElement('summary'); s.textContent = f.dataset.titulo;
  f.before(d); d.append(s, f); d.open = !celular.matches;
});
celular.addEventListener('change', () => {
  document.querySelectorAll('.form-dobra').forEach((d) => { d.open = !celular.matches; });
});

function mudarMes(delta) {
  const [a, m] = mesAtual.split('-').map(Number);
  mesAtual = anoMes(new Date(a, m - 1 + delta, 1));
  render();
}
$('#mes-ant').onclick = () => mudarMes(-1);
$('#mes-prox').onclick = () => mudarMes(1);

/* ================= Ações comuns ================= */

// excluir lançamento / alternar essencial (vale para todas as abas)
document.querySelector('main').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del-lanc]');
  const tog = e.target.closest('[data-toggle-ess]');
  if (del) {
    if (!await confirmar('Excluir este lançamento?')) return;
    estado.lancamentos = estado.lancamentos.filter((l) => l.id !== del.dataset.delLanc);
  } else if (tog) {
    const l = estado.lancamentos.find((x) => x.id === tog.dataset.toggleEss);
    l.essencial = !l.essencial;
  } else return;
  salvar(); render();
});

/** dia "dia" no mês "mes", sem passar do último dia */
function dataNoMes(mes, dia) {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(Math.min(dia || 1, new Date(a, m, 0).getDate())).padStart(2, '0')}`;
}

/* ================= Lançamentos manuais ================= */

const formLanc = $('#form-lanc');
formLanc.data.value = hojeISO();
function ajustarFormLanc() {
  const t = formLanc.tipo.value;
  const gasto = t === 'fixa' || t === 'flexivel';
  formLanc.querySelectorAll('.so-gasto').forEach((el) => { el.hidden = !gasto; });
  formLanc.querySelectorAll('.so-emp').forEach((el) => { el.hidden = !t.startsWith('emp'); });
  formLanc.querySelectorAll('.so-pagto').forEach((el) => { el.hidden = !(gasto || t === 'emp-saiu') || !estado.cartoes.length; });
}
formLanc.tipo.addEventListener('change', ajustarFormLanc);

formLanc.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = formLanc; const tipo = f.tipo.value;
  const valor = parseValor(f.valor.value);
  if (!valor) return toast('Valor inválido');
  const l = { id: uid(), data: f.data.value, descricao: f.descricao.value.trim(), valor, tipo };
  if (ehGasto(l)) {
    if (!f.categoria.value.trim()) return toast('Informe a categoria');
    l.categoria = f.categoria.value.trim(); l.essencial = f.essencial.checked;
  }
  if (ehEmp(l)) {
    if (!f.pessoa.value.trim()) return toast('Informe a pessoa');
    l.pessoa = f.pessoa.value.trim();
  }
  const cartao = (ehGasto(l) || tipo === 'emp-saiu') && cartaoPorId(f.forma.value);
  if (cartao) { l.cartaoId = cartao.id; l.mes = mesDaFatura(cartao, l.data); }
  estado.lancamentos.push(l);
  salvar();
  mesAtual = mesDe(l);
  f.descricao.value = ''; f.valor.value = ''; f.essencial.checked = false;
  render(); toast(cartao ? `Adicionado na fatura de ${nomeMes(l.mes).toLowerCase()}` : 'Lançamento adicionado');
});

/* ================= Cartões ================= */

$('#form-cartao').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  estado.cartoes.push({ id: uid(), nome: f.nome.value.trim(), fechamento: +f.fechamento.value, vencimento: +f.vencimento.value });
  salvar(); f.reset(); render(); ajustarFormLanc(); toast('Cartão cadastrado');
});

$('#lista-cartoes').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  const c = cartaoPorId(d.pagarFatura || d.desfazerFatura || d.delCartao || d.importarFatura);
  if (!c) return;
  if (d.pagarFatura) {
    const total = soma(doMes(mesAtual).filter((l) => l.cartaoId === c.id && l.tipo !== 'fatura'));
    estado.lancamentos.push({ id: uid(), data: dataNoMes(mesAtual, c.vencimento), descricao: `Fatura ${c.nome}`, valor: total, tipo: 'fatura', cartaoId: c.id });
  } else if (d.desfazerFatura) {
    const p = doMes(mesAtual).find((l) => l.tipo === 'fatura' && l.cartaoId === c.id);
    estado.lancamentos = estado.lancamentos.filter((l) => l !== p);
  } else if (d.delCartao) {
    if (!await confirmar(`Excluir o cartão "${c.nome}"? (As compras já lançadas continuam.)`)) return;
    estado.cartoes = estado.cartoes.filter((x) => x !== c);
  } else if (d.importarFatura) {
    document.querySelector('input[name=origem][value=cartao]').checked = true;
    importacao = { origem: 'cartao', cartaoId: c.id, mes: mesAtual };
    renderOrigemImportacao(); irPara('importar'); return;
  }
  salvar(); render(); ajustarFormLanc();
});

/* ================= Contas fixas ================= */

$('#form-fixa').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const valor = parseValor(f.valor.value);
  if (!valor) return toast('Valor inválido');
  estado.fixas.push({
    id: uid(), nome: f.nome.value.trim(), valor, dia: +f.dia.value || null,
    categoria: f.categoria.value.trim(), essencial: f.essencial.checked,
  });
  salvar(); f.reset(); f.essencial.checked = true;
  render(); toast('Conta fixa cadastrada');
});

$('#tb-fixas').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.dataset.pagar || b.dataset.desfazer || b.dataset.delFixa;
  const fixa = estado.fixas.find((f) => f.id === id);
  if (!fixa) return;
  if (b.dataset.pagar) {
    estado.lancamentos.push({
      id: uid(), data: dataNoMes(mesAtual, fixa.dia), descricao: fixa.nome, valor: fixa.valor,
      categoria: fixa.categoria, tipo: 'fixa', essencial: fixa.essencial, fixaId: fixa.id,
    });
  } else if (b.dataset.desfazer) {
    const p = vinculado('fixaId', id, mesAtual);
    estado.lancamentos = estado.lancamentos.filter((l) => l !== p);
  } else if (b.dataset.delFixa) {
    if (!await confirmar(`Excluir a conta fixa "${fixa.nome}"? (Os lançamentos já feitos continuam.)`)) return;
    estado.fixas = estado.fixas.filter((f) => f.id !== id);
    estado.lancamentos.forEach((l) => { if (l.fixaId === id) delete l.fixaId; });
  }
  salvar(); render();
});

/* ================= Renda ================= */

$('#form-renda').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const valor = parseValor(f.valor.value);
  if (!valor) return toast('Valor inválido');
  estado.rendas.push({ id: uid(), nome: f.nome.value.trim(), valor, dia: +f.dia.value || null });
  salvar(); f.reset(); render(); toast('Renda cadastrada');
});

$('#tb-rendas').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.dataset.receber || b.dataset.desfazerRenda || b.dataset.delRenda;
  const r = estado.rendas.find((x) => x.id === id);
  if (!r) return;
  if (b.dataset.receber) {
    estado.lancamentos.push({ id: uid(), data: dataNoMes(mesAtual, r.dia), descricao: r.nome, valor: r.valor, tipo: 'renda', rendaId: r.id });
  } else if (b.dataset.desfazerRenda) {
    const p = vinculado('rendaId', id, mesAtual);
    estado.lancamentos = estado.lancamentos.filter((l) => l !== p);
  } else if (b.dataset.delRenda) {
    if (!await confirmar(`Excluir a renda "${r.nome}"? (As entradas já lançadas continuam.)`)) return;
    estado.rendas = estado.rendas.filter((x) => x !== r);
    estado.lancamentos.forEach((l) => { if (l.rendaId === id) delete l.rendaId; });
  }
  salvar(); render();
});

/* ================= Empréstimos ================= */

$('#form-emp').data.value = hojeISO();
$('#form-emp').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const valor = parseValor(f.valor.value);
  if (!valor) return toast('Valor inválido');
  const pessoa = f.pessoa.value.trim();
  estado.lancamentos.push({
    id: uid(), data: f.data.value, valor, tipo: f.tipo.value, pessoa,
    descricao: f.descricao.value.trim() || (f.tipo.value === 'emp-saiu' ? `Para ${pessoa}` : `De ${pessoa}`),
  });
  salvar(); f.valor.value = ''; f.descricao.value = ''; render(); toast('Registrado');
});

/* ================= Importação + revisão ================= */

function renderOrigemImportacao() {
  const cartao = importacao.origem === 'cartao';
  $('#origem-cartao').hidden = !cartao || !estado.cartoes.length;
  $('#sem-cartao').hidden = !cartao || estado.cartoes.length > 0;
  $('#imp-cartao').innerHTML = estado.cartoes.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  if (!cartaoPorId(importacao.cartaoId)) importacao.cartaoId = estado.cartoes[0]?.id || '';
  $('#imp-cartao').value = importacao.cartaoId;
  $('#imp-mes').value = importacao.mes || mesAtual;
  $('#nome-doc').textContent = cartao ? 'a fatura do cartão (PDF ou print)' : 'seu extrato bancário';
  $('#prompt-ia').textContent = cartao ? PROMPT_CARTAO : PROMPT_CONTA;
}
document.querySelectorAll('input[name=origem]').forEach((r) => r.addEventListener('change', () => {
  importacao.origem = r.value; renderOrigemImportacao();
}));
$('#imp-cartao').onchange = (e) => { importacao.cartaoId = e.target.value; };
$('#imp-mes').onchange = (e) => { importacao.mes = e.target.value; };

const MODELO_CSV = `${CABECALHO}
05/11/2026;Aluguel;1500,00;fixa;Moradia;sim;;
05/11/2026;Salário Empresa X;4200,00;renda;;;;
07/11/2026;Supermercado Extra;312,45;flexivel;Mercado;sim;;
12/11/2026;Pix para Maria Souza;200,00;emprestimo-saiu;;;Maria Souza;
25/11/2026;Pix de Maria Souza;200,00;emprestimo-entrou;;;Maria Souza;
10/11/2026;Pagamento fatura Nubank;980,00;fatura;;;;
`;
$('#copiar-modelo').onclick = async () => {
  try { await navigator.clipboard.writeText(MODELO_CSV); toast('Modelo copiado! Cole no chat da IA junto com o pedido.'); }
  catch { toast('Não foi possível copiar'); }
};
$('#copiar-prompt').onclick = async () => {
  try { await navigator.clipboard.writeText($('#prompt-ia').textContent); toast('Pedido copiado!'); }
  catch { toast('Não foi possível copiar — selecione o texto manualmente'); }
};

function erroImportacao(msg) { const p = $('#imp-erro'); p.textContent = msg; p.hidden = !msg; }

$('#arquivo').addEventListener('change', async (e) => {
  const arq = e.target.files[0]; e.target.value = '';
  if (!arq) return;
  let texto = await arq.text();
  if (texto.includes('\uFFFD')) texto = new TextDecoder('windows-1252').decode(await arq.arrayBuffer());
  importacao.exemplo = false;
  try { iniciarRevisao(texto); } catch (err) { erroImportacao(err.message); }
});

/* ---------- Exemplo: extrato fictício para ver a revisão funcionando ---------- */

function csvExemplo() {
  const [a, m] = anoMes(new Date()).split('-');
  const d = (dia) => `${String(dia).padStart(2, '0')}/${m}/${a}`;
  return [CABECALHO,
    `${d(1)};Salário Empresa Exemplo;4200,00;renda;;;;`,
    `${d(5)};Aluguel;1500,00;fixa;Moradia;sim;;`,
    `${d(6)};Enel Energia;187,30;fixa;Contas da casa;sim;;`,
    `${d(7)};Supermercado Pão de Açúcar;342,18;flexivel;Mercado;sim;;`,
    `${d(8)};iFood;64,90;flexivel;Restaurante/Delivery;nao;;`,
    `${d(9)};Pix para Maria Souza;300,00;emprestimo-saiu;;;Maria Souza;`,
    `${d(10)};Pagamento fatura Nubank;1120,45;fatura;;;;`,
    `${d(12)};Drogasil;48,70;flexivel;Saúde;;;`,
    `${d(14)};Uber;23,40;flexivel;Transporte;;;`,
    `${d(15)};Pix de João Lima;150,00;emprestimo-entrou;;;;`,
    `${d(20)};Pix de Maria Souza;100,00;emprestimo-entrou;;;Maria Souza;`,
    `${d(22)};Cinema;56,00;flexivel;Lazer;nao;;`,
  ].join('\n');
}

const temExemplos = () => ['lancamentos', 'fixas', 'rendas', 'cartoes'].some((k) => estado[k].some((x) => x.exemplo));

$('#ver-exemplo').onclick = () => {
  // cadastros de exemplo, para a revisão mostrar os vínculos (conta fixa, renda, cartão)
  if (!estado.fixas.some((f) => norm(f.nome) === 'aluguel')) {
    estado.fixas.push({ id: uid(), nome: 'Aluguel', valor: 1500, dia: 5, categoria: 'Moradia', essencial: true, exemplo: true });
  }
  if (!estado.rendas.length) estado.rendas.push({ id: uid(), nome: 'Salário', valor: 4200, dia: 1, exemplo: true });
  if (!estado.cartoes.length) estado.cartoes.push({ id: uid(), nome: 'Nubank', fechamento: 3, vencimento: 10, exemplo: true });
  salvar(); render();
  importacao.origem = 'conta'; importacao.exemplo = true;
  document.querySelector('input[name=origem][value=conta]').checked = true;
  renderOrigemImportacao();
  iniciarRevisao(csvExemplo());
};

$('#apagar-exemplos').onclick = async () => {
  if (!await confirmar('Apagar todos os dados de exemplo? Seus dados de verdade continuam.', 'Apagar exemplos')) return;
  const ids = new Set([...estado.fixas, ...estado.rendas, ...estado.cartoes].filter((x) => x.exemplo).map((x) => x.id));
  estado.lancamentos = estado.lancamentos.filter((l) => !l.exemplo);
  estado.fixas = estado.fixas.filter((x) => !x.exemplo);
  estado.rendas = estado.rendas.filter((x) => !x.exemplo);
  estado.cartoes = estado.cartoes.filter((x) => !x.exemplo);
  estado.lancamentos.forEach((l) => { ['fixaId', 'rendaId', 'cartaoId'].forEach((k) => { if (ids.has(l[k])) delete l[k]; }); });
  salvar(); render(); ajustarFormLanc(); toast('Exemplos apagados');
};

/** preenche vínculos sugeridos (conta fixa, renda fixa, cartão) conforme o tipo da linha */
function sugerirVinculos(r) {
  r.fixaId = r.tipo === 'fixa' ? (sugerir(estado.fixas, r.descricao)?.id || '') : '';
  r.rendaId = r.tipo === 'renda' ? (sugerir(estado.rendas, r.descricao)?.id || '') : '';
  r.faturaCartaoId = r.tipo === 'fatura'
    ? (sugerir(estado.cartoes, r.descricao)?.id || (estado.cartoes.length === 1 ? estado.cartoes[0].id : '')) : '';
}

function iniciarRevisao(texto) {
  if (importacao.origem === 'cartao') {
    importacao.cartaoId = $('#imp-cartao').value; importacao.mes = $('#imp-mes').value;
    if (!cartaoPorId(importacao.cartaoId)) throw new Error('Cadastre e selecione um cartão antes de importar a fatura.');
    if (!importacao.mes) throw new Error('Informe o mês de vencimento da fatura.');
  }
  const linhas = parseCSV(texto);
  if (linhas.length < 2) throw new Error('O arquivo está vazio ou só tem o cabeçalho.');
  const cab = linhas[0].map(norm);
  const col = (...nomes) => cab.findIndex((c) => nomes.some((n) => c.startsWith(n)));
  const ix = {
    data: col('data'), desc: col('descri', 'historico', 'estabelecimento'), valor: col('valor'),
    cat: col('categ'), tipo: col('tipo'), ess: col('essencial'), pessoa: col('pessoa', 'nome'), parcela: col('parcela'),
  };
  if (ix.data < 0 || ix.desc < 0 || ix.valor < 0) {
    throw new Error('Não encontrei as colunas "data", "descricao" e "valor". Use o modelo de planilha.');
  }
  const existentes = new Set(estado.lancamentos.map((l) => `${l.data}|${l.valor}|${norm(l.descricao)}`));
  const doCartao = importacao.origem === 'cartao';

  revisao = linhas.slice(1).map((c) => {
    const get = (i) => (i >= 0 ? (c[i] || '').trim() : '');
    const descricao = get(ix.desc);
    const mem = estado.memoria[norm(descricao)] || {};
    let tipo = parseTipo(get(ix.tipo)) || mem.tipo || 'flexivel';
    if (doCartao && !TIPOS_CARTAO.includes(tipo)) tipo = 'flexivel';
    const ess = parseEssencial(get(ix.ess));
    const r = {
      data: parseData(get(ix.data)), descricao, valor: parseValor(get(ix.valor)), tipo,
      categoria: get(ix.cat) || mem.categoria || '', pessoa: get(ix.pessoa) || mem.pessoa || '',
      parcela: get(ix.parcela), essencial: ess !== null ? ess : (mem.essencial ?? null), avisos: [],
    };
    sugerirVinculos(r);
    if (!r.data) r.avisos.push('data inválida');
    if (!r.valor) r.avisos.push('valor inválido');
    const dup = existentes.has(`${r.data}|${r.valor}|${norm(descricao)}`);
    if (dup) r.avisos.push('já lançado antes?');
    r.incluir = !dup && !!r.data && !!r.valor;
    return r;
  });

  erroImportacao('');
  $('#rev-titulo').textContent = doCartao
    ? `Revisão — fatura ${cartaoPorId(importacao.cartaoId).nome} (${nomeMes(importacao.mes).toLowerCase()})`
    : 'Revisão — extrato da conta';
  $('#rev-exemplo').hidden = !importacao.exemplo;
  $('#imp-inicio').hidden = true; $('#imp-revisao').hidden = false;
  renderRevisao();
}

function selectVinculo(campo, lista, valor, vazio) {
  if (!lista.length) return '';
  return `<select data-f="${campo}" class="vinculo">
    <option value="">${vazio}</option>
    ${lista.map((x) => `<option value="${x.id}" ${valor === x.id ? 'selected' : ''}>↳ ${esc(x.nome)}</option>`).join('')}
  </select>`;
}

function renderRevisao() {
  $('#lista-categorias').innerHTML = categorias().map((c) => `<option value="${esc(c)}">`).join('');
  const tipos = importacao.origem === 'cartao' ? TIPOS_CARTAO : Object.keys(TIPOS);
  $('#tb-revisao').innerHTML = revisao.map((r, i) => {
    const gasto = ehGasto(r), emp = ehEmp(r);
    let vinc = '';
    if (r.tipo === 'fixa') vinc = selectVinculo('fixaId', estado.fixas, r.fixaId, '— não vincular a conta fixa —');
    if (r.tipo === 'renda') vinc = selectVinculo('rendaId', estado.rendas, r.rendaId, '— não vincular a renda fixa —');
    if (r.tipo === 'fatura') vinc = selectVinculo('faturaCartaoId', estado.cartoes, r.faturaCartaoId, '— qual cartão? —');
    return `
    <tr data-i="${i}" class="${r.incluir ? '' : 'off'} ${emp ? 'linha-emp' : ''}">
      <td class="sel"><input type="checkbox" data-f="incluir" ${r.incluir ? 'checked' : ''} aria-label="Salvar esta linha"></td>
      <td class="data"><input type="date" data-f="data" value="${r.data}" aria-label="Data"></td>
      <td class="desc"><input data-f="descricao" value="${esc(r.descricao)}" aria-label="Descrição">
        ${r.parcela ? `<span class="legenda">parcela ${esc(r.parcela)}</span>` : ''}
        ${r.avisos.length ? `<span class="aviso">⚠ ${r.avisos.join(' · ')}</span>` : ''}</td>
      <td class="num val"><input data-f="valor" value="${r.valor ? r.valor.toFixed(2).replace('.', ',') : ''}" inputmode="decimal" aria-label="Valor"></td>
      <td class="tipo">
        <select data-f="tipo">${tipos.map((t) => `<option value="${t}" ${r.tipo === t ? 'selected' : ''}>${TIPOS[t]}</option>`).join('')}</select>
        ${vinc}
      </td>
      <td class="cat">${gasto ? `<input data-f="categoria" list="lista-categorias" value="${esc(r.categoria)}" placeholder="Categoria…">`
        : emp ? `<input data-f="pessoa" list="lista-pessoas" value="${esc(r.pessoa)}" placeholder="Nome da pessoa…" class="${r.pessoa ? '' : 'falta'}">`
        : '<span class="legenda traco">—</span>'}</td>
      <td class="ess">${gasto ? `<div class="toggle ${r.essencial === null ? 'vazio-sel' : ''}">
        <button type="button" data-ess="1" class="sim ${r.essencial === true ? 'on' : ''}">Sim</button>
        <button type="button" data-ess="0" class="nao ${r.essencial === false ? 'on' : ''}">Não</button>
      </div>` : '<span class="legenda traco">—</span>'}</td>
    </tr>`;
  }).join('');
  atualizarResumoRevisao();
}

function atualizarResumoRevisao() {
  const inc = revisao.filter((r) => r.incluir);
  const v = (f) => inc.filter(f).reduce((t, r) => t + (r.valor || 0), 0);
  const pend = inc.filter((r) => ehGasto(r) && r.essencial === null).length;
  const partes = [`${inc.length} de ${revisao.length} linhas selecionadas`, `gastos ${brl(v(ehGasto))}`];
  if (v((r) => r.tipo === 'renda')) partes.push(`renda ${brl(v((r) => r.tipo === 'renda'))}`);
  if (v(ehEmp)) partes.push(`empréstimos ${brl(v(ehEmp))}`);
  $('#rev-resumo').innerHTML = partes.join(' · ') + (pend ? ` · <b class="erro">${pend} sem marcar essencial/não</b>` : '');
}

$('#tb-revisao').addEventListener('input', (e) => {
  const tr = e.target.closest('tr'); const r = revisao[tr.dataset.i]; const f = e.target.dataset.f;
  if (!f) return;
  if (f === 'incluir') { r.incluir = e.target.checked; tr.classList.toggle('off', !r.incluir); }
  else if (f === 'valor') r.valor = parseValor(e.target.value);
  else if (f === 'tipo') { r.tipo = e.target.value; sugerirVinculos(r); renderRevisao(); return; }
  else { r[f] = e.target.value; if (f === 'pessoa') e.target.classList.toggle('falta', !r.pessoa.trim()); }
  atualizarResumoRevisao();
});

$('#tb-revisao').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ess]'); if (!b) return;
  const r = revisao[b.closest('tr').dataset.i];
  r.essencial = b.dataset.ess === '1';
  const tg = b.parentElement;
  tg.classList.remove('vazio-sel');
  tg.querySelector('.sim').classList.toggle('on', r.essencial);
  tg.querySelector('.nao').classList.toggle('on', !r.essencial);
  atualizarResumoRevisao();
});

function marcarTodos(v) { revisao.forEach((r) => { if (ehGasto(r)) r.essencial = v; }); renderRevisao(); }
$('#todos-ess').onclick = () => marcarTodos(true);
$('#todos-nao').onclick = () => marcarTodos(false);

function fecharRevisao() { revisao = []; importacao.exemplo = false; $('#imp-inicio').hidden = false; $('#imp-revisao').hidden = true; }
$('#cancelar-imp').onclick = fecharRevisao;

function problemaDaLinha(r) {
  if (!r.data || !r.valor || !r.descricao.trim()) return 'Complete data, valor e descrição';
  if (ehGasto(r) && !r.categoria.trim()) return 'Escolha a categoria dos gastos';
  if (ehGasto(r) && r.essencial === null) return 'Marque se cada gasto foi essencial ou não';
  if (ehEmp(r) && !r.pessoa.trim()) return 'Informe o nome da pessoa nos empréstimos';
  return '';
}

$('#confirmar-imp').onclick = () => {
  const inc = revisao.filter((r) => r.incluir);
  if (!inc.length) return toast('Nenhuma linha selecionada');
  const ruim = inc.find(problemaDaLinha);
  if (ruim) {
    const tr = $(`#tb-revisao tr[data-i="${revisao.indexOf(ruim)}"]`);
    tr.scrollIntoView({ block: 'center' }); tr.style.outline = '2px solid var(--erro)';
    setTimeout(() => { tr.style.outline = ''; }, 2000);
    return toast(problemaDaLinha(ruim));
  }
  const doCartao = importacao.origem === 'cartao';
  inc.forEach((r) => {
    const l = { id: uid(), data: r.data, descricao: r.descricao.trim(), valor: r.valor, tipo: r.tipo };
    if (doCartao) { l.cartaoId = importacao.cartaoId; l.mes = importacao.mes; }
    if (importacao.exemplo) l.exemplo = true;
    if (r.parcela) l.parcela = r.parcela;
    const mes = mesDe(l);
    if (ehGasto(l)) {
      l.categoria = r.categoria.trim(); l.essencial = r.essencial;
      if (l.tipo === 'fixa' && r.fixaId && !vinculado('fixaId', r.fixaId, mes)) l.fixaId = r.fixaId;
    }
    if (ehEmp(l)) l.pessoa = r.pessoa.trim();
    if (l.tipo === 'renda' && r.rendaId && !vinculado('rendaId', r.rendaId, mes)) l.rendaId = r.rendaId;
    if (l.tipo === 'fatura' && r.faturaCartaoId) l.cartaoId = r.faturaCartaoId;
    estado.lancamentos.push(l);
    if (!importacao.exemplo) estado.memoria[norm(r.descricao)] = {
      tipo: l.tipo, ...(ehGasto(l) ? { categoria: l.categoria, essencial: l.essencial } : {}), ...(l.pessoa ? { pessoa: l.pessoa } : {}),
    };
  });
  salvar();
  if (doCartao) mesAtual = importacao.mes;
  else { // vai para o mês com mais lançamentos importados
    const cont = {}; inc.forEach((r) => { const m = r.data.slice(0, 7); cont[m] = (cont[m] || 0) + 1; });
    mesAtual = Object.entries(cont).sort((x, y) => y[1] - x[1])[0][0];
  }
  importacao.exemplo = false;
  fecharRevisao(); render(); irPara(doCartao ? 'cartao' : 'resumo');
  toast(`${inc.length} lançamentos importados`);
};

/* ================= Backup ================= */

$('#exportar').onclick = () => {
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `financas-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
};

$('#restaurar').addEventListener('change', async (e) => {
  const arq = e.target.files[0]; e.target.value = '';
  if (!arq) return;
  try {
    const s = JSON.parse(await arq.text());
    if (!Array.isArray(s.lancamentos) || !Array.isArray(s.fixas)) throw new Error();
    if (!await confirmar('Substituir todos os dados atuais pelo backup?')) return;
    estado = { ...estadoVazio(), ...s }; salvar(); render(); ajustarFormLanc(); toast('Backup restaurado');
  } catch { toast('Arquivo de backup inválido'); }
});

/* ================= Nuvem (backup criptografado de ponta a ponta) ================= */
/*
 * A senha nunca sai do aparelho. Dela derivamos (PBKDF2-SHA256, 600 mil iterações) 64 bytes:
 *   - 32 bytes = chave AES-GCM que criptografa os dados aqui no navegador;
 *   - 32 bytes = token de acesso enviado ao servidor (que guarda só o hash dele).
 * O id do cofre é um hash do nome de usuário. O servidor só vê dados ilegíveis.
 */

const CHAVE_NUVEM = 'financas-nicole-nuvem';
let API_NUVEM = null; // definido por detectarNuvem() quando o servidor do app responde
async function detectarNuvem() {
  if (!location.protocol.startsWith('http')) return;
  try {
    const r = await fetch('/api/ping', { cache: 'no-store' });
    if (r.ok && (await r.json()).ok) API_NUVEM = '/api/cofre/';
  } catch (e) { /* sem servidor (ex.: prévia) */ }
}
let nuvem = null; // { usuario, id, token, chave (base64), versao, pendente, sincronizadoEm }
try { nuvem = JSON.parse(localStorage.getItem(CHAVE_NUVEM)); } catch (e) { nuvem = null; }
const salvarNuvem = () => guardar(CHAVE_NUVEM, nuvem ? JSON.stringify(nuvem) : null);

const paraHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const paraB64 = (b) => btoa(String.fromCharCode(...b));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let chaveCache = null;

async function derivarCredenciais(usuario, senha) {
  const enc = new TextEncoder();
  const u = norm(usuario);
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('financas-nicole:v1:' + u), iterations: 600000 }, base, 512));
  const id = paraHex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('financas-nicole:id:' + u))));
  return { usuario: u, id, chave: paraB64(bits.slice(0, 32)), token: paraHex(bits.slice(32)) };
}

async function chaveAES() {
  if (!chaveCache) chaveCache = await crypto.subtle.importKey('raw', deB64(nuvem.chave), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return chaveCache;
}

async function cifrar(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveAES(), new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: paraB64(iv), ct: paraB64(new Uint8Array(ct)) };
}

async function decifrar(dados) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(dados.iv) }, await chaveAES(), deB64(dados.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

async function api(metodo, cred, corpo) {
  const r = await fetch(API_NUVEM + cred.id, {
    method: metodo,
    headers: { authorization: 'Bearer ' + cred.token, ...(corpo ? { 'content-type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}

let timerEnvio = null, enviando = false;
function agendarEnvio() {
  if (!nuvem) return;
  nuvem.pendente = true; salvarNuvem(); renderNuvem();
  clearTimeout(timerEnvio); timerEnvio = setTimeout(enviarNuvem, 1500);
}

async function enviarNuvem() {
  if (!nuvem || !nuvem.pendente || enviando) return;
  enviando = true;
  try {
    const { status, corpo } = await api('PUT', nuvem, { versao: nuvem.versao, dados: await cifrar(estado) });
    if (status === 200) {
      nuvem.versao = corpo.versao; nuvem.pendente = false; nuvem.sincronizadoEm = corpo.atualizadoEm;
    } else if (status === 409) {
      // outro aparelho salvou antes: fica a versão da nuvem
      await baixarNuvem(true);
      toast('Seus dados foram atualizados por outro aparelho. Confira a última alteração.');
    } else if (status === 401) {
      toast('A senha da nuvem não confere mais. Entre de novo na aba ☁ Nuvem.');
      nuvem = null;
    }
  } catch (e) { /* sem internet: tenta de novo depois */ }
  enviando = false; salvarNuvem(); renderNuvem();
}

/** busca a versão da nuvem; se for mais nova que a deste aparelho, substitui os dados locais */
async function baixarNuvem(forcar = false) {
  const { status, corpo } = await api('GET', nuvem);
  if (status === 401) { toast('Senha da nuvem incorreta. Entre de novo na aba ☁ Nuvem.'); nuvem = null; return; }
  if (status !== 200) throw new Error('falha ' + status);
  if (forcar || corpo.versao > nuvem.versao) {
    estado = { ...estadoVazio(), ...(await decifrar(corpo.dados)) };
    guardar(CHAVE, JSON.stringify(estado));
    nuvem.versao = corpo.versao; nuvem.pendente = false; nuvem.sincronizadoEm = corpo.atualizadoEm;
    render();
  }
}

async function sincronizar() {
  if (!nuvem || !API_NUVEM) return;
  try {
    await baixarNuvem(false);
    if (nuvem && nuvem.pendente) await enviarNuvem();
  } catch (e) { /* offline */ }
  salvarNuvem(); renderNuvem();
}

function renderNuvem() {
  const on = !!nuvem;
  $('#nuvem-off').hidden = on; $('#nuvem-on').hidden = !on;
  $('#nuvem-indisponivel').hidden = !!API_NUVEM;
  $('#status-nuvem').textContent = !on ? '' : nuvem.pendente ? '☁ …' : '☁ ✓';
  $('#status-nuvem').title = !on ? '' : nuvem.pendente ? 'Alterações ainda não enviadas para a nuvem' : 'Tudo salvo na nuvem';
  if (!on) return;
  $('#nuvem-usuario').textContent = nuvem.usuario;
  $('#nuvem-estado').textContent = nuvem.pendente
    ? 'Há alterações ainda não enviadas (sem internet?). Elas vão sozinhas quando a conexão voltar.'
    : `Tudo salvo na nuvem${nuvem.sincronizadoEm ? ' em ' + new Date(nuvem.sincronizadoEm).toLocaleString('pt-BR') : ''}.`;
}

const modoNuvem = () => document.querySelector('input[name=modo-nuvem]:checked').value;
document.querySelectorAll('input[name=modo-nuvem]').forEach((r) => r.addEventListener('change', () => {
  const criar = modoNuvem() === 'criar';
  document.querySelectorAll('.so-criar').forEach((el) => { el.hidden = !criar; el.required = criar; });
  $('#btn-nuvem').textContent = criar ? 'Criar conta e enviar meus dados' : 'Entrar';
  $('#nuvem-msg').textContent = '';
}));

$('#form-nuvem').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; const msg = $('#nuvem-msg'); const criar = modoNuvem() === 'criar';
  if (!API_NUVEM) { msg.textContent = 'Abra o app pelo link para usar a nuvem.'; return; }
  if (criar && f.senha.value !== f.senha2.value) { msg.textContent = 'As senhas não são iguais.'; return; }
  $('#btn-nuvem').disabled = true; msg.textContent = 'Gerando a chave de criptografia…';
  try {
    const cred = await derivarCredenciais(f.usuario.value, f.senha.value);
    chaveCache = null;
    const { status, corpo } = await api('GET', cred);
    if (criar) {
      if (status !== 404) { msg.textContent = 'Esse nome de usuário já existe. Escolha outro ou use “Já tenho conta”.'; return; }
      nuvem = { ...cred, versao: 0, pendente: true };
      await enviarNuvem();
      if (nuvem && !nuvem.pendente) toast('Conta criada! Seus dados estão protegidos na nuvem.');
    } else {
      if (status === 404 || status === 401) { msg.textContent = 'Usuário ou senha incorretos.'; return; }
      if (status !== 200) { msg.textContent = 'Não foi possível conectar. Tente de novo.'; return; }
      nuvem = { ...cred, versao: 0, pendente: false };
      let dados;
      try { dados = await decifrar(corpo.dados); } catch { nuvem = null; msg.textContent = 'Usuário ou senha incorretos.'; return; }
      const temLocal = estado.lancamentos.length || estado.fixas.length || estado.rendas.length || estado.cartoes.length;
      if (temLocal && !await confirmar('Substituir os dados deste aparelho pelos dados da nuvem?')) { nuvem = null; msg.textContent = ''; return; }
      estado = { ...estadoVazio(), ...dados };
      guardar(CHAVE, JSON.stringify(estado));
      nuvem.versao = corpo.versao; nuvem.sincronizadoEm = corpo.atualizadoEm;
      render(); ajustarFormLanc(); toast('Dados carregados da nuvem');
    }
    f.reset(); msg.textContent = '';
  } catch (err) {
    msg.textContent = 'Não foi possível conectar. Verifique a internet.';
  } finally {
    $('#btn-nuvem').disabled = false; salvarNuvem(); renderNuvem();
  }
});

$('#nuvem-sync').onclick = async () => { await sincronizar(); toast(nuvem && !nuvem.pendente ? 'Sincronizado' : 'Não foi possível sincronizar agora'); };
$('#nuvem-sair').onclick = async () => {
  if (nuvem.pendente && !await confirmar('Há alterações ainda não enviadas. Sair mesmo assim?')) return;
  if (!await confirmar('Sair da nuvem neste aparelho? Os dados continuam aqui e na nuvem.')) return;
  nuvem = null; chaveCache = null; salvarNuvem(); renderNuvem();
};
window.addEventListener('online', sincronizar);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });

render();
ajustarFormLanc();
renderNuvem();
detectarNuvem().then(() => { renderNuvem(); sincronizar(); });
// primeira vez abrindo o app: mostra o tutorial
if (!nuvem && !estado.lancamentos.length && !estado.fixas.length && !estado.rendas.length && !estado.cartoes.length) irPara('ajuda');

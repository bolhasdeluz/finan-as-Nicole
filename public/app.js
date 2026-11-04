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

const CABECALHO = 'data;descricao;valor;tipo;categoria;essencial;pessoa;parcela;banco';
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
- banco: nome do banco de onde veio cada movimentação (ex.: Itaú, Nubank, Inter). Se eu anexar vários extratos, preencha em todas as linhas
- NÃO inclua transferências entre contas minhas (ex.: Pix do meu Itaú para o meu Nubank) nem aplicações/resgates de investimento. Se a mesma quantia sai de um extrato meu e entra em outro extrato meu, é transferência: apague as duas linhas
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
- banco: deixe em branco
- Inclua juros, IOF, multa e anuidade com a categoria Impostos/Taxas
- NÃO inclua o pagamento da fatura anterior nem créditos/estornos (se houver estorno, remova também a compra estornada)
- Apague as linhas de exemplo do modelo

Devolva apenas o arquivo .csv preenchido, pronto para download.`;

function estadoVazio() {
  return { lancamentos: [], fixas: [], rendas: [], cartoes: [], bancos: [], memoria: {} };
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
const bancoPorId = (id) => estado.bancos.find((b) => b.id === id);
/** de onde saiu/entrou o dinheiro: 'c:<cartão>', 'b:<banco>' ou '' (não informado) */
function fonteDe(l) {
  if (l.cartaoId && l.tipo !== 'fatura') return 'c:' + l.cartaoId;
  return l.bancoId ? 'b:' + l.bancoId : '';
}
function nomeFonte(f) {
  if (!f) return 'Sem banco informado';
  const id = f.slice(2);
  if (f[0] === 'c') { const c = cartaoPorId(id); return c ? `Cartão ${c.nome}` : 'Cartão excluído'; }
  const b = bancoPorId(id); return b ? b.nome : 'Banco excluído';
}
/** acha o banco pelo nome (Itaú, itau, ITAÚ…) ou cadastra um novo */
function acharOuCriarBanco(nome, exemplo = false) {
  const n = norm(nome); if (!n) return '';
  let b = estado.bancos.find((x) => norm(x.nome) === n) || sugerir(estado.bancos, nome);
  if (!b) { b = { id: uid(), nome: nome.trim(), ...(exemplo ? { exemplo: true } : {}) }; estado.bancos.push(b); }
  return b.id;
}
const opcoesBancos = (sel) => estado.bancos.map((b) => `<option value="${b.id}" ${sel === b.id ? 'selected' : ''}>${esc(b.nome)}</option>`).join('');
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
  const formaAtual = $('#form-lanc').forma.value;
  $('#form-lanc').forma.innerHTML = '<option value="">Conta não informada</option>'
    + estado.bancos.map((b) => `<option value="b:${b.id}">Conta ${esc(b.nome)}</option>`).join('')
    + estado.cartoes.map((c) => `<option value="c:${c.id}">Cartão ${esc(c.nome)}</option>`).join('');
  const selForma = $('#form-lanc').forma;
  const valida = [...selForma.options].some((o) => o.value === formaAtual);
  selForma.value = selForma.dataset.escolhido === '1' && valida ? formaAtual : (estado.bancos[0] ? 'b:' + estado.bancos[0].id : '');
  $('#banner-exemplo').hidden = !temExemplos();
  document.querySelectorAll('select.sel-banco').forEach((sel) => {
    const v = sel.value;
    sel.innerHTML = `<option value="">${esc(sel.dataset.vazio)}</option>` + opcoesBancos(v);
    sel.value = bancoPorId(v) ? v : '';
    sel.hidden = !estado.bancos.length;
  });
  renderBancos();
  ajustarFormLanc();
  renderResumo(); renderLancamentos(); renderCartoes(); renderFixas(); renderRendas(); renderEmprestimos(); renderRelatorio();
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
  const b = !c && l.bancoId && bancoPorId(l.bancoId);
  if (b) t += ` · 🏦 ${esc(b.nome)}`;
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
      <td class="${ehGasto(l) ? '' : 'so-desk'}">${ehGasto(l) ? esc(l.categoria) + (fonteDe(l) ? `<small class="so-mobile"> · ${esc(nomeFonte(fonteDe(l)))}</small>` : '') : '—'}</td>
      <td>${tagEssencial(l)}</td>
      <td class="num v">${valorComSinal(l)}</td>
      <td><button class="del" data-del-lanc="${l.id}" title="Excluir" aria-label="Excluir">✕</button></td>
    </tr>`).join('');
}

function renderBancos() {
  $('#bancos-vazio').hidden = estado.bancos.length > 0;
  $('#lista-bancos').innerHTML = estado.bancos.map((b) => {
    const ls = doMes(mesAtual).filter((l) => fonteDe(l) === 'b:' + b.id);
    const saiu = soma(ls.filter((l) => !['renda', 'emp-entrou'].includes(l.tipo)));
    const entrou = soma(ls.filter((l) => ['renda', 'emp-entrou'].includes(l.tipo)));
    return `<div class="banco-item">
      <b>🏦 ${esc(b.nome)}</b>
      <span class="legenda">${nomeMes(mesAtual).toLowerCase()}: saiu <b>${brl(saiu)}</b> · entrou <b class="pos">${brl(entrou)}</b> · ${ls.length} lançamento${ls.length === 1 ? '' : 's'}</span>
      <button class="del" data-del-banco="${b.id}" title="Excluir banco" aria-label="Excluir banco">✕</button>
    </div>`;
  }).join('');
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
          <small class="legenda">fecha dia ${c.fechamento} · vence dia ${c.vencimento}${c.bancoId && bancoPorId(c.bancoId) ? ` · ${esc(bancoPorId(c.bancoId).nome)}` : ''}</small></div>
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

/* ================= Relatório ================= */

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (ym) => `${MESES_CURTOS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
const pct = (parte, todo) => (todo ? Math.round((parte / todo) * 100) : 0);
/** valores curtos para eixos: R$ 800 · R$ 1,5 mil · R$ 12 mil */
const brlCurto = (v) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: v >= 10000 ? 0 : 1 })} mil` : `R$ ${Math.round(v)}`);

function mesesAte(fim, n) {
  const [a, m] = fim.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => anoMes(new Date(a, m - n + i, 1)));
}

function dadosPeriodo(meses) {
  const f = $('#rel-fonte').value;
  const ls = estado.lancamentos.filter((l) => meses.includes(mesDe(l)) && (!f || fonteDe(l) === f));
  const gastos = ls.filter(ehGasto);
  return {
    ls, gastos,
    renda: soma(ls.filter((l) => l.tipo === 'renda')),
    total: soma(gastos),
    ess: soma(gastos.filter((l) => l.essencial)),
    fixas: soma(gastos.filter((l) => l.tipo === 'fixa')),
    cartao: soma(gastos.filter((l) => l.cartaoId)),
  };
}

let relCategoriaAberta = null;

function renderRelatorio() {
  // opções do filtro de conta: bancos e cartões cadastrados (+ "sem banco" se houver)
  const sf = $('#rel-fonte'), fv = sf.value;
  const fontes = [...estado.bancos.map((b) => 'b:' + b.id), ...estado.cartoes.map((c) => 'c:' + c.id)];
  sf.innerHTML = '<option value="">Todas as contas</option>' + fontes.map((x) => `<option value="${x}">${esc(nomeFonte(x))}</option>`).join('');
  sf.value = fontes.includes(fv) ? fv : '';
  const n = Number($('#rel-periodo').value);
  const meses = mesesAte(mesAtual, n);
  const d = dadosPeriodo(meses);
  const ant = dadosPeriodo(mesesAte(meses[0], n + 1).slice(0, n)); // período anterior, mesmo tamanho
  const nomePeriodo = n === 1 ? nomeMes(mesAtual).toLowerCase() : `${mesCurto(meses[0])} a ${mesCurto(meses.at(-1))}`;
  const sobra = d.renda - d.total;

  // frase-resumo
  const cats = {};
  d.gastos.forEach((l) => { cats[l.categoria] = (cats[l.categoria] || 0) + l.valor; });
  const ordem = Object.entries(cats).sort((x, y) => y[1] - x[1]);
  const partes = [];
  if (!d.total && !d.renda) {
    partes.push(`Ainda não há lançamentos em ${nomePeriodo}. Importe um extrato ou lance gastos para ver o relatório.`);
  } else {
    partes.push(`Em ${nomePeriodo}${sf.value ? `, em <b>${esc(nomeFonte(sf.value))}</b>` : ''}, entraram <b>${brl(d.renda)}</b> e você gastou <b>${brl(d.total)}</b>.`);
    if (d.renda) partes.push(sobra >= 0 ? `Sobraram <b>${brl(sobra)}</b> (${pct(sobra, d.renda)}% da renda).` : `Faltaram <b>${brl(-sobra)}</b>: os gastos passaram da renda.`);
    if (ordem.length) partes.push(`A maior parte foi para <b>${esc(ordem[0][0])}</b>: ${pct(ordem[0][1], d.total)}% dos gastos.`);
    if (ant.total) {
      const v = Math.round(((d.total - ant.total) / ant.total) * 100);
      if (Math.abs(v) >= 1) partes.push(`Os gastos foram ${Math.abs(v)}% ${v > 0 ? 'maiores' : 'menores'} que no período anterior.`);
    }
  }
  $('#rel-frase').innerHTML = partes.join(' ');

  // números principais
  const tile = (rotulo, valor, extra, cls = '') => `<div class="card"><small>${rotulo}</small><strong class="${cls}">${valor}</strong>${extra ? `<small>${extra}</small>` : ''}</div>`;
  $('#rel-cards').innerHTML = tile('Renda', brl(d.renda), '', 'pos')
    + tile('Gastos', brl(d.total), d.renda ? `${pct(d.total, d.renda)}% da renda` : '')
    + tile(sobra >= 0 ? 'Sobrou' : 'Faltou', brl(Math.abs(sobra)), n > 1 && d.total ? `média de ${brl(d.total / n)} de gastos por mês` : '', sobra >= 0 ? 'pos' : 'neg');

  // para onde foi: barras horizontais por categoria (até 8 + Outras)
  let linhas = ordem.slice(0, 8);
  if (ordem.length > 8) linhas.push(['Outras', ordem.slice(8).reduce((t, x) => t + x[1], 0)]);
  const maior = linhas[0]?.[1] || 1;
  $('#rel-categorias').innerHTML = linhas.length ? linhas.map(([c, v]) => {
    const aberta = relCategoriaAberta === c;
    const itens = aberta ? d.gastos.filter((l) => (c === 'Outras' ? !linhas.slice(0, 8).some(([k]) => k === l.categoria) : l.categoria === c))
      .sort((x, y) => y.valor - x.valor).slice(0, 5) : [];
    return `<div class="rel-cat ${aberta ? 'aberta' : ''}">
      <button type="button" class="rel-cat-linha" data-cat="${esc(c)}" aria-expanded="${aberta}">
        <span class="rel-cat-nome">${esc(c)}</span>
        <span class="rel-cat-valor"><b>${brl(v)}</b> <small>${pct(v, d.total)}%</small></span>
        <span class="rel-cat-trilho"><span class="rel-cat-barra" style="width:${Math.max(1, (v / maior) * 100)}%"></span></span>
      </button>
      ${aberta ? `<ul class="rel-cat-itens">${itens.map((l) => `<li><span>${esc(l.descricao)} <small>${dataBR(l.data)}</small></span><b>${brl(l.valor)}</b></li>`).join('')}</ul>` : ''}
    </div>`;
  }).join('') : '<p class="vazio">Sem gastos no período.</p>';

  // mês a mês
  $('#rel-mensal-bloco').hidden = n === 1;
  if (n > 1) renderMensal(meses);

  // gastos por conta e cartão (só quando há mais de uma origem e nenhum filtro)
  const porFonte = {};
  d.gastos.forEach((l) => { const k = fonteDe(l); porFonte[k] = (porFonte[k] || 0) + l.valor; });
  const fontesOrd = Object.entries(porFonte).sort((x, y) => y[1] - x[1]);
  $('#rel-fontes-bloco').hidden = !!sf.value || fontesOrd.length < 2;
  const maiorF = fontesOrd[0]?.[1] || 1;
  $('#rel-fontes').innerHTML = fontesOrd.map(([k, v]) => `<div class="rel-cat">
      <div class="rel-cat-linha estatica">
        <span class="rel-cat-nome">${k.startsWith('c:') ? '💳' : '🏦'} ${esc(nomeFonte(k))}</span>
        <span class="rel-cat-valor"><b>${brl(v)}</b> <small>${pct(v, d.total)}%</small></span>
        <span class="rel-cat-trilho"><span class="rel-cat-barra" style="width:${Math.max(1, (v / maiorF) * 100)}%"></span></span>
      </div></div>`).join('');

  // divisões
  const divisao = (titulo, a, b, ca, cb, ra, rb) => {
    const t = a + b;
    return `<div class="rel-div">
      <div class="rel-div-titulo">${titulo}</div>
      <div class="rel-seg">${t ? `<span class="${ca}" style="flex:${a}"></span><span class="${cb}" style="flex:${b}"></span>` : '<span class="vazio-seg"></span>'}</div>
      <div class="rel-div-legenda">
        <span><i class="chave ${ca}"></i>${ra} <b>${brl(a)}</b> <small>${pct(a, t)}%</small></span>
        <span><i class="chave ${cb}"></i>${rb} <b>${brl(b)}</b> <small>${pct(b, t)}%</small></span>
      </div></div>`;
  };
  $('#rel-divisoes').innerHTML = divisao('Necessidade', d.ess, d.total - d.ess, 'ess', 'nao', 'Essencial', 'Não essencial')
    + divisao('Tipo de gasto', d.fixas, d.total - d.fixas, 'fixa', 'flex', 'Contas fixas', 'Flexíveis')
    + divisao('Forma de pagamento', d.total - d.cartao, d.cartao, 'conta', 'cartao', 'Na conta', 'No cartão');

  // onde mais gasta (agrupado pela descrição) e maiores gastos
  const lugares = {};
  d.gastos.forEach((l) => {
    const k = norm(l.descricao);
    if (!lugares[k]) lugares[k] = { nome: l.descricao, total: 0, vezes: 0 };
    lugares[k].total += l.valor; lugares[k].vezes += 1;
  });
  const topL = Object.values(lugares).sort((x, y) => y.total - x.total).slice(0, 5);
  $('#rel-lugares').innerHTML = topL.length ? topL.map((x) => `<li><span>${esc(x.nome)} <small>${x.vezes}×</small></span><b>${brl(x.total)}</b></li>`).join('') : '<li class="vazio">—</li>';
  const topG = [...d.gastos].sort((x, y) => y.valor - x.valor).slice(0, 5);
  $('#rel-maiores').innerHTML = topG.length ? topG.map((l) => `<li><span>${esc(l.descricao)} <small>${dataBR(l.data)}</small></span><b>${brl(l.valor)}</b></li>`).join('') : '<li class="vazio">—</li>';
}

/** colunas empilhadas (essencial + não essencial) com a renda marcada por um traço */
function renderMensal(meses) {
  const dados = meses.map((m) => ({ m, ...dadosPeriodo([m]) }));
  const topo = Math.max(1, ...dados.map((x) => Math.max(x.total, x.renda)));
  const passo = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000].find((p) => topo / p <= 4) || 100000;
  const maxY = Math.ceil(topo / passo) * passo;
  const W = Math.max(300, Math.round($('#rel-mensal').clientWidth || 640)), H = W < 520 ? 210 : 240, esq = 56, dir = 8, cima = 12, baixo = 28;
  const larg = (W - esq - dir) / meses.length;
  const barra = Math.min(24, larg * 0.5);
  const Y = (v) => cima + (H - cima - baixo) * (1 - v / maxY);
  const ticks = []; for (let v = 0; v <= maxY; v += passo) ticks.push(v);
  const cx = (i) => esq + larg * i + larg / 2;
  const coluna = (x, y0, y1, cls, arredonda) => {
    if (y0 - y1 < 0.5) return '';
    const h = y0 - y1, r = arredonda ? Math.min(4, h) : 0, xa = x - barra / 2;
    return `<path class="${cls}" d="M${xa} ${y0}V${y1 + r}${r ? `Q${xa} ${y1} ${xa + r} ${y1}` : ''}H${xa + barra - r}${r ? `Q${xa + barra} ${y1} ${xa + barra} ${y1 + r}` : ''}V${y0}Z"/>`;
  };
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gastos e renda mês a mês">`;
  svg += ticks.map((v) => `<line class="grade" x1="${esq}" x2="${W - dir}" y1="${Y(v)}" y2="${Y(v)}"/><text class="eixo" x="${esq - 8}" y="${Y(v) + 4}" text-anchor="end">${brlCurto(v)}</text>`).join('');
  dados.forEach((x, i) => {
    const c = cx(i), base = Y(0), yEss = Y(x.ess), yTot = Y(x.total);
    const naoE = x.total - x.ess;
    svg += `<g class="mes-col" data-i="${i}" tabindex="0">`;
    svg += `<rect class="alvo" x="${esq + larg * i}" y="${cima}" width="${larg}" height="${H - cima - baixo}"/>`;
    svg += coluna(c, base, yEss, 'ess', naoE < 0.005);
    if (naoE >= 0.005) svg += coluna(c, yEss - (x.ess ? 2 : 0), yTot - (x.ess ? 2 : 0), 'nao', true);
    if (x.renda) svg += `<line class="renda" x1="${c - barra / 2 - 6}" x2="${c + barra / 2 + 6}" y1="${Y(x.renda)}" y2="${Y(x.renda)}"/>`;
    svg += `<text class="eixo" x="${c}" y="${H - 8}" text-anchor="middle">${mesCurto(x.m)}</text></g>`;
  });
  svg += `<line class="base" x1="${esq}" x2="${W - dir}" y1="${Y(0)}" y2="${Y(0)}"/></svg>`;
  $('#rel-mensal').innerHTML = svg;
  $('#rel-mensal').dados = dados;
  $('#rel-tabela').innerHTML = `<thead><tr><th>Mês</th><th class="num">Renda</th><th class="num">Essencial</th><th class="num">Não essencial</th><th class="num">Total gasto</th><th class="num">Sobra</th></tr></thead><tbody>`
    + dados.map((x) => `<tr><td>${nomeMes(x.m)}</td><td class="num">${brl(x.renda)}</td><td class="num">${brl(x.ess)}</td><td class="num">${brl(x.total - x.ess)}</td><td class="num">${brl(x.total)}</td><td class="num ${x.renda - x.total < 0 ? 'neg' : ''}">${brl(x.renda - x.total)}</td></tr>`).join('') + '</tbody>';
}

function mostrarDica(g) {
  const x = $('#rel-mensal').dados[g.dataset.i];
  const dica = $('#rel-dica');
  dica.innerHTML = '';
  const t = document.createElement('div'); t.className = 'dica-titulo'; t.textContent = nomeMes(x.m); dica.append(t);
  [['ess', 'Essencial', x.ess], ['nao', 'Não essencial', x.total - x.ess], ['linha', 'Renda', x.renda], ['', 'Sobra', x.renda - x.total]].forEach(([cls, rot, v]) => {
    const r = document.createElement('div'); r.className = 'dica-linha';
    const k = document.createElement('i'); k.className = 'chave ' + cls;
    const b = document.createElement('b'); b.textContent = brl(v);
    const s = document.createElement('span'); s.textContent = rot;
    r.append(k, b, s); dica.append(r);
  });
  dica.hidden = false;
  const caixa = g.getBoundingClientRect(), sec = $('#aba-relatorio').getBoundingClientRect();
  const left = Math.min(Math.max(0, caixa.left - sec.left + caixa.width / 2 - dica.offsetWidth / 2), sec.width - dica.offsetWidth);
  dica.style.left = `${left}px`;
  dica.style.top = `${caixa.top - sec.top - dica.offsetHeight + 8}px`;
  document.querySelectorAll('.mes-col.ativo').forEach((e) => e.classList.remove('ativo'));
  g.classList.add('ativo');
}
function esconderDica() {
  $('#rel-dica').hidden = true;
  document.querySelectorAll('.mes-col.ativo').forEach((e) => e.classList.remove('ativo'));
}
$('#rel-mensal').addEventListener('pointerover', (e) => { const g = e.target.closest('.mes-col'); if (g) mostrarDica(g); });
$('#rel-mensal').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') esconderDica(); });
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#rel-mensal')) esconderDica(); });
let timerRel = null;
window.addEventListener('resize', () => {
  clearTimeout(timerRel);
  timerRel = setTimeout(() => { if (!$('#aba-relatorio').hidden) renderRelatorio(); }, 150);
});
$('#rel-mensal').addEventListener('focusin', (e) => { const g = e.target.closest('.mes-col'); if (g) mostrarDica(g); });
$('#rel-mensal').addEventListener('focusout', esconderDica);

$('#rel-periodo').onchange = () => { relCategoriaAberta = null; renderRelatorio(); };
$('#rel-fonte').onchange = () => { relCategoriaAberta = null; renderRelatorio(); };
$('#rel-categorias').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  relCategoriaAberta = relCategoriaAberta === b.dataset.cat ? null : b.dataset.cat;
  renderRelatorio();
});

/** texto do relatório para colar no WhatsApp ou e-mail */
$('#rel-copiar').onclick = async () => {
  const n = Number($('#rel-periodo').value);
  const meses = mesesAte(mesAtual, n);
  const d = dadosPeriodo(meses);
  const cats = {};
  d.gastos.forEach((l) => { cats[l.categoria] = (cats[l.categoria] || 0) + l.valor; });
  const linhas = [
    `Relatório de gastos: ${n === 1 ? nomeMes(mesAtual) : `${nomeMes(meses[0])} a ${nomeMes(meses.at(-1))}`}${$('#rel-fonte').value ? ` (${nomeFonte($('#rel-fonte').value)})` : ' (todas as contas)'}`,
    '',
    `Renda: ${brl(d.renda)}`,
    `Gastos: ${brl(d.total)}`,
    `${d.renda - d.total >= 0 ? 'Sobrou' : 'Faltou'}: ${brl(Math.abs(d.renda - d.total))}`,
    `Essencial: ${brl(d.ess)} (${pct(d.ess, d.total)}%) · Não essencial: ${brl(d.total - d.ess)} (${pct(d.total - d.ess, d.total)}%)`,
    '',
    ...(() => {
      if ($('#rel-fonte').value) return [];
      const pf = {}; d.gastos.forEach((l) => { const k = fonteDe(l); pf[k] = (pf[k] || 0) + l.valor; });
      const o = Object.entries(pf).sort((x, y) => y[1] - x[1]);
      return o.length > 1 ? ['Por conta e cartão:', ...o.map(([k, v]) => `• ${nomeFonte(k)}: ${brl(v)} (${pct(v, d.total)}%)`), ''] : [];
    })(),
    'Por categoria:',
    ...Object.entries(cats).sort((x, y) => y[1] - x[1]).map(([c, v]) => `• ${c}: ${brl(v)} (${pct(v, d.total)}%)`),
  ];
  try { await navigator.clipboard.writeText(linhas.join('\n')); toast('Relatório copiado! Cole onde quiser.'); }
  catch { toast('Não foi possível copiar'); }
};

// imprimir só faz sentido fora de páginas incorporadas (no site publicado)
try { $('#rel-imprimir').hidden = window.self !== window.top; } catch (e) { /* incorporado */ }
$('#rel-imprimir').onclick = () => window.print();


/* ================= Navegação ================= */

const ABAS_MAIS = ['cartao', 'fixas', 'renda', 'emprestimos', 'nuvem'];
function abrirMais(abrir) {
  $('#menu-mais').hidden = !abrir;
  $('#btn-mais').setAttribute('aria-expanded', String(abrir));
}
function irPara(aba) {
  document.querySelectorAll('nav [data-aba], #menu-mais [data-aba]').forEach((x) => x.classList.toggle('ativa', x.dataset.aba === aba));
  $('#btn-mais').classList.toggle('ativa', ABAS_MAIS.includes(aba));
  document.querySelectorAll('.aba').forEach((s) => { s.hidden = s.id !== 'aba-' + aba; });
  abrirMais(false);
  if (aba === 'relatorio') { esconderDica(); renderRelatorio(); }
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
  formLanc.querySelectorAll('.so-pagto').forEach((el) => { el.hidden = !estado.cartoes.length && !estado.bancos.length; });
}
formLanc.tipo.addEventListener('change', ajustarFormLanc);
formLanc.forma.addEventListener('change', () => { formLanc.forma.dataset.escolhido = '1'; });

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
  const forma = f.forma.value;
  const cartao = forma.startsWith('c:') && cartaoPorId(forma.slice(2));
  if (cartao && !(ehGasto(l) || tipo === 'emp-saiu')) return toast('Cartão só serve para gastos. Escolha uma conta.');
  if (cartao) { l.cartaoId = cartao.id; l.mes = mesDaFatura(cartao, l.data); }
  if (forma.startsWith('b:') && bancoPorId(forma.slice(2))) l.bancoId = forma.slice(2);
  estado.lancamentos.push(l);
  salvar();
  mesAtual = mesDe(l);
  f.descricao.value = ''; f.valor.value = ''; f.essencial.checked = false;
  render(); toast(cartao ? `Adicionado na fatura de ${nomeMes(l.mes).toLowerCase()}` : 'Lançamento adicionado');
});

/* ================= Bancos ================= */

$('#form-banco').addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = e.target.nome.value.trim();
  if (estado.bancos.some((b) => norm(b.nome) === norm(nome))) return toast('Esse banco já está cadastrado');
  acharOuCriarBanco(nome);
  salvar(); e.target.reset(); render(); ajustarFormLanc(); toast('Banco cadastrado');
});

$('#lista-bancos').addEventListener('click', async (e) => {
  const b = bancoPorId(e.target.closest('[data-del-banco]')?.dataset.delBanco);
  if (!b) return;
  if (!await confirmar(`Excluir o banco "${b.nome}"? Os lançamentos continuam, só sem o banco.`, 'Excluir banco')) return;
  estado.bancos = estado.bancos.filter((x) => x !== b);
  [...estado.lancamentos, ...estado.cartoes, ...estado.fixas, ...estado.rendas].forEach((x) => { if (x.bancoId === b.id) delete x.bancoId; });
  salvar(); render(); ajustarFormLanc();
});

/* ================= Cartões ================= */

$('#form-cartao').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  estado.cartoes.push({ id: uid(), nome: f.nome.value.trim(), fechamento: +f.fechamento.value, vencimento: +f.vencimento.value, ...(f.bancoId.value ? { bancoId: f.bancoId.value } : {}) });
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
    categoria: f.categoria.value.trim(), essencial: f.essencial.checked, ...(f.bancoId.value ? { bancoId: f.bancoId.value } : {}),
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
      categoria: fixa.categoria, tipo: 'fixa', essencial: fixa.essencial, fixaId: fixa.id, ...(bancoPorId(fixa.bancoId) ? { bancoId: fixa.bancoId } : {}),
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
  estado.rendas.push({ id: uid(), nome: f.nome.value.trim(), valor, dia: +f.dia.value || null, ...(f.bancoId.value ? { bancoId: f.bancoId.value } : {}) });
  salvar(); f.reset(); render(); toast('Renda cadastrada');
});

$('#tb-rendas').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.dataset.receber || b.dataset.desfazerRenda || b.dataset.delRenda;
  const r = estado.rendas.find((x) => x.id === id);
  if (!r) return;
  if (b.dataset.receber) {
    estado.lancamentos.push({ id: uid(), data: dataNoMes(mesAtual, r.dia), descricao: r.nome, valor: r.valor, tipo: 'renda', rendaId: r.id, ...(bancoPorId(r.bancoId) ? { bancoId: r.bancoId } : {}) });
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
  $('#origem-banco').hidden = cartao;
  const sb = $('#imp-banco');
  sb.innerHTML = '<option value="">conforme a coluna “banco” da planilha</option>' + opcoesBancos(importacao.bancoId) + '<option value="__novo">+ outro banco…</option>';
  sb.value = importacao.bancoId === '__novo' || bancoPorId(importacao.bancoId) ? importacao.bancoId : '';
  $('#imp-banco-novo').hidden = sb.value !== '__novo';
  $('#nome-doc').textContent = cartao ? 'a fatura do cartão (PDF ou print)' : 'seu extrato bancário (ou os extratos de todos os bancos de uma vez)';
  $('#prompt-ia').textContent = cartao ? PROMPT_CARTAO : PROMPT_CONTA;
}
document.querySelectorAll('input[name=origem]').forEach((r) => r.addEventListener('change', () => {
  importacao.origem = r.value; renderOrigemImportacao();
}));
$('#imp-cartao').onchange = (e) => { importacao.cartaoId = e.target.value; };
$('#imp-mes').onchange = (e) => { importacao.mes = e.target.value; };
$('#imp-banco').onchange = (e) => {
  importacao.bancoId = e.target.value;
  $('#imp-banco-novo').hidden = e.target.value !== '__novo';
  if (e.target.value === '__novo') $('#imp-banco-novo').focus();
};

const MODELO_CSV = `${CABECALHO}
05/11/2026;Aluguel;1500,00;fixa;Moradia;sim;;;Itaú
05/11/2026;Salário Empresa X;4200,00;renda;;;;;Itaú
07/11/2026;Supermercado Extra;312,45;flexivel;Mercado;sim;;;Itaú
12/11/2026;Pix para Maria Souza;200,00;emprestimo-saiu;;;Maria Souza;;Nubank
25/11/2026;Pix de Maria Souza;200,00;emprestimo-entrou;;;Maria Souza;;Nubank
10/11/2026;Pagamento fatura Nubank;980,00;fatura;;;;;Nubank
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
    `${d(1)};Salário Empresa Exemplo;4200,00;renda;;;;;Itaú`,
    `${d(5)};Aluguel;1500,00;fixa;Moradia;sim;;;Itaú`,
    `${d(6)};Enel Energia;187,30;fixa;Contas da casa;sim;;;Itaú`,
    `${d(7)};Supermercado Pão de Açúcar;342,18;flexivel;Mercado;sim;;;Nubank`,
    `${d(8)};iFood;64,90;flexivel;Restaurante/Delivery;nao;;;Nubank`,
    `${d(9)};Pix para Maria Souza;300,00;emprestimo-saiu;;;Maria Souza;;Inter`,
    `${d(10)};Pagamento fatura Nubank;1120,45;fatura;;;;;Itaú`,
    `${d(12)};Drogasil;48,70;flexivel;Saúde;;;;Inter`,
    `${d(14)};Uber;23,40;flexivel;Transporte;;;;Nubank`,
    `${d(15)};Pix de João Lima;150,00;emprestimo-entrou;;;;;Inter`,
    `${d(20)};Pix de Maria Souza;100,00;emprestimo-entrou;;;Maria Souza;;Inter`,
    `${d(22)};Cinema;56,00;flexivel;Lazer;nao;;;Nubank`,
  ].join('\n');
}

const temExemplos = () => ['lancamentos', 'fixas', 'rendas', 'cartoes', 'bancos'].some((k) => estado[k].some((x) => x.exemplo));

$('#ver-exemplo').onclick = () => {
  // cadastros de exemplo, para a revisão mostrar os vínculos (conta fixa, renda, cartão)
  if (!estado.fixas.some((f) => norm(f.nome) === 'aluguel')) {
    estado.fixas.push({ id: uid(), nome: 'Aluguel', valor: 1500, dia: 5, categoria: 'Moradia', essencial: true, exemplo: true });
  }
  if (!estado.rendas.length) estado.rendas.push({ id: uid(), nome: 'Salário', valor: 4200, dia: 1, exemplo: true });
  if (!estado.cartoes.length) estado.cartoes.push({ id: uid(), nome: 'Nubank', fechamento: 3, vencimento: 10, exemplo: true });
  salvar(); render();
  importacao.origem = 'conta'; importacao.exemplo = true; importacao.bancoId = '';
  document.querySelector('input[name=origem][value=conta]').checked = true;
  renderOrigemImportacao();
  iniciarRevisao(csvExemplo());
};

$('#apagar-exemplos').onclick = async () => {
  if (!await confirmar('Apagar todos os dados de exemplo? Seus dados de verdade continuam.', 'Apagar exemplos')) return;
  const ids = new Set([...estado.fixas, ...estado.rendas, ...estado.cartoes, ...estado.bancos].filter((x) => x.exemplo).map((x) => x.id));
  estado.lancamentos = estado.lancamentos.filter((l) => !l.exemplo);
  estado.fixas = estado.fixas.filter((x) => !x.exemplo);
  estado.rendas = estado.rendas.filter((x) => !x.exemplo);
  estado.cartoes = estado.cartoes.filter((x) => !x.exemplo);
  estado.bancos = estado.bancos.filter((x) => !x.exemplo);
  estado.lancamentos.forEach((l) => { ['fixaId', 'rendaId', 'cartaoId', 'bancoId'].forEach((k) => { if (ids.has(l[k])) delete l[k]; }); });
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
  let bancoPadrao = '';
  if (importacao.origem === 'conta') {
    bancoPadrao = $('#imp-banco').value;
    if (bancoPadrao === '__novo') {
      const nome = $('#imp-banco-novo').value.trim();
      if (!nome) throw new Error('Escreva o nome do banco do extrato.');
      bancoPadrao = acharOuCriarBanco(nome, importacao.exemplo);
      importacao.bancoId = bancoPadrao; $('#imp-banco-novo').value = '';
    }
  }
  const linhas = parseCSV(texto);
  if (linhas.length < 2) throw new Error('O arquivo está vazio ou só tem o cabeçalho.');
  const cab = linhas[0].map(norm);
  const col = (...nomes) => cab.findIndex((c) => nomes.some((n) => c.startsWith(n)));
  const ix = {
    data: col('data'), desc: col('descri', 'historico', 'estabelecimento'), valor: col('valor'),
    cat: col('categ'), tipo: col('tipo'), ess: col('essencial'), pessoa: col('pessoa', 'nome'), parcela: col('parcela'), banco: col('banco', 'conta', 'instituicao'),
  };
  if (ix.data < 0 || ix.desc < 0 || ix.valor < 0) {
    throw new Error('Não encontrei as colunas "data", "descricao" e "valor". Use o modelo de planilha.');
  }
  // duplicados: mesma data, valor e descrição na mesma conta (ou em lançamento sem conta informada)
  const base = (l) => `${l.data}|${l.valor}|${norm(l.descricao)}`;
  const comConta = new Set(estado.lancamentos.map((l) => `${base(l)}|${fonteDe(l)}`));
  const semConta = new Set(estado.lancamentos.filter((l) => !fonteDe(l)).map(base));
  const todos = new Set(estado.lancamentos.map(base));
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
      bancoId: doCartao ? '' : (get(ix.banco) ? acharOuCriarBanco(get(ix.banco), importacao.exemplo) : bancoPadrao),
    };
    sugerirVinculos(r);
    if (!r.data) r.avisos.push('data inválida');
    if (!r.valor) r.avisos.push('valor inválido');
    const fonte = doCartao ? 'c:' + importacao.cartaoId : (r.bancoId ? 'b:' + r.bancoId : '');
    const b0 = `${r.data}|${r.valor}|${norm(descricao)}`;
    const dup = fonte ? (comConta.has(`${b0}|${fonte}`) || semConta.has(b0)) : todos.has(b0);
    if (dup) r.avisos.push('já lançado antes?');
    r.incluir = !dup && !!r.data && !!r.valor;
    return r;
  });

  erroImportacao('');
  salvar(); render(); // bancos novos vindos da planilha
  $('#rev-titulo').textContent = doCartao
    ? `Revisão — fatura ${cartaoPorId(importacao.cartaoId).nome} (${nomeMes(importacao.mes).toLowerCase()})`
    : `Revisão — extrato${bancoPorId(bancoPadrao) ? ` do ${bancoPorId(bancoPadrao).nome}` : 's'}`;
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
        ${importacao.origem === 'conta' && estado.bancos.length ? `<select data-f="bancoId" class="vinculo banco-sel" aria-label="Banco">
          <option value="">🏦 banco não informado</option>${estado.bancos.map((b) => `<option value="${b.id}" ${r.bancoId === b.id ? 'selected' : ''}>🏦 ${esc(b.nome)}</option>`).join('')}
        </select>` : ''}
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
    else if (bancoPorId(r.bancoId)) l.bancoId = r.bancoId;
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

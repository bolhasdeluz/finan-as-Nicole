'use strict';

/* ================= Dados ================= */

const CHAVE = 'financas-nicole-v1';
const CATEGORIAS_PADRAO = [
  'Moradia', 'Contas da casa', 'Mercado', 'Restaurante/Delivery', 'Transporte', 'Saúde',
  'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Cuidados pessoais', 'Pets', 'Presentes',
  'Impostos/Taxas', 'Outros',
];

const PROMPT_IA = `Anexei meu extrato bancário e um modelo de planilha (modelo-importacao.csv).
Preencha o modelo com os GASTOS (saídas) do extrato, seguindo estas regras:

- Mantenha exatamente o cabeçalho: data;descricao;valor;categoria;tipo;essencial
- Separador: ponto e vírgula (;)
- data: formato DD/MM/AAAA
- descricao: nome do estabelecimento/pagamento, curto e legível
- valor: número positivo com vírgula decimal, sem "R$" (ex.: 1234,56)
- categoria: use uma destas: ${CATEGORIAS_PADRAO.join(', ')}
- tipo: "fixa" para contas que se repetem todo mês (aluguel, condomínio, luz, água, internet, celular, escola, plano de saúde, assinaturas); "flexivel" para o resto
- essencial: "sim" se for necessidade (moradia, contas, mercado, saúde, transporte para trabalho); "nao" se for supérfluo (delivery, lazer, compras por impulso)
- NÃO inclua entradas (salário, Pix recebido, estornos) nem transferências entre contas da mesma pessoa
- Apague as linhas de exemplo do modelo

Devolva apenas o arquivo .csv preenchido, pronto para download.`;

function estadoVazio() {
  return { lancamentos: [], fixas: [], memoria: {} };
}

function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE));
    if (s && Array.isArray(s.lancamentos) && Array.isArray(s.fixas)) {
      return { ...estadoVazio(), ...s };
    }
  } catch (e) { /* ignora */ }
  return estadoVazio();
}

let estado = carregar();
function salvar() { localStorage.setItem(CHAVE, JSON.stringify(estado)); }

const hoje = new Date();
let mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`; // AAAA-MM
let revisao = []; // linhas em revisão na importação

/* ================= Utilidades ================= */

const $ = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dataBR = (iso) => iso ? iso.split('-').reverse().join('/') : '';

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

const parseTipo = (txt) => (norm(txt).startsWith('fix') ? 'fixa' : 'flexivel');

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

const doMes = (mes) => estado.lancamentos.filter((l) => l.data.startsWith(mes));
const pagamentoDaFixa = (fixaId, mes) => doMes(mes).find((l) => l.fixaId === fixaId);

/** acha conta fixa cadastrada cujo nome aparece na descrição (ou vice-versa) */
function sugerirFixa(descricao) {
  const d = norm(descricao);
  return estado.fixas.find((f) => { const n = norm(f.nome); return n && (d.includes(n) || n.includes(d)); });
}

/* ================= Render ================= */

function render() {
  const [a, m] = mesAtual.split('-');
  const rotulo = new Date(+a, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  $('#mes-label').textContent = rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
  $('#lista-categorias').innerHTML = categorias().map((c) => `<option value="${esc(c)}">`).join('');
  renderResumo(); renderLancamentos(); renderFixas();
}

function renderResumo() {
  const ls = doMes(mesAtual);
  const soma = (arr) => arr.reduce((t, l) => t + l.valor, 0);
  const total = soma(ls);
  const ess = soma(ls.filter((l) => l.essencial));
  const aPagar = estado.fixas.filter((f) => !pagamentoDaFixa(f.id, mesAtual)).reduce((t, f) => t + f.valor, 0);

  $('#r-total').textContent = brl(total);
  $('#r-fixas').textContent = brl(soma(ls.filter((l) => l.tipo === 'fixa')));
  $('#r-flex').textContent = brl(soma(ls.filter((l) => l.tipo !== 'fixa')));
  $('#r-apagar').textContent = brl(aPagar);
  $('#r-ess').textContent = brl(ess);
  $('#r-nao').textContent = brl(total - ess);
  $('#r-barra-ess').style.width = total ? `${(ess / total) * 100}%` : '0';

  const porCat = {};
  ls.forEach((l) => { porCat[l.categoria] = (porCat[l.categoria] || 0) + l.valor; });
  const itens = Object.entries(porCat).sort((x, y) => y[1] - x[1]);
  $('#r-categorias').innerHTML = itens.length
    ? itens.map(([c, v]) => `<li><span>${esc(c)}</span><b>${brl(v)}</b>
        <div class="mini-barra"><div style="width:${(v / itens[0][1]) * 100}%"></div></div></li>`).join('')
    : '<li class="vazio">Sem gastos neste mês.</li>';
}

function renderLancamentos() {
  const ls = doMes(mesAtual).sort((x, y) => y.data.localeCompare(x.data));
  $('#lanc-vazio').hidden = ls.length > 0;
  $('#tb-lanc').innerHTML = ls.map((l) => `
    <tr>
      <td>${dataBR(l.data)}</td>
      <td>${esc(l.descricao)}</td>
      <td>${esc(l.categoria)}</td>
      <td>${l.tipo === 'fixa' ? 'Fixa' : 'Flexível'}</td>
      <td><button class="mini sec" data-toggle-ess="${l.id}" title="Clique para alternar">
        <span class="tag ${l.essencial ? 'ess' : 'nao'}">${l.essencial ? 'Essencial' : 'Não essencial'}</span></button></td>
      <td class="num">${brl(l.valor)}</td>
      <td><button class="del" data-del-lanc="${l.id}" title="Excluir">✕</button></td>
    </tr>`).join('');
}

function renderFixas() {
  $('#fixas-vazio').hidden = estado.fixas.length > 0;
  const fx = [...estado.fixas].sort((x, y) => (x.dia || 99) - (y.dia || 99));
  $('#tb-fixas').innerHTML = fx.map((f) => {
    const p = pagamentoDaFixa(f.id, mesAtual);
    return `<tr>
      <td>${esc(f.nome)}</td>
      <td>${f.dia ? 'dia ' + f.dia : '—'}</td>
      <td>${esc(f.categoria)}</td>
      <td class="num">${brl(f.valor)}</td>
      <td class="num">${p ? brl(p.valor) : '—'}</td>
      <td>${p
        ? `<span class="tag pago">Paga</span> <button class="mini sec" data-desfazer="${f.id}">desfazer</button>`
        : `<span class="tag pendente">Pendente</span> <button class="mini" data-pagar="${f.id}">marcar paga</button>`}</td>
      <td><button class="del" data-del-fixa="${f.id}" title="Excluir conta fixa">✕</button></td>
    </tr>`;
  }).join('');
}

/* ================= Ações: navegação ================= */

document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('ativa', x === b));
  document.querySelectorAll('.aba').forEach((s) => { s.hidden = s.id !== 'aba-' + b.dataset.aba; });
}));

function mudarMes(delta) {
  const [a, m] = mesAtual.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  mesAtual = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  render();
}
$('#mes-ant').onclick = () => mudarMes(-1);
$('#mes-prox').onclick = () => mudarMes(1);

/* ================= Ações: lançamentos manuais ================= */

$('#form-lanc').data.value = new Date().toISOString().slice(0, 10);
$('#form-lanc').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const valor = parseValor(f.valor.value);
  if (!valor) return toast('Valor inválido');
  estado.lancamentos.push({
    id: uid(), data: f.data.value, descricao: f.descricao.value.trim(), valor,
    categoria: f.categoria.value.trim(), tipo: f.tipo.value, essencial: f.essencial.checked,
  });
  salvar();
  mesAtual = f.data.value.slice(0, 7);
  f.descricao.value = ''; f.valor.value = ''; f.essencial.checked = false;
  render(); toast('Lançamento adicionado');
});

$('#tb-lanc').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-lanc]');
  const tog = e.target.closest('[data-toggle-ess]');
  if (del && confirm('Excluir este lançamento?')) {
    estado.lancamentos = estado.lancamentos.filter((l) => l.id !== del.dataset.delLanc);
  } else if (tog) {
    const l = estado.lancamentos.find((x) => x.id === tog.dataset.toggleEss);
    l.essencial = !l.essencial;
  } else return;
  salvar(); render();
});

/* ================= Ações: contas fixas ================= */

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

$('#tb-fixas').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.dataset.pagar || b.dataset.desfazer || b.dataset.delFixa;
  const fixa = estado.fixas.find((f) => f.id === id);
  if (b.dataset.pagar) {
    const [a, m] = mesAtual.split('-').map(Number);
    const ultimoDia = new Date(a, m, 0).getDate();
    const dia = String(Math.min(fixa.dia || 1, ultimoDia)).padStart(2, '0');
    estado.lancamentos.push({
      id: uid(), data: `${mesAtual}-${dia}`, descricao: fixa.nome, valor: fixa.valor,
      categoria: fixa.categoria, tipo: 'fixa', essencial: fixa.essencial, fixaId: fixa.id,
    });
  } else if (b.dataset.desfazer) {
    const p = pagamentoDaFixa(id, mesAtual);
    estado.lancamentos = estado.lancamentos.filter((l) => l !== p);
  } else if (b.dataset.delFixa) {
    if (!confirm(`Excluir a conta fixa "${fixa.nome}"? (Os lançamentos já feitos continuam.)`)) return;
    estado.fixas = estado.fixas.filter((f) => f.id !== id);
    estado.lancamentos.forEach((l) => { if (l.fixaId === id) delete l.fixaId; });
  }
  salvar(); render();
});

/* ================= Importação + revisão ================= */

$('#prompt-ia').textContent = PROMPT_IA;
$('#copiar-prompt').onclick = async () => {
  try { await navigator.clipboard.writeText(PROMPT_IA); toast('Pedido copiado!'); }
  catch { toast('Não foi possível copiar — selecione o texto manualmente'); }
};

function erroImportacao(msg) { const p = $('#imp-erro'); p.textContent = msg; p.hidden = !msg; }

$('#arquivo').addEventListener('change', async (e) => {
  const arq = e.target.files[0]; e.target.value = '';
  if (!arq) return;
  let texto = await arq.text();
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(await arq.arrayBuffer());
  try { iniciarRevisao(texto); } catch (err) { erroImportacao(err.message); }
});

function iniciarRevisao(texto) {
  const linhas = parseCSV(texto);
  if (linhas.length < 2) throw new Error('O arquivo está vazio ou só tem o cabeçalho.');
  const cab = linhas[0].map(norm);
  const col = (...nomes) => cab.findIndex((c) => nomes.some((n) => c.startsWith(n)));
  const ix = {
    data: col('data'), desc: col('descri', 'historico', 'estabelecimento'), valor: col('valor'),
    cat: col('categ'), tipo: col('tipo'), ess: col('essencial'),
  };
  if (ix.data < 0 || ix.desc < 0 || ix.valor < 0) {
    throw new Error('Não encontrei as colunas "data", "descricao" e "valor". Use o modelo de planilha.');
  }
  const existentes = new Set(estado.lancamentos.map((l) => `${l.data}|${l.valor}|${norm(l.descricao)}`));

  revisao = linhas.slice(1).map((c) => {
    const get = (i) => (i >= 0 ? (c[i] || '').trim() : '');
    const descricao = get(ix.desc);
    const mem = estado.memoria[norm(descricao)] || {};
    const tipo = ix.tipo >= 0 && get(ix.tipo) ? parseTipo(get(ix.tipo)) : (mem.tipo || 'flexivel');
    const ess = parseEssencial(get(ix.ess));
    const r = {
      id: uid(), data: parseData(get(ix.data)), descricao, valor: parseValor(get(ix.valor)),
      categoria: get(ix.cat) || mem.categoria || '', tipo,
      essencial: ess !== null ? ess : (mem.essencial ?? null), fixaId: '', avisos: [],
    };
    if (tipo === 'fixa') r.fixaId = sugerirFixa(descricao)?.id || '';
    if (!r.data) r.avisos.push('data inválida');
    if (!r.valor) r.avisos.push('valor inválido');
    const dup = existentes.has(`${r.data}|${r.valor}|${norm(descricao)}`);
    if (dup) r.avisos.push('já lançado antes?');
    r.incluir = !dup && !!r.data && !!r.valor;
    return r;
  });

  erroImportacao('');
  $('#imp-inicio').hidden = true; $('#imp-revisao').hidden = false;
  renderRevisao();
}

function renderRevisao() {
  const optCats = categorias().map((c) => `<option value="${esc(c)}">`).join('');
  $('#lista-categorias').innerHTML = optCats;
  $('#tb-revisao').innerHTML = revisao.map((r, i) => `
    <tr data-i="${i}" class="${r.incluir ? '' : 'off'}">
      <td><input type="checkbox" data-f="incluir" ${r.incluir ? 'checked' : ''}></td>
      <td><input type="date" data-f="data" value="${r.data}"></td>
      <td class="desc"><input data-f="descricao" value="${esc(r.descricao)}">
        ${r.avisos.length ? `<span class="aviso">⚠ ${r.avisos.join(' · ')}</span>` : ''}</td>
      <td class="num"><input data-f="valor" value="${r.valor ? r.valor.toFixed(2).replace('.', ',') : ''}" inputmode="decimal" style="width:90px;text-align:right"></td>
      <td class="cat"><input data-f="categoria" list="lista-categorias" value="${esc(r.categoria)}" placeholder="Escolha…"></td>
      <td>
        <select data-f="tipo"><option value="flexivel" ${r.tipo !== 'fixa' ? 'selected' : ''}>Flexível</option>
          <option value="fixa" ${r.tipo === 'fixa' ? 'selected' : ''}>Fixa</option></select>
        ${r.tipo === 'fixa' && estado.fixas.length ? `<select data-f="fixaId" title="Vincular a uma conta fixa cadastrada" style="margin-top:4px">
          <option value="">— não vincular —</option>
          ${estado.fixas.map((f) => `<option value="${f.id}" ${r.fixaId === f.id ? 'selected' : ''}>↳ ${esc(f.nome)}</option>`).join('')}
        </select>` : ''}
      </td>
      <td><div class="toggle ${r.essencial === null ? 'vazio-sel' : ''}">
        <button type="button" data-ess="1" class="sim ${r.essencial === true ? 'on' : ''}">Sim</button>
        <button type="button" data-ess="0" class="nao ${r.essencial === false ? 'on' : ''}">Não</button>
      </div></td>
    </tr>`).join('');
  atualizarResumoRevisao();
}

function atualizarResumoRevisao() {
  const inc = revisao.filter((r) => r.incluir);
  const total = inc.reduce((t, r) => t + (r.valor || 0), 0);
  const pend = inc.filter((r) => r.essencial === null).length;
  $('#rev-resumo').innerHTML = `${inc.length} de ${revisao.length} linhas selecionadas · total ${brl(total)}`
    + (pend ? ` · <b class="erro">${pend} sem marcar essencial/não</b>` : '');
}

$('#tb-revisao').addEventListener('input', (e) => {
  const tr = e.target.closest('tr'); const r = revisao[tr.dataset.i]; const f = e.target.dataset.f;
  if (!f) return;
  if (f === 'incluir') { r.incluir = e.target.checked; tr.classList.toggle('off', !r.incluir); }
  else if (f === 'valor') r.valor = parseValor(e.target.value);
  else if (f === 'tipo') {
    r.tipo = e.target.value;
    r.fixaId = r.tipo === 'fixa' ? (sugerirFixa(r.descricao)?.id || '') : '';
    renderRevisao(); return;
  } else r[f] = e.target.value;
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

$('#todos-ess').onclick = () => { revisao.forEach((r) => { r.essencial = true; }); renderRevisao(); };
$('#todos-nao').onclick = () => { revisao.forEach((r) => { r.essencial = false; }); renderRevisao(); };

function fecharRevisao() { revisao = []; $('#imp-inicio').hidden = false; $('#imp-revisao').hidden = true; }
$('#cancelar-imp').onclick = fecharRevisao;

$('#confirmar-imp').onclick = () => {
  const inc = revisao.filter((r) => r.incluir);
  if (!inc.length) return toast('Nenhuma linha selecionada');
  const problema = inc.find((r) => !r.data || !r.valor || !r.descricao.trim() || !r.categoria.trim() || r.essencial === null);
  if (problema) {
    const tr = $(`#tb-revisao tr[data-i="${revisao.indexOf(problema)}"]`);
    tr.scrollIntoView({ block: 'center' }); tr.style.outline = '2px solid var(--erro)';
    setTimeout(() => { tr.style.outline = ''; }, 2000);
    return toast('Complete data, valor, descrição, categoria e essencial em todas as linhas selecionadas');
  }
  inc.forEach((r) => {
    // se a conta fixa já foi paga neste mês, não vincula de novo
    const fixaId = r.tipo === 'fixa' && r.fixaId && !pagamentoDaFixa(r.fixaId, r.data.slice(0, 7)) ? r.fixaId : undefined;
    estado.lancamentos.push({
      id: uid(), data: r.data, descricao: r.descricao.trim(), valor: r.valor, categoria: r.categoria.trim(),
      tipo: r.tipo, essencial: r.essencial, ...(fixaId ? { fixaId } : {}),
    });
    estado.memoria[norm(r.descricao)] = { categoria: r.categoria.trim(), tipo: r.tipo, essencial: r.essencial };
  });
  salvar();
  // vai para o mês com mais lançamentos importados
  const cont = {}; inc.forEach((r) => { const m = r.data.slice(0, 7); cont[m] = (cont[m] || 0) + 1; });
  mesAtual = Object.entries(cont).sort((x, y) => y[1] - x[1])[0][0];
  fecharRevisao(); render();
  document.querySelector('nav button[data-aba="resumo"]').click();
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
    if (!confirm('Substituir todos os dados atuais pelo backup?')) return;
    estado = { ...estadoVazio(), ...s }; salvar(); render(); toast('Backup restaurado');
  } catch { toast('Arquivo de backup inválido'); }
});

render();

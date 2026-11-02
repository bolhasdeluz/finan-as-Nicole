# Finanças da Nicole

App super simples de controle de gastos mensais. Roda direto no navegador, sem instalar nada:
basta abrir o `index.html`. Os dados ficam salvos no próprio navegador (use **Fazer backup** no
rodapé de vez em quando).

## O que tem

- **Resumo do mês**: renda, gastos, sobra prevista, contas fixas × flexíveis, quanto foi no
  cartão, fixas que faltam pagar, essencial × não essencial, gastos por categoria e empréstimos
  em aberto.
- **Lançamentos**: adicionar manualmente gastos, renda ou empréstimos. Gastos podem ser pagos na
  conta ou num cartão (entram automaticamente na fatura certa, pelo dia de fechamento).
- **Cartão**: cadastre seus cartões (dia de fechamento e vencimento). Cada mês mostra a fatura
  que vence nele, com as compras, parcelas e status (em aberto/paga). Botão **Importar fatura**.
- **Contas fixas**: contas que se repetem todo mês (aluguel, internet…), marcadas como pagas a
  cada mês.
- **Renda**: cadastre sua renda fixa (salário etc.) e marque quando receber; entradas avulsas
  aparecem aqui também.
- **Empréstimos**: o dinheiro que vai e volta. Mostra, por pessoa, quanto ela te deve ou quanto
  você deve. Não conta como gasto nem como renda.
- **Importar**: extrato da conta ou fatura do cartão preenchidos pela IA, com **tela de revisão**.

### Como o app conta

- Compras no cartão contam como gasto no mês em que a fatura **vence**.
- O pagamento da fatura que aparece no extrato (tipo `fatura`) **não** é contado de novo como
  gasto; só marca a fatura como paga.
- Empréstimos (`emprestimo-saiu` / `emprestimo-entrou`) ficam fora de gastos e renda. Uma compra
  no cartão feita para outra pessoa também pode ser marcada como empréstimo.

## Como importar o extrato

1. Na aba **Importar**, escolha se é **extrato da conta** ou **fatura do cartão** (nesse caso,
   escolha o cartão e o mês de vencimento) e baixe o modelo `modelo-importacao.csv`.
2. No chat da IA, anexe o extrato do banco + o modelo e cole o pedido (botão **Copiar pedido**;
   o texto também está em [`PROMPT-IA.md`](PROMPT-IA.md)).
3. Selecione o CSV devolvido pela IA. A tela de revisão abre:
   - dá para trocar o tipo de cada linha (gasto fixo/flexível, renda, empréstimo, fatura);
   - gastos sem essencial/não marcado e empréstimos sem nome da pessoa ficam em vermelho;
   - linhas que parecem já ter sido importadas antes vêm desmarcadas (⚠ já lançado antes?);
   - gastos "fixa" são vinculados à conta fixa de mesmo nome (fica **Paga** no mês); entradas de
     renda podem ser vinculadas à renda fixa (fica **Recebida**); pagamento de fatura, ao cartão.
4. **Salvar lançamentos.** O app lembra a categoria/tipo/essencial de cada descrição para as
   próximas importações (usado quando a IA deixa a coluna em branco).

### Formato da planilha

| coluna | exemplo | observação |
|---|---|---|
| data | 05/11/2026 | também aceita 2026-11-05 |
| descricao | Supermercado Extra | |
| valor | 312,45 | sempre positivo; aceita `1.234,56`, `1234.56`, `R$ -50,00` |
| tipo | fixa | `fixa`, `flexivel`, `renda`, `emprestimo-saiu`, `emprestimo-entrou`, `fatura` |
| categoria | Mercado | só para gastos; livre, pode criar novas |
| essencial | sim / nao | só para gastos; em branco = decidir na revisão |
| pessoa | Maria Souza | só para empréstimos |
| parcela | 3/10 | só para compras parceladas no cartão |

Separador `;` (também aceita `,` ou TAB). A ordem das colunas não importa, só os nomes.

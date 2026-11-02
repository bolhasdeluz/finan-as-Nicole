# Finanças da Nicole

App super simples de controle de gastos mensais. Roda direto no navegador, sem instalar nada:
basta abrir o `index.html`. Os dados ficam salvos no próprio navegador (use **Fazer backup** no
rodapé de vez em quando).

## O que tem

- **Resumo do mês**: total gasto, contas fixas × flexíveis, fixas que ainda faltam pagar,
  essencial × não essencial e gastos por categoria.
- **Lançamentos**: adicionar gastos manualmente (data, descrição, valor, categoria, tipo, essencial).
  Clique na etiqueta "Essencial/Não essencial" para alternar.
- **Contas fixas**: cadastre as contas que se repetem todo mês (aluguel, internet…) e marque como
  paga a cada mês.
- **Importar**: importa o extrato preenchido pela IA e abre uma **tela de revisão** onde dá para
  ajustar categoria, tipo, vincular a uma conta fixa e marcar o que foi essencial ou não.

## Como importar o extrato

1. Na aba **Importar**, baixe o modelo `modelo-importacao.csv`.
2. No chat da IA, anexe o extrato do banco + o modelo e cole o pedido (botão **Copiar pedido**;
   o texto também está em [`PROMPT-IA.md`](PROMPT-IA.md)).
3. Selecione o CSV devolvido pela IA. A tela de revisão abre:
   - linhas sem essencial/não marcado ficam com borda vermelha e precisam ser marcadas;
   - linhas que parecem já ter sido importadas antes vêm desmarcadas (⚠ já lançado antes?);
   - gastos do tipo "fixa" são vinculados automaticamente à conta fixa de mesmo nome, que passa
     a aparecer como **Paga** naquele mês.
4. **Salvar lançamentos.** O app lembra a categoria/tipo/essencial de cada descrição para as
   próximas importações (usado quando a IA deixa a coluna em branco).

### Formato da planilha

| coluna | exemplo | observação |
|---|---|---|
| data | 05/11/2026 | também aceita 2026-11-05 |
| descricao | Supermercado Extra | |
| valor | 312,45 | aceita `1.234,56`, `1234.56`, `R$ -50,00` (sempre vira positivo) |
| categoria | Mercado | livre; pode criar novas |
| tipo | fixa / flexivel | |
| essencial | sim / nao | em branco = decidir na revisão |

Separador `;` (também aceita `,` ou TAB).

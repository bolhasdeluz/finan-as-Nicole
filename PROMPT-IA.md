# Pedidos para a IA preencher a planilha

O app tem um botão **Copiar pedido** na aba **Importar** com estes mesmos textos.

1. Abra o chat da IA (ChatGPT, Claude, Gemini…).
2. Anexe **o extrato da conta** ou **a fatura do cartão** (PDF, CSV, print…) **e** o arquivo `modelo-importacao.csv`.
3. Cole o pedido correspondente abaixo e envie.
4. Baixe o CSV que a IA devolver e importe no app (aba **Importar**). Para fatura, escolha
   "Fatura do cartão", o cartão e o mês de vencimento antes de selecionar o arquivo.

Não precisa ficar perfeito: na tela de revisão você ajusta tipo, categoria, pessoa e o que foi
essencial antes de salvar.

## Extrato da conta

```
Anexei meu extrato bancário e um modelo de planilha (modelo-importacao.csv).
Preencha o modelo com as movimentações do extrato, uma por linha, seguindo estas regras:

- Mantenha exatamente o cabeçalho: data;descricao;valor;tipo;categoria;essencial;pessoa;parcela
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
- categoria (só para fixa e flexivel): use uma destas: Moradia, Contas da casa, Mercado, Restaurante/Delivery, Transporte, Saúde, Educação, Lazer, Compras, Assinaturas, Cuidados pessoais, Pets, Presentes, Impostos/Taxas, Outros
- essencial (só para fixa e flexivel): "sim" se for necessidade (moradia, contas, mercado, saúde, transporte para trabalho); "nao" se for supérfluo (delivery, lazer, compras por impulso)
- parcela: deixe em branco
- NÃO inclua transferências entre contas minhas nem aplicações/resgates de investimento
- Apague as linhas de exemplo do modelo

Devolva apenas o arquivo .csv preenchido, pronto para download.
```

## Fatura do cartão

```
Anexei a fatura do meu cartão de crédito e um modelo de planilha (modelo-importacao.csv).
Preencha o modelo com as COMPRAS da fatura, uma por linha, seguindo estas regras:

- Mantenha exatamente o cabeçalho: data;descricao;valor;tipo;categoria;essencial;pessoa;parcela
- Separador: ponto e vírgula (;). data no formato DD/MM/AAAA (data da compra)
- valor: SEMPRE positivo, com vírgula decimal, sem "R$" (ex.: 1234,56)
- descricao: nome do estabelecimento, curto e legível
- tipo, escolha um:
  • fixa: cobrança que se repete todo mês (assinaturas, streaming, academia, seguro)
  • flexivel: as demais compras
  • emprestimo-saiu: compra que fiz para outra pessoa e que ela vai me pagar de volta (na dúvida, use flexivel)
- pessoa: nome da pessoa, só nas linhas de emprestimo-saiu
- categoria (só para fixa e flexivel): use uma destas: Moradia, Contas da casa, Mercado, Restaurante/Delivery, Transporte, Saúde, Educação, Lazer, Compras, Assinaturas, Cuidados pessoais, Pets, Presentes, Impostos/Taxas, Outros
- essencial (só para fixa e flexivel): "sim" se for necessidade (moradia, contas, mercado, saúde, transporte para trabalho); "nao" se for supérfluo (delivery, lazer, compras por impulso)
- parcela: se a compra for parcelada, a parcela atual no formato 3/10; senão deixe em branco
- Inclua juros, IOF, multa e anuidade com a categoria Impostos/Taxas
- NÃO inclua o pagamento da fatura anterior nem créditos/estornos (se houver estorno, remova também a compra estornada)
- Apague as linhas de exemplo do modelo

Devolva apenas o arquivo .csv preenchido, pronto para download.
```

# Prompt para a IA preencher a planilha

1. Abra o chat da IA (ChatGPT, Claude, Gemini…).
2. Anexe **o seu extrato bancário** (PDF, CSV, print…) **e** o arquivo `modelo-importacao.csv`.
3. Cole o texto abaixo e envie.
4. Baixe o CSV que a IA devolver e importe no app (aba **Importar**).

---

```
Anexei meu extrato bancário e um modelo de planilha (modelo-importacao.csv).
Preencha o modelo com os GASTOS (saídas) do extrato, seguindo estas regras:

- Mantenha exatamente o cabeçalho: data;descricao;valor;categoria;tipo;essencial
- Separador: ponto e vírgula (;)
- data: formato DD/MM/AAAA
- descricao: nome do estabelecimento/pagamento, curto e legível
- valor: número positivo com vírgula decimal, sem "R$" (ex.: 1234,56)
- categoria: use uma destas: Moradia, Contas da casa, Mercado, Restaurante/Delivery,
  Transporte, Saúde, Educação, Lazer, Compras, Assinaturas, Cuidados pessoais,
  Pets, Presentes, Impostos/Taxas, Outros
- tipo: "fixa" para contas que se repetem todo mês (aluguel, condomínio, luz, água,
  internet, celular, escola, plano de saúde, assinaturas); "flexivel" para o resto
- essencial: "sim" se for necessidade (moradia, contas, mercado, saúde, transporte
  para trabalho); "nao" se for supérfluo (delivery, lazer, compras por impulso)
- NÃO inclua entradas (salário, Pix recebido, estornos) nem transferências entre
  contas da mesma pessoa
- Apague as linhas de exemplo do modelo

Devolva apenas o arquivo .csv preenchido, pronto para download.
```

Não precisa ficar perfeito: na tela de revisão do app você ajusta categorias,
tipo e o que foi essencial antes de salvar.

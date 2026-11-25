# Locações › Reajustes › Histórico: CRUD na coluna Ações

## Pedido (25/11/2026, literal)

> aba reajuste > coluna acoes: falou CRUD.

## Decisões do usuário (25/11/2026)

1. **Excluir = desfazer e marcar.** O aluguel, a data-base e o próximo reajuste do
   contrato voltam ao que eram, e as parcelas **em aberto** voltam ao valor de antes
   (parcelas pagas não mudam). A linha fica no histórico, marcada "Desfeito por X em data".
   Só vale para a **última** decisão de cada contrato.
2. **Ações:**
   - **Ver** abre uma gaveta com os detalhes e um link para a negociação.
   - **Editar** abre a gaveta de reajuste preenchida com a decisão. Salvar desfaz a
     anterior e grava a nova.
   - **Excluir** desfaz a decisão, como no item 1.

   Editar e Excluir ficam desligados, com o motivo, quando a decisão não é a última do
   contrato.
3. **Função no banco autorizada:** desfazer numa transação só.

## Itens

1. **Migration** `aplicar_20271125300000_reajuste_desfazer.sql`:
   - colunas `proximo_anterior`, `parcelas_alteradas`, `desfeito_em` e `desfeito_por`;
   - uma policy de UPDATE que só permite **marcar** a decisão como desfeita, uma vez,
     com o e-mail de quem desfez;
   - grant de UPDATE só nas duas colunas da marca;
   - a função `desfazer_reajuste(uuid)`, SECURITY INVOKER, com REVOKE de PUBLIC e anon.

   **Pronto quando:**
   - o ensaio em transação abortada no banco, com o usuário de verdade (CTL-006-012-0001),
     dá aluguel 4.556, data-base 23/09/2016, próximo 23/09/2017, 6 parcelas de volta a
     4.556 e a marca gravada;
   - o 2º desfazer é recusado;
   - um UPDATE de `valor_novo` pelo usuário é bloqueado;
   - `segurancaMigrations` passa.

   Feito em 25/11: ensaio ok e banco intacto depois.
2. **Serviço** (`reajusteLocacaoService`):
   - `decidir` guarda `proximo_anterior` e `parcelas_alteradas` ({id, antes});
   - `decidir(..., substitui)` valida sobre o contrato de antes **antes** de desfazer, e
     depois desfaz e grava;
   - `desfazer(registro)` chama a função e regera os tributos;
   - `previa(..., substituindo)` monta a prévia sobre o contrato de antes.

   **Pronto quando:** os testes novos de `reajusteLocacaoService.test.ts` passam.
3. **Tela:**
   - `RentalReajustesHistorico` ganha os botões Ver, Editar e Excluir;
   - nova `ReajusteRegistroSheet` (Ver);
   - `ReajusteDecisaoSheet` ganha o modo Editar;
   - a decisão desfeita aparece riscada, com "desfeito", também no histórico da fila;
   - a regra pura fica em `motivoParaNaoAlterarDecisao`.

   **Pronto quando:** `reajusteAlterarDecisao.test.ts` passa, `check-ui-standard` passa e
   a conferência em produção é feita.

## Limite conhecido

No Editar, o desfazer e a gravação nova são duas chamadas. Se a nova falhar depois de
desfazer, a mensagem diz isso, e o contrato volta para "A decidir" com a decisão anterior
desfeita.

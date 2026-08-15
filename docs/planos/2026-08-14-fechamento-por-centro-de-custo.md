# Fechamento por Centro de Custo — Contas a Pagar

## Pedido original

Sessão de 14/08/2026, primeira mensagem do usuário, transcrita literalmente:

```
financeiro < Contas a Pagar:
1. criar nova aba chamada fechamento por centro de custo
```

### Decisões tomadas por pergunta direta (mesma sessão, antes de codar)

Duas leituras diferentes do pedido levariam a trabalhos diferentes, então
perguntei antes de escrever qualquer linha:

| Pergunta | Resposta do usuário |
|---|---|
| Onde a aba fica? | **Dentro de Contas a Pagar** — terceira opção do controle segmentado que hoje tem "Parcelas" e "Notas fiscais" (`ContasPagarManager.tsx`), herdando KPIs, competência e período de vencimento da tela |
| O que ela mostra? | **Consolidado por centro de custo + fechar/travar o mês** — o consolidado da competência com previsto/pago/em aberto por Centro de Custo, mais uma ação "Fechar competência" que **grava o fechamento no banco** e **impede alteração das parcelas daquele mês depois** |

O "1." do pedido indica que virão outros itens para a mesma tela; este plano
cobre só o item 1.

---

## Desenho

### O que é "fechamento" aqui

Fechar uma competência de Contas a Pagar é dizer: *os títulos com vencimento
neste mês, nesta organização, não mudam mais*. O consolidado por Centro de Custo
vira um **retrato congelado** (uma linha por CC, com os totais do momento do
fechamento), e o banco passa a **recusar** INSERT/UPDATE/DELETE de lançamento a
pagar cujo vencimento caia no mês fechado.

Duas consequências assumidas de propósito:

1. **A trava é por organização + competência, não por centro de custo.** Fechar
   "só o Administrativo de agosto" deixaria a pergunta "o mês está fechado?" sem
   resposta única — e é essa pergunta que a contabilidade faz. O relatório é por
   centro de custo; o fechamento é do mês.
2. **A trava atinge as sincronizações automáticas.** Se um Pedido de Compra ou
   um Contrato de Suprimentos tentar espelhar parcela com vencimento em mês
   fechado, o espelho falha com mensagem explícita. É o comportamento pedido —
   fechado é fechado — e por isso existe **Reabrir competência**, que devolve o
   mês ao estado editável e fica registrado com data e autor.

### Vencimento é o eixo, com fallback

A competência de um título é o mês do `due_date`. Quando o título não tem
vencimento (há centenas assim em `internal_transactions` — ver comentário em
`ContasPagarManager.carregar`), cai para `transaction_date`. Sem fallback, título
sem vencimento ficaria fora de qualquer fechamento e a trava teria um furo por
onde alterar dado de mês fechado.

---

## Itens

### 1. `supabase/migrations/aplicar_20270905000025_fechamento_centro_custo.sql` (novo)

O que muda:

- Tabela `cost_center_closings` — um fechamento por (organização, competência):
  status `FECHADO`/`REABERTO`, totais consolidados, `fechado_em`/`fechado_por`,
  `reaberto_em`/`reaberto_por`, observações. Índice único parcial garante **um
  fechamento vivo** por (org, competência).
- Tabela `cost_center_closing_items` — o retrato: uma linha por Centro de Custo
  com `cost_center_id` (nulo = "sem centro de custo"), **`cost_center_name`
  congelado** (renomear o CC depois não pode reescrever o passado), previsto,
  pago, em aberto e quantidade de títulos.
- `fn_payable_bloqueia_competencia_fechada()` + trigger em
  `internal_transactions`, com `WHEN (direction = 'DEBIT')` para não pesar nos
  lançamentos a receber. Consulta indexada; sem fechamento na tabela, custo é uma
  busca de índice que não acha nada.
- RLS em ambas as tabelas (`is_org_member`), `REVOKE ALL … FROM anon`,
  `GRANT … TO authenticated` — mesmo molde de `20270905000024`.
- Bloco final de conferência e bloco de teste da trava (dentro de
  `BEGIN/ROLLBACK`).

Como sei que terminou: os blocos aplicados à mão no SQL Editor, o bloco de
conferência devolvendo `tabelas=2, com_rls=2, anon_policies=0,
uidx_competencia=1, trigger=1`, e o bloco de teste levantando a exceção esperada
ao tentar alterar título de mês fechado.

**Estado: APLICADA e VERIFICADA em 15/08/2026.** Bloco de conferência devolveu
`tabelas=2, com_rls=2, anon_policies=0, uidx_competencia=1, triggers=2` — os
cinco valores esperados. Aplicada à mão, bloco por bloco (nunca
`supabase db push` — ver CLAUDE.md / histórico furado de migrations).

### 2. `services/costCenterClosingService.ts` (novo)

O que muda: service novo com `list`, `getByCompetencia`, `close`, `reopen`.
`organizationId?: string | null` na leitura (RLS recorta — REGRA #5); `close`
exige org específica por natureza (fechamento contábil é a exceção nomeada da
REGRA #5). `close` grava cabeçalho e itens; `reopen` marca `REABERTO` em vez de
apagar, para a trilha sobreviver.

Como sei que terminou: `npx tsc --noEmit` limpo e a aba fechando/reabrindo uma
competência de teste no navegador.

### 3. `components/financeiro/FechamentoCentroCusto.tsx` (novo)

O que muda: a tela da aba. Recebe `rows: Payable[]` do pai (mesmas parcelas que a
aba "Parcelas" já carregou — sem consulta nova), consolida por
`cost_center_id` dentro da competência, e renderiza tabela no padrão do guia:
toolbar acoplada (§5.2) com busca persistida, `useTableColumns` +
`ColumnConfigButton` + `SortableHeader` + `useResizableColumns` com espaçador
antes de "Ações" (§6.1.1) e autofit (§6.1.2), `px-6` + `border-r` em toda célula
(§6.6), `py-2.5` (§7.2), status em texto colorido (§8), empty/loading (§11/§12),
`useConfirm()` no fechar/reabrir (§14). Linha expansível mostra os títulos do
centro de custo. Quando a competência está fechada, a tela mostra o **retrato
gravado**, não o recálculo — é o ponto do fechamento.

Como sei que terminou: `bash scripts/check-ui-standard.sh` limpo no arquivo, e a
tela conferida no navegador contra a aba Parcelas ao lado.

### 4. `components/ContasPagarManager.tsx` (editado)

O que muda: `Visao` ganha `'fechamento'`; entrada em `VISAO_HEADERS`; terceiro
botão no segmentado; `summaryFechamento` (KPIs da competência: total, pago, em
aberto, nº de centros de custo) e o `summary` passa a escolher entre três;
export PDF/Excel do consolidado; renderização do novo componente.

Como sei que terminou: alternar entre as três opções troca título, subtítulo,
KPIs e conteúdo, e o export sai com as linhas do consolidado exibido.

### 5. `services/exportService.ts` (editado)

O que muda: `generateClosingPDF`/`generateClosingExcel` para o consolidado (ou
reúso dos genéricos existentes, se houver um que sirva sem distorcer o dado).

Como sei que terminou: PDF e Excel abrindo com as mesmas linhas e o mesmo total
que a tela mostra.

---

### 6. Falso positivo do `check-ui-standard.sh` (achado no caminho)

`ContasPagarManager.tsx` **já reprovava** no checker antes desta tarefa, e não
por violação real: o comentário de bloco acima de `renderContaCell` escrevia a
tag de célula literal, o que deixa o parser `awk` aberto e faz o script acusar
§7 no `<h1>` do §20 e no `<h3>` do empty state (§12). Comentário reescrito sem a
tag; o novo componente já nasceu com o mesmo cuidado documentado.

Como sei que terminou: `bash scripts/check-ui-standard.sh` limpo nos dois
arquivos (era 2 violações no `ContasPagarManager`, agora 0).

---

## Estado

- [x] Item 1 — migration **aplicada e verificada** (15/08/2026)
- [x] Item 2 — service
- [x] Item 3 — componente da aba
- [x] Item 4 — ligação no ContasPagarManager
- [x] Item 5 — export
- [x] Item 6 — falso positivo do checker
- [ ] **Verificação no navegador — PENDENTE.** O banco está pronto (blocos
      aplicados e conferidos), mas ninguém abriu a aba ainda. Falta exercitar, na
      tela: (a) consolidado de uma competência real bate com a aba Parcelas do
      mesmo mês; (b) fechar grava e a situação vira "Competência fechada"; (c) a
      trava REALMENTE recusa — tentar marcar como pago um título do mês fechado
      na aba Parcelas e ver a mensagem do banco; (d) reabrir destrava.
      Até (c) acontecer, a trava é código aplicado, não comportamento provado.

`npx tsc --noEmit` limpo · `check-ui-standard.sh` limpo nos dois arquivos ·
`orgContextGuard` e `migrationsPrefixo` passando (17 testes).

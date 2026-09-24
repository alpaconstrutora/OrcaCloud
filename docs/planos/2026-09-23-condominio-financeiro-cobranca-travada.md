# Condomínio › Financeiro — a cobrança travada e mais 7 defeitos

## Pedido original

Sessão de 23/09/2026.

> comercial < condomínios < Ficha do condomínio < aba financeiro: avalie

Depois da avaliação, na mesma sessão:

> ataque todos na ordem que voce recomendar

A ordem recomendada na avaliação, e seguida aqui: trava do trigger → janela de
competência → prévia invalidada → despesa em dois rateios → critério GRUPO →
confirmação "0 cobrança(s)" → cotas por unidade → busca por condomínio.

---

## ⚠️ Correção de rota — a primeira avaliação leu um checkout 561 commits atrás

A avaliação inicial desta sessão foi feita em `c:/D/ORÇACLOUD/orçacloud-saas`,
o **checkout de integração**, que estava **561 commits atrás** de `origin/main`
(`7476dbad` contra `50ad89d6`). Um dos oito achados — a janela de competência
errada em 10 dos 12 meses — **já tinha sido corrigido em `main` em 19/09/2026**,
pelo teste `condominioRateioNCentros`, com a mesma aritmética de string que eu
ia propor. O módulo também passou a somar **N centros de custo** por condomínio
(`previa` recebe `costCenterIds`, plural), o que a versão velha não tinha.

Os outros sete achados foram reconferidos um a um contra a frente (origem
`origin/main`) e continuam reais — inclusive o bloqueador, que foi provado
direto no banco de produção, que é compartilhado e não tem versão.

É exatamente a armadilha que a REGRA #8 descreve: checkout de integração não é
fonte para LER. O trabalho segue na frente isolada
`C:/D/frentes/condominio-cobranca-travada`.

---

## O que a avaliação achou (evidência, não suspeita)

Produção em 23/09/2026: **5 rateios, 0 fechados, 0 cobranças geradas, 0
recebíveis** (`source_system='CONDOMINIO_RATEIO'`). Ninguém nunca chegou ao
segundo passo do módulo — e os dois primeiros defeitos abaixo explicam por quê.

### 1. 🔴 `gerarRecebiveis` não pode funcionar — a trava do fechado o bloqueia

`condominioCobrancaService.gerarRecebiveis` faz
`UPDATE condominio_rateio_itens SET transaction_id` num rateio que ele mesmo
exige que esteja **FECHADO**. A trigger `trg_rateio_itens_protege`
(migration `aplicar_20270905000024`) recusa **qualquer** UPDATE em item de
rateio fechado.

Provado no banco remoto, num `DO` que termina em `RAISE EXCEPTION` (o bloco
inteiro reverte — nada ficou gravado):

```
BLOQUEADO -> Rateio já fechado: os valores viraram base de cobrança.
             Cancele o rateio e refaça, em vez de alterar o que já foi comunicado.
```

**Pior que falhar: deixa lixo.** O recebível é inserido em
`internal_transactions` **antes** do vínculo. Então a primeira cota vira um
recebível órfão em Contas a Receber, sem `transaction_id` de volta na cota. E
o retry com o mesmo vencimento bate `23505` em
`internal_transactions_org_ref_key` — o `reference_id` é
`{itemId}-p{vencimento}`, determinístico. Beco sem saída, com dinheiro falso
no financeiro.

**Por que passou despercebido:** o plano de 27/08 registra que a verificação
rodou com *"rota de escrita em `internal_transactions` abortada no harness"*.
O passo que quebra foi justamente o que o teste mockou.

### 2. ~~🔴 Janela de competência errada em 10 dos 12 meses~~ — JÁ CORRIGIDO EM MAIN (19/09)

`condominioRateioService.previa` monta o fim da janela com
`new Date('YYYY-MM-01')` (UTC) + `setMonth` (local). Em `America/Sao_Paulo`:

```
2026-03-01 -> 2026-03-29   despesas de 29, 30 e 31/03 não entram em rateio NENHUM
2026-09-01 -> 2026-10-02   1º de outubro entra em setembro E de novo em outubro
```

Só janeiro e agosto acertam. Duas caras do mesmo bug: dinheiro que **some** do
rateio, e dinheiro **cobrado duas vezes**.

✅ **Não há o que fazer aqui.** `main` já usa aritmética de string desde
19/09/2026 (`condominioRateioService.ts`, achado pelo teste
`condominioRateioNCentros`). O defeito só existia no checkout velho que a
primeira avaliação leu. Item fechado sem alteração.

### 3. 🟠 Calcular num mês, salvar noutro

Trocar Competência ou Tipo depois de "Calcular" não invalida a prévia — só
Critério faz `setPrevia(null)`. Dá para calcular agosto, mudar o campo para
setembro e salvar: o rateio grava competência de setembro com as despesas e as
cotas de agosto.

### 4. 🟠 A mesma despesa pode entrar em dois rateios

`previa()` não filtra por tipo nem exclui despesa já rateada. Um
EXTRAORDINÁRIO da mesma competência puxa exatamente a mesma lista do
ORDINÁRIO. A trava existe (`listarJaRateadas`) e só o caminho de Contas a
Pagar (`FechamentoCentroCusto.tsx`) a usa. `uidx_rateio_despesa` é
`(rateio_id, transaction_id)` — por rateio —, então o banco também não segura.

### 5. 🟠 O critério "Grupo de unidades" é morto

Ninguém passa `unidadesDoGrupo`, e não há UI para escolher as unidades. Toda
unidade fica com peso 0 → rateio de R$ 0,00 que dá para salvar e fechar,
consumindo um número de documento da sequência CONDO_RATEIO.

### 6. 🟡 A confirmação de emissão anuncia "0 cobrança(s)"

Logo depois de gerar os recebíveis na mesma sessão, `emissoes[r.id]` ainda está
vazio e o diálogo diz "0 cobrança(s) … vão para o Asaas" para uma emissão de N.

### 7. 🟡 As cotas por unidade somem depois de cobrar

"Ver despesas" mostra só despesas. A lista cota a cota só existe na sheet de
cobrança, que some quando `cobranca_gerada_em` é preenchido.
`listarItens()` não tem chamador. Depois de cobrar, "quem deve quanto" não é
respondível na tela — e isso é a prestação de contas.

### 8. 🟡 A busca é compartilhada entre condomínios

Chave `'condominio:financeiro:search'` sem o id do empreendimento.

---

## Plano

### 1. `supabase/migrations/aplicar_20270923000010_rateio_fechado_libera_vinculo_cobranca.sql` (novo)

`fn_rateio_protege_fechado` passa a permitir, num rateio FECHADO, **só** o
UPDATE que preenche/limpa `transaction_id` — todas as outras colunas
(`valor`, `peso`, `unit_id`, `client_id`, `rateio_id`) continuam travadas, e
INSERT/DELETE seguem recusados. O que a trava protege é o **valor** que virou
base de cobrança; o ponteiro para o recebível é registro de que a cobrança
aconteceu, não alteração do que foi comunicado.

REGRA #7 aplicada: é `CREATE OR REPLACE FUNCTION`, então leva
`REVOKE ALL … FROM PUBLIC` junto (a função é `SECURITY DEFINER` e de trigger —
ninguém deve poder chamá-la direto).

**Como sei que terminou:** o mesmo `DO` de prova que hoje devolve `BLOQUEADO`
passa a devolver `UPDATE PASSOU` para `transaction_id`, e continua devolvendo
`BLOQUEADO` para `valor`.

### 2. `services/condominioCobrancaService.ts` (editado)

- **Compensação:** se o vínculo falhar depois do INSERT, apagar o recebível
  recém-criado antes de propagar o erro. Recebível órfão em Contas a Receber é
  pior que a falha, porque some da vista do módulo que o criou.
- **`previa()` deixa de derrubar o lote inteiro** — hoje `gerarRecebiveis`
  lança no primeiro erro e perde as cotas já criadas. Passa a acumular falhas
  por cota, como `emitir()` já faz, e devolver `{ criados, pulados, falhas }`.

**Como sei que terminou:** teste novo cobre o caminho "vínculo falhou → o
recebível foi apagado" e "cota 2 falha → cotas 1 e 3 continuam criadas".

### 3. `services/condominioRateioService.ts` (editado)

- **`previa()` aceita `excluirTransactionIds`** e o repassa como filtro, para a
  aba poder barrar despesa já rateada.

A janela de competência **não entra aqui** — já está correta em `main` (ver o
aviso de correção de rota acima).

**Como sei que terminou:** teste de `previa` com exclusão.

### 4. `components/condominio/FinanceiroTab.tsx` (editado)

- Trocar Competência ou Tipo **invalida a prévia** (`setPrevia(null)`), como
  Critério já fazia.
- Antes de calcular, consultar `listarJaRateadas` e **excluir** do cálculo as
  despesas já lançadas em rateio vivo, dizendo quantas ficaram de fora.
- **Critério GRUPO ganha o seletor de unidades** que faltava (§6.9 do guia:
  tabela dentro de `Sheet` usa `px-3`/`px-4`).
- Confirmação de emissão usa o número real de cotas a emitir.
- **Sheet de detalhe ganha as cotas por unidade** (usa `listarItens`), ao lado
  das despesas — é a prestação de contas.
- Busca persistida por condomínio (`condominio:${id}:financeiro:search`).

**Como sei que terminou:** `check-ui-standard.sh` limpo no arquivo, `tsc`
limpo, e a tela conferida no navegador.

### 5. `__tests__/condominioRateio.test.ts` (editado)

Os 8 testes de hoje cobrem só `distribuir()` — a matemática pura. Nada cobria
janela de competência nem cobrança, que é onde estavam os defeitos. Entram os
casos acima.

---

## Estado — 23/09/2026

### Feito e verificado

| # | Item | Prova |
|---|---|---|
| 1 | Trava do fechado libera só `transaction_id` | Migration **aplicada no banco remoto**. O `DO` de prova devolve `vinculo=PASSOU \| valor=BLOQUEADO \| insert=BLOQUEADO \| delete=BLOQUEADO`, e reverte sozinho (0 fechados, 51 itens, iguais a antes) |
| 2 | ~~Janela de competência~~ | Já correto em `main` desde 19/09 — nada a fazer (ver correção de rota) |
| 3 | Prévia invalidada ao trocar competência/tipo | `FinanceiroTab.tsx` — os dois `onChange` chamam `setPrevia(null)`, como o critério já fazia |
| 4 | Despesa em dois rateios | Corte movido para dentro de `previa()`, onde todo caminho passa. 4 testes novos |
| 5 | Critério GRUPO | Seletor de unidades na sheet + `Calcular` travado com grupo vazio + `Salvar` travado com rateio zerado |
| 6 | "0 cobrança(s)" | Sem contagem, a frase diz "As cobranças ainda não emitidas" em vez de um número falso |
| 7 | Cotas por unidade | `listarCotas()` novo + `TabelaCotas` (§6.9) na sheet, que virou "Detalhe do rateio" |
| 8 | Busca por condomínio | Chave `condominio:${id}:financeiro:search` |

### Achado DURANTE a correção (não estava na avaliação)

Destravar o lote criou um estado novo: **geração parcial**. Com o laço parando
no primeiro erro isso não existia — ou tudo, ou a exceção. Agora o rateio pode
ganhar `cobranca_gerada_em` com cotas ainda sem recebível, e a ação "Gerar
cobrança" sumia da linha justamente nesse estado: **as cotas restantes ficavam
inalcançáveis para sempre**, e o caminho de resolver um CPF que faltava e gerar
o que sobrou não existia. Corrigido em três lugares:

- a ação continua visível enquanto o rateio estiver FECHADO, com `title` próprio;
- `gerarRecebiveis` devolve `{criados: 0}` quando **todas** as cotas já têm
  recebível (idempotência, como a docstring sempre prometeu) e só lança quando
  há cota por cobrar e nenhuma pode ser;
- o carimbo `cobranca_gerada_em` só é gravado se alguma cota foi criada.

Foi o teste `cota que já tem recebível é pulada` que expôs isso — ele falhou na
primeira rodada, e o defeito era do código, não do teste.

### Mecânica

- `npx tsc --noEmit` **limpo**
- `npm run build` **limpo** (built in 19.75s)
- **5.147 testes passando**, 33 pulados — 15 novos (`condominioCobrancaGeracao`
  com 11, `condominioRateioNCentros` com 4)
- `check-ui-standard.sh` em `FinanceiroTab.tsx` — 0 violações
- `check-system-projects.sh`, `check-project-classification.sh`,
  `check-org-selector-guard.sh`, `check-xss-sinks.sh` — todos OK
- `migrationsPrefixo` pegou uma **colisão real**: `20270923000001` já tinha sido
  usado por outra frente. Renomeado para `...000010`

### Conferência VISUAL na tela (23/09/2026)

Servidor da frente em `localhost:3177`, dado REAL, `agente-leitura`, escritas
bloqueadas no `page.route` (`fallback()`, nunca `continue()` — o `continue()` de
um segundo handler já furou esse bloqueio em 19/09). **Nenhuma escrita foi
sequer tentada. Zero erro de console.** Roteiros em
`c:/tmp/pwtest/condo-financeiro-2026-09-23.js` e `condo-detalhe-e-jarateadas.js`.

| Item | O que a tela mostrou |
|---|---|
| [5] Seletor de GRUPO | `Unidades do grupo` com **9 checkboxes**, contador `0 de 9 no grupo`, `Todas`/`Nenhuma`; **Calcular desabilitado** com grupo vazio, habilitado após "Todas" (`9 de 9`) |
| [3] Prévia invalidada | Calculado com prévia na tela → trocar a competência → **a prévia sumiu** |
| [7] Detalhe do rateio | Título `Detalhe do rateio`; `Cotas — 12 unidade(s) · R$ 1.144,95`, colunas Unidade / Quem paga / Cota, `Sem pagador definido` em âmbar nas Salas 301 e 303; abaixo `Total das despesas R$ 1.144,95` + as despesas. 28 linhas nas duas tabelas |
| [4] Despesa já rateada | Novo rateio em 08/2026 (mesma competência do rascunho vivo): **"14 despesa(s) … já entraram em outro rateio"**, total R$ 0,00, **Salvar desabilitado** |

🔎 **Um defeito que só o print revelou.** Na primeira passada, a prévia com
todas as despesas excluídas mostrava **dois avisos que se contradiziam**:
*"Nenhuma despesa lançada nesta competência… Lance as despesas no Financeiro
apontando para ele"* logo acima de *"14 despesa(s) … já entraram em outro
rateio"*. O primeiro manda lançar de novo o que já existe. Ele agora só aparece
quando `jaRateadas === 0`. Reconferido na tela depois da correção: sobrou só o
aviso certo.

🔎 **Um falso negativo que a 1ª rodada quase reportou.** O roteiro abria o
primeiro condomínio da lista (007 - Bella Vista) e dizia `Ver detalhe: false`.
Não era regressão: os 3 rateios de lá estão **CANCELADOS**, e linha cancelada
não tem coluna de ações — comportamento correto. O 010 - Galeria Altavista, com
o rascunho vivo, mostrou a ação normalmente.


# Pendências do Estudo de Massa — lacunas, opcionais e defeitos achados no caminho

## Pedido original

Sessão `7d36268b` (Claude Code, VS Code), 03/10/2026, depois de o roadmap M1–M6 do
`2026-10-01-estudo-de-massa.md` fechar. Pergunta do usuário: *"O que falta implementar do plano e pendências ?"* —
respondida com a lista abaixo (lacunas do plano, opcionais, defeitos de outras áreas registrados e não corrigidos).
Pedido, literal:

> Corrigir todos na ordem que você achar melhor

## Ordem escolhida (e por quê)

Primeiro o que entrega número errado ao usuário sem aviso, depois o que quebra edição, depois o que completa o
ciclo, por último os opcionais de conveniência e o maior de todos.

1. [x] **CUB no Estimador e no CNO** — número errado em silêncio.
2. [x] **`RemoveLevel` com loteamento e grupos** (+ desagrupar apagando as cópias, achado ao investigar).
3. [x] **Vagas reais na garagem/subsolo** a partir do estudo de massa.
4. [ ] **Outorga onerosa**: "CA máximo com outorga" como campo da zona, e o estudo mostra o potencial adicional.
5. [ ] **Abrir na aba Terreno** quando se entra pelo menu "Estudo de Massa".
6. [ ] **Bloco em L, U ou H** no pavimento tipo (e na planta das unidades).

## 1. CUB no Estimador e no CNO (03/10/2026)

**O defeito.** `cub_parametric_data` grava as colunas `pp_4_n`, `csl_8_n`, `cal_8_a`… O `parametricService` montava
o nome pela chave do padrão ("PP-N" → `pp_n`, "CSL8-N" → `csl8_n`): para PP-*, CSL* e CAL* a coluna não existia. Nas
quatro leituras: o orçamento paramétrico saía vazio; o total caía no valor estimado; o histórico e a comparação
regional pediam a coluna no `select` e levavam 400 do PostgREST (tela vazia). Tudo em silêncio.

**Achado ao investigar — a simulação de INSS do CNO nunca leu o CUB:** o formulário manda `com_desoneracao` e o mês
como `AAAA-MM`; o banco grava "Com Desoneração" e `MM/AAAA`; e há 5 linhas por (UF, mês, encargos) — uma por natureza
e a "Total" —, então o `maybeSingle()` falharia mesmo casando. A conta usava SEMPRE os R$ 2.500 fixos.

**O que mudou.**
- `services/cubService.ts`: `colunaDoPadraoCub` (o mapa explícito que já existia, `COLUNA_DO_PADRAO_CUB`, agora a
  fonte de todos os leitores), `mesDe` aceita os dois formatos, `encargosDoCub`, `linhaDoMesOuAnterior` (a tabela é
  esparsa: o mês pedido, senão o anterior mais recente, senão o mais recente).
- `services/parametricService.ts`: as quatro leituras pela coluna certa; padrão desconhecido = sem tabela (nunca nome
  montado).
- `services/cnoService.ts` + `components/OpuraCnoModule.tsx`: lê a "Total" da UF com os encargos certos e o mês pedido
  ou anterior; o resultado diz de onde veio ("tabela 01/2025 · Com Desoneração" ou "estimativa fixa").

**Pronto quando** (feito): `__tests__/cubColunaDoPadrao.test.ts` (7) — todo padrão do app tem coluna e ela existe no
banco; orçamento, total, histórico e regional com PP/CSL/CAL leem a tabela; CNO com `com_desoneracao` + `AAAA-MM` lê
a "Total" do mês anterior e diz qual; UF sem tabela diz "estimativa fixa". **5 dos 7 falham sem a correção.**

## 2. `RemoveLevel` com loteamento e grupos; desagrupar (03/10/2026)

**Os defeitos (reproduzidos antes de corrigir).**
- Remover um pavimento com quadra/lote/via/área pública era RECUSADO: "Quadra qdr_0001: pavimento inexistente".
- O mesmo com a origem ou uma instância de grupo (E2.3) no pavimento: "Grupo …: pavimento inexistente".
- **Achado ao investigar:** "Desagrupar (as cópias ficam)" APAGAVA as cópias quando havia outro grupo no modelo (4
  paredes → 3) — a sincronização da cauda as via como órfãs. O pavimento tipo da massa (M6b+) nasce com vários grupos:
  desagrupar um apagaria as unidades iguais dele.

**O que mudou** (`utils/blueprintKernel/commands.ts`; formato do payload igual, sem bump).
- `RemoveLevel` leva quadras, lotes, vias e áreas públicas do piso; lote de outro piso que apontava para quadra dali
  fica sem quadra (como `DeleteQuadra`).
- Grupo com a ORIGEM no piso some e as cópias dele nos outros pisos ficam LIVRES; instância no piso sai do grupo.
- O conjunto das cópias conhecidas no comando ficou mutável: desagrupar e a origem que some LIBERAM as cópias.
- Bundle da `planta-api` regerado (mesmo kernel na API).

**Pronto quando** (feito): `__tests__/blueprintRemoveLevelLoteamentoEGrupos.test.ts` (6) — loteamento sai e lote de
outro piso perde a quadra; origem no piso → cópias livres e editáveis; instância no piso sai; desagrupar com outro
grupo mantém as cópias livres e o outro grupo intacto; excluir com cópias apaga só as dele.

## 3. Vagas reais na garagem (03/10/2026)

**A lacuna.** A M6 previa "vagas reais via `planejarVagas` no bloco garagem"; o estudo só CONTAVA as vagas (M2,
`vagasQueCabem`, num modelo provisório).

**O que entrou.**
- `utils/blueprintGaragemDaMassa.ts` (puro): `lancarGaragem(model, bloco)` — um pavimento por pavimento do bloco de
  GARAGEM ("1º subsolo" o mais perto do solo, "térreo (garagem)", "Nº pav (garagem)"), com as 4 paredes do contorno e as
  vagas do lançador da E2.5 CONFIRMADAS (PCD e idoso nos mínimos, numeradas `S1-12`). Bloco girado: planejado no quadro
  alinhado ao lado mais longo (o mesmo da contagem da M2 — o número lançado é o contado) e devolvido por rotação rígida.
  Uid determinístico por pavimento: não lança duas vezes. Fora, dito na mensagem: pilares, rampa e acesso (o número é o
  teto; a gaveta de Vagas refaz contornando os pilares).
- Painel do bloco: com uso Garagem, a seção "Garagem" com "Lançar as vagas" (e o pavimento tipo não aparece — garagem
  não tem); depois "Vagas já lançadas em N pavimento(s)", botão desligado com o motivo.

**Pronto quando** (feito):

| Portão | Resultado |
|---|---|
| `__tests__/blueprintGaragemDaMassa.test.ts` (4) | 2 subsolos em −6 e −3 m com 4 paredes; vagas = as da M2, confirmadas, com PCD e idoso, todas dentro do contorno, `S1-…`; a lista de uma vez dá o mesmo modelo; lançar de novo recusado; bloco não-garagem recusado; girado 30° dá o mesmo número, dentro do contorno girado |
| Teste de editor "estudo de massa (garagem)" | o painel oferece; lançar → "Vagas lançadas: 2n em 2 pavimento(s) (2º subsolo: n; 1º subsolo: n)"; depois "já lançadas" e o botão desligado |

## Prova dos itens 1–3 (03/10/2026)

| Portão | Resultado |
|---|---|
| `tsc` · `check-ui-standard` (OpuraCnoModule, PainelBlocoSelecionado, BlueprintEditor) · org guard · XSS | 0 · 0 violações · ok · ok |
| Suíte cheia (JSON, `pending` = 0) | 680/680 arquivos · 7.097 testes = 7.063 ok + 34 pulados · 0 falhas. ⚠️ Uma rodada anterior acusou "list.sort is not a function" no teste da M6b: foi a suíte rodando ENQUANTO eu alterava arquivos da frente; com o código parado não voltou. E o contador aceitava `pending` (117 testes não rodados numa rodada com worker caído) — corrigido para exigir `pending = 0` |
| Build | ok |
| App real (logado, RLS de verdade) — CUB | comparação regional PP-N 01/2025: MG 2.535,68 · RJ 2.472,57 · SC 2.392 · SP 2.254 · ES 2.106,80 (antes: 400 e vazio); total PP-N MG 100 m² = R$ 253.568 (tabela, não estimado); orçamento CSL8-N com as 4 naturezas; histórico CAL8-N com 13 meses; **CNO com o formulário padrão (MG, "2026-02", sem desoneração): CUB R$ 3.027,37, "tabela 01/2026 · Sem Desoneração"** (antes: 2.500 fixos) |
| App real — garagem (estudo descartável "ZZ TESTE … prova garagem", 30 × 40 m, 2 subsolos) | o painel oferece (sem o pavimento tipo); lançar → "90 em 2 pavimento(s) (2º subsolo: 45; 1º subsolo: 45) — 1 PCD e 3 idoso"; depois "já lançadas", botão desligado; **no banco**: os 2 pavimentos em −6 e −3 m, 4 paredes e 45 vagas confirmadas cada; 0 erros. No desenho: fileiras com circulação, PCD/idoso no começo, `S1-1…45` |
| Limpeza | estudo apagado pelo id + `name LIKE 'ZZ TESTE%'`; estudos 73 · ramos 73 · produtos 0 · entornos 0 · ZZ 0, iguais aos de antes |

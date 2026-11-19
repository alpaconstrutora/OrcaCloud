# Imovib › Versões — editar e excluir enquanto não publicada

## Pedido original

Sessão `21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0` · 19/11/2026.

> Pergunta: consigo vincular o mesmo empreendimento a mais de um estudo?

> Faz muito sentido ter mais de um estudo por empreendimento ou como alternativa, mais de uma versão de uma mesmo estudo por empreendimento

> a aba versões atende a necessidade.
> Porem na colouna açoes preciso excluir uma versão e editar (CRUD)

> qual a necessidade de um estudo imutavel, sendo que a propria natureza do nome estudo é que ainda é um estudo portanto, portando pode ser alterado tudo e a qualquer momento.
> A excessão ficaria com o estudo congelado / publicado. Aqui sim faz sentido apenas visualizacao. Mas enquanto o estudo nao tenha sido publicado a ordem é ediçao total.

Três caminhos apresentados para "edição total" (1. editar pelo estudo; 2. editor próprio da versão;
3. duas ações separadas). Perguntado "qual a vantagem da versao 2?" e respondido (não toca no estudo vivo;
edição paralela; sem modo para esquecer ligado — ao custo de o editor aprender a trabalhar sobre a cópia):

> vamos de opcao 1

## Intenção

A aba Versões já é a forma de ter várias viabilidades do mesmo empreendimento. O que falta é tratá-las como
**estudo** — algo que ainda muda — e não como registro imutável. A trava só faz sentido no que o investidor
recebeu: **versão publicada = só leitura; o resto, edição total e exclusão.**

## Regra

| Estado da versão | Editar nome/observações | Editar tudo | Excluir |
|---|---|---|---|
| Não escolhida em oportunidade | sim | sim | sim |
| Escolhida numa oportunidade em **rascunho** (não publicada) | sim | sim | sim — a escolha some do rascunho (a confirmação diz qual) |
| Escolhida numa oportunidade **publicada** (`is_published`) | não | não | não — botões desligados dizendo em qual oportunidade |
| Publicada e depois despublicada | volta a ser editável | | |

"Publicada" = existe `investor_opportunities` com `imovib_version_id = versão` e `is_published = true`.
Vale no banco (gatilho), não só na tela.

## Como funciona (caminho 1 — editar pelo estudo)

Coluna de ações da aba Versões: **PDF** (já existe) · **Editar** · **Excluir**. Nome e observações também
editáveis direto, sem passar pelo editor.

```
Versões
┌───────────────────────┬──────────────┬─────────┬───────┬──────────────────────┬───────────┬──────────────┐
│ Versão                │ Congelada em │ VPL     │ TIR   │ Para o investidor     │ Obs.      │ Ações        │
├───────────────────────┼──────────────┼─────────┼───────┼──────────────────────┼───────────┼──────────────┤
│ Cenário banco ✎       │ 18/11 10:02  │ 4,1 mi  │ 21%   │ —                     │ …       ✎ │ PDF ✏️ 🗑      │
│ Versão de 16/11       │ 16/11 05:43  │ 3,8 mi  │ 19%   │ Garden — publicada    │ …         │ PDF (✏️ 🗑 off)│
└───────────────────────┴──────────────┴─────────┴───────┴──────────────────────┴───────────┴──────────────┘
```

**Editar** (confirmação: "O estudo passa a mostrar a versão X até você salvar ou descartar"):

1. Guarda o estado atual do estudo (a mesma cópia completa que o congelar faz) como **cópia de segurança da
   edição** — não aparece na lista de versões.
2. Carrega a versão no estudo: premissas (colunas do estudo) e as tabelas do estudo — cenários, comparáveis,
   riscos, due diligence, sócios, blocos/unidades, CAPEX, outras fontes de capital.
3. O editor abre normal, com a faixa: **"Editando a versão X — Salvar na versão · Descartar"**.
4. **Salvar na versão**: refaz a cópia completa (premissas + tabelas + cálculo congelado + resultados, como
   o congelar faz) e regrava **a mesma versão** (mesmo id, mesmo nome, mesmas oportunidades em rascunho);
   grava `editada em / por`. Depois devolve ao estudo a cópia de segurança. O estudo vivo fica como estava antes
   de começar.
5. **Descartar**: devolve ao estudo a cópia de segurança; a versão não muda.

Enquanto a edição está aberta:

- **Congelar versão** fica desligado ("Termine a edição da versão X antes de congelar outra").
- **Editar** de outra versão fica desligado pelo mesmo motivo (uma edição por estudo).
- Telas que leem o estudo vivo (Central de Sincronização do empreendimento, Acompanhamento) mostram o aviso
  "Estudo em edição da versão X".
- A edição em aberto fica gravada no estudo — fechar o navegador não perde nada; quem abrir o estudo vê a faixa.
- **Só quem abriu a edição grava** (decidido 19/11: *"opcao A"*). Para os outros o estudo fica só leitura, com
  a faixa "Fulano está editando a versão X desde 14h". O banco recusa gravação no estudo e nas tabelas dele
  por outra pessoa enquanto a edição está aberta. **Administrador** pode descartar uma edição esquecida
  (chamada do construtor: administrador da organização do estudo, ou acesso total — `temAcessoTotal`).

**Excluir**: confirmação nomeando a versão (e o rascunho de oportunidade que a escolhia, se houver). Recusada
pelo banco se publicada.

## Banco (migration — aplicar só com OK)

- `imovib_study_versions`: colunas `updated_at`, `updated_by`; policies de UPDATE e DELETE para quem já pode
  inserir (mesma checagem de organização do SELECT/INSERT, REGRA #7 perguntas 1 e 2).
- Gatilho BEFORE UPDATE/DELETE: recusa (mensagem em português, nomeando a oportunidade) se a versão está
  publicada; no DELETE, limpa `imovib_version_id` dos rascunhos que a escolhiam (o FK é RESTRICT).
- `imovib_studies`: coluna para a edição em aberto (`{ version_id, backup, started_by, started_at }`), que
  dirige a faixa, os botões desligados e o aviso nas outras telas.

## Fora do escopo / não-objetivos

- Mais de um estudo por empreendimento (o vínculo segue `empreendimentos.imovib_study_id`, um só).
- Editor próprio da versão (caminho 2).
- Versão publicada editável — nunca.
- Histórico de alterações dentro da versão (só "editada em / por").

## Pontos que o desenho deixa explícitos

- **Estrutura vem do empreendimento.** Com empreendimento vinculado, torres/unidades/áreas não são do estudo
  (`aplicarEstrutura`): editar uma versão antiga recalcula com a estrutura **de hoje** do empreendimento. O
  cálculo regravado reflete isso; a faixa avisa.
- **Espelho de vendas** (`imovib_unit_instances`) é a venda real das unidades, não premissa: **não** é
  sobrescrito ao carregar a versão (a cópia guarda só as colunas de VGV). Chamada do construtor, a confirmar
  na conferência — se o VGV da versão depender de instâncias que mudaram, o cálculo regravado mostra o de hoje.
- **Identidade e governança do estudo** (id, organização, nome, status, aprovação/parecer) não vêm da versão.

### Decisões do construtor (marcadas para revisão)

- **Blocos casados pelo id, nunca apagados.** `imovib_unit_instances.block_id` cai em cascata com o bloco;
  apagar e recriar blocos apagaria o espelho de vendas. Carregar a versão atualiza os campos dos blocos que
  existem nos dois; bloco que só existe hoje fica; bloco que só existe na versão não é recriado (a faixa avisa).
  Tabelas sem filhos (cenários, comparáveis, riscos, due diligence, sócios, CAPEX, fontes) são substituídas
  por inteiro.
- **Versão antiga sem alguma parte** (congelada antes de 15/11, sem `relatorio`/`calculo`, ou sem um campo
  criado depois): a parte que a versão não guardou fica com o conteúdo de hoje do estudo, e a confirmação de
  Editar diz quais ("esta versão não guardou comparáveis e riscos — ao salvar, passa a guardar os atuais").
  Hoje as 2 versões existentes são de 16/11 em diante.
- **Publicar com a versão em edição é recusado** (gatilho em `investor_opportunities`, mensagem "A versão X
  está em edição no estudo — salve ou descarte antes de publicar"), para a edição nunca ficar presa sem poder
  salvar.

## Abordagens consideradas

1. **Editar pelo estudo** — escolhida (19/11): reusa o editor inteiro; custo: o estudo vivo mostra a versão
   durante a edição (mitigado pela cópia de segurança, pelo aviso e pela volta automática ao salvar/descartar).
2. **Editor próprio da versão** — não toca no estudo vivo e permite edição paralela; custo: o editor inteiro
   teria de trabalhar sobre a cópia, em dois modos, para sempre.
3. **Duas ações soltas** ("Carregar no estudo" / "Atualizar versão com o estudo") — mais simples, mas fácil
   regravar a versão errada ou esquecer; sem a volta automática do estudo.

## Pronto quando

- Banco, em transação desfeita: UPDATE e DELETE de versão não publicada passam; de versão publicada recusam
  com a mensagem; DELETE limpa a escolha do rascunho; outra organização não altera nem apaga.
- Testes: regra da coluna de ações (3 estados); editar → salvar regrava a mesma versão e devolve o estudo;
  descartar devolve o estudo sem mudar a versão; congelar desligado durante a edição.
- Navegador, com versão descartável criada e apagada no fim (com OK): editar um número, salvar, PDF da versão
  mostra o número novo; estudo vivo igual ao de antes; versão publicada do Garden com Editar/Excluir desligados.

---

## Plano de implementação (desenho aprovado 19/11: *"aprovado"*)

**Objetivo:** editar (tudo) e excluir versões não publicadas pela aba Versões, com o estudo como editor.
**Arquitetura:** o banco faz o trabalho atômico — três RPCs (`iniciar`, `salvar`, `descartar`) e uma função
interna que aplica uma cópia ao estudo; o app só monta a cópia (o mesmo código do congelar) e mostra a faixa.
A trava "só quem abriu grava" entra no `useImovibEdicao` que as ~30 telas do estudo já leem.
**Pilha:** Postgres/Supabase (plpgsql, RLS), React + TypeScript, Vitest.

### Restrições globais

- Versão publicada = existe `investor_opportunities` com `imovib_version_id = versão` e `is_published`.
- Nunca apagar nem inserir `imovib_blocks`/`imovib_units` ao aplicar cópia (o espelho cai junto: `block_id`
  CASCADE, `unit_id` SET NULL); `imovib_unit_instances` nunca é tocado.
- Não vêm da cópia: `id, organization_id, name, status, created_at, created_by`, campos de parecer/aprovação,
  `edicao_versao`.
- Parte ausente da cópia (chave inexistente) = tabela intocada.
- Migration nova `supabase/migrations/aplicar_20271119920000_imovib_versoes_editar_excluir.sql` (prefixo
  conferido contra TODOS os nomes antes de criar), aplicada com `db query -f` **só com OK**; RPCs com
  `REVOKE … FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated`; função interna revogada de todos (REGRA #7).

### Foco de revisão (o que os testes de cada fase não cobrem sozinhos)

1. Rede cai no meio do salvar → nada fica pela metade (RPC numa transação). Prova F1.7.
2. Estudo com empreendimento vinculado: a cópia traz blocos com id `torre:…` (sem linha em `imovib_blocks`)
   → ignorados, sem erro. Prova F1.7.
3. Outra oportunidade publica a versão enquanto está em edição → recusado. Prova F1.7.
4. Outra pessoa grava numa tabela do estudo durante a edição (pelo app ou direto) → recusado no banco e
   campos desligados na tela. Provas F1.7 e F3.2.
5. Versão antiga sem `relatorio` → comparáveis/riscos/DD/sócios de hoje ficam, e a confirmação diz. Teste F2.2.

### Fase 1 — Banco (migration; aplicar só com OK)

- [x] F1.1 `imovib_study_versions`: `updated_at timestamptz`, `updated_by uuid`; policies `…_update` e
  `…_delete` com `imovib_unit_instance_org_check(study_id)` (USING e WITH CHECK), iguais às do SELECT/INSERT.
- [x] F1.2 `imovib_studies.edicao_versao jsonb` (`{version_id, version_label, started_by, started_by_name,
  started_at, backup}`).
- [x] F1.3 Gatilho `fn_imovib_versao_trava_publicada` BEFORE UPDATE OR DELETE em `imovib_study_versions`:
  publicada → `RAISE` "Versão publicada na oportunidade «<título>» — só leitura"; no DELETE, antes, zera
  `imovib_version_id` dos rascunhos que a escolhem.
- [x] F1.4 Gatilho BEFORE INSERT OR UPDATE em `investor_opportunities`: `is_published` e a versão está em
  edição no estudo → `RAISE` "A versão «X» está em edição no estudo — salve ou descarte antes de publicar".
- [x] F1.5 Gatilho `fn_imovib_trava_edicao_de_outro` BEFORE INSERT/UPDATE/DELETE em `imovib_studies` e nas
  tabelas dele (`imovib_blocks`, `imovib_units` via bloco, `imovib_capex_items`, `imovib_funding_sources`,
  `imovib_scenarios`, `imovib_risks`, `imovib_market_comparables`, `imovib_land_checklist`, `imovib_partners`,
  `imovib_regulatory_zones`): edição aberta e `started_by <> auth.uid()` → `RAISE` "«Nome» está editando a
  versão «X» — o estudo está só para leitura". Liberado dentro das RPCs (variável de sessão
  `app.imovib_aplicando = on`).
- [x] F1.6 `fn_imovib_aplicar_retrato(p_study_id uuid, p_retrato jsonb)` (interna): atualiza `imovib_studies`
  por `jsonb_populate_record` sem os campos da restrição; substitui por inteiro (DELETE + INSERT mantendo ids)
  `cenarios`→scenarios, `relatorio.comparaveis`, `relatorio.riscos`, `relatorio.dueDiligence`→land_checklist,
  `relatorio.socios`→partners, `capex_items`, `funding_sources`; `blocks[]`/`units[]`: UPDATE só onde o id
  existe. RPCs SECURITY DEFINER, cada uma conferindo `imovib_unit_instance_org_check`:
  `imovib_versao_iniciar_edicao(p_version_id uuid, p_backup jsonb)` (recusa publicada ou edição já aberta;
  grava `edicao_versao`; aplica a cópia da versão) · `imovib_versao_salvar_edicao(p_study_id uuid,
  p_snapshot jsonb, p_results jsonb)` (só `started_by`; regrava a versão com `updated_at/by`; aplica o
  `backup`; limpa) · `imovib_versao_descartar_edicao(p_study_id uuid)` (`started_by`, admin/owner da org do
  estudo, ou `is_superadmin()`; aplica o `backup`; limpa).
- [x] F1.7 **Pronto quando**, em transação desfeita (`BEGIN … RAISE EXCEPTION 'PROVA' … ROLLBACK`) sobre um
  estudo de teste: UPDATE/DELETE de versão não publicada passam; publicada recusa com a mensagem; DELETE zera
  o rascunho; outra org não altera; iniciar → tabelas iguais à cópia, espelho intacto, bloco `torre:…`
  ignorado; outro usuário recusado em `imovib_scenarios`; publicar em edição recusado; salvar → versão nova e
  estudo igual ao backup; erro no meio do salvar não deixa nada pela metade; descartar idem sem mudar a
  versão. `__tests__/segurancaMigrations.test.ts` verde.

**Estado da Fase 1 (19/11):** prova em transação desfeita passou inteira ("PROVA OK"), conferido depois
que nada ficou gravado; migration aplicada com `db query -f` (OK do usuário: *"Sim"*). A prova achou dois
defeitos reais, corrigidos antes de aplicar: (1) a tabela de versões não tinha privilégio UPDATE/DELETE para
`authenticated` (nasceu imutável) — `GRANT` acrescentado; (2) linha da cópia que não existe mais no estudo era
recriada com nulos nas colunas de padrão (`kind` do cenário) — agora só as colunas que a cópia trouxe.
Conferido no banco: 3 colunas, policies de UPDATE/DELETE, 3 RPCs, 11 gatilhos de trava, nenhuma RPC para `anon`.

### Fase 2 — Regra pura e serviço

- [x] F2.1 `utils/imovibVersoes.ts`: `acoesDaVersao(args: { publicadaEm: string | null; edicaoAberta:
  EdicaoDaVersao | null; versaoId: string; pode: ImovibEdicao }): { editar: Acao; excluir: Acao; renomear:
  Acao }`, com `Acao = { pode: boolean; motivo?: string }`. Teste `__tests__/imovibVersoesAcoes.test.ts`:
  publicada → os três desligados com "Publicada em «…»"; edição aberta de outra versão → editar e excluir
  desligados ("Termine a edição da versão «X» …"), renomear livre; sem `pode` → motivo da permissão.
- [x] F2.2 `partesAusentesDaVersao(snapshot): string[]` (nomes em português das partes sem chave). Teste:
  snapshot sem `relatorio` → `['comparáveis', 'riscos', 'due diligence', 'sócios']`; completo → `[]`.
- [x] F2.3 `services/imovibService.ts`: extrair `montarCopiaDoEstudo(study): Promise<{ snapshot; results }>`
  de `congelarVersao` (que passa a usá-la); `iniciarEdicaoDaVersao(study, versionId)`,
  `salvarEdicaoDaVersao(study)`, `descartarEdicaoDaVersao(studyId)`, `renomearVersao(id, label, notes)`,
  `excluirVersao(id)` — chamam as RPCs / UPDATE / DELETE e repassam a mensagem do banco. `types.ts`:
  `ImovibStudy.edicao_versao?: EdicaoDaVersao | null` (sem `backup` no tipo do app). Teste do serviço com
  supabase simulado: `congelarVersao` grava a mesma cópia de antes (regressão); cada função chama a RPC certa.

### Fase 3 — Telas

- [x] F3.1 `ImovibVersoesTab`: Editar (`ActionIconButton`, confirmação com `partesAusentesDaVersao`) e
  Excluir (`useConfirm`, nomeia o rascunho afetado) na coluna de ações, desligados com o motivo de
  `acoesDaVersao`; nome e observações editáveis na linha; "Congelada em" ganha "editada em … por …" quando
  houver `updated_at`. Teste de componente: 3 estados da coluna e a linha "editada em".
- [x] F3.2 `hooks/useImovibEdicao.tsx`: `avaliarEdicaoImovib` recebe `edicaoAberta` e `meuUserId`; aberta
  por outro → `{ pode: false, motivo: '«Nome» está editando a versão «X» desde 14h' }`. Teste em
  `__tests__/imovibEdicao.test.ts`.
- [x] F3.3 `ImovibDetailView`: faixa "Editando a versão «X» — Salvar na versão · Descartar" (quem abriu;
  Descartar também para admin); "Congelar versão" desligado com o motivo; recarrega o estudo depois de
  iniciar/salvar/descartar. Teste: faixa aparece com `edicao_versao`; Congelar desligado.
- [x] F3.4 Aviso "Estudo em edição da versão «X»" em `SyncCenterTab` (empreendimento) e
  `ImovibAcompanhamentoTab`. `check-ui-standard.sh` nos `.tsx` tocados; §21/§32 (rótulo, valor escuro).

### Fase 4 — Conferência real e publicação

- [ ] F4.1 Navegador (Playwright; escritas reais **só** numa versão descartável criada e apagada no fim, com
  OK): editar um número → salvar → PDF da versão com o número novo; estudo vivo igual ao de antes; versão
  publicada do Garden com Editar/Excluir desligados e o motivo; segundo usuário vê só leitura.
- [ ] F4.2 Um PR por fase (F1 só depois da migration aplicada), CI verde, merge `--match-head-commit`,
  `conferir-producao.sh`, este plano atualizado com "Publicado no PR #".

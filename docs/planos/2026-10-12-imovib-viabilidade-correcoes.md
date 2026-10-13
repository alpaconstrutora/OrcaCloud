# Estudos de Viabilidade (Imovib) — correção do cálculo, dos dados e da tela

## Pedido original

> avalie o módulo incorporacao > Estudos de Viabilidade
>
> Sessão: b6ca195b-e4e0-4948-bda5-720e0f4f4769 · 2026-10-12

A avaliação terminou com a pergunta *"Quer que eu abra o plano de correção em
`docs/planos/`, começando pelo motor?"*, e a resposta foi:

> sim
>
> Sessão: b6ca195b-e4e0-4948-bda5-720e0f4f4769 · 2026-10-12 09:02

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-10-12 | O CAPEX detalhado (as 28 rubricas: ITBI, RET, contingência, comissão…) deve entrar no cálculo de VPL/TIR? | **Entra no cálculo.** No modo "Completo", as rubricas passam a ser somadas: valor em R$ entra direto, e o % incide sobre a base de cada rubrica (VGV para comissão e RET, custo de obra para contingência). RET e comissão saem da aba Dinâmica, para não contar duas vezes. |
| 2026-10-12 | De onde o VGV deve sair? | **Do espelho, senão do bloco.** Se o espelho de vendas tiver preço por unidade, o VGV é a soma do espelho. Se não tiver, é área privativa × preço/m² do bloco, campo que volta a ser editável em Blocos e Tipologia. Motor, Estática e listagem usam a mesma regra. |

| 2026-10-12 | Registrar VGV/VPL/TIR dos 4 estudos reais antes de mudar o motor? | **Não precisa:** *"nbao precisa regiustrar os 4 estudos existentes pois são testes. comece com a fase 1"*. Os 4 estudos do banco são de teste; a mudança de número é conferida pelos testes do motor. |

### Decisões ainda em aberto (perguntar antes do item que depende delas)

- **D1 (item 4.2).** O empreendimento "011 - Garden Cambuhy" pertence à org "Construção do Edifício Garden Cambuhy SPE", mas está ligado ao estudo "Garden Cambuhy", que pertence à org "Alpa Construtora e Incoporadora". O que fazer: mover o estudo para a SPE, desvincular, ou aceitar o vínculo entre orgs como legítimo e só bloquear a escrita?
- **D2 (item 2.6).** Remover as 109 rubricas de CAPEX duplicadas no banco. É escrita em produção e precisa de OK explícito, depois de ver a lista de pares com valores diferentes.
- **D3 (item 2.3).** Regime tributário: os estudos existentes têm RET 4% **e** "PIS/COFINS/IRPJ/CSLL (Normal)" 6,73%, os dois ligados. Qual vale em cada um dos 4 estudos?

## Diagnóstico que originou o plano

Esta seção registra o que foi medido em 2026-10-12, para que cada item possa ser conferido contra o problema original.

- **Saldo de dívida descartado.** Rodando o motor (`computeImovibMath`) isolado, com 100% de dívida, sobra no fim um saldo de R$ 10,9 mi (custo de R$ 9.000/m²) e de R$ 31,3 mi (custo de R$ 14.000/m²) que simplesmente desaparece. O VPL é o mesmo nos dois cenários: −4,48 mi. A TIR sai −100%, que é o limite inferior da bissecção, e não uma taxa.
- **Zero vira o padrão.** `tax_rate: 0` e `brokerage_fee: 0` são calculados como 4% e 6%, e dão VPL 1,24 mi contra 1,46 mi com 4% e 5%.
- **ESG some no modo simplificado.** No modo CAPEX simplificado, um ESG de R$ 1 mi não altera nenhum indicador. No modo detalhado, o mesmo ESG leva o VPL de 1,46 para 0,60.
- **Perfil de recebimento não precisa somar 100%.** Um perfil 10 + 20 + 20 (= 50%) é aceito e leva a TIR a −59,5%.
- **Preço de venda.** No banco, `sales_price_sqm` = 0 nos estudos "Bruninho" e "Davi Bueno", e não existe campo na UI para editar esse valor.
- **CAPEX duplicado.** `imovib_capex_items` tem 218 linhas para 109 rubricas distintas: os 4 estudos estão duplicados (54/54/56/54 linhas para 27/27/28/27 rubricas).
- **Write-back sem checagem de org.** `services/sync/writeBackImovib.ts` não confere a organização; o adapter de leitura confere (`imovibAdapter.ts:68-70`).
- **Zero testes do módulo.**

## Plano

Ordem: **Fase 1 → 2 → 3 → 4 → 5**. As Fases 1 a 3 mudam números exibidos ao usuário. Cada item que muda número entra com teste que mostra o antes e o depois.

### Fase 1 — Motor de cálculo (`hooks/useImovibMath.ts`)

**1.1 Testes de caracterização primeiro**
- **Arquivo:** `__tests__/imovibMath.test.ts` (novo — rodar `ls` antes de criar).
- **O que muda:** um estudo-base fixo mais os cenários do diagnóstico: dívida 100%, imposto e corretagem 0, ESG no modo simplificado, recebimento somando 50%, projeto inviável. Cada cenário afirma o comportamento CORRETO esperado e começa vermelho.
- **Como sei que terminou:** o arquivo roda e falha exatamente nos cenários dos itens 1.2 a 1.6, e passa no estudo-base.

**1.2 Saldo de dívida quitado no fim**
- **Arquivo:** `hooks/useImovibMath.ts`
- **O que muda:** o saldo devedor que sobra no último mês sai do caixa do investidor nesse mês. O resultado expõe `debtBalanceEnd`, para a tela poder mostrar.
- **Como sei que terminou:**
  - no teste da dívida 100%, o VPL com R$ 14.000/m² é menor que o VPL com R$ 9.000/m²;
  - `debtBalanceEnd` dá 0 depois da quitação;
  - o teste passa.

**1.3 Zero é zero**
- **Arquivo:** `hooks/useImovibMath.ts`
- **O que muda:** `tax_rate`, `brokerage_fee`, `financing_rate_annual`, `inflation_rate` e `discount_rate` passam a usar `??`. Mês de início e durações seguem com proteção, mas 0 ou negativo vira aviso (item 1.6), e não troca silenciosa de valor.
- **Como sei que terminou:** no teste, `tax_rate: 0` e `brokerage_fee: 0` geram receita líquida igual à bruta; `grep -n "|| [0-9]" hooks/useImovibMath.ts` não acha taxa.

**1.4 Um único conjunto de padrões**
- **Arquivos:** `constants/imovibDefaults.ts` (novo), motor, `ImovibDynamicForm`, `ImovibFundingForm`
- **O que muda:** o motor e as telas leem os padrões da mesma constante (inflação, TMA, inadimplência, distrato, recebimento 10/20/70). O que a tela exibe é o que o motor usa.
- **Como sei que terminou:**
  - teste: estudo com esses campos `null` dá o mesmo resultado que o estudo com os padrões preenchidos;
  - `grep` não acha mais literal `0.4`/`12`/`3`/`5` de padrão nas duas telas.

**1.5 TIR honesta**
- **Arquivo:** `hooks/useImovibMath.ts`
- **O que muda:** antes de bissectar, confere se o NPV troca de sinal entre os limites. Se não troca, a TIR é `NaN` (a tela já mostra "N/A") e nunca o valor de um dos limites.
- **Como sei que terminou:** o teste do projeto inviável e o da dívida 100% (antes do 1.2) não retornam −100% nem valor perto de 1000%.

**1.6 ESG no modo simplificado e avisos de premissa**
- **Arquivo:** `hooks/useImovibMath.ts`
- **O que muda:**
  - o custo ESG soma também no modo simplificado;
  - o motor retorna `avisos: string[]`, por exemplo: recebimento ≠ 100%, duração ≤ 0, estudo sem área, sem preço.
- **Como sei que terminou:** no teste, ESG de R$ 1 mi no modo simplificado reduz o VPL; o recebimento de 50% gera aviso.

**1.7 Avisos visíveis**
- **Arquivos:** `ImovibExecutiveSummary`, `ImovibCashFlow`, `ImovibSensitivityForm`
- **O que muda:** com `avisos` não vazio, aparece um banner acima dos KPIs listando os avisos, cada um com link para a aba que corrige.
- **Como sei que terminou:** no app, um estudo com recebimento de 50% mostra o banner nas 3 abas (conferido no navegador, com print).

**1.8 Mesma área em todo lugar**
- **Arquivos:** `ImovibCapexForm.tsx:110-118`, motor
- **O que muda:** a área usada na tela de CAPEX vem do motor (`totalBlockArea`, com pavimentos) e deixa de ser recalculada sem pavimentos.
- **Como sei que terminou:** o motor exporta a área; o `grep` de `totalBlockArea` em `ImovibCapexForm` não mostra mais cálculo próprio; um estudo com pavimentos > 1 mostra a mesma área nas duas abas.

### Fase 2 — CAPEX detalhado entra no cálculo (decisão de 2026-10-12)

**2.1 Base de cada rubrica**
- **Migration:** `imovib_capex_items.base text CHECK (base IN ('vgv','obra','terreno'))`.
- **O que muda:** o backfill da base vem da categoria: Terreno → terreno; Projetos, Construção, Indireta e Contingência → obra; Marketing, Impostos e Financeiras → vgv. Rubrica em R$ ignora a base. Aplicar com `db query -f`, nunca com `db push`. Não cria policy nem função; mesmo assim, registrar a resposta às duas perguntas da REGRA #7.
- **Como sei que terminou:** `SELECT base, count(*) ... GROUP BY 1` sem `NULL`; o tipo `ImovibCapexItem` tem `base`.

**2.2 Motor soma as rubricas**
- **Arquivo:** `hooks/useImovibMath.ts`
- **O que muda:** no modo `detailed`, `custo = blocos + ESG + Σ rubricas`. Distribuição no tempo:
  - base terreno → mês 1;
  - base obra → ao longo da obra;
  - base vgv → proporcional à receita do mês, no lugar de `tax_rate`/`brokerage_fee`.
  No modo simplificado, nada muda: valem `tax_rate`/`brokerage_fee` da Dinâmica.
- **Como sei que terminou:** teste com rubricas conhecidas (R$ 100 mil fixos, 3% terreno, 2% obra, 5% vgv) bate com o valor calculado à mão.

**2.3 Sem contar duas vezes**
- **Arquivos:** `ImovibDynamicForm`, `ImovibCapexForm`
- **O que muda:**
  - no modo detalhado, os campos imposto e corretagem da Dinâmica ficam desabilitados, com motivo visível ("no modo Completo, vem das rubricas 5 e 7 do CAPEX");
  - "Juros SFH / Construção" sai do template, porque os juros vêm do funding;
  - RET e regime normal ficam mutuamente exclusivos: aviso na tela quando os dois forem > 0;
  - o template de estudos novos traz só o RET ativo.
  - Estudos existentes: decisão D3.
- **Como sei que terminou:** no app, o modo Completo mostra os campos desabilitados com o motivo; com RET e normal > 0, o aviso aparece; o teste de template não tem "Juros".

**2.4 Total e base visíveis na tela**
- **Arquivo:** `ImovibCapexForm`
- **O que muda:** o total do modo Completo aparece por categoria e no geral; cada % mostra a base e o valor em R$ resultante.
- **Como sei que terminou:** o total exibido é igual ao custo total do motor (conferido no navegador em um estudo real).

**2.5 PDF coerente**
- **Arquivo:** `ImovibExecutiveSummary.tsx:400-431`
- **O que muda:** o "Master Budget" mostra os valores das rubricas que o motor usou.
- **Como sei que terminou:** o total do PDF bate com o custo do Resumo no mesmo estudo.

**2.6 Fim da duplicação**
- **Arquivos e banco:** `ImovibCapexForm.tsx:134-173`, `imovibService.upsertCapexItems`, migration
- **O que muda:**
  - **Primeiro (precisa da decisão D2):**
    - listar os pares duplicados com valor divergente;
    - guardar uma cópia numa tabela de reversão;
    - apagar a cópia mais nova de cada par.
  - **Depois:**
    - `UNIQUE (study_id, category, name)`;
    - seed com `ON CONFLICT DO NOTHING`;
    - seed só quando o estudo nunca recebeu template (flag `capex_seeded_at`), para que apagar todas as rubricas não recrie o template.
- **Como sei que terminou:**
  - a query `count(*) - count(distinct (study_id,category,name))` dá 0;
  - abrir a aba duas vezes seguidas (StrictMode em dev) não cria linha nova;
  - a tabela de reversão existe.

### Fase 3 — VGV: espelho, senão bloco (decisão de 2026-10-12)

**3.1 Preço/m² editável**
- **Arquivo:** `ImovibBlocksTypologyTab.tsx`
- **O que muda:** campo "Preço de venda/m²" no cabeçalho do bloco, ao lado do custo, com o mesmo padrão de gravação da tela.
- **Como sei que terminou:** no app, editar o preço de "Bruninho" muda o VGV no Resumo e na listagem.

**3.2 Uma função de VGV**
- **Arquivos:** motor, `imovibService.getStudyById` / `getStudiesWithMetrics`
- **O que muda:** o VGV é calculado por bloco. Se o bloco tem instâncias vendáveis com preço > 0, o VGV dele é Σ dos preços das instâncias; senão, área privativa × preço/m². O estudo passa a carregar as instâncias (na listagem, em lote, sem N+1).
- **Como sei que terminou:**
  - teste: bloco com espelho usa a soma; bloco sem espelho usa o preço/m²; misto soma os dois;
  - a listagem continua com consultas fixas (contar no código).

**3.3 Estática usa o motor**
- **Arquivo:** `ImovibStaticViability.tsx`
- **O que muda:** VGV, custo de obra e terreno vêm do motor. Somem as fórmulas próprias (T.O. × terreno × pavimentos). Se o estudo não tem área, aparece o aviso do motor, e não custo 0.
- **Como sei que terminou:** num estudo real, Estática e Resumo mostram o mesmo VGV e o mesmo custo de obra; o `grep` de `vgvFormula` dá 0.

**3.4 Espelho e textos**
- **Arquivos:** `ImovibSalesMapTab.tsx:185`, `ImovibExecutiveSummary.tsx:291`
- **O que muda:** o VGV do cabeçalho do espelho usa a mesma função; sai a frase "com base no Estudo Estático".
- **Como sei que terminou:** o mesmo número nas 3 telas, conferido no navegador.

### Fase 4 — Dados, organização e permissões

**4.1 Write-back confere a org**
- **Arquivo:** `services/sync/writeBackImovib.ts`
- **O que muda:** a mesma checagem do `imovibAdapter.ts:68-70` em `load()` e em `apply()`. Org diferente bloqueia, com mensagem.
- **Como sei que terminou:** teste com estudo de outra org: `apply` recusa e não chama `createBlock`.

**4.2 Vínculo entre orgs existente**
- **Depende da decisão D1.**
- **O que muda:** ação no banco conforme D1, mais uma trava que impede gravar `empreendimentos.imovib_study_id` de outra org (no serviço; e no banco, se D1 disser que o vínculo nunca é legítimo).
- **Como sei que terminou:** a query de vínculo entre orgs dá 0 linhas, ou o vínculo é documentado como aceito.

**4.3 Write-back idempotente**
- **Arquivo:** `writeBackImovib.ts:161-187`
- **O que muda:** antes de criar o bloco ou a instância, procura pela proveniência (`imovib_block_id`/`imovib_instance_id`). Se o vínculo falhou na metade, o reenvio adota o que já existe em vez de duplicar.
- **Como sei que terminou:** teste que simula falha no `updateTower` e reenvia sem duplicar o bloco.

**4.4 Regenerar o espelho sem perder dados**
- **Arquivo:** `ImovibSalesMapTab.tsx:92-104`
- **O que muda:** "Regenerar" atualiza as instâncias existentes por nome, cria só as que faltam e pergunta antes de remover as que sobraram. Preço e status manuais e os IDs ficam preservados. Troca o `window.confirm` por `useConfirm`.
- **Como sei que terminou:** no app, regenerar mantém o preço editado à mão; depois disso, o sync com o empreendimento não cria torre nova.

**4.5 Organização ativa (REGRA #5)**
- **Arquivos:** `AppRouter.tsx:985-994`, `SalesManagementModule`, `ImovibDashboard`, `ImovibForm`
- **O que muda:** a org vem de `useOrgContext()`; a criação usa `useOrgWriteTarget`; com uma empresa selecionada no topo, a lista filtra pela org da empresa.
- **Como sei que terminou:**
  - `npx vitest run __tests__/orgContextGuard.test.ts` verde;
  - `bash scripts/check-org-selector-guard.sh` verde;
  - no app, criar um estudo com empresa selecionada no topo funciona.

**4.6 Permissões aplicadas**
- **Arquivos:** telas Imovib, `AppRouter.tsx:260`
- **O que muda:**
  - sem `canEditImovib`, as abas ficam em leitura (campos desabilitados, com o motivo) e não aparecem os botões de criar ou excluir;
  - a guarda de `canViewImovib` vale também em "Todas".
- **Como sei que terminou:** no app, com um usuário sem `canEditImovib`, não há como gravar pela tela.

**4.7 Falhas visíveis**
- **Arquivos:** todos os `console.error` sem aviso listados na avaliação (DynamicForm, EsgReportForm, SensitivityForm, CapexForm, BlocksTypologyTab, SalesMapTab, `imovibService.getStudyById`)
- **O que muda:** os erros viram toast do §13; `getStudyById` propaga o erro em vez de devolver `[]`.
- **Como sei que terminou:** `grep -n "console.error" components/Imovib*.tsx` só mostra linhas que também chamam `toast`.

### Fase 5 — Tela e fluxo

**5.1 Editar nome, fase, segmento e versão**
- **O que muda:** botão "Editar" no detalhe, abrindo um drawer (`Sheet`); a criação também passa a ser `Sheet`. Some o modo edição morto e a página cheia.
- **Como sei que terminou:** no app, renomear o estudo atualiza a lista; `check-ui-standard.sh` limpo no `ImovibForm`.

**5.2 Campos duplicados unificados**
- **O que muda:** a criação grava as mesmas colunas que Premissas edita (`spe_cnpj`, `developer_name`, `project_manager`); a listagem lê essas colunas. "% Financiado" (Dinâmica) e "Financ. à Produção" viram um campo só.
- **Como sei que terminou:** no app, editar a incorporadora em Premissas muda a lista; o `grep` de `financing_percent` só aparece na migração de dados.
- **Mudança de rumo (2026-10-12, ao executar):**
  - **Colunas canônicas:** a canônica passou a ser `cnpj`/`developer`/`manager`, as que a criação e a listagem já usavam. As outras (`spe_cnpj`/`developer_name`/`project_manager`) viram só fallback de leitura.
  - **Sem migração:** os pares quase não tinham dado (só "ALPA" em `developer_name` no Bruninho) e "% Financiado" está 0 nos 4 estudos.
  - **`financing_percent` continua lido:** o motor (fallback quando `funding_debt_percent` está vazio), a tela (valor efetivo só leitura) e a planilha. Isso substitui o critério do `grep` acima.

**5.3 Foco nos campos de Receitas**
- **Arquivo:** `ImovibFundingForm.tsx:40`
- **O que muda:** `InputRow` sai de dentro do render.
- **Como sei que terminou:** no app, digitar "12,5" num campo não perde o foco.

**5.4 Edição não salva**
- **Arquivo:** `ImovibPremisesForm`
- **O que muda:** `useUnsavedChanges` (§25) ao trocar de aba; o botão "Salvar Premissas" sai da sub-aba Torres.
- **Como sei que terminou:** no app, trocar de aba com edição pendente pede confirmação.

**5.5 Rating usa a TMA do estudo**
- **Arquivo:** `ImovibEsgReportForm.tsx:53`
- **O que muda:** a TIR mínima do rating passa a ser a TMA do estudo, no lugar dos 12% fixos.
- **Como sei que terminou:** teste ou print com TMA de 15%.

**5.6 Exportação**
- **Arquivo:** `ImovibExecutiveSummary.tsx:47, 137`
- **O que muda:** corrige a classe quebrada do selo de status; o Excel ganha uma aba de KPIs e premissas; tira o espaço do nome do arquivo.
- **Como sei que terminou:** PDF e Excel gerados e abertos (prints).

**5.7 Guia de UI**
- **O que muda:** `check-ui-standard.sh` limpo nos 6 arquivos com violação; `alert`/`prompt` trocados por toast, `useConfirm` ou drawer.
- **Como sei que terminou:** o script sai com 0 nos 14 `Imovib*.tsx`; `grep -n "alert(\|prompt(\|confirm(" components/Imovib*.tsx` dá 0.

## Estado

- [x] **Fase 1 — 8 de 8** (2026-10-12):
  - [x] **1.1** — `__tests__/imovibMath.test.ts`, 16 casos. Contra o motor antigo, 15 falharam pelos motivos do diagnóstico; o 16º (fluxo sem troca de sinal → NaN) já passava.
  - [x] **1.2** — O resultado expõe `debtPayoffAtEnd` (o valor quitado). O texto original dizia `debtBalanceEnd`, mas esse campo daria sempre 0 depois da quitação, então troquei por um que mostra quanto foi quitado. Também gera o aviso `divida_quitada_no_fim`.
    - 100% de dívida a R$ 9.000/m²: VPL −12,81 mi, quitação de 10,86 mi.
    - 100% de dívida a R$ 14.000/m²: VPL −28,52 mi, quitação de 31,32 mi.
    - Antes, os dois davam −4,48 mi.
  - [x] **1.3** — `??` nas taxas. Cronograma inválido usa o padrão e gera o aviso `cronograma_invalido`.
  - [x] **1.4** — `constants/imovibDefaults.ts`, lido pelo motor, pela Dinâmica, por Receitas & Capital e pelos textos do Fluxo de Caixa.
  - [x] **1.5** — Bissecção com checagem de troca de sinal no intervalo [−90%, 1000%] a.m. Sem raiz, devolve NaN. Os testes conferem que a TIR devolvida zera o VPL.
  - [x] **1.6** — ESG soma também no CAPEX simplificado. Avisos novos: `recebimento_nao_soma_100`, `sem_area`, `sem_preco`.
  - [x] **1.7** — `components/ImovibAvisosBanner.tsx` no Resumo, na Sensibilidade e na Dinâmica, com "Corrigir em …" que troca a aba. **Provado no navegador** (preview da frente, conta agente-leitura, roteiro `c:/tmp/pwtest/imovib_avisos_banner.js`, escritas bloqueadas: 0, erros de console: 0):
    - Bruninho: banner nas 3 abas ("Nenhum bloco tem preço de venda por m²"); "Corrigir em Premissas" abre Premissas.
    - Davi Bueno: o banner achou 2 problemas reais do estudo de teste: sem tipologia com área, e recebimento somando **180%**.
    - Garden Cambuhy: sem banner.
  - [x] **1.8** — `ImovibCapexForm` usa `math.totalBlockArea`, que considera os pavimentos.
  - Estudo-base sem regressão: VPL 1,46 mi e TIR 20,81%, iguais ao motor antigo.
  - **REGRA #1 nos arquivos tocados** (antecipa o item 5.7 nesses arquivos): `check-ui-standard.sh` dá exit 0 em CashFlow, ExecutiveSummary, DynamicForm, CapexForm, Sensitivity, Funding, DetailView e no banner novo. Correções: §7 em `<td>` (CashFlow, ExecutiveSummary, CapexForm), §8 na pílula "Salvando…" (DynamicForm) e §14 `window.confirm` → `useConfirm` (CapexForm). O `alert`/`prompt` do CapexForm continua no 5.7.
- [x] **Fase 2 — 6 de 6** (2026-10-12). Migrations aplicadas às 15:36 UTC, com o OK do usuário (*"Aplique as duas migrações agora"*). Prova no navegador (Davi Bueno, modo Completo):
  - Dinâmica com 2 campos desabilitados e o motivo visível.
  - Card "Rubricas no cálculo": R$ 40.000 (terreno 15.000 · obra 25.000 · VGV 0, porque o estudo não tem área).
  - Coluna "No cálculo" nas 9 categorias e 26 seletores de base.
  - Sem aviso de impostos em dobro.
  - Controle negativo: o Bruninho, no Simplificado, ficou com 0 campos desabilitados.
  - Banco conferido depois do teste: nada gravado.
  - Detalhe de cada item:
  - **Decisões:** D2 — apagar duplicatas com reversão; D3 — **regime normal** (RET vai a 0 nos estudos de teste; o template de estudos novos também traz RET 0 e o normal 6,73%).
  - **Ordem obrigatória:** aplicar `aplicar_20271012100000` e `aplicar_20271012100100` ANTES de publicar o código, porque o serviço passa a ler `base` e `capex_seeded_at` (sem a migration, dá 42703).
  - [x] **2.1** — (aplicada; base conferida por categoria) `aplicar_20271012100000_imovib_capex_base.sql`: coluna `base` + CHECK + backfill pela categoria. O motor também deduz a base pela categoria (`baseDaRubrica`) quando ela vem vazia.
  - [x] **2.2** — Motor soma as rubricas: terreno no mês 1; obra ao longo da obra (financiável); % de VGV deduzido junto com a receita; valor fixo de VGV ao longo das vendas. Com rubricas, imposto e corretagem da Dinâmica não entram. O resultado traz `capexRubricas` e `capexValorPorRubrica`. 7 testes novos, incluindo um calculado à mão. A listagem passa a carregar as rubricas em lote (4 consultas fixas, antes 3), para bater com o Resumo.
  - [x] **2.3** — Dinâmica: imposto e corretagem desabilitados no modo Completo, com o motivo no `title` e no texto. Template sem "Juros SFH". Aviso na tela quando há mais de um imposto com valor.
  - [x] **2.4** — CAPEX: card "Rubricas no cálculo" (terreno/obra/VGV/total) e colunas **Base** (editável) e **No cálculo** (R$ do motor), com total por categoria.
  - [x] **2.5** — PDF "Master Budget": premissa com a base certa ("3% do terreno", e não "% do VGV" em tudo), R$ do motor por rubrica e total.
  - [x] **2.6** — (aplicada: 218 → 105, 0 duplicatas, reversão 117, trava criada) Código: `imovibService.seedCapexTemplate` idempotente (upsert com `ignoreDuplicates` na trava única + `capex_seeded_at`); Premissas deixou de gravar `capex_seeded_at`. Banco: `aplicar_20271012100100_imovib_capex_dedup_unique.sql`. A cópia que fica é a criada PRIMEIRO, porque nenhuma rubrica foi editada depois de criada e nos 3 pares divergentes o valor informado está na mais antiga.
  - **Ensaio no banco real** com `ROLLBACK` (as duas migrations juntas):
    - 218 → 105 linhas, 0 duplicatas, 0 "Juros", 0 RET com valor, 0 base nula;
    - base: obra 57, terreno 16, vgv 32;
    - reversão com 117 linhas;
    - 4 estudos com `capex_seeded_at`;
    - Bruninho mantém ITBI 4% e comissão do terreno 4%.
    - Depois do `ROLLBACK`, o banco continuou com 218 linhas e sem a coluna `base`.
- **Publicação das Fases 1 e 2** (2026-10-12, pedido: *"Publicar as Fases 1 e 2 agora. e na sequencia seguir para a fase 3"*):
  - O 1º push foi recusado porque outra frente entrou no `main` durante a suíte. Refiz o rebase e rodei a suíte de novo.
  - Suíte inteira: rc 0, 8.668 testes. `verificar:build`: rc 0.
  - `main` = `45414a15`. `conferir-producao.sh` confirmou que o domínio serve `45414a1`.
  - Check-run `ci` do GitHub no `45414a1`: **completed / success**.
- [x] **Fase 3 — 4 de 4** (2026-10-12):
  - [x] **3.1** — "Preço de venda (R$/m²)" no corpo de cada bloco (Premissas › 2. Blocos e Tipologia), com o VGV do bloco e a origem dele, vindos do motor.
  - [x] **3.2** — VGV por bloco no motor. Com espelho, cada unidade vale o próprio preço; unidade sem preço vale área × preço/m²; PERMUTADA fica fora. Sem espelho, vale área privativa **vendável** × preço/m².
    - Achado novo: tipologia `is_vendavel = false` (área comum) entrava no VGV. Agora entra só no custo.
    - Aviso novo `permuta_em_dobro`: espelho com permutada e Permuta Física > 0.
    - O espelho é carregado no detalhe (falha propaga, não cai em silêncio para preço/m²) e em lote na listagem (5 consultas, 3 níveis).
    - Premissas deixou de gravar `unit_instances`.
    - 5 testes novos: 28 no total.
  - [x] **3.3** — Estática reescrita sobre o motor: VGV, terreno, obra, rubricas do CAPEX (no modo Completo) e áreas. Saíram as fórmulas próprias (`vgvFormula`, T.O. × terreno × pavimentos). Ganhou o banner de avisos e ficou com o guia de UI limpo.
  - [x] **3.4** — O cabeçalho do espelho usa `math.vgvTotal`. Mudar o status de uma unidade recarrega o estudo, porque a permutada sai do VGV. O texto "com base no Estudo Estático" foi corrigido.
    - **VGV exibido** (Estática, Espelho, listagem, Resumo) = `vgvTotal`, que inclui o prêmio ESG. A Estática diz quando há prêmio.
    - **Guia de UI no espelho:** §7 (9×) e §14 (`window.confirm` → `useConfirm`), por causa da REGRA #1 em arquivo tocado.
  - **Correção do item 1.5, achada na prova da Fase 3:**
    - **Sintoma:** a listagem mostrou o Garden Cambuhy com TIR "—" e VPL de R$ 12 mi.
    - **Causa:** o fluxo dele é + → − → + (sinal de venda antes da obra, terreno 0) e o VPL cruza o zero duas vezes (~10% e ~30% a.m.). A checagem do 1.5 só comparava os extremos do intervalo, positivos nos dois, e devolvia NaN.
    - **Já está em produção desde a publicação das Fases 1 e 2.** Antes delas, o motor antigo mostrava "> 999%" para esse mesmo fluxo.
    - **Correção:** `calcularTirMensal` varre o VPL em grade e refina cada troca de sinal. Com mais de uma raiz, devolve a de menor módulo e gera o aviso `tir_multipla`. 4 testes novos (raiz única, duas raízes a 10%/20%, sem raiz, formato do Garden): 32 no total.
    - **Dados reais**, todos com VPL na TIR = 0,00:
      - Garden: 214,8% a.a. + aviso de TIR múltipla;
      - Bruninho: 14,4%;
      - Córrego: −15,1%;
      - Davi: sem TIR (sem área).
  - **Prova no navegador** (roteiro `c:/tmp/pwtest/imovib_fase3.js`, escritas bloqueadas: 0, erros de console: 0):
    - Bruninho: R$ 9.999.998 na listagem, na Estática ("pelo espelho de vendas"), no bloco e no Espelho. Sem banner, porque o "sem preço" sumiu.
    - Garden: R$ 38.400.000 na listagem, na Estática ("área privativa vendável × preço/m²") e no bloco (R$ 8.000/m² no campo). Não tem espelho gerado, então não há o número do Espelho.
  - **Esperado no navegador (registrado antes da prova):**
    - Bruninho (espelho com 16 unidades precificadas, soma R$ 9.999.998, preço/m² 0): sai de VGV 0 com aviso "sem preço" para R$ 9.999.998 na Estática, no Espelho e no bloco.
    - Garden (sem espelho, R$ 8.000/m²): origem "área privativa vendável × preço/m²".
- **Publicação da Fase 3** (2026-10-12, *"publicar? sim"*):
  - Rebase sobre 1 commit novo de outra frente; suíte inteira com rc 0 (8.677 testes); `verificar:build` com rc 0.
  - `main` = `838bd0d9`. O domínio serve `838bd0d` (conferido na 2ª tentativa). Check-run `ci`: **completed / success**.
- [ ] **Fase 4 — 4 de 7** (2026-10-12):
  - **Decisão D1 (2026-10-12):** *"Mover o estudo para a SPE."* Antes de gravar, avisei que 3 contas só da Alpa perderiam o acesso, entre elas desenvolvedor@. Resposta: *"Mover e incluir as 3 na SPE"*.
  - [x] **4.1** — `writeBackImovib.load()` confere a org do estudo contra a do empreendimento, como `imovibAdapter` já fazia. Vale para a prévia e para a gravação. Testes em `__tests__/writeBackImovib.test.ts`: org diferente recusa sem chamar `createBlock`/`createUnitInstances`/`updateTower`/`updateUnit`.
  - [x] **4.2** — Migration `aplicar_20271012100200_imovib_garden_cambuhy_para_spe.sql`, ensaiada com `ROLLBACK` e aplicada:
    - o estudo foi para a SPE;
    - desenvolvedor@, bruna.pereira@ e iago.marques@ entraram na SPE com papel e permissões copiados da Alpa (SPE: 3 → 6 membros);
    - vínculos entre orgs: **0**;
    - script de volta no arquivo.
    - Trava no serviço: `empreendimentoLinksService.linkImovibStudy` recusa estudo de org diferente da do **empreendimento** (lida do banco). O formulário do empreendimento já listava só estudos da própria org e limpava o vínculo ao trocar de org.
    - Pendência fora do escopo: `plantaAiIntegration.ts:224` liga a **oportunidade de investidor** ao estudo Imovib por `planta_ai_study_id`, sem conferir a org.
  - [x] **4.3** — `applyWriteBackImovib` adota o bloco ou a instância órfãos de mesmo nome (criados numa rodada que falhou antes de gravar o vínculo) em vez de criar outro. Não adota bloco já reivindicado por outra torre. O resultado ganhou `blocksAdopted`/`instancesAdopted`. 3 testes.
  - [x] **4.4** — `utils/imovibEspelho.ts`: `montarEspelho` + `planejarRegeneracao` (casa por bloco + nome).
    - "Regenerar" passou a "alinhar": cria o que falta e atualiza só a estrutura (pavimento, área, tipologia). Preço, status, posição, sol e ID ficam.
    - Unidade sobrando só sai com uma 2ª confirmação ("Manter" é opção).
    - "Gerar" relê o banco e cria só o que falta, então o falso "não gerado" não duplica mais.
    - Novo `imovibService.deleteUnitInstancesByIds`. 5 testes.
  - [x] **4.5** — `ImovibDashboard` lê a org de `useOrgContext()` (empresa no topo herda a org; "Todas" = null, não bloqueia) e `ImovibForm` cria com `useOrgWriteTarget` no modo `'single'` (topo com org/empresa = sem pergunta; "Todas" = modal), no lugar do `alert('selecione uma organização')`. A prop crua `organizationId` ficou ignorada nos dois. `SalesManagementModule` continua passando a prop para os outros submódulos (Vendas, Locações), fora do escopo. Verificado: `orgContextGuard` 14/14, `check-org-selector-guard.sh` exit 0.
  - [x] **4.6** — Decisão (2026-10-12): *"Aplicar canEditImovib"*. Sem a permissão, o estudo abre só para leitura. A trava de rota em "Todas" continua igual à dos outros módulos.
    - **Prova no navegador** (`c:/tmp/pwtest/imovib_somente_leitura.js`, que simula `canEditImovib=false` na Alpa alterando só a resposta de `organization_members` no navegador; escritas bloqueadas: 0; erros de console: 0; banco conferido sem gravação):
      - Bruninho: aviso com o motivo; Dinâmica 10/10 campos travados; preço/m² travado; sub-aba, "Exportar PDF" e os 2 sliders livres.
      - Davi Bueno: "Expandir Tudo" livre; 26/26 bases e 27/27 valores do CAPEX travados.
      - Garden (SPE, admin): sem aviso; só 2/10 travados, que são imposto e corretagem, fora do cálculo pelas rubricas.
    - **Ajuste depois da prova:** o print mostrou os campos travados com a mesma cara dos editáveis. Agora os fieldsets têm a classe `imovib-ro`, e `index.css` dá opacidade 0,6 e cursor de bloqueado só a eles (outras telas com fieldset disabled não mudam).
    - **Regra** — `hooks/useImovibEdicao.tsx` (`avaliarEdicaoImovib`, 6 testes). Avaliada sobre a org **dona do estudo**:
      - desenvolvedor, admin e owner editam;
      - `canEditImovib` definido no membro vale; sem definição, segue o papel (viewer não edita);
      - quem não é membro da org do estudo: só leitura.
      - Hoje ninguém perde acesso: nas duas orgs, todos têm `canEditImovib` true ou vazio.
    - **Telas** (feito por subagente, conferido por mim):
      - aviso "Somente leitura — motivo" no detalhe;
      - `<fieldset disabled title=motivo>` só nas regiões que gravam, nas 8 abas;
      - continuam livres: sub-abas, expandir/recolher, exportar, "Corrigir em…", sliders de stress test e "Tentar de novo";
      - listagem: excluir e "Novo estudo" com motivo;
      - criar/editar estudo: recusa com toast;
      - CAPEX: quem só lê não aplica o template de rubricas ao abrir.
    - **Complemento (2026-10-12):** Premissas › "3. Torres & Unidades" e "4. Mapa Regulatório" gravam no **empreendimento** (TowerEditor/MapaRegulatorioEditor). Expliquei que, travando pela permissão do estudo, quem pode editar empreendimentos ainda edita as mesmas torres pelo módulo Empreendimentos. Decisão: *"2. Travar também pela permissão de estudo."*
      - Prop opcional `somenteLeitura` (o motivo) em `TowerEditor`, `MapaRegulatorioEditor` e `RegulatoryZoneTable`, repassada por `EstudoTorresUnidades`/`EstudoMapaRegulatorio` e passada só pela Viabilidade. **Sem a prop, nada muda** no módulo Empreendimentos nem na Planta AI.
      - Travam: barra de terreno, nova torre, editar/excluir torre, pavimentos e unidades, "Nova zona", "Importar de mapa cadastrado", células e excluir zona.
      - Continuam livres: expandir torre, busca, colunas e ordenação da tabela de zonas.
      - Verificado: tsc exit 0; `check-ui-standard` exit 0 nos 6 arquivos; testes relacionados 17/17.
      - **Prova no navegador** (`c:/tmp/pwtest/imovib_ro_torres_mapa.js`, Garden simulando falta de permissão na SPE; escritas bloqueadas: 0; erros de console: 0):
        - aviso visível; "Adicionar torre", "Adicionar Terreno", "Nova zona" e "Importar" desabilitados; 26/26 células do mapa travadas; busca do mapa livre;
        - nas Torres, 44/45 campos travados. No print, o único campo de texto livre é a busca do topo do app ("Buscar contratos…"), fora do estudo — não confirmado pelo log.
      - Publicação da Fase 4 (4.1–4.7, sem este complemento): `main` = `d8181eb2`.
        - O 1º push foi recusado (outra frente entrou); rebase e suíte de novo: 8.724 testes, rc 0; `verificar:build` rc 0.
        - A Vercel ficou em "deploying" por mais de 7 min. Esperei o status virar `success`, e o `conferir-producao.sh` confirmou que o domínio serve `d8181eb`.
        - Check-run `ci` no `d8181eb`: **completed / success**.
  - [x] **4.7** — Falhas visíveis em 12 componentes + serviço (feito por um subagente na frente; conferido por mim):
    - 0 `alert(`. Cada um dos 36 `console.error` avisa o usuário na mesma função.
    - `getStudyById` propaga erro de blocos/unidades/CAPEX (antes devolvia `[]` e o VGV/custo caía a zero em silêncio).
    - Espelho: falha de leitura vira estado de erro com "Tentar de novo"; o "Gerar" só aparece com leitura OK e vazia.
    - ESG `toggleInitiative` com `await`/`catch`. Excluir tipologia pede confirmação.
    - `saveMode` do CAPEX volta ao modo anterior se a gravação falha.
    - Efeito a saber: `OpportunityDetail` e `imovibAdapter` também chamam `getStudyById`; uma falha parcial agora interrompe em vez de mostrar estudo vazio.
    - Verificado: tsc exit 0; `check-ui-standard` exit 0 nos 14 `Imovib*.tsx`; testes do módulo + `orgContextGuard` + `SyncCenterTab` 62/62.
- [x] **Fase 5 — 7 de 7** (2026-10-12, pedido: *"2"*, ou seja, Fase 5 e depois publicar junto com o complemento de Torres/Mapa). Feita por 2 subagentes em paralelo, com arquivos separados, e conferida por mim: tsc exit 0; `check-ui-standard` exit 0 em 15 arquivos; 83 testes em 10 arquivos; `check-org-selector-guard` exit 0; 0 `prompt(`/`alert(`/`window.confirm(`.
  - [x] **5.1** — `ImovibForm` virou drawer (Sheet `xl`), usado para criar (listagem) e editar (botão "Editar" no cabeçalho do detalhe, travado sem permissão).
    - Pede a confirmação de saída do §25. Toast de sucesso e de erro.
    - Depois de criar, abre o estudo criado.
    - Saíram a página cheia e o código morto (`editingImovibStudyId`).
    - Zoneamento, CA, TO e EIV saíram da criação: nenhum cálculo lê essas colunas (o Mapa Regulatório mora no empreendimento).
  - [x] **5.2** — `constants/imovibClassificacao.ts`: listas únicas (segmento, subclassificação, fase, modalidade) e leitura com fallback.
    - Premissas edita `cnpj`/`developer`/`manager`, e a listagem lê com fallback. Modalidade é select nos dois lugares.
    - "% Financiado" saiu da Dinâmica; no lugar, o valor efetivo, só leitura.
    - **Motor:** `funding_debt_percent` preenchido (inclusive 0) vale; o legado só entra quando ele está vazio. Antes, 0 caía no legado. 2 testes.
    - Cores de fase alinhadas às fases reais.
  - [x] **5.3** — `InputRow` fora do render (módulo), com rascunho local ("12," não vira 0) e `aria-label`. O teste `ImovibFundingFormFoco` falha na versão antiga e passa na nova.
  - [x] **5.4** — `useUnsavedChanges` em Premissas, avisando ao trocar de sub-aba ou aba, ao voltar, ao clicar em Editar e na Planta AI. "Salvar Premissas" aparece só em 0/1 e fica desabilitado sem alteração, com o motivo.
  - [x] **5.5** — `calcularRatingOpura` (pura, 3 testes): a barreira é a TMA do estudo, e o cartão mostra "TIR ≥ TMA do estudo (X% a.a.)".
  - [x] **5.6** — Selo do PDF corrigido (texto simples §8). Nomes de arquivo sem espaço (Excel agora `_Viabilidade.xlsx`).
    - Excel com 3 abas (Indicadores, Premissas, Fluxo de caixa), montado por `montarPlanilhaImovib`, com teste.
    - Financiamento na planilha segue a regra do motor.
  - [x] **5.7** — `window.prompt` do CAPEX virou uma linha de inclusão inline (Enter/Esc, duplicado avisado antes do banco, dentro do fieldset só leitura), com teste. O "Novo" saiu de dentro do botão de expandir (botão dentro de botão).
  - **1ª prova no navegador (`c:/tmp/pwtest/imovib_fase5.js`):**
    - **Passou:** drawer de editar preenchido; "Salvar Premissas" em Identificação (1) e não em Torres (0); aviso "Sair sem salvar?"; foco mantido ao digitar 12,5; "TIR ≥ TMA do estudo (12% a.a.)"; Excel `_Viabilidade.xlsx` com abas Indicadores/Premissas/Fluxo de caixa e valores coerentes; rubrica inline abre e fecha com Esc, sem prompt nativo.
    - **PDF NÃO saía**, com o erro `unsupported color function "oklch"`: o html2canvas 1.4 não entende as cores do Tailwind v4. Provavelmente quebrado em produção desde a migração para o v4, porque a captura não mudou.
      - Correção: `utils/html2canvasCores.ts` (`coresCompativeisNaCopia`) no `onclone`. Na CÓPIA, toda cor oklch/oklab/lab/lch/color-mix vira rgba (inclusive dentro de gradiente e sombra) e as sombras saem. A tela não é tocada.
      - Prova em página local com o CSS real do build: sem a correção, o mesmo erro; com ela, gera, e o pixel do cartão azul dá rgb(37, 77, 239). 4 testes da troca de funções.
      - **2ª prova no app: o PDF ainda falhava.** Causa: o html2canvas SEMPRE lê a cor de fundo do `<html>` e do `<body>` da cópia (`parseBackgroundColor`), mesmo com `backgroundColor` informado e capturando só um elemento.
        - No app o body tem fundo oklch. A página de teste usava `bg-white` (#fff, sem oklch), por isso não reproduziu o caso real.
        - Corrigido: `<html>`/`<body>` da cópia entram no tratamento.
        - A prova passou a valer: com body `bg-gray-50` (oklch), a versão anterior falha com o MESMO erro do app e a nova gera.
      - **Outras telas** (pedido: *"verificar e Corrigir"*): `ContractDetailView` (PDF do contrato), `FinancialSchedule` (cronograma financeiro) e `PaystubModal` (holerite) não tinham proteção e agora usam `coresCompativeisNaCopia`. `docxRenderService` já se protegia (iframe isolado); `opuraMarketRelatorioPdf` desliga folhas de estilo (serve para mapa).
        - Holerite: 6 `<td>` com `font-bold`/`font-black` (§7, anteriores) corrigidos por causa da REGRA #1.
        - Verificado: tsc rc 0; `check-ui-standard` rc 0 nos 3; 115 testes existentes dessas telas passando.
        - **Não provado no app tela a tela** (precisa de contrato/holerite com dados): o mecanismo é o mesmo provado acima.
      - **Erro meu de verificação** (achado aqui): o loop `echo "$(basename $f) exit=$?"` imprimia o `$?` do `basename`, não o do verificador. Refeito com `rc=$?` logo depois do comando: os 6 arquivos de Torres/Mapa estavam de fato limpos (rc 0, 0 linhas).
    - **"Cancelar" do drawer de criar "não fechou":** falso alarme do roteiro. O Sheet fechado continua montado (só desliza com translate-x), e o drawer de editar abriu normal logo depois. O roteiro passou a conferir a posição do campo.
  - **Causa final do PDF** (diagnósticos `c:/tmp/pwtest/imovib_diag_pdf.js` e `imovib_diag_pdf2.js`): faltava `-webkit-text-stroke-color` na lista. O html2canvas a lê como cor, e no Resumo real ela seguiu em oklch.
    - O 1º diagnóstico varreu todas as propriedades e mostrou as que o html2canvas nem lê (bordas lógicas, `text-emphasis-color`, `-webkit-text-fill-color`).
    - O 2º rodou a captura na página real com html2canvas não minificado: com a propriedade tratada, gerou, e não sobrou nenhuma cor moderna na cópia (341 propriedades reescritas).
  - **Prova final no app** (roteiro da Fase 5, botão real; escritas bloqueadas: 1, o salvamento no blur de "Sinal / Ato", interceptado; erros de console: 0):
    - `Imovib_Garden_Cambuhy_Viabilidade.pdf` gerado, 769 KB, começando com `%PDF-`.
    - A imagem extraída do PDF mostra os KPIs, a Curva S, o ESG e o Master Budget com base ("3% do terreno", "4% da obra", "5% do VGV") e total de R$ 7.037.982, igual ao card do CAPEX.
    - "Cancelar" do drawer de criar: o campo foi para x = 1640 (fora da tela), ou seja, fechou.
  - **Publicação da Fase 5 + Torres/Mapa + PDFs:** `main` = `071b4ced`.
    - Rebase sobre 9 commits; 2 deles eram da frente "cabeçalhos sem cinza", que tocou arquivos daqui.
    - Suíte inteira: 8.751 testes, rc 0 (inclusive a trava de cabeçalho); `verificar:build` rc 0.
    - O domínio passou a servir `071b4ce`. Check-run `ci` no `071b4ce`: **completed / success**.
  - **Pendências corrigidas** (pedido de 2026-10-12: *"corrigir: Pendências pequenas no plano"*):
    - [x] **(a) Escala de raio em Premissas (§16):**
      - campos `h-9 rounded-[6px]`, containers `rounded-[10px]`;
      - sub-abas e "Salvar Premissas" no botão compacto da §17;
      - de quebra, o título "Módulo 2 — Análise de Mercado" virou "Módulo 1" (a sub-aba é a 1);
      - 0 classes da escala antiga no arquivo.
    - [x] **(b) Notas ESG fora do render:** `NotaEsg` de módulo, com tipos, `aria-label` "Ambiental (E): nota N de 5", `aria-pressed` e `rounded-[6px]`. 2 testes (`__tests__/components/ImovibEsgNota.test.tsx`): mesmo nó depois de renderizar de novo, e o clique grava `esg_governance_score`.
    - [x] **(c) Trocar de módulo com edição pendente:**
      - `lib/guardaDeSaida.ts`: registro global de pendências por adesão, com `useUnsavedChanges({ guardarNavegacao: true })`;
      - `App.trocarDeTela` passou a ser o `onChangeView` do Layout, então menu, paleta e menu de perfil perguntam;
      - `useTabRouter`: voltar/avançar pergunta e, se cancelar, restaura o endereço;
      - `beforeunload` ao fechar ou recarregar a aba;
      - só Premissas adere: há drawers que ficam montados com dirty=true e perguntariam à toa. 4 testes.
    - Verificado: tsc rc 0; `check-ui-standard` rc 0 (Premissas, ESG); 26 testes relacionados + 4 do `useUnsavedChanges` existente. **Prova no navegador** (`c:/tmp/pwtest/imovib_pendencias.js`; escritas bloqueadas: 0; erros de console: 0): 15 botões de nota com rótulo; campo de Premissas 6px/36px; menu e mudança de endereço perguntam e mantêm o valor; endereço restaurado para `#/imovib`; fechar a aba dispara `beforeunload` e recusar mantém a página; "Sair e descartar" navega; sem pendência não pergunta.
    - **Publicação das 3 pendências:** `main` = `ee9da923`; o domínio serve `ee9da92` (conferido por ancestralidade, porque outra frente publicou depois). Check-run `ci`: **completed / success**.
    - [x] **(d) Cabeçalho e abas do detalhe** (pedido: *"Pode cirrigir"*, sobre a pendência que eu registrei fora do pedido): `ImovibDetailView` (`c25b51f7`).
      - título solto fora de card (§20) e versão em texto simples;
      - abas no `TabsBar` (§19.1: sem caixa alta, `flex-wrap`);
      - Editar e Planta AI compactos (§17);
      - conteúdo rola com a página (saiu a caixa `h-[calc(100vh-14rem)]`).
      - Verificado: tsc rc 0; `check-ui-standard` rc 0; travas `orgContextGuard` + `cabecalhoSemCinzaGuard` 18/18. **Prova no navegador** (`c:/tmp/pwtest/imovib_cabecalho.js`, larguras 1600 e 1100; escritas bloqueadas: 0; erros de console: 0):
        - 8 abas, sem caixa alta, peso 500; em 1100 px quebram em 2 linhas (sem rolagem lateral);
        - h1 fora de card; botão Planta AI sem caixa alta; CAPEX abre pela aba.
        - O `rolagem_da_pagina: false` do roteiro era erro de medição: o Layout é `h-screen overflow-hidden` e quem rola é o `<main>` (`Layout.tsx:1597`), nunca o documento. O print confirma o conteúdo fluindo sem caixa interna.
    - **Publicação de (d):** `main` = `b537bba9`; o domínio serve `b537bba` (conferido por ancestralidade). Check-run `ci`: **completed / success**.
    - **Próxima pendência (fora do pedido):** o CONTEÚDO das abas ainda está na escala antiga (§16/§21). Visto no print do CAPEX: cartões `rounded-2xl`/`3xl` e rótulos `font-black uppercase` ("ÁREA TOTAL (M²)"); vale também para Receitas, Sensibilidade, ESG, Estática, Dinâmica e Resumo.
  - **Pendências registradas pelos subagentes:**
    - inputs de Premissas ainda na escala antiga de raio (§16);
    - `StarRating` do ESG declarado dentro do render (botões; efeito menor);
    - trocar de módulo pelo menu lateral desmonta o detalhe sem passar pelo aviso de edição não salva.

## Verificação

- **Toda fase:** `npm run typecheck` (ler o `exit=` com grep) e `npx vitest run __tests__/imovibMath.test.ts`; antes do push, a suíte inteira e `verificar:build`.
- **Comparação de números:** antes da Fase 1, registrar VGV, VPL, TIR e exposição dos 4 estudos reais (print do Resumo de cada um). Depois de cada fase que muda número, repetir e anotar aqui a diferença e o motivo. Nenhum número muda sem explicação.
- **Navegador:** no fim da Fase 3, abrir um estudo real e conferir que Resumo, Estática, Espelho e listagem mostram o mesmo VGV e o mesmo custo.
- **Publicação:** push em `main` (REGRA #8); depois, ler o check-run `ci` e rodar `bash scripts/conferir-producao.sh`.

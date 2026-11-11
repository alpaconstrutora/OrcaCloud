# Estudos de Viabilidade (Imovib) — viabilidade de excelência: fechar as lacunas dos 13 blocos

> Execução: uma fase por PR, na ordem. Quem executa marca cada item em **Estado** com o
> commit. Itens com `- [ ]` ainda não começaram. Fase só é "concluída" com todos os
> itens fechados — senão, "Fase X: 5 de 9".

## Pedido original

> liste tudo que ter em um estudo de viabilidade imobiliaria de excelencia
>
> Sessão: 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0 · 2026-11-11

A resposta listou 13 blocos e terminou oferecendo comparar a lista com o módulo Imovib.

> Se quiser, comparo esta lista com o que o módulo Imovib já cobre e aponto as lacunas. Sim
>
> Sessão: 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0 · 2026-11-11

A comparação classificou os 13 blocos (1 bom, 7 parciais, 5 fracos), apontou as seis
lacunas que mais pesam e ofereceu um plano só para as duas primeiras. A resposta foi:

> escreva um plano completo para todos
>
> Sessão: 21a9ea95-c34e-43cc-8a0f-7d21ef9ed2a0 · 2026-11-11

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 2026-11-11 | Planejar só as duas lacunas principais (curva de vendas e indicadores) ou todas? | **Todas**: *"escreva um plano completo para todos"*. Os 13 blocos entram no escopo. |
| 2026-11-11 | Por onde começar? (a mensagem anterior dizia "se as recomendações servirem, começo pela Fase 0") | *"comece pela Fase 0"*. A recomendação de D6 (corrigir a função do portal já na Fase 0) foi tratada como aceita; a migration foi escrita e **não aplicada** — aplicar pede OK explícito. As outras decisões (D1–D5, D7) só travam fases seguintes e seguem em aberto. |
| 2026-11-11 | D1: o recebimento por safra muda VPL, TIR e exposição dos 3 estudos existentes. Um modelo só ou manter o antigo nos existentes? (pedido: *"iniciar f1"*) | **Um modelo só.** Todos os estudos passam a ser calculados por safra; a tabela antes → depois dos 3 estudos fica no item 1.4. |
| 2026-11-11 | D7: dividir "Receitas e Capital" em duas abas? | **Dividir:** Receitas (espelho, curva de vendas, recebimento, distrato) e Capital (financiamento e permutas). |
| 2026-11-11 | A revisão da Fase 1 achou que, com os padrões, mais distrato dava mais lucro (retenção de 25% do pago + revenda pelo preço cheio) e que venda distratada depois das chaves devolvia até o dinheiro do banco. Como corrigir? | **Revenda com deságio + distrato só até as chaves.** Deságio editável, padrão 10% (coluna nova, migration `aplicar_20271111850000`); venda feita nas chaves ou depois não distrata, com aviso `distrato_parcial`. |

### Decisões ainda em aberto (perguntar antes do item que depende delas)

Cada uma traz a recomendação de quem escreveu o plano. Nenhuma foi respondida.

- **D1 (item 1.4).** O recebimento por safra muda VPL, TIR e exposição dos estudos que já existem. Hoje são 3 no banco (Davi Bueno, Garden Cambuhy, Bruninho), nenhum editado desde 19/10/2026. Um modelo só para todos, com a tabela antes → depois dos 3 estudos, ou manter o modelo antigo nos estudos existentes? **Recomendação: um modelo só.** Dois modelos divergem para sempre e a listagem passa a comparar estudos calculados de jeitos diferentes.
- **D2 (item 4.2).** O campo "Capital Próprio (Equity)" é gravado e exportado, mas o motor não o lê. Virar número calculado (capital necessário em R$ e em %), ou continuar editável e passar a travar a soma com a dívida? **Recomendação: calculado.**
- **D3 (itens 4.4 e 9.2).** Outras fontes de capital (mútuo, CRI, SCP, investidor) e resultado por sócio entram nesta rodada? **Recomendação: sim, as duas, na forma simples descrita nos itens**; distribuição em cascata com retorno preferencial fica fora (ver "Fora do escopo").
- **D4 (Fase 6).** As alíquotas dos regimes tributários entram como hipótese editável, com estes padrões: RET 4%, RET de interesse social 1%, lucro presumido 6,73%, lucro real estimado. Quem confirma os padrões com a contabilidade antes de publicar a fase?
- **D5 (item 10.2).** Versão congelada é imutável (não se edita nem se apaga)? **Recomendação: sim.**
- **D6 (item 0.6).** A função do Portal do Investidor monta o estudo com a estrutura antiga e sem o espelho de vendas (medido em 11/11, ver Diagnóstico). Corrigir exige reescrever uma função `SECURITY DEFINER` com `GRANT` para `anon`. Corrigir já na Fase 0? **Recomendação: sim**, antes de qualquer fase que mude número.
- **D7 (Fase 1 em diante).** A aba "Receitas e Capital" passa a ter oito cartões. Dividir em duas abas, "Receitas" e "Capital"? **Recomendação: dividir.** O mapa de abas abaixo já assume a divisão.

### Escolhas feitas por padrão (mudar é barato enquanto a fase não começou)

- Curva de vendas pela VSO que não vende tudo no prazo: o que sobra fica **fora da receita**, com aviso do percentual e do valor em estoque. Não há "liquidação no último mês".
- Unidade distratada volta ao estoque e é revendida no mês seguinte ao distrato; a revenda não sofre novo distrato.
- Inadimplência passa a incidir só sobre o que o comprador paga à incorporadora (parcelas de obra, intermediárias e pós-chaves). Sinal e repasse bancário ficam fora.
- Toda premissa nova tem padrão que reproduz o comportamento de hoje, exceto onde o item declara mudança de número.
- Colunas novas em inglês `snake_case`, como as de `imovib_studies`. Arquivos e funções novas em português, como `utils/imovibEstrutura.ts`.

## Diagnóstico que originou o plano

Medido em 2026-11-11, lendo `origin/main` em 21b6daa4 (o checkout de integração estava 1.307 commits atrás e não foi usado como fonte). As telas não foram abertas.

| # | Bloco | Situação | O que falta |
|---|---|---|---|
| 1 | Terreno e legal | Parcial | Due diligence; terreno parcelado (sai inteiro no mês 1); índices urbanísticos não aparecem no estudo |
| 2 | Mercado | Fraco | Comparáveis, preço/m² justificado; `vso_regional_percent` e `location_score` não entram em nenhum cálculo |
| 3 | Produto | Bom | Índice de eficiência e área equivalente NBR 12721 |
| 4 | Receitas | Parcial | Curva de vendas (só linear); intermediárias e pós-chaves; distrato no tempo (é desconto fixo no VGV); `inflation_index_obra`/`inflation_index_vendas` existem e ninguém lê |
| 5 | Custos | Parcial | Desembolso da obra linear; rubricas de base `obra` (projetos, taxas, outorga) saem ao longo da obra; sem pós-obra; sem referência de CUB |
| 6 | Tributos | Parcial | Sem comparação de regimes; RET e regime normal são rubricas manuais que podem ficar ligadas juntas |
| 7 | Capital | Fraco | Sem defasagem de liberação nem exigência de vendas; `funding_equity_percent` não entra no cálculo; sem cronograma de aportes; uma fonte só |
| 8 | Fluxo de caixa | Parcial | Só a visão do acionista, só nominal, sem abertura por linha; horizonte acaba no fim da obra ou das vendas |
| 9 | Indicadores | Parcial | Payback, múltiplo, ponto de equilíbrio, valor máximo do terreno; o cartão "Lucro Líquido (VPL)" mistura dois números |
| 10 | Risco | Fraco | Tornado e stress test só com VGV e custo de obra, só sobre a TIR; sem cenários salvos, sem simulação, risco em texto livre |
| 11 | Cronograma | Fraco | Quatro números em meses relativos; sem marcos nem datas |
| 12 | Jurídico e societário | Fraco | Só CNPJ, incorporadora, gestor e modalidade |
| 13 | Governança | Parcial | Sem fonte por premissa, sem histórico de versões, sem parecer, sem viabilidade × realizado; o PDF é uma captura de tela |

Fatos conferidos no banco no mesmo dia (só leitura):

- **3 estudos** em `imovib_studies`; só o Garden Cambuhy está vinculado a empreendimento e tem espelho (41 unidades).
- **`fn_investor_portal_get_study` não lê o espelho nem as torres do empreendimento.** A função monta o estudo com `imovib_blocks`/`imovib_units` (estrutura antiga) e as rubricas. Para estudo vinculado, o portal por link calcula um VGV diferente do app.
- As tabelas filhas do Imovib usam `imovib_unit_instance_org_check(study_id)` nas quatro policies; `anon` **não** tem `EXECUTE` nela.

## O que o app já tem e este plano reusa

| Necessidade | O que existe | Onde |
|---|---|---|
| Séries de índice (INCC-M, IPCA, IGP-M) | tabela `contract_index_values`; `contractIndexService.list(indexName, orgId?, months)` | `services/contractIndexService.ts` |
| CUB por UF e padrão | `cubDoPadrao(uf, padrao, desoneracao)` → `{valorM2, fonte, referencia}` | `services/cubService.ts:96` |
| Curva S | fórmula `3x² − 2x³` de `parametricService.generateSCurveData(total, duracao)` | `services/parametricService.ts:285` |
| Dívida com cronograma (Price, SAC, bullet, carência) | `buildSchedule(params)` | `utils/debtAmortization.ts:262` |
| Gerador pseudoaleatório com semente | `prng(semente)` (mulberry32) | `utils/blueprintGerador.ts:223` |
| Estatística de mercado no raio do terreno | `opura_market_terrain_studies.radius_stats`; `getTerrainRadiusStats` | `services/opuraMarketService.ts:477` |
| Zona aplicável do empreendimento | `empreendimentoService.listRegulatoryZonesByImovibStudy(studyId)` | `services/empreendimentoService.ts:1847` |
| SPE, patrimônio de afetação, registro de incorporação | `companyService.getIncorporacao(companyId)` (`tipo_spe`, `registro_incorporacao`, `cartorio`…) | `services/companyService.ts:223` |
| Sócios da empresa | tabela `company_partners` (`participacao_pct`) | `types/company.ts:152` |
| Vendas reais por empreendimento | `groupSalesAnalysis` (só 12 meses), `ETAPAS_VENDIDA`, `saleUnitClassifier`, `commercial_deals.date` | `lib/salesAnalysis.ts` |
| Realizado mensal por obra | `opuraAnalyticsService.obraMensal(orgId, projectId)` → `{mes, entradas, saidas…}` | `services/opuraAnalyticsService.ts:382` |
| Obras de um empreendimento | `empreendimentoLinksService.getSnapshot(emp)` | `services/empreendimentoLinksService.ts:135` |
| Área equivalente NBR 12721 | `calcularNbr12721`; tabela `blueprint_snapshot_nbr12721` | `utils/nbr12721/quadros.ts:463` |
| Gráficos no padrão do guia §28 | `ChartCard`, `ChartEmpty`, `GRID`, `TICK`, `TOOLTIP_STYLE` | `components/analysis/chartKit.tsx` |
| Tabela, abas, drawer, KPI | `StandardTable`, `TabsBar`, `Sheet`, `KpiCard` | `components/ui/` |

Não existem e este plano cria: função de variação acumulada de índice, cálculo de carga tributária por regime, simulação de Monte Carlo, vendas por mês com histórico completo, ligação gravada entre estudo de mercado e estudo de viabilidade.

## Regras que valem para todos os itens

1. **Trabalhar na frente** `C:\D\frentes\imovib-excelencia` (branch `feat/imovib-excelencia`). Ler código só dela ou de `origin/main`; nunca do checkout de integração.
2. **Estudo antigo não muda de número sem o item dizer.** O teste do item 0.1 fica verde em todo commit. Item que muda número atualiza esse teste no mesmo commit, com o antes → depois na mensagem.
3. **Motor puro.** Todo cálculo novo é função pura em `utils/imovib*.ts`, com teste em `__tests__/`. Tela não recalcula: lê do resultado do motor.
4. **Folga é hipótese editável.** Todo padrão novo mora em `constants/imovibDefaults.ts`, aparece na tela e pode ser alterado. Nenhuma constante escondida no código.
5. **Aviso, nunca troca em silêncio.** Premissa inválida (soma diferente de 100%, mês impossível) é calculada como veio e gera `ImovibAviso` com a aba que corrige.
6. **Migration antes do código que a lê.** A listagem seleciona colunas pelo nome; coluna que não existe no banco derruba a tela inteira (erro 42703). Aplicar com `npx supabase db query --linked -f`, **nunca** `supabase db push`. Aplicar é escrita em produção: pedir OK a cada migration; se o comando for barrado, o usuário roda.
7. **Prefixo de migration** escolhido na hora com `ls supabase/migrations | grep -oE '[0-9]{14}' | sort -u | tail`, com folga, e `npx vitest run __tests__/migrationsPrefixo.test.ts` antes de aplicar e antes do merge.
8. **REGRA #7 em toda migration:** cabeçalho com as perguntas P1/P2/P3 respondidas. Tabela filha nova usa `imovib_unit_instance_org_check(study_id)` nas quatro policies, `REVOKE ALL … FROM anon` e `GRANT` só a `authenticated`. Modelo de cabeçalho: `aplicar_20271111150000_alcada_por_usuario.sql`.
9. **Tela no padrão do guia** (`docs/ui_ux_guia_unificado.md`): KPI = `KpiCard` (§4); tabela nova = `StandardTable` (§6.10); abas = `TabsBar` (§19.1); edição em `Sheet` (§26), nunca tela cheia; salvar não fecha a edição (§25); gráfico com `chartKit` (§28). Campo `h-9`, rótulo sem caixa alta, valor de campo nunca em cinza-claro, botão desabilitado diz o motivo no `title`. Rodar `bash scripts/check-ui-standard.sh <arquivo.tsx>` em cada tela tocada.
10. **Edição respeita `useImovibEdicao`** (`fieldset disabled={!pode}` com o motivo). Quem só lê não grava nada, nem ao abrir a aba.
11. **Nada de semente em `useEffect`.** Modelo de lista (cenários, checklist, rubricas de pós-obra) nasce por botão, com `UNIQUE` no banco.
12. **Fase que muda tela termina conferida no navegador**, com print, pelo roteiro Playwright da fase (`c:/tmp/pwtest/imovib_<fase>.js`, escritas bloqueadas). Usar Garden Cambuhy para o modo Completo com espelho; Bruninho está em CAPEX simplificado.
13. **Fase que muda número termina conferida também em `components/investor/OpportunityDetail.tsx`**, que roda o mesmo motor.

## Mapa de abas ao fim do plano

| Aba | Conteúdo | Fase que mexe |
|---|---|---|
| Resumo Executivo | Parecer, KPIs, pontos de equilíbrio, curva, exportações | 2, 10 |
| Premissas | Sub-abas: Identificação (+ estrutura jurídica, zoneamento), Mercado (+ comparáveis), Terreno (pagamento, due diligence), Cronograma (marcos), Memorial | 5, 7, 9, 10 |
| Orçamento (CAPEX) | Por torre (+ referência de CUB), rubricas (+ momento), curva de desembolso, regime tributário | 5, 6 |
| Receitas | Espelho, curva de vendas, perfil de recebimento, distrato e inadimplência | 1 |
| Capital | Financiamento, outras fontes, capital necessário, aportes e distribuições, sócios | 4, 9 |
| Sensibilidade e Risco | Tornado, grade cruzada, cenários, simulação, matriz de riscos | 3 |
| Estática | DRE simplificada, áreas, indicadores de produto | 8 |
| Dinâmica | Premissas de tempo e taxas, fluxo aberto por linha | 1, 2 |
| Versões | Versões congeladas e comparação | 10 |
| Acompanhamento | Viabilidade × realizado | 10 |

---

## Plano

Ordem: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10**. As Fases 0 a 3 fecham as lacunas que mais pesam na decisão. Cada fase publica sozinha.

### Fase 0 — Fundações do motor (nenhum número muda)

**Interfaces que a fase entrega** (`utils/imovibMotor.ts`):

```ts
export interface LinhasDoMes {
    receitaSinal: number; receitaParcelasObra: number; receitaIntermediarias: number;
    receitaRepasse: number; receitaPosChaves: number;
    devolucaoDistrato: number;                              // ≤ 0
    impostos: number; comercial: number; outrasDeducoes: number;   // ≤ 0, sobre a receita
    terreno: number; rubricasTerreno: number; obra: number; rubricasObra: number;
    rubricasVendas: number; carregamentoDoEstoque: number;  // ≤ 0
    liberacaoDivida: number;                                // ≥ 0
    pagamentoDaDivida: number;                              // ≤ 0, principal + juros
    aporteDeTerceiros: number; remuneracaoDeTerceiros: number;
}
export interface MonthlyFlow {
    month: number; name: string; rev: number; cost: number; net: number; acc: number;
    netProjeto: number; accProjeto: number;   // sem dívida nem terceiros
    jurosDoMes: number;                       // informativo, fora da soma
    linhas: LinhasDoMes;
}
// ImovibMathResult ganha: vplProjeto, annualIrrProjeto, estoqueNaoVendidoPct,
// totalSellableArea, unidadesVendaveis. Os campos de hoje ficam como estão.
export const CAMPOS_DO_MOTOR: readonly (keyof ImovibStudy)[];
```

**0.1 Teste de regressão "o número de hoje"**
- **Arquivos:** `__tests__/fixtures/imovibEstudos.ts` (novo; recebe o `baseStudy` hoje declarado em `__tests__/imovibMath.test.ts`), `__tests__/imovibMotorRegressao.test.ts` (novo — `ls` antes de criar).
- **O que muda:** quatro estudos fixos: o base; dívida de 60% a 12% a.a.; modo Completo com rubricas nas três bases; espelho com unidade permutada e inflação de 0,4% a.m. Para cada um o teste fixa `vpl`, `annualIrr`, `maxExposure`, `netVgvTotal`, `duration` e o vetor `monthlyFlows[].net` arredondado a centavos.
- **Como sei que terminou:** o teste passa no `main` **antes** de qualquer mudança no motor, e o commit dele é anterior ao primeiro commit que toca `hooks/useImovibMath.ts`.

**0.2 Motor fora do hook, em camadas**
- **Arquivos:** `utils/imovibMotor.ts` (novo), `hooks/useImovibMath.ts`.
- **O que muda:** `computeImovibMath`, `calcularTirMensal`, `baseDaRubrica` e os tipos vão para `utils/imovibMotor.ts`, divididos em quatro funções internas: `montarPremissas` (padrões e avisos), `montarSeries` (uma série por linha do fluxo), `aplicarFinanciamento`, `calcularResultado`. `hooks/useImovibMath.ts` vira só o `useMemo` e reexporta tudo o que exportava, para os arquivos que importam dele (telas do Imovib, `OpportunityDetail.tsx`, serviço e testes) não mudarem.
- **Como sei que terminou:** `__tests__/imovibMotorRegressao.test.ts` e `__tests__/imovibMath.test.ts` passam sem edição; `grep -c "from 'react'" utils/imovibMotor.ts` dá 0; `npm run typecheck` sem erro.

**0.3 Fluxo aberto por linha e visão do projeto**
- **Arquivos:** `utils/imovibMotor.ts`, `__tests__/imovibMotorLinhas.test.ts` (novo).
- **O que muda:** cada mês ganha `linhas`, `netProjeto`, `accProjeto` e `jurosDoMes`; o resultado ganha `vplProjeto` e `annualIrrProjeto`. Nesta fase as linhas ainda não modeladas valem 0. Sem rubricas, imposto e corretagem da Dinâmica vão para `impostos` e `comercial`; com rubricas, a categoria `7.` vai para `impostos`, a `5.` para `comercial` e o resto para `outrasDeducoes`.
- **Como sei que terminou:** o teste afirma, nos quatro estudos do 0.1 e em todo mês: `net` = soma de `linhas`; `netProjeto` = `net − liberacaoDivida − pagamentoDaDivida`; sem dívida, `annualIrrProjeto` = `annualIrr`; no estudo fixo com dívida de 60%, em que a TIR do projeto supera o juro da dívida, `annualIrr > annualIrrProjeto`. O teste do 0.1 segue verde.

**0.4 Uma lista só de campos que o motor lê**
- **Arquivos:** `utils/imovibMotor.ts`, `services/imovibService.ts`, `__tests__/imovibCamposDoMotor.test.ts` (novo).
- **O que muda:** `montarPremissas` lê o estudo só pelos campos de `CAMPOS_DO_MOTOR`. `getStudiesWithMetrics` monta o `select` a partir de uma lista de metadados da listagem mais `CAMPOS_DO_MOTOR`, em vez da string escrita à mão.
- **Como sei que terminou:** o teste calcula um estudo completo e a cópia dele só com `CAMPOS_DO_MOTOR`, blocos, rubricas e espelho, e os dois resultados são iguais; a listagem abre no navegador com os mesmos VPL e TIR do Resumo de cada estudo.

**0.5 Padrões novos num lugar só**
- **Arquivo:** `constants/imovibDefaults.ts`.
- **O que muda:** o arquivo ganha uma seção por fase (vazia agora) e o comentário de que todo padrão novo entra ali com unidade e com a fase que o criou.
- **Como sei que terminou:** as fases seguintes não declaram número de padrão fora desse arquivo; conferido por `grep -nE "\?\? [0-9]" utils/imovib*.ts` vazio ao fim de cada fase.

**0.6 Portal do Investidor com a mesma estrutura do app** *(depende de D6)*
- **Arquivos:** migration nova `aplicar_<prefixo>_investor_portal_estudo_mesma_estrutura.sql`; `services/investorPortalTokenService.ts`; `components/investor/OpportunityDetail.tsx`; `__tests__/` do serviço.
- **O que muda:** `fn_investor_portal_get_study` passa a devolver também o espelho (`unit_instances`, com as colunas de `INSTANCIA_VGV_COLS`) e, para estudo vinculado, as torres e unidades do empreendimento, no formato que `derivarEstruturaDoEmpreendimento` (`utils/imovibEstrutura.ts`) recebe. O cliente aplica a mesma derivação que `imovibService.getStudyById`. A função segue validando o token e a publicação da oportunidade antes de ler qualquer coisa, e a migration leva `REVOKE … FROM PUBLIC` seguido do `GRANT` a `anon, authenticated` que ela já tem.
- **Como sei que terminou:** para o Garden Cambuhy, o VGV que a função entrega ao portal é igual ao da aba Resumo do app (conferido chamando a RPC com um token de teste e rodando o motor nos dois); chamada com token inválido devolve `valid: false`; `npx vitest run __tests__/segurancaMigrations.test.ts` verde. Antes de escrever a migration, conferir no banco se existe oportunidade publicada ligada a estudo — se não existir, registrar aqui e manter o item.

### Fase 1 — Receitas: curva de vendas e recebimento por safra (bloco 4)

**Interfaces que a fase entrega:**

```ts
// utils/imovibCurvas.ts
export type TipoCurvaDeVendas = 'linear' | 'lancamento' | 'vso' | 'custom';
export interface ParametrosDaCurvaDeVendas {
    tipo: TipoCurvaDeVendas; duracao: number;
    lancamentoPct?: number; lancamentoMeses?: number; vsoPct?: number; pesos?: number[];
}
/** Fração do VGV vendida em cada mês de venda (índice 0 = 1º mês). Soma ≤ 1. */
export function curvaDeVendas(p: ParametrosDaCurvaDeVendas): number[];

// utils/imovibRecebimento.ts
export interface PerfilDeRecebimento {
    sinalPct: number; parcelasObraPct: number;
    intermediariasPct: number; intermediariasIntervalo: number;
    repassePct: number; atrasoDoRepasse: number;
    posChavesPct: number; posChavesMeses: number; posChavesJurosMensal: number;
}
export interface PremissasDeDistrato { taxaPct: number; defasagemMeses: number; devolucaoPct: number; revende: boolean; }
export interface SerieDeRecebimento {
    sinal: number[]; parcelasObra: number[]; intermediarias: number[];
    repasse: number[]; posChaves: number[]; devolucaoDistrato: number[];
}
/** vendasPorMes[i] = VGV líquido vendido no mês i+1 do estudo. Valores sem índice. */
export function recebimentoPorSafra(
    vendasPorMes: number[], perfil: PerfilDeRecebimento, mesDasChaves: number,
    distrato: PremissasDeDistrato, horizonte: number,
): SerieDeRecebimento;

// utils/indiceVariacao.ts
export function taxaMensalMedia(valores: { reference_month: string; value: number }[], meses: number): number | null;
```

Regras de uma safra vendida no mês `s` com valor `V` (o mês das chaves é o último mês da obra):
- **Sinal:** `V × sinalPct` no mês `s`.
- **Parcelas de obra:** `V × parcelasObraPct` em parcelas iguais de `s+1` até as chaves; venda no mês das chaves ou depois paga tudo em `s`.
- **Intermediárias:** `V × intermediariasPct` em partes iguais nos meses `s + k × intervalo` que caem até as chaves; sem nenhum, tudo nas chaves (ou em `s`, se a venda é posterior).
- **Repasse:** `V × repassePct` em `max(chaves, s) + atrasoDoRepasse`.
- **Pós-chaves:** `V × posChavesPct` em Price de `posChavesMeses` parcelas a `posChavesJurosMensal`, a partir de `max(chaves, s) + 1`.
- **Distrato:** a fração `taxaPct` da safra cancela em `s + defasagemMeses`: os recebimentos futuros dela param, `devolucaoPct` do que ela pagou sai em `devolucaoDistrato` nesse mês e, com `revende`, o valor vira safra nova no mês seguinte, sem novo distrato.

**1.1 Curvas de venda**
- **Arquivos:** `utils/imovibCurvas.ts` (novo), `__tests__/imovibCurvas.test.ts` (novo).
- **O que muda:** `curvaDeVendas` com os quatro tipos. `vso`: vende a cada mês `vsoPct` do estoque que resta. `custom`: normaliza os pesos; lista vazia cai em `linear`.
- **Como sei que terminou:** o teste afirma: linear de 24 meses → 24 valores de 1/24, soma 1; lançamento 30% em 3 meses, de 24 → três meses de 0,10 e 21 meses de 0,70/21; VSO 5% em 36 meses → 0,05, depois 0,0475, soma `1 − 0,95³⁶`; custom `[1, 1, 2]` → `[0,25; 0,25; 0,5]`; duração 0 ou negativa → lista vazia.

**1.2 Recebimento por safra, com distrato**
- **Arquivos:** `utils/imovibRecebimento.ts` (novo), `__tests__/imovibRecebimento.test.ts` (novo).
- **O que muda:** `recebimentoPorSafra` com as regras acima.
- **Como sei que terminou:** o teste afirma:
  - uma venda de 1.000.000 no mês 3, chaves no mês 12, perfil 10/20/10 (intervalo 6)/50/10 (12 parcelas, juro 0), sem distrato → sinal 100.000 no mês 3; nove parcelas de 22.222,22 dos meses 4 a 12; intermediária de 100.000 no mês 9; repasse de 500.000 no mês 12; doze parcelas de 8.333,33 dos meses 13 a 24;
  - conservação: com juro 0 e sem distrato, a soma de todas as séries é a soma das vendas vezes a soma dos percentuais;
  - venda no mês 15 com chaves no mês 12 → parcelas de obra e sinal no mês 15, repasse no mês 15;
  - distrato de 10%, defasagem 6, devolução 50%, sem revenda → o total recebido é 90% de `V` mais metade do que a fração cancelada pagou até o mês `s + 6`, e `devolucaoDistrato` é negativa só nesse mês;
  - o mesmo com revenda → nasce uma safra de `0,10 × V` no mês `s + 7`;
  - distrato que cairia depois do horizonte → não acontece e não quebra.

**1.3 Colunas das premissas de receita**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_receitas_por_safra.sql`; `types/imovib.ts`; `constants/imovibDefaults.ts`.
- **O que muda:** em `imovib_studies`, todas anuláveis (vazio = padrão): `sales_curve_type` (`CHECK` nos quatro tipos), `sales_launch_percent`, `sales_launch_months`, `sales_vso_percent`, `sales_curve_custom jsonb`, `revenue_intermediate_percent`, `revenue_intermediate_interval_months`, `revenue_post_handover_percent`, `post_handover_months`, `post_handover_rate_monthly`, `handover_delay_months`, `cancellation_lag_months`, `cancellation_refund_percent`, `cancellation_resale boolean`, `sales_index_rate_monthly`, `cost_index_rate_monthly`. Padrões: curva `linear`; lançamento 30% em 3 meses; intermediárias 0% a cada 6 meses; pós-chaves 0%; atraso do repasse 0; distrato com defasagem de 12 meses, devolução de 75% e revenda ligada; índices vazios = `inflation_rate`.
- **Como sei que terminou:** `select column_name from information_schema.columns where table_name='imovib_studies'` lista as 16 colunas; `__tests__/imovibCamposDoMotor.test.ts` verde com os campos novos em `CAMPOS_DO_MOTOR`; a listagem abre.

**1.4 Motor passa a usar curva e safra** *(muda número — depende de D1)*
- **Arquivos:** `utils/imovibMotor.ts`, `__tests__/imovibMath.test.ts`, `__tests__/imovibMotorRegressao.test.ts`.
- **O que muda:** `montarSeries` calcula as vendas do mês pela curva sobre o VGV comercializado e o recebimento por `recebimentoPorSafra`. O índice de vendas corrige a receita e o de obra corrige o custo, cada um pelo seu campo. Inadimplência sai do desconto do VGV e passa a reduzir `receitaParcelasObra`, `receitaIntermediarias` e `receitaPosChaves`. Distrato sai do desconto do VGV. Permuta física e financeira ficam como estão. O horizonte passa a ir até o último mês com receita ou custo. Avisos novos: `estoque_nao_vendido` (curva que não vende tudo) e `pos_chaves_sem_prazo` (percentual de pós-chaves com 0 meses). `recebimento_nao_soma_100` passa a somar as cinco parcelas.
- **Como sei que terminou:**
  - teste novo: curva `vso` de 3% em 24 meses deixa `estoqueNaoVendidoPct` > 0, gera o aviso e a receita total é menor que a da curva linear;
  - teste novo: pós-chaves de 20% em 60 meses leva `duration` além do fim da obra e das vendas;
  - teste novo: aumentar `cancellation_refund_percent` reduz o VPL; ligar a revenda aumenta;
  - `__tests__/imovibMotorRegressao.test.ts` atualizado neste commit, com a tabela antes → depois dos quatro estudos fixos na mensagem;
  - tabela antes → depois de VGV líquido, VPL, TIR e exposição dos 3 estudos do banco colada em **Estado**, e o usuário viu a tabela antes do merge.

**1.5 Aba Receitas: curva de vendas**
- **Arquivos:** `components/ImovibDetailView.tsx` (aba `funding` vira `receitas` e `capital`, conforme D7), `components/ImovibReceitasForm.tsx` (novo; recebe o espelho e o perfil de recebimento de `ImovibFundingForm`), `components/ImovibCurvaDeVendasCard.tsx` (novo), `components/ImovibCapitalForm.tsx` (novo; recebe estrutura de capital e permutas), `hooks/useImovibMath.ts` (`ImovibAba` ganha `receitas` e `capital`).
- **O que muda:** cartão com o tipo da curva, os parâmetros do tipo escolhido e um gráfico de vendas por mês com a linha do estoque (`ChartCard`). No tipo `vso`, botão "Usar a VSO da região (x%)" quando `vso_regional_percent` está preenchido. No tipo `custom`, tabela de pesos por mês. A frase "A velocidade de vendas agota é calculada automaticamente…" sai de `ImovibDynamicForm.tsx`.
- **Como sei que terminou:** no navegador, trocar a curva de linear para VSO muda o gráfico e a exposição máxima do Resumo; o aviso de estoque não vendido aparece com link para a aba Receitas; `check-ui-standard.sh` passa nos arquivos novos; print no PR.

**1.6 Aba Receitas: perfil de recebimento e distrato**
- **Arquivos:** `components/ImovibPerfilDeRecebimentoCard.tsx` (novo; usa o `InputRow` que hoje vive em `ImovibFundingForm.tsx`, movido para `components/ImovibInputRow.tsx`), `components/ImovibReceitasForm.tsx`.
- **O que muda:** cinco parcelas (sinal, parcelas de obra, intermediárias, repasse, pós-chaves) com o total de 100% conferido; prazo e juro do pós-chaves; intervalo das intermediárias; atraso do repasse. Cartão "Distrato e inadimplência" com taxa, defasagem, devolução e revenda. O `title` do campo de devolução diz que a Lei 13.786/2018 limita a retenção a 25% do valor pago, ou 50% com patrimônio de afetação, e que o padrão é hipótese.
- **Como sei que terminou:** no navegador, digitar "12,5" num campo não perde o foco nem vira 0 (o defeito do item 5.3 do plano de 12/10 não volta — `__tests__/components/ImovibFundingFormFoco.test.tsx` adaptado ao componente novo e verde); perfil somando 90% mostra o total em vermelho e o aviso do motor.

**1.7 Índices separados, com sugestão pela série histórica**
- **Arquivos:** `utils/indiceVariacao.ts` (novo), `__tests__/indiceVariacao.test.ts` (novo), `components/ImovibDynamicForm.tsx`.
- **O que muda:** a Dinâmica ganha "Índice da obra" e "Índice das vendas": nome do índice (grava em `inflation_index_obra`/`inflation_index_vendas`, que já existem) e taxa mensal. Botão "Usar a média dos últimos 12 meses" lê `contractIndexService.list(nome, orgId, 13)` e preenche a taxa com `taxaMensalMedia`. `inflation_rate` passa a se chamar "Inflação geral (deflator)" na tela.
- **Como sei que terminou:** o teste afirma que a série 100 → 112,68 em 12 meses dá 1% a.m. e que série com menos de 2 pontos devolve `null`; na tela, sem série cadastrada o botão fica desabilitado com o motivo; com a taxa da obra maior que a das vendas, o VPL cai.

### Fase 2 — Indicadores de decisão e fluxo aberto (blocos 9 e 8)

**Interfaces que a fase entrega:**

```ts
// utils/imovibIndicadores.ts
export interface IndicadoresDoEstudo {
    lucroLiquido: number; margemLiquidaSobreVgv: number; margemSobreCusto: number;
    paybackSimplesMes: number | null; paybackDescontadoMes: number | null;
    multiploDoCapital: number | null; retornoSobreCapital: number | null;
    tirModificadaAnual: number | null; mesDaExposicaoMaxima: number | null;
    terrenoSobreVgv: number; obraSobreVgv: number;
}
export function calcularIndicadores(r: ImovibMathResult, tmaAnualPct: number): IndicadoresDoEstudo;

// utils/imovibVariacoes.ts
export type VariavelDoEstudo = 'preco' | 'custo_obra' | 'terreno' | 'velocidade_vendas'
    | 'prazo_obra' | 'juros_financiamento' | 'indice_obra' | 'distrato';
/** Devolve CÓPIA do estudo e as opções do motor; nunca altera o estudo recebido. */
export function aplicarVariacao(study: ImovibStudy, variavel: VariavelDoEstudo, delta: number):
    { study: ImovibStudy; options: ImovibMathOptions };

// utils/imovibEquilibrio.ts
export interface PontoDeEquilibrio { valor: number | null; motivo?: 'sem_raiz' | 'sem_vgv'; }
export type AlvoDoTerreno = { tipo: 'vpl_zero' } | { tipo: 'margem'; pct: number } | { tipo: 'tir'; pctAnual: number };
export function terrenoMaximo(study: ImovibStudy, alvo: AlvoDoTerreno): PontoDeEquilibrio;   // R$
export function precoMinimo(study: ImovibStudy): PontoDeEquilibrio;        // variação % do preço que zera o VPL
export function custoMaximoDeObra(study: ImovibStudy): PontoDeEquilibrio;  // variação % do custo que zera o VPL
export function vendasMinimas(study: ImovibStudy): PontoDeEquilibrio;      // % do VGV que precisa ser vendido
```

Unidade do `delta`: percentual para `preco`, `custo_obra`, `terreno`; meses para `velocidade_vendas` (duração das vendas) e `prazo_obra`; pontos percentuais para `juros_financiamento` (ao ano), `indice_obra` (ao mês) e `distrato`.

**2.1 Indicadores**
- **Arquivos:** `utils/imovibIndicadores.ts` (novo), `__tests__/imovibIndicadores.test.ts` (novo).
- **O que muda:** `calcularIndicadores` sobre o fluxo do acionista. Payback é o primeiro mês em que o acumulado fica ≥ 0 e não volta a ficar negativo. Múltiplo é a soma das entradas dividida pelo módulo da soma das saídas. Retorno sobre o capital é o lucro dividido pelo módulo da exposição máxima. TIR modificada reinveste e financia à TMA.
- **Como sei que terminou:** o teste afirma, para o fluxo `[−100, −50, 80, 120]`: lucro 50; payback simples no mês 4; múltiplo 200/150; exposição máxima no mês 2. Para fluxo que termina negativo, payback `null`. Para fluxo sem saída, múltiplo `null`.

**2.2 Variações e pontos de equilíbrio**
- **Arquivos:** `utils/imovibVariacoes.ts`, `utils/imovibEquilibrio.ts` (novos), `__tests__/imovibEquilibrio.test.ts` (novo).
- **O que muda:** `aplicarVariacao` para as oito variáveis. Os pontos de equilíbrio por bissecção sobre cópias do estudo, conferindo antes se o alvo troca de sinal no intervalo; sem troca, `sem_raiz`.
- **Como sei que terminou:** o teste afirma: `aplicarVariacao` não altera o estudo original (comparação profunda antes e depois); recalcular o estudo com `land_cost = terrenoMaximo(vpl_zero).valor` dá VPL com módulo menor que R$ 1; `terrenoMaximo` com margem-alvo de 20% é menor que com margem-alvo de 10%; estudo sem VGV devolve `sem_vgv`; estudo inviável mesmo com terreno a zero devolve `sem_raiz`.

**2.3 Resumo Executivo com os indicadores**
- **Arquivo:** `components/ImovibExecutiveSummary.tsx`.
- **O que muda:** o cartão "Lucro Líquido (VPL)" vira dois: "VPL" e "Lucro líquido" (com a margem). Segunda fileira com payback, múltiplo do capital e mês da exposição máxima. Cartão "Pontos de equilíbrio" com valor máximo do terreno (VPL zero e margem-alvo), queda de preço suportada, alta de custo suportada e vendas mínimas. O bloco de texto "Simulação Completa" sai.
- **Como sei que terminou:** no navegador, o valor máximo do terreno do Garden Cambuhy aparece e, digitando esse valor como custo do terreno, o VPL do Resumo vai a zero (com arredondamento de reais); print no PR.

**2.4 Fluxo aberto na Dinâmica**
- **Arquivo:** `components/ImovibCashFlow.tsx`.
- **O que muda:** a tabela ganha três grupos recolhíveis (Receitas, Custos, Financiamento) com as linhas de `LinhasDoMes` que têm valor em algum mês, e três alternâncias: "Acionista | Projeto", "Nominal | Real" (deflaciona por `inflation_rate`) e "Mensal | Trimestral | Anual". Os KPIs acompanham a visão escolhida.
- **Como sei que terminou:** no navegador, em todo mês a soma das linhas visíveis é o saldo da linha; na visão Projeto as linhas de financiamento somem e a TIR exibida é `annualIrrProjeto`; a visão anual tem `ceil(duration / 12)` linhas e o mesmo total.

**2.5 Excel e listagem**
- **Arquivos:** `components/ImovibExecutiveSummary.tsx` (`montarPlanilhaImovib`), `__tests__/imovibExportacaoExcel.test.ts`, `components/ImovibDashboard.tsx`.
- **O que muda:** a aba "Indicadores" do Excel ganha os indicadores e os pontos de equilíbrio; "Fluxo de caixa" ganha uma coluna por linha e as colunas do projeto; "Premissas" ganha as premissas da Fase 1. A listagem ganha as colunas "Payback" e "Múltiplo", ocultas por padrão. A listagem **não** calcula ponto de equilíbrio.
- **Como sei que terminou:** o teste do Excel afirma as linhas novas e que toda célula de valor é número; com 3 estudos a listagem abre sem atraso perceptível.

**2.6 Pendências da revisão da Fase 1** *(acrescentado em 11/11: a mensagem que fechou a Fase 1 disse que estes pontos ficavam para a Fase 2)*
- **Arquivos:** `components/ImovibInputRow.tsx`, `components/ImovibIndiceDeCorrecao.tsx`, `components/ImovibCurvaDeVendasCard.tsx`, `components/ImovibExecutiveSummary.tsx`, `components/ImovibDashboard.tsx`, `components/investor/OpportunityDetail.tsx`.
- **O que muda:**
  - apagar o campo e sair volta ao padrão (grava vazio, não 0), nos campos de premissa com padrão;
  - escolher o índice com a taxa vazia preenche a taxa com a média da série, quando ela existe; sem série, a tela diz que a taxa segue a inflação geral;
  - o texto "Receitas e Capital" que restou no Resumo vira "Receitas";
  - "VGV líquido" ganha a explicação (receita dos compradores sem índice, pode passar do VGV com os juros do pós-chaves) no `title` da coluna da listagem e do cartão do portal;
  - o gráfico da curva com VSO 0% diz que a VSO zerada não vende nada, em vez de pedir o preço; e usa o início das vendas já validado pelo motor.
- **Como sei que terminou:** teste de componente para o campo que volta ao padrão e para o índice que preenche a taxa; os textos conferidos no navegador.

### Fase 3 — Sensibilidade, cenários e risco (bloco 10)

**Interfaces que a fase entrega:**

```ts
// utils/imovibSensibilidade.ts
export type MetricaDoEstudo = 'tir' | 'vpl' | 'margem' | 'exposicao';
export interface BarraDoTornado { variavel: VariavelDoEstudo; rotulo: string; base: number; pior: number; melhor: number; }
export type Choques = Partial<Record<VariavelDoEstudo, number>>;
export function tornado(study: ImovibStudy, metrica: MetricaDoEstudo, choques?: Choques): BarraDoTornado[];
export function gradeCruzada(study: ImovibStudy, x: { variavel: VariavelDoEstudo; deltas: number[] },
    y: { variavel: VariavelDoEstudo; deltas: number[] }, metrica: MetricaDoEstudo): number[][];

// utils/imovibCenarios.ts
export interface ImovibScenario { id: string; study_id: string; name: string;
    kind: 'pessimista' | 'base' | 'otimista' | 'personalizado'; choques: Choques; sort_order: number; }
export function aplicarCenario(study: ImovibStudy, choques: Choques): { study: ImovibStudy; options: ImovibMathOptions };

// utils/imovibMonteCarlo.ts
export interface DistribuicaoTriangular { min: number; moda: number; max: number; }
export interface ResultadoMonteCarlo {
    iteracoes: number; semTir: number;
    tir: { p10: number; p50: number; p90: number }; vpl: { p10: number; p50: number; p90: number };
    probVplNegativo: number; probTirAbaixoDaTma: number;
    histogramaVpl: { de: number; ate: number; n: number }[];
}
export function simularMonteCarlo(study: ImovibStudy,
    variaveis: Partial<Record<VariavelDoEstudo, DistribuicaoTriangular>>, iteracoes: number, semente: number): ResultadoMonteCarlo;
```

Choques padrão do tornado (em `constants/imovibDefaults.ts`, editáveis na tela): preço ±10%; custo de obra ±10%; terreno ±10%; velocidade de vendas ±6 meses; prazo de obra ±3 meses; juros ±2 p.p.; índice da obra ±0,2 p.p. ao mês; distrato ±5 p.p.

**3.1 Tornado com oito variáveis e quatro métricas**
- **Arquivos:** `utils/imovibSensibilidade.ts` (novo), `__tests__/imovibSensibilidade.test.ts` (novo), `components/ImovibSensitivityForm.tsx`.
- **O que muda:** o tornado ordena as barras pela amplitude e aceita a métrica. A tela troca as seis chamadas de `useImovibMath` por um `useMemo` com `tornado`, ganha o seletor de métrica e os campos dos choques.
- **Como sei que terminou:** o teste afirma que as barras vêm ordenadas, que subir o preço melhora e subir o custo piora as quatro métricas, e que variável com efeito nulo (juros sem dívida) aparece com barra zero; no navegador o gráfico mostra oito barras e muda ao trocar a métrica.

**3.2 Grade cruzada**
- **Arquivos:** `utils/imovibSensibilidade.ts`, `components/ImovibSensitivityForm.tsx`.
- **O que muda:** tabela 5 × 5 de duas variáveis escolhidas (padrão preço × custo de obra, de −20% a +20%), com a célula do cenário base marcada e as células abaixo da TMA em vermelho.
- **Como sei que terminou:** o teste afirma que a célula central é o valor base e que a grade é monótona nas duas direções para preço × custo; na tela, trocar a variável do eixo recalcula.

**3.3 Cenários salvos**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_scenarios.sql` (tabela `imovib_scenarios`: `id`, `study_id` com `ON DELETE CASCADE`, `name`, `kind` com `CHECK`, `choques jsonb`, `sort_order`, `created_at`, `created_by`; `UNIQUE (study_id, name)`); `services/imovibService.ts` (`listarCenarios`, `salvarCenario`, `excluirCenario`); `utils/imovibCenarios.ts`; `__tests__/imovibCenarios.test.ts`; `components/ImovibCenariosCard.tsx` (novo).
- **O que muda:** tabela comparativa com uma coluna por cenário e uma linha por indicador (VGV, VPL, TIR, margem, exposição, payback). Botão "Criar cenários padrão" grava Pessimista (preço −10%, custo +10%, vendas +12 meses, obra +6 meses) e Otimista (preço +5%, custo −5%, vendas −6 meses). O cenário Base é o próprio estudo e não é gravado. Edição dos choques em `Sheet`.
- **Como sei que terminou:** clicar duas vezes no botão não duplica (a trava `UNIQUE` recusa); usuário sem `canEditImovib` vê os cenários e não vê botão habilitado; `aplicarCenario` com choques vazios devolve resultado igual ao do estudo (teste); policies conferidas em `pg_policies` com as quatro operações.

**3.4 Simulação de Monte Carlo**
- **Arquivos:** `utils/prng.ts` (novo; `prng` sai de `utils/blueprintGerador.ts`, que passa a reexportar), `utils/imovibMonteCarlo.ts` (novo), `__tests__/imovibMonteCarlo.test.ts` (novo), `components/ImovibMonteCarloCard.tsx` (novo).
- **O que muda:** sorteio triangular por variável, 2.000 iterações por padrão, disparado por botão "Simular". As faixas partem dos cenários Pessimista e Otimista quando existem; senão, dos choques do tornado. Saída: probabilidade de VPL negativo, probabilidade de TIR abaixo da TMA, P10/P50/P90 e histograma do VPL. A semente fica visível e editável.
- **Como sei que terminou:** o teste afirma que a mesma semente dá o mesmo resultado e sementes diferentes dão resultados diferentes; que com todas as faixas degeneradas (`min = moda = max = 0`) todo percentil é o valor base; que `probVplNegativo` fica entre 0 e 1; que iteração sem TIR conta em `semTir` e não entra nos percentis. Medido no navegador: 2.000 iterações no Garden Cambuhy em menos de 2 s; acima disso, baixar o padrão para 1.000 e registrar aqui. Os testes da Planta que usam `prng` seguem verdes.

**3.5 Matriz de riscos**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_risks.sql` (tabela `imovib_risks`: `study_id`, `category` com `CHECK` em `legal`, `mercado`, `construcao`, `financeiro`, `ambiental`, `outro`; `description`; `probability` e `impact` de 1 a 5; `mitigation`; `owner`; `status` com `CHECK` em `aberto`, `mitigado`, `aceito`, `encerrado`; `sort_order`); `services/imovibService.ts`; `components/ImovibRiscosCard.tsx` (novo).
- **O que muda:** `StandardTable` dos riscos, edição em `Sheet`, mapa 5 × 5 de probabilidade × impacto. O texto livre de hoje (`swot_analysis.risks`) continua na tela como "Notas gerais de risco", sem conversão.
- **Como sei que terminou:** criar, editar e excluir um risco atualiza a tabela e o mapa sem recarregar a página (§22); o texto livre dos estudos existentes continua visível e editável.

**3.6 Testes de estresse prontos**
- **Arquivo:** `components/ImovibSensitivityForm.tsx`.
- **O que muda:** o simulador troca os dois controles por um por variável e ganha os botões "Obra atrasa 6 meses", "Vendas levam o dobro do tempo", "Distrato dobra" e "Índice da obra sobe 50%". Nada é gravado.
- **Como sei que terminou:** cada botão move os controles e mostra TIR, VPL e exposição do cenário ao lado do base; "Restaurar base" zera tudo.

### Fase 4 — Capital e financiamento (bloco 7)

**Interfaces que a fase entrega:**

```ts
// utils/imovibFinanciamento.ts
export interface PremissasDoFinanciamento {
    percentualDaObra: number; jurosAnual: number; defasagemDaLiberacao: number; vendasMinimasPct: number;
    jurosNaObra: 'capitaliza' | 'paga_mensal'; amortizaCom: 'receitas' | 'repasse';
}
export interface FluxoDaDivida { liberacao: number[]; pagamento: number[]; juros: number[]; saldo: number[]; quitacaoNoFim: number; }
export function fluxoDaDivida(custoDeObraPorMes: number[], receitaLiquidaPorMes: number[], repassePorMes: number[],
    vendasAcumuladasPct: number[], p: PremissasDoFinanciamento): FluxoDaDivida;

// utils/imovibAportes.ts
export interface LinhaDeAporte { mes: number; aporte: number; distribuicao: number; caixa: number; }
export function aportesEDistribuicoes(fluxoDoAcionista: number[], caixaMinimo: number): LinhaDeAporte[];
```

**4.1 Financiamento à produção com regras de liberação e pagamento**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_financiamento.sql` (colunas `financing_release_lag_months`, `financing_min_sales_percent`, `financing_interest_mode` com `CHECK`, `financing_amortization` com `CHECK`, `min_cash_balance`, `discount_rate_basis text`); `utils/imovibFinanciamento.ts` (novo); `__tests__/imovibFinanciamento.test.ts` (novo); `utils/imovibMotor.ts`.
- **O que muda:** `aplicarFinanciamento` passa a chamar `fluxoDaDivida`. Padrões que reproduzem hoje: defasagem 0, sem exigência de vendas, juros capitalizados, amortização com toda a receita líquida. Novas opções: liberar no mês seguinte à medição; só liberar depois de `vendasMinimasPct` do VGV vendido; pagar os juros todo mês; amortizar só com o repasse. O saldo que sobra no fim continua quitado pelo investidor, com o aviso de hoje.
- **Como sei que terminou:** `__tests__/imovibMotorRegressao.test.ts` verde sem edição; o teste novo afirma: com exigência de 30% de vendas, a liberação é zero até o mês em que a venda acumulada passa de 30%; com juros pagos todo mês, o saldo devedor no fim da obra é menor que com juros capitalizados; amortizar só com o repasse aumenta os juros totais; a soma dos pagamentos mais a quitação no fim é igual à soma das liberações mais a soma dos juros.

**4.2 Capital próprio calculado** *(depende de D2)*
- **Arquivos:** `components/ImovibCapitalForm.tsx`, `components/ImovibExecutiveSummary.tsx` (`montarPlanilhaImovib`), `__tests__/imovibExportacaoExcel.test.ts`.
- **O que muda:** o campo editável "Capital Próprio (Equity)" sai. No lugar, o cartão mostra o capital próprio necessário (módulo da exposição máxima), a dívida liberada, a permuta e a participação de cada um no custo total. A coluna `funding_equity_percent` fica no banco, sem uso.
- **Como sei que terminou:** os três percentuais do cartão somam 100%; o Excel traz "Capital próprio necessário" em R$ no lugar da linha antiga; nenhum arquivo grava `funding_equity_percent` (`git grep -n funding_equity_percent -- components services` só acha leitura de compatibilidade em `components/investor/`).

**4.3 Cronograma de aportes e distribuições**
- **Arquivos:** `utils/imovibAportes.ts` (novo), `__tests__/imovibAportes.test.ts` (novo), `components/ImovibAportesCard.tsx` (novo), Excel.
- **O que muda:** aporta quando o caixa ficaria abaixo do mínimo; distribui o que excede o caixa que os meses seguintes ainda vão consumir. Tabela por ano com abertura por mês, e aba "Aportes" no Excel.
- **Como sei que terminou:** o teste afirma, para `[−100, −50, 80, −20, 120]` com caixa mínimo 0: aportes de 100 e 50; no mês 3 distribui 60 e retém 20; no mês 4 não há aporte; no mês 5 distribui 120; a soma das distribuições menos a dos aportes é a soma do fluxo. O caixa nunca fica abaixo do mínimo.

**4.4 Outras fontes de capital** *(depende de D3)*
- **Arquivos:** migration `aplicar_<prefixo>_imovib_funding_sources.sql` (tabela `imovib_funding_sources`: `study_id`, `name`, `kind` com `CHECK` em `mutuo`, `cri`, `scp`, `investidor`, `outro`; `amount`; `entry_month`; `remuneration` com `CHECK` em `juros`, `participacao`; `rate_annual`; `profit_share_percent`; `amortization` com `CHECK` em `BULLET`, `PRICE`, `SAC`; `term_months`; `grace_months`); `utils/imovibFontes.ts` (novo); `__tests__/imovibFontes.test.ts`; `utils/imovibMotor.ts`; `components/ImovibFontesCard.tsx` (novo); `services/imovibService.ts`; a função do Portal do Investidor (item 0.6) passa a devolver as fontes.
- **O que muda:** fonte remunerada a juros entra em `aporteDeTerceiros` no mês de entrada e sai em `remuneracaoDeTerceiros` pelo cronograma de `buildSchedule` (`utils/debtAmortization.ts` — ler `DebtScheduleParams` antes de mapear os campos). Fonte remunerada por participação entra em `aporteDeTerceiros` e recebe `profit_share_percent` de cada distribuição do item 4.3. `net` passa a ser o fluxo do incorporador depois dos terceiros.
- **Como sei que terminou:** sem fontes, o teste de regressão segue verde; o teste novo afirma que um mútuo bullet de 1.000.000 a 12% a.a. por 24 meses entra no mês informado e sai com principal mais juros 24 meses depois; que uma fonte com 30% de participação reduz o lucro do incorporador em 30% do lucro distribuído; que `netProjeto` não muda com nenhuma fonte.

**4.5 TMA justificada**
- **Arquivo:** `components/ImovibDynamicForm.tsx`.
- **O que muda:** ao lado da TMA, o campo "De onde vem esta taxa" (`discount_rate_basis`), que vai para o memorial (item 10.1) e para o relatório.
- **Como sei que terminou:** o texto grava, reaparece ao reabrir e sai no Excel na linha da TMA.

### Fase 5 — Tempo e custos: marcos, terreno, desembolso, rubricas (blocos 11, 5 e 1)

**Interfaces que a fase entrega:**

```ts
// utils/imovibCronograma.ts
export type MarcoId = 'aquisicao' | 'aprovacao' | 'registro_incorporacao' | 'lancamento'
    | 'inicio_obra' | 'habite_se' | 'repasse' | 'fim_das_vendas' | 'encerramento';
export interface MarcoDoEstudo { id: MarcoId; rotulo: string; mes: number | null; data: string | null; }
export function marcosDoEstudo(study: ImovibStudy, r: ImovibMathResult): MarcoDoEstudo[];
export function nomeDoMes(baseDate: string | null | undefined, mes: number): string;  // "mar/27" ou "Mês 3"

// utils/imovibCurvas.ts (acréscimo)
export type TipoCurvaDeDesembolso = 'linear' | 'curva_s' | 'custom';
export function curvaDeDesembolso(tipo: TipoCurvaDeDesembolso, duracao: number, pesos?: number[]): number[];

// types/imovib.ts (acréscimo)
export type ImovibCapexTiming = 'aquisicao' | 'pre_obra' | 'lancamento' | 'obra' | 'vendas' | 'pos_obra';
```

**5.1 Marcos e datas**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_marcos_terreno_curva.sql` (colunas `acquisition_month`, `approval_month`, `incorporation_registry_month`, `land_payment_schedule jsonb`, `cost_curve_type` com `CHECK`, `cost_curve_custom jsonb`, `stock_carrying_cost_unit_month`); `utils/imovibCronograma.ts` (novo); `__tests__/imovibCronograma.test.ts` (novo); `utils/imovibMotor.ts`; `components/ImovibCronogramaTab.tsx` (novo, sub-aba de Premissas).
- **O que muda:** os marcos saem do que o estudo já tem (lançamento = início das vendas; início e fim da obra; repasse = fim da obra + atraso; encerramento = último mês do fluxo) mais os três novos. Com `base_date`, cada marco e cada mês do fluxo ganha data; sem ela, fica "Mês N" — nunca uma data inventada. Avisos novos: `lancamento_antes_do_registro` (a Lei 4.591/64, art. 32, só permite negociar unidades depois do registro da incorporação) e `obra_antes_da_aprovacao`. A sub-aba mostra uma linha do tempo e os campos. Estudo vinculado oferece "Usar as datas do empreendimento" (`launch_date`, `expected_delivery_date`), que preenche os campos sem gravar sozinho.
- **Como sei que terminou:** o teste afirma: com `base_date` em 2027-01-15, o mês 3 chama "mar/27"; sem `base_date`, "Mês 3" e `data` nula; lançamento no mês 2 com registro no mês 5 gera o aviso; marco vazio fica com `mes` nulo e não gera aviso. O gráfico de `OpportunityDetail.tsx` continua legível com os nomes novos (print).

**5.2 Terreno parcelado**
- **Arquivos:** `utils/imovibMotor.ts`, `__tests__/imovibMath.test.ts`, `components/ImovibTerrenoTab.tsx` (novo, sub-aba de Premissas; o campo de custo do terreno sai de `ImovibCapexForm.tsx` para cá, com um resumo só leitura no CAPEX).
- **O que muda:** `land_payment_schedule` é uma lista `{ month, percent }`; vazio vale 100% no mês da aquisição (padrão 1). Rubricas de base `terreno` sem momento próprio saem no mês da primeira parcela. Aviso `terreno_nao_soma_100`.
- **Como sei que terminou:** o teste afirma que 30% no mês 1 e 70% no mês 12 aumenta o VPL e reduz a exposição acumulada até o mês 11 em relação a 100% no mês 1, com o mesmo total nominal de terreno; soma de 90% gera o aviso e calcula como veio; regressão verde.

**5.3 Curva de desembolso da obra**
- **Arquivos:** `utils/imovibCurvas.ts`, `__tests__/imovibCurvas.test.ts`, `utils/imovibMotor.ts`, `components/ImovibCapexForm.tsx`.
- **O que muda:** `curvaDeDesembolso` com `linear` (padrão), `curva_s` (incrementos de `3x² − 2x³`) e `custom`. O custo de obra e as rubricas de momento `obra` seguem a curva. O cartão no CAPEX mostra o gráfico do desembolso e do acumulado.
- **Como sei que terminou:** o teste afirma que a curva S de 24 meses soma 1, é simétrica e coincide com `parametricService.generateSCurveData(1, 24)[i].periodic`; que com curva S a liberação da dívida acompanha o desembolso; regressão verde com `linear`.

**5.4 Importar a curva do planejamento da obra**
- **Arquivos:** `services/imovibService.ts` (`curvaDoPlanejamentoDaObra(empreendimentoId)`), `components/ImovibCapexForm.tsx`.
- **O que muda:** para estudo vinculado cujo empreendimento tem obra com cronograma físico-financeiro (`projects.settings.schedule.distributions`, achada por `empreendimentoLinksService.getSnapshot`), o botão "Importar a curva do planejamento" copia os percentuais mensais para `cost_curve_custom`. É cópia: mudar o planejamento depois não muda o estudo.
- **Como sei que terminou:** sem obra ou sem cronograma, o botão fica desabilitado com o motivo; com cronograma, a curva importada soma 100% e o cartão passa a `custom`.

**5.5 Momento de cada rubrica**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_capex_timing.sql` (colunas `timing` com `CHECK` e `timing_months` em `imovib_capex_items`); `services/imovibService.ts` (`CAPEX_COLS`); `types/imovib.ts`; `utils/imovibMotor.ts`; `__tests__/imovibMath.test.ts`; `components/ImovibCapexForm.tsx`; a função do item 0.6 (as rubricas vão por `row_to_json`, conferir que as colunas chegam).
- **O que muda:** `timing` vazio vale o comportamento de hoje (pela base). Preenchido: `aquisicao` no mês da aquisição; `pre_obra` em partes iguais entre a aquisição e o mês anterior ao início da obra; `lancamento` nos três meses até o início das vendas; `obra` pela curva de desembolso; `vendas` pela curva de vendas; `pos_obra` em `timing_months` meses depois do fim da obra (padrão 12). A linha da rubrica ganha a coluna "Quando sai". O modelo de rubricas de **estudo novo** passa a nascer com `pre_obra` em "2. Projetos e Consultorias" e "6. Legais e Incorporação", e `lancamento` em "Stand de Vendas" e "Apto Decorado".
- **Como sei que terminou:** o teste afirma, num estudo sem dívida, que a mesma rubrica de R$ 100.000 em `pre_obra` sai inteira antes do início da obra e reduz o VPL em relação a `obra`; que `pos_obra` estende `duration`; que rubrica sem `timing` calcula igual a hoje (regressão verde); os 3 estudos existentes não mudam de número.

**5.6 Pós-obra e estoque**
- **Arquivos:** `components/ImovibCapexForm.tsx`, `utils/imovibMotor.ts`, `__tests__/imovibMath.test.ts`.
- **O que muda:** botão "Adicionar rubricas de pós-obra" cria a categoria "10. Pós-obra" com "Assistência técnica" (% da obra, `pos_obra`, valor 0) e "Manutenção e garantia" (R$, `pos_obra`, valor 0). `stock_carrying_cost_unit_month` (condomínio e IPTU por unidade em estoque, por mês) gera a linha `carregamentoDoEstoque` sobre as unidades não vendidas a partir do fim da obra.
- **Como sei que terminou:** clicar duas vezes no botão não duplica; o teste afirma que, com vendas terminando 12 meses depois da obra e custo de R$ 800 por unidade, a linha é negativa só depois do fim da obra e zera quando o estoque acaba.

**5.7 Referência de CUB por torre**
- **Arquivo:** `components/ImovibCapexForm.tsx`.
- **O que muda:** em "Por torre", ao lado do custo de obra, a referência `cubDoPadrao(uf, padrao)` com mês e fonte, e a diferença percentual. A UF vem do terreno do empreendimento vinculado; sem vínculo, um seletor. O padrão vem da subclassificação do estudo (Econômico → R8-B, Médio → R8-N, Alto e Luxo → R8-A), mapeamento visível e alterável. Botão "Usar CUB + x%" com o acréscimo editável (padrão 25%, o mesmo de `HipotesesFinanceiras.acrescimosSobreCubPct`).
- **Como sei que terminou:** no navegador, o Garden Cambuhy mostra o CUB da UF dele com o mês de referência; quando `fonte` é `ESTIMADO`, a tela diz "estimado"; o botão preenche o campo e só grava ao sair dele.

**5.8 Zoneamento no estudo**
- **Arquivo:** `components/ImovibPremisesForm.tsx` (Identificação).
- **O que muda:** cartão só leitura com a zona aplicável do empreendimento (`listRegulatoryZonesByImovibStudy`): zona, coeficiente básico e máximo, taxa de ocupação, gabarito, vagas, lei de referência. Mostra o potencial construtivo (área do terreno × coeficiente) ao lado da área construída do estudo, com a nota de que área construída não é área computável. Link para o Mapa Regulatório. Não gera aviso.
- **Como sei que terminou:** estudo vinculado com zona aplicável mostra o cartão; sem vínculo ou sem zona aplicável, mostra o estado vazio dizendo onde cadastrar.

**5.9 Due diligence do terreno**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_land_checklist.sql` (tabela `imovib_land_checklist`: `study_id`, `item_key`, `label`, `status` com `CHECK` em `pendente`, `ok`, `problema`, `nao_se_aplica`; `notes`; `checked_at`; `checked_by`; `UNIQUE (study_id, item_key)`); `constants/imovibDueDiligence.ts` (novo, os 14 itens); `services/imovibService.ts`; `components/ImovibTerrenoTab.tsx`.
- **O que muda:** botão "Criar checklist" grava os 14 itens: matrícula atualizada; cadeia dominial; ônus e gravames; certidões dos vendedores; IPTU e débitos municipais; certidão de uso do solo; restrição ambiental; contaminação; tombamento; cone aeroportuário; faixas não edificáveis e servidões; topografia; sondagem; viabilidade das concessionárias. Cada item tem status e observação. O Resumo Executivo mostra "Due diligence: x de 14 ok, y com problema".
- **Como sei que terminou:** marcar um item atualiza o contador sem recarregar; item com `problema` aparece em destaque no Resumo; clicar duas vezes em "Criar checklist" não duplica.

### Fase 6 — Tributos (bloco 6) *(padrões dependem de D4)*

**Interfaces que a fase entrega:**

```ts
// utils/imovibTributos.ts
export type RegimeTributarioDoEstudo = 'manual' | 'ret' | 'ret_his' | 'presumido' | 'real';
export interface HipotesesTributarias { retPct: number; retHisPct: number; presumidoPct: number;
    realPisCofinsPct: number; realCreditoSobreCustoPct: number; realIrCsPct: number; }
export function impostoPorMes(regime: Exclude<RegimeTributarioDoEstudo, 'manual'>,
    receitaPorMes: number[], custoPorMes: number[], h: HipotesesTributarias): number[];
export function compararRegimes(study: ImovibStudy):
    { regime: RegimeTributarioDoEstudo; impostoTotal: number; aliquotaEfetiva: number; vpl: number; tir: number; margem: number }[];
```

**6.1 Cálculo por regime**
- **Arquivos:** `constants/imovibDefaults.ts` (`HIPOTESES_TRIBUTARIAS`: 4; 1; 6,73; 9,25; 9,25; 34), `utils/imovibTributos.ts` (novo), `__tests__/imovibTributos.test.ts` (novo).
- **O que muda:** RET, RET de interesse social e presumido são percentual da receita do mês. Lucro real é estimativa: PIS/Cofins sobre a receita menos crédito sobre o custo, mais IRPJ/CSLL sobre o lucro positivo de cada ano do estudo.
- **Como sei que terminou:** o teste afirma: RET sobre receita de 1.000.000 dá 40.000; presumido dá 67.300; no lucro real, ano com prejuízo não paga IRPJ/CSLL e o imposto nunca é negativo; receita zero dá imposto zero em todos.

**6.2 Regime no estudo**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_tax_regime.sql` (colunas `tax_regime` com `CHECK` e `tax_hypotheses jsonb`); `utils/imovibMotor.ts`; `__tests__/imovibMath.test.ts`.
- **O que muda:** `tax_regime` vazio ou `manual` é o comportamento de hoje (rubricas da categoria `7.`, ou `tax_rate` sem rubricas). Com outro regime, o motor ignora as rubricas da categoria `7.` e o `tax_rate`, calcula a linha `impostos` por `impostoPorMes` e avisa (`impostos_pelo_regime`) que as rubricas de imposto estão fora do cálculo. Isso cobre o caso da dúvida D3 do plano de 12/10 (RET e regime normal ligados juntos).
- **Como sei que terminou:** regressão verde com regime vazio; o teste afirma que, no modo Completo com RET 4% e presumido 6,73% preenchidos nas rubricas, escolher `ret` leva o total de `impostos` a 4% da receita, e não a 10,73%.

**6.3 Tela: regime e comparação**
- **Arquivo:** `components/ImovibRegimeTributarioCard.tsx` (novo, na aba Orçamento).
- **O que muda:** seletor do regime, as alíquotas da hipótese (editáveis, gravadas em `tax_hypotheses`) e a tabela comparando os regimes em imposto total, alíquota efetiva, VPL, TIR e margem. Estudo vinculado sugere o regime a partir da empresa do empreendimento (`regime_tributario`, e `tipo_spe = 'patrimonio_afetacao'` sugere RET), sem gravar. O cartão diz que lucro real é estimativa e que as alíquotas devem ser confirmadas com a contabilidade. O aviso de "RET e regime normal são alternativos" do CAPEX some quando o regime não é manual.
- **Como sei que terminou:** no navegador, trocar o regime muda o VPL do Resumo; a linha do regime escolhido fica marcada na comparação; os campos de imposto da Dinâmica e as rubricas `7.` aparecem desabilitados com o motivo.

**6.4 Rubricas de obra no modelo de estudo novo**
- **Arquivo:** `components/ImovibCapexForm.tsx` (`DEFAULT_CAPEX_TEMPLATE`).
- **O que muda:** o modelo ganha "INSS da obra (aferição)" em R$ e "ISS da construção (construtora terceira)" em % da obra, os dois com valor 0.
- **Como sei que terminou:** estudo criado depois do item nasce com as duas rubricas; os 3 existentes não mudam.

### Fase 7 — Mercado (bloco 2)

**Interfaces que a fase entrega:**

```ts
// utils/imovibMercado.ts
export interface ImovibComparable { id: string; study_id: string; name: string; developer?: string; address?: string;
    distance_km?: number; launch_date?: string; total_units?: number; sold_units?: number;
    typical_area?: number; price_sqm?: number; ticket?: number; source?: string; collected_at?: string; notes?: string; }
export interface ResumoDosComparaveis { n: number; precoM2Medio: number | null; vsoMediaMensal: number | null; estoque: number; }
export function resumoDosComparaveis(lista: ImovibComparable[], hoje: string): ResumoDosComparaveis;
export function posicaoDoPreco(precoDoEstudo: number, resumo: ResumoDosComparaveis): number | null;  // % acima (+) ou abaixo (−)
```

**7.1 Comparáveis**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_market_comparables.sql` (tabela `imovib_market_comparables` com os campos da interface e `sort_order`); `utils/imovibMercado.ts` (novo); `__tests__/imovibMercado.test.ts` (novo); `services/imovibService.ts`; `components/ImovibComparaveisCard.tsx` (novo, em Premissas › Mercado).
- **O que muda:** `StandardTable` dos concorrentes com edição em `Sheet`. Preço médio ponderado pelo total de unidades; VSO de cada um = vendidas ÷ total ÷ meses desde o lançamento. Dois cartões: a posição do preço/m² do estudo contra a média e a VSO média com o botão "Usar na curva de vendas", que grava `vso_regional_percent`.
- **Como sei que terminou:** o teste afirma: dois comparáveis de 100 e 300 unidades a R$ 10.000 e R$ 12.000/m² dão média 11.500; comparável sem data de lançamento ou sem total fica fora da VSO e dentro do preço; lista vazia devolve `n = 0` e nulos; preço do estudo de 12.650 contra média de 11.500 dá +10%.

**7.2 Ligação com o Ópura Market**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_opura_market_link.sql` (coluna `opura_terrain_study_id` em `imovib_studies`, com `REFERENCES opura_market_terrain_studies(id) ON DELETE SET NULL`); `services/opuraMarketViabilidadeService.ts`; `components/OpuraMarketModule.tsx`; `components/ImovibPremisesForm.tsx`.
- **O que muda:** `criarViabilidadeImovib` passa a gravar no estudo criado o id do estudo de terreno quando ele já está salvo no Market. Premissas › Mercado mostra "Estudo de mercado de origem" com o que está em `radius_stats` (preço/m² médio, número de anúncios, tíquete e área médios) e a data. A absorção do Market aparece rotulada como hipótese do Market, e não alimenta a curva sozinha.
- **Como sei que terminou:** criar a viabilidade a partir de um estudo de terreno salvo grava o vínculo; a partir de um estudo não salvo, não grava e não falha; estudo de viabilidade sem vínculo mostra o estado vazio. Antes de mexer, conferir em `OpuraMarketModule.tsx:340-361` se o id do estudo de terreno está disponível na hora da criação e registrar aqui.

**7.3 Campos de mercado que passam a servir para alguma coisa**
- **Arquivo:** `components/ImovibPremisesForm.tsx`.
- **O que muda:** "VSO Histórica Região" ganha a indicação de onde é usada (curva de vendas do tipo VSO) e de onde veio (digitada, dos comparáveis ou do Market). "Análise de Concorrentes" continua como texto de apoio, abaixo da tabela de comparáveis.
- **Como sei que terminou:** no navegador, a origem da VSO aparece ao lado do campo e muda quando o botão dos comparáveis é usado.

### Fase 8 — Produto (bloco 3)

**8.1 Indicadores de produto**
- **Arquivos:** `utils/imovibMotor.ts` (`totalSellableArea`, `unidadesVendaveis`), `__tests__/imovibMath.test.ts`, `components/ImovibStaticViability.tsx`.
- **O que muda:** a Estática ganha: eficiência (área privativa vendável ÷ área construída), número de unidades vendáveis, tíquete médio, VGV por m² privativo e custo de obra por m² privativo.
- **Como sei que terminou:** o teste afirma, no estudo-base (40 unidades de 70 m² privativos e 20 m² comuns), eficiência de 77,78% e 40 unidades; tipologia não vendável fica fora da área vendável e dentro da construída.

**8.2 Área equivalente NBR 12721**
- **Arquivos:** `services/imovibService.ts` (`areaEquivalenteDoEmpreendimento(empreendimentoId)`), `components/ImovibStaticViability.tsx`.
- **O que muda:** para estudo vinculado cujo empreendimento tem quadro NBR 12721 publicado (`blueprint_snapshot_nbr12721`), a Estática mostra a área equivalente total e o custo por m² equivalente. Sem quadro publicado, mostra "não medido" com link para a Planta Inteligente. O estudo não recalcula a norma.
- **Como sei que terminou:** estudo sem vínculo ou sem quadro mostra "não medido", nunca zero; com quadro, o total é a soma de `qi_18_floor_equivalent_total_raw` da saída gravada. Antes de escrever, ler `services/blueprintSnapshotNbr12721Service.ts` para saber como achar o quadro mais recente de um empreendimento e registrar aqui.

### Fase 9 — Jurídico e societário (bloco 12)

**9.1 Estrutura jurídica**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_juridico_socios.sql` (colunas `legal_vehicle` com `CHECK` em `propria`, `spe`, `scp`, e `patrimonio_afetacao boolean` em `imovib_studies`; tabela `imovib_partners`: `study_id`, `name`, `share_percent`, `capital_percent`, `notes`, `sort_order`); `components/ImovibPremisesForm.tsx`; `utils/imovibMotor.ts`.
- **O que muda:** cartão "Estrutura jurídica" em Identificação com veículo e patrimônio de afetação. Estudo vinculado a empreendimento com empresa mostra, só leitura, o que está no cadastro dela (`companyService.getIncorporacao`: tipo, registro de incorporação, cartório, matrículas, alvará, habite-se) e oferece "Usar o cadastro da empresa" para preencher os dois campos. Aviso `ret_sem_afetacao` quando o regime é RET e o patrimônio de afetação está desmarcado. Com afetação marcada, o padrão sugerido da devolução no distrato passa a 50%, sem alterar valor já digitado.
- **Como sei que terminou:** o teste do motor afirma o aviso; na tela, estudo sem vínculo edita os dois campos à mão e estudo vinculado sem empresa diz onde cadastrar.

**9.2 Sócios e resultado por sócio** *(depende de D3)*
- **Arquivos:** `utils/imovibSocios.ts` (novo: `resultadoPorSocio(linhas: LinhaDeAporte[], socios: { name; share_percent; capital_percent }[])`), `__tests__/imovibSocios.test.ts` (novo), `services/imovibService.ts`, `components/ImovibSociosCard.tsx` (novo, na aba Capital).
- **O que muda:** tabela de sócios com participação no resultado e participação nos aportes. Para cada sócio: aportes, distribuições, lucro e TIR. Botão "Importar os sócios da empresa" copia de `company_partners` quando o empreendimento vinculado tem empresa. Aviso quando alguma das duas colunas não soma 100%.
- **Como sei que terminou:** o teste afirma: dois sócios 60/40 nos dois percentuais têm a mesma TIR do estudo e lucros de 60% e 40%; sócio com 50% do resultado e 30% dos aportes tem TIR maior que a do estudo; soma de 90% gera aviso e calcula como veio.

### Fase 10 — Governança, relatório e acompanhamento (bloco 13)

**Interfaces que a fase entrega:**

```ts
// utils/imovibMemorial.ts
export interface LinhaDoMemorial { grupo: string; premissa: string; campo: keyof ImovibStudy;
    valor: number | string | null; unidade: string; ehPadrao: boolean; fonte: string | null; data: string | null; }
export function memorialDePremissas(study: ImovibStudy): LinhaDoMemorial[];

// utils/imovibParecer.ts
export interface CriterioDoParecer { id: 'tir_acima_da_tma' | 'margem_minima' | 'exposicao_maxima' | 'vpl_positivo';
    rotulo: string; valor: number | null; minimo: number | null; atende: boolean | null; }
export function criteriosDoParecer(study: ImovibStudy, r: ImovibMathResult, ind: IndicadoresDoEstudo): CriterioDoParecer[];

// utils/imovibAcompanhamento.ts
export interface MesDoAcompanhamento { mes: string; receitaPrevista: number; receitaRealizada: number | null;
    custoPrevisto: number; custoRealizado: number | null; vendasPrevistasAcum: number; vendasReaisAcum: number | null; }
export function compararComRealizado(fluxo: MonthlyFlow[], baseDate: string,
    realizado: { mes: string; entradas: number; saidas: number }[],
    vendas: { mes: string; valor: number }[], vendasPrevistasPorMes: number[]): MesDoAcompanhamento[];

// lib/salesAnalysis.ts (acréscimo)
export function vendasPorMesDoEmpreendimento(input: GroupSalesAnalysisInput, empreendimentoId: string):
    { mes: string; unidades: number; valor: number }[];
```

**10.1 Memorial de premissas**
- **Arquivos:** migration `aplicar_<prefixo>_imovib_governanca.sql` (colunas `premise_notes jsonb`, `recommendation` com `CHECK` em `aprovar`, `aprovar_com_condicoes`, `renegociar`, `reprovar`; `recommendation_notes`; `recommended_by`; `recommended_at`; `hurdle_irr_spread`; `hurdle_margin_percent`; `hurdle_max_exposure`; tabela `imovib_study_versions`: `study_id`, `label`, `notes`, `snapshot jsonb`, `results jsonb`, `created_at`, `created_by`, só com policies de `SELECT` e `INSERT`); `utils/imovibMemorial.ts` (novo); `__tests__/imovibMemorial.test.ts` (novo); `components/ImovibMemorialTab.tsx` (novo); `components/ImovibExecutiveSummary.tsx`.
- **O que muda:** `memorialDePremissas` lista toda premissa que o motor lê, com valor, unidade, se é o padrão do sistema, e a fonte e a data gravadas em `premise_notes`. A sub-aba Memorial mostra a lista em `StandardTable` com fonte e data editáveis na linha e o contador "x de y premissas sem fonte". A aba "Premissas" do Excel passa a sair do memorial.
- **Como sei que terminou:** o teste afirma que toda chave de `CAMPOS_DO_MOTOR` aparece no memorial (premissa nova que alguém esquecer de descrever derruba o teste), que campo vazio sai com `ehPadrao` verdadeiro e o valor do padrão, e que a fonte gravada volta; o teste do Excel segue verde.

**10.2 Versões congeladas** *(depende de D5)*
- **Arquivos:** `services/imovibService.ts` (`congelarVersao`, `listarVersoes`), `utils/imovibVersoes.ts` (novo: `diferencaEntreVersoes(a, b)`), `__tests__/imovibVersoes.test.ts` (novo), `components/ImovibVersoesTab.tsx` (novo), `components/ImovibDetailView.tsx`.
- **O que muda:** botão "Congelar versão" no cabeçalho grava o estudo inteiro (premissas, rubricas, estrutura resumida, cenários) e os indicadores do momento. A aba Versões lista as versões e compara duas: premissas que mudaram e indicadores lado a lado. Versão não se edita nem se apaga.
- **Como sei que terminou:** o teste afirma que duas versões iguais não têm diferença e que mudar uma premissa aparece com o valor antes e depois; no banco, `UPDATE` e `DELETE` em `imovib_study_versions` como usuário autenticado afetam 0 linhas; recalcular o `snapshot` logo depois de congelar reproduz os `results` gravados nela.

**10.3 Parecer e critérios**
- **Arquivos:** `utils/imovibParecer.ts` (novo), `__tests__/imovibParecer.test.ts` (novo), `constants/imovibDefaults.ts` (margem líquida mínima de 15%, folga da TIR sobre a TMA de 0 p.p.), `components/ImovibParecerCard.tsx` (novo, no topo do Resumo).
- **O que muda:** quatro critérios com o valor do estudo, o mínimo e se atende. Os mínimos são editáveis no cartão. O parecer (aprovar, aprovar com condições, renegociar, reprovar), a justificativa, quem recomendou e a data são preenchidos por uma pessoa; o sistema não escolhe o parecer. O cartão mostra também o valor máximo do terreno do item 2.2.
- **Como sei que terminou:** o teste afirma que TIR `NaN` deixa o critério da TIR com `atende` nulo, e não falso; que critério sem mínimo definido (exposição) fica nulo; na tela, o parecer grava e sai no PDF e no Excel.

**10.4 Viabilidade × realizado**
- **Arquivos:** `lib/salesAnalysis.ts` e o teste dele; `utils/imovibAcompanhamento.ts` (novo); `__tests__/imovibAcompanhamento.test.ts` (novo); `services/imovibService.ts` (`realizadoDoEmpreendimento(study)`); `components/ImovibAcompanhamentoTab.tsx` (novo); `components/ImovibDetailView.tsx`.
- **O que muda:** a aba aparece para estudo vinculado. O realizado financeiro soma `opuraAnalyticsService.obraMensal` das obras que `empreendimentoLinksService.getSnapshot` devolve. As vendas reais vêm de `vendasPorMesDoEmpreendimento`, que usa `commercial_deals.date` e a mesma regra de "vendida" (`ETAPAS_VENDIDA`), sem o limite de 12 meses. O previsto é o da versão congelada escolhida, ou o estudo atual. Dois gráficos (receita e custo acumulados, previsto × realizado; vendas acumuladas) e a tabela mensal com o desvio.
- **Como sei que terminou:** o teste afirma que mês sem lançamento realizado sai com `null`, e não zero; que o mês 1 do estudo casa com o mês de `base_date`; que venda cancelada não conta. Na tela: estudo sem `base_date` pede a data-base em vez de alinhar por conta própria; estudo sem obra mostra só as vendas e diz por quê; nenhuma obra de outra organização entra (o vínculo entre organizações já é ignorado na leitura). O Garden Cambuhy abre a aba com as vendas reais dele.

**10.5 Relatório completo em PDF**
- **Arquivos:** `utils/imovibRelatorio.ts` (novo: `secoesDoRelatorio(...)`, puro), `__tests__/imovibRelatorio.test.ts` (novo), `utils/imovibRelatorioPdf.ts` (novo, jsPDF + jspdf-autotable), `components/ImovibExecutiveSummary.tsx`.
- **O que muda:** botão "Relatório completo" ao lado do PDF de hoje, que passa a se chamar "Resumo em PDF". Seções: capa e parecer; indicadores e pontos de equilíbrio; premissas (memorial, com as fontes); mercado; produto; cronograma; fluxo anual; sensibilidade e cenários; riscos; due diligence; tributos; capital e sócios. Texto e tabelas são texto de verdade; só os gráficos entram como imagem, com `coresCompativeisNaCopia`.
- **Como sei que terminou:** o teste afirma que `secoesDoRelatorio` devolve as 12 seções na ordem e que seção sem dado (estudo sem comparáveis) sai com a frase de vazio, e não some; o PDF do Garden Cambuhy abre, a busca por "VPL" acha texto e nenhuma tabela é cortada no meio de uma linha.

**10.6 Conferência final do Portal do Investidor**
- **Arquivo:** `components/investor/OpportunityDetail.tsx`.
- **O que muda:** nada no cálculo. Os controles de prazo do portal passam a usar `aplicarVariacao` (`prazo_obra`, `velocidade_vendas`) em vez de somar meses à mão, e a tela passa a mostrar payback e múltiplo.
- **Como sei que terminou:** para o mesmo estudo, VGV líquido, TIR e prazo do portal (logado e por link) são iguais aos do Resumo do app.

---

## Pontos de atenção na revisão

Condições que o pedido não descreve e que mais provavelmente derrubam quem usa. Cada uma tem teste no item indicado.

1. **Estudo antigo, com todos os campos novos vazios.** Tem de dar o número de hoje, salvo onde o item declara a mudança. Teste do item 0.1, verde em todo commit.
2. **Coluna nova lida antes da migration.** A listagem seleciona por nome e quebra inteira. Item 0.4 e regra 6.
3. **Somas que não fecham 100%** (perfil de recebimento com cinco parcelas, terreno parcelado, sócios). Aviso e cálculo como veio, nunca normalização em silêncio. Itens 1.4, 5.2 e 9.2.
4. **Venda depois das chaves, distrato depois do fim do horizonte, curva que não vende tudo.** Itens 1.1 e 1.2.
5. **Estudo sem data-base.** Nenhuma data inventada: "Mês N" nos marcos e pedido da data no acompanhamento. Itens 5.1 e 10.4.
6. **Portal do Investidor calculando outro número.** O portal roda o mesmo motor, mas recebe o estudo por função própria. Itens 0.6 e 10.6, e regra 13.
7. **Horizonte longo com cálculo pesado.** Pós-chaves de 120 meses com 2.000 iterações de simulação; ponto de equilíbrio rodando por linha da listagem. Itens 2.5 (a listagem não calcula equilíbrio) e 3.4 (medição de tempo).
8. **Quem só lê não grava.** Nenhuma lista nasce ao abrir a aba. Regras 10 e 11; itens 3.3, 5.6 e 5.9.

## Fora do escopo

- Distribuição em cascata entre sócios (retorno preferencial, taxa de performance).
- Cálculo da outorga onerosa por fórmula municipal; ela continua rubrica manual.
- Anexar documentos do GED aos itens da due diligence.
- Projeção futura de índices; o estudo usa taxa mensal constante por índice.
- Otimização automática de mix ou de preço.
- Unificar o cálculo de variação de índice espalhado em outros módulos (contratos, tabela de preços).
- Mudar o comparador de aquisição de terreno do Portal do Investidor (`land_deal_scenarios`).

## Estado

**Fase 0 — Fundações:** 6 de 6 — no ar (PR #353, 85f1db45); migration do 0.6 aplicada em 11/11
- [x] 0.1 Teste de regressão — 2ff86e5b. O estudo com dívida usa juro de 14% a.a., não 12%: a 12%, igual à TMA, o VPL sai idêntico ao do estudo base e o teste não pegaria erro de dívida.
- [x] 0.2 Motor fora do hook, em camadas — 9decdc04. Testes do motor verdes sem edição.
- [x] 0.3 Fluxo aberto por linha e visão do projeto — 806f7530, d8c3e219. `estoqueNaoVendidoPct`, `totalSellableArea` e `unidadesVendaveis` ficam para 1.4 e 8.1, que os calculam. Mudança de número: receita líquida negativa (deduções acima de 100% da receita, ou permuta + inadimplência + distrato acima de 100% do VGV) passou a sair do caixa — antes era descartada — e gera o aviso `receita_liquida_negativa`. Nenhum estudo de regressão muda.
- [x] 0.4 Lista única de campos do motor — 2db98dfa. A listagem seleciona as mesmas 37 colunas de antes (conferido por diff). **Não conferido no navegador**: o roteiro de Playwright precisa da senha do usuário de leitura.
- [x] 0.5 Padrões novos num lugar só — 95ba3a54. O critério virou o teste `__tests__/imovibPadroes.test.ts`, que aceita `?? 0`, `|| 0` e `|| 1` (guardas de campo vazio) e recusa qualquer outro número.
- [x] 0.6 Portal do Investidor com a mesma estrutura (D6) — código 32926c9a, d8c3e219; migration `aplicar_20271111700000_investor_portal_estudo_mesma_estrutura.sql` aplicada em 11/11 com OK do usuário (*"ok para aplicar migracao"*). Medido antes: a única oportunidade publicada ligada a estudo ("Quintino Bocaiúva", estudo Bruninho, 1 link ativo) tem preço/m² 0 no bloco e R$ 9.999.998 no espelho (16 unidades); pelo link o VGV calculado era 0. Conferido depois, no banco: a função devolve as 16 unidades do espelho pelo link ativo, recusa token inválido (`valid: false`) e perdeu o `EXECUTE` de PUBLIC (ficou anon, authenticated, service_role). O motor do app rodado sobre a resposta real dá VGV R$ 9.999.998, VGV líquido R$ 9.199.998 e TIR 14,37% a.a. (com a resposta antiga: VGV 0, TIR N/A). A tela do portal não foi aberta no navegador.

Achado fora do escopo, ao fazer o 0.6: a guarda `secdefSemRevoke` de `__tests__/segurancaMigrations.test.ts` só reconhece funções delimitadas por `$$` ou `$function$`; com `$X$` ou outro delimitador, função `SECURITY DEFINER` sem `REVOKE` passa verde. Pelo menos dez migrations posteriores ao corte usam outro delimitador. Não corrigido aqui.

**Fase 1 — Receitas:** 7 de 7 — revisada, as duas migrations aplicadas; publicação pelo PR #356
- [x] 1.1 Curvas de venda — `utils/imovibCurvas.ts`.
- [x] 1.2 Recebimento por safra, com distrato — `utils/imovibRecebimento.ts`. O `horizonte` corta o distrato e é o tamanho mínimo das séries; repasse atrasado, pós-chaves e revenda podem passar dele. Pós-chaves com 0 meses sai inteiro nas chaves, com aviso.
- [x] 1.3 Colunas das premissas de receita — migration `aplicar_20271111800000_imovib_receitas_por_safra.sql` **aplicada em 11/11** com OK do usuário; 16 colunas conferidas no banco.
- [x] 1.4 Motor usa curva e safra (D1). `netVgvTotal` passou a ser a receita dos compradores sem índice. Antes → depois, estudos do banco com as colunas novas vazias, já com a correção do distrato:

  | Estudo | VGV líquido | VPL | TIR a.a. | Exposição máxima |
  |---|---|---|---|---|
  | Garden Cambuhy | R$ 10.716.160 → R$ 11.557.195 | R$ 3.482.437 → R$ 3.998.485 | 186,2% → 141,28% | −R$ 2.347.203 → −R$ 2.760.018 |
  | Bruninho | R$ 9.199.998 → R$ 9.922.040 | R$ 164.093 → R$ 641.232 | 14,37% → 19,9% | −R$ 5.285.761 → −R$ 5.661.649 |
  | Davi Bueno | sem VGV — sem mudança | | | |

  De onde vem o salto: o modelo antigo descontava 8% do VGV inteiro (3% de inadimplência + 5% de distrato) como perda definitiva. Agora a inadimplência incide só sobre parcelas, intermediárias e pós-chaves, e o distrato custa a devolução, o atraso e o deságio da revenda. No Bruninho: sem distrato e sem inadimplência, VPL R$ 709.543; com 3% de inadimplência, R$ 662.008; com mais 5% de distrato, R$ 641.232; com 10% de distrato, R$ 620.456.
- [x] 1.5 Aba Receitas: curva de vendas (D7) — abas Receitas e Capital; `ImovibFundingForm` apagado. O gráfico lê `vendasPorMes` do motor.
- [x] 1.6 Aba Receitas: perfil de recebimento e distrato — `ImovibInputRow` só grava quando o valor muda.
- [x] 1.7 Índices separados — `utils/indiceVariacao.ts`, `components/ImovibIndiceDeCorrecao.tsx`.

Conferido no navegador em 11/11 (servidor da frente, usuário de leitura, escritas interceptadas; roteiro `c:/tmp/pwtest/imovib_fase1.js`): a listagem mostra o mesmo VPL e TIR do Resumo; Receitas, Capital e Dinâmica abrem nos 3 estudos com 0 escritas e 0 erros de console. Achado e corrigido na conferência: as barras do gráfico da curva sumiam ao lado da linha do estoque (eixo único). Migration do deságio (`aplicar_20271111850000`) aplicada em 11/11 com OK do usuário; coluna conferida no banco.

**Fase 2 — Indicadores e fluxo:** 6 de 6 no código (branch `feat/imovib-fase2`); publicação espera revisão e CI
- [x] 2.1 Indicadores — `utils/imovibIndicadores.ts`. Razões sem base (sem VGV, sem saída) ficam vazias, não 0. Payback = último mês em que o acumulado volta a ficar ≥ 0 e assim fica.
- [x] 2.2 Variações e pontos de equilíbrio — `utils/imovibVariacoes.ts`, `utils/imovibEquilibrio.ts`. Vendas mínimas = 100% + a variação de preço que zera o VPL (a receita do motor é linear no VGV). Cada busca < 50 ms.
- [x] 2.3 Resumo Executivo — VPL e lucro separados; payback, múltiplo, retorno sobre o capital, mês da exposição; cartão de pontos de equilíbrio com margem-alvo editável (padrão 15%, não gravada). Sai o bloco "Simulação Completa".
- [x] 2.4 Fluxo aberto na Dinâmica — `utils/imovibVisaoDoFluxo.ts`; grupos "Receitas e deduções", "Custos", "Financiamento".
- [x] 2.5 Excel e listagem — colunas Payback e Múltiplo ocultas por padrão.
- [x] 2.6 Pendências da revisão da Fase 1 — capital próprio e dívida não voltam ao padrão (vazio na dívida faria o motor usar o "% Financiado" legado).

Conferido no navegador em 11/11 (Garden Cambuhy e Bruninho, usuário de leitura, escritas interceptadas; roteiro `c:/tmp/pwtest/imovib_fase2.js`): 0 escritas, 0 erros de console. No Bruninho, terreno máximo R$ 2.791.232 − terreno atual R$ 2.150.000 = R$ 641.232, o VPL do estudo (o terreno sai no mês 1, sem desconto). Achados e corrigidos: grupo "Receitas" somava impostos e corretagem (virou "Receitas e deduções"); erro de digitação no subtítulo da TIR.

**Fase 3 — Risco:** 0 de 6
- [ ] 3.1 Tornado
- [ ] 3.2 Grade cruzada
- [ ] 3.3 Cenários salvos
- [ ] 3.4 Monte Carlo
- [ ] 3.5 Matriz de riscos
- [ ] 3.6 Testes de estresse prontos

**Fase 4 — Capital:** 0 de 5
- [ ] 4.1 Financiamento à produção
- [ ] 4.2 Capital próprio calculado (D2)
- [ ] 4.3 Aportes e distribuições
- [ ] 4.4 Outras fontes de capital (D3)
- [ ] 4.5 TMA justificada

**Fase 5 — Tempo e custos:** 0 de 9
- [ ] 5.1 Marcos e datas
- [ ] 5.2 Terreno parcelado
- [ ] 5.3 Curva de desembolso
- [ ] 5.4 Importar a curva do planejamento
- [ ] 5.5 Momento de cada rubrica
- [ ] 5.6 Pós-obra e estoque
- [ ] 5.7 Referência de CUB
- [ ] 5.8 Zoneamento no estudo
- [ ] 5.9 Due diligence do terreno

**Fase 6 — Tributos:** 0 de 4
- [ ] 6.1 Cálculo por regime (D4)
- [ ] 6.2 Regime no estudo
- [ ] 6.3 Tela: regime e comparação
- [ ] 6.4 Rubricas de obra no modelo

**Fase 7 — Mercado:** 0 de 3
- [ ] 7.1 Comparáveis
- [ ] 7.2 Ligação com o Ópura Market
- [ ] 7.3 Campos de mercado com uso

**Fase 8 — Produto:** 0 de 2
- [ ] 8.1 Indicadores de produto
- [ ] 8.2 Área equivalente NBR 12721

**Fase 9 — Jurídico e societário:** 0 de 2
- [ ] 9.1 Estrutura jurídica
- [ ] 9.2 Sócios e resultado por sócio (D3)

**Fase 10 — Governança:** 0 de 6
- [ ] 10.1 Memorial de premissas
- [ ] 10.2 Versões congeladas (D5)
- [ ] 10.3 Parecer e critérios
- [ ] 10.4 Viabilidade × realizado
- [ ] 10.5 Relatório completo em PDF
- [ ] 10.6 Conferência final do Portal do Investidor

## Verificação

Ao fim de cada fase, na frente:

```bash
npx vitest run __tests__/imovib*.test.ts __tests__/indiceVariacao.test.ts __tests__/writeBackImovib.test.ts
npx vitest run __tests__/components/Imovib*.test.tsx
npx vitest run __tests__/segurancaMigrations.test.ts __tests__/migrationsPrefixo.test.ts __tests__/orgContextGuard.test.ts
npm run typecheck
bash scripts/check-ui-standard.sh <cada .tsx tocado>
```

De ponta a ponta, ao fim do plano, no navegador, com o Garden Cambuhy:

1. A listagem mostra o mesmo VPL, a mesma TIR e a mesma margem do Resumo do estudo.
2. Em Receitas, trocar a curva para VSO e incluir 20% de pós-chaves muda a exposição máxima e estende o fluxo; o aviso de estoque aparece e leva à aba certa.
3. No Resumo, digitar como custo do terreno o "valor máximo do terreno" leva o VPL a zero.
4. Em Sensibilidade e Risco, o tornado tem oito barras; os cenários padrão são criados uma vez só; a simulação com a mesma semente repete o resultado.
5. Em Capital, exigir 30% de vendas para liberar o financiamento aumenta o capital próprio necessário.
6. Em Orçamento, trocar o regime tributário muda o VPL e a tabela de comparação marca o regime escolhido.
7. Congelar uma versão, alterar o preço/m² e comparar: a aba Versões mostra a premissa alterada e os indicadores antes e depois.
8. A aba Acompanhamento mostra as vendas reais contra as previstas da versão congelada.
9. O relatório completo abre com as 12 seções e texto pesquisável.
10. O Portal do Investidor, logado e por link, mostra o mesmo VGV líquido, a mesma TIR e o mesmo prazo do Resumo.
11. Um usuário sem permissão de edição abre todas as abas e não grava nada (roteiro `c:/tmp/pwtest/imovib_somente_leitura.js`, estendido às abas novas).

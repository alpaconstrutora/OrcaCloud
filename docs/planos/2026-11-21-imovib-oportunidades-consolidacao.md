# Plano — Imovib × Oportunidades: Imovib é a fonte, Oportunidade é vitrine + captação

> Plano vivo (REGRA #6). Uma frente por fase: `bash scripts/nova-frente.sh imovib-oport-fN`, de `origin/main`. Merge é meu
> (`gh pr ready` + `gh pr merge`); push em `main` é o deploy (REGRA #8).

## Pedido original (21/11/2026, sessão e7b82365)

1ª mensagem:
> Anallise imovib x oportunidades, veja se existem funcionalidades duplicadas, conflitantes, que deveria existir, que existe mas esta no lugar errado, que existe mas não esta funcionando, sugira outras analises

2ª mensagem (resposta à análise):
> 1. Funcionalidades duplicadas
> 1.1. Riscos: No Imovib / Empreendimento
> 1.2. Due diligence: No Imovib / Empreendimento
> 1.3. Cenários: No Imovib / Empreendimento
> 1.4. Concorrentes: No Imovib / Empreendimento
> 1.5. Decisão: No Imovib / Empreendimento
> 1.6. Obra: No Imovib / Empreendimento
> 1.7. Documentos: No Imovib / Empreendimento
> 1.8. Dados técnicos e financeiros: No Imovib / Empreendimento
> 2. Números que se contradizem: Imovib é a fonte da verdade
> 3.  Existe, mas não funciona: corrigir todos
> 4.  Existe, mas está no lugar errado: Oportunidade ser só a vitrine e a captação: versão publicada,
> 5. O que deveria existir: implemente todos
> 6. Outras análises que sugiro: faça todas as analises sugeridas

## Contexto

A Oportunidade (`components/investor/*`, `investor_opportunities`) refaz o que o Imovib já faz: riscos, due diligence,
cenários, concorrentes, decisão, obra, documentos, números. Ela também mostra números digitados ou inventados ao lado
dos números da versão congelada. Estado do banco em 21/11: **1 oportunidade** (Garden: estudo sim, versão não, não
publicada); **0 linhas** em `opportunity_risks`, `due_diligence_items`, `investor_opportunity_competitors`,
`land_deal_scenarios`, `investment_committee_decisions`, `opportunity_documents`, `opportunity_interests`;
`risks_json` vazio. Por isso não há migração de dados. **Antes de cada DROP, refazer a contagem**: se aparecer linha,
parar e migrar.

## Decisões (do usuário, 21/11)
- **D1** O dono de riscos, DD, cenários, concorrentes, decisão, obra, documentos e dados técnicos/financeiros é o
  Imovib/Empreendimento.
- **D2** O Imovib é a fonte da verdade dos números. O investidor vê só a versão congelada (`snapshot.calculo.investidor`).
- **D3** A Oportunidade é só vitrine + captação.
- **D4** Rascunho pode existir sem estudo; **publicar exige estudo + versão com `calculo`**.
- **D5** O Comitê & Gates vai para o estudo (aba "Comitê"); cada decisão registra a versão avaliada; o Parecer é a
  recomendação do analista.

Escolhas padrão que tomo no plano (podem ser trocadas na aprovação):
- Ficam na Oportunidade, porque não existem no Imovib: título, subtítulo, tipo, status, ticket mínimo, distâncias,
  equipe, capa, interesses.
- Localização, obra, áreas, pavimentos, prazo e início **leem** do empreendimento/estudo e não são mais digitados.
- O simulador compara com a **TMA do estudo** (congelada na versão), não com um CDI fixo. Não há série de CDI no app.
- Os riscos ficam em `imovib_risks` enriquecido. O Módulo Riscos continua com obra/contrato/corporativo, como decidido
  em 14/11.


## Estado (atualizar a cada fase)

**Fase 1: 5 de 5 itens feitos na frente `imovib-oport-f1`.** Migrations 950000–954000 APLICADAS em 21/11 (OK do
usuário), conferidas no banco (colunas, tabelas novas, antigas apagadas, gatilho, grants; função do gatilho sem
EXECUTE para anon/authenticated). Prova SQL do comitê (transação desfeita): aprovar sem versão → recusado; com
versão → quem/quando gravados; voltar a pendente limpa. Edge Function `read-matricula` PUBLICADA (sem login → 401).

- 1.1 ✅ `aplicar_20271121950000_imovib_riscos_completos.sql`; rótulos e faixa única em `constants/imovibRiscos.ts`
  (faixa = a do módulo Riscos, `utils/riskScoring.ts`). O recorte do investidor para riscos NÃO mudou (os campos
  novos são internos), então a RPC do portal não precisou mudar por este item. As 2 versões do banco têm 0 riscos:
  a troca legal→juridico não afeta nenhuma restauração.
- 1.2 ✅ `aplicar_20271121951000_imovib_due_diligence_completa.sql`; `utils/imovibDueDiligenceMatricula.ts`
  (mapeamento puro + teste); botão "Ler matrícula (IA)" no cartão; PDF vai ao item MATRICULA do checklist legal
  (`empreendimentoDocumentosService.guardarMatricula`). Edge Function com `item_key` no esquema — **publicar**.
  Sem a publicação, todo achado cai no item "Matrícula" (não quebra).
- 1.3 ✅ `aplicar_20271121952000_imovib_comparaveis_valorizacao.sql` (coluna + `fn_investor_portal_get_versao`
  recriada só com `appreciation_pct` no recorte); `vsoDoComparavel` por linha.
- 1.4 ✅ Mudança de nome em relação ao plano: em vez de trocar a chave de `land_deal_scenarios`, a tabela nova é
  `imovib_land_deals` (só premissas; números saem do motor) e `land_deal_scenarios` é apagada se vazia
  (`aplicar_20271121953000`). Cálculo: `utils/imovibModelosDeAquisicao.ts`; cartão em Premissas › Terreno com
  "Usar no estudo" (grava com "Salvar Premissas").
- 1.5 ✅ Tabela nova `imovib_committee_decisions` (por estudo + versão; gatilho grava quem/quando; escrita só
  owner/admin) e `investment_committee_decisions` apagada se vazia (`aplicar_20271121954000`). Aba "Comitê" no
  estudo; dossiê `utils/imovibDossieDoComite.ts`.
- Antecipado da 2.7: as abas Due Diligence, Riscos, Modelos de Aquisição e Comitê saíram da Oportunidade nesta fase
  (duas tabelas delas foram apagadas aqui), com os painéis e serviços (`CommitteeGatePanel`, `DueDiligencePanel`,
  `LandDealComparatorPanel`, `RiskMatrixPanel`, `dueDiligenceService`, `investmentCommitteeService`,
  `landDealComparatorService`, `opportunityDossierService`, `opportunityRiskService`). As tabelas
  `opportunity_risks`, `due_diligence_items` e `due_diligence_findings` continuam até a 2.7.
- Pré-existente, não corrigido aqui: `check-ui-standard.sh components/investor/OpportunityDetail.tsx` acusa §7
  (font-bold em `<td>`) e §8 (pílula) — também no `main`; os trechos saem na 2.3.
- Prova: tsc exit 0; 336 arquivos / 865 testes das áreas tocadas e 98 testes de migrations, todos verdes.

**Fases 2 a 5:** não começadas.

---

## Fase 1 — O Imovib recebe o que a Oportunidade tinha

| # | Item | O que muda | Pronto quando |
|---|---|---|---|
| 1.1 | Riscos completos | Migration: `imovib_risks` ganha `causa`, `consequencia`, `tendencia`, `contingencia`, `prazo`; a CHECK de categoria vai para as 13 de `services/opportunityRiskService.ts`, mapeando as atuais legal→juridico e outro→outro; a de situação ganha `em_mitigacao` e `materializado`. `ImovibRiscosCard.tsx`, `types/imovib.ts`, select em `imovibService.ts:768,778`, rótulos em `utils/imovibRelatorio.ts:108-109`. Uma só faixa de severidade, exportada de `ImovibRiscosCard` e usada pelo comitê e pelo dossiê. | O cartão grava e lê os campos novos; `CAMPOS_PARA_O_INVESTIDOR.riscos` (`utils/imovibVersoes.ts:178`) e `fn_investor_portal_get_versao` (recriada) iguais; `__tests__/investorPortalEstudo.test.ts` verde |
| 1.2 | DD com leitura de matrícula | `imovib_land_checklist` ganha `criticidade`, `responsavel`, `prazo`, `ai_extracted`, `ai_confidence`, `ai_source_excerpt`. Edge Function `read-matricula`: o esquema ganha `item_key` com enum fechado (matricula, cadeia_dominial, onus_gravames, faixas_servidoes, restricao_ambiental, tombamento, certidoes_vendedores). `ImovibDueDiligenceCard` ganha o botão "Ler matrícula (IA)", que faz **UPDATE** dos itens pela chave (inconforme→problema; o resto fica pendente) e manda o PDF ao GED como `MATRICULA` do checklist legal (`empreendimentoDocumentosService.anexarArquivo`), quando há empreendimento. | Teste novo do mapeamento achado→item; a IA nunca grava `ok`; quem conferiu continua vindo do gatilho do banco |
| 1.3 | Comparáveis substituem concorrentes | `imovib_market_comparables` ganha `appreciation_pct`; `ImovibComparaveisCard` mostra a VSO por linha (`utils/imovibMercado.ts:35-40`) e a valorização. Recorte do investidor (TS + SQL) inclui `appreciation_pct`. | Teste em `imovibMercado` da VSO por linha; contrato TS=SQL verde |
| 1.4 | Modelos de aquisição no motor | `LandDealComparatorPanel` vira cartão em Premissas › Terreno (`components/ImovibTerrenoTab.tsx`). Cada modelo monta uma **variante do estudo** (compra → `land_cost` + `land_payment_schedule`; permuta física/financeira → `swap_physical_percent`/`swap_financial_percent`; opção → parcelas com prêmio; sociedade → sócio em `imovib_partners` em memória) e roda `computeImovibMath`, no molde de `utils/imovibVariacoes.ts`. Sai `calculateDealImpactOnStudy` (taxa fixa de 1% a.m., tudo no mês 0). Migration: `land_deal_scenarios` troca `opportunity_id` por `study_id` (0 linhas). | Teste: a variante "compra direta" igual ao estudo base dá o mesmo VPL/TIR do motor; a permuta muda o VGV vendável |
| 1.5 | Comitê no estudo | Migration: `investment_committee_decisions` troca `opportunity_id` por `study_id` + `version_id` (FK para `imovib_study_versions`, obrigatória ao decidir). Nova aba "Comitê" em `components/ImovibDetailView.tsx` (ao lado de Versões) com `CommitteeGatePanel` reescrito: o bloqueio lê DD crítica/alta não ok do Imovib e riscos acima da faixa e não encerrados; mostra o Parecer. Dossiê (`services/opportunityDossierService.ts`) lê DD, riscos, parecer, modelos de aquisição e a versão. Modo leitura por `useImovibEdicao`. | Decidir um gate sem versão é recusado (banco); o dossiê sai com os dados do Garden |

## Fase 2 — A Oportunidade vira vitrine (só números da versão)

| # | Item | O que muda | Pronto quando |
|---|---|---|---|
| 2.1 | Publicar exige versão | O gatilho `fn_investor_opportunity_versao_valida` (vigente em `aplicar_20271115970000`) passa a recusar publicada sem estudo, ou com versão sem `snapshot ? 'calculo'`. | Prova SQL: publicar sem estudo → erro; com versão com cálculo → ok |
| 2.2 | Formulário enxuto | `OpportunityForm.tsx`: saem dados técnicos, financeiros (fica ticket mínimo), cenários, riscos, concorrentes, captação digitada, obra vinculada e galeria. O estudo é obrigatório para publicar, com o motivo no botão. Obra, cidade/UF, áreas, pavimentos, prazo e início aparecem **lidos**: empreendimento (`endereco_city/state`, `project_id`) e versão (`results`, `secoes.produto`). | `check-ui-standard.sh` limpo; o formulário do Garden não pede nada que o app já sabe |
| 2.3 | Detalhe só com a versão | `OpportunityDetail.tsx`: saem o dashboard morto (ramo `!study`), `ScenarioComparison`, a tabela `risks_json`, o gráfico de concorrentes (5%/12% fixos e custo no lugar de preço) e o texto montado com custo/prazo digitados. O TIR e o prazo do cabeçalho vêm de `calculo.investidor.indicadores`, não do motor vivo. A aba Obra usa a obra do empreendimento e o custo da versão. Riscos, comparáveis e DD da versão (`vp.relatorio`) ganham seção no detalhe do portal (`PortalOportunidadeDetalhe.tsx`). | Teste de componente: com versão, nenhum número digitado na tela; sem versão (rascunho), aviso de prévia |
| 2.4 | Simulador honesto | `InvestmentSimulator.tsx`: sem valores fixos. Entram só `calculo.investidor.indicadores` (lucro, exposição, TIR, prazo, TMA, múltiplo); participação = aporte ÷ meta de captação (F4); comparação com a TMA do estudo; sem cenários inventados (usa os da versão). Sem versão não aparece. Também sai o uso sem dados em `InvestorDashboard.tsx:919-923`. | Teste: sem dados, o componente não renderiza; com o Garden, os números batem com o painel |
| 2.5 | Um ROI, sem reserva digitada | `utils/oportunidadeNumerosDaVersao.ts` usa só a versão, com ROI = `retornoSobreCapital` (`utils/imovibIndicadores.ts`) e "—" sem versão. Listas: `OpportunitiesTab.tsx`, `PortalOpportunities.tsx`. | `__tests__/oportunidadeNumerosDaVersao.test.ts` atualizado e verde |
| 2.6 | RPCs sem campo interno | `fn_investor_portal_get_opportunities`: lista explícita de campos de vitrine + indicadores + `results` da versão + captação (F4), no lugar de `to_jsonb(o)`. `get_public_marketplace`: números da versão, sem os digitados, + `REVOKE … FROM PUBLIC` (REGRA #7). `PublicMarketplaceView`/`PublicOpportunityDetail` acompanham. | Prova SQL como anon/token: o payload não tem `risks_json`/`cost_estimate`; o contrato TS=SQL verde |
| 2.7 | Apagar o duplicado | Recontar as linhas. Depois: DROP das colunas digitadas (vgv, roi_pct, tir_pct, cost_estimate, cost_per_m2, duration_months, land/built_area, floors, scenario_*, projected_yield, risks_json, simulation_params_json, gallery_urls, project_id, target/current_funding_value) e das tabelas `opportunity_risks`, `due_diligence_items`, `due_diligence_findings` (+ bucket), `investor_opportunity_competitors`. Removem-se `RiskMatrixPanel`, `DueDiligencePanel`, `ScenarioComparison`, `OpportunityPhotosPanel`, os serviços sem uso e as abas do gestor. | `git grep` das colunas = 0; tsc e vitest verdes; a migration de reversão fica guardada |

## Fase 3 — Documentos pelo GED

| # | Item | O que muda | Pronto quando |
|---|---|---|---|
| 3.1 | Audiência "oportunidade" | Migration no molde de `aplicar_20270920000002_ged_shares_credor.sql`: `opura_document_portal_shares` ganha a audiência `oportunidade` + `opportunity_id` (FK CASCADE), índice único **não parcial** (`aplicar_20270920000004`). Botão Compartilhar do GED oferece a oportunidade. | Compartilhar um documento do empreendimento com a oportunidade grava a linha |
| 3.2 | Portal lê do GED | `fn_investor_portal_get_dataroom` reescrita com a mesma assinatura e checagens, lendo compartilhamentos + versão ativa, com `doc.organization_id = org da oportunidade`. Edge Function `investor-portal-dataroom-download` assina no `opura-docs`, com `caminhoSemTravessia`. `DataRoomPanel` mapeia `storage_path`; o texto "1h" vira o prazo real. | Pelo link de teste, o investidor lista e baixa; um caminho fora da lista → 403 |
| 3.3 | Sai o Data Room próprio | Recontar. Depois: DROP de `opportunity_documents` e dos buckets `opportunity-dataroom`/`opportunity-photos` (conferir 0 objetos). Sai a integração em `services/documentService.ts:584-645`. Capa e fotos da vitrine passam a vir de `empreendimento-midia` (decorado, plantas, vistas). `get_public_marketplace` lê dali. | GED sem erro no console; o marketplace mostra as imagens do empreendimento |

## Fase 4 — Captação ligada ao dinheiro real

| # | Item | O que muda | Pronto quando |
|---|---|---|---|
| 4.1 | Oportunidade ↔ SPE | `investor_opportunities.spe_entity_id` (FK). `SpeManager` passa a gravar o `project_id` da SPE. | O formulário escolhe a SPE da org |
| 4.2 | Meta e captado calculados | Meta = soma das fontes `investidor`/`scp` da versão, senão `indicadores.exposicaoMaxima`. Chamado = Σ `spe_partners.capital_calls_total`; integralizado = Σ `capital_call_items.amount_paid` das chamadas não canceladas. Vem pela RPC (`captacao: {meta, chamado, integralizado}`) e aparece na barra do detalhe e do portal. | Prova SQL com SPE de teste; nenhum campo de captação digitado |
| 4.3 | Interesse → sócio | `opportunity_interests` ganha `investor_id` (gravado pelo token em `fn_investor_portal_submit_interest`) e `valor_pretendido`. Em "fechado", o botão "Tornar sócio" cria ou escolhe o investidor e insere em `spe_partners`. | Teste do serviço; o botão desligado diz por quê (sem SPE) |

## Fase 5 — O que deveria existir (restante)

| # | Item | Pronto quando |
|---|---|---|
| 5.1 | Aviso "versão publicada desatualizada" na aba Versões e na oportunidade: compara os indicadores da versão com o estudo atual e lista as diferenças (VGV, VPL, TIR, exposição) quando o estudo mudou depois da versão. | Teste com estudo alterado após congelar |
| 5.2 | O Parecer trava a publicação: parecer `reprovar` → gatilho recusa; sem parecer ou `renegociar` → aviso no formulário. | Prova SQL + mensagem na tela |

(O preenchimento automático e a coerência obra × estudo já entram em 2.2/2.3, porque os campos passam a ser lidos.)

## Fase 6 — Resultado das análises (item 6). Achados novos: aguardam sua decisão, não entram sem OK

- **Portal ponta a ponta:** cobertos pelas F2–F4 (payload com campos internos, marketplace só com números digitados,
  `OpportunityDetail` com token sem uso).
- **Riscos:** 6 registros (+ `swot_analysis.risks` e `risk_score` do Market), com faixas de severidade diferentes em 5
  lugares. Unificados em 1.1. Ainda aberto: botão "promover ao Módulo Riscos" quando vira obra.
- **Documentos:** `fn_portal_get_ged_documents` sem `search_path`/REVOKE; `portal-ged-download` não confere a org;
  compartilhamento aponta para o documento (versão nova aparece na hora).
- **Captação:** pagar uma chamada de capital não gera aporte em `investor_contributions` (dois controles de dinheiro).
- **Comparáveis:** `opura_market_monitored_competitors` e `listDevelopments` sem tela; nada importa lançamentos do
  Market para comparáveis.
- **VGV:** o espelho soma permutadas em "Vendido+Permutado" e deixa reservadas fora; o distrato some do mês original
  em Vendas; ninguém compara estudo × espelho × vendido (proposta: 3ª coluna "tabela" no Acompanhamento).
- **Obra:** a FK de `empreendimento_towers.project_id` existe, mas os comentários dizem que não.
- **Segurança:** `get_public_marketplace` sem REVOKE PUBLIC (corrigido em 2.6); bucket público `opportunity-photos`
  (sai em 3.3).

## Verificação (cada fase)
- `npx tsc --noEmit`, a suíte das áreas tocadas (`imovib*`, `investor*`, `oportunidade*`, `investorPortalEstudo`,
  `__tests__/components/*Oportunidade*`, `DataRoomPanelPortal`), `__tests__/imovibMotorRegressao.test.ts` **sem
  mudança de número** (nenhum item mexe no motor) e `bash scripts/check-ui-standard.sh` em cada `.tsx` tocado.
- Migrations: aplicar só com o seu OK (`npx supabase db query --linked -f`, nunca `db push`), com REVOKE em toda
  função nova, prefixo conferido contra o `origin/main` do momento e a reversão guardada.
- Tela (Playwright, Garden): congelar a versão "Conferência", criar uma oportunidade de teste e publicar, abrir pelo
  link do investidor, conferir que VGV/TIR/ROI/prazo/captação = versão, baixar 1 documento do GED, manifestar
  interesse → "Tornar sócio". Depois despublicar e apagar a oportunidade de teste.
- Publicação: PR por fase, CI verde (conferir a lista dos pesados), merge, `bash scripts/publicar-producao.sh`.

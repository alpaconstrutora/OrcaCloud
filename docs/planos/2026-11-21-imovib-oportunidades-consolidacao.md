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

### Resumo em 21/11/2026 — Fases 1 a 5 NO AR; Fase 6 aguarda decisão

| Fase | Itens | PR (squash) | Banco | Edge Function | Produção |
|---|---|---|---|---|---|
| 1 — Imovib recebe a análise | 5/5 ✅ | #621 (97951b4) | 950000–954000 aplicadas | `read-matricula` publicada | ✅ conferido |
| 2 — Oportunidade vira vitrine | 7/7 ✅ | #623 (1660bc1) | 960000 (antes) + 961000 (depois do deploy) aplicadas | — | ✅ conferido |
| 3 — Documentos pelo GED | 3/3 ✅ | #626 (eaedc27) | 970000 aplicada | `investor-portal-dataroom-download` publicada | ✅ conferido |
| 4 — Captação pela SPE | 3/3 ✅ | #627 (4d7e7dd) | 980000 aplicada | — | ✅ conferido |
| 5 — O que deveria existir | 2/2 ✅ | 5.2 no #623 · 5.1 no #627 | (no gatilho da 960000) | — | ✅ conferido |
| 6 — Achados das análises | análise feita | — | — | — | ✅ viraram a Fase 7 |
| 7 — Pendências e achados ("implemente todos") | 11/11 ✅ | #631 (87c3d41) | 990000–995000 aplicadas | `portal-ged-download` v7 publicada | ✅ conferido |

"Conferido" = `scripts/conferir-producao.sh` com um texto novo de cada fase: o domínio serve exatamente o
`origin/main` do merge. Todas as frentes `imovib-oport-f1…f4` foram fechadas.

**Provado no banco (transação desfeita no fim):** comitê sem versão recusado; publicar sem estudo/versão recusado e
parecer "reprovar" recusa; vitrine sem campo interno; Data Room pelo link lista o compartilhado e recusa oportunidade
despublicada; interesse grava investidor do token e valor.

**Não provado (sem dado para provar):**
- SPE de outra organização recusada pelo gatilho (não existe SPE em outra org).
- Marketplace público (a org não tem slug configurado).
- Roteiro de tela ponta a ponta do §Verificação (Playwright no Garden: congelar → publicar → link do investidor →
  baixar documento → interesse → "Tornar sócio") **não foi rodado**; as telas foram cobertas por testes de
  componente.

### Pendências

| # | Pendência | Quem | Situação |
|---|---|---|---|
| P1 | Apagar os buckets antigos `opportunity-dataroom`, `opportunity-photos` (público) e `due-diligence-findings` | usuário, pelo painel do Supabase › Storage | Os 3 com **0 objetos** (conferido 21/11). SQL bloqueia (`storage.protect_delete`) e a CLI não autentica na API de storage com a chave nova |
| P2 | Rodar o roteiro de tela ponta a ponta do §Verificação no Garden | eu, quando houver versão congelada para publicar | Não rodado |
| P3 | Provar a recusa de SPE de outra org e o marketplace | — | ✅ 7.10 (21/11, transação desfeita) |
| P4 | Teste instável `ImovibVersoes` | — | ✅ 7.11: causa = tempo-limite padrão de 5 s menor que o `waitFor` de 10 s |
| P5 | Achados da Fase 6 (abaixo) | — | ✅ todos implementados na Fase 7 (pedido "implemente todos") |

Achados da Fase 6 que viram trabalho, se aprovados (detalhe em §Fase 6):
1. Pagar chamada de capital → gerar aporte em `investor_contributions` (hoje são dois controles de dinheiro).
2. VGV: espelho soma permutadas e deixa reservadas fora; distrato some do mês original; comparar estudo × espelho ×
   vendido.
3. Segurança do GED no portal: `fn_portal_get_ged_documents` sem `search_path`/REVOKE; `portal-ged-download` não
   confere a org.
4. Botão "promover ao Módulo Riscos" quando o empreendimento vira obra.
5. Market: concorrentes monitorados sem tela; importar lançamentos do Market para comparáveis.
6. Comentário errado sobre a FK `empreendimento_towers.project_id`.
7. Compartilhamento do GED aponta para o documento (versão nova aparece na hora para o investidor) — decidir se é o
   desejado.

### Histórico por fase

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

**Fase 1 NO AR** (PR #621, squash 97951b4; `conferir-producao.sh` com "Usar no estudo" e "Comitê de investimentos" ✅).

**Fase 2: 7 de 7 itens — NO AR** (PR #623, squash 1660bc1). 960000 aplicada antes do deploy e 961000 depois, com OK.
- 2.1 ✅ gatilho em `aplicar_20271121960000_oportunidade_vitrine.sql`: publicar exige estudo + versão com cálculo;
  **5.2 antecipado** no mesmo gatilho (parecer "reprovar" recusa; sem parecer/renegociar = aviso no formulário).
- 2.2 ✅ formulário: saem obra, captação digitada, riscos, concorrentes, localização, dados técnicos, financeiro
  (fica ticket mínimo) e cenários; entra "Do estudo e do empreendimento" (só leitura,
  `investorPortalService.lidoDoEstudo`). **Galeria e capa ficam até a 3.3** (sem elas a vitrine ficaria sem foto).
- 2.3 ✅ ficha: saem o painel morto, os controles deslizantes, o recálculo ao vivo (`useImovibMath`), o gráfico de
  concorrentes e a tabela `risks_json`; ficha técnica = seção Produto congelada; riscos/comparáveis/DD da versão
  na tela (`components/investor/portal/ListasDaVersao.tsx`, também no detalhe do portal).
- 2.4 ✅ `components/investor/InvestmentSimulator.tsx` reescrito (participação sobre a exposição, TMA como régua,
  some sem versão). Fora do escopo: `components/InvestmentSimulator.tsx` (aba "Simulador" do painel do investidor) é
  calculadora genérica em que o próprio investidor digita os valores — não apresenta número de oportunidade.
- 2.5 ✅ `utils/oportunidadeNumerosDaVersao.ts` → `naVitrine` (um ROI; sem reserva digitada; prazo, custo, local).
- 2.6 ✅ `fn_oportunidade_na_vitrine` (lista explícita) usada por `fn_investor_portal_get_opportunities` e
  `get_public_marketplace` (+ REVOKE PUBLIC). Contrato em `__tests__/investorPortalEstudo.test.ts`.
- 2.7 ✅ `aplicar_20271121961000_oportunidade_sem_campos_digitados.sql` (23 colunas + 4 tabelas; guardas param se
  houver dado). `target/current_funding_value` saem aqui (a captação real é a Fase 4). Bucket
  `due-diligence-findings` fica, vazio (pendência P1).
- §7/§8 pré-existentes corrigidos nos arquivos tocados (status vira texto colorido: `OPPORTUNITY_STATUS_TEXT`).
- Prova: tsc exit 0; 506 arquivos / 1.372 testes (áreas tocadas + varredura de migrations) verdes.

**Fase 3: 3 de 3 itens — NO AR** (PR #626, squash eaedc27). 970000 aplicada; Edge Function
`investor-portal-dataroom-download` publicada (sem token / token falso → recusado).
- 3.1 ✅ audiência `investidor` em `opura_document_portal_shares` (+ `opportunity_id`, FK CASCADE, índice único não
  parcial) em `aplicar_20271121970000_dataroom_pelo_ged.sql`; GED oferece "Oportunidade (investidor)" no modal de
  compartilhar; `documentService` (`AlvoDoPortal`) trata a audiência nova em todos os ternários.
- 3.2 ✅ `fn_investor_portal_get_dataroom` lê compartilhamentos + versão ativa (só doc da org da oportunidade); Edge
  Function assina em `opura-docs` com `caminhoSemTravessia`; `DataRoomPanel` reescrito (gestor: compartilhados,
  "Adicionar do empreendimento", "Tirar do Data Room"; upload fica no GED/aba Documentos).
- 3.3 ✅ sai `opportunity_documents` e `gallery_urls` (guardas); fotos e capa = imagens do empreendimento (decorado,
  plantas, vistas) na vitrine (SQL e app, `fotosDosEmpreendimentos`); capa escolhida entre elas no formulário.
  Os 4 objetos sem linha (sobras de 16/11) foram apagados com OK do usuário; os buckets vazios ficam (pendência P1).
- Antecipado na Fase 2 (PR #623): a integração antiga de `opportunity_documents` no GED saiu (lia
  `investor_opportunities.project_id`, apagada pela 961000).
- Prova: tsc exit 0; 543 arquivos / 1.489 testes (1.484 + 4 pendentes + 1 instável que passa isolado —
  `ImovibVersoes`, PDF sob carga).

**Fase 4: 3 de 3 itens + 5.1 — NO AR** (PR #627, squash 4d7e7dd). 980000 aplicada.
- 4.1 ✅ `investor_opportunities.spe_entity_id` (gatilho confere a org) em `aplicar_20271121980000_captacao_pela_spe.sql`;
  formulário escolhe a SPE; `SpeManager` grava a obra da SPE (campo que existia no banco e a tela nunca preenchia).
- 4.2 ✅ captação na vitrine: meta = Σ fontes `investidor`/`scp` da versão, senão a exposição máxima; chamado e
  integralizado = Σ dos sócios da SPE (`capital_paid` soma chamadas pagas e lançamentos). Regra única em
  `utils/oportunidadeCaptacao.ts` (espelho do SQL). Barra no cabeçalho da ficha e na linha do portal; o marketplace
  anônimo não recebe captação. Simulador: participação = aporte ÷ meta.
- 4.3 ✅ `opportunity_interests.investor_id` + `valor_pretendido`; a RPC do link grava o investidor do token e o valor
  (assinatura nova, a antiga sai); "Tornar sócio" no painel de interesses (`TornarSocioSheet`): investidor do link,
  senão o do mesmo e-mail, senão um novo cadastro; vira `spe_partners` com a participação informada.
- 5.1 ✅ aviso "versão publicada desatualizada" (`utils/imovibVersaoDesatualizada.ts`): aba Versões e ficha do gestor
  (VGV, VPL, TIR, capital máximo; tolerância R$ 1 / 0,01 p.p.).
- Fora do escopo, registrado: pagar uma chamada de capital ainda não gera aporte em `investor_contributions`
  (Fase 6, dois controles de dinheiro).
- Prova: tsc exit 0; 583 arquivos / 1.576 testes (áreas + travas + migrations) verdes, menos 1 instável
  (`ImovibVersoes`, PDF sob carga, passa isolado) e 4 pendentes.

**Fase 5: NO AR** — 5.1 entrou na Fase 4 (#627); 5.2 na Fase 2 (#623). **Fase 6:** achados aguardando decisão do
usuário (ver §Pendências).

### Pedido de 21/11/2026, 18h (sessão e7b82365), depois do relatório de pendências

> implemente todos

Decisões do usuário (mesma hora):
- **D6 VGV:** vale a regra da Análise de Vendas em todas as telas: VGV = vendido (valor negociado) + estoque a
  vender (disponível + reservado, preço de tabela); permutadas e não vendáveis ficam fora do VGV, mostradas à parte.
- **D7 Distrato:** a venda fica no mês original (bruto) e o distrato entra negativo no mês do cancelamento;
  líquido = bruto − distratos.
- **D8 Versão no portal:** só o Data Room do investidor fixa a versão compartilhada (o gestor vê que há versão nova
  e atualiza); cliente, colaborador e credor continuam vendo a mais nova.
- **D9:** migrations desta fase e a publicação de `portal-ged-download` autorizadas.

## Fase 7 — Pendências e achados da Fase 6 (pedido "implemente todos")

**Estado (21/11): 11 de 11 — NO AR** (PR #631, squash 87c3d41; `conferir-producao.sh` com "Levar ao Módulo Riscos" e "Importar do Market" ✅). CI: leves, pesados importados, tsc/travas/build verdes. Achado novo, fora do escopo: `__tests__/components/PainelVersoes.test.tsx` (Planta) falha sob carga pela mesma causa do 7.11 (tempo-limite padrão de 5 s). Migrations
990000–995000 APLICADAS (D9), cada uma provada em transação desfeita. Prova: tsc exit 0.

- 7.1 ✅ `aplicar_20271121990000` + `capitalCallService.registerPayment` pela RPC; painel sem `alert()`, avisa SPE sem
  obra. Prova: 400 + 600 → item pago, `capital_paid` 1000, chamada paga, 2 aportes 'liquidado' na obra ligados ao
  item; 3º pagamento recusado; SPE sem obra paga sem aporte.
- 7.2 ✅ `vgvDoEspelho` (lib/salesAnalysis.ts) no Espelho de Vendas: vendido negociado, estoque pela tabela,
  permutadas/não vendáveis/vendidas sem negociação à parte. Teste em `__tests__/salesAnalysis.test.ts`.
- 7.3 ✅ `aplicar_20271121994000` (gatilho guarda `cancelled_from_status` e garante `cancellation_date`);
  `foiDistrato`; Vendas por mês com barra negativa e "Líquido"; KPI Distratos = vendas desfeitas; velocidade líquida;
  `vendasPorMesDoEmpreendimento` com o estorno (o Acompanhamento acumula o líquido). Prova SQL: cancelada de CONTRATO
  guarda a etapa e a data; reaberta limpa.
- 7.4 ✅ `comparativoDoVgv` + quadro "VGV: estudo × espelho × vendido" no Acompanhamento (o realizado traz
  `espelho`).
- 7.5 ✅ `aplicar_20271121991000` (search_path + REVOKE PUBLIC; ACL sem `=X`); `portal-ged-download` v7 confere
  `document.organization_id = org do token`. Sonda: sem header 401, token falso 403. (Documento de outra org pelo link
  real não foi exercido: exigiria gravar token e compartilhamento de verdade.)
- 7.6 ✅ `aplicar_20271121993000` (`imovib_risks.project_risk_id`); `utils/imovibRiscoParaModuloRiscos.ts` +
  `imovibService.levarRiscoAoModulo`; botão no cartão de Riscos (desligado diz por quê). `fichaVazia` mudou para
  `utils/riskPainel.ts`. Prova SQL: a ficha gerada passa nas CHECKs de `project_risks` (RSC-0001, inerente 4×3=12).
- 7.7 ✅ `aplicar_20271121995000` (policy confere org do estudo de terreno e do anúncio); Market › Estudos salvos ›
  "Concorrentes" (`MarketConcorrentesSheet`: anúncios do raio ou nome/preço); comparáveis do Imovib ›
  "Importar do Market" (`ImovibImportarDoMarketSheet`, `utils/marketConcorrentes.ts`). Prova: como usuário
  autenticado, estudo da própria org grava; estudo de outra org → 42501. Lançamentos (`opura_market_developments`)
  entram se existirem, mas a tabela está vazia e ninguém grava nela (sem policy de escrita) — fica registrado.
- 7.8 ✅ comentários de `empreendimentoService` corrigidos (a torre tem FK; `empreendimentos.project_id` não).
- 7.9 ✅ `aplicar_20271121992000` (`version_id` só para investidor, gatilho fixa a ativa ao compartilhar, RPC lê a
  fixada); Data Room do gestor mostra "Há a versão N no GED" + "Atualizar para a versão atual". Prova: v2 no GED, o
  investidor segue na v1 até atualizar; versão de outro documento e versão fixa para cliente recusadas.
- 7.10 ✅ SPE de outra org → 23514 "A SPE escolhida é de outra organização."; marketplace como anon (slug de teste)
  devolve a oportunidade sem `captacao`, `spe_entity_id` e estudo.
- 7.11 ✅ o `it` do relatório tem 20 s próprios e o `waitFor` 15 s; reproduzido com `--testTimeout=400` (mesmo
  `STACK_TRACE_ERROR`), que passa depois da correção.

| # | Item | O que muda | Pronto quando |
|---|---|---|---|
| 7.1 | Chamada de capital vira aporte | RPC `fn_chamada_de_capital_registrar_pagamento` (uma transação: item, `capital_paid`, status da chamada e `investor_contributions` 'aporte' liquidado na obra da SPE, com `capital_call_item_id`). `capitalCallService.registerPayment` passa a chamá-la. SPE sem obra: paga, sem aporte, e a tela diz por quê. | Prova SQL em transação desfeita: 1 pagamento → item, sócio, chamada e 1 aporte; teste do serviço |
| 7.2 | VGV com uma regra (D6) | Espelho de Vendas do empreendimento usa a classificação de `lib/salesAnalysis.ts`: Vendido (valor negociado), Reservado, Disponível, Permutado e não vendáveis à parte, VGV total. | Teste: permutada e garagem fora do VGV; reservada no estoque; vendido = valor da negociação |
| 7.3 | Distrato estorna (D7) | `salesByMonth`/`vendasPorMesDoEmpreendimento` mantêm a venda distratada no mês original e lançam o distrato negativo no mês de `cancellation_date`; Vendas mostra bruto, distratos e líquido; Acompanhamento usa o líquido. | Teste: venda de março distratada em maio → março +V, maio −V |
| 7.4 | Estudo × espelho × vendido | Acompanhamento do estudo ganha o quadro VGV do estudo × VGV do espelho (tabela) × vendido (negociado). | Teste do cálculo; a tela mostra as três colunas |
| 7.5 | GED do portal do cliente | `fn_portal_get_ged_documents` com `search_path` e REVOKE PUBLIC; `portal-ged-download` confere a org do token. | ACL sem `=X`; function publicada recusa sem token e documento de outra org |
| 7.6 | Risco do estudo → Módulo Riscos | Botão "Levar ao Módulo Riscos" no cartão de Riscos quando o empreendimento tem obra (escopo obra; senão empreendimento); `imovib_risks.project_risk_id` impede levar duas vezes. | Teste do mapeamento; botão desligado diz por quê |
| 7.7 | Concorrentes do Market | Aba "Concorrentes" no Market (estudo de terreno: anúncio, lançamento ou nome/preço próprio); policy confere que o estudo é da org; comparáveis do Imovib ganham "Importar do Market" (concorrentes do estudo de terreno ligado + lançamentos da cidade). | Teste do mapeamento concorrente → comparável; policy provada |
| 7.8 | Comentário da FK | Comentários de `empreendimento_towers.project_id` dizem a verdade (a torre tem FK; `empreendimentos.project_id` não). | `git grep` sem o texto falso |
| 7.9 | Versão fixa no Data Room (D8) | `opura_document_portal_shares.version_id` (só audiência investidor); a RPC e a Edge Function do Data Room usam a versão fixada; gestor vê "versão nova" e "Atualizar". | Prova SQL: versão nova no GED não muda o que o investidor vê até atualizar |
| 7.10 | Provas sem dado (P3) | SPE de outra org e marketplace provados em transação desfeita com dado de teste. | Saída das provas no plano |
| 7.11 | Teste instável (P4) | `ImovibVersoes` › relatório: causa achada e corrigida. | 5 rodadas da suíte do arquivo junto com as vizinhas sem falha |

Fora desta fase, depende do usuário: P1 (apagar buckets pelo painel) e P2 (roteiro de tela no Garden: login pelo
usuário).

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

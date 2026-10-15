# Casa automática — Incorporação › Planta Inteligente

## Pedido original

> incorporacao < planta inteligente:
> faça um plano para implementar casa automatica. Pois o app tem todas as informações necessarias

> nao estou falando de automacao residencial. me referido tendo dados do terreno e mapa regularios, motores de terreno, arquitetonicos e estrutural, é possivel construir uma casa 100% completa. incluindo todos os modulos (hidraulico, eletricos, climatizacao,

Sessão f3b9bc19 · 14/10/2026. A segunda mensagem chegou assim, terminando em vírgula — transcrita como veio.

## Decisões tomadas com o usuário

| Data | Pergunta | Resposta |
|---|---|---|
| 14/10/2026 | Alcance da 1ª versão | Térrea primeiro; sobrado em fase seguinte (F12) |
| 14/10/2026 | Como se define o programa | Formulário curto (dormitórios, suítes, banheiros, vagas, área alvo) + padrão CUB R1-B/N/A; pré-preenche da unidade do Empreendimento quando vinculado |
| 14/10/2026 | Até onde vai o botão único | Tudo: arquitetura → estrutura → telhado → mobiliário → hidro → elétrica → climatização, num lote (um Ctrl+Z). PPCI não se aplica (A-1 unifamiliar dispensada) |
| 14/10/2026 | Esgoto | Hipótese do estudo "há rede pública" (padrão sim); sem rede → tanque séptico + filtro + sumidouro |
| 14/10/2026 | Plano | Aprovado ("pode seguir" a cada fase) |
| 15/10/2026 | O E6.2 fatia a faixa íntima com uma profundidade só (banheiro 0,80 × 5,75 m) — corrigir antes da F4? | **Corrigir agora, fase nova F3b** |
| 15/10/2026 | Na casa estreita, serviço, lavabo e às vezes a cozinha ficam sem parede externa — corrigir antes da F7? | **Corrigir agora, fase nova F6b** |

## Contexto

Inventário feito em `origin/main` (fbe8613f → e2a219c6, 14/10). **Quase tudo já existe como motor puro**, cada um com botão próprio:

- **Terreno/lei:** `utils/blueprintTerreno.ts` (`envelopeConstrutivo`), `utils/blueprintZonaUrbanistica.ts` (`ValoresDaZona`: recuos, TO, CA, permeabilidade, gabarito), `utils/blueprintMassa.ts:envelopeLegal`, frente do lote em `utils/blueprintAncorasHidro.ts` (`frenteDoLote`, `pontoNaFrente`).
- **Arquitetura:** gerador E6.2 `utils/blueprintGerador.ts:gerar` (l.518) + semente `programaSemente('CASA_TERREA')` em `utils/blueprintPrograma.ts`; `comandosDeAplicacao` (l.995) devolve 3 comandos de lote (`AddWalls`/`AddOpenings` por `wallUid`/`PlaceSpaceLabels`).
- **Estrutura:** `planejarPilares`/`planejarVigas`/`planejarLajes`/`planejarFundacoes`/`propostaDeEixos` — todos `(model, levelId, hip) → {comandos}` + `conferirPlanoDe*`.
- **Hidro:** `planejarAguaCompleta`, `planejarEsgotoCompleto`, `planejarPluvialCompleta`, `planejarTratamento`, `dimensionarReservacao` (só volume).
- **Elétrica:** `conferirTomadas`/`comandosParaCompletar`/`comandosDeIluminacao` (por ambiente), `centroDeCargas`→`comandosParaOCentro` (cria QDC), `planejarCircuitos`, `sugerirDRs`, `sugerirDPS`, `planejarEletrodutosDoModelo`.
- **Climatização:** `gerarClimatizacao` (exige catálogo de evaporadoras; sua etapa de circuitos só roda sem pontos soltos e com 1 quadro).
- **Molde de orquestrador:** `utils/blueprintGeradorPpci.ts:gerarPpci` e `gerarClimatizacao` — `aplicar()` via `applyBatch` na cópia, acumula `comandos` + `criados`, etapas com `SituacaoDaEtapa` (`LANCOU`/`NAO_EXIGIDA`/`NAO_RODOU`/`CALCULOU`), pendências por grupo, `conferirPlano*` reaplica no original e compara `diff.created`.
- **Conferência:** `utils/blueprintRegras.ts` (TO, CA, permeabilidade, iluminação 1/6, dimensões mínimas), `conferirPrograma`, `conflitosDoModelo`.
- **Hipóteses por estudo:** padrão `blueprint_study_hidro` (jsonb `hipoteses`) + `services/blueprintHidroService.ts` + `hooks/useBlueprintHidro.ts` (`completar()` só preserva chaves presentes no padrão).

**O que falta** (e é o que este plano faz): o orquestrador; o E6.2 só faz térreo, **preenche o envelope inteiro ignorando TO/CA/permeabilidade** (l.630-636) e avalia regras com zona vazia (l.915); ao aplicar, os automáticos simulados são descartados; não há telhado automático de 2 águas, caixa d'água/aquecedor/quadro/medidor automáticos, hipótese "rede pública", pontos de todos os ambientes num chamado, nem louça que lance pontos no "Aceitar" do mobiliário; dois critérios de classificação de ambiente (tipo na etiqueta × nome). PPCI não se aplica (A-1 unifamiliar dispensada no preset MG).

## Regras do projeto que valem aqui

- REGRA #8: `bash scripts/nova-frente.sh casa-automatica`; ler código só da frente; `git push origin HEAD:main` é o deploy; `conferir-producao.sh` depois.
- REGRA #6: primeiro commit = `docs/planos/2026-10-14-casa-automatica.md` com `## Pedido original` literal (os dois textos acima), tabela de decisões, fases com "pode seguir" — este arquivo é o rascunho dele.
- REGRA #1/#4: ler `docs/ui_ux_guia_unificado.md` e `UI_PATTERNS.md` antes da F10; `bash scripts/check-ui-standard.sh` em cada .tsx tocado.
- REGRA #7: migration da tabela nova com RLS `is_org_member` + REVOKE/GRANT; `__tests__/segurancaMigrations.test.ts`.
- Memórias: toda folga é hipótese editável; botão desabilitado diz o motivo; gerador em massa usa lote atômico; sem bump de kernel na v1 (se precisar: `node scripts/build-planta-api-kernel.mjs` + `supabase functions deploy planta-api` + `plantaApi.test`); tsc com heap alto e repetição; Vitest exit=1 com `success:true` = unhandled error.

## Arquitetura

### Motor puro `utils/blueprintCasaAutomatica.ts`

```ts
export function planejarCasa(original: BlueprintModel, entrada: EntradaDaCasa, hip: HipotesesDaCasa, cx: ContextoDaCasa): PlanoDaCasa
export function conferirPlanoDaCasa(original, plano): { ok: true } | { ok: false; motivo: string }
export function motivoParaNaoGerar(model, entrada): string | null  // lote fechado, FRENTE marcada, térreo sem parede, zona com TO
```

- `EntradaDaCasa`: `levelId`, `programa`, `envelope` (anel edificável), `terreno`, `limites` (divisas), `zona: ValoresDaZona|null`, `direcaoDaFrente`, `rotacaoNorteDeg`, `latitudeGraus`, `semente`.
- `ContextoDaCasa` (serializável, vai ao worker): hipóteses hidro/elétrica/circuitos/eletrodutos/clima, `modelos` do catálogo, estrutura (eixos/pilares/vigas/lajes/fundações), pontos, mobiliário, `topografia` crua (o `LeitorDoTerreno` é reconstruído dentro do motor — não é clonável).
- `PlanoDaCasa`: `comandos`, `criados`, `etapas: EtapaDaCasa[]`, `pendencias` (reusa `PendenciaDoPpci`/`GrupoDaPendencia`), `resultado`, `resumo` (área, TO/CA/permeabilidade vs zona, custo CUB, ambientes atendidos/pedidos).

**Ordem das etapas** (cada uma planeja sobre a cópia já com as anteriores; `tentar(id, fn)` converte recusa/exceção em `NAO_RODOU` + pendência, nunca aborta — só `ARQUITETURA` é fatal):

`IMPLANTACAO` (cálculo) → `ARQUITETURA` (`gerar(..., {automaticos:false})` + `comandosDeAplicacao`) → `EIXOS` → `PILARES` → `VIGAS` → `LAJES` → `FUNDACOES` → `TELHADO` → `ANCORAS` → `MOBILIARIO` → `LOUCAS` → `PONTOS_ELETRICOS` → `QUADRO` (+ medidor na frente) → `CIRCUITOS` → `CLIMATIZACAO` → `DR_DPS` → `ELETRODUTOS` → `AGUA` → `ESGOTO`|tratamento → `PLUVIAL` → `CONFERENCIA` (programa, regras com zona real, conflitos dos `criados`).

**Um `runBatch`:** a arquitetura vai nos 3 comandos de lote; as demais etapas emitem comandos unitários (`AddStructural`, `AddTerminal`, `AddTrecho`…), como `gerarPpci` já faz — a cauda do kernel roda uma vez por lote no editor. Nunca `AddWall` unitário em massa; nunca separar `AddWalls`/`AddOpenings` em dois lotes (casam por `wallUid`). `conferirPlanoDaCasa` é a trava antes de gravar.

**Onde roda:** `utils/blueprintCasaAutomatica.worker.ts` + `hooks/useCasaAutomatica.ts` no molde de `hooks/useGerador.ts` (progresso por etapa; sem `Worker` → fio principal).

### Hipóteses da casa (`HipotesesDaCasa`, salvas no estudo)

| Grupo | Hipóteses | Padrão |
|---|---|---|
| Programa curto | `dormitorios, suites, banheiros, vagas, areaAlvoM2 (null = pela lei), padraoCub R1-B/N/A` | 3/1/2/2/null/R1-N |
| Implantação | `folgaDaTOPct`, `encostarNaDivisa ESQ/DIR/CENTRO`, `proporcaoFrenteFundo`, `garagemCoberta`, `permeabilidadeMinPct (null = zona)` | 5 / ESQ / 0,7 / true / null |
| Gerador | `HipotesesDoGerador` existentes, `sementes: 1` | padrão atual |
| Telhado | `tipo DUAS_AGUAS/UMA_AGUA`, `inclinacaoPct`, `beiralMm`, `espessuraMm` | DUAS_AGUAS / 30 / 600 / 50 |
| Âncoras | `aguaQuente CHUVEIRO_ELETRICO/AQUECEDOR_PASSAGEM/NENHUM`, `caixaDaguaSobre BANHEIRO/AREA_DE_SERVICO`, `alturaDaCaixaAcimaDaLajeMm`, `caixaDeGordura` | por padrão CUB / BANHEIRO / 300 / true |
| Elétrica/clima | `areaPorLuminariaM2`, `chuveiroEletricoVA`, `climatizar` | null / 5500 / true |
| Esgoto | `haRedePublica` — mora em `HipotesesDeEsgoto` (tabela hidro) e **no `HIPOTESES_ESGOTO_PADRAO`** (senão `completar()` apaga) | true |

Persistência: tabela `blueprint_study_casa` (mesmo DDL de `blueprint_study_hidro`) + `services/blueprintCasaService.ts` + `hooks/useBlueprintCasa.ts` (cópia de `useBlueprintHidro`). Hipóteses de disciplina seguem nas tabelas delas; as de estrutura/circuitos/eletrodutos/pontos/mobiliário seguem em `usePersistedState` (limitação dita no plano) e o editor as passa em `cx`.

## Fases (cada uma termina com "pode seguir")

| Fase | O que muda | Pronto quando | Testes |
|---|---|---|---|
| **F0 portão** | frente `casa-automatica`; `docs/planos/2026-10-14-casa-automatica.md`; esqueleto `docs/spikes/casa-automatica/` (index.html, main.tsx, medir.mjs) | plano commitado; harness abre | — |
| **F1 programa paramétrico** | `utils/blueprintPrograma.ts`: `ProgramaCurtoDaCasa`, `programaDaCasa(c): Programa` (parte de `CASA_TERREA`: dorm = dormitórios − suítes; suíte/banho-suíte × suítes; banho social = banheiros − suítes; garagem = vagas × 12,5 m² + 5 ou removida; R1-B sem lavabo/varanda e áreas mínimas; R1-A + escritório e áreas máximas; `areaAlvoM2` escala áreas ideais), `programaCurtoDaUnidade(u: EmpreendimentoUnit)` (bedrooms/suites/bathrooms/parking_spaces/private_area; padrão por regex da `typology`, senão R1-N) | 3/1/2/2 R1-N → 2 dorm + 1 suíte + banho-suíte + banho social + garagem; `problemasDoPrograma` vazio; soma ≈ alvo | `__tests__/blueprintProgramaDaCasa.test.ts` (0 suíte, 2 suítes, 0 vagas, R1-B/N/A, alvo 90 m²) |
| **F2 implantação pela lei** | `implantacaoDaCasa(envelope, terreno, limites, zona, programa, hip) → {retangulo, areaAlvoM2, implantacaoMaxM2, motivo}`: `envelopeLegal` + `maiorRetanguloInscrito`, encolhe para `min(alvo, implantação×(1−folga))` mantendo proporção, ancora na frente e na divisa escolhida, respeita permeabilidade (projeção + vagas). `gerar` ganha `EntradaDoGerador.contextoDeRegras` (substitui `{}` na l.915); extrair montagem do `ContextoDeRegras` do editor (~l.5930) para `utils/blueprintContextoDeRegras.ts` | lote 12×30, TO 60 % → retângulo ≤ 216 m² − folga, no envelope, na frente; `sem-lote-to` CONFORME | `__tests__/blueprintCasaImplantacao.test.ts` + caso em `blueprintGerador.test.ts` |
| **F3 orquestrador mínimo** | `planejarCasa` com `IMPLANTACAO`, `ARQUITETURA`, `CONFERENCIA`; `conferirPlanoDaCasa`; `motivoParaNaoGerar`; worker + hook. Precondição "térreo sem paredes" (uid determinístico `gerador:${semente}:parede:k` colide) | `snapshotHash(applyBatch(original, comandos))` == `snapshotHash(resultado)`; `diff.created` == `criados`; divisas/lote preservados | `__tests__/blueprintCasaAutomatica.test.ts` (fixture `loteComZona()`: 4 `AddBoundary` TERRENO com FRENTE, zona TO 60/CA 1,2/perm 20/recuos 3000-1500-1500-3000) |
| **F4 estrutura** | etapas `EIXOS` (`propostaDeEixos(m, levelId, hip, {envelope:[retangulo]})`), `PILARES`, `VIGAS`, `LAJES`, `FUNDACOES`; `motivo`/`foraDoPlano` → nota/pendência | pilares nos cantos+nós, viga por cadeia, laje por ambiente, bloco+baldrame; `conferirPlanoDe*` ok em sequência | mesmo arquivo |
| **F5 telhado** | `utils/blueprintTelhadoAutomatico.ts:comandosDoTelhado(model, levelId, {retangulo, anexos, contorno}, hip)`: principal → `AddRoofByExtrusion` DUAS_AGUAS (eixo = mediana do lado maior + beiral, `perfilDeCobertura`), anexo → UMA_AGUA caindo para fora; validar com `aguasDaExtrusao` antes | L → 2 extrusões; águas com `beiralIndex`; `planejarCalhas` não acusa "sem beiral" | `__tests__/blueprintTelhadoAutomatico.test.ts` (retângulo, L, T) |
| **F6 âncoras + rede pública** | (a) `HipotesesDeEsgoto.haRedePublica` + padrão; `blueprintColetorPredial.ts` recusa com `MOTIVO_SEM_REDE`; `planejarEsgotoCompleto(..., tratamento?)` chama `dimensionarTratamento`+`planejarTratamento` no lugar do coletor; toggle na gaveta de esgoto. (b) `utils/blueprintAncorasDaCasa.ts:comandosDasAncoras`: caixa d'água `AddTerminal RESERVATORIO` (volume de `dimensionarReservacao`, sobre o banheiro, cota pé-direito+laje+altura — conferir campos em `AddTerminal`; se não aceitar, `AddTerminal`+`SetTerminalProps` no mesmo lote), aquecedor/chuveiro elétrico, caixa de gordura (ou pendência NAO_DECIDIDO se `planejarEsgoto` não a usa), `AddVaga` sugeridas | `haRedePublica:false` → sem `LIGACAO_ESGOTO`, com tanque+filtro+sumidouro; caixa existe antes da água e `dimensionarReservacao` ATENDE | `blueprintEsgotoCompleto.test.ts` (+2) + `blueprintAncorasDaCasa.test.ts` |
| **F7 mobiliário + louças com pontos** | `MOBILIARIO` (`mobiliarNivel`→`comandosDeMobiliario`) → `LOUCAS` (`pontosDasLoucasCriadas(..., {sugerida:true})` — parâmetro novo); fallback `planejarPontosDoAmbiente` só em ambiente com kit e zero terminal; `kitDoAmbiente` deduz tipo por `usoDoNome` quando a etiqueta não tem; corrigir o "Aceitar" do mobiliário no editor para lançar pontos | banheiro/cozinha/serviço com ponto por louça; nenhum duplicado < 600 mm do mesmo tipo | caso no orquestrador + `blueprintPontosHidraulicos.test.ts` |
| **F8 hidro encadeada** | `AGUA`, `ESGOTO`|tratamento, `PLUVIAL` com `presumido` → notas e `pendencias` → PREMISSA; editor pré-preenche `pluvial.cidade` com a da zona | hidrômetro, alimentador, rede, CI, coletor ou tratamento, ventilação, calhas+condutores+saída no mesmo lote | casos com/sem rede; sem cidade → `PLUVIAL NAO_RODOU` |
| **F9 elétrica + clima** | `utils/blueprintPontosEletricosDoNivel.ts:comandosDePontosDoNivel` (extraído de `gerar` l.905-920 e de `completarPelaNorma` l.3627; ambos passam a usá-lo) + `aplicarPotenciaPadrao`; `QUADRO` (`centroDeCargas`→`comandosParaOCentro`, medidor `pontoNaFrente`); `CIRCUITOS`; `CLIMATIZACAO` (`gerarClimatizacao` — etapas/pendências entram prefixadas; sem catálogo → `NAO_RODOU`); `DR_DPS`; `ELETRODUTOS` por último | todo ambiente com luz e `deficit === 0`; todo ponto com `circuitoId`; DR em banheiro/cozinha; com catálogo, split por sala/dormitório | casos com `modelos` cheio e vazio |
| **F10 UI** | `components/blueprint/TelaCasaAutomatica.tsx` (molde `TelaGerador`): formulário curto (pré-preenchido por `programaCurtoDaUnidade` quando o Empreendimento aponta para o estudo), hipóteses por seção, **Gerar prévia** (worker, progresso), etapas com situação/nota, pendências por grupo, resumo (área, TO/CA/perm vs zona, custo = área × CUB r1_*), **Lançar no pavimento** (desabilitado com motivo) e **Criar alternativa** (`createAlternative({model: plano.resultado})` — mantém o lote). `BlueprintEditor.tsx`: `telaAberta === 'casa'`, botão "Casa automática" em Analisar › Gerar (~l.12760), montagem de `entrada`/`cx`. Migration `blueprint_study_casa` + `types/blueprint.ts:BlueprintCasaRow` + service + hook | um clique gera, um lança, um Ctrl+Z desfaz tudo; motivo no botão; hipóteses sobrevivem a recarregar; `check-ui-standard` limpo | `__tests__/components/TelaCasaAutomatica.test.tsx`, `segurancaMigrations.test.ts` |
| **F11 saídas (prova)** | sem código previsto: quantitativos/orçamento (`PainelOrcamento`), DXF/IFC/pranchas (`blueprintExportService`), snapshot. Opcional "pode seguir": `services/sync/casaParaUnidadeAdapter.ts` (1 unidade) | quantitativos > 0 em concreto/aço/tubo/cabo; exportações sem erro | teste sobre `plano.resultado` + app |
| **F12 sobrado** (posterior, só descrição) | `hip.pavimentos: 2`: programa dividido (social/serviço/lavabo/garagem embaixo, íntimo em cima, hall com escada nos dois), 2º `AddLevel` + `AddEscada ateLevelId`, superior recuado se há afastamento progressivo; pilares alinhados por nível; telhado no superior; tubo de queda por `sugerirShaft`; 1 QDC; CA somando níveis (hoje `calcularAproveitamento` iguala TO e CA) | — | — |

Ordem: F0→F1→F2→F3 (já entrega "gerar casa dentro da lei") →F4→F5→F6→F7→F8→F9→F10→F11. F10 pode começar após F3.

## Riscos concretos

1. `gerar` com `automaticos:false` — as disciplinas rodam sobre o modelo real (ids da simulação em `emptyModel()` não valem).
2. Ids reproduzíveis por `seq`/prefixo: edição entre prévia e "Lançar" invalida → botão diz "o desenho mudou — gere de novo".
3. `PlaceSpaceLabels` nomeia pelo centro: ambiente não fechado fica sem nome e some de kit/carga/reservação → pendência `SEM_SOLUCAO`.
4. `completar()` do hook hidro apaga chave fora do padrão → `haRedePublica` no `HIPOTESES_ESGOTO_PADRAO`.
5. Climatização exige catálogo e TBS da cidade (`cx.carga.cidadeDoContexto = zona.cidade`); circuitos antes, eletrodutos depois.
6. `centroDeCargas` devolve null sem potência → `aplicarPotenciaPadrao` obrigatório.
7. TO pela projeção (`areaConstruidaM2` do gerador), não pela soma dos `Space` internos.
8. Worker: tudo em `cx` clonável; jsdom sem `Worker` → fallback.
9. Sem bump de kernel na v1; se `AddTerminal` não aceitar os campos da caixa, `AddTerminal`+`SetTerminalProps` no mesmo lote.
10. Hidro e eletrodutos são as etapas lentas → progresso por etapa no worker.

## Verificação ponta a ponta

- **Unitário** `__tests__/blueprintCasaAutomatica.test.ts`: fixture lote 12×30 + zona fictícia + programa 3Q R1-N; asserções: etapas `LANCOU`/`CALCULOU` (clima `NAO_RODOU` com motivo sem catálogo); `conferirPlanoDaCasa.ok`; hash igual; `toPct ≤ 60`; programa atendido; luz e tomadas por ambiente; `circuitoId` em todo terminal elétrico; conflitos bloqueantes = 0; `haRedePublica:false` → tratamento; gerar sobre o resultado → `motivoParaNaoGerar`.
- **Harness** `docs/spikes/casa-automatica/medir.mjs` (Playwright, molde `ambiente-um-clique`): expõe `window.__plano`, reprova (exit ≠ 0) se ambientes atendidos < pedidos, TO > zona, ambiente sem luz/tomada, circuitos = 0, conflito bloqueante > 0, `criados` ≠ `diff.created`; tira print.
- **App real** (skill `rodar-app`, só leitura): estudo com lote + zona → Analisar › Casa automática → Gerar prévia → conferir etapas, motivos dos botões, print; sem gravar.
- **Portões de sempre:** `npm run typecheck` (repetir se o Node 24 cair; ler `exit=` por grep), suíte JSON (checar `Errors`), `check-ui-standard.sh`, `verificar:build`, push `HEAD:main`, `conferir-producao.sh "Casa automática"`, check-run `ci` verde.

## Estado

- [x] F0 — frente `casa-automatica`, este plano, esqueleto do harness
- [x] F1 — programa paramétrico da casa (ver "Registro da F1" abaixo)
- [x] F2 — implantação pela lei + regras com zona no gerador (ver "Registro da F2" abaixo)
- [x] F3 — orquestrador mínimo (arquitetura num lote) (ver "Registro da F3" abaixo)
- [x] F3b — gerador respeita a largura mínima livre de cada ambiente (decisão de 15/10; ver "Registro da F3b")
- [x] F4 — estrutura (ver "Registro da F4")
- [x] F5 — telhado (ver "Registro da F5")
- [x] F6 — peças-âncora + rede pública (ver "Registro da F6")
- [x] F6b — cozinha, serviço e lavabo com parede externa na casa estreita (decisão de 15/10; ver "Registro da F6b" — cozinha resolvida, serviço/lavabo em parte)
- [x] F7 — mobiliário + louças com pontos (ver "Registro da F7")
- [x] F8 — hidro encadeada (ver "Registro da F8")
- [ ] F9 — elétrica + climatização
- [ ] F10 — UI
- [ ] F11 — saídas (prova)
- [ ] F12 — sobrado (posterior)

## Registro da F1 (14/10/2026)

O que entrou, em `utils/blueprintPrograma.ts` (só acréscimo; nada existente mudou):

- `ProgramaCurtoDaCasa` (`dormitorios` com as suítes, `suites`, `banheiros` com os das suítes,
  `vagas`, `garagemCoberta`, `areaAlvoM2`, `padrao` R1-B/N/A) e `PROGRAMA_CURTO_PADRAO` (3/1/2/2, R1-N).
- `HipotesesDoProgramaDaCasa` + `HIPOTESES_DO_PROGRAMA_DA_CASA_PADRAO`: fator de área por padrão
  (0,85 / 1 / 1,25 sobre a área ideal, preso entre a mínima e a máxima do item), 15 m² ideal e
  12,5 m² mínimo por vaga, útil/privativa 0,85, limites do formulário (6 dormitórios, 6 vagas).
- `normalizarProgramaCurto`: corrige o formulário e DIZ cada correção (suítes ≤ dormitórios;
  banheiros ≥ suítes + 1 social quando há dormitório simples ou nenhuma suíte).
- `programaDaCasa(curto, hip?) → { programa, curto, avisos }`: semente CASA_TERREA; R1-B sem varanda
  e sem lavabo; R1-A com escritório; garagem só com vagas cobertas; área alvo (útil, com circulação,
  SEM a garagem) fechada por iteração sobre os itens livres, e dita quando não fecha.
- `programaCurtoDaUnidade(unidade)`: lê bedrooms/suites/bathrooms/parking_spaces; padrão pela
  `typology` ("alto/luxo" → R1-A, "baixo/popular" → R1-B, senão R1-N); área alvo = privativa × 0,85 −
  garagem. Campo vazio fica com o padrão, e isso é dito.

Mudança em relação ao plano: `garagemCoberta` saiu das hipóteses de implantação e entrou no
formulário curto, porque decide se existe o item Garagem. `programaDaCasa` devolve
`{ programa, curto, avisos }` e não só o `Programa`: a tela precisa mostrar o que foi corrigido.

**Decisão medida: cada suíte é um item, não `quantidade`.** O gerador expande a quantidade em
cópias, mas a relação OBRIGATÓRIA suíte × banheiro se dá por satisfeita com UM par encostado.
Sonda no E6.2, lote 12 × 16 m, sementes 1–8:
- `quantidade: 2` (o jeito antigo): **6 de 8** sementes deixaram uma suíte sem banheiro encostado;
- um item por suíte: 2 suítes 8/8 (com e sem garagem); 3 suítes 7/8.
O caso que falhou (3 suítes, semente 2) é limite do gerador: no recozimento, a relação
obrigatória pesa como penalidade, não como trava. Fica para a CONFERENCIA da F3 acusar, com a
pendência dita.

Prova: `__tests__/blueprintProgramaDaCasa.test.ts`, 13 testes: 6 combinações do plano, a
correção do formulário, o determinismo, 2 suítes no gerador real e a unidade do Empreendimento.

## Registro da F2 (14/10/2026)

O que entrou:

- `utils/blueprintCasaAutomatica.ts` (arquivo novo, motor puro):
  - `implantacaoDaCasa(ctx: ContextoDaMassa, programa, {vagas, garagemCoberta}, hip?)`. Recebe o
    mesmo contexto do estudo de massa e devolve `{ok, implantacao}` ou `{ok:false, motivo}`.
    A projeção é a MENOR entre o programa, TO × lote × (1 − folga), CA × lote e o impermeável
    permitido (lote × (1 − perm. mín.) − pavimentação externa − vagas descobertas), presa ao maior
    retângulo do envelope dos recuos. O vencedor vai em `limitante` e é dito no aviso.
  - O retângulo encosta no recuo de frente e na divisa escolhida (convenção de `papeisSugeridos`:
    direita e esquerda de quem está na rua olhando para o lote) e fica na malha de 50 mm.
  - `quadroDaFrente` / `paraLocal` / `paraMundo`: a conta é feita no quadro da FRENTE. Lote girado
    funciona (testado a 30°) e `alinhadaAoDesenho` diz se o gerador pode receber o anel do mundo
    direto. Lote girado só chega ao desenho na F3, que gira os comandos.
  - `HIPOTESES_DA_IMPLANTACAO_PADRAO`: folga da TO 5 %, encostar à esquerda, proporção 0,7,
    pavimentação externa 10 % do lote, vaga descoberta 12,5 m², retângulo/útil 1,08, parede
    externa 200 mm, malha 50 mm.
- `utils/blueprintGerador.ts`: `EntradaDoGerador.contextoDeRegras` (lote + zona). A TO e o CA
  saem da área construída da própria planta, e a altura sai do pé-direito. Antes, as regras eram
  avaliadas com contexto vazio. `ResultadoDoGerador.regras` expõe o que foi avaliado.
- `utils/blueprintRegras.ts`: `loteParaRegras(terreno, limites)` e `zonaParaRegras(zona)`, uma
  conta só. O painel de Legislação do editor passou a usá-las (a testada era calculada inline).
- `BlueprintEditor.tsx`: o botão "Gerar" que já existia também passa a mandar o lote e a zona,
  então a nota das alternativas passa a contar TO e CA de verdade.

Medido (lote 12 × 30 m, recuos 3/1,5/1,5/3 m, programa 3Q R1-N):
- TO 60 %: 9,00 × 16,85 m, projeção 156,86 m², TO 43,6 %, permeável 46,4 %, limitada pelo programa.
  O gerador construiu exatamente 156,86 m² (136,64 m² úteis).
- TO 30 %: 8,30 × 11,85 m, projeção 102,43 m², TO 28,5 % (folga de 5 %), limitada pela TO, e o aviso
  diz que as áreas serão reduzidas.

Achado para a F3: nesse lote estreito (9 m de largura útil), o gerador deixa a ÁREA DE SERVIÇO
sem lado externo nas sementes 1, 2 e 3 ("exige ventilação e ficou sem lado externo"). A
CONFERENCIA deve acusar, e o orquestrador pode gerar algumas sementes e ficar com a de menos
avisos.

Prova: `__tests__/blueprintCasaImplantacao.test.ts`, 14 testes: caso base, TO apertada,
permeabilidade apertada, vagas descobertas, zona sem índices, sem frente/sem lote, encosto à
direita, frente ao norte, lote girado 30°, quadro exato, gerador com `sem-lote-to` e
`sem-lote-ca` CONFORMES, TO VIOLADA quando o retângulo é o envelope inteiro, e sem contexto
como antes. `BlueprintEditor.test.tsx` 254/254.

## Registro da F3 (14/10/2026)

O que entrou:

- Em `utils/blueprintCasaAutomatica.ts`:
  - `planejarCasa(original, entrada, hip?) → PlanoDaCasa` com as etapas IMPLANTACAO (calcula),
    ARQUITETURA (lança) e CONFERENCIA (calcula).
  - `conferirPlanoDaCasa(original, plano)`: a trava, que reaplica e compara os ids criados e o
    hash. `motivoParaNaoGerar(model, levelId)`: pavimento existe e está sem paredes.
  - `comandosNoMundo`: os três comandos de lote do E6.2 levados do quadro da frente ao mundo.
  - `HIPOTESES_DA_CASA_PADRAO`: programa, implantação, gerador e sementes 1–8. A parede externa
    e a malha da implantação vêm das hipóteses do gerador (uma fonte).
  - Molde de `gerarPpci`: a cópia de trabalho acumula comandos e `criados`. Só a ARQUITETURA é
    fatal; o que falta vira motivo e pendência, nunca exceção. Tipos de situação e pendência
    reusados do PPCI.
- A planta é gerada no QUADRO DA FRENTE (rua ao sul, norte recalculado no quadro). Com a frente num
  eixo do desenho, a transformação é exata. Girada, a ponta que encontra o meio de outra parede
  passa `ALEM_MM` (3 mm) além, e o offset das aberturas anda junto (técnica da M6b).
  Sonda 14/10, 12 ambientes gerados:

  | Giro | Com `ALEM_MM` | Sem |
  |---|---|---|
  | 17° | 12 | 4 |
  | 30° | 12 | 1 |
  | 45° | 12 | 8 |

  Teste de fidelidade: lote a 30° com o norte girado junto dá a MESMA planta do lote reto
  (paredes, aberturas, nomes; áreas a menos de 0,05 m²).
- **Defeito do motor de regras corrigido (vale para qualquer desenho fora de eixo, não só para a
  casa):**
  - `aberturasDoAmbiente` e `larguraMinimaMm` casavam parede e lado do ambiente por colinearidade
    EXATA. Girado, nenhum vértice cai exatamente na reta: o ambiente ficava sem janela
    (`area_janelas = 0`, "Iluminação 1/6" violada em falso) e sem recuo de face.
  - Agora o casamento é por distância à reta (`paredeContemLado`, 5 mm, a tolerância de snap do
    arranjo: o vértice fica na ponta esticada, 3 mm fora). A largura é medida no quadro do lado
    mais longo; alinhado aos eixos, a conta é a mesma de antes.
  - Teste em `blueprintRegras.test.ts`. Com a tolerância zerada (o comportamento antigo), ele
    falha com `area_janelas` 0.
- Escolha da semente: menos problemas graves (avisos do E6.2 + regras de AMBIENTE com severidade
  ERRO violadas); empate → maior nota; empate → menor semente.

Mudança em relação ao plano: o worker e o hook (`useCasaAutomatica`) ficaram para a F10, quando há
tela que os consome. Hoje não teriam quem os chamasse. As 8 sementes rodam em cerca de 150 ms no
teste.

**Achado que pede decisão: o gerador E6.2 fatia a faixa íntima com UMA profundidade só.**
Banheiro de 0,80 × 5,75 m e dormitório de 2,15 m de largura no lote de 9 m. Em todas as 8
sementes e nos 3 formatos medidos (9 × 16,85; 10,5 × 14,5; 12 × 12,7 m), a melhor planta viola
**pelo menos 5 regras de AMBIENTE** (largura mínima de banheiro e dormitório, área do lavabo,
iluminação da sala). O gerador não usa a `larguraMinMm` do item ao fatiar. A F3 escolhe a menos
pior e lista cada violação como pendência, mas não corrige. A correção é no gerador (mexe no E6.2,
que o "Gerar" do editor também usa).

Portão do harness (`docs/spikes/casa-automatica/medir.mjs`, lote reto e a 30°): etapas certas, 11
de 11 ambientes atendidos, 12 nomeados (nenhum fundido), aberturas criadas = pedidas, TO 43,6 %,
nenhuma regra de lote violada, trava aprovando. As pendências do lote girado são as mesmas do
lote reto. Prova: `__tests__/blueprintCasaAutomatica.test.ts`, 15 testes.

## Registro da F3b (15/10/2026)

Pedido: *"Corrigir agora, nova fase F3b"* (resposta à pergunta de 15/10 sobre o fatiamento do E6.2).
Critério combinado: zero regra de largura/área mínima violada nos 3 formatos medidos, para o
programa de referência (3 quartos, R1-N).

O que mudou em `utils/blueprintGerador.ts`. Vale também para o botão "Gerar" do editor e para a
planta das unidades do estudo de massa, que usam o mesmo gerador:

- `HipotesesDoGerador.minimosPorTipo`: largura livre e área útil mínimas por tipo NBR 5410, com os
  valores das regras semente (banheiro 1,20 m / 2,5 m²; cozinha/serviço 1,50 m / 4 m²;
  sala/dormitório 2,40 m / 8 m²). `iluminacaoMinima`: 1/6 e 1/8. O mínimo no EIXO é a largura livre
  mais uma parede externa (conservador). A área alvo nunca fica abaixo da área útil do tipo, convertida
  para o eixo.
- **Fundo em colunas** (`colunasDoFundo`), no lugar do treemap de uma linha:
  - cada íntimo é uma coluna encostada no corredor, nunca abaixo do seu mínimo;
  - o banheiro com relação OBRIGATÓRIA EMPILHA atrás do par quando os dois mínimos cabem na
    profundidade; senão, vira coluna logo ao lado;
  - o banheiro sem par transborda para a última linha da frente, que encosta no corredor;
  - a sobra de largura é repartida pela área.
- **Treemap da frente**: linha que deixa alguém abaixo do mínimo vale infinito (inclusive a de um
  item só; antes, o lavabo virava tira de 9,00 × 0,40 m). Dentro de cada linha, cada item recebe
  primeiro o seu mínimo e a sobra vai pela área (antes, lavabo de 0,95 m na última linha).
- A função objetivo usa o mesmo mínimo no eixo.
- **Janela pela norma**: largura para 1/6 (habitável) ou 1/8 (banheiro, cozinha/serviço) do piso
  útil, acima do teto estético de 2,0 m quando preciso. Se não cabe ao lado da porta, desce de
  250 em 250 mm até 0,60 m. Antes, desistir da janela deixava a sala SEM janela; foi uma regressão
  minha, achada na F3b e corrigida aqui.
- A ponte uso → tipo é `TIPO_NBR5410_DO_USO` do kernel. `dc4eb3a2` (o USO do ambiente no kernel, de
  14/10) tirou o `FICHA_DO_USO` do gerador.

Medido: menor número de regras de AMBIENTE (ERRO) violadas, na melhor de 8 sementes:

| Programa | 9 × 16,85 | 10,5 × 14,5 | 12 × 12,7 |
|---|---|---|---|
| 3 quartos (R1-N) | 5 → **0** | 5 → **0** | 5 → **0** |
| 2 quartos | 3 → **0** | 4 → **0** | 3 → **0** |
| 4 quartos (2 suítes) | 9 → 4 | 9 → 2 | 8 → **0** |
| Apartamentos 2Q e 3Q | 0 | 0 | 0 |

Pelo orquestrador, nos lotes 12 × 30, 15 × 25, 10 × 30 (2 quartos) e 15 × 30 (4 quartos):
**0 regras violadas** em todos.

O que fica em aberto (dito, não escondido):
- **4 quartos em casa de 9–10,5 m de largura**: quatro dormitórios legais não cabem lado a lado. Pede
  uma 2ª fileira de quartos ou um corredor longitudinal. Fica como pendência futura do gerador.
- **Ventilação** de área de serviço ou lavabo sem parede externa (AVISO), na semente escolhida de
  alguns lotes. O orquestrador já a conta como problema grave na escolha.
- Relação obrigatória sem porta direta em alguns lotes: cozinha × serviço, varanda × sala. Vira
  pendência SEM_SOLUCAO.
- Um teste do apartamento esperava a janela de banheiro com exatamente 0,60 m. Passou a esperar
  "≥ 0,60 m": o 0,60 × 0,60 fixo violava a regra de 1/8 num banheiro de 4 m².

Provas:
- `__tests__/blueprintGerador.test.ts`, describe "F3b":
  - 3 formatos: a melhor semente sem violação, e nenhum banheiro mais estreito que o mínimo em
    semente nenhuma;
  - empilhar × coluna ao lado;
  - a sala nunca fica sem janela.
- Os 15 arquivos que dependem do gerador ou das regras: 110 testes.
- Harness: o portão ganhou "nenhuma regra ERRO violada", que passa com o lote reto e a 30°.
- `BlueprintEditor.test.tsx` isolado: 254/254 em 187,8 s, contra 187,6 s com as regras da F2 (mesmo
  tempo). Na suíte cheia, esse arquivo fica "still running" quando o relatório é escrito (206
  pendentes). Isolado passa inteiro, e a queda de worker aconteceu também com o código da F2.

## Registro da F4 (15/10/2026)

O que entrou em `utils/blueprintCasaAutomatica.ts`:

- Etapas PILARES → VIGAS → LAJES → FUNDACOES → EIXOS, entre ARQUITETURA e CONFERENCIA. Cada uma
  chama o lançamento automático que a gaveta Estrutural já usa (`planejarPilares`, `planejarVigas`,
  `planejarLajes`, `planejarFundacoes`, `propostaDeEixos`) sobre a cópia com a anterior aplicada.
  Tudo vai no mesmo lote, com um Ctrl+Z.
- `HipotesesDaEstruturaDaCasa` (`lancar` + as hipóteses de cada gaveta, padrões de lá) em
  `HipotesesDaCasa.estrutura`. `lancar: false` deixa as cinco etapas NAO_EXIGIDA.
- `ROTULO_DA_ETAPA_DA_CASA` é a ordem e o rótulo de cada etapa, uma fonte para a tela e o
  relatório. `resumo.estrutura` traz as contagens.
- Recusa, exceção ou "fora do plano" vira nota na etapa e pendência; nada aborta.

**Decisão medida: os EIXOS vêm depois dos pilares, não antes.** `planejarPilares` põe pilar em todo
cruzamento de eixos, "com ou sem parede ali" (a malha do calculista manda). Com os eixos
automáticos, um por linha de parede, lançados antes, a sonda de 15/10 (casa de 157 m²) deu:
- **ordem antiga:** 52 pilares (49 em cruzamento de eixo), **2 dentro de ambiente, longe de
  parede**, e 26 recusados por colidir;
- **ordem nova:** 32 pilares, todos sobre parede, sem conflito.

Os eixos passam a documentar a estrutura lançada. No lote girado eles não rodam: as paredes são
oblíquas ao desenho, e a etapa diz isso (NADA_A_FAZER com a nota).

Medido no lote 12 × 30 (reto e a 30°): 32 pilares, 15 vigas, 12 lajes (uma por ambiente), 32
blocos, 32 estacas, 15 baldrames, e 14 eixos no lote reto. São ~230 comandos num lote só, e a trava
aprova (ids e hash).

Achado de método: a primeira sonda dos "pilares fora de parede" lia `model.structurals`, e o campo
é `structures`. A lista vazia deu "0 fora" por construção. Refeita com o campo certo antes de
qualquer afirmação.

Observação estética (não bloqueia): paredes paralelas próximas dão eixos próximos, e as bolhas de
C, D, E e F se sobrepõem no print. Fica para o acabamento da prancha.

Provas:
- `__tests__/blueprintCasaAutomatica.test.ts`: 20 testes. Lote reto e girado com todo pilar sobre
  parede, bloco e estaca por pilar, laje por ambiente e nenhuma pendência de estrutura; eixos
  depois; eixos que não rodam no girado com o motivo; estrutura desligada.
- Harness: o portão confere a estrutura, e aprova a 0° e a 30°.
- 19 arquivos dependentes, 178 testes; typecheck limpo.
- Suíte cheia: 0 falhas. Os 213 pendentes são do `BlueprintEditor.test.tsx`, que não termina sob
  carga. Isolado, em 7 rodadas: 2× 254/254, 4 quedas de worker e 1× "1 failed" que não se repetiu.
  Nenhum arquivo do app importa `blueprintCasaAutomatica`, então a F4 não alcança esse teste: é a
  instabilidade conhecida.

## Registro da F5 (15/10/2026)

O que entrou:

- `utils/blueprintTelhadoAutomatico.ts` (novo, puro): `comandosDoTelhado(levelId, ret, quadro,
  alturaDoTopoMm, meiaParedeExternaMm, hip)` devolve UM `AddRoofByExtrusion`. Não há geometria nova:
  o kernel faz as águas (P2.13), e cada água sai com o beiral no lado baixo.
  - A cobertura avança meia parede mais o beiral além do EIXO das paredes externas, nos quatro lados.
  - DUAS ÁGUAS: cumeeira ao longo do lado maior, ou como as hipóteses mandarem.
  - UMA ÁGUA: eixo paralelo à frente, caindo para os FUNDOS (padrão) ou para a frente.
  - Alturas: topo da parede (pé-direito + laje lançada) na face; a ponta do beiral desce
    beiral × inclinação; a cumeeira sobe meio vão × inclinação.
  - O eixo vai ao mundo pelo quadro da frente (lote girado funciona).
  - Antes de devolver, o perfil passa por `aguasDaExtrusao`: recusa vira motivo.
- `HIPOTESES_DO_TELHADO_PADRAO`: duas águas, 30 %, beiral de 0,60 m, 50 mm, cumeeira ao longo do
  maior, uma água caindo para os fundos, `lancar: true`. Ficam em `HipotesesDaCasa.telhado`.
- No orquestrador: etapa TELHADO depois dos EIXOS; `resumo.telhado`. Anexo da planta sem cobertura
  vira pendência NAO_DECIDIDO (com a implantação retangular, hoje não há anexos).

Confirmado na prática: o `AddRoofByExtrusion` dá à água um `uid` aleatório (`novoUid()`), e a trava
(`conferirPlanoDaCasa`: mesmos ids e mesmo hash) aprova com o telhado no lote. O `uid` está fora do
hash, como a memória do kernel registrava.

Critério de pronto ("`planejarCalhas` não acusa sem beiral"): no lote reto e a 30°,
`planejarCalhas(resultado, intensidade 150 mm/h)` volta com `motivo: null` e 2 calhas.

Medido (casa 9,00 × 16,85 m): beiral a 2,72 m e cumeeira a 4,28 m (topo 2,90 m, 30 %), projeção de
189,8 m², cumeeira de 18,25 m da frente para os fundos.

Provas:
- `__tests__/blueprintTelhadoAutomatico.test.ts`, 5 testes: geometria e alturas da casa funda; a casa
  larga vira a cumeeira; uma água para os fundos e para a frente; quadro girado com a mesma área;
  recusas.
- `blueprintCasaAutomatica.test.ts`, 23 testes: telhado no lote reto e a 30°, cobrindo toda parede,
  com calha pela pluvial; telhado desligado.
- Harness: o portão confere 2 águas, paredes cobertas e calhas. 25 arquivos dependentes, 168 testes.
- Suíte cheia: 0 falhas; 198 pendentes do `BlueprintEditor.test.tsx`, que não termina sob carga.
  Nenhum arquivo do app importa os módulos da casa.

## Registro da F6 (15/10/2026)

**Parte (a), rede pública × tratamento: já existia.** A frente `dee77095` (14/10, "destino do esgoto")
pôs `HipotesesDeEsgoto.destino` (ausente = rede pública) e o `planejarEsgotoCompleto` com caixa →
tanque → filtro → sumidouro. Reusei sem reimplementar. A casa a usa na F8 pelas premissas hidro do
estudo, que agora entram na entrada (`EntradaDaCasa.hidro`, ausente = `HIPOTESES_HIDRO_PADRAO`).

**Parte (b), as peças-âncora:** `utils/blueprintAncorasDaCasa.ts` (novo, puro): `comandosDasAncoras`.
Tudo nasce `sugerida`, e o que já está desenhado fica.
- **Caixa d'água:** `RESERVATORIO` SUPERIOR de água fria sobre o banheiro (ou serviço ou cozinha) mais
  perto do meio da casa, a 0,30 m acima da laje. Volume por `dimensionarReservacao` com as premissas do
  estudo. Testado: 2 dias de reserva dão caixa maior.
- **Água quente por padrão:**
  - R1-N e R1-A: aquecedor de passagem. São dois terminais no mesmo ponto (fria = consumo, quente =
    origem; convenção da fixture `sobradoHidro`), na parede externa da área de serviço. Sem ela, vai na
    da cozinha, com pendência "confira a ventilação (NBR 13103)".
  - R1-B: chuveiro elétrico. Não há aquecedor; a TUE fica para a F9.
- **Caixa de gordura:** do lado de fora da parede externa da cozinha, dentro do lote, na cota da ficha.
  Se a cozinha não tem parede externa, vai do lado de fora da parede externa mais perto dela. Fora do
  lote, não põe e diz.
- **Vagas:** em grade, sempre com o comprimento da rua para dentro (lado a lado e em fila). A vaga
  paralela à rua cabia num recuo de 2,90 m, mas o carro não entra assim. Saem na garagem, ou no recuo de
  frente quando são descobertas.
- No orquestrador: etapa ANCORAS depois do TELHADO; `resumo.ancoras`; `HipotesesDaCasa.ancoras`.

**O gerador precisou mudar para as vagas caberem.** A garagem "de 2 vagas" saía com 4,40 m livres (só
uma vaga), ou rasa: 7,10 × 3,85 m, e a vaga é 2,50 × 5,00 m.
- Programa (`programaDaCasa`): o menor lado da garagem passa a ser min(vagas × 2,50 m, 5,00 m)
  (`larguraPorVagaMm`, `comprimentoDaVagaMm`).
- Gerador, garagem num canto da frente, em retângulo próprio, fora do treemap: vagas lado a lado
  quando sobram ≥ 5 m ao lado; EM FILA no lote estreito, porque lado a lado deixava 3,2 m para sala,
  cozinha e serviço e 3 regras violadas. Se nenhuma das duas cabe, a garagem volta ao treemap.
  `HipotesesDoGerador.areaPorVagaM2` = 15 conta as vagas pela área.
- Gerador, a frente em DUAS LINHAS quando sobra fundo atrás da garagem: na rua, a garagem e os
  pequenos sociais (varanda, lavabo); atrás, sala, cozinha e serviço na largura toda, com as duas
  fachadas laterais. Comparado em 8 lotes contra a garagem na profundidade toda (regras / aquecedor sem
  lugar / cômodos sem parede externa / cozinha sem janela):

  | Variante | Regras | Aquecedor sem lugar | Sem parede externa | Cozinha sem janela |
  |---|---|---|---|---|
  | Garagem na profundidade toda | 2 | 3 | 12 | 3 |
  | Duas linhas (a escolhida) | 3 | 2 | 9 | 2 |

  Também comparada e descartada: dar só o fundo atrás da garagem ao serviço. Empatou (3 × 2 regras,
  2 × 3 aquecedores).
- Gerador, `piorDe` passou a avaliar a linha com a MESMA repartição do desenho (mínimo primeiro, sobra
  pela área). Avaliar só pela área julgava inviável uma linha viável, e o serviço ia sozinho para uma
  tira de 1,30 m. A linha também não recusa um item se o que SOBRA ficar raso demais.
- Gerador, penalidade para quem só exige ventilação ficar sem lado externo (serviço, lavabo, banheiro).

Medido depois de tudo: melhor de 8 sementes, regras de ambiente violadas.
- 3 quartos, 2 quartos, apartamentos e a semente "Casa térrea": **0 nos 3 formatos**.
- 4 quartos: 6 / 3 / 0.
- No orquestrador, lote 12 × 30: 2 de 2 vagas em fila dentro da garagem, caixa d'água de 1.500 L,
  caixa de gordura.

**O que fica em aberto (dito):**
- O fatiamento em faixas ainda põe serviço, lavabo e às vezes a cozinha no miolo, sem parede externa,
  na casa estreita. No lote 12 × 30, a cozinha sem janela também deixa o aquecedor sem lugar
  (pendência). É limite do layout do E6.2, não das âncoras. Proposto como fase própria do gerador.
- Recuo de frente de 3 m não comporta vaga descoberta (5 m): vira pendência.

Provas:
- `__tests__/blueprintAncorasDaCasa.test.ts`, 7 testes: caixa sobre o banheiro com a cota e o volume;
  aquecedor com 2 terminais na parede externa; chuveiro elétrico no R1-B; caixa de gordura fora e
  dentro do lote; não duplica; vagas no recuo fundo e no raso.
- `blueprintCasaAutomatica.test.ts`: lote reto e a 30° com caixa sobre banheiro, caixa de gordura
  fora e as 2 vagas na garagem; âncoras desligadas; premissas hidro do estudo.
- Harness: o portão confere caixa, caixa de gordura e vagas dentro da garagem.
- 33 arquivos dependentes, 219 testes; typecheck limpo.

## Registro da F6b (15/10/2026)

Pedido: *"Corrigir o layout agora (nova fase F6b)"* (cozinha, serviço e lavabo sem parede externa na casa
estreita).

**Diagnóstico.** Com a garagem em fila tomando a lateral esquerda, o resto da frente só tem a rua e UMA
lateral como fachada. O treemap empilha LINHAS paralelas à rua, e em cada linha só o último cômodo toca
a lateral.

O que mudou em `utils/blueprintGerador.ts`:
- **Frente em linhas OU em colunas** (`Plano.frenteEmColunas`). Em colunas, todos os cômodos da coluna
  encostada na lateral têm fachada. Sementes pares partem de colunas, ímpares de linhas, e o
  recozimento pode trocar (`fatiar`: o mesmo treemap com os eixos trocados). Vale ao lado da garagem,
  na linha de trás e na faixa sem garagem.
- **Pesos da função objetivo na ordem da lei.** Sem lado externo, quem exige ILUMINAÇÃO (dormitório,
  cozinha) passou de 6 para 15, acima da PREFERÊNCIA de a sala dar para a rua (12). Antes, o
  recozimento preferia uma cozinha sem janela a tirar a sala da frente. A falta de ventilação ficou em
  5: com 10, a cozinha voltou a ficar sem janela num lote e o apartamento voltou a violar
  (medido e descartado).
- **Janela em mais de um lado** quando a do melhor lado não cobre a fração exigida.
- **A porta de entrada vai para a ponta da fachada.** No meio, ela partia a fachada da sala em dois
  trechos curtos e a janela de 1/6 não cabia (sala de 33 m² do apartamento com 2 m² de janela).

Medido em 8 lotes do orquestrador (12 × 30 reto e a 30°, 15 × 25, 12 × 30 com 1 e 3 vagas, 15 × 30
R1-B, 10 × 30 2Q, 14 × 28 R1-A):

| | Regras | Aquecedor sem lugar | Sem parede externa | Cozinha sem janela |
|---|---|---|---|---|
| F6 | 3 | 2 | 9 | 2 |
| **F6b** | 3 | **0** | **6** | **0** |

Por formato (melhor de 8 sementes): 3 quartos, 2 quartos, apartamentos 2Q e 3Q e a semente: **0 nos
3 formatos**. 4 quartos: 6 / 2 / 0.

**O que fica em aberto (dito):**
- No lote de referência 12 × 30, **área de serviço e lavabo** ainda no miolo (sem ventilação natural).
  A geometria (casa de 9 m, garagem em fila) não dá fachada a todos. Lavabo admite exaustão mecânica;
  a área de serviço sai como pendência SEM_SOLUCAO.
- R1-B 15 × 30: área de serviço com 1,40 m (pede 1,50) e dormitório com 2,33 m (pede 2,40). As áreas
  a 85 % deixam os cômodos no limite.
- R1-A 14 × 28: escritório sem janela.
- **Observação do kernel (não é da F6b):** com a estrutura lançada, o pilar no encontro de paredes
  ("cede sobreposição") pode criar um micro-ambiente (0,001 m²; a laje o pula: "ambiente com menos de
  0,5 m²"). Sem a estrutura, 9 lotes medidos sem lasca, sem parede oblíqua e sem parede fora da malha.

Provas:
- `blueprintCasaAutomatica.test.ts`: lote reto e a 30° com a cozinha com parede externa, o aquecedor
  lançado e 0 regras. Com o gerador anterior, falha nos dois.
- `blueprintGerador.test.ts`: apartamento 3 quartos com 0 nos 3 formatos.
- Harness: o portão confere a cozinha com fachada e o aquecedor.

## Registro da F7 (15/10/2026)

O que já existia no `main` e foi reusado:
- `kitDoAmbiente` já lê o USO gravado na etiqueta (kernel 0.102, de 14/10), e o gerador já grava o
  `uso` em `PlaceSpaceLabels`. A divergência "tipo × nome" do plano estava em boa parte resolvida.
- `pontosDasLoucasCriadas` já lança água, esgoto e o ponto elétrico de cada louça criada.

O que mudou:
- `utils/blueprintPontosHidraulicos.ts`: `pontosDaLouca` e `pontosDasLoucasCriadas` ganham
  `opcoes.sugerida`. A louça posta à mão continua lançando pontos "decididos".
- `utils/blueprintMobiliario.ts`:
  - `mobiliarDoAmbiente` usa o `uso` da etiqueta antes do nome, o mesmo critério do kit hidráulico.
  - `comandosDeMobiliarioComPontos(lista, levelId, model)`: as peças e os pontos das louças criadas,
    num lote só.
- **`BlueprintEditor.tsx`: o "Aceitar" do mobiliário passa a lançar os pontos das louças** (defeito
  levantado no planejamento: a louça aceita ficava sem ponto, e água e esgoto automáticos não a viam).
  É um lote só, com um Ctrl+Z.
- No orquestrador: etapas MOBILIARIO → LOUCAS → PONTOS_HIDRAULICOS depois das âncoras. O planejador
  por ambiente completa o kit sem duplicar (pula tipo × disciplina que já existe): entram a caixa
  sifonada do banheiro e o ralo do serviço. Tudo `sugerida`. Sem aquecedor (chuveiro elétrico ou
  nenhum), nenhum ponto de água quente. `HipotesesDaCasa.mobiliario` (com `lancar`) e `.pontos`;
  `resumo.mobiliario`.

Medido no lote 12 × 30 (reto e a 30°): 23 e 19 peças de mobiliário, 21 pontos de louça e 8 de kit.
- Banheiros: vaso (AF, ESG), lavatório (AF, AQ, ESG), chuveiro (AF, AQ), caixa sifonada (ESG).
- Cozinha: pia (AF, AQ, ESG). Serviço: tanque, máquina e ralo.
- Nenhum tipo × disciplina repetido no mesmo ambiente; trava aprovando.
- R1-B: nenhum ponto de água quente.

**Fica em aberto (dito):** o mobiliário automático às vezes não acha lugar para uma peça, por exemplo
o vaso e o lavatório no banheiro de suíte longo e estreito, ou o armário de um dormitório. Os PONTOS
desse ambiente saem completos (o kit preenche o que a louça não lançou), mas a peça não aparece
desenhada e vira pendência VERIFICACAO "Mobiliário: …".

Provas:
- `blueprintMobiliario.test.ts`: aceitar um banheiro lança água e esgoto sugeridos, sem duplicar ao
  aceitar de novo; o uso da etiqueta vale antes do nome ("Cômodo 7" com uso BANHEIRO).
- `blueprintCasaAutomatica.test.ts`: kit completo por ambiente molhado, a 0° e a 30°, sem duplicata e
  tudo sugerido; R1-B sem água quente.
- Harness: o portão confere o kit completo dos 4 ambientes molhados e o mobiliário.
- `check-ui-standard` no `BlueprintEditor.tsx` sem violações; 23 arquivos dependentes, 186 testes;
  typecheck limpo.

## Registro da F8 (15/10/2026)

O que mudou, só em `utils/blueprintCasaAutomatica.ts`. Os três planejadores já existiam e foram reusados
sem mudança:
- Etapas AGUA → ESGOTO → PLUVIAL, depois dos pontos hidráulicos e antes da CONFERENCIA. São os
  "Lançar tudo" das gavetas (`planejarAguaCompleta`, `planejarEsgotoCompleto`,
  `planejarPluvialCompleta`), com as premissas do ESTUDO (`EntradaDaCasa.hidro`, as mesmas da gaveta).
- O que cada planejador PRESUMIU vira pendência CONFERIR; o que faltou vira PREMISSA. Exemplos de
  presunção: a cota estimada da rede, o hidrômetro no cavalete, a saída pluvial na frente. Exemplo de
  falta: a intensidade de chuva.
- Sem comandos e com pendência, a etapa fica NAO_RODOU com o motivo.
- Esgoto pelo destino do estudo (`hidro.esgoto.destino`):
  - REDE_PUBLICA: caixa de inspeção, ramais, coletor e ligação.
  - TRATAMENTO: tanque séptico, filtro anaeróbio e sumidouro, dimensionados por `dimensionarTratamento`
    pela reservação.
- `EntradaDaCasa.leitorDoTerreno`: a cota do terreno para caixa, ligação e hidrômetro. Ausente = plano
  na cota zero. A F10 passa a grade ao worker.
- `HipotesesDaCasa.hidraulica.lancar` (padrão `true`). `resumo.hidraulica` traz peças e tubos por rede,
  o destino do esgoto e a verificação.
- **Verificação de rede sobre o resultado**: a mesma do app, `marcasDeVerificacao`. Cada tipo de marca
  vira uma pendência com a contagem: ERRO → VERIFICACAO, AVISO → CONFERIR.
- **"Mover é decidir" × casa automática**: a água ENCOSTA na face da parede o ponto solto no cômodo
  (`TranslateEntities`), e o kernel tira a marca `sugerida` de quem foi movido. O orquestrador
  remarca, no mesmo lote, os pontos que eram sugeridos (`SetTerminalProps sugerida: true`). Aqui
  ninguém decidiu nada.
- Fica para a F10: "o editor pré-preenche `pluvial.cidade` com a da zona". É montagem da entrada na UI.
  Hoje, sem cidade nem intensidade nas premissas, a pluvial não roda e vira PREMISSA.

Medido no lote 12 × 30 (harness, reto e a 30°):
- Tubos lançados: água 81 e 95; esgoto 40 e 41; pluvial 6 e 6.
- Nenhuma ponta aberta e nenhum trecho sem destino.
- A trava aprova, num lote só (um Ctrl+Z).

**Fica em aberto (dito): compatibilização hidráulica × estrutura.** O traçado da água corre pelas
paredes e cruza os pilares dos encontros:
- 30 trechos atravessando pilar (ERRO) no lote reto e 47 a 30°;
- 44 trechos cruzando viga (AVISO);
- 1 desconector de esgoto sem ventilação no lote reto.

Tudo aparece nas pendências com a contagem. O conserto é desviar o tubo do pilar (contornar pela face)
e furar a viga com a regra de passagem. É uma fase própria, que proponho como **F8b** antes ou depois
da elétrica.

Provas:
- `blueprintCasaAutomatica.test.ts`, +5 testes:
  - a 0° e a 30°: três redes LANCOU, sem PONTA_ABERTA nem SEM_DESTINO, hidrômetro e ligação, tudo
    sugerido, trava ok;
  - sem rede pública: tanque, filtro e sumidouro, sem ligação;
  - sem intensidade: PLUVIAL NAO_RODOU e PREMISSA, enquanto água e esgoto seguem;
  - desligada: NAO_EXIGIDA e nenhum tubo.
- Harness: portão com as etapas AGUA, ESGOTO e PLUVIAL LANCOU, redes com tubos e nenhuma ponta aberta
  nem trecho sem destino.

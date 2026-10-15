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
- [ ] F4 — estrutura
- [ ] F5 — telhado
- [ ] F6 — peças-âncora + rede pública
- [ ] F7 — mobiliário + louças com pontos
- [ ] F8 — hidro encadeada
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


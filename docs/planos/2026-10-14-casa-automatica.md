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
- [x] F8b — compatibilização hidráulica × estrutura (ver "F8b — plano" e "Registro da F8b")
- [x] F8c — alimentador enterrado fora do baldrame (ver "F8c — plano" e "Registro da F8c")
- [x] F9 — elétrica + climatização (ver "F9 — plano detalhado" e "Registro da F9")
- [x] F10 — tela da Casa automática (ver "Registro da F10")
- [x] F11 — saídas (ver "Registro da F11")
- [x] F12 — sobrado: [x] F12a arquitetura dos dois pavimentos e escada (ver "Registro da F12a") · [x] F12b estrutura e cobertura (ver "Registro da F12b") · [x] F12c instalações (ver "Registro da F12c") · [x] F12d tela e provas (ver "Registro da F12d", com a conferência no app real)
- [x] F13 — pressão da água por caso: caixa elevada ou pressurizador (ver "Registro da F13")
- [x] F14 — compatibilização das redes: [x] F14a pontos e faixas na parede (ver "Registro da F14a") · [x] F14b forro e plenum (ver "Registro da F14b") · [x] F14c furos, laje rebaixada e um tubo de queda por banheiro (ver "Registro da F14c"; f95aa616 no ar em 16/10) · [x] F14d linha do ar e dreno lado a lado (ver "Registro da F14d")
- [x] F15 — a casa na unidade do Empreendimento (ver "Registro da F15")
- [x] F16 — louça diante da porta (ver "Registro da F16")
- [x] F17 — o aquecedor do sobrado a 30° e o alimentador × esgoto nas térreas (ver "Registro da F17")
- [ ] F18–F28 — programa "todas as pendências": F18–F26 feitas; F27 em andamento; F28 a fazer (ver o programa abaixo e
  "Pendências em aberto")

### Pendências em aberto (atualizado em 18/10/2026)

**No ar:** `main` com a F27-D1 (1a1a8934, 18/10). **Em CI:** a F27-D2 (PR #46, rascunho).

As 8 casas de referência (medição de 18/10, idêntica às anteriores desde a F26): nenhuma rede em porta/janela,
nenhum encontro rede × rede, nenhum tubo atravessando pilar. O que elas ainda mostram (fora os "confira" de rotina):

| Casa | Pendências que sobram |
|---|---|
| 12 × 30 R1-N térrea | aquecedor a 0,20 m do vão (pedido 0,40); serviço sem parede externa → conferir a ventilação do aquecedor |
| 15 × 25 R1-N | — |
| 10 × 30 R1-N 2 dorm. | aquecedor a 0,20 m do vão |
| 15 × 30 R1-N 4 dorm. | aquecedor a 0,20 m do vão |
| 15 × 30 R1-B (pedida térrea) | cozinha × serviço sem porta direta; serviço com 1,40 m e dormitório com 2,33 m de largura; armário da suíte; "a térrea não comporta" (o sobrado tem mais problemas — Automático fica térrea) |
| 14 × 28 R1-A | serviço sem parede externa → conferir a ventilação do aquecedor |
| 12 × 30 R1-N sobrado | aquecedor a 0,20 m do vão; serviço sem parede externa |
| 10 × 30 R1-N 4 dorm. (pedida térrea) | programa acima da TO (175,5 × 171 m²); 4 dormitórios com 1,5–1,8 m de largura; cama da suíte; "a térrea não comporta" — o sobrado nesse lote ainda tem 4 encontros de rede sob a laje rebaixada, por isso o Automático fica térreo |

A fazer, em ordem:

1. **F27-D2** — publicar quando o CI do PR #46 passar (`main` → `conferir-producao.sh`).
2. **F27-D3 — estrutura em prumada (3 pav.)**: os pilares do 2º descem até o térreo (ou nascem em transição no nível
   certo), vigas e lajes por nível, o guarda-corpo do furo da escada no 1º; o núcleo que sobra fora do 2º com laje e
   pilares próprios.
3. **F27-D4 — instalações (3 pav.)**: o shaft que atravessa os dois níveis de baixo, a laje rebaixada por par, o passo
   do shaft em N; **a opção "3 pavimentos" na tela e no Automático** (só quando o sobrado não comporta e o gabarito
   deixa); as premissas passam a gravar 3.
4. **F27-D5 — o terraço**: o telhado só sobre o 2º (e sobre o núcleo que sobra fora dele), a laje do 1º como cobertura
   (impermeabilização no orçamento), o guarda-corpo do terraço, o uso TERRAÇO; a porta para o terraço da frente quando
   o 2º sai com a planta invertida (hoje a "entrada" do gerador fica nos fundos).
5. **Qualidade do 2º/1º na casa de 3** (vistos na sonda da D2): o gerador põe cada ambiente do 2º numa faixa de lado a
   lado (banheiro de 5,40 × 1,40 m); com programa pequeno o 1º toma a laje inteira (dormitório de 59 m²); num lote o
   núcleo deixa um banheiro do 1º com 2,39 m².
6. **Sobrado 10 × 30 (4 dorm.)**: os 4 encontros de rede sob a laje rebaixada — os eletrodutos retos do forro precisam
   desviar de zona não retangular (fase própria; 3 tentativas revertidas na F27 parte 2).
7. **Luz de teto sob dois banheiros de cima** (laje rebaixada em L).
8. **Aquecedor** a 0,15–0,20 m do vão (pedido 0,40) e serviço sem parede externa (ventilação do aquecedor a conferir)
   em 6 das 8 casas — hoje NAO_DECIDIDO com o motivo dito.
9. **R1-B térreo**: cozinha × serviço sem porta direta; larguras de serviço e dormitório abaixo do mínimo.
10. **F28** — a chuva de projeto na tela da casa; as bolhas dos eixos na prancha sem sobrepor.

Ambiente: a máquina de desenvolvimento derruba o Node (segfault, worker que cai, processo que trava por horas) —
toda medição roda com repetição e `timeout 900`; resultado só vale quando se repete. Não é defeito do código (o CI roda
a suíte inteira sem isso).

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

## F8b — plano (15/10/2026)

Pedido do usuário depois do relatório da F8, que propunha "uma F8b de compatibilização: desviar o tubo
do pilar pela face e passar a viga pela regra de furo":

> F8b

O que a sonda mediu no lote 12 × 30 reto: 30 trechos atravessando pilar (ERRO) e 44 cruzando viga
(AVISO).

| Origem | Pilar | Viga |
|---|---|---|
| Barrilete de água fria na cota 2,80 m (dentro da laje e das vigas) | 1 | 14 + 7 descidas |
| Água quente: sobe do aquecedor ao teto 2,80 m e corre lá | 16 | 19 + 4 descidas |
| Ramais de água fria a 2,20 m, no eixo das paredes | 6 | — |
| Alimentador enterrado (o pilar desce até −0,50 m) | 7 | — |

As causas:
- **Os encontros das paredes são nós do grafo pelas paredes, e o pilar está em cada encontro.** A
  penalidade de 10 m por pilar (E5.5) só desvia quando há outro caminho, e na casa não há.
- **As vigas descem até 2,30 m.** A regra "barrilete 10 cm abaixo da viga" só vale com espaço acima do
  ramal (2,20 m); sem esse espaço, o barrilete volta ao teto, dentro das vigas.
- **A coluna desce no eixo da parede**, onde está a viga.

O que muda. É código compartilhado: vale para toda planta, não só para a casa.
1. **Contorno do pilar no traçado pelas paredes**, como opção de `arvorePelasParedes`. O nó dentro do
   pilar sai do grafo e um ANEL em volta dele, afastado da face, liga as paredes que chegavam ali. A
   água (barrilete e ramais) e o alimentador/recalque ligam a opção. Eletroduto, linha frigorígena e
   VRF ficam como estão.
2. **Barrilete fora das vigas:**
   - origem acima do teto, com laje sobre o pavimento (a caixa d'água sobre a laje): o barrilete corre
     SOBRE a laje;
   - origem abaixo do teto (o aquecedor) e viga sem espaço acima do ramal: o barrilete corre na cota
     do ramal, abaixo das vigas, e não no teto.
3. **Prumada fora da viga:** a coluna que desceria dentro de uma viga desce rente à face dela, do lado
   do cômodo que atende.
4. Esgoto: o desconector sem ventilação (lote reto) e o trecho que atravessa pilar (lote a 30°).

Folgas novas são hipóteses editáveis da água: afastamento do anel, altura sobre a laje e folga da viga.

Pronto quando: o harness reprova qualquer ATRAVESSA_PILAR e mostra o CRUZA_VIGA que sobrar, nos dois
ângulos; os testes de água, obstáculos e rota pelas paredes seguem verdes, com casos novos para o anel
e o barrilete.

## Registro da F8b (15/10/2026)

Resultado no lote 12 × 30 (harness, reto e a 30°): a verificação de rede do app sai **sem nenhuma
marca**. Antes eram 30/47 trechos atravessando pilar (ERRO), 44 cruzando viga (AVISO) e 1 desconector
sem ventilação.

Custo em tubo:
- Água: 106,0 → 106,8 m no lote reto; 104,4 → 104,4 m a 30°.
- Esgoto: 71,9 → 76,5 m no lote reto (a coluna de ventilação nova); 67,0 → 67,0 m a 30°.

O que mudou. É código compartilhado, vale para toda planta:

**`blueprintObstaculosEstruturais.ts`**
- `anelDoPilar`, `dentroDoAnel`, `noAnel`, `grafoEmVoltaDosAneis`.
- `topoDaLajeDoTetoMm`, `foraDaViga`.
- Constantes: `CONTORNO_DO_PILAR_MM` 40, `PENALIDADE_DO_ANEL_MM` 5 m, `SOBRE_A_LAJE_MM` 150,
  `VAO_MINIMO_ABAIXO_DA_VIGA_MM` 50, `FOLGA_DA_VIGA_MM` 30.

**`blueprintRotaPelasParedes.ts`**
- Opção `contornoDoPilarMm`: o pilar vira anel no grafo. Cada lado do anel custa 5 m a mais, então a
  volta POR DENTRO das paredes ainda ganha quando é curta (o caso E5.5 continua igual); o anel só é
  usado quando não há outro caminho.
- Eletroduto, linha frigorígena e VRF não ligam a opção e ficam como estavam.

**`blueprintAguaAutomatica.ts`**
- Barrilete SOBRE a laje quando a caixa está acima do teto e há laje cobrindo o pavimento (aviso
  próprio).
- Barrilete ENTRE o ramal e a viga quando ela desce até perto do ramal, em vez de subir ao teto.
- Coluna que desceria dentro da viga desce rente à face dela, do lado do grupo que atende. O tubo fica
  aparente entre o ramal (2,20 m) e a laje: é o trecho que o forro do ambiente molhado esconde.
- Hipóteses novas: `contornoDoPilarMm`, `barrileteSobreALajeMm`.

**Demais arquivos**
- `blueprintAlimentador.ts` (`rotaPelasParedesAte`, também do recalque): o percurso pelas paredes
  contorna o pilar; a entrada e o pé da subida ficam fora do anel. A subida corre na parede até 10 cm
  abaixo da viga e sobe rente a ela.
- `blueprintEsgotoAutomatico.ts`: o trecho reto que atravessa pilar contorna pelo canto
  (`desvioDoPilar`, o do eletroduto), com o mesmo desnível repartido pelo caminho. Fica reto se o
  caimento cairia abaixo da mínima.
- `blueprintVentilacao.ts`: a economia de coluna media o alcance em LINHA RETA; a verificação mede
  PELO TUBO. A caixa sifonada do banheiro social (1,1 m em planta, 1,57 m pelo tubo, máximo 1,20 m)
  ficava sem ventilação. Agora o lançador reverifica pela mesma régua e ventila quem ficou de fora.

Conferido no desenho dos dados (planta recortada, água sobre a estrutura):
- os ramais de 2,20 m dão a volta em cada pilar;
- as diagonais que restam são do barrilete a 3,05 m, sobre a laje (antes estavam a 2,80 m, dentro da
  laje e das vigas).

**Fica em aberto (dito): o alimentador ENTERRADO corre dentro do baldrame.** O percurso "pelas paredes"
a −0,30 m fica no eixo da parede, e o baldrame (−0,50 a 0, largura da parede) está lá. Já era assim
antes da F8b. A verificação de rede só olha pilar e viga, não baldrame, por isso não aparecia; o
relatório de conflitos da Planta o lista como ESTRUTURA. Conserto proposto: no solo, o alimentador em
reta até o pé da subida, cruzando o baldrame só na transversal (passagem prevista).

Provas:
- `blueprintObstaculosEstruturais.test.ts`, +6 testes:
  - o anel;
  - pilar em todo canto: só a penalidade atravessa; com o anel, contorna e fica ligada;
  - a volta por dentro ainda ganha quando é curta;
  - `foraDaViga`, inclusive com o lado bloqueado;
  - barrilete sobre a laje;
  - barrilete entre o ramal e a viga.
- `blueprintCasaAutomatica.test.ts`: a 0° e a 30°, `verificacao` igual a
  `{ erros: 0, avisos: 0, porTipo: {} }`, sem pendência "Rede de …".
- Harness: o portão reprova qualquer marca da verificação de rede.

**CI vermelha no commit da F8b (9fc6acbd, run 38725612771):**
- O que falhou: 4 testes da casa estouraram os 5 s do Vitest. Localmente levam 0,85–1,4 s, e a CI
  disputa CPU com a suíte toda.
- A causa, medida com perfil de CPU: o traçado em si leva ~14 ms. Quem domina é o AJUSTE DE DN PELA
  PRESSÃO (`ajustarDnPorPressao`), que reaplicava cada troca de DN pelo kernel inteiro (hash SHA-256 e
  invariantes do modelo) a cada passo. A F8b aumentou os trechos de água (81 → 129) e as conexões do
  contorno, então cada passo ficou mais caro.
- Correção: a simulação troca o DN numa cópia rasa do modelo. O `SetTrechoProps` de verdade vai no lote
  como antes, e o kernel só mexe no `bitolaMm` nesse comando, então o resultado é o mesmo.
- Efeito: o teste mais pesado da casa caiu de 1,37 s para 0,75 s, abaixo do que era antes da F8b.
  Além disso, o arquivo de testes da casa ganhou limite explícito de 30 s: cada teste gera a casa
  inteira.

## F8c — plano (15/10/2026)

Pedido do usuário, depois do relatório da F8b ("sigo para a F9 ou corrijo antes o alimentador, se
preferir"):

> Corrigir antes alimentador

O problema, achado na F8b: o percurso "pelas paredes" do alimentador a −0,30 m fica no eixo da parede,
e o baldrame (−0,50 a 0, largura da parede) está ali. O tubo corre DENTRO da viga baldrame por metros
(na casa de prova, ~14 a 20 pedaços, alguns de 2 a 3 m).

O que muda (`rotaPelasParedesAte`, só quando a cota do percurso cai na faixa de um baldrame do
pavimento; o recalque a 2,20 m fica como está):
1. **No solo, em reta.** Da descida da entrada até o pé da subida, sem seguir as paredes. Entre a reta
   e as duas em "L" (no rumo da parede do pé da subida), vale a que corre MENOS dentro de baldrame; o
   baldrame só é cruzado na transversal (passagem prevista). O pilar é contornado pelo canto
   (`desvioDoPilar`).
2. **O pé da subida fica ao lado do baldrame**, do lado de onde o tubo chega. O tubo sobe até logo
   acima do topo do baldrame, entra na parede e segue a subida da F8b (na parede até abaixo da viga,
   depois rente a ela).
3. As folgas são hipóteses editáveis do alimentador.

Pronto quando, na casa de prova a 0° e a 30°:
- nenhum pedaço do alimentador corre dentro de baldrame mais que uma travessia (≈ a largura dele);
- a verificação de rede segue sem marca;
- a rede fica ligada e a trava aprova.

## Registro da F8c (15/10/2026)

O que mudou (`utils/blueprintAlimentador.ts`, `rotaPelasParedesAte`):
- Só quando a cota do percurso cai na faixa de um baldrame do pavimento, o percurso vai pelo SOLO. Entre
  a reta e as duas em "L" no rumo da parede da subida, vale a que corre menos dentro de baldrame;
  empatando, a mais curta. O pilar é contornado pelo canto (`desvioDoPilar`).
- O pé da subida fica ao lado do baldrame, do lado de onde o tubo chega (`foraDaViga`, a mesma da F8b,
  serve à viga de fundação). O tubo sobe até 10 cm acima do topo do baldrame, entra na parede e segue a
  subida da F8b.
- O recalque usa a mesma rota a 2,20 m e fica como estava. Sem baldrame, a rota pelas paredes também.
- Hipóteses novas do alimentador: `folgaDoBaldrameMm` (50) e `entradaNaParedeMm` (100).

Medido na casa de prova (harness):
- Antes, o alimentador corria DENTRO do baldrame em ~14 a 20 pedaços, alguns de 2 a 3 m.
- Agora só o atravessa: 2 travessias no lote reto (200 e 150 mm, a largura do baldrame) e 3 a 30°.
- Nenhum pilar tocado; a verificação de rede segue sem marca; a trava aprova.

Provas:
- `blueprintAlimentador.test.ts`, +2 testes:
  - sem baldrame, a rota segue pelas paredes como antes; com baldrame, nenhum pedaço enterrado fica
    dentro dele além de uma travessia;
  - o pé da subida fica ao lado do baldrame, sobe a +0,10 m e entra no eixo da parede; a rota é um
    caminho contínuo.
- `blueprintCasaAutomatica.test.ts`: a 0° e a 30°, todo encontro do alimentador com baldrame tem no
  máximo a largura dele (com 20 % de folga para o ângulo); nenhum com pilar; verificação sem marca;
  trava ok.
- Harness: o portão confere a maior travessia contra a largura do baldrame.

## F9 — plano detalhado (15/10/2026, "Pode seguir")

O que o levantamento achou (código da frente em `a0ac5a5f`):
- **Pontos pela norma.** O mesmo encadeamento existia no "Completar pela norma" do editor e no
  automático do gerador E6.2. Fica um só: `utils/blueprintPontosEletricosDoNivel.ts`
  (`comandosDePontosDoAmbiente` / `comandosDePontosDoNivel`). Gerador, editor e casa usam esse.
- **Chuveiro elétrico.** Nada cria o ponto elétrico dele hoje; a âncora da F6 só anota. O certo é a
  LIGAÇÃO DIRETA (a regra 9.5.2.3 acusa chuveiro em TUG/TUE), com a potência explícita, porque a
  potência padrão devolve nulo para ligação direta. Ela exige DR e ganha circuito próprio. Posição: o
  ponto hidráulico do chuveiro, a 2,20 m.
- **Quadro.** `centroDeCargas` → `comandosParaOCentro` cria o QDC (precisa de potência nos pontos).
- **Medidor e entrada de serviço.** Os tipos existem (`MEDIDOR`, `ENTRADA_SERVICO`, ligados ao quadro
  por `quadroId`), mas nada os lança. A casa os põe na frente do lote (`pontoNaFrente`, como o
  hidrômetro).
- **Circuitos.** `planejarCircuitos` com o QDC; os ids saem de `seq`, então aplica logo depois.
- **Climatização.** `gerarClimatizacao` precisa do catálogo de evaporadoras e da TBS externa. Ela liga
  os PRÓPRIOS circuitos quando o pavimento tem um quadro só e nenhum ponto solto, por isso vem depois
  dos circuitos.
  - Sem catálogo, NAO_RODOU com o motivo.
  - Sem TBS, as premissas do estudo dizem o que falta.
  - As etapas e pendências dela entram prefixadas.
- **DR e DPS.** `sugerirDRs` → `comandosDasSugestoesDeDR`; o DPS vai por `SetQuadroProps` com
  `sugerirDPS`.
- **Eletrodutos.** `planejarEletrodutosDoModelo`, por último (precisa de circuitos).
- **Conferência.** `conferirNbr5410` sobre o resultado: FALTA vira pendência VERIFICACAO e AVISO vira
  CONFERIR, por regra. É o critério de "pronto", como a verificação de rede foi na hidráulica.

Etapas novas, depois da PLUVIAL e antes da CONFERENCIA: PONTOS_ELETRICOS → QUADRO → CIRCUITOS →
CLIMATIZACAO → DR_DPS → ELETRODUTOS.

Entradas novas (premissas do estudo, como `hidro`):
- `circuitos` e `eletricas`;
- `climatizacao` (com o clima);
- `modelosDeClimatizacao` (o catálogo).

Hipóteses da casa: `eletrica {lancar, areaPorLuminariaM2, chuveiroEletricoVA 5500, medidor}` e
`climatizacao {lancar}`.

## Registro da F9 (15/10/2026)

O que a casa ganhou (`utils/blueprintCasaAutomatica.ts`): seis etapas depois da PLUVIAL.

1. **PONTOS_ELETRICOS**
   - Tomadas e luz com interruptor pela norma, em todo ambiente (`comandosDePontosDoNivel`).
   - O chuveiro elétrico (quando a âncora o pôs, por exemplo no R1-B) vira LIGAÇÃO DIRETA no ponto
     hidráulico do chuveiro, a 2,20 m, com `chuveiroEletricoVA`.
2. **QUADRO**
   - O QDC no centro de cargas.
   - A ENTRADA DE SERVIÇO e o MEDIDOR na frente do lote (`pontoNaFrente`), ligados ao quadro.
3. **CIRCUITOS**: `planejarCircuitos` no QDC.
4. **CLIMATIZACAO**: `gerarClimatizacao` com o catálogo e o clima do estudo; liga os circuitos dos splits.
   Sem catálogo: NAO_RODOU e PREMISSA.
5. **DR_DPS**
   - DR por circuito que exige (`sugerirDRs`) e DPS no quadro.
   - A LIGAÇÃO da entrada pela demanda: a menor categoria do padrão que a comporta, e no empate a de
     menos fases. A casa passa dos 10 kVA de uma monofásica.
6. **ELETRODUTOS**: `planejarEletrodutosDoModelo` e, depois, o DIÂMETRO pela fiação derivada
   (`comandosDeBitolaPelaOcupacao`).

No fim, `conferirNbr5410` sobre o resultado, por regra: FALTA → VERIFICACAO, AVISO → CONFERIR.

As redes que passam por PORTA ou JANELA (`conflitosDoModelo` ABERTURA) ficam no resumo e nas
pendências, por rede. Hipóteses novas da casa: `eletrica` (lançar, luz por área, chuveiro, medidor) e
`climatizacao.lancar`. Entradas novas: `circuitos`, `eletricas`, `climatizacao`, `modelosDeClimatizacao`.

**Defeitos do app achados e corrigidos no caminho** (código compartilhado, vale para toda planta):
- **O lado do ambiente em desenho GIRADO**, em duas partes:
  - `paredeDoLado` testava colinearidade EXATA, e com os vértices arredondados o lado não achava a
    parede. O recuo virava zero e a tomada ficava no EIXO, na borda do ambiente, e sumia da contagem.
    Eram quatro cópias (regras, distribuição, grafo espacial, unidades); ficou uma, por distância
    (`utils/blueprintLadoDaParede.ts`, tolerância de 5 mm, a mesma das regras da F3).
  - O anel do ambiente tinha ESPÍCULAS (P, Q, P) da ponta em T esticada; recuado, o dente punha a
    tomada e o interruptor no cômodo VIZINHO. `semEspiculas` limpa o anel em `ladosDePiso`.
  - Antes, a 30°: 3 ambientes sem interruptor e 6 com tomada faltando. Depois: nenhum.
- **A tomada dentro do pilar:** a distribuição evitava porta e canto, não pilar. O pilar entra como
  posição ocupada.
- **O split que não achava parede:** a regra tirava a parede INTEIRA com porta, e o eixo do corredor
  atravessa vários cômodos; a porta do vizinho tirava a parede da suíte e da sala. Agora só a porta
  que cai no trecho do próprio ambiente. Antes 2 splits (lote reto) e 0 (a 30°); agora 4 e 4.
- **O circuito dos splits:** a trava "há outros pontos soltos" contava ponto de DADOS, que nunca tem
  circuito, e os splits ficavam sem circuito. Agora conta só os pontos que o planejador de circuitos
  liga (`pontosElegiveis`).
- **A linha frigorígena na estrutura:**
  - corria a 2,50 m, dentro das vigas (que descem a 2,30 m); agora vai 10 cm abaixo do fundo da viga
    do teto, como o eletroduto e o barrilete;
  - o caminho pelas paredes (linha e dreno) contorna o pilar pelo anel da F8b.
  - Antes, 28 a 31 trechos em pilar e 21 a 27 em viga; agora nenhum.
- **A ocupação do eletroduto:**
  - O lançamento escolhia o diâmetro com 3 condutores por circuito, e a conferência mede a fiação
    derivada (retornos, neutro, PE).
  - O tronco do quadro ficava "Ø50 com 121 condutores, 57 %, limite 40 %".
  - `comandosDeBitolaPelaOcupacao` sobe o diâmetro com a régua da conferência.
- **Uma lógica só para pontos:** `comandosDePontosDoAmbiente`/`comandosDePontosDoNivel` são o
  encadeamento único do "Completar pela norma" do editor, do gerador E6.2 e da casa.

Medido na casa de prova (harness, lote 12 × 30, R1-N):

| | Lote reto | 30° |
|---|---|---|
| Etapas elétricas | 6 LANCOU | 6 LANCOU |
| Pontos | 38 tomadas, 12 luzes, 12 interruptores | 38 tomadas, 12 luzes, 12 interruptores |
| Circuitos | 30 | 30 |
| Splits | 4 | 4 |
| Entrada | T2 trifásica, 17,7 kVA | B2 bifásica, 14,8 kVA |
| NBR 5410 | 0 falta | 0 falta |
| Ponto de carga sem circuito | 0 | 0 |
| Linha e dreno com marca | 0 | 0 |

- Restam dois AVISOS: a capacidade de interrupção dos disjuntores é hipótese (a confirmar com a
  concessionária) e as tomadas sugeridas aguardam posição.
- A entrada muda com o ângulo porque a carga térmica dos splits depende da orientação.
- No R1-B, 2 chuveiros elétricos de 5.500 W, cada um com circuito próprio e DR. Com os 4 splits, a
  demanda vai a 25,9 kVA (T3); a climatização pode ser desligada nas hipóteses.

**Fica em aberto (dito): redes × aberturas e afastamento entre redes.**
- A janela do gerador vai de 1,00 a 2,20 m, e o topo dela é a mesma cota de ramal, eletroduto e linha
  abaixo da viga (2,20 m). O tubo corre colado no topo da janela.
- A linha e o dreno saem da parede para a condensadora no vão da janela (6 + 6 trechos, lote reto).
- O aquecedor (âncora F6) ficou na parede da janela (3 trechos de água fria).
- Tudo está nas pendências ("Rede de …: N trecho(s) passando por porta ou janela").
- As redes paralelas encostadas (raspão, sem eixo dentro) não são tratadas.
- Proposta: fase de compatibilização entre redes e aberturas.

Provas:
- `blueprintCasaAutomatica.test.ts`, +5 testes:
  - a 0° e a 30°: tudo LANCOU, NBR sem falta, nenhum ponto de carga solto, 4 splits, nada além da
    laje na estrutura, trava ok;
  - sem catálogo: CLIMATIZACAO NAO_RODOU com PREMISSA;
  - R1-B: ligação direta de 5.500 W no ponto do chuveiro, circuito só dela e DR;
  - elétrica desligada.
- `blueprintPontosEletricosDoNivel.test.ts` (novo):
  - a 0°, 17°, 30° e 45°: a norma fecha e cada ambiente tem as suas 4 tomadas;
  - a tomada não vai dentro do pilar (o teste reprova sem a correção);
  - espícula;
  - parede do lado com tolerância.
- Harness: o portão confere NBR sem falta, nenhum ponto solto, 4 splits e o ar sem marca.

## Registro da F10 (15/10/2026)

Pedido: "pode seguir". Depois veio "desconsidere minha última mensagem"; perguntei, e o usuário confirmou
"Seguir com a F10".

Arquivos:

| Arquivo | O que faz |
|---|---|
| `components/blueprint/TelaCasaAutomatica.tsx` | A tela. Molde: `TelaGerador` e `PainelGeradorPpci`. |
| `hooks/useCasaAutomatica.ts` | O motor num Web Worker, com progresso por etapa. Molde: `useGeradorDeMassa`. |
| `utils/blueprintCasaAutomatica.worker.ts` | O worker. |
| `utils/blueprintPremissasDaCasa.ts` | As premissas da casa do estudo: tipo, padrão, leitura tolerante da coluna e ida para as hipóteses do motor. |
| `hooks/useBlueprintCasa.ts` | Persistência com respiro de 500 ms; grava na hora ao desmontar com gravação pendente. |
| `services/blueprintCasaService.ts` | Serviço da tabela. |
| `types/blueprint.ts` | `BlueprintCasaRow`. |
| `supabase/migrations/aplicar_20271015100000_blueprint_study_casa.sql` | Tabela nova (abaixo). |

A tabela `blueprint_study_casa` é o desenho de `_climatizacao`: RLS `is_org_member`, REVOKE/GRANT.
Foi APLICADA no banco em 15/10 (`db query -f`) e conferida: RLS ligada, 1 política, anon não lê,
authenticated lê.

**A tela.** In-flow, como as outras telas do editor. A memória registra três rejeições a tela cheia e
painel sobreposto; esta é um `telaAberta === 'casa'` com `cabecalhoDaTela`, e o editor fica montado e
escondido.
- Abre por um botão "Casa automática" em Analisar › Gerar.
- Card 1, em seções §30 (`SecaoTitulo`):
  - **Programa da casa**: padrão CUB, dormitórios, suítes, banheiros, vagas, área alvo e garagem;
    "preencher pela unidade do Empreendimento" ligado ao estudo, com `programaCurtoDaUnidade`;
  - **O que a casa leva**: as disciplinas;
  - **Hipóteses**: telhado, implantação, água quente, chuveiro, medidor, caixa de gordura,
    alternativas tentadas.
- Card 2, **Prévia**:
  - "Gerar prévia", desligado com o motivo no `title` e na tela, ou "Parar" enquanto gera, com a
    etapa em curso ("Etapa 7 de 22: Vigas");
  - o resumo: área, ambientes, TO, CA e permeabilidade contra a zona, custo = área × CUB do padrão na
    UF, elétrica, splits;
  - as etapas com a nota;
  - o relatório por grupo;
  - "Criar alternativa com a casa" (um ramo novo com o resultado) e "Lançar no pavimento" (um lote,
    com a trava `conferirPlanoDaCasa` antes; desligado com o motivo).

**A entrada no editor.** É a mesma que cada disciplina já recebe:
- o terreno e a zona do estudo de massa, e as regras da zona;
- o norte e a latitude;
- as premissas hidro, com a cidade da zona na chuva de projeto quando a pluvial não diz outra (a nota
  da F8);
- os circuitos, as elétricas e a climatização, com o catálogo de evaporadoras (o efeito que carrega o
  catálogo passou a rodar também com a tela da casa) e o contexto de carga: materiais e cidade, que a
  casa não passava ao gerador de climatização (`EntradaDaCasa.cargaDaClimatizacao`);
- a GRADE da topografia: o leitor do terreno é uma função e não atravessa o worker
  (`PedidoDaCasa` / `planejarCasaDoPedido` remontam o leitor do lado de lá).

**Ajustes no motor que a tela pediu:**
- `motivoParaNaoGerar` passa a dizer, ANTES de gerar, o lote ausente, o lote aberto e a frente não
  marcada. Antes a prévia saía vazia com "implantação não rodou". No motor, o plano sai vazio com o
  mesmo motivo.
- `planejarCasa(…, opcoes.aoConcluirEtapa)`: o progresso.
- Os "conflitos" de 0 mm da climatização são encostos entre redes paralelas, sem eixo dentro. Viraram
  uma linha com a contagem em vez de ~90 itens no relatório (de 132 para 61).

**Conferido no navegador** (harness `docs/spikes/casa-automatica/tela.html`):
- A tela de verdade com o hook de verdade, ou seja, o Web Worker do navegador, que o jsdom não roda.
- Numa casca com a barra lateral de 256 px e o mesmo cabeçalho.
- Portões:
  - nenhum diálogo, com a tela in-flow;
  - gerou pelo worker, 22 etapas, com o progresso visto;
  - resumo com área e custo (156,86 m², R$ 415.679 no CUB de prova);
  - lançar ligado, com a trava aprovando;
  - sem erro de JS.
- Os prints foram olhados.

A conferência no app real, com login e uma planta descartável, precisa da senha da conta de leitura
(que não fica guardada) e da autorização da escrita: fica oferecida.

Provas:
- `TelaCasaAutomatica.test.tsx`, 8 testes:
  - gerar;
  - gerar desligado com o motivo;
  - parar e o progresso;
  - resumo, etapas e relatório por grupo;
  - lançar desligado com o motivo da trava;
  - lançar e criar alternativa;
  - o número livre enquanto se digita (o "5" de "5500" não vira 2000);
  - programa, disciplinas e unidade.
- `useBlueprintCasa.test.tsx`, 4 testes: a linha completada, o vazio, uma gravação por rajada e a
  gravação ao sair antes do respiro (reprova sem a correção), e sem a tabela.
- `blueprintPremissasDaCasa.test.ts`, 4 testes.
- `BlueprintEditor.test.tsx`, +1: Analisar › Gerar › Casa automática abre a tela (h1 fora de diálogo);
  sem lote, gerar desligado com o motivo; voltar devolve o editor.
- `check-ui-standard` sem violações na tela e no editor; `segurancaMigrations` e `migrationsPrefixo`
  passam.

**Conferência no APP REAL (15/10/2026, depois do publish da F10).** O usuário mandou a senha da conta de leitura
e o "pode seguir". O roteiro é `c:/tmp/pwtest/conferencia-casa.cjs`: dev server da frente no `a7aae20a`, uma
planta DESCARTÁVEL criada pelo serviço com o lote 12 × 30 e a FRENTE, ARQUIVADA no fim e conferida no banco
(status ARQUIVADO). Todos os portões passaram:
- Analisar › Gerar › Casa automática abre a tela: in-flow, sem diálogo, com a barra lateral do app à vista;
- "Gerar prévia" ligado;
- "guardado no estudo": a tabela `blueprint_study_casa` responde com o login real;
- as premissas sobrevivem a recarregar (dormitórios 2 voltou do banco);
- a prévia pelo Web Worker do app sai com as 22 etapas, o CUB REAL da tabela (R$ 2.945/m², R1-N, 01/2026),
  30 circuitos e entrada B2;
- "Lançar no pavimento" põe a casa no rascunho: 15 paredes, 12 ambientes, camadas de estrutura 132,
  elétrica 234, hidráulica 201, mecânica 92 e 697 peças; "Rascunho salvo";
- depois de lançar, "gerar de novo" fica desligado dizendo que o pavimento já tem paredes;
- nenhum erro de página, console ou HTTP.

Um achado da conferência: o selo "Conferência" do editor marca 207 achados sobre a casa lançada. São os
conflitos gerais, incluindo os encostos entre redes e as redes nas aberturas, a compatibilização pendente
(F9).

## Registro da F11 (15/10/2026) — as saídas

Pedido: "Senha … Pode seguir": a conferência no app real e a F11. Sem código de produto, como o plano
previa. A casa gerada (`plano.resultado`) alimenta, sem adaptação, o que o app produz de qualquer
planta. O adaptador opcional para a unidade do Empreendimento (`casaParaUnidadeAdapter`) não foi
feito: depende de um "pode seguir" próprio.

Provas (`__tests__/blueprintCasaSaidas.test.ts`, 5 testes; a casa de prova R1-N com climatização é
gerada UMA vez):

**Orçamento (`resumoDasMedidas`)**: 34 medidas, todas com quantidade.

| Grupo | Lote reto |
|---|---|
| Construída | 156,86 m² |
| Alvenaria | 37 m³ |
| Concreto: pilar / viga / laje / fundação | 3,7 / 8 / 15,2 / 33,6 m³ |
| Formas | sim |
| Estacas | 248 m |
| Aço | 4.604 kg |
| Telhado | 198 m² |
| Calha | 36,5 m |
| Tubos: AF / AQ / esgoto / pluvial | 67 / 35 / 76 / 18 m |
| Eletroduto | 169 m |
| Condutor | 2.758 m |
| Quadro / disjuntores / DR / DPS | 1 / 30 / 8 / 1 |
| Linha frigorígena / dreno | 31 / 29 m |
| Equipamentos de climatização | sim |

**Planilha**: as abas Totais, Ambientes, Paredes, Aberturas, Estrutura, Armadura, Instalações e
Telhado, com linhas.

**DXF**: EOF, 54 camadas, 133 polilinhas, 191 textos.

**IFC**: as classes da casa, cada uma presente.
- Arquitetura: parede (uma por parede do desenho), porta, janela, espaço, telhado.
- Estrutura: pilar (um por pilar), viga, laje, sapata/bloco, estaca.
- Água e esgoto: tubo, conexão, louça, caixa d'água.
- Elétrica: eletroduto, cabo, tomada, luminária, interruptor, circuito. O quadro sai como
  `IfcFlowController` no IFC4.
- Climatização: o split.

**Prancha em PDF**: A3, 1:100, `%PDF-`, 272 KB.

**No APP REAL** (`c:/tmp/pwtest/conferencia-casa.cjs`, outra planta descartável, arquivada no fim):
- depois de lançar a casa, "Publicar versão": a versão existe no banco (revisão 1, hash
  `d642f97d12b9`);
- Colaborar › Versões baixou o DXF (75 KB, `AC1009`) e o IFC (2 MB, `ISO-10303-21`);
- nenhum erro de página, console ou HTTP.

## F12 — plano detalhado (15/10/2026, "pode seguir")

O usuário disse "pode seguir" sem escolher entre F12, compatibilização e o adaptador para a unidade;
segui a ordem do plano (F12).

O que o levantamento achou (código em `1290c127`):
- **O gerador E6.2 faz UM pavimento por chamada.** Não aceita cômodo fixo nem furo, não conhece
  escada (não há uso ESCADA), põe sempre a porta de entrada na frente e repete os uids das paredes
  (`gerador:${semente}:parede:k`). Dois pavimentos com a mesma semente dão DUPLICATE_UID no lote.
- **O envelope aceita contorno ortogonal (L, U, T).** `retangulosDoContorno` reparte em principal e
  anexos.
- **A escada do kernel é completa** (`AddEscada`: 2, 3 ou 4 pontos = reta, L ou U; espelho alvo; o
  furo na laje é derivado; avisos de espelho e Blondel), mas nada a posiciona sozinho.
- **Estrutura** (pilares, vigas, lajes, fundações) é por pavimento e não alinha pilares entre
  pavimentos.
- **Já são multipavimento:** água (colunas que descem), esgoto (tubo de queda a partir do superior),
  pluvial (condutores descem), circuitos (um QDC alimenta os outros pavimentos), eletrodutos
  (prumadas entre pavimentos) e climatização.
- **`aproveitamentoDoEstudo`** já faz TO pela projeção e CA pela soma; a casa hoje iguala os dois.

Decisões de desenho (hipóteses editáveis):
- `pavimentos: 1 | 2` (padrão 1).
- No sobrado, o térreo leva o social, o serviço, o lavabo e a garagem; o superior, os dormitórios,
  suítes e banhos, mais a circulação.
- A ESCADA vive num NÚCLEO reservado no contorno, um entalhe igual nos dois pavimentos:
  - o gerador recebe o contorno da casa menos o núcleo, a escada (U, 1,0 m) entra no núcleo, e o
    núcleo ganha as paredes e as portas para o cômodo vizinho em cada pavimento;
  - o pé-direito é o mesmo; o superior fica na cota pé-direito + laje.

Fases (cada uma com "pode seguir"):
- **F12a: arquitetura dos dois pavimentos.**
  - programa dividido; núcleo da escada; gerador por pavimento (uids por pavimento; sem porta de
    entrada no superior);
  - o fechamento do núcleo e as portas; `AddEscada` U;
  - a implantação pelo pavimento maior: TO pela projeção, CA pela soma, recuo do 2º pavimento.
- **F12b: estrutura e cobertura.**
  - pilares alinhados: o superior primeiro, e o que não tem apoio desce para o térreo;
  - lajes sem a do núcleo; fundação só no térreo; eixos por último;
  - telhado no superior; cobertura do térreo que sobra (garagem); guarda-corpo da escada.
- **F12c: instalações.**
  - âncoras repartidas: caixa d'água em cima; aquecedor, caixa de gordura e vagas embaixo;
  - mobiliário e pontos por pavimento;
  - água, esgoto (shaft e tubo de queda) e pluvial; quadro no térreo; circuitos por pavimento;
    climatização.
- **F12d: tela e provas.** O número de pavimentos na tela, harness, conferência no app.

## Registro da F12a (15/10/2026) — arquitetura dos dois pavimentos e a escada

**Mudou em relação ao plano acima:** o núcleo da escada como ENTALHE no contorno antes de gerar
foi medido e descartado — sem cômodo na faixa da frente, o gerador põe o corredor do superior na
fachada e o entalhe come a repartição. Ficou o que um projetista faz:

1. **programa dividido** (`dividirPrograma`): o térreo leva sala, cozinha, serviço, lavabo,
   varanda, garagem e escritório; o superior, o resto. No superior os dormitórios recebem
   privacidade SOCIAL **só para o zoneamento** (o uso continua dormitório): o corredor cai no meio,
   de lado a lado, com os quartos na frente e a suíte nos fundos;
2. os dois pavimentos gerados **no mesmo retângulo**, cada um com as suas sementes; no superior só
   servem as alternativas com corredor (a escada chega nele);
3. o **núcleo** (2,40 × 3,60 m) é recortado **depois**, na ponta do corredor de cima, encostado numa
   fachada lateral. `escolherNucleo` testa as 4 opções (direita/esquerda × para os fundos/para a
   frente) e pontua os DOIS pavimentos: ambiente que fica abaixo da área mínima ou com menos de
   `sobraMinimaDoAmbientePct` (50 %) da área gerada pesa 100; ambiente partido em dois, 10; o resto,
   a fração comida. As paredes que atravessam o núcleo são cortadas na borda dele (a abertura do
   trecho cortado sai; a do pedaço de lá é re-ancorada); o núcleo ganha as paredes que faltam e as
   portas — em cima, do patamar para o corredor; embaixo, para o melhor vizinho (sala > varanda >
   cozinha > …). A etiqueta do ambiente cujo centro caiu no núcleo **ou na parede dele** vai para o
   maior pedaço que sobrou (achado: na parede, o kernel dava o nome ao núcleo e o ambiente ficava
   sem nome); o núcleo ganha a etiqueta "Escada";
4. a **escada em U** dentro do núcleo: patamar de 1,0 m alinhado com o corredor, dois lances lado a
   lado, virada no outro extremo; espelhada no núcleo da esquerda.

No orquestrador: `HipotesesDaCasa.pavimentos: 1 | 2` (padrão 1) e `sobrado: HipotesesDoSobrado`
(laje 100, núcleo, patamar, lance, largura, espelho alvo, porta, sobra mínima — todas editáveis). A
implantação recebe o programa do pavimento MAIOR + o núcleo, divide o potencial do CA por dois, usa
os recuos da altura do sobrado (2 × (pé-direito + laje)) e recusa com motivo quando o gabarito da
zona não deixa dois pavimentos. O superior entra por `AddLevel` no mesmo lote (cota pé-direito +
laje = 2,90 m), sem a porta de entrada que o gerador põe na fachada, com uids por pavimento
(`comUidsDoPavimento` — a mesma semente nos dois dava DUPLICATE_UID). `comandosNoMundo` virou
`comandosLocaisNoMundo` (qualquer lote, inclusive `AddEscada`). A conferência é comum às duas casas
(`fechar`): TO pela projeção, CA pela soma. **Estrutura, telhado e instalações do sobrado ficam
`NAO_RODOU`** com a nota "no sobrado, esta etapa ainda não é lançada sozinha" e uma pendência de
premissa — são a F12b e a F12c.

Medido (programa 3/1/2/2 R1-N, sementes 1–8):

| Lote | Retângulo | TO / CA | Núcleo | Escada | Portas | Programa |
|---|---|---|---|---|---|---|
| 12 × 30 | 8,60 × 12,30 | 30,6 % / 0,61 | direita, fundos | 17 × 171/306, Blondel 647 | sala · circulação | 11/11, 0 regra violada |
| 10 × 25 | 7,00 × 15,15 | 44,2 % / 0,88 | direita, fundos | idem | cozinha · circulação | 11/11, 0 regra violada |
| 15 × 20 | 8,60 × 12,30 | 36,7 % / 0,73 | direita, fundos | idem | sala · circulação | 11/11, 0 regra violada |

Nas formas de casa soltas (8,2 × 11,75; 9 × 10,5; 7 × 13,5; 10 × 9): os 7 ambientes nomeados nos dois
pavimentos e nenhuma regra de ambiente violada; no 10 × 9 o núcleo ainda come a garagem (18,4 m²
para 2 vagas) — sai como pendência "o núcleo come boa parte de Garagem", porque as 4 opções perdem
algum ambiente.

Testes: `__tests__/blueprintSobrado.test.ts` (13 — programa dividido, pedaços, escolha do núcleo,
recorte, escada espelhada) e o bloco "F12a" em `blueprintCasaAutomatica.test.ts` (10 — pavimento
superior na cota, escada sem aviso, portas, programa atendido nos dois, superior sem porta para a
rua, TO/CA, etapas que ainda não rodam, trava, lote girado 30°, zona de 1 pavimento).

## Registro da F12b (15/10/2026) — estrutura e telhado do sobrado

No sobrado, as etapas PILARES → VIGAS → LAJES → FUNDACOES → EIXOS → TELHADO agora rodam nos dois
pavimentos, no mesmo lote (as instalações seguem `NAO_RODOU` até a F12c). O que foi decidido e medido:

- **Pilar é prumada** (`pilaresDoSobrado`). O térreo pelo planejador de sempre; cada pilar do térreo
  com parede do superior em cima **sobe** (mesma seção, mesmo ponto); o planejador do superior
  completa, e cada pilar novo dele **desce** ao térreo quando há parede embaixo fora de porta e
  janela (`paredeSobOPonto`). Sem parede embaixo, ele **nasce numa viga de transição** quando cai
  sobre uma; senão sai, e vira pendência — pilar não nasce no meio de um cômodo.
- **Vigas de transição** (`trechosDeTransicao` + `vigasDeTransicao`). Medido: o superior sai igual
  em todas as sementes, e ~32 m das paredes internas dele não têm parede do térreo embaixo em
  qualquer par de sementes (64 pares, 4 formas) — escolher o par não resolve. Então, no térreo, sob
  cada trecho de parede do superior sem parede embaixo, uma viga de face a face das paredes do térreo
  que ela cruza (cada uma é apoio), com o mesmo pré-dimensionamento das vigas automáticas (vão ÷ 10,
  mínimo 30 cm, largura da parede), topo no pé-direito. Vai para "conferir" com o calculista.
- **Lajes:** a do térreo é o piso de cima; a do superior, o forro. O **furo da escada** é derivado
  pelo kernel (`furosDaEscada`) — e não saía: o anel do ambiente traz ESPÍCULAS (o dente de ~2 cm
  que o pilar ou a ponta de parede deixam, … P, Q, P …); com elas a laje não é convexa e o
  `recorteComum` devolvia um ponto. **Corrigido na laje automática** (`planejarLajes` usa
  `semEspiculas`, o mesmo da F9) — vale para todo desenho, não só a casa. A laje automática não
  entra no bundle da planta-api (só kernel, IFC e planilha); nada a regerar.
- **Fundação só no térreo**, um bloco por pilar do térreo; **eixos** do térreo.
- **Telhado** sobre o superior (o retângulo é o mesmo nos dois — não sobra cobertura de térreo).
- **Corrimão** dos dois lados dos LANCES (o sugeridor do app, sem o segmento da virada — o corrimão
  dele atravessaria os lances) e **guarda-corpo** de 1,10 m no superior, na borda do furo sobre o
  primeiro lance.

Medido (programa 3/1/2/2 R1-N):

| Lote | Pilares T / S | Sobem · descem · nascem em viga · fora | Vigas T · transição · S | Furo | Conflitos |
|---|---|---|---|---|---|
| 12 × 30 | 26 / 25 | 12 · 5 · 7 · 2 | 12 · 10 (28,5 m, maior vão 5,8 m) · 11 | 4,89 m² | 0 |
| 10 × 25 | 25 / 27 | 15 · 4 · 8 · 1 | 12 · 10 (26,8 m, 5,1 m) · 11 | 4,89 m² | 0 |
| 15 × 20 | 26 / 25 | 12 · 5 · 7 · 2 | 12 · 10 (28,5 m, 5,8 m) · 11 | 4,89 m² | 0 |

Os 1–2 pilares "fora" — medido, não suposto — caem sobre JANELA do térreo (o encontro de parede do
superior na fachada, em cima do vão de uma janela de baixo): a pendência diz "sobre porta ou janela"
separado de "no meio de um cômodo". ~0,2 s por sobrado inteiro.

Testes: bloco "F12b" em `blueprintCasaAutomatica.test.ts` (7 — pilar sobre parede, prumada ou viga,
toda parede do superior com parede ou viga embaixo, furo na laje do térreo e fundação só embaixo,
telhado em cima com corrimãos e guarda-corpo, zero conflito + trava, estrutura desligada) e 4 em
`blueprintSobrado.test.ts` (modelo sintético: trechos, vigas, pilares em prumada com descida, apoio
fora da porta).

## Registro da F12c (15/10/2026) — instalações do sobrado

As instalações (âncoras → eletrodutos) viraram UM bloco que recebe a lista de pavimentos —
`[térreo]` na térrea, `[térreo, superior]` no sobrado — e todas as 22 etapas rodam no sobrado com a
mesma situação da térrea do mesmo lote (teste). Água, esgoto, pluvial, eletrodutos e climatização já
liam o modelo inteiro; âncoras, mobiliário, pontos, circuitos e as conferências (NBR 5410, verificação
de rede) passaram a rodar pavimento a pavimento.

- **Âncoras:** a caixa d'água vai para o pavimento de CIMA, sobre o banheiro, acima da laje dele
  (`ContextoDasAncoras.caixaDagua: false` no térreo); aquecedor, caixa de gordura e vagas, embaixo.
- **Quadro:** um só, no TÉRREO, pelo centro de cargas de lá (solto, ia para o pavimento de mais carga) e
  numa parede que tem parede em cima — a prumada do eletroduto sobe na posição do quadro e, antes,
  aparecia no meio da suíte. Circuitos dos dois pavimentos saem dele.
- **SHAFT** (`shaftsDoSobrado`, hipótese `shaftMm` 400): junto de cada banheiro de cima, numa parede
  com parede embaixo, fora de porta, janela, pilar e núcleo da escada; embaixo prefere serviço, lavabo,
  cozinha, garagem antes da sala. O esgoto e a água já desviavam o tubo de queda e as colunas para um
  shaft a até 3 m (`shaftPreferido`, E2.4) — faltava o shaft. Medido antes: o tubo de queda descia no
  ponto do vaso, no meio da garagem do térreo.
- **Barrilete da água quente** (aquecedor no térreo, chuveiros em cima): ficava a 2,80 m, DENTRO da
  laje (54 conflitos), porque a "viga mais baixa do teto" era a de transição (60 cm, solta no cômodo).
  `fundoDaVigaMaisBaixaMm(..., { soSobreParede })`: o barrilete anda pelas paredes e só passa sob a viga
  que corre sobre parede. (Tentei o mesmo no eletroduto e desfiz: ele corta o teto em linha reta — o
  teste dele provou — e para ele toda viga está no caminho.)
- **Bug do planejador de água corrigido:** com a origem ABAIXO dos pontos e o barrilete abaixo do
  teto, a coluna começava no piso de cima e faltava o trecho barrilete → teto no pavimento da origem
  (duas pontas abertas). Existia antes; aparecia agora porque o barrilete deixou o teto.
- **Coluna que atravessa pavimentos** (`paredesEmComum`): procura antes a parede que existe em todos
  os pavimentos que ela atravessa (parede sobre parede) — a do lavabo do térreo subia pelo meio do
  dormitório de cima.
- **Pendência** `Prumada pelo meio do cômodo` (`prumadasPeloMeioDoComodo`, rente à parede = até 6 cm
  da face): sobra a VENTILAÇÃO do lavabo do térreo, que sobe no ponto da peça pelo dormitório de cima.
  É a regra geral da ventilação (na térrea as colunas também sobem no meio dos banheiros) — fica para
  a compatibilização.

Medido (12 × 30, R1-N, com intensidade de chuva): todas as redes ligadas (0 erro de verificação: 0
ponta aberta, 0 trecho sem destino); conflitos 201 (91 por 100 m²) × 85 da térrea (54 por 100 m²) —
o excesso é passagem vertical pela laje entre pavimentos e cruzamento entre redes, que dobram com dois
pavimentos; os de ESTRUTURA caíram de 210 para 109 com o shaft e o barrilete. Com catálogo: 4 splits
(sala embaixo; suíte e dois dormitórios em cima), rede de ar sem erro, NBR 5410 sem falta, nenhum
ponto de carga sem circuito nos dois pavimentos.

Testes: bloco "F12c" (7) e "F12c: climatização" (2) em `blueprintCasaAutomatica.test.ts`; 2 em
`blueprintSobrado.test.ts` (parede em comum, prumada pelo meio do cômodo); 1 em
`blueprintAguaAutomatica.test.ts` (a coluna da origem abaixo); 1 em
`blueprintObstaculosEstruturais.test.ts` (viga sobre parede).

## Correção da ventilação (15/10/2026, pedido do usuário após a F12c)

> "corrigir pendência: a ventilação do lavabo do térreo ainda sobe pelo Dormitório 1 […] apos corrigir
> pendencia seguir com F12d."

A coluna de ventilação nova subia NA POSIÇÃO DA PEÇA: no meio do banheiro (térrea e sobrado) e, no
sobrado, pelo meio do dormitório de cima. Agora (`planejarVentilacao` → `ondeAColunaSobe`):

- sai do MESMO nó sob a peça (a distância pelo tubo, que a NBR 8160 mede, não muda — a verificação já
  aceitava a ponta de baixo de qualquer trecho de ventilação), corre SOB O PISO em aclive de 1 % até a
  parede mais perto e sobe nela, rente à viga (`foraDaViga`) e fora do pilar (`foraDoPilar`);
- a parede tem de existir em TODOS os pavimentos que a coluna atravessa (`paredesEmComum`) e estar livre
  de porta e janela em cada um; o shaft ao alcance vem antes;
- hipótese nova `HipotesesDeEsgoto.ventilacaoAteAParedeMm` (padrão 1500; 0 = como antes);
- a coluna da peça EMPILHADA (a sifonada de cima, no mesmo ponto da de baixo) liga a perna no pé da
  coluna que já sobe ali, em vez de pôr uma segunda coluna sobreposta (antes ela ficava ventilada por
  coincidência — a coluna passava no ponto dela);
- a verificação agrupa como coluna só os trechos VERTICAIS, e mede o DN que a coluna precisa pela rede
  na outra ponta da perna (sem isso, 2 colunas acusavam DN errado).

Medido (12 × 30): térrea e sobrado sem nenhuma prumada pelo meio de cômodo e sem erro de verificação
de rede; a pendência "Prumada pelo meio do cômodo" não aparece mais.

## Registro da F12d (15/10/2026) — o sobrado na tela e as provas

- **Tela:** "Pavimentos" (Térrea / Sobrado) no programa; no sobrado, "Laje entre os pavimentos (cm)" e
  "Shaft das instalações (cm)" nas hipóteses (o núcleo e a escada seguem o padrão do motor — mudar a
  largura da escada pede redimensionar o núcleo junto); no resumo da prévia, a escada e o lado do
  núcleo; o botão diz "Lançar os dois pavimentos"; a mensagem depois de lançar diz que o pavimento
  superior foi criado. `check-ui-standard` limpo.
- **Premissas** (`blueprint_study_casa.hipoteses`, sem migration — é JSON parcial): `pavimentos` (só 1
  ou 2; o resto cai na térrea) e o grupo `sobrado`, completado como os outros.
- **Harness** (`docs/spikes/casa-automatica/`): `?pavimentos=2` e `?ver=superior`; o `medir.mjs`
  ganhou a rodada do sobrado a 0° e a 30° (etapas, cota do superior, escada, portas do núcleo, núcleo
  sem deixar ambiente abaixo do mínimo, programa, prumada dos pilares, furo, telhado em cima, caixa em
  cima e quadro embaixo, shaft com o tubo de queda, nenhuma prumada pelo meio de cômodo, redes sem
  ERRO, NBR 5410, splits por pavimento, trava) — 93 conferências, aprovado. Uma página nova por
  rodada (a mesma aba recarregada caía com "Page crashed").
- **O que o portão do sobrado a 30° achou e foi corrigido:**
  - um toco de água a 2,10 m raspava 1 cm do pilar girado: o chuveiro estava na quina, dentro da
    pegada crescida do contorno. O encosto da água agora tira o ponto de dentro do anel do pilar
    (escorrega pela parede, `foraDoPilar`) — só o ponto SUGERIDO; o que a pessoa pôs não se move e a
    verificação acusa (decisão do E5.5, teste mantido) —, e o toco do eixo à face contorna o pilar (`desvioDoPilar`);
  - "o núcleo come boa parte da Sala" saía SEM SOLUÇÃO com a sala ainda acima do mínimo: agora a área
    que sobra é medida no desenho — acima do mínimo do programa vira CONFERIR (com quanto sobrou), abaixo
    continua SEM SOLUÇÃO.
- **Conferência no app real (15/10/2026, senha do agente-leitura dada pelo usuário):** `c:/tmp/pwtest/conferencia-sobrado.cjs`
  — estudo DESCARTÁVEL arquivado no fim. Aprovada: a tela abre com "térrea ou sobrado"; os campos do sobrado
  só aparecem no sobrado; "Sobrado" sobrevive a recarregar (`blueprint_study_casa`); a prévia sai com as 22
  etapas, 11 de 11 ambientes, 220 m², escada em U de 17 × 171/306 mm, 34 circuitos, 4 splits; "Lançar os dois
  pavimentos" grava, e o rascunho tem Térreo (12 paredes, 26 pilares) e Pavimento superior a 2,90 m (11 paredes,
  25 pilares), 1 escada, 2 shafts, telhado; sem erro de página, console ou HTTP.
- **ACHADO na conferência: a PRESSÃO.** O desenho mostrava selos de pressão NEGATIVA. Medido (12 × 30): na
  TÉRREA, a água quente sai com −27 a −65 kPa em todos os pontos (a caixa a 3,20 m entrega 12,4 kPa ao aquecedor,
  que perde 20); no SOBRADO, até a água fria dos pontos de cima fica abaixo do mínimo (a caixa só 1,1 m acima dos
  chuveiros de cima). Por gravidade, essa altura de caixa não vence — é decisão de projeto: caixa elevada (torre)
  ou pressurizador. Nada dizia isso: a casa agora confere `pressoesDoModelo` no fim da hidráulica e põe uma
  pendência VERIFICACAO por rede ("Pressão da água quente: N ponto(s) abaixo do mínimo — o pior … eleve a caixa
  … ou preveja um pressurizador"), e o resumo ganhou `hidraulica.pressaoInsuficiente`. A correção espera a
  decisão do usuário.

## F13 — pressão da água: caixa elevada ou pressurizador (15/10/2026)

Pergunta feita ao usuário depois do achado da pressão: *"Como a casa automática deve garantir a pressão da
água (térrea e sobrado)?"* — resposta: **"Escolher por caso"** (o motor tenta a caixa elevada até uma altura
máxima, hipótese editável, e, se não bastar, lança o pressurizador).

O desenho:
- **Cálculo de pressão** (`blueprintPressaoDaRede`): o PRESSURIZADOR é um terminal `BOMBA` (água fria) a até
  600 mm da caixa d'água, no mesmo pavimento — na saída dela; soma `ganhoDoPressurizadorKpa` (hipótese nova
  das premissas de pressão do estudo, padrão 100 kPa) à carga de partida da rede fria. A quente herda pelo
  aquecedor. Sem mudança no kernel.
- **Casa** (`HipotesesDaCasa.pressao`: `caixaElevadaAteMm` 2000, `potenciaDoPressurizadorW` 370): antes da
  etapa ÁGUA, simula a água como está e mede o maior déficit (fria e quente); se elevar a caixa até o máximo
  cobre, eleva (e confere de novo); senão, põe o pressurizador na saída da caixa ANTES de traçar (o ajuste de
  DN por pressão já conta com ele). O pressurizador ganha o ponto elétrico (ligação direta) e o circuito.
  O que ainda faltar continua na pendência de pressão.
- **Tela**: "Elevar a caixa até (m)" e "Pressurizador (W)" nas hipóteses; o ganho, no painel de pressões.

### Registro da F13 (15/10/2026)

Feito como planejado acima. Medido (12 × 30, R1-N):

| Caso | Déficit antes | Solução | Pior ponto depois (fria / quente) |
|---|---|---|---|
| Térrea, limite 2 m (padrão) | 7,62 m | pressurizador +100 kPa, 370 W | 83,3 / 26,7 kPa |
| Sobrado, limite 2 m | 5,63 m | pressurizador | 71,3 / 39,0 kPa |
| Térrea, limite 10 m | 7,62 m | caixa elevada 9,35 m | 67,8 / 11,3 kPa |

Nenhum ponto abaixo do mínimo nem acima da estática máxima; a trava confere o lote; NBR 5410 sem falta (o
pressurizador ganha ligação direta e circuito). Achado no caminho: subir a caixa 1 m rende ~0,9 m (o ajuste de
diâmetro muda junto) — a 1ª versão desistia depois de 2 tentativas e caía no pressurizador com o limite sobrando;
agora até 5, a última no limite, e com o déficit acima do limite vai direto ao pressurizador. O ganho do
pressurizador é hipótese da pressão do ESTUDO (painel "Pressões da água" e memorial — só quando a bomba está na
saída da caixa; a de recalque não conta). Harness: 97 conferências, com "pressão: nenhum ponto abaixo do mínimo"
nas quatro rodadas.

## F14 — compatibilização das redes · F15 — a casa na unidade do Empreendimento (15/10/2026)

Pedido do usuário (sobre os próximos passos propostos depois da F13):

> 1. a compatibilização geral das redes (cruzamentos entre si, com vigas e com portas e janelas), que vale para
>    as duas casas: de acordo
> 2. o adaptador que leva a casa para a unidade do Empreendimento: de acordo

### Retrato medido (12 × 30, R1-N, com catálogo de evaporadoras e chuva) — `conflitosDoModelo`

| | Térrea | Sobrado |
|---|---|---|
| Total | 217 | 234 |
| REDE × REDE (eixos mais perto que a soma dos raios) | ~150 | ~100 |
| Passagem pela LAJE (prumadas) | 25 | 63 |
| VIGA e baldrame | 23 | 35 |
| Porta e janela | 15 | 21 |

As causas dos encontros REDE × REDE, classificadas pela geometria:
- água fria e quente no MESMO eixo: os ramais correm pelas mesmas paredes na mesma cota (2,20 m), e os pontos
  da mesma louça coincidem (9 / 31 pares paralelos; 6 / 10 verticais no mesmo ponto);
- a ventilação, que agora sobe na parede, cruzando os ramais de água da mesma parede (15 no sobrado);
- eletroduto e frigorígena na MESMA cota sob a viga, cruzando-se (17 / 5); água fria e eletroduto também;
- dreno do ar descendo em caimento e cruzando a frigorígena várias vezes (≈ 60 na térrea);
- o ramal a 2,20 m é exatamente o topo da janela (o tubo conta como dentro do vão).

Entre o topo da janela (2,20 m) e o fundo da viga (2,30–2,40 m na térrea) sobram 10–20 cm para cinco redes —
separar só por cota não cabe. A convenção de onde cada rede corre é decisão do usuário (perguntada em 15/10).

**Decisão do usuário (15/10/2026):** *"Para compatibilizar as redes, qual convenção de onde cada rede corre a casa
automática deve seguir?"* → **"Forro com faixas"** — forro rebaixado nos ambientes por onde as redes correm, com
plenum onde eletroduto, frigorígena, dreno e água correm em FAIXAS de cota próprias; nas paredes, cada disciplina
com o seu afastamento lateral. O forro já existe no kernel (acabamento do ambiente: `forro { camadas, rebaixoMm }`)
— sem mudança no kernel.

### Fases (cada uma com "pode seguir")

- **F14a — pontos e faixas na parede.** Os pontos da mesma louça separados (água fria e quente do misturador
  lado a lado; o esgoto deslocado); afastamento lateral por disciplina nos trechos que correm DENTRO da parede
  (fria, quente, ventilação). Alvo: nenhum par vertical no mesmo ponto, nenhum par paralelo na mesma cota.
- **F14b — forro e plenum.** A casa lança o forro de gesso (acabamento) nos ambientes por onde as redes
  horizontais passam, com o pé-direito livre acima do mínimo do uso (hipóteses: 2,50 m habitável; 2,30 m banheiro,
  serviço e circulação); as faixas de cota do plenum por disciplina (eletroduto, frigorígena e dreno, água quente,
  água fria) entram nas hipóteses de cada planejador. Ramais acima do topo das janelas. Alvo: nenhum cruzamento na
  mesma cota entre disciplinas; nenhuma rede no vão de porta ou janela.
- **F14c — vigas.** O que ainda cruza viga vira FURO PREVISTO (posição, diâmetro, a viga) — pendência para o
  calculista com a lista —, e o que dá para passar sob a viga passa.
- **F14d — linha do ar e dreno lado a lado; provas** (harness com a compatibilização; app real).
- **F15 — a casa na unidade do Empreendimento.** O adaptador `blueprint` do sincronismo (hoje: loteamento →
  quadras e lotes) passa a reconhecer a CASA no snapshot publicado: 1 torre, 1 unidade com área privativa,
  dormitórios, suítes, banheiros, vagas e o padrão — o caminho inverso de `programaCurtoDaUnidade` (F10).

### Registro da F14a (15/10/2026) — pontos e faixas na parede

Pedido: "Forro com faixas" (decisão acima); a F14a cuida do que corre DENTRO da parede.

- **Pontos da mesma louça separados:** fria e quente do misturador lado a lado, ao longo da parede, afastadas de
  `afastamentoFriaQuenteMm` (hipótese dos pontos, padrão 150 mm) — em `pontosDaLouca` e em `planejarPontosDoAmbiente`
  (com um irmão já lançado, o novo fica no afastamento inteiro).
- **Faixas por disciplina na parede:** a água quente roteia por paredes deslocadas de `faixas.aguaQuenteMm`
  (padrão +45 mm) e o esgoto/ventilação por `faixas.esgotoMm` (padrão −60 mm) — hipóteses da casa, passadas aos
  planejadores como `faixaDaAguaQuente` / `faixa`. No shaft, a posição é a do shaft + faixa × `FAIXA_NO_SHAFT` (1,5).
  O traçado é FEITO na faixa (com pilares e vigas reais); a 1ª tentativa, transladar depois de traçar, punha tubo
  dentro de pilar e ventilação baixa — descartada.
- **Ventilação** (`ondeAColunaSobe`): desvia de pilar, viga, porta/janela e agora também dos tubos das OUTRAS redes
  (desliza 0/±100…±400 mm ao longo da parede até achar livre).
- **Encosto em pilar:** ponto SUGERIDO que caía no anel do pilar sai para fora dele (o do usuário não se mexe); o
  toco do eixo à face contorna o pilar.
- **Coluna de água atravessando pavimento:** procura a parede em comum dos dois pavimentos até 3 m
  (`ALCANCE_DA_PAREDE_EM_COMUM_MM`) — no sobrado a 30° a coluna de AF da Suíte subia no meio do cômodo.
- Água: corrigido o trecho que faltava no nível da origem quando os pontos ficam acima dela (pontas soltas após o
  barrilete descer para baixo do forro).

Medido (`conflitosDoModelo`, 12 × 30, R1-N, catálogo e chuva):

| Casa | Antes | Depois da F14a |
|---|---|---|
| Térrea | 217 | 189 |
| Sobrado | 234 | 162 |

Provado nos testes (térrea e sobrado): nenhuma prumada de disciplinas diferentes no mesmo ponto e sobreposta em
altura; fria e quente de cada louça a mais de 10 cm; na térrea, nenhum encontro entre água e esgoto vertical. Nenhuma
marca ERRO na verificação. O que sobra é, em maioria,
coincidência de COTA (eletroduto × frigorígena, AF × eletroduto, ramais de AF e AQ na mesma cota) — é a F14b — e 3
encontros dentro dos shafts do sobrado. Harness: 97 conferências, portão aprovado nas quatro rodadas (térrea e
sobrado, 0° e 30°).

## F14b — forro e plenum (16/10/2026, "sim" para seguir)

### Retrato antes da F14b (12 × 30, R1-N, catálogo e chuva) — onde cada rede corre

| | Térrea | Sobrado |
|---|---|---|
| Pé-direito | 2,80 m | 2,80 m (os dois pavimentos) |
| Fundo das vigas | 2,30–2,50 m | 2,20–2,50 m (transição 2,20 m, 55–60 cm de altura) |
| Topo de janela / porta | 2,20 / 2,10 m | 2,20 / 2,10 m |
| Água fria / quente (horizontal) | 2,20 / 2,25 m | 2,20 / 2,20–2,25 m |
| Eletroduto e linha frigorígena | 2,20 m | 2,10 m |
| Dreno do ar | nasce a 2,20 m e desce | idem |
| Largura das vigas | = espessura da parede (150 / 200 mm), sobre a parede | idem |

Todos usam a mesma regra ("10 cm abaixo da viga mais baixa"), daí a mesma cota. Conflitos (térrea 185 /
sobrado 162): dreno × frigorígena 69 / 4, eletroduto × frigorígena 17 / 5, dreno × eletroduto 14, água × eletroduto
7+; no sobrado água fria × quente 14 (as grades deslocadas da F14a se cruzam na mesma cota) e água dentro das
vigas de transição (fundo 2,20 m).

### Decisão do usuário (16/10/2026)

Pergunta: *"Medido na casa gerada: pé-direito 2,80 m; o fundo das vigas fica a 2,30–2,50 m (2,20 m nas vigas de
transição do sobrado); as janelas vão até 2,20 m. Com o forro no mínimo do uso (2,50 m nos cômodos de permanência,
2,30 m nos molhados), o forro fica na altura ou ACIMA do fundo de TODAS as vigas: não sobra espaço livre entre o
forro e as vigas em cômodo nenhum. Como a casa deve resolver?"*

Resposta: **"Manter 2,80 m, furar vigas"** — forro entre as vigas (vigas aparentes abaixo dele), redes em faixas
de cota no plenum acima do forro; cada passagem por viga vira furo previsto (posição, diâmetro, viga) na lista
para o calculista (F14c), inclusive a descida de cada ponto (pela viga ou junto dela num caixote de gesso).
Descartada: subir o pé-direito para ≈ 3,20 m (3,30 m no sobrado).

### Registro da F14b (16/10/2026) — o forro e as redes nas faixas do plenum

Feito na convenção decidida ("forro com faixas" + "manter 2,80 m, furar vigas"). Tudo novo fica atrás de uma opção
(`noForro`) dos planejadores — o "Lançar tudo" das gavetas do editor não muda; só a casa liga.

**A peça nova — `utils/blueprintRotaPeloForro.ts`:**
- `paredesDoForro(model, nível, afastamento)`: as "paredes" por onde a árvore anda no forro — o anel de cada cômodo
  recuado da face da parede (ou da viga, se mais larga) mais o afastamento da rede, e TRAVESSIAS de um cômodo ao
  vizinho no meio do trecho de parede que eles dividem e perto das duas pontas (com uma só, no meio, a quente do
  sobrado andava 17 m num térreo de 5 m). Os lados colineares do anel juntam-se antes de recuar: o encontro em T
  deixa no anel um pedaço de 2 cm que, recuado 12 cm, virava do avesso e recusava o cômodo inteiro (10 de 12).
- `descidaDoForro`: do anel até a peça — desce junto da viga (no caixote de gesso), entra na parede logo abaixo
  dela (folga + raio), desce na alvenaria; a que cairia num vão de porta/janela corre acima dele até o batente.
- `prumadasQueCruzam`: o que vai atravessar a faixa vira obstáculo para quem traça DEPOIS — as prumadas das outras
  redes, a luz de teto e o quadro (o eletroduto vai subir deles) e o SHAFT do pavimento.
- `encaixaNoAnel`: o ponto encaixa só no anel (a travessia é passagem — encaixado nela, a fria e a quente desciam
  no mesmo lugar). Contorno de obstáculo com penalidade pequena no forro (`PENALIDADE_DO_CONTORNO_NO_FORRO_MM`).

**As faixas** (hipóteses da casa, `forro`; abaixo da laje / afastamento da face): eletroduto 45/50 mm, linha
frigorígena 115/140, água quente 170/200, água fria 202/250. O espaçamento em cota é a soma dos MAIORES raios das
duas redes vizinhas + 5 mm (a conferência mede o tubo como esfera: a linha, com os dois tubos lado a lado, conta 39
mm); o lateral, maior que a soma dos raios (a descida de uma não cruza o ramal da outra). Rebaixo do forro 23,3 cm →
forro a 2,553 m (gesso) / 2,559 m (PVC nos molhados) → **pé-direito livre 2,503 m** com 5 cm de piso (mínimo 2,50).

**Planejadores:** água (ramais e barrilete no forro; fria antes da quente, em sequência, para a quente ver as colunas
da fria; a cabeça de grupo sem altura fica no anel, sem toco solto; a ligação da coluna ao anel desvia das prumadas);
eletrodutos (pontos de parede pelo anel, descida no rasgo da caixa — no eixo corre o dreno —, luz pendurada no nó mais
perto, reta desviando das prumadas); linha frigorígena (sai da evaporadora para o anel e sobe ali). **Casa:** etapa
FORRO (acabamento do cômodo por `SetSpaceLabelProps`, gesso / PVC nos molhados, pé-direito livre conferido pelo uso —
2,50 m sala, dormitório, suíte, cozinha, escritório; 2,30 m os demais), luz de teto na face do forro, quadro escorregando
pela parede para longe das travessias, tomada longe do ponto de água. **Âncoras:** aquecedor fora do vão (40 cm do
batente, caindo à metade até 15 cm) e fria/quente lado a lado (15 cm). **Pontos da louça:** o par escorrega JUNTO para
fora do pilar; a louça longe da parede (60 cm, pelo mobiliário) toma a direção da parede mais perto (fria e quente
nasciam no mesmo ponto). **Tela:** "Forro com as redes no plenum", pé-direito livre por uso, piso acabado.

**Medido** (`conflitosDoModelo`, 12 × 30, R1-N, catálogo e chuva):

| | Térrea antes | Térrea depois | Sobrado antes | Sobrado depois |
|---|---|---|---|---|
| Rede × rede | 117 | 1 | 28 | 13 |
| Porta / janela | 15 | 6 | 27 | 9 |
| Estrutura (viga, laje, baldrame, pilar) | 53 | 85 | 107 | 142 |
| Total | 185 | 92 | 162 | 164 |

Nas quatro casas (térrea e sobrado, 0° e 30°): **nenhum encontro entre eletroduto, linha e as duas águas**, nenhum
ERRO da verificação de rede (pontas abertas zeradas), pressão atendida (com pressurizador) e a trava aprovando. O que
sobra é da F14c/F14d: a térrea, 1 alimentador × esgoto enterrado (anterior); o sobrado, 13 do ESGOTO do pavimento de cima
correndo no plenum do térreo (cruza as faixas de água); as aberturas são do dreno do ar (F14d) e 3 anteriores no
sobrado; a estrutura subiu porque a travessia da viga é agora FURO A APROVAR (aviso CRUZA_VIGA da verificação — 10 a 12
por casa), a lista que vai ao calculista na F14c. O harness conta essas travessias e não reprova por elas.

⚠️ **A máquina desta sessão ficou instável** (16/10): o Windows registrou 4 desligamentos inesperados de manhã
(Kernel-Power 41, 05:36–05:58) e, depois, o Node 24 e o Node 22 caíram em quase toda execução longa (segfault,
"Fatal error" do V8), o Chrome do harness deu "Page crashed" e chegou a dar um resultado ERRADO que não se repetiu (a
água "não rodou" uma vez a 30°; na rodada seguinte, lançou 178 tubos). O `tsc` caiu até no commit anterior, sem
mudança. Por isso a prova de tipos, da suíte inteira e do build desta fase é a CI do GitHub (Linux), rodada numa PR de
rascunho antes da publicação.


## F14c — furos nas vigas e o esgoto do pavimento de cima (16/10/2026, "sim" para seguir)

### Retrato (12 × 30, R1-N, 0°)

| | Térrea | Sobrado |
|---|---|---|
| Furos (trecho × viga e baldrame) | 69 | 89 |
| Diâmetro acima de 12 cm ou h/3 | 0 | 0 |
| A menos de 2h do apoio | 36 | 62 |
| Seções com mais de um furo | 4 | 8 |

O esgoto do pavimento de cima: 27,2 m correndo no forro do térreo (2,56–2,75 m), sobre garagem (14,5 m), área de
serviço (7,2 m) e cozinha (5,5 m). Causa: o esgoto põe UM tubo de queda por pavimento (no ponto de maior UHC) e o
banheiro da suíte de cima despeja nele a ~7 m, na diagonal; o banheiro da suíte nem ganhou shaft (`shaftsDoSobrado`
exige parede do térreo embaixo da face, e ele fica sobre a área de serviço).

### Decisão do usuário (16/10/2026)

Pergunta: *"Mesmo curto (~1–2 m, depois de pôr o tubo de queda colado em cada banheiro de cima), o esgoto dos
banheiros do pavimento superior precisa correr por baixo do piso deles até o tubo de queda, com caimento, em tubo de
100 mm. Por onde?"* — Resposta: **"Laje rebaixada"** (a laje sob cada banheiro de cima desce ~25 cm; o esgoto corre
no enchimento do piso até o tubo de queda; nada no forro do térreo, nenhum furo de 100 mm em viga; o calculista
confere). Descartadas: faixa do esgoto no forro do térreo; piso elevado com degrau.

### Escopo

1. **Um tubo de queda por banheiro de cima**, no shaft colado nele (o esgoto agrupa as peças por proximidade; o
   sobrado dá shaft a todo banheiro de cima — sem parede do térreo embaixo, o shaft é caixa no canto do cômodo de
   baixo, se ele for garagem, serviço ou circulação).
2. **Laje rebaixada** sob cada banheiro de cima (hipótese `rebaixoDaLajeDoBanheiroMm`, 250): a laje do térreo é
   recortada em volta do banheiro e a peça do banheiro desce; o esgoto de cima fica no enchimento; o forro do cômodo
   de baixo desce até caber sob ela (pé-direito livre conferido); as redes do térreo contornam a área rebaixada.
3. **Furos previstos** — a lista para o calculista (viga, rede, diâmetro do furo, cota, posição ao longo da viga,
   distância ao apoio) com os critérios que dispensam a verificação (NBR 6118, 13.2.5.1: furo ≤ 12 cm e ≤ h/3, a ≥ 2h
   da face do apoio, furos a ≥ 2h entre si) como HIPÓTESES — "dispensa" ou "verificar com o calculista"; a tela mostra
   a lista. As travessias do forro saem da zona de 2h junto do apoio quando a parede comporta.

### Registro da F14c (16/10/2026) — furos para o calculista, laje rebaixada, um tubo de queda por banheiro

**Furos previstos** (`utils/blueprintFurosPrevistos.ts`): cada passagem de rede por viga, baldrame ou laje (os
encontros ESTRUTURA de `conflitosDoModelo`) vira um furo — peça, rede, direção (atravessa / desce), diâmetro (o tubo
com o isolamento e 1 cm de folga em volta), cota, posição ao longo da viga e distância à face do apoio (pilar ou ponta).
Os critérios da NBR 6118 (13.2.5.1) são HIPÓTESES (`HIPOTESES_DOS_FUROS_PADRAO`): Ø ≤ 12 cm e ≤ h/3, a ≥ 2h do apoio,
furos a ≥ 2h entre si; fora deles, "verificar com o calculista" com o motivo — nunca "proibido". Na laje, a passagem é
listada sem critério. **Tela:** "Furos previstos para o calculista" (`TabelaFurosPrevistos.tsx`, StandardTable com
busca) e a contagem no relatório. As travessias do forro saem da zona de 2h junto do apoio quando a parede comporta.

**Laje rebaixada** (decisão "Laje rebaixada"): a laje do térreo desce 22 cm (`rebaixoDaLajeDoBanheiroMm`) sob a área
molhada de cada banheiro de cima — o retângulo das peças de esgoto de cada grupo com 60 cm de margem
(`margemDoRebaixoMm`), recortado pelo banheiro e esticado até a FACE do shaft do grupo, sem cobri-lo (o esgoto entra no
shaft pela face; a água do térreo chega às colunas pelos outros lados — com o shaft dentro, sob a laje rebaixada sobram
3 cm de plenum). As peças ainda não existem na etapa da laje: são previstas rodando mobiliário, louças e kit dos DOIS
pavimentos numa cópia (determinístico). A 22 cm a laje ainda fica acima do forro do térreo, que não desce; o que fica
embaixo dela foge: o aquecedor, a luz de teto (30 cm além da borda) e as redes do forro (obstáculo).

**Um tubo de queda por banheiro de cima** (escopo 1): o esgoto agrupa as peças de cima a até 2,5 m
(`grupoDoTuboDeQuedaMm`) e no MESMO cômodo; cada grupo ganha o shaft dele (`shaftDoGrupo`): o que já está dentro do
banheiro a até 2 m (`shaftAteAsPecasMm`), senão um novo junto das peças — fora de peça e de móvel já postos; o tubo de
queda busca o shaft até 4 m (`tuboDeQuedaAteOShaftMm`: no banheiro comprido da suíte, o vaso e o lavatório tomam a
ponta e o shaft fica a 3,5 m). A perna de ventilação de cima fica dentro da laje rebaixada.

**Compatibilização** (o que a mudança de lugar das travessias e a laje rebaixada trouxeram de volta, e o que a medição
de cada caso expôs):

- a descida do forro entra na parede em ÂNGULO RETO e corre nela até o ponto (antes, diagonal pendurada no cômodo); o
  nó escorrega pelo contorno quando a descida cruzaria um tubo de outra rede ou um vão (`descidaDoForro` com a rede);
- cada rede entra na parede no seu DEGRAU abaixo da viga (`degrauNaParedeMm` na faixa: elétrica 0, fria 6 cm,
  quente 12 cm) — no mesmo degrau, a fria cortava a face da parede a 8 mm do eletroduto da tomada;
- no forro, a fria é traçada antes da quente (o sobrado tinha o aquecedor antes da caixa na ordem do modelo);
- o tubo de queda e a ventilação no shaft ficam onde nenhum tubo de outra rede passa (`lugarNoShaft`: a faixa e as
  três posições giradas; nenhuma livre, a de maior folga);
- o dreno do ar desvia das prumadas das outras redes; a tomada fica longe delas; o coletor do box sai de dentro do
  shaft; o aquecedor fica fora do shaft e da laje rebaixada;
- o anel do forro perde o DEDO estreito do contorno antes de recuar (`semDedosEstreitos`): a sala do sobrado a 30° tem
  uma fresta de 25 cm entre duas paredes, ficava sem forro, e a quente ia em reta de 9,6 m pelo plenum.

- a laje rebaixada é feita por GRUPO de tubo de queda e por banheiro que ele toca, e com as peças em volta do shaft
  uma área por FACE dele (`zonasMolhadasDoBanheiro`): no banheiro comprido da suíte (caixa sifonada numa ponta, vaso
  na outra) e com as peças em "L" em volta do shaft, uma área só o engolia; o tubo de queda agrupa só peças do MESMO
  cômodo, e grupos que caem no mesmo ponto do shaft viram um (dividiam a cota da raiz: o ramal DN 50 saía a 1,1 %);
- sob a laje rebaixada não há plenum: a coluna de água sai dela (o shaft engolido não serve à água; a coluna na
  parede escorrega para fora), a luz de teto sai 30 cm além da borda, a tomada foge da parede sob ela, o aquecedor
  também (sem lugar longe da janela, ao menos fora dela); o encaixe no anel tenta as outras paredes quando a mais
  perto está toda bloqueada, e a coluna só liga ao anel se alguma peça encaixou nele (senão, ponta aberta);
- PRESSÃO: o ajuste de diâmetro corre rede a rede sobre o modelo com as anteriores — o da quente rodava sem a fria
  ("a rede fria não chega ao aquecedor") e nunca aumentava nada; sem ele, o chuveiro de cima ficava abaixo do mínimo
  mesmo com o pressurizador. E quando o pressurizador sozinho não basta, a caixa sobe junto, até o limite (dito).

**Medido** (`conflitosDoModelo`, 12 × 30, R1-N, catálogo e chuva; uma casa por processo):

| | Térrea 0° | Térrea 30° | Sobrado 0° | Sobrado 30° |
|---|---|---|---|---|
| Rede × rede | 1 | 9 | 0 | 0 |
| Esgoto de cima fora da laje rebaixada | — | — | 0 | 0 |
| Furos em viga (dispensam / a verificar) | 47 (11 / 36) | 43 (12 / 31) | 82 (7 / 75) | 94 (11 / 83) |
| Furos em baldrame · passagens em laje | 23 · 13 | 19 · 13 | 11 · 52 | 11 · 48 |
| Pressão (déficit sem correção → solução) | 2,85 m → pressurizador | 3,90 m → pressurizador | 6,97 m → pressurizador | 3,57 m → pressurizador |

O que sobra nas térreas é o ALIMENTADOR enterrado (−0,30 m, reta do hidrômetro à subida) cruzando o esgoto do térreo
— anterior à F14c (a F14b registrou o da térrea a 0°; a 30° não tinha sido medido; nem o alimentador nem o esgoto do
térreo mudaram aqui). A maior parte dos furos em viga fica "a verificar" pela distância ao apoio (a parede comum entre
dois cômodos é curta e os pilares estão nos encontros) e pelos furos vizinhos — é a lista para o calculista decidir.

⚠️ A máquina seguiu instável (segfault / "Fatal error" do V8 em parte das execuções; o pool `threads` do Vitest
aguenta melhor que o `forks`) e deu UM resultado errado (o sobrado a 30° com 0 encontros e metade dos furos — a rodada
seguinte, com o mesmo código, deu o resultado real): número que muda muito sem mudança de código se confirma de novo.

**Publicado** em 16/10/2026: `f95aa616` na main (rebase sobre a main; antes, a PR de rascunho #10 rodou a CI — 967
arquivos de teste, tipos e build; o 1º push pegou 2 erros de tipo que o `tsc` local, caindo por segfault, não mostrou).
Check-run `ci` da main verde; o domínio serve um commit que contém este, com "Furos previstos para o calculista" no
bundle. Harness: 103 conferências, nenhuma reprovada (térrea e sobrado, 0° e 30°).

## F14d — a linha do ar e o dreno lado a lado; provas (16/10/2026, "sim" para seguir)

### Retrato (12 × 30, R1-N, catálogo e chuva) — antes

| | Térrea 0° | Térrea 30° | Sobrado 0° | Sobrado 30° |
|---|---|---|---|---|
| Rede × rede | 1 (alimentador) | 9 (alimentador) | 0 | 0 |
| Dreno passando por janela | 6 | 6 | 6 | 3 |
| Água passando por porta ou janela | 0 | 4 | 7 | 9 |
| Dreno a até 30 cm da linha frigorígena | 19 % | 20 % | 49 % | 70 % |

Na térrea a 0°, 3 das 4 evaporadoras ficam em parede INTERNA: a regra do split prefere a parede externa, mas só num
trecho livre de janela — a fachada cheia de janelas a manda para dentro. A linha sobe ao forro e vai quase reta à
condensadora (4 m); o dreno, que sai da evaporadora a 2,20 m e só pode descer, corre embutido nas paredes a ~2,15 m
por até 9,6 m até a fachada — na altura das janelas (1,00 a 2,20 m) — e cai em diagonal até o ponto de dreno.

### Decisão do usuário (16/10/2026)

Pergunta: *"Para a linha frigorígena e o dreno do ar correrem juntos (F14d), qual convenção a casa automática
segue?"* — Resposta: **"Evaporadora na parede externa"** (a evaporadora sempre na parede externa do cômodo, mesmo
sobre a janela, a 2,20 m acima da verga; linha e dreno saem JUNTOS pela parede, ao lado dela, e descem lado a lado
pela fachada até a condensadora e o ponto de dreno; cômodo sem parede externa cai na bomba de dreno). Descartadas:
bomba de dreno e forro em todo split fora da parede externa; dreno embutido sob o peitoril.

### Registro da F14d (16/10/2026) — a linha do ar e o dreno lado a lado

**Posição do split** (`OpcoesDaPosicaoDoSplit.naParedeExterna`, ligada pela casa): a evaporadora vai para a parede
EXTERNA do cômodo mesmo sobre a janela — sobe até a base passar da verga, com o topo abaixo do forro
(`climatizacao.folgaDaEvaporadoraAoForroMm`, 30) — com uma faixa de parede cheia de 20 cm a até 40 cm além da ponta
dela (a saída); sem parede cheia (o lado inteiro é janela: a suíte de cima do sobrado), a saída é atrás dela, acima
da verga. A condensadora fica do lado de fora, sob a saída.

**Linha e dreno** (`saidaPelaParede`, `planejarLinhasFrigorigenas(..., { pelaParedeExterna })`): os dois atravessam a
parede juntos, a 12 cm um do outro, fora de vão, de pilar e longe das prumadas das outras redes; o dreno desce 8 cm
sob a evaporadora antes de ir para a parede (a linha sai na cota dela) e, por fora, corre 12 cm mais afastado da
fachada; saindo acima da janela, os dois correm até além do batente e só então descem lado a lado — a linha até a
condensadora, o dreno até um ponto de dreno ao pé da fachada, por gravidade. Sem saída direta (evaporadora em parede
interna, condensadora longe), a regra de antes.

**De quebra** (o que a medição expôs): a subida do alimentador sai do vão de todo pavimento que atravessa (subia pela
janela alta do banheiro de cima); o aquecedor tenta o outro cômodo candidato e, com a parede externa toda tomada
(janela, shaft, laje rebaixada), uma parede interna fora do vão e do pilar, com o duto de exaustão dito na pendência;
a coluna de água escorrega pela parede inteira para fora do vão.

**Medido** (12 × 30, R1-N, catálogo e chuva):

| | Térrea 0° | Térrea 30° | Sobrado 0° | Sobrado 30° |
|---|---|---|---|---|
| Dreno a até 30 cm da linha (antes → depois) | 19 % → 100 % | 20 % → 100 % | 49 % → 100 % | 70 % → 100 % |
| Dreno em porta ou janela | 6 → 0 | 6 → 0 | 6 → 0 | 3 → 0 |
| Linha + dreno, comprimento | 54,0 → 24,1 m | 54,4 → 23,6 m | 32,4 → 24,6 m | 30,8 → 24,0 m |
| Encontros linha × dreno | 0 | 0 | 0 | 0 |

Harness: 107 conferências, nenhuma reprovada (as quatro novas da F14d: dreno junto da linha ≥ 95 %, nenhum dreno em
vão, nenhum encontro linha × dreno).

**Pendência fora da F14 (mobiliário):** a água ainda entra em PORTA em três casas porque a louça está encostada na
parede da porta, dentro do vão dela (o vaso do banheiro social de cima no sobrado a 0°; o chuveiro e o lavatório
junto da porta nas casas a 30°) — o mobiliário põe a peça diante da porta; a rede só denuncia. Já estava no retrato
antes da F14.

O teste da F14b ("o horizontal de cada rede, no forro, na cota da faixa dela") exigia um trecho da linha do ar na
faixa do forro; com a saída direta ela não sobe ao forro. Ele passou a aceitar, para a linha do ar, a saída na cota
da evaporadora quando TODAS saem pela parede — e continua reprovando qualquer horizontal entre a face do forro e a
laje fora da faixa, e qualquer encontro entre as quatro redes.

### Conferência da F14d no app real (16/10/2026)

Com a senha da conta de leitura (mandada pelo usuário em resposta ao pedido de senha + OK para a planta descartável),
`c:/tmp/pwtest/conferencia-f14d.cjs` cria uma planta DESCARTÁVEL com o lote 12 × 30 e a FRENTE, gera pela tela, lança,
lê o rascunho gravado e arquiva no fim (numa aba nova, se a página cair).

**Achado:** na térrea do app (a casa da organização é outra que as do harness: catálogo e premissas do estudo), a
evaporadora da suíte foi para a parede INTERNA, na cota antiga, e o dreno desse caminho antigo descia pela fachada em
cima da janela (3 de 4 pela parede; dreno junto da linha 52 %; 2 drenos em vão). Causa: a CAMA encostada na parede
externa ocupava a parede como se fosse um armário (sobravam 78 cm para uma evaporadora de 90 cm). Correção: na escolha
da parede externa, o MOBILIÁRIO cujo topo fica abaixo da base da evaporadora (cama, sofá, mesa) não ocupa a parede;
louça, bancada, armário e equipamento seguem ocupando (o vaso sanitário de 11/10). Teste novo em
`blueprintPosicaoSplit.test.ts`, que reprova sem a correção.

| App real (depois da correção) | Térrea | Sobrado |
|---|---|---|
| Linha do ar saindo direto pela parede | 4 de 4 | 4 de 4 |
| Dreno junto da linha | 100 % | 100 % |
| Dreno ou linha em porta ou janela | 0 | 0 |
| Encontros linha × dreno | 0 | 0 |
| Linha / dreno | 14,6 / 14,1 m | 12,2 / 12,5 m |

**Queda da aba no sobrado:** a página caiu ("Page crashed") em 4 de 7 gerações do sobrado, sempre logo depois da etapa
da água. O mesmo pedido no Node termina em 3,3 s (≤ 172 MB); o worker do DEV SERVER sozinho, sem o app, caiu 3 de 5; o
worker EMPACOTADO de produção, no domínio, com o mesmo pedido, terminou 5 de 5. É o modo dev desta máquina (a mesma
que derruba o Node e o `tsc`), não o app publicado.

**Fica (anterior à F14d):** quando a evaporadora não acha parede externa, o caminho antigo leva o dreno pelo forro e
a descida dele na fachada não desvia de janela (E5.4).

## F15 — a casa na unidade do Empreendimento (16/10/2026, "sim" para seguir)

Pergunta: *"Quando a casa gerada for sincronizada com o Empreendimento, em qual unidade ela deve cair?"* — resposta do
usuário: **"A escolhida na tela"**: a unidade usada em "Preencher pela unidade" fica gravada nas premissas do estudo;
o sincronismo atualiza ESSA unidade (área, dormitórios, suítes, banheiros, vagas, tipologia). Sem unidade escolhida,
cria a torre "Casa" com 1 unidade. Divergências vão para a Curadoria, como hoje.

Desenho:

- **Premissas:** `unidadeId` (padrão nenhuma). O seletor da tela vira "Unidade da casa": escolher preenche o formulário
  pela unidade (F10) e grava o vínculo; "Nenhuma" desfaz o vínculo sem mexer no formulário.
- **`utils/blueprintCasaNaUnidade.ts:unidadeDaCasa(modelo, padrão)`** — o caminho inverso de `programaCurtoDaUnidade`,
  medido no DESENHO PUBLICADO: área construída (face externa das paredes, soma dos pavimentos — `areaConstruidaMm2`),
  dormitórios (com as suítes), suítes, banheiros (sem o lavabo), vagas (`model.vagas`) e a tipologia ("Casa térrea
  R1-N" / "Sobrado R1-N", que `programaCurtoDaUnidade` lê de volta). `null` = o desenho não é uma casa (sem dormitório).
- **Adaptador `blueprint`:** sem lote na versão publicada e com casa → 1 torre + 1 unidade, a chave das duas = o `id`
  do estudo (as colunas de proveniência são UUID; uma casa por estudo, estável ao gerar de novo). A unidade escolhida
  (conferida no MESMO Empreendimento) e a torre dela são ADOTADAS pelo id — o planner ganha `adoptId`, ao lado da
  adoção por nome. A unidade adotada não é renomeada; área comum e total são do Empreendimento (só a privativa vem do
  desenho). Criada: torre "Casa", unidade "Casa", disponível.
- **Registro de campos `blueprint`:** + dormitórios, suítes, banheiros e vagas (o lote não os propõe; campo que a
  origem não preenche não vira proposta). A TIPOLOGIA ficou de fora, como no lote: na unidade adotada ela é texto do
  usuário (e é dela que o padrão CUB é lido) — comparada a cada sincronização, viraria conflito eterno. Ela entra só
  na unidade CRIADA ("Casa térrea R1-N").

### Registro da F15 (16/10/2026)

- `utils/blueprintCasaNaUnidade.ts` + `__tests__/blueprintCasaNaUnidade.test.ts` (térrea, sobrado, "não é casa", ida e
  volta com `programaCurtoDaUnidade`).
- Planner: `adoptId` na torre e na unidade canônicas, antes da adoção por nome; a entidade já vinculada a outro
  desenho não é tomada (a casa entra numa nova, e é dito). Casos novos em `blueprintEmpreendimentoSync.test.ts`
  (adoção pelo id com preenchimento e Curadoria, escolha vence nome, 2ª sincronização sem nada, vinculada a outro
  desenho, sem escolha → torre "Casa").
- Adaptador `blueprint`: `ladoDaCasa` (premissas de `blueprint_study_casa`; a unidade conferida no mesmo
  Empreendimento por duas consultas — sem embed). A auditoria diz "Casa da Planta Inteligente".
- Tela: "Unidade do Empreendimento desta casa" (com "Nenhuma" e "Unidade não encontrada"); premissas com `unidadeId`.

**Conferência no app real (16/10/2026, `c:/tmp/pwtest/conferencia-f15.cjs`; escrita autorizada pelo usuário: "sim" ao
Empreendimento descartável):** Empreendimento "ZZ TESTE Casa F15 (descartável)" ligado a uma planta descartável, torre
"Residencial ZZ" com a unidade "Casa 07" (só nome e tipologia "3Q R1-N"). Na tela, o seletor listou "Residencial ZZ ·
Casa 07"; a escolha sobreviveu a recarregar; gerar, lançar, publicar a versão; sincronizar: ensaio 0 torre / 0 unidade
novas, 1 atualizada; a "Casa 07" e a torre ficaram com a chave do estudo e com 156,45 m², 3 dormitórios, 1 suíte,
2 banheiros e 2 vagas — o que `unidadeDaCasa` mede na versão publicada; nome e tipologia intactos; sincronizar de novo
não muda nada; nenhuma proposta na Curadoria. Limpeza conferida no banco: estudo ARQUIVADO, Empreendimento e torre
apagados (unidades em cascata). Ficam, de propósito, os eventos da trilha de auditoria (sem FK, por desenho).

## F16 — louça diante da porta (16/10/2026)

Pedido do usuário (da lista de pendências depois da F15):

> Item 1

O item 1 da lista: *"Água passando por porta. O mobiliário encosta louça na parede da porta, dentro do vão, e o cano
da água atravessa o vão."*

### Retrato (sonda `conflitosDoModelo`, ABERTURA × água/esgoto; 12 × 30, R1-N)

| Casa | Cômodo | Peça na frente da porta | Ao longo da parede | Porta |
|---|---|---|---|---|
| Térrea 0° | — | nenhuma | | |
| Térrea 30° | Banheiro social | box | 5.980–7.210 | 6.353–7.153 |
| Térrea 30° | Banheiro da suíte | vaso | 4.759–5.522 | 4.553–5.353 |
| Sobrado 0° | Banheiro social (cima) | vaso e box | 100–1.400 | 650–1.450 |
| Sobrado 30° | Banheiro da suíte (cima) e lavabo | vaso | 4.959–5.722 · 722–1.484 | 4.753–5.553 · 853–1.653 |

A rede só obedece: o ponto da louça entra na parede atrás dela, dentro do vão. Duas causas no mobiliário
(`utils/blueprintMobiliario.ts`, que trabalha em retângulos alinhados a X/Y):

1. **Cômodo girado:** `aberturasNosLados` só projeta abertura de parede exatamente horizontal ou vertical — na casa a
   30°, NENHUMA porta é vista, nenhum giro é reservado, e as peças ainda nascem com rotação 0 (tortas no cômodo).
2. **Retângulo interno pela grade:** cômodo não retangular → `maiorRetanguloInterno` na grade de 100 mm; o lado dele
   chega a 120 mm do eixo da parede e a porta só era reconhecida até meia parede + 30 mm (105) — a porta sumia.

### Correção

- O mobiliário de cada cômodo é calculado no REFERENCIAL DO CÔMODO: o ângulo da aresta mais longa do anel (módulo
  90°); com ângulo, o cômodo, as paredes e as etiquetas giram para os eixos, o mesmo algoritmo roda, e as peças voltam
  giradas (centro e rotação = 0°/90° + o ângulo). `MobiliarioDoAmbiente.giro` diz o referencial; `PecaColocada.contorno`
  é a peça no MUNDO (a prévia do canvas desenha o polígono).
- A porta é reconhecida até meia parede + o passo da grade + 30 mm.
- No referencial girado sobraram dois testes EXATOS que a casa a 30° (vértices ao mm) não passava: a aresta do cômodo
  casava com a parede por produto vetorial < 1 (agora distância ≤ 5 mm, tolerância de arredondamento, e a parede
  COLINEAR de maior sobreposição — a aresta pode cobrir mais de uma parede alinhada) e a parede "horizontal" exigia
  |uy| < 1e-6 (agora ~1°). Sem isso, as peças nasciam no eixo da parede e a porta seguia invisível.
- **Água (efeito do mobiliário novo):** no sobrado, as louças fora da porta fizeram a coluna da QUENTE (que sobe do
  térreo) nascer no ponto em que a FRIA desce do barrilete — as duas escorregavam até o mesmo ponto rente à viga, ou
  até a mesma ponta da parede. A coluna agora desvia das prumadas e dos horizontais da outra água já traçada
  (`afastamentoEntreColunasMm`, hipótese, padrão 50 mm); rente à viga, o ponto do eixo que leva até a outra vira
  obstáculo e ela escorrega; sem lugar na parede, a quente fica na faixa dela (como no shaft, F14a).

### Registro da F16 (16/10/2026)

Medido (sonda `conflitosDoModelo`, 12 × 30, R1-N, catálogo e chuva; uma casa por processo, repetida quando a máquina
deu resultado que não se repetiu):

| | Térrea 0° | Térrea 30° | Sobrado 0° | Sobrado 30° |
|---|---|---|---|---|
| Água/esgoto em porta ou janela | 0 → 0 | 4 → **0** | 2 → **0** | 6 → **2** (aquecedor, abaixo) |
| Rede × rede | 1 → 1 | 7 → **4** | 0 → 0 | 0 → 0 |
| Peças de mobiliário | 23 → 22 | 19 → **22** | 25 → 25 | 21 → **25** |
| Peça entrando na parede | 0 | 0 | 0 | 0 |

- Térrea 0°, "Armário da suíte não coube" é ACERTO: a suíte tem porta no meio da parede sul (entrada) e no meio da
  norte (banheiro); antes, as duas eram ignoradas pela grade — a cama ficava diante da entrada e o armário de 2,40 m
  diante da porta do banheiro.
- Os rede × rede das térreas são o alimentador enterrado × esgoto (pendência à parte, item 3 da lista).
- Testes novos em `blueprintMobiliario.test.ts`: o banheiro girado 30° dá o mesmo mobiliário do reto, girado
  (equivariância, ± 3 mm), com o componente a 30°/120°; o banheiro em L com a porta no lado que a grade encolhe — os
  dois REPROVAM com o mobiliário antigo. A água é coberta pelo teste F14b do sobrado (nenhum encontro entre as redes do
  forro), que o mobiliário novo sem a correção da coluna reprovaria (3 encontros fria × quente).

**Fica (dito):** no sobrado a 30°, a quente do AQUECEDOR entra 5 cm na janela da cozinha. O aquecedor mudou de lugar
porque o mobiliário entra na simulação das áreas molhadas de cima (F14c: shafts e lajes rebaixadas), e ali a ligação da
quente é empurrada para outra face pelo encosto de ponto solto do traçado da água — as duas ligações ficam a 210 mm, fora
da direção da parede. Interação âncoras × água, para uma fase própria.

**Publicado** em 16/10/2026: `1c01e053` na main (antes, a PR de rascunho #15 rodou a CI inteira); check-run `ci` verde;
o domínio serve `1c01e05`.

## F17 — o aquecedor do sobrado a 30° e o alimentador × esgoto nas térreas (16/10/2026)

Pedido do usuário:

> implementar o que ainda falta: Sobrado girado 30° e Encontros de tubulação nas térreas

1. **Sobrado a 30°:** a quente do aquecedor entra 5 cm na janela da cozinha (registro da F16).
2. **Térreas:** o alimentador enterrado (−0,30 m, do hidrômetro à subida) cruza o esgoto enterrado — 1 encontro na
   térrea a 0° e 4 a 30° (registro da F16).

Pergunta: *"Como o alimentador (hidrômetro → caixa d'água) deve chegar à caixa, para não cruzar o esgoto enterrado?"*
— resposta do usuário: **"Sobe pela fachada"**: enterrado só do hidrômetro até a parede da frente da casa; sobe dentro
dessa parede até acima da laje e corre sobre a laje até a caixa. Nunca passa sob o piso: não cruza o esgoto nem o
baldrame.

### Registro da F17 (16/10/2026)

- **Alimentador pela fachada** (`HipotesesDeAlimentacao.subida`: 'FACHADA' | 'SOB_A_CAIXA', ausente = sob a caixa — a
  ferramenta do editor segue como era; a casa usa 'FACHADA', ou a premissa do estudo se houver). A subida é o ponto da
  parede mais perto do hidrômetro, fora de pilar e de vão de todo pavimento que ela atravessa; sem parede em cima no
  pavimento superior, volta a sob a caixa, dito. Enterrado só do hidrômetro à fachada (o pé ao lado do baldrame, F8c),
  sobe até a cota da boia e corre sobre a laje até a caixa.
- **Evaporadora × tomada:** com o alimentador fora do piso, os eletrodutos (o último traçado, sobre a casa inteira)
  mudaram, e na térrea a 30° a descida de uma tomada SOB a evaporadora cruzou o dreno. Na escolha da parede externa
  (F14d), os pontos elétricos e de água abaixo do topo do aparelho ocupam a parede com a folga da evaporadora — a
  descida deles vem do forro e atravessaria o aparelho.
- **Aquecedor:** sem trecho livre na parede externa, a parede INTERNA do cômodo (fora do vão, com o duto de exaustão
  até a fachada, dito — F14d) vem ANTES de "diante do vão": o aquecedor fica a 1,60 m, na altura da janela — diante
  dela, estaria no vidro e as ligações atravessavam o vão (a cozinha do sobrado a 30°, que tem uma só parede externa,
  de 2,45 m, com janela de 1,45 m).

Medido (sonda `conflitosDoModelo`, 12 × 30, R1-N, catálogo e chuva; duas rodadas idênticas):

| | Térrea 0° | Térrea 30° | Sobrado 0° | Sobrado 30° |
|---|---|---|---|---|
| Rede × rede | 1 → **0** | 4 → **0** | 0 → 0 | 0 → 0 |
| Água/esgoto em porta ou janela | 0 → 0 | 0 → 0 | 0 → 0 | 2 → **0** |
| Etapas que não rodaram | 0 | 0 | 0 | 0 |

Testes novos (os três REPROVAM sem a correção): `blueprintAlimentador.test.ts` (enterrado só por fora; sobe na fachada;
sem a premissa, como antes), `blueprintPosicaoSplit.test.ts` (a evaporadora longe da tomada) e
`blueprintAncorasDaCasa.test.ts` (fachadas do serviço tomadas por janela → parede interna, não diante do vão).

A 1ª CI reprovou o teste F8c, que exigia o alimentador ATRAVESSANDO o baldrame (ele corria por baixo da casa). Pela
decisão da F17 ele não atravessa mais: o teste passou a exigir nenhum pedaço em baldrame nem em pilar e nenhum trecho
enterrado dentro de um cômodo.

**Publicado** em 16/10/2026: `7352f9d6` na main (antes, a PR de rascunho #16 rodou a CI); check-run `ci` verde; o
domínio serve um commit que o contém.

## Programa "todas as pendências" (F18–F27, 16/10/2026)

Pedido do usuário:

> Resolver todas as pendências

### Retrato (8 casas de referência, sonda `planejarCasa` + `conflitosDoModelo`)

Casos: 12 × 30 R1-N 3/1/2/2 (térrea e sobrado), 15 × 25 R1-N, 10 × 30 R1-N 2 dorm., 15 × 30 R1-N 4 dorm., 10 × 30 R1-N
4 dorm., 15 × 30 R1-B, 14 × 28 R1-A. O que é problema (os "confira" de rotina ficam de fora):

- **Redes:** água fria e dreno do ar em porta/janela (15 × 25: 8 trechos; 10 × 30 2 dorm. e R1-A: 2); rede × rede
  (15 × 25: 3; R1-B: 4; R1-A: 3); esgoto/água quente atravessando pilar (10 × 30 4 dorm., R1-B, R1-A).
- **Climatização:** "ponto de dados fora do plano de circuitos" em TODAS (defeito); split sem eletroduto entre o ponto
  de força e a condensadora; cobertura sem camadas (a carga térmica não avalia o teto).
- **Mobiliário:** cama, box, vaso, lavatório ou armário que não couberam em 7 das 8.
- **Arquitetura (gerador E6.2):** lavabo, serviço, banheiro social e escritório sem lado externo; varanda × sala e
  cozinha × serviço sem porta direta; "Ambiente N" sem nome (sem interruptor; laje < 0,5 m²).
- **Larguras mínimas:** 4 dorm. em 10 m saem com 1,5 m; R1-B: serviço 1,40 m, dormitório 2,33 m; programa acima da TO.
- **Estrutura:** pilares a menos de uma seção; pilar sem posição entre aberturas; pilar do superior sobre abertura.
- **Escopo novo:** implantação não retangular, terreno inclinado, muro/portão/calçada, 3 pavimentos, a chuva de projeto
  na tela, as bolhas dos eixos na prancha, vaga descoberta com recuo de 3 m.

### Decisões do usuário (16/10/2026)

| Pergunta | Resposta |
|---|---|
| Terreno inclinado: como a casa assenta? | **Platô único** — na cota que equilibra corte e aterro sob a projeção; corte/aterro no orçamento; talude ou arrimo nas bordas acima de uma hipótese; escada/rampa na entrada |
| Muro, portão e calçada? | **Muro + portão + calçada** — muro nas laterais e fundos (altura hipótese), muro/grade na frente com portão de pedestre e de garagem, calçada interna da entrada e da garagem (na permeabilidade) |
| 3 pavimentos ou mais? | **Sim, até 3** |
| (17/10) O programa não cabe na térrea (4 dorm. em lote de 10 m; acima da TO)? | **Opção "Automático"** (o padrão da tela): gera a térrea e, se ela não comporta, o sobrado — fica o de menos problemas; "Térrea" escolhida fica térrea, e a pendência diz que o sobrado resolve |
| (17/10) Vaga descoberta com recuo de frente menor que a vaga (3 m × 5 m)? | **Automático**: recua a casa quando a profundidade deixa; senão a vaga vai numa faixa ao lado da casa (que estreita); sem nenhum dos dois, a pendência diz por quê |
| (17/10) Quando a casa sai em L em vez de retângulo? | **Só quando o retângulo não comporta** (limitado pelos recuos, ou ambiente abaixo da medida mínima): gera também em L e fica a de menos problemas |

### Fases (cada uma: retrato → correção → as 8 casas medidas 2× → CI de rascunho → main)

- [x] F18 — redes nas 8 casas: nenhuma em vão, nenhum rede × rede, nada atravessando pilar (ver "Registro da F18"; 2 luzes em sobra de cômodo vão para a F21)
- [x] F19 — climatização: ponto de dados, eletroduto força → condensadora, camadas da cobertura (ver "Registro da F19")
- [x] F20 — mobiliário: peça que não cabe ganha variante (cama, box, vaso/lavatório, armário) (ver "Registro da F20"; 2 cômodos estreitos demais vão para a F22)
- [x] F21 — gerador: molhados e escritório com lado externo; porta direta nas relações obrigatórias; nenhum "Ambiente N" (ver "Registro da F21"; o lado externo do serviço/escritório e a porta direta varanda × sala e cozinha × serviço passaram para a F22 — são do ARRANJO)
- [x] F22 — gerador: larguras mínimas por padrão; 4 dormitórios em lote estreito; programa acima da TO; e (da F21) o arranjo em faixas: varanda de entrada junto da sala, serviço junto da cozinha, serviço e escritório com fachada; e (da F20) a suíte que não cabe o armário/a cama — **partes 1, 2 e 3 feitas** (ver "Registro da F22"); a frente do R1-B e o sobrado no lote estreito vão com a F27
- [x] F23 — estrutura: pilares próximos, entre aberturas e sobre abertura do pavimento de baixo (ver "Registro da F23"; os 2 pilares do sobrado sobre janela do térreo vão com a F27 — as janelas dos dois pavimentos desalinhadas)
- [x] F24 — implantação não retangular (L) e vaga descoberta com recuo curto — partes 1 e 2 (ver "Registro da F24"); o serviço sem fachada nas casas largas e rasas vai com a F27 (o mesmo arranjo da cozinha × serviço do R1-B)
- [x] F25 — terreno inclinado: platô único — partes 1 e 2 (ver "Registro da F25" e "Registro da F25 — parte 2"; a rampa da garagem no terreno inclinado vai com a F26)
- [x] F26 — muro, portão e calçada; e (da F25) a rampa da garagem no terreno inclinado (ver "Registro da F26")
- [ ] F27 — **partes 1 e 2 feitas** (ver "Registro da F27"); **3 pavimentos (F27-D): [x] D1 a base (no ar, 1a1a8934)
  · [x] D2 a arquitetura · [x] D3 estrutura · [x] D4 instalações e a opção na tela (19/10) · [x] D5 terraço (19/10)**; e (da F24) o serviço com fachada nas casas largas e rasas (L e L de fundo largo, 3 dorm.); e (da F22) a qualidade do SOBRADO para o Automático escolhê-lo no lote estreito (10 × 30 4 dorm.) e no R1-B: varanda × sala no térreo, esgoto suspenso cruzando as faixas do forro, sobra de cômodo no superior, os encontros de rede; e (da F23) as janelas do superior alinhadas com as do térreo (pilar do superior sobre janela de baixo)
- [ ] F28 — tela e prancha: a chuva de projeto na tela da casa; bolhas dos eixos sem sobrepor


### Registro da F18 (16/10/2026) — as redes nas 8 casas

Medido (sonda: `planejarCasa` + `conflitosDoModelo`; cada casa até passar — a máquina derruba o Node e deu 1 resultado
errado, conferido repetindo):

| Casa | Em vão | Rede × rede | Em pilar |
|---|---|---|---|
| 12 × 30 térrea | 0 → 0 | 0 → 0 | 0 → 0 |
| 15 × 25 | 8 → **0** | 3 → **0** | 1 → **0** |
| 10 × 30, 2 dorm. | 2 → **0** | 1 → **0** | 0 → 0 |
| 15 × 30, 4 dorm. | 0 → 0 | 1 → **0** | 2 → 2 (*) |
| 15 × 30 R1-B | 0 → 0 | 4 → **0** | 1 → **0** |
| 14 × 28 R1-A | 2 → **0** | 3 → **0** | 3 → 2 (*) |
| 12 × 30 sobrado | 0 → 0 | 0 → 0 | 5 → **0** |
| 10 × 30, 4 dorm. | 0 → 0 | 0 → 0 | 1 → **0** |

(*) a luz de teto num "Ambiente N" — o triângulo de poucos cm² que o encontro imperfeito de duas paredes geradas deixa
(o mesmo do chanfro abaixo); é a sobra de cômodo da F21.

O que mudou, por causa (cada uma achada pela sonda, não suposta):

- **Alimentador × esgoto/pluvial** (4 casas): no trecho enterrado curto (hidrômetro → fachada), o esgoto e o condutor
  pluvial cruzavam na mesma cota. `cotaEnterradaAcimaDasRedes` (alimentador): a cota que passa POR CIMA de todo
  cruzamento (raios + `afastamentoAcimaDoEsgotoMm`, 50) — NBR 5626 —, ou por baixo, dito, se por cima não houver
  `recobrimentoMinimoMm` (150); a casa replaneja o alimentador depois do pluvial.
- **Condutor pluvial × esgoto** (15 × 25): o condutor sobe o início (`profundidadeDoCondutorMm`) de 6 em 6 cm até o
  detector de conflitos não acusar (passa por cima — a saída é a sarjeta), sem passar do recobrimento.
- **Armário diante da janela** (R1-A): peça ALTA não cobre janela do lado; o armário da suíte tampava a única parede
  externa e o ar ia para a parede interna, com o dreno atravessando a casa.
- **Condensadora no ambiente técnico**: encostada numa parede dele (externa primeiro, fora de vão) — no meio da garagem
  ela ficava sob a luz, e a linha descia pelo eletroduto.
- **Dreno × linha** (R1-B): deslocados além do batente, o dreno fica de preferência ATRÁS da linha; à frente, o
  deslocamento cresce até 2 × o afastamento.
- **Caminho antigo do dreno** (cômodo sem saída direta): a decisão da F14d ("bomba de dreno") estava sem implementar —
  agora bomba junto da evaporadora e o dreno pelas paredes SEM declividade logo abaixo dela (acima das portas), descendo
  na vertical por fora; a linha sobe a 12 cm do nó da evaporadora; o caminho antigo por gravidade também termina na
  vertical por fora (não mais em diagonal pela janela).
- **Água × eletroduto**: a vertical da descida do forro dentro da parede também é conferida contra as outras redes
  (anda ao lado e volta na cota do ponto); o ponto de força do ar vai para o lado sem tubo na altura dele
  (`afastamentoDoPontoAsRedesMm`, 60); o chuveiro elétrico ao lado da saída d'água (o afastamento lateral dos pontos).
- **Água na janela** (15 × 25): o ponto de água da louça dentro do vão de uma janela desce para abaixo do peitoril
  (`abaixoDoPeitorilMm`, 100 — a máquina de lavar sob a janela tinha a torneira a 1,10 m); e a descida do forro até um
  ponto sob a janela entra na parede AO LADO dela (o nó do forro anda junto) e corre por baixo.
- **Pilar**: o quadro procura posição fora de pilar e vão nas paredes vizinhas até 1,50 m (no sobrado ele ficava na
  esquina, dentro do pilar, e a prumada subia por ele os dois pavimentos); interruptor/tomada escorregam pela face para
  fora do pilar; a luz de teto sai da pegada dele; o esgoto conta o CONTORNO do pilar na queda (no caimento exato, o
  contorno perdia a mínima e o tubo ficava reto pelo pilar) e contorna pelo tubo, não só pelo eixo.
- **Anel do forro com chanfro**: o lado minúsculo em diagonal do encontro imperfeito de duas paredes (5 × 2 cm) virava
  do avesso ao recuar e o cômodo ficava SEM forro (a área de serviço do R1-A — a água quente ia em reta pelo forro);
  `semChanfros` troca os dois vértices pelo encontro dos lados vizinhos. E a origem no forro sem anel ao alcance procura
  a raiz até 3 m.

Testes novos (reprovam sem a correção): o alimentador por cima/por baixo (`blueprintAlimentador`), a máquina sob a
janela (`blueprintPontosHidraulicos`), o anel com chanfro e a descida ao lado da janela (`blueprintRotaPeloForro`).

**Publicado** 17/10/2026: 6314c940 + 0c2e38e9, rebaseados para a main em 833b2435 (CI da PR #21 e check-run `ci` da main verdes; `conferir-producao.sh "Casa automática"` ✅ — o domínio serve bb5c6d2, que contém 833b2435).

### Registro da F19 (17/10/2026) — a climatização

Medido nas 8 casas, 2× (a sonda agora passa à casa o catálogo de materiais, como a tela — os splits mudam de modelo e de
lugar, e foi assim que apareceram os encontros abaixo, que a sonda da F18 não via):

| Casa | Em vão | Rede × rede | Pendências da climatização (fora "confira") |
|---|---|---|---|
| 12 × 30 térrea | 0 | 0 | 1 VERIFICACAO (exaustão sem janela — F21) |
| 15 × 25 | 0 | 0 | 0 |
| 10 × 30, 2 dorm. | 0 | 0 | 1 VERIFICACAO (exaustão — F21) |
| 15 × 30, 4 dorm. | 0 | 0 | 1 PREMISSA (vizinho "Ambiente" — F21), 1 VERIFICACAO (F21) |
| 15 × 30 R1-B | 0 | 0 | 0 |
| 14 × 28 R1-A | 0 | 0 | 1 PREMISSA (vizinho "Ambiente" — F21) |
| 12 × 30 sobrado | 0 | 0 | 0 |
| 10 × 30, 4 dorm. | 0 | 0 | 0 |

(PILAR 2 no 15 × 30 4 dorm. e no R1-A: as luzes da sobra de cômodo, F21.)

O que mudou, por causa:

- **Ponto de dados "fora do plano de circuitos"** (todas): o gerador acusava os pontos que ele não criou; agora só os
  novos. Pendência de ambiente com "CONFERIR" e os avisos de cobre curvado / cabo de interligação seguindo a linha (é a
  prática — o cabo força → condensadora vai junto da linha) vão para o grupo CONFERIR.
- **Camadas da cobertura**: depois do telhado, o teto ganha camadas presumidas (ático 300 mm, laje se houver, gesso 13 mm
  se houver forro), com pendência CONFERIR — a carga térmica passa a avaliar o teto.
- **Conflito arquitetônico por altura**: estrutura (bloco, estaca, viga) só conflita com a peça na faixa de altura dela
  (o pilar segue em toda a altura); componente só conflita no mesmo cômodo — a condensadora sobre o bloco de fundação e o
  móvel do outro lado da parede eram acusados.
- **Travessia de viga no forro**: com forro, os cruzamentos da linha/dreno com VIGA são uma pendência CONFERIR ("furo a
  aprovar"), não N conflitos.
- **Saída direta pela parede (F14d) sob a viga**: a linha e o dreno atravessam a parede ABAIXO do fundo da viga sobre ela
  (`folgaSobAVigaNaSaidaMm`, 20) — com a evaporadora subida acima da janela, a linha saía na base da viga. As cotas da
  travessia são calculadas na escolha do ponto (`saidaPelaParede`), e o vão é conferido NELAS — antes, na cota da
  evaporadora, e o dreno rebaixado entrava na janela larga (R1-A).
- **Dreno abaixo da linha**: o dreno atravessa abaixo da linha pelo FEIXE dela (o raio que o detector de encontros usa) +
  `folgaEntreLinhaEDrenoNaSaidaMm` (20) — espremidos sob a viga, encostavam (5 casas).
- **Por dentro, paralelos à parede**: com a travessia ao lado da evaporadora (além do batente), os tubos correm paralelos à
  parede e atravessam de frente — em diagonal, entravam na espessura da parede ainda dentro do vão (sobrado). A linha desce
  na perpendicular, 6 cm atrás do nó (com a travessia 2 cm ao lado, as duas descidas ficavam a 1 cm — 10 × 30 4 dorm.), e o
  caminho conferido é o que ela vai percorrer.
- **Pontos elétricos como prumadas futuras**: o eletroduto desce do teto na vertical até cada ponto, planejado DEPOIS da
  climatização — a linha que corria paralela passava sobre o ponto de força (sobrado). A escolha da travessia evita os
  pontos abaixo dela.
- **Alcance ao lado**: sem ponto livre perto (a janela larga atrás da evaporadora com a viga logo acima), a travessia
  procura do mais perto ao mais longe até `saidaAoLadoAteMm` (2,5 m) — antes, sem saída direta, o caminho antigo furava a
  janela.

Testes novos (reprovam sem a correção): bloco/estaca e móvel do outro lado da parede (`blueprintClimatizacaoGrupoF`); a
viga baixa sem conflito com a linha/dreno e sem encontro entre eles; a janela larga sob a viga baixa (nada no vão, longe
dos pontos elétricos); a travessia um pouco ao lado (as descidas separadas) (`blueprintLinhaFrigorigena`).

**Publicado** 17/10/2026: 7b307b70 + d3a4cead na main (CI da PR #24 e check-run `ci` da main verdes; `conferir-producao.sh "Casa automática"` ✅ — o domínio serve 071b77b, que contém d3a4cead). O CI pegou o que a máquina não roda: as três folgas novas precisavam entrar em `HIPOTESES_DA_LINHA_PADRAO`/`LIMITES_DA_LINHA` (agora também campos do painel da linha).

### Registro da F20 (17/10/2026) — o mobiliário

Retrato antes (sonda: `mobiliarNivel` sobre o resultado, com as aberturas de cada cômodo e para onde dão): 25 peças de fora
nas 8 casas — vaso e lavatório em 4 banheiros de suíte, box em 2 banheiros, o armário da suíte em 6 casas, a cama em 3. A
causa principal NÃO era o mobiliário: os **banheiros tinham duas portas** — o da suíte abria também para o dormitório ao
lado, o social para a sala E a varanda — e a segunda porta tomava o lado do vaso.

Depois (8 casas, 2×): nenhum banheiro com peça de fora; 0 em vão e 0 rede × rede em todas (PILAR 2 no 15 × 30 4 dorm. e
no R1-A: as luzes da sobra de cômodo, F21). Peças menores, declaradas como CONFERIR: o armário da suíte em 6 casas (1,80 m
em 2, 1,20 m em 3, 0,90 m em 1), o dos dormitórios do 15 × 25 (1,20 m), o rack de 2 salas, o lavatório de 1 banheiro.
Ficam de fora, para a **F22** (o cômodo é que não cabe o programa): a suíte de 2,60 × 3,60 m do R1-B (sem armário) e a de
1,60 m de largura do 10 × 30 4 dorm. (sem cama).

O que mudou, por causa:

- **Banheiro é folha** (gerador, busca das portas): o banheiro e o lavabo recebem UMA porta e não abrem para ninguém; o
  com relação obrigatória (o da suíte) só é alcançado pelo seu par. Se um cômodo só se alcança atravessando um molhado (o
  desenho não deu outro lado comum), a passagem é aberta e DITA ("só tem acesso passando por…") — melhor que sem acesso.
  A porta de entrada da casa nunca vai para o banheiro/lavabo (sem lado da sala na frente, ia para o lavabo).
- **Porta interna na ponta**: entre cômodos secos, a porta vai para a ponta do lado comum (a 15 cm do canto), a mais perto
  das outras portas do cômodo — no meio, as duas portas da suíte e a janela partiam três lados ao meio. A porta do banheiro
  fica no meio (na ponta, o giro dela tomava o lado do lavatório — medido).
- **Variantes** (`PecaDeMobiliario.variantes`, medidas de mercado, a faixa de uso fica a mesma): cama da suíte 1,60 → 1,40;
  cama do dormitório casal → solteiro; armário da suíte 2,40 → 1,80 → 1,20 → 0,90; do dormitório 1,80 → 1,20 → 0,90; box
  0,90 → 0,80; lavatório → pequeno; rack 1,60 → 1,20; escrivaninha e estante menores. A usada é declarada
  (`MobiliarioDoAmbiente.reduzidas` → pendência CONFERIR na casa).
- **Refazer com a anterior menor**: sobrando peça de fora, o arranjo é refeito com UMA peça anterior na versão menor — só a
  medida, nunca o tipo (a cama de casal não vira de solteiro para caber o armário) — e fica o de menos peças de fora.

Efeitos em cascata (as portas mudaram os pontos), tratados pela causa:

- **Ajuste de DN por pressão** (`ajustarDnPorPressao`): escolhia o trecho pela perda POR METRO — um pedaço de 5 cm com uma
  conexão subia até 54 mm entre dois de 35, sem ganho, e furava a faixa da fria no forro (sobrado). Agora o trecho conta no
  mínimo 1 m e nunca fica maior que o de montante (árvore).
- **Descida da água sob janela**: a fria contornava pelo batente onde a quente (ainda sem tubo) ia descer. Os pontos da
  outra água sem tubo são prumadas futuras (dentro da parede) e, dos dois batentes, vale o primeiro com a corrida por baixo
  livre (cozinha do 15 × 30 4 dorm.).
- **Interruptor junto à porta** (`pontoJuntoAPorta`): nunca dentro de outro vão da parede na altura dele — a entrada a 15 cm
  da janela punha o interruptor no vidro, e o eletroduto descia pela janela (4 casas).

Testes novos (reprovam sem a correção): banheiro com uma porta e porta da suíte na ponta (`blueprintGerador`); armário de
0,90 e cama de 1,40 para caber o armário inteiro (`blueprintMobiliario`); DN que não cresce rumo ao ponto
(`blueprintPressaoDaRede`); a fria pelo batente livre (`blueprintRotaPeloForro`); o interruptor fora da janela
(`blueprintNbr5410Iluminacao`).

**CI da PR #27 (a suíte completa):** 4 testes da casa (lote 12 × 30 da suíte, térrea e sobrado) reprovaram — a mudança das
portas mexeu nas louças e expôs defeitos latentes, que as 8 casas da sonda não pegavam (ela não contava a verificação de
rede do app). Corrigidos pela causa:

- **Declividade no contorno do pilar**: a árvore do esgoto reservava a queda pelo comprimento total e o `contornarPilar`
  interpolava as cotas vértice a vértice — um pedaço ficava com 0,97 % ("1 % < 1 %"). Agora a queda é pedaço a pedaço,
  para cima, a mesma nos dois lados.
- **Fria e quente da pia a 4,9 cm**: a direção do par vinha de `face − q`, diagonal quando a projeção presa na PONTA da
  parede (a bancada passando do fim dela) — agora a normal exata da parede; e `faceDaParede` prefere a parede em que o
  ponto cai DENTRO do comprimento (só ela: no anel do forro, que contorna o pilar, isso afastava a cabeça da descida).
- **Ponta aberta da quente (sobrado)**: a pia, no pavimento do aquecedor com o barrilete no forro, subia pelo shaft da área
  de serviço (1,7 m e outra parede) — o grupo do mesmo pavimento não usa shaft; e a cabeça no forro vai para o anel do
  LADO do grupo (no eixo da parede, os dois anéis empatavam).

Os 5 testes reprovados passam agora (rodados um a um — o arquivo inteiro não roda nesta máquina).

### Registro da F21 (17/10/2026) — o gerador

- **"Ambiente N"** (R1-A, 15 × 30 4 dorm.): um triângulo de 5 cm² — duas paredes desalinhadas em 5 cm, uma de cada lado de
  uma terceira, com as faces sobrepostas. O gerador alinha as bordas dos ambientes a menos de uma espessura de parede (a
  do contorno vale; senão a mais repetida) antes de virar parede. Some a luz sem interruptor, a laje < 0,5 m², o PILAR das
  luzes e o vizinho "Ambiente" da carga térmica.
- **Exaustão onde não há janela**: ninguém lançava o exaustor — a conferência só acusava. `exaustoresQueFaltam` (módulo de
  ar) o põe em todo cômodo que a ventilação acusa: no pavimento de cima, o duto SOBE até 30 cm acima da cobertura (a regra
  da ventilação do esgoto), com a descarga lá — no forro, abaixo das vigas, ele cruzava portas, janelas e descidas d'água —
  e a travessia da laje é furo previsto (CONFERIR); com pavimento acima, o duto vai à fachada (`planejarRedeDeAr`). Fica a
  50 cm das paredes (os anéis do forro) e da luz; no cômodo pequeno, a luz a ≥ 40 cm (no centro ele caía nela) e o mais
  longe das paredes; a coluna livre dos tubos já lançados (o barrilete sobre a laje). Com o exaustor, o molhado sem lado
  externo deixa de ser "sem solução" e fica para conferir no código de obras.
- **Relação obrigatória sem porta direta** vira aviso do gerador e conta como problema GRAVE na escolha da semente (com a
  passagem por molhado).
- **Efeitos em cascata, pela causa**: o escorregão da descida na parede não entra em pilar; as prumadas futuras (F20) são
  restrição MOLE — sem lugar que respeite tudo, vale o que respeita as redes de verdade e o pilar; `foraDoPilar` não pula
  o pilar (do lado do ponto, a prumada da outra água; o primeiro livre do outro lado ficava além dele) e a coluna não vai
  ao shaft do outro lado de um pilar; o interruptor junto da porta já estava fora da janela (F20).

Medido nas 8 casas, 2×: **0 em vão, 0 rede × rede, 0 pilar** em todas. Fica para a F22 (é o ARRANJO em faixas — subir os
pesos do recozimento resolvia a varanda e desarrumava os mínimos dos ambientes, F3b; 16 sementes também não): varanda de
entrada × sala em 4 casas, cozinha × serviço no R1-B, serviço sem fachada (12 × 30) e escritório sem fachada (R1-A).

Testes novos (reprovam sem a correção): sem sobra de cômodo no caso medido (`blueprintCasaAutomatica`, F21); o exaustor e
o duto pela cobertura (`blueprintRedeDeAr`); o pedaço do contorno com a declividade (`blueprintEsgotoAutomatico`).

### Registro da F22 (17/10/2026) — o arranjo (partes 1, 2 e 3)

**Parte 2 publicada** 17/10: 7c657e53 + 0eb950fa na main (CI da PR #29 e check-run `ci` verdes; o domínio serve 7b96591,
que contém 0eb950fa).

**Parte 1 — a varanda de entrada junto da sala** (publicada 704f5189): com a garagem num canto da frente, a varanda vira
uma COLUNA na profundidade da linha da rua — encosta na rua e na sala, atrás. No treemap, ela ficava na 1ª linha e o
serviço na 2ª, atrás dela. Resolveu a varanda × sala nas 4 casas e, de quebra, o escritório sem fachada do R1-A; o 15 × 25
ficou sem nenhuma pendência. A varanda é aberta: sem janela não é falta. Na descida da água sob janela, o batente escolhido
pela descida INTEIRA livre de tubos (o nó do forro, andando junto, caía sobre a linha da outra água).

**Parte 2 — pavimentos "Automático"** (decisão do usuário, 17/10): o padrão da tela. Gera a térrea; se ela não comporta o
programa (medida mínima de ambiente violada, ou acima da TO), gera o sobrado e fica com o de MENOS problemas
(`problemasDoPlano`), dito na decisão e numa pendência CONFERIR. "Térrea" escolhida fica térrea, com a pendência de que o
sobrado resolve. A premissa gravada vale (1 continua térrea); ausente = Automático. E mais:

- a varanda em coluna só na linha da rua RASA (as vagas lado a lado, ≤ 6 m) — com a garagem em fila (10 m) ela virava uma
  faixa de 1,4 × 10 m;
- a porta do núcleo da escada do sobrado nasce com peitoril 0 (sem ele, a conferência de vão comparava com `undefined`).

Tentado e desfeito (medido): subir pesos do recozimento (relação obrigatória 10 → 14/20, ventilação 5 → 8) e prender o
serviço na frente na casa — os dois desarrumavam os mínimos dos ambientes (F3b) ou a frente do R1-B (banheiro de 0,55 m).

Medido nas 8 casas, 2×: 0 em vão, 0 rede × rede, 0 pilar. **Falta** (o arranjo, para a próxima rodada da F22): o serviço sem
fachada no 12 × 30 (a frente em colunas o deixa no miolo), a frente do R1-B (cozinha × serviço; o serviço vai ao fundo) e o
**sobrado no lote estreito** — no 10 × 30 de 4 dormitórios o Automático compara e fica com a térrea, porque o sobrado ali
tem os seus próprios problemas (a varanda com a garagem em fila, o esgoto suspenso do banheiro de cima cruzando as faixas
do forro do térreo por falta de shaft, uma sobra de cômodo no superior) — vai com a F27 (multipavimentos).

Testes novos (reprovam sem a correção): a varanda × sala no 15 × 25 e o Automático (fica o de menos problemas; a térrea
pedida que não comporta diz; o programa que cabe fica térreo) (`blueprintCasaAutomatica`); as premissas e o seletor
(`blueprintPremissasDaCasa`, `TelaCasaAutomatica`).

**Parte 3 — o serviço com fachada e junto da cozinha**: depois do arranjo, a área de serviço que ficou sem lado externo ou
longe da cozinha TROCA de caixa com um banheiro/lavabo (sem relação obrigatória, os dois cabendo pelos mínimos) quando a
troca lhe dá a fachada E a cozinha (`trocarServicoSemFachada`) — o banheiro sem janela tem exaustor (F21); pesar mais o
serviço no recozimento desarrumava os mínimos (F3b, medido de novo). Resolveu o 12 × 30 (o serviço no miolo da frente em
colunas). Efeitos tratados: o ponto do PRESSURIZADOR procura em volta da bomba a posição cuja subida do eletroduto não
encontra tubo (no lugar dela, subia através do barrilete); o aviso "sem porta direta" do sobrado não se repete (já sai na
conferência do programa).

Medido nas 8 casas, 2×: 0 em vão, 0 rede × rede, 0 pilar; **nenhuma SEM_SOLUCAO** a não ser a cozinha × serviço do R1-B — a
caixa do banheiro ali tem 1,5 m de fundo e o serviço pede mais (a troca não cabe); no Automático o R1-B e o 10 × 30 de 4
dormitórios ficam térreos porque o SOBRADO deles tem mais problemas — os dois vão com a F27 (a qualidade do sobrado).

Teste novo (reprova sem a correção): o serviço do 12 × 30 com fachada e junto da cozinha (`blueprintCasaAutomatica`).

### Registro da F23 (17/10/2026) — a estrutura

Retrato (as 8 casas, antes): o 15 × 30 de 4 dormitórios com "Pilares: a menos de uma seção de outro pilar" em VERIFICACAO;
o R1-A (14 × 28) com "Pilares: sem posição livre entre aberturas"; o sobrado 12 × 30 com pilar(es) do superior sobre porta
ou janela do térreo.

Correções:

- **O encontro colado em outro pilar é CONFERIR**, com "o pilar vizinho atende os dois encontros": o planejador pula o nó a
  menos de uma seção de um pilar porque o vizinho o atende — não é falta de solução.
- **A janela acima do máximo estético vira folhas** separadas por montantes (`HipotesesDoGerador.janela.montanteMm`,
  padrão 0,40 m — a seção de 19 cm e a folga da abertura dos dois lados cabem). No R1-A uma janela de 5,05 m tomava o vão
  inteiro entre os dois apoios (5,45 m > 5 m) e o intermediário não tinha onde nascer. O conjunto cresce o que os
  montantes tiram quando a parede deixa; cada folha fica entre 0,60 m e o máximo (senão, a janela única de antes).
- **No sobrado, o pilar do superior que cairia sobre porta ou janela do térreo escorrega** pelas paredes dele (qualquer uma —
  no T a primeira pode ser a interna) até ter parede cheia embaixo e em cima (`HipotesesDePilares.deslizeSobreAberturaMm`,
  padrão 1,2 m); antes ele era descartado.
- As duas folgas viraram premissas da casa (`estrutura.montanteEntreJanelasMm`, `estrutura.deslizeSobreAberturaMm`), com
  os campos na tela.

Tentado e desfeito (medido): procurar o intermediário entre TODAS as faixas proibidas da parede (só ganhava em casos de
igualdade exata — se a faixa em que o ideal cai não tem borda no intervalo, ela cobre o intervalo inteiro) e registrar o
pilar vizinho como apoio das paredes do nó pulado (inerte: a cadeia já nasce apoiada nas duas pontas).

Medido nas 8 casas, 2× (iguais): 0 em vão, 0 rede × rede, 0 pilar; o R1-A e o 15 × 30 de 4 dormitórios sem pendência de
estrutura. **Falta** (vai com a F27): no sobrado 12 × 30, 2 pilares do superior seguem fora — as janelas do térreo e do
superior estão desalinhadas na mesma fachada e o primeiro trecho com parede cheia nos dois pavimentos fica a 1,4 m e
3,3 m (levar o intermediário tão longe desfaz o vão que ele divide); a pendência diz que a viga do superior vence o vão.
A correção é alinhar as janelas do superior com as do térreo.

Testes novos (reprovam sem a correção): folhas e montante como hipótese (`blueprintGerador`); o deslize no sobrado e o
alcance zero (`blueprintSobrado`); o 15 × 30 de 4 dormitórios (CONFERIR) e o R1-A sem "sem posição livre"
(`blueprintCasaAutomatica`); as premissas da estrutura (`blueprintPremissasDaCasa`).

### Registro da F24 (17/10/2026) — vaga descoberta e casa em L (parte 1)

Retrato (sonda nova com o lote por anel: 12 × 30 sem garagem; lote em L com 20 m de frente nos primeiros 15 m e 10 m nos
fundos; o mesmo com o fundo largo; trapézio de 12 m de frente abrindo para 20 m):

- 12 × 30 com as vagas descobertas: **0 de 2 vagas** (o recuo de frente tem 2,90 m livres; a vaga pede 5 m) e o dreno do
  ar em janela;
- lote em L com 4 dormitórios R1-A: a casa presa no retângulo dos recuos — **184 m² de 222** pedidos, a TO deixava 270;
- trapézio com 4 dormitórios: a casa estreita (9,75 m) sem usar o fundo largo — **3 dormitórios abaixo da largura
  mínima**.

Correções:

- **Vagas descobertas** (`HipotesesDaImplantacao.vagaDescoberta`, padrão AUTOMATICO): cabem no recuo de frente → ficam
  ali; senão RECUAR (a casa vai para trás até as fileiras caberem — vence quando não perde área) ou AO_LADO (uma faixa de
  2,5 m da rua para dentro, no lado oposto ao encosto; a casa estreita e aprofunda); a de menos perda; a implantação diz
  onde (`vagasDescobertas`) e as âncoras põem as vagas ali. A decisão sai em CONFERIR. (De quebra, o aviso de área
  concorda no plural: "os recuos permitem".)
- **Casa em L** (`HipotesesDaImplantacao.forma`, padrão AUTOMATICA): a térrea em retângulo e, se ele não comporta, a
  mesma casa em L (`planejarTerrea`) — fica a de menos problemas (empate: a de mais área), dita em CONFERIR. O L: o
  retângulo da frente mais raso e um anexo colado atrás, no que o envelope tem atrás; o de menor profundidade total que
  alcança o teto, com ≥ 3 m de lado, ≥ 3 m em comum com o da frente e degrau de 0 ou ≥ 3 m (o de menos virava uma faixa
  que o gerador tomava por anexo). O gerador recebe o contorno (`contornoLocal`).
- **Telhado do anexo**: uma água caindo para fora do principal — fundos, frente ou, novo, para o LADO (`DIREITA`/
  `ESQUERDA`); antes, o anexo ficava "sem cobertura — cubra à mão".
- **Calha só no beiral fora da casa**: no L, o beiral de trás do principal passa por cima do anexo (ali as águas se
  encontram); a calha atravessava o cômodo.
- **Gerador, anexo**: o item vai com os de relação obrigatória (a suíte ia sozinha para o anexo e o banheiro dela ficava
  do outro lado da casa); a garagem fica no principal.
- **Climatização**: o dreno com BOMBA corre acima do topo da janela quando ela alcança a cota dele (2,12 m × 2,20 m) —
  sobe na bomba, não na saída da evaporadora, onde a linha sobe (`folgaDoDrenoSobreAberturaMm`, 25 mm, no painel da
  linha); a saída direta não desce dentro de OUTRA parede (o canto de dentro do L) e procura o outro sentido; os lados de
  piso no vértice colinear em que a parede muda de espessura ficam cada um na sua face (a evaporadora girava 359° e
  entrava 12 mm na parede).

Medido nas 8 casas, 2×: **iguais à F23** (0 em vão, 0 rede × rede, 0 pilar). Nos lotes novos:

| Lote | Antes | Depois |
|---|---|---|
| 12 × 30 sem garagem | 0 de 2 vagas; 2 trechos em janela | 2 vagas (a casa recua 2,10 m); 0 / 0 / 0 |
| L, 4 dorm. R1-A | 184 m² de 222 | em L, 221,6 m²; esgoto em pilar (2), pluvial rente ao esgoto, 2 rede × rede, equipamento a 62 mm da estrutura |
| trapézio, 4 dorm. R1-A | 3 dormitórios abaixo da mínima; serviço sem fachada | em L, nenhuma medida mínima violada, nenhum "sem solução"; pluvial rente ao esgoto, 1 rede × rede |

**Falta (parte 2):** as rotas ENTERRADAS da casa em L e dos lotes novos — o esgoto e o pluvial em diagonais longas sob a
casa, passando por pilar e rentes um ao outro na lateral; nos lotes em que o retângulo comporta (L e trapézio com 3
dormitórios, o L de fundo largo), o serviço sem fachada e o esgoto por pilar, como já eram; a iluminação da sala do
12 × 30 sem garagem (2,4 m² para 1/6).

Testes novos (reprovam sem a correção): as vagas no recuo, ao lado e no lote raso; o L no lote em L e no trapézio
(degrau); `anelDoL` (`blueprintCasaImplantacao`); o lado colinear (`blueprintDistribuicao`); a suíte com o banheiro no
anexo e a garagem no principal (`blueprintGerador`); a uma água para o lado (`blueprintTelhadoAutomatico`); a casa sem
garagem (2 vagas, nada em janela) e a casa em L (programa alcançado, anexo coberto, nenhum equipamento na parede,
nenhuma calha dentro da casa) (`blueprintCasaAutomatica`).

### Registro da F24 — parte 2 (17/10/2026): as rotas enterradas dos lotes novos

Retrato (as 6 casas dos lotes novos, com o detalhe de cada encontro): o esgoto enterrado em diagonais longas sob a casa
passando por DOIS pilares (o desvio só sabia contornar um) ou com a junção a 45° DENTRO do pilar; o condutor horizontal
do pluvial em reta do pé da descida dos fundos à saída da frente, cruzando a casa por baixo (pilar, o fim do esgoto na
caixa de gordura da lateral, a descida do alimentador — a saída proposta caía no mesmo ponto da frente que ele); a
evaporadora encostada num pilar saliente (19 cm na parede de 15) e a linha subindo onde a água quente atravessa a parede;
no 12 × 30 sem garagem, a varanda de entrada atrás do lavabo e a porta de entrada na sala (2,4 m² de janela para 3,8).

Correções:

- `desvioDoPilar`: sem um canto ou par do mesmo pilar livre, o menor caminho pelos cantos de TODOS (grafo de
  visibilidade) — vale para o esgoto, o eletroduto e a linha.
- Esgoto: a junção a 45° que cai dentro do pilar (crescido pelo raio do DN 100 + 2 cm) escorrega para fora dele, antes
  das cotas.
- Pluvial: o horizontal contorna POR FORA — os cômodos crescidos até `afastamentoDoCondutorDaCasaMm` (30 cm, no painel
  dos condutores) além da face, os pilares, as caixas enterradas e as descidas enterradas das outras redes —, com a queda
  repartida pelo comprimento do contorno (e a saída proposta calculada por ele); a saída proposta escorrega ao longo da
  frente até ficar a 80 cm das outras redes.
- Climatização: o pilar que sobressai da face ocupa o trecho da parede (sempre, com ou sem desvio dos componentes); a
  travessia de outra rede pela parede acima da evaporadora também.
- Gerador: sem garagem, a varanda de entrada longe da rua troca de caixa com o banheiro/lavabo da frente que encosta nela
  (`trocarVarandaSemRua`); e, quando a fachada da sala não comporta a janela de 1/6 com a porta, a entrada é pela varanda.

Medido nas 8 casas, 2×: **iguais à F23** (0 / 0 / 0). Nos 6 lotes novos, 2×: **0 em vão, 0 rede × rede, 0 pilar** em
todos; nenhum CONFLITO; a sala do 12 × 30 sem garagem cumpre 1/6. Sobra só o serviço sem fachada nos dois retângulos
largos e rasos (L e L de fundo largo, 3 dormitórios) — vai com a F27.

Testes novos (reprovam sem a correção): o desvio por dois pilares (`blueprintObstaculosEstruturais`); o horizontal por fora
da casa e longe da caixa de gordura (`blueprintCondutoresPluviais`); na casa, o 12 × 30 sem garagem (a sala com 1/6, nada
tubo × tubo), o L de 4 dormitórios (nenhum CONFLITO, nada por pilar nem rente) e os dois L de 3 dormitórios em
retângulo (o esgoto sem pilar; o pluvial sem rente, sem o alimentador por baixo) (`blueprintCasaAutomatica`).

### Registro da F25 (17/10/2026) — terreno inclinado: o platô único (parte 1, o motor)

Retrato (sonda nova com a grade do terreno: o 12 × 30 subindo 10 % e 25 % para os fundos, descendo 10 %, caindo 15 % de
lado; o sobrado e o L de 4 dormitórios): a casa ficava na cota zero do desenho, a da rua — num lote que sobe 3 m, de 0,3 a
1,6 m ABAIXO do chão, sem corte, sem talude, sem nada dito. O terreno só entrava nas cotas da hidráulica.

O que entrou (`utils/blueprintPlatoDaCasa.ts`, etapa TERRAPLENAGEM depois da implantação, só com a topografia do estudo):

- a cota do platô = a de EQUILÍBRIO sob a projeção (face externa das paredes, `cotaDeEquilibrio`); o platô = a projeção
  com a margem (`margemDoPlatoMm`, 1 m); o térreo assenta `pisoAcimaDoPlatoMm` (15 cm) acima — `SetLevelProps`, o
  primeiro comando do lote; o superior do sobrado sobe com ele;
- cada borda: TALUDE (os do padrão da topografia) ou MURO DE ARRIMO quando a altura passa de `alturaMaximaDoTaludeM`
  (1,5 m) ou o talude sai do lote (as laterais a 0,5 m da divisa); volumes, bota-fora/empréstimo, taludes e muros pela
  `terraplenagemComTalude`; o muro sai em VERIFICACAO ("dimensione com o calculista"), com a borda (frente, fundos,
  esquerda, direita);
- a entrada: da calçada ao piso, rampa até 8,33 % se cabe no recuo de frente, senão escada (espelho ≤ 18 cm, piso 28 cm);
  não cabendo, VERIFICACAO;
- as hipóteses nas premissas da casa (ligar, margem, piso, altura do talude) e o platô no resumo da tela.

Efeitos tratados no pluvial (o coletor predial desce fundo até a rua no terreno inclinado): o condutor horizontal ganha um
VÉRTICE no cruzamento com um tubo enterrado de outra rede, por baixo dele com a folga, quando ainda chega à saída com a
declividade mínima; a saída proposta procura a frente sem cruzar as outras redes (senão, só longe delas, como na F24); o
laço que sobe o início do condutor fica com o passo de MENOS encontros (aceitar todos estragava o cruzamento por baixo).
Tentado e desfeito: baixar a saída pelo cruzamento — no terreno plano o condutor ia fundo e emparelhava com o coletor.

Medido: as 8 casas 2× iguais à F23; os lotes da F24 0 / 0 / 0; nos terrenos inclinados (12 × 30 térrea e sobrado, L de 4
dormitórios, a 10 %, −10 %, 15 % de lado e 25 %): 0 em vão, 0 rede × rede, 0 pilar; a 25 % a escada da entrada (2,2 a
3 m de desnível) não cabe no recuo de frente e é dita.

**Falta (parte 2):** o "Lançar" gravar a terraplenagem do estudo (hoje a aba de terraplenagem só conhece a base
ENVELOPE/LOTE — a projeção da casa pede base nova, migration); corte, aterro e face de muro no orçamento (medidas de
terreno alimentadas pela terraplenagem); a escada/rampa da entrada desenhada (o kernel não tem escada a partir do
terreno).

Testes novos (reprovam sem a correção): o platô no plano, a 10 %, talude × muro, terreno abaixo da rua e íngreme, sem
topografia (`blueprintPlatoDaCasa`); a casa no terreno de 10 % (o térreo no platô, a trava aprova, nada tubo × tubo), o
sobrado (o superior um andar acima do térreo novo) e sem topografia (`blueprintCasaAutomatica`); o condutor por baixo do
cruzamento (`blueprintCondutoresPluviais`); as premissas (`blueprintPremissasDaCasa`) e a seção na tela
(`TelaCasaAutomatica`).

### Registro da F25 — parte 2 (18/10/2026): o platô gravado, a terraplenagem no orçamento, a escada de acesso

Decisão do usuário (18/10/2026, sobre como desenhar a entrada): **"Escada partindo do terreno"** — campo novo no kernel,
não um degrau falso no pavimento nem só a pendência.

O que entrou:

- **(a) o "Lançar" grava a terraplenagem do estudo.** A premissa de terraplenagem (`blueprint_study_terraplenagem`) ganha a
  base `CASA` e a coluna `anel_plato` (migration `aplicar_20271018310000_terraplenagem_base_casa`): o anel do platô sob a
  projeção, a cota e o muro por aresta que a casa calculou. O hook (`aplicarPlatoDaCasa`) grava UMA vez, no clique; o
  anel em uso na tela (`definirAnelEmUso`) só vai junto da próxima mudança explícita — abrir a tela não grava. A aba
  Topografia mostra o botão "Sob a casa" quando há platô da casa.
- **(b) corte, aterro e face de muro no orçamento.** Três medidas de terreno (`VOLUME_CORTE`, `VOLUME_ATERRO` em m³,
  `AREA_MURO_ARRIMO` em m², uma linha por muro): o orçamento recalcula a terraplenagem da topografia PUBLICADA no
  snapshot (`blueprint_snapshot_topografia`) com a premissa do estudo — o mesmo cálculo da aba, a versão da topografia no
  rótulo.
- **(c) a escada de acesso** — kernel 0.103.0, `Escada.desdeCotaMm`: a escada (ou rampa) que liga a CALÇADA, nesta cota
  do zero do desenho, ao piso do pavimento. Sobe ou desce; os pontos do baixo para o alto; o desnível é calçada ↔ piso e
  o lance começa na mais baixa (`baseDaEscadaMm`) — 3D, corte, elevação, enquadramento, IFC e a conferência escada ×
  estrutura somam a base; não fura laje; as rotas de fuga, extintores e iluminação de emergência a tratam como do
  próprio pavimento; sem `ateLevelId`; a calçada na cota do piso é recusada; o canônico só leva o campo quando existe (o
  hash do acervo não muda). A casa a lança logo depois da arquitetura (térrea e sobrado): diante da porta de entrada na
  fachada da frente, da face rumo à rua, os degraus do platô (espelho ≤ 18 cm, piso 28 cm) ou a rampa a 8,33 %, 1,20 m
  de largura no mínimo — só quando cabe no recuo de frente; não cabendo, ou sem porta na frente, a pendência diz e o
  acesso fica à mão.

Medido (sonda, 12 × 30 a 10 %): térrea — térreo a 1,30 m, escada de 8 degraus de 163 mm (2,24 m) da calçada à varanda,
nenhum conflito; sobrado — térreo a 1,075 m, 6 degraus de 179 mm, a escada interna à parte; a 20 % a escada não cabe e é
dita.

**Achado para a F26** (a frente do lote): no terreno que sobe, a GARAGEM fica no platô — 1,3 m acima da calçada a 10 % — e
a rampa de veículos não cabe no recuo de frente de 3 m. Entra com o muro, o portão e a calçada: rampa de veículos com
inclinação máxima como hipótese, ou a garagem na cota da rua.

Testes novos (reprovam sem a correção): a escada de acesso no kernel — desnível, base, chegada, calçada acima, sem furo,
canônico e guarda do acervo, invariantes (`blueprintEscada`); a altura livre contada da calçada
(`blueprintConflitosArquitetonicos`); a casa a 10 % com a escada lançada e sem conflito, o sobrado com as duas escadas, a
20 % sem escada e com a pendência (`blueprintCasaAutomatica`); as medidas de terraplenagem (`blueprintBudget`); o botão
"Sob a casa" (`PainelTopografiaFase2`); o platô da casa no hook (`useBlueprintTerraplenagemCasa`).

## F26 — muro, portão, calçada e a rampa da garagem (18/10/2026, "sim" para seguir)

### Retrato

- O kernel não tem MURO: a feição `MURO` é do levantamento topográfico (o existente), não do projeto. Desenhado como
  PAREDE, o anel de muros fecha o lote e o quintal vira um ambiente (TO, etiquetas, fachadas e redes leem paredes).
- A calçada já existe: sub-região (`SubRegiao`, CONCRETO/INTERTRAVADO…), de onde sai a permeabilidade desenhada.
- No terreno inclinado a garagem fica no platô (F25): a 10 %, 1,3 m acima da calçada — a rampa de veículos não cabe
  no recuo de frente de 3 m.

### Decisões do usuário (18/10/2026)

| Pergunta | Resposta |
|---|---|
| Como o muro e o portão entram no desenho? | **Família nova no kernel** — `Muro` (alvenaria, grade ou mureta com grade), altura e espessura, portões de pedestre e de garagem como vãos; não delimita ambiente, não entra na TO; planta, 3D, IFC, quantitativo e orçamento (kernel 0.104.0, planta-api redeployada) |
| A garagem no platô e a rampa de veículos que não cabe no recuo? | **Automático: rampa, recuando a casa** — rampa no recuo com inclinação máxima como hipótese (20 %); não cabendo, a casa recua até caber quando a profundidade deixa (como a vaga descoberta); sem espaço, a pendência diz por quê; terreno plano não muda |

(De 16/10, valendo: muro nas laterais e fundos com altura como hipótese; muro/grade na frente com portão de pedestre e
de garagem; calçada interna da entrada e da garagem, na permeabilidade.)

### Partes

1. **Kernel 0.104.0 — a família `Muro`**: modelo, comandos, canônico (chave omitida sem muro — o hash do acervo não
   muda), invariantes, identidade, quantitativo, orçamento, IFC, planta 2D, 3D, prancha, painel de propriedades e a
   ferramenta de desenhar; a base acompanha o terreno (cota por vértice).
2. **A casa lança muro, portões e calçadas**: divisas laterais e fundos; a frente com o portão de pedestre diante da
   entrada e o de garagem diante da garagem; a calçada da entrada (do portão à porta, com a escada de acesso) e a da
   garagem; as hipóteses (alturas, tipo da frente, larguras dos portões, material da calçada) nas premissas.
3. **A rampa da garagem**: a rampa de veículos (escada de acesso tipo RAMPA, kernel 0.103.0) do portão à garagem; o
   recuo mínimo de frente que ela pede volta à implantação e o platô é recalculado até fechar.

### Registro da F26 (18/10/2026)

**Kernel 0.104.0 — a família `Muro`** (`utils/blueprintKernel/model.ts`, `muro.ts`): muro de divisa, grade ou mureta com
grade; altura, espessura, mureta (só no misto); a base por vértice (`cotasDaBaseMm`, do zero do desenho — o terreno);
os PORTÕES (pedestre, garagem) como vãos ao longo do percurso, em ordem e sem se sobrepor. Fora do arranjo planar (o anel
de muros do lote não vira ambiente). `AddMuro`/`SetMuroProps`/`DeleteMuro`, `TranslateEntities.muroIds`, `RemoveLevel`
leva os do pavimento; canônico omitido sem muro (os 6 goldens só mudaram pela string — provado com 0.103.0). Quantitativo
`quant-1.29.0` (por muro e totais: metros, alvenaria e grade em m² nos trechos cheios, portões por tipo); orçamento
`AREA_MURO_ALVENARIA`, `AREA_MURO_GRADE`, `COMPRIMENTO_MURO`, `PORTAO_PEDESTRE`, `PORTAO_GARAGEM` (escopo TERRENO); IFC
(alvenaria `IfcWall .SOLIDWALL.`, grade `IfcRailing .BALUSTRADE.`, o misto com os dois, `Pset_OpuraMuro`); planta (faixa
hachurada, grade com montantes, portão de pedestre com a folha e o arco, o de garagem tracejado), 3D, prancha, forro,
camadas; o painel do muro (tipo, alturas, espessura, rótulo, portões — acrescentar com o motivo quando não cabe) e a
ferramenta "Muro / grade" (dois cliques) no menu de componentes. E `Escada.veicular` — a rampa da garagem, sem o aviso
da NBR 9050 (a inclinação é a do código de obras). No DXF, a camada PLANTA-MUROS (o contorno de cada trecho cheio, a
linha de cada portão, o tipo e a altura em texto).

**A casa** (`utils/blueprintMuroDaCasa.ts`, etapa MURO logo depois da arquitetura — antes da água e da elétrica, que
põem o hidrômetro e o medidor no muro): o muro corre dentro do lote, o eixo à meia
espessura da divisa; a frente (as divisas FRENTE) em mureta com grade, laterais e fundos em alvenaria, 1,80 m; o portão
de garagem diante da garagem (ou das vagas descobertas), o de pedestre diante da porta — encostando no de garagem, vai
para o lado que tem lugar; no terreno, um vértice a cada 3 m com a cota dele. As calçadas: o acesso da garagem
(intertravado), a calçada da entrada (concreto, do muro ao pé da escada de acesso ou à fachada) e o JARDIM (grama: o lote
dentro do muro menos a casa, as calçadas e as escadas, em faixas) — sem o jardim, a permeabilidade desenhada seria zero
e a regra da zona acusaria em falso. A permeabilidade com as calçadas desenhadas é conferida contra a da zona. As
hipóteses nas premissas (ligar, tipo e altura da frente, altura das divisas, calçadas).

**A rampa da garagem** (decisão do usuário, 18/10/2026: "Automático: rampa, recuando a casa"): no terreno inclinado, a
rampa de veículos até `rampaDeVeiculosMaxPct` (20 %, nas premissas) tem de caber entre o muro e a fachada; não cabendo, a
implantação ganha recuo mínimo de frente e o platô é recalculado com ela (no aclive o platô sobe junto — a SECANTE sobre
o que falta fecha na segunda volta). Recuar e não caber (terreno mais íngreme que a rampa) volta a casa para onde
estava; a pendência diz por quê. Lançada depois da arquitetura, no lugar real da garagem.

Medido (12 × 30, R1-N): plano — muro 11,85 + 71,55 m, 2 portões, calçadas 10,7 m², jardim 179,9 m², nada muda na casa; a
10 % — a casa recua 7,5 m, térreo a 2,03 m, rampa de 10,1 m a 20 %, escada de pedestre de 12 degraus; sobrado a 10 % —
recua 5,4 m; a −10 % — rampa descendo 1,45 m; a 25 % — a casa fica no recuo da zona e a pendência diz que a rampa (15 m)
não cabe nos 2,75 m.

Remedido com o relatório do muro nas 8 casas de referência (a pedido do usuário): o hidrômetro e o medidor caíam no VÃO
de um portão em 5 das 8 — `pontoNaFrente(…, { foraDosPortoes: true })` os põe no muro a 30 cm dos portões (os vãos vizinhos
juntos num intervalo só), e por isso a etapa MURO foi para logo depois da arquitetura. Com isso a coluna de água fria do
sobrado 12 × 30 mudou de lugar e o split foi pendurado em cima dela — defeito antigo: `lugarDaEvaporadora` ignorava a
PRUMADA dentro da parede (só via a travessia em planta); agora ela ocupa o trecho (sem a correção, a evaporadora a 25 mm
da coluna; com ela, ≥ 822 mm). Final: as 8 casas iguais à F25 (0 em vão, 0 rede × rede, 0 pilar, as mesmas pendências),
nenhum medidor no vão, nenhum muro cruzando a casa, permeabilidade desenhada de 35 a 64 % (zona: 20 %). Duas rodadas
travaram na 10 × 30 de 4 dormitórios por horas: a thread não atendia ao pedido de pausa do inspetor (girando no código
nativo do V8 — a mesma casa já derrubara o V8 num `Array.sort`); sozinha, a casa termina em segundos — é a máquina.

## F27 — o sobrado bom e os 3 pavimentos (18/10/2026, "sim" para seguir)

### Decisões do usuário (18/10/2026)

| Pergunta | Resposta |
|---|---|
| Na casa de 3 pavimentos, o que vai em cada andar? | **Social embaixo, íntimo em cima** — térreo: garagem, sala, cozinha, serviço e lavabo; 1º: dormitórios e banheiros; 2º: a suíte principal e o que sobrar (escritório, terraço) |
| Quando o Automático usa 3 pavimentos? | **Só quando o sobrado não comporta** — térrea, sobrado e então 3 pavimentos (se o gabarito da zona deixa); fica o de menos problemas |
| Em que ordem? | **Sobrado primeiro, 3 pavimentos depois** — A (a qualidade do sobrado), B (as janelas do superior alinhadas com as do térreo) e C (o serviço com fachada nas casas largas e rasas), publicados; depois D (3 pavimentos) |

### Registro da F27 — parte 1 (18/10/2026): o sobrado do lote estreito

Retrato (o sobrado forçado no 10 × 30 de 4 dormitórios, rodadas limpas): a varanda × sala sem porta direta (a sala na
linha de trás), uma sobra de cômodo no superior (laje < 0,5 m², "Ambiente 8" sem interruptor), o armário de um quarto, e
— só a sonda via — o esgoto suspenso do banheiro de cima cruzando os eletrodutos e a água quente do forro do térreo. O
"eletrodutos: Cannot create property…" do primeiro retrato e um "[…].sort(…).map is not a function" na água eram a
máquina (corrupção do V8: não se repetem nas rodadas limpas).

O que entrou:

- **Gerador** (`caixasDoPlano`): com a garagem em FILA a linha da rua fica funda (10 m) e a varanda não vira coluna até
  a sala; aí a faixa ao lado da garagem é a ENTRADA — a varanda na rua e a sala logo atrás; cozinha, serviço e lavabo
  na linha de trás (com a fachada dos fundos). Só quando as duas cabem pelos mínimos. Resolveu a varanda × sala, a
  sobra de cômodo e o armário.
- **Laje rebaixada**: a previsão das peças de cima roda com os shafts do F12c (sem eles escolhia outro shaft e a laje
  descia até ele, enquanto o esgoto ia ao do F12c); e o banheiro em L (a escada entra nele) recorta a área molhada em
  retângulos (`recortadaPeloBanheiro`) — o recorte pelos lados, de convexo, deixava só o braço estreito e a laje parava a
  20 cm do shaft.
- **Encontros à vista**: rede × rede (por par de redes) e tubo atravessando pilar viram pendência CONFLITO — antes só a
  sonda contava; a tela não dizia e o Automático (que pesa as pendências) não os via.

Medido: as 8 casas iguais à F26 (0 / 0 / 0, as mesmas pendências). O sobrado 10 × 30: a varanda encosta na sala, sem
sobra de cômodo nem armário; os encontros caíram de 5 para 4 e agora são ditos (3 eletroduto × esgoto, 1 fria × quente)
— no Automático a térrea fica (empate em 7), sem encontro. **Falta** (fase própria): a luz de teto do cômodo sob dois
banheiros de cima liga-se em reta sob a laje rebaixada (área em L) — as ligações retas do forro precisam contornar área
não retangular; três tentativas (penalidade na árvore, faixa do tubo suspenso, caixas juntadas) só mudaram o problema
de lugar e foram desfeitas.

Testes novos (reprovam sem a correção): o banheiro em L (`blueprintSobrado`); o sobrado no lote de 10 m com a varanda
junto da sala e os encontros nas pendências (`blueprintCasaAutomatica`).

### Registro da F27 — parte 2 (18/10/2026): as janelas alinhadas e o serviço com fachada

- **As janelas do superior alinhadas com as do térreo** (`alinharJanelasDoSuperior`, logo depois da arquitetura do
  sobrado, antes dos pilares): cada janela de cima vai ao centro da de baixo mais perto, na mesma fachada (até 1,5 m),
  se ali ela fica inteira na parede, a 30 cm das pontas e das outras aberturas, e sem atravessar o encontro com uma
  parede interna (o mesmo cômodo — a iluminação de 1/6 não muda). O pilar intermediário do térreo sobe entre elas: o
  sobrado 12 × 30 (2 pilares fora) e o R1-B (1) ficaram sem a pendência.
- **O serviço com fachada na casa larga e rasa**: a faixa ao lado da garagem em duas linhas, e o serviço no miolo da de
  trás (só a ponta dela tem fachada — o L e o L de fundo largo, 3 dormitórios). Quando nem a troca da F22 o põe na
  fachada, o arranjo FINAL (depois do recozimento) tenta as duas linhas à força: na da rua os que pedem fachada e a
  cozinha na ponta; na de trás o lavabo e o serviço na ponta, embaixo da cozinha — fica se o serviço ganha fachada, encosta
  na cozinha e todos os que pedem fachada a têm. Tentado e desfeito (medido): a mesma coisa dentro da função objetivo
  (mudava qual plano vencia — a cozinha ou a varanda sem fachada no 12 × 30 e no trapézio).

Medido: as 8 casas iguais (planta e pendências) à rodada anterior; o L e o L de fundo largo sem SEM_SOLUCAO (0 / 0 / 0);
o 12 × 30 e o trapézio da F24 iguais. Testes novos (reprovam sem a correção): o alinhamento — centro, encontro com
parede interna, longe demais (`blueprintSobrado`); o serviço com fachada nos dois L (`blueprintCasaAutomatica`).

### F27-D — os 3 pavimentos: decisões e subfases (18/10/2026)

| Pergunta | Resposta |
|---|---|
| O 2º pavimento tem o tamanho dos de baixo? | **Recuado com terraço** — o 2º menor, sobre o 1º; o resto da laje do 1º vira terraço descoberto (impermeabilizado, com guarda-corpo); o telhado cobre só o 2º |
| Como entregar? | **Em subfases publicadas** — cada uma medida e no ar; a opção "3 pavimentos" só aparece na tela quando as instalações fecharem |

Inventário (o que supõe "térreo + superior"): os tipos (`pavimentos: 1 | 2`), `ResumoDoSobrado` (um nível de cima, uma
escada), a implantação (`pav = sobrado ? 2 : 1`, a altura de 2 andares), `dividirPrograma` (binário, a circulação só em
cima, o escritório no térreo), o ramo do sobrado (2 plantas, 1 corredor, 1 escada, 1 nível novo), os pilares
(`pilaresDoSobrado` em par — em 3 o pilar de cima tem de descer até o térreo), os shafts (`shaftsDoSobrado`,
`shaftDoGrupo`, a previsão da laje rebaixada: em par — o shaft do 2º atravessa o 1º), o guarda-corpo do furo no
intermediário, o telhado (um retângulo só) e o Automático (térrea → sobrado). Par a par sem redesenho: a escada
empilhada (o U volta ao lado da partida), as janelas alinhadas, a transição, a laje rebaixada, quase todas as
instalações, as premissas e a tela.

Subfases:

1. **D1 — a base**: `pavimentos` 1/2/3 nos tipos, nas premissas e no motor (a tela ainda sem a opção); a implantação
   em N pavimentos (gabarito, altura, CA); o programa em 3 (`dividirEmTres`: térreo social e serviço; o 1º os
   dormitórios e banheiros; o 2º a suíte principal, o banheiro dela e o escritório; a circulação nos dois de cima).
2. **D2 — a arquitetura**: os 3 níveis, o núcleo da escada coerente nas 3 plantas (o corredor do 1º e o do 2º no
   patamar), as escadas empilhadas, as janelas alinhadas par a par; o 2º no seu retângulo recuado.
3. **D3 — a estrutura em prumada**: os pilares de cima descem até o térreo (ou nascem em transição do nível certo), vigas
   e lajes por nível, o guarda-corpo do furo do intermediário.
4. **D4 — as instalações**: o shaft que atravessa os níveis de baixo (parede e cômodo aceitáveis em todos), a laje
   rebaixada por par, o passo do shaft em N; a opção "3 pavimentos" na tela e no Automático (só quando o sobrado não
   comporta e o gabarito deixa).
5. **D5 — o terraço**: o telhado só sobre o 2º, a laje do 1º como cobertura (impermeabilização), o guarda-corpo do
   terraço, o uso TERRAÇO.


#### Registro da D1 (18/10/2026)

- `dividirEmTres` (`utils/blueprintSobrado.ts`): o térreo com o social e o serviço **sem o escritório**; o 2º com a
  suíte principal (a maior), o banheiro dela (pela relação obrigatória) e o escritório; o 1º com o resto. Sem suíte,
  **um** dormitório sobe (o item "Dormitório × 3" fica × 2 no 1º e ganha uma cópia × 1 no 2º — subir o item inteiro
  levaria os três). A circulação existe nos dois de cima (no 2º, uma cópia `circ:2`, com as relações dela).
- A implantação em N (`ImplantacaoDoSobrado.pavimentos`): gabarito em pavimentos e em altura (3 andares), CA dividindo o
  potencial por N, os recuos pela altura de 3; as mensagens dizem "gere o sobrado (2 pavimentos)".
- O motor aceita `pavimentos: 3`: calcula a implantação (o pavimento maior entre o térreo e o 1º, mais o núcleo) e para
  na ARQUITETURA com `MOTIVO_TRES_PAVIMENTOS_EM_OBRA` (nada lançado) — a D2 tira.
- As premissas **continuam** lendo 3 como Automático (nada na tela grava 3 até a D4; ler 3 agora deixaria o seletor da
  tela num valor sem opção).

#### Registro da D2 (18/10/2026)

- O ramo do sobrado gera o 3º nível: `AddLevel` "1º pavimento" e "2º pavimento" (a 2 andares), as três plantas com o
  núcleo recortado (`pavimentoComNucleo` × 3) e **duas escadas em U empilhadas** no mesmo núcleo (a de baixo sai do
  térreo, a de cima do 1º — o U volta ao lado da partida, o patamar do 1º serve às duas). Janelas alinhadas par a par
  (o 1º com o térreo, o 2º com o 1º). O plano fecha depois da arquitetura: as etapas seguintes `NAO_RODOU` com
  `MOTIVO_TRES_PAVIMENTOS_EM_OBRA` (a D3/D4 tiram); a trava (reaplicar no original = o mesmo modelo) vale.
- **O 2º recuado** (`retanguloDoSegundo`): nos fundos, encostado na fachada lateral do núcleo, com a área do programa
  do 2º mais o núcleo × o fator da implantação, na proporção da casa; nunca mais estreito que o núcleo + 3 m; a sobra
  menor que `faixaMinimaDoTerracoMm` (hipótese do sobrado, 1,5 m) o 2º toma. O resto da laje do 1º é o terraço.
- **O corredor do 2º no patamar** (`alinharSegundoAoPatamar`): o gerador põe o corredor numa faixa de lado a lado e a
  planta só se desloca com o retângulo (provado na sonda: mesmas medidas relativas em Y = 0 e Y = 3,25 m). O retângulo
  anda até o meio do patamar cair no corredor; nunca encolhe; o que sairia da casa gera a planta **invertida** (o
  íntimo à frente do corredor — `direcaoDaFrente` +Y). O núcleo pode sobrar fora do retângulo do 2º: o
  `pavimentoComNucleo` passou a fechar também a FACHADA do núcleo quando nenhuma parede a cobre (no térreo e no 1º a
  externa cobre e nada nasce — o teste prova que falha sem isso).
- O dormitório que sobe ao 2º (sem suíte) fica íntimo, atrás do corredor. A escada da casa de 3 sobe de preferência
  para os fundos; não cabendo, nos dois sentidos.
- Medido em 6 lotes/programas (sonda `c:/tmp/f27d`): os 6 lançam, trava ok, programa inteiro; o 2º com 2–4 ambientes
  (suíte de 13,7–22,7 m²), terraço de 55–85 m²; a planta invertida em 3 deles. Antes (alinhamento que exigia o núcleo
  dentro do 2º e encolhia o retângulo): 1 de 6, depois 4 de 6 com suíte de 4–5 m².
- Ficam: o gerador põe cada ambiente do 2º numa linha de lado a lado (banheiro de 5,40 × 1,40 m); com programa pequeno
  (1 dormitório no 1º) o 1º preenche a laje inteira (dormitório de 59 m²) — o Automático só escolherá 3 pavimentos
  quando o sobrado não comporta (D4); a porta para o terraço sai da "entrada" do gerador, que na planta invertida fica
  nos fundos — a D5 confere o acesso ao terraço da frente.

#### Registro da D3 (18/10/2026) — a estrutura em prumada

- `pilaresDoTerceiro` (`utils/blueprintSobrado.ts`), depois do `pilaresDoSobrado` intocado (térreo e 1º): os pilares
  do 1º com parede do 2º em cima continuam; o planejador do 2º completa e cada pilar novo desce a PRUMADA inteira — ao
  1º (parede embaixo, ou nasce na viga de transição do 1º) e ao térreo (parede, ou nasce na viga de transição do
  térreo). A prumada que não chega ao chão sai, dita na pendência. A escorregada da F23 sobre porta/janela, contra as
  paredes dos dois de baixo.
- Vigas: as do 2º e as de TRANSIÇÃO do 1º (`trechosDeTransicao(m, S, G)` + `vigasDeTransicao(…, S, …)`), com a
  pendência "confira com o calculista". Lajes do 2º. Fundação e eixos só no térreo. Telhado sobre o 2º (o retângulo
  recuado).
- Guarda-corpo do furo da escada só no 2º (`guardaCorpoDaEscada(…, comGuardaDoFuro)`): no 1º o lance que sobe ao 2º
  sai justamente da borda do furo de baixo — o do sobrado bloquearia a subida. Corrimãos nos lances dos dois lances.
- O plano da casa de 3 fecha depois do telhado (as instalações são a D4; `MOTIVO_TRES_PAVIMENTOS_EM_OBRA` agora diz
  isso). Teste: todo pilar do 2º com pilar (ou viga) embaixo no 1º e no térreo; vigas, lajes e telhado só no 2º; o
  guarda-corpo do furo só no 2º.
- Medido nos 6 lotes da sonda: os 6 lançam a estrutura (13–18 pilares no 2º; 4–8 vigas de transição no 1º; 1 pilar
  sem prumada num lote, dito). Ficam para a D5: o telhado não cobre o núcleo que sobra fora do 2º; a laje do 1º no
  terraço sem impermeabilização nem guarda-corpo. Fica para conferir: as fundações não pesam os 3 pavimentos (o
  pré-dimensionamento é o do bloco por pilar de sempre).

#### Registro da D4 — parte 1 (19/10/2026): as instalações rodam nos três

- O shaft atravessa os pavimentos do meio: `lugarDoShaft`/`shaftsDoSobrado`/`shaftJuntoDasPecas`/`shaftDoGrupo`
  ganharam `intermediarios` — o shaft de um banheiro do 2º precisa, também no 1º, de parede embaixo da face (1ª
  passada) ou de caixa em cômodo que aceite (2ª), sem pilar nem peça; desce do térreo ao 2º (`AddNucleo` T → G).
- O passo do shaft junto das peças anda pavimento a pavimento (no sobrado, uma volta só — igual).
- A previsão da laje rebaixada (`zonasMolhadasDeCima(x, niveis, k)`) repete a sequência das instalações (shafts do
  F12c de cada pavimento de cima, mobiliário de todos, shafts junto das peças de baixo para cima até o `k`); a laje do
  1º desce sob a área molhada dos banheiros do 2º.
- `instalacoes([T, S, G])`: âncoras, mobiliário, louças, hidráulica, elétrica, climatização, eletrodutos e forro nos
  três (os circuitos contados "no 1º/no 2º"). O plano da casa de 3 não para mais antes das instalações.
- 8 casas de referência idênticas; teste: as etapas rodam (a climatização sem catálogo, dita), shaft T → 2º, esgoto em
  todo banheiro do 2º, a laje do 1º em duas cotas, pontos elétricos nos três.
- **A opção "3 pavimentos" segue escondida** (decisão: só quando as instalações fecharem). A sonda dos 6 lotes mostra
  o que falta (D4 parte 2): encontros de rede (1–9 por casa), banheiro do 2º sem lugar de shaft junto das peças, um
  grupo de esgoto procurando shaft no "Escada", esgoto com 2 pontas abertas e 4 trechos sem destino, a água quente do
  chuveiro do 2º a 2 kPa (logo abaixo da caixa d'água), prumadas de alimentador e condutor pelo meio de cômodo. A tela,
  as premissas e o 3º passo do Automático estão prontos e guardados (`c:/tmp/f27d/d4_opcao_tela.patch` e os pares do
  motor em `c:/tmp/f27d/patch_d4_tela.py`).

#### Registro da D4 — parte 2a (19/10/2026): o tubo de queda que atravessa o 1º

- **Esgoto do 2º sem destino** (2 pontas abertas e 4–6 trechos sem destino em TODOS os lotes de 3): o planejador de
  esgoto puxava o TQ de cada pavimento de cima direto para o térreo, com a cota do pavimento logo abaixo da origem — no
  sobrado é o térreo; no 2º é o 1º, e o trecho que atravessa o 1º não nascia (a ponta de cima do TQ do térreo ficava
  aberta). Agora um trecho do TQ em cada pavimento do meio (do teto, ou da chegada do ramal, ao piso — a cota 0 é o
  teto do de baixo, `fazerChave`) e o do térreo nasce no teto dele. Teste novo de 3 pavimentos no
  `blueprintEsgotoAutomatico.test.ts` (falha sem a correção). Medido: 0 ponta aberta, 0 sem destino nos 6 lotes.
- **Núcleo**: a preferência da D2 pela escada subindo para os fundos fazia o núcleo comer o banheiro do 1º (10 × 30:
  3,38 m², a caixa sifonada dentro da escada) — com o 2º alinhando nos dois sentidos, a escolha volta ao critério do
  sobrado (o que menos estraga os ambientes). Num lote o núcleo passa a comer o lavabo do térreo (1,33 m²) — dito.
- **O que falta para fechar** (sonda dos 6 lotes): o banheiro da suíte do 2º sem shaft junto das peças em 4 de 6 —
  na planta invertida ele fica na frente do retângulo recuado, sobre os dormitórios do 1º: só a parede da fachada lateral
  tem parede embaixo nos três, e ali há janelas do 1º e do térreo. Daí o tubo de queda e as colunas pelo meio do
  dormitório do 1º, e boa parte dos encontros de rede (0–8). Também: a água quente do chuveiro do 2º a 2 kPa (logo
  abaixo da caixa d'água) em 2 lotes.

#### Registro da D4 — parte 2b (19/10/2026): o banheiro do 2º colado na escada

Decisão do usuário (19/10/2026), à pergunta "o banheiro da suíte do 2º cai sobre os dormitórios do 1º, sem parede
embaixo para o tubo de queda — como resolver?": **"Colado na escada"** (o shaft desce pelas paredes do núcleo, que
existem iguais nos três pavimentos e não têm janela).

- `banheiroAlemDoNucleo` (`utils/blueprintSobrado.ts`): o banheiro da suíte vai além da PONTA do núcleo, na largura dele
  (encostado na fachada), da parede de topo até o fim da faixa da suíte; a suíte fica com a faixa ao lado, na
  profundidade toda, encostada no corredor. Só quando suíte e banheiro formam um retângulo do lado para onde o núcleo
  avança e os dois ficam acima das medidas mínimas — senão nada muda.
- O gerador ganhou `EntradaDoGerador.rearranjar` (o ajuste dos ambientes já arranjados, antes das paredes; os lados
  externos recalculados pela borda) — ausente, o gerador é o de sempre (8 casas idênticas).
- O 2º gera do lado certo: de frente quando a escada sobe para os fundos, invertido quando sobe para a frente (o outro
  sentido só se este não fechar) — a suíte fica sempre do lado para onde o núcleo avança.
- Medido nos 6 lotes: o shaft térreo → 2º nasce em todos com suíte no 2º (5 de 5), encostado na parede de topo do
  núcleo; sumiram "Shaft: Banheiro da suíte não tem lugar" e a pressão da água quente do 2º; banheiro 6,0–9,2 m²,
  suíte 15,3–21,8 m². Encontros de rede por lote: 1 / 6 / 6 / 1 / 0 / 1 (antes 3 / 5 / 8 / 5 / 0 / 5).
- Ainda: prumadas pelo meio do dormitório do 1º (condutor vertical, ventilação, alimentador, água fria) e 0–3 tubos
  atravessando pilar.

#### Registro da D4 — parte 2c e o fechamento (19/10/2026)

- **O alimentador pelo shaft** (`rotaPelasParedesAte`): a subida que ficaria sem parede em algum pavimento de cima (a
  fachada do 2º recuada: "a fachada não tem parede no 2º") subia pelo meio da suíte do 1º — agora sobe pelo shaft que
  liga a entrada à caixa (`raioDoShaftDaSubidaMm`, padrão 4 m, hipótese). Teste novo (falha sem a correção).
- **A opção "3 pavimentos" na tela** (decisão: "só quando as instalações fecharem" — fecharam: toda rede ligada, sem
  ponta aberta nem trecho sem destino, o shaft do 2º pela parede de topo do núcleo, a pressão atendida): o seletor
  grava 3 (as premissas leem 3), o resumo diz as duas escadas e o terraço, o botão "Lançar os três pavimentos".
- **O Automático** (decisão: "só quando o sobrado não comporta"): térrea; não comportando, o sobrado; e só se o sobrado
  também não comporta (`terreaNaoComporta` sobre ele) E o gabarito da zona deixa 3, a de 3 — fica a de menos
  problemas. O sobrado escolhido à mão que não comporta ganha a pendência "em Automático ou 3 pavimentos, a casa sobe
  mais um". Medido: R1-B 15 × 30 → sobrado (comporta); 10 × 30 4 dorm. → térrea (o sobrado comporta, mas tem mais
  problemas); 12 × 30 → térrea (comporta) — a de 3 não foi tentada em nenhum.
- **Fica para a D5 (terraço) e o item 5 (qualidade)**: na faixa da frente do 1º, sob o terraço, ainda atravessam o
  cômodo o condutor do telhado do 2º (o beiral cai sobre o terraço), uma coluna de água fria e uma ventilação de peças do
  térreo; encontros de rede 0–7 por lote (sobrado: 0); 0–3 tubos atravessando pilar.

#### Registro da D5 (19/10/2026) — o terraço

- **Guarda-corpo** (`contornoDoTerraco`): no perímetro da laje do 1º que o 2º não cobre (menos os lados do retângulo
  recuado na borda da casa e o núcleo na fachada), no piso do 2º, 1,10 m (a altura do padrão de guarda-corpo do app). Medido:
  29–38 m por lote.
- **Porta para o terraço** (`portaParaOTerraco`): sem porta do 2º para o terraço, a maior janela de cômodo seco numa parede
  que dá para ele vira porta de correr (a mesma largura, do piso à altura da porta).
- **Telhado sobre o núcleo que sobra fora do 2º**: entra como anexo (uma água caindo para fora) na etapa do telhado.
- **A água do telhado do 2º** (antes descia pelo meio do dormitório do 1º em todos os lotes):
  - `planejarCalhas`: o bocal prefere a ponta do beiral que NÃO cai sobre laje de pavimento de baixo (desce por fora da
    casa); com as duas (ou nenhuma) sobre laje, a regra de sempre;
  - `planejarCondutores` (`descidaDoTerraco`): a fonte sobre o terraço desce ao piso dele, corre no enchimento do
    contrapiso (`HipotesesPluviais.cotaNoTerracoMm`, 80 mm, hipótese) até a fachada mais perto que tem parede em todo
    pavimento até o destino (fora de pilar) e desce POR FORA, rente à face externa — por dentro dividia a faixa com o
    eletroduto do 1º. Teste novo (falha sem a correção). Medido: nenhum condutor pelo meio de cômodo nos 6 lotes.
  - a 120 mm o horizontal cruzava o eletroduto em 4 lotes (a 80 mm, em 2): no modelo de cotas o piso do terraço e o teto
    do 1º são o mesmo plano, e o eletroduto do 1º corre rente à fachada logo abaixo dele — fica para o item 5 (o
    eletroduto, traçado depois, desviar dos tubos já lançados).
- **Impermeabilização no orçamento**: `lajesDescobertas` (o último pavimento pelo centro, como antes; a laje de pavimento
  intermediário na parte fora do telhado e dos cômodos de cima, por amostragem de 25 cm) alimenta a medida nova
  `AREA_LAJE_DESCOBERTA` ("Laje descoberta (terraço) — área a impermeabilizar", escopo telhado) e a contribuição pluvial
  (o terraço entra na chuva — com ele a projeção de uma casa de 3 passa de 100 m² e a intensidade tem de ser informada,
  NBR 10844 5.1.4). O sobrado inteiro coberto dá zero (teste).
- 8 casas de referência idênticas. Fica: a ventilação e uma coluna de água fria de peças do térreo sob o terraço ainda
  sobem pelo dormitório do 1º (item 5); o uso TERRAÇO como ambiente (o kernel não tem — o terraço não é cômodo fechado).

### Item 5 — qualidade da casa de 3 pavimentos (19/10/2026, "sim" para começar pelos encontros de rede)

Retrato (6 lotes de 3 pavimentos, com a chuva informada): 19 encontros de rede ao todo. Causas: (A) dentro do shaft — o
tubo de queda no canto oposto ao banheiro, o ramal atravessava o shaft cortando as colunas de água (8); (B) a
ventilação × a fria na faixa rente à fachada da frente (2); (C) o eletroduto do teto do térreo × o esgoto na laje
rebaixada, e o do 1º × o condutor sob o terraço (4); (D) tubo atravessando pilar (4).

#### 5.1a — o tubo de queda no canto do banheiro

- `lugarNoShaft(…, pertoDe)`: das posições livres do shaft, a que o caminho reto do ramal (das peças ao canto) não passa
  colado numa prumada de outra rede; entre elas, a mais perto das peças. O esgoto passa o centro do grupo.
- A coluna da água com faixa (a quente), no shaft, vai à rotação mais longe das peças do grupo dela.
- Testado e descartado: a quente fugindo das peças de ESGOTO em volta do shaft — o sobrado de referência ganhava 2
  encontros. Medido: 19 → 16 encontros (10 × 30 4 dorm. 6 → 2; 12 × 30 sem suíte 0 → 1); 8 casas de referência
  idênticas. Resta no R1-A: a peça de esgoto a 6 cm da coluna da quente dentro do shaft — nenhum canto resolve.

#### 5.1b — a ventilação do térreo sob o terraço: válvula de admissão de ar (19/10/2026)

Retrato: o vaso do lavabo da frente (12 × 30 e 15 × 25) — a coluna de ventilação procura a parede que existe em TODOS
os pavimentos de cima; sob o terraço o 2º não tem parede, e ela subia na saída do vaso (a 20 cm da parede), cruzando a
água fria que desce para ele e atravessando o dormitório do 1º.

Decisões do usuário (19/10/2026): primeiro **"liga no tubo de ventilação"**; medido, a coluna de ventilação mais perto
no térreo não existe (as colunas começam no 1º e no 2º, nos shafts, a 7,5–12 m) — perguntado de novo com o número: **"Válvula
de admissão de ar"**.

- `planejarVentilacao`: a peça sem parede comum até o telhado mas com parede no pavimento dela ganha a ventilação
  rente à parede só até a VÁLVULA DE ADMISSÃO DE AR (peça `TIPO_DA_VALVULA_DE_ADMISSAO_DE_AR`, sem ficha — não é fonte
  de esgoto), a `HipotesesDeEsgoto.valvulaAbaixoDoTetoMm` (300) do teto; aviso "confira a aceitação local e o acesso".
  `valvulaDeAdmissaoDeAr: false` volta ao de antes. `ondeAColunaSobe(…, soEstePavimento)`.
- `verificarVentilacao`: a coluna que termina numa válvula está acima da cobertura (não é estendida).
- Medido: nenhuma ventilação pelo dormitório do 1º nos 4 lotes; o encontro ventilação × fria sumiu (12 × 30, 15 × 25).
  Teste novo (falha sem a correção). 8 casas de referência idênticas.

#### 5.1c — o grupo C: a régua de cotas entre os pavimentos (19/10/2026, "siga pelo grupo C")

Causa comum: a régua das chaves (`fazerChave`) põe a cota 0 de um pavimento no TETO do de baixo, mas o andar real tem
10 cm a mais (a laje). O que corre na laje do pavimento de cima (cota negativa) fica, no espaço, colado na faixa do
eletroduto do de baixo (a 4,5 cm do teto) — e o traçado do eletroduto não o via.

- O condutor sob o terraço: `cotaNoTerracoMm` 80 → 40 (hipótese) — inteiro na faixa da laje, acima do eletroduto do
  1º, mesmo com o caimento. 12 × 30 e 15 × 25: 0 encontros.
- `ramaisDaLajeDeCima` (`utils/blueprintRotaPeloForro.ts`): os horizontais de outra rede na laje do pavimento de cima
  cuja cota REAL (pelas elevações) encosta na faixa viram obstáculo; o eletroduto os contorna como contorna pilar (os
  dois pontos de desvio do `planejarEletrodutos`). O ramal do banheiro do 1º entre a parede dele e o shaft colado (fora
  da laje rebaixada) cruzava o eletroduto rente àquela parede — 10 × 30 4 dorm.: 0 encontros. Testes novos.
- Medido: 19 → 10 encontros nos 6 lotes (R1-A 7, 12 × 30 sem suíte 1, 10 × 30 2 dorm. 2; os outros 3, zero). 8 casas de
  referência idênticas.

#### 5.1d — o grupo D: rede atravessando pilar (19/10/2026, "vamos em frente")

Quatro casos nos 6 lotes, três causas:

- **O interruptor na face do pilar** (R1-A, 2º): o ponto junto à porta caía na borda do pilar do encontro, e o eletroduto
  descia rente ao concreto. `pontoJuntoAPorta` (e `comandosDeIluminacao`) recebem as pegadas dos pilares: o ponto anda
  para além do pilar, do mesmo lado da porta (com a margem do vão, 60 mm). As tomadas já faziam isso (F9).
- **O nó do forro do lado errado da parede** (10 × 30 4 dorm., 2º) e **a fria que sai do shaft** (R1-A, térreo, a
  máquina de lavar): a descida corria na parede, abaixo da viga, pelo pilar do encontro; o escorregão do nó não achava
  lugar porque o caminho no forro cruzava parede/viga, ou o ponto da descida caía no shaft. Último recurso novo em
  `descidaDoForro`: o nó passa sobre a parede no forro (como a própria árvore) e pode descer dentro do shaft — as colunas
  de verdade nele seguem conferidas pelo `livre`.
- **O pé do condutor do terraço dentro do afastamento** (10 × 30 4 dorm.): de dentro, o contorno por fora não achava
  caminho e o horizontal enterrado saía em reta por baixo do pilar da fachada. `saidaDoAfastamento`: o pé sai em reta,
  pelo lado mais curto que não entra em outro obstáculo (até 2 m), antes do contorno.
- Medido: 4 → 0 redes em pilar nos 6 lotes; encontros de rede seguem 10; trava ok nos 6. 8 casas de referência
  idênticas. Testes novos (falham sem a correção): interruptor com pilar (`blueprintNbr5410Iluminacao`), "nenhuma rede
  atravessa pilar" na casa de 3 do R1-A e no 10 × 30 4 dorm. (`blueprintCasaAutomatica`).

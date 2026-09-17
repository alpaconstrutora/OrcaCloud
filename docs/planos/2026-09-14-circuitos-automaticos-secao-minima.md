# Planta Inteligente — Circuitos automáticos + seção mínima por função

**Data:** 14/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído e verificado

## Pedido original

> 1. Criação automática de circuito:
> 1.1 por ambiente
> 1.2 Por carga máxima
> 1.3 Por função: Iluminação, tomadas de uso geral (TUGs) e tomadas de uso específico (TUEs, como chuveiros, ar-condicionado e micro-ondas) devem ficar em circuitos independentes.
> 2. secao mínima dos condutores eletricos
> 2.1. TUG: a seção mínima de 2,5 mm².
> 2.2. bTUE: a seção mínima de 4,0 mm².
> 2.3. Iluminação: 1,5 mm² (quando em circuito exclusivo).

## Contexto

O circuito nascia à mão (rodapé "Novo circuito" do Quadro de cargas, ou
"Criar novo…" no select "Ligar a…"), com seção e disjuntor vazios. O
pré-dimensionamento conhecia a Tab. 47 (luz 1,5 · força 2,5), mas TUE caía em
força e nada era pré-preenchido. O eletroduto automático só entra em ponto
**com** circuito — cada cômodo custava um clique. Este pedido fecha a lacuna
com o mesmo molde dos eletrodutos: **o sistema propõe, o usuário confirma,
Ctrl+Z desfaz o lote**.

## Decisões

Com o usuário (14/09):

| Tema | Decisão |
|---|---|
| Critérios | Função SEMPRE separada (luz / TUG / TUE). O usuário escolhe como dividir luz e TUG: `ambiente` (sugerido) · `carga` · `funcao` (um por função) |
| Carga máxima padrão | 10 A × tensão do quadro (1.270 VA em 127 V; 2.200 em 220 V), editável como hipótese |
| TUE / ligação direta | um circuito por ponto |
| Seção mínima | circuito automático nasce com `secaoMm2` = mínimo da função (1,5 · 2,5 · 4,0); pré-dim acusa declarado < mínimo, também em circuitos manuais; **4,0 para TUE é hipótese nomeada** (a Tab. 47 pede 2,5 para força) |

Minhas (D1–D5):

- **D1** ponto sem potência conta 0 VA e vai junto; a prévia marca "k sem VA" e oferece "Preencher potências pela norma". O planejador não inventa carga.
- **D2** grupo por ambiente que estoura a carga máxima divide em "TUG Cozinha 1 / 2", enchendo na ordem canônica; ponto único acima do máximo fica sozinho.
- **D3** TUG de `COZINHA_SERVICO` sempre em circuito próprio, em qualquer critério — senão a `regra9532` acusaria o plano recém-criado.
- **D4** TUE nasce com 4,0 mesmo quando a corrente pede mais (chuveiro 5.500 W): o pré-dim acusa e "usar sugerido" corrige. Seção pela corrente é cálculo, não padrão.
- **D5** interruptor acompanha a iluminação do próprio ambiente (senão a primeira do plano; sem nenhuma, fica de fora); `DADOS_*` e ponto sem tipo ficam fora, listados com motivo.
- Só pontos **sem circuito do pavimento ativo**; nada é religado. Circuito herda `tensaoV` e `ligacao` do quadro (FFF não propaga → `null`).
- **Sem campo novo no kernel** (sem bump de `KERNEL_VERSION`): a prévia é a proposta. Ligar os pontos no MESMO lote que cria os circuitos exige prever os ids (`cir_000N`, sequencial por `model.seq`); `conferirPlano` simula o lote antes de gravar e recusa se a previsão não bater.
- Achado de TUE entre 2,5 e a hipótese é **AVISO** (não barra a emissão do executivo, que só olha FALTA); abaixo de 2,5 continua FALTA da Tab. 47.
- ⚠️ `secaoMinimaTueMm2` entra no `stableStringify(hip)` de `hashDaBaseEletrica`: emissões anteriores passam a "base alterada". Honesto — a hipótese muda o cálculo.

## O que mudou

| Arquivo | Mudança | Pronto quando |
|---|---|---|
| `utils/blueprintCircuitosAutomaticos.ts` (novo) | `planejarCircuitos`, `pontosElegiveis`, `quadrosDoNivel`, `proximoNumeroDeCircuito`, `idsPrevistos`, `secaoMinimaDaFuncaoMm2`, `cargaMaximaEfetivaVA`, `conferirPlano`; critérios e hipóteses | `__tests__/blueprintCircuitosAutomaticos.test.ts` (17) verde ✅ |
| `utils/blueprintEletricaDimensionamento.ts` | `UsoDoCircuito` + `'TUE'`; `SECAO_MINIMA_POR_USO_MM2` só norma; `secaoMinimaPorUsoMm2(uso, hip)`, `secaoMinimaDaNormaMm2`, `ROTULO_DO_USO`; `usoDoCircuito` TUE > FORCA > ILUMINACAO; `HipotesesEletricas.secaoMinimaTueMm2 = 4`; achado FALTA/AVISO | `blueprintEletricaDimensionamento.test.ts` (+3) ✅ |
| `hooks/useBlueprintEletrica.ts` | `hipotesesDaColuna` lê `secaoMinimaTueMm2` (coluna antiga → padrão) | typecheck ✅ |
| `components/blueprint/PainelPreDimensionamento.tsx` | campo "Seção mínima de TUE" nas hipóteses; resumo `TUE ≥ 4 mm²`; AVISO em âmbar na linha; tooltip "hipótese TUE" | `PainelEletricaPreDim.test.tsx` (+1) ✅ |
| `utils/blueprintEletricaExecutivo.ts`, `utils/blueprintPranchaEletrica.ts` | linha de hipóteses cita `TUE ≥ X mm² (hipótese)` | executivo tests ✅ |
| `components/blueprint/BlueprintEditor.tsx` | tarefa `circuitos` (ribbon Instalações › Elétrica, antes de Eletrodutos, com contagem de elegíveis); drawer com hipóteses, quadro/critério/carga, prévia, fora do plano, status; rodapé "Criar N circuito(s)" via `conferirPlano` + `runBatch` (um undo); aviso de eletrodutos ganhou "criar circuitos" | `BlueprintEditor.test.tsx` (+3) ✅ · `check-ui-standard.sh` ✅ |
| `components/blueprint/PainelEletrica.tsx` | `nomeSugerido` usa `proximoNumeroDeCircuito` (uma conta para os dois caminhos) | `PainelEletrica.pontoSolto.test.tsx` ✅ |

## Verificação

- `npx tsc --noEmit` 0 · suíte completa **314 arquivos / 4153 testes** verde · `npm run build` ok · `blueprintKernelGoldens` intacto (sem bump).
- `bash scripts/check-ui-standard.sh` em `BlueprintEditor.tsx`, `PainelPreDimensionamento.tsx`, `PainelEletrica.tsx`: sem violação.
- **App real** (vite 3147, Playwright, escritas a `/rest/v1/**` bloqueadas — 17 abortadas, 0 erros JS): planta com 5 pontos soltos (luz, interruptor, 2 TUG num ambiente, 1 TUG fora) e QDC sem tensão → ribbon "Circuitos automáticos 5" · prévia por ambiente: `C1 — Iluminação Ambiente 1` (2 pts, 100 VA, 1,5) · `C2 — TUG Ambiente 1` (2, 200, 2,5) · `C3 — TUG Fora de ambiente` (1, 100, 2,5); legenda "padrão 10 A × 127 V — quadro sem tensão, assumida"; fonte mínima 12 px, sem transbordo · "Um por função" → 2 linhas · "Criar 3 circuito(s)" → status "3 circuito(s) criado(s) para 5 ponto(s) — Ctrl+Z desfaz", ribbon 0 / Quadro de cargas 3 · Quadro de cargas: seções 1,5 / 2,5 / 2,5 gravadas · **um** Desfazer → 5 / 0 de novo. Capturas olhadas.

---

## 17/09/2026 — o quadro pode estar em OUTRO pavimento

### Pedido original

> verifique por que o botão para criar circuitos automáticos no primeiro pavimento da planta
> aberta no app não está ativado? → (diagnóstico) → **"elimine essa regra. não faz nenhum
> sentido: regra atual exige um quadro no mesmo pavimento"**

### Diagnóstico (banco, leitura)

Planta 14/09/2026: Térreo com 28 pontos, todos já em 9 circuitos do QDC → "Nenhum ponto sem
circuito" (correto). Pavimento 1 com 28 pontos sem circuito e **nenhum quadro** → a regra
"circuito nasce no quadro do mesmo piso" bloqueava o Criar.

### O que mudou

- `quadrosDoNivel(model, levelId)` devolve TODOS os quadros do desenho, os do próprio piso
  primeiro (o padrão continua sendo o quadro do piso quando existe); `pavimentoDoQuadro` dá o
  nome do piso para o seletor.
- `planejarCircuitos` não recusa mais quadro de outro pavimento; sem quadro nenhum o motivo é
  "sem quadro no desenho".
- Tarefa: com 2+ quadros o seletor mostra "QDC (Térreo)" para os de outro piso; com um só de
  outro piso, a linha "Quadro **QDC** (Térreo)"; o aviso passou a "Insira um Quadro… no
  desenho… em qualquer pavimento".
- Fica para depois: **Lançar eletrodutos** ainda traça a rede a partir do quadro do mesmo piso;
  circuito no QDC do térreo para pontos do andar de cima precisará de prumada entre pisos.

### Verificação

- `blueprintCircuitosAutomaticos.test.ts`: "sem quadro nenhum" + novo "quadro de OUTRO pavimento
  vale". Suíte cheia 4417, tsc, check-ui, build.
- App real (escritas bloqueadas: 14): Pavimento 1 ativo → botão com 28, tarefa com "QDC (Térreo)",
  prévia de 9 circuitos, **Criar 9 circuito(s)** habilitado.

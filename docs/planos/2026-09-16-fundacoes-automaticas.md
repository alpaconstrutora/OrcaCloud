# Planta Inteligente — Lançamento automático de fundações (blocos de coroamento e estacas)

**Data:** 16/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído e verificado

## Pedido original

> Implemente também estacas e blocos de coroamento

## Contexto

Fecha o grupo Estrutural automático: pilares (15/09), vigas e lajes (16/09) e agora a fundação.
Mesmo molde (planejador puro → prévia → um `runBatch` provado → Relançar por tipo). `ESTACA`
(PONTO circular, `larguraMm` = Ø, `alturaMm` = comprimento, `baseMm` negativo) e
`BLOCO_COROAMENTO` (PONTO retangular) já são tipos do kernel. Peça enterrada não cruza o piso:
não sobrepõe parede (nada cede) e não entra no arranjo — ambientes não mudam. **Sem campo novo
no kernel, sem bump.**

**O que isto NÃO é**: dimensionamento de fundação (NBR 6122 exige sondagem). Tudo aqui é
hipótese nomeada na gaveta; o lançamento marca onde e com que dimensões declaradas.

## Decisões

Com o usuário (16/09):

| Tema | Decisão |
|---|---|
| Estacas por bloco | 1 (padrão), editável para 2 (bloco alongado no eixo do pilar, 3Ø entre eixos) |
| Dimensões | Ø 30 (25/30/40) × 8 m (6/8/10/12); bloco h 60 (40/50/60/80); lado = max(Ø + 30, pilar + 20) a cada 5 cm; topo do bloco 50 cm abaixo do piso; estaca começa na base do bloco |
| Ribbon | Um botão "Fundações automáticas"; bloco + estacas num lote |

Minhas:

- **D1** Um bloco por pilar do pavimento ativo (`pilaresExistentesNoNivel`), centrado e girado com o pilar. Sem pilar → motivo 'lance os pilares antes'.
- **D2** Bloco de 2 estacas: `lc = arred5(4Ø + 30 cm)` ao longo do eixo do pilar (`rotacaoDeg`), largura `lb`; estacas em ±1,5Ø.
- **D3** `bloco.baseMm = −(arrasamento + h)`; `estaca.baseMm = bloco.baseMm − comprimento`. Arrasamento editável (30/50/80 cm).
- **D4** Pilar já tem bloco quando um bloco existente contém o centro do pilar (`pointInPolygon(contornoEmPlanta)`); a estaca não é conferida à parte.
- **D5** Pavimento ativo; aviso quando não é o de menor `elevationMm`.
- **D6** Rótulos `B<n>`/`E<n>`; comandos: todos os blocos, depois todas as estacas; `conferirPlanoDeFundacoes` confere ids nessa ordem.
- **D7** Relançar apaga blocos + estacas do pavimento.
- **D8** `PecaPrevista.circular`: o canvas desenha a estaca como círculo (arco); bloco como retângulo; rótulo só no bloco.
- Dois pilares mais perto que um bloco: aviso na linha ("bloco sobrepõe o do pilar Pn — unifique à mão"), não impedimento.

## O que mudou

| Arquivo | Mudança | Pronto quando |
|---|---|---|
| `utils/blueprintFundacoesAutomaticas.ts` (novo) | hipóteses, `ladoDoBloco`, `comprimentoDoBlocoDeDuas`, `planejarFundacoes`, `relancarFundacoes`, `conferirPlanoDeFundacoes`, `fundacoesExistentesNoNivel` | `__tests__/blueprintFundacoesAutomaticas.test.ts` (9) verde ✅ |
| `utils/blueprintPilaresAutomaticos.ts` | `PecaPrevista.circular` (pegada usa `circular`) | testes de pilares (25) ✅ |
| `components/blueprint/BlueprintCanvas.tsx` | prévia circular com `ctx.arc` | typecheck ✅ · app real ✅ |
| `components/blueprint/BlueprintEditor.tsx` | tarefa `fundacoes`; hipóteses persistidas (`blueprint:fundacoesAutomaticas`); botão `SquareStack`; gaveta (5 selects, prévia Pilar · Bloco · Estacas · Topo, faixas, status); rodapé Relançar/Lançar; casos em `pecasPrevistas` e `previaRecolhida` | `BlueprintEditor.test.tsx` (+2, 90) ✅ · `check-ui-standard.sh` ✅ |

## Verificação

- `npx tsc --noEmit` ✅ · suíte completa 326 arquivos / 4305 testes ✅ · `npm run build` ✅ · goldens intactos.
- App real (vite 3147, Playwright, escritas a `/rest/v1/**` abortadas — 18, 0 erros JS): pilares lançados (66 + 2 existentes) → "Fundações automáticas 68" → prévia "P1 · B2 · 60 × 60 × 60 · 1 × Ø 30 · 8,00 m · −0,50"; 2 estacas por bloco → rodapé "68 bloco(s) · 136 estaca(s)" e prévia com blocos alongados girados com a parede e dois círculos cada; Lançar pela pílula → status; botão zera e "Relançar" aparece; dois Desfazer devolvem pilares (66) e fundações (2 pilares pré-existentes sem bloco). Captura `out-fd/fd-01-previa.png`.

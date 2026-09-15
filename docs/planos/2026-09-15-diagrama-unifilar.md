# Planta Inteligente — diagrama unifilar

**Data:** 15/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído

## Pedido original

> implementar diagrama unifilar

## Decisões

- **Nada novo é calculado**: o unifilar ARRUMA o que o Quadro de cargas já tem
  (`preDimensionarQuadroCompleto`). Disjuntor e seção do ramal são os DECLARADOS;
  sem declaração, o sugerido/calculado entra marcado **"sug."** — sugerido não é
  decisão, e o rodapé diz para declarar no quadro de cargas para assumir.
- **Condutores** pela ligação: FN e FF = 2 carregados, FFF = 3, terra na mesma seção
  — notação corrente `2#2,5 + T2,5`.
- **DR** só onde o circuito declara `protecaoDR`; a legenda do símbolo só entra
  quando ele aparece.
- **Um traçado, dois destinos**: `desenharUnifilar` fala com o `Desenhista`
  (contrato da prancha). O drawer do editor renderiza por SVG (`DesenhistaSvg` em
  `PainelUnifilar.tsx`), a prancha elétrica ganha uma **terceira folha** (PDF e PNG)
  pelo mesmo traçado; na folha um quadro mais largo que o papel é encolhido (`k`),
  porque o barramento é um só e não quebra linha. Na tela rola na horizontal.
- Um diagrama por quadro, empilhados. Só consulta: o que se edita é no Quadro de
  cargas e o desenho acompanha.

## O que mudou

| Arquivo | Mudança |
|---|---|
| `utils/blueprintUnifilar.ts` (novo) | `montarUnifilar`, `condutoresDoRamal`, `desenharUnifilar(d, dg, x, y, k)`, `medidasDoUnifilar`, `rodapeDoUnifilar`, `UNIFILAR` (medidas em mm) |
| `components/blueprint/PainelUnifilar.tsx` (novo) | `DesenhistaSvg` + um `<svg role="img">` por quadro, resumo e rodapé |
| `components/blueprint/BlueprintEditor.tsx` | relatório `unifilar` (drawer 2xl), botão "Diagrama unifilar" em Instalações › Elétrica (contagem = quadros) |
| `utils/blueprintExport.ts` | `desenharFolhaDoUnifilar` (título, quadros empilhados com `k = min(1, útil/largura)`, rodapé, carimbo) |
| `services/blueprintExportService.ts` | prancha elétrica = 3 folhas no PDF (planta · quadro de cargas · unifilar) e 3 PNGs |

## Verificação

- `__tests__/blueprintUnifilar.test.ts` (6): ramais (declarado × sugerido, DR,
  carga, condutores), entrada (geral, alimentador), condutores por ligação, sem
  quadro / sem circuitos, textos do traçado (título, GERAL, C1/C2, In, condutores,
  DR, carga), barramento grosso, medidas × k, rodapé condicional, folha do PDF
  (empilha; 20 circuitos num A4 retrato cabem, `x ≤ largura do papel`).
- `BlueprintEditor.test.tsx` (+2): drawer sem quadro pede um; com QDC + C1 o SVG
  traz "QDC — FN 127 V", "GERAL n A", "C1", "16 A", "2#2,5 + T2,5" e o resumo.
- Suíte completa **320 arquivos / 4201 testes** verde · `tsc` 0 · build ok ·
  `check-ui-standard.sh` em `BlueprintEditor.tsx` e `PainelUnifilar.tsx` limpo.
- App real (Playwright, escritas bloqueadas): dois quadros desenhados no drawer,
  fonte mínima fora do SVG 14 px, painel sem transbordo; a captura mostrou "GERAL"
  em cima de "ALIMENTAÇÃO" → rótulo movido para a direita da lâmina.

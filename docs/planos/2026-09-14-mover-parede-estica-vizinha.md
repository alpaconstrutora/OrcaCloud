# Planta Inteligente — mover parede conectada estica a vizinha

**Data:** 14/09/2026 · **Frente:** `planta-ribbon` · **Estado:** ✅ concluído e verificado

## Pedido original

> Ao mover uma parede conectada ela está sendo desconectada, isso não deve ser o comportamento padrão. A parede deve permanecer conectada a outra parede ao mover uma a outra estica (stretch).

## Diagnóstico (reproduzido antes de corrigir)

- O padrão já era **Manter junções** (`blueprint:modoJuncao = 'MANTER'`), e no
  app real um arraste exatamente perpendicular esticava as vizinhas
  (retângulo desenhado no harness: laterais 23,85 → 33,85 m, ambiente mantido).
- O defeito estava na REGRA de `pontasDeslocadas` (kernel): a ponta da vizinha
  andava pela **projeção do delta no eixo dela**. Isso só coincide com o canto
  quando o delta é perpendicular exato à parede movida e a vizinha está no
  esquadro. Em qualquer outro caso a ponta ficava FORA da reta nova da parede
  movida e o canto abria:
  - delta com componente ao longo da parede (orto desligado, ou a correção do
    encaixe/ímã somada ao delta) — `(300, −1000)` numa sala abria os dois cantos;
  - vizinha fora do esquadro (45°) — abria sempre;
  - deslize paralelo com as duas pontas em canto — "geometricamente forçado",
    dizia o comentário; não é.
- Testes de reprodução no kernel: 5 de 8 falhavam antes da correção
  (`__tests__/blueprintMoverEstica.test.ts`).

## Correção

`utils/blueprintKernel/model.ts` — `pontasDeslocadas` com `manterJuncoes`:

1. A junta é a **interseção da reta da vizinha com a reta NOVA da parede
   movida** (`intersecaoDeRetas`, nova em `geom.ts`; quase paralelas → cai na
   projeção antiga). A vizinha estica/encurta sobre a própria reta até lá.
2. **A ponta da parede movida vai ao canto** quando a junta era na PONTA dela
   (L), estendida ou aparada sobre a reta nova — o trim/extend do CAD. Presa
   nos dois cantos, um deslize paralelo não a tira do lugar. Aparar respeita a
   **reserva de aberturas** (`reservaDeAberturas(model)`: quanto de cada ponta
   está livre de vão); se expulsaria uma abertura, a ponta fica rígida (stub) e
   a vizinha morre no corpo — ainda encostada. Estender é sempre possível.
3. T no CORPO: o pé vai ao ponto da reta nova; se o corpo sai de baixo dele,
   `soltas` (não se inventa canto). Colapso e inversão da vizinha também são
   `soltas`, sem abortar o gesto.
4. `TranslateEntities` corrige `offsetMm` das aberturas pelo que a ponta `a`
   andou sobre o eixo — a abertura fica no mesmo lugar do MUNDO.
5. A prévia do canvas passa a mesma `reservaDeAberturas` — prévia = comando.

Sem mudança no payload canônico: `blueprintKernelGoldens` intacto, sem bump.

## Verificação

- `__tests__/blueprintMoverEstica.test.ts` (8): perpendicular igual; delta com
  deriva não abre; 45° acompanha; paralelo preso nos dois cantos não sai do
  lugar; T desliza / solta quando o corpo sai; abertura fica no lugar do mundo
  (offset 500 → 800 e → 200); aparo bloqueado pela abertura vira stub e
  continua encostado; prévia = comando.
- `blueprintKernel.test.ts` "deslize PARALELO": expectativa atualizada para a
  semântica nova (nada solta; `a` volta ao canto; `b` fica em stub porque a
  porta termina no fim da parede).
- Suíte completa: **315 arquivos / 4161 testes** verde · `tsc` 0 · build ok.
- **App real** (vite 3147, Playwright, escritas bloqueadas): retângulo
  desenhado, parede da direita arrastada com **Orto desligado**, Δx 10,00 m ·
  Δy −6,00 m (rótulo da prévia): laterais 23,85 → 33,85 m e 24,16 → 34,16 m,
  parede movida 16,20 m mantida, **Ambientes 7 → 7** (antes, com Δy ≠ 0, o
  anel abria). Capturas olhadas.

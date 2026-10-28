# Unidades pela posição: a posição manda e as vagas valem para o andar inteiro (28/10/2026)

## Pedido original

> "como esta implementado com a organizacao pela posicao? vou te dar um exemplo, todas as unidades com final 7 e 8
> estao com posicão fundos, porem somente as com final 8 estão nos fundos, 7 estao na lateral na planta"

## Causa (reproduzida com o rascunho real da "Planta 26/10/2026" e as unidades do Garden, Torre B)

Andar 1 da Torre B:

| Unidade | Posição | Sol |
|---|---|---|
| 105 | Lateral | Norte |
| 106 | Lateral | Sul |
| 107 | Fundos | Sul |
| 108 | Fundos | Norte |

A frente do lote dá para o sul do desenho (para fora = −y), e a planta não tem norte marcado. Por isso o norte é o
alto do desenho, e **Fundos = Norte** nesta planta.

1. **A posição e o sol eram somados com o mesmo peso.**
   - Na 107, Fundos (+y) e Sul (−y) se anulavam. A unidade ficava **sem direção** e ia para a vaga que sobrasse:
     a da frente.
2. **As vagas eram escolhidas de forma gulosa, na ordem do número.**
   - A 105 (Lateral + Norte) escolhia antes e tomava um canto dos fundos, porque "Norte" ali é fundos.
   - Os cantos tinham direção mais longa (√2), o que distorcia a nota de cada vaga.

## Mudança (`utils/blueprintUnidadesNoPavimento.ts`)

- **A posição manda.** Com a posição presente, o sol pesa 0,3: só desempata e nunca anula nem vira a posição. Sem
  posição, o sol continua valendo inteiro.
- **O aviso de opostos agora diz "Vale a posição".** Sem norte marcado, ele sugere marcar o norte da planta.
- **As vagas são distribuídas pela melhor combinação do andar inteiro** (`melhorAtribuicao`, método húngaro).
  - As direções das vagas passam a ser normalizadas.
  - Empate fica sempre com a vaga de índice menor.

## Verificação

- **Testes:**
  - "Fundos com sol" usa o bloco, a frente e as unidades reais: a 107 e a 108 ficam nos fundos, e a 105 e a 106 nos
    lados opostos da frente.
  - `melhorAtribuicao`: +2.
  - O teste do aviso foi atualizado.
  - A suíte do arquivo passa: 26/26.
  - Painel e ajuste: 28/28.
  - `BlueprintEditor.test.tsx` sozinho: 284/284.
- **Mecânicas:** tsc.

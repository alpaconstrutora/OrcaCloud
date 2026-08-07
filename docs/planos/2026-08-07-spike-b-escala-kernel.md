# Spike B (parte 1) — escala do kernel geométrico

## Pedido original

> qual o proximo passo → "Começar a construir" → coutinua
>
> (após o Spike A) "Próximo passo natural é o Spike B. Quer que eu siga?" → **sim**

Sessão de 2026-08-07. Cobre a metade **headless** do Spike B (PRD §30): o custo
computacional do arranjo planar em 5 mil, 10 mil, 20 mil e 40 mil objetos. A metade
do **renderer** (canvas WebGL × SVG, DP-03) exige navegador e não foi executada aqui.

---

## 1. Por que esta metade primeiro

O Spike A deixou uma pergunta aberta que decidia DP-04: *o gargalo do RNF-003 é o
arranjo planar ou o renderer?* Se fosse o arranjo, Rust voltaria à mesa. Essa metade
é mensurável agora, sem navegador, e é a que reabre ou fecha a decisão.

## 2. Medição inicial — O(n²) confirmado

Grade de salas de 3×3 m, cada linha da grade dividida em segmentos. Números reais:

| paredes | ambientes | tempo total |
|--------:|----------:|------------:|
| 2 112 | 1 024 | 129 ms |
| 4 140 | 2 025 | 504 ms |
| 8 064 | 3 969 | 1 909 ms |
| 19 800 | 9 801 | **11 507 ms** |

Dobrar a entrada mais que triplicava o tempo. Quadrático, como o Spike A previu.

## 3. O que a medição desmentiu

O Spike A apontou `splitAtIntersections` como o gargalo óbvio. **Estava errado.**
Instrumentando as duas metades:

| paredes | `splitAtIntersections` | resto | total |
|--------:|----------:|------:|------:|
| 8 064 | 479 ms | 1 475 ms | 1 954 ms |
| 19 800 | 2 806 ms (24%) | **8 941 ms (76%)** | 11 746 ms |

O suspeito respondia por um quarto do custo. Os três quartos restantes estavam em
lugares que ninguém tinha olhado:

1. **`snapVertices`** — varredura linear sobre todos os vértices já criados, por
   ponto. O(V²), e sozinha a maior fatia.
2. **Dedupe de anéis** — `unique.some(r => r.map(pointKey).join('|') === key)`,
   alocando string contra tudo que já existia. O(F²).
3. **Contenção de buracos** — todos contra todos, com `pointInPolygon` em cada
   vértice do anel.

Ter otimizado o palpite teria comprado 24% e deixado o problema de pé.

## 4. As quatro correções

| Onde | Antes | Depois |
|:---|:---|:---|
| `snapVertices` | Varredura linear O(V²) | Malha uniforme de lado = tolerância; só as 9 células vizinhas |
| Dedupe de anéis | `some()` + `join()` O(F²) | `Set<string>` de chaves, O(F) |
| Contenção | Todos × todos, `every()` sobre o anel | Só entre **componentes conexos distintos**, com rejeição por caixa e teste de **um** vértice |
| `splitAtIntersections` | n²/2 pares | Malha uniforme sobre as caixas; pares candidatos por célula |

A terceira é a mais interessante e não é uma micro-otimização: **num grafo conexo
nenhuma face limitada contém outra** — todas são faces mínimas da mesma subdivisão.
Aninhamento só existe entre componentes distintos (a ilha solta dentro da sala). Um
union-find derruba o teste de O(F²) para zero na planta comum, que tem um componente
só.

## 5. Resultado

| paredes | ambientes | antes | depois | ganho |
|--------:|----------:|------:|-------:|------:|
| 2 112 | 1 024 | 141 ms | 13 ms | 11× |
| 4 140 | 2 025 | 517 ms | 16 ms | 32× |
| 8 064 | 3 969 | 1 954 ms | 34 ms | 57× |
| 19 800 | 9 801 | 11 746 ms | **142 ms** | **83×** |
| 40 044 | 19 881 | (não medido) | 504 ms | — |

`splitAtIntersections` em 20 mil paredes: 2 806 ms → **11 ms** (243×).

## 6. Determinismo preservado — verificado, não presumido

Antes de otimizar, capturei o payload canônico de seis geometrias (três grades, ilha
tripla aninhada, 14 retas oblíquas em posição geral, verticais dentro e fora da
tolerância) da implementação **sem nenhum índice**. Depois de cada rodada de
otimização, `diff` do arquivo inteiro:

```
diff goldens-pre-otimizacao.json bench-result.json  → IDÊNTICO
```

Duas vezes: após as três primeiras correções e após o índice espacial. Os hashes
viraram teste permanente em `__tests__/blueprintKernelGoldens.test.ts`.

Duas armadilhas de determinismo que o índice espacial criou e que precisaram de
cuidado explícito:

- **Ordem total no desempate dos cortes.** Antes, cortes eram ordenados só por
  distância. Com o índice, a ordem de descoberta dos pares mudou, e dois cortes
  empatados em distância passariam a sair em ordem diferente. A comparação virou
  distância → x → y, o que torna o resultado independente da ordem de descoberta.
- **`intersectSegments` não é simétrica.** Ela parametriza sobre o primeiro
  argumento, então o arredondamento do ponto depende de qual segmento vem primeiro.
  A chave do índice é `menor * n + maior`, e o quociente é o MENOR índice — inverter
  os nomes na decodificação produziria cortes 1 mm diferentes. Está comentado no
  código porque é exatamente o tipo de coisa que alguém "limpa" sem perceber.

## 7. O bug que apareceu no caminho — e o viés que o escondeu

Ao montar as geometrias de golden, uma delas devolveu **zero ambientes** para 14
retas que visivelmente se cruzam. Investigando por eliminação:

| geometria | antes |
|:---|:---|
| triângulo fechado oblíquo | 1 ambiente ✓ |
| quadrilátero oblíquo | 1 ambiente ✓ |
| três retas oblíquas cruzando, sem ponta em comum | **0 ambientes** ✗ |

Causa: o ponto de interseção é arredondado para milímetro inteiro e depois validado
por `isStrictlyOnSegment`, que exige **colinearidade exata**. O próprio arredondamento
destrói essa colinearidade. Em planta ortogonal a interseção cai em coordenada
inteira por sorte e nada quebra; em parede oblíqua **todos** os cortes eram
descartados, o grafo planar nunca fechava, e a planta não produzia ambiente nenhum.

Substituído por `isInteriorCut`, que verifica só o que precisa ser verdade: o ponto
está na caixa do segmento e não coincide com as pontas. A pertinência à reta já foi
estabelecida por construção, por quem calculou a interseção.

**O viés que escondeu isso:** os 25 casos do Spike A nasceram todos do helper
`room()` — todos ortogonais. Uma planta real tem paredes oblíquas. Foram adicionados
os casos 26–29 (triângulo, três retas cruzando, quadrilátero irregular, diagonal
cortando sala ortogonal) como regressão permanente.

**E um falso positivo meu:** o primeiro conjunto de 14 retas oblíquas devolvia zero
faces mesmo depois da correção, e eu quase reportei como bug. A álgebra dizia outra
coisa: com deslocamento linear nas duas pontas, `x_i(u) = 9000u + i(700 − 1200u)`, o
termo em `i` zera em `u = 7/12` e **todas as retas são concorrentes num ponto**. Um
feixe não tem face limitada. O kernel estava certo e o dado de teste é que era
degenerado. Com deslocamento quadrático, as mesmas 14 retas produzem 78 faces —
exatamente (n−1)(n−2)/2, o valor teórico para posição geral.

## 8. Conclusão sobre DP-04 e RNF-003

**O kernel não é o gargalo do RNF-003, e Rust não se justifica por esta evidência.**

O raciocínio, explicitando o que os números querem e não querem dizer:

- RNF-003 pede 45–60 fps em pan/zoom e arrasto. **Pan e zoom não recalculam o
  arranjo** — mudam a matriz de visualização. O kernel não está nesse laço. É
  problema do renderer, ou seja, do Spike B parte 2 / DP-03.
- Editar geometria recalcula. Em 20 mil objetos, 142 ms por reconstrução completa.
  Isso é confortável para *fim* de arrasto, e **insuficiente** para arrasto ao vivo a
  60 fps (que pediria ≤16 ms).
- O caminho para arrasto ao vivo não é trocar de linguagem: é **recálculo
  incremental**, que o próprio PRD já exige em RF-065. Recalcular só a vizinhança
  afetada em vez da planta inteira ganha ordens de grandeza a mais do que Rust
  ganharia recalculando tudo.

Recomendação: **fechar DP-04 a favor do TypeScript**, agora com evidência dos dois
lados — determinismo (Spike A) e escala (Spike B parte 1). Reabrir só se o Spike B
parte 2 mostrar que o renderer não atinge o RNF-003 nem com o kernel fora do laço.

## 9. Estado da suíte

```
npx vitest run __tests__/blueprintKernel.test.ts        → 32/32
npx vitest run __tests__/blueprintKernelGoldens.test.ts →   7/7
npx tsc --noEmit                                        → exit 0
npx vitest run                                          → 50 arquivos, 881 testes
```

## 10. Critério de pronto

- [x] Escala medida em 2k / 4k / 8k / 20k / 40k, com números reais
- [x] Gargalo real identificado por instrumentação, não por palpite
- [x] Quatro otimizações aplicadas; 83× em 20 mil paredes
- [x] Determinismo provado por `diff` de golden antes e depois, duas vezes
- [x] Goldens promovidos a teste permanente
- [x] Bug de geometria oblíqua corrigido, com 4 casos de regressão
- [x] Viés ortogonal dos 25 casos originais registrado
- [ ] **Pendente — Spike B parte 2:** canvas WebGL × SVG com 20 mil objetos em
      navegador; é ele que fecha DP-03 e confirma o RNF-003
- [ ] **Pendente:** recálculo incremental (RF-065) — pré-requisito de arrasto ao vivo
- [ ] **Pendente:** o `resto` voltou a dominar (471 ms de 504 ms em 40 mil). Se 40 mil
      virar alvo, o próximo a instrumentar é `extractFaces`

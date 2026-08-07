# Spike A — kernel geométrico: resultado do braço TypeScript

## Pedido original

> qual o proximo passo
>
> (resposta: "Começar a construir")
>
> coutinua

Sessão de 2026-08-07. Executa o Spike A definido no PRD §30 (v1.1), com o braço
TypeScript exigido pela decisão de portão DR-04.

---

## 1. O que foi construído

`utils/blueprintKernel/` — kernel determinístico puro, sem dependência de runtime.

| Arquivo | Papel |
|:---|:---|
| `units.ts` | Milímetros inteiros, tolerância, arredondamento meio-longe-de-zero |
| `geom.ts` | Predicados exatos sobre inteiros, interseção, polígonos, anel canônico |
| `model.ts` | Modelo canônico (Level, Wall, Opening, Boundary, Space) + invariantes §9.1 |
| `arrangement.ts` | Arranjo planar, snap, divisão, half-edge, extração de faces |
| `canonical.ts` | Payload canônico com ordem total + SHA-256 puro |
| `commands.ts` | 9 comandos, diff com ancestralidade, `ModelHistory` com undo/redo |
| `index.ts` | Superfície pública — o contrato que o braço Rust teria que reproduzir |

Testes: `__tests__/blueprintKernel.test.ts` — os 25 casos do PRD §30 mais 3 de
critério de saída.

## 2. Resultado

**28/28 testes passam.** Verificado, não presumido:

```
npx vitest run __tests__/blueprintKernel.test.ts
  Test Files  1 passed (1)
       Tests  28 passed (28)

npx tsc --noEmit        → exit 0
npx vitest run          → 49 arquivos, 870 testes, todos passam (sem regressão)
```

Cobertura dos casos exigidos: junções L/T/X (01–03), tolerância dentro e fora
(04–05), colineares sobrepostas (06), ambientes simples/divididos/com ilha/abertos
(07–11), identidade após edição (12), aberturas no meio, na ponta, fora dos limites,
migrando no split, sobrepostas (13–17), split/merge com ancestralidade (18–21),
determinismo por ordem, undo, redo + idempotência, mil operações sem deriva (22–25).

## 3. Critério de aprovação — atingido

O PRD pede "igualdade bit a bit do payload canônico entre navegador e servidor".
O kernel não importa nada de `node:*` nem de `window`, então a igualdade entre
runtimes vale por construção. O que os testes provam é a parte que **não** é
automática:

- **Caso 22:** a mesma sala desenhada em ordem diferente produz payload e hash idênticos.
- **Caso 25:** mil operações de ida e volta terminam no mesmo hash de um modelo recém-criado.
- **Critério de saída:** cinco construções repetidas produzem um único payload distinto.
- **Critério de saída:** o payload não contém ID de parede (`wal_`) nem o estado do alocador (`seq`).

Três decisões carregaram esse resultado:

1. **Milímetros inteiros.** Predicados de orientação usam produto vetorial inteiro e
   são exatos, não aproximados — a topologia nunca depende de comparação de float.
2. **IDs por contador determinístico**, nunca `crypto.randomUUID()`. Um UUID aleatório
   tornaria a igualdade bit a bit impossível por construção.
3. **SHA-256 próprio.** `crypto.subtle` é assíncrono e `node:crypto` não existe no
   navegador; uma implementação pura é idêntica nos dois lados por construção.
   Validada contra os vetores conhecidos de `""` e `"abc"`.

## 4. O bug que o spike encontrou — e por que ele importa

O caso 09 (ilha) falhou na primeira execução. A causa não era um detalhe de
implementação: era uma **premissa geométrica errada** que eu tinha escrito como se
fosse óbvia.

O código descartava a face externa pela regra "a maior área é a face externa". Isso
vale para um grafo conexo. Com uma ilha solta dentro de uma sala há **dois componentes
desconexos**, e a maior área passa a ser a própria sala externa — um ambiente real,
que era silenciosamente descartado. O resultado: uma planta com ilha reportava um
único ambiente, o menor, e a área da sala principal simplesmente sumia.

Antes de corrigir, sondei a convenção de sinal real do percurso em vez de supor:

```
faces cruas (sala 8×6 m com ilha 2×2 m):  [-48000000, +48000000, -4000000, +4000000]
```

Cada componente produz um par: face limitada positiva, não limitada negativa. A
correção passou a filtrar por **sinal**, não por tamanho. E o anel contido virou
buraco do menor anel que o contém, continuando a ser ambiente por direito próprio —
uma sala fechada dentro de um salão é ao mesmo tempo o vazio do salão e um cômodo.

Vale registrar por dois motivos. Primeiro: numa planta real, "sumir com a área do
ambiente principal" viraria erro de quantitativo e de orçamento, não erro visual.
Segundo: é exatamente o tipo de defeito que um spike existe para encontrar barato —
e que teria custado caro se descoberto depois do editor construído em cima.

## 5. Recomendação sobre DP-04

O braço TypeScript **atingiu o critério de determinismo** do Spike A. Pela regra de
escolha fixada na v1.1 do PRD ("empate técnico resolve a favor do TypeScript, por
custo de equipe"), não há razão para construir o braço Rust/WASM apenas para
comparar determinismo — esse ponto está resolvido.

O que ainda **não** foi medido, e é o único caminho que ainda justificaria Rust:

- **Desempenho no RNF-003** (pan/zoom e arrasto a 45–60 fps com 20 mil objetos).
  O que este spike mediu foi corretude e determinismo, não custo por operação em
  escala. `splitAtIntersections` é O(n²) sobre os segmentos e é o candidato óbvio a
  gargalo — precisa de índice espacial antes de qualquer conclusão.
- Isso é **Spike B** (canvas, DP-03), não Spike A.

Recomendação: **congelar DP-04 a favor do TypeScript** para R0, e reabrir só se o
Spike B mostrar que o custo do arranjo planar — não o do renderer — é o que impede o
RNF-003.

## 6. Limites conhecidos deste spike

Escrito para ser honesto sobre o que ainda não é kernel de produção:

- `splitAtIntersections` é O(n²). Suficiente para 25 casos, insuficiente para 20 mil objetos.
- Contenção de buracos é O(n²) sobre anéis, com `pointInPolygon` por vértice.
- Identidade de ambiente (`spc_*`) é ordinal por ordem canônica. Sobrevive a mudança
  de propriedade (caso 12), mas **não** há ainda o pareamento por sobreposição que o
  PRD §12.2 exige para manter identidade através de edições geométricas.
- `ModelHistory` guarda estados inteiros, não comandos inversos — deliberado, para
  que o caso 23 teste reversibilidade sem circularidade. Não escala para sessão longa.
- Paredes são eixos; a espessura ainda não gera faces sólidas, então não há
  quantitativo de alvenaria. Isso é R2, não R0.

## 7. Critério de pronto

- [x] Kernel implementado em TypeScript puro, mm inteiros, sem dependência de runtime
- [x] 25 casos do PRD §30 implementados e passando
- [x] Igualdade de payload canônico verificada por ordem, repetição e ausência de ID volátil
- [x] SHA-256 validado contra vetores conhecidos
- [x] `tsc --noEmit` limpo; suíte completa sem regressão (870 testes)
- [x] Convenção de sinal das faces verificada empiricamente, não presumida
- [ ] **Pendente:** Spike B (canvas + 20 mil objetos) — é ele que fecha DP-03 e DP-04
- [ ] **Pendente:** índice espacial no arranjo planar, antes de qualquer teste de escala
- [ ] **Pendente:** pareamento de identidade de ambiente através de edição geométrica

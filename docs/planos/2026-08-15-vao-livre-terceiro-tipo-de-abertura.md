# Vão livre — terceiro tipo de abertura

## Pedido original

Sessão de 2026-08-15, logo depois de "mover porta, janela e abertura":

> incluir alem de portas e janelas, incluir abertura

**Correção de leitura minha, registrada porque mudou o trabalho:** no pedido
anterior eu tratei "porta, janela e abertura" como três palavras para a mesma
coisa, já que `Opening` é o guarda-chuva do modelo. Estava errado — o usuário
quer um **terceiro tipo**: o vão sem esquadria (passagem, arco).

**Decisão de nome, confirmada com o usuário:** na tela ele se chama **"Vão
livre"**, e o guarda-chuva continua "Abertura" (o painel segue dizendo "Abertura
selecionada"). No código o `kind` é `'passage'`, em inglês como `door`/`window`.

## Por que não é só desenho

O vão livre muda **dois números do orçamento**, e nenhum dos dois se deduz do
nome — daí o `title` no seletor da barra dizendo o que ele faz:

| | Porta | Janela | **Vão livre** |
|---|---|---|---|
| Desconta área de parede | sim | sim | **sim** |
| Interrompe o rodapé | sim | não | **sim, se o peitoril for zero** |
| Entra em área de esquadrias | sim | sim | **não** |

- **Esquadrias**: esquadria é o caixilho que se compra. Vão sem esquadria não
  tem o que orçar em `AREA_ESQUADRIAS`, nem em `CONTAGEM_PORTAS`/`_JANELAS`.
- **Rodapé**: não há parede no piso ali. Mas vão sem esquadria nem sempre é
  passagem — com peitoril alto é passa-prato/guichê, e aí o rodapé passa por
  baixo, como em janela. Por isso a regra olha o peitoril, não só o tipo.

### Um defeito vizinho que NÃO foi corrigido junto (decisão consciente)

A regra fisicamente correta do rodapé é só `sillMm === 0`, sem olhar o tipo. Ela
consertaria de quebra a **porta-janela** — janela com peitoril zero, que hoje
conta rodapé onde não existe parede. Não adotei: mudaria silenciosamente o
rodapé de projetos que já existem, e isso é orçamento. Fica registrado como
achado, para ser decidido à parte.

## O que mudou

| Arquivo | Mudança | Como sei que terminou |
|---|---|---|
| `utils/blueprintKernel/model.ts` | `kind` ganhou `'passage'`; nova `nomeDoTipoDeAbertura` | 8 casos novos em `blueprintKernel.test.ts` |
| `utils/blueprintKernel/quantities.ts` | rodapé olha peitoril; total `vaosLivres` | casos de rodapé e contagem |
| `utils/blueprintBudget.ts` | vão livre fora de esquadrias e das contagens | 4 casos novos em `blueprintBudget.test.ts` |
| `utils/blueprintDiff.ts` | rótulo pela fonte única | `tsc` + suíte |
| `components/blueprint/BlueprintCanvas.tsx` | vão livre desenha só buraco + batentes | print `saida-combinacao-4.png` |
| `components/blueprint/BlueprintEditor.tsx` | 3ª opção no seletor, com `title` explicando o efeito no orçamento; padrão de inserção igual ao de porta | 2 casos em `BlueprintEditor.test.tsx` |
| `components/blueprint/PainelParedeSelecionada.tsx` | rótulo; sem Girar/Espelhar; **com** peitoril | 3 casos novos de componente |

### `nomeDoTipoDeAbertura` — fonte única do rótulo

O nome era escrito à mão em **quatro** lugares (painel, diff, de-para, barra),
todos com o mesmo `kind === 'door' ? 'Porta' : 'Janela'`. Um ternário de dois
ramos não sobrevive a um terceiro tipo: cada uma dessas cópias passaria a chamar
vão livre de **"Janela"**. A função vive no kernel, ao lado do tipo.

### Sem bump de `KERNEL_VERSION`

A união do `kind` alargou, mas o **formato** do payload não mudou: um estudo sem
vão livre serializa exatamente como antes e mantém o hash. Os 6 goldens seguem
intactos (eles não têm abertura nenhuma). Há um caso de teste que trava isso —
`planta SEM vão livre continua com o mesmo hash de antes`.

## Verificação (feita, não presumida)

- `npx tsc --noEmit` → limpo.
- `npx vitest run` nos 12 arquivos de blueprint → **327 passando** (20 pulados,
  os de banco que já eram).
- `bash scripts/check-ui-standard.sh` nos 3 `.tsx` → sem violação.
- **Kernel** (8 casos): o tipo é aceito; desconta área de parede igual a uma
  porta; **interrompe o rodapé** como porta, e janela não interrompe; com
  peitoril alto o rodapé **volta a passar por baixo**; conta separado nos
  totais; round-trip preserva; planta sem vão livre mantém o payload igual; o
  rótulo cobre os três tipos.
- **Orçamento** (4 casos): área de esquadrias **ignora** o vão livre e a mesma
  geometria como porta entra normalmente; não entra em contagem de portas nem de
  janelas; **desconta** área de parede; **interrompe** o rodapé (14,00 → 13,10 m).
- **Componente** (5 casos): nome certo para os três tipos; vão livre **não**
  oferece Girar/Espelhar; **oferece** peitoril; a barra lista as três opções; o
  `title` do seletor cita esquadria e rodapé.
- **Chrome real** (`docs/spikes/porta-flip/`, 5ª parede nova): o vão livre sai
  com o buraco e os batentes, **sem folha e sem arco** — `saida-combinacao-4.png`.

## Fora do escopo

- Corrigir a porta-janela no cálculo do rodapé (ver acima).
- Verga/contraverga do vão livre — o modelo não tem esses elementos.
- Símbolo de arco (vão com topo curvo): o vão livre é retangular, como todo
  `Opening`.

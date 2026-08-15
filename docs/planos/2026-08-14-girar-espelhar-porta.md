# Girar e espelhar porta

## Pedido original

Sessão de 2026-08-14:

> ao selecionar uma porta, implementar opcao de girar e espelhar

**Decisão de portão, confirmada com o usuário antes de implementar:** os dois são
**eixos independentes**, não um único "girar 180°".

- **Girar** move a dobradiça para a outra ponta do vão (`hingeAtStart`);
- **Espelhar** troca para qual lado da parede a folha abre (`swingReversed`).

Juntos alcançam as **4 variações padrão** de símbolo de porta em planta — a mesma
convenção que Revit/ArchiCAD chamam de *flip hand* / *flip facing*. A alternativa
(Girar = os dois ao mesmo tempo) chega às mesmas 4 posições, mas exige combinar
botões para metade delas.

## O que mudou

| Arquivo | Mudança | Como sei que terminou |
|---|---|---|
| `utils/blueprintKernel/model.ts` | `Opening` ganhou `hingeAtStart` e `swingReversed` | `tsc` limpo em todo o repositório |
| `utils/blueprintKernel/commands.ts` | novo comando `FlipOpening` (`axis: 'hinge' \| 'swing'`); `AddOpening` aceita os dois campos como **opcionais**, com o padrão de sempre | 11 casos novos em `blueprintKernel.test.ts` |
| `utils/blueprintKernel/canonical.ts` | os dois eixos entram no payload; `modelFromCanonicalPayload` lê com `?? true`/`?? false` | caso "payload gravado ANTES dos campos existirem reabre no padrão" |
| `utils/blueprintKernel/units.ts` | `KERNEL_VERSION` 0.3.0 → **0.4.0** | goldens revisados (ver abaixo) |
| `components/blueprint/BlueprintCanvas.tsx` | símbolo da porta desenhado a partir dos dois eixos: pivô, direção da folha e **sentido do arco** | 4 combinações conferidas em Chrome real |
| `components/blueprint/PainelParedeSelecionada.tsx` | botões **Girar** e **Espelhar**, só para `kind === 'door'` | 4 testes novos de componente |
| `components/blueprint/BlueprintEditor.tsx` | `flipAbertura` despacha o comando | passeio de integração |
| `docs/spikes/porta-flip/` | harness novo (4 combinações + ciclo de clique real) | roda e confere sozinho |

### O arco é a parte que podia dar errado calado

`eixoRef` (da dobradiça para a outra ponta) e `folha` (da dobradiça para dentro
do cômodo) são sempre perpendiculares, então o arco é sempre um quarto de
círculo — o que muda é o **sentido**. Inverter **um** dos dois flags troca o
sentido da volta curta; inverter **os dois** volta ao original. Por isso o
`anticlockwise` do `ctx.arc` é o **XOR** dos dois, não a soma de cada um
isolado. Errado, o sintoma seria um arco de 270° (a "volta longa") — que `tsc` e
teste de unidade não veem, só o olho.

### Janela não ganha os botões

Janela é desenhada como uma linha simétrica através da parede: não tem dobradiça
nem lado de giro. Os campos existem em toda `Opening` mesmo assim (como `sillMm`
já existia em porta) para não bifurcar o tipo por `kind`.

### Bump de kernel 0.3.0 → 0.4.0, e os goldens

O payload canônico ganhou dois campos, então todo hash anterior é incompatível
**por formato**. Os 6 goldens foram revisados — é a terceira vez, e as três por
formato, nunca por geometria. **Nenhum dos 6 casos tem abertura** (`openings`
continua `[]` nos seis), então o hash só mudou pela versão embutida no payload;
a contagem de ambientes seguiu idêntica nos seis, que é a asserção que prova que
o desenho não mudou. O histórico está no cabeçalho de
`__tests__/blueprintKernelGoldens.test.ts`.

Snapshot publicado sob 0.3.0 continua legível: `modelFromCanonicalPayload` lê os
campos ausentes como `true`/`false` — os mesmos valores que `AddOpening` sempre
usou —, então reabrir um estudo antigo não faz as portas dele "virarem" sozinhas.
O editor já trata kernel diferente como hash **incomparável** e mantém Publicar
habilitado (`useBlueprintEditor`), que é o comportamento desejado aqui.

## Verificação (feita, não presumida)

- `npx tsc --noEmit` → limpo.
- `npx vitest run` nos 10 arquivos de teste de blueprint → **250 passando**
  (20 pulados, os de integração com banco que já eram pulados).
- `bash scripts/check-ui-standard.sh` nos 3 `.tsx` tocados → sem violação.
- **Kernel** (11 casos novos): nasce no padrão; aceita estado inicial explícito;
  `hinge` mexe só na dobradiça e `swing` só no lado; são toggles (duas vezes
  volta); **as 4 combinações são alcançáveis independentemente**; não mexe em
  offset/largura/parede; abertura inexistente é recusada; o payload registra os
  dois e o hash muda quando eles mudam; round-trip preserva; **payload sem os
  campos reabre no padrão**.
- **Componente** (4 casos novos): porta oferece os dois botões; cada um chama
  `onFlipAbertura` com o eixo certo; **janela não oferece nenhum dos dois**.
- **Chrome real** (`docs/spikes/porta-flip/passeio.mjs`):
  - as 4 combinações desenhadas lado a lado, cada uma com o quarto de círculo
    no sentido certo (`saida-combinacao-0..3.png`);
  - clique real no vão selecionou a **abertura** (não a parede);
  - **Girar** mudou só `hingeAtStart`; **Espelhar** mudou só `swingReversed`;
    girar duas vezes voltou ao original; as outras 3 portas ficaram intactas;
  - `saida-apos-girar.png` / `saida-apos-espelhar.png` mostram o símbolo mudando
    de fato no desenho.

### Duas armadilhas de harness que custaram rodada (registradas no código)

1. Envolver o canvas num wrapper fez a regra `#raiz > div` deixar de alcançar a
   raiz do `BlueprintCanvas` (virou **neta**), e sem Tailwind ela fica sem
   tamanho — a vista é enquadrada na primeira medida e o desenho sai da tela.
2. O `<pre id="dump">` cobria o canto inferior esquerdo do canvas e **engolia o
   clique** do passeio: "não seleciona nada", sem erro nenhum no console.
   `pointer-events: none` resolve; ele também é escondido durante as capturas,
   senão tapa o símbolo que o print existe para mostrar.

## Fora do escopo

- Girar/espelhar **janela** — simétrica no desenho, nada a alternar.
- Mover a porta ao longo da parede pelo painel (hoje é redesenhar) — outro pedido.
- Símbolo de porta de correr / duas folhas — o modelo só conhece `door`/`window`.

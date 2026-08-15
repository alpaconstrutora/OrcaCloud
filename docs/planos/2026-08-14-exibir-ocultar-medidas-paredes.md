# Exibir/ocultar medidas das paredes

## Pedido original

Sessão de 2026-08-14:

> 1. Implementar opção de exibir / ocultar medidas das paredes

## Contexto

O canvas já escrevia comprimento em vários momentos transitórios — prévia de
parede em curso, arraste de ponta, vão candidato, forma medida — mas nenhuma
parede **já desenhada** tinha seu comprimento anotado permanentemente. Conferir
uma planta contra as cotas do projetista exigia selecionar parede por parede e
olhar o campo "Comprimento" do painel lateral (o mesmo campo que virou editável
em `docs/planos/2026-08-12-comprimento-editavel-parede.md`).

## O que mudou

| Arquivo | Mudança | Como sei que terminou |
|---|---|---|
| `components/blueprint/BlueprintCanvas.tsx` | novo prop `mostrarMedidasParedes`; loop que escreve o comprimento de cada parede (`wallLength`, cota de EIXO) reaproveitando `rotuloDoTraco`/`traco` já existentes; paredes menores que `MIN_PX_COTA_PAREDE` (24 px) não recebem rótulo | print comparativo em Chrome real |
| `components/blueprint/BlueprintEditor.tsx` | botão "Medidas" na barra (mesmo padrão visual do botão "Orto"), estado `mostrarMedidas` (nasce **desligado**) | 2 testes novos em `BlueprintEditor.test.tsx` |
| `docs/spikes/wall-render/` | `?medidas=1` no harness existente + `medidas.mjs` para captura comparativa | roda e produz os dois prints |

### Por que nasce desligado

Numa planta cheia de paredes segmentadas (por aberturas, por `SplitWall`), cota
em toda parede sempre ligada viraria poluição visual antes de virar informação.
"Exibir/ocultar" no pedido já indica um toggle que o usuário aciona quando
precisa conferir — não um estado permanente.

### Por que cota de EIXO, não de face

É o que o kernel guarda e o que o campo "Comprimento" do painel de propriedades
já mostra (mesma parede, mesmo número). Cotar a face exigiria descontar meia
espessura aqui e recalcular de novo no painel — duas contas que divergem cedo ou
tarde, a mesma lição de `isFreeWallEnd` e `eixoDaParede`.

### Por que reaproveitar `rotuloDoTraco`

É a função que já resolveu o defeito relatado nesta mesma planta em 12/08 — a
medida caindo em cima da própria parede em zoom out. Escrever um segundo caminho
de rotulagem para as paredes comitadas reintroduziria o mesmo bug por uma porta
diferente.

## Verificação (feita, não presumida)

- `npx tsc --noEmit` → limpo.
- `npx vitest run` (kernel + quantitativos + exportação + medições + os dois
  componentes do editor) → **188 testes passando**, incluindo os 2 novos do
  botão "Medidas" (nasce desligado; alterna e o título muda).
- `bash scripts/check-ui-standard.sh` nos dois arquivos tocados → sem violação.
- **Visual, em Chrome real** (`docs/spikes/wall-render/medidas.mjs`, harness com
  7 paredes incluindo T, ponta livre e duas aberturas):
  - `saida-medidas-off.png` — idêntica ao comportamento anterior, só a cota
    âmbar do vão candidato (recurso pré-existente) aparece;
  - `saida-medidas-on.png` — as 7 paredes ganharam rótulo (16,00 / 11,00 / 16,00
    / 11,00 / 5,60 / 4,50 / 5,00 m), cada um FORA da faixa da parede, sem
    sobrepor a geometria nem a porta/janela.

## Fora do escopo

- Cota persistida entre sessões (segue o padrão de `ortogonal`/`alinhamento`/
  `passoGrade`: estado de sessão, não gravado).
- Cota de abertura (offset/largura) — já existe como texto no painel ao
  selecionar a abertura; não pedido aqui.
- Atalho de teclado para o toggle — o botão na barra já cobre "opção de
  exibir/ocultar".

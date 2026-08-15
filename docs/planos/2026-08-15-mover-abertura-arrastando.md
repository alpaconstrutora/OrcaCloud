# Mover abertura arrastando no canvas

## Pedido original

Sessão de 2026-08-15:

> implemente opção de mover porta, janela e abertura

No modelo, **abertura é o guarda-chuva**: `kind: 'door' | 'window'` são os dois
únicos tipos (`utils/blueprintKernel/model.ts:36`). As três palavras do pedido
apontam para a mesma entidade, então o arraste foi escrito uma vez, para
`Opening`, sem ramo por tipo.

**Decisão de mecanismo, confirmada com o usuário antes de implementar:** mover é
**arrastar no canvas**. O campo numérico de distância no painel foi oferecido
como alternativa e recusado — não foi implementado.

## Contexto

Uma abertura nascia onde foi clicada e ficava lá. O painel mostrava
`a 1,50 m do início da parede` como texto morto, e corrigir a posição exigia
apagar e reinserir — perdendo largura, altura e a orientação (girar/espelhar)
já ajustadas.

## O que mudou

| Arquivo | Mudança | Como sei que terminou |
|---|---|---|
| `utils/blueprintKernel/commands.ts` | comando `MoveOpening`, com a **distância máxima** no texto da recusa | 8 casos novos em `blueprintKernel.test.ts` |
| `components/blueprint/BlueprintCanvas.tsx` | `offsetNaParede` recebe a largura por parâmetro; novo `aberturaSob` (acerto preciso); estado `movendoAbertura` com prévia, grampo e `Escape`; prop `onMoveOpening` | 5 conferências no passeio em Chrome |
| `components/blueprint/BlueprintEditor.tsx` | `moverAbertura` despacha o comando | idem |
| `docs/spikes/porta-flip/` | passeio ganhou as 5 conferências de arraste; cabeçalho passa a dizer que cobre símbolo, tamanho **e** posição | roda e confere sozinho |

### Convenção seguida: selecionar, depois pegar

O canvas já arrastava ponta de parede, e o comentário em `BlueprintCanvas.tsx`
fixa a regra: *"ALÇA ANTES DE SELEÇÃO… evita que um clique para selecionar vire
um arraste acidental de geometria"*. O arraste de abertura segue a mesma: **só a
abertura já selecionada arrasta**. Sem isso, todo clique para escolher a parede
perto de uma porta viraria um empurrão nela.

### Duas armadilhas encontradas lendo o código, antes de escrever

1. **`offsetNaParede` grampeava pela largura errada.** Ela lia
   `larguraAberturaMm` do escopo — a largura do *seletor da barra*, que é a da
   PRÓXIMA abertura a inserir, não a da abertura sendo arrastada. Arrastar uma
   porta de 700 com a barra em 2000 pararia o movimento longe da ponta da
   parede, sem explicação na tela. Agora a largura vem por parâmetro.

2. **O teste de acerto era frouxo demais para servir ao arraste.** Ele comparava
   a distância até o começo do vão com `Math.max(o.widthMm, larguraAberturaMm)`
   — acertava a quase um metro de distância. Passa para *selecionar*, mas com ele
   apertar na parede ao lado da porta iniciaria o arraste dela. `aberturaSob`
   pergunta se o cursor caiu **dentro** de `[offsetMm, offsetMm + widthMm]`. A
   seleção passou a usar o mesmo teste e ficou mais precisa de tabela.

### Grampo entre as vizinhas

O arraste para entre a abertura de trás e a da frente, não só nas pontas da
parede. O kernel recusaria a sobreposição de qualquer jeito, mas recusar no fim
do gesto faria a porta **saltar de volta ao soltar** — e arraste que reverte
sozinho é arraste em que ninguém confia.

### Prévia: a própria abertura, não um fantasma

Durante o arraste, a abertura é desenhada no offset novo (vão, batentes e arco
de giro acompanham), com a distância até o início da parede ao lado. O modelo só
muda no `pointerup`. O que se vê arrastando é exatamente o que fica ao soltar.

O rótulo usa `rotuloDoTraco`, que afasta **perpendicular** ao vão. Uma conta
própria deslocando "para cima" na tela funcionaria só em parede horizontal —
numa parede vertical o número cairia em cima dela. O harness só tem paredes
horizontais e **não pegaria esse defeito**; a perpendicularidade do helper já
está provada pelas cotas do botão "Medidas", que rotula paredes em qualquer
orientação.

### Sem encaixe na grade

A inserção não encaixa (`offsetNaParede` só arredonda ao mm), então o arraste
também não. Duas regras diferentes para posicionar a mesma abertura seriam
piores do que nenhuma.

## Verificação (feita, não presumida)

- `npx tsc --noEmit` → limpo.
- `npx vitest run` nos 10 arquivos de blueprint → **277 passando** (20 pulados,
  os de banco que já eram).
- `bash scripts/check-ui-standard.sh` nos 2 `.tsx` → sem violação.
- **Kernel** (8 casos): move e só o offset muda (largura, altura, parede e
  orientação intactas); encostar nas duas pontas é permitido; offset que estoura
  a parede é recusado citando `3100 mm`; offset negativo recusado; mover para
  cima da vizinha recusado; abertura inexistente recusada; round-trip preserva;
  **mover não mexe no quantitativo de área** — o vão é o mesmo, só mudou de
  lugar.
- **Chrome real** (`docs/spikes/porta-flip/passeio.mjs`), com ponteiro de
  verdade sobre o canvas de verdade:
  1. arraste comum move a abertura e **não** mexe no tamanho
     (`saida-movida.png`);
  2. puxar muito além da ponta **grampeia** em 2200 mm, sem recusa do kernel e
     sem saltar;
  3. `Escape` no meio do arraste não move nada;
  4. apertar e arrastar na parede **longe do vão** seleciona a PAREDE e não
     empurra a porta — é o teste de acerto novo (com o antigo, esse gesto
     arrastaria a porta);
  5. as outras 3 portas seguem com posição, tamanho e orientação intactos;
  6. `saida-arrastando.png` mostra a prévia no meio do gesto, com a distância.

## Fora do escopo

- **Campo numérico de distância no painel** — oferecido e recusado nesta sessão.
- **Arrastar de uma parede para outra.** `MoveOpening` mexe só no offset dentro
  da parede hospedeira. Trocar de hospedeira é outra operação, com outra
  pergunta junto: o que acontece com a orientação da folha quando a parede nova
  aponta para outro lado.
- Encaixe da abertura na grade ou nas cotas do desenho de fundo.

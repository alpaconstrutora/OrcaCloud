# Planta de fundo — enquadrar a prancha ao importar

## Pedido original

Sessão de 22/08/2026.

Primeira mensagem:

> incorporacao < planta inteligente: verifique como esta a implementacao do desenho automatica atraves de uma planta.

A verificação concluiu que o desenho automático (E2 do PRD) não existe — só o
Digitalizador por ação humana. Ao oferecer conferir a planta de fundo no
navegador com uma prancha real, o usuário respondeu:

> sim

A conferência achou um defeito de enquadramento (registrado abaixo). Ao ser
relatado, o usuário respondeu:

> corrigir

## O defeito, medido

Medido em Chrome real sobre `PROJETO INICIAL-REGULARIZAÇÃO-R06-A0.pdf`
(prancha A0 de projeto), harness `docs/spikes/prancha-real/`:

| | antes | depois |
|---|---|---|
| altura da prancha dentro da vista | **28%** | **100%** |
| tamanho na tela (900×700) | 300×59 px | 671×479 px |
| fração da área da tela | **3%** | **51%** |
| posição | encostada no rodapé, parte atrás da barra de dica | centrada |

Uma prancha A0 recém-importada aparecia como uma mancha ilegível no canto
inferior esquerdo. Parece falha de importação.

**A causa não é a escala.** `mmPorPixel = 1` é gravado de propósito por
`useBlueprintUnderlay.ts` — a escala obviamente errada é o que empurra o
usuário a aferir antes de traçar, e continua sendo. A causa é a vista **nascer
fixa** (`escala: 0.05`, origem a `MARGEM_INICIAL_PX` do rodapé), o que é certo
para começar um desenho do zero e errado quando entra uma imagem de tamanho
arbitrário. Ninguém ajustava a vista quando um fundo entrava.

## Itens

- [x] **`components/blueprint/BlueprintCanvas.tsx`** — nova prop
      `enquadrarPrancha?: string | null` e um efeito que, quando ela muda para
      um valor novo, enquadra a vista nos quatro cantos da imagem (quatro, não
      dois: com a prancha girada pela aferição, o retângulo em milímetro não é
      o retângulo em pixel). A escala resultante é presa em `[0.002, 2]`, os
      mesmos limites da roda do mouse — uma vista que o zoom não reproduz
      seria um estado sem volta.
      *Pronto quando:* a cena `importada` do harness mostra a prancha inteira,
      e a cena sem a prop continua mostrando a mancha antiga.

- [x] **É um identificador, não um gatilho.** A prop recebe o id da prancha
      ativa. Importar e trocar de prancha mudam o id (e devem enquadrar);
      **aferir a escala mantém o id (e não deve)** — recalibrar pivota em `p1`
      justamente para o traçado já feito não se mexer, e enquadrar na sequência
      desfaria esse cuidado na prática. Render comum também mantém o id, senão
      a vista voltaria ao início a cada quadro.
      *Pronto quando:* `pranchaEnquadrada.current` impede o reenquadramento e o
      passeio de `docs/spikes/medicoes/` (que não passa a prop) segue em 9/9.

- [x] **`components/blueprint/BlueprintEditor.tsx`** — passa
      `enquadrarPrancha={fundo.ativaId}`.
      *Pronto quando:* `tsc --noEmit` limpo.

- [x] **`docs/spikes/prancha-real/`** — harness novo: prancha A0 real pelo
      caminho de produção (`rasterizarPdf` → `calibrar` → `BlueprintCanvas`),
      com o PDF injetado pelo driver em vez de subir para o bucket.
      *Pronto quando:* 9/9, incluindo os quatro contra-casos.

## Contra-casos (o que TEM de reprovar)

Medição que aprova o caso certo e o defeituoso não mede nada.

| defeito | efeito esperado | medido |
|---|---|---|
| `sem-enquadrar` | prancha não cabe | 28% da altura, 3% da tela ✓ |
| `escala` (afere 10% errado) | traçado desalinha | 42 px de afastamento ✓ |
| `espelho` (imagem virada) | orientação acusa | perfil VIRADA por 37% ✓ |
| painel a 256 px (harness irmão) | controles recortados | recortado ✓ |

O caso `espelho` é o que dá valor ao conjunto: a caixa envolvente continua
coincidindo em **4 px** com a imagem virada — bounding box **não** detecta
espelhamento, porque uma folha de cabeça para baixo ocupa a mesma caixa. Só o
perfil de linhas detecta.

## Verificações rodadas

- `docs/spikes/prancha-real/conferir.mjs` — **9/9**
- `docs/spikes/medicoes/passeio.mjs` — **9/9** (sem regressão; rodado também
  ANTES de qualquer alteração, conforme a lição de `docs/spikes/arrastar-ponta/`)
- `npx tsc --noEmit` — limpo
- `npx vitest run __tests__` — 1452 passaram, 24 puladas
- `scripts/check-ui-standard.sh` nos dois arquivos — sem violação
- `scripts/check-org-selector-guard.sh` — 14/14

## Fora do escopo

- **O ida-e-volta com o Supabase** (upload no bucket, URL assinada,
  `underlay_sha256`) não foi exercitado: exigiria subir a prancha da ALPA para
  o storage de produção.
- **Uma prancha só.** As 50 plantas estratificadas do PRD seguem pendentes.
- **O desenho automático (E2)** continua não existindo; o bloqueio segue sendo
  o fechamento semântico de vão descrito em
  `2026-08-08-spike-c-digitalizador.md`.

## Armadilhas de medição que este harness custou

Três rodadas reprovaram por defeito da medição, não do editor. Ficam
registradas em comentário nos próprios arquivos:

1. **A grade** antisserrilhada sobre branco vira cinza quase neutro e se
   confunde com o traço da prancha reduzida 90×. Some com `passoGradeMm={1}`,
   que é o caminho que o próprio canvas já tem (não desenha grade abaixo de
   3 px de passo na tela).
2. **O preenchimento de POLÍGONO** (`${cor}22`, `BlueprintCanvas:1769`) tinge a
   prancha inteira de azul e destrói a separação por neutralidade. Traçar como
   LINHA fechada à mão resolve.
3. **O centróide não decide espelhamento** entre reduções diferentes (48,7% na
   tela × 60,8% na origem não decidia nada). Perfil de linhas normalizado
   decide, porque compara formato e não quantidade.

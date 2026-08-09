# Planta Inteligente — planta de fundo com escala calibrada

## Pedido original

Depois de avaliar Planta AI v1, Projetos Elétricos e Medição Inteligente, e
constatar que **três módulos já importam planta e calibram escala**, a conversa
chegou em trazer o Medição para dentro do blueprint. A recomendação foi empilhar
em vez de fundir, e começar pelo menor passo que paga. O usuário respondeu:

> e se incluirmos as funcionalidades medidas inteligente no blueprint?

e, à proposta de detalhar o primeiro passo:

> sim

## Por que este passo primeiro

O editor hoje só sabe desenhar do zero. O trabalho real é **traçar sobre a planta
que existe** — e é isso que o Digitalizador (E1/E2) deveria entregar. O Spike C
provou que a extração automática esbarra num problema semântico, não geométrico:
fechar vão de porta não se resolve por proximidade nem por colinearidade.

Mas a parte que **não** depende de resolver esse problema é a base: imagem de
fundo posicionada na escala certa. Com ela, o usuário faz o trabalho que a
máquina não sabe fazer, e o kernel faz o resto — topologia, ambientes,
quantitativo, orçamento, DXF.

E não é território novo: `electrical_plans` e `measure_files` já fazem isso, cada
um com seu bucket e sua convenção. Este plano é a terceira implementação — e
deveria ser a última.

## O que muda no canvas

**Ordem de desenho.** O fundo entra ANTES de tudo, com opacidade regulável; a
grade vem por cima, mas só ela — geometria nunca fica atrás da imagem, senão o
que se está desenhando some sob o que se está copiando.

**Uma transformação nova, e só uma.** Hoje existe `paraTela` (mm do modelo →
pixel de tela). O fundo precisa de **pixel da imagem → mm do modelo**, que a
calibração define. Compostas, dão a matriz de desenho da imagem. Nada mais no
canvas muda: encaixe, orto, alças e derivação de ambientes continuam operando em
mm inteiros, indiferentes ao fundo.

**Modo Calibrar.** Uma ferramenta a mais na barra: clicar dois pontos sobre a
imagem e digitar a distância real entre eles. É o único momento em que o usuário
fala em metros sobre a imagem.

**Aviso de exatidão.** Traçar sobre raster herda a distorção do raster. Planta
escaneada ou fotografada não tem reta reta, e a escala calibrada num canto pode
não valer no outro. Isso precisa estar declarado na tela, no mesmo espírito da
cobertura do IFC — o Spike C mediu 0,2–0,3% em vetor, e raster é pior.

## O que muda no schema

Tabela nova, `blueprint_underlays`:

| coluna | por quê |
|---|---|
| `study_id`, `organization_id` | FK composto `(id, organization_id)`, como o resto do módulo |
| `level_id` (nulo permitido) | térreo e pavimento tipo têm plantas diferentes |
| `storage_path` | arquivo em bucket privado; URL assinada na hora de exibir |
| `file_sha256` | prova **qual documento** estava sob o traçado |
| `origem_x_mm`, `origem_y_mm` | canto da imagem em coordenadas do modelo |
| `mm_por_pixel` | resultado da calibração |
| `rotacao_mrad` | prumo, quando a planta vem torta no arquivo |
| `calib_p1`, `calib_p2`, `calib_distancia_mm` | **os dois pontos clicados e a distância declarada** |
| `opacidade` | preferência de exibição |

**A calibração guarda a ENTRADA, não só o resultado.** Guardar apenas
`mm_por_pixel` torna impossível conferir se a pessoa clicou na cota certa ou numa
linha qualquer. Com os dois pontos e a distância declarada, outra pessoa
reproduz a aferição — e é a mesma disciplina da fórmula que acompanha cada
quantitativo.

RLS por `is_org_member()`, `REVOKE ALL FROM anon`, migration em blocos com
`lock_timeout` e **sem FK para `auth.users`**.

## Itens

| # | Item | Critério de pronto |
|---|---|---|
| 1 | Migration `blueprint_underlays` | 4 policies, sem FK para `auth.users`, conferência = 0 |
| 2 | Bucket privado + URL assinada | `anon` sem acesso; padrão do `electrical_plans` |
| 3 | Upload de imagem | PNG/JPG, com limite de tamanho declarado |
| 4 | Modo Calibrar | dois cliques + distância; mostra o `mm_por_pixel` resultante ANTES de gravar |
| 5 | Desenho do fundo | atrás de tudo, opacidade regulável, sem capturar clique |
| 6 | Aviso de exatidão | visível enquanto houver fundo, não escondido em ajuda |
| 7 | Recalibrar | refazer sem apagar a geometria já traçada |
| 8 | Verificação em navegador | harness com Playwright: uma distância conhecida na imagem tem de virar a medida certa no modelo |

O item 8 não é opcional: escala errada aqui é o mesmo defeito da folha que diz
1:100 e mede outra coisa — o desenho sai plausível e todo o quantitativo depois
dele fica errado. E é medição de pixel, que jsdom não alcança.

## Cinco decisões que são suas

**1. Só imagem, ou PDF também?**
`pdfjs-dist` já está no projeto e o Spike C o usou. PDF é como a planta chega na
prática. O custo é a escolha de página — e página de PDF **não** é pavimento, então
o vínculo com `level_id` continua sendo do usuário.
*Recomendo incluir PDF, renderizando a página escolhida para raster.*

**2. O fundo entra na versão publicada?**
Se **entrar** no payload canônico, trocar a imagem cria versão nova mesmo com
geometria idêntica, e o hash passa a depender de um arquivo. Se **ficar fora**, a
mesma versão pode ser conferida contra plantas diferentes.
*Recomendo fora do hash, com `file_sha256` na auditoria.* A versão é sobre
geometria; o fundo é documento de referência — e assim o kernel não vai para
0.4.0 nem os goldens são recapturados pela terceira vez.

**3. Um fundo por nível ou por estudo?**
*Recomendo por nível*, com `level_id` nulo significando "vale para todos".

**4. Bucket novo ou o do elétrico?**
*Recomendo novo* (`blueprint_underlays`): o do elétrico tem outro dono lógico e
outras policies, e compartilhar bucket entre módulos amarra os dois ciclos de
vida.

**5. Migrar o acervo do Medição e do Elétrico?**
*Recomendo nascer vazio*, como a DR-01 fez com o `plant_*`. Migrar exigiria antes
resolver a titularidade do `measure_*` — que hoje **não tem `organization_id`**.
Isso é assunto próprio, e é risco, não melhoria.

## Fica de fora deste passo

- **Formas medidas** (polígono/linha/ponto traçados direto para quantitativo).
  Só faz sentido decidir depois de traçar sobre planta importada e sentir onde o
  modelo pesa.
- **Extração automática de paredes.** É o bloqueio semântico do Spike C.
- **Unificação do escritor de `projects.budget`.** Necessária, mas independente
  deste passo.
- **Auditoria da RLS de `measure_*`.** Continua sendo o item mais urgente dos
  três, e não depende disto.

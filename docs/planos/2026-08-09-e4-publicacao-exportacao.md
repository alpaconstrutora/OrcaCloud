# Planta Inteligente — E4: Publicação e exportação

## Pedido original

Depois de fechar o RF-122 e confirmar no navegador, a pergunta foi qual épico
atacar. O usuário respondeu, literalmente:

> e4

## Escopo

O E4 do PRD é "snapshot, diff semântico, PDF/PNG e manifesto; eventos outbox e
integração inicial com DMS". O snapshot já existia desde o E0. Esta entrega
fecha o que o PRD marca como **Must**:

| RF | O quê | Prioridade | Entregue |
|---|---|:---:|:---:|
| RF-124 | Comparar snapshots e emitir alterações semânticas | Should | ✅ |
| RF-125 | Exportar PDF e PNG com escala, legenda, versão e aviso | **Must** | ✅ |
| RF-126 | Exportar DXF | Should (R4) | ✖ |
| RF-127 | Exportar IFC parcial | Could (R4) | ✖ |
| RF-128 | Eventos para orçamento/planejamento/documentos | Must (R2) | parcial — a auditoria já registra; o outbox não |

DXF e IFC são R4 e ficam para depois. O outbox de eventos depende de uma decisão
de arquitetura que não é da planta.

## A ESCALA É O REQUISITO, não um enfeite

1:100 quer dizer que 1 metro real mede 10 mm no papel. Alguém vai imprimir esta
folha e medir com escalímetro.

Daí a decisão que carrega o módulo: **a escala é ENTRADA, nunca resultado.**
Quando o desenho não cabe, `enquadrar` não ajusta em silêncio — devolve
`cabe: false` e a escala que caberia. É a diferença entre desenho técnico e
ilustração: encolher para caber produz uma folha que DIZ 1:50 e mede outra coisa,
e o erro sai da tela e vira papel.

Na tela, o aviso aparece **antes** do botão, e o botão fica desabilitado.
Descobrir que não cabe depois de clicar é descobrir tarde.

### Escala gráfica além da numérica

Não é redundância. Fotocópia e "ajustar à página" na impressora mudam o tamanho
do papel, e a escala numérica passa a mentir. A barra encolhe junto com o desenho
e continua verdadeira — por isso desenho técnico traz as duas.

## Desenhar uma vez só

O desenho é escrito contra a interface `Desenhista`, em **milímetros de papel**.
Três implementações:

- `DesenhistaPdf` — jsPDF com o documento já em mm, então não há conversão.
- `DesenhistaCanvas` — mm → px pelo DPI pedido (300 por padrão), o que faz o PNG
  ter a MESMA escala física do PDF quando impresso no tamanho original.
- `DesenhistaDeProva` — grava as chamadas em vez de pintar. **É ela que torna a
  exportação testável sem comparar pixel**, que é o tipo de teste que quebra com
  mudança de fonte e ninguém mantém.

Este NÃO é o renderizador da tela, de propósito. Tela tem grade, seleção e cor de
destaque; papel tem traço preto, espessura em milímetros e carimbo. Reaproveitar
um no outro obrigaria os dois a carregar condicional do outro.

## O aviso de finalidade não é formalidade

RF-125 exige "aviso de finalidade". Uma planta gerada por estudo não passou por
projetista responsável, e sair da tela sem dizer isso é o caminho mais curto para
virar documento de obra. O carimbo traz também o **hash** da versão: sem ele,
duas impressões parecidas são indistinguíveis, e é sempre a errada que vai para a
obra.

## RF-124 — ID NÃO SERVE PARA COMPARAR SNAPSHOT

`modelFromCanonicalPayload` REATRIBUI os ids pelo contador determinístico, na
ordem canônica. `wal_0003` na versão 2 e `wal_0003` na versão 3 não são a mesma
parede: são a terceira parede de cada lista, e basta apagar a primeira para que
passem a ser paredes diferentes.

Um diff por id não erra de vez em quando — erra **sempre que alguma coisa é
apagada**, e do jeito pior: reportando "parede alterada" onde houve remoção mais
inserção. Aqui a identidade é geométrica: a parede é o par de pontas, normalizado
para ser indiferente ao sentido em que foi desenhada.

E o resultado sai em **frases**, não em contagem de linhas de JSON: "Parede de
4,00 m removida", "Quarto: 12,00 → 18,00 m² (+50,0%)". Ordenado pelo peso em m²,
porque quem revisa quer ver primeiro o que move o orçamento.

Ambiente que muda de tamanho apareceria como um removido mais um adicionado — o
polígono é outro, e isso é fiel. O pareamento **por nome** junta os dois numa
frase só, que é a leitura que ajuda a aprovar a revisão.

## Itens

| # | Item | Critério de pronto |
|---|---|---|
| 1 | `utils/blueprintExport.ts` | escala como entrada; recusa quando não cabe |
| 2 | Interface `Desenhista` + 3 adaptadores | desenho escrito uma vez |
| 3 | Carimbo | escala, papel, versão, data, hash e aviso |
| 4 | Escala gráfica | sobrevive a fotocópia |
| 5 | Parede vazada no papel | miolo branco mais fino; sólida quando fina demais |
| 6 | Y invertido | papel cresce para baixo, modelo para cima |
| 7 | Manifesto JSON | liga o arquivo à versão sem depender do carimbo |
| 8 | `utils/blueprintDiff.ts` | identidade GEOMÉTRICA, frases, ordenado por peso |
| 9 | Aba Versões | histórico, exportação e comparação |

## Testes

- `__tests__/blueprintExport.test.ts` — 29 casos, com os milímetros de papel
  calculados à mão no comentário. Dois que valem menção:
  - **"o desenho cabe dentro das margens"** — traço fora da margem some na
    impressora, e nada na tela denuncia.
  - **"o Y do papel cresce para baixo"** — usa um "L" assimétrico de propósito.
    Numa sala simétrica a planta imprimiria de cabeça para baixo e ninguém
    perceberia.
- `__tests__/components/PainelVersoes.test.tsx` — 10 casos da classe "ação
  oferecida que não funciona".

## Detalhe que só apareceu escrevendo o teste

O miolo branco da parede vazada não pode ser só "positivo": em 1:500 uma parede
de 100 mm daria 0,04 mm de miolo, que nenhuma impressora resolve. A guarda passou
a ser um **mínimo imprimível** (`MIOLO_MINIMO_MM = 0,1`), e abaixo dele a parede
sai sólida — que é a convenção quando o corte é pequeno demais para mostrar
espessura.

## Fica de fora

- **DXF (RF-126) e IFC (RF-127)** — R4 no PRD.
- **Outbox de eventos (RF-128)** — a auditoria já registra o que acontece; o
  outbox é decisão de arquitetura que não é da planta.
- **Cotas** — o desenho não sai cotado. Planta de estudo sem cota é honesta;
  planta cotada errada, não. Cotar exige decidir o que cotar, e isso é escopo do
  E3 avançado.
- **Verificação no navegador** — os arquivos gerados não foram abertos.

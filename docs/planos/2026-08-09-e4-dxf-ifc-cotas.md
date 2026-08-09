# Planta Inteligente — E4 completo: DXF, IFC e cotas

## Pedido original

Depois de fechar RF-124 e RF-125 e confirmar a exportação no navegador, sobrava
o que eu tinha listado como fora de escopo. O usuário respondeu, literalmente:

> DXF/IFC e cotas

## As três decisões que carregam a entrega

### 1. Cotas — o que cotar é a decisão, não como desenhar

Cotar tudo é o mesmo que não cotar: a folha vira ilegível e ninguém confere. A
convenção de planta baixa resolve com **cadeias**: uma linha de cota externa por
direção, quebrada nos eixos de parede, mais a cota **total** por fora dela. Quem
lê soma a cadeia e confere contra o total — se não fecha, o desenho está errado,
e isso aparece sem ferramenta nenhuma. `cadeiaFecha()` faz a mesma verificação no
código.

Duas consequências que precisaram de decisão explícita:

- **Cota é de EIXO, e isso vai escrito na folha.** Quem mede a face encontra meia
  espessura a menos de cada lado e conclui que o desenho está errado. Cota sem
  dizer de onde é medida engana.
- **Ligar cota ENCOLHE a área útil, não estica o desenho.** A cota tem o mesmo
  tamanho em 1:50 e em 1:200 — ela é fixa em milímetro de papel. Por isso
  `enquadrar` recebe a opção: ligar cota pode fazer uma escala que cabia deixar de
  caber, e descobrir isso na hora de desenhar seria tarde.

Abertura **não** entra na cadeia da estrutura: cotar vão de porta junto com eixo
de parede dobra o número de segmentos e é outra cadeia no desenho técnico, mais
perto da folha de esquadrias.

### 2. DXF — é 1:1, em milímetro real

Escala é assunto de **papel**. No CAD o desenho vive em unidades do mundo, e é a
prancha que define 1:50 na hora de plotar. Exportar DXF "em 1:100" — dividindo as
coordenadas — produziria um arquivo em que uma parede de 4 m mede 4 cm, e toda
medição feita nele sairia errada por duas ordens de grandeza.

`$INSUNITS = 4` (milímetro) no cabeçalho: **unidade explícita é metade do
requisito**. Sem ela o AutoCAD assume o que estiver configurado na máquina de
quem abre, e a mesma geometria vira metro ou polegada.

**R12 ASCII de propósito.** É a versão que todo programa lê. Versões novas trazem
entidades melhores e leitores piores; para linha, polilinha e texto o R12 não
deixa nada de fora, e o arquivo é texto puro — dá para conferir com o olho e
testar por conteúdo, sem biblioteca.

**Parede sai como sólido NÃO APARADO, e isso é declarado.** Nas junções os
retângulos se sobrepõem. Não é erro: é geometria honesta, o material realmente
está ali. Aparar exige decidir prioridade entre paredes num encontro, que é
escolha de projeto e não de exportação — e aparar errado apagaria material de
verdade.

Cotas saem como `LINE` + `TEXT`, não como entidade `DIMENSION`: esta exige um
`DIMSTYLE` completo e, se qualquer detalhe divergir, o leitor mostra a cota fora
do lugar ou não mostra. Linha mais texto abre em qualquer programa e diz
exatamente o que se vê no PDF — cota que diverge entre o papel e o CAD é pior que
cota nenhuma.

### 3. IFC — a condição É o requisito

O PRD não pede "exportar IFC". Pede **IFC parcial somente com declaração de
cobertura semântica**. A diferença é tudo: um IFC é lido como modelo de
informação, e o que ele **não** contém é indistinguível do que não existe. Se o
arquivo sai sem portas, quem recebe conclui que a planta não tem portas — e ela
tem.

Por isso a cobertura não é comentário no código. Ela vai **dentro do arquivo, em
dois lugares**: no `FILE_DESCRIPTION` do cabeçalho STEP, que um editor de texto
mostra na primeira tela, e na descrição do `IfcProject`, que o visualizador mostra
nas propriedades. Quem abre de um jeito não vê o outro. E ainda sai um `.txt` ao
lado, porque quem recebe por e-mail costuma abrir só o desenho.

Duas escolhas de honestidade:

- **`IfcWall`, não `IfcWallStandardCase`.** StandardCase promete um eixo material
  com camadas declaradas; sem material, usá-lo diria ao receptor que existe uma
  composição construtiva que não existe.
- **GUID determinístico**, derivado do hash da versão. Aleatório seria mais fácil
  e estaria errado: reexportar o mesmo snapshot tem que dar o mesmo arquivo,
  senão duas exportações ficam impossíveis de comparar — e comparar é metade do
  motivo de exportar IFC.

O exportador é uma ponte de **coordenação** geométrica, não um modelo BIM. A
interface evita a expressão "exportação BIM" de propósito.

## Itens

| # | Item | Critério de pronto |
|---|---|---|
| 1 | `utils/blueprintCotas.ts` | cadeia + total; `cadeiaFecha` confere a soma |
| 2 | Cotas no papel | faixa fixa em mm de papel; enquadramento avisa antes |
| 3 | Aviso de cota de eixo | na folha, não só no código |
| 4 | `utils/blueprintDxf.ts` | R12, `$INSUNITS`, 6 camadas nomeadas |
| 5 | Parede como sólido | retângulo fechado, pontas estendidas nas junções |
| 6 | `utils/blueprintIfc.ts` | IFC4 STEP escrito à mão, sem biblioteca |
| 7 | Cobertura dentro do arquivo | cabeçalho STEP + `IfcProject` + `.txt` ao lado |
| 8 | GUID determinístico | reexportar dá arquivo idêntico |
| 9 | UI | DXF/IFC não dependem de a escala caber |

## Testes

`__tests__/blueprintTrocaDeArquivos.test.ts` — 33 casos. Os dois formatos são
texto, e é por isso que dá para verificar conteúdo em vez de comparar bytes:
teste de exportação binária vira comparação que ninguém sabe interpretar quando
falha.

Casos que merecem menção:

- **"o DXF é 1:1"** — verifica que a coordenada 4000 aparece e que a de papel não.
- **"nenhuma coordenada sai em notação exponencial"** — `1e-7` é aceito por alguns
  leitores e quebra outros.
- **"cada linha do IFC tem id próprio e termina em ponto e vírgula"** — STEP
  malformado costuma abrir em um visualizador e falhar em outro.
- **"reexportar a mesma versão dá o mesmo arquivo"**.

## Um defeito que só o teste pegou

`rotuloDeCota(75)` devolvia **"0,07"**. Em ponto flutuante 0,075 é guardado como
0,07499999…, e `toFixed(2)` arredonda para baixo — meio centímetro a menos numa
cota, sem aviso. Passou a arredondar metade para cima à mão, que é a mesma
convenção do `roundToMm` do kernel; divergir dela faria a cota discordar do
quantitativo.

## Fica de fora

- **Cota de abertura** (vão de porta e janela) — é outra cadeia, da folha de
  esquadrias.
- **Aparo de parede no DXF** — depende de prioridade entre paredes, que é decisão
  de projeto.
- **Portas e janelas no IFC** — exigiriam `IfcOpeningElement` mais
  `IfcRelVoidsElement` e `IfcRelFillsElement` por abertura. Declarado como
  ausente, que é o que o requisito exige.
- **Verificação no navegador** — nenhum DXF foi aberto em CAD, nenhum IFC em
  visualizador, e nenhum PDF com cota foi conferido a olho.

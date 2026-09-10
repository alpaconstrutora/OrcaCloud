/**
 * Golden files do kernel geométrico (PRD §20.1).
 *
 * ⚠️ Hashes revisados SEIS vezes, e as seis por mudança de FORMATO, nunca de
 * geometria. Nas seis, a contagem de ambientes dos seis casos seguiu idêntica — é
 * essa asserção, e não o hash, que prova que o desenho não mudou. As seis vieram
 * acompanhadas de bump de `KERNEL_VERSION`.
 *
 *   0.1.0 → 0.2.0 (08/08/2026): o payload passou a referenciar nível e parede por
 *   índice em vez de `levelId`/`wallId`, para parar de vazar identificador volátil.
 *
 *   0.2.0 → 0.3.0 (09/08/2026): entraram as etiquetas de ambiente (`labels`). São
 *   conteúdo, não decoração — renomear um ambiente muda o desenho de forma
 *   observável e precisa mudar o hash, senão publicar depois de renomear seria
 *   idempotente e o nome nunca chegaria ao snapshot.
 *
 *   0.3.0 → 0.4.0 (14/08/2026): `Opening` ganhou `hingeAtStart`/`swingReversed`
 *   (girar/espelhar porta). Nenhum dos seis casos abaixo tem abertura — `openings`
 *   continua `[]` nos seis — então o hash só mudou pela versão embutida no
 *   payload, não pelo conteúdo. É exatamente o que este arquivo existe para pegar
 *   se algum dia NÃO fosse esse o motivo.
 *
 *   0.4.0 → 0.5.0 (21/08/2026): `Boundary` ganhou `kind` (TERRENO/DIVISA) e
 *   `papel`, para a ferramenta de terreno. Nenhum dos seis casos abaixo tem
 *   limite — `boundaries` continua `[]` nos seis — então, de novo, só a versão
 *   embutida mudou.
 *
 *   ⚠️ E isso foi PROVADO, não suposto: com a string de versão trocada de volta
 *   para 0.4.0, o payload dos seis casos volta a bater BYTE A BYTE com o golden
 *   anterior, e as contagens de ambientes (9/49/144/3/78/4) seguiram idênticas.
 *   Atualizar golden sem essa conferência é o jeito mais fácil de carimbar uma
 *   regressão de geometria como "mudança de formato".
 *
 *   0.6.0 → 0.7.0 (23/08/2026): a PORTA DE CORRER entrou no modelo — `Opening`
 *   ganhou o tipo `sliding` e o campo `embutida`. Nenhum dos seis casos tem
 *   abertura de espécie nenhuma, e `embutida` é emitida SÓ em abertura de
 *   correr — então, de novo, só a versão embutida no payload mudou.
 *
 *   ⚠️ Mesma prova, refeita: com a string trocada de volta para 0.6.0, os seis
 *   voltaram a bater byte a byte e os sete testes deste arquivo passaram. As
 *   contagens de ambientes (9/49/144/3/78/4) seguiram idênticas — elas são
 *   afirmadas ANTES do hash, e nenhuma delas falhou em momento algum.
 *
 *   0.5.0 → 0.6.0 (21/08/2026): a escritura entrou no modelo — `Boundary` ganhou
 *   `medidaEscrituraMm`/`confrontante` e o modelo ganhou `areaEscrituraMm2`. De
 *   novo nenhum dos seis casos tem limite, e a área de escritura é emitida como
 *   `undefined` quando não informada (some do payload), justamente para que
 *   desenho sem lote não ganhe chave nova. Mesma prova, refeita: com a versão
 *   trocada de volta para 0.5.0, os seis voltam a bater byte a byte, e as
 *   contagens seguiram 9/49/144/3/78/4.
 *
 *   0.7.0 → 0.8.0 (30/08/2026): `Wall` ganhou `alinhamento` — de que lado do eixo
 *   estava o traço clicado, para que mudar a espessura depois não arraste a face
 *   que o usuário apontou. Nenhum dos seis casos abaixo é traçado pela face (são
 *   todos construídos como `Wall` cru, sem o campo), e o canônico só EMITE a
 *   chave quando ela difere de `'EIXO'` — então, de novo, só a versão embutida no
 *   payload mudou.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string trocada de
 *   volta para 0.7.0, os SETE testes deste arquivo passaram sem nenhuma outra
 *   alteração, o que só acontece se os seis payloads voltarem byte a byte ao
 *   golden anterior. As contagens (9/49/144/3/78/4) foram afirmadas na linha
 *   ANTES do hash e não falharam em momento nenhum, nem antes nem depois.
 *
 *   0.8.0 → 0.9.0 (30/08/2026): a ESTRUTURA entrou no modelo — `structures`, uma
 *   família nova com seis tipos e três formas geométricas. Nenhum dos seis casos
 *   abaixo tem peça estrutural, e o canônico EMITE a chave `structures` só
 *   quando há alguma (`undefined` quando o array está vazio, para a chave sumir
 *   do payload). Então, mais uma vez, só a versão embutida no payload mudou.
 *
 *   É a primeira família nova desde `Boundary`, e por isso a prova importava
 *   mais do que nas últimas: uma família que fosse emitida como `[]` teria
 *   mudado a forma canônica de TODO desenho do acervo, e o hash teria mudado
 *   pelo motivo errado — indistinguível daqui.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string trocada de
 *   volta para 0.8.0, os SETE testes deste arquivo passaram sem nenhuma outra
 *   alteração — o que só acontece se os seis payloads voltarem byte a byte ao
 *   golden anterior, e portanto se a chave `structures` de fato não aparece em
 *   desenho sem estrutura. As contagens (9/49/144/3/78/4) foram afirmadas na
 *   linha ANTES do hash e não falharam em momento nenhum: as seis falhas foram
 *   todas de hash, nenhuma de geometria.
 *
 *   0.9.0 → 0.10.0 (01/09/2026): `cedeSobreposicao` entrou em `Wall` e em
 *   `Structural` — a decisão de quem abre mão do volume que dois componentes
 *   dividem. É um campo BOOLEANO em família que já existia, e o canônico o emite
 *   só quando `true`: nenhuma das seis geometrias abaixo tem estrutura, quanto
 *   mais um pilar embutido, então nenhuma delas ganha a chave.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string trocada de
 *   volta para 0.9.0, os SETE testes deste arquivo passaram sem nenhuma outra
 *   alteração — o que só acontece se os seis payloads voltarem byte a byte ao
 *   golden anterior, e portanto se a chave nova de fato não aparece em parede
 *   que não cede nada. As contagens (9/49/144/3/78/4) foram afirmadas na linha
 *   ANTES do hash e não falharam em momento nenhum.
 *
 *   0.10.0 → 0.11.0 (01/09/2026): a PAREDE VIROU MULTICAMADA — `Wall` ganhou
 *   `camadas`, uma lista de faixas com espessura, função e código de catálogo.
 *   As seis geometrias abaixo são todas construídas como `Wall` cru, homogêneas,
 *   sem o campo, e o canônico emite `camadas` só quando ela existe — então
 *   nenhuma delas ganha a chave.
 *
 *   Esta entrada tinha um segundo risco, que as anteriores não tinham: junto do
 *   campo entrou um desempate NOVO na ordenação canônica das paredes, por
 *   assinatura de camadas. Desempate mal escrito reordena o array e muda o
 *   payload sem nenhum campo novo aparecer — um jeito de quebrar o acervo que a
 *   prova de reverter a versão pega e mais nada pegaria. Em parede homogênea a
 *   assinatura é `''` para todas, então o desempate é neutro por construção; é
 *   isso que a prova abaixo confirma na prática.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string trocada de
 *   volta para 0.10.0, os SETE testes deste arquivo passaram sem nenhuma outra
 *   alteração — o que só acontece se os seis payloads voltarem byte a byte ao
 *   golden anterior, e portanto se nem a chave `camadas` aparece em parede
 *   homogênea nem o desempate novo reordenou coisa alguma. As contagens
 *   (9/49/144/3/78/4) foram afirmadas na linha ANTES do hash e não falharam em
 *   momento nenhum: as seis falhas foram todas de hash, nenhuma de geometria.
 *
 *   0.11.0 -> 0.12.0 (04/09/2026): o TELHADO entrou no modelo -- `roofs`, a
 *   familia da AGUA (plano inclinado de cobertura). E a segunda familia nova
 *   desde `structures`, e vale a mesma cautela: uma familia emitida como `[]`
 *   teria mudado a forma canonica de TODO desenho do acervo, e o hash teria
 *   mudado pelo motivo errado -- indistinguivel daqui. O canonico emite `roofs`
 *   so quando ha alguma agua.
 *
 *   (!) Mesma prova, refeita antes de tocar num hash: com a string em 0.11.0 e
 *   todo o resto do telhado JA no lugar -- entidade, comandos, canonico,
 *   quantitativo --, os SETE testes deste arquivo passaram sem nenhuma
 *   alteracao. So acontece se os seis payloads continuarem byte a byte iguais,
 *   e portanto se a chave `roofs` de fato nao aparece em desenho sem cobertura.
 *   As contagens (9/49/144/3/78/4) foram afirmadas na linha ANTES do hash e nao
 *   falharam em momento nenhum: as seis falhas foram todas de hash.
 *
 *   0.12.0 -> 0.13.0 (05/09/2026): a LINHA DE CORTE entrou no modelo --
 *   `sections`, o plano vertical por onde a edificacao e seccionada. Terceira
 *   familia nova em duas semanas (structures, roofs, sections), e a cautela e a
 *   mesma: emitida como `[]` ela teria mudado a forma canonica de TODO desenho
 *   do acervo. O canonico emite `sections` so quando ha algum corte.
 *
 *   (!) Mesma prova, refeita antes de tocar num hash: com a string em 0.12.0 e
 *   todo o corte JA no lugar, os SETE testes deste arquivo passaram sem
 *   alteracao. As contagens (9/49/144/3/78/4) foram afirmadas ANTES do hash e
 *   nao falharam: as seis falhas foram todas de hash.
 *
 *   0.13.0 -> 0.14.0 (05/09/2026): ESCADA E RAMPA entraram no modelo --
 *   `stairs`, o percurso que vence um desnivel. Quarta familia nova, mesma
 *   cautela: o canonico emite `stairs` so quando ha alguma.
 *
 *   (!) Mesma prova, refeita antes de tocar num hash: com a string em 0.13.0 e
 *   toda a escada JA no lugar -- entidade, comandos, canonico, invariantes --,
 *   os SETE testes deste arquivo passaram sem alteracao. Depois do bump, as
 *   contagens (9/49/144/3/78/4) continuaram sendo afirmadas ANTES do hash e nao
 *   falharam: as seis falhas foram todas de hash, que e o que prova que so a
 *   string da versao mudou.
 *
 *   0.14.0 -> 0.15.0 (05/09/2026): o TIPO DE ESQUADRIA entrou na abertura --
 *   `esquadria` (nome, item, descricao), emitida SO quando declarada.
 *
 *   (!) Mesma prova, refeita antes de tocar num hash: com a string em 0.14.0 e
 *   o tipo JA no lugar, os SETE testes deste arquivo passaram sem alteracao.
 *   Depois do bump, as seis falhas foram todas de hash e nenhuma de contagem.
 *
 * Trava o payload canônico de seis geometrias. Serve a um propósito específico: o
 * arranjo planar é otimizável de muitas formas — índice espacial, união-busca,
 * rejeição por caixa — e nenhuma delas PODE mudar o resultado. Estes hashes foram
 * capturados da implementação sem nenhum índice e sobreviveram intactos à
 * introdução de todos eles.
 *
 * Se um hash aqui mudar, a pergunta não é "atualizo o golden?". É "o que na
 * geometria mudou, e era para mudar?".
 *
 *   0.15.0 -> 0.16.0 (06/09/2026): a SEÇÃO EM T entrou na peça estrutural --
 *   `secaoT` (mesa + alma), a viga faixa/nervurada. Nao e familia nova: e um
 *   campo OPCIONAL numa familia que ja existia, e por isso a cautela muda de
 *   forma. Emitido em toda peca (mesmo como `undefined`), ele teria mudado a
 *   forma canonica de CADA pilar, viga e laje do acervo -- muito mais desenhos
 *   do que uma familia nova alcanca. O canonico emite `secaoT` so na peca que
 *   de fato tem uma.
 *
 *   (!) Mesma prova, refeita antes de tocar num hash: com a string em 0.15.0 e
 *   a secao T JA no lugar -- modelo, comando, canonico, quantitativo --, os
 *   SETE testes deste arquivo passaram sem alteracao. As contagens
 *   (9/49/144/3/78/4) foram afirmadas ANTES do hash e nao falharam: as seis
 *   falhas foram todas de hash.
 *
 *   0.17.0 → 0.18.0 (08/09/2026): as INSTALAÇÕES entraram no modelo — `trechos`
 *   e `terminais`, duas famílias novas, com disciplina, bitola e DUAS COTAS por
 *   trecho (é o que distingue a prumada do trecho degenerado, e o esgoto com
 *   caimento do sem).
 *
 *   É a primeira família nova desde a escada, e a mesma disciplina se aplica: o
 *   canônico EMITE as duas chaves só quando há rede (`undefined` com o array
 *   vazio, para a chave sumir do payload). Nenhuma das seis geometrias abaixo
 *   tem instalação, então nenhuma delas ganha chave — só a versão embutida no
 *   payload mudou.
 *
 *   0.26.0 → 0.27.0 (10/09/2026): `Terminal.interruptor` — a VARIANTE do
 *   interruptor (uma, duas, três seções, paralelo, intermediário), na
 *   simbologia que o usuário mandou em print. Campo novo, omitido quando
 *   ausente; nenhum dos seis casos tem instalação. Mesma prova, refeita antes
 *   de tocar num hash: com a string em 0.26.0 e o campo JÁ inteiro (modelo,
 *   invariante, comandos, canônico, menu, símbolo, painel, IFC), as goldens
 *   passaram e as contagens (9/49/144/3/78/4) seguiram idênticas.
 *
 *   0.25.0 → 0.26.0 (10/09/2026): o décimo primeiro valor, `INTERRUPTOR` —
 *   o comando do ponto de luz que a NBR 5410 (9.5.2.1.1) exige em todo
 *   cômodo. Mesma razão do 0.25.0: valor novo num campo fechado, que um
 *   kernel anterior recusa. Mesma prova, refeita antes de tocar num hash: com
 *   a string em 0.25.0 e o valor JÁ no lugar (kernel, rótulos, símbolo, menu,
 *   IFC `IfcSwitchingDevice.TOGGLESWITCH` lido pelo web-ifc), as goldens
 *   passaram e as contagens (9/49/144/3/78/4) seguiram idênticas.
 *
 *   0.24.0 → 0.25.0 (10/09/2026): `TIPOS_DE_PONTO_ELETRICO` ganhou o décimo
 *   valor, `LIGACAO_DIRETA` — o ponto do chuveiro e do aquecedor, que a
 *   NBR 5410 (9.5.2.3) manda ligar SEM tomada. Não é campo novo: é um valor
 *   novo num campo fechado. Sobe a versão mesmo assim porque um kernel
 *   anterior a este RECUSA o payload (`BAD_POINT_KIND`) — a compatibilidade
 *   mudou, e a string no hash é onde isso fica registrado.
 *
 *   Nenhum dos seis casos tem instalação: de novo só a versão embutida no
 *   payload mudou. Mesma prova, refeita antes de tocar num hash: com a string
 *   ainda em 0.24.0 e o valor JÁ inteiro no lugar — kernel, rótulos, símbolo,
 *   IFC (`IfcJunctionBox.POWER`, lido de volta pelo web-ifc) —, as goldens
 *   passaram e as contagens (9/49/144/3/78/4) seguiram idênticas.
 *
 *   0.23.0 → 0.24.0 (10/09/2026): dois campos para a distribuição de tomadas
 *   pedida pelo usuário — *"o sistema pode inserir uma tomada no banheiro e o
 *   projetista tem o trabalho apenas de mover"*:
 *
 *     · `SpaceLabel.tipoDeAmbiente` — banheiro, cozinha/serviço, varanda,
 *       sala/dormitório, outro. É a classe pela qual a NBR 5410 (9.5.2.2.1)
 *       conta tomadas, e mora na ETIQUETA porque o ambiente é derivado;
 *     · `Terminal.sugerida` — a marca do ponto que o sistema pôs e ninguém
 *       confirmou. Vai ao canônico como `true` ou AUSENTE, nunca `false`:
 *       "não sugerida" é o estado de todo ponto que uma pessoa pôs, e
 *       escrevê-lo mudaria a forma canônica do acervo por um campo que não o
 *       descreve. MOVER limpa a marca — mover é decidir.
 *
 *   Os dois são omitidos quando ausentes, e nenhum dos seis casos abaixo tem
 *   etiqueta classificada nem instalação: de novo só a versão embutida no
 *   payload mudou.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string ainda em
 *   0.23.0 e os dois campos JÁ inteiros no lugar — modelo, invariante,
 *   comandos, canônico de ida e de volta, motor de distribuição, painel e
 *   desenho —, as goldens passaram e as contagens (9/49/144/3/78/4) seguiram
 *   idênticas.
 *
 *   0.22.0 → 0.23.0 (09/09/2026): as três convenções que faltavam da prancha
 *   elétrica, todas vindas de um print de projeto real:
 *
 *     · `Trecho.circuitoId` — de onde sai o "#2,5" escrito ao lado do traço. A
 *       seção é a do CIRCUITO, e não um campo do trecho: um número próprio ali
 *       poderia divergir do quadro de cargas, e a prancha diria 2,5 num traço
 *       que a tabela soma como 4;
 *     · `Trecho.condutores` — os traços cruzando a linha (2 = fase e neutro,
 *       3 = com retorno, 4 = com terra). DECLARADO, nunca derivado;
 *     · `Terminal.comando` — a letra "a"/"b"/"c" que liga interruptor e ponto
 *       de luz. Texto, e não vínculo tipado: na prancha ela vale por ambiente e
 *       o projetista a reaproveita à vontade.
 *
 *   ⚠️ E a LEITURA do canônico teve de mudar de ORDEM: os trechos passaram a
 *   referenciar o circuito por índice, e eram lidos ANTES dos circuitos. Aqui a
 *   armadilha é pior que o TDZ do terminal — não estoura: a lista de circuitos
 *   ainda vazia devolveria todo trecho SEM circuito, calado.
 *
 *   Os três campos são omitidos quando ausentes, e nenhum dos seis casos abaixo
 *   tem instalação: de novo só a versão embutida no payload mudou.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string ainda em
 *   0.22.0 e as três convenções JÁ inteiras no lugar, as goldens passaram e as
 *   contagens (9/49/144/3/78/4) seguiram idênticas.
 *
 *   0.21.0 → 0.22.0 (09/09/2026): o ponto elétrico ganhou CLASSIFICAÇÃO
 *   (`tipoEletrico`), na taxonomia que o usuário informou: iluminação (teto,
 *   arandela, piso), tomadas (TUG, TUE) e especiais/dados (telefone, TV, rede,
 *   USB). Ela é campo FECHADO porque dela saem os grupos, as somas por família
 *   e a entidade IFC certa — com texto livre, "TUG", "tug" e "Tomada de uso
 *   geral" seriam três famílias e a contagem sairia plausível e errada.
 *
 *   Omitida quando ausente, e ausente é estado legítimo: todo ponto anterior a
 *   esta data está assim, e aparece como "a classificar". Nenhum dos seis casos
 *   abaixo tem instalação — de novo só a versão embutida no payload mudou.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string ainda em
 *   0.21.0 e a taxonomia JÁ inteira no lugar — modelo, invariante, comandos,
 *   canônico de ida e de volta, menu de inserir, inventário, painel e desenho —,
 *   as goldens passaram e as contagens (9/49/144/3/78/4) seguiram idênticas.
 *
 *   0.20.0 → 0.21.0 (09/09/2026): quadro e terminal ganharam `rotacaoGraus` —
 *   a lacuna que eu havia DECLARADO ao entregar as medidas, no mesmo dia. Ele é
 *   omitido quando ausente, e nenhum dos seis casos tem instalação: de novo só a
 *   versão embutida no payload mudou.
 *
 *   ⚠️ GRAU INTEIRO e NORMALIZADO para 0–359 no comando. Sem normalizar, `0` e
 *   `360` seriam o mesmo desenho com hashes diferentes — e um campo de ângulo é
 *   justamente onde alguém digita `-90`.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string ainda em
 *   0.20.0 e o giro JÁ inteiro no lugar — modelo, invariante, comandos,
 *   canônico de ida e de volta, cantos em planta, acerto do cursor, rotação 3D
 *   e IFC —, as goldens passaram e as contagens (9/49/144/3/78/4) seguiram
 *   idênticas.
 *
 *   0.19.0 → 0.20.0 (09/09/2026): QUADRO e TERMINAL ganharam MEDIDAS
 *   (`larguraMm`, `alturaMm`, `profundidadeMm`), a pedido de quem estava
 *   testando: o quadro era um quadrado de 9 PIXELS e o ponto um círculo de 4 —
 *   tamanho fixo na tela, menor que a espessura da parede ao lado num zoom de
 *   trabalho. Agora a caixa é desenhada em escala, em planta e no 3D, e o IFC
 *   leva o que foi declarado.
 *
 *   Os três campos são OMITIDOS quando ausentes, e os PADRÕES são exatamente as
 *   medidas que o IFC já emitia embutidas (400 × 300 × 200 no quadro, 100 mm
 *   cúbicos no terminal) — assim o arquivo de quem nunca declarou nada continua
 *   idêntico byte a byte. Nenhum dos seis casos abaixo tem instalação: de novo
 *   só a versão embutida no payload mudou.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string ainda em
 *   0.19.0 e as medidas JÁ inteiras no lugar — modelo, invariante, os dois
 *   comandos, canônico de ida e de volta, acerto do cursor, caixa 3D e IFC —,
 *   as goldens passaram e as contagens (9/49/144/3/78/4) seguiram idênticas.
 *
 *   ⚠️ E uma divergência de CONVENÇÃO foi achada no caminho, antes de vazar: eu
 *   havia escrito a caixa 3D com a cota como BASE, e o `emitirQuadro` do IFC já
 *   tratava a cota como CENTRO (nasce em `cota − altura/2`). Duas convenções
 *   para a mesma peça fariam o 3D e o arquivo entregue discordarem em meia
 *   altura — plausível demais para alguém notar olhando. Venceu a que já estava
 *   publicada.
 *
 *   0.18.0 → 0.19.0 (08/09/2026): CIRCUITO e QUADRO entraram no modelo, e o
 *   terminal ganhou `circuitoId` e `potenciaW`. As duas famílias saem só quando
 *   existem, e os dois campos do terminal são OMITIDOS quando ausentes — o que
 *   protege os desenhos que já têm ponto elétrico e foram feitos antes de
 *   circuito existir.
 *
 *   ⚠️ E um defeito de TDZ apareceu no caminho: a projeção do terminal
 *   referencia o índice do circuito, e o bloco dos circuitos estava ABAIXO do
 *   dos terminais no `projetar`. Todo desenho com ponto elétrico estourava
 *   "Cannot access before initialization" — o mesmo defeito que derrubou a
 *   vista 3D em 05/09/2026. A ordem dos blocos ali é obrigatória, não estética.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string ainda em
 *   0.18.0 e as duas famílias JÁ inteiras no lugar — modelo, invariantes,
 *   quatro comandos, canônico de ida e de volta, cascata de pavimento e quadro
 *   de cargas —, a SUÍTE INTEIRA passou (3.217 casos), estes sete inclusive.
 *
 *   ⚠️ Mesma prova, refeita antes de tocar num hash: com a string ainda em
 *   0.17.0 e as instalações JÁ inteiras no lugar — modelo, invariantes, quatro
 *   comandos, canônico de ida e de volta, cascata de pavimento e quantitativo —,
 *   a SUÍTE INTEIRA passou (3.162 casos), estes sete inclusive. As contagens
 *   (9/49/144/3/78/4) foram afirmadas ANTES do hash e não falharam em momento
 *   nenhum: as seis falhas do bump foram todas de hash, nenhuma de geometria.
 */

import { describe, expect, it } from 'vitest';
import type { BlueprintModel, Wall } from '../utils/blueprintKernel';
import { recomputeSpaces, snapshotHash } from '../utils/blueprintKernel';

/** Grade k×k de salas quadradas de lado `s`, deslocada por (ox, oy). */
function grid(k: number, s = 3000, ox = 0, oy = 0): Wall[] {
  const walls: Wall[] = [];
  const push = (ax: number, ay: number, bx: number, by: number) => {
    walls.push({
      id: 'tmp',
      levelId: 'lvl_0001',
      a: { x: ox + ax, y: oy + ay },
      b: { x: ox + bx, y: oy + by },
      thicknessMm: 150,
      heightMm: 2800,
    });
  };
  for (let i = 0; i <= k; i++) {
    for (let j = 0; j < k; j++) {
      push(j * s, i * s, (j + 1) * s, i * s);
      push(i * s, j * s, i * s, (j + 1) * s);
    }
  }
  return walls;
}

function model(walls: Wall[]): BlueprintModel {
  return {
    levels: [{ id: 'lvl_0001', name: 'T', elevationMm: 0, defaultHeightMm: 2800 }],
    walls: walls.map((w, i) => ({ ...w, id: `wal_${String(i + 1).padStart(5, '0')}` })),
    openings: [],
    boundaries: [],
    labels: [],
    spaces: [],
    seq: {},
  };
}

function line(ax: number, ay: number, bx: number, by: number): Wall {
  return {
    id: 'tmp',
    levelId: 'lvl_0001',
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thicknessMm: 150,
    heightMm: 2800,
  };
}

const CASES: Record<string, { walls: Wall[]; spaces: number; hash: string }> = {
  grid3: {
    walls: grid(3),
    spaces: 9,
    hash: 'ded7e62ae2b29ca7599a04c77574d56f33ea89f424c5380f3e9f95f38e18c161',
  },
  grid7: {
    walls: grid(7),
    spaces: 49,
    hash: '74bcd81719f1e34a2cc084ca7338d7207a3440146522de84792e737aeca73d08',
  },
  grid12: {
    walls: grid(12),
    spaces: 144,
    hash: '513890855e203d092e7c6bd623db9d6a8db22c47acb1423ea57732d18f0b8f5e',
  },

  // Três anéis encaixados sem se tocarem: exercita contenção entre componentes
  // desconexos, que é onde a heurística "a maior área é a face externa" quebrava.
  ilhaAninhada: {
    walls: [...grid(1, 24000), ...grid(1, 12000, 6000, 6000), ...grid(1, 4000, 10000, 10000)],
    spaces: 3,
    hash: 'cacd3efc8a76d2f539bff2be769a02ea7c86d2b2f8c84770859e50be2094a562',
  },

  // 14 retas oblíquas em posição geral. O deslocamento quadrático na ponta superior
  // é deliberado: com deslocamento linear nas duas pontas as retas ficam
  // CONCORRENTES num único ponto, um feixe que não tem face limitada nenhuma.
  // As 78 faces são exatamente (n−1)(n−2)/2 para n = 14.
  obliquos: {
    walls: Array.from({ length: 14 }, (_, i) => line(i * 700, 0, 9000 - i * i * 40, 9000)),
    spaces: 78,
    hash: '0b6d935bdc61c7a1cb8f97edb5b93223c84fcfeba0bb27c2463f6d99906fbeca',
  },

  // Verticais a 0 / 4000 / 4003 / 8000 / 8004 mm: pares dentro e fora da tolerância
  // de 5 mm no mesmo desenho.
  quaseTolerancia: {
    walls: [
      ...[0, 4000, 4003, 8000, 8004].map((x) => line(x, 0, x, 6000)),
      ...[0, 3000, 6000].map((y) => line(0, y, 8004, y)),
    ],
    spaces: 4,
    hash: '4ea6d6df3baf7bb1597a822e6baaf9ffb3ad6fabf734a0f8c394faf3b16ca43c',
  },
};

describe('kernel geométrico · golden files', () => {
  it.each(Object.entries(CASES))('%s mantém o payload canônico', (_name, expected) => {
    const built = recomputeSpaces(model(expected.walls));
    expect(built.spaces).toHaveLength(expected.spaces);
    expect(snapshotHash(built)).toBe(expected.hash);
  });

  it('o mesmo modelo recalculado repetidas vezes não muda de hash', () => {
    const walls = CASES.ilhaAninhada.walls;
    const hashes = Array.from({ length: 4 }, () => snapshotHash(recomputeSpaces(model(walls))));
    expect(new Set(hashes).size).toBe(1);
  });
});

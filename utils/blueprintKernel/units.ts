/**
 * Unidades e política numérica do kernel geométrico (Spike A, braço TypeScript).
 *
 * Regra única do PRD §9.2: comprimento persiste em MILÍMETROS INTEIROS. Ponto
 * flutuante só existe dentro de um cálculo intermediário e nunca sobrevive a ele —
 * toda saída volta a inteiro por `roundToMm`.
 *
 * Por que inteiros: o critério do Spike A é igualdade bit a bit do payload canônico
 * entre navegador e servidor. Com float, duas somas na mesma ordem lógica mas em
 * ordem de avaliação diferente já divergem no último bit, e o hash muda sem que a
 * geometria tenha mudado. Com inteiro, a igualdade é estrutural.
 *
 * Faixa segura: uma edificação cabe em ±100.000 mm (100 m). Produtos vetoriais em
 * `geom.ts` chegam a ~1e10, muito abaixo de Number.MAX_SAFE_INTEGER (~9e15), então
 * os predicados de orientação são EXATOS — não aproximados.
 */

/**
 * Identifica a implementação e a política numérica. Entra no hash do snapshot.
 *
 * 0.2.0 — o payload canônico passou a referenciar nível e parede por ÍNDICE em vez
 * de `levelId`/`wallId`. A geometria não mudou; a serialização sim, e por isso todo
 * hash anterior é incompatível por construção. Snapshot gravado com 0.1.0 continua
 * legível pelo `kernel_version` que carrega — é para isso que ele existe.
 *
 * 0.4.0 (14/08/2026) — `Opening` ganhou `hingeAtStart`/`swingReversed` (girar e
 * espelhar o símbolo de porta). Payload gravado sob 0.3.0 não tem os dois campos;
 * `modelFromCanonicalPayload` os lê com `?? true`/`?? false`, o mesmo padrão de
 * `labels` na entrada 0.3.0 — snapshot antigo continua legível, só não recalcula
 * hash igual ao de hoje.
 *
 * 0.5.0 (21/08/2026) — `Boundary` ganhou `kind` (TERRENO/DIVISA) e `papel`
 * (frente/fundos/laterais), para a ferramenta de terreno. Os atributos viajam no
 * PAYLOAD, e não numa tabela ao lado, porque `modelFromCanonicalPayload`
 * reconstrói os limites com ids `bnd_` NOVOS — id de limite não sobrevive a
 * publicar+recarregar, então referência externa por id se perderia no primeiro
 * publish. Payload sob 0.4.0 não tem os campos; lidos como `'DIVISA'`/`null`,
 * que é o que aquele desenho significava.
 *
 * 0.6.0 (21/08/2026) — a ESCRITURA entrou no modelo: `Boundary` ganhou
 * `medidaEscrituraMm` e `confrontante`, e o modelo ganhou `areaEscrituraMm2`. É a
 * mesma razão da entrada 0.5.0 levada ao dado da matrícula — e vale também para o
 * RASCUNHO, não só para o snapshot: `blueprint_branches.draft_payload` guarda este
 * mesmo payload canônico, então o que não está aqui se perde já no autosave, sem
 * publicação nenhuma. Payload sob 0.5.0 não tem os campos; lidos como `null`, que
 * é "ninguém informou" — e não se compara desenho com escritura que ninguém deu.
 *
 * 0.7.0 (23/08/2026) — a PORTA DE CORRER: `Opening` ganhou o tipo `sliding` e o
 * campo `embutida` (folha no bolso da parede ou sobre a face). A entrada estava
 * FALTANDO nesta lista — a constante subiu e o histórico não, e quem viesse
 * depois leria "0.6.0" como a última mudança. Registrada aqui em 30/08/2026, ao
 * subir para 0.8.0. `embutida` é emitida só em abertura de correr, então nenhum
 * desenho sem porta de correr mudou de forma.
 *
 * 0.8.0 (30/08/2026) — `Wall` ganhou `alinhamento` (`EIXO`/`DIREITA`/`ESQUERDA`):
 * de que lado do eixo estava o traço que o usuário clicou. O campo não move nada
 * e não muda a topologia — `a`/`b` continuam sendo o eixo, e a conexão continua
 * pelo eixo. Ele existe porque o lado era estado só da FERRAMENTA de desenho,
 * aplicado uma vez no clique e esquecido: mudar a espessura depois crescia a
 * parede para os dois lados e a face apontada andava meia espessura. Emitido
 * SÓ quando difere de `'EIXO'` — pela razão da entrada 0.6.0 levada à parede:
 * a chave entraria em toda parede do acervo, mudando a forma canônica de
 * desenhos que não têm nada a ver com traçado pela face. Ausente = `'EIXO'`,
 * que é exatamente o que aquelas paredes sempre significaram.
 *
 * 0.9.0 (30/08/2026) — a ESTRUTURA entrou no modelo: `structures`, uma família com
 * seis tipos (pilar, viga, laje, estaca, bloco de coroamento, viga de fundação) e
 * três formas geométricas. É a primeira família nova desde `Boundary`, e entra no
 * payload pela razão da entrada 0.5.0 — `modelFromCanonicalPayload` reatribui ids
 * `str_` novos, então referência externa por id se perderia no primeiro publish.
 *
 * A chave `structures` é emitida SÓ quando há alguma estrutura, e não como `[]`:
 * é o mesmo cuidado de `areaEscrituraMm2` (0.6.0) e `alinhamento` (0.8.0) levado a
 * uma família inteira. Emitir o array vazio acrescentaria a chave a todo desenho
 * do acervo — nenhum deles tem um pilar, e nenhum deles deveria mudar de forma
 * canônica por causa disso. Ausente e `[]` são a mesma coisa na volta.
 *
 * ⚠️ As estruturas NÃO entram no arranjo planar: `Space` continua saindo só de
 * paredes e limites. Um pilar no meio da sala não parte o ambiente. Isso não é
 * detalhe de render — é o que garante que acrescentar estrutura a uma planta não
 * mexe em área de piso, rodapé nem revestimento.
 *
 * 0.10.0 (01/09/2026) — `cedeSobreposicao` entrou em `Wall` e em `Structural`: a
 * decisão de quem abre mão do volume que dois componentes dividem. Pedido do
 * usuário depois de ver, no 3D, um pilar atravessando uma parede — e o que
 * estava errado não era a imagem (pilar embutido é normal na obra), era o
 * quantitativo pagando o mesmo metro cúbico duas vezes.
 *
 * Guarda a DECISÃO, nunca o volume: o número é recalculado a cada leitura
 * (`sobreposicao.ts`), senão mover o pilar deixaria para trás um desconto
 * obsoleto — que não some da tela, vira número plausível.
 *
 * A chave é emitida SÓ quando `true`, nos dois lados, pela razão das entradas
 * 0.6.0 e 0.8.0: emitir `false` acrescentaria a chave a toda parede e a toda
 * peça do acervo, mudando a forma canônica de desenhos que nunca tiveram um
 * pilar embutido. Ausente e `false` são a mesma coisa na volta.
 *
 * 0.11.0 (01/09/2026) — a PAREDE VIROU MULTICAMADA: `Wall` ganhou `camadas`,
 * uma lista de faixas com espessura, função construtiva e código de catálogo.
 * Uma parede real não é homogênea — bloco 140 com reboco 25 de cada lado são
 * três materiais, três preços e três serviços —, e sem isso o quantitativo só
 * sabia dizer "2,4 m³ de alvenaria", que não compra bloco nem argamassa.
 *
 * ⚠️ `thicknessMm` CONTINUA sendo a única espessura que a geometria lê. As
 * camadas são uma decomposição dela, e a soma é invariante
 * (`LAYERS_THICKNESS_MISMATCH`). Foi a decisão mais importante da entrada: se
 * as duas pudessem divergir, a parede seria desenhada com uma medida e orçada
 * com outra, e nada na tela diria qual das duas está errada. Para o usuário a
 * soma é que manda — `SetWallLayers` recalcula a espessura, e `SetThickness`
 * numa parede com camadas é recusado em vez de redistribuir os milímetros em
 * silêncio.
 *
 * ⚠️ O material é um CÓDIGO OPACO (`itemCode`), nunca um item resolvido.
 * Resolver exigiria consultar o catálogo no banco, e o payload deixaria de ser
 * função só do desenho: o mesmo traço geraria hashes diferentes conforme o
 * catálogo do dia. `descricao` viaja junto como cache de rótulo, e por isso
 * fica FORA da assinatura que compara composições — o catálogo pode mudar a
 * grafia sem que a parede tenha mudado.
 *
 * A chave `camadas` é emitida SÓ quando existe, pela razão das entradas 0.6.0,
 * 0.8.0, 0.9.0 e 0.10.0: emitir sempre acrescentaria a chave a toda parede do
 * acervo, mudando a forma canônica de desenhos homogêneos que não têm nada a
 * ver com composição. Ausente = homogênea, que é o que todos eles significavam.
 * Lista VAZIA, ao contrário de `structures: []`, é ERRO e não sinônimo de
 * ausente: aqui as duas escritas conviveriam no mesmo campo e o round-trip
 * pararia de fechar byte a byte.
 *
 * Entrou junto um desempate novo na ORDEM CANÔNICA das paredes, por assinatura
 * de camadas. Sem ele, duas paredes de mesma geometria e mesma espessura total
 * com composições diferentes ficavam em ordem indefinida, e o hash mudava sem a
 * geometria ter mudado.
 *
 * ─── 04/09/2026 — IDENTIDADE DE ELEMENTO, SEM BUMP ─────────────────────────
 *
 * Todo elemento ganhou `uid` (ver `identity.ts`), e o payload ganhou a chave de
 * topo `identity`. A versão NÃO subiu, de propósito: esta string versiona a
 * FORMA HASHEADA do payload, e a forma hasheada não mudou — `identity` fica
 * fora do hash por construção (`canonical.ts`). Subir a versão mudaria o hash
 * de todo o acervo por um dado que não é conteúdo, e os goldens provam que
 * nada mudou: passaram sem recaptura. O sidecar tem a própria marca
 * (`identity.v = 1`).
 *
 * ─── 0.11.0 → 0.12.0 (04/09/2026) — O TELHADO ──────────────────────────────
 *
 * `roofs` entrou no modelo: a ÁGUA, um plano inclinado de cobertura (ver
 * `telhado.ts`). É CONTEÚDO — muda o que o desenho afirma e o que o orçamento
 * compra —, então entra no hash, e por isso a versão sobe.
 *
 * A chave é emitida SÓ quando há alguma água, pela disciplina de `structures`,
 * `areaEscrituraMm2` e `alinhamento`: emitir `"roofs":[]` sempre acrescentaria
 * a chave a TODO desenho do acervo e mudaria a forma canônica de plantas que
 * não têm um telhado sequer.
 *
 * ⚠️ Mesma prova, refeita ANTES de tocar num hash: com a string em 0.11.0 e
 * todo o resto do telhado já no lugar, os SETE testes dos goldens passaram sem
 * nenhuma alteração — o que só acontece se os seis payloads continuarem byte a
 * byte iguais, e portanto se a chave `roofs` de fato não aparece em desenho sem
 * cobertura. As contagens de ambientes (9/49/144/3/78/4) foram afirmadas na
 * linha ANTES do hash e não falharam em momento nenhum.
 *
 * ─── 0.12.0 → 0.13.0 (05/09/2026) — A LINHA DE CORTE ───────────────────────
 *
 * `sections` entrou no modelo: o plano vertical por onde a edificação é
 * seccionada (ver `Corte` em `model.ts`). É CONTEÚDO — onde cortar é escolha do
 * usuário, e o snapshot precisa reproduzir o MESMO corte anos depois —, então
 * entra no hash, e por isso a versão sobe.
 *
 * A chave é emitida SÓ quando há algum corte, pela disciplina de `structures`,
 * `roofs`, `areaEscrituraMm2` e `alinhamento`.
 *
 * ⚠️ Mesma prova, refeita ANTES de tocar num hash: com a string em 0.12.0 e
 * todo o corte já no lugar — entidade, comandos, canônico —, os goldens
 * passaram sem nenhuma alteração, o que só acontece se a chave `sections` de
 * fato não aparece em desenho sem corte.
 *
 * ─── 0.13.0 → 0.14.0 (05/09/2026) — ESCADA E RAMPA ─────────────────────────
 *
 * `stairs` entrou no modelo: o percurso que vence um desnível (ver `Escada` em
 * `model.ts` e `escada.ts`). É CONTEÚDO, então entra no hash.
 *
 * ⚠️ O que entra é só o que o usuário DECIDE — percurso, largura, tipo e alvo
 * de espelho. O número de degraus, o espelho real e o piso ficam de FORA porque
 * são derivados do desnível entre pavimentos: gravados, fariam o payload
 * discordar de si mesmo no dia em que alguém mudasse a cota de um pavimento, e
 * a escada continuaria afirmando 22 degraus enquanto o desenho mostra 24.
 *
 * A chave é emitida SÓ quando há alguma escada, pela disciplina de `structures`,
 * `roofs`, `sections`, `areaEscrituraMm2` e `alinhamento`.
 *
 * ⚠️ Mesma prova, refeita ANTES de tocar num hash: com a string em 0.13.0 e
 * toda a escada já no lugar — entidade, comandos, canônico, invariantes —, os
 * sete testes dos goldens passaram sem nenhuma alteração, o que só acontece se
 * a chave `stairs` de fato não aparece em desenho sem circulação vertical.
 *
 * ─── 0.15.0 → 0.16.0 (06/09/2026) — A SEÇÃO EM T ──────────────────────────
 *
 * A peça estrutural ganhou `secaoT` (mesa + alma). É CONTEÚDO — muda o volume
 * de concreto, e portanto o preço —, então entra no hash e a versão sobe.
 *
 * Medido antes de escolher: das vigas com perfil poligonal dos dois modelos
 * estruturais reais, 219 são T e ZERO são L, I, U ou cruz. Por isso entrou uma
 * SEÇÃO T e não um polígono arbitrário — representar exatamente o que se sabe,
 * e recusar o resto.
 *
 * `larguraMm` e `alturaMm` NÃO mudaram de significado: continuam a largura em
 * planta (que numa T é a da mesa) e a altura total. Redefinir um campo conforme
 * o valor de outro faria todo lugar que já lê largura ficar sutilmente errado.
 *
 * A chave é emitida SÓ quando declarada, pela disciplina de `esquadria` e
 * `camadas`: toda peça do acervo é de seção cheia, e emitir `secaoT: undefined`
 * em cada uma mudaria a forma canônica por um campo que não as descreve.
 *
 * ⚠️ Mesma prova, refeita ANTES de tocar no hash: com a string em 0.15.0 e o
 * campo já no lugar, os goldens passaram intactos.
 *
 * ─── 0.16.0 → 0.17.0 (07/09/2026) — A GEORREFERÊNCIA ──────────────────────
 *
 * O modelo ganhou `georreferencia`: latitude, longitude, elevação, rotação do
 * norte e, quando um topógrafo a mediu, a coordenada projetada com o CRS.
 *
 * É CONTEÚDO — muda o que o desenho afirma sobre onde a obra fica —, então
 * entra no hash e a versão sobe.
 *
 * Precisou de campo novo porque não havia de onde ler: procurado em todo o
 * sistema, `latitude`/`longitude` só existem em Market Intelligence e nas
 * cidades do Dados Mestres, e nada ligado ao estudo nem ao terreno.
 *
 * Lat/long e projetada convivem em vez de uma derivar da outra: converter para
 * UTM aqui dependeria do fuso e do hemisfério, e errar o fuso põe o modelo a
 * centenas de quilômetros do lugar COM A FORMA PERFEITA. Cada uma sai no IFC
 * pelo caminho que lhe cabe.
 *
 * A chave é emitida SÓ quando declarada — e os campos internos também, senão
 * dois desenhos iguais teriam formas canônicas diferentes conforme por qual
 * caminho a georreferência foi gravada.
 *
 * ⚠️ Mesma prova, refeita ANTES de tocar no hash: com a string em 0.16.0 e o
 * campo já no lugar — entidade, comando, canônico, ida e volta —, os sete
 * testes dos goldens passaram intactos, o que só acontece se a chave de fato
 * não aparece em desenho sem lugar.
 *
 * ─── 0.14.0 → 0.15.0 (05/09/2026) — O TIPO DE ESQUADRIA ────────────────────
 *
 * A abertura ganhou `esquadria` (ver `Esquadria` em `model.ts`): nome, item de
 * catálogo e descrição. É CONTEÚDO — muda o que se compra —, então entra no
 * hash, e por isso a versão sobe.
 *
 * A chave é emitida SÓ quando declarada, pela disciplina de `camadas`: emitir
 * `esquadria: undefined` em toda abertura sem tipo mudaria a forma canônica de
 * cada porta do acervo por um campo que não a descreve.
 *
 * ⚠️ Mesma prova, refeita ANTES de tocar num hash: com a string em 0.14.0 e o
 * tipo já no lugar — entidade, comando, canônico, invariante —, os sete testes
 * dos goldens passaram sem alteração, o que só acontece se a chave de fato não
 * aparece em abertura sem tipo.
 */
/*
 * ─── 0.30.0 → 0.31.0 (15/09/2026) — VÁRIOS CIRCUITOS POR ELETRODUTO ─────────
 *
 * O trecho deixou de apontar para UM circuito (`circuito`, índice) e passou a
 * carregar a LISTA (`circuitos`, índices crescentes sem repetição). A norma
 * admite compartilhar o eletroduto; o tronco que sai do quadro é compartilhado
 * por construção. É conteúdo — muda condutores, ocupação e agrupamento —,
 * então entra no hash e a versão sobe. O escalar antigo é lido como lista de
 * um; a chave só é emitida quando há circuito, então desenho sem rede elétrica
 * mantém a forma canônica (os goldens, só de paredes, mudam apenas pela
 * string da versão).
 */
/*
 * ─── 0.31.0 → 0.32.0 (18/09/2026) — A TAXONOMIA HIDRÁULICA ─────────────────
 *
 * O terminal ganhou `tipoHidraulico` (campo fechado, irmão do `tipoEletrico`:
 * torneira, chuveiro, lavatório, vaso, reservatório, ralo, caixa sifonada,
 * registro, conexão…) e `volumeL` (litros do reservatório). É conteúdo — muda
 * o que se compra e o que o lançamento automático dimensiona —, então entra no
 * hash e a versão sobe. As duas chaves só são emitidas quando declaradas; os
 * goldens (só paredes) mudam apenas pela string da versão.
 */
/**
 * ─── 0.57.0 → 0.58.0 (25/09/2026) — O LOTEAMENTO ──────────────────────
 *
 * Quatro famílias novas para o parcelamento do solo (Lei 6.766/79): `quadras`,
 * `lotes`, `vias` (pelo EIXO, com a caixa e o passeio) e `areasPublicas`. São
 * desenho — têm ferramenta, vértice arrastável e desfazer —, então entram no
 * payload canônico e no hash. A gleba continua sendo o anel de `Boundary`: lote
 * não é divisa, porque `medirTerreno` assume UM anel.
 *
 * O lote aponta a quadra por ÍNDICE na ordem canônica, nunca por id — id é
 * reatribuído ao recarregar o payload. As quatro listas são OMITIDAS quando
 * vazias, então desenho sem loteamento não ganha chave nova e só muda de hash
 * pela string da versão. Isso foi provado antes do bump.
 */
/**
 * ─── 0.58.0 → 0.59.0 (26/09/2026) — VÉRTICES NOMEADOS DO TERRENO ──────────────
 *
 * `verticesDoTerreno`: nome (e, opcionalmente, tipo M/P/V, sigma e método) por
 * vértice do lote, ancorado no PONTO — não no índice do anel, que é derivado e
 * renumera ao apagar uma divisa. É o que amarra o memorial, a tabela de
 * coordenadas e a planta ao mesmo vértice. Nome é conteúdo (muda o hash); a
 * lista é omitida quando vazia, então desenho sem vértice nomeado só muda de
 * hash pela string da versão — provado antes do bump.
 */
/**
 * ─── 0.59.0 → 0.60.0 (26/09/2026) — O QUE O SIGEF PEDE ────────────────────────
 *
 * Vértice do terreno com sigma por eixo (E, N, h) e altitude elipsoidal; divisa
 * com tipo de limite (LA1…LN6, Manual Técnico de Limites e Confrontações do
 * INCRA) e documentos do confrontante; nomeação `<credenciado>-<tipo>-<seq>`.
 * Campos omitidos do canônico quando ausentes — provado antes do bump.
 */
/**
 * ─── 0.60.0 → 0.61.0 (26/09/2026) — OS TEMAS DO CAR ───────────────────────────
 *
 * A família "área" aceita os temas ambientais do SICAR (APP, Reserva Legal,
 * vegetação nativa, área consolidada, servidão, hidrografia), que ficam fora das
 * contas do loteamento (`ehAreaDoLoteamento`). Vocabulário novo, forma igual.
 */
/**
 * ─── 0.61.0 → 0.62.0 (28/09/2026) — AS PEÇAS HIDRÁULICAS QUE FALTAVAM ─────────
 *
 * O ponto hidráulico aceita bidê, banheira, mictório, válvula de descarga, ponto
 * de espera, torneira de boia, ralo linear, registro de esfera e VRP (E0.4 do
 * roadmap hidrossanitário, `docs/planos/2026-09-28-hidrossanitario-roadmap.md`).
 * Vocabulário novo, forma igual — provado antes do bump.
 */
/**
 * ─── 0.62.0 → 0.63.0 (28/09/2026) — O MATERIAL DO CANO ────────────────────────
 *
 * `Trecho.material` (PVC soldável, CPVC, PPR, cobre) em água fria e quente, para
 * a perda de carga (E1.1 do roadmap hidrossanitário). Omitido quando ausente —
 * o padrão da rede não se grava. Provado antes do bump.
 */
/**
 * ─── 0.63.0 → 0.64.0 (29/09/2026) — PAPEL E FORMA DO RESERVATÓRIO ─────────────
 *
 * `Terminal.papelReservatorio` (SUPERIOR/INFERIOR) e `Terminal.formaReservatorio`
 * (PRISMA/CILINDRO), só em RESERVATORIO (E4.2 do roadmap hidrossanitário). O
 * INFERIOR não distribui; o CILINDRO tem volume e 3D de cilindro. Omitidos
 * quando ausentes. Provado antes do bump.
 */
/**
 * ─── 0.64.0 → 0.65.0 (29/09/2026) — A LIGAÇÃO À REDE PÚBLICA ─────────────────
 *
 * O ponto hidráulico aceita `LIGACAO_ESGOTO` (E5.3 do roadmap hidrossanitário):
 * onde o coletor predial encontra a rede pública, com a cota da rede.
 * Vocabulário novo, forma igual — provado antes do bump.
 */
/**
 * ─── 0.65.0 → 0.66.0 (29/09/2026) — ÁGUAS PLUVIAIS ──────────────────────────
 *
 * A disciplina `PLUVIAL` (E6.1 do roadmap hidrossanitário, NBR 10844) e os
 * pontos dela: `RALO_PLUVIAL`, `CAIXA_AREIA` e `LIGACAO_PLUVIAL`; a espera e as
 * conexões forçadas passam a aceitar a pluvial, e a caixa de areia é caixa (a
 * ponta que termina dentro dela está ligada). Vocabulário novo, forma igual —
 * provado antes do bump.
 */
/**
 * ─── 0.66.0 → 0.67.0 (29/09/2026) — A CALHA ─────────────────────────────────
 *
 * `Trecho.secaoCalha` (SEMICIRCULAR/RETANGULAR) e `Trecho.alturaCalhaMm` (E6.2
 * do roadmap hidrossanitário): o trecho pluvial que é calha. Só em PLUVIAL; a
 * retangular exige altura. Omitidos quando ausentes — provado antes do bump.
 */
/**
 * ─── 0.67.0 → 0.68.0 (29/09/2026) — O TRATAMENTO INDIVIDUAL ─────────────────
 *
 * O ponto de esgoto aceita `TANQUE_SEPTICO`, `FILTRO_ANAEROBIO` e `SUMIDOURO`
 * (E7.1 do roadmap hidrossanitário, NBR 7229/13969), caixas cuja cota é a do
 * TUBO (`CAIXAS_DE_ESGOTO.cotaE = 'TUBO'`); `AddTerminal` aceita as medidas.
 * Vocabulário novo, forma igual — provado antes do bump.
 */
/**
 * ─── 0.68.0 → 0.69.0 (29/09/2026) — OS EQUIPAMENTOS ELÉTRICOS ───────────────
 *
 * `tipoEletrico` aceita `AR_CONDICIONADO`, `MOTOR_BOMBA`, `VENTILADOR_EXAUSTOR`,
 * `PORTAO`, `CARREGADOR_VE`, `CAMPAINHA`, `PONTO_ESPERA` e `ATERRAMENTO` (E1.1
 * do roadmap elétrico). Vocabulário novo, forma igual: nenhum desenho existente
 * muda de payload — provado antes do bump com a suíte inteira na string antiga.
 */
/**
 * ─── 0.69.0 → 0.70.0 (29/09/2026) — A CAIXA DE PASSAGEM ─────────────────────
 *
 * `tipoEletrico` aceita `CAIXA_PASSAGEM` (E1.2 do roadmap elétrico): a caixa
 * 4×4/octogonal como terminal com medidas — infraestrutura, não carga. A ficha
 * do componente ganhou `ligaAoPontoEletrico` (catálogo, não payload). Vocabulário
 * novo, forma igual — provado antes do bump com os goldens na string antiga.
 */
/**
 * ─── 0.70.0 → 0.71.0 (29/09/2026) — O COMANDO ENTRE PAVIMENTOS ──────────────
 *
 * `Terminal.comandoGlobal` (E2.1 do roadmap elétrico): a letra do comando vale
 * no desenho inteiro — a luz da escada acesa pelo paralelo de baixo e pelo de
 * cima. `true` ou ausente no canônico, como `sugerida`; nenhum desenho existente
 * muda de payload — provado antes do bump com os goldens na string antiga.
 */
/**
 * ─── 0.71.0 → 0.72.0 (29/09/2026) — NEUTRO E PE DECLARADOS ──────────────────
 *
 * `Circuito.secaoNeutroMm2` e `secaoPeMm2` (E2.3 do roadmap elétrico): o
 * projetista pode declarar seções diferentes da fase para o neutro e o terra;
 * ausentes, vale a conta da norma (neutro = fase, PE pela Tabela 58). Omitidas
 * no canônico quando ausentes — nenhum desenho muda de payload, provado antes
 * do bump com os goldens na string antiga.
 */
/**
 * ─── 0.72.0 → 0.73.0 (29/09/2026) — DR COMO PEÇA DO QUADRO ──────────────────
 *
 * `Quadro.drs[]` (E3.1 do roadmap elétrico): dispositivo DR com corrente
 * nominal, sensibilidade, polos e escopo (geral ou circuitos). No canônico é a
 * chave `drs`, omitida quando não há nenhum — nenhum desenho muda de payload,
 * provado antes do bump com os goldens na string antiga. `Circuito.protecaoDR`
 * continua lido como DR individual de 30 mA (legado).
 */
/**
 * ─── 0.73.0 → 0.74.0 (29/09/2026) — DPS NO QUADRO ──────────────────────────
 *
 * `Quadro.dps` (E3.2 do roadmap elétrico): classe, Up, In e disjuntor de
 * desconexão, declarados. Omitido no canônico quando ausente — nenhum desenho
 * muda de payload, provado antes do bump com os goldens na string antiga.
 */
/**
 * ─── 0.74.0 → 0.75.0 (29/09/2026) — CURVA E Icn DO DISJUNTOR ────────────────
 *
 * `Circuito.curva` (B/C/D) e `Quadro.icnKa` (E3.3 do roadmap elétrico),
 * declarados; omitidos no canônico quando ausentes — nenhum desenho muda de
 * payload, provado antes do bump com os goldens na string antiga.
 */
/**
 * ─── 0.75.0 → 0.76.0 (29/09/2026) — HIERARQUIA DE QUADROS ──────────────────
 *
 * `Quadro.tipo` (QD/QGBT/MEDICAO), `Quadro.quadroPaiId` (canônico: `pai` por
 * índice, num segundo passo depois da ordenação) e `Circuito.reserva` (E4.1
 * do roadmap elétrico). Omitidos quando ausentes — nenhum desenho muda de
 * payload, provado antes do bump com os goldens na string antiga.
 */
/**
 * ─── 0.76.0 → 0.77.0 (29/09/2026) — ENTRADA DE ENERGIA ─────────────────────
 *
 * Tipos `ENTRADA_SERVICO` e `MEDIDOR` (E4.3 do roadmap elétrico) e
 * `Terminal.quadroId` (canônico `quadro` por índice, omitido sem vínculo).
 * Nenhum desenho muda de payload — provado antes do bump com os goldens na
 * string antiga.
 */
/**
 * ─── 0.77.0 → 0.78.0 (29/09/2026) — USO COLETIVO ───────────────────────────
 *
 * `Quadro.unidadeId` e `Terminal.unidadeId` (MEDIDOR) — E4.4 do roadmap
 * elétrico; canônico `unidade` por índice, omitido sem vínculo. Nenhum
 * desenho muda de payload — provado antes do bump com os goldens na string
 * antiga.
 */
/**
 * ─── 0.78.0 → 0.79.0 (30/09/2026) — A REDE DE INCÊNDIO ──────────────────────
 *
 * A disciplina `INCENDIO` (E1.1 do roadmap de incêndio) e os pontos dela:
 * `HIDRANTE_SIMPLES`, `HIDRANTE_DUPLO`, `MANGOTINHO`, `HIDRANTE_RECALQUE`,
 * `SPRINKLER`, `VGA`, `CHAVE_FLUXO`, `BOMBA_INCENDIO`, `BOMBA_JOCKEY` e
 * `PRESSOSTATO`; gaveta, retenção, espera e conexões forçadas passam a aceitar
 * a rede de incêndio. No sprinkler, `Terminal.fatorK` (L/min/bar^½, inteiro) e
 * `Terminal.posicaoSprinkler` (PENDENTE/EM_PE/LATERAL), omitidos do canônico
 * quando ausentes. Vocabulário novo, forma igual — provado antes do bump.
 */
/**
 * ─── 0.79.0 → 0.80.0 (30/09/2026) — OS TUBOS DA REDE DE INCÊNDIO ────────────
 *
 * `MATERIAIS_DE_TUBO` ganha `ACO_GALVANIZADO`, `ACO_CARBONO` e `CPVC_INCENDIO`
 * (E1.2 do roadmap de incêndio), e `MATERIAIS_DA_DISCIPLINA` diz o que cada
 * rede admite: a invariante passa a aceitar material na rede de INCENDIO. O
 * padrão do incêndio é o aço galvanizado (derivado, não gravado). Vocabulário
 * novo, forma igual — provado antes do bump.
 */
/**
 * ─── 0.80.0 → 0.81.0 (30/09/2026) — A RESERVA TÉCNICA DE INCÊNDIO ───────────
 *
 * `RESERVATORIO` passa a existir na rede de `INCENDIO` (a caixa só de incêndio,
 * fonte por gravidade sem bomba), e a caixa de ÁGUA FRIA ganha
 * `Terminal.volumeRtiL` — os litros reservados para o incêndio (E3.2 do roadmap
 * de incêndio), inteiro, ≤ `volumeL`, omitido do canônico quando ausente.
 * Vocabulário novo, forma igual — provado antes do bump.
 */
/**
 * ─── 0.81.0 → 0.82.0 (30/09/2026) — A BOMBA DE INCÊNDIO ─────────────────────
 *
 * Nas bombas de incêndio (E4.1 do roadmap de incêndio): `Terminal.curvaBomba`
 * (pontos [L/min, mm] com vazão crescente e altura que não sobe, ≥ 3) e
 * `Terminal.npshrMm`; na jockey, `Terminal.bombaPrincipalId` — no canônico por
 * ÍNDICE (`principal`), num segundo passo, e limpa quando a principal some
 * (`limparBombasOrfas`). Tudo omitido quando ausente. Vocabulário novo, forma
 * igual — provado antes do bump.
 */
/**
 * ─── 0.82.0 → 0.83.0 (01/10/2026) — A ÁREA DE OPERAÇÃO ──────────────────────
 *
 * Nos sprinklers (E5.2 do roadmap de incêndio): `model.areasDeOperacao` — o
 * contorno (>= 3 vértices inteiros) em que os sprinklers abrem juntos no
 * cálculo, com o risco próprio e o nome opcionais. Os sprinklers dela são
 * DERIVADOS (os do pavimento com o ponto dentro). No canônico, pavimento por
 * índice e omitida quando não há; some com o pavimento. `RISCOS_DE_SPRINKLER`
 * passou a morar no kernel. Coleção nova, forma igual — provado antes do bump.
 */
/**
 * ─── 0.83.0 → 0.84.0 (01/10/2026) — ESCADA E PORTA DE EMERGÊNCIA ────────────
 *
 * Nas saídas de emergência (E6.2 do roadmap de incêndio): `Escada.protecao`
 * (NE, EP, PF, PRESSURIZADA) e `Opening.emergencia` (SAIDA, CORTA_FOGO,
 * ANTIPANICO — sem repetição, na ordem da lista, nunca vazia; comando
 * `SetOpeningEmergencia`). Os dois omitidos do canônico quando ausentes.
 * Vocabulário novo, forma igual — provado antes do bump.
 */
/**
 * ─── 0.84.0 → 0.85.0 (01/10/2026) — O EXTINTOR ──────────────────────────────
 *
 * Nos preventivos de incêndio (E7.1 do roadmap de incêndio): o tipo `EXTINTOR`
 * na lista de pontos da disciplina INCENDIO (não liga em tubo) e, só nele,
 * `Terminal.agenteExtintor` (AGUA, ESPUMA, PQS_BC, PQS_ABC, CO2),
 * `cargaExtintorKg` e `capacidadeExtintora` ("2-A:20-B:C"). Omitidos do
 * canônico quando ausentes. Vocabulário novo, forma igual — provado antes do bump.
 */
/**
 * ─── 0.85.0 → 0.86.0 (01/10/2026) — A PLACA DE SINALIZAÇÃO ──────────────────
 *
 * Nos preventivos de incêndio (E7.2 do roadmap de incêndio): o tipo `PLACA` e,
 * só nele, `Terminal.codigoPlaca` (NBR 13434: "E5", "S12") e `alvoId` (o
 * equipamento sinalizado) — no canônico por ÍNDICE (`alvo`), num segundo passo;
 * apagar o equipamento deixa a placa sem alvo (`limparPlacasOrfas`). A direção
 * da placa de rota é a `rotacaoGraus`. Omitidos quando ausentes. Vocabulário
 * novo, forma igual — provado antes do bump.
 */
/**
 * ─── 0.86.0 → 0.87.0 (01/10/2026) — A LUMINÁRIA DE EMERGÊNCIA ───────────────
 *
 * Nos preventivos de incêndio (E7.3 do roadmap de incêndio): o tipo
 * `LUMINARIA_EMERGENCIA` e, só nele, `Terminal.autonomiaMin` (inteiro, 1–600).
 * Omitida quando ausente. Vocabulário novo, forma igual — provado antes do bump.
 */
export const KERNEL_VERSION = 'blueprint-kernel-ts-0.87.0';

/**
 * Tolerância de junção/snap em milímetros.
 *
 * Dois vértices a até esta distância são considerados o mesmo ponto no arranjo
 * planar. Não é preferência de UI: muda o resultado topológico, portanto acompanha
 * a versão do kernel e entra no hash.
 */
export const DEFAULT_TOLERANCE_MM = 5;

/** Maior coordenada aceita, em mm. Além disso os predicados exatos perdem garantia. */
export const MAX_COORD_MM = 1_000_000;

export class KernelError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'KernelError';
  }
}

/**
 * Arredonda para milímetro inteiro com desempate LONGE DE ZERO.
 *
 * `Math.round` desempata para +Infinito (`Math.round(-0.5) === -0`), o que é
 * assimétrico entre um ponto e seu espelho. Meio-longe-de-zero é simétrico e é a
 * convenção que o braço Rust precisa reproduzir para o payload bater — `f64::round`
 * do Rust já é meio-longe-de-zero, então esta escolha alinha as duas linguagens
 * sem nenhuma tabela de conversão.
 */
export function roundToMm(value: number): number {
  if (!Number.isFinite(value)) {
    throw new KernelError('NON_FINITE', `Coordenada não finita: ${value}`);
  }
  // `+ 0` normaliza -0 para 0: -0 e 0 são iguais em ===, mas JSON.stringify os
  // escreve diferente ("0" × "-0") e isso vazaria para o payload canônico.
  return (value < 0 ? -Math.round(-value) : Math.round(value)) + 0;
}

export function isIntegerMm(value: number): boolean {
  return Number.isInteger(value) && Math.abs(value) <= MAX_COORD_MM;
}

export function assertIntegerMm(value: number, field: string): number {
  if (!isIntegerMm(value)) {
    throw new KernelError(
      'NOT_INTEGER_MM',
      `${field} deve ser milímetro inteiro dentro de ±${MAX_COORD_MM}; recebido ${value}`,
    );
  }
  return value + 0;
}

/**
 * Converte da unidade de exibição para o interior do kernel.
 * Só deve ser chamado na borda da aplicação (PRD §9.2).
 */
export function metersToMm(meters: number): number {
  return roundToMm(meters * 1000);
}

export function mmToMeters(mm: number): number {
  return mm / 1000;
}

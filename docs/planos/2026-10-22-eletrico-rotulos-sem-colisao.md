# Planta › Elétrico — textos e símbolos sem sobreposição (tela e prancha)

## Pedido original

Sessão `9e26b316`, 22/10/2026, com dois prints da planta **Garden** (Garden Cambuhy) com a disciplina elétrica ligada:

> veja estes dois print da planta Garden cambuhy. Sisteme elétrico. Veja a total confusão de sobreposicões de testos e componentes.

Decisões do usuário na mesma sessão (perguntas do plan mode):

- Escopo: **tela e prancha** (o mesmo motor nas duas saídas).
- Quando um texto não tem lugar livre ao lado do símbolo: **linha de chamada**.
- Tomada sugerida: **anel e frase sempre** (só passam a ser posicionados sem colisão).
- Rótulo da luminária: **só "C3"** (o círculo com a potência dentro já diz que é luz).

## Causa (lida em `origin/main` d42f19b8)

1. Todo texto elétrico ia a uma distância FIXA do próprio símbolo, sem olhar o vizinho
   (`BlueprintCanvas.tsx`: rótulo do ponto, bloco da tomada, letra do comando, potência da LD,
   círculo do trecho numerado + "N cond.", números/seção dos grupos de condutores, Ø).
   O único posicionador com colisão (`posicionarRotulos`) só atendia as siglas hidráulicas — e,
   sem lugar livre, devolvia a 1ª posição mesmo assim.
2. A prancha (`blueprintPranchaEletrica.ts`) fazia igual.
3. Um círculo numerado por PEDAÇO de tronco (`trechosNumerados`): cada derivação corta o tronco, e
   cada pedaço ganhava círculo + "N cond." (o print chega a "141").
4. Afastado (zoom < 0,08 px/mm) os textos ficam no tamanho mínimo e a planta encolhe.

## Itens

### F1 — Motor puro `utils/blueprintAnotacaoSemColisao.ts`
- **Muda:** função pura `posicionarAnotacoes(anotacoes, obstaculos, opcoes)` — prioridade, 8
  posições coladas, anéis crescentes com linha de chamada, grade espacial, melhor esforço.
- **Pronto quando:** `__tests__/blueprintAnotacaoSemColisao.test.ts` verde (vizinhos não se
  sobrepõem; prioridade escolhe primeiro; chamada só quando afastou; determinístico; caso denso
  sem interseção) e `__tests__/blueprintRotulosSemColisao.test.ts` continua verde.
- [x] feito — `81e260b4`; `posicionarRotulos` passou a delegar ao motor (só posições coladas).

### F2 — Canvas usa o motor
- **Muda:** `BlueprintCanvas.tsx` empilha os textos elétricos (ponto, tomada em bloco, comando,
  LD, trecho numerado, condutores, Ø) e desenha num passe só, depois dos símbolos; luminária
  escreve `C{n}`.
- **Pronto quando:** teste de componente com luz + interruptor + tomadas sugeridas coladas não
  acha interseção entre caixas de texto elétricas; prints antes/depois no app.
- [x] feito — `bb5a0e6a`. `__tests__/components/BlueprintCanvasAnotacoesEletricas.test.tsx` falha no canvas
  antigo com `"Luz teto · C1" × "600 VA"` (o defeito do print) e passa no novo. O texto das marcas de
  verificação entrou como obstáculo; `BlueprintCanvasMarcasTexto.test.tsx` passou a medir pela base do texto.

### F3 — Um número por tronco
- **Muda:** `trechosNumerados` agrupa trechos encadeados com a mesma composição num só rótulo;
  o círculo sai uma vez (no trecho mais longo do grupo); a tabela da folha tem uma linha por grupo.
- **Pronto quando:** teste em `fiacao` com tronco cortado em 3 pedaços iguais → 1 rótulo, 1 linha.
- [x] feito — `8a0f88fb` (`TrechoNumerado.principal`; bundle da planta-api regerado, `plantaApi.test` verde).

### F4 — Prancha usa o motor
- **Muda:** `blueprintPranchaEletrica.ts` posiciona os textos da planta pelo mesmo motor (mm), com
  chamada por `d.linha`; luminária `C{n}`.
- **Pronto quando:** teste com `DesenhistaDeProva` sem interseção entre textos da planta.
- [x] feito — `1da702bd`. O teste falha na prancha antiga (`"Luz teto · C1" × "a"`) e passa na nova; a
  categoria de cada texto (camada do DXF) vai junto dele. `PRIORIDADE_DA_ANOTACAO` mora no motor.

### F5 — Afastado demais
- **Muda:** abaixo de `ESCALA_DE_ANOTACAO_PX_MM` os textos de prioridade baixa (Ø, "N cond.",
  seção) não entram no motor; circuito, pendência, potência, instrução e nº do trecho continuam.
- **Pronto quando:** teste/inspeção no zoom de conjunto.
- [x] feito — dentro do `anotar` da F2 (`longeDemais`).

### F6 — O Ø predominante vai para a legenda (achado na prova por imagem)
- **Por quê:** com os textos sem colisão, cada "Ø 25" dos 309 pedaços de eletroduto do Garden ganhou lugar
  próprio e virou o novo ruído (antes se empilhavam em borrões).
- **Muda:** `utils/blueprintDiametroDosEletrodutos.ts` — o Ø de maior comprimento somado não se escreve
  (legenda da prancha: "ELETRODUTO SEM INDICAÇÃO — Ø25"); o diferente, uma vez por trecho contínuo, no
  pedaço mais longo. Abaixo de 0,02 px/mm (o lote inteiro na tela) o canvas não puxa chamada.
- **Pronto quando:** `__tests__/blueprintDiametroDosEletrodutos.test.ts` verde; prints.
- [x] feito — `d9ccfc5f`.

## Prova por imagem (22/10/2026)
Harness LOCAL (não versionado, sem login nem escrita no banco): o `BlueprintCanvas` com uma cópia do
rascunho da planta Garden (`blueprint_branches.draft_payload`, 96 pontos elétricos — todos sugeridos —
e 309 eletrodutos), canvas de `origin/main` × novo, em quatro zooms. Prints em `C:/tmp/rotulos-garden/`.
- Apartamento (~0,04 px/mm, o print 1) e trabalho (~0,085): sem texto sobre texto; blocos da tomada
  ("-20- / 600 VA / Posicione sobre a bancada da pia") legíveis; luz como "C3".
- Lote inteiro (~0,007): os textos não cabem fisicamente — amontoavam (sem chamada).

## Decisões posteriores (22/10/2026, mesma sessão)
> 1. Zoom do lote inteiro: … Resposta: Esconde
> 3. Publicar: … resposta/: sim
> melhoria: nao precisa de texto Luz de teto. Pelo simbolo o usuário sabe do que se trata

- Abaixo de 0,02 px/mm os textos ELÉTRICOS não se escrevem (os símbolos ficam; a sigla das peças
  hidráulicas/climatização continua); voltam ao aproximar. Teste em
  `BlueprintCanvasAnotacoesEletricas.test.tsx`.
- "Luz teto" já tinha saído (luminária = "C3"), na tela e na prancha.
- ⚠️ Achado ao testar: a prop `escala` do `BlueprintCanvas` NÃO muda a vista (ela é do canvas e começa em
  0,05 px/mm), e em jsdom o canvas mede 0 × 0 e ignora a navegação. Os testes de zoom agora medem 800 × 600 e
  mudam o zoom pela `navegacao` (centralizar / zoom −), conferindo pelos centros dos símbolos.
- Ruído que sobra: a seção "2,5" em quase todo trecho, "N cond." e os números dos trechos cheios (que vêm
  de troncos com 30–109 condutores — ver Fora do escopo).

## Fora do escopo
- Trechos com 30–109 condutores num tronco ("109 cond." no Garden): é o roteamento automático concentrando circuitos num
  caminho só (desenho não resolve). Diagnóstico separado.

## Estado
- [ ] PR + CI
- [ ] publicação

# Hidráulica (MEP): componentes tipados, conexões e lançamento automático

## Pedido original (17/09/2026)

> Hidráulica (MEP) estão faltando componentes como: conexões, caixa d'água, ralo etc.
> 1. implemente os componentes citados acima. 2. lançamento automático

Escopo confirmado: pontos de consumo tipados (NBR 5626); reservação (caixa d'água, bomba,
aquecedor); esgoto (ralos, caixa sifonada, caixa de inspeção, caixa de gordura, tubo de
queda/ventilação); registros e válvulas sobre o trecho; conexões **derivadas + item manual**;
automático = água fria (caixa → pontos), esgoto (pontos → CI), distribuir pontos por
ambiente, água quente (aquecedor → pontos). Plano completo (cinco fases) em
`~/.claude/plans/incoporacao-planta-inteligente-tingly-acorn.md`; cada fase publica sozinha.

## Decisões de modelo

1. `Terminal.tipoHidraulico` — campo FECHADO irmão de `tipoEletrico`, válido só em
   AGUA_FRIA/AGUA_QUENTE/ESGOTO e só nas disciplinas que `DISCIPLINAS_DO_PONTO_HIDRAULICO`
   admite para o tipo (um chuveiro tem ponto de AF, AQ e esgoto: três terminais no mesmo
   (x,y), cotas diferentes). `tipo` segue texto livre.
2. Caixa d'água = `RESERVATORIO` (AF) com as medidas já existentes + `volumeL` (litros; só
   no reservatório; a invariante recusa nos demais). `cotaMm` = cota do fundo.
3. Registro/válvula/hidrômetro/conexão manual = terminal "sobre o trecho": o editor projeta
   o clique no trecho mais próximo de disciplina admitida (`projetarNoTrecho`, tolerância
   150 mm), a disciplina é a do trecho, a cota é interpolada; longe de trecho → recusa com
   aviso. Não parte o trecho (mover o trecho não arrasta o registro; `SplitTrecho` é evolução).
4. Tubo de queda / ventilação = trechos ESGOTO em prumada criados num clique
   (`redeEmUmClique` no canvas; DN 100 teto→−150 / DN 50 −150→teto; rótulo "TQ"/"Ventilação").
5. Ficha única em `utils/blueprintHidraulica.ts`: rótulo, sigla, grupo, disciplinas, cota
   usual, DN mínimo, **peso NBR 5626**, **UHC NBR 8160**, medidas padrão, volume padrão.
6. **Um bump só**: taxonomia inteira (26 valores, conexões inclusive) + `volumeL` →
   `KERNEL_VERSION` 0.31.0 → **0.32.0**. Ritual dos goldens cumprido: com a string antiga e os
   campos no lugar os sete testes passaram; após o bump, seis falhas só de hash — recapturados.

## F1 — entregue em 18/09/2026

- Kernel: `TIPOS_DE_PONTO_HIDRAULICO`, `DISCIPLINAS_DO_PONTO_HIDRAULICO`, campos, invariantes
  (`BAD_POINT_KIND`, `BAD_VOLUME`), `AddTerminal`/`SetTerminalProps` (volume só em
  RESERVATORIO; trocar o tipo zera), canônico (chaves só quando declaradas), `quantities`
  (`QuantidadePorTerminal.classificacao`; contagem por classificação).
- Menu Hidráulica: grupos derivados da ficha — pontos de consumo (um item por disciplina
  admitida: "Chuveiro · água fria/quente/esgoto"), reservação, esgoto (+ prumadas), registros
  e válvulas (um item; disciplina do trecho), conexões (manual), a classificar (os 3
  genéricos). `FICHAS` das peças sobre o trecho valem para todas as disciplinas admitidas.
- Editor: `tipoDePontoHidraulico`/`prumadaDeRede`; `adicionarTerminal` usa a ficha; barra de
  opções diz o tipo. Painel do ponto: select de tipo (filtrado pela disciplina), volume,
  leitura de peso/UHC/DN mínimo. Canvas: sigla ao lado (CH, VS, RG…), marcas em ralos/caixas,
  "CX 1000 L" dentro da caixa. Inventário: chave `PONTO_<disc>_<tipo>`, rótulo pela sigla.
- Orçamento: escopo `INSTALACAO` com `COMPRIMENTO_TUBO_AGUA_FRIA/AGUA_QUENTE/ESGOTO`,
  `COMPRIMENTO_ELETRODUTO` (uma linha por DN) e `CONTAGEM_PONTOS_HIDRAULICOS` (por
  classificação) — até aqui nenhuma medida de rede chegava ao de-para.
- IFC: entidade por tipo (`IfcSanitaryTerminal`, `IfcTank`, `IfcValve`, `IfcWasteTerminal`,
  `IfcDistributionChamberElement`, `IfcInterceptor`, `IfcFlowMeter`, `IfcPipeFitting`, …).

### Testes
`blueprintPontoHidraulicoTipos.test.ts` (14), `blueprintBudgetInstalacoes.test.ts` (5),
editor "menu Hidráulica"; goldens recapturadas; `blueprintComponentesRede` ajustado (esgoto sem
tipo → "a classificar"). Suíte cheia 4529.

### Verificação no app real (escritas bloqueadas: 20)
Chuveiro · água fria → painel com tipo CHUVEIRO e "peso 0,4 (NBR 5626) · DN mínimo 20 mm";
caixa d'água → volume 1000 no painel e "CX 1000 L" no desenho; registro longe de trecho →
aviso e nada criado; sobre um trecho de AF → REGISTRO_GAVETA na cota 2200; tubo de queda num
clique → trecho DN 100 "TQ"; lista de Componentes com "pontos de consumo 1 · reservação 1";
Desfazer devolve tudo.

## F2 — conexões derivadas — entregue em 18/09/2026

- `utils/blueprintKernel/conexoes.ts` (novo): `conexoesDerivadas(model)` → `{ conexoes,
  pontasAbertas }`. Nós por disciplina + pavimento + ponto + cota (laje como encontro, mesma
  chave dos eletrodutos); ângulo em 3D. Regra: 1 trecho sem terminal = ponta aberta (aviso);
  2 colineares = LUVA / REDUÇÃO (salvo peça no nó); ~90° = JOELHO_90; ~45°/135° = JOELHO_45;
  ângulo torto = JOELHO_90 com aviso; 3 = TÊ (de redução se DNs diferem); 4+ = CRUZETA com
  aviso. Terminal `CONEXAO_*` no nó suprime a derivada (origem MANUAL); manual no meio de um
  trecho conta com a bitola dele; sem trecho embaixo, aviso. Determinístico.
- `quantities.ts`: `Quantitativos.conexoes` e `totais.porConexao` (disciplina × tipo × DN[→DN],
  com `derivadas`/`manuais`). Sem bump: derivação, não payload.
- Orçamento: medida `CONTAGEM_CONEXOES` (UN, uma linha por tipo×DN×disciplina; filtro por
  texto "Joelho", "DN 25"…). Tela Quantitativos › Resumo: grupo **Instalações** com tubo por
  DN, pontos por classificação e conexões; contagens inteiras.
- IFC: só as manuais saem (`IfcPipeFitting`, F1); as derivadas não — são derivação.

### Testes
`blueprintConexoesDerivadas.test.ts` (9): L, tê/45°/torto, luva/redução/registro no nó,
prumada 3D e esgoto com caimento, água×esgoto não se ligam, manual suprime e manual no meio,
determinismo, laje entre pavimentos, quantitativo + orçamento. Suíte cheia 4545.

### App real (escritas bloqueadas: 15)
Três trechos de AF desenhados → Quantitativos › Resumo › Instalações: "Água fria DN 25 12,63 m ·
3 trecho(s)", "Joelho 90° DN 25 · Água fria 1 — 1 deduzida(s) dos encontros"; Desfazer devolve.

## F3 — distribuir pontos por ambiente — entregue em 18/09/2026

- `utils/blueprintPontosHidraulicos.ts` (novo): `kitDoAmbiente` (BANHEIRO → banheiro;
  COZINHA_SERVICO → área de serviço se o nome tem "serv"/"lavand", senão cozinha);
  `HipotesesDePontos { aguaQuenteEm, coletorDoBanheiro, recuoDaParedeMm }`;
  `planejarPontosDoAmbiente` — kits: banheiro (vaso AF+ESG, lavatório AF[+AQ]+ESG, chuveiro
  AF[+AQ], coletor ESG), cozinha (pia AF[+AQ]+ESG), serviço (tanque, máquina AF+ESG, ralo seco);
  posições no anel recuado (`ladosDePiso`, `pontoJuntoAPorta`): vaso no maior lado sem porta,
  lavatório junto à porta, chuveiro no canto mais longe, coletor a 300 mm, pia no maior lado
  oposto à porta, tanque/máquina lado a lado, ralo perto do tanque; N terminais por aparelho no
  mesmo (x,y), cotas da ficha, `sugerida: true`, rótulo "Kit · Ambiente"; **idempotente** por
  (tipo, disciplina) — a disciplina que falta nasce no lugar do irmão; kit forçado por ambiente.
- Editor: tarefa `pontosHidraulicos`; aba Hidráulica ganhou o grupo **Lançamento** com
  "Distribuir pontos" (contagem = ambientes com algo a criar) e "Aceitar sugeridas" (já era
  agnóstico de disciplina). Gaveta: hipóteses (AQ em CH/LV/PIA/TQ/ML/DH, coletor, recuo), tabela
  por ambiente (kit trocável, siglas a criar por disciplina, Lançar por linha), rodapé com
  "Lançar em todos (N)" e "Aceitar sugeridas". Hipóteses em `blueprint:pontosHidraulicos`.

### Testes
`blueprintPontosHidraulicos.test.ts` (8): kit por tipo/nome, banheiro completo com
disciplinas e cotas, todos os pontos dentro do anel e sem colisão, cozinha/serviço, hipótese de
AQ e coletor, idempotência + AQ depois no lugar do irmão, sem tipo × kit forçado, pavimento
inteiro num lote válido. Editor: "Hidráulica › Distribuir pontos" (gaveta, Lançar 8, Completo,
Aceitar). Suíte cheia 4554.

### App real (escritas bloqueadas: 15)
Planta 14/09/2026, Térreo: botão "Distribuir pontos 1"; gaveta com "Ambiente 4" (cozinha) →
"PIA (fria/quente/Esgoto) · Lançar 3" → "Completo", rodapé "3 sugerida(s)"; Desfazer devolve.

## F4 — água fria e água quente automáticas — entregue em 18/09/2026

- **Refactor**: `utils/blueprintGrafoDeRede.ts` (novo) recebe de `blueprintEletrodutos.ts` a
  chave do nó com a laje como encontro (`fazerChave`), `distanciasDesde` (Dijkstra),
  `caminhoEntre` (BFS) e `arvoreComRotaLimitada` (o Prim com rota limitada). Os eletrodutos
  passaram a importar daí; os 26 testes deles não mudaram.
- `utils/blueprintAguaAutomatica.ts` (novo): origens = caixa d'água (AF) e aquecedor (AQ);
  pontos = terminais tipados com peso (o aquecedor é ponto da AF com o peso dos quentes);
  **barrilete** no teto do pavimento da origem → **colunas** por grupo de pontos
  (`raioDaColunaMm`, união entre pavimentos; prumada pela laje) → **ramais** a `cotaRamalMm`
  (árvore com rota limitada) → prumada até a cota do ponto. **DN** por peso acumulado a
  jusante (`caminhoEntre` de cada ponto à origem): Q = 0,3·√ΣP, menor DN comercial (PVC
  soldável / CPVC, tabelas de diâmetro interno) com v ≤ `velocidadeMaxMs` (padrão 2 m/s),
  nunca abaixo do mínimo da disciplina nem do sub-ramal da ficha. Trecho sugerido com DN
  menor → `SetTrechoProps`; confirmado → aviso. Coluna + prumada final colineares com nó de
  grau 2 viram UM tubo (sem luva fantasma). Idempotente; `relancarAgua` / `refazerAgua`.
- Editor: tarefa `agua` ("Água automática" no grupo Lançamento, contagem = pontos a ligar);
  gaveta com hipóteses (vmax, DN mín. AF/AQ, cota do ramal, raio da coluna), tabela por origem
  (pontos/ligados, metros, colunas, ΣP, DN máx., avisos; Lançar/Relançar/Refazer com
  confirmação), rodapé "Lançar em todas as origens". Canvas: "DN 25" escrito nos trechos
  hidráulicos (como o Ø da elétrica).

### Testes
`blueprintAguaAutomatica.test.ts` (8): dimensionarDN (ΣP 0,3/1,0 → 20; 3,4 → 25; CPVC 22),
barrilete/colunas/ramais/prumadas sem ponta aberta, DN por peso e v ≤ 2, idempotência e ponto
novo, relançar + aviso de confirmado, sem origem/sem ponto, laje entre pavimentos, água
quente a partir do aquecedor com a fria chegando nele. Editor: "Água automática" (gaveta,
Lançar 2, ligados, Refazer). Suíte cheia 4563.

### App real (escritas bloqueadas: 17)
Planta 14/09/2026: pontos da cozinha (F3) + caixa d'água → "Água automática 1"; gaveta: "1
ponto · 10,3 m · 1 coluna · ΣP 0,7 · DN máx. 20 · Lançar 1" → "1 ligado · todos os pontos já
estão ligados · Relançar · Refazer"; Quantitativos › Instalações: "Água fria DN 20 10,26 m ·
2 trechos", "Joelho 90° DN 20 · 1"; 3D com a caixa e o tubo; Desfazer devolve.

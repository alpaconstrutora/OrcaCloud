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

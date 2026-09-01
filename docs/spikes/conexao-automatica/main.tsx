/**
 * Harness da CONEXÃO AUTOMÁTICA entre peças de concreto.
 *
 * Pedido do usuário (31/08/2026): *"quando um circulo se aproximar de outro,
 * Fazer conexão automatica"*.
 *
 * Monta o `BlueprintCanvas` REAL com um pilar parado e uma viga selecionada, e
 * deixa o passeio arrastar a viga até perto do pilar. A pergunta — "o canto da
 * viga grudou no canto do pilar, ou parou no ponto de grade ao lado?" — só se
 * responde com ponteiro de verdade: quem decide é `deltaDoArraste` a partir da
 * distância em PIXEL, e jsdom não tem pixel.
 *
 * ─── AS MEDIDAS SÃO ESCOLHIDAS PARA DISCRIMINAR ─────────────────────────────
 *
 * O deslocamento que faz os dois cantos coincidirem é (800, 1650) — e 1650 NÃO
 * é múltiplo do passo de mover (100 mm). Sem a conexão, o arraste pararia em
 * (800, 1600) e o canto ficaria 50 mm abaixo do alvo: 2,5 px na escala da tela,
 * invisível num print e fatal para quem confere fôrma. É essa diferença que o
 * passeio mede.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  pontosDeConexaoEstrutural,
  type BlueprintModel,
  type Command,
  type Point,
} from '../../../utils/blueprintKernel';
import { pontosDeConexaoDaParede } from '../../../utils/blueprintConexao';

const H = 2800;

const comNivel = applyCommand(emptyModel(), {
  type: 'AddLevel',
  name: 'Térreo',
  elevationMm: 0,
  defaultHeightMm: H,
}).model;

const levelId = comNivel.levels[0].id;

/** Pilar 40×40 no meio da cena — ele fica PARADO, é o alvo. */
const comPilar = applyCommand(comNivel, {
  type: 'AddStructural',
  levelId,
  kind: 'PILAR',
  pontos: [{ x: 5000, y: 5000 }],
  larguraMm: 400,
  profundidadeMm: 400,
  alturaMm: H,
  rotulo: 'P1',
}).model;

/**
 * Uma PAREDE, e um segundo pilar longe dela.
 *
 * É o caso que o usuário relatou em 01/09/2026 — *"fiz um teste com snap
 * posicionando pilar nas paredes, porem funcionou apenas no canto inferior
 * direito"*. O rascunho do estudo dele mostrou por quê: os encostos em parede
 * estavam a 43–75 mm do canto, porque parede não tinha ponto de conexão.
 *
 * Eixo em x = 7015 e espessura 300: o canto de baixo à esquerda cai em
 * (6865, 8000) — e 6865 NÃO é múltiplo do passo de mover, então grade e conexão
 * dão respostas diferentes e o passeio consegue distinguir as duas.
 */
const comParede = applyCommand(comPilar, {
  type: 'AddWall',
  levelId,
  a: { x: 7015, y: 3000 },
  b: { x: 7015, y: 8000 },
  thicknessMm: 300,
  heightMm: H,
}).model;

const comPilar2 = applyCommand(comParede, {
  type: 'AddStructural',
  levelId,
  kind: 'PILAR',
  pontos: [{ x: 2000, y: 8000 }],
  larguraMm: 200,
  profundidadeMm: 400,
  alturaMm: H,
  rotulo: 'P2',
}).model;

/** Viga 3 m × 30 cm, longe do pilar. É ela que anda primeiro. */
const inicial = applyCommand(comPilar2, {
  type: 'AddStructural',
  levelId,
  kind: 'VIGA',
  pontos: [
    { x: 1000, y: 3000 },
    { x: 4000, y: 3000 },
  ],
  larguraMm: 300,
  profundidadeMm: 0,
  alturaMm: 500,
  baseMm: 2300,
  rotulo: 'V1',
}).model;

function App() {
  const [model, setModel] = useState<BlueprintModel>(inicial);
  const pilar = model.structures[0];
  const pilar2 = model.structures[1];
  const viga = model.structures[2];
  const parede = model.walls[0];
  // A seleção é de VERDADE: o passeio clica na peça para selecioná-la e só
  // depois arrasta, que é o caminho do usuário. Uma seleção fixa esconderia o
  // primeiro clique — e é nele que o canvas decide se o gesto é seleção ou
  // arraste do conjunto.
  const [selecionados, setSelecionados] = useState<string[]>([]);

  function moverSelecao(
    wallIds: string[],
    boundaryIds: string[],
    structuralIds: string[],
    delta: Point,
  ) {
    try {
      const r = applyBatch(model, [
        { type: 'TranslateEntities', wallIds, boundaryIds, structuralIds, delta },
      ] as Command[]);
      setModel(r.model);
    } catch (e) {
      console.error('translação recusada:', e);
    }
  }

  const dump = {
    // O que cada peça oferece — as listas de círculos que o encaixe compara.
    vigaConexao: pontosDeConexaoEstrutural(viga),
    pilarConexao: pontosDeConexaoEstrutural(pilar),
    pilar2Conexao: pontosDeConexaoEstrutural(pilar2),
    paredeConexao: pontosDeConexaoDaParede(model.walls, parede),
    viga: { id: viga.id, pontos: viga.pontos },
    pilar2: { id: pilar2.id, pontos: pilar2.pontos },
    selecionados,
  };
  const el = document.getElementById('dump');
  if (el) el.textContent = JSON.stringify(dump, null, 1);

  return (
    <BlueprintCanvas
      model={model}
      tool="selecionar"
      levelId={levelId}
      // O que estiver selecionado é o conjunto que anda — apertar sobre ele
      // pega o conjunto inteiro, que é o MOVE do CAD.
      selectedIds={selecionados}
      onSelecionar={setSelecionados}
      onMoverSelecao={moverSelecao}
      // Arrastar um PILAR pelo meio é pegá-lo pela ALÇA — o centro dele É o
      // vértice —, então o gesto do usuário passa por aqui, não pelo mover do
      // conjunto. Sem este callback o harness engoliria o arraste em silêncio,
      // que foi o que aconteceu na primeira execução deste passeio.
      onMoveStructuralVertex={(structuralId, index, to) => {
        try {
          const r = applyBatch(model, [
            { type: 'MoveStructuralVertex', structuralId, index, to },
          ] as Command[]);
          setModel(r.model);
        } catch (e) {
          console.error('vértice recusado:', e);
        }
      }}
      onAddWall={() => null}
      alinhamento="EIXO"
      onInverterLado={() => {}}
      onAddOpening={() => {}}
      larguraAberturaMm={900}
      onDelete={() => {}}
      espessuraMm={150}
      passoGradeMm={100}
      // Sem trava ortogonal: ela zeraria uma componente do arraste e o gesto
      // nem chegaria perto do alvo.
      ortogonal={false}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

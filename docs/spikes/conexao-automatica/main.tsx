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

/** Viga 3 m × 30 cm, longe do pilar. É ela que anda. */
const inicial = applyCommand(comPilar, {
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
  const viga = model.structures[1];

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
    // O que a viga oferece e o que o pilar oferece — as duas listas de círculos
    // que o encaixe compara.
    vigaConexao: pontosDeConexaoEstrutural(viga),
    pilarConexao: pontosDeConexaoEstrutural(pilar),
    viga: { id: viga.id, pontos: viga.pontos },
  };
  const el = document.getElementById('dump');
  if (el) el.textContent = JSON.stringify(dump, null, 1);

  return (
    <BlueprintCanvas
      model={model}
      tool="selecionar"
      levelId={levelId}
      // A viga selecionada é o conjunto que anda — apertar sobre ela pega o
      // conjunto inteiro, que é o MOVE do CAD.
      selectedIds={[viga.id]}
      onSelecionar={() => {}}
      onMoverSelecao={moverSelecao}
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

/**
 * Harness — QUAIS PEÇAS o ímã enxerga.
 *
 * Usuário, 14/10/2026, depois da correção da laje: *"verifique se alguma outro
 * componentes nao esta esta funcionando com o imã"*.
 *
 * Uma peça de cada família, longe umas das outras, e uma parede de CONTROLE (que
 * sabidamente prende). O gesto é sempre o mesmo — um pilar, que grava o ponto
 * capturado num clique — e a pergunta é se o ponto foi para a peça ou para a
 * grade. Medidas tortas: nenhuma resposta certa cai num múltiplo de 100 mm.
 *
 * `?ativos=SOBRE` (ou outra lista) escolhe os encaixes ligados.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyCommand, emptyModel, type BlueprintModel, type Point } from '../../../utils/blueprintKernel';

const H = 2800;
let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H }).model;
const levelId = m.levels[0].id;

// VIGA de 190 mm: eixo y = 1030, faces em 935 e 1125.
m = applyCommand(m, {
  type: 'AddStructural',
  levelId,
  kind: 'VIGA',
  pontos: [{ x: 1010, y: 1030 }, { x: 5010, y: 1030 }],
  larguraMm: 190,
  alturaMm: 500,
}).model;
// LAJE: borda de baixo em y = 3030.
m = applyCommand(m, {
  type: 'AddStructural',
  levelId,
  kind: 'LAJE',
  pontos: [{ x: 1010, y: 3030 }, { x: 5010, y: 3030 }, { x: 5010, y: 6030 }, { x: 1010, y: 6030 }],
  alturaMm: 120,
}).model;
// DIVISA DO TERRENO.
m = applyCommand(m, { type: 'AddBoundary', levelId, a: { x: 7010, y: 1030 }, b: { x: 11010, y: 1030 }, kind: 'TERRENO' }).model;
// ÁGUA de telhado.
m = applyCommand(m, {
  type: 'AddAgua',
  levelId,
  pontos: [{ x: 7010, y: 3030 }, { x: 11010, y: 3030 }, { x: 11010, y: 6030 }, { x: 7010, y: 6030 }],
  inclinacaoPct: 30,
}).model;
// PAREDE de controle: eixo y = 8030, faces 7955 e 8105.
m = applyCommand(m, { type: 'AddWall', levelId, a: { x: 1010, y: 8030 }, b: { x: 5010, y: 8030 }, thicknessMm: 150, heightMm: H }).model;

const inicial = m;
const ativos = new Set((new URLSearchParams(location.search).get('ativos') ?? '').split(',').filter(Boolean));

function App() {
  const [model] = useState<BlueprintModel>(inicial);
  const [pontos, setPontos] = useState<Point[]>([]);
  const el = document.getElementById('dump');
  if (el) el.textContent = JSON.stringify({ ativos: [...ativos], pontos });
  return (
    <BlueprintCanvas
      model={model}
      tool="estrutural"
      estruturalKind="PILAR"
      levelId={levelId}
      selectedIds={[]}
      onSelecionar={() => {}}
      onAddEstrutural={(_k: unknown, ps: Point[]) => setPontos((v) => [...v, ps[0]])}
      encaixesAtivos={ativos}
      alinhamento="DIREITA"
      onInverterLado={() => {}}
      onAddOpening={() => {}}
      larguraAberturaMm={900}
      onDelete={() => {}}
      espessuraMm={150}
      passoGradeMm={100}
      ortogonal={false}
    />
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

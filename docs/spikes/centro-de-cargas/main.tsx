/**
 * Harness do CENTRO DE CARGAS (E6.2, 29/09/2026).
 *
 * Monta o `BlueprintCanvas` REAL com uma sala 6 × 4 m, o QDC fora dela e
 * pontos de carga desigual; a marca é a mesma que o editor calcula
 * (`centroNaPlanta`). `?levado=1` aplica o "Levar o quadro ao centro" DEPOIS de
 * marcar — a marca tem de sumir (mover apaga a marca).
 *
 * Por que existe: o teste de componente prova que o canvas CHAMA arc/fillText;
 * só um navegador mostra se o círculo cai onde a carga está e se lê na planta.
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { centroDeCargas, centroNaPlanta, comandosParaOCentro } from '../../../utils/blueprintCentroDeCargas';

function construir(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 6000, 0), w(6000, 0, 6000, 4000), w(6000, 4000, 0, 4000), w(0, 4000, 0, 0), w(-4000, 0, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId, nome: 'QDC', at: point(-3500, 0), cotaMm: 1600 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', tensaoV: 127 }).model;
  const circuitoId = m.circuitos[0].id;
  // Chuveiro pesado no canto direito de cima puxa o centro para lá.
  for (const [x, y, va, tipo] of [
    [500, 500, 600, 'TUG'],
    [3000, 500, 600, 'TUG'],
    [5500, 3500, 5500, 'TUE'],
    [5500, 500, 1500, 'TUE'],
    [3000, 2000, 200, 'ILUMINACAO_TETO'],
  ] as const) {
    m = applyCommand(m, { type: 'AddTerminal', levelId, disciplina: 'ELETRICA', tipo, at: point(x, y), cotaMm: 300, tipoEletrico: tipo, potenciaW: va }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId }).model;
  }
  return m;
}

const inicial = construir();
const quadroId = inicial.quadros[0].id;
const marca = { alvo: quadroId, quadroEm: inicial.quadros[0].at };
const levado = new URLSearchParams(location.search).get('levado') === '1';
const model = levado ? applyBatch(inicial, comandosParaOCentro(inicial, centroDeCargas(inicial, quadroId)!)).model : inicial;
const noCanvas = centroNaPlanta(model, marca);
(window as unknown as { __centro: unknown }).__centro = { noCanvas, calculo: centroDeCargas(model, quadroId) };

createRoot(document.getElementById('raiz')!).render(
  <div className="h-full w-full">
    <BlueprintCanvas
      model={model}
      tool="selecionar"
      levelId={model.levels[0].id}
      selectedIds={[]}
      onSelecionar={() => {}}
      onAddWall={() => {}}
      onAddOpening={() => {}}
      onDelete={() => {}}
      larguraAberturaMm={900}
      espessuraMm={150}
      passoGradeMm={100}
      centroDeCargas={noCanvas}
    />
    <div style={{ position: 'absolute', top: 8, left: 8, font: '12px sans-serif', background: '#fff', padding: 4 }}>
      {levado ? 'depois de levar o quadro ao centro (marca deve sumir)' : 'marca do centro de cargas'} · {noCanvas ? `centro ${noCanvas.centro.x},${noCanvas.centro.y} raio ${noCanvas.raioMm}` : 'sem marca'}
    </div>
  </div>,
);

/**
 * A PLANTA da casa de prova, no nosso próprio canvas.
 *
 * Serve a um propósito só: dar o lado de cá da comparação com o visualizador de
 * terceiros. O arquivo IFC sai de `__tests__/ifcArquivoDeProva.test.ts` a partir
 * do MESMO modelo — então o que se vê aqui e o que se vê lá descrevem a mesma
 * casa, e qualquer divergência é da exportação.
 *
 * ⚠️ O modelo é montado aqui de novo, e não importado do teste: teste não é
 * módulo de produção, e importar de `__tests__` numa página serviria mal ao
 * bundle. A duplicação é pequena e as duas metades estão neste comentário.
 *
 * Abrir em: /docs/spikes/prova-ifc/index.html
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';

const H = 2800;
const T = 200;

function casaDeProva(): { model: BlueprintModel; levelId: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: H,
  }).model;
  const t = base.levels[0].id;

  const parede = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by),
    thicknessMm: T, heightMm: H,
  });

  const m1 = applyBatch(base, [
    parede(0, 0, 10000, 0),
    parede(10000, 0, 10000, 6000),
    parede(10000, 6000, 0, 6000),
    parede(0, 6000, 0, 0),
  ]).model;
  const fachada = m1.walls.find((w) => w.a.y === 0 && w.b.y === 0)!;

  const porta = (offsetMm: number, hingeAtStart: boolean, nome: string): Command => ({
    type: 'AddOpening', wallId: fachada.id, kind: 'door',
    offsetMm, widthMm: 900, heightMm: 2100, sillMm: 0,
    hingeAtStart, swingReversed: false,
    esquadria: { nome, itemCode: '', descricao: '' },
  });

  const m2 = applyBatch(m1, [
    porta(1000, true, 'PORTA-ESQUERDA'),
    porta(2500, false, 'PORTA-DIREITA'),
    porta(4500, true, 'P1-IGUAL'),
    porta(6000, true, 'P1-IGUAL'),
    {
      type: 'AddOpening', wallId: fachada.id, kind: 'window',
      offsetMm: 7500, widthMm: 1500, heightMm: 1200, sillMm: 1000,
    },
  ]).model;

  return { model: m2, levelId: t };
}

function App() {
  const { model, levelId } = casaDeProva();
  return (
    <>
      <div id="painel" style={{ padding: 10, font: '12px system-ui' }}>
        <b>Casa de prova</b>
        <p>A fachada de baixo, da esquerda para a direita:</p>
        <ol style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>PORTA-ESQUERDA</li>
          <li>PORTA-DIREITA</li>
          <li>P1-IGUAL</li>
          <li>P1-IGUAL</li>
          <li>Janela (peitoril 1,00 m)</li>
        </ol>
      </div>
      <div id="direita">
        <div id="barra">
          Compare o SÍMBOLO de cada porta aqui com o OperationType no visualizador.
        </div>
        <div id="tela">
          <BlueprintCanvas
            model={model}
            tool="selecionar"
            levelId={levelId}
            selectedIds={[]}
            onSelecionar={() => {}}
            onAddWall={() => {}}
            onAddOpening={() => {}}
            larguraAberturaMm={900}
            onDelete={() => {}}
            espessuraMm={T}
            passoGradeMm={100}
            ortogonal
          />
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

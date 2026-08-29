/**
 * Harness isolado das ELEVAÇÕES.
 *
 * Monta o `ElevationCanvas` REAL com um modelo fixo de dois pavimentos, uma
 * planta em "L", porta e janela. Sem Supabase, sem login. `tsc` e testes não
 * olham pixel — sem ver o desenho, o painter's algorithm e o recorte de vão
 * viram chute.
 *
 * Abrir em: /docs/spikes/blueprint-elevation/index.html?dir=FRENTE
 *   &cotas=1 &rotulos=1 &internas=1 &niveis=terreo
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ElevationCanvas from '../../../components/blueprint/ElevationCanvas';
import type { DirecaoElevacao } from '../../../utils/blueprintElevation';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  point,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';

const T = 150;
const H = 2800;

function pavimento(model: BlueprintModel, levelId: string): BlueprintModel {
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: point(ax, ay),
    b: point(bx, by),
    thicknessMm: T,
    heightMm: H,
  });
  // Planta em "L": um retângulo 8000×5000 com um recorte de 3000×2000.
  const m = applyBatch(model, [
    w(0, 0, 8000, 0),
    w(8000, 0, 8000, 3000),
    w(8000, 3000, 5000, 3000),
    w(5000, 3000, 5000, 5000),
    w(5000, 5000, 0, 5000),
    w(0, 5000, 0, 0),
    // Divisória interna em T.
    w(3000, 0, 3000, 5000),
  ]).model;

  const fachada = m.walls.find(
    (x) => x.levelId === levelId && x.a.y === 0 && x.b.y === 0,
  )!;
  return applyBatch(m, [
    { type: 'AddOpening', wallId: fachada.id, kind: 'door', offsetMm: 700, widthMm: 900, heightMm: 2100, sillMm: 0 },
    { type: 'AddOpening', wallId: fachada.id, kind: 'window', offsetMm: 4200, widthMm: 1600, heightMm: 1200, sillMm: 1000 },
  ]).model;
}

function construir(): { model: BlueprintModel; terreoId: string; pav1Id: string } {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  });
  const terreoId = base.model.levels[0].id;
  let m = pavimento(base.model, terreoId);
  m = applyCommand(m, { type: 'AddLevel', name: 'Pav 1', elevationMm: H, defaultHeightMm: H }).model;
  const pav1Id = m.levels[1].id;
  m = pavimento(m, pav1Id);
  return { model: m, terreoId, pav1Id };
}

const { model, terreoId } = construir();
const params = new URLSearchParams(location.search);
const dirInicial = (params.get('dir') as DirecaoElevacao) || 'FRENTE';
const cotas = params.get('cotas') === '1';
const rotulos = params.get('rotulos') === '1';
const internas = params.get('internas') === '1';
const soTerreo = params.get('niveis') === 'terreo';

const DIRECOES: DirecaoElevacao[] = ['FRENTE', 'FUNDOS', 'LATERAL_DIREITA', 'LATERAL_ESQUERDA'];

function App() {
  const [dir, setDir] = useState<DirecaoElevacao>(dirInicial);
  const [token, setToken] = useState(0);
  return (
    <>
      <div id="barra">
        <label>
          Vista{' '}
          <select value={dir} onChange={(e) => setDir(e.target.value as DirecaoElevacao)}>
            {DIRECOES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>{' '}
        <button onClick={() => setToken((t) => t + 1)}>Enquadrar</button>
      </div>
      <div id="tela">
        <ElevationCanvas
          model={model}
          direcao={dir}
          levelIds={soTerreo ? [terreoId] : undefined}
          mostrarCotasAltura={cotas}
          mostrarRotulosEsquadria={rotulos}
          mostrarParedesInternas={internas}
          enquadrarToken={token}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

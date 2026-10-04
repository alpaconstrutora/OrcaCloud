/**
 * Harness das CAMADAS POR DISCIPLINA (04/10/2026).
 *
 * Monta o `BlueprintCanvas` REAL (ou o `Blueprint3DTab` real com `?3d`) e o
 * `PainelCamadas` REAL, ligados pelo mesmo motor do editor
 * (`classificarPecas` → `idsPorEstado`). O `medir.mjs` troca os estados por
 * `window.__camadas(...)` e mede PIXEL e CLIQUE — o que jsdom não alcança:
 *
 *  - camada oculta some do desenho; em meio-tom fica mais clara (não some);
 *  - clique em peça em meio-tom não a seleciona (é referência);
 *  - o 3D desenha a passada translúcida sem erro.
 *
 * Modelo: sala 8 × 6 m com um pilar no meio da sala, um tubo de esgoto
 * longe do pilar, uma tomada na parede e o lote em volta.
 */
import '../../../index.css';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import Blueprint3DTab from '../../../components/blueprint/Blueprint3DTab';
import PainelCamadas from '../../../components/blueprint/PainelCamadas';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import {
  ESTADOS_PADRAO,
  classificarPecas,
  contagemPorCamada,
  idsPorEstado,
  isolar,
  type EstadosDasCamadas,
} from '../../../utils/blueprintCamadasPorDisciplina';

const em3d = new URLSearchParams(location.search).has('3d');

function montar(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const parede = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessMm: 150, heightMm: 2800 });
  const divisa = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddBoundary', levelId: t, a: { x: ax, y: ay }, b: { x: bx, y: by }, kind: 'TERRENO' } as Command);
  m = applyBatch(m, [
    parede(0, 0, 8000, 0), parede(8000, 0, 8000, 6000), parede(8000, 6000, 0, 6000), parede(0, 6000, 0, 0),
    divisa(-2000, -2000, 10000, -2000), divisa(10000, -2000, 10000, 8000), divisa(10000, 8000, -2000, 8000), divisa(-2000, 8000, -2000, -2000),
  ]).model;
  m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 4000, y: 3000 }], larguraMm: 600, profundidadeMm: 600, alturaMm: 2800 } as Command).model;
  m = applyCommand(m, { type: 'AddTrecho', levelId: t, disciplina: 'ESGOTO', a: { x: 1000, y: 1000 }, b: { x: 7000, y: 1000 }, cotaAMm: -300, cotaBMm: -360, bitolaMm: 100 } as Command).model;
  m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo: 'TUG', at: { x: 6000, y: 75 }, cotaMm: 300, tipoEletrico: 'TUG' } as Command).model;
  return m;
}

const model = montar();
const levelId = model.levels[0].id;
const classificacao = classificarPecas(model);
const contagem = contagemPorCamada(model, classificacao, [levelId]);

declare global {
  interface Window {
    __camadas?: (e: Partial<EstadosDasCamadas> | 'padrao') => void;
    __estado?: EstadosDasCamadas;
    __selecionados?: string[];
    __ids?: { pilar: string; esgoto: string; tug: string; paredes: string[] };
    __pronto?: boolean;
  }
}
window.__ids = {
  pilar: model.structures[0].id,
  esgoto: model.trechos[0].id,
  tug: model.terminais[0].id,
  paredes: model.walls.map((w) => w.id),
};
window.__selecionados = [];

function App() {
  const [estados, setEstados] = useState<EstadosDasCamadas>(ESTADOS_PADRAO);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [base, setBase] = useState(true);
  const [antes, setAntes] = useState<EstadosDasCamadas | null>(null);
  window.__camadas = (e) => setEstados(e === 'padrao' ? ESTADOS_PADRAO : { ...ESTADOS_PADRAO, ...e });
  window.__estado = estados;
  const { ocultos, atenuados } = useMemo(() => idsPorEstado(classificacao, estados), [estados]);
  const selecionar = (ids: string[]) => {
    window.__selecionados = ids;
    setSelecionados(ids);
  };
  return (
    <ConfirmProvider>
      <div>
        <aside style={{ width: 320, background: '#fff', borderRight: '1px solid #e2e8f0', overflow: 'auto', paddingTop: 8 }} data-testid="painel">
          <PainelCamadas
            estados={estados}
            onMudar={setEstados}
            contagem={contagem}
            baseAtenuada={base}
            onBaseAtenuada={setBase}
            onIsolar={(alvo) => {
              setAntes(estados);
              setEstados(isolar(alvo, { baseAtenuada: base }));
            }}
            onReexibir={() => setEstados(antes ?? ESTADOS_PADRAO)}
          />
        </aside>
        <main style={{ position: 'relative', flex: 1 }} data-testid="desenho">
          {em3d ? (
            <Blueprint3DTab model={model} ocultos={new Set(ocultos)} atenuados={atenuados} selecionados={new Set(selecionados)} onSelecionar={selecionar} />
          ) : (
            <BlueprintCanvas
              model={model}
              tool="selecionar"
              levelId={levelId}
              selectedIds={selecionados}
              onSelecionar={selecionar}
              ocultos={ocultos}
              atenuados={atenuados}
              terrenoEmMeioTom={estados.TERRENO === 'ATENUADA'}
            />
          )}
        </main>
      </div>
    </ConfirmProvider>
  );
}

createRoot(document.getElementById('raiz') as HTMLElement).render(<App />);
window.__pronto = true;

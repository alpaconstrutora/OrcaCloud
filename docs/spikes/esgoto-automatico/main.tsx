/**
 * Harness do ESGOTO AUTOMÁTICO SEM PASSO MANUAL (13/10/2026).
 *
 * Plano: `docs/planos/2026-10-13-hidro-ancoras-automaticas.md`, item 4.1. Monta o
 * `BlueprintCanvas` REAL com uma casa num lote — sem caixa de inspeção e sem
 * ligação à rede — e aplica o MESMO `planejarEsgotoCompleto` do botão "Lançar"
 * da gaveta. Sem banco e sem autosave: o editor da Planta grava o rascunho a
 * cada gesto, e o bloqueio de escrita do Playwright já deixou passar uma vez.
 *
 * O que só o navegador prova (o teste de componente roda em jsdom, sem layout):
 * ONDE as peças caem no desenho — a caixa fora da fachada, a ligação na frente
 * do lote — e que arrastar a ligação refaz o coletor.
 *
 * `?frente=0`: o lote sem divisa de frente (a caixa vai à fachada mais perto e o
 * coletor fica pendente).
 */
import '../../../index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, recomputeSpaces, type BlueprintModel, type Command, type TipoDePontoHidraulico } from '../../../utils/blueprintKernel';
import { HIPOTESES_ESGOTO_PADRAO } from '../../../utils/blueprintEsgotoAutomatico';
import { planejarEsgotoCompleto, type PlanoDoEsgotoCompleto } from '../../../utils/blueprintEsgotoCompleto';
import { ligacaoDaRede, planejarColetorPredial } from '../../../utils/blueprintColetorPredial';

declare global {
  interface Window {
    __modelo?: BlueprintModel;
    /** Aplica o plano do botão "Lançar" e devolve o que ele presumiu. */
    __lancar?: () => Pick<PlanoDoEsgotoCompleto, 'presumido' | 'pendencias'>;
    /** Arrasta a ligação à rede (como o gesto faz) e relança só o coletor, como o botão do painel. */
    __moverLigacao?: (dx: number, dy: number) => void;
  }
}

function casaNoLote(comFrente: boolean): { model: BlueprintModel; levelId: string } {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const parede = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  const ponto = (tipo: TipoDePontoHidraulico, x: number, y: number, cota: number): Command => ({ type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo });
  const cantos: [number, number][] = [[-3000, -8000], [7500, -8000], [7500, 6000], [-3000, 6000]];
  m = applyBatch(m, [
    parede(0, 0, 4500, 0), parede(4500, 0, 4500, 3000), parede(4500, 3000, 0, 3000), parede(0, 3000, 0, 0), parede(2000, 0, 2000, 3000),
    ponto('VASO_SANITARIO', 600, 800, 0),
    ponto('LAVATORIO', 600, 2500, 500),
    ponto('CHUVEIRO', 1500, 2500, 0),
    ponto('CAIXA_SIFONADA', 1200, 2100, 0),
    ...cantos.map(([ax, ay], i): Command => {
      const [bx, by] = cantos[(i + 1) % 4];
      return { type: 'AddBoundary', levelId: t, a: point(ax, ay), b: point(bx, by), kind: 'TERRENO', ...(i === 0 && comFrente ? { papel: 'FRENTE' as const } : {}) };
    }),
  ]).model;
  return { model: recomputeSpaces(m), levelId: t };
}

function App() {
  const comFrente = new URLSearchParams(location.search).get('frente') !== '0';
  const [{ model, levelId }, setEstado] = useState(() => casaNoLote(comFrente));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resumo, setResumo] = useState<string[]>([]);

  window.__modelo = model;
  window.__lancar = () => {
    const p = planejarEsgotoCompleto(model, HIPOTESES_ESGOTO_PADRAO);
    setEstado((e) => ({ ...e, model: applyBatch(e.model, p.comandos).model }));
    setResumo([...p.presumido, ...p.pendencias]);
    return { presumido: p.presumido, pendencias: p.pendencias };
  };
  window.__moverLigacao = (dx, dy) => {
    setEstado((e) => {
      const lr = ligacaoDaRede(e.model);
      if (!lr) return e;
      const movido = applyBatch(e.model, [{ type: 'TranslateEntities', wallIds: [], boundaryIds: [], structuralIds: [], terminalIds: [lr.id], delta: { x: dx, y: dy }, manterJuncoes: false }]).model;
      return { ...e, model: applyBatch(movido, planejarColetorPredial(movido, HIPOTESES_ESGOTO_PADRAO).comandos).model };
    });
  };

  return (
    <div className="flex h-full w-full">
      <div className="h-full flex-1">
        <BlueprintCanvas
          model={model}
          tool="select"
          levelId={levelId}
          selectedIds={selectedIds}
          onSelecionar={setSelectedIds}
          onAddWall={() => {}}
          onAddOpening={() => {}}
          onDelete={() => {}}
          larguraAberturaMm={900}
          espessuraMm={150}
          passoGradeMm={100}
        />
      </div>
      <div className="w-80 space-y-2 border-l border-slate-200 p-3 text-xs text-slate-700" data-testid="resumo">
        <p className="font-semibold">Esgoto automático — harness</p>
        {resumo.length === 0 ? <p>Ainda não lançado.</p> : <ul className="list-disc space-y-1 pl-4">{resumo.map((r) => <li key={r}>{r}</li>)}</ul>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

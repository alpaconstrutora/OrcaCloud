/**
 * HARNESS VISUAL dos tubos e conexões detalhados (27/09/2026, pedido com print
 * de isométrico sanitário: "os tubos e conexoes devem ser detalhados").
 *
 * Banheiro 2 × 3 m (vaso, lavatório, chuveiro, caixa sifonada), tanque na área
 * ao lado e a caixa de inspeção fora; a rede sai do ESGOTO AUTOMÁTICO de verdade
 * (com as junções a 45°). Modelo fixo, sem banco: nada aqui grava.
 *
 *   npx vite --port 3141
 *   → http://localhost:3141/docs/spikes/esgoto-isometrico/index.html          (3D)
 *   → http://localhost:3141/docs/spikes/esgoto-isometrico/index.html?vista=2d (planta)
 *   → …?rotulos=0 (3D sem os ø) · ?paredes=0 (sem paredes) · ?estilo=transparente
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Blueprint3DViewer from '../../../components/blueprint/Blueprint3DViewer';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, conexoesDerivadas, emptyModel, point, recomputeSpaces, type Command, type TipoDePontoHidraulico } from '../../../utils/blueprintKernel';
import { planejarEsgoto } from '../../../utils/blueprintEsgotoAutomatico';

const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
const t = base.levels[0].id;
const w = (ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
});
const esg = (tipo: TipoDePontoHidraulico, x: number, y: number, cota: number, medidas?: { larguraMm: number; profundidadeMm: number; alturaMm: number }): Command => ({
  type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo,
  ...(medidas ?? {}),
} as Command);

let m = applyBatch(base, [
  w(0, 0, 4500, 0), w(4500, 0, 4500, 3000), w(4500, 3000, 0, 3000), w(0, 3000, 0, 0), w(2000, 0, 2000, 3000),
  esg('VASO_SANITARIO', 600, 800, 0),
  esg('LAVATORIO', 600, 2500, 500),
  esg('CHUVEIRO', 1500, 2500, 0),
  esg('CAIXA_SIFONADA', 1200, 2100, 0, { larguraMm: 150, profundidadeMm: 150, alturaMm: 200 }),
  esg('TANQUE', 3500, 2600, 500),
  esg('CAIXA_INSPECAO', 6000, -1500, -700, { larguraMm: 600, profundidadeMm: 600, alturaMm: 600 }),
]).model;
m = recomputeSpaces(m);
const plano = planejarEsgoto(m);
m = applyBatch(m, plano.comandos).model;

const params = new URLSearchParams(location.search);
const conexoes = conexoesDerivadas(m).conexoes;
const resumo = `trechos: ${m.trechos?.length ?? 0} · conexões: ${conexoes.map((c) => c.tipo).join(', ')} · avisos: ${conexoes.filter((c) => c.aviso).length}`;

function Planta() {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <BlueprintCanvas
      model={m}
      tool="selecionar"
      levelId={t}
      selectedIds={sel}
      onSelecionar={setSel}
      onAddWall={() => null}
      alinhamento="EIXO"
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

createRoot(document.getElementById('raiz')!).render(
  <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
    <div id="barra" style={{ font: '12px system-ui', padding: 4 }}>{resumo}</div>
    <div style={{ flex: 1 }}>
      {params.get('vista') === '2d' ? (
        <Planta />
      ) : (
        <Blueprint3DViewer
          model={m}
          mostrarLaje={false}
          mostrarArestas
          mostrarRotulosDeRede={params.get('rotulos') !== '0'}
          estilo={params.get('estilo') === 'transparente' ? 'TRANSPARENTE' : 'SOMBREADO'}
          ocultos={params.get('paredes') === '0' ? new Set(m.walls.map((x) => x.id)) : undefined}
        />
      )}
    </div>
  </div>,
);

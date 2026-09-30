/**
 * Harness do LANÇAMENTO DE ELETRODUTOS com estrutura e caixas (E6.3, 29/09/2026).
 *
 * `BlueprintCanvas` REAL: sala de 24 × 4 m, QDC num canto, pilar no meio do
 * caminho, tomada na outra ponta e uma luz de teto; o plano (`planejarEletrodutos`)
 * aplicado. O que se olha: o trecho contornando o pilar pelo canto, e as caixas
 * de passagem (quadrado sem diagonal) onde a regra dos 15 m pediu.
 * `?parede=1` liga a rota pela parede.
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_ELETRODUTO_PADRAO, planejarEletrodutos } from '../../../utils/blueprintEletrodutos';

function construir(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = m.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 });
  m = applyBatch(m, [w(0, 0, 24000, 0), w(24000, 0, 24000, 4000), w(24000, 4000, 0, 4000), w(0, 4000, 0, 0)]).model;
  m = applyCommand(m, { type: 'AddStructural', levelId: t, kind: 'PILAR', pontos: [{ x: 6000, y: 2000 }], larguraMm: 300, profundidadeMm: 300, alturaMm: 2800 } as unknown as Command).model;
  m = applyCommand(m, { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(75, 1000), cotaMm: 1600 }).model;
  m = applyCommand(m, { type: 'AddCircuito', quadroId: m.quadros[0].id, nome: 'C1', ligacao: 'FN' }).model;
  const c1 = m.circuitos[0].id;
  for (const [x, y, cota, tipo] of [[23925, 1000, 300, 'TUG'], [12000, 3000, 2800, 'ILUMINACAO_TETO']] as const) {
    m = applyCommand(m, { type: 'AddTerminal', levelId: t, disciplina: 'ELETRICA', tipo, at: point(x, y), cotaMm: cota, tipoEletrico: tipo }).model;
    m = applyCommand(m, { type: 'SetTerminalProps', terminalId: m.terminais[m.terminais.length - 1].id, circuitoId: c1 }).model;
  }
  const parede = new URLSearchParams(location.search).get('parede') === '1';
  const plano = planejarEletrodutos(m, m.quadros[0], { ...HIPOTESES_ELETRODUTO_PADRAO, rotaPelaParede: parede });
  (window as unknown as { __plano: unknown }).__plano = plano;
  return applyBatch(m, plano.comandos).model;
}

const model = construir();
const plano = (window as unknown as { __plano: { caixas: number; avisos: string[]; metrosPrevistos: number } }).__plano;

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
      mostrarCircuitos
    />
    <div style={{ position: 'absolute', top: 8, left: 8, font: '12px sans-serif', background: '#fff', padding: 4 }}>
      {plano.caixas} caixa(s) · {plano.metrosPrevistos} m · avisos: {plano.avisos.join(' | ') || 'nenhum'}
    </div>
  </div>,
);

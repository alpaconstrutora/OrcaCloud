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
 *   → …?defeitos=1 — tubo solto, DN errado e louça sem ponto (verificação da rede, E0.1)
 *   → …?cena=agua — a sala do print de 27/09/2026: caixa d'água no canto (sobre a
 *     laje) e lavatório/chuveiro numa parede, com a ÁGUA FRIA AUTOMÁTICA pelas paredes.
 *     Com a laje L1 (2800 → 2900) em cima; `&laje=0` é o botão "Pisos e lajes" desligado.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Blueprint3DViewer from '../../../components/blueprint/Blueprint3DViewer';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, conexoesDerivadas, emptyModel, point, recomputeSpaces, type Command, type TipoDePontoHidraulico } from '../../../utils/blueprintKernel';
import { planejarEsgoto } from '../../../utils/blueprintEsgotoAutomatico';
import { planejarAgua } from '../../../utils/blueprintAguaAutomatica';
import { planejarPecasDaCaixa } from '../../../utils/blueprintPecasDaCaixa';
import { comAjusteDePressao, pressoesDoModelo } from '../../../utils/blueprintPressaoDaRede';

const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
const t = base.levels[0].id;
const w = (ax: number, ay: number, bx: number, by: number): Command => ({
  type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800,
});
const esg = (tipo: TipoDePontoHidraulico, x: number, y: number, cota: number, medidas?: { larguraMm: number; profundidadeMm: number; alturaMm: number }): Command => ({
  type: 'AddTerminal', levelId: t, disciplina: 'ESGOTO', tipo, at: point(x, y), cotaMm: cota, tipoHidraulico: tipo,
  ...(medidas ?? {}),
} as Command);

const params = new URLSearchParams(location.search);

function salaDaAgua() {
  let s = applyBatch(base, [
    w(0, 0, 3000, 0), w(3000, 0, 3000, 5000), w(3000, 5000, 0, 5000), w(0, 5000, 0, 0),
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: "Caixa d'água", at: point(0, 0), cotaMm: 2800, tipoHidraulico: 'RESERVATORIO', larguraMm: 1200, profundidadeMm: 1200, alturaMm: 800 } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Lavatório', at: point(75, 1800), cotaMm: 600, tipoHidraulico: 'LAVATORIO' } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Chuveiro', at: point(75, 3200), cotaMm: 2100, tipoHidraulico: 'CHUVEIRO' } as Command,
    { type: 'AddTerminal', levelId: t, disciplina: 'AGUA_FRIA', tipo: 'Pia', at: point(2925, 3800), cotaMm: 1100, tipoHidraulico: 'PIA_COZINHA' } as Command,
  ]).model;
  // A laje L1 da planta do usuário (2800 → 2900) — a caixa tem de apoiar em cima dela.
  s = applyCommand(s, { type: 'AddStructural', levelId: t, kind: 'LAJE', pontos: [point(0, 0), point(3000, 0), point(3000, 5000), point(0, 5000)], alturaMm: 100, baseMm: 2800, rotulo: 'L1' } as Command).model;
  // O menu grava as medidas da ficha num segundo comando (`AddTerminal` não as recebe).
  s = applyCommand(s, { type: 'SetTerminalProps', terminalId: s.terminais![0].id, larguraMm: 1200, profundidadeMm: 1200, alturaMm: 800 } as Command).model;
  // E4.2: `?cilindro=1` — a caixa cilíndrica; `?pecas=1` — boia, extravasor e limpeza lançados.
  if (params.get('cilindro') === '1') s = applyCommand(s, { type: 'SetTerminalProps', terminalId: s.terminais![0].id, formaReservatorio: 'CILINDRO' } as Command).model;
  if (params.get('pecas') === '1') s = applyBatch(s, planejarPecasDaCaixa(s, s.terminais![0]).comandos).model;
  s = recomputeSpaces(s);
  // E1.4: o plano já sai com o DN ajustado para a pressão (`?semAjuste=1` mostra só a velocidade).
  const plano = planejarAgua(s, s.terminais![0]);
  return applyBatch(s, params.get('semAjuste') === '1' ? plano.comandos : comAjusteDePressao(s, plano).comandos).model;
}

let m = params.get('cena') === 'agua' ? salaDaAgua() : applyBatch(base, [
  w(0, 0, 4500, 0), w(4500, 0, 4500, 3000), w(4500, 3000, 0, 3000), w(0, 3000, 0, 0), w(2000, 0, 2000, 3000),
  esg('VASO_SANITARIO', 600, 800, 0),
  esg('LAVATORIO', 600, 2500, 500),
  esg('CHUVEIRO', 1500, 2500, 0),
  esg('CAIXA_SIFONADA', 1200, 2100, 0, { larguraMm: 150, profundidadeMm: 150, alturaMm: 200 }),
  esg('TANQUE', 3500, 2600, 500),
  esg('CAIXA_INSPECAO', 6000, -1500, -700, { larguraMm: 600, profundidadeMm: 600, alturaMm: 600 }),
]).model;
if (params.get('cena') !== 'agua') {
  m = recomputeSpaces(m);
  m = applyBatch(m, planejarEsgoto(m).comandos).model;
}
// `?defeitos=1` (28/09/2026, E0.1): um tubo solto, o ramal do vaso em DN 50 e um
// vaso desenhado sem ponto — as três marcas da verificação da rede.
if (params.get('defeitos') === '1') {
  const doVaso = m.trechos!.find((c) => c.disciplina === 'ESGOTO' && c.a.x === 600 && c.a.y === 800 && (c.a.x !== c.b.x || c.a.y !== c.b.y))!;
  m = applyBatch(m, [
    { type: 'AddTrecho', levelId: t, disciplina: 'AGUA_FRIA', a: point(2500, 1200), b: point(4000, 1200), cotaAMm: 2200, cotaBMm: 2200, bitolaMm: 25 },
    { type: 'SetTrechoProps', trechoId: doVaso.id, bitolaMm: 50 },
    { type: 'AddComponente', levelId: t, tipoId: 'VASO', at: point(3300, 600) },
  ] as Command[]).model;
}
const conexoes = conexoesDerivadas(m).conexoes;
const resumo = `trechos: ${m.trechos?.length ?? 0} · conexões: ${conexoes.map((c) => c.tipo).join(', ')} · avisos: ${conexoes.filter((c) => c.aviso).length}`;

const pressoes = params.get('cena') === 'agua' ? pressoesDoModelo(m) : [];

function Planta() {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <BlueprintCanvas
      model={m}
      pressoesDaAgua={pressoes}
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
          mostrarLaje={params.get('laje') !== '0'}
          mostrarArestas
          mostrarRotulosDeRede={params.get('rotulos') !== '0'}
          estilo={params.get('estilo') === 'transparente' ? 'TRANSPARENTE' : 'SOMBREADO'}
          ocultos={params.get('paredes') === '0' ? new Set(m.walls.map((x) => x.id)) : undefined}
        />
      )}
    </div>
  </div>,
);

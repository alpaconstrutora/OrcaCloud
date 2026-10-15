/**
 * Harness da "Casa automática" (plano `docs/planos/2026-10-14-casa-automatica.md`).
 *
 * O lote de prova — 12 × 30 m, quatro divisas TERRENO com papel (FRENTE ao sul), girado de
 * `?graus=N` — no `BlueprintCanvas` REAL, sem Supabase. F3: `planejarCasa` roda aqui sobre o
 * lote com a zona fictícia do plano (TO 60 %, CA 1,2, permeabilidade 20 %, recuos 3/1,5/1,5/3 m),
 * o RESULTADO é desenhado (enquadrado) e o essencial do plano vai para `window.__estado`, que o
 * `medir.mjs` confere (exit ≠ 0 reprova).
 *
 * Abrir em: /docs/spikes/casa-automatica/index.html[?graus=30] no servidor de dev.
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type BlueprintModel, type Command, type Point } from '../../../utils/blueprintKernel';
import { medirTerreno } from '../../../utils/blueprintTerreno';
import { ZONA_DA_MASSA_VAZIA } from '../../../utils/blueprintMassa';
import { conferirPlanoDaCasa, planejarCasa } from '../../../utils/blueprintCasaAutomatica';
import { PROGRAMA_CURTO_PADRAO } from '../../../utils/blueprintPrograma';

declare global {
  interface Window {
    __estado: {
      graus: number;
      divisas: number;
      frente: number;
      plano: {
        etapas: { id: string; situacao: string; nota: string | null }[];
        comandos: number;
        ambientesPedidos: number;
        ambientesAtendidos: number;
        ambientesNomeados: number;
        aberturasPedidas: number;
        aberturasCriadas: number;
        toPct: number | null;
        toMaxPct: number;
        regrasVioladas: number;
        conferido: boolean;
        pendencias: string[];
      } | null;
    };
  }
}

const FRENTE_MM = 12000;
const FUNDO_MM = 30000;
const TO_MAX = 60;
const graus = Number(new URLSearchParams(location.search).get('graus') ?? '0') || 0;

function loteDeProva(): BlueprintModel {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const levelId = base.levels[0].id;
  const c = Math.cos((graus * Math.PI) / 180);
  const s = Math.sin((graus * Math.PI) / 180);
  const g = (x: number, y: number): Point => (graus === 0 ? point(x, y) : point(Math.round(x * c - y * s), Math.round(x * s + y * c)));
  const d = (a: Point, b: Point, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId, a, b, kind: 'TERRENO', papel });
  return applyBatch(base, [
    d(g(0, 0), g(FRENTE_MM, 0), 'FRENTE'),
    d(g(FRENTE_MM, 0), g(FRENTE_MM, FUNDO_MM), 'LATERAL_DIREITA'),
    d(g(FRENTE_MM, FUNDO_MM), g(0, FUNDO_MM), 'FUNDOS'),
    d(g(0, FUNDO_MM), g(0, 0), 'LATERAL_ESQUERDA'),
  ]).model;
}

const lote = loteDeProva();
const levelId = lote.levels[0].id;
const plano = planejarCasa(lote, {
  levelId,
  ctx: {
    terreno: medirTerreno(lote.boundaries),
    limites: lote.boundaries,
    recuosBase: { FRENTE: 3000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 },
    zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: TO_MAX, coeficienteMax: 1.2, taxaPermeabilidadeMinPct: 20, gabaritoPavimentos: 2 },
  },
  curto: PROGRAMA_CURTO_PADRAO,
  rotacaoNorteDeg: null,
  latitudeGraus: -19.9,
});
const model = plano.resultado;
const loteM2 = (FRENTE_MM * FUNDO_MM) / 1e6;
window.__estado = {
  graus,
  divisas: model.boundaries.filter((b) => b.kind === 'TERRENO').length,
  frente: model.boundaries.filter((b) => b.papel === 'FRENTE').length,
  plano: {
    etapas: plano.etapas.map((e) => ({ id: e.id, situacao: e.situacao, nota: e.nota })),
    comandos: plano.comandos.length,
    ambientesPedidos: plano.resumo.ambientesPedidos,
    ambientesAtendidos: plano.resumo.ambientesAtendidos,
    ambientesNomeados: model.spaces.filter((s) => s.levelId === levelId && (s.name ?? '').trim()).length,
    aberturasPedidas: plano.comandos.flatMap((c) => (c.type === 'AddOpenings' ? c.openings : [])).length,
    aberturasCriadas: model.openings.length,
    toPct: plano.resumo.areaConstruidaM2 == null ? null : Math.round((plano.resumo.areaConstruidaM2 / loteM2) * 1000) / 10,
    toMaxPct: TO_MAX,
    regrasVioladas: plano.resumo.regrasVioladas,
    conferido: conferirPlanoDaCasa(lote, plano).ok,
    pendencias: plano.pendencias.map((p) => `${p.grupo}: ${p.texto}`),
  },
};
document.getElementById('dump')!.textContent = [
  `graus ${graus} · semente ${plano.semente}`,
  ...plano.etapas.map((e) => `${e.id} ${e.situacao}${e.nota ? ` — ${e.nota}` : ''}`),
  ...plano.pendencias.map((p) => `· ${p.grupo}: ${p.texto}`),
].join('\n');

function App() {
  // Enquadra depois da 1ª medida do container (a vista inicial não centraliza o desenho).
  const [navegacao, setNavegacao] = useState<{ seq: number; acao: 'ENQUADRAR' } | undefined>(undefined);
  useEffect(() => {
    const t = setTimeout(() => setNavegacao({ seq: 1, acao: 'ENQUADRAR' }), 150);
    return () => clearTimeout(t);
  }, []);
  return (
    <div id="tela">
      <div>
        <BlueprintCanvas
          model={model}
          tool="selecionar"
          levelId={levelId}
          selectedIds={[]}
          onSelecionar={() => {}}
          onAddWall={() => null}
          onAddOpening={() => {}}
          onDelete={() => {}}
          larguraAberturaMm={900}
          espessuraMm={150}
          passoGradeMm={100}
          navegacao={navegacao}
        />
      </div>
    </div>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

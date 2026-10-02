/**
 * Harness visual do ESTUDO DE MASSA (fase M1).
 *
 * Mesma razão do harness do loteamento: em jsdom o canvas não pinta, então
 * nenhum teste de componente prova que o BLOCO alcança a tela ("desenha mas
 * não alcança"). Aqui o canvas REAL pinta dois blocos sobre um lote real, e
 * `medir.mjs` conta pixels:
 *
 *  - o PODIUM comercial (âmbar) cabe no envelope e no gabarito;
 *  - a TORRE residencial passa do gabarito de 8 pavimentos → contorno vermelho.
 *
 * `?vazio=1` mostra o MESMO lote sem bloco nenhum: o controle que prova que a
 * medição discrimina (o âmbar e o vermelho têm de cair a ~zero).
 *
 * O lote é o exemplo do próprio pedido: 1.200 m² (30 × 40), TO 60 %, CA 3,
 * gabarito 8 — e os números do motor saem em `window.__massa`.
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import Blueprint3DTab from '../../../components/blueprint/Blueprint3DTab';
import { COR_DO_USO_DO_BLOCO } from '../../../utils/blueprintMassa';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { divisasDoLote, medirTerreno } from '../../../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../../../utils/blueprintMassa';

const vazio = new URLSearchParams(location.search).has('vazio');
/** `?3d=1`: a mesma massa no visualizador 3D real (um prisma por pavimento). Só print, sem portão. */
const em3d = new URLSearchParams(location.search).has('3d');

function montar(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({
    type: 'AddBoundary',
    levelId: t,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    kind: 'TERRENO',
    papel,
  });
  m = applyBatch(m, [d(0, 0, 30000, 0, 'FRENTE'), d(30000, 0, 30000, 40000, 'LATERAL_DIREITA'), d(30000, 40000, 0, 40000, 'FUNDOS'), d(0, 40000, 0, 0, 'LATERAL_ESQUERDA')]).model;
  if (vazio) return m;
  return applyBatch(m, [
    // Podium 24 × 30 m, 3 pavimentos, dentro dos recuos 5/3/1,5/1,5.
    { type: 'AddBloco', levelId: t, nome: 'Podium', pontos: [{ x: 3000, y: 6000 }, { x: 27000, y: 6000 }, { x: 27000, y: 36000 }, { x: 3000, y: 36000 }], pavimentos: 3, uso: 'COMERCIAL' },
    // Torre 15 × 15 m sobre o podium, 7 pavimentos: do 4º ao 10º — passa do gabarito de 8.
    { type: 'AddBloco', levelId: t, nome: 'Torre', pontos: [{ x: 7500, y: 13500 }, { x: 22500, y: 13500 }, { x: 22500, y: 28500 }, { x: 7500, y: 28500 }], cotaBaseMm: 9000, pavimentos: 7, uso: 'RESIDENCIAL' },
  ]).model;
}

const model = montar();
const levelId = model.levels[0].id;
const medida = medirMassa(model, {
  terreno: medirTerreno(divisasDoLote(model.boundaries)),
  limites: model.boundaries,
  recuosBase: { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 },
  zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 3, gabaritoPavimentos: 8 },
});
const comProblema = new Set(medida.blocos.filter((b) => b.pisosForaDoEnvelope > 0 || b.pisosAcimaDoGabarito > 0).map((b) => b.blocoId));

declare global {
  interface Window {
    __massa?: {
      blocos: number;
      comProblema: string[];
      loteM2: number | null;
      implantacaoMaxM2: number | null;
      potencialM2: number | null;
      pavimentosPossiveis: number | null;
      toPct: number | null;
      ca: number | null;
      pavimentosMax: number;
      construidaM2: number;
      ordinaisDaTorre: (number | null)[];
    };
  }
}

const torre = medida.blocos.find((b) => b.nome === 'Torre');
window.__massa = {
  blocos: medida.blocos.length,
  comProblema: medida.blocos.filter((b) => comProblema.has(b.blocoId)).map((b) => b.nome),
  loteM2: medida.legal.loteM2,
  implantacaoMaxM2: medida.legal.implantacaoMaxM2,
  potencialM2: medida.legal.potencialM2,
  pavimentosPossiveis: medida.legal.pavimentosPossiveis,
  toPct: medida.to.usado,
  ca: medida.ca.usado,
  pavimentosMax: medida.pavimentosMax,
  construidaM2: medida.areaConstruidaM2,
  ordinaisDaTorre: torre ? torre.pisos.map((p) => p.ordinal) : [],
};

const massa3d = medida.blocos.flatMap((m) => {
  const b = (model.blocos ?? []).find((x) => x.id === m.blocoId)!;
  return m.pisos.map((p) => ({ id: b.id, chave: `${b.id}-${p.indice}`, nome: b.nome, anel: b.pontos, baseMm: p.baseMm, topoMm: p.topoMm, cor: COR_DO_USO_DO_BLOCO[b.uso], problema: p.cabe === false || p.acimaDoGabarito }));
});

function App() {
  if (em3d) {
    return (
      <div style={{ height: '100vh', width: '100vw' }}>
        <Blueprint3DTab model={model} mostrarTerreno massa={massa3d} />
      </div>
    );
  }
  return (
    <ConfirmProvider>
      <div style={{ height: '100vh', width: '100vw' }}>
        <BlueprintCanvas model={model} tool="selecionar" levelId={levelId} selectedIds={[]} onSelecionar={() => {}} blocosComProblema={comProblema} />
      </div>
    </ConfirmProvider>
  );
}

createRoot(document.getElementById('raiz') as HTMLElement).render(<App />);

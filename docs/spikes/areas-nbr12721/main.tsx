/**
 * Harness da tela "Áreas NBR 12721" (Fase 6 do plano
 * `docs/planos/2026-10-13-areas-nbr12721-na-planta.md`).
 *
 * Monta a tela de verdade (CSS do app, StandardTable, KpiCard, Sheet) com um
 * prédio de exemplo — térreo com garagem e vaga vinculada, pavimento tipo com
 * dois apartamentos (um com varanda) e duas cópias — sem banco e sem login.
 * O `medir.mjs` fotografa cada aba e reprova rolagem horizontal e erro.
 *
 *   npx vite --port 3111
 *   PLAYWRIGHT_CORE=c:/tmp/pwtest/node_modules/playwright-core \
 *     node docs/spikes/areas-nbr12721/medir.mjs http://127.0.0.1:3111 <pasta>
 */
import '../../../index.css';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TelaAreasNbr12721 from '../../../components/blueprint/TelaAreasNbr12721';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { applyBatch, emptyModel, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_NBR12721_PADRAO, type HipotesesNbr12721 } from '../../../utils/blueprintNbr12721';

function predio(): BlueprintModel {
  let m = applyBatch(emptyModel(), [
    { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 },
    { type: 'AddLevel', name: '1º pavimento', elevationMm: 3000, defaultHeightMm: 3000 },
  ]).model;
  const terreo = m.levels[0].id;
  const tipo = m.levels[1].id;
  const w = (levelId: string, ax: number, ay: number, bx: number, by: number, e = 200): Command => ({ type: 'AddWall', levelId, a: point(ax, ay), b: point(bx, by), thicknessMm: e, heightMm: 3000 });
  m = applyBatch(m, [
    // Térreo: garagem inteira.
    w(terreo, 0, 0, 12000, 0), w(terreo, 12000, 0, 12000, 10000), w(terreo, 12000, 10000, 0, 10000), w(terreo, 0, 10000, 0, 0),
    // Tipo: dois apartamentos, varanda no 101, hall.
    w(tipo, 0, 0, 12000, 0), w(tipo, 12000, 0, 12000, 10000), w(tipo, 12000, 10000, 0, 10000), w(tipo, 0, 10000, 0, 0),
    w(tipo, 0, 8000, 12000, 8000, 150), w(tipo, 6000, 0, 6000, 8000, 150), w(tipo, 0, 2000, 6000, 2000, 150),
  ]).model;
  const doTipo = (pred: (s: BlueprintModel['spaces'][number]) => boolean) => m.spaces.find((s) => s.levelId === tipo && pred(s))!.id;
  const minX = (s: BlueprintModel['spaces'][number]) => Math.min(...s.ring.map((p) => p.x));
  const minY = (s: BlueprintModel['spaces'][number]) => Math.min(...s.ring.map((p) => p.y));
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: m.spaces.find((s) => s.levelId === terreo)!.id, name: 'Garagem' },
    { type: 'NameSpace', spaceId: doTipo((s) => minX(s) === 0 && minY(s) === 0), name: 'Varanda 101' },
    { type: 'NameSpace', spaceId: doTipo((s) => minX(s) === 0 && minY(s) === 2000), name: 'Sala 101' },
    { type: 'NameSpace', spaceId: doTipo((s) => minX(s) === 6000 && minY(s) === 0), name: 'Sala 102' },
    { type: 'NameSpace', spaceId: doTipo((s) => minY(s) === 8000), name: 'Hall' },
    { type: 'AddVaga', levelId: terreo, at: point(3000, 3000) },
  ]).model;
  const lbl = (n: string) => m.labels.find((l) => l.name === n)!;
  m = applyBatch(m, [
    { type: 'SetSpaceLabelProps', labelId: lbl('Varanda 101').id, tipoDeAmbiente: 'VARANDA' },
    { type: 'AddUnidade', numero: '101', tipologia: '2 dorm.', labelIds: [lbl('Sala 101').id, lbl('Varanda 101').id] },
    { type: 'AddUnidade', numero: '102', tipologia: '1 dorm.', labelIds: [lbl('Sala 102').id] },
    { type: 'SetNbr12721DoAmbiente', labelIds: [lbl('Garagem').id], nbr12721: { cobertura: 'DIFERENTE', coeficiente: 0.5, divisao: 'PROPORCIONAL' } },
  ]).model;
  m = applyBatch(m, [
    { type: 'SetAcessoriosDaUnidade', unidadeId: m.unidades.find((u) => u.numero === '101')!.id, acessorios: [{ uid: m.vagas[0].uid, afetaPrivativa: true, afetaCoeficiente: true }] },
    { type: 'AddLevel', name: '2º pavimento', elevationMm: 6000, defaultHeightMm: 3000, tipoDeId: tipo },
    { type: 'AddLevel', name: '3º pavimento', elevationMm: 9000, defaultHeightMm: 3000, tipoDeId: tipo },
  ]).model;
  return m;
}

function App() {
  const [model, setModel] = useState(predio);
  const [hipoteses, setHipoteses] = useState<HipotesesNbr12721>({ ...HIPOTESES_NBR12721_PADRAO, coeficientesPadrao: { DIFERENTE: 0.75, DESCOBERTA: null } });
  return (
    <ConfirmProvider>
      <div className="space-y-6 pb-20">
        <TelaAreasNbr12721
          model={model}
          hipoteses={hipoteses}
          onSalvarHipoteses={async (h) => setHipoteses(h)}
          onRunBatch={(cs) => setModel((atual) => applyBatch(atual, cs).model)}
          erro={null}
        />
      </div>
    </ConfirmProvider>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

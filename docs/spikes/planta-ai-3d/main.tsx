/**
 * Harness da vista 3D da Planta AI (`Building3DViewer`).
 *
 *   npm run dev
 *   node docs/spikes/planta-ai-3d/passeio.mjs http://localhost:3100
 *
 * ─── POR QUE ESTE HARNESS EXISTE ────────────────────────────────────────────
 *
 * `Building3DViewer` está sob `@ts-nocheck` — a augmentation de JSX do R3F foi
 * tirada do programa TS, então o compilador não valida NADA deste componente,
 * nem um erro de escopo. Ele era o único viewer 3D do sistema sem nenhuma prova
 * de runtime.
 *
 * Em 06/09/2026 ele foi auditado por estar na lista de dívidas ("pode ter irmão
 * do defeito da Planta Inteligente lá") e tinha: a câmera não seguia o modelo.
 * A correção foi verificada só por leitura — escopo, ordem de declaração,
 * `useThree` dentro do `<Canvas>`. Este harness é o que faltava para isso não
 * depender de leitura.
 *
 * ─── O QUE O `?crescer=1` PROVA ─────────────────────────────────────────────
 *
 * O botão aumenta os pavimentos COM A CENA MONTADA. É exatamente o gesto que
 * expunha o defeito: `<Canvas camera={{ position }}>` só vale na montagem, então
 * o prédio crescia e a câmera ficava onde estava. Um teste que só monta a cena
 * jamais veria isso.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Building3DViewer from '../../../components/planta_ai/Building3DViewer';

const params = new URLSearchParams(location.search);
const num = (chave: string, padrao: number) => {
  const v = Number(params.get(chave));
  return Number.isFinite(v) && v > 0 ? v : padrao;
};

/** Um cenário pequeno e legível: prédio de 12 × 10 num terreno de 20 × 18. */
const BASE = {
  buildingWidth: num('largura', 12),
  buildingDepth: num('profundidade', 10),
  unitsPerFloor: num('unidades', 4),
  terrainWidth: num('terrenoL', 20),
  terrainDepth: num('terrenoP', 18),
  leftSetback: 1.5,
  frontSetback: 3,
  minRightSetback: 1.5,
  minRearSetback: 3,
  floorHeight: 3,
};

function App() {
  const [pavimentos, setPavimentos] = useState(num('pavimentos', 3));
  const podeCrescer = params.get('crescer') === '1';

  return (
    <>
      <div id="barra">
        Pavimentos: {pavimentos} · Terreno: {BASE.terrainWidth}×{BASE.terrainDepth}
        {podeCrescer && (
          <button
            id="crescer"
            type="button"
            onClick={() => setPavimentos((n) => n + 12)}
            style={{ marginLeft: 10 }}
          >
            +12 pavimentos
          </button>
        )}
      </div>
      <div id="tela">
        <Building3DViewer {...BASE} floorsCount={pavimentos} />
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

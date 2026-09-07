/**
 * Harness da IMPORTAÇÃO DE PAREDES do DXF.
 *
 * Monta o `PainelImportarDxf` REAL ao lado da planta e do 3D REAIS. O Playwright
 * entrega o arquivo direto ao `input[type=file]`, então o arquivo de teste NÃO
 * precisa ser servido nem versionado — e nada disto passa por login.
 *
 * O arquivo é o projeto arquitetônico APROVADO NA PREFEITURA (8,3 MB), com
 * 22 mil traços em 40 camadas. É o desenho que a empresa de fato usa.
 *
 * ─── POR QUE ELE EXISTE ─────────────────────────────────────────────────────
 *
 * A prova de que a importação lê certo é de NÚMERO (`ifcLerParedes`,
 * `ifcTraduzirParedes`, contra os arquivos reais). O que número nenhum alcança é
 * o desenho sair torto: planta espelhada, parede meia espessura fora, tudo
 * empilhado num ponto. Neste módulo já houve número certo com desenho errado.
 *
 * Abrir em: /docs/spikes/importar-dxf/index.html
 */

import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PainelImportarDxf from '../../../components/blueprint/PainelImportarDxf';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import Blueprint3DTab from '../../../components/blueprint/Blueprint3DTab';
import {
  applyBatch,
  applyCommand,
  emptyModel,
  type BlueprintModel,
  type Command,
} from '../../../utils/blueprintKernel';

const params = new URLSearchParams(location.search);

/**
 * O nível que recebe as paredes.
 *
 * Um DXF de planta é UM pavimento.
 */
function inicial(): { model: BlueprintModel; levelId: string } {
  const a = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: 2800,
  });
  // Um nível só: um DXF de planta é UM pavimento, e o painel importa para o
  // nível ativo. Dois níveis aqui não representariam nada do arquivo.
  return { model: a.model, levelId: a.model.levels[0].id };
}

function App() {
  const base = useMemo(inicial, []);
  const [model, setModel] = useState(base.model);
  const [erro, setErro] = useState<string | null>(null);

  const importar = (comandos: Command[]) => {
    try {
      // `applyBatch` é "ou tudo, ou nada": se uma parede violar invariante, o
      // harness mostra o erro em vez de aplicar metade.
      setModel(applyBatch(model, comandos).model);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  // A barra é o que o portão lê: contagem, pegada e espessuras.
  const xs = model.walls.flatMap((w) => [w.a.x, w.b.x]);
  const ys = model.walls.flatMap((w) => [w.a.y, w.b.y]);
  const esp = [...new Set(model.walls.map((w) => w.thicknessMm))].sort((a, b) => a - b);
  const barra =
    `PAREDES: ${model.walls.length} · VAOS: ${model.openings.length}` +
    ` · PORTAS: ${model.openings.filter((o) => o.kind === 'door').length}` +
    ` · JANELAS: ${model.openings.filter((o) => o.kind === 'window').length}` +
    ` · AMBIENTES: ${model.spaces.length}` +
    ` · PEGADA: ${xs.length ? Math.round(Math.max(...xs) - Math.min(...xs)) : 0}` +
    ` x ${ys.length ? Math.round(Math.max(...ys) - Math.min(...ys)) : 0} mm` +
    ` · ESPESSURAS: ${esp.join(',') || '—'}` +
    ` · COM CAMADAS: ${model.walls.filter((w) => w.camadas).length}` +
    (erro ? ` · ERRO: ${erro}` : '');

  return (
    <>
      <div id="painel">
        <PainelImportarDxf model={model} levelIdAtivo={base.levelId} onImportar={importar} />
      </div>
      <div id="direita">
        <div id="barra">{barra}</div>
        <div id="tela">
          {params.get('vista') === '3d' ? (
            <Blueprint3DTab model={model} />
          ) : (
            <BlueprintCanvas
              model={model}
              tool="selecionar"
              levelId={base.levelId}
              selectedIds={[]}
              onSelecionar={() => {}}
              onAddWall={() => {}}
              onAddOpening={() => {}}
              larguraAberturaMm={900}
              onDelete={() => {}}
              espessuraMm={150}
              passoGradeMm={100}
              ortogonal
            />
          )}
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

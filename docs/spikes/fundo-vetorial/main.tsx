/**
 * Harness do FUNDO VETORIAL (E10.4c do roadmap de climatização, 08/10/2026).
 *
 * O DXF é o da própria Planta (`gerarDxf` de uma casa), rasterizado como a
 * importação faz (`rasterizarDxf`) e posto no `BlueprintCanvas` REAL como planta
 * de fundo — com o PNG (`?vetor=0`) ou com as linhas (`?vetor=1`). O modelo
 * fica VAZIO: o que aparece na tela é só o fundo, e o passeio compara os dois.
 *
 * Abrir em: /docs/spikes/fundo-vetorial/index.html?vetor=1
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import { applyBatch, applyCommand, emptyModel, point, type Command } from '../../../utils/blueprintKernel';
import { gerarDxf } from '../../../utils/blueprintDxf';
import { prepararDxf } from '../../../utils/dxfParaKernel';
import { fundoVetorialDoDesenho, rasterizarDxf, type FundoVetorial } from '../../../utils/dxfParaFundo';
import type { Underlay } from '../../../utils/blueprintUnderlay';

const params = new URLSearchParams(location.search);
const comVetor = params.get('vetor') === '1';

function casa() {
  const base = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
  return applyBatch(base, [w(0, 0, 8000, 0), w(8000, 0, 8000, 5000), w(8000, 5000, 0, 5000), w(0, 5000, 0, 0), w(3000, 0, 3000, 5000)]).model;
}

const vazio = (() => {
  const m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  return { model: m, levelId: m.levels[0].id };
})();

function App() {
  const [fundo, setFundo] = useState<{ imagem: HTMLImageElement; underlay: Underlay; vetor: FundoVetorial | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const texto = gerarDxf(casa(), { titulo: 'Fundo', revisao: 1, hash: 'f'.repeat(64), cotas: false, eixos: false });
      const leitura = prepararDxf(texto);
      const opcoes = { mmPorUnidade: 1, dx: 0, dy: 0, camadaDestaque: null };
      const r = await rasterizarDxf(leitura, opcoes);
      if (!r) throw new Error('rasterizarDxf devolveu null');
      const imagem = new Image();
      imagem.src = URL.createObjectURL(r.blob);
      await imagem.decode();
      const vetor = fundoVetorialDoDesenho(leitura, { mmPorUnidade: 1, camada: '', dx: 0, dy: 0 }, { larguraPx: imagem.naturalWidth, alturaPx: imagem.naturalHeight });
      setFundo({ imagem, underlay: r.plano.underlay, vetor });
    })().catch((e) => setErro(String(e)));
  }, []);
  return (
    <>
      <div id="barra">
        {erro ? `ERRO: ${erro}` : fundo ? `PRONTO · VETOR: ${comVetor && fundo.vetor ? 'sim' : 'não'} · BATEU: ${fundo.vetor ? 'sim' : 'não'}` : 'carregando…'}
      </div>
      <div id="tela">
        <BlueprintCanvas
          model={vazio.model}
          tool="selecionar"
          levelId={vazio.levelId}
          selectedIds={[]}
          onSelecionar={() => {}}
          onAddWall={() => {}}
          onAddOpening={() => {}}
          larguraAberturaMm={900}
          onDelete={() => {}}
          espessuraMm={150}
          passoGradeMm={100}
          ortogonal
          fundo={fundo ? { imagem: fundo.imagem, underlay: fundo.underlay, opacidade: 1, vetor: comVetor ? fundo.vetor : null } : null}
          enquadrarPrancha={fundo ? 'prancha' : null}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

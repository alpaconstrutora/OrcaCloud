/**
 * Harness isolado do comprimento editável no painel "Parede selecionada".
 *
 * Junta o `BlueprintCanvas` REAL (seleção por clique de verdade, com o próprio
 * hit-test do canvas) e o `PainelParedeSelecionada` REAL — não uma cópia dos
 * dois. A lógica de qual ponta anda e o lote que arrasta o canto é COPIADA
 * verbatim de `BlueprintEditor.tsx` (função `esticarParede` e o memo
 * `esticamento`), porque as duas vivem dentro do componente do editor e não são
 * exportadas; a cópia existe só para este harness alcançar as mesmas funções
 * sem subir Supabase.
 *
 * Existe porque a interação "clicar a parede no canvas → digitar no painel →
 * o desenho muda" atravessa dois componentes que nenhum teste de unidade liga:
 * o teste do kernel prova o lote, o teste do painel prova o campo — nenhum dos
 * dois prova que SELECIONAR DE VERDADE no canvas alimenta o painel certo.
 *
 * Abrir em: /docs/spikes/comprimento-editavel/index.html no servidor de dev.
 */

import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import PainelParedeSelecionada from '../../../components/blueprint/PainelParedeSelecionada';
import {
  KernelError,
  applyBatch,
  applyCommand,
  emptyModel,
  isFreeWallEnd,
  pontaEsticada,
  type BlueprintModel,
  type Command,
  type Point,
} from '../../../utils/blueprintKernel';

const T = 150;
const H = 2800;

function construir(): BlueprintModel {
  const base = applyCommand(emptyModel(), {
    type: 'AddLevel',
    name: 'Térreo',
    elevationMm: 0,
    defaultHeightMm: H,
  }).model;
  const levelId = base.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({
    type: 'AddWall',
    levelId,
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    thicknessMm: T,
    heightMm: H,
  });
  // Retângulo 4000×3000 mm — o mesmo caso do teste de kernel "esticar parede
  // arrastando o canto junto".
  return applyBatch(base, [
    w(0, 0, 4000, 0), // sul
    w(4000, 0, 4000, 3000), // leste
    w(4000, 3000, 0, 3000), // norte
    w(0, 3000, 0, 0), // oeste
  ]).model;
}

function App() {
  const [model, setModel] = useState<BlueprintModel>(construir);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const levelId = model.levels[0].id;

  const paredeSel = model.walls.find((w) => w.id === selectedId) ?? null;

  // ── Cópia verbatim de BlueprintEditor.tsx ──────────────────────────────────
  const esticamento = useMemo(() => {
    if (!paredeSel) return { pontaQueAnda: null as 'a' | 'b' | null, arrastaCanto: false };
    const nivel = model.walls.filter((w) => w.levelId === paredeSel.levelId);
    const aLivre = isFreeWallEnd(nivel, paredeSel.a, paredeSel.id);
    const bLivre = isFreeWallEnd(nivel, paredeSel.b, paredeSel.id);
    const pontaQueAnda: 'a' | 'b' = aLivre && !bLivre ? 'a' : 'b';
    return { pontaQueAnda, arrastaCanto: !(pontaQueAnda === 'a' ? aLivre : bLivre) };
  }, [paredeSel, model.walls]);

  function esticarParede(comprimentoMm: number) {
    if (!paredeSel) return;
    const { pontaQueAnda } = esticamento;
    if (!pontaQueAnda) return;
    const nivel = model.walls.filter((w) => w.levelId === paredeSel.levelId);
    const ancora = pontaQueAnda === 'a' ? paredeSel.b : paredeSel.a;
    const pontaAtual = pontaQueAnda === 'a' ? paredeSel.a : paredeSel.b;

    let novaPonta: Point;
    try {
      novaPonta = pontaEsticada(ancora, pontaAtual, comprimentoMm);
    } catch (e) {
      if (e instanceof KernelError) return;
      throw e;
    }

    const lote: Command[] = [
      { type: 'MoveVertex', wallId: paredeSel.id, end: pontaQueAnda, to: novaPonta },
    ];
    for (const w of nivel) {
      if (w.id === paredeSel.id) continue;
      if (w.a.x === pontaAtual.x && w.a.y === pontaAtual.y) {
        lote.push({ type: 'MoveVertex', wallId: w.id, end: 'a', to: novaPonta });
      }
      if (w.b.x === pontaAtual.x && w.b.y === pontaAtual.y) {
        lote.push({ type: 'MoveVertex', wallId: w.id, end: 'b', to: novaPonta });
      }
    }
    try {
      setModel(applyBatch(model, lote).model);
    } catch (e) {
      console.error('lote recusado:', e);
    }
  }
  // ── Fim da cópia ────────────────────────────────────────────────────────────

  const dump = {
    selectedId,
    pontaQueAnda: esticamento.pontaQueAnda,
    arrastaCanto: esticamento.arrastaCanto,
    paredes: model.walls.map((w) => ({ id: w.id, a: w.a, b: w.b })),
    ambientes: model.spaces.map((s) => ({ areaMm2: s.areaMm2 })),
  };
  const el = document.getElementById('dump');
  if (el) el.textContent = JSON.stringify(dump, null, 1);

  return (
    <>
      <div id="tela">
        <BlueprintCanvas
          model={model}
          tool="selecionar"
          levelId={levelId}
          selectedIds={selectedId ? [selectedId] : []}
          onSelecionar={(ids) => setSelectedId(ids[0] ?? null)}
          onAddWall={() => null}
          onAddOpening={() => {}}
          onDelete={() => {}}
          larguraAberturaMm={900}
          espessuraMm={T}
          passoGradeMm={100}
        />
      </div>
      <div style={{ width: 260, borderLeft: '1px solid #e2e8f0', background: '#fff' }}>
        <PainelParedeSelecionada
          parede={paredeSel}
          abertura={null}
          pontaQueAnda={esticamento.pontaQueAnda}
          arrastaCanto={esticamento.arrastaCanto}
          onComprimento={esticarParede}
          onEspessura={() => {}}
          podeUnir={false}
          onDividir={() => {}}
          onUnir={() => {}}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('raiz')!).render(<App />);

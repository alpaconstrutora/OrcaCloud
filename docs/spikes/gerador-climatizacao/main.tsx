/**
 * HARNESS — o GERADOR DE CLIMATIZAÇÃO (E11, 10/10/2026): a gaveta REAL
 * (`PainelGeradorPpci` com o plano de `gerarClimatizacao`), na largura do
 * drawer, ao lado da PLANTA REAL (`BlueprintCanvas`) — que mostra a PRÉVIA antes
 * de lançar e o desenho depois. Lançar e Ctrl+Z passam pelo `ModelHistory` do
 * kernel, como no editor. A barra conta o que a climatização tem no desenho, para
 * o passeio afirmar sem inspecionar a cena.
 *
 * A casa: Sala e Quarto (climatizados pelo nome), Cozinha (não), um quadro.
 */
import './harness.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyBatch, applyCommand, emptyModel, ModelHistory, point, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { HIPOTESES_CLIMATIZACAO_PADRAO, type HipotesesClimatizacao } from '../../../utils/blueprintClimatizacao';
import { SEMENTES_DE_TIPOS } from '../../../utils/blueprintCatalogoDeTipos';
import { modelosDoCatalogo } from '../../../utils/blueprintSelecaoClimatizacao';
import { HIPOTESES_CIRCUITOS_PADRAO } from '../../../utils/blueprintCircuitosAutomaticos';
import { HIPOTESES_PADRAO } from '../../../utils/blueprintEletricaDimensionamento';
import { conferirPlanoDaClimatizacao, gerarClimatizacao, type PlanoDaClimatizacao } from '../../../utils/blueprintGeradorClimatizacao';
import PainelGeradorPpci from '../../../components/blueprint/PainelGeradorPpci';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';

const modelos = modelosDoCatalogo(SEMENTES_DE_TIPOS.map((s, i) => ({ id: `t${i}`, nome: s.nome, familia: s.propriedades.familia, active: true, propriedades: s.propriedades })));
const hip: HipotesesClimatizacao = { ...HIPOTESES_CLIMATIZACAO_PADRAO, clima: { cidade: null, tbsExternaC: 34, tbuExternaC: 25, altitudeM: 0 } };
const cx = { modelos, circuitos: { hip: HIPOTESES_CIRCUITOS_PADRAO, eletricas: HIPOTESES_PADRAO } };

function casa(): { m: BlueprintModel; t: string } {
  const a = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 2800 }).model;
  const t = a.levels[0].id;
  const w = (ax: number, ay: number, bx: number, by: number): Command => ({ type: 'AddWall', levelId: t, a: point(ax, ay), b: point(bx, by), thicknessMm: 150, heightMm: 2800 }) as Command;
  let m = applyBatch(a, [w(0, 0, 12000, 0), w(12000, 0, 12000, 5000), w(12000, 5000, 0, 5000), w(0, 5000, 0, 0), w(4000, 0, 4000, 5000), w(8000, 0, 8000, 5000)]).model;
  const entre = (x0: number, x1: number) => m.spaces.find((s) => s.ring.every((p) => p.x >= x0 - 100 && p.x <= x1 + 100))!;
  const [sala, quarto, coz] = [entre(0, 4000), entre(4000, 8000), entre(8000, 12000)];
  const d1 = m.walls.find((x) => x.a.x === 4000 && x.b.x === 4000)!;
  const d2 = m.walls.find((x) => x.a.x === 8000 && x.b.x === 8000)!;
  m = applyBatch(m, [
    { type: 'NameSpace', spaceId: sala.id, name: 'Sala' },
    { type: 'NameSpace', spaceId: quarto.id, name: 'Quarto' },
    { type: 'NameSpace', spaceId: coz.id, name: 'Cozinha' },
    { type: 'AddOpening', wallId: d1.id, kind: 'door', offsetMm: 2000, widthMm: 800, heightMm: 2100, sillMm: 0 } as Command,
    { type: 'AddOpening', wallId: d2.id, kind: 'door', offsetMm: 2000, widthMm: 800, heightMm: 2100, sillMm: 0 } as Command,
    { type: 'AddQuadro', levelId: t, nome: 'QDC', at: point(11500, 4500), cotaMm: 1600 } as Command,
  ]).model;
  return { m, t };
}
const { m: ORIGINAL, t: NIVEL } = casa();

const conta = (x: BlueprintModel) =>
  [
    `EVAPORADORAS: ${(x.terminais ?? []).filter((t) => t.tipoHidraulico === 'EVAPORADORA_HI_WALL').length}`,
    `CONDENSADORAS: ${(x.terminais ?? []).filter((t) => t.tipoHidraulico === 'CONDENSADORA_SPLIT').length}`,
    `LINHA: ${(x.trechos ?? []).filter((t) => t.disciplina === 'FRIGORIGENA').length}`,
    `DRENO: ${(x.trechos ?? []).filter((t) => t.disciplina === 'DRENO_AC').length}`,
    `AR COM CIRCUITO: ${(x.terminais ?? []).filter((t) => t.tipoEletrico === 'AR_CONDICIONADO' && t.circuitoId != null).length}`,
  ].join(' · ');

function App() {
  const [historico] = useState(() => new ModelHistory(ORIGINAL));
  const [m, setM] = useState(ORIGINAL);
  const [plano, setPlano] = useState<PlanoDaClimatizacao | null>(null);
  const [lancado, setLancado] = useState<string | null>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        historico.undo();
        setM(historico.current);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [historico]);
  const vista = plano ? plano.resultado : m;
  return (
    <>
      <div style={{ width: 420, flex: '0 0 420px', overflow: 'auto' }} className="rounded-[10px] bg-white p-4 shadow">
        <PainelGeradorPpci
          testId="gerador-climatizacao"
          g={{
            plano,
            gerando: false,
            onGerar: () => {
              setLancado(null);
              setPlano(gerarClimatizacao(m, hip, cx));
            },
            prova: plano ? conferirPlanoDaClimatizacao(m, plano) : null,
            onLancar: () => {
              const r = historico.applyMany(plano!.comandos);
              setM(historico.current);
              setLancado(`${r.diff.created.length} peça(s) e trecho(s) lançados num lote — Ctrl+Z desfaz tudo.`);
              setPlano(null);
            },
            lancado,
            onBaixar: () => undefined,
          }}
        />
      </div>
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div id="barra">
          {plano ? 'PRÉVIA · ' : 'DESENHO · '}
          {conta(vista)}
        </div>
        <div style={{ position: 'relative', flex: '1 1 auto', background: '#fff' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <BlueprintCanvas
              model={vista}
              tool="selecionar"
              levelId={NIVEL}
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
          </div>
        </div>
      </div>
    </>
  );
}
createRoot(document.getElementById('raiz')!).render(<App />);

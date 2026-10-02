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
 *
 * `?gerar=1` (M5): a TELA do gerador de massa num lote 40 × 60 m sem bloco,
 * com o Web Worker REAL (o jsdom não tem Worker: só o navegador prova que o
 * worker empacota e responde). `window.__gerador` diz se o worker e o fio
 * principal deram o MESMO resultado.
 */
import '../../../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import BlueprintCanvas from '../../../components/blueprint/BlueprintCanvas';
import Blueprint3DTab from '../../../components/blueprint/Blueprint3DTab';
import { COR_DO_USO_DO_BLOCO } from '../../../utils/blueprintMassa';
import { distribuirProduto, produtoSemente } from '../../../utils/blueprintProduto';
import { financeiroDaMassa } from '../../../utils/blueprintFinanceiroMassa';
import { cubDoPadrao } from '../../../services/cubService';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { applyBatch, applyCommand, emptyModel, type BlueprintModel, type Command } from '../../../utils/blueprintKernel';
import { divisasDoLote, medirTerreno } from '../../../utils/blueprintTerreno';
import { medirMassa, ZONA_DA_MASSA_VAZIA } from '../../../utils/blueprintMassa';
import TelaGeradorDeMassa from '../../../components/blueprint/TelaGeradorDeMassa';
import { insolacaoDaMassa } from '../../../utils/blueprintInsolacaoDaMassa';
import { useGeradorDeMassa } from '../../../hooks/useGeradorDeMassa';
import { gerarMassa, RESTRICOES_PADRAO, type EntradaDoGeradorDeMassa } from '../../../utils/blueprintGeradorDeMassa';

const vazio = new URLSearchParams(location.search).has('vazio');
/** `?3d=1`: a mesma massa no visualizador 3D real (um prisma por pavimento). Só print, sem portão. */
const em3d = new URLSearchParams(location.search).has('3d');
const modoGerar = new URLSearchParams(location.search).has('gerar');

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
      /** M2: o produto residencial médio repartido na massa. */
      produto: { unidades: number; torrePorPav: number; podiumPorPav: number; eficienciaGlobalPct: number | null; vagasExigidas: number; nucleoDaTorre: string };
      /** M3: financeiro com CUB fixo de 2.000 (conta conferível) e o CUB REAL da tabela. */
      financeiro?: { vgv: number; custoObra: number | null; margemPct: number | null };
      cubReal?: { r8n: { valorM2: number; fonte: string; referencia: string | null }; ppn: { valorM2: number; fonte: string; referencia: string | null } } | { erro: string };
      /** M5b: a insolação COMPLETA da massa a 19,9° S, num navegador de verdade (física e tempo). */
      sol?: { ms: number; norteDaTorreH: number; sulDaTorreH: number; perdaFrenteH: number; perdaFundosH: number; loteComSolPct: number | null };
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
  produto: (() => {
    const r = distribuirProduto(model, medida, produtoSemente('MISTO'));
    const pt = r.blocos.find((b) => b.nome === 'Torre');
    const pp = r.blocos.find((b) => b.nome === 'Podium');
    return {
      unidades: r.unidades,
      torrePorPav: pt?.unidadesPorPavimento ?? 0,
      podiumPorPav: pp?.unidadesPorPavimento ?? 0,
      eficienciaGlobalPct: r.eficienciaGlobalPct,
      vagasExigidas: r.vagasExigidas,
      nucleoDaTorre: pt ? `${pt.nucleo.origem}:${pt.nucleo.m2}` : '',
    };
  })(),
};

const massa3d = medida.blocos.flatMap((m) => {
  const b = (model.blocos ?? []).find((x) => x.id === m.blocoId)!;
  return m.pisos.map((p) => ({ id: b.id, chave: `${b.id}-${p.indice}`, nome: b.nome, anel: b.pontos, baseMm: p.baseMm, topoMm: p.topoMm, cor: COR_DO_USO_DO_BLOCO[b.uso], problema: p.cabe === false || p.acimaDoGabarito }));
});

/** M5: lote 40 × 60 m sem bloco, a régua do pedido (TO 60 %, CA 3, gabarito 12) e o produto residencial médio. */
function loteDoGerador(): BlueprintModel {
  let m = applyCommand(emptyModel(), { type: 'AddLevel', name: 'Térreo', elevationMm: 0, defaultHeightMm: 3000 }).model;
  const t = m.levels[0].id;
  const d = (ax: number, ay: number, bx: number, by: number, papel: 'FRENTE' | 'FUNDOS' | 'LATERAL_DIREITA' | 'LATERAL_ESQUERDA'): Command => ({ type: 'AddBoundary', levelId: t, a: { x: ax, y: ay }, b: { x: bx, y: by }, kind: 'TERRENO', papel });
  return applyBatch(m, [d(0, 0, 40000, 0, 'FRENTE'), d(40000, 0, 40000, 60000, 'LATERAL_DIREITA'), d(40000, 60000, 0, 60000, 'FUNDOS'), d(0, 60000, 0, 0, 'LATERAL_ESQUERDA')]).model;
}
const REGUA_DO_GERADOR: EntradaDoGeradorDeMassa['regua'] = {
  zona: { ...ZONA_DA_MASSA_VAZIA, taxaOcupacaoMaxPct: 60, coeficienteMax: 3, gabaritoPavimentos: 12 },
  recuosBase: { FRENTE: 5000, FUNDOS: 3000, LATERAL_DIREITA: 1500, LATERAL_ESQUERDA: 1500 },
  produto: produtoSemente('RESIDENCIAL_MEDIO'),
  cub: { valorM2: 2000, fonte: 'TABELA', referencia: 'fixo do harness' },
  vagasPorUnidadeDaZona: null,
};

function AppDoGerador() {
  const gerador = useGeradorDeMassa();
  const model = React.useMemo(loteDoGerador, []);
  return (
    <ConfirmProvider>
      <div style={{ padding: 24, background: '#f8fafc', minHeight: '100vh' }}>
        <TelaGeradorDeMassa gerador={gerador} model={model} regua={REGUA_DO_GERADOR} proximoNumero={2} onAbrirProduto={() => {}} onCriarAlternativa={async () => {}} onAplicar={async () => {}} />
      </div>
    </ConfirmProvider>
  );
}

if (modoGerar) {
  // O worker REAL contra o fio principal: o mesmo resultado, byte a byte (o gerador é determinístico).
  const entrada: EntradaDoGeradorDeMassa = { model: loteDoGerador(), regua: REGUA_DO_GERADOR, objetivo: 'RESULTADO', restricoes: RESTRICOES_PADRAO };
  const t0 = performance.now();
  const local = gerarMassa(entrada, 1);
  const msLocal = performance.now() - t0;
  const w = new Worker(new URL('../../../utils/blueprintGeradorDeMassa.worker.ts', import.meta.url), { type: 'module' });
  const t1 = performance.now();
  w.onmessage = (ev) => {
    const r = ev.data?.resultado;
    (window as unknown as { __gerador: unknown }).__gerador = {
      viaWorker: !!r,
      igual: !!r && JSON.stringify(r) === JSON.stringify(local),
      tipos: local.melhores.map((c) => c.parametros.tipo),
      avaliados: local.avaliados,
      msLocal: Math.round(msLocal),
      msWorker: Math.round(performance.now() - t1),
      erro: ev.data?.mensagem ?? null,
    };
    w.terminate();
  };
  w.onerror = (e) => ((window as unknown as { __gerador: unknown }).__gerador = { viaWorker: false, erro: e.message });
  w.postMessage({ entrada, semente: 1, hipoteses: {} });
}

function App() {
  if (modoGerar) return <AppDoGerador />;
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

{
  const p = produtoSemente('MISTO');
  const dist = distribuirProduto(model, medida, p);
  const f = financeiroDaMassa(medida, p, dist, { valorM2: 2000, fonte: 'TABELA', referencia: 'fixo do harness' });
  window.__massa!.financeiro = { vgv: f.vgv, custoObra: f.custoObra, margemPct: f.margemPct };
  if (!vazio) {
    const t0 = performance.now();
    const s = insolacaoDaMassa(model, { latitudeGraus: -19.9, rotacaoNorteDeg: null, entorno: [], minimaH: 2, amostragem: 'COMPLETA' });
    const ms = performance.now() - t0;
    const torreSol = s.blocos.find((b) => b.nome === 'Torre');
    const h = (o: string) => torreSol?.fachadas.find((x) => x.orientacao === o)?.horasInverno ?? -1;
    const perda = (l: string) => s.vizinhos.find((v) => v.lado === l)?.perdidasH ?? -1;
    window.__massa!.sol = { ms: Math.round(ms), norteDaTorreH: h('N'), sulDaTorreH: h('S'), perdaFrenteH: perda('FRENTE'), perdaFundosH: perda('FUNDOS'), loteComSolPct: s.loteComSolPct };
  }
  // A consulta REAL: mesma função que a tela usa, contra a tabela do Estimador (leitura pública).
  Promise.all([cubDoPadrao('MG', 'R8-N'), cubDoPadrao('MG', 'PP-N')])
    .then(([r8n, ppn]) => (window.__massa!.cubReal = { r8n, ppn }))
    .catch((e) => (window.__massa!.cubReal = { erro: String(e) }));
}

createRoot(document.getElementById('raiz') as HTMLElement).render(<App />);

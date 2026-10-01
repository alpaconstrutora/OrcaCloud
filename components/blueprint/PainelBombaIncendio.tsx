/**
 * INCÊNDIO — a bomba contra a rede (01/10/2026, E4.2 do roadmap de incêndio):
 * a curva da bomba × a curva do sistema no gráfico (§28 do guia), o ponto de
 * projeto e o de operação, as verificações (projeto, 150 %, shutoff, NPSH) e
 * as bombas cadastradas que atendem — aplicar uma copia a curva para a bomba.
 */
import React from 'react';
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import type { AnaliseDaBomba, BombaCandidata, HipotesesDoBombeamento } from '../../utils/blueprintBombeamentoIncendio';
import { alturaDaBombaM } from '../../utils/blueprintBombeamentoIncendio';
import type { PontoDaCurvaDaBomba } from '../../utils/blueprintKernel';

interface Props {
  analise: AnaliseDaBomba;
  curva: PontoDaCurvaDaBomba[] | null;
  hb: HipotesesDoBombeamento;
  onHb: (h: HipotesesDoBombeamento) => void;
  /** As bombas cadastradas que atendem o projeto, da menor folga para a maior. */
  candidatas: { candidata: BombaCandidata; folgaM: number }[];
  onAplicar: (c: BombaCandidata) => void;
  onSelecionarBomba: () => void;
}

const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const campo = 'w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const AZUL = '#3b82f6';
const CINZA = '#94a3b8';
const TINTA = '#0f172a';

function Sim({ ok, rotulo, detalhe }: { ok: boolean | null; rotulo: string; detalhe: string }) {
  const cor = ok == null ? 'text-slate-500' : ok ? 'text-emerald-700' : 'text-red-700';
  return (
    <li className="text-xs text-slate-700">
      <span className={`font-medium ${cor}`}>{ok == null ? 'Não avaliado' : ok ? 'Atende' : 'Falta'}</span> · {rotulo} — <span className="text-slate-500">{detalhe}</span>
    </li>
  );
}

export default function PainelBombaIncendio({ analise: a, curva, hb, onHb, candidatas, onAplicar, onSelecionarBomba }: Props) {
  const pontosDaBomba = curva?.map((p) => ({ vazaoLmin: p.vazaoLmin, bomba: p.alturaMm / 1000 })) ?? [];
  const pontosDoSistema = a.curvaDoSistema.map((p) => ({ vazaoLmin: Math.max(0, p.vazaoLmin), sistema: p.alturaM }));
  const xMax = Math.max(...pontosDaBomba.map((p) => p.vazaoLmin), ...pontosDoSistema.map((p) => p.vazaoLmin), a.projeto?.vazaoLmin ?? 0, 10);

  return (
    <div className="space-y-3" data-testid="bomba-incendio">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-700">Bomba principal</h4>
        <button type="button" onClick={onSelecionarBomba} className="text-xs text-blue-700 hover:underline">
          selecionar a bomba
        </button>
      </div>

      <div className="rounded-[10px] border border-gray-100 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700">Curva da bomba × curva do sistema</h3>
        <p className="mt-0.5 text-xs text-gray-400">Altura manométrica (m) por vazão (L/min), com os hidrantes mais desfavoráveis abertos.</p>
        {!a.temCurva ? (
          <p className="flex min-h-[160px] items-center text-sm text-gray-400" data-testid="bomba-sem-curva">
            A bomba não tem curva declarada: preencha a curva do catálogo no painel da bomba, ou aplique uma bomba cadastrada abaixo.
          </p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: AZUL }} />Bomba</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: CINZA }} />Sistema</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: TINTA }} />Projeto</span>
              {a.operacao && <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AZUL }} />Operação (o cruzamento)</span>}
            </div>
            <div className="mt-3" style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" dataKey="vazaoLmin" domain={[0, Math.ceil(xMax / 100) * 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} width={40} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: 12 }}
                    formatter={(v) => `${n(Number(v ?? 0))} m`}
                    labelFormatter={(q) => `${n(Number(q ?? 0), 0)} L/min`}
                  />
                  <Line data={pontosDaBomba} dataKey="bomba" name="Bomba" stroke={AZUL} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line data={pontosDoSistema} dataKey="sistema" name="Sistema" stroke={CINZA} strokeWidth={2} dot={false} isAnimationActive={false} />
                  {a.projeto && <Scatter data={[{ vazaoLmin: a.projeto.vazaoLmin, projeto: a.projeto.alturaM }]} dataKey="projeto" name="Projeto" fill={TINTA} isAnimationActive={false} />}
                  {a.operacao && <Scatter data={[{ vazaoLmin: a.operacao.vazaoLmin, operacao: a.operacao.alturaM }]} dataKey="operacao" name="Operação" fill={AZUL} isAnimationActive={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      <ul className="space-y-1" data-testid="bomba-verificacoes">
        {a.projeto && (
          <Sim
            ok={a.atendeProjeto}
            rotulo="Ponto de projeto"
            detalhe={`${n(a.projeto.vazaoLmin, 0)} L/min a ${n(a.projeto.alturaM)} m; a curva dá ${a.alturaNaVazaoDeProjetoM == null ? '— (fora da faixa do catálogo)' : `${n(a.alturaNaVazaoDeProjetoM)} m`}`}
          />
        )}
        {a.operacao && (
          <Sim
            ok={a.operacao.atende}
            rotulo="Ponto de operação"
            detalhe={`${n(a.operacao.vazaoLmin, 0)} L/min a ${n(a.operacao.alturaM)} m — onde a bomba e a rede se encontram`}
          />
        )}
        {a.cento50 && (
          <Sim ok={a.cento50.atende} rotulo="150 % da vazão" detalhe={`≥ ${n(a.cento50.minimoM)} m (65 % da carga de projeto); a curva dá ${a.cento50.alturaM == null ? '— (fora da faixa)' : `${n(a.cento50.alturaM)} m`} — CONFERIR NA NORMA`} />
        )}
        {a.shutoff && (
          <Sim ok={a.shutoff.atende} rotulo="Shutoff (vazão zero)" detalhe={`${n(a.shutoff.alturaM)} m levam a estática do hidrante mais baixo a ${n(a.shutoff.estaticaMaximaKpa, 0)} kPa`} />
        )}
        {a.npsh && (
          <Sim
            ok={a.npsh.atende}
            rotulo="NPSH"
            detalhe={`disponível ${n(a.npsh.disponivelM, 2)} m (${a.npsh.nivelDaSuccao === 'CAIXA' ? 'fundo da caixa de RTI' : 'sem caixa: água na cota da bomba'}) × requerido ${a.npsh.requeridoM == null ? '— (declare o do catálogo)' : `${n(a.npsh.requeridoM, 2)} m`}`}
          />
        )}
      </ul>

      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2">
          <span>Altitude do local (m)</span>
          <input type="number" min={0} step={10} value={hb.altitudeM} onChange={(e) => { const x = Number(e.target.value); if (Number.isFinite(x) && x >= 0) onHb({ ...hb, altitudeM: x }); }} aria-label="Altitude do local (m)" className={campo} />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span>Perda na sucção (m)</span>
          <input type="number" min={0} step={0.1} value={hb.perdaNaSuccaoM} onChange={(e) => { const x = Number(e.target.value); if (Number.isFinite(x) && x >= 0) onHb({ ...hb, perdaNaSuccaoM: x }); }} aria-label="Perda na sucção (m)" className={campo} />
        </label>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold text-slate-700">Bombas cadastradas que atendem</h4>
        {candidatas.length === 0 ? (
          <p className="text-xs text-slate-500" data-testid="bomba-sem-candidatas">
            Nenhuma bomba cadastrada atende este ponto. Salve bombas como tipo (com a curva do catálogo) no painel da bomba para elas aparecerem aqui.
          </p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-700" data-testid="bomba-candidatas">
            {candidatas.map(({ candidata, folgaM }) => (
              <li key={candidata.id} className="flex items-center justify-between gap-2">
                <span>
                  {candidata.nome} <span className="text-slate-500">— folga {n(folgaM)} m{a.projeto ? ` · ${n(alturaDaBombaM(candidata.curva, a.projeto.vazaoLmin) ?? 0)} m no projeto` : ''}</span>
                </span>
                <button type="button" onClick={() => onAplicar(candidata)} className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">
                  Aplicar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

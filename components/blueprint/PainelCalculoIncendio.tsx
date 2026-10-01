/**
 * INCÊNDIO — o cálculo hidráulico (30/09/2026, E2.3 do roadmap de incêndio):
 * as premissas do estudo, o que a bomba tem de dar, os hidrantes abertos com o
 * ponto de equilíbrio, os mais desfavoráveis e a planilha dos trechos. Tudo
 * derivado do desenho (`blueprintCalculoIncendio`); só as premissas gravam.
 */
import React from 'react';
import type { ObjectId } from '../../utils/blueprintKernel';
import { FORMULAS_DE_PERDA, ROTULO_DA_FORMULA, type FormulaDePerda } from '../../utils/blueprintHidraulicaIncendio';
import { ROTULO_DO_PAPEL, type CalculoDeIncendio, type HipotesesHidraulicasDeIncendio } from '../../utils/blueprintCalculoIncendio';
import { FICHA_DO_MATERIAL } from '../../utils/blueprintHidraulicaPressao';
import type { EstadoDaConferencia, ItemDaConferencia } from '../../utils/blueprintConferenciaIncendio';

interface Props {
  hip: HipotesesHidraulicasDeIncendio;
  onHip: (h: HipotesesHidraulicasDeIncendio) => void;
  calculo: CalculoDeIncendio;
  /** O nome que a planta escreve (H-2, SPK-3) — o id cru não diz nada. */
  nomeDe: (id: ObjectId) => string;
  onSelecionar: (ids: string[]) => void;
  /** Quantos trechos o ajuste de DN mudaria, e o gatilho. */
  ajusteDeDn: { alterados: number; onAjustar: () => void };
  /** E2.4: a conferência em três estados + "não avaliada". Ausente = não mostrar. */
  conferencia?: ItemDaConferencia[];
}

const ESTADO: Record<EstadoDaConferencia, { rotulo: string; cor: string }> = {
  ATENDE: { rotulo: 'Atende', cor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FALTA: { rotulo: 'Falta', cor: 'bg-red-50 text-red-700 border-red-200' },
  NAO_AVALIADO: { rotulo: 'Não avaliado', cor: 'bg-slate-50 text-slate-600 border-slate-200' },
};

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const n = (v: number, casas = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

function Numero({ rotulo, valor, onValor, passo, unidade }: { rotulo: string; valor: number; onValor: (v: number) => void; passo: number; unidade: string }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>
        {rotulo} <span className="text-slate-400">({unidade})</span>
      </span>
      <input
        type="number"
        min={0}
        step={passo}
        value={valor}
        onChange={(e) => {
          const x = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(x) && x > 0) onValor(x);
        }}
        aria-label={`${rotulo} (${unidade})`}
        className={`w-20 ${campo}`}
      />
    </label>
  );
}

export default function PainelCalculoIncendio({ hip, onHip, calculo: c, nomeDe, onSelecionar, ajusteDeDn, conferencia }: Props) {
  const set = <K extends keyof HipotesesHidraulicasDeIncendio>(k: K) => (v: HipotesesHidraulicasDeIncendio[K]) => onHip({ ...hip, [k]: v });
  const cen = c.cenario;
  const acimaDaMaxima = [...c.estaticaKpa].filter(([, p]) => p > hip.pressaoMaximaKpa);
  const motivoDoAjuste = !cen ? 'sem cálculo — veja o aviso acima' : ajusteDeDn.alterados === 0 ? `nenhum trecho passa de ${n(hip.velocidadeMaxMs)} m/s` : null;

  return (
    <div className="space-y-3" data-testid="calculo-incendio">
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
        Vazões, pressões, simultaneidade e mangueira são <strong>pontos de partida</strong> — CONFERIR na NBR 13714 e na IT
        do CBMMG antes de emitir.
      </p>

      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2 sm:col-span-2">
          <span>Fórmula de perda de carga</span>
          <select value={hip.formula} onChange={(e) => set('formula')(e.target.value as FormulaDePerda)} aria-label="Fórmula de perda de carga" className={campo}>
            {FORMULAS_DE_PERDA.map((f) => (
              <option key={f} value={f}>{ROTULO_DA_FORMULA[f]}</option>
            ))}
          </select>
        </label>
        <Numero rotulo="Hidrantes simultâneos" unidade="un" passo={1} valor={hip.hidrantesSimultaneos} onValor={(v) => set('hidrantesSimultaneos')(Math.max(1, Math.round(v)))} />
        <Numero rotulo="Velocidade máxima" unidade="m/s" passo={0.5} valor={hip.velocidadeMaxMs} onValor={set('velocidadeMaxMs')} />
        <Numero rotulo="Hidrante — vazão mínima" unidade="L/min" passo={10} valor={hip.vazaoMinimaHidranteLmin} onValor={set('vazaoMinimaHidranteLmin')} />
        <Numero rotulo="Hidrante — pressão no esguicho" unidade="kPa" passo={10} valor={hip.pressaoMinimaHidranteKpa} onValor={set('pressaoMinimaHidranteKpa')} />
        <Numero rotulo="Hidrante — mangueira" unidade="m" passo={5} valor={hip.comprimentoMangueiraHidranteM} onValor={set('comprimentoMangueiraHidranteM')} />
        <Numero rotulo="Hidrante — Ø mangueira" unidade="mm" passo={1} valor={hip.diametroMangueiraHidranteMm} onValor={set('diametroMangueiraHidranteMm')} />
        <Numero rotulo="Mangotinho — vazão mínima" unidade="L/min" passo={10} valor={hip.vazaoMinimaMangotinhoLmin} onValor={set('vazaoMinimaMangotinhoLmin')} />
        <Numero rotulo="Mangotinho — pressão no esguicho" unidade="kPa" passo={10} valor={hip.pressaoMinimaMangotinhoKpa} onValor={set('pressaoMinimaMangotinhoKpa')} />
        <Numero rotulo="Pressão máxima na rede" unidade="kPa" passo={50} valor={hip.pressaoMaximaKpa} onValor={set('pressaoMaximaKpa')} />
        <Numero rotulo="Sprinkler — pressão mínima" unidade="kPa" passo={5} valor={hip.pressaoMinimaSprinklerKpa} onValor={set('pressaoMinimaSprinklerKpa')} />
        <Numero rotulo="Autonomia da reserva" unidade="min" passo={5} valor={hip.autonomiaMin} onValor={set('autonomiaMin')} />
      </div>

      {c.motivo && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800" data-testid="calculo-incendio-motivo">
          {c.motivo}
        </p>
      )}
      {c.desligados.length > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          {c.desligados.length} peça(s) de incêndio sem tubo chegando nelas ficaram fora do cálculo:{' '}
          <button type="button" className="text-blue-700 hover:underline" onClick={() => onSelecionar(c.desligados)}>
            selecionar
          </button>
        </p>
      )}

      {cen && (c.porGravidade || c.cargaNecessariaM != null) && (
        <>
          {c.porGravidade ? (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="calculo-incendio-gravidade">
              Por gravidade, a caixa de incêndio entrega <strong className="tabular-nums">{n(cen.vazaoNaFonteLmin, 0)} L/min</strong> com{' '}
              {c.abertos.length} hidrante(s) aberto(s).{' '}
              {cen.terminais.every((t) => t.atende)
                ? 'Atende.'
                : c.cargaNecessariaM == null
                  ? 'Nem uma caixa muito mais alta atenderia — a rede precisa de bomba.'
                  : `Não atende: a água teria de estar ${n(c.cargaNecessariaM, 1)} m acima do fundo da caixa — subir a caixa ou pôr bomba.`}
            </p>
          ) : (
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="calculo-incendio-bomba">
              A bomba precisa dar <strong className="tabular-nums">{n(cen.vazaoNaFonteLmin, 0)} L/min</strong> a{' '}
              <strong className="tabular-nums">{n(c.cargaNecessariaM ?? 0, 1)} mca</strong> ({n((c.cargaNecessariaM ?? 0) * 9.80665, 0)} kPa) acima dela, com{' '}
              {c.abertos.length} hidrante(s) aberto(s) — os mais desfavoráveis.
            </p>
          )}
          {c.rti.exigidaL != null && (
            <p className="text-xs text-slate-700" data-testid="calculo-incendio-rti">
              Reserva técnica: {n(c.rti.exigidaL, 0)} L exigidos ({n(cen.vazaoNaFonteLmin, 0)} L/min × {hip.autonomiaMin} min) · {n(c.rti.disponivelL, 0)} L desenhados{' '}
              <span className={c.rti.disponivelL + 1e-6 >= c.rti.exigidaL ? 'text-emerald-700' : 'font-semibold text-red-700'}>
                {c.rti.disponivelL + 1e-6 >= c.rti.exigidaL ? '— atende' : `— faltam ${n(c.rti.exigidaL - c.rti.disponivelL, 0)} L`}
              </span>
            </p>
          )}

          <table className="w-full text-xs" data-testid="calculo-incendio-abertos">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">Aberto</th>
                <th className="py-1 pr-2 text-right font-medium">Vazão</th>
                <th className="py-1 pr-2 text-right font-medium">Válvula</th>
                <th className="py-1 pr-2 text-right font-medium">Esguicho</th>
                <th className="py-1 text-right font-medium">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {cen.terminais.map((t) => (
                <tr key={t.terminalId} className="border-b border-slate-100 text-slate-700">
                  <td className="py-1.5 pr-2">
                    <button type="button" onClick={() => onSelecionar([t.terminalId])} className="text-left text-blue-700 hover:underline">
                      {nomeDe(t.terminalId)}
                    </button>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{n(t.vazaoLmin, 1)} L/min</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{n(t.pressaoNoKpa, 0)} kPa</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{n(t.pressaoNoBicoKpa, 0)} kPa</td>
                  <td className={`py-1.5 text-right tabular-nums ${t.atende ? 'text-emerald-700' : 'text-red-700'}`}>
                    {t.exigidoLmin != null ? `${n(t.exigidoLmin, 0)} L/min` : `${n(t.exigidoKpa ?? 0, 0)} kPa`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-xs text-slate-600">
            Mais desfavoráveis (carga que cada um, sozinho, exigiria):{' '}
            {c.desfavoraveis.slice(0, 5).map((d, i) => (
              <span key={d.terminalId}>
                {i > 0 && ' · '}
                <button type="button" className="text-blue-700 hover:underline" onClick={() => onSelecionar([d.terminalId])}>
                  {nomeDe(d.terminalId)}
                </button>{' '}
                {d.cargaM != null ? `${n(d.cargaM, 1)} m` : 'não atende'}
              </span>
            ))}
          </p>

          {acimaDaMaxima.length > 0 && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-800" data-testid="calculo-incendio-pressao-maxima">
              Pressão estática acima de {n(hip.pressaoMaximaKpa, 0)} kPa em {acimaDaMaxima.map(([id]) => nomeDe(id)).join(', ')} — prever válvula
              redutora ou dividir a rede.
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-700">Trechos</h4>
            <button
              type="button"
              onClick={ajusteDeDn.onAjustar}
              disabled={!!motivoDoAjuste}
              title={motivoDoAjuste ?? 'Sobe o DN dos trechos acima da velocidade máxima até passarem — um passo de desfazer'}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ajustar DN pela velocidade{ajusteDeDn.alterados > 0 ? ` (${ajusteDeDn.alterados})` : ''}
            </button>
          </div>
          {motivoDoAjuste && cen && <p className="text-[11px] text-slate-500">Ajuste de DN: {motivoDoAjuste}.</p>}
          <table className="w-full text-xs" data-testid="calculo-incendio-trechos">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">Papel</th>
                <th className="py-1 pr-2 font-medium">DN</th>
                <th className="py-1 pr-2 text-right font-medium">L + Leq</th>
                <th className="py-1 pr-2 text-right font-medium">Vazão</th>
                <th className="py-1 pr-2 text-right font-medium">V</th>
                <th className="py-1 text-right font-medium">Perda</th>
              </tr>
            </thead>
            <tbody>
              {cen.trechos.map((t) => (
                <tr key={t.trechoId} className="border-b border-slate-100 text-slate-700">
                  <td className="py-1.5 pr-2">
                    <button type="button" onClick={() => onSelecionar([t.trechoId])} className="text-left text-blue-700 hover:underline">
                      {ROTULO_DO_PAPEL[c.papel.get(t.trechoId) ?? 'RAMAL']}
                    </button>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {t.dn} · {FICHA_DO_MATERIAL[t.material].rotulo}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {n(t.lM, 1)} + {n(t.leqM, 1)} m
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{n(t.vazaoLmin, 0)} L/min</td>
                  <td className={`py-1.5 pr-2 text-right tabular-nums ${t.velocidadeMs > hip.velocidadeMaxMs ? 'font-semibold text-red-700' : ''}`}>{n(t.velocidadeMs, 2)} m/s</td>
                  <td className="py-1.5 text-right tabular-nums">{n(t.perdaMca, 2)} mca</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {conferencia && conferencia.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-slate-700">Conferência</h4>
          <table className="w-full text-xs" data-testid="calculo-incendio-conferencia">
            <tbody>
              {conferencia.map((i) => (
                <tr key={`${i.grupo}|${i.item}`} className="border-b border-slate-100 align-top text-slate-700">
                  <td className="py-1.5 pr-2">
                    <span className="text-slate-400">{i.grupo} · </span>
                    {i.alvos.length > 0 ? (
                      <button type="button" className="text-left text-blue-700 hover:underline" onClick={() => onSelecionar(i.alvos)}>
                        {i.item}
                      </button>
                    ) : (
                      i.item
                    )}
                    <div className="text-[11px] text-slate-500">
                      exigido {i.exigido} · obtido {i.obtido}
                    </div>
                  </td>
                  <td className="py-1.5 text-right">
                    <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 ${ESTADO[i.estado].cor}`}>{ESTADO[i.estado].rotulo}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Método do gradiente (o do EPANET): resolve anel e malha. Cada hidrante aberto é mangueira + esguicho; o esguicho dá
        a vazão mínima na pressão mínima, e o mais próximo da bomba recebe mais — o ponto de equilíbrio sai do cálculo.
      </p>
    </div>
  );
}

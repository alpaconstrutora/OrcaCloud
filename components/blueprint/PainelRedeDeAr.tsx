/**
 * DUTOS E VENTILAÇÃO (05/10/2026, E7 do roadmap de climatização): as hipóteses da
 * rede de ar (toda folga editável), cada rede (raiz → terminais) com vazão, perda
 * do caminho crítico × pressão disponível e o balanceamento por terminal, a
 * ventilação por ambiente (exaustão e renovação), "Ajustar seções" (o
 * dimensionamento num lote), Lançar/Aceitar o traçado e a conferência em 3
 * estados. Molde: `PainelVrf`.
 */
import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import type { ObjectId } from '../../utils/blueprintKernel';
import type { HipotesesDoAr } from '../../utils/blueprintClimatizacao';
import { FONTE_DO_AR, LIMITES_DO_AR } from '../../utils/blueprintClimatizacao';
import type { PlanoDaRedeDeAr, RedeDeAr, VentilacaoDoAmbiente } from '../../utils/blueprintRedeDeAr';
import type { EstadoDaConferencia, ItemConferido } from '../../utils/blueprintConferenciaClimatizacao';

interface Props {
  redes: RedeDeAr[];
  ventilacao: VentilacaoDoAmbiente[];
  plano: PlanoDaRedeDeAr;
  conferencia: ItemConferido[];
  hip: HipotesesDoAr;
  onHip: (h: HipotesesDoAr) => void;
  /** Quantos trechos o "Ajustar seções" mudaria. */
  ajustes: number;
  onAjustar: () => void;
  sugeridos: ObjectId[];
  onLancar: () => void;
  onAceitar: (ids: ObjectId[]) => void;
  onSelecionar?: (ids: string[]) => void;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const botao = 'rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50';
const um = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const ROTULOS: Record<keyof typeof LIMITES_DO_AR, string> = {
  velocidadeTroncoMs: 'Velocidade no tronco (m/s)',
  velocidadeRamalMs: 'Velocidade no ramal (m/s)',
  perdaPorAtritoPaM: 'Igual atrito (Pa/m)',
  alturaPadraoMm: 'Altura do duto retangular (mm)',
  folgaSobVigaMm: 'Folga sob a viga (mm)',
  dtInsuflamentoK: 'ΔT de insuflamento (K)',
  pressaoDisponivelPa: 'Pressão disponível (Pa)',
  perdaTerminalPa: 'Perda no terminal (Pa)',
  kCurva: 'K da curva',
  kTe: 'K do tê',
  renovacaoPorPessoaLs: 'Renovação por pessoa (L/s)',
  renovacaoPorAreaLsM2: 'Renovação por área (L/s·m²)',
  exaustaoBanheiroM3h: 'Exaustão do banheiro (m³/h)',
  exaustaoCozinhaM3h: 'Exaustão da cozinha (m³/h)',
  exaustaoGaragemTrocasH: 'Exaustão da garagem (trocas/h)',
};

function IconeDoEstado({ estado }: { estado: EstadoDaConferencia }) {
  if (estado === 'OK') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="ok" />;
  if (estado === 'NAO_AVALIADO') return <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-label="não avaliado" />;
  return <AlertTriangle className={`h-3.5 w-3.5 ${estado === 'FALTA' ? 'text-red-600' : 'text-amber-600'}`} aria-label={estado === 'FALTA' ? 'falta' : 'aviso'} />;
}

export default function PainelRedeDeAr({ redes, ventilacao, plano, conferencia, hip, onHip, ajustes, onAjustar, sugeridos, onLancar, onAceitar, onSelecionar }: Props) {
  const motivoDeLancar = plano.motivo ?? (plano.aCriar.length === 0 && plano.apagados === 0 ? 'nada a lançar' : null);
  const relevantes = ventilacao.filter((v) => v.exaustaoM3h > 0 || v.climatizado);
  return (
    <div className="space-y-3" data-testid="rede-de-ar">
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2">
          <span>Dimensionamento</span>
          <select value={hip.metodo} onChange={(e) => onHip({ ...hip, metodo: e.target.value as HipotesesDoAr['metodo'] })} aria-label="Método de dimensionamento" className={`w-36 ${campo}`}>
            <option value="VELOCIDADE">Por velocidade</option>
            <option value="IGUAL_ATRITO">Por igual atrito</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          <span>Seção dos dutos novos</span>
          <select value={hip.secaoPadrao} onChange={(e) => onHip({ ...hip, secaoPadrao: e.target.value as HipotesesDoAr['secaoPadrao'] })} aria-label="Seção dos dutos novos" className={`w-36 ${campo}`}>
            <option value="RETANGULAR">Retangular</option>
            <option value="REDONDA">Redonda</option>
          </select>
        </label>
        {(Object.keys(ROTULOS) as (keyof typeof LIMITES_DO_AR)[]).map((k) => (
          <label key={k} className="flex items-center justify-between gap-2">
            <span>{ROTULOS[k]}</span>
            <input
              type="number"
              min={LIMITES_DO_AR[k].min}
              max={LIMITES_DO_AR[k].max}
              step={LIMITES_DO_AR[k].max <= 5 ? 0.1 : 1}
              value={hip[k]}
              onChange={(e) => {
                const x = Number(e.target.value);
                if (Number.isFinite(x) && x >= LIMITES_DO_AR[k].min && x <= LIMITES_DO_AR[k].max) onHip({ ...hip, [k]: x });
              }}
              aria-label={ROTULOS[k]}
              className={`w-24 ${campo}`}
            />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">{FONTE_DO_AR}</p>

      {redes.length > 0 && (
        <div className="space-y-2" data-testid="redes-de-ar">
          {redes.map((r) => (
            <div key={r.raiz.id} className="rounded-md border border-slate-200 px-3 py-2 text-xs" aria-label={`Rede de ${r.raiz.tipo}`}>
              <p className="flex flex-wrap items-center gap-x-3">
                <button type="button" className="font-medium text-slate-800 hover:underline" onClick={() => onSelecionar?.([r.raiz.id])}>
                  {r.raiz.tipo}
                </button>
                <span>{r.terminais.length} terminal(is)</span>
                <span className="tabular-nums">{r.vazaoTotalM3h.toLocaleString('pt-BR')} m³/h</span>
                <span className={`tabular-nums ${r.atende ? 'text-emerald-700' : 'text-red-700'}`}>
                  perda crítica {um(r.perdaCriticaPa)} Pa / disponível {r.pressaoDisponivelPa} Pa
                </span>
              </p>
              <table className="mt-1 w-full">
                <thead>
                  <tr className="text-left text-[11px] text-slate-500">
                    <th className="py-0.5 pr-2 font-medium">Terminal</th>
                    <th className="py-0.5 pr-2 text-right font-medium">Vazão</th>
                    <th className="py-0.5 pr-2 font-medium">Origem</th>
                    <th className="py-0.5 pr-2 text-right font-medium">Perda</th>
                    <th className="py-0.5 text-right font-medium">Damper absorve</th>
                  </tr>
                </thead>
                <tbody>
                  {r.terminais.map((t) => (
                    <tr key={t.terminalId} className="border-t border-slate-100">
                      <td className="py-0.5 pr-2">
                        <button type="button" className="hover:underline" onClick={() => onSelecionar?.([t.terminalId])}>
                          {t.nome}
                        </button>
                      </td>
                      <td className="py-0.5 pr-2 text-right tabular-nums">{t.vazao.vazaoM3h.toLocaleString('pt-BR')} m³/h</td>
                      <td className={`py-0.5 pr-2 ${t.vazao.origem === 'SEM' ? 'text-red-700' : 'text-slate-500'}`} title={t.vazao.memoria}>
                        {t.vazao.origem === 'DECLARADA' ? 'declarada' : t.vazao.origem === 'DERIVADA' ? 'derivada' : 'sem vazão'}
                      </td>
                      <td className="py-0.5 pr-2 text-right tabular-nums">{um(t.perdaPa)} Pa</td>
                      <td className="py-0.5 text-right tabular-nums">{um(t.excessoPa)} Pa</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {relevantes.length > 0 && (
        <table className="w-full text-xs" data-testid="ventilacao">
          <thead>
            <tr className="text-left text-[11px] text-slate-500">
              <th className="py-1 pr-2 font-medium">Ambiente</th>
              <th className="py-1 pr-2 font-medium">Janela</th>
              <th className="py-1 pr-2 text-right font-medium">Exaustão</th>
              <th className="py-1 pr-2 text-right font-medium">Renovação</th>
              <th className="py-1 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {relevantes.map((v) => (
              <tr key={v.spaceId} className="border-t border-slate-100 align-top">
                <td className="py-1 pr-2">
                  <button type="button" className="text-left hover:underline" onClick={() => onSelecionar?.([v.spaceId])}>
                    {v.nome}
                  </button>
                </td>
                <td className="py-1 pr-2">{v.temJanela ? 'sim' : 'não'}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{v.exaustaoM3h > 0 ? `${v.exaustaoM3h} m³/h · ${v.exaustores} exaustor(es)` : '—'}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{v.climatizado ? `${v.renovacaoM3h} m³/h` : '—'}</td>
                <td className={`py-1 ${v.falta ? 'text-red-700' : v.aviso ? 'text-amber-700' : 'text-emerald-700'}`}>{v.falta ?? v.aviso ?? 'ok'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {plano.motivo ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="rede-de-ar-motivo">
          {plano.motivo}
        </p>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="rede-de-ar-resumo">
          {plano.aCriar.length > 0 ? (
            <>
              <p>
                Lança <strong>{plano.aCriar.length}</strong> rede(s) em espinha no forro, com a seção de cada trecho pela vazão a jusante — um passo, Ctrl+Z desfaz.
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {plano.resumo.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Nenhuma rede a lançar.</p>
          )}
          {plano.apagados > 0 && <p className="mt-1 text-slate-600">Relançar troca os {plano.apagados} trechos ainda sugeridos.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onLancar} disabled={!!motivoDeLancar} title={motivoDeLancar ?? 'Lança a rede de dutos sugerida num passo só — Ctrl+Z desfaz'} className={`${botao} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>
          {plano.apagados > 0 ? 'Relançar os dutos' : 'Lançar os dutos'}
        </button>
        <button
          type="button"
          onClick={onAjustar}
          disabled={ajustes === 0}
          title={ajustes === 0 ? 'todos os trechos já têm a seção proposta para a vazão deles' : `Leva ${ajustes} trecho(s) à seção proposta pelo método — um passo, Ctrl+Z desfaz`}
          className={`${botao} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
        >
          Ajustar seções{ajustes > 0 ? ` (${ajustes})` : ''}
        </button>
        <button
          type="button"
          onClick={() => onAceitar(sugeridos)}
          disabled={sugeridos.length === 0}
          title={sugeridos.length === 0 ? 'não há duto sugerido para aceitar' : 'Confirma os dutos sugeridos — relançar não mexe mais neles'}
          className={`${botao} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
        >
          Aceitar{sugeridos.length > 0 ? ` (${sugeridos.length})` : ''}
        </button>
      </div>
      {motivoDeLancar && !plano.motivo && <p className="text-[11px] text-slate-500">Lançar: {motivoDeLancar}.</p>}

      <div data-testid="rede-de-ar-conferencia">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Conferência</p>
        <ul className="mt-1 space-y-1 text-xs">
          {conferencia.map((c) => (
            <li key={c.codigo} className="flex items-start gap-1.5">
              <span className="mt-0.5">
                <IconeDoEstado estado={c.estado} />
              </span>
              <span>
                <span className="text-slate-800">{c.item}</span>
                <span className="text-slate-500"> — </span>
                {c.spaceIds.length > 0 && onSelecionar ? (
                  <button type="button" className="text-blue-700 hover:underline" onClick={() => onSelecionar(c.spaceIds)}>
                    {c.obtido}
                  </button>
                ) : (
                  <span className="text-slate-600">{c.obtido}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

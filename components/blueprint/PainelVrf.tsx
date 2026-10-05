/**
 * VRF (05/10/2026, E6 do roadmap de climatização): os limites do sistema
 * (hipóteses de catálogo), cada condensadora VRF com as evaporadoras dela (taxa
 * de combinação, comprimentos, derivações), ligar as evaporadoras sem sistema,
 * trocar a condensadora, lançar/aceitar a árvore e a conferência em 3 estados.
 * Molde: `PainelLinhaFrigorigena`.
 */
import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import type { ObjectId } from '../../utils/blueprintKernel';
import type { HipotesesDoVrf } from '../../utils/blueprintClimatizacao';
import { LIMITES_DO_VRF } from '../../utils/blueprintClimatizacao';
import { FONTE_DO_VRF, type AnaliseDoVrf, type PlanoDoVrf } from '../../utils/blueprintVrf';
import type { EstadoDaConferencia, ItemConferido } from '../../utils/blueprintConferenciaClimatizacao';

interface Props {
  analises: AnaliseDoVrf[];
  plano: PlanoDoVrf;
  conferencia: ItemConferido[];
  hip: HipotesesDoVrf;
  onHip: (h: HipotesesDoVrf) => void;
  /** Evaporadoras do pavimento sem condensadora — o que "ligar" pega. */
  semSistema: ObjectId[];
  /** As condensadoras do pavimento (nome = número), para trocar a do sistema. */
  condensadoras: { id: ObjectId; nome: string }[];
  onLigar: (condensadoraId: ObjectId) => void;
  onTrocar: (deId: ObjectId, paraId: ObjectId) => void;
  sugeridos: { trechos: ObjectId[]; terminais: ObjectId[] };
  onLancar: () => void;
  onAceitar: (s: { trechos: ObjectId[]; terminais: ObjectId[] }) => void;
  onSelecionar?: (ids: string[]) => void;
}

const campo = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums';
const botao = 'rounded-md border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50';
const m1 = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m`);
const btu = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR'));

const ROTULOS: Record<keyof HipotesesDoVrf, string> = {
  taxaMinPct: 'Taxa mínima (%)',
  taxaMaxPct: 'Taxa máxima (%)',
  comprimentoTotalMaxM: 'Comprimento total máx. (m)',
  ateMaisDistanteMaxM: 'Até a mais distante máx. (m)',
  aposPrimeiraDerivacaoMaxM: 'Após a 1ª derivação máx. (m)',
  desnivelCondEvapMaxM: 'Desnível cond.–evap. máx. (m)',
  desnivelEntreEvapMaxM: 'Desnível entre evap. máx. (m)',
};

function IconeDoEstado({ estado }: { estado: EstadoDaConferencia }) {
  if (estado === 'OK') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="ok" />;
  if (estado === 'NAO_AVALIADO') return <HelpCircle className="h-3.5 w-3.5 text-slate-400" aria-label="não avaliado" />;
  return <AlertTriangle className={`h-3.5 w-3.5 ${estado === 'FALTA' ? 'text-red-600' : 'text-amber-600'}`} aria-label={estado === 'FALTA' ? 'falta' : 'aviso'} />;
}

export default function PainelVrf({ analises, plano, conferencia, hip, onHip, semSistema, condensadoras, onLigar, onTrocar, sugeridos, onLancar, onAceitar, onSelecionar }: Props) {
  const motivoDeLancar = plano.motivo ?? (plano.aCriar.length === 0 && plano.apagados === 0 ? 'nada a lançar' : null);
  const totalSugerido = sugeridos.trechos.length + sugeridos.terminais.length;
  return (
    <div className="space-y-3" data-testid="vrf">
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-slate-600 sm:grid-cols-2">
        {(Object.keys(ROTULOS) as (keyof HipotesesDoVrf)[]).map((k) => (
          <label key={k} className="flex items-center justify-between gap-2">
            <span>{ROTULOS[k]}</span>
            <input
              type="number"
              min={LIMITES_DO_VRF[k].min}
              max={LIMITES_DO_VRF[k].max}
              step={k.endsWith('Pct') ? 5 : 1}
              value={hip[k]}
              onChange={(e) => {
                const x = Number(e.target.value);
                if (Number.isFinite(x) && x >= LIMITES_DO_VRF[k].min && x <= LIMITES_DO_VRF[k].max) onHip({ ...hip, [k]: x });
              }}
              aria-label={ROTULOS[k]}
              className={`w-24 ${campo}`}
            />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">{FONTE_DO_VRF}</p>

      {analises.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="vrf-vazio">
          Nenhuma condensadora VRF neste pavimento — insira uma em Climatização — equipamentos (Condensadora VRF) e ligue as evaporadoras a ela.
        </p>
      ) : (
        <table className="w-full text-xs" data-testid="tabela-vrf">
          <thead>
            <tr className="text-left text-[11px] text-slate-500">
              <th className="py-1 pr-2 font-medium">Sistema</th>
              <th className="py-1 pr-2 text-right font-medium">Evap.</th>
              <th className="py-1 pr-2 text-right font-medium">Σ / cond. (BTU/h)</th>
              <th className="py-1 pr-2 text-right font-medium">Taxa</th>
              <th className="py-1 pr-2 text-right font-medium">Total</th>
              <th className="py-1 pr-2 text-right font-medium">Mais distante</th>
              <th className="py-1 pr-2 text-right font-medium">Após 1ª</th>
              <th className="py-1 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {analises.map((a) => {
              const c = a.sistema.condensadora;
              const outras = condensadoras.filter((x) => x.id !== c.id);
              return (
                <tr key={c.id} className="border-t border-slate-100 align-top" aria-label={`Sistema ${a.sistema.nome}`}>
                  <td className="py-1 pr-2">
                    <button type="button" className="text-left font-medium text-slate-800 hover:underline" onClick={() => onSelecionar?.([c.id, ...a.sistema.evaporadoras.map((e) => e.id)])}>
                      {a.sistema.nome}
                    </button>
                    <p className="text-[10px] text-slate-500">
                      {a.derivacoes.length} derivação(ões){a.naoAlcancadas.length ? ` · ${a.naoAlcancadas.length} sem rede` : ''}
                    </p>
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{a.sistema.evaporadoras.length}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {btu(a.somaBtuH)} / {btu(a.capacidadeBtuH)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{a.taxaPct == null ? '—' : `${a.taxaPct.toLocaleString('pt-BR')} %`}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m1(a.comprimentoTotalM)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m1(a.maisDistanteM)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{m1(a.aposPrimeiraDerivacaoM)}</td>
                  <td className="py-1">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => onLigar(c.id)}
                        disabled={semSistema.length === 0}
                        title={semSistema.length === 0 ? 'não há evaporadora sem sistema neste pavimento' : `Liga as ${semSistema.length} evaporadora(s) sem condensadora a ${a.sistema.nome}`}
                        className={`${botao} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                      >
                        Ligar {semSistema.length} sem sistema
                      </button>
                      <select
                        value=""
                        disabled={outras.length === 0}
                        title={outras.length === 0 ? 'não há outra condensadora neste pavimento' : 'Passa todas as evaporadoras e derivadores deste sistema para outra condensadora'}
                        onChange={(e) => e.target.value && onTrocar(c.id, e.target.value)}
                        aria-label={`Trocar a condensadora de ${a.sistema.nome}`}
                        className={`${campo} disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <option value="">Trocar condensadora…</option>
                        {outras.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {plano.motivo ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="vrf-motivo">
          {plano.motivo}
        </p>
      ) : (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="vrf-resumo">
          {plano.aCriar.length > 0 ? (
            <>
              <p>
                Lança <strong>{plano.aCriar.length}</strong> árvore(s) pela parede, com um derivador em cada divisão e o diâmetro de cada trecho pelo que fica a jusante — um passo, Ctrl+Z desfaz.
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {plano.resumo.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Nenhuma árvore a lançar.</p>
          )}
          {plano.jaLigados.length > 0 && <p className="mt-1 text-slate-600">Já ligados (rede confirmada): {plano.jaLigados.join(', ')}.</p>}
          {plano.semLugar.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-amber-800">
              {plano.semLugar.map((s) => (
                <li key={`${s.nome}-${s.motivo}`}>
                  {s.nome}: {s.motivo}
                </li>
              ))}
            </ul>
          )}
          {plano.apagados > 0 && <p className="mt-1 text-slate-600">Relançar troca os {plano.apagados} trechos/derivadores ainda sugeridos.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onLancar} disabled={!!motivoDeLancar} title={motivoDeLancar ?? 'Lança a árvore do VRF num passo só — Ctrl+Z desfaz'} className={`${botao} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>
          {plano.apagados > 0 ? 'Relançar a rede VRF' : 'Lançar a rede VRF'}
        </button>
        <button
          type="button"
          onClick={() => onAceitar(sugeridos)}
          disabled={totalSugerido === 0}
          title={totalSugerido === 0 ? 'não há trecho ou derivador do VRF sugerido para aceitar' : 'Confirma o sugerido — relançar não mexe mais nele'}
          className={`${botao} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
        >
          Aceitar{totalSugerido > 0 ? ` (${totalSugerido})` : ''}
        </button>
      </div>
      {motivoDeLancar && !plano.motivo && <p className="text-[11px] text-slate-500">Lançar: {motivoDeLancar}.</p>}

      <div data-testid="vrf-conferencia">
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
                <span className="text-slate-600">{c.obtido}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

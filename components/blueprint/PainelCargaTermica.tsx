/**
 * CARGA TÉRMICA (04/10/2026, E2.3 da climatização): o resultado do motor para o
 * pavimento ativo — condições em uso, uma linha por ambiente (W/m², sensível,
 * latente, total em W e BTU/h), as parcelas com a memória de cada uma ao abrir,
 * a conferência em três estados e o aviso de CONFERIR enquanto houver hipótese.
 * Tudo derivado; nada aqui grava.
 */
import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, HelpCircle, Sun } from 'lucide-react';
import type { ObjectId } from '../../utils/blueprintKernel';
import type { CargaDoAmbiente, CargaTermicaDoNivel, Parcela } from '../../utils/blueprintCargaTermica';
import { conferenciaDeCargaTermica, type EstadoDaConferencia } from '../../utils/blueprintConferenciaClimatizacao';

interface Props {
  nivel: CargaTermicaDoNivel;
  nomeDoPavimento: string;
  /** Soma de todos os pavimentos, quando há mais de um. */
  estudo?: { pavimentos: number; totalW: number; totalBtuH: number };
  onSelecionar?: (spaceIds: ObjectId[]) => void;
}

const n0 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ESTADO: Record<EstadoDaConferencia, { rotulo: string; classe: string; Icone: typeof CheckCircle2 }> = {
  OK: { rotulo: 'OK', classe: 'text-emerald-700', Icone: CheckCircle2 },
  AVISO: { rotulo: 'Aviso', classe: 'text-amber-700', Icone: AlertTriangle },
  FALTA: { rotulo: 'Falta', classe: 'text-red-700', Icone: AlertTriangle },
  NAO_AVALIADO: { rotulo: 'Não avaliado', classe: 'text-slate-500', Icone: HelpCircle },
};

function LinhaDeParcela({ rotulo, p }: { rotulo: string; p: Parcela }) {
  const marca = p.origem === 'HIPOTESE' ? ' *' : p.origem === 'NAO_AVALIADA' ? ' —' : '';
  return (
    <tr className="border-t border-slate-100">
      <td className="py-1 pr-2 text-slate-700">{rotulo}{marca}</td>
      <td className="py-1 pr-2 text-right tabular-nums">{p.origem === 'NAO_AVALIADA' ? '—' : n0(p.sensivelW)}</td>
      <td className="py-1 pr-2 text-right tabular-nums">{p.origem === 'NAO_AVALIADA' ? '—' : n0(p.latenteW)}</td>
      <td className="py-1 text-[11px] text-slate-500">{p.memoria}</td>
    </tr>
  );
}

function Parcelas({ a }: { a: CargaDoAmbiente }) {
  return (
    <table className="w-full text-xs" data-testid={`parcelas-${a.spaceId}`}>
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-1 pr-2 font-medium">Parcela</th>
          <th className="py-1 pr-2 text-right font-medium">Sensível (W)</th>
          <th className="py-1 pr-2 text-right font-medium">Latente (W)</th>
          <th className="py-1 font-medium">Como saiu</th>
        </tr>
      </thead>
      <tbody>
        {a.paredes.map((f) => (
          <LinhaDeParcela key={f.wallId} rotulo={`${f.descricao} · ${n1(f.areaLiquidaM2)} m²`} p={f.parcela} />
        ))}
        {a.vaos.map((v) => (
          <React.Fragment key={v.openingId}>
            <LinhaDeParcela rotulo={`${v.descricao} · condução`} p={v.conducao} />
            {v.insolacao.memoria !== 'porta opaca' && <LinhaDeParcela rotulo={`${v.descricao} · insolação`} p={v.insolacao} />}
          </React.Fragment>
        ))}
        <LinhaDeParcela rotulo="Teto" p={a.teto} />
        <LinhaDeParcela rotulo="Piso" p={a.piso} />
        <LinhaDeParcela rotulo="Pessoas" p={a.pessoas} />
        <LinhaDeParcela rotulo="Iluminação" p={a.iluminacao} />
        <LinhaDeParcela rotulo="Equipamentos" p={a.equipamentos} />
        <LinhaDeParcela rotulo="Fonte extra" p={a.fonteExtra} />
        <LinhaDeParcela rotulo="Infiltração" p={a.infiltracao} />
        <tr className="border-t border-slate-300 font-medium">
          <td className="py-1 pr-2 text-slate-800">Total</td>
          <td className="py-1 pr-2 text-right tabular-nums">{n0(a.sensivelW)}</td>
          <td className="py-1 pr-2 text-right tabular-nums">{n0(a.latenteW)}</td>
          <td className="py-1 text-[11px] text-slate-600">{n0(a.totalW)} W = {n0(a.totalBtuH)} BTU/h · {a.wPorM2} W/m² · {n1(a.volumeM3)} m³ a {n1(a.temperaturaInternaC)} °C</td>
        </tr>
      </tbody>
    </table>
  );
}

export default function PainelCargaTermica({ nivel: n, nomeDoPavimento, estudo, onSelecionar }: Props) {
  const [aberto, setAberto] = React.useState<ObjectId | null>(null);
  const conf = React.useMemo(() => conferenciaDeCargaTermica(n), [n]);
  const c = n.condicoes;
  const clim = n.ambientes.filter((a) => a.climatizado);
  return (
    <div className="space-y-3" data-testid="carga-termica">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <span className="inline-flex items-center gap-1">
          <Sun className="h-3.5 w-3.5 text-amber-500" /> Carga térmica de verão em <strong>{nomeDoPavimento}</strong>
        </span>
        <span data-testid="carga-condicoes">
          {c.cidade.valor ? `${c.cidade.valor} · ` : ''}TBS {c.tbsC.valor == null ? '—' : `${n1(c.tbsC.valor)} °C`} · TBU {c.tbuC.valor == null ? '—' : `${n1(c.tbuC.valor)} °C`} · ΔT {n.deltaTExternoK == null ? '—' : `${n1(n.deltaTExternoK)} K`}
        </span>
        <span className="ml-auto font-medium" data-testid="carga-total">
          {n0(n.totalW)} W · {n0(n.totalBtuH)} BTU/h
          {estudo && estudo.pavimentos > 1 ? <span className="ml-1.5 font-normal text-slate-500">(estudo: {n0(estudo.totalW)} W · {n0(estudo.totalBtuH)} BTU/h em {estudo.pavimentos} pavimentos)</span> : null}
        </span>
      </div>

      {n.conferir && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="carga-conferir">
          <strong>CONFERIR NA NORMA.</strong> Parcelas marcadas com * usam hipótese ou tabela transcrita de memória (NBR 16655-3, NBR 16401-1, NBR 15220). O número orienta o pré-dimensionamento; não aprova.
        </p>
      )}

      {clim.length === 0 ? (
        <p className="text-[11px] text-slate-500">Nenhum ambiente climatizado neste pavimento — declare nas premissas (ou nomeie os ambientes: sala, dormitório e escritório são climatizados pelo padrão do uso).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="tabela-carga-termica">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-2 font-medium">Ambiente</th>
                <th className="py-1 pr-2 text-right font-medium">Área (m²)</th>
                <th className="py-1 pr-2 text-right font-medium">W/m²</th>
                <th className="py-1 pr-2 text-right font-medium">Sensível (W)</th>
                <th className="py-1 pr-2 text-right font-medium">Latente (W)</th>
                <th className="py-1 pr-2 text-right font-medium">Total (W)</th>
                <th className="py-1 pr-2 text-right font-medium">BTU/h</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {clim.map((a) => (
                <React.Fragment key={a.spaceId}>
                  <tr className={`border-t border-slate-100 ${aberto === a.spaceId ? 'bg-blue-50/40' : ''}`} aria-label={`Carga de ${a.nome}`}>
                    <td className="py-1.5 pr-2">
                      <button type="button" onClick={() => onSelecionar?.([a.spaceId])} className="font-medium text-slate-800 hover:underline">{a.nome}</button>
                      {a.pendencias.length > 0 && <span className="ml-1 text-[10px] text-amber-800" title={a.pendencias.join('\n')}>⚠ {a.pendencias.length}</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{n1(a.areaPisoM2)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{a.wPorM2}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{n0(a.sensivelW)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{n0(a.latenteW)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{n0(a.totalW)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{n0(a.totalBtuH)}{a.conferir ? ' *' : ''}</td>
                    <td className="py-1.5 text-right">
                      <button type="button" onClick={() => setAberto(aberto === a.spaceId ? null : a.spaceId)} aria-label={`Parcelas de ${a.nome}`} className="inline-flex items-center rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50">
                        {aberto === a.spaceId ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} parcelas
                      </button>
                    </td>
                  </tr>
                  {aberto === a.spaceId && (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={8} className="px-2 py-2">
                        <Parcelas a={a} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              <tr className="border-t border-slate-300 font-medium">
                <td className="py-1.5 pr-2 text-slate-800">Pavimento</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{n1(clim.reduce((s, a) => s + a.areaPisoM2, 0))}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{(() => { const area = clim.reduce((s, a) => s + a.areaPisoM2, 0); return area > 0 ? Math.round(n.totalW / area) : '—'; })()}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{n0(n.totalSensivelW)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{n0(n.totalLatenteW)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{n0(n.totalW)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{n0(n.totalBtuH)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        * = parcela com hipótese; — = não avaliada. O mapa de calor na planta pinta cada ambiente pela densidade (azul ≤ 40 W/m² … vermelho ≥ 200). O AltoQi calcula e para aqui; a E4 escolhe o aparelho por catálogo e diz se atende.
      </p>

      <div className="space-y-1" data-testid="carga-conferencia">
        <p className="text-xs font-semibold text-slate-700">
          Conferência · {conf.fecha ? <span className="text-emerald-700">sem faltas</span> : <span className="text-red-700">{conf.faltas} falta(s)</span>}
          {conf.avisos > 0 && <span className="text-amber-700"> · {conf.avisos} aviso(s)</span>}
          {conf.naoAvaliados > 0 && <span className="text-slate-500"> · {conf.naoAvaliados} não avaliado(s)</span>}
        </p>
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white text-xs">
          {conf.itens.map((i) => {
            const E = ESTADO[i.estado];
            return (
              <li key={i.codigo} className="flex items-start gap-2 px-2 py-1.5">
                <E.Icone className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${E.classe}`} />
                <div className="min-w-0 flex-1">
                  <span className="text-slate-800">{i.item}</span>
                  <span className={`ml-1.5 ${E.classe}`}>{E.rotulo}</span>
                  <p className="text-[11px] text-slate-500">{i.obtido}</p>
                </div>
                {i.spaceIds.length > 0 && onSelecionar && (
                  <button type="button" onClick={() => onSelecionar(i.spaceIds)} className="shrink-0 text-[11px] text-blue-700 hover:underline">ver ({i.spaceIds.length})</button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

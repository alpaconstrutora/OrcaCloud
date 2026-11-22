import React from 'react';
import { Building2, HardHat, MapPin, Ruler, Users } from 'lucide-react';
import type { OportunidadeNaVitrine } from '../../utils/oportunidadeNumerosDaVersao';
import { OPPORTUNITY_STATUS_LABELS, OPPORTUNITY_TYPE_LABELS } from '../../services/investorPortalService';
import { InvestmentSimulator, podeSimular } from './InvestmentSimulator';

/**
 * A apresentação da oportunidade — UMA para o gestor (OpportunityDetail › Detalhes) e para o investidor
 * (portal › Apresentação). Fase C8 do plano docs/planos/2026-11-21-portal-do-investidor-consolidacao.md: o
 * investidor não via captação, ficha técnica, fotos, distâncias, equipe, simulador nem a obra.
 * Tudo aqui vem da versão publicada (naVitrine) e do empreendimento — nada digitado à parte, além de equipe e
 * distâncias (que não existem no estudo).
 */
export interface ObraAoVivo {
    nome: string;
    avanco: number | null;
    fase: string | null;
    marcos: { nome: string; previsto: string | null; concluido: string | null; status: string | null }[];
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const fmtData = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '—');

export function textoDaApresentacao(op: OportunidadeNaVitrine): string {
    const local = [op.cidade, op.uf].filter(Boolean).join(', ');
    return [
        `${op.title} está em fase de ${op.status ? OPPORTUNITY_STATUS_LABELS[op.status].toLowerCase() : 'avaliação'}${op.opportunity_type ? ` no formato ${OPPORTUNITY_TYPE_LABELS[op.opportunity_type].toLowerCase()}` : ''}.`,
        local ? `Localização: ${local}.` : null,
        op.vgv != null ? `VGV estimado de ${fmtBRL(op.vgv)}.` : null,
        op.custo_total != null ? `Custo estimado (obra e terreno) de ${fmtBRL(op.custo_total)}.` : null,
        op.ticket_min != null ? `Ticket mínimo de ${fmtBRL(op.ticket_min)}.` : null,
        op.prazo_meses ? `Prazo previsto de ${op.prazo_meses} meses.` : null,
        op.roi_pct != null || op.tir_pct != null
            ? `Indicadores projetados: ${op.roi_pct != null ? `ROI de ${fmtPct(op.roi_pct)}` : ''}${op.roi_pct != null && op.tir_pct != null ? ' e ' : ''}${op.tir_pct != null ? `TIR de ${fmtPct(op.tir_pct)}` : ''}.`
            : null,
    ].filter(Boolean).join(' ');
}

const Titulo: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <div className="flex items-center gap-2 mb-3">
        <span className="text-blue-600">{icon}</span>
        <h4 className="text-sm font-semibold text-gray-700">{children}</h4>
    </div>
);

const ApresentacaoDaOportunidade: React.FC<{
    op: OportunidadeNaVitrine;
    /** Linhas da seção Produto congelada na versão (ficha técnica). */
    fichaTecnica?: [string, string][] | null;
    /** A obra do empreendimento ao vivo (marcos e avanço); sem obra, a seção some. */
    obra?: ObraAoVivo | null;
    /** O gestor já tem o simulador na aba Viabilidade & Investimento. */
    semSimulador?: boolean;
}> = ({ op, fichaTecnica, obra, semSimulador }) => {
    const cap = op.captacaoReal;
    return (
        <div className="space-y-8">
            <section className="bg-gray-50/50 rounded-[10px] p-5 border border-gray-100 space-y-2">
                <h4 className="text-sm font-semibold text-gray-900">Apresentação do empreendimento</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{textoDaApresentacao(op)}</p>
            </section>

            {cap.meta != null && (
                <section aria-label="Captação">
                    <Titulo icon={<Building2 className="w-4 h-4" />}>Captação</Titulo>
                    <p className="text-sm text-gray-700">Meta: <span className="font-semibold text-gray-900">{fmtBRL(cap.meta)}</span></p>
                    {cap.comSpe && (
                        <div className="mt-2 space-y-1">
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${cap.pctIntegralizado ?? 0}%` }} />
                            </div>
                            <p className="text-xs text-gray-500">{fmtBRL(cap.integralizado)} integralizado ({fmtPct(cap.pctIntegralizado ?? 0)})</p>
                        </div>
                    )}
                </section>
            )}

            {((fichaTecnica?.length ?? 0) > 0 || op.prazo_meses) && (
                <section>
                    <Titulo icon={<Ruler className="w-4 h-4" />}>Ficha técnica</Titulo>
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {(fichaTecnica ?? []).map(([rotulo, valor]) => (
                            <div key={rotulo} className="bg-gray-50/50 border border-gray-100 rounded-[10px] p-3">
                                <dt className="text-xs text-gray-500 mb-1">{rotulo}</dt>
                                <dd className="text-sm font-semibold text-gray-800">{valor}</dd>
                            </div>
                        ))}
                        {op.prazo_meses && (
                            <div className="bg-gray-50/50 border border-gray-100 rounded-[10px] p-3">
                                <dt className="text-xs text-gray-500 mb-1">Prazo do projeto</dt>
                                <dd className="text-sm font-semibold text-gray-800">{op.prazo_meses} meses</dd>
                            </div>
                        )}
                    </dl>
                </section>
            )}

            {(op.fotos?.length ?? 0) > 0 && (
                <section>
                    <Titulo icon={<Building2 className="w-4 h-4" />}>Imagens do empreendimento</Titulo>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {op.fotos!.map((f, idx) => (
                            <figure key={`${f.url}-${idx}`} className="relative h-48 rounded-[10px] overflow-hidden border border-gray-100">
                                <img src={f.url} alt={f.legenda ?? `Imagem ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                {f.legenda && <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-sm text-white">{f.legenda}</figcaption>}
                            </figure>
                        ))}
                    </div>
                </section>
            )}

            {(op.distances_json?.length ?? 0) > 0 && (
                <section>
                    <Titulo icon={<MapPin className="w-4 h-4" />}>Conveniências e distâncias</Titulo>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {op.distances_json!.map((item: { place?: string; distance?: string }, idx: number) => (
                            <li key={idx} className="flex items-center justify-between p-3 bg-gray-50/50 border border-gray-100 rounded-[10px] text-sm">
                                <span className="text-gray-800">{item.place}</span>
                                <span className="text-blue-700 tabular-nums">{item.distance}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {(op.team_json?.length ?? 0) > 0 && (
                <section>
                    <Titulo icon={<Users className="w-4 h-4" />}>Equipe de desenvolvimento e RI</Titulo>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {op.team_json!.map((m: { name?: string; role?: string; experience?: string }, idx: number) => (
                            <li key={idx} className="p-3 bg-gray-50/50 border border-gray-100 rounded-[10px]">
                                <p className="text-sm font-medium text-gray-800">{m.name}</p>
                                <p className="text-xs text-gray-500">{[m.role, m.experience].filter(Boolean).join(' · ')}</p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {obra && (
                <section aria-label="Obra ao vivo">
                    <Titulo icon={<HardHat className="w-4 h-4" />}>Obra ao vivo — {obra.nome}</Titulo>
                    <p className="text-sm text-gray-700">
                        {obra.avanco != null ? <>Avanço: <span className="font-semibold text-gray-900">{fmtPct(obra.avanco)}</span></> : 'Avanço não informado'}
                        {obra.fase ? ` · Fase: ${obra.fase}` : ''}
                    </p>
                    {obra.marcos.length > 0 && (
                        <ul className="mt-2 divide-y divide-gray-100 border border-gray-100 rounded-[10px]">
                            {obra.marcos.map((m, i) => (
                                <li key={`${m.nome}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                    <span className="text-gray-800">{m.nome}</span>
                                    <span className={m.concluido ? 'text-emerald-700' : 'text-gray-500'}>
                                        {m.concluido ? `Concluído em ${fmtData(m.concluido)}` : `Previsto para ${fmtData(m.previsto)}`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {!semSimulador && podeSimular(op) && (
                <section aria-label="Simulador">
                    <InvestmentSimulator numeros={op} ticketMinimo={op.ticket_min ?? null} />
                </section>
            )}
        </div>
    );
};

export default ApresentacaoDaOportunidade;

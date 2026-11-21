/**
 * Riscos, comparáveis de mercado e due diligence da VERSÃO publicada, para o investidor
 * (plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md, item 2.3).
 *
 * Antes o investidor via a "matriz de riscos" digitada no formulário da oportunidade (risks_json)
 * e um gráfico de concorrentes com 5% e 12% fixos; as listas da versão só iam ao PDF. Agora as três
 * listas saem da versão (`vp.relatorio`, já recortada no banco — fn_investor_portal_get_versao).
 */
import React from 'react';
import type { VersaoPublicada } from '../../../utils/imovibVersoes';
import { rotuloDaCategoria, rotuloDaSituacao, severidade } from '../../../constants/imovibRiscos';
import { vsoDoComparavel, type ImovibComparable } from '../../../utils/imovibMercado';
import { ROTULO_DA_SITUACAO_DD } from '../../ImovibDueDiligenceCard';
import { Th, Td, fmtBRL } from '../../portal/PortalKit';
import type { ImovibRisk, ImovibLandChecklistItem } from '../../../types';

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const Bloco: React.FC<{ titulo: string; vazio: string; temLinhas: boolean; children: React.ReactNode }> = ({ titulo, vazio, temLinhas, children }) => (
    <section className="space-y-2" aria-label={titulo}>
        <h4 className="text-[15px] font-semibold text-[#1F2430]">{titulo}</h4>
        {temLinhas ? <div className="overflow-x-auto border border-[#ECECEF] rounded-[10px]">{children}</div> : <p className="text-sm text-[#5F6573]">{vazio}</p>}
    </section>
);

const ListasDaVersao: React.FC<{ versaoPublicada: Pick<VersaoPublicada, 'relatorio'> }> = ({ versaoPublicada }) => {
    const riscos = [...((versaoPublicada.relatorio?.riscos ?? []) as ImovibRisk[])].sort((a, b) => severidade(b) - severidade(a));
    const comparaveis = (versaoPublicada.relatorio?.comparaveis ?? []) as ImovibComparable[];
    const dd = (versaoPublicada.relatorio?.dueDiligence ?? []) as ImovibLandChecklistItem[];
    const dia = hoje();
    return (
        <div className="space-y-6">
            <Bloco titulo="Riscos" vazio="O estudo não registrou riscos nesta versão." temLinhas={riscos.length > 0}>
                <table className="min-w-[560px] w-full">
                    <thead><tr><Th>Categoria</Th><Th>Risco</Th><Th className="text-right">Severidade</Th><Th>Mitigação</Th><Th>Situação</Th></tr></thead>
                    <tbody className="divide-y divide-[#F1F1F3]">
                        {riscos.map(r => (
                            <tr key={r.id}>
                                <Td>{rotuloDaCategoria(r.category)}</Td>
                                <Td>{r.description}</Td>
                                <Td className="text-right tabular-nums">{severidade(r)}</Td>
                                <Td>{r.mitigation || '—'}</Td>
                                <Td>{rotuloDaSituacao(r.status)}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Bloco>
            <Bloco titulo="Mercado: empreendimentos comparáveis" vazio="O estudo não registrou comparáveis nesta versão." temLinhas={comparaveis.length > 0}>
                <table className="min-w-[560px] w-full">
                    <thead><tr><Th>Empreendimento</Th><Th className="text-right">Preço/m²</Th><Th className="text-right">Vendidas / total</Th><Th className="text-right">VSO ao mês</Th><Th className="text-right">Valorização ao ano</Th><Th className="text-right">Distância</Th></tr></thead>
                    <tbody className="divide-y divide-[#F1F1F3]">
                        {comparaveis.map(c => {
                            const v = vsoDoComparavel(c, dia);
                            return (
                                <tr key={c.id}>
                                    <Td>{c.name}</Td>
                                    <Td className="text-right tabular-nums">{c.price_sqm ? fmtBRL(Number(c.price_sqm)) : '—'}</Td>
                                    <Td className="text-right tabular-nums">{c.sold_units ?? '—'} / {c.total_units ?? '—'}</Td>
                                    <Td className="text-right tabular-nums">{typeof v === 'number' ? pct(v) : v === 'esgotado' ? 'esgotado' : v === 'futuro' ? 'a lançar' : '—'}</Td>
                                    <Td className="text-right tabular-nums">{c.appreciation_pct != null ? pct(Number(c.appreciation_pct)) : '—'}</Td>
                                    <Td className="text-right tabular-nums">{c.distance_km != null ? `${Number(c.distance_km).toLocaleString('pt-BR')} km` : '—'}</Td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </Bloco>
            <Bloco titulo="Due diligence do terreno" vazio="O estudo não registrou a due diligence nesta versão." temLinhas={dd.length > 0}>
                <table className="min-w-[480px] w-full">
                    <thead><tr><Th>Item</Th><Th>Situação</Th><Th>Observação</Th></tr></thead>
                    <tbody className="divide-y divide-[#F1F1F3]">
                        {dd.map(i => (
                            <tr key={i.id}>
                                <Td>{i.label}</Td>
                                <Td>{ROTULO_DA_SITUACAO_DD[i.status] ?? i.status}</Td>
                                <Td>{i.notes || '—'}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Bloco>
        </div>
    );
};

export default ListasDaVersao;

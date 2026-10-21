import React from 'react';
import { Building2, Mail, Phone } from 'lucide-react';
import { PortalCard, CardHeader, Th, Td, StatusPill, PortalEmpty, fmtBRLCents, type PillTone } from '../portal/PortalKit';
import { competencia, fracaoParaPercentual, rotuloDoPapel } from '../client/CondominioTab';
import type { CondominioDoSindico, RateioParaSindico, UnidadeParaSindico } from '../../services/sindicoPortalService';
import { ROTULO_SITUACAO_DA_COTA, situacaoPorUnidade, type SituacaoDaCota } from '../../utils/situacaoDaCota';
import { hojeEmBrasilia } from '../../utils/mandatoSindico';

/**
 * Portal do Síndico › Unidades: cada unidade do prédio, quem ocupa (com contato
 * — decisão do usuário em 20/10/2026, o síndico precisa dele para tratar chamado
 * e cobrar) e a situação da cota da última competência fechada.
 * Plano: docs/planos/2026-10-20-portal-do-sindico.md
 *
 * Vocabulário visual: PortalKit (exceção §24 dos portais externos).
 */

const TOM: Record<SituacaoDaCota, PillTone> = {
    PAGA: 'good',
    EM_ABERTO: 'info',
    VENCIDA: 'accent',
    NAO_COBRADA: 'muted',
    CANCELADA: 'muted',
};

/** Uma linha por PESSOA na unidade: quem é inquilino e responsável financeiro
 *  da mesma sala aparecia duas vezes, com o mesmo e-mail repetido. */
function pessoasDaUnidade(u: UnidadeParaSindico) {
    const porPessoa = new Map<string, { clientId: string; nome: string; email: string | null; telefone: string | null; papeis: string[] }>();
    for (const o of u.ocupacoes) {
        const chave = o.clientId || o.nome;
        const atual = porPessoa.get(chave);
        if (atual) { if (!atual.papeis.includes(o.papel)) atual.papeis.push(o.papel); }
        else porPessoa.set(chave, { clientId: o.clientId, nome: o.nome, email: o.email, telefone: o.telefone, papeis: [o.papel] });
    }
    return [...porPessoa.values()];
}

interface Props {
    condominios: CondominioDoSindico[];
    unidades: UnidadeParaSindico[];
    rateios: RateioParaSindico[];
}

const PainelUnidadesDoPredio: React.FC<Props> = ({ condominios, unidades, rateios }) => {
    const hoje = hojeEmBrasilia();
    const situacao = React.useMemo(() => situacaoPorUnidade(rateios, hoje), [rateios, hoje]);

    if (unidades.length === 0) {
        return (
            <PortalCard>
                <PortalEmpty icon={<Building2 className="w-10 h-10" />} title="Nenhuma unidade cadastrada"
                    subtitle="As unidades do prédio aparecem aqui quando a administração as cadastrar." />
            </PortalCard>
        );
    }

    return (
        <div className="space-y-6">
            {condominios.map(c => {
                const doPredio = unidades.filter(u => u.condominioId === c.id);
                const ocupadas = doPredio.filter(u => u.ocupacoes.length > 0).length;
                return (
                    <PortalCard key={c.id} className="overflow-hidden">
                        <CardHeader
                            title={c.nome}
                            subtitle={`${doPredio.length} ${doPredio.length === 1 ? 'unidade' : 'unidades'} · ${ocupadas} com ocupante`}
                        />
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="border-y border-[#ECECEF] bg-[#FAFAFB]">
                                    <tr>
                                        <Th>Unidade</Th>
                                        <Th>Ocupantes</Th>
                                        <Th className="text-right">Fração</Th>
                                        <Th className="text-right">Última cota</Th>
                                        <Th>Situação</Th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#ECECEF]">
                                    {doPredio.map(u => {
                                        const s = situacao.get(u.unitId);
                                        return (
                                            <tr key={u.unitId} className="align-top">
                                                <Td className="whitespace-nowrap">
                                                    <span className="text-[#1F2430]">{u.unidade}</span>
                                                    {u.torre && <span className="block text-xs text-gray-400">{u.torre}</span>}
                                                </Td>
                                                <Td>
                                                    {u.ocupacoes.length === 0 ? (
                                                        <span className="text-gray-400">Sem ocupante cadastrado</span>
                                                    ) : (
                                                        <ul className="space-y-1.5">
                                                            {pessoasDaUnidade(u).map((o, i) => (
                                                                <li key={`${o.clientId}-${i}`}>
                                                                    <span className="text-[#1F2430]">{o.nome}</span>
                                                                    <span className="text-gray-400"> · {o.papeis.map(rotuloDoPapel).join(', ')}</span>
                                                                    {(o.email || o.telefone) && (
                                                                        <span className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-0.5">
                                                                            {o.email && (
                                                                                <a href={`mailto:${o.email}`} className="inline-flex items-center gap-1 hover:text-[#C24428]">
                                                                                    <Mail className="w-3 h-3" />{o.email}
                                                                                </a>
                                                                            )}
                                                                            {o.telefone && (
                                                                                <a href={`tel:${o.telefone}`} className="inline-flex items-center gap-1 hover:text-[#C24428]">
                                                                                    <Phone className="w-3 h-3" />{o.telefone}
                                                                                </a>
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </Td>
                                                <Td className="text-right whitespace-nowrap">{fracaoParaPercentual(u.fracaoIdeal)}</Td>
                                                <Td className="text-right whitespace-nowrap">
                                                    {s?.ultima ? (
                                                        <>
                                                            {fmtBRLCents(s.ultima.valor)}
                                                            <span className="block text-xs text-gray-400">{competencia(s.ultima.competencia)}</span>
                                                        </>
                                                    ) : <span className="text-gray-400">—</span>}
                                                </Td>
                                                <Td className="whitespace-nowrap">
                                                    {s?.ultima ? (
                                                        <>
                                                            <StatusPill tone={TOM[s.ultima.situacao]}>{ROTULO_SITUACAO_DA_COTA[s.ultima.situacao]}</StatusPill>
                                                            {s.vencidas > 0 && (
                                                                <span className="block text-xs text-[#C24428] mt-1">
                                                                    {s.vencidas} {s.vencidas === 1 ? 'cota vencida' : 'cotas vencidas'} · {fmtBRLCents(s.valorVencido)}
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : <span className="text-gray-400">Sem rateio fechado</span>}
                                                </Td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </PortalCard>
                );
            })}
        </div>
    );
};

export default PainelUnidadesDoPredio;

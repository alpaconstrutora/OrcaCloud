import React, { useMemo } from 'react';
import { Building2, Landmark, ShieldAlert, Users, Wallet } from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import { useFolhasFechadasDoMes } from '../hooks/useFolhasFechadasDoMes';
import { relacaoInss, LinhaInss, RelacaoInss } from '../utils/relacoesDaFolha';
import {
    BRL, PCT, rotuloDaCompetencia, EstadoDaRelacao, BarraDaRelacao, CabecalhoDaOrganizacao, NotaSemValor,
} from './LaborEncargosRelacao';

interface LaborEncargosINSSProps {
    orgId: string | null;
    /** Usada só em "Todas as organizações": um bloco por organização. */
    organizations: Array<{ id: string; name: string }>;
    period: string;
}

const COLUMNS: StandardTableColumn[] = [
    { key: 'matricula', label: 'Matrícula', sortable: true, width: 110 },
    { key: 'nome', label: 'Empregado', sortable: true, width: 300 },
    { key: 'base', label: 'Base de cálculo', sortable: true, width: 160, align: 'right' },
    { key: 'aliquota', label: 'Alíquota efetiva', sortable: true, width: 150, align: 'right' },
    { key: 'inss', label: 'INSS descontado', sortable: true, width: 160, align: 'right' },
];

/** Alíquota igual em todas as organizações → "20,00%"; diferente → sem número no rótulo. */
function rotuloDaAliquota(relacoes: RelacaoInss[], k: keyof RelacaoInss['aliquotas']) {
    const unicas = [...new Set(relacoes.map(r => r.aliquotas[k].toFixed(6)))];
    return unicas.length === 1 ? ` (${PCT(Number(unicas[0]))})` : '';
}

/**
 * RH › Encargos Sociais › Encargos de INSS — relação das bases do INSS da competência
 * e o que vai na guia. Os números são os mesmos dos títulos de Tributos a Pagar
 * (`utils/relacoesDaFolha.ts` aplica as regras de `folhaFinanceiro.ts`).
 */
const LaborEncargosINSS: React.FC<LaborEncargosINSSProps> = ({ orgId, organizations, period }) => {
    const { blocos, loading, error, recarregar } = useFolhasFechadasDoMes(orgId, organizations, period);
    const relacoes = useMemo(() => blocos.map(b => ({ org: b.org, rel: relacaoInss(b.dados) })), [blocos]);
    const comFolha = relacoes.filter(r => r.rel.calculos.length > 0);
    const semFolha = relacoes.filter(r => r.rel.calculos.length === 0).map(r => r.org.name);
    const todas = !orgId;

    const estado = (
        <EstadoDaRelacao
            loading={loading} error={error} vazio={comFolha.length === 0} period={period}
            todas={todas} totalOrganizacoes={relacoes.length} onTentarDeNovo={recarregar}
        />
    );
    if (loading || error || comFolha.length === 0) return estado;

    const soma = (k: keyof RelacaoInss['totais']) => comFolha.reduce((s, r) => s + r.rel.totais[k], 0);
    const rels = comFolha.map(r => r.rel);
    const varias = comFolha.length > 1;
    const calculos = [...new Set(rels.flatMap(r => r.calculos))];

    return (
        <div>
            {/* KpiCard §4 — total da guia em destaque (§4.2), as quatro parcelas ao lado */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-3">
                <KpiCard
                    size="lg" className="col-span-2" color="indigo" icon={<Landmark />}
                    label="Total da guia (INSS)"
                    value={BRL(soma('totalGuia'))}
                    sub={varias
                        ? `Soma de ${comFolha.length} organizações — cada uma tem a sua guia`
                        : `Sobre a base de ${BRL(soma('base'))}`}
                />
                <KpiCard size="sm" color="blue" icon={<Users />} label="Segurados" value={BRL(soma('segurados'))} />
                <KpiCard size="sm" color="orange" icon={<Building2 />} label={`INSS patronal${rotuloDaAliquota(rels, 'cpp')}`} value={BRL(soma('cpp'))} />
                <KpiCard size="sm" color="amber" icon={<ShieldAlert />} label={`RAT × FAP${rotuloDaAliquota(rels, 'rat')}`} value={BRL(soma('rat'))} />
                <KpiCard size="sm" color="purple" icon={<Wallet />} label={`Terceiros${rotuloDaAliquota(rels, 'terceiros')}`} value={BRL(soma('terceiros'))} />
            </div>

            <BarraDaRelacao semFolha={semFolha}>
                Competência <span className="font-medium text-gray-800">{rotuloDaCompetencia(period)}</span>
                {' · '}{calculos.join(', ')}
                {' · '}alíquotas da aba Contribuições Sociais, as mesmas dos títulos em Tributos a Pagar
            </BarraDaRelacao>

            <div className="space-y-6">
                {comFolha.map(({ org, rel }) => (
                    <StandardTable<LinhaInss>
                        key={org.id}
                        storageKey="labor:encargos:inss"
                        searchScope={org.id}
                        maxHeight="none"
                        columns={COLUMNS}
                        rows={rel.linhas}
                        rowKey={l => l.employeeId}
                        searchText={l => `${l.matricula ?? ''} ${l.nome}`}
                        searchPlaceholder="Buscar empregado..."
                        toolbarTop={
                            <CabecalhoDaOrganizacao
                                nome={org.name}
                                cnpj={org.cnpj}
                                detalhe={`Relação de bases do INSS · ${rel.calculos.join(', ')}`}
                                direita={varias ? <>Guia <span className="font-medium text-gray-900">{BRL(rel.totais.totalGuia)}</span></> : undefined}
                            />
                        }
                        sortValue={(key, l) => {
                            switch (key) {
                                case 'matricula': return l.matricula;
                                case 'nome': return l.nome;
                                case 'base': return l.base;
                                case 'aliquota': return l.aliquotaEfetiva;
                                case 'inss': return l.inss;
                                default: return null;
                            }
                        }}
                        renderCell={(key, l) => {
                            switch (key) {
                                case 'matricula': return <span className="text-sm font-normal text-gray-600">{l.matricula ?? '—'}</span>;
                                case 'nome': return <span className="block truncate text-sm font-normal text-gray-700" title={l.nome}>{l.nome}</span>;
                                case 'base': return <span className="text-sm font-medium text-gray-800">{BRL(l.base)}</span>;
                                case 'aliquota': return <span className="text-sm font-normal text-gray-600">{l.aliquotaEfetiva == null ? '—' : PCT(l.aliquotaEfetiva)}</span>;
                                case 'inss': return <span className="text-sm font-medium text-gray-800">{BRL(l.inss)}</span>;
                                default: return null;
                            }
                        }}
                        totaisPorColuna={(key, linhas) => {
                            const base = linhas.reduce((s, l) => s + l.base, 0);
                            const inss = linhas.reduce((s, l) => s + l.inss, 0);
                            switch (key) {
                                case 'matricula': return <span className="text-xs font-semibold text-gray-500">Total</span>;
                                case 'nome': return <span className="text-sm font-normal text-gray-600">{linhas.length} empregado(s)</span>;
                                case 'base': return <span className="text-sm font-medium text-gray-800">{BRL(base)}</span>;
                                case 'aliquota': return <span className="text-sm font-normal text-gray-600">{base > 0 ? PCT(inss / base) : '—'}</span>;
                                case 'inss': return <span className="text-sm font-medium text-gray-800">{BRL(inss)}</span>;
                                default: return null;
                            }
                        }}
                        footer={<>
                            {varias && (
                                // Resumo da guia desta organização. Com uma só, os KPIs acima já são ele (§18).
                                <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-2 px-4 py-3 border-t border-gray-100 text-sm">
                                    {([
                                        ['Segurados', rel.totais.segurados],
                                        [`INSS patronal (${PCT(rel.aliquotas.cpp)})`, rel.totais.cpp],
                                        [`RAT × FAP (${PCT(rel.aliquotas.rat)})`, rel.totais.rat],
                                        [`Terceiros (${PCT(rel.aliquotas.terceiros)})`, rel.totais.terceiros],
                                        ['Total da guia', rel.totais.totalGuia],
                                    ] as const).map(([rotulo, valor]) => (
                                        <div key={rotulo}>
                                            <dt className="text-xs font-semibold text-gray-500">{rotulo}</dt>
                                            <dd className="font-medium text-gray-800">{BRL(valor)}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                            <NotaSemValor nomes={rel.semValor} />
                        </>}
                        empty={{ title: 'Nenhum empregado com base de INSS' }}
                    />
                ))}
            </div>
        </div>
    );
};

export default LaborEncargosINSS;

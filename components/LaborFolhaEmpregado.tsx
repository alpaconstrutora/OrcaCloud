import React, { useMemo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, PiggyBank, Wallet } from 'lucide-react';
import { KpiCard } from './ui/KpiCard';
import StandardTable, { StandardTableColumn } from './ui/StandardTable';
import { useFolhasFechadasDoMes } from '../hooks/useFolhasFechadasDoMes';
import { relacaoFolhaPorEmpregado, LinhaFolha } from '../utils/relacoesDaFolha';
import {
    BRL, rotuloDaCompetencia, EstadoDaRelacao, BarraDaRelacao, CabecalhoDaOrganizacao, NotaSemValor,
} from './LaborEncargosRelacao';

interface LaborFolhaEmpregadoProps {
    orgId: string | null;
    /** Usada só em "Todas as organizações": um bloco por organização. */
    organizations: Array<{ id: string; name: string }>;
    period: string;
}

type Valor = 'salario' | 'outrosProventos' | 'salarioFamilia' | 'inss' | 'irrf' | 'outrosDescontos' | 'liquido' | 'fgts';
const VALORES: Valor[] = ['salario', 'outrosProventos', 'salarioFamilia', 'inss', 'irrf', 'outrosDescontos', 'liquido', 'fgts'];

const COLUMNS: StandardTableColumn[] = [
    { key: 'matricula', label: 'Matrícula', sortable: true, width: 110 },
    { key: 'nome', label: 'Empregado', sortable: true, width: 260 },
    { key: 'salario', label: 'Salário', sortable: true, width: 130, align: 'right' },
    { key: 'outrosProventos', label: 'Outros proventos', sortable: true, width: 150, align: 'right' },
    { key: 'salarioFamilia', label: 'Salário-família', sortable: true, width: 140, align: 'right' },
    { key: 'inss', label: 'INSS', sortable: true, width: 120, align: 'right' },
    { key: 'irrf', label: 'IRRF', sortable: true, width: 120, align: 'right' },
    { key: 'outrosDescontos', label: 'Outros descontos', sortable: true, width: 150, align: 'right' },
    { key: 'liquido', label: 'Líquido', sortable: true, width: 130, align: 'right' },
    { key: 'fgts', label: 'FGTS', sortable: true, width: 120, align: 'right' },
];

const ehValor = (key: string): key is Valor => (VALORES as string[]).includes(key);

/**
 * RH › Encargos Sociais › Relação por Empregado — a folha mensal FECHADA da
 * competência, um empregado por linha. Só a mensal: férias e rescisão têm recibo
 * próprio (a aba Encargos de INSS é que soma todos os cálculos do mês).
 */
const LaborFolhaEmpregado: React.FC<LaborFolhaEmpregadoProps> = ({ orgId, organizations, period }) => {
    const { blocos, loading, error, recarregar } = useFolhasFechadasDoMes(orgId, organizations, period);
    const relacoes = useMemo(
        () => blocos.map(b => ({ org: b.org, rel: relacaoFolhaPorEmpregado(b.dados), temMensal: b.dados.folhas.some(f => f.type === 'mensal') })),
        [blocos],
    );
    const comFolha = relacoes.filter(r => r.temMensal);
    const semFolha = relacoes.filter(r => !r.temMensal).map(r => r.org.name);

    const estado = (
        <EstadoDaRelacao
            loading={loading} error={error} vazio={comFolha.length === 0} period={period}
            todas={!orgId} totalOrganizacoes={relacoes.length} onTentarDeNovo={recarregar}
        />
    );
    if (loading || error || comFolha.length === 0) return estado;

    const soma = (k: Valor) => comFolha.reduce((s, r) => s + r.rel.totais[k], 0);
    const proventos = soma('salario') + soma('outrosProventos') + soma('salarioFamilia');
    const descontos = soma('inss') + soma('irrf') + soma('outrosDescontos');
    const varias = comFolha.length > 1;

    return (
        <div>
            {/* KpiCard §4 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard color="blue" icon={<ArrowUpCircle />} label="Proventos" value={BRL(proventos)} />
                <KpiCard color="red" icon={<ArrowDownCircle />} label="Descontos" value={BRL(descontos)} sub="INSS, IRRF e outros descontos" />
                <KpiCard color="emerald" icon={<Wallet />} label="Líquido" value={BRL(soma('liquido'))}
                    sub={varias ? `Soma de ${comFolha.length} organizações` : undefined} />
                <KpiCard color="indigo" icon={<PiggyBank />} label="FGTS" value={BRL(soma('fgts'))} sub="Encargo da empresa, fora do líquido" />
            </div>

            <BarraDaRelacao semFolha={semFolha}>
                Competência <span className="font-medium text-gray-800">{rotuloDaCompetencia(period)}</span> · Folha mensal
            </BarraDaRelacao>

            <div className="space-y-6">
                {comFolha.map(({ org, rel }) => (
                    <StandardTable<LinhaFolha>
                        key={org.id}
                        storageKey="labor:encargos:folha-por-empregado"
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
                                detalhe="Relação da folha por empregado · Folha mensal"
                                direita={varias ? <>Líquido <span className="font-medium text-gray-900">{BRL(rel.totais.liquido)}</span></> : undefined}
                            />
                        }
                        sortValue={(key, l) => (key === 'matricula' ? l.matricula : key === 'nome' ? l.nome : ehValor(key) ? l[key] : null)}
                        renderCell={(key, l) => {
                            if (key === 'matricula') return <span className="text-sm font-normal text-gray-600">{l.matricula ?? '—'}</span>;
                            if (key === 'nome') return <span className="block truncate text-sm font-normal text-gray-700" title={l.nome}>{l.nome}</span>;
                            if (ehValor(key)) return <span className="text-sm font-medium text-gray-800">{BRL(l[key])}</span>;
                            return null;
                        }}
                        totaisPorColuna={(key, linhas) => {
                            if (key === 'matricula') return <span className="text-xs font-semibold text-gray-500">Total</span>;
                            if (key === 'nome') return <span className="text-sm font-normal text-gray-600">{linhas.length} empregado(s)</span>;
                            if (ehValor(key)) return <span className="text-sm font-medium text-gray-800">{BRL(linhas.reduce((s, l) => s + l[key], 0))}</span>;
                            return null;
                        }}
                        footer={<NotaSemValor nomes={rel.semValor} />}
                        empty={{ title: 'Nenhum empregado com valor na folha mensal' }}
                    />
                ))}
            </div>
        </div>
    );
};

export default LaborFolhaEmpregado;

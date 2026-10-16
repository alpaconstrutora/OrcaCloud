import React from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Clock, History } from 'lucide-react';
import { KpiCard } from '../../ui/KpiCard';
import StandardTable, { type StandardTableColumn } from '../../ui/StandardTable';
import { fmtData, VIGENCIA_LABEL, vigenciaDe } from '../../training/portal/traineeKit';
import type { AcademyTraineeHistoryItem } from '../../../types/academy';

/**
 * "Meus Treinamentos" › Histórico — o registro legal (`employee_trainings`):
 * presencial lançado pelo RH e EAD concluído, com validade e vencimento.
 */

const COLUMNS: StandardTableColumn[] = [
    { key: 'curso',     label: 'Treinamento',  sortable: true, width: 260 },
    { key: 'org',       label: 'Organização',  sortable: true, width: 200 },
    { key: 'origem',    label: 'Origem',       sortable: true, width: 140 },
    { key: 'realizado', label: 'Realizado em', sortable: true, width: 130 },
    { key: 'validade',  label: 'Validade',     sortable: true, width: 130 },
    { key: 'nota',      label: 'Nota',         sortable: true, width: 90 },
    { key: 'situacao',  label: 'Situação',     sortable: true, width: 120 },
];

interface Props {
    itens: AcademyTraineeHistoryItem[];
    mostrarOrganizacao: boolean;
    carregando: boolean;
}

const MeusTreinamentosHistorico: React.FC<Props> = ({ itens, mostrarOrganizacao, carregando }) => {
    const vig = itens.map(i => vigenciaDe(i.data_validade));
    const validos = vig.filter(v => v === 'valido' || v === 'sem-validade').length;
    const vencendo = vig.filter(v => v === 'vencendo').length;
    const vencidos = vig.filter(v => v === 'vencido').length;
    const colunas = mostrarOrganizacao ? COLUMNS : COLUMNS.filter(c => c.key !== 'org');

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <KpiCard label="Registros" value={`${itens.length}`} icon={<History className="w-4 h-4" />} color="blue" />
                <KpiCard label="Válidos" value={`${validos}`} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
                <KpiCard label="Vencendo em 30 dias" value={`${vencendo}`} icon={<Clock className="w-4 h-4" />} color="amber" />
                <KpiCard label="Vencidos" value={`${vencidos}`} icon={<AlertTriangle className="w-4 h-4" />} color="rose" />
            </div>

            <StandardTable<AcademyTraineeHistoryItem>
                storageKey="meusTreinamentos:historico"
                columns={colunas}
                rows={itens}
                rowKey={i => i.id}
                loading={carregando}
                searchText={i => `${i.course_nome} ${i.nr_referencia ?? ''} ${i.org_nome}`}
                searchPlaceholder="Buscar treinamento ou NR..."
                sortValue={(k, i) => {
                    switch (k) {
                        case 'org': return i.org_nome;
                        case 'origem': return i.origem;
                        case 'realizado': return i.data_realizacao;
                        case 'validade': return i.data_validade ?? '';
                        case 'nota': return i.nota ?? -1;
                        case 'situacao': return VIGENCIA_LABEL[vigenciaDe(i.data_validade)].label;
                        default: return i.course_nome;
                    }
                }}
                renderCell={(k, i) => {
                    switch (k) {
                        case 'curso': return (
                            <span className="block truncate text-sm font-normal text-gray-700" title={i.course_nome}>
                                {i.course_nome}
                                {i.nr_referencia && <span className="text-rose-600"> · {i.nr_referencia}</span>}
                            </span>
                        );
                        case 'org': return <span className="block truncate text-sm font-normal text-gray-700" title={i.org_nome}>{i.org_nome}</span>;
                        case 'origem': return <span className={`text-sm font-normal ${i.origem === 'ACADEMIA' ? 'text-indigo-700' : 'text-gray-600'}`}>{i.origem === 'ACADEMIA' ? 'EAD (Academia)' : 'Presencial'}</span>;
                        case 'realizado': return <span className="text-sm font-normal text-gray-600">{fmtData(i.data_realizacao)}</span>;
                        case 'validade': return <span className="text-sm font-normal text-gray-600">{i.data_validade ? fmtData(i.data_validade) : 'Sem validade'}</span>;
                        case 'nota': return i.nota != null
                            ? <span className={`text-sm font-normal ${i.aprovado ? 'text-emerald-700' : 'text-rose-700'}`}>{i.nota}</span>
                            : <span className="text-sm font-normal text-gray-400">—</span>;
                        case 'situacao': { const v = VIGENCIA_LABEL[vigenciaDe(i.data_validade)]; return <span className={`text-sm font-normal ${v.cor}`}>{v.label}</span>; }
                        default: return null;
                    }
                }}
                empty={{
                    icon: <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum treinamento registrado',
                    subtitle: 'Treinamentos presenciais lançados pela empresa e EAD concluídos aparecem aqui.',
                }}
            />
        </>
    );
};

export default MeusTreinamentosHistorico;

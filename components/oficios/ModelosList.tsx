import React from 'react';
import { FileText, Copy, Power } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import type { DocGenModelo } from '../../types/docGen';
import { CATEGORIA_GED_LABEL, STATUS_MODELO, formatarDataHora } from './rotulos';

/**
 * Documentos › Ofícios › Modelos — tabela (§6.10 StandardTable). Clicar na
 * linha abre o editor (ação dominante, §9.1); a coluna de ações fica com
 * duplicar, ativar/inativar e excluir.
 */
// Soma alvo ≈ 1.000 px: o espaçador fica com o resto (§6.1.1).
const COLUMNS: StandardTableColumn[] = [
    { key: 'nome', label: 'Nome', sortable: true, width: 300 },
    { key: 'categoria_ged', label: 'Categoria no GED', sortable: true, width: 160 },
    { key: 'departamento', label: 'Departamento', sortable: true, width: 170 },
    { key: 'status', label: 'Status', sortable: true, width: 110 },
    { key: 'versao', label: 'Versão', sortable: true, width: 90, align: 'right' },
    { key: 'updated_at', label: 'Atualizado em', sortable: true, width: 160 },
];

interface Props {
    modelos: DocGenModelo[];
    loading: boolean;
    nomeDepartamento: (id: string | null) => string;
    onAbrir: (m: DocGenModelo) => void;
    onDuplicar: (m: DocGenModelo) => void;
    onAlternarStatus: (m: DocGenModelo) => void;
    onExcluir: (m: DocGenModelo) => void;
}

export default function ModelosList({ modelos, loading, nomeDepartamento, onAbrir, onDuplicar, onAlternarStatus, onExcluir }: Props) {
    return (
        <StandardTable<DocGenModelo>
            storageKey="oficios:modelos"
            columns={COLUMNS}
            rows={modelos}
            rowKey={m => m.id}
            loading={loading}
            searchText={m => `${m.nome} ${m.descricao ?? ''} ${CATEGORIA_GED_LABEL[m.categoria_ged]} ${nomeDepartamento(m.department_id)}`}
            searchPlaceholder="Buscar por nome, descrição, categoria ou departamento..."
            sortValue={(key, m) => {
                switch (key) {
                    case 'nome': return m.nome;
                    case 'categoria_ged': return CATEGORIA_GED_LABEL[m.categoria_ged];
                    case 'departamento': return nomeDepartamento(m.department_id);
                    case 'status': return STATUS_MODELO[m.status].label;
                    case 'versao': return m.versao;
                    case 'updated_at': return m.updated_at;
                    default: return null;
                }
            }}
            onRowClick={onAbrir}
            renderCell={(key, m) => {
                switch (key) {
                    case 'nome':
                        return (
                            <span className="block min-w-0">
                                <span className="block truncate text-sm font-normal text-gray-700" title={m.nome}>{m.nome}</span>
                                {m.descricao && <span className="block truncate text-xs text-gray-400" title={m.descricao}>{m.descricao}</span>}
                            </span>
                        );
                    case 'categoria_ged':
                        return <span className="text-sm font-normal text-gray-700">{CATEGORIA_GED_LABEL[m.categoria_ged]}</span>;
                    case 'departamento': {
                        const nome = nomeDepartamento(m.department_id);
                        return <span className={`block truncate text-sm font-normal ${nome ? 'text-gray-700' : 'text-gray-400'}`} title={nome}>{nome || '—'}</span>;
                    }
                    case 'status': {
                        const s = STATUS_MODELO[m.status];
                        return <span className={`text-sm font-normal ${s.className}`}>{s.label}</span>;
                    }
                    case 'versao':
                        return <span className="text-sm font-normal text-gray-600">v{m.versao}</span>;
                    case 'updated_at':
                        return <span className="text-sm font-normal text-gray-600">{formatarDataHora(m.updated_at)}</span>;
                    default:
                        return null;
                }
            }}
            actions={{
                width: 90,
                render: m => (
                    <div className="flex items-center justify-end" onClick={e => e.stopPropagation()}>
                        <InlineDisclosureMenu
                            menuItems={[
                                { icon: <Copy className="w-[18px] h-[18px]" />, label: 'Duplicar', onClick: () => onDuplicar(m) },
                                { icon: <Power className="w-[18px] h-[18px]" />, label: m.status === 'ativo' ? 'Inativar' : 'Ativar', onClick: () => onAlternarStatus(m) },
                            ]}
                            showDelete
                            onDelete={() => onExcluir(m)}
                        />
                    </div>
                ),
            }}
            empty={{
                icon: <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                title: 'Nenhum modelo de documento',
                subtitle: 'Crie o primeiro modelo em "Novo modelo": cabeçalho, variáveis do sistema e campos de redação livre.',
            }}
        />
    );
}

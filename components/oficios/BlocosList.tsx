import React from 'react';
import { Library, Loader2, AlertCircle } from 'lucide-react';
import StandardTable, { type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { InlineDisclosureMenu } from '../ui/inline-disclosure-menu';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useToast } from '../../hooks/useToast';
import { DOC_TIPTAP_VAZIO, type DocGenBloco, type DocTipTap } from '../../types/docGen';
import { docGenBlocoService } from '../../services/docGenBlocoService';
import EditorRico from './EditorRico';
import { formatarDataHora } from './rotulos';

/**
 * Documentos › Ofícios › aba Blocos (F6 — "biblioteca de blocos" da Fase 3).
 * Trechos prontos da organização; o editor do modelo e o da redação inserem uma
 * CÓPIA (mudar o bloco depois não mexe no que já o usou). Criar/editar num
 * drawer (formulário curto com o editor — guia §4.3); excluir pelo menu da linha.
 */
interface Props {
    blocos: DocGenBloco[];
    loading: boolean;
    /** Organização do topo; sem ela não se cria (o bloco é de uma organização só). */
    organizationId: string | null;
    editando: DocGenBloco | 'novo' | null;
    onEditar: (b: DocGenBloco | 'novo' | null) => void;
    onSalvo: (b: DocGenBloco) => void;
    onExcluido: (id: string) => void;
}

const COLUMNS: StandardTableColumn[] = [
    { key: 'nome', label: 'Nome', sortable: true, width: 320 },
    { key: 'descricao', label: 'Quando usar', sortable: true, width: 480 },
    { key: 'updated_at', label: 'Atualizado em', sortable: true, width: 160 },
];

export default function BlocosList({ blocos, loading, organizationId, editando, onEditar, onSalvo, onExcluido }: Props) {
    const { showToast } = useToast();

    const excluir = async (b: DocGenBloco) => {
        try {
            await docGenBlocoService.remove(b.id);
            onExcluido(b.id);
            showToast('Bloco excluído. Modelos e ofícios que já o usaram não mudam.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao excluir.', 'error');
        }
    };

    return (
        <>
            <StandardTable<DocGenBloco>
                storageKey="oficios:blocos"
                columns={COLUMNS}
                rows={blocos}
                rowKey={b => b.id}
                loading={loading}
                searchText={b => `${b.nome} ${b.descricao ?? ''}`}
                searchPlaceholder="Buscar bloco..."
                sortValue={(key, b) => (key === 'nome' ? b.nome : key === 'descricao' ? b.descricao ?? '' : key === 'updated_at' ? b.updated_at : null)}
                onRowClick={b => onEditar(b)}
                renderCell={(key, b) => {
                    switch (key) {
                        case 'nome': return <span className="block truncate text-sm font-normal text-gray-700" title={b.nome}>{b.nome}</span>;
                        case 'descricao': return <span className="block truncate text-sm font-normal text-gray-600" title={b.descricao ?? ''}>{b.descricao || '—'}</span>;
                        case 'updated_at': return <span className="text-sm font-normal text-gray-600">{formatarDataHora(b.updated_at)}</span>;
                        default: return null;
                    }
                }}
                actions={{
                    width: 110,
                    render: b => (
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <ActionIconButton kind="edit" title="Editar o bloco" onClick={() => onEditar(b)} />
                            <InlineDisclosureMenu showDelete onDelete={() => void excluir(b)} />
                        </div>
                    ),
                }}
                empty={{
                    icon: <Library className="w-12 h-12 text-gray-300 mx-auto mb-4" />,
                    title: 'Nenhum bloco na biblioteca',
                    subtitle: 'Crie trechos prontos (fecho, cláusula de prazo, encaminhamento) para inserir nos modelos e ofícios. No editor, a seleção também pode virar bloco.',
                }}
            />
            <BlocoSheet bloco={editando} organizationId={organizationId} onClose={() => onEditar(null)} onSalvo={b => { onSalvo(b); onEditar(null); }} />
        </>
    );
}

function BlocoSheet({ bloco, organizationId, onClose, onSalvo }: {
    bloco: DocGenBloco | 'novo' | null;
    organizationId: string | null;
    onClose: () => void;
    onSalvo: (b: DocGenBloco) => void;
}) {
    const { showToast } = useToast();
    const [nome, setNome] = React.useState('');
    const [descricao, setDescricao] = React.useState('');
    const [conteudo, setConteudo] = React.useState<DocTipTap>(DOC_TIPTAP_VAZIO);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState<string | null>(null);
    const [mudou, setMudou] = React.useState(false);

    React.useEffect(() => {
        if (!bloco) return;
        setNome(bloco === 'novo' ? '' : bloco.nome);
        setDescricao(bloco === 'novo' ? '' : bloco.descricao ?? '');
        setConteudo(bloco === 'novo' ? DOC_TIPTAP_VAZIO : bloco.conteudo);
        setErro(null);
        setMudou(false);
    }, [bloco]);

    if (!bloco) return null;
    const orgDoBloco = bloco === 'novo' ? organizationId : bloco.organization_id;
    const motivo = !orgDoBloco ? 'Escolha uma organização no topo — o bloco é de uma organização.'
        : !nome.trim() ? 'Dê um nome ao bloco.' : undefined;

    const salvar = async () => {
        if (motivo || !orgDoBloco) return;
        setSalvando(true);
        setErro(null);
        try {
            const salvo = bloco === 'novo'
                ? await docGenBlocoService.create({ organization_id: orgDoBloco, nome, descricao, conteudo })
                : await docGenBlocoService.update(bloco.id, { nome, descricao: descricao.trim() || null, conteudo });
            showToast(bloco === 'novo' ? 'Bloco criado.' : 'Bloco salvo.', 'success');
            onSalvo(salvo);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Falha ao salvar o bloco.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Sheet open={!!bloco} onClose={onClose} size="4xl" dirty={mudou}>
            <SheetHeader onClose={onClose}>
                <SheetTitle>{bloco === 'novo' ? 'Novo bloco' : `Bloco: ${bloco.nome}`}</SheetTitle>
                <SheetDescription>Pode ter variáveis, condições e tabelas — tudo é resolvido no documento onde o bloco for inserido.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500" htmlFor="bloco-nome">Nome *</label>
                        <input id="bloco-nome" value={nome} onChange={e => { setNome(e.target.value); setMudou(true); }} placeholder="Ex.: Fecho padrão"
                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500" htmlFor="bloco-descricao">Quando usar</label>
                        <input id="bloco-descricao" value={descricao} onChange={e => { setDescricao(e.target.value); setMudou(true); }}
                            className="w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                    </div>
                </div>
                <EditorRico value={conteudo} onChange={d => { setConteudo(d); setMudou(true); }} modo="modelo" minHeightClass="min-h-[220px]" />
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button type="button" onClick={() => void salvar()} disabled={salvando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    {bloco === 'novo' ? 'Criar bloco' : 'Salvar bloco'}
                </button>
            </SheetFooter>
        </Sheet>
    );
}

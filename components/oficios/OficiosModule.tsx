import React from 'react';
import { FileText, Plus, LayoutTemplate } from 'lucide-react';
import { TabsBar } from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { useOrgContext } from '../../hooks/useOrgContext';
import { useDepartamentosDaOrg } from '../../hooks/useDepartamentosDaOrg';
import { docGenModeloService } from '../../services/docGenModeloService';
import type { DocGenModelo } from '../../types/docGen';
import ModelosList from './ModelosList';
import ModeloEditorTela from './ModeloEditorTela';

/**
 * Documentos › Ofícios — casca do módulo (F1: aba Modelos funcional; a aba
 * Ofícios chega na F2 com "Novo ofício").
 * Plano: docs/planos/2026-10-07-gerador-de-oficios.md.
 *
 * Organização: `useOrgContext()` (REGRA #5) — nunca a prop crua do AppRouter.
 */
type Aba = 'oficios' | 'modelos';

interface Props {
    projects: unknown[];
    currentProfile: { group: string; role: string; email?: string };
    onChangeView: (view: string) => void;
}

const CABECALHO: Record<Aba, { titulo: string; subtitulo: string }> = {
    oficios: { titulo: 'Ofícios', subtitulo: 'Correspondência oficial da organização: elaboração, emissão numerada e arquivo no GED.' },
    modelos: { titulo: 'Modelos de ofício', subtitulo: 'Modelos com cabeçalho, variáveis do sistema e campos de redação livre.' },
};

export default function OficiosModule(_props: Props) {
    const { orgId } = useOrgContext();
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [aba, setAba] = usePersistedState<Aba>('oficios:aba', 'modelos');
    const [modelos, setModelos] = React.useState<DocGenModelo[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [editor, setEditor] = React.useState<{ aberto: boolean; modelo: DocGenModelo | null }>({ aberto: false, modelo: null });
    const { nomePorId } = useDepartamentosDaOrg(orgId);

    const carregar = React.useCallback(async () => {
        setLoading(true);
        try {
            setModelos(await docGenModeloService.list(orgId));
        } catch (e) {
            console.error('[OficiosModule] Erro ao carregar modelos:', e);
            showToast('Não foi possível carregar os modelos.', 'error');
        } finally {
            setLoading(false);
        }
    }, [orgId, showToast]);

    React.useEffect(() => { void carregar(); }, [carregar]);

    // §22 — estado local, sem recarregar a tabela inteira.
    const handleSaved = (salvo: DocGenModelo | null, criado: boolean) => {
        if (!salvo) { void carregar(); return; }      // replicou em várias orgs
        setModelos(prev => {
            const existe = prev.some(m => m.id === salvo.id);
            return existe ? prev.map(m => (m.id === salvo.id ? salvo : m)) : [...prev, salvo].sort((a, b) => a.nome.localeCompare(b.nome));
        });
        if (criado) setAba('modelos');
    };

    const duplicar = async (m: DocGenModelo) => {
        try {
            const copia = await docGenModeloService.duplicate(m);
            setModelos(prev => [...prev, copia].sort((a, b) => a.nome.localeCompare(b.nome)));
            showToast('Modelo duplicado.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao duplicar.', 'error');
        }
    };

    const alternarStatus = async (m: DocGenModelo) => {
        try {
            const novo = await docGenModeloService.setStatus(m.id, m.status === 'ativo' ? 'inativo' : 'ativo');
            setModelos(prev => prev.map(x => (x.id === novo.id ? novo : x)));
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao alterar o status.', 'error');
        }
    };

    const excluir = async (m: DocGenModelo) => {
        const ok = await confirm({
            title: 'Excluir modelo?',
            message: `"${m.nome}" e o histórico de versões dele serão apagados. Essa ação não pode ser desfeita.`,
            variant: 'danger',
            confirmLabel: 'Excluir',
        });
        if (!ok) return;
        try {
            await docGenModeloService.remove(m.id);
            setModelos(prev => prev.filter(x => x.id !== m.id));
            showToast('Modelo excluído.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao excluir.', 'error');
        }
    };

    if (editor.aberto) {
        return (
            <ModeloEditorTela
                modelo={editor.modelo}
                organizationId={orgId}
                onClose={() => setEditor({ aberto: false, modelo: null })}
                onSaved={handleSaved}
            />
        );
    }

    const cab = CABECALHO[aba];

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h1 className="text-3xl font-black text-gray-900 tracking-tight">{cab.titulo}</h1>
                <p className="text-gray-400 text-sm mt-1.5 font-medium">{cab.subtitulo}</p>
            </div>

            <TabsBar<Aba>
                tabs={[
                    { id: 'oficios', label: 'Ofícios', icon: <FileText className="w-4 h-4" /> },
                    { id: 'modelos', label: 'Modelos', icon: <LayoutTemplate className="w-4 h-4" />, badge: modelos.length },
                ]}
                value={aba}
                onChange={setAba}
            >
                {aba === 'modelos' ? (
                    <button type="button" onClick={() => setEditor({ aberto: true, modelo: null })}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                        <Plus className="w-[15px] h-[15px]" /> Novo modelo
                    </button>
                ) : (
                    /* Botão desligado SEMPRE diz o motivo (memória feedback_botao_desligado_sempre_diz_por_que). */
                    <button type="button" disabled title="A criação de ofícios chega na próxima entrega (F2). Prepare os modelos enquanto isso."
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] font-medium text-[13px] opacity-50 cursor-not-allowed">
                        <Plus className="w-[15px] h-[15px]" /> Novo ofício
                    </button>
                )}
            </TabsBar>

            {aba === 'modelos' ? (
                <ModelosList
                    modelos={modelos}
                    loading={loading}
                    nomeDepartamento={id => (id ? nomePorId[id] ?? '' : '')}
                    onAbrir={m => setEditor({ aberto: true, modelo: m })}
                    onDuplicar={duplicar}
                    onAlternarStatus={alternarStatus}
                    onExcluir={excluir}
                />
            ) : (
                <div className="text-center py-12 bg-white rounded-[10px] shadow-sm border border-gray-100">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum ofício ainda</h3>
                    <p className="text-sm text-gray-500 max-w-md mx-auto">
                        A elaboração de ofícios (destinatário, redação, validação e emissão numerada) chega na próxima entrega.
                        Enquanto isso, prepare os modelos na aba ao lado.
                    </p>
                    <button type="button" onClick={() => setAba('modelos')}
                        className="mt-4 h-9 px-3.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-[6px] hover:bg-blue-100">
                        Ir para Modelos
                    </button>
                </div>
            )}
        </div>
    );
}

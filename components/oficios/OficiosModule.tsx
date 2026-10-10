import React from 'react';
import { FileText, Plus, LayoutTemplate, Inbox, FileUp, Library } from 'lucide-react';
import { TabsBar } from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';
import { useToast } from '../../hooks/useToast';
import { useOrgContext } from '../../hooks/useOrgContext';
import { useDepartamentosDaOrg } from '../../hooks/useDepartamentosDaOrg';
import { docGenModeloService } from '../../services/docGenModeloService';
import { docGenDocumentoService } from '../../services/docGenDocumentoService';
import { useStore } from '../../store/useStore';
import type { DocGenBloco, DocGenDocumento, DocGenModelo, DocGenVinculo } from '../../types/docGen';
import { docGenBlocoService } from '../../services/docGenBlocoService';
import BlocosList from './BlocosList';
import { listarRecebidos, urlDoRecebido, type OficioRecebido } from '../../services/docGen/tramitacao';
import ModelosList from './ModelosList';
import ModeloEditorTela from './ModeloEditorTela';
import OficiosList from './OficiosList';
import NovoOficioTela from './NovoOficioTela';
import EscolherModeloSheet from './EscolherModeloSheet';
import RecebidosList from './RecebidosList';
import RegistrarRecebidoSheet from './RegistrarRecebidoSheet';

/**
 * Documentos › Ofícios — casca do módulo. F1: aba Modelos. F2: aba Ofícios
 * (rascunhos com destinatário, redação, anexos, signatários e validação).
 * F4: aba Recebidos (ofícios de terceiros arquivados no GED) e "Responder".
 * Plano: docs/planos/2026-10-07-gerador-de-oficios.md.
 *
 * Organização: `useOrgContext()` (REGRA #5) — nunca a prop crua do AppRouter.
 */
type Aba = 'oficios' | 'recebidos' | 'modelos' | 'blocos';

interface Props {
    projects: unknown[];
    currentProfile: { group: string; role: string; email?: string };
    onChangeView: (view: string) => void;
}

const CABECALHO: Record<Aba, { titulo: string; subtitulo: string }> = {
    oficios: { titulo: 'Ofícios', subtitulo: 'Correspondência oficial da organização: elaboração, emissão numerada e arquivo no GED.' },
    recebidos: { titulo: 'Ofícios recebidos', subtitulo: 'O que chegou de prefeituras, concessionárias e órgãos: arquivo no GED, prazo de resposta e o ofício que respondeu.' },
    modelos: { titulo: 'Modelos de ofício', subtitulo: 'Modelos com cabeçalho, variáveis do sistema e campos de redação livre.' },
    blocos: { titulo: 'Biblioteca de blocos', subtitulo: 'Trechos prontos da organização para inserir nos modelos e na redação dos ofícios.' },
};

export default function OficiosModule(_props: Props) {
    const { orgId } = useOrgContext();
    const { showToast } = useToast();
    const [aba, setAba] = usePersistedState<Aba>('oficios:aba', 'oficios');
    const [modelos, setModelos] = React.useState<DocGenModelo[]>([]);
    const [documentos, setDocumentos] = React.useState<DocGenDocumento[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [editor, setEditor] = React.useState<{ aberto: boolean; modelo: DocGenModelo | null }>({ aberto: false, modelo: null });
    const [oficio, setOficio] = React.useState<{ modelo: DocGenModelo; documento: DocGenDocumento | null; respondendoA?: OficioRecebido | null } | null>(null);
    const [escolhendoModelo, setEscolhendoModelo] = React.useState(false);
    const [recebidos, setRecebidos] = React.useState<OficioRecebido[]>([]);
    const [vinculosRecebidos, setVinculosRecebidos] = React.useState<DocGenVinculo[]>([]);
    const [registrandoRecebido, setRegistrandoRecebido] = React.useState(false);
    // "Responder" um recebido: guarda o alvo enquanto o usuário escolhe o modelo.
    const [respondendoA, setRespondendoA] = React.useState<OficioRecebido | null>(null);
    const [blocos, setBlocos] = React.useState<DocGenBloco[]>([]);
    const [blocoEditando, setBlocoEditando] = React.useState<DocGenBloco | 'novo' | null>(null);
    const emailUsuario = useStore(s => s.currentProfile?.email ?? null);
    const navigateToFocus = useStore(s => s.navigateToFocus);
    const { nomePorId } = useDepartamentosDaOrg(orgId);
    const organizations = useStore(s => s.organizations);

    const carregar = React.useCallback(async () => {
        setLoading(true);
        try {
            const [m, d, r, b] = await Promise.all([docGenModeloService.list(orgId), docGenDocumentoService.list(orgId), listarRecebidos(orgId), docGenBlocoService.list(orgId)]);
            setBlocos(b);
            setModelos(m);
            setDocumentos(d);
            setRecebidos(r);
            setVinculosRecebidos(await docGenDocumentoService.listVinculosDoGed(r.map(x => x.documento.id)));
        } catch (e) {
            console.error('[OficiosModule] Erro ao carregar ofícios/modelos:', e);
            showToast('Não foi possível carregar os ofícios.', 'error');
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

    // A confirmação é a do próprio menu da linha (InlineDisclosureMenu: "Excluir" → "Confirmar",
    // §9.1/§14). Um useConfirm aqui pediria a mesma decisão duas vezes.
    const excluir = async (m: DocGenModelo) => {
        // O banco recusa (FK RESTRICT) apagar modelo com ofício — explica antes, em vez do erro cru.
        const usos = documentos.filter(d => d.modelo_id === m.id).length;
        if (usos > 0) {
            showToast(`"${m.nome}" é usado por ${usos} ofício(s) e não pode ser excluído. Inative o modelo para tirá-lo de uso.`, 'error');
            return;
        }
        try {
            await docGenModeloService.remove(m.id);
            setModelos(prev => prev.filter(x => x.id !== m.id));
            showToast('Modelo excluído.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao excluir.', 'error');
        }
    };

    // ── Ofícios ──
    const abrirOficio = async (d: DocGenDocumento) => {
        const modelo = modelos.find(m => m.id === d.modelo_id);
        if (!modelo) { showToast('O modelo deste ofício não está disponível.', 'error'); return; }
        try {
            const completo = await docGenDocumentoService.get(d.id);   // a lista vem sem o texto
            if (completo) setOficio({ modelo, documento: completo });
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao abrir o ofício.', 'error');
        }
    };

    // §22 — atualiza a linha local.
    const oficioSalvo = (doc: DocGenDocumento) => {
        setDocumentos(prev => {
            const existe = prev.some(x => x.id === doc.id);
            return existe ? prev.map(x => (x.id === doc.id ? doc : x)) : [doc, ...prev];
        });
    };

    const abrirOficioPorId = (id: string) => {
        const d = documentos.find(x => x.id === id);
        if (d) void abrirOficio(d);
        else showToast('Este ofício não está na lista da organização selecionada.', 'error');
    };

    const abrirPdfRecebido = async (r: OficioRecebido) => {
        try {
            window.open(await urlDoRecebido(r, emailUsuario), '_blank', 'noopener');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao abrir o PDF.', 'error');
        }
    };

    const recebidoRegistrado = async (r: OficioRecebido, respondeu: DocGenDocumento | null) => {
        const lista = [r, ...recebidos.filter(x => x.documento.id !== r.documento.id)];
        setRecebidos(lista);
        if (respondeu) {
            const relido = await docGenDocumentoService.get(respondeu.id).catch(() => null);
            if (relido) oficioSalvo(relido);
        }
        docGenDocumentoService.listVinculosDoGed(lista.map(x => x.documento.id)).then(setVinculosRecebidos).catch(() => {});
    };

    const excluirOficio = async (d: DocGenDocumento) => {
        try {
            await docGenDocumentoService.remove(d.id);
            setDocumentos(prev => prev.filter(x => x.id !== d.id));
            showToast('Rascunho excluído.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Falha ao excluir.', 'error');
        }
    };

    if (oficio) {
        return (
            <NovoOficioTela
                key={oficio.documento?.id ?? `novo-${oficio.modelo.id}`}
                modelo={oficio.modelo}
                documento={oficio.documento}
                respondendoA={oficio.respondendoA ?? null}
                documentos={documentos}
                recebidos={recebidos}
                onClose={() => { setOficio(null); void carregar(); }}
                onSaved={oficioSalvo}
                onAbrirOficio={id => {
                    const d = documentos.find(x => x.id === id);
                    const modelo = d ? modelos.find(m => m.id === d.modelo_id) : null;
                    if (!d || !modelo) { showToast('Ofício não encontrado na organização selecionada.', 'error'); return; }
                    void docGenDocumentoService.get(d.id).then(c => c && setOficio({ modelo, documento: c }));
                }}
                onRecebidoRegistrado={r => setRecebidos(prev => [r, ...prev.filter(x => x.documento.id !== r.documento.id)])}
            />
        );
    }

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
                    { id: 'oficios', label: 'Ofícios', icon: <FileText className="w-4 h-4" />, badge: documentos.length },
                    { id: 'recebidos', label: 'Recebidos', icon: <Inbox className="w-4 h-4" />, badge: recebidos.length },
                    { id: 'modelos', label: 'Modelos', icon: <LayoutTemplate className="w-4 h-4" />, badge: modelos.length },
                    { id: 'blocos', label: 'Blocos', icon: <Library className="w-4 h-4" />, badge: blocos.length },
                ]}
                value={aba}
                onChange={setAba}
            >
                {aba === 'blocos' ? (
                    <button type="button" onClick={() => setBlocoEditando('novo')} disabled={!orgId}
                        title={!orgId ? 'Escolha uma organização no topo para criar o bloco' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        <Plus className="w-[15px] h-[15px]" /> Novo bloco
                    </button>
                ) : aba === 'recebidos' ? (
                    <button type="button" onClick={() => setRegistrandoRecebido(true)} disabled={!orgId}
                        title={!orgId ? 'Escolha uma organização no topo para registrar o ofício recebido' : undefined}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                        <FileUp className="w-[15px] h-[15px]" /> Registrar recebido
                    </button>
                ) : aba === 'modelos' ? (
                    <button type="button" onClick={() => setEditor({ aberto: true, modelo: null })}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                        <Plus className="w-[15px] h-[15px]" /> Novo modelo
                    </button>
                ) : (
                    <button type="button" onClick={() => setEscolhendoModelo(true)}
                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95">
                        <Plus className="w-[15px] h-[15px]" /> Novo ofício
                    </button>
                )}
            </TabsBar>

            {aba === 'blocos' ? (
                <BlocosList
                    blocos={blocos}
                    loading={loading}
                    organizationId={orgId}
                    editando={blocoEditando}
                    onEditar={setBlocoEditando}
                    onSalvo={b => setBlocos(prev => [...prev.filter(x => x.id !== b.id), b].sort((x, y) => x.nome.localeCompare(y.nome)))}
                    onExcluido={id => setBlocos(prev => prev.filter(x => x.id !== id))}
                />
            ) : aba === 'recebidos' ? (
                <RecebidosList
                    recebidos={recebidos}
                    vinculos={vinculosRecebidos}
                    documentos={documentos}
                    loading={loading}
                    onAbrirPdf={abrirPdfRecebido}
                    onAbrirGed={r => navigateToFocus('opura-docs', r.documento.id, 'GED_DOCUMENTO')}
                    onResponder={r => { setRespondendoA(r); setEscolhendoModelo(true); }}
                    onAbrirOficio={d => void abrirOficio(d)}
                />
            ) : aba === 'modelos' ? (
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
                <OficiosList
                    documentos={documentos}
                    modelos={modelos}
                    loading={loading}
                    onAbrir={abrirOficio}
                    onExcluir={excluirOficio}
                />
            )}

            {orgId && (
                <RegistrarRecebidoSheet
                    open={registrandoRecebido}
                    onClose={() => setRegistrandoRecebido(false)}
                    organizationId={orgId}
                    emitidos={documentos.filter(d => ['EMITIDO', 'ENVIADO', 'RECEBIDO'].includes(d.status))}
                    emailUsuario={emailUsuario}
                    onRegistrado={(r, respondeu) => void recebidoRegistrado(r, respondeu)}
                />
            )}

            <EscolherModeloSheet
                open={escolhendoModelo}
                onClose={() => { setEscolhendoModelo(false); }}
                modelos={respondendoA ? modelos.filter(m => m.organization_id === respondendoA.documento.organization_id) : modelos}
                nomeOrganizacao={id => organizations.find(o => o.id === id)?.name ?? ''}
                multiplasOrgs={!orgId}
                onEscolher={m => { setOficio({ modelo: m, documento: null, respondendoA }); setRespondendoA(null); }}
                onIrParaModelos={() => setAba('modelos')}
            />
        </div>
    );
}

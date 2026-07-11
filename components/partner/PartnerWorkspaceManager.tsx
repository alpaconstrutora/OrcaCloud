import React, { useState, useEffect, useMemo, Suspense } from 'react';
import {
  Building2,
  Users,
  FolderOpen,
  ClipboardList,
  Plus,
  Trash2,
  Check,
  X,
  ExternalLink,
  PlusCircle,
  Share2,
  UserPlus,
  CheckCircle,
  AlertCircle,
  Eye,
  Link2
} from 'lucide-react';
import Button from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { partnerService } from '../../services/partnerService';
import { partnerPortalTokenService, PartnerPortalToken } from '../../services/partnerPortalTokenService';
import { supplierService } from '../../services/supplierService';

const PartnerPortalPreview = React.lazy(() => import('./PartnerPortal').then(m => ({ default: m.PartnerPortal })));
import { 
  PartnerWorkspace, 
  PartnerUser, 
  PartnerRequest, 
  PartnerSharedDocument,
  PartnerRole
} from '../../types';

interface PartnerWorkspaceManagerProps {
  organizationId: string;
}

const CATEGORIA_LABELS: Record<string, string> = {
  engenharia: 'Projetos',
  juridico: 'Contratos',
  compliance: 'Licenças & Alvarás',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
};
const CATEGORIA_ORDER = ['engenharia', 'juridico', 'compliance', 'financeiro', 'comercial'];

export const PartnerWorkspaceManager: React.FC<PartnerWorkspaceManagerProps> = ({ organizationId }) => {
  const [workspaces, setWorkspaces] = useState<PartnerWorkspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<PartnerWorkspace | null>(null);
  
  // Detalhes do Workspace Selecionado
  const [partnerUsers, setPartnerUsers] = useState<PartnerUser[]>([]);
  const [sharedDocs, setSharedDocs] = useState<PartnerSharedDocument[]>([]);
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [portalToken, setPortalToken] = useState<PartnerPortalToken | null>(null);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Listas auxiliares da Construtora
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);

  // Carregamento e Mensagens
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'usuarios' | 'documentos' | 'solicitacoes'>('usuarios');

  // Modais
  const [isNewWorkspaceModalOpen, setIsNewWorkspaceModalOpen] = useState(false);
  const [newWorkspaceSupplierId, setNewWorkspaceSupplierId] = useState('');
  
  const [isInviteUserModalOpen, setIsInviteUserModalOpen] = useState(false);
  const [inviteUser, setInviteUser] = useState({
    email: '',
    name: '',
    phone: '',
    role: 'GESTOR' as PartnerRole
  });

  const [isShareDocModalOpen, setIsShareDocModalOpen] = useState(false);
  const [docToShareId, setDocToShareId] = useState('');

  // Promover anexo de solicitação a documento formal do GED (Onda 5)
  const [promotingAttachmentPath, setPromotingAttachmentPath] = useState<string | null>(null);
  const [promoteDocName, setPromoteDocName] = useState('');
  const [promoteDocCategoria, setPromoteDocCategoria] = useState('engenharia');
  const [promoting, setPromoting] = useState(false);

  // Relevância do seletor de documentos (Onda 2): projetos onde o fornecedor do workspace tem contrato ativo
  const [relevantProjectIds, setRelevantProjectIds] = useState<string[]>([]);

  // 1. Carregar workspaces e fornecedores iniciais
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        const wss = await partnerService.listWorkspaces(organizationId);
        setWorkspaces(wss);
        if (wss.length > 0) {
          setSelectedWorkspace(wss[0]);
        }

        // Carrega fornecedores ativos da org usando o serviço correto (que inclui globais/locais)
        const sups = await supplierService.listSuppliers(organizationId);
        setSuppliers(sups || []);

        // Carrega documentos ativos da org
        const { data: docs } = await supabase
          .from('opura_documents')
          .select('id, nome, categoria, supplier_id, project_id')
          .eq('organization_id', organizationId);
        setDocuments(docs || []);
      } catch (err) {
        console.error('Erro ao carregar workspaces:', err);
      } finally {
        setLoading(false);
      }
    };
    if (organizationId) loadInitialData();
  }, [organizationId]);

  // 2. Recarregar dados ao selecionar outro workspace
  useEffect(() => {
    if (!selectedWorkspace) return;

    const loadWorkspaceDetails = async () => {
      try {
        const users = await partnerService.listPartnerUsers(selectedWorkspace.id);
        setPartnerUsers(users);
        const docs = await partnerService.listSharedDocuments(selectedWorkspace.id);
        setSharedDocs(docs);
        const reqs = await partnerService.listRequests(selectedWorkspace.id);
        setRequests(reqs);

        // Obras onde este fornecedor tem contrato ativo, para priorizar documentos relevantes no seletor
        const { data: cts } = await supabase
          .from('contracts')
          .select('project_id')
          .eq('supplier_id', selectedWorkspace.supplier_id);
        setRelevantProjectIds((cts || []).map((c: any) => c.project_id).filter(Boolean));

        const tok = await partnerPortalTokenService.getTokenForWorkspace(selectedWorkspace.id);
        setPortalToken(tok);
      } catch (err) {
        console.error('Erro ao carregar detalhes do workspace:', err);
      }
    };

    loadWorkspaceDetails();
  }, [selectedWorkspace]);

  // Gerar/regenerar o link de acesso público do workspace selecionado
  const handleGenerateToken = async () => {
    if (!selectedWorkspace) return;
    setTokenLoading(true);
    try {
      await partnerPortalTokenService.generateToken(selectedWorkspace.id, organizationId);
      const tok = await partnerPortalTokenService.getTokenForWorkspace(selectedWorkspace.id);
      setPortalToken(tok);
    } catch (err) {
      console.error('Erro ao gerar link do portal:', err);
      alert('Erro ao gerar o link de acesso.');
    } finally {
      setTokenLoading(false);
    }
  };

  const handleCopyPortalLink = async () => {
    if (!portalToken) return;
    const url = partnerPortalTokenService.buildPortalUrl(portalToken.token);
    await navigator.clipboard.writeText(url);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const handleRevokeToken = async () => {
    if (!selectedWorkspace) return;
    if (!confirm('Revogar o acesso via link deste parceiro? Ele perderá o acesso imediatamente.')) return;
    setTokenLoading(true);
    try {
      await partnerPortalTokenService.revokeToken(selectedWorkspace.id, organizationId);
      setPortalToken(null);
    } catch (err) {
      console.error('Erro ao revogar link:', err);
      alert('Erro ao revogar o link.');
    } finally {
      setTokenLoading(false);
    }
  };

  // Ativar Workspace
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceSupplierId) return;

    try {
      const created = await partnerService.saveWorkspace({
        organization_id: organizationId,
        supplier_id: newWorkspaceSupplierId,
        is_active: true,
        settings: {}
      });

      // Recarrega lista
      const wss = await partnerService.listWorkspaces(organizationId);
      setWorkspaces(wss);
      const matched = wss.find(w => w.id === created.id);
      if (matched) setSelectedWorkspace(matched);
      setIsNewWorkspaceModalOpen(false);
      setNewWorkspaceSupplierId('');
    } catch (err) {
      console.error('Erro ao ativar workspace:', err);
    }
  };

  // Convidar Usuário Parceiro
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace) return;

    try {
      const created = await partnerService.savePartnerUser({
        partner_workspace_id: selectedWorkspace.id,
        email: inviteUser.email,
        name: inviteUser.name,
        phone: inviteUser.phone,
        role: inviteUser.role,
        is_active: true
      });
      setPartnerUsers((prev) => [...prev, created]);
      setIsInviteUserModalOpen(false);
      setInviteUser({ email: '', name: '', phone: '', role: 'GESTOR' });
    } catch (err) {
      console.error('Erro ao convidar usuário do parceiro:', err);
    }
  };

  // Desativar Usuário Parceiro
  const handleToggleUserActive = async (user: PartnerUser) => {
    try {
      const updated = await partnerService.savePartnerUser({
        ...user,
        is_active: !user.is_active
      });
      setPartnerUsers((prev) => prev.map(u => u.id === user.id ? updated : u));
    } catch (err) {
      console.error('Erro ao alterar status do usuário:', err);
    }
  };

  // Excluir Usuário Parceiro
  const handleDeleteUser = async (id: string) => {
    try {
      await partnerService.deletePartnerUser(id);
      setPartnerUsers((prev) => prev.filter(u => u.id !== id));
    } catch (err) {
      console.error('Erro ao excluir usuário:', err);
    }
  };

  // Documentos recomendados (fornecedor do workspace direto no doc, ou obra com contrato ativo com ele)
  // vs. os demais agrupados por categoria — evita um <select> plano com todos os documentos da org (Onda 2)
  const { recommendedDocs, docsByCategoria } = useMemo(() => {
    if (!selectedWorkspace) {
      return { recommendedDocs: [] as any[], docsByCategoria: {} as Record<string, any[]> };
    }
    const isRelevant = (d: any) =>
      d.supplier_id === selectedWorkspace.supplier_id ||
      (d.project_id && relevantProjectIds.includes(d.project_id));

    const recommended = documents.filter(isRelevant);
    const rest = documents.filter((d) => !isRelevant(d));
    const byCategoria: Record<string, any[]> = {};
    rest.forEach((d) => {
      const key = d.categoria || 'outros';
      if (!byCategoria[key]) byCategoria[key] = [];
      byCategoria[key].push(d);
    });
    return { recommendedDocs: recommended, docsByCategoria: byCategoria };
  }, [documents, selectedWorkspace, relevantProjectIds]);

  // Compartilhar Documento
  const handleShareDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace || !docToShareId) return;

    try {
      await partnerService.shareDocument(selectedWorkspace.id, docToShareId, 'Membro Construtora');
      // Recarrega docs
      const docs = await partnerService.listSharedDocuments(selectedWorkspace.id);
      setSharedDocs(docs);
      setIsShareDocModalOpen(false);
      setDocToShareId('');
    } catch (err) {
      console.error('Erro ao compartilhar documento:', err);
    }
  };

  // Remover Compartilhamento de Documento
  const handleUnshareDoc = async (docId: string) => {
    if (!selectedWorkspace) return;
    try {
      await partnerService.unshareDocument(selectedWorkspace.id, docId);
      setSharedDocs((prev) => prev.filter(sd => sd.document_id !== docId));
    } catch (err) {
      console.error('Erro ao remover compartilhamento:', err);
    }
  };

  // Responder/Atualizar status de solicitação
  const handleUpdateRequestStatus = async (req: PartnerRequest, status: PartnerRequest['status']) => {
    try {
      const updated = await partnerService.saveRequest({
        ...req,
        status: status
      });
      setRequests((prev) => prev.map(r => r.id === req.id ? updated : r));
    } catch (err) {
      console.error('Erro ao atualizar status da solicitação:', err);
    }
  };

  // Baixar um anexo enviado pelo parceiro numa solicitação
  const handleDownloadAttachment = async (path: string) => {
    try {
      const url = await partnerService.getAttachmentDownloadUrl(path);
      window.open(url, '_blank', 'noreferrer');
    } catch (err) {
      console.error('Erro ao baixar anexo:', err);
    }
  };

  // Abrir um documento GED compartilhado (bucket privado, precisa de link assinado)
  const handleViewSharedDocument = async (storagePath: string) => {
    try {
      const url = await partnerService.getDocumentDownloadUrl(storagePath);
      window.open(url, '_blank', 'noreferrer');
    } catch (err) {
      console.error('Erro ao abrir documento:', err);
      alert('Erro ao gerar link de acesso ao documento.');
    }
  };

  // Abrir modal de promoção do anexo a documento formal do GED
  const openPromoteModal = (path: string) => {
    const rawName = path.split('/').pop()?.replace(/^\d+_/, '') || 'Documento do Parceiro';
    setPromotingAttachmentPath(path);
    setPromoteDocName(rawName);
    setPromoteDocCategoria('engenharia');
  };

  // Confirmar promoção do anexo a documento formal do GED (decisão manual do time interno)
  const handleConfirmPromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace || !promotingAttachmentPath || !promoteDocName.trim()) return;

    setPromoting(true);
    try {
      await partnerService.promoteAttachmentToDocument(
        selectedWorkspace.id,
        promotingAttachmentPath,
        promoteDocName.trim(),
        promoteDocCategoria as any,
        'Membro Construtora'
      );
      setPromotingAttachmentPath(null);
      alert('Documento promovido ao GED com sucesso.');
    } catch (err: any) {
      console.error('Erro ao promover anexo:', err);
      alert(err.message || 'Erro ao promover anexo a documento do GED.');
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-white text-gray-800 overflow-hidden font-sans">
      {/* Workspace List Sidebar */}
      <aside className="w-80 border-r border-gray-200 bg-gray-50 p-4 flex flex-col gap-4 shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase text-gray-500 tracking-wider">Parceiros Habilitados</h2>
          <Button variant="ghost" size="icon" onClick={() => setIsNewWorkspaceModalOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => setSelectedWorkspace(ws)}
              className={`flex items-center justify-between w-full px-4 py-3.5 rounded-xl text-button text-left font-medium transition-all border
                ${selectedWorkspace?.id === ws.id 
                  ? 'bg-orange-500/10 border-orange-500/20 text-orange-600 font-bold' 
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Building2 className="w-4 h-4 shrink-0" />
                <span className="truncate">{ws.supplier_name}</span>
              </div>
              <span className={`w-2 h-2 rounded-full ${ws.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
            </button>
          ))}
          {workspaces.length === 0 && (
            <div className="text-center py-12 text-xs text-gray-400 bg-white border border-dashed rounded-xl">
              Nenhum parceiro habilitado. Clique no botão acima para ativar o primeiro.
            </div>
          )}
        </div>
      </aside>

      {/* Main Operations Area */}
      <main className="flex-1 overflow-y-auto p-6 bg-white flex flex-col gap-6">
        {selectedWorkspace ? (
          <>
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-5">
              <div>
                <span className="text-xs uppercase font-bold text-orange-500 tracking-wider">Workspace Selecionado</span>
                <h1 className="text-xl font-bold text-gray-900 mt-1">{selectedWorkspace.supplier_name}</h1>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTokenModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 border rounded-xl text-button font-semibold active:scale-95 transition-all bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Link de Acesso
                </button>
                <button
                  onClick={() => setPreviewOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 border rounded-xl text-button font-semibold active:scale-95 transition-all bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Visualizar como Parceiro
                </button>
                <button
                  onClick={async () => {
                    const toggled = await partnerService.saveWorkspace({
                      ...selectedWorkspace,
                      is_active: !selectedWorkspace.is_active
                    });
                    setWorkspaces(prev => prev.map(w => w.id === selectedWorkspace.id ? { ...w, is_active: toggled.is_active } : w));
                    setSelectedWorkspace(prev => prev ? { ...prev, is_active: toggled.is_active } : null);
                  }}
                  className={`px-4 py-2 border rounded-xl text-button font-semibold active:scale-95 transition-all
                    ${selectedWorkspace.is_active
                      ? 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                >
                  {selectedWorkspace.is_active ? 'Workspace Ativo' : 'Workspace Inativo'}
                </button>
              </div>
            </div>

            {/* Navigation Tabs inside Selected Workspace */}
            <div className="flex border-b border-gray-100 shrink-0 gap-2">
              <button 
                onClick={() => setActiveSubTab('usuarios')}
                className={`px-4 py-2.5 text-button font-bold border-b-2 transition-all flex items-center gap-2
                  ${activeSubTab === 'usuarios' ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
              >
                <Users className="w-4 h-4" />
                Usuários ({partnerUsers.length})
              </button>
              <button 
                onClick={() => setActiveSubTab('documentos')}
                className={`px-4 py-2.5 text-button font-bold border-b-2 transition-all flex items-center gap-2
                  ${activeSubTab === 'documentos' ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
              >
                <FolderOpen className="w-4 h-4" />
                Documentos GED ({sharedDocs.length})
              </button>
              <button 
                onClick={() => setActiveSubTab('solicitacoes')}
                className={`px-4 py-2.5 text-button font-bold border-b-2 transition-all flex items-center gap-2
                  ${activeSubTab === 'solicitacoes' ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
              >
                <ClipboardList className="w-4 h-4" />
                Solicitações ({requests.length})
              </button>
            </div>

            {/* SUBTAB: USUÁRIOS */}
            {activeSubTab === 'usuarios' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">Equipe Externa do Parceiro</h3>
                  <Button onClick={() => setIsInviteUserModalOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/10">
                    <UserPlus className="w-4 h-4" />
                    Convidar Integrante
                  </Button>
                </div>

                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-400 uppercase tracking-wider">
                        <th className="px-5 py-3">Nome</th>
                        <th className="px-5 py-3">E-mail</th>
                        <th className="px-5 py-3">Telefone</th>
                        <th className="px-5 py-3">Papel/Função</th>
                        <th className="px-5 py-3 text-center">Status</th>
                        <th className="px-5 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs">
                      {partnerUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-5 py-4 font-bold text-gray-900">{user.name}</td>
                          <td className="px-5 py-4 text-gray-500">{user.email}</td>
                          <td className="px-5 py-4 text-gray-500">{user.phone || '-'}</td>
                          <td className="px-5 py-4">
                            <span className="px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-500 text-xs font-bold rounded-md uppercase">
                              {user.role}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <button
                              onClick={() => handleToggleUserActive(user)}
                              className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block
                                ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                            >
                              {user.is_active ? 'ATIVO' : 'INATIVO'}
                            </button>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(user.id)} title="Excluir Usuário">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {partnerUsers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-table-body text-gray-400 bg-white">
                            Nenhum usuário convidado para este parceiro.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SUBTAB: DOCUMENTOS */}
            {activeSubTab === 'documentos' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">Documentos GED Compartilhados</h3>
                  <Button onClick={() => setIsShareDocModalOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/10">
                    <Share2 className="w-4 h-4" />
                    Compartilhar Arquivo
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sharedDocs.map((sd) => (
                    <div key={sd.id} className="bg-white border border-gray-200 p-4 rounded-2xl flex flex-col gap-3 shadow-sm hover:border-gray-300 transition-all relative group">
                      <Button variant="ghost" size="icon" onClick={() => handleUnshareDoc(sd.document_id)} title="Remover Compartilhamento" className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                      
                      <div className="flex items-start justify-between">
                        <div className="p-2 bg-orange-50 text-orange-500 rounded-xl"><FolderOpen className="w-5 h-5" /></div>
                        <span className="text-[9px] uppercase font-bold text-gray-400 mt-1">{sd.document?.categoria}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-gray-900 truncate">{sd.document?.nome}</h4>
                        <p className="text-xs text-gray-500 mt-1 truncate">{sd.document?.descricao || 'Sem descrição'}</p>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-3 mt-1">
                        <span>Compartilhado: {new Date(sd.shared_at).toLocaleDateString()}</span>
                        {sd.document?.active_version?.storage_path && (
                          <button
                            type="button"
                            onClick={() => handleViewSharedDocument(sd.document!.active_version!.storage_path)}
                            className="flex items-center gap-0.5 text-orange-500 hover:text-orange-600 font-semibold"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Ver</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {sharedDocs.length === 0 && (
                    <div className="col-span-full text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-2xl text-xs text-gray-400">
                      Nenhum documento compartilhado com este parceiro.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUBTAB: SOLICITAÇÕES */}
            {activeSubTab === 'solicitacoes' && (
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-bold text-gray-800">Solicitações de Atendimento do Parceiro</h3>
                
                <div className="flex flex-col gap-3">
                  {requests.map((req) => (
                    <div key={req.id} className="bg-white border border-gray-200 p-4.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`px-2 py-0.5 text-[9px] font-black rounded-md border
                            ${req.priority === 'ALTA' ? 'bg-red-50 text-red-500 border-red-100' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                            {req.priority}
                          </span>
                          <span className="text-xs text-gray-500 font-bold uppercase">{req.type}</span>
                        </div>
                        <h4 className="text-xs font-bold text-gray-900 truncate">{req.title}</h4>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{req.description}</p>
                        {req.attachment_paths && req.attachment_paths.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {req.attachment_paths.map((path, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg pl-2 pr-1 py-1">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadAttachment(path)}
                                  className="text-xs text-orange-600 hover:text-orange-700 font-semibold truncate max-w-[9rem]"
                                  title="Baixar anexo"
                                >
                                  {path.split('/').pop()?.replace(/^\d+_/, '')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openPromoteModal(path)}
                                  className="text-[10px] uppercase font-bold text-blue-600 hover:text-blue-700 border-l border-gray-200 pl-1.5"
                                  title="Promover a documento formal do GED"
                                >
                                  GED
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 shrink-0 border-t md:border-t-0 border-gray-100 pt-3 md:pt-0">
                        <div className="flex flex-col text-left md:text-right">
                          <span className="text-xs text-gray-400 uppercase font-semibold">Status Atual</span>
                          <span className={`text-xs font-bold mt-1 px-2.5 py-0.5 rounded-full inline-block
                            ${req.status === 'CONCLUIDO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {req.status}
                          </span>
                        </div>

                        {/* Ações de Workflow */}
                        <div className="flex gap-1.5">
                          {req.status === 'ABERTO' && (
                            <Button variant="secondary" size="sm" onClick={() => handleUpdateRequestStatus(req, 'EM_ANALISE')} className="bg-yellow-50 text-yellow-600 hover:bg-yellow-100 border border-yellow-200">
                              Analisar
                            </Button>
                          )}
                          {(req.status === 'ABERTO' || req.status === 'EM_ANALISE') && (
                            <Button variant="secondary" size="sm" onClick={() => handleUpdateRequestStatus(req, 'CONCLUIDO')} className="bg-green-50 text-green-600 hover:bg-green-100 border border-green-200">
                              Concluir
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {requests.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-2xl text-xs text-gray-400">
                      Nenhuma solicitação aberta por este parceiro.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <Building2 className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-md font-bold text-gray-800 mb-1">Nenhum Parceiro Selecionado</h3>
            <p className="text-xs text-gray-400 max-w-sm leading-relaxed">
              Habilite ou escolha um parceiro na lista lateral para gerenciar sua equipe, compartilhar projetos e responder às suas solicitações.
            </p>
          </div>
        )}
      </main>

      {/* MODAL: ATIVAR NOVO WORKSPACE */}
      {isNewWorkspaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-gray-200 max-w-md w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-md font-bold text-gray-900">Habilitar Portal do Parceiro</h3>
            
            <form onSubmit={handleCreateWorkspace} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Fornecedor / Prestador de Serviço</label>
                <select
                  required
                  value={newWorkspaceSupplierId}
                  onChange={(e) => setNewWorkspaceSupplierId(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-form-input text-gray-800 focus:outline-none"
                >
                  <option value="">Selecione um prestador...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 mt-2">
                <Button variant="ghost" type="button" onClick={() => setIsNewWorkspaceModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white">
                  Ativar Workspace
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONVIDAR USUÁRIO */}
      {isInviteUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-gray-200 max-w-md w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-md font-bold text-gray-900">Convidar Integrante</h3>
            
            <form onSubmit={handleInviteUser} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Nome Completo</label>
                <input
                  required
                  value={inviteUser.name}
                  onChange={(e) => setInviteUser({ ...inviteUser, name: e.target.value })}
                  placeholder="Nome do integrante..."
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-form-input text-gray-800 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">E-mail de Login</label>
                <input
                  required
                  type="email"
                  value={inviteUser.email}
                  onChange={(e) => setInviteUser({ ...inviteUser, email: e.target.value })}
                  placeholder="email@parceiro.com"
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-form-input text-gray-800 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 uppercase font-bold">Celular / Telefone</label>
                  <input
                    value={inviteUser.phone}
                    onChange={(e) => setInviteUser({ ...inviteUser, phone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-form-input text-gray-800 focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 uppercase font-bold">Perfil / Permissão</label>
                  <select
                    value={inviteUser.role}
                    onChange={(e) => setInviteUser({ ...inviteUser, role: e.target.value as any })}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-form-input text-gray-800 focus:outline-none"
                  >
                    <option value="ADMINISTRADOR">Administrador (Total)</option>
                    <option value="GESTOR">Gestor (Visualização)</option>
                    <option value="FINANCEIRO">Somente Financeiro</option>
                    <option value="OPERACIONAL">Operacional / Obras</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 mt-2">
                <Button variant="ghost" type="button" onClick={() => setIsInviteUserModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white">
                  Convidar Integrante
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: COMPARTILHAR DOCUMENTO */}
      {isShareDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-gray-200 max-w-md w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-md font-bold text-gray-900">Compartilhar Arquivo GED</h3>
            
            <form onSubmit={handleShareDoc} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Documento / Projeto</label>
                <select
                  required
                  value={docToShareId}
                  onChange={(e) => setDocToShareId(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-form-input text-gray-800 focus:outline-none"
                >
                  <option value="">Selecione um documento...</option>
                  {recommendedDocs.length > 0 && (
                    <optgroup label="★ Recomendados para este fornecedor">
                      {recommendedDocs.map(d => (
                        <option key={d.id} value={d.id}>[{CATEGORIA_LABELS[d.categoria] || d.categoria}] {d.nome}</option>
                      ))}
                    </optgroup>
                  )}
                  {CATEGORIA_ORDER.filter((cat) => docsByCategoria[cat]?.length).map((cat) => (
                    <optgroup key={cat} label={CATEGORIA_LABELS[cat] || cat}>
                      {docsByCategoria[cat].map((d) => (
                        <option key={d.id} value={d.id}>{d.nome}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {recommendedDocs.length > 0 && (
                  <p className="text-xs text-gray-400 pt-1">
                    ★ = documento já vinculado a este fornecedor ou a uma obra onde ele tem contrato ativo.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 mt-2">
                <Button variant="ghost" type="button" onClick={() => setIsShareDocModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white">
                  Compartilhar Arquivo
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PROMOVER ANEXO A DOCUMENTO DO GED */}
      {promotingAttachmentPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-gray-200 max-w-md w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-md font-bold text-gray-900">Promover Anexo a Documento do GED</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Cria um documento formal em Gestão de Documentos apontando para este mesmo arquivo,
              já vinculado ao fornecedor <strong>{selectedWorkspace?.supplier_name}</strong>. O anexo
              original da solicitação continua disponível normalmente.
            </p>

            <form onSubmit={handleConfirmPromote} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Nome do Documento</label>
                <input
                  required
                  value={promoteDocName}
                  onChange={(e) => setPromoteDocName(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-form-input text-gray-800 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Categoria</label>
                <select
                  value={promoteDocCategoria}
                  onChange={(e) => setPromoteDocCategoria(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-form-input text-gray-800 focus:outline-none"
                >
                  {CATEGORIA_ORDER.map((cat) => (
                    <option key={cat} value={cat}>{CATEGORIA_LABELS[cat]}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 mt-2">
                <Button variant="ghost" type="button" onClick={() => setPromotingAttachmentPath(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={promoting} className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50">
                  {promoting ? 'Promovendo...' : 'Promover ao GED'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LINK DE ACESSO PÚBLICO (SEM LOGIN) */}
      {tokenModalOpen && selectedWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-gray-200 max-w-lg w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-md font-bold text-gray-900">Link de Acesso ao Portal</h3>
                <p className="text-sm text-gray-400 font-medium mt-0.5">{selectedWorkspace.supplier_name}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setTokenModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              Compartilhe este link com o fornecedor para que ele acesse o portal direto, sem
              precisar de senha ou cadastro prévio. Ele consegue ver documentos e contratos,
              enviar mensagens e abrir solicitações — só o envio de arquivos fica restrito ao
              acesso convidado (com login).
            </p>

            {tokenLoading ? (
              <div className="text-center py-6 text-xs text-gray-400">Carregando...</div>
            ) : portalToken && portalToken.is_active ? (
              <>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-1">
                  <p className="text-xs font-mono text-gray-700 break-all">
                    {partnerPortalTokenService.buildPortalUrl(portalToken.token)}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Expira em: {new Date(portalToken.expires_at).toLocaleDateString('pt-BR')}
                    {portalToken.last_used_at && ` · Último acesso: ${new Date(portalToken.last_used_at).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCopyPortalLink} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
                    {tokenCopied ? 'Copiado!' : 'Copiar Link'}
                  </Button>
                  <Button variant="secondary" onClick={handleGenerateToken} title="Gerar um novo link (invalida o atual)">
                    Regenerar
                  </Button>
                  <Button variant="ghost" onClick={handleRevokeToken} className="text-red-500 hover:bg-red-50" title="Revogar acesso">
                    Revogar
                  </Button>
                </div>
              </>
            ) : (
              <Button onClick={handleGenerateToken} className="bg-orange-500 hover:bg-orange-600 text-white">
                Gerar Link de Acesso
              </Button>
            )}
          </div>
        </div>
      )}

      {/* PRÉ-VISUALIZAÇÃO: como o parceiro veria o próprio portal */}
      {previewOpen && selectedWorkspace && (
        <div className="fixed inset-0 z-[10000] bg-black">
          <button
            onClick={() => setPreviewOpen(false)}
            className="absolute top-3 right-3 z-[10001] flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-800 rounded-lg text-xs font-bold shadow-lg hover:bg-gray-100"
          >
            <X className="w-3.5 h-3.5" />
            Fechar Pré-visualização
          </button>
          <Suspense fallback={<div className="flex items-center justify-center h-screen bg-[#141414] text-white text-sm">Carregando pré-visualização...</div>}>
            <PartnerPortalPreview userEmail="" previewWorkspaceId={selectedWorkspace.id} onExitPreview={() => setPreviewOpen(false)} />
          </Suspense>
        </div>
      )}
    </div>
  );
};

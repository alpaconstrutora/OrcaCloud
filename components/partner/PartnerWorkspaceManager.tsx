import React, { useState, useEffect } from 'react';
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
  AlertCircle 
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { partnerService } from '../../services/partnerService';
import { supplierService } from '../../services/supplierService';
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

export const PartnerWorkspaceManager: React.FC<PartnerWorkspaceManagerProps> = ({ organizationId }) => {
  const [workspaces, setWorkspaces] = useState<PartnerWorkspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<PartnerWorkspace | null>(null);
  
  // Detalhes do Workspace Selecionado
  const [partnerUsers, setPartnerUsers] = useState<PartnerUser[]>([]);
  const [sharedDocs, setSharedDocs] = useState<PartnerSharedDocument[]>([]);
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  
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
          .select('id, nome, categoria')
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
      } catch (err) {
        console.error('Erro ao carregar detalhes do workspace:', err);
      }
    };

    loadWorkspaceDetails();
  }, [selectedWorkspace]);

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

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-white text-gray-800 overflow-hidden font-sans">
      {/* Workspace List Sidebar */}
      <aside className="w-80 border-r border-gray-200 bg-gray-50 p-4 flex flex-col gap-4 shrink-0 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase text-gray-500 tracking-wider">Parceiros Habilitados</h2>
          <button
            onClick={() => setIsNewWorkspaceModalOpen(true)}
            className="p-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all text-white rounded-lg"
            title="Ativar Workspace de Parceiro"
          >
            <Plus className="w-4 h-4" />
          </button>
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
                  <button 
                    onClick={() => setIsInviteUserModalOpen(true)}
                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-button font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-orange-500/10"
                  >
                    <UserPlus className="w-4 h-4" />
                    Convidar Integrante
                  </button>
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
                            <button 
                              onClick={() => handleDeleteUser(user.id)}
                              className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg text-gray-400 active:scale-95 transition-all"
                              title="Excluir Usuário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
                  <button 
                    onClick={() => setIsShareDocModalOpen(true)}
                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-button font-bold px-4 py-2 rounded-xl transition-all shadow-md shadow-orange-500/10"
                  >
                    <Share2 className="w-4 h-4" />
                    Compartilhar Arquivo
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sharedDocs.map((sd) => (
                    <div key={sd.id} className="bg-white border border-gray-200 p-4 rounded-2xl flex flex-col gap-3 shadow-sm hover:border-gray-300 transition-all relative group">
                      <button 
                        onClick={() => handleUnshareDoc(sd.document_id)}
                        className="absolute top-3 right-3 p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 active:scale-95 transition-all"
                        title="Remover Compartilhamento"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      
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
                          <a
                            href={`${supabase.storage.from('opura-docs').getPublicUrl(sd.document.active_version.storage_path).data.publicUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-0.5 text-orange-500 hover:text-orange-600 font-semibold"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Ver</span>
                          </a>
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
                            <button
                              onClick={() => handleUpdateRequestStatus(req, 'EM_ANALISE')}
                              className="px-2.5 py-1.5 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 rounded-lg text-xs font-bold border border-yellow-200 active:scale-95 transition-all"
                            >
                              Analisar
                            </button>
                          )}
                          {(req.status === 'ABERTO' || req.status === 'EM_ANALISE') && (
                            <button
                              onClick={() => handleUpdateRequestStatus(req, 'CONCLUIDO')}
                              className="px-2.5 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg text-xs font-bold border border-green-200 active:scale-95 transition-all"
                            >
                              Concluir
                            </button>
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
                <button
                  type="button"
                  onClick={() => setIsNewWorkspaceModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-button text-gray-500 hover:bg-gray-50 transition-all font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 rounded-xl text-button text-white font-bold transition-all"
                >
                  Ativar Workspace
                </button>
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
                <button
                  type="button"
                  onClick={() => setIsInviteUserModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-button text-gray-500 hover:bg-gray-50 transition-all font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 rounded-xl text-button text-white font-bold transition-all"
                >
                  Convidar Integrante
                </button>
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
                  {documents.map(d => (
                    <option key={d.id} value={d.id}>[{d.categoria}] {d.nome}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setIsShareDocModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-button text-gray-500 hover:bg-gray-50 transition-all font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 active:scale-95 rounded-xl text-button text-white font-bold transition-all"
                >
                  Compartilhar Arquivo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

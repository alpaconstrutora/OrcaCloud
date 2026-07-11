import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  MessageSquare, 
  FolderOpen, 
  FileText, 
  ClipboardList, 
  Send, 
  Paperclip, 
  Download, 
  Plus, 
  Calendar, 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Search,
  User,
  Activity,
  DollarSign
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { partnerService } from '../../services/partnerService';
import { contractService } from '../../services/contractService';
import Button from '../ui/Button';
import { 
  PartnerWorkspace, 
  PartnerUser, 
  PartnerConversation, 
  PartnerMessage, 
  PartnerRequest, 
  PartnerSharedDocument,
  Contract
} from '../../types';

interface PartnerPortalProps {
  userEmail: string;
}

const CATEGORIA_LABELS: Record<string, string> = {
  engenharia: 'Projetos',
  juridico: 'Contratos',
  compliance: 'Licenças & Alvarás',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
};
const CATEGORIA_ORDER = ['engenharia', 'juridico', 'compliance', 'financeiro', 'comercial'];

export const PartnerPortal: React.FC<PartnerPortalProps> = ({ userEmail }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'conversas' | 'documentos' | 'contratos' | 'solicitacoes'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dados do Parceiro
  const [partnerUser, setPartnerUser] = useState<PartnerUser | null>(null);
  const [workspace, setWorkspace] = useState<PartnerWorkspace | null>(null);
  
  // Dados das abas
  const [conversations, setConversations] = useState<PartnerConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<PartnerConversation | null>(null);
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sharedDocs, setSharedDocs] = useState<PartnerSharedDocument[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  
  // Modais
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    title: '',
    description: '',
    type: 'TECNICA' as any,
    priority: 'MEDIA' as any
  });
  const [newRequestFiles, setNewRequestFiles] = useState<File[]>([]);
  const [creatingRequest, setCreatingRequest] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Feed unificado de atividades (documentos compartilhados + solicitações), mais recente primeiro
  const recentActivity = React.useMemo(() => {
    const docActivities = sharedDocs.map((sd) => ({
      id: `doc-${sd.id}`,
      kind: 'documento' as const,
      label: sd.document?.categoria || 'Documento',
      title: sd.document?.nome || 'Documento compartilhado',
      date: sd.shared_at,
    }));
    const reqActivities = requests.map((req) => ({
      id: `req-${req.id}`,
      kind: 'solicitacao' as const,
      label: req.type,
      title: req.title,
      date: req.created_at,
      status: req.status,
    }));
    return [...docActivities, ...reqActivities]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [sharedDocs, requests]);

  const isRecentlyShared = (dateStr: string) => (Date.now() - new Date(dateStr).getTime()) < 48 * 60 * 60 * 1000;

  const [docSearchQuery, setDocSearchQuery] = useState('');

  // Documentos compartilhados, filtrados pela busca e agrupados por categoria (Onda 4)
  const docsByCategoria = React.useMemo(() => {
    const q = docSearchQuery.trim().toLowerCase();
    const filtered = q
      ? sharedDocs.filter((sd) =>
          (sd.document?.nome || '').toLowerCase().includes(q) ||
          (sd.document?.descricao || '').toLowerCase().includes(q)
        )
      : sharedDocs;

    const grouped: Record<string, PartnerSharedDocument[]> = {};
    filtered.forEach((sd) => {
      const key = sd.document?.categoria || 'outros';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(sd);
    });
    return grouped;
  }, [sharedDocs, docSearchQuery]);

  // 1. Carregar perfil e workspace inicial
  useEffect(() => {
    const loadPartnerProfile = async () => {
      try {
        setLoading(true);
        const user = await partnerService.getPartnerUserByEmail(userEmail);
        if (!user) {
          setError('Nenhum perfil de parceiro externo ativo foi encontrado para este e-mail.');
          setLoading(false);
          return;
        }
        setPartnerUser(user);

        const ws = await partnerService.getWorkspaceById(user.partner_workspace_id);
        if (!ws || !ws.is_active) {
          setError('O workspace de colaboração deste parceiro está inativo ou indisponível.');
          setLoading(false);
          return;
        }
        setWorkspace(ws);
        setLoading(false);
      } catch (err: any) {
        console.error('Erro ao carregar perfil do parceiro:', err);
        setError(err.message || 'Erro inesperado ao carregar dados do portal.');
        setLoading(false);
      }
    };
    if (userEmail) loadPartnerProfile();
  }, [userEmail]);

  // 2. Carregar dados específicos de cada aba
  useEffect(() => {
    if (!workspace) return;

    const loadTabData = async () => {
      try {
        if (activeTab === 'dashboard') {
          // Carrega resumos rápidos
          const docs = await partnerService.listSharedDocuments(workspace.id);
          setSharedDocs(docs);
          const reqs = await partnerService.listRequests(workspace.id);
          setRequests(reqs);
          const { data: cts } = await supabase.from('contracts').select('*').eq('supplier_id', workspace.supplier_id);
          setContracts(cts || []);
        } else if (activeTab === 'conversas') {
          const convs = await partnerService.listConversations(workspace.id);
          setConversations(convs);
          if (convs.length > 0 && !selectedConversation) {
            setSelectedConversation(convs[0]);
          }
        } else if (activeTab === 'documentos') {
          const docs = await partnerService.listSharedDocuments(workspace.id);
          setSharedDocs(docs);
        } else if (activeTab === 'contratos') {
          const { data: cts } = await supabase.from('contracts').select('*').eq('supplier_id', workspace.supplier_id);
          setContracts(cts || []);
        } else if (activeTab === 'solicitacoes') {
          const reqs = await partnerService.listRequests(workspace.id);
          setRequests(reqs);
        }
      } catch (err) {
        console.error('Erro ao carregar dados da aba:', activeTab, err);
      }
    };

    loadTabData();
  }, [workspace, activeTab]);

  // 3. Monitoramento de mensagens do chat selecionado + Realtime
  useEffect(() => {
    if (!selectedConversation) return;

    const loadMessages = async () => {
      const msgs = await partnerService.listMessages(selectedConversation.id);
      setMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    loadMessages();

    // Inscrição Realtime para novas mensagens
    const channel = supabase
      .channel(`partner-chat-${selectedConversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'partner_messages',
          filter: `conversation_id=eq.${selectedConversation.id}`
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as PartnerMessage]);
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversation]);

  // Ações do Chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation || !partnerUser) return;

    try {
      await partnerService.sendMessage({
        conversation_id: selectedConversation.id,
        sender_email: partnerUser.email,
        sender_name: partnerUser.name,
        sender_type: 'EXTERNAL',
        message: newMessage,
        attachments: []
      });
      setNewMessage('');
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    }
  };

  // Criar solicitação (com upload opcional de anexos — Onda 5)
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !partnerUser) return;

    setCreatingRequest(true);
    try {
      const attachmentPaths = await Promise.all(
        newRequestFiles.map((file) => partnerService.uploadRequestAttachment(workspace.id, file))
      );

      const created = await partnerService.saveRequest({
        partner_workspace_id: workspace.id,
        title: newRequest.title,
        description: newRequest.description,
        type: newRequest.type,
        priority: newRequest.priority,
        status: 'ABERTO',
        created_by_email: partnerUser.email,
        attachment_paths: attachmentPaths
      });
      setRequests((prev) => [created, ...prev]);
      setIsNewRequestModalOpen(false);
      setNewRequest({ title: '', description: '', type: 'TECNICA', priority: 'MEDIA' });
      setNewRequestFiles([]);
    } catch (err) {
      console.error('Erro ao criar solicitação:', err);
      alert('Erro ao criar solicitação. Tente novamente.');
    } finally {
      setCreatingRequest(false);
    }
  };

  // Baixar um anexo enviado numa solicitação (gera link assinado, o bucket é privado)
  const handleDownloadAttachment = async (path: string) => {
    try {
      const url = await partnerService.getAttachmentDownloadUrl(path);
      window.open(url, '_blank', 'noreferrer');
    } catch (err) {
      console.error('Erro ao baixar anexo:', err);
      alert('Erro ao baixar o anexo.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#141414] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-gray-400">Carregando portal do parceiro...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#141414] text-white p-6">
        <div className="max-w-md w-full bg-[#1c1c1c] border border-red-500/20 p-6 rounded-2xl text-center shadow-xl">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">Acesso Negado</h3>
          <p className="text-sm text-gray-400 mb-6">{error}</p>
          <Button
            onClick={() => window.location.reload()}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold normal-case tracking-normal"
          >
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#121212] text-gray-100 overflow-hidden font-sans">
      {/* Header Premium */}
      <header className="h-16 border-b border-white/5 bg-[#181818] flex items-center justify-between px-6 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 bg-orange-500 text-white rounded-lg text-xs font-black uppercase tracking-wider">
            Partner Portal
          </div>
          <h1 className="text-md font-bold text-white tracking-tight">
            {workspace?.supplier_name}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
          <User className="w-3.5 h-3.5 text-orange-400" />
          <span className="font-semibold text-gray-300">{partnerUser?.name} ({partnerUser?.role})</span>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-64 border-r border-white/5 bg-[#161616] p-4 flex flex-col gap-1.5 shrink-0">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'dashboard' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('conversas')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'conversas' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Conversas</span>
          </button>
          <button 
            onClick={() => setActiveTab('documentos')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'documentos' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Documentos</span>
          </button>
          <button 
            onClick={() => setActiveTab('contratos')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'contratos' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <FileText className="w-4 h-4" />
            <span>Contratos</span>
          </button>
          <button 
            onClick={() => setActiveTab('solicitacoes')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'solicitacoes' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Solicitações</span>
          </button>
        </aside>

        {/* Dynamic Content Pane */}
        <main className="flex-1 bg-[#121212] overflow-y-auto p-6 relative">
          
          {/* TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="flex flex-col gap-6">
              {/* Header Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#1c1c1c] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-xs text-gray-400 font-medium">Contratos Ativos</span>
                    <h3 className="text-2xl font-black text-white mt-1">{contracts.filter(c => c.status === 'Assinado').length}</h3>
                  </div>
                  <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl"><FileText className="w-5 h-5" /></div>
                </div>
                <div className="bg-[#1c1c1c] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-xs text-gray-400 font-medium">Solicitações Abertas</span>
                    <h3 className="text-2xl font-black text-white mt-1">{requests.filter(r => r.status === 'ABERTO' || r.status === 'EM_ANALISE').length}</h3>
                  </div>
                  <div className="p-3 bg-yellow-500/10 text-yellow-400 rounded-xl"><ClipboardList className="w-5 h-5" /></div>
                </div>
                <div className="bg-[#1c1c1c] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-xs text-gray-400 font-medium">Documentos Disponíveis</span>
                    <h3 className="text-2xl font-black text-white mt-1">{sharedDocs.length}</h3>
                  </div>
                  <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl"><FolderOpen className="w-5 h-5" /></div>
                </div>
                <div className="bg-[#1c1c1c] border border-white/5 p-5 rounded-2xl flex items-center justify-between shadow-md">
                  <div>
                    <span className="text-xs text-gray-400 font-medium">Valor Contratado</span>
                    <h3 className="text-lg font-black text-white mt-1">
                      {contracts.length > 0 
                        ? `R$ ${contracts.reduce((acc, c) => acc + (Number(c.current_value) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : 'R$ 0,00'}
                    </h3>
                  </div>
                  <div className="p-3 bg-green-500/10 text-green-400 rounded-xl"><DollarSign className="w-5 h-5" /></div>
                </div>
              </div>

              {/* Grid 2 Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Timeline */}
                <div className="bg-[#1a1a1a] border border-white/5 p-5 rounded-2xl lg:col-span-2 shadow-xl">
                  <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-orange-400" />
                    Atividades Recentes
                  </h4>
                  <div className="flex flex-col gap-4">
                    {recentActivity.map((act) => (
                      <div key={act.id} className="flex gap-4 items-start p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className={`p-2 rounded-lg text-xs font-bold shrink-0
                          ${act.kind === 'documento'
                            ? 'bg-purple-500/10 text-purple-400'
                            : act.status === 'CONCLUIDO' ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'}`}>
                          {act.kind === 'documento' ? <FolderOpen className="w-3.5 h-3.5" /> : act.label}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">
                            {act.kind === 'documento' ? `Documento compartilhado: ${act.title}` : act.title}
                          </p>
                          <span className="text-xs text-gray-500">
                            {act.kind === 'documento' ? `Categoria: ${act.label}` : `Status: ${act.status}`} • {new Date(act.date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                    {recentActivity.length === 0 && (
                      <div className="text-center py-6 text-xs text-gray-500">Nenhuma atividade recente cadastrada.</div>
                    )}
                  </div>
                </div>

                {/* Info Card Construtora */}
                <div className="bg-[#1a1a1a] border border-white/5 p-5 rounded-2xl shadow-xl flex flex-col gap-4">
                  <h4 className="text-sm font-bold text-white">Canal de Atendimento</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Este é o canal direto de comunicação da sua empresa com a Construtora. Qualquer dúvida ou solicitação técnica/financeira deve ser formalizada pela aba <strong>Solicitações</strong>.
                  </p>
                  <div className="h-px bg-white/5 my-1"></div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase block font-bold">Documentação GED</span>
                    <span className="text-xs text-gray-300">Todos os projetos e contratos oficiais estão na aba <strong>Documentos</strong>.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CONVERSAS */}
          {activeTab === 'conversas' && (
            <div className="flex h-[calc(100vh-12rem)] bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              {/* Canais List */}
              <div className="w-64 border-r border-white/5 bg-[#181818] flex flex-col">
                <div className="p-4 border-b border-white/5 text-xs font-bold text-gray-400 uppercase tracking-wider">Canais</div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-button text-left font-medium transition-all
                        ${selectedConversation?.id === conv.id ? 'bg-orange-500 text-white font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                      <span className="text-lg">#</span>
                      <span className="truncate">{conv.name}</span>
                    </button>
                  ))}
                  {conversations.length === 0 && (
                    <div className="text-center py-6 text-xs text-gray-500">Nenhum canal ativo.</div>
                  )}
                </div>
              </div>

              {/* Chat Panel */}
              <div className="flex-1 flex flex-col bg-[#1c1c1c]">
                {selectedConversation ? (
                  <>
                    <div className="h-12 border-b border-white/5 bg-[#181818] px-4 flex items-center justify-between text-xs font-bold text-white shrink-0">
                      <span># {selectedConversation.name}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                      {messages.map((msg) => {
                        const isMe = msg.sender_type === 'EXTERNAL';
                        return (
                          <div key={msg.id} className={`flex flex-col max-w-[70%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                            <span className="text-xs text-gray-500 mb-0.5 font-medium">{msg.sender_name}</span>
                            <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed
                              ${isMe ? 'bg-orange-500 text-white rounded-tr-none' : 'bg-white/5 text-gray-100 rounded-tl-none border border-white/5'}`}>
                              {msg.message}
                            </div>
                            <span className="text-[9px] text-gray-600 mt-1">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                        );
                      })}
                      <div ref={chatEndRef}></div>
                    </div>
                    <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 bg-[#181818] flex gap-2 shrink-0">
                      <input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={`Enviar mensagem em #${selectedConversation.name}...`}
                        className="flex-1 bg-[#121212] border border-white/5 rounded-xl px-4 py-2 text-form-input text-white focus:outline-none focus:border-orange-500/50"
                      />
                      <Button type="submit" size="icon" className="bg-orange-500 hover:bg-orange-600 text-white">
                        <Send className="w-4 h-4" />
                      </Button>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-gray-500">Selecione ou aguarde o início de uma conversa.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB: DOCUMENTOS */}
          {activeTab === 'documentos' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="text-md font-bold text-white">Documentos e Projetos Compartilhados</h3>
                <div className="relative max-w-xs w-full">
                  <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
                  <input
                    value={docSearchQuery}
                    onChange={(e) => setDocSearchQuery(e.target.value)}
                    placeholder="Buscar documentos..."
                    className="bg-[#1c1c1c] border border-white/5 pl-9 pr-4 py-2 rounded-xl text-form-input w-full text-white focus:outline-none"
                  />
                </div>
              </div>

              {sharedDocs.length === 0 ? (
                <div className="text-center py-12 bg-[#1c1c1c] border border-dashed border-white/5 rounded-2xl text-xs text-gray-500">
                  Nenhum documento compartilhado com o seu portal no momento.
                </div>
              ) : Object.keys(docsByCategoria).length === 0 ? (
                <div className="text-center py-12 bg-[#1c1c1c] border border-dashed border-white/5 rounded-2xl text-xs text-gray-500">
                  Nenhum documento encontrado para "{docSearchQuery}".
                </div>
              ) : (
                <div className="flex flex-col gap-8">
                  {[...CATEGORIA_ORDER, ...Object.keys(docsByCategoria).filter((c) => !CATEGORIA_ORDER.includes(c))]
                    .filter((cat) => docsByCategoria[cat]?.length)
                    .map((cat) => (
                      <div key={cat} className="flex flex-col gap-3">
                        <h4 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                          {CATEGORIA_LABELS[cat] || cat}
                          <span className="text-gray-600 font-bold">({docsByCategoria[cat].length})</span>
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {docsByCategoria[cat].map((sd) => (
                            <div key={sd.id} className="bg-[#1c1c1c] border border-white/5 p-4 rounded-2xl flex flex-col gap-3 shadow-md hover:border-white/10 transition-all group">
                              <div className="flex items-start justify-between">
                                <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl"><FolderOpen className="w-5 h-5" /></div>
                                {isRecentlyShared(sd.shared_at) && (
                                  <span className="text-[9px] font-black uppercase tracking-wider bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-md border border-green-500/20">
                                    Novo
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-white truncate">{sd.document?.nome}</h4>
                                <p className="text-xs text-gray-500 mt-1 truncate">{sd.document?.descricao || 'Sem descrição'}</p>
                              </div>
                              <div className="flex items-center justify-between text-xs text-gray-500 border-t border-white/5 pt-3 mt-1">
                                <span>Compartilhado em: {new Date(sd.shared_at).toLocaleDateString()}</span>
                                {sd.document?.active_version?.storage_path && (
                                  <a
                                    href={`${supabase.storage.from('opura-docs').getPublicUrl(sd.document.active_version.storage_path).data.publicUrl}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 text-orange-400 hover:text-orange-300 font-semibold"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Baixar</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: CONTRATOS */}
          {activeTab === 'contratos' && (
            <div className="flex flex-col gap-6">
              <h3 className="text-md font-bold text-white">Seus Contratos Ativos</h3>
              <div className="flex flex-col gap-4">
                {contracts.map((contract) => (
                  <div key={contract.id} className="bg-[#1c1c1c] border border-white/5 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold rounded-md uppercase">
                          {contract.nature || 'Contrato'}
                        </span>
                        <span className="text-xs text-gray-500 font-bold">Nº {contract.number}</span>
                      </div>
                      <h4 className="text-xs font-bold text-white truncate">{contract.title || 'Contrato Prestação de Serviços'}</h4>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                        <span>Vigência: {contract.start_date ? new Date(contract.start_date).toLocaleDateString() : '-'} até {contract.end_date ? new Date(contract.end_date).toLocaleDateString() : '-'}</span>
                        <span>Reajuste: {contract.reajuste_index || 'Sem reajuste'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                      <div className="text-left md:text-right">
                        <span className="text-xs text-gray-500 uppercase block font-semibold">Valor Atual</span>
                        <h4 className="text-sm font-black text-white mt-0.5">R$ {Number(contract.current_value).toLocaleString('pt-BR', {minimumFractionDigits:2})}</h4>
                      </div>
                      {contract.signed_contract_url && (
                        <a 
                          href={contract.signed_contract_url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3.5 py-2 rounded-xl text-xs text-white hover:bg-white/10 active:scale-95 transition-all font-semibold"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-orange-400" />
                          Ver PDF
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {contracts.length === 0 && (
                  <div className="text-center py-12 bg-[#1c1c1c] border border-dashed border-white/5 rounded-2xl text-xs text-gray-500">
                    Nenhum contrato vinculado encontrado.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: SOLICITACOES */}
          {activeTab === 'solicitacoes' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="text-md font-bold text-white">Solicitações de Atendimento</h3>
                <Button
                  onClick={() => setIsNewRequestModalOpen(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/10 normal-case tracking-normal"
                >
                  <Plus className="w-4 h-4" />
                  Nova Solicitação
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                {requests.map((req) => (
                  <div key={req.id} className="bg-[#1c1c1c] border border-white/5 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 text-[9px] font-black rounded-md border
                          ${req.priority === 'ALTA' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-gray-500/10 text-gray-400 border-white/5'}`}>
                          {req.priority}
                        </span>
                        <span className="text-xs text-gray-500 font-bold uppercase">{req.type}</span>
                      </div>
                      <h4 className="text-xs font-bold text-white truncate">{req.title}</h4>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{req.description}</p>
                      {req.attachment_paths && req.attachment_paths.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {req.attachment_paths.map((path, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleDownloadAttachment(path)}
                              className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-semibold bg-white/5 border border-white/5 px-2 py-1 rounded-lg"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span className="truncate max-w-[10rem]">{path.split('/').pop()?.replace(/^\d+_/, '')}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-6 shrink-0 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                      <div className="text-left md:text-right">
                        <span className="text-xs text-gray-500 uppercase block font-semibold">Status</span>
                        <span className={`text-xs font-bold mt-1 px-2.5 py-0.5 rounded-full inline-block
                          ${req.status === 'CONCLUIDO' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                          {req.status}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 font-medium">Aberto em: {new Date(req.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {requests.length === 0 && (
                  <div className="text-center py-12 bg-[#1c1c1c] border border-dashed border-white/5 rounded-2xl text-xs text-gray-500">
                    Nenhuma solicitação cadastrada. Clique no botão acima para criar a primeira.
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* MODAL: NOVA SOLICITAÇÃO */}
      {isNewRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1c1c1c] border border-white/5 max-w-md w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-md font-bold text-white">Nova Solicitação</h3>
            
            <form onSubmit={handleCreateRequest} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Título</label>
                <input
                  required
                  value={newRequest.title}
                  onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                  placeholder="Ex: Reenvio de projeto executivo de fundação"
                  className="bg-[#121212] border border-white/5 rounded-xl px-3.5 py-2.5 text-form-input text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Descrição Detalhada</label>
                <textarea
                  required
                  rows={3}
                  value={newRequest.description}
                  onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                  placeholder="Explique o motivo do seu pedido..."
                  className="bg-[#121212] border border-white/5 rounded-xl px-3.5 py-2.5 text-form-input text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 uppercase font-bold">Tipo</label>
                  <select
                    value={newRequest.type}
                    onChange={(e) => setNewRequest({ ...newRequest, type: e.target.value as any })}
                    className="bg-[#121212] border border-white/5 rounded-xl px-3 py-2.5 text-form-input text-white focus:outline-none"
                  >
                    <option value="TECNICA">Técnica</option>
                    <option value="CONTRATO">Dúvida Contratual</option>
                    <option value="FINANCEIRA">Financeira</option>
                    <option value="DOCUMENTACAO">Envio de Documentação</option>
                    <option value="ALTERACAO">Solicitação de Alteração</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 uppercase font-bold">Prioridade</label>
                  <select
                    value={newRequest.priority}
                    onChange={(e) => setNewRequest({ ...newRequest, priority: e.target.value as any })}
                    className="bg-[#121212] border border-white/5 rounded-xl px-3 py-2.5 text-form-input text-white focus:outline-none"
                  >
                    <option value="BAIXA">Baixa</option>
                    <option value="MEDIA">Média</option>
                    <option value="ALTA">Alta</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Anexos (opcional)</label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setNewRequestFiles(Array.from(e.target.files || []))}
                  className="text-xs text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-white/5 file:text-gray-300 file:text-xs file:font-semibold hover:file:bg-white/10"
                />
                {newRequestFiles.length > 0 && (
                  <ul className="flex flex-col gap-1 pt-1">
                    {newRequestFiles.map((f, idx) => (
                      <li key={idx} className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Paperclip className="w-3 h-3" />
                        <span className="truncate">{f.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-white/5 pt-4 mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsNewRequestModalOpen(false)}
                  className="bg-transparent border-white/10 text-gray-400 hover:text-white hover:bg-transparent normal-case tracking-normal"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={creatingRequest}
                  className="bg-orange-500 hover:bg-orange-600 text-white normal-case tracking-normal disabled:opacity-50"
                >
                  {creatingRequest ? 'Enviando...' : 'Enviar Solicitação'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

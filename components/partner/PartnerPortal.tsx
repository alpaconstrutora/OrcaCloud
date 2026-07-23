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
  DollarSign,
  Upload,
  X,
  Package,
  TrendingUp,
  Ruler,
  ArrowLeft,
  ChevronDown,
  Bell,
  HelpCircle,
  Settings2,
  Filter
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { partnerService } from '../../services/partnerService';
import { partnerPortalTokenService } from '../../services/partnerPortalTokenService';
import { contractService } from '../../services/contractService';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import { ColumnConfig, useTableColumns, ColumnConfigButton, usePersistedState } from '../ui/TableUtils';
import { DocumentsTable } from '../documents/DocumentsTable';
import {
  PartnerWorkspace,
  PartnerUser,
  PartnerConversation,
  PartnerMessage,
  PartnerRequest,
  PartnerSharedDocument,
  Contract,
  ContractItem,
  ContractAddendum,
  ContractMeasurement,
  OpuraDocument
} from '../../types';

interface PartnerPortalProps {
  userEmail: string;
  /** Modo de pré-visualização para admin/dev: carrega o workspace diretamente, sem exigir um partner_user cadastrado. */
  previewWorkspaceId?: string;
  onExitPreview?: () => void;
  /** Acesso via link público (sem login), mesmo padrão do Portal do Cliente/Investidor. */
  portalToken?: string;
}

const CATEGORIA_LABELS: Record<string, string> = {
  engenharia: 'Projetos',
  juridico: 'Contratos',
  compliance: 'Licenças & Alvarás',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
};
const CATEGORIA_ORDER = ['engenharia', 'juridico', 'compliance', 'financeiro', 'comercial'];

// Mesmas colunas da Gestão de Documentos (OpuraDocsModule.tsx) — a tabela do parceiro é a
// mesma <DocumentsTable>, então as colunas precisam ser as mesmas para o layout ficar idêntico.
const PARTNER_DOC_COLUMNS: ColumnConfig[] = [
  { key: 'nome', label: 'Documento', sortable: true },
  { key: 'autor', label: 'Autor', sortable: true },
  { key: 'tipo_documento', label: 'Tipo / Categoria', sortable: true },
  { key: 'project_id', label: 'Obra Vinculada', sortable: true },
  { key: 'data_emissao', label: 'Emissão', sortable: true },
  { key: 'data_validade', label: 'Validade', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];

export const PartnerPortal: React.FC<PartnerPortalProps> = ({ userEmail, previewWorkspaceId, onExitPreview, portalToken }) => {
  const isPreview = !!previewWorkspaceId;
  const isTokenMode = !!portalToken;
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

  // Menu de conta do portal público (link do parceiro) — espelha o dropdown de perfil do sistema
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [showMyAccount, setShowMyAccount] = useState(false);
  const [menuMsg, setMenuMsg] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const showMenuToast = (m: string) => { setMenuMsg(m); setTimeout(() => setMenuMsg(null), 4000); };
  useEffect(() => {
    if (!isAccountMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isAccountMenuOpen]);

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

  // Envio de documento direto pela aba Documentos (fica pendente de revisão do time interno)
  const [isSendDocModalOpen, setIsSendDocModalOpen] = useState(false);
  const [sendDocFile, setSendDocFile] = useState<File | null>(null);
  const [sendDocNote, setSendDocNote] = useState('');
  const [sendingDoc, setSendingDoc] = useState(false);

  // Detalhe do contrato (Visão Geral / Itens / Aditivos / Medições)
  const [detailContract, setDetailContract] = useState<Contract | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'items' | 'addendums' | 'measurements'>('overview');
  const [detailLoading, setDetailLoading] = useState(false);
  const [contractItems, setContractItems] = useState<ContractItem[]>([]);
  const [contractAddendums, setContractAddendums] = useState<ContractAddendum[]>([]);
  const [contractMeasurements, setContractMeasurements] = useState<ContractMeasurement[]>([]);

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

  // URL do PDF do contrato: prioriza o assinado; se não houver, cai na última minuta
  // marcada como "emitida" (mesma flag que já gate-ia exposição ao Portal do Cliente).
  const getContractFileUrl = (contract: Contract): string | null => {
    if (contract.signed_contract_url) return contract.signed_contract_url;
    const emitted = (contract.minuta_versions || []).filter((m) => m.emitted && m.url);
    return emitted.length > 0 ? emitted[emitted.length - 1].url : null;
  };

  // Abrir o detalhe de um contrato (itens/aditivos/medições) — mesmos dados que a
  // tela interna de Suprimentos > Contratos mostra, só que somente leitura.
  const openContractDetail = async (contract: Contract) => {
    setDetailContract(contract);
    setDetailTab('overview');
    setDetailLoading(true);
    try {
      if (isTokenMode) {
        const res = await partnerPortalTokenService.getContractDetail(portalToken!, contract.id);
        setContractItems(res.items || []);
        setContractAddendums(res.addendums || []);
        setContractMeasurements(res.measurements || []);
      } else {
        const [items, addendums, measurements] = await Promise.all([
          contractService.listContractItems(contract.id),
          contractService.listAddendums(contract.id),
          contractService.listMeasurements(contract.id),
        ]);
        setContractItems(items);
        setContractAddendums(addendums);
        setContractMeasurements(measurements);
      }
    } catch (err) {
      console.error('Erro ao carregar detalhe do contrato:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Métricas derivadas (mesmas fórmulas de ContractDetailView.tsx)
  const totalMeasured = contractMeasurements.reduce((sum, m) => sum + (Number(m.total_value) || 0), 0);
  const physicalProgress = detailContract && Number(detailContract.current_value) > 0
    ? (totalMeasured / Number(detailContract.current_value)) * 100
    : 0;
  const timeProgress = (() => {
    if (!detailContract?.start_date || !detailContract?.end_date) return 0;
    const start = new Date(detailContract.start_date).getTime();
    const end = new Date(detailContract.end_date).getTime();
    const now = Date.now();
    if (end <= start) return 0;
    return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  })();
  const approvedAddendumsImpact = contractAddendums
    .filter((a) => a.status === 'Aprovado')
    .reduce((sum, a) => sum + (Number(a.value_impact) || 0), 0);
  const addendumsPercentage = detailContract && Number(detailContract.original_value) > 0
    ? (approvedAddendumsImpact / Number(detailContract.original_value)) * 100
    : 0;
  const retentionValue = totalMeasured * ((Number(detailContract?.retention_rate) || 0) / 100);
  const saldoAFaturar = detailContract ? Number(detailContract.current_value) - totalMeasured : 0;

  const [docSearchQuery, setDocSearchQuery] = usePersistedState('partnerPortalDocsFilters:search', '');
  const [docCategoriaFilter, setDocCategoriaFilter] = usePersistedState<string>('partnerPortalDocsFilters:categoria', 'all');
  const [docStatusFilter, setDocStatusFilter] = usePersistedState<'all' | 'ativo' | 'alerta' | 'vencido'>('partnerPortalDocsFilters:status', 'all');
  const [showDocFilters, setShowDocFilters] = React.useState(false);
  const partnerDocColumns = useTableColumns(PARTNER_DOC_COLUMNS, 'partnerDocsColumns');

  // Documentos GED por trás de cada vínculo — mesmo objeto que a Gestão de Documentos usa
  // (PartnerSharedDocument.document é o próprio OpuraDocument, ver partnerService.listSharedDocuments).
  const sharedOpuraDocuments = React.useMemo(
    () => sharedDocs.map((sd) => sd.document).filter((d): d is OpuraDocument => !!d),
    [sharedDocs]
  );

  // Quantos documentos compartilhados existem por categoria — alimenta a sidebar "Pastas e disciplinas".
  const categoriaCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    sharedOpuraDocuments.forEach((doc) => {
      const key = doc.categoria || 'outros';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [sharedOpuraDocuments]);

  // Documentos compartilhados, filtrados por categoria selecionada + status + busca — alimenta <DocumentsTable>.
  const filteredSharedDocuments = React.useMemo(() => {
    let result = sharedOpuraDocuments;

    if (docCategoriaFilter !== 'all') {
      result = result.filter((doc) => (doc.categoria || 'outros') === docCategoriaFilter);
    }
    if (docStatusFilter !== 'all') {
      result = result.filter((doc) => doc.status === docStatusFilter);
    }
    const q = docSearchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((doc) =>
        (doc.nome || '').toLowerCase().includes(q) ||
        (doc.descricao || '').toLowerCase().includes(q) ||
        (doc.tipo_documento || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [sharedOpuraDocuments, docCategoriaFilter, docStatusFilter, docSearchQuery]);

  // 1. Carregar perfil e workspace inicial (ou o workspace de pré-visualização, se for o caso)
  useEffect(() => {
    const loadPreviewWorkspace = async () => {
      try {
        setLoading(true);
        const ws = await partnerService.getWorkspaceById(previewWorkspaceId!);
        if (!ws) {
          setError('Workspace de parceiro não encontrado.');
          setLoading(false);
          return;
        }
        setWorkspace(ws);
        setPartnerUser({
          id: 'preview',
          partner_workspace_id: ws.id,
          email: userEmail || 'preview@admin',
          name: 'Visualização (Admin)',
          role: 'ADMINISTRADOR',
          is_active: true,
          created_at: '',
          updated_at: '',
        });
        setLoading(false);
      } catch (err: any) {
        console.error('Erro ao carregar pré-visualização do parceiro:', err);
        setError(err.message || 'Erro ao carregar pré-visualização.');
        setLoading(false);
      }
    };

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

    const loadTokenWorkspace = async () => {
      try {
        setLoading(true);
        const res = await partnerPortalTokenService.getPortalData(portalToken!);
        if (!res.valid || !res.workspace) {
          setError('Link inválido ou expirado. Solicite um novo link à construtora.');
          setLoading(false);
          return;
        }
        setWorkspace(res.workspace as PartnerWorkspace);
        setPartnerUser({
          id: 'token',
          partner_workspace_id: res.workspace.id,
          email: 'link-publico@portal-parceiro',
          name: res.workspace.supplier_name || 'Parceiro',
          role: 'ADMINISTRADOR',
          is_active: true,
          created_at: '',
          updated_at: '',
        });
        setLoading(false);
      } catch (err: any) {
        console.error('Erro ao carregar portal via link:', err);
        setError('Link inválido ou expirado. Solicite um novo link à construtora.');
        setLoading(false);
      }
    };

    if (isTokenMode) {
      loadTokenWorkspace();
    } else if (isPreview) {
      loadPreviewWorkspace();
    } else if (userEmail) {
      loadPartnerProfile();
    }
  }, [userEmail, previewWorkspaceId, isPreview, portalToken, isTokenMode]);

  // 2. Carregar dados específicos de cada aba
  useEffect(() => {
    if (!workspace) return;

    const loadTabData = async () => {
      try {
        if (isTokenMode) {
          if (activeTab === 'dashboard') {
            const [docs, reqs, cts] = await Promise.all([
              partnerPortalTokenService.getSharedDocuments(portalToken!),
              partnerPortalTokenService.getRequests(portalToken!),
              partnerPortalTokenService.getContracts(portalToken!),
            ]);
            setSharedDocs(docs);
            setRequests(reqs);
            setContracts(cts);
          } else if (activeTab === 'conversas') {
            const convs = await partnerPortalTokenService.getConversations(portalToken!);
            setConversations(convs);
            if (convs.length > 0 && !selectedConversation) {
              setSelectedConversation(convs[0]);
            }
          } else if (activeTab === 'documentos') {
            setSharedDocs(await partnerPortalTokenService.getSharedDocuments(portalToken!));
          } else if (activeTab === 'contratos') {
            setContracts(await partnerPortalTokenService.getContracts(portalToken!));
          } else if (activeTab === 'solicitacoes') {
            setRequests(await partnerPortalTokenService.getRequests(portalToken!));
          }
          return;
        }

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
  }, [workspace, activeTab, isTokenMode, portalToken]);

  // 3. Monitoramento de mensagens do chat selecionado + Realtime
  // (Realtime respeita RLS: sessão anon do link público não tem acesso à tabela partner_messages
  // diretamente, então nesse modo a atualização é por polling em vez de subscription.)
  useEffect(() => {
    if (!selectedConversation) return;

    const loadMessages = async () => {
      const msgs = isTokenMode
        ? await partnerPortalTokenService.getMessages(portalToken!, selectedConversation.id)
        : await partnerService.listMessages(selectedConversation.id);
      setMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    loadMessages();

    if (isTokenMode) {
      const interval = setInterval(loadMessages, 8000);
      return () => clearInterval(interval);
    }

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
  }, [selectedConversation, isTokenMode, portalToken]);

  // Ações do Chat
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPreview || !newMessage.trim() || !selectedConversation || !partnerUser) return;

    try {
      if (isTokenMode) {
        const sent = await partnerPortalTokenService.sendMessage(portalToken!, selectedConversation.id, newMessage);
        if (sent) setMessages((prev) => [...prev, sent as PartnerMessage]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        await partnerService.sendMessage({
          conversation_id: selectedConversation.id,
          sender_email: partnerUser.email,
          sender_name: partnerUser.name,
          sender_type: 'EXTERNAL',
          message: newMessage,
          attachments: []
        });
      }
      setNewMessage('');
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    }
  };

  // Criar solicitação (com upload opcional de anexos — Onda 5)
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPreview || !workspace || !partnerUser) return;

    setCreatingRequest(true);
    try {
      let created: PartnerRequest;
      if (isTokenMode) {
        const attachmentPaths = await Promise.all(
          newRequestFiles.map((file) => partnerPortalTokenService.uploadAttachment(portalToken!, file))
        );
        created = await partnerPortalTokenService.createRequest(portalToken!, {
          title: newRequest.title,
          description: newRequest.description,
          type: newRequest.type,
          priority: newRequest.priority,
          attachmentPaths,
        });
      } else {
        const attachmentPaths = await Promise.all(
          newRequestFiles.map((file) => partnerService.uploadRequestAttachment(workspace.id, file))
        );

        created = await partnerService.saveRequest({
          partner_workspace_id: workspace.id,
          title: newRequest.title,
          description: newRequest.description,
          type: newRequest.type,
          priority: newRequest.priority,
          status: 'ABERTO',
          created_by_email: partnerUser.email,
          attachment_paths: attachmentPaths
        });
      }
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

  // Baixar um anexo enviado numa solicitação (gera link assinado, o bucket é privado).
  // No modo token, a assinatura passa pela Edge Function (sessão anon não tem RLS de storage).
  const handleDownloadAttachment = async (path: string) => {
    try {
      const url = isTokenMode
        ? await partnerPortalTokenService.getDocumentDownloadUrl(portalToken!, path)
        : await partnerService.getAttachmentDownloadUrl(path);
      window.open(url, '_blank', 'noreferrer');
    } catch (err) {
      console.error('Erro ao baixar anexo:', err);
      alert('Erro ao baixar o anexo.');
    }
  };

  // Baixar um documento GED compartilhado (bucket privado, precisa de link assinado)
  const handleDownloadSharedDocument = async (storagePath: string) => {
    try {
      const url = isTokenMode
        ? await partnerPortalTokenService.getDocumentDownloadUrl(portalToken!, storagePath)
        : await partnerService.getDocumentDownloadUrl(storagePath);
      window.open(url, '_blank', 'noreferrer');
    } catch (err) {
      console.error('Erro ao baixar documento:', err);
      alert('Erro ao gerar link de acesso ao documento.');
    }
  };

  // Enviar um documento direto pela aba Documentos (fica pendente de revisão/promoção do time interno,
  // reaproveitando o mesmo mecanismo de anexo de solicitação — sem escrita direta no GED).
  const handleSendDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPreview || !workspace || !partnerUser || !sendDocFile) return;

    setSendingDoc(true);
    try {
      let created: PartnerRequest;
      if (isTokenMode) {
        const path = await partnerPortalTokenService.uploadAttachment(portalToken!, sendDocFile);
        created = await partnerPortalTokenService.createRequest(portalToken!, {
          title: sendDocFile.name,
          description: sendDocNote.trim() || 'Documento enviado pelo parceiro pela aba Documentos.',
          type: 'DOCUMENTACAO',
          priority: 'MEDIA',
          attachmentPaths: [path],
        });
      } else {
        const path = await partnerService.uploadRequestAttachment(workspace.id, sendDocFile);
        created = await partnerService.saveRequest({
          partner_workspace_id: workspace.id,
          title: sendDocFile.name,
          description: sendDocNote.trim() || 'Documento enviado pelo parceiro pela aba Documentos.',
          type: 'DOCUMENTACAO',
          priority: 'MEDIA',
          status: 'ABERTO',
          created_by_email: partnerUser.email,
          attachment_paths: [path]
        });
      }
      setRequests((prev) => [created, ...prev]);
      setIsSendDocModalOpen(false);
      setSendDocFile(null);
      setSendDocNote('');
      alert('Documento enviado. A equipe da construtora vai revisar e incluir no GED.');
    } catch (err) {
      console.error('Erro ao enviar documento:', err);
      alert('Erro ao enviar documento. Tente novamente.');
    } finally {
      setSendingDoc(false);
    }
  };

  // Documentos que o próprio parceiro enviou, para dar visibilidade na mesma aba
  const sentDocuments = React.useMemo(
    () => requests.filter((r) => r.type === 'DOCUMENTACAO' && r.attachment_paths && r.attachment_paths.length > 0),
    [requests]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-gray-500">Carregando portal do parceiro...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-900 p-6">
        <div className="max-w-md w-full bg-white border border-red-200 p-6 rounded-2xl text-center shadow-xl">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">Acesso Negado</h3>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
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
    <div className="flex flex-col h-screen bg-white text-gray-800 overflow-hidden font-sans">
      {isPreview && (
        <div className="h-9 bg-yellow-50 border-b border-yellow-200 flex items-center justify-center gap-3 shrink-0 text-xs font-bold text-yellow-700 uppercase tracking-wider">
          <span>Modo de Pré-visualização (Admin) — envio de mensagens e solicitações desabilitado</span>
          {onExitPreview && (
            <button
              onClick={onExitPreview}
              className="underline decoration-dotted hover:text-yellow-800 normal-case tracking-normal"
            >
              Sair da pré-visualização
            </button>
          )}
        </div>
      )}
      {isTokenMode && (
        <div className="h-9 bg-blue-50 border-b border-blue-200 flex items-center justify-center gap-3 shrink-0 text-xs font-bold text-blue-700 uppercase tracking-wider">
          <span>Acesso via link público</span>
        </div>
      )}
      {/* Header */}
      <header className="h-16 border-b border-gray-100 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 bg-orange-500 text-white rounded-lg text-xs font-black uppercase tracking-wider">
            Partner Portal
          </div>
          <h1 className="text-md font-bold text-gray-900 tracking-tight">
            {workspace?.supplier_name}
          </h1>
        </div>
        <div className="relative" ref={accountMenuRef}>
          <button
            type="button"
            onClick={() => setIsAccountMenuOpen(o => !o)}
            className="flex items-center gap-2 text-xs bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 transition-colors"
            aria-haspopup="menu"
            aria-expanded={isAccountMenuOpen}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[11px] font-bold text-white">
              {(partnerUser?.name || 'P').charAt(0).toUpperCase()}
            </span>
            <span className="font-semibold text-gray-600">{partnerUser?.name} ({partnerUser?.role})</span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {isAccountMenuOpen && (
            <div className="absolute right-0 top-full z-[1000] mt-2 w-[280px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl" role="menu">
              <div className="border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
                    {(partnerUser?.name || 'P').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-gray-900">{partnerUser?.name}</div>
                    <div className="truncate text-xs text-gray-500">{partnerUser?.email || userEmail}</div>
                  </div>
                </div>
              </div>
              <div className="p-2">
                <button
                  type="button"
                  onClick={() => { setIsAccountMenuOpen(false); setShowMyAccount(true); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  role="menuitem"
                >
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="flex-1">Minha conta</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAccountMenuOpen(false); showMenuToast('Personalização de tema estará disponível em breve.'); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  role="menuitem"
                >
                  <Settings2 className="h-4 w-4 text-gray-400" />
                  <span className="flex-1">Preferências</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAccountMenuOpen(false); showMenuToast('Central de notificações do parceiro estará disponível em breve.'); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  role="menuitem"
                >
                  <Bell className="h-4 w-4 text-gray-400" />
                  <span className="flex-1">Notificações</span>
                </button>
              </div>
              <div className="border-t border-gray-100 p-2">
                <button
                  type="button"
                  onClick={() => { setIsAccountMenuOpen(false); showMenuToast('Dúvidas? Fale com a construtora responsável por esta obra.'); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  role="menuitem"
                >
                  <HelpCircle className="h-4 w-4 text-gray-400" />
                  <span className="flex-1">Ajuda e comandos</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-64 border-r border-gray-100 bg-gray-50 p-4 flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'dashboard' ? 'bg-orange-500/10 border border-orange-500/20 text-orange-600 font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('conversas')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'conversas' ? 'bg-orange-500/10 border border-orange-500/20 text-orange-600 font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Conversas</span>
          </button>
          <button
            onClick={() => setActiveTab('documentos')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'documentos' ? 'bg-orange-500/10 border border-orange-500/20 text-orange-600 font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Documentos</span>
          </button>
          <button
            onClick={() => setActiveTab('contratos')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'contratos' ? 'bg-orange-500/10 border border-orange-500/20 text-orange-600 font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
          >
            <FileText className="w-4 h-4" />
            <span>Contratos</span>
          </button>
          <button
            onClick={() => setActiveTab('solicitacoes')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'solicitacoes' ? 'bg-orange-500/10 border border-orange-500/20 text-orange-600 font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Solicitações</span>
          </button>
        </aside>

        {/* Dynamic Content Pane */}
        <main className="flex-1 bg-white overflow-y-auto p-6 relative">

          {/* TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="flex flex-col gap-6">
              {/* Header Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-xs text-gray-400 font-medium">Contratos Ativos</span>
                    <h3 className="text-2xl font-black text-gray-900 mt-1">{contracts.filter(c => c.status === 'Assinado').length}</h3>
                  </div>
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><FileText className="w-5 h-5" /></div>
                </div>
                <div className="bg-white border border-gray-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-xs text-gray-400 font-medium">Solicitações Abertas</span>
                    <h3 className="text-2xl font-black text-gray-900 mt-1">{requests.filter(r => r.status === 'ABERTO' || r.status === 'EM_ANALISE').length}</h3>
                  </div>
                  <div className="p-3 bg-yellow-50 text-yellow-600 rounded-xl"><ClipboardList className="w-5 h-5" /></div>
                </div>
                <div className="bg-white border border-gray-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-xs text-gray-400 font-medium">Documentos Disponíveis</span>
                    <h3 className="text-2xl font-black text-gray-900 mt-1">{sharedDocs.length}</h3>
                  </div>
                  <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><FolderOpen className="w-5 h-5" /></div>
                </div>
                <div className="bg-white border border-gray-200 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-xs text-gray-400 font-medium">Valor Contratado</span>
                    <h3 className="text-lg font-black text-gray-900 mt-1">
                      {contracts.length > 0
                        ? `R$ ${contracts.reduce((acc, c) => acc + (Number(c.current_value) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : 'R$ 0,00'}
                    </h3>
                  </div>
                  <div className="p-3 bg-green-50 text-green-600 rounded-xl"><DollarSign className="w-5 h-5" /></div>
                </div>
              </div>

              {/* Grid 2 Columns */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Timeline */}
                <div className="bg-white border border-gray-200 p-5 rounded-2xl lg:col-span-2 shadow-sm">
                  <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-orange-500" />
                    Atividades Recentes
                  </h4>
                  <div className="flex flex-col gap-4">
                    {recentActivity.map((act) => (
                      <div key={act.id} className="flex gap-4 items-start p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className={`p-2 rounded-lg text-xs font-bold shrink-0
                          ${act.kind === 'documento'
                            ? 'bg-purple-50 text-purple-600'
                            : act.status === 'CONCLUIDO' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                          {act.kind === 'documento' ? <FolderOpen className="w-3.5 h-3.5" /> : act.label}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">
                            {act.kind === 'documento' ? `Documento compartilhado: ${act.title}` : act.title}
                          </p>
                          <span className="text-xs text-gray-400">
                            {act.kind === 'documento' ? `Categoria: ${act.label}` : `Status: ${act.status}`} • {new Date(act.date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                    {recentActivity.length === 0 && (
                      <div className="text-center py-6 text-xs text-gray-400">Nenhuma atividade recente cadastrada.</div>
                    )}
                  </div>
                </div>

                {/* Info Card Construtora */}
                <div className="bg-white border border-gray-200 p-5 rounded-2xl shadow-sm flex flex-col gap-4">
                  <h4 className="text-sm font-bold text-gray-900">Canal de Atendimento</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Este é o canal direto de comunicação da sua empresa com a Construtora. Qualquer dúvida ou solicitação técnica/financeira deve ser formalizada pela aba <strong>Solicitações</strong>.
                  </p>
                  <div className="h-px bg-gray-100 my-1"></div>
                  <div>
                    <span className="text-xs text-gray-400 uppercase block font-bold">Documentação GED</span>
                    <span className="text-xs text-gray-600">Todos os projetos e contratos oficiais estão na aba <strong>Documentos</strong>.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CONVERSAS */}
          {activeTab === 'conversas' && (
            <div className="flex h-[calc(100vh-12rem)] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              {/* Canais List */}
              <div className="w-64 border-r border-gray-100 bg-gray-50 flex flex-col">
                <div className="p-4 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Canais</div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-button text-left font-medium transition-all
                        ${selectedConversation?.id === conv.id ? 'bg-orange-500 text-white font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
                    >
                      <span className="text-lg">#</span>
                      <span className="truncate">{conv.name}</span>
                    </button>
                  ))}
                  {conversations.length === 0 && (
                    <div className="text-center py-6 text-xs text-gray-400">Nenhum canal ativo.</div>
                  )}
                </div>
              </div>

              {/* Chat Panel */}
              <div className="flex-1 flex flex-col bg-white">
                {selectedConversation ? (
                  <>
                    <div className="h-12 border-b border-gray-100 bg-gray-50 px-4 flex items-center justify-between text-xs font-bold text-gray-800 shrink-0">
                      <span># {selectedConversation.name}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                      {messages.map((msg) => {
                        const isMe = msg.sender_type === 'EXTERNAL';
                        return (
                          <div key={msg.id} className={`flex flex-col max-w-[70%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                            <span className="text-xs text-gray-400 mb-0.5 font-medium">{msg.sender_name}</span>
                            <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed
                              ${isMe ? 'bg-orange-500 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none border border-gray-100'}`}>
                              {msg.message}
                            </div>
                            <span className="text-[9px] text-gray-400 mt-1">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                        );
                      })}
                      <div ref={chatEndRef}></div>
                    </div>
                    <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-100 bg-gray-50 flex gap-2 shrink-0">
                      <input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        disabled={isPreview}
                        placeholder={isPreview ? 'Envio de mensagens indisponível no modo de pré-visualização' : `Enviar mensagem em #${selectedConversation.name}...`}
                        className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-form-input text-gray-900 focus:outline-none focus:border-orange-500 disabled:opacity-40"
                      />
                      <Button type="submit" size="icon" disabled={isPreview} className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40 disabled:cursor-not-allowed">
                        <Send className="w-4 h-4" />
                      </Button>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Selecione ou aguarde o início de uma conversa.</div>
                )}
              </div>
            </div>
          )}

          {/* TAB: DOCUMENTOS — mesma <DocumentsTable> da Gestão de Documentos (GED), só que
              somente-leitura e restrita aos documentos que a construtora compartilhou com este
              workspace. Fonte única de layout: qualquer ajuste na tabela do GED reflete aqui. */}
          {activeTab === 'documentos' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Sidebar "Pastas e disciplinas" — versão read-only por categoria (o parceiro não
                  enxerga a árvore de pastas interna do GED, só os documentos compartilhados com ele) */}
              <div className="lg:col-span-1 flex flex-col gap-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Pastas e disciplinas</h4>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => setDocCategoriaFilter('all')}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all
                      ${docCategoriaFilter === 'all' ? 'bg-orange-500/10 border border-orange-500/20 text-orange-600' : 'text-gray-500 hover:bg-gray-50 border border-transparent'}`}
                  >
                    <span className="flex items-center gap-2"><FolderOpen className="w-3.5 h-3.5" /> Todos os documentos</span>
                    <span className="text-gray-400 font-bold">{sharedOpuraDocuments.length}</span>
                  </button>
                  {[...CATEGORIA_ORDER, ...Object.keys(categoriaCounts).filter((c) => !CATEGORIA_ORDER.includes(c))]
                    .filter((cat) => categoriaCounts[cat] > 0)
                    .map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setDocCategoriaFilter(cat)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all
                          ${docCategoriaFilter === cat ? 'bg-orange-500/10 border border-orange-500/20 text-orange-600' : 'text-gray-500 hover:bg-gray-50 border border-transparent'}`}
                      >
                        <span className="truncate">{CATEGORIA_LABELS[cat] || cat}</span>
                        <span className="text-gray-400 font-bold shrink-0 ml-2">{categoriaCounts[cat]}</span>
                      </button>
                    ))}
                </div>
              </div>

              {/* Coluna principal: toolbar + enviados por você + tabela */}
              <div className="lg:col-span-3 flex flex-col gap-6 min-w-0">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h3 className="text-md font-bold text-gray-900">Documentos Compartilhados</h3>
                  <Button
                    onClick={() => setIsSendDocModalOpen(true)}
                    disabled={isPreview}
                    title={isPreview ? 'Indisponível no modo de pré-visualização' : undefined}
                    className="bg-orange-500 hover:bg-orange-600 text-white shadow-sm normal-case tracking-normal shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-4 h-4" />
                    Enviar Documento
                  </Button>
                </div>

                {sentDocuments.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                      Enviados por Você
                      <span className="text-gray-400 font-bold">({sentDocuments.length})</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sentDocuments.map((req) => (
                        <div key={req.id} className="bg-white border border-gray-200 p-4 rounded-2xl flex flex-col gap-3 shadow-sm">
                          <div className="flex items-start justify-between">
                            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Upload className="w-5 h-5" /></div>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md border
                              ${req.status === 'CONCLUIDO' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-yellow-50 text-yellow-600 border-yellow-200'}`}>
                              {req.status === 'CONCLUIDO' ? 'Incluído no GED' : 'Aguardando revisão'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-gray-900 truncate">{req.title}</h4>
                            <p className="text-xs text-gray-400 mt-1 truncate">{req.description}</p>
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-3 mt-1">
                            <span>Enviado em: {new Date(req.created_at).toLocaleDateString()}</span>
                            {req.attachment_paths?.[0] && (
                              <button
                                type="button"
                                onClick={() => handleDownloadAttachment(req.attachment_paths![0])}
                                className="flex items-center gap-1 text-orange-500 hover:text-orange-600 font-semibold"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Ver</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Toolbar acoplada à tabela (§5.2 do guia de UI) — busca, filtros e config de colunas */}
                <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-white space-y-3">
                    <div className="flex flex-col md:flex-row gap-2.5 items-center">
                      <div className="flex-1 relative w-full">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          value={docSearchQuery}
                          onChange={(e) => setDocSearchQuery(e.target.value)}
                          placeholder="Buscar documento por nome, tipo ou código..."
                          className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                        />
                      </div>
                      <button
                        onClick={() => setShowDocFilters((v) => !v)}
                        className={`h-9 px-3 flex items-center gap-1.5 rounded-[6px] text-sm font-medium transition-all shrink-0
                          ${showDocFilters || docStatusFilter !== 'all' ? 'bg-orange-500 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                      >
                        <Filter className="w-4 h-4" />
                        Filtros
                      </button>
                      <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        <ColumnConfigButton
                          columns={PARTNER_DOC_COLUMNS.filter((c) => c.key !== 'actions')}
                          visibleColumns={partnerDocColumns.visibleColumns}
                          showColumnConfig={partnerDocColumns.showColumnConfig}
                          onToggleShow={() => partnerDocColumns.setShowColumnConfig(!partnerDocColumns.showColumnConfig)}
                          onToggleColumn={partnerDocColumns.toggleColumn}
                          onReset={partnerDocColumns.resetColumns}
                        />
                      </div>
                    </div>
                    {showDocFilters && (
                      <div className="bg-gray-50 border border-gray-200 rounded-[10px] p-3 flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 mr-1">Status:</span>
                        {([
                          { id: 'all', label: 'Todos' },
                          { id: 'ativo', label: 'Ativos' },
                          { id: 'alerta', label: 'Em Alerta' },
                          { id: 'vencido', label: 'Vencidos' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => setDocStatusFilter(opt.id)}
                            className={`px-3 h-7 rounded-[6px] text-xs font-medium transition-all
                              ${docStatusFilter === opt.id ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-100'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <DocumentsTable
                    documents={filteredSharedDocuments}
                    tableColumns={partnerDocColumns}
                    resolveProjectName={() => '-'}
                    renderActions={(doc) => (
                      doc.active_version?.storage_path ? (
                        <ActionIconButton
                          kind="download"
                          onClick={() => handleDownloadSharedDocument(doc.active_version!.storage_path)}
                        />
                      ) : null
                    )}
                    emptyState={
                      sharedDocs.length === 0 ? (
                        <div className="text-sm text-slate-400 font-medium">
                          Nenhum documento compartilhado com o seu portal no momento.
                        </div>
                      ) : (
                        <div className="text-sm text-slate-400 font-medium">
                          Nenhum documento encontrado para os filtros aplicados.
                        </div>
                      )
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB: CONTRATOS */}
          {activeTab === 'contratos' && detailContract && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDetailContract(null)}
                  className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-95 transition-all shrink-0"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-600" />
                </button>
                <div className="min-w-0">
                  <span className="text-xs text-gray-400 font-bold uppercase">Nº {detailContract.number}</span>
                  <h3 className="text-md font-bold text-gray-900 truncate">{detailContract.title || 'Contrato'}</h3>
                </div>
              </div>

              <div className="flex gap-1 border-b border-gray-100 overflow-x-auto shrink-0">
                {([
                  { id: 'overview', label: 'Visão Geral', icon: TrendingUp },
                  { id: 'items', label: `Itens (${contractItems.length})`, icon: Package },
                  { id: 'addendums', label: `Aditivos (${contractAddendums.length})`, icon: FileText },
                  { id: 'measurements', label: `Medições (${contractMeasurements.length})`, icon: Ruler },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    className={`px-3 py-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all
                      ${detailTab === tab.id ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {detailLoading ? (
                <div className="text-center py-12 text-xs text-gray-400">Carregando...</div>
              ) : (
                <>
                  {detailTab === 'overview' && (
                    <div className="flex flex-col gap-4">
                      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Resumo de Execução</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
                          <div>
                            <span className="text-gray-400 block">Data Início</span>
                            <span className="font-bold text-gray-900">{detailContract.start_date ? new Date(detailContract.start_date).toLocaleDateString() : '-'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">Data Término</span>
                            <span className="font-bold text-gray-900">{detailContract.end_date ? new Date(detailContract.end_date).toLocaleDateString() : '-'}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">Tempo Decorrido</span>
                            <span className="font-bold text-gray-900">{timeProgress.toFixed(1)}%</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block">Progresso Físico-Financeiro</span>
                            <span className="font-bold text-gray-900">{physicalProgress.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2.5">
                          <div>
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                              <span>Execução do Prazo</span><span>{timeProgress.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, timeProgress)}%` }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                              <span>Progresso Físico-Financeiro</span><span>{physicalProgress.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full bg-orange-500" style={{ width: `${Math.min(100, physicalProgress)}%` }}></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="bg-white border border-gray-200 rounded-xl p-3">
                          <span className="text-[10px] text-gray-400 uppercase font-semibold block">Valor Atual</span>
                          <span className="text-sm font-black text-gray-900">R$ {Number(detailContract.current_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl p-3">
                          <span className="text-[10px] text-gray-400 uppercase font-semibold block">Valor Original</span>
                          <span className="text-sm font-black text-gray-900">R$ {Number(detailContract.original_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl p-3">
                          <span className="text-[10px] text-gray-400 uppercase font-semibold block">% em Aditivos</span>
                          <span className="text-sm font-black text-gray-900">{addendumsPercentage.toFixed(1)}%</span>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl p-3">
                          <span className="text-[10px] text-gray-400 uppercase font-semibold block">Total Medido</span>
                          <span className="text-sm font-black text-gray-900">R$ {totalMeasured.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl p-3">
                          <span className="text-[10px] text-gray-400 uppercase font-semibold block">Retenções</span>
                          <span className="text-sm font-black text-gray-900">R$ {retentionValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                          <span className="text-[10px] text-orange-600 uppercase font-semibold block">Saldo a Faturar</span>
                          <span className="text-sm font-black text-orange-700">R$ {saldoAFaturar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {detailTab === 'items' && (
                    <div className="flex flex-col gap-2">
                      {contractItems.map((item) => (
                        <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{item.description}</p>
                            <p className="text-[10px] text-gray-400">{item.quantity} {item.unit} × R$ {Number(item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                          <span className="text-xs font-black text-gray-900 shrink-0">R$ {Number(item.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                      {contractItems.length === 0 && (
                        <div className="text-center py-8 text-xs text-gray-400">Nenhum item cadastrado.</div>
                      )}
                    </div>
                  )}

                  {detailTab === 'addendums' && (
                    <div className="flex flex-col gap-2">
                      {contractAddendums.map((a) => (
                        <div key={a.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold text-gray-900">Aditivo Nº {a.number} — {a.type}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                              ${a.status === 'Aprovado' ? 'bg-green-100 text-green-700' : a.status === 'Rejeitado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {a.status}
                            </span>
                          </div>
                          {a.description && <p className="text-[11px] text-gray-500 mb-1">{a.description}</p>}
                          <div className="flex flex-wrap gap-4 text-[10px] text-gray-400">
                            {a.value_impact ? <span>Impacto: R$ {Number(a.value_impact).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}
                            {a.new_end_date ? <span>Novo término: {new Date(a.new_end_date).toLocaleDateString()}</span> : null}
                          </div>
                        </div>
                      ))}
                      {contractAddendums.length === 0 && (
                        <div className="text-center py-8 text-xs text-gray-400">Nenhum aditivo registrado.</div>
                      )}
                    </div>
                  )}

                  {detailTab === 'measurements' && (
                    <div className="flex flex-col gap-2">
                      {contractMeasurements.map((m) => (
                        <div key={m.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold text-gray-900">Medição Nº {m.number}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                              ${m.status === 'Paga' || m.status === 'Processada' ? 'bg-green-100 text-green-700' : m.status === 'Cancelada' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {m.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mb-1">
                            Período: {m.period_start ? new Date(m.period_start).toLocaleDateString() : '-'} até {m.period_end ? new Date(m.period_end).toLocaleDateString() : '-'}
                          </p>
                          <div className="flex flex-wrap gap-4 text-[10px] text-gray-400">
                            <span>Bruto: R$ {Number(m.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span>Retenção: R$ {Number(m.retention_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span>Líquido: R$ {Number(m.net_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            {m.invoice_url && (
                              <a href={m.invoice_url} target="_blank" rel="noreferrer" className="text-orange-500 hover:text-orange-600 font-semibold">Ver Nota</a>
                            )}
                          </div>
                        </div>
                      ))}
                      {contractMeasurements.length === 0 && (
                        <div className="text-center py-8 text-xs text-gray-400">Nenhuma medição registrada.</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* TAB: CONTRATOS (lista) */}
          {activeTab === 'contratos' && !detailContract && (
            <div className="flex flex-col gap-6">
              <h3 className="text-md font-bold text-gray-900">Seus Contratos Ativos</h3>
              <div className="flex flex-col gap-4">
                {contracts.map((contract) => (
                  <div
                    key={contract.id}
                    onClick={() => openContractDetail(contract)}
                    className="bg-white border border-gray-200 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-orange-200 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 text-xs font-bold rounded-md uppercase">
                          {contract.nature || 'Contrato'}
                        </span>
                        <span className="text-xs text-gray-400 font-bold">Nº {contract.number}</span>
                      </div>
                      <h4 className="text-xs font-bold text-gray-900 truncate">{contract.title || 'Contrato Prestação de Serviços'}</h4>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                        <span>Vigência: {contract.start_date ? new Date(contract.start_date).toLocaleDateString() : '-'} até {contract.end_date ? new Date(contract.end_date).toLocaleDateString() : '-'}</span>
                        <span>Reajuste: {contract.reajuste_index || 'Sem reajuste'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 shrink-0 border-t md:border-t-0 border-gray-100 pt-3 md:pt-0" onClick={(e) => e.stopPropagation()}>
                      <div className="text-left md:text-right">
                        <span className="text-xs text-gray-400 uppercase block font-semibold">Valor Atual</span>
                        <h4 className="text-sm font-black text-gray-900 mt-0.5">R$ {Number(contract.current_value).toLocaleString('pt-BR', {minimumFractionDigits:2})}</h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => openContractDetail(contract)}
                        className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3.5 py-2 rounded-xl text-xs text-gray-700 hover:bg-gray-100 active:scale-95 transition-all font-semibold"
                      >
                        Ver Detalhes
                      </button>
                      {getContractFileUrl(contract) && (
                        <a
                          href={getContractFileUrl(contract)!}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-3.5 py-2 rounded-xl text-xs text-gray-700 hover:bg-gray-100 active:scale-95 transition-all font-semibold"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-orange-500" />
                          Ver PDF
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {contracts.length === 0 && (
                  <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-2xl text-xs text-gray-400">
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
                <h3 className="text-md font-bold text-gray-900">Solicitações de Atendimento</h3>
                <Button
                  onClick={() => setIsNewRequestModalOpen(true)}
                  disabled={isPreview}
                  title={isPreview ? 'Indisponível no modo de pré-visualização' : undefined}
                  className="bg-orange-500 hover:bg-orange-600 text-white shadow-sm normal-case tracking-normal disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Nova Solicitação
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                {requests.map((req) => (
                  <div key={req.id} className="bg-white border border-gray-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 text-[9px] font-black rounded-md border
                          ${req.priority === 'ALTA' ? 'bg-red-50 text-red-500 border-red-100' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                          {req.priority}
                        </span>
                        <span className="text-xs text-gray-400 font-bold uppercase">{req.type}</span>
                      </div>
                      <h4 className="text-xs font-bold text-gray-900 truncate">{req.title}</h4>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">{req.description}</p>
                      {req.attachment_paths && req.attachment_paths.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {req.attachment_paths.map((path, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleDownloadAttachment(path)}
                              className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-semibold bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span className="truncate max-w-[10rem]">{path.split('/').pop()?.replace(/^\d+_/, '')}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-6 shrink-0 border-t md:border-t-0 border-gray-100 pt-3 md:pt-0">
                      <div className="text-left md:text-right">
                        <span className="text-xs text-gray-400 uppercase block font-semibold">Status</span>
                        <span className={`text-xs font-bold mt-1 px-2.5 py-0.5 rounded-full inline-block
                          ${req.status === 'CONCLUIDO' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {req.status}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 font-medium">Aberto em: {new Date(req.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
                {requests.length === 0 && (
                  <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-2xl text-xs text-gray-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-gray-200 max-w-md w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-md font-bold text-gray-900">Nova Solicitação</h3>

            <form onSubmit={handleCreateRequest} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Título</label>
                <input
                  required
                  value={newRequest.title}
                  onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                  placeholder="Ex: Reenvio de projeto executivo de fundação"
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-form-input text-gray-900 focus:outline-none focus:border-orange-500"
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
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-form-input text-gray-900 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400 uppercase font-bold">Tipo</label>
                  <select
                    value={newRequest.type}
                    onChange={(e) => setNewRequest({ ...newRequest, type: e.target.value as any })}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-form-input text-gray-900 focus:outline-none"
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
                    className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-form-input text-gray-900 focus:outline-none"
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
                  className="text-xs text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-gray-100 file:text-gray-700 file:text-xs file:font-semibold hover:file:bg-gray-200"
                />
                {newRequestFiles.length > 0 && (
                  <ul className="flex flex-col gap-1 pt-1">
                    {newRequestFiles.map((f, idx) => (
                      <li key={idx} className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Paperclip className="w-3 h-3" />
                        <span className="truncate">{f.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsNewRequestModalOpen(false)}
                  className="normal-case tracking-normal"
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

      {/* MODAL: ENVIAR DOCUMENTO */}
      {isSendDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-gray-200 max-w-md w-full p-6 rounded-2xl flex flex-col gap-4 shadow-2xl relative">
            <h3 className="text-md font-bold text-gray-900">Enviar Documento</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              O arquivo enviado aqui fica pendente de revisão da construtora antes de entrar
              oficialmente no GED. Você pode acompanhar o status na própria aba Documentos.
            </p>

            <form onSubmit={handleSendDocument} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Arquivo</label>
                <input
                  required
                  type="file"
                  onChange={(e) => setSendDocFile(e.target.files?.[0] || null)}
                  className="text-xs text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-gray-100 file:text-gray-700 file:text-xs file:font-semibold hover:file:bg-gray-200"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Observação (opcional)</label>
                <textarea
                  rows={3}
                  value={sendDocNote}
                  onChange={(e) => setSendDocNote(e.target.value)}
                  placeholder="Ex: ART atualizada referente ao contrato nº..."
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-form-input text-gray-900 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsSendDocModalOpen(false);
                    setSendDocFile(null);
                    setSendDocNote('');
                  }}
                  className="normal-case tracking-normal"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={sendingDoc || !sendDocFile}
                  className="bg-orange-500 hover:bg-orange-600 text-white normal-case tracking-normal disabled:opacity-50"
                >
                  {sendingDoc ? 'Enviando...' : 'Enviar Documento'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MINHA CONTA */}
      {showMyAccount && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setShowMyAccount(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md animate-in zoom-in-95 fade-in duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-8 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Minha Conta</h2>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">Dados cadastrais</p>
                </div>
              </div>
              <button onClick={() => setShowMyAccount(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 space-y-4">
              {[
                ['Nome', partnerUser?.name || '—'],
                ['E-mail', partnerUser?.email || userEmail || '—'],
                ['Perfil', partnerUser?.role || '—'],
                ['Empresa', workspace?.supplier_name || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">{label}</div>
                  <div className="text-sm font-semibold text-gray-800">{value}</div>
                </div>
              ))}
              <p className="text-xs text-gray-400 pt-3 border-t border-gray-100">
                Para alterar seus dados cadastrais, entre em contato com a construtora.
              </p>
            </div>
          </div>
        </div>
      )}

      {menuMsg && (
        <div className="fixed bottom-6 right-6 z-[300] flex items-center gap-2 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium bg-gray-900 text-white animate-in slide-in-from-bottom-4 duration-300">
          <HelpCircle className="w-4 h-4 shrink-0" /> {menuMsg}
        </div>
      )}

    </div>
  );
};

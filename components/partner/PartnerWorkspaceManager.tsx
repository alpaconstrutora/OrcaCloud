import React, { useState, useEffect, useMemo, Suspense } from 'react';
import ActionIconButton from '../ui/ActionIconButton';
import {
  Building2,
  Users,
  FolderOpen,
  ClipboardList,
  Plus,
  Check,
  X,
  ExternalLink,
  PlusCircle,
  Share2,
  UserPlus,
  CheckCircle,
  AlertCircle,
  Eye,
  Link2,
  MessageSquare,
  Send,
  FileText,
  Search,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';
import Button from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { partnerService } from '../../services/partnerService';
import { partnerPortalTokenService, PartnerPortalToken } from '../../services/partnerPortalTokenService';
import { supplierService, getSupplierDisplayName } from '../../services/supplierService';
import { appSettingsService } from '../../services/appSettingsService';
import { organizationService } from '../../services/organizationService';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';
import { KpiCard } from '../ui/KpiCard';

const PartnerPortalPreview = React.lazy(() => import('./PartnerPortal').then(m => ({ default: m.PartnerPortal })));
import {
  PartnerWorkspace,
  PartnerUser,
  PartnerRequest,
  PartnerSharedDocument,
  PartnerConversation,
  PartnerMessage,
  PartnerRole,
  Contract
} from '../../types';

interface PartnerWorkspaceManagerProps {
  organizationId: string;
  currentUserEmail?: string;
}

// ui_ux_standard_guide.md — COLUMNS fora do componente (§2)
const PARTNER_COLUMNS: ColumnConfig[] = [
  { key: 'supplier', label: 'Parceiro', sortable: true },
  { key: 'organization', label: 'Organização', sortable: true },
  { key: 'users', label: 'Usuários', sortable: true },
  { key: 'documents', label: 'Documentos', sortable: true },
  { key: 'requests', label: 'Solicitações', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
];

const CATEGORIA_LABELS: Record<string, string> = {
  engenharia: 'Projetos',
  juridico: 'Contratos',
  compliance: 'Licenças & Alvarás',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
};
const CATEGORIA_ORDER = ['engenharia', 'juridico', 'compliance', 'financeiro', 'comercial'];

export const PartnerWorkspaceManager: React.FC<PartnerWorkspaceManagerProps> = ({ organizationId, currentUserEmail }) => {
  const confirm = useConfirm();
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
  // Parceiro global + "Todas as organizações" no topo = nenhuma das duas fontes de
  // organização existe; em vez de bloquear a ação, deixamos escolher aqui (mesmo
  // ajuste feito no Portal do Fornecedor — "criar do zero sem entidade-pai" pede
  // seletor, não beco sem saída).
  const [tokenOrgOverride, setTokenOrgOverride] = useState('');

  // Conversas (contrapartida interna do chat que o parceiro vê no próprio portal)
  const [conversations, setConversations] = useState<PartnerConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<PartnerConversation | null>(null);
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Contratos (contrapartida interna da aba Contratos que o parceiro vê no próprio portal)
  const [workspaceContracts, setWorkspaceContracts] = useState<Contract[]>([]);

  // Listas auxiliares da Construtora
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);

  // Carregamento e Mensagens
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'usuarios' | 'conversas' | 'documentos' | 'contratos' | 'solicitacoes'>('usuarios');

  // Tela de listagem (KPI + tabela, ui_ux_standard_guide.md) — filtros sobrevivem a navegação (§3)
  const [searchTerm, setSearchTerm] = usePersistedState('partnerWorkspaceList:search', '');
  const tableColumns = useTableColumns(PARTNER_COLUMNS, 'partnerWorkspaceListColumns');
  const [workspaceStats, setWorkspaceStats] = useState<Record<string, { users: number; documents: number; requestsOpen: number }>>({});
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});

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

  // Recarregar só a lista de parceiros (botão de atualizar da toolbar)
  const refreshWorkspaces = async () => {
    setLoading(true);
    try {
      const wss = await partnerService.listWorkspaces(organizationId);
      setWorkspaces(wss);
    } catch (err) {
      console.error('Erro ao atualizar parceiros:', err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Carregar workspaces e fornecedores iniciais
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        const wss = await partnerService.listWorkspaces(organizationId);
        setWorkspaces(wss);

        // Carrega fornecedores ativos da org usando o serviço correto (que inclui globais/locais)
        const sups = await supplierService.listSuppliers(organizationId);
        setSuppliers(sups || []);

        // Nomes de organização, para a coluna "Organização" da tabela (workspace pode ser
        // de qualquer organização quando "Todas as organizações" está selecionado)
        try {
          const orgs = await organizationService.listOrganizations();
          setOrgNames(Object.fromEntries(orgs.map((o: any) => [o.id, o.name])));
        } catch (err) {
          console.error('Erro ao carregar nomes de organizações:', err);
        }

        // Carrega documentos ativos da org (sem filtro quando "Todas as organizações" está selecionado)
        let docsQuery = supabase
          .from('opura_documents')
          .select('id, nome, categoria, supplier_id, project_id');
        if (organizationId) {
          docsQuery = docsQuery.eq('organization_id', organizationId);
        }
        const { data: docs } = await docsQuery;
        setDocuments(docs || []);
      } catch (err) {
        console.error('Erro ao carregar workspaces:', err);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, [organizationId]);

  // 1.1 Contagens por workspace (usuários / documentos / solicitações abertas) para a tabela e os KPIs
  useEffect(() => {
    if (workspaces.length === 0) {
      setWorkspaceStats({});
      return;
    }
    const ids = workspaces.map((w) => w.id);
    (async () => {
      try {
        const [{ data: users }, { data: docs }, { data: reqs }] = await Promise.all([
          supabase.from('partner_users').select('partner_workspace_id').in('partner_workspace_id', ids),
          supabase.from('partner_shared_documents').select('partner_workspace_id').in('partner_workspace_id', ids),
          supabase.from('partner_requests').select('partner_workspace_id, status').in('partner_workspace_id', ids),
        ]);
        const stats: Record<string, { users: number; documents: number; requestsOpen: number }> = {};
        ids.forEach((id) => { stats[id] = { users: 0, documents: 0, requestsOpen: 0 }; });
        (users || []).forEach((u: any) => { if (stats[u.partner_workspace_id]) stats[u.partner_workspace_id].users++; });
        (docs || []).forEach((d: any) => { if (stats[d.partner_workspace_id]) stats[d.partner_workspace_id].documents++; });
        (reqs || []).forEach((r: any) => {
          if (stats[r.partner_workspace_id] && (r.status === 'ABERTO' || r.status === 'EM_ANALISE')) {
            stats[r.partner_workspace_id].requestsOpen++;
          }
        });
        setWorkspaceStats(stats);
      } catch (err) {
        console.error('Erro ao carregar contagens dos parceiros:', err);
      }
    })();
  }, [workspaces]);

  // 2. Recarregar dados ao selecionar outro workspace
  useEffect(() => {
    setTokenOrgOverride('');
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

        const convs = await partnerService.listConversations(selectedWorkspace.id);
        setConversations(convs);
        setSelectedConversation(convs.length > 0 ? convs[0] : null);

        const { data: fullContracts } = await supabase
          .from('contracts')
          .select('*')
          .eq('supplier_id', selectedWorkspace.supplier_id);
        setWorkspaceContracts((fullContracts || []) as Contract[]);
      } catch (err) {
        console.error('Erro ao carregar detalhes do workspace:', err);
      }
    };

    loadWorkspaceDetails();
  }, [selectedWorkspace]);

  // 3. Mensagens do canal selecionado + Realtime
  useEffect(() => {
    if (!selectedConversation) return;

    const loadMessages = async () => {
      const msgs = await partnerService.listMessages(selectedConversation.id);
      setMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    loadMessages();

    const channel = supabase
      .channel(`partner-admin-chat-${selectedConversation.id}`)
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

  // Responder no canal do parceiro (lado interno)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      await partnerService.sendMessage({
        conversation_id: selectedConversation.id,
        sender_email: currentUserEmail || 'equipe@construtora',
        sender_name: 'Equipe Construtora',
        sender_type: 'INTERNAL',
        message: newMessage,
        attachments: []
      });
      setNewMessage('');
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    }
  };

  // URL do PDF do contrato: prioriza o assinado; se não houver, cai na última minuta
  // marcada como "emitida" (mesma lógica usada na aba Contratos do PartnerPortal.tsx).
  const getContractFileUrl = (contract: Contract): string | null => {
    if (contract.signed_contract_url) return contract.signed_contract_url;
    const emitted = (contract.minuta_versions || []).filter((m) => m.emitted && m.url);
    return emitted.length > 0 ? emitted[emitted.length - 1].url : null;
  };

  // Fonte da organização que vai administrar o link: seletor do topo → organização
  // do próprio workspace → organização que já gerou o token (regenerar) → escolha
  // manual no modal (só quando nenhuma das anteriores existe).
  const derivedTokenOrgId = organizationId || selectedWorkspace?.organization_id || portalToken?.org_id || '';
  const effectiveTokenOrgId = derivedTokenOrgId || tokenOrgOverride;

  // Gerar/regenerar o link de acesso público do workspace selecionado
  const handleGenerateToken = async () => {
    if (!selectedWorkspace || !effectiveTokenOrgId) return;
    setTokenLoading(true);
    try {
      await partnerPortalTokenService.generateToken(selectedWorkspace.id, effectiveTokenOrgId);
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
    if (!selectedWorkspace || !portalToken) return;
    const ok = await confirm({
      title: 'Revogar acesso ao portal?',
      message: 'O parceiro perderá o acesso via link imediatamente.',
      variant: 'warning',
      confirmLabel: 'Revogar',
    });
    if (!ok) return;
    setTokenLoading(true);
    try {
      // Usa o org_id já gravado no próprio token (quem gerou), em vez do filtro de
      // organização atual da tela — evita falhar quando se está em "Todas as organizações".
      await partnerPortalTokenService.revokeToken(selectedWorkspace.id, portalToken.org_id);
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

    // Com "Todas as organizações" selecionado (organizationId vazio), cruza com o
    // cadastro do próprio fornecedor: se ele já pertence a uma organização específica,
    // usa essa organização automaticamente. Se o fornecedor também for global
    // ("Todas as Organizações"), o workspace nasce global também (organization_id
    // NULL) — mesmo conceito já usado em suppliers.organization_id, sem perguntar nada.
    const selectedSupplier = suppliers.find((s) => s.id === newWorkspaceSupplierId);
    const targetOrgId: string | null = organizationId || selectedSupplier?.organization_id || null;

    try {
      const created = await partnerService.saveWorkspace({
        organization_id: targetOrgId,
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

  // Confirmar promoção do anexo a documento formal do GED (decisão manual do time interno).
  // opura_documents é sempre de uma organização específica, então precisa de uma resolvida
  // mesmo quando o workspace do parceiro é global.
  const handleConfirmPromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace || !promotingAttachmentPath || !promoteDocName.trim()) return;

    const promoteOrgId = organizationId || selectedWorkspace.organization_id;
    if (!promoteOrgId) {
      alert('Selecione uma organização específica no topo do sistema para promover este anexo ao GED de um parceiro global.');
      return;
    }

    setPromoting(true);
    try {
      await partnerService.promoteAttachmentToDocument(
        selectedWorkspace.id,
        promotingAttachmentPath,
        promoteDocName.trim(),
        promoteDocCategoria as any,
        'Membro Construtora',
        promoteOrgId
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

  // KPIs da tela de listagem (§4.2 — "Total" em destaque + decomposição)
  const kpis = useMemo(() => ({
    total: workspaces.length,
    ativos: workspaces.filter((w) => w.is_active).length,
    comUsuarios: workspaces.filter((w) => (workspaceStats[w.id]?.users || 0) > 0).length,
    globais: workspaces.filter((w) => !w.organization_id).length,
  }), [workspaces, workspaceStats]);

  const filteredWorkspaces = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let result = workspaces.filter((w) =>
      !q || (w.supplier_name || '').toLowerCase().includes(q)
    );

    return result.sort((a, b) => {
      if (tableColumns.sortColumn) {
        let cmp = 0;
        switch (tableColumns.sortColumn) {
          case 'supplier':
            cmp = (a.supplier_name || '').localeCompare(b.supplier_name || '');
            break;
          case 'organization': {
            const orgA = a.organization_id ? (orgNames[a.organization_id] || '') : 'Todas as Organizações';
            const orgB = b.organization_id ? (orgNames[b.organization_id] || '') : 'Todas as Organizações';
            cmp = orgA.localeCompare(orgB);
            break;
          }
          case 'users':
            cmp = (workspaceStats[a.id]?.users || 0) - (workspaceStats[b.id]?.users || 0);
            break;
          case 'documents':
            cmp = (workspaceStats[a.id]?.documents || 0) - (workspaceStats[b.id]?.documents || 0);
            break;
          case 'requests':
            cmp = (workspaceStats[a.id]?.requestsOpen || 0) - (workspaceStats[b.id]?.requestsOpen || 0);
            break;
          case 'status':
            cmp = Number(a.is_active) - Number(b.is_active);
            break;
        }
        return tableColumns.sortDirection === 'asc' ? cmp : -cmp;
      }
      return (a.supplier_name || '').localeCompare(b.supplier_name || '');
    });
  }, [workspaces, searchTerm, tableColumns.sortColumn, tableColumns.sortDirection, workspaceStats, orgNames]);

  // Ativar/desativar direto da tabela, sem precisar abrir o detalhe
  const handleToggleActiveInline = async (ws: PartnerWorkspace, e: React.MouseEvent) => {
    e.stopPropagation();
    const toggled = await partnerService.saveWorkspace({ ...ws, is_active: !ws.is_active });
    setWorkspaces((prev) => prev.map((w) => (w.id === ws.id ? { ...w, is_active: toggled.is_active } : w)));
    if (selectedWorkspace?.id === ws.id) {
      setSelectedWorkspace((prev) => (prev ? { ...prev, is_active: toggled.is_active } : null));
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] overflow-y-auto bg-white text-gray-800 font-sans">
      <main className="p-6 flex flex-col gap-6">
        {selectedWorkspace ? (
          <>
            <button
              onClick={() => setSelectedWorkspace(null)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 transition-all w-fit"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar para Parceiros
            </button>
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
                onClick={() => setActiveSubTab('conversas')}
                className={`px-4 py-2.5 text-button font-bold border-b-2 transition-all flex items-center gap-2
                  ${activeSubTab === 'conversas' ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
              >
                <MessageSquare className="w-4 h-4" />
                Conversas
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
                onClick={() => setActiveSubTab('contratos')}
                className={`px-4 py-2.5 text-button font-bold border-b-2 transition-all flex items-center gap-2
                  ${activeSubTab === 'contratos' ? 'border-orange-500 text-orange-500' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
              >
                <FileText className="w-4 h-4" />
                Contratos ({workspaceContracts.length})
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

            {/* SUBTAB: CONVERSAS */}
            {activeSubTab === 'conversas' && (
              <div className="flex h-[32rem] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {/* Canais */}
                <div className="w-56 border-r border-gray-100 bg-gray-50 flex flex-col">
                  <div className="p-4 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">Canais</div>
                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                    {conversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => setSelectedConversation(conv)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left font-medium text-sm transition-all
                          ${selectedConversation?.id === conv.id ? 'bg-orange-500 text-white font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
                      >
                        <span className="text-lg leading-none">#</span>
                        <span className="truncate">{conv.name}</span>
                      </button>
                    ))}
                    {conversations.length === 0 && (
                      <div className="text-center py-6 text-xs text-gray-400">Nenhum canal ainda.</div>
                    )}
                  </div>
                </div>

                {/* Chat */}
                <div className="flex-1 flex flex-col bg-white">
                  {selectedConversation ? (
                    <>
                      <div className="h-12 border-b border-gray-100 bg-gray-50 px-4 flex items-center text-xs font-bold text-gray-800 shrink-0">
                        <span># {selectedConversation.name}</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                        {messages.map((msg) => {
                          const isMe = msg.sender_type === 'INTERNAL';
                          return (
                            <div key={msg.id} className={`flex flex-col max-w-[70%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                              <span className="text-xs text-gray-400 mb-0.5 font-medium">{msg.sender_name}</span>
                              <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed
                                ${isMe ? 'bg-orange-500 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none border border-gray-100'}`}>
                                {msg.message}
                              </div>
                              <span className="text-[9px] text-gray-400 mt-1">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          );
                        })}
                        {messages.length === 0 && (
                          <div className="text-center py-6 text-xs text-gray-400">Nenhuma mensagem ainda. Envie a primeira abaixo.</div>
                        )}
                        <div ref={chatEndRef}></div>
                      </div>
                      <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-100 bg-gray-50 flex gap-2 shrink-0">
                        <input
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder={`Responder em #${selectedConversation.name}...`}
                          className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-form-input text-gray-900 focus:outline-none focus:border-orange-500"
                        />
                        <Button type="submit" size="icon" className="bg-orange-500 hover:bg-orange-600 text-white">
                          <Send className="w-4 h-4" />
                        </Button>
                      </form>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-gray-400">Selecione um canal para conversar.</div>
                  )}
                </div>
              </div>
            )}

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
                          <td className="px-5 py-4 text-sm font-normal text-gray-900">{user.name}</td>
                          <td className="px-5 py-4 text-sm font-normal text-gray-500">{user.email}</td>
                          <td className="px-5 py-4 text-sm font-normal text-gray-500">{user.phone || '-'}</td>
                          <td className="px-5 py-4 text-sm font-normal text-gray-600">
                            {user.role}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <button
                              onClick={() => handleToggleUserActive(user)}
                              className={`text-sm font-normal ${user.is_active ? 'text-emerald-700' : 'text-gray-500'}`}
                            >
                              {user.is_active ? 'Ativo' : 'Inativo'}
                            </button>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <ActionIconButton kind="delete" title="Excluir Usuário" onClick={() => handleDeleteUser(user.id)} />
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

            {/* SUBTAB: CONTRATOS */}
            {activeSubTab === 'contratos' && (
              <div className="flex flex-col gap-4">
                <h3 className="text-sm font-bold text-gray-800">Contratos deste Fornecedor</h3>

                <div className="flex flex-col gap-3">
                  {workspaceContracts.map((contract) => (
                    <div key={contract.id} className="bg-white border border-gray-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
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
                          <span>Status: {contract.status}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 border-t md:border-t-0 border-gray-100 pt-3 md:pt-0">
                        <div className="text-left md:text-right">
                          <span className="text-xs text-gray-400 uppercase block font-semibold">Valor Atual</span>
                          <h4 className="text-sm font-black text-gray-900 mt-0.5">R$ {Number(contract.current_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                        </div>
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
                  {workspaceContracts.length === 0 && (
                    <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-200 rounded-2xl text-xs text-gray-400">
                      Nenhum contrato vinculado a este fornecedor.
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
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">Portal de Parceiros</h1>
              <p className="text-gray-400 text-sm mt-1.5 font-medium">Gerencie os fornecedores habilitados a acessar o Portal do Parceiro.</p>
            </div>

            {/* "Total" em destaque (2 colunas); os demais são a decomposição (§4.2) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <KpiCard shadow={false} size="lg" className="col-span-2" label="Total de Parceiros" value={kpis.total} icon={<Building2 className="w-4 h-4" />} color="orange" />
              <KpiCard shadow={false} size="sm" label="Ativos" value={kpis.ativos} icon={<CheckCircle className="w-4 h-4" />} color="emerald" />
              <KpiCard shadow={false} size="sm" label="Com usuários" value={kpis.comUsuarios} icon={<Users className="w-4 h-4" />} color="indigo" />
              <KpiCard shadow={false} size="sm" label="Globais" value={kpis.globais} icon={<Link2 className="w-4 h-4" />} color="violet" />
            </div>

            {/* Toolbar §5.1 (variante desaninhada, escala compacta §16) — já há KPI cards acima dando contexto */}
            <div className="flex flex-col md:flex-row gap-2.5 items-center">
              <div className="flex-1 relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por fornecedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <button
                onClick={refreshWorkspaces}
                className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
                title="Atualizar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

              <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                <ColumnConfigButton
                  columns={PARTNER_COLUMNS}
                  visibleColumns={tableColumns.visibleColumns}
                  showColumnConfig={tableColumns.showColumnConfig}
                  onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                  onToggleColumn={tableColumns.toggleColumn}
                  onReset={tableColumns.resetColumns}
                />
              </div>

              {/* Variante compacta do CTA primário (§17) — ativar parceiro não é o fluxo mais frequente da tela */}
              <button
                onClick={() => setIsNewWorkspaceModalOpen(true)}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-orange-500 text-white rounded-[6px] hover:bg-orange-600 font-medium text-[13px] transition-all active:scale-95 shrink-0"
              >
                <Plus className="w-[15px] h-[15px]" />
                Novo parceiro
              </button>
            </div>

            {!organizationId && (
              <p className="text-xs text-gray-400 -mt-3">
                Visualizando parceiros de todas as organizações. Ao ativar um novo, a organização é definida pelo cadastro do próprio fornecedor.
              </p>
            )}

            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
              </div>
            ) : filteredWorkspaces.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-[10px] border border-gray-100">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhum parceiro encontrado</h3>
                <p className="text-sm text-gray-500">
                  {searchTerm ? 'Tente ajustar sua busca.' : 'Clique em "Novo parceiro" para habilitar o primeiro.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                        {tableColumns.visibleColumns.includes('supplier') && (
                          <SortableHeader colKey="supplier" label="Parceiro" uppercase={false}
                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                            onSort={tableColumns.handleColumnSort}
                            className="px-6 py-2 border-r border-gray-100" />
                        )}
                        {tableColumns.visibleColumns.includes('organization') && (
                          <SortableHeader colKey="organization" label="Organização" uppercase={false}
                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                            onSort={tableColumns.handleColumnSort}
                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                        )}
                        {tableColumns.visibleColumns.includes('users') && (
                          <SortableHeader colKey="users" label="Usuários" uppercase={false}
                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                            onSort={tableColumns.handleColumnSort}
                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                        )}
                        {tableColumns.visibleColumns.includes('documents') && (
                          <SortableHeader colKey="documents" label="Documentos" uppercase={false}
                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                            onSort={tableColumns.handleColumnSort}
                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                        )}
                        {tableColumns.visibleColumns.includes('requests') && (
                          <SortableHeader colKey="requests" label="Solicitações" uppercase={false}
                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                            onSort={tableColumns.handleColumnSort}
                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                        )}
                        {tableColumns.visibleColumns.includes('status') && (
                          <SortableHeader colKey="status" label="Status" uppercase={false}
                            sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection}
                            onSort={tableColumns.handleColumnSort}
                            className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                        )}
                        <th className="px-6 py-2 text-right text-sm font-semibold text-gray-500">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredWorkspaces.map((ws) => {
                        const stats = workspaceStats[ws.id] || { users: 0, documents: 0, requestsOpen: 0 };
                        return (
                          <tr
                            key={ws.id}
                            onClick={() => setSelectedWorkspace(ws)}
                            className="hover:bg-orange-50/50 transition-colors cursor-pointer group"
                          >
                            {tableColumns.visibleColumns.includes('supplier') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                                    <Building2 className="w-4 h-4" />
                                  </div>
                                  <span className="text-sm font-normal text-gray-900">{ws.supplier_name}</span>
                                </div>
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('organization') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700">
                                {ws.organization_id ? (orgNames[ws.organization_id] || '-') : 'Todas as Organizações'}
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('users') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                {stats.users}
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('documents') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                {stats.documents}
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('requests') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                {stats.requestsOpen}
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('status') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                {/* StatusBadge — texto simples colorido, sem pílula/fundo/uppercase (§8) */}
                                <span className={`text-sm font-normal ${ws.is_active ? 'text-emerald-700' : 'text-gray-500'}`}>
                                  {ws.is_active ? 'Ativo' : 'Inativo'}
                                </span>
                              </td>
                            )}
                            <td className="px-6 py-2.5 text-right">
                              {/* Editar/gerenciar = clique na linha (ação dominante, §9.1). Ações aqui são só o que sobra. */}
                              <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => { setSelectedWorkspace(ws); setTokenModalOpen(true); }}
                                  title="Link de Acesso"
                                  className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-purple-600 hover:border-purple-100 rounded-xl transition-all shadow-sm active:scale-95"
                                >
                                  <Link2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => { setSelectedWorkspace(ws); setPreviewOpen(true); }}
                                  title="Visualizar como Parceiro"
                                  className="p-2.5 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-100 rounded-xl transition-all shadow-sm active:scale-95"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => handleToggleActiveInline(ws, e)}
                                  title={ws.is_active ? 'Desativar' : 'Ativar'}
                                  className={`p-2.5 bg-white border rounded-xl transition-all shadow-sm active:scale-95
                                    ${ws.is_active ? 'border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-100' : 'border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-100'}`}
                                >
                                  {ws.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
                    <option key={s.id} value={s.id}>
                      {getSupplierDisplayName(s, appSettingsService.get().supplierNameDisplay)}{!organizationId ? ` — ${s.organization_name || 'Todas as Organizações'}` : ''}
                    </option>
                  ))}
                </select>
                {!organizationId && newWorkspaceSupplierId && !suppliers.find(s => s.id === newWorkspaceSupplierId)?.organization_id && (
                  <p className="text-xs text-blue-600 pt-1">
                    Este fornecedor é global ("Todas as Organizações") — o parceiro será ativado como global também, visível em qualquer organização.
                  </p>
                )}
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

            {/* Parceiro global + "Todas as organizações" no topo: nenhuma organização dona
                do link é derivável — escolha manual aqui em vez de bloquear a ação. */}
            {!derivedTokenOrgId && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400 uppercase font-bold">Organização responsável pelo link</label>
                <select
                  value={tokenOrgOverride}
                  onChange={(e) => setTokenOrgOverride(e.target.value)}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-form-input text-gray-800 focus:outline-none"
                >
                  <option value="">Selecione a organização...</option>
                  {Object.entries(orgNames).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 pt-1">
                  Este parceiro é global (sem organização própria) e nenhuma organização
                  específica está selecionada no topo do sistema — escolha quem vai administrar
                  este link (gerar, regenerar, revogar).
                </p>
              </div>
            )}

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
                  <Button
                    variant="secondary"
                    onClick={handleGenerateToken}
                    disabled={!effectiveTokenOrgId}
                    title={effectiveTokenOrgId ? 'Gerar um novo link (invalida o atual)' : 'Escolha a organização responsável acima'}
                  >
                    Regenerar
                  </Button>
                  <Button variant="ghost" onClick={handleRevokeToken} className="text-red-500 hover:bg-red-50" title="Revogar acesso">
                    Revogar
                  </Button>
                </div>
              </>
            ) : (
              <Button
                onClick={handleGenerateToken}
                disabled={!effectiveTokenOrgId}
                title={effectiveTokenOrgId ? undefined : 'Escolha a organização responsável acima'}
                className="bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
              >
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

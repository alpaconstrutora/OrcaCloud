import React from 'react';
import ActionIconButton from './ui/ActionIconButton';
import { InlineActionTray } from './ui/InlineActionTray';
import {
  FolderOpen,
  Upload,
  Search,
  Plus,
  Trash2,
  Calendar,
  Tag,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Download,
  History,
  Pencil,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronRight,
  Settings,
  Building2,
  Briefcase,
  ExternalLink,
  Shield,
  Loader2,
  FolderPlus,
  CornerDownRight,
  Clock,
  ThumbsUp,
  ThumbsDown,
  UserCheck,
  Eye,
  Filter,
  Share2,
  Table2,
  LayoutDashboard,
  RefreshCw,
  Edit2,
  Check
} from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import {
  documentService,
  OpuraDmsDiscipline, OpuraDmsDocumentType,
  OpuraDmsNamingPattern
} from '../services/documentService';
import { partnerService } from '../services/partnerService';
import { DocumentMarkupViewer } from './ui/DocumentMarkupViewer';
import { validateFileNameAgainstMask, extractTokenFromFileName, generateFileNameFromMask, extractMaskTokens, getNextSequentialNumber, getInitialRevision } from '../utils/dmsUtils';
import {
  OpuraDocument,
  OpuraDocumentVersion,
  OpuraDocumentCategoria,
  OpuraDocumentStatus,
  OpuraFolder,
  OpuraFolderInsert,
  OpuraDocumentApproval,
  OpuraDocumentApprovalStatus,
  OpuraDocumentAuditLog,
  PartnerWorkspace,
} from '../types';
import { useStore } from '../store/useStore';

const COLUMNS: ColumnConfig[] = [
  { key: 'nome', label: 'Documento', sortable: true },
  { key: 'tipo_documento', label: 'Tipo / Categoria', sortable: true },
  { key: 'project_id', label: 'Obra Vinculada', sortable: true },
  { key: 'data_emissao', label: 'Emissão', sortable: true },
  { key: 'data_validade', label: 'Validade', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];

interface OpuraDocsModuleProps {
  activeOrganizationId: string | null;
  projects: any[];
  currentProfile: {
    group: string;
    role: string;
    email?: string;
  };
  onChangeView: (view: string) => void;
}

const CATEGORIES: { id: OpuraDocumentCategoria; label: string; roles: string[]; placeholder: string }[] = [
  { id: 'engenharia', label: 'Projetos', roles: ['admin', 'owner', 'engenheiro'], placeholder: 'ex: Projeto Estrutural, Memoriais, ART, RRT' },
  { id: 'juridico', label: 'Contratos', roles: ['admin', 'owner', 'financeiro'], placeholder: 'ex: Contratos de Prestação de Serviço, Aditivos, Procurações' },
  { id: 'compliance', label: 'Licenças \u0026 Alvarás', roles: ['admin', 'owner', 'engenheiro'], placeholder: 'ex: AVCB, Licença Ambiental, Seguro, Alvará de Construção' },
  { id: 'financeiro', label: 'Financeiro', roles: ['admin', 'owner', 'financeiro'], placeholder: 'ex: Notas Fiscais, Boletos, Comprovantes de Medição' },
  { id: 'comercial', label: 'Comercial', roles: ['admin', 'owner', 'engenheiro', 'financeiro'], placeholder: 'ex: Propostas Comerciais, Apresentações de Vendas' },
];

export const OpuraDocsModule: React.FC<OpuraDocsModuleProps> = ({
  activeOrganizationId,
  projects,
  currentProfile,
}) => {
  const { companies: rawCompanies, organizations } = useStore();
  const companies = Array.isArray(rawCompanies) ? rawCompanies : [];
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>('all');
  const [activeTab, setActiveTab] = React.useState<OpuraDocumentCategoria>('engenharia');
  const [documents, setDocuments] = React.useState<OpuraDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = usePersistedState<string>('opuraDocs:search', '');
  const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('opuraDocs:viewMode', 'list');
  const tableColumns = useTableColumns(COLUMNS, 'opuraDocsColumns');
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const [selectedDocForVersions, setSelectedDocForVersions] = React.useState<OpuraDocument | null>(null);
  const [selectedDocForQrCode, setSelectedDocForQrCode] = React.useState<OpuraDocument | null>(null);
  const [selectedDocForMarkup, setSelectedDocForMarkup] = React.useState<OpuraDocument | null>(null);
  const [showMetrics, setShowMetrics] = React.useState(false);
  const [editingDoc, setEditingDoc] = React.useState<OpuraDocument | null>(null);
  const [editDocName, setEditDocName] = React.useState('');
  const [editDocTokens, setEditDocTokens] = React.useState<Record<string, string>>({});
  const [editDocDesc, setEditDocDesc] = React.useState('');
  const [editDocEmissao, setEditDocEmissao] = React.useState('');
  const [editDocValidade, setEditDocValidade] = React.useState('');
  const [editDocAlertaDias, setEditDocAlertaDias] = React.useState(30);
  const [editDocTagsInput, setEditDocTagsInput] = React.useState('');
  const [editDocStatus, setEditDocStatus] = React.useState<OpuraDocumentStatus>('ativo');
  const [folderNamingMask, setFolderNamingMask] = React.useState('');
  const [editingFolder, setEditingFolder] = React.useState<OpuraFolder | null>(null);
  const [editFolderName, setEditFolderName] = React.useState('');
  const [editFolderMask, setEditFolderMask] = React.useState('');
  const [editFolderMaskPreset, setEditFolderMaskPreset] = React.useState('none');
  const [selectedMaskPreset, setSelectedMaskPreset] = React.useState('none');
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);
  const [filterStatus, setFilterStatus] = React.useState<string>('all');
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [disciplines, setDisciplines] = React.useState<OpuraDmsDiscipline[]>([]);
  const [namingPatterns, setNamingPatterns] = React.useState<OpuraDmsNamingPattern[]>([]);
  const [showSettingsModal, setShowSettingsModal] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState<'disciplines' | 'patterns' | 'document_types'>('disciplines');
  const [newDiscCode, setNewDiscCode] = React.useState('');
  const [newDiscName, setNewDiscName] = React.useState('');
  const [newPatName, setNewPatName] = React.useState('');
  const [newPatMask, setNewPatMask] = React.useState('');
  
  // -- Edit Disciplines --
  const [editDiscId, setEditDiscId] = React.useState<string | null>(null);
  const [editDiscCode, setEditDiscCode] = React.useState('');
  const [editDiscName, setEditDiscName] = React.useState('');

  // -- Edit Patterns --
  const [editPatternId, setEditPatternId] = React.useState<string | null>(null);
  const [editPatternName, setEditPatternName] = React.useState('');
  const [editPatternMask, setEditPatternMask] = React.useState('');

  // -- Document Types --
  const [documentTypes, setDocumentTypes] = React.useState<OpuraDmsDocumentType[]>([]);
  const [newDocTypeName, setNewDocTypeName] = React.useState('');
  const [editDocTypeId, setEditDocTypeId] = React.useState<string | null>(null);
  const [editDocTypeName, setEditDocTypeName] = React.useState('');
  const [selectedFolderDisciplines, setSelectedFolderDisciplines] = React.useState<string[]>([]);
  const [leftSearchQuery, setLeftSearchQuery] = React.useState('');
  const [selectedDisciplineCode, setSelectedDisciplineCode] = React.useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = React.useState<string[]>([]);

  // Estados locais da Onda 1 (Pastas Virtuais e Movimentação)
  const [folders, setFolders] = React.useState<OpuraFolder[]>([]);
  const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null);
  const [createFolderModalOpen, setCreateFolderModalOpen] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [createFolderOrgId, setCreateFolderOrgId] = React.useState('');
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const [movingDocId, setMovingDocId] = React.useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = React.useState(false);
  const [targetFolderId, setTargetFolderId] = React.useState<string | null>(null);

  // Estados locais da Onda 2 (Fluxo de Aprovação & Workflows)
  const [orgMembers, setOrgMembers] = React.useState<{ name: string; email: string }[]>([]);
  const [pendingApprovals, setPendingApprovals] = React.useState<any[]>([]);
  const [showPendingOnly, setShowPendingOnly] = React.useState(false);
  const [selectedApproverEmail, setSelectedApproverEmail] = React.useState('');
  const [submittingApproval, setSubmittingApproval] = React.useState(false);
  const [approvingId, setApprovingId] = React.useState<string | null>(null);
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);
  const [feedbackText, setFeedbackText] = React.useState('');
  const [processingAction, setProcessingAction] = React.useState(false);
  const [documentApprovals, setDocumentApprovals] = React.useState<OpuraDocumentApproval[]>([]);
  const [documentAuditLogs, setDocumentAuditLogs] = React.useState<OpuraDocumentAuditLog[]>([]);

  // Estados locais — compartilhamento com Portal do Parceiro (PLANO_MODULO_PARCEIRO_DOCUMENTOS.md, Onda 1)
  const [partnerWorkspaces, setPartnerWorkspaces] = React.useState<PartnerWorkspace[]>([]);
  const [shareModalOpen, setShareModalOpen] = React.useState(false);
  const [shareDocId, setShareDocId] = React.useState<string | null>(null);
  const [selectedShareWorkspaceId, setSelectedShareWorkspaceId] = React.useState('');
  const [sharingSubmitting, setSharingSubmitting] = React.useState(false);
  const [docAlreadySharedWith, setDocAlreadySharedWith] = React.useState<{ partner_workspace_id: string; supplier_name: string }[]>([]);

  // Buscar histórico de auditoria do documento (Onda 4)
  const loadAuditLogsForDoc = async (docId: string) => {
    try {
      const data = await documentService.listAuditLogsForDocument(docId);
      setDocumentAuditLogs(data);
    } catch (err) {
      console.error('[OpuraDocsModule] Erro ao buscar logs de auditoria do documento:', err);
    }
  };

  // Form State para Upload
  const [newDocName, setNewDocName] = React.useState('');
  const [newDocDesc, setNewDocDesc] = React.useState('');
  const [newDocType, setNewDocType] = React.useState('');
  const [newDocCategory, setNewDocCategory] = React.useState<OpuraDocumentCategoria>('engenharia');
  const [newDocEmissao, setNewDocEmissao] = React.useState('');
  const [newDocValidade, setNewDocValidade] = React.useState('');
  const [newDocAlertaDias, setNewDocAlertaDias] = React.useState(30);
  const [newDocTagsInput, setNewDocTagsInput] = React.useState('');
  const [newDocFile, setNewDocFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<number>(0);
  
  // Estados para Smart Rename Modal
  const [showRenameModal, setShowRenameModal] = React.useState(false);
  const [renameTokens, setRenameTokens] = React.useState<Record<string, string>>({});
  const [renameTargetMask, setRenameTargetMask] = React.useState('');
  
  // Controle de vinculação opcional a outras tabelas
  const [newDocCompanyId, setNewDocCompanyId] = React.useState('');
  const [newDocProjectId, setNewDocProjectId] = React.useState('');
  const [newDocContractId, setNewDocContractId] = React.useState('');
  const [newDocSupplierId, setNewDocSupplierId] = React.useState('');
  const [newDocClientId, setNewDocClientId] = React.useState('');
  const [newDocInvestorId, setNewDocInvestorId] = React.useState('');

  // Nova versão Upload
  const [newVersionFile, setNewVersionFile] = React.useState<File | null>(null);
  const [uploadingVersion, setUploadingVersion] = React.useState(false);

  // Determinar Permissões do Usuário
  const isDev = currentProfile?.email?.toLowerCase() === 'altair.rosa@alpaconstrutora.com.br' || currentProfile?.group === 'DESENVOLVEDOR';
  const rawRole = currentProfile?.role?.toLowerCase() || 'member';
  const isOrgAdmin = isDev || rawRole === 'owner' || rawRole === 'admin';
  const isEngenheiro = rawRole === 'engenheiro';
  const isFinanceiro = rawRole === 'financeiro';

  // Verificar permissão sobre a aba ativa
  const canAccessTab = (catId: OpuraDocumentCategoria) => {
    if (isOrgAdmin) return true;
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return false;
    if (isEngenheiro && cat.roles.includes('engenheiro')) return true;
    if (isFinanceiro && cat.roles.includes('financeiro')) return true;
    return false;
  };

  // Se o usuário não puder ler a aba ativa default (engenharia), redireciona para a primeira permitida
  React.useEffect(() => {
    if (!canAccessTab(activeTab)) {
      const allowed = CATEGORIES.find(c => canAccessTab(c.id));
      if (allowed) setActiveTab(allowed.id);
    }
  }, [rawRole]);

  // Carregar lista de diretórios (pastas virtuais)
  const fetchFolders = async () => {
    try {
      const projFilter = selectedProjectId === 'all' ? undefined : selectedProjectId;
      const data = await documentService.listFolders(
        activeOrganizationId ?? null,
        activeTab,
        projFilter
      );
      setFolders(data);
    } catch (err) {
      console.error('[DocumentService] Erro ao buscar pastas virtuais:', err);
    }
  };

  // Carregar lista de documentos
  const fetchDocs = async () => {
    setLoading(true);
    try {
      const projFilter = selectedProjectId === 'all' ? undefined : selectedProjectId;
      const data = await documentService.listDocuments(activeOrganizationId ?? undefined, {
        projectId: projFilter,
        categoria: activeTab,
        folderId: selectedDisciplineCode && !currentFolderId ? undefined : currentFolderId,
      });
      setDocuments(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar os documentos da organização.');
    } finally {
      setLoading(false);
    }
  };

  // Buscar aprovações pendentes atribuídas ao usuário logado
  const fetchPendingApprovals = async () => {
    if (!currentProfile?.email) return;
    try {
      const data = await documentService.listPendingApprovals(currentProfile.email);
      setPendingApprovals(data);
    } catch (err) {
      console.error('[OpuraDocsModule] Erro ao buscar aprovações pendentes:', err);
    }
  };

  // Buscar membros da organização ativa
  const fetchOrgMembers = async () => {
    if (!activeOrganizationId) return;
    try {
      const data = await documentService.listOrganizationMembers(activeOrganizationId);
      setOrgMembers(data);
    } catch (err) {
      console.error('[OpuraDocsModule] Erro ao buscar membros da organização:', err);
    }
  };

  // Buscar histórico de pareceres de aprovação do documento
  const loadApprovalsForDoc = async (docId: string) => {
    try {
      const data = await documentService.listApprovalsForDocument(docId);
      setDocumentApprovals(data);
    } catch (err) {
      console.error('[OpuraDocsModule] Erro ao buscar histórico de aprovações do documento:', err);
    }
  };

  // Solicitar aprovação de documento
  const handleRequestApprovalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocForVersions || !selectedApproverEmail || !currentProfile?.email) return;
    setSubmittingApproval(true);
    try {
      await documentService.submitForApproval(
        selectedDocForVersions.id,
        currentProfile.email,
        selectedApproverEmail
      );
      alert('Aprovação solicitada com sucesso!');
      setSelectedApproverEmail('');
      // Atualizar o histórico exibido
      const updatedDoc = await documentService.getDocumentById(selectedDocForVersions.id);
      setSelectedDocForVersions(updatedDoc);
      if (updatedDoc) loadApprovalsForDoc(updatedDoc.id);
      fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Erro ao solicitar aprovação.');
    } finally {
      setSubmittingApproval(false);
    }
  };

  // Aprovar parecer
  const handleApproveAction = async (approvalId: string) => {
    setProcessingAction(true);
    try {
      await documentService.approveDocument(approvalId, feedbackText || undefined);
      setFeedbackText('');
      setApprovingId(null);
      alert('Documento aprovado com sucesso!');
      fetchPendingApprovals();
      fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Erro ao aprovar documento.');
    } finally {
      setProcessingAction(false);
    }
  };

  // Rejeitar parecer
  const handleRejectAction = async (approvalId: string) => {
    if (!feedbackText.trim()) {
      alert('Por favor, informe a justificativa para a rejeição do documento.');
      return;
    }
    setProcessingAction(true);
    try {
      await documentService.rejectDocument(approvalId, feedbackText);
      setFeedbackText('');
      setRejectingId(null);
      alert('Documento rejeitado com sucesso!');
      fetchPendingApprovals();
      fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Erro ao rejeitar documento.');
    } finally {
      setProcessingAction(false);
    }
  };

  // Helper para renderizar badge de aprovação
  const getApprovalBadge = (status?: OpuraDocumentApprovalStatus) => {
    switch (status) {
      case 'rascunho':
        return (
          <span className="px-2.5 py-0.5 text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-500 rounded border border-slate-200">
            Rascunho
          </span>
        );
      case 'pendente':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-black bg-blue-50 text-blue-600 rounded border border-blue-100 uppercase tracking-wider">
            <Clock className="w-3 h-3" />
            Pendente
          </span>
        );
      case 'aprovado':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-black bg-emerald-50 text-emerald-600 rounded border border-emerald-100 uppercase tracking-wider">
            <CheckCircle2 className="w-3 h-3" />
            Aprovado
          </span>
        );
      case 'rejeitado':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-black bg-rose-50 text-rose-600 rounded border border-rose-100 uppercase tracking-wider">
            <ThumbsDown className="w-3 h-3" />
            Rejeitado
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-500 rounded border border-slate-200">
            Rascunho
          </span>
        );
    }
  };

  // Resetar a pasta ativa para a raiz ao mudar de projeto ou categoria
  React.useEffect(() => {
    setCurrentFolderId(null);
  }, [selectedProjectId, activeTab]);

  React.useEffect(() => {
    fetchDocs();
    fetchFolders();
    fetchPendingApprovals();
    fetchOrgMembers();
    fetchDmsSettings();
  }, [activeOrganizationId, selectedProjectId, activeTab, currentFolderId, selectedDisciplineCode, currentProfile]);

  // Sincronizar parâmetros de rota de notificação (Onda 3)
  React.useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('?')) {
      const queryString = hash.split('?')[1];
      const params = new URLSearchParams(queryString);
      
      const tabParam = params.get('tab') as OpuraDocumentCategoria | null;
      const docIdParam = params.get('docId');
      const pendingParam = params.get('pending');

      if (tabParam && CATEGORIES.some(c => c.id === tabParam)) {
        setActiveTab(tabParam);
      }

      if (pendingParam === 'true') {
        setShowPendingOnly(true);
      }

      if (docIdParam) {
        const fetchAndSelectDoc = async () => {
          try {
            const doc = await documentService.getDocumentById(docIdParam);
            if (doc) {
              setSelectedDocForVersions(doc);
              loadApprovalsForDoc(doc.id);
              loadAuditLogsForDoc(doc.id);
              // Registrar visualização (Onda 4)
              if (activeOrganizationId && currentProfile?.email) {
                documentService.logDocumentAction(
                  activeOrganizationId,
                  doc.id,
                  currentProfile.email,
                  'visualizado'
                ).catch(err => console.error('[OpuraDocsModule] Erro ao registrar log de visualização:', err));
              }
            }
          } catch (err) {
            console.error('[OpuraDocsModule] Erro ao carregar documento por parâmetro de URL:', err);
          }
        };
        fetchAndSelectDoc();
      }
    }
  }, [window.location.hash]);

  // Função para criar uma pasta virtual
  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetOrgId = activeOrganizationId || createFolderOrgId;
    if (!targetOrgId) {
      alert('Sessão expirada ou organização não selecionada.');
      return;
    }
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const projFilter = selectedProjectId === 'all' ? undefined : selectedProjectId;
      await documentService.createFolder({
        organization_id: targetOrgId,
        project_id: projFilter,
        name: newFolderName.trim(),
        parent_id: currentFolderId || undefined,
        categoria: activeTab,
        naming_mask: folderNamingMask || undefined,
        disciplines: selectedFolderDisciplines.length > 0 ? selectedFolderDisciplines : undefined,
      });
      setNewFolderName('');
      setFolderNamingMask('');
      setSelectedMaskPreset('none');
      setSelectedFolderDisciplines([]);
      setCreateFolderModalOpen(false);
      fetchFolders();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar pasta virtual.');
    } finally {
      setCreatingFolder(false);
    }
  };

  // Função para excluir uma pasta virtual (cascata no banco)
  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta pasta? Todas as subpastas serão deletadas e os documentos retornarão para o diretório raiz.')) return;
    try {
      await documentService.deleteFolder(id);
      fetchFolders();
      if (currentFolderId === id) {
        setCurrentFolderId(null);
      } else {
        fetchDocs(); // caso tenhamos deletado uma pasta filha
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir pasta virtual.');
    }
  };

  // Iniciar Edição de Pasta
  const handleStartEditFolder = (folder: OpuraFolder) => {
    setEditingFolder(folder);
    setEditFolderName(folder.name);
    setEditFolderMask(folder.naming_mask || '');
    setSelectedFolderDisciplines(folder.disciplines || []);
    if (!folder.naming_mask) {
      setEditFolderMaskPreset('none');
    } else {
      // Verifica se a máscara da pasta corresponde a algum padrão salvo no banco
      const existingPattern = namingPatterns.find(p => p.mask === folder.naming_mask);
      if (existingPattern) {
        setEditFolderMaskPreset(existingPattern.mask);
      } else {
        setEditFolderMaskPreset('custom');
      }
    }
  };

  // Submeter Edição de Pasta
  const handleEditFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder) return;

    try {
      let finalMask = editFolderMask;
      if (editFolderMaskPreset === 'none') {
        finalMask = '';
      } else if (editFolderMaskPreset !== 'custom') {
        finalMask = editFolderMaskPreset;
      }

      await documentService.updateFolder(editingFolder.id, {
        name: editFolderName,
        naming_mask: finalMask || undefined,
        disciplines: selectedFolderDisciplines.length > 0 ? selectedFolderDisciplines : [],
      });

      setEditingFolder(null);
      fetchFolders();
    } catch (err: any) {
      alert('Erro ao atualizar pasta: ' + err.message);
    }
  };

  // Buscar Ajustes Gerais do GED (Disciplinas e Padrões) com injeção automática de presets
  
    const fetchDmsSettings = async () => {
      try {
        const [discs, pats, docTypes] = await Promise.all([
          documentService.listDisciplines(activeOrganizationId),
          documentService.listNamingPatterns(activeOrganizationId),
          documentService.listDocumentTypes(activeOrganizationId)
        ]);
        setDisciplines(discs);
        setNamingPatterns(pats);
        setDocumentTypes(docTypes);
      } catch (err) {
        console.error('[OpuraDocsModule] Erro ao carregar configurações do GED:', err);
      }
    };


  // Criar nova disciplina
  
    // -- Document Types Handlers --
    const handleCreateDocTypeSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeOrganizationId || !newDocTypeName) return;
      try {
        await documentService.createDocumentType(activeOrganizationId, newDocTypeName);
        setNewDocTypeName('');
        fetchDmsSettings();
      } catch (err) {
        console.error(err);
      }
    };

    const handleDeleteDocType = async (id: string) => {
      if (!confirm('Deseja realmente excluir este Tipo de Documento?')) return;
      try {
        await documentService.deleteDocumentType(id);
        fetchDmsSettings();
      } catch (err) {
        console.error(err);
      }
    };

    const handleSaveEditDocType = async (id: string) => {
      try {
        await documentService.updateDocumentType(id, editDocTypeName);
        setEditDocTypeId(null);
        fetchDmsSettings();
      } catch (err) {
        console.error(err);
      }
    };

    // -- Disciplines Handlers (Edit) --
    const handleSaveEditDiscipline = async (id: string) => {
      try {
        await documentService.updateDiscipline(id, editDiscCode, editDiscName);
        setEditDiscId(null);
        fetchDmsSettings();
      } catch (err) {
        console.error(err);
      }
    };

    // -- Patterns Handlers (Edit) --
    const handleSaveEditPattern = async (id: string) => {
      try {
        await documentService.updateNamingPattern(id, editPatternName, editPatternMask);
        setEditPatternId(null);
        fetchDmsSettings();
      } catch (err) {
        console.error(err);
      }
    };

    const handleCreateDisciplineSubmit = async (e: React.FormEvent) => {

    e.preventDefault();
    if (!activeOrganizationId || !newDiscCode || !newDiscName) return;
    try {
      await documentService.createDiscipline(activeOrganizationId, newDiscCode, newDiscName);
      setNewDiscCode('');
      setNewDiscName('');
      fetchDmsSettings();
    } catch (err: any) {
      alert('Erro ao criar disciplina: ' + err.message);
    }
  };

  // Excluir disciplina
  const handleDeleteDiscipline = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta disciplina? As pastas existentes continuarão funcionando, mas novos uploads e pastas não poderão utilizá-la.')) return;
    try {
      await documentService.deleteDiscipline(id);
      fetchDmsSettings();
    } catch (err: any) {
      alert('Erro ao excluir disciplina: ' + err.message);
    }
  };

  // Criar novo padrão de nomenclatura
  const handleCreateNamingPatternSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganizationId || !newPatName || !newPatMask) return;
    try {
      await documentService.createNamingPattern(activeOrganizationId, newPatName, newPatMask);
      setNewPatName('');
      setNewPatMask('');
      fetchDmsSettings();
    } catch (err: any) {
      alert('Erro ao criar padrão de nomenclatura: ' + err.message);
    }
  };

  // Excluir padrão de nomenclatura
  const handleDeleteNamingPattern = async (id: string) => {
    if (!confirm('Deseja realmente excluir este padrão de nomenclatura?')) return;
    try {
      await documentService.deleteNamingPattern(id);
      fetchDmsSettings();
    } catch (err: any) {
      alert('Erro ao excluir padrão: ' + err.message);
    }
  };

  // ─── NAVEGAÇÃO EM ÁRVORE (ESTILO CONSTRUCODE) ────────────────
  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev =>
      prev.includes(nodeId)
        ? prev.filter(id => id !== nodeId)
        : [...prev, nodeId]
    );
  };

  // Cores dinâmicas e harmoniosas para as disciplinas (estilo tags do ConstruCode)
  const getDisciplineColor = (code: string): string => {
    const map: Record<string, string> = {
      ARQ: '#10B981', // Verde esmeralda
      ESTR: '#3B82F6', // Azul
      CIV: '#64748B', // Cinza ardósia
      ELEC: '#F59E0B', // Âmbar
      HYDR: '#06B6D4', // Ciano
      SANI: '#8B5CF6', // Roxo
      PREV: '#EF4444', // Vermelho
      AUT: '#6366F1', // Indigo
    };
    const key = code.toUpperCase().trim();
    if (map[key]) return map[key];

    // Fallback determinístico baseado em hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 65%, 45%)`;
  };


  // Renderizador recursivo para nós de pastas na árvore
  const renderFolderTreeItem = (folder: OpuraFolder, discCode: string | null, depth: number) => {
    const isExpanded = expandedNodes.includes(folder.id);
    const subfolders = folders.filter(f => f.parent_id === folder.id);
    
    // As disciplinas associadas à pasta
    const folderDisciplines = disciplines.filter(d => folder.disciplines?.includes(d.code));
    
    const hasChildren = subfolders.length > 0 || folderDisciplines.length > 0;

    // isSelected foca apenas na pasta se nenhuma disciplina estiver selecionada
    const isFolderSelected = currentFolderId === folder.id && selectedDisciplineCode === null;

    // Validação contra o filtro de pesquisa do painel esquerdo
    if (leftSearchQuery.trim()) {
      const q = leftSearchQuery.toLowerCase();
      const matchThis = folder.name.toLowerCase().includes(q);
      const matchChildren = 
        subfolders.some(sf => sf.name.toLowerCase().includes(q)) || 
        folderDisciplines.some(fd => fd.name.toLowerCase().includes(q));
      if (!matchThis && !matchChildren) return null;
    }

    return (
      <div key={folder.id} className="space-y-1">
        <div
          className={`flex items-center justify-between p-1 rounded-lg transition-all group ${
            isFolderSelected
              ? 'bg-blue-50 text-blue-700 font-extrabold border border-blue-100/50'
              : 'hover:bg-slate-50 border border-transparent'
          }`}
          style={{ paddingLeft: `${depth * 4 + 4}px` }}
        >
          <div
            onClick={() => {
              setCurrentFolderId(folder.id);
              setSelectedDisciplineCode(null);
              if (!expandedNodes.includes(folder.id)) {
                setExpandedNodes(prev => [...prev, folder.id]);
              }
            }}
            className="flex items-center gap-1.5 min-w-0 flex-grow cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="text-xs truncate">{folder.name}</span>
          </div>

          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 mr-1">
            <button
              onClick={(e) => { e.stopPropagation(); handleStartEditFolder(folder); }}
              className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"
              title="Configurar/Incluir Disciplinas"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
              className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
              title="Excluir Pasta"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          {hasChildren && (
            <button
              onClick={() => toggleNode(folder.id)}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          )}
        </div>

        {isExpanded && hasChildren && (
          <div className="space-y-1">
            {subfolders.map(sub =>
              renderFolderTreeItem(sub, discCode, depth + 1)
            )}
            
            {folderDisciplines.map(disc => {
              const isDiscSelected = currentFolderId === folder.id && selectedDisciplineCode === disc.code;
              return (
                <div
                  key={`${folder.id}-${disc.code}`}
                  className={`flex items-center justify-between p-1 rounded-lg transition-all group cursor-pointer ${
                    isDiscSelected
                      ? 'bg-blue-50 text-blue-700 font-extrabold border border-blue-100/50'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                  style={{ paddingLeft: `${(depth + 1) * 4 + 4 + 16}px` }}
                  onClick={() => {
                    setCurrentFolderId(folder.id);
                    setSelectedDisciplineCode(disc.code);
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-grow">
                    <span
                      className="w-5 h-4 flex items-center justify-center text-[8px] font-black uppercase rounded text-white shadow-sm shrink-0"
                      style={{ backgroundColor: getDisciplineColor(disc.code) }}
                    >
                      {disc.code.slice(0, 3)}
                    </span>
                    <span className="text-xs truncate">{disc.name}</span>
                  </div>

                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 mr-1">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Remover disciplina ${disc.name} da pasta?`)) return;
                        try {
                          const newDisciplines = (folder.disciplines || []).filter(d => d !== disc.code);
                          await documentService.updateFolder(folder.id, { disciplines: newDisciplines });
                          fetchFolders();
                        } catch (err: any) {
                          alert('Erro ao remover disciplina: ' + err.message);
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                      title="Excluir Disciplina desta Pasta"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Função para mover um arquivo de pasta
  const handleMoveDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingDocId || !activeOrganizationId || !currentProfile?.email) return;
    try {
      await documentService.moveDocumentToFolder(
        movingDocId,
        targetFolderId || null,
        activeOrganizationId,
        currentProfile.email
      );
      setMoveModalOpen(false);
      setMovingDocId(null);
      fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Erro ao mover documento.');
    }
  };

  // Fornecedor do documento sendo compartilhado, para priorizar o parceiro correspondente no seletor (Onda 2)
  const shareTargetSupplierId = React.useMemo(
    () => documents.find((d) => d.id === shareDocId)?.supplier_id || null,
    [documents, shareDocId]
  );
  const sortedShareWorkspaces = React.useMemo(() => {
    const recommended = partnerWorkspaces.filter((ws) => shareTargetSupplierId && ws.supplier_id === shareTargetSupplierId);
    const others = partnerWorkspaces
      .filter((ws) => !(shareTargetSupplierId && ws.supplier_id === shareTargetSupplierId))
      .sort((a, b) => (a.supplier_name || '').localeCompare(b.supplier_name || ''));
    return [...recommended, ...others];
  }, [partnerWorkspaces, shareTargetSupplierId]);

  // Abrir modal de compartilhamento com parceiro, carregando workspaces ativos sob demanda
  const openShareModal = async (docId: string) => {
    setShareDocId(docId);
    setSelectedShareWorkspaceId('');
    setDocAlreadySharedWith([]);
    setShareModalOpen(true);
    if (partnerWorkspaces.length === 0 && activeOrganizationId) {
      try {
        const wss = await partnerService.listWorkspaces(activeOrganizationId);
        setPartnerWorkspaces(wss.filter((w) => w.is_active));
      } catch (err) {
        console.error('[OpuraDocsModule] Erro ao carregar parceiros habilitados:', err);
      }
    }
    try {
      const sharings = await partnerService.listSharingsForDocument(docId);
      setDocAlreadySharedWith(sharings);
    } catch (err) {
      console.error('[OpuraDocsModule] Erro ao carregar compartilhamentos existentes do documento:', err);
    }
  };

  // Compartilhar o documento selecionado com o workspace de parceiro escolhido
  const handleShareWithPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareDocId || !selectedShareWorkspaceId) return;
    const chosenWorkspace = partnerWorkspaces.find((w) => w.id === selectedShareWorkspaceId);
    setSharingSubmitting(true);
    try {
      await partnerService.shareDocument(
        selectedShareWorkspaceId,
        shareDocId,
        currentProfile?.email || 'sistema'
      );
      setShareModalOpen(false);
      setShareDocId(null);
      alert(`Documento compartilhado com ${chosenWorkspace?.supplier_name || 'o parceiro'} com sucesso.`);
    } catch (err: any) {
      if (err?.code === '23505' || /duplicate key/i.test(err?.message || '')) {
        alert('Este documento já está compartilhado com este parceiro.');
      } else {
        alert(err.message || 'Erro ao compartilhar documento com o parceiro.');
      }
    } finally {
      setSharingSubmitting(false);
    }
  };



  // Filtrar projetos/obras (classification === 'OBRA')
  const obras = React.useMemo(() => {
    if (!projects || !Array.isArray(projects)) return [];
    return projects.filter(p => 
      p && (p.settings?.classification === 'OBRA' || !p.settings?.classification) &&
      p.name?.toLowerCase() !== 'gestão comercial'
    );
  }, [projects]);

  // Filtrar documentos localmente por busca simples e filtros avançados
  const filteredDocuments = React.useMemo(() => {
    if (!documents || !Array.isArray(documents)) return [];
    
    let result = documents;

    // 1. Filtrar por status de validade
    if (filterStatus !== 'all') {
      result = result.filter(doc => doc.status === filterStatus);
    }

    // 2. Filtrar por tags selecionadas
    if (selectedTags.length > 0) {
      result = result.filter(doc => 
        doc.tags && Array.isArray(doc.tags) && 
        selectedTags.every(tag => doc.tags.includes(tag))
      );
    }

    // 3. Filtrar por disciplina selecionada no painel esquerdo
    if (selectedDisciplineCode) {
      result = result.filter(doc => {
        const docFolder = folders.find(f => f.id === doc.folder_id);
        let cleanFileName = doc.active_version?.storage_path.split('/').pop() || doc.nome;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i.test(cleanFileName)) {
          cleanFileName = cleanFileName.substring(37);
        }
        
        let isMatch = false;
        if (docFolder?.naming_mask) {
          const extracted = extractTokenFromFileName(cleanFileName, docFolder.naming_mask, '[DISCIPLINA]');
          if (extracted) {
            isMatch = extracted.toUpperCase() === selectedDisciplineCode.toUpperCase();
          }
        }
        
        if (!isMatch) {
          const uppercaseName = cleanFileName.toUpperCase();
          const uppercaseCode = selectedDisciplineCode.toUpperCase();
          isMatch = uppercaseName.includes(uppercaseCode);
        }
        
        return isMatch;
      });
    }

    // 4. Filtrar por busca textual simples
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(doc => 
        doc && (
          (doc.nome?.toLowerCase() || '').includes(query) ||
          (doc.descricao?.toLowerCase() || '').includes(query) ||
          (doc.tipo_documento?.toLowerCase() || '').includes(query) ||
          (doc.tags && Array.isArray(doc.tags) && doc.tags.some(tag => tag?.toLowerCase().includes(query)))
        )
      );
    }

    return result;
  }, [documents, searchQuery, filterStatus, selectedTags, selectedDisciplineCode, folders]);

  const activeFolder = React.useMemo(() => folders.find(f => f.id === currentFolderId), [folders, currentFolderId]);
  
  const dynamicColumns = React.useMemo(() => {
    if (!activeFolder?.naming_mask) return [];
    return activeFolder.naming_mask.split(/[-_]+/).filter(Boolean);
  }, [activeFolder?.naming_mask]);  // Coletar tags únicas dos documentos carregados para filtragem rápida
  const allUniqueTags = React.useMemo(() => {
    if (!documents || !Array.isArray(documents)) return [];
    const tagsSet = new Set<string>();
    documents.forEach(doc => {
      if (doc.tags && Array.isArray(doc.tags)) {
        doc.tags.forEach(tag => {
          if (tag) tagsSet.add(tag);
        });
      }
    });
    return Array.from(tagsSet).sort();
  }, [documents]);

  // Função para deletar documento
  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Deseja realmente excluir este documento? Todas as versões físicas também serão deletadas.')) return;
    try {
      await documentService.deleteDocument(id, activeOrganizationId || '');
      setDocuments(prev => prev.filter(d => d.id !== id));
      if (selectedDocForVersions?.id === id) setSelectedDocForVersions(null);
    } catch (err: any) {
      alert(err.message || 'Erro ao deletar documento.');
    }
  };

  const executeUpload = async (docTitle: string, fileToUpload: File) => {
    if (!activeOrganizationId) return;
    
    setUploading(true);
    // Validar tipo de arquivo
    const allowedExtensions = ['pdf', 'docx', 'xlsx', 'dwg', 'jpg', 'png'];
    const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.includes(fileExt)) {
      alert('Formato de arquivo não permitido. Use: PDF, DOCX, XLSX, DWG, JPG ou PNG.');
      setUploading(false);
      return;
    }

    // Validar tamanho (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (fileToUpload.size > maxSize) {
      alert('O arquivo excede o limite máximo permitido de 50MB.');
      setUploading(false);
      return;
    }

    try {
      const tags = newDocTagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      await documentService.uploadNewDocument(
        {
          organization_id: activeOrganizationId || '',
          nome: docTitle || fileToUpload.name,
          descricao: newDocDesc || undefined,
          categoria: newDocCategory,
          tipo_documento: newDocType,
          status: 'ativo',
          data_emissao: newDocEmissao || undefined,
          data_validade: newDocValidade || undefined,
          alerta_dias_antecedencia: newDocAlertaDias,
          tags,
          project_id: selectedProjectId !== 'all' ? selectedProjectId : (newDocProjectId || undefined),
          company_id: newDocCompanyId || undefined,
          contract_id: newDocContractId || undefined,
          supplier_id: newDocSupplierId || undefined,
          client_id: newDocClientId || undefined,
          investor_id: newDocInvestorId || undefined,
          folder_id: currentFolderId || undefined,
        },
        fileToUpload,
        currentProfile?.email || 'sistema'
      );

      // Reset form
      setNewDocName('');
      setNewDocDesc('');
      setNewDocType('');
      setNewDocEmissao('');
      setNewDocValidade('');
      setNewDocAlertaDias(30);
      setNewDocTagsInput('');
      setNewDocFile(null);
      setNewDocCompanyId('');
      setNewDocProjectId('');
      setNewDocContractId('');
      setNewDocSupplierId('');
      setNewDocClientId('');
      setNewDocInvestorId('');
      
      setUploadModalOpen(false);
      fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Erro ao submeter documento.');
    } finally {
      setUploading(false);
    }
  };

  // Submeter Upload de Novo Documento
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[OpuraDocsModule] Iniciando submissão do documento:', {
      nome: newDocName,
      org: activeOrganizationId,
      arquivo: newDocFile?.name
    });
    if (!activeOrganizationId) {
      console.warn('[OpuraDocsModule] Erro: activeOrganizationId está nulo ou vazio ao submeter.');
      alert('Sessão expirada ou organização não selecionada.');
      return;
    }
    if (!newDocFile) {
      alert('Selecione um arquivo para upload.');
      return;
    }
    
    // Validação da máscara de nomenclatura de arquivos (GED)
    if (currentFolderId && newDocFile) {
      const targetFolder = folders.find(f => f.id === currentFolderId);
      if (targetFolder?.naming_mask) {
        const fileExt = newDocFile.name.split('.').pop() || 'pdf';
        const baseName = newDocName || newDocFile.name.split('.').slice(0, -1).join('.');
        const typedNameWithExt = `${baseName}.${fileExt}`;
        
        if (!validateFileNameAgainstMask(newDocFile.name, targetFolder.naming_mask) || 
            !validateFileNameAgainstMask(typedNameWithExt, targetFolder.naming_mask)) {
          // Calcula pré-preenchimentos inteligentes
          const uploadProjId = selectedProjectId !== 'all' ? selectedProjectId : newDocProjectId;
          const uploadProj = projects?.find(p => p.id === uploadProjId);
          const docsInFolder = filteredDocuments.filter(d => d.folder_id === currentFolderId);
          
          setRenameTargetMask(targetFolder.naming_mask);
          setRenameTokens({
            '[OBRA]': uploadProj?.code || '',
            '[NUMERO]': getNextSequentialNumber(docsInFolder, targetFolder.naming_mask),
            '[REVISAO]': getInitialRevision(targetFolder.naming_mask)
          });
          setShowRenameModal(true);
          return;
        }

        // Validação adicional de Disciplinas permitidas na pasta
        if (targetFolder.disciplines && targetFolder.disciplines.length > 0) {
          const extractedDisc = extractTokenFromFileName(newDocFile.name, targetFolder.naming_mask, '[DISCIPLINA]');
          if (extractedDisc) {
            const isAllowed = targetFolder.disciplines.some(d => d.toUpperCase() === extractedDisc.toUpperCase());
            if (!isAllowed) {
              alert(`A disciplina extraída do nome do arquivo ("${extractedDisc}") não é permitida nesta pasta virtual.\n\nDisciplinas permitidas: ${targetFolder.disciplines.join(', ')}`);
              return;
            }
          }
        }
      }
    }

    await executeUpload(newDocName, newDocFile);
  };

  // Submeter modal de renomeação inteligente
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocFile || !renameTargetMask) return;
    
    const fileExt = newDocFile.name.split('.').pop() || '';
    const newName = generateFileNameFromMask(renameTargetMask, renameTokens, fileExt);
    const newDocNameFromMask = newName.split('.').slice(0, -1).join('.');
    
    if (!validateFileNameAgainstMask(newName, renameTargetMask)) {
      alert(`O nome gerado ("${newDocNameFromMask}") não atende ao padrão exigido nesta pasta:\n"${renameTargetMask}"\n\nVerifique se preencheu a quantidade correta de dígitos para as tags configuradas (ex: 3 caracteres).`);
      return;
    }

    // Cria um novo File herdando os dados e o tipo, mas com o nome correto
    const renamedFile = new File([newDocFile], newName, { type: newDocFile.type });
    setNewDocFile(renamedFile);
    setNewDocName(newDocNameFromMask);
    setShowRenameModal(false);

    // Faz o upload automaticamente após renomear!
    await executeUpload(newDocNameFromMask, renamedFile);
  };

  // Submeter Upload de Nova Versão
  const handleUploadVersionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocForVersions || !newVersionFile || !activeOrganizationId) return;

    setUploadingVersion(true);
    try {
      const currentVersions = selectedDocForVersions.versions || [];
      const nextVerNum = currentVersions.length > 0
        ? Math.max(...currentVersions.map(v => v.version_number)) + 1
        : 1;

      await documentService.uploadNewVersion(
        selectedDocForVersions.id,
        activeOrganizationId,
        nextVerNum,
        newVersionFile,
        currentProfile?.email || 'sistema'
      );

      setNewVersionFile(null);
      
      // Recarrega os dados do documento para atualizar o modal de versões
      const updatedDoc = await documentService.getDocumentById(selectedDocForVersions.id);
      setSelectedDocForVersions(updatedDoc);
      fetchDocs();
    } catch (err: any) {
      alert(err.message || 'Erro ao subir nova versão.');
    } finally {
      setUploadingVersion(false);
    }
  };

  // Iniciar Edição do Documento
  const handleStartEditDoc = (doc: OpuraDocument) => {
    setEditingDoc(doc);
    setEditDocName(doc.nome);
    
    // Check if the document belongs to a folder with a naming mask
    const docFolder = folders.find(f => f.id === doc.folder_id);
    if (docFolder && docFolder.naming_mask) {
      const initialTokens: Record<string, string> = {};
      // In case we don't have extractMaskTokens locally in this scope, wait it's imported at the top
      extractMaskTokens(docFolder.naming_mask).forEach(token => {
        initialTokens[token] = extractTokenFromFileName(doc.nome, docFolder.naming_mask as string, token as any) || '';
      });
      setEditDocTokens(initialTokens);
    } else {
      setEditDocTokens({});
    }

    setEditDocDesc(doc.descricao || '');
    setEditDocEmissao(doc.data_emissao ? doc.data_emissao.split('T')[0] : '');
    setEditDocValidade(doc.data_validade ? doc.data_validade.split('T')[0] : '');
    setEditDocAlertaDias(doc.alerta_dias_antecedencia || 30);
    setEditDocTagsInput(doc.tags ? doc.tags.join(', ') : '');
    setEditDocStatus(doc.status as any || 'ativo');
  };

  // Submeter Edição do Documento
  const handleEditDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    
    // Obter o nome final (seja da máscara ou do input livre)
    let finalDocName = editDocName;
    const docFolder = folders.find(f => f.id === editingDoc.folder_id);
    if (docFolder && docFolder.naming_mask) {
      // Usar a mesma lógica de geração de arquivo e remover a extensão '.pdf' dummy
      const generatedName = generateFileNameFromMask(docFolder.naming_mask, editDocTokens, 'pdf');
      finalDocName = generatedName.split('.').slice(0, -1).join('.');
    }

    // Se houver uma máscara de nomenclatura configurada na pasta, validar contra o novo nome
    if (editingDoc.folder_id) {
      const targetFolder = folders.find(f => f.id === editingDoc.folder_id);
      if (targetFolder?.naming_mask) {
        const ext = editingDoc.active_version?.storage_path.split('.').pop() || 'pdf';
        const dummyFileName = `${finalDocName}.${ext}`;
        if (!validateFileNameAgainstMask(dummyFileName, targetFolder.naming_mask)) {
          alert(`O nome gerado ("${finalDocName}") não atende ao padrão exigido nesta pasta:\n"${targetFolder.naming_mask}"\n\nPor favor, verifique se a quantidade de letras ou dígitos informada está correta.`);
          return;
        }

        // Validação adicional de Disciplinas permitidas na pasta
        if (targetFolder.disciplines && targetFolder.disciplines.length > 0) {
          const extractedDisc = extractTokenFromFileName(dummyFileName, targetFolder.naming_mask, '[DISCIPLINA]');
          if (extractedDisc) {
            const isAllowed = targetFolder.disciplines.some(d => d.toUpperCase() === extractedDisc.toUpperCase());
            if (!isAllowed) {
              alert(`A disciplina extraída do nome do documento ("${extractedDisc}") não é permitida nesta pasta virtual.\n\nDisciplinas permitidas: ${targetFolder.disciplines.join(', ')}`);
              return;
            }
          }
        }
      }
    }

    try {
      const tags = editDocTagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      await documentService.updateDocument(editingDoc.id, {
        nome: finalDocName,
        descricao: editDocDesc || undefined,
        data_emissao: editDocEmissao || undefined,
        data_validade: editDocValidade || undefined,
        alerta_dias_antecedencia: editDocAlertaDias,
        tags,
        status: editDocStatus as any,
      });

      if (activeOrganizationId && currentProfile?.email) {
        await documentService.logDocumentAction(
          activeOrganizationId,
          editingDoc.id,
          currentProfile.email,
          'status_alterado',
          `Metadados atualizados: nome="${finalDocName}"`
        ).catch(err => console.error('[OpuraDocsModule] Erro ao registrar log de alteração:', err));
      }

      setEditingDoc(null);
      fetchDocs();
    } catch (err: any) {
      alert('Erro ao atualizar metadados: ' + err.message);
    }
  };

  // Tratar download seguro
  const handleDownload = async (path: string, fileName: string, docId?: string) => {
    try {
      const url = await documentService.generateDownloadUrl(
        path,
        activeOrganizationId || undefined,
        docId,
        currentProfile?.email || undefined
      );
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const isBrowserViewable = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'txt'].includes(ext);

      if (isBrowserViewable) {
        window.open(url, '_blank');
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        link.setAttribute('target', '_blank');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      alert('Erro ao gerar link de download seguro: ' + err.message);
    }
  };

  // Formatar tamanho de arquivo
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Renderizador de Ícone com base no MIME-type/Extensão
  const renderFileIcon = (mime: string, name?: string) => {
    if (!name) return <FileText className="w-8 h-8 text-gray-400" />;
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText className="w-8 h-8 text-rose-500" />;
    if (ext === 'xlsx' || ext === 'xls') return <FileSpreadsheet className="w-8 h-8 text-emerald-600" />;
    if (ext === 'docx' || ext === 'doc') return <FileText className="w-8 h-8 text-blue-600" />;
    if (ext === 'dwg') return <Briefcase className="w-8 h-8 text-amber-600" />;
    if (['png', 'jpg', 'jpeg'].includes(ext || '')) return <ImageIcon className="w-8 h-8 text-violet-500" />;
    return <FileText className="w-8 h-8 text-gray-400" />;
  };

  // Obter classe CSS com base no status da validade do documento
  const getValidadeBadge = (validade?: string) => {
    if (!validade) return null;
    const today = new Date();
    const valDate = new Date(validade);
    const diffTime = valDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-black bg-red-50 text-red-600 rounded-full border border-red-100 uppercase tracking-wider">
          <AlertTriangle className="w-3.5 h-3.5" />
          Vencido
        </span>
      );
    }
    if (diffDays <= 30) {
      return (
        <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-black bg-amber-50 text-amber-600 rounded-full border border-amber-100 uppercase tracking-wider">
          <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
          Vence em {diffDays} dias
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-black bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 uppercase tracking-wider">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Válido
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-2xl">
              <FolderOpen className="w-6 h-6" />
            </span>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gestão de Documentos</h1>
          </div>
          <p className="text-slate-400 text-sm font-medium">
            Governança e centralização de documentos integrados ao ecossistema ÒPURA.
          </p>
        </div>

        {/* Dropdown de Obras / Empreendimento (Feature 2) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="appearance-none pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-[1.25rem] text-sm font-bold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 cursor-pointer"
            >
              <option value="all">🏢 Todos os Empreendimentos</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  🚧 {o.name}
                </option>
              ))}
            </select>
            <Building2 className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Botões de Ações (Nova Pasta e Novo Documento) */}
          {canAccessTab(activeTab) && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreateFolderModalOpen(true)}
                className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-[1.25rem] font-black text-button uppercase tracking-widest transition-all shadow-sm active:scale-95"
              >
                <FolderPlus className="w-4 h-4 text-blue-600" />
                Nova Pasta
              </button>
              <button
                onClick={() => {
                  setNewDocCategory(activeTab);
                  setUploadModalOpen(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-[1.25rem] hover:bg-blue-700 font-black text-button uppercase tracking-widest transition-all shadow-lg shadow-blue-500/10 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Novo Documento
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── CATEGORIAS / DIRETÓRIOS (Feature 2) ─── */}
      <div className="flex border-b border-slate-100 overflow-x-auto gap-2 pb-px">
        {CATEGORIES.map((cat) => {
          const isAllowed = canAccessTab(cat.id);
          if (!isAllowed) return null; // Esconde abas proibidas pelo controle de acesso (Feature 3)

          const isActive = activeTab === cat.id && !showMetrics;
          return (
            <button
              key={cat.id}
              onClick={() => { setActiveTab(cat.id); setShowMetrics(false); }}
              className={`px-5 py-4 font-black text-form-input uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {cat.label}
            </button>
          );
        })}

        <button
          onClick={() => { setShowMetrics(true); setShowPendingOnly(false); }}
          className={`px-5 py-4 font-black text-form-input uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
            showMetrics
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          📊 Saúde Documental
        </button>

        {isOrgAdmin && (
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-5 py-4 font-black text-form-input uppercase tracking-wider border-b-2 border-transparent text-slate-400 hover:text-blue-600 hover:border-blue-600 transition-all whitespace-nowrap flex items-center gap-1.5"
          >
            ⚙️ Ajustes do GED
          </button>
        )}

        {pendingApprovals.length > 0 && (
          <button
            onClick={() => setShowPendingOnly(!showPendingOnly)}
            className={`ml-auto flex items-center gap-1.5 px-4 py-2 my-2 rounded-xl text-button font-black uppercase tracking-wider transition-all border ${
              showPendingOnly
                ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 animate-pulse'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Pendências ({pendingApprovals.length})
          </button>
        )}
      </div>

      {/* ─── FILTROS DE BUSCA E LISTAGEM ─── */}
      {showMetrics ? (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* Dashboard Premium de Saúde Documental (BI) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-10">
                <FileText className="w-36 h-36" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total de Arquivos</p>
              <h3 className="text-3xl font-black mt-2">{documents.length}</h3>
              <p className="text-xs mt-1 font-semibold opacity-90">Centralizados no acervo</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-10">
                <CheckCircle2 className="w-36 h-36" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Versões Ativas / Aprovadas</p>
              <h3 className="text-3xl font-black mt-2">
                {documents.filter(d => d.status === 'ativo' || d.approval_status === 'aprovado').length}
              </h3>
              <p className="text-xs mt-1 font-semibold opacity-90">Liberados para uso</p>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-10">
                <Clock className="w-36 h-36" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Aguardando Aprovação</p>
              <h3 className="text-3xl font-black mt-2">
                {documents.filter(d => d.status === 'pendente_aprovacao' || d.approval_status === 'pendente').length}
              </h3>
              <p className="text-xs mt-1 font-semibold opacity-90">Prazos e revisões sob análise</p>
            </div>

            <div className="bg-gradient-to-br from-rose-500 to-red-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-10">
                <AlertTriangle className="w-36 h-36" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Vencidos / Críticos</p>
              <h3 className="text-3xl font-black mt-2">
                {documents.filter(d => d.status === 'vencido' || d.status === 'alerta').length}
              </h3>
              <p className="text-xs mt-1 font-semibold opacity-90">Necessitam de revisão urgente</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Distribuição por Categoria */}
            <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
              <div>
                <h4 className="font-black text-slate-800 text-sm uppercase tracking-wide">Distribuição por Categoria</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Volume de documentos no acervo</p>
              </div>

              <div className="space-y-4">
                {CATEGORIES.map(cat => {
                  const count = documents.filter(d => d.categoria === cat.id).length;
                  const pct = documents.length > 0 ? Math.round((count / documents.length) * 100) : 0;
                  return (
                    <div key={cat.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-600">
                        <span>{cat.label}</span>
                        <span>{count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Documentos Críticos / Vencendo */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-black text-slate-800 text-sm uppercase tracking-wide">Documentos Críticos & Alertas</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ações corretivas pendentes</p>
                </div>
                <span className="px-2.5 py-1 text-[10px] font-black uppercase bg-red-50 text-red-600 rounded-full tracking-widest">
                  CRÍTICO
                </span>
              </div>

              <div className="divide-y divide-slate-100 max-h-[300px] overflow-auto">
                {documents.filter(d => d.status === 'vencido' || d.status === 'alerta').length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-400 font-bold uppercase tracking-wider">
                    Sem pendências críticas ou documentos vencidos no momento! 🎉
                  </div>
                ) : (
                  documents.filter(d => d.status === 'vencido' || d.status === 'alerta').map(doc => (
                    <div key={doc.id} className="py-3.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-xl ${doc.status === 'vencido' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h5 className="font-bold text-slate-700 text-xs uppercase truncate">{doc.nome}</h5>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">
                            Validade: {doc.data_validade ? new Date(doc.data_validade).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded tracking-wider ${
                        doc.status === 'vencido' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* PAINEL LATERAL ESQUERDO: Árvore de Disciplinas/Pastas */}
          <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 min-h-[600px] flex flex-col">
            {/* Header com Atalho de Gestão de Disciplinas */}
            <div className="flex border-b border-slate-100 pb-2 px-2 items-center justify-between">
              <span className="font-black text-[10px] uppercase tracking-wider text-slate-400">Pastas e Disciplinas</span>
              <button
                type="button"
                onClick={() => {
                  setSettingsTab('disciplines');
                  setShowSettingsModal(true);
                }}
                className="text-slate-400 hover:text-blue-600 transition-colors"
                title="Gerenciar Disciplinas"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>

            {/* Input de Pesquisa Lateral */}
            <div className="relative">
              <input
                type="text"
                placeholder="Pesquisar pasta ou disciplina..."
                value={leftSearchQuery}
                onChange={(e) => setLeftSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            {/* Lista/Árvore */}
            <div className="flex-grow overflow-y-auto max-h-[500px] pr-1 space-y-1 text-slate-700">
              {/* Botão Todos os documentos */}
              <button
                type="button"
                onClick={() => {
                  setCurrentFolderId(null);
                  setSelectedDisciplineCode(null);
                }}
                className={`w-full flex items-center gap-2 p-2 rounded-xl text-left text-xs font-bold transition-all ${
                  !currentFolderId && !selectedDisciplineCode
                    ? 'bg-blue-50 text-blue-700 font-extrabold shadow-sm border border-blue-100'
                    : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                <span>Todos os documentos</span>
              </button>
              <div className="space-y-1.5 pt-2">
                {folders
                  .filter(f => !f.parent_id)
                  .map(folder =>
                    renderFolderTreeItem(folder, null, 0)
                  )}
              </div>
            </div>
          </div>

          {/* PAINEL CENTRAL DIREITO: Documentos */}
          <div className="lg:col-span-3 bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        {/* Barra de Busca e Toolbar (Variante desaninhada) */}
        <div className="p-4 border-b border-gray-100 bg-white space-y-3">
          <div className="flex flex-col md:flex-row gap-2.5 items-center">
            <div className="flex-1 relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar documento por nome, tipo, tag ou código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-4 bg-white border border-gray-200 rounded-[6px] text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            
            <button
              onClick={() => {
                // Refresh data se necessário
              }}
              className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`h-9 flex items-center gap-2 px-3 border rounded-[6px] text-sm font-semibold transition-all active:scale-95 whitespace-nowrap ${
                showAdvancedFilters
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filtros</span>
              {(filterStatus !== 'all' || selectedTags.length > 0) && (
                <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              )}
            </button>

            <div className="hidden md:block w-px h-6 bg-gray-200 shrink-0"></div>

            <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
              <ColumnConfigButton
                columns={COLUMNS.filter(c => c.key !== 'actions')}
                visibleColumns={tableColumns.visibleColumns}
                showColumnConfig={tableColumns.showColumnConfig}
                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                onToggleColumn={tableColumns.toggleColumn}
                onReset={tableColumns.resetColumns}
              />
            </div>
          </div>

          {/* Painel de Filtros Avançados */}
          {showAdvancedFilters && (
            <div className="p-5 bg-white border border-slate-200/80 rounded-2xl space-y-4 animate-in slide-in-from-top duration-200">
              
              {/* Filtro por Status da Validade */}
              <div className="space-y-2">
                <label className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Status de Validade</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'Todos os Documentos' },
                    { id: 'ativo', label: 'Ativos' },
                    { id: 'alerta', label: 'Em Alerta' },
                    { id: 'vencido', label: 'Vencidos' }
                  ].map((st) => (
                    <button
                      key={st.id}
                      onClick={() => setFilterStatus(st.id)}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                        filterStatus === st.id
                          ? st.id === 'ativo'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : st.id === 'vencido'
                            ? 'bg-red-600 text-white shadow-sm'
                            : st.id === 'alerta'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtro por Tags Rápidas */}
              {allUniqueTags.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-[10px] text-slate-400 font-black uppercase tracking-wider flex items-center justify-between">
                    <span>Filtrar por Tags</span>
                    {selectedTags.length > 0 && (
                      <button
                        onClick={() => setSelectedTags([])}
                        className="text-[9px] text-blue-600 hover:underline font-bold"
                      >
                        Limpar Seleção
                      </button>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {allUniqueTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            setSelectedTags(prev =>
                              isSelected
                                ? prev.filter(t => t !== tag)
                                : [...prev, tag]
                            );
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                            isSelected
                              ? 'bg-blue-500 text-white shadow-sm'
                              : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          #{tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}


        </div>

        {/* Listagem */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Carregando Acervo...</p>
          </div>
        ) : !activeOrganizationId ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="p-4 bg-slate-50 text-slate-400 rounded-full">
              <FolderOpen className="w-12 h-12" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700">Nenhuma Organização Selecionada</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-sm">
                Selecione uma organização no menu superior para visualizar os documentos.
              </p>
            </div>
          </div>
        ) : showPendingOnly ? (
          /* Painel de Pendências de Aprovação (Onda 2) */
          <div className="p-6 space-y-4 bg-slate-50/50">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider">
                  Aprovações sob sua responsabilidade
                </h3>
              </div>
              <button
                onClick={() => setShowPendingOnly(false)}
                className="text-button font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest"
              >
                Voltar ao Acervo
              </button>
            </div>

            {pendingApprovals.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 font-bold uppercase tracking-wider bg-white border border-slate-100 rounded-2xl">
                Você não possui pendências de aprovação de documentos atribuídas a você.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
                {pendingApprovals.map((app) => (
                  <div key={app.id} className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-500" />
                        <span className="font-bold text-slate-800">{app.document?.nome || 'Documento sem nome'}</span>
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 rounded">
                          {app.document?.tipo_documento}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-semibold">
                        Solicitado por <span className="text-slate-600 font-bold">{app.requested_by}</span> em {new Date(app.created_at).toLocaleString()}
                      </p>
                      {app.document?.descricao && (
                        <p className="text-xs text-slate-500 max-w-xl truncate">{app.document.descricao}</p>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                      {approvingId === app.id || rejectingId === app.id ? (
                        <div className="flex flex-col gap-2 w-full min-w-[280px]">
                          <textarea
                            placeholder={approvingId === app.id ? "Comentários da aprovação (opcional)..." : "Justificativa da rejeição (obrigatório)..."}
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-form-input font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setApprovingId(null);
                                setRejectingId(null);
                                setFeedbackText('');
                              }}
                              className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-bold uppercase rounded-lg hover:bg-slate-50"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => approvingId === app.id ? handleApproveAction(app.id) : handleRejectAction(app.id)}
                              disabled={processingAction || (rejectingId === app.id && !feedbackText.trim())}
                              className={`px-4 py-1.5 text-white text-xs font-black uppercase rounded-lg shadow-sm disabled:opacity-50 ${
                                approvingId === app.id ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                              }`}
                            >
                              {processingAction ? 'Processando...' : 'Confirmar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 w-full justify-end">
                          {app.document?.active_version?.storage_path && (
                            <button
                              onClick={() => handleDownload(app.document.active_version.storage_path, app.document.nome, app.document.id)}
                              className="px-3.5 py-2 border border-slate-200 text-slate-600 hover:text-blue-600 rounded-xl text-button font-bold bg-white active:scale-95 transition-all shadow-sm"
                              title="Visualizar arquivo"
                            >
                              Visualizar
                            </button>
                          )}
                          <button
                            onClick={() => setRejectingId(app.id)}
                            className="px-3.5 py-2 border border-rose-100 text-rose-600 hover:bg-rose-50 rounded-xl text-button font-black uppercase tracking-wider active:scale-95 transition-all"
                          >
                            Rejeitar
                          </button>
                          <button
                            onClick={() => setApprovingId(app.id)}
                            className="px-3.5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-button font-black uppercase tracking-wider active:scale-95 transition-all shadow-md shadow-emerald-500/10"
                          >
                            Aprovar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>


            {/* Lista de Documentos */}
            <div className="bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                    <tr>
                      {tableColumns.visibleColumns.includes('nome') && (
                        <SortableHeader colKey="nome" label="Documento" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100" />
                      )}
                      
                      {dynamicColumns.map((col, idx) => (
                        <th key={`dyn-head-${idx}`} className="px-6 py-2 border-r border-gray-100 text-left text-table-header font-semibold text-gray-500 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      
                      {tableColumns.visibleColumns.includes('tipo_documento') && (
                        <SortableHeader colKey="tipo_documento" label="Tipo / Categoria" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                      )}
                      {tableColumns.visibleColumns.includes('project_id') && (
                        <SortableHeader colKey="project_id" label="Obra Vinculada" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                      )}
                      {tableColumns.visibleColumns.includes('data_emissao') && (
                        <SortableHeader colKey="data_emissao" label="Emissão" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                      )}
                      {tableColumns.visibleColumns.includes('data_validade') && activeTab !== 'engenharia' && (
                        <SortableHeader colKey="data_validade" label="Validade" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                      )}
                      {tableColumns.visibleColumns.includes('status') && (
                        <SortableHeader colKey="status" label="Status" uppercase={false} sortColumn={tableColumns.sortColumn} sortDirection={tableColumns.sortDirection} onSort={tableColumns.handleColumnSort} className="px-6 py-2 border-r border-gray-100 whitespace-nowrap" />
                      )}
                      {tableColumns.visibleColumns.includes('actions') && (
                        <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500 whitespace-nowrap">Ações</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredDocuments.length === 0 ? (
                      <tr>
                        <td colSpan={tableColumns.visibleColumns.length + dynamicColumns.length} className="px-6 py-20 text-center">
                          {folders.filter(f => (f.parent_id || null) === (currentFolderId || null)).length === 0 ? (
                            <div className="flex flex-col items-center justify-center space-y-4">
                              <div className="p-4 bg-slate-50 text-slate-400 rounded-full">
                                <FolderOpen className="w-12 h-12" />
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-700">Nenhum documento ou pasta encontrado</h3>
                                <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
                                  Não existem arquivos ou subpastas neste diretório.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-400 font-medium">
                              Nenhum arquivo avulso nesta pasta. Navegue pelas subpastas acima.
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredDocuments.map((doc) => {
                        // Determinar o status textual para o badge conforme o novo padrão
                        const statusColor = doc.status === 'vencido' ? 'text-red-600' : doc.status === 'alerta' ? 'text-amber-600' : 'text-green-600';
                        const statusLabel = doc.status === 'vencido' ? 'Vencido' : doc.status === 'alerta' ? 'Em Alerta' : 'Ativo';

                        return (
                          <tr key={doc.id} className="hover:bg-blue-50/50 transition-colors group">
                            {tableColumns.visibleColumns.includes('nome') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-700 min-w-[200px]">
                                <div className="flex items-center gap-3">
                                  <div className="flex-shrink-0">
                                    {doc.active_version ? renderFileIcon(doc.active_version.mime_type, doc.active_version.storage_path) : <FileText className="w-5 h-5 text-gray-400" />}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="font-medium text-gray-900 block truncate">{doc.nome}</span>
                                    {doc.descricao && <span className="text-xs text-gray-400 block truncate mt-0.5">{doc.descricao}</span>}
                                  </div>
                                </div>
                              </td>
                            )}

                            {dynamicColumns.map((col, idx) => {
                              let val = '-';
                              let cleanFileName = doc.active_version?.storage_path.split('/').pop() || doc.nome;
                              // Remove prefixo UUID gerado pelo Supabase Storage (36 chars + '_')
                              if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i.test(cleanFileName)) {
                                cleanFileName = cleanFileName.substring(37);
                              }
                              if (col.toUpperCase().includes('OBRA')) val = extractTokenFromFileName(cleanFileName, activeFolder!.naming_mask!, '[OBRA]') || '-';
                              else if (col.toUpperCase().includes('DISCIPLINA')) val = extractTokenFromFileName(cleanFileName, activeFolder!.naming_mask!, '[DISCIPLINA]') || '-';
                              else if (col.toUpperCase().includes('NUMERO')) val = extractTokenFromFileName(cleanFileName, activeFolder!.naming_mask!, '[NUMERO]') || '-';
                              else if (col.toUpperCase().includes('REVISAO')) {
                                const rawRev = extractTokenFromFileName(cleanFileName, activeFolder!.naming_mask!, '[REVISAO]');
                                val = rawRev || '-';
                              }
                              return (
                                <td key={`dyn-body-${doc.id}-${idx}`} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-bold text-gray-700 whitespace-nowrap bg-slate-50/30">
                                  {val}
                                </td>
                              );
                            })}

                            {tableColumns.visibleColumns.includes('tipo_documento') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                {doc.tipo_documento}
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('project_id') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600">
                                {doc.project_id ? (projects.find(p => p.id === doc.project_id)?.name || 'Vínculo Externo') : '-'}
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('data_emissao') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                {doc.data_emissao ? new Date(doc.data_emissao).toLocaleDateString() : '-'}
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('data_validade') && activeTab !== 'engenharia' && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal text-gray-600 whitespace-nowrap">
                                {doc.data_validade ? new Date(doc.data_validade).toLocaleDateString() : '-'}
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('status') && (
                              <td className="px-6 py-2.5 border-r border-gray-100 last:border-r-0 text-sm font-normal">
                                <span className={statusColor}>{statusLabel}</span>
                              </td>
                            )}
                            {tableColumns.visibleColumns.includes('actions') && (
                              <td className="px-6 py-2.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  {doc.active_version && (
                                    <ActionIconButton kind="download" onClick={() => handleDownload(doc.active_version!.storage_path, doc.nome, doc.id)} />
                                  )}
                                  {!doc.is_integrated && (
                                    <>
                                      {/* Sempre visíveis: Editar + (Download acima) */}
                                      <ActionIconButton kind="settings" onClick={() => handleStartEditDoc(doc)} />
                                      {/* Ações secundárias — bandeja horizontal (abre para a esquerda) */}
                                      <InlineActionTray>
                                        {isOrgAdmin && (
                                          <ActionIconButton kind="move" onClick={() => { setMovingDocId(doc.id); setTargetFolderId(doc.folder_id || null); setMoveModalOpen(true); }} />
                                        )}
                                        <ActionIconButton kind="qrcode" onClick={() => setSelectedDocForQrCode(doc)} />
                                        {doc.active_version && (doc.active_version.mime_type === 'application/pdf' || doc.nome.toLowerCase().endsWith('.pdf')) && (
                                          <ActionIconButton kind="annotate" onClick={() => setSelectedDocForMarkup(doc)} />
                                        )}
                                        {isOrgAdmin && (
                                          <ActionIconButton kind="share" onClick={() => openShareModal(doc.id)} />
                                        )}
                                        <ActionIconButton kind="history" onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                                          const btn = e.currentTarget; btn.style.pointerEvents = 'none'; btn.style.opacity = '0.7';
                                          try {
                                            const fullDoc = await documentService.getDocumentById(doc.id);
                                            if (!fullDoc) return;
                                            setSelectedDocForVersions(fullDoc); loadApprovalsForDoc(fullDoc.id); loadAuditLogsForDoc(fullDoc.id);
                                          } finally {
                                            btn.style.pointerEvents = 'auto'; btn.style.opacity = '1';
                                          }
                                        }} />
                                        {isOrgAdmin && (
                                          <ActionIconButton kind="delete" onClick={() => handleDeleteDoc(doc.id)} />
                                        )}
                                      </InlineActionTray>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
      )}

      {/* ─── MODAL DE UPLOAD DE NOVO DOCUMENTO (Feature 1) ─── */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider">Novo Documento — {CATEGORIES.find(c => c.id === newDocCategory)?.label}</h3>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-5">
              {/* Arquivo (Drag and Drop Simples) */}
              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Arquivo Físico (PDF, DOCX, XLSX, DWG, Imagens — Max 50MB)</label>
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-blue-400 transition-colors bg-slate-50/50 relative">
                  <input
                    type="file"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setNewDocFile(e.target.files[0]);
                        // Tenta sugerir nome automaticamente
                        if (!newDocName) {
                          const baseName = e.target.files[0].name.split('.').slice(0, -1).join('.');
                          setNewDocName(baseName);
                        }
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-600">
                    {newDocFile ? newDocFile.name : 'Arraste ou clique para selecionar seu arquivo'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {newDocFile ? formatSize(newDocFile.size) : 'Limite de 50 MB'}
                  </p>
                </div>
              </div>

              {/* Linha 1: Nome e Tipo de Doc */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Nome do Documento</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome simplificado"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Tipo de Documento</label>
                  <select
                      required
                      value={newDocType}
                      onChange={(e) => setNewDocType(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    >
                      <option value="">Selecione um tipo...</option>
                      {documentTypes.map((type) => (
                        <option key={type.id} value={type.name}>
                          {type.name}
                        </option>
                      ))}
                      {/* Caso o documento já tenha um tipo não cadastrado (fallback para edição, se necessário) */}
                      {newDocType && !documentTypes.find(t => t.name === newDocType) && (
                        <option value={newDocType}>{newDocType}</option>
                      )}
                    </select>
                </div>
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Descrição / Notas</label>
                <textarea
                  placeholder="Observações ou detalhes importantes..."
                  value={newDocDesc}
                  onChange={(e) => setNewDocDesc(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25 resize-none"
                />
              </div>

              {/* Emissão, Validade e Dias Alerta */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Data de Emissão</label>
                  <input
                    type="date"
                    value={newDocEmissao}
                    onChange={(e) => setNewDocEmissao(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Data de Vencimento</label>
                  <input
                    type="date"
                    value={newDocValidade}
                    onChange={(e) => setNewDocValidade(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Alerta de Vencimento</label>
                  <select
                    value={newDocAlertaDias}
                    onChange={(e) => setNewDocAlertaDias(parseInt(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value={90}>90 dias antes</option>
                    <option value={60}>60 dias antes</option>
                    <option value={30}>30 dias antes</option>
                    <option value={15}>15 dias antes</option>
                    <option value={7}>7 dias antes</option>
                  </select>
                </div>
              </div>

              {/* Tags e Vínculos adicionais */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Tags (Separadas por vírgula)</label>
                  <input
                    type="text"
                    placeholder="obra, fundação, AVCB, fiscal"
                    value={newDocTagsInput}
                    onChange={(e) => setNewDocTagsInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>

                {/* Vínculo de Obra/Empreendimento (Opcional) */}
                <div className="space-y-1.5">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Obra/Empreendimento (Opcional)</label>
                  <select
                    value={selectedProjectId !== 'all' ? selectedProjectId : newDocProjectId}
                    onChange={(e) => setNewDocProjectId(e.target.value)}
                    disabled={selectedProjectId !== 'all'}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-60"
                  >
                    <option value="">Nenhum (Geral)</option>
                    {obras.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Vínculo de Empresa (Sócio/Filial/Holding) */}
                <div className="space-y-1.5">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Empresa Vinculada (Opcional)</label>
                  <select
                    value={newDocCompanyId}
                    onChange={(e) => setNewDocCompanyId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value="">Nenhuma</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razao_social}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-5 py-3 border border-slate-200 text-slate-500 font-bold text-button uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-black text-button uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/10 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Salvar Documento
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL DE HISTÓRICO DE VERSÕES / RENOVAÇÃO (Feature 4/5) ─── */}
      {selectedDocForVersions && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Histórico de Versões</h3>
                  <p className="text-xs text-slate-400 font-bold">{selectedDocForVersions.nome}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDocForVersions(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Form para Upload de Nova Versão / Renovação */}
              {canAccessTab(selectedDocForVersions.categoria) && (
                <form onSubmit={handleUploadVersionSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                    <Upload className="w-4 h-4" />
                    Subir nova versão ou renovação
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-grow border border-slate-200 rounded-xl bg-white p-3 hover:border-blue-400 transition-colors">
                      <input
                        type="file"
                        required
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setNewVersionFile(e.target.files[0]);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <p className="text-xs font-bold text-slate-600 text-center truncate">
                        {newVersionFile ? newVersionFile.name : 'Selecionar novo arquivo...'}
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={uploadingVersion || !newVersionFile}
                      className="px-6 py-3 bg-blue-600 text-white font-black text-button uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {uploadingVersion ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Upload'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Histórico / Lista de Versões */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Versões Cadastradas</h4>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl">
                  {selectedDocForVersions.versions?.map((ver) => {
                    const isActive = selectedDocForVersions.active_version_id === ver.id;
                    return (
                      <div key={ver.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 text-xs font-black uppercase tracking-wider rounded ${
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            V{ver.version_number} {isActive && '(Atual)'}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-slate-700 truncate max-w-xs md:max-w-md" title={ver.storage_path ? ver.storage_path.split('/').pop() : ''}>
                              {ver.storage_path ? (ver.storage_path.split('/').pop()?.substring(37) || '') : ''} {/* Remove UUID do nome */}
                            </p>
                            <p className="text-xs text-slate-400 font-semibold">
                              Por {ver.criado_por || 'Sistema'} em {ver.created_at ? new Date(ver.created_at).toLocaleString() : ''}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownload(ver.storage_path, selectedDocForVersions.nome)}
                          title="Baixar esta versão"
                          className="p-2 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-all"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Solicitar Aprovação (Onda 2) */}
              {canAccessTab(selectedDocForVersions.categoria) && (selectedDocForVersions.approval_status === 'rascunho' || selectedDocForVersions.approval_status === 'rejeitado') && (
                <form onSubmit={handleRequestApprovalSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                  <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    Enviar para aprovação de um revisor
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-grow">
                      <select
                        required
                        value={selectedApproverEmail}
                        onChange={(e) => setSelectedApproverEmail(e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-form-input font-bold bg-white focus:outline-none"
                      >
                        <option value="">Selecione um Revisor...</option>
                        {orgMembers.map((member) => (
                          <option key={member.email} value={member.email}>
                            {member.name} ({member.email})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      disabled={submittingApproval || !selectedApproverEmail}
                      className="px-6 py-2.5 bg-blue-600 text-white font-black text-button uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submittingApproval ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Solicitar'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Histórico de Pareceres de Aprovação (Onda 2) */}
              {documentApprovals.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Histórico de Pareceres</h4>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl">
                    {documentApprovals.map((app) => (
                      <div key={app.id} className="p-4 hover:bg-slate-50/50 transition-colors text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded ${
                              app.status === 'aprovado'
                                ? 'bg-emerald-100 text-emerald-700'
                                : app.status === 'rejeitado'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {app.status}
                            </span>
                            <span className="font-bold text-slate-600">Revisor: {app.approver_email}</span>
                          </div>
                          <span className="text-xs text-slate-400 font-semibold">{new Date(app.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-500">Solicitado por: <span className="font-bold text-slate-600">{app.requested_by}</span></p>
                        {app.feedback && (
                          <div className="mt-1 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-slate-700 italic">
                            "{app.feedback}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Trilha de Auditoria (Logs) (Onda 4) */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Trilha de Auditoria (Logs)</h4>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl bg-slate-50/20">
                  {documentAuditLogs.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">Nenhum evento registrado para este documento.</p>
                  ) : (
                    documentAuditLogs.map((log) => {
                      let icon = <FileText className="w-3.5 h-3.5 text-slate-400" />;
                      let badgeColor = 'bg-slate-100 text-slate-600';
                      
                      switch (log.action) {
                        case 'criado':
                          icon = <Plus className="w-3.5 h-3.5 text-blue-600" />;
                          badgeColor = 'bg-blue-50 text-blue-700 border border-blue-100';
                          break;
                        case 'versao_enviada':
                          icon = <Upload className="w-3.5 h-3.5 text-violet-600" />;
                          badgeColor = 'bg-violet-50 text-violet-700 border border-violet-100';
                          break;
                        case 'download':
                          icon = <Download className="w-3.5 h-3.5 text-emerald-600" />;
                          badgeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                          break;
                        case 'visualizado':
                          icon = <Eye className="w-3.5 h-3.5 text-indigo-600" />;
                          badgeColor = 'bg-indigo-50 text-indigo-700 border border-indigo-100';
                          break;
                        case 'movido_pasta':
                          icon = <CornerDownRight className="w-3.5 h-3.5 text-amber-600" />;
                          badgeColor = 'bg-amber-50 text-amber-700 border border-amber-100';
                          break;
                        case 'status_alterado':
                          icon = <UserCheck className="w-3.5 h-3.5 text-teal-600" />;
                          badgeColor = 'bg-teal-50 text-teal-700 border border-teal-100';
                          break;
                      }

                      return (
                        <div key={log.id} className="p-3 hover:bg-slate-50 transition-colors text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-bold text-slate-700">
                              {icon}
                              <span>{log.user_email}</span>
                            </div>
                            <span className="text-xs text-slate-400 font-semibold">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded ${badgeColor}`}>
                              {log.action}
                            </span>
                            {log.details && (
                              <span className="text-slate-500 font-medium italic">
                                "{log.details}"
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ─── MODAL DE CRIAÇÃO DE PASTA VIRTUAL (Onda 1) ─── */}
      {createFolderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Nova Pasta Virtual</h3>
              </div>
              <button
                onClick={() => setCreateFolderModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolderSubmit} className="p-6 space-y-4">
              {!activeOrganizationId && (
                <div className="space-y-1.5">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Organização</label>
                  <select
                    value={createFolderOrgId}
                    onChange={(e) => setCreateFolderOrgId(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value="">Selecione uma organização...</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Nome da Pasta</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Projetos Executivos, Planilhas de Custos"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Padrão de Nome (Nomenclatura)</label>
                <select
                  value={selectedMaskPreset}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedMaskPreset(val);
                    if (val === 'custom') {
                      setFolderNamingMask('');
                    } else if (val === 'none') {
                      setFolderNamingMask('');
                    } else {
                      setFolderNamingMask(val);
                    }
                  }}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                >
                  <option value="none">Sem padrão (Livre)</option>
                  {namingPatterns.map(pat => (
                    <option key={pat.id} value={pat.mask}>{pat.name}: {pat.mask}</option>
                  ))}
                  <option value="custom">Outro (Personalizado...)</option>
                </select>
              </div>

              {selectedMaskPreset !== 'none' && disciplines.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Disciplinas Permitidas nesta pasta</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 max-h-[140px] overflow-y-auto">
                    {disciplines.map((disc) => {
                      const isChecked = selectedFolderDisciplines.includes(disc.code);
                      return (
                        <label key={disc.id} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedFolderDisciplines(prev =>
                                isChecked
                                  ? prev.filter(c => c !== disc.code)
                                  : [...prev, disc.code]
                              );
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500/20"
                          />
                          <span>{disc.code} - {disc.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedMaskPreset === 'custom' && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Máscara Personalizada</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: [OBRA]-PL-[NUMERO]"
                    value={folderNamingMask}
                    onChange={(e) => setFolderNamingMask(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Use as tags: <span className="text-blue-600">[OBRA]</span>, <span className="text-blue-600">[DISCIPLINA]</span>, <span className="text-blue-600">[NUMERO]</span>, <span className="text-blue-600">[REVISAO]</span>.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateFolderModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 font-bold text-button uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="px-5 py-2.5 bg-blue-600 text-white font-black text-button uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  {creatingFolder ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Criar Pasta'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL DE MOVIMENTAÇÃO DE ARQUIVO (Onda 1) ─── */}
      {moveModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <CornerDownRight className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Mover Documento</h3>
              </div>
              <button
                onClick={() => {
                  setMoveModalOpen(false);
                  setMovingDocId(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMoveDocumentSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Selecione a Pasta de Destino</label>
                <select
                  value={targetFolderId || ''}
                  onChange={(e) => setTargetFolderId(e.target.value || null)}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                >
                  <option value="">📁 Diretório Raiz</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      📁 {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setMoveModalOpen(false);
                    setMovingDocId(null);
                  }}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 font-bold text-button uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 text-white font-black text-button uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-md"
                >
                  Confirmar Mudança
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Compartilhamento com Portal do Parceiro */}
      {shareModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-orange-500" />
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Compartilhar com Parceiro</h3>
              </div>
              <button
                onClick={() => {
                  setShareModalOpen(false);
                  setShareDocId(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleShareWithPartner} className="p-6 space-y-4">
              {docAlreadySharedWith.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5">
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">Já compartilhado com:</p>
                  <p className="text-xs text-blue-600">
                    {docAlreadySharedWith.map((s) => s.supplier_name).join(', ')}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Parceiro / Fornecedor Habilitado</label>
                <select
                  required
                  value={selectedShareWorkspaceId}
                  onChange={(e) => setSelectedShareWorkspaceId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                >
                  <option value="">Selecione um parceiro...</option>
                  {sortedShareWorkspaces.map((ws) => {
                    const alreadyShared = docAlreadySharedWith.some((s) => s.partner_workspace_id === ws.id);
                    return (
                      <option key={ws.id} value={ws.id} disabled={alreadyShared}>
                        {ws.supplier_id === shareTargetSupplierId ? '★ ' : ''}{ws.supplier_name}{alreadyShared ? ' (já compartilhado)' : ''}
                      </option>
                    );
                  })}
                </select>
                {shareTargetSupplierId && sortedShareWorkspaces.some((ws) => ws.supplier_id === shareTargetSupplierId) && (
                  <p className="text-xs text-slate-400 pt-1">★ = fornecedor já vinculado a este documento.</p>
                )}
                {partnerWorkspaces.length === 0 && (
                  <p className="text-xs text-slate-400 pt-1">
                    Nenhum parceiro habilitado. Ative um workspace em Suprimentos → Parceiros.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShareModalOpen(false);
                    setShareDocId(null);
                  }}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 font-bold text-button uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={sharingSubmitting || !selectedShareWorkspaceId}
                  className="px-5 py-2.5 bg-orange-500 text-white font-black text-button uppercase tracking-widest rounded-xl hover:bg-orange-600 transition-all shadow-md disabled:opacity-50"
                >
                  {sharingSubmitting ? 'Compartilhando...' : 'Compartilhar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Etiqueta QR Code de Canteiro */}
      {selectedDocForQrCode && (() => {
        const publicValidationUrl = `${window.location.origin}/publico/validar-planta/${selectedDocForQrCode.id}?v=${selectedDocForQrCode.active_version?.version_number || 1}`;
        const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(publicValidationUrl)}`;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                <div>
                  <h3 className="font-black text-slate-800 text-lg uppercase tracking-wide">Etiqueta QR Code</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Identificação e Validação Física</p>
                </div>
                <button
                  onClick={() => setSelectedDocForQrCode(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 flex flex-col items-center">
                {/* Visualização de Impressão */}
                <div id="printable-qr-label" className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50/50 flex flex-col items-center text-center space-y-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <img 
                      src={qrCodeImageUrl} 
                      alt="QR Code de Validação" 
                      className="w-44 h-44 object-contain"
                    />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-black text-slate-800 uppercase tracking-wide text-xs">{selectedDocForQrCode.nome}</h4>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                      Revisão Ativa: V{selectedDocForQrCode.active_version?.version_number || 1}
                    </p>
                    <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-widest">
                      Validação: {publicValidationUrl.replace('http://', '').replace('https://', '')}
                    </p>
                  </div>
                  <div className="w-full pt-3 border-t border-slate-200/60 flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>ÓPURA DOCS</span>
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setSelectedDocForQrCode(null)}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-500 font-bold text-button uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors text-center"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const printContents = document.getElementById('printable-qr-label')?.innerHTML;
                      if (printContents) {
                        const printWindow = window.open('', '_blank');
                        if (printWindow) {
                          printWindow.document.write(`
                            <html>
                              <head>
                                <title>Imprimir Etiqueta QR Code</title>
                                <style>
                                  body {
                                    font-family: system-ui, sans-serif;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    height: 100vh;
                                    margin: 0;
                                    padding: 0;
                                    background: white;
                                  }
                                  .label-card {
                                    width: 80mm;
                                    height: 80mm;
                                    border: 1px solid #ccc;
                                    padding: 5mm;
                                    box-sizing: border-box;
                                    display: flex;
                                    flex-direction: column;
                                    align-items: center;
                                    justify-content: space-between;
                                    text-align: center;
                                  }
                                  img {
                                    width: 45mm;
                                    height: 45mm;
                                    margin-bottom: 2mm;
                                  }
                                  h4 {
                                    margin: 0 0 1mm 0;
                                    font-size: 11px;
                                    font-weight: bold;
                                    text-transform: uppercase;
                                    word-break: break-word;
                                  }
                                  p {
                                    margin: 0;
                                    font-size: 9px;
                                    color: #555;
                                  }
                                  .footer {
                                    width: 100%;
                                    border-top: 1px solid #eee;
                                    padding-top: 1.5mm;
                                    display: flex;
                                    justify-content: space-between;
                                    font-size: 8px;
                                    color: #888;
                                    text-transform: uppercase;
                                  }
                                  @media print {
                                    body { height: auto; }
                                    .label-card { border: none; width: 100%; height: auto; padding: 0; }
                                  }
                                </style>
                              </head>
                              <body>
                                <div class="label-card">
                                  <img src="${qrCodeImageUrl}" />
                                  <div>
                                    <h4>${selectedDocForQrCode.nome}</h4>
                                    <p>REVISÃO ATIVA: V${selectedDocForQrCode.active_version?.version_number || 1}</p>
                                    <p style="font-size: 7px; color: #999; margin-top: 0.5mm;">VALIDAÇÃO: ${publicValidationUrl.replace('https://', '').replace('http://', '')}</p>
                                  </div>
                                  <div class="footer">
                                    <span>ÓPURA DOCS</span>
                                    <span>${new Date().toLocaleDateString()}</span>
                                  </div>
                                </div>
                                <script>
                                  window.onload = function() {
                                    window.print();
                                    setTimeout(function() { window.close(); }, 500);
                                  };
                                </script>
                              </body>
                            </html>
                          `);
                          printWindow.document.close();
                        }
                      }
                    }}
                    className="flex-1 px-5 py-2.5 bg-blue-600 text-white font-black text-button uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-md text-center"
                  >
                    Imprimir
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Visualizador de Marcação (Markups) de PDF */}
      {selectedDocForMarkup && (
        <DocumentMarkupViewer
          document={selectedDocForMarkup}
          userEmail={currentProfile?.email || 'user@alpaconstrutora.com.br'}
          onClose={() => setSelectedDocForMarkup(null)}
        />
      )}

      {/* Modal de Edição de Metadados do Documento */}
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider">Editar Metadados</h3>
              </div>
              <button
                onClick={() => setEditingDoc(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditDocSubmit} className="p-6 space-y-5">
                {/* Nome ou Tokens */}
                {(() => {
                  const docFolder = folders.find(f => f.id === editingDoc?.folder_id);
                  if (docFolder && docFolder.naming_mask) {
                    return (
                      <div className="space-y-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                        <label className="text-form-label font-black uppercase text-blue-800 tracking-wider flex items-center gap-2">
                          <Settings className="w-4 h-4" /> Componentes do Nome (Padrão: {docFolder.naming_mask})
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {extractMaskTokens(docFolder.naming_mask).map(token => {
                            const cleanToken = token.replace(/[\[\]]/g, '');
                            if (cleanToken === 'OBRA') {
                              return (
                                <div key={token} className="space-y-1.5">
                                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">OBRA</label>
                                  <select
                                    required
                                    value={editDocTokens[token] || ''}
                                    onChange={(e) => setEditDocTokens(prev => ({ ...prev, [token]: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                  >
                                    <option value="">Selecione uma Obra</option>
                                    {obras.map(o => (
                                      <option key={o.id} value={o.code || ''}>{o.code} - {o.name}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }
                            if (cleanToken === 'DISCIPLINA') {
                              const allowedDiscs = docFolder.disciplines?.length ? disciplines.filter(d => docFolder.disciplines!.includes(d.code)) : disciplines;
                              return (
                                <div key={token} className="space-y-1.5">
                                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">DISCIPLINA</label>
                                  <select
                                    required
                                    value={editDocTokens[token] || ''}
                                    onChange={(e) => setEditDocTokens(prev => ({ ...prev, [token]: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                  >
                                    <option value="">Selecione a Disciplina</option>
                                    {allowedDiscs.map(d => (
                                      <option key={d.id} value={d.code}>{d.code} - {d.name}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }
                            return (
                              <div key={token} className="space-y-1.5">
                                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">{cleanToken}</label>
                                <input
                                  type="text"
                                  required
                                  placeholder={`Valor para ${cleanToken}`}
                                  value={editDocTokens[token] || ''}
                                  onChange={(e) => setEditDocTokens(prev => ({ ...prev, [token]: e.target.value.toUpperCase() }))}
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="pt-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Como ficará o arquivo</span>
                          <div className="font-mono text-xs text-blue-600 font-bold break-all bg-white p-2 rounded border border-blue-100">
                            {(() => {
                              const newNameWithExt = generateFileNameFromMask(docFolder.naming_mask, editDocTokens, 'pdf');
                              return newNameWithExt.split('.').slice(0, -1).join('.');
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Se não tem máscara, mostra input livre padrão
                  return (
                    <div className="space-y-1.5">
                      <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Nome do Documento / Planta</label>
                      <input
                        type="text"
                        required
                        value={editDocName}
                        onChange={(e) => setEditDocName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                      />
                    </div>
                  );
                })()}

              {/* Descrição */}
              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Descrição / Notas complementares</label>
                <textarea
                  rows={3}
                  value={editDocDesc}
                  onChange={(e) => setEditDocDesc(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Datas e Alertas em Grid */}
              {/* Datas e Alertas em Grid */}
                <div className={`grid ${editingDoc.categoria === 'engenharia' ? 'grid-cols-1 sm:grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'} gap-4`}>
                  <div className="space-y-1.5">
                    <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Data de Emissão</label>
                    <input
                      type="date"
                      value={editDocEmissao}
                      onChange={(e) => setEditDocEmissao(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    />
                  </div>

                  {editingDoc.categoria !== 'engenharia' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Data de Vencimento</label>
                        <input
                          type="date"
                          value={editDocValidade}
                          onChange={(e) => setEditDocValidade(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Alerta de Vencimento (Dias)</label>
                        <input
                          type="number"
                          min={0}
                          value={editDocAlertaDias}
                          onChange={(e) => setEditDocAlertaDias(parseInt(e.target.value, 10) || 0)}
                          className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                        />
                      </div>
                    </>
                  )}
                </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Tags / Palavras-chave (Separadas por vírgula)</label>
                <input
                  type="text"
                  placeholder="Estrutural, Revisado, Medição, Alpa"
                  value={editDocTagsInput}
                  onChange={(e) => setEditDocTagsInput(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                />
              </div>

              {/* Status do Documento */}
              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Status do Documento</label>
                <select
                  value={editDocStatus}
                  onChange={(e) => setEditDocStatus(e.target.value as any)}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                >
                  <option value="ativo">✅ Ativo</option>
                  <option value="arquivado">📁 Arquivado</option>
                  <option value="vencido">⚠️ Vencido (Forçar)</option>
                  <option value="alerta">🔔 Alerta (Forçar)</option>
                </select>
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 font-black text-button uppercase tracking-widest rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-button uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Configuração/Edição de Pasta Virtual */}
      {editingFolder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider">Configurar Pasta</h3>
              </div>
              <button
                onClick={() => setEditingFolder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditFolderSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Nome da Pasta</label>
                <input
                  type="text"
                  required
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                />
              </div>

              {/* Regra de Nomenclatura */}
              <div className="space-y-2">
                <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Padrão de Nome (Nomenclatura)</label>
                <select
                  value={editFolderMaskPreset}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditFolderMaskPreset(val);
                    if (val === 'custom') {
                      setEditFolderMask('');
                    } else if (val === 'none') {
                      setEditFolderMask('');
                    } else {
                      setEditFolderMask(val);
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-white focus:outline-none"
                >
                  <option value="none">Sem validação (Livre)</option>
                  {namingPatterns.map(pat => (
                    <option key={pat.id} value={pat.mask}>{pat.name}: {pat.mask}</option>
                  ))}
                  <option value="custom">Fórmula Personalizada...</option>
                </select>
              </div>

              {editFolderMaskPreset !== 'none' && disciplines.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">Disciplinas Permitidas nesta pasta</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 max-h-[140px] overflow-y-auto">
                    {disciplines.map((disc) => {
                      const isChecked = selectedFolderDisciplines.includes(disc.code);
                      return (
                        <label key={disc.id} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedFolderDisciplines(prev =>
                                isChecked
                                  ? prev.filter(c => c !== disc.code)
                                  : [...prev, disc.code]
                              );
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500/20"
                          />
                          <span>{disc.code} - {disc.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {editFolderMaskPreset === 'custom' && (
                  <input
                    type="text"
                    required
                    placeholder="Ex: [OBRA]-TXT-[NUMERO]"
                    value={editFolderMask}
                    onChange={(e) => setEditFolderMask(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25 mt-2"
                  />
                )}
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                  Substitua os campos por: <strong>[OBRA]</strong>, <strong>[DISCIPLINA]</strong>, <strong>[NUMERO]</strong>, <strong>[REVISAO]</strong>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingFolder(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold text-button uppercase tracking-wider rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 text-white font-black text-button uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-md"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Ajustes Gerais do GED */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8 animate-in zoom-in-95 duration-200">
            
            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-xl">{settingsTab === 'disciplines' ? '📋' : '⚙️'}</span>
                <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider">
                  {settingsTab === 'disciplines' ? 'Gestão de Disciplinas' : 'Ajustes do GED'}
                </h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas Internas */}
            
              <div className="flex border-b border-slate-100 bg-slate-50/20 px-6 overflow-x-auto">
                <button
                  onClick={() => setSettingsTab('document_types')}
                  className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
                    settingsTab === 'document_types'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  📄 Tipos de Documentos
                </button>
                <button
                  onClick={() => setSettingsTab('disciplines')}
                  className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
                    settingsTab === 'disciplines'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  📑 Disciplinas
                </button>
                <button
                  onClick={() => setSettingsTab('patterns')}
                  className={`py-3.5 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
                    settingsTab === 'patterns'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  🏷️ Fórmulas de Nomenclatura
                </button>
              </div>

              
              <div className="p-6 max-h-[500px] overflow-y-auto space-y-6">
                {settingsTab === 'document_types' && (
                  <div className="space-y-5">
                    <form onSubmit={handleCreateDocTypeSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                      <h4 className="font-black text-slate-700 text-xs uppercase tracking-wider">Cadastrar Novo Tipo de Documento</h4>
                      <div className="flex flex-col sm:flex-row gap-3 items-end">
                        <div className="space-y-1 flex-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome do Tipo (ex: Projeto Hidráulico)</label>
                          <input
                            type="text"
                            required
                            placeholder="Nome"
                            value={newDocTypeName}
                            onChange={(e) => setNewDocTypeName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                          />
                        </div>
                        <button type="submit" className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap">
                          Adicionar
                        </button>
                      </div>
                    </form>

                    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Tipo de Documento</th>
                            <th className="px-4 py-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm font-semibold text-slate-700">
                          {documentTypes.map(type => (
                            <tr key={type.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                {editDocTypeId === type.id ? (
                                  <input
                                    type="text"
                                    value={editDocTypeName}
                                    onChange={(e) => setEditDocTypeName(e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                  />
                                ) : (
                                  type.name
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {editDocTypeId === type.id ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => handleSaveEditDocType(type.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setEditDocTypeId(null)} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => { setEditDocTypeId(type.id); setEditDocTypeName(type.name); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteDocType(type.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                          {documentTypes.length === 0 && (
                            <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400 font-normal">Nenhum tipo cadastrado.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {settingsTab === 'disciplines' && (
                  <div className="space-y-5">
                    {/* Formulário Novo */}
                    <form onSubmit={handleCreateDisciplineSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                      <h4 className="font-black text-slate-700 text-xs uppercase tracking-wider">Cadastrar Nova Disciplina</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Código (ex: ARQ)</label>
                          <input
                            type="text"
                            required
                            maxLength={10}
                            placeholder="ARQ"
                            value={newDiscCode}
                            onChange={(e) => setNewDiscCode(e.target.value.toUpperCase())}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome da Disciplina (ex: Arquitetura)</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Arquitetura e Urbanismo"
                              value={newDiscName}
                              onChange={(e) => setNewDiscName(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                            />
                            <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap">
                              Adicionar
                            </button>
                          </div>
                        </div>
                      </div>
                    </form>

                    {/* Tabela de Disciplinas */}
                    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Código</th>
                            <th className="px-4 py-3">Nome da Disciplina</th>
                            <th className="px-4 py-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm font-semibold text-slate-700">
                          {disciplines.map(disc => (
                            <tr key={disc.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 text-blue-600 font-bold">
                                {editDiscId === disc.id ? (
                                  <input
                                    type="text"
                                    value={editDiscCode}
                                    onChange={(e) => setEditDiscCode(e.target.value.toUpperCase())}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                  />
                                ) : (
                                  disc.code
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {editDiscId === disc.id ? (
                                  <input
                                    type="text"
                                    value={editDiscName}
                                    onChange={(e) => setEditDiscName(e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                  />
                                ) : (
                                  disc.name
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {editDiscId === disc.id ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => handleSaveEditDiscipline(disc.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setEditDiscId(null)} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => { setEditDiscId(disc.id); setEditDiscCode(disc.code); setEditDiscName(disc.name); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteDiscipline(disc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                          {disciplines.length === 0 && (
                            <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 font-normal">Nenhuma disciplina cadastrada.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {settingsTab === 'patterns' && (
                  <div className="space-y-5">
                    {/* Formulário Novo */}
                    <form onSubmit={handleCreateNamingPatternSubmit} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                      <h4 className="font-black text-slate-700 text-xs uppercase tracking-wider">Cadastrar Nova Fórmula</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome do Padrão</label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: Padrão ALPA"
                            value={newPatName}
                            onChange={(e) => setNewPatName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Máscara de Composição</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              required
                              placeholder="[OBRA]-[DISCIPLINA]-[NUMERO]-R[REVISAO]"
                              value={newPatMask}
                              onChange={(e) => setNewPatMask(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                            />
                            <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap">
                              Adicionar
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] font-medium text-slate-500 space-y-1">
                        <div><strong className="text-slate-700">Tags disponíveis:</strong> <code className="bg-white px-1 py-0.5 rounded text-blue-600">[OBRA]</code>, <code className="bg-white px-1 py-0.5 rounded text-blue-600">[DISCIPLINA]</code>, <code className="bg-white px-1 py-0.5 rounded text-blue-600">[NUMERO]</code>, <code className="bg-white px-1 py-0.5 rounded text-blue-600">[REVISAO]</code></div>
                        <div className="text-slate-400 italic">Dica: Use chaves para definir a quantidade de dígitos. Ex: <code className="bg-white px-1 py-0.5 rounded not-italic text-blue-600">[NUMERO&#123;3&#125;]</code> formata como 001.</div>
                      </div>
                    </form>

                    {/* Tabela de Padrões */}
                    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Nome do Padrão</th>
                            <th className="px-4 py-3">Fórmula / Máscara</th>
                            <th className="px-4 py-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm font-semibold text-slate-700">
                          {namingPatterns.map(pattern => (
                            <tr key={pattern.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                {editPatternId === pattern.id ? (
                                  <input
                                    type="text"
                                    value={editPatternName}
                                    onChange={(e) => setEditPatternName(e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                  />
                                ) : (
                                  pattern.name
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-blue-600">
                                {editPatternId === pattern.id ? (
                                  <input
                                    type="text"
                                    value={editPatternMask}
                                    onChange={(e) => setEditPatternMask(e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                  />
                                ) : (
                                  pattern.mask
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {editPatternId === pattern.id ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => handleSaveEditPattern(pattern.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg">
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setEditPatternId(null)} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => { setEditPatternId(pattern.id); setEditPatternName(pattern.name); setEditPatternMask(pattern.mask); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteNamingPattern(pattern.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                          {namingPatterns.length === 0 && (
                            <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 font-normal">Nenhum padrão de nomenclatura cadastrado.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      {/* Modal de Renomeação Inteligente (Smart Rename) */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-lg uppercase tracking-wider leading-tight">Fora do Padrão</h3>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5 max-w-[260px] leading-tight">O arquivo enviado não atende ao padrão da pasta. Preencha os campos abaixo para corrigir.</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleRenameSubmit} className="p-6 space-y-6">
              <div className="space-y-4">
                {extractMaskTokens(renameTargetMask).map((token) => {
                  const cleanToken = token.replace(/[\[\]]/g, '');
                  if (cleanToken === 'OBRA') {
                    return (
                      <div key={token} className="space-y-1.5">
                        <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">OBRA</label>
                        <select
                          required
                          value={renameTokens[token] || ''}
                          onChange={(e) => setRenameTokens(prev => ({ ...prev, [token]: e.target.value }))}
                          className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                        >
                          <option value="">Selecione uma Obra</option>
                          {projects?.map(p => (
                            <option key={p.id} value={p.code || p.id}>{p.code || p.id} - {p.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  if (cleanToken === 'DISCIPLINA') {
                    const renameTargetFolder = folders.find(f => f.id === currentFolderId);
                    const allowedDiscs = renameTargetFolder?.disciplines?.length ?
                      disciplines.filter(d => renameTargetFolder.disciplines!.includes(d.code)) : disciplines;
                    
                    return (
                      <div key={token} className="space-y-1.5">
                        <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">DISCIPLINA</label>
                        <select
                          required
                          value={renameTokens[token] || ''}
                          onChange={(e) => setRenameTokens(prev => ({ ...prev, [token]: e.target.value }))}
                          className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                        >
                          <option value="">Selecione uma Disciplina</option>
                          {allowedDiscs.map(d => (
                            <option key={d.id} value={d.code}>{d.code} - {d.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  return (
                    <div key={token} className="space-y-1.5">
                      <label className="text-form-label font-black uppercase text-slate-400 tracking-wider">
                        {cleanToken}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={`Valor para ${cleanToken}`}
                        value={renameTokens[token] || ''}
                        onChange={(e) => setRenameTokens(prev => ({ ...prev, [token]: e.target.value.toUpperCase() }))}
                        className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Como ficará o arquivo</span>
                <div className="font-mono text-xs text-blue-600 font-bold break-all bg-white p-2 rounded border border-blue-100">
                  {generateFileNameFromMask(renameTargetMask, renameTokens, newDocFile?.name.split('.').pop() || '')}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-500 font-black text-button uppercase tracking-widest rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-button uppercase tracking-widest rounded-xl shadow-md transition-all active:scale-95"
                >
                  Aplicar Correção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpuraDocsModule;

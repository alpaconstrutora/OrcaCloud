import React from 'react';
import ActionIconButton from './ui/ActionIconButton';
import { InlineActionTray } from './ui/InlineActionTray';
import { useConfirm } from './ui/confirm';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';
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
  UserCheck,
  Eye,
  Filter,
  Share2,
  Table2,
  LayoutDashboard,
  RefreshCw,
  Edit2,
  Check,
  AlertCircle,
  Lock,
  UploadCloud,
  MoveHorizontal
} from 'lucide-react';
import { ColumnConfig, useTableColumns, ColumnConfigButton, SortableHeader, usePersistedState, useResizableColumns } from './ui/TableUtils';
import { DocumentsTable } from './documents/DocumentsTable';
import { DocumentQrLabelModal } from './documents/DocumentQrLabelModal';
import { BatchUploadSheet } from './documents/BatchUploadSheet';
import { DocumentBatchEditModal } from './documents/DocumentBatchEditModal';
import {
  documentService,
  OpuraDmsDiscipline, OpuraDmsDocumentType,
  OpuraDmsNamingPattern,
  OpuraPortalShareRecipient
} from '../services/documentService';
import { partnerService } from '../services/partnerService';
import { clientService } from '../services/clientService';
import { laborService } from '../services/laborService';
import { supplierService } from '../services/supplierService';
import { tableColumnPreferencesService, TableColumnPreference } from '../services/tableColumnPreferencesService';
import { supabase } from '../lib/supabase';
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
  UserPermissions,
  Supplier,
} from '../types';
import { useStore } from '../store/useStore';
import { isObra } from '../utils/projectClassification';

const COLUMNS: ColumnConfig[] = [
  { key: 'nome', label: 'Documento', sortable: true },
  { key: 'extensao', label: 'Extensão', sortable: true },
  { key: 'descricao', label: 'Descrição', sortable: true },
  { key: 'autor', label: 'Autor', sortable: true },
  { key: 'numero_documento_fornecedor', label: 'Nº Doc. Fornecedor', sortable: true },
  { key: 'tipo_documento', label: 'Tipo / Categoria', sortable: true },
  { key: 'revisao', label: 'Revisão', sortable: true },
  { key: 'project_id', label: 'Obra Vinculada', sortable: true },
  { key: 'data_emissao', label: 'Emissão', sortable: true },
  { key: 'data_validade', label: 'Validade', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];

// Extensões aceitas para renomear o arquivo da versão ativa — mesma lista do
// upload (executeUpload) e da edição em lote (DocumentBatchEditModal), pois
// `documentService.renameActiveVersionExtension` só aceita estes valores.
const EXTENSAO_OPTIONS: { value: 'pdf' | 'docx' | 'xlsx' | 'dwg' | 'jpg' | 'png'; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'xlsx', label: 'XLSX' },
  { value: 'dwg', label: 'DWG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
];

// §6.1 — larguras default do redimensionamento/autofit da tabela de documentos do GED.
const GED_DOC_COL_WIDTHS: Record<string, number> = {
  nome: 260, extensao: 100, descricao: 220, autor: 150, numero_documento_fornecedor: 160,
  tipo_documento: 160, revisao: 110, project_id: 160, data_emissao: 120, data_validade: 120,
  status: 110, actions: 140,
};

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
  const confirm = useConfirm();
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>('all');
  const [activeTab, setActiveTab] = React.useState<OpuraDocumentCategoria>('engenharia');
  const [documents, setDocuments] = React.useState<OpuraDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = usePersistedState<string>('opuraDocs:search', '');
  const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('opuraDocs:viewMode', 'list');
  const tableColumns = useTableColumns(COLUMNS, 'opuraDocsColumns');
  const gedDocCols = useResizableColumns(GED_DOC_COL_WIDTHS, 'opuraDocsColWidths');
  const [uploadModalOpen, setUploadModalOpen] = React.useState(false);
  const [batchUploadOpen, setBatchUploadOpen] = React.useState(false);
  // Seleção para edição em lote (§10/§10.1 do guia) — checkbox por linha + intervalo Shift+clique.
  const [selectedDocIds, setSelectedDocIds] = React.useState<Set<string>>(new Set());
  const [lastCheckedDocIndex, setLastCheckedDocIndex] = React.useState<number | null>(null);
  const [batchEditOpen, setBatchEditOpen] = React.useState(false);
  const [selectedDocForVersions, setSelectedDocForVersions] = React.useState<OpuraDocument | null>(null);
  const [selectedDocForQrCode, setSelectedDocForQrCode] = React.useState<OpuraDocument | null>(null);
  const [selectedDocForMarkup, setSelectedDocForMarkup] = React.useState<OpuraDocument | null>(null);
  const [showMetrics, setShowMetrics] = React.useState(false);
  const [editingDoc, setEditingDoc] = React.useState<OpuraDocument | null>(null);
  const [editDocName, setEditDocName] = React.useState('');
  const [editDocTokens, setEditDocTokens] = React.useState<Record<string, string>>({});
  const [editDocDesc, setEditDocDesc] = React.useState('');
  const [editDocAutor, setEditDocAutor] = React.useState('');
  const [editDocNumeroFornecedor, setEditDocNumeroFornecedor] = React.useState('');
  const [editDocRevisao, setEditDocRevisao] = React.useState('');
  const [editDocSupplierId, setEditDocSupplierId] = React.useState('');
  const [editDocAutorOutro, setEditDocAutorOutro] = React.useState(false);
  const [editDocEmissao, setEditDocEmissao] = React.useState('');
  const [editDocValidade, setEditDocValidade] = React.useState('');
  const [editDocAlertaDias, setEditDocAlertaDias] = React.useState(30);
  const [editDocTagsInput, setEditDocTagsInput] = React.useState('');
  const [editDocStatus, setEditDocStatus] = React.useState<OpuraDocumentStatus>('ativo');
  const [editDocProjectId, setEditDocProjectId] = React.useState('');
  const [editDocCompanyId, setEditDocCompanyId] = React.useState('');
  const [editDocType, setEditDocType] = React.useState('');
  const [editDocDiscipline, setEditDocDiscipline] = React.useState('');
  // Extensão do arquivo da versão ativa. '' = manter a atual (renomeia só quando
  // muda para um valor de EXTENSAO_OPTIONS). Renomeia o arquivo no Storage — não
  // é metadado — por isso vai por `renameActiveVersionExtension`, não `updateDocument`.
  const [editDocExtensao, setEditDocExtensao] = React.useState<'' | 'pdf' | 'docx' | 'xlsx' | 'dwg' | 'jpg' | 'png'>('');
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
  const [suppliers, setSuppliers] = React.useState<Supplier[]>([]);
  const [namingPatterns, setNamingPatterns] = React.useState<OpuraDmsNamingPattern[]>([]);
  const [showSettingsModal, setShowSettingsModal] = React.useState(false);
  // Organização escolhida no modal "Ajustes do GED" quando o seletor global está em
  // "Todas as Organizações" — mesmo padrão de newDocOrgId/createFolderOrgId. Sem isto,
  // criar Tipo/Disciplina/Padrão fica bloqueado sem nenhuma forma de escolher o alvo.
  const [settingsOrgId, setSettingsOrgId] = React.useState('');
  React.useEffect(() => {
    if (showSettingsModal) setSettingsOrgId('');
  }, [showSettingsModal]);
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
  const [leftSearchQuery, setLeftSearchQuery] = usePersistedState<string>('opuraDocs:leftSearch', '');
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
  const [shareDocIds, setShareDocIds] = React.useState<string[]>([]);
  // Escopo PASTA: quando preenchido, o compartilhamento com parceiro grava o vínculo
  // com a pasta (partner_shared_folders) em vez de N vínculos de documento — a
  // subárvore inteira aparece no portal e arquivo novo entra sozinho.
  // Cliente/colaborador continuam por documento (não têm árvore de pastas no portal).
  const [shareFolder, setShareFolder] = React.useState<{ id: string; name: string } | null>(null);
  const [selectedShareWorkspaceId, setSelectedShareWorkspaceId] = React.useState('');
  const [sharingSubmitting, setSharingSubmitting] = React.useState(false);
  const [docAlreadySharedWith, setDocAlreadySharedWith] = React.useState<{ partner_workspace_id: string; supplier_name: string; doc_count: number }[]>([]);
  const [unsharingId, setUnsharingId] = React.useState<string | null>(null);

  // Estados locais — Compartilhamento com Portal do Cliente / Portal do Colaborador
  // (GED vira a fonte única desses portais — ver migration 20270821000008)
  const [shareAudience, setShareAudience] = React.useState<'parceiro' | 'cliente' | 'colaborador'>('parceiro');
  const [portalShareClients, setPortalShareClients] = React.useState<{ id: string; name: string }[]>([]);
  const [portalShareEmployees, setPortalShareEmployees] = React.useState<{ id: string; name: string }[]>([]);
  const [selectedShareClientId, setSelectedShareClientId] = React.useState('');
  const [selectedShareEmployeeId, setSelectedShareEmployeeId] = React.useState('');
  const [docAlreadySharedWithPortal, setDocAlreadySharedWithPortal] = React.useState<OpuraPortalShareRecipient[]>([]);

  // Estados locais — Bloqueio para edição (trava)
  const [lockModalDoc, setLockModalDoc] = React.useState<OpuraDocument | null>(null);
  const [lockSubmitting, setLockSubmitting] = React.useState(false);

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
  const [newDocAutor, setNewDocAutor] = React.useState('');
  const [newDocNumeroFornecedor, setNewDocNumeroFornecedor] = React.useState('');
  const [newDocRevisao, setNewDocRevisao] = React.useState('');
  // true = usuário escolheu "Outro" no seletor de Autor/Fornecedor (digita o nome livremente).
  const [newDocAutorOutro, setNewDocAutorOutro] = React.useState(false);
  const [newDocType, setNewDocType] = React.useState('');
  const [newDocDiscipline, setNewDocDiscipline] = React.useState('');
  // Organização escolhida no modal quando o seletor global está em "Todas as
  // Organizações" (activeOrganizationId nulo). Mesmo padrão de createFolderOrgId.
  const [newDocOrgId, setNewDocOrgId] = React.useState('');
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
  //
  // O acesso NÃO pode sair de `currentProfile.role`: esse campo é preenchido por
  // useAuthSync a partir do grupo do gateway de login (enum UserProfile →
  // 'PERFIL_USUARIO', 'DESENVOLVEDOR', ...), e nunca assume 'owner'/'admin'/
  // 'engenheiro'/'financeiro' — o vocabulário que CATEGORIES.roles usa. Com isso
  // canAccessTab reprovava todas as abas e o módulo aparecia vazio para qualquer
  // colaborador que não fosse o dev. A fonte de verdade é a membership na
  // organização ativa: organization_members.role ('owner' | 'admin' | 'member')
  // mais o JSONB de permissões, que é de onde sai a separação por disciplina.
  const isDev = currentProfile?.email?.toLowerCase() === 'altair.rosa@alpaconstrutora.com.br' || currentProfile?.group === 'DESENVOLVEDOR';
  const [memberships, setMemberships] = React.useState<
    { organization_id: string; role: string; permissions: Partial<UserPermissions> }[]
  >([]);
  const [accessLoading, setAccessLoading] = React.useState(true);

  const fetchMemberAccess = async () => {
    if (!currentProfile?.email) {
      setMemberships([]);
      setAccessLoading(false);
      return;
    }
    setAccessLoading(true);
    try {
      setMemberships(await documentService.listMemberships(currentProfile.email));
    } catch (err) {
      console.error('[OpuraDocsModule] Erro ao carregar permissões do membro:', err);
      setMemberships([]);
    } finally {
      setAccessLoading(false);
    }
  };

  React.useEffect(() => {
    fetchMemberAccess();
  }, [currentProfile?.email]);

  // Memberships em jogo: a da org ativa, ou todas em "Todas as Organizações".
  const scopedMemberships = React.useMemo(
    () => (activeOrganizationId
      ? memberships.filter(m => m.organization_id === activeOrganizationId)
      : memberships),
    [memberships, activeOrganizationId]
  );

  // Uma membership libera a categoria? owner/admin veem tudo; para os demais, a
  // disciplina sai do JSONB de permissões — 'engenheiro'/'financeiro' não existem
  // como role no banco (só owner/admin/member). Dados técnicos ↔ acervo de
  // engenharia, financeiro ↔ contratos e NFs.
  const membershipAllows = (
    m: { role: string; permissions: Partial<UserPermissions> },
    cat: typeof CATEGORIES[number]
  ) => {
    if (m.role === 'owner' || m.role === 'admin') return true;
    if (m.permissions.canViewTechnicalData === true && cat.roles.includes('engenheiro')) return true;
    if (m.permissions.canViewFinancial === true && cat.roles.includes('financeiro')) return true;
    return false;
  };

  const isOrgAdmin = isDev || scopedMemberships.some(m => m.role === 'owner' || m.role === 'admin');

  // Verificar permissão sobre a aba ativa
  const canAccessTab = (catId: OpuraDocumentCategoria) => {
    if (isDev) return true;
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return false;
    return scopedMemberships.some(m => membershipAllows(m, cat));
  };

  // Orgs que permitem a categoria — escopo da listagem em "Todas as Organizações".
  // A aba abre se QUALQUER org libera, mas a busca só pode varrer as que liberam:
  // o RLS restringe por organização, não por categoria, então sem este recorte um
  // admin numa org veria os documentos de outra sob a permissão errada.
  const allowedOrgIdsForTab = (catId: OpuraDocumentCategoria): string[] => {
    const cat = CATEGORIES.find(c => c.id === catId);
    if (!cat) return [];
    return scopedMemberships.filter(m => membershipAllows(m, cat)).map(m => m.organization_id);
  };

  // Se o usuário não puder ler a aba ativa default (engenharia), redireciona para a primeira permitida.
  // Só decide depois que a membership chegou — antes disso todo canAccessTab é falso
  // por ausência de dado, não por proibição.
  React.useEffect(() => {
    if (accessLoading) return;
    if (!canAccessTab(activeTab)) {
      const allowed = CATEGORIES.find(c => canAccessTab(c.id));
      if (allowed) setActiveTab(allowed.id);
    }
  }, [accessLoading, scopedMemberships]);

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

  // Árvore de pastas nasce EXPANDIDA. Cada pasta entra em `expandedNodes` uma única
  // vez (o ref registra quem já foi auto-expandida), então recolher uma pasta é uma
  // decisão que sobrevive aos refetches — troca de aba, de obra ou criação de pasta
  // não reabre o que o usuário fechou.
  const autoExpandedFolderIds = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const novos = folders.map(f => f.id).filter(id => !autoExpandedFolderIds.current.has(id));
    if (novos.length === 0) return;
    novos.forEach(id => autoExpandedFolderIds.current.add(id));
    setExpandedNodes(prev => Array.from(new Set([...prev, ...novos])));
  }, [folders]);

  // Carregar lista de documentos
  const fetchDocs = async () => {
    // Espera a membership: sem ela não há como saber quais orgs entram no escopo,
    // e uma busca prematura voltaria vazia e pareceria acervo zerado.
    if (accessLoading) return;
    setLoading(true);
    try {
      const isGlobal = selectedProjectId === 'all';
      const projFilter = isGlobal ? undefined : selectedProjectId;
      // Em "Todas as Organizações" o recorte por org vem das memberships que
      // liberam a aba. O dev não passa escopo: enxerga tudo que o RLS devolver.
      const orgScope = activeOrganizationId || isDev ? undefined : allowedOrgIdsForTab(activeTab);
      const data = await documentService.listDocuments(activeOrganizationId ?? undefined, {
        projectId: projFilter,
        categoria: activeTab,
        folderId: (selectedDisciplineCode && !currentFolderId) || isGlobal ? undefined : currentFolderId,
        organizationIds: orgScope,
      });
      setDocuments(data);
    } catch (err) {
      console.error(err);
      notify('Erro ao carregar os documentos da organização.', 'error');
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

  // Buscar membros da organização ativa (ou da organização do documento aberto,
  // quando o seletor global está em "Todas as organizações")
  const fetchOrgMembers = async (orgId?: string) => {
    const effectiveOrgId = orgId || activeOrganizationId;
    if (!effectiveOrgId) return;
    try {
      const data = await documentService.listOrganizationMembers(effectiveOrgId);
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
      notify('Aprovação solicitada com sucesso!');
      setSelectedApproverEmail('');
      // Atualizar o histórico exibido
      const updatedDoc = await documentService.getDocumentById(selectedDocForVersions.id);
      setSelectedDocForVersions(updatedDoc);
      if (updatedDoc) loadApprovalsForDoc(updatedDoc.id);
      fetchDocs();
    } catch (err: any) {
      notify(err.message || 'Erro ao solicitar aprovação.', 'error');
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
      notify('Documento aprovado com sucesso!');
      fetchPendingApprovals();
      fetchDocs();
    } catch (err: any) {
      notify(err.message || 'Erro ao aprovar documento.', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  // Rejeitar parecer
  const handleRejectAction = async (approvalId: string) => {
    if (!feedbackText.trim()) {
      notify('Por favor, informe a justificativa para a rejeição do documento.', 'error');
      return;
    }
    setProcessingAction(true);
    try {
      await documentService.rejectDocument(approvalId, feedbackText);
      setFeedbackText('');
      setRejectingId(null);
      notify('Documento rejeitado com sucesso!');
      fetchPendingApprovals();
      fetchDocs();
    } catch (err: any) {
      notify(err.message || 'Erro ao rejeitar documento.', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  // Resetar a pasta ativa para a raiz ao mudar de projeto ou categoria
  React.useEffect(() => {
    setCurrentFolderId(null);
    setSelectedDisciplineCode(null);
  }, [selectedProjectId, activeTab]);

  // Zera a seleção de edição em lote sempre que a lista visível muda de contexto
  // (aba, obra ou pasta) — evita editar em lote uma seleção que não é mais a
  // que está na tela.
  React.useEffect(() => {
    setSelectedDocIds(new Set());
    setLastCheckedDocIndex(null);
  }, [activeTab, currentFolderId, selectedProjectId]);

  React.useEffect(() => {
    fetchDocs();
    fetchFolders();
    fetchPendingApprovals();
    fetchOrgMembers();
    fetchDmsSettings();
  }, [activeOrganizationId, selectedProjectId, activeTab, currentFolderId, selectedDisciplineCode, currentProfile, accessLoading, memberships]);

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
              fetchOrgMembers(doc.organization_id);
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
      notify('Sessão expirada ou organização não selecionada.', 'error');
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
      notify(err.message || 'Erro ao criar pasta virtual.', 'error');
    } finally {
      setCreatingFolder(false);
    }
  };

  // Função para excluir uma pasta virtual (cascata no banco)
  const handleDeleteFolder = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir pasta?',
      message: 'Todas as subpastas serão deletadas e os documentos retornarão para o diretório raiz.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await documentService.deleteFolder(id);
      fetchFolders();
      if (currentFolderId === id) {
        setCurrentFolderId(null);
      } else {
        fetchDocs(); // caso tenhamos deletado uma pasta filha
      }
    } catch (err: any) {
      notify(err.message || 'Erro ao excluir pasta virtual.', 'error');
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
      notify('Erro ao atualizar pasta: ' + err.message, 'error');
    }
  };

  // Buscar Ajustes Gerais do GED (Disciplinas e Padrões) com injeção automática de presets
  
    const fetchDmsSettings = async () => {
      try {
        const [discs, pats, docTypes, sups] = await Promise.all([
          documentService.listDisciplines(activeOrganizationId),
          documentService.listNamingPatterns(activeOrganizationId),
          documentService.listDocumentTypes(activeOrganizationId),
          supplierService.listSuppliers(activeOrganizationId || undefined),
        ]);
        setDisciplines(discs);
        setNamingPatterns(pats);
        setDocumentTypes(docTypes);
        setSuppliers(sups);
      } catch (err) {
        console.error('[OpuraDocsModule] Erro ao carregar configurações do GED:', err);
      }
    };


  // Criar nova disciplina
  
    // -- Document Types Handlers --
    const handleCreateDocTypeSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const targetOrgId = activeOrganizationId || settingsOrgId;
      if (!targetOrgId) {
        notify('Selecione uma organização para cadastrar o tipo de documento.', 'error');
        return;
      }
      if (!newDocTypeName) return;
      try {
        await documentService.createDocumentType(targetOrgId, newDocTypeName);
        setNewDocTypeName('');
        fetchDmsSettings();
      } catch (err: any) {
        notify('Erro ao criar tipo de documento: ' + err.message, 'error');
      }
    };

    const handleDeleteDocType = async (id: string) => {
      const ok = await confirm({
        title: 'Excluir Tipo de Documento?',
        message: 'Essa ação não pode ser desfeita.',
        variant: 'danger',
        confirmLabel: 'Excluir',
      });
      if (!ok) return;
      try {
        await documentService.deleteDocumentType(id);
        fetchDmsSettings();
      } catch (err: any) {
        notify('Erro ao excluir tipo de documento: ' + err.message, 'error');
      }
    };

    const handleSaveEditDocType = async (id: string) => {
      try {
        await documentService.updateDocumentType(id, editDocTypeName);
        setEditDocTypeId(null);
        fetchDmsSettings();
      } catch (err: any) {
        notify('Erro ao salvar tipo de documento: ' + err.message, 'error');
      }
    };

    // -- Disciplines Handlers (Edit) --
    const handleSaveEditDiscipline = async (id: string) => {
      try {
        await documentService.updateDiscipline(id, editDiscCode, editDiscName);
        setEditDiscId(null);
        fetchDmsSettings();
      } catch (err: any) {
        notify('Erro ao salvar disciplina: ' + err.message, 'error');
      }
    };

    // -- Patterns Handlers (Edit) --
    const handleSaveEditPattern = async (id: string) => {
      try {
        await documentService.updateNamingPattern(id, editPatternName, editPatternMask);
        setEditPatternId(null);
        fetchDmsSettings();
      } catch (err: any) {
        notify('Erro ao salvar padrão de nomenclatura: ' + err.message, 'error');
      }
    };

    const handleCreateDisciplineSubmit = async (e: React.FormEvent) => {

    e.preventDefault();
    const targetOrgId = activeOrganizationId || settingsOrgId;
    if (!targetOrgId) {
      notify('Selecione uma organização para cadastrar a disciplina.', 'error');
      return;
    }
    if (!newDiscCode || !newDiscName) return;
    try {
      await documentService.createDiscipline(targetOrgId, newDiscCode, newDiscName);
      setNewDiscCode('');
      setNewDiscName('');
      fetchDmsSettings();
    } catch (err: any) {
      notify('Erro ao criar disciplina: ' + err.message, 'error');
    }
  };

  // Excluir disciplina
  const handleDeleteDiscipline = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir disciplina?',
      message: 'As pastas existentes continuarão funcionando, mas novos uploads e pastas não poderão utilizá-la.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await documentService.deleteDiscipline(id);
      fetchDmsSettings();
    } catch (err: any) {
      notify('Erro ao excluir disciplina: ' + err.message, 'error');
    }
  };

  // Criar novo padrão de nomenclatura
  const handleCreateNamingPatternSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetOrgId = activeOrganizationId || settingsOrgId;
    if (!targetOrgId) {
      notify('Selecione uma organização para cadastrar o padrão de nomenclatura.', 'error');
      return;
    }
    if (!newPatName || !newPatMask) return;
    try {
      await documentService.createNamingPattern(targetOrgId, newPatName, newPatMask);
      setNewPatName('');
      setNewPatMask('');
      fetchDmsSettings();
    } catch (err: any) {
      notify('Erro ao criar padrão de nomenclatura: ' + err.message, 'error');
    }
  };

  // Excluir padrão de nomenclatura
  const handleDeleteNamingPattern = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir padrão de nomenclatura?',
      message: 'Essa ação não pode ser desfeita.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await documentService.deleteNamingPattern(id);
      fetchDmsSettings();
    } catch (err: any) {
      notify('Erro ao excluir padrão: ' + err.message, 'error');
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

    // Helper para pegar IDs de toda a árvore de pastas
    const getFolderTreeIds = (rootFolderId: string): string[] => {
      let ids = [rootFolderId];
      const children = folders.filter(f => f.parent_id === rootFolderId);
      for (const child of children) {
        ids = ids.concat(getFolderTreeIds(child.id));
      }
      return ids;
    };

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
            <span className="text-sm truncate">{folder.name}</span>
          </div>

          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 mr-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Os docIds servem ao compartilhamento com cliente/colaborador (que é por
                // documento) e à leitura de "compartilhado com". Para o PARCEIRO, quem vale
                // é a pasta em si — por isso ela vai junto no escopo.
                const treeIds = getFolderTreeIds(folder.id);
                const targetProjectId = selectedProjectId !== 'all' ? selectedProjectId : undefined;
                documentService.listDocuments(activeOrganizationId || undefined, { folderIds: treeIds, projectId: targetProjectId })
                  .then(data => openShareModal(data.map(d => d.id), { id: folder.id, name: folder.name }))
                  .catch(console.error);
              }}
              className="p-1 text-slate-400 hover:text-orange-500 rounded hover:bg-orange-50"
              title="Compartilhar toda a pasta"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
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
                    <span className="text-sm truncate">{disc.name}</span>
                  </div>

                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 mr-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const treeIds = getFolderTreeIds(folder.id);
                        const filterDisc = (docs: OpuraDocument[]) => docs.filter(d =>
                          d.discipline_code
                            ? d.discipline_code.toUpperCase() === disc.code.toUpperCase()
                            : (extractTokenFromFileName(d.nome, folder.naming_mask || '', '[DISCIPLINA]')?.toUpperCase() === disc.code.toUpperCase() || d.nome.toUpperCase().includes(disc.code.toUpperCase()))
                        );
                        const targetProjectId = selectedProjectId !== 'all' ? selectedProjectId : undefined;
                        documentService.listDocuments(activeOrganizationId || undefined, { folderIds: treeIds, projectId: targetProjectId }).then(data => {
                          openShareModal(filterDisc(data).map(d => d.id));
                        }).catch(console.error);
                      }}
                      className="p-1 text-slate-400 hover:text-orange-500 rounded hover:bg-orange-50"
                      title="Compartilhar disciplina"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await confirm({
                          title: `Remover disciplina ${disc.name} da pasta?`,
                          variant: 'warning',
                          confirmLabel: 'Remover',
                        });
                        if (!ok) return;
                        try {
                          const newDisciplines = (folder.disciplines || []).filter(d => d !== disc.code);
                          await documentService.updateFolder(folder.id, { disciplines: newDisciplines });
                          fetchFolders();
                        } catch (err: any) {
                          notify('Erro ao remover disciplina: ' + err.message, 'error');
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
      notify(err.message || 'Erro ao mover documento.', 'error');
    }
  };

  // Fornecedor do documento sendo compartilhado, para priorizar o parceiro correspondente no seletor (Onda 2)
  const shareTargetSupplierId = React.useMemo(
    () => (shareDocIds.length > 0 ? documents.find((d) => d.id === shareDocIds[0])?.supplier_id || null : null),
    [documents, shareDocIds]
  );
  const sortedShareWorkspaces = React.useMemo(() => {
    const recommended = partnerWorkspaces.filter((ws) => shareTargetSupplierId && ws.supplier_id === shareTargetSupplierId);
    const others = partnerWorkspaces
      .filter((ws) => !(shareTargetSupplierId && ws.supplier_id === shareTargetSupplierId))
      .sort((a, b) => (a.supplier_name || '').localeCompare(b.supplier_name || ''));
    return [...recommended, ...others];
  }, [partnerWorkspaces, shareTargetSupplierId]);

  // Abrir modal de compartilhamento em lote ou unitário com parceiro
  const openShareModal = async (docIds: string[], folder?: { id: string; name: string }) => {
    // Pasta vazia continua compartilhável: o vínculo é com a pasta, e os arquivos que
    // chegarem depois entram sozinhos. Sem pasta no escopo, sem documento = nada a fazer.
    if (docIds.length === 0 && !folder) {
      notify('Nenhum documento encontrado nesta pasta/disciplina.', 'error');
      return;
    }
    setShareDocIds(docIds);
    setShareFolder(folder || null);
    setShareAudience('parceiro');
    setSelectedShareWorkspaceId('');
    setSelectedShareClientId('');
    setSelectedShareEmployeeId('');
    setDocAlreadySharedWith([]);
    setDocAlreadySharedWithPortal([]);
    setShareModalOpen(true);

    if (partnerWorkspaces.length === 0) {
      try {
        const wss = await partnerService.listWorkspaces(activeOrganizationId ?? undefined);
        setPartnerWorkspaces(wss.filter((w) => w.is_active));
      } catch (err) {
        console.error('[OpuraDocsModule] Erro ao carregar parceiros habilitados:', err);
      }
    }
    if (portalShareClients.length === 0) {
      clientService.listClients(activeOrganizationId ?? undefined)
        .then((clients: any[]) => setPortalShareClients(clients.map((c) => ({ id: c.id, name: c.name }))))
        .catch((err) => console.error('[OpuraDocsModule] Erro ao carregar clientes:', err));
    }
    if (portalShareEmployees.length === 0) {
      laborService.listEmployees(activeOrganizationId ?? undefined)
        .then((emps: any[]) => setPortalShareEmployees(emps.map((e) => ({ id: e.id, name: e.name }))))
        .catch((err) => console.error('[OpuraDocsModule] Erro ao carregar colaboradores:', err));
    }
    await loadShareRecipients(docIds, folder || null);
  };

  // Carrega para TODOS os documentos do escopo (1 documento, ou N de uma disciplina/pasta),
  // agregando por destinatário — é o que a seção "compartilhado com" exibe nos 3 modos.
  // Quando o escopo é uma pasta, o vínculo de PASTA entra na mesma lista e conta como
  // cobertura total (doc_count = total), porque ele não é parcial por definição: pega a
  // subárvore inteira, hoje e no futuro.
  const loadShareRecipients = async (docIds: string[], folder: { id: string; name: string } | null) => {
    try {
      const [sharings, portalSharings, folderSharings] = await Promise.all([
        partnerService.listSharingsForDocuments(docIds),
        documentService.listPortalSharingsForDocuments(docIds),
        folder ? partnerService.listSharingsForFolder(folder.id) : Promise.resolve([]),
      ]);

      const merged = [...sharings];
      for (const fs of folderSharings) {
        const existing = merged.find((s) => s.partner_workspace_id === fs.partner_workspace_id);
        if (existing) existing.doc_count = docIds.length;
        else merged.push({ ...fs, doc_count: docIds.length });
      }

      setDocAlreadySharedWith(merged);
      setDocAlreadySharedWithPortal(portalSharings);
    } catch (err) {
      console.error('[OpuraDocsModule] Erro ao carregar compartilhamentos existentes do documento:', err);
    }
  };

  // Recarrega a lista "compartilhado com" após uma revogação — mantém o modal aberto.
  const reloadShareRecipients = async () => {
    await loadShareRecipients(shareDocIds, shareFolder);
  };

  // Revogar acesso de um parceiro a todos os documentos do escopo atual.
  const handleUnshareFromPartner = async (workspaceId: string, supplierName: string) => {
    const escopo = shareFolder
      ? `a pasta "${shareFolder.name}" e todo o seu conteúdo`
      : (shareDocIds.length > 1 ? `estes ${shareDocIds.length} documentos` : 'este documento');
    const ok = await confirm({
      title: 'Revogar compartilhamento?',
      message: `${supplierName} deixará de ter acesso a ${escopo} no Portal do Parceiro.`,
      variant: 'danger',
      confirmLabel: 'Revogar',
    });
    if (!ok) return;
    setUnsharingId(workspaceId);
    try {
      // Revoga os dois vínculos: o de pasta e os de documento avulso que possam existir
      // para os mesmos arquivos (inclusive os criados antes de a pasta virar entidade
      // compartilhável) — senão o acesso sobrevive por um caminho e a tela mente.
      if (shareFolder) {
        await partnerService.unshareFolder(workspaceId, shareFolder.id);
      }
      await partnerService.unshareDocumentsBatch(workspaceId, shareDocIds);
      await reloadShareRecipients();
      notify('Acesso revogado.');
    } catch (err: any) {
      notify(err.message || 'Erro ao revogar compartilhamento.', 'error');
    } finally {
      setUnsharingId(null);
    }
  };

  // Revogar acesso de um cliente/colaborador (portal) a todos os documentos do escopo atual.
  const handleUnshareFromPortal = async (recipient: OpuraPortalShareRecipient) => {
    const ok = await confirm({
      title: 'Revogar compartilhamento?',
      message: `${recipient.name} deixará de ver ${shareDocIds.length > 1 ? `estes ${shareDocIds.length} documentos` : 'este documento'} no Portal do ${recipient.audience === 'cliente' ? 'Cliente' : 'Colaborador'}.`,
      variant: 'danger',
      confirmLabel: 'Revogar',
    });
    if (!ok) return;
    setUnsharingId(`${recipient.audience}:${recipient.recipient_id}`);
    try {
      await documentService.unsharePortalDocumentsBatch(
        {
          audience: recipient.audience,
          clientId: recipient.audience === 'cliente' ? recipient.recipient_id : undefined,
          employeeId: recipient.audience === 'colaborador' ? recipient.recipient_id : undefined,
        },
        shareDocIds
      );
      await reloadShareRecipients();
      notify('Acesso revogado.');
    } catch (err: any) {
      notify(err.message || 'Erro ao revogar compartilhamento.', 'error');
    } finally {
      setUnsharingId(null);
    }
  };

  // Compartilhar o documento selecionado com o workspace de parceiro escolhido
  const handleShareWithPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((shareDocIds.length === 0 && !shareFolder) || !selectedShareWorkspaceId) return;
    const chosenWorkspace = partnerWorkspaces.find((w) => w.id === selectedShareWorkspaceId);
    setSharingSubmitting(true);
    try {
      // Escopo PASTA: grava UM vínculo com a pasta. Não expande em N documentos — é
      // justamente isso que faz a subárvore inteira (inclusive pastas vazias) aparecer
      // no portal e o arquivo adicionado depois chegar ao parceiro sozinho.
      if (shareFolder) {
        await partnerService.shareFolder(
          selectedShareWorkspaceId,
          shareFolder.id,
          currentProfile?.email || 'sistema'
        );
      } else {
        await partnerService.shareDocumentsBatch(
          selectedShareWorkspaceId,
          shareDocIds,
          currentProfile?.email || 'sistema'
        );
      }
      setShareModalOpen(false);
      setShareDocIds([]);
      setShareFolder(null);
      notify(
        shareFolder
          ? `Pasta "${shareFolder.name}" compartilhada com ${chosenWorkspace?.supplier_name || 'o parceiro'} — o conteúdo atual e o que for adicionado depois.`
          : `${shareDocIds.length} documento(s) compartilhado(s) com ${chosenWorkspace?.supplier_name || 'o parceiro'} com sucesso.`
      );
    } catch (err: any) {
      if (err?.code === '23505' || /duplicate key/i.test(err?.message || '')) {
        notify('Este documento já está compartilhado com este parceiro.', 'error');
      } else {
        notify(err.message || 'Erro ao compartilhar documento com o parceiro.', 'error');
      }
    } finally {
      setSharingSubmitting(false);
    }
  };

  // Compartilhar o(s) documento(s) selecionado(s) com um cliente ou colaborador — vira
  // visível na aba Documentos do respectivo portal (ver Parte 3 do plano de bloqueio+portais).
  const handleShareWithPortal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shareDocIds.length === 0) return;
    if (shareAudience === 'cliente' && !selectedShareClientId) return;
    if (shareAudience === 'colaborador' && !selectedShareEmployeeId) return;

    setSharingSubmitting(true);
    try {
      await documentService.sharePortalDocumentsBatch(
        shareDocIds,
        {
          audience: shareAudience as 'cliente' | 'colaborador',
          clientId: selectedShareClientId || undefined,
          employeeId: selectedShareEmployeeId || undefined,
        },
        currentProfile?.email || 'sistema'
      );
      setShareModalOpen(false);
      setShareDocIds([]);
      setShareFolder(null);
      const targetName = shareAudience === 'cliente'
        ? portalShareClients.find((c) => c.id === selectedShareClientId)?.name
        : portalShareEmployees.find((e) => e.id === selectedShareEmployeeId)?.name;
      notify(`${shareDocIds.length} documento(s) compartilhado(s) com ${targetName || 'o portal'} com sucesso.`);
    } catch (err: any) {
      notify(err.message || 'Erro ao compartilhar documento com o portal.', 'error');
    } finally {
      setSharingSubmitting(false);
    }
  };

  // Só obras — ver utils/projectClassification.ts
  const obras = React.useMemo(() => {
    if (!projects || !Array.isArray(projects)) return [];
    // isObra + projeto de sistema já filtrado no store (utils/systemProjects.ts)
    return projects.filter(isObra);
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
      const uppercaseCode = selectedDisciplineCode.toUpperCase();
      result = result.filter(doc => {
        if (doc.discipline_code) {
          return doc.discipline_code.toUpperCase() === uppercaseCode;
        }

        // Fallback p/ documentos sem o campo estruturado ainda (legado, ver
        // project_opura_docs_avaliacao — disciplina era só regex no nome do arquivo).
        const docFolder = folders.find(f => f.id === doc.folder_id);
        const cleanFileName = doc.nome;

        let isMatch = false;
        if (docFolder?.naming_mask) {
          const extracted = extractTokenFromFileName(cleanFileName, docFolder.naming_mask, '[DISCIPLINA]');
          if (extracted) {
            isMatch = extracted.toUpperCase() === uppercaseCode;
          }
        }

        if (!isMatch) {
          isMatch = cleanFileName.toUpperCase().includes(uppercaseCode);
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
  
  // Colunas extraídas do nome do arquivo via máscara da pasta (OBRA/DISCIPLINA/NUMERO/REVISAO).
  // Não-ordenáveis por decisão (§6.3 do guia): dependem de regex sobre o storage_path da versão ativa,
  // não de uma coluna real no banco — não há campo estável para o comparador de sort usar.
  const dynamicColumns = React.useMemo(() => {
    if (!activeFolder?.naming_mask) return [];
    return activeFolder.naming_mask.split(/[-_]+/).filter(Boolean);
  }, [activeFolder?.naming_mask]);

  // Rótulo de exibição (sentence case) para colunas dinâmicas — `dynamicColumns` guarda o
  // token bruto da máscara (ex: "[OBRA{3}]") porque é isso que o corpo da tabela usa para
  // casar com `col.toUpperCase().includes(...)"; aqui só traduzimos para o cabeçalho (§6.2).
  const getDynamicColumnLabel = (col: string): string => {
    const upper = col.toUpperCase();
    if (upper.includes('OBRA')) return 'Obra';
    if (upper.includes('DISCIPLINA')) return 'Disciplina';
    if (upper.includes('NUMERO')) return 'Número';
    if (upper.includes('REVISAO')) return 'Revisão';
    return col;
  };

  // As colunas dinâmicas (token bruto da máscara, ex: "[OBRA{3}]") não existiam quando
  // `useTableColumns(COLUMNS, ...)` foi inicializado (COLUMNS é fixo) e mudam por pasta —
  // por isso ficam num estado próprio, não persistido, em vez de dentro de
  // `tableColumns.visibleColumns`. Mesclado com `tableColumns` abaixo para o botão
  // "Configurar Colunas" (§ColumnConfigButton) listar e controlar todas as colunas juntas.
  const [hiddenDynamicColumns, setHiddenDynamicColumns] = React.useState<Set<string>>(new Set());

  const visibleDynamicColumns = React.useMemo(
    () => dynamicColumns.filter(col => !hiddenDynamicColumns.has(col)),
    [dynamicColumns, hiddenDynamicColumns]
  );

  const allColumnConfigsForConfig: ColumnConfig[] = React.useMemo(
    () => [
      ...COLUMNS.filter(c => c.key !== 'actions'),
      ...dynamicColumns.map(col => ({ key: col, label: getDynamicColumnLabel(col), sortable: false })),
    ],
    [dynamicColumns]
  );

  const mergedVisibleColumnsForConfig = React.useMemo(
    () => [...tableColumns.visibleColumns, ...visibleDynamicColumns],
    [tableColumns.visibleColumns, visibleDynamicColumns]
  );

  const handleToggleAnyColumn = (colKey: string) => {
    if (dynamicColumns.includes(colKey)) {
      setHiddenDynamicColumns(prev => {
        const next = new Set(prev);
        if (next.has(colKey)) next.delete(colKey);
        else next.add(colKey);
        return next;
      });
    } else {
      tableColumns.toggleColumn(colKey);
    }
  };

  // "Restaurar Padrão" restaura a preferência SALVA pelo usuário (se existir) — não o
  // default de fábrica. Uma vez que existe "Salvar como padrão", "padrão" passa a
  // significar o que o usuário salvou; só cai no default de fábrica (todas as colunas)
  // quando não há nada salvo ainda.
  const handleResetAnyColumn = () => {
    if (savedColumnPref) {
      applyColumnPreference(savedColumnPref);
    } else {
      tableColumns.resetColumns();
      setHiddenDynamicColumns(new Set());
    }
  };

  // ─── Preferência de colunas por usuário (banco, entre dispositivos) ─────────
  const [savedColumnPref, setSavedColumnPref] = React.useState<TableColumnPreference | null>(null);
  const [savingColumnPrefs, setSavingColumnPrefs] = React.useState(false);

  // Aplica uma preferência (salva ou recém-carregada) ao estado de colunas estáticas +
  // dinâmicas — usado tanto no carregamento inicial quanto em "Restaurar Padrão".
  const applyColumnPreference = (pref: TableColumnPreference) => {
    const staticKeys = new Set(COLUMNS.map(c => c.key));
    tableColumns.setVisibleColumns(pref.visibleColumns.filter(k => staticKeys.has(k)));
    if (pref.sortColumn) tableColumns.setSortColumn(pref.sortColumn);
    tableColumns.setSortDirection(pref.sortDirection);
    setHiddenDynamicColumns(new Set(dynamicColumns.filter(col => !pref.visibleColumns.includes(col))));
  };

  // Busca uma vez por usuário logado — se existir, sobrepõe o default/localStorage
  // nas colunas estáticas. Não bloqueia a tela: roda em paralelo, sem gate em fetchDocs.
  React.useEffect(() => {
    if (!currentProfile?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const pref = await tableColumnPreferencesService.get(currentProfile.email!, 'opuraDocsColumns');
        if (cancelled || !pref) return;
        applyColumnPreference(pref);
        setSavedColumnPref(pref);
      } catch (err) {
        console.error('[OpuraDocsModule] Erro ao carregar preferência de colunas:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile?.email]);

  // Recalcula as colunas dinâmicas ocultas a partir da preferência salva toda vez que
  // a pasta muda (mask diferente) — uma coluna dinâmica escondida na preferência
  // continua escondida em qualquer pasta que tenha um token com o mesmo nome.
  React.useEffect(() => {
    if (!savedColumnPref) return;
    setHiddenDynamicColumns(new Set(dynamicColumns.filter(col => !savedColumnPref.visibleColumns.includes(col))));
  }, [savedColumnPref, dynamicColumns]);

  const handleSaveColumnPreference = async () => {
    if (!currentProfile?.email) {
      notify('Não foi possível identificar o usuário para salvar a preferência.', 'error');
      return;
    }
    setSavingColumnPrefs(true);
    try {
      const pref: TableColumnPreference = {
        visibleColumns: mergedVisibleColumnsForConfig,
        sortColumn: tableColumns.sortColumn,
        sortDirection: tableColumns.sortDirection,
      };
      await tableColumnPreferencesService.save(currentProfile.email, 'opuraDocsColumns', pref);
      setSavedColumnPref(pref);
      notify('Preferência de colunas salva.');
    } catch (err: any) {
      notify('Erro ao salvar preferência de colunas: ' + err.message, 'error');
    } finally {
      setSavingColumnPrefs(false);
    }
  };

  // Coletar tags únicas dos documentos carregados para filtragem rápida
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
    const ok = await confirm({
      title: 'Excluir documento?',
      message: 'Todas as versões físicas também serão deletadas. Essa ação não pode ser desfeita.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await documentService.deleteDocument(id, activeOrganizationId || '');
      setDocuments(prev => prev.filter(d => d.id !== id));
      if (selectedDocForVersions?.id === id) setSelectedDocForVersions(null);
    } catch (err: any) {
      notify(err.message || 'Erro ao deletar documento.', 'error');
    }
  };

  const executeUpload = async (docTitle: string, fileToUpload: File) => {
    const targetOrgId = activeOrganizationId || newDocOrgId;
    if (!targetOrgId) {
      notify('Selecione uma organização para o documento.', 'error');
      return;
    }

    setUploading(true);
    // Validar tipo de arquivo
    const allowedExtensions = ['pdf', 'docx', 'xlsx', 'dwg', 'jpg', 'png'];
    const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.includes(fileExt)) {
      notify('Formato de arquivo não permitido. Use: PDF, DOCX, XLSX, DWG, JPG ou PNG.', 'error');
      setUploading(false);
      return;
    }

    // Validar tamanho (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (fileToUpload.size > maxSize) {
      notify('O arquivo excede o limite máximo permitido de 50MB.', 'error');
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
          organization_id: targetOrgId,
          nome: docTitle || fileToUpload.name,
          descricao: newDocDesc || undefined,
            autor: newDocAutor || undefined,
          numero_documento_fornecedor: newDocNumeroFornecedor || undefined,
          revisao: newDocRevisao || undefined,
          categoria: newDocCategory,
          tipo_documento: newDocType,
          discipline_code: newDocDiscipline || undefined,
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
      setNewDocAutor('');
      setNewDocNumeroFornecedor('');
      setNewDocRevisao('');
      setNewDocAutorOutro(false);
      setNewDocType('');
      setNewDocDiscipline('');
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
      setNewDocOrgId('');

      setUploadModalOpen(false);
      fetchDocs();
    } catch (err: any) {
      notify(err.message || 'Erro ao submeter documento.', 'error');
    } finally {
      setUploading(false);
    }
  };

  // Submeter Upload de Novo Documento
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganizationId && !newDocOrgId) {
      notify('Selecione uma organização para o documento.', 'error');
      return;
    }
    if (!newDocFile) {
      notify('Selecione um arquivo para upload.', 'error');
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
        if (targetFolder.disciplines && targetFolder.disciplines.length > 0 && newDocDiscipline) {
          const isAllowed = targetFolder.disciplines.some(d => d.toUpperCase() === newDocDiscipline.toUpperCase());
          if (!isAllowed) {
            notify(`A disciplina selecionada ("${newDocDiscipline}") não é permitida nesta pasta virtual.\n\nDisciplinas permitidas: ${targetFolder.disciplines.join(', ')}`, 'error');
            return;
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
      notify(`O nome gerado ("${newDocNameFromMask}") não atende ao padrão exigido nesta pasta:\n"${renameTargetMask}"\n\nVerifique se preencheu a quantidade correta de dígitos para as tags configuradas (ex: 3 caracteres).`, 'error');
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
    if (isLockedByOther(selectedDocForVersions)) {
      notify(`Documento bloqueado para edição por ${selectedDocForVersions.locked_by_name || selectedDocForVersions.locked_by}.`, 'error');
      return;
    }

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
      notify(err.message || 'Erro ao subir nova versão.', 'error');
    } finally {
      setUploadingVersion(false);
    }
  };

  // Bloquear/Desbloquear documento para edição (trava real — ver migration 20270821000007)
  const currentUserDisplayName = orgMembers.find(m => m.email === currentProfile?.email)?.name || currentProfile?.email || 'Usuário';

  const handleConfirmLockDoc = async () => {
    if (!lockModalDoc || !currentProfile?.email) return;
    setLockSubmitting(true);
    try {
      await documentService.lockDocument(lockModalDoc.id, currentProfile.email, currentUserDisplayName);
      notify('Documento bloqueado para edição.');
      setLockModalDoc(null);
      fetchDocs();
      if (selectedDocForVersions?.id === lockModalDoc.id) {
        const updatedDoc = await documentService.getDocumentById(lockModalDoc.id);
        setSelectedDocForVersions(updatedDoc);
      }
    } catch (err: any) {
      notify(err.message || 'Erro ao bloquear documento.', 'error');
    } finally {
      setLockSubmitting(false);
    }
  };

  const handleUnlockDoc = async (doc: OpuraDocument) => {
    if (!currentProfile?.email) return;
    const ok = await confirm({
      title: 'Desbloquear documento',
      message: `Desbloquear "${doc.nome}"? Outros usuários voltarão a poder editá-lo.`,
      variant: 'warning',
      confirmLabel: 'Desbloquear',
    });
    if (!ok) return;
    try {
      await documentService.unlockDocument(doc.id, currentProfile.email, isOrgAdmin);
      notify('Documento desbloqueado.');
      fetchDocs();
      if (selectedDocForVersions?.id === doc.id) {
        const updatedDoc = await documentService.getDocumentById(doc.id);
        setSelectedDocForVersions(updatedDoc);
      }
    } catch (err: any) {
      notify(err.message || 'Erro ao desbloquear documento.', 'error');
    }
  };

  // true quando o usuário atual NÃO pode editar/subir versão porque outra pessoa detém o lock
  const isLockedByOther = (doc: OpuraDocument | null | undefined): boolean =>
    !!doc?.locked_by && doc.locked_by !== currentProfile?.email && !isOrgAdmin;

  // Documento integrado (Contrato/NF/etc, sem linha própria em opura_documents) ou
  // travado por outra pessoa não entra na edição em lote — mesma regra do "Editar" unitário.
  const isDocSelectableForBatch = (doc: OpuraDocument): boolean =>
    !doc.is_integrated && !isLockedByOther(doc);

  // Seleção com intervalo via Shift+clique — mesmo padrão do §10.1 do guia de UI.
  const handleToggleDocRow = (doc: OpuraDocument, index: number, shiftKey: boolean) => {
    if (shiftKey && lastCheckedDocIndex !== null) {
      const [start, end] = lastCheckedDocIndex < index ? [lastCheckedDocIndex, index] : [index, lastCheckedDocIndex];
      const rangeIds = filteredDocuments
        .slice(start, end + 1)
        .filter(isDocSelectableForBatch)
        .map((d) => d.id);
      setSelectedDocIds((prev) => new Set([...prev, ...rangeIds]));
    } else {
      setSelectedDocIds((prev) => {
        const next = new Set(prev);
        if (next.has(doc.id)) next.delete(doc.id);
        else next.add(doc.id);
        return next;
      });
      setLastCheckedDocIndex(index);
    }
  };

  const selectableFilteredDocuments = React.useMemo(
    () => filteredDocuments.filter(isDocSelectableForBatch),
    [filteredDocuments]
  );

  const allDocsSelected =
    selectableFilteredDocuments.length > 0 &&
    selectableFilteredDocuments.every((d) => selectedDocIds.has(d.id));

  const handleToggleAllDocs = () => {
    setSelectedDocIds((prev) => {
      if (allDocsSelected) return new Set();
      return new Set(selectableFilteredDocuments.map((d) => d.id));
    });
  };

  const selectedDocsForBatchEdit = React.useMemo(
    () => filteredDocuments.filter((d) => selectedDocIds.has(d.id)),
    [filteredDocuments, selectedDocIds]
  );

  // Iniciar Edição do Documento
  const handleStartEditDoc = (doc: OpuraDocument) => {
    if (isLockedByOther(doc)) {
      notify(`Documento bloqueado para edição por ${doc.locked_by_name || doc.locked_by} (V${doc.locked_version}).`, 'error');
      return;
    }
    setEditingDoc(doc);
    setEditDocName(doc.nome);
    
    // Check if the document belongs to a folder with a naming mask.
    // Fallback para activeFolder: em "Todos os Empreendimentos" a lista não filtra por
    // pasta (fetchDocs manda folderId undefined), então documentos de pastas reais
    // diferentes aparecem juntos — mas a tabela já extrai OBRA/DISCIPLINA/NUMERO/REVISAO
    // usando a máscara da pasta "ativa" na árvore. Sem este fallback, o modal de edição
    // não achava a pasta real do documento e caía no campo de nome livre.
    const docFolder = folders.find(f => f.id === doc.folder_id) || activeFolder;
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
    setEditDocAutor(doc.autor || '');
    setEditDocNumeroFornecedor(doc.numero_documento_fornecedor || '');
    setEditDocRevisao(doc.revisao || '');
    // supplier_id vinculado → seletor mostra o fornecedor. Sem supplier_id mas com texto
    // livre em autor (documentos criados antes deste campo existir) → cai em "Outro",
    // preservando o texto já digitado.
    setEditDocSupplierId(doc.supplier_id || '');
    setEditDocAutorOutro(!doc.supplier_id && !!doc.autor);
    setEditDocEmissao(doc.data_emissao ? doc.data_emissao.split('T')[0] : '');
    setEditDocValidade(doc.data_validade ? doc.data_validade.split('T')[0] : '');
    setEditDocAlertaDias(doc.alerta_dias_antecedencia || 30);
    setEditDocTagsInput(doc.tags ? doc.tags.join(', ') : '');
    setEditDocStatus(doc.status as any || 'ativo');
    setEditDocProjectId(doc.project_id || '');
    setEditDocCompanyId(doc.company_id || '');
    setEditDocType(doc.tipo_documento || '');
    setEditDocDiscipline(doc.discipline_code || '');
    // Pré-seleciona a extensão atual quando ela está na lista aceita; caso
    // contrário deixa em "manter atual" para não forçar uma troca.
    const currentExt = (doc.active_version?.storage_path.split('.').pop() || '').toLowerCase();
    setEditDocExtensao(
      EXTENSAO_OPTIONS.some((o) => o.value === currentExt) ? (currentExt as typeof editDocExtensao) : ''
    );
  };

  // Submeter Edição do Documento
  const handleEditDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    
    // Obter o nome final (seja da máscara ou do input livre)
    // Fallback para activeFolder: mesma justificativa de handleStartEditDoc — em
    // "Todos os Empreendimentos" o doc pode não ter sua pasta real em `folders`/com máscara.
    let finalDocName = editDocName;
    const docFolder = folders.find(f => f.id === editingDoc.folder_id) || activeFolder;
    if (docFolder && docFolder.naming_mask) {
      // Usar a mesma lógica de geração de arquivo e remover a extensão '.pdf' dummy
      const generatedName = generateFileNameFromMask(docFolder.naming_mask, editDocTokens, 'pdf');
      finalDocName = generatedName.split('.').slice(0, -1).join('.');
    }

    // Se houver uma máscara de nomenclatura em vigor (da pasta real ou da pasta ativa), validar contra o novo nome
    const currentExt = editingDoc.active_version?.storage_path.split('.').pop()?.toLowerCase() || 'pdf';
    const finalExt = editDocExtensao || currentExt;
    if (docFolder?.naming_mask) {
      const dummyFileName = `${finalDocName}.${finalExt}`;
      if (!validateFileNameAgainstMask(dummyFileName, docFolder.naming_mask)) {
        notify(`O nome gerado ("${finalDocName}") não atende ao padrão exigido nesta pasta:\n"${docFolder.naming_mask}"\n\nPor favor, verifique se a quantidade de letras ou dígitos informada está correta.`, 'error');
        return;
      }
    }

    // Validação adicional de Disciplinas permitidas na pasta
    if (docFolder?.disciplines && docFolder.disciplines.length > 0 && editDocDiscipline) {
      const isAllowed = docFolder.disciplines.some(d => d.toUpperCase() === editDocDiscipline.toUpperCase());
      if (!isAllowed) {
        notify(`A disciplina selecionada ("${editDocDiscipline}") não é permitida nesta pasta virtual.\n\nDisciplinas permitidas: ${docFolder.disciplines.join(', ')}`, 'error');
        return;
      }
    }

    try {
      const tags = editDocTagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      await documentService.updateDocument(editingDoc.id, {
        nome: finalDocName,
        descricao: editDocDesc || null,
        autor: editDocAutor || null,
        numero_documento_fornecedor: editDocNumeroFornecedor || null,
        revisao: editDocRevisao || null,
        supplier_id: editDocSupplierId || null,
        data_emissao: editDocEmissao || null,
        data_validade: editDocValidade || null,
        alerta_dias_antecedencia: editDocAlertaDias,
        tags,
        status: editDocStatus as any,
        project_id: editDocProjectId || null,
        company_id: editDocCompanyId || null,
        tipo_documento: editDocType || null,
        discipline_code: editDocDiscipline || null,
      } as any);

      // Extensão troca o ARQUIVO no Storage (não é metadado) — só quando mudou de
      // fato em relação à versão ativa.
      if (editDocExtensao && editDocExtensao !== currentExt) {
        await documentService.renameActiveVersionExtension(editingDoc, editDocExtensao);
      }

      if (activeOrganizationId && currentProfile?.email) {
        await documentService.logDocumentAction(
          activeOrganizationId,
          editingDoc.id,
          currentProfile.email,
          'status_alterado',
          `Metadados atualizados: nome="${finalDocName}"${editDocExtensao && editDocExtensao !== currentExt ? `, extensão="${currentExt} → ${editDocExtensao}"` : ''}`
        ).catch(err => console.error('[OpuraDocsModule] Erro ao registrar log de alteração:', err));
      }

      setEditingDoc(null);
      fetchDocs();
    } catch (err: any) {
      notify('Erro ao atualizar metadados: ' + err.message, 'error');
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
      notify('Erro ao gerar link de download seguro: ' + err.message, 'error');
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

  return (
    <div className="space-y-6">
      {/* ─── TÍTULO (§1: h1 solto, nunca dentro de card/hero) ─── */}
      <div className="flex items-center gap-2">
        <span className="p-2 bg-blue-50 text-blue-600 rounded-[10px]">
          <FolderOpen className="w-6 h-6" />
        </span>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gestão de Documentos</h1>
          <p className="text-slate-400 text-sm mt-1.5 font-medium">
            Governança e centralização de documentos integrados ao ecossistema ÒPURA.
          </p>
        </div>
      </div>

      {/* ─── TOOLBAR DE ABAS (§3) — card branco + trilho bg-gray-50, flex-wrap (nunca overflow-x-auto) ─── */}
      <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
        <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
          {CATEGORIES.map((cat) => {
            const isAllowed = canAccessTab(cat.id);
            if (!isAllowed) return null; // Esconde abas proibidas pelo controle de acesso (Feature 3)

            const isActive = activeTab === cat.id && !showMetrics;
            return (
              <button
                key={cat.id}
                onClick={() => { setActiveTab(cat.id); setShowMetrics(false); }}
                className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
                  isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                {cat.label}
              </button>
            );
          })}

          <button
            onClick={() => { setShowMetrics(true); setShowPendingOnly(false); }}
            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all ${
              showMetrics ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            📊 Saúde Documental
          </button>

          {isOrgAdmin && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all text-gray-700 hover:text-gray-900 flex items-center gap-1.5"
            >
              ⚙️ Ajustes do GED
            </button>
          )}
        </div>

        {pendingApprovals.length > 0 && (
          <button
            onClick={() => setShowPendingOnly(!showPendingOnly)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-[6px] text-sm font-medium transition-all border shrink-0 ${
              showPendingOnly
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 animate-pulse'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Pendências ({pendingApprovals.length})
          </button>
        )}
      </div>

      {/* ─── TOOLBAR DE BOTÕES (§4) — escopo (Empreendimento/Obra) à esquerda, ação primária à direita ─── */}
      <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="appearance-none h-9 pl-9 pr-9 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
            >
              <option value="all">🏢 Todos os Empreendimentos</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  🚧 {o.name}
                </option>
              ))}
            </select>
            <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Botões de Ações (Nova Pasta e Novo Documento) */}
        {canAccessTab(activeTab) && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setCreateFolderModalOpen(true)}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
            >
              <FolderPlus className="w-[15px] h-[15px] text-blue-600" />
              Nova pasta
            </button>
            {/* Upload em lote — mesmo racional de "Nova pasta"/"Novo documento" abaixo:
                em "Todas as Organizações" o próprio Sheet mostra o seletor de organização,
                então o botão nunca fica desabilitado (REGRA #5). */}
            <button
              onClick={() => setBatchUploadOpen(true)}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
            >
              <UploadCloud className="w-[15px] h-[15px] text-blue-600" />
              Upload em lote
            </button>
            {/* Em "Todas as Organizações" (activeOrganizationId nulo) o botão
                continua ativo: o próprio modal mostra um seletor de organização
                (igual ao "Nova pasta"), então dá pra criar sem trocar o seletor
                global antes. REGRA #5: leitura/criação nunca fica bloqueada. */}
            <button
              onClick={() => {
                setNewDocCategory(activeTab);
                setNewDocOrgId('');
                setUploadModalOpen(true);
              }}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
            >
              <Plus className="w-[15px] h-[15px]" />
              Novo documento
            </button>
          </div>
        )}
      </div>

      {/* ─── FILTROS DE BUSCA E LISTAGEM ─── */}
      {showMetrics ? (
        // PENDÊNCIA DOCUMENTADA (fora de escopo desta correção, por decisão explícita): este bloco
        // "Saúde Documental" ainda usa a escala de radius antiga (rounded-3xl) e o badge em pílula
        // (rounded-full+uppercase, §8) que o guia bane. Fica para uma tarefa própria.
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
                <span className="text-sm font-normal text-red-600">
                  Crítico
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
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* PAINEL LATERAL ESQUERDO: Árvore de Disciplinas/Pastas */}
          <div className="lg:col-span-1 bg-white rounded-[10px] border border-slate-100 shadow-sm p-5 space-y-4 min-h-[600px] flex flex-col">
            {/* Header com Atalho de Gestão de Disciplinas */}
            <div className="flex border-b border-slate-100 pb-2 px-2 items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Pastas e disciplinas</span>
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
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
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
                className={`w-full flex items-center gap-2 p-2 rounded-[6px] text-left text-sm font-medium transition-all ${
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
          <div className="lg:col-span-4 bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        {/* Barra de Busca e Toolbar (Variante desaninhada) */}
        <div className="p-2 border-b border-gray-100 bg-white space-y-3">
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
              onClick={() => { fetchDocs(); fetchFolders(); }}
              disabled={loading}
              title="Atualizar"
              className="h-9 w-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-[6px] hover:bg-blue-600 hover:text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
                columns={allColumnConfigsForConfig}
                visibleColumns={mergedVisibleColumnsForConfig}
                showColumnConfig={tableColumns.showColumnConfig}
                onToggleShow={() => tableColumns.setShowColumnConfig(!tableColumns.showColumnConfig)}
                onToggleColumn={handleToggleAnyColumn}
                onReset={handleResetAnyColumn}
                onSaveDefault={handleSaveColumnPreference}
                savingDefault={savingColumnPrefs}
              />
              {/* Autofit sob comando explícito — nunca automático (§6.1.2 do guia). */}
              <button
                onClick={() => gedDocCols.autoFit()}
                className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                title="Ajustar largura das colunas ao conteúdo"
              >
                <MoveHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Painel de Filtros Avançados */}
          {showAdvancedFilters && (
            <div className="p-5 bg-white border border-slate-200/80 rounded-[10px] space-y-4 animate-in slide-in-from-top duration-200">
              
              {/* Filtro por Status da Validade */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500">Status de validade</label>
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
                      className={`px-4 py-2 rounded-[6px] text-xs font-black uppercase tracking-wider transition-all ${
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
                  <label className="text-xs font-semibold text-slate-500 flex items-center justify-between">
                    <span>Filtrar por tags</span>
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
        {loading || accessLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-500">Carregando...</p>
          </div>
        ) : !CATEGORIES.some(c => canAccessTab(c.id)) ? (
          /* Sem nenhuma categoria liberada: antes a tela ficava muda (todas as abas
             viravam null) e parecia um acervo vazio, não uma restrição de acesso.
             Cobre também quem não é membro de organização alguma — caso em que o
             módulo antes pedia "selecione uma organização" e nunca saía disso. */
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="p-4 bg-slate-50 text-slate-400 rounded-full">
              <Lock className="w-12 h-12" />
            </div>
            <div>
              <h3 className="font-bold text-slate-700">Sem acesso ao acervo de documentos</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-sm">
                Seu usuário não tem permissão para nenhuma categoria de documentos. Peça a um
                administrador para liberar dados técnicos ou financeiros no seu perfil de acesso.
              </p>
            </div>
          </div>
        ) : showPendingOnly ? (
          /* Painel de Pendências de Aprovação (Onda 2) */
          <div className="p-6 space-y-4 bg-slate-50/50">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-xs">
                  Aprovações sob sua responsabilidade
                </h3>
              </div>
              <button
                onClick={() => setShowPendingOnly(false)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Voltar ao acervo
              </button>
            </div>

            {pendingApprovals.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 font-medium bg-white border border-slate-100 rounded-[10px]">
                Você não possui pendências de aprovação de documentos atribuídas a você.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-[10px] bg-white overflow-hidden shadow-sm">
                {pendingApprovals.map((app) => (
                  <div key={app.id} className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-500" />
                        <span className="font-bold text-slate-800">{app.document?.nome || 'Documento sem nome'}</span>
                        <span className="text-xs font-medium text-slate-500">
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
                            className="w-full px-3 py-2 border border-slate-200 rounded-[6px] text-form-input font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50"
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
                              className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-medium rounded-[6px] hover:bg-slate-50"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => approvingId === app.id ? handleApproveAction(app.id) : handleRejectAction(app.id)}
                              disabled={processingAction || (rejectingId === app.id && !feedbackText.trim())}
                              className={`px-4 py-1.5 text-white text-xs font-medium rounded-[6px] disabled:opacity-50 ${
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
                              className="px-3.5 py-2 border border-slate-200 text-slate-600 hover:text-blue-600 rounded-[6px] text-sm font-medium bg-white active:scale-95 transition-all shadow-sm"
                              title="Visualizar arquivo"
                            >
                              Visualizar
                            </button>
                          )}
                          <button
                            onClick={() => setRejectingId(app.id)}
                            className="px-3.5 py-2 border border-rose-100 text-rose-600 hover:bg-rose-50 rounded-[6px] text-sm font-medium active:scale-95 transition-all"
                          >
                            Rejeitar
                          </button>
                          <button
                            onClick={() => setApprovingId(app.id)}
                            className="px-3.5 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-[6px] text-sm font-medium active:scale-95 transition-all"
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
            {/* §6.5 do guia: cabeçalho fixo (sticky) ainda não implementado aqui — pendência
                documentada, não decisão fechada. Candidata legítima (acervo pode crescer bastante),
                mas fica para uma tarefa própria em vez de decidir ad-hoc nesta correção. */}
            <DocumentsTable
              documents={filteredDocuments}
              tableColumns={tableColumns}
              cols={gedDocCols}
              selectable={canAccessTab(activeTab)}
              selectedIds={selectedDocIds}
              isRowSelectable={isDocSelectableForBatch}
              onToggleRow={handleToggleDocRow}
              allSelectableSelected={allDocsSelected}
              onToggleAll={handleToggleAllDocs}
              showValidade={activeTab !== 'engenharia'}
              resolveProjectName={(doc) => doc.project_id ? (projects.find(p => p.id === doc.project_id)?.name || 'Vínculo Externo') : '-'}
              dynamicColumns={visibleDynamicColumns}
              getDynamicColumnLabel={getDynamicColumnLabel}
              getDynamicCellValue={(doc, col) => {
                // Usa o código exibido (doc.nome), não o nome físico no Storage: eles podem
                // divergir quando o documento é renomeado depois do upload (edição de metadados
                // não renomeia o arquivo no Storage) ou quando veio de import legado.
                const cleanFileName = doc.nome;
                if (col.toUpperCase().includes('OBRA')) return extractTokenFromFileName(cleanFileName, activeFolder!.naming_mask!, '[OBRA]') || '-';
                if (col.toUpperCase().includes('DISCIPLINA')) return extractTokenFromFileName(cleanFileName, activeFolder!.naming_mask!, '[DISCIPLINA]') || '-';
                if (col.toUpperCase().includes('NUMERO')) return extractTokenFromFileName(cleanFileName, activeFolder!.naming_mask!, '[NUMERO]') || '-';
                if (col.toUpperCase().includes('REVISAO')) return extractTokenFromFileName(cleanFileName, activeFolder!.naming_mask!, '[REVISAO]') || '-';
                return '-';
              }}
              onRowClick={async (doc) => {
                const fullDoc = await documentService.getDocumentById(doc.id);
                if (!fullDoc) return;
                setSelectedDocForVersions(fullDoc); loadApprovalsForDoc(fullDoc.id); loadAuditLogsForDoc(fullDoc.id); fetchOrgMembers(fullDoc.organization_id);
              }}
              emptyState={
                folders.filter(f => (f.parent_id || null) === (currentFolderId || null)).length === 0 ? (
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
                )
              }
              renderActions={(doc) => (
                <>
                  {doc.active_version && (
                    <ActionIconButton kind="download" onClick={() => handleDownload(doc.active_version!.storage_path, doc.nome, doc.id)} />
                  )}
                  {!doc.is_integrated && (
                    <>
                      {/* Sempre visíveis: Editar + (Download acima) */}
                      <ActionIconButton
                        kind="settings"
                        onClick={() => handleStartEditDoc(doc)}
                        disabled={isLockedByOther(doc)}
                        title={isLockedByOther(doc) ? `Bloqueado por ${doc.locked_by_name || doc.locked_by}` : undefined}
                      />
                      {/* Bloqueio para edição: informa quem está editando e trava edição/nova versão para os demais */}
                      {doc.locked_by ? (
                        <ActionIconButton
                          kind="unlock"
                          disabled={isLockedByOther(doc)}
                          title={isLockedByOther(doc) ? `Bloqueado por ${doc.locked_by_name || doc.locked_by} — apenas quem bloqueou ou um admin pode desbloquear` : 'Desbloquear'}
                          onClick={() => handleUnlockDoc(doc)}
                        />
                      ) : (
                        <ActionIconButton kind="lock" onClick={() => setLockModalDoc(doc)} />
                      )}
                      {/* Ações secundárias — bandeja horizontal (abre para a esquerda) */}
                      <InlineActionTray>
                        {isOrgAdmin && !doc.is_integrated && (
                          <ActionIconButton kind="move" onClick={() => { setMovingDocId(doc.id); setTargetFolderId(doc.folder_id || null); setMoveModalOpen(true); }} />
                        )}
                        <ActionIconButton kind="qrcode" onClick={() => setSelectedDocForQrCode(doc)} />
                        {doc.active_version && (doc.active_version.mime_type === 'application/pdf' || doc.nome.toLowerCase().endsWith('.pdf')) && (
                          <ActionIconButton kind="annotate" onClick={() => setSelectedDocForMarkup(doc)} />
                        )}
                        {isOrgAdmin && !doc.is_integrated && (
                          <ActionIconButton kind="share" onClick={() => openShareModal([doc.id])} />
                        )}
                        {isOrgAdmin && !doc.is_integrated && (
                          <ActionIconButton kind="delete" onClick={() => handleDeleteDoc(doc.id)} />
                        )}
                      </InlineActionTray>
                    </>
                  )}
                </>
              )}
            />
          </div>
        )}
      </div>
      </div>
      )}

      {/* ─── MODAL DE UPLOAD DE NOVO DOCUMENTO (Feature 1) ─── */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-lg">Novo Documento — {CATEGORIES.find(c => c.id === newDocCategory)?.label}</h3>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-5">
              {/* Seletor de organização — só quando o seletor global está em
                  "Todas as Organizações". Sem ele, o upload não saberia em qual
                  org gravar (mesmo padrão do modal de "Nova pasta"). */}
              {!activeOrganizationId && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Organização</label>
                  <select
                    value={newDocOrgId}
                    onChange={(e) => setNewDocOrgId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value="">Selecione uma organização...</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Arquivo (Drag and Drop Simples) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">Arquivo Físico (PDF, DOCX, XLSX, DWG, Imagens — Max 50MB)</label>
                <div className="border-2 border-dashed border-slate-200 rounded-[10px] p-6 text-center hover:border-blue-400 transition-colors bg-slate-50/50 relative">
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

              {/* Linha 1: Nome, Tipo de Doc e Disciplina */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Nome do Documento</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome simplificado"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Tipo de Documento</label>
                  <select
                      required
                      value={newDocType}
                      onChange={(e) => setNewDocType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
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
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Disciplina</label>
                  <select
                      value={newDocDiscipline}
                      onChange={(e) => setNewDocDiscipline(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    >
                      <option value="">Nenhuma</option>
                      {disciplines.map((disc) => (
                        <option key={disc.id} value={disc.code}>
                          {disc.code} - {disc.name}
                        </option>
                      ))}
                    </select>
                </div>
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">Descrição / Notas</label>
                <textarea
                  placeholder="Observações ou detalhes importantes..."
                  value={newDocDesc}
                  onChange={(e) => setNewDocDesc(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25 resize-none"
                />
              </div>
                
                <div className="space-y-1.5 mt-4">
                  <label className="text-xs font-semibold text-slate-500">Autor do Projeto</label>
                  <select
                    value={newDocSupplierId || (newDocAutorOutro ? '__outro__' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__outro__') {
                        setNewDocSupplierId('');
                        setNewDocAutorOutro(true);
                      } else if (val === '') {
                        setNewDocSupplierId('');
                        setNewDocAutorOutro(false);
                        setNewDocAutor('');
                      } else {
                        setNewDocSupplierId(val);
                        setNewDocAutorOutro(false);
                        setNewDocAutor(suppliers.find((s) => s.id === val)?.name || '');
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value="">Nenhum</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    <option value="__outro__">Outro (digitar nome)</option>
                  </select>
                  {newDocAutorOutro && (
                    <input
                      type="text"
                      placeholder="Nome do autor ou responsável..."
                      value={newDocAutor}
                      onChange={(e) => setNewDocAutor(e.target.value)}
                      autoFocus
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                    />
                  )}
                </div>

              {/* Nº do Documento (Fornecedor) e Revisão — texto livre, controle manual */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Nº do Documento (Fornecedor)</label>
                  <input
                    type="text"
                    placeholder="Código/número dado pelo fornecedor..."
                    value={newDocNumeroFornecedor}
                    onChange={(e) => setNewDocNumeroFornecedor(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Revisão</label>
                  <input
                    type="text"
                    placeholder="Ex: Rev. A, 00..."
                    value={newDocRevisao}
                    onChange={(e) => setNewDocRevisao(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
              </div>

              {/* Emissão, Validade e Dias Alerta */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Data de Emissão</label>
                  <input
                    type="date"
                    value={newDocEmissao}
                    onChange={(e) => setNewDocEmissao(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Data de Vencimento</label>
                  <input
                    type="date"
                    value={newDocValidade}
                    onChange={(e) => setNewDocValidade(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Alerta de Vencimento</label>
                  <select
                    value={newDocAlertaDias}
                    onChange={(e) => setNewDocAlertaDias(parseInt(e.target.value))}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
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
                  <label className="text-xs font-semibold text-slate-500">Tags (Separadas por vírgula)</label>
                  <input
                    type="text"
                    placeholder="obra, fundação, AVCB, fiscal"
                    value={newDocTagsInput}
                    onChange={(e) => setNewDocTagsInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                </div>

                {/* Vínculo de Obra/Empreendimento (Opcional) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Obra/Empreendimento (Opcional)</label>
                  <select
                    value={selectedProjectId !== 'all' ? selectedProjectId : newDocProjectId}
                    onChange={(e) => setNewDocProjectId(e.target.value)}
                    disabled={selectedProjectId !== 'all'}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-60"
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
                  <label className="text-xs font-semibold text-slate-500">Empresa Vinculada (Opcional)</label>
                  <select
                    value={newDocCompanyId}
                    onChange={(e) => setNewDocCompanyId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
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
                  className="px-5 py-3 border border-slate-200 text-slate-500 font-medium rounded-[6px] hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white font-medium text-[13px] rounded-[6px] hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
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

      {/* ─── PAINEL DE UPLOAD EM LOTE ─── */}
      <BatchUploadSheet
        open={batchUploadOpen}
        onClose={() => setBatchUploadOpen(false)}
        activeOrganizationId={activeOrganizationId}
        organizations={organizations}
        categoria={activeTab}
        categoriaLabel={CATEGORIES.find(c => c.id === activeTab)?.label || ''}
        currentFolderId={currentFolderId}
        activeFolder={activeFolder}
        docsInFolder={filteredDocuments.filter(d => d.folder_id === currentFolderId)}
        obras={obras}
        selectedProjectId={selectedProjectId}
        companies={companies}
        documentTypes={documentTypes}
        disciplines={disciplines}
        currentProfile={currentProfile}
        notify={notify}
        onFinished={fetchDocs}
      />

      {/* ─── BARRA DE AÇÕES EM LOTE (§10 do guia) — fixa no rodapé, fora do fluxo normal ─── */}
      {selectedDocIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 p-4 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
          <span className="flex-1 text-sm font-bold whitespace-nowrap">
            {selectedDocIds.size} selecionado{selectedDocIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setBatchEditOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-white text-blue-700 rounded-[6px] font-medium text-[13px] hover:bg-blue-50 transition-all active:scale-95"
          >
            <Settings className="w-4 h-4" />
            Editar em lote
          </button>
          <button
            onClick={() => setSelectedDocIds(new Set())}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-500 rounded-[6px] font-medium text-[13px] hover:bg-blue-400 transition-all"
          >
            <X className="w-3.5 h-3.5" />
            Desmarcar
          </button>
        </div>
      )}

      {batchEditOpen && (
        <DocumentBatchEditModal
          documents={selectedDocsForBatchEdit}
          documentTypes={documentTypes}
          disciplines={disciplines}
          obras={obras}
          companies={companies}
          suppliers={suppliers}
          currentProfile={currentProfile}
          notify={notify}
          onClose={() => setBatchEditOpen(false)}
          onSaved={() => {
            fetchDocs();
            setSelectedDocIds(new Set());
          }}
        />
      )}

      {/* ─── MODAL DE HISTÓRICO DE VERSÕES / RENOVAÇÃO (Feature 4/5) ─── */}
      {selectedDocForVersions && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="font-black text-slate-800 text-sm">Histórico de Versões</h3>
                  <p className="text-xs text-slate-400 font-bold">{selectedDocForVersions.nome}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedDocForVersions.locked_by ? (
                  <ActionIconButton
                    kind="unlock"
                    disabled={isLockedByOther(selectedDocForVersions)}
                    title={
                      isLockedByOther(selectedDocForVersions)
                        ? `Bloqueado por ${selectedDocForVersions.locked_by_name || selectedDocForVersions.locked_by}`
                        : 'Desbloquear'
                    }
                    onClick={() => handleUnlockDoc(selectedDocForVersions)}
                  />
                ) : (
                  <ActionIconButton kind="lock" onClick={() => setLockModalDoc(selectedDocForVersions)} />
                )}
                <button
                  onClick={() => setSelectedDocForVersions(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {selectedDocForVersions.locked_by && (
              <div className="mx-6 mt-4 flex items-center gap-2 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-100 rounded-[8px] px-3 py-2">
                <Lock className="w-3.5 h-3.5" />
                Em edição por {selectedDocForVersions.locked_by_name || selectedDocForVersions.locked_by} — V{selectedDocForVersions.locked_version}
                {selectedDocForVersions.locked_at && ` desde ${new Date(selectedDocForVersions.locked_at).toLocaleString()}`}
              </div>
            )}

            <div className="p-6 space-y-6">
              {/* Form para Upload de Nova Versão / Renovação */}
              {canAccessTab(selectedDocForVersions.categoria) && (
                <form onSubmit={handleUploadVersionSubmit} className="bg-slate-50 p-4 rounded-[10px] border border-slate-100 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <Upload className="w-4 h-4" />
                    Subir nova versão ou renovação
                  </h4>
                  {isLockedByOther(selectedDocForVersions) && (
                    <p className="text-xs font-medium text-orange-600 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Bloqueado por {selectedDocForVersions.locked_by_name || selectedDocForVersions.locked_by} — desbloqueie para subir uma nova versão.
                    </p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-grow border border-slate-200 rounded-[6px] bg-white p-3 hover:border-blue-400 transition-colors">
                      <input
                        type="file"
                        required
                        disabled={isLockedByOther(selectedDocForVersions)}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setNewVersionFile(e.target.files[0]);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <p className="text-xs font-bold text-slate-600 text-center truncate">
                        {newVersionFile ? newVersionFile.name : 'Selecionar novo arquivo...'}
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={uploadingVersion || !newVersionFile || isLockedByOther(selectedDocForVersions)}
                      className="h-9 px-3.5 bg-blue-600 text-white font-medium text-[13px] rounded-[6px] hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                <h4 className="text-sm font-semibold text-slate-700">Versões Cadastradas</h4>
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-[10px]">
                  {selectedDocForVersions.versions?.map((ver) => {
                    const isActive = selectedDocForVersions.active_version_id === ver.id;
                    return (
                      <div key={ver.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-semibold ${isActive ? 'text-blue-600' : 'text-slate-500'}`}>
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
                <form onSubmit={handleRequestApprovalSubmit} className="bg-slate-50 p-4 rounded-[10px] border border-slate-100 space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    Enviar para aprovação de um revisor
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-grow">
                      <select
                        required
                        value={selectedApproverEmail}
                        onChange={(e) => setSelectedApproverEmail(e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-[6px] text-form-input font-medium bg-white focus:outline-none"
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
                      className="h-9 px-3.5 bg-blue-600 text-white font-medium text-[13px] rounded-[6px] hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                  <h4 className="text-sm font-semibold text-slate-700">Histórico de Pareceres</h4>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-[10px]">
                    {documentApprovals.map((app) => (
                      <div key={app.id} className="p-4 hover:bg-slate-50/50 transition-colors text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${
                              app.status === 'aprovado'
                                ? 'text-emerald-700'
                                : app.status === 'rejeitado'
                                ? 'text-rose-700'
                                : 'text-blue-700'
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
                <h4 className="text-sm font-semibold text-slate-700">Trilha de Auditoria (Logs)</h4>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-[10px] bg-slate-50/20">
                  {documentAuditLogs.length === 0 ? (
                    <p className="p-4 text-center text-sm text-slate-400 font-medium">Nenhum evento registrado para este documento.</p>
                  ) : (
                    documentAuditLogs.map((log) => {
                      let icon = <FileText className="w-3.5 h-3.5 text-slate-400" />;
                      let badgeColor = 'text-slate-600';

                      switch (log.action) {
                        case 'criado':
                          icon = <Plus className="w-3.5 h-3.5 text-blue-600" />;
                          badgeColor = 'text-blue-700';
                          break;
                        case 'versao_enviada':
                          icon = <Upload className="w-3.5 h-3.5 text-violet-600" />;
                          badgeColor = 'text-violet-700';
                          break;
                        case 'download':
                          icon = <Download className="w-3.5 h-3.5 text-emerald-600" />;
                          badgeColor = 'text-emerald-700';
                          break;
                        case 'visualizado':
                          icon = <Eye className="w-3.5 h-3.5 text-indigo-600" />;
                          badgeColor = 'text-indigo-700';
                          break;
                        case 'movido_pasta':
                          icon = <CornerDownRight className="w-3.5 h-3.5 text-amber-600" />;
                          badgeColor = 'text-amber-700';
                          break;
                        case 'status_alterado':
                          icon = <UserCheck className="w-3.5 h-3.5 text-teal-600" />;
                          badgeColor = 'text-teal-700';
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
                            <span className={`text-xs font-medium ${badgeColor}`}>
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
          <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-sm">Nova Pasta Virtual</h3>
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
                  <label className="text-xs font-semibold text-slate-500">Organização</label>
                  <select
                    value={createFolderOrgId}
                    onChange={(e) => setCreateFolderOrgId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value="">Selecione uma organização...</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">Nome da Pasta</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Projetos Executivos, Planilhas de Custos"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">Padrão de Nome (Nomenclatura)</label>
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
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
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
                  <label className="text-xs font-semibold text-slate-500">Disciplinas Permitidas nesta pasta</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3.5 rounded-[10px] border border-slate-100 max-h-[140px] overflow-y-auto">
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
                  <label className="text-xs font-semibold text-slate-500">Máscara Personalizada</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: [OBRA]-PL-[NUMERO]"
                    value={folderNamingMask}
                    onChange={(e) => setFolderNamingMask(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  />
                  <p className="text-xs text-slate-400 font-medium">
                    Use as tags: <span className="text-blue-600">[OBRA]</span>, <span className="text-blue-600">[DISCIPLINA]</span>, <span className="text-blue-600">[NUMERO]</span>, <span className="text-blue-600">[REVISAO]</span>.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateFolderModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 font-medium rounded-[6px] hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="h-9 px-3.5 bg-blue-600 text-white font-medium text-[13px] rounded-[6px] hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
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
          <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <CornerDownRight className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-sm">Mover Documento</h3>
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
                <label className="text-xs font-semibold text-slate-500">Selecione a Pasta de Destino</label>
                <select
                  value={targetFolderId || ''}
                  onChange={(e) => setTargetFolderId(e.target.value || null)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
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
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 font-medium rounded-[6px] hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-3.5 bg-blue-600 text-white font-medium text-[13px] rounded-[6px] hover:bg-blue-700 transition-all active:scale-95"
                >
                  Confirmar Mudança
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Bloqueio para Edição (trava) */}
      {lockModalDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-orange-500" />
                <h3 className="font-black text-slate-800 text-sm">Bloquear para Edição</h3>
              </div>
              <button
                onClick={() => setLockModalDoc(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Isso informa aos demais usuários que <span className="font-semibold text-slate-800">{lockModalDoc.nome}</span> está
                em edição e impede que outra pessoa edite os metadados ou suba uma nova versão até você desbloquear.
              </p>

              <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">Usuário</span>
                  <span className="font-medium text-slate-800">{currentUserDisplayName}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-semibold">Versão atual</span>
                  <span className="font-medium text-slate-800">V{lockModalDoc.active_version?.version_number || 1}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setLockModalDoc(null)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 font-medium rounded-[6px] hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={lockSubmitting}
                  onClick={handleConfirmLockDoc}
                  className="h-9 px-3.5 bg-orange-500 text-white font-medium text-[13px] rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {lockSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Bloquear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Compartilhamento — Portal do Parceiro / Cliente / Colaborador */}
      {shareModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-orange-500" />
                <h3 className="font-black text-slate-800 text-sm">
                    {shareFolder
                      ? `Compartilhar pasta "${shareFolder.name}"`
                      : `Compartilhar ${shareDocIds.length > 1 ? `(${shareDocIds.length} arquivos)` : ''}`}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setShareModalOpen(false);
                    setShareDocIds([]);
                    setShareFolder(null);
                  }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Alvo do compartilhamento */}
            <div className="flex items-center gap-1.5 px-6 pt-4">
              {([
                { id: 'parceiro', label: 'Parceiro' },
                { id: 'cliente', label: 'Portal do Cliente' },
                { id: 'colaborador', label: 'Portal do Colaborador' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setShareAudience(tab.id)}
                  className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold transition-colors ${
                    shareAudience === tab.id
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {shareAudience === 'parceiro' && (
              <form onSubmit={handleShareWithPartner} className="p-6 space-y-4">
                {shareFolder && (
                  <div className="bg-orange-50/60 border border-orange-100 rounded-[8px] px-3 py-2.5">
                    <p className="text-xs text-orange-700">
                      A pasta inteira será compartilhada, com subpastas — inclusive as vazias.
                      Documento adicionado a ela depois passa a aparecer para o parceiro automaticamente.
                    </p>
                  </div>
                )}
                {docAlreadySharedWith.length > 0 && (
                  <div className="bg-slate-50 border border-slate-100 rounded-[8px] p-2.5">
                    <p className="text-xs font-semibold text-slate-500 mb-1.5 px-1">Compartilhado com</p>
                    <div className="space-y-1">
                      {docAlreadySharedWith.map((s) => {
                        const partial = s.doc_count < shareDocIds.length;
                        return (
                          <div key={s.partner_workspace_id} className="flex items-center justify-between gap-2 bg-white border border-slate-100 rounded-[6px] px-2.5 py-1.5">
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-slate-700 block truncate">{s.supplier_name}</span>
                              {partial && (
                                <span className="text-[11px] text-amber-600">{s.doc_count} de {shareDocIds.length} arquivos</span>
                              )}
                            </div>
                            <ActionIconButton
                              kind="delete"
                              title="Revogar acesso"
                              disabled={unsharingId === s.partner_workspace_id}
                              onClick={() => handleUnshareFromPartner(s.partner_workspace_id, s.supplier_name)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Parceiro / Fornecedor Habilitado</label>
                  <select
                    required
                    value={selectedShareWorkspaceId}
                    onChange={(e) => setSelectedShareWorkspaceId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                  >
                    <option value="">Selecione um parceiro...</option>
                    {sortedShareWorkspaces.map((ws) => {
                      // Desabilita só quando cobre TODOS os documentos do escopo — se for parcial,
                      // deixa reselecionar para completar o compartilhamento no restante.
                      const alreadyShared = docAlreadySharedWith.some((s) => s.partner_workspace_id === ws.id && s.doc_count >= shareDocIds.length);
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
                      setShareDocIds([]);
                      setShareFolder(null);
                    }}
                    className="px-4 py-2.5 border border-slate-200 text-slate-500 font-medium rounded-[6px] hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={sharingSubmitting || !selectedShareWorkspaceId}
                    className="h-9 px-3.5 bg-orange-500 text-white font-medium text-[13px] rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {sharingSubmitting ? 'Compartilhando...' : 'Compartilhar'}
                  </button>
                </div>
              </form>
            )}

            {(shareAudience === 'cliente' || shareAudience === 'colaborador') && (
              <form onSubmit={handleShareWithPortal} className="p-6 space-y-4">
                {docAlreadySharedWithPortal.filter((s) => s.audience === shareAudience).length > 0 && (
                  <div className="bg-slate-50 border border-slate-100 rounded-[8px] p-2.5">
                    <p className="text-xs font-semibold text-slate-500 mb-1.5 px-1">Compartilhado com</p>
                    <div className="space-y-1">
                      {docAlreadySharedWithPortal.filter((s) => s.audience === shareAudience).map((s) => {
                        const partial = s.doc_count < shareDocIds.length;
                        const key = `${s.audience}:${s.recipient_id}`;
                        return (
                          <div key={key} className="flex items-center justify-between gap-2 bg-white border border-slate-100 rounded-[6px] px-2.5 py-1.5">
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-slate-700 block truncate">{s.name}</span>
                              {partial && (
                                <span className="text-[11px] text-amber-600">{s.doc_count} de {shareDocIds.length} arquivos</span>
                              )}
                            </div>
                            <ActionIconButton
                              kind="delete"
                              title="Revogar acesso"
                              disabled={unsharingId === key}
                              onClick={() => handleUnshareFromPortal(s)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {shareAudience === 'cliente' ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Cliente</label>
                    <select
                      required
                      value={selectedShareClientId}
                      onChange={(e) => setSelectedShareClientId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                    >
                      <option value="">Selecione um cliente...</option>
                      {portalShareClients.map((c) => {
                        const alreadyShared = docAlreadySharedWithPortal.some((s) => s.audience === 'cliente' && s.recipient_id === c.id && s.doc_count >= shareDocIds.length);
                        return (
                          <option key={c.id} value={c.id} disabled={alreadyShared}>
                            {c.name}{alreadyShared ? ' (já compartilhado)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    {portalShareClients.length === 0 && (
                      <p className="text-xs text-slate-400 pt-1">Nenhum cliente cadastrado nesta organização.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Colaborador</label>
                    <select
                      required
                      value={selectedShareEmployeeId}
                      onChange={(e) => setSelectedShareEmployeeId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                    >
                      <option value="">Selecione um colaborador...</option>
                      {portalShareEmployees.map((emp) => {
                        const alreadyShared = docAlreadySharedWithPortal.some((s) => s.audience === 'colaborador' && s.recipient_id === emp.id && s.doc_count >= shareDocIds.length);
                        return (
                          <option key={emp.id} value={emp.id} disabled={alreadyShared}>
                            {emp.name}{alreadyShared ? ' (já compartilhado)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    {portalShareEmployees.length === 0 && (
                      <p className="text-xs text-slate-400 pt-1">Nenhum colaborador cadastrado nesta organização.</p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShareModalOpen(false);
                      setShareDocIds([]);
                      setShareFolder(null);
                    }}
                    className="px-4 py-2.5 border border-slate-200 text-slate-500 font-medium rounded-[6px] hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={sharingSubmitting || (shareAudience === 'cliente' ? !selectedShareClientId : !selectedShareEmployeeId)}
                    className="h-9 px-3.5 bg-orange-500 text-white font-medium text-[13px] rounded-[6px] hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {sharingSubmitting ? 'Compartilhando...' : 'Compartilhar'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal de Etiqueta QR Code de Canteiro */}
      {selectedDocForQrCode && (
        <DocumentQrLabelModal doc={selectedDocForQrCode} onClose={() => setSelectedDocForQrCode(null)} />
      )}

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
        <Sheet open={!!editingDoc} onClose={() => setEditingDoc(null)} size="2xl">
          <SheetHeader onClose={() => setEditingDoc(null)}>
            <SheetTitle>Editar metadados</SheetTitle>
            <SheetDescription>{editingDoc.nome}</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleEditDocSubmit} className="flex flex-col flex-1 min-h-0">
          <SheetPanel className="p-6 space-y-5">
                {/* Nome ou Tokens */}
                {(() => {
                  const docFolder = folders.find(f => f.id === editingDoc?.folder_id) || activeFolder;
                  if (docFolder && docFolder.naming_mask) {
                    return (
                      <div className="space-y-4 bg-blue-50/50 p-4 rounded-[10px] border border-blue-100">
                        <label className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                          <Settings className="w-4 h-4" /> Componentes do Nome (Padrão: {docFolder.naming_mask})
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {extractMaskTokens(docFolder.naming_mask).map(token => {
                            const cleanToken = token.replace(/[\[\]]/g, '');
                              const baseToken = cleanToken.split('{')[0];
                              const lengthMatch = cleanToken.match(/\{([0-9,]+)\}/);
                              const tokenLength = lengthMatch ? parseInt(lengthMatch[1].split(',')[0], 10) : undefined;
                            if (baseToken === 'OBRA') {
                              return (
                                <div key={token} className="space-y-1.5">
                                  <label className="text-xs font-semibold text-slate-500">OBRA</label>
                                  <select
                                    required
                                    value={editDocTokens[token] || ''}
                                    onChange={(e) => setEditDocTokens(prev => ({ ...prev, [token]: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                  >
                                    <option value="">Selecione uma Obra</option>
                                    {obras.map(o => (
                                      <option key={o.id} value={o.code || ''}>{o.code} - {o.name}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }
                            if (baseToken === 'DISCIPLINA') {
                              const allowedDiscs = docFolder.disciplines?.length ? disciplines.filter(d => docFolder.disciplines!.includes(d.code)) : disciplines;
                              return (
                                <div key={token} className="space-y-1.5">
                                  <label className="text-xs font-semibold text-slate-500">DISCIPLINA</label>
                                  <select
                                    required
                                    value={editDocTokens[token] || ''}
                                    onChange={(e) => setEditDocTokens(prev => ({ ...prev, [token]: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
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
                                <label className="text-xs font-semibold text-slate-500">{baseToken}</label>
                                <input maxLength={tokenLength || undefined}
                                  type="text"
                                  required
                                  placeholder={`Valor para ${cleanToken}`}
                                  value={editDocTokens[token] || ''}
                                  onChange={(e) => setEditDocTokens(prev => ({ ...prev, [token]: e.target.value.toUpperCase() }))}
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                                />
                              </div>
                            );
                          })}
                        </div>
                        <div className="pt-2">
                          <span className="text-xs font-semibold text-slate-500 block mb-1">Como ficará o arquivo</span>
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
                      <label className="text-xs font-semibold text-slate-500">Nome do Documento / Planta</label>
                      <input
                        type="text"
                        required
                        value={editDocName}
                        onChange={(e) => setEditDocName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                      />
                    </div>
                  );
                })()}

              {/* Descrição */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">Descrição / Notas complementares</label>
                <textarea
                  rows={3}
                  value={editDocDesc}
                  onChange={(e) => setEditDocDesc(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Extensão do arquivo — renomeia o arquivo da versão ativa no
                  Storage (não é metadado), por isso fica com aviso próprio. */}
              {editingDoc.active_version && (() => {
                const currentExt = (editingDoc.active_version.storage_path.split('.').pop() || '').toLowerCase();
                return (
                  <div className="space-y-1.5 mt-4">
                    <label className="text-xs font-semibold text-slate-500">
                      Extensão do arquivo{currentExt ? ` (atual: .${currentExt})` : ''}
                    </label>
                    <select
                      value={editDocExtensao}
                      onChange={(e) => setEditDocExtensao(e.target.value as typeof editDocExtensao)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    >
                      <option value="">— Manter atual —</option>
                      {EXTENSAO_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {editDocExtensao && editDocExtensao !== currentExt && (
                      <div className="flex items-start gap-2 p-3 rounded-[10px] bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          Isso renomeia o arquivo no Storage para .{editDocExtensao} — não
                          converte o conteúdo do arquivo, só o nome.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

                <div className="space-y-1.5 mt-4">
                  <label className="text-xs font-semibold text-slate-500">Autor do Projeto</label>
                  <select
                    value={editDocSupplierId || (editDocAutorOutro ? '__outro__' : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '__outro__') {
                        setEditDocSupplierId('');
                        setEditDocAutorOutro(true);
                      } else if (val === '') {
                        setEditDocSupplierId('');
                        setEditDocAutorOutro(false);
                        setEditDocAutor('');
                      } else {
                        setEditDocSupplierId(val);
                        setEditDocAutorOutro(false);
                        setEditDocAutor(suppliers.find((s) => s.id === val)?.name || '');
                      }
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                  >
                    <option value="">Nenhum</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    <option value="__outro__">Outro (digitar nome)</option>
                  </select>
                  {editDocAutorOutro && (
                    <input
                      type="text"
                      value={editDocAutor}
                      onChange={(e) => setEditDocAutor(e.target.value)}
                      placeholder="Nome do autor ou responsável..."
                      autoFocus
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    />
                  )}
                </div>

              {/* Nº do Documento (Fornecedor) e Revisão — texto livre, controle manual */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Nº do Documento (Fornecedor)</label>
                  <input
                    type="text"
                    placeholder="Código/número dado pelo fornecedor..."
                    value={editDocNumeroFornecedor}
                    onChange={(e) => setEditDocNumeroFornecedor(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">Revisão</label>
                  <input
                    type="text"
                    placeholder="Ex: Rev. A, 00..."
                    value={editDocRevisao}
                    onChange={(e) => setEditDocRevisao(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Datas e Alertas em Grid */}
                <div className={`grid ${editingDoc.categoria === 'engenharia' ? 'grid-cols-1 sm:grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'} gap-4`}>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Data de Emissão</label>
                    <input
                      type="date"
                      value={editDocEmissao}
                      onChange={(e) => setEditDocEmissao(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    />
                  </div>

                  {editingDoc.categoria !== 'engenharia' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Data de Vencimento</label>
                        <input
                          type="date"
                          value={editDocValidade}
                          onChange={(e) => setEditDocValidade(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">Alerta de Vencimento (Dias)</label>
                        <input
                          type="number"
                          min={0}
                          value={editDocAlertaDias}
                          onChange={(e) => setEditDocAlertaDias(parseInt(e.target.value, 10) || 0)}
                          className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                        />
                      </div>
                    </>
                  )}
                </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">Tags / Palavras-chave (Separadas por vírgula)</label>
                <input
                  type="text"
                  placeholder="Estrutural, Revisado, Medição, Alpa"
                  value={editDocTagsInput}
                  onChange={(e) => setEditDocTagsInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Tipo de Documento</label>
                    <select
                      value={editDocType}
                      onChange={(e) => setEditDocType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    >
                      <option value="">Nenhum (Livre)</option>
                      {documentTypes.map((type) => (
                        <option key={type.id} value={type.name}>{type.name}</option>
                      ))}
                      {editDocType && !documentTypes.find(t => t.name === editDocType) && (
                        <option value={editDocType}>{editDocType}</option>
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Disciplina</label>
                    <select
                      value={editDocDiscipline}
                      onChange={(e) => setEditDocDiscipline(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    >
                      <option value="">Nenhuma</option>
                      {disciplines.map((disc) => (
                        <option key={disc.id} value={disc.code}>{disc.code} - {disc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Obra Vinculada</label>
                    <select
                      value={editDocProjectId}
                      onChange={(e) => setEditDocProjectId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    >
                      <option value="">Nenhuma Obra</option>
                      {projects?.map(p => (
                        <option key={p.id} value={p.id}>{p.code || p.id} - {p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Empresa Vinculada</label>
                    <select
                      value={editDocCompanyId}
                      onChange={(e) => setEditDocCompanyId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                    >
                      <option value="">Nenhuma Empresa</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.razao_social}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Status do Documento */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">Status do Documento</label>
                <select
                  value={editDocStatus}
                  onChange={(e) => setEditDocStatus(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                >
                  <option value="ativo">✅ Ativo</option>
                  <option value="arquivado">📁 Arquivado</option>
                  <option value="vencido">⚠️ Vencido (Forçar)</option>
                  <option value="alerta">🔔 Alerta (Forçar)</option>
                </select>
              </div>
          </SheetPanel>
          <SheetFooter>
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="h-9 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-500 font-medium text-[13px] rounded-[6px] transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-[13px] rounded-[6px] transition-all active:scale-95"
                >
                  Salvar Alterações
                </button>
          </SheetFooter>
          </form>
        </Sheet>
      )}

      {/* Modal de Configuração/Edição de Pasta Virtual */}
      {editingFolder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-[10px] w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-slate-800 text-lg">Configurar Pasta</h3>
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
                <label className="text-xs font-semibold text-slate-500">Nome da Pasta</label>
                <input
                  type="text"
                  required
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-500">Padrão de Nome (Nomenclatura)</label>
                  {isOrgAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFolder(null);
                        setSettingsTab('patterns');
                        setShowSettingsModal(true);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-semibold transition-all"
                    >
                      Gerenciar Fórmulas
                    </button>
                  )}
                </div>
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
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-[6px] text-xs font-medium bg-white focus:outline-none"
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
                  <label className="text-xs font-semibold text-slate-500">Disciplinas Permitidas nesta pasta</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3.5 rounded-[10px] border border-slate-100 max-h-[140px] overflow-y-auto">
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
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25 mt-2"
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
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-medium rounded-[6px] hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-3.5 bg-blue-600 text-white font-medium text-[13px] rounded-[6px] hover:bg-blue-700 transition-all active:scale-95"
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
          <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-2xl border border-slate-100 overflow-hidden my-8 animate-in zoom-in-95 duration-200">
            
            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-xl">{settingsTab === 'disciplines' ? '📋' : '⚙️'}</span>
                <h3 className="font-black text-slate-800 text-lg">
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

            {/* Seletor de organização — só quando o seletor global está em "Todas as
                Organizações". Sem ele, criar Tipo/Disciplina/Padrão não tem como saber
                em qual org gravar (mesmo padrão de newDocOrgId no modal de upload). */}
            {!activeOrganizationId && (
              <div className="px-6 pt-4">
                <label className="text-xs font-semibold text-slate-500">Organização (para cadastrar novos itens)</label>
                <select
                  value={settingsOrgId}
                  onChange={(e) => setSettingsOrgId(e.target.value)}
                  className="w-full mt-1.5 px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                >
                  <option value="">Selecione uma organização...</option>
                  {organizations.map(org => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Abas Internas */}

              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/20 px-6 overflow-x-auto">
                <button
                  onClick={() => setSettingsTab('document_types')}
                  className={`h-9 px-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    settingsTab === 'document_types'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  📄 Tipos de Documentos
                </button>
                <button
                  onClick={() => setSettingsTab('disciplines')}
                  className={`h-9 px-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    settingsTab === 'disciplines'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  📑 Disciplinas
                </button>
                <button
                  onClick={() => setSettingsTab('patterns')}
                  className={`h-9 px-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
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
                    <form onSubmit={handleCreateDocTypeSubmit} className="bg-slate-50 p-4 rounded-[10px] border border-slate-100 space-y-4">
                      <h4 className="font-semibold text-slate-700 text-sm">Cadastrar Novo Tipo de Documento</h4>
                      <div className="flex flex-col sm:flex-row gap-3 items-end">
                        <div className="space-y-1 flex-1">
                          <label className="text-xs font-semibold text-slate-500">Nome do Tipo (ex: Projeto Hidráulico)</label>
                          <input
                            type="text"
                            required
                            placeholder="Nome"
                            value={newDocTypeName}
                            onChange={(e) => setNewDocTypeName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-[6px] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                          />
                        </div>
                        <button type="submit" className="w-full sm:w-auto px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-[6px] hover:bg-blue-700 transition-colors whitespace-nowrap">
                          Adicionar
                        </button>
                      </div>
                    </form>

                    <div className="border border-slate-100 rounded-[10px] overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Tipo de Documento</th>
                            <th className="px-4 py-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm font-normal text-slate-700">
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
                    <form onSubmit={handleCreateDisciplineSubmit} className="bg-slate-50 p-4 rounded-[10px] border border-slate-100 space-y-4">
                      <h4 className="font-semibold text-slate-700 text-sm">Cadastrar Nova Disciplina</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500">Código (ex: ARQ)</label>
                          <input
                            type="text"
                            required
                            maxLength={10}
                            placeholder="ARQ"
                            value={newDiscCode}
                            onChange={(e) => setNewDiscCode(e.target.value.toUpperCase())}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-[6px] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-xs font-semibold text-slate-500">Nome da Disciplina (ex: Arquitetura)</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Arquitetura e Urbanismo"
                              value={newDiscName}
                              onChange={(e) => setNewDiscName(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-[6px] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                            />
                            <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-[6px] hover:bg-blue-700 transition-colors whitespace-nowrap">
                              Adicionar
                            </button>
                          </div>
                        </div>
                      </div>
                    </form>

                    {/* Tabela de Disciplinas */}
                    <div className="border border-slate-100 rounded-[10px] overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Código</th>
                            <th className="px-4 py-3">Nome da Disciplina</th>
                            <th className="px-4 py-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm font-normal text-slate-700">
                          {disciplines.map(disc => (
                            <tr key={disc.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3 text-blue-600 font-normal">
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
                    <form onSubmit={handleCreateNamingPatternSubmit} className="bg-slate-50 p-4 rounded-[10px] border border-slate-100 space-y-4">
                      <h4 className="font-semibold text-slate-700 text-sm">Cadastrar Nova Fórmula</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500">Nome do Padrão</label>
                          <input
                            type="text"
                            required
                            placeholder="Ex: Padrão ALPA"
                            value={newPatName}
                            onChange={(e) => setNewPatName(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-[6px] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500">Máscara de Composição</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              required
                              placeholder="[OBRA]-[DISCIPLINA]-[NUMERO]-R[REVISAO]"
                              value={newPatMask}
                              onChange={(e) => setNewPatMask(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-[6px] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                            />
                            <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-[6px] hover:bg-blue-700 transition-colors whitespace-nowrap">
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
                    <div className="border border-slate-100 rounded-[10px] overflow-hidden bg-white">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Nome do Padrão</th>
                            <th className="px-4 py-3">Fórmula / Máscara</th>
                            <th className="px-4 py-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm font-normal text-slate-700">
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
                              <td className="px-4 py-3 text-xs font-normal text-blue-600">
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
          <div className="bg-white rounded-[10px] shadow-2xl w-full max-w-md border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-[6px]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-lg leading-tight">Fora do Padrão</h3>
                  <p className="text-[11px] text-slate-500 font-bold mt-0.5 max-w-[260px] leading-tight">O arquivo enviado não atende ao padrão da pasta. Preencha os campos abaixo para corrigir.</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleRenameSubmit} className="p-6 space-y-6">
              <div className="space-y-4">
                {extractMaskTokens(renameTargetMask).map((token) => {
                  const cleanToken = token.replace(/[\[\]]/g, '');
                              const baseToken = cleanToken.split('{')[0];
                              const lengthMatch = cleanToken.match(/\{([0-9,]+)\}/);
                              const tokenLength = lengthMatch ? parseInt(lengthMatch[1].split(',')[0], 10) : undefined;
                  if (baseToken === 'OBRA') {
                    return (
                      <div key={token} className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">OBRA</label>
                        <select
                          required
                          value={renameTokens[token] || ''}
                          onChange={(e) => setRenameTokens(prev => ({ ...prev, [token]: e.target.value }))}
                          className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                        >
                          <option value="">Selecione uma Obra</option>
                          {projects?.map(p => (
                            <option key={p.id} value={p.code || p.id}>{p.code || p.id} - {p.name}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  if (baseToken === 'DISCIPLINA') {
                    const renameTargetFolder = folders.find(f => f.id === currentFolderId);
                    const allowedDiscs = renameTargetFolder?.disciplines?.length ?
                      disciplines.filter(d => renameTargetFolder.disciplines!.includes(d.code)) : disciplines;
                    
                    return (
                      <div key={token} className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-500">DISCIPLINA</label>
                        <select
                          required
                          value={renameTokens[token] || ''}
                          onChange={(e) => setRenameTokens(prev => ({ ...prev, [token]: e.target.value }))}
                          className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
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
                      <label className="text-xs font-semibold text-slate-500">
                        {baseToken}
                        </label>
                      <input maxLength={tokenLength || undefined}
                        type="text"
                        required
                        placeholder={`Valor para ${cleanToken}`}
                        value={renameTokens[token] || ''}
                        onChange={(e) => setRenameTokens(prev => ({ ...prev, [token]: e.target.value.toUpperCase() }))}
                        className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-[6px] text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-50 p-4 rounded-[10px] border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 block mb-1">Como ficará o arquivo</span>
                <div className="font-mono text-xs text-blue-600 font-bold break-all bg-white p-2 rounded border border-blue-100">
                  {generateFileNameFromMask(renameTargetMask, renameTokens, newDocFile?.name.split('.').pop() || '')}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="h-9 px-3.5 border border-slate-200 text-slate-500 font-medium text-[13px] rounded-[6px] hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-[13px] rounded-[6px] transition-all active:scale-95"
                >
                  Aplicar Correção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* z-[10000]: precisa ficar ACIMA dos modais do módulo (todos em z-[9999], ex: "Gestão de
          Disciplinas") — com z-[300] o toast de erro renderizava atrás do backdrop do modal aberto
          e ficava invisível, dando a impressão de que o botão que disparou o erro não fazia nada. */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-[10000] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default OpuraDocsModule;

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
  Filter,
  MoveHorizontal,
  Building2
} from 'lucide-react';
import { extractTokenFromFileName } from '../../utils/dmsUtils';
import { supabase } from '../../lib/supabase';
import { partnerService } from '../../services/partnerService';
import { partnerPortalTokenService } from '../../services/partnerPortalTokenService';
import Button from '../ui/Button';
import ActionIconButton from '../ui/ActionIconButton';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel } from '../ui/sheet';
import PortalMyData from '../supplier/portal/PortalMyData';
import {
  PartnerSupplierProfile,
  EMPTY_SUPPLIER_PROFILE,
} from '../../services/partnerSupplierProfile';
import {
  PartnerContractDetail,
  EMPTY_CONTRACT_DETAIL,
} from '../../services/partnerContractDetail';
import {
  PENALTY_KIND_LABELS, PENALTY_STATUS_LABELS, PENALTY_STATUS_COLORS, DOC_PHASE_LABELS,
  ACCEPTANCE_KIND_LABELS, RETENTION_RELEASE_KIND_LABELS,
} from '../../lib/contractLabels';
import { ColumnConfig, useTableColumns, ColumnConfigButton, usePersistedState, useResizableColumns } from '../ui/TableUtils';
import { DocumentsTable } from '../documents/DocumentsTable';
import { DocumentQrLabelModal } from '../documents/DocumentQrLabelModal';
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

// Pasta / disciplina compartilhadas com o parceiro (subconjunto do que a RPC/serviço devolve).
interface PortalFolder { id: string; name: string; parent_id: string | null; naming_mask: string | null }
interface PortalDiscipline { code: string; name: string }

const NO_DISCIPLINE = '__sem_disciplina__';

// Mesmas colunas da Gestão de Documentos (OpuraDocsModule.tsx) — a tabela do parceiro é a
// mesma <DocumentsTable>, então as colunas precisam ser as mesmas para o layout ficar idêntico.
const PARTNER_DOC_COLUMNS: ColumnConfig[] = [
  { key: 'nome', label: 'Documento', sortable: true },
  { key: 'extensao', label: 'Extensão', sortable: true },
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
const PARTNER_DOC_COL_WIDTHS: Record<string, number> = {
  nome: 260, extensao: 100, autor: 150, numero_documento_fornecedor: 160, tipo_documento: 160,
  revisao: 110, project_id: 160, data_emissao: 120, data_validade: 120, status: 110, actions: 140,
};

export const PartnerPortal: React.FC<PartnerPortalProps> = ({ userEmail, previewWorkspaceId, onExitPreview, portalToken }) => {
  const isPreview = !!previewWorkspaceId;
  const isTokenMode = !!portalToken;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'conversas' | 'documentos' | 'contratos' | 'financeiro' | 'solicitacoes'>('dashboard');
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
  // "Meus dados": o cadastro que a construtora tem deste parceiro — o mesmo de
  // Minha Organização › Meus Fornecedores. Carrega sob demanda: é a única coisa
  // do portal que ninguém abre em toda sessão, e são duas tabelas.
  const [showMyData, setShowMyData] = useState(false);
  const [myData, setMyData] = useState<PartnerSupplierProfile>(EMPTY_SUPPLIER_PROFILE);
  const [myDataLoading, setMyDataLoading] = useState(false);
  const [myDataError, setMyDataError] = useState<string | null>(null);
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
  // Abas do detalhe do contrato. Desde 10/09/2026 espelham Suprimentos › Contratos
  // menos as internas: sem Riscos & Conformidade (avaliação da construtora sobre o
  // parceiro — decisão do usuário), sem Financeiro (é aba própria do portal), sem
  // Avaliação de Desempenho e Emissão.
  const [detailTab, setDetailTab] = useState<'overview' | 'items' | 'execucao' | 'addendums' | 'measurements' | 'retention' | 'penalties'>('overview');
  const [detailLoading, setDetailLoading] = useState(false);
  // Um payload só (núcleo partner_ws_contract_detail) para os dois modos —
  // itens/aditivos/medições continuam como estados próprios porque a Visão Geral
  // calcula sobre eles; o resto do detalhe fica em `contractDetail`.
  const [contractItems, setContractItems] = useState<ContractItem[]>([]);
  const [contractAddendums, setContractAddendums] = useState<ContractAddendum[]>([]);
  const [contractMeasurements, setContractMeasurements] = useState<ContractMeasurement[]>([]);
  const [contractDetail, setContractDetail] = useState<PartnerContractDetail>(EMPTY_CONTRACT_DETAIL);

  // Financeiro (parcelas, medições com NF, retenção) — agregado de todos os contratos do fornecedor
  const [financials, setFinancials] = useState<{
    contracts: { id: string; number: string; title: string | null; current_value: number; retention_rate: number | null; status: string }[];
    installments: { id: string; transaction_date: string; amount: number; direction: string; description: string | null; status: string; business_status: string | null; installment_type: string | null; source_system: string }[];
    measurements: { id: string; contract_id: string; number: number; period_start: string | null; period_end: string | null; status: string; total_value: number; retention_value: number; net_value: number; invoice_url: string | null }[];
    retention: { retained: number; released: number; balance: number };
  }>({ contracts: [], installments: [], measurements: [], retention: { retained: 0, released: 0, balance: 0 } });
  const [financialsLoading, setFinancialsLoading] = useState(false);
  const [uploadingInvoiceFor, setUploadingInvoiceFor] = useState<string | null>(null);
  const [invoiceUploadError, setInvoiceUploadError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  /**
   * Uma função para os dois modos: pelo link o workspace sai do token, no app
   * sai do id — mas o corpo lido é o mesmo núcleo dos dois lados
   * (`partner_ws_supplier_profile`), então não há como as duas visões
   * divergirem sobre o cadastro.
   */
  const abrirMeusDados = async () => {
    setShowMyData(true);
    if (myData.supplier || myDataLoading) return;   // já carregado nesta sessão
    setMyDataLoading(true);
    setMyDataError(null);
    try {
      const perfil = isTokenMode
        ? await partnerPortalTokenService.getSupplierProfile(portalToken!)
        : workspace
          ? await partnerService.getSupplierProfile(workspace.id)
          : EMPTY_SUPPLIER_PROFILE;
      setMyData(perfil);
    } catch (err) {
      console.error('Erro ao carregar Meus dados:', err);
      setMyDataError('Não foi possível carregar seu cadastro. Tente novamente.');
    } finally {
      setMyDataLoading(false);
    }
  };

  // Feed unificado de atividades (documentos compartilhados + solicitações), mais recente primeiro
  const recentActivity = React.useMemo(() => {
    const docActivities = sharedDocs.map((sd) => ({
      // Pelo document_id, não pelo `sd.id`: quem chega por PASTA herda o id da linha
      // de `partner_shared_folders`, que é a MESMA para os N arquivos daquela pasta.
      // Com 65 documentos vindos de uma pasta só, o React recebia 65 chaves iguais e
      // avisava no console que podia duplicar ou omitir itens do feed.
      id: `doc-${sd.document_id}`,
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
      // Os dois modos leem o MESMO núcleo, cada um pela sua casca. Até 10/09/2026
      // o modo app lia contractService tabela a tabela — o par de gêmeas que
      // quebrou Documentos e Financeiro antes.
      const res = isTokenMode
        ? await partnerPortalTokenService.getContractDetail(portalToken!, contract.id)
        : workspace
          ? await partnerService.getContractDetail(workspace.id, contract.id)
          : EMPTY_CONTRACT_DETAIL;
      setContractDetail(res);
      setContractItems(res.items);
      setContractAddendums(res.addendums);
      setContractMeasurements(res.measurements);
    } catch (err) {
      console.error('Erro ao carregar detalhe do contrato:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Anexa a NF de uma medição a partir da aba Financeiro — sobe o arquivo (bucket público
  // 'documents', mesmo caminho que o admin usa) e grava invoice_url via RPC, nos dois modos
  // de acesso. Atualiza só o item local (§22 do guia de UI), sem recarregar tudo.
  const handleUploadInvoice = async (measurementId: string, contractId: string, file: File) => {
    setUploadingInvoiceFor(measurementId);
    setInvoiceUploadError(null);
    try {
      const url = isTokenMode
        ? await partnerPortalTokenService.uploadInvoice(portalToken!, contractId, file)
        : await partnerService.uploadInvoice(contractId, file);

      if (isTokenMode) {
        await partnerPortalTokenService.setMeasurementInvoice(portalToken!, measurementId, url);
      } else {
        await partnerService.setMeasurementInvoice(measurementId, url);
      }

      setFinancials((prev) => ({
        ...prev,
        measurements: prev.measurements.map((m) => (m.id === measurementId ? { ...m, invoice_url: url } : m)),
      }));
    } catch (err: any) {
      console.error('Erro ao anexar nota fiscal:', err);
      setInvoiceUploadError(err.message || 'Erro ao anexar nota fiscal.');
    } finally {
      setUploadingInvoiceFor(null);
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
  const [docStatusFilter, setDocStatusFilter] = usePersistedState<'all' | 'ativo' | 'alerta' | 'vencido'>('partnerPortalDocsFilters:status', 'all');
  const [showDocFilters, setShowDocFilters] = React.useState(false);
  const partnerDocColumns = useTableColumns(PARTNER_DOC_COLUMNS, 'partnerDocsColumns');
  const partnerDocCols = useResizableColumns(PARTNER_DOC_COL_WIDTHS, 'partnerPortalDocsColWidths');
  const [selectedDocForQrCode, setSelectedDocForQrCode] = React.useState<OpuraDocument | null>(null);

  // Pastas e disciplinas compartilhadas — alimentam os dois selects da toolbar. Vêm junto dos
  // documentos (RPC no link público / partnerService no autenticado).
  const [sharedFolders, setSharedFolders] = React.useState<PortalFolder[]>([]);
  const [sharedDisciplines, setSharedDisciplines] = React.useState<PortalDiscipline[]>([]);
  // Pastas compartilhadas explicitamente (raízes + subárvore, vindas do servidor). Elas
  // aparecem MESMO VAZIAS — é a diferença entre "compartilhei a pasta" e "compartilhei os
  // arquivos que estavam nela". Vazio nos modos degradados, aí vale só a poda por documento.
  const [sharedFolderIds, setSharedFolderIds] = React.useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null>(null);
  const [selectedDisciplineCode, setSelectedDisciplineCode] = React.useState<string | null>(null);

  // Documentos GED por trás de cada vínculo — mesmo objeto que a Gestão de Documentos usa
  // (PartnerSharedDocument.document é o próprio OpuraDocument, ver partnerService.listSharedDocuments).
  const sharedOpuraDocuments = React.useMemo(
    () => sharedDocs.map((sd) => sd.document).filter((d): d is OpuraDocument => !!d),
    [sharedDocs]
  );

  const folderById = React.useMemo(() => {
    const m = new Map<string, PortalFolder>();
    sharedFolders.forEach((f) => m.set(f.id, f));
    return m;
  }, [sharedFolders]);

  const disciplineNameByCode = React.useMemo(() => {
    const m = new Map<string, string>();
    sharedDisciplines.forEach((d) => m.set(d.code.toUpperCase(), d.name));
    return m;
  }, [sharedDisciplines]);

  // Disciplina de um documento: discipline_code explícito; senão extrai do nome via máscara
  // da pasta (fallback legado, igual ao GED); senão bucket "Sem disciplina".
  const resolveDisciplineCode = React.useCallback((doc: OpuraDocument): string => {
    if (doc.discipline_code) return doc.discipline_code.toUpperCase();
    const folder = doc.folder_id ? folderById.get(doc.folder_id) : undefined;
    if (folder?.naming_mask) {
      const extracted = extractTokenFromFileName(doc.nome, folder.naming_mask, '[DISCIPLINA]');
      if (extracted) return extracted.toUpperCase();
    }
    return NO_DISCIPLINE;
  }, [folderById]);

  // IDs de uma pasta e todas as descendentes (para filtrar docs por pasta incluindo subpastas).
  const getFolderSubtreeIds = React.useCallback((rootId: string): string[] => {
    const ids = [rootId];
    sharedFolders.filter((f) => f.parent_id === rootId).forEach((child) => {
      ids.push(...getFolderSubtreeIds(child.id));
    });
    return ids;
  }, [sharedFolders]);

  // Pastas que aparecem no select: as compartilhadas explicitamente (mesmo vazias —
  // é a diferença entre "compartilhei a pasta" e "compartilhei os arquivos que
  // estavam nela") e as que têm documento compartilhado, sempre com a cadeia de
  // pais, senão o nó fica órfão e some da hierarquia.
  const relevantFolderIds = React.useMemo(() => {
    const ids = new Set<string>();
    const markWithAncestors = (folderId: string) => {
      let cur: string | null = folderId;
      while (cur && folderById.has(cur)) {
        ids.add(cur);
        cur = folderById.get(cur)!.parent_id;
      }
    };
    sharedFolderIds.forEach(markWithAncestors);
    sharedOpuraDocuments.forEach((doc) => {
      if (doc.folder_id && folderById.has(doc.folder_id)) markWithAncestors(doc.folder_id);
    });
    return ids;
  }, [sharedOpuraDocuments, folderById, sharedFolderIds]);

  // Opções do select "Pasta" — mesma forma do GED (`folderSelectOptions` em
  // OpuraDocsModule): hierarquia preservada na indentação do rótulo. A árvore
  // lateral que existia aqui saiu junto com a do GED (b19f216c): ocupava 1/4 da
  // largura para dar uma navegação que dois selects dão.
  const folderSelectOptions = React.useMemo(() => {
    const saida: { id: string; label: string }[] = [];
    const visitar = (parentId: string | null, nivel: number) => {
      sharedFolders
        .filter((f) => (f.parent_id || null) === parentId && relevantFolderIds.has(f.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((f) => {
          saida.push({ id: f.id, label: `${'  '.repeat(nivel)}${nivel ? '└ ' : ''}${f.name}` });
          visitar(f.id, nivel + 1);
        });
    };
    visitar(null, 0);
    return saida;
  }, [sharedFolders, relevantFolderIds]);

  // Opções do select "Disciplina": as que aparecem nos documentos compartilhados,
  // rotuladas `CÓDIGO — Nome` quando o catálogo veio junto (como no GED). O
  // código pode vir de `discipline_code` ou da máscara da pasta — é a mesma
  // resolução que a tabela usa, então o filtro nunca fica mudo para o legado.
  const disciplineFilterOptions = React.useMemo(() => {
    const porCodigo = new Map<string, { code: string; label: string }>();
    sharedOpuraDocuments.forEach((doc) => {
      const code = resolveDisciplineCode(doc);
      if (code === NO_DISCIPLINE || porCodigo.has(code)) return;
      const nome = disciplineNameByCode.get(code);
      porCodigo.set(code, { code, label: nome ? `${code} — ${nome}` : code });
    });
    return Array.from(porCodigo.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [sharedOpuraDocuments, resolveDisciplineCode, disciplineNameByCode]);

  // Documentos filtrados por pasta (subárvore) + disciplina + status + busca — alimenta <DocumentsTable>.
  const filteredSharedDocuments = React.useMemo(() => {
    let result = sharedOpuraDocuments;

    // Pasta e disciplina valem JUNTOS (AND) — a regra do GED desde que a árvore
    // saiu de lá (b19f216c). Aqui já era assim; fica registrado para não voltar
    // a "disciplina manda mais que pasta", que só existia porque clicar numa
    // disciplina da árvore setava a pasta junto.
    if (selectedFolderId) {
      const scope = new Set(getFolderSubtreeIds(selectedFolderId));
      result = result.filter((doc) => doc.folder_id && scope.has(doc.folder_id));
    }
    if (selectedDisciplineCode) {
      result = result.filter((doc) => resolveDisciplineCode(doc) === selectedDisciplineCode);
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
  }, [sharedOpuraDocuments, selectedFolderId, selectedDisciplineCode, docStatusFilter, docSearchQuery, getFolderSubtreeIds, resolveDisciplineCode]);

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
            const bundle = await partnerPortalTokenService.getSharedDocumentsBundle(portalToken!);
            setSharedDocs(bundle.documents);
            setSharedFolders(bundle.folders);
            setSharedDisciplines(bundle.disciplines);
            setSharedFolderIds(bundle.sharedFolderIds);
          } else if (activeTab === 'contratos') {
            setContracts(await partnerPortalTokenService.getContracts(portalToken!));
          } else if (activeTab === 'financeiro') {
            setFinancialsLoading(true);
            try {
              const res = await partnerPortalTokenService.getFinancials(portalToken!);
              setFinancials(res);
            } finally {
              setFinancialsLoading(false);
            }
          } else if (activeTab === 'solicitacoes') {
            setRequests(await partnerPortalTokenService.getRequests(portalToken!));
          }
          return;
        }

        if (activeTab === 'dashboard') {
          // Mesma fonte da aba Documentos (e do modo token, que usa o `.data` da
          // RPC): listSharedDocuments traz SÓ os vínculos avulsos, então o resumo
          // do dashboard ficava menor que a lista real sempre que o parceiro
          // recebia documentos por PASTA.
          const treeData = await partnerService.listSharedDocumentTree(workspace.id);
          setSharedDocs(treeData.documents);
          setSharedFolders(treeData.folders);
          setSharedDisciplines(treeData.disciplines);
          setSharedFolderIds(treeData.sharedFolderIds);
          const reqs = await partnerService.listRequests(workspace.id);
          setRequests(reqs);
          setContracts(await partnerService.listContracts(workspace.id));
        } else if (activeTab === 'conversas') {
          const convs = await partnerService.listConversations(workspace.id);
          setConversations(convs);
          if (convs.length > 0 && !selectedConversation) {
            setSelectedConversation(convs[0]);
          }
        } else if (activeTab === 'documentos') {
          const treeData = await partnerService.listSharedDocumentTree(workspace.id);
          setSharedDocs(treeData.documents);
          setSharedFolders(treeData.folders);
          setSharedDisciplines(treeData.disciplines);
          setSharedFolderIds(treeData.sharedFolderIds);
        } else if (activeTab === 'contratos') {
          setContracts(await partnerService.listContracts(workspace.id));
        } else if (activeTab === 'financeiro') {
          setFinancialsLoading(true);
          try {
            const res = await partnerService.listFinancials(workspace.id);
            setFinancials(res);
          } finally {
            setFinancialsLoading(false);
          }
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
    // No modo autenticado a RPC exige o workspace para confirmar que a conversa
    // é dele — sem workspace carregado não há o que buscar.
    if (!isTokenMode && !workspace) return;

    const loadMessages = async () => {
      const msgs = isTokenMode
        ? await partnerPortalTokenService.getMessages(portalToken!, selectedConversation.id)
        : await partnerService.listMessages(workspace!.id, selectedConversation.id);
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
    // `workspace` entra nas deps: no modo autenticado o carregamento agora depende
    // dele, e sem isso o efeito não roda de novo quando o workspace chega.
  }, [selectedConversation, isTokenMode, portalToken, workspace]);

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
  // Ao (re)carregar as pastas, limpa uma seleção que aponte para pasta que não
  // existe mais (deixou de ser compartilhada) — senão o select mostra "Todas" com
  // um filtro impossível aplicado por baixo.
  React.useEffect(() => {
    setSelectedFolderId((cur) => (cur && !sharedFolders.some((f) => f.id === cur) ? null : cur));
  }, [sharedFolders]);

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
                {/* "Meus dados" vem ANTES de "Minha conta": este é o cadastro da
                    EMPRESA (o que a construtora tem em Meus Fornecedores) e é o
                    que o parceiro procura aqui; "Minha conta" são os 4 campos do
                    usuário que está logado. */}
                <button
                  type="button"
                  onClick={() => { setIsAccountMenuOpen(false); abrirMeusDados(); }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  role="menuitem"
                >
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <span className="flex-1">Meus dados</span>
                </button>
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
            onClick={() => setActiveTab('financeiro')}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150
              ${activeTab === 'financeiro' ? 'bg-orange-500/10 border border-orange-500/20 text-orange-600 font-bold' : 'text-gray-500 hover:text-gray-900 hover:bg-white'}`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Financeiro</span>
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

        {/* Dynamic Content Pane. Casca própria (h-screen, header/aside inclusos) usada
            tanto por staff interno (ProfileGroup.PARTNER) quanto por acesso via link
            público — nenhum dos dois passa pelo <main> do <Layout>, então o gutter
            §20.2 é reaplicado aqui, à mão. */}
        <main className="flex-1 bg-white overflow-y-auto p-4 md:p-6 relative">

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
            <div>
              {/* A árvore "Pastas e disciplinas" que ficava à esquerda saiu — junto
                  com a do GED (b19f216c). Pasta e disciplina são dois selects na
                  toolbar da tabela, que passa a ocupar a largura toda. */}
              <div className="flex flex-col gap-6 min-w-0">
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
                  <div className="p-2 border-b border-gray-100 bg-white space-y-3">
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

                      {/* Pasta — herdou a navegação da árvore lateral. Mesma forma do
                          select do GED, com o acento do parceiro no foco. */}
                      {folderSelectOptions.length > 0 && (
                        <select
                          value={selectedFolderId ?? ''}
                          onChange={(e) => setSelectedFolderId(e.target.value || null)}
                          title="Filtrar por pasta"
                          className="h-9 w-full md:w-52 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all cursor-pointer shrink-0"
                        >
                          <option value="">Todas as pastas</option>
                          {folderSelectOptions.map((f) => (
                            <option key={f.id} value={f.id}>{f.label}</option>
                          ))}
                        </select>
                      )}

                      {/* Disciplina — vale em qualquer pasta (é atributo do documento). */}
                      {disciplineFilterOptions.length > 0 && (
                        <select
                          value={selectedDisciplineCode ?? ''}
                          onChange={(e) => setSelectedDisciplineCode(e.target.value || null)}
                          title="Filtrar por disciplina"
                          className="h-9 w-full md:w-56 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all cursor-pointer shrink-0"
                        >
                          <option value="">Todas as disciplinas</option>
                          {disciplineFilterOptions.map((d) => (
                            <option key={d.code} value={d.code}>{d.label}</option>
                          ))}
                        </select>
                      )}
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
                        {/* Autofit sob comando explícito — nunca automático (§6.1.2 do guia). */}
                        <button
                          onClick={() => partnerDocCols.autoFit()}
                          className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                          title="Ajustar largura das colunas ao conteúdo"
                        >
                          <MoveHorizontal className="w-4 h-4" />
                        </button>
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
                    cols={partnerDocCols}
                    resolveProjectName={(doc) =>
                      doc.project_name || (doc.project_id ? 'Vínculo Externo' : '-')
                    }
                    renderActions={(doc) => (
                      <>
                        {doc.active_version?.storage_path && (
                          <ActionIconButton
                            kind="download"
                            onClick={() => handleDownloadSharedDocument(doc.active_version!.storage_path)}
                          />
                        )}
                        <ActionIconButton kind="qrcode" onClick={() => setSelectedDocForQrCode(doc)} />
                      </>
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
                  { id: 'execucao', label: 'Execução & Entrega', icon: ClipboardList },
                  { id: 'addendums', label: `Aditivos (${contractAddendums.length})`, icon: FileText },
                  { id: 'measurements', label: `Medições (${contractMeasurements.length})`, icon: Ruler },
                  { id: 'retention', label: 'Retenção de Garantia', icon: DollarSign },
                  { id: 'penalties', label: `Penalidades (${contractDetail.penalties.length})`, icon: AlertTriangle },
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

                  {/* EXECUÇÃO & ENTREGA — os mesmos blocos de Suprimentos › Contratos,
                      em leitura: o parceiro vê o que tem de cumprir (pré-mobilização,
                      documentos condicionantes) e o que já foi recebido. */}
                  {detailTab === 'execucao' && (
                    <div className="flex flex-col gap-4">
                      {(detailContract.description || (detailContract as any).services_included || (detailContract as any).services_excluded
                        || (detailContract as any).execution_address || (detailContract as any).sla_days || (detailContract as any).warranty_months) && (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                          <h4 className="text-xs font-bold text-gray-900">Escopo do Serviço</h4>
                          {detailContract.description && <p className="text-xs text-gray-600 whitespace-pre-line">{detailContract.description}</p>}
                          {(detailContract as any).services_included && (
                            <p className="text-xs text-gray-600"><span className="text-gray-400">Inclui: </span>{(detailContract as any).services_included}</p>
                          )}
                          {(detailContract as any).services_excluded && (
                            <p className="text-xs text-gray-600"><span className="text-gray-400">Não inclui: </span>{(detailContract as any).services_excluded}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-[11px] text-gray-500 pt-1">
                            {(detailContract as any).execution_address && <span>Local: {(detailContract as any).execution_address}</span>}
                            {(detailContract as any).sla_days ? <span>SLA: {(detailContract as any).sla_days} dias</span> : null}
                            {(detailContract as any).warranty_months ? <span>Garantia: {(detailContract as any).warranty_months} meses</span> : null}
                          </div>
                        </div>
                      )}

                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-gray-900">Pré-mobilização</h4>
                          {detailContract.start_order_issued_at ? (
                            <span className="text-xs text-emerald-700">
                              Ordem de Início emitida em {new Date(detailContract.start_order_issued_at + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Ordem de Início ainda não emitida</span>
                          )}
                        </div>
                        {contractDetail.precedentConditions.length === 0 ? (
                          <p className="text-xs text-gray-400">Nenhuma condição precedente cadastrada.</p>
                        ) : contractDetail.precedentConditions.map((cond) => (
                          <div key={cond.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-100 rounded-lg">
                            <span className="flex items-center gap-2 min-w-0">
                              <CheckCircle2 className={`w-4 h-4 shrink-0 ${cond.satisfied ? 'text-emerald-500' : 'text-gray-300'}`} />
                              <span className="text-xs text-gray-700 truncate">{cond.item}</span>
                            </span>
                            <span className="text-[11px] text-gray-400 shrink-0">{cond.responsible}</span>
                          </div>
                        ))}
                      </div>

                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                        <h4 className="text-xs font-bold text-gray-900">Matriz Documental</h4>
                        {contractDetail.documentRequirements.length === 0 ? (
                          <p className="text-xs text-gray-400">Nenhum documento condicionante cadastrado.</p>
                        ) : contractDetail.documentRequirements.map((doc) => {
                          const hoje = new Date().toISOString().split('T')[0];
                          // Mesma regra da tela interna: mensal sem validade em dia = vencido;
                          // fora do mensal, "Entregue" só com arquivo anexado.
                          const vencido = doc.phase === 'MENSAL' && (!doc.last_valid_until || doc.last_valid_until < hoje);
                          const entregue = doc.phase === 'MENSAL' ? !vencido : !!doc.document_url;
                          return (
                            <div key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-100 rounded-lg">
                              <span className="text-xs text-gray-700 flex items-center gap-2 min-w-0">
                                <span className="truncate">{doc.document}</span>
                                {doc.is_sst_critical && <span className="text-[11px] text-amber-600 shrink-0">SST</span>}
                                {doc.blocks_payment && <span className="text-[11px] text-red-500 shrink-0">bloqueia pagamento</span>}
                              </span>
                              <span className="flex items-center gap-3 shrink-0">
                                <span className="text-[11px] text-gray-400">{DOC_PHASE_LABELS[doc.phase]}</span>
                                <span className={`text-xs ${vencido ? 'text-red-600' : entregue ? 'text-emerald-700' : 'text-amber-700'}`}>
                                  {vencido ? 'Vencido' : entregue ? 'Entregue' : 'Pendente'}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                        <h4 className="text-xs font-bold text-gray-900">Recebimento</h4>
                        {contractDetail.acceptances.length === 0 ? (
                          <p className="text-xs text-gray-400">Nenhum termo de recebimento emitido.</p>
                        ) : contractDetail.acceptances.map((a) => (
                          <div key={a.id} className="px-3 py-2 bg-white border border-gray-100 rounded-lg">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-700">{ACCEPTANCE_KIND_LABELS[a.kind]}</span>
                              <span className="text-[11px] text-gray-400">{new Date(a.issued_at + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                            </div>
                            {(a.pending_items?.length ?? 0) > 0 && (
                              <p className="text-[11px] text-amber-700 mt-1">{a.pending_items.length} pendência(s)</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* RETENÇÃO DE GARANTIA — deste contrato. O ledger é a mesma conta contra
                      a qual a construtora libera; sem botão de liberar (é dela). */}
                  {detailTab === 'retention' && (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white border border-gray-200 rounded-xl p-3">
                          <span className="text-[10px] text-gray-400 uppercase font-semibold block">Retido</span>
                          <span className="text-sm font-black text-gray-900">R$ {contractDetail.retention.totalRetained.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl p-3">
                          <span className="text-[10px] text-gray-400 uppercase font-semibold block">Liberado</span>
                          <span className="text-sm font-black text-gray-900">R$ {contractDetail.retention.totalReleased.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                          <span className="text-[10px] text-orange-600 uppercase font-semibold block">Saldo Retido</span>
                          <span className="text-sm font-black text-orange-700">R$ {contractDetail.retention.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {contractDetail.retention.releases.map((r) => (
                          <div key={r.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-900">Liberação {RETENTION_RELEASE_KIND_LABELS[r.kind]}</p>
                              <p className="text-[10px] text-gray-400">{new Date(r.released_at + 'T12:00:00').toLocaleDateString('pt-BR')}{r.notes ? ` · ${r.notes}` : ''}</p>
                            </div>
                            <span className="text-xs font-black text-gray-900 shrink-0">R$ {Number(r.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                        {contractDetail.retention.releases.length === 0 && (
                          <div className="text-center py-8 text-xs text-gray-400">Nenhuma liberação registrada.</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PENALIDADES — inclusive canceladas, com o status dizendo. Sem ações. */}
                  {detailTab === 'penalties' && (
                    <div className="flex flex-col gap-2">
                      {contractDetail.penalties.map((pen) => (
                        <div key={pen.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold text-gray-900">{PENALTY_KIND_LABELS[pen.kind]}</span>
                            <span className={`text-xs ${PENALTY_STATUS_COLORS[pen.status]}`}>{PENALTY_STATUS_LABELS[pen.status]}</span>
                          </div>
                          {pen.reason && <p className="text-[11px] text-gray-500 mb-1">{pen.reason}</p>}
                          <div className="flex flex-wrap gap-4 text-[10px] text-gray-400">
                            <span>Valor: R$ {Number(pen.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            {pen.cure_deadline && <span>Prazo de cura: {new Date(pen.cure_deadline + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                            {pen.applied_at && <span>Aplicada em: {new Date(pen.applied_at).toLocaleDateString('pt-BR')}</span>}
                          </div>
                        </div>
                      ))}
                      {contractDetail.penalties.length === 0 && (
                        <div className="text-center py-8 text-xs text-gray-400">Nenhuma penalidade registrada.</div>
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

          {/* TAB: FINANCEIRO */}
          {activeTab === 'financeiro' && (
            <div className="flex flex-col gap-6">
              <h3 className="text-md font-bold text-gray-900">Financeiro</h3>

              {financialsLoading ? (
                <div className="text-center py-12 text-xs text-gray-400">Carregando...</div>
              ) : (
                <>
                  {invoiceUploadError && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium rounded-xl p-3">
                      {invoiceUploadError}
                    </div>
                  )}

                  {/* Resumo de retenção */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-200 rounded-xl p-3">
                      <span className="text-[10px] text-gray-400 uppercase font-semibold block">Retenção Acumulada</span>
                      <span className="text-sm font-black text-gray-900">R$ {financials.retention.retained.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-3">
                      <span className="text-[10px] text-gray-400 uppercase font-semibold block">Retenção Liberada</span>
                      <span className="text-sm font-black text-gray-900">R$ {financials.retention.released.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                      <span className="text-[10px] text-orange-600 uppercase font-semibold block">Saldo Retido</span>
                      <span className="text-sm font-black text-orange-700">R$ {financials.retention.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Parcelas / contas a pagar */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Parcelas</h4>
                    <div className="flex flex-col gap-2">
                      {financials.installments.map((t) => (
                        <div key={t.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{t.description || 'Parcela do contrato'}</p>
                            <p className="text-[10px] text-gray-400">Vencimento: {t.transaction_date ? new Date(t.transaction_date).toLocaleDateString() : '-'}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                              ${t.business_status === 'PAGO' || t.status !== 'PENDING' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {t.business_status === 'PAGO' || t.status !== 'PENDING' ? 'Pago' : 'Pendente'}
                            </span>
                            <span className="text-xs font-black text-gray-900">R$ {Number(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      ))}
                      {financials.installments.length === 0 && (
                        <div className="text-center py-8 text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl">Nenhuma parcela encontrada.</div>
                      )}
                    </div>
                  </div>

                  {/* Medições — saldo a faturar e envio de NF */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Medições</h4>
                    <div className="flex flex-col gap-2">
                      {financials.measurements.map((m) => (
                        <div key={m.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-xs font-bold text-gray-900">Medição Nº {m.number}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
                              ${m.status === 'Paga' || m.status === 'Processada' ? 'bg-green-100 text-green-700' : m.status === 'Cancelada' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {m.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mb-2">
                            Período: {m.period_start ? new Date(m.period_start).toLocaleDateString() : '-'} até {m.period_end ? new Date(m.period_end).toLocaleDateString() : '-'}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-[10px] text-gray-400">
                            <span>Bruto: R$ {Number(m.total_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span>Retenção: R$ {Number(m.retention_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span>Líquido: R$ {Number(m.net_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            {m.invoice_url ? (
                              <a href={m.invoice_url} target="_blank" rel="noreferrer" className="text-orange-500 hover:text-orange-600 font-semibold">Ver Nota</a>
                            ) : isPreview ? (
                              <span className="text-gray-300">Anexar NF disponível apenas no acesso real do parceiro</span>
                            ) : (
                              <label className={`flex items-center gap-1.5 font-semibold cursor-pointer ${uploadingInvoiceFor === m.id ? 'text-gray-300' : 'text-blue-600 hover:text-blue-700'}`}>
                                <Upload className="w-3 h-3" />
                                {uploadingInvoiceFor === m.id ? 'Enviando...' : 'Anexar NF'}
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={uploadingInvoiceFor === m.id}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = '';
                                    if (file) handleUploadInvoice(m.id, m.contract_id, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      ))}
                      {financials.measurements.length === 0 && (
                        <div className="text-center py-8 text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl">Nenhuma medição registrada.</div>
                      )}
                    </div>
                  </div>
                </>
              )}
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

      {/* MODAL: ETIQUETA QR CODE (mesmo componente do GED — só leitura, sem escrita no banco) */}
      {selectedDocForQrCode && (
        <DocumentQrLabelModal doc={selectedDocForQrCode} onClose={() => setSelectedDocForQrCode(null)} />
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

      {/* Meus dados — painel lateral (UI_PATTERNS / §26). NUNCA tela cheia:
          é consulta a um cadastro, não uma tarefa que toma a tela. O conteúdo é
          o MESMO componente do Portal do Fornecedor, com o acento do parceiro —
          duas telas com este conteúdo divergiriam em pouco tempo. */}
      <Sheet open={showMyData} onClose={() => setShowMyData(false)} size="xl">
        <SheetHeader onClose={() => setShowMyData(false)}>
          <SheetTitle>Meus dados</SheetTitle>
          <SheetDescription>
            O cadastro que a construtora tem da sua empresa. Para alterar, fale com ela.
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="px-4 py-5 md:px-6">
          {myDataError ? (
            <div className="px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
              {myDataError}
            </div>
          ) : myDataLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
              <p className="mt-2 text-gray-500 text-sm">Carregando...</p>
            </div>
          ) : (
            <PortalMyData
              supplier={myData.supplier}
              bankAccounts={myData.bankAccounts}
              loadingBankAccounts={false}
              accent="partner"
            />
          )}
        </SheetPanel>
      </Sheet>

      {menuMsg && (
        <div className="fixed bottom-6 right-6 z-[300] flex items-center gap-2 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium bg-gray-900 text-white animate-in slide-in-from-bottom-4 duration-300">
          <HelpCircle className="w-4 h-4 shrink-0" /> {menuMsg}
        </div>
      )}

    </div>
  );
};

// components/OpuraAssetsModule.tsx

import React from 'react';
import ActionIconButton from './ui/ActionIconButton';
import {
  Package,
  Wrench,
  Truck,
  Building2,
  Calendar,
  AlertTriangle,
  Search,
  Plus,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Loader2,
  QrCode,
  FileText,
  Clock,
  CheckCircle2,
  User,
  MapPin,
  Trash2,
  Edit,
  History,
  CheckCircle,
  X,
  FileSpreadsheet,
  Copy,
  Shield,
  PenTool,
  ExternalLink,
  TrendingDown,
  LayoutGrid,
  List,
  MoveHorizontal
} from 'lucide-react';
import { assetService } from '../services/assetService';
import { laborService } from '../services/laborService';
import { useStore } from '../store/useStore';
import { AssetImportModal } from './AssetImportModal';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { ColumnConfig, useTableColumns, useResizableColumns, ColumnConfigButton, SortableHeader, usePersistedState } from './ui/TableUtils';
import {
  OpuraAsset,
  AssetCategory,
  AssetStatus,
  OpuraAssetMovement,
  OpuraAssetReservation,
  OpuraAssetMaintenance,
  MaintenanceType,
  MaintenanceStatus,
  AssetDocumentType,
  AssetDocumentStatus,
  OpuraAssetDocument,
  OpuraAssetDepreciationRateio,
  OpuraAssetBrand
} from '../types';

interface OpuraAssetsModuleProps {
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
}

// Tabela "Ativos Patrimoniais" (aba Ativos) — guia §1/§2
const ASSET_COLUMNS: ColumnConfig[] = [
  { key: 'code', label: 'Código', sortable: true },
  { key: 'name', label: 'Ativo', sortable: true },
  { key: 'category', label: 'Categoria', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'value', label: 'Valor Atual', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];
const ASSET_COL_WIDTHS: Record<string, number> = { code: 110, name: 240, category: 140, status: 130, value: 150, actions: 60 };

// Tabela "Reservas & Locação" — guia §1/§2
const RESERVATION_COLUMNS: ColumnConfig[] = [
  { key: 'asset', label: 'Ativo', sortable: true },
  { key: 'project', label: 'Obra Solicitante', sortable: true },
  { key: 'start_date', label: 'Início', sortable: true },
  { key: 'end_date', label: 'Término', sortable: true },
  { key: 'responsible', label: 'Responsável', sortable: true },
  { key: 'requester', label: 'Solicitante', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];
const RESERVATION_COL_WIDTHS: Record<string, number> = { asset: 180, project: 170, start_date: 100, end_date: 100, responsible: 150, requester: 170, status: 110, actions: 190 };

// Tabela "Manutenções" — guia §1/§2
const MAINTENANCE_COLUMNS: ColumnConfig[] = [
  { key: 'asset', label: 'Ativo', sortable: true },
  { key: 'type', label: 'Tipo', sortable: true },
  { key: 'description', label: 'Serviço / Descrição', sortable: true },
  { key: 'scheduled_date', label: 'Data Programada', sortable: true },
  { key: 'cost', label: 'Custo', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'actions', label: 'Ações', sortable: false },
];
const MAINTENANCE_COL_WIDTHS: Record<string, number> = { asset: 190, type: 110, description: 260, scheduled_date: 140, cost: 120, status: 120, actions: 180 };

// Tabela "Custos & Rateio" — sem coluna de ações (tela só de leitura/relatório)
const RATEIO_COLUMNS: ColumnConfig[] = [
  { key: 'project_name', label: 'Obra / Projeto', sortable: true },
  { key: 'assets_count', label: 'Nº Ativos Usados', sortable: true },
  { key: 'total_days', label: 'Dias Acumulados', sortable: true },
  { key: 'allocated_cost', label: 'Custo Alocado (Depreciação)', sortable: true },
  { key: 'percentage', label: 'Participação no Custo', sortable: true },
];
const RATEIO_COL_WIDTHS: Record<string, number> = { project_name: 220, assets_count: 150, total_days: 150, allocated_cost: 210, percentage: 200 };

// Header (label/sortable/className) da tabela "Ativos Patrimoniais" — mesmo
// className que cada <SortableHeader> original recebia.
const ASSET_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  code: { label: 'Código', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  name: { label: 'Ativo', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  category: { label: 'Categoria', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  value: { label: 'Valor Atual', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

// Conteúdo de cada célula da tabela "Ativos Patrimoniais", extraído do <td> original.
// Header (label/sortable/className) da tabela "Reservas & Locação".
const RESERVATION_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  asset: { label: 'Ativo', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  project: { label: 'Obra Solicitante', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  start_date: { label: 'Início', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  end_date: { label: 'Término', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  responsible: { label: 'Responsável', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  requester: { label: 'Solicitante', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

// Conteúdo de cada célula da tabela "Reservas & Locação", extraído do <td> original.
function renderReservationCell(
  key: string,
  res: OpuraAssetReservation,
  ctx: { asset?: OpuraAsset; proj?: { name?: string } | undefined; employees: any[]; statusColor: Record<string, string> },
): React.ReactNode {
  switch (key) {
    case 'asset':
      return <span className="text-sm font-normal text-gray-700">{ctx.asset?.name || 'Ativo'}</span>;
    case 'project':
      return <span className="text-sm font-normal text-gray-600">{ctx.proj?.name || 'Obra'}</span>;
    case 'start_date':
      return <span className="text-sm font-normal text-gray-600">{new Date(res.start_date).toLocaleDateString('pt-BR')}</span>;
    case 'end_date':
      return <span className="text-sm font-normal text-gray-600">{new Date(res.end_date).toLocaleDateString('pt-BR')}</span>;
    case 'responsible':
      return <span className="text-sm font-normal text-gray-700">{ctx.employees.find(e => e.id === res.responsible_employee_id)?.name || 'Central'}</span>;
    case 'requester':
      return <span className="text-sm font-normal text-gray-500">{res.requested_by_email}</span>;
    case 'status':
      return <span className={`text-sm font-normal ${ctx.statusColor[res.status] || 'text-gray-600'}`}>{res.status === 'ativa' ? 'Em Uso' : res.status}</span>;
    default:
      return null;
  }
}

// Header (label/sortable/className) da tabela "Manutenções".
const MAINTENANCE_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  asset: { label: 'Ativo', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  type: { label: 'Tipo', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  description: { label: 'Serviço / Descrição', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  scheduled_date: { label: 'Data Programada', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  cost: { label: 'Custo', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
  status: { label: 'Status', className: 'px-6 py-2 border-r border-gray-100 overflow-hidden' },
};

// Conteúdo de cada célula da tabela "Manutenções", extraído do <td> original.
function renderMaintenanceCell(
  key: string,
  m: OpuraAssetMaintenance,
  ctx: { asset?: OpuraAsset; typeLabels: Record<string, string>; statusColor: Record<string, string> },
): React.ReactNode {
  switch (key) {
    case 'asset':
      return (
        <div>
          <p className="truncate text-sm font-normal text-gray-700">{ctx.asset?.name || 'Ativo Desconhecido'}</p>
          <p className="text-xs text-gray-400">{ctx.asset?.code || ''}</p>
        </div>
      );
    case 'type':
      return <span className="text-sm font-normal text-gray-600">{ctx.typeLabels[m.type] || m.type}</span>;
    case 'description':
      return <span className="block truncate max-w-[240px] text-sm font-normal text-gray-600" title={m.description}>{m.description}</span>;
    case 'scheduled_date':
      return <span className="text-sm font-normal text-gray-600">{new Date(m.scheduled_date).toLocaleDateString('pt-BR')}</span>;
    case 'cost':
      return <span className="text-sm font-medium text-gray-800">R$ {m.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>;
    case 'status':
      return <span className={`text-sm font-normal ${ctx.statusColor[m.status] || 'text-gray-600'}`}>{m.status === 'em_execucao' ? 'Em Oficina' : m.status}</span>;
    default:
      return null;
  }
}

// Header (label/sortable/className) da tabela "Custos & Rateio" — sem coluna de
// ações, então (diferente das outras 3 tabelas deste arquivo) o último header
// precisa do próprio `last:border-r-0` (não há spacer/actions à direita para
// esconder a borda).
const RATEIO_COLUMN_HEADERS: Record<string, { label: string; sortable?: boolean; className: string }> = {
  project_name: { label: 'Obra / Projeto', className: 'px-6 py-2 overflow-hidden border-r border-gray-100 last:border-r-0' },
  assets_count: { label: 'Nº Ativos Usados', className: 'px-6 py-2 overflow-hidden border-r border-gray-100 last:border-r-0' },
  total_days: { label: 'Dias Acumulados', className: 'px-6 py-2 overflow-hidden border-r border-gray-100 last:border-r-0' },
  allocated_cost: { label: 'Custo Alocado (Depreciação)', className: 'px-6 py-2 overflow-hidden border-r border-gray-100 last:border-r-0' },
  percentage: { label: 'Participação no Custo', className: 'px-6 py-2 overflow-hidden border-r border-gray-100 last:border-r-0' },
};

// Conteúdo de cada célula da tabela "Custos & Rateio", extraído do <td> original.
function renderRateioCell(key: string, r: OpuraAssetDepreciationRateio): React.ReactNode {
  switch (key) {
    case 'project_name':
      return <span className="text-sm font-normal text-gray-700">{r.project_name}</span>;
    case 'assets_count':
      return <span className="text-sm font-normal text-gray-600">{r.assets_count}</span>;
    case 'total_days':
      return <span className="text-sm font-normal text-gray-600">{r.total_days} dias</span>;
    case 'allocated_cost':
      return <span className="text-sm font-medium text-gray-800">R$ {r.allocated_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>;
    case 'percentage':
      return (
        <div className="flex items-center gap-3 text-sm">
          <div className="w-24 bg-gray-100 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${r.percentage}%` }} />
          </div>
          <span className="font-medium text-gray-700">{r.percentage}%</span>
        </div>
      );
    default:
      return null;
  }
}

function renderAssetCell(
  key: string,
  asset: OpuraAsset,
  ctx: { categoryIcons: Record<AssetCategory, any>; calculateDepreciation: (a: OpuraAsset) => { current: number; depreciated: number } },
): React.ReactNode {
  switch (key) {
    case 'code':
      return <span className="text-sm font-normal text-gray-600">{asset.code}</span>;
    case 'name': {
      const Icon = ctx.categoryIcons[asset.category] || Package;
      return (
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0
            ${asset.status === 'disponivel' ? 'bg-emerald-50 text-emerald-600' : asset.status === 'em_uso' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="truncate text-sm font-normal text-gray-700">{asset.name}</span>
        </div>
      );
    }
    case 'category':
      return <span className="text-sm font-normal text-gray-600 capitalize">{asset.category}</span>;
    case 'status': {
      const statusColor = asset.status === 'disponivel' ? 'text-emerald-700' : asset.status === 'em_uso' ? 'text-blue-700' : asset.status === 'manutencao' ? 'text-amber-700' : asset.status === 'baixado' ? 'text-gray-400' : 'text-gray-600';
      return <span className={`text-sm font-normal ${statusColor}`}>{asset.status === 'em_uso' ? 'Em Obra' : asset.status}</span>;
    }
    case 'value':
      return <span className="text-sm font-medium text-gray-800">R$ {ctx.calculateDepreciation(asset).current.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>;
    default:
      return null;
  }
}

function sortRows<T>(rows: T[], sortColumn: string | null, sortDirection: 'asc' | 'desc', getValue: (row: T, key: string) => unknown): T[] {
  if (!sortColumn) return rows;
  const dir = sortDirection === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getValue(a, sortColumn); const bv = getValue(b, sortColumn);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
  });
}

export const OpuraAssetsModule: React.FC<OpuraAssetsModuleProps> = ({
  activeOrganizationId,
  onChangeView
}) => {
  const { projects, organizations } = useStore();
  const isWriteDisabled = !activeOrganizationId || activeOrganizationId === 'all' || activeOrganizationId === 'TODAS';
  
  // Tabs e UI States
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'bens' | 'reservas' | 'manutencoes' | 'custos_rateio'>('dashboard');
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  
  // Dados do banco
  const [assets, setAssets] = React.useState<OpuraAsset[]>([]);
  const [reservations, setReservations] = React.useState<OpuraAssetReservation[]>([]);
  const [maintenances, setMaintenances] = React.useState<OpuraAssetMaintenance[]>([]);
  const [deprRateio, setDeprRateio] = React.useState<OpuraAssetDepreciationRateio[]>([]);
  
  // Estado de Visualização/Ação de Ativo Específico
  const [selectedAsset, setSelectedAsset] = React.useState<OpuraAsset | null>(null);
  const [movements, setMovements] = React.useState<OpuraAssetMovement[]>([]);
  const [selectedAssetDocs, setSelectedAssetDocs] = React.useState<OpuraAssetDocument[]>([]);
  const [isNewAssetModalOpen, setIsNewAssetModalOpen] = React.useState(false);
  const [isMoveAssetModalOpen, setIsMoveAssetModalOpen] = React.useState(false);
  const [isReserveModalOpen, setIsReserveModalOpen] = React.useState(false);
  const [isQrCodeOpen, setIsQrCodeOpen] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);
  const [editingAssetId, setEditingAssetId] = React.useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = React.useState<boolean>(false);

  // Modais de Manutenção e Documentos
  const [isNewMaintModalOpen, setIsNewMaintModalOpen] = React.useState(false);
  const [isFinishMaintModalOpen, setIsFinishMaintModalOpen] = React.useState(false);
  const [selectedMaintenance, setSelectedMaintenance] = React.useState<OpuraAssetMaintenance | null>(null);
  
  const [isNewDocModalOpen, setIsNewDocModalOpen] = React.useState(false);

  // Estados adicionais de marcas e colaboradores (Fase 7)
  const [brands, setBrands] = React.useState<OpuraAssetBrand[]>([]);
  const [isBrandManagerOpen, setIsBrandManagerOpen] = React.useState(false);
  const [newBrandName, setNewBrandName] = React.useState('');
  const [editingBrandId, setEditingBrandId] = React.useState<string | null>(null);
  const [editingBrandName, setEditingBrandName] = React.useState('');
  const [employees, setEmployees] = React.useState<any[]>([]);

  // Filtros de Rateio Contábil
  const [rateioStartDate, setRateioStartDate] = React.useState('');
  const [rateioEndDate, setRateioEndDate] = React.useState('');

  // Estados dos Formulários
  const [assetForm, setAssetForm] = React.useState({
    organization_id: '',
    name: '',
    code: '',
    category: 'equipamento' as AssetCategory,
    subcategory: '',
    brand: '',
    model: '',
    serial_number: '',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_value: 0,
    useful_life_months: 60,
    residual_value: 0,
    notes: '',
    responsible_worker_id: undefined as string | undefined
  });

  const [moveForm, setMoveForm] = React.useState({
    destination_project_id: '',
    notes: ''
  });

  const [reserveForm, setReserveForm] = React.useState({
    project_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0], // + 7 dias
    notes: '',
    responsible_employee_id: ''
  });

  const [maintForm, setMaintForm] = React.useState({
    asset_id: '',
    type: 'preventiva' as MaintenanceType,
    description: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    cost: '' as string | number,
    status: 'agendada' as MaintenanceStatus,
    current_odometer: '' as string | number,
    current_hourmeter: '' as string | number
  });

  const [finishMaintForm, setFinishMaintForm] = React.useState({
    cost: '' as string | number,
    executed_date: new Date().toISOString().split('T')[0],
    current_odometer: '' as string | number,
    current_hourmeter: '' as string | number,
    notes: ''
  });

  const [docForm, setDocForm] = React.useState({
    type: 'seguro' as AssetDocumentType,
    name: '',
    document_number: '',
    expiration_date: '',
    file_url: ''
  });

  // Filtros de listagem
  const [searchQuery, setSearchQuery] = usePersistedState<string>('opuraAssets:search', '');
  const [filterCategory, setFilterCategory] = React.useState<string>('todos');
  const [filterStatus, setFilterStatus] = React.useState<string>('todos');
  const [viewMode, setViewMode] = usePersistedState<'grid' | 'list'>('opuraAssets:viewMode', 'grid');

  // Filtros de manutenção
  const [maintSearchQuery, setMaintSearchQuery] = usePersistedState<string>('opuraAssets:maintSearch', '');
  const [filterMaintType, setFilterMaintType] = React.useState<string>('todos');
  const [filterMaintStatus, setFilterMaintStatus] = React.useState<string>('todos');
  const [reservationSearch, setReservationSearch] = usePersistedState<string>('opuraAssets:reservationSearch', '');
  const [rateioSearch, setRateioSearch] = usePersistedState<string>('opuraAssets:rateioSearch', '');

  const confirm = useConfirm();

  const assetTableColumns = useTableColumns(ASSET_COLUMNS, 'opuraAssetsColumns');
  const assetCols = useResizableColumns(ASSET_COL_WIDTHS, 'opuraAssetsColWidths');
  const reservationTableColumns = useTableColumns(RESERVATION_COLUMNS, 'opuraReservationsColumns');
  const reservationCols = useResizableColumns(RESERVATION_COL_WIDTHS, 'opuraReservationsColWidths');
  const maintenanceTableColumns = useTableColumns(MAINTENANCE_COLUMNS, 'opuraMaintenanceColumns');
  const maintenanceCols = useResizableColumns(MAINTENANCE_COL_WIDTHS, 'opuraMaintenanceColWidths');
  const rateioTableColumns = useTableColumns(RATEIO_COLUMNS, 'opuraRateioColumns');
  const rateioCols = useResizableColumns(RATEIO_COL_WIDTHS, 'opuraRateioColWidths');

  // Carregar marcas de forma memorizada
  const loadBrands = React.useCallback(async () => {
    try {
      const orgIdParam = (!activeOrganizationId || activeOrganizationId === 'all' || activeOrganizationId === 'TODAS')
        ? undefined
        : activeOrganizationId;
      const loadedBrands = await assetService.listBrands(orgIdParam);
      setBrands(loadedBrands);
    } catch (err) {
      console.error('[OpuraAssetsModule] Erro ao carregar marcas:', err);
    }
  }, [activeOrganizationId]);

  // Carregar dados
  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const orgIdParam = (!activeOrganizationId || activeOrganizationId === 'all' || activeOrganizationId === 'TODAS')
        ? undefined
        : activeOrganizationId;

      const loadedAssets = await assetService.list(orgIdParam);
      setAssets(loadedAssets);
      
      const loadedRes = await assetService.listReservations(orgIdParam);
      setReservations(loadedRes);

      const loadedMaint = await assetService.listMaintenances(orgIdParam);
      setMaintenances(loadedMaint);

      // Carregar marcas
      const loadedBrands = await assetService.listBrands(orgIdParam);
      setBrands(loadedBrands);

      // Carregar colaboradores ativos do RH
      const loadedEmps = await laborService.listEmployees(orgIdParam);
      setEmployees(loadedEmps.filter((e: any) => e.status === 'ATIVO'));
    } catch (err) {
      console.error('[OpuraAssetsModule] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers para Gestão de Marcas (Fase 7)
  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganizationId || !newBrandName.trim()) return;
    setActionLoading(true);
    try {
      const created = await assetService.createBrand(activeOrganizationId, newBrandName);
      setNewBrandName('');
      await loadBrands();
      setAssetForm(prev => ({ ...prev, brand: created.name }));
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar marca');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateBrand = async (brandId: string) => {
    if (!editingBrandName.trim()) return;
    setActionLoading(true);
    try {
      const updated = await assetService.updateBrand(brandId, editingBrandName);
      setEditingBrandId(null);
      setEditingBrandName('');
      await loadBrands();
      if (assetForm.brand === brands.find(b => b.id === brandId)?.name) {
        setAssetForm(prev => ({ ...prev, brand: updated.name }));
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar marca');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBrand = async (brandId: string) => {
    if (!await confirm({ title: 'Excluir marca?', message: 'Os ativos associados continuarão com o nome salvo, mas a marca não constará mais na lista.', variant: 'danger', confirmLabel: 'Excluir' })) return;
    setActionLoading(true);
    try {
      await assetService.deleteBrand(brandId);
      await loadBrands();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir marca');
    } finally {
      setActionLoading(false);
    }
  };

  // Carregar histórico de movimentação do ativo selecionado
  const loadAssetMovements = async (assetId: string) => {
    try {
      const history = await assetService.listMovements(assetId);
      setMovements(history);
    } catch (err) {
      console.error('[OpuraAssetsModule] Erro ao carregar histórico de movimentações:', err);
    }
  };

  // Carregar documentos do ativo selecionado
  const loadAssetDocuments = async (assetId: string) => {
    try {
      const docs = await assetService.listDocuments(assetId);
      setSelectedAssetDocs(docs);
    } catch (err) {
      console.error('[OpuraAssetsModule] Erro ao carregar documentos do ativo:', err);
    }
  };

  // Carregar rateio de depreciação contábil por obra
  const loadRateioData = React.useCallback(async () => {
    if (!activeOrganizationId) {
      setDeprRateio([]);
      return;
    }
    try {
      const loadedRateio = await assetService.calculateDepreciationRateio(
        activeOrganizationId,
        rateioStartDate || undefined,
        rateioEndDate || undefined
      );
      setDeprRateio(loadedRateio);
    } catch (err) {
      console.error('[OpuraAssetsModule] Erro ao carregar dados de rateio:', err);
    }
  }, [activeOrganizationId, rateioStartDate, rateioEndDate]);

  React.useEffect(() => {
    if (activeTab === 'custos_rateio') {
      loadRateioData();
    }
  }, [activeTab, loadRateioData]);

  // Cadastrar / Editar / Duplicar Ativo
  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetOrgId = activeOrganizationId || assetForm.organization_id;
    if (!targetOrgId) {
      alert('Por favor, selecione a Organização Proprietária do bem.');
      return;
    }
    setActionLoading(true);
    try {
      if (editingAssetId) {
        const updated = await assetService.update(editingAssetId, {
          name: assetForm.name,
          code: assetForm.code || undefined,
          category: assetForm.category,
          subcategory: assetForm.subcategory || undefined,
          brand: assetForm.brand || undefined,
          model: assetForm.model || undefined,
          serial_number: assetForm.serial_number || undefined,
          purchase_date: assetForm.purchase_date || undefined,
          purchase_value: Number(assetForm.purchase_value) || 0,
          useful_life_months: Number(assetForm.useful_life_months) || undefined,
          residual_value: Number(assetForm.residual_value) || 0,
          notes: assetForm.notes || undefined
        });
        alert('Ativo patrimonial updated com sucesso!');
        if (selectedAsset && selectedAsset.id === editingAssetId) {
          setSelectedAsset(updated);
        }
      } else {
        const generatedCode = assetForm.code || `OPR-PAT-${Math.floor(100000 + Math.random() * 900000)}`;
        await assetService.create({
          organization_id: targetOrgId,
          code: generatedCode,
          name: assetForm.name,
          category: assetForm.category,
          subcategory: assetForm.subcategory || undefined,
          brand: assetForm.brand || undefined,
          model: assetForm.model || undefined,
          serial_number: assetForm.serial_number || undefined,
          purchase_date: assetForm.purchase_date || undefined,
          purchase_value: Number(assetForm.purchase_value) || 0,
          useful_life_months: Number(assetForm.useful_life_months) || undefined,
          residual_value: Number(assetForm.residual_value) || 0,
          status: 'disponivel',
          tracking_code: generatedCode,
          notes: assetForm.notes || undefined
        });
        alert(isDuplicate ? 'Ativo duplicado com sucesso!' : 'Ativo patrimonial cadastrado com sucesso!');
      }
      
      setIsNewAssetModalOpen(false);
      setEditingAssetId(null);
      setIsDuplicate(false);
      setAssetForm({
        organization_id: '',
        name: '',
        code: '',
        category: 'equipamento',
        subcategory: '',
        brand: '',
        model: '',
        serial_number: '',
        purchase_date: new Date().toISOString().split('T')[0],
        purchase_value: 0,
        useful_life_months: 60,
        residual_value: 0,
        notes: '',
        responsible_worker_id: undefined
      });
      loadData();
    } catch (err: any) {
      alert(`Erro ao salvar ativo: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Registrar Movimentação para Obra
  const handleMoveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    const targetOrgId = activeOrganizationId || selectedAsset.organization_id;
    if (!targetOrgId) return;
    setActionLoading(true);
    try {
      await assetService.createMovement({
        organization_id: targetOrgId,
        asset_id: selectedAsset.id,
        origin_project_id: selectedAsset.current_project_id || undefined,
        destination_project_id: moveForm.destination_project_id || undefined,
        movement_date: new Date().toISOString(),
        notes: moveForm.notes || undefined
      });
      alert('Movimentação registrada com sucesso!');
      setIsMoveAssetModalOpen(false);
      setMoveForm({ destination_project_id: '', notes: '' });
      // Atualiza o ativo selecionado na visualização
      const updated = await assetService.getById(selectedAsset.id);
      setSelectedAsset(updated);
      loadAssetMovements(selectedAsset.id);
      loadAssetDocuments(selectedAsset.id);
      loadData();
    } catch (err: any) {
      alert(`Erro ao registrar movimentação: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Registrar Reserva de Ativo
  const handleReserveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    const targetOrgId = activeOrganizationId || selectedAsset.organization_id;
    if (!targetOrgId) return;
    setActionLoading(true);
    try {
      // Obter email fictício de teste ou do user logado
      const email = 'gestor.ativos@alpaconstrutora.com.br';
      await assetService.createReservation({
        organization_id: targetOrgId,
        asset_id: selectedAsset.id,
        project_id: reserveForm.project_id,
        start_date: reserveForm.start_date,
        end_date: reserveForm.end_date,
        status: 'aprovada', // Aprovado automático para simplificação do fluxo MVP
        requested_by_email: email,
        approved_by_email: email,
        notes: reserveForm.notes || undefined,
        responsible_employee_id: reserveForm.responsible_employee_id || undefined
      });
      alert('Reserva efetuada com sucesso!');
      setIsReserveModalOpen(false);
      setReserveForm({
        project_id: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        notes: '',
        responsible_employee_id: ''
      });
      loadData();
    } catch (err: any) {
      alert(`Erro ao efetuar reserva: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Excluir Ativo com verificação
  const handleDeleteAsset = async (asset: OpuraAsset) => {
    if (asset.status === 'em_uso') {
      alert('Este ativo está alocado em uma obra e não pode ser excluído no momento. Registre a devolução dele primeiro.');
      return;
    }
    
    if (!await confirm({ title: 'Excluir ativo?', message: `O ativo "${asset.name}" será excluído. Esta ação não pode ser desfeita.`, variant: 'danger', confirmLabel: 'Excluir' })) {
      return;
    }

    setActionLoading(true);
    try {
      await assetService.delete(asset.id);
      alert('Ativo excluído com sucesso!');
      setSelectedAsset(null);
      loadData();
    } catch (err: any) {
      alert(`Erro ao excluir ativo: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Iniciar Reserva (Entregar ativo à obra)
  const handleStartReservation = async (reservation: OpuraAssetReservation) => {
    if (!await confirm({ title: 'Entregar ativo à obra?', message: 'O status do ativo será alterado para "Em Uso".', confirmLabel: 'Entregar' })) {
      return;
    }
    setActionLoading(true);
    try {
      const email = 'gestor.ativos@alpaconstrutora.com.br';
      await assetService.startReservation(reservation, email);
      alert('Locação/Entrega iniciada com sucesso! O ativo foi alocado na obra.');
      loadData();
    } catch (err: any) {
      alert(`Erro ao iniciar reserva: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Finalizar Reserva (Devolução do ativo à sede)
  const handleFinalizeReservation = async (reservation: OpuraAssetReservation) => {
    if (!await confirm({ title: 'Devolver ativo à sede?', message: 'O status do ativo voltará a ser "Disponível".', confirmLabel: 'Devolver' })) {
      return;
    }
    setActionLoading(true);
    try {
      await assetService.finalizeReservation(reservation);
      alert('Devolução registrada com sucesso! O ativo retornou ao estoque da sede.');
      loadData();
    } catch (err: any) {
      alert(`Erro ao finalizar reserva: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Cancelar Reserva
  const handleCancelReservation = async (reservationId: string) => {
    if (!await confirm({ title: 'Cancelar reserva?', message: 'Esta ação não pode ser desfeita.', variant: 'warning', confirmLabel: 'Cancelar reserva' })) {
      return;
    }
    setActionLoading(true);
    try {
      await assetService.cancelReservation(reservationId);
      alert('Reserva cancelada com sucesso!');
      loadData();
    } catch (err: any) {
      alert(`Erro ao cancelar reserva: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Cadastrar Nova Ordem de Manutenção
  const handleCreateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintForm.asset_id) {
      alert('Por favor, selecione um ativo para realizar a manutenção.');
      return;
    }
    const targetAsset = assets.find(a => a.id === maintForm.asset_id);
    const targetOrgId = activeOrganizationId || targetAsset?.organization_id;
    if (!targetOrgId) return;
    setActionLoading(true);
    try {
      await assetService.createMaintenance({
        organization_id: targetOrgId,
        asset_id: maintForm.asset_id,
        type: maintForm.type,
        description: maintForm.description,
        status: maintForm.status,
        scheduled_date: maintForm.scheduled_date,
        cost: Number(maintForm.cost) || 0,
        current_odometer: maintForm.current_odometer ? Number(maintForm.current_odometer) : undefined,
        current_hourmeter: maintForm.current_hourmeter ? Number(maintForm.current_hourmeter) : undefined
      });
      alert('Ordem de manutenção agendada com sucesso!');
      setIsNewMaintModalOpen(false);
      setMaintForm({
        asset_id: '',
        type: 'preventiva',
        description: '',
        scheduled_date: new Date().toISOString().split('T')[0],
        cost: 0,
        status: 'agendada',
        current_odometer: '',
        current_hourmeter: ''
      });
      loadData();
    } catch (err: any) {
      alert(`Erro ao cadastrar manutenção: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Iniciar Manutenção (muda status para em_execucao e ativo para 'manutencao')
  const handleStartMaintenance = async (maint: OpuraAssetMaintenance) => {
    if (!await confirm({ title: 'Iniciar manutenção?', message: 'O ativo ficará indisponível e marcado como "Em Manutenção".', confirmLabel: 'Iniciar' })) {
      return;
    }
    setActionLoading(true);
    try {
      await assetService.updateMaintenance(maint.id, {
        status: 'em_execucao'
      });
      alert('Manutenção iniciada com sucesso!');
      loadData();
    } catch (err: any) {
      alert(`Erro ao iniciar manutenção: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Prepara o fechamento abrindo o modal de preenchimento
  const handleOpenFinishMaintModal = (maint: OpuraAssetMaintenance) => {
    setSelectedMaintenance(maint);
    setFinishMaintForm({
      cost: maint.cost || '',
      executed_date: new Date().toISOString().split('T')[0],
      current_odometer: maint.current_odometer || '',
      current_hourmeter: maint.current_hourmeter || '',
      notes: ''
    });
    setIsFinishMaintModalOpen(true);
  };

  // Concluir Manutenção (registra data real, custo final e libera o ativo)
  const handleFinalizeMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaintenance) return;
    setActionLoading(true);
    try {
      await assetService.updateMaintenance(selectedMaintenance.id, {
        status: 'concluida',
        cost: Number(finishMaintForm.cost) || 0,
        executed_date: finishMaintForm.executed_date,
        current_odometer: finishMaintForm.current_odometer ? Number(finishMaintForm.current_odometer) : undefined,
        current_hourmeter: finishMaintForm.current_hourmeter ? Number(finishMaintForm.current_hourmeter) : undefined,
        checklist_responses: finishMaintForm.notes ? { observacoes_fechamento: finishMaintForm.notes } : undefined
      });
      alert('Manutenção concluída com sucesso! O ativo retornou ao estoque disponível.');
      setIsFinishMaintModalOpen(false);
      setSelectedMaintenance(null);
      loadData();
    } catch (err: any) {
      alert(`Erro ao finalizar manutenção: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Cancelar Manutenção
  const handleCancelMaintenance = async (maintId: string) => {
    if (!await confirm({ title: 'Cancelar manutenção?', message: 'Esta ação não pode ser desfeita.', variant: 'warning', confirmLabel: 'Cancelar manutenção' })) {
      return;
    }
    setActionLoading(true);
    try {
      await assetService.updateMaintenance(maintId, {
        status: 'cancelada'
      });
      alert('Manutenção cancelada com sucesso!');
      loadData();
    } catch (err: any) {
      alert(`Erro ao cancelar manutenção: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Excluir Manutenção
  const handleDeleteMaintenance = async (maintId: string) => {
    if (!await confirm({ title: 'Excluir manutenção do histórico?', message: 'Esta ação é irreversível.', variant: 'danger', confirmLabel: 'Excluir' })) {
      return;
    }
    setActionLoading(true);
    try {
      await assetService.deleteMaintenance(maintId);
      alert('Registro de manutenção excluído com sucesso!');
      loadData();
    } catch (err: any) {
      alert(`Erro ao excluir manutenção: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Cadastrar Novo Documento / Seguro
  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;
    const targetOrgId = activeOrganizationId || selectedAsset.organization_id;
    if (!targetOrgId) return;
    if (!docForm.name) {
      alert('Por favor, informe o nome ou descrição do documento.');
      return;
    }
    setActionLoading(true);
    try {
      let docStatus: AssetDocumentStatus = 'ativo';
      if (docForm.expiration_date) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (docForm.expiration_date < todayStr) {
          docStatus = 'vencido';
        }
      }

      await assetService.createDocument({
        organization_id: targetOrgId,
        asset_id: selectedAsset.id,
        type: docForm.type,
        name: docForm.name,
        document_number: docForm.document_number || undefined,
        expiration_date: docForm.expiration_date || undefined,
        file_url: docForm.file_url || undefined,
        status: docStatus
      });

      alert('Documento cadastrado com sucesso!');
      setIsNewDocModalOpen(false);
      setDocForm({
        type: 'seguro',
        name: '',
        document_number: '',
        expiration_date: '',
        file_url: ''
      });
      loadAssetDocuments(selectedAsset.id);
    } catch (err: any) {
      alert(`Erro ao cadastrar documento: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Excluir Documento / Seguro
  const handleDeleteDocument = async (docId: string) => {
    if (!selectedAsset) return;
    if (!await confirm({ title: 'Excluir documento?', message: 'Esta ação não pode ser desfeita.', variant: 'danger', confirmLabel: 'Excluir' })) {
      return;
    }
    setActionLoading(true);
    try {
      await assetService.deleteDocument(docId);
      alert('Documento excluído com sucesso!');
      loadAssetDocuments(selectedAsset.id);
    } catch (err: any) {
      alert(`Erro ao excluir documento: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Calcular valor depreciado acumulado (Linear)
  const calculateDepreciation = (asset: OpuraAsset) => {
    if (!asset.purchase_date || !asset.useful_life_months) return { current: asset.purchase_value, depreciated: 0 };
    
    const purchase = new Date(asset.purchase_date);
    const today = new Date();
    const diffMonths = (today.getFullYear() - purchase.getFullYear()) * 12 + (today.getMonth() - purchase.getMonth());
    
    if (diffMonths <= 0) return { current: asset.purchase_value, depreciated: 0 };
    
    const depreciableValue = asset.purchase_value - (asset.residual_value || 0);
    const monthlyDepreciation = depreciableValue / asset.useful_life_months;
    const accumulatedDepreciation = Math.min(depreciableValue, monthlyDepreciation * diffMonths);
    
    return {
      current: Math.max(asset.residual_value || 0, asset.purchase_value - accumulatedDepreciation),
      depreciated: accumulatedDepreciation
    };
  };

  // Filtros de busca no cliente
  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          asset.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (asset.brand && asset.brand.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = filterCategory === 'todos' || asset.category === filterCategory;
    const matchesStatus = filterStatus === 'todos' || asset.status === filterStatus;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const sortedAssets = sortRows(filteredAssets, assetTableColumns.sortColumn, assetTableColumns.sortDirection, (a, key) =>
    key === 'value' ? calculateDepreciation(a).current : (a as unknown as Record<string, unknown>)[key]);

  // Métricas para o Dashboard
  const totalPatrimony = assets.reduce((acc, a) => acc + a.purchase_value, 0);
  const totalDepreciated = assets.reduce((acc, a) => acc + calculateDepreciation(a).depreciated, 0);
  const activeCount = assets.filter(a => a.status === 'disponivel' || a.status === 'em_uso').length;
  const maintenanceCount = assets.filter(a => a.status === 'manutencao').length;
  const ociosoCount = assets.filter(a => a.status === 'ocioso').length;

  const categoryIcons: Record<AssetCategory, any> = {
    equipamento: Wrench,
    ferramenta: Wrench,
    veiculo: Truck,
    tecnologia: Package,
    imovel: Building2,
    mobiliario: Package
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
            <span>Corporativo</span>
            <span>/</span>
            <span className="text-gray-600 font-bold">Gestão de Bens</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1.5 flex items-center gap-2">
            Gestão de Ativos
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            disabled={isWriteDisabled}
            title={isWriteDisabled ? "Selecione uma organização específica para importar ativos" : "Importar ativos via Excel"}
            className="px-6 py-3 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-[1.25rem] font-black text-button uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importar Planilha
          </button>

          <Button
            onClick={() => setIsNewAssetModalOpen(true)}
            disabled={isWriteDisabled}
            title={isWriteDisabled ? "Selecione uma organização específica para cadastrar ativos" : "Cadastrar novo ativo"}
          >
            <Plus className="w-4 h-4" />
            Cadastrar Ativo
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6 overflow-x-auto">
        {(['dashboard', 'bens', 'reservas', 'manutencoes', 'custos_rateio'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 font-black text-button uppercase tracking-widest transition-colors border-b-2
              ${activeTab === tab 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-700 hover:text-gray-900'}`}
          >
            {tab === 'bens' ? 'Ativos Patrimoniais' : tab === 'reservas' ? 'Reservas & Locação' : tab === 'manutencoes' ? 'Manutenções' : tab === 'custos_rateio' ? 'Custos & Rateio' : tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Carregando painel de ativos...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Cards de Métricas */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-xs font-black uppercase tracking-widest">Patrimônio Total</span>
                    <DollarSign className="w-4 h-4 text-blue-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">
                    R$ {totalPatrimony.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-xs font-black uppercase tracking-widest">Depreciação Acum.</span>
                    <TrendingUp className="w-4 h-4 text-rose-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-rose-600">
                    R$ {totalDepreciated.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-xs font-black uppercase tracking-widest">Bens Ativos</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">{activeCount}</h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-xs font-black uppercase tracking-widest">Em Manutenção</span>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">{maintenanceCount}</h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-xs font-black uppercase tracking-widest">Bens Ociosos</span>
                    <Package className="w-4 h-4 text-gray-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">{ociosoCount}</h3>
                </div>
              </div>

              {/* Seção Operacional */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Obras com ativos */}
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider mb-4">Localização de Ativos por Projeto</h3>
                  <div className="space-y-4">
                    {projects.map(proj => {
                      const count = assets.filter(a => a.current_project_id === proj.id).length;
                      if (count === 0) return null;
                      return (
                        <div key={proj.id} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl border border-gray-100 hover:border-blue-100 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div>
                              <h4 className="font-bold text-gray-800 text-sm">{proj.name}</h4>
                              <p className="text-gray-400 text-xs font-medium">{proj.settings?.city || ''} - {proj.settings?.state || ''}</p>
                            </div>
                          </div>
                          <span className="bg-blue-100 text-blue-700 text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg">
                            {count} {count === 1 ? 'Ativo' : 'Ativos'}
                          </span>
                        </div>
                      );
                    })}
                    {assets.filter(a => !a.current_project_id && a.status !== 'baixado').length > 0 && (
                      <div className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 text-gray-500 rounded-xl">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-700 text-sm">Sede / Central de Equipamentos</h4>
                            <p className="text-gray-400 text-xs font-medium">Estoque Geral de Bens</p>
                          </div>
                        </div>
                        <span className="bg-gray-100 text-gray-700 text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg">
                          {assets.filter(a => !a.current_project_id && a.status !== 'baixado').length} Ativos
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reservas Ativas */}
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                  <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider mb-4">Próximas Reservas</h3>
                  <div className="space-y-3">
                    {reservations.slice(0, 5).map(res => {
                      const asset = assets.find(a => a.id === res.asset_id);
                      const proj = projects.find(p => p.id === res.project_id);
                      return (
                        <div key={res.id} className="p-4 border border-gray-50 rounded-2xl text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-800">{asset?.name || 'Ativo'}</span>
                            <span className="text-xs font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Reserva</span>
                          </div>
                          <div className="flex justify-between text-gray-500">
                            <span>Destino: <strong>{proj?.name || 'Obra'}</strong></span>
                            <span>{new Date(res.start_date).toLocaleDateString('pt-BR')} até {new Date(res.end_date).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      );
                    })}
                    {reservations.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
                        <Calendar className="w-8 h-8 text-gray-300 mb-2" />
                        <p className="text-xs font-semibold">Nenhuma reserva ativa registrada.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. TAB: LISTAGEM DE BENS */}
          {activeTab === 'bens' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Painel da Esquerda: Filtros e Listagem */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="relative flex-1 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex items-center gap-2">
                    <Search className="w-4 h-4 text-gray-400" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Pesquisar por nome, código ou marca..."
                      className="bg-transparent border-none outline-none text-sm w-full font-medium"
                    />
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-form-input font-bold text-gray-600 bg-white"
                    >
                      <option value="todos">Todas Categorias</option>
                      <option value="equipamento">Equipamento</option>
                      <option value="ferramenta">Ferramenta</option>
                      <option value="veiculo">Veículo</option>
                      <option value="tecnologia">Tecnologia</option>
                      <option value="imovel">Imóvel</option>
                      <option value="mobiliario">Mobiliário</option>
                    </select>

                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-form-input font-bold text-gray-600 bg-white"
                    >
                      <option value="todos">Todos Status</option>
                      <option value="disponivel">Disponível</option>
                      <option value="em_uso">Em Uso</option>
                      <option value="manutencao">Manutenção</option>
                      <option value="ocioso">Ocioso</option>
                      <option value="baixado">Baixado</option>
                    </select>

                    {/* Colunas + autofit — só fazem sentido no modo Lista (§6.1.2) */}
                    {viewMode === 'list' && (
                      <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                        <ColumnConfigButton
                          columns={ASSET_COLUMNS.filter(c => c.key !== 'actions')}
                          visibleColumns={assetTableColumns.visibleColumns}
                          showColumnConfig={assetTableColumns.showColumnConfig}
                          onToggleShow={() => assetTableColumns.setShowColumnConfig(!assetTableColumns.showColumnConfig)}
                          onToggleColumn={assetTableColumns.toggleColumn}
                          onReset={assetTableColumns.resetColumns}
                        />
                        <button
                          onClick={() => assetCols.autoFit()}
                          className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all"
                          title="Ajustar largura das colunas ao conteúdo"
                        >
                          <MoveHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Alternância de Visualização */}
                    <div className="flex items-center border border-gray-200 bg-white rounded-xl overflow-hidden p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`p-2 transition-all rounded-lg ${viewMode === 'grid' ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 bg-transparent'}`}
                        title="Visualização em Blocos"
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={`p-2 transition-all rounded-lg ${viewMode === 'list' ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 bg-transparent'}`}
                        title="Visualização em Linhas"
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                {/* Grid ou Lista de Ativos */}
                {viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {sortedAssets.map(asset => {
                      const Icon = categoryIcons[asset.category] || Package;
                      const depreciation = calculateDepreciation(asset);
                      return (
                        <div
                          key={asset.id}
                          onClick={async () => {
                            setSelectedAsset(asset);
                            loadAssetMovements(asset.id);
                            loadAssetDocuments(asset.id);
                          }}
                          className={`bg-white p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between h-44 hover:shadow-xl group
                            ${selectedAsset?.id === asset.id ? 'border-blue-500 shadow-md' : 'border-gray-100 shadow-sm'}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110
                                ${asset.status === 'disponivel' ? 'bg-emerald-50 text-emerald-600' : asset.status === 'em_uso' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="font-bold text-gray-800 text-sm group-hover:text-blue-600 transition-colors truncate max-w-[180px]">{asset.name}</h4>
                                <p className="text-gray-400 text-xs font-semibold">{asset.code}</p>
                              </div>
                            </div>

                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md
                              ${asset.status === 'disponivel' ? 'bg-emerald-500/10 text-emerald-600' : asset.status === 'em_uso' ? 'bg-blue-500/10 text-blue-600' : 'bg-amber-500/10 text-amber-600'}`}>
                              {asset.status === 'em_uso' ? 'Em Obra' : asset.status}
                            </span>
                          </div>

                          <div className="flex items-end justify-between mt-4 border-t border-gray-50 pt-3 text-xs">
                            <div>
                              <span className="text-gray-400 block text-[9px] font-bold uppercase tracking-wider">Custo Residual / Atual</span>
                              <span className="font-bold text-gray-700">R$ {depreciation.current.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-blue-500 font-bold text-xs uppercase tracking-wider">
                              Ver Detalhes
                              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredAssets.length === 0 && (
                      <div className="col-span-2 bg-white py-16 text-center text-gray-400 rounded-3xl border border-gray-100">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="font-semibold text-sm">Nenhum ativo encontrado com os filtros aplicados.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                    {sortedAssets.length === 0 ? (
                      <div className="py-16 text-center text-gray-400">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="font-semibold text-sm">Nenhum ativo encontrado com os filtros aplicados.</p>
                      </div>
                    ) : (() => {
                      const visible = ASSET_COLUMNS.filter(c => c.key !== 'actions' && assetTableColumns.visibleColumns.includes(c.key));
                      const tableWidth = visible.reduce((s, c) => s + assetCols.getWidth(c.key), 0) + assetCols.getWidth('actions');
                      const orderedVisibleKeys = assetTableColumns.orderedVisibleColumns.filter(k => k !== 'actions');
                      return (
                        <div className="overflow-x-auto">
                          <table ref={assetCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableWidth }}>
                            <colgroup>
                              {orderedVisibleKeys.map(key => (
                                <col key={key} data-col-key={key} style={{ width: `${assetCols.getWidth(key)}px` }} />
                              ))}
                              <col />
                              <col data-col-key="actions" style={{ width: `${assetCols.getWidth('actions')}px` }} />
                            </colgroup>
                            <thead>
                              <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                {orderedVisibleKeys.map(key => {
                                  const def = ASSET_COLUMN_HEADERS[key];
                                  if (!def) return null;
                                  return (
                                    <SortableHeader key={key} colKey={key} label={def.label} uppercase={false}
                                      sortable={def.sortable !== false}
                                      sortColumn={assetTableColumns.sortColumn} sortDirection={assetTableColumns.sortDirection}
                                      onSort={assetTableColumns.handleColumnSort}
                                      onMoveColumn={assetTableColumns.moveColumn}
                                      className={def.className}>
                                      <assetCols.ResizeHandle colKey={key} />
                                    </SortableHeader>
                                  );
                                })}
                                <th aria-hidden="true" className="border-r border-gray-100" />
                                {assetTableColumns.visibleColumns.includes('actions') && (
                                  <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {sortedAssets.map(asset => {
                                return (
                                  <tr
                                    key={asset.id}
                                    onClick={async () => {
                                      setSelectedAsset(asset);
                                      loadAssetMovements(asset.id);
                                      loadAssetDocuments(asset.id);
                                    }}
                                    className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${selectedAsset?.id === asset.id ? 'bg-blue-50/60' : ''}`}
                                  >
                                    {orderedVisibleKeys.map(key => (
                                      <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                        {renderAssetCell(key, asset, { categoryIcons, calculateDepreciation })}
                                      </td>
                                    ))}
                                    <td aria-hidden="true"></td>
                                    {assetTableColumns.visibleColumns.includes('actions') && (
                                      // §9.1 — a linha inteira já seleciona o ativo (ação dominante); a coluna só
                                      // sinaliza visualmente que ela é clicável, sem duplicar como botão.
                                      <td className="px-6 py-2.5 text-right">
                                        <ArrowRight className="w-4 h-4 text-blue-400 ml-auto" />
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              {/* Painel da Direita: Detalhe do Ativo Selecionado */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm h-fit">
                {selectedAsset ? (
                  <div className="space-y-6">
                    <div className="flex items-start justify-between border-b border-gray-50 pb-4">
                      <div>
                        <h3 className="font-bold text-gray-800 text-base">{selectedAsset.name}</h3>
                        <p className="text-gray-400 text-xs font-semibold">{selectedAsset.code}</p>
                      </div>
                      <button
                        onClick={() => setIsQrCodeOpen(true)}
                        className="p-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors"
                        title="Visualizar QR Code Patrimonial"
                      >
                        <QrCode className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Informações base */}
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px]">Categoria</span>
                        <span className="font-bold text-gray-700 uppercase">{selectedAsset.category}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px]">Marca / Modelo</span>
                        <span className="font-bold text-gray-700">{selectedAsset.brand || 'N/D'} {selectedAsset.model || ''}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px]">Valor Aquisição</span>
                        <span className="font-bold text-gray-700">R$ {selectedAsset.purchase_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px]">Vida Útil</span>
                        <span className="font-bold text-gray-700">{selectedAsset.useful_life_months || 60} meses</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-400 block font-bold uppercase tracking-wider text-[9px]">Alocação Atual</span>
                        <span className="font-bold text-gray-700 flex items-center gap-1.5 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-blue-500" />
                          {projects.find(p => p.id === selectedAsset.current_project_id)?.name || 'Sede / Central'}
                        </span>
                      </div>
                    </div>

                    {/* Botões de Ações de Ativo */}
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsMoveAssetModalOpen(true)}
                          className="flex-1 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-black text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          Movimentar
                        </button>
                        <button
                          onClick={() => setIsReserveModalOpen(true)}
                          className="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl font-black text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          Reservar
                        </button>
                        <button
                          onClick={() => {
                            setMaintForm({
                              asset_id: selectedAsset.id,
                              type: 'preventiva',
                              description: '',
                              scheduled_date: new Date().toISOString().split('T')[0],
                              cost: 0,
                              status: 'agendada',
                              current_odometer: '',
                              current_hourmeter: ''
                            });
                            setIsNewMaintModalOpen(true);
                          }}
                          className="flex-1 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-xl font-black text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          Manutenção
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingAssetId(selectedAsset.id);
                            setIsDuplicate(false);
                            setAssetForm({
                              organization_id: selectedAsset.organization_id,
                              name: selectedAsset.name,
                              code: selectedAsset.code,
                              category: selectedAsset.category,
                              subcategory: selectedAsset.subcategory || '',
                              brand: selectedAsset.brand || '',
                              model: selectedAsset.model || '',
                              serial_number: selectedAsset.serial_number || '',
                              purchase_date: selectedAsset.purchase_date ? selectedAsset.purchase_date.split('T')[0] : new Date().toISOString().split('T')[0],
                              purchase_value: selectedAsset.purchase_value || 0,
                              useful_life_months: selectedAsset.useful_life_months || 60,
                              residual_value: selectedAsset.residual_value || 0,
                              notes: selectedAsset.notes || '',
                              responsible_worker_id: selectedAsset.responsible_worker_id
                            });
                            setIsNewAssetModalOpen(true);
                          }}
                          className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 border border-gray-100"
                        >
                          <Edit className="w-3 h-3" />
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            setEditingAssetId(null);
                            setIsDuplicate(true);
                            setAssetForm({
                              organization_id: selectedAsset.organization_id,
                              name: `${selectedAsset.name} (Cópia)`,
                              code: '', // Limpar para gerar novo
                              category: selectedAsset.category,
                              subcategory: selectedAsset.subcategory || '',
                              brand: selectedAsset.brand || '',
                              model: selectedAsset.model || '',
                              serial_number: '', // Limpar serial
                              purchase_date: selectedAsset.purchase_date ? selectedAsset.purchase_date.split('T')[0] : new Date().toISOString().split('T')[0],
                              purchase_value: selectedAsset.purchase_value || 0,
                              useful_life_months: selectedAsset.useful_life_months || 60,
                              residual_value: selectedAsset.residual_value || 0,
                              notes: selectedAsset.notes || '',
                              responsible_worker_id: selectedAsset.responsible_worker_id
                            });
                            setIsNewAssetModalOpen(true);
                          }}
                          className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 border border-gray-100"
                        >
                          <Copy className="w-3 h-3" />
                          Duplicar
                        </button>
                        <button
                          onClick={() => handleDeleteAsset(selectedAsset)}
                          className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Trash2 className="w-3 h-3" />
                          Excluir
                        </button>
                      </div>
                    </div>

                    {/* Linha do Tempo (Timeline) de Movimentações */}
                    <div className="border-t border-gray-100 pt-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-1.5">
                        <History className="w-4 h-4 text-gray-400" />
                        Histórico de Alocação
                      </h4>
                      <div className="space-y-4 max-h-48 overflow-y-auto pr-1">
                        {movements.map((mov, index) => {
                          const destProj = projects.find(p => p.id === mov.destination_project_id);
                          return (
                            <div key={mov.id} className="relative pl-6 pb-2 text-xs">
                              {/* Bolinha da timeline */}
                              <div className="absolute left-0 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 border border-white z-10" />
                              {/* Linha vertical */}
                              {index !== movements.length - 1 && (
                                <div className="absolute left-1 top-2.5 bottom-0 w-[2px] bg-gray-100" />
                              )}
                              <div>
                                <p className="font-bold text-gray-700">Enviado para {destProj?.name || 'Sede / Central'}</p>
                                <p className="text-xs text-gray-400 font-medium mt-0.5">
                                  {new Date(mov.movement_date).toLocaleString('pt-BR')} {mov.notes ? `• ${mov.notes}` : ''}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        {movements.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-4">Nenhuma movimentação registrada.</p>
                        )}
                      </div>
                    </div>

                    {/* Documentos & Seguros */}
                    <div className="border-t border-gray-100 pt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                          <Shield className="w-4 h-4 text-gray-400" />
                          Documentos & Seguros
                        </h4>
                        <button
                          onClick={() => {
                            setDocForm({
                              type: 'seguro',
                              name: '',
                              document_number: '',
                              expiration_date: '',
                              file_url: ''
                            });
                            setIsNewDocModalOpen(true);
                          }}
                          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl transition-all shadow-sm active:scale-95"
                        >
                          + Novo
                        </button>
                      </div>

                      <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                        {selectedAssetDocs.map(doc => {
                          const today = new Date();
                          const expDate = doc.expiration_date ? new Date(doc.expiration_date) : null;
                          const diffTime = expDate ? expDate.getTime() - today.getTime() : null;
                          const diffDays = diffTime ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : null;

                          let docStatusBadge = 'bg-emerald-500/10 text-emerald-600';
                          let docStatusLabel = 'Vigente';

                          if (doc.status === 'vencido' || (diffDays !== null && diffDays < 0)) {
                            docStatusBadge = 'bg-rose-500/10 text-rose-600';
                            docStatusLabel = 'Vencido';
                          } else if (diffDays !== null && diffDays <= 30) {
                            docStatusBadge = 'bg-amber-500/10 text-amber-600';
                            docStatusLabel = `Vence em ${diffDays}d`;
                          }

                          const DocIcon: React.ComponentType<{ className?: string }> =
                            doc.type === 'seguro' ? Shield :
                            doc.type === 'licenciamento' ? FileText :
                            doc.type === 'termo_responsabilidade' ? PenTool : FileText;

                          return (
                            <div key={doc.id} className="p-3 bg-gray-50/50 border border-gray-100 rounded-2xl flex items-center justify-between text-xs hover:border-blue-100 transition-colors">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-1.5 bg-white text-gray-400 rounded-lg border border-gray-100">
                                  <DocIcon className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <h5 className="font-bold text-gray-700 truncate" title={doc.name}>{doc.name}</h5>
                                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400 font-semibold">
                                    {doc.document_number && <span>Nº {doc.document_number}</span>}
                                    {doc.document_number && doc.expiration_date && <span>•</span>}
                                    {doc.expiration_date && <span>Vence: {new Date(doc.expiration_date).toLocaleDateString('pt-BR')}</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`px-2 py-0.5 rounded font-black text-[8px] uppercase tracking-wider ${docStatusBadge}`}>
                                  {docStatusLabel}
                                </span>
                                {doc.file_url && (
                                  <a
                                    href={doc.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                                    title="Visualizar documento anexo"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                <ActionIconButton kind="delete" size="sm" title="Remover documento" onClick={() => handleDeleteDocument(doc.id)} />
                              </div>
                            </div>
                          );
                        })}
                        {selectedAssetDocs.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-4">Nenhum documento ou seguro anexado.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
                    <Package className="w-12 h-12 text-gray-200 mb-3" />
                    <p className="font-semibold text-sm">Selecione um ativo da lista para visualizar detalhes e registrar alocações.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. TAB: RESERVAS */}
          {activeTab === 'reservas' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">Central de Locação Interna</h3>
                <p className="text-gray-400 text-xs">Acompanhe e programe a reserva de ferramentas e máquinas para garantir dupla utilização bloqueada.</p>
              </div>

              {reservations.length > 0 && (
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                  <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={reservationSearch}
                      onChange={(e) => setReservationSearch(e.target.value)}
                      placeholder="Buscar por ativo, obra ou solicitante..."
                      className="w-full h-9 pl-9 pr-4 bg-gray-50 border border-transparent rounded-[6px] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                    <ColumnConfigButton
                      columns={RESERVATION_COLUMNS.filter(c => c.key !== 'actions')}
                      visibleColumns={reservationTableColumns.visibleColumns}
                      showColumnConfig={reservationTableColumns.showColumnConfig}
                      onToggleShow={() => reservationTableColumns.setShowColumnConfig(!reservationTableColumns.showColumnConfig)}
                      onToggleColumn={reservationTableColumns.toggleColumn}
                      onReset={reservationTableColumns.resetColumns}
                    />
                    <button onClick={() => reservationCols.autoFit()} className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all" title="Ajustar largura das colunas ao conteúdo">
                      <MoveHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {reservations.length === 0 ? (
                <div className="py-20 text-center text-gray-400">
                  <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="font-semibold text-sm">Nenhuma solicitação ou reserva ativa registrada.</p>
                </div>
              ) : (() => {
                const term = reservationSearch.trim().toLowerCase();
                const filteredReservations = reservations.filter(res => {
                  if (!term) return true;
                  const asset = assets.find(a => a.id === res.asset_id);
                  const proj = projects.find(p => p.id === res.project_id);
                  return (asset?.name || '').toLowerCase().includes(term)
                    || (proj?.name || '').toLowerCase().includes(term)
                    || (res.requested_by_email || '').toLowerCase().includes(term);
                });
                const sortedReservations = sortRows(filteredReservations, reservationTableColumns.sortColumn, reservationTableColumns.sortDirection, (r, key) => {
                  if (key === 'asset') return assets.find(a => a.id === r.asset_id)?.name || '';
                  if (key === 'project') return projects.find(p => p.id === r.project_id)?.name || '';
                  if (key === 'responsible') return employees.find(e => e.id === r.responsible_employee_id)?.name || 'Central';
                  return (r as unknown as Record<string, unknown>)[key === 'requester' ? 'requested_by_email' : key];
                });
                const visible = RESERVATION_COLUMNS.filter(c => c.key !== 'actions' && reservationTableColumns.visibleColumns.includes(c.key));
                const tableWidth = visible.reduce((s, c) => s + reservationCols.getWidth(c.key), 0) + reservationCols.getWidth('actions');
                const orderedVisibleKeys = reservationTableColumns.orderedVisibleColumns.filter(k => k !== 'actions');
                const statusColor: Record<string, string> = {
                  ativa: 'text-emerald-700', aprovada: 'text-blue-700', pendente: 'text-amber-700',
                  finalizada: 'text-gray-500', cancelada: 'text-rose-600',
                };

                if (sortedReservations.length === 0) {
                  return (
                    <div className="py-16 text-center text-gray-400">
                      <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="font-semibold text-sm">Nenhuma reserva encontrada com os filtros aplicados.</p>
                    </div>
                  );
                }

                return (
                  <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table ref={reservationCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableWidth }}>
                        <colgroup>
                          {orderedVisibleKeys.map(key => (
                            <col key={key} data-col-key={key} style={{ width: `${reservationCols.getWidth(key)}px` }} />
                          ))}
                          <col />
                          <col data-col-key="actions" style={{ width: `${reservationCols.getWidth('actions')}px` }} />
                        </colgroup>
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                            {orderedVisibleKeys.map(key => {
                              const def = RESERVATION_COLUMN_HEADERS[key];
                              if (!def) return null;
                              return (
                                <SortableHeader key={key} colKey={key} label={def.label} uppercase={false}
                                  sortable={def.sortable !== false}
                                  sortColumn={reservationTableColumns.sortColumn} sortDirection={reservationTableColumns.sortDirection} onSort={reservationTableColumns.handleColumnSort}
                                  onMoveColumn={reservationTableColumns.moveColumn}
                                  className={def.className}>
                                  <reservationCols.ResizeHandle colKey={key} />
                                </SortableHeader>
                              );
                            })}
                            <th aria-hidden="true" className="border-r border-gray-100" />
                            {reservationTableColumns.visibleColumns.includes('actions') && (
                              <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {sortedReservations.map(res => {
                            const asset = assets.find(a => a.id === res.asset_id);
                            const proj = projects.find(p => p.id === res.project_id);
                            return (
                              <tr key={res.id} className="hover:bg-blue-50/50 transition-colors">
                                {orderedVisibleKeys.map(key => (
                                  <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                    {renderReservationCell(key, res, { asset, proj, employees, statusColor })}
                                  </td>
                                ))}
                                <td aria-hidden="true"></td>
                                {reservationTableColumns.visibleColumns.includes('actions') && (
                                  <td className="px-6 py-2.5 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      {(res.status === 'aprovada' || res.status === 'pendente') && (
                                        <>
                                          <button onClick={() => handleStartReservation(res)} title="Entregar equipamento à obra"
                                            className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 text-sm font-medium px-1.5 py-1 rounded-lg transition-all">
                                            Entregar
                                          </button>
                                          <button onClick={() => handleCancelReservation(res.id)} title="Cancelar reserva"
                                            className="text-red-600 hover:text-red-800 hover:bg-red-50 text-sm font-medium px-1.5 py-1 rounded-lg transition-all">
                                            Cancelar
                                          </button>
                                        </>
                                      )}
                                      {res.status === 'ativa' && (
                                        <button onClick={() => handleFinalizeReservation(res)} title="Devolver equipamento para a sede"
                                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 text-sm font-medium px-1.5 py-1 rounded-lg transition-all">
                                          Devolver
                                        </button>
                                      )}
                                      {res.status !== 'ativa' && res.status !== 'aprovada' && res.status !== 'pendente' && (
                                        <span className="text-gray-300 text-sm">—</span>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 3.5. TAB: MANUTENÇÕES */}
          {activeTab === 'manutencoes' && (
            <div className="space-y-6">
              {/* Header Interno e Métricas Rápidas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-28 hover:shadow-lg hover:border-blue-100 transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-xs font-black uppercase tracking-widest">Total Gasto em Oficina</span>
                    <DollarSign className="w-4 h-4 text-blue-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">
                    R$ {maintenances.reduce((acc, m) => acc + (m.cost || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-28 hover:shadow-lg hover:border-blue-100 transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-xs font-black uppercase tracking-widest">Em Oficina</span>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">
                    {maintenances.filter(m => m.status === 'em_execucao').length} ordens
                  </h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-28 hover:shadow-lg hover:border-blue-100 transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-xs font-black uppercase tracking-widest">Próximas Agendadas</span>
                    <Calendar className="w-4 h-4 text-blue-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">
                    {maintenances.filter(m => m.status === 'agendada').length} agendamentos
                  </h3>
                </div>
              </div>

              {/* Seção Filtros e Botão Agendar */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                <div className="flex flex-col md:flex-row gap-2.5 items-center">
                  <div className="flex-1 relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={maintSearchQuery}
                      onChange={(e) => setMaintSearchQuery(e.target.value)}
                      placeholder="Pesquisar descrição do serviço ou ativo..."
                      className="w-full h-9 pl-9 pr-4 bg-gray-50 border border-transparent rounded-[6px] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <select
                      value={filterMaintType}
                      onChange={(e) => setFilterMaintType(e.target.value)}
                      className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                      <option value="todos">Todos Tipos</option>
                      <option value="preventiva">Preventiva</option>
                      <option value="corretiva">Corretiva</option>
                      <option value="calibracao">Calibração</option>
                    </select>

                    <select
                      value={filterMaintStatus}
                      onChange={(e) => setFilterMaintStatus(e.target.value)}
                      className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-[6px] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                    >
                      <option value="todos">Todos Status</option>
                      <option value="agendada">Agendada</option>
                      <option value="em_execucao">Em Oficina</option>
                      <option value="concluida">Concluída</option>
                      <option value="cancelada">Cancelada</option>
                    </select>

                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                      <ColumnConfigButton
                        columns={MAINTENANCE_COLUMNS.filter(c => c.key !== 'actions')}
                        visibleColumns={maintenanceTableColumns.visibleColumns}
                        showColumnConfig={maintenanceTableColumns.showColumnConfig}
                        onToggleShow={() => maintenanceTableColumns.setShowColumnConfig(!maintenanceTableColumns.showColumnConfig)}
                        onToggleColumn={maintenanceTableColumns.toggleColumn}
                        onReset={maintenanceTableColumns.resetColumns}
                      />
                      <button onClick={() => maintenanceCols.autoFit()} className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all" title="Ajustar largura das colunas ao conteúdo">
                        <MoveHorizontal className="w-4 h-4" />
                      </button>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => {
                        setMaintForm({
                          asset_id: selectedAsset?.id || '',
                          type: 'preventiva',
                          description: '',
                          scheduled_date: new Date().toISOString().split('T')[0],
                          cost: 0,
                          status: 'agendada',
                          current_odometer: '',
                          current_hourmeter: ''
                        });
                        setIsNewMaintModalOpen(true);
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Agendar Manutenção
                    </Button>
                  </div>
                </div>

                {/* Tabela de Manutenções */}
                {maintenances.length === 0 ? (
                  <div className="py-20 text-center text-gray-400">
                    <Wrench className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                    <p className="font-semibold text-sm">Nenhuma ordem de manutenção registrada.</p>
                  </div>
                ) : (() => {
                  const term = maintSearchQuery.toLowerCase();
                  const filteredMaint = maintenances.filter(m => {
                    const asset = assets.find(a => a.id === m.asset_id);
                    const matchesSearch = m.description.toLowerCase().includes(term) ||
                      (asset && asset.name.toLowerCase().includes(term)) ||
                      (asset && asset.code.toLowerCase().includes(term));
                    const matchesType = filterMaintType === 'todos' || m.type === filterMaintType;
                    const matchesStatus = filterMaintStatus === 'todos' || m.status === filterMaintStatus;
                    return matchesSearch && matchesType && matchesStatus;
                  });
                  const sortedMaint = sortRows(filteredMaint, maintenanceTableColumns.sortColumn, maintenanceTableColumns.sortDirection, (m, key) => {
                    if (key === 'asset') return assets.find(a => a.id === m.asset_id)?.name || '';
                    return (m as unknown as Record<string, unknown>)[key];
                  });
                  const visible = MAINTENANCE_COLUMNS.filter(c => c.key !== 'actions' && maintenanceTableColumns.visibleColumns.includes(c.key));
                  const tableWidth = visible.reduce((s, c) => s + maintenanceCols.getWidth(c.key), 0) + maintenanceCols.getWidth('actions');
                  const orderedVisibleKeys = maintenanceTableColumns.orderedVisibleColumns.filter(k => k !== 'actions');
                  const statusColor: Record<string, string> = {
                    concluida: 'text-emerald-700', em_execucao: 'text-amber-700', agendada: 'text-blue-700', cancelada: 'text-rose-600',
                  };
                  const typeLabels: Record<string, string> = { preventiva: 'Preventiva', corretiva: 'Corretiva', calibracao: 'Calibração' };

                  if (sortedMaint.length === 0) {
                    return (
                      <div className="py-16 text-center text-gray-400">
                        <Wrench className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="font-semibold text-sm">Nenhuma ordem encontrada com os filtros aplicados.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table ref={maintenanceCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableWidth }}>
                          <colgroup>
                            {orderedVisibleKeys.map(key => (
                              <col key={key} data-col-key={key} style={{ width: `${maintenanceCols.getWidth(key)}px` }} />
                            ))}
                            <col />
                            <col data-col-key="actions" style={{ width: `${maintenanceCols.getWidth('actions')}px` }} />
                          </colgroup>
                          <thead>
                            <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                              {orderedVisibleKeys.map(key => {
                                const def = MAINTENANCE_COLUMN_HEADERS[key];
                                if (!def) return null;
                                return (
                                  <SortableHeader key={key} colKey={key} label={def.label} uppercase={false}
                                    sortable={def.sortable !== false}
                                    sortColumn={maintenanceTableColumns.sortColumn} sortDirection={maintenanceTableColumns.sortDirection} onSort={maintenanceTableColumns.handleColumnSort}
                                    onMoveColumn={maintenanceTableColumns.moveColumn}
                                    className={def.className}>
                                    <maintenanceCols.ResizeHandle colKey={key} />
                                  </SortableHeader>
                                );
                              })}
                              <th aria-hidden="true" className="border-r border-gray-100" />
                              {maintenanceTableColumns.visibleColumns.includes('actions') && (
                                <th className="px-6 py-2 text-right text-table-header font-semibold text-gray-500">Ações</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {sortedMaint.map(m => {
                              const asset = assets.find(a => a.id === m.asset_id);
                              return (
                                <tr key={m.id} className="hover:bg-blue-50/50 transition-colors">
                                  {orderedVisibleKeys.map(key => (
                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                      {renderMaintenanceCell(key, m, { asset, typeLabels, statusColor })}
                                    </td>
                                  ))}
                                  <td aria-hidden="true"></td>
                                  {maintenanceTableColumns.visibleColumns.includes('actions') && (
                                    <td className="px-6 py-2.5 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        {m.status === 'agendada' && (
                                          <>
                                            <button onClick={() => handleStartMaintenance(m)} title="Iniciar execução da manutenção"
                                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 text-sm font-medium px-1.5 py-1 rounded-lg transition-all">
                                              Iniciar
                                            </button>
                                            <button onClick={() => handleCancelMaintenance(m.id)} title="Cancelar manutenção agendada"
                                              className="text-red-600 hover:text-red-800 hover:bg-red-50 text-sm font-medium px-1.5 py-1 rounded-lg transition-all">
                                              Cancelar
                                            </button>
                                          </>
                                        )}
                                        {m.status === 'em_execucao' && (
                                          <>
                                            <button onClick={() => handleOpenFinishMaintModal(m)} title="Concluir manutenção e liberar ativo"
                                              className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 text-sm font-medium px-1.5 py-1 rounded-lg transition-all">
                                              Concluir
                                            </button>
                                            <button onClick={() => handleCancelMaintenance(m.id)} title="Cancelar manutenção em andamento"
                                              className="text-red-600 hover:text-red-800 hover:bg-red-50 text-sm font-medium px-1.5 py-1 rounded-lg transition-all">
                                              Cancelar
                                            </button>
                                          </>
                                        )}
                                        <ActionIconButton kind="delete" title="Excluir do histórico" onClick={() => handleDeleteMaintenance(m.id)} />
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 3.6. TAB: CUSTOS & RATEIO */}
          {activeTab === 'custos_rateio' && (
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-50 pb-5">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg">Rateio Contábil de Depreciação</h3>
                  <p className="text-gray-400 text-xs">Distribuição financeira de custos de desvalorização linear com base nos dias reais de uso dos bens em cada obra.</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Período</span>
                    <input
                      type="date"
                      value={rateioStartDate}
                      onChange={(e) => setRateioStartDate(e.target.value)}
                      className="px-3 py-1.5 border border-gray-250 rounded-xl text-form-input font-bold text-gray-600 bg-white"
                    />
                    <span className="text-gray-400 text-xs font-bold">até</span>
                    <input
                      type="date"
                      value={rateioEndDate}
                      onChange={(e) => setRateioEndDate(e.target.value)}
                      className="px-3 py-1.5 border border-gray-250 rounded-xl text-form-input font-bold text-gray-600 bg-white"
                    />
                  </div>
                  {(rateioStartDate || rateioEndDate) && (
                    <button
                      onClick={() => {
                        setRateioStartDate('');
                        setRateioEndDate('');
                      }}
                      className="text-button text-rose-600 hover:text-rose-700 font-bold underline"
                    >
                      Limpar Filtros
                    </button>
                  )}
                </div>
              </div>

              {deprRateio.length > 0 ? (
                <div className="space-y-6">
                  {/* Grid de Métricas do Período */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-gray-400 text-xs font-black uppercase tracking-widest block">Total Depreciado no Período</span>
                        <h4 className="text-xl font-bold text-slate-800 mt-1">
                          R$ {deprRateio.reduce((acc, r) => acc + r.allocated_cost, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </h4>
                      </div>
                      <TrendingDown className="w-8 h-8 text-rose-500 bg-rose-50 p-1.5 rounded-xl border border-rose-100" />
                    </div>

                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="text-gray-400 text-xs font-black uppercase tracking-widest block">Obras com Alocações</span>
                        <h4 className="text-xl font-bold text-slate-800 mt-1">
                          {deprRateio.filter(r => r.allocated_cost > 0).length} canteiros ativos
                        </h4>
                      </div>
                      <Building2 className="w-8 h-8 text-blue-500 bg-blue-50 p-1.5 rounded-xl border border-blue-100" />
                    </div>
                  </div>

                  {/* Tabela de Rateio */}
                  <div className="flex flex-col md:flex-row gap-2.5 items-center">
                    <div className="flex-1 relative w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        value={rateioSearch}
                        onChange={(e) => setRateioSearch(e.target.value)}
                        placeholder="Buscar por obra..."
                        className="w-full h-9 pl-9 pr-4 bg-gray-50 border border-transparent rounded-[6px] text-sm font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>
                    <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-100 gap-1 shrink-0">
                      <ColumnConfigButton
                        columns={RATEIO_COLUMNS}
                        visibleColumns={rateioTableColumns.visibleColumns}
                        showColumnConfig={rateioTableColumns.showColumnConfig}
                        onToggleShow={() => rateioTableColumns.setShowColumnConfig(!rateioTableColumns.showColumnConfig)}
                        onToggleColumn={rateioTableColumns.toggleColumn}
                        onReset={rateioTableColumns.resetColumns}
                      />
                      <button onClick={() => rateioCols.autoFit()} className="p-1.5 rounded-[6px] text-gray-400 hover:text-gray-600 transition-all" title="Ajustar largura das colunas ao conteúdo">
                        <MoveHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const term = rateioSearch.trim().toLowerCase();
                    const filteredRateio = deprRateio.filter(r => !term || r.project_name.toLowerCase().includes(term));
                    const sortedRateio = sortRows(filteredRateio, rateioTableColumns.sortColumn, rateioTableColumns.sortDirection, (r, key) => (r as unknown as Record<string, unknown>)[key]);
                    const visible = RATEIO_COLUMNS.filter(c => rateioTableColumns.visibleColumns.includes(c.key));
                    const tableWidth = visible.reduce((s, c) => s + rateioCols.getWidth(c.key), 0);
                    const orderedVisibleKeys = rateioTableColumns.orderedVisibleColumns;

                    if (sortedRateio.length === 0) {
                      return (
                        <div className="py-16 text-center text-gray-400">
                          <TrendingDown className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          <p className="font-semibold text-sm">Nenhuma obra encontrada com o filtro aplicado.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table ref={rateioCols.tableRef} className="text-left border-collapse" style={{ tableLayout: 'fixed', width: tableWidth }}>
                            <colgroup>
                              {orderedVisibleKeys.map(key => (
                                <col key={key} data-col-key={key} style={{ width: `${rateioCols.getWidth(key)}px` }} />
                              ))}
                            </colgroup>
                            <thead>
                              <tr className="bg-gray-50 text-gray-500 font-semibold text-xs border-b border-gray-200">
                                {orderedVisibleKeys.map(key => {
                                  const def = RATEIO_COLUMN_HEADERS[key];
                                  if (!def) return null;
                                  return (
                                    <SortableHeader key={key} colKey={key} label={def.label} uppercase={false}
                                      sortable={def.sortable !== false}
                                      sortColumn={rateioTableColumns.sortColumn} sortDirection={rateioTableColumns.sortDirection} onSort={rateioTableColumns.handleColumnSort}
                                      onMoveColumn={rateioTableColumns.moveColumn}
                                      className={def.className}>
                                      <rateioCols.ResizeHandle colKey={key} />
                                    </SortableHeader>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {sortedRateio.map(r => (
                                <tr key={r.project_id} className="hover:bg-blue-50/50 transition-colors">
                                  {orderedVisibleKeys.map(key => (
                                    <td key={key} className="px-6 py-2.5 border-r border-gray-100 last:border-r-0">
                                      {renderRateioCell(key, r)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : !activeOrganizationId ? (
                <div className="py-20 text-center text-gray-400 space-y-3">
                  <TrendingDown className="w-12 h-12 text-gray-200 mx-auto" />
                  <p className="font-semibold text-sm">Selecione uma organização para ver o rateio contábil.</p>
                  <p className="text-xs text-gray-400 max-w-md mx-auto">
                    O rateio de depreciação é calculado por empresa (plano de contas próprio); com "Todas as organizações" selecionado não há como consolidar o cálculo.
                  </p>
                </div>
              ) : (
                <div className="py-20 text-center text-gray-400 space-y-3">
                  <TrendingDown className="w-12 h-12 text-gray-200 mx-auto" />
                  <p className="font-semibold text-sm">Nenhum custo de depreciação a ratear encontrado no período selecionado.</p>
                  <p className="text-xs text-gray-400 max-w-md mx-auto">
                    Certifique-se de que os bens patrimoniais possuem valor de compra e vida útil cadastrados e contam com histórico de locações (reservas aprovadas, ativas ou finalizadas).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. MODAL: CADASTRAR NOVO ATIVO */}
      {isNewAssetModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-6 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsNewAssetModalOpen(false)}
              className="absolute right-4 top-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-bold text-gray-800 text-lg">
                {editingAssetId ? 'Editar Ativo Patrimonial' : isDuplicate ? 'Duplicar Ativo Patrimonial' : 'Cadastrar Ativo Patrimonial'}
              </h3>
              <p className="text-gray-400 text-xs">
                {editingAssetId ? 'Ajuste as informações abaixo para atualizar o bem.' : isDuplicate ? 'Ajuste os dados da duplicata para dar entrada no novo bem.' : 'Preencha os campos abaixo para dar entrada operacional no bem.'}
              </p>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-4 text-xs font-semibold">
              {isWriteDisabled && (
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Organização Proprietária</label>
                  <select
                    required
                    value={assetForm.organization_id}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, organization_id: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  >
                    <option value="">Selecione a Organização...</option>
                    {organizations.map((org: any) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Nome do Bem</label>
                  <input
                    required
                    value={assetForm.name}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Ex: Retroescavadeira JCB"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Código Patrimonial (Opcional)</label>
                  <input
                    value={assetForm.code}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, code: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Auto-gerado se vazio"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Categoria</label>
                  <select
                    value={assetForm.category}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, category: e.target.value as AssetCategory }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  >
                    <option value="equipamento">Equipamento</option>
                    <option value="ferramenta">Ferramenta</option>
                    <option value="veiculo">Veículo</option>
                    <option value="tecnologia">Tecnologia</option>
                    <option value="imovel">Imóvel</option>
                    <option value="mobiliario">Mobiliário</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Subcategoria</label>
                  <input
                    value={assetForm.subcategory}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, subcategory: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Ex: Escavadeira de Esteira"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-gray-400 uppercase tracking-widest text-[9px]">Marca</label>
                    <button
                      type="button"
                      onClick={() => setIsBrandManagerOpen(true)}
                      className="text-[9px] text-blue-500 hover:text-blue-700 font-bold uppercase tracking-wider transition-colors flex items-center gap-0.5"
                      title="Gerenciar Marcas"
                    >
                      <PenTool className="w-3 h-3" />
                      Gerenciar
                    </button>
                  </div>
                  <select
                    value={assetForm.brand}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, brand: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  >
                    <option value="">Selecione a Marca...</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Modelo</label>
                  <input
                    value={assetForm.model}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, model: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Nº de Série</label>
                  <input
                    value={assetForm.serial_number}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, serial_number: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Data Aquisição</label>
                  <input
                    type="date"
                    value={assetForm.purchase_date}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, purchase_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Valor Aquisição (R$)</label>
                  <input
                    type="number"
                    value={assetForm.purchase_value || ''}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, purchase_value: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Vida Útil (Meses)</label>
                  <input
                    type="number"
                    value={assetForm.useful_life_months || ''}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, useful_life_months: parseInt(e.target.value, 10) || 60 }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Valor Residual (R$)</label>
                  <input
                    type="number"
                    value={assetForm.residual_value || ''}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, residual_value: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Notas Observações</label>
                <textarea
                  value={assetForm.notes}
                  onChange={(e) => setAssetForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold h-20 resize-none"
                  placeholder="Informações adicionais do ativo..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewAssetModalOpen(false)}
                  className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 font-bold"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingAssetId ? 'Salvar Alterações' : isDuplicate ? 'Salvar Duplicata' : 'Finalizar Cadastro'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: REGISTRAR MOVIMENTAÇÃO */}
      {isMoveAssetModalOpen && selectedAsset && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-2xl w-full max-w-md relative animate-in zoom-in-95 duration-200 space-y-6">
            <button
              onClick={() => setIsMoveAssetModalOpen(false)}
              className="absolute right-4 top-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-bold text-gray-800 text-lg">Registrar Movimentação</h3>
              <p className="text-gray-400 text-xs">Transfira este ativo para outro projeto ou de volta para a central.</p>
            </div>

            <form onSubmit={handleMoveAsset} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Projeto de Destino</label>
                <select
                  required
                  value={moveForm.destination_project_id}
                  onChange={(e) => setMoveForm(prev => ({ ...prev, destination_project_id: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                >
                  <option value="">Sede / Central de Equipamentos</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Notas da Transferência</label>
                <textarea
                  value={moveForm.notes}
                  onChange={(e) => setMoveForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold h-20 resize-none"
                  placeholder="Ex: Enviado via transportadora para início da fase de escavação."
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsMoveAssetModalOpen(false)}
                  className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 font-bold"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar Transferência
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: EFETUAR RESERVA */}
      {isReserveModalOpen && selectedAsset && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-2xl w-full max-w-md relative animate-in zoom-in-95 duration-200 space-y-6">
            <button
              onClick={() => setIsReserveModalOpen(false)}
              className="absolute right-4 top-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-bold text-gray-800 text-lg">Agendar Reserva de Ativo</h3>
              <p className="text-gray-400 text-xs">Bloqueie a utilização dupla deste bem em um período de tempo específico.</p>
            </div>

            <form onSubmit={handleReserveAsset} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Obra Reservista</label>
                <select
                  required
                  value={reserveForm.project_id}
                  onChange={(e) => setReserveForm(prev => ({ ...prev, project_id: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                >
                  <option value="">Sede / Central de Equipamentos</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Colaborador Responsável</label>
                <select
                  value={reserveForm.responsible_employee_id}
                  onChange={(e) => setReserveForm(prev => ({ ...prev, responsible_employee_id: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                >
                  <option value="">Selecione o Responsável...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Data de Início</label>
                  <input
                    type="date"
                    required
                    value={reserveForm.start_date}
                    onChange={(e) => setReserveForm(prev => ({ ...prev, start_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Data de Término</label>
                  <input
                    type="date"
                    required
                    value={reserveForm.end_date}
                    onChange={(e) => setReserveForm(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Notas de Reserva</label>
                <textarea
                  value={reserveForm.notes}
                  onChange={(e) => setReserveForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold h-20 resize-none"
                  placeholder="Explique o uso que será dado ao equipamento..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsReserveModalOpen(false)}
                  className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 font-bold"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar Reserva
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: QR CODE PATRIMONIAL */}
      {isQrCodeOpen && selectedAsset && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-2xl w-full max-w-sm relative text-center space-y-6 animate-in zoom-in-95 duration-200 flex flex-col items-center">
            <button
              onClick={() => setIsQrCodeOpen(false)}
              className="absolute right-4 top-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-bold text-gray-800 text-lg">Etiqueta Patrimonial</h3>
              <p className="text-gray-400 text-xs">Imprima esta etiqueta para fixar fisicamente no bem.</p>
            </div>

            {/* Simulação Premium da Etiqueta de Patrimônio */}
            <div className="border-[3px] border-dashed border-gray-300 p-6 rounded-2xl w-64 bg-slate-50/50 flex flex-col items-center gap-4 relative overflow-hidden">
              {/* Logo da Opura */}
              <div className="flex items-center gap-1.5 justify-center border-b border-gray-200 w-full pb-2">
                <div className="w-6 h-6 rounded bg-[#0F172A] flex items-center justify-center text-white text-xs font-bold font-sans">
                  O
                </div>
                <span className="font-sans font-black text-gray-900 tracking-wider text-sm">ÒPURA</span>
                <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">Patrimônio</span>
              </div>

              {/* Desenho do QR Code Realista em SVG puro */}
              <div className="w-32 h-32 bg-white border border-gray-100 p-2 rounded-xl flex items-center justify-center">
                <svg className="w-28 h-28 text-[#0F172A]" viewBox="0 0 100 100" fill="currentColor">
                  {/* Bordas e Marcadores de Canto Estilo QR Code */}
                  <path d="M 5,5 h 25 v 25 h -25 z m 5,5 v 15 h 15 v -15 z m 5,5 h 5 v 5 h -5 z" />
                  <path d="M 70,5 h 25 v 25 h -25 z m 5,5 v 15 h 15 v -15 z m 5,5 h 5 v 5 h -5 z" />
                  <path d="M 5,70 h 25 v 25 h -25 z m 5,5 v 15 h 15 v -15 z m 5,5 h 5 v 5 h -5 z" />
                  {/* Dados Binários Aleatórios (Estilo QR Code Real) */}
                  <rect x="35" y="5" width="5" height="5" />
                  <rect x="45" y="5" width="10" height="5" />
                  <rect x="60" y="5" width="5" height="5" />
                  <rect x="35" y="15" width="5" height="10" />
                  <rect x="45" y="15" width="5" height="5" />
                  <rect x="55" y="15" width="10" height="5" />
                  <rect x="35" y="30" width="15" height="5" />
                  <rect x="55" y="30" width="5" height="15" />
                  <rect x="5" y="35" width="5" height="15" />
                  <rect x="15" y="45" width="10" height="5" />
                  <rect x="35" y="40" width="5" height="5" />
                  <rect x="45" y="40" width="10" height="10" />
                  <rect x="65" y="40" width="5" height="5" />
                  <rect x="5" y="55" width="10" height="5" />
                  <rect x="20" y="55" width="5" height="10" />
                  <rect x="30" y="55" width="15" height="5" />
                  <rect x="60" y="50" width="10" height="15" />
                  <rect x="75" y="45" width="5" height="15" />
                  <rect x="85" y="55" width="10" height="5" />
                  <rect x="35" y="65" width="5" height="15" />
                  <rect x="45" y="75" width="15" height="5" />
                  <rect x="65" y="70" width="5" height="20" />
                  <rect x="75" y="70" width="15" height="5" />
                  <rect x="75" y="80" width="5" height="10" />
                  <rect x="85" y="85" width="10" height="10" />
                </svg>
              </div>

              {/* Código Patrimonial Legível */}
              <div className="text-center">
                <span className="text-gray-400 block text-xs font-bold uppercase tracking-widest">Código do Bem</span>
                <span className="font-mono text-gray-800 font-black text-sm tracking-widest">{selectedAsset.code}</span>
              </div>
            </div>

            <button
              onClick={() => {
                window.print();
              }}
              className="px-6 py-2.5 bg-gray-900 hover:bg-gray-850 text-white w-full rounded-2xl font-black text-button uppercase tracking-widest flex items-center justify-center gap-2 transition-colors shadow-lg active:scale-95"
            >
              <FileText className="w-4 h-4" />
              Imprimir Código
            </button>
          </div>
        </div>
      )}

      {/* 8. MODAL: IMPORTAR ATIVOS VIA EXCEL */}
      <AssetImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={loadData}
        activeOrganizationId={activeOrganizationId}
        existingAssets={assets}
      />

      {/* MODAL: GERENCIAR MARCAS (Fase 7) */}
      {isBrandManagerOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-2xl w-full max-w-md relative animate-in zoom-in-95 duration-200 space-y-6">
            <button
              onClick={() => {
                setIsBrandManagerOpen(false);
                setEditingBrandId(null);
              }}
              className="absolute right-4 top-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-bold text-gray-800 text-lg">Gerenciar Marcas</h3>
              <p className="text-gray-400 text-xs">Crie, edite ou remova marcas de fabricantes de equipamentos.</p>
            </div>

            <form onSubmit={handleCreateBrand} className="flex gap-2 text-xs">
              <input
                required
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="Ex: Makita, Bosch, Caterpillar..."
                className="flex-1 px-4 py-2 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors font-semibold"
              />
              <Button
                type="submit"
                size="sm"
                disabled={actionLoading}
              >
                Adicionar
              </Button>
            </form>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-xs">
              {brands.length === 0 ? (
                <div className="text-center py-6 text-gray-400 font-medium">
                  Nenhuma marca cadastrada ainda.
                </div>
              ) : (
                brands.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-gray-100/50 transition-colors">
                    {editingBrandId === b.id ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          required
                          value={editingBrandName}
                          onChange={(e) => setEditingBrandName(e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-blue-600 font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateBrand(b.id)}
                          className="text-emerald-600 font-bold hover:text-emerald-700 uppercase text-xs"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingBrandId(null)}
                          className="text-gray-400 font-bold hover:text-gray-600 uppercase text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-bold text-gray-700">{b.name}</span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBrandId(b.id);
                              setEditingBrandName(b.name);
                            }}
                            className="text-blue-500 hover:text-blue-700 font-semibold transition-colors uppercase text-xs"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBrand(b.id)}
                            className="text-red-500 hover:text-red-700 font-semibold transition-colors uppercase text-xs"
                          >
                            Excluir
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL: CADASTRAR NOVA MANUTENÇÃO */}
      {isNewMaintModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-6 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsNewMaintModalOpen(false)}
              className="absolute right-4 top-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-bold text-gray-800 text-lg">Agendar Ordem de Manutenção</h3>
              <p className="text-gray-400 text-xs">Abra ou agende uma intervenção corretiva ou preventiva em um bem.</p>
            </div>

            <form onSubmit={handleCreateMaintenance} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Ativo Patrimonial</label>
                {selectedAsset ? (
                  <div className="w-full px-4 py-2.5 border border-gray-150 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">
                    {selectedAsset.name} ({selectedAsset.code})
                  </div>
                ) : (
                  <select
                    required
                    value={maintForm.asset_id}
                    onChange={(e) => setMaintForm(prev => ({ ...prev, asset_id: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  >
                    <option value="">Selecione o Ativo...</option>
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Tipo de Manutenção</label>
                  <select
                    value={maintForm.type}
                    onChange={(e) => setMaintForm(prev => ({ ...prev, type: e.target.value as MaintenanceType }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  >
                    <option value="preventiva">Preventiva</option>
                    <option value="corretiva">Corretiva</option>
                    <option value="calibracao">Calibração</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Status Inicial</label>
                  <select
                    value={maintForm.status}
                    onChange={(e) => setMaintForm(prev => ({ ...prev, status: e.target.value as MaintenanceStatus }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  >
                    <option value="agendada">Agendada</option>
                    <option value="em_execucao">Em Oficina (Em Execução)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Descrição do Serviço / Sintomas</label>
                <textarea
                  required
                  value={maintForm.description}
                  onChange={(e) => setMaintForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold h-20 resize-none"
                  placeholder="Descreva detalhadamente o serviço ou as falhas apresentadas..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Data Agendada</label>
                  <input
                    type="date"
                    required
                    value={maintForm.scheduled_date}
                    onChange={(e) => setMaintForm(prev => ({ ...prev, scheduled_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Custo Estimado (R$)</label>
                  <input
                    type="number"
                    value={maintForm.cost || ''}
                    onChange={(e) => setMaintForm(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Odômetro Inicial (Km)</label>
                  <input
                    type="number"
                    value={maintForm.current_odometer || ''}
                    onChange={(e) => setMaintForm(prev => ({ ...prev, current_odometer: parseInt(e.target.value, 10) || '' }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Se aplicável a frotas"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Horímetro Inicial (Horas)</label>
                  <input
                    type="number"
                    value={maintForm.current_hourmeter || ''}
                    onChange={(e) => setMaintForm(prev => ({ ...prev, current_hourmeter: parseInt(e.target.value, 10) || '' }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Se aplicável a máquinas pesadas"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewMaintModalOpen(false)}
                  className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 font-bold"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar Abertura
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. MODAL: CONCLUIR MANUTENÇÃO */}
      {isFinishMaintModalOpen && selectedMaintenance && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-2xl w-full max-w-md relative animate-in zoom-in-95 duration-200 space-y-6">
            <button
              onClick={() => setIsFinishMaintModalOpen(false)}
              className="absolute right-4 top-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-bold text-gray-800 text-lg">Concluir Ordem de Manutenção</h3>
              <p className="text-gray-400 text-xs">Lance os dados reais finais para fechar a ordem de serviço e liberar o bem.</p>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs space-y-1.5">
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[8px]">Descrição do Serviço</p>
              <p className="font-bold text-gray-700">{selectedMaintenance.description}</p>
            </div>

            <form onSubmit={handleFinalizeMaintenance} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Data de Execução Real</label>
                  <input
                    type="date"
                    required
                    value={finishMaintForm.executed_date}
                    onChange={(e) => setFinishMaintForm(prev => ({ ...prev, executed_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Custo Real Final (R$)</label>
                  <input
                    type="number"
                    required
                    value={finishMaintForm.cost || ''}
                    onChange={(e) => setFinishMaintForm(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Custo real final do serviço"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Odômetro Final (Km)</label>
                  <input
                    type="number"
                    value={finishMaintForm.current_odometer || ''}
                    onChange={(e) => setFinishMaintForm(prev => ({ ...prev, current_odometer: parseInt(e.target.value, 10) || '' }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Opcional"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Horímetro Final (Horas)</label>
                  <input
                    type="number"
                    value={finishMaintForm.current_hourmeter || ''}
                    onChange={(e) => setFinishMaintForm(prev => ({ ...prev, current_hourmeter: parseInt(e.target.value, 10) || '' }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Notas de Encerramento</label>
                <textarea
                  value={finishMaintForm.notes}
                  onChange={(e) => setFinishMaintForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold h-20 resize-none"
                  placeholder="Ex: Peças trocadas, garantia de 3 meses da oficina autorizada..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsFinishMaintModalOpen(false)}
                  className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Concluir Manutenção
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* 11. MODAL: CADASTRAR NOVO DOCUMENTO */}
      {isNewDocModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-2xl w-full max-w-md relative animate-in zoom-in-95 duration-200 space-y-6">
            <button
              onClick={() => setIsNewDocModalOpen(false)}
              className="absolute right-4 top-4 p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-bold text-gray-800 text-lg">Anexar Documento / Seguro</h3>
              <p className="text-gray-400 text-xs">Adicione apólices de seguro, licenciamento ou termos de responsabilidade ao ativo.</p>
            </div>

            <form onSubmit={handleCreateDocument} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Tipo de Documento</label>
                <select
                  value={docForm.type}
                  onChange={(e) => setDocForm(prev => ({ ...prev, type: e.target.value as AssetDocumentType }))}
                  className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                >
                  <option value="seguro">Apólice de Seguro</option>
                  <option value="licenciamento">IPVA / Licenciamento</option>
                  <option value="termo_responsabilidade">Termo de Responsabilidade</option>
                  <option value="outro">Outro Documento</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Nome / Descrição do Documento</label>
                <input
                  type="text"
                  required
                  value={docForm.name}
                  onChange={(e) => setDocForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  placeholder="Ex: Apólice Porto Seguro 2026"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Número do Documento / Apólice</label>
                  <input
                    type="text"
                    value={docForm.document_number}
                    onChange={(e) => setDocForm(prev => ({ ...prev, document_number: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                    placeholder="Opcional"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Data de Vencimento</label>
                  <input
                    type="date"
                    value={docForm.expiration_date}
                    onChange={(e) => setDocForm(prev => ({ ...prev, expiration_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-gray-400 uppercase tracking-widest text-[9px]">Link / URL do Arquivo Anexo</label>
                <input
                  type="url"
                  value={docForm.file_url}
                  onChange={(e) => setDocForm(prev => ({ ...prev, file_url: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  placeholder="Ex: https://drive.google.com/..."
                />
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewDocModalOpen(false)}
                  className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 font-bold"
                >
                  Cancelar
                </button>
                <Button
                  type="submit"
                  disabled={actionLoading}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar Anexo
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpuraAssetsModule;

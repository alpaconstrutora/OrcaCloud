// components/OpuraAssetsModule.tsx

import React from 'react';
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
  FileSpreadsheet
} from 'lucide-react';
import { assetService } from '../services/assetService';
import { useStore } from '../store/useStore';
import { AssetImportModal } from './AssetImportModal';
import {
  OpuraAsset,
  AssetCategory,
  AssetStatus,
  OpuraAssetMovement,
  OpuraAssetReservation
} from '../types';

interface OpuraAssetsModuleProps {
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
}

export const OpuraAssetsModule: React.FC<OpuraAssetsModuleProps> = ({
  activeOrganizationId,
  onChangeView
}) => {
  const { projects } = useStore();
  
  // Tabs e UI States
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'bens' | 'reservas'>('dashboard');
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);
  
  // Dados do banco
  const [assets, setAssets] = React.useState<OpuraAsset[]>([]);
  const [reservations, setReservations] = React.useState<OpuraAssetReservation[]>([]);
  
  // Estado de Visualização/Ação de Ativo Específico
  const [selectedAsset, setSelectedAsset] = React.useState<OpuraAsset | null>(null);
  const [movements, setMovements] = React.useState<OpuraAssetMovement[]>([]);
  const [isNewAssetModalOpen, setIsNewAssetModalOpen] = React.useState(false);
  const [isMoveAssetModalOpen, setIsMoveAssetModalOpen] = React.useState(false);
  const [isReserveModalOpen, setIsReserveModalOpen] = React.useState(false);
  const [isQrCodeOpen, setIsQrCodeOpen] = React.useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = React.useState(false);

  // Estados dos Formulários
  const [assetForm, setAssetForm] = React.useState({
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
    responsible_worker_id: undefined
  });

  const [moveForm, setMoveForm] = React.useState({
    destination_project_id: '',
    notes: ''
  });

  const [reserveForm, setReserveForm] = React.useState({
    project_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0], // + 7 dias
    notes: ''
  });

  // Filtros de listagem
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterCategory, setFilterCategory] = React.useState<string>('todos');
  const [filterStatus, setFilterStatus] = React.useState<string>('todos');

  // Carregar dados
  const loadData = React.useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    try {
      const loadedAssets = await assetService.list(activeOrganizationId);
      setAssets(loadedAssets);
      
      const loadedRes = await assetService.listReservations(activeOrganizationId);
      setReservations(loadedRes);
    } catch (err) {
      console.error('[OpuraAssetsModule] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Carregar histórico de movimentação do ativo selecionado
  const loadAssetMovements = async (assetId: string) => {
    try {
      const history = await assetService.listMovements(assetId);
      setMovements(history);
    } catch (err) {
      console.error('[OpuraAssetsModule] Erro ao carregar histórico de movimentações:', err);
    }
  };

  // Cadastrar Novo Ativo
  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrganizationId) return;
    setActionLoading(true);
    try {
      const generatedCode = assetForm.code || `OPR-PAT-${Math.floor(100000 + Math.random() * 900000)}`;
      await assetService.create({
        organization_id: activeOrganizationId,
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
      alert('Ativo patrimonial cadastrado com sucesso!');
      setIsNewAssetModalOpen(false);
      setAssetForm({
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
      alert(`Erro ao cadastrar ativo: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Registrar Movimentação para Obra
  const handleMoveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !activeOrganizationId) return;
    setActionLoading(true);
    try {
      await assetService.createMovement({
        organization_id: activeOrganizationId,
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
    if (!selectedAsset || !activeOrganizationId) return;
    setActionLoading(true);
    try {
      // Obter email fictício de teste ou do user logado
      const email = 'gestor.ativos@alpaconstrutora.com.br';
      await assetService.createReservation({
        organization_id: activeOrganizationId,
        asset_id: selectedAsset.id,
        project_id: reserveForm.project_id,
        start_date: reserveForm.start_date,
        end_date: reserveForm.end_date,
        status: 'aprovada', // Aprovado automático para simplificação do fluxo MVP
        requested_by_email: email,
        approved_by_email: email,
        notes: reserveForm.notes || undefined
      });
      alert('Reserva efetuada com sucesso!');
      setIsReserveModalOpen(false);
      setReserveForm({
        project_id: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        notes: ''
      });
      loadData();
    } catch (err: any) {
      alert(`Erro ao efetuar reserva: ${err.message}`);
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
            ÒPURA Assets
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-6 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100 rounded-[1.25rem] font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importar Planilha
          </button>

          <button
            onClick={() => setIsNewAssetModalOpen(true)}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-[1.25rem] font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-xl shadow-blue-900/10 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Ativo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6 overflow-x-auto">
        {(['dashboard', 'bens', 'reservas'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 font-black text-xs uppercase tracking-widest transition-colors border-b-2
              ${activeTab === tab 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            {tab === 'bens' ? 'Ativos Patrimoniais' : tab === 'reservas' ? 'Reservas & Locação' : tab}
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
                    <span className="text-[10px] font-black uppercase tracking-widest">Patrimônio Total</span>
                    <DollarSign className="w-4 h-4 text-blue-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">
                    R$ {totalPatrimony.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-[10px] font-black uppercase tracking-widest">Depreciação Acum.</span>
                    <TrendingUp className="w-4 h-4 text-rose-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-rose-600">
                    R$ {totalDepreciated.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                  </h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-[10px] font-black uppercase tracking-widest">Bens Ativos</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">{activeCount}</h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-[10px] font-black uppercase tracking-widest">Em Manutenção</span>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-800">{maintenanceCount}</h3>
                </div>

                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 hover:shadow-lg transition-all">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-[10px] font-black uppercase tracking-widest">Bens Ociosos</span>
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
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Reserva</span>
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

                  <div className="flex gap-3 shrink-0">
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 bg-white"
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
                      className="px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 bg-white"
                    >
                      <option value="todos">Todos Status</option>
                      <option value="disponivel">Disponível</option>
                      <option value="em_uso">Em Uso</option>
                      <option value="manutencao">Manutenção</option>
                      <option value="ocioso">Ocioso</option>
                      <option value="baixado">Baixado</option>
                    </select>
                  </div>
                </div>

                {/* Grid de Ativos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredAssets.map(asset => {
                    const Icon = categoryIcons[asset.category] || Package;
                    const depreciation = calculateDepreciation(asset);
                    return (
                      <div
                        key={asset.id}
                        onClick={async () => {
                          setSelectedAsset(asset);
                          loadAssetMovements(asset.id);
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
                          <div className="flex items-center gap-1.5 text-blue-500 font-bold text-[10px] uppercase tracking-wider">
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
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIsMoveAssetModalOpen(true)}
                        className="flex-1 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Movimentar
                      </button>
                      <button
                        onClick={() => setIsReserveModalOpen(true)}
                        className="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Reservar
                      </button>
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
                                <p className="text-[10px] text-gray-400 font-medium mt-0.5">
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

              {reservations.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">Ativo</th>
                        <th className="py-3 px-4">Obra Solicitante</th>
                        <th className="py-3 px-4">Início</th>
                        <th className="py-3 px-4">Termino</th>
                        <th className="py-3 px-4">Solicitante</th>
                        <th className="py-3 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservations.map(res => {
                        const asset = assets.find(a => a.id === res.asset_id);
                        const proj = projects.find(p => p.id === res.project_id);
                        return (
                          <tr key={res.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="py-3 px-4 font-bold text-gray-800">{asset?.name || 'Ativo'}</td>
                            <td className="py-3 px-4 font-medium text-gray-600">{proj?.name || 'Obra'}</td>
                            <td className="py-3 px-4 text-gray-500">{new Date(res.start_date).toLocaleDateString('pt-BR')}</td>
                            <td className="py-3 px-4 text-gray-500">{new Date(res.end_date).toLocaleDateString('pt-BR')}</td>
                            <td className="py-3 px-4 text-gray-400 font-semibold">{res.requested_by_email}</td>
                            <td className="py-3 px-4">
                              <span className="bg-emerald-500/10 text-emerald-600 px-2.5 py-0.5 rounded-md font-bold text-[10px] uppercase">
                                {res.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-20 text-center text-gray-400">
                  <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="font-semibold text-sm">Nenhuma solicitação ou reserva ativa registrada.</p>
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
              <h3 className="font-bold text-gray-800 text-lg">Cadastrar Ativo Patrimonial</h3>
              <p className="text-gray-400 text-xs">Preencha os campos abaixo para dar entrada operacional no bem.</p>
            </div>

            <form onSubmit={handleCreateAsset} className="space-y-4 text-xs font-semibold">
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
                  <label className="text-gray-400 uppercase tracking-widest text-[9px]">Marca</label>
                  <input
                    value={assetForm.brand}
                    onChange={(e) => setAssetForm(prev => ({ ...prev, brand: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none focus:border-blue-600 transition-colors text-sm font-semibold"
                  />
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
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Finalizar Cadastro
                </button>
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
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar Transferência
                </button>
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
                  <option value="">Selecione a Obra...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
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
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar Reserva
                </button>
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
                <span className="text-[7px] text-gray-400 uppercase tracking-widest font-bold">Patrimônio</span>
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
                <span className="text-gray-400 block text-[7px] font-bold uppercase tracking-widest">Código do Bem</span>
                <span className="font-mono text-gray-800 font-black text-sm tracking-widest">{selectedAsset.code}</span>
              </div>
            </div>

            <button
              onClick={() => {
                window.print();
              }}
              className="px-6 py-2.5 bg-gray-900 hover:bg-gray-850 text-white w-full rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors shadow-lg active:scale-95"
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
    </div>
  );
};

export default OpuraAssetsModule;

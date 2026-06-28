import React from 'react';
import { complianceService } from '../services/complianceService';
import { companyService } from '../services/companyService';
import { CompliancePhysicalLocation, Company } from '../types';

interface CompliancePhysicalMapProps {
  organizationId: string;
  onBack: () => void;
}

const CompliancePhysicalMap: React.FC<CompliancePhysicalMapProps> = ({
  organizationId,
  onBack
}) => {
  const [loading, setLoading] = React.useState(true);
  const [locations, setLocations] = React.useState<CompliancePhysicalLocation[]>([]);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  
  // Controle de edição/criação de localização física
  const [selectedLocation, setSelectedLocation] = React.useState<CompliancePhysicalLocation | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('posicao_logistica');
  const [companyId, setCompanyId] = React.useState('');
  const [status, setStatus] = React.useState('disponivel');

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [locsData, compsData] = await Promise.all([
        complianceService.listPhysicalLocations(organizationId),
        companyService.list(organizationId)
      ]);
      setLocations(locsData);
      setCompanies(compsData);

      // Se a tabela estiver vazia, sugerir popular com algumas posições padrão de galpão para fins de visualização do MVP
      if (locsData.length === 0) {
        await seedDefaultLocations(compsData);
      }
    } catch (error) {
      console.error('Erro ao buscar posições de segregação:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Seed para o MVP ter dados visuais de teste na primeira carga
  const seedDefaultLocations = async (comps: Company[]) => {
    try {
      const defaultLocs = [
        { name: 'Rua A - Box 01', type: 'posicao_logistica', status: 'ocupado', company_id: comps[0]?.id || null, coordinates: { grid: 'A1' } },
        { name: 'Rua A - Box 02', type: 'posicao_logistica', status: 'ocupado', company_id: comps[0]?.id || null, coordinates: { grid: 'A2' } },
        { name: 'Rua B - Box 01', type: 'posicao_logistica', status: 'disponivel', company_id: null, coordinates: { grid: 'B1' } },
        { name: 'Rua B - Box 02', type: 'posicao_logistica', status: 'ocupado', company_id: comps[1]?.id || null, coordinates: { grid: 'B2' } },
        { name: 'Locker Superior 01', type: 'locker', status: 'disponivel', company_id: null, coordinates: { grid: 'L1' } },
        { name: 'Locker Superior 02', type: 'locker', status: 'ocupado', company_id: comps[0]?.id || null, coordinates: { grid: 'L2' } },
        { name: 'Sala Administrativa 01', type: 'sala', status: 'ocupado', company_id: comps[0]?.id || null, coordinates: { grid: 'S1' } },
        { name: 'Sala Administrativa 02', type: 'sala', status: 'manutencao', company_id: null, coordinates: { grid: 'S2' } }
      ];

      for (const loc of defaultLocs) {
        await complianceService.savePhysicalLocation({
          org_id: organizationId,
          name: loc.name,
          type: loc.type,
          status: loc.status,
          company_id: loc.company_id,
          coordinates: loc.coordinates
        });
      }
      // Recarregar
      const locsData = await complianceService.listPhysicalLocations(organizationId);
      setLocations(locsData);
    } catch (err) {
      console.error('Erro ao popular dados demo de localizações:', err);
    }
  };

  const handleOpenEdit = (loc: CompliancePhysicalLocation) => {
    setSelectedLocation(loc);
    setName(loc.name);
    setType(loc.type);
    setCompanyId(loc.company_id || '');
    setStatus(loc.status);
    setIsModalOpen(true);
  };

  const handleOpenCreate = () => {
    setSelectedLocation(null);
    setName('');
    setType('posicao_logistica');
    setCompanyId('');
    setStatus('disponivel');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const payload: any = {
        org_id: organizationId,
        name,
        type,
        status,
        company_id: companyId === '' ? null : companyId
      };

      if (selectedLocation) {
        payload.id = selectedLocation.id;
        payload.coordinates = selectedLocation.coordinates;
      } else {
        payload.coordinates = { grid: `G${locations.length + 1}` };
      }

      await complianceService.savePhysicalLocation(payload);
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      console.error('Erro ao salvar localização:', error);
      alert(error.message || 'Erro inesperado ao salvar.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja realmente deletar esta área física?')) return;
    try {
      await complianceService.deletePhysicalLocation(id);
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      console.error('Erro ao excluir localização:', error);
      alert(error.message || 'Erro ao excluir.');
    }
  };

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-button active:scale-95 transition-transform hover:bg-slate-50"
          >
            ⬅
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">🗺️ Segregação Física de Estoque</h1>
            <p className="text-xs font-semibold text-slate-500">Mapeamento visual e demarcação regulatória do galpão</p>
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95"
        >
          + Adicionar Posição
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200/50 rounded-3xl">
          <div className="w-8 h-8 border-4 border-[#0F172A] border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Carregando Layout do Galpão...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Mapa Visual - Layout do Galpão */}
          <div className="lg:col-span-2 bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Layout de Alocação de Posições</h3>
            
            <div className="border border-slate-200/80 rounded-2xl p-6 bg-slate-50 min-h-[300px] flex flex-wrap gap-4 items-center justify-center">
              {locations.map(loc => {
                const associatedComp = companies.find(c => c.id === loc.company_id);
                const colorTheme = loc.status === 'manutencao' ? 'border-rose-200 bg-rose-50 text-rose-700' :
                                   loc.status === 'ocupado' ? 'border-sky-200 bg-sky-50 text-sky-700' : 
                                   'border-emerald-200 bg-emerald-50 text-emerald-700';

                return (
                  <div
                    key={loc.id}
                    onClick={() => handleOpenEdit(loc)}
                    className={`w-32 h-32 rounded-2xl border-2 p-3 flex flex-col justify-between cursor-pointer active:scale-95 transition-all shadow-sm ${colorTheme}`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-black uppercase tracking-wider bg-white/70 px-2 py-0.5 rounded-md">
                        {loc.coordinates?.grid || 'G'}
                      </span>
                      <span className="text-sm">
                        {loc.type === 'locker' ? '🔒' : loc.type === 'sala' ? '🚪' : '📦'}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="block text-xs font-black truncate">{loc.name}</span>
                      {associatedComp ? (
                        <span className="block text-[8px] font-bold truncate opacity-80 uppercase">
                          👤 {associatedComp.nome_fantasia || associatedComp.razao_social}
                        </span>
                      ) : (
                        <span className="block text-[8px] font-bold opacity-60">Livre</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-bold text-slate-500 justify-center">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Disponível</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-500" /> Reservado / Ocupado</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500" /> Bloqueado / Manutenção</span>
            </div>
          </div>

          {/* Legenda Lateral / Listagem */}
          <div className="bg-white border border-slate-200/60 p-6 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.02)] space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Lista de Áreas Reguladas</h3>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {locations.map(loc => {
                const comp = companies.find(c => c.id === loc.company_id);
                return (
                  <div
                    key={loc.id}
                    onClick={() => handleOpenEdit(loc)}
                    className="p-3 bg-slate-50 border border-slate-100 hover:bg-slate-100/50 rounded-xl cursor-pointer transition-all flex items-center justify-between"
                  >
                    <div>
                      <span className="block text-xs font-bold text-slate-800">{loc.name}</span>
                      <span className="block text-[9px] text-slate-500 uppercase">
                        Tipo: {loc.type === 'locker' ? 'Locker' : loc.type === 'sala' ? 'Sala Administrativa' : 'Posição de Estoque'}
                      </span>
                      {comp && (
                        <span className="block text-[9px] font-semibold text-sky-600 truncate max-w-[200px]">
                          Vínculo: {comp.razao_social}
                        </span>
                      )}
                    </div>

                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      loc.status === 'manutencao' ? 'bg-rose-50 text-rose-600' :
                      loc.status === 'ocupado' ? 'bg-sky-50 text-sky-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {loc.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* Modal de Criação / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-slate-200/50 p-6 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                {selectedLocation ? '✏ Editar Localização' : '➕ Nova Localização'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-button active:scale-95"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Identificação / Nome</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Rua C - Box 04"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-form-input font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Tipo de Posição</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-form-input font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="posicao_logistica">Posição de Estoque (Galpão)</option>
                  <option value="locker">Locker Compartilhado / Lockbox</option>
                  <option value="sala">Sala Administrativa Privativa</option>
                  <option value="escritorio">Escritório Geral</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Empresa Vinculada (Segregação)</label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-form-input font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">Nenhuma (Livre / Disponível)</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-form-input font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="disponivel">Disponível</option>
                  <option value="ocupado">Reservado / Ocupado</option>
                  <option value="manutencao">Bloqueado / Manutenção</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                {selectedLocation && (
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedLocation.id)}
                    className="flex-1 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-button font-black uppercase tracking-wider transition-all"
                  >
                    Excluir
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompliancePhysicalMap;

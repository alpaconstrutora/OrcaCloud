import React from 'react';
import { ecommerceService } from '../services/ecommerceService';
import { companyService } from '../services/companyService';
import { useConfirm } from './ui/confirm';
import { EcommercePhysicalLocation, Company } from '../types';

interface EcommercePhysicalMapProps {
  organizationId: string;
  onBack: () => void;
}

const EcommercePhysicalMap: React.FC<EcommercePhysicalMapProps> = ({
  organizationId,
  onBack
}) => {
  const [loading, setLoading] = React.useState(true);
  const [locations, setLocations] = React.useState<EcommercePhysicalLocation[]>([]);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  
  // Controle de edição/criação de localização física
  const [selectedLocation, setSelectedLocation] = React.useState<EcommercePhysicalLocation | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('posicao_logistica');
  const [companyId, setCompanyId] = React.useState('');
  const [status, setStatus] = React.useState('disponivel');
  const confirm = useConfirm();

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [locsData, compsData] = await Promise.all([
        ecommerceService.listPhysicalLocations(organizationId),
        companyService.list(organizationId)
      ]);
      setLocations(locsData);
      setCompanies(compsData);
    } catch (error) {
      console.error('Erro ao buscar posições de segregação:', error);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenEdit = (loc: EcommercePhysicalLocation) => {
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

      await ecommerceService.savePhysicalLocation(payload);
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      console.error('Erro ao salvar localização:', error);
      alert(error.message || 'Erro inesperado ao salvar.');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir área física?',
      message: 'A demarcação será removida do mapa de segregação. Essa ação não pode ser desfeita.',
      variant: 'danger',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await ecommerceService.deletePhysicalLocation(id);
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
              {locations.length === 0 && (
                <div className="text-center py-12">
                  <span className="block text-3xl mb-3">🗺️</span>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">Nenhuma área demarcada</h3>
                  <p className="text-sm text-gray-500">
                    Use "Adicionar Posição" para mapear as posições, lockers e salas do galpão.
                  </p>
                </div>
              )}
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

                    {/* §8 — status de registro em lista: texto colorido simples */}
                    <span className={`text-sm font-normal shrink-0 ${
                      loc.status === 'manutencao' ? 'text-rose-600' :
                      loc.status === 'ocupado' ? 'text-sky-700' : 'text-emerald-700'
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

export default EcommercePhysicalMap;

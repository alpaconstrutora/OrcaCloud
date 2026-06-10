import React, { useEffect, useState } from 'react';
import { reformasService } from '../services/reformasService';
import { reformasExportService } from '../services/reformasExportService';
import { ReformaProjeto } from '../types';
import { Landmark, Calendar, MapPin, Plus, Loader2, ArrowRight, FileDown } from 'lucide-react';

interface ReformasDashboardProps {
  userId: string;
  onNavigate: (tab: 'DASHBOARD' | 'DIARIOS' | 'CRONOGRAMA') => void;
}

const ReformasDashboard: React.FC<ReformasDashboardProps> = ({ userId, onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [projetos, setProjetos] = useState<ReformaProjeto[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  // Modal de cadastro
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nomeCliente, setNomeCliente] = useState('');
  const [endereco, setEndereco] = useState('');
  const [orcamentoTotal, setOrcamentoTotal] = useState('');
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  // Estatísticas calculadas
  const [kpis, setKpis] = useState({
    orcamentoAtivo: 0,
    diariosRegistrados: 0,
    etapasPendentes: 0
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await reformasService.listProjetos(userId);
      setProjetos(data);

      if (data.length > 0) {
        // Restaurar do localStorage ou pegar o primeiro
        const stored = localStorage.getItem('opura_reformas_ativa');
        const active = data.find(p => p.id === stored) || data[0];
        setActiveProjectId(active.id);
        localStorage.setItem('opura_reformas_ativa', active.id);
      }
    } catch (err) {
      console.error('Erro ao listar reformas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadData();
    }
  }, [userId]);

  // Recarregar estatísticas da reforma ativa
  const loadKpis = async () => {
    if (!activeProjectId) return;
    try {
      const activeProj = projetos.find(p => p.id === activeProjectId);
      const [diarios, cronograma] = await Promise.all([
        reformasService.listDiariosByReforma(activeProjectId),
        reformasService.listCronogramaByReforma(activeProjectId)
      ]);

      setKpis({
        orcamentoAtivo: activeProj ? Number(activeProj.orcamento_total || 0) : 0,
        diariosRegistrados: diarios.length,
        etapasPendentes: cronograma.filter(c => c.status !== 'CONCLUIDO').length
      });
    } catch (err) {
      console.error('Erro ao calcular estatísticas:', err);
    }
  };

  useEffect(() => {
    if (activeProjectId && projetos.length > 0) {
      loadKpis();
    }
  }, [activeProjectId, projetos]);

  const handleExportConsolidado = async () => {
    if (!activeProjectId || !selectedProject) return;
    try {
      setExporting(true);
      const [diarios, cronograma] = await Promise.all([
        reformasService.listDiariosByReforma(activeProjectId),
        reformasService.listCronogramaByReforma(activeProjectId)
      ]);
      await reformasExportService.exportReformaConsolidadaPdf(selectedProject, diarios, cronograma);
    } catch (err: any) {
      alert('Erro ao exportar relatório consolidado: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleSelectProject = (id: string) => {
    setActiveProjectId(id);
    localStorage.setItem('opura_reformas_ativa', id);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeCliente) return;

    try {
      setSaving(true);
      const newProj = await reformasService.saveProjeto({
        user_id: userId,
        nome_cliente: nomeCliente.trim(),
        endereco: endereco.trim() || undefined,
        data_inicio: dataInicio,
        status: 'EM_ANDAMENTO',
        orcamento_total: Number(orcamentoTotal || 0)
      });

      setNomeCliente('');
      setEndereco('');
      setOrcamentoTotal('');
      setIsModalOpen(false);
      
      // Atualizar lista e selecionar o recém-criado
      const updated = await reformasService.listProjetos(userId);
      setProjetos(updated);
      setActiveProjectId(newProj.id);
      localStorage.setItem('opura_reformas_ativa', newProj.id);
    } catch (err: any) {
      alert('Erro ao salvar reforma: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 min-h-[400px]">
        <Loader2 className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3 text-orange-500" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Sincronizando Painel...</span>
      </div>
    );
  }

  const selectedProject = projetos.find(p => p.id === activeProjectId);

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">ÒPURA Reformas</h1>
          <p className="text-xs font-semibold text-slate-400">Gestão operacional de obras rápidas</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedProject && (
            <button
              onClick={handleExportConsolidado}
              disabled={exporting}
              className="p-2 bg-[#0D1224] border border-white/5 hover:border-white/10 text-orange-400 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center shrink-0"
              title="Exportar Relatório Consolidado (PDF)"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-2 bg-gradient-to-tr from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white rounded-xl shadow-lg transition-transform active:scale-95"
            title="Nova Reforma"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Seletor de Reforma Ativa */}
      {projetos.length > 0 ? (
        <div className="space-y-1 bg-[#0D1224] p-4 border border-white/5 rounded-2xl">
          <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Selecionar Reforma Ativa</label>
          <select
            value={activeProjectId}
            onChange={(e) => handleSelectProject(e.target.value)}
            className="w-full bg-[#070913] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500 mt-1.5"
          >
            {projetos.map(p => (
              <option key={p.id} value={p.id}>{p.nome_cliente}</option>
            ))}
          </select>
          {selectedProject?.endereco && (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-2 font-medium">
              <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <span className="truncate">{selectedProject.endereco}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed border-white/5 rounded-3xl bg-white/5 p-6">
          <Landmark className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-300">Nenhuma Reforma Cadastrada</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-[200px] mx-auto">Cadastre sua primeira reforma clicando no botão de "+" no topo.</p>
        </div>
      )}

      {/* KPIs da Reforma Ativa */}
      {selectedProject && (
        <div className="grid grid-cols-3 gap-3 bg-gradient-to-tr from-slate-950 to-slate-900 border border-white/5 p-4 rounded-2xl shadow-xl">
          <div className="space-y-1">
            <span className="block text-[8px] font-black uppercase tracking-widest text-emerald-500">Orçamento</span>
            <span className="text-xs font-black text-white block truncate">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(kpis.orcamentoAtivo)}
            </span>
            <span className="block text-[7px] text-slate-400">Verba total</span>
          </div>
          <div className="space-y-1 border-l border-white/5 pl-3">
            <span className="block text-[8px] font-black uppercase tracking-widest text-orange-400">Relatórios</span>
            <span className="text-xs font-black text-white block">{kpis.diariosRegistrados}</span>
            <span className="block text-[7px] text-slate-400">Diários salvos</span>
          </div>
          <div className="space-y-1 border-l border-white/5 pl-3">
            <span className="block text-[8px] font-black uppercase tracking-widest text-blue-500">Pendente</span>
            <span className="text-xs font-black text-white block">{kpis.etapasPendentes}</span>
            <span className="block text-[7px] text-slate-400">Etapas a fazer</span>
          </div>
        </div>
      )}

      {/* Ações Rápidas */}
      {selectedProject && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('DIARIOS')}
            className="p-4 bg-[#0D1224] border border-white/5 hover:border-white/10 rounded-2xl flex items-center justify-between text-left group active:scale-[0.98] transition-all"
          >
            <div>
              <span className="block text-xs font-bold text-white group-hover:text-orange-500 transition-colors">🎤 Diário por Voz</span>
              <span className="text-[9px] text-slate-500 block mt-0.5">Relatar avanço da obra</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <button
            onClick={() => onNavigate('CRONOGRAMA')}
            className="p-4 bg-[#0D1224] border border-white/5 hover:border-white/10 rounded-2xl flex items-center justify-between text-left group active:scale-[0.98] transition-all"
          >
            <div>
              <span className="block text-xs font-bold text-white group-hover:text-orange-500 transition-colors">📅 Cronograma</span>
              <span className="text-[9px] text-slate-500 block mt-0.5">Checklist de etapas</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}

      {/* Modal de Nova Reforma */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form
            onSubmit={handleCreateProject}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-orange-500">Nova Reforma</span>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 text-lg hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              {/* Nome do Cliente */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Nome do Cliente</label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva"
                  value={nomeCliente}
                  onChange={(e) => setNomeCliente(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                  required
                />
              </div>

              {/* Endereço */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Endereço da Obra</label>
                <input
                  type="text"
                  placeholder="Rua, Número, Bairro, Apto"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                />
              </div>

              {/* Orçamento e Data Início */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Orçamento (R$)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={orcamentoTotal}
                    onChange={(e) => setOrcamentoTotal(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Data de Início</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 bg-gradient-to-tr from-orange-600 to-amber-500 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Criar Obra
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ReformasDashboard;

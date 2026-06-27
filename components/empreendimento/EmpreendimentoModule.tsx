// components/empreendimento/EmpreendimentoModule.tsx
import React from 'react';
import { Plus, Loader2, Building2, Search, ArrowRight, Trash2 } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import { Empreendimento, EmpreendimentoStatus } from '../../types';
import EmpreendimentoForm from './EmpreendimentoForm';
import EmpreendimentoDetail from './EmpreendimentoDetail';

interface Props {
  activeOrganizationId: string | null;
  onChangeView: (view: string) => void;
}

const STATUS_LABELS: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'Planejamento',
  LANCAMENTO: 'Lançamento',
  EM_OBRAS: 'Em Obras',
  ENTREGUE: 'Entregue',
  ENCERRADO: 'Encerrado',
};

const STATUS_STYLE: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'bg-gray-500/10 text-gray-600',
  LANCAMENTO: 'bg-amber-500/10 text-amber-600',
  EM_OBRAS: 'bg-blue-500/10 text-blue-600',
  ENTREGUE: 'bg-emerald-500/10 text-emerald-600',
  ENCERRADO: 'bg-slate-500/10 text-slate-600',
};

export const EmpreendimentoModule: React.FC<Props> = ({ activeOrganizationId, onChangeView }) => {
  const isWriteDisabled = !activeOrganizationId || activeOrganizationId === 'all' || activeOrganizationId === 'TODAS';
  const orgIdParam = isWriteDisabled ? undefined : (activeOrganizationId as string);

  const [items, setItems] = React.useState<Empreendimento[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Empreendimento | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Empreendimento | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setItems(await empreendimentoService.list(orgIdParam));
    } catch (err) {
      console.error('[EmpreendimentoModule] erro ao carregar:', err);
    } finally {
      setLoading(false);
    }
  }, [orgIdParam]);

  React.useEffect(() => { load(); }, [load]);

  const handleSaved = async (saved: Empreendimento) => {
    setIsFormOpen(false);
    setEditing(null);
    await load();
    // Se estávamos no detalhe, refletir a edição
    if (selected && selected.id === saved.id) setSelected(saved);
  };

  const handleDelete = async (e: React.MouseEvent, item: Empreendimento) => {
    e.stopPropagation();
    if (!window.confirm(`Excluir o empreendimento "${item.name}"? Torres, unidades e áreas comuns serão removidos.`)) return;
    try {
      await empreendimentoService.remove(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  };

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (i.spe_razao_social || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Detalhe ────────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <>
        <EmpreendimentoDetail
          empreendimento={selected}
          organizationId={orgIdParam || ''}
          onBack={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setIsFormOpen(true); }}
          onGoToStudy={selected.imovib_study_id ? () => onChangeView('imovib') : undefined}
          onSynced={async () => {
            try {
              const refreshed = await empreendimentoService.getById(selected.id) as Empreendimento | null;
              if (refreshed) setSelected(refreshed);
            } catch { /* noop */ }
          }}
        />
        {isFormOpen && orgIdParam && (
          <EmpreendimentoForm
            organizationId={orgIdParam}
            editing={editing}
            onClose={() => { setIsFormOpen(false); setEditing(null); }}
            onSaved={handleSaved}
          />
        )}
      </>
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
            <span>Comercial</span><span>/</span><span className="text-gray-600 font-bold">Incorporação</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1.5 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" /> Empreendimentos
          </h1>
        </div>
        <button
          onClick={() => { setEditing(null); setIsFormOpen(true); }}
          disabled={isWriteDisabled}
          title={isWriteDisabled ? 'Selecione uma organização específica' : 'Novo empreendimento'}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-[1.25rem] font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-xl shadow-blue-900/10 active:scale-95"
        >
          <Plus className="w-4 h-4" /> Novo Empreendimento
        </button>
      </div>

      {/* Busca */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
        <div className="relative bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex items-center gap-2 max-w-md">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, código ou SPE..."
            className="bg-transparent border-none outline-none text-sm w-full font-medium"
          />
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Carregando empreendimentos...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white py-16 text-center text-gray-400 rounded-3xl border border-gray-100">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-sm">Nenhum empreendimento cadastrado.</p>
          {isWriteDisabled && <p className="text-xs mt-1">Selecione uma organização específica para cadastrar.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(item => (
            <div
              key={item.id}
              onClick={() => setSelected(item)}
              className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 text-sm group-hover:text-blue-600 transition-colors">{item.name}</h4>
                    <p className="text-gray-400 text-xs font-semibold">{item.code || item.spe_razao_social || '—'}</p>
                  </div>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${STATUS_STYLE[item.status]}`}>
                  {STATUS_LABELS[item.status]}
                </span>
              </div>

              <div className="flex items-end justify-between mt-5 border-t border-gray-50 pt-3 text-xs">
                <div>
                  <span className="text-gray-400 block text-[9px] font-bold uppercase tracking-wider">VGV Total</span>
                  <span className="font-bold text-gray-700">
                    {item.vgv_total != null ? `R$ ${item.vgv_total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => handleDelete(e, item)} className="p-1.5 hover:bg-rose-50 text-rose-400 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  <span className="flex items-center gap-1.5 text-blue-500 font-bold text-[10px] uppercase tracking-wider">
                    Abrir <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isFormOpen && orgIdParam && (
        <EmpreendimentoForm
          organizationId={orgIdParam}
          editing={editing}
          onClose={() => { setIsFormOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default EmpreendimentoModule;

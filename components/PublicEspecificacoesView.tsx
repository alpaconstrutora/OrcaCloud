import React, { useEffect, useState } from 'react';
import { Check, X, MessageSquare, Loader2, Compass, AlertTriangle } from 'lucide-react';
import { officesService } from '../services/officesService';
import { OfficesEspecificacao } from '../types';

interface PublicEspecificacoesViewProps {
  projetoId: string;
}

export const PublicEspecificacoesView: React.FC<PublicEspecificacoesViewProps> = ({ projetoId }) => {
  const [loading, setLoading] = useState(true);
  const [specs, setSpecs] = useState<OfficesEspecificacao[]>([]);
  const [projectName, setProjectName] = useState('Projeto de Arquitetura');
  const [error, setError] = useState<string | null>(null);

  // Modal de recusa
  const [refusalModalOpen, setRefusalModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [refusalComment, setRefusalComment] = useState('');
  const [submittingAction, setSubmittingAction] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await officesService.listEspecificacoesPublicas(projetoId);
      setSpecs(res.items);
      setProjectName(res.projectName);
    } catch (err: any) {
      console.error(err);
      setError('Não foi possível carregar as especificações do projeto. Verifique o link e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projetoId) {
      loadData();
    }
  }, [projetoId]);

  const handleApprove = async (itemId: string) => {
    try {
      setSubmittingAction(itemId);
      await officesService.updateStatusAprovacaoPublica(itemId, 'APROVADO');
      setSpecs(prev => prev.map(item => item.id === itemId ? { ...item, status_aprovacao: 'APROVADO', comentario_cliente: undefined } : item));
    } catch (err: any) {
      alert('Erro ao aprovar item: ' + err.message);
    } finally {
      setSubmittingAction(null);
    }
  };

  const openRefusalModal = (itemId: string) => {
    setSelectedItemId(itemId);
    const existingSpec = specs.find(s => s.id === itemId);
    setRefusalComment(existingSpec?.comentario_cliente || '');
    setRefusalModalOpen(true);
  };

  const handleRefusalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return;

    try {
      setSubmittingAction(selectedItemId);
      setRefusalModalOpen(false);
      await officesService.updateStatusAprovacaoPublica(selectedItemId, 'RECUSADO', refusalComment);
      setSpecs(prev => prev.map(item => item.id === selectedItemId ? { ...item, status_aprovacao: 'RECUSADO', comentario_cliente: refusalComment } : item));
      setRefusalComment('');
      setSelectedItemId(null);
    } catch (err: any) {
      alert('Erro ao registrar recusa: ' + err.message);
    } finally {
      setSubmittingAction(null);
    }
  };

  // Agrupar itens por cômodo/ambiente
  const environments = specs.reduce((acc: Record<string, OfficesEspecificacao[]>, item) => {
    const env = item.ambiente || 'Geral';
    if (!acc[env]) acc[env] = [];
    acc[env].push(item);
    return acc;
  }, {});

  const totalItems = specs.length;
  const approvedItems = specs.filter(s => s.status_aprovacao === 'APROVADO').length;
  const refusedItems = specs.filter(s => s.status_aprovacao === 'RECUSADO').length;
  const pendingItems = specs.filter(s => s.status_aprovacao === 'PENDENTE').length;

  const approvalRate = totalItems > 0 ? Math.round((approvedItems / totalItems) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Carregando especificações...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#070913] flex flex-col items-center justify-center text-white p-6">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 text-center backdrop-blur-xl">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Erro de Carregamento</h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">{error}</p>
          <button
            onClick={loadData}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-button uppercase tracking-widest rounded-xl transition-all"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070913] text-slate-100 pb-20 font-sans">
      {/* Background Glows */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-purple-900/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Header Fixo de Progresso */}
      <header className="sticky top-0 z-40 bg-[#070913]/85 backdrop-blur-md border-b border-white/5 py-4 px-6 shadow-lg">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl shadow-lg shadow-blue-900/20 text-white">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-blue-500">Aprovação de Memorial</span>
              <h1 className="text-lg font-black tracking-tight text-white">{projectName}</h1>
            </div>
          </div>

          {totalItems > 0 && (
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-slate-400 font-semibold">Progresso: {approvedItems}/{totalItems} aprovados</p>
                <div className="w-40 h-2 bg-white/5 rounded-full overflow-hidden mt-1.5 border border-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                    style={{ width: `${approvalRate}%` }}
                  />
                </div>
              </div>
              <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-black">
                {approvalRate}% APROVADO
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 mt-8 relative z-10">
        {totalItems === 0 ? (
          <div className="text-center py-20 bg-white/5 border border-white/5 rounded-3xl backdrop-blur-xl">
            <Compass className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-300">Nenhum item especificado</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">O arquiteto ainda não cadastrou itens de especificação para este projeto.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(environments).map(([envName, items]) => (
              <section key={envName} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                  <h2 className="text-xl font-bold tracking-tight text-white">{envName}</h2>
                  <span className="text-xs font-bold bg-white/5 text-slate-400 px-2 py-0.5 rounded-full">
                    {items.length} {items.length === 1 ? 'item' : 'itens'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {items.map((item) => {
                    const isApproved = item.status_aprovacao === 'APROVADO';
                    const isRefused = item.status_aprovacao === 'RECUSADO';
                    const isPending = item.status_aprovacao === 'PENDENTE';
                    const isWorking = submittingAction === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`bg-white/5 border rounded-3xl p-5 flex gap-4 transition-all hover:bg-white/[0.07] ${
                          isApproved ? 'border-emerald-500/20 shadow-md shadow-emerald-950/10' :
                          isRefused ? 'border-rose-500/20' : 'border-white/5'
                        }`}
                      >
                        {/* Imagem do Item */}
                        <div className="w-24 h-24 rounded-2xl bg-slate-900 border border-white/5 overflow-hidden shrink-0 flex items-center justify-center relative">
                          {item.foto_url ? (
                            <img src={item.foto_url} alt={item.item_nome} className="w-full h-full object-cover" />
                          ) : (
                            <Compass className="w-8 h-8 text-slate-700" />
                          )}

                          {/* Badge de Status no Card */}
                          <div className="absolute top-1 right-1">
                            {isApproved && (
                              <span className="flex items-center justify-center w-5 h-5 bg-emerald-500 text-[#070913] rounded-full text-xs font-bold">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            )}
                            {isRefused && (
                              <span className="flex items-center justify-center w-5 h-5 bg-rose-500 text-white rounded-full text-xs font-bold">
                                <X className="w-3 h-3 stroke-[3]" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Detalhes do Item */}
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                          <div>
                            <h3 className="font-bold text-base text-white truncate">{item.item_nome}</h3>
                            {item.fabricante_fornecedor && (
                              <p className="text-xs text-slate-400 mt-0.5 truncate">{item.fabricante_fornecedor}</p>
                            )}

                            <div className="flex items-center gap-4 mt-2 text-xs font-semibold text-slate-300">
                              <span>Qtd: {item.quantidade}</span>
                              {item.preco_unitario > 0 && (
                                <span>
                                  Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.preco_unitario * item.quantidade)}
                                </span>
                              )}
                            </div>

                            {/* Comentário de Recusa */}
                            {isRefused && item.comentario_cliente && (
                              <div className="mt-3 p-2.5 bg-rose-500/5 border border-rose-500/10 rounded-xl flex items-start gap-2 text-xs text-rose-300">
                                <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span className="italic leading-relaxed">{item.comentario_cliente}</span>
                              </div>
                            )}
                          </div>

                          {/* Ações */}
                          <div className="flex items-center gap-2 mt-4">
                            {isWorking ? (
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 py-1">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Processando...
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleApprove(item.id)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 ${
                                    isApproved
                                      ? 'bg-emerald-500 text-[#070913] shadow-lg shadow-emerald-500/20'
                                      : 'bg-white/5 border border-white/5 text-slate-300 hover:bg-white/10'
                                  }`}
                                >
                                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                  Aprovar
                                </button>
                                <button
                                  onClick={() => openRefusalModal(item.id)}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-button font-black uppercase tracking-wider transition-all active:scale-95 ${
                                    isRefused
                                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                                      : 'bg-white/5 border border-white/5 text-slate-300 hover:bg-white/10'
                                  }`}
                                >
                                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                  Recusar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Modal de Comentário de Recusa */}
      {refusalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0D1224] border border-white/10 rounded-3xl p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-2">Por que recusar este item?</h3>
            <p className="text-xs text-slate-400 mb-4 font-medium leading-relaxed">
              Escreva um feedback para o arquiteto saber qual modificação realizar na especificação deste produto.
            </p>

            <form onSubmit={handleRefusalSubmit} className="space-y-4">
              <textarea
                value={refusalComment}
                onChange={(e) => setRefusalComment(e.target.value)}
                className="w-full h-32 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 text-slate-100 text-sm font-medium transition-all resize-none"
                placeholder="Ex: Gostaria de uma cor mais escura ou acabamento fosco..."
                required
              />

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setRefusalModalOpen(false); setSelectedItemId(null); }}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-button font-bold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-button font-bold shadow-lg shadow-rose-900/30 transition-all active:scale-95"
                >
                  Registrar Recusa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

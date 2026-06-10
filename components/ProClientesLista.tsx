import React from 'react';
import { proService } from '../services/proService';
import { ProCliente } from '../types';

interface ProClientesListaProps {
  userId: string;
  onBack: () => void;
}

const ProClientesLista: React.FC<ProClientesListaProps> = ({ userId, onBack }) => {
  const [loading, setLoading] = React.useState(true);
  const [clientes, setClientes] = React.useState<ProCliente[]>([]);
  const [orcamentos, setOrcamentos] = React.useState<any[]>([]);

  // Estados de criação de cliente
  const [mostrarForm, setMostrarForm] = React.useState(false);
  const [nome, setNome] = React.useState('');
  const [telefone, setTelefone] = React.useState('');
  const [endereco, setEndereco] = React.useState('');
  const [observacoes, setObservacoes] = React.useState('');

  // Expandir histórico do cliente
  const [clienteExpandidoId, setClienteExpandidoId] = React.useState<string | null>(null);

  const fetchClientes = React.useCallback(async () => {
    try {
      setLoading(true);
      const [cliData, orcData] = await Promise.all([
        proService.listClientes(userId),
        proService.listOrcamentos(userId)
      ]);
      setClientes(cliData);
      setOrcamentos(orcData);
    } catch (error) {
      console.error('Erro ao listar clientes:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const handleCreate = async () => {
    if (!nome || !telefone) {
      alert('Nome e telefone são campos obrigatórios.');
      return;
    }

    try {
      setLoading(true);
      await proService.saveCliente({
        user_id: userId,
        nome,
        telefone,
        endereco: endereco || undefined,
        observacoes: observacoes || undefined
      });

      // Reset form
      setNome('');
      setTelefone('');
      setEndereco('');
      setObservacoes('');
      setMostrarForm(false);

      // Refresh list
      await fetchClientes();
    } catch (error) {
      console.error('Erro ao cadastrar cliente:', error);
      alert('Erro ao salvar o cliente.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900 text-slate-100">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Clientes...</span>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col h-full bg-slate-900 text-slate-100 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-lg">
            ←
          </button>
          <h1 className="text-lg font-black text-white">Meus Clientes</h1>
        </div>
        <button
          onClick={() => setMostrarForm(!mostrarForm)}
          className="text-xs font-black uppercase tracking-widest text-orange-500 hover:text-orange-400"
        >
          {mostrarForm ? 'Cancelar' : '+ Cadastrar'}
        </button>
      </div>

      {/* Formulário Novo Cliente */}
      {mostrarForm && (
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top-3 duration-250">
          <span className="block text-[10px] font-black uppercase tracking-widest text-orange-500">Novo Cadastro</span>
          <div className="space-y-2.5">
            <input
              type="text"
              placeholder="Nome do Cliente"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
            />
            <input
              type="tel"
              placeholder="WhatsApp / Telefone (com DDD)"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
            />
            <input
              type="text"
              placeholder="Endereço de execução"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
            />
            <textarea
              rows={2}
              placeholder="Observações úteis..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-orange-500 resize-none"
            />
          </div>
          <button
            onClick={handleCreate}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
          >
            Confirmar Cadastro
          </button>
        </div>
      )}

      {/* Lista de Clientes */}
      <div className="space-y-3 flex-1 overflow-y-auto">
        {clientes.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
            Nenhum cliente cadastrado ainda.
          </div>
        ) : (
          clientes.map(c => {
            const orcamentosDoCliente = orcamentos.filter(o => o.cliente_id === c.id);
            const totalGasto = orcamentosDoCliente
              .filter(o => o.status === 'APROVADO' || o.status === 'ENVIADO')
              .reduce((sum, o) => sum + Number(o.valor), 0);

            const estaExpandido = clienteExpandidoId === c.id;

            return (
              <div
                key={c.id}
                className="bg-slate-950/40 border border-slate-800 rounded-2xl overflow-hidden transition-all duration-200"
              >
                {/* Header do Card */}
                <div
                  onClick={() => setClienteExpandidoId(estaExpandido ? null : c.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-950/20"
                >
                  <div className="space-y-1">
                    <span className="block font-black text-sm text-white">{c.nome}</span>
                    <span className="block text-[10px] text-slate-400">{c.telefone}</span>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Total Acumulado</span>
                    <span className="block font-black text-white text-xs">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGasto)}
                    </span>
                  </div>
                </div>

                {/* Detalhes Expandidos (Histórico) */}
                {estaExpandido && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-900/60 bg-slate-950/20 space-y-4">
                    {c.endereco && (
                      <div className="space-y-0.5">
                        <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Endereço Principal</span>
                        <span className="block text-xs text-orange-400">📍 {c.endereco}</span>
                      </div>
                    )}

                    {c.observacoes && (
                      <div className="space-y-0.5">
                        <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Notas</span>
                        <p className="text-xs text-slate-400">{c.observacoes}</p>
                      </div>
                    )}

                    {/* Histórico de Serviços / Orçamentos */}
                    <div className="space-y-2">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Histórico de Orçamentos</span>
                      {orcamentosDoCliente.length === 0 ? (
                        <span className="block text-[10px] text-slate-500 italic">Nenhum orçamento para este cliente.</span>
                      ) : (
                        <div className="space-y-1.5">
                          {orcamentosDoCliente.map(o => (
                            <div key={o.id} className="flex items-center justify-between py-1 border-b border-slate-900/20 text-xs">
                              <span className="text-slate-300 truncate max-w-[60%]">{o.descricao}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.valor)}
                                </span>
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.25 rounded ${
                                  o.status === 'APROVADO' ? 'bg-emerald-500/20 text-emerald-400' :
                                  o.status === 'ENVIADO' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {o.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Botão de Ação Rápida WhatsApp */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const cleanPhone = c.telefone.replace(/\D/g, '');
                        const targetPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone;
                        window.open(`https://wa.me/${targetPhone}`, '_blank');
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-colors text-center"
                    >
                      💬 Chamar no WhatsApp
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ProClientesLista;

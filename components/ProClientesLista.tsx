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

  // Estados de criação/edição de cliente
  const [mostrarForm, setMostrarForm] = React.useState(false);
  const [editingClienteId, setEditingClienteId] = React.useState<string | null>(null);
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

  const handleSubmit = async () => {
    if (!nome || !telefone) {
      alert('Nome e telefone são campos obrigatórios.');
      return;
    }

    try {
      setLoading(true);
      if (editingClienteId) {
        await proService.saveCliente({
          id: editingClienteId,
          user_id: userId,
          nome,
          telefone,
          endereco: endereco || undefined,
          observacoes: observacoes || undefined
        });
        alert('Cliente atualizado com sucesso!');
      } else {
        await proService.saveCliente({
          user_id: userId,
          nome,
          telefone,
          endereco: endereco || undefined,
          observacoes: observacoes || undefined
        });
      }

      // Reset form
      setNome('');
      setTelefone('');
      setEndereco('');
      setObservacoes('');
      setEditingClienteId(null);
      setMostrarForm(false);

      // Refresh list
      await fetchClientes();
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      alert('Erro ao salvar o cliente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, nomeCliente: string) => {
    const confirmMsg = `ATENÇÃO: Tem certeza de que deseja excluir o cliente "${nomeCliente}"?\n\nDevido à exclusão em cascata, TODOS OS ORÇAMENTOS E SERVIÇOS/OS associados a este cliente serão excluídos permanentemente do banco de dados!`;
    if (window.confirm(confirmMsg)) {
      try {
        setLoading(true);
        await proService.deleteCliente(id);
        alert('Cliente e todo seu histórico foram excluídos com sucesso.');
        if (clienteExpandidoId === id) {
          setClienteExpandidoId(null);
        }
        await fetchClientes();
      } catch (error) {
        console.error('Erro ao excluir cliente:', error);
        alert('Não foi possível excluir o cliente.');
      } finally {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#F3F7F9] text-slate-800">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Carregando Clientes...</span>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col h-full bg-[#F3F7F9] text-slate-800 pb-24 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-700 text-lg">
            ←
          </button>
          <h1 className="text-lg font-black text-slate-800">Meus Clientes</h1>
        </div>
        <button
          onClick={() => {
            if (mostrarForm) {
              setNome('');
              setTelefone('');
              setEndereco('');
              setObservacoes('');
              setEditingClienteId(null);
            }
            setMostrarForm(!mostrarForm);
          }}
          className="text-button font-black uppercase tracking-widest text-teal-600 hover:text-teal-500"
        >
          {mostrarForm ? 'Cancelar' : '+ Cadastrar'}
        </button>
      </div>

      {/* Formulário Novo Cliente */}
      {mostrarForm && (
        <div className="bg-white border border-slate-200/50 p-4 rounded-[24px] space-y-3 animate-in slide-in-from-top-3 duration-250 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
          <span className="block text-xs font-black uppercase tracking-widest text-teal-600">
            {editingClienteId ? '✏️ Editar Cadastro' : '✨ Novo Cadastro'}
          </span>
          <div className="space-y-2.5">
            <input
              type="text"
              placeholder="Nome do Cliente"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500"
            />
            <input
              type="tel"
              placeholder="WhatsApp / Telefone (com DDD)"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500"
            />
            <input
              type="text"
              placeholder="Endereço de execução"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500"
            />
            <textarea
              rows={2}
              placeholder="Observações úteis..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-form-input text-slate-700 outline-none focus:border-teal-500 focus:ring-teal-500 resize-none"
            />
          </div>
          <button
            onClick={handleSubmit}
            className="w-full py-2.5 bg-gradient-to-tr from-teal-500 to-cyan-400 hover:from-teal-600 hover:to-cyan-500 text-white text-button font-black uppercase tracking-widest rounded-full transition-all shadow-md shadow-teal-500/10 active:scale-95"
          >
            {editingClienteId ? 'Salvar Alterações' : 'Confirmar Cadastro'}
          </button>
        </div>
      )}

      {/* Lista de Clientes */}
      <div className="space-y-3 flex-1 overflow-y-auto">
        {clientes.length === 0 ? (
          <div className="text-center py-12 text-slate-450 text-xs bg-white border border-dashed border-slate-200 rounded-[24px]">
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
                className="bg-white border border-slate-200/30 rounded-[24px] overflow-hidden transition-all duration-200 shadow-[0_8px_30px_rgb(0,0,0,0.03)]"
              >
                {/* Header do Card */}
                <div
                  onClick={() => setClienteExpandidoId(estaExpandido ? null : c.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/50"
                >
                  <div className="space-y-1">
                    <span className="block font-black text-sm text-slate-800">{c.nome}</span>
                    <span className="block text-xs text-slate-400">{c.telefone}</span>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Total Acumulado</span>
                    <span className="block font-black text-slate-800 text-xs">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGasto)}
                    </span>
                  </div>
                </div>

                {/* Detalhes Expandidos (Histórico) */}
                {estaExpandido && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-slate-50/30 space-y-4">
                    {c.endereco && (
                      <div className="space-y-0.5">
                        <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Endereço Principal</span>
                        <span className="block text-xs text-teal-600 font-semibold">📍 {c.endereco}</span>
                      </div>
                    )}

                    {c.observacoes && (
                      <div className="space-y-0.5">
                        <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Notas</span>
                        <p className="text-xs text-slate-650">{c.observacoes}</p>
                      </div>
                    )}

                    {/* Histórico de Serviços / Orçamentos */}
                    <div className="space-y-2">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Histórico de Orçamentos</span>
                      {orcamentosDoCliente.length === 0 ? (
                        <span className="block text-xs text-slate-400 italic">Nenhum orçamento para este cliente.</span>
                      ) : (
                        <div className="space-y-1.5">
                          {orcamentosDoCliente.map(o => (
                            <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 text-xs">
                              <span className="text-slate-650 truncate max-w-[60%] font-medium">{o.descricao}</span>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.valor)}
                                </span>
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  o.status === 'APROVADO' ? 'bg-emerald-50 text-emerald-600' :
                                  o.status === 'ENVIADO' ? 'bg-teal-50 text-teal-600' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {o.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Painel de Ações */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const cleanPhone = c.telefone.replace(/\D/g, '');
                          const targetPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone;
                          window.open(`https://wa.me/${targetPhone}`, '_blank');
                        }}
                        className="w-full py-2 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200/50 text-emerald-600 font-black text-xs uppercase tracking-widest rounded-xl transition-all text-center shadow-sm flex items-center justify-center gap-1.5"
                      >
                        💬 Chamar no WhatsApp
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingClienteId(c.id);
                            setNome(c.nome);
                            setTelefone(c.telefone);
                            setEndereco(c.endereco || '');
                            setObservacoes(c.observacoes || '');
                            setMostrarForm(true);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="py-2 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest rounded-xl transition-all text-center flex items-center justify-center gap-1"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(c.id, c.nome);
                          }}
                          className="py-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-650 font-black text-xs uppercase tracking-widest rounded-xl transition-all text-center flex items-center justify-center gap-1"
                        >
                          🗑️ Excluir
                        </button>
                      </div>
                    </div>
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

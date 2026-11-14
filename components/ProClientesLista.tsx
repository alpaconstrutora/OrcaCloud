import React from 'react';
import { proService } from '../services/proService';
import { ProCliente } from '../types';
import { AlertTriangle, ChevronLeft, MapPin, MessageCircle, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useConfirm } from './ui/confirm';
import { useToast } from '../hooks/useToast';

interface ProClientesListaProps {
  userId: string;
  onBack: () => void;
}

// Status do orçamento na voz do usuário: texto colorido simples (§8), sem pílula.
const ROTULO_STATUS_ORCAMENTO: Record<string, { rotulo: string; cor: string }> = {
  RASCUNHO: { rotulo: 'Rascunho', cor: 'text-slate-700' },
  ENVIADO: { rotulo: 'Enviado', cor: 'text-blue-700' },
  APROVADO: { rotulo: 'Aprovado', cor: 'text-emerald-700' },
  RECUSADO: { rotulo: 'Recusado', cor: 'text-red-700' },
};

const CAMPO = 'w-full h-11 bg-white border border-slate-300 rounded-[6px] px-3 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600';

const ProClientesLista: React.FC<ProClientesListaProps> = ({ userId, onBack }) => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const idCampo = React.useId();
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
  // Falha de rede vira aviso com "Tentar de novo" — antes a lista ficava vazia, calada.
  const [erro, setErro] = React.useState<string | null>(null);

  const fetchClientes = React.useCallback(async () => {
    try {
      setLoading(true);
      setErro(null);
      const [cliData, orcData] = await Promise.all([
        proService.listClientes(userId),
        proService.listOrcamentos(userId)
      ]);
      setClientes(cliData);
      setOrcamentos(orcData);
    } catch (error: any) {
      console.error('Erro ao listar clientes:', error);
      setErro(error?.message || 'Sem conexão.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const handleSubmit = async () => {
    if (!nome || !telefone) {
      showToast('Informe nome e telefone do cliente.', 'error');
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
        showToast('Cliente atualizado.');
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
      showToast('Não foi possível salvar o cliente. Confira a internet e tente de novo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, nomeCliente: string) => {
    const confirmado = await confirm({
      title: 'Excluir cliente?',
      message: `O cliente "${nomeCliente}" será excluído junto com todos os orçamentos e serviços (OS) dele. Essa ação não pode ser desfeita.`,
      confirmLabel: 'Excluir cliente',
      variant: 'danger',
    });
    if (!confirmado) return;
    try {
      setLoading(true);
      await proService.deleteCliente(id);
      showToast('Cliente excluído, com os orçamentos e serviços dele.');
      if (clienteExpandidoId === id) {
        setClienteExpandidoId(null);
      }
      await fetchClientes();
    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      showToast('Não foi possível excluir o cliente. Confira a internet e tente de novo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-800">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-sm text-slate-600">Carregando clientes…</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-white border border-red-200 rounded-[10px] p-4 space-y-3" role="alert">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Não foi possível carregar os clientes</h2>
            <p className="text-sm text-slate-700 mt-0.5">Confira a internet e tente de novo.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchClientes}
          className="w-full h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" aria-hidden />
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col text-slate-800 space-y-5">
      {/* Header — no computador a seta e o título vêm da casca (ProModule); o "+ Cadastrar" fica */}
      <div className="flex items-center justify-between md:justify-end">
        <div className="flex items-center gap-1 md:hidden">
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="w-11 h-11 -ml-2 flex items-center justify-center rounded-[6px] text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h1 className="text-lg font-black text-slate-900">Meus clientes</h1>
        </div>
        <button
          type="button"
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
          className="inline-flex items-center gap-1 min-h-11 px-2 text-sm font-medium text-blue-700 hover:text-blue-800 transition-colors"
        >
          {mostrarForm ? 'Cancelar' : (
            <>
              <Plus className="w-4 h-4" aria-hidden="true" />
              Cadastrar
            </>
          )}
        </button>
      </div>

      {/* Formulário Novo Cliente */}
      {mostrarForm && (
        <div className="bg-white border border-slate-200 rounded-[10px] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            {editingClienteId ? 'Editar cadastro' : 'Novo cadastro'}
          </h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor={`${idCampo}-nome`} className="block text-xs font-semibold text-slate-500">Nome do cliente</label>
              <input
                id={`${idCampo}-nome`}
                type="text"
                placeholder="Ex.: Maria Souza"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={CAMPO}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${idCampo}-telefone`} className="block text-xs font-semibold text-slate-500">WhatsApp / telefone</label>
              <input
                id={`${idCampo}-telefone`}
                type="tel"
                placeholder="(65) 99999-9999"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className={CAMPO}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${idCampo}-endereco`} className="block text-xs font-semibold text-slate-500">Endereço de execução</label>
              <input
                id={`${idCampo}-endereco`}
                type="text"
                placeholder="Rua, número, bairro"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                className={CAMPO}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${idCampo}-observacoes`} className="block text-xs font-semibold text-slate-500">Observações</label>
              <textarea
                id={`${idCampo}-observacoes`}
                rows={2}
                placeholder="Ex.: portão azul, cachorro no quintal"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-[6px] px-3 py-2.5 text-form-input text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-blue-600 resize-none"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            className="w-full h-11 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-sm transition-colors active:scale-[0.98] disabled:opacity-60"
          >
            {editingClienteId ? 'Salvar alterações' : 'Confirmar cadastro'}
          </button>
        </div>
      )}

      {/* Lista de Clientes */}
      <div className="space-y-3 flex-1 overflow-y-auto">
        {clientes.length === 0 ? (
          <div className="text-center py-12 text-slate-600 text-sm bg-white border border-dashed border-slate-300 rounded-[10px]">
            Nenhum cliente ainda. Toque em “Cadastrar” ou crie um orçamento: o cliente novo entra aqui.
          </div>
        ) : (
          clientes.map(c => {
            const orcamentosDoCliente = orcamentos.filter(o => o.cliente_id === c.id);
            // Só o APROVADO: orçamento enviado é proposta, não serviço contratado (até 14/11/2026
            // somava os dois e o número inflava a cada orçamento mandado).
            const totalGasto = orcamentosDoCliente
              .filter(o => o.status === 'APROVADO')
              .reduce((sum, o) => sum + Number(o.valor), 0);

            const estaExpandido = clienteExpandidoId === c.id;

            return (
              <div
                key={c.id}
                className="bg-white border border-slate-200 rounded-[10px] overflow-hidden"
              >
                {/* Header do Card */}
                <button
                  type="button"
                  aria-expanded={estaExpandido}
                  onClick={() => setClienteExpandidoId(estaExpandido ? null : c.id)}
                  className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
                >
                  <span className="block min-w-0 space-y-1">
                    <span className="block font-semibold text-sm text-slate-900 truncate">{c.nome}</span>
                    <span className="block text-xs text-slate-600">{c.telefone}</span>
                  </span>
                  <span className="block text-right space-y-1 shrink-0">
                    <span className="block text-xs font-semibold text-slate-600">Total aprovado</span>
                    <span className="block font-semibold text-slate-900 text-sm tabular-nums">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalGasto)}
                    </span>
                  </span>
                </button>

                {/* Detalhes Expandidos (Histórico) */}
                {estaExpandido && (
                  <div className="px-4 pb-4 pt-3 border-t border-slate-200 bg-slate-50 space-y-4">
                    {c.endereco && (
                      <div className="space-y-0.5">
                        <span className="block text-xs font-semibold text-slate-600">Endereço principal</span>
                        <span className="flex items-start gap-1 text-sm text-slate-700">
                          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
                          {c.endereco}
                        </span>
                      </div>
                    )}

                    {c.observacoes && (
                      <div className="space-y-0.5">
                        <span className="block text-xs font-semibold text-slate-600">Observações</span>
                        <p className="text-sm text-slate-700">{c.observacoes}</p>
                      </div>
                    )}

                    {/* Histórico de Serviços / Orçamentos */}
                    <div className="space-y-2">
                      <span className="block text-xs font-semibold text-slate-600">Histórico de orçamentos</span>
                      {orcamentosDoCliente.length === 0 ? (
                        <span className="block text-xs text-slate-600 italic">Nenhum orçamento para este cliente.</span>
                      ) : (
                        <div className="space-y-1.5">
                          {orcamentosDoCliente.map(o => {
                            const st = ROTULO_STATUS_ORCAMENTO[o.status] || { rotulo: o.status, cor: 'text-slate-700' };
                            return (
                              <div key={o.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-200 text-xs">
                                <span className="text-slate-700 truncate max-w-[60%] font-medium">{o.descricao}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-semibold text-slate-900 tabular-nums">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.valor)}
                                  </span>
                                  <span className={`text-sm font-medium ${st.cor}`}>
                                    {st.rotulo}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Painel de Ações */}
                    <div className="space-y-2 pt-3 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const cleanPhone = c.telefone.replace(/\D/g, '');
                          const targetPhone = cleanPhone.length === 10 || cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone;
                          window.open(`https://wa.me/${targetPhone}`, '_blank');
                        }}
                        className="w-full h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" aria-hidden="true" />
                        Chamar no WhatsApp
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
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
                          className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-[6px] font-medium text-sm transition-colors"
                        >
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(c.id, c.nome);
                          }}
                          className="h-11 flex items-center justify-center gap-1.5 bg-white hover:bg-red-50 border border-red-300 text-red-700 rounded-[6px] font-medium text-sm transition-colors"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                          Excluir
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

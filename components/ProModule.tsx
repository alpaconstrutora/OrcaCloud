import React from 'react';
import { CalendarDays, Plus, RefreshCw, Settings, Users } from 'lucide-react';
import ProDashboard from './ProDashboard';
import ProOrcamentoForm from './ProOrcamentoForm';
import ProServicoView from './ProServicoView';
import ProClientesLista from './ProClientesLista';
import ProConfigForm from './ProConfigForm';
import { TabsBar } from './ui/TabsBar';

interface ProModuleProps {
  activeView: string;
  onChangeView: (view: string) => void;
  userId: string;
}

/**
 * Casca do ÒPURA Pro (passo 3 da crítica de design, 14/11/2026 —
 * docs/planos/2026-11-14-opura-pro-critica.md).
 *
 * Antes: um celular DESENHADO no meio da tela do computador (`md:max-w-md
 * md:rounded-[32px]`) e, no celular, uma barra inferior `absolute` dentro de um
 * contêiner que cresce — em tela longa ela só aparecia rolando até o fim.
 *
 * Agora:
 *  - celular: barra inferior `fixed`, com a área segura do iPhone, 4 colunas iguais
 *    (ícone + rótulo), aba ativa com `aria-current`;
 *  - computador: sem moldura; cabeçalho §20 (título muda com a aba) + abas §19.1
 *    com "Novo orçamento" (§17) e "Atualizar"; conteúdo numa coluna de leitura.
 *    As telas de aba escondem o próprio cabeçalho em `md:` — quem fala é este.
 */

type AbaPro = 'pro-dashboard' | 'pro-clientes-lista' | 'pro-config';

const ABAS: { id: AbaPro; label: string; titulo: string; subtitulo: string }[] = [
  { id: 'pro-dashboard', label: 'Agenda', titulo: 'Agenda', subtitulo: 'Serviços do dia, cobranças e orçamentos.' },
  { id: 'pro-clientes-lista', label: 'Clientes', titulo: 'Clientes', subtitulo: 'Quem você atende, com telefone e endereço.' },
  { id: 'pro-config', label: 'Ajustes', titulo: 'Ajustes', subtitulo: 'Seus dados, chave Pix e modelos de orçamento.' },
];

export const ProModule: React.FC<ProModuleProps> = ({ activeView, onChangeView, userId }) => {
  // Estados para navegação interna de registros
  const [selectedOrcamentoId, setSelectedOrcamentoId] = React.useState<string | null>(null);
  const [selectedServicoId, setSelectedServicoId] = React.useState<string | null>(null);
  // Vindo do "Recebi" do painel: a tela do serviço já abre com o formulário de recebimento.
  const [abrirRecebimento, setAbrirRecebimento] = React.useState(false);
  // "Atualizar" (computador): remonta a tela da aba, que busca os dados de novo.
  const [versao, setVersao] = React.useState(0);

  const handleEditOrcamento = (id: string) => {
    setSelectedOrcamentoId(id);
    onChangeView('pro-orcamento-form');
  };

  const handleCreateOrcamento = () => {
    setSelectedOrcamentoId(null);
    onChangeView('pro-orcamento-form');
  };

  const handleViewServico = (id: string, opcoes?: { abrirRecebimento?: boolean }) => {
    setSelectedServicoId(id);
    setAbrirRecebimento(!!opcoes?.abrirRecebimento);
    onChangeView('pro-servico-detalhe');
  };

  React.useEffect(() => {
    if (activeView === 'pro-servico-detalhe' && !selectedServicoId) {
      onChangeView('pro-dashboard');
    }
  }, [activeView, selectedServicoId, onChangeView]);

  const abaAtiva = ABAS.find(a => a.id === activeView);

  const itensDaBarra: { id: string; label: string; icone: React.ReactNode; acao: () => void; ativo: boolean; novo?: boolean }[] = [
    { id: 'pro-dashboard', label: 'Agenda', icone: <CalendarDays className="w-5 h-5" aria-hidden />, acao: () => onChangeView('pro-dashboard'), ativo: activeView === 'pro-dashboard' },
    { id: 'pro-clientes-lista', label: 'Clientes', icone: <Users className="w-5 h-5" aria-hidden />, acao: () => onChangeView('pro-clientes-lista'), ativo: activeView === 'pro-clientes-lista' },
    { id: 'novo', label: 'Novo', icone: <Plus className="w-5 h-5" aria-hidden />, acao: handleCreateOrcamento, ativo: activeView === 'pro-orcamento-form' && !selectedOrcamentoId, novo: true },
    { id: 'pro-config', label: 'Ajustes', icone: <Settings className="w-5 h-5" aria-hidden />, acao: () => onChangeView('pro-config'), ativo: activeView === 'pro-config' },
  ];

  return (
    // Celular: espaço embaixo para a barra fixa (64px + área segura). Computador: o ritmo
    // vem do §20.1 — 24px do título às abas (mb-6) e 12px das abas ao conteúdo (mb-3 do TabsBar).
    <div className="text-slate-800 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-20 md:max-w-3xl">
      {/* Computador: cabeçalho §20 + abas §19.1 */}
      <div className="hidden md:block">
        {abaAtiva && (
          <div className="mb-6">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{abaAtiva.titulo}</h1>
            <p className="text-gray-500 text-sm mt-1.5 font-medium">{abaAtiva.subtitulo}</p>
          </div>
        )}
        <TabsBar
          tabs={ABAS.map(a => ({ id: a.id, label: a.label }))}
          value={(abaAtiva?.id ?? activeView) as AbaPro}
          onChange={(id) => onChangeView(id)}
        >
          {abaAtiva && abaAtiva.id !== 'pro-config' && (
            <button
              type="button"
              onClick={() => setVersao(v => v + 1)}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-white border border-gray-200 text-gray-700 rounded-[6px] hover:bg-gray-50 font-medium text-[13px] transition-colors"
            >
              <RefreshCw className="w-[15px] h-[15px]" aria-hidden />
              Atualizar
            </button>
          )}
          <button
            type="button"
            onClick={handleCreateOrcamento}
            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
          >
            <Plus className="w-[15px] h-[15px]" aria-hidden />
            Novo orçamento
          </button>
        </TabsBar>
      </div>

      {/* Conteúdo: no computador, a mesma coluna do título e das abas (as telas foram
          desenhadas para uma coluna; esticar em 1.400px afastaria o botão do que ele afeta) */}
      <div>
        {activeView === 'pro-dashboard' && (
          <ProDashboard
            key={versao}
            userId={userId}
            onNewOrcamento={handleCreateOrcamento}
            onEditOrcamento={handleEditOrcamento}
            onViewServico={handleViewServico}
            onNavigate={onChangeView}
          />
        )}

        {activeView === 'pro-orcamento-form' && (
          <ProOrcamentoForm
            userId={userId}
            orcamentoId={selectedOrcamentoId}
            onBack={() => onChangeView('pro-dashboard')}
            onSave={() => onChangeView('pro-dashboard')}
          />
        )}

        {activeView === 'pro-servico-detalhe' && (
          <ProServicoView
            userId={userId}
            servicoId={selectedServicoId}
            abrirRecebimento={abrirRecebimento}
            onBack={() => onChangeView('pro-dashboard')}
            onSave={() => onChangeView('pro-dashboard')}
          />
        )}

        {activeView === 'pro-clientes-lista' && (
          <ProClientesLista
            key={versao}
            userId={userId}
            onBack={() => onChangeView('pro-dashboard')}
          />
        )}

        {activeView === 'pro-config' && (
          <ProConfigForm
            userId={userId}
            onBack={() => onChangeView('pro-dashboard')}
          />
        )}
      </div>

      {/* Celular: barra inferior FIXA (antes `absolute` no fim do conteúdo) */}
      <nav
        aria-label="ÒPURA Pro"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-4">
          {itensDaBarra.map(item => (
            <li key={item.id}>
              <button
                type="button"
                onClick={item.acao}
                aria-current={item.ativo ? 'page' : undefined}
                className={`w-full h-16 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors outline-none focus-visible:bg-slate-100 ${
                  item.ativo ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.novo ? (
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${item.ativo ? 'bg-blue-700' : 'bg-blue-600'}`}>
                    {item.icone}
                  </span>
                ) : (
                  item.icone
                )}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default ProModule;

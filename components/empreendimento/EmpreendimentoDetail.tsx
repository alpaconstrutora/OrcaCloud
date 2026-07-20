// components/empreendimento/EmpreendimentoDetail.tsx
import React from 'react';
import { ArrowLeft, Edit, Building2, MapPin, FileText, Layers, BarChart3, ShoppingBag, KeyRound, Map, ArrowLeftRight, ScrollText, Inbox, AlertCircle } from 'lucide-react';
import { Empreendimento, EmpreendimentoStatus } from '../../types';
import TowerEditor from './TowerEditor';
import SyncFromStudyModal from './SyncFromStudyModal';
import { EspelhoVendasTab } from './EspelhoVendasTab';
import { EspelhoLocacoesTab } from './EspelhoLocacoesTab';
import { SyncCenterTab } from './SyncCenterTab';
import CuradoriaTab from './CuradoriaTab';
import { empreendimentoProposalService } from '../../services/empreendimentoProposalService';
import MapaRegulatorioEditor from '../MapaRegulatorioEditor';
import { empreendimentoService } from '../../services/empreendimentoService';
import { empreendimentoTypeService } from '../../services/empreendimentoTypeService';
import { areaEngineService } from '../../services/areaEngineService';
import { generateIncorporationMemorialDraftPdf } from '../../services/incorporationMemorialService';

interface Props {
  empreendimento: Empreendimento;
  organizationId: string;
  onBack: () => void;
  onEdit: () => void;
  onGoToStudy?: () => void;
  onSynced?: () => void;
}

const STATUS_LABELS: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'Planejamento',
  LANCAMENTO: 'Lançamento',
  EM_OBRAS: 'Em Obras',
  ENTREGUE: 'Entregue',
  ENCERRADO: 'Encerrado',
};

// Fallback só usado se o catálogo (Configurações do Sistema → Tipos de Empreendimento)
// ainda não carregou ou o tipo salvo foi excluído do catálogo.
const FALLBACK_TIPO_LABELS: Record<string, string> = {
  VERTICAL: 'Vertical',
  HORIZONTAL: 'Horizontal',
  MISTO: 'Misto',
  COND_LOGISTICO: 'Condomínio Logístico',
  COND_INDUSTRIAL: 'Condomínio Industrial',
};

// Texto colorido, sem pílula/fundo/uppercase (ui_ux_standard_guide.md §8).
const STATUS_TEXT_COLOR: Record<EmpreendimentoStatus, string> = {
  PLANEJAMENTO: 'text-gray-600',
  LANCAMENTO: 'text-amber-600',
  EM_OBRAS: 'text-blue-600',
  ENTREGUE: 'text-emerald-600',
  ENCERRADO: 'text-slate-500',
};

type Tab = 'visao' | 'sync' | 'curadoria' | 'torres' | 'regulatorio' | 'comercial' | 'locacoes';

export const EmpreendimentoDetail: React.FC<Props> = ({ empreendimento: e, organizationId, onBack, onEdit, onGoToStudy, onSynced }) => {
  const [tab, setTab] = React.useState<Tab>('visao');
  const [syncOpen, setSyncOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [generatingMemorial, setGeneratingMemorial] = React.useState(false);
  const [pendingCuradoria, setPendingCuradoria] = React.useState(0);
  const [tipoNameMap, setTipoNameMap] = React.useState<Record<string, string>>({});
  const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  };

  const loadPendingCuradoria = React.useCallback(async () => {
    try {
      setPendingCuradoria(await empreendimentoProposalService.countPending(e.id));
    } catch {
      setPendingCuradoria(0); // curadoria indisponível (migration não aplicada) — badge some
    }
  }, [e.id]);

  React.useEffect(() => { loadPendingCuradoria(); }, [loadPendingCuradoria, refreshKey]);

  React.useEffect(() => {
    empreendimentoTypeService.list(organizationId)
      .then(types => setTipoNameMap(Object.fromEntries(types.map(t => [t.slug, t.name]))))
      .catch(() => setTipoNameMap({}));
  }, [organizationId]);

  const tipoLabel = e.tipo ? (tipoNameMap[e.tipo] || FALLBACK_TIPO_LABELS[e.tipo] || e.tipo) : undefined;

  const enderecoCidade = [e.endereco_city, e.endereco_state].filter(Boolean).join(' - ');
  const enderecoLinha = [e.endereco_street, e.endereco_number].filter(Boolean).join(', ');

  const handleGenerateMemorial = async () => {
    setGeneratingMemorial(true);
    try {
      const [towers, project] = await Promise.all([
        empreendimentoService.listTowers(e.id),
        areaEngineService.getProjectByEmpreendimento(e.id, organizationId),
      ]);
      let version = null as Awaited<ReturnType<typeof areaEngineService.getVersion>>;
      let quadroI: Awaited<ReturnType<typeof areaEngineService.listQuadroI>> = [];
      let quadroII: Awaited<ReturnType<typeof areaEngineService.listQuadroII>> = [];
      let fractions: Awaited<ReturnType<typeof areaEngineService.listFractions>> = [];
      if (project) {
        const versions = await areaEngineService.listVersions(project.id);
        const latest = versions.find(v => v.status === 'locked') ?? versions[0] ?? null;
        if (latest) {
          version = latest;
          [quadroI, quadroII, fractions] = await Promise.all([
            areaEngineService.listQuadroI(latest.id),
            areaEngineService.listQuadroII(latest.id),
            areaEngineService.listFractions(latest.id),
          ]);
        }
      }
      generateIncorporationMemorialDraftPdf({ empreendimento: e, towers, version, quadroI, quadroII, fractions });
    } catch (err) {
      console.error('[EmpreendimentoDetail] erro ao gerar minuta do memorial:', err);
      notify('Erro ao gerar a minuta do memorial. Tente novamente.', 'error');
    } finally {
      setGeneratingMemorial(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: 'visao', label: 'Visão Geral', icon: FileText },
    { id: 'sync', label: 'Sincronização', icon: ArrowLeftRight },
    { id: 'curadoria', label: 'Curadoria', icon: Inbox, badge: pendingCuradoria },
    { id: 'torres', label: 'Torres & Unidades', icon: Layers },
    { id: 'regulatorio', label: 'Mapa Regulatorio', icon: Map },
    { id: 'comercial', label: 'Espelho de Vendas', icon: ShoppingBag },
    { id: 'locacoes', label: 'Espelho de Locações', icon: KeyRound },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-[6px] text-sm font-medium text-gray-500 hover:bg-gray-100 transition-all mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-[10px]">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">{e.name}</h1>
                <span className={`text-sm font-normal ${STATUS_TEXT_COLOR[e.status]}`}>
                  {STATUS_LABELS[e.status]}
                </span>
                {tipoLabel && (
                  <span className="text-sm font-normal text-gray-500">
                    · {tipoLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                {e.code ? `${e.code} · ` : ''}{e.spe_razao_social || e.developer_name || 'Sem SPE definida'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* "Sincronizar do Estudo" NÃO mora aqui: a mesma ação já existe na aba Centro de
                Sincronização, onde ela tem contexto (divergências, última sync) e desabilita
                sozinha quando não há o que sincronizar. Ter as duas era o mesmo controle em
                dois lugares com estados diferentes — o do header ficava sempre aceso, mesmo
                sem divergência nenhuma (ui_ux_standard_guide.md §6.4/§18). */}
            {e.imovib_study_id && onGoToStudy && (
              <button
                onClick={onGoToStudy}
                className="flex items-center gap-1.5 h-9 px-3.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-[6px] font-medium text-[13px] transition-all active:scale-95"
              >
                <BarChart3 className="w-[15px] h-[15px]" /> Ver Estudo
              </button>
            )}
            <button
              onClick={handleGenerateMemorial}
              disabled={generatingMemorial}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-[6px] text-sm font-medium text-gray-600 hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
            >
              <ScrollText className="w-4 h-4" /> {generatingMemorial ? 'Gerando...' : 'Minuta do Memorial'}
            </button>
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95"
            >
              <Edit className="w-[15px] h-[15px]" /> Editar
            </button>
          </div>
        </div>
      </div>

      {/* Tabs — anatomia canônica §19.1: trilho bg-gray-50, aba ativa bg-white text-blue-600 shadow-sm, flex-wrap */}
      <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
              tab === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === 'visao' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 mb-4">Dados Gerais</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Tipo" value={tipoLabel} />
              <Row label="Matrícula" value={e.matricula} />
              <Row label="Nº do Processo" value={e.numero_processo} />
              <Row label="Construtora" value={e.construtora} />
              <Row label="Responsável Técnico" value={e.responsavel_tecnico} />
              <Row label="CREA/CAU" value={e.crea_cau} />
            </dl>
          </div>

          <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" /> Endereço
            </h3>
            <dl className="space-y-3 text-sm">
              <Row label="Logradouro" value={enderecoLinha} />
              <Row label="Bairro" value={e.endereco_neighborhood} />
              <Row label="Cidade/UF" value={enderecoCidade} />
              <Row label="CEP" value={e.endereco_zip_code} />
            </dl>
          </div>

          <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 mb-4">SPE</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Razão Social" value={e.spe_razao_social} />
              <Row label="CNPJ" value={e.spe_cnpj} />
              <Row label="Nome Fantasia" value={e.spe_nome_fantasia} />
              <Row label="Incorporadora" value={e.developer_name} />
              <Row label="Gestor" value={e.manager} />
            </dl>
          </div>

          <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" /> Terreno
            </h3>
            <dl className="space-y-3 text-sm">
              <Row label="Tipo de Terreno" value={e.terreno_tipo} />
              <Row label="Área Total" value={e.terreno_area != null ? `${e.terreno_area} m²` : undefined} />
              <Row label="Testada (Frente)" value={e.terreno_frente != null ? `${e.terreno_frente} m` : undefined} />
              <Row label="Fundos" value={e.terreno_fundos != null ? `${e.terreno_fundos} m` : undefined} />
              <Row label="Profundidade" value={e.terreno_profundidade != null ? `${e.terreno_profundidade} m` : undefined} />
            </dl>
          </div>

          <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm lg:col-span-2">
            <h3 className="text-xs font-semibold text-gray-500 mb-4">Comercial</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Metric label="VGV Total" value={e.vgv_total != null ? `R$ ${e.vgv_total.toLocaleString('pt-BR')}` : '—'} />
              <Metric label="Lançamento" value={e.launch_date ? formatDate(e.launch_date) : '—'} />
              <Metric label="Previsão de Entrega" value={e.expected_delivery_date ? formatDate(e.expected_delivery_date) : '—'} />
            </div>
          </div>
        </div>
      )}

      {tab === 'torres' && (
        <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
          <TowerEditor
            key={refreshKey}
            empreendimentoId={e.id}
            organizationId={organizationId}
            empreendimento={e}
            onTerrenoSaved={onSynced}
          />
        </div>
      )}

      {tab === 'regulatorio' && (
        <MapaRegulatorioEditor empreendimentoId={e.id} organizationId={e.organization_id} />
      )}
      {tab === 'comercial' && (
        <EspelhoVendasTab empreendimento={e} />
      )}
      {tab === 'locacoes' && (
        <EspelhoLocacoesTab empreendimento={e} />
      )}
      {tab === 'sync' && (
        <SyncCenterTab
          key={refreshKey}
          empreendimento={e}
          onOpenStudySync={() => setSyncOpen(true)}
        />
      )}
      {tab === 'curadoria' && (
        <CuradoriaTab empreendimentoId={e.id} onChanged={() => setRefreshKey(k => k + 1)} />
      )}

      {syncOpen && (
        <SyncFromStudyModal
          empreendimentoId={e.id}
          onClose={() => setSyncOpen(false)}
          onSynced={() => {
            setSyncOpen(false);
            setRefreshKey(k => k + 1);
            setTab('torres');
            onSynced?.();
          }}
        />
      )}

      {notification && (
        <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {notification.message}
        </div>
      )}
    </div>
  );
};

// Datas em formato local sem bug de fuso (split de string, não new Date)
const formatDate = (iso: string): string => {
  const [y, m, d] = iso.split('T')[0].split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

const Row: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-4">
    <dt className="text-gray-400 font-semibold">{label}</dt>
    <dd className="text-gray-800 font-bold text-right">{value || '—'}</dd>
  </div>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-gray-50/60 border border-gray-100 rounded-[10px] p-4">
    <span className="text-xs font-semibold text-gray-400 block mb-1">{label}</span>
    <span className="text-lg font-bold text-gray-800">{value}</span>
  </div>
);

export default EmpreendimentoDetail;

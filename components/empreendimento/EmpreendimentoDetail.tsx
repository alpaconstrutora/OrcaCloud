// components/empreendimento/EmpreendimentoDetail.tsx
import React from 'react';
import { ArrowLeft, Edit, Building2, MapPin, FileText, Layers, Trees, BarChart3, RefreshCw, ShoppingBag, KeyRound, Map, Loader2, ArrowLeftRight, ScrollText, Inbox } from 'lucide-react';
import { Empreendimento, EmpreendimentoStatus, ImovibStudy } from '../../types';
import TowerEditor from './TowerEditor';
import CommonAreaEditor from './CommonAreaEditor';
import SyncFromStudyModal from './SyncFromStudyModal';
import { EspelhoVendasTab } from './EspelhoVendasTab';
import { EspelhoLocacoesTab } from './EspelhoLocacoesTab';
import { SyncCenterTab } from './SyncCenterTab';
import CuradoriaTab from './CuradoriaTab';
import { empreendimentoProposalService } from '../../services/empreendimentoProposalService';
import ImovibRegulatoryMapTab from '../ImovibRegulatoryMapTab';
import ImovibBlocksTypologyTab from '../ImovibBlocksTypologyTab';
import { imovibService } from '../../services/imovibService';
import { empreendimentoService } from '../../services/empreendimentoService';
import { areaEngineService } from '../../services/areaEngineService';
import { generateIncorporationMemorialDraftPdf } from '../../services/incorporationMemorialService';
import Button from '../ui/Button';

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

const TIPO_LABELS: Record<string, string> = {
  VERTICAL: 'Vertical',
  HORIZONTAL: 'Horizontal',
  MISTO: 'Misto',
  COND_LOGISTICO: 'Condomínio Logístico',
  COND_INDUSTRIAL: 'Condomínio Industrial',
};

type Tab = 'visao' | 'sync' | 'curadoria' | 'tipologia' | 'torres' | 'areas' | 'regulatorio' | 'comercial' | 'locacoes';

export const EmpreendimentoDetail: React.FC<Props> = ({ empreendimento: e, organizationId, onBack, onEdit, onGoToStudy, onSynced }) => {
  const [tab, setTab] = React.useState<Tab>('visao');
  const [syncOpen, setSyncOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [linkedStudy, setLinkedStudy] = React.useState<ImovibStudy | null>(null);
  const [isLoadingLinkedStudy, setIsLoadingLinkedStudy] = React.useState(false);
  const [linkedStudyError, setLinkedStudyError] = React.useState<string | null>(null);
  const [generatingMemorial, setGeneratingMemorial] = React.useState(false);
  const [pendingCuradoria, setPendingCuradoria] = React.useState(0);

  const loadPendingCuradoria = React.useCallback(async () => {
    try {
      setPendingCuradoria(await empreendimentoProposalService.countPending(e.id));
    } catch {
      setPendingCuradoria(0); // curadoria indisponível (migration não aplicada) — badge some
    }
  }, [e.id]);

  React.useEffect(() => { loadPendingCuradoria(); }, [loadPendingCuradoria, refreshKey]);

  const terrenoCidade = [e.terreno_city, e.terreno_state].filter(Boolean).join(' - ');
  const terrenoLinha = [e.terreno_street, e.terreno_number].filter(Boolean).join(', ');
  const enderecoCidade = [e.endereco_city, e.endereco_state].filter(Boolean).join(' - ');
  const enderecoLinha = [e.endereco_street, e.endereco_number].filter(Boolean).join(', ');

  const loadLinkedStudy = React.useCallback(async () => {
    if (!e.imovib_study_id) {
      setLinkedStudy(null);
      return;
    }
    try {
      setIsLoadingLinkedStudy(true);
      setLinkedStudyError(null);
      const study = await imovibService.getStudyById(e.imovib_study_id, true);
      setLinkedStudy(study);
    } catch (err: any) {
      console.error('[EmpreendimentoDetail] erro ao carregar estudo vinculado:', err);
      setLinkedStudyError(err?.message || 'Erro ao carregar estudo vinculado.');
    } finally {
      setIsLoadingLinkedStudy(false);
    }
  }, [e.imovib_study_id]);

  React.useEffect(() => {
    if (tab === 'tipologia') {
      loadLinkedStudy();
    }
  }, [tab, loadLinkedStudy]);

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
      alert('Erro ao gerar a minuta do memorial. Tente novamente.');
    } finally {
      setGeneratingMemorial(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: 'visao', label: 'Visão Geral', icon: FileText },
    { id: 'sync', label: 'Sincronização', icon: ArrowLeftRight },
    { id: 'curadoria', label: 'Curadoria', icon: Inbox, badge: pendingCuradoria },
    { id: 'tipologia', label: 'Bloco e Tipologia', icon: Building2 },
    { id: 'torres', label: 'Torres & Unidades', icon: Layers },
    { id: 'areas', label: 'Áreas Comuns', icon: Trees },
    { id: 'regulatorio', label: 'Mapa Regulatorio', icon: Map },
    { id: 'comercial', label: 'Espelho de Vendas', icon: ShoppingBag },
    { id: 'locacoes', label: 'Espelho de Locações', icon: KeyRound },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-3">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">{e.name}</h1>
                <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600">
                  {STATUS_LABELS[e.status]}
                </span>
                {e.tipo && (
                  <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-500/10 text-gray-600">
                    {TIPO_LABELS[e.tipo] || e.tipo}
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
              <button onClick={onGoToStudy} className="px-4 py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-xl font-black text-button uppercase tracking-widest flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Ver Estudo
              </button>
            )}
            <Button variant="ghost" onClick={handleGenerateMemorial} disabled={generatingMemorial}>
              <ScrollText className="w-4 h-4" /> {generatingMemorial ? 'Gerando...' : 'Minuta do Memorial'}
            </Button>
            <Button onClick={onEdit}>
              <Edit className="w-4 h-4" /> Editar
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 font-black text-button uppercase tracking-widest transition-colors border-b-2 flex items-center gap-1.5
              ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-black tracking-normal">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === 'visao' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider mb-4">Dados Gerais</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Tipo" value={e.tipo ? (TIPO_LABELS[e.tipo] || e.tipo) : undefined} />
              <Row label="Matrícula" value={e.matricula} />
              <Row label="Nº do Processo" value={e.numero_processo} />
              <Row label="Construtora" value={e.construtora} />
              <Row label="Responsável Técnico" value={e.responsavel_tecnico} />
              <Row label="CREA/CAU" value={e.crea_cau} />
            </dl>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" /> Endereço
            </h3>
            <dl className="space-y-3 text-sm">
              <Row label="Logradouro" value={enderecoLinha} />
              <Row label="Bairro" value={e.endereco_neighborhood} />
              <Row label="Cidade/UF" value={enderecoCidade} />
              <Row label="CEP" value={e.endereco_zip_code} />
            </dl>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider mb-4">SPE</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Razão Social" value={e.spe_razao_social} />
              <Row label="CNPJ" value={e.spe_cnpj} />
              <Row label="Nome Fantasia" value={e.spe_nome_fantasia} />
              <Row label="Incorporadora" value={e.developer_name} />
              <Row label="Gestor" value={e.manager} />
            </dl>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" /> Terreno
            </h3>
            <dl className="space-y-3 text-sm">
              <Row label="Endereço" value={terrenoLinha} />
              <Row label="Bairro" value={e.terreno_neighborhood} />
              <Row label="Cidade/UF" value={terrenoCidade} />
              <Row label="CEP" value={e.terreno_zip_code} />
              <Row label="Área do Terreno" value={e.terreno_area != null ? `${e.terreno_area} m²` : undefined} />
            </dl>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm lg:col-span-2">
            <h3 className="font-black text-gray-800 text-sm uppercase tracking-wider mb-4">Comercial</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Metric label="VGV Total" value={e.vgv_total != null ? `R$ ${e.vgv_total.toLocaleString('pt-BR')}` : '—'} />
              <Metric label="Lançamento" value={e.launch_date ? formatDate(e.launch_date) : '—'} />
              <Metric label="Previsão de Entrega" value={e.expected_delivery_date ? formatDate(e.expected_delivery_date) : '—'} />
            </div>
          </div>
        </div>
      )}

      {tab === 'tipologia' && (
        e.imovib_study_id ? (
          isLoadingLinkedStudy ? (
            <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-center gap-3 text-gray-400 font-black uppercase tracking-widest text-button">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" /> Carregando estudo vinculado...
            </div>
          ) : linkedStudyError ? (
            <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm text-center">
              <h3 className="text-lg font-black text-gray-800 tracking-tight">Nao foi possivel carregar o estudo vinculado</h3>
              <p className="text-sm text-gray-500 font-medium mt-1">{linkedStudyError}</p>
              <Button onClick={loadLinkedStudy} className="mt-5">
                <RefreshCw className="w-4 h-4" /> Tentar Novamente
              </Button>
            </div>
          ) : linkedStudy ? (
            <ImovibBlocksTypologyTab study={linkedStudy} onDataChanged={loadLinkedStudy} />
          ) : null
        ) : (
          <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm text-center">
            <Building2 className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-black text-gray-800 tracking-tight">Nenhum estudo de viabilidade vinculado</h3>
            <p className="text-sm text-gray-500 font-medium mt-1 max-w-xl mx-auto">
              Blocos e tipologias usam a mesma base do IMOVIB. Vincule um estudo de viabilidade para editar as premissas e manter uma fonte unica.
            </p>
            <Button onClick={onEdit} className="mt-5">
              <Edit className="w-4 h-4" /> Vincular Estudo
            </Button>
          </div>
        )
      )}
      {tab === 'torres' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <TowerEditor key={refreshKey} empreendimentoId={e.id} organizationId={organizationId} />
        </div>
      )}

      {tab === 'areas' && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <CommonAreaEditor key={refreshKey} empreendimentoId={e.id} />
        </div>
      )}

      {tab === 'regulatorio' && (
        e.imovib_study_id ? (
          <ImovibRegulatoryMapTab studyId={e.imovib_study_id} />
        ) : (
          <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm text-center">
            <Map className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <h3 className="text-lg font-black text-gray-800 tracking-tight">Nenhum estudo de viabilidade vinculado</h3>
            <p className="text-sm text-gray-500 font-medium mt-1 max-w-xl mx-auto">
              O mapa regulatorio do empreendimento usa a mesma base do IMOVIB. Vincule um estudo de viabilidade para visualizar e manter os parametros urbanisticos em uma fonte unica.
            </p>
            <Button onClick={onEdit} className="mt-5">
              <Edit className="w-4 h-4" /> Vincular Estudo
            </Button>
          </div>
        )
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
          onGoToComercial={() => setTab('comercial')}
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
  <div className="bg-gray-50/60 border border-gray-100 rounded-2xl p-4">
    <span className="text-xs font-black uppercase tracking-widest text-gray-400 block mb-1">{label}</span>
    <span className="text-lg font-bold text-gray-800">{value}</span>
  </div>
);

export default EmpreendimentoDetail;

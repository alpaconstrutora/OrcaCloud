// components/empreendimento/EmpreendimentoDetail.tsx
import React from 'react';
import { ArrowLeft, Edit, Building2, MapPin, FileText, Layers, Trees, BarChart3, RefreshCw, ShoppingBag } from 'lucide-react';
import { Empreendimento, EmpreendimentoStatus } from '../../types';
import TowerEditor from './TowerEditor';
import CommonAreaEditor from './CommonAreaEditor';
import SyncFromStudyModal from './SyncFromStudyModal';
import { EspelhoVendasTab } from './EspelhoVendasTab';

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

type Tab = 'visao' | 'torres' | 'areas' | 'comercial';

export const EmpreendimentoDetail: React.FC<Props> = ({ empreendimento: e, organizationId, onBack, onEdit, onGoToStudy, onSynced }) => {
  const [tab, setTab] = React.useState<Tab>('visao');
  const [syncOpen, setSyncOpen] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const terrenoCidade = [e.terreno_city, e.terreno_state].filter(Boolean).join(' - ');
  const terrenoLinha = [e.terreno_street, e.terreno_number].filter(Boolean).join(', ');
  const enderecoCidade = [e.endereco_city, e.endereco_state].filter(Boolean).join(' - ');
  const enderecoLinha = [e.endereco_street, e.endereco_number].filter(Boolean).join(', ');

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'visao', label: 'Visão Geral', icon: FileText },
    { id: 'torres', label: 'Torres & Unidades', icon: Layers },
    { id: 'areas', label: 'Áreas Comuns', icon: Trees },
    { id: 'comercial', label: 'Espelho de Vendas', icon: ShoppingBag },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-600 mb-3">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">{e.name}</h1>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600">
                  {STATUS_LABELS[e.status]}
                </span>
                {e.tipo && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-500/10 text-gray-600">
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
            {e.imovib_study_id && (
              <button onClick={() => setSyncOpen(true)} className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Sincronizar do Estudo
              </button>
            )}
            {e.imovib_study_id && onGoToStudy && (
              <button onClick={onGoToStudy} className="px-4 py-2.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Ver Estudo
              </button>
            )}
            <button onClick={onEdit} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <Edit className="w-4 h-4" /> Editar
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 font-black text-xs uppercase tracking-widest transition-colors border-b-2 flex items-center gap-1.5
              ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
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

      {tab === 'comercial' && (
        <EspelhoVendasTab empreendimento={e} organizationId={organizationId} />
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
    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">{label}</span>
    <span className="text-lg font-bold text-gray-800">{value}</span>
  </div>
);

export default EmpreendimentoDetail;

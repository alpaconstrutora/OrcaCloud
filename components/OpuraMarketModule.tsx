import React from 'react';
import { opuraMarketService } from '../services/opuraMarketService';
import { criarViabilidadeImovib } from '../services/opuraMarketViabilidadeService';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { useToast } from '../hooks/useToast';
import { useMarketVocacao, type Ponto } from '../hooks/useMarketVocacao';
import { useMarketLeaflet, type CamadaMercado } from '../hooks/useMarketLeaflet';
import { gerarRelatorioVocacaoPdf } from '../utils/opuraMarketRelatorioPdf';
import type {
  OpuraMarketCity,
  OpuraMarketNeighborhood,
  OpuraMarketListing,
  OpuraMarketNeighborhoodStats,
  OpuraMarketCityConfig,
  OpuraMarketTerrainStudy,
} from '../types';
import { ImportListingsModal } from './ImportListingsModal';
import { CityRulesModal } from './CityRulesModal';
import MarketPracaSheet from './market/MarketPracaSheet';
import MarketMapaPanel from './market/MarketMapaPanel';
import MarketBairroDna from './market/MarketBairroDna';
import MarketOfertasPanel from './market/MarketOfertasPanel';
import MarketTabelaOcorrencias, { textoDeBusca } from './market/MarketTabelaOcorrencias';
import MarketFeedPanel from './market/MarketFeedPanel';
import MarketEstudosPanel from './market/MarketEstudosPanel';
import MarketAnuncioDetalhe from './market/MarketAnuncioDetalhe';
import Button from './ui/Button';
import { TabsBar } from './ui/TabsBar';
import { useConfirm } from './ui/confirm';
import { usePersistedState } from './ui/TableUtils';

/**
 * ÒPURA Market Intelligence — orquestrador. Até a Fase 5 do plano
 * docs/planos/2026-10-07-opura-market-intelligence.md este arquivo tinha ~2.400
 * linhas; na Fase 6 cada painel foi para components/market/, o mapa para
 * hooks/useMarketLeaflet (agora persistente entre abas), o estudo de vocação para
 * hooks/useMarketVocacao, o PDF para utils/opuraMarketRelatorioPdf e a ponte com o
 * IMOVIB para services/opuraMarketViabilidadeService.
 *
 * Aqui ficam: a praça (cidade, bairros, anúncios, regras), a aba ativa, a busca
 * compartilhada entre tabela e painel de ofertas, e as ações que cruzam painéis.
 */
interface OpuraMarketModuleProps {
  organizationId: string;
  onBack?: () => void;
  setActiveView?: (view: string) => void;
}

type Aba = 'map' | 'table' | 'feed' | 'studies';

const ABAS: { id: Aba; label: string }[] = [
  { id: 'map', label: '🗺️ Mapa de Inteligência' },
  { id: 'table', label: '📋 Tabela de Ocorrências' },
  { id: 'feed', label: '📡 Feed XML' },
  { id: 'studies', label: '📊 Estudos & Análise' },
];

/** Em "Todas" o topo não tem organização: nada que grava pode ficar ligado. */
const SEM_ORG = 'Selecione uma organização no topo da tela: o registro é gravado nela.';

/** Bairro com ponto mais perto do clique (distância plana basta para escolher o bairro). */
function bairroMaisProximo(bairros: OpuraMarketNeighborhood[], p: Ponto): OpuraMarketNeighborhood | null {
  let melhor: OpuraMarketNeighborhood | null = null;
  let menor = Infinity;
  bairros.forEach(n => {
    if (n.centroidLat == null || n.centroidLng == null) return;
    const d = Math.hypot(p.lat - n.centroidLat, p.lng - n.centroidLng);
    if (d < menor) { menor = d; melhor = n; }
  });
  return melhor;
}

const OpuraMarketModule: React.FC<OpuraMarketModuleProps> = ({ organizationId, onBack, setActiveView }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const organizations = useStore(s => s.organizations);

  // Praça
  const [loading, setLoading] = React.useState(true);
  const [cities, setCities] = React.useState<OpuraMarketCity[]>([]);
  const [selectedCityId, setSelectedCityId] = React.useState('');
  const [neighborhoods, setNeighborhoods] = React.useState<OpuraMarketNeighborhood[]>([]);
  const [selectedNeighborhood, setSelectedNeighborhood] = React.useState<OpuraMarketNeighborhood | null>(null);
  const [listings, setListings] = React.useState<OpuraMarketListing[]>([]);
  // DNA do bairro calculado na leitura (Fase 4.5), por id do bairro.
  const [statsPorBairro, setStatsPorBairro] = React.useState<Record<string, OpuraMarketNeighborhoodStats>>({});
  const [cityConfig, setCityConfig] = React.useState<OpuraMarketCityConfig | null>(null);

  // Tela
  const [aba, setAba] = React.useState<Aba>('map');
  const [camada, setCamada] = React.useState<CamadaMercado>('preco');
  // Mesmo termo na tabela e no painel de ofertas; sobrevive à navegação (§3).
  const [busca, setBusca] = usePersistedState<string>('opuraMarket:busca', '');
  const [filterSource, setFilterSource] = React.useState('Todos');
  const [detalhe, setDetalhe] = React.useState<OpuraMarketListing | null>(null);
  // Anúncio esperando o clique no mapa para ganhar posição manual (plano 2026-10-10, item 2).
  const [posicionando, setPosicionando] = React.useState<OpuraMarketListing | null>(null);
  const [importAberto, setImportAberto] = React.useState(false);
  const [regrasAbertas, setRegrasAbertas] = React.useState(false);
  // Cadastro de praça (Fase 4.4): só o superadministrador da plataforma.
  const [ehSuperadmin, setEhSuperadmin] = React.useState(false);
  const [pracaAberta, setPracaAberta] = React.useState(false);

  const v = useMarketVocacao(organizationId, cityConfig?.rules);

  const cidadeAtual = cities.find(c => c.id === selectedCityId) ?? null;
  const nomeDaCidade = cidadeAtual ? `${cidadeAtual.name} - ${cidadeAtual.state}` : '';
  const nomeOrganizacao = organizations.find(o => o.id === organizationId)?.name
    ?? (organizationId ? 'Organização não identificada' : 'Todas as organizações');

  // ── Carga ────────────────────────────────────────────────────────────────
  const loadListings = React.useCallback(async (cityId: string) => {
    try {
      const [data, stats] = await Promise.all([
        opuraMarketService.listListings(cityId),
        opuraMarketService.getNeighborhoodStats(cityId),
      ]);
      setListings(data);
      setStatsPorBairro(Object.fromEntries(stats.map(s => [s.neighborhoodId, s])));
    } catch (err) {
      console.error('Erro ao buscar anúncios:', err);
    }
  }, []);

  const loadNeighborhoods = React.useCallback(async (cityId: string) => {
    try {
      const lista = await opuraMarketService.listNeighborhoods(cityId);
      setNeighborhoods(lista);
      setSelectedNeighborhood(lista[0] ?? null);
    } catch (err) {
      console.error('Erro ao buscar bairros:', err);
    }
  }, []);

  const loadCityRules = React.useCallback(async (cityId: string) => {
    if (!cityId || !organizationId) { setCityConfig(null); return; }
    try {
      setCityConfig(await opuraMarketService.getCityConfig(organizationId, cityId));
    } catch (err) {
      console.error('Erro ao buscar configurações da cidade:', err);
    }
  }, [organizationId]);

  const carregarCidade = React.useCallback(async (cityId: string) => {
    setSelectedCityId(cityId);
    await Promise.all([loadNeighborhoods(cityId), loadListings(cityId), loadCityRules(cityId)]);
  }, [loadNeighborhoods, loadListings, loadCityRules]);

  React.useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        setLoading(true);
        const lista = await opuraMarketService.listCities();
        if (!vivo) return;
        setCities(lista);
        if (lista.length > 0) await carregarCidade(lista[0].id);
      } catch (err) {
        console.error('Erro ao carregar cidades do ÒPURA Market:', err);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [carregarCidade]);

  // Superadministrador vê "Cadastrar praça". O botão é só conveniência: quem barra
  // a escrita é a policy com is_superadmin().
  React.useEffect(() => {
    supabase.auth.getUser()
      .then(({ data }) => opuraMarketService.ehSuperadmin(data.user?.email))
      .then(setEhSuperadmin)
      .catch(() => setEhSuperadmin(false));
  }, []);

  // ── Mapa ─────────────────────────────────────────────────────────────────
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const { focar } = useMarketLeaflet({
    containerRef: mapContainerRef,
    pronto: !loading,
    visivel: aba === 'map',
    cidadeAtual,
    neighborhoods,
    listings,
    statsPorBairro,
    camada,
    terrainPin: v.terrainPin,
    raioMetros: v.analysisRadius,
    isDrawingPolygon: v.isDrawingPolygon,
    drawingPoints: v.drawingPoints,
    polygonPoints: v.polygonPoints,
    onClique: (p) => {
      if (posicionando) { gravarPosicaoManual(posicionando, p); return; }
      if (v.isDrawingPolygon) { v.adicionarVertice(p); return; }
      v.marcarPonto(p);
      const bairro = bairroMaisProximo(neighborhoods, p);
      if (bairro) setSelectedNeighborhood(bairro);
    },
  });

  /** Foca o anúncio no mapa. Da tabela, também abre a aba do mapa (o foco espera ela aparecer). */
  const focarAnuncio = (l: OpuraMarketListing, abrirMapa: boolean) => {
    if (l.latitude == null || l.longitude == null) {
      showToast('Este anúncio não tem coordenada: não aparece no mapa.', 'error');
      return;
    }
    focar({ lat: l.latitude, lng: l.longitude }, 17);
    setCamada('concorrencia');
    if (abrirMapa) setAba('map');
  };

  /** Por que este anúncio não pode ter a posição ajustada (ou undefined se pode). */
  const motivoSemAjuste = (l: OpuraMarketListing): string | undefined =>
    l.organizationId == null ? 'Anúncio global: não pertence a nenhuma organização, não é editável.'
      : !organizationId ? SEM_ORG
      : l.organizationId !== organizationId ? 'Este anúncio é de outra organização: selecione-a no topo da tela.'
      : undefined;

  const ajustarPosicao = (l: OpuraMarketListing) => {
    setDetalhe(null);
    setPosicionando(l);
    setCamada('concorrencia');
    setAba('map');
    if (l.latitude != null && l.longitude != null) focar({ lat: l.latitude, lng: l.longitude }, 17);
  };

  const gravarPosicaoManual = async (l: OpuraMarketListing, p: Ponto) => {
    try {
      await opuraMarketService.atualizarPosicaoDoAnuncio(l.id, p.lat, p.lng);
      showToast('Posição do anúncio gravada.');
      setPosicionando(null);
      if (selectedCityId) await loadListings(selectedCityId);
    } catch (err: any) {
      console.error('Falha ao gravar a posição:', err);
      showToast(err.message || 'Falha ao gravar a posição.', 'error');
    }
  };

  const desenharLote = () => {
    setAba('map');
    v.iniciarDesenho();
  };

  const concluirDesenho = async () => {
    const centro = await v.concluirDesenho();
    if (!centro) return;
    focar(centro, 16);
    setTimeout(() => setAba('studies'), 1000);
  };

  // ── Ações ────────────────────────────────────────────────────────────────
  const excluirAnuncio = async (l: OpuraMarketListing) => {
    const ok = await confirm({
      title: 'Excluir anúncio?',
      message: `O anúncio "${l.propertyType} — ${l.address || 'sem endereço'}" sai da base da organização.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await opuraMarketService.deleteListing(l.id);
      showToast('Anúncio excluído.');
      if (selectedCityId) await loadListings(selectedCityId);
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao excluir anúncio: ' + err.message, 'error');
    }
  };

  const abrirEstudo = (study: OpuraMarketTerrainStudy) => {
    v.abrirEstudo(study);
    focar({ lat: study.latitude, lng: study.longitude }, 15);
  };

  const exportarPdf = async () => {
    if (!v.terrainPin || !v.analysisResult) return;
    try {
      v.setAnalyzing(true);
      await gerarRelatorioVocacaoPdf({
        nomeEstudo: v.studyName,
        nomeOrganizacao,
        nomeBairro: selectedNeighborhood?.name ?? null,
        ponto: v.terrainPin,
        areaTerreno: parseFloat(v.terrainArea),
        raioMetros: v.analysisRadius,
        resultado: v.analysisResult,
        hipoteses: v.analysisResult.hipoteses,
        mapaEl: mapContainerRef.current,
      });
    } catch (err) {
      console.error('Erro ao gerar relatório em PDF:', err);
      showToast('Erro ao gerar o relatório em PDF.', 'error');
    } finally {
      v.setAnalyzing(false);
    }
  };

  const criarViabilidade = async () => {
    if (!v.terrainPin || !v.analysisResult || !organizationId) return;
    try {
      v.setAnalyzing(true);
      const { data: { user } } = await supabase.auth.getUser();
      await criarViabilidadeImovib({
        organizationId,
        nomeEstudo: v.studyName,
        emailUsuario: user?.email || 'sistema@opura.com.br',
        nomeBairro: selectedNeighborhood?.name ?? null,
        areaTerreno: parseFloat(v.terrainArea),
        resultado: v.analysisResult,
      });
      showToast('Estudo de viabilidade criado no IMOVIB com as premissas territoriais.');
      setActiveView?.('imovib');
    } catch (err: any) {
      console.error('Erro ao integrar com o IMOVIB:', err);
      showToast('Erro ao criar a viabilidade: ' + err.message, 'error');
    } finally {
      v.setAnalyzing(false);
    }
  };

  // ── Listas derivadas ─────────────────────────────────────────────────────
  const fontes = React.useMemo(
    () => Array.from(new Set(listings.map(l => l.source).filter(Boolean))),
    [listings],
  );
  const daFonte = React.useMemo(
    () => (filterSource === 'Todos' ? listings : listings.filter(l => l.source === filterSource)),
    [listings, filterSource],
  );
  const filtrados = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? daFonte.filter(l => textoDeBusca(l).toLowerCase().includes(t)) : daFonte;
  }, [daFonte, busca]);

  const seletorFonte = (className: string) => (
    <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className={className}>
      <option value="Todos">Todas as fontes</option>
      {fontes.map(src => <option key={src} value={src}>{src}</option>)}
    </select>
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="secondary" size="icon" onClick={onBack} className="w-9 h-9 rounded-xl shadow-sm text-button active:scale-95 transition-transform">
              ⬅
            </Button>
          )}
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">🗺️ ÒPURA Market Intelligence</h1>
            <p className="text-xs font-semibold text-slate-500">Atlas Dinâmico e Recomendações de Produto Imobiliário por Inteligência Territorial</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {cities.length > 0 && (
            <select
              value={selectedCityId}
              onChange={(e) => carregarCidade(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-form-input font-bold uppercase tracking-wider shadow-xs focus:outline-none focus:ring-1 focus:ring-slate-500 cursor-pointer"
            >
              {cities.map(city => <option key={city.id} value={city.id}>📍 {city.name} - {city.state}</option>)}
            </select>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRegrasAbertas(true)}
            disabled={!organizationId || !selectedCityId}
            className="rounded-xl text-button font-black uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5"
            title={!organizationId
              ? 'As regras da praça são guardadas por organização: selecione uma no topo da tela.'
              : !selectedCityId ? 'Nenhuma praça cadastrada.'
              : 'Configurar regras de padrão construtivo e tipologias da praça ativa'}
          >
            ⚙️ Regras da Praça
          </Button>
          {ehSuperadmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPracaAberta(true)}
              className="rounded-xl text-button font-black uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5"
              title="Cadastrar cidades e bairros. Vale para todas as organizações: só o superadministrador da plataforma vê este botão."
            >
              📍 Cadastrar praça
            </Button>
          )}
        </div>
      </div>

      {!loading && <TabsBar tabs={ABAS} value={aba} onChange={setAba} />}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200/50 rounded-3xl">
          <div className="w-8 h-8 border-4 border-slate-950 border-t-transparent rounded-full animate-spin mb-3" />
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Construindo Atlas Dinâmico...</span>
        </div>
      ) : (
        <>
          {aba === 'table' && (
            <MarketTabelaOcorrencias
              rows={daFonte}
              neighborhoods={neighborhoods}
              search={busca}
              onSearchChange={setBusca}
              filtroFonte={seletorFonte('h-9 px-3 bg-white border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-600 focus:outline-none')}
              onVerNoMapa={(l) => focarAnuncio(l, true)}
            />
          )}

          {aba === 'feed' && (
            <MarketFeedPanel
              organizationId={organizationId}
              cityId={selectedCityId}
              listings={listings}
              onAtualizado={() => loadListings(selectedCityId)}
            />
          )}

          {aba === 'studies' && (
            <MarketEstudosPanel
              v={v}
              motivoSemOrg={organizationId ? undefined : SEM_ORG}
              onDesenharLote={desenharLote}
              onSalvar={() => v.salvar(selectedNeighborhood ? `Bairro ${selectedNeighborhood.name}, ${nomeDaCidade}` : (nomeDaCidade || null))}
              onExportarPdf={exportarPdf}
              onCriarViabilidade={setActiveView ? criarViabilidade : undefined}
              onAbrirEstudo={abrirEstudo}
            />
          )}

          {/* O mapa nunca desmonta: nas outras abas só fica escondido (Fase 6.2). */}
          <div className={aba === 'map' ? 'grid grid-cols-1 lg:grid-cols-3 gap-8' : 'hidden'}>
            <div className="lg:col-span-2 space-y-6">
              <MarketMapaPanel
                containerRef={mapContainerRef}
                camada={camada}
                onCamada={setCamada}
                desenhando={v.isDrawingPolygon}
                vertices={v.drawingPoints.length}
                ocupado={v.analyzing}
                onConcluirDesenho={concluirDesenho}
                onCancelarDesenho={v.cancelarDesenho}
                temTerreno={!!v.terrainPin}
                avisoDeClique={posicionando ? {
                  texto: `Clique no mapa onde fica o imóvel: ${posicionando.propertyType} — ${posicionando.address || 'sem endereço'}`,
                  onCancelar: () => setPosicionando(null),
                } : null}
                onIrParaEstudo={() => setAba('studies')}
              />
              {selectedNeighborhood && (
                <MarketBairroDna bairro={selectedNeighborhood} stats={statsPorBairro[selectedNeighborhood.id]} />
              )}
            </div>
            <MarketOfertasPanel
              total={listings.length}
              filtrados={filtrados}
              busca={busca}
              onBusca={setBusca}
              filtroFonte={seletorFonte('w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-[6px] text-xs font-semibold text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500')}
              motivoImportarDesligado={!organizationId ? SEM_ORG : !selectedCityId ? 'Nenhuma praça cadastrada.' : undefined}
              onImportar={() => setImportAberto(true)}
              onAbrirTabela={() => setAba('table')}
              onFocar={(l) => focarAnuncio(l, false)}
              onDetalhes={setDetalhe}
              onExcluir={excluirAnuncio}
            />
          </div>
        </>
      )}

      {importAberto && (
        <ImportListingsModal
          isOpen={importAberto}
          onClose={() => setImportAberto(false)}
          onSuccess={async () => {
            if (selectedCityId) await carregarCidade(selectedCityId);
            v.setAnalysisResult(null);
            setCamada('concorrencia'); // mostra os pinos importados
          }}
          cityId={selectedCityId}
          organizationId={organizationId}
        />
      )}

      <MarketPracaSheet
        open={pracaAberta}
        onClose={() => setPracaAberta(false)}
        cidades={cities}
        cidadeInicialId={selectedCityId || null}
        onSalvo={async (cidadeId) => {
          setCities(await opuraMarketService.listCities());
          await carregarCidade(cidadeId);
        }}
      />

      {regrasAbertas && (
        <CityRulesModal
          isOpen={regrasAbertas}
          onClose={() => setRegrasAbertas(false)}
          onSave={async (config) => {
            try {
              setCityConfig(await opuraMarketService.saveCityConfig(config));
              showToast('Regras da praça salvas.');
            } catch (err: any) {
              console.error(err);
              showToast('Erro ao salvar as regras da praça: ' + err.message, 'error');
            }
          }}
          organizationId={organizationId}
          cityId={selectedCityId}
          cityName={cidadeAtual?.name ?? ''}
          initialConfig={cityConfig}
        />
      )}

      <MarketAnuncioDetalhe
        anuncio={detalhe}
        cities={cities}
        neighborhoods={neighborhoods}
        onClose={() => setDetalhe(null)}
        onAjustarPosicao={ajustarPosicao}
        motivoSemAjuste={detalhe ? motivoSemAjuste(detalhe) : undefined}
      />
    </div>
  );
};

export default OpuraMarketModule;

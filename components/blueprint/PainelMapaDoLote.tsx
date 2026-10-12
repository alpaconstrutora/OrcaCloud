/**
 * DESENHAR O LOTE NO MAPA (11/10/2026).
 *
 * Pedido: *"é possivel gerar sem uso do google earth? pois no final das contas
 * o que eu quero é gerar curvas de nivel. Se for possivel gerar tudo sem uso de
 * ferramenta externa seria perfeito"*. O Google Earth só servia para dizer
 * ONDE o terreno está. Aqui o usuário acha o lugar (endereço ou coordenada
 * colada), marca os vértices — ou dois cantos de um retângulo — e a área vira o
 * lote, já georreferenciado. A conta mora em `utils/blueprintMapaDoLote.ts`.
 * Plano: docs/planos/2026-10-11-curvas-de-nivel-sem-ferramenta-externa.md.
 *
 * Fundo: OpenStreetMap (ruas) ou OpenTopoMap (relevo sombreado com curvas),
 * os dois gratuitos com atribuição. Imagem de satélite NÃO: a licença de tiles
 * é decisão de negócio ainda em aberto (E-12) — ver a memória da fase A3.
 *
 * A busca de endereço é transitória (§3.1 do guia de UI): vive dentro desta
 * gaveta e não filtra lista nenhuma — persistida, reabriria com a busca velha.
 */
import React from 'react';
import type * as Leaflet from 'leaflet';
import { Search, Undo2, Eraser, MapPin, Loader2, AlertTriangle } from 'lucide-react';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import type { Georreferencia } from '../../utils/blueprintKernel';
import type { LatLon } from '../../utils/blueprintTopografia';
import {
  areaParaLote,
  LADO_MINIMO_DO_COPERNICUS_M,
  lerCoordenadaColada,
  retanguloGeoPorCantos,
  type AreaParaLote,
} from '../../utils/blueprintMapaDoLote';
import { FONTE_DO_MAPA, type FonteDoMapa } from '../../utils/blueprintMapaDeFundo';

const ROTULO = 'text-xs font-semibold text-slate-500';
const CAMPO =
  'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm font-normal text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300';
const BOTAO_SECUNDARIO =
  'flex items-center gap-1.5 h-9 px-3 rounded-[6px] border border-gray-200 bg-white text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

type Modo = 'POLIGONO' | 'RETANGULO';
type Fundo = FonteDoMapa;

const MODOS: TabsBarItem<Modo>[] = [
  { id: 'POLIGONO', label: 'Contorno' },
  { id: 'RETANGULO', label: 'Retângulo' },
];
const FUNDOS: TabsBarItem<Fundo>[] = [
  { id: 'RUAS', label: 'Ruas' },
  { id: 'RELEVO', label: 'Relevo' },
];

/**
 * As fontes (URL, atribuição, zoom nativo) moram em `blueprintMapaDeFundo.ts`,
 * as mesmas das camadas de mapa da planta. `maxNativeZoom` é até onde o
 * servidor tem ladrilho; acima disso o Leaflet AMPLIA o do último nível. Sem
 * isso, trocar para Relevo (que só vai ao 17) com o mapa no 18 fazia o mapa
 * recuar sozinho — e o contorno encolhia na tela.
 */
const ZOOM_MAXIMO = 19;

/** Centro do Brasil, quando o estudo ainda não diz onde fica. */
const BRASIL: [number, number] = [-15.78, -47.93];

export interface ResultadoDaBusca {
  nome: string;
  lat: number;
  lon: number;
  /** [sul, norte, oeste, leste], quando o serviço informa. */
  caixa: [number, number, number, number] | null;
}

/**
 * Busca no Nominatim (OpenStreetMap): gratuito, sem chave, com CORS. A política
 * de uso pede no máximo um pedido por segundo e nada de autocompletar — por
 * isso a busca é por Enter/botão, nunca a cada tecla.
 */
export async function buscarNoNominatim(texto: string): Promise<ResultadoDaBusca[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=pt-BR&q=${encodeURIComponent(texto)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`a busca respondeu HTTP ${r.status}`);
  const lista = (await r.json()) as { display_name?: string; lat?: string; lon?: string; boundingbox?: string[] }[];
  return lista
    .map((x) => {
      const caixa = x.boundingbox?.map(Number);
      return {
        nome: x.display_name ?? '',
        lat: Number(x.lat),
        lon: Number(x.lon),
        caixa: caixa && caixa.length === 4 && caixa.every(Number.isFinite) ? (caixa as [number, number, number, number]) : null,
      };
    })
    .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
}

const numeroBr = (v: number, casas = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

interface Props {
  georreferencia: Georreferencia | null;
  /** Lança o lote. Devolve a mensagem de erro, ou `null` quando deu certo. */
  onUsar: (area: Extract<AreaParaLote, { ok: true }>) => string | null;
  /** Injetável para o teste não sair para a rede. */
  buscar?: (texto: string) => Promise<ResultadoDaBusca[]>;
  /** Injetável para o teste: o Leaflet de verdade não desenha no jsdom. */
  carregarLeaflet?: () => Promise<typeof Leaflet>;
}

export default function PainelMapaDoLote({
  georreferencia,
  onUsar,
  buscar = buscarNoNominatim,
  carregarLeaflet = async () => {
    const L = await import('leaflet');
    await import('leaflet/dist/leaflet.css');
    return (L as unknown as { default?: typeof Leaflet }).default ?? L;
  },
}: Props) {
  const [modo, setModo] = React.useState<Modo>('POLIGONO');
  const [fundo, setFundo] = React.useState<Fundo>('RUAS');
  const [vertices, setVertices] = React.useState<LatLon[]>([]);
  const [cantoInicial, setCantoInicial] = React.useState<LatLon | null>(null);
  const [busca, setBusca] = React.useState('');
  const [buscando, setBuscando] = React.useState(false);
  const [resultados, setResultados] = React.useState<ResultadoDaBusca[] | null>(null);
  const [erroDaBusca, setErroDaBusca] = React.useState<string | null>(null);
  const [erroAoUsar, setErroAoUsar] = React.useState<string | null>(null);
  const [mapaPronto, setMapaPronto] = React.useState(false);
  const [erroDoMapa, setErroDoMapa] = React.useState<string | null>(null);

  const contem = React.useRef<HTMLDivElement | null>(null);
  const L = React.useRef<typeof Leaflet | null>(null);
  const mapa = React.useRef<Leaflet.Map | null>(null);
  const camadaDeFundo = React.useRef<Leaflet.TileLayer | null>(null);
  const desenho = React.useRef<Leaflet.LayerGroup | null>(null);

  // O clique do mapa lê o estado pela ref: o handler é registrado uma vez só.
  const aoClicar = React.useRef<(p: LatLon) => void>(() => {});
  aoClicar.current = (p: LatLon) => {
    setErroAoUsar(null);
    if (modo === 'POLIGONO') {
      setVertices((vs) => [...vs, p]);
      return;
    }
    // Retângulo: 1º clique = um canto; 2º = o oposto; 3º recomeça.
    if (!cantoInicial || vertices.length > 0) {
      setCantoInicial(p);
      setVertices([]);
    } else {
      setVertices(retanguloGeoPorCantos(cantoInicial, p));
    }
  };

  // Criação do mapa: uma vez.
  React.useEffect(() => {
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      let lf: typeof Leaflet;
      try {
        lf = await carregarLeaflet();
      } catch (e) {
        if (vivo) setErroDoMapa(e instanceof Error ? e.message : String(e));
        return;
      }
      if (!vivo || !contem.current || mapa.current) return;
      L.current = lf;
      const centro: [number, number] = georreferencia ? [georreferencia.latitude, georreferencia.longitude] : BRASIL;
      let m: Leaflet.Map;
      try {
        // Duplo clique não aproxima: aqui o clique marca vértice, e aproximar no meio do contorno desorienta.
        m = lf.map(contem.current, { center: centro, zoom: georreferencia ? 17 : 4, doubleClickZoom: false });
      } catch (e) {
        setErroDoMapa(e instanceof Error ? e.message : String(e));
        return;
      }
      desenho.current = lf.layerGroup().addTo(m);
      m.on('click', (e: Leaflet.LeafletMouseEvent) => aoClicar.current({ lat: e.latlng.lat, lon: e.latlng.lng }));
      mapa.current = m;
      setMapaPronto(true);
      // A gaveta entra animada: o mapa mede o contêiner depois que ele assenta.
      espera = setTimeout(() => m.invalidateSize(), 250);
    })();
    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
      mapa.current?.remove();
      mapa.current = null;
      desenho.current = null;
      camadaDeFundo.current = null;
    };
    // Só na montagem: a georreferência inicial decide onde o mapa abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fundo.
  React.useEffect(() => {
    const m = mapa.current;
    const lf = L.current;
    if (!mapaPronto || !m || !lf) return;
    camadaDeFundo.current?.remove();
    const c = FONTE_DO_MAPA[fundo];
    camadaDeFundo.current = lf
      .tileLayer(c.url, { attribution: c.atribuicaoHtml, subdomains: [...c.subdominios], maxNativeZoom: c.maxNativeZoom, maxZoom: ZOOM_MAXIMO })
      .addTo(m);
  }, [fundo, mapaPronto]);

  // O desenho: contorno (fechado na prévia), vértices, a origem já informada.
  React.useEffect(() => {
    const g = desenho.current;
    const lf = L.current;
    if (!mapaPronto || !g || !lf) return;
    g.clearLayers();
    const pts = vertices.map((v) => [v.lat, v.lon] as [number, number]);
    if (pts.length >= 3) lf.polygon(pts, { color: '#2563eb', weight: 2, fillOpacity: 0.12 }).addTo(g);
    else if (pts.length === 2) lf.polyline(pts, { color: '#2563eb', weight: 2 }).addTo(g);
    for (const p of pts) lf.circleMarker(p, { radius: 4, color: '#1d4ed8', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }).addTo(g);
    if (cantoInicial && pts.length === 0) {
      lf.circleMarker([cantoInicial.lat, cantoInicial.lon], { radius: 4, color: '#1d4ed8', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }).addTo(g);
    }
    if (georreferencia) {
      lf.circleMarker([georreferencia.latitude, georreferencia.longitude], { radius: 5, color: '#b45309', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.9 })
        .bindTooltip('Origem do desenho ("Onde fica")')
        .addTo(g);
    }
  }, [vertices, cantoInicial, georreferencia, mapaPronto]);

  const irPara = (lat: number, lon: number, caixa?: [number, number, number, number] | null) => {
    const m = mapa.current;
    if (!m) return;
    if (caixa) m.fitBounds([[caixa[0], caixa[2]], [caixa[1], caixa[3]]], { maxZoom: 18 });
    else m.setView([lat, lon], 18);
  };

  const procurar = async () => {
    const t = busca.trim();
    setErroDaBusca(null);
    setResultados(null);
    if (!t) return;
    // Coordenada colada vai direto, sem sair para a rede.
    const c = lerCoordenadaColada(t);
    if (c) {
      irPara(c.lat, c.lon);
      return;
    }
    setBuscando(true);
    try {
      const r = await buscar(t);
      setResultados(r);
      if (r.length === 0) setErroDaBusca('Nada encontrado. Tente rua e cidade, ou cole a coordenada (ex.: -22,6153, -46,0426).');
      else if (r.length === 1) irPara(r[0].lat, r[0].lon, r[0].caixa);
    } catch (e) {
      setErroDaBusca(`Não foi possível buscar agora (${e instanceof Error ? e.message : String(e)}). Cole a coordenada, ou navegue no mapa.`);
    } finally {
      setBuscando(false);
    }
  };

  const trocarModo = (m: Modo) => {
    setModo(m);
    setVertices([]);
    setCantoInicial(null);
    setErroAoUsar(null);
  };
  const limpar = () => {
    setVertices([]);
    setCantoInicial(null);
    setErroAoUsar(null);
  };

  const area = vertices.length >= 3 ? areaParaLote(vertices, georreferencia) : null;
  const motivoDesligado =
    vertices.length === 0
      ? modo === 'POLIGONO'
        ? 'Clique no mapa para marcar os vértices do terreno.'
        : cantoInicial
          ? 'Clique no canto oposto do retângulo.'
          : 'Clique em um canto do retângulo.'
      : vertices.length < 3
        ? `Faltam ${3 - vertices.length} vértice(s) para fechar uma área.`
        : area && !area.ok
          ? area.erro
          : null;

  const usar = () => {
    if (!area || !area.ok) return;
    setErroAoUsar(onUsar(area));
  };

  return (
    <div className="space-y-4 text-sm text-slate-700" data-testid="painel-mapa-do-lote">
      <div className="space-y-1.5">
        <label className={ROTULO} htmlFor="mapa-busca">
          Endereço ou coordenada
        </label>
        <div className="flex gap-2">
          <input
            id="mapa-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void procurar();
              }
            }}
            placeholder="Rua, bairro, cidade — ou -22,6153, -46,0426"
            className={CAMPO}
          />
          <button type="button" onClick={() => void procurar()} disabled={buscando || !busca.trim()} title={!busca.trim() ? 'Digite um endereço ou cole uma coordenada' : 'Procurar'} className={BOTAO_SECUNDARIO}>
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Procurar
          </button>
        </div>
        {erroDaBusca && <p className="text-xs text-red-600">{erroDaBusca}</p>}
        {resultados && resultados.length > 1 && (
          <ul className="divide-y divide-gray-100 rounded-[6px] border border-gray-100" data-testid="resultados-da-busca">
            {resultados.map((r) => (
              <li key={`${r.lat},${r.lon},${r.nome}`}>
                <button
                  type="button"
                  onClick={() => {
                    irPara(r.lat, r.lon, r.caixa);
                    setResultados(null);
                  }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {r.nome}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsBar bare tabs={MODOS} value={modo} onChange={trocarModo} />
        <TabsBar bare tabs={FUNDOS} value={fundo} onChange={setFundo} />
      </div>

      <div className="relative">
        <div ref={contem} className="h-[320px] w-full overflow-hidden rounded-[10px] border border-gray-100 sm:h-[420px]" data-testid="mapa-do-lote" />
        {erroDoMapa && (
          <p className="absolute inset-x-3 top-3 flex items-start gap-1.5 rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />O mapa não carregou: {erroDoMapa}
          </p>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {modo === 'POLIGONO'
          ? 'Clique em cada canto do terreno, em ordem. A área fecha sozinha entre o último e o primeiro vértice.'
          : 'Clique em dois cantos opostos: o retângulo segue norte-sul e leste-oeste. Um terceiro clique recomeça.'}{' '}
        {georreferencia
          ? 'A origem do desenho já informada em "Onde fica" (ponto laranja) é mantida.'
          : 'A origem do desenho ("Onde fica") vai para o centro da área, com o norte para cima.'}
      </p>

      {area?.ok && (
        <div className="grid grid-cols-3 gap-x-6 gap-y-4" data-testid="medidas-da-area">
          <div className="space-y-1.5">
            <p className={ROTULO}>Área</p>
            <p className="text-sm text-slate-900">{numeroBr(area.medidas.areaM2)} m²</p>
          </div>
          <div className="space-y-1.5">
            <p className={ROTULO}>Perímetro</p>
            <p className="text-sm text-slate-900">{numeroBr(area.medidas.perimetroM, 1)} m</p>
          </div>
          <div className="space-y-1.5">
            <p className={ROTULO}>Lado menor</p>
            <p className="text-sm text-slate-900">{numeroBr(area.medidas.ladoMenorM, 1)} m</p>
          </div>
        </div>
      )}
      {area?.ok && !area.medidas.serveCopernicus && (
        <p className="flex items-start gap-1.5 rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="aviso-copernicus">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            O lado menor tem {numeroBr(area.medidas.ladoMenorM, 1)} m. As curvas de satélite (Copernicus 30 m) pedem pelo menos {LADO_MINIMO_DO_COPERNICUS_M} m —
            num terreno menor a célula de 30 m não descreve o relevo. O lote é criado mesmo assim; as curvas vêm do levantamento (pontos cotados).
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
        {erroAoUsar && <span className="text-xs text-red-600">{erroAoUsar}</span>}
        {motivoDesligado && <span className="text-xs text-slate-500">{motivoDesligado}</span>}
        <button type="button" onClick={() => setVertices((vs) => vs.slice(0, -1))} disabled={modo !== 'POLIGONO' || vertices.length === 0} title={modo !== 'POLIGONO' ? 'No retângulo, clique de novo para recomeçar' : vertices.length === 0 ? 'Nenhum vértice marcado' : 'Tira o último vértice'} className={BOTAO_SECUNDARIO}>
          <Undo2 className="h-4 w-4" />
          Desfazer vértice
        </button>
        <button type="button" onClick={limpar} disabled={vertices.length === 0 && !cantoInicial} title={vertices.length === 0 && !cantoInicial ? 'Nada marcado' : 'Apaga a área marcada'} className={BOTAO_SECUNDARIO}>
          <Eraser className="h-4 w-4" />
          Limpar
        </button>
        <button
          type="button"
          onClick={usar}
          disabled={!!motivoDesligado}
          title={motivoDesligado ?? 'Cria as divisas do lote nesta área num passo só — Ctrl+Z desfaz'}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:active:scale-100"
        >
          Usar esta área
        </button>
      </div>
    </div>
  );
}

import React from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import Button from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { opuraMarketService, type BairroSemCadastro } from '../../services/opuraMarketService';
import type { OpuraMarketCity } from '../../types';

/**
 * Cadastro de praça do ÒPURA Market (Fase 4.4 do plano
 * docs/planos/2026-10-07-opura-market-intelligence.md, decisão D4).
 *
 * Cria ou edita uma cidade (nome, UF e onde o mapa abre) e os bairros dela,
 * cada um com um ponto marcado no mini mapa. Cidades e bairros são GLOBAIS —
 * valem para todas as organizações —, então só o superadministrador da
 * plataforma grava (policies com public.is_superadmin()); quem abre esta gaveta
 * é o botão "Cadastrar praça", que só aparece para ele.
 *
 * Ao salvar um bairro, um gatilho no banco vincula a ele os anúncios da cidade
 * cujo nome de bairro de origem é o mesmo, e dá aos que estavam sem coordenada
 * o ponto do bairro como posição aproximada.
 */

interface BairroEditavel {
  id?: string;
  nome: string;
  lat: number | null;
  lng: number | null;
  original?: { nome: string; lat: number | null; lng: number | null };
}

type Alvo = 'centro' | number | null;

interface Props {
  open: boolean;
  onClose: () => void;
  cidades: OpuraMarketCity[];
  /** Cidade aberta para edição; null abre o formulário de cidade nova. */
  cidadeInicialId: string | null;
  onSalvo: (cidadeId: string) => void;
}

const inputCls =
  'w-full px-3 h-9 bg-gray-50 border border-gray-100 rounded-[6px] text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';

const Campo: React.FC<{ label: string; ajuda?: string; children: React.ReactNode }> = ({ label, ajuda, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-slate-500">{label}</label>
    {children}
    {ajuda && <p className="text-xs text-gray-400">{ajuda}</p>}
  </div>
);

const Secao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
      <MapPin className="w-4 h-4 text-blue-600" />
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
    </div>
    {children}
  </div>
);

// Centro do Brasil, para quando a cidade ainda não tem ponto nem bairro.
const BRASIL: [number, number] = [-15.78, -47.93];

const MarketPracaSheet: React.FC<Props> = ({ open, onClose, cidades, cidadeInicialId, onSalvo }) => {
  const { showToast } = useToast();
  const [cidadeId, setCidadeId] = React.useState<string>(cidadeInicialId ?? 'nova');
  const [nome, setNome] = React.useState('');
  const [uf, setUf] = React.useState('');
  const [centro, setCentro] = React.useState<{ lat: number; lng: number } | null>(null);
  const [bairros, setBairros] = React.useState<BairroEditavel[]>([]);
  const [alvo, setAlvo] = React.useState<Alvo>(null);
  const [carregando, setCarregando] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [sujo, setSujo] = React.useState(false);
  // Bairros citados nos anúncios e sem cadastro (plano 2026-10-10, item 2): cada
  // um que ganhar ponto aqui posiciona os anúncios dele no ponto do bairro.
  const [faltando, setFaltando] = React.useState<BairroSemCadastro[]>([]);

  const mapaRef = React.useRef<HTMLDivElement>(null);
  const mapa = React.useRef<L.Map | null>(null);
  const camada = React.useRef<L.LayerGroup | null>(null);
  const alvoRef = React.useRef<Alvo>(null);
  alvoRef.current = alvo;

  // Carrega a cidade escolhida (ou limpa para cidade nova).
  React.useEffect(() => {
    if (!open) return;
    setAlvo(null);
    setSujo(false);
    if (cidadeId === 'nova') {
      setNome('');
      setUf('');
      setCentro(null);
      setBairros([]);
      setFaltando([]);
      return;
    }
    opuraMarketService.getBairrosSemCadastro(cidadeId)
      .then(setFaltando)
      .catch((e) => { console.error('Falha ao listar bairros sem cadastro:', e); setFaltando([]); });
    const c = cidades.find((x) => x.id === cidadeId);
    setNome(c?.name ?? '');
    setUf(c?.state ?? '');
    setCentro(c?.centerLat != null && c?.centerLng != null ? { lat: c.centerLat, lng: c.centerLng } : null);
    setCarregando(true);
    opuraMarketService
      .listNeighborhoods(cidadeId)
      .then((lista) =>
        setBairros(
          lista.map((b) => ({
            id: b.id,
            nome: b.name,
            lat: b.centroidLat,
            lng: b.centroidLng,
            original: { nome: b.name, lat: b.centroidLat, lng: b.centroidLng },
          }))
        )
      )
      .catch((e) => showToast(e instanceof Error ? e.message : 'Falha ao carregar os bairros.', 'error'))
      .finally(() => setCarregando(false));
  }, [open, cidadeId, cidades, showToast]);

  React.useEffect(() => {
    if (open) setCidadeId(cidadeInicialId ?? 'nova');
  }, [open, cidadeInicialId]);

  // Mini mapa: só existe com a gaveta aberta.
  React.useEffect(() => {
    if (!open || !mapaRef.current || mapa.current) return;
    const m = L.map(mapaRef.current, { center: BRASIL, zoom: 4, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      const a = alvoRef.current;
      if (a === null) return;
      const ponto = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (a === 'centro') setCentro(ponto);
      else setBairros((lista) => lista.map((b, i) => (i === a ? { ...b, ...ponto } : b)));
      setSujo(true);
      setAlvo(null);
    });
    mapa.current = m;
    setTimeout(() => m.invalidateSize(), 300); // depois da animação da gaveta
    return () => {
      m.remove();
      mapa.current = null;
      camada.current = null;
    };
  }, [open]);

  // Desenha centro e bairros.
  React.useEffect(() => {
    const g = camada.current;
    if (!g) return;
    g.clearLayers();
    if (centro) {
      L.circleMarker([centro.lat, centro.lng], { radius: 8, color: '#1D4ED8', fillColor: '#3B82F6', fillOpacity: 0.9, weight: 2 })
        .bindTooltip('Centro da cidade', { direction: 'top' })
        .addTo(g);
    }
    bairros.forEach((b) => {
      if (b.lat == null || b.lng == null) return;
      L.circleMarker([b.lat, b.lng], { radius: 6, color: '#4338CA', fillColor: '#818CF8', fillOpacity: 0.9, weight: 2 })
        .bindTooltip(b.nome || 'Bairro sem nome', { direction: 'top', permanent: true, className: 'text-[10px]' })
        .addTo(g);
    });
  }, [centro, bairros]);

  // Enquadra ao trocar de cidade.
  React.useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const pontos: [number, number][] = bairros
      .filter((b) => b.lat != null && b.lng != null)
      .map((b) => [b.lat as number, b.lng as number]);
    if (pontos.length >= 2) m.fitBounds(L.latLngBounds(pontos).pad(0.3), { maxZoom: 15 });
    else if (centro) m.setView([centro.lat, centro.lng], 14);
    else if (pontos.length === 1) m.setView(pontos[0], 15);
    // só ao terminar de carregar a cidade, não a cada ponto marcado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cidadeId, carregando]);

  if (!open) return null;

  const editarBairro = (i: number, mudanca: Partial<BairroEditavel>) => {
    setBairros((lista) => lista.map((b, j) => (j === i ? { ...b, ...mudanca } : b)));
    setSujo(true);
  };

  // Nomes já na lista (gravados ou acrescentados agora) saem da lista de faltantes.
  const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const nomesNaLista = new Set(bairros.map((b) => normalizar(b.nome)));
  const faltandoVisiveis = faltando.filter((f) => !nomesNaLista.has(normalizar(f.nome)));

  const adicionarFaltante = (nomeDoBairro: string) => {
    setBairros((lista) => [...lista, { nome: nomeDoBairro, lat: null, lng: null }]);
    setAlvo(bairros.length);   // o próximo clique no mapa marca este bairro
    setSujo(true);
  };

  const removerNovo = (i: number) => {
    setBairros((lista) => lista.filter((_, j) => j !== i));
    if (alvo === i) setAlvo(null);
    setSujo(true);
  };

  const salvar = async () => {
    const nomeLimpo = nome.trim();
    const ufLimpa = uf.trim().toUpperCase();
    if (!nomeLimpo) { showToast('Informe o nome da cidade.', 'error'); return; }
    if (!/^[A-Z]{2}$/.test(ufLimpa)) { showToast('A UF tem duas letras, por exemplo MG.', 'error'); return; }
    if (cidadeId === 'nova' && !centro) { showToast('Marque no mapa onde fica a cidade (botão "Marcar centro").', 'error'); return; }
    const validos = bairros.filter((b) => b.id || b.nome.trim());
    const nomes = validos.map((b) => b.nome.trim().toLowerCase());
    if (validos.some((b) => !b.nome.trim())) { showToast('Todo bairro precisa de nome.', 'error'); return; }
    const repetido = nomes.find((n, i) => nomes.indexOf(n) !== i);
    if (repetido) { showToast(`O bairro "${repetido}" aparece duas vezes.`, 'error'); return; }

    setSalvando(true);
    try {
      const cidade = cidadeId === 'nova'
        ? await opuraMarketService.criarCidade({ name: nomeLimpo, state: ufLimpa, centerLat: centro!.lat, centerLng: centro!.lng })
        : await opuraMarketService.atualizarCidade(cidadeId, {
            name: nomeLimpo, state: ufLimpa, centerLat: centro?.lat ?? null, centerLng: centro?.lng ?? null,
          });
      let criados = 0;
      let alterados = 0;
      for (const b of validos) {
        if (!b.id) {
          await opuraMarketService.criarBairro({ cityId: cidade.id, name: b.nome, lat: b.lat, lng: b.lng });
          criados++;
        } else if (b.original && (b.original.nome !== b.nome.trim() || b.original.lat !== b.lat || b.original.lng !== b.lng)) {
          await opuraMarketService.atualizarBairro(b.id, { name: b.nome, lat: b.lat, lng: b.lng });
          alterados++;
        }
      }
      showToast(`Praça salva: ${cidade.name} - ${cidade.state}. Bairros novos: ${criados}; alterados: ${alterados}.`);
      setSujo(false);
      onSalvo(cidade.id);
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Falha ao salvar a praça.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const botaoMarcar = (ativo: boolean, onClick: () => void, rotulo: string) => (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-3 rounded-[6px] text-[13px] font-medium border shrink-0 transition-all ${
        ativo ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
      title={ativo ? 'Agora clique no mapa' : undefined}
    >
      {ativo ? 'Clique no mapa…' : rotulo}
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} size="2xl" dirty={sujo}>
      <SheetHeader onClose={onClose}>
        <SheetTitle>Cadastrar praça</SheetTitle>
        <SheetDescription>
          Cidades e bairros valem para todas as organizações. Só o superadministrador da plataforma grava.
        </SheetDescription>
      </SheetHeader>

      <SheetPanel className="p-6">
        <div className="space-y-8">
          <Secao titulo="Cidade">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Campo label="Cidade a editar">
                <select value={cidadeId} onChange={(e) => setCidadeId(e.target.value)} className={inputCls}>
                  <option value="nova">+ Nova cidade</option>
                  {cidades.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} - {c.state}</option>
                  ))}
                </select>
              </Campo>
              <div />
              <Campo label="Nome">
                <input value={nome} onChange={(e) => { setNome(e.target.value); setSujo(true); }} className={inputCls} placeholder="Ex.: Pouso Alegre" />
              </Campo>
              <Campo label="UF">
                <input value={uf} maxLength={2} onChange={(e) => { setUf(e.target.value.toUpperCase()); setSujo(true); }} className={inputCls} placeholder="MG" />
              </Campo>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">
                {centro ? `Centro marcado em ${centro.lat.toFixed(4)}, ${centro.lng.toFixed(4)}.` : 'Centro ainda não marcado: o mapa do módulo abre aqui.'}
              </span>
              {botaoMarcar(alvo === 'centro', () => setAlvo(alvo === 'centro' ? null : 'centro'), 'Marcar centro')}
            </div>
          </Secao>

          <Secao titulo="Mapa">
            <p className="text-xs text-gray-500">
              Clique em "Marcar" ao lado do item e depois no ponto do mapa. O ponto do bairro é usado como posição aproximada dos anúncios dele que não têm endereço localizado.
            </p>
            <div ref={mapaRef} className="w-full h-[280px] rounded-[10px] overflow-hidden border border-gray-100" />
          </Secao>

          <Secao titulo="Bairros">
            {carregando ? (
              <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando bairros…</div>
            ) : (
              <div className="space-y-2">
                {bairros.length === 0 && <p className="text-xs text-gray-500">Nenhum bairro cadastrado nesta cidade.</p>}
                {bairros.map((b, i) => (
                  <div key={b.id ?? `novo-${i}`} className="flex items-center gap-2">
                    <input
                      value={b.nome}
                      onChange={(e) => editarBairro(i, { nome: e.target.value })}
                      className={inputCls}
                      placeholder="Nome do bairro, como aparece nos anúncios"
                    />
                    <span className={`text-xs shrink-0 w-24 ${b.lat != null ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {b.lat != null ? 'ponto marcado' : 'sem ponto'}
                    </span>
                    {botaoMarcar(alvo === i, () => setAlvo(alvo === i ? null : i), 'Marcar')}
                    {!b.id ? (
                      <button type="button" onClick={() => removerNovo(i)} className="h-9 w-9 flex items-center justify-center rounded-[6px] text-gray-400 hover:text-rose-600 hover:bg-rose-50 shrink-0" title="Remover este bairro novo">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="w-9 shrink-0" title="Bairro já gravado não é excluído aqui: ele pode ter anúncios vinculados." />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => { setBairros((l) => [...l, { nome: '', lat: null, lng: null }]); setSujo(true); }}
                  className="flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium text-blue-600 hover:bg-blue-50 rounded-[6px]"
                >
                  <Plus className="w-4 h-4" /> Adicionar bairro
                </button>
                <p className="text-xs text-gray-400">
                  Ao salvar, os anúncios desta cidade cujo bairro de origem tem o mesmo nome passam a apontar para o bairro.
                </p>
              </div>
            )}
          </Secao>

          {cidadeId !== 'nova' && (
            <Secao titulo="Bairros citados nos anúncios e sem cadastro">
              {faltandoVisiveis.length === 0 ? (
                <p className="text-xs text-gray-500">Todo bairro citado nos anúncios desta cidade já está cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    Esses nomes vêm dos anúncios e não existem no mapa aberto nem no cadastro, por isso os anúncios deles ficam sem posição. Adicione o bairro e clique no mapa onde ele fica.
                  </p>
                  {faltandoVisiveis.map((f) => (
                    <div key={f.nome} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-b-0">
                      <span className="text-sm text-gray-700 truncate" title={f.nome}>{f.nome}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-gray-500">
                          {f.anuncios} anúncio{f.anuncios === 1 ? '' : 's'}{f.semPosicao > 0 ? ` · ${f.semPosicao} sem posição` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => adicionarFaltante(f.nome)}
                          className="h-8 px-3 rounded-[6px] text-[13px] font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          Adicionar e marcar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Secao>
          )}
        </div>
      </SheetPanel>

      <SheetFooter>
        <Button variant="ghost" size="lg" onClick={onClose}>Cancelar</Button>
        <button
          onClick={salvar}
          disabled={salvando || carregando}
          title={carregando ? 'Aguarde os bairros carregarem.' : undefined}
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 transition-all font-medium text-[13px] active:scale-95 disabled:opacity-50"
        >
          {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
          {salvando ? 'Salvando...' : 'Salvar praça'}
        </button>
      </SheetFooter>
    </Sheet>
  );
};

export default MarketPracaSheet;

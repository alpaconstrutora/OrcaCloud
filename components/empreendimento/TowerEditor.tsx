// components/empreendimento/TowerEditor.tsx
//
// Torres & Unidades do Empreendimento. Usa o primitivo compartilhado <TorreCard> — a mesma
// casca visual da Viabilidade e (futuramente) do Planta IA. O miolo aqui é FloorEditor +
// UnitEditor (unidade individual real); nos outros módulos o miolo difere, a casca não.
//
// Estrutura em SUB-ABAS desde 25/11/2026 ("tela longa com tabela em cima de tabela" —
// docs/planos/2026-11-25-torres-unidades-sub-abas.md; antes, docs/planos/2026-10-14-torres-unidades-reorganizacao.md):
//   Terreno         — <TerrenoSecao> (a mesma da Visão Geral e da aba de unidade única)
//   Torres          — "Nova torre" + cards (o card abre os Pavimentos) · distância entre torres · total geral
//   Unidades        — seletor de torre + <UnitEditor> de UMA torre
//   Vista da janela — seletor de torre + <VistasDaTorreSecao>
//   Tipologias      — Plantas por tipologia + Decorado por tipologia
// Sem o empreendimento em mãos (estudos), só Torres e Unidades. Pavimentos e unidades de todas as torres são
// carregados aqui (antes, só ao abrir a torre): cada aba precisa deles sem passar pelas outras.
import React from 'react';
import { Plus, Loader2, Building, HardHat, Check, X, BarChart2, MoveHorizontal, MapPin, Home, Mountain, LayoutGrid } from 'lucide-react';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { pavimentosDaTorre, ORIGEM_DOS_PAVIMENTOS } from '../../utils/empreendimentoPavimentosDaTorre';
import { usePersistedState } from '../ui/TableUtils';
import { haPendenciaDeSaida, CONFIRMAR_SAIDA } from '../../lib/guardaDeSaida';
import { empreendimentoService } from '../../services/empreendimentoService';
import ActionIconButton from '../ui/ActionIconButton';
import Button from '../ui/Button';
import SecaoTitulo from '../ui/SecaoTitulo';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useStore } from '../../store/useStore';
import {
  Empreendimento, EmpreendimentoTower, EmpreendimentoTowerInsert, EmpreendimentoUnit, EmpreendimentoFloor,
} from '../../types';
import UnitEditor from './UnitEditor';
import TerrenoSecao from './TerrenoSecao';
import PlantasPorTipologiaSecao from './PlantasPorTipologiaSecao';
import DecoradoPorTipologiaSecao from './DecoradoPorTipologiaSecao';
import VistasDaTorreSecao from './VistasDaTorreSecao';
// Os testes e quem mais validava a localização importavam daqui.
export { problemaDaLocalizacao } from './TerrenoSecao';
import FloorEditor, { fmtElevacao, lerElevacao, lerPeDireito } from './FloorEditor';
import { TorreCard, TorreEmpty, TorreTotais, TorreTotalMetric } from '../torres/TorreCard';
import { isObra } from '../../utils/projectClassification';
import { comDistancia, distanciaDoPar, lerDistanciaDigitada, lerDistancias, paresDeTorres, DISTANCIA_MAX_ENTRE_TORRES_M, type DistanciaEntreTorres } from '../../utils/empreendimentoDistanciasEntreTorres';

interface Props {
  empreendimentoId: string;
  organizationId: string;
  /**
   * Dados atuais do empreendimento. Sem ele a seção Terreno NÃO aparece: as telas de
   * estudo (Viabilidade, Planta IA) montam este editor sem o empreendimento, e antes a
   * seção aparecia em branco lá, como se o terreno não estivesse cadastrado.
   */
  empreendimento?: Empreendimento;
  /** Chamado depois de salvar o Terreno, para o pai recarregar o empreendimento (Visão Geral usa os mesmos campos). */
  onTerrenoSaved?: () => void;
  /**
   * Motivo do modo só leitura. Usado pela Viabilidade (EstudoTorresUnidades): sem
   * canEditImovib as torres aparecem e expandem, mas não editam (decisão de
   * 2026-10-12). Ausente: editável, como no módulo Empreendimentos.
   */
  somenteLeitura?: string;
}

// Pé-direito padrão (27/10/2026): metros, opcional — vale para os pavimentos sem pé-direito próprio e para a torre
// sem cadastro de pavimentos (a massa da Planta lê os dois).
// Elevação do térreo (27/10/2026): a referência das elevações dos pavimentos (+0,00 ou a cota altimétrica); vazio = 0.
type SubAba = 'terreno' | 'torres' | 'unidades' | 'vista' | 'tipologias';

const emptyTorreForm = () => ({ name: '', floors_count: '', units_per_floor: '', pe_direito_padrao_m: '', elevacao_terreo_m: '' });
const MSG_PE_DIREITO_TORRE = 'Pé-direito padrão entre 2,00 e 15,00 m (ou vazio).';
const MSG_ELEVACAO_TORRE = 'Elevação do térreo em metros, ex.: +0,00 ou 745,30 (ou vazio, para 0).';

export const TowerEditor: React.FC<Props> = ({ empreendimentoId, organizationId, empreendimento, onTerrenoSaved, somenteLeitura }) => {
  const travado = !!somenteLeitura;
  const { projects } = useStore();
  const confirm = useConfirm();
  const [towers, setTowers] = React.useState<EmpreendimentoTower[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState(emptyTorreForm());
  const [unitsByTower, setUnitsByTower] = React.useState<Record<string, EmpreendimentoUnit[]>>({});
  const [floorsByTower, setFloorsByTower] = React.useState<Record<string, EmpreendimentoFloor[]>>({});
  const { showToast } = useToast();
  const notify = (msg: string, type: 'success' | 'error' = 'success') => showToast(msg, type);

  // ── Nova torre (painel lateral) ─────────────────────────────────────────────
  const [novaTorreAberta, setNovaTorreAberta] = React.useState(false);
  const [form, setForm] = React.useState(emptyTorreForm());
  const [erroNomeTorre, setErroNomeTorre] = React.useState<string | undefined>();
  const novaTorre = useUnsavedChanges();
  const abrirNovaTorre = () => { setForm(emptyTorreForm()); setErroNomeTorre(undefined); novaTorre.markSaved(); setNovaTorreAberta(true); };
  const fecharNovaTorre = () => { setNovaTorreAberta(false); setErroNomeTorre(undefined); novaTorre.markSaved(); };
  const pedirFecharNovaTorre = async () => { if (await novaTorre.confirmDiscard()) fecharNovaTorre(); };
  const patchTorre = (patch: Partial<ReturnType<typeof emptyTorreForm>>) => {
    setForm(p => ({ ...p, ...patch }));
    if ('name' in patch) setErroNomeTorre(undefined);
    novaTorre.markDirty();
  };

  // ── Distância entre torres (28/10/2026) ────────────────────────────────────
  // "quando um empreendimento tem mais de uma torre a distância entre torres deve ser informada": uma por PAR
  // (decisão do usuário). Mora no empreendimento (`distancias_entre_torres`); a Planta confere e o Gerar massa usa.
  const distanciasSalvas = React.useMemo(() => lerDistancias(empreendimento?.distancias_entre_torres), [empreendimento?.distancias_entre_torres]);
  const pares = React.useMemo(() => paresDeTorres(towers), [towers]);
  const chaveDoPar = (a: string, b: string) => [a, b].sort().join('|');
  const textoSalvo = React.useCallback(
    (a: string, b: string) => {
      const m = distanciaDoPar(distanciasSalvas, a, b);
      return m == null ? '' : m.toFixed(2).replace('.', ',');
    },
    [distanciasSalvas],
  );
  const [distanciaForm, setDistanciaForm] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    setDistanciaForm(Object.fromEntries(pares.map(([a, b]) => [chaveDoPar(a.id, b.id), textoSalvo(a.id, b.id)])));
  }, [pares, textoSalvo]);
  const distanciasDirty = pares.some(([a, b]) => (distanciaForm[chaveDoPar(a.id, b.id)] ?? textoSalvo(a.id, b.id)) !== textoSalvo(a.id, b.id));
  const [savingDistancias, setSavingDistancias] = React.useState(false);
  const handleSaveDistancias = async (e: React.FormEvent) => {
    e.preventDefault();
    let lista: DistanciaEntreTorres[] = [];
    for (const [a, b] of pares) {
      const v = lerDistanciaDigitada(distanciaForm[chaveDoPar(a.id, b.id)] ?? textoSalvo(a.id, b.id));
      if (v === false) {
        notify(`${a.name} ↔ ${b.name}: use metros entre 0 (encostadas) e ${DISTANCIA_MAX_ENTRE_TORRES_M}, ou deixe vazio.`, 'error');
        return;
      }
      lista = comDistancia(lista, a.id, b.id, v);
    }
    setSavingDistancias(true);
    try {
      // Só os pares das torres de agora: o de torre apagada sai ao salvar.
      await empreendimentoService.update(empreendimentoId, { distancias_entre_torres: lista });
      notify('Distâncias entre torres salvas.');
      onTerrenoSaved?.();
    } catch (err: any) {
      notify(`Erro ao salvar as distâncias: ${err.message}`, 'error');
    } finally {
      setSavingDistancias(false);
    }
  };

  const handleUnitsChange = React.useCallback((towerId: string, units: EmpreendimentoUnit[]) => {
    setUnitsByTower(prev => ({ ...prev, [towerId]: units }));
  }, []);

  const handleTowerChange = React.useCallback((towerId: string, campos: Partial<EmpreendimentoTower>) => {
    setTowers(prev => prev.map(t => (t.id === towerId ? { ...t, ...campos } : t)));
  }, []);

  const handleFloorsChange = React.useCallback((towerId: string, floors: EmpreendimentoFloor[]) => {
    setFloorsByTower(prev => ({ ...prev, [towerId]: floors }));
  }, []);

  // organization_id (coluna nativa) tem precedência sobre settings.organizationId — ver
  // mesma nota em EmpreendimentoForm.tsx.
  const orgProjects = React.useMemo(() => projects.filter(p => {
    const s: any = p.settings || {};
    const projOrgId = p.organization_id ?? s.organizationId;
    return isObra({ settings: s }) && (!organizationId || projOrgId === organizationId);
  }), [projects, organizationId]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const lista = await empreendimentoService.listTowers(empreendimentoId);
      setTowers(lista);
      // Pavimentos e unidades de todas as torres já na entrada (25/11/2026): a aba Unidades precisa dos pavimentos
      // (Gerar a partir dos pavimentos, elevação), a Vista das unidades, e o card fechado mostra as contagens.
      // Falha aqui não derruba as torres: cada editor carrega o seu ao montar e avisa por callback.
      const ids = lista.map(t => t.id);
      // `Promise.resolve().then`: erro síncrono também cai no catch, não no das torres.
      const [pavimentos, unidades] = await Promise.all([
        Promise.resolve().then(() => empreendimentoService.listFloorsDasTorres(ids))
          .catch(err => { console.error('[TowerEditor] pavimentos:', err); return null; }),
        Promise.resolve().then(() => Promise.all(ids.map(id => empreendimentoService.listUnits(id))))
          .catch(err => { console.error('[TowerEditor] unidades:', err); return null; }),
      ]);
      if (pavimentos) {
        setFloorsByTower(Object.fromEntries(ids.map(id => [id, pavimentos.filter(f => f.tower_id === id)])));
      }
      if (unidades) setUnitsByTower(Object.fromEntries(ids.map((id, i) => [id, unidades[i]])));
    } catch (err) {
      console.error('[TowerEditor] erro ao carregar torres:', err);
    } finally {
      setLoading(false);
    }
  }, [empreendimentoId]);

  React.useEffect(() => { load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErroNomeTorre('Informe o nome da torre ou bloco.'); return; }
    const peDireito = lerPeDireito(form.pe_direito_padrao_m);
    if (peDireito === false) { notify(MSG_PE_DIREITO_TORRE, 'error'); return; }
    const elevacao = lerElevacao(form.elevacao_terreo_m);
    if (elevacao === false) { notify(MSG_ELEVACAO_TORRE, 'error'); return; }
    setSaving(true);
    try {
      const payload: EmpreendimentoTowerInsert = {
        empreendimento_id: empreendimentoId,
        name: form.name.trim(),
        floors_count: form.floors_count ? Number(form.floors_count) : undefined,
        units_per_floor: form.units_per_floor ? Number(form.units_per_floor) : undefined,
        pe_direito_padrao_m: peDireito,
        elevacao_terreo_m: elevacao,
        sort_order: towers.length,
      };
      const created = await empreendimentoService.createTower(payload);
      setTowers(prev => [...prev, created]);   // §22 — sem recarregar a lista
      // Próximo passo natural é cadastrar os pavimentos: a torre nova já abre.
      setExpandedId(created.id);
      notify(`Torre cadastrada: ${created.name}.`);
      fecharNovaTorre();
    } catch (err: any) {
      notify(`Erro ao adicionar torre: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (tower: EmpreendimentoTower) => {
    setEditingId(tower.id);
    setEditForm({
      name: tower.name,
      floors_count: tower.floors_count?.toString() ?? '',
      units_per_floor: tower.units_per_floor?.toString() ?? '',
      pe_direito_padrao_m: tower.pe_direito_padrao_m != null ? Number(tower.pe_direito_padrao_m).toFixed(2).replace('.', ',') : '',
      elevacao_terreo_m: tower.elevacao_terreo_m != null ? fmtElevacao(Number(tower.elevacao_terreo_m)) : '',
    });
  };

  const handleSaveEdit = async (tower: EmpreendimentoTower) => {
    if (!editForm.name.trim()) { notify('Informe o nome da torre.', 'error'); return; }
    const peDireito = lerPeDireito(editForm.pe_direito_padrao_m);
    if (peDireito === false) { notify(MSG_PE_DIREITO_TORRE, 'error'); return; }
    const elevacao = lerElevacao(editForm.elevacao_terreo_m);
    if (elevacao === false) { notify(MSG_ELEVACAO_TORRE, 'error'); return; }
    try {
      await empreendimentoService.updateTower(tower.id, {
        name: editForm.name.trim(),
        floors_count: editForm.floors_count ? Number(editForm.floors_count) : undefined,
        units_per_floor: editForm.units_per_floor ? Number(editForm.units_per_floor) : undefined,
        pe_direito_padrao_m: peDireito,
        elevacao_terreo_m: elevacao,
      });
      setTowers(prev => prev.map(t => t.id === tower.id ? {
        ...t,
        name: editForm.name.trim(),
        floors_count: editForm.floors_count ? Number(editForm.floors_count) : undefined,
        units_per_floor: editForm.units_per_floor ? Number(editForm.units_per_floor) : undefined,
        pe_direito_padrao_m: peDireito,
        elevacao_terreo_m: elevacao,
      } : t));
      setEditingId(null);
    } catch (err: any) {
      notify(`Erro ao salvar torre: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (tower: EmpreendimentoTower) => {
    const ok = await confirm({
      title: 'Excluir torre?',
      message: `A torre "${tower.name}" e todas as suas unidades serão excluídas. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await empreendimentoService.deleteTower(tower.id);
      setTowers(prev => prev.filter(t => t.id !== tower.id));
      // As unidades e os pavimentos dela saem das contagens (total geral, seletor de torre).
      setUnitsByTower(({ [tower.id]: _u, ...resto }) => resto);
      setFloorsByTower(({ [tower.id]: _f, ...resto }) => resto);
    } catch (err: any) {
      notify(`Erro ao excluir torre: ${err.message}`, 'error');
    }
  };

  const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all';
  const rotuloCls = 'text-xs font-semibold text-slate-500';
  const editInputCls = 'h-9 px-2.5 border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:border-blue-500 bg-white';
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  // Terreno e Torres em blocos separados (28/10/2026, "separe as sessões Terreno e torres") — o mesmo padrão de
  // Pavimentos e Unidades dentro de cada torre.
  const blocoCls = 'rounded-[10px] border border-gray-200 bg-white p-5 space-y-4';

  // ── Sub-abas (25/11/2026) ──────────────────────────────────────────────────
  // Terreno, Vista e Tipologias só com o empreendimento em mãos (nos estudos ele não vem — a mesma condição de
  // antes); Unidades, Vista e Tipologias só com torre. Enquanto as torres carregam, conta como "tem torre": a
  // aba gravada não pisca para outra e volta.
  const temTorre = loading || towers.length > 0;
  const abas: TabsBarItem<SubAba>[] = [
    ...(empreendimento ? [{ id: 'terreno' as const, label: 'Terreno', icon: <MapPin className="w-3.5 h-3.5" /> }] : []),
    { id: 'torres', label: 'Torres', icon: <Building className="w-3.5 h-3.5" />, badge: towers.length || undefined, badgeTitulo: 'Torres cadastradas' },
    ...(temTorre ? [{
      id: 'unidades' as const, label: 'Unidades', icon: <Home className="w-3.5 h-3.5" />,
      badge: Object.values(unitsByTower).reduce((s, us) => s + us.length, 0) || undefined, badgeTitulo: 'Unidades de todas as torres',
    }] : []),
    ...(empreendimento && temTorre ? [
      { id: 'vista' as const, label: 'Vista da janela', icon: <Mountain className="w-3.5 h-3.5" /> },
      { id: 'tipologias' as const, label: 'Tipologias', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
    ] : []),
  ];
  // A escolha fica no navegador; a 1ª visita abre na 1ª aba (Terreno — o que ficava no topo até 25/11/2026).
  // Aba gravada que não existe aqui (ex.: Vista num estudo) cai na 1ª disponível.
  const [abaGravada, setAbaGravada] = usePersistedState<SubAba>('empreendimentoTorres:aba', 'terreno');
  const aba: SubAba = abas.some(a => a.id === abaGravada) ? abaGravada : abas[0].id;
  // A mesma guarda da troca de aba do empreendimento: o que está aberto desmonta ao trocar.
  const podeTrocar = async () => !haPendenciaDeSaida() || confirm(CONFIRMAR_SAIDA);
  const trocarAba = async (nova: SubAba) => { if (nova !== aba && await podeTrocar()) setAbaGravada(nova); };

  // Torre exibida em Unidades e Vista da janela (a 1ª até o usuário escolher).
  const [torreId, setTorreId] = React.useState<string | null>(null);
  const torreAtual = towers.find(t => t.id === torreId) ?? towers[0];
  const trocarTorre = async (id: string) => { if (id !== torreAtual?.id && await podeTrocar()) setTorreId(id); };
  const seletorDeTorre = towers.length > 1 && torreAtual && (
    <div className="flex flex-wrap items-center gap-2" data-testid="seletor-de-torre">
      <span className="text-sm font-semibold text-slate-600">Torre</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Torre exibida">
        {towers.map(t => {
          const n = unitsByTower[t.id]?.length;
          const ativa = t.id === torreAtual.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={ativa}
              onClick={() => void trocarTorre(t.id)}
              className={`h-9 px-3 rounded-[6px] border text-sm font-medium transition-colors ${
                ativa ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:text-blue-600'
              }`}
            >
              {t.name}{n != null ? ` · ${n}` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
  const carregando = <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;

  // Total geral (todas as torres) — mora na aba Unidades desde 27/11/2026 ("a somatória de áreas ficou na aba de torres.
  // deveria estar na aba unidades"), ACIMA da tabela (guia §6.14: nada abaixo de tabela).
  const todasAsUnidades = Object.values(unitsByTower).flat();
  const totalGeral = todasAsUnidades.length > 0 && (() => {
    const totalPriv = todasAsUnidades.reduce((s, u) => s + (u.private_area ?? 0), 0);
    const totalComum = todasAsUnidades.reduce((s, u) => s + (u.common_area ?? 0), 0);
    const totalArea = totalPriv + totalComum;
    return (
      <div data-testid="total-geral">
        <TorreTotais>
          <div className="flex items-center gap-2 text-gray-700">
            <BarChart2 className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold">Total geral{towers.length > 1 ? ` (${towers.length} torres)` : ''}</span>
          </div>
          <TorreTotalMetric label="Unidades" value={String(todasAsUnidades.length)} />
          <TorreTotalMetric label="Área privativa" value={totalPriv > 0 ? `${fmt(totalPriv)} m²` : '—'} color="text-blue-600" />
          <TorreTotalMetric label="Área comum" value={totalComum > 0 ? `${fmt(totalComum)} m²` : '—'} color="text-violet-600" />
          {totalArea > 0 && <TorreTotalMetric label="Área total" value={`${fmt(totalArea)} m²`} />}
        </TorreTotais>
      </div>
    );
  })();

  return (
    <div className="space-y-6">
      {/* Trilho só (bare): a aba Torres & Unidades já é um card. */}
      <TabsBar bare tabs={abas} value={aba} onChange={id => void trocarAba(id)} />

      {/* Terreno — dado do empreendimento (não de uma torre), 1 por empreendimento. Mora em TerrenoSecao desde
          09/11/2026 (a Visão Geral e a aba de unidade única usam a mesma). */}
      {aba === 'terreno' && empreendimento && (
        <TerrenoSecao empreendimentoId={empreendimentoId} empreendimento={empreendimento} onTerrenoSaved={onTerrenoSaved} somenteLeitura={somenteLeitura} />
      )}

      {/* Unidades — uma torre por vez: com 200 unidades por torre, as tabelas empilhadas viravam uma página sem fim. */}
      {aba === 'unidades' && (loading ? carregando : torreAtual && (
        <section className={blocoCls} aria-label="Unidades" data-testid="secao-unidades">
          {totalGeral}
          {seletorDeTorre}
          <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 m-0 p-0">
            <UnitEditor key={torreAtual.id} tower={torreAtual} floors={floorsByTower[torreAtual.id]} onUnitsChange={handleUnitsChange} onTowerChange={handleTowerChange} />
          </fieldset>
        </section>
      ))}

      {/* Vista da janela (Espelho de Vendas 3D, F6 — 10/11/2026), por torre. */}
      {aba === 'vista' && empreendimento && (loading ? carregando : torreAtual && (
        <section className={blocoCls} aria-label="Vista da janela" data-testid="secao-vistas">
          {seletorDeTorre}
          <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 m-0 p-0">
            <VistasDaTorreSecao key={torreAtual.id} towerId={torreAtual.id} towerName={torreAtual.name} empreendimentoId={empreendimentoId} organizationId={organizationId} somenteLeitura={somenteLeitura} unidadesDaTorre={unitsByTower[torreAtual.id]} />
          </fieldset>
        </section>
      ))}

      {aba === 'torres' && (
      <section className={blocoCls} aria-label="Torres" data-testid="secao-torres">
        <SecaoTitulo
          icon={Building}
          titulo="Torres"
          resumo={towers.length > 0 ? `${towers.length} ${towers.length === 1 ? 'torre' : 'torres'}` : undefined}
          acoes={
            <span title={somenteLeitura}>
              <Button onClick={abrirNovaTorre} disabled={travado}>
                <Plus className="w-[15px] h-[15px]" /> Nova torre
              </Button>
            </span>
          }
        />

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : towers.length === 0 ? (
        <TorreEmpty icon={Building} text="Nenhuma torre ou bloco cadastrado. Comece por &quot;Nova torre&quot;." />
      ) : (
        <div className="space-y-2.5">
          {towers.map(tower => {
            const linkedObra = orgProjects.find(p => p.id === tower.project_id);
            const isOpen = expandedId === tower.id;
            const isEditing = editingId === tower.id;
            const towerUnits = unitsByTower[tower.id] ?? [];
            const towerPriv = towerUnits.reduce((s, u) => s + (u.private_area ?? 0), 0);
            const towerComum = towerUnits.reduce((s, u) => s + (u.common_area ?? 0), 0);

            // Nº de pavimentos da torre vazio → o do cadastro de pavimentos (ou o das unidades), com a origem na dica.
            const pav = pavimentosDaTorre(tower.floors_count, floorsByTower[tower.id], towerUnits);
            const subtitle = (
              <>
                {pav
                  ? <span title={ORIGEM_DOS_PAVIMENTOS[pav.fonte]} data-testid="pavimentos-da-torre">{pav.n} pav.</span>
                  : 'sem pavimentos'}
                {tower.units_per_floor ? ` · ${tower.units_per_floor} un/pav` : ''}
                {tower.pe_direito_padrao_m != null ? ` · pé-direito ${Number(tower.pe_direito_padrao_m).toFixed(2).replace('.', ',')} m` : ''}
                {tower.elevacao_terreo_m != null ? ` · térreo em ${fmtElevacao(Number(tower.elevacao_terreo_m))} m` : ''}
                {towerUnits.length > 0 && (
                  <>
                    {' · '}<span className="text-gray-500">{towerUnits.length} unid.</span>
                    {towerPriv > 0 && <> · <span className="text-blue-500">{fmt(towerPriv)} m² priv.</span></>}
                    {towerComum > 0 && <> · <span className="text-violet-500">{fmt(towerComum)} m² comum</span></>}
                  </>
                )}
              </>
            );

            const editHeader = (
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <input className={editInputCls} placeholder="Nome da torre" value={editForm.name}
                  onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} autoFocus />
                <input className={`${editInputCls} w-28`} placeholder="Nº pav." type="number" value={editForm.floors_count}
                  onChange={e => setEditForm(p => ({ ...p, floors_count: e.target.value }))} />
                <input className={`${editInputCls} w-32`} placeholder="Un./pav." type="number" value={editForm.units_per_floor}
                  onChange={e => setEditForm(p => ({ ...p, units_per_floor: e.target.value }))} />
                <input className={`${editInputCls} w-36`} placeholder="Pé-direito (m)" inputMode="decimal" aria-label="Pé-direito padrão (m)"
                  value={editForm.pe_direito_padrao_m} onChange={e => setEditForm(p => ({ ...p, pe_direito_padrao_m: e.target.value }))} />
                <input className={`${editInputCls} w-40`} placeholder="Elevação térreo (m)" inputMode="decimal" aria-label="Elevação do térreo (m)"
                  value={editForm.elevacao_terreo_m} onChange={e => setEditForm(p => ({ ...p, elevacao_terreo_m: e.target.value }))} />
                <button onClick={() => handleSaveEdit(tower)} className="h-9 w-9 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-[6px]">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingId(null)} className="h-9 w-9 flex items-center justify-center bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-[6px]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            );

            const actions = (
              <>
                {linkedObra ? (
                  <span className="text-xs font-semibold px-2.5 h-9 inline-flex items-center rounded-[6px] bg-emerald-50 text-emerald-600 gap-1.5">
                    <HardHat className="w-3.5 h-3.5" /> {linkedObra.name}
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2.5 h-9 inline-flex items-center text-gray-400">
                    Sem obra — vincule em Editar Empreendimento
                  </span>
                )}
                <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 p-0 m-0 inline-flex items-center gap-1">
                  <ActionIconButton kind="edit" title="Editar torre" onClick={() => startEdit(tower)} />
                  <ActionIconButton kind="delete" onClick={() => handleDelete(tower)} />
                </fieldset>
              </>
            );

            return (
              <TorreCard
                key={tower.id}
                icon={Building}
                tint="blue"
                title={tower.name}
                subtitle={subtitle}
                actions={actions}
                headerOverride={isEditing ? editHeader : undefined}
                expandable
                isOpen={isOpen}
                onToggle={() => setExpandedId(isOpen ? null : tower.id)}
              >
                {/* O card abre só os Pavimentos: Unidades e Vista da janela têm sub-aba própria (25/11/2026). */}
                <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 m-0 p-4 space-y-4">
                  <section className="rounded-[10px] border border-gray-200 bg-white p-4" aria-label="Pavimentos" data-testid="secao-pavimentos">
                    <FloorEditor tower={tower} onFloorsChange={handleFloorsChange} unidades={unitsByTower[tower.id]} />
                  </section>
                </fieldset>
              </TorreCard>
            );
          })}
        </div>
      )}

      {/* Distância entre torres (28/10/2026): com 2 torres ou mais, uma por par. Só com o empreendimento em mãos. */}
      {empreendimento && pares.length > 0 && (
        <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 p-0 m-0">
          <form onSubmit={handleSaveDistancias} className="space-y-3 rounded-[10px] border border-gray-100 bg-gray-50/40 p-4" data-testid="distancias-entre-torres">
            <div className="flex items-center gap-2">
              <MoveHorizontal className="w-4 h-4 text-gray-400" />
              <p className="text-sm font-semibold text-gray-700">Distância entre torres</p>
            </div>
            <p className="text-xs text-gray-500">
              A menor distância entre as faces de cada par, em metros (0 = torres encostadas). A Planta Inteligente confere os blocos, o Gerar massa usa e o "Ajustar ao Empreendimento" afasta as torres.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              {pares.map(([a, b]) => {
                const k = chaveDoPar(a.id, b.id);
                return (
                  <div key={k} className="space-y-1.5">
                    <label htmlFor={`distancia-${k}`} className={rotuloCls}>{a.name} ↔ {b.name} (m)</label>
                    <input id={`distancia-${k}`} className={inputCls} inputMode="decimal" placeholder="ex: 6,00"
                      value={distanciaForm[k] ?? textoSalvo(a.id, b.id)} onChange={e => setDistanciaForm(p => ({ ...p, [k]: e.target.value }))} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end">
              <span title={!distanciasDirty ? 'Nada mudou nas distâncias.' : undefined}>
                <Button type="submit" disabled={savingDistancias || !distanciasDirty}>
                  {savingDistancias ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-[15px] h-[15px]" />}
                  Salvar distâncias
                </Button>
              </span>
            </div>
          </form>
        </fieldset>
      )}

      </section>
      )}

      {/* Tipologias: Plantas por tipologia (Espelho de Vendas 3D, F5) e Decorado por tipologia (F8) — 10/11/2026. */}
      {aba === 'tipologias' && empreendimento && towers.length > 0 && (
        <PlantasPorTipologiaSecao
          empreendimentoId={empreendimentoId}
          organizationId={organizationId}
          buildingId={empreendimento.commercial_building_id}
          somenteLeitura={somenteLeitura}
          recarga={unitsByTower}
        />
      )}

      {/* Decorado por tipologia: o corte 3D mobiliado e os ambientes. */}
      {aba === 'tipologias' && empreendimento && towers.length > 0 && (
        <DecoradoPorTipologiaSecao
          empreendimentoId={empreendimentoId}
          organizationId={organizationId}
          buildingId={empreendimento.commercial_building_id}
          somenteLeitura={somenteLeitura}
          recarga={unitsByTower}
        />
      )}

      {/* Painel: Nova torre. O conteúdo só existe aberto — o Sheet fechado mantém os
          filhos no DOM, e campos invisíveis ainda recebem Tab e leitor de tela. */}
      <Sheet open={novaTorreAberta} onClose={fecharNovaTorre} size="md" dirty={novaTorre.dirty}>
        {novaTorreAberta && <>
        <SheetHeader onClose={pedirFecharNovaTorre}>
          <SheetTitle>Nova torre</SheetTitle>
          {empreendimento && <SheetDescription>{empreendimento.name}</SheetDescription>}
        </SheetHeader>
        <form onSubmit={handleAdd} className="flex-1 flex flex-col min-h-0">
          <SheetPanel className="p-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-1.5 col-span-2">
                <label htmlFor="nova-torre-nome" className={rotuloCls}>Nome *</label>
                <input id="nova-torre-nome" className={`${inputCls} ${erroNomeTorre ? 'border-red-300' : ''}`}
                  placeholder="ex: Torre A, Bloco 1" value={form.name}
                  onChange={e => patchTorre({ name: e.target.value })}
                  aria-invalid={!!erroNomeTorre} />
                {erroNomeTorre && <p className="text-xs text-red-600">{erroNomeTorre}</p>}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nova-torre-pav" className={rotuloCls}>Nº de pavimentos</label>
                <input id="nova-torre-pav" className={inputCls} type="number" min="0" value={form.floors_count}
                  onChange={e => patchTorre({ floors_count: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nova-torre-upf" className={rotuloCls}>Unidades por pavimento</label>
                <input id="nova-torre-upf" className={inputCls} type="number" min="0" value={form.units_per_floor}
                  onChange={e => patchTorre({ units_per_floor: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nova-torre-pd" className={rotuloCls}>Pé-direito padrão (m)</label>
                <input id="nova-torre-pd" className={inputCls} inputMode="decimal" placeholder="ex: 3,00" value={form.pe_direito_padrao_m}
                  onChange={e => patchTorre({ pe_direito_padrao_m: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nova-torre-elev" className={rotuloCls}>Elevação do térreo (m)</label>
                <input id="nova-torre-elev" className={inputCls} inputMode="decimal" placeholder="+0,00" value={form.elevacao_terreo_m}
                  onChange={e => patchTorre({ elevacao_terreo_m: e.target.value })} />
              </div>
              <p className="col-span-2 text-xs text-gray-500">
                Depois de criar, cadastre os pavimentos no card da torre e as unidades na aba Unidades.
              </p>
            </div>
          </SheetPanel>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={pedirFecharNovaTorre}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Salvar torre
            </Button>
          </SheetFooter>
        </form>
        </>}
      </Sheet>
    </div>
  );
};

export default TowerEditor;

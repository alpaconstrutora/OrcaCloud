// components/empreendimento/TowerEditor.tsx
//
// Torres & Unidades do Empreendimento. Usa o primitivo compartilhado <TorreCard> — a mesma
// casca visual da Viabilidade e (futuramente) do Planta IA. O miolo aqui é FloorEditor +
// UnitEditor (unidade individual real); nos outros módulos o miolo difere, a casca não.
//
// Estrutura (desde 14/10/2026 — "confuso com campos sem uma ordem, sem separação clara"):
//   Terreno   — <TerrenoSecao> (a mesma da aba de unidade única: Lote, Casa, Chácara)
//   Torres    — título §30 + "Nova torre" (painel lateral) + cards
//     └ card  — Pavimentos (FloorEditor) · Unidades (UnitEditor)
// Plano e decisões: docs/planos/2026-10-14-torres-unidades-reorganizacao.md.
import React from 'react';
import { Plus, Loader2, Building, HardHat, Check, X, BarChart2, MoveHorizontal } from 'lucide-react';
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
      setTowers(await empreendimentoService.listTowers(empreendimentoId));
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

  return (
    <div className="space-y-6">
      {/* Terreno — dado do empreendimento (não de uma torre), 1 por empreendimento. Só com o empreendimento
          em mãos: nas telas de estudo ele não vem e a seção mostraria campos vazios. Mora em TerrenoSecao desde
          09/11/2026 (a aba de unidade única usa a mesma). */}
      {empreendimento && (
        <TerrenoSecao empreendimentoId={empreendimentoId} empreendimento={empreendimento} onTerrenoSaved={onTerrenoSaved} somenteLeitura={somenteLeitura} />
      )}

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

            const subtitle = (
              <>
                {tower.floors_count ? `${tower.floors_count} pav.` : 'sem pavimentos'}
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
                {/* Cada seção no seu bloco (27/10/2026, "separar cada seção para melhorar a organização"). */}
                <fieldset disabled={travado} title={somenteLeitura} className="imovib-ro min-w-0 border-0 m-0 p-4 space-y-4">
                  <section className="rounded-[10px] border border-gray-200 bg-white p-4" aria-label="Pavimentos" data-testid="secao-pavimentos">
                    <FloorEditor tower={tower} onFloorsChange={handleFloorsChange} unidades={unitsByTower[tower.id]} />
                  </section>
                  <section className="rounded-[10px] border border-gray-200 bg-white p-4" aria-label="Unidades" data-testid="secao-unidades">
                    <UnitEditor tower={tower} floors={floorsByTower[tower.id]} onUnitsChange={handleUnitsChange} onTowerChange={handleTowerChange} />
                  </section>
                  {/* Vista da janela (Espelho de Vendas 3D, F6 — 10/11/2026): só com o empreendimento em mãos. */}
                  {empreendimento && (
                    <section className="rounded-[10px] border border-gray-200 bg-white p-4" aria-label="Vista da janela" data-testid="secao-vistas">
                      <VistasDaTorreSecao towerId={tower.id} towerName={tower.name} empreendimentoId={empreendimentoId} organizationId={organizationId} somenteLeitura={somenteLeitura} unidadesDaTorre={unitsByTower[tower.id]} />
                    </section>
                  )}
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

      {/* Totais gerais — só quando há pelo menos 1 torre com unidades */}
      {Object.keys(unitsByTower).length > 0 && (() => {
        const allUnits = Object.values(unitsByTower).flat();
        if (allUnits.length === 0) return null;
        const totalPriv = allUnits.reduce((s, u) => s + (u.private_area ?? 0), 0);
        const totalComum = allUnits.reduce((s, u) => s + (u.common_area ?? 0), 0);
        const totalArea = totalPriv + totalComum;
        return (
          <TorreTotais>
            <div className="flex items-center gap-2 text-gray-500">
              <BarChart2 className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-black uppercase tracking-widest">Total geral</span>
            </div>
            <TorreTotalMetric label="Unidades" value={String(allUnits.length)} />
            <TorreTotalMetric label="Área privativa" value={totalPriv > 0 ? `${fmt(totalPriv)} m²` : '—'} color="text-blue-600" />
            <TorreTotalMetric label="Área comum" value={totalComum > 0 ? `${fmt(totalComum)} m²` : '—'} color="text-violet-600" />
            {totalArea > 0 && <TorreTotalMetric label="Área total" value={`${fmt(totalArea)} m²`} />}
          </TorreTotais>
        );
      })()}

      </section>

      {/* Plantas por tipologia (Espelho de Vendas 3D, F5 — 10/11/2026): só com o empreendimento em mãos e torre cadastrada. */}
      {empreendimento && towers.length > 0 && (
        <PlantasPorTipologiaSecao
          empreendimentoId={empreendimentoId}
          organizationId={organizationId}
          buildingId={empreendimento.commercial_building_id}
          somenteLeitura={somenteLeitura}
          recarga={unitsByTower}
        />
      )}

      {/* Decorado por tipologia (Espelho de Vendas 3D, F8 — 10/11/2026): o corte 3D mobiliado e os ambientes. */}
      {empreendimento && towers.length > 0 && (
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
                Depois de criar, cadastre os pavimentos e as unidades dentro do card da torre.
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

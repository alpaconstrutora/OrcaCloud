// components/empreendimento/UnitEditor.tsx
//
// Seção "Unidades" de uma torre (Torres & Unidades). Desde 14/10/2026 a seção
// abre com UM título e as três formas de criar unidade lado a lado, cada uma com
// nome que diz o que faz:
//   • "Gerar a partir dos pavimentos" — SUBSTITUI as unidades pelas que os
//     pavimentos cadastrados acima descrevem (era o botão do FloorEditor);
//   • "Gerar em série" — ACRESCENTA N pav × M un/pav, sem olhar os pavimentos
//     (era o acordeão tracejado "Gerar unidades automaticamente");
//   • "Nova unidade" — uma unidade, em painel lateral com os campos rotulados
//     (era uma grade de 13 inputs sem rótulo acima da tabela).
// O pedido que originou: docs/planos/2026-10-14-torres-unidades-reorganizacao.md.
//
// "Gerar a partir dos pavimentos" abre um painel (28/10/2026) com "Numeração começa em" — a 1ª unidade de cada
// andar (5 → 105, 106…) — e a prévia por andar, com a mesma conta que grava (utils/empreendimentoUnidadesDosPavimentos).
import React from 'react';
import {
  Plus, Loader2, Layers, X, Check, Zap, Home, ListPlus, Hash, Tag,
  ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown, MoveHorizontal,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import Button from '../ui/Button';
import SecaoTitulo from '../ui/SecaoTitulo';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { empreendimentoService } from '../../services/empreendimentoService';
import { useToast } from '../../hooks/useToast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  EmpreendimentoTower, EmpreendimentoUnit, EmpreendimentoFloor, FloorTipo, EmpreendimentoUnitInsert, OrdemDasUnidadesNaPlanta,
  UnitPositionType, UnitSunOrientation, UnitViewType, RentalUnitStatus,
} from '../../types';
import UnitFormFields, {
  FLOOR_TIPO_LABEL, UnitFormValues, emptyUnitFormValues, unitFormToPayload,
} from './UnitFormFields';
import {
  POSITION_LABEL, VIEW_LABEL, SUN_LABEL, POSITION_STYLE, VIEW_STYLE, SUN_STYLE,
  RENTAL_STATUS_LABEL,
} from '../../utils/empreendimentoComercial';
import { useConfirm } from '../ui/confirm';
import { andaresDoCadastro, estruturaDaTorre } from '../../utils/blueprintEstruturaDaTorre';
import { fmtElevacao } from './FloorEditor';
import { faixasPorAndar, lerNumeroInicial, unidadesDosPavimentos as montarUnidadesDosPavimentos, NUMERO_INICIAL_MAX } from '../../utils/empreendimentoUnidadesDosPavimentos';
import { compararNaOrdemDoEmpreendimento, moverNaOrdem, ordemPorNumero, type NovaOrdem } from '../../utils/empreendimentoOrdemDasUnidades';
import MoneyCentsInput from '../ui/MoneyCentsInput';
import { AgruparControles } from '../ui/Agrupamento';
import { useResizableColumns, useTableColumns, ColumnConfigButton, type ColumnConfig } from '../ui/TableUtils';
import { useAgrupamento } from '../../hooks/useAgrupamento';
import { CHAVE_VAZIA } from '../../utils/agruparLinhas';
import { OPCOES_AGRUPAR_UNIDADE, agruparUnidades, type CampoAgruparUnidade } from '../../utils/unidadesGrupos';

// ── Constantes de exibição ───────────────────────────────────────────────────

const FLOOR_TIPO_STYLE: Record<FloorTipo, string> = {
  SUBSOLO: 'bg-slate-500/10 text-slate-600', TERREO: 'bg-lime-500/10 text-lime-700',
  MEZANINO: 'bg-teal-500/10 text-teal-700', TIPO: 'bg-blue-500/10 text-blue-600',
  COBERTURA: 'bg-amber-500/10 text-amber-700', TECNICO: 'bg-gray-500/10 text-gray-600',
  GARAGEM: 'bg-orange-500/10 text-orange-600', OUTRO: 'bg-purple-500/10 text-purple-600',
};
// §8 Status Badge = texto simples colorido. Reaproveita a cor de texto das
// paletas acima (bg+text combinados) extraindo só o token `text-*`.
const textColor = (style?: string) => style?.split(' ').find(c => c.startsWith('text-')) ?? 'text-gray-600';
type SortCol = 'name' | 'floor' | 'floor_tipo' | 'typology' | 'private_area' | 'common_area' | 'bedrooms' | 'bathrooms' | 'suites' | 'parking_spaces' | 'position_type' | 'view_type' | 'sun_orientation';

// Estado da edição inline na tabela — mesmas chaves do formulário do painel.
const emptyForm = emptyUnitFormValues;
const emptyBulkForm = () => ({
  floor: '', floor_tipo: '' as FloorTipo | '',
  typology: '', private_area: '', common_area: '', bedrooms: '', bathrooms: '', suites: '', parking_spaces: '',
  position_type: '' as UnitPositionType | '', view_type: '' as UnitViewType | '',
  sun_orientation: '' as UnitSunOrientation | '',
  // Eixo de locação (independente do de venda) — ver migration 20270815000003
  rental_price: '', rental_status: '' as RentalUnitStatus | '',
});

/** Campo da edição em lote: h-9 como todo campo do app. */
const loteCls = 'h-9 px-2.5 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white';

const fmtArea = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const emptyGenForm = (tower: EmpreendimentoTower) => ({
  floors_count: tower.floors_count?.toString() ?? '',
  units_per_floor: tower.units_per_floor?.toString() ?? '',
  start_floor: '1', prefix: '', typology: '',
  private_area: '', common_area: '', parking_spaces: '', price: '', rental_price: '',
});

/** Quantas unidades os pavimentos descrevem — mesma conta do gerador (generateUnitsFromFloors). */
const unidadesDosPavimentos = (floors: EmpreendimentoFloor[], tower: EmpreendimentoTower) =>
  floors.reduce((s, f) => s + f.repeat_count * (f.units_per_floor ?? tower.units_per_floor ?? 1), 0);

// Larguras padrão das colunas (25/11/2026, §6.1 — "implementar botão de ajuste automático de largura de colunas";
// docs/planos/2026-11-25-unidades-grupo-colunas-autofit.md). Soma ~1.700 px: a tabela já rolava na horizontal em
// 1600 px; o ajuste ao conteúdo (MoveHorizontal) encolhe o que sobra e a folga vai para o espaçador antes de Ações.
const COL_WIDTHS: Record<string, number> = {
  name: 140, floor: 80, floor_tipo: 110, elevacao: 120, typology: 110, private_area: 100, common_area: 110,
  bedrooms: 120, bathrooms: 115, suites: 90, parking_spaces: 85, position_type: 100, view_type: 100, sun_orientation: 100,
  actions: 190,
};
const COLUNAS_DE_DADO = Object.keys(COL_WIDTHS).filter(k => k !== 'actions');
/** As colunas do seletor (a engrenagem), na ordem da tabela. Unidade fica sempre — não entra na lista do seletor. */
const COLUNAS_DA_TABELA: ColumnConfig[] = [
  { key: 'name', label: 'Unidade' }, { key: 'floor', label: 'Pavimento' }, { key: 'floor_tipo', label: 'Tipo do pavimento' },
  { key: 'elevacao', label: 'Elevação' }, { key: 'typology', label: 'Tipologia' }, { key: 'private_area', label: 'Área privativa (m²)' },
  { key: 'common_area', label: 'Área comum (m²)' }, { key: 'bedrooms', label: 'Dormitórios' }, { key: 'bathrooms', label: 'Banheiros' },
  { key: 'suites', label: 'Suítes' }, { key: 'parking_spaces', label: 'Vagas' }, { key: 'position_type', label: 'Posição' },
  { key: 'view_type', label: 'Vista' }, { key: 'sun_orientation', label: 'Orientação' },
];
const LARGURA_CHECKBOX = 40;

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tower: EmpreendimentoTower;
  /** Pavimentos cadastrados na torre (FloorEditor) — base de "Gerar a partir dos pavimentos". */
  floors?: EmpreendimentoFloor[];
  onUnitsChange?: (towerId: string, units: EmpreendimentoUnit[]) => void;
  /** A torre mudou aqui (28/10/2026: como a Planta arruma as unidades) — o pai atualiza a lista sem recarregar (§22). */
  onTowerChange?: (towerId: string, campos: Partial<EmpreendimentoTower>) => void;
}

// ── Componente principal ─────────────────────────────────────────────────────

/** Estável: o padrão `[]` novo a cada render refaria o cálculo da elevação a cada render. */
const SEM_PAVIMENTOS: EmpreendimentoFloor[] = [];

export const UnitEditor: React.FC<Props> = ({ tower, floors = SEM_PAVIMENTOS, onUnitsChange, onTowerChange }) => {
  const confirm = useConfirm();
  const [units, setUnits] = React.useState<EmpreendimentoUnit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Painel aberto — um só por vez (UI_PATTERNS §4: nada de drawer sobre drawer).
  const [painel, setPainel] = React.useState<'nova' | 'serie' | 'pavimentos' | null>(null);
  // "Gerar a partir dos pavimentos": a 1ª unidade de cada andar (texto do campo; vazio = 1).
  const [numeroInicial, setNumeroInicial] = React.useState('1');

  // "Nova unidade"
  const [form, setForm] = React.useState<UnitFormValues>(emptyUnitFormValues());
  const [erroNome, setErroNome] = React.useState<string | undefined>();
  const nova = useUnsavedChanges();

  // Inline edit
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState({ ...emptyForm(), floor_id: '' });

  // "Gerar em série" e "Gerar a partir dos pavimentos"
  const [genForm, setGenForm] = React.useState(() => emptyGenForm(tower));
  const serie = useUnsavedChanges();
  const [generating, setGenerating] = React.useState(false);

  // Ordenação
  const [sortCol, setSortCol] = React.useState<SortCol>('floor');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  // Agrupar (§6.12, 25/11/2026): abre por Pavimento, como sempre foi; o usuário troca o campo, a ordem dos
  // grupos e recolhe/expande todos. A escolha fica no navegador e vale para todas as torres.
  const agrupamento = useAgrupamento<CampoAgruparUnidade>('empreendimentoUnidades:agrupar', undefined, 'pavimento');

  // Colunas redimensionáveis + ajuste ao conteúdo (§6.1/§6.1.2), larguras guardadas no navegador.
  const cols = useResizableColumns(COL_WIDTHS, 'empreendimentoUnidadesColWidths');
  // Seletor de colunas (25/11/2026, "adicione seletor de colunas"): Unidade e Ações ficam sempre.
  const colunas = useTableColumns(COLUNAS_DA_TABELA, 'empreendimentoUnidadesColunas');
  const vis = (k: string) => k === 'name' || colunas.visibleColumns.includes(k);
  const colunasVisiveis = COLUNAS_DE_DADO.filter(vis);
  const larguraDaTabela = LARGURA_CHECKBOX + colunasVisiveis.reduce((s, k) => s + cols.getWidth(k), 0) + cols.getWidth('actions');
  // Cabeçalho do grupo e total: o rótulo ocupa as colunas até a 1ª área visível; cada área fica na coluna dela
  // (Priv. e Comum são vizinhas); o resto, mais o espaçador (e Ações, no total), numa célula só.
  const posicoesDasAreas = (['private_area', 'common_area'] as const).map(k => colunasVisiveis.indexOf(k)).filter(i => i >= 0);
  const spanDoRotulo = posicoesDasAreas.length ? Math.min(...posicoesDasAreas) : colunasVisiveis.length;
  const celulasDasAreas = (priv: number, comum: number, cls: string, alemDoEspacador = 0) => (
    <>
      {vis('private_area') && <td className={`${cls} text-blue-600`}>{priv > 0 ? `${fmtArea(priv)} m²` : '—'}</td>}
      {vis('common_area') && <td className={`${cls} text-teal-600`}>{comum > 0 ? `${fmtArea(comum)} m²` : '—'}</td>}
      <td colSpan={colunasVisiveis.length - spanDoRotulo - posicoesDasAreas.length + 1 + alemDoEspacador} />
    </>
  );

  // Seleção em lote
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkForm, setBulkForm] = React.useState(emptyBulkForm());
  const [bulkSaving, setBulkSaving] = React.useState(false);

  // Toast (§13) — quem desenha é o ToastProvider da raiz.
  const { showToast } = useToast();
  const notify = (msg: string, type: 'success' | 'error' = 'success') => showToast(msg, type);

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setUnits(await empreendimentoService.listUnits(tower.id));
    } catch (err) {
      console.error('[UnitEditor] erro ao carregar unidades:', err);
    } finally {
      setLoading(false);
    }
  }, [tower.id]);

  React.useEffect(() => { load(); }, [load]);
  // Só avisa o pai depois de carregar (25/11/2026): o pai já tem as unidades da torre (TowerEditor carrega todas na
  // entrada), e o `[]` do 1º render zerava as contagens dele até a lista chegar.
  React.useEffect(() => { if (!loading) onUnitsChange?.(tower.id, units); }, [units, loading, tower.id, onUnitsChange]);

  // ── Sort + Group ────────────────────────────────────────────────────────────

  const sortFn = React.useCallback((a: EmpreendimentoUnit, b: EmpreendimentoUnit) => {
    let va: any, vb: any;
    switch (sortCol) {
      case 'name':          va = a.name;              vb = b.name; break;
      case 'floor':         va = a.floor ?? -999;     vb = b.floor ?? -999; break;
      case 'floor_tipo':    va = a.floor_tipo ?? '';  vb = b.floor_tipo ?? ''; break;
      case 'typology':      va = a.typology ?? '';    vb = b.typology ?? ''; break;
      case 'private_area':  va = a.private_area ?? 0; vb = b.private_area ?? 0; break;
      case 'common_area':   va = a.common_area ?? 0;  vb = b.common_area ?? 0; break;
      case 'bedrooms':      va = a.bedrooms ?? 0;     vb = b.bedrooms ?? 0; break;
      case 'bathrooms':     va = a.bathrooms ?? 0;    vb = b.bathrooms ?? 0; break;
      case 'suites':        va = a.suites ?? 0;       vb = b.suites ?? 0; break;
      case 'parking_spaces':va = a.parking_spaces ?? 0; vb = b.parking_spaces ?? 0; break;
      case 'position_type': va = a.position_type ?? ''; vb = b.position_type ?? ''; break;
      case 'view_type':     va = a.view_type ?? '';   vb = b.view_type ?? ''; break;
      case 'sun_orientation': va = a.sun_orientation ?? ''; vb = b.sun_orientation ?? ''; break;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  }, [sortCol, sortDir]);

  // A elevação de cada pavimento no cabeçalho do grupo (27/10/2026, "aonde está a coluna elevação?"): a torre sem
  // pavimentos cadastrados (o Garden) só tem andares pelas unidades, e a tabela de Pavimentos fica vazia. O cálculo é
  // o mesmo da tabela de Pavimentos e da massa da Planta (`estruturaDaTorre`).
  const elevacaoDoAndar = React.useMemo(() => {
    const e = estruturaDaTorre(
      { id: tower.id, name: tower.name, floors_count: tower.floors_count, pe_direito_padrao_m: tower.pe_direito_padrao_m, elevacao_terreo_m: tower.elevacao_terreo_m, units },
      floors,
    );
    return new Map([...e.garagens, ...e.acima].map(p => [p.numero, p]));
  }, [tower.id, tower.name, tower.floors_count, tower.pe_direito_padrao_m, tower.elevacao_terreo_m, units, floors]);
  // Os grupos do Agrupar (`utils/unidadesGrupos.ts`). As unidades entram já ordenadas pela coluna da tabela;
  // no empate (a coluna Pavimento, a padrão), a ordem do pavimento — a que a massa da Planta segue.
  // Sem agrupamento, um grupo só, sem cabeçalho.
  const groups = React.useMemo(() => {
    const ordenadas = [...units].sort((a, b) => sortFn(a, b) || compararNaOrdemDoEmpreendimento(a, b));
    const grupos = agrupamento.agrupando
      ? agruparUnidades(ordenadas, agrupamento.campo as CampoAgruparUnidade, agrupamento.direcao, {
          // O nome do pavimento como está na seção Pavimentos (28/10/2026: "Pavimento -4" confundia com
          // "Estacionamento 2"); sem cadastro, o nome que a estrutura dá ao andar.
          nomeDoAndar: andar => elevacaoDoAndar.get(andar)?.nome,
          // O mesmo texto da coluna Elevação (`textoDaElevacao`).
          elevacaoDoAndar: andar => {
            const p = elevacaoDoAndar.get(andar);
            return p ? { mm: p.elevacaoMm, texto: `${fmtElevacao(p.elevacaoMm / 1000)} m${p.elevacaoDigitada ? '' : ' (calc.)'}` } : undefined;
          },
          tipoDoPavimento: FLOOR_TIPO_LABEL, posicao: POSITION_LABEL, vista: VIEW_LABEL, orientacao: SUN_LABEL,
        })
      : [{ key: '__todas__', label: '', itens: ordenadas, total: 0 }];
    return grupos.map(g => ({
      key: g.key,
      label: g.label,
      units: g.itens,
      totalPriv: g.itens.reduce((s, u) => s + (u.private_area ?? 0), 0),
      totalComum: g.itens.reduce((s, u) => s + (u.common_area ?? 0), 0),
    }));
  }, [units, sortFn, agrupamento.agrupando, agrupamento.campo, agrupamento.direcao, elevacaoDoAndar]);
  const porPavimento = agrupamento.campo === 'pavimento';

  /** A elevação do andar para a coluna da unidade: "+2,70 m", "(calc.)" quando calculada, "—" sem andar. */
  const textoDaElevacao = (andar: number | null) => {
    const piso = andar == null || !Number.isFinite(andar) ? undefined : elevacaoDoAndar.get(andar);
    if (!piso) return '—';
    return `${fmtElevacao(piso.elevacaoMm / 1000)} m${piso.elevacaoDigitada ? '' : ' (calc.)'}`;
  };

  // ── Seleção ─────────────────────────────────────────────────────────────────

  const allSelected = units.length > 0 && units.every(u => selected.has(u.id));
  const someSelected = units.some(u => selected.has(u.id)) && !allSelected;

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(units.map(u => u.id)));
  };
  const toggleSelectGroup = (grpUnits: EmpreendimentoUnit[]) => {
    const allInGroup = grpUnits.every(u => selected.has(u.id));
    setSelected(prev => {
      const next = new Set(prev);
      grpUnits.forEach(u => allInGroup ? next.delete(u.id) : next.add(u.id));
      return next;
    });
  };
  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // ── Handlers CRUD ──────────────────────────────────────────────────────────

  const abrirNova = () => {
    setForm(emptyUnitFormValues());
    setErroNome(undefined);
    nova.markSaved();
    setPainel('nova');
  };
  const fecharNova = () => { setPainel(null); setErroNome(undefined); nova.markSaved(); };
  const pedirFecharNova = async () => { if (await nova.confirmDiscard()) fecharNova(); };
  const patchForm = (patch: Partial<UnitFormValues>) => {
    setForm(p => ({ ...p, ...patch }));
    if ('name' in patch) setErroNome(undefined);
    nova.markDirty();
  };

  const handleCreate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim()) { setErroNome('Informe a identificação da unidade.'); return; }
    setSaving(true);
    try {
      const saved = await empreendimentoService.createUnit({
        tower_id: tower.id, ...unitFormToPayload(form),
        status: 'DISPONIVEL', rental_status: 'DISPONIVEL', is_vendavel: true, sort_order: units.length,
      });
      setUnits(prev => [...prev, saved]);   // §22 — sem recarregar a lista
      notify(`Unidade ${saved.name} criada.`);
      fecharNova();
    } catch (err: any) { notify(`Erro ao adicionar: ${err.message}`, 'error'); }
    finally { setSaving(false); }
  };

  const startEdit = (u: EmpreendimentoUnit) => {
    setEditingId(u.id);
    setEditForm({
      name: u.name, floor: u.floor?.toString() ?? '',
      typology: u.typology ?? '', private_area: u.private_area?.toString() ?? '',
      common_area: u.common_area?.toString() ?? '',
      bedrooms: u.bedrooms?.toString() ?? '', bathrooms: u.bathrooms?.toString() ?? '', suites: u.suites?.toString() ?? '',
      parking_spaces: u.parking_spaces?.toString() ?? '', floor_tipo: u.floor_tipo ?? '',
      floor_id: u.floor_id ?? '',
      position_type: u.position_type ?? '', view_type: u.view_type ?? '',
      sun_orientation: u.sun_orientation ?? '',
    });
  };

  const handleSaveEdit = async (u: EmpreendimentoUnit) => {
    if (!editForm.name.trim()) { notify('Informe o nome da unidade.', 'error'); return; }
    try {
      const priv = editForm.private_area ? Number(editForm.private_area) : undefined;
      const common = editForm.common_area ? Number(editForm.common_area) : undefined;
      const updated = {
        name: editForm.name.trim(), floor: editForm.floor ? Number(editForm.floor) : undefined,
        floor_tipo: (editForm.floor_tipo || null) as FloorTipo | null,
        typology: editForm.typology || undefined, private_area: priv, common_area: common,
        total_area: priv !== undefined || common !== undefined ? (priv ?? 0) + (common ?? 0) : undefined,
        bedrooms: editForm.bedrooms ? Number(editForm.bedrooms) : undefined,
        bathrooms: editForm.bathrooms ? Number(editForm.bathrooms) : undefined,
        suites: editForm.suites ? Number(editForm.suites) : undefined,
        parking_spaces: editForm.parking_spaces ? Number(editForm.parking_spaces) : undefined,
        position_type: (editForm.position_type || null) as UnitPositionType | null,
        view_type: (editForm.view_type || null) as UnitViewType | null,
        sun_orientation: (editForm.sun_orientation || null) as UnitSunOrientation | null,
        floor_id: editForm.floor_id || null,
      };
      await empreendimentoService.updateUnit(u.id, updated);
      setUnits(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x));
      setEditingId(null);
    } catch (err: any) { notify(`Erro ao salvar: ${err.message}`, 'error'); }
  };

  const handleDuplicate = async (u: EmpreendimentoUnit) => {
    try {
      const created = await empreendimentoService.createUnit({
        tower_id: tower.id, name: `${u.name} (cópia)`,
        floor: u.floor ?? undefined, floor_tipo: u.floor_tipo ?? undefined,
        typology: u.typology ?? undefined, private_area: u.private_area ?? undefined,
        common_area: u.common_area ?? undefined, total_area: u.total_area ?? undefined,
        price: u.price ?? undefined, rental_price: u.rental_price ?? undefined,
        bedrooms: u.bedrooms ?? undefined,
        bathrooms: u.bathrooms ?? undefined, suites: u.suites ?? undefined, parking_spaces: u.parking_spaces ?? undefined,
        status: 'DISPONIVEL', rental_status: 'DISPONIVEL', is_vendavel: true, sort_order: units.length,
      });
      setUnits(prev => [...prev, created]);
    } catch (err: any) { notify(`Erro ao duplicar: ${err.message}`, 'error'); }
  };

  const handleDelete = async (unit: EmpreendimentoUnit) => {
    const ok = await confirm({
      title: 'Excluir unidade?',
      message: `A unidade "${unit.name}" será removida. Essa ação não pode ser desfeita.`,
      variant: 'danger', confirmLabel: 'Excluir',
    });
    if (!ok) return;
    try {
      await empreendimentoService.deleteUnit(unit.id);
      setUnits(prev => prev.filter(u => u.id !== unit.id));
      setSelected(prev => { const n = new Set(prev); n.delete(unit.id); return n; });
    } catch (err: any) { notify(`Erro ao excluir: ${err.message}`, 'error'); }
  };

  // ── Como a Planta arruma as unidades desta torre (28/10/2026) ───────────────
  // "implemente opção de ordenação de duas maneiras pelas setas ou pela posição. O usuário escolhe" — decisão: "Nos
  // dois". Aqui é o padrão da torre (`ordem_das_unidades_na_planta`); na Planta, cada usuário pode trocar só para si.
  const ordemGravada: OrdemDasUnidadesNaPlanta = tower.ordem_das_unidades_na_planta === 'SETAS' || tower.ordem_das_unidades_na_planta === 'ARRASTO' ? tower.ordem_das_unidades_na_planta : 'POSICAO';
  const [ordemNaPlanta, setOrdemNaPlanta] = React.useState<OrdemDasUnidadesNaPlanta>(ordemGravada);
  React.useEffect(() => {
    setOrdemNaPlanta(ordemGravada);
  }, [ordemGravada]);
  const [gravandoOrdemNaPlanta, setGravandoOrdemNaPlanta] = React.useState(false);
  const escolherOrdemNaPlanta = async (ordem: OrdemDasUnidadesNaPlanta) => {
    if (ordem === ordemNaPlanta) return;
    const antes = ordemNaPlanta;
    setOrdemNaPlanta(ordem);
    setGravandoOrdemNaPlanta(true);
    try {
      await empreendimentoService.updateTower(tower.id, { ordem_das_unidades_na_planta: ordem });
      onTowerChange?.(tower.id, { ordem_das_unidades_na_planta: ordem });
      notify(`${tower.name}: a Planta arruma as unidades ${ordem === 'SETAS' ? 'pelas setas' : ordem === 'ARRASTO' ? 'como foram arrastadas na planta' : 'pela posição'}.`);
    } catch (err: any) {
      setOrdemNaPlanta(antes);
      notify(`Erro ao gravar a escolha: ${err.message}`, 'error');
    } finally {
      setGravandoOrdemNaPlanta(false);
    }
  };

  // ── Ordem das unidades no pavimento ─────────────────────────────────────────
  // A ordem MANUAL da massa da Planta (27/10/2026; "Pelas setas" desde 28/10/2026): as setas trocam a unidade com a
  // vizinha; "Ordenar por número" grava a ordem automática. Só pela coluna Pavimento: com a tabela ordenada por
  // outra coluna, a posição na tela não é a do pavimento.
  const [ordenando, setOrdenando] = React.useState(false);
  const ordemDoPavimentoNaTela = sortCol === 'floor';
  const gravarOrdem = async (mudancas: NovaOrdem[]) => {
    if (mudancas.length === 0) return;
    setOrdenando(true);
    try {
      await Promise.all(mudancas.map(m => empreendimentoService.updateUnit(m.id, { sort_order: m.sort_order })));
      const porId = new Map(mudancas.map(m => [m.id, m.sort_order]));
      setUnits(prev => prev.map(u => (porId.has(u.id) ? { ...u, sort_order: porId.get(u.id)! } : u)));
    } catch (err: any) {
      notify(`Erro ao gravar a ordem: ${err.message}`, 'error');
      await load();
    } finally {
      setOrdenando(false);
    }
  };
  const motivoSemSetas = (grpUnits: EmpreendimentoUnit[], i: number, passo: -1 | 1): string | null => {
    // A vizinha da seta é a do grupo na tela: só agrupado por Pavimento ela é a vizinha no pavimento (25/11/2026).
    if (!porPavimento) return 'Agrupe por Pavimento para mudar a ordem';
    if (!ordemDoPavimentoNaTela) return 'Ordene a tabela pela coluna Pavimento para mudar a ordem';
    if (ordenando) return 'Gravando a ordem…';
    if (passo === -1 && i === 0) return 'Já é a primeira do pavimento';
    if (passo === 1 && i === grpUnits.length - 1) return 'Já é a última do pavimento';
    return null;
  };

  // ── Bulk save ───────────────────────────────────────────────────────────────

  const handleBulkSave = async () => {
    const hasAny = bulkForm.floor || bulkForm.floor_tipo || bulkForm.typology.trim()
      || bulkForm.private_area || bulkForm.common_area || bulkForm.bedrooms || bulkForm.bathrooms || bulkForm.suites || bulkForm.parking_spaces
      || bulkForm.position_type || bulkForm.view_type || bulkForm.sun_orientation
      || bulkForm.rental_price || bulkForm.rental_status;
    if (!hasAny) { notify('Preencha pelo menos um campo para aplicar em lote.', 'error'); return; }
    setBulkSaving(true);
    // Monta o patch de uma unidade aplicando só os campos preenchidos no bulkForm
    const buildUpd = (unit: EmpreendimentoUnit): Record<string, any> => {
      const upd: Record<string, any> = {};
      if (bulkForm.floor) upd.floor = Number(bulkForm.floor);
      if (bulkForm.floor_tipo) upd.floor_tipo = bulkForm.floor_tipo;
      if (bulkForm.typology.trim()) upd.typology = bulkForm.typology.trim();
      if (bulkForm.bedrooms) upd.bedrooms = Number(bulkForm.bedrooms);
      if (bulkForm.bathrooms) upd.bathrooms = Number(bulkForm.bathrooms);
      if (bulkForm.suites) upd.suites = Number(bulkForm.suites);
      if (bulkForm.parking_spaces) upd.parking_spaces = Number(bulkForm.parking_spaces);
      if (bulkForm.position_type) upd.position_type = bulkForm.position_type;
      if (bulkForm.view_type) upd.view_type = bulkForm.view_type;
      if (bulkForm.sun_orientation) upd.sun_orientation = bulkForm.sun_orientation;
      if (bulkForm.rental_price) upd.rental_price = Number(bulkForm.rental_price);
      if (bulkForm.rental_status) upd.rental_status = bulkForm.rental_status;
      const priv = bulkForm.private_area ? Number(bulkForm.private_area) : unit.private_area;
      const comum = bulkForm.common_area ? Number(bulkForm.common_area) : unit.common_area;
      if (bulkForm.private_area) upd.private_area = priv;
      if (bulkForm.common_area) upd.common_area = comum;
      if (bulkForm.private_area || bulkForm.common_area) upd.total_area = (priv ?? 0) + (comum ?? 0);
      return upd;
    };
    try {
      await Promise.all(Array.from(selected).map(id => {
        const unit = units.find(u => u.id === id)!;
        return empreendimentoService.updateUnit(id, buildUpd(unit));
      }));
      setUnits(prev => prev.map(u => selected.has(u.id) ? { ...u, ...buildUpd(u) } : u));
      setSelected(new Set());
      setBulkForm(emptyBulkForm());
    } catch (err: any) { notify(`Erro ao salvar em lote: ${err.message}`, 'error'); }
    finally { setBulkSaving(false); }
  };

  // ── Geração automática ──────────────────────────────────────────────────────

  const totalDosPavimentos = unidadesDosPavimentos(floors, tower);

  const abrirGerarDosPavimentos = () => {
    if (floors.length === 0) return;
    setNumeroInicial('1');
    setPainel('pavimentos');
  };
  const numeroInicialLido = lerNumeroInicial(numeroInicial);
  const faixasDaPrevia = React.useMemo(
    () => (painel === 'pavimentos' && numeroInicialLido !== null ? faixasPorAndar(montarUnidadesDosPavimentos(tower, floors, numeroInicialLido)) : []),
    [painel, numeroInicialLido, tower, floors],
  );

  const handleGenerateFromFloors = async (e: React.FormEvent) => {
    e.preventDefault();
    if (floors.length === 0 || numeroInicialLido === null) return;
    setGenerating(true);
    try {
      await empreendimentoService.deleteUnitsByTower(tower.id);
      const criadas = await empreendimentoService.generateUnitsFromFloors(tower, numeroInicialLido);
      setUnits(criadas);
      setSelected(new Set());
      setPainel(null);
      notify(`${criadas.length} unidades geradas a partir dos pavimentos.`);
    } catch (err: any) {
      notify(`Erro ao gerar unidades: ${err.message}`, 'error');
    } finally { setGenerating(false); }
  };

  const abrirSerie = () => {
    setGenForm(emptyGenForm(tower));
    serie.markSaved();
    setPainel('serie');
  };
  const fecharSerie = () => { setPainel(null); serie.markSaved(); };
  const pedirFecharSerie = async () => { if (await serie.confirmDiscard()) fecharSerie(); };
  const patchGen = (patch: Partial<ReturnType<typeof emptyGenForm>>) => {
    setGenForm(p => ({ ...p, ...patch }));
    serie.markDirty();
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const nPav = Number(genForm.floors_count), perFloor = Number(genForm.units_per_floor);
    const startFloor = Number(genForm.start_floor);
    if (!nPav || !perFloor) { notify('Informe número de pavimentos e unidades por pavimento.', 'error'); return; }
    if (nPav > 100 || perFloor > 50) { notify('Máx 100 pav / 50 un/pav.', 'error'); return; }
    const ok = await confirm({
      title: 'Gerar unidades?',
      message: `${nPav * perFloor} unidades serão acrescentadas a "${tower.name}". As existentes continuam.`,
      variant: 'warning', confirmLabel: 'Gerar',
    });
    if (!ok) return;
    setGenerating(true);
    try {
      const toCreate: EmpreendimentoUnitInsert[] = [];
      for (let f = 0; f < nPav; f++) {
        const floorNum = startFloor + f;
        for (let u = 1; u <= perFloor; u++) {
          const priv = genForm.private_area ? Number(genForm.private_area) : undefined;
          const common = genForm.common_area ? Number(genForm.common_area) : undefined;
          const prefix = genForm.prefix ? `${genForm.prefix}-` : '';
          toCreate.push({
            tower_id: tower.id,
            name: `${prefix}${floorNum}${String(u).padStart(2, '0')}`,
            floor: floorNum, typology: genForm.typology || undefined,
            private_area: priv, common_area: common,
            total_area: priv !== undefined || common !== undefined ? (priv ?? 0) + (common ?? 0) : undefined,
            price: genForm.price ? Number(genForm.price) : undefined,
            rental_price: genForm.rental_price ? Number(genForm.rental_price) : undefined,
            parking_spaces: genForm.parking_spaces ? Number(genForm.parking_spaces) : undefined,
            status: 'DISPONIVEL', rental_status: 'DISPONIVEL', is_vendavel: true, sort_order: units.length + toCreate.length,
          });
        }
      }
      const criadas = await empreendimentoService.bulkUpsertUnits(toCreate);
      setUnits(prev => [...prev, ...criadas]);
      notify(`${criadas.length} unidades acrescentadas.`);
      fecharSerie();
    } catch (err: any) { notify(`Erro ao gerar: ${err.message}`, 'error'); }
    finally { setGenerating(false); }
  };

  // ── Utilidades de ordenação ─────────────────────────────────────────────────

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const genTotal = (Number(genForm.floors_count) || 0) * (Number(genForm.units_per_floor) || 0);

  const inputCls = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
  const rotuloCls = 'text-xs font-semibold text-slate-500';
  const semPavimentos = floors.length === 0;
  const motivoSemPavimentos = 'Cadastre os pavimentos desta torre na seção acima para gerar as unidades a partir deles.';
  const editCls = 'px-2 py-1 border border-blue-200 rounded-[6px] text-sm font-normal outline-none focus:border-blue-400 bg-white w-full';

  // Totais gerais
  const totalPriv = units.reduce((s, u) => s + (u.private_area ?? 0), 0);
  const totalComum = units.reduce((s, u) => s + (u.common_area ?? 0), 0);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <SecaoTitulo
        icon={Home}
        titulo="Unidades"
        resumo={units.length > 0 ? `${units.length} unid.` : undefined}
        acoes={<>
          {/* span: botão desabilitado não mostra `title` em todo navegador — o motivo fica no invólucro */}
          <span title={semPavimentos ? motivoSemPavimentos : 'Substitui as unidades desta torre pelas que os pavimentos descrevem'}>
            <Button variant="secondary" onClick={abrirGerarDosPavimentos} disabled={semPavimentos || generating}>
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-[15px] h-[15px]" />}
              Gerar a partir dos pavimentos{!semPavimentos ? ` (${totalDosPavimentos})` : ''}
            </Button>
          </span>
          <Button variant="secondary" onClick={abrirSerie} title="Acrescenta unidades numeradas em série (ex.: 101 a 1504), sem usar os pavimentos">
            <ListPlus className="w-[15px] h-[15px]" /> Gerar em série
          </Button>
          <Button onClick={abrirNova}>
            <Plus className="w-[15px] h-[15px]" /> Nova unidade
          </Button>
        </>}
      />

      {/* Como a Planta Inteligente arruma as unidades desta torre no pavimento (28/10/2026). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid="ordem-na-planta">
        <span className="font-semibold text-slate-600">Na Planta Inteligente, arrumar as unidades:</span>
        <div className="flex gap-1" role="group" aria-label="Como a Planta arruma as unidades desta torre">
          {([['POSICAO', 'Pela posição'], ['SETAS', 'Pelas setas'], ['ARRASTO', 'Arrastado na planta']] as const).map(([ordem, rotulo]) => (
            <span key={ordem} title={gravandoOrdemNaPlanta ? 'Gravando a escolha…' : undefined}>
              <button
                type="button"
                aria-pressed={ordemNaPlanta === ordem}
                disabled={gravandoOrdemNaPlanta}
                onClick={() => escolherOrdemNaPlanta(ordem)}
                className={`rounded-[6px] border px-2 py-1 font-medium transition-colors disabled:pointer-events-none ${
                  ordemNaPlanta === ordem ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:text-blue-600'
                }`}
              >
                {rotulo}
              </button>
            </span>
          ))}
        </div>
        <span className="text-slate-500">
          {ordemNaPlanta === 'SETAS'
            ? 'Na ordem das setas ↑↓ de cada pavimento: a 1ª metade numa fileira, a 2ª na outra. Posição e Orientação não mudam a Planta.'
            : ordemNaPlanta === 'ARRASTO'
              ? 'Onde cada unidade foi arrastada na planta baixa da Planta Inteligente; pavimento nunca arrastado, pela posição.'
              : 'Pela Posição e a Orientação de cada unidade; sem elas, pelo número (101, 102…). As setas ↑↓ não mudam a Planta.'}
          {' '}Cada usuário pode trocar só para si, na Planta.
        </span>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : units.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Layers className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-xs font-semibold">Nenhuma unidade cadastrada nesta torre.</p>
          <p className="text-xs mt-1">Use os botões acima: gere a partir dos pavimentos, gere em série ou cadastre uma a uma.</p>
        </div>
      ) : (
        <>
        {/* Agrupar (§6.12, 25/11/2026): campo, ordem dos grupos e recolher/expandir todos, logo acima da tabela. */}
        <div className="flex flex-wrap items-center gap-2" data-testid="agrupar-unidades">
          <AgruparControles
            opcoes={OPCOES_AGRUPAR_UNIDADE}
            campo={agrupamento.campo}
            onCampo={agrupamento.setCampo}
            direcao={agrupamento.direcao}
            onDirecao={agrupamento.setDirecao}
            chavesDosGrupos={groups.map(g => g.key)}
            algumRecolhido={agrupamento.recolhidos.size > 0}
            onAlternarTodos={agrupamento.alternarTodos}
            title="Agrupar as unidades"
          />
          {/* Configurar as colunas (§5.1): quais aparecem + ajustar a largura ao conteúdo (§6.1.2, sob comando). */}
          <div className="flex items-center h-9 bg-white px-1 rounded-[10px] border border-gray-200 gap-1 shrink-0">
            <ColumnConfigButton
              columns={COLUNAS_DA_TABELA.filter(c => c.key !== 'name')}
              visibleColumns={colunas.visibleColumns}
              showColumnConfig={colunas.showColumnConfig}
              onToggleShow={() => colunas.setShowColumnConfig(!colunas.showColumnConfig)}
              onToggleColumn={colunas.toggleColumn}
              onReset={colunas.resetColumns}
            />
            <button
              type="button"
              onClick={() => cols.autoFit()}
              title="Ajustar largura das colunas ao conteúdo"
              aria-label="Ajustar largura das colunas ao conteúdo"
              className="p-1.5 rounded-[6px] text-gray-500 hover:text-gray-700 transition-all"
            >
              <MoveHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
          {/* Nunca w-full com colunas redimensionáveis (§6.1): largura = soma exata, minWidth 100% dá a folga ao espaçador. */}
          <table ref={cols.tableRef} className="text-left text-xs" style={{ tableLayout: 'fixed', width: larguraDaTabela, minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: `${LARGURA_CHECKBOX}px` }} />
              {colunasVisiveis.map(k => <col key={k} data-col-key={k} style={{ width: `${cols.getWidth(k)}px` }} />)}
              {/* espaçador ANTES de Ações (§6.1.1): absorve a folga e Ações fica na borda direita */}
              <col />
              <col data-col-key="actions" style={{ width: `${cols.getWidth('actions')}px` }} />
            </colgroup>
            <thead>
              <tr className="bg-white text-gray-700 font-semibold text-xs border-b border-gray-200">
                {/* Checkbox select-all */}
                <th className="py-3 px-3 w-10 border-r border-gray-100">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                  />
                </th>
                <SortableHeader col="name" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="name" />}>Unidade</SortableHeader>
                {vis('floor') && <SortableHeader col="floor" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="floor" />}>Pav.</SortableHeader>}
                {vis('floor_tipo') && <SortableHeader col="floor_tipo" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="floor_tipo" />}>Tipo Pav.</SortableHeader>}
                {/* Elevação do andar da unidade (28/10/2026): a mesma da seção Pavimentos — calculada ou digitada. */}
                {vis('elevacao') && <th className="relative overflow-hidden py-2.5 px-4 text-table-header font-semibold text-gray-700 whitespace-nowrap border-r border-gray-100">Elevação<cols.ResizeHandle colKey="elevacao" /></th>}
                {vis('typology') && <SortableHeader col="typology" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="typology" />}>Tipologia</SortableHeader>}
                {vis('private_area') && <SortableHeader col="private_area" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="private_area" />}>Priv. m²</SortableHeader>}
                {vis('common_area') && <SortableHeader col="common_area" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="common_area" />}>Comum m²</SortableHeader>}
                {vis('bedrooms') && <SortableHeader col="bedrooms" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="bedrooms" />}>Dormitórios</SortableHeader>}
                {vis('bathrooms') && <SortableHeader col="bathrooms" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="bathrooms" />}>Banheiros</SortableHeader>}
                {vis('suites') && <SortableHeader col="suites" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="suites" />}>Suítes</SortableHeader>}
                {vis('parking_spaces') && <SortableHeader col="parking_spaces" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="parking_spaces" />}>Vagas</SortableHeader>}
                {vis('position_type') && <SortableHeader col="position_type" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="position_type" />}>Posição</SortableHeader>}
                {vis('view_type') && <SortableHeader col="view_type" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="view_type" />}>Vista</SortableHeader>}
                {vis('sun_orientation') && <SortableHeader col="sun_orientation" current={sortCol} dir={sortDir} onSort={handleSort} resize={<cols.ResizeHandle colKey="sun_orientation" />}>Orient.</SortableHeader>}
                <th aria-hidden="true" className="border-r border-gray-100"></th>
                <th className="py-2.5 px-4 text-center text-table-header font-semibold text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {groups.map(group => {
                const collapsed = agrupamento.recolhidos.has(group.key);
                const allGroupSelected = group.units.every(u => selected.has(u.id));
                // Grupo de UM pavimento: o cabeçalho traz o andar, a elevação e o "Ordenar por número".
                const andarDoGrupo = porPavimento && group.key !== CHAVE_VAZIA ? Number(group.key) : null;
                return (
                  <React.Fragment key={group.key}>
                    {/* Cabeçalho do grupo — sem agrupamento, a lista corre sem ele */}
                    {agrupamento.agrupando && (
                    <tr className="bg-gray-50/70 hover:bg-gray-100/60 transition-colors">
                      {/* Checkbox do grupo */}
                      <td className="py-2 px-3 w-10">
                        <input
                          type="checkbox"
                          checked={allGroupSelected}
                          onChange={() => toggleSelectGroup(group.units)}
                          className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                      {/* Label + toggle */}
                      <td colSpan={spanDoRotulo} className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() => agrupamento.alternar(group.key)}
                          aria-expanded={!collapsed}
                          className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                        >
                          {collapsed
                            ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          }
                          {/* Por Pavimento, o rótulo é o nome do pavimento (`utils/unidadesGrupos.ts`); o número do andar fica ao lado. */}
                          <span className="font-semibold text-gray-700 text-sm" data-testid={porPavimento ? 'nome-do-pavimento' : 'nome-do-grupo'}>
                            {group.label}
                          </span>
                          {andarDoGrupo !== null && <span className="text-xs font-normal text-gray-500">andar {group.key}</span>}
                          <span className="bg-gray-200 text-gray-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                            {group.units.length}
                          </span>
                          {(() => {
                            const piso = andarDoGrupo === null ? undefined : elevacaoDoAndar.get(andarDoGrupo);
                            if (!piso) return null;
                            return (
                              <span
                                className="text-xs font-normal text-gray-600"
                                data-testid="elevacao-do-grupo"
                                title={piso.elevacaoDigitada
                                  ? 'Elevação digitada no cadastro de pavimentos'
                                  : 'Calculada: a elevação do térreo da torre + os pés-direitos de baixo (3,00 m onde não há)'}
                              >
                                · Elevação {fmtElevacao(piso.elevacaoMm / 1000)} m{piso.elevacaoDigitada ? '' : ' (calc.)'}
                              </span>
                            );
                          })()}
                        </button>
                      </td>
                      {/* Somatório de áreas do grupo, na coluna de cada área (se visível) */}
                      {celulasDasAreas(group.totalPriv, group.totalComum, 'py-2.5 px-4 text-sm font-medium')}
                      <td className="py-2 px-4 text-center">
                        {/* A ordem é do pavimento: agrupado por outro campo, o botão não se aplica. */}
                        {porPavimento && (() => {
                          const mudancas = andarDoGrupo === null ? [] : ordemPorNumero(group.units);
                          const motivo = andarDoGrupo === null
                            ? 'Unidade sem pavimento não tem ordem no pavimento'
                            : !ordemDoPavimentoNaTela ? 'Ordene a tabela pela coluna Pavimento para mudar a ordem'
                            : ordenando ? 'Gravando a ordem…'
                            : mudancas.length === 0 ? 'O pavimento já está na ordem pelo número'
                            : null;
                          return (
                            <span title={motivo ?? 'Grava a ordem pelo número (101, 102…) — a que a massa da Planta segue "Pelas setas"'}>
                              <button
                                type="button"
                                disabled={motivo !== null}
                                onClick={() => gravarOrdem(mudancas)}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 shadow-sm hover:border-blue-200 hover:text-blue-600 disabled:pointer-events-none disabled:opacity-50"
                              >
                                <ArrowUpDown className="w-3 h-3" /> Ordenar por número
                              </button>
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                    )}

                    {/* Unidades do grupo */}
                    {!collapsed && group.units.map(u => {
                      const isEditing = editingId === u.id;
                      const isSelected = selected.has(u.id);
                      return (
                        <tr key={u.id} className={`transition-colors ${isEditing ? 'bg-blue-50/30' : isSelected ? 'bg-blue-50/20' : 'hover:bg-gray-50/40'}`}>
                          {/* Checkbox */}
                          <td className="border-r border-gray-100 last:border-r-0 py-2 px-3 w-10">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(u.id)}
                              className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                            />
                          </td>

                          {isEditing ? (
                            <>
                              <td className="border-r border-gray-100 last:border-r-0 py-2 px-3"><input className={editCls} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} autoFocus /></td>
                              {vis('floor') && <td className="border-r border-gray-100 last:border-r-0 py-2 px-3"><input className={editCls} type="number" value={editForm.floor} onChange={e => setEditForm(p => ({ ...p, floor: e.target.value }))} /></td>}
                              {vis('floor_tipo') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2 px-3">
                                <select value={editForm.floor_tipo} onChange={e => setEditForm(p => ({ ...p, floor_tipo: e.target.value as FloorTipo | '' }))} className={editCls}>
                                  <option value="">— Tipo</option>
                                  {(Object.keys(FLOOR_TIPO_LABEL) as FloorTipo[]).map(t => <option key={t} value={t}>{FLOOR_TIPO_LABEL[t]}</option>)}
                                </select>
                              </td>
                              )}
                              {vis('elevacao') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2 px-3 text-sm text-gray-700 whitespace-nowrap" title="A elevação é do pavimento — mude na seção Pavimentos">
                                {textoDaElevacao(editForm.floor === '' ? null : Number(editForm.floor))}
                              </td>
                              )}
                              {vis('typology') && <td className="border-r border-gray-100 last:border-r-0 py-2 px-3"><input className={editCls} value={editForm.typology} onChange={e => setEditForm(p => ({ ...p, typology: e.target.value }))} /></td>}
                              {vis('private_area') && <td className="border-r border-gray-100 last:border-r-0 py-2 px-3"><input className={editCls} type="number" step="0.01" value={editForm.private_area} onChange={e => setEditForm(p => ({ ...p, private_area: e.target.value }))} /></td>}
                              {vis('common_area') && <td className="border-r border-gray-100 last:border-r-0 py-2 px-3"><input className={editCls} type="number" step="0.01" value={editForm.common_area} onChange={e => setEditForm(p => ({ ...p, common_area: e.target.value }))} /></td>}
                              {vis('bedrooms') && <td className="border-r border-gray-100 last:border-r-0 py-2 px-3"><input className={editCls} type="number" value={editForm.bedrooms} onChange={e => setEditForm(p => ({ ...p, bedrooms: e.target.value }))} /></td>}
                              {vis('bathrooms') && <td className="border-r border-gray-100 last:border-r-0 py-2 px-3"><input className={editCls} type="number" value={editForm.bathrooms} onChange={e => setEditForm(p => ({ ...p, bathrooms: e.target.value }))} /></td>}
                              {vis('suites') && <td className="border-r border-gray-100 last:border-r-0 py-2 px-3"><input className={editCls} type="number" value={editForm.suites} onChange={e => setEditForm(p => ({ ...p, suites: e.target.value }))} /></td>}
                              {vis('parking_spaces') && <td className="border-r border-gray-100 last:border-r-0 py-2 px-3"><input className={editCls} type="number" value={editForm.parking_spaces} onChange={e => setEditForm(p => ({ ...p, parking_spaces: e.target.value }))} /></td>}
                              {vis('position_type') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2 px-3">
                                <select value={editForm.position_type} onChange={e => setEditForm(p => ({ ...p, position_type: e.target.value as UnitPositionType | '' }))} className={editCls}>
                                  <option value="">—</option>
                                  {(Object.keys(POSITION_LABEL) as UnitPositionType[]).map(t => <option key={t} value={t}>{POSITION_LABEL[t]}</option>)}
                                </select>
                              </td>
                              )}
                              {vis('view_type') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2 px-3">
                                <select value={editForm.view_type} onChange={e => setEditForm(p => ({ ...p, view_type: e.target.value as UnitViewType | '' }))} className={editCls}>
                                  <option value="">—</option>
                                  {(Object.keys(VIEW_LABEL) as UnitViewType[]).map(t => <option key={t} value={t}>{VIEW_LABEL[t]}</option>)}
                                </select>
                              </td>
                              )}
                              {vis('sun_orientation') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2 px-3">
                                <select value={editForm.sun_orientation} onChange={e => setEditForm(p => ({ ...p, sun_orientation: e.target.value as UnitSunOrientation | '' }))} className={editCls}>
                                  <option value="">—</option>
                                  {(Object.keys(SUN_LABEL) as UnitSunOrientation[]).map(t => <option key={t} value={t}>{SUN_LABEL[t]}</option>)}
                                </select>
                              </td>
                              )}
                              <td aria-hidden="true" className="border-r border-gray-100"></td>
                              <td className="border-r border-gray-100 last:border-r-0 py-2 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => handleSaveEdit(u)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-[6px]"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-[6px]"><X className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-700">{u.name}</td>
                              {vis('floor') && <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-600">{u.floor ?? '—'}</td>}
                              {vis('floor_tipo') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal">
                                {u.floor_tipo
                                  ? <span className={textColor(FLOOR_TIPO_STYLE[u.floor_tipo])}>{FLOOR_TIPO_LABEL[u.floor_tipo]}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              )}
                              {vis('elevacao') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-600 whitespace-nowrap" data-testid="elevacao-da-unidade">
                                {textoDaElevacao(u.floor ?? null)}
                              </td>
                              )}
                              {vis('typology') && <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-600">{u.typology || '—'}</td>}
                              {vis('private_area') && <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-600">{u.private_area != null ? `${u.private_area} m²` : '—'}</td>}
                              {vis('common_area') && <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-600">{u.common_area != null ? `${u.common_area} m²` : '—'}</td>}
                              {vis('bedrooms') && <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-600">{u.bedrooms ?? '—'}</td>}
                              {vis('bathrooms') && <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-600">{u.bathrooms ?? '—'}</td>}
                              {vis('suites') && <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-600">{u.suites ?? '—'}</td>}
                              {vis('parking_spaces') && <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal text-gray-600">{u.parking_spaces ?? '—'}</td>}
                              {vis('position_type') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal">
                                {u.position_type
                                  ? <span className={textColor(POSITION_STYLE[u.position_type])}>{POSITION_LABEL[u.position_type]}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              )}
                              {vis('view_type') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal">
                                {u.view_type
                                  ? <span className={textColor(VIEW_STYLE[u.view_type])}>{VIEW_LABEL[u.view_type]}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              )}
                              {vis('sun_orientation') && (
                              <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-sm font-normal">
                                {u.sun_orientation
                                  ? <span className={textColor(SUN_STYLE[u.sun_orientation])}>{SUN_LABEL[u.sun_orientation]}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              )}
                              <td aria-hidden="true" className="border-r border-gray-100"></td>
                              <td className="border-r border-gray-100 last:border-r-0 py-2.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {([-1, 1] as const).map(passo => {
                                    const i = group.units.indexOf(u);
                                    const motivo = motivoSemSetas(group.units, i, passo);
                                    const rotulo = passo === -1 ? 'Subir na ordem do pavimento' : 'Descer na ordem do pavimento';
                                    // O title fica no span: o botão desligado não recebe o mouse e esconderia o motivo.
                                    return (
                                      <span key={passo} title={motivo ?? rotulo}>
                                        <ActionIconButton
                                          kind="move"
                                          size="sm"
                                          title={motivo ?? rotulo}
                                          aria-label={rotulo}
                                          icon={passo === -1 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                                          disabled={motivo !== null}
                                          onClick={() => gravarOrdem(moverNaOrdem(group.units, i, passo))}
                                        />
                                      </span>
                                    );
                                  })}
                                  <ActionIconButton kind="edit" size="sm" onClick={() => startEdit(u)} />
                                  <ActionIconButton kind="duplicate" size="sm" onClick={() => handleDuplicate(u)} />
                                  <ActionIconButton kind="delete" size="sm" onClick={() => handleDelete(u)} />
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50/70 text-sm text-gray-700">
                <td className="py-2.5 px-3" />
                <td className="py-2.5 px-4" colSpan={spanDoRotulo}>
                  <span className="text-xs font-semibold text-gray-500">Total ({units.length} unid.)</span>
                </td>
                {celulasDasAreas(totalPriv, totalComum, 'py-2.5 px-4 font-medium', 1)}
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
        </>
      )}

      {/* Barra de edição em lote */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 bg-white border border-blue-200 shadow-xl rounded-[10px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-600">
              {selected.size} unidade{selected.size > 1 ? 's' : ''} selecionada{selected.size > 1 ? 's' : ''}
            </span>
            <button onClick={() => { setSelected(new Set()); setBulkForm(emptyBulkForm()); }}
              className="p-1.5 hover:bg-gray-100 text-gray-400 rounded-[6px]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500 font-medium -mt-1">Campos em branco não serão alterados. Unidade (o nome) não entra: cada uma tem o seu; Elevação vem do pavimento.</p>
          {/* Na ordem das colunas da tabela (27/11/2026, "incluir todas as colunas na edição em lote": faltava Vagas). */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            <input type="number" aria-label="Pavimento" className={loteCls} placeholder="Pavimento nº" value={bulkForm.floor} onChange={e => setBulkForm(p => ({ ...p, floor: e.target.value }))} />
            <select aria-label="Tipo do pavimento" value={bulkForm.floor_tipo} onChange={e => setBulkForm(p => ({ ...p, floor_tipo: e.target.value as FloorTipo | '' }))}
              className={loteCls}>
              <option value="">Tipo pav.…</option>
              {(Object.keys(FLOOR_TIPO_LABEL) as FloorTipo[]).map(t => <option key={t} value={t}>{FLOOR_TIPO_LABEL[t]}</option>)}
            </select>
            <input aria-label="Tipologia" className={loteCls} placeholder="Tipologia" value={bulkForm.typology} onChange={e => setBulkForm(p => ({ ...p, typology: e.target.value }))} />
            <input type="number" step="0.01" aria-label="Área privativa (m²)" className={loteCls} placeholder="Área priv. m²" value={bulkForm.private_area} onChange={e => setBulkForm(p => ({ ...p, private_area: e.target.value }))} />
            <input type="number" step="0.01" aria-label="Área comum (m²)" className={loteCls} placeholder="Área comum m²" value={bulkForm.common_area} onChange={e => setBulkForm(p => ({ ...p, common_area: e.target.value }))} />
            <input type="number" aria-label="Dormitórios" className={loteCls} placeholder="Dormitórios" value={bulkForm.bedrooms} onChange={e => setBulkForm(p => ({ ...p, bedrooms: e.target.value }))} />
            <input type="number" aria-label="Banheiros" className={loteCls} placeholder="Banheiros" value={bulkForm.bathrooms} onChange={e => setBulkForm(p => ({ ...p, bathrooms: e.target.value }))} />
            <input type="number" aria-label="Suítes" className={loteCls} placeholder="Suítes" value={bulkForm.suites} onChange={e => setBulkForm(p => ({ ...p, suites: e.target.value }))} />
            <input type="number" aria-label="Vagas" className={loteCls} placeholder="Vagas" value={bulkForm.parking_spaces} onChange={e => setBulkForm(p => ({ ...p, parking_spaces: e.target.value }))} />
            <select aria-label="Posição" value={bulkForm.position_type} onChange={e => setBulkForm(p => ({ ...p, position_type: e.target.value as UnitPositionType | '' }))}
              className={loteCls}>
              <option value="">Posição…</option>
              {(Object.keys(POSITION_LABEL) as UnitPositionType[]).map(t => <option key={t} value={t}>{POSITION_LABEL[t]}</option>)}
            </select>
            <select aria-label="Vista" value={bulkForm.view_type} onChange={e => setBulkForm(p => ({ ...p, view_type: e.target.value as UnitViewType | '' }))}
              className={loteCls}>
              <option value="">Vista…</option>
              {(Object.keys(VIEW_LABEL) as UnitViewType[]).map(t => <option key={t} value={t}>{VIEW_LABEL[t]}</option>)}
            </select>
            <select aria-label="Orientação" value={bulkForm.sun_orientation} onChange={e => setBulkForm(p => ({ ...p, sun_orientation: e.target.value as UnitSunOrientation | '' }))}
              className={loteCls}>
              <option value="">Orientação…</option>
              {(Object.keys(SUN_LABEL) as UnitSunOrientation[]).map(t => <option key={t} value={t}>{SUN_LABEL[t]}</option>)}
            </select>
            {/* Eixo de locação — aluguel-alvo herdado ao publicar em Locações */}
            <MoneyCentsInput aria-label="Aluguel-alvo" className={loteCls} placeholder="Aluguel-alvo R$" value={bulkForm.rental_price} onChange={v => setBulkForm(p => ({ ...p, rental_price: v }))} />
            <select aria-label="Status de locação" value={bulkForm.rental_status} onChange={e => setBulkForm(p => ({ ...p, rental_status: e.target.value as RentalUnitStatus | '' }))}
              className={loteCls}>
              <option value="">Locação…</option>
              {(Object.keys(RENTAL_STATUS_LABEL) as RentalUnitStatus[]).map(t => <option key={t} value={t}>{RENTAL_STATUS_LABEL[t]}</option>)}
            </select>
            <button
              onClick={handleBulkSave}
              disabled={bulkSaving}
              className="flex items-center justify-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-sm transition-all active:scale-95 disabled:opacity-50"
            >
              {bulkSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Aplicar
            </button>
          </div>
        </div>
      )}

      {/* Painéis: o conteúdo só existe aberto — o Sheet fechado mantém os filhos no
          DOM, e campos invisíveis ainda recebem Tab e leitor de tela. */}
      {/* Painel: Nova unidade */}
      <Sheet open={painel === 'nova'} onClose={fecharNova} size="lg" dirty={nova.dirty}>
        {painel === 'nova' && <>
        <SheetHeader onClose={pedirFecharNova}>
          <SheetTitle>Nova unidade</SheetTitle>
          <SheetDescription>{tower.name}</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleCreate} className="flex-1 flex flex-col min-h-0">
          <SheetPanel className="p-6">
            <UnitFormFields idPrefix={`nova-unidade-${tower.id}`} value={form} onChange={patchForm} erroNome={erroNome} pavimentos={andaresDoCadastro(floors)} />
          </SheetPanel>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={pedirFecharNova}>Cancelar</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Salvar unidade
            </Button>
          </SheetFooter>
        </form>
        </>}
      </Sheet>

      {/* Painel: Gerar a partir dos pavimentos (28/10/2026) — número inicial + prévia por andar */}
      <Sheet open={painel === 'pavimentos'} onClose={() => setPainel(null)} size="lg">
        {painel === 'pavimentos' && <>
        <SheetHeader onClose={() => setPainel(null)}>
          <SheetTitle>Gerar a partir dos pavimentos</SheetTitle>
          <SheetDescription>{tower.name} — as unidades que os pavimentos cadastrados descrevem.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleGenerateFromFloors} className="flex-1 flex flex-col min-h-0">
          <SheetPanel className="p-6 space-y-6">
            <div className="space-y-4">
              <SecaoTitulo icon={Hash} titulo="Numeração" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-1.5">
                  <label htmlFor={`pav-inicio-${tower.id}`} className={rotuloCls}>Numeração começa em</label>
                  <input id={`pav-inicio-${tower.id}`} type="number" min="0" max={NUMERO_INICIAL_MAX} step="1" className={inputCls}
                    value={numeroInicial} onChange={e => setNumeroInicial(e.target.value)}
                    aria-invalid={numeroInicialLido === null} aria-describedby={`pav-inicio-ajuda-${tower.id}`} />
                  <p id={`pav-inicio-ajuda-${tower.id}`} className={`text-xs ${numeroInicialLido === null ? 'text-red-600' : 'text-gray-500'}`}>
                    {numeroInicialLido === null
                      ? `Use um número inteiro de 0 a ${NUMERO_INICIAL_MAX}.`
                      : 'A 1ª unidade de cada andar: 1 → 101, 102…; 5 → 105, 106…'}
                  </p>
                </div>
              </div>
              {faixasDaPrevia.length > 0 && (
                <ul className="space-y-0.5 text-xs text-gray-600" data-testid="previa-dos-pavimentos">
                  {faixasDaPrevia.map(f => (
                    <li key={f.andar}>
                      Andar {f.andar}: <span className="font-semibold text-gray-800">{f.de}</span>
                      {f.quantas > 1 && <> a <span className="font-semibold text-gray-800">{f.ate}</span></>}
                      <span className="text-gray-500"> ({f.quantas} unid.)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {units.length > 0 && (
              <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="aviso-substituir">
                As {units.length} unidades atuais de "{tower.name}" serão excluídas e substituídas pelas geradas.
              </p>
            )}
          </SheetPanel>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => setPainel(null)}>Cancelar</Button>
            <span title={numeroInicialLido === null ? `Use um número inteiro de 0 a ${NUMERO_INICIAL_MAX} em "Numeração começa em".` : undefined}>
              <Button type="submit" disabled={generating || numeroInicialLido === null}>
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-[15px] h-[15px]" />}
                {units.length > 0 ? 'Substituir e gerar' : 'Gerar'} {totalDosPavimentos} unidades
              </Button>
            </span>
          </SheetFooter>
        </form>
        </>}
      </Sheet>

      {/* Painel: Gerar em série */}
      <Sheet open={painel === 'serie'} onClose={fecharSerie} size="lg" dirty={serie.dirty}>
        {painel === 'serie' && <>
        <SheetHeader onClose={pedirFecharSerie}>
          <SheetTitle>Gerar unidades em série</SheetTitle>
          <SheetDescription>
            {tower.name} — acrescenta unidades numeradas por pavimento. As unidades existentes continuam.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleGenerate} className="flex-1 flex flex-col min-h-0">
          <SheetPanel className="p-6 space-y-8">
            <div className="space-y-4">
              <SecaoTitulo icon={Hash} titulo="Numeração" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {([
                  { label: 'Nº de pavimentos *', key: 'floors_count', type: 'number' },
                  { label: 'Unidades por pavimento *', key: 'units_per_floor', type: 'number' },
                  { label: 'Pavimento inicial', key: 'start_floor', type: 'number' },
                  { label: 'Prefixo (opcional)', key: 'prefix', type: 'text', placeholder: 'ex: A' },
                ] as const).map(({ label, key, type, ...rest }) => (
                  <div key={key} className="space-y-1.5">
                    <label htmlFor={`serie-${key}-${tower.id}`} className={rotuloCls}>{label}</label>
                    <input id={`serie-${key}-${tower.id}`} type={type} min={type === 'number' ? '0' : undefined} className={inputCls}
                      placeholder={'placeholder' in rest ? rest.placeholder : undefined}
                      value={genForm[key]} onChange={e => patchGen({ [key]: e.target.value })} />
                  </div>
                ))}
              </div>
              {genTotal > 0 && (
                <p className="text-xs text-gray-500">
                  De <span className="font-semibold text-gray-700">{genForm.prefix ? `${genForm.prefix}-` : ''}{genForm.start_floor || 1}01</span>
                  {' '}a{' '}
                  <span className="font-semibold text-gray-700">{genForm.prefix ? `${genForm.prefix}-` : ''}{(Number(genForm.start_floor) || 1) + (Number(genForm.floors_count) || 1) - 1}{String(Number(genForm.units_per_floor)).padStart(2, '0')}</span>
                  {' '}— <span className="font-semibold text-blue-600">{genTotal} unidades</span>
                </p>
              )}
            </div>

            <div className="space-y-4">
              <SecaoTitulo icon={Tag} titulo="Padrão das unidades" resumo="aplicado a todas; ajuste depois na tabela" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {([
                  { label: 'Tipologia', key: 'typology', type: 'text', placeholder: 'ex: 2 quartos' },
                  { label: 'Área privativa (m²)', key: 'private_area', type: 'number' },
                  { label: 'Área comum (m²)', key: 'common_area', type: 'number' },
                  { label: 'Vagas', key: 'parking_spaces', type: 'number' },
                  { label: 'Preço de venda (R$)', key: 'price', type: 'money' },
                  { label: 'Aluguel-alvo (R$)', key: 'rental_price', type: 'money' },
                ] as const).map(({ label, key, type, ...rest }) => (
                  <div key={key} className="space-y-1.5">
                    <label htmlFor={`serie-${key}-${tower.id}`} className={rotuloCls}>{label}</label>
                    {type === 'money' ? (
                      <MoneyCentsInput id={`serie-${key}-${tower.id}`} className={inputCls}
                        value={genForm[key]} onChange={v => patchGen({ [key]: v })} />
                    ) : (
                      <input id={`serie-${key}-${tower.id}`} type={type} step={type === 'number' ? '0.01' : undefined} className={inputCls}
                        placeholder={'placeholder' in rest ? rest.placeholder : undefined}
                        value={genForm[key]} onChange={e => patchGen({ [key]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </SheetPanel>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={pedirFecharSerie}>Cancelar</Button>
            <span title={genTotal === 0 ? 'Informe o nº de pavimentos e de unidades por pavimento.' : undefined}>
              <Button type="submit" disabled={generating || genTotal === 0}>
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-[15px] h-[15px]" />}
                Gerar {genTotal > 0 ? `${genTotal} unidades` : 'unidades'}
              </Button>
            </span>
          </SheetFooter>
        </form>
        </>}
      </Sheet>
    </div>
  );
};

// ── SortableHeader ────────────────────────────────────────────────────────────

const SortableHeader: React.FC<{
  col: SortCol; current: SortCol; dir: 'asc' | 'desc';
  onSort: (col: SortCol) => void; children: React.ReactNode;
  /** A alça de redimensionar (`cols.ResizeHandle`), absoluta na borda direita. */
  resize?: React.ReactNode;
}> = ({ col, current, dir, onSort, children, resize }) => {
  const active = col === current;
  return (
    <th
      onClick={() => onSort(col)}
      className={`relative overflow-hidden py-2.5 px-4 text-table-header font-semibold cursor-pointer select-none transition-colors border-r border-gray-100 ${active ? 'text-blue-600' : 'text-gray-700 hover:text-gray-900'}`}
    >
      <div className="flex items-center gap-1">
        {children}
        {active
          ? (dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </div>
      {resize}
    </th>
  );
};

export default UnitEditor;

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
  ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import Button from '../ui/Button';
import SecaoTitulo from '../ui/SecaoTitulo';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from '../ui/sheet';
import { empreendimentoService } from '../../services/empreendimentoService';
import { useToast } from '../../hooks/useToast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  EmpreendimentoTower, EmpreendimentoUnit, EmpreendimentoFloor, FloorTipo, EmpreendimentoUnitInsert,
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

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tower: EmpreendimentoTower;
  /** Pavimentos cadastrados na torre (FloorEditor) — base de "Gerar a partir dos pavimentos". */
  floors?: EmpreendimentoFloor[];
  onUnitsChange?: (towerId: string, units: EmpreendimentoUnit[]) => void;
}

// ── Componente principal ─────────────────────────────────────────────────────

/** Estável: o padrão `[]` novo a cada render refaria o cálculo da elevação a cada render. */
const SEM_PAVIMENTOS: EmpreendimentoFloor[] = [];

export const UnitEditor: React.FC<Props> = ({ tower, floors = SEM_PAVIMENTOS, onUnitsChange }) => {
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

  // Grupos colapsados
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());

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
  React.useEffect(() => { onUnitsChange?.(tower.id, units); }, [units, tower.id, onUnitsChange]);

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

  const groups = React.useMemo(() => {
    const map = new Map<string, EmpreendimentoUnit[]>();
    for (const u of units) {
      const key = u.floor != null ? String(u.floor) : '__null__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === '__null__') return 1;
        if (b === '__null__') return -1;
        return Number(a) - Number(b);
      })
      .map(([key, grpUnits]) => ({
        key,
        label: key === '__null__' ? 'Sem Pavimento' : `Pavimento ${key}`,
        // No empate (a coluna Pavimento, a padrão), a ordem do pavimento — a que a massa da Planta segue.
        units: [...grpUnits].sort((a, b) => sortFn(a, b) || compararNaOrdemDoEmpreendimento(a, b)),
        totalPriv: grpUnits.reduce((s, u) => s + (u.private_area ?? 0), 0),
        totalComum: grpUnits.reduce((s, u) => s + (u.common_area ?? 0), 0),
      }));
  }, [units, sortFn]);

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

  // ── Ordem das unidades no pavimento ─────────────────────────────────────────
  // A ordem MANUAL da massa da Planta (27/10/2026, "Ordem do Empreendimento"): as setas trocam a unidade com a
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
        <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-semibold text-xs bg-gray-50">
                {/* Checkbox select-all */}
                <th className="py-3 px-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                  />
                </th>
                <SortableHeader col="name" current={sortCol} dir={sortDir} onSort={handleSort}>Unidade</SortableHeader>
                <SortableHeader col="floor" current={sortCol} dir={sortDir} onSort={handleSort}>Pav.</SortableHeader>
                <SortableHeader col="floor_tipo" current={sortCol} dir={sortDir} onSort={handleSort}>Tipo Pav.</SortableHeader>
                <SortableHeader col="typology" current={sortCol} dir={sortDir} onSort={handleSort}>Tipologia</SortableHeader>
                <SortableHeader col="private_area" current={sortCol} dir={sortDir} onSort={handleSort}>Priv. m²</SortableHeader>
                <SortableHeader col="common_area" current={sortCol} dir={sortDir} onSort={handleSort}>Comum m²</SortableHeader>
                <SortableHeader col="bedrooms" current={sortCol} dir={sortDir} onSort={handleSort}>Dormitórios</SortableHeader>
                <SortableHeader col="bathrooms" current={sortCol} dir={sortDir} onSort={handleSort}>Banheiros</SortableHeader>
                <SortableHeader col="suites" current={sortCol} dir={sortDir} onSort={handleSort}>Suítes</SortableHeader>
                <SortableHeader col="parking_spaces" current={sortCol} dir={sortDir} onSort={handleSort}>Vagas</SortableHeader>
                <SortableHeader col="position_type" current={sortCol} dir={sortDir} onSort={handleSort}>Posição</SortableHeader>
                <SortableHeader col="view_type" current={sortCol} dir={sortDir} onSort={handleSort}>Vista</SortableHeader>
                <SortableHeader col="sun_orientation" current={sortCol} dir={sortDir} onSort={handleSort}>Orient.</SortableHeader>
                <th className="py-2.5 px-4 text-center text-table-header font-semibold text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => {
                const collapsed = collapsedGroups.has(group.key);
                const allGroupSelected = group.units.every(u => selected.has(u.id));
                return (
                  <React.Fragment key={group.key}>
                    {/* Cabeçalho do grupo */}
                    <tr className="bg-gray-50/70 border-b border-gray-100 hover:bg-gray-100/60 transition-colors">
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
                      <td colSpan={4} className="py-2 px-3">
                        <button
                          onClick={() => setCollapsedGroups(prev => {
                            const n = new Set(prev);
                            n.has(group.key) ? n.delete(group.key) : n.add(group.key);
                            return n;
                          })}
                          className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                        >
                          {collapsed
                            ? <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          }
                          <span className="font-semibold text-gray-700 text-sm">{group.label}</span>
                          <span className="bg-gray-200 text-gray-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                            {group.units.length}
                          </span>
                          {(() => {
                            const piso = group.key === '__null__' ? undefined : elevacaoDoAndar.get(Number(group.key));
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
                      {/* Somatório de áreas por pavimento */}
                      <td className="py-2.5 px-4 text-sm font-medium text-blue-600">
                        {group.totalPriv > 0 ? `${fmtArea(group.totalPriv)} m²` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-sm font-medium text-teal-600">
                        {group.totalComum > 0 ? `${fmtArea(group.totalComum)} m²` : '—'}
                      </td>
                      <td colSpan={7} />
                      <td className="py-2 px-4 text-center">
                        {(() => {
                          const mudancas = group.key === '__null__' ? [] : ordemPorNumero(group.units);
                          const motivo = group.key === '__null__'
                            ? 'Unidade sem pavimento não tem ordem no pavimento'
                            : !ordemDoPavimentoNaTela ? 'Ordene a tabela pela coluna Pavimento para mudar a ordem'
                            : ordenando ? 'Gravando a ordem…'
                            : mudancas.length === 0 ? 'O pavimento já está na ordem pelo número'
                            : null;
                          return (
                            <span title={motivo ?? 'Grava a ordem pelo número (101, 102…) — a que a massa da Planta segue em "Ordem do Empreendimento"'}>
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

                    {/* Unidades do grupo */}
                    {!collapsed && group.units.map(u => {
                      const isEditing = editingId === u.id;
                      const isSelected = selected.has(u.id);
                      return (
                        <tr key={u.id} className={`border-b border-gray-50 transition-colors ${isEditing ? 'bg-blue-50/30' : isSelected ? 'bg-blue-50/20' : 'hover:bg-gray-50/40'}`}>
                          {/* Checkbox */}
                          <td className="py-2 px-3 w-10">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(u.id)}
                              className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                            />
                          </td>

                          {isEditing ? (
                            <>
                              <td className="py-2 px-3"><input className={editCls} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} autoFocus /></td>
                              <td className="py-2 px-3"><input className={editCls} type="number" value={editForm.floor} onChange={e => setEditForm(p => ({ ...p, floor: e.target.value }))} /></td>
                              <td className="py-2 px-3">
                                <select value={editForm.floor_tipo} onChange={e => setEditForm(p => ({ ...p, floor_tipo: e.target.value as FloorTipo | '' }))} className={editCls}>
                                  <option value="">— Tipo</option>
                                  {(Object.keys(FLOOR_TIPO_LABEL) as FloorTipo[]).map(t => <option key={t} value={t}>{FLOOR_TIPO_LABEL[t]}</option>)}
                                </select>
                              </td>
                              <td className="py-2 px-3"><input className={editCls} value={editForm.typology} onChange={e => setEditForm(p => ({ ...p, typology: e.target.value }))} /></td>
                              <td className="py-2 px-3"><input className={editCls} type="number" step="0.01" value={editForm.private_area} onChange={e => setEditForm(p => ({ ...p, private_area: e.target.value }))} /></td>
                              <td className="py-2 px-3"><input className={editCls} type="number" step="0.01" value={editForm.common_area} onChange={e => setEditForm(p => ({ ...p, common_area: e.target.value }))} /></td>
                              <td className="py-2 px-3"><input className={editCls} type="number" value={editForm.bedrooms} onChange={e => setEditForm(p => ({ ...p, bedrooms: e.target.value }))} /></td>
                              <td className="py-2 px-3"><input className={editCls} type="number" value={editForm.bathrooms} onChange={e => setEditForm(p => ({ ...p, bathrooms: e.target.value }))} /></td>
                              <td className="py-2 px-3"><input className={editCls} type="number" value={editForm.suites} onChange={e => setEditForm(p => ({ ...p, suites: e.target.value }))} /></td>
                              <td className="py-2 px-3"><input className={editCls} type="number" value={editForm.parking_spaces} onChange={e => setEditForm(p => ({ ...p, parking_spaces: e.target.value }))} /></td>
                              <td className="py-2 px-3">
                                <select value={editForm.position_type} onChange={e => setEditForm(p => ({ ...p, position_type: e.target.value as UnitPositionType | '' }))} className={editCls}>
                                  <option value="">—</option>
                                  {(Object.keys(POSITION_LABEL) as UnitPositionType[]).map(t => <option key={t} value={t}>{POSITION_LABEL[t]}</option>)}
                                </select>
                              </td>
                              <td className="py-2 px-3">
                                <select value={editForm.view_type} onChange={e => setEditForm(p => ({ ...p, view_type: e.target.value as UnitViewType | '' }))} className={editCls}>
                                  <option value="">—</option>
                                  {(Object.keys(VIEW_LABEL) as UnitViewType[]).map(t => <option key={t} value={t}>{VIEW_LABEL[t]}</option>)}
                                </select>
                              </td>
                              <td className="py-2 px-3">
                                <select value={editForm.sun_orientation} onChange={e => setEditForm(p => ({ ...p, sun_orientation: e.target.value as UnitSunOrientation | '' }))} className={editCls}>
                                  <option value="">—</option>
                                  {(Object.keys(SUN_LABEL) as UnitSunOrientation[]).map(t => <option key={t} value={t}>{SUN_LABEL[t]}</option>)}
                                </select>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => handleSaveEdit(u)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-[6px]"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-[6px]"><X className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-2.5 px-4 text-sm font-normal text-gray-700">{u.name}</td>
                              <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.floor ?? '—'}</td>
                              <td className="py-2.5 px-4 text-sm font-normal">
                                {u.floor_tipo
                                  ? <span className={textColor(FLOOR_TIPO_STYLE[u.floor_tipo])}>{FLOOR_TIPO_LABEL[u.floor_tipo]}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.typology || '—'}</td>
                              <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.private_area != null ? `${u.private_area} m²` : '—'}</td>
                              <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.common_area != null ? `${u.common_area} m²` : '—'}</td>
                              <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.bedrooms ?? '—'}</td>
                              <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.bathrooms ?? '—'}</td>
                              <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.suites ?? '—'}</td>
                              <td className="py-2.5 px-4 text-sm font-normal text-gray-600">{u.parking_spaces ?? '—'}</td>
                              <td className="py-2.5 px-4 text-sm font-normal">
                                {u.position_type
                                  ? <span className={textColor(POSITION_STYLE[u.position_type])}>{POSITION_LABEL[u.position_type]}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="py-2.5 px-4 text-sm font-normal">
                                {u.view_type
                                  ? <span className={textColor(VIEW_STYLE[u.view_type])}>{VIEW_LABEL[u.view_type]}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="py-2.5 px-4 text-sm font-normal">
                                {u.sun_orientation
                                  ? <span className={textColor(SUN_STYLE[u.sun_orientation])}>{SUN_LABEL[u.sun_orientation]}</span>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="py-2.5 px-4 text-center">
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
                <td className="py-2.5 px-4" colSpan={4}>
                  <span className="text-xs font-semibold text-gray-500">Total ({units.length} unid.)</span>
                </td>
                <td className="py-2.5 px-4 font-medium text-blue-600">{totalPriv > 0 ? `${fmtArea(totalPriv)} m²` : '—'}</td>
                <td className="py-2.5 px-4 font-medium text-teal-600">{totalComum > 0 ? `${fmtArea(totalComum)} m²` : '—'}</td>
                <td colSpan={8} />
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
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
          <p className="text-[10px] text-gray-400 font-medium -mt-1">Campos em branco não serão alterados.</p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <input type="number" className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400" placeholder="Pav. nº" value={bulkForm.floor} onChange={e => setBulkForm(p => ({ ...p, floor: e.target.value }))} />
            <select value={bulkForm.floor_tipo} onChange={e => setBulkForm(p => ({ ...p, floor_tipo: e.target.value as FloorTipo | '' }))}
              className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-semibold outline-none focus:border-blue-400">
              <option value="">Tipo Pav....</option>
              {(Object.keys(FLOOR_TIPO_LABEL) as FloorTipo[]).map(t => <option key={t} value={t}>{FLOOR_TIPO_LABEL[t]}</option>)}
            </select>
            <input className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400" placeholder="Tipologia..." value={bulkForm.typology} onChange={e => setBulkForm(p => ({ ...p, typology: e.target.value }))} />
            <input type="number" step="0.01" className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400" placeholder="Área Priv. m²" value={bulkForm.private_area} onChange={e => setBulkForm(p => ({ ...p, private_area: e.target.value }))} />
            <input type="number" step="0.01" className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400" placeholder="Área Comum m²" value={bulkForm.common_area} onChange={e => setBulkForm(p => ({ ...p, common_area: e.target.value }))} />
            <input type="number" className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400" placeholder="Dormitórios" value={bulkForm.bedrooms} onChange={e => setBulkForm(p => ({ ...p, bedrooms: e.target.value }))} />
            <input type="number" className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400" placeholder="Banheiros" value={bulkForm.bathrooms} onChange={e => setBulkForm(p => ({ ...p, bathrooms: e.target.value }))} />
            <input type="number" className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400" placeholder="Suítes" value={bulkForm.suites} onChange={e => setBulkForm(p => ({ ...p, suites: e.target.value }))} />
            <select value={bulkForm.position_type} onChange={e => setBulkForm(p => ({ ...p, position_type: e.target.value as UnitPositionType | '' }))}
              className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-semibold outline-none focus:border-blue-400">
              <option value="">Posição...</option>
              {(Object.keys(POSITION_LABEL) as UnitPositionType[]).map(t => <option key={t} value={t}>{POSITION_LABEL[t]}</option>)}
            </select>
            <select value={bulkForm.view_type} onChange={e => setBulkForm(p => ({ ...p, view_type: e.target.value as UnitViewType | '' }))}
              className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-semibold outline-none focus:border-blue-400">
              <option value="">Vista...</option>
              {(Object.keys(VIEW_LABEL) as UnitViewType[]).map(t => <option key={t} value={t}>{VIEW_LABEL[t]}</option>)}
            </select>
            <select value={bulkForm.sun_orientation} onChange={e => setBulkForm(p => ({ ...p, sun_orientation: e.target.value as UnitSunOrientation | '' }))}
              className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-semibold outline-none focus:border-blue-400">
              <option value="">Orientação...</option>
              {(Object.keys(SUN_LABEL) as UnitSunOrientation[]).map(t => <option key={t} value={t}>{SUN_LABEL[t]}</option>)}
            </select>
            {/* Eixo de locação — aluguel-alvo herdado ao publicar em Locações */}
            <MoneyCentsInput className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400" placeholder="Aluguel-alvo R$" value={bulkForm.rental_price} onChange={v => setBulkForm(p => ({ ...p, rental_price: v }))} />
            <select value={bulkForm.rental_status} onChange={e => setBulkForm(p => ({ ...p, rental_status: e.target.value as RentalUnitStatus | '' }))}
              className="px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs font-semibold outline-none focus:border-blue-400">
              <option value="">Status locação...</option>
              {(Object.keys(RENTAL_STATUS_LABEL) as RentalUnitStatus[]).map(t => <option key={t} value={t}>{RENTAL_STATUS_LABEL[t]}</option>)}
            </select>
            <button
              onClick={handleBulkSave}
              disabled={bulkSaving}
              className="flex items-center justify-center gap-1.5 h-8 px-3 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-xs transition-all active:scale-95 disabled:opacity-50"
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
}> = ({ col, current, dir, onSort, children }) => {
  const active = col === current;
  return (
    <th
      onClick={() => onSort(col)}
      className={`py-2.5 px-4 text-table-header font-semibold cursor-pointer select-none transition-colors ${active ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
    >
      <div className="flex items-center gap-1">
        {children}
        {active
          ? (dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </div>
    </th>
  );
};

export default UnitEditor;

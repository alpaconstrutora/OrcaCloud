// components/empreendimento/UnitEditor.tsx
import React from 'react';
import {
  Plus, Loader2, Layers, X, Check, Zap,
  ChevronDown, ChevronUp, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import ActionIconButton from '../ui/ActionIconButton';
import { empreendimentoService } from '../../services/empreendimentoService';
import {
  EmpreendimentoTower, EmpreendimentoUnit, FloorTipo, EmpreendimentoUnitInsert,
  UnitPositionType, UnitSunOrientation, UnitViewType,
} from '../../types';
import {
  POSITION_LABEL, VIEW_LABEL, SUN_LABEL, POSITION_STYLE, VIEW_STYLE, SUN_STYLE,
} from '../../utils/empreendimentoComercial';
import Button from '../ui/Button';
import { useConfirm } from '../ui/confirm';

// ── Constantes de exibição ───────────────────────────────────────────────────

const FLOOR_TIPO_LABEL: Record<FloorTipo, string> = {
  SUBSOLO: 'Subsolo', TERREO: 'Térreo', MEZANINO: 'Mezanino', TIPO: 'Tipo',
  COBERTURA: 'Cobertura', TECNICO: 'Técnico', GARAGEM: 'Garagem', OUTRO: 'Outro',
};
const FLOOR_TIPO_STYLE: Record<FloorTipo, string> = {
  SUBSOLO: 'bg-slate-500/10 text-slate-600', TERREO: 'bg-lime-500/10 text-lime-700',
  MEZANINO: 'bg-teal-500/10 text-teal-700', TIPO: 'bg-blue-500/10 text-blue-600',
  COBERTURA: 'bg-amber-500/10 text-amber-700', TECNICO: 'bg-gray-500/10 text-gray-600',
  GARAGEM: 'bg-orange-500/10 text-orange-600', OUTRO: 'bg-purple-500/10 text-purple-600',
};
// §8 Status Badge = texto simples colorido. Reaproveita a cor de texto das
// paletas acima (bg+text combinados) extraindo só o token `text-*`.
const textColor = (style?: string) => style?.split(' ').find(c => c.startsWith('text-')) ?? 'text-gray-600';
type SortCol = 'name' | 'floor' | 'floor_tipo' | 'typology' | 'private_area' | 'common_area' | 'bedrooms' | 'bathrooms' | 'parking_spaces' | 'position_type' | 'view_type' | 'sun_orientation';

const emptyForm = () => ({
  name: '', floor: '', typology: '', private_area: '', common_area: '',
  bedrooms: '', bathrooms: '',
  parking_spaces: '', floor_tipo: '' as FloorTipo | '',
  position_type: '' as UnitPositionType | '', view_type: '' as UnitViewType | '',
  sun_orientation: '' as UnitSunOrientation | '',
});
const emptyBulkForm = () => ({
  floor: '', floor_tipo: '' as FloorTipo | '',
  typology: '', private_area: '', common_area: '', bedrooms: '', bathrooms: '', parking_spaces: '',
  position_type: '' as UnitPositionType | '', view_type: '' as UnitViewType | '',
  sun_orientation: '' as UnitSunOrientation | '',
});

const fmtArea = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tower: EmpreendimentoTower;
  onUnitsChange?: (towerId: string, units: EmpreendimentoUnit[]) => void;
}

// ── Componente principal ─────────────────────────────────────────────────────

export const UnitEditor: React.FC<Props> = ({ tower, onUnitsChange }) => {
  const confirm = useConfirm();
  const [units, setUnits] = React.useState<EmpreendimentoUnit[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm());

  // Inline edit
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState({ ...emptyForm(), floor_id: '' });

  // Geração automática
  const [genOpen, setGenOpen] = React.useState(false);
  const [genForm, setGenForm] = React.useState({
    floors_count: tower.floors_count?.toString() ?? '',
    units_per_floor: tower.units_per_floor?.toString() ?? '',
    start_floor: '1', prefix: '', typology: '',
    private_area: '', common_area: '', parking_spaces: '', price: '',
  });
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
        units: [...grpUnits].sort(sortFn),
        totalPriv: grpUnits.reduce((s, u) => s + (u.private_area ?? 0), 0),
        totalComum: grpUnits.reduce((s, u) => s + (u.common_area ?? 0), 0),
      }));
  }, [units, sortFn]);

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

  const buildPayload = (f: typeof form): Omit<EmpreendimentoUnitInsert, 'tower_id' | 'name'> => {
    const priv = f.private_area ? Number(f.private_area) : undefined;
    const common = f.common_area ? Number(f.common_area) : undefined;
    return {
      floor: f.floor ? Number(f.floor) : undefined,
      floor_tipo: (f.floor_tipo || undefined) as FloorTipo | undefined,
      typology: f.typology || undefined,
      private_area: priv, common_area: common,
      total_area: priv !== undefined || common !== undefined ? (priv ?? 0) + (common ?? 0) : undefined,
      bedrooms: f.bedrooms ? Number(f.bedrooms) : undefined,
      bathrooms: f.bathrooms ? Number(f.bathrooms) : undefined,
      parking_spaces: f.parking_spaces ? Number(f.parking_spaces) : undefined,
      position_type: (f.position_type || undefined) as UnitPositionType | undefined,
      view_type: (f.view_type || undefined) as UnitViewType | undefined,
      sun_orientation: (f.sun_orientation || undefined) as UnitSunOrientation | undefined,
      status: 'DISPONIVEL', is_vendavel: true,
    };
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { alert('Informe o nome/identificação da unidade.'); return; }
    setSaving(true);
    try {
      await empreendimentoService.createUnit({ tower_id: tower.id, name: form.name.trim(), ...buildPayload(form) });
      setForm(emptyForm());
      await load();
    } catch (err: any) { alert(`Erro ao adicionar: ${err.message}`); }
    finally { setSaving(false); }
  };

  const startEdit = (u: EmpreendimentoUnit) => {
    setEditingId(u.id);
    setEditForm({
      name: u.name, floor: u.floor?.toString() ?? '',
      typology: u.typology ?? '', private_area: u.private_area?.toString() ?? '',
      common_area: u.common_area?.toString() ?? '',
      bedrooms: u.bedrooms?.toString() ?? '', bathrooms: u.bathrooms?.toString() ?? '',
      parking_spaces: u.parking_spaces?.toString() ?? '', floor_tipo: u.floor_tipo ?? '',
      floor_id: u.floor_id ?? '',
      position_type: u.position_type ?? '', view_type: u.view_type ?? '',
      sun_orientation: u.sun_orientation ?? '',
    });
  };

  const handleSaveEdit = async (u: EmpreendimentoUnit) => {
    if (!editForm.name.trim()) { alert('Informe o nome da unidade.'); return; }
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
        parking_spaces: editForm.parking_spaces ? Number(editForm.parking_spaces) : undefined,
        position_type: (editForm.position_type || null) as UnitPositionType | null,
        view_type: (editForm.view_type || null) as UnitViewType | null,
        sun_orientation: (editForm.sun_orientation || null) as UnitSunOrientation | null,
        floor_id: editForm.floor_id || null,
      };
      await empreendimentoService.updateUnit(u.id, updated);
      setUnits(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x));
      setEditingId(null);
    } catch (err: any) { alert(`Erro ao salvar: ${err.message}`); }
  };

  const handleDuplicate = async (u: EmpreendimentoUnit) => {
    try {
      await empreendimentoService.createUnit({
        tower_id: tower.id, name: `${u.name} (cópia)`,
        floor: u.floor ?? undefined, floor_tipo: u.floor_tipo ?? undefined,
        typology: u.typology ?? undefined, private_area: u.private_area ?? undefined,
        common_area: u.common_area ?? undefined, total_area: u.total_area ?? undefined,
        price: u.price ?? undefined, bedrooms: u.bedrooms ?? undefined,
        bathrooms: u.bathrooms ?? undefined, parking_spaces: u.parking_spaces ?? undefined,
        status: 'DISPONIVEL', is_vendavel: true, sort_order: units.length,
      });
      await load();
    } catch (err: any) { alert(`Erro ao duplicar: ${err.message}`); }
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
    } catch (err: any) { alert(`Erro ao excluir: ${err.message}`); }
  };

  // ── Bulk save ───────────────────────────────────────────────────────────────

  const handleBulkSave = async () => {
    const hasAny = bulkForm.floor || bulkForm.floor_tipo || bulkForm.typology.trim()
      || bulkForm.private_area || bulkForm.common_area || bulkForm.bedrooms || bulkForm.bathrooms || bulkForm.parking_spaces
      || bulkForm.position_type || bulkForm.view_type || bulkForm.sun_orientation;
    if (!hasAny) { alert('Preencha pelo menos um campo para aplicar em lote.'); return; }
    setBulkSaving(true);
    // Monta o patch de uma unidade aplicando só os campos preenchidos no bulkForm
    const buildUpd = (unit: EmpreendimentoUnit): Record<string, any> => {
      const upd: Record<string, any> = {};
      if (bulkForm.floor) upd.floor = Number(bulkForm.floor);
      if (bulkForm.floor_tipo) upd.floor_tipo = bulkForm.floor_tipo;
      if (bulkForm.typology.trim()) upd.typology = bulkForm.typology.trim();
      if (bulkForm.bedrooms) upd.bedrooms = Number(bulkForm.bedrooms);
      if (bulkForm.bathrooms) upd.bathrooms = Number(bulkForm.bathrooms);
      if (bulkForm.parking_spaces) upd.parking_spaces = Number(bulkForm.parking_spaces);
      if (bulkForm.position_type) upd.position_type = bulkForm.position_type;
      if (bulkForm.view_type) upd.view_type = bulkForm.view_type;
      if (bulkForm.sun_orientation) upd.sun_orientation = bulkForm.sun_orientation;
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
    } catch (err: any) { alert(`Erro ao salvar em lote: ${err.message}`); }
    finally { setBulkSaving(false); }
  };

  // ── Geração automática ──────────────────────────────────────────────────────

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const floors = Number(genForm.floors_count), perFloor = Number(genForm.units_per_floor);
    const startFloor = Number(genForm.start_floor);
    if (!floors || !perFloor) { alert('Informe número de pavimentos e unidades por pavimento.'); return; }
    if (floors > 100 || perFloor > 50) { alert('Máx 100 pav / 50 un/pav.'); return; }
    const ok = await confirm({
      title: 'Gerar unidades?',
      message: `${floors * perFloor} unidades serão criadas para "${tower.name}".`,
      variant: 'warning', confirmLabel: 'Gerar',
    });
    if (!ok) return;
    setGenerating(true);
    try {
      const toCreate: EmpreendimentoUnitInsert[] = [];
      for (let f = 0; f < floors; f++) {
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
            parking_spaces: genForm.parking_spaces ? Number(genForm.parking_spaces) : undefined,
            status: 'DISPONIVEL', is_vendavel: true, sort_order: units.length + toCreate.length,
          });
        }
      }
      await empreendimentoService.bulkUpsertUnits(toCreate);
      setGenOpen(false);
      await load();
    } catch (err: any) { alert(`Erro ao gerar: ${err.message}`); }
    finally { setGenerating(false); }
  };

  // ── Utilidades de ordenação ─────────────────────────────────────────────────

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const genTotal = (Number(genForm.floors_count) || 0) * (Number(genForm.units_per_floor) || 0);

  const inputCls = 'px-3 py-2 border border-gray-200 rounded-[6px] text-sm font-medium outline-none focus:border-blue-400';
  const editCls = 'px-2 py-1 border border-blue-200 rounded-[6px] text-sm font-normal outline-none focus:border-blue-400 bg-white w-full';

  // Totais gerais
  const totalPriv = units.reduce((s, u) => s + (u.private_area ?? 0), 0);
  const totalComum = units.reduce((s, u) => s + (u.common_area ?? 0), 0);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-gray-50/60 border border-gray-100 rounded-[10px] p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <input className={inputCls} placeholder="Unidade (ex: 101)" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        <input className={inputCls} placeholder="Pav." type="number" value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} />
        <select className={inputCls} value={form.floor_tipo} onChange={e => setForm(p => ({ ...p, floor_tipo: e.target.value as FloorTipo | '' }))}>
          <option value="">Tipo Pav.</option>
          {(Object.keys(FLOOR_TIPO_LABEL) as FloorTipo[]).map(t => <option key={t} value={t}>{FLOOR_TIPO_LABEL[t]}</option>)}
        </select>
        <input className={inputCls} placeholder="Tipologia" value={form.typology} onChange={e => setForm(p => ({ ...p, typology: e.target.value }))} />
        <input className={inputCls} placeholder="Priv. m²" type="number" step="0.01" value={form.private_area} onChange={e => setForm(p => ({ ...p, private_area: e.target.value }))} />
        <input className={inputCls} placeholder="Comum m²" type="number" step="0.01" value={form.common_area} onChange={e => setForm(p => ({ ...p, common_area: e.target.value }))} />
        <input className={inputCls} placeholder="Dormitórios" type="number" value={form.bedrooms} onChange={e => setForm(p => ({ ...p, bedrooms: e.target.value }))} />
        <input className={inputCls} placeholder="Banheiros" type="number" value={form.bathrooms} onChange={e => setForm(p => ({ ...p, bathrooms: e.target.value }))} />
        <input className={inputCls} placeholder="Vagas" type="number" value={form.parking_spaces} onChange={e => setForm(p => ({ ...p, parking_spaces: e.target.value }))} />
        <select className={inputCls} value={form.position_type} onChange={e => setForm(p => ({ ...p, position_type: e.target.value as UnitPositionType | '' }))}>
          <option value="">Posição</option>
          {(Object.keys(POSITION_LABEL) as UnitPositionType[]).map(t => <option key={t} value={t}>{POSITION_LABEL[t]}</option>)}
        </select>
        <select className={inputCls} value={form.view_type} onChange={e => setForm(p => ({ ...p, view_type: e.target.value as UnitViewType | '' }))}>
          <option value="">Vista</option>
          {(Object.keys(VIEW_LABEL) as UnitViewType[]).map(t => <option key={t} value={t}>{VIEW_LABEL[t]}</option>)}
        </select>
        <select className={inputCls} value={form.sun_orientation} onChange={e => setForm(p => ({ ...p, sun_orientation: e.target.value as UnitSunOrientation | '' }))}>
          <option value="">Orientação</option>
          {(Object.keys(SUN_LABEL) as UnitSunOrientation[]).map(t => <option key={t} value={t}>{SUN_LABEL[t]}</option>)}
        </select>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
        </Button>
      </form>

      {/* Geração automática */}
      <div className="border border-dashed border-blue-200 rounded-[10px] overflow-hidden">
        <button onClick={() => setGenOpen(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-blue-600 hover:bg-blue-50/50 transition-colors">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Zap className="w-4 h-4" /> Gerar unidades automaticamente
          </span>
          {genOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {genOpen && (
          <form onSubmit={handleGenerate} className="px-4 pb-4 space-y-4 border-t border-blue-100 pt-4 bg-blue-50/20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Nº Pavimentos *', key: 'floors_count', type: 'number' },
                { label: 'Unid./Pavimento *', key: 'units_per_floor', type: 'number' },
                { label: 'Pav. Inicial', key: 'start_floor', type: 'number' },
                { label: 'Prefixo (opcional)', key: 'prefix', type: 'text', placeholder: 'ex: A' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">{label}</label>
                  <input type={type} min={type === 'number' ? '0' : undefined} className={inputCls + ' w-full'} placeholder={placeholder}
                    value={(genForm as any)[key]} onChange={e => setGenForm(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            {genTotal > 0 && (
              <p className="text-xs text-gray-500 font-medium">
                Exemplo: <b className="text-gray-700">{genForm.prefix ? `${genForm.prefix}-` : ''}{genForm.start_floor || 1}01</b>
                {' '}a{' '}
                <b className="text-gray-700">{genForm.prefix ? `${genForm.prefix}-` : ''}{(Number(genForm.start_floor) || 1) + (Number(genForm.floors_count) || 1) - 1}{String(Number(genForm.units_per_floor)).padStart(2, '0')}</b>
                {' '}— <b className="text-blue-600">{genTotal} unidades</b>
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Tipologia', key: 'typology', type: 'text', placeholder: 'ex: 2 Quartos' },
                { label: 'Área Priv. (m²)', key: 'private_area', type: 'number' },
                { label: 'Área Comum (m²)', key: 'common_area', type: 'number' },
                { label: 'Vagas', key: 'parking_spaces', type: 'number' },
                { label: 'Preço Padrão (R$)', key: 'price', type: 'number' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">{label}</label>
                  <input type={type} step={type === 'number' ? '0.01' : undefined} className={inputCls + ' w-full'} placeholder={placeholder}
                    value={(genForm as any)[key]} onChange={e => setGenForm(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={generating || genTotal === 0}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Gerar {genTotal > 0 ? `${genTotal} unidades` : 'Unidades'}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : units.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Layers className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-xs font-semibold">Nenhuma unidade cadastrada nesta torre.</p>
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
                <td colSpan={7} />
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
            <Button size="sm" onClick={handleBulkSave} disabled={bulkSaving}>
              {bulkSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Aplicar
            </Button>
          </div>
        </div>
      )}
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

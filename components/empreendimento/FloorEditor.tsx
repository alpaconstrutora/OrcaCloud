// components/empreendimento/FloorEditor.tsx
// Cadastro de pavimentos template (Frente B). Modelo: template + materialização.
// Cada linha = um "tipo de andar" com nome, tipo, nº inicial, repetições e un./pav.
//
// Gerar as unidades a partir destes pavimentos NÃO mora mais aqui: desde 14/10/2026
// o botão "Gerar a partir dos pavimentos" fica na seção Unidades (UnitEditor), ao
// lado de "Gerar em série" — eram dois "gerar unidades" com efeitos opostos, um em
// cada seção, e o usuário não sabia qual era qual. Este componente só publica a
// lista de pavimentos (`onFloorsChange`) para o UnitEditor contar e habilitar.
//
// Pé-direito (27/10/2026, "crie pé-direito por pavimento em empreendimento"): metros, opcional; vazio = o padrão
// da torre. A massa da Planta empilha os blocos da torre por trecho de mesma altura
// (utils/blueprintAjusteAoEmpreendimento).
//
// Elevação (27/10/2026, "sugiro incluir elevação, assim não teremos dúvida da posição do pavimento"; decisão: as duas
// formas): a coluna mostra a CALCULADA (a do térreo da torre + os pés-direitos de baixo) e o campo aceita a DIGITADA,
// que vale no lugar do cálculo. O cálculo e os avisos são os mesmos da massa da Planta (`estruturaDaTorre`).
import React from 'react';
import { Plus, Loader2, Layers, Check, X } from 'lucide-react';
import { empreendimentoService } from '../../services/empreendimentoService';
import ActionIconButton from '../ui/ActionIconButton';
import Button from '../ui/Button';
import SecaoTitulo from '../ui/SecaoTitulo';
import { useConfirm } from '../ui/confirm';
import { useToast } from '../../hooks/useToast';
import { EmpreendimentoTower, EmpreendimentoFloor, EmpreendimentoFloorInsert, FloorTipo } from '../../types';
import { estruturaDaTorre } from '../../utils/blueprintEstruturaDaTorre';

interface Props {
  tower: EmpreendimentoTower;
  /** Lista atual de pavimentos da torre — o UnitEditor usa para "Gerar a partir dos pavimentos". */
  onFloorsChange?: (towerId: string, floors: EmpreendimentoFloor[]) => void;
}

const TIPO_OPTIONS: { value: FloorTipo; label: string }[] = [
  { value: 'SUBSOLO',   label: 'Subsolo' },
  { value: 'TERREO',    label: 'Térreo' },
  { value: 'MEZANINO',  label: 'Mezanino' },
  { value: 'TIPO',      label: 'Pavimento Tipo' },
  { value: 'COBERTURA', label: 'Cobertura' },
  { value: 'TECNICO',   label: 'Técnico' },
  { value: 'GARAGEM',   label: 'Garagem' },
  { value: 'OUTRO',     label: 'Outro' },
];

// Texto colorido, sem pílula/fundo/uppercase (ui_ux_guia_unificado.md §8).
const TIPO_STYLE: Record<FloorTipo, string> = {
  SUBSOLO:   'text-slate-600',
  TERREO:    'text-emerald-600',
  MEZANINO:  'text-teal-600',
  TIPO:      'text-blue-600',
  COBERTURA: 'text-violet-600',
  TECNICO:   'text-orange-600',
  GARAGEM:   'text-gray-600',
  OUTRO:     'text-rose-600',
};

const emptyForm = () => ({
  name: '', tipo: 'TIPO' as FloorTipo,
  floor_number: '', repeat_count: '1', units_per_floor: '', prefix: '', pe_direito_m: '', elevacao_m: '',
});

/** "3,05" ou "3.05" → 3.05; vazio → null; fora de 2–15 m → `false` (a mesma faixa do banco e da massa da Planta). */
export function lerPeDireito(texto: string): number | null | false {
  const t = texto.trim().replace(',', '.');
  if (!t) return null;
  const v = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(v) && v >= 2 && v <= 15 ? v : false;
}
const fmtPeDireito = (v: number | null | undefined) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
const MSG_PE_DIREITO = 'Pé-direito entre 2,00 e 15,00 m (ou vazio, para usar o padrão da torre).';

/** "+3,50", "-6" ou "745,30" → metros; vazio → null (calculada); fora de -1000 a 10000 m → `false` (a faixa do banco). */
export function lerElevacao(texto: string): number | null | false {
  const t = texto.trim().replace(',', '.').replace(/^\+/, '');
  if (!t) return null;
  const v = Math.round(Number(t) * 100) / 100;
  return Number.isFinite(v) && v >= -1000 && v <= 10000 ? v : false;
}
/** Metros com sinal: +0,00, -6,00. */
export const fmtElevacao = (m: number) => `${m < 0 ? '-' : '+'}${Math.abs(m).toFixed(2).replace('.', ',')}`;
const fmtElevacaoDigitavel = (v: number | null | undefined) => (v == null ? '' : fmtElevacao(Number(v)));
const MSG_ELEVACAO = 'Elevação em metros, ex.: +3,00 ou -6,00 (ou vazio, para calcular pelos pés-direitos).';

export const FloorEditor: React.FC<Props> = ({ tower, onFloorsChange }) => {
  const [floors, setFloors] = React.useState<EmpreendimentoFloor[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState(emptyForm());
  const confirm = useConfirm();
  const { showToast } = useToast();
  const notify = (msg: string, type: 'success' | 'error' = 'success') => showToast(msg, type);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setFloors(await empreendimentoService.listFloors(tower.id)); }
    catch (err) { console.error('[FloorEditor] erro ao carregar:', err); }
    finally { setLoading(false); }
  }, [tower.id]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (!loading) onFloorsChange?.(tower.id, floors); }, [floors, loading, tower.id, onFloorsChange]);

  const totalAndares = floors.reduce((s, f) => s + f.repeat_count, 0);
  const totalUnidades = floors.reduce((s, f) =>
    s + f.repeat_count * (f.units_per_floor ?? tower.units_per_floor ?? 1), 0);

  // A elevação de cada andar (calculada ou digitada) e os avisos — o mesmo cálculo da massa da Planta.
  const estrutura = React.useMemo(
    () => estruturaDaTorre({ id: tower.id, name: tower.name, pe_direito_padrao_m: tower.pe_direito_padrao_m, elevacao_terreo_m: tower.elevacao_terreo_m, units: [] }, floors),
    [tower.id, tower.name, tower.pe_direito_padrao_m, tower.elevacao_terreo_m, floors],
  );
  const elevacaoDoAndar = React.useMemo(() => {
    const m = new Map<number, number>();
    for (const p of [...estrutura.garagens, ...estrutura.acima]) m.set(p.numero, p.elevacaoMm / 1000);
    return m;
  }, [estrutura]);
  const avisosDeElevacao = estrutura.avisos.filter(a => a.includes('(digitada)'));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { notify('Informe o nome do pavimento.', 'error'); return; }
    if (!form.floor_number) { notify('Informe o número inicial do pavimento.', 'error'); return; }
    const peDireito = lerPeDireito(form.pe_direito_m);
    if (peDireito === false) { notify(MSG_PE_DIREITO, 'error'); return; }
    const elevacao = lerElevacao(form.elevacao_m);
    if (elevacao === false) { notify(MSG_ELEVACAO, 'error'); return; }
    setSaving(true);
    try {
      const payload: EmpreendimentoFloorInsert = {
        tower_id: tower.id,
        name: form.name.trim(),
        tipo: form.tipo,
        floor_number: Number(form.floor_number),
        repeat_count: Number(form.repeat_count) || 1,
        units_per_floor: form.units_per_floor ? Number(form.units_per_floor) : undefined,
        prefix: form.prefix || undefined,
        pe_direito_m: peDireito,
        elevacao_m: elevacao,
        sort_order: floors.length,
      };
      // §22: entra na lista local — sem recarregar tudo (sort_order = fim da lista).
      const created = await empreendimentoService.createFloor(payload);
      setFloors(prev => [...prev, created]);
      setForm(emptyForm());
    } catch (err: any) {
      notify(`Erro ao adicionar pavimento: ${err.message}`, 'error');
    } finally { setSaving(false); }
  };

  const startEdit = (f: EmpreendimentoFloor) => {
    setEditingId(f.id);
    setEditForm({
      name: f.name,
      tipo: f.tipo,
      floor_number: String(f.floor_number),
      repeat_count: String(f.repeat_count),
      units_per_floor: f.units_per_floor != null ? String(f.units_per_floor) : '',
      prefix: f.prefix ?? '',
      pe_direito_m: fmtPeDireito(f.pe_direito_m),
      elevacao_m: fmtElevacaoDigitavel(f.elevacao_m),
    });
  };

  const handleSaveEdit = async (f: EmpreendimentoFloor) => {
    if (!editForm.name.trim()) { notify('Informe o nome do pavimento.', 'error'); return; }
    const peDireito = lerPeDireito(editForm.pe_direito_m);
    if (peDireito === false) { notify(MSG_PE_DIREITO, 'error'); return; }
    const elevacao = lerElevacao(editForm.elevacao_m);
    if (elevacao === false) { notify(MSG_ELEVACAO, 'error'); return; }
    try {
      const updated = await empreendimentoService.updateFloor(f.id, {
        name: editForm.name.trim(),
        tipo: editForm.tipo,
        floor_number: Number(editForm.floor_number),
        repeat_count: Number(editForm.repeat_count) || 1,
        units_per_floor: editForm.units_per_floor ? Number(editForm.units_per_floor) : undefined,
        prefix: editForm.prefix || undefined,
        pe_direito_m: peDireito,
        elevacao_m: elevacao,
      });
      setFloors(prev => prev.map(x => x.id === f.id ? updated : x));
      setEditingId(null);
    } catch (err: any) {
      notify(`Erro ao salvar pavimento: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (f: EmpreendimentoFloor) => {
    const ok = await confirm({
      title: `Excluir "${f.name}"?`,
      message: 'As unidades vinculadas a ele perdem a referência de pavimento (não são excluídas).',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await empreendimentoService.deleteFloor(f.id);
      setFloors(prev => prev.filter(x => x.id !== f.id));
    } catch (err: any) {
      notify(`Erro ao excluir pavimento: ${err.message}`, 'error');
    }
  };

  const inputCls = 'w-full h-9 px-3 border border-gray-200 rounded-[6px] text-sm font-normal outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition-all';
  const rotuloCls = 'text-xs font-semibold text-slate-500';
  const editCls  = 'px-2 py-1 border border-blue-200 rounded-[6px] text-xs font-medium outline-none focus:border-blue-400 bg-white';

  // Preview do nomes dos andares para a linha em edição / adição
  const previewRange = (startStr: string, repeatStr: string, tipo: FloorTipo) => {
    const s = Number(startStr);
    const r = Number(repeatStr) || 1;
    if (!startStr) return null;
    if (r === 1) return labelFloor(s, tipo);
    return `${labelFloor(s, tipo)} → ${labelFloor(s + r - 1, tipo)}`;
  };

  const previaNovo = previewRange(form.floor_number, form.repeat_count, form.tipo);

  return (
    <div className="space-y-4">
      <SecaoTitulo
        icon={Layers}
        titulo="Pavimentos"
        resumo={floors.length > 0 ? `${totalAndares} ${totalAndares === 1 ? 'andar' : 'andares'} · ${totalUnidades} unidades` : undefined}
      />

      {/* Formulário de adição — inline de propósito: pavimentos se digitam em sequência
          (subsolo, térreo, tipo ×N, cobertura), é um formulário só (§30). */}
      <form onSubmit={handleAdd} className="grid grid-cols-2 md:grid-cols-9 gap-x-6 gap-y-4 items-end">
        <div className="space-y-1.5 col-span-2">
          <label htmlFor={`pav-nome-${tower.id}`} className={rotuloCls}>Nome *</label>
          <input id={`pav-nome-${tower.id}`} className={inputCls} placeholder="ex: Pavimento Tipo" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`pav-tipo-${tower.id}`} className={rotuloCls}>Tipo *</label>
          <select id={`pav-tipo-${tower.id}`} className={inputCls} value={form.tipo}
            onChange={e => setForm(p => ({ ...p, tipo: e.target.value as FloorTipo }))}>
            {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`pav-num-${tower.id}`} className={rotuloCls}>Nº inicial *</label>
          <input id={`pav-num-${tower.id}`} className={inputCls} type="number" placeholder="ex: 1" value={form.floor_number}
            onChange={e => setForm(p => ({ ...p, floor_number: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`pav-rep-${tower.id}`} className={rotuloCls}>Repete</label>
          <input id={`pav-rep-${tower.id}`} className={inputCls} type="number" min="1" placeholder="1" value={form.repeat_count}
            onChange={e => setForm(p => ({ ...p, repeat_count: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`pav-upf-${tower.id}`} className={rotuloCls}>Un./pav.</label>
          <input id={`pav-upf-${tower.id}`} className={inputCls} type="number" min="1"
            placeholder={tower.units_per_floor ? String(tower.units_per_floor) : '—'} value={form.units_per_floor}
            onChange={e => setForm(p => ({ ...p, units_per_floor: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`pav-pd-${tower.id}`} className={rotuloCls}>Pé-direito (m)</label>
          <input id={`pav-pd-${tower.id}`} className={inputCls} inputMode="decimal"
            placeholder={tower.pe_direito_padrao_m != null ? fmtPeDireito(tower.pe_direito_padrao_m) : 'ex: 3,00'} value={form.pe_direito_m}
            onChange={e => setForm(p => ({ ...p, pe_direito_m: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`pav-elev-${tower.id}`} className={rotuloCls}>Elevação (m)</label>
          <input id={`pav-elev-${tower.id}`} className={inputCls} inputMode="decimal" placeholder="calculada" value={form.elevacao_m}
            title="Vazio = calculada (a elevação do térreo da torre + os pés-direitos de baixo)"
            onChange={e => setForm(p => ({ ...p, elevacao_m: e.target.value }))} />
        </div>
        <Button type="submit" disabled={saving} className="col-span-2 md:col-span-1">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-[15px] h-[15px]" />}
          Adicionar pavimento
        </Button>
        {previaNovo && (
          <p className="col-span-full -mt-2 text-xs text-gray-500">Andares: <span className="text-gray-700">{previaNovo}</span></p>
        )}
      </form>

      {/* Lista de pavimentos */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
      ) : floors.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-4">Nenhum pavimento cadastrado. Cadastre acima os andares da torre (ex.: Térreo, Tipo ×10, Cobertura) — com eles, a seção Unidades gera as unidades sozinha.</p>
      ) : (
        <div className="bg-white rounded-[10px] border border-gray-100 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 font-semibold bg-gray-50/50">
                <th className="py-2.5 px-4">Nome</th>
                <th className="py-2.5 px-4">Tipo</th>
                <th className="py-2.5 px-4">Nº inicial</th>
                <th className="py-2.5 px-4">Repete</th>
                <th className="py-2.5 px-4">Un./pav.</th>
                <th className="py-2.5 px-4">Pé-direito</th>
                <th className="py-2.5 px-4">Elevação</th>
                <th className="py-2.5 px-4">Andares</th>
                <th className="py-2.5 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {floors.map(f => {
                const isEd = editingId === f.id;
                const upf = f.units_per_floor ?? tower.units_per_floor;
                const pd = f.pe_direito_m ?? tower.pe_direito_padrao_m;
                const elevDe = elevacaoDoAndar.get(f.floor_number);
                const elevAte = elevacaoDoAndar.get(f.floor_number + f.repeat_count - 1);
                const rangeStr = f.repeat_count === 1
                  ? labelFloor(f.floor_number, f.tipo)
                  : `${labelFloor(f.floor_number, f.tipo)} → ${labelFloor(f.floor_number + f.repeat_count - 1, f.tipo)}`;
                return (
                  <tr key={f.id} className={`border-b border-gray-50 ${isEd ? 'bg-blue-50/30' : 'hover:bg-gray-50/40'}`}>
                    {isEd ? (
                      <>
                        <td className="py-2 px-3"><input className={editCls + ' w-full'} value={editForm.name}
                          onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} autoFocus /></td>
                        <td className="py-2 px-3">
                          <select className={editCls + ' w-full'} value={editForm.tipo}
                            onChange={e => setEditForm(p => ({ ...p, tipo: e.target.value as FloorTipo }))}>
                            {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-3"><input className={editCls + ' w-16'} type="number" value={editForm.floor_number}
                          onChange={e => setEditForm(p => ({ ...p, floor_number: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls + ' w-16'} type="number" min="1" value={editForm.repeat_count}
                          onChange={e => setEditForm(p => ({ ...p, repeat_count: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls + ' w-16'} type="number" min="1" value={editForm.units_per_floor}
                          onChange={e => setEditForm(p => ({ ...p, units_per_floor: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls + ' w-16'} inputMode="decimal" aria-label="Pé-direito (m)"
                          placeholder={tower.pe_direito_padrao_m != null ? fmtPeDireito(tower.pe_direito_padrao_m) : '—'} value={editForm.pe_direito_m}
                          onChange={e => setEditForm(p => ({ ...p, pe_direito_m: e.target.value }))} /></td>
                        <td className="py-2 px-3"><input className={editCls + ' w-20'} inputMode="decimal" aria-label="Elevação (m)"
                          placeholder={elevDe != null ? fmtElevacao(elevDe) : 'calculada'} value={editForm.elevacao_m}
                          onChange={e => setEditForm(p => ({ ...p, elevacao_m: e.target.value }))} /></td>
                        <td className="py-2 px-3 text-gray-400 italic text-xs">
                          {previewRange(editForm.floor_number, editForm.repeat_count, editForm.tipo)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleSaveEdit(f)} className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-[6px]"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-[6px]"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-4 font-normal text-gray-800">{f.name}</td>
                        <td className="py-2.5 px-4">
                          <span className={`text-xs font-normal ${TIPO_STYLE[f.tipo]}`}>
                            {TIPO_OPTIONS.find(o => o.value === f.tipo)?.label ?? f.tipo}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 font-normal">{f.floor_number}</td>
                        <td className="py-2.5 px-4 text-gray-500 font-normal">
                          {f.repeat_count > 1 ? <span className="text-blue-600">{f.repeat_count}×</span> : '1×'}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 font-normal">{upf != null ? upf : <span className="text-gray-300">—</span>}</td>
                        <td className="py-2.5 px-4 text-gray-500 font-normal" title={f.pe_direito_m == null && pd != null ? 'Padrão da torre' : undefined}>
                          {pd != null ? `${fmtPeDireito(pd)} m${f.pe_direito_m == null ? ' (torre)' : ''}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 font-normal whitespace-nowrap"
                          title={f.elevacao_m != null ? 'Digitada' : 'Calculada: a elevação do térreo da torre + os pés-direitos de baixo (3,00 m onde não há)'}>
                          {elevDe != null
                            ? <>
                                <span className={f.elevacao_m != null ? 'text-gray-800' : undefined}>{fmtElevacao(elevDe)}</span>
                                {elevAte != null && f.repeat_count > 1 ? ` → ${fmtElevacao(elevAte)}` : ''} m
                                {f.elevacao_m == null ? ' (calc.)' : ''}
                              </>
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500 text-xs font-normal">{rangeStr}</td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <ActionIconButton kind="edit" size="sm" onClick={() => startEdit(f)} />
                            <ActionIconButton kind="delete" size="sm" onClick={() => handleDelete(f)} />
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {floors.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-white font-medium text-xs text-gray-700">
                  <td className="py-2.5 px-4" colSpan={3}>
                    <span className="text-xs font-semibold text-gray-400">Total</span>
                  </td>
                  <td className="py-2.5 px-4 text-blue-600">{totalAndares} andares</td>
                  <td className="py-2.5 px-4" colSpan={5}>{totalUnidades} unidades</td>
                </tr>
              </tfoot>
            )}
          </table>
          {avisosDeElevacao.length > 0 && (
            <ul className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 space-y-0.5" data-testid="avisos-de-elevacao">
              {avisosDeElevacao.map(a => <li key={a}>{a}</li>)}
            </ul>
          )}
        </div>
      )}

    </div>
  );
};

// Formata o número do andar em label legível
function labelFloor(num: number, tipo: FloorTipo): string {
  if (tipo === 'SUBSOLO') return num < 0 ? `S${Math.abs(num)}` : `S${num}`;
  if (tipo === 'TERREO') return 'TÉR';
  if (tipo === 'MEZANINO') return 'MEZ';
  if (tipo === 'COBERTURA') return num === 1 ? 'COB' : `COB ${num}`;
  if (tipo === 'TECNICO') return `TEC ${num}`;
  if (tipo === 'GARAGEM') return `G${num}`;
  return String(num);
}

export default FloorEditor;

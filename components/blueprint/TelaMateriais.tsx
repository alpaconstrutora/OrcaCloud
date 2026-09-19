/**
 * BIBLIOTECA DE MATERIAIS (19/09/2026, roadmap E7.4) — a tela: `StandardTable`
 * dos materiais da organização (código, nome, fonte, unidade, custo,
 * fabricante, densidade, condutividade, cor, função, espessura padrão), com
 * uso no desenho aberto (m², m³, m, massa e custo estimado), formulário
 * in-flow para criar/editar, importar do catálogo SINAPI (o código entra como
 * está) e "Semear biblioteca padrão" (12 materiais internos com densidade e
 * condutividade, custo zero para a org preencher). Desativar não apaga: o
 * código continua resolvível para as plantas que o citam.
 */
import React, { useMemo, useState } from 'react';
import { BookOpen, Download, Plus, Sprout } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import DatabasePickerModal from '../DatabasePickerModal';
import { useConfirm } from '../ui/confirm';
import type { NovoMaterial } from '../../services/blueprintMaterialService';
import { FUNCOES_DE_CAMADA, type FuncaoCamada } from '../../utils/blueprintKernel';
import { MATERIAIS_SEMENTE, UNIDADES_DE_MATERIAL, resumirUso, validarMaterial, type Material, type UsoDeMaterial } from '../../utils/blueprintMateriais';

interface Props {
  materiais: Material[];
  carregando: boolean;
  indisponivel: string | null;
  /** Uso de cada código no desenho aberto (paredes, pisos, forros, rodapés, guarda-corpos). */
  usosPorCodigo: Map<string, UsoDeMaterial[]>;
  onCriar: (m: NovoMaterial) => Promise<void>;
  onAtualizar: (id: string, m: Partial<NovoMaterial> & { active?: boolean }) => Promise<void>;
  onDesativar: (id: string) => Promise<void>;
  /** Semeia os que ainda não existem (por código). */
  onSemear: (lista: NovoMaterial[]) => Promise<void>;
}

const ROTULO_FUNCAO: Record<FuncaoCamada, string> = { ESTRUTURAL: 'Estrutural', VEDACAO: 'Vedação', REVESTIMENTO: 'Revestimento', ISOLAMENTO: 'Isolamento', ACABAMENTO: 'Acabamento', CAMARA_AR: 'Câmara de ar' };
const COLUNAS: StandardTableColumn[] = [
  { key: 'codigo', label: 'Código', width: 130 },
  { key: 'nome', label: 'Material', width: 240 },
  { key: 'fonte', label: 'Fonte', width: 90 },
  { key: 'unidade', label: 'Un.', width: 70 },
  { key: 'custo', label: 'Custo (R$)', width: 110, align: 'right' },
  { key: 'fabricante', label: 'Fabricante', width: 150 },
  { key: 'densidadeKgM3', label: 'ρ (kg/m³)', width: 100, align: 'right' },
  { key: 'condutividadeWmK', label: 'λ (W/m·K)', width: 100, align: 'right' },
  { key: 'funcao', label: 'Função', width: 120 },
  { key: 'espessuraPadraoMm', label: 'e (mm)', width: 80, align: 'right' },
  { key: 'uso', label: 'Uso no desenho', width: 260, sortable: false },
  { key: 'active', label: 'Ativo', width: 70 },
];
const fmt = (n: number, casas = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

type Form = NovoMaterial & { id?: string };
const FORM_VAZIO: Form = { codigo: '', nome: '', fonte: 'INTERNA', unidade: 'm²', custo: 0, fabricante: null, densidadeKgM3: null, condutividadeWmK: null, cor: null, funcao: null, espessuraPadraoMm: null, propriedades: {} };

export default function TelaMateriais({ materiais, carregando, indisponivel, usosPorCodigo, onCriar, onAtualizar, onDesativar, onSemear }: Props) {
  const confirm = useConfirm();
  const [form, setForm] = useState<Form | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const porCodigo = useMemo(() => new Map(materiais.map((m) => [m.codigo, m])), [materiais]);
  const faltamSementes = MATERIAIS_SEMENTE.filter((s) => !porCodigo.has(s.codigo));

  const usados = [...usosPorCodigo.keys()].filter((c) => c);
  const semMaterial = usados.filter((c) => !porCodigo.has(c));

  async function salvar() {
    if (!form) return;
    const e = validarMaterial(form);
    if (e.length) {
      setErros(e);
      return;
    }
    if (!form.id && porCodigo.has(form.codigo.trim())) {
      setErros([`já existe um material com o código ${form.codigo.trim()}`]);
      return;
    }
    setSalvando(true);
    setErros([]);
    try {
      const { id, ...dados } = form;
      if (id) await onAtualizar(id, dados);
      else await onCriar(dados);
      setForm(null);
      setAviso(id ? 'Material atualizado.' : 'Material criado.');
    } catch (err) {
      setErros([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSalvando(false);
    }
  }

  const campo = 'h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm';
  const num = (v: number | null | undefined) => (v == null ? '' : String(v));

  return (
    <div className="space-y-4" data-testid="tela-materiais">
      {indisponivel && (
        <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="materiais-indisponivel">
          Biblioteca sem persistência (migration ausente ou sem permissão): {indisponivel}
        </p>
      )}
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="resumo-dos-materiais">
        <strong>{materiais.length} material(is)</strong> na biblioteca · {usados.length} código(s) em uso no desenho
        {semMaterial.length > 0 && (
          <span className="text-amber-800"> · {semMaterial.length} código(s) do desenho fora da biblioteca: {semMaterial.slice(0, 6).join(', ')}{semMaterial.length > 6 ? '…' : ''}</span>
        )}
        <p className="mt-1 text-xs text-slate-500">
          O código do material é o mesmo `itemCode` que a camada, o piso, o rodapé e o guarda-corpo carregam no desenho — SINAPI ou interno. A biblioteca resolve o código (nome, custo, densidade, condutividade) na tela e no orçamento; desativar um material não mexe em planta nenhuma. Massa = volume × densidade; resistência térmica = Σ e/λ (NBR 15220).
        </p>
        {aviso && <p className="mt-1 text-xs text-emerald-700">{aviso}</p>}
      </div>

      {form && (
        <div className="rounded-[10px] border border-blue-200 bg-blue-50/40 p-4" data-testid="form-material">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">{form.id ? `Editar ${form.codigo}` : 'Novo material'}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Código
              <input value={form.codigo} disabled={!!form.id} onChange={(e) => setForm({ ...form, codigo: e.target.value })} aria-label="Código do material" placeholder="87879 ou INT-PORC-60" className={campo} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-600">
              Nome
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} aria-label="Nome do material" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Fonte
              <select value={form.fonte} onChange={(e) => setForm({ ...form, fonte: e.target.value as Material['fonte'] })} aria-label="Fonte do material" className={campo}>
                <option value="INTERNA">Interna</option>
                <option value="SINAPI">SINAPI</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Unidade
              <select value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} aria-label="Unidade do material" className={campo}>
                {[...new Set([...UNIDADES_DE_MATERIAL, form.unidade])].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Custo (R$ / unidade)
              <input type="number" min={0} step={0.01} value={form.custo} onChange={(e) => setForm({ ...form, custo: Number(e.target.value) })} aria-label="Custo do material" className={campo} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-600">
              Fabricante
              <input value={form.fabricante ?? ''} onChange={(e) => setForm({ ...form, fabricante: e.target.value || null })} aria-label="Fabricante do material" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Densidade (kg/m³)
              <input type="number" min={0} step={1} value={num(form.densidadeKgM3)} onChange={(e) => setForm({ ...form, densidadeKgM3: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Densidade do material" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Condutividade λ (W/m·K)
              <input type="number" min={0} step={0.001} value={num(form.condutividadeWmK)} onChange={(e) => setForm({ ...form, condutividadeWmK: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Condutividade do material" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Função construtiva
              <select value={form.funcao ?? ''} onChange={(e) => setForm({ ...form, funcao: (e.target.value || null) as FuncaoCamada | null })} aria-label="Função construtiva do material" className={campo}>
                <option value="">—</option>
                {FUNCOES_DE_CAMADA.map((f) => (
                  <option key={f} value={f}>{ROTULO_FUNCAO[f]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Espessura padrão (mm)
              <input type="number" min={1} step={1} value={num(form.espessuraPadraoMm)} onChange={(e) => setForm({ ...form, espessuraPadraoMm: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Espessura padrão do material" className={campo} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              Cor no desenho
              <span className="flex items-center gap-2">
                <input type="color" value={form.cor ?? '#e2e8f0'} onChange={(e) => setForm({ ...form, cor: e.target.value })} aria-label="Cor do material" className="h-9 w-12 rounded border border-slate-300" />
                <button type="button" onClick={() => setForm({ ...form, cor: null })} className="text-xs text-slate-500 underline-offset-2 hover:underline">padrão da função</button>
              </span>
            </label>
          </div>
          {erros.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-red-700" data-testid="erros-do-material">
              {erros.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={salvar} disabled={salvando} className="inline-flex h-9 items-center rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="salvar-material">
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={() => { setForm(null); setErros([]); }} className="inline-flex h-9 items-center rounded-[6px] border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <StandardTable<Material>
        columns={COLUNAS}
        storageKey="blueprint:materiais"
        rows={materiais}
        rowKey={(m) => m.id}
        loading={carregando}
        toolbarRight={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setImportando(true)} className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" data-testid="importar-sinapi">
              <Download className="h-4 w-4" /> Importar do catálogo
            </button>
            <button type="button" disabled={faltamSementes.length === 0} onClick={() => onSemear([...faltamSementes])} className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50" data-testid="semear-materiais" title="Cria os materiais internos padrão que ainda não existem (bloco, concreto, reboco, contrapiso, porcelanato, cerâmica, gesso, EPS, lã de rocha, rodapé, guarda-corpos) com densidade e condutividade; custo zero para preencher">
              <Sprout className="h-4 w-4" /> Semear padrão ({faltamSementes.length})
            </button>
            <button type="button" onClick={() => { setForm({ ...FORM_VAZIO }); setErros([]); setAviso(null); }} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700" data-testid="novo-material">
              <Plus className="h-4 w-4" /> Novo material
            </button>
          </div>
        }
        renderCell={(key, m) => {
          switch (key) {
            case 'codigo':
              return <span className="font-mono text-xs text-slate-700">{m.codigo}</span>;
            case 'nome':
              return (
                <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                  {m.cor && <span className="inline-block h-3 w-3 rounded-sm border border-slate-300" style={{ backgroundColor: m.cor }} />}
                  {m.nome}
                </span>
              );
            case 'fonte':
              return <span className="text-xs text-gray-600">{m.fonte === 'SINAPI' ? 'SINAPI' : 'Interna'}</span>;
            case 'unidade':
              return <span className="text-sm text-gray-700">{m.unidade}</span>;
            case 'custo':
              return <span className="block text-right text-sm tabular-nums text-gray-900">{m.custo ? fmt(m.custo) : <span className="text-amber-700">—</span>}</span>;
            case 'fabricante':
              return <span className="text-sm text-gray-600">{m.fabricante ?? '—'}</span>;
            case 'densidadeKgM3':
              return <span className="block text-right text-sm tabular-nums text-gray-700">{m.densidadeKgM3 != null ? fmt(m.densidadeKgM3, 0) : '—'}</span>;
            case 'condutividadeWmK':
              return <span className="block text-right text-sm tabular-nums text-gray-700">{m.condutividadeWmK != null ? fmt(m.condutividadeWmK, 3) : '—'}</span>;
            case 'funcao':
              return <span className="text-xs text-gray-600">{m.funcao ? ROTULO_FUNCAO[m.funcao] : '—'}</span>;
            case 'espessuraPadraoMm':
              return <span className="block text-right text-sm tabular-nums text-gray-700">{m.espessuraPadraoMm ?? '—'}</span>;
            case 'uso': {
              const usos = usosPorCodigo.get(m.codigo) ?? [];
              if (usos.length === 0) return <span className="text-xs text-gray-300">—</span>;
              const r = resumirUso(usos, m);
              const partes: string[] = [];
              if (r.areaM2 > 0) partes.push(`${fmt(r.areaM2)} m²`);
              if (r.volumeM3 > 0) partes.push(`${fmt(r.volumeM3, 3)} m³`);
              if (r.comprimentoM > 0) partes.push(`${fmt(r.comprimentoM)} m`);
              if (r.massaKg != null) partes.push(`≈ ${fmt(r.massaKg, 0)} kg`);
              if (r.custo != null && r.custo > 0) partes.push(`R$ ${fmt(r.custo)}`);
              return <span className="text-xs text-gray-700" title={[...new Set(usos.map((u) => u.origem))].join(', ')}>{partes.join(' · ')}</span>;
            }
            case 'active':
              return <span className={`text-xs ${m.active ? 'text-emerald-700' : 'text-gray-400'}`}>{m.active ? 'sim' : 'não'}</span>;
            default:
              return null;
          }
        }}
        sortValue={(key, m) => (key === 'uso' ? null : (m as unknown as Record<string, string | number | boolean | null>)[key])}
        searchText={(m) => `${m.codigo} ${m.nome} ${m.fabricante ?? ''} ${m.funcao ?? ''}`}
        searchPlaceholder="Buscar material..."
        empty={{ icon: <BookOpen className="h-8 w-8 text-slate-300" />, title: 'Biblioteca vazia', subtitle: 'Semeie a biblioteca padrão, importe do catálogo SINAPI ou crie um material interno.' }}
        actions={{
          render: (m) => (
            <span className="flex items-center gap-1">
              <ActionIconButton kind="edit" title="Editar material" onClick={() => { setForm({ ...m }); setErros([]); setAviso(null); }} />
              {m.active ? (
                <ActionIconButton
                  kind="delete"
                  title="Desativar material (o código continua valendo nas plantas)"
                  onClick={async () => {
                    const ok = await confirm({ title: `Desativar ${m.nome}?`, message: 'Ele some da lista de escolha; as plantas que já usam o código continuam iguais.', confirmLabel: 'Desativar', variant: 'warning' });
                    if (ok) await onDesativar(m.id);
                  }}
                />
              ) : (
                <button type="button" onClick={() => onAtualizar(m.id, { active: true })} className="text-xs text-blue-700 hover:underline">reativar</button>
              )}
            </span>
          ),
        }}
      />

      <DatabasePickerModal
        isOpen={importando}
        onClose={() => setImportando(false)}
        title="Importar material do catálogo"
        subtitle="O código SINAPI (ou da base própria) entra como está; ajuste densidade, condutividade e função antes de salvar."
        onSelect={(item) => {
          setImportando(false);
          setForm({ ...FORM_VAZIO, codigo: item.code, nome: item.description, fonte: 'SINAPI', unidade: item.unit || 'm²', custo: Number(item.price ?? 0) });
          setErros([]);
          setAviso(null);
        }}
      />
    </div>
  );
}

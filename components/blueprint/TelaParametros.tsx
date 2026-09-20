/**
 * DEFINIÇÕES DE PARÂMETRO (20/09/2026, backlog P2 — P2.5): a tela in-flow onde a
 * organização vê, edita e exclui as definições de parâmetro personalizado
 * (E1.2) e as fórmulas (E1.3) — até aqui só nasciam inline no painel da peça,
 * e "recriar com o mesmo nome" era o único jeito de mudar uma fórmula.
 *
 * A CHAVE não se edita: é ela que as peças carregam no payload. Excluir a
 * definição não apaga valor nenhum — a peça continua com a chave e o painel a
 * mostra como "sem definição". `compartilhado` desligado = a chave não sai no
 * IFC nem na planilha (o filtro que a E1.2 declarou e a P2.5 liga).
 */
import React, { useMemo, useState } from 'react';
import { EyeOff, Pencil, Sigma } from 'lucide-react';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import type { DefinicaoDeParametro, TipoDeParametro } from '../../services/blueprintParameterDefinitionService';
import type { FamiliaComParametros } from '../../utils/blueprintKernel';
import { erroDeSintaxe } from '../../utils/blueprintFormulas';
import { ROTULO_DA_FAMILIA_COM_PARAMETROS } from './PainelParametros';

interface Props {
  definicoes: DefinicaoDeParametro[];
  carregando: boolean;
  /** Quantas peças do desenho carregam cada chave (`usosPorChave`). */
  usos: ReadonlyMap<string, number>;
  nomeDaOrg: (id: string) => string;
  mostrarOrg: boolean;
  onEditar: (id: string, patch: Partial<Pick<DefinicaoDeParametro, 'nome' | 'familia' | 'unidade' | 'opcoes' | 'compartilhado' | 'formula'>>) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
}

const ROTULO_DO_TIPO: Record<TipoDeParametro, string> = { NUMERO: 'Número', TEXTO: 'Texto', BOOLEANO: 'Sim/não', LISTA: 'Lista' };

const COLUNAS: StandardTableColumn[] = [
  { key: 'nome', label: 'Nome', width: 220 },
  { key: 'chave', label: 'Chave', width: 160 },
  { key: 'familia', label: 'Família', width: 130 },
  { key: 'tipo', label: 'Tipo', width: 110 },
  { key: 'formula', label: 'Fórmula', width: 260 },
  { key: 'compartilhado', label: 'Sai nas saídas', width: 120 },
  { key: 'usos', label: 'No desenho', width: 100, align: 'right' },
  { key: 'org', label: 'Organização', width: 170 },
];

interface Rascunho {
  id: string;
  nome: string;
  familia: FamiliaComParametros | '';
  unidade: string;
  opcoes: string;
  compartilhado: boolean;
  formula: string;
}

/** Conta, por chave, quantas peças do desenho carregam o parâmetro — puro, exportado para teste. */
export function usosPorChave(model: { walls: { parametros?: Record<string, unknown> }[]; openings: { parametros?: Record<string, unknown> }[]; structures: { parametros?: Record<string, unknown> }[]; roofs?: { parametros?: Record<string, unknown> }[]; stairs?: { parametros?: Record<string, unknown> }[]; trechos?: { parametros?: Record<string, unknown> }[]; terminais?: { parametros?: Record<string, unknown> }[]; quadros?: { parametros?: Record<string, unknown> }[] }): Map<string, number> {
  const m = new Map<string, number>();
  for (const lista of [model.walls, model.openings, model.structures, model.roofs ?? [], model.stairs ?? [], model.trechos ?? [], model.terminais ?? [], model.quadros ?? []]) {
    for (const x of lista) for (const k of Object.keys(x.parametros ?? {})) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export default function TelaParametros({ definicoes, carregando, usos, nomeDaOrg, mostrarOrg, onEditar, onExcluir }: Props) {
  const confirmar = useConfirm();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const colunas = mostrarOrg ? COLUNAS : COLUNAS.filter((c) => c.key !== 'org');
  const erroDaFormula = useMemo(() => (rascunho?.formula.trim() ? erroDeSintaxe(rascunho.formula) : null), [rascunho?.formula]);
  const privadas = definicoes.filter((d) => !d.compartilhado).length;

  function abrir(d: DefinicaoDeParametro) {
    setRascunho({ id: d.id, nome: d.nome, familia: d.familia ?? '', unidade: d.unidade, opcoes: d.opcoes.join('; '), compartilhado: d.compartilhado, formula: d.formula });
    setErro(null);
  }

  async function salvar() {
    if (!rascunho) return;
    if (rascunho.nome.trim().length < 2) {
      setErro('Nome com pelo menos 2 caracteres.');
      return;
    }
    if (erroDaFormula) {
      setErro(`Fórmula inválida: ${erroDaFormula}`);
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      await onEditar(rascunho.id, {
        nome: rascunho.nome,
        familia: rascunho.familia === '' ? null : rascunho.familia,
        unidade: rascunho.unidade,
        opcoes: rascunho.opcoes.split(/[;\n]/).map((o) => o.trim()).filter(Boolean),
        compartilhado: rascunho.compartilhado,
        formula: rascunho.formula,
      });
      setAviso(`Definição "${rascunho.nome.trim()}" atualizada.`);
      setRascunho(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function excluir(d: DefinicaoDeParametro) {
    const n = usos.get(d.chave) ?? 0;
    const ok = await confirmar({
      title: `Excluir a definição "${d.nome}"`,
      message: (n > 0 ? `${n} peça(s) do desenho carregam a chave "${d.chave}" e CONTINUAM com o valor — o painel passa a mostrá-lo como "sem definição". ` : '') + 'O campo some do painel de todas as peças da organização.',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    setOcupado(true);
    setErro(null);
    try {
      await onExcluir(d.id);
      setAviso(`Definição "${d.nome}" excluída.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  const campo = 'h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-xs text-slate-800';

  return (
    <div className="space-y-4" data-testid="tela-parametros">
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="como-funcionam-os-parametros">
        <p className="font-semibold text-slate-800">Como funciona</p>
        <p className="mt-1">
          Cada definição vira um campo no painel das peças da família (ou de todas). A <strong>chave</strong> é o que a peça grava e não muda; nome, unidade, opções, fórmula e família mudam aqui. <strong>Fórmula</strong> = valor calculado na hora, nunca gravado. <strong>"Sai nas saídas"</strong> desligado mantém o valor na peça e na tela, mas o tira do IFC e da planilha ({privadas} privada(s) hoje). Excluir a definição não apaga valor de peça nenhuma.
        </p>
      </div>

      {erro && <p className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="erro-de-parametros">{erro}</p>}
      {aviso && <p className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="aviso-de-parametros">{aviso}</p>}

      {rascunho && (
        <div className="rounded-[10px] border border-blue-200 bg-blue-50/40 p-4" data-testid="form-definicao">
          <p className="text-sm font-semibold text-slate-800">Editar definição · chave <code className="text-xs">{definicoes.find((d) => d.id === rascunho.id)?.chave}</code></p>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Nome<input value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} aria-label="Nome da definição" className={campo} /></label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Família
              <select value={rascunho.familia} onChange={(e) => setRascunho({ ...rascunho, familia: e.target.value as FamiliaComParametros | '' })} aria-label="Família da definição" className={campo}>
                <option value="">todas</option>
                {(Object.keys(ROTULO_DA_FAMILIA_COM_PARAMETROS) as FamiliaComParametros[]).map((f) => (
                  <option key={f} value={f}>{ROTULO_DA_FAMILIA_COM_PARAMETROS[f]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Unidade<input value={rascunho.unidade} onChange={(e) => setRascunho({ ...rascunho, unidade: e.target.value })} aria-label="Unidade da definição" className={campo} /></label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 md:col-span-2">Fórmula (vazia = valor digitado)
              <input value={rascunho.formula} onChange={(e) => setRascunho({ ...rascunho, formula: e.target.value })} aria-label="Fórmula da definição" placeholder="Ex.: comprimento_m * altura_m" className={`${campo} font-mono`} />
              {erroDaFormula && <span className="text-[11px] text-red-700" data-testid="erro-da-formula">{erroDaFormula}</span>}
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">Opções (lista; separe por ;)<input value={rascunho.opcoes} onChange={(e) => setRascunho({ ...rascunho, opcoes: e.target.value })} aria-label="Opções da definição" className={campo} /></label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 md:col-span-3">
              <input type="checkbox" checked={rascunho.compartilhado} onChange={(e) => setRascunho({ ...rascunho, compartilhado: e.target.checked })} aria-label="Sai nas saídas (IFC e planilha)" />
              Sai nas saídas (IFC e planilha)
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={ocupado} onClick={() => void salvar()} className="h-9 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300" data-testid="salvar-definicao">Salvar</button>
            <button type="button" onClick={() => setRascunho(null)} className="h-9 rounded-[6px] px-3 text-sm text-slate-600 hover:bg-white">Cancelar</button>
          </div>
        </div>
      )}

      <StandardTable<DefinicaoDeParametro>
        columns={colunas}
        storageKey="blueprint:definicoes-de-parametro"
        rows={definicoes}
        rowKey={(d) => d.id}
        loading={carregando}
        empty={{ title: 'Nenhuma definição', subtitle: 'Crie pelo painel de uma peça ("Nova definição"): o campo passa a existir em toda peça da família.' }}
        actions={{
          label: 'Ações',
          width: 90,
          render: (d) => (
            <span className="flex items-center gap-1">
              <ActionIconButton kind="edit" icon={<Pencil className="h-4 w-4" />} title={`Editar ${d.nome}`} onClick={() => abrir(d)} />
              <ActionIconButton kind="delete" title={`Excluir ${d.nome}`} onClick={() => void excluir(d)} />
            </span>
          ),
        }}
        renderCell={(key, d) => {
          switch (key) {
            case 'nome':
              return <span className="text-sm font-medium text-gray-800">{d.nome}{d.unidade ? <span className="ml-1 text-xs text-gray-500">({d.unidade})</span> : null}</span>;
            case 'chave':
              return <code className="text-xs text-slate-600">{d.chave}</code>;
            case 'familia':
              return <span className="text-xs text-gray-600">{d.familia ? ROTULO_DA_FAMILIA_COM_PARAMETROS[d.familia] : 'todas'}</span>;
            case 'tipo':
              return <span className="text-xs text-gray-600">{ROTULO_DO_TIPO[d.tipo]}{d.tipo === 'LISTA' && d.opcoes.length ? ` (${d.opcoes.length})` : ''}</span>;
            case 'formula':
              return d.formula ? <span className="flex items-center gap-1 font-mono text-xs text-slate-700"><Sigma className="h-3.5 w-3.5 text-slate-400" />{d.formula}</span> : <span className="text-xs text-gray-400">valor digitado</span>;
            case 'compartilhado':
              return d.compartilhado ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">sim</span> : <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800" data-testid={`privada-${d.chave}`}><EyeOff className="h-3 w-3" /> privada</span>;
            case 'usos': {
              const n = usos.get(d.chave) ?? 0;
              return <span className={`text-sm ${n > 0 ? 'text-gray-800' : 'text-gray-400'}`} data-testid={`usos-${d.chave}`}>{n > 0 ? n : '—'}</span>;
            }
            case 'org':
              return <span className="text-xs text-gray-600">{nomeDaOrg(d.organizationId)}</span>;
            default:
              return null;
          }
        }}
      />
    </div>
  );
}

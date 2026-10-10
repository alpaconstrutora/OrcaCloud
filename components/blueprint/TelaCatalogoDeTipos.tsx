/**
 * CATÁLOGO DE TIPOS (20/09/2026, backlog P2 — P2.3): a tela in-flow onde a
 * organização vê todos os seus tipos de elemento (estrutura, ponto, escada,
 * telhado, componente, piso, forro), renomeia, desativa/reativa, exclui, vê
 * quantas peças do desenho aberto têm cada assinatura, semeia os padrões e
 * copia o catálogo para outra organização.
 *
 * O tipo é MOLDE (E1.1): a peça carrega o valor copiado. Excluir ou desativar
 * um tipo não mexe em planta nenhuma — a tela diz isso antes.
 */
import React, { useMemo, useState } from 'react';
import { BookMarked, Copy, Pencil, Power, SlidersHorizontal, Sprout } from 'lucide-react';
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetTitle } from '../ui/sheet';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { ROTULO_DA_FAMILIA_DE_TIPO, resumoDoTipo } from '../../utils/blueprintTipos';
import { aplicarCamposAoTipo, camposEditaveisDoTipo, faltamSementes, usosDoTipo, validarNomeDeTipo, type SementeDeTipo, type TipoDoCatalogo } from '../../utils/blueprintCatalogoDeTipos';
import type { PropriedadesDoTipo } from '../../utils/blueprintTipos';

interface Props {
  tipos: TipoDoCatalogo[];
  carregando: boolean;
  indisponivel: string | null;
  /** Usos por assinatura no desenho aberto (`usosPorAssinatura`). */
  usos: ReadonlyMap<string, number>;
  /** Nome da organização por id — a coluna aparece quando o topo está em "Todas". */
  nomeDaOrg: (id: string) => string;
  mostrarOrg: boolean;
  onRenomear: (id: string, nome: string) => Promise<void>;
  /** F15 (10/10/2026): grava as propriedades numéricas editadas (capacidade, potência, medidas…). */
  onEditarPropriedades?: (id: string, propriedades: PropriedadesDoTipo) => Promise<void>;
  onAtivar: (id: string, active: boolean) => Promise<void>;
  onExcluir: (id: string) => Promise<void>;
  /** Grava as sementes que faltam (a organização de destino é resolvida por quem chama — REGRA #5). */
  onSemear: (lista: SementeDeTipo[]) => Promise<void>;
  /** Copia os tipos ativos para outra organização (quem chama abre o modal de organização). */
  onCopiar: (lista: SementeDeTipo[]) => Promise<void>;
}

const COLUNAS: StandardTableColumn[] = [
  { key: 'familia', label: 'Família', width: 170 },
  { key: 'nome', label: 'Nome', width: 240 },
  { key: 'resumo', label: 'Propriedades', width: 320 },
  { key: 'usos', label: 'No desenho', width: 100, align: 'right' },
  { key: 'org', label: 'Organização', width: 180 },
  { key: 'status', label: 'Status', width: 90 },
];

export default function TelaCatalogoDeTipos({ tipos, carregando, indisponivel, usos, nomeDaOrg, mostrarOrg, onRenomear, onEditarPropriedades, onAtivar, onExcluir, onSemear, onCopiar }: Props) {
  const confirmar = useConfirm();
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  /** F15: o tipo cujas propriedades estão abertas no painel, com os valores digitados. */
  const [propriedades, setPropriedades] = useState<{ tipo: TipoDoCatalogo; valores: Record<string, string>; erro: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const colunas = mostrarOrg ? COLUNAS : COLUNAS.filter((c) => c.key !== 'org');
  const sementes = useMemo(() => faltamSementes(tipos), [tipos]);
  const ativos = tipos.filter((t) => t.active);

  async function rodar(acao: () => Promise<void>, sucesso?: string) {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      if (sucesso) setAviso(sucesso);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  async function salvarNome(t: TipoDoCatalogo) {
    if (!editando) return;
    const invalido = validarNomeDeTipo(editando.nome, tipos, t.familia, t.id);
    if (invalido) {
      setErro(invalido);
      return;
    }
    await rodar(async () => {
      await onRenomear(t.id, editando.nome.trim());
      setEditando(null);
    });
  }

  function abrirPropriedades(t: TipoDoCatalogo) {
    setPropriedades({ tipo: t, valores: Object.fromEntries(camposEditaveisDoTipo(t.propriedades).map((c) => [c.chave, String(c.valor)])), erro: null });
  }

  async function salvarPropriedades() {
    if (!propriedades || !onEditarPropriedades) return;
    const r = aplicarCamposAoTipo(propriedades.tipo.propriedades, propriedades.valores);
    if ('erro' in r) {
      setPropriedades({ ...propriedades, erro: r.erro });
      return;
    }
    const t = propriedades.tipo;
    await rodar(async () => {
      await onEditarPropriedades(t.id, r.propriedades);
      setPropriedades(null);
    }, `Propriedades do tipo "${t.nome}" gravadas.`);
  }

  async function excluir(t: TipoDoCatalogo) {
    const n = usosDoTipo(t, usos);
    const ok = await confirmar({
      title: `Excluir o tipo "${t.nome}"`,
      message: (n > 0 ? `${n} peça(s) do desenho têm esta assinatura e CONTINUAM como estão — o tipo é molde, a peça carrega o valor. ` : '') + 'O tipo some do seletor "aplicar tipo…" de toda a organização.',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    await rodar(() => onExcluir(t.id), `Tipo "${t.nome}" excluído.`);
  }

  return (
    <div className="space-y-4" data-testid="tela-catalogo-de-tipos">
      <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm text-slate-700" data-testid="como-funciona-o-catalogo">
        <p className="font-semibold text-slate-800">Como funciona</p>
        <p className="mt-1">
          O tipo é <strong>molde</strong>: "aplicar tipo…" no painel da peça copia as propriedades para ela, e "salvar tipo" cria um tipo a partir da peça. A peça não aponta para o tipo — <strong>"no desenho"</strong> conta as peças com exatamente as mesmas propriedades. Renomear, desativar ou excluir um tipo não muda peça nenhuma. Desativado some do seletor e fica aqui para reativar.
        </p>
      </div>

      {indisponivel && <p className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Catálogo indisponível: {indisponivel}</p>}
      {erro && <p className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="erro-do-catalogo">{erro}</p>}
      {aviso && <p className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" data-testid="aviso-do-catalogo">{aviso}</p>}

      <StandardTable<TipoDoCatalogo>
        columns={colunas}
        storageKey="blueprint:catalogo-de-tipos"
        rows={tipos}
        rowKey={(t) => t.id}
        loading={carregando}
        empty={{ title: 'Nenhum tipo ainda', subtitle: 'Salve um tipo pelo painel de uma peça ("salvar tipo") ou semeie os padrões.' }}
        toolbarRight={
          <div className="flex items-center gap-2">
            <button type="button" disabled={ocupado || sementes.length === 0} onClick={() => void rodar(() => onSemear([...sementes]), `${sementes.length} tipo(s) padrão criados.`)} className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50" data-testid="semear-tipos" title={sementes.length === 0 ? 'Todos os tipos padrão já existem' : `Cria ${sementes.length} tipo(s) padrão que ainda não existem: pilares, vigas, laje, baldrame, estaca, pontos elétricos da NBR 5410, escada, rampa e telhados`}>
              <Sprout className="h-4 w-4" /> Semear padrões{sementes.length > 0 ? ` (${sementes.length})` : ''}
            </button>
            <button type="button" disabled={ocupado || ativos.length === 0} onClick={() => void rodar(() => onCopiar(ativos.map((t) => ({ nome: t.nome, propriedades: t.propriedades }))))} className="inline-flex h-9 items-center gap-1 rounded-[6px] border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50" data-testid="copiar-tipos" title="Leva os tipos ativos para outra organização (mesmo nome sobrescreve)">
              <Copy className="h-4 w-4" /> Copiar para organização…
            </button>
          </div>
        }
        actions={{
          label: 'Ações',
          width: 150,
          render: (t) => (
            <span className="flex items-center gap-1">
              <ActionIconButton kind="edit" icon={<Pencil className="h-4 w-4" />} title={`Renomear ${t.nome}`} onClick={() => { setEditando({ id: t.id, nome: t.nome }); setErro(null); }} />
              {/* Sem propriedade numérica (escada, telhado…) não há o que editar aqui — o botão nem aparece. */}
              {onEditarPropriedades && camposEditaveisDoTipo(t.propriedades).length > 0 && (
                <ActionIconButton kind="edit" icon={<SlidersHorizontal className="h-4 w-4" />} title={`Editar propriedades de ${t.nome}`} onClick={() => abrirPropriedades(t)} />
              )}
              <ActionIconButton kind="edit" icon={<Power className="h-4 w-4" />} title={t.active ? `Desativar ${t.nome} (some do seletor)` : `Reativar ${t.nome}`} onClick={() => void rodar(() => onAtivar(t.id, !t.active))} />
              <ActionIconButton kind="delete" title={`Excluir ${t.nome}`} onClick={() => void excluir(t)} />
            </span>
          ),
        }}
        renderCell={(key, t) => {
          switch (key) {
            case 'familia':
              return <span className="flex items-center gap-1.5 text-xs text-gray-600"><BookMarked className="h-3.5 w-3.5 text-slate-400" />{ROTULO_DA_FAMILIA_DE_TIPO[t.familia]}</span>;
            case 'nome':
              return editando?.id === t.id ? (
                <span className="flex items-center gap-1">
                  <input value={editando.nome} onChange={(e) => setEditando({ id: t.id, nome: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void salvarNome(t); if (e.key === 'Escape') setEditando(null); }} aria-label="Novo nome do tipo" className="h-8 w-48 rounded-[6px] border border-slate-300 bg-white px-2 text-sm text-slate-800" autoFocus />
                  <button type="button" onClick={() => void salvarNome(t)} className="h-8 rounded-[6px] bg-blue-600 px-2 text-xs font-medium text-white hover:bg-blue-700" data-testid="salvar-nome-do-tipo">Salvar</button>
                  <button type="button" onClick={() => setEditando(null)} className="h-8 rounded-[6px] px-2 text-xs text-slate-600 hover:bg-slate-50">Cancelar</button>
                </span>
              ) : (
                <span className={`text-sm font-medium ${t.active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{t.nome}</span>
              );
            case 'resumo':
              return <span className="text-xs text-gray-600">{resumoDoTipo(t.propriedades)}</span>;
            case 'usos': {
              const n = usosDoTipo(t, usos);
              return <span className={`text-sm ${n > 0 ? 'text-gray-800' : 'text-gray-400'}`} data-testid={`usos-${t.id}`}>{n > 0 ? n : '—'}</span>;
            }
            case 'org':
              return <span className="text-xs text-gray-600">{nomeDaOrg(t.organizationId)}</span>;
            case 'status':
              return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${t.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{t.active ? 'ativo' : 'inativo'}</span>;
            default:
              return null;
          }
        }}
      />

      {/* F15: o painel lateral das propriedades — montado só aberto (o Sheet fechado manteria os filhos no DOM). */}
      {propriedades && (
        <Sheet open onClose={() => setPropriedades(null)} size="md">
          <SheetHeader onClose={() => setPropriedades(null)}>
            <SheetTitle>Propriedades de "{propriedades.tipo.nome}"</SheetTitle>
            <SheetDescription>O tipo é molde: gravar muda o que "aplicar tipo…" copia daqui em diante — as peças já desenhadas ficam como estão.</SheetDescription>
          </SheetHeader>
          <SheetPanel className="p-6">
            <div className="space-y-3" data-testid="propriedades-do-tipo">
            {camposEditaveisDoTipo(propriedades.tipo.propriedades).map((c) => (
              <label key={c.chave} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                <span>{c.rotulo}</span>
                <input
                  value={propriedades.valores[c.chave] ?? ''}
                  onChange={(e) => setPropriedades({ ...propriedades, valores: { ...propriedades.valores, [c.chave]: e.target.value }, erro: null })}
                  inputMode="decimal"
                  aria-label={c.rotulo}
                  className="h-9 w-36 rounded-[6px] border border-slate-300 bg-white px-2 text-right text-sm tabular-nums text-slate-800"
                />
              </label>
            ))}
            {propriedades.erro && <p className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" data-testid="erro-das-propriedades">{propriedades.erro}</p>}
            </div>
          </SheetPanel>
          <SheetFooter>
            <button type="button" onClick={() => setPropriedades(null)} className="h-9 rounded-[6px] border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="button" disabled={ocupado} onClick={() => void salvarPropriedades()} className="h-9 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" data-testid="salvar-propriedades-do-tipo">Gravar</button>
          </SheetFooter>
        </Sheet>
      )}
    </div>
  );
}

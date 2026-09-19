/**
 * TELA "Programa de necessidades" (19/09/2026, E4.1). Molde `TelaLegislacao`:
 * resumo + `TabsBar` + `StandardTable`. Duas abas: **Itens** — cada ambiente
 * pedido, editável na célula (uso, nome, quantidade, áreas, largura, pé-direito,
 * exigências, privacidade) — e **Proximidade** — a matriz triangular item ×
 * item, cada célula um select (—, 1…10, Obrigatória, Proibida).
 *
 * O programa é do ESTUDO (hook `useBlueprintPrograma`); a tela só mostra e
 * chama `onChange` com o programa novo. As sementes por tipologia substituem
 * o programa atual (com confirmação quando já há itens).
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import {
  adicionarItem,
  atualizarItem,
  definirRelacao,
  FICHA_DO_USO,
  MAX_NOME_DO_ITEM,
  MAX_QUANTIDADE_DO_ITEM,
  novoItem,
  PRIVACIDADES,
  problemasDoPrograma,
  programaSemente,
  relacaoEntre,
  removerItem,
  resumoDoPrograma,
  ROTULO_DA_PRIVACIDADE,
  ROTULO_DA_TIPOLOGIA,
  rotuloDaRelacao,
  TIPOLOGIAS_SEMENTE,
  trocarUsoDoItem,
  USOS_DO_AMBIENTE,
  type ItemDoPrograma,
  type Privacidade,
  type Programa,
  type TipologiaSemente,
  type UsoDoAmbiente,
} from '../../utils/blueprintPrograma';
import { StandardTable, type StandardTableColumn } from '../ui/StandardTable';
import { TabsBar, type TabsBarItem } from '../ui/TabsBar';
import { usePersistedState } from '../ui/TableUtils';
import { useConfirm } from '../ui/confirm';

interface Props {
  programa: Programa;
  onChange: (p: Programa) => void;
  carregando?: boolean;
  /** Persistência indisponível ou erro de gravação — a tela acusa, não trava. */
  aviso?: string | null;
}

type Aba = 'itens' | 'proximidade';

const COLUNAS: StandardTableColumn[] = [
  { key: 'nome', label: 'Ambiente', width: 200 },
  { key: 'uso', label: 'Uso', width: 150 },
  { key: 'quantidade', label: 'Qtd.', width: 70 },
  { key: 'areaMin', label: 'Área mín. (m²)', width: 110 },
  { key: 'areaIdeal', label: 'Área ideal (m²)', width: 110 },
  { key: 'areaMax', label: 'Área máx. (m²)', width: 110 },
  { key: 'largura', label: 'Largura mín. (m)', width: 120 },
  { key: 'peDireito', label: 'Pé-direito mín. (m)', width: 130 },
  { key: 'exige', label: 'Exige', width: 200, sortable: false },
  { key: 'privacidade', label: 'Privacidade', width: 110 },
];

const campo = 'w-full rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-sm text-gray-800 hover:border-slate-200 focus:border-blue-400 focus:bg-white';
const numero = `${campo} text-right tabular-nums`;

const fmt = (v: number | null, casas = 2) => (v == null ? '' : v.toFixed(casas).replace('.', ','));
const lerNumero = (texto: string): number | null => {
  const t = texto.trim().replace(',', '.');
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/** Célula numérica editável: grava no blur/Enter; vazio vira `null` quando `opcional`. */
function CelulaNumero({ valor, rotulo, casas = 2, escala = 1, opcional = false, onGravar }: { valor: number | null; rotulo: string; casas?: number; escala?: number; opcional?: boolean; onGravar: (v: number | null) => void }) {
  const mostrado = valor == null ? '' : fmt(valor / escala, casas);
  return (
    <input
      key={mostrado}
      defaultValue={mostrado}
      inputMode="decimal"
      aria-label={rotulo}
      onBlur={(e) => {
        const v = lerNumero(e.target.value);
        if (v == null) {
          if (opcional && valor != null) onGravar(null);
          else e.target.value = mostrado;
          return;
        }
        const novo = Math.round(v * escala * 100) / 100;
        if (novo !== valor && novo >= 0) onGravar(novo);
        else e.target.value = mostrado;
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={numero}
    />
  );
}

export default function TelaPrograma({ programa, onChange, carregando = false, aviso = null }: Props) {
  const [aba, setAba] = usePersistedState<Aba>('blueprint:programa:aba', 'itens');
  const [usoNovo, setUsoNovo] = useState<UsoDoAmbiente>('DORMITORIO');
  const [tipologia, setTipologia] = useState<TipologiaSemente>('APTO_2Q');
  const confirmar = useConfirm();
  const resumo = useMemo(() => resumoDoPrograma(programa), [programa]);
  const problemas = useMemo(() => problemasDoPrograma(programa), [programa]);
  const abas: TabsBarItem[] = [
    { id: 'itens', label: 'Itens', badge: programa.itens.length },
    { id: 'proximidade', label: 'Proximidade', badge: programa.relacoes.length },
  ];

  const aplicarSemente = async () => {
    if (programa.itens.length > 0) {
      const ok = await confirmar({
        title: 'Substituir o programa?',
        message: `O programa atual (${programa.itens.length} item(ns) e ${programa.relacoes.length} relação(ões)) será trocado pela semente "${ROTULO_DA_TIPOLOGIA[tipologia]}".`,
        confirmLabel: 'Substituir',
        variant: 'warning',
      });
      if (!ok) return;
    }
    onChange(programaSemente(tipologia));
  };
  const criarItem = () => onChange(adicionarItem(programa, novoItem(usoNovo)));
  const mudar = (id: string, mudanca: Partial<Omit<ItemDoPrograma, 'id'>>) => onChange(atualizarItem(programa, id, mudanca));

  const celula = (key: string, i: ItemDoPrograma): React.ReactNode => {
    switch (key) {
      case 'nome':
        return (
          <input
            key={`${i.id}-${i.nome}`}
            defaultValue={i.nome}
            maxLength={MAX_NOME_DO_ITEM}
            aria-label={`Nome do item ${i.nome}`}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== i.nome && mudar(i.id, { nome: e.target.value.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={`${campo} font-semibold text-gray-900`}
          />
        );
      case 'uso':
        return (
          <select value={i.uso} aria-label={`Uso do item ${i.nome}`} onChange={(e) => onChange(trocarUsoDoItem(programa, i.id, e.target.value as UsoDoAmbiente))} className={campo}>
            {USOS_DO_AMBIENTE.map((u) => (
              <option key={u} value={u}>{FICHA_DO_USO[u].rotulo}</option>
            ))}
          </select>
        );
      case 'quantidade':
        return (
          <input
            key={`${i.id}-${i.quantidade}`}
            type="number"
            min={1}
            max={MAX_QUANTIDADE_DO_ITEM}
            defaultValue={i.quantidade}
            aria-label={`Quantidade do item ${i.nome}`}
            onBlur={(e) => {
              const q = Math.round(Number(e.target.value));
              if (Number.isFinite(q) && q >= 1 && q <= MAX_QUANTIDADE_DO_ITEM && q !== i.quantidade) mudar(i.id, { quantidade: q });
              else e.target.value = String(i.quantidade);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={numero}
          />
        );
      case 'areaMin':
        return <CelulaNumero valor={i.areaMinM2} rotulo={`Área mínima do item ${i.nome}`} onGravar={(v) => mudar(i.id, { areaMinM2: v ?? 0 })} />;
      case 'areaIdeal':
        return <CelulaNumero valor={i.areaIdealM2} rotulo={`Área ideal do item ${i.nome}`} onGravar={(v) => mudar(i.id, { areaIdealM2: v ?? 0 })} />;
      case 'areaMax':
        return <CelulaNumero valor={i.areaMaxM2} rotulo={`Área máxima do item ${i.nome}`} opcional onGravar={(v) => mudar(i.id, { areaMaxM2: v })} />;
      case 'largura':
        return <CelulaNumero valor={i.larguraMinMm} rotulo={`Largura mínima do item ${i.nome}`} escala={1000} onGravar={(v) => mudar(i.id, { larguraMinMm: v ?? 0 })} />;
      case 'peDireito':
        return <CelulaNumero valor={i.peDireitoMinMm} rotulo={`Pé-direito mínimo do item ${i.nome}`} escala={1000} opcional onGravar={(v) => mudar(i.id, { peDireitoMinMm: v })} />;
      case 'exige':
        return (
          <span className="flex items-center gap-2 text-xs text-gray-700">
            {(
              [
                ['exigeIluminacao', 'Ilum.', 'iluminação natural'],
                ['exigeVentilacao', 'Vent.', 'ventilação natural'],
                ['exigeFachada', 'Fachada', 'contato com a fachada'],
              ] as const
            ).map(([chave, rotulo, longo]) => (
              <label key={chave} className="inline-flex items-center gap-1" title={`Exige ${longo}`}>
                <input type="checkbox" checked={i[chave]} aria-label={`${i.nome} exige ${longo}`} onChange={(e) => mudar(i.id, { [chave]: e.target.checked })} className="h-3.5 w-3.5 rounded border-slate-300" />
                {rotulo}
              </label>
            ))}
          </span>
        );
      case 'privacidade':
        return (
          <select value={i.privacidade} aria-label={`Privacidade do item ${i.nome}`} onChange={(e) => mudar(i.id, { privacidade: e.target.value as Privacidade })} className={campo}>
            {PRIVACIDADES.map((p) => (
              <option key={p} value={p}>{ROTULO_DA_PRIVACIDADE[p]}</option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4" data-testid="tela-programa">
      <div className="rounded-[6px] border border-gray-200 bg-white px-5 py-3 text-sm text-gray-700" data-testid="resumo-programa">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Programa
            <input
              key={programa.nome}
              defaultValue={programa.nome}
              aria-label="Nome do programa"
              onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== programa.nome && onChange({ ...programa, nome: e.target.value.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="h-8 w-64 rounded-[6px] border border-slate-300 px-2 text-sm font-semibold text-gray-900"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Circulação máxima (%)
            <input
              key={programa.circulacaoMaxPct}
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={programa.circulacaoMaxPct}
              aria-label="Circulação máxima (%)"
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0 && v <= 100 && v !== programa.circulacaoMaxPct) onChange({ ...programa, circulacaoMaxPct: v });
                else e.target.value = String(programa.circulacaoMaxPct);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="h-8 w-20 rounded-[6px] border border-slate-300 px-2 text-right text-sm tabular-nums"
            />
          </label>
          <span className="ml-auto flex items-center gap-2 text-xs text-slate-600">
            Começar de uma semente
            <select value={tipologia} onChange={(e) => setTipologia(e.target.value as TipologiaSemente)} aria-label="Tipologia da semente" className="h-8 rounded-[6px] border border-slate-300 bg-white px-2 text-sm">
              {TIPOLOGIAS_SEMENTE.map((t) => (
                <option key={t} value={t}>{ROTULO_DA_TIPOLOGIA[t]}</option>
              ))}
            </select>
            <button type="button" onClick={() => void aplicarSemente()} className="h-8 rounded-[6px] border border-slate-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-slate-50" data-testid="aplicar-semente">
              Aplicar semente
            </button>
          </span>
        </div>
        <p className="mt-2">
          <strong className="text-gray-900">{resumo.ambientes} ambiente(s)</strong> em {resumo.itens} item(ns) · área mínima <strong>{fmt(resumo.areaMinM2)} m²</strong> · ideal{' '}
          <strong>{fmt(resumo.areaIdealM2)} m²</strong>
          {resumo.areaMaxM2 != null && <> · máxima {fmt(resumo.areaMaxM2)} m²</>} · com {programa.circulacaoMaxPct}% de circulação:{' '}
          <strong>{fmt(resumo.areaIdealComCirculacaoM2)} m²</strong> úteis · social {fmt(resumo.porPrivacidade.SOCIAL, 1)} / serviço {fmt(resumo.porPrivacidade.SERVICO, 1)} / íntimo{' '}
          {fmt(resumo.porPrivacidade.INTIMO, 1)} m² · {resumo.relacoes} relação(ões) ({resumo.obrigatorias} obrigatória(s), {resumo.proibidas} proibida(s))
        </p>
        <p className="mt-1 text-xs text-slate-500">
          O programa é do estudo: o que a planta tem de ter antes de haver planta. Os valores por uso são referência de mercado, não norma — ajuste item a item. A matriz de proximidade (peso 0–10,
          obrigatória = porta direta, proibida = nunca vizinhos) alimenta a conferência do programa e o gerador. Nada aqui trava o desenho.
        </p>
        {(aviso || problemas.length > 0) && (
          <div className="mt-2 space-y-1" data-testid="problemas-do-programa">
            {aviso && (
              <p className="flex items-center gap-1 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" /> {aviso}
              </p>
            )}
            {problemas.slice(0, 6).map((p, k) => (
              <p key={k} className="flex items-center gap-1 text-xs text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" /> {p.texto}
              </p>
            ))}
            {problemas.length > 6 && <p className="text-xs text-red-700">… e mais {problemas.length - 6}.</p>}
          </div>
        )}
      </div>

      {aba === 'itens' ? (
        <StandardTable<ItemDoPrograma>
          columns={COLUNAS}
          storageKey="blueprint:programaItens"
          rows={programa.itens}
          rowKey={(i) => i.id}
          loading={carregando}
          toolbarTop={<TabsBar tabs={abas} value={aba} onChange={(id) => setAba(id as Aba)} bare />}
          toolbarRight={
            <div className="flex items-center gap-2">
              <select value={usoNovo} onChange={(e) => setUsoNovo(e.target.value as UsoDoAmbiente)} aria-label="Uso do novo item" className="h-9 rounded-[6px] border border-slate-300 bg-white px-2 text-sm">
                {USOS_DO_AMBIENTE.map((u) => (
                  <option key={u} value={u}>{FICHA_DO_USO[u].rotulo}</option>
                ))}
              </select>
              <button type="button" onClick={criarItem} className="inline-flex h-9 items-center gap-1 rounded-[6px] bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700" data-testid="novo-item">
                <Plus className="h-4 w-4" /> Novo item
              </button>
            </div>
          }
          sortValue={(key, i) => {
            switch (key) {
              case 'nome':
                return i.nome;
              case 'uso':
                return FICHA_DO_USO[i.uso].rotulo;
              case 'quantidade':
                return i.quantidade;
              case 'areaMin':
                return i.areaMinM2;
              case 'areaIdeal':
                return i.areaIdealM2;
              case 'areaMax':
                return i.areaMaxM2 ?? Number.POSITIVE_INFINITY;
              case 'largura':
                return i.larguraMinMm;
              case 'peDireito':
                return i.peDireitoMinMm ?? 0;
              case 'privacidade':
                return ROTULO_DA_PRIVACIDADE[i.privacidade];
              default:
                return null;
            }
          }}
          searchText={(i) => `${i.nome} ${FICHA_DO_USO[i.uso].rotulo} ${ROTULO_DA_PRIVACIDADE[i.privacidade]}`}
          searchPlaceholder="Buscar ambiente…"
          renderCell={celula}
          actions={{
            width: 70,
            render: (i) => (
              <button type="button" onClick={() => onChange(removerItem(programa, i.id))} aria-label={`Remover o item ${i.nome}`} className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-4 w-4" />
              </button>
            ),
          }}
          empty={{ title: 'Programa vazio', subtitle: 'Acrescente itens ou comece de uma semente (2 quartos, 3 quartos com suíte, casa térrea).' }}
        />
      ) : (
        <div className="rounded-[6px] border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-2">
            <TabsBar tabs={abas} value={aba} onChange={(id) => setAba(id as Aba)} bare />
          </div>
          {programa.itens.length < 2 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">A matriz precisa de pelo menos dois itens.</p>
          ) : (
            <MatrizDeProximidade programa={programa} onChange={onChange} />
          )}
        </div>
      )}
    </div>
  );
}

/** Metade superior da matriz item × item; cada célula um select. */
function MatrizDeProximidade({ programa, onChange }: { programa: Programa; onChange: (p: Programa) => void }) {
  const itens = programa.itens;
  const gravar = (a: string, b: string, valor: string) => {
    if (valor === '') onChange(definirRelacao(programa, a, b, 0));
    else if (valor === 'O') onChange(definirRelacao(programa, a, b, 10, 'OBRIGATORIA'));
    else if (valor === 'P') onChange(definirRelacao(programa, a, b, 0, 'PROIBIDA'));
    else onChange(definirRelacao(programa, a, b, Number(valor)));
  };
  const valorDe = (a: string, b: string) => {
    const r = relacaoEntre(programa, a, b);
    if (!r) return '';
    return r.tipo === 'OBRIGATORIA' ? 'O' : r.tipo === 'PROIBIDA' ? 'P' : String(r.peso);
  };
  const tom = (a: string, b: string) => {
    const r = relacaoEntre(programa, a, b);
    if (!r) return 'bg-white text-slate-400';
    if (r.tipo === 'OBRIGATORIA') return 'bg-emerald-100 text-emerald-800 font-semibold';
    if (r.tipo === 'PROIBIDA') return 'bg-red-100 text-red-800 font-semibold';
    if (r.peso >= 8) return 'bg-blue-100 text-blue-900 font-semibold';
    if (r.peso >= 5) return 'bg-blue-50 text-blue-800';
    return 'bg-slate-50 text-slate-700';
  };
  return (
    <div className="overflow-x-auto p-4" data-testid="matriz-de-proximidade">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white px-2 py-1 text-left font-medium text-slate-500">Item</th>
            {itens.map((c) => (
              <th key={c.id} className="max-w-[72px] px-1 py-1 text-center font-medium text-slate-600" title={c.nome}>
                <span className="block truncate">{c.nome}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((linha, li) => (
            <tr key={linha.id} className="border-t border-slate-100">
              <th className="sticky left-0 whitespace-nowrap bg-white px-2 py-1 text-left font-medium text-gray-800">{linha.nome}</th>
              {itens.map((col, ci) => {
                if (ci <= li) return <td key={col.id} className="px-1 py-1 text-center text-slate-300">{ci === li ? '·' : ''}</td>;
                return (
                  <td key={col.id} className="px-1 py-1 text-center">
                    <select
                      value={valorDe(linha.id, col.id)}
                      aria-label={`Relação ${linha.nome} × ${col.nome}`}
                      title={`${linha.nome} × ${col.nome}: ${rotuloDaRelacao(relacaoEntre(programa, linha.id, col.id)) || 'sem relação'}`}
                      onChange={(e) => gravar(linha.id, col.id, e.target.value)}
                      className={`h-7 w-16 rounded-[6px] border border-slate-200 px-1 text-center text-xs ${tom(linha.id, col.id)}`}
                    >
                      <option value="">—</option>
                      {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                        <option key={n} value={String(n)}>{n}</option>
                      ))}
                      <option value="O">Obrig.</option>
                      <option value="P">Proib.</option>
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-slate-500">
        Peso 1–10 = quanto os dois devem ficar perto (10 = encostados). <span className="text-emerald-800">Obrigatória</span> = porta direta entre eles. <span className="text-red-800">Proibida</span> = nunca vizinhos.
      </p>
    </div>
  );
}

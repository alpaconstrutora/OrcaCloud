/**
 * RESTRIÇÕES (18/09/2026, E1.4b) — a lista conferida e o formulário de criar.
 *
 * Dois usos, um componente: no DRAWER "Restrições" (todas as do desenho, com
 * a contagem de violadas no botão) e sob o painel da peça selecionada (só as
 * dela, mais "Nova restrição"). Cada linha diz se está atendida, o desvio
 * medido e, quando há, oferece **Ajustar** — o comando corretivo, um Ctrl+Z.
 * Nunca se ajusta sozinho: é o usuário quem manda mover.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Link2, Trash2, Wand2 } from 'lucide-react';
import {
  EXIGENCIAS_DA_RESTRICAO,
  TIPOS_DE_RESTRICAO,
  rotuloCurto,
  type BlueprintModel,
  type Command,
  type FamiliaRestringivel,
  type TipoDeRestricao,
} from '../../utils/blueprintKernel';
import { ROTULO_DA_RESTRICAO, type Conferencia } from '../../utils/blueprintRestricoes';

interface Props {
  model: BlueprintModel;
  conferencias: Conferencia[];
  /** Roda o comando corretivo ou o `AddRestricao`/`DeleteRestricao`. */
  onComando: (c: Command) => void;
  onSelecionar?: (id: string) => void;
  /** Quando dado, a lista se restringe a esta peça e o formulário de criar aparece. */
  peca?: { familia: 'wall' | 'structural'; id: string; uid: string; ehLinear: boolean } | null;
}

export default function PainelRestricoes({ model, conferencias, onComando, onSelecionar, peca }: Props) {
  const lista = useMemo(() => (peca ? conferencias.filter((c) => c.restricao.alvo.uid === peca.uid) : conferencias), [conferencias, peca]);
  const violadas = lista.filter((c) => !c.atendida).length;

  // ── Nova restrição ─────────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<TipoDeRestricao>('ALINHADO_A_EIXO');
  const [referencia, setReferencia] = useState<string>('');
  const [valor, setValor] = useState<string>('');
  const exig = EXIGENCIAS_DA_RESTRICAO[tipo];
  const opcoesDeReferencia = useMemo(() => {
    if (!exig.referencia) return [];
    const saida: { chave: string; rotulo: string; familia: FamiliaRestringivel; id: string }[] = [];
    if (exig.referencia.includes('eixo')) for (const e of model.eixos ?? []) saida.push({ chave: `eixo:${e.id}`, rotulo: e.nome ? `Eixo ${e.nome}` : `Linha ${rotuloCurto(e.uid, 'eixo')}`, familia: 'eixo', id: e.id });
    if (exig.referencia.includes('wall')) for (const w of model.walls) if (w.id !== peca?.id) saida.push({ chave: `wall:${w.id}`, rotulo: `Parede ${rotuloCurto(w.uid, 'wall')} (${(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) / 1000).toFixed(2).replace('.', ',')} m)`, familia: 'wall', id: w.id });
    if (exig.referencia.includes('structural')) for (const s of model.structures ?? []) if (s.id !== peca?.id && s.pontos.length === 2) saida.push({ chave: `structural:${s.id}`, rotulo: s.rotulo || rotuloCurto(s.uid, 'structural'), familia: 'structural', id: s.id });
    return saida;
  }, [exig, model, peca]);
  const tiposAdmitidos = TIPOS_DE_RESTRICAO.filter((t) => peca?.ehLinear || t === 'ALINHADO_A_EIXO');
  const podeCriar = !!peca && (!exig.referencia || referencia !== '') && (!exig.valor || /^\d+$/.test(valor.trim()));
  function criar() {
    if (!peca || !podeCriar) return;
    const ref = opcoesDeReferencia.find((o) => o.chave === referencia);
    onComando({
      type: 'AddRestricao',
      tipo,
      alvo: { familia: peca.familia, id: peca.id },
      ...(ref ? { referencia: { familia: ref.familia, id: ref.id } } : {}),
      ...(exig.valor ? { valorMm: Number(valor.trim()) } : {}),
    });
    setValor('');
  }

  return (
    <div className={peca ? 'mt-3 rounded-[10px] border border-slate-200 bg-white p-3' : 'space-y-1.5'} data-testid={peca ? 'painel-restricoes-peca' : 'painel-restricoes'}>
      {peca && (
        <p className="text-xs font-semibold text-slate-500">
          Restrições{lista.length > 0 ? ` · ${lista.length}` : ''}
          {violadas > 0 ? <span className="ml-1 text-amber-700">({violadas} violada{violadas > 1 ? 's' : ''})</span> : null}
        </p>
      )}

      {lista.length === 0 && !peca && (
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
          <span>
            Nenhuma restrição declarada. Selecione uma parede ou peça estrutural e declare "sobre o eixo", "distância ao eixo", "comprimento travado", "mesmo comprimento" ou "paralela a".
            <span className="mt-0.5 block text-[10px]">A restrição não trava o desenho: ela é conferida e, quando violada, oferece o ajuste.</span>
          </span>
        </p>
      )}

      {lista.length > 0 && (
        <div className={peca ? 'mt-1.5 space-y-1' : 'space-y-1.5'}>
          {lista.map((c) => (
            <div
              key={c.restricao.id}
              className={`flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] ${c.atendida ? 'border-slate-200 bg-white text-slate-600' : 'border-amber-200 bg-amber-50 text-slate-700'}`}
              data-testid={`restricao-${c.restricao.id}`}
            >
              {c.atendida ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />}
              <button type="button" onClick={() => onSelecionar?.(pecaId(model, c))} className="min-w-0 flex-1 text-left">
                <strong>{ROTULO_DA_RESTRICAO[c.restricao.tipo]}</strong>
                {c.referencia ? ` ${c.referencia}` : ''}
                {c.restricao.valorMm !== undefined ? ` · ${c.restricao.valorMm} mm` : ''}
                <span className="mt-0.5 block text-[10px] text-slate-500">{c.descricao}</span>
                {!c.atendida && !c.correcao && c.semCorrecaoPorque && <span className="block text-[10px] text-amber-700">{c.semCorrecaoPorque}</span>}
              </button>
              {!c.atendida && c.correcao && (
                <button
                  type="button"
                  onClick={() => onComando(c.correcao!)}
                  title="Move a peça para atender a restrição — um comando, Ctrl+Z desfaz"
                  className="flex h-6 shrink-0 items-center gap-1 rounded-[6px] bg-blue-600 px-2 text-[11px] font-medium text-white hover:bg-blue-700"
                >
                  <Wand2 className="h-3 w-3" />
                  Ajustar
                </button>
              )}
              <button
                type="button"
                onClick={() => onComando({ type: 'DeleteRestricao', restricaoId: c.restricao.id })}
                aria-label={`Remover restrição ${ROTULO_DA_RESTRICAO[c.restricao.tipo]}`}
                title="Remove a restrição (a peça fica onde está)"
                className="shrink-0 text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {peca && (
        <div className="mt-2 rounded-[8px] border border-slate-200 bg-slate-50 p-2">
          <p className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
            <Link2 className="h-3 w-3" /> Nova restrição
          </p>
          <div className="mt-1.5 grid grid-cols-1 gap-1.5">
            <select
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoDeRestricao);
                setReferencia('');
              }}
              aria-label="Tipo da nova restrição"
              className="h-8 rounded-[6px] border border-slate-200 bg-white px-2 text-xs"
            >
              {tiposAdmitidos.map((t) => (
                <option key={t} value={t}>{ROTULO_DA_RESTRICAO[t]}</option>
              ))}
            </select>
            {exig.referencia && (
              <select value={referencia} onChange={(e) => setReferencia(e.target.value)} aria-label="Referência da nova restrição" className="h-8 rounded-[6px] border border-slate-200 bg-white px-2 text-xs">
                <option value="">{opcoesDeReferencia.length === 0 ? (exig.referencia.includes('eixo') && exig.referencia.length === 1 ? 'Desenhe um eixo primeiro' : 'Nenhuma referência disponível') : 'Escolha a referência…'}</option>
                {opcoesDeReferencia.map((o) => (
                  <option key={o.chave} value={o.chave}>{o.rotulo}</option>
                ))}
              </select>
            )}
            {exig.valor && (
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="numeric"
                aria-label={tipo === 'TRAVA_COMPRIMENTO' ? 'Comprimento travado, em mm' : 'Distância ao eixo, em mm'}
                placeholder={tipo === 'TRAVA_COMPRIMENTO' ? 'Comprimento (mm)' : 'Distância (mm)'}
                className="h-8 rounded-[6px] border border-slate-200 bg-white px-2 text-xs"
              />
            )}
            <button type="button" onClick={criar} disabled={!podeCriar} className="h-8 rounded-[6px] bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40">
              Adicionar restrição
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** O id (de linha) do alvo da restrição, para selecionar no desenho. */
function pecaId(model: BlueprintModel, c: Conferencia): string {
  const { familia, uid } = c.restricao.alvo;
  const p = familia === 'wall' ? model.walls.find((w) => w.uid === uid) : (model.structures ?? []).find((s) => s.uid === uid);
  return p?.id ?? '';
}

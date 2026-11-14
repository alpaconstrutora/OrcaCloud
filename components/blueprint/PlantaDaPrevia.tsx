/**
 * PLANTA DA PRÉVIA (etapa B da fase "itens 6 a 11" da casa automática, 11/11/2026 — plano
 * docs/planos/2026-11-11-casa-automatica-itens-6-a-11.md). Antes, a aba Resultado só tinha números: para VER a casa era
 * preciso lançar ou criar alternativa. Aqui a casa gerada (`plano.resultado`) é desenhada por pavimento e por disciplina
 * com o MESMO código das pranchas — `modeloDoPavimento` + `enquadrar` + `desenharPlanta` — num `DesenhistaSvg`. As
 * disciplinas são as das pranchas (decisão do usuário: "Seletor de disciplina"); a que o pavimento não tem não aparece
 * (§19.5). As MARCAS (etapa C) são os locais de uma pendência, desenhados por cima.
 */
import React, { useId, useMemo } from 'react';
import { DesenhistaSvg } from './DesenhistaSvg';
import { PAPEIS, boundingBox, desenharPlanta, enquadrar, orientar, type Enquadramento, type OpcoesExportacao } from '../../utils/blueprintExport';
import { modeloDoPavimento } from '../../utils/blueprintPranchas';
import { temRedeNoPavimento } from '../../utils/blueprintPranchaHidro';
import { temClimatizacaoNoPavimento } from '../../utils/blueprintPranchaClimatizacao';
import { nomesDasColunas } from '../../utils/blueprintEsquemaVertical';
import type { BlueprintModel, ObjectId, Point } from '../../utils/blueprintKernel';

import type { DisciplinaDaPrevia } from '../../utils/blueprintLocalDaPendencia';
export type { DisciplinaDaPrevia };

export const ROTULO_DA_DISCIPLINA_DA_PREVIA: Record<DisciplinaDaPrevia, string> = {
  ARQUITETURA: 'Arquitetura',
  HUMANIZADA: 'Humanizada',
  AGUA: 'Água',
  ESGOTO: 'Esgoto e pluvial',
  ELETRICA: 'Elétrica',
  CLIMATIZACAO: 'Climatização',
};

/** Um local a destacar na planta (etapa C: os locais de uma pendência). */
export interface MarcaNaPrevia {
  levelId: ObjectId;
  ponto: Point;
}

/** px de SVG por mm de papel — o traço mínimo de 1 px vira 0,25 mm de papel. */
const K = 4;
/** Folga em volta do desenho, em mm de papel. */
const FOLGA_MM = 1;
/**
 * Folga do RECORTE em volta das paredes, em mm reais. Conferido no app (11/11/2026): enquadrando o pavimento inteiro, o lote
 * de 12 × 30 m entrava junto e a casa ocupava um terço do desenho, a 1:200; recortada na casa, a escala sobe e o texto lê.
 */
const FOLGA_DO_RECORTE_MM = 1500;

type Caixa = { minX: number; minY: number; maxX: number; maxY: number };

/** A caixa das paredes do pavimento com a folga — o recorte da prévia. Sem parede, `null` (enquadra o pavimento todo). */
export function recorteDaCasa(m: BlueprintModel, folgaMm = FOLGA_DO_RECORTE_MM): Caixa | null {
  const pts = m.walls.flatMap((w) => [w.a, w.b]);
  if (pts.length === 0) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)) - folgaMm,
    minY: Math.min(...pts.map((p) => p.y)) - folgaMm,
    maxX: Math.max(...pts.map((p) => p.x)) + folgaMm,
    maxY: Math.max(...pts.map((p) => p.y)) + folgaMm,
  };
}

/** As disciplinas que o pavimento tem, na ordem das abas: arquitetura e humanizada sempre; as redes só onde há rede. */
export function disciplinasDoPavimento(modelo: BlueprintModel, levelId: ObjectId): DisciplinaDaPrevia[] {
  const saida: DisciplinaDaPrevia[] = ['ARQUITETURA', 'HUMANIZADA'];
  if (temRedeNoPavimento(modelo, levelId, 'AGUA')) saida.push('AGUA');
  if (temRedeNoPavimento(modelo, levelId, 'ESGOTO')) saida.push('ESGOTO');
  if ((modelo.terminais ?? []).some((t) => t.levelId === levelId && t.disciplina === 'ELETRICA')) saida.push('ELETRICA');
  if (temClimatizacaoNoPavimento(modelo, levelId)) saida.push('CLIMATIZACAO');
  return saida;
}

/** O que cada disciplina põe por cima da arquitetura — as mesmas opções das pranchas (`blueprintExportService`). */
function opcoesDaDisciplina(d: DisciplinaDaPrevia, modelo: BlueprintModel): Partial<OpcoesExportacao> {
  switch (d) {
    case 'HUMANIZADA':
      return { humanizada: true };
    case 'AGUA':
    case 'ESGOTO':
      // Os nomes das colunas do desenho INTEIRO (o pavimento recortado numeraria de novo).
      return { hidrossanitaria: d, nomesDasColunas: nomesDasColunas(modelo) };
    case 'ELETRICA':
      return { eletrica: true };
    case 'CLIMATIZACAO':
      return { climatizacao: true };
    default:
      return {};
  }
}

/** mm reais → mm de papel, a mesma conta de `desenharPlanta` (com recorte, a caixa é ele e não há folga). */
function projecao(m: BlueprintModel, enq: Enquadramento, denominador: number, recorte: Caixa | null): ((p: Point) => Point) | null {
  const bb = recorte ?? boundingBox(m);
  if (!bb) return null;
  const folga = recorte ? 0 : Math.max(0, ...m.walls.map((w) => w.thicknessMm)) / 2;
  return (p) => ({ x: enq.offsetXMm + (p.x - bb.minX + folga) / denominador, y: enq.offsetYMm + (enq.desenhoAlturaMm - (p.y - bb.minY + folga) / denominador) });
}

interface Props {
  modelo: BlueprintModel;
  levelId: ObjectId | null;
  onLevelId: (id: ObjectId) => void;
  disciplina: DisciplinaDaPrevia;
  onDisciplina: (d: DisciplinaDaPrevia) => void;
  marcas?: readonly MarcaNaPrevia[];
}

export default function PlantaDaPrevia({ modelo, levelId, onLevelId, disciplina, onDisciplina, marcas = [] }: Props) {
  // O recorte do desenho: com o SVG "encaixado" na largura da tela, o que passa da viewBox (a borda do lote além da casa)
  // continuava visível nas sobras laterais — conferido no app, 11/11/2026.
  const idDoRecorte = `recorte-previa-${useId().replace(/:/g, '')}`;
  const nivel = levelId ? (modelo.levels.find((l) => l.id === levelId) ?? null) : null;
  const disciplinas = useMemo(() => (nivel ? disciplinasDoPavimento(modelo, nivel.id) : []), [modelo, nivel]);
  const efetiva: DisciplinaDaPrevia = disciplinas.includes(disciplina) ? disciplina : 'ARQUITETURA';

  const desenho = useMemo(() => {
    if (!nivel) return null;
    try {
      const m = modeloDoPavimento(modelo, nivel.id);
      const papel = orientar(PAPEIS.find((p) => p.id === 'A3') ?? PAPEIS[0], true);
      const recorte = recorteDaCasa(m);
      // A maior escala que cabe na folha (a primeira da lista que cabe); sem nenhuma, 1:200.
      const den = enquadrar(m, 100, papel, false, recorte ?? undefined).escalaSugerida ?? 200;
      const enq = enquadrar(m, den, papel, false, recorte ?? undefined);
      if (enq.vazio) return { vazio: true as const };
      const d = new DesenhistaSvg(K, 'PRANCHA');
      const opcoes = { denominador: den, papel, titulo: nivel.name, revisao: 0, hash: '', cotas: false, eixos: false, ...(recorte ? { recorte } : {}), ...opcoesDaDisciplina(efetiva, modelo) } as OpcoesExportacao;
      desenharPlanta(d, m, opcoes, enq);
      const proj = projecao(m, enq, den, recorte);
      const caixa = { x: (enq.offsetXMm - FOLGA_MM) * K, y: (enq.offsetYMm - FOLGA_MM) * K, w: (enq.desenhoLarguraMm + 2 * FOLGA_MM) * K, h: (enq.desenhoAlturaMm + 2 * FOLGA_MM) * K };
      return { vazio: false as const, nos: d.nos, caixa, proj, escala: den };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : String(e) };
    }
  }, [modelo, nivel, efetiva]);

  if (!nivel) return null;
  const doNivel = marcas.filter((x) => x.levelId === nivel.id);
  const rotulo = `Planta da prévia — ${nivel.name} · ${ROTULO_DA_DISCIPLINA_DA_PREVIA[efetiva]}`;

  return (
    <section className="space-y-3" data-testid="planta-da-previa">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Pavimento da prévia" value={nivel.id} onChange={(e) => onLevelId(e.target.value)} className="h-9 rounded-[6px] border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none">
          {/* Pela cota (PA3 do prédio: o térreo do bloco nasce depois do tipo, e a lista na ordem de criação o punha no fim). */}
          {[...modelo.levels].sort((a, b) => a.elevationMm - b.elevationMm).map((l) => (
            <option key={l.id} value={l.id}>
              {/* Prédio automático (PA2): o andar copiado diz que é cópia viva — o desenho dele se edita no tipo. */}
              {l.tipoDeId ? `${l.name} · cópia do tipo` : l.name}
            </option>
          ))}
        </select>
        <div role="tablist" aria-label="Disciplina da prévia" className="flex flex-wrap rounded-[6px] border border-gray-200 bg-white p-0.5">
          {disciplinas.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === efetiva}
              onClick={() => onDisciplina(d)}
              className={`h-8 rounded-[4px] px-3 text-sm ${d === efetiva ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              {ROTULO_DA_DISCIPLINA_DA_PREVIA[d]}
            </button>
          ))}
        </div>
        {desenho && 'escala' in desenho && <span className="text-xs text-slate-500">escala 1:{desenho.escala} numa folha A3</span>}
      </div>
      {desenho && 'erro' in desenho ? (
        <p className="text-sm text-red-700">Não foi possível desenhar este pavimento: {desenho.erro}</p>
      ) : desenho && !desenho.vazio ? (
        <svg
          role="img"
          aria-label={rotulo}
          viewBox={`${desenho.caixa.x} ${desenho.caixa.y} ${desenho.caixa.w} ${desenho.caixa.h}`}
          className="h-[480px] w-full rounded-[6px] border border-gray-200 bg-white"
        >
          <defs>
            <clipPath id={idDoRecorte}>
              <rect x={desenho.caixa.x} y={desenho.caixa.y} width={desenho.caixa.w} height={desenho.caixa.h} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${idDoRecorte})`}>
            {desenho.nos}
            {desenho.proj &&
              doNivel.map((x, i) => {
                const q = desenho.proj!(x.ponto);
                return <circle key={`marca-${i}`} data-testid="marca-da-previa" cx={q.x * K} cy={q.y * K} r={4 * K} fill="rgba(220, 38, 38, 0.15)" stroke="#dc2626" strokeWidth={K * 0.6} />;
              })}
          </g>
        </svg>
      ) : (
        <p className="text-sm text-slate-500">Este pavimento não tem nada desenhado.</p>
      )}
    </section>
  );
}

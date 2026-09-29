/**
 * A VERIFICAÇÃO DA REDE NO DESENHO (28/09/2026, Etapa 0.1 do roadmap
 * hidrossanitário — `docs/planos/2026-09-28-hidrossanitario-roadmap.md`).
 *
 * Três problemas que o sistema já sabia calcular e ninguém via:
 *
 *   1. PONTA ABERTA — tubo que termina sem ligar em nada (sem outro tubo, sem
 *      ponto, sem peça). `conexoesDerivadas` sempre as calculou e nenhuma tela
 *      as mostrava. A saída da VENTILAÇÃO é aberta de propósito e fica de fora;
 *   2. DN FORA DO NECESSÁRIO no esgoto — `verificarDnDoEsgoto`;
 *   3. LOUÇA SEM PONTO — a peça desenhada que ainda não tem o ponto de água ou
 *      de esgoto dela (`pontosDaLouca`).
 *
 * Tudo derivado do modelo, nada gravado. O pavimento da marca é o do TRECHO (a
 * chave do nó põe o que está sob o piso do andar no teto do de baixo, mas o
 * tubo é desenhado e lido no andar dele) — mesma regra de `simbolosDasConexoes2D`.
 */
import { ROTULO_DA_LIMPEZA, ROTULO_DO_EXTRAVASOR } from './blueprintPecasDaCaixa';
import type { BlueprintModel, DisciplinaDeRede, ObjectId } from './blueprintKernel';
import { conexoesDerivadas } from './blueprintKernel';
import { verificarDnDoEsgoto } from './blueprintEsgotoAutomatico';
import { pontosDaLouca } from './blueprintPontosHidraulicos';
import { ROTULO_DA_DISCIPLINA } from './blueprintRede';
import type { PressoesDaRede } from './blueprintPressaoDaRede';

export type TipoDeMarca = 'PONTA_ABERTA' | 'DN_MENOR' | 'DN_MAIOR' | 'LOUCA_SEM_PONTO' | 'PRESSAO_BAIXA' | 'PRESSAO_ALTA';

export interface MarcaDeVerificacao {
  chave: string;
  tipo: TipoDeMarca;
  levelId: ObjectId;
  at: { x: number; y: number };
  /** O que o desenho escreve junto da marca. */
  texto: string;
  /** ERRO = a rede está incompleta ou errada; AVISO = funciona, mas não é o recomendado. */
  severidade: 'ERRO' | 'AVISO';
  /** O elemento a selecionar ao clicar na linha da gaveta. */
  alvoId: ObjectId;
  disciplina?: DisciplinaDeRede;
}

/**
 * Todas as marcas do modelo (ou só as do pavimento), em ordem estável. As
 * PRESSÕES (E1.3) chegam calculadas por quem tem as hipóteses do usuário — a
 * marca não pode discordar da tabela da gaveta.
 */
export function marcasDeVerificacao(model: BlueprintModel, levelId: ObjectId | null = null, pressoes: readonly PressoesDaRede[] = []): MarcaDeVerificacao[] {
  const trechoPorId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const marcas: MarcaDeVerificacao[] = [];

  for (const p of conexoesDerivadas(model).pontasAbertas) {
    const t = trechoPorId.get(p.trechoId);
    if (!t) continue;
    // E4.2: extravasor e limpeza da caixa d'água descarregam LIVRES — as duas pontas são de propósito.
    if (t.rotulo === ROTULO_DO_EXTRAVASOR || t.rotulo === ROTULO_DA_LIMPEZA) continue;
    // A saída da ventilação (a ponta de CIMA do trecho "Ventilação") é aberta de propósito.
    if (t.rotulo === 'Ventilação') {
      const pontaDeCima = t.cotaAMm >= t.cotaBMm ? t.a : t.b;
      if (pontaDeCima.x === p.no.x && pontaDeCima.y === p.no.y) continue;
    }
    marcas.push({
      chave: `ponta|${t.id}|${p.no.x},${p.no.y}|${p.cotaMm}`,
      tipo: 'PONTA_ABERTA',
      levelId: t.levelId,
      at: { ...p.no },
      texto: 'ponta aberta',
      severidade: 'ERRO',
      alvoId: t.id,
      disciplina: t.disciplina,
    });
  }

  for (const v of verificarDnDoEsgoto(model)) {
    const menor = v.tipo === 'MENOR';
    marcas.push({
      chave: `dn|${v.trechoId}`,
      tipo: menor ? 'DN_MENOR' : 'DN_MAIOR',
      levelId: v.levelId,
      at: v.meio,
      texto: `DN ${v.dnAtualMm} ${menor ? '<' : '>'} ${v.dnNecessarioMm} (${v.uhc} UHC)`,
      severidade: menor ? 'ERRO' : 'AVISO',
      alvoId: v.trechoId,
      disciplina: 'ESGOTO',
    });
  }

  for (const c of model.componentes ?? []) {
    const faltam = pontosDaLouca(model, c);
    if (faltam.length === 0) continue;
    const redes = [...new Set(faltam.map((f) => ROTULO_DA_DISCIPLINA[f.disciplina].toLowerCase()))].join(', ');
    marcas.push({
      chave: `louca|${c.id}`,
      tipo: 'LOUCA_SEM_PONTO',
      levelId: c.levelId,
      at: { ...c.at },
      texto: `sem ponto (${redes})`,
      severidade: 'AVISO',
      alvoId: c.id,
    });
  }

  const um = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  for (const r of pressoes) {
    for (const p of r.pontos) {
      if (p.estado === 'INSUFICIENTE') {
        marcas.push({ chave: `pressao|${p.terminalId}`, tipo: 'PRESSAO_BAIXA', levelId: p.levelId, at: { ...p.at }, texto: `${um(p.disponivelKpa!)} < ${um(p.minimaKpa)} kPa`, severidade: 'ERRO', alvoId: p.terminalId, disciplina: r.disciplina });
      } else if (p.estado === 'EXCESSIVA') {
        marcas.push({ chave: `pressao|${p.terminalId}`, tipo: 'PRESSAO_ALTA', levelId: p.levelId, at: { ...p.at }, texto: `estática ${um(p.estaticaKpa!)} kPa`, severidade: 'AVISO', alvoId: p.terminalId, disciplina: r.disciplina });
      }
    }
  }

  return marcas.filter((m) => !levelId || m.levelId === levelId).sort((a, b) => a.chave.localeCompare(b.chave));
}

/** O resumo para a gaveta de uma disciplina: quantas pontas abertas e quais DN fora. */
export function resumoDaVerificacao(marcas: readonly MarcaDeVerificacao[], disciplinas: readonly DisciplinaDeRede[]): {
  pontasAbertas: number;
  dnFora: MarcaDeVerificacao[];
} {
  const daRede = marcas.filter((m) => m.disciplina && disciplinas.includes(m.disciplina));
  return {
    pontasAbertas: daRede.filter((m) => m.tipo === 'PONTA_ABERTA').length,
    dnFora: daRede.filter((m) => m.tipo === 'DN_MENOR' || m.tipo === 'DN_MAIOR'),
  };
}

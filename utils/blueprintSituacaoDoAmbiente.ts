/**
 * A SITUAÇÃO DE CADA DISCIPLINA NUM AMBIENTE (14/10/2026) — uma linha por
 * disciplina no cartão do ambiente.
 *
 * Nasceu de *"parece que o ambiente ficou misturado com eletrica. Ambiente nao
 * esta vinculado a apenas eletrica, mas tambem hidraulica, climatizazacao etc."*
 * O cartão do ambiente (seção Ambientes do painel) carregava a tarefa inteira
 * de tomadas — conferência 9.5.2, Completar pela norma, Distribuir — e nada das
 * outras disciplinas. Agora o cartão diz o que o ambiente É, e cada disciplina
 * ganha UMA linha de situação que abre a gaveta dela. A ação mora na gaveta.
 *
 * PURO: recebe o que o editor já calculou (conferência da NBR 5410, plano de
 * pontos hidráulicos, premissas da climatização) e só resume. Nenhuma regra de
 * norma nasce aqui — se o resumo divergir da gaveta, quem está certo é a gaveta.
 *
 * Plano: `docs/planos/2026-10-14-ambiente-uso-disciplinas.md`.
 */
import type { ConferenciaDeIluminacao, ConferenciaDeTomadas } from './blueprintDistribuicao';
import type { PlanoDePontosDoAmbiente } from './blueprintPontosHidraulicos';
import { ROTULO_DO_KIT } from './blueprintPontosHidraulicos';

export type DisciplinaDoAmbiente = 'ELETRICA' | 'HIDRAULICA' | 'CLIMATIZACAO';

/** `ok` atende · `falta` há o que fazer · `neutro` nada a conferir (ou falta classificar). */
export type EstadoDaDisciplina = 'ok' | 'falta' | 'neutro';

export interface SituacaoDaDisciplina {
  disciplina: DisciplinaDoAmbiente;
  estado: EstadoDaDisciplina;
  texto: string;
}

export const ROTULO_DA_DISCIPLINA_DO_AMBIENTE: Record<DisciplinaDoAmbiente, string> = {
  ELETRICA: 'Elétrica',
  HIDRAULICA: 'Hidráulica',
  CLIMATIZACAO: 'Climatização',
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * ELÉTRICA: tomadas (9.5.2.2) e iluminação (9.5.2.1). A iluminação vale para
 * todo cômodo; as tomadas só com o ambiente classificado (`conferencia` null).
 */
export function situacaoEletrica(
  conferencia: ConferenciaDeTomadas | null,
  luz: ConferenciaDeIluminacao | null | undefined,
): SituacaoDaDisciplina {
  const partes: string[] = [];
  let falta = false;
  if (conferencia) {
    const faltam = Math.max(conferencia.deficit, conferencia.deficitMedias);
    if (faltam > 0) {
      falta = true;
      partes.push(`faltam ${plural(faltam, 'tomada', 'tomadas')}`);
    } else {
      partes.push(`tomadas ✓ (${conferencia.existentes}/${conferencia.minimo})`);
    }
  } else {
    partes.push('tomadas: classifique o ambiente');
  }
  if (luz) {
    const faltasDeLuz = [
      luz.faltaLuzDeTeto ? 'luz de teto' : null,
      luz.faltaInterruptor ? 'interruptor' : luz.faltaComando ? 'comando' : null,
      luz.deficitVA > 0 ? `${luz.deficitVA} VA` : null,
    ].filter((x): x is string => x != null);
    if (faltasDeLuz.length > 0) {
      falta = true;
      partes.push(`falta ${faltasDeLuz.join(', ')}`);
    } else {
      partes.push('iluminação ✓');
    }
  }
  return {
    disciplina: 'ELETRICA',
    estado: falta ? 'falta' : conferencia ? 'ok' : 'neutro',
    texto: partes.join(' · '),
  };
}

/**
 * HIDRÁULICA: o kit de pontos do ambiente (`planejarPontosDoAmbiente`). Sem
 * plano = o ambiente não pede pontos de água: ou falta classificar, ou é seco.
 */
export function situacaoHidraulica(
  plano: PlanoDePontosDoAmbiente | null | undefined,
  classificado: boolean,
): SituacaoDaDisciplina {
  if (!plano || !plano.kit) {
    return {
      disciplina: 'HIDRAULICA',
      estado: 'neutro',
      texto: classificado ? 'sem pontos de água previstos para este uso' : 'classifique o ambiente para prever os pontos',
    };
  }
  const kit = `kit ${ROTULO_DO_KIT[plano.kit].toLowerCase()}`;
  // Sem peça posicionada: o kit existe, mas o ambiente não comporta (motivo dito pelo plano).
  if (plano.pecas.length === 0) {
    return { disciplina: 'HIDRAULICA', estado: 'falta', texto: `${kit}: ${plano.motivo ?? 'não foi possível posicionar'}` };
  }
  const total = plano.jaExistentes + plano.aCriar;
  if (plano.aCriar > 0) {
    return {
      disciplina: 'HIDRAULICA',
      estado: 'falta',
      texto: `${kit}: ${plano.jaExistentes} de ${total} pontos · ${plano.aCriar === 1 ? 'falta 1' : `faltam ${plano.aCriar}`}`,
    };
  }
  return { disciplina: 'HIDRAULICA', estado: 'ok', texto: `${kit} completo (${plural(total, 'ponto', 'pontos')})` };
}

/**
 * CLIMATIZAÇÃO: se o uso pede ar (padrão do uso, ou o que foi declarado) e
 * quantas evaporadoras há no ambiente. A carga térmica fica na gaveta.
 */
export function situacaoClimatizacao(args: {
  /** O rótulo do uso que a climatização reconheceu ("Dormitório"), ou `null`. */
  uso: string | null;
  climatizado: boolean;
  evaporadoras: number;
}): SituacaoDaDisciplina {
  const uso = args.uso ?? 'uso não reconhecido';
  if (!args.climatizado) {
    return { disciplina: 'CLIMATIZACAO', estado: 'neutro', texto: `${uso} · não climatizado` };
  }
  if (args.evaporadoras === 0) {
    return { disciplina: 'CLIMATIZACAO', estado: 'falta', texto: `${uso} · climatizado, sem evaporadora` };
  }
  return {
    disciplina: 'CLIMATIZACAO',
    estado: 'ok',
    texto: `${uso} · ${plural(args.evaporadoras, 'evaporadora', 'evaporadoras')}`,
  };
}

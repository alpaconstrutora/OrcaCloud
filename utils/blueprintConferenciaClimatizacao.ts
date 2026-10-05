/**
 * CONFERÊNCIA DA CARGA TÉRMICA (04/10/2026, E2.3 da climatização): o que o
 * cálculo de um pavimento tem e o que lhe falta, em três estados + "não
 * avaliado" — o molde das conferências do hidro e do incêndio. FALTA é o que
 * impede o número de valer como projeto; AVISO é o que o faz valer com
 * ressalva (hipótese no lugar de declaração); NAO_AVALIADO é o que o desenho
 * não soube responder.
 */
import type { CargaTermicaDoNivel } from './blueprintCargaTermica';

export type EstadoDaConferencia = 'OK' | 'AVISO' | 'FALTA' | 'NAO_AVALIADO';

export interface ItemConferido {
  codigo: string;
  item: string;
  estado: EstadoDaConferencia;
  /** O que se achou, em uma frase. */
  obtido: string;
  /** Os ambientes a selecionar, quando o achado é deles. */
  spaceIds: string[];
}

export interface ConferenciaDeCargaTermica {
  itens: ItemConferido[];
  faltas: number;
  avisos: number;
  naoAvaliados: number;
  /** Nenhuma falta: o número vale como projeto (com as ressalvas dos avisos). */
  fecha: boolean;
}

/** Faixa plausível de densidade de carga residencial, W/m² — HIPÓTESE para pegar erro grosseiro, não norma. CONFERIR. */
export const FAIXA_PLAUSIVEL_W_POR_M2 = { min: 40, max: 300 } as const;

export function conferenciaDeCargaTermica(n: CargaTermicaDoNivel): ConferenciaDeCargaTermica {
  const itens: ItemConferido[] = [];
  const clim = n.ambientes.filter((a) => a.climatizado);
  const c = n.condicoes;

  itens.push({
    codigo: 'TBS',
    item: 'Temperatura externa de projeto (TBS)',
    estado: c.tbsC.valor == null ? 'FALTA' : c.tbsC.origem === 'TABELA' ? 'AVISO' : 'OK',
    obtido: c.tbsC.valor == null ? 'sem valor — escolha a cidade ou declare' : `${c.tbsC.valor} °C (${c.tbsC.origem === 'DECLARADA' ? 'declarada' : 'tabela de memória — CONFERIR NA NORMA'})`,
    spaceIds: [],
  });
  itens.push({
    codigo: 'TBU',
    item: 'Temperatura de bulbo úmido externa (parcela latente)',
    estado: c.tbuC.valor == null ? 'AVISO' : c.tbuC.origem === 'TABELA' ? 'AVISO' : 'OK',
    obtido: c.tbuC.valor == null ? 'sem valor — latente da infiltração não avaliada' : `${c.tbuC.valor} °C (${c.tbuC.origem === 'DECLARADA' ? 'declarada' : 'tabela de memória — CONFERIR NA NORMA'})`,
    spaceIds: [],
  });
  itens.push({
    codigo: 'CLIMATIZADOS',
    item: 'Ambientes climatizados no pavimento',
    estado: clim.length === 0 ? 'AVISO' : 'OK',
    obtido: clim.length === 0 ? 'nenhum — declare nas premissas por ambiente ou nomeie os ambientes' : `${clim.length} de ${n.ambientes.length}`,
    spaceIds: clim.map((a) => a.spaceId),
  });

  const semEtiqueta = clim.filter((a) => a.pendencias.some((p) => /sem etiqueta/.test(p)));
  itens.push({
    codigo: 'ETIQUETAS',
    item: 'Vizinhos com etiqueta (climatizado ou não?)',
    estado: semEtiqueta.length ? 'AVISO' : clim.length ? 'OK' : 'NAO_AVALIADO',
    obtido: semEtiqueta.length ? `${semEtiqueta.length} ambiente(s) com vizinho sem etiqueta — tratado como não climatizado` : 'todos os vizinhos identificados',
    spaceIds: semEtiqueta.map((a) => a.spaceId),
  });

  const janelasSemVidro = clim.flatMap((a) => a.vaos.filter((v) => /janela/.test(v.descricao) && /típico/.test(v.conducao.memoria)).map(() => a.spaceId));
  itens.push({
    codigo: 'VIDRO',
    item: 'Vidro das janelas declarado (U e fator solar)',
    estado: janelasSemVidro.length ? 'AVISO' : clim.length ? 'OK' : 'NAO_AVALIADO',
    obtido: janelasSemVidro.length ? `${janelasSemVidro.length} janela(s) com vidro típico (hipótese)` : 'todas declaradas',
    spaceIds: [...new Set(janelasSemVidro)],
  });

  const envoltoriaTipica = clim.filter((a) => a.paredes.some((p) => p.parcela.origem !== 'NAO_AVALIADA' && /típico/.test(p.parcela.memoria)) || /típico/.test(a.teto.memoria));
  itens.push({
    codigo: 'ENVOLTORIA',
    item: 'U de paredes e teto pelas camadas declaradas',
    estado: envoltoriaTipica.length ? 'AVISO' : clim.length ? 'OK' : 'NAO_AVALIADO',
    obtido: envoltoriaTipica.length ? `${envoltoriaTipica.length} ambiente(s) com U típico em parede ou teto (sem camadas ou sem λ)` : 'camadas com λ em toda a envoltória',
    spaceIds: envoltoriaTipica.map((a) => a.spaceId),
  });

  const foraDaFaixa = clim.filter((a) => a.totalW > 0 && (a.wPorM2 < FAIXA_PLAUSIVEL_W_POR_M2.min || a.wPorM2 > FAIXA_PLAUSIVEL_W_POR_M2.max));
  itens.push({
    codigo: 'DENSIDADE',
    item: `Densidade de carga plausível (${FAIXA_PLAUSIVEL_W_POR_M2.min}–${FAIXA_PLAUSIVEL_W_POR_M2.max} W/m², hipótese)`,
    estado: n.deltaTExternoK == null ? 'NAO_AVALIADO' : foraDaFaixa.length ? 'AVISO' : clim.length ? 'OK' : 'NAO_AVALIADO',
    obtido: n.deltaTExternoK == null ? 'sem TBS' : foraDaFaixa.length ? foraDaFaixa.map((a) => `${a.nome}: ${a.wPorM2} W/m²`).join(' · ') : 'todos na faixa',
    spaceIds: foraDaFaixa.map((a) => a.spaceId),
  });

  const faltas = itens.filter((i) => i.estado === 'FALTA').length;
  const avisos = itens.filter((i) => i.estado === 'AVISO').length;
  const naoAvaliados = itens.filter((i) => i.estado === 'NAO_AVALIADO').length;
  return { itens, faltas, avisos, naoAvaliados, fecha: faltas === 0 };
}

/**
 * CONFERÊNCIA NBR 5410 — o painel que lê o desenho contra a norma.
 *
 * ─── O PEDIDO (10/09/2026) ─────────────────────────────────────────────────
 *
 * *"Analise estes itens da norma nbr 5410"* (9.5.2.2.1, 9.5.2.2.2, 9.5.2.3,
 * 9.5.3.1, 9.5.3.2, 9.5.3.3) → *"Aceito o painel"* → fatia 3.
 *
 * ─── ⚠️ O QUE ISTO É ───────────────────────────────────────────────────────
 *
 * Um CONFERIDOR, não um projetista: lê o que foi DECLARADO (tipo do ambiente,
 * tipo do ponto, potência, circuito, tensão) e diz onde a declaração fere a
 * norma. Não atribui potência, não divide circuito, não escolhe disjuntor —
 * "somar é registro, decidir é projeto", e projeto elétrico tem ART atrás.
 *
 * ─── ⚠️ E O QUE ELE NÃO CONSEGUE AVALIAR, ELE DIZ ───────────────────────────
 *
 * Circuito sem tensão não tem corrente calculável; ambiente sem tipo não tem
 * mínimo; ponto sem potência não entra na soma. Cada regra devolve, além dos
 * achados, o que ficou FORA da avaliação — porque "✓ atende" em cima de dados
 * ausentes é a pior espécie de verde.
 *
 * Módulo puro: cada regra é uma função de modelo → achados, testável sem tela.
 */
import {
  areaRecuada,
  pointInPolygon,
  type BlueprintModel,
  type Circuito,
  type ObjectId,
  type Space,
  type Terminal,
  type TipoDeAmbiente,
} from './blueprintKernel';
import { circuitoComDR30, drDoCircuito, drsDoQuadro, rotuloDoDPS, rotuloDoDR, type Command } from './blueprintKernel';
import { conferirIluminacao, conferirTomadas, etiquetaDoAmbiente } from './blueprintDistribuicao';
import {
  HIPOTESES_PADRAO,
  ocupacaoDoTrecho,
  preDimensionarCircuito,
  preDimensionarQuadroCompleto,
  TIPOS_DE_USO_ESPECIFICO,
  type HipotesesEletricas,
} from './blueprintEletricaDimensionamento';
import { sugerirInDoDR } from './blueprintEletricaDimensionamento';
import { entradaDoQuadro, padraoDeEntrada } from './blueprintEntradaDeEnergia';
import { composicaoDaRede } from './blueprintFiacao';

export type CodigoDaRegra =
  | '9.5.2.1'
  | '9.5.2.2.1'
  | '9.5.2.2.2'
  | '9.5.2.3'
  | '9.5.3.1'
  | '9.5.3.2'
  | '9.5.3.3'
  | '5.1.3.2.2'
  | 'PRE-DIM'
  | '6.2.7.1'
  | '6.2.11.1.6'
  | '6.3.5.2'
  | '5.3.5.5'
  | 'ENTRADA'
  | 'SUGERIDAS';

export interface Achado {
  /** FALTA fere a norma; AVISO é o que impede avaliar ou pede olhar. */
  nivel: 'FALTA' | 'AVISO';
  mensagem: string;
  /** Peças envolvidas, para "ver no desenho". */
  ids: ObjectId[];
  /** Ação oferecida, quando há uma que não decide pelo projetista. */
  acao?: { tipo: 'CONVERTER_LIGACAO_DIRETA'; terminalIds: ObjectId[] };
}

export interface RegraConferida {
  codigo: CodigoDaRegra;
  titulo: string;
  achados: Achado[];
  /** O que ficou fora da avaliação, em texto — vazio = tudo avaliado. */
  naoAvaliado: string[];
  /** Quantas unidades (ambientes, pontos, circuitos) a regra olhou. */
  avaliados: number;
}

export interface ConferenciaNbr5410 {
  regras: RegraConferida[];
  faltas: number;
  avisos: number;
}

// ─── Contexto compartilhado ────────────────────────────────────────────────

interface AmbienteClassificado {
  space: Space;
  nome: string;
  tipo: TipoDeAmbiente | null;
}

const AMBIENTES_MOLHADOS: ReadonlySet<TipoDeAmbiente> = new Set(['BANHEIRO', 'COZINHA_SERVICO']);
const AMBIENTES_9532: ReadonlySet<TipoDeAmbiente> = new Set(['COZINHA_SERVICO']);

const ehTomada = (t: Terminal) => t.tipoEletrico === 'TUG' || t.tipoEletrico === 'TUE';
const ehLuz = (t: Terminal) => t.tipoEletrico?.startsWith('ILUMINACAO') ?? false;
// E1.1: os EQUIPAMENTOS (AC, motor, portão, VE…) são força — a 9.5.3.1 os olha também.
const ehForca = (t: Terminal) => !!t.tipoEletrico && TIPOS_DE_USO_ESPECIFICO.has(t.tipoEletrico);

/** Aquecedor de água pelo TEXTO que o projetista escreveu — o que há para saber. */
const AQUECEDOR = /chuveiro|aquecedor|boiler|torneira\s+el[eé]trica|ducha/i;
export const ehAquecedorDeAgua = (t: Terminal) =>
  AQUECEDOR.test(t.tipo) || AQUECEDOR.test(t.rotulo ?? '');

function ambientesDo(model: BlueprintModel, levelId: ObjectId | null): AmbienteClassificado[] {
  return model.spaces
    .filter((s) => !levelId || s.levelId === levelId)
    .map((s, i) => ({
      space: s,
      nome: s.name ?? `Ambiente ${i + 1}`,
      tipo: etiquetaDoAmbiente(s, model.labels)?.tipoDeAmbiente ?? null,
    }));
}

function terminaisEletricos(model: BlueprintModel, levelId: ObjectId | null): Terminal[] {
  return (model.terminais ?? []).filter(
    (t) => t.disciplina === 'ELETRICA' && (!levelId || t.levelId === levelId),
  );
}

/** O ambiente em que um ponto cai — pelo contorno de eixo, descontando vazios. */
function ambienteDo(t: Terminal, ambientes: readonly AmbienteClassificado[]): AmbienteClassificado | null {
  return (
    ambientes.find(
      (a) =>
        a.space.levelId === t.levelId &&
        pointInPolygon(a.space.ring, t.at) &&
        !a.space.holes.some((h) => pointInPolygon(h, t.at)),
    ) ?? null
  );
}

const rotuloDoPonto = (t: Terminal) => t.rotulo?.trim() || t.tipo;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ─── 9.5.2.1 — iluminação: luz de teto, interruptor, carga mínima ──────────

function regra9521(model: BlueprintModel, levelId: ObjectId | null): RegraConferida {
  const ambientes = ambientesDo(model, levelId);
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];
  for (const a of ambientes) {
    const paredes = model.walls.filter((w) => w.levelId === a.space.levelId);
    const areaM2 = areaRecuada(a.space.ring, paredes).areaMm2 / 1_000_000;
    const c = conferirIluminacao(a.space, model.terminais ?? [], areaM2, a.tipo);
    const faltas: string[] = [];
    if (c.faltaLuzDeTeto) faltas.push('sem ponto de luz no teto');
    if (c.luzNaParedeAdmitida) {
      achados.push({
        nivel: 'AVISO',
        mensagem: `${a.nome}: luz na parede no lugar da de teto — admitido em cômodo pequeno (nota 2 de 9.5.2.1.1)`,
        ids: [],
      });
    }
    if (c.faltaInterruptor) faltas.push('sem interruptor');
    if (c.deficitVA > 0) faltas.push(`${c.declaradoVA} VA declarados, mínimo ${c.minimoVA} VA`);
    if (faltas.length > 0) {
      achados.push({ nivel: 'FALTA', mensagem: `${a.nome}: ${faltas.join(' · ')}`, ids: [] });
    }
    // O pareamento das letras — ver `conferirComandos`.
    const cm = c.comandos;
    if (!c.faltaInterruptor && cm.luzesSemInterruptor.length > 0) {
      const letras = [...new Set(cm.luzesSemInterruptor.map((x) => x.letra))].join(', ');
      achados.push({
        nivel: 'FALTA',
        mensagem: `${a.nome}: luz "${letras}" sem interruptor com essa letra`,
        ids: cm.luzesSemInterruptor.map((x) => x.id),
      });
    }
    if (cm.paralelosSemPar.length > 0) {
      const letras = [...new Set(cm.paralelosSemPar.map((x) => x.letra))].join(', ');
      achados.push({
        nivel: 'FALTA',
        mensagem: `${a.nome}: interruptor paralelo "${letras}" sem o par — three way só existe aos pares`,
        ids: cm.paralelosSemPar.map((x) => x.id),
      });
    }
    if (cm.intermediariosSemParalelos.length > 0) {
      const letras = [...new Set(cm.intermediariosSemParalelos.map((x) => x.letra))].join(', ');
      achados.push({
        nivel: 'FALTA',
        mensagem: `${a.nome}: intermediário "${letras}" sem os dois paralelos da mesma letra`,
        ids: cm.intermediariosSemParalelos.map((x) => x.id),
      });
    }
    if (cm.interruptoresSemLuz.length > 0) {
      const letras = [...new Set(cm.interruptoresSemLuz.map((x) => x.letra))].join(', ');
      achados.push({
        nivel: 'AVISO',
        mensagem: `${a.nome}: interruptor "${letras}" não comanda nenhuma luz deste cômodo`,
        ids: cm.interruptoresSemLuz.map((x) => x.id),
      });
    }
    if (c.semPotencia > 0) {
      naoAvaliado.push(`${a.nome}: ${plural(c.semPotencia, 'ponto de luz sem potência', 'pontos de luz sem potência')}, carga não conferida`);
    }
  }
  return {
    codigo: '9.5.2.1',
    titulo: 'Iluminação: luz de teto com interruptor e carga mínima por cômodo',
    achados,
    naoAvaliado,
    avaliados: ambientes.length,
  };
}

// ─── 9.5.2.2.1 — número mínimo de pontos de tomada ──────────────────────────

function regra95221(model: BlueprintModel, levelId: ObjectId | null): RegraConferida {
  const ambientes = ambientesDo(model, levelId);
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];
  const semTipo = ambientes.filter((a) => !a.tipo);
  if (semTipo.length > 0) {
    naoAvaliado.push(
      `${plural(semTipo.length, 'ambiente', 'ambientes')} sem tipo: ${semTipo.map((a) => a.nome).join(', ')}`,
    );
  }
  let avaliados = 0;
  for (const a of ambientes) {
    if (!a.tipo) continue;
    const paredes = model.walls.filter((w) => w.levelId === a.space.levelId);
    const areaM2 = areaRecuada(a.space.ring, paredes).areaMm2 / 1_000_000;
    const c = conferirTomadas(a.space, a.tipo, paredes, model.terminais ?? [], areaM2);
    if (!c) continue;
    avaliados++;
    if (c.deficit > 0 || c.deficitMedias > 0) {
      const partes = [`mín. ${c.minimo} (${c.regra}), há ${c.existentes}`];
      if (c.deficit > 0) partes.push(`faltam ${c.deficit}`);
      if (c.deficitMedias > 0 && c.ondeAMedia) {
        partes.push(`${c.deficitMedias} ${c.ondeAMedia}`);
      }
      achados.push({ nivel: 'FALTA', mensagem: `${a.nome}: ${partes.join(' · ')}`, ids: [] });
    }
    // O ponto EXTERNO que a norma admite contou — dito, para ninguém procurar
    // dentro do cômodo a tomada que não está lá.
    if (c.existentesFora > 0 && c.admiteFora) {
      achados.push({
        nivel: 'AVISO',
        mensagem: `${a.nome}: ${plural(c.existentesFora, 'tomada externa contou', 'tomadas externas contaram')} — ${c.admiteFora.motivo}`,
        ids: [],
      });
    }
    if (c.semTipo > 0) {
      achados.push({
        nivel: 'AVISO',
        mensagem: `${a.nome}: ${plural(c.semTipo, 'ponto elétrico sem tipo', 'pontos elétricos sem tipo')} — fora da conta`,
        ids: [],
      });
    }
  }
  return {
    codigo: '9.5.2.2.1',
    titulo: 'Número mínimo de pontos de tomada por ambiente',
    achados,
    naoAvaliado,
    avaliados,
  };
}

// ─── 9.5.2.2.2 — potência mínima por ponto de tomada ────────────────────────

/**
 * Banheiro, cozinha, área de serviço: 600 VA por ponto até 3 (ou até 2, se o
 * conjunto desses ambientes passa de 6 tomadas), 100 VA para os excedentes.
 * Demais: 100 VA por ponto.
 *
 * ⚠️ A conferência é de VIABILIDADE: ordenando as potências declaradas do
 * ambiente da maior para a menor, as `k` primeiras têm de ser ≥ 600 e todas
 * ≥ 100. A norma não diz QUAL tomada leva os 600 — o projetista escolhe —,
 * então exigir 600 de uma tomada específica seria decidir por ele.
 */
export function minimoDePotencia(
  tipo: TipoDeAmbiente,
  potenciasVA: readonly number[],
  conjuntoMolhadoPassaDeSeis: boolean,
): { falhas: number; exigido: string } {
  const ordenadas = [...potenciasVA].sort((a, b) => b - a);
  if (!AMBIENTES_MOLHADOS.has(tipo)) {
    return { falhas: ordenadas.filter((p) => p < 100).length, exigido: '100 VA por ponto' };
  }
  const k = conjuntoMolhadoPassaDeSeis ? 2 : 3;
  let falhas = 0;
  ordenadas.forEach((p, i) => {
    if (i < k ? p < 600 : p < 100) falhas++;
  });
  return { falhas, exigido: `600 VA nos ${k} primeiros pontos, 100 VA nos demais` };
}

function regra95222(model: BlueprintModel, levelId: ObjectId | null): RegraConferida {
  const ambientes = ambientesDo(model, levelId);
  const tomadas = terminaisEletricos(model, levelId).filter(ehTomada);
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];

  const porAmbiente = new Map<AmbienteClassificado, Terminal[]>();
  const foraDeAmbiente: Terminal[] = [];
  for (const t of tomadas) {
    const a = ambienteDo(t, ambientes);
    if (!a) {
      foraDeAmbiente.push(t);
      continue;
    }
    porAmbiente.set(a, [...(porAmbiente.get(a) ?? []), t]);
  }
  if (foraDeAmbiente.length > 0) {
    naoAvaliado.push(`${plural(foraDeAmbiente.length, 'tomada', 'tomadas')} fora de qualquer ambiente fechado`);
  }
  const totalMolhado = [...porAmbiente.entries()]
    .filter(([a]) => a.tipo && AMBIENTES_MOLHADOS.has(a.tipo))
    .reduce((s, [, ts]) => s + ts.length, 0);

  let avaliados = 0;
  for (const [a, ts] of porAmbiente) {
    if (!a.tipo) {
      naoAvaliado.push(`${a.nome}: sem tipo (${plural(ts.length, 'tomada', 'tomadas')})`);
      continue;
    }
    const semPotencia = ts.filter((t) => t.potenciaW == null);
    const comPotencia = ts.filter((t) => t.potenciaW != null);
    if (semPotencia.length > 0) {
      achados.push({
        nivel: 'AVISO',
        mensagem: `${a.nome}: ${plural(semPotencia.length, 'tomada sem potência declarada', 'tomadas sem potência declarada')}`,
        ids: semPotencia.map((t) => t.id),
      });
    }
    if (comPotencia.length === 0) continue;
    avaliados += comPotencia.length;
    const { falhas, exigido } = minimoDePotencia(
      a.tipo,
      comPotencia.map((t) => t.potenciaW as number),
      totalMolhado > 6,
    );
    if (falhas > 0) {
      achados.push({
        nivel: 'FALTA',
        mensagem: `${a.nome}: ${plural(falhas, 'tomada abaixo do mínimo', 'tomadas abaixo do mínimo')} (${exigido})`,
        ids: comPotencia.map((t) => t.id),
      });
    }
  }
  return {
    codigo: '9.5.2.2.2',
    titulo: 'Potência mínima por ponto de tomada',
    achados,
    naoAvaliado,
    avaliados,
  };
}

// ─── 9.5.2.3 — aquecedor de água: ligação direta, sem tomada ───────────────

function regra9523(model: BlueprintModel, levelId: ObjectId | null): RegraConferida {
  const pontos = terminaisEletricos(model, levelId);
  const emTomada = pontos.filter((t) => ehTomada(t) && ehAquecedorDeAgua(t));
  const achados: Achado[] = [];
  if (emTomada.length > 0) {
    achados.push({
      nivel: 'FALTA',
      mensagem: `${plural(emTomada.length, 'aquecedor de água ligado por tomada', 'aquecedores de água ligados por tomada')}: ${emTomada.map(rotuloDoPonto).join(', ')} — a conexão deve ser direta`,
      ids: emTomada.map((t) => t.id),
      acao: { tipo: 'CONVERTER_LIGACAO_DIRETA', terminalIds: emTomada.map((t) => t.id) },
    });
  }
  return {
    codigo: '9.5.2.3',
    titulo: 'Aquecedor elétrico de água: conexão direta, sem tomada',
    achados,
    // Só se sabe pelo texto: um chuveiro chamado "TUE 1" passa.
    naoAvaliado: ['reconhecido pelo nome do ponto (chuveiro, aquecedor, boiler, ducha, torneira elétrica)'],
    avaliados: pontos.filter((t) => ehTomada(t) || t.tipoEletrico === 'LIGACAO_DIRETA').length,
  };
}

// ─── 9.5.3.1 — equipamento > 10 A em circuito independente ─────────────────

const correnteA = (t: Terminal, c: Circuito | undefined) =>
  t.potenciaW != null && c?.tensaoV ? t.potenciaW / c.tensaoV : null;

function regra9531(model: BlueprintModel, levelId: ObjectId | null): RegraConferida {
  const pontos = terminaisEletricos(model, levelId);
  const circuitos = new Map((model.circuitos ?? []).map((c) => [c.id, c]));
  const porCircuito = new Map<ObjectId, Terminal[]>();
  for (const t of pontos) {
    if (t.circuitoId) porCircuito.set(t.circuitoId, [...(porCircuito.get(t.circuitoId) ?? []), t]);
  }
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];
  let avaliados = 0;
  const semDados: string[] = [];
  for (const t of pontos.filter(ehForca)) {
    if (!t.circuitoId) continue; // pendência de "sem circuito", já acusada no quadro
    const c = circuitos.get(t.circuitoId);
    const i = correnteA(t, c);
    if (i == null) {
      semDados.push(rotuloDoPonto(t));
      continue;
    }
    avaliados++;
    if (i > 10) {
      const outros = (porCircuito.get(t.circuitoId) ?? []).filter((x) => x.id !== t.id);
      if (outros.length > 0) {
        achados.push({
          nivel: 'FALTA',
          mensagem: `${rotuloDoPonto(t)} (${i.toFixed(1).replace('.', ',')} A) divide o circuito ${c?.nome ?? ''} com ${plural(outros.length, 'outro ponto', 'outros pontos')} — deve ser circuito independente`,
          ids: [t.id, ...outros.map((x) => x.id)],
        });
      }
    }
  }
  if (semDados.length > 0) {
    naoAvaliado.push(`sem potência ou sem tensão no circuito: ${semDados.join(', ')}`);
  }
  return {
    codigo: '9.5.3.1',
    titulo: 'Equipamento acima de 10 A em circuito independente',
    achados,
    naoAvaliado,
    avaliados,
  };
}

// ─── 9.5.3.2 — tomadas de cozinha/serviço em circuito exclusivo ────────────

function regra9532(model: BlueprintModel, levelId: ObjectId | null): RegraConferida {
  const ambientes = ambientesDo(model, levelId);
  const pontos = terminaisEletricos(model, levelId);
  const circuitos = new Map((model.circuitos ?? []).map((c) => [c.id, c]));
  const porCircuito = new Map<ObjectId, Terminal[]>();
  for (const t of pontos) {
    if (t.circuitoId) porCircuito.set(t.circuitoId, [...(porCircuito.get(t.circuitoId) ?? []), t]);
  }
  const achados: Achado[] = [];
  let avaliados = 0;
  for (const [cid, ts] of porCircuito) {
    const daCozinha = ts.filter((t) => {
      if (!ehTomada(t)) return false;
      const a = ambienteDo(t, ambientes);
      return !!a?.tipo && AMBIENTES_9532.has(a.tipo);
    });
    if (daCozinha.length === 0) continue;
    avaliados++;
    const intrusos = ts.filter((t) => !daCozinha.includes(t));
    if (intrusos.length > 0) {
      achados.push({
        nivel: 'FALTA',
        mensagem: `circuito ${circuitos.get(cid)?.nome ?? ''} alimenta tomadas de cozinha/serviço E ${plural(intrusos.length, 'outro ponto', 'outros pontos')} (${intrusos.map(rotuloDoPonto).slice(0, 3).join(', ')}${intrusos.length > 3 ? '…' : ''}) — deve ser exclusivo`,
        ids: ts.map((t) => t.id),
      });
    }
  }
  return {
    codigo: '9.5.3.2',
    titulo: 'Tomadas de cozinha/área de serviço em circuito exclusivo',
    achados,
    naoAvaliado: ambientes.some((a) => !a.tipo) ? ['ambientes sem tipo não entram'] : [],
    avaliados,
  };
}

// ─── 9.5.3.3 — circuito comum (luz + tomadas) ───────────────────────────────

function regra9533(model: BlueprintModel, levelId: ObjectId | null): RegraConferida {
  const ambientes = ambientesDo(model, levelId);
  const pontos = terminaisEletricos(model, levelId);
  const circuitos = new Map((model.circuitos ?? []).map((c) => [c.id, c]));
  const porCircuito = new Map<ObjectId, Terminal[]>();
  for (const t of pontos) {
    if (t.circuitoId) porCircuito.set(t.circuitoId, [...(porCircuito.get(t.circuitoId) ?? []), t]);
  }
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];

  const ehTomadaComum = (t: Terminal) => {
    if (!ehTomada(t)) return false;
    const a = ambienteDo(t, ambientes);
    return !(a?.tipo && AMBIENTES_9532.has(a.tipo));
  };
  const comuns = [...porCircuito.entries()].filter(
    ([, ts]) => ts.some(ehLuz) && ts.some(ehTomada),
  );
  const totalLuz = pontos.filter(ehLuz).length;
  const totalTomadasComuns = pontos.filter(ehTomadaComum).length;

  for (const [cid, ts] of comuns) {
    const c = circuitos.get(cid);
    const nome = c?.nome ?? '';
    // a) IB ≤ 16 A
    const semPotencia = ts.filter((t) => t.potenciaW == null).length;
    if (!c?.tensaoV) {
      naoAvaliado.push(`circuito ${nome}: sem tensão, corrente não calculável`);
    } else {
      const ib = ts.reduce((s, t) => s + (t.potenciaW ?? 0), 0) / c.tensaoV;
      if (ib > 16) {
        achados.push({
          nivel: 'FALTA',
          mensagem: `circuito comum ${nome}: corrente de projeto ${ib.toFixed(1).replace('.', ',')} A > 16 A${semPotencia > 0 ? ` (e ${plural(semPotencia, 'ponto sem potência', 'pontos sem potência')} fora da soma)` : ''}`,
          ids: ts.map((t) => t.id),
        });
      } else if (semPotencia > 0) {
        naoAvaliado.push(`circuito ${nome}: ${plural(semPotencia, 'ponto sem potência', 'pontos sem potência')} fora da soma`);
      }
    }
    // b) toda a iluminação num só circuito comum
    if (totalLuz > 0 && ts.filter(ehLuz).length === totalLuz) {
      achados.push({
        nivel: 'FALTA',
        mensagem: `circuito comum ${nome} alimenta TODA a iluminação — reparta a luz em mais de um circuito`,
        ids: ts.filter(ehLuz).map((t) => t.id),
      });
    }
    // c) todas as tomadas (fora as de 9.5.3.2) num só circuito comum
    if (totalTomadasComuns > 0 && ts.filter(ehTomadaComum).length === totalTomadasComuns) {
      achados.push({
        nivel: 'FALTA',
        mensagem: `circuito comum ${nome} alimenta TODAS as tomadas — reparta as tomadas em mais de um circuito`,
        ids: ts.filter(ehTomadaComum).map((t) => t.id),
      });
    }
  }
  return {
    codigo: '9.5.3.3',
    titulo: 'Circuito comum (iluminação + tomadas): 16 A e repartição',
    achados,
    naoAvaliado,
    avaliados: comuns.length,
  };
}

// ─── Sugeridas ainda não posicionadas ───────────────────────────────────────

function regraSugeridas(model: BlueprintModel, levelId: ObjectId | null): RegraConferida {
  const sugeridas = terminaisEletricos(model, levelId).filter((t) => t.sugerida);
  return {
    codigo: 'SUGERIDAS',
    titulo: 'Tomadas sugeridas pelo sistema, ainda sem posição confirmada',
    achados:
      sugeridas.length > 0
        ? [
            {
              nivel: 'AVISO',
              mensagem: `${plural(sugeridas.length, 'tomada sugerida aguarda', 'tomadas sugeridas aguardam')} posição — mover confirma`,
              ids: sugeridas.map((t) => t.id),
            },
          ]
        : [],
    naoAvaliado: [],
    avaliados: sugeridas.length,
  };
}

// ─── 5.1.3.2.2 — proteção DR onde a norma exige ────────────────────────────
//
// Dispositivo DR de 30 mA nos circuitos que alimentam tomadas em banheiro,
// cozinha/copa/área de serviço, áreas externas (aqui: varanda) e o chuveiro /
// aquecedor de água. O tipo do ambiente e a ligação direta já dizem quais.

const AMBIENTES_COM_DR: ReadonlySet<TipoDeAmbiente> = new Set(['BANHEIRO', 'COZINHA_SERVICO', 'VARANDA']);

/** Os pontos do circuito que OBRIGAM o DR, com o motivo. */
export function pontosQueExigemDR(
  model: BlueprintModel,
  circuitoId: ObjectId,
  ambientes: readonly AmbienteClassificado[],
): { id: ObjectId; motivo: string }[] {
  const saida: { id: ObjectId; motivo: string }[] = [];
  for (const t of (model.terminais ?? []).filter((x) => x.disciplina === 'ELETRICA' && x.circuitoId === circuitoId)) {
    if (t.tipoEletrico === 'LIGACAO_DIRETA' || ehAquecedorDeAgua(t)) {
      saida.push({ id: t.id, motivo: 'aquecedor de água / chuveiro' });
      continue;
    }
    if (!ehTomada(t)) continue;
    const a = ambienteDo(t, ambientes);
    if (a?.tipo && AMBIENTES_COM_DR.has(a.tipo)) saida.push({ id: t.id, motivo: `tomada em ${a.nome}` });
  }
  return saida;
}

function regra51322(model: BlueprintModel, levelId: ObjectId | null, hip: HipotesesEletricas): RegraConferida {
  const ambientes = ambientesDo(model, levelId);
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];
  let avaliados = 0;
  for (const c of model.circuitos ?? []) {
    const exigem = pontosQueExigemDR(model, c.id, ambientes);
    if (exigem.length === 0) continue;
    avaliados++;
    // E3.1: o DR é PEÇA do quadro (`drDoCircuito`); `protecaoDR: true` legado vale como 30 mA.
    const dr = drDoCircuito(model, c);
    if (dr && dr.idnMa <= 30) continue;
    const motivos = [...new Set(exigem.map((x) => x.motivo))].slice(0, 3).join(', ');
    const estado = dr
      ? `protegido por DR de ${dr.idnMa} mA (${dr.geral ? 'geral' : 'do grupo'})`
      : c.protecaoDR === false
        ? 'declarado SEM DR'
        : 'sem DR declarado';
    achados.push({
      nivel: 'FALTA',
      mensagem: `circuito ${c.nome} ${estado} — exige DR de 30 mA (${motivos})`,
      ids: exigem.map((x) => x.id),
    });
  }
  // E3.1: a PEÇA declarada, conferida — In contra os disjuntores que ela atende, e o tamanho do grupo.
  for (const q of (model.quadros ?? []).filter((x) => !levelId || x.levelId === levelId)) {
    const predim = preDimensionarQuadroCompleto(model, q.id, hip);
    for (const dr of drsDoQuadro(model, q.id)) {
      if (dr.legado) continue;
      const circuitos = dr.geral ? (model.circuitos ?? []).filter((c) => c.quadroId === q.id) : (model.circuitos ?? []).filter((c) => dr.circuitoIds.includes(c.id));
      if (!dr.geral && circuitos.length === 0) {
        achados.push({ nivel: 'AVISO', mensagem: `${q.nome}: DR ${rotuloDoDR(dr)} sem circuito — não protege nada`, ids: [q.id] });
        continue;
      }
      if (dr.inA == null) {
        naoAvaliado.push(`${q.nome}: DR ${rotuloDoDR(dr)} sem corrente nominal declarada`);
      } else {
        // O DR não protege contra sobrecorrente: a proteção a montante tem de ter In ≤ In do DR.
        // Geral: o disjuntor geral (sugerido); grupo/individual: a soma dos disjuntores que ele alimenta.
        const montante = dr.geral
          ? (predim?.disjuntorGeralA ?? null)
          : circuitos.reduce<number | null>((s, c) => {
              const inA = c.disjuntorA ?? predim?.circuitos.find((x) => x.circuitoId === c.id)?.disjuntorSugeridoA ?? null;
              return inA == null || s == null ? null : s + inA;
            }, 0);
        if (montante == null) naoAvaliado.push(`${q.nome}: DR ${rotuloDoDR(dr)} — disjuntor a montante não declarado nem sugerido`);
        else if (dr.inA < montante) {
          achados.push({
            nivel: 'FALTA',
            mensagem: `${q.nome}: DR ${rotuloDoDR(dr)} com In abaixo da proteção a montante (${dr.geral ? `geral ${montante} A` : `soma dos disjuntores ${montante} A`}) — o DR precisa de disjuntor de In ≤ ${dr.inA} A à frente (IEC 61008-1; 5.1.3.2.2)`,
            ids: [q.id, ...circuitos.map((c) => c.id)],
          });
        }
      }
      if (!dr.geral && circuitos.length > hip.maxCircuitosPorDR) {
        achados.push({ nivel: 'AVISO', mensagem: `${q.nome}: DR ${rotuloDoDR(dr)} agrupa ${circuitos.length} circuitos (hipótese: até ${hip.maxCircuitosPorDR} — um desarme apaga todos)`, ids: [q.id, ...circuitos.map((c) => c.id)] });
      }
    }
  }
  if (ambientes.some((a) => !a.tipo)) naoAvaliado.push('tomadas em ambientes sem tipo não entram');
  return {
    codigo: '5.1.3.2.2',
    titulo: 'Proteção DR (30 mA) em banheiro, cozinha/serviço, área externa e chuveiro',
    achados,
    naoAvaliado,
    avaliados,
  };
}

/** Um DR que falta, com o In que o catálogo sugere. */
export interface SugestaoDeDR {
  quadroId: ObjectId;
  circuitoId: ObjectId;
  nome: string;
  inA: number | null;
  idnMa: 30;
  motivo: string;
}

/**
 * E3.1 — os DRs que a 5.1.3.2.2 exige e o quadro ainda não tem: um individual
 * de 30 mA por circuito exigido, In do catálogo ≥ disjuntor do circuito
 * (declarado ou sugerido). Sugestão, não decisão: quem adiciona é o projetista.
 */
export function sugerirDRs(model: BlueprintModel, quadroId: ObjectId, hip: HipotesesEletricas = HIPOTESES_PADRAO): SugestaoDeDR[] {
  const ambientes = ambientesDo(model, null);
  const predim = preDimensionarQuadroCompleto(model, quadroId, hip);
  const saida: SugestaoDeDR[] = [];
  for (const c of (model.circuitos ?? []).filter((x) => x.quadroId === quadroId)) {
    const exigem = pontosQueExigemDR(model, c.id, ambientes);
    if (exigem.length === 0 || circuitoComDR30(model, c)) continue;
    const inDisj = c.disjuntorA ?? predim?.circuitos.find((x) => x.circuitoId === c.id)?.disjuntorSugeridoA ?? null;
    saida.push({
      quadroId,
      circuitoId: c.id,
      nome: c.nome,
      inA: inDisj != null ? sugerirInDoDR(inDisj, hip.catalogoDeDrA) : null,
      idnMa: 30,
      motivo: [...new Set(exigem.map((x) => x.motivo))].slice(0, 2).join(', '),
    });
  }
  return saida;
}

/** Os comandos que criam os DRs sugeridos — um lote, um passo de undo. */
export function comandosDasSugestoesDeDR(sugestoes: readonly SugestaoDeDR[]): Command[] {
  return sugestoes.map((s) => ({ type: 'AddDR', quadroId: s.quadroId, inA: s.inA, idnMa: 30, circuitoIds: [s.circuitoId] }));
}

// ─── Pré-dimensionamento — seção, disjuntor e queda de tensão ──────────────
//
// O que `blueprintEletricaDimensionamento` calcula a partir do declarado,
// confrontado com o declarado. Cada achado leva o item da norma.

function regraPreDim(model: BlueprintModel, levelId: ObjectId | null, hip: HipotesesEletricas): RegraConferida {
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];
  let avaliados = 0;
  for (const c of model.circuitos ?? []) {
    // O circuito não tem pavimento; ele é "do pavimento" quando tem ponto nele.
    // Até 29/09/2026 esta regra era a única da conferência que ignorava o
    // `levelId` — a aba do Térreo listava faltas de circuitos do andar de cima.
    const pontosDoCircuito = (model.terminais ?? []).filter((t) => t.circuitoId === c.id);
    if (levelId && !pontosDoCircuito.some((t) => t.levelId === levelId)) continue;
    const r = preDimensionarCircuito(model, c, hip);
    if (r.ibA == null) {
      if (r.pontos > 0) naoAvaliado.push(`${c.nome}: ${r.naoAvaliado.join('; ')}`);
      continue;
    }
    avaliados++;
    const pontos = pontosDoCircuito.map((t) => t.id);
    for (const a of r.achados) {
      achados.push({ nivel: a.nivel, mensagem: `${c.nome} (${a.referencia}): ${a.mensagem}`, ids: [c.quadroId, ...pontos] });
    }
    for (const x of r.naoAvaliado) naoAvaliado.push(`${c.nome}: ${x}`);
  }
  return {
    codigo: 'PRE-DIM',
    titulo: 'Pré-dimensionamento: seção (Tab. 36/47), disjuntor (5.3.4.1) e queda de tensão (6.2.7)',
    achados,
    naoAvaliado,
    avaliados,
  };
}

// ─── 6.2.7.1 — alimentador do quadro: queda da origem e equilíbrio de fases ──
//
// Até 29/09/2026 a queda da ORIGEM ao pior ponto (alimentador + pior terminal)
// só aparecia no painel do quadro; a aba Conferência não a listava, e um
// projeto podia estar "sem falta" na aba com 6 % de queda total. Aqui entra o
// que `preDimensionarQuadroCompleto` acha do QUADRO: a FALTA 6.2.7.1 e o AVISO
// de desequilíbrio de fases. O quadro é do pavimento pelo `levelId` dele.

// ─── 6.3.5.2 — DPS no quadro de entrada ─────────────────────────────────────
//
// A norma manda DPS quando a instalação é alimentada por linha aérea ou fica
// em região de trovoadas (6.3.5.2.1) — dado do LUGAR, que aqui é hipótese
// declarada (`exposicaoARaios`). Sem hierarquia de quadros (E4), TODO quadro
// é tratado como de entrada — dito no título. A peça declarada também é
// conferida: sem disjuntor de desconexão é aviso (o DPS em falha vira curto).
function regraDps(model: BlueprintModel, levelId: ObjectId | null, hip: HipotesesEletricas): RegraConferida {
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];
  let avaliados = 0;
  // E4.1: "de entrada" = sem quadro-pai; um QD alimentado por QGBT não precisa do seu DPS (6.3.5.2.2 coordena na entrada).
  const quadros = (model.quadros ?? []).filter((x) => (!levelId || x.levelId === levelId) && !x.quadroPaiId);
  for (const q of quadros) {
    avaliados++;
    if (!q.dps) {
      if (hip.exposicaoARaios === 'NAO_EXPOSTA') naoAvaliado.push(`${q.nome}: sem DPS — dispensado pela hipótese "não exposta"`);
      else if (hip.exposicaoARaios === 'EXPOSTA') achados.push({ nivel: 'FALTA', mensagem: `${q.nome}: quadro de entrada sem DPS — instalação declarada EXPOSTA a descargas (6.3.5.2.1 exige)`, ids: [q.id] });
      else achados.push({ nivel: 'AVISO', mensagem: `${q.nome}: quadro de entrada sem DPS — exposição a descargas não avaliada; declare a exposição nas hipóteses ou adicione o DPS (6.3.5.2)`, ids: [q.id] });
      continue;
    }
    if (q.dps.disjuntorDesconexaoA == null) achados.push({ nivel: 'AVISO', mensagem: `${q.nome}: ${rotuloDoDPS(q.dps)} sem disjuntor de desconexão declarado — o fabricante exige proteção à frente do DPS`, ids: [q.id] });
    if (q.dps.inKa == null || q.dps.upKv == null) naoAvaliado.push(`${q.nome}: ${rotuloDoDPS(q.dps)} sem In ou Up declarados — a coordenação com a suportabilidade (Tab. 31) não se avalia`);
  }
  return {
    codigo: '6.3.5.2',
    titulo: `DPS no quadro de entrada (exposição a descargas: ${hip.exposicaoARaios === 'EXPOSTA' ? 'exposta' : hip.exposicaoARaios === 'NAO_EXPOSTA' ? 'não exposta' : 'não avaliada'}; só os quadros sem quadro-pai)`,
    achados,
    naoAvaliado,
    avaliados,
  };
}

// ─── 5.3.5.5 — capacidade de interrupção ────────────────────────────────────
//
// O disjuntor tem de interromper a corrente de curto presumida no ponto onde
// está (Icn ≥ Ik). A Ik é HIPÓTESE (`ikEntradaKa`, a confirmar com a
// concessionária) e a Icn é declarada por quadro. Sem Icn declarada, aviso —
// é dado de compra que a prancha precisa.
function regraIcn(model: BlueprintModel, levelId: ObjectId | null, hip: HipotesesEletricas): RegraConferida {
  const achados: Achado[] = [];
  let avaliados = 0;
  for (const q of (model.quadros ?? []).filter((x) => !levelId || x.levelId === levelId)) {
    avaliados++;
    if (q.icnKa == null) {
      achados.push({ nivel: 'AVISO', mensagem: `${q.nome}: capacidade de interrupção (Icn) dos disjuntores não declarada — Ik presumida ${String(hip.ikEntradaKa).replace('.', ',')} kA (hipótese)`, ids: [q.id] });
      continue;
    }
    if (q.icnKa < hip.ikEntradaKa) {
      achados.push({ nivel: 'FALTA', mensagem: `${q.nome}: Icn ${String(q.icnKa).replace('.', ',')} kA abaixo da corrente de curto presumida ${String(hip.ikEntradaKa).replace('.', ',')} kA — o disjuntor não interrompe o curto (5.3.5.5)`, ids: [q.id] });
    }
  }
  return {
    codigo: '5.3.5.5',
    titulo: `Capacidade de interrupção dos disjuntores ≥ Ik presumida (${String(hip.ikEntradaKa).replace('.', ',')} kA — hipótese, a confirmar com a concessionária)`,
    achados,
    naoAvaliado: [],
    avaliados,
  };
}

// ─── ENTRADA — o padrão da concessionária (hipótese) ────────────────────────
function regraEntrada(model: BlueprintModel, levelId: ObjectId | null, hip: HipotesesEletricas): RegraConferida {
  const achados: Achado[] = [];
  let avaliados = 0;
  for (const q of (model.quadros ?? []).filter((x) => (!levelId || x.levelId === levelId) && !x.quadroPaiId)) {
    const e = entradaDoQuadro(model, q.id, hip);
    if (!e) continue;
    avaliados++;
    for (const a of e.achados) achados.push({ nivel: a.nivel, mensagem: `${q.nome}: ${a.mensagem}`, ids: [q.id] });
  }
  const padrao = padraoDeEntrada(hip.padraoDeEntrada);
  return {
    codigo: 'ENTRADA',
    titulo: `Entrada de energia — padrão ${padrao.nome}: categoria por demanda, ramal, geral, eletroduto (${padrao.conferir})`,
    achados,
    naoAvaliado: [],
    avaliados,
  };
}

function regraQuadro(model: BlueprintModel, levelId: ObjectId | null, hip: HipotesesEletricas): RegraConferida {
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];
  let avaliados = 0;
  for (const q of (model.quadros ?? []).filter((x) => !levelId || x.levelId === levelId)) {
    const r = preDimensionarQuadroCompleto(model, q.id, hip);
    if (!r) continue;
    if (r.ibA == null) {
      if (r.circuitos.length > 0) naoAvaliado.push(`${q.nome}: ${r.naoAvaliado.join('; ')}`);
      continue;
    }
    avaliados++;
    for (const a of r.achados) {
      achados.push({ nivel: a.nivel, mensagem: `${q.nome} (${a.referencia}): ${a.mensagem}`, ids: [q.id] });
    }
    for (const x of r.naoAvaliado) naoAvaliado.push(`${q.nome}: ${x}`);
  }
  return {
    codigo: '6.2.7.1',
    titulo: 'Alimentador do quadro: queda da origem ao pior ponto (6.2.7.1) e equilíbrio de fases',
    achados,
    naoAvaliado,
    avaliados,
  };
}

// ─── 6.2.11.1.6 — taxa de ocupação do eletroduto ───────────────────────────

function regraEletroduto(model: BlueprintModel, levelId: ObjectId | null, hip: HipotesesEletricas): RegraConferida {
  const achados: Achado[] = [];
  const naoAvaliado: string[] = [];
  let avaliados = 0;
  const trechos = (model.trechos ?? []).filter((t) => t.disciplina === 'ELETRICA' && (!levelId || t.levelId === levelId));
  const motivos = new Map<string, number>();
  // E2.2: a fiação derivada, uma vez para a rede inteira.
  const fiacao = composicaoDaRede(model);
  for (const t of trechos) {
    const { ocupacao, motivo } = ocupacaoDoTrecho(model, t, hip, fiacao.get(t.id)?.lista ?? null);
    if (!ocupacao) {
      if (motivo) motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
      continue;
    }
    avaliados++;
    if (!ocupacao.atende) {
      achados.push({
        nivel: 'FALTA',
        mensagem: `eletroduto Ø${t.bitolaMm} com ${ocupacao.condutores} × ${String(ocupacao.secaoMm2).replace('.', ',')} mm²: ocupação ${ocupacao.ocupacaoPct.toFixed(0)} %, limite ${ocupacao.limitePct} %${ocupacao.bitolaQueAtendeMm ? ` — Ø${ocupacao.bitolaQueAtendeMm} atenderia` : ''}`,
        ids: [t.id],
      });
    }
  }
  for (const [motivo, n] of motivos) naoAvaliado.push(`${n} eletroduto(s): ${motivo}`);
  return {
    codigo: '6.2.11.1.6',
    titulo: 'Taxa de ocupação do eletroduto (53 % / 31 % / 40 %)',
    achados,
    naoAvaliado: [...naoAvaliado, 'diâmetros de condutor e de eletroduto são tabelas típicas de catálogo (hipótese)'],
    avaliados,
  };
}

// ─── Tudo junto ────────────────────────────────────────────────────────────

/**
 * Confere o nível (ou o modelo inteiro, com `levelId` nulo). As hipóteses do
 * pré-dimensionamento entram aqui porque a regra `PRE-DIM` depende delas.
 */
export function conferirNbr5410(
  model: BlueprintModel,
  levelId: ObjectId | null = null,
  hipoteses: HipotesesEletricas = HIPOTESES_PADRAO,
): ConferenciaNbr5410 {
  const regras = [
    regra9521(model, levelId),
    regra95221(model, levelId),
    regra95222(model, levelId),
    regra9523(model, levelId),
    regra9531(model, levelId),
    regra9532(model, levelId),
    regra9533(model, levelId),
    regra51322(model, levelId, hipoteses),
    regraPreDim(model, levelId, hipoteses),
    regraQuadro(model, levelId, hipoteses),
    regraDps(model, levelId, hipoteses),
    regraIcn(model, levelId, hipoteses),
    regraEntrada(model, levelId, hipoteses),
    regraEletroduto(model, levelId, hipoteses),
    regraSugeridas(model, levelId),
  ];
  const todos = regras.flatMap((r) => r.achados);
  return {
    regras,
    faltas: todos.filter((a) => a.nivel === 'FALTA').length,
    avisos: todos.filter((a) => a.nivel === 'AVISO').length,
  };
}

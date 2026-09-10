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
import { conferirIluminacao, conferirTomadas, etiquetaDoAmbiente } from './blueprintDistribuicao';

export type CodigoDaRegra =
  | '9.5.2.1'
  | '9.5.2.2.1'
  | '9.5.2.2.2'
  | '9.5.2.3'
  | '9.5.3.1'
  | '9.5.3.2'
  | '9.5.3.3'
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
const ehForca = (t: Terminal) => t.tipoEletrico === 'TUE' || t.tipoEletrico === 'LIGACAO_DIRETA';

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
    const c = conferirIluminacao(a.space, model.terminais ?? [], areaM2);
    const faltas: string[] = [];
    if (c.faltaLuzDeTeto) faltas.push('sem ponto de luz no teto');
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

// ─── Tudo junto ────────────────────────────────────────────────────────────

/** Confere o nível (ou o modelo inteiro, com `levelId` nulo). */
export function conferirNbr5410(model: BlueprintModel, levelId: ObjectId | null = null): ConferenciaNbr5410 {
  const regras = [
    regra9521(model, levelId),
    regra95221(model, levelId),
    regra95222(model, levelId),
    regra9523(model, levelId),
    regra9531(model, levelId),
    regra9532(model, levelId),
    regra9533(model, levelId),
    regraSugeridas(model, levelId),
  ];
  const todos = regras.flatMap((r) => r.achados);
  return {
    regras,
    faltas: todos.filter((a) => a.nivel === 'FALTA').length,
    avisos: todos.filter((a) => a.nivel === 'AVISO').length,
  };
}

/**
 * D1 (plano `2026-10-01-incendio-backlog-pos-roadmap.md`) — AS EXIGÊNCIAS DE MG PELA IT 01.
 *
 * A.1.2 da IT 01: "Consideram-se obrigatórias as medidas de segurança assinaladas com 'X'",
 * observadas as NOTAS de cada tabela. Daí:
 *  - célula `-`, ou medida que nem consta na tabela → DISPENSADA;
 *  - `X` sem nota que condicione → EXIGIDA;
 *  - `X` com nota que o desenho AVALIA (área total, divisão, edificação térrea) → EXIGIDA ou
 *    DISPENSADA, dizendo a nota;
 *  - `X` com nota que o desenho NÃO avalia (população, condomínio com arruamento interno, risco do
 *    evento) → CONDICIONAL, com a condição escrita — quem decide é o responsável técnico.
 * Notas de várias na mesma célula se leem juntas (A.1.2.1): basta uma dispensar para dispensar.
 *
 * Premissa: obra NOVA. A ressalva "construções concluídas até 01/07/2005 → 1.200 m²" das notas
 * de área não se aplica (o limite usado é o da obra nova, e o motivo cita a nota).
 */
import type { ClassificacaoDaEdificacao, EstadoDaExigencia, MedidaDeSeguranca } from './blueprintIncendioClassificacao';
import { FONTE_IT01_MG, TABELAS_IT01_MG, type TabelaDeExigenciasMG } from './blueprintIncendioTabelasMG';

/** Como cada nota age sobre a célula. */
export type RegraDaNota =
  | { tipo: 'AREA'; acimaDeM2: number; semLimiteNas?: readonly string[] }
  | { tipo: 'AREA_MINIMA'; aPartirDeM2: number }
  | { tipo: 'AREA_OU'; acimaDeM2: number; senao: string }
  | { tipo: 'DIVISAO'; divisoes: readonly string[]; condicao?: string }
  | { tipo: 'POPULACAO'; acimaDe: number; soNas?: readonly string[] }
  | { tipo: 'EXCETO_TERREA_OU_AREA_MENOR'; m2: number }
  | { tipo: 'CONDICAO'; texto: string }
  | { tipo: 'INFORMACAO' };

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

/** As notas que o texto sozinho não classifica (a regra da nota, tabela a tabela). */
const REGRAS_ESPECIAIS: Record<string, RegraDaNota> = {
  '2.5': { tipo: 'INFORMACAO' }, // isenção dos motéis sem corredores internos cobertos
  '3.4': { tipo: 'DIVISAO', divisoes: ['C-3'], condicao: 'a C-3 abriga divisão F-5, F-6 ou F-11 com população acima de 500 pessoas (pode ficar só na área do grupo F)' },
  '3.9': { tipo: 'DIVISAO', divisoes: ['C-3'], condicao: 'a C-3 abriga divisão F-5, F-6 ou F-11 (pode ficar só na área do grupo F)' },
  '5.4': { tipo: 'AREA', acimaDeM2: 930, semLimiteNas: ['E-5', 'E-6'] },
  '5.6': { tipo: 'INFORMACAO' }, // isenta no interior das salas de aula até 50 pessoas
  '7.6': { tipo: 'POPULACAO', acimaDe: 100, soNas: ['F-6'] },
  '8.1': { tipo: 'CONDICAO', texto: 'evento classificado a partir de risco médio (IT 33) — também no risco baixo com delimitação por barreiras, para a iluminação' },
  '8.2': { tipo: 'CONDICAO', texto: 'estrutura provisória destinada a receber público' },
  '8.5': { tipo: 'INFORMACAO' },
  '12.5': { tipo: 'INFORMACAO' }, // exceto prisões em geral
  '13.6': { tipo: 'INFORMACAO' }, // isenção dos quartéis do CBMMG
  '14.6': { tipo: 'EXCETO_TERREA_OU_AREA_MENOR', m2: 930 },
  '15.6': { tipo: 'DIVISAO', divisoes: ['J-4'], condicao: 'a área usada como depósito passa de 3.000 m² (pode ficar só nessa área)' },
  '15.8': { tipo: 'INFORMACAO' }, // J-1: sem extintor em depósito exclusivo de incombustível não embalado
};

/** A regra da nota `n` da tabela `t`: as especiais acima; senão, pelo texto. `null` = não reconhecida. */
export function regraDaNota(t: Pick<TabelaDeExigenciasMG, 'tabela' | 'notas'>, n: number): RegraDaNota | null {
  const especial = REGRAS_ESPECIAIS[`${t.tabela}.${n}`];
  if (especial) return especial;
  const texto = t.notas[n] ?? '';
  let m = /área total for superior a ([\d.]+) ?m².*condomínios/i.exec(texto);
  if (m) return { tipo: 'AREA_OU', acimaDeM2: num(m[1]), senao: 'condomínio (ou campus) com arruamento interno' };
  m = /^(?:Exigid[oa] quando|Quando|Somente quando) (?:a )?área total(?: do Grupo C)? for superior a ([\d.]+) ?m²/i.exec(texto);
  if (m) return { tipo: 'AREA', acimaDeM2: num(m[1]) };
  m = /área total for igual ou maior que ([\d.]+) ?m²/i.exec(texto);
  if (m) return { tipo: 'AREA_MINIMA', aPartirDeM2: num(m[1]) };
  m = /^Somente para (?:a )?divisão ([A-M]-\d+)\.?$/i.exec(texto);
  if (m) return { tipo: 'DIVISAO', divisoes: [m[1]] };
  m = /^Somente quando (?:o local comportar população|houver lotação) superior a ([\d.]+) pessoas/i.exec(texto);
  if (m) return { tipo: 'POPULACAO', acimaDe: num(m[1]) };
  if (/^Exigid[oa] nos (?:salões de festas e )?auditórios/i.test(texto)) return { tipo: 'CONDICAO', texto: texto.replace(/\.$/, '').replace(/^Exigid[oa] nos /i, 'houver ') };
  if (/^(Pode ser substituíd|Os detectores|Os acionadores|Para a divisão|Para os estádios|Para todas as edificações|Para as subestações|Dispensada em centrais|Luminárias|Devem ficar|As edificações do grupo|A área de armazenamento|Pátios de apreensão|Para eventos temporários|A altura máxima|Exigida também)/i.test(texto)) return { tipo: 'INFORMACAO' };
  return null;
}

export interface ExigenciaMG {
  estado: EstadoDaExigencia;
  motivo: string;
  fonte: string;
}

/** A tabela do Anexo A que tem a divisão. */
export function tabelaDaDivisao(divisao: string): TabelaDeExigenciasMG | null {
  return TABELAS_IT01_MG.find((t) => t.divisoes.includes(divisao)) ?? null;
}

/** A coluna de altura da IT 01 (H em metros). */
export function colunaDeAltura(alturaM: number): { indice: number; rotulo: string } {
  if (alturaM <= 12 + 1e-9) return { indice: 0, rotulo: 'H ≤ 12 m' };
  if (alturaM <= 30 + 1e-9) return { indice: 1, rotulo: '12 < H ≤ 30 m' };
  if (alturaM <= 54 + 1e-9) return { indice: 2, rotulo: '30 < H ≤ 54 m' };
  return { indice: 3, rotulo: 'H > 54 m' };
}

const m2 = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} m²`;
const SEM_GRADE =
  'a Tabela 17 não traz grade: M-1 (túneis) segue a NBR 15661 e a NBR 15981; M-2 (tanques, cilindros, GLP/GN) segue a IT 23, a IT 24 e a NBR 17505; M-4 a M-8 seguem as medidas do uso específico (silos: IT 43; agronegócio: IT 44)';

type Resultado = { r: 'SIM'; porque?: string } | { r: 'NAO'; porque: string } | { r: 'COND'; condicao: string };

function avaliarNota(regra: RegraDaNota, n: number, divisao: string, c: ClassificacaoDaEdificacao): Resultado {
  const area = c.areaTotalM2;
  switch (regra.tipo) {
    case 'AREA':
      if (regra.semLimiteNas?.includes(divisao)) return { r: 'SIM', porque: `${divisao}: independe da área (nota ${n})` };
      return area > regra.acimaDeM2 ? { r: 'SIM', porque: `área total ${m2(area)} > ${m2(regra.acimaDeM2)} (nota ${n})` } : { r: 'NAO', porque: `área total ${m2(area)} ≤ ${m2(regra.acimaDeM2)} (nota ${n})` };
    case 'AREA_MINIMA':
      return area >= regra.aPartirDeM2 ? { r: 'SIM', porque: `área total ${m2(area)} ≥ ${m2(regra.aPartirDeM2)} (nota ${n})` } : { r: 'NAO', porque: `área total ${m2(area)} < ${m2(regra.aPartirDeM2)} (nota ${n})` };
    case 'AREA_OU':
      return area > regra.acimaDeM2 ? { r: 'SIM', porque: `área total ${m2(area)} > ${m2(regra.acimaDeM2)} (nota ${n})` } : { r: 'COND', condicao: `${regra.senao} — a área total ${m2(area)} não passa de ${m2(regra.acimaDeM2)} (nota ${n})` };
    case 'DIVISAO':
      if (!regra.divisoes.includes(divisao)) return { r: 'NAO', porque: `só para ${regra.divisoes.join(', ')} (nota ${n})` };
      return regra.condicao ? { r: 'COND', condicao: `${regra.condicao} (nota ${n})` } : { r: 'SIM', porque: `${divisao} (nota ${n})` };
    case 'POPULACAO':
      return { r: 'COND', condicao: `população acima de ${regra.acimaDe} pessoas (nota ${n})` };
    case 'EXCETO_TERREA_OU_AREA_MENOR': {
      const terrea = c.altura.valorM <= 1e-9;
      if (terrea) return { r: 'NAO', porque: `edificação térrea (nota ${n})` };
      return area < regra.m2 ? { r: 'NAO', porque: `área total ${m2(area)} < ${m2(regra.m2)} (nota ${n})` } : { r: 'SIM' };
    }
    case 'CONDICAO':
      return { r: 'COND', condicao: `${regra.texto} (nota ${n})` };
    case 'INFORMACAO':
      return { r: 'SIM' };
  }
}

/** A exigência da medida para a divisão, pela IT 01. */
export function exigenciaMG(medida: MedidaDeSeguranca, divisao: string, c: ClassificacaoDaEdificacao): ExigenciaMG {
  if (divisao === 'A-1') return { estado: 'DISPENSADA', motivo: 'residência exclusivamente unifamiliar é isenta de medidas de segurança', fonte: 'IT 01 do CBMMG, A.4.1 a' };
  const t = tabelaDaDivisao(divisao);
  if (!t) return { estado: 'SEM_TABELA', motivo: `a divisão ${divisao} não consta nas Tabelas 1 a 18 do Anexo A da IT 01 — avaliação do Corpo Técnico (E.2.2)`, fonte: FONTE_IT01_MG };
  const fonte = `${FONTE_IT01_MG}, Tabela ${t.tabela}`;
  if (t.colunas === 'SEM_GRADE') return { estado: 'SEM_TABELA', motivo: SEM_GRADE, fonte };
  let indice = 0;
  let faixa = 'coluna única';
  if (t.colunas === 'ALTURA') ({ indice, rotulo: faixa } = colunaDeAltura(c.altura.valorM));
  else if (t.colunas === 'ATE_12') {
    if (c.altura.valorM > 12 + 1e-9) return { estado: 'SEM_TABELA', motivo: `a Tabela ${t.tabela} só traz a ${divisao} com H ≤ 12 m — acima, avaliação do Corpo Técnico`, fonte };
    faixa = 'H ≤ 12 m';
  }
  const linha = t.linhas[medida];
  if (!linha) return { estado: 'DISPENSADA', motivo: `${divisao}: a medida não consta na Tabela ${t.tabela}`, fonte };
  const celula = linha[indice];
  if (!celula.startsWith('X')) return { estado: 'DISPENSADA', motivo: `${divisao}, ${faixa}: não assinalada`, fonte };
  const notas = [...(celula.length > 1 ? celula.slice(1).split(',').map(Number) : []), ...(t.notasDaMedida[medida] ?? [])];
  const resultados = notas.map((n) => {
    const regra = regraDaNota(t, n);
    if (!regra) throw new Error(`IT 01 Tabela ${t.tabela}, nota ${n}: regra não reconhecida`);
    return { n, regra, res: avaliarNota(regra, n, divisao, c) };
  });
  // F-6: a nota de população própria da divisão vence a geral (Tabela 7: notas 2 e 6 lidas juntas).
  const daDivisao = resultados.some((x) => x.regra.tipo === 'POPULACAO' && x.regra.soNas?.includes(divisao));
  const valem = resultados.filter((x) => x.regra.tipo !== 'POPULACAO' || (daDivisao ? !!x.regra.soNas?.includes(divisao) : !x.regra.soNas));
  const fonteComNotas = notas.length ? `${fonte}, nota${notas.length > 1 ? 's' : ''} ${notas.join(', ')}` : fonte;
  const nao = valem.find((x) => x.res.r === 'NAO');
  if (nao && nao.res.r === 'NAO') return { estado: 'DISPENSADA', motivo: `${divisao}, ${faixa}: assinalada, mas ${nao.res.porque}`, fonte: fonteComNotas };
  const conds = valem.flatMap((x) => (x.res.r === 'COND' ? [x.res.condicao] : []));
  if (conds.length) return { estado: 'CONDICIONAL', motivo: `${divisao}, ${faixa}: exigida se ${conds.join('; e se ')}`, fonte: fonteComNotas };
  const porques = valem.flatMap((x) => (x.res.r === 'SIM' && x.res.porque ? [x.res.porque] : []));
  // A.4.5: iluminação dispensada na térrea de até 200 m² com menos de 50 pessoas.
  if (medida === 'ILUMINACAO_EMERGENCIA' && c.altura.valorM <= 1e-9 && c.areaTotalM2 <= 200) {
    return { estado: 'CONDICIONAL', motivo: `${divisao}, térrea com ${m2(c.areaTotalM2)}: exigida se a população for de 50 pessoas ou mais (A.4.5)`, fonte: `${fonteComNotas}; A.4.5` };
  }
  return { estado: 'EXIGIDA', motivo: `${divisao}, ${faixa}${porques.length ? `: ${porques.join('; ')}` : ''}`, fonte: fonteComNotas };
}

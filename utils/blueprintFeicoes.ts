/**
 * FEIÇÕES DE LEVANTAMENTO (A2, 26/09/2026) — o planialtimétrico CADASTRAL.
 *
 * O topógrafo não entrega só cotas: cada ponto de campo leva um nome (P1, 102…)
 * e um CÓDIGO que diz o que ele é — um vértice de cerca, um poste, o pé de um
 * muro. Até aqui a importação jogava fora o nome e o código e deixava só
 * {x, y, cota}; a cerca virava ponto solto (ou, pior, linha de quebra se o
 * código parecesse LQ).
 *
 * Este módulo é o catálogo desses códigos e o que se deriva deles:
 *  - `lerCodigo`: "CE1", "CERCA 2", "MU", "POSTE" → feição + sequência;
 *  - `linhasDasFeicoes`: pontos de feição LINEAR com o mesmo código+sequência,
 *    na ordem do arquivo, formam a linha (sem sequência: corridas consecutivas);
 *  - duplicados por posição e por nome, pontuar polilinha, interpolar sobre linha;
 *  - CSV (`ponto;norte;este;cota;codigo;descricao` — o importador lê de volta
 *    com os mesmos nomes), KML de pontos.
 *
 * ⚠️ A LINHA DE QUEBRA continua sendo SÓ o código LQ/BL/BRK (fase 15). Uma cerca
 * não é descontinuidade do terreno: entra como feição, nunca como breakline.
 *
 * ⚠️ Não há norma de códigos: cada escritório tem o seu caderno. Os aliases
 * abaixo são os usuais no Brasil; código que não casa fica como está, contado
 * como "sem feição" — a tela mostra, ninguém adivinha.
 *
 * Puro: pontos entram, pontos e linhas saem.
 */
import type { Georreferencia, Point } from './blueprintKernel';
import { localParaGeo, type PontoCotado } from './blueprintTopografia';

/** Ponto de levantamento: o ponto cotado com o que o topógrafo escreveu nele. */
export interface PontoDeLevantamento extends PontoCotado {
  nome?: string;
  codigo?: string;
  descricao?: string;
}

export type IdDaFeicao =
  | 'CERCA'
  | 'MURO'
  | 'MEIO_FIO'
  | 'EDIFICACAO'
  | 'ESTRADA'
  | 'CURSO_DAGUA'
  | 'TALUDE'
  | 'DIVISA'
  | 'POSTE'
  | 'ARVORE'
  | 'BOCA_DE_LOBO'
  | 'MARCO';

export type SimboloDaFeicao = 'CIRCULO' | 'QUADRADO' | 'TRIANGULO' | 'ARVORE' | 'CRUZ';

export interface FichaDaFeicao {
  id: IdDaFeicao;
  rotulo: string;
  tipo: 'LINHA' | 'PONTO';
  /** Prefixos aceitos, já sem acento e em caixa alta. */
  aliases: readonly string[];
  cor: string;
  /** Traço no canvas/DXF (px de tela); vazio = contínuo. */
  traco: readonly number[];
  simbolo: SimboloDaFeicao;
  /** Camada do DXF de saída. */
  camadaDxf: string;
}

export const FEICOES: readonly FichaDaFeicao[] = [
  { id: 'CERCA', rotulo: 'Cerca', tipo: 'LINHA', aliases: ['CE', 'CER', 'CERCA', 'ARAME'], cor: '#65a30d', traco: [6, 3], simbolo: 'CRUZ', camadaDxf: 'LEV-CERCA' },
  { id: 'MURO', rotulo: 'Muro', tipo: 'LINHA', aliases: ['MU', 'MUR', 'MURO', 'MUROS'], cor: '#374151', traco: [], simbolo: 'CRUZ', camadaDxf: 'LEV-MURO' },
  { id: 'MEIO_FIO', rotulo: 'Meio-fio', tipo: 'LINHA', aliases: ['MF', 'MFIO', 'MEIOFIO', 'GUIA', 'SARJETA', 'SJ'], cor: '#6b7280', traco: [], simbolo: 'CRUZ', camadaDxf: 'LEV-MEIO-FIO' },
  { id: 'EDIFICACAO', rotulo: 'Edificação', tipo: 'LINHA', aliases: ['ED', 'EDI', 'EDIF', 'EDIFICACAO', 'CASA', 'CONST', 'CONSTRUCAO', 'GALPAO'], cor: '#b91c1c', traco: [], simbolo: 'CRUZ', camadaDxf: 'LEV-EDIFICACAO' },
  { id: 'ESTRADA', rotulo: 'Estrada / via', tipo: 'LINHA', aliases: ['ES', 'ESTR', 'ESTRADA', 'RUA', 'BORDO', 'BD', 'ASF', 'ASFALTO', 'PAV'], cor: '#78350f', traco: [], simbolo: 'CRUZ', camadaDxf: 'LEV-ESTRADA' },
  { id: 'CURSO_DAGUA', rotulo: "Curso d'água", tipo: 'LINHA', aliases: ['RIO', 'COR', 'CORREGO', 'CA', 'AGUA', 'RIBEIRAO', 'VALA'], cor: '#0369a1', traco: [], simbolo: 'CRUZ', camadaDxf: 'LEV-HIDROGRAFIA' },
  { id: 'TALUDE', rotulo: 'Talude (crista/pé)', tipo: 'LINHA', aliases: ['TA', 'TAL', 'TALUDE', 'CRISTA', 'CR', 'PETAL'], cor: '#a16207', traco: [2, 2], simbolo: 'CRUZ', camadaDxf: 'LEV-TALUDE' },
  { id: 'DIVISA', rotulo: 'Divisa', tipo: 'LINHA', aliases: ['DIV', 'DIVISA', 'LIM', 'LIMITE', 'PERIM'], cor: '#15803d', traco: [10, 3, 2, 3], simbolo: 'CRUZ', camadaDxf: 'LEV-DIVISA' },
  { id: 'POSTE', rotulo: 'Poste', tipo: 'PONTO', aliases: ['PO', 'POS', 'POSTE'], cor: '#1d4ed8', traco: [], simbolo: 'CIRCULO', camadaDxf: 'LEV-POSTE' },
  { id: 'ARVORE', rotulo: 'Árvore', tipo: 'PONTO', aliases: ['AR', 'ARV', 'ARVORE', 'ARB'], cor: '#166534', traco: [], simbolo: 'ARVORE', camadaDxf: 'LEV-ARVORE' },
  { id: 'BOCA_DE_LOBO', rotulo: 'Boca de lobo / PV', tipo: 'PONTO', aliases: ['BLO', 'BOCA', 'BOCADELOBO', 'PV', 'CX', 'CAIXA'], cor: '#0e7490', traco: [], simbolo: 'QUADRADO', camadaDxf: 'LEV-DRENAGEM' },
  { id: 'MARCO', rotulo: 'Marco / RN', tipo: 'PONTO', aliases: ['MC', 'MARCO', 'RN', 'REF'], cor: '#7c2d12', traco: [], simbolo: 'TRIANGULO', camadaDxf: 'LEV-MARCO' },
];

export function fichaDaFeicao(id: IdDaFeicao): FichaDaFeicao {
  return FEICOES.find((f) => f.id === id)!;
}

/** O código da LINHA DE QUEBRA (fase 15) — mesmo padrão da importação; aqui só para NÃO virar feição. */
const CODIGO_DE_QUEBRA = /^(?:LQ|BL|BRK)\s*[-_]?\s*\d+$/i;

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export interface CodigoLido {
  feicao: IdDaFeicao | null;
  /** O número depois do prefixo ("CE2" → "2"), que separa duas cercas. */
  sequencia: string | null;
}

/**
 * "CE1" → CERCA seq 1; "cerca 2" → CERCA seq 2; "MU" → MURO sem seq;
 * "LQ3" → nada (é linha de quebra); "XYZ" → nada.
 * Só o PRIMEIRO token conta: "PO luz" é poste com descrição.
 */
export function lerCodigo(codigo: string | null | undefined): CodigoLido {
  const nada: CodigoLido = { feicao: null, sequencia: null };
  if (!codigo) return nada;
  const limpo = semAcento(codigo.trim()).toUpperCase();
  if (!limpo || CODIGO_DE_QUEBRA.test(limpo)) return nada;
  const m = limpo.match(/^([A-Z']+)\s*[-_.]?\s*(\d+)?/);
  if (!m) return nada;
  const prefixo = m[1].replace(/'/g, '');
  const ficha = FEICOES.find((f) => f.aliases.includes(prefixo));
  return ficha ? { feicao: ficha.id, sequencia: m[2] ?? null } : nada;
}

export interface LinhaDeFeicao {
  /** "CERCA#2" ou "CERCA@17" (corrida sem número, pelo índice do 1º ponto). */
  chave: string;
  feicao: IdDaFeicao;
  /** Os índices dos pontos, na ordem do arquivo. */
  indices: number[];
  pontos: PontoCotado[];
}

/**
 * As linhas das feições LINEARES. Com sequência ("CE1", "CE2"), junta todos os
 * pontos daquela sequência na ordem em que aparecem — o topógrafo às vezes
 * intercala duas cercas no campo. Sem sequência ("CE"), cada CORRIDA
 * consecutiva é uma linha: um ponto de outro código no meio a interrompe.
 * Linha com menos de dois pontos não é linha.
 */
export function linhasDasFeicoes(pontos: readonly PontoDeLevantamento[]): LinhaDeFeicao[] {
  const grupos = new Map<string, LinhaDeFeicao>();
  let corrida: LinhaDeFeicao | null = null;
  pontos.forEach((p, i) => {
    const { feicao, sequencia } = lerCodigo(p.codigo);
    const ficha = feicao ? fichaDaFeicao(feicao) : null;
    if (!ficha || ficha.tipo !== 'LINHA') {
      corrida = null;
      return;
    }
    if (sequencia !== null) {
      corrida = null;
      const chave = `${feicao}#${sequencia}`;
      const g = grupos.get(chave) ?? { chave, feicao: feicao!, indices: [], pontos: [] };
      g.indices.push(i);
      g.pontos.push({ x: p.x, y: p.y, cotaM: p.cotaM });
      grupos.set(chave, g);
      return;
    }
    if (!corrida || corrida.feicao !== feicao) {
      corrida = { chave: `${feicao}@${i}`, feicao: feicao!, indices: [], pontos: [] };
      grupos.set(corrida.chave, corrida);
    }
    corrida.indices.push(i);
    corrida.pontos.push({ x: p.x, y: p.y, cotaM: p.cotaM });
  });
  return [...grupos.values()].filter((g) => g.pontos.length >= 2);
}

export interface ContagemDeFeicoes {
  porFeicao: Partial<Record<IdDaFeicao, number>>;
  /** Pontos com código que não casou com nenhuma feição (e que não é LQ). */
  semFeicao: number;
  /** Códigos distintos que não casaram — para a tela dizer quais. */
  codigosDesconhecidos: string[];
  semCodigo: number;
}

export function contarFeicoes(pontos: readonly PontoDeLevantamento[]): ContagemDeFeicoes {
  const porFeicao: Partial<Record<IdDaFeicao, number>> = {};
  const desconhecidos = new Set<string>();
  let semFeicao = 0;
  let semCodigo = 0;
  for (const p of pontos) {
    if (!p.codigo || !p.codigo.trim()) {
      semCodigo++;
      continue;
    }
    const { feicao } = lerCodigo(p.codigo);
    if (feicao) porFeicao[feicao] = (porFeicao[feicao] ?? 0) + 1;
    else if (!CODIGO_DE_QUEBRA.test(p.codigo.trim())) {
      semFeicao++;
      desconhecidos.add(p.codigo.trim().split(/\s+/)[0].toUpperCase());
    }
  }
  return { porFeicao, semFeicao, codigosDesconhecidos: [...desconhecidos].sort(), semCodigo };
}

// ─── Duplicados ──────────────────────────────────────────────────────────────

export interface Duplicado {
  /** O ponto que fica (o primeiro na lista). */
  primeiro: number;
  /** O repetido. */
  repetido: number;
  motivo: 'POSICAO' | 'NOME';
}

/** Tolerância padrão de posição: 1 cm. Dois pontos de campo a menos que isso são o mesmo. */
export const TOLERANCIA_DE_DUPLICADO_MM = 10;

/**
 * Duplicados por POSIÇÃO (a menos de `tolMm`) e por NOME repetido (mesmo nome,
 * posições diferentes — o caderno de campo reaproveitou um número). Grade de
 * espalhamento para não ser quadrático em levantamento grande.
 */
export function duplicados(pontos: readonly PontoDeLevantamento[], tolMm = TOLERANCIA_DE_DUPLICADO_MM): Duplicado[] {
  const saida: Duplicado[] = [];
  const tol = Math.max(0.001, tolMm);
  const celula = (v: number) => Math.floor(v / tol);
  const grade = new Map<string, number[]>();
  const jaRepetido = new Set<number>();
  pontos.forEach((p, i) => {
    const cx = celula(p.x);
    const cy = celula(p.y);
    let achou = -1;
    for (let dx = -1; dx <= 1 && achou < 0; dx++) {
      for (let dy = -1; dy <= 1 && achou < 0; dy++) {
        for (const j of grade.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (Math.hypot(pontos[j].x - p.x, pontos[j].y - p.y) <= tol) {
            achou = j;
            break;
          }
        }
      }
    }
    if (achou >= 0) {
      saida.push({ primeiro: achou, repetido: i, motivo: 'POSICAO' });
      jaRepetido.add(i);
      return;
    }
    const k = `${cx},${cy}`;
    grade.set(k, [...(grade.get(k) ?? []), i]);
  });
  const porNome = new Map<string, number>();
  pontos.forEach((p, i) => {
    const nome = p.nome?.trim();
    if (!nome || jaRepetido.has(i)) return;
    const j = porNome.get(nome);
    if (j !== undefined) saida.push({ primeiro: j, repetido: i, motivo: 'NOME' });
    else porNome.set(nome, i);
  });
  return saida.sort((a, b) => a.repetido - b.repetido);
}

/** Tira os repetidos POR POSIÇÃO (o nome repetido não se resolve apagando: é outro ponto). */
export function semDuplicadosDePosicao(pontos: readonly PontoDeLevantamento[], tolMm = TOLERANCIA_DE_DUPLICADO_MM): PontoDeLevantamento[] {
  const fora = new Set(duplicados(pontos, tolMm).filter((d) => d.motivo === 'POSICAO').map((d) => d.repetido));
  return pontos.filter((_, i) => !fora.has(i));
}

// ─── Pontuar e interpolar ────────────────────────────────────────────────────

/**
 * PONTUAR UMA POLILINHA sobre uma superfície: um ponto a cada `passoMm`, mais
 * os vértices, com a cota lida da superfície (a grade da versão). Onde a
 * superfície não tem cota, o ponto não nasce — nunca cota inventada.
 */
export function pontuarPolilinha(
  polilinha: readonly Point[],
  passoMm: number,
  cotaEm: (p: Point) => number | null,
  prefixo = 'PP',
): PontoDeLevantamento[] {
  const passo = Math.max(100, passoMm);
  const saida: PontoDeLevantamento[] = [];
  let k = 0;
  const empurrar = (p: Point) => {
    const c = cotaEm(p);
    if (c === null) return;
    k++;
    saida.push({ x: Math.round(p.x), y: Math.round(p.y), cotaM: Math.round(c * 1000) / 1000, nome: `${prefixo}${k}`, codigo: 'PONTUADO' });
  };
  if (polilinha.length === 0) return saida;
  empurrar(polilinha[0]);
  for (let i = 0; i + 1 < polilinha.length; i++) {
    const a = polilinha[i];
    const b = polilinha[i + 1];
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = passo; s < comp - 1e-6; s += passo) {
      const t = s / comp;
      empurrar({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    empurrar(b);
  }
  return saida;
}

/**
 * INTERPOLAR SOBRE UMA LINHA medida: entre dois vértices consecutivos (com
 * cota), pontos a cada `passoMm` com a cota em rampa linear. Devolve só os
 * NOVOS pontos — os vértices já existem. É o adensamento da crista de talude
 * ou do meio-fio que o topógrafo mediu esparso.
 */
export function interpolarSobreLinha(linha: readonly PontoCotado[], passoMm: number, prefixo = 'PI'): PontoDeLevantamento[] {
  const passo = Math.max(100, passoMm);
  const saida: PontoDeLevantamento[] = [];
  let k = 0;
  for (let i = 0; i + 1 < linha.length; i++) {
    const a = linha[i];
    const b = linha[i + 1];
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    for (let s = passo; s < comp - 1e-6; s += passo) {
      const t = s / comp;
      k++;
      saida.push({
        x: Math.round(a.x + (b.x - a.x) * t),
        y: Math.round(a.y + (b.y - a.y) * t),
        cotaM: Math.round((a.cotaM + (b.cotaM - a.cotaM) * t) * 1000) / 1000,
        nome: `${prefixo}${k}`,
        codigo: 'INTERPOLADO',
      });
    }
  }
  return saida;
}

// ─── Exportação ──────────────────────────────────────────────────────────────

const numero = (v: number, casas: number) => v.toFixed(casas).replace('.', ',');
const campo = (t: string | undefined) => (t ?? '').replace(/[;\r\n]+/g, ' ').trim();

/**
 * CSV dos pontos em METROS do desenho: `ponto;norte;este;cota;codigo;descricao`.
 * É o formato que `importarPontos` reconhece pelo cabeçalho — exportar e
 * reimportar devolve os mesmos nomes, códigos e descrições.
 * ⚠️ NORTE é o Y e ESTE é o X.
 */
export function csvDoLevantamento(pontos: readonly PontoDeLevantamento[]): string {
  const linhas = ['ponto;norte;este;cota;codigo;descricao'];
  pontos.forEach((p, i) => {
    linhas.push([campo(p.nome) || String(i + 1), numero(p.y / 1000, 3), numero(p.x / 1000, 3), numero(p.cotaM, 3), campo(p.codigo), campo(p.descricao)].join(';'));
  });
  return linhas.join('\n');
}

function xml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** KML dos pontos (exige georreferência), uma pasta por feição, e as linhas das feições. */
export function kmlDoLevantamento(pontos: readonly PontoDeLevantamento[], geo: Georreferencia, titulo: string): string {
  const coord = (p: PontoCotado) => {
    const { lat, lon } = localParaGeo(p, geo);
    return `${lon.toFixed(8)},${lat.toFixed(8)},${p.cotaM.toFixed(3)}`;
  };
  const pastas = new Map<string, string[]>();
  pontos.forEach((p, i) => {
    const { feicao } = lerCodigo(p.codigo);
    const pasta = feicao ? fichaDaFeicao(feicao).rotulo : 'Pontos';
    const nome = xml(p.nome?.trim() || String(i + 1));
    const desc = xml([p.codigo, p.descricao, `cota ${numero(p.cotaM, 3)} m`].filter(Boolean).join(' · '));
    (pastas.get(pasta) ?? pastas.set(pasta, []).get(pasta)!).push(
      `<Placemark><name>${nome}</name><description>${desc}</description><Point><altitudeMode>absolute</altitudeMode><coordinates>${coord(p)}</coordinates></Point></Placemark>`,
    );
  });
  const linhas = linhasDasFeicoes(pontos).map(
    (l) =>
      `<Placemark><name>${xml(fichaDaFeicao(l.feicao).rotulo)}</name><LineString><altitudeMode>absolute</altitudeMode><coordinates>${l.pontos.map(coord).join(' ')}</coordinates></LineString></Placemark>`,
  );
  const partes = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>', `<name>${xml(titulo)}</name>`];
  for (const [nome, marcas] of pastas) partes.push(`<Folder><name>${xml(nome)}</name>${marcas.join('')}</Folder>`);
  if (linhas.length > 0) partes.push(`<Folder><name>Linhas das feições</name>${linhas.join('')}</Folder>`);
  partes.push('</Document></kml>');
  return partes.join('\n');
}

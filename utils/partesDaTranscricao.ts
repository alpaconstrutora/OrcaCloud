// utils/partesDaTranscricao.ts
// Partes (pessoas e empresas) identificadas no texto de uma transcrição (24/11/2026).
// Plano: docs/planos/2026-11-24-partes-identificadas-na-transcricao.md
//
// Pedido: "na transcrição é possível identificar nomes e documentos? Geralmente
// eles estarão em letras maiúsculas."
//
// Escritura e matrícula seguem o texto padronizado de cartório:
//   "como outorgante(s) vendedor(es) – FULANO DE TAL, brasileiro, ..., portador do
//    RG nº M-1.234.567-SSP/MG e do CPF nº 123.456.789-09, ...; e, de outro lado,
//    como outorgado(s) comprador(es) – BELTRANO ..., casado ... com CICLANA ..."
// Por isso: PARTE = trecho em MAIÚSCULAS seguido de QUALIFICAÇÃO (brasileiro,
// portador, inscrita...). Só maiúsculas não basta — "REPÚBLICA FEDERATIVA DO
// BRASIL", "CINQUENTA MIL REAIS" e o lixo que o OCR lê no carimbo também são.
// Os documentos da parte ficam no texto entre o nome dela e o da próxima.
//
// Função pura sobre as linhas: nada é gravado; muda junto quando o texto é revisado.
import { validateCNPJ, validateCPF } from '../lib/validators';
import { linhaDuvidosa, type LinhaTranscrita } from './transcricaoDocumento';

export interface ParteIdentificada {
  nome: string;
  /** "Vendedor", "Comprador", "Outorgante"... — null quando o texto não diz. */
  papel: string | null;
  /** Nome da parte de quem esta é cônjuge ("casado ... com FULANA"). */
  conjugeDe: string | null;
  /** Só dígitos. */
  cpf: string | null;
  cnpj: string | null;
  /** Como está no texto, sem espaços soltos (ex.: "M-1.234.567 SSP/MG"). */
  rg: string | null;
  /** O número tem dígito verificador e ele não fecha — leitura provavelmente errada. */
  documentoInvalido: boolean;
  /** Alguma linha de onde saiu o nome ou um documento é de leitura duvidosa. */
  duvidosa: boolean;
  /** Índice da linha (na transcrição) onde o nome começa. */
  linha: number;
}

/** Até onde, depois do nome, ainda procuramos os documentos da parte. */
const JANELA_DOS_DOCUMENTOS = 400;
/** Até onde, antes da 1ª parte, procuramos o papel ("como outorgante vendedor – "). */
const RECUO_DO_PAPEL = 300;

// Palavra de nome: 2+ maiúsculas; conectivos de nome em maiúsculas entre elas.
const NOME = /(?<!\p{L})\p{Lu}{2,}(?:[ \t]+(?:\p{Lu}{2,}|D[AEO]S?|E|&|S\/A|S\.A\.?)(?!\p{L}))*(?<=\p{Lu}|\.)(?!\p{L})/gu;
const CONECTIVO = /^(?:D[AEO]S?|E|&)$/;
/** Siglas de documento que podem vir coladas ao nome, sem vírgula. */
const NAO_E_NOME = /^(?:CPF|RG|CNPJ|MF|SSP|CI)$/;

// Primeira palavra depois do nome que mostra que ele é parte qualificada.
const QUALIFICACAO = /^[\s,;:–—-]*(?:brasileir|estrangeir|portador|inscrit|pessoa\s+jur|com\s+sede|nacionalidade|solteir|casad|divorciad|vi[uú]v|separad|maior|menor|natural\s+de|nascid|residente|empresa|sociedade|neste\s+ato|CPF|C\.P\.F|RG\b|R\.G\.|CNPJ|C\.N\.P\.J)/i;

// Papéis, do mais genérico ao mais específico na mesma expressão ("outorgante
// vendedor"): fica o ÚLTIMO encontrado antes do nome.
const PAPEIS: Array<[RegExp, string]> = [
  [/\boutorgantes?\b/gi, 'Outorgante'],
  [/\boutorgad[oa]s?\b/gi, 'Outorgado'],
  [/\bvendedor(?:a|es|as)?\b/gi, 'Vendedor'],
  [/\bcomprador(?:a|es|as)?\b/gi, 'Comprador'],
  [/\bdoador(?:a|es|as)?\b/gi, 'Doador'],
  [/\bdonat[aá]ri[oa]s?\b/gi, 'Donatário'],
  [/\bcedentes?\b/gi, 'Cedente'],
  [/\bcession[aá]ri[oa]s?\b/gi, 'Cessionário'],
  [/\bpermutantes?\b/gi, 'Permutante'],
  [/\banuentes?\b/gi, 'Anuente'],
  [/\binterveniente(?:s|-anuentes?)?\b/gi, 'Interveniente'],
  [/\blocador(?:a|es|as)?\b/gi, 'Locador'],
  [/\blocat[aá]ri[oa]s?\b/gi, 'Locatário'],
  [/\bfiador(?:a|es|as)?\b/gi, 'Fiador'],
  [/\bcredor(?:a|es|as)?\b/gi, 'Credor'],
  [/\bdevedor(?:a|es|as)?\b/gi, 'Devedor'],
  [/\bprocurador(?:a|es|as)?\b/gi, 'Procurador'],
  [/\bpropriet[aá]ri[oa]s?\b/gi, 'Proprietário'],
  [/\badquirentes?\b/gi, 'Adquirente'],
  [/\btransmitentes?\b/gi, 'Transmitente'],
];

// "casado(a) ... com " logo antes do nome = cônjuge da parte anterior.
// Ponto entre dígitos ("lei 6.515/77") não encerra a frase.
const CONJUGE = /\bcasad[oa]s?\b(?:[^.;]|(?<=\d)\.(?=\d)){0,200}\bcom[\s,:–-]*$/i;

// Números: o OCR às vezes põe espaço no meio ("123.456. 789-09"), e a quebra de
// linha vira espaço ao juntar as linhas.
// Antes dos 2 últimos dígitos aceita qualquer sinal: o OCR já leu o hífen como "r"
// (matrícula do 021, 24/11). O dígito verificador é que diz se o número fecha.
const CPF = /\b(?:CPF|C\.P\.F\.?)(?:\s*\/\s*MF)?[^\d]{0,15}?(\d[\d.\s]{9,16}\s*[^\d\s,;]?\s*\d{2})(?!\d)/i;
const CNPJ = /\b(?:CNPJ|C\.N\.P\.J\.?)(?:\s*\/\s*MF)?[^\d]{0,15}?(\d[\d.\s]{6,14}\s*\/\s*\d{4}\s*[-–]?\s*\d{2})(?!\d)/i;
const RG = /(?:\bRG\b|\bR\.G\.|\b[Ii]dentidade\b)[^\dA-Z]{0,15}?((?:[A-Z]{1,2}\s*-\s*)?\d[\d.\s]*\d(?:\s*-\s*[\dXx](?![\d.]))?)(?:\s*[-/]?\s*(SSP|SDS|SESP|SJS|IFP|DETRAN|DGPC|PC|SPTC|IIRGD|MD|MEX|MAER|DPF)\s*[-/]?\s*([A-Z]{2})\b)?/;

function soDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

/** O texto das linhas num só, com o começo de cada linha — para achar a linha de um trecho. */
function juntar(linhas: LinhaTranscrita[]): { texto: string; inicios: number[] } {
  const inicios: number[] = [];
  let texto = '';
  for (const l of linhas) {
    inicios.push(texto.length);
    texto += l.t + '\n';
  }
  return { texto, inicios };
}

function linhaDaPosicao(inicios: number[], pos: number): number {
  let lo = 0;
  let hi = inicios.length - 1;
  while (lo < hi) {
    const meio = (lo + hi + 1) >> 1;
    if (inicios[meio] <= pos) lo = meio;
    else hi = meio - 1;
  }
  return lo;
}

function ultimoPapel(trecho: string): string | null {
  let melhor: { pos: number; papel: string } | null = null;
  for (const [re, papel] of PAPEIS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trecho))) {
      if (!melhor || m.index >= melhor.pos) melhor = { pos: m.index, papel };
    }
  }
  return melhor?.papel ?? null;
}

/** Junta as linhas e devolve as partes na ordem em que aparecem no texto. */
export function identificarPartes(linhas: LinhaTranscrita[]): ParteIdentificada[] {
  const { texto, inicios } = juntar(linhas);
  // Para o nome que quebrou de linha ("VIVIANE FERREIRA\nDA SILVA"), procurar no
  // texto com a quebra trocada por espaço — mesmo tamanho, as posições valem.
  const corrido = texto.replace(/\n/g, ' ');

  const nomes: Array<{ nome: string; ini: number; fim: number }> = [];
  NOME.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NOME.exec(corrido))) {
    const palavras = [...m[0].matchAll(/\S+/g)].map(p => ({ t: p[0], fim: m!.index + p.index! + p[0].length }));
    // "FULANO DE TAL CPF 123..." / "... FERREIRA DA" + quebra: o fim não é nome.
    while (palavras.length > 0 && (CONECTIVO.test(palavras[palavras.length - 1].t) || NAO_E_NOME.test(palavras[palavras.length - 1].t))) palavras.pop();
    if (palavras.length === 0 || CONECTIVO.test(palavras[0].t)) continue;
    if (palavras.filter(p => !CONECTIVO.test(p.t)).length < 2) continue;
    const nome = palavras.map(p => p.t).join(' ');
    const fim = palavras[palavras.length - 1].fim;
    if (!QUALIFICACAO.test(corrido.slice(fim, fim + 60))) continue;
    nomes.push({ nome, ini: m.index, fim });
  }

  const partes: ParteIdentificada[] = [];
  const vistos = new Set<string>();
  let papelAnterior: string | null = null;
  let anterior: { nome: string; fim: number } | null = null;

  nomes.forEach((n, i) => {
    const desde = anterior ? anterior.fim : Math.max(0, n.ini - RECUO_DO_PAPEL);
    const antes = corrido.slice(desde, n.ini);
    const papel = ultimoPapel(antes) ?? papelAnterior;
    const conjugeDe = anterior && CONJUGE.test(antes) ? anterior.nome : null;

    const ate = Math.min(nomes[i + 1]?.ini ?? Infinity, n.fim + JANELA_DOS_DOCUMENTOS);
    const janela = corrido.slice(n.fim, ate);
    const cpf = janela.match(CPF);
    const cnpj = janela.match(CNPJ);
    const rg = janela.match(RG);

    const cpfDigitos = cpf && soDigitos(cpf[1]).length === 11 ? soDigitos(cpf[1]) : null;
    const cnpjDigitos = cnpj && soDigitos(cnpj[1]).length === 14 ? soDigitos(cnpj[1]) : null;
    const rgTexto = rg
      ? rg[1].replace(/\s+/g, '') + (rg[2] ? ` ${rg[2]}/${rg[3]}` : '')
      : null;

    // Linhas de onde saiu cada coisa: duvidosa se qualquer uma for.
    const posicoes = [n.ini, n.fim - 1];
    if (cpf?.index !== undefined) posicoes.push(n.fim + cpf.index + cpf[0].length - 1);
    if (cnpj?.index !== undefined) posicoes.push(n.fim + cnpj.index + cnpj[0].length - 1);
    if (rg?.index !== undefined) posicoes.push(n.fim + rg.index + rg[0].length - 1);
    const duvidosa = posicoes.some(p => linhaDuvidosa(linhas[linhaDaPosicao(inicios, p)]));

    const documentoInvalido = (!!cpfDigitos && !validateCPF(cpfDigitos)) || (!!cnpjDigitos && !validateCNPJ(cnpjDigitos));

    anterior = n;
    papelAnterior = papel;

    // O fim da escritura repete os nomes ("Vendedoras (aa) ..."); fica a 1ª vez.
    const chave = n.nome.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (vistos.has(chave)) return;
    vistos.add(chave);

    partes.push({
      nome: n.nome,
      papel,
      conjugeDe,
      cpf: cpfDigitos,
      cnpj: cnpjDigitos,
      rg: rgTexto,
      documentoInvalido,
      duvidosa,
      linha: linhaDaPosicao(inicios, n.ini),
    });
  });

  return partes;
}

/** Trecho de uma linha: [início, fim) em caracteres de `linha.t`. */
export type Trecho = [number, number];

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Onde um nome/objeto aparece no texto corrido: [início, fim) de cada ocorrência. */
function ocorrencias(corrido: string, texto: string, semDiferenciarMaiusculas: boolean): Trecho[] {
  const re = new RegExp(
    `(?<![\\p{L}\\d])${texto.split(' ').map(escaparRegex).join('\\s+')}(?![\\p{L}\\d])`,
    semDiferenciarMaiusculas ? 'giu' : 'gu',
  );
  return [...corrido.matchAll(re)].map(m => [m.index!, m.index! + m[0].length] as Trecho);
}

// ── Objetos ─────────────────────────────────────────────────────────────────
// Pedido de 24/11/2026: "mais uma coisa a ser identificada e destacada em negrito no
// texto. que são os objetos que geralmente também estão em maiúscula". Na escritura do
// 021: "possuidor(es) de UMA CASA DE MORADA", "transmitem ao comprador o DIREITO DE
// SERVIDÃO DE ÁGUA", "BEM COMO O DIREITO DE SERVIDÃO DE ENERGIA ELÉTRICA".
// OBJETO = trecho em MAIÚSCULAS no meio do texto corrido que não é parte, nem
// cabeçalho/fórmula do cartório, nem valor por extenso.

export interface ObjetoIdentificado {
  texto: string;
  /** Índice da linha (na transcrição) onde o objeto começa. */
  linha: number;
}

// Palavras em maiúsculas, com conectivos e números no meio ("LOTE Nº 05 DA QUADRA 03").
const TRECHO_EM_MAIUSCULAS = /(?<![\p{L}\d])\p{Lu}{2,}(?:[ \t]+(?:\p{Lu}{2,}|D[AEO]S?|E|À|AO|AOS|A|O|OS|AS|EM|N[º°]\.?|\d[\d.,/-]*[A-Z]?)(?![\p{L}\d]))*/gu;
const PALAVRA_DE_LIGACAO = /^(?:D[AEO]S?|E|À|AO|AOS|A|O|OS|AS|EM|N[º°]\.?)$/;
/** "BEM COMO O DIREITO …" → "DIREITO …". */
const ABERTURA = /^(?:BEM\s+COMO|E|COM|ASSIM\s+COMO)(?:\s+(?:O|A|OS|AS))?\s+/;
/** Cabeçalho e fórmulas do cartório; o OCR às vezes corta o começo ("SLADADA"). */
const FORMULA_DO_CARTORIO = /REP[ÚU]BLICA|COMARCA|ESTADO\s+D[EO]|CART[ÓO]RIO|OF[ÍI]CIO|ESCRITURA|TRASLAD|SLADADA|FIELMENTE|TABELI|REGISTRO\s+DE|LIVRO|FOLHA|FLS|MATR[ÍI]CULA|CERTID|DOU\s+F[ÉE]|SAIBAM/;
/** Valor por extenso ("R$ 50.000,00 (CINQUENTA MIL REAIS)"). */
const VALOR_POR_EXTENSO = /\b(?:REAIS|REAL|MIL|CENTAVOS?|MILH[ÃÕ]O|MILH[ÕO]ES)\b/;

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function identificarObjetos(linhas: LinhaTranscrita[], partes: ParteIdentificada[]): ObjetoIdentificado[] {
  const { texto, inicios } = juntar(linhas);
  const corrido = texto.replace(/\n/g, ' ');
  const dasPartes = partes.flatMap(p => ocorrencias(corrido, p.nome, true));
  const nomesSemAcento = partes.map(p => semAcento(p.nome));
  const objetos: ObjetoIdentificado[] = [];
  const vistos = new Set<string>();

  for (const m of corrido.matchAll(TRECHO_EM_MAIUSCULAS)) {
    let bruto = m[0];
    let ini = m.index!;
    const abertura = bruto.match(ABERTURA);
    if (abertura) { bruto = bruto.slice(abertura[0].length); ini += abertura[0].length; }
    const palavras = [...bruto.matchAll(/\S+/g)].map(p => ({ t: p[0], fim: ini + p.index! + p[0].length }));
    while (palavras.length > 0 && PALAVRA_DE_LIGACAO.test(palavras[palavras.length - 1].t)) palavras.pop();
    if (palavras.filter(p => /^\p{Lu}{2,}$/u.test(p.t) && !PALAVRA_DE_LIGACAO.test(p.t)).length < 2) continue;
    const objeto = palavras.map(p => p.t).join(' ');
    const fim = palavras[palavras.length - 1].fim;

    if (FORMULA_DO_CARTORIO.test(objeto) || VALOR_POR_EXTENSO.test(objeto)) continue;
    if (/R\$\s*[\d.,\s]*\(\s*$/.test(corrido.slice(Math.max(0, ini - 30), ini))) continue;
    // Parte (ou pedaço dela) não é objeto — também com acento lido errado pelo OCR
    // ("VERÁ MARINA …" na matrícula do 021). Nem pessoa citada ("Sr. FULANO").
    if (dasPartes.some(([a, b]) => ini < b && fim > a)) continue;
    const objetoSemAcento = semAcento(objeto);
    if (nomesSemAcento.some(n => n.includes(objetoSemAcento) || objetoSemAcento.includes(n))) continue;
    if (/\b(?:Sr|Sra|Srs|Dr|Dra)\.?\s*$/i.test(corrido.slice(Math.max(0, ini - 6), ini))) continue;

    // Só no meio do texto corrido, em linha legível: cabeçalho é linha só de
    // maiúsculas, e o lixo do carimbo vem em linha duvidosa.
    const linha = linhaDaPosicao(inicios, ini);
    const l = linhas[linha];
    if (!l || linhaDuvidosa(l)) continue;
    const resto = l.t.slice(0, ini - inicios[linha]) + ' ' + l.t.slice(Math.min(fim, inicios[linha] + l.t.length) - inicios[linha]);
    if (!/\p{Ll}{3,}/u.test(resto)) continue;

    if (vistos.has(objeto)) continue;
    vistos.add(objeto);
    objetos.push({ texto: objeto, linha });
  }
  return objetos;
}

/**
 * Onde partes e objetos aparecem no texto, por linha — para o negrito (pedidos de
 * 24/11/2026: "No texto aplique negrito nas partes identificadas" e "...os objetos").
 * Nome de parte: toda ocorrência, sem diferenciar maiúsculas — a escritura repete os
 * nomes nas assinaturas em letra normal ("Vendedoras (aa) Ana Paula dos Santos").
 * Objeto: só em maiúsculas — "direito de servidão" em letra normal é texto comum.
 * O que quebrou de linha vira um trecho em cada linha.
 */
export function trechosEmNegrito(
  linhas: LinhaTranscrita[],
  partes: ParteIdentificada[],
  objetos: ObjetoIdentificado[] = [],
): Map<number, Trecho[]> {
  const porLinha = new Map<number, Trecho[]>();
  if (partes.length === 0 && objetos.length === 0) return porLinha;
  const { texto, inicios } = juntar(linhas);
  const corrido = texto.replace(/\n/g, ' ');

  const todas = [
    ...partes.flatMap(p => ocorrencias(corrido, p.nome, true)),
    ...objetos.flatMap(o => ocorrencias(corrido, o.texto, false)),
  ];
  for (const [ini, fim] of todas) {
    for (let i = linhaDaPosicao(inicios, ini); i < linhas.length && inicios[i] < fim; i++) {
      const a = Math.max(ini, inicios[i]) - inicios[i];
      const b = Math.min(fim, inicios[i] + linhas[i].t.length) - inicios[i];
      if (b > a) porLinha.set(i, [...(porLinha.get(i) ?? []), [a, b]]);
    }
  }

  // Em ordem e sem sobreposição — a linha é cortada em pedaços por esses trechos.
  for (const [i, trechos] of porLinha) {
    trechos.sort((x, y) => x[0] - y[0]);
    const unidos: Trecho[] = [];
    for (const t of trechos) {
      const ultimo = unidos[unidos.length - 1];
      if (ultimo && t[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], t[1]);
      else unidos.push([t[0], t[1]]);
    }
    porLinha.set(i, unidos);
  }
  return porLinha;
}

export function formatarCpf(d: string): string {
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

export function formatarCnpj(d: string): string {
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

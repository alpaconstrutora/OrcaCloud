/**
 * LEITOR DE XML LEVE (21/09/2026, backlog P2 — importação COLLADA).
 *
 * `DOMParser` não existe no Node (onde os testes rodam) e o leitor de BCF é
 * raso demais para um formato ANINHADO com transformações por nó. Este é um
 * tokenizador de XML para árvore — elementos, atributos, texto —, sem
 * namespaces resolvidos (o prefixo fica no nome), sem DTD, com as cinco
 * entidades básicas e CDATA. É o suficiente para COLLADA, e o que ele não faz
 * está dito aqui.
 */
export interface ElementoXml {
  nome: string;
  atributos: Record<string, string>;
  filhos: ElementoXml[];
  /** Texto direto (concatenado), sem os filhos. */
  texto: string;
}

const ENTIDADES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };
export function desescaparXml(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos);|&#(\d+);|&#x([0-9a-fA-F]+);/g, (m, nome, dec, hex) => {
    if (nome) return ENTIDADES[m] ?? m;
    if (dec) return String.fromCodePoint(Number(dec));
    return String.fromCodePoint(parseInt(hex, 16));
  });
}

/** O nome sem prefixo de namespace (`c:geometry` → `geometry`). */
export const nomeLocal = (nome: string): string => nome.slice(nome.indexOf(':') + 1);

function lerAtributos(trecho: string): Record<string, string> {
  const saida: Record<string, string> = {};
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trecho))) saida[m[1]] = desescaparXml(m[3] ?? m[4] ?? '');
  return saida;
}

/** Lê o documento e devolve o elemento raiz. Lança em XML malformado (tags desbalanceadas). */
export function lerXml(texto: string): ElementoXml {
  const raiz: ElementoXml = { nome: '#raiz', atributos: {}, filhos: [], texto: '' };
  const pilha: ElementoXml[] = [raiz];
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const abre = texto.indexOf('<', i);
    if (abre < 0) {
      pilha[pilha.length - 1].texto += desescaparXml(texto.slice(i));
      break;
    }
    if (abre > i) pilha[pilha.length - 1].texto += desescaparXml(texto.slice(i, abre));
    if (texto.startsWith('<!--', abre)) {
      const fim = texto.indexOf('-->', abre + 4);
      if (fim < 0) throw new Error('XML: comentário sem fim');
      i = fim + 3;
      continue;
    }
    if (texto.startsWith('<![CDATA[', abre)) {
      const fim = texto.indexOf(']]>', abre + 9);
      if (fim < 0) throw new Error('XML: CDATA sem fim');
      pilha[pilha.length - 1].texto += texto.slice(abre + 9, fim);
      i = fim + 3;
      continue;
    }
    if (texto.startsWith('<?', abre) || texto.startsWith('<!', abre)) {
      const fim = texto.indexOf('>', abre);
      if (fim < 0) throw new Error('XML: declaração sem fim');
      i = fim + 1;
      continue;
    }
    const fim = texto.indexOf('>', abre);
    if (fim < 0) throw new Error('XML: tag sem fim');
    const corpo = texto.slice(abre + 1, fim);
    i = fim + 1;
    if (corpo.startsWith('/')) {
      const nome = corpo.slice(1).trim();
      const topo = pilha.pop();
      if (!topo || topo.nome !== nome) throw new Error(`XML: fechamento de <${nome}> sem abertura (aberto: <${topo?.nome ?? '?'}>)`);
      continue;
    }
    const autoFecha = corpo.endsWith('/');
    const semBarra = autoFecha ? corpo.slice(0, -1) : corpo;
    const espaco = semBarra.search(/\s/);
    const nome = (espaco < 0 ? semBarra : semBarra.slice(0, espaco)).trim();
    const el: ElementoXml = { nome, atributos: espaco < 0 ? {} : lerAtributos(semBarra.slice(espaco)), filhos: [], texto: '' };
    pilha[pilha.length - 1].filhos.push(el);
    if (!autoFecha) pilha.push(el);
  }
  if (pilha.length !== 1) throw new Error(`XML: <${pilha[pilha.length - 1].nome}> não foi fechado`);
  if (raiz.filhos.length !== 1) throw new Error('XML: esperado um elemento raiz');
  return raiz.filhos[0];
}

/** Filhos diretos com este nome local. */
export function filhos(el: ElementoXml, nome: string): ElementoXml[] {
  return el.filhos.filter((f) => nomeLocal(f.nome) === nome);
}

/** O primeiro filho direto com este nome local, ou null. */
export function filho(el: ElementoXml, nome: string): ElementoXml | null {
  return el.filhos.find((f) => nomeLocal(f.nome) === nome) ?? null;
}

/** Todos os descendentes com este nome local, em ordem de documento. */
export function descendentes(el: ElementoXml, nome: string): ElementoXml[] {
  const saida: ElementoXml[] = [];
  const visitar = (x: ElementoXml) => {
    for (const f of x.filhos) {
      if (nomeLocal(f.nome) === nome) saida.push(f);
      visitar(f);
    }
  };
  visitar(el);
  return saida;
}

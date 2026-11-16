/**
 * ÁREAS NBR 12721 — PENDÊNCIAS QUE LEVAM À AÇÃO (15/11/2026, crítica `/impeccable`
 * da tela, `docs/planos/2026-11-15-areas-nbr12721-critica.md`).
 *
 * O motor devolve `{ codigo: 'MOTOR_007', mensagem, itens: ['723e9e65-…'] }`: o código
 * interno e os códigos dos espaços (uid da etiqueta, `dcl:<uid>`…). A tela mostrava
 * isso cru — "qual ambiente é 723e9e65?" virava chamado de suporte, e o princípio 5
 * do PRODUCT.md ("todo número leva à ação") não se cumpria.
 *
 * Aqui cada pendência vira: o que é, ONDE (ambiente · pavimento · unidade), como
 * resolver, e o alvo do botão "Resolver" (o drawer com os ambientes, a aba, as
 * hipóteses com o campo certo, ou a tela Unidades). Puro: sem DOM, sem React.
 */
import type { CodigoDePendencia, EntradaNbr12721, Pendencia } from './tipos';

/** Para onde o "Resolver" leva. */
export type AlvoDaPendencia =
  | { tipo: 'classificar'; chaves: string[] }
  | { tipo: 'hipoteses'; campo: 'diferente' | 'descoberta' | 'escopo' }
  | { tipo: 'aba'; aba: 'classificacao' | 'declarados' | 'acessorios' | 'quadro-i' | 'quadro-ii' | 'fracoes'; soAClassificar?: boolean }
  | { tipo: 'unidades' };

export interface AcaoDaPendencia {
  rotulo: string;
  alvo: AlvoDaPendencia;
}

export interface ItemDaPendencia {
  /** Código do espaço no motor — só para conferência (vai no `title`). */
  codigo: string;
  nome: string;
  pavimento: string | null;
  /** Número da unidade dona; `null` = comum. */
  unidade: string | null;
  /** Chave da linha na aba Classificação (`etq:<id>`/`dcl:<id>`), quando há uma. */
  chave: string | null;
}

export interface PendenciaLegivel {
  chave: string;
  tom: 'bloqueia' | 'classificar' | 'aviso';
  titulo: string;
  /** Como resolver, numa frase. Vazio quando o próprio título já diz. */
  conserto: string;
  itens: ItemDaPendencia[];
  /** Código interno (MOTOR_007, PLANTA…) — conferência, nunca o texto principal. */
  codigo: string;
  acoes: AcaoDaPendencia[];
}

/** O mínimo de uma linha da aba Classificação que a tradução precisa. */
export interface LinhaParaPendencia {
  chave: string;
  tipo: 'ETIQUETA' | 'DECLARADO';
  uid: string;
  nome: string;
  classificacao: unknown | null;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Conserto e ações por código. `chaves` = linhas da Classificação envolvidas. */
function consertoDe(codigo: CodigoDePendencia, chaves: string[], coberturas: Set<string>): { conserto: string; acoes: AcaoDaPendencia[] } {
  const classificar: AcaoDaPendencia[] = chaves.length
    ? [{ rotulo: chaves.length === 1 ? 'Classificar o ambiente' : `Classificar os ${chaves.length} ambientes`, alvo: { tipo: 'classificar', chaves } }]
    : [];
  switch (codigo) {
    case 'MOTOR_006':
      return { conserto: 'Confira o desenho do ambiente ou a área digitada em Ambientes declarados.', acoes: [{ rotulo: 'Ver Ambientes declarados', alvo: { tipo: 'aba', aba: 'declarados' } }] };
    case 'MOTOR_007': {
      // O padrão mora nas hipóteses, por cobertura: leva ao campo da cobertura que falta.
      const campo = coberturas.has('DESCOBERTA') && !coberturas.has('DIFERENTE') ? 'descoberta' : 'diferente';
      return {
        conserto: 'Informe o coeficiente de equivalência no ambiente, ou um coeficiente padrão em Hipóteses. A norma não fixa o número: quem fixa é o responsável técnico.',
        acoes: [...classificar, { rotulo: 'Definir o padrão em Hipóteses', alvo: { tipo: 'hipoteses', campo } }],
      };
    }
    case 'MOTOR_012':
      return { conserto: 'Diga se a área comum é proporcional ou não proporcional.', acoes: classificar };
    case 'MOTOR_011':
      return { conserto: 'Ligue o ambiente a uma unidade na tela Unidades, ou classifique-o como área comum.', acoes: [{ rotulo: 'Abrir Unidades', alvo: { tipo: 'unidades' } }] };
    case 'ACC_VAL_001':
    case 'ACC_VAL_003':
      return { conserto: 'Confira o vínculo do acessório: ele é contado pela unidade dona, nunca pelas duas.', acoes: [{ rotulo: 'Ver Acessórios', alvo: { tipo: 'aba', aba: 'acessorios' } }] };
    case 'COM_PROP_VAL_001':
      return { conserto: 'Escolha o rateio no ambiente, ou o rateio padrão em Hipóteses.', acoes: [...classificar, { rotulo: 'Definir o rateio em Hipóteses', alvo: { tipo: 'hipoteses', campo: 'escopo' } }] };
    case 'COM_PROP_VAL_002':
      return { conserto: 'O rateio "Só o bloco" pede um pavimento num bloco: escolha "O prédio todo" ou ponha o pavimento num bloco.', acoes: classificar };
    case 'QII_VAL_001':
      return { conserto: 'Dê um número à unidade na tela Unidades.', acoes: [{ rotulo: 'Abrir Unidades', alvo: { tipo: 'unidades' } }] };
    case 'QII_VAL_006':
      return { conserto: 'Confira o Quadro II: costuma ser unidade sem área ou arredondamento.', acoes: [{ rotulo: 'Ver o Quadro II', alvo: { tipo: 'aba', aba: 'quadro-ii' } }] };
    case 'FRAC_VAL_002':
      return { conserto: 'Confira as frações: costuma ser unidade sem área ou arredondamento.', acoes: [{ rotulo: 'Ver as Frações', alvo: { tipo: 'aba', aba: 'fracoes' } }] };
    case 'FECH_001':
    case 'FECH_002':
    case 'FECH_003':
      return { conserto: 'Confira as áreas do desenho e os ambientes declarados; o texto acima diz onde a conta não fecha.', acoes: [{ rotulo: 'Ver o Quadro I', alvo: { tipo: 'aba', aba: 'quadro-i' } }] };
    default:
      return { conserto: '', acoes: classificar };
  }
}

/**
 * As pendências da tela, na ordem de leitura: o que BLOQUEIA primeiro, depois o que
 * entrou pela sugestão, depois os avisos.
 */
export function pendenciasLegiveis({
  pendencias,
  entrada,
  avisos,
  linhas,
}: {
  pendencias: Pendencia[];
  entrada: EntradaNbr12721;
  /** Avisos do adaptador (`entradaDoEstudo(...).avisos`) — texto já legível. */
  avisos: string[];
  linhas: LinhaParaPendencia[];
}): PendenciaLegivel[] {
  const espacoPorCodigo = new Map(entrada.espacos.map((s) => [s.codigo, s] as const));
  const nomeDoPavimento = new Map(entrada.pavimentos.map((p) => [p.codigo, p.nome] as const));
  const etiquetaPorUid = new Map(linhas.filter((l) => l.tipo === 'ETIQUETA').map((l) => [l.uid, l] as const));
  const declaradoPorUid = new Map(linhas.filter((l) => l.tipo === 'DECLARADO').map((l) => [l.uid, l] as const));

  /** A linha da Classificação de um espaço: a etiqueta pelo uid; o declarado (e as cópias dele) por `dcl:<uid>`. */
  const linhaDoEspaco = (codigo: string): LinhaParaPendencia | undefined => {
    if (codigo.startsWith('dcl:')) return declaradoPorUid.get(codigo.slice(4).split(':')[0]);
    return etiquetaPorUid.get(codigo);
  };

  const item = (codigo: string): ItemDaPendencia => {
    const s = espacoPorCodigo.get(codigo);
    if (!s) {
      // Não é espaço: é unidade (QII_VAL_001) ou um código que o motor não conhece.
      const u = entrada.unidades.find((x) => x.codigo === codigo);
      return { codigo, nome: u ? `Unidade ${u.codigo || '(sem número)'}` : codigo, pavimento: null, unidade: null, chave: null };
    }
    return { codigo, nome: s.nome, pavimento: nomeDoPavimento.get(s.pavimento) ?? null, unidade: s.unidade, chave: linhaDoEspaco(codigo)?.chave ?? null };
  };

  const doMotor = pendencias.map((p, i): PendenciaLegivel => {
    const itens = p.itens.map(item);
    const chaves = [...new Set(itens.map((x) => x.chave).filter((c): c is string => !!c))];
    const coberturas = new Set(p.itens.map((c) => espacoPorCodigo.get(c)?.cobertura).filter((c): c is NonNullable<typeof c> => !!c));
    const { conserto, acoes } = consertoDe(p.codigo, chaves, coberturas);
    return { chave: `m${i}`, tom: p.bloqueante ? 'bloqueia' : 'aviso', titulo: p.mensagem, conserto, itens, codigo: p.codigo, acoes };
  });

  const aClassificar = linhas.filter((l) => !l.classificacao);
  const sugestao: PendenciaLegivel[] = aClassificar.length
    ? [
        {
          chave: 'sugestao',
          tom: 'classificar',
          titulo: `${plural(aClassificar.length, 'ambiente entrou', 'ambientes entraram')} no cálculo pela sugestão da Planta`,
          conserto: 'Os quadros já os contam assim. Confira e grave a classificação: o documento não deve sair de sugestão.',
          itens: aClassificar.map((l) => ({ codigo: l.uid, nome: l.nome, pavimento: null, unidade: null, chave: l.chave })),
          codigo: 'SUGESTAO',
          acoes: [{ rotulo: 'Ver os que faltam', alvo: { tipo: 'aba', aba: 'classificacao', soAClassificar: true } }],
        },
      ]
    : [];

  const daPlanta = avisos.map((a, i): PendenciaLegivel => ({ chave: `a${i}`, tom: 'aviso', titulo: a, conserto: '', itens: [], codigo: 'PLANTA', acoes: [] }));

  const ordem = { bloqueia: 0, classificar: 1, aviso: 2 } as const;
  return [...doMotor, ...sugestao, ...daPlanta].sort((a, b) => ordem[a.tom] - ordem[b.tom]);
}

/** "Varanda de entrada · Térreo · unidade 101" — o ONDE de um item, em uma linha. */
export function ondeEsta(i: ItemDaPendencia): string {
  return [i.nome, i.pavimento, i.unidade ? `unidade ${i.unidade}` : null].filter(Boolean).join(' · ');
}

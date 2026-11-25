import type {
  MetaDoNivel,
  NivelSiac,
  ProcedimentoResumo,
  RegistroTreinamento,
  TipoItemControlado,
} from '../types/qualidadeSiac';

const SERVICOS_ANEXO4: ReadonlyArray<readonly [string, string]> = [
  ['Serviços preliminares', 'compactação de aterro'],
  ['Serviços preliminares', 'locação de obra'],
  ['Fundações', 'execução de fundação'],
  ['Estrutura', 'execução de fôrma'],
  ['Estrutura', 'montagem de armadura'],
  ['Estrutura', 'concretagem de peça estrutural'],
  ['Estrutura', 'execução de alvenaria estrutural'],
  ['Vedações verticais', 'execução de alvenaria não estrutural e de divisória leve'],
  ['Vedações verticais', 'execução de revestimento interno de área seca, incluindo produção de argamassa em obra, quando aplicável'],
  ['Vedações verticais', 'execução de revestimento interno de área úmida'],
  ['Vedações verticais', 'execução de revestimento externo'],
  ['Vedações horizontais', 'execução de contrapiso'],
  ['Vedações horizontais', 'execução de revestimento de piso interno de área seca'],
  ['Vedações horizontais', 'execução de revestimento de piso interno de área úmida'],
  ['Vedações horizontais', 'execução de revestimento de piso externo'],
  ['Vedações horizontais', 'execução de forro'],
  ['Vedações horizontais', 'execução de impermeabilização'],
  ['Vedações horizontais', 'execução de cobertura em telhado (estrutura e telhamento)'],
  ['Esquadrias', 'colocação de batente e porta'],
  ['Esquadrias', 'colocação de janela'],
  ['Esquadrias', 'colocação de guarda-corpo'],
  ['Pintura', 'execução de pintura interna'],
  ['Pintura', 'execução de pintura externa'],
  ['Sistemas prediais', 'execução de instalação elétrica'],
  ['Sistemas prediais', 'execução de instalação hidrossanitária'],
  ['Sistemas prediais', 'execução de instalação de gás'],
  ['Sistemas prediais', 'colocação de bancada, louça e metal sanitário'],
];

const dois = (n: number) => String(n).padStart(2, '0');

/** Os 27 serviços mínimos do Anexo 4 do SiAC (texto literal). */
export const ANEXO4_SERVICOS: ReadonlyArray<{ numero: number; etapa: string; nome: string; chave: string }> =
  SERVICOS_ANEXO4.map(([etapa, nome], i) => ({
    numero: i + 1,
    etapa,
    nome,
    chave: `ANEXO4-${dois(i + 1)}`,
  }));

const MATERIAIS_SUGERIDOS: ReadonlyArray<string> = [
  'Cimento Portland',
  'Areia',
  'Brita',
  'Aço para armadura (CA-50/CA-60)',
  'Concreto usinado',
  'Bloco cerâmico',
  'Bloco de concreto',
  'Argamassa industrializada',
  'Cal hidratada',
  'Argamassa colante',
  'Placa cerâmica / porcelanato',
  'Rejunte',
  'Tinta',
  'Madeira e compensado para fôrma',
  'Telha',
  'Impermeabilizante (manta/membrana)',
  'Tubos e conexões de PVC',
  'Fios e cabos elétricos',
  'Eletrodutos',
  'Disjuntores e quadros',
  'Janelas',
  'Portas e batentes',
  'Louças e metais sanitários',
  'Gesso / placa de drywall',
];

/** Sugestão editável de materiais — só para a construtora não começar do zero. */
export const SUGESTAO_MATERIAIS: ReadonlyArray<{ nome: string; chave: string }> =
  MATERIAIS_SUGERIDOS.map((nome, i) => ({ nome, chave: `MAT-${dois(i + 1)}` }));

/** O Anexo 4 pede, no mínimo, 20 materiais. */
export const MINIMO_MATERIAIS = 20;

const PERCENTUAL: Record<TipoItemControlado, Record<NivelSiac, number>> = {
  SERVICO: { B: 40, A: 100 },
  MATERIAL: { B: 50, A: 100 },
};

/** Metas do nível sobre N itens. Só inteiros no numerador: sem ponto flutuante. */
export function metaDoNivel(n: number, tipo: TipoItemControlado, nivel: NivelSiac): MetaDoNivel {
  const pct = PERCENTUAL[tipo][nivel];
  return {
    comProcedimento: Math.ceil((n * pct) / 100),
    aplicadosComRegistro: Math.ceil((n * pct) / 200),
    emObraEmAndamento: Math.ceil((n * pct) / 400),
  };
}

export function procedimentoConta(p: ProcedimentoResumo | null): boolean {
  return p !== null && p.versao_ativa_em !== null && p.approval_status === 'aprovado';
}

export function rotuloDoProcedimento(p: ProcedimentoResumo | null): string {
  if (p === null || p.versao_ativa_em === null) return 'sem procedimento';
  return `${p.nome} rev.${p.revisao ?? '—'} ${p.approval_status}`;
}

export interface ContagemTreinados {
  proprios: number;
  empreiteira: number;
  revisaoAnterior: number;
}

/**
 * Pessoas distintas com treinamento aprovado. Vigente = realizado na data da versão ativa
 * ou depois. Quem tem registro vigente não entra em `revisaoAnterior`.
 */
export function contarTreinados(
  registros: RegistroTreinamento[],
  versaoAtivaEm: string | null,
): ContagemTreinados {
  const corte = versaoAtivaEm === null ? null : versaoAtivaEm.slice(0, 10);
  const vigentes = new Map<string, boolean>(); // pessoa -> externo
  const anteriores = new Set<string>();

  for (const reg of registros) {
    if (!reg.aprovado) continue;
    if (corte !== null && reg.data_realizacao.slice(0, 10) >= corte) {
      vigentes.set(reg.employee_id, (vigentes.get(reg.employee_id) ?? false) || reg.externo);
    } else {
      anteriores.add(reg.employee_id);
    }
  }

  let proprios = 0;
  let empreiteira = 0;
  vigentes.forEach((externo) => {
    if (externo) empreiteira += 1;
    else proprios += 1;
  });
  let revisaoAnterior = 0;
  anteriores.forEach((id) => {
    if (!vigentes.has(id)) revisaoAnterior += 1;
  });
  return { proprios, empreiteira, revisaoAnterior };
}

export function rotuloDosTreinados(c: ContagemTreinados): string {
  const total = c.proprios + c.empreiteira;
  if (total === 0) return '—';
  return `${total} (${c.proprios} próprios, ${c.empreiteira} empreit.)`;
}

/** Prefixo que a RPC `quality_registrar_treinamento_em_obra` grava em `notes` da ficha do terceiro novo. */
export const NOTA_DO_TERCEIRO = 'Pessoal de empreiteira cadastrado pelo registro de treinamento em obra — ';

/** Nome da empreiteira gravado nas notas da ficha criada pelo registro em obra ('' se não houver). */
export function empreiteiraDaFicha(e?: { notes?: string | null } | null): string {
  const nota = e?.notes ?? '';
  return nota.startsWith(NOTA_DO_TERCEIRO) ? nota.slice(NOTA_DO_TERCEIRO.length).trim() : '';
}

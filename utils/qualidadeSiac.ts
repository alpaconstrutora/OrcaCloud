import type {
  InspecaoAprovada,
  ItemControlado,
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

const instante = (iso: string): number => Date.parse(iso);

/** Aprovado no GED depois (ou no instante) em que a versão ativa entrou: a aprovação é desta revisão. */
function aprovacaoCobreVersaoAtiva(p: ProcedimentoResumo): boolean {
  if (p.versao_ativa_em === null || p.aprovado_em === null) return false;
  return instante(p.aprovado_em) >= instante(p.versao_ativa_em);
}

/**
 * Procedimento conta quando: tem versão ativa, não está arquivado no GED, está aprovado e a
 * aprovação é posterior à versão ativa (no GED a aprovação é do documento — revisão nova enviada
 * depois da aprovação ainda não foi aprovada).
 */
export function procedimentoConta(p: ProcedimentoResumo | null): boolean {
  return p !== null
    && p.versao_ativa_em !== null
    && p.status !== 'arquivado'
    && p.approval_status === 'aprovado'
    && aprovacaoCobreVersaoAtiva(p);
}

export function rotuloDoProcedimento(p: ProcedimentoResumo | null): string {
  if (p === null || p.versao_ativa_em === null) return 'sem procedimento';
  const base = `${p.nome} rev.${p.revisao ?? '—'}`;
  if (p.status === 'arquivado') return `${base} arquivado no GED`;
  if (p.approval_status === 'aprovado' && !aprovacaoCobreVersaoAtiva(p)) return `${base} nova revisão aguardando aprovação`;
  return `${base} ${p.approval_status}`;
}

/** Por que o procedimento vinculado não conta no nível (null quando conta). */
export function motivoDoProcedimentoNaoContar(p: ProcedimentoResumo): string | null {
  if (procedimentoConta(p)) return null;
  if (p.status === 'arquivado') return 'Este procedimento está arquivado no GED e não conta.';
  if (p.versao_ativa_em !== null && p.approval_status === 'aprovado') {
    return 'A revisão nova deste procedimento ainda não foi aprovada no GED; até lá, ele não conta.';
  }
  return `Este procedimento só conta quando aprovado no GED${p.versao_ativa_em === null ? ' e com uma versão ativa' : ''}.`;
}

/** Hoje no fuso LOCAL, 'YYYY-MM-DD' (não `toISOString`, que é UTC e vira o dia à noite). */
export function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Validade definida e anterior a hoje (o `status` VENCIDO sozinho não tira o treinado). */
function validadeVencida(reg: RegistroTreinamento, hoje: string): boolean {
  const v = reg.data_validade;
  return typeof v === 'string' && v !== '' && v.slice(0, 10) < hoje;
}

/**
 * Treinamento da revisão vigente: realizado num dia posterior ao da versão ativa, ou no mesmo dia
 * e registrado (`registrado_em`) depois da versão ativa. Mesmo dia sem horário de registro = revisão
 * anterior (não dá para saber qual revisão foi treinada). Fase 2: com `data_validade` anterior a
 * `hoje` (data local) não vale — a mesma regra de `_qualidade_treinado_na_revisao` no banco.
 */
export function treinamentoVigente(
  reg: RegistroTreinamento,
  versaoAtivaEm: string | null,
  hoje: string = hojeLocal(),
): boolean {
  if (versaoAtivaEm === null) return false;
  if (validadeVencida(reg, hoje)) return false;
  const dia = reg.data_realizacao.slice(0, 10);
  const corte = versaoAtivaEm.slice(0, 10);
  if (dia > corte) return true;
  if (dia < corte) return false;
  return reg.registrado_em !== null && instante(reg.registrado_em) >= instante(versaoAtivaEm);
}

export interface ContagemTreinados {
  proprios: number;
  empreiteira: number;
  revisaoAnterior: number;
}

/**
 * Pessoas distintas com treinamento aprovado. Vigente = `treinamentoVigente` (dia posterior ao da
 * versão ativa, ou mesmo dia registrado depois dela). Quem tem registro vigente não entra em
 * `revisaoAnterior`. Registro com validade vencida (fase 2) não conta em lugar nenhum — nem como
 * revisão anterior.
 */
export function contarTreinados(
  registros: RegistroTreinamento[],
  versaoAtivaEm: string | null,
  hoje: string = hojeLocal(),
): ContagemTreinados {
  const vigentes = new Map<string, boolean>(); // pessoa -> externo
  const anteriores = new Set<string>();

  for (const reg of registros) {
    if (!reg.aprovado) continue;
    if (validadeVencida(reg, hoje)) continue;
    if (treinamentoVigente(reg, versaoAtivaEm, hoje)) {
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

// ─── Fase 2: serviço controlado na OE ───────────────────────────────────────

const limpo = (c: string | null | undefined): string => (c ?? '').trim();

/**
 * Serviço controlado sugerido para a OE pelo código do item de orçamento (`sinapiCode`) ou, sem
 * ele, pelo código do item da atividade de planejamento. Só serviço (material não é serviço da OE).
 * O código do orçamento vem antes; sem código (ou sem serviço com ele) = null.
 */
export function sugerirServico(
  codigos: { orcamento?: string | null; planejamento?: string | null },
  itens: ItemControlado[],
): ItemControlado | null {
  const servicos = itens.filter((i) => i.tipo === 'SERVICO');
  for (const codigo of [limpo(codigos.orcamento), limpo(codigos.planejamento)]) {
    if (codigo === '') continue;
    const achado = servicos.find((i) => i.codigos.some((c) => limpo(c) === codigo));
    if (achado) return achado;
  }
  return null;
}

export interface ContagemAplicados {
  /** Serviços com ao menos 1 inspeção aprovada com TODOS os executores treinados. */
  aplicados: number;
  /** Idem, numa obra com `obraStatus === 'Em andamento'` (a mesma inspeção). */
  emObra: number;
  /** Por serviço: a inspeção aprovada MAIS RECENTE — x de y executores treinados. */
  porItem: Record<string, { treinados: number; executores: number }>;
}

const todaTreinada = (i: InspecaoAprovada): boolean =>
  i.executores_total > 0 && i.executores_treinados === i.executores_total;

/**
 * "Aplicados com registro" e "em obra em andamento" do nível (serviços). Conta só os `itens`
 * recebidos — quem chama passa os que contam (ativos, com procedimento que conta). Inspeção sem
 * executores não conta.
 */
export function contarAplicados(inspecoes: InspecaoAprovada[], itens: ItemControlado[]): ContagemAplicados {
  const ids = new Set(itens.map((i) => i.id));
  const aplicados = new Set<string>();
  const emObra = new Set<string>();
  const maisRecente = new Map<string, InspecaoAprovada>();

  for (const insp of inspecoes) {
    const id = insp.controlled_item_id;
    if (!ids.has(id)) continue;
    const atual = maisRecente.get(id);
    if (atual === undefined || instante(insp.aprovado_em) > instante(atual.aprovado_em)) maisRecente.set(id, insp);
    if (!todaTreinada(insp)) continue;
    aplicados.add(id);
    if (insp.obra_em_andamento) emObra.add(id);
  }

  const porItem: ContagemAplicados['porItem'] = {};
  maisRecente.forEach((insp, id) => {
    porItem[id] = { treinados: insp.executores_treinados, executores: insp.executores_total };
  });
  return { aplicados: aplicados.size, emObra: emObra.size, porItem };
}

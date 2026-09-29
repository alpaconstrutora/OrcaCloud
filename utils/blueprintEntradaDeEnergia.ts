/**
 * ENTRADA DE ENERGIA (E4.3 do roadmap elétrico, 29/09/2026).
 *
 * O padrão de entrada é da CONCESSIONÁRIA: categoria por demanda × ligação →
 * ramal, disjuntor geral, eletroduto de entrada, aterramento. A NBR 5410 não
 * o fixa. Aqui há UM preset, "GENERICO", com valores usuais de projeto —
 * HIPÓTESE, sem fonte normativa —, e cada linha sai com "CONFERIR na norma
 * da concessionária". Um preset real entra com fonte e data; nenhum é digitado
 * de memória. O ramal também passa pelo motor de condutores (Tab. 36, método
 * D — enterrado — por padrão) e vale a MAIOR das duas seções.
 */
import type { BlueprintModel, LigacaoDoCircuito, ObjectId, Terminal } from './blueprintKernel';
import { secaoDoPeMm2 } from './blueprintKernel';
import {
  HIPOTESES_PADRAO,
  disjuntorSugeridoA,
  preDimensionarQuadroCompleto,
  secaoMinima,
  type HipotesesEletricas,
  type MetodoDeInstalacao,
} from './blueprintEletricaDimensionamento';

export interface CategoriaDeEntrada {
  id: string;
  ligacao: LigacaoDoCircuito;
  /** Demanda MÁXIMA da categoria, kVA. */
  demandaMaxKva: number;
  ramalMm2: number;
  disjuntorGeralA: number;
  eletrodutoMm: number;
}

export interface PadraoDeEntrada {
  id: string;
  nome: string;
  /** Documento e data — ausentes no genérico, obrigatórios num preset real. */
  fonte: string | null;
  dataISO: string | null;
  /** Como o ramal de entrada corre — D (enterrado) no genérico. */
  metodoDoRamal: MetodoDeInstalacao;
  categorias: readonly CategoriaDeEntrada[];
  conferir: string;
}

/**
 * O padrão GENÉRICO — hipótese. Valores usuais em normas de concessionárias do
 * Sudeste para baixa tensão residencial/comercial; não são de nenhuma delas.
 */
export const PADRAO_GENERICO: PadraoDeEntrada = {
  id: 'GENERICO',
  nome: 'genérico — hipótese de projeto',
  fonte: null,
  dataISO: null,
  metodoDoRamal: 'D',
  conferir: 'valores usuais de projeto, sem fonte normativa — CONFERIR categoria, ramal, disjuntor e eletroduto na norma da concessionária local',
  categorias: [
    { id: 'M1', ligacao: 'FN', demandaMaxKva: 7.5, ramalMm2: 10, disjuntorGeralA: 40, eletrodutoMm: 25 },
    { id: 'M2', ligacao: 'FN', demandaMaxKva: 10, ramalMm2: 16, disjuntorGeralA: 50, eletrodutoMm: 32 },
    { id: 'B1', ligacao: 'FF', demandaMaxKva: 12, ramalMm2: 16, disjuntorGeralA: 63, eletrodutoMm: 32 },
    { id: 'B2', ligacao: 'FF', demandaMaxKva: 15, ramalMm2: 25, disjuntorGeralA: 80, eletrodutoMm: 40 },
    { id: 'T1', ligacao: 'FFF', demandaMaxKva: 15, ramalMm2: 16, disjuntorGeralA: 63, eletrodutoMm: 32 },
    { id: 'T2', ligacao: 'FFF', demandaMaxKva: 25, ramalMm2: 25, disjuntorGeralA: 80, eletrodutoMm: 40 },
    { id: 'T3', ligacao: 'FFF', demandaMaxKva: 38, ramalMm2: 35, disjuntorGeralA: 100, eletrodutoMm: 50 },
    { id: 'T4', ligacao: 'FFF', demandaMaxKva: 50, ramalMm2: 50, disjuntorGeralA: 125, eletrodutoMm: 60 },
    { id: 'T5', ligacao: 'FFF', demandaMaxKva: 75, ramalMm2: 70, disjuntorGeralA: 160, eletrodutoMm: 75 },
  ],
};

export const PADROES_DE_ENTRADA: readonly PadraoDeEntrada[] = [PADRAO_GENERICO];

export function padraoDeEntrada(id: string): PadraoDeEntrada {
  return PADROES_DE_ENTRADA.find((p) => p.id === id) ?? PADRAO_GENERICO;
}

export interface EntradaDoQuadro {
  quadroId: ObjectId;
  nome: string;
  padrao: PadraoDeEntrada;
  ligacao: LigacaoDoCircuito;
  tensaoV: number | null;
  demandaKva: number;
  ibA: number | null;
  /** A categoria que cabe (a menor com a ligação e demanda ≥ à do quadro); `null` acima da maior. */
  categoria: CategoriaDeEntrada | null;
  /** O ramal pelo motor de condutores (Tab. 36, método do padrão) — e o que vale: a MAIOR das duas. */
  ramalCalculadoMm2: number | null;
  ramalMm2: number | null;
  disjuntorGeralA: number | null;
  eletrodutoMm: number | null;
  aterramentoMm2: number | null;
  /** Os pontos de entrada e medidor LIGADOS a este quadro no desenho. */
  entradasDeServico: Terminal[];
  medidores: Terminal[];
  achados: { nivel: 'FALTA' | 'AVISO'; mensagem: string }[];
}

/** A entrada de um quadro SEM pai (de entrada). `null` para quadro alimentado por outro. */
export function entradaDoQuadro(model: BlueprintModel, quadroId: ObjectId, hip: HipotesesEletricas = HIPOTESES_PADRAO): EntradaDoQuadro | null {
  const quadro = (model.quadros ?? []).find((q) => q.id === quadroId);
  if (!quadro || quadro.quadroPaiId) return null;
  const r = preDimensionarQuadroCompleto(model, quadroId, hip);
  if (!r) return null;
  const padrao = padraoDeEntrada(hip.padraoDeEntrada);
  const demandaKva = r.sDemandadaVA / 1000;
  const achados: EntradaDoQuadro['achados'] = [];
  const compativeis = padrao.categorias.filter((c) => c.ligacao === r.ligacao).sort((a, b) => a.demandaMaxKva - b.demandaMaxKva);
  const categoria = compativeis.find((c) => c.demandaMaxKva >= demandaKva) ?? null;
  if (compativeis.length === 0) achados.push({ nivel: 'AVISO', mensagem: `padrão "${padrao.nome}" não tem categoria para ligação ${r.ligacao}` });
  else if (!categoria) achados.push({ nivel: 'FALTA', mensagem: `demanda ${demandaKva.toFixed(1).replace('.', ',')} kVA acima da maior categoria ${r.ligacao} do padrão (${compativeis[compativeis.length - 1].demandaMaxKva} kVA) — mudar a ligação ou tratar com a concessionária` });
  // O ramal pelo motor — método do padrão (enterrado), uso de força.
  const calc = r.ibA != null ? secaoMinima(r.ibA, { ...hip, metodoDeInstalacao: padrao.metodoDoRamal }, r.ligacao, 'FORCA') : null;
  const ramalMm2 = categoria || calc ? Math.max(categoria?.ramalMm2 ?? 0, calc?.secaoMm2 ?? 0) : null;
  const disjuntorGeralA = categoria?.disjuntorGeralA ?? (r.ibA != null && calc ? disjuntorSugeridoA(r.ibA, calc.izA, hip.catalogoDeDisjuntoresA) : null);
  if (categoria && r.ibA != null && categoria.disjuntorGeralA < r.ibA) achados.push({ nivel: 'FALTA', mensagem: `disjuntor geral da categoria ${categoria.id} (${categoria.disjuntorGeralA} A) abaixo de IB ${r.ibA.toFixed(1).replace('.', ',')} A` });
  const entradasDeServico = (model.terminais ?? []).filter((t) => t.quadroId === quadroId && t.tipoEletrico === 'ENTRADA_SERVICO');
  const medidores = (model.terminais ?? []).filter((t) => t.quadroId === quadroId && t.tipoEletrico === 'MEDIDOR');
  if (entradasDeServico.length === 0) achados.push({ nivel: 'AVISO', mensagem: `sem ponto de ENTRADA DE SERVIÇO ligado a ${quadro.nome} no desenho` });
  if (medidores.length === 0) achados.push({ nivel: 'AVISO', mensagem: `sem MEDIDOR ligado a ${quadro.nome} no desenho` });
  return {
    quadroId,
    nome: quadro.nome,
    padrao,
    ligacao: r.ligacao,
    tensaoV: r.tensaoV,
    demandaKva,
    ibA: r.ibA,
    categoria,
    ramalCalculadoMm2: calc?.secaoMm2 ?? null,
    ramalMm2,
    disjuntorGeralA,
    eletrodutoMm: categoria?.eletrodutoMm ?? null,
    aterramentoMm2: ramalMm2 != null ? secaoDoPeMm2(ramalMm2) : null,
    entradasDeServico,
    medidores,
    achados,
  };
}

/** Todas as entradas do desenho (um quadro sem pai = uma entrada). */
export function entradasDoModelo(model: BlueprintModel, hip: HipotesesEletricas = HIPOTESES_PADRAO): EntradaDoQuadro[] {
  return (model.quadros ?? []).map((q) => entradaDoQuadro(model, q.id, hip)).filter((e): e is EntradaDoQuadro => !!e);
}

const f1 = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
const mm2 = (v: number | null) => (v == null ? '—' : String(v).replace('.', ','));

/** "categoria B1 (FF até 12 kVA) · ramal 16 mm² · geral 63 A · eletroduto Ø32 · terra 16 mm² — padrão genérico (hipótese)". */
export function rotuloDaEntrada(e: EntradaDoQuadro): string {
  const partes = [
    e.categoria ? `categoria ${e.categoria.id} (${e.ligacao} até ${e.categoria.demandaMaxKva} kVA)` : `sem categoria para ${f1(e.demandaKva)} kVA ${e.ligacao}`,
    `demanda ${f1(e.demandaKva)} kVA`,
    `ramal ${mm2(e.ramalMm2)} mm²${e.ramalCalculadoMm2 != null && e.categoria && e.ramalCalculadoMm2 > e.categoria.ramalMm2 ? ` (Tab. 36 pede ${mm2(e.ramalCalculadoMm2)})` : ''}`,
    `geral ${e.disjuntorGeralA ?? '—'} A`,
    e.eletrodutoMm != null ? `eletroduto Ø${e.eletrodutoMm}` : null,
    `terra ${mm2(e.aterramentoMm2)} mm²`,
  ].filter((x): x is string => !!x);
  return `${partes.join(' · ')} — padrão ${e.padrao.nome}${e.padrao.fonte ? ` (${e.padrao.fonte})` : ''}`;
}

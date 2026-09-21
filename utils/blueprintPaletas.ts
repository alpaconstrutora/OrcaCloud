/**
 * PALETAS DE VISTA (19/09/2026, roadmap E8.2) — "colorir por": ambiente (a
 * cor por nome, que já existia em `blueprintCoresAmbiente`), TIPO de ambiente
 * (as classes da NBR 5410), UNIDADE (E2.2), USO do programa (E4.1) e
 * PAVIMENTO. Puro: recebe o modelo e devolve a cor de cada ambiente e a
 * LEGENDA — a mesma para o canvas e para quem exportar.
 *
 * A cor é de LEITURA, nunca de decisão: mudar a paleta não mexe em nada do
 * modelo. Por isso mora fora do kernel e fora do payload.
 */
import type { BlueprintModel, ObjectId, TipoDeAmbiente } from './blueprintKernel';
import { corDoAmbiente } from './blueprintCoresAmbiente';
import { FICHA_DO_USO, USOS_DO_AMBIENTE, usoDoNome, type UsoDoAmbiente } from './blueprintPrograma';
import { rotuloDaUnidade, unidadePorEtiqueta } from './blueprintUnidades';
import { corDoDepartamento, departamentosDoModelo } from './blueprintDepartamentos';

export type ModoDeCor = 'NENHUM' | 'AMBIENTE' | 'TIPO_DE_AMBIENTE' | 'UNIDADE' | 'USO' | 'PAVIMENTO' | 'DEPARTAMENTO';
export const MODOS_DE_COR: readonly ModoDeCor[] = ['NENHUM', 'AMBIENTE', 'TIPO_DE_AMBIENTE', 'UNIDADE', 'USO', 'PAVIMENTO', 'DEPARTAMENTO'];
export const ROTULO_DO_MODO_DE_COR: Record<ModoDeCor, string> = {
  NENHUM: 'Sem cor (cinza)',
  AMBIENTE: 'Uma cor por ambiente',
  TIPO_DE_AMBIENTE: 'Tipo de ambiente (NBR 5410)',
  UNIDADE: 'Unidade',
  USO: 'Uso do programa',
  PAVIMENTO: 'Pavimento',
  // DEPARTAMENTO (P2.22): o setor gravado na etiqueta — cor fixa por setor sugerido, paleta para os demais.
  DEPARTAMENTO: 'Departamento (setor)',
};

/** Classes da NBR 5410 — cores fixas, sempre as mesmas em qualquer planta. */
export const PALETA_DO_TIPO_DE_AMBIENTE: Record<TipoDeAmbiente, string> = {
  BANHEIRO: '#bae6fd',
  COZINHA_SERVICO: '#fed7aa',
  VARANDA: '#bbf7d0',
  SALA_DORMITORIO: '#fef3c7',
  OUTRO: '#e2e8f0',
};
export const ROTULO_DO_TIPO_DE_AMBIENTE_CURTO: Record<TipoDeAmbiente, string> = {
  BANHEIRO: 'Banheiro',
  COZINHA_SERVICO: 'Cozinha / serviço',
  VARANDA: 'Varanda',
  SALA_DORMITORIO: 'Sala / dormitório',
  OUTRO: 'Outro',
};
const COR_SEM_TIPO = '#f1f5f9';

/** Uma cor por USO do programa (13), estável por índice. */
export const PALETA_DO_USO: Record<UsoDoAmbiente, string> = Object.fromEntries(
  USOS_DO_AMBIENTE.map((u, i) => [u, ['#fde68a', '#fecaca', '#bfdbfe', '#bbf7d0', '#ddd6fe', '#fed7aa', '#a5f3fc', '#f5d0fe', '#d9f99d', '#fecdd3', '#c7d2fe', '#e9d5ff', '#fef08a'][i % 13]]),
) as Record<UsoDoAmbiente, string>;

/** Unidades e pavimentos: paleta cíclica por índice. */
export const PALETA_CICLICA: readonly string[] = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#ddd6fe', '#fed7aa', '#a5f3fc', '#f5d0fe', '#d9f99d', '#fecdd3'];
const COR_AREA_COMUM = '#e5e7eb';

export interface ItemDaLegenda {
  cor: string;
  rotulo: string;
  /** Quantos ambientes (do recorte pedido) levam esta cor. */
  quantidade: number;
}

export interface CoresDaVista {
  modo: ModoDeCor;
  /** Cor por `spaceId`; ausente = a cor padrão do canvas. */
  porAmbiente: Map<ObjectId, string>;
  legenda: ItemDaLegenda[];
}

/**
 * A cor de cada ambiente segundo o modo. `levelId` recorta a legenda ao
 * pavimento (as cores continuam sendo as mesmas em todos — uma unidade tem a
 * mesma cor no térreo e no superior).
 */
export function coresDaVista(model: BlueprintModel, modo: ModoDeCor, levelId?: ObjectId | null): CoresDaVista {
  const porAmbiente = new Map<ObjectId, string>();
  const contagem = new Map<string, ItemDaLegenda>();
  const conta = (cor: string, rotulo: string, noRecorte: boolean) => {
    const atual = contagem.get(rotulo);
    if (atual) atual.quantidade += noRecorte ? 1 : 0;
    else contagem.set(rotulo, { cor, rotulo, quantidade: noRecorte ? 1 : 0 });
  };
  if (modo === 'NENHUM') return { modo, porAmbiente, legenda: [] };

  const etiquetaDe = (labelUid?: string) => (labelUid ? (model.labels ?? []).find((l) => l.uid === labelUid) : undefined);
  const unidadeDe = unidadePorEtiqueta(model);
  const indiceDaUnidade = new Map((model.unidades ?? []).map((u, i) => [u.id, i]));
  const indiceDoNivel = new Map(model.levels.map((l, i) => [l.id, i]));
  // DEPARTAMENTO (P2.22): a cor depende do conjunto presente no modelo inteiro (a mesma nos dois pavimentos).
  const departamentos = modo === 'DEPARTAMENTO' ? departamentosDoModelo(model) : [];

  for (const s of model.spaces) {
    const noRecorte = !levelId || s.levelId === levelId;
    let cor: string;
    let rotulo: string;
    switch (modo) {
      case 'AMBIENTE':
        cor = corDoAmbiente(s);
        rotulo = s.name ?? 'Ambiente sem nome';
        break;
      case 'TIPO_DE_AMBIENTE': {
        const tipo = etiquetaDe(s.labelUid)?.tipoDeAmbiente ?? null;
        cor = tipo ? PALETA_DO_TIPO_DE_AMBIENTE[tipo] : COR_SEM_TIPO;
        rotulo = tipo ? ROTULO_DO_TIPO_DE_AMBIENTE_CURTO[tipo] : 'Sem tipo';
        break;
      }
      case 'UNIDADE': {
        const u = s.labelUid ? unidadeDe.get(s.labelUid) : undefined;
        cor = u ? PALETA_CICLICA[(indiceDaUnidade.get(u.id) ?? 0) % PALETA_CICLICA.length] : COR_AREA_COMUM;
        rotulo = u ? rotuloDaUnidade(u) : 'Área comum / sem unidade';
        break;
      }
      case 'USO': {
        const uso = usoDoNome(s.name);
        cor = uso ? PALETA_DO_USO[uso] : COR_SEM_TIPO;
        rotulo = uso ? FICHA_DO_USO[uso].rotulo : 'Uso não reconhecido';
        break;
      }
      case 'PAVIMENTO': {
        const i = indiceDoNivel.get(s.levelId) ?? 0;
        cor = PALETA_CICLICA[i % PALETA_CICLICA.length];
        rotulo = model.levels[i]?.name ?? 'Pavimento';
        break;
      }
      case 'DEPARTAMENTO': {
        const d = etiquetaDe(s.labelUid)?.departamento ?? null;
        cor = d ? corDoDepartamento(d, departamentos) : COR_SEM_TIPO;
        rotulo = d ?? 'Sem departamento';
        break;
      }
      default:
        cor = COR_SEM_TIPO;
        rotulo = '';
    }
    porAmbiente.set(s.id, cor);
    if (modo !== 'AMBIENTE') conta(cor, rotulo, noRecorte);
  }
  // A legenda do modo AMBIENTE seria a lista de todos os ambientes — inútil; fica vazia.
  const legenda = [...contagem.values()].filter((i) => i.quantidade > 0).sort((a, b) => a.rotulo.localeCompare(b.rotulo));
  return { modo, porAmbiente, legenda };
}

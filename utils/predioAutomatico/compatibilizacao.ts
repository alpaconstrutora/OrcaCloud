/**
 * Prédio automático — o RELATÓRIO DE COMPATIBILIZAÇÃO (PA10b do plano docs/planos/2026-11-12-predio-automatico.md,
 * 16/11/2026): os conflitos, os encostos, as passagens na laje e os furos para o calculista do prédio inteiro, numa
 * leitura só, no fim do plano (a Conferência).
 *
 * - CONFLITO é a rede com o eixo DENTRO de outro corpo (porta ou janela, pilar, um equipamento) e o ENCONTRO de duas
 *   redes (os tubos se tocam ou se cruzam — o kernel só registra o par assim, sempre com 0 mm, como a casa conta, F27).
 *   Contado no prédio inteiro; os locais levam ao tipo, ao térreo, à cobertura e aos subsolos — as cópias repetem o tipo.
 * - ENCOSTO é o raspão de uma rede numa peça (0 mm: o eixo fora, a espessura alcança) — o tubo rente ao pilar, ao vão.
 *   Uma linha só.
 * - A rede que atravessa VIGA ou LAJE não é conflito: é FURO PREVISTO (a lista para o calculista, como na casa — F14c);
 *   a prumada na laje é PASSAGEM (`passagensNaLaje`): no núcleo (o shaft já fura) e o eletroduto embutido não pedem furo.
 */
import { conflitosDoModelo, passagensNaLaje } from '../blueprintKernel';
import type { BlueprintModel, Conflito, ObjectId } from '../blueprintKernel';
import { furosPrevistos, type FuroPrevisto } from '../blueprintFurosPrevistos';
import { localDoConflito } from '../blueprintLocalDaPendencia';
import { ROTULO_DA_DISCIPLINA, volumesDasPecasDeClimatizacao } from '../blueprintRede';
import { ROTULO_DA_DISCIPLINA_DA_REDE, ROTULO_DA_DISCIPLINA_DO_AR } from '../casaAutomatica/hipoteses';
import type { LocalDaPendencia, PendenciaDoPpci } from '../blueprintGeradorPpci';

export type TipoDeConflitoDoPredio = 'ABERTURA' | 'PILAR' | 'REDE' | 'EQUIPAMENTO' | 'OUTRO';

const TEXTO_DO_CONFLITO: Record<TipoDeConflitoDoPredio, string> = {
  ABERTURA: 'trecho(s) de rede passando por porta ou janela',
  PILAR: 'trecho(s) de rede atravessando pilar',
  REDE: 'encontro(s) entre redes (os tubos se tocam ou se cruzam)',
  EQUIPAMENTO: 'trecho(s) de rede atravessando um equipamento a que não se liga',
  OUTRO: 'trecho(s) de rede atravessando outra peça (parede estrutural, fundação)',
};

export interface CompatibilizacaoDoPredio {
  /** No prédio inteiro, por tipo. */
  conflitos: Record<TipoDeConflitoDoPredio, number>;
  encostos: number;
  /** Os pavimentos com algum conflito ou encosto, de baixo para cima. */
  porPavimento: { nome: string; conflitos: number; encostos: number }[];
  /** As prumadas na laje, no prédio inteiro: o furo próprio, a do núcleo e o eletroduto embutido. */
  passagens: { furos: number; noNucleo: number; embutidas: number };
  /** Os furos para o calculista. A lista fica sem os andares copiados (repetem o tipo) e sem as passagens que não furam. */
  furos: { emViga: number; dispensa: number; verificar: number; emBaldrame: number; emLaje: number; lista: FuroPrevisto[] };
  pendencias: PendenciaDoPpci[];
}

/** Os nomes curtos da casa (água fria, dreno do ar-condicionado, eletroduto). */
const NOME_DA_REDE: Record<string, string> = { ...ROTULO_DA_DISCIPLINA_DA_REDE, ...ROTULO_DA_DISCIPLINA_DO_AR, ELETRICA: 'eletroduto' };
const nomeDaRede = (d: string) => NOME_DA_REDE[d] ?? (ROTULO_DA_DISCIPLINA[d as keyof typeof ROTULO_DA_DISCIPLINA] ?? d).toLowerCase();

export function compatibilizarPredio(m: BlueprintModel): CompatibilizacaoDoPredio {
  // Com as caixas das peças de climatização (evaporadora, condensadora): o trecho que atravessa uma a que não se liga.
  const conflitosDoModeloInteiro = conflitosDoModelo(m, { pecas: volumesDasPecasDeClimatizacao(m) });
  const passagens = passagensNaLaje(m);
  const trechos = new Map((m.trechos ?? []).map((t) => [t.id, t]));
  const pecas = new Map((m.structures ?? []).map((s) => [s.id, s]));
  const copia = new Set(m.levels.filter((l) => l.tipoDeId).map((l) => l.id));

  const conflitos: Record<TipoDeConflitoDoPredio, number> = { ABERTURA: 0, PILAR: 0, REDE: 0, EQUIPAMENTO: 0, OUTRO: 0 };
  const porRede: Record<TipoDeConflitoDoPredio, Record<string, number>> = { ABERTURA: {}, PILAR: {}, REDE: {}, EQUIPAMENTO: {}, OUTRO: {} };
  const locais: Record<TipoDeConflitoDoPredio, LocalDaPendencia[]> = { ABERTURA: [], PILAR: [], REDE: [], EQUIPAMENTO: [], OUTRO: [] };
  const porNivel = new Map<ObjectId, { conflitos: number; encostos: number }>();
  let encostos = 0;
  const tipoDe = (c: Conflito): TipoDeConflitoDoPredio | 'FURO' => {
    if (c.classe === 'ESTRUTURA') {
      const k = pecas.get(c.outroId)?.kind;
      return k === 'PILAR' ? 'PILAR' : k === 'VIGA' || k === 'VIGA_FUNDACAO' || k === 'LAJE' ? 'FURO' : 'OUTRO';
    }
    return c.classe === 'PAREDE_ESTRUTURAL' ? 'OUTRO' : c.classe;
  };
  for (const c of conflitosDoModeloInteiro) {
    const tipo = tipoDe(c);
    if (tipo === 'FURO') continue;
    const t = trechos.get(c.trechoId);
    const nivel = t?.levelId ?? '';
    const n = porNivel.get(nivel) ?? { conflitos: 0, encostos: 0 };
    porNivel.set(nivel, n);
    // Numa peça, o encontro sem nada DENTRO é raspão (o tubo rente ao pilar, ao vão). Entre redes o kernel mede sempre
    // 0 mm e só registra o par que se toca ou se cruza: é encontro, conflito.
    if (tipo !== 'REDE' && c.comprimentoDentroMm <= 0) {
      encostos++;
      n.encostos++;
      continue;
    }
    conflitos[tipo]++;
    n.conflitos++;
    if (t) {
      const o = tipo === 'REDE' ? trechos.get(c.outroId) : undefined;
      const chave = o ? [nomeDaRede(t.disciplina), nomeDaRede(o.disciplina)].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(' × ') : nomeDaRede(t.disciplina);
      porRede[tipo][chave] = (porRede[tipo][chave] ?? 0) + 1;
    }
    if (!copia.has(nivel)) {
      const l = localDoConflito(m, c);
      if (l) locais[tipo].push(l);
    }
  }

  const semFuro = new Set(passagens.filter((p) => p.noNucleo || p.tipo === 'EMBUTIDO').map((p) => `${p.trechoId}|${p.lajeId}`));
  const todos = furosPrevistos(m, undefined, { conflitos: conflitosDoModeloInteiro, passagens });
  // Na laje, só a passagem que pede furo próprio; o furo agrupado (feixe) sai se algum dos tubos dele não pede.
  const pedeFuro = (f: FuroPrevisto) => f.tipoDaPeca !== 'LAJE' || !(f.trechoIds ?? [f.trechoId]).some((id) => semFuro.has(`${id}|${f.pecaId}`));
  const lista = todos.filter((f) => pedeFuro(f) && !copia.has(f.levelId));
  const naViga = lista.filter((f) => f.tipoDaPeca === 'VIGA');
  const furos = {
    emViga: naViga.length,
    dispensa: naViga.filter((f) => f.dispensa).length,
    verificar: naViga.filter((f) => f.dispensa === false).length,
    emBaldrame: lista.filter((f) => f.tipoDaPeca === 'VIGA_FUNDACAO').length,
    emLaje: lista.filter((f) => f.tipoDaPeca === 'LAJE').length,
    lista,
  };
  const furosNaLaje = passagens.filter((p) => p.tipo === 'FURO' && !p.noNucleo).length;
  const resultado: CompatibilizacaoDoPredio = {
    conflitos,
    encostos,
    porPavimento: [...m.levels]
      .sort((a, b) => a.elevationMm - b.elevationMm)
      .filter((l) => porNivel.has(l.id))
      .map((l) => ({ nome: l.name, ...porNivel.get(l.id)! })),
    passagens: { furos: furosNaLaje, noNucleo: passagens.filter((p) => p.noNucleo).length, embutidas: passagens.filter((p) => p.tipo === 'EMBUTIDO' && !p.noNucleo).length },
    furos,
    pendencias: [],
  };

  const temCopia = copia.size > 0;
  for (const tipo of Object.keys(conflitos) as TipoDeConflitoDoPredio[]) {
    const n = conflitos[tipo];
    if (!n) continue;
    const redes = Object.entries(porRede[tipo])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
      .map(([r, k]) => `${r} ${k}`)
      .join(', ');
    resultado.pendencias.push({
      grupo: 'CONFLITO',
      texto: `Compatibilização: ${n} ${TEXTO_DO_CONFLITO[tipo]} no prédio (${redes})${temCopia ? ' — os locais levam ao tipo e aos pavimentos únicos; os andares copiados repetem o tipo' : ''}.`,
      ...(locais[tipo].length ? { locais: locais[tipo] } : {}),
    });
  }
  if (encostos) resultado.pendencias.push({ grupo: 'CONFERIR', texto: `Compatibilização: ${encostos} encosto(s) de raspão no prédio (o tubo rente ao pilar, à porta ou janela, ao equipamento — o eixo fora, a espessura alcança) — confira o afastamento na obra.` });
  if (lista.length || passagens.length)
    resultado.pendencias.push({
      grupo: 'CONFERIR',
      texto: `Furos previstos para o calculista${temCopia ? ' (no tipo e nos pavimentos únicos; cada andar copiado repete os do tipo)' : ''}: ${furos.emViga} em viga (${furos.dispensa} dispensam a verificação pelos critérios da NBR 6118, 13.2.5.1; ${furos.verificar} a verificar), ${furos.emBaldrame} em baldrame e ${furos.emLaje} em laje. No prédio inteiro, ${resultado.passagens.furos} prumada(s) furam a laje fora do núcleo; ${resultado.passagens.noNucleo} passam no shaft e ${resultado.passagens.embutidas} eletroduto(s) ficam embutidos na laje, sem furo — a lista está na aba Compatibilização.`,
    });
  return resultado;
}

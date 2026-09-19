/**
 * MOTOR DE AVALIAÇÃO — o SCORE (19/09/2026, roadmap E5.2).
 *
 * Dezoito indicadores de 0 a 100, cada um com a EXPLICAÇÃO (o que foi medido,
 * contra que referência) e os alvos (ids para o clique e para as sugestões
 * da E5.3). A nota geral é a média ponderada dos indicadores AVALIADOS — o que
 * não deu para medir (sem programa, sem orçamento, sem estrutura) fica `null`
 * e diz por quê; nunca vira 0 nem 100 em silêncio. Pesos 0–10 editáveis.
 *
 * As referências numéricas são de PRÉ-PROJETO e estão escritas em cada
 * indicador (eficiência 60→90 %, circulação pela metade e pelo dobro do
 * limite do programa, compacidade pelo quadrado, paredes 0,6→1,4 m/m²,
 * rede 3→12 m/ponto…). São réguas para comparar alternativas do mesmo
 * estudo, não notas de norma: a legislação tem o motor de regras (E3.2).
 *
 * Entradas vêm prontas do editor (conferência do programa E4.3, resultados de
 * regras E3.2, grafos E4.2, insolação E5.1, custo do orçamento); o que não
 * vier, o motor calcula do modelo quando dá, ou declara não avaliado.
 */
import {
  areaConstruidaMm2,
  areaRecuada,
  contornoExternoDoNivel,
  polygonArea,
  wallLength,
  type BlueprintModel,
  type ObjectId,
  type Point,
} from './blueprintKernel';
import { grafosDoModelo, type GrafoEspacial } from './blueprintGrafoEspacial';
import { analisarInsolacao, type InsolacaoDoAmbiente, type OpcoesDeInsolacao } from './blueprintInsolacao';
import type { ConferenciaDoPrograma } from './blueprintConferenciaDoPrograma';
import { FONTE_DO_PROGRAMA } from './blueprintConferenciaDoPrograma';
import type { ResultadoDeRegra } from './blueprintRegras';
import type { Programa } from './blueprintPrograma';
import { FICHA_DO_USO } from './blueprintPrograma';

export const CHAVES_DOS_INDICADORES = [
  'programa',
  'legal',
  'eficiencia',
  'circulacao',
  'compacidade',
  'insolacao',
  'ventilacao',
  'corredores',
  'adjacencias',
  'privacidade',
  'acessibilidade',
  'estrutura',
  'modulacao',
  'custo',
  'paredes',
  'fachada',
  'shafts',
  'hidraulica',
] as const;
export type ChaveDoIndicador = (typeof CHAVES_DOS_INDICADORES)[number];

export const ROTULO_DO_INDICADOR: Record<ChaveDoIndicador, string> = {
  programa: 'Programa de necessidades',
  legal: 'Legislação e normas',
  eficiencia: 'Eficiência (útil / construída)',
  circulacao: 'Circulação',
  compacidade: 'Compacidade',
  insolacao: 'Insolação',
  ventilacao: 'Ventilação cruzada',
  corredores: 'Corredores e passagens',
  adjacencias: 'Adjacências desejadas',
  privacidade: 'Privacidade (fluxos)',
  acessibilidade: 'Acessibilidade',
  estrutura: 'Estrutura',
  modulacao: 'Modulação',
  custo: 'Custo por m²',
  paredes: 'Paredes por m²',
  fachada: 'Fachada',
  shafts: 'Shafts',
  hidraulica: 'Eficiência hidráulica',
};

export type PesosDaAvaliacao = Record<ChaveDoIndicador, number>;
export const PESOS_PADRAO: PesosDaAvaliacao = {
  programa: 10,
  legal: 10,
  eficiencia: 6,
  circulacao: 5,
  compacidade: 3,
  insolacao: 6,
  ventilacao: 4,
  corredores: 4,
  adjacencias: 5,
  privacidade: 5,
  acessibilidade: 6,
  estrutura: 4,
  modulacao: 2,
  custo: 6,
  paredes: 3,
  fachada: 4,
  shafts: 2,
  hidraulica: 3,
};

export interface HipotesesDaAvaliacao {
  pesos: PesosDaAvaliacao;
  /** Custo/m² de referência (R$) para o indicador de custo; `null` = não avalia. */
  referenciaM2BRL: number | null;
  /** Vão máximo de viga sem aviso (mm). */
  vaoMaxDaVigaMm: number;
  /** Módulo da malha para a modulação (mm). */
  moduloMm: number;
  /** Raio em que um shaft "atende" um ambiente molhado (mm). */
  raioDoShaftMm: number;
}
export const HIPOTESES_DA_AVALIACAO_PADRAO: HipotesesDaAvaliacao = { pesos: PESOS_PADRAO, referenciaM2BRL: null, vaoMaxDaVigaMm: 6000, moduloMm: 100, raioDoShaftMm: 3000 };

export interface Indicador {
  chave: ChaveDoIndicador;
  rotulo: string;
  /** 0–100; `null` = não avaliado (ver `explicacao`). */
  nota: number | null;
  peso: number;
  explicacao: string;
  /** Linhas de detalhe (o que pesou), no máximo ~6. */
  detalhes: string[];
  /** Ids (ambiente, porta, peça) que puxaram a nota para baixo — para o clique e a E5.3. */
  alvos: { id: ObjectId; rotulo: string; levelId: ObjectId | null }[];
}

export interface Avaliacao {
  indicadores: Indicador[];
  notaGeral: number | null;
  avaliados: number;
  naoAvaliados: number;
  /** Os três piores avaliados, do pior para o melhor. */
  piores: Indicador[];
}

export interface EntradasDaAvaliacao {
  model: BlueprintModel;
  programa?: Programa | null;
  conferencia?: ConferenciaDoPrograma | null;
  resultadosDeRegras?: readonly ResultadoDeRegra[] | null;
  /** Para calcular a insolação de todos os pavimentos; ausente = não avalia insolação. */
  insolacao?: Omit<OpcoesDeInsolacao, 'pisoMm'> | null;
  /** Mínimo de horas de sol no inverno (zona); sem ele, vale 1 h. */
  insolacaoMinimaH?: number | null;
  custoTotalBRL?: number | null;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const pct = (n: number, d: number) => (d > 0 ? clamp((100 * n) / d) : null);
const f1 = (v: number) => v.toFixed(1).replace('.', ',');
const f2 = (v: number) => v.toFixed(2).replace('.', ',');
/** Régua linear: 100 em `bom`, 0 em `ruim` (qualquer sentido). */
const regua = (v: number, bom: number, ruim: number) => clamp((100 * (v - ruim)) / (bom - ruim));

export function avaliar(e: EntradasDaAvaliacao, h: HipotesesDaAvaliacao = HIPOTESES_DA_AVALIACAO_PADRAO): Avaliacao {
  const { model } = e;
  const grafos = grafosDoModelo(model);
  const nomeDoNivel = (id: ObjectId) => model.levels.find((l) => l.id === id)?.name ?? '—';
  const indicadores: Indicador[] = [];
  const add = (chave: ChaveDoIndicador, nota: number | null, explicacao: string, detalhes: string[] = [], alvos: Indicador['alvos'] = []) =>
    indicadores.push({ chave, rotulo: ROTULO_DO_INDICADOR[chave], nota, peso: h.pesos[chave], explicacao, detalhes: detalhes.slice(0, 6), alvos });
  const alvoDoNo = (g: GrafoEspacial, spaceId: ObjectId) => {
    const no = g.nos.find((n) => n.spaceId === spaceId);
    return { id: no?.etiquetaId ?? spaceId, rotulo: no?.rotulo ?? 'Ambiente', levelId: g.levelId };
  };
  const areaConstruida = model.levels.reduce((s, l) => s + areaConstruidaMm2(model, l), 0) / 1e6;
  const paredesDoNivel = (levelId: ObjectId) => model.walls.filter((w) => w.levelId === levelId);
  const areaUtil = model.spaces.reduce((s, sp) => s + areaRecuada(sp.ring, paredesDoNivel(sp.levelId)).areaMm2, 0) / 1e6;
  const todosOsNos = [...grafos.values()].flatMap((g) => g.nos.map((n) => ({ g, n })));

  // 1. Programa (E4.3)
  if (e.conferencia && (e.programa?.itens.length ?? 0) > 0) {
    const r = e.conferencia.resumo;
    const total = r.atendidos + r.faltas + r.avisos;
    add('programa', pct(r.atendidos + r.avisos * 0.5, total), `${r.atendidos} atendido(s), ${r.faltas} falta(s), ${r.avisos} aviso(s) — falta vale 0, aviso vale meio ponto.`, e.conferencia.itens.filter((i) => i.faltam > 0).map((i) => `${i.item.nome}: faltam ${i.faltam}`), e.conferencia.itens.flatMap((i) => i.casados.filter((c) => c.verificacoes.some((v) => v.estado === 'VIOLADA')).map((c) => ({ id: c.etiquetaId ?? c.spaceId, rotulo: c.rotulo, levelId: c.levelId }))));
  } else add('programa', null, 'Sem programa de necessidades no estudo (Analisar › Programa).');

  // 2. Legal (E3.2) — sem as linhas do programa, que já têm indicador próprio.
  {
    const rs = (e.resultadosDeRegras ?? []).filter((r) => r.regra.fonte !== FONTE_DO_PROGRAMA);
    const erros = rs.filter((r) => r.estado === 'VIOLADA' && r.regra.severidade === 'ERRO');
    const avisos = rs.filter((r) => r.estado === 'VIOLADA' && r.regra.severidade === 'AVISO');
    const conformes = rs.filter((r) => r.estado === 'CONFORME').length;
    const total = conformes + 2 * erros.length + avisos.length;
    if (rs.length === 0) add('legal', null, 'Nenhuma regra avaliada ainda (Analisar › Legislação).');
    else add('legal', pct(conformes, total), `${conformes} conforme(s), ${erros.length} erro(s) (pesam dobrado), ${avisos.length} aviso(s); não avaliadas não contam.`, erros.slice(0, 6).map((r) => `${r.regra.nome} — ${r.alvoRotulo}${r.levelId ? ` (${nomeDoNivel(r.levelId)})` : ''}`), erros.filter((r) => r.selecionarId).map((r) => ({ id: r.selecionarId!, rotulo: `${r.alvoRotulo}${r.levelId ? ` (${nomeDoNivel(r.levelId)})` : ''}: ${r.regra.nome}`, levelId: r.levelId })));
  }

  // 3. Eficiência
  if (areaConstruida > 0 && areaUtil > 0) {
    const razao = areaUtil / areaConstruida;
    add('eficiencia', regua(razao, 0.9, 0.6), `Área útil ${f2(areaUtil)} m² / construída ${f2(areaConstruida)} m² = ${f1(razao * 100)} %. Régua: 60 % → 0, 90 % → 100.`);
  } else add('eficiencia', null, 'Sem ambientes fechados para medir a área útil.');

  // 4. Circulação
  {
    const util = [...grafos.values()].reduce((s, g) => s + g.areaUtilMm2, 0);
    const circ = [...grafos.values()].reduce((s, g) => s + g.areaCirculacaoMm2, 0);
    if (util === 0) add('circulacao', null, 'Sem ambientes fechados.');
    else {
      const p = (100 * circ) / util;
      const temPrograma = (e.programa?.itens.length ?? 0) > 0;
      const limite = temPrograma ? e.programa!.circulacaoMaxPct : 15;
      const nota = p <= limite / 2 ? 100 : p <= limite ? clamp(100 - ((p - limite / 2) / (limite / 2)) * 40) : clamp(60 - ((p - limite) / limite) * 60);
      add('circulacao', nota, `${f1(p)} % da área útil é circulação (limite ${limite} %${temPrograma ? ', do programa' : ', padrão'}). 100 até a metade do limite, 60 no limite, 0 no dobro.`, todosOsNos.filter((x) => x.n.circulacao).map((x) => `${x.n.rotulo} (${nomeDoNivel(x.g.levelId)}): ${f2(x.n.areaMm2 / 1e6)} m²`));
    }
  }

  // 5. Compacidade (P²/A por pavimento; quadrado = 16)
  {
    let somaA = 0;
    let somaNota = 0;
    const det: string[] = [];
    for (const l of model.levels) {
      for (const c of contornoExternoDoNivel(model, l)) {
        const A = Math.abs(polygonArea(c));
        if (A < 1) continue;
        let P = 0;
        for (let i = 0; i < c.length; i++) P += Math.hypot(c[(i + 1) % c.length].x - c[i].x, c[(i + 1) % c.length].y - c[i].y);
        const k = (P * P) / A;
        somaA += A;
        somaNota += A * clamp((100 * 16) / k);
        det.push(`${l.name}: P²/A = ${f1(k)} (quadrado = 16)`);
      }
    }
    if (somaA === 0) add('compacidade', null, 'Sem contorno externo fechado.');
    else add('compacidade', clamp(somaNota / somaA), 'Perímetro² / área do contorno externo, por pavimento (ponderado pela área): 16 é o quadrado; quanto mais recortado, mais fachada por m².', det);
  }

  // 6–7. Insolação e ventilação (E5.1)
  {
    const permanencia = todosOsNos.filter((x) => x.n.uso === 'SALA' || x.n.uso === 'DORMITORIO' || x.n.uso === 'SUITE' || x.n.uso === 'ESCRITORIO');
    if (!e.insolacao) {
      add('insolacao', null, 'Insolação não calculada (abra Analisar › Insolação).');
      add('ventilacao', null, 'Ventilação não calculada (abra Analisar › Insolação).');
    } else if (permanencia.length === 0) {
      add('insolacao', null, 'Nenhum ambiente de permanência prolongada (sala, dormitório, suíte, escritório) reconhecido pelo nome.');
      add('ventilacao', null, 'Nenhum ambiente de permanência prolongada reconhecido pelo nome.');
    } else {
      const minimo = e.insolacaoMinimaH ?? 1;
      const porNivel = new Map<ObjectId, InsolacaoDoAmbiente[]>();
      for (const [levelId, g] of grafos) {
        const piso = model.levels.find((l) => l.id === levelId)?.elevationMm ?? 0;
        porNivel.set(levelId, analisarInsolacao(g, { ...e.insolacao, pisoMm: piso }, { dia: 172, horaSolar: 12 }));
      }
      const ok: string[] = [];
      const ruim: { id: ObjectId; rotulo: string; levelId: ObjectId; horas: number }[] = [];
      for (const x of permanencia) {
        const a = porNivel.get(x.g.levelId)?.find((i) => i.spaceId === x.n.spaceId);
        if (!a) continue;
        if (a.temJanela && a.horas.INVERNO >= minimo) ok.push(`${a.rotulo}: ${f1(a.horas.INVERNO)} h`);
        else ruim.push({ id: a.etiquetaId ?? a.spaceId, rotulo: a.rotulo, levelId: x.g.levelId, horas: a.horas.INVERNO });
      }
      add('insolacao', pct(ok.length, ok.length + ruim.length), `${ok.length} de ${ok.length + ruim.length} ambiente(s) de permanência com ≥ ${minimo} h de sol pelas janelas em 21/06${e.insolacaoMinimaH == null ? ' (mínimo suposto de 1 h; a zona não disse)' : ' (mínimo da zona)'}.`, ruim.map((r) => `${r.rotulo}: ${f1(r.horas)} h`), ruim);
      // Ventilação: ambientes com abertura para fora que cruzam.
      const comAbertura = todosOsNos.filter((x) => x.n.fachadas.some((f) => f.aberturas.length > 0));
      const cruzam = comAbertura.filter((x) => porNivel.get(x.g.levelId)?.find((i) => i.spaceId === x.n.spaceId)?.ventilacao.cruzada);
      if (comAbertura.length === 0) add('ventilacao', null, 'Nenhum ambiente com abertura para fora.');
      else add('ventilacao', pct(cruzam.length, comAbertura.length), `${cruzam.length} de ${comAbertura.length} ambiente(s) com abertura para fora têm aberturas em fachadas não paralelas.`, comAbertura.filter((x) => !cruzam.includes(x)).map((x) => `${x.n.rotulo}: ${porNivel.get(x.g.levelId)?.find((i) => i.spaceId === x.n.spaceId)?.ventilacao.motivo ?? ''}`), comAbertura.filter((x) => !cruzam.includes(x)).map((x) => alvoDoNo(x.g, x.n.spaceId)));
    }
  }

  // 8. Corredores e passagens: circulação com lado menor ≥ 0,90 m; portas ≥ 0,80.
  {
    const itens: { ok: boolean; texto: string; alvo: Indicador['alvos'][number] }[] = [];
    for (const { g, n } of todosOsNos) {
      if (!n.circulacao) continue;
      const s = model.spaces.find((x) => x.id === n.spaceId)!;
      const xs = s.ring.map((p) => p.x);
      const ys = s.ring.map((p) => p.y);
      const menor = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) - 150; // desconta meia parede de cada lado
      itens.push({ ok: menor >= 900, texto: `${n.rotulo}: ${f2(menor / 1000)} m livres`, alvo: alvoDoNo(g, n.spaceId) });
    }
    for (const g of grafos.values()) for (const a of g.arestas) if (a.tipo === 'PORTA') itens.push({ ok: (a.larguraUtilMm ?? 0) >= 800, texto: `porta ${f2(a.comprimentoMm / 1000)} m em ${g.nos.find((n) => n.spaceId === a.de)?.rotulo ?? '—'}`, alvo: { id: a.openingId!, rotulo: `Porta ${f2(a.comprimentoMm / 1000)} m`, levelId: g.levelId } });
    if (itens.length === 0) add('corredores', null, 'Sem circulações nem portas.');
    else add('corredores', pct(itens.filter((i) => i.ok).length, itens.length), `${itens.filter((i) => i.ok).length} de ${itens.length}: circulações com ≥ 0,90 m livres e portas com vão ≥ 0,80 m.`, itens.filter((i) => !i.ok).map((i) => i.texto), itens.filter((i) => !i.ok).map((i) => i.alvo));
  }

  // 9. Adjacências (Σ peso atendido)
  {
    const rel = (e.conferencia?.relacoes ?? []).filter((r) => r.relacao.tipo === 'DESEJAVEL' && r.estado !== 'NAO_AVALIADA');
    const total = rel.reduce((s, r) => s + r.relacao.peso, 0);
    const ok = rel.filter((r) => r.estado === 'CONFORME').reduce((s, r) => s + r.relacao.peso, 0);
    if (total === 0) add('adjacencias', null, e.programa?.relacoes.length ? 'Relações desejáveis sem par avaliável no desenho.' : 'O programa não tem relações desejáveis (matriz de proximidade).');
    else add('adjacencias', pct(ok, total), `Σ peso das relações desejáveis atendidas ${ok} / ${total}.`, rel.filter((r) => r.estado !== 'CONFORME').map((r) => `${r.a.nome} × ${r.b.nome} (peso ${r.relacao.peso}): ${r.valor}`));
  }

  // 10. Privacidade: íntimo não abre porta para serviço nem para a rua; banheiro não abre para cozinha.
  {
    const intimos = todosOsNos.filter((x) => x.n.uso && FICHA_DO_USO[x.n.uso].privacidade === 'INTIMO');
    if (intimos.length === 0) add('privacidade', null, 'Nenhum ambiente íntimo (dormitório, suíte, banheiro) reconhecido pelo nome.');
    else {
      const problemas: { texto: string; alvo: Indicador['alvos'][number] }[] = [];
      for (const { g, n } of intimos) {
        for (const a of g.arestas) {
          if (a.tipo === 'PAREDE' || (a.de !== n.spaceId && a.para !== n.spaceId)) continue;
          const outroId = a.de === n.spaceId ? a.para : a.de;
          if (outroId === null) {
            if (n.uso !== 'BANHEIRO') problemas.push({ texto: `${n.rotulo} abre direto para a rua`, alvo: alvoDoNo(g, n.spaceId) });
            continue;
          }
          const outro = g.nos.find((x) => x.spaceId === outroId);
          if (outro?.uso && FICHA_DO_USO[outro.uso].privacidade === 'SERVICO') problemas.push({ texto: `${n.rotulo} abre para ${outro.rotulo} (serviço)`, alvo: alvoDoNo(g, n.spaceId) });
        }
      }
      const comProblema = new Set(problemas.map((p) => p.alvo.id));
      add('privacidade', pct(intimos.length - comProblema.size, intimos.length), `${intimos.length - comProblema.size} de ${intimos.length} ambiente(s) íntimo(s) sem porta direta para serviço (cozinha, área de serviço, garagem) nem para a rua.`, problemas.map((p) => p.texto), problemas.map((p) => p.alvo));
    }
  }

  // 11. Acessibilidade: rota até a saída com menor vão ≥ 0,80 e circulação ≥ 1,20 m (NBR 9050).
  {
    const itens: { ok: boolean; texto: string; alvo: Indicador['alvos'][number] }[] = [];
    for (const [, g] of grafos) {
      if (g.saidas.length === 0) continue;
      for (const n of g.nos) {
        if (n.circulacao) {
          const s = model.spaces.find((x) => x.id === n.spaceId)!;
          const xs = s.ring.map((p) => p.x);
          const ys = s.ring.map((p) => p.y);
          const menor = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) - 150;
          itens.push({ ok: menor >= 1200, texto: `${n.rotulo}: ${f2(menor / 1000)} m (rota acessível pede 1,20)`, alvo: alvoDoNo(g, n.spaceId) });
        }
      }
      for (const a of g.arestas) if (a.tipo !== 'PAREDE') itens.push({ ok: (a.larguraUtilMm ?? 0) >= 800, texto: `porta ${f2(a.comprimentoMm / 1000)} m (${g.nos.find((x) => x.spaceId === a.de)?.rotulo ?? '—'})`, alvo: { id: a.openingId!, rotulo: `Porta ${f2(a.comprimentoMm / 1000)} m`, levelId: g.levelId } });
    }
    if (itens.length === 0) add('acessibilidade', null, 'Sem saída para o exterior em nenhum pavimento (ou sem portas).');
    else add('acessibilidade', pct(itens.filter((i) => i.ok).length, itens.length), `${itens.filter((i) => i.ok).length} de ${itens.length}: portas com vão ≥ 0,80 m e circulações com ≥ 1,20 m livres (NBR 9050).`, itens.filter((i) => !i.ok).map((i) => i.texto), itens.filter((i) => !i.ok).map((i) => i.alvo));
  }

  // 12. Estrutura: vigas além do vão limite e pilares fora do eixo de parede.
  {
    const estruturas = model.structures ?? [];
    const vigas = estruturas.filter((s) => s.kind === 'VIGA' && s.pontos.length >= 2);
    const pilares = estruturas.filter((s) => s.kind === 'PILAR' && s.pontos.length >= 1);
    if (vigas.length + pilares.length === 0) add('estrutura', null, 'Sem vigas nem pilares lançados.');
    else {
      const problemas: { texto: string; alvo: Indicador['alvos'][number] }[] = [];
      for (const v of vigas) {
        let L = 0;
        for (let i = 1; i < v.pontos.length; i++) L += Math.hypot(v.pontos[i].x - v.pontos[i - 1].x, v.pontos[i].y - v.pontos[i - 1].y);
        if (L > h.vaoMaxDaVigaMm) problemas.push({ texto: `viga ${v.rotulo || v.id} com ${f2(L / 1000)} m (> ${f2(h.vaoMaxDaVigaMm / 1000)})`, alvo: { id: v.id, rotulo: `Viga ${v.rotulo || ''}`.trim(), levelId: v.levelId } });
      }
      const distAoEixo = (p: Point, levelId: ObjectId) => {
        let melhor = Infinity;
        for (const w of paredesDoNivel(levelId)) {
          const L = wallLength(w) || 1;
          const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) / (L * L)));
          melhor = Math.min(melhor, Math.hypot(p.x - (w.a.x + t * (w.b.x - w.a.x)), p.y - (w.a.y + t * (w.b.y - w.a.y))));
        }
        return melhor;
      };
      for (const p of pilares) {
        const d = distAoEixo(p.pontos[0], p.levelId);
        if (Number.isFinite(d) && d > 100) problemas.push({ texto: `pilar ${p.rotulo || p.id} a ${f2(d / 1000)} m do eixo de parede mais próximo`, alvo: { id: p.id, rotulo: `Pilar ${p.rotulo || ''}`.trim(), levelId: p.levelId } });
      }
      add('estrutura', pct(vigas.length + pilares.length - problemas.length, vigas.length + pilares.length), `${vigas.length} viga(s) e ${pilares.length} pilar(es); ${problemas.length} com aviso: vão > ${f2(h.vaoMaxDaVigaMm / 1000)} m ou pilar a mais de 0,10 m de um eixo de parede.`, problemas.map((p) => p.texto), problemas.map((p) => p.alvo));
    }
  }

  // 13. Modulação: comprimentos de parede múltiplos do módulo.
  {
    const paredes = model.walls;
    if (paredes.length === 0) add('modulacao', null, 'Sem paredes.');
    else {
      const fora = paredes.filter((w) => {
        const L = Math.round(wallLength(w));
        const r = L % h.moduloMm;
        return Math.min(r, h.moduloMm - r) > 5;
      });
      add('modulacao', pct(paredes.length - fora.length, paredes.length), `${paredes.length - fora.length} de ${paredes.length} parede(s) com comprimento múltiplo de ${h.moduloMm} mm (±5).`, fora.slice(0, 6).map((w) => `parede de ${f2(wallLength(w) / 1000)} m`), fora.map((w) => ({ id: w.id, rotulo: `Parede ${f2(wallLength(w) / 1000)} m`, levelId: w.levelId })));
    }
  }

  // 14. Custo por m²
  {
    if (e.custoTotalBRL == null || areaConstruida === 0) add('custo', null, e.custoTotalBRL == null ? 'Sem prévia de orçamento (Analisar › Orçamento › Prever).' : 'Sem área construída.');
    else if (h.referenciaM2BRL == null) add('custo', null, `Custo previsto ${(e.custoTotalBRL / areaConstruida).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/m² — informe o custo/m² de referência para pontuar.`);
    else {
      const m2 = e.custoTotalBRL / areaConstruida;
      add('custo', regua(m2 / h.referenciaM2BRL, 0.8, 1.4), `${m2.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/m² contra a referência de ${h.referenciaM2BRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/m² (${f1((100 * m2) / h.referenciaM2BRL)} %). Régua: 80 % → 100, 140 % → 0.`);
    }
  }

  // 15. Paredes por m²
  {
    const metros = model.walls.reduce((s, w) => s + wallLength(w), 0) / 1000;
    if (areaConstruida === 0 || metros === 0) add('paredes', null, 'Sem paredes ou sem área construída.');
    else {
      const idx = metros / areaConstruida;
      add('paredes', regua(idx, 0.6, 1.4), `${f2(metros)} m de parede / ${f2(areaConstruida)} m² = ${f2(idx)} m/m². Régua: 0,6 → 100, 1,4 → 0.`);
    }
  }

  // 16. Fachada: quem exige (sala, dormitório, suíte, escritório) tem fachada com janela.
  {
    const exigem = todosOsNos.filter((x) => x.n.uso && FICHA_DO_USO[x.n.uso].exigeFachada);
    if (exigem.length === 0) add('fachada', null, 'Nenhum ambiente que exija fachada reconhecido pelo nome.');
    else {
      const sem = exigem.filter((x) => !x.n.fachadas.some((f) => f.aberturas.some((a) => a.kind === 'window')));
      add('fachada', pct(exigem.length - sem.length, exigem.length), `${exigem.length - sem.length} de ${exigem.length} ambiente(s) que exigem fachada têm janela num lado externo.`, sem.map((x) => `${x.n.rotulo}: ${x.n.fachadas.length ? 'fachada sem janela' : 'sem fachada'}`), sem.map((x) => alvoDoNo(x.g, x.n.spaceId)));
    }
  }

  // 17. Shafts: ambientes molhados a até `raio` de um shaft (só faz sentido com mais de um pavimento).
  {
    const molhados = todosOsNos.filter((x) => x.n.uso === 'BANHEIRO' || x.n.uso === 'LAVABO' || x.n.uso === 'COZINHA' || x.n.uso === 'AREA_DE_SERVICO');
    const shafts = (model.nucleos ?? []).filter((n) => n.tipo === 'SHAFT');
    if (model.levels.length <= 1) add('shafts', null, 'Um pavimento só: prumadas não precisam de shaft.');
    else if (molhados.length === 0) add('shafts', null, 'Nenhum ambiente molhado reconhecido pelo nome.');
    else {
      const centroDe = (anel: Point[]) => ({ x: anel.reduce((s, p) => s + p.x, 0) / anel.length, y: anel.reduce((s, p) => s + p.y, 0) / anel.length });
      const longe = molhados.filter((x) => !shafts.some((sh) => Math.hypot(centroDe(sh.ring).x - x.n.centro.x, centroDe(sh.ring).y - x.n.centro.y) <= h.raioDoShaftMm));
      add('shafts', pct(molhados.length - longe.length, molhados.length), `${molhados.length - longe.length} de ${molhados.length} ambiente(s) molhado(s) a até ${f2(h.raioDoShaftMm / 1000)} m de um shaft (${shafts.length} shaft(s)).`, longe.map((x) => `${x.n.rotulo} (${nomeDoNivel(x.g.levelId)})`), longe.map((x) => alvoDoNo(x.g, x.n.spaceId)));
    }
  }

  // 18. Eficiência hidráulica: metros de rede por ponto.
  {
    const trechos = (model.trechos ?? []).filter((t) => t.disciplina !== 'ELETRICA');
    const pontos = (model.terminais ?? []).filter((t) => t.tipoHidraulico);
    if (trechos.length === 0 || pontos.length === 0) add('hidraulica', null, trechos.length === 0 ? 'Sem rede hidráulica lançada.' : 'Sem pontos hidráulicos classificados.');
    else {
      const metros = trechos.reduce((s, t) => s + Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y, (t.cotaBMm ?? 0) - (t.cotaAMm ?? 0)), 0) / 1000;
      const idx = metros / pontos.length;
      add('hidraulica', regua(idx, 3, 12), `${f2(metros)} m de rede (água e esgoto) / ${pontos.length} ponto(s) = ${f2(idx)} m/ponto. Régua: 3 → 100, 12 → 0.`);
    }
  }

  const avaliados = indicadores.filter((i) => i.nota != null && i.peso > 0);
  const somaPesos = avaliados.reduce((s, i) => s + i.peso, 0);
  const notaGeral = somaPesos > 0 ? Math.round(avaliados.reduce((s, i) => s + i.nota! * i.peso, 0) / somaPesos) : null;
  return {
    indicadores,
    notaGeral,
    avaliados: avaliados.length,
    naoAvaliados: indicadores.length - indicadores.filter((i) => i.nota != null).length,
    piores: [...avaliados].sort((a, b) => a.nota! - b.nota!).slice(0, 3),
  };
}

/** Sanitiza as hipóteses gravadas (pesos 0–10, números positivos). */
export function hipotesesDaAvaliacaoDaColuna(raw: unknown): HipotesesDaAvaliacao {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pesosRaw = (r.pesos && typeof r.pesos === 'object' ? r.pesos : {}) as Record<string, unknown>;
  const pesos = { ...PESOS_PADRAO };
  for (const k of CHAVES_DOS_INDICADORES) {
    const v = pesosRaw[k];
    if (typeof v === 'number' && Number.isFinite(v)) pesos[k] = Math.max(0, Math.min(10, Math.round(v)));
  }
  const num = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : padrao);
  const P = HIPOTESES_DA_AVALIACAO_PADRAO;
  return {
    pesos,
    referenciaM2BRL: typeof r.referenciaM2BRL === 'number' && r.referenciaM2BRL > 0 ? r.referenciaM2BRL : null,
    vaoMaxDaVigaMm: num(r.vaoMaxDaVigaMm, P.vaoMaxDaVigaMm),
    moduloMm: num(r.moduloMm, P.moduloMm),
    raioDoShaftMm: num(r.raioDoShaftMm, P.raioDoShaftMm),
  };
}

export function corDaNota(nota: number | null): 'verde' | 'ambar' | 'vermelho' | 'cinza' {
  if (nota == null) return 'cinza';
  return nota >= 75 ? 'verde' : nota >= 50 ? 'ambar' : 'vermelho';
}

/**
 * CLIMATIZAÇÃO E8.2 (07/10/2026): o ISOMÉTRICO da climatização e os DETALHES
 * TÍPICOS da folha de detalhes.
 *
 * O isométrico é o do incêndio (`isometricoDeIncendio`): a REDE INTEIRA, todos
 * os pavimentos — linha frigorígena, dreno e dutos — na mesma projeção e com o
 * mesmo desenho (`desenharIsometrico`), cada segmento com o rótulo da
 * disciplina (Ø líquido/sucção, DN, Ø ou L×A) e cada peça com o número do
 * desenho (EV-1, CD-1, DF-3).
 *
 * Os detalhes saem SÓ do que o desenho tem: a instalação da evaporadora
 * (parede, linha e dreno), o suporte da condensadora, o dreno com sifão e a
 * ligação do difusor (caixa plenum e duto). São "detalhe típico, sem escala" —
 * as medidas são do fabricante e da boa prática — CONFERIR.
 */
import type { BlueprintModel, TipoDePontoHidraulico } from './blueprintKernel';
import { TIPOS_DE_CLIMATIZACAO, TIPOS_DE_CONDENSADORA, conexoesDerivadas } from './blueprintKernel';
import type { Desenhista } from './blueprintExport';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';
import { COR_DA_DISCIPLINA } from './blueprintRede';
import { numeracaoDeClimatizacao } from './blueprintNumeracaoClimatizacao';
import { DISCIPLINAS_DA_CLIMATIZACAO, rotuloDoTrechoDeClimatizacao } from './blueprintPranchaClimatizacao';
import { ROTULO_DA_REDE, type IsometricoDePrancha } from './blueprintIsometricoPrancha';

/** O isométrico da climatização INTEIRA (todos os pavimentos). `null` sem trecho de linha, dreno ou duto. */
export function isometricoDeClimatizacao(model: BlueprintModel): IsometricoDePrancha | null {
  const trechos = (model.trechos ?? []).filter((t) => DISCIPLINAS_DA_CLIMATIZACAO.includes(t.disciplina));
  if (trechos.length === 0) return null;
  const elevacao = new Map(model.levels.map((l) => [l.id, l.elevationMm]));
  const segmentos: IsometricoDePrancha['segmentos'] = trechos.map((t) => {
    const z0 = elevacao.get(t.levelId) ?? 0;
    return { trechoId: t.id, disciplina: t.disciplina, bitolaMm: t.bitolaMm, a: { x: t.a.x, y: t.a.y, z: z0 + t.cotaAMm }, b: { x: t.b.x, y: t.b.y, z: z0 + t.cotaBMm }, rotulo: rotuloDoTrechoDeClimatizacao(t) };
  });
  const pecas = (model.terminais ?? []).filter((t) => t.tipoHidraulico && (TIPOS_DE_CLIMATIZACAO as readonly string[]).includes(t.tipoHidraulico));
  const numeros = numeracaoDeClimatizacao(model);
  const ids = new Set(trechos.map((t) => t.id));
  const nos: IsometricoDePrancha['nos'] = conexoesDerivadas(model)
    .conexoes.filter((c) => DISCIPLINAS_DA_CLIMATIZACAO.includes(c.disciplina) && c.trechoIds.some((id) => ids.has(id)))
    .flatMap((c) => {
      // O z vem da PONTA do tubo (o nó da laje leva o levelId de baixo) — a regra do isométrico do incêndio.
      const estimado = (elevacao.get(c.levelId) ?? 0) + c.cotaMm;
      const pontas = segmentos
        .filter((s) => c.trechoIds.includes(s.trechoId))
        .flatMap((s) => [s.a, s.b])
        .filter((q) => Math.hypot(q.x - c.no.x, q.y - c.no.y) < 1)
        .sort((q, r) => Math.abs(q.z - estimado) - Math.abs(r.z - estimado));
      return pontas.length ? [{ p: { ...pontas[0] }, disciplina: c.disciplina, tipo: c.tipo }] : [];
    });
  const xs = segmentos.flatMap((s) => [s.a.x, s.b.x]);
  const ys = segmentos.flatMap((s) => [s.a.y, s.b.y]);
  const niveis = [...model.levels].sort((a, b) => a.elevationMm - b.elevationMm);
  const primeiro = niveis.find((l) => trechos.some((t) => t.levelId === l.id)) ?? niveis[0];
  return {
    chave: 'CLIMATIZACAO',
    titulo: `${ROTULO_DA_REDE.CLIMATIZACAO} — linha, dreno e dutos`,
    rede: 'CLIMATIZACAO',
    levelId: primeiro.id,
    recorte: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) },
    segmentos,
    pontos: pecas.map((t) => ({
      terminalId: t.id,
      sigla: numeros.get(t.id)?.numero ?? FICHA_DO_PONTO_HIDRAULICO[t.tipoHidraulico!].sigla,
      cotaMm: t.cotaMm,
      p: { x: t.at.x, y: t.at.y, z: (elevacao.get(t.levelId) ?? 0) + t.cotaMm },
      disciplina: t.disciplina,
    })),
    nos,
  };
}

// ─── Detalhes típicos ────────────────────────────────────────────────────────

export type DetalheDeClimatizacao = 'EVAPORADORA' | 'CONDENSADORA' | 'DRENO_COM_SIFAO' | 'DIFUSOR';

export const ROTULO_DO_DETALHE: Record<DetalheDeClimatizacao, string> = {
  EVAPORADORA: 'Instalação da evaporadora (parede, linha e dreno)',
  CONDENSADORA: 'Suporte da condensadora',
  DRENO_COM_SIFAO: 'Dreno de condensado com sifão',
  DIFUSOR: 'Ligação do difusor (plenum e duto)',
};

const COR = '#000000';
const COR_FRACA = '#555555';
const TEXTO_MM = 1.8;
const FINA = 0.18;
const MEDIA = 0.35;

const tem = (model: BlueprintModel, tipos: readonly string[]) => (model.terminais ?? []).some((t) => !!t.tipoHidraulico && tipos.includes(t.tipoHidraulico));

/** Os detalhes que o desenho pede, na ordem da folha — só o que existe. */
export function detalhesDeClimatizacao(model: BlueprintModel): DetalheDeClimatizacao[] {
  const d: DetalheDeClimatizacao[] = [];
  if (tem(model, ['EVAPORADORA_HI_WALL', 'EVAPORADORA_PISO_TETO', 'EVAPORADORA_CASSETE', 'EVAPORADORA_DUTADA'])) d.push('EVAPORADORA');
  if (tem(model, TIPOS_DE_CONDENSADORA)) d.push('CONDENSADORA');
  if ((model.trechos ?? []).some((t) => t.disciplina === 'DRENO_AC') || tem(model, ['PONTO_DRENO', 'BOMBA_DRENO'])) d.push('DRENO_COM_SIFAO');
  if (tem(model, ['DIFUSOR', 'CAIXA_PLENUM'])) d.push('DIFUSOR');
  return d;
}

function caixa(d: Desenhista, x: number, y: number, w: number, h: number, titulo: string): void {
  d.retangulo(x, y, w, h, { espessuraMm: FINA, cor: COR_FRACA });
  d.texto(x + 2, y + 4, titulo, 2.2, COR);
  d.texto(x + 2, y + 7, 'Detalhe típico, sem escala — medidas: CONFERIR com o fabricante', TEXTO_MM * 0.85, COR_FRACA);
}

function lista(d: Desenhista, x: number, y: number, linhas: string[]): void {
  linhas.forEach((l, i) => d.texto(x, y + i * 3.2, l, TEXTO_MM, COR));
}

/** O maior valor declarado (capacidade) entre as peças de um tipo — para o texto do detalhe dizer o porte. */
const maiorCapacidade = (model: BlueprintModel, tipos: readonly TipoDePontoHidraulico[]) =>
  Math.max(0, ...(model.terminais ?? []).filter((t) => t.tipoHidraulico && tipos.includes(t.tipoHidraulico)).map((t) => t.capacidadeBtuH ?? 0));

/** A evaporadora na parede, em corte: a peça, a linha saindo por trás, o dreno descendo com caimento. */
export function desenharDetalheDaEvaporadora(d: Desenhista, x: number, y: number, w: number, h: number): void {
  caixa(d, x, y, w, h, ROTULO_DO_DETALHE.EVAPORADORA);
  const cx = x + w * 0.35;
  const top = y + 14;
  const base = y + h - 8;
  // A parede (hachura simples) e a evaporadora encostada.
  d.retangulo(cx - 2, top, 2, base - top, { espessuraMm: MEDIA, cor: COR });
  d.retangulo(cx, top + 4, w * 0.28, 8, { espessuraMm: MEDIA, cor: COR_DA_DISCIPLINA.FRIGORIGENA });
  d.texto(cx + 1, top + 9, 'Evaporadora', TEXTO_MM, COR);
  // A linha (par isolado) atravessa a parede para fora.
  d.linha(cx, top + 6, cx - 14, top + 6, { espessuraMm: MEDIA, cor: COR_DA_DISCIPLINA.FRIGORIGENA });
  d.linha(cx, top + 7.5, cx - 14, top + 7.5, { espessuraMm: MEDIA, cor: COR_DA_DISCIPLINA.FRIGORIGENA });
  // O dreno desce com caimento.
  d.linha(cx + 2, top + 12, cx + 2, base - 6, { espessuraMm: FINA, cor: COR_DA_DISCIPLINA.DRENO_AC });
  lista(d, x + w * 0.66, top + 2, ['Altura usual: 2,20 m do piso', 'Folga lateral e superior: ver fabricante', 'Linha: par de cobre isolado', 'Dreno: caimento contínuo ≥ 1 %', 'Ponto de força junto da peça']);
}

/** O suporte da condensadora na fachada (mão-francesa) e a folga para o ar. */
export function desenharDetalheDaCondensadora(d: Desenhista, model: BlueprintModel, x: number, y: number, w: number, h: number): void {
  caixa(d, x, y, w, h, ROTULO_DO_DETALHE.CONDENSADORA);
  const px = x + 10;
  const top = y + 16;
  d.retangulo(px, top, 2, h - 24, { espessuraMm: MEDIA, cor: COR });
  // Mão-francesa e a condensadora sobre ela.
  d.linha(px + 2, top + 18, px + 22, top + 18, { espessuraMm: MEDIA, cor: COR });
  d.linha(px + 2, top + 30, px + 22, top + 18, { espessuraMm: MEDIA, cor: COR });
  d.retangulo(px + 4, top + 6, 16, 12, { espessuraMm: MEDIA, cor: COR_DA_DISCIPLINA.FRIGORIGENA });
  d.texto(px + 5, top + 13, 'Condensadora', TEXTO_MM, COR);
  const cap = maiorCapacidade(model, TIPOS_DE_CONDENSADORA);
  lista(d, px + 28, top + 2, [
    `Maior unidade do desenho: ${cap > 0 ? `${cap.toLocaleString('pt-BR')} BTU/h` : 'capacidade não declarada'}`,
    'Suporte: mão-francesa em aço galvanizado',
    'Coxins de borracha sob os pés',
    'Folga de ar atrás e dos lados: ver fabricante',
    'Acesso para manutenção',
  ]);
}

/** O dreno com sifão: a saída da evaporadora, o sifão e o caimento até o descarte. */
export function desenharDetalheDoDreno(d: Desenhista, x: number, y: number, w: number, h: number): void {
  caixa(d, x, y, w, h, ROTULO_DO_DETALHE.DRENO_COM_SIFAO);
  const c = COR_DA_DISCIPLINA.DRENO_AC;
  const x0 = x + 8;
  const y0 = y + 18;
  d.linha(x0, y0, x0, y0 + 10, { espessuraMm: MEDIA, cor: c });
  // O "U" do sifão.
  d.linha(x0, y0 + 10, x0 + 3, y0 + 14, { espessuraMm: MEDIA, cor: c });
  d.linha(x0 + 3, y0 + 14, x0 + 6, y0 + 10, { espessuraMm: MEDIA, cor: c });
  d.linha(x0 + 6, y0 + 10, x0 + 6, y0 + 7, { espessuraMm: MEDIA, cor: c });
  // E o caimento até o descarte.
  d.linha(x0 + 6, y0 + 7, x0 + w * 0.5, y0 + 12, { espessuraMm: MEDIA, cor: c });
  d.texto(x0 + 8, y0 + 4, 'Sifão (fecho hídrico)', TEXTO_MM, COR);
  lista(d, x + w * 0.58, y0, ['Caimento ≥ 1 % até o descarte', 'Sifão junto da evaporadora', 'Sem trecho em contrapendente', 'Descarte: ralo, caixa ou bomba de dreno']);
}

/** O difusor no forro: a caixa plenum, o duto flexível e o colarinho no duto principal. */
export function desenharDetalheDoDifusor(d: Desenhista, x: number, y: number, w: number, h: number): void {
  caixa(d, x, y, w, h, ROTULO_DO_DETALHE.DIFUSOR);
  const c = COR_DA_DISCIPLINA.MECANICA;
  const x0 = x + 8;
  const y0 = y + 14;
  d.retangulo(x0, y0, w * 0.45, 5, { espessuraMm: MEDIA, cor: c });
  d.texto(x0 + 1, y0 + 3.6, 'Duto principal', TEXTO_MM, COR);
  d.linha(x0 + w * 0.2, y0 + 5, x0 + w * 0.2, y0 + 14, { espessuraMm: MEDIA, cor: c });
  d.retangulo(x0 + w * 0.12, y0 + 14, w * 0.16, 5, { espessuraMm: MEDIA, cor: c });
  d.texto(x0 + w * 0.12, y0 + 22, 'Plenum + difusor', TEXTO_MM, COR);
  d.linha(x0 - 2, y0 + 19.5, x0 + w * 0.5, y0 + 19.5, { espessuraMm: FINA, cor: COR_FRACA });
  d.texto(x0 + w * 0.32, y0 + 18.8, 'Forro', TEXTO_MM, COR_FRACA);
  lista(d, x + w * 0.6, y0, ['Colarinho com damper de regulagem', 'Duto flexível curto e esticado', 'Plenum isolado', 'Vazão do terminal: folha da rede de ar']);
}

/** Os detalhes típicos numa faixa do papel, lado a lado. Devolve quantos desenhou. */
export function desenharDetalhesDeClimatizacao(d: Desenhista, model: BlueprintModel, x: number, y: number, w: number, h: number): number {
  const dets = detalhesDeClimatizacao(model);
  if (!dets.length) return 0;
  const GAP = 3;
  const cw = (w - GAP * (dets.length - 1)) / dets.length;
  dets.forEach((det, i) => {
    const xi = x + i * (cw + GAP);
    if (det === 'EVAPORADORA') desenharDetalheDaEvaporadora(d, xi, y, cw, h);
    else if (det === 'CONDENSADORA') desenharDetalheDaCondensadora(d, model, xi, y, cw, h);
    else if (det === 'DRENO_COM_SIFAO') desenharDetalheDoDreno(d, xi, y, cw, h);
    else desenharDetalheDoDifusor(d, xi, y, cw, h);
  });
  return dets.length;
}

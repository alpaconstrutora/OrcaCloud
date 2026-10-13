/**
 * VER O CORTE NO 3D (13/10/2026) — plano docs/planos/2026-10-13-corte-no-3d.md.
 *
 * O 3D só tinha a caixa de corte, alinhada a leste–oeste e norte–sul e sem
 * ligação com a linha de corte desenhada: um corte inclinado não se reproduzia,
 * e quem queria ver o "Corte A" em volume posicionava o controle no olho.
 *
 * Aqui o corte vira duas coisas para o 3D, no ESPAÇO DO DESENHO (metro, `X = x`,
 * `Y = cota`, `Z = +y` — o viewer leva ao mundo, ver `blueprint3dEspelho`):
 *
 * - o PLANO de recorte: fica o que está ATRÁS da linha (`(p − a)·d ≥ 0`, o mesmo
 *   lado que `classificarNoCorte` chama de `ATRAS`), que é o que o corte 2D mostra;
 * - o PONTO DE VISTA: a câmera na frente do plano, olhando para a face cortada à
 *   distância que enquadra a largura e a altura do desenho do corte — um pouco de
 *   LADO e de CIMA (`GIRO_GRAUS`, `ELEVACAO_GRAUS`): de frente, em perspectiva, o
 *   corte inteiro vira um plano cinza só, e a profundidade some (visto no harness).
 */
import type { BlueprintModel, Corte } from './blueprintKernel';
import { baseDoCorte, projetarCorte, type TerrenoParaCorte } from './blueprintCorte';
import { fovVerticalGraus } from './blueprintCamera';

export interface CorteNo3d {
  /** Muda quando a linha, o lado ou o enquadramento mudam — o viewer reposiciona a câmera por ela. */
  chave: string;
  rotulo: string;
  /** Mantém `normal·p + constante ≥ 0` (espaço do desenho, metro). */
  plano: { normal: [number, number, number]; constante: number };
  pontoDeVista: { chave: string; posicao: [number, number, number]; alvo: [number, number, number]; focalMm: number };
}

/** Meia largura do filme de 35 mm — o `fovVerticalGraus` fixa a abertura HORIZONTAL nela. */
const MEIA_LARGURA_35 = 18;
/** Quanto a câmera sai do eixo do corte (para a direita de quem olha) e quanto sobe. */
export const GIRO_GRAUS = 25;
export const ELEVACAO_GRAUS = 18;

export function corteNo3d(
  model: BlueprintModel,
  corte: Corte,
  opcoes: { terreno?: TerrenoParaCorte | null; focalMm?: number; aspecto?: number; levelIds?: string[] } = {},
): CorteNo3d {
  const focalMm = opcoes.focalMm ?? 35;
  // Tela larga (2:1): a abertura horizontal é fixa na lente, então é numa tela larga e baixa
  // que a ALTURA aperta — contando com ela, o corte cabe em qualquer janela comum.
  const aspecto = opcoes.aspecto ?? 2;
  const base = baseDoCorte(corte);
  const fa = corte.a.x * base.d.x + corte.a.y * base.d.y;

  const proj = projetarCorte(model, { corte, levelIds: opcoes.levelIds, terreno: opcoes.terreno ?? null });
  // A caixa do desenho do corte; sem nada atrás do plano, a própria linha e um pé-direito.
  const ua = corte.a.x * base.u.x + corte.a.y * base.u.y;
  const ub = corte.b.x * base.u.x + corte.b.y * base.u.y;
  const vazia = !(proj.bbox.uMax > proj.bbox.uMin) || !(proj.bbox.vMax > proj.bbox.vMin);
  const uMin = vazia ? Math.min(ua, ub) : proj.bbox.uMin;
  const uMax = vazia ? Math.max(ua, ub) : proj.bbox.uMax;
  const vMin = vazia ? 0 : proj.bbox.vMin;
  const vMax = vazia ? 3000 : proj.bbox.vMax;
  const uC = (uMin + uMax) / 2;
  const vC = (vMin + vMax) / 2;
  const largura = (uMax - uMin) / 1000;
  const altura = (vMax - vMin) / 1000;

  const meiaH = Math.atan(MEIA_LARGURA_35 / focalMm);
  const meiaV = (fovVerticalGraus(focalMm, aspecto) * Math.PI) / 360;
  const distancia = Math.max(3, Math.max(largura / 2 / Math.tan(meiaH), altura / 2 / Math.tan(meiaV)) * 1.15);

  // O alvo: o meio do desenho do corte, NO plano. O olho: recuado contra a direção do olhar,
  // girado para a direita de quem olha e erguido — a face cortada continua de frente o bastante
  // para ler, e as paredes que vão para o fundo aparecem em profundidade.
  const ax = uC * base.u.x + fa * base.d.x;
  const ay = uC * base.u.y + fa * base.d.y;
  const alvo: [number, number, number] = [ax / 1000, vC / 1000, ay / 1000];
  const giro = (GIRO_GRAUS * Math.PI) / 180;
  const ergue = (ELEVACAO_GRAUS * Math.PI) / 180;
  const noChao = distancia * Math.cos(ergue);
  const recua = noChao * Math.cos(giro);
  const ladeia = noChao * Math.sin(giro);
  const posicao: [number, number, number] = [
    alvo[0] - base.d.x * recua + base.u.x * ladeia,
    alvo[1] + distancia * Math.sin(ergue),
    alvo[2] - base.d.y * recua + base.u.y * ladeia,
  ];

  const chave = `corte:${corte.id}:${corte.a.x},${corte.a.y}:${corte.b.x},${corte.b.y}:${corte.olharPara}:${uMin},${uMax},${vMin},${vMax}`;
  return {
    chave,
    rotulo: `Corte ${corte.rotulo}`,
    plano: { normal: [base.d.x, 0, base.d.y], constante: -fa / 1000 },
    pontoDeVista: { chave, posicao, alvo, focalMm },
  };
}

/**
 * E4.2 — AS PEÇAS DA CAIXA D'ÁGUA (29/09/2026, roadmap hidrossanitário).
 *
 * Com a caixa desenhada, o que ela precisa para funcionar e que o projeto tem
 * de mostrar (NBR 5626):
 *  - TORNEIRA DE BOIA — a entrada, no alto, a 10 cm do topo;
 *  - EXTRAVASOR ("ladrão") — saída um pouco abaixo da boia, com DN MAIOR que o
 *    da alimentação, descarregando em lugar visível: por isso a ponta de fora
 *    é aberta de propósito;
 *  - LIMPEZA — saída no fundo, com registro de gaveta, descarregando livre.
 *
 * Tudo como SUGERIDO (tracejado até aceitar), num lote só — um Ctrl+Z. O
 * lado é o +x da caixa (girado com ela); a forma cilíndrica usa o raio.
 * Idempotente: o que já existe perto da caixa não é lançado de novo.
 *
 * Extravasor e limpeza são trechos de água fria com RÓTULO próprio; a
 * verificação da rede não os acusa de ponta aberta, e eles não entram na rede
 * que a caixa distribui (não tocam o nó da caixa).
 */
import type { BlueprintModel, Command, Terminal } from './blueprintKernel';
import { FICHA_DO_MATERIAL } from './blueprintHidraulicaPressao';
import { FICHA_DO_PONTO_HIDRAULICO } from './blueprintHidraulica';

export const ROTULO_DO_EXTRAVASOR = 'Extravasor';
export const ROTULO_DA_LIMPEZA = 'Limpeza';
/** Os trechos cuja ponta de fora é aberta DE PROPÓSITO (descarga livre). */
export const ROTULOS_DE_DESCARGA_LIVRE = new Set([ROTULO_DO_EXTRAVASOR, ROTULO_DA_LIMPEZA, 'Ventilação']);

/** Quanto o extravasor e a limpeza saem da parede da caixa, mm. */
const SAIDA_MM = 600;

export interface PlanoDasPecasDaCaixa {
  comandos: Command[];
  /** O que já havia (e por isso não sai de novo). */
  existentes: { boia: boolean; extravasor: boolean; limpeza: boolean };
  dnExtravasorMm: number;
  dnLimpezaMm: number;
  /** O que o plano lança, em palavras ("torneira de boia, extravasor DN 32…"). */
  resumo: string[];
}

/** O DN comercial de PVC imediatamente acima do da alimentação. */
export function dnDoExtravasor(dnAlimentacaoMm: number): number {
  const serie = FICHA_DO_MATERIAL.PVC_SOLDAVEL.diametros.map((d) => d.dn);
  return serie.find((dn) => dn > dnAlimentacaoMm) ?? serie[serie.length - 1];
}

export function planejarPecasDaCaixa(model: BlueprintModel, caixa: Terminal, dnAlimentacaoMm = 25): PlanoDasPecasDaCaixa {
  const ficha = FICHA_DO_PONTO_HIDRAULICO.RESERVATORIO.medidasMm!;
  const cilindro = caixa.formaReservatorio === 'CILINDRO';
  const largura = caixa.larguraMm ?? ficha.larguraMm;
  const profundidade = cilindro ? largura : (caixa.profundidadeMm ?? ficha.profundidadeMm);
  const altura = caixa.alturaMm ?? ficha.alturaMm;
  const fundo = caixa.cotaMm;
  // O eixo local da caixa (girado com ela): u = "+x", v = "+y".
  const rad = ((caixa.rotacaoGraus ?? 0) * Math.PI) / 180;
  const u = { x: Math.cos(rad), y: Math.sin(rad) };
  const v = { x: -Math.sin(rad), y: Math.cos(rad) };
  const ponto = (du: number, dv: number) => ({ x: Math.round(caixa.at.x + u.x * du + v.x * dv), y: Math.round(caixa.at.y + u.y * du + v.y * dv) });
  const meia = largura / 2;
  const deslocamento = Math.min(profundidade / 4, 150);

  const perto = (p: { x: number; y: number }, raio: number) => Math.hypot(p.x - caixa.at.x, p.y - caixa.at.y) <= raio;
  const alcance = Math.max(largura, profundidade) / 2 + 100;
  const boia = (model.terminais ?? []).some((t) => t.levelId === caixa.levelId && t.tipoHidraulico === 'TORNEIRA_BOIA' && perto(t.at, alcance));
  const trechoPerto = (rotulo: string) =>
    (model.trechos ?? []).some((t) => t.levelId === caixa.levelId && t.rotulo === rotulo && (perto(t.a, alcance + 50) || perto(t.b, alcance + 50)));
  const extravasor = trechoPerto(ROTULO_DO_EXTRAVASOR);
  const limpeza = trechoPerto(ROTULO_DA_LIMPEZA);

  const dnExtravasorMm = dnDoExtravasor(dnAlimentacaoMm);
  const dnLimpezaMm = dnExtravasorMm;
  const comandos: Command[] = [];
  const resumo: string[] = [];
  if (!boia) {
    const at = ponto(-meia + 150, 0);
    comandos.push({ type: 'AddTerminal', levelId: caixa.levelId, disciplina: 'AGUA_FRIA', tipo: 'Torneira de boia', at, cotaMm: fundo + altura - 100, tipoHidraulico: 'TORNEIRA_BOIA', sugerida: true });
    resumo.push('torneira de boia');
  }
  if (!extravasor) {
    const cota = fundo + altura - 200;
    comandos.push({
      type: 'AddTrecho', levelId: caixa.levelId, disciplina: 'AGUA_FRIA',
      a: ponto(meia, -deslocamento), b: ponto(meia + SAIDA_MM, -deslocamento),
      cotaAMm: cota, cotaBMm: cota, bitolaMm: dnExtravasorMm, rotulo: ROTULO_DO_EXTRAVASOR, sugerido: true,
    });
    resumo.push(`extravasor DN ${dnExtravasorMm}`);
  }
  if (!limpeza) {
    comandos.push({
      type: 'AddTrecho', levelId: caixa.levelId, disciplina: 'AGUA_FRIA',
      a: ponto(meia, deslocamento), b: ponto(meia + SAIDA_MM, deslocamento),
      cotaAMm: fundo, cotaBMm: fundo, bitolaMm: dnLimpezaMm, rotulo: ROTULO_DA_LIMPEZA, sugerido: true,
    });
    comandos.push({ type: 'AddTerminal', levelId: caixa.levelId, disciplina: 'AGUA_FRIA', tipo: 'Registro de gaveta', at: ponto(meia + SAIDA_MM / 2, deslocamento), cotaMm: fundo, tipoHidraulico: 'REGISTRO_GAVETA', sugerida: true });
    resumo.push(`limpeza DN ${dnLimpezaMm} com registro`);
  }
  return { comandos, existentes: { boia, extravasor, limpeza }, dnExtravasorMm, dnLimpezaMm, resumo };
}

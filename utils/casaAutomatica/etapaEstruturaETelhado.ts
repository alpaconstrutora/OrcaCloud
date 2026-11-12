/**
 * Casa automática — etapa(s) `etapaEstrutural`, `etapaDoTelhado` de `planejarComPavimentos`, extraída(s) com o
 * `ContextoDaCasa` (P2, 12/11/2026). O marco das 8 casas prova que o motor gera o mesmo.
 */
import type { BlueprintModel, Command, ObjectId, CamadaParede } from '../blueprintKernel';
import { HIPOTESES_DO_GERADOR_PADRAO } from '../blueprintGerador';
import type { Retangulo } from '../blueprintGerador';
import { comandosDoTelhado } from '../blueprintTelhadoAutomatico';
import { ROTULO_DA_ETAPA_DA_CASA } from './hipoteses';
import type { EtapaDaCasaId } from './hipoteses';
import type { ContextoDaCasa } from './contexto';

export function etapaEstrutural<P extends { comandos: Command[]; motivo: string | null; avisos?: string[] }>(ctx: ContextoDaCasa, id: Exclude<EtapaDaCasaId, 'IMPLANTACAO' | 'ARQUITETURA' | 'CONFERENCIA'>, planejar: (modelo: BlueprintModel) => P, contar: (plano: P) => { nota: string; foraDoPlano?: string[] }) {
  const { aplicar, etapa, hip, pendencias } = ctx;
  if (!hip.estrutura.lancar) {
    etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_EXIGIDA', 0, 'desligada nas hipóteses da casa');
    return;
  }
  try {
    const plano = planejar(ctx.m);
    if (!plano.comandos.length) {
      // Sem nada a lançar: o motivo (recusa) ou, não havendo, o aviso diz por quê (paredes oblíquas, nos eixos).
      etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], plano.motivo ? 'NAO_RODOU' : 'NADA_A_FAZER', 0, plano.motivo ?? (plano.avisos?.length ? plano.avisos.join('; ') : null));
      if (plano.motivo) pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${plano.motivo}` });
      return;
    }
    const n = aplicar(plano.comandos);
    const { nota, foraDoPlano = [] } = contar(plano);
    etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'LANCOU', n, nota);
    for (const a of plano.avisos ?? []) pendencias.push({ grupo: 'VERIFICACAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${a}` });
    // "Fora do plano" é o planejador PULANDO um ponto (pilar quase duplicado, viga já existente…): o lugar ficou
    // atendido por outra peça ou pede conferência — não é falta de solução.
    // F23: o nó a menos de uma seção de outro pilar é atendido por ele (que apoia as paredes do nó) — para conferir.
    for (const f of foraDoPlano)
      pendencias.push(/a menos de uma seção de outro pilar/.test(f) ? { grupo: 'CONFERIR', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${f} — o pilar vizinho atende os dois encontros` } : { grupo: 'VERIFICACAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${f}` });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    etapa(id, ROTULO_DA_ETAPA_DA_CASA[id], 'NAO_RODOU', 0, motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `${ROTULO_DA_ETAPA_DA_CASA[id]}: ${motivo}` });
  }
}

export function etapaDoTelhado(ctx: ContextoDaCasa, levelId: ObjectId, ret: Retangulo, anexos: readonly Retangulo[], comLaje: boolean) {
  const { aplicar, etapa, hip, hipGerador, peDireitoMm, pendencias, q } = ctx;
  if (!hip.telhado.lancar) {
    etapa('TELHADO', ROTULO_DA_ETAPA_DA_CASA.TELHADO, 'NAO_EXIGIDA', 0, 'desligado nas hipóteses da casa');
    return;
  }
  const espessuraExterna = hipGerador.espessuraExternaMm ?? HIPOTESES_DO_GERADOR_PADRAO.espessuraExternaMm;
  const topo = peDireitoMm + (comLaje ? hip.estrutura.lajes.espessuraMm : 0);
  const t = comandosDoTelhado(levelId, ret, q, topo, espessuraExterna / 2, hip.telhado);
  if (!t.ok) {
    etapa('TELHADO', ROTULO_DA_ETAPA_DA_CASA.TELHADO, 'NAO_RODOU', 0, t.motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Telhado: ${t.motivo}` });
    return;
  }
  // F24: o anexo da casa em L ganha UMA água caindo para fora do principal (atrás → fundos, à frente → frente, ao
  // lado → para aquele lado). O que não encosta em nenhum lado do principal fica para cobrir à mão.
  const dosAnexos: Command[] = [];
  let anexosSemCobertura = 0;
  for (const a of anexos) {
    const caimento = a.y0 >= ret.y1 - 1 ? 'FUNDOS' : a.y1 <= ret.y0 + 1 ? 'FRENTE' : a.x0 >= ret.x1 - 1 ? 'DIREITA' : a.x1 <= ret.x0 + 1 ? 'ESQUERDA' : null;
    const ta = caimento ? comandosDoTelhado(levelId, a, q, topo, espessuraExterna / 2, { ...hip.telhado, tipo: 'UMA_AGUA', caimentoUmaAgua: caimento }) : null;
    if (ta?.ok) dosAnexos.push(...ta.comandos);
    else anexosSemCobertura++;
  }
  try {
    const antes = new Set((ctx.m.roofs ?? []).map((r) => r.id));
    const n = aplicar([...t.comandos, ...dosAnexos]);
    // F19 da casa automática: a COMPOSIÇÃO do teto nas águas (de cima para baixo) — sem ela a carga térmica não avaliava
    // o teto ("cobertura sem camadas declaradas") em todo cômodo. O ático como câmara de ar, a laje e o forro de gesso;
    // a telha fica fora (sem condutividade na biblioteca, anularia a conta). Presumida: dita.
    const camadas: CamadaParede[] = [
      { espessuraMm: 300, itemCode: '', descricao: 'Ático (câmara de ar)', funcao: 'CAMARA_AR' },
      ...(comLaje ? [{ espessuraMm: hip.estrutura.lajes.espessuraMm, itemCode: 'INT-CONCRETO', descricao: 'Laje de concreto', funcao: 'ESTRUTURAL' as const }] : []),
      ...(hip.forro.lancar ? [{ espessuraMm: 13, itemCode: 'INT-GESSO', descricao: 'Forro de gesso', funcao: 'ACABAMENTO' as const }] : []),
    ];
    const novas = (ctx.m.roofs ?? []).filter((r) => !antes.has(r.id));
    if (novas.length) {
      aplicar(novas.map((r) => ({ type: 'SetAguaProps', aguaId: r.id, camadas }) as Command));
      pendencias.push({ grupo: 'CONFERIR', texto: `Telhado: composição do teto presumida para a carga térmica (ático + ${comLaje ? `laje de ${hip.estrutura.lajes.espessuraMm} mm` : 'sem laje'}${hip.forro.lancar ? ' + forro de gesso' : ''}) — declare as camadas reais nas águas.` });
    }
    ctx.telhado = t.resumo;
    const tr = t.resumo;
    etapa('TELHADO', ROTULO_DA_ETAPA_DA_CASA.TELHADO, 'LANCOU', n, `${tr.aguas === 2 ? 'duas águas' : 'uma água'} a ${String(hip.telhado.inclinacaoPct).replace('.', ',')} %, cumeeira ${tr.direcao} (${String(tr.cumeeiraM).replace('.', ',')} m), beiral de ${String(hip.telhado.beiralMm / 1000).replace('.', ',')} m — ${String(tr.projecaoM2).replace('.', ',')} m² de projeção`);
    if (dosAnexos.length) pendencias.push({ grupo: 'CONFERIR', texto: `Telhado: ${dosAnexos.length} anexo(s) em uma água caindo para fora do principal — confira o encontro das águas (rufo/calha).` });
    if (anexosSemCobertura) pendencias.push({ grupo: 'NAO_DECIDIDO', texto: `Telhado: ${anexosSemCobertura} anexo(s) da planta ficaram sem cobertura — cubra à mão (Telhado › Extrusão).` });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    etapa('TELHADO', ROTULO_DA_ETAPA_DA_CASA.TELHADO, 'NAO_RODOU', 0, motivo);
    pendencias.push({ grupo: 'SEM_SOLUCAO', texto: `Telhado: ${motivo}` });
  }
}

/**
 * AS MARCAS DA CLIMATIZAÇÃO NO DESENHO (F11, 10/10/2026 — grupo F do roadmap de
 * climatização).
 *
 * Os problemas de dimensionamento da climatização só apareciam nas conferências
 * dos painéis. Aqui eles viram MARCAS no lugar do problema, no mesmo formato da
 * verificação da rede (`MarcaDeVerificacao`) — o canvas e a gaveta de
 * verificação já sabem desenhá-las e selecionar o alvo. Nada é calculado de
 * novo: cada marca é uma conferência que já existe, levada ao ponto do desenho.
 *
 *  - LINHA (split): comprimento ou desnível acima da faixa, diâmetro abaixo
 *    (ERRO, na evaporadora); evaporadora com condensadora sem linha (AVISO).
 *  - DRENO: DN abaixo do que a vazão de condensado pede (ERRO, no trecho);
 *    evaporadora sem dreno ou dreno por gravidade sem sifão (AVISO).
 *  - VRF: trecho abaixo do diâmetro do somatório a jusante (ERRO, no trecho);
 *    divisão sem a peça certa (ERRO, no nó); limites estourados (ERRO, na
 *    condensadora).
 *  - DUTO: exaustor sem duto até a fachada (AVISO). Com a rede de ar calculada
 *    (a gaveta aberta, que tem a carga térmica), velocidade alta (AVISO, no
 *    trecho) e caminho crítico acima da pressão disponível (ERRO, na raiz).
 *
 * Sem nada de climatização no desenho, nada é calculado.
 */
import type { BlueprintModel, ObjectId, Terminal } from './blueprintKernel';
import { TIPOS_DE_CLIMATIZACAO } from './blueprintKernel';
import type { HipotesesClimatizacao } from './blueprintClimatizacao';
import { drenosConferidos, drenosPorVazao, linhasConferidas } from './blueprintLinhaFrigorigena';
import { analisesDoNivel } from './blueprintVrf';
import { exaustoresDoNivel, type RedeDeAr } from './blueprintRedeDeAr';
import type { MarcaDeVerificacao } from './blueprintVerificacaoRede';

const DISCIPLINAS = new Set(['FRIGORIGENA', 'DRENO_AC', 'MECANICA']);

/** O desenho tem alguma coisa de climatização? */
export function temClimatizacao(model: BlueprintModel): boolean {
  return (
    (model.trechos ?? []).some((t) => DISCIPLINAS.has(t.disciplina)) ||
    (model.terminais ?? []).some((t) => !!t.tipoHidraulico && (TIPOS_DE_CLIMATIZACAO as readonly string[]).includes(t.tipoHidraulico))
  );
}

const m1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** As marcas da climatização, do modelo inteiro (ou de um pavimento), em ordem estável. */
export function marcasDaClimatizacao(model: BlueprintModel, hip: HipotesesClimatizacao, redesDeAr: readonly RedeDeAr[] = [], levelId: ObjectId | null = null): MarcaDeVerificacao[] {
  if (!temClimatizacao(model)) return [];
  const porId = new Map((model.terminais ?? []).map((t) => [t.id, t]));
  const trechoPorId = new Map((model.trechos ?? []).map((t) => [t.id, t]));
  const marcas: MarcaDeVerificacao[] = [];
  const naPeca = (t: Terminal, chave: string, tipo: MarcaDeVerificacao['tipo'], texto: string, severidade: MarcaDeVerificacao['severidade'], disciplina: MarcaDeVerificacao['disciplina']) =>
    marcas.push({ chave, tipo, levelId: t.levelId, at: { x: t.at.x, y: t.at.y }, texto, severidade, alvoId: t.id, disciplina });
  const noTrecho = (trechoId: ObjectId, chave: string, tipo: MarcaDeVerificacao['tipo'], texto: string, severidade: MarcaDeVerificacao['severidade']) => {
    const t = trechoPorId.get(trechoId);
    if (!t) return;
    marcas.push({ chave, tipo, levelId: t.levelId, at: { x: Math.round(t.a.x + (t.b.x - t.a.x) * 0.5), y: Math.round(t.a.y + (t.b.y - t.a.y) * 0.5) }, texto, severidade, alvoId: t.id, disciplina: t.disciplina });
  };

  for (const nivel of model.levels.filter((l) => !levelId || l.id === levelId)) {
    // ── A linha do split ──
    for (const l of linhasConferidas(model, nivel.id, hip.linha)) {
      const ev = porId.get(l.evaporadoraId);
      if (!ev) continue;
      if (l.comprimentoM == null) naPeca(ev, `clima-sem-linha|${ev.id}`, 'CLIMA_SEM_LINHA', 'sem linha até a condensadora', 'AVISO', 'FRIGORIGENA');
      else if (l.comprimentoM > l.faixa.comprimentoMaxM) naPeca(ev, `clima-linha-longa|${ev.id}`, 'CLIMA_LINHA_LONGA', `linha ${m1(l.comprimentoM)} m > ${l.faixa.comprimentoMaxM} m`, 'ERRO', 'FRIGORIGENA');
      if (l.desnivelM > l.faixa.desnivelMaxM) naPeca(ev, `clima-desnivel|${ev.id}`, 'CLIMA_DESNIVEL', `desnível ${m1(l.desnivelM)} m > ${l.faixa.desnivelMaxM} m`, 'ERRO', 'FRIGORIGENA');
      if (l.pendencias.some((p) => /diâmetros abaixo/.test(p))) naPeca(ev, `clima-linha-fina|${ev.id}`, 'CLIMA_LINHA_FINA', `Ø abaixo da faixa (pede ${l.faixa.liquidoMm}/${l.faixa.succaoMm} mm)`, 'ERRO', 'FRIGORIGENA');
    }
    // ── O dreno ──
    for (const d of drenosPorVazao(model, nivel.id, hip.linha)) {
      if (d.bitolaMm < d.pedeMm) noTrecho(d.trechoId, `clima-dn-dreno|${d.trechoId}`, 'CLIMA_DN_DRENO', `DN ${d.bitolaMm} < ${d.pedeMm} (${m1(d.vazaoLh)} L/h)`, 'ERRO');
    }
    for (const d of drenosConferidos(model, nivel.id)) {
      const ev = porId.get(d.evaporadoraId);
      if (!ev) continue;
      if (!d.chega && !d.comBomba) naPeca(ev, `clima-sem-dreno|${ev.id}`, 'CLIMA_SEM_DRENO', 'sem dreno até um ponto de dreno', 'AVISO', 'DRENO_AC');
      else if (d.chega && !d.comBomba && !d.comSifao) naPeca(ev, `clima-sem-sifao|${ev.id}`, 'CLIMA_SEM_SIFAO', 'dreno sem sifão', 'AVISO', 'DRENO_AC');
    }
    // ── O VRF (pelo pavimento da condensadora) ──
    for (const a of analisesDoNivel(model, nivel.id, hip.vrf)) {
      for (const t of a.trechos.filter((x) => x.abaixo)) noTrecho(t.trechoId, `clima-vrf-diametro|${t.trechoId}`, 'CLIMA_VRF_DIAMETRO', `Ø ${t.liquidoMm}/${t.succaoMm} < ${t.pede.liquidoMm}/${t.pede.succaoMm} mm`, 'ERRO');
      for (const d of a.derivacoes.filter((x) => !x.temDerivador)) {
        marcas.push({ chave: `clima-vrf-peca|${d.no}`, tipo: 'CLIMA_VRF_SEM_PECA', levelId: d.levelId, at: { ...d.at }, texto: d.ramais >= 3 ? `${d.ramais} ramais: pede coletor` : 'divisão sem derivador', severidade: 'ERRO', alvoId: a.sistema.condensadora.id, disciplina: 'FRIGORIGENA' });
      }
      const h = hip.vrf;
      const estouro =
        (a.comprimentoTotalM != null && a.comprimentoTotalM > h.comprimentoTotalMaxM) ||
        (a.maisDistanteM != null && a.maisDistanteM > h.ateMaisDistanteMaxM) ||
        (a.maisDistanteEquivalenteM != null && a.maisDistanteEquivalenteM > h.ateMaisDistanteEquivalenteMaxM) ||
        (a.aposPrimeiraDerivacaoM != null && a.aposPrimeiraDerivacaoM > h.aposPrimeiraDerivacaoMaxM) ||
        a.desnivelCondEvapM > h.desnivelCondEvapMaxM ||
        a.desnivelEntreEvapM > h.desnivelEntreEvapMaxM;
      if (estouro) naPeca(a.sistema.condensadora, `clima-vrf-limite|${a.sistema.condensadora.id}`, 'CLIMA_VRF_LIMITE', `${a.sistema.nome}: comprimento ou desnível acima do limite`, 'ERRO', 'FRIGORIGENA');
    }
    // ── A exaustão ──
    for (const e of exaustoresDoNivel(model, nivel.id)) {
      const t = porId.get(e.terminalId);
      if (t && !e.chegaNaFachada) naPeca(t, `clima-exaustor|${t.id}`, 'CLIMA_EXAUSTOR_SEM_DUTO', 'exaustor sem duto até a fachada', 'AVISO', 'MECANICA');
    }
  }
  // ── A rede de ar calculada (só quando quem chama tem a carga) ──
  for (const r of redesDeAr) {
    if (levelId && r.raiz.levelId !== levelId) continue;
    for (const t of r.trechos.filter((x) => x.velocidadeAlta)) noTrecho(t.trechoId, `clima-velocidade|${t.trechoId}`, 'CLIMA_VELOCIDADE_DUTO', `${m1(t.velocidadeMs)} m/s`, 'AVISO');
    if (!r.atende) naPeca(r.raiz, `clima-pressao|${r.raiz.id}`, 'CLIMA_PRESSAO_DUTO', `caminho crítico ${Math.round(r.perdaCriticaPa)} Pa > ${Math.round(r.pressaoDisponivelPa)} Pa`, 'ERRO', 'MECANICA');
  }
  return marcas.sort((a, b) => a.chave.localeCompare(b.chave));
}

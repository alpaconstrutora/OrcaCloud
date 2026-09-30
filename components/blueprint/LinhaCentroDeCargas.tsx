import React from 'react';
import type { Command } from '../../utils/blueprintKernel';
import type { CentroDeCargas } from '../../utils/blueprintCentroDeCargas';

/**
 * CENTRO DE CARGAS na aba Quadros (E6.2, 29/09/2026): onde o quadro está em
 * relação ao baricentro da carga, quanto o Σ VA·d cai na posição sugerida, e
 * dois gestos — marcar a região na planta (volta ao desenho) e levar o quadro
 * até lá (ou criar o quadro, quando ainda não há). Levar é um lote: Ctrl+Z
 * desfaz. Botão desligado diz por quê.
 */
const m1 = (mm: number) => (mm / 1000).toFixed(1).replace('.', ',');
const inteiro = (v: number) => Math.round(v).toLocaleString('pt-BR');

export default function LinhaCentroDeCargas({
  nomeDoQuadro,
  centro,
  naPlanta,
  onMostrarNaPlanta,
  comandos,
  trechosNoQuadro = 0,
  onLevar,
}: {
  /** `null` = não há quadro: o centro é de todos os pontos e "levar" CRIA o quadro. */
  nomeDoQuadro: string | null;
  centro: CentroDeCargas | null;
  naPlanta: boolean;
  onMostrarNaPlanta: (mostrar: boolean) => void;
  comandos: Command[];
  trechosNoQuadro?: number;
  onLevar: (comandos: Command[]) => void;
}) {
  const alvo = nomeDoQuadro ? `do quadro ${nomeDoQuadro}` : 'de todos os pontos';
  if (!centro) {
    return (
      <p aria-label={`Centro de cargas ${alvo}`} className="text-slate-400">
        Centro de cargas: nenhum ponto com potência {nomeDoQuadro ? 'nos circuitos deste quadro' : 'no desenho'} — declare a potência dos pontos para calcular.
      </p>
    );
  }
  const ganhoPct =
    centro.momentoAtualVAm != null && centro.momentoAtualVAm > 0 ? ((centro.momentoAtualVAm - centro.momentoSugeridoVAm) / centro.momentoAtualVAm) * 100 : null;
  const motivoDesligado =
    comandos.length === 0 ? 'O quadro já está na posição sugerida — nada a mover' : null;
  const titulo = motivoDesligado
    ?? (nomeDoQuadro
      ? `Move o quadro ${nomeDoQuadro} para a posição sugerida${centro.paredeId ? ` (na parede mais próxima do centro${centro.sugeridaDentroDaRegiao ? '' : ', fora da região: nenhuma parede passa dentro dela'})` : ' (sem parede a menos de 3 m: no próprio centro)'}${trechosNoQuadro > 0 ? ` — os ${trechosNoQuadro} eletroduto(s) que chegam nele ficam onde estão: relance a rede depois` : ''}. Ctrl+Z desfaz`
      : `Cria o quadro QDC na posição sugerida${centro.paredeId ? ' (na parede mais próxima do centro)' : ''}. Ctrl+Z desfaz`);
  return (
    <div aria-label={`Centro de cargas ${alvo}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600">
      <span className="font-medium text-slate-600">Centro de cargas</span>
      <span>
        {centro.pontos} {centro.pontos === 1 ? 'ponto' : 'pontos'} · {inteiro(centro.totalVA)} VA · região de raio {m1(centro.raioMm)} m
        {centro.pontosSemPotencia > 0 && <span className="text-slate-400"> ({centro.pontosSemPotencia} sem potência, fora da conta)</span>}
      </span>
      {centro.distanciaDoQuadroMm != null && (
        <span className={centro.dentroDaRegiao || centro.quadroNaSugerida ? 'text-emerald-700' : 'text-amber-700'}>
          {centro.dentroDaRegiao
            ? `o quadro está na região (a ${m1(centro.distanciaDoQuadroMm)} m do centro)`
            : centro.quadroNaSugerida
              ? `o quadro está na posição sugerida — na parede mais próxima, a ${m1(centro.distanciaDoQuadroMm)} m do centro (nenhuma parede passa dentro da região)`
              : `o quadro está a ${m1(centro.distanciaDoQuadroMm)} m do centro, fora da região`}
        </span>
      )}
      {ganhoPct != null && comandos.length > 0 && (
        <span title="Σ VA·d: potência de cada ponto × distância em planta até o quadro — proporcional ao cobre e à queda de tensão dos circuitos">
          Σ VA·d {inteiro(centro.momentoAtualVAm as number)} → {inteiro(centro.momentoSugeridoVAm)} VA·m ({ganhoPct >= 0 ? '−' : '+'}
          {Math.abs(ganhoPct).toFixed(0)} %)
        </span>
      )}
      <button
        type="button"
        onClick={() => onMostrarNaPlanta(!naPlanta)}
        aria-pressed={naPlanta}
        title={naPlanta ? 'Tirar a marca do centro de cargas da planta' : 'Volta ao desenho com a região marcada (círculo tracejado); mover o quadro apaga a marca'}
        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-50"
      >
        {naPlanta ? 'Tirar da planta' : 'Mostrar na planta'}
      </button>
      <button
        type="button"
        onClick={() => onLevar(comandos)}
        disabled={comandos.length === 0}
        title={titulo}
        className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        {nomeDoQuadro ? 'Levar o quadro ao centro' : 'Criar quadro no centro'}
      </button>
    </div>
  );
}

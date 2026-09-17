import React from 'react';
import type { Structural } from '../../utils/blueprintKernel';
import { secaoTValida } from '../../utils/blueprintKernel/secaoT';
import type { ArmaduraDaPeca } from '../../utils/blueprintArmadura';
import { posicoesNaLinha, posicoesNoCirculo, posicoesNoRetangulo } from '../../utils/blueprintArmaduraGeometria';

/**
 * A SEÇÃO ARMADA da peça, em SVG (16/09/2026: *"implementar exibição gráfica
 * das armaduras"*). O corte transversal com o contorno do concreto, o estribo
 * no cobrimento e as barras como pontos — a mesma distribuição que o 3D usa
 * (`posicoesNoRetangulo`/`posicoesNoCirculo`/`posicoesNaLinha`), para a seção
 * ser um corte do que a cena mostra. Laje: uma faixa de 1 m com as barras no
 * espaçamento. Bloco: o corte pela largura, com a malha inferior e o estribo.
 *
 * É desenho do pré-quantitativo: sem dobras, sem ganchos, sem cotas de
 * detalhamento. Serve para o olho conferir "4 Ø 12,5 num 19 × 19" antes de o
 * número ir para o orçamento.
 */

const COR_CONCRETO = '#e2e8f0';
const COR_CONTORNO = '#475569';
const COR_ESTRIBO = '#dc2626';
const COR_BARRA = '#7c2d12';

interface Props {
  estrutura: Structural;
  armadura: ArmaduraDaPeca;
  /** Largura em px do desenho (a altura segue a proporção). */
  larguraPx?: number;
}

export default function SecaoArmadaSvg({ estrutura: s, armadura: a, larguraPx = 220 }: Props) {
  const c = a.cobrimentoMm;
  const long = a.camadas.find((k) => k.papel === 'longitudinal');
  const sup = a.camadas.find((k) => k.papel === 'superior');
  const trans = a.camadas.find((k) => k.papel === 'estribo' || k.papel === 'espiral');
  const malhas = a.camadas.filter((k) => k.papel === 'malha');
  const bt = trans?.bitolaMm ?? 0;

  // Dimensões da seção em mm (largura × altura do desenho).
  let largura = 0;
  let altura = 0;
  let circular = false;
  let legenda = '';
  const barras: { x: number; y: number; r: number }[] = [];
  let estribo: { x: number; y: number; w: number; h: number } | null = null;

  if (s.kind === 'PILAR' || s.kind === 'ESTACA') {
    largura = s.larguraMm;
    altura = s.circular ? s.larguraMm : s.profundidadeMm;
    circular = !!s.circular;
    if (long) {
      const inset = c + bt + long.bitolaMm / 2;
      const pos = circular
        ? posicoesNoCirculo(long.n, largura / 2 - inset)
        : posicoesNoRetangulo(long.n, Math.max(0, largura - 2 * inset), Math.max(0, altura - 2 * inset));
      for (const p of pos) barras.push({ x: p.x, y: -p.y, r: long.bitolaMm / 2 });
    }
    if (trans) estribo = { x: -(largura / 2 - c), y: -(altura / 2 - c), w: largura - 2 * c, h: altura - 2 * c };
    legenda = circular ? `Ø ${(largura / 10).toLocaleString('pt-BR')} cm` : `${(largura / 10).toLocaleString('pt-BR')} × ${(altura / 10).toLocaleString('pt-BR')} cm`;
  } else if (s.kind === 'VIGA' || s.kind === 'VIGA_FUNDACAO') {
    const t = secaoTValida(s);
    largura = t ? t.almaLarguraMm : s.larguraMm;
    altura = s.alturaMm;
    const linha = (cam: typeof long, y: number) => {
      if (!cam) return;
      const meia = largura / 2 - c - bt - cam.bitolaMm / 2;
      for (const x of posicoesNaLinha(cam.n, Math.max(0, meia))) barras.push({ x, y, r: cam.bitolaMm / 2 });
    };
    linha(long, altura / 2 - c - bt - (long?.bitolaMm ?? 10) / 2);
    linha(sup, -(altura / 2 - c - bt - (sup?.bitolaMm ?? 10) / 2));
    if (trans) estribo = { x: -(largura / 2 - c), y: -(altura / 2 - c), w: largura - 2 * c, h: altura - 2 * c };
    legenda = `${(largura / 10).toLocaleString('pt-BR')} × ${(altura / 10).toLocaleString('pt-BR')} cm`;
  } else if (s.kind === 'LAJE') {
    largura = 1000;
    altura = s.alturaMm;
    const m = malhas[0];
    if (m && m.espacamentoCm) {
      const passo = m.espacamentoCm * 10;
      const y = altura / 2 - c - m.bitolaMm / 2;
      for (let x = -largura / 2 + passo / 2; x < largura / 2; x += passo) barras.push({ x, y, r: m.bitolaMm / 2 });
    }
    legenda = `faixa de 1 m · h ${(altura / 10).toLocaleString('pt-BR')} cm`;
  } else if (s.kind === 'BLOCO_COROAMENTO') {
    largura = s.larguraMm;
    altura = s.alturaMm;
    const m2 = malhas[1] ?? malhas[0];
    if (m2) {
      const y = altura / 2 - c - m2.bitolaMm / 2;
      for (const x of posicoesNaLinha(m2.n, largura / 2 - c - m2.bitolaMm)) barras.push({ x, y, r: m2.bitolaMm / 2 });
    }
    if (trans) estribo = { x: -(largura / 2 - c), y: -(altura / 2 - c), w: largura - 2 * c, h: altura - 2 * c };
    legenda = `corte ${(largura / 10).toLocaleString('pt-BR')} × ${(altura / 10).toLocaleString('pt-BR')} cm`;
  }
  if (largura <= 0 || altura <= 0) return null;

  const margem = Math.max(largura, altura) * 0.08;
  const vbW = largura + 2 * margem;
  const vbH = altura + 2 * margem;
  const alturaPx = Math.max(40, Math.round((larguraPx * vbH) / vbW));
  const traco = Math.max(2, Math.min(largura, altura) * 0.012);
  const raioMin = Math.max(3, Math.min(largura, altura) * 0.02);

  return (
    <figure className="mt-2">
      <svg
        viewBox={`${-vbW / 2} ${-vbH / 2} ${vbW} ${vbH}`}
        width={larguraPx}
        height={alturaPx}
        role="img"
        aria-label={`Seção armada: ${a.descricao}`}
        className="block"
      >
        {circular ? (
          <circle cx={0} cy={0} r={largura / 2} fill={COR_CONCRETO} stroke={COR_CONTORNO} strokeWidth={traco} />
        ) : (
          <rect x={-largura / 2} y={-altura / 2} width={largura} height={altura} fill={COR_CONCRETO} stroke={COR_CONTORNO} strokeWidth={traco} />
        )}
        {estribo && circular ? (
          <circle cx={0} cy={0} r={largura / 2 - c} fill="none" stroke={COR_ESTRIBO} strokeWidth={Math.max(traco, bt)} />
        ) : estribo ? (
          <rect x={estribo.x} y={estribo.y} width={estribo.w} height={estribo.h} rx={bt * 2} fill="none" stroke={COR_ESTRIBO} strokeWidth={Math.max(traco, bt)} />
        ) : null}
        {barras.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={Math.max(raioMin, b.r)} fill={COR_BARRA} />
        ))}
      </svg>
      <figcaption className="text-[10px] text-slate-400">
        Seção esquemática · {legenda} · cobrimento {(c / 10).toLocaleString('pt-BR')} cm
      </figcaption>
    </figure>
  );
}

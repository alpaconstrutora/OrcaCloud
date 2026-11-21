/** Versão publicada desatualizada (item 5.1 do plano docs/planos/2026-11-21-imovib-oportunidades-consolidacao.md). */
import { describe, it, expect } from 'vitest';
import { diferencasDaVersaoPublicada, textoDasDiferencas } from '../utils/imovibVersaoDesatualizada';

const v = { vgv: 11_648_000, vpl: 4_021_968, tirAnual: 19, exposicaoMaxima: 6_059_583 };

describe('diferencasDaVersaoPublicada', () => {
    it('estudo igual (ou só arredondamento): nenhuma diferença', () => {
        expect(diferencasDaVersaoPublicada(v, { ...v, vpl: v.vpl + 0.4, tirAnual: 19.004 })).toEqual([]);
    });

    it('lista o que mudou, com antes e agora', () => {
        const d = diferencasDaVersaoPublicada(v, { ...v, vgv: 12_000_000, tirAnual: 21.5 });
        expect(d.map(x => x.rotulo)).toEqual(['VGV', 'TIR']);
        expect(textoDasDiferencas(d)).toMatch(/VGV R\$\s?11\.648\.000 → R\$\s?12\.000\.000; TIR 19% a\.a\. → 21,5% a\.a\./);
    });

    it('TIR que deixou de existir (ou passou a existir) conta como mudança', () => {
        expect(diferencasDaVersaoPublicada(v, { ...v, tirAnual: null }).map(x => x.agora)).toEqual(['sem TIR']);
    });
});

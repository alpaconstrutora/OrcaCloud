// @vitest-environment jsdom
/** §29 do guia — barra segmentada: percentual em texto + quadradinhos, cor por faixa. */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SegmentedProgress } from '../../components/ui/SegmentedProgress';

const quadradinhos = () => Array.from(screen.getByRole('img').querySelectorAll('span'));

describe('SegmentedProgress', () => {
    it('78% → 9 de 12 preenchidos em verde, percentual em texto', () => {
        render(<SegmentedProgress percent={78} />);
        expect(screen.getByText('78%')).toBeInTheDocument();
        const q = quadradinhos();
        expect(q).toHaveLength(12);
        expect(q.filter(s => s.className.includes('bg-emerald-500'))).toHaveLength(9);
        expect(q.filter(s => s.className.includes('bg-gray-200'))).toHaveLength(3);
    });

    it('25% → 3 de 12 em âmbar', () => {
        render(<SegmentedProgress percent={25} />);
        const q = quadradinhos();
        expect(q.filter(s => s.className.includes('bg-amber-400'))).toHaveLength(3);
    });

    it('tone explícito manda; fora da faixa recorta; NaN vira 0', () => {
        const { unmount } = render(<SegmentedProgress percent={140} tone="blue" segments={8} />);
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(quadradinhos().filter(s => s.className.includes('bg-blue-500'))).toHaveLength(8);
        unmount();
        render(<SegmentedProgress percent={Number.NaN} />);
        expect(screen.getByText('0%')).toBeInTheDocument();
    });
});

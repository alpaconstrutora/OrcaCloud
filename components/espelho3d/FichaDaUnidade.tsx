import React from 'react';
import { X } from 'lucide-react';
import type { PrismaDoEspelho } from '../../utils/espelhoDeVendas3d';
import type { DadosDaUnidade, PaletaDoEspelho } from '../../utils/espelhoDeVendas3dMalha';

/**
 * A ficha da unidade tocada no Espelho de Vendas 3D (09/11/2026). Plano:
 * docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 *
 * Serve o Portal do Corretor (tela do app, guia §8: status em texto) e o do
 * Investidor (§24). Por isso o status aqui é o quadrado da legenda + o nome —
 * cor semântica, igual nos dois — e não a pílula de um nem a do outro.
 */

export type { DadosDaUnidade };

const m2 = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const temNumero = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

const Linha: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-gray-100 last:border-b-0">
        <dt className="text-[13px] text-gray-500 whitespace-nowrap">{rotulo}</dt>
        <dd className="text-sm text-gray-900 text-right tabular-nums">{children}</dd>
    </div>
);

export const FichaDaUnidade: React.FC<{
    prisma: PrismaDoEspelho;
    dados?: DadosDaUnidade;
    paleta: PaletaDoEspelho;
    mostrarPreco?: boolean;
    acoes?: React.ReactNode;
    onFechar: () => void;
}> = ({ prisma, dados, paleta, mostrarPreco, acoes, onFechar }) => {
    const status = prisma.status ? paleta[prisma.status] : null;
    return (
        <section aria-label={`Ficha da unidade ${prisma.rotulo ?? ''}`} className="rounded-[10px] border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 truncate">Unidade {prisma.rotulo}</h3>
                    <p className="text-[13px] text-gray-500 truncate">{prisma.torre} · {prisma.nomeDoAndar}</p>
                </div>
                <button
                    type="button"
                    onClick={onFechar}
                    aria-label="Fechar a ficha"
                    title="Fechar a ficha"
                    className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {status && (
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-gray-900">
                    <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: status.cor }} />
                    {status.rotulo}
                </p>
            )}

            {dados?.fotoUrl && (
                <img src={dados.fotoUrl} alt={`Foto da unidade ${prisma.rotulo ?? ''}`} className="mt-3 w-full h-36 object-cover rounded-[6px] border border-gray-100" />
            )}

            <dl className="mt-3">
                {dados?.tipologia && <Linha rotulo="Tipologia">{dados.tipologia}</Linha>}
                {temNumero(dados?.areaPrivativaM2) && <Linha rotulo="Área privativa">{m2(dados.areaPrivativaM2)}</Linha>}
                {temNumero(dados?.dormitorios) && <Linha rotulo="Dormitórios">{dados.dormitorios}</Linha>}
                {temNumero(dados?.banheiros) && <Linha rotulo="Banheiros">{dados.banheiros}</Linha>}
                {temNumero(dados?.vagas) && <Linha rotulo="Vagas">{dados.vagas}</Linha>}
                {mostrarPreco && <Linha rotulo="Preço de tabela">{temNumero(dados?.preco) ? brl(dados.preco) : '—'}</Linha>}
            </dl>

            {acoes && <div className="mt-4 flex flex-wrap gap-2">{acoes}</div>}
        </section>
    );
};

export default FichaDaUnidade;

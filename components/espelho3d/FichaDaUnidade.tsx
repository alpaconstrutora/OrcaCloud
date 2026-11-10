import React from 'react';
import { Maximize2, Mountain, Sofa, X } from 'lucide-react';
import Button from '../ui/Button';
import { Modal } from '../ui/modal';
import DecoradoDaUnidade from './DecoradoDaUnidade';
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
    // A planta (F5) e a vista da janela (F6) ampliadas: um diálogo no centro, nunca tela cheia. Trocar de unidade fecha.
    // O decorado (F8) abre o seu próprio diálogo, com as imagens uma a uma.
    const [ampliada, setAmpliada] = React.useState<'planta' | 'vista' | 'decorado' | null>(null);
    React.useEffect(() => setAmpliada(null), [prisma.chave]);
    const tituloDaPlanta = dados?.tipologia ? `Planta da tipologia ${dados.tipologia}` : 'Planta da unidade';
    const vista = dados?.vista;
    const SEM_VISTA = 'Não há foto de vista cadastrada para o andar desta unidade.';
    const decorado = dados?.decorado;
    const semDecorado = dados?.tipologia
        ? `A tipologia ${dados.tipologia} ainda não tem decorado cadastrado.`
        : 'Esta unidade não tem tipologia no cadastro: o decorado é escolhido pela tipologia.';
    const noDialogo =
        ampliada === 'planta' && dados?.plantaUrl
            ? { titulo: tituloDaPlanta, url: dados.plantaUrl, rodape: null as string | null, fechar: 'Fechar a planta' }
            : ampliada === 'vista' && vista
                ? { titulo: 'Vista da janela', url: vista.url, rodape: [vista.legenda, vista.cobre].filter(Boolean).join(' · '), fechar: 'Fechar a vista' }
                : null;
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

            {dados?.plantaUrl && (
                <div className="mt-3">
                    <p className="text-[13px] text-gray-500">{tituloDaPlanta}</p>
                    <button
                        type="button"
                        onClick={() => setAmpliada('planta')}
                        aria-label={`Ampliar a ${tituloDaPlanta.toLowerCase()}`}
                        title="Ampliar a planta"
                        data-testid="ficha-planta"
                        className="group relative mt-1.5 block w-full rounded-[6px] border border-gray-200 bg-white overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                    >
                        <img src={dados.plantaUrl} alt={tituloDaPlanta} className="w-full h-40 object-contain" />
                        <span aria-hidden="true" className="absolute right-1.5 bottom-1.5 w-7 h-7 inline-flex items-center justify-center rounded-[6px] bg-white/90 border border-gray-200 text-gray-600 group-hover:text-gray-900">
                            <Maximize2 className="w-3.5 h-3.5" />
                        </span>
                    </button>
                </div>
            )}

            {/* Cada botão só aparece quando o prédio tem alguma vista/decorado cadastrado; sem o desta unidade, diz por quê
                (escrito embaixo também: em tablet não há hover). */}
            {(vista !== undefined || decorado !== undefined) && (
                <div className="mt-3 space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                        {vista !== undefined && (
                            <span title={vista ? undefined : SEM_VISTA} className="inline-block">
                                <Button type="button" variant="secondary" disabled={!vista} onClick={() => setAmpliada('vista')} data-testid="ficha-vista">
                                    <Mountain className="w-[15px] h-[15px]" />
                                    Vista da janela
                                </Button>
                            </span>
                        )}
                        {decorado !== undefined && (
                            <span title={decorado ? undefined : semDecorado} className="inline-block">
                                <Button type="button" variant="secondary" disabled={!decorado} onClick={() => setAmpliada('decorado')} data-testid="ficha-decorado">
                                    <Sofa className="w-[15px] h-[15px]" />
                                    Ver decorado
                                </Button>
                            </span>
                        )}
                    </div>
                    {vista === null && <p className="text-xs text-gray-500">{SEM_VISTA}</p>}
                    {decorado === null && <p className="text-xs text-gray-500" data-testid="ficha-decorado-motivo">{semDecorado}</p>}
                </div>
            )}

            {acoes && <div className="mt-4 flex flex-wrap gap-2">{acoes}</div>}

            {ampliada === 'decorado' && decorado && (
                <DecoradoDaUnidade decorado={decorado} subtitulo={`Unidade ${prisma.rotulo} · ${prisma.torre}`} onFechar={() => setAmpliada(null)} />
            )}

            {noDialogo && (
                <Modal open onClose={() => setAmpliada(null)} size="2xl" className="!rounded-[10px]">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{noDialogo.titulo}</p>
                            <p className="text-[13px] text-gray-500 truncate">Unidade {prisma.rotulo} · {prisma.torre}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setAmpliada(null)}
                            aria-label={noDialogo.fechar}
                            title={noDialogo.fechar}
                            className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-[6px] text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="p-4 overflow-auto bg-white">
                        <img src={noDialogo.url} alt={noDialogo.titulo} className="mx-auto max-w-full max-h-[70vh] object-contain" />
                        {noDialogo.rodape && <p className="mt-3 text-[13px] text-gray-600 text-center">{noDialogo.rodape}</p>}
                    </div>
                </Modal>
            )}
        </section>
    );
};

export default FichaDaUnidade;

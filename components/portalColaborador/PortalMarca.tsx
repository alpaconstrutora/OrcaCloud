/**
 * Portal do Colaborador — a casca com a marca da empresa
 * (docs/planos/2026-10-26-portal-colaborador-holerite-e-estados.md, item 4).
 *
 * Marca = a da ORGANIZAÇÃO do colaborador (`organizations.logo_url`, ou o nome)
 * com a paleta da Alpa (decisão do usuário, 26/10/2026; ver PRODUCT.md).
 * O laranja da marca (#FF884C) dá 2,4:1 sobre branco: só PREENCHE. Texto em
 * laranja usa #A84A1C (5,7:1); texto secundário #566375 (6,1:1) — o slate-400
 * de antes dava ~2,6:1, ilegível ao sol.
 */
import React, { useEffect, useState } from 'react';
import { BookOpen, Clock, Eye, EyeOff, FileText, LogOut, Receipt, Umbrella, ChevronRight } from 'lucide-react';

/** Classes por extenso — o JIT do Tailwind não enxerga classe montada em runtime. */
export const MARCA = {
    chao: 'bg-[#EDEDE8]',
    texto: 'text-[#4B4B4D]',
    secundario: 'text-[#566375]',
    laranjaTexto: 'text-[#A84A1C]',
    laranjaFundo: 'bg-[#FF884C]',
    cartao: 'bg-white rounded-2xl shadow-[0_1px_2px_rgba(75,75,77,0.08)]',
    primario: 'bg-[#4B4B4D] text-white hover:bg-[#3A3A3C] active:bg-[#2F2F31]',
    foco: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A84A1C] focus-visible:ring-offset-2',
} as const;

// ── Valor escondido por padrão ───────────────────────────────────────────────

const CHAVE_VALOR_VISIVEL = 'portal-colaborador:valor-visivel';

/**
 * Valor do holerite escondido por padrão (celular usado no canteiro, perto de
 * colegas); o aparelho lembra a escolha. Armazenamento pode faltar (aba
 * anônima, bloqueado): aí vale o padrão, sem quebrar.
 */
export function useValorVisivel(): [boolean, () => void] {
    const [visivel, setVisivel] = useState<boolean>(() => {
        try { return window.localStorage.getItem(CHAVE_VALOR_VISIVEL) === '1'; } catch { return false; }
    });
    const alternar = () => setVisivel(v => {
        const novo = !v;
        try { window.localStorage.setItem(CHAVE_VALOR_VISIVEL, novo ? '1' : '0'); } catch { /* sem armazenamento: só nesta sessão */ }
        return novo;
    });
    return [visivel, alternar];
}

const NBSP = '\u00a0';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Escondido, o valor NÃO vai para a tela (nem desfocado: leitor de tela e
 * "inspecionar" leriam). Ao mostrar, assenta de um desfoque curto — a
 * interação-assinatura do portal; sem movimento para quem pediu menos movimento.
 */
export const ValorEmReais: React.FC<{ valor: number; visivel: boolean; className?: string }> = ({ valor, visivel, className = '' }) => {
    const [assentado, setAssentado] = useState(true);
    useEffect(() => {
        if (!visivel) return;
        setAssentado(false);
        const id = requestAnimationFrame(() => requestAnimationFrame(() => setAssentado(true)));
        return () => cancelAnimationFrame(id);
    }, [visivel]);
    if (!visivel) {
        return <span className={`tabular-nums ${className}`}><span className="sr-only">Valor escondido</span><span aria-hidden="true">R$ ••••</span></span>;
    }
    return (
        <span className={`tabular-nums inline-block transition-[filter,opacity] duration-300 ease-out motion-reduce:transition-none ${assentado ? 'blur-0 opacity-100' : 'blur-[6px] opacity-40'} ${className}`}>
            {brl(valor)}
        </span>
    );
};

export const BotaoOlho: React.FC<{ visivel: boolean; onAlternar: () => void }> = ({ visivel, onAlternar }) => (
    <button type="button" onClick={onAlternar} aria-pressed={visivel}
        aria-label={visivel ? 'Esconder valores' : 'Mostrar valores'} title={visivel ? 'Esconder valores' : 'Mostrar valores'}
        className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-full ${MARCA.texto} hover:bg-[#EDEDE8] ${MARCA.foco}`}>
        {visivel ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
    </button>
);

// ── Cabeçalho ───────────────────────────────────────────────────────────────

export interface EmpresaDoPortal { name: string; logo_url: string | null }

/**
 * Logo da empresa à esquerda, altura fixa e largura livre: o da Alpa é o
 * símbolo quadrado, o da SPE é o horizontal com texto. Sem logo (ou logo que
 * não carrega), o nome da empresa em texto.
 */
export const CabecalhoDoPortal: React.FC<{
    empresa?: EmpresaDoPortal | null;
    nome?: string;
    cargo?: string;
    desde?: string;
    onSair?: () => void;
}> = ({ empresa, nome, cargo, desde, onSair }) => {
    const [logoFalhou, setLogoFalhou] = useState(false);
    const mostrarLogo = !!empresa?.logo_url && !logoFalhou;
    const linhaCargo = [cargo, desde ? `desde ${desde}` : null].filter(Boolean).join(' · ');
    return (
        <header className="bg-white px-5 pt-4 pb-5 border-b border-[#4B4B4D]/10">
            <div className="flex items-center justify-between gap-3 min-h-11">
                {mostrarLogo ? (
                    <img src={empresa!.logo_url!} alt={empresa!.name} onError={() => setLogoFalhou(true)}
                        className="h-12 w-auto max-w-[62%] object-contain object-left" />
                ) : (
                    // Sem logo, o nome É a marca: quebra em até duas linhas, não corta.
                    <p className={`text-sm font-semibold leading-snug line-clamp-2 ${MARCA.texto}`}>{empresa?.name ?? ''}</p>
                )}
                {onSair && (
                    <button type="button" onClick={onSair} aria-label="Sair do portal"
                        className={`h-11 -mr-2 px-3 inline-flex items-center gap-1.5 rounded-xl text-sm font-semibold ${MARCA.laranjaTexto} hover:bg-[#EDEDE8] ${MARCA.foco}`}>
                        <LogOut className="w-4 h-4" /> Sair
                    </button>
                )}
            </div>
            <p className={`mt-4 text-lg font-bold leading-snug ${MARCA.texto}`}>{nome || '—'}</p>
            {linhaCargo && <p className={`mt-0.5 text-sm ${MARCA.secundario}`}>{linhaCargo}</p>}
        </header>
    );
};

// ── Cartão do último holerite ───────────────────────────────────────────────

export const CartaoUltimoHolerite: React.FC<{
    competencia: string;
    tipo: string;
    liquido: number;
    visivel: boolean;
    onAlternarValor: () => void;
    onAbrir: () => void;
}> = ({ competencia, tipo, liquido, visivel, onAlternarValor, onAbrir }) => (
    <section aria-labelledby="ultimo-holerite" className="bg-white rounded-3xl overflow-hidden shadow-[0_1px_2px_rgba(75,75,77,0.08),0_12px_32px_-16px_rgba(75,75,77,0.35)]">
        <div className={`h-2 ${MARCA.laranjaFundo}`} aria-hidden="true" />
        <div className="p-5">
            {/* Espaços inquebráveis: "·" preso a "Último holerite" e "de AAAA" preso junto
                (o ano nunca sozinho). Travar a competência inteira vazava o cartão com
                texto a 200%. */}
            <h2 id="ultimo-holerite" className={`text-xl font-bold leading-snug [text-wrap:balance] ${MARCA.texto}`}>
                {`Último holerite${NBSP}· ${competencia.replace(/ de (\d{4})$/, ` de${NBSP}$1`)}`}
            </h2>
            <p className={`mt-0.5 text-sm ${MARCA.secundario}`}>{tipo}</p>

            <div className="mt-5 flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className={`text-sm ${MARCA.secundario}`}>Líquido a receber</p>
                    <ValorEmReais valor={liquido} visivel={visivel} className={`text-3xl font-bold ${MARCA.texto}`} />
                </div>
                <BotaoOlho visivel={visivel} onAlternar={onAlternarValor} />
            </div>

            <button type="button" onClick={onAbrir}
                className={`mt-5 w-full h-12 rounded-2xl text-base font-semibold transition-colors ${MARCA.primario} ${MARCA.foco}`}>
                Abrir holerite
            </button>
        </div>
    </section>
);

export const LinhaDeHolerite: React.FC<{
    competencia: string; tipo: string; liquido: number; visivel: boolean; onAbrir: () => void;
}> = ({ competencia, tipo, liquido, visivel, onAbrir }) => (
    <button type="button" onClick={onAbrir}
        className={`w-full min-h-16 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left ${MARCA.cartao} hover:bg-[#F7F7F4] ${MARCA.foco}`}>
        <div className="flex-1 min-w-[min(100%,10rem)]">
            <p className={`text-base font-semibold ${MARCA.texto}`}>{competencia}</p>
            <p className={`text-sm ${MARCA.secundario}`}>{tipo}</p>
        </div>
        <span className="ml-auto flex items-center gap-3">
            <ValorEmReais valor={liquido} visivel={visivel} className={`text-base font-semibold whitespace-nowrap ${MARCA.texto}`} />
            <ChevronRight className={`w-5 h-5 shrink-0 ${MARCA.secundario}`} />
        </span>
    </button>
);

// ── Rodapé ──────────────────────────────────────────────────────────────────

export type SecaoDoPortal = 'folha' | 'ponto' | 'ferias' | 'docs' | 'treino';

const ITENS: { id: SecaoDoPortal; rotulo: string; Icone: React.ElementType }[] = [
    { id: 'folha', rotulo: 'Holerites', Icone: Receipt },
    { id: 'ponto', rotulo: 'Ponto', Icone: Clock },
    { id: 'ferias', rotulo: 'Férias', Icone: Umbrella },
    { id: 'docs', rotulo: 'Documentos', Icone: FileText },
    { id: 'treino', rotulo: 'Treinamentos', Icone: BookOpen },
];

export const rotuloDaSecao = (s: SecaoDoPortal) => ITENS.find(i => i.id === s)?.rotulo ?? '';

/**
 * Cinco itens fixos no rodapé, ao alcance do polegar. O ativo ganha a pílula
 * laranja (preenchimento — o rótulo segue grafite). `avisos` acende um ponto
 * no item: registro de ponto em análise, treinamento vencendo.
 */
export const RodapeDoPortal: React.FC<{
    ativa: SecaoDoPortal;
    onIr: (s: SecaoDoPortal) => void;
    avisos?: Partial<Record<SecaoDoPortal, string>>;
}> = ({ ativa, onIr, avisos = {} }) => (
    // Container query em `em`: vale para zoom do navegador e para letra grande do
    // celular. Abaixo de ~19,5em os cinco rótulos não cabem (com texto a 200% em
    // 360px eles se sobrepunham e a página rolava de lado); aí o rodapé fica só com
    // os ícones, maiores, e o rótulo vira o nome acessível do botão.
    <nav aria-label="Seções do portal"
        className="@container sticky bottom-0 z-20 bg-white border-t border-[#4B4B4D]/10 pb-[env(safe-area-inset-bottom)]">
        {/* Colunas do tamanho do rótulo (não 5 iguais): em 360px, "Documentos" e
            "Treinamentos" iguais a 72px se encostavam e tocavam a borda. */}
        <ul className="flex justify-between gap-1 px-2 @max-[19.5em]:grid @max-[19.5em]:grid-cols-5 @max-[19.5em]:px-0">
            {ITENS.map(({ id, rotulo, Icone }) => {
                const ativo = ativa === id;
                const aviso = avisos[id];
                return (
                    <li key={id} className="min-w-0">
                        <button type="button" onClick={() => onIr(id)} aria-current={ativo ? 'page' : undefined}
                            className={`min-w-11 min-h-16 flex flex-col items-center justify-center gap-1 px-1 py-2 @max-[19.5em]:w-full @max-[19.5em]:min-w-0 ${MARCA.foco}`}>
                            <span className={`flex items-center justify-center w-12 max-w-full h-7 @max-[19.5em]:h-auto @max-[19.5em]:py-1 rounded-full transition-colors ${ativo ? MARCA.laranjaFundo : ''}`}>
                                <span className="relative">
                                    <Icone className={`w-5 h-5 @max-[19.5em]:w-6 @max-[19.5em]:h-6 ${ativo ? MARCA.texto : MARCA.secundario}`} />
                                    {aviso && (
                                        <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#A84A1C] ring-2 ${ativo ? 'ring-[#FF884C]' : 'ring-white'}`} aria-hidden="true" />
                                    )}
                                </span>
                            </span>
                            {/* Mesmo peso ativo e inativo: em 360px o negrito alargava
                                "Treinamentos" até cortar. Quem marca o ativo é a pílula. */}
                            <span className={`text-xs leading-tight font-medium whitespace-nowrap @max-[19.5em]:sr-only ${ativo ? MARCA.texto : MARCA.secundario}`}>
                                {rotulo}
                            </span>
                            {aviso && <span className="sr-only">({aviso})</span>}
                        </button>
                    </li>
                );
            })}
        </ul>
    </nav>
);

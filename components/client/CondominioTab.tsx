// components/client/CondominioTab.tsx
// Portal do Cliente › aba "Condomínio".
// Plano: docs/planos/2026-09-01-condominio-no-portal-do-cliente.md
//
// POR QUE ESTA ABA EXISTE: 6 dos 8 clientes de locação também são condôminos, e
// a Defensoria Pública de MG chegou a ter DOIS links — um do portal do cliente,
// outro do portal do condômino. O pedido foi parar de obrigar a mesma pessoa a
// entrar por dois lugares.
//
// O QUE ELA NÃO REPETE: a cota condominial já cai no Financeiro (as duas pontas
// falam `internal_transactions` CREDIT + `party_id`), e os chamados já vivem em
// Manutenção (`client_requests`). Trazer isso para cá seria dois caminhos para a
// mesma informação — é assim que nasce divergência. Aqui ficam só as três
// coisas que não tinham lugar: unidades, avisos e documentos do prédio.
//
// ARQUIVO NOVO, e não mais 400 linhas dentro de `ClientArea.tsx`: aquele
// monolito já tem 4592 linhas e é o único portal que ainda não foi fatiado
// (investidor e fornecedor já vivem em `components/*/portal/*`).
//
// ⚠️ §24 NÃO se aplica: a exceção do vocabulário coral cobre só Investidor e
// Fornecedor. O Portal do Cliente segue o padrão do app, na identidade indigo.
import React from 'react';
import {
    Building2, Megaphone, FileText, ExternalLink, Check, Users, Scale,
} from 'lucide-react';
import type {
    PortalCondominio, PortalUnidadeCondominio, PortalAvisoCondominio,
} from '../../services/clientPortalService';

/** Papéis do banco em português de gente. */
const PAPEL_LABEL: Record<string, string> = {
    PROPRIETARIO: 'Proprietário',
    INQUILINO: 'Inquilino',
    MORADOR: 'Morador',
    RESPONSAVEL_FINANCEIRO: 'Responsável financeiro',
};
const papel = (p: string) => PAPEL_LABEL[p] ?? p;

/** §8 — status como texto colorido, sem pílula. */
const COR_CATEGORIA: Record<string, string> = {
    URGENTE: 'text-red-600',
    ASSEMBLEIA: 'text-indigo-600',
    MANUTENCAO: 'text-amber-600',
    OBRA: 'text-blue-600',
    AVISO: 'text-gray-500',
};
const CATEGORIA_LABEL: Record<string, string> = {
    URGENTE: 'Urgente', ASSEMBLEIA: 'Assembleia', MANUTENCAO: 'Manutenção',
    OBRA: 'Obra', AVISO: 'Aviso',
};

const CATEGORIA_DOC: Record<string, string> = {
    CONVENCAO: 'Convenção', REGULAMENTO: 'Regulamento', ATA: 'Ata',
    MANUAL: 'Manual', LAUDO: 'Laudo', SEGURO: 'Seguro', OUTRO: 'Outro',
};

const data = (iso: string | null) =>
    iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—';

const numero = (v: number | null, sufixo = '') =>
    v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${sufixo}`;

/** Agrupa as unidades por condomínio, preservando a ordem em que a RPC as
 *  devolveu (condomínio → torre → unidade).
 *
 *  Exportada para teste: é a única regra desta tela que erra em silêncio. Com
 *  duas unidades no mesmo prédio, um agrupamento errado renderiza dois cabeçalhos
 *  iguais — e ninguém olha um print procurando cabeçalho repetido. Defensoria e
 *  Reginaldo têm 3 unidades cada, então é o caso comum, não a exceção. */
export function agruparPorCondominio(unidades: PortalUnidadeCondominio[]) {
    const mapa = new Map<string, {
        id: string; nome: string; code: string | null; cnpj: string | null;
        unidades: PortalUnidadeCondominio[];
    }>();
    for (const u of unidades) {
        const atual = mapa.get(u.condominioId);
        if (atual) atual.unidades.push(u);
        else mapa.set(u.condominioId, {
            id: u.condominioId, nome: u.condominioNome, code: u.condominioCode, cnpj: u.condominioCnpj, unidades: [u],
        });
    }
    return [...mapa.values()];
}

/** A fração vem em decimal e é lida em porcentagem. 4 casas porque é o que a
 *  convenção registra — arredondar faria a soma das unidades não fechar 100%.
 *  Exportada junto com o agrupamento: já houve um erro de escala de 100× neste
 *  domínio (frações salvas como 0,0833 em campo de %). */
export function fracaoParaPercentual(v: number | null | undefined): string {
    if (v == null) return '—';
    return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`;
}

interface Props {
    dados: PortalCondominio;
    loading: boolean;
    /** Só existe no acesso por link. Sem ele a aba é leitura pura — marcar lido
     *  é ato do morador, e o admin espiando não pode gravar em nome dele. */
    onMarcarLido?: (avisoId: string) => void;
    /** A barra de abas do desktop, injetada pela tela dona (§19.3). */
    desktopTabsBar?: React.ReactNode;
    /** Resolve o endereço de um documento — assinado, quando o arquivo é nosso.
     *  Quem sabe a identidade (token do link × cliente logado) é a tela dona,
     *  como já acontece com `onMarcarLido`. */
    onResolverDocumento?: (documentoId: string) => Promise<string>;
}

const CondominioTab: React.FC<Props> = ({ dados, loading, onMarcarLido, desktopTabsBar, onResolverDocumento }) => {
    const porCondominio = React.useMemo(
        () => agruparPorCondominio(dados.unidades), [dados.unidades]);

    const naoLidos = dados.avisos.filter(a => !a.lido).length;

    const [erroDocumento, setErroDocumento] = React.useState<string | null>(null);

    /**
     * Documento ENVIADO vem com `url` nula: o arquivo mora em bucket privado e o
     * endereço nasce assinado, na hora. Só link externo abre direto.
     *
     * A aba é aberta JÁ no clique, ainda em branco, porque `window.open` depois
     * de um `await` é bloqueado como pop-up.
     */
    const abrirDocumento = async (d: { id: string; url: string | null }) => {
        setErroDocumento(null);
        if (d.url) { window.open(d.url, '_blank', 'noopener'); return; }
        if (!onResolverDocumento) {
            setErroDocumento('Este documento não pode ser aberto por aqui.');
            return;
        }
        const janela = window.open('', '_blank');
        try {
            const url = await onResolverDocumento(d.id);
            if (janela) janela.location.href = url;
            else window.open(url, '_blank', 'noopener');
        } catch (e: any) {
            janela?.close();
            setErroDocumento(e?.message || 'Não foi possível abrir o documento.');
        }
    };

    if (loading) {
        return (
            <div className="animate-in fade-in duration-300">
                {desktopTabsBar}
                <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100">
                    <div className="animate-pulse space-y-4">
                        <div className="h-6 bg-gray-100 rounded w-1/3" />
                        <div className="h-24 bg-gray-50 rounded-[1.5rem]" />
                        <div className="h-24 bg-gray-50 rounded-[1.5rem]" />
                    </div>
                </div>
            </div>
        );
    }

    // §12 — estado vazio que DIZ o que houve. A aba é habilitada à mão, então
    // ela pode estar ligada para quem não tem unidade nenhuma; tela em branco
    // deixaria a pessoa achando que o sistema quebrou.
    if (!dados.unidades.length) {
        return (
            <div className="animate-in fade-in duration-300">
                {desktopTabsBar}
                <div className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-gray-100 text-center">
                    <div className="w-14 h-14 rounded-[1rem] bg-gray-50 flex items-center justify-center mx-auto mb-4">
                        <Building2 className="w-7 h-7 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Nenhuma unidade de condomínio</h3>
                    <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
                        Este cadastro não consta como proprietário, inquilino ou responsável
                        financeiro de nenhuma unidade em condomínio. Se isso não estiver
                        certo, fale com a administração.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            {desktopTabsBar}

            {/* ── Minhas unidades ── */}
            {porCondominio.map(cond => (
                <div key={cond.id} className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-gradient-to-br from-[#0c1a6e] via-blue-800 to-blue-600 px-6 md:px-10 py-6">
                        <div className="flex items-center gap-2.5">
                            <Building2 className="w-5 h-5 text-blue-200" />
                            <h2 className="text-xl md:text-2xl font-black text-white leading-tight">{cond.nome}</h2>
                        </div>
                        <p className="text-blue-200 text-sm font-medium mt-1">
                            {cond.unidades.length === 1 ? '1 unidade' : `${cond.unidades.length} unidades`}
                            {cond.cnpj ? ` · CNPJ ${cond.cnpj}` : ''}
                        </p>
                    </div>

                    <div className="p-4 md:p-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {cond.unidades.map(u => (
                            <div key={u.unitId} className="rounded-[1.5rem] border border-gray-100 bg-gray-50/40 p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900">{u.unidade}</h3>
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            {[u.torre, u.pavimento != null ? `Pavimento ${u.pavimento}` : null, u.tipologia]
                                                .filter(Boolean).join(' · ') || '—'}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs text-gray-400">Fração ideal</p>
                                        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1 justify-end">
                                            <Scale className="w-3.5 h-3.5 text-gray-400" />
                                            {fracaoParaPercentual(u.fracaoIdeal)}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
                                    <div>
                                        <p className="text-xs text-gray-400">Área privativa</p>
                                        <p className="text-sm font-medium text-gray-700">{numero(u.areaPrivativa, ' m²')}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">
                                            {u.papeis.length === 1 ? 'Seu papel' : 'Seus papéis'}
                                        </p>
                                        <p className="text-sm font-medium text-gray-700">
                                            {u.papeis.map(papel).join(', ') || '—'}
                                        </p>
                                    </div>
                                </div>

                                {/* Quem mais consta. Só papel e nome — o portal não expõe
                                    documento nem contato de terceiro. */}
                                {u.ocupacoes.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-gray-100">
                                        <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-2">
                                            <Users className="w-3.5 h-3.5" /> Quem consta na unidade
                                        </p>
                                        <ul className="space-y-1">
                                            {u.ocupacoes.map((o, i) => (
                                                <li key={`${o.papel}-${o.nome}-${i}`} className="text-sm text-gray-600">
                                                    <span className="text-gray-400">{papel(o.papel)}:</span> {o.nome}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* ── Avisos ── */}
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-6 md:p-10">
                <div className="flex items-center gap-2.5 mb-1">
                    <Megaphone className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-xl font-black text-gray-900">Avisos</h2>
                    {naoLidos > 0 && (
                        <span className="text-sm font-semibold text-indigo-600">
                            {naoLidos} {naoLidos === 1 ? 'não lido' : 'não lidos'}
                        </span>
                    )}
                </div>
                <p className="text-sm text-gray-500 mb-5">Comunicados da administração do condomínio</p>

                {dados.avisos.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhum aviso publicado no momento.</p>
                ) : (
                    <div className="space-y-3">
                        {dados.avisos.map((a: PortalAvisoCondominio) => (
                            <div
                                key={a.id}
                                onClick={() => { if (!a.lido) onMarcarLido?.(a.id); }}
                                className={`rounded-[1.5rem] border p-5 transition-all ${
                                    a.lido ? 'border-gray-100 bg-white'
                                           : 'border-indigo-100 bg-indigo-50/40 cursor-pointer hover:bg-indigo-50/70'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <h3 className="text-base font-bold text-gray-900">{a.titulo}</h3>
                                    {a.lido ? (
                                        <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
                                            <Check className="w-3.5 h-3.5" /> Lido
                                        </span>
                                    ) : (
                                        <span className="text-xs font-semibold text-indigo-600 shrink-0">Não lido</span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-600 mt-2 whitespace-pre-line">{a.corpo}</p>
                                <p className="text-xs text-gray-400 mt-3">
                                    <span className={COR_CATEGORIA[a.categoria] ?? 'text-gray-500'}>
                                        {CATEGORIA_LABEL[a.categoria] ?? a.categoria}
                                    </span>
                                    {' · '}{data(a.publicadoEm)}
                                    {porCondominio.length > 1 ? ` · ${a.condominioNome}` : ''}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Documentos do condomínio ── */}
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 p-6 md:p-10">
                <div className="flex items-center gap-2.5 mb-1">
                    <FileText className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-xl font-black text-gray-900">Documentos do condomínio</h2>
                </div>
                <p className="text-sm text-gray-500 mb-5">Convenção, regulamento interno e atas</p>

                {dados.documentos.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhum documento publicado no momento.</p>
                ) : (
                    <div className="space-y-2">
                        {dados.documentos.map(d => (
                            /* Botão, e não <a href>: arquivo enviado tem `url`
                               nula, e o React OMITE o atributo — a âncora fica
                               sem href, deixa de ser link, e o clique não faz
                               nada nem reclama. Era esse o defeito. */
                            <button
                                key={d.id}
                                type="button"
                                onClick={() => abrirDocumento(d)}
                                className="w-full text-left flex items-center justify-between gap-3 rounded-[1rem] border border-gray-100 p-4 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{d.titulo}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {CATEGORIA_DOC[d.categoria] ?? d.categoria}
                                        {d.descricao ? ` · ${d.descricao}` : ''}
                                        {porCondominio.length > 1 ? ` · ${d.condominioNome}` : ''}
                                    </p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
                            </button>
                        ))}
                    </div>
                )}

                {erroDocumento && (
                    <p className="text-sm text-red-600 mt-3">{erroDocumento}</p>
                )}
            </div>
        </div>
    );
};

export default CondominioTab;

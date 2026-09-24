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
// ⚠️ §24 PASSOU a se aplicar aqui. Até 21/09/2026 o vocabulário coral cobria só
// Investidor e Fornecedor e este portal seguia o indigo do app; em 22-23/09 o
// usuário mandou alinhar o Portal do Cliente ao do Fornecedor — casca, menu de
// conta, banners e, agora, as sub-abas desta tela (`PortalTabs` do PortalKit).
// Se for mexer aqui, é o coral que manda, não o indigo.
import React from 'react';
import {
    Building2, Megaphone, FileText, ExternalLink, Check, Users, Scale,
    Wrench, Package, Wallet, CalendarClock,
} from 'lucide-react';
import type {
    PortalCondominio, PortalUnidadeCondominio, PortalAvisoCondominio,
    PortalRateioCondominio,
} from '../../services/clientPortalService';
import { CRITERIO_LABEL, type CriterioRateio } from '../../services/condominioRateioService';
// O MESMO rótulo do admin. O payload traz a descrição como está no banco, e os
// rateios criados antes de 23/09/2026 guardaram o texto cru do boleto — podar
// aqui é o que faz o condômino ler "ENERGISA SUL-SUDESTE" em vez do nome do
// arquivo. Ver `utils/despesaCondominio.ts`.
import { rotuloDeDespesa } from '../../utils/despesaCondominio';
import { PortalTabs } from '../portal/PortalKit';
import { usePersistedState } from '../ui/TableUtils';

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

/** Periodicidade do plano em português de gente: "a cada 6 meses", não "6 MES". */
const UNIDADE_PERIODO: Record<string, [string, string]> = {
    DIA: ['dia', 'dias'], SEMANA: ['semana', 'semanas'],
    MES: ['mês', 'meses'], ANO: ['ano', 'anos'],
};
export function periodicidade(valor: number | null, unidade: string | null): string {
    if (!valor || !unidade) return '—';
    const par = UNIDADE_PERIODO[unidade.toUpperCase()];
    if (!par) return `a cada ${valor} ${unidade.toLowerCase()}`;
    return `a cada ${valor} ${valor === 1 ? par[0] : par[1]}`;
}

/** §8 — texto colorido, sem pílula. */
const COR_SITUACAO_ORDEM: Record<string, string> = {
    CONCLUIDA: 'text-emerald-600', EM_EXECUCAO: 'text-blue-600',
    AGENDADA: 'text-amber-600', ABERTA: 'text-gray-600', CANCELADA: 'text-gray-400',
};
// Os cinco valores de `MaintenanceOrderStatus` (types/condominio.ts) — faltava
// ABERTA, que caía no fallback e aparecia CRU, em caixa alta, no meio de
// rótulos em português. Mesmo caso de INSPECAO logo abaixo.
const LABEL_SITUACAO_ORDEM: Record<string, string> = {
    CONCLUIDA: 'Concluída', EM_EXECUCAO: 'Em execução',
    AGENDADA: 'Agendada', ABERTA: 'Aberta', CANCELADA: 'Cancelada',
};
const LABEL_TIPO_ORDEM: Record<string, string> = {
    PREVENTIVA: 'Preventiva', CORRETIVA: 'Corretiva', INSPECAO: 'Inspeção',
};
// Rótulo de tipo. O de CRITÉRIO vem do service (`CRITERIO_LABEL`), não de uma
// cópia aqui: a minha cópia trazia "IGUALITARIO", que NÃO existe — o
// vocabulário real é FRACAO_IDEAL | IGUAL | AREA_PRIVATIVA | GRUPO | FIXO, e os
// dois últimos ficariam sem rótulo. Uma fonte só.
const LABEL_TIPO_RATEIO: Record<string, string> = {
    ORDINARIO: 'Ordinária', EXTRAORDINARIO: 'Extraordinária',
};

const CATEGORIA_DOC: Record<string, string> = {
    CONVENCAO: 'Convenção', REGULAMENTO: 'Regulamento', ATA: 'Ata',
    MANUAL: 'Manual', LAUDO: 'Laudo', SEGURO: 'Seguro', OUTRO: 'Outro',
};

const data = (iso: string | null) =>
    iso ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '—';

const dinheiro = (v: number | null | undefined) =>
    v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** `competencia` é DATE ('2026-08-01'). Nunca `new Date(iso)` — o fuso come um
 *  dia e a competência vira o mês anterior. */
export const competencia = (iso: string) => {
    const [ano, mes] = iso.slice(0, 10).split('-');
    return `${mes}/${ano}`;
};

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

/** As seis seções da aba, na ordem pedida pelo usuário em 24/09/2026
 *  ("transforme cada painel em uma aba"). Os rótulos são os que ele escreveu —
 *  não encurtar: o `PortalTabs` rola na horizontal quando não cabe. */
const ABAS = [
    { id: 'dados', label: 'Dados Gerais' },
    { id: 'avisos', label: 'Avisos' },
    { id: 'documentos', label: 'Documentos do condomínio' },
    { id: 'financeiro', label: 'Financeiro do condomínio' },
    { id: 'manutencao', label: 'Manutenção do prédio' },
    { id: 'equipamentos', label: 'Equipamentos do prédio' },
] as const;

export type AbaCondominio = typeof ABAS[number]['id'];

/** Aba salva que não existe mais (id aposentado, lixo de outra versão) cairia
 *  num render SEM painel nenhum e sem aba ativa — tela branca por um valor que
 *  ninguém lembra de ter gravado. Exportada porque erra exatamente do jeito que
 *  este arquivo já decidiu testar: em silêncio. */
export const resolverAba = (salva: string | null | undefined): AbaCondominio =>
    ABAS.some(a => a.id === salva) ? (salva as AbaCondominio) : 'dados';

/** Cabeçalho de seção dentro do card de abas: o rótulo da aba já diz o nome, então
 *  aqui fica só o que ele não carrega — a frase que explica o que a seção mostra. */
const Descricao: React.FC<{ icone: React.ReactNode; children: React.ReactNode }> = ({ icone, children }) => (
    <p className="flex items-center gap-2 text-sm text-gray-500 mb-5">
        <span className="text-[#E1553C]">{icone}</span>
        {children}
    </p>
);

/** Estado vazio §12. Empilhado, era uma linha cinza no meio da pilha; virando
 *  aba, é a tela inteira daquela aba — então ganha o ritmo do §12. */
const Vazio: React.FC<{ icone: React.ReactNode; titulo: string; texto?: string }> = ({ icone, titulo, texto }) => (
    <div className="text-center py-12">
        <span className="inline-block text-gray-300 mb-4">{icone}</span>
        <h3 className="text-lg font-bold text-gray-900 mb-2">{titulo}</h3>
        {texto && <p className="text-sm text-gray-500 max-w-md mx-auto">{texto}</p>}
    </div>
);

type Grupo = ReturnType<typeof agruparPorCondominio>[number];

/* ⚠️ Os seis painéis são declarados AQUI, no escopo do módulo — nunca dentro de
   `CondominioTab`. Componente declarado dentro do pai é um tipo novo a cada
   render: o React desmonta e remonta, e o estado interno some. `PainelDocumentos`
   guarda a mensagem de erro, e o pai re-renderiza toda vez que `onMarcarLido`
   atualiza os avisos lá no `ClientArea`. */

// ── Dados Gerais ─────────────────────────────────────────────────────────────
const PainelDadosGerais: React.FC<{ grupos: Grupo[] }> = ({ grupos }) => (
    <div className="space-y-4">
        {grupos.map((cond: Grupo) => (
            <div key={cond.id} className="rounded-[10px] border border-gray-100 overflow-hidden">
                <div className="bg-[#E1553C] px-5 md:px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                        <Building2 className="w-4 h-4 text-white/80" />
                        <h2 className="text-lg font-bold text-white leading-tight">{cond.nome}</h2>
                    </div>
                    <p className="text-white/80 text-xs font-medium mt-0.5">
                        {cond.unidades.length === 1 ? '1 unidade' : `${cond.unidades.length} unidades`}
                        {cond.cnpj ? ` · CNPJ ${cond.cnpj}` : ''}
                    </p>
                </div>

                <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {cond.unidades.map((u: PortalUnidadeCondominio) => (
                        <div key={u.unitId} className="rounded-[10px] border border-gray-100 bg-gray-50/40 p-5">
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
    </div>
);

// ── Avisos ───────────────────────────────────────────────────────────────────
const PainelAvisos: React.FC<{
    avisos: PortalAvisoCondominio[];
    multi: boolean;
    naoLidos: number;
    onMarcarLido?: (avisoId: string) => void;
}> = ({ avisos, multi, naoLidos, onMarcarLido }) => (
    <div>
        <Descricao icone={<Megaphone className="w-4 h-4" />}>
            Comunicados da administração do condomínio
            {naoLidos > 0 && (
                <span className="font-semibold text-[#C24428]">
                    · {naoLidos} {naoLidos === 1 ? 'não lido' : 'não lidos'}
                </span>
            )}
        </Descricao>
        {avisos.length === 0 ? (
<Vazio
    icone={<Megaphone className="w-12 h-12" />}
    titulo="Nenhum aviso publicado"
    texto="Quando a administração publicar um comunicado, ele aparece aqui."
/>
        ) : (
            <div className="space-y-3">
                {avisos.map((a: PortalAvisoCondominio) => (
                    <div
                        key={a.id}
                        onClick={() => { if (!a.lido) onMarcarLido?.(a.id); }}
                        /* Sem `onMarcarLido` (prévia do síndico) o card não é clicável:
                           cursor de mão que não faz nada é promessa falsa. */
                        className={`rounded-[10px] border p-5 transition-all ${
                            a.lido || !onMarcarLido
                                ? 'border-gray-100 bg-white'
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
                            {multi ? ` · ${a.condominioNome}` : ''}
                        </p>
                    </div>
                ))}
            </div>
        )}
    </div>
);

// ── Documentos do condomínio ─────────────────────────────────────────────────
const PainelDocumentos: React.FC<{
    documentos: PortalCondominio['documentos'];
    multi: boolean;
    onResolverDocumento?: (documentoId: string) => Promise<string>;
}> = ({ documentos, multi, onResolverDocumento }) => {
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

    return (
        <div>
            <Descricao icone={<FileText className="w-4 h-4" />}>
                Convenção, regulamento interno e atas
            </Descricao>
            {documentos.length === 0 ? (
<Vazio
    icone={<FileText className="w-12 h-12" />}
    titulo="Nenhum documento publicado"
    texto="Convenção, regulamento e atas aparecem aqui quando a administração os publicar."
/>
            ) : (
                <div className="space-y-2">
                    {documentos.map(d => (
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
                                    {multi ? ` · ${d.condominioNome}` : ''}
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
    );
};

// ── Financeiro do condomínio ─────────────────────────────────────────────────
/* O rateio INTEIRO, com a cota de todas as unidades — decisão do usuário em
   23/09/2026 entre "só a minha", "minha + despesas" e "tudo": transparência de
   assembleia. A cota de quem está olhando vem marcada (`minha`). */
const PainelFinanceiro: React.FC<{ rateios: PortalRateioCondominio[]; multi: boolean }> = ({ rateios, multi }) => (
    <div>
        <Descricao icone={<Wallet className="w-4 h-4" />}>
            Despesas do prédio e o rateio entre as unidades
        </Descricao>
        {rateios.length === 0 ? (
            <Vazio
                icone={<Wallet className="w-12 h-12" />}
                titulo="Nenhum rateio publicado"
                texto="Assim que a administração fechar a competência, o rateio aparece aqui."
            />
        ) : (
            <div className="space-y-4">
                {rateios.map((r: PortalRateioCondominio) => (
                    <div key={r.id} className="rounded-[10px] border border-gray-100 overflow-hidden">
                        <div className="bg-gray-50/60 px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100">
                            <div>
                                <p className="text-base font-bold text-gray-900">
                                    Competência {competencia(r.competencia)}
                                    {r.numero ? <span className="text-sm font-normal text-gray-400"> · {r.numero}</span> : null}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {/* O TIPO importa para quem lê: despesa extraordinária
                                        costuma ser do proprietário, a ordinária do
                                        inquilino — e a mesma tela serve aos dois. */}
                                    Taxa {(LABEL_TIPO_RATEIO[r.tipo] ?? r.tipo).toLowerCase()}
                                    {' · rateada por '}
                                    {(CRITERIO_LABEL[r.criterio as CriterioRateio] ?? r.criterio).toLowerCase()}
                                    {multi ? ` · ${r.condominioNome}` : ''}
                                </p>
                            </div>
                            {/* §8 — texto colorido, sem pílula. Rascunho é PRÉVIA: o número
                                ainda pode mudar, e omitir isso seria pior que não mostrar. */}
                            {r.status === 'RASCUNHO' ? (
                                <span className="text-sm font-normal text-amber-600">Prévia — pode mudar</span>
                            ) : (
                                <span className="text-sm font-normal text-emerald-600">
                                    Fechado{r.fechadoEm ? ` em ${data(r.fechadoEm.slice(0, 10))}` : ''}
                                </span>
                            )}
                        </div>

                        <div className="p-5 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-gray-400">Despesas do mês</p>
                                    <p className="text-lg font-bold text-gray-900">{dinheiro(r.totalDespesas)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400">Sua cota</p>
                                    <p className="text-lg font-bold text-indigo-600">
                                        {dinheiro(r.cotas.filter(c => c.minha).reduce((s2, c) => s2 + Number(c.valor || 0), 0))}
                                    </p>
                                </div>
                            </div>

                            {r.despesas.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 mb-2">O que entrou no rateio</p>
                                    <div className="space-y-1.5">
                                        {r.despesas.map(d => (
                                            <div key={d.id} className="flex items-center justify-between gap-3 text-sm">
                                                <span className="text-gray-600 truncate" title={d.descricao}>
                                                    {rotuloDeDespesa(d.descricao) ?? 'Despesa sem descrição'}
                                                </span>
                                                <span className="text-gray-800 font-medium shrink-0">{dinheiro(d.valor)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {r.cotas.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 mb-2">Rateio por unidade</p>
                                    <div className="space-y-1">
                                        {r.cotas.map(c => (
                                            <div
                                                key={c.id}
                                                className={`flex items-center justify-between gap-3 text-sm rounded-[6px] px-2.5 py-1.5 ${
                                                    c.minha ? 'bg-indigo-50/60' : ''
                                                }`}
                                            >
                                                <span className="min-w-0 truncate text-gray-600">
                                                    <span className={c.minha ? 'font-semibold text-gray-900' : ''}>
                                                        {[c.torre, c.unidade].filter(Boolean).join(' · ') || '—'}
                                                    </span>
                                                    {c.pessoa ? <span className="text-gray-400"> · {c.pessoa}</span> : null}
                                                    {c.minha ? <span className="text-indigo-600 font-semibold"> · sua unidade</span> : null}
                                                </span>
                                                <span className={`shrink-0 ${c.minha ? 'font-bold text-indigo-600' : 'font-medium text-gray-800'}`}>
                                                    {dinheiro(c.valor)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

// ── Manutenção do prédio ─────────────────────────────────────────────────────
const PainelManutencao: React.FC<{
    manutencao: PortalCondominio['manutencao'];
    ordens: PortalCondominio['ordens'];
    multi: boolean;
}> = ({ manutencao, ordens, multi }) => (
    <div>
        <Descricao icone={<Wrench className="w-4 h-4" />}>
            O plano da NBR 5674 e as ordens de serviço da administração
        </Descricao>
        {manutencao.length === 0 && ordens.length === 0 ? (
            <Vazio
                icone={<Wrench className="w-12 h-12" />}
                titulo="Nenhum plano de manutenção publicado"
                texto="O plano da NBR 5674 e as ordens de serviço aparecem aqui quando a administração os publicar."
            />
        ) : (
            <div className="space-y-6">
                {manutencao.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">O que é mantido</p>
                        <div className="space-y-2">
                            {manutencao.map(m => (
                                <div key={m.id} className="rounded-[10px] border border-gray-100 p-4 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{m.descricao}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {m.sistema ? `${m.sistema} · ` : ''}
                                            {periodicidade(m.periodicidadeValor, m.periodicidadeUnidade)}
                                            {multi ? ` · ${m.condominioNome}` : ''}
                                        </p>
                                    </div>
                                    {m.proximoVencimento && (
                                        <span className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
                                            <CalendarClock className="w-3.5 h-3.5" />
                                            {data(m.proximoVencimento)}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {ordens.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Ordens de serviço</p>
                        <div className="space-y-2">
                            {ordens.map(o => (
                                <div key={o.id} className="rounded-[10px] border border-gray-100 p-4 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-900">{o.descricao}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {o.codigo ? `${o.codigo} · ` : ''}
                                            {LABEL_TIPO_ORDEM[o.tipo] ?? o.tipo}
                                            {o.sistema ? ` · ${o.sistema}` : ''}
                                            {o.executadaEm
                                                ? ` · executada em ${data(o.executadaEm)}`
                                                : o.agendadaPara ? ` · agendada para ${data(o.agendadaPara)}` : ''}
                                        </p>
                                    </div>
                                    <span className={`text-sm font-normal shrink-0 ${COR_SITUACAO_ORDEM[o.situacao] ?? 'text-gray-600'}`}>
                                        {LABEL_SITUACAO_ORDEM[o.situacao] ?? o.situacao}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}
    </div>
);

// ── Equipamentos do prédio ───────────────────────────────────────────────────
/* Sem valor de compra, fornecedor nem número de série — a garantia entra porque
   é o que o condômino tem interesse em cobrar. */
const PainelEquipamentos: React.FC<{ ativos: PortalCondominio['ativos']; multi: boolean }> = ({ ativos, multi }) => (
    <div>
        <Descricao icone={<Package className="w-4 h-4" />}>
            Elevadores, bombas e demais ativos, com a garantia do fornecedor
        </Descricao>
        {ativos.length === 0 ? (
            <Vazio
                icone={<Package className="w-12 h-12" />}
                titulo="Nenhum equipamento cadastrado"
                texto="Elevadores, bombas e demais ativos do prédio aparecem aqui."
            />
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {ativos.map(a => (
                    <div key={a.id} className="rounded-[10px] border border-gray-100 p-4 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{a.nome}</p>
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                                {[a.sistema, a.marca, a.modelo].filter(Boolean).join(' · ') || a.categoria || '—'}
                                {multi ? ` · ${a.condominioNome}` : ''}
                            </p>
                        </div>
                        {a.garantiaAte && (
                            <span className="text-xs text-gray-500 shrink-0">
                                garantia até {data(a.garantiaAte)}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        )}
    </div>
);

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

    // §3 — a aba escolhida sobrevive a navegação e reload. Mesmo namespace de
    // `clientArea:viewMode`. A prévia do síndico divide a chave com o portal do
    // próprio gestor, de propósito: ele volta na aba em que estava, e é
    // localStorage do navegador dele.
    const [abaSalva, setAba] = usePersistedState<AbaCondominio>('clientArea:condominioSubtab', 'dados');
    const abaAtiva = resolverAba(abaSalva);

    if (loading) {
        return (
            <div className="animate-in fade-in duration-300">
                {desktopTabsBar}
                <div className="bg-white p-6 rounded-[10px] shadow-sm border border-gray-100">
                    <div className="animate-pulse space-y-4">
                        <div className="h-6 bg-gray-100 rounded w-1/3" />
                        <div className="h-24 bg-gray-50 rounded-[10px]" />
                        <div className="h-24 bg-gray-50 rounded-[10px]" />
                    </div>
                </div>
            </div>
        );
    }

    // §12 — estado vazio que DIZ o que houve. A aba é habilitada à mão, então
    // ela pode estar ligada para quem não tem unidade nenhuma; tela em branco
    // deixaria a pessoa achando que o sistema quebrou. Sem barra de abas: seis
    // abas abrindo seis painéis vazios é pior que uma frase que explica.
    if (!dados.unidades.length) {
        return (
            <div className="animate-in fade-in duration-300">
                {desktopTabsBar}
                <div className="bg-white p-6 rounded-[10px] shadow-sm border border-gray-100 text-center">
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

    const multi = porCondominio.length > 1;
    // Contador só em Avisos: badge é PENDÊNCIA, não inventário. Seis números
    // cinzas empatam em importância e o único que muda o comportamento de quem
    // lê ("tem coisa nova pra mim") deixaria de saltar. `undefined` e não 0 —
    // o PortalTabs imprime o zero se receber o número.
    const abas = ABAS.map(a => (
        a.id === 'avisos' && naoLidos > 0 ? { ...a, count: naoLidos } : { ...a }
    ));

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
            {desktopTabsBar}

            {/* ⚠️ O card de abas é renderizado SEMPRE — nunca atrás de
                `{desktopTabsBar && …}`. Na prévia do síndico
                (`condominio/PortalCondominoAdmin`) não existe `desktopTabsBar`, e a
                tela ficaria presa numa aba só. */}
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
                {/* Qual prédio estou vendo. Sem isto, as outras cinco abas perdem o
                    contexto que vinha do banner coral. Em "Dados Gerais" NÃO aparece:
                    lá o banner já traz o nome, e repetir a dois centímetros de
                    distância é o §18 na prática. */}
                {abaAtiva !== 'dados' && (
                    <div className="flex items-center gap-1.5 px-4 pt-3 text-sm text-gray-500">
                        <Building2 className="w-3.5 h-3.5 text-gray-400" />
                        {multi ? `${porCondominio.length} condomínios` : porCondominio[0].nome}
                    </div>
                )}

                <PortalTabs tabs={abas} active={abaAtiva} onChange={(id) => setAba(id as AbaCondominio)} />

                <div className="p-4 md:p-6">
                    {abaAtiva === 'dados' && <PainelDadosGerais grupos={porCondominio} />}
                    {abaAtiva === 'avisos' && (
                        <PainelAvisos avisos={dados.avisos} multi={multi} naoLidos={naoLidos} onMarcarLido={onMarcarLido} />
                    )}
                    {abaAtiva === 'documentos' && (
                        <PainelDocumentos documentos={dados.documentos} multi={multi} onResolverDocumento={onResolverDocumento} />
                    )}
                    {abaAtiva === 'financeiro' && <PainelFinanceiro rateios={dados.rateios} multi={multi} />}
                    {abaAtiva === 'manutencao' && (
                        <PainelManutencao manutencao={dados.manutencao} ordens={dados.ordens} multi={multi} />
                    )}
                    {abaAtiva === 'equipamentos' && <PainelEquipamentos ativos={dados.ativos} multi={multi} />}
                </div>
            </div>
        </div>
    );
};

export default CondominioTab;

// components/condominio/CondominioDetail.tsx
// ÒPURA Pós-Entrega — o edifício depois da entrega.
// Plano: docs/planos/2026-08-13-opura-condominios-avaliacao.md
//
// Um condomínio é o `Empreendimento` no estado EM_OPERACAO — não há entidade
// nem árvore nova. As torres e unidades são as mesmas que foram vendidas.
import React from 'react';
import { FileText, Users, Wrench, Save, Scale, Package, Megaphone, Wallet, AlertCircle, FolderOpen, Plus, Link2, Unlink } from 'lucide-react';
import ClientSelect, { type ClientOption } from '../ClientSelect';
import OcupacoesTab from './OcupacoesTab';
import ManutencaoTab from './ManutencaoTab';
import FracoesTab from './FracoesTab';
import AtivosTab from './AtivosTab';
import ComunicacaoTab from './ComunicacaoTab';
import DocumentosTab from './DocumentosTab';
import FinanceiroTab from './FinanceiroTab';
import { empreendimentoService } from '../../services/empreendimentoService';
import { clientService } from '../../services/clientService';
import Breadcrumb from '../ui/Breadcrumb';
import CostCenterSelect from '../CostCenterSelect';
import ActionIconButton from '../ui/ActionIconButton';
import { useConfirm } from '../ui/confirm';
import { condominioRateioService, type CentroDeCustoDisponivel } from '../../services/condominioRateioService';
import type { Empreendimento } from '../../types/empreendimento';

export type Aba = 'ficha' | 'ocupacoes' | 'fracoes' | 'documentos' | 'ativos' | 'manutencao' | 'financeiro' | 'comunicacao';

/** §19.1 — cada aba troca o assunto da tela, então troca o título junto. */
const TITULOS: Record<Aba, { titulo: string; subtitulo: string }> = {
    ficha: { titulo: 'Ficha do condomínio', subtitulo: 'CNPJ próprio, síndico e mandato' },
    ocupacoes: { titulo: 'Ocupações', subtitulo: 'quem é dono, quem mora e quem paga' },
    fracoes: { titulo: 'Frações ideais', subtitulo: 'transcrição da convenção registrada' },
    documentos: { titulo: 'Documentos', subtitulo: 'convenção, regulamento, atas e laudos' },
    ativos: { titulo: 'Ativos do edifício', subtitulo: 'equipamentos e garantia do fornecedor' },
    manutencao: { titulo: 'Manutenção predial', subtitulo: 'plano NBR 5674 e ordens de serviço' },
    financeiro: { titulo: 'Financeiro', subtitulo: 'rateio das despesas entre as unidades' },
    comunicacao: { titulo: 'Comunicação', subtitulo: 'avisos e documentos do portal' },
};

/**
 * Ação primária que a aba ativa publica na LINHA DO TÍTULO (§17: ação frequente
 * fica alinhada ao título, no tamanho compacto — não solta no meio da régua de
 * controles da tabela).
 *
 * O título é do PAI e o handler é do FILHO, então o sentido do slot é o inverso
 * do `tabsSlot`/`chromeSlot` do guia (§19.3/§19.4): em vez de o pai passar cromo
 * pronto para baixo, a aba registra o que sabe fazer e o pai desenha o botão —
 * um estilo de botão só, aqui, para as próximas abas não copiarem o terceiro.
 * O descritor é `{ label, onClick }`, não um `ReactNode`: nó novo a cada render
 * do filho re-disparava o efeito de registro.
 */
export interface AcaoDoTitulo {
    label: string;
    onClick: () => void;
}

interface Props {
    empreendimento: Empreendimento;
    /** Aba de entrada. Só quem chega por deep-link passa isto; o resto cai na ficha. */
    abaInicial?: Aba;
    onBack: () => void;
    onChanged?: (e: Empreendimento) => void;
}

/**
 * Nome do condomínio com o código, SEM repetir o que o nome já diz.
 *
 * Na base os condomínios se chamam "010 - Galeria Altavista": concatenar o
 * `code` produzia "010 - Galeria Altavista · 010 · …", e código repetido faz o
 * leitor procurar uma diferença que não existe.
 *
 * ⚠️ A comparação é por BORDA, não `includes`: com `includes`, o código "10"
 * seria dado como presente dentro de "Bloco 100" e sumiria justamente de quem
 * precisa dele. A borda é "não alfanumérico" em vez de uma lista de
 * separadores — a lista deixava passar "Galeria Altavista (010)", e toda lista
 * desse tipo esquece um caractere.
 *
 * O `code` é escapado porque vem digitado: um código "C+1" viraria
 * quantificador e derrubaria o cabeçalho inteiro com SyntaxError.
 */
export const identidadeDoCondominio = (name?: string | null, code?: string | null): string => {
    const nome = (name || '').trim();
    const cod = (code || '').trim();
    if (!cod) return nome;
    const escapado = cod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const borda = '[^0-9A-Za-zÀ-ÿ]';
    const jaNoNome = new RegExp(`(^|${borda})${escapado}($|${borda})`).test(nome);
    return jaNoNome ? nome : `${nome} · ${cod}`;
};

const CondominioDetail: React.FC<Props> = ({ empreendimento, abaInicial, onBack, onChanged }) => {
    const confirm = useConfirm();
    const [aba, setAba] = React.useState<Aba>(abaInicial ?? 'ficha');
    const [e, setE] = React.useState<Empreendimento>(empreendimento);
    const identidade = React.useMemo(
        () => identidadeDoCondominio(e.name, e.code),
        [e.name, e.code],
    );
    const [salvando, setSalvando] = React.useState(false);
    const [clientes, setClientes] = React.useState<ClientOption[]>([]);
    const [notification, setNotification] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const notify = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4500);
    };

    // ── Centros de custo do condomínio ────────────────────────────────────
    // O vínculo mora no lado INVERSO (`cost_centers_v2.empreendimento_id`), e
    // desde 19/09/2026 são N por condomínio — a despesa do rateio é a soma
    // deles. Até 23/09 só a aba Financeiro editava isso, e só depois de entrar
    // no condomínio e trocar de aba; a Ficha, que é onde se cadastra o
    // condomínio, não tinha o campo. As duas telas falam com o MESMO service,
    // então não há duas verdades — só duas portas para o mesmo dado.
    const [centros, setCentros] = React.useState<{ id: string; code: string; name: string }[]>([]);
    const [ccDisponiveis, setCcDisponiveis] = React.useState<CentroDeCustoDisponivel[]>([]);
    const [ccEscolhido, setCcEscolhido] = React.useState('');
    const [ccOcupado, setCcOcupado] = React.useState(false);

    const [ficha, setFicha] = React.useState({
        condominio_razao_social: e.condominio_razao_social || '',
        condominio_cnpj: e.condominio_cnpj || '',
        condominio_instalado_em: e.condominio_instalado_em || '',
        sindico_client_id: e.sindico_client_id || '',
        sindico_mandato_inicio: e.sindico_mandato_inicio || '',
        sindico_mandato_fim: e.sindico_mandato_fim || '',
        // Parâmetros do boleto da cota (fatia 2). Quem calcula é o Asaas, a
        // partir do vencimento — aqui só se guarda a política do condomínio.
        cobranca_multa_percent: String((e as any).cobranca_multa_percent ?? 2),
        cobranca_juros_mes_percent: String((e as any).cobranca_juros_mes_percent ?? 1),
    });

    const carregarCentros = React.useCallback(async () => {
        try {
            const [vinculados, livres] = await Promise.all([
                condominioRateioService.getCentrosDeCusto(e.id),
                condominioRateioService.listarDisponiveis(e.organization_id),
            ]);
            setCentros(vinculados);
            setCcDisponiveis(livres);
        } catch {
            // Falhar aqui não derruba a Ficha — é um campo, não o assunto.
            setCentros([]);
            setCcDisponiveis([]);
        }
    }, [e.id, e.organization_id]);

    React.useEffect(() => { carregarCentros(); }, [carregarCentros]);

    const vincularCentro = async () => {
        if (!ccEscolhido) return;
        setCcOcupado(true);
        try {
            const c = await condominioRateioService.vincular(ccEscolhido, e.id);
            // §22 — costura local, sem recarregar a tela. Reordena por código
            // para casar com a ordem que o service devolve na próxima carga.
            setCentros(prev => [...prev, c].sort((a, b) => a.code.localeCompare(b.code, 'pt-BR')));
            // Tira o escolhido da lista de livres e, junto, qualquer GRUPO que
            // tenha ficado sem filho — grupo vazio viraria uma linha morta no
            // drawer: não é escolhível e não abre nada.
            setCcDisponiveis(prev => {
                const restantes = prev.filter(d => d.id !== c.id);
                const paisComFilho = new Set(restantes.filter(d => d.selecionavel).map(d => d.parent_id));
                return restantes.filter(d => d.selecionavel || paisComFilho.has(d.id));
            });
            setCcEscolhido('');
            notify(`Centro de custo ${c.code} vinculado a este condomínio.`);
        } catch (err: any) {
            notify(err?.message || 'Erro ao vincular o centro de custo.', 'error');
        } finally { setCcOcupado(false); }
    };

    const desvincularCentro = async (alvo: { id: string; code: string; name: string }) => {
        const ultimo = centros.length === 1;
        const ok = await confirm({
            title: 'Desvincular o centro de custo?',
            message: `${alvo.code} — ${alvo.name} deixa de fazer parte do caixa deste condomínio. Nada é apagado: os lançamentos e os rateios já feitos continuam onde estão${ultimo ? ', mas novos rateios ficam sem de onde tirar despesa' : '; as despesas dele deixam de entrar nos próximos rateios'}.`,
            variant: 'warning',
            confirmLabel: 'Desvincular',
        });
        if (!ok) return;
        setCcOcupado(true);
        try {
            await condominioRateioService.desvincular(alvo.id);
            setCentros(prev => prev.filter(c => c.id !== alvo.id));
            // Recarrega os livres em vez de recolocar o item à mão: a linha
            // vinculada só guarda id/código/nome, e o drawer precisa do
            // `parent_id` do GRUPO para montar o accordion. Costura otimista
            // aqui devolveria um item órfão, que o componente desenharia como
            // raiz solta — o defeito que esta frente veio corrigir.
            try {
                setCcDisponiveis(await condominioRateioService.listarDisponiveis(e.organization_id));
            } catch { /* a lista se refaz no próximo carregamento */ }
            notify('Centro de custo desvinculado.');
        } catch (err: any) {
            notify(err?.message || 'Erro ao desvincular.', 'error');
        } finally { setCcOcupado(false); }
    };

    React.useEffect(() => {
        clientService.listClients(e.organization_id)
            .then(cs => setClientes((cs || []).map((c: any) => ({ id: c.id, name: c.name, document: c.document, email: c.email, city: c.city, state: c.state }))))
            .catch(() => setClientes([]));
    }, [e.organization_id]);

    /** Mandato vencido não representa o condomínio — o aviso precisa existir na tela. */
    const mandatoVencido = React.useMemo(() => {
        if (!ficha.sindico_mandato_fim) return false;
        return ficha.sindico_mandato_fim.slice(0, 10) < new Date().toISOString().slice(0, 10);
    }, [ficha.sindico_mandato_fim]);

    const salvarFicha = async () => {
        setSalvando(true);
        try {
            const atualizado = await empreendimentoService.update(e.id, {
                condominio_razao_social: ficha.condominio_razao_social || null,
                condominio_cnpj: ficha.condominio_cnpj || null,
                condominio_instalado_em: ficha.condominio_instalado_em || null,
                sindico_client_id: ficha.sindico_client_id || null,
                sindico_mandato_inicio: ficha.sindico_mandato_inicio || null,
                sindico_mandato_fim: ficha.sindico_mandato_fim || null,
                // Vazio vira o default legal, não NULL: a coluna é NOT NULL, e
                // "sem multa" tem de ser 0 digitado, não campo apagado.
                cobranca_multa_percent: Number(ficha.cobranca_multa_percent.replace(',', '.')) || 0,
                cobranca_juros_mes_percent: Number(ficha.cobranca_juros_mes_percent.replace(',', '.')) || 0,
            } as any);
            setE(atualizado);
            onChanged?.(atualizado);
            notify('Ficha do condomínio salva.');
        } catch (err: any) {
            notify(err?.message || 'Erro ao salvar a ficha.', 'error');
        } finally { setSalvando(false); }
    };

    /** A aba ativa publica aqui a própria ação primária (ver `AcaoDoTitulo`). */
    const [acaoDoTitulo, setAcaoDoTitulo] = React.useState<AcaoDoTitulo | null>(null);
    // Trocar de aba limpa o botão ANTES do filho novo montar: sem isto, a ação
    // da aba anterior fica na linha do título por um render da aba seguinte.
    React.useEffect(() => { setAcaoDoTitulo(null); }, [aba]);

    const abas: { id: Aba; label: string; icon: any }[] = [
        { id: 'ficha', label: 'Ficha', icon: FileText },
        { id: 'ocupacoes', label: 'Ocupações', icon: Users },
        // Fica entre Ocupações e Manutenção porque é da mesma família: quem
        // ocupa e quanto pesa cada unidade. É a base do rateio e do peso de
        // voto em assembleia, ambos pós-portão.
        { id: 'fracoes', label: 'Frações', icon: Scale },
        // Logo depois de Frações porque é de onde a fração VEM: a convenção
        // registrada é o documento que a fixa. Ler uma sem a outra à mão é o
        // que fez as 12 frações do piloto ficarem nulas por um ano.
        { id: 'documentos', label: 'Documentos', icon: FolderOpen },
        // Ativos vem ANTES de Manutenção porque é o alvo dela: sem equipamento
        // cadastrado, o plano fala de "elevador" no abstrato.
        { id: 'ativos', label: 'Ativos', icon: Package },
        { id: 'manutencao', label: 'Manutenção', icon: Wrench },
        // Depois de Manutenção porque é dela que sai boa parte da despesa a ratear.
        { id: 'financeiro', label: 'Financeiro', icon: Wallet },
        // Última porque é o que SAI do condomínio para o condômino — as demais
        // são o que se sabe sobre ele.
        { id: 'comunicacao', label: 'Comunicação', icon: Megaphone },
    ];

    return (
        <div className="space-y-6">
            {/* §20 — título solto, NUNCA em card. Copiei o cabeçalho em card do
                EmpreendimentoDetail, mas ele é exceção NOMEADA para telas que já
                existiam; tela nova segue o padrão.

                §23 — MIGALHA DE PÃO, a pedido do usuário (23/09/2026):
                "botao voltar nao pode ficar acima do título da tela". O botão
                "Voltar" gastava 32px de altura inteiros acima do h1; a trilha
                ocupa uma linha de 16px e ainda diz de onde se veio.
                ⚠️ Divergência CONSCIENTE do critério 2 da §23, que pede 3
                crumbs (2 saltos) e manda resolver 1 salto com "Voltar" — aqui
                há 1 salto só. O usuário escolheu a migalha depois de ver as
                três opções lado a lado. Registrada no guia, para não virar
                precedente silencioso. */}
            <div>
                <Breadcrumb
                    className="mb-1.5"
                    items={[
                        { label: 'Condomínios', onClick: onBack },
                        { label: identidade },
                    ]}
                />
                {/* §19.1/§20 — o título acompanha a aba ativa: cada uma troca o
                    conteúdo inteiro, e um <h1> fixo ficaria mentindo sobre o que
                    a tela mostra. A IDENTIDADE (qual condomínio) desce para o
                    subtítulo em vez de sumir — sem ela, saber "Manutenção" sem
                    saber "de qual prédio" é pior que o problema original. */}
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{TITULOS[aba].titulo}</h1>
                        <p className="text-gray-400 text-sm mt-1.5 font-medium">
                            {identidade}
                            {' · '}{TITULOS[aba].subtitulo}
                        </p>
                    </div>
                    {/* §17 — botão primário compacto, o único azul sólido da tela. */}
                    {acaoDoTitulo && (
                        <button
                            onClick={acaoDoTitulo.onClick}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 shrink-0 whitespace-nowrap"
                        >
                            <Plus className="w-[15px] h-[15px]" />
                            {acaoDoTitulo.label}
                        </button>
                    )}
                </div>
            </div>

            {/* Abas §19.1 */}
            <div className="flex flex-col lg:flex-row gap-3 items-center justify-between bg-white p-2 rounded-[10px] border border-gray-100 shadow-sm mb-3">
                <div className="flex flex-wrap items-center bg-gray-50 p-1 rounded-[10px] border border-gray-100 gap-1 max-w-full">
                    {abas.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setAba(t.id)}
                            className={`px-3 h-7 rounded-[6px] text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                aba === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-700 hover:text-gray-900'
                            }`}
                        >
                            <t.icon className="w-3.5 h-3.5" /> {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* O card acompanha a largura do card de abas acima — sem `max-w-*`,
                que fazia a ficha terminar no meio da tela enquanto a barra de
                abas ia até a borda. Os CAMPOS não crescem junto: quem segura a
                largura deles é a grade de 3 colunas, porque campo de data com
                400px de largura não fica mais legível, só mais vazio. */}
            {aba === 'ficha' && (
                <div className="bg-white p-6 rounded-[10px] border border-gray-100 shadow-sm">
                    <h3 className="text-xs font-semibold text-gray-500 mb-1">Dados do condomínio</h3>
                    <p className="text-xs text-gray-400 mb-4">
                        O CNPJ do condomínio não é o da SPE que incorporou — são pessoas jurídicas distintas, e é
                        por aqui que a segregação de caixa se ancora quando o financeiro condominial entrar.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Razão social do condomínio</label>
                            <input
                                type="text"
                                value={ficha.condominio_razao_social}
                                onChange={ev => setFicha(f => ({ ...f, condominio_razao_social: ev.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">CNPJ do condomínio</label>
                            <input
                                type="text"
                                value={ficha.condominio_cnpj}
                                onChange={ev => setFicha(f => ({ ...f, condominio_cnpj: ev.target.value }))}
                                placeholder="00.000.000/0001-00"
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                            {e.spe_cnpj && (
                                <p className="text-xs text-gray-400 mt-1">SPE incorporadora: {e.spe_cnpj}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Instalado em</label>
                            <input
                                type="date"
                                value={ficha.condominio_instalado_em?.slice(0, 10) || ''}
                                onChange={ev => setFicha(f => ({ ...f, condominio_instalado_em: ev.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Síndico</label>
                            <div className="mt-1">
                                <ClientSelect
                                    clients={clientes}
                                    value={ficha.sindico_client_id}
                                    onChange={v => setFicha(f => ({ ...f, sindico_client_id: v }))}
                                    icon={null}
                                    title="Selecionar Síndico"
                                    placeholder="Não definido"
                                    triggerClassName="w-full h-9 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Mandato — início</label>
                            <input
                                type="date"
                                value={ficha.sindico_mandato_inicio?.slice(0, 10) || ''}
                                onChange={ev => setFicha(f => ({ ...f, sindico_mandato_inicio: ev.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Mandato — fim</label>
                            <input
                                type="date"
                                value={ficha.sindico_mandato_fim?.slice(0, 10) || ''}
                                onChange={ev => setFicha(f => ({ ...f, sindico_mandato_fim: ev.target.value }))}
                                className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                            />
                            {mandatoVencido && (
                                <p className="text-xs text-red-600 mt-1">
                                    Mandato vencido — o síndico não representa mais o condomínio.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Centro de custo — a ÂNCORA da segregação do caixa.
                        Seção própria porque não é um campo de texto do cadastro:
                        são N vínculos, cada um com ação de tirar. */}
                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <p className="text-sm font-medium text-gray-800">Centro de custo</p>
                        <p className="text-xs text-gray-400 mt-0.5 mb-4">
                            A despesa do condomínio é a que cai nestes centros de custo — é o que separa o
                            caixa dele, com ou sem organização própria, e é de onde o rateio tira as
                            despesas. Podem ser mais de um: o rateio soma todos.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          <div className="md:col-span-2 xl:col-span-2">
                        {centros.length > 0 ? (
                            <div className="space-y-1.5 mb-4">
                                {centros.map(c => (
                                    <div key={c.id} className="flex items-center justify-between gap-3 p-2.5 rounded-[6px] border border-gray-200">
                                        <span className="text-sm font-normal text-gray-700 min-w-0">
                                            <span className="block truncate" title={`${c.code} — ${c.name}`}>
                                                {c.code} — {c.name}
                                            </span>
                                        </span>
                                        <ActionIconButton
                                            kind="delete"
                                            title="Desvincular deste condomínio"
                                            icon={<Unlink className="w-4 h-4" />}
                                            disabled={ccOcupado}
                                            onClick={() => desvincularCentro(c)}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-amber-600 mb-4">
                                Nenhum centro de custo vinculado — sem ele não há de onde tirar as despesas do rateio.
                            </p>
                        )}

                        {/* §7.1.1 — centro de custo SEMPRE no drawer padrão, nunca `<select>`. */}
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Vincular um centro de custo</label>
                                <div className="flex gap-2 mt-1">
                                    <div className="flex-1 min-w-0">
                                        <CostCenterSelect
                                            // A lista vai CRUA: é `parent_id` apontando para um
                                            // item presente que faz o drawer virar accordion, como
                                            // em Suprimentos › Pedidos. Achatar aqui (que era o que
                                            // eu fazia) joga o componente no modo antigo — lista
                                            // plana com badge escuro de código.
                                            costCenters={ccDisponiveis}
                                            value={ccEscolhido}
                                            onChange={setCcEscolhido}
                                            placeholder={ccDisponiveis.length ? 'Selecione para vincular' : 'Nenhum centro de custo livre'}
                                            size="sm"
                                            disabled={ccOcupado || ccDisponiveis.length === 0}
                                            hoverCls="hover:bg-blue-50"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={vincularCentro}
                                        disabled={!ccEscolhido || ccOcupado}
                                        className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50 shrink-0"
                                    >
                                        <Link2 className="w-[15px] h-[15px]" /> Vincular
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    A lista traz só os centros de custo que ainda não são de nenhum condomínio.
                                    Criar um novo continua em Financeiro, quando o condomínio não tem nenhum.
                                </p>
                            </div>
                          </div>
                        </div>
                    </div>

                    {/* Cobrança — parâmetros do boleto da cota condominial. */}
                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <p className="text-sm font-medium text-gray-800">Cobrança</p>
                        <p className="text-xs text-gray-400 mt-0.5 mb-4">
                            Multa e juros aplicados ao boleto da cota. Os valores abaixo são o teto do
                            Código Civil para condomínio (art. 1.336 §1º) — a convenção pode fixar menos,
                            nunca mais. Quem calcula é o Asaas, a partir do vencimento.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Multa por atraso (%)</label>
                                <input
                                    type="text" inputMode="decimal"
                                    value={ficha.cobranca_multa_percent}
                                    onChange={ev => setFicha(f => ({ ...f, cobranca_multa_percent: ev.target.value }))}
                                    placeholder="2"
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Juros ao mês (%)</label>
                                <input
                                    type="text" inputMode="decimal"
                                    value={ficha.cobranca_juros_mes_percent}
                                    onChange={ev => setFicha(f => ({ ...f, cobranca_juros_mes_percent: ev.target.value }))}
                                    placeholder="1"
                                    className="mt-1 w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm font-normal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end mt-6">
                        <button
                            onClick={salvarFicha}
                            disabled={salvando}
                            className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] transition-all active:scale-95 disabled:opacity-50"
                        >
                            <Save className="w-[15px] h-[15px]" /> {salvando ? 'Salvando...' : 'Salvar ficha'}
                        </button>
                    </div>
                </div>
            )}

            {aba === 'ocupacoes' && <OcupacoesTab empreendimento={e} registrarAcaoDoTitulo={setAcaoDoTitulo} />}
            {aba === 'fracoes' && <FracoesTab empreendimento={e} />}
            {aba === 'documentos' && <DocumentosTab empreendimento={e} />}
            {aba === 'ativos' && <AtivosTab empreendimento={e} />}
            {aba === 'manutencao' && <ManutencaoTab empreendimento={e} />}
            {aba === 'financeiro' && <FinanceiroTab empreendimento={e} />}
            {aba === 'comunicacao' && <ComunicacaoTab empreendimento={e} />}

            {notification && (
                <div className={`fixed bottom-6 right-6 z-[300] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
                    notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                }`}>
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default CondominioDetail;

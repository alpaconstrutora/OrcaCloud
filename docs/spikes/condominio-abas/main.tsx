/**
 * Harness: monta o `CondominioTab` de produção com um payload fabricado — o
 * mesmo que a RPC `client_portal_get_condominio` devolveria. Nada de rede: o
 * componente é puro em relação aos dados (recebe `dados` por prop), então o
 * harness prova a APARÊNCIA das seis abas sem depender do Supabase.
 *
 * Nasceu em 24/09/2026, quando o projeto Supabase ficou fora do ar (522 no
 * Cloudflare, `db query` com timeout) bem na hora de conferir a tela. O
 * comportamento das abas está travado em `__tests__/components/condominioTabAbas.test.tsx`;
 * aqui é só o olho.
 *
 *   npm run dev  →  http://127.0.0.1:<porta>/docs/spikes/condominio-abas/index.html
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../index.css';
import CondominioTab from '../../../components/client/CondominioTab';
import { ConfirmProvider } from '../../../components/ui/confirm';
import { CONDOMINIO_VAZIO, type PortalCondominio } from '../../../services/clientPortalService';

const dados: PortalCondominio = {
    ...CONDOMINIO_VAZIO,
    unidades: [
        {
            unitId: 'u1', unidade: 'Sala - 201', torre: 'Torre Única', pavimento: 2,
            tipologia: 'Sala', areaPrivativa: 17.01, fracaoIdeal: 0.0833333,
            fracaoOrigem: 'CONVENCAO', papeis: ['INQUILINO'],
            condominioId: 'c-010', condominioCode: '010',
            condominioNome: '010 - Galeria Altavista', condominioCnpj: '12.345.678/0001-90',
            ocupacoes: [{ papel: 'PROPRIETARIO', nome: 'Altavista Participações' }],
        },
        {
            unitId: 'u2', unidade: 'Sala - 202', torre: 'Torre Única', pavimento: 2,
            tipologia: 'Sala', areaPrivativa: 17.01, fracaoIdeal: 0.0833333,
            fracaoOrigem: 'CONVENCAO', papeis: ['INQUILINO'],
            condominioId: 'c-010', condominioCode: '010',
            condominioNome: '010 - Galeria Altavista', condominioCnpj: '12.345.678/0001-90',
            ocupacoes: [],
        },
    ],
    avisos: [
        {
            id: 'a1', titulo: 'Assembleia geral ordinária', corpo: 'Dia 10/10, às 19h, no hall do térreo.\nPauta: prestação de contas e previsão orçamentária.',
            categoria: 'ASSEMBLEIA', publicadoEm: '2026-09-20',
            condominioNome: '010 - Galeria Altavista', lido: false,
        },
        {
            id: 'a2', titulo: 'Manutenção do elevador social', corpo: 'Nos dias 2 e 3 o elevador social ficará parado das 8h às 12h.',
            categoria: 'MANUTENCAO', publicadoEm: '2026-09-12',
            condominioNome: '010 - Galeria Altavista', lido: true,
        },
    ],
    documentos: [
        { id: 'd1', titulo: 'Convenção do condomínio', categoria: 'CONVENCAO', url: 'https://exemplo/convencao.pdf', descricao: 'Registrada em 2019', condominioNome: '010 - Galeria Altavista' },
        { id: 'd2', titulo: 'Ata da assembleia de 2026', categoria: 'ATA', url: null, descricao: null, condominioNome: '010 - Galeria Altavista' },
    ],
    rateios: [{
        id: 'r1', numero: 'RAT-2026-08', competencia: '2026-08-01', tipo: 'ORDINARIA',
        criterio: 'FRACAO_IDEAL', status: 'FECHADO', totalDespesas: 12480.55, totalRateado: 12480.55,
        fechadoEm: '2026-09-01T12:00:00Z', condominioNome: '010 - Galeria Altavista',
        despesas: [
            { id: 'de1', descricao: 'ENERGISA SUL-SUDESTE', valor: 3820.10 },
            { id: 'de2', descricao: 'COPASA', valor: 1260.45 },
            { id: 'de3', descricao: 'Zeladoria e limpeza', valor: 7400.00 },
        ],
        cotas: [
            { id: 'co1', unitId: 'u1', unidade: 'Sala - 201', torre: 'Torre Única', pessoa: 'Defensoria Pública de MG', peso: 0.0833, valor: 1040.05, ajusteManual: false, minha: true },
            { id: 'co2', unitId: 'u2', unidade: 'Sala - 202', torre: 'Torre Única', pessoa: 'Defensoria Pública de MG', peso: 0.0833, valor: 1040.05, ajusteManual: false, minha: true },
            { id: 'co3', unitId: 'u9', unidade: 'Loja - 01', torre: 'Torre Única', pessoa: 'Padaria Altavista', peso: 0.125, valor: 1560.07, ajusteManual: false, minha: false },
        ],
    }],
    manutencao: [
        { id: 'm1', descricao: 'Limpeza da caixa d’água', sistema: 'Hidráulico', periodicidadeValor: 6, periodicidadeUnidade: 'MES', ultimaExecucao: '2026-04-02', proximoVencimento: '2026-10-02', responsavel: null, condominioNome: '010 - Galeria Altavista' },
        { id: 'm2', descricao: 'Inspeção das bombas de recalque', sistema: 'Hidráulico', periodicidadeValor: 3, periodicidadeUnidade: 'MES', ultimaExecucao: null, proximoVencimento: '2026-11-15', responsavel: null, condominioNome: '010 - Galeria Altavista' },
    ],
    ordens: [
        { id: 'o1', codigo: 'OS-0042', descricao: 'Troca do cabo de tração do elevador', sistema: 'Transporte vertical', tipo: 'PREVENTIVA', prioridade: 'ALTA', situacao: 'CONCLUIDA', agendadaPara: '2026-09-05', executadaEm: '2026-09-06', condominioNome: '010 - Galeria Altavista' },
        { id: 'o2', codigo: 'OS-0048', descricao: 'Inspeção anual do SPDA', sistema: 'Elétrico', tipo: 'INSPECAO', prioridade: 'MEDIA', situacao: 'AGENDADA', agendadaPara: '2026-10-20', executadaEm: null, condominioNome: '010 - Galeria Altavista' },
    ],
    ativos: [
        {
            id: 'at1', nome: 'Elevador social', codigo: 'ELV-01', categoria: 'Elevador',
            subcategoria: 'Tração', marca: 'Atlas Schindler', modelo: '3300',
            numeroSerie: 'AS-99182-B', situacao: 'ATIVO', sistema: 'Transporte vertical',
            dataAquisicao: '2021-03-12', valorAquisicao: 184000, vidaUtilMeses: 240,
            valorResidual: 18400, observacoes: 'Casa de máquinas no 9º pavimento. Chave reserva com a zeladoria.',
            imagemUrl: null, garantiaAte: '2027-01-31', condominioNome: '010 - Galeria Altavista',
        },
        {
            id: 'at2', nome: 'Bomba de recalque', codigo: 'BMB-02', categoria: 'Bomba',
            subcategoria: null, marca: 'Schneider', modelo: 'BC-92', numeroSerie: null,
            situacao: 'ATIVO', sistema: 'Hidráulico', dataAquisicao: null, valorAquisicao: null,
            vidaUtilMeses: null, valorResidual: null, observacoes: null, imagemUrl: null,
            garantiaAte: null, condominioNome: '010 - Galeria Altavista',
        },
    ],
};

createRoot(document.getElementById('raiz')!).render(
    <React.StrictMode>
        {/* O `Sheet` da ficha do equipamento usa `useConfirm` — o provider é o
            mesmo que `index.tsx` monta na raiz do app. */}
        <ConfirmProvider>
            <CondominioTab dados={dados} loading={false} onMarcarLido={(id) => console.log('marcar lido', id)} />
        </ConfirmProvider>
    </React.StrictMode>,
);

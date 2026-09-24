// @vitest-environment jsdom
/**
 * Portal do Cliente › Condomínio — os seis painéis viraram seis abas
 * (pedido do usuário em 24/09/2026).
 *
 * Por que um teste de RENDER aqui, sendo que o resto da tela é testado como
 * lógica pura (`__tests__/condominioPortalCliente.test.ts`): a troca de abas é
 * a única parte que erra **sem erro**. Um `id` fora de sincronia entre `ABAS` e
 * o `switch` de renderização, ou um painel declarado dentro do componente pai,
 * não quebra o build nem o typecheck — só devolve um painel vazio, ou um estado
 * que some sozinho, e isso só aparece clicando.
 *
 * O que fica travado:
 *  1. as seis abas existem, com os rótulos que o usuário pediu, e cada uma
 *     mostra o SEU conteúdo (nenhuma cai em branco);
 *  2. o contador de não lidos fica só em Avisos;
 *  3. sem unidade de condomínio não há barra de abas — é o estado vazio §12;
 *  4. sem `onMarcarLido` (prévia do síndico) o card de aviso não é clicável.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CondominioTab from '../../components/client/CondominioTab';
import { ConfirmProvider } from '../../components/ui/confirm';
import { CONDOMINIO_VAZIO, type PortalCondominio } from '../../services/clientPortalService';

const dados: PortalCondominio = {
    ...CONDOMINIO_VAZIO,
    unidades: [{
        unitId: 'u1', unidade: 'Sala - 201', torre: 'Torre Única', pavimento: 2,
        tipologia: 'Sala', areaPrivativa: 17.01, fracaoIdeal: 0.0833333,
        fracaoOrigem: 'CONVENCAO', papeis: ['INQUILINO'],
        condominioId: 'c-010', condominioCode: '010',
        condominioNome: '010 - Galeria Altavista', condominioCnpj: null, ocupacoes: [],
    }],
    avisos: [{
        id: 'a1', titulo: 'Assembleia de outubro', corpo: 'Dia 10, às 19h.',
        categoria: 'ASSEMBLEIA', publicadoEm: '2026-09-20',
        condominioNome: '010 - Galeria Altavista', lido: false,
    }],
    documentos: [{
        id: 'd1', titulo: 'Convenção do condomínio', categoria: 'CONVENCAO',
        url: 'https://exemplo/convencao.pdf', descricao: null,
        condominioNome: '010 - Galeria Altavista',
    }],
    rateios: [{
        id: 'r1', numero: 'RAT-001', competencia: '2026-08-01', tipo: 'ORDINARIA',
        criterio: 'FRACAO_IDEAL', status: 'FECHADO', totalDespesas: 1000, totalRateado: 1000,
        fechadoEm: '2026-09-01T12:00:00Z', condominioNome: '010 - Galeria Altavista',
        despesas: [{ id: 'de1', descricao: 'ENERGISA SUL-SUDESTE', valor: 1000 }],
        cotas: [{
            id: 'co1', unitId: 'u1', unidade: 'Sala - 201', torre: 'Torre Única',
            pessoa: 'Defensoria', peso: 0.0833, valor: 83.33, ajusteManual: false, minha: true,
        }],
    }],
    manutencao: [{
        id: 'm1', descricao: 'Limpeza da caixa d’água', sistema: 'Hidráulico',
        periodicidadeValor: 6, periodicidadeUnidade: 'MES', ultimaExecucao: null,
        proximoVencimento: '2026-10-01', responsavel: null,
        condominioNome: '010 - Galeria Altavista',
    }],
    ordens: [],
    ativos: [{
        id: 'at1', nome: 'Elevador social', codigo: 'ELV-01', categoria: 'Elevador',
        subcategoria: 'Tração', marca: 'Atlas', modelo: 'Schindler 3300',
        numeroSerie: 'AS-99182-B', situacao: 'ATIVO', sistema: 'Transporte',
        dataAquisicao: '2021-03-12', valorAquisicao: 184000, vidaUtilMeses: 240,
        valorResidual: 18400, observacoes: 'Casa de máquinas no 9º pavimento.',
        imagemUrl: null, garantiaAte: '2027-01-31', condominioNome: '010 - Galeria Altavista',
    }],
};

const ABAS = [
    'Dados Gerais', 'Avisos', 'Documentos do condomínio',
    'Financeiro do condomínio', 'Manutenção do prédio', 'Equipamentos do prédio',
];

/** O conteúdo que PROVA que a aba trocou — um texto que só existe naquele painel. */
const MARCA: Record<string, RegExp> = {
    'Dados Gerais': /Fração ideal/,
    'Avisos': /Assembleia de outubro/,
    'Documentos do condomínio': /Convenção do condomínio/,
    'Financeiro do condomínio': /Competência 08\/2026/,
    'Manutenção do prédio': /caixa d’água/,
    'Equipamentos do prédio': /Elevador social/,
};

const abrir = (rotulo: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(rotulo) }));

/** O `Sheet` da ficha do equipamento usa `useConfirm`, que exige o provider —
 *  é o mesmo que `index.tsx` monta na raiz do app. Sem ele o teste quebra com
 *  "useConfirm deve ser usado dentro de <ConfirmProvider>". */
const montar = (ui: React.ReactElement) => render(<ConfirmProvider>{ui}</ConfirmProvider>);

describe('CondominioTab — seis abas', () => {
    it('mostra as seis abas e cada uma abre o seu painel', () => {
        montar(<CondominioTab dados={dados} loading={false} onMarcarLido={vi.fn()} />);

        for (const rotulo of ABAS) {
            expect(screen.getByRole('button', { name: new RegExp(rotulo) })).toBeInTheDocument();
        }

        for (const rotulo of ABAS) {
            abrir(rotulo);
            expect(screen.getByText(MARCA[rotulo])).toBeInTheDocument();
            // e o conteúdo das OUTRAS abas não fica na tela junto
            for (const outra of ABAS.filter(a => a !== rotulo)) {
                expect(screen.queryByText(MARCA[outra])).toBeNull();
            }
        }
    });

    it('o contador de não lidos aparece só na aba Avisos', () => {
        montar(<CondominioTab dados={dados} loading={false} onMarcarLido={vi.fn()} />);
        const avisos = screen.getByRole('button', { name: /Avisos/ });
        expect(within(avisos).getByText('1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Equipamentos do prédio/ }).textContent)
            .toBe('Equipamentos do prédio');
    });

    it('sem unidade de condomínio não há barra de abas, e sim o estado vazio', () => {
        montar(<CondominioTab dados={CONDOMINIO_VAZIO} loading={false} />);
        expect(screen.getByText(/Nenhuma unidade de condomínio/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Documentos do condomínio/ })).toBeNull();
    });

    it('sem onMarcarLido (prévia do síndico) o aviso não é clicável', () => {
        montar(<CondominioTab dados={dados} loading={false} />);
        abrir('Avisos');
        const card = screen.getByText('Assembleia de outubro').closest('div.rounded-\\[10px\\]');
        expect(card?.className).not.toContain('cursor-pointer');
    });
});

// A ficha do bem (24/09/2026): clicar no equipamento abre o painel lateral com
// os campos de Gestão de Ativos › Ativos Patrimoniais. O que erra em silêncio
// aqui é o painel abrir VAZIO — o card da lista mostra nome e marca, e sem
// asserir um campo que SÓ existe na ficha (nº de série, valor) um painel em
// branco passaria despercebido.
describe('CondominioTab — ficha do equipamento', () => {
    it('clicar no equipamento abre a ficha com os dados do cadastro', async () => {
        montar(<CondominioTab dados={dados} loading={false} />);
        abrir('Equipamentos do prédio');

        // a lista não mostra a ficha antes do clique
        expect(screen.queryByText('AS-99182-B')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /Elevador social/ }));

        expect(await screen.findByText('AS-99182-B')).toBeInTheDocument();
        expect(screen.getByText('ELV-01')).toBeInTheDocument();
        expect(screen.getByText('Tração')).toBeInTheDocument();
        expect(screen.getByText('R$ 184.000,00')).toBeInTheDocument();
        expect(screen.getByText('20 anos')).toBeInTheDocument();          // 240 meses viram anos
        expect(screen.getByText('12/03/2021')).toBeInTheDocument();
        expect(screen.getByText(/Casa de máquinas/)).toBeInTheDocument();
    });

    it('campo sem valor não vira linha vazia na ficha', () => {
        const semFicha = {
            ...dados,
            ativos: [{ ...dados.ativos[0], numeroSerie: null, valorAquisicao: null, observacoes: null }],
        };
        montar(<CondominioTab dados={semFicha} loading={false} />);
        abrir('Equipamentos do prédio');
        fireEvent.click(screen.getByRole('button', { name: /Elevador social/ }));
        expect(screen.queryByText('Nº de série')).toBeNull();
        expect(screen.queryByText('Valor de aquisição')).toBeNull();
        expect(screen.queryByText('Observações')).toBeNull();
    });
});

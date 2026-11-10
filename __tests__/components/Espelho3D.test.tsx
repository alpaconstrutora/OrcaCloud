// @vitest-environment jsdom
/**
 * ESPELHO DE VENDAS 3D (09/11/2026) — a casca: a legenda que destaca, a ficha da unidade e a lista por andar, que
 * faz pelo teclado tudo o que o toque no desenho faz. O desenho (three) fica de fora: aqui ele é um botão que
 * "toca" uma unidade. Plano: docs/planos/2026-11-09-espelho-de-vendas-3d.md.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { montarCenaDoEspelho, type TorreDoEspelho } from '../../utils/espelhoDeVendas3d';
import type { DadosDaUnidade } from '../../components/espelho3d/FichaDaUnidade';

const webgl = vi.hoisted(() => ({ disponivel: true, cenaQuebra: false }));
vi.mock('../../components/espelho3d/webglDisponivel', () => ({ webglDisponivel: () => webgl.disponivel, reduzMovimento: () => true }));
vi.mock('../../components/espelho3d/Espelho3DCena', () => ({
    default: (p: { destaque: string | null; selecionada: string | null; onSelecionar: (id: string | null) => void; luz?: { chave: string; janelas: { fracao: number } } }) => {
        if (webgl.cenaQuebra) throw new Error('contexto WebGL perdido');
        return (
            <button type="button" data-testid="cena" data-destaque={p.destaque ?? ''} data-selecionada={p.selecionada ?? ''} data-luz={p.luz?.chave ?? ''} data-janelas={p.luz?.janelas.fracao ?? ''} onClick={() => p.onSelecionar('A-1-2')}>
                desenho
            </button>
        );
    },
}));

import Espelho3D from '../../components/espelho3d/Espelho3D';

const andar = (n: number, status: string[]) =>
    status.map((s, k) => ({ id: `A-${n}-${k + 1}`, name: `${n}0${k + 1}`, floor: n, floor_tipo: null, private_area: 80, status: s as never, sort_order: k }));

/** Torre A: térreo e 2 andares, 2 unidades por andar. 3 disponíveis, 1 reservada, 2 vendidas. */
const TORRE: TorreDoEspelho = {
    id: 'A',
    name: 'Torre A',
    sort_order: 0,
    units: [...andar(0, ['DISPONIVEL', 'DISPONIVEL']), ...andar(1, ['VENDIDO', 'RESERVADO']), ...andar(2, ['DISPONIVEL', 'VENDIDO'])],
};
const cena = montarCenaDoEspelho({ torres: [TORRE] });
const dados = new Map<string, DadosDaUnidade>([['A-1-2', { tipologia: '2 quartos', areaPrivativaM2: 142.55, dormitorios: 2, banheiros: 2, vagas: 1, preco: 950_000 }]]);

const montar = (over: Partial<React.ComponentProps<typeof Espelho3D>> = {}) => render(<Espelho3D cena={cena} dados={dados} {...over} />);

beforeEach(() => {
    webgl.disponivel = true;
    webgl.cenaQuebra = false;
});

describe('Espelho3D — legenda e destaque', () => {
    it('a legenda traz a contagem de cada status e é o controle de destacar', async () => {
        montar();
        const grupo = screen.getByRole('radiogroup', { name: 'Destacar unidades por status' });
        expect(within(grupo).getByRole('radio', { name: /Disponíveis 3/ })).toBeTruthy();
        expect(within(grupo).getByRole('radio', { name: /Em negociação 1/ })).toBeTruthy();
        expect(within(grupo).getByRole('radio', { name: /Vendidas 2/ })).toBeTruthy();

        fireEvent.click(within(grupo).getByRole('radio', { name: /Vendidas 2/ }));
        expect(within(grupo).getByRole('radio', { name: /Vendidas 2/ }).getAttribute('aria-checked')).toBe('true');
        expect((await screen.findByTestId('cena')).getAttribute('data-destaque')).toBe('sold');
        // Clicar de novo volta a mostrar todas.
        fireEvent.click(within(grupo).getByRole('radio', { name: /Vendidas 2/ }));
        expect(screen.getByTestId('cena').getAttribute('data-destaque')).toBe('');
    });

    it('status sem unidade fica desligado, com o motivo; "Outros status" nem aparece', () => {
        montar();
        const permutadas = screen.getByRole('radio', { name: /Permutadas 0/ }) as HTMLButtonElement;
        expect(permutadas.disabled).toBe(true);
        expect(permutadas.title).toBe('Nenhuma unidade permutada');
        expect(screen.queryByRole('radio', { name: /Outros status/ })).toBeNull();
    });

    it('o desenho tem nome acessível com os números', () => {
        montar();
        expect(screen.getByRole('img', { name: 'Torres em 3D. 6 unidades: 3 disponíveis, 1 em negociação, 2 vendidas.' })).toBeTruthy();
    });
});

// F7 (10/11/2026): a luz do dia.
describe('Espelho3D — luz do dia', () => {
    const luzes = () => within(screen.getByRole('radiogroup', { name: 'Luz do dia no desenho' })).getAllByRole('radio');

    it('são quatro, na ordem do dia, e começa em "Dia"', async () => {
        montar();
        expect(luzes().map((b) => [b.textContent, b.getAttribute('aria-checked')])).toEqual([['Amanhecer', 'false'], ['Dia', 'true'], ['Entardecer', 'false'], ['Noite', 'false']]);
        expect((await screen.findByTestId('cena')).getAttribute('data-luz')).toBe('dia');
    });

    it('escolher "Noite" troca a luz do desenho e o céu, e acende janelas; a legenda e as contagens não mudam', async () => {
        montar();
        const legendaAntes = screen.getByRole('radiogroup', { name: 'Destacar unidades por status' }).textContent;
        fireEvent.click(screen.getByRole('radio', { name: 'Noite' }));
        const cenaDepois = await screen.findByTestId('cena');
        expect(cenaDepois.getAttribute('data-luz')).toBe('noite');
        expect(Number(cenaDepois.getAttribute('data-janelas'))).toBeGreaterThan(0);
        expect(screen.getByRole('radio', { name: 'Noite' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('radio', { name: 'Dia' }).getAttribute('aria-checked')).toBe('false');
        const moldura = screen.getByRole('img', { name: /Torres em 3D/ });
        expect(moldura.getAttribute('data-luz')).toBe('noite');
        expect(moldura.style.backgroundImage).toMatch(/linear-gradient/);
        expect(screen.getByRole('radiogroup', { name: 'Destacar unidades por status' }).textContent).toBe(legendaAntes);
    });

    it('trocar a luz não fecha a ficha nem desfaz o destaque', async () => {
        montar();
        fireEvent.click(await screen.findByTestId('cena'));
        fireEvent.click(screen.getByRole('radio', { name: /Vendidas/ }));
        fireEvent.click(screen.getByRole('radio', { name: 'Entardecer' }));
        expect(screen.getByRole('region', { name: 'Ficha da unidade 102' })).toBeTruthy();
        expect(screen.getByTestId('cena').getAttribute('data-destaque')).toBe('sold');
        expect(screen.getByTestId('cena').getAttribute('data-selecionada')).toBe('A-1-2');
    });

    it('sem WebGL não há desenho para iluminar: o seletor de luz não aparece', () => {
        webgl.disponivel = false;
        montar();
        expect(screen.queryByRole('radiogroup', { name: 'Luz do dia no desenho' })).toBeNull();
    });
});

describe('Espelho3D — ficha', () => {
    it('tocar numa unidade do desenho abre a ficha com os dados dela', async () => {
        const onSelecionar = vi.fn();
        montar({ mostrarPreco: true, onSelecionar });
        fireEvent.click(await screen.findByTestId('cena'));
        const ficha = screen.getByRole('region', { name: 'Ficha da unidade 102' });
        expect(within(ficha).getByText('Torre A · Pavimento 1')).toBeTruthy();
        expect(within(ficha).getByText('Em negociação')).toBeTruthy();
        expect(within(ficha).getByText('142,55 m²')).toBeTruthy();
        expect(within(ficha).getByText('2 quartos')).toBeTruthy();
        expect(within(ficha).getByText(/R\$\s?950\.000/)).toBeTruthy();
        expect(onSelecionar).toHaveBeenCalledWith('A-1-2');
        expect(screen.getByTestId('cena').getAttribute('data-selecionada')).toBe('A-1-2');
    });

    it('sem `mostrarPreco` a ficha não fala em preço', async () => {
        montar();
        fireEvent.click(await screen.findByTestId('cena'));
        expect(screen.queryByText('Preço de tabela')).toBeNull();
    });

    it('as ações da ficha são as de quem chama, para a unidade tocada', async () => {
        const acao = vi.fn();
        montar({ acoesDaFicha: (p) => <button type="button" onClick={() => acao(p.unitId)}>Fazer proposta</button> });
        fireEvent.click(await screen.findByTestId('cena'));
        fireEvent.click(screen.getByRole('button', { name: 'Fazer proposta' }));
        expect(acao).toHaveBeenCalledWith('A-1-2');
    });

    // F5 (10/11/2026): a planta baixa da tipologia da unidade.
    it('unidade com planta: a ficha mostra a planta da tipologia, e tocar amplia num diálogo (não em tela cheia)', async () => {
        const comPlanta = new Map<string, DadosDaUnidade>([['A-1-2', { tipologia: 'Tipo 3', plantaUrl: 'https://x/tipo3.png' }]]);
        montar({ dados: comPlanta });
        fireEvent.click(await screen.findByTestId('cena'));
        const ficha = screen.getByRole('region', { name: 'Ficha da unidade 102' });
        expect(within(ficha).getByText('Planta da tipologia Tipo 3')).toBeTruthy();
        expect(within(ficha).getByAltText('Planta da tipologia Tipo 3').getAttribute('src')).toBe('https://x/tipo3.png');
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(within(ficha).getByRole('button', { name: 'Ampliar a planta da tipologia tipo 3' }));
        const dialogo = screen.getByRole('dialog');
        expect(within(dialogo).getByAltText('Planta da tipologia Tipo 3')).toBeTruthy();
        expect(within(dialogo).getByText('Unidade 102 · Torre A')).toBeTruthy();
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Fechar a planta' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('unidade sem planta: a ficha não tem o trecho da planta', async () => {
        montar();
        fireEvent.click(await screen.findByTestId('cena'));
        expect(screen.queryByTestId('ficha-planta')).toBeNull();
    });

    // F6 (10/11/2026): a vista da janela.
    it('unidade com vista: o botão abre a foto num diálogo, com a legenda e o que ela cobre', async () => {
        const comVista = new Map<string, DadosDaUnidade>([['A-1-2', { vista: { url: 'https://x/vista.jpg', legenda: 'Vista para a praça', cobre: 'Térreo ao 3º pavimento · qualquer face' } }]]);
        montar({ dados: comVista });
        fireEvent.click(await screen.findByTestId('cena'));
        const botao = screen.getByRole('button', { name: 'Vista da janela' });
        expect(botao).not.toBeDisabled();
        fireEvent.click(botao);
        const dialogo = screen.getByRole('dialog');
        expect(within(dialogo).getByAltText('Vista da janela').getAttribute('src')).toBe('https://x/vista.jpg');
        expect(within(dialogo).getByText('Vista para a praça · Térreo ao 3º pavimento · qualquer face')).toBeTruthy();
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Fechar a vista' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('o prédio tem vistas mas nenhuma cobre esta unidade: o botão fica desligado e diz por quê', async () => {
        montar({ dados: new Map<string, DadosDaUnidade>([['A-1-2', { vista: null }]]) });
        fireEvent.click(await screen.findByTestId('cena'));
        const botao = screen.getByRole('button', { name: 'Vista da janela' });
        expect(botao).toBeDisabled();
        expect(botao.parentElement!.getAttribute('title')).toBe('Não há foto de vista cadastrada para o andar desta unidade.');
        expect(screen.getByText('Não há foto de vista cadastrada para o andar desta unidade.')).toBeTruthy();
    });

    it('prédio sem nenhuma vista cadastrada: a ficha nem fala em vista', async () => {
        montar();
        fireEvent.click(await screen.findByTestId('cena'));
        expect(screen.queryByRole('button', { name: 'Vista da janela' })).toBeNull();
    });

    // F8 (10/11/2026): o "Ver decorado".
    const DECORADO = {
        imagens: [
            { url: 'https://x/corte.jpg', titulo: 'Corte 3D mobiliado', origem: 'ENVIADA' as const },
            { url: 'https://x/sala.jpg', titulo: 'Sala', origem: 'ENVIADA' as const },
            { url: 'https://x/suite.jpg', titulo: 'Suíte', origem: 'ENVIADA' as const },
        ],
    };

    it('unidade com decorado: o corte vem primeiro, as setas e o teclado passam as imagens, e o selo está sempre lá', async () => {
        montar({ dados: new Map<string, DadosDaUnidade>([['A-1-2', { tipologia: 'Tipo 1', decorado: DECORADO }]]) });
        fireEvent.click(await screen.findByTestId('cena'));
        fireEvent.click(screen.getByRole('button', { name: 'Ver decorado' }));
        const dialogo = screen.getByRole('dialog');
        const imagem = () => within(dialogo).getByTestId('decorado-imagem');
        expect(imagem().getAttribute('src')).toBe('https://x/corte.jpg');
        expect(within(dialogo).getByTestId('decorado-selo').textContent).toBe('Imagem ilustrativa');
        expect(within(dialogo).getByTestId('decorado-posicao').textContent).toContain('1 de 3');

        fireEvent.click(within(dialogo).getByRole('button', { name: 'Próxima imagem' }));
        expect(imagem().getAttribute('src')).toBe('https://x/sala.jpg');
        expect(within(dialogo).getByTestId('decorado-selo').textContent).toBe('Imagem ilustrativa');
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(imagem().getAttribute('src')).toBe('https://x/suite.jpg');
        // Depois da última volta à primeira; a seta para trás volta.
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(imagem().getAttribute('src')).toBe('https://x/corte.jpg');
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        expect(imagem().getAttribute('src')).toBe('https://x/suite.jpg');
        // A miniatura escolhe direto.
        fireEvent.click(within(dialogo).getByRole('tab', { name: 'Sala' }));
        expect(imagem().getAttribute('src')).toBe('https://x/sala.jpg');

        fireEvent.click(within(dialogo).getByRole('button', { name: 'Fechar o decorado' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('o corte gerado pela Planta (F9) leva o selo próprio', async () => {
        const daPlanta = { imagens: [{ url: 'https://x/corte.png', titulo: 'Corte 3D mobiliado', origem: 'PLANTA' as const }] };
        montar({ dados: new Map<string, DadosDaUnidade>([['A-1-2', { decorado: daPlanta }]]) });
        fireEvent.click(await screen.findByTestId('cena'));
        fireEvent.click(screen.getByRole('button', { name: 'Ver decorado' }));
        const dialogo = screen.getByRole('dialog');
        expect(within(dialogo).getByTestId('decorado-selo').textContent).toBe('Gerado do projeto · mobiliário ilustrativo');
        // Uma imagem só: sem setas nem "1 de 1".
        expect(within(dialogo).queryByRole('button', { name: 'Próxima imagem' })).toBeNull();
        expect(within(dialogo).queryByTestId('decorado-posicao')).toBeNull();
    });

    it('o prédio tem decorado mas não desta tipologia: o botão fica desligado e diz por quê', async () => {
        montar({ dados: new Map<string, DadosDaUnidade>([['A-1-2', { tipologia: 'Tipo 4', decorado: null }]]) });
        fireEvent.click(await screen.findByTestId('cena'));
        const botao = screen.getByRole('button', { name: 'Ver decorado' });
        expect(botao).toBeDisabled();
        expect(botao.parentElement!.getAttribute('title')).toBe('A tipologia Tipo 4 ainda não tem decorado cadastrado.');
        expect(screen.getByTestId('ficha-decorado-motivo').textContent).toBe('A tipologia Tipo 4 ainda não tem decorado cadastrado.');
    });

    it('prédio sem nenhum decorado: a ficha nem fala em decorado', async () => {
        montar();
        fireEvent.click(await screen.findByTestId('cena'));
        expect(screen.queryByRole('button', { name: 'Ver decorado' })).toBeNull();
    });

    it('fechar a ficha tira a seleção', async () => {
        montar();
        fireEvent.click(await screen.findByTestId('cena'));
        fireEvent.click(screen.getByRole('button', { name: 'Fechar a ficha' }));
        expect(screen.queryByRole('region', { name: /Ficha da unidade/ })).toBeNull();
        expect(screen.getByTestId('cena').getAttribute('data-selecionada')).toBe('');
    });
});

describe('Espelho3D — lista por andar', () => {
    const abrirLista = () => fireEvent.click(screen.getByRole('button', { name: /Unidades por andar 6/ }));

    it('com 3D a lista começa fechada; aberta, cada unidade é um botão com a frase inteira', () => {
        montar();
        expect(screen.getByRole('button', { name: /Unidades por andar 6/ }).getAttribute('aria-expanded')).toBe('false');
        abrirLista();
        expect(screen.getByRole('button', { name: 'Unidade 102, Torre A, Pavimento 1, Em negociação' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Unidade 001, Torre A, Térreo, Disponível' })).toBeTruthy();
    });

    it('Tab entra uma vez (só uma unidade com tabindex 0) e as setas andam pela unidade e pelo andar', () => {
        montar();
        abrirLista();
        const lista = screen.getByRole('group', { name: 'Torre A, 6 unidades' });
        const unidades = within(lista).getAllByRole('button');
        // O andar mais alto em cima: 201, 202, 101, 102, 001, 002.
        expect(unidades.map((b) => b.textContent)).toEqual(['201', '202', '101', '102', '001', '002']);
        expect(unidades.filter((b) => b.tabIndex === 0)).toHaveLength(1);
        unidades[0].focus();
        fireEvent.keyDown(unidades[0], { key: 'ArrowRight' });
        expect(document.activeElement).toBe(unidades[1]);
        fireEvent.keyDown(unidades[1], { key: 'ArrowDown' });
        expect(document.activeElement).toBe(unidades[3]);
        fireEvent.keyDown(unidades[3], { key: 'Home' });
        expect(document.activeElement).toBe(unidades[2]);
    });

    it('escolher na lista abre a mesma ficha do toque, e o destaque esmaece o que não casa', () => {
        montar();
        abrirLista();
        fireEvent.click(screen.getByRole('button', { name: 'Unidade 102, Torre A, Pavimento 1, Em negociação' }));
        expect(screen.getByRole('region', { name: 'Ficha da unidade 102' })).toBeTruthy();
        fireEvent.click(screen.getByRole('radio', { name: /Vendidas 2/ }));
        expect(screen.getByRole('button', { name: 'Unidade 102, Torre A, Pavimento 1, Em negociação' }).className).toContain('opacity-25');
        expect(screen.getByRole('button', { name: 'Unidade 101, Torre A, Pavimento 1, Vendida' }).className).not.toContain('opacity-25');
    });
});

describe('Espelho3D — sem 3D', () => {
    it('sem WebGL: nenhum desenho, o aviso diz por quê e a lista já vem aberta', () => {
        webgl.disponivel = false;
        montar();
        expect(screen.queryByTestId('cena')).toBeNull();
        expect(screen.getByRole('status').textContent).toMatch(/Este navegador não desenha 3D\..*lista por andar/);
        expect(screen.getByRole('button', { name: 'Unidade 102, Torre A, Pavimento 1, Em negociação' })).toBeTruthy();
    });

    it('o desenho quebra depois de montado: a lista assume, sem tela em branco', async () => {
        webgl.cenaQuebra = true;
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        montar();
        expect((await screen.findByRole('status')).textContent).toMatch(/não pôde ser aberto neste aparelho/);
        expect(screen.getByRole('button', { name: 'Unidade 201, Torre A, Pavimento 2, Disponível' })).toBeTruthy();
        erro.mockRestore();
    });

    it('cena sem unidade nenhuma: a frase, não um card vazio', () => {
        render(<Espelho3D cena={montarCenaDoEspelho({ torres: [{ ...TORRE, units: [] }] })} />);
        expect(screen.getByText(/Nenhuma unidade para mostrar no espelho\./)).toBeTruthy();
    });
});

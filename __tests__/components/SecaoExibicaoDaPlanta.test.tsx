// @vitest-environment jsdom
/**
 * Seção "Planta, vistas e 3D" da gaveta Preferências da Planta — plano
 * docs/planos/2026-10-24-preferencias-exibicao-da-planta.md, tarefa 4.
 *
 * Usa o HOOK REAL (`usePreferenciaDaPlanta`) com o `preferenciasService` simulado (como o teste do
 * editor): confere a lista por grupo, o rótulo igual ao do menu Exibir, o controle de cada tipo e que
 * o clique grava `planta.exibir.<item>` no escopo USUARIO.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ITENS_DE_EXIBICAO } from '../../utils/preferencias/catalogoExibir';

// O serviço simulado GUARDA o que foi gravado (valor `null` apaga a linha, como o real) e o devolve na
// próxima leitura — sem isso a releitura que o hook faz depois de gravar desfaria a escolha.
const m = vi.hoisted(() => ({
  banco: [] as { escopo: string; chave: string; valor: unknown }[],
  listar: vi.fn(async () => [] as unknown[]),
  gravar: vi.fn(async (..._a: unknown[]) => {}),
}));

vi.mock('../../services/preferenciasService', () => ({
  preferenciasService: {
    listarDoUsuario: (...a: unknown[]) => m.listar(...(a as [])),
    listarDaPrancha: vi.fn(async () => []),
    gravar: (...a: unknown[]) => m.gravar(...a),
    gravarVarios: vi.fn(async () => {}),
    apagarDoEstudo: vi.fn(async () => {}),
  },
}));

import SecaoExibicaoDaPlanta from '../../components/preferencias/SecaoExibicaoDaPlanta';
import { useStore } from '../../store/useStore';

let cliente: QueryClient;

function montar() {
  return render(
    <QueryClientProvider client={cliente}>
      <SecaoExibicaoDaPlanta />
    </QueryClientProvider>,
  );
}

const grupo = (nome: string) => screen.getByRole('group', { name: nome });
const chave = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement;
const seletor = (nome: string) => screen.getByRole('combobox', { name: nome }) as HTMLSelectElement;

beforeEach(() => {
  localStorage.clear();
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  m.banco = [];
  m.listar.mockReset().mockImplementation(async () => [...m.banco]);
  m.gravar.mockReset().mockImplementation(async (...a: unknown[]) => {
    const [escopo, , chaveGravada, valor] = a as [string, unknown, string, unknown];
    m.banco = m.banco.filter((l) => !(l.escopo === escopo && l.chave === chaveGravada));
    if (valor !== null) m.banco.push({ escopo, chave: chaveGravada, valor });
  });
  useStore.setState({ session: { user: { id: 'usr_1' } } as never });
});
afterEach(() => {
  cleanup();
  useStore.setState({ session: null as never });
  cliente.clear();
});

describe('SecaoExibicaoDaPlanta', () => {
  it('mostra os quatro grupos, na ordem, com os títulos pedidos', () => {
    montar();
    const titulos = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'));
    expect(titulos).toEqual(['Planta baixa', 'Vistas', '3D', 'Estilos']);
  });

  it('cada item do catálogo aparece no seu grupo, com o rótulo do menu Exibir (menos "Cor dos ambientes")', () => {
    montar();
    const nomeGrupo = { PLANTA: 'Planta baixa', VISTAS: 'Vistas', '3D': '3D', ESTILOS: 'Estilos' } as const;
    for (const def of ITENS_DE_EXIBICAO) {
      const rotulo = def.item === 'modoDeCor' ? 'Cor dos ambientes' : def.rotulo;
      expect(within(grupo(nomeGrupo[def.grupo])).getByLabelText(rotulo), `${def.item} em ${def.grupo}`).toBeInTheDocument();
    }
    // O catálogo continua com o rótulo do menu; só a aba renomeia.
    expect(screen.queryByLabelText('Uma cor por ambiente')).not.toBeInTheDocument();
  });

  it('chave booleana usa o interruptor do repositório e nasce com o padrão do catálogo', () => {
    montar();
    const grade = chave('Grade');
    expect(grade).toHaveAttribute('type', 'checkbox');
    expect(grade).toBeChecked(); // padrão: true
    expect(chave('Medidas das paredes')).not.toBeChecked(); // padrão: false
    // O estado fica escrito ao lado do interruptor (não só na cor).
    expect(grade.closest('li')).toHaveTextContent('Ligado');
    expect(chave('Medidas das paredes').closest('li')).toHaveTextContent('Desligado');
  });

  it('clicar numa chave grava planta.exibir.<item> no escopo USUARIO e vale na hora', async () => {
    montar();
    fireEvent.click(chave('Grade'));
    await waitFor(() => expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, 'planta.exibir.mostrarGrade', false));
    expect(chave('Grade')).not.toBeChecked();
    expect(JSON.parse(localStorage.getItem('blueprint:mostrarGrade')!)).toBe(false);
  });

  it('o valor já gravado no banco aparece nas chaves', async () => {
    m.banco = [{ escopo: 'USUARIO', chave: 'planta.exibir.mostrarGrade', valor: false }];
    montar();
    await waitFor(() => expect(chave('Grade')).not.toBeChecked());
  });

  it('escolha com opções usa o seletor, com as opções do catálogo, e grava o valor escolhido', async () => {
    montar();
    const estilo = seletor('Estilo da planta');
    expect(estilo.value).toBe('TECNICA');
    expect(within(estilo).getAllByRole('option').map((o) => o.textContent)).toEqual(['Técnica', 'Humanizada']);
    fireEvent.change(estilo, { target: { value: 'HUMANIZADA' } });
    await waitFor(() => expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, 'planta.exibir.estiloPlanta', 'HUMANIZADA'));
    expect(seletor('Estilo da planta').value).toBe('HUMANIZADA');

    expect(within(seletor('Estilo do 3D')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Sombreado',
      'Linha oculta',
      'Transparente',
    ]);
  });

  it('"Cor dos ambientes" tem as 7 opções do modo de cor', () => {
    montar();
    const cor = seletor('Cor dos ambientes');
    expect(cor.value).toBe('NENHUM');
    expect(within(cor).getAllByRole('option')).toHaveLength(7);
  });

  it('Terreno 3D oferece Automático | Ligado | Desligado, e Automático é o padrão', async () => {
    montar();
    const terreno = seletor('Terreno');
    expect(within(terreno).getAllByRole('option').map((o) => o.textContent)).toEqual(['Automático', 'Ligado', 'Desligado']);
    expect(terreno.value).toBe('automatico');

    fireEvent.change(terreno, { target: { value: 'ligado' } });
    await waitFor(() => expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, 'planta.exibir.vista3dTerreno', true));
    fireEvent.change(seletor('Terreno'), { target: { value: 'desligado' } });
    await waitFor(() => expect(m.gravar).toHaveBeenCalledWith('USUARIO', {}, 'planta.exibir.vista3dTerreno', false));
    fireEvent.change(seletor('Terreno'), { target: { value: 'automatico' } });
    await waitFor(() => expect(m.gravar).toHaveBeenLastCalledWith('USUARIO', {}, 'planta.exibir.vista3dTerreno', null));
  });

  it('sem sessão a escolha vale na tela e no navegador, sem chamar o serviço', () => {
    useStore.setState({ session: null as never });
    montar();
    fireEvent.click(chave('Grade'));
    expect(chave('Grade')).not.toBeChecked();
    expect(JSON.parse(localStorage.getItem('blueprint:mostrarGrade')!)).toBe(false);
    expect(m.gravar).not.toHaveBeenCalled();
  });
});

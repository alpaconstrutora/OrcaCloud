/**
 * Portal do Parceiro › Convidar integrante — preenchimento com o contato do
 * fornecedor. Plano: docs/planos/2026-10-16-parceiro-convite-contato-do-fornecedor.md
 */
import { describe, it, expect } from 'vitest';
import {
  contatoDoFornecedor, situacaoDoContato, preencherComContato, marcarEditado, formIgualAoContato,
  type ConviteForm,
} from '../utils/partnerConviteContato';

const vazio: ConviteForm = { name: '', email: '', phone: '' };
const fornecedor = { name: 'Construtora X Ltda', nickname: 'Construtora X', contact_name: ' João Silva ', email: ' Joao@X.com.BR ', phone: '(31) 9 9999-0000' };

describe('contatoDoFornecedor', () => {
  it('limpa espaços e põe o e-mail em minúsculas', () => {
    expect(contatoDoFornecedor(fornecedor)).toEqual({
      fornecedor: 'Construtora X', nome: 'João Silva', email: 'joao@x.com.br', telefone: '(31) 9 9999-0000',
    });
  });
  it('sem "Nome do contato": PF usa o nome do fornecedor; PJ fica sem nome', () => {
    expect(contatoDoFornecedor({ name: ' Bruna Suelem ', type: 'PF', email: 'b@x.com' })?.nome).toBe('Bruna Suelem');
    expect(contatoDoFornecedor({ name: 'Construtora Y Ltda', type: 'PJ', email: 'c@y.com' })?.nome).toBe('');
    expect(contatoDoFornecedor({ name: 'Bruna', type: 'PF', contact_name: 'Outra Pessoa' })?.nome).toBe('Outra Pessoa');
  });
  it('sem apelido usa o nome; sem fornecedor devolve null', () => {
    expect(contatoDoFornecedor({ name: 'Y', email: 'a@b.c' })?.fornecedor).toBe('Y');
    expect(contatoDoFornecedor(null)).toBeNull();
  });
});

describe('situacaoDoContato', () => {
  const c = contatoDoFornecedor(fornecedor);
  it('disponível quando o e-mail não é integrante', () => {
    expect(situacaoDoContato(c, ['outra@x.com.br'])).toBe('disponivel');
  });
  it('já integrante ignora caixa e espaços', () => {
    expect(situacaoDoContato(c, [' JOAO@x.com.br'])).toBe('ja-integrante');
  });
  it('sem e-mail e sem cadastro', () => {
    expect(situacaoDoContato(contatoDoFornecedor({ name: 'Z', contact_name: 'Ana' }), [])).toBe('sem-email');
    expect(situacaoDoContato(null, [])).toBe('sem-cadastro');
  });
});

describe('preencherComContato', () => {
  const c = contatoDoFornecedor(fornecedor)!;

  it('preenche o formulário vazio e marca os três campos', () => {
    const r = preencherComContato(vazio, new Set(), c);
    expect(r.form).toEqual({ name: 'João Silva', email: 'joao@x.com.br', phone: '(31) 9 9999-0000' });
    expect([...r.auto].sort()).toEqual(['email', 'name', 'phone']);
  });

  it('não sobrescreve o que foi digitado', () => {
    const r = preencherComContato({ name: 'Maria', email: '', phone: '' }, new Set(), c);
    expect(r.form.name).toBe('Maria');
    expect(r.auto.has('name')).toBe(false);
    expect(r.form.email).toBe('joao@x.com.br');
  });

  it('editar à mão tira do automático; "Usar este contato" (forcar) repõe', () => {
    const r1 = preencherComContato(vazio, new Set(), c);
    const auto = marcarEditado(r1.auto, 'name');
    const editado = { ...r1.form, name: 'Outra pessoa' };
    expect(preencherComContato(editado, auto, c).form.name).toBe('Outra pessoa');
    const r2 = preencherComContato(editado, auto, c, true);
    expect(r2.form.name).toBe('João Silva');
    expect(r2.auto.has('name')).toBe(true);
  });

  it('campo que o contato não tem não é apagado nem marcado', () => {
    const semNome = contatoDoFornecedor({ name: 'Z', email: 'z@z.com' })!;
    const r = preencherComContato({ name: 'Digitado', email: '', phone: '11' }, new Set(), semNome);
    expect(r.form).toEqual({ name: 'Digitado', email: 'z@z.com', phone: '11' });
    expect([...r.auto]).toEqual(['email']);
  });

  it('formIgualAoContato', () => {
    const r = preencherComContato(vazio, new Set(), c);
    expect(formIgualAoContato(r.form, c)).toBe(true);
    expect(formIgualAoContato({ ...r.form, name: 'X' }, c)).toBe(false);
  });
});

/**
 * Portal do Parceiro › "Convidar integrante" — o painel se preenche com o
 * contato que o fornecedor já tem cadastrado.
 *
 * Pedido de 16/10/2026: "Em minha organizacao > meus fornecedores > enderecos e
 * contados é o lugar para cadastro. Agora no portal do parceiro > Convidar
 * integrante: buscar automaticamente o integrante ja cadastrado em organizacao
 * > meus fornecedores". Plano: docs/planos/2026-10-16-parceiro-convite-contato-do-fornecedor.md
 *
 * O cadastro do fornecedor guarda UM contato: `contact_name` (Dados gerais),
 * `email` e `phone` (Endereços e contatos). Este módulo decide, sem React, o
 * que preencher — mesma regra de `utils/warrantyAutofill.ts`: **nunca
 * sobrescrever o que foi digitado**. Um campo só é escrito se está vazio ou se
 * foi o próprio preenchimento automático que o escreveu (`auto`).
 */

export interface ConviteForm {
  name: string;
  email: string;
  phone: string;
}

export type ConviteCampo = keyof ConviteForm;
export type ConviteAuto = ReadonlySet<ConviteCampo>;

export interface ContatoDoFornecedor {
  /** Nome do fornecedor — só para dizer de onde o contato veio. */
  fornecedor: string;
  nome: string;
  /** Minúsculo e sem espaços: é o login, e o banco compara letra a letra. */
  email: string;
  telefone: string;
}

/** Recorte do `Supplier` que interessa aqui (evita depender do tipo inteiro). */
export interface FornecedorComContato {
  name?: string | null;
  nickname?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  /** 'PF' | 'PJ' — em PF o próprio nome do fornecedor é o nome da pessoa. */
  type?: string | null;
}

export type SituacaoDoContato =
  /** Fornecedor do workspace não encontrado (sem acesso ou excluído). */
  | 'sem-cadastro'
  /** Fornecedor sem e-mail — não há login para convidar. */
  | 'sem-email'
  /** O e-mail do contato já é integrante deste parceiro. */
  | 'ja-integrante'
  | 'disponivel';

const limpar = (s?: string | null) => (s ?? '').trim();
export const normalizarEmail = (s?: string | null) => limpar(s).toLowerCase();

export function contatoDoFornecedor(f: FornecedorComContato | null | undefined): ContatoDoFornecedor | null {
  if (!f) return null;
  return {
    fornecedor: limpar(f.nickname) || limpar(f.name),
    // "Nome do contato" primeiro. Sem ele, o fornecedor PESSOA FÍSICA é a própria
    // pessoa (medido em 16/10/2026: nenhum fornecedor com parceiro tinha
    // contact_name, e metade era PF). Razão social de PJ não é nome de pessoa.
    nome: limpar(f.contact_name) || (f.type === 'PF' ? limpar(f.name) : ''),
    email: normalizarEmail(f.email),
    telefone: limpar(f.phone),
  };
}

export function situacaoDoContato(
  contato: ContatoDoFornecedor | null,
  emailsDosIntegrantes: readonly string[],
): SituacaoDoContato {
  if (!contato) return 'sem-cadastro';
  if (!contato.email) return 'sem-email';
  const ja = new Set(emailsDosIntegrantes.map(normalizarEmail));
  return ja.has(contato.email) ? 'ja-integrante' : 'disponivel';
}

/**
 * Preenche com o contato. `forcar = true` é o botão "Usar este contato": aí o
 * usuário PEDIU o contato, então os campos que o contato tem são repostos
 * mesmo que tenham sido editados. Sem `forcar`, só escreve campo vazio ou
 * automático. Campo que o contato não tem (ex.: sem nome de contato) nunca é
 * apagado.
 */
export function preencherComContato<F extends ConviteForm>(
  form: F,
  auto: ConviteAuto,
  contato: ContatoDoFornecedor,
  forcar = false,
): { form: F; auto: Set<ConviteCampo> } {
  const proximo = { ...form };
  const proximoAuto = new Set(auto);
  const valores: ConviteForm = { name: contato.nome, email: contato.email, phone: contato.telefone };
  (Object.keys(valores) as ConviteCampo[]).forEach(campo => {
    const valor = valores[campo];
    if (!valor) return;
    const livre = forcar || !limpar(proximo[campo]) || proximoAuto.has(campo);
    if (!livre) return;
    proximo[campo] = valor as F[ConviteCampo];
    proximoAuto.add(campo);
  });
  return { form: proximo, auto: proximoAuto };
}

/** Editar à mão tira o campo do conjunto automático. */
export function marcarEditado(auto: ConviteAuto, campo: ConviteCampo): Set<ConviteCampo> {
  const proximo = new Set(auto);
  proximo.delete(campo);
  return proximo;
}

/** O formulário já mostra exatamente o contato? (esconde "Usar este contato"). */
export function formIgualAoContato(form: ConviteForm, contato: ContatoDoFornecedor): boolean {
  return (!contato.nome || limpar(form.name) === contato.nome)
    && normalizarEmail(form.email) === contato.email
    && (!contato.telefone || limpar(form.phone) === contato.telefone);
}

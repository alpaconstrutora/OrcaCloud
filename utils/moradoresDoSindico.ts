// utils/moradoresDoSindico.ts
//
// Portal do Síndico › Unidades › Moradores (G6, 26/11/2026). A parte pura.
// Plano: docs/planos/2026-10-24-portal-sindico-gestao-completa.md
//
// O banco decide (RPCs `sindico_portal_morador_*`, migration aplicar_20271126950400) e o
// convite sai pela Edge `portal-invite-user` (o link vai SÓ no e-mail do morador); isto
// existe para o botão desligado dizer o motivo ANTES do clique, com as mesmas frases.

export type PapelDoMorador = 'PROPRIETARIO' | 'INQUILINO' | 'MORADOR' | 'RESPONSAVEL_FINANCEIRO';

export const ROTULO_PAPEL: Record<PapelDoMorador, string> = {
    PROPRIETARIO: 'Proprietário', INQUILINO: 'Inquilino', MORADOR: 'Morador', RESPONSAVEL_FINANCEIRO: 'Responsável financeiro',
};

export interface OcupacaoDoPredio {
    id: string;
    papel: PapelDoMorador;
    desde: string;
    ate: string | null;
    vigente: boolean;
    clientId: string;
    nome: string;
    email: string | null;
    telefone: string | null;
    convidadoEm: string | null;
    abaCondominio: boolean;
}

export interface UnidadeComMoradores {
    unitId: string;
    unidade: string;
    torre: string | null;
    ocupacoes: OcupacaoDoPredio[];
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Mesmas frases de `sindico_portal_morador_autorizar_convite`. */
export function motivoNaoConvida(o: Pick<OcupacaoDoPredio, 'vigente' | 'email'>, base: string | null): string | null {
    if (base) return base;
    if (!o.vigente) return 'Só quem mora no condomínio recebe o convite por aqui.';
    if (!o.email?.trim()) return 'O morador não tem e-mail. Preencha o e-mail antes de convidar.';
    return null;
}

export function motivoNaoEncerra(o: Pick<OcupacaoDoPredio, 'vigente' | 'ate'>, base: string | null): string | null {
    if (base) return base;
    return o.ate ? 'Esta ocupação já está encerrada.' : null;
}

export function motivoDoEmail(email: string): string | null {
    const e = email.trim();
    return e && !EMAIL.test(e) ? 'E-mail inválido.' : null;
}

export interface FormMorador {
    unitId: string;
    papel: PapelDoMorador;
    desde: string;
    /** Cadastro existente (morador do prédio) ou vazio = novo. */
    clientId: string;
    nome: string;
    documento: string;
    email: string;
    telefone: string;
}

/** Espelho das checagens de `sindico_portal_morador_salvar`. */
export function motivoDoMorador(f: FormMorador): string | null {
    if (!f.unitId) return 'Escolha uma unidade deste condomínio.';
    if (f.clientId) return null;
    if (!f.nome.trim()) return 'Informe o nome do morador.';
    const d = f.documento.replace(/\D/g, '');
    if (d && d.length !== 11 && d.length !== 14) return 'CPF tem 11 dígitos e CNPJ tem 14.';
    return motivoDoEmail(f.email);
}

/** Pessoas distintas que já moram/moraram no prédio — para escolher sem recadastrar. */
export function pessoasDoPredio(unidades: UnidadeComMoradores[]): { clientId: string; nome: string }[] {
    const vistos = new Map<string, string>();
    for (const u of unidades) for (const o of u.ocupacoes) if (!vistos.has(o.clientId)) vistos.set(o.clientId, o.nome);
    return [...vistos.entries()].map(([clientId, nome]) => ({ clientId, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

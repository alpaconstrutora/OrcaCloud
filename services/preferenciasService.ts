/**
 * preferenciasService — leitura e gravação da tabela `public.preferencias` (planta elétrica).
 * Plano docs/planos/2026-10-22-preferencias-planta-eletrica.md, seção 3. É a ÚNICA camada que fala
 * com o banco para essas preferências.
 *
 * Três escopos, três donos (o CHECK do banco exige exatamente um dono preenchido):
 *   USUARIO      user_id          — como a pessoa vê a planta na TELA;
 *   ORGANIZACAO  organization_id  — padrão da prancha/PDF da empresa;
 *   ESTUDO       study_id         — ajuste da prancha de UMA planta.
 * `user_id` não tem DEFAULT no banco: em USUARIO o serviço ENVIA o id da sessão; nos outros dois
 * envia `null`. A RLS é a trava final (quem não é gestor da organização não grava ORGANIZACAO).
 */
import { supabase } from '../lib/supabase';
import type { EscopoDaPreferencia, LinhaDePreferencia } from '../utils/preferencias/resolver';

const TABELA = 'preferencias';
const COLUNAS = 'escopo, chave, valor';

export interface DonoDaPreferencia {
  organizationId?: string;
  studyId?: string;
}

/** Coluna do dono + índice único (onConflict) de cada escopo. */
const COLUNA_DO_DONO: Record<EscopoDaPreferencia, 'user_id' | 'organization_id' | 'study_id'> = {
  USUARIO: 'user_id',
  ORGANIZACAO: 'organization_id',
  ESTUDO: 'study_id',
};

function falhou(contexto: string, error: { message: string }): never {
  console.error(`[preferenciasService] ${contexto}:`, error);
  throw new Error(error.message);
}

/** Id do usuário da sessão; sem sessão, erro claro (não adianta falar com o banco). */
async function usuarioDaSessao(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  const id = data?.user?.id;
  if (error || !id) throw new Error('Sem usuário na sessão — entre de novo para salvar suas preferências.');
  return id;
}

/** Valor do dono do escopo, ou erro claro quando falta. */
function donoDoEscopo(escopo: EscopoDaPreferencia, dono: DonoDaPreferencia, userId: string | null): string {
  if (escopo === 'USUARIO') return userId as string;
  if (escopo === 'ORGANIZACAO') {
    if (!dono.organizationId) throw new Error('Escolha uma organização para gravar o padrão da prancha.');
    return dono.organizationId;
  }
  if (!dono.studyId) throw new Error('Falta o estudo (planta) para gravar o ajuste da prancha.');
  return dono.studyId;
}

/** `%` e `_` do prefixo valem como texto, não como curinga do LIKE. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const preferenciasService = {
  /** Linhas USUARIO da pessoa da sessão (a RLS já limita; o filtro explícito deixa a intenção clara). */
  async listarDoUsuario(): Promise<LinhaDePreferencia[]> {
    const userId = await usuarioDaSessao();
    const { data, error } = await supabase
      .from(TABELA)
      .select(COLUNAS)
      .eq('escopo', 'USUARIO')
      .eq('user_id', userId);
    if (error) falhou('Erro ao ler as preferências do usuário', error);
    return (data ?? []) as LinhaDePreferencia[];
  },

  /** ORGANIZACAO dessa organização + ESTUDO desse estudo (se houver). Qualquer falha rejeita. */
  async listarDaPrancha(organizationId: string, studyId?: string | null): Promise<LinhaDePreferencia[]> {
    const daOrganizacao = supabase
      .from(TABELA)
      .select(COLUNAS)
      .eq('escopo', 'ORGANIZACAO')
      .eq('organization_id', organizationId);
    const doEstudo = studyId
      ? supabase.from(TABELA).select(COLUNAS).eq('escopo', 'ESTUDO').eq('study_id', studyId)
      : null;

    const [org, est] = await Promise.all([daOrganizacao, doEstudo]);
    if (org.error) falhou('Erro ao ler o padrão da prancha da organização', org.error);
    if (est?.error) falhou('Erro ao ler o ajuste da prancha do estudo', est.error);
    return [...((org.data ?? []) as LinhaDePreferencia[]), ...((est?.data ?? []) as LinhaDePreferencia[])];
  },

  /** Grava (upsert pelo índice do escopo) ou, com `valor === null`, apaga a linha ("voltar ao padrão"). */
  async gravar(
    escopo: EscopoDaPreferencia,
    dono: DonoDaPreferencia,
    chave: string,
    valor: boolean | null,
  ): Promise<void> {
    const userId = await usuarioDaSessao();
    const idDoDono = donoDoEscopo(escopo, dono, userId);
    const colunaDoDono = COLUNA_DO_DONO[escopo];

    if (valor === null) {
      const { error } = await supabase
        .from(TABELA)
        .delete()
        .eq('escopo', escopo)
        .eq(colunaDoDono, idDoDono)
        .eq('chave', chave);
      if (error) falhou('Erro ao voltar a preferência ao padrão', error);
      return;
    }

    const linha = {
      escopo,
      user_id: escopo === 'USUARIO' ? idDoDono : null,
      organization_id: escopo === 'ORGANIZACAO' ? idDoDono : null,
      study_id: escopo === 'ESTUDO' ? idDoDono : null,
      chave,
      valor,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };
    const { error } = await supabase.from(TABELA).upsert(linha, { onConflict: `escopo,${colunaDoDono},chave` });
    if (error) falhou('Erro ao gravar a preferência', error);
  },

  /** "Padrão da prancha: da empresa" — apaga as linhas ESTUDO do estudo cuja chave começa por `prefixo`. */
  async apagarDoEstudo(studyId: string, prefixo: string): Promise<void> {
    const { error } = await supabase
      .from(TABELA)
      .delete()
      .eq('escopo', 'ESTUDO')
      .eq('study_id', studyId)
      .like('chave', `${escaparLike(prefixo)}%`);
    if (error) falhou('Erro ao apagar os ajustes da prancha do estudo', error);
  },
};

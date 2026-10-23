import React from 'react';
import { useOrgContext } from '../../hooks/useOrgContext';
import { usePreferenciasEletricas } from '../../hooks/usePreferenciasEletricas';
import { useStore } from '../../store/useStore';
import { ITENS_ELETRICOS, type AlvoDaPreferencia, type ItemEletrico } from '../../utils/preferencias/catalogo';
import { podeGerirPrancha } from '../../utils/preferencias/podeGerirPrancha';
import { origemDoValor, type EscopoDaPreferencia } from '../../utils/preferencias/resolver';
import ListaDePreferenciasEletricas from './ListaDePreferenciasEletricas';

/**
 * Seção "Planta › Elétrica" da gaveta Preferências (23/10/2026).
 * Plano docs/planos/2026-10-22-preferencias-planta-eletrica.md, seção 3.
 *
 *  - Coluna TELA = escolha de quem está logado (escopo USUARIO), vale em qualquer organização.
 *  - Coluna PRANCHA = padrão da empresa do seletor do topo (escopo ORGANIZACAO), só para quem
 *    administra a organização; o motivo da trava fica escrito na coluna.
 *  - A organização vem de `useOrgContext()` (REGRA #5) — nunca da primeira da lista. Com o topo em
 *    "Todas" o hook roda com `organizationId: null`: a Tela segue funcionando e a Prancha trava.
 *  - O banco é a trava final (RLS); aqui o botão só diz o motivo antes de a pessoa tentar.
 */

const ESCOPO_DO_ALVO: Record<AlvoDaPreferencia, EscopoDaPreferencia> = {
  tela: 'USUARIO',
  prancha: 'ORGANIZACAO',
};

const MOTIVO_JA_NO_PADRAO = 'Você ainda não mudou nada aqui — já está no padrão do sistema.';

export default function SecaoPlantaEletrica() {
  const { orgId, isAllOrgs } = useOrgContext();
  const email = useStore((s) => s.session?.user?.email);
  const organizations = useStore((s) => s.organizations);

  const { tela, prancha, linhasDaTela, linhasDaPrancha, carregando, erro, alterar } = usePreferenciasEletricas({
    organizationId: isAllOrgs ? null : orgId,
  });

  const gestao = React.useMemo(() => {
    const emailLower = (email || '').toLowerCase();
    const org = orgId ? organizations.find((o) => o.id === orgId) : undefined;
    const membro = org?.members?.find((mb) => (mb.email || '').toLowerCase() === emailLower) ?? null;
    return podeGerirPrancha({ isAllOrgs, membro, membrosCarregados: !!org?.members });
  }, [email, organizations, orgId, isAllOrgs]);
  const travaDaPrancha = gestao.pode ? null : gestao.motivo;

  const aoAlterar = (alvo: AlvoDaPreferencia, item: ItemEletrico, valor: boolean | null) => {
    if (alvo === 'prancha' && !gestao.pode) return;
    void alterar(alvo, item, valor, ESCOPO_DO_ALVO[alvo]);
  };

  /** Itens que a pessoa/empresa escolheu de fato (têm linha própria nesse escopo). */
  const itensComEscolhaPropria = (alvo: AlvoDaPreferencia): ItemEletrico[] => {
    const linhas = alvo === 'tela' ? linhasDaTela : linhasDaPrancha;
    return ITENS_ELETRICOS.filter((d) => origemDoValor(linhas, alvo, d.item) === ESCOPO_DO_ALVO[alvo]).map((d) => d.item);
  };

  const aoVoltarAoPadrao = (alvo: AlvoDaPreferencia) => {
    if (alvo === 'prancha' && !gestao.pode) return;
    // `alterar` já é otimista, reverte e avisa sozinho na falha — não há o que tratar aqui.
    for (const item of itensComEscolhaPropria(alvo)) void alterar(alvo, item, null, ESCOPO_DO_ALVO[alvo]);
  };

  const voltarDesligado: Partial<Record<AlvoDaPreferencia, string>> = {};
  for (const alvo of ['tela', 'prancha'] as const) {
    if (itensComEscolhaPropria(alvo).length === 0) voltarDesligado[alvo] = MOTIVO_JA_NO_PADRAO;
  }

  return (
    <section aria-labelledby="pref-planta-eletrica-titulo" className="space-y-4">
      <div>
        <h3 id="pref-planta-eletrica-titulo" className="text-sm font-bold text-slate-900">
          Planta › Elétrica
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Escolha o que a planta elétrica escreve no desenho. Na Tela vale só para você; na Prancha é o padrão da empresa.
        </p>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-red-600">
          Não foi possível carregar as preferências da planta. Mostrando os padrões do sistema.
        </p>
      )}

      {carregando ? (
        <div className="py-8 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="mt-2 text-sm text-gray-500">Carregando preferências…</p>
        </div>
      ) : (
        <ListaDePreferenciasEletricas
          colunas={['tela', 'prancha']}
          tela={tela}
          prancha={prancha}
          travaDaPrancha={travaDaPrancha}
          aoAlterar={aoAlterar}
          aoVoltarAoPadrao={aoVoltarAoPadrao}
          voltarDesligado={voltarDesligado}
        />
      )}
    </section>
  );
}

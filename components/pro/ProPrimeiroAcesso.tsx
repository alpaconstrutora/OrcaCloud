import React from 'react';
import { Loader2 } from 'lucide-react';
import { proService } from '../../services/proService';

/**
 * Primeiro acesso do ÒPURA Pro público (14/11/2026, docs/planos/2026-11-14-opura-pro-publico.md, P3).
 * Só o que muda o resto: o nome que vai no orçamento e a profissão, que escolhe os modelos
 * sugeridos. Chave Pix e cidade ficam para Ajustes — não seguram a primeira venda.
 */

const PROFISSOES = [
  { valor: 'AR_CONDICIONADO', rotulo: 'Ar-condicionado e refrigeração' },
  { valor: 'ELETRICISTA', rotulo: 'Eletricista / instalações elétricas' },
  { valor: 'ENCANADOR', rotulo: 'Encanador / sistemas hidráulicos' },
  { valor: 'PINTOR', rotulo: 'Pintor / acabamentos' },
] as const;

const CAMPO = 'w-full h-12 bg-white border border-slate-300 rounded-[6px] px-3 text-base text-slate-900 placeholder:text-slate-400 caret-blue-600 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600';

export const ProPrimeiroAcesso: React.FC<{ userId: string; onConcluir: () => void; onSair: () => void }> = ({ userId, onConcluir, onSair }) => {
  const [nome, setNome] = React.useState('');
  const [profissao, setProfissao] = React.useState<string>('');
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState('');
  const idNome = React.useId();
  const idProfissao = React.useId();

  const motivo = !nome.trim() ? 'Digite o nome que vai no orçamento.' : !profissao ? 'Escolha a sua profissão.' : '';

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (motivo || salvando) return;
    setSalvando(true);
    setErro('');
    try {
      await proService.saveConfig({
        user_id: userId,
        template_header: nome.trim(),
        profissao,
        templates_custom: [],
        created_at: new Date().toISOString(),
      });
      onConcluir();
    } catch (err) {
      console.error('Erro no primeiro acesso do Pro:', err);
      setErro('Não foi possível salvar. Confira a internet e tente de novo.');
      setSalvando(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <main className="w-full max-w-sm mx-auto px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8">
        <p className="text-2xl font-bold text-slate-900">Bem-vindo ao ÒPURA Pro</p>
        <p className="text-base text-slate-700 mt-1.5">Duas coisas e você já faz o primeiro orçamento.</p>

        <form onSubmit={salvar} className="mt-8 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor={idNome} className="block text-xs font-semibold text-slate-500">Seu nome ou nome da empresa</label>
            <input
              id={idNome}
              autoComplete="organization"
              placeholder="Ex.: João Refrigeração"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={CAMPO}
            />
            <p className="text-sm text-slate-600">É o nome que o cliente vê no orçamento em PDF.</p>
          </div>

          <fieldset className="space-y-1.5">
            <legend id={idProfissao} className="block text-xs font-semibold text-slate-500">O que você faz?</legend>
            <div className="grid gap-2" role="radiogroup" aria-labelledby={idProfissao}>
              {PROFISSOES.map(p => (
                <button
                  key={p.valor}
                  type="button"
                  role="radio"
                  aria-checked={profissao === p.valor}
                  onClick={() => setProfissao(p.valor)}
                  className={`min-h-12 px-3 text-left rounded-[6px] border text-base transition-colors ${
                    profissao === p.valor ? 'border-blue-600 bg-blue-50 text-blue-900 font-medium' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
            <p className="text-sm text-slate-600">Define os modelos de orçamento que aparecem prontos. Dá para mudar em Ajustes.</p>
          </fieldset>

          <button
            type="submit"
            disabled={!!motivo || salvando}
            title={motivo || undefined}
            className="w-full h-12 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-[6px] font-medium text-base transition-colors disabled:opacity-60"
          >
            {salvando && <Loader2 className="w-5 h-5 animate-spin" aria-hidden />}
            Começar
          </button>
          {motivo && <p className="text-sm text-slate-600" role="status">{motivo}</p>}
          {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
        </form>

        <button type="button" onClick={onSair} className="mt-8 min-h-11 text-sm font-medium text-slate-700 underline underline-offset-4">
          Sair
        </button>
      </main>
    </div>
  );
};

export default ProPrimeiroAcesso;

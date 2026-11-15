/**
 * ÒPURA Pro — "Minha conta" em Ajustes (15/11/2026, docs/planos/2026-11-14-opura-pro-publico.md).
 * LGPD art. 18: cópia dos dados e exclusão, sem precisar escrever para ninguém.
 *
 *  - Baixar meus dados: para todo mundo (arquivo .json montado no navegador, utils/proMeusDados.ts).
 *  - Conta só-Pro: "Excluir minha conta" (RPC pro_excluir_minha_conta; apaga tudo em cascata).
 *  - Conta interna (também acessa o ÒPURA): só "Apagar meus dados do Pro" (RPC
 *    pro_apagar_meus_dados) — a conta em si é da empresa e não sai por aqui.
 * O banco confere tudo de novo: esconder o botão aqui é conforto, não a trava.
 */
import React, { useState } from 'react';
import { Download, Trash2, UserX, Loader2, ShieldCheck } from 'lucide-react';
import { proService } from '../../services/proService';
import { useConfirm } from '../ui/confirm';
import { nomeDoArquivoMeusDados, montarArquivoMeusDados } from '../../utils/proMeusDados';

const CARTAO = 'bg-white p-4 border border-slate-200 rounded-[10px] space-y-4';
const TITULO_BLOCO = 'text-sm font-semibold text-slate-900 flex items-center gap-1.5';
const BOTAO_BASE = 'w-full h-11 px-3 flex items-center justify-center gap-1.5 bg-white border rounded-[6px] font-medium text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';
const BOTAO_SECUNDARIO = `${BOTAO_BASE} border-slate-300 text-slate-800 hover:bg-slate-50 focus-visible:outline-blue-600`;
// §14: vermelho só para o destrutivo; red-700 (red-500 sobre branco não passa no contraste).
const BOTAO_PERIGO = `${BOTAO_BASE} border-red-300 text-red-700 hover:bg-red-50 focus-visible:outline-red-600`;

type Acao = 'baixar' | 'apagar' | 'excluir';
const EM_ANDAMENTO: Record<Acao, string> = {
  baixar: 'Aguarde: preparando o arquivo.',
  apagar: 'Aguarde: apagando os dados.',
  excluir: 'Aguarde: excluindo a conta.',
};

interface ProMinhaContaProps {
  userId: string;
  /** Conta criada pelo Pro (user_metadata.origem = 'pro'): pode ser excluída por aqui. */
  contaSoPro: boolean;
  avisar: (mensagem: string, tipo: 'success' | 'error') => void;
  /** Depois de "Apagar meus dados do Pro" (a conta continua, sem cadastro). */
  onDadosApagados: () => void;
  /** Depois de "Excluir minha conta": encerra a sessão local (a do servidor já não existe). */
  onContaExcluida?: () => void;
}

function mensagemDoErro(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  // Recusas da própria função (42501/28000) já vêm em português, prontas para a tela.
  if (e?.message && (e.code === '42501' || e.code === '28000')) return e.message;
  return 'Não deu certo agora. Confira a internet e tente de novo.';
}

export const ProMinhaConta: React.FC<ProMinhaContaProps> = ({ userId, contaSoPro, avisar, onDadosApagados, onContaExcluida }) => {
  const confirm = useConfirm();
  const [ocupado, setOcupado] = useState<Acao | null>(null);
  const motivo = (acao: Acao) => (ocupado && ocupado !== acao ? EM_ANDAMENTO[ocupado] : undefined);

  const baixar = async () => {
    setOcupado('baixar');
    try {
      const dados = await proService.exportarMeusDados(userId);
      const agora = new Date();
      const url = URL.createObjectURL(new Blob([montarArquivoMeusDados(dados, agora)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeDoArquivoMeusDados(agora);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      avisar('Arquivo baixado.', 'success');
    } catch (err) {
      console.error('Erro ao baixar os dados do Pro:', err);
      avisar(mensagemDoErro(err), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const apagar = async () => {
    const ok = await confirm({
      title: 'Apagar seus dados do Pro?',
      message: 'Apaga clientes, orçamentos, serviços (com fotos e assinaturas) e seus ajustes, como a chave Pix. A conta continua. Não dá para desfazer — se quiser guardar, baixe uma cópia antes.',
      confirmLabel: 'Apagar dados',
      variant: 'danger',
    });
    if (!ok) return;
    setOcupado('apagar');
    try {
      await proService.apagarMeusDados();
      avisar('Seus dados do Pro foram apagados.', 'success');
      onDadosApagados();
    } catch (err) {
      console.error('Erro ao apagar os dados do Pro:', err);
      avisar(mensagemDoErro(err), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const excluir = async () => {
    const ok = await confirm({
      title: 'Excluir sua conta?',
      message: 'Apaga a conta e tudo o que está nela: clientes, orçamentos, serviços, fotos, assinaturas e ajustes. Não dá para desfazer — se quiser guardar, baixe uma cópia antes. Para usar o ÒPURA Pro de novo, é só criar outra conta.',
      confirmLabel: 'Excluir conta',
      variant: 'danger',
    });
    if (!ok) return;
    setOcupado('excluir');
    try {
      await proService.excluirMinhaConta();
    } catch (err) {
      console.error('Erro ao excluir a conta do Pro:', err);
      avisar(mensagemDoErro(err), 'error');
      setOcupado(null);
      return;
    }
    await confirm({
      title: 'Conta excluída',
      message: 'Sua conta e todos os dados dela foram apagados.',
      confirmLabel: 'Fechar',
      hideCancel: true,
    });
    onContaExcluida?.();
  };

  return (
    <section className={CARTAO} aria-labelledby="pro-minha-conta-titulo">
      <h2 id="pro-minha-conta-titulo" className={TITULO_BLOCO}>
        <ShieldCheck className="w-4 h-4 text-slate-600" aria-hidden />
        Minha conta
      </h2>

      <div className="space-y-2">
        <p className="text-xs text-slate-600">
          Uma cópia de tudo o que você cadastrou — ajustes, clientes, orçamentos e serviços, com fotos e assinaturas.
        </p>
        <button type="button" onClick={baixar} disabled={!!ocupado} title={motivo('baixar')} className={BOTAO_SECUNDARIO}>
          {ocupado === 'baixar' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
          {ocupado === 'baixar' ? 'Preparando o arquivo…' : 'Baixar meus dados'}
        </button>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-4">
        {contaSoPro ? (
          <>
            <p className="text-xs text-slate-600">Apaga a conta e tudo o que está nela. Não dá para desfazer.</p>
            <button type="button" onClick={excluir} disabled={!!ocupado} title={motivo('excluir')} className={BOTAO_PERIGO}>
              {ocupado === 'excluir' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UserX className="w-4 h-4" aria-hidden />}
              {ocupado === 'excluir' ? 'Excluindo a conta…' : 'Excluir minha conta'}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-600">
              Apaga só o que é do Pro. Esta conta também acessa o ÒPURA, por isso a exclusão dela é feita pela empresa.
            </p>
            <button type="button" onClick={apagar} disabled={!!ocupado} title={motivo('apagar')} className={BOTAO_PERIGO}>
              {ocupado === 'apagar' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Trash2 className="w-4 h-4" aria-hidden />}
              {ocupado === 'apagar' ? 'Apagando…' : 'Apagar meus dados do Pro'}
            </button>
          </>
        )}
      </div>

      {ocupado && <p className="sr-only" role="status">{EM_ANDAMENTO[ocupado]}</p>}
    </section>
  );
};

export default ProMinhaConta;

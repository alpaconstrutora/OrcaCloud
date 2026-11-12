import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, Lock } from 'lucide-react';
import { ImovibStudy } from '../types';
import { imovibService } from '../services/imovibService';
import { useImovibEdicao } from '../hooks/useImovibEdicao';
import { useToast } from '../hooks/useToast';
import { Sheet, SheetHeader, SheetTitle, SheetDescription, SheetPanel, SheetFooter } from './ui/sheet';

interface Props {
    open: boolean;
    study: ImovibStudy;
    onClose: () => void;
    onCongelada: () => void;
}

const CAMPO = 'w-full h-9 px-3 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500';
const hojeBR = () => new Date().toLocaleDateString('pt-BR');

/**
 * Congelar versão (item 10.2 do plano 2026-11-11, decisão D5): grava o estudo
 * como está salvo e os indicadores do momento. A versão não se edita nem se apaga.
 */
const ImovibCongelarVersao: React.FC<Props> = ({ open, study, onClose, onCongelada }) => {
    const { pode, motivo: motivoRo } = useImovibEdicao();
    const { showToast } = useToast();
    const [nome, setNome] = useState('');
    const [notas, setNotas] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setNome(`Versão de ${hojeBR()}`);
        setNotas('');
        setErro(null);
    }, [open]);

    const motivo = !pode ? motivoRo : !nome.trim() ? 'Dê um nome à versão.' : undefined;
    const congelar = async () => {
        if (motivo) return;
        setSalvando(true);
        setErro(null);
        try {
            await imovibService.congelarVersao(study, nome.trim(), notas.trim() || null);
            showToast(`Versão "${nome.trim()}" congelada.`, 'success');
            onCongelada();
        } catch (e) {
            setErro((e as Error).message);
        } finally {
            setSalvando(false);
        }
    };

    // Fechada, não existe na página (o Sheet manteria o texto no DOM).
    if (!open) return null;
    return (
        <Sheet open={open} onClose={onClose} size="md">
            <SheetHeader onClose={onClose}>
                <SheetTitle>Congelar versão</SheetTitle>
                <SheetDescription>Grava o estudo como está salvo agora — premissas, orçamento, espelho, fontes de capital e cenários — e os indicadores deste momento.</SheetDescription>
            </SheetHeader>
            <SheetPanel className="px-6 py-5 space-y-4">
                <div className="flex items-start gap-2 rounded-[10px] bg-sky-50 border border-sky-200 px-3 py-2 text-sm text-sky-900">
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                    Depois de congelada, a versão não pode ser editada nem apagada. Edição não salva em Premissas fica fora.
                </div>
                {erro && (
                    <div className="flex items-start gap-2 rounded-[10px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {erro}
                    </div>
                )}
                <fieldset disabled={!pode} title={!pode ? motivoRo : undefined} className="imovib-ro min-w-0 border-0 p-0 m-0 space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-versao-nome" className="text-xs font-semibold text-slate-500">Nome da versão</label>
                        <input id="imovib-versao-nome" value={nome} onChange={e => setNome(e.target.value)} className={CAMPO} />
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="imovib-versao-notas" className="text-xs font-semibold text-slate-500">Observações</label>
                        <textarea id="imovib-versao-notas" rows={3} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ex.: apresentada ao comitê; antes da renegociação do terreno"
                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-[6px] text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none" />
                    </div>
                </fieldset>
            </SheetPanel>
            <SheetFooter>
                <button type="button" onClick={onClose} className="h-9 px-3.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-[6px]">Cancelar</button>
                <button type="button" onClick={() => void congelar()} disabled={salvando || !!motivo} title={motivo}
                    className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 text-white rounded-[6px] hover:bg-blue-700 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                    {salvando && <Loader2 className="w-[15px] h-[15px] animate-spin" />}
                    Congelar
                </button>
            </SheetFooter>
        </Sheet>
    );
};

export default ImovibCongelarVersao;

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Pin, ChevronDown } from 'lucide-react';
import type { BrokerChatMessage } from '../../types';

interface BrokerChatProps {
    brokerEmail: string;
    brokerName?: string;
}

const generateDemoMessages = (): BrokerChatMessage[] => {
    const base = new Date();
    return [
        { id: 'm1', channel_id: 'ch-1', sender_name: 'Incorporadora', sender_email: 'admin@incorporadora.com', sender_type: 'INCORPORADORA', message: '📌 Atenção corretores: nova tabela de preços vigente a partir de hoje. Acessem a aba Materiais para download.', is_pinned: true, created_at: new Date(base.getTime() - 5 * 86400000).toISOString() },
        { id: 'm2', channel_id: 'ch-1', sender_name: 'Incorporadora', sender_email: 'admin@incorporadora.com', sender_type: 'INCORPORADORA', message: '📌 Plantão especial neste sábado com bônus de 0,5% para vendas fechadas no local!', is_pinned: true, created_at: new Date(base.getTime() - 3 * 86400000).toISOString() },
        { id: 'm3', channel_id: 'ch-1', sender_name: 'Carlos Andrade', sender_email: 'carlos@corretor.com', sender_type: 'CORRETOR', message: 'Bom dia! A unidade 805 ainda está disponível?', is_pinned: false, created_at: new Date(base.getTime() - 2 * 86400000).toISOString() },
        { id: 'm4', channel_id: 'ch-1', sender_name: 'Incorporadora', sender_email: 'admin@incorporadora.com', sender_type: 'INCORPORADORA', message: 'Sim, Carlos! Está disponível. Já atualizamos o mapa de estoque.', is_pinned: false, created_at: new Date(base.getTime() - 2 * 86400000 + 3600000).toISOString() },
        { id: 'm5', channel_id: 'ch-1', sender_name: 'Maria Santos', sender_email: 'maria@corretor.com', sender_type: 'CORRETOR', message: 'Qual o prazo para aprovação de propostas com desconto acima de 5%?', is_pinned: false, created_at: new Date(base.getTime() - 1 * 86400000).toISOString() },
        { id: 'm6', channel_id: 'ch-1', sender_name: 'Incorporadora', sender_email: 'admin@incorporadora.com', sender_type: 'INCORPORADORA', message: 'Descontos acima de 5% passam por aprovação da diretoria. Prazo médio de 48h úteis.', is_pinned: false, created_at: new Date(base.getTime() - 1 * 86400000 + 7200000).toISOString() },
        { id: 'm7', channel_id: 'ch-1', sender_name: 'João Lima', sender_email: 'joao@corretor.com', sender_type: 'CORRETOR', message: 'Pessoal, alguém sabe se vai ter plantão no feriado?', is_pinned: false, created_at: new Date(base.getTime() - 3600000).toISOString() },
    ];
};

const BrokerChat: React.FC<BrokerChatProps> = ({ brokerEmail, brokerName }) => {
    const [messages, setMessages] = useState<BrokerChatMessage[]>(generateDemoMessages);
    const [newMessage, setNewMessage] = useState('');
    const [showPinned, setShowPinned] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const pinnedMessages = messages.filter(m => m.is_pinned);
    const chatMessages = messages.filter(m => !m.is_pinned);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (!newMessage.trim()) return;
        const msg: BrokerChatMessage = {
            id: `m-${Date.now()}`,
            channel_id: 'ch-1',
            sender_name: brokerName || brokerEmail.split('@')[0],
            sender_email: brokerEmail,
            sender_type: 'CORRETOR',
            message: newMessage.trim(),
            is_pinned: false,
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, msg]);
        setNewMessage('');
    };

    const formatTime = (d: string) => {
        const date = new Date(d);
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        if (isToday) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ height: '600px' }}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                            <MessageSquare className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-gray-900">Canal Residencial Parque Verde</h3>
                            <p className="text-[10px] text-gray-400 font-medium">{messages.length} mensagens • Incorporadora + Corretores</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Pinned Messages */}
            {pinnedMessages.length > 0 && showPinned && (
                <div className="border-b border-amber-100 bg-amber-50/50">
                    <button onClick={() => setShowPinned(!showPinned)} className="w-full px-4 py-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[10px] font-black text-amber-600 uppercase tracking-wider">
                            <Pin className="w-3 h-3" /> Fixadas ({pinnedMessages.length})
                        </span>
                        <ChevronDown className={`w-3 h-3 text-amber-400 transition-transform ${showPinned ? 'rotate-180' : ''}`} />
                    </button>
                    <div className="px-4 pb-3 space-y-2">
                        {pinnedMessages.map(msg => (
                            <div key={msg.id} className="bg-white rounded-xl p-3 border border-amber-100">
                                <p className="text-xs text-gray-700">{msg.message}</p>
                                <p className="text-[10px] text-gray-400 mt-1">{formatTime(msg.created_at)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/30">
                {chatMessages.map(msg => {
                    const isMe = msg.sender_email === brokerEmail;
                    const isIncorporadora = msg.sender_type === 'INCORPORADORA';

                    return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] ${isMe ? 'order-1' : 'order-2'}`}>
                                {!isMe && (
                                    <p className={`text-[10px] font-bold mb-1 ml-1 ${isIncorporadora ? 'text-indigo-500' : 'text-gray-400'}`}>
                                        {msg.sender_name} {isIncorporadora && '(Incorporadora)'}
                                    </p>
                                )}
                                <div className={`px-4 py-2.5 rounded-2xl text-sm ${isMe
                                    ? 'bg-indigo-600 text-white rounded-br-md'
                                    : isIncorporadora
                                        ? 'bg-indigo-100 text-indigo-900 rounded-bl-md'
                                        : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'
                                    }`}>
                                    <p>{msg.message}</p>
                                </div>
                                <p className={`text-[9px] mt-1 ${isMe ? 'text-right mr-1' : 'ml-1'} text-gray-400`}>
                                    {formatTime(msg.created_at)}
                                </p>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-gray-100 bg-white">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                        placeholder="Digite sua mensagem..."
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                    <button onClick={handleSend} disabled={!newMessage.trim()}
                        className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20 active:scale-95">
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BrokerChat;

import React from 'react';
import { Send, User, Bot, AlertCircle } from 'lucide-react';
import { chatService, OrderChatMessage, OrderChatRole } from '../services/chatService';
import { supplierPortalTokenService } from '../services/supplierPortalTokenService';

interface OrderChatProps {
    orderId: string;
    /**
     * Quem está escrevendo, quando há sessão. No link público não existe — a
     * identidade do remetente sai do próprio token, dentro da RPC.
     */
    currentUser?: { email: string; name: string } | null;
    /** De que lado da conversa este usuário está. */
    perfil: 'comprador' | 'fornecedor';
    /** Presente = acesso por link público: lê e escreve por RPC de token. */
    portalToken?: string;
    accent?: 'indigo' | 'portal';
}

// §24 — cada variante escrita por extenso; o JIT do Tailwind não enxerga classe
// montada em runtime.
const ACCENTS = {
    indigo: {
        icon: 'text-indigo-500',
        mine: 'bg-indigo-600 text-white',
        mineAvatar: 'bg-indigo-100 text-indigo-600',
        ring: 'focus:ring-indigo-500',
        send: 'bg-indigo-600 hover:bg-indigo-700',
    },
    portal: {
        icon: 'text-[#E1553C]',
        mine: 'bg-[#E1553C] text-white',
        mineAvatar: 'bg-[#FDEDE8] text-[#C24428]',
        ring: 'focus:ring-[#E1553C]',
        send: 'bg-[#E1553C] hover:bg-[#C8452E]',
    },
} as const;

const OrderChat: React.FC<OrderChatProps> = ({ orderId, currentUser, perfil, portalToken, accent = 'indigo' }) => {
    const A = ACCENTS[accent];
    const meuPapel: OrderChatRole = perfil === 'fornecedor' ? 'supplier' : 'buyer';

    const [messages, setMessages] = React.useState<OrderChatMessage[]>([]);
    const [newMessage, setNewMessage] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState<string | null>(null);
    const [enviando, setEnviando] = React.useState(false);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        let cancelado = false;

        (async () => {
            try {
                const data = portalToken
                    ? await supplierPortalTokenService.getOrderMessages(portalToken, orderId)
                    : await chatService.listMessages(orderId);
                if (!cancelado) setMessages(data);
            } catch (error) {
                console.error('Error loading messages:', error);
                if (!cancelado) setErro('Não foi possível carregar as mensagens.');
            } finally {
                if (!cancelado) setLoading(false);
            }
        })();

        // Realtime só com sessão: a assinatura de `postgres_changes` respeita a
        // RLS da tabela, e a sessão anon do link público não enxerga linha
        // nenhuma por ali — a RPC é que valida o token. Nesse modo, a lista
        // atualiza ao enviar.
        if (portalToken) return () => { cancelado = true; };

        const subscription = chatService.subscribeToOrder(orderId, (msg) => {
            setMessages(prev => {
                // O Supabase também dispara para o próprio cliente que inseriu.
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
        });

        return () => {
            cancelado = true;
            subscription.unsubscribe();
        };
    }, [orderId, portalToken]);

    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        const messageText = newMessage.trim();
        if (!messageText || enviando) return;

        setNewMessage('');
        setErro(null);
        setEnviando(true);

        try {
            const sentMsg = portalToken
                ? await supplierPortalTokenService.sendOrderMessage(portalToken, orderId, messageText)
                : await chatService.sendMessage(
                    orderId,
                    currentUser?.email ?? '',
                    currentUser?.name ?? 'Usuário',
                    messageText,
                    meuPapel,
                );
            setMessages(prev => (prev.some(m => m.id === sentMsg.id) ? prev : [...prev, sentMsg]));
        } catch (error) {
            console.error('Error sending message:', error);
            setErro(error instanceof Error ? error.message : 'Erro ao enviar mensagem.');
            // Devolve o texto para o campo — reescrever do zero é o pior desfecho
            // possível de uma falha de rede.
            setNewMessage(messageText);
        } finally {
            setEnviando(false);
        }
    };

    // §11
    if (loading) {
        return (
            <div className="bg-white rounded-[10px] border border-gray-100 shadow-sm text-center py-12">
                <div className={`animate-spin rounded-full h-8 w-8 border-b-2 mx-auto ${accent === 'portal' ? 'border-[#E1553C]' : 'border-indigo-600'}`}></div>
                <p className="mt-2 text-sm text-gray-500">Carregando conversa...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[500px] bg-white rounded-[10px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Send className={`w-4 h-4 ${A.icon}`} />
                    Conversa do pedido
                </h3>
                <span className="text-sm font-normal text-gray-500">
                    {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}
                </span>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                {/* §12 */}
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <Send className="w-12 h-12 text-gray-300 mb-4" />
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma mensagem ainda</h3>
                        <p className="text-sm text-gray-500">
                            {perfil === 'fornecedor'
                                ? 'Escreva abaixo para falar com o comprador sobre este pedido.'
                                : 'Escreva abaixo para falar com o fornecedor sobre este pedido.'}
                        </p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        // O lado da bolha sai do PAPEL, não da comparação de e-mail:
                        // o fornecedor por link público pode nem ter e-mail
                        // cadastrado, e aí toda mensagem dele apareceria como sendo
                        // do outro lado.
                        const isMe = msg.senderRole === meuPapel;

                        if (msg.isSystem || msg.senderRole === 'system') {
                            return (
                                <div key={msg.id} className="flex justify-center">
                                    <div className="bg-amber-50 text-amber-700 px-4 py-1.5 rounded-[6px] text-sm font-normal border border-amber-100 flex items-center gap-2">
                                        <Bot className="w-3.5 h-3.5" />
                                        {msg.message}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className="max-w-[80%] space-y-1">
                                    <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                        <div className={`p-1.5 rounded-[6px] ${isMe ? A.mineAvatar : 'bg-gray-100 text-gray-500'}`}>
                                            <User className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="text-sm font-medium text-gray-900">{msg.senderName}</span>
                                        <span className="text-xs text-gray-400">
                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className={`p-3.5 rounded-[10px] text-sm font-normal leading-relaxed ${isMe
                                        ? `${A.mine} rounded-tr-none`
                                        : 'bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-none'
                                        }`}>
                                        {msg.message}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {erro && (
                <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex items-center gap-2 text-sm font-normal text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {erro}
                </div>
            )}

            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-100 bg-gray-50/30">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Digite sua mensagem..."
                        className={`flex-1 h-9 bg-white border border-gray-200 rounded-[6px] px-3 text-sm font-normal text-gray-900 outline-none focus:ring-2 transition-all ${A.ring}`}
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || enviando}
                        className={`h-9 w-9 flex items-center justify-center text-white rounded-[6px] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${A.send}`}
                        title="Enviar mensagem"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default OrderChat;

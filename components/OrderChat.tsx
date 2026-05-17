import React from 'react';
import { Send, User, Bot, Clock } from 'lucide-react';
import { chatService, OrderChatMessage } from '../services/chatService';

interface OrderChatProps {
    orderId: string;
    currentUser: {
        email: string;
        name: string;
    };
}

const OrderChat: React.FC<OrderChatProps> = ({ orderId, currentUser }) => {
    const [messages, setMessages] = React.useState<OrderChatMessage[]>([]);
    const [newMessage, setNewMessage] = React.useState('');
    const [loading, setLoading] = React.useState(true);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const loadMessages = async () => {
            try {
                const data = await chatService.listMessages(orderId);
                setMessages(data);
            } catch (error) {
                console.error("Error loading messages:", error);
            } finally {
                setLoading(false);
            }
        };

        loadMessages();

        // Subscribe to real-time updates
        const subscription = chatService.subscribeToOrder(orderId, (msg) => {
            setMessages(prev => {
                // Prevent duplicate messages (Supabase sometimes triggers on current client insert too)
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, msg];
            });
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [orderId]);

    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const messageText = newMessage.trim();
        setNewMessage('');

        try {
            const sentMsg = await chatService.sendMessage(orderId, currentUser.email, currentUser.name, messageText);
            setMessages(prev => {
                if (prev.some(m => m.id === sentMsg.id)) return prev;
                return [...prev, sentMsg];
            });
        } catch (error) {
            console.error("Error sending message:", error);
            alert("Erro ao enviar mensagem.");
            // If it fails, put the text back
            setNewMessage(messageText);
        }
    };

    if (loading) {
        return <div className="p-4 text-center text-gray-400 text-xs font-bold uppercase tracking-widest animate-pulse">Carregando Chat...</div>;
    }

    return (
        <div className="flex flex-col h-[500px] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                    <Send className="w-3 h-3 text-indigo-500" />
                    Chat do Pedido
                </h3>
                <span className="text-[10px] font-bold text-gray-400">{messages.length} mensagens</span>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
            >
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-40">
                        <Send className="w-8 h-8 text-gray-300" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Inicie uma conversa sobre este pedido</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.senderEmail === currentUser.email;

                        if (msg.isSystem) {
                            return (
                                <div key={msg.id} className="flex justify-center">
                                    <div className="bg-amber-50 text-amber-700 px-4 py-1.5 rounded-full text-[10px] font-bold border border-amber-100/50 flex items-center gap-2">
                                        <Bot className="w-3 h-3" />
                                        {msg.message}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] space-y-1 ${isMe ? 'items-end' : 'items-start'}`}>
                                    <div className={`flex items-center gap-2 mb-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                        <div className={`p-1.5 rounded-xl ${isMe ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500 shadow-sm'}`}>
                                            <User className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="text-[10px] font-black text-gray-900 uppercase tracking-tight">{msg.senderName}</span>
                                        <span className="text-[8px] font-bold text-gray-300">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className={`p-4 rounded-3xl text-sm font-medium leading-relaxed shadow-sm ${isMe
                                        ? 'bg-indigo-600 text-white rounded-tr-none'
                                        : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                                        }`}>
                                        {msg.message}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-50 bg-gray-50/30">
                <div className="relative">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Digite sua mensagem..."
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pr-12 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </form>
        </div>
    );
};

export default OrderChat;

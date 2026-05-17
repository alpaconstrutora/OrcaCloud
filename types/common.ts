export interface Notification {
    id: string;
    recipientEmail: string;
    title: string;
    message: string;
    link?: string;
    type?: string;
    isRead: boolean;
    createdAt: string;
}

export interface OrderChatMessage {
    id: string;
    orderId: string;
    senderEmail: string;
    senderName: string;
    message: string;
    isSystem: boolean;
    createdAt: string;
}

import JSONModel from "sap/ui/model/json/JSONModel";

export interface PresenceData {
    online: Record<string, boolean>;
    typing: Record<string, string[]>;
}

const TYPING_EXPIRY_MS = 5_000;

/** Estado efêmero vindo do WebSocket: quem está online e quem está digitando em cada conversa. */
export default class PresenceModel extends JSONModel {

    private selfId = "";

    private readonly typingTimers = new Map<string, number>();

    private readonly changeListeners = new Set<() => void>();

    public constructor() {
        super({ online: {}, typing: {} } satisfies PresenceData);
        this.setDefaultBindingMode("OneWay");
    }

    public setSelf(userId: string): void {
        this.selfId = userId;
    }

    public onPresenceChange(listener: () => void): () => void {
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }

    public isOnline(userId: string): boolean {
        return !!this.getOnline()[userId];
    }

    public getTypingUserIds(conversationId: string): string[] {
        const typing = this.getProperty("/typing") as Record<string, string[]> | undefined;

        return typing?.[conversationId] ?? [];
    }

    public setSnapshot(onlineUserIds: string[]): void {
        this.setProperty("/online", Object.fromEntries(onlineUserIds.map((id) => [id, true])));
        this.emitChange();
    }

    public setUserOnline(userId: string, isOnline: boolean): void {
        const online = { ...this.getOnline() };

        if (isOnline) {
            online[userId] = true;
        } else {
            delete online[userId];
        }

        this.setProperty("/online", online);
        this.emitChange();
    }

    public markTyping(conversationId: string, userId: string): void {
        if (userId === this.selfId) {
            return;
        }

        const key = `${conversationId}:${userId}`;
        const current = this.getTypingUserIds(conversationId);

        window.clearTimeout(this.typingTimers.get(key));
        this.typingTimers.set(key, window.setTimeout(() => this.clearTyping(conversationId, userId), TYPING_EXPIRY_MS));

        if (!current.includes(userId)) {
            this.setTyping(conversationId, [...current, userId]);
        }
    }

    public clearTyping(conversationId: string, userId: string): void {
        window.clearTimeout(this.typingTimers.get(`${conversationId}:${userId}`));
        this.typingTimers.delete(`${conversationId}:${userId}`);
        this.setTyping(conversationId, this.getTypingUserIds(conversationId).filter((id) => id !== userId));
    }

    public override destroy(): void {
        this.typingTimers.forEach((timer) => window.clearTimeout(timer));
        this.typingTimers.clear();
        super.destroy();
    }

    private getOnline(): Record<string, boolean> {
        return (this.getProperty("/online") as Record<string, boolean> | undefined) ?? {};
    }

    private setTyping(conversationId: string, userIds: string[]): void {
        const typing = { ...(this.getProperty("/typing") as Record<string, string[]> ?? {}) };

        if (userIds.length) {
            typing[conversationId] = userIds;
        } else {
            delete typing[conversationId];
        }

        this.setProperty("/typing", typing);
        this.emitChange();
    }

    private emitChange(): void {
        this.changeListeners.forEach((listener) => listener());
    }

}

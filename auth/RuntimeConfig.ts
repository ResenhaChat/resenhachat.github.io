import Environment from "../util/Environment";

export interface RuntimeConfig {
    chatService: string;
    authBase: string;
    wsUrl: string;
}

const LOCAL_CONFIG: RuntimeConfig = {
    chatService: "/service/Chat/",
    authBase: "/auth",
    wsUrl: "ws://localhost:4004/ws"
};

let runtimeConfig: RuntimeConfig = { ...LOCAL_CONFIG };

function deriveWsUrl(chatService: string): string {
    const url = new URL(chatService, window.location.href);

    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws";
    url.search = "";
    url.hash = "";

    return url.toString();
}

function normalize(payload: Partial<RuntimeConfig>): RuntimeConfig {
    const chatService = payload.chatService || LOCAL_CONFIG.chatService;

    return {
        chatService,
        authBase: (payload.authBase || LOCAL_CONFIG.authBase).replace(/\/+$/, ""),
        wsUrl: payload.wsUrl || deriveWsUrl(chatService)
    };
}

export function getRuntimeConfig(): RuntimeConfig {
    return runtimeConfig;
}

/**
 * Carrega config/runtime-config.json. Em localhost usa sempre o proxy local do ui5-local.yaml
 * (e o WebSocket direto no CAP); no GitHub Pages vale o que estiver no arquivo publicado.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
    if (Environment.isLocal()) {
        runtimeConfig = { ...LOCAL_CONFIG };
        return runtimeConfig;
    }

    try {
        const response = await fetch(sap.ui.require.toUrl("apps/dflc/resenha/config/runtime-config.json"));
        runtimeConfig = normalize(response.ok ? await response.json() as Partial<RuntimeConfig> : {});
    } catch {
        runtimeConfig = { ...LOCAL_CONFIG };
    }

    return runtimeConfig;
}

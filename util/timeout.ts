/** Rejeita se a promise não resolver em `ms`; a espera pendente é limpa em qualquer desfecho. */
export function withTimeout<Result>(pending: Promise<Result>, ms: number): Promise<Result> {
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("timeout")), ms);
    });

    return Promise.race([pending, timeout]).finally(() => window.clearTimeout(timer));
}

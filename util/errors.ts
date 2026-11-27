interface ErrorLike {
    status?: number;
    message?: string;
    name?: string;
}

export function isUnauthorized(error: unknown): boolean {
    return (error as ErrorLike | null)?.status === 401;
}

export function isNotFound(error: unknown): boolean {
    return (error as ErrorLike | null)?.status === 404;
}

/** Cancelamento de envio (AbortController): não é erro para o usuário. */
export function isAbortError(error: unknown): boolean {
    return (error as ErrorLike | null)?.name === "AbortError";
}

export function errorDetail(error: unknown): string {
    return (error as ErrorLike | null)?.message ?? "";
}

interface ErrorLike {
    status?: number;
    message?: string;
}

export function isUnauthorized(error: unknown): boolean {
    return (error as ErrorLike | null)?.status === 401;
}

export function isNotFound(error: unknown): boolean {
    return (error as ErrorLike | null)?.status === 404;
}

export function errorDetail(error: unknown): string {
    return (error as ErrorLike | null)?.message ?? "";
}

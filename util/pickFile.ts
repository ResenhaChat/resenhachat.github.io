const FOCUS_GRACE_MS = 1500;

/**
 * Abre o seletor nativo de arquivos (chamar dentro de um gesto do usuário). Resolve null se cancelado.
 * O input fica no body só durante a escolha; o foco de volta à janela cobre o cancelamento no Safari.
 */
export function pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
        // eslint-disable-next-line fiori-custom/sap-no-element-creation -- input nativo de arquivo, não há controle UI5 equivalente
        const input = document.createElement("input");
        let focusTimer = 0;
        let onFocus: () => void = () => undefined;

        const finish = (file: File | null): void => {
            window.removeEventListener("focus", onFocus);
            window.clearTimeout(focusTimer);
            input.remove();
            resolve(file);
        };

        onFocus = () => {
            focusTimer = window.setTimeout(() => finish(null), FOCUS_GRACE_MS);
        };

        input.type = "file";
        input.accept = accept;
        input.style.display = "none";
        input.addEventListener("change", () => finish(input.files?.[0] ?? null));
        input.addEventListener("cancel", () => finish(null));
        document.body.appendChild(input);
        window.addEventListener("focus", onFocus);
        input.click();
    });
}

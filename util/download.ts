/** Baixa pela própria URL (Content com download=1 força attachment). rel noopener para links externos. */
export function downloadFile(url: string, fileName: string): void {
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    link.click();
}

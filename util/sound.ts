/**
 * Som de nova resenha, gerado na hora com a Web Audio API (sem arquivo de áudio).
 * O contexto é criado uma vez e retomado se estiver suspenso.
 */

type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
    const Constructor = (window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext);

    if (!Constructor) {
        return null;
    }

    context ??= new Constructor();

    return context;
}

/** Duas notas curtas e suaves (lá e mi agudo). */
export function playMessageChime(): void {
    const audio = audioContext();

    if (!audio) {
        return;
    }

    void audio.resume();

    const start = audio.currentTime + 0.02;

    [[880, 0], [1318.5, 0.14]].forEach(([frequency, offset]) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.28);

        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.3);
    });
}

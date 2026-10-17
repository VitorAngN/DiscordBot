namespace Transmissor.Audio;

/// <summary>
/// O Windows não entrega nada enquanto o programa capturado está calado. Para o
/// áudio da transmissão não "pular" no tempo, calcula quanto silêncio falta para
/// acompanhar o relógio. Os tempos são contados a partir do início da captura.
/// </summary>
public sealed class PreenchedorDeSilencio(int quadrosPorSegundo, TimeSpan tolerancia)
{
    long quadrosEntregues;
    TimeSpan ultimoDado;

    /// <summary>Registra áudio real que acabou de chegar.</summary>
    public void RegistrarDados(long quadros, TimeSpan agora)
    {
        quadrosEntregues += quadros;
        ultimoDado = agora;
    }

    /// <summary>
    /// Quadros de silêncio que precisam ser entregues agora; já conta como entregues.
    /// Enquanto o áudio real estiver chegando (dentro da tolerância), devolve 0.
    /// </summary>
    public long ProximoSilencio(TimeSpan agora)
    {
        if (agora - ultimoDado < tolerancia) return 0;
        var esperado = agora.Ticks * quadrosPorSegundo / TimeSpan.TicksPerSecond;
        var faltando = Math.Max(0, esperado - quadrosEntregues);
        quadrosEntregues += faltando;
        return faltando;
    }
}

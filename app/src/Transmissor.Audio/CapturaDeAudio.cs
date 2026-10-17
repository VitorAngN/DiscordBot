using System.Diagnostics;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Transmissor.Audio;

public enum ModoDeCaptura
{
    /// <summary>Só o som do processo e dos filhos dele (ex.: só o jogo).</summary>
    SoDoProcesso,

    /// <summary>Todo o som do PC, menos o do processo e dos filhos dele (ex.: tudo menos o Discord).</summary>
    TudoMenosOProcesso,
}

/// <summary>Bloco de áudio capturado. Só vale durante a chamada: copie se for guardar.</summary>
public delegate void DadosDeAudio(ReadOnlySpan<byte> pcm);

/// <summary>
/// Captura o som de um programa em PCM 16 bits, 48 kHz, estéreo (o formato do Opus e do WebRTC).
/// Enquanto o programa está calado, entrega silêncio, para o áudio acompanhar o relógio.
/// </summary>
public sealed class CapturaDeAudio : IAsyncDisposable
{
    public static WaveFormat Formato { get; } = new(48_000, 16, 2);

    static readonly TimeSpan ToleranciaDeSilencio = TimeSpan.FromMilliseconds(60);
    static readonly TimeSpan IntervaloDeSilencio = TimeSpan.FromMilliseconds(10);

    readonly WasapiRecorder gravador;
    readonly PreenchedorDeSilencio preenchedor = new(Formato.SampleRate, ToleranciaDeSilencio);
    readonly Stopwatch relogio = new();
    readonly Lock trava = new();
    readonly CancellationTokenSource cancelamento = new();
    byte[] silencio = [];
    Task? tarefaDeSilencio;
    bool encerrada;

    /// <summary>Áudio capturado, sempre em ordem. Chamado fora da thread de quem iniciou.</summary>
    public event DadosDeAudio? Dados;

    /// <summary>A captura parou sozinha (ex.: dispositivo de som removido).</summary>
    public event Action<Exception?>? Parou;

    CapturaDeAudio(WasapiRecorder gravador)
    {
        this.gravador = gravador;
        gravador.DataAvailable += AoReceber;
        gravador.RecordingStopped += (_, e) =>
        {
            if (!encerrada) Parou?.Invoke(e.Exception);
        };
    }

    /// <summary>Prepara a captura do som de <paramref name="processId"/> no modo indicado.</summary>
    public static async Task<CapturaDeAudio> CriarAsync(uint processId, ModoDeCaptura modo)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 19041))
        {
            throw new PlatformNotSupportedException("A captura do som de um programa precisa do Windows 10 versão 2004 ou mais novo.");
        }

        var modoWasapi = modo == ModoDeCaptura.SoDoProcesso
            ? ProcessLoopbackMode.IncludeTargetProcessTree
            : ProcessLoopbackMode.ExcludeTargetProcessTree;

        var gravador = await new WasapiRecorderBuilder()
            .WithProcessLoopback(processId, modoWasapi)
            .WithFormat(Formato)
            .WithBufferLength(20)
            .BuildAsync()
            .ConfigureAwait(false);
        return new CapturaDeAudio(gravador);
    }

    public void Iniciar()
    {
        relogio.Start();
        gravador.StartRecording();
        // Fora da thread de quem chamou (num app com janela, seria a da interface)
        tarefaDeSilencio = Task.Run(() => PreencherSilencioAsync(cancelamento.Token));
    }

    /// <summary>Para a captura. Depois disso, nenhum <see cref="Dados"/> é disparado.</summary>
    public async Task PararAsync()
    {
        // Pegar a trava espera um bloco que esteja sendo entregue terminar
        lock (trava)
        {
            if (encerrada) return;
            encerrada = true;
        }
        await cancelamento.CancelAsync().ConfigureAwait(false);
        if (tarefaDeSilencio is not null) await tarefaDeSilencio.ConfigureAwait(false);
        await gravador.DisposeAsync().ConfigureAwait(false);
        cancelamento.Dispose();
    }

    public async ValueTask DisposeAsync() => await PararAsync().ConfigureAwait(false);

    void AoReceber(ReadOnlySpan<byte> buffer, AudioClientBufferFlags flags, long posicao, long qpc)
    {
        lock (trava)
        {
            if (encerrada) return;
            preenchedor.RegistrarDados(buffer.Length / Formato.BlockAlign, relogio.Elapsed);
            Dados?.Invoke(buffer);
        }
    }

    async Task PreencherSilencioAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(IntervaloDeSilencio);
        try
        {
            while (await timer.WaitForNextTickAsync(ct).ConfigureAwait(false))
            {
                lock (trava)
                {
                    var quadros = preenchedor.ProximoSilencio(relogio.Elapsed);
                    if (quadros == 0 || encerrada) continue;
                    var bytes = (int)quadros * Formato.BlockAlign;
                    if (silencio.Length < bytes) silencio = new byte[bytes];
                    Dados?.Invoke(silencio.AsSpan(0, bytes));
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Captura encerrada
        }
    }
}

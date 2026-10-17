using System.Diagnostics;
using NAudio.Wave;
using Transmissor.Audio;

namespace Transmissor.Audio.Tests;

/// <summary>
/// Testes com som de verdade: precisam de uma saída de áudio no Windows, então não
/// rodam no CI (filtro <c>Categoria!=Integracao</c>).
/// </summary>
[Trait("Categoria", "Integracao")]
public class CapturaDeAudioTests
{
    const int FrequenciaDoTom = 997;

    [Fact]
    public async Task CapturaOSomDoProgramaEExcluiNoOutroModo()
    {
        var wav = Path.Combine(Path.GetTempPath(), $"tom-{Guid.NewGuid():N}.wav");
        GerarTom(wav, TimeSpan.FromSeconds(3));
        // Um processo separado toca o tom, como faria um jogo
        using var tocador = Process.Start(new ProcessStartInfo(
            "powershell.exe",
            $"-NoProfile -Command \"(New-Object Media.SoundPlayer '{wav}').PlaySync()\"")
        {
            CreateNoWindow = true,
            UseShellExecute = false,
        })!;
        try
        {
            var so = new MemoryStream();
            var menos = new MemoryStream();
            await using var capturaSo = await CapturaDeAudio.CriarAsync((uint)tocador.Id, ModoDeCaptura.SoDoProcesso);
            await using var capturaMenos = await CapturaDeAudio.CriarAsync((uint)tocador.Id, ModoDeCaptura.TudoMenosOProcesso);
            capturaSo.Dados += pcm => so.Write(pcm);
            capturaMenos.Dados += pcm => menos.Write(pcm);

            capturaSo.Iniciar();
            capturaMenos.Iniciar();
            await Task.Delay(TimeSpan.FromSeconds(3.5));
            await capturaSo.PararAsync();
            await capturaMenos.PararAsync();

            var energiaSo = EnergiaNaFrequencia(so.ToArray(), FrequenciaDoTom);
            var energiaMenos = EnergiaNaFrequencia(menos.ToArray(), FrequenciaDoTom);
            Assert.True(energiaSo > 1e-4, $"o tom não foi capturado (energia {energiaSo:E2})");
            Assert.True(energiaSo > 50 * energiaMenos, $"o tom vazou no modo excluir ({energiaSo:E2} x {energiaMenos:E2})");

            // O silêncio preenchido mantém a duração perto do tempo real
            var segundos = so.Length / (double)CapturaDeAudio.Formato.AverageBytesPerSecond;
            Assert.InRange(segundos, 3.2, 3.8);
        }
        finally
        {
            if (!tocador.HasExited) tocador.Kill();
            File.Delete(wav);
        }
    }

    static void GerarTom(string caminho, TimeSpan duracao)
    {
        var formato = CapturaDeAudio.Formato;
        using var escritor = new WaveFileWriter(caminho, formato);
        var quadros = (int)(duracao.TotalSeconds * formato.SampleRate);
        var amostra = new byte[formato.BlockAlign];
        for (var i = 0; i < quadros; i++)
        {
            var valor = (short)(0.5 * short.MaxValue * Math.Sin(2 * Math.PI * FrequenciaDoTom * i / formato.SampleRate));
            BitConverter.TryWriteBytes(amostra.AsSpan(0, 2), valor);
            BitConverter.TryWriteBytes(amostra.AsSpan(2, 2), valor);
            escritor.Write(amostra);
        }
    }

    /// <summary>Potência normalizada do canal esquerdo numa frequência (algoritmo de Goertzel).</summary>
    static double EnergiaNaFrequencia(byte[] pcm, int frequencia)
    {
        var formato = CapturaDeAudio.Formato;
        var n = pcm.Length / formato.BlockAlign;
        if (n == 0) return 0;
        var coeficiente = 2 * Math.Cos(2 * Math.PI * frequencia / formato.SampleRate);
        double anterior = 0, anterior2 = 0;
        for (var i = 0; i < n; i++)
        {
            var x = BitConverter.ToInt16(pcm, i * formato.BlockAlign) / (double)short.MaxValue;
            var atual = x + coeficiente * anterior - anterior2;
            anterior2 = anterior;
            anterior = atual;
        }
        var potencia = anterior * anterior + anterior2 * anterior2 - coeficiente * anterior * anterior2;
        return potencia / ((double)n * n);
    }
}

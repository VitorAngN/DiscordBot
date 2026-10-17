using Transmissor.Audio;

namespace Transmissor.Audio.Tests;

public class PreenchedorDeSilencioTests
{
    const int Taxa = 48_000;
    const int QuadrosEm10Ms = Taxa / 100;
    static readonly TimeSpan Tolerancia = TimeSpan.FromMilliseconds(60);

    static TimeSpan Ms(int ms) => TimeSpan.FromMilliseconds(ms);

    [Fact]
    public void NaoPreencheAntesDaTolerancia()
    {
        var preenchedor = new PreenchedorDeSilencio(Taxa, Tolerancia);

        Assert.Equal(0, preenchedor.ProximoSilencio(Ms(59)));
    }

    [Fact]
    public void SemAudioPreencheDesdeOInicioSemRepetir()
    {
        var preenchedor = new PreenchedorDeSilencio(Taxa, Tolerancia);

        Assert.Equal(10 * QuadrosEm10Ms, preenchedor.ProximoSilencio(Ms(100)));
        Assert.Equal(QuadrosEm10Ms, preenchedor.ProximoSilencio(Ms(110)));
        Assert.Equal(0, preenchedor.ProximoSilencio(Ms(110)));
    }

    [Fact]
    public void NaoPreencheEnquantoOAudioChega()
    {
        var preenchedor = new PreenchedorDeSilencio(Taxa, Tolerancia);

        for (var t = 10; t <= 1_000; t += 10)
        {
            preenchedor.RegistrarDados(QuadrosEm10Ms, Ms(t));
            Assert.Equal(0, preenchedor.ProximoSilencio(Ms(t + 5)));
        }
    }

    [Fact]
    public void QuandoOAudioParaCompletaSoODepois()
    {
        var preenchedor = new PreenchedorDeSilencio(Taxa, Tolerancia);
        for (var t = 10; t <= 200; t += 10) preenchedor.RegistrarDados(QuadrosEm10Ms, Ms(t));

        Assert.Equal(0, preenchedor.ProximoSilencio(Ms(250))); // ainda dentro da tolerância
        Assert.Equal(10 * QuadrosEm10Ms, preenchedor.ProximoSilencio(Ms(300))); // 300 ms esperados − 200 ms entregues
    }
}

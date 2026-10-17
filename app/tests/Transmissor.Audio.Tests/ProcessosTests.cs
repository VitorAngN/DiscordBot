using System.Diagnostics;
using Transmissor.Audio;

namespace Transmissor.Audio.Tests;

public class ProcessosTests
{
    static readonly string[] Discord = ["Discord.exe"];

    [Fact]
    public void AchaOProcessoPrincipalEntreOsFilhos()
    {
        InfoDeProcesso[] processos =
        [
            new(1, 0, "Update.exe"),
            new(11, 10, "Discord.exe"),
            new(10, 1, "Discord.exe"),
            new(12, 10, "discord.exe"),
            new(20, 1, "jogo.exe"),
        ];

        Assert.Equal(10u, Processos.ProcessoRaiz(processos, Discord));
    }

    [Fact]
    public void SemDiscordAbertoDevolveNulo()
    {
        InfoDeProcesso[] processos = [new(1, 0, "explorer.exe"), new(20, 1, "jogo.exe")];

        Assert.Null(Processos.ProcessoRaiz(processos, Discord));
    }

    [Fact]
    public void ListaProcessosComOPaiCorreto()
    {
        using var filho = Process.Start(new ProcessStartInfo("ping.exe", "-n 5 127.0.0.1")
        {
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = true,
        })!;
        try
        {
            var info = Processos.ListarProcessos().Single(p => p.Id == (uint)filho.Id);

            Assert.Equal((uint)Environment.ProcessId, info.PaiId);
            Assert.Equal("PING.EXE", info.Nome.ToUpperInvariant());
        }
        finally
        {
            filho.Kill();
        }
    }

    [Theory]
    [InlineData("window:197346:0", 197346)]
    [InlineData("window:42:1", 42)]
    public void LeAJanelaDoRotuloDaCaptura(string rotulo, long esperado)
    {
        Assert.Equal((nint)esperado, Processos.JanelaDoRotulo(rotulo));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("screen:0:0")]
    [InlineData("web-contents-media-stream://12:3")]
    [InlineData("window:abc:0")]
    [InlineData("window:0:0")]
    [InlineData("Minecraft 1.21")]
    public void RotuloSemJanelaDevolveNulo(string? rotulo)
    {
        Assert.Null(Processos.JanelaDoRotulo(rotulo));
    }

    [Fact]
    public void JanelaInexistenteNaoTemProcesso()
    {
        Assert.Null(Processos.ProcessoDaJanela(0));
        Assert.Null(Processos.ProcessoDaJanela(unchecked((nint)0x7FFF_FFF0)));
    }

    [Fact]
    public void AchaOProcessoDonoDeUmaJanelaAberta()
    {
        // Sem janelas (ex.: CI sem área de trabalho) não há o que conferir
        foreach (var janela in Processos.ListarJanelas().Take(5))
        {
            Assert.Equal(janela.ProcessId, Processos.ProcessoDaJanela(janela.Handle));
        }
    }

    [Fact]
    public void ListarJanelasNaoIncluiEsteProcesso()
    {
        var janelas = Processos.ListarJanelas();

        Assert.DoesNotContain(janelas, j => j.ProcessId == (uint)Environment.ProcessId);
        Assert.All(janelas, j => Assert.False(string.IsNullOrEmpty(j.Titulo)));
    }
}

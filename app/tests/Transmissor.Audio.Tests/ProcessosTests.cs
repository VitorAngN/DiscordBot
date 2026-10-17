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

    [Fact]
    public void ListarJanelasNaoIncluiEsteProcesso()
    {
        var janelas = Processos.ListarJanelas();

        Assert.DoesNotContain(janelas, j => j.ProcessId == (uint)Environment.ProcessId);
        Assert.All(janelas, j => Assert.False(string.IsNullOrEmpty(j.Titulo)));
    }
}

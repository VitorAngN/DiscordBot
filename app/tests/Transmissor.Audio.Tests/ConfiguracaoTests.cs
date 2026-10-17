using Transmissor.App;

namespace Transmissor.Audio.Tests;

public class ConfiguracaoTests
{
    [Theory]
    [InlineData("https://discordbot-transmissao.vitor.workers.dev", "https://discordbot-transmissao.vitor.workers.dev")]
    [InlineData("  https://discordbot-transmissao.vitor.workers.dev/transmitir  ", "https://discordbot-transmissao.vitor.workers.dev")]
    [InlineData("discordbot-transmissao.vitor.workers.dev", "https://discordbot-transmissao.vitor.workers.dev")]
    [InlineData("http://localhost:8787/", "http://localhost:8787")]
    public void NormalizaOEnderecoDoServidor(string digitado, string esperado)
    {
        Assert.Equal(esperado, Configuracao.NormalizarServidor(digitado));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("https://")]
    [InlineData("http://discordbot-transmissao.vitor.workers.dev")]
    [InlineData("ftp://exemplo.com")]
    public void RecusaEnderecoInvalidoOuSemHttps(string? digitado)
    {
        Assert.Null(Configuracao.NormalizarServidor(digitado));
    }
}

using Transmissor.App;

namespace Transmissor.Audio.Tests;

public class AtualizacaoTests
{
    [Theory]
    [InlineData("v1.1.0", "1.0.0", "1.1.0")]
    [InlineData("v2.0.0", "1.9.9", "2.0.0")]
    [InlineData("1.0.1", "1.0.0", "1.0.1")]
    public void AvisaQuandoTemVersaoMaisNova(string tag, string atual, string esperada)
    {
        Assert.Equal(Version.Parse(esperada), Atualizacao.MaisNova(tag, Version.Parse(atual)));
    }

    [Theory]
    [InlineData("v1.0.0", "1.0.0")]
    [InlineData("v1.0", "1.0.0.0")]
    [InlineData("v0.4.0", "1.0.0")]
    [InlineData("", "1.0.0")]
    [InlineData(null, "1.0.0")]
    [InlineData("versao-nova", "1.0.0")]
    public void NaoAvisaComVersaoIgualMaisVelhaOuInvalida(string? tag, string atual)
    {
        Assert.Null(Atualizacao.MaisNova(tag, Version.Parse(atual)));
    }
}

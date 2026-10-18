using System.Text;
using Transmissor.App;

namespace Transmissor.Audio.Tests;

public sealed class CofreDaChaveTests : IDisposable
{
    readonly string pasta = Path.Combine(Path.GetTempPath(), $"cofre-{Guid.NewGuid():N}");
    string Arquivo => Path.Combine(pasta, "chave.bin");

    public void Dispose()
    {
        if (Directory.Exists(pasta)) Directory.Delete(pasta, recursive: true);
    }

    [Fact]
    public void GuardaELeAMesmaChave()
    {
        var cofre = new CofreDaChave(Arquivo);
        cofre.Guardar("chave-de-teste-ção");

        Assert.Equal("chave-de-teste-ção", cofre.Ler());
        Assert.Equal("chave-de-teste-ção", new CofreDaChave(Arquivo).Ler());
    }

    [Fact]
    public void ArquivoNaoTemAChaveEmTextoPuro()
    {
        new CofreDaChave(Arquivo).Guardar("chave-de-teste");

        var bytes = File.ReadAllBytes(Arquivo);
        Assert.DoesNotContain("chave-de-teste", Encoding.UTF8.GetString(bytes), StringComparison.Ordinal);
        Assert.DoesNotContain("chave-de-teste", Encoding.Unicode.GetString(bytes), StringComparison.Ordinal);
    }

    [Fact]
    public void SemArquivoOuComArquivoEstragadoDevolveNulo()
    {
        var cofre = new CofreDaChave(Arquivo);
        Assert.Null(cofre.Ler());

        Directory.CreateDirectory(pasta);
        File.WriteAllBytes(Arquivo, [1, 2, 3, 4]);
        Assert.Null(cofre.Ler());
    }

    [Fact]
    public void EsquecerApagaAChave()
    {
        var cofre = new CofreDaChave(Arquivo);
        cofre.Guardar("chave-de-teste");
        cofre.Esquecer();

        Assert.Null(cofre.Ler());
        Assert.False(File.Exists(Arquivo));
        cofre.Esquecer(); // de novo, sem arquivo: não dá erro
    }
}

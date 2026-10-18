using System.Drawing;
using System.Text.Json;
using Transmissor.App;

namespace Transmissor.Audio.Tests;

public class BandejaTests
{
    [Fact]
    public void IconesEstaoEmbutidosNoAppComOTamanhoPequeno()
    {
        foreach (var icone in new[] { Icones.Parado, Icones.AoVivo })
        {
            using var pequeno = new Icon(icone, new Size(16, 16));
            Assert.Equal(16, pequeno.Width);
        }
    }

    [Theory]
    [InlineData(false, 3, "Transmissor: parado")]
    [InlineData(true, 0, "Transmissor: ao vivo, ninguém assistindo ainda")]
    [InlineData(true, 1, "Transmissor: ao vivo, 1 pessoa assistindo")]
    [InlineData(true, 5, "Transmissor: ao vivo, 5 pessoas assistindo")]
    public void DicaDoIconeDizOEstado(bool aoVivo, int espectadores, string esperado)
    {
        var texto = Bandeja.Texto(new EstadoDaTransmissao(aoVivo, espectadores));

        Assert.Equal(esperado, texto);
        Assert.True(texto.Length <= 127); // limite do Windows para a dica do ícone
    }

    [Theory]
    [InlineData("""{"tipo":"estado","aoVivo":true,"espectadores":2}""", true, 2)]
    [InlineData("""{"tipo":"estado","aoVivo":false}""", false, 0)]
    [InlineData("""{"tipo":"estado","aoVivo":"sim","espectadores":"muitos"}""", false, 0)]
    [InlineData("""{"tipo":"estado","aoVivo":true,"espectadores":-4}""", true, 0)]
    [InlineData("""{"tipo":"estado","aoVivo":true,"espectadores":1.5}""", true, 0)]
    public void LeOEstadoQueAPaginaManda(string json, bool aoVivo, int espectadores)
    {
        using var documento = JsonDocument.Parse(json);

        Assert.Equal(new EstadoDaTransmissao(aoVivo, espectadores), JanelaPrincipal.LerEstado(documento.RootElement));
    }
}

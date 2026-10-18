namespace Transmissor.App;

/// <summary>Ícones do app, embutidos no .exe. Para refazer: app/tools/gerar-icones.ps1.</summary>
internal static class Icones
{
    /// <summary>Roxo com "play": o ícone do app e da bandeja quando parado.</summary>
    public static readonly Icon Parado = Carregar("transmissor.ico");

    /// <summary>Vermelho com o ponto de "gravando": a bandeja ao vivo.</summary>
    public static readonly Icon AoVivo = Carregar("ao-vivo.ico");

    static Icon Carregar(string nome)
    {
        using var dados = typeof(Icones).Assembly.GetManifestResourceStream($"Icones.{nome}")
            ?? throw new InvalidOperationException($"O ícone {nome} não está no app.");
        return new Icon(dados);
    }
}

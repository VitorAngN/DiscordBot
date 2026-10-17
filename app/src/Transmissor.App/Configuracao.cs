using System.Text.Json;

namespace Transmissor.App;

/// <summary>Configuração do app, guardada em %AppData%\DiscordBot\transmissor.json.</summary>
internal sealed record Configuracao(string? Servidor)
{
    static readonly string Pasta = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DiscordBot");
    static readonly string Arquivo = Path.Combine(Pasta, "transmissor.json");

    public static Configuracao Carregar()
    {
        try
        {
            var lida = JsonSerializer.Deserialize<Configuracao>(File.ReadAllText(Arquivo));
            return new Configuracao(NormalizarServidor(lida?.Servidor));
        }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException)
        {
            return new Configuracao(Servidor: null);
        }
    }

    public void Salvar()
    {
        Directory.CreateDirectory(Pasta);
        File.WriteAllText(Arquivo, JsonSerializer.Serialize(this));
    }

    /// <summary>
    /// Endereço do servidor só com protocolo e domínio (ex.: <c>https://x.workers.dev</c>),
    /// ou <c>null</c> se não for válido. Aceita HTTP só no próprio PC, para testes.
    /// </summary>
    public static string? NormalizarServidor(string? texto)
    {
        if (string.IsNullOrWhiteSpace(texto)) return null;
        var bruto = texto.Trim();
        if (!bruto.Contains("://", StringComparison.Ordinal)) bruto = "https://" + bruto;
        if (!Uri.TryCreate(bruto, UriKind.Absolute, out var uri)) return null;
        var seguro = uri.Scheme == Uri.UriSchemeHttps || (uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback);
        return seguro ? uri.GetLeftPart(UriPartial.Authority) : null;
    }
}

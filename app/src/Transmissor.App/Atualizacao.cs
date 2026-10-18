using System.Net.Http.Headers;
using System.Text.Json;

namespace Transmissor.App;

/// <summary>
/// Confere no GitHub se saiu um Transmissor mais novo. Só lê a página pública da última Release:
/// não manda nada sobre quem usa e não baixa nada sozinho.
/// </summary>
internal static class Atualizacao
{
    public const string PaginaDeDownload = "https://github.com/VitorAngN/DiscordBot/releases/latest";
    const string UltimaRelease = "https://api.github.com/repos/VitorAngN/DiscordBot/releases/latest";

    /// <summary>A versão deste app (ex.: 1.0.0), sem o sufixo do commit.</summary>
    public static Version Atual { get; } = Version.Parse(Application.ProductVersion.Split('+')[0]);

    /// <summary>A versão mais nova publicada, se for maior que a deste app; senão (ou sem internet), <c>null</c>.</summary>
    public static async Task<Version?> ProcurarAsync(CancellationToken cancelar = default)
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            http.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("Transmissor", Atual.ToString(3)));
            http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
            using var resposta = await http.GetAsync(UltimaRelease, cancelar);
            if (!resposta.IsSuccessStatusCode) return null;
            using var json = await JsonDocument.ParseAsync(await resposta.Content.ReadAsStreamAsync(cancelar), cancellationToken: cancelar);
            var tag = json.RootElement.TryGetProperty("tag_name", out var valor) ? valor.GetString() : null;
            return MaisNova(tag, Atual);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException)
        {
            return null; // sem internet ou GitHub fora: tenta de novo na próxima vez que abrir
        }
    }

    /// <summary>A versão da tag ("v1.2.0"), se for mais nova que <paramref name="atual"/>.</summary>
    internal static Version? MaisNova(string? tag, Version atual)
    {
        if (string.IsNullOrWhiteSpace(tag)) return null;
        var texto = tag.Trim().TrimStart('v', 'V');
        if (!Version.TryParse(texto, out var publicada)) return null;
        return Normalizar(publicada) > Normalizar(atual) ? publicada : null;
    }

    /// <summary>"1.0" e "1.0.0.0" contam como 1.0.0.</summary>
    static Version Normalizar(Version v) => new(v.Major, v.Minor, Math.Max(0, v.Build));
}

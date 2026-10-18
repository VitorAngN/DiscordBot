using System.Security.Cryptography;
using System.Text;

namespace Transmissor.App;

/// <summary>
/// Chave de transmissão guardada neste PC, protegida pelo Windows (DPAPI): o arquivo só abre no seu
/// usuário do Windows. Fica em %AppData%\DiscordBot\chave.bin.
/// </summary>
internal sealed class CofreDaChave(string arquivo)
{
    public static readonly CofreDaChave Padrao = new(Path.Combine(Configuracao.Pasta, "chave.bin"));

    /// <summary>Separa estes dados de outros que o mesmo usuário proteja com DPAPI.</summary>
    static readonly byte[] Entropia = "DiscordBot.Transmissor.chave"u8.ToArray();

    /// <summary>A chave guardada, ou <c>null</c> se não houver ou não der para abrir (outro usuário, arquivo estragado).</summary>
    public string? Ler()
    {
        try
        {
            var protegida = File.ReadAllBytes(arquivo);
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(protegida, Entropia, DataProtectionScope.CurrentUser));
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException)
        {
            return null;
        }
    }

    public void Guardar(string chave)
    {
        var protegida = ProtectedData.Protect(Encoding.UTF8.GetBytes(chave), Entropia, DataProtectionScope.CurrentUser);
        Directory.CreateDirectory(Path.GetDirectoryName(arquivo)!);
        File.WriteAllBytes(arquivo, protegida);
    }

    public void Esquecer()
    {
        try
        {
            File.Delete(arquivo);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Fica para a próxima: a página volta a pedir a chave do mesmo jeito
        }
    }
}

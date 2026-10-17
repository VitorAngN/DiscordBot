namespace Transmissor.App;

/// <summary>Registro em %LocalAppData%\DiscordBot\transmissor.log, para entender problemas depois.</summary>
internal static class Registro
{
    public static readonly string Arquivo =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DiscordBot", "transmissor.log");

    static readonly Lock trava = new();

    public static void Escrever(string mensagem)
    {
        try
        {
            lock (trava)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Arquivo)!);
                File.AppendAllText(Arquivo, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {mensagem}{Environment.NewLine}");
            }
        }
        catch (IOException)
        {
            // Registro é só ajuda: nunca derruba o app
        }
    }
}

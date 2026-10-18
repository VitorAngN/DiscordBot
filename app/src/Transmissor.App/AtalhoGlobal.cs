using System.Runtime.InteropServices;

namespace Transmissor.App;

/// <summary>
/// Atalho de teclado que funciona em qualquer programa, inclusive com o jogo na frente:
/// Ctrl+Shift+F10 encerra a transmissão.
/// </summary>
internal static partial class AtalhoGlobal
{
    public const string Descricao = "Ctrl+Shift+F10";

    /// <summary>Mensagem que o Windows manda para a janela quando o atalho é apertado.</summary>
    public const int WM_HOTKEY = 0x0312;

    const int Id = 1;
    const uint MOD_CONTROL = 0x2;
    const uint MOD_SHIFT = 0x4;
    const uint MOD_NOREPEAT = 0x4000; // segurar as teclas não repete o comando
    const uint VK_F10 = 0x79;

    /// <summary>Registra o atalho para a janela. Devolve <c>false</c> se outro programa já usa a mesma combinação.</summary>
    public static bool Registrar(nint janela) => RegisterHotKey(janela, Id, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, VK_F10);

    public static void Liberar(nint janela) => UnregisterHotKey(janela, Id);

    public static bool EhOAtalho(Message m) => m.Msg == WM_HOTKEY && m.WParam == Id;

    [LibraryImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool RegisterHotKey(nint hWnd, int id, uint fsModifiers, uint vk);

    [LibraryImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool UnregisterHotKey(nint hWnd, int id);
}

using System.ComponentModel;
using System.Runtime.InteropServices;

namespace Transmissor.Audio;

/// <summary>Janela visível de um programa, candidata a ter o som capturado.</summary>
public sealed record JanelaDePrograma(nint Handle, string Titulo, uint ProcessId, string NomeDoProcesso);

/// <summary>Processo em execução, com o processo que o abriu.</summary>
public readonly record struct InfoDeProcesso(uint Id, uint PaiId, string Nome);

public static unsafe class Processos
{
    static readonly string[] ExecutaveisDoDiscord = ["Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe"];
    const int MaxTitulo = 1024;

    /// <summary>Janelas de programas abertos (as que aparecem na barra de tarefas), menos a deste app.</summary>
    public static IReadOnlyList<JanelaDePrograma> ListarJanelas()
    {
        var handles = new List<nint>();
        var alvo = GCHandle.Alloc(handles);
        try
        {
            Nativo.EnumWindows(&ColetarJanela, GCHandle.ToIntPtr(alvo));
        }
        finally
        {
            alvo.Free();
        }

        var nomes = ListarProcessos().ToDictionary(p => p.Id, p => p.Nome);
        var proprio = (uint)Environment.ProcessId;
        return handles
            .Where(EhJanelaDePrograma)
            .Select(h => (Handle: h, Titulo: TituloDe(h), Pid: ProcessoDe(h)))
            .Where(j => j.Titulo.Length > 0 && j.Pid != proprio)
            .Select(j => new JanelaDePrograma(j.Handle, j.Titulo, j.Pid, nomes.GetValueOrDefault(j.Pid, "?")))
            .OrderBy(j => j.NomeDoProcesso, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>Todos os processos em execução.</summary>
    public static IReadOnlyList<InfoDeProcesso> ListarProcessos()
    {
        var snapshot = Nativo.CreateToolhelp32Snapshot(Nativo.TH32CS_SNAPPROCESS, 0);
        if (snapshot == Nativo.INVALID_HANDLE_VALUE) throw new Win32Exception(Marshal.GetLastPInvokeError());
        try
        {
            var processos = new List<InfoDeProcesso>();
            var entrada = new Nativo.PROCESSENTRY32W { dwSize = (uint)sizeof(Nativo.PROCESSENTRY32W) };
            for (var ok = Nativo.Process32First(snapshot, ref entrada); ok; ok = Nativo.Process32Next(snapshot, ref entrada))
            {
                processos.Add(new InfoDeProcesso(entrada.th32ProcessID, entrada.th32ParentProcessID, new string(entrada.szExeFile)));
            }
            return processos;
        }
        finally
        {
            Nativo.CloseHandle(snapshot);
        }
    }

    /// <summary>
    /// Janela indicada pelo rótulo da faixa de vídeo de uma captura de tela do Chromium
    /// (Chrome, Edge, WebView2), que tem o formato <c>window:&lt;HWND&gt;:0</c>.
    /// Devolve <c>null</c> para captura de tela inteira ou rótulo em outro formato.
    /// </summary>
    public static nint? JanelaDoRotulo(string? rotulo)
    {
        if (rotulo is null || !rotulo.StartsWith("window:", StringComparison.Ordinal)) return null;
        var partes = rotulo.Split(':');
        return partes.Length >= 2 && long.TryParse(partes[1], out var handle) && handle > 0 ? (nint)handle : null;
    }

    /// <summary>Processo dono da janela, ou <c>null</c> se ela não existir mais.</summary>
    public static uint? ProcessoDaJanela(nint janela)
    {
        if (janela == 0 || !Nativo.IsWindow(janela)) return null;
        var pid = ProcessoDe(janela);
        return pid == 0 ? null : pid;
    }

    /// <summary>
    /// Processo principal do Discord, ou <c>null</c> se ele não estiver aberto.
    /// Excluir a árvore desse processo tira da captura todo o som da call.
    /// </summary>
    public static uint? ProcessoPrincipalDoDiscord() => ProcessoRaiz(ListarProcessos(), ExecutaveisDoDiscord);

    /// <summary>
    /// O processo e todos os descendentes dele: é o que o Windows inclui ou exclui
    /// na captura por processo ("árvore do processo").
    /// </summary>
    public static HashSet<uint> Arvore(IReadOnlyList<InfoDeProcesso> processos, uint raiz)
    {
        var filhos = processos.Where(p => p.Id != p.PaiId).ToLookup(p => p.PaiId, p => p.Id);
        var arvore = new HashSet<uint> { raiz };
        var pendentes = new Queue<uint>([raiz]);
        while (pendentes.TryDequeue(out var atual))
        {
            foreach (var filho in filhos[atual])
            {
                if (arvore.Add(filho)) pendentes.Enqueue(filho);
            }
        }
        return arvore;
    }

    /// <summary>O processo é um dos executáveis do Discord (app normal, PTB ou Canary).</summary>
    public static bool EhDoDiscord(uint pid) =>
        ListarProcessos().Any(p => p.Id == pid && ExecutaveisDoDiscord.Contains(p.Nome, StringComparer.OrdinalIgnoreCase));

    /// <summary>Primeiro processo com um dos nomes cujo pai não tem um desses nomes.</summary>
    internal static uint? ProcessoRaiz(IReadOnlyList<InfoDeProcesso> processos, IReadOnlyCollection<string> nomes)
    {
        var porId = processos.ToDictionary(p => p.Id);
        bool Corresponde(InfoDeProcesso p) => nomes.Contains(p.Nome, StringComparer.OrdinalIgnoreCase);

        return processos
            .Where(Corresponde)
            .Where(p => !(porId.TryGetValue(p.PaiId, out var pai) && pai.Id != p.Id && Corresponde(pai)))
            .Select(p => (uint?)p.Id)
            .FirstOrDefault();
    }

    [UnmanagedCallersOnly]
    static int ColetarJanela(nint hWnd, nint lParam)
    {
        ((List<nint>)GCHandle.FromIntPtr(lParam).Target!).Add(hWnd);
        return 1; // continua a enumeração
    }

    static bool EhJanelaDePrograma(nint h)
    {
        if (!Nativo.IsWindowVisible(h) || Nativo.GetWindow(h, Nativo.GW_OWNER) != 0) return false;
        if ((Nativo.GetWindowLongPtr(h, Nativo.GWL_EXSTYLE) & Nativo.WS_EX_TOOLWINDOW) != 0) return false;
        // Janelas "camufladas" (apps suspensos, outras áreas de trabalho) não aparecem na tela
        return Nativo.DwmGetWindowAttribute(h, Nativo.DWMWA_CLOAKED, out var camuflada, sizeof(int)) != 0 || camuflada == 0;
    }

    static string TituloDe(nint h)
    {
        var tamanho = Math.Min(Nativo.GetWindowTextLength(h), MaxTitulo);
        if (tamanho == 0) return "";
        var buffer = stackalloc char[tamanho + 1];
        var lidos = Nativo.GetWindowText(h, buffer, tamanho + 1);
        return new string(buffer, 0, lidos);
    }

    static uint ProcessoDe(nint h)
    {
        Nativo.GetWindowThreadProcessId(h, out var pid);
        return pid;
    }
}

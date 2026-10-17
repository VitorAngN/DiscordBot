using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;

namespace Transmissor.Audio;

/// <summary>Programa com som na saída de áudio padrão do Windows.</summary>
/// <param name="FicaDeForaSemDiscord">O modo "tudo menos o Discord" deixa esse som de fora.</param>
public sealed record SessaoDeAudio(uint ProcessId, string Programa, bool Tocando, bool FicaDeForaSemDiscord);

public static class SessoesDeAudio
{
    /// <summary>
    /// Quem tem som aberto na saída padrão agora. Serve para conferir que todo som do Discord
    /// sai de dentro da árvore de processos que o modo "tudo menos o Discord" exclui.
    /// </summary>
    public static IReadOnlyList<SessaoDeAudio> Listar()
    {
        var processos = Processos.ListarProcessos();
        var nomes = processos.ToDictionary(p => p.Id, p => p.Nome);
        var excluidos = Processos.ProcessoPrincipalDoDiscord() is { } raiz ? Processos.Arvore(processos, raiz) : [];

        using var enumerador = new MMDeviceEnumerator();
        using var saida = enumerador.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        var sessoes = saida.AudioSessionManager.Sessions;
        var lista = new List<SessaoDeAudio>();
        for (var i = 0; i < sessoes.Count; i++)
        {
            using var sessao = sessoes[i];
            if (sessao.IsSystemSoundsSession) continue;
            var pid = sessao.GetProcessID;
            var tocando = sessao.State == AudioSessionState.AudioSessionStateActive;
            lista.Add(new SessaoDeAudio(pid, nomes.GetValueOrDefault(pid, "?"), tocando, excluidos.Contains(pid)));
        }
        return lista;
    }
}

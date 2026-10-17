using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Transmissor.Audio;

namespace Transmissor.App;

/// <summary>
/// Atende a página de transmitir: captura o som só do programa da janela escolhida
/// (ou tudo menos o Discord) e manda para ela em blocos de 20 ms.
/// </summary>
internal sealed class PonteDeAudio(Control dono, CoreWebView2 webview)
{
    /// <summary>20 ms de PCM 16 bits, 48 kHz, estéreo.</summary>
    internal const int BytesPorBloco = 48_000 / 50 * 4;

    CapturaDeAudio? captura;
    readonly MemoryStream pendente = new();

    /// <summary>Mensagem vinda da página. Roda na thread da interface.</summary>
    public async Task TratarAsync(JsonElement mensagem)
    {
        var tipo = Texto(mensagem, "tipo");
        if (tipo == "iniciar-audio") await IniciarAsync(Texto(mensagem, "rotulo"), Texto(mensagem, "modo"));
        else if (tipo == "parar-audio") await PararAsync();
    }

    async Task IniciarAsync(string? rotulo, string? modo)
    {
        await PararAsync(); // trocar de janela também passa por aqui
        try
        {
            var (pid, modoDeCaptura, descricao) = ResolverOrigem(rotulo, modo);
            Registro.Escrever($"Som: rótulo \"{rotulo}\", modo {modo} -> processo {pid} ({descricao}, {modoDeCaptura}).");
            var nova = await CapturaDeAudio.CriarAsync(pid, modoDeCaptura);
            nova.Dados += AoReceber;
            nova.Parou += erro => NaInterface(() =>
            {
                Registro.Escrever($"A captura parou sozinha: {erro?.Message}");
                Enviar(new { tipo = "audio-parou", mensagem = "A captura do som parou." });
            });
            captura = nova;
            nova.Iniciar();
            Enviar(new { tipo = "audio-pronto", programa = descricao });
        }
        catch (OperationCanceledException)
        {
            Enviar(new { tipo = "audio-erro", mensagem = "Nenhum programa foi escolhido para o som." });
        }
        catch (Exception e)
        {
            Registro.Escrever($"Falha ao capturar o som: {e}");
            Enviar(new { tipo = "audio-erro", mensagem = $"Não deu para capturar o som: {e.Message}" });
        }
    }

    public async Task PararAsync()
    {
        var atual = captura;
        captura = null;
        if (atual is not null) await atual.PararAsync();
        pendente.SetLength(0);
    }

    (uint Pid, ModoDeCaptura Modo, string Descricao) ResolverOrigem(string? rotulo, string? modo)
    {
        // Regra principal: o Discord nunca entra. Qualquer modo que não seja "só o programa" vira "tudo menos o Discord"
        if (modo != "jogo") return TudoMenosDiscord();

        var janela = Processos.JanelaDoRotulo(rotulo);
        // Tela inteira não tem um programa só
        if (janela is null && rotulo?.StartsWith("screen:", StringComparison.Ordinal) == true) return TudoMenosDiscord();

        var pid = janela is { } j ? Processos.ProcessoDaJanela(j) : null;
        pid ??= Dialogos.EscolherPrograma(dono) ?? throw new OperationCanceledException();
        // Escolheram a janela do próprio Discord: pegar o som dele traria a call junto
        if (Processos.EhDoDiscord(pid.Value)) return TudoMenosDiscord();

        var nome = Processos.ListarProcessos().FirstOrDefault(p => p.Id == pid).Nome;
        return (pid.Value, ModoDeCaptura.SoDoProcesso, string.IsNullOrEmpty(nome) ? $"processo {pid}" : nome);
    }

    static (uint, ModoDeCaptura, string) TudoMenosDiscord() =>
        Processos.ProcessoPrincipalDoDiscord() is { } discord
            ? (discord, ModoDeCaptura.TudoMenosOProcesso, "todo o PC, menos o Discord")
            : ((uint)Environment.ProcessId, ModoDeCaptura.TudoMenosOProcesso, "todo o PC (o Discord não está aberto)");

    /// <summary>Chega da captura, fora da interface. Junta em blocos e manda para a página.</summary>
    void AoReceber(ReadOnlySpan<byte> pcm)
    {
        pendente.Write(pcm);
        if (pendente.Length < BytesPorBloco) return;
        var base64 = Convert.ToBase64String(pendente.GetBuffer(), 0, (int)pendente.Length);
        pendente.SetLength(0);
        NaInterface(() => EnviarJson($$"""{"tipo":"audio","pcm":"{{base64}}"}"""));
    }

    void Enviar(object mensagem) => EnviarJson(JsonSerializer.Serialize(mensagem));

    void EnviarJson(string json)
    {
        try
        {
            webview.PostWebMessageAsJson(json);
        }
        catch (Exception e) when (e is InvalidOperationException or System.Runtime.InteropServices.COMException)
        {
            // A página está trocando ou fechando: o bloco se perde, sem problema
        }
    }

    void NaInterface(Action acao)
    {
        if (dono.IsDisposed || !dono.IsHandleCreated) return;
        try
        {
            dono.BeginInvoke(acao);
        }
        catch (InvalidOperationException)
        {
            // Janela fechando
        }
    }

    static string? Texto(JsonElement json, string campo) =>
        json.ValueKind == JsonValueKind.Object && json.TryGetProperty(campo, out var valor) && valor.ValueKind == JsonValueKind.String
            ? valor.GetString()
            : null;
}

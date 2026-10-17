// captura-audio: ferramenta para testar a captura de som por programa (Fase 2a).
// As mensagens vão para o stderr, para o stdout ficar livre quando a saída é PCM cru.
using System.Globalization;
using NAudio.Wave;
using Transmissor.Audio;

const string Ajuda = """
    captura-audio - grava o som de um programa, sem o som do Discord

    Uso:
      captura-audio janelas
          Lista as janelas abertas e o processo de cada uma.

      captura-audio sessoes
          Lista os programas com som aberto e diz quais o modo "sem Discord" deixa de fora.
          Serve para conferir que o som do Discord nunca entra.

      captura-audio gravar <alvo> [--segundos N] [--saida arquivo.wav | --saida -]
          Alvo (escolha um):
            --janela "texto"   só o som do programa cuja janela tem esse texto no título
            --pid N            só o som do processo N (e dos filhos dele)
            --sem-discord      todo o som do PC, menos o do Discord
          --segundos N         para depois de N segundos (padrão: até apertar Ctrl+C)
          --saida arquivo.wav  onde salvar (padrão: captura.wav)
          --saida -            PCM cru no stdout (16 bits, 48 kHz, estéreo)

    Exemplos:
      captura-audio gravar --janela "Minecraft" --segundos 10
      captura-audio gravar --sem-discord --saida teste.wav
    """;

if (args.Length == 0 || args[0] is "-h" or "--help" or "ajuda")
{
    Console.WriteLine(Ajuda);
    return 0;
}

try
{
    return args[0] switch
    {
        "janelas" => ListarJanelas(),
        "sessoes" => ListarSessoes(),
        "gravar" => await GravarAsync(LerOpcoes(args[1..])),
        _ => throw new ErroDeUso($"Comando desconhecido: {args[0]}"),
    };
}
catch (ErroDeUso e)
{
    Console.Error.WriteLine($"Erro: {e.Message}");
    Console.Error.WriteLine("Use \"captura-audio ajuda\" para ver as opções.");
    return 2;
}
catch (Exception e)
{
    Console.Error.WriteLine($"Falha: {e.Message}");
    return 1;
}

static int ListarJanelas()
{
    var janelas = Processos.ListarJanelas();
    Console.WriteLine($"{"PID",7}  {"Processo",-24} Janela");
    foreach (var j in janelas)
    {
        Console.WriteLine($"{j.ProcessId,7}  {Cortar(j.NomeDoProcesso, 24),-24} {Cortar(j.Titulo, 60)}");
    }
    Console.WriteLine($"\n{janelas.Count} janela(s).");
    return 0;
}

static int ListarSessoes()
{
    var sessoes = SessoesDeAudio.Listar();
    Console.WriteLine($"{"PID",7}  {"Programa",-24} {"Tocando",-8} No modo sem Discord");
    foreach (var s in sessoes)
    {
        Console.WriteLine($"{s.ProcessId,7}  {Cortar(s.Programa, 24),-24} {(s.Tocando ? "sim" : "não"),-8} {(s.FicaDeForaSemDiscord ? "fica de fora" : "entra")}");
    }

    // O Discord tem de estar todo dentro da árvore excluída; se não, a call vazaria
    var vazando = sessoes.Where(s => s.Programa.StartsWith("Discord", StringComparison.OrdinalIgnoreCase) && !s.FicaDeForaSemDiscord).ToList();
    Console.WriteLine();
    if (!sessoes.Any(s => s.Programa.StartsWith("Discord", StringComparison.OrdinalIgnoreCase)))
    {
        Console.WriteLine("O Discord não tem som aberto agora (entre numa call para conferir).");
    }
    else if (vazando.Count == 0)
    {
        Console.WriteLine("OK: todo o som do Discord fica de fora no modo sem Discord.");
    }
    else
    {
        Console.WriteLine($"ATENÇÃO: {vazando.Count} som(ns) do Discord fora da árvore excluída (PID {string.Join(", ", vazando.Select(s => s.ProcessId))}).");
        return 1;
    }
    return 0;
}

static async Task<int> GravarAsync(Dictionary<string, string?> opcoes)
{
    var (pid, modo, descricao) = ResolverAlvo(opcoes);
    var duracao = opcoes.TryGetValue("--segundos", out var s)
        ? TimeSpan.FromSeconds(double.Parse(s ?? throw new ErroDeUso("Informe o número de segundos."), CultureInfo.InvariantCulture))
        : (TimeSpan?)null;
    var saida = opcoes.GetValueOrDefault("--saida") ?? "captura.wav";

    // O destino é declarado antes da captura para ser fechado depois dela
    using Stream destino = saida == "-" ? Console.OpenStandardOutput() : new WaveFileWriter(saida, CapturaDeAudio.Formato);
    await using var captura = await CapturaDeAudio.CriarAsync(pid, modo);

    long bytes = 0;
    captura.Dados += pcm =>
    {
        destino.Write(pcm);
        bytes += pcm.Length;
    };

    using var fim = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) =>
    {
        e.Cancel = true;
        fim.Cancel();
    };
    captura.Parou += erro =>
    {
        Console.Error.WriteLine($"A captura parou: {erro?.Message ?? "motivo desconhecido"}");
        fim.Cancel();
    };
    if (duracao is { } d) fim.CancelAfter(d);

    Console.Error.WriteLine($"Gravando {descricao}. Aperte Ctrl+C para parar.");
    captura.Iniciar();
    try
    {
        await Task.Delay(Timeout.Infinite, fim.Token);
    }
    catch (OperationCanceledException)
    {
        // Fim da gravação
    }
    await captura.PararAsync();

    var segundos = bytes / (double)CapturaDeAudio.Formato.AverageBytesPerSecond;
    Console.Error.WriteLine($"Pronto: {segundos:0.0} s de áudio{(saida == "-" ? "" : $" em {Path.GetFullPath(saida)}")}.");
    return 0;
}

static (uint Pid, ModoDeCaptura Modo, string Descricao) ResolverAlvo(Dictionary<string, string?> opcoes)
{
    var alvos = new[] { "--janela", "--pid", "--sem-discord" }.Where(opcoes.ContainsKey).ToList();
    if (alvos.Count != 1) throw new ErroDeUso("Escolha um alvo: --janela, --pid ou --sem-discord.");

    switch (alvos[0])
    {
        case "--janela":
        {
            var texto = opcoes["--janela"] ?? throw new ErroDeUso("Informe parte do título da janela.");
            var achadas = Processos.ListarJanelas()
                .Where(j => j.Titulo.Contains(texto, StringComparison.OrdinalIgnoreCase))
                .ToList();
            var pids = achadas.Select(j => j.ProcessId).Distinct().ToList();
            if (pids.Count == 0) throw new ErroDeUso($"Nenhuma janela com \"{texto}\" no título. Veja a lista com \"captura-audio janelas\".");
            if (pids.Count > 1)
            {
                var lista = string.Join(", ", achadas.Select(j => $"\"{j.Titulo}\" (PID {j.ProcessId})"));
                throw new ErroDeUso($"Mais de um programa com \"{texto}\" no título: {lista}. Seja mais específico ou use --pid.");
            }
            var janela = achadas[0];
            return (janela.ProcessId, ModoDeCaptura.SoDoProcesso, $"só o som de {janela.NomeDoProcesso} (\"{janela.Titulo}\")");
        }
        case "--pid":
        {
            if (!uint.TryParse(opcoes["--pid"], out var pid)) throw new ErroDeUso("--pid precisa de um número.");
            return (pid, ModoDeCaptura.SoDoProcesso, $"só o som do processo {pid}");
        }
        default:
        {
            var discord = Processos.ProcessoPrincipalDoDiscord()
                ?? throw new ErroDeUso("O Discord não está aberto, então não há o que excluir. Use --janela ou --pid.");
            return (discord, ModoDeCaptura.TudoMenosOProcesso, $"todo o som do PC, menos o Discord (PID {discord})");
        }
    }
}

static Dictionary<string, string?> LerOpcoes(string[] args)
{
    var opcoes = new Dictionary<string, string?>();
    for (var i = 0; i < args.Length; i++)
    {
        if (!args[i].StartsWith("--", StringComparison.Ordinal)) throw new ErroDeUso($"Argumento inesperado: {args[i]}");
        var temValor = i + 1 < args.Length && (!args[i + 1].StartsWith("--", StringComparison.Ordinal));
        opcoes[args[i]] = temValor ? args[++i] : null;
    }
    return opcoes;
}

static string Cortar(string texto, int maximo) => texto.Length <= maximo ? texto : texto[..(maximo - 3)] + "...";

sealed class ErroDeUso(string mensagem) : Exception(mensagem);

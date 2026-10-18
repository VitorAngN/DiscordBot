using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Transmissor.App;

/// <summary>
/// Janela do app: mostra a página de transmitir do servidor (WebView2) e atende os pedidos dela
/// (som, chave de transmissão). Ao vivo, fica também na bandeja e atende o atalho de encerrar.
/// </summary>
internal sealed class JanelaPrincipal : Form
{
    const string LinkDoWebView2 = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    /// <summary>
    /// O que este app sabe fazer, para a página: "chave" guarda a chave de transmissão protegida;
    /// "bandeja" quer saber se está ao vivo e manda comandos da bandeja e do atalho.
    /// </summary>
    static readonly string[] Recursos = ["chave", "bandeja"];

    readonly WebView2 navegador = new() { Dock = DockStyle.Fill };
    readonly CofreDaChave cofre = CofreDaChave.Padrao;
    Configuracao configuracao;
    PonteDeAudio? ponte;
    Bandeja? bandeja;
    readonly MenuStrip menu;
    EstadoDaTransmissao estado = EstadoDaTransmissao.Parado;
    bool avisouDaBandeja;

    public JanelaPrincipal(Configuracao configuracao)
    {
        this.configuracao = configuracao;
        Text = $"DiscordBot — Transmissor {Atualizacao.Atual.ToString(3)}";
        Icon = Icones.Parado;
        ClientSize = new Size(1100, 820);
        MinimumSize = new Size(640, 480);
        StartPosition = FormStartPosition.CenterScreen;

        var menu = new MenuStrip();
        menu.Items.Add(new ToolStripMenuItem("Servidor…", null, (_, _) => TrocarServidor()));
        menu.Items.Add(new ToolStripMenuItem("Recarregar", null, (_, _) => navegador.CoreWebView2?.Reload()) { ShortcutKeys = Keys.F5 });
        menu.Items.Add(new ToolStripMenuItem("Abrir registro", null, (_, _) => AbrirExterno(Registro.Arquivo)));
        this.menu = menu;

        Controls.Add(navegador);
        Controls.Add(menu);
        MainMenuStrip = menu;

        Load += async (_, _) => await IniciarAsync();
        FormClosing += (_, e) =>
        {
            var pelaPessoa = e.CloseReason is CloseReason.UserClosing or CloseReason.None;
            if (estado.AoVivo && pelaPessoa && !ConfirmarSaida())
            {
                e.Cancel = true;
                return;
            }
            _ = ponte?.PararAsync();
        };
        FormClosed += (_, _) => bandeja?.Dispose();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        var temAtalho = AtalhoGlobal.Registrar(Handle);
        if (!temAtalho) Registro.Escrever($"Não deu para usar o atalho {AtalhoGlobal.Descricao}: outro programa já usa.");
        if (bandeja is not null) return;

        bandeja = new Bandeja(temAtalho ? AtalhoGlobal.Descricao : null);
        bandeja.AbrirPedido += Abrir;
        bandeja.TrocarPedido += () =>
        {
            // Escolher outra janela precisa de um clique na página; o app só leva até o botão
            Abrir();
            EnviarComando("mostrar-trocar");
        };
        bandeja.EncerrarPedido += () => EncerrarPeloApp("pela bandeja");
        bandeja.SairPedido += () =>
        {
            Abrir();
            Close();
        };
    }

    protected override void OnHandleDestroyed(EventArgs e)
    {
        AtalhoGlobal.Liberar(Handle);
        base.OnHandleDestroyed(e);
    }

    protected override void WndProc(ref Message m)
    {
        if (AtalhoGlobal.EhOAtalho(m)) EncerrarPeloApp($"com o atalho {AtalhoGlobal.Descricao}");
        base.WndProc(ref m);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        // Ao vivo, minimizar esconde a janela na bandeja, para ela não atrapalhar o jogo
        if (WindowState != FormWindowState.Minimized || !estado.AoVivo) return;
        Hide();
        if (avisouDaBandeja) return;
        avisouDaBandeja = true;
        bandeja?.Avisar("O Transmissor continua aqui", $"Ainda ao vivo. Para encerrar, use {AtalhoGlobal.Descricao} ou o ícone perto do relógio.");
    }

    void Abrir()
    {
        Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
    }

    bool ConfirmarSaida() =>
        MessageBox.Show(this, "Você está ao vivo. Fechar o Transmissor encerra a transmissão.", Text,
            MessageBoxButtons.OKCancel, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) == DialogResult.OK;

    /// <summary>Encerra a transmissão sem precisar da janela (bandeja ou atalho).</summary>
    void EncerrarPeloApp(string como)
    {
        if (!estado.AoVivo) return;
        Registro.Escrever($"Transmissão encerrada {como}.");
        EnviarComando("encerrar");
        bandeja?.Avisar("Transmissão encerrada", $"Você encerrou {como}.");
    }

    void EnviarComando(string comando) =>
        navegador.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(new { tipo = "comando", comando }));

    async Task IniciarAsync()
    {
        if (configuracao.Servidor is null) TrocarServidor();
        if (configuracao.Servidor is null)
        {
            Close();
            return;
        }

        try
        {
            var dados = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DiscordBot", "WebView2");
            var ambiente = await CoreWebView2Environment.CreateAsync(browserExecutableFolder: null, userDataFolder: dados);
            await navegador.EnsureCoreWebView2Async(ambiente);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(this, $"Este app precisa do Microsoft Edge WebView2, que vem no Windows 11. Instale por aqui:\n{LinkDoWebView2}",
                Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            AbrirExterno(LinkDoWebView2);
            Close();
            return;
        }

        var core = navegador.CoreWebView2;
        core.Settings.IsStatusBarEnabled = false;
        ponte = new PonteDeAudio(this, core);

        // A página descobre por aqui o que este app sabe fazer; apps antigos não dizem nada
        var apresentacao = JsonSerializer.Serialize(new { versao = Application.ProductVersion.Split('+')[0], recursos = Recursos });
        await core.AddScriptToExecuteOnDocumentCreatedAsync($"window.transmissorApp = Object.freeze({apresentacao});");

        core.WebMessageReceived += async (_, e) =>
        {
            // Só a página do próprio servidor fala com o app
            if (!DoServidor(e.Source)) return;
            try
            {
                using var json = JsonDocument.Parse(e.WebMessageAsJson);
                var mensagem = json.RootElement.Clone();
                if (!TratarDoApp(mensagem)) await ponte.TratarAsync(mensagem);
            }
            catch (JsonException)
            {
                // Mensagem que não é para o app
            }
        };
        // Links para fora do servidor abrem no navegador normal
        core.NavigationStarting += (_, e) =>
        {
            // Recarregar ou trocar de servidor derruba a transmissão da página
            if (DoServidor(e.Uri))
            {
                MostrarEstado(EstadoDaTransmissao.Parado);
                return;
            }
            e.Cancel = true;
            AbrirExterno(e.Uri);
        };
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            AbrirExterno(e.Uri);
        };

        Registro.Escrever($"App aberto (versão {Atualizacao.Atual.ToString(3)}). Servidor: {configuracao.Servidor}. WebView2 {core.Environment.BrowserVersionString}.");
        Navegar();
        _ = AvisarSeTemVersaoNovaAsync();
    }

    /// <summary>Se saiu um Transmissor mais novo, mostra no menu e na bandeja. Não baixa nada sozinho.</summary>
    async Task AvisarSeTemVersaoNovaAsync()
    {
        var nova = await Atualizacao.ProcurarAsync();
        if (nova is null || IsDisposed) return;
        var texto = $"⬆ Baixar a versão {nova.ToString(3)}";
        Registro.Escrever($"Versão nova disponível: {nova.ToString(3)}.");
        menu.Items.Add(new ToolStripMenuItem(texto, null, (_, _) => AbrirExterno(Atualizacao.PaginaDeDownload))
        {
            Alignment = ToolStripItemAlignment.Right,
            ForeColor = Color.FromArgb(0x23, 0xA5, 0x5A),
            Font = new Font(menu.Font, FontStyle.Bold),
        });
        bandeja?.Avisar("Saiu uma versão nova do Transmissor",
            $"Versão {nova.ToString(3)}. Clique em \"{texto}\", no alto da janela, para baixar e trocar pelo arquivo antigo.");
    }

    /// <summary>Mensagens sobre a chave e o estado da transmissão. Devolve <c>false</c> se forem de outro assunto (o som).</summary>
    bool TratarDoApp(JsonElement mensagem)
    {
        if (mensagem.ValueKind != JsonValueKind.Object || !mensagem.TryGetProperty("tipo", out var tipo)) return false;
        switch (tipo.GetString())
        {
            case "chave-ler":
                navegador.CoreWebView2?.PostWebMessageAsJson(JsonSerializer.Serialize(new { tipo = "chave", chave = cofre.Ler() }));
                return true;
            case "chave-guardar":
                if (mensagem.TryGetProperty("chave", out var chave) && chave.ValueKind == JsonValueKind.String
                    && !string.IsNullOrWhiteSpace(chave.GetString()))
                {
                    cofre.Guardar(chave.GetString()!);
                }
                return true;
            case "chave-esquecer":
                cofre.Esquecer();
                return true;
            case "estado":
                MostrarEstado(LerEstado(mensagem));
                return true;
            default:
                return false;
        }
    }

    void MostrarEstado(EstadoDaTransmissao novo)
    {
        estado = novo;
        Icon = novo.AoVivo ? Icones.AoVivo : Icones.Parado;
        bandeja?.Mostrar(novo);
    }

    internal static EstadoDaTransmissao LerEstado(JsonElement mensagem)
    {
        var aoVivo = mensagem.TryGetProperty("aoVivo", out var v) && v.ValueKind == JsonValueKind.True;
        var espectadores = mensagem.TryGetProperty("espectadores", out var n) && n.ValueKind == JsonValueKind.Number && n.TryGetInt32(out var total) ? Math.Max(0, total) : 0;
        return new EstadoDaTransmissao(aoVivo, espectadores);
    }

    void Navegar() => navegador.CoreWebView2?.Navigate($"{configuracao.Servidor}/transmitir");

    bool DoServidor(string endereco) =>
        Uri.TryCreate(endereco, UriKind.Absolute, out var uri)
        && string.Equals(uri.GetLeftPart(UriPartial.Authority), configuracao.Servidor, StringComparison.OrdinalIgnoreCase);

    void TrocarServidor()
    {
        var novo = Dialogos.PedirServidor(this, configuracao.Servidor);
        if (novo is null) return;
        // A chave guardada é a do servidor antigo
        if (!string.Equals(novo, configuracao.Servidor, StringComparison.OrdinalIgnoreCase)) cofre.Esquecer();
        configuracao = configuracao with { Servidor = novo };
        configuracao.Salvar();
        _ = ponte?.PararAsync();
        Navegar();
    }

    static void AbrirExterno(string endereco)
    {
        var ehWeb = Uri.TryCreate(endereco, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);
        if (!ehWeb && !File.Exists(endereco)) return;
        Process.Start(new ProcessStartInfo(endereco) { UseShellExecute = true });
    }
}

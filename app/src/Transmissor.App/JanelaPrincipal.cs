using System.Diagnostics;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Transmissor.App;

/// <summary>
/// Janela do app: mostra a página de transmitir do servidor (WebView2) e atende os pedidos de som dela.
/// </summary>
internal sealed class JanelaPrincipal : Form
{
    const string LinkDoWebView2 = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    readonly WebView2 navegador = new() { Dock = DockStyle.Fill };
    Configuracao configuracao;
    PonteDeAudio? ponte;

    public JanelaPrincipal(Configuracao configuracao)
    {
        this.configuracao = configuracao;
        Text = "DiscordBot — Transmissor";
        ClientSize = new Size(1100, 820);
        MinimumSize = new Size(640, 480);
        StartPosition = FormStartPosition.CenterScreen;

        var menu = new MenuStrip();
        menu.Items.Add(new ToolStripMenuItem("Servidor…", null, (_, _) => TrocarServidor()));
        menu.Items.Add(new ToolStripMenuItem("Recarregar", null, (_, _) => navegador.CoreWebView2?.Reload()) { ShortcutKeys = Keys.F5 });
        menu.Items.Add(new ToolStripMenuItem("Abrir registro", null, (_, _) => AbrirExterno(Registro.Arquivo)));

        Controls.Add(navegador);
        Controls.Add(menu);
        MainMenuStrip = menu;

        Load += async (_, _) => await IniciarAsync();
        FormClosing += (_, _) => _ = ponte?.PararAsync();
    }

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

        core.WebMessageReceived += async (_, e) =>
        {
            // Só a página do próprio servidor pode pedir o som
            if (!DoServidor(e.Source)) return;
            try
            {
                using var json = JsonDocument.Parse(e.WebMessageAsJson);
                await ponte.TratarAsync(json.RootElement.Clone());
            }
            catch (JsonException)
            {
                // Mensagem que não é para o app
            }
        };
        // Links para fora do servidor abrem no navegador normal
        core.NavigationStarting += (_, e) =>
        {
            if (DoServidor(e.Uri)) return;
            e.Cancel = true;
            AbrirExterno(e.Uri);
        };
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            AbrirExterno(e.Uri);
        };

        Registro.Escrever($"App aberto. Servidor: {configuracao.Servidor}. WebView2 {core.Environment.BrowserVersionString}.");
        Navegar();
    }

    void Navegar() => navegador.CoreWebView2?.Navigate($"{configuracao.Servidor}/transmitir");

    bool DoServidor(string endereco) =>
        Uri.TryCreate(endereco, UriKind.Absolute, out var uri)
        && string.Equals(uri.GetLeftPart(UriPartial.Authority), configuracao.Servidor, StringComparison.OrdinalIgnoreCase);

    void TrocarServidor()
    {
        var novo = Dialogos.PedirServidor(this, configuracao.Servidor);
        if (novo is null) return;
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

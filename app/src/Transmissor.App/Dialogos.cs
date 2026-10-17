using Transmissor.Audio;

namespace Transmissor.App;

/// <summary>Janelinhas simples do app.</summary>
internal static class Dialogos
{
    /// <summary>Pede o endereço do servidor. Devolve o endereço normalizado, ou <c>null</c> se cancelar.</summary>
    public static string? PedirServidor(IWin32Window? dono, string? atual)
    {
        using var janela = NovaJanela("Servidor de transmissão", 560, 190);
        var texto = new Label
        {
            Text = "Endereço do seu servidor de transmissão (o que apareceu no \"npm run deploy\"):",
            Dock = DockStyle.Top,
            Height = 40,
        };
        var campo = new TextBox { Text = atual ?? "https://", Dock = DockStyle.Top };
        var botoes = Botoes(janela, "Salvar");
        janela.Controls.Add(botoes);
        janela.Controls.Add(campo);
        janela.Controls.Add(texto);

        string? escolhido = null;
        botoes.Controls[0].Click += (_, _) =>
        {
            escolhido = Configuracao.NormalizarServidor(campo.Text);
            if (escolhido is null)
            {
                MessageBox.Show(janela, "Endereço inválido. Use algo como https://discordbot-transmissao.seunome.workers.dev",
                    "Servidor de transmissão", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                janela.DialogResult = DialogResult.None;
            }
        };
        return janela.ShowDialog(dono) == DialogResult.OK ? escolhido : null;
    }

    /// <summary>
    /// Plano B quando não dá para saber de qual programa é a janela capturada: a pessoa escolhe.
    /// Devolve o processo, ou <c>null</c> se cancelar.
    /// </summary>
    public static uint? EscolherPrograma(IWin32Window? dono)
    {
        using var janela = NovaJanela("De qual programa é o som?", 560, 420);
        var lista = new ListBox { Dock = DockStyle.Fill, IntegralHeight = false };
        foreach (var j in Processos.ListarJanelas()) lista.Items.Add(new ItemDeJanela(j));
        if (lista.Items.Count > 0) lista.SelectedIndex = 0;
        var texto = new Label
        {
            Text = "Não deu para saber sozinho de qual programa é a janela escolhida. Escolha o jogo para pegar só o som dele:",
            Dock = DockStyle.Top,
            Height = 44,
        };
        var botoes = Botoes(janela, "Usar o som deste programa");
        lista.DoubleClick += (_, _) => janela.DialogResult = DialogResult.OK;
        // O que preenche o resto entra primeiro: o WinForms encaixa de trás para frente
        janela.Controls.Add(lista);
        janela.Controls.Add(botoes);
        janela.Controls.Add(texto);

        return janela.ShowDialog(dono) == DialogResult.OK && lista.SelectedItem is ItemDeJanela item ? item.Janela.ProcessId : null;
    }

    static Form NovaJanela(string titulo, int largura, int altura) => new()
    {
        Text = titulo,
        ClientSize = new Size(largura, altura),
        StartPosition = FormStartPosition.CenterParent,
        FormBorderStyle = FormBorderStyle.FixedDialog,
        MinimizeBox = false,
        MaximizeBox = false,
        ShowInTaskbar = false,
        Padding = new Padding(12),
        Font = SystemFonts.MessageBoxFont,
    };

    /// <summary>Linha com "OK" (primeiro controle) e "Cancelar", no rodapé.</summary>
    static FlowLayoutPanel Botoes(Form janela, string textoOk)
    {
        var ok = new Button { Text = textoOk, DialogResult = DialogResult.OK, AutoSize = true };
        var cancelar = new Button { Text = "Cancelar", DialogResult = DialogResult.Cancel, AutoSize = true };
        janela.AcceptButton = ok;
        janela.CancelButton = cancelar;
        var painel = new FlowLayoutPanel { Dock = DockStyle.Bottom, FlowDirection = FlowDirection.RightToLeft, AutoSize = true };
        painel.Controls.Add(ok);
        painel.Controls.Add(cancelar);
        return painel;
    }

    sealed record ItemDeJanela(JanelaDePrograma Janela)
    {
        public override string ToString() => $"{Janela.NomeDoProcesso} — {Janela.Titulo}";
    }
}

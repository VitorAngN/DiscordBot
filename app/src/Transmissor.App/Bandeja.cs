namespace Transmissor.App;

/// <summary>O que a página de transmitir conta para o app.</summary>
internal sealed record EstadoDaTransmissao(bool AoVivo, int Espectadores)
{
    public static readonly EstadoDaTransmissao Parado = new(false, 0);
}

/// <summary>
/// Ícone perto do relógio: mostra se está ao vivo e quantos assistem, e deixa encerrar (ou voltar
/// para trocar a janela) sem sair do jogo.
/// </summary>
internal sealed class Bandeja : IDisposable
{
    readonly NotifyIcon icone;
    readonly ToolStripMenuItem trocar;
    readonly ToolStripMenuItem encerrar;
    readonly Icon parado = new(Icones.Parado, SystemInformation.SmallIconSize);
    readonly Icon aoVivo = new(Icones.AoVivo, SystemInformation.SmallIconSize);

    public event Action? AbrirPedido;
    public event Action? TrocarPedido;
    public event Action? EncerrarPedido;
    public event Action? SairPedido;

    /// <param name="atalho">Como aparece o atalho de encerrar, ou <c>null</c> se ele não pôde ser registrado.</param>
    public Bandeja(string? atalho)
    {
        trocar = new ToolStripMenuItem("Trocar janela…", null, (_, _) => TrocarPedido?.Invoke());
        encerrar = new ToolStripMenuItem("Encerrar transmissão", null, (_, _) => EncerrarPedido?.Invoke())
        {
            ShortcutKeyDisplayString = atalho,
        };
        var abrir = new ToolStripMenuItem("Abrir o Transmissor", null, (_, _) => AbrirPedido?.Invoke())
        {
            Font = new Font(SystemFonts.MenuFont ?? Control.DefaultFont, FontStyle.Bold),
        };
        var menu = new ContextMenuStrip();
        menu.Items.AddRange([abrir, new ToolStripSeparator(), trocar, encerrar, new ToolStripSeparator(),
            new ToolStripMenuItem("Sair", null, (_, _) => SairPedido?.Invoke())]);

        icone = new NotifyIcon { ContextMenuStrip = menu, Visible = true };
        icone.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) AbrirPedido?.Invoke();
        };
        icone.BalloonTipClicked += (_, _) => AbrirPedido?.Invoke();
        Mostrar(EstadoDaTransmissao.Parado);
    }

    public void Mostrar(EstadoDaTransmissao estado)
    {
        icone.Icon = estado.AoVivo ? aoVivo : parado;
        icone.Text = Texto(estado);
        trocar.Enabled = estado.AoVivo;
        encerrar.Enabled = estado.AoVivo;
    }

    public void Avisar(string titulo, string texto) => icone.ShowBalloonTip(5_000, titulo, texto, ToolTipIcon.Info);

    /// <summary>Dica do ícone (o Windows corta em 127 caracteres).</summary>
    internal static string Texto(EstadoDaTransmissao estado)
    {
        if (!estado.AoVivo) return "Transmissor: parado";
        var quem = estado.Espectadores switch
        {
            <= 0 => "ninguém assistindo ainda",
            1 => "1 pessoa assistindo",
            var n => $"{n} pessoas assistindo",
        };
        return $"Transmissor: ao vivo, {quem}";
    }

    public void Dispose()
    {
        icone.Visible = false;
        icone.ContextMenuStrip?.Dispose();
        icone.Dispose();
        parado.Dispose();
        aoVivo.Dispose();
    }
}

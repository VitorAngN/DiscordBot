namespace Transmissor.App;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.ThreadException += (_, e) => Registro.Escrever($"Erro na interface: {e.Exception}");
        Application.Run(new JanelaPrincipal(Configuracao.Carregar()));
    }
}

# Gera os ícones do app (pasta src/Transmissor.App/Icones): um quadrado arredondado roxo com o
# triângulo de "play" (parado) e um vermelho com o ponto de "gravando" (ao vivo).
# Cada .ico leva 16, 24, 32, 48 e 256 px.
# Uso: powershell -ExecutionPolicy Bypass -File app/tools/gerar-icones.ps1
Add-Type -AssemblyName System.Drawing

$pasta = Join-Path $PSScriptRoot '..\src\Transmissor.App\Icones'
New-Item -ItemType Directory -Force $pasta | Out-Null

function Desenhar([int]$tamanho, [System.Drawing.Color]$cor, [string]$simbolo) {
    $bitmap = New-Object System.Drawing.Bitmap $tamanho, $tamanho
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $raio = [Math]::Max(2, $tamanho * 0.22)
    $caminho = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $raio * 2
    $fim = $tamanho - 1
    $caminho.AddArc(0, 0, $d, $d, 180, 90)
    $caminho.AddArc($fim - $d, 0, $d, $d, 270, 90)
    $caminho.AddArc($fim - $d, $fim - $d, $d, $d, 0, 90)
    $caminho.AddArc(0, $fim - $d, $d, $d, 90, 90)
    $caminho.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush $cor), $caminho)

    $s = $tamanho
    if ($simbolo -eq 'play') {
        # Um pouco à direita do centro, para o triângulo parecer centralizado
        $pontos = [System.Drawing.PointF[]]@(
            (New-Object System.Drawing.PointF ($s * 0.36), ($s * 0.26)),
            (New-Object System.Drawing.PointF ($s * 0.36), ($s * 0.74)),
            (New-Object System.Drawing.PointF ($s * 0.76), ($s * 0.50))
        )
        $g.FillPolygon([System.Drawing.Brushes]::White, $pontos)
    } else {
        $g.FillEllipse([System.Drawing.Brushes]::White, ($s * 0.27), ($s * 0.27), ($s * 0.46), ($s * 0.46))
    }
    $g.Dispose()
    return $bitmap
}

function Salvar-Ico([string]$arquivo, [System.Drawing.Color]$cor, [string]$simbolo) {
    $tamanhos = 16, 24, 32, 48, 256
    $imagens = foreach ($t in $tamanhos) {
        $bitmap = Desenhar $t $cor $simbolo
        $memoria = New-Object System.IO.MemoryStream
        $bitmap.Save($memoria, [System.Drawing.Imaging.ImageFormat]::Png)
        $bitmap.Dispose()
        , $memoria.ToArray()
    }

    $saida = New-Object System.IO.MemoryStream
    $escritor = New-Object System.IO.BinaryWriter $saida
    # Cabeçalho do .ico: reservado, tipo 1 (ícone), quantidade de imagens
    $escritor.Write([uint16]0); $escritor.Write([uint16]1); $escritor.Write([uint16]$tamanhos.Count)
    $deslocamento = 6 + 16 * $tamanhos.Count
    for ($i = 0; $i -lt $tamanhos.Count; $i++) {
        $lado = if ($tamanhos[$i] -ge 256) { 0 } else { $tamanhos[$i] } # 0 quer dizer 256
        $escritor.Write([byte]$lado); $escritor.Write([byte]$lado)
        $escritor.Write([byte]0); $escritor.Write([byte]0)          # paleta, reservado
        $escritor.Write([uint16]1); $escritor.Write([uint16]32)    # planos, bits por pixel
        $escritor.Write([uint32]$imagens[$i].Length); $escritor.Write([uint32]$deslocamento)
        $deslocamento += $imagens[$i].Length
    }
    foreach ($imagem in $imagens) { $escritor.Write($imagem) }
    $escritor.Flush()
    [System.IO.File]::WriteAllBytes((Join-Path $pasta $arquivo), $saida.ToArray())
}

Salvar-Ico 'transmissor.ico' ([System.Drawing.Color]::FromArgb(0x58, 0x65, 0xF2)) 'play'
Salvar-Ico 'ao-vivo.ico' ([System.Drawing.Color]::FromArgb(0xF2, 0x3F, 0x43)) 'ponto'
Write-Output "Icones gerados em $pasta" # sem acento: o PowerShell 5.1 lê o script como ANSI

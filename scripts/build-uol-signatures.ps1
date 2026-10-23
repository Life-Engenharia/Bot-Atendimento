Add-Type -AssemblyName System.Drawing

$source = 'C:\Users\Setor Desenvolviment\Downloads\Assinatura Corporativa Life Engenharia (2).png'
$destination = Join-Path $PSScriptRoot '..\output\assinaturas-email-uol'
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$acuteE = [char]0x00E9
$circumflexE = [char]0x00EA
$cedilla = [char]0x00E7
$tildeA = [char]0x00E3
$tildeO = [char]0x00F5
$contacts = @(
  @{ File = 'compras'; Sector = 'Compras'; Phone = '+55 79 99646-7019'; Email = 'compras@life.eng.br' },
  @{ File = 'licitacoes'; Sector = ('Licita' + $cedilla + $tildeO + 'es'); Phone = '+55 79 99673-0912'; Email = 'licitacao@life.eng.br' },
  @{ File = 'financeiro'; Sector = 'Financeiro'; Phone = '+55 79 99654-9021'; Email = 'financeiro@life.eng.br' },
  @{ File = 'assistencia-tecnica'; Sector = ('Assist' + $circumflexE + 'ncia T' + $acuteE + 'cnica'); Phone = '+55 79 99890-1667'; Email = 'assistencia@life.eng.br' },
  @{ File = 'recepcao'; Sector = ('Recep' + $cedilla + $tildeA + 'o'); Phone = '+55 79 98122-4074'; Email = 'recepcao@life.eng.br' },
  @{ File = 'almoxarifado'; Sector = 'Almoxarifado'; Phone = '+55 79 99842-7522'; Email = 'controleinterno@life.eng.br' },
  @{ File = 'farmaceutico'; Sector = ('Farmac' + $circumflexE + 'utico'); Phone = '+55 79 9860-4471'; Email = 'anderson@life.eng.br' },
  @{ File = 'vendas'; Sector = 'Vendas'; Phone = '+55 79 99925-0532'; Email = 'vendas@life.eng.br' },
  @{ File = 'engenharia-de-software'; Sector = 'Engenharia de Software'; Phone = '+55 79 99116-2353'; Email = 'informatica@life.eng.br' },
  @{ File = 'rh'; Sector = 'Recursos Humanos'; Phone = '+55 79 8100-1814'; Email = 'rh@life.eng.br' }
)

function Clear-TextArea {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Bitmap]$Bitmap,
    [int]$Left,
    [int]$SampleX,
    [int]$Top,
    [int]$Bottom
  )

  # Rebuild only the narrow text bands with a nearby clean background color.
  for ($y = $Top; $y -lt $Bottom; $y++) {
    $backgroundColor = $Bitmap.GetPixel($SampleX, $y)
    $row = New-Object System.Drawing.Rectangle $Left, $y, ($SampleX - $Left), 1
    $brush = New-Object System.Drawing.SolidBrush $backgroundColor
    $Graphics.FillRectangle($brush, $row)
    $brush.Dispose()
  }
}

$original = [System.Drawing.Image]::FromFile($source)
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }

foreach ($contact in $contacts) {
  # Keep the template at its native resolution so the logo and badges stay crisp.
  $canvas = New-Object System.Drawing.Bitmap 2172, 724
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.DrawImage($original, (New-Object System.Drawing.Rectangle 0, 0, 2172, 724))

  # Keep the three original icon badges. Remove only placeholder text and
  # rebuild the nearby pale background from clean pixels at the same height.
  Clear-TextArea $graphics $original 1010 2000 112 270
  Clear-TextArea $graphics $original 1170 1900 280 380
  Clear-TextArea $graphics $original 1170 1850 375 470
  Clear-TextArea $graphics $original 1170 1600 466 580

  $sectorFontSize = if ($contact.Sector.Length -gt 20) { 43 } else { 49 }
  $sectorFont = New-Object System.Drawing.Font 'Arial', $sectorFontSize, ([System.Drawing.FontStyle]::Bold)
  $phoneFont = New-Object System.Drawing.Font 'Arial', 35, ([System.Drawing.FontStyle]::Regular)
  $emailFont = New-Object System.Drawing.Font 'Arial', 28, ([System.Drawing.FontStyle]::Regular)
  $siteFont = New-Object System.Drawing.Font 'Arial', 32, ([System.Drawing.FontStyle]::Bold)
  $ink = [System.Drawing.Color]::FromArgb(18, 54, 103)
  $inkBrush = New-Object System.Drawing.SolidBrush $ink
  $graphics.DrawString($contact.Sector, $sectorFont, $inkBrush, 1075, 120)
  $graphics.DrawString($contact.Phone, $phoneFont, $inkBrush, 1190, 305)
  $graphics.DrawString($contact.Email, $emailFont, $inkBrush, 1190, 412)
  $graphics.DrawString('life.eng.br', $siteFont, $inkBrush, 1190, 507)

  $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters 1
  $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 92L
  $output = Join-Path $destination ("assinatura-uol-{0}.jpg" -f $contact.File)
  $canvas.Save($output, $jpegCodec, $encoderParameters)

  # Match the UOL editor's displayed width while reducing its pasted payload.
  $lightCanvas = New-Object System.Drawing.Bitmap 500, 167
  $lightGraphics = [System.Drawing.Graphics]::FromImage($lightCanvas)
  $lightGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $lightGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $lightGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $lightGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $lightGraphics.DrawImage($canvas, (New-Object System.Drawing.Rectangle 0, 0, 500, 167))
  $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 90L
  $lightOutput = Join-Path $destination ("assinatura-uol-{0}-leve.jpg" -f $contact.File)
  $lightCanvas.Save($lightOutput, $jpegCodec, $encoderParameters)

  $encoderParameters.Dispose()
  $lightGraphics.Dispose()
  $lightCanvas.Dispose()
  $inkBrush.Dispose()
  $sectorFont.Dispose()
  $phoneFont.Dispose()
  $emailFont.Dispose()
  $siteFont.Dispose()
  $graphics.Dispose()
  $canvas.Dispose()
}

$original.Dispose()

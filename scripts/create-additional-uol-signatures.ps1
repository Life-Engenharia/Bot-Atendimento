Add-Type -AssemblyName System.Drawing

$source = 'C:\Users\Setor Desenvolviment\Downloads\Assinatura Corporativa Life Engenharia (2).png'
$destination = Join-Path $PSScriptRoot '..\output\assinaturas-email-uol\alta-qualidade'
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$acuteI = [char]0x00ED
$contacts = @(
  @{ File = 'comercial'; Sector = 'Comercial'; Phone = '+55 79 99925-0532'; Email = 'vendas@life.eng.br'; HasPhone = $true },
  @{ File = 'renilson-administrador'; Sector = 'Renilson | Administrador'; Phone = ''; Email = 'administracao@life.eng.br'; HasPhone = $false },
  @{ File = 'juridico'; Sector = ('Jur' + $acuteI + 'dico'); Phone = ''; Email = 'juridico@life.eng.br'; HasPhone = $false },
  @{ File = 'contato'; Sector = 'Contato'; Phone = ''; Email = 'contato@life.eng.br'; HasPhone = $false }
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

  for ($y = $Top; $y -lt $Bottom; $y++) {
    $backgroundColor = $Bitmap.GetPixel($SampleX, $y)
    $row = New-Object System.Drawing.Rectangle $Left, $y, ($SampleX - $Left), 1
    $brush = New-Object System.Drawing.SolidBrush $backgroundColor
    $Graphics.FillRectangle($brush, $row)
    $brush.Dispose()
  }
}

$original = [System.Drawing.Bitmap]::FromFile($source)
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$qualityParameters = New-Object System.Drawing.Imaging.EncoderParameters 1
$qualityParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 96L

foreach ($contact in $contacts) {
  $canvas = New-Object System.Drawing.Bitmap 2172, 724
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.DrawImage($original, (New-Object System.Drawing.Rectangle 0, 0, 2172, 724))

  Clear-TextArea $graphics $original 1010 2000 112 270

  if ($contact.HasPhone) {
    Clear-TextArea $graphics $original 1170 1900 280 380
    Clear-TextArea $graphics $original 1170 1850 375 470
    Clear-TextArea $graphics $original 1170 1600 466 580
  } else {
    # Omit the telephone row and move the original email/web badges up one row.
    Clear-TextArea $graphics $original 1010 1900 280 380
    Clear-TextArea $graphics $original 1010 1850 375 470
    Clear-TextArea $graphics $original 1010 1600 466 590

    $emailBadge = $original.Clone((New-Object System.Drawing.Rectangle 1070, 390, 100, 100), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $webBadge = $original.Clone((New-Object System.Drawing.Rectangle 1070, 490, 100, 100), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics.DrawImage($emailBadge, (New-Object System.Drawing.Rectangle 1070, 290, 100, 100))
    $graphics.DrawImage($webBadge, (New-Object System.Drawing.Rectangle 1070, 390, 100, 100))
    $emailBadge.Dispose()
    $webBadge.Dispose()
  }

  $sectorFontSize = if ($contact.Sector.Length -gt 20) { 43 } else { 49 }
  $sectorFont = New-Object System.Drawing.Font 'Arial', $sectorFontSize, ([System.Drawing.FontStyle]::Bold)
  $emailFont = New-Object System.Drawing.Font 'Arial', 28, ([System.Drawing.FontStyle]::Regular)
  $phoneFont = New-Object System.Drawing.Font 'Arial', 35, ([System.Drawing.FontStyle]::Regular)
  $siteFont = New-Object System.Drawing.Font 'Arial', 32, ([System.Drawing.FontStyle]::Bold)
  $ink = [System.Drawing.Color]::FromArgb(18, 54, 103)
  $inkBrush = New-Object System.Drawing.SolidBrush $ink

  $graphics.DrawString($contact.Sector, $sectorFont, $inkBrush, 1075, 120)
  if ($contact.HasPhone) {
    $graphics.DrawString($contact.Phone, $phoneFont, $inkBrush, 1190, 305)
    $graphics.DrawString($contact.Email, $emailFont, $inkBrush, 1190, 412)
    $graphics.DrawString('life.eng.br', $siteFont, $inkBrush, 1190, 507)
  } else {
    $graphics.DrawString($contact.Email, $emailFont, $inkBrush, 1190, 305)
    $graphics.DrawString('life.eng.br', $siteFont, $inkBrush, 1190, 412)
  }

  $output = Join-Path $destination ("assinatura-uol-{0}.jpg" -f $contact.File)
  $canvas.Save($output, $jpegCodec, $qualityParameters)

  $inkBrush.Dispose()
  $sectorFont.Dispose()
  $emailFont.Dispose()
  $phoneFont.Dispose()
  $siteFont.Dispose()
  $graphics.Dispose()
  $canvas.Dispose()
}

$qualityParameters.Dispose()
$original.Dispose()

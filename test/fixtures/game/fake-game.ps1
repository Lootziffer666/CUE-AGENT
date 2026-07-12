param(
  [ValidateSet('healthy', 'frozen', 'crash')]
  [string]$Mode = 'healthy',
  [int]$DurationSeconds = 30
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

if ($Mode -eq 'crash') {
  throw 'CUE fake-game: absichtlicher Crash-Modus'
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "CUE Fake Game ($Mode)"
$form.ClientSize = New-Object System.Drawing.Size(640, 360)
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 20, 28)
$form.KeyPreview = $true

$state = [pscustomobject]@{ X = 20; Direction = 1; Reacted = $false; Ticks = 0 }
$form.Add_KeyDown({
  if ($_.KeyCode -eq [System.Windows.Forms.Keys]::Space) {
    $state.Reacted = -not $state.Reacted
    $form.Invalidate()
  }
})
$form.Add_Paint({
  param($sender, $event)
  $brushColor = if ($state.Reacted) { [System.Drawing.Color]::Orange } else { [System.Drawing.Color]::DeepSkyBlue }
  $brush = New-Object System.Drawing.SolidBrush($brushColor)
  $event.Graphics.FillRectangle($brush, $state.X, 130, 90, 90)
  $brush.Dispose()
  $font = New-Object System.Drawing.Font('Segoe UI', 14)
  $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $event.Graphics.DrawString('CUE fake-game: Space toggles color', $font, $textBrush, 20, 20)
  $textBrush.Dispose(); $font.Dispose()
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 50
$timer.Add_Tick({
  $state.Ticks++
  if ($Mode -ne 'frozen') {
    $state.X += 8 * $state.Direction
    if ($state.X -gt 520 -or $state.X -lt 20) { $state.Direction *= -1 }
  }
  if ($state.Ticks -ge ($DurationSeconds * 20)) { $form.Close() }
  $form.Invalidate()
})
$timer.Start()
[void]$form.ShowDialog()

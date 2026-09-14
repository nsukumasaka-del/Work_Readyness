Add-Type -AssemblyName System.Drawing

function Set-LogoWhiteBackground {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Threshold = 40
  )

  $loaded = [System.Drawing.Bitmap]::FromFile($Path)
  $bmp = New-Object System.Drawing.Bitmap $loaded.Width, $loaded.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.Clear([System.Drawing.Color]::White)
  $graphics.DrawImage($loaded, 0, 0, $loaded.Width, $loaded.Height)
  $graphics.Dispose()
  $loaded.Dispose()

  $rect = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bytes = [Math]::Abs($data.Stride) * $bmp.Height
  $buffer = New-Object byte[] $bytes
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buffer, 0, $bytes)

  for ($i = 0; $i -lt $buffer.Length; $i += 4) {
    $b = $buffer[$i]
    $g = $buffer[$i + 1]
    $r = $buffer[$i + 2]
    # Any leftover near-black becomes pure white
    if ($r -le $Threshold -and $g -le $Threshold -and $b -le $Threshold) {
      $buffer[$i] = 255
      $buffer[$i + 1] = 255
      $buffer[$i + 2] = 255
      $buffer[$i + 3] = 255
    }
  }

  [System.Runtime.InteropServices.Marshal]::Copy($buffer, 0, $data.Scan0, $bytes)
  $bmp.UnlockBits($data)

  $tmp = "$Path.tmp.png"
  $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Move-Item -LiteralPath $tmp -Destination $Path -Force
  Write-Output "whitened $Path"
}

$brand = "c:\Users\preci\Work_Readyness\artifacts\careerbridge-sa\public\brand"
$srcMark = "C:\Users\preci\.cursor\projects\c-Users-preci-Work-Readyness\assets\c__Users_preci_AppData_Roaming_Cursor_User_workspaceStorage_22201ab99113144e041abf669b80f2f1_images_Bonlist_V2_MAIN-ef429809-24b7-413f-8a02-de2449e513cd.png"
$srcLogo = "C:\Users\preci\.cursor\projects\c-Users-preci-Work-Readyness\assets\c__Users_preci_AppData_Roaming_Cursor_User_workspaceStorage_22201ab99113144e041abf669b80f2f1_images_Bonlist_3_FINAL-8b5558c4-6f7c-40c3-abeb-87eb99aea5f0.png"

New-Item -ItemType Directory -Force -Path $brand | Out-Null
Copy-Item -LiteralPath $srcMark -Destination "$brand\bonlist-mark.png" -Force
Copy-Item -LiteralPath $srcLogo -Destination "$brand\bonlist-logo.png" -Force

Set-LogoWhiteBackground -Path "$brand\bonlist-mark.png"
Set-LogoWhiteBackground -Path "$brand\bonlist-logo.png"
Copy-Item "$brand\bonlist-mark.png" "c:\Users\preci\Work_Readyness\artifacts\careerbridge-sa\public\favicon.png" -Force
Write-Output "DONE"

$WshShell = New-Object -ComObject WScript.Shell
$desktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
$shortcutPath = [System.IO.Path]::Combine($desktopPath, "HesaTech.lnk")
$targetExe = "C:\Users\Green\openclaw\jarvis-command-center\dist\win-unpacked\HesaTech.exe"

$Shortcut = $WshShell.CreateShortcut($shortcutPath)
$Shortcut.TargetPath = $targetExe
$Shortcut.WorkingDirectory = "C:\Users\Green\openclaw\jarvis-command-center\dist\win-unpacked"
$Shortcut.Description = "HesaTech - Executive Windows AI Assistant"
$Shortcut.Save()

Write-Host "Updated HesaTech Desktop Shortcut targeting: $targetExe"

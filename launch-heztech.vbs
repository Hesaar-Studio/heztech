Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Green\openclaw\jarvis-command-center"
WshShell.Run "cmd /c .\node_modules\.bin\electron.cmd .", 0, False

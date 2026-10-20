' Launch the Buzz host-proxy with no visible console window.
Set sh = CreateObject("WScript.Shell")
sh.Run """C:\Program Files\nodejs\node.exe"" ""C:\Users\jfdjy\buzz-tunnel\buzz-host-proxy.js""", 0, False

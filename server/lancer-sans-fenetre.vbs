Set WshShell = CreateObject("WScript.Shell")
base = "C:\sedectous\Fenemof"
py = "C:\Python314\python.exe"
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(py) Then
  py = "C:\Python313\python.exe"
End If
If Not fso.FileExists(py) Then
  py = "C:\Python312\python.exe"
End If
If Not fso.FileExists(py) Then
  py = "python"
End If
WshShell.Environment("PROCESS")("PORT") = "8000"
WshShell.Environment("PROCESS")("HOST") = "0.0.0.0"
WshShell.Environment("PROCESS")("PYTHONUNBUFFERED") = "1"
WshShell.Run Chr(34) & py & Chr(34) & " server\server.py", 0, False
WScript.Sleep 3000
WshShell.Run Chr(34) & py & Chr(34) & " server\watchdog.py", 0, False

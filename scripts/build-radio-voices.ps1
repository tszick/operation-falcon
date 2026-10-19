param([Parameter(Mandatory=$true)][string]$RawDirectory, [string[]]$OnlyIds=@())
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$falconRoot = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path $RawDirectory | Out-Null
$falconLines = Get-Content -LiteralPath (Join-Path $falconRoot 'assets/radio/script.json') -Raw | ConvertFrom-Json
$falconFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$falconCreated = 0
foreach ($falconLine in $falconLines) {
 if ($OnlyIds.Count -and $falconLine.id -notin $OnlyIds) { continue }
 $falconCreated++
 $falconSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
 try {
  $falconSynth.SelectVoice($falconLine.voice)
  $falconSynth.Rate = $falconLine.rate
  $falconSynth.Volume = 100
  $falconSynth.SetOutputToWaveFile((Join-Path $RawDirectory ($falconLine.id + '.wav')), $falconFormat)
  $falconSynth.Speak($falconLine.text)
 } catch {
  # OneCore voices can exist without legacy System.Speech registration. Bind the
  # installed token directly for offline synthesis; never change registry settings.
  $falconTokenName = switch ($falconLine.voice) {
   'Microsoft David Desktop' { 'MSTTS_V110_enUS_DavidM' }
   'Microsoft Mark' { 'MSTTS_V110_enUS_MarkM' }
   'Microsoft Zira Desktop' { 'MSTTS_V110_enUS_ZiraM' }
   default { throw }
  }
  $falconSapi = New-Object -ComObject SAPI.SpVoice
  $falconToken = New-Object -ComObject SAPI.SpObjectToken
  $falconStream = New-Object -ComObject SAPI.SpFileStream
  try {
   $falconToken.SetId(('HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\' + $falconTokenName))
   $falconSapi.Voice = $falconToken
   $falconSapi.Rate = $falconLine.rate
   $falconSapi.Volume = 100
   $falconStream.Format.Type = 22 # 22050 Hz, 16-bit, mono
   $falconStream.Open((Join-Path $RawDirectory ($falconLine.id + '.wav')), 3, $false)
   $falconSapi.AudioOutputStream = $falconStream
   $falconSapi.Speak($falconLine.text, 0) | Out-Null
  } finally {
   $falconStream.Close()
   [void][Runtime.InteropServices.Marshal]::ReleaseComObject($falconStream)
   [void][Runtime.InteropServices.Marshal]::ReleaseComObject($falconToken)
   [void][Runtime.InteropServices.Marshal]::ReleaseComObject($falconSapi)
  }
 } finally { $falconSynth.Dispose() }
}
Write-Output ('Created ' + $falconCreated + ' dry English voice recordings.')

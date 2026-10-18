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
 } finally { $falconSynth.Dispose() }
}
Write-Output ('Created ' + $falconCreated + ' dry English voice recordings.')

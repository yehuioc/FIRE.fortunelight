param([string]$Voice = 'Microsoft Yaoyao')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$demoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$story = Get-Content -LiteralPath (Join-Path $demoRoot 'story.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.SelectVoice($Voice)
    $speaker.Rate = 0
    for ($i = 0; $i -lt $story.scenes.Count; $i++) {
        for ($j = 0; $j -lt $story.scenes[$i].subtitle.Count; $j++) {
            $path = Join-Path $demoRoot ('.work\voice-{0:d2}-{1}.wav' -f $i, $j)
            $speaker.SetOutputToWaveFile($path)
            $speaker.Speak($story.scenes[$i].subtitle[$j])
            $speaker.SetOutputToNull()
        }
        Write-Output ('配音完成：' + $story.scenes[$i].id)
    }
} finally {
    $speaker.Dispose()
}

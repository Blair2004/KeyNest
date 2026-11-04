$ErrorActionPreference = "Stop"

$projectPath = Join-Path $PSScriptRoot "desktop\KeynestAuthenticator.csproj"
$outputPath = Join-Path $PSScriptRoot "publish\win-x64"

dotnet publish $projectPath --configuration Release --runtime win-x64 --self-contained true --output $outputPath

Write-Host ""
Write-Host "Keynest is ready:"
Write-Host (Join-Path $outputPath "KeynestAuthenticator.exe")

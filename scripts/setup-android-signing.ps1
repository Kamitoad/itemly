param(
    [switch]$Upload,
    [string]$OpenSslPath = 'C:\Program Files\Git\usr\bin\openssl.exe'
)
$ErrorActionPreference = 'Stop'
$repoDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$signingDirectory = Join-Path $repoDirectory '.local\signing'
$keyPath = Join-Path $signingDirectory 'itemly-preview.p12'
$credentialsPath = Join-Path $signingDirectory 'credentials.json'
if (!(Test-Path -LiteralPath $OpenSslPath)) { throw 'OpenSSL is required (included with Git for Windows). Pass -OpenSslPath if installed elsewhere.' }

function Assert-Exit([string]$operation) { if ($LASTEXITCODE -ne 0) { throw "$operation failed. No key has been replaced." } }

function Set-SecretWithoutNewline([string]$name, [string]$value) {
    # stdin avoids secrets in command arguments and PowerShell's CRLF pipeline.
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = (Get-Command gh).Source
    $startInfo.Arguments = "secret set $name --repo Kamitoad/itemly"
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $process = [Diagnostics.Process]::Start($startInfo)
    try {
        $process.StandardInput.Write($value)
        $process.StandardInput.Close()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "GitHub secret upload failed for $name. Keep the original local key for recovery." }
    } finally { $process.Dispose() }
}

# Refuse partial state: never accidentally rotate the key used by installed APKs.
if ((Test-Path -LiteralPath $keyPath) -xor (Test-Path -LiteralPath $credentialsPath)) { throw 'Incomplete local signing setup. Recover the original key and password instead of generating a replacement.' }
if (!(Test-Path -LiteralPath $keyPath)) {
    New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    # Modify only the DACL; Set-Acl can attempt privileged SACL operations.
    & icacls $signingDirectory /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
    Assert-Exit 'Signing directory protection'
    $randomBytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($randomBytes); $rng.Dispose()
    $password = [Convert]::ToBase64String($randomBytes)
    $privatePath = Join-Path $signingDirectory 'temporary-key.pem'
    $certificatePath = Join-Path $signingDirectory 'temporary-certificate.pem'
    try {
        $env:ITEMLY_SETUP_PASSWORD = $password
        # Windows PowerShell 5 treats OpenSSL's progress on stderr as errors.
        # Suppress only that progress; still check the actual process exit code.
        $ErrorActionPreference = 'Continue'
        try {
            & $OpenSslPath req -x509 -newkey rsa:3072 -sha256 -days 10000 -subj '/CN=Itemly Preview/O=Kamitoad' -keyout $privatePath -out $certificatePath -passout env:ITEMLY_SETUP_PASSWORD 2>$null
        } finally { $ErrorActionPreference = 'Stop' }
        Assert-Exit 'Signing certificate generation'
        & $OpenSslPath pkcs12 -export -inkey $privatePath -in $certificatePath -name itemly-preview -out $keyPath -passin env:ITEMLY_SETUP_PASSWORD -passout env:ITEMLY_SETUP_PASSWORD
        Assert-Exit 'Keystore generation'
        @{ password = $password; alias = 'itemly-preview' } | ConvertTo-Json | Set-Content -LiteralPath $credentialsPath -Encoding UTF8
    } finally {
        Remove-Item Env:ITEMLY_SETUP_PASSWORD -ErrorAction SilentlyContinue
        # Only these two explicitly named temporary files in the checked workspace.
        foreach ($temporaryPath in @($privatePath, $certificatePath)) {
            if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath }
        }
    }
}

if ($Upload) {
    $existing = & gh secret list --repo Kamitoad/itemly --json name
    Assert-Exit 'GitHub secret lookup'
    $names = @($existing | ConvertFrom-Json | ForEach-Object { $_.name })
    if ($names -contains 'ITEMLY_ANDROID_KEYSTORE_BASE64' -or $names -contains 'ITEMLY_ANDROID_KEYSTORE_PASSWORD') {
        throw 'Signing secrets already exist. Refusing to overwrite a potentially different installation identity.'
    }
    $credentials = Get-Content -LiteralPath $credentialsPath -Raw | ConvertFrom-Json
    Set-SecretWithoutNewline 'ITEMLY_ANDROID_KEYSTORE_BASE64' ([Convert]::ToBase64String([IO.File]::ReadAllBytes($keyPath)))
    Set-SecretWithoutNewline 'ITEMLY_ANDROID_KEYSTORE_PASSWORD' $credentials.password
    Write-Output 'Two signing secrets configured. No APK build has been triggered.'
}
Write-Output 'Keep a secure, independent copy of .local/signing (keystore AND credentials). Losing them prevents future updates. Never commit or share this directory.'

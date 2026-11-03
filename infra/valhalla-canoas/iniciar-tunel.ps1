param(
    [Parameter(Mandatory = $true)]
    [string]$TokenFile
)
$ErrorActionPreference = 'Stop'
# Token comes from a named Cloudflare Tunnel configured for localhost:8003.
# Never pass the token itself on the command line or save it in this repository.
$resolvedToken = (Resolve-Path -LiteralPath $TokenFile).Path
if ((Get-Item -LiteralPath $resolvedToken).Length -lt 32) { throw 'Arquivo de token inválido.' }
$cloudflared = (Get-Command cloudflared.exe -ErrorAction Stop).Source
& $cloudflared tunnel --no-autoupdate run --token-file $resolvedToken
if ($LASTEXITCODE -ne 0) { throw 'O túnel Cloudflare não iniciou.' }

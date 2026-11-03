$ErrorActionPreference = 'Stop'
$payload = @{
    locations = @(
        @{ lat = -29.9189; lon = -51.1781 },
        @{ lat = -29.9239; lon = -51.1826 }
    )
    costing = 'motorcycle'
    units = 'kilometers'
    language = 'pt-BR'
} | ConvertTo-Json -Depth 5
$result = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8002/route' -ContentType 'application/json' -Body $payload -TimeoutSec 30
if ($result.trip.status -ne 0 -or !$result.trip.legs.Count) { throw 'O servidor não retornou uma rota válida.' }
[pscustomobject]@{
    Quilometros = $result.trip.summary.length
    Minutos = [math]::Round($result.trip.summary.time / 60, 1)
    Trechos = $result.trip.legs.Count
}

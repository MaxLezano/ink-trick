# ==============================================================================
# InkTrick OS - Convierte cualquier tablet Android en un lector dedicado InkTrick
# ==============================================================================
# Uso (PowerShell, desde la carpeta del proyecto, con la tablet conectada por USB
# y la depuración USB activada):
#
#   .\setup-tablet.ps1                  Instala y activa InkTrick OS
#   .\setup-tablet.ps1 -Build           Fuerza compilar el APK antes de instalar
#   .\setup-tablet.ps1 -Serial XXXX     Elige la tablet si hay varias conectadas
#   .\setup-tablet.ps1 -Remove          Desactiva InkTrick OS (vuelve a Android normal)
#
# Requisitos de Android para el modo dedicado (Device Owner):
#   - Android 7 o superior.
#   - Sin cuentas (Google, Samsung, etc.) ni usuarios secundarios mientras se activa.
#     Después puedes volver a agregar tu cuenta de Google desde InkTrick.
#   - Sin PIN, patrón ni contraseña de bloqueo (InkTrick usa su propia pantalla de reposo).
# ==============================================================================

param(
    [string]$Serial,
    [switch]$Build,
    [switch]$Remove
)

$ErrorActionPreference = 'Continue'
$Package = 'com.lezma.InkTrick'
$Admin = "$Package/.AdminReceiver"
$Receiver = "$Package/.KioskCommandReceiver"
$ApkPath = Join-Path $PSScriptRoot 'android\app\build\outputs\apk\release\inkTrick.apk'

function Step($text) { Write-Host "`n$text" -ForegroundColor Yellow }
function Ok($text) { Write-Host "  OK  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  !!  $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "  XX  $text" -ForegroundColor Red; exit 1 }
function Ask($text) { (Read-Host "  ?   $text (S/N)") -match '^[sSyY]' }
function Shell([string]$cmd) { (& adb -s $script:Device shell $cmd 2>&1 | Out-String).Trim() }

Write-Host '=====================================================' -ForegroundColor Cyan
Write-Host '   InkTrick OS - Lector dedicado para tablets        ' -ForegroundColor Cyan
Write-Host '=====================================================' -ForegroundColor Cyan

# --- adb y dispositivo --------------------------------------------------------
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    Fail 'No se encuentra adb. Instala Android Platform Tools y agrega su carpeta al PATH.'
}
$devices = @(adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "`tdevice$" } | ForEach-Object { ($_ -split "`t")[0] })
$unauthorized = @(adb devices | Where-Object { $_ -match "`t(unauthorized|offline)$" })
if ($Serial) {
    if ($devices -notcontains $Serial) { Fail "La tablet $Serial no está conectada (o no autorizó la depuración USB)." }
    $script:Device = $Serial
} elseif ($devices.Count -eq 1) {
    $script:Device = $devices[0]
} elseif ($devices.Count -gt 1) {
    Write-Host '  Hay varias tablets conectadas:'
    for ($i = 0; $i -lt $devices.Count; $i++) {
        $m = (& adb -s $devices[$i] shell getprop ro.product.model 2>$null | Out-String).Trim()
        Write-Host "   [$i] $($devices[$i])  $m"
    }
    $script:Device = $devices[[int](Read-Host '  ?   Número de la tablet')]
} else {
    if ($unauthorized) { Warn 'La tablet está conectada pero no autorizada: acepta el aviso "Permitir depuración por USB" en la pantalla.' }
    Write-Host @'
  Para conectar la tablet:
   1. Conéctala a la computadora con el cable USB.
   2. Ajustes > Acerca de la tablet: toca 7 veces "Número de compilación".
   3. Ajustes > Sistema > Opciones de desarrollador: activa "Depuración por USB".
      (Xiaomi / POCO: activa también "Depuración USB (ajustes de seguridad)").
   4. Acepta el aviso "Permitir depuración por USB" en la tablet.
'@
    exit 1
}

$brand = Shell 'getprop ro.product.manufacturer'
$model = Shell 'getprop ro.product.model'
$release = Shell 'getprop ro.build.version.release'
$sdk = [int](Shell 'getprop ro.build.version.sdk')
Ok "Tablet: $brand $model (Android $release, SDK $sdk, $script:Device)"
if ($sdk -lt 24) { Fail 'InkTrick necesita Android 7 o superior.' }

$owner = Shell 'dumpsys device_policy'
$isOurs = $owner -match [regex]::Escape("admin=ComponentInfo{$Package/$Package.AdminReceiver}")

# --- Desactivar ---------------------------------------------------------------
if ($Remove) {
    Step 'Desactivando InkTrick OS...'
    if (-not $isOurs) { Warn 'InkTrick no es el administrador de esta tablet: no hay nada que desactivar.'; exit 0 }
    $out = Shell "am broadcast -a com.lezma.InkTrick.RELEASE_KIOSK -n $Receiver"
    if ($out -match 'data="released"') { Ok 'Modo dedicado desactivado. La tablet vuelve a ser Android normal.' }
    else { Fail "No se pudo desactivar: $out" }
    if (Ask '¿Quieres desinstalar InkTrick también? Se borran sus datos (exporta un respaldo antes desde "Mi lectura").') {
        adb -s $script:Device uninstall $Package | Out-Null
        Ok 'InkTrick desinstalado.'
    }
    exit 0
}

# --- Requisitos del Device Owner ----------------------------------------------
Step '[1/5] Revisando requisitos...'
if ($owner -match 'Device Owner:' -and -not $isOurs) {
    Fail 'Esta tablet ya tiene otro administrador (empresa / control parental). Quítalo o restablece la tablet de fábrica.'
}
if (-not $isOurs) {
    $users = Shell 'pm list users'
    $secondary = @([regex]::Matches($users, 'UserInfo\{(\d+):') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -ne '0' })
    if ($secondary.Count -gt 0) {
        Warn "Hay usuarios o perfiles secundarios (IDs: $($secondary -join ', ')). Android no permite el modo dedicado con ellos."
        if (Ask '¿Los elimino? Se borran sus datos.') {
            foreach ($u in $secondary) { Shell "pm remove-user $u" | Out-Null }
            Ok 'Usuarios secundarios eliminados.'
        } else { exit 1 }
    }
    $accounts = @([regex]::Matches((Shell 'dumpsys account'), 'Account \{name=([^,]+), type=([^}]+)\}') | ForEach-Object { "$($_.Groups[1].Value) ($($_.Groups[2].Value))" } | Select-Object -Unique)
    if ($accounts.Count -gt 0) {
        Warn 'Android exige que la tablet no tenga cuentas al activar el modo dedicado. Cuentas encontradas:'
        $accounts | ForEach-Object { Write-Host "       $_" }
        Write-Host '       Quítalas en Ajustes > Cuentas (tus datos en la nube no se pierden).'
        Write-Host '       Al terminar puedes volver a agregar Google desde InkTrick: avatar > Perfil.'
        if (-not (Ask '¿Ya quitaste las cuentas?')) { exit 1 }
    }
}
$lock = Shell 'locksettings verify'
if ($lock -notmatch 'verified successfully') {
    Warn 'La tablet tiene PIN, patrón o contraseña. Quítalo en Ajustes > Seguridad > Bloqueo de pantalla: "Ninguno".'
    if (-not (Ask '¿Ya lo quitaste?')) { exit 1 }
}
Ok 'Requisitos listos.'

# --- APK -----------------------------------------------------------------------
Step '[2/5] Preparando InkTrick...'
$stale = $true
if (Test-Path $ApkPath) {
    $apkTime = (Get-Item $ApkPath).LastWriteTime
    $newest = Get-ChildItem -Recurse -File (Join-Path $PSScriptRoot 'src'), (Join-Path $PSScriptRoot 'android\app\src'), (Join-Path $PSScriptRoot 'assets') |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $stale = $newest.LastWriteTime -gt $apkTime
}
if ($Build -or $stale) {
    Write-Host '  Compilando el APK (la primera vez tarda unos 10 minutos)...'
    Push-Location (Join-Path $PSScriptRoot 'android')
    & .\gradlew.bat assembleRelease --quiet
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Fail 'Falló la compilación del APK.' }
}
$install = (& adb -s $script:Device install -r -g $ApkPath 2>&1 | Out-String)
if ($install -notmatch 'Success') {
    if ($install -match 'UPDATE_INCOMPATIBLE') {
        Fail 'Ya hay un InkTrick instalado con otra firma. Exporta un respaldo desde "Mi lectura", desinstálalo y vuelve a ejecutar el script.'
    }
    Fail "Falló la instalación: $install"
}
Ok 'InkTrick instalado.'

# --- Device Owner ---------------------------------------------------------------
Step '[3/5] Activando el modo dedicado...'
if ($isOurs) {
    Ok 'InkTrick ya es el administrador de la tablet.'
} else {
    $dpm = Shell "dpm set-device-owner $Admin"
    if ($dpm -match 'Success') { Ok 'InkTrick es ahora el administrador de la tablet.' }
    else {
        Write-Host "       $dpm"
        if ($dpm -match 'account') { Fail 'Todavía hay una cuenta en la tablet. Quítala en Ajustes > Cuentas.' }
        if ($dpm -match 'user') { Fail 'Hay usuarios secundarios o un perfil de trabajo. Elimínalos.' }
        if ($dpm -match 'provisioned') { Fail 'Android ya completó una configuración incompatible. Restablece la tablet de fábrica y, sin agregar cuentas, vuelve a ejecutar el script.' }
        Fail 'No se pudo activar el modo dedicado.'
    }
}

# --- Ajustes que solo adb puede conceder ---------------------------------------
Step '[4/5] Configurando el sistema...'
# Escribir ajustes del sistema: rotación vertical para el selector de carpetas, Drive y Ajustes.
Shell "appops set $Package WRITE_SETTINGS allow" | Out-Null
# Transferencia de archivos (MTP) automática al conectar el cable (Android 9+).
if ($sdk -ge 28) { Shell 'svc usb setScreenUnlockedFunctions mtp' | Out-Null }
# Que Android no cierre InkTrick en reposo.
Shell "dumpsys deviceidle whitelist +$Package" | Out-Null
# Ubicación encendida: Android la exige para buscar redes Wi-Fi.
if ($sdk -ge 29) { Shell 'settings put secure location_mode 3' | Out-Null }
else { Shell 'settings put secure location_providers_allowed +network' | Out-Null }
Shell 'settings put global device_provisioned 1' | Out-Null
Shell 'settings put secure user_setup_complete 1' | Out-Null
Ok 'Sistema configurado.'

# --- Inicio -----------------------------------------------------------------------
Step '[5/5] Iniciando InkTrick OS...'
Shell "am start -n $Package/.MainActivity" | Out-Null
Start-Sleep -Seconds 3
$apply = Shell "am broadcast -a com.lezma.InkTrick.REAPPLY_KIOSK -n $Receiver"
if ($apply -match 'data="applied"') { Ok 'Políticas aplicadas.' } else { Warn "No se confirmaron las políticas: $apply" }

Write-Host "`n=====================================================" -ForegroundColor Green
Write-Host '   Listo: la tablet ahora es un lector InkTrick' -ForegroundColor Green
Write-Host '=====================================================' -ForegroundColor Green
Write-Host '  - Siempre en vertical (el lector puede girar con "Giro automático").'
Write-Host '  - Al apagar la pantalla se muestra la pantalla de reposo de InkTrick.'
Write-Host '  - Wi-Fi, brillo, apagado de pantalla, Drive y USB: toca tu avatar.'
Write-Host '  - Mantenimiento: mantén presionado "Ajustes rápidos" (Ajustes de Android o desactivar).'
Write-Host '  - Para desactivarlo desde la computadora: .\setup-tablet.ps1 -Remove'

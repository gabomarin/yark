param(
  [Parameter(Mandatory)][int]$RootProcessId,
  [Parameter(Mandatory)][string]$Label,
  [Parameter(Mandatory)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
# Read OS counters without attaching a debugger to the measured renderer.
$collectionMode = 'cim'
try {
  $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction Stop)
} catch {
  # Some locked-down Windows runners deny CIM/WMI access. Keep the benchmark
  # useful by falling back to Get-Process; the fallback reports aggregate
  # working set/private commit and leaves role-specific private WS unknown.
  $collectionMode = 'get-process'
  $root = Get-Process -Id $RootProcessId -ErrorAction Stop
  $rootPath = $root.Path
  $processes = @(Get-Process | Where-Object {
    $_.Id -eq $RootProcessId -or ($rootPath -and $_.Path -eq $rootPath)
  })
  $rows = @(foreach ($entry in $processes) {
    [pscustomobject]@{
      pid = [int]$entry.Id
      role = if ($entry.Id -eq $RootProcessId) { 'main' } else { 'renderer-or-helper' }
      workingSetBytes = [long]$entry.WorkingSet64
      privateWorkingSetBytes = $null
      privateCommitBytes = [long]$entry.PrivateMemorySize64
    }
  })
  $snapshot = [pscustomobject]@{
    label = $Label
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    rootProcessId = $RootProcessId
    collectionMode = $collectionMode
    processes = $rows
  }
  $snapshot | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutputPath -Encoding utf8
  $rows | Select-Object role,pid,@{n='WS_MiB';e={[math]::Round($_.workingSetBytes/1MB,2)}},@{n='PrivateWS_MiB';e={'n/a'}},@{n='Commit_MiB';e={[math]::Round($_.privateCommitBytes/1MB,2)}} | Format-Table -AutoSize
  exit 0
}
$rootProcess = $allProcesses | Where-Object ProcessId -EQ $RootProcessId
if (-not $rootProcess) { throw "Measured root process has exited: $RootProcessId" }
$ids = [Collections.Generic.HashSet[int]]::new()
[void]$ids.Add($RootProcessId)
do {
  $added = $false
  foreach ($entry in $allProcesses) {
    if ($ids.Contains([int]$entry.ParentProcessId) -and $ids.Add([int]$entry.ProcessId)) { $added = $true }
  }
} while ($added)
$counters = @(Get-CimInstance Win32_PerfRawData_PerfProc_Process | Where-Object { $ids.Contains([int]$_.IDProcess) })
$rows = @(foreach ($entry in $allProcesses | Where-Object { $ids.Contains([int]$_.ProcessId) }) {
  $counter = $counters | Where-Object IDProcess -EQ $entry.ProcessId | Select-Object -First 1
  if (-not $counter) { throw "Missing counters for process $($entry.ProcessId)" }
  $role = if ($entry.ProcessId -eq $RootProcessId) { 'main' }
    elseif ($entry.CommandLine -match '--type=renderer') { 'renderer' }
    elseif ($entry.CommandLine -match '--type=gpu-process') { 'gpu' }
    else { 'utility' }
  [pscustomobject]@{
    pid = [int]$entry.ProcessId
    role = $role
    workingSetBytes = [long]$counter.WorkingSet
    privateWorkingSetBytes = [long]$counter.WorkingSetPrivate
    privateCommitBytes = [long]$counter.PrivateBytes
  }
})
$snapshot = [pscustomobject]@{
  label = $Label
  capturedAt = (Get-Date).ToUniversalTime().ToString('o')
  rootProcessId = $RootProcessId
  collectionMode = $collectionMode
  processAgeSeconds = [math]::Round(((Get-Date) - $rootProcess.CreationDate).TotalSeconds, 2)
  processes = $rows
}
$snapshot | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutputPath -Encoding utf8
$rows | Select-Object role,pid,@{n='WS_MiB';e={[math]::Round($_.workingSetBytes/1MB,2)}},@{n='PrivateWS_MiB';e={[math]::Round($_.privateWorkingSetBytes/1MB,2)}},@{n='Commit_MiB';e={[math]::Round($_.privateCommitBytes/1MB,2)}} | Format-Table -AutoSize

$files = Get-ChildItem ".\supabase\migrations\*.sql"
$versionMap = @{}

foreach ($file in $files) {
    if ($file.Name -match '^(\d{8})(_(?:.*))$') {
        $baseDate = $matches[1]
        $suffix = $matches[2]
        
        if (-not $versionMap.ContainsKey($baseDate)) {
            $versionMap[$baseDate] = 0
        }
        $counter = $versionMap[$baseDate]
        $versionMap[$baseDate]++
        
        # Pad counter to 6 digits, e.g., 000001
        $paddedCounter = "{0:D6}" -f $counter
        $newVersion = "$baseDate$paddedCounter"
        $newName = "$newVersion$suffix"
        
        # Rename the file
        Write-Host "Renaming $($file.Name) to $newName"
        Rename-Item -Path $file.FullName -NewName $newName
        
        # Run repair
        Write-Host "Repairing $newVersion"
        npx supabase migration repair --status applied $newVersion
    }
}
Write-Host "Done normalizing all 8-digit migrations!"

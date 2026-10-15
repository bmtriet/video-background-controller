-- Arguments are passed through execFile, never interpolated into script source.
-- Only the uploaded test deck and the dedicated test-stage Chrome window are
-- addressed. Existing PowerPoint presentations and Chrome windows are retained.
on run argv
  set actionName to item 1 of argv
  if actionName is "stage" then
    set stageURL to item 2 of argv
    set targetBounds to {(item 3 of argv) as integer, (item 4 of argv) as integer, (item 5 of argv) as integer, (item 6 of argv) as integer}
    tell application "Google Chrome"
      set stageWindow to missing value
      repeat with candidate in windows
        repeat with candidateTab in tabs of candidate
          if URL of candidateTab is stageURL then set stageWindow to candidate
        end repeat
      end repeat
      if stageWindow is missing value then
        set stageWindow to make new window
        set URL of active tab of stageWindow to stageURL
      end if
      set bounds of stageWindow to targetBounds
      set index of stageWindow to 1
      activate
    end tell
    return "stage opened"
  end if
  error "Unsupported Chrome action"
end run

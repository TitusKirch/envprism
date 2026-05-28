# envprism README demo — rendered with VHS (https://github.com/charmbracelet/vhs)
#
# Regenerate (no local install needed, Docker only):
#   docker build -f .github/assets/vhs.Dockerfile -t envprism-vhs .
#   docker run --rm -v "$PWD:/vhs" envprism-vhs .github/assets/demo.tape
#
# Edit the choreography below, re-run, commit the new GIF. The tape is the
# source of truth — don't hand-edit the GIF.

Output .github/assets/demo.gif

Set FontSize 20
Set Width 1920
Set Height 1080
Set Padding 16
# 1080p repaints can't sustain VHS's default 50fps capture, which drops frames
# and speeds up playback — cap the capture rate to something the TUI can hold.
Set Framerate 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 55ms

# --- setup (hidden): work on a throwaway copy so saves don't dirty the repo ---
Hide
Type "cp -r /vhs/examples /tmp/demo && bun /vhs/dist/bin/envprism.mjs tui /tmp/demo"
Enter
Sleep 2.5s
Show

# --- the matrix is up: let it land ---
Sleep 1.8s

# move to APP_URL in the .env.production column and edit it in place
Down@250ms 2
Right@250ms 2
Sleep 700ms
Type "e"
Sleep 800ms
# the popover pre-fills the current value — clear it first (backspace is a
# no-op on an empty field, so over-counting is safe)
Backspace@25ms 40
Sleep 300ms
Type "https://envprism.app"
Sleep 900ms
Enter
Sleep 1s

# save every dirty file
Ctrl+S
Sleep 1.4s

# drift-only view: hide everything that already agrees with base
Type "v"
Sleep 1.8s
Type "v"
Sleep 800ms

# keybinding overlay, then back to the matrix for the final frame
Type "?"
Sleep 2s
Type "?"
Sleep 1.5s

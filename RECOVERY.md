# Lappy kiosk recovery

The kiosk units are currently installed and enabled on the inspected Pi. Building
Lappy by itself does not install them. If the UI fails, use one of these recovery
paths.

## From another computer over SSH

```bash
ssh terminal@raspberrypi.local
systemctl --user stop lappy-kiosk.service
systemctl --user stop lappy.service
```

The normal Raspberry Pi desktop remains underneath the kiosk window.

## From the attached keyboard

1. Press `Ctrl+Alt+F2` to switch to a text console.
2. Log in as `terminal`.
3. Stop the kiosk:

```bash
systemctl --user stop lappy-kiosk.service
```

4. Return to the desktop VT with `Ctrl+Alt+F7` (on some installations use
   `Ctrl+Alt+F1`).

## Disable automatic startup

```bash
systemctl --user disable --now lappy-kiosk.service lappy.service
```

This does not delete settings, recordings, or project files.

## View logs

```bash
journalctl --user -u lappy.service -u lappy-kiosk.service -b --no-pager
```

Logs intentionally omit gateway credentials, request bodies, camera frames,
microphone recordings, and tool payloads.

## Remove the installed user units

Stop and disable them first, then move the two unit files out of the user unit
directory and reload systemd:

```bash
systemctl --user disable --now lappy-kiosk.service lappy.service
mkdir -p "$HOME/.local/share/Trash/files/lappy-units"
mv "$HOME/.config/systemd/user/lappy.service" "$HOME/.local/share/Trash/files/lappy-units/"
mv "$HOME/.config/systemd/user/lappy-kiosk.service" "$HOME/.local/share/Trash/files/lappy-units/"
systemctl --user daemon-reload
```

If the installer backed up earlier unit files, their `.backup-YYYYMMDD-HHMMSS`
copies remain beside the installed units until you restore or archive them.

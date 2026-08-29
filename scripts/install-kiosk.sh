#!/bin/sh
set -eu

mode="${1:---dry-run}"
case "$mode" in
  --dry-run|--apply|--enable) ;;
  *) echo "Usage: $0 [--dry-run|--apply|--enable]" >&2; exit 2 ;;
esac

project_dir=/home/terminal/Lappy
unit_dir=/home/terminal/.config/systemd/user
stamp=$(date +%Y%m%d-%H%M%S)

echo "Planned user-level changes:"
echo "  $project_dir/deploy/systemd/lappy.service -> $unit_dir/lappy.service"
echo "  $project_dir/deploy/systemd/lappy-kiosk.service -> $unit_dir/lappy-kiosk.service"
echo "Existing destination files, if any, will be backed up with .backup-$stamp."

if [ "$mode" = "--dry-run" ]; then
  echo "No files changed. Run with --apply to install disabled units or --enable to install and enable them."
  exit 0
fi

/usr/bin/mkdir -p "$unit_dir"
/usr/bin/mkdir -p /home/terminal/.config/lappy
for name in lappy.service lappy-kiosk.service; do
  destination="$unit_dir/$name"
  if [ -e "$destination" ]; then
    /usr/bin/cp -a "$destination" "$destination.backup-$stamp"
  fi
  /usr/bin/install -m 0644 "$project_dir/deploy/systemd/$name" "$destination"
done

/usr/bin/systemctl --user daemon-reload
echo "Units installed. No system files, LightDM files, or labwc files were changed."

if [ "$mode" = "--enable" ]; then
  /usr/bin/systemctl --user enable --now lappy.service lappy-kiosk.service
  echo "Lappy application and kiosk services enabled for this user."
else
  echo "Units remain disabled. Review them, then run: $0 --enable"
fi

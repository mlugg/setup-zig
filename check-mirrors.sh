#!/bin/sh

temp_path="$(mktemp)"
summary_file=${GITHUB_STEP_SUMMARY:-check-mirror-summary.md}
time_file="$(mktemp)"
zig_version="$(curl -sSL 'https://ziglang.org/download/index.json' | jq -r '.master.version')"
filename="zig-linux-x86_64-$zig_version.tar.xz"

curl -L "https://ziglang.org/builds/$filename" >"$temp_path"
correct_sum="$(sha512sum "$temp_path")"

echo "| Mirror | URL | Cost(seconds) |" >> "${summary_file}"
echo "|:-:|:-:|:-:|" >> "${summary_file}"
jq '.[] | .[0] + " " + .[1]' -r <mirrors.json | while read -r mirror_url mirror_name; do
	curl -w "%{time_total}" -L "$mirror_url/$filename" -o "$temp_path" >"${time_file}"
	download_status="$?"
	echo "| ${mirror_name} | ${mirror_url} | $(cat ${time_file}) |" >>"${summary_file}"
	mirror_sum="$(sha512sum "$temp_path")"

	if [ "$download_status" -eq 0 ]; then
		if [ "$mirror_sum" = "$correct_sum" ]; then
			continue
		fi
	fi

	curl -s \
		-F user="$PUSHOVER_USER" -F token="$PUSHOVER_TOKEN" \
		-F message="Zig download mirror '$mirror_name' is down" \
		https://api.pushover.net/1/messages.json
done

rm "$temp_path" "$time_file"

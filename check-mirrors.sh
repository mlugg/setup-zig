#!/bin/sh

summary_path="${GITHUB_STEP_SUMMARY:-check-mirrors-summary.md}"
temp_path="$(mktemp)"

zig_version="$(curl -sSL 'https://ziglang.org/download/index.json' | jq -r '.master.version')"
filename="zig-x86_64-linux-$zig_version.tar.xz"

curl -L "https://ziglang.org/builds/$filename" >"$temp_path"
correct_sum="$(sha512sum "$temp_path")"

rm "$summary_path"

echo "| URL | Owner | Result | Time (s) |" >>"$summary_path"
echo "|:----|:------|:-------|---------:|" >>"$summary_path"

jq '.[] | .[0] + " " + .[1]' -r <mirrors.json | while read -r mirror_url mirror_name; do
	time_secs="$(curl -w "%{time_total}" -L "$mirror_url/$filename" -o "$temp_path")"
	download_status="$?"

	if [ "$download_status" -eq 0 ]; then
		mirror_sum="$(sha512sum "$temp_path")"
		if [ "$mirror_sum" = "$correct_sum" ]; then
			err="" # success
		else
			err="checksum mismatch: $mirror_sum (expected $correct_sum)"
		fi
	else
		err="curl exit status: $download_status"
	fi

	md_time_secs="$(printf '`%0.2f`' "$time_secs")" # 2dp, backticks
	md_mirror_name="$(echo "$mirror_name" | sed -e 's/[<>]/\\\0/g')" # backslash-prefix angle brackets
	md_status="$(if [ "$err" = "" ]; then echo ":white_check_mark:"; else echo ":warning: \`$err\`"; fi)" # tick or cross for success
	echo "| $mirror_url | $md_mirror_name | $md_status | $md_time_secs |" >>"$summary_path"

	if [ "$err" = "" ]; then
		continue # success
	fi

	curl -s \
		-F user="$PUSHOVER_USER" -F token="$PUSHOVER_TOKEN" \
		-F message="Zig download mirror '$mirror_name' is down" \
		https://api.pushover.net/1/messages.json
done

rm "$temp_path"

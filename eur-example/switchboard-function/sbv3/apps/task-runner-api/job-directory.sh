#!/bin/bash

set -e

dir=/Users/gally/dev/switchboard/switchboard-oracle-v2/job-directory

remove_json_comments() {
  if [ $# -ne 1 ]; then
    echo "Usage: remove_json_comments <filename>"
    return 1
  fi

  # Check if the file exists
  if [ ! -f "$1" ]; then
    echo "File not found: $1"
    return 1
  fi

  # Remove all multiline comments and output the result
  # sed -E ':a;N;$!ba;s|/\*([^*]|(\*[^/]))*\*/||g;s|//.*||g' "$1" 2>/dev/null

  cleaned_contents=$(awk '
    BEGIN { is_multiline_comment = 0 }
    {
      if (is_multiline_comment == 0) {
        gsub(/\/\/.*$/, "", $0)
        gsub(/^\s*#.*$/, "", $0)
      }
      if (match($0, /\/\*/)) {
        is_multiline_comment = 1
        sub(/\/\*.*$/, "", $0)
      }
      if (match($0, /\*\//)) {
        is_multiline_comment = 0
        sub(/^.*\*\//, "", $0)
      }
      if (is_multiline_comment == 0 && length($0) > 0) {
        print $0
      }
    }
  ' "${1}")
  echo "${cleaned_contents}"
}


find ${dir} -type f \( -name "*.json" -o -name "*.jsonc" \) | while read -r file; do
  printf "\n\n%s\n\n" "$file"
  # Read the contents of the file and escape any quotes and backslashes
  contents=$(remove_json_comments "$file")
  # Construct the JSON payload with a single `jobs` field containing the file contents
  payload="{\"jobs\": [${contents}]}"
  # Send the POST request with the JSON payload
  curl http://localhost:3000/simulate \
    -X POST \
    -H "Content-Type: application/json" \
    --data "${payload}" || true
done

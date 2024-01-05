#!/bin/bash

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/utils/utils.sh"

function display_help {
  printf "\nDescription:\nBash script to sync private and public repositories\n\nUsage:\n%s [-d, delete bkup dirs]\n\nOptions:\n" "$0"
  echo "-d, delete bkup dirs"
  printf "\n\nExample:\n\t%s\n" "$0"
}

trap 'echo "Error occurred. Displaying help..."; display_help; exit 1' ERR

set -eo pipefail
stty sane
should_delete=""
while getopts 'd' OPTION; do
  case "$OPTION" in
    d)
      should_delete="true"
      ;;
    ?)
      display_help
      exit 1
      ;;
  esac
done
shift "$(($OPTIND -1))"
echo -e "DELETE: ${Blue}$should_delete${Color_Off}"
echo ""

script_path="$(cd "$(dirname "$0")"; pwd -P)/$(basename "$0")"
scripts_dir=$(dirname "$script_path")
workspace_root=$(dirname "$scripts_dir")
echo "Workspace: $workspace_root"

sbv2_core=${workspace_root/sbv3/sbv2-core}
echo "Sbv2: $sbv2_core"

sbv2_solana=${workspace_root/sbv3/sbv2-solana}
echo "Sbv2 (Solana): $sbv2_solana"

function verify_git_status() {
    local git_dir=$1
    if [ -z "$git_dir" ]; then
        echo -e "${Red}GIT_DIR was not provided${Color_Off}"
        return 1
    fi

    local dir_name=$2
    if [ -z "$dir_name" ]; then
        echo -e "${Red}DIR_NAME was not provided${Color_Off}"
        return 1
    fi

    cd "$git_dir"

    if [[ -n $(git status --porcelain) ]]; then
      echo "$dir_name Git directory is dirty"
      return 1
    fi

    # Fetch remote changes
    git fetch

    # Get the latest commit on the current branch
    current_commit=$(git rev-parse HEAD)

    # Get the latest commit on origin/main
    main_commit=$(git rev-parse origin/main)

    # Compare the commits
    if ! [[ "$current_commit" == "$main_commit" ]]; then
      echo "Your branch is not up-to-date with origin/main."
      return 1
    fi

    cd "$workspace_root"
}

function sync_package_json_version() {
    local source_package=$1
    if [ -z "$source_package" ]; then
        echo -e "${Red}SOURCE_PKG was not provided${Color_Off}"
        return 1
    fi

    local target_package=$2
    if [ -z "$target_package" ]; then
        echo -e "${Red}TARGET_PKG was not provided${Color_Off}"
        return 1
    fi

    # Use jq to get the version from the first package.json
    version=$(jq -r '.version' "$source_package")

    # Use jq to set the version in the second package.json
    jq --arg version "$version" '.version = $version' "$target_package" > temp.json && mv temp.json "$target_package"

    echo "Synced version $version from $source_package to $target_package"
}

function copy_src_dir() {
    local source_dir=$1
    if [ -z "$source_dir" ]; then
        echo -e "${Red}SOURCE_DIR was not provided${Color_Off}"
        return 1
    fi

    local target_dir=$2
    if [ -z "$target_dir" ]; then
        echo -e "${Red}TARGET_DIR was not provided${Color_Off}"
        return 1
    fi

    local source_src_dir="$source_dir/src"
    local target_src_dir="$target_dir/src"
    local backup_target_src_dir="$target_dir/src.bak"

    if [[ -d "$backup_target_src_dir" ]]; then
      # Delete the directory
      echo "Deleting ... $backup_target_src_dir"
      rm -r "$backup_target_src_dir"
    fi

    mv "$target_src_dir" "$backup_target_src_dir"
    cp -R "$source_src_dir" "$target_src_dir"

    if [[ -f "$source_dir/package.json" && -f "$target_dir/package.json"  ]]; then
          sync_package_json_version "$source_dir"/package.json "$target_dir"/package.json
    fi

    if [[ -n "$should_delete" && -d "$backup_target_src_dir" ]]; then
      rm -rf "$backup_target_src_dir"
    fi
}

verify_git_status "$sbv2_core" "Sbv2-Core"
verify_git_status "$sbv2_solana" "Sbv2-Solana"

cd "$sbv2_core"

copy_src_dir "$workspace_root/javascript/common" "$sbv2_core/javascript/common"
copy_src_dir "$workspace_root/javascript/oracle" "$sbv2_core/javascript/oracle"
copy_src_dir "$workspace_root/javascript/cli" "$sbv2_core/cli"
copy_src_dir "$workspace_root/rust/switchboard-common" "$sbv2_core/rust/switchboard-common"
copy_src_dir "$workspace_root/rust/switchboard-utils" "$sbv2_core/rust/switchboard-utils"

cd "$sbv2_solana"

copy_src_dir "$workspace_root/javascript/solana.js" "$sbv2_solana/javascript/solana.js"
copy_src_dir "$workspace_root/rust/switchboard-solana" "$sbv2_solana/rust/switchboard-solana"

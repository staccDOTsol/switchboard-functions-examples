#!/bin/bash

if [[ "${UID}" -ne 0 ]]; then
    echo "Please run this script with root privileges."
fi

export PATH=${PATH}:/usr/sbin:/sbin:/usr/bin:/bin

function verify_aesm_service() {
  if pgrep aesm_service > /dev/null; then
      return 0
  else
      echo "Error: aesm_service is not running."
      return 1
  fi
}

function start_docker() {
  dockerd >> /tmp/dockerd.txt 2>&1 &
  sleep 2
}

function verify_docker() {
  if pgrep dockerd > /dev/null; then
      return 0
  else
      echo "Error: Docker daemon is not running"
      return 1
  fi
}

function run_docuum {
  while true; do
    docuum --threshold '50 GB' > /tmp/docuumlogs.txt 2>&1
    sleep 5
  done
}

start_docker
run_docuum &
sleep 2

(
  /restart_aesm.sh
)
sleep 3
if ! verify_aesm_service; then
  echo "Error: aesm_service is not running"
  exit 1
fi

# Start the app
/app/function-simulator
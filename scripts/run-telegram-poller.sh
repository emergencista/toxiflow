#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/ubuntu/toxiflow/logs
/usr/bin/flock -n /tmp/toxiflow-telegram-poller.lock /usr/bin/node /home/ubuntu/toxiflow/scripts/poll-telegram-commands.cjs >> /home/ubuntu/toxiflow/logs/telegram-poller.log 2>&1

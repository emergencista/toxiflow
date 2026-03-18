#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/ubuntu/toxiflow/logs
/usr/bin/flock -n /tmp/tox-radar-review-queue.lock /usr/bin/node /home/ubuntu/toxiflow/scripts/tox-radar-review-queue.cjs >> /home/ubuntu/toxiflow/logs/tox-radar-review-queue.log 2>&1

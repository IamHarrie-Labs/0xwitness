#!/usr/bin/env bash
# The 90-second demo, start to finish.
set -e
B="node --experimental-strip-types src/cli/index.ts"
rm -f data/receipts.jsonl
[ -f data/agent.key ] || $B keys
$B fixture
echo; echo "### one decision cycle"; $B run --offline
echo "### the log is intact"; $B verify
echo "### and the decision reproduces"; $B replay --seq 0 --offline
echo "### now alter one price inside the sealed receipt"; $B tamper --seq 0
echo "### the log catches it"; $B verify
echo "### and so does replay"; $B replay --seq 0 --offline

#!/usr/bin/env bash
# Publish generated site data as ONE parentless commit on a branch, force-pushed to `origin`.
# The branch never grows: every run replaces it, so daily JSON never accumulates in history.
#
#   publish_data_branch.sh <branch> <path>...      (run from the repo root; paths are files/dirs)
#
# Built with plumbing (private index + commit-tree), so the working tree, the current branch and
# the real index are untouched. Missing paths are skipped; if nothing exists it fails.
set -euo pipefail
branch=${1:?branch}; shift
export GIT_INDEX_FILE; GIT_INDEX_FILE=$(mktemp -u)
trap 'rm -f "$GIT_INDEX_FILE"' EXIT
found=0
for p in "$@"; do
  if [ -e "$p" ]; then git add -f -- "$p"; found=1; else echo "publish_data_branch: skipping missing $p"; fi
done
[ "$found" = 1 ] || { echo "publish_data_branch: nothing to publish" >&2; exit 1; }
tree=$(git write-tree)
commit=$(GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-github-actions[bot]}" GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-github-actions[bot]@users.noreply.github.com}" \
         GIT_COMMITTER_NAME="${GIT_AUTHOR_NAME:-github-actions[bot]}" GIT_COMMITTER_EMAIL="${GIT_AUTHOR_EMAIL:-github-actions[bot]@users.noreply.github.com}" \
         git commit-tree "$tree" -m "Generated site data ($(date -u +%Y-%m-%dT%H:%MZ))")
git push --force origin "$commit:refs/heads/$branch"
echo "published $(git ls-tree -r --name-only "$tree" | wc -l) files as $commit to $branch"

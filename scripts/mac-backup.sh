#!/bin/zsh
# Dự phòng trên máy Mac: nếu sau 10:00 (giờ VN) mà web chưa có dữ liệu hôm nay → kích hoạt GitHub Actions.
REPO=yenylake/nhuhoa-tiktok-tracking
TODAY=$(TZ=Asia/Ho_Chi_Minh date +%Y-%m-%d)
HOUR=$(TZ=Asia/Ho_Chi_Minh date +%H)
[ "$HOUR" -lt 10 ] && exit 0
UPDATED=$(curl -s "https://raw.githubusercontent.com/$REPO/main/docs/data/latest.json?$(date +%s)" | grep -o '"updatedAt": "[^"]*"' | cut -d'"' -f4)
EPOCH=$(TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "${UPDATED%%.*}" +%s 2>/dev/null)
LAST=$([ -n "$EPOCH" ] && TZ=Asia/Ho_Chi_Minh date -r "$EPOCH" +%Y-%m-%d)
echo "$(date) updatedAt=$UPDATED lastVN=$LAST today=$TODAY"
if [ "$LAST" != "$TODAY" ]; then
  # Có lần chạy đang dở thì thôi
  if /opt/homebrew/bin/gh run list -R $REPO -w update.yml -L 3 --json status -q '.[].status' | grep -qE 'queued|in_progress'; then
    echo "Đang có lần cập nhật chạy"; exit 0
  fi
  /opt/homebrew/bin/gh workflow run update.yml -R $REPO && echo "Đã kích hoạt cập nhật"
fi

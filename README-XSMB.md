# Thống kê Xổ số miền Bắc – Đề 2 số · Đề 3 số & đuôi lô

Ứng dụng thống kê **thật** kết quả XSMB (không giả lập dữ liệu).

## Tính năng

- **Đề 2 số** (00–99): 2 số cuối giải Đặc biệt
- **Đề 3 số** (000–999): 3 số cuối giải Đặc biệt (chỉ số đã từng về trong cửa sổ)
- **Đuôi lô**: 2 số cuối mọi giải
- Cửa sổ thống kê: 30 / 60 / 100 / 200 / Tất cả kỳ
- Xếp hạng theo tần suất + khoảng cách lần về
- Banner rõ khi **không lấy được dữ liệu mới** (hiện ngày cập nhật gần nhất + lỗi)

## Nguồn dữ liệu

1. Archive: GitHub [khiemdoan/vietnam-lottery-xsmb-analysis](https://github.com/khiemdoan/vietnam-lottery-xsmb-analysis) (`data/xsmb.json`)
2. Live: scrape `xoso.com.vn` khi archive chưa có kỳ mới

## Chạy local

```bash
npm install
npm run dev
```

Mở http://localhost:8080

## File chính

| File | Vai trò |
|------|---------|
| `src/lib/xsmb.ts` | Types, ranking đề 2/3 số & lô |
| `src/lib/xsmb-sync.server.ts` | Sync GitHub + scrape |
| `src/components/board.tsx` | Giao diện |
| `src/data/xsmb.json` | ~7.600 kỳ lịch sử |

## Lưu ý

Xổ số là ngẫu nhiên. Thống kê chỉ tham khảo, không đảm bảo trúng.

/**
 * Script đo thời gian phản hồi (cold start + tải nhẹ đồng thời) không cần thư viện ngoài.
 * Cách dùng:
 *   node scripts/benchmark.js http://localhost:3000
 *   node scripts/benchmark.js https://audiohub-store.onrender.com 5 30
 */

const baseUrl = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const concurrency = Math.max(1, Number(process.argv[3] || 5));
const totalRequests = Math.max(1, Number(process.argv[4] || 30));

async function timedGet(url) {
  const start = performance.now();
  const res = await fetch(url);
  await res.arrayBuffer();
  return { status: res.status, ms: performance.now() - start };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

async function main() {
  console.log(`Đang đo hiệu năng: ${baseUrl}`);
  console.log(`Cấu hình: ${totalRequests} request, đồng thời ${concurrency} luồng\n`);

  // 1. Đo request đầu tiên (Cold start / warm-up)
  const cold = await timedGet(`${baseUrl}/health`);
  console.log(`[1] Request đầu tiên (/health): status=${cold.status}, thời gian=${cold.ms.toFixed(1)} ms`);

  // 2. Đo tải nhẹ các trang chính
  const targets = ['/', '/products', '/api/products', '/health'];
  const latencies = [];
  let okCount = 0;
  let errCount = 0;
  let cursor = 0;

  const benchStart = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const idx = cursor;
        cursor += 1;
        if (idx >= totalRequests) break;
        const url = `${baseUrl}${targets[idx % targets.length]}`;
        try {
          const r = await timedGet(url);
          latencies.push(r.ms);
          if (r.status >= 200 && r.status < 400) okCount += 1;
          else errCount += 1;
        } catch (err) {
          errCount += 1;
        }
      }
    })
  );
  const elapsedSec = (performance.now() - benchStart) / 1000;

  latencies.sort((a, b) => a - b);
  const avg = latencies.length ? latencies.reduce((s, v) => s + v, 0) / latencies.length : 0;

  console.log('\n[2] Kết quả đo tải:');
  console.log(`- Thành công / Lỗi : ${okCount} / ${errCount}`);
  console.log(`- Tổng thời gian   : ${elapsedSec.toFixed(2)} s (${(totalRequests / elapsedSec).toFixed(1)} req/s)`);
  console.log(`- Nhanh nhất (min) : ${(latencies[0] || 0).toFixed(1)} ms`);
  console.log(`- Trung bình (avg) : ${avg.toFixed(1)} ms`);
  console.log(`- P50 (trung vị)   : ${percentile(latencies, 0.5).toFixed(1)} ms`);
  console.log(`- P95              : ${percentile(latencies, 0.95).toFixed(1)} ms`);
  console.log(`- Chậm nhất (max)  : ${(latencies[latencies.length - 1] || 0).toFixed(1)} ms`);
}

main().catch((err) => {
  console.error('Lỗi benchmark:', err.message);
  process.exit(1);
});

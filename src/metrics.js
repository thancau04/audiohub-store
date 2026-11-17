// Ghi nhận hiệu năng xử lý request (thời gian phản hồi trung bình, p95, uptime)
const MAX_SAMPLES = 200;
const samples = [];
const startedAt = Date.now();
let totalRequests = 0;

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const isAsset = req.path.startsWith('/css/') || req.path.startsWith('/js/');
    if (!isAsset) {
      totalRequests += 1;
      samples.push(durationMs);
      if (samples.length > MAX_SAMPLES) samples.shift();
      if (req.path !== '/health') {
        console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
      }
    }
  });
  next();
}

function getMetrics() {
  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const avgMs = count ? sorted.reduce((s, v) => s + v, 0) / count : 0;
  const p95Ms = count ? sorted[Math.min(count - 1, Math.floor(count * 0.95))] : 0;
  const maxMs = count ? sorted[count - 1] : 0;
  const mem = process.memoryUsage();

  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    totalRequests,
    recentSampleSize: count,
    latencyMs: {
      avg: Number(avgMs.toFixed(2)),
      p95: Number(p95Ms.toFixed(2)),
      max: Number(maxMs.toFixed(2)),
    },
    memoryMb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    },
  };
}

module.exports = { metricsMiddleware, getMetrics };

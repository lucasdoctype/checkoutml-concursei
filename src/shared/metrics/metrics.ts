type RequestLabels = {
  method: string;
  path: string;
  status: string;
};

const buckets = [50, 100, 200, 500, 1000, 2000, 5000];

const requestsTotal = new Map<string, number>();
const errorsTotal = new Map<string, number>();
const durationBuckets = new Map<string, number>();
const durationCounts = new Map<string, number>();
const durationSums = new Map<string, number>();

const buildKey = (parts: Record<string, string>): string =>
  Object.entries(parts)
    .map(([key, value]) => `${key}=${value}`)
    .join('|');

const inc = (store: Map<string, number>, key: string, value = 1): void => {
  store.set(key, (store.get(key) ?? 0) + value);
};

export const recordRequest = (labels: RequestLabels, latencyMs: number, errorCode?: string | null): void => {
  const baseKey = buildKey(labels);
  inc(requestsTotal, baseKey);

  const durationKeyBase = buildKey({ method: labels.method, path: labels.path });
  inc(durationCounts, durationKeyBase);
  inc(durationSums, durationKeyBase, latencyMs);

  for (const bucket of buckets) {
    if (latencyMs <= bucket) {
      inc(durationBuckets, buildKey({ method: labels.method, path: labels.path, le: String(bucket) }));
    }
  }
  inc(durationBuckets, buildKey({ method: labels.method, path: labels.path, le: '+Inf' }));

  if (labels.status.startsWith('4') || labels.status.startsWith('5')) {
    if (errorCode) {
      inc(errorsTotal, buildKey({ error_code: errorCode }));
    }
  }
};

const renderCounter = (name: string, store: Map<string, number>, labelKeys: string[]): string => {
  let output = `# TYPE ${name} counter\n`;
  for (const [key, value] of store.entries()) {
    const labels = key
      .split('|')
      .map((item) => {
        const [label, rawValue] = item.split('=');
        return labelKeys.includes(label) ? `${label}="${rawValue}"` : null;
      })
      .filter(Boolean)
      .join(',');
    output += `${name}{${labels}} ${value}\n`;
  }
  return output;
};

export const renderMetrics = (): string => {
  let output = '';
  output += renderCounter('requests_total', requestsTotal, ['method', 'path', 'status']);
  output += renderCounter('errors_total', errorsTotal, ['error_code']);

  output += '# TYPE request_duration_ms_bucket histogram\n';
  for (const [key, value] of durationBuckets.entries()) {
    const labels = key
      .split('|')
      .map((item) => {
        const [label, rawValue] = item.split('=');
        return `${label}="${rawValue}"`;
      })
      .join(',');
    output += `request_duration_ms_bucket{${labels}} ${value}\n`;
  }

  output += '# TYPE request_duration_ms_count counter\n';
  for (const [key, value] of durationCounts.entries()) {
    const labels = key
      .split('|')
      .map((item) => {
        const [label, rawValue] = item.split('=');
        return `${label}="${rawValue}"`;
      })
      .join(',');
    output += `request_duration_ms_count{${labels}} ${value}\n`;
  }

  output += '# TYPE request_duration_ms_sum counter\n';
  for (const [key, value] of durationSums.entries()) {
    const labels = key
      .split('|')
      .map((item) => {
        const [label, rawValue] = item.split('=');
        return `${label}="${rawValue}"`;
      })
      .join(',');
    output += `request_duration_ms_sum{${labels}} ${value}\n`;
  }

  return output;
};

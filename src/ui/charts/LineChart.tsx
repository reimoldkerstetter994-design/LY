import { useEffect, useRef } from 'react';
import { sup } from '../../utils/format';

export interface Series {
  label: string;
  color: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  dash?: number[];
  width?: number;
  scatter?: boolean;
  alpha?: number;
  legend?: boolean;
  /** Excluded from hover readouts (e.g. non-monotonic curves). */
  noHover?: boolean;
}

export interface Marker {
  x?: number;
  y?: number;
  label?: string;
  color?: string;
}

export interface LineChartProps {
  series: Series[];
  xLog?: boolean;
  yLog?: boolean;
  xDomain?: [number, number];
  yDomain?: [number, number];
  xLabel?: string;
  yLabel?: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  markers?: Marker[];
  height?: number;
  hover?: boolean;
  legend?: 'tl' | 'tr' | 'bl' | 'br' | 'none';
}

const M = { l: 60, r: 14, t: 12, b: 38 };

function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

function linTicks(a: number, b: number, n = 6): number[] {
  const step = niceStep(b - a, n);
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function logTicks(a: number, b: number): { major: number[]; minor: number[] } {
  const k0 = Math.floor(Math.log10(a));
  const k1 = Math.ceil(Math.log10(b));
  const decades = k1 - k0;
  const every = decades > 24 ? 6 : decades > 14 ? 3 : decades > 8 ? 2 : 1;
  const major: number[] = [];
  const minor: number[] = [];
  for (let k = k0; k <= k1; k++) {
    const v = Math.pow(10, k);
    if (v >= a * 0.999 && v <= b * 1.001 && k % every === 0) major.push(v);
    if (decades <= 6) for (let m = 2; m <= 9; m++) if (v * m > a && v * m < b) minor.push(v * m);
  }
  return { major, minor };
}

export function defaultFormat(v: number, log: boolean): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (log) {
    const k = Math.round(Math.log10(a));
    if (Math.abs(a - Math.pow(10, k)) / a < 1e-6) {
      if (k >= -2 && k <= 4) return String(Number(Math.pow(10, k).toPrecision(1)));
      return `10${sup(k)}`;
    }
  }
  if (a >= 1e5 || a < 1e-3) {
    const k = Math.floor(Math.log10(a));
    const m = v / Math.pow(10, k);
    return `${Number(m.toPrecision(2))}×10${sup(k)}`;
  }
  return String(Number(v.toPrecision(4)));
}

function domainOf(series: Series[], key: 'x' | 'y', log: boolean): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    const arr = s[key];
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (!Number.isFinite(v) || (log && v <= 0)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo)) return log ? [1, 10] : [0, 1];
  if (lo === hi) return log ? [lo / 2, hi * 2] : [lo - 1, hi + 1];
  if (log) return [lo, hi];
  const pad = (hi - lo) * 0.04;
  return [lo - pad, hi + pad];
}

export function LineChart(props: LineChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hoverX = useRef<number | null>(null);
  const propsRef = useRef(props);

  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    const cv = canvas.current!;
    const host = wrap.current!;
    const draw = () => {
      const p = propsRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = host.clientWidth;
      const H = p.height ?? 260;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        cv.style.width = `${W}px`;
        cv.style.height = `${H}px`;
      }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const xl = !!p.xLog;
      const yl = !!p.yLog;
      const [x0, x1] = p.xDomain ?? domainOf(p.series, 'x', xl);
      const [y0, y1] = p.yDomain ?? domainOf(p.series, 'y', yl);
      const pw = W - M.l - M.r;
      const ph = H - M.t - M.b;
      const fx = (v: number) => M.l + ((xl ? Math.log10(v) - Math.log10(x0) : v - x0) / (xl ? Math.log10(x1) - Math.log10(x0) : x1 - x0)) * pw;
      const fy = (v: number) => M.t + ph - ((yl ? Math.log10(v) - Math.log10(y0) : v - y0) / (yl ? Math.log10(y1) - Math.log10(y0) : y1 - y0)) * ph;
      const inv = (px: number) => {
        const t = (px - M.l) / pw;
        return xl ? Math.pow(10, Math.log10(x0) + t * (Math.log10(x1) - Math.log10(x0))) : x0 + t * (x1 - x0);
      };
      const xf = p.xFormat ?? ((v: number) => defaultFormat(v, xl));
      const yf = p.yFormat ?? ((v: number) => defaultFormat(v, yl));

      ctx.font = '11px "Inter", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.lineWidth = 1;
      // grid + ticks
      const xt = xl ? logTicks(x0, x1) : { major: linTicks(x0, x1, Math.max(3, Math.floor(pw / 90))), minor: [] };
      const yt = yl ? logTicks(y0, y1) : { major: linTicks(y0, y1, Math.max(3, Math.floor(ph / 45))), minor: [] };
      ctx.strokeStyle = 'rgba(160,190,255,0.05)';
      for (const v of xt.minor) {
        ctx.beginPath();
        ctx.moveTo(fx(v), M.t);
        ctx.lineTo(fx(v), M.t + ph);
        ctx.stroke();
      }
      for (const v of yt.minor) {
        ctx.beginPath();
        ctx.moveTo(M.l, fy(v));
        ctx.lineTo(M.l + pw, fy(v));
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(160,190,255,0.11)';
      ctx.fillStyle = 'rgba(190,205,235,0.75)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const v of xt.major) {
        const x = fx(v);
        ctx.beginPath();
        ctx.moveTo(x, M.t);
        ctx.lineTo(x, M.t + ph);
        ctx.stroke();
        ctx.fillText(xf(v), x, M.t + ph + 5);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const v of yt.major) {
        const y = fy(v);
        ctx.beginPath();
        ctx.moveTo(M.l, y);
        ctx.lineTo(M.l + pw, y);
        ctx.stroke();
        ctx.fillText(yf(v), M.l - 6, y);
      }
      ctx.strokeStyle = 'rgba(170,195,255,0.35)';
      ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);
      ctx.fillStyle = 'rgba(200,215,240,0.9)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      if (p.xLabel) ctx.fillText(p.xLabel, M.l + pw / 2, H - 2);
      if (p.yLabel) {
        ctx.save();
        ctx.translate(12, M.t + ph / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textBaseline = 'middle';
        ctx.fillText(p.yLabel, 0, 0);
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(M.l, M.t, pw, ph);
      ctx.clip();
      for (const m of p.markers ?? []) {
        ctx.strokeStyle = m.color ?? 'rgba(255,255,255,0.35)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        if (m.x !== undefined) {
          const x = fx(m.x);
          ctx.moveTo(x, M.t);
          ctx.lineTo(x, M.t + ph);
        } else if (m.y !== undefined) {
          const y = fy(m.y);
          ctx.moveTo(M.l, y);
          ctx.lineTo(M.l + pw, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (m.label) {
          ctx.fillStyle = m.color ?? 'rgba(255,255,255,0.7)';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          if (m.x !== undefined) ctx.fillText(m.label, fx(m.x) + 4, M.t + 4);
          else if (m.y !== undefined) ctx.fillText(m.label, M.l + 6, fy(m.y!) + 3);
        }
      }
      for (const s of p.series) {
        ctx.strokeStyle = s.color;
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.alpha ?? 1;
        ctx.lineWidth = s.width ?? 1.8;
        ctx.setLineDash(s.dash ?? []);
        if (s.scatter) {
          for (let i = 0; i < s.x.length; i++) {
            const xv = s.x[i];
            const yv = s.y[i];
            if (!Number.isFinite(xv) || !Number.isFinite(yv) || (xl && xv <= 0) || (yl && yv <= 0)) continue;
            ctx.beginPath();
            ctx.arc(fx(xv), fy(yv), 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.beginPath();
          let pen = false;
          for (let i = 0; i < s.x.length; i++) {
            const xv = s.x[i];
            const yv = s.y[i];
            if (!Number.isFinite(xv) || !Number.isFinite(yv) || (xl && xv <= 0) || (yl && yv <= 0)) {
              pen = false;
              continue;
            }
            const X = fx(xv);
            const Y = Math.max(-1e5, Math.min(1e5, fy(yv)));
            if (!pen) ctx.moveTo(X, Y);
            else ctx.lineTo(X, Y);
            pen = true;
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.setLineDash([]);

      const hx = hoverX.current;
      if (hx !== null && p.hover !== false && hx >= M.l && hx <= M.l + pw) {
        const xv = inv(hx);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(hx, M.t);
        ctx.lineTo(hx, M.t + ph);
        ctx.stroke();
        const rows: [string, string, string][] = [];
        for (const s of p.series) {
          if (s.noHover || s.scatter || s.x.length < 2) continue;
          let lo = 0;
          let hi = s.x.length - 1;
          const asc = s.x[hi] > s.x[0];
          if ((asc && (xv < s.x[0] || xv > s.x[hi])) || (!asc && (xv > s.x[0] || xv < s.x[hi]))) continue;
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (s.x[mid] < xv === asc) lo = mid;
            else hi = mid;
          }
          const t = (xv - s.x[lo]) / (s.x[hi] - s.x[lo] || 1);
          const yv = s.y[lo] + (s.y[hi] - s.y[lo]) * t;
          if (!Number.isFinite(yv)) continue;
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(hx, fy(yv), 3, 0, Math.PI * 2);
          ctx.fill();
          rows.push([s.label, yf(yv), s.color]);
        }
        ctx.restore();
        const lines = [[xf(xv), '', '#fff'] as [string, string, string], ...rows];
        const bw = Math.max(...lines.map(([a, b]) => ctx.measureText(`${a}  ${b}`).width)) + 18;
        const bh = lines.length * 16 + 8;
        const bx = hx + 12 + bw > W ? hx - bw - 12 : hx + 12;
        ctx.fillStyle = 'rgba(8,12,26,0.9)';
        ctx.strokeStyle = 'rgba(120,160,255,0.35)';
        ctx.beginPath();
        ctx.roundRect(bx, M.t + 6, bw, bh, 6);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach(([a, b, c], i) => {
          ctx.fillStyle = c;
          ctx.fillText(b ? `${a}  ${b}` : a, bx + 9, M.t + 11 + i * 16);
        });
      } else {
        ctx.restore();
      }

      if (p.legend !== 'none') {
        const items = p.series.filter((s) => s.legend !== false && s.label);
        if (items.length) {
          const pos = p.legend ?? 'tl';
          const lw = Math.max(...items.map((s) => ctx.measureText(s.label).width)) + 34;
          const lh = items.length * 15 + 8;
          const lx = pos.endsWith('l') ? M.l + 8 : M.l + pw - lw - 8;
          const ly = pos.startsWith('t') ? M.t + 8 : M.t + ph - lh - 8;
          ctx.fillStyle = 'rgba(6,10,22,0.72)';
          ctx.beginPath();
          ctx.roundRect(lx, ly, lw, lh, 6);
          ctx.fill();
          items.forEach((s, i) => {
            const y = ly + 11 + i * 15;
            ctx.strokeStyle = s.color;
            ctx.fillStyle = s.color;
            ctx.lineWidth = 2;
            ctx.setLineDash(s.dash ?? []);
            ctx.beginPath();
            if (s.scatter) ctx.arc(lx + 15, y, 2.2, 0, Math.PI * 2);
            else {
              ctx.moveTo(lx + 6, y);
              ctx.lineTo(lx + 24, y);
            }
            if (s.scatter) ctx.fill();
            else ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(220,230,250,0.92)';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.label, lx + 30, y);
          });
        }
      }
    };
    const ro = new ResizeObserver(draw);
    ro.observe(host);
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      hoverX.current = e.clientX - r.left;
      draw();
    };
    const leave = () => {
      hoverX.current = null;
      draw();
    };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerleave', leave);
    draw();
    (cv as HTMLCanvasElement & { __draw?: () => void }).__draw = draw;
    return () => {
      ro.disconnect();
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerleave', leave);
    };
  }, []);

  useEffect(() => {
    (canvas.current as (HTMLCanvasElement & { __draw?: () => void }) | null)?.__draw?.();
  });

  return (
    <div ref={wrap} className="chart">
      <canvas ref={canvas} />
    </div>
  );
}

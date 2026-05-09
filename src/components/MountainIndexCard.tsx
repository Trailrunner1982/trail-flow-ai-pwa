import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mountain } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface MountainIndexCardProps {
  totalKm: number;
  totalVert: number;
  /** Optional: next A race to compare profile */
  nextRace?: { name: string; distance_km: number; elevation_gain_m: number } | null;
}

const BADGES = [
  { name: "Trail Rookie", threshold: 1000, icon: "🥾" },
  { name: "Mont Blanc", threshold: 4808, icon: "🏔️" },
  { name: "Kilimanjaro", threshold: 5895, icon: "🗻" },
  { name: "Everest", threshold: 8848, icon: "🧗" },
  { name: "Ultra Vert", threshold: 20000, icon: "🔥" },
  { name: "Trail Legend", threshold: 50000, icon: "👑" },
];

// Cap shown on the radial gauge for readability.
const GAUGE_MAX = 80; // m/km — covers everything from rolling to extreme alpine

export function MountainIndexCard({ totalKm, totalVert, nextRace }: MountainIndexCardProps) {
  const { t } = useLanguage();
  const mountainIndex = totalKm > 0 ? totalVert / totalKm : 0;
  const earned = BADGES.filter((b) => totalVert >= b.threshold);
  const next = BADGES.find((b) => totalVert < b.threshold);
  const progressNext = next ? Math.min(100, (totalVert / next.threshold) * 100) : 100;

  const raceMI = nextRace && nextRace.distance_km > 0 ? nextRace.elevation_gain_m / nextRace.distance_km : null;

  // Zone evaluation
  const zone = useMemo(() => {
    if (raceMI == null) return null;
    const ratio = mountainIndex / raceMI;
    if (ratio >= 0.85 && ratio <= 1.15) return { key: "mtn.zone.ideal", color: "text-emerald-400", stroke: "stroke-emerald-400" };
    if (ratio < 0.85) return { key: "mtn.zone.below", color: "text-amber-400", stroke: "stroke-amber-400" };
    return { key: "mtn.zone.above", color: "text-orange-400", stroke: "stroke-orange-400" };
  }, [mountainIndex, raceMI]);

  return (
    <Card className="p-4 bg-gradient-to-br from-primary/5 via-background to-background border-primary/20">
      <div className="flex items-center gap-2 mb-3">
        <Mountain className="w-4 h-4 text-primary" />
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("mtn.title")}</div>
      </div>

      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold">{mountainIndex.toFixed(1)}</div>
        <div className="text-xs text-muted-foreground">{t("mtn.unit")}</div>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {t("mtn.summary", { vert: totalVert.toLocaleString(), km: totalKm.toFixed(1) })}
      </div>

      {/* Radial gauge: athlete vs race */}
      {raceMI != null && (
        <div className="mt-4 pt-4 border-t border-border/40">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">{t("mtn.gaugeTitle")}</div>
          <RadialGauge youValue={mountainIndex} raceValue={raceMI} max={GAUGE_MAX} youColorClass={zone?.stroke ?? "stroke-primary"} />
          <div className="flex items-center justify-between mt-2 text-[11px]">
            <span className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${zone?.color.replace("text-", "bg-") ?? "bg-primary"}`} />
              {t("mtn.gaugeYou")}: <strong>{mountainIndex.toFixed(1)}</strong>
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full bg-foreground/60" />
              {t("mtn.gaugeRace")}: <strong>{raceMI.toFixed(1)}</strong>
            </span>
          </div>
          {zone && (
            <div className={`mt-2 text-[11px] ${zone.color}`}>
              {t(zone.key)}
            </div>
          )}
          {nextRace && (
            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {nextRace.name} · {nextRace.distance_km}km · {nextRace.elevation_gain_m}D+
            </div>
          )}
        </div>
      )}

      {raceMI == null && (
        <div className="mt-3 text-[11px] text-muted-foreground italic">{t("mtn.noRace")}</div>
      )}

      {earned.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {earned.map((b) => (
            <Badge key={b.name} variant="secondary" className="text-[10px] gap-1">
              {b.icon} {b.name}
            </Badge>
          ))}
        </div>
      )}

      {next && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{t("mtn.next")}: {next.icon} {next.name}</span>
            <span>{Math.round(progressNext)}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressNext}%` }} />
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {t("mtn.toGo", { m: (next.threshold - totalVert).toLocaleString() })}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Half-circle radial gauge.
 *  - Track arc (muted)
 *  - "You" arc filled to youValue/max (color depends on zone)
 *  - Race indicator: a tick mark at raceValue/max
 */
function RadialGauge({
  youValue, raceValue, max, youColorClass,
}: { youValue: number; raceValue: number; max: number; youColorClass: string }) {
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  // Half circle: from 180deg (left) to 360deg (right) — top half
  const arcLength = Math.PI * radius;
  const youPct = Math.max(0, Math.min(1, youValue / max));
  const racePct = Math.max(0, Math.min(1, raceValue / max));
  const youDash = arcLength * youPct;

  // tick angle (in radians) measured from negative-x axis going CCW over top
  const angleAt = (pct: number) => Math.PI - Math.PI * pct;
  const raceAngle = angleAt(racePct);
  const tickInner = radius - strokeWidth / 2 - 3;
  const tickOuter = radius + strokeWidth / 2 + 3;
  const x1 = cx + tickInner * Math.cos(raceAngle);
  const y1 = cy - tickInner * Math.sin(raceAngle);
  const x2 = cx + tickOuter * Math.cos(raceAngle);
  const y2 = cy - tickOuter * Math.sin(raceAngle);

  // Path for half-circle arc (left → top → right)
  const arcPath = `M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`;

  return (
    <div className="relative w-full flex justify-center">
      <svg viewBox={`0 0 ${size} ${cy + strokeWidth}`} className="w-full max-w-[260px]">
        {/* Track */}
        <path d={arcPath} className="stroke-muted" strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
        {/* You */}
        <path
          d={arcPath}
          className={youColorClass}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${youDash} ${arcLength}`}
        />
        {/* Race tick */}
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-foreground" strokeWidth={3} strokeLinecap="round" />
        {/* Center labels */}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground text-[18px] font-bold">
          {youValue.toFixed(0)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground text-[9px] uppercase tracking-wider">
          m/km
        </text>
      </svg>
    </div>
  );
}

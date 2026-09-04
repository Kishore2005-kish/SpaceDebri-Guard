'use client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUI } from '@/lib/store';
import { CheckCircle2, Circle, ArrowRight, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { title: 'Select satellite', what: 'Pick a protected satellite from your fleet.', why: 'Conjunction screening is run per protected asset.', look: 'Mission Dashboard → Protected Sats panel' },
  { title: 'Load orbital data', what: 'Fetch latest OMM/TLE orbital elements.', why: 'Stale elements make predictions unreliable.', look: 'Source badge = CELESTRAK, Data age < 24h' },
  { title: 'Run screening', what: 'Screen primary against catalog objects over 7-day horizon.', why: 'Identifies potential close approaches.', look: 'Dashboard → REFRESH & RESCREEN button' },
  { title: 'Understand TCA', what: 'TCA = Time of Closest Approach.', why: 'The moment of minimum relative separation within the screening window.', look: 'Conjunction table → TCA column' },
  { title: 'Understand miss distance', what: 'Minimum 3D separation at TCA.', why: 'Sub-1 km events are operationally significant.', look: 'Conjunction detail → MISS DISTANCE field' },
  { title: 'Understand relative velocity', what: 'Speed of secondary relative to primary at TCA.', why: 'High relative velocity means short encounter window and high impact energy.', look: 'Conjunction detail → REL VELOCITY field' },
  { title: 'Understand risk score', what: 'Heuristic 0–100 score combining 5 factors.', why: 'Helps prioritize. NOT a collision probability.', look: 'Risk explanation panel' },
  { title: 'Understand confidence', what: 'Separate 0–100 score reflecting trust in inputs.', why: 'A high-risk + low-confidence event is the most worrying.', look: 'Confidence panel' },
  { title: 'Explore 3D encounter', what: 'Top-down ECI projection of both orbits around TCA.', why: 'Visualize geometry; play the timeline to see encounter.', look: 'Orbit visualization card' },
  { title: 'Run maneuver simulation', what: 'What-if analysis: try burn time + ΔV + direction.', why: 'See how risk changes; find best scenario.', look: 'Maneuver simulator → RUN SIMULATION' },
  { title: 'Check secondary conjunctions', what: 'After maneuver, re-screen primary against other objects.', why: 'A maneuver that fixes one event may create another.', look: 'Secondary conjunction check panel' },
  { title: 'Validate results', what: 'Compare our TCA / range against reference.', why: 'Sanity-checks the prototype propagator.', look: 'Validation tab in detail panel' },
  { title: 'Export report', what: 'Generate full analysis report (JSON).', why: 'Auditable artifact for review.', look: 'EXPORT REPORT button' },
];

export function TutorialView() {
  const { startDemo } = useUI();
  return (
    <div className="p-4 space-y-3 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-mono font-bold">Guided Tutorial</h1>
          <p className="text-xs text-muted-foreground mt-1">A 13-step walk-through of the conjunction-awareness workflow. Each step explains what, why, and where to look.</p>
        </div>
        <Button onClick={startDemo} className="gap-1.5 font-mono text-[11px]">
          <Zap className="h-3 w-3" /> START AUTO DEMO
        </Button>
      </div>

      <Card className="p-3 border-primary/30 bg-primary/5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-primary mb-1">⚠ REMINDER</div>
        <p className="text-[11px] text-muted-foreground">
          This is a prototype decision-support system, not a flight-control system. All maneuver results are hypothetical.
        </p>
      </Card>

      <div className="space-y-2">
        {STEPS.map((step, i) => (
          <Card key={i} className="p-3 lift-hover">
            <div className="flex items-start gap-3">
              <div className={cn('flex items-center justify-center w-7 h-7 rounded-full shrink-0 font-mono text-xs font-bold', i === 0 ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground')}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-mono text-sm font-bold">{step.title}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                  <div>
                    <div className="text-[9px] font-mono uppercase text-muted-foreground">WHAT IS HAPPENING</div>
                    <p className="text-[11px] mt-0.5">{step.what}</p>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono uppercase text-muted-foreground">WHY IT MATTERS</div>
                    <p className="text-[11px] mt-0.5">{step.why}</p>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono uppercase text-muted-foreground">WHAT TO LOOK AT</div>
                    <p className="text-[11px] mt-0.5 text-primary font-mono">{step.look}</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

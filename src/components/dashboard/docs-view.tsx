'use client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertTriangle, FileText } from 'lucide-react';

export function DocsView() {
  return (
    <div className="p-4 space-y-3 max-w-4xl">
      <div>
        <h1 className="text-2xl font-mono font-bold">Documentation</h1>
        <p className="text-xs text-muted-foreground mt-1">All assumptions, model details, and limitations for the prototype.</p>
      </div>

      <Card className="p-4 border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
          <div>
            <div className="text-[11px] font-mono text-amber-500 font-bold mb-1">CRITICAL LIMITATIONS</div>
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
              <li>Public GP/TLE data is NOT authoritative.</li>
              <li>The heuristic risk score is NOT a probability of collision.</li>
              <li>Covariance is unavailable in this prototype.</li>
              <li>Maneuver simulations are hypothetical, not flight commands.</li>
              <li>SGP4 propagation in this prototype is simplified (Keplerian + J2).</li>
              <li>This tool does NOT replace professional SSA.</li>
              <li>No autonomous spacecraft commands are produced.</li>
            </ul>
          </div>
        </div>
      </Card>

      <Accordion type="single" collapsible className="space-y-2">
        <Card>
          <AccordionItem value="arch" className="border-0">
            <AccordionTrigger className="px-4 py-3 text-xs font-mono font-bold hover:no-underline">
              <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-primary" /> ARCHITECTURE</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
              <p>CelesTrak / Demo Data → Data Ingestion → SQLite (Prisma) → SGP4 Propagation → Conjunction Engine → Risk Engine → Maneuver Simulator → Next.js API → React Dashboard → Canvas Visualization.</p>
              <p className="mt-2">Orbital mechanics, risk logic, maneuver logic, and UI are kept as separate modules. The propagator is in <code className="text-primary">src/lib/orbital/</code>; risk in <code className="text-primary">src/lib/risk/</code>; maneuver in <code className="text-primary">src/lib/maneuver/</code>; API routes in <code className="text-primary">src/app/api/</code>; UI in <code className="text-primary">src/components/</code>.</p>
            </AccordionContent>
          </AccordionItem>
        </Card>
        <Card>
          <AccordionItem value="orbital" className="border-0">
            <AccordionTrigger className="px-4 py-3 text-xs font-mono font-bold hover:no-underline">
              <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-primary" /> ORBITAL ENGINE</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
              <p><b>propagate(object, timestamp)</b>: returns ECI Cartesian state + velocity + orbital elements at the requested time.</p>
              <p className="mt-1"><b>propagate_range(object, start, end, step)</b>: returns a list of states over the window.</p>
              <p className="mt-1">Algorithm: Two-body propagation with secular J2 perturbation of RAAN and argument of perigee. Mean anomaly integrated analytically. Kepler's equation solved via Newton-Raphson. True anomaly from eccentric anomaly. Classical → Cartesian via standard perifocal rotation.</p>
              <p className="mt-2 text-amber-500">⚠ NOT the official SGP4 algorithm. For operational use, replace with the official sgp4 / skyfield implementation. B* drag is not modeled.</p>
            </AccordionContent>
          </AccordionItem>
        </Card>
        <Card>
          <AccordionItem value="risk" className="border-0">
            <AccordionTrigger className="px-4 py-3 text-xs font-mono font-bold hover:no-underline">
              <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-primary" /> RISK MODEL</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
              <p><b>Conjunction Risk Score: 0–100</b> (heuristic, NOT probability of collision)</p>
              <p className="mt-1">Weights:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Miss distance: 40%</li>
                <li>Data uncertainty: 20%</li>
                <li>Relative velocity: 15%</li>
                <li>Encounter geometry: 15%</li>
                <li>Data freshness: 10%</li>
              </ul>
              <p className="mt-2">Risk levels: 0–24 LOW, 25–49 MODERATE, 50–74 HIGH, 75–100 CRITICAL.</p>
              <p className="mt-2 text-amber-500">⚠ This is a PROTOTYPE heuristic. Real Pc requires covariance data and Monte Carlo simulation.</p>
            </AccordionContent>
          </AccordionItem>
        </Card>
        <Card>
          <AccordionItem value="maneuver" className="border-0">
            <AccordionTrigger className="px-4 py-3 text-xs font-mono font-bold hover:no-underline">
              <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-primary" /> MANEUVER MODEL</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
              <p>Inputs: Burn time (h before TCA), ΔV (m/s), Direction (Radial / Along-track / Cross-track).</p>
              <p className="mt-1">Default sweep: 72h, 48h, 36h, 24h, 12h, 6h. ΔV ~0.05 m/s along-track.</p>
              <p className="mt-1">For each scenario: propagate primary to burn time → apply impulsive ΔV in RIC frame → convert back to mean elements → re-propagate → re-screen against secondary AND against the rest of the catalog.</p>
              <p className="mt-2 text-amber-500">⚠ Simulation only — not a flight command. Operational decisions require authoritative orbital data and qualified flight-dynamics analysis.</p>
            </AccordionContent>
          </AccordionItem>
        </Card>
        <Card>
          <AccordionItem value="validation" className="border-0">
            <AccordionTrigger className="px-4 py-3 text-xs font-mono font-bold hover:no-underline">
              <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-primary" /> VALIDATION</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
              <p>Compare our TCA, minimum range, and relative velocity against a reference dataset. In production, use CelesTrak SOCRATES published results.</p>
              <p className="mt-1">Statistics: events tested, detection rate, mean TCA error (minutes), mean range error (km).</p>
              <p className="mt-2 text-amber-500">⚠ The prototype uses a synthetic reference (built from our own estimates). Do not claim professional-grade accuracy.</p>
            </AccordionContent>
          </AccordionItem>
        </Card>
        <Card>
          <AccordionItem value="api" className="border-0">
            <AccordionTrigger className="px-4 py-3 text-xs font-mono font-bold hover:no-underline">
              <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-primary" /> API</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
              <pre className="text-[10px] leading-relaxed">{`GET  /api/satellites          # list (filter by ?protected=1, ?type=, ?q=)
POST /api/satellites          # register new object
GET  /api/satellites/{id}     # single object detail
POST /api/orbits/refresh     # refresh orbital data
GET  /api/orbits/{id}?start=&end=&step=  # propagate
POST /api/screen              # run conjunction screening
GET  /api/conjunctions        # list (filter by ?primaryId, ?status, ?riskLevel, ?type, ?minRisk, ?maxDistance, ?minConf)
GET  /api/conjunctions/{id}   # conjunction detail (full)
POST /api/conjunctions/{id}/simulate   # maneuver what-if
GET  /api/conjunctions/{id}/timeline    # audit timeline
PATCH /api/conjunctions/{id}/status    # update event status
GET  /api/conjunctions/{id}/validation
POST /api/cdm/import          # CCSDS CDM (KVN) import
GET  /api/cdm/{id}/export     # conjunction → CDM text
POST /api/reports/generate    # full report JSON
GET  /api/reports/{id}        # fetch report
POST /api/ai/ask              # AI assistant (deterministic facts only)
GET  /api/dashboard           # mission summary`}</pre>
            </AccordionContent>
          </AccordionItem>
        </Card>
        <Card>
          <AccordionItem value="user" className="border-0">
            <AccordionTrigger className="px-4 py-3 text-xs font-mono font-bold hover:no-underline">
              <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-primary" /> USER GUIDE</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
              <p><b>Beginner mode</b>: simpler panels — "What happened? When? How risky? Why? What should I investigate?"</p>
              <p className="mt-1"><b>Expert mode</b>: full state vectors, RIC, orbital elements, covariance availability, simulation parameters.</p>
              <p className="mt-1"><b>Demo mode</b>: click "START DEMO" for a guided automated showcase that runs without internet.</p>
              <p className="mt-1"><b>Tutorial</b>: read the "Guided Tutorial" tab for a 13-step walk-through.</p>
            </AccordionContent>
          </AccordionItem>
        </Card>
        <Card>
          <AccordionItem value="limitations" className="border-0">
            <AccordionTrigger className="px-4 py-3 text-xs font-mono font-bold hover:no-underline">
              <span className="flex items-center gap-2"><FileText className="h-3 w-3 text-primary" /> LIMITATIONS</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
              <ul className="list-disc list-inside space-y-1">
                <li>Public GP/TLE data is not authoritative.</li>
                <li>Heuristic risk score is not probability of collision.</li>
                <li>Covariance may be unavailable.</li>
                <li>Maneuver simulations are hypothetical.</li>
                <li>SGP4 propagation has limitations (prototype uses Keplerian + J2).</li>
                <li>The tool does not replace professional SSA.</li>
                <li>No autonomous spacecraft commands are produced.</li>
                <li>Validation uses a synthetic reference (not real SOCRATES).</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Card>
      </Accordion>

      <Card className="p-3">
        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-1">PRODUCT MESSAGE</div>
        <p className="text-xs italic">"We make the first layer of conjunction awareness accessible to small satellite operators."</p>
        <p className="text-[10px] text-muted-foreground mt-1">Not: "We predict collisions with AI." The system combines deterministic orbital mechanics, public space-object data, explainable risk analysis, visualization, and hypothetical maneuver analysis into one accessible operator workflow.</p>
      </Card>
    </div>
  );
}

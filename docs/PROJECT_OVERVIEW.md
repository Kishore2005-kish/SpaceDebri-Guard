# SENTINEL — Project Overview

## The Problem

Low Earth Orbit (LEO) is congested. As of 2024, the U.S. Space Surveillance Network tracks more than 25,000 objects larger than 10 cm, and the population of active satellites has exploded — Starlink alone now operates over 5,000 spacecraft, each maneuvering weekly to maintain station and avoid debris. Every time two objects pass within a few kilometers of each other, mission operators face a question that has no margin for error: *is this approach safe, or do I need to burn fuel to move?*

That question is called a **conjunction**. Resolving it today typically requires commercial Space Situational Awareness (SSA) subscriptions costing tens of thousands of dollars per month, or direct access to U.S. 18 SDS / CARA data products that are not freely available to most operators, academic researchers, or hobbyist satellite builders. The first layer of conjunction awareness — "does anything obviously dangerous exist in the next 7 days?" — is gated behind paywalls, proprietary formats, and opaque analytical models.

This is a problem because the first 30 minutes of a conjunction analyst's workflow should not be the bottleneck. Operators need to triage. Researchers need to study. Educators need to demonstrate. None of them need a $50,000 invoice to answer *"which of my satellites has the closest approach this week?"*

## The Solution

**SENTINEL** makes the first layer of conjunction awareness accessible.

SENTINEL is a self-hosted, browser-based conjunction screening tool that ingests publicly available General Perturbations (GP) orbital element data from CelesTrak, propagates every object in the catalog with the SGP4 propagator, screens every active satellite against every other catalogued object, identifies the closest approaches within a configurable time horizon, and produces a transparent, explainable risk assessment — all running on a single SQLite-backed Next.js instance.

What makes SENTINEL different from a black-box SDA dashboard is the transparency. Every conjunction carries:

- A **risk score** (0–100) computed from a published, auditable 5-factor heuristic — miss distance, data uncertainty, relative velocity, encounter geometry, and data freshness. We tell you exactly what the weights are.
- A separate **confidence score** (0–100) that tells you how much to trust the risk score itself, based on the age and provenance of the source elements.
- A full **provenance trail**: which CelesTrak snapshot, which propagator, which screening run, which analyst report. No conjunction is anonymous.
- A **maneuver what-if simulator** that lets an operator test hypothetical collision-avoidance burns (along-track / radial / cross-track, ΔV from 0.05 m/s) and immediately re-screen the post-maneuver trajectory against the entire catalog.
- An independent **SOCRATES validation** path that compares SENTINEL's predicted TCA, miss distance, and relative velocity against the public CelesTrak SOCRATES reference product, with explicit reporting of error in minutes and kilometers.

## What SENTINEL Is Not

SENTINEL does not replace professional SSA. It does not compute a probability of collision (Pc) — that requires covariance data that public GP/OMM elements do not carry. It does not authorize maneuvers, command spacecraft, or issue flight directives. Its risk score is a **triage heuristic**, not a statistical collision probability, and it says so on every screen.

What SENTINEL *does* is lower the barrier to entry for conjunction awareness to "click a button." For researchers, educators, smallsat operators, and anyone building toward a real SSA pipeline, that first layer — accessible, transparent, and free — is the missing piece.

## Reference URLs

- CelesTrak main portal: https://celestrak.org/
- CelesTrak SOCRATES (validation reference): https://celestrak.org/SOCRATES/
- NASA CARA (methodology context): https://www.nasa.gov/cara/
- CCSDS standards search (CDM 508.0-B-1): https://ccsds.org/searchpubs/

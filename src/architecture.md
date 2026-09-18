# FutureCar architecture

## Source layer
Every marketplace/provider gets a modular adapter: sourceId, fetchListings(search), normalize(raw), sourceUrl, attribution. Use only permitted APIs, feeds, licensed datasets, partnerships, or equivalent access.

## Canonical listing
id, source, sourceUrl, title, price, currency, registrationYear, mileageKm, fuel, transmission, powerHp, displacementCc, sellerType, sellerLocation, equipment, images.

## Vehicle identity
Map to make, model, generation, modelYear, trim, engineFamily, engineCode when confidently identifiable, transmission, fuel. Store confidence.

## Enrichment
Add official specs, WLTP/homologation, maintenance schedules, recalls, known issues, market pricing, observed real-world consumption and maintenance estimates. Every fact keeps source, URL, retrievedAt, evidenceType and confidence.

## AI analyst
Input = normalized listing + evidence. Output = summary, price context, strengths, risks, seller questions, ownership costs, evidence and confidence. Keep verified facts, calculations, third-party reports and owner anecdotes separate.

## API shape
GET /api/search
GET /api/listings/:id
GET /api/vehicles/:id
GET /api/vehicles/:id/analysis
GET /api/vehicles/:id/sources
POST /api/analyze

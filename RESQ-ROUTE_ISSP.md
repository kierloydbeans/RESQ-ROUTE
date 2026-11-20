# Information Systems Strategic Plan (ISSP)

## RESQ-ROUTE

### An Enterprise Resource Planning and Spatial Routing System for Localized Disaster Evacuation Logistics and Asset Management

**Course:** IS 111 — IS Strategy, Management, and Acquisition  
**Institution:** University of Caloocan City  
**Prepared for:** Local Disaster Risk Reduction and Management Office (LDRRMO) / Local Government Unit (LGU) disaster-response context  
**Planning horizon:** Three years from institutional approval  
**Document status:** Strategic planning and acquisition baseline

---

## Executive Summary

RESQ-ROUTE is a proposed institutional information system for coordinating disaster alerts, hazard intelligence, evacuation routing, responder deployment, shelter occupancy, relief inventory, and operational accountability. It is positioned as an enterprise resource planning and spatial decision-support platform for an LGU disaster risk reduction and management organization—not merely as a map or incident-reporting application.

The present operating environment commonly relies on phone calls, chat groups, spreadsheets, paper forms, radio updates, and disconnected agency records. These methods remain useful as fallback channels but create avoidable delays and blind spots when an incident develops faster than information can be consolidated. RESQ-ROUTE establishes a shared operational picture through a web coordination dashboard, mobile field workflows, a FastAPI service layer, PostgreSQL/Supabase data services, spatial routing, hazard layers, inventory and shipment records, and auditable role-based actions.

The recommended strategy is a hybrid custom-built acquisition delivered through agile increments and governed as a mission-critical public-sector service. The LGU should retain ownership of business rules, data, workflows, and acceptance criteria while using cloud infrastructure and specialized routing/API providers where they are more economical and reliable than duplicating commodity capabilities. Governance must emphasize availability during crisis, privacy and least privilege, data quality, manual fallback, vendor portability, and continuous exercises.

### Strategic outcomes

- Reduce time from validated incident report to operational assignment.
- Provide dispatchers and coordinators with a common, spatially informed operating picture.
- Improve visibility of evacuee check-ins, shelter capacity, vehicles, responders, relief stocks, and shipments.
- Route people and assets around known hazards and changing road conditions.
- Preserve an accountable record of decisions, approvals, assignments, and data changes.
- Establish a scalable foundation for future sensors, predictive analytics, and inter-agency data exchange.

### Scope boundary

This ISSP addresses strategy, management, architecture, governance, planning, acquisition, and procurement. It does not prescribe source-code implementation. Any AI-generated recommendation remains decision support and requires human validation, especially when lives, access routes, or public warnings are involved.

---

# Part A: Strategic Analysis

## 1. Organization Profile and Problem Statement

### 1.1 Organization profile

The subject organization is an LGU disaster risk reduction and management ecosystem led operationally by the LDRRMO and connected to the mayor's office, barangay leadership, evacuation-center coordinators, public safety and health units, engineering and traffic offices, social welfare personnel, volunteers, utilities, police, fire, and national disaster-response agencies. Its mandate spans prevention and mitigation, preparedness, response, and recovery.

The organization operates across multiple geographic scales. A city or municipality must maintain a strategic view of hazards and resources while barangays and field teams require immediate, location-specific instructions. The operating model is therefore federated: central coordinators set priorities and allocate scarce resources; field personnel validate conditions and execute assignments; evacuation centers record people, capacity, and stocks; citizens and community volunteers provide reports and request assistance.

### 1.2 Current and legacy workflow baseline

In a manual or partially digitized baseline, an incident may move through the following sequence:

1. A citizen, barangay official, responder, or partner agency reports an incident through phone, radio, social media, or a messaging group.
2. A dispatcher records essential details in a notebook, spreadsheet, or chat thread and attempts to validate the report.
3. A coordinator contacts available responders and vehicles, often consulting separate lists or personal knowledge.
4. A route is selected using static maps, verbal local knowledge, or a general-purpose navigation service that may not reflect a current flood, road closure, or debris hazard.
5. Evacuation-center capacity, household arrivals, relief stocks, and vehicle movements are updated independently.
6. Status reports are consolidated after the fact for management, audit, and post-incident reporting.

This workflow is resilient when incidents are small and relationships are close, but its coordination quality degrades as volume, geography, and hazard uncertainty increase.

### 1.3 Problem statement

The organization lacks a sufficiently integrated and timely information environment for converting fragmented reports into validated, prioritized, and spatially informed action. The resulting problems include:

- **Dispatch bottlenecks:** incident intake, triage, assignment, and status updates pass through too many manual handoffs.
- **Operational blind spots:** coordinators cannot consistently see active incidents, responder availability, vehicle position, road hazards, shelter occupancy, and relief stocks together.
- **Sub-optimal routing:** static or generic routes can direct people and assets through flooded, blocked, unsafe, or over-capacity areas.
- **Evacuee visibility gaps:** household and individual arrivals may be recorded late, duplicated, or not linked to a center and responsible coordinator.
- **Inventory and shipment leakage:** relief goods can be available in one center while another reports shortage because stock and transfers are not synchronized.
- **Weak accountability:** decisions made in calls and chats are difficult to reconstruct, approve, measure, or audit.
- **Data and continuity risk:** sensitive evacuee data and operational maps may be exposed, altered, or unavailable during a peak event.

RESQ-ROUTE addresses these issues by creating a governed operational system of record and decision-support layer while preserving radio, phone, and paper fallbacks.

## 2. Business Strategy and IS Alignment

### 2.1 Porter’s Five Forces in disaster-response operations

Porter's framework is adapted here to analyze the pressures affecting the organization's ability to deliver timely public safety outcomes. The objective is not commercial competition; it is strategic capacity under constrained resources and uncertain demand.

| Force | Disaster-response interpretation | Strategic implication for RESQ-ROUTE |
|---|---|---|
| Threat of new entrants | New hazards, new informal responders, emerging communication channels, and rapidly changing incident patterns can alter the operating environment. | Use modular data and integration boundaries so new hazard feeds, agencies, and response partners can be onboarded without redesigning the core system. |
| Bargaining power of affected communities and agencies | Residents, barangays, hospitals, schools, utilities, volunteers, and national agencies depend on response quality and may provide incomplete, conflicting, or time-sensitive information. | Provide trusted reporting, clear status communication, validation workflows, and role-specific access rather than relying on one unverified channel. |
| Bargaining power of suppliers | Cloud, mapping, routing, connectivity, device, and specialized analytics vendors can impose cost, availability, and data-portability constraints. | Use open standards, documented interfaces, exportable data, service-level agreements, and fallback routing/communication procedures. |
| Rivalry among response units | Agencies can compete for scarce vehicles, personnel, attention, relief goods, and command authority, especially when roles are unclear. | Establish a shared operating picture, assignment ownership, escalation rules, and auditable resource-allocation decisions. |
| Threat of substitutes | Phone trees, radio, spreadsheets, paper logs, social media, and standalone navigation tools remain available and may be preferred under pressure. | Design RESQ-ROUTE to complement fallback channels, support offline/low-connectivity procedures, and demonstrate faster, more reliable coordination. |

The strategic response is operational differentiation: the organization improves its public-service capability by being faster, more coordinated, more transparent, and more resource-aware than a fragmented workflow permits.

### 2.2 Value Chain Model

| Value-chain activity | Baseline challenge | RESQ-ROUTE contribution |
|---|---|---|
| Inbound logistics | Relief goods, fuel, vehicles, equipment, and donated supplies arrive through separate records. | Inventory registry, center-level stock visibility, shipment records, receiving confirmation, and exception reporting. |
| Operations / evacuation management | Incident triage, evacuation decisions, responder assignment, and household check-in are distributed across channels. | Incident workflow, hazard map layers, assignment controls, household/evacuee records, shelter status, and real-time operational updates. |
| Outbound logistics and distribution | Goods and responders may be sent without a consolidated view of need, route, capacity, or delivery status. | Dispatch and shipment coordination, spatial route planning, delivery status, and allocation history. |
| Service and public communication | Residents need accurate guidance while managers need a defensible status picture. | Citizen-facing reporting and routing functions, center information, alerts, dashboards, and role-based communication. |
| Firm infrastructure | Policy, governance, budgeting, and reporting are difficult to connect to operational evidence. | Management dashboards, audit logs, service metrics, data ownership, and post-incident review evidence. |
| Human-resource management | Responder availability, roles, and skills may be maintained manually. | Responder profiles, presence/status, role-based access, assignment history, and training/roster integration points. |
| Technology development | Mapping, routing, databases, and communications are often procured independently. | Enterprise architecture, API standards, reusable spatial data, integration governance, and phased modernization. |
| Procurement | Emergency purchases and vendor dependence can reduce transparency and portability. | Outcomes-based requirements, service levels, security clauses, exit provisions, and documented acceptance tests. |

### 2.3 Alignment with business strategy

RESQ-ROUTE directly supports three strategic capabilities:

- **Organizational agility:** validated information reaches the responsible role quickly; workflows can be re-prioritized as hazard severity and resource availability change.
- **Rapid response:** spatial triage, assignment, routing, and status updates shorten the time between detection, decision, deployment, and confirmation.
- **Asset optimization:** the organization can allocate vehicles, responders, shelters, stocks, and routes based on current need and capacity rather than duplicated or stale records.

The system is aligned when every major feature is tied to a measurable operational outcome: time-to-acknowledge, time-to-assign, route safety, stock-out avoidance, shelter utilization, responder accountability, or evidence quality for review.

## 3. Digital Transformation

### 3.1 Immediate core technologies

| Technology | Strategic role in the core system | Management consideration |
|---|---|---|
| Spatial database / GIS, including PostgreSQL-compatible spatial data and PostGIS capabilities | Stores hazards, roads, centers, assets, incidents, and geometries so location is part of the decision model. | Establish authoritative layers, update ownership, coordinate systems, validation, and version history. |
| MapLibre GL JS | Presents interactive operational and hazard maps in the web interface using configurable map styles. | Control style availability, licensing, caching, and offline/low-bandwidth alternatives. |
| Cloud infrastructure and Supabase services | Provides managed PostgreSQL-compatible data, authentication/integration services, backups, and scalable deployment options. | Require encryption, access segregation, backup evidence, region/sovereignty review, and exit/export procedures. |
| FastAPI service layer | Exposes governed operational functions and integrates web/mobile clients with data and external services. | Apply API versioning, observability, rate limits, input validation, and documented ownership. |
| GraphHopper and other routing services | Calculates routes that can incorporate road-network and hazard constraints. | Maintain provider fallback, cache appropriate results, monitor quotas, and require human review for high-risk routes. |
| Real-time APIs and WebSockets | Disseminates telemetry, status changes, alerts, and operational updates with low delay. | Define event ownership, delivery guarantees, reconnection behavior, and audit requirements. |
| Groq AI integration / AI-assisted analytics | Supports structured summaries, hazard-vision or spatial fallback assistance, and analyst decision support. | No autonomous dispatch; protect prompts/data; log model-assisted outputs; require confidence and human validation. |

The repository baseline already reflects a React/Vite dashboard, Flutter mobile client, FastAPI backend, PostgreSQL/Supabase integration, routing services, hazard workflows, inventory/shipment modules, WebSockets, and audit logging. These are treated as implementation foundations subject to formal testing, security review, and operational acceptance.

### 3.2 Future-iteration technologies

The following should be staged after the core workflows are stable:

- IoT water-level, rainfall, river, traffic, and facility sensors with calibration and data-quality controls.
- Automated drone or robotics logistics only after aviation, safety, chain-of-custody, and operating-authority requirements are approved.
- Predictive demand and hazard models using validated historical and near-real-time data.
- Digital identity or federated authentication for trusted inter-agency access.
- Satellite or aerial imagery ingestion for post-event assessment.
- Edge/offline synchronization for barangays with intermittent connectivity.

Technology adoption should follow operational readiness, not novelty. A sensor that produces ungoverned data or a model that cannot be explained to a dispatcher creates additional risk rather than transformation.

## 4. Enterprise Architecture

### 4.1 Four-layer architecture

**Business Layer — what the organization does**

The business layer covers incident reporting and validation, emergency alert management, hazard assessment, evacuation planning, responder and vehicle dispatch, evacuation-center coordination, evacuee/household check-in, inventory and shipment management, public communication, and post-incident accountability. It defines actors, approvals, service levels, escalation rules, and manual fallbacks.

**Data Layer — what the organization knows**

The data layer consists of relational operational records, spatial geometries, hazard layers, road and center data, responder and vehicle profiles, household/evacuee records, inventory and shipment records, telemetry, authentication data, and immutable or protected audit events. Secure cloud storage, backup, retention, data classification, and data-quality rules are part of this layer.

**Application Layer — how work is performed**

The application layer includes React/Vite web dashboards for administrators, coordinators, dispatchers, center coordinators, rescuers, and citizens; mobile interfaces packaged for field use; the FastAPI business-service layer; routing and hazard services; real-time event delivery; notifications; and reporting. Each role should see only the workflows and data required for its responsibility.

**Technology Layer — what enables the services**

The technology layer includes cloud-hosted compute, PostgreSQL/Supabase services, PostGIS spatial indexing, FastAPI/ASGI services, MapLibre GL JS, GraphHopper and fallback routing engines, WebSocket infrastructure, mobile devices, network connectivity, monitoring, backups, and identity/security controls.

### 4.2 Architectural position of RESQ-ROUTE

RESQ-ROUTE is the integrated solution spanning all four layers. It is not only the dashboard and not only the database. It is the governed connection between operational policy, trusted spatial and transactional data, role-based applications, and resilient technology services.

**Architecture diagram placeholder:** Insert a four-tier diagram showing Business → Data → Application → Technology, with external actors (citizens, barangays, responders, hospitals, agencies, vendors) connected through controlled interfaces. Show routing providers, cloud services, mobile clients, and manual fallback channels around the core.

Architectural principles are: mission first; secure by design; least privilege; authoritative data ownership; API-first integration; open/exportable data; graceful degradation; human accountability; and measurable service quality.

## 5. IT Governance and Risk Management

### 5.1 Governance model

The LDRRMO should own operational policy and service outcomes. An executive sponsor (for example, the city/municipal administrator or designated disaster-management executive) should approve priorities and funding. An information systems steering committee should include disaster operations, ICT, finance/procurement, legal/privacy, barangay and evacuation-center representation, and relevant partner agencies.

The steering committee approves the roadmap, risk appetite, data-sharing agreements, major changes, service levels, and post-incident improvements. A system owner manages the product backlog and acceptance criteria; a data protection/privacy officer advises on personal data; an ICT service manager oversees availability, incidents, suppliers, backups, and continuity.

### 5.2 Risk and control matrix

| Risk | Impact | Preventive/detective controls | Framework alignment |
|---|---|---|---|
| GIS or hazard-layer tampering | Unsafe routes, incorrect public guidance, or misallocation of teams. | Role separation, approved publishers, geometry validation, versioning, protected master layers, audit logs, and independent review of critical changes. | ISO 27001 access/control objectives; COBIT risk optimization and managed change. |
| Unauthorized dispatch-control access | Incorrect deployment, impersonation, or operational disruption. | MFA where feasible, RBAC, least privilege, session controls, approval for high-impact actions, device protection, and regular access review. | ISO 27001 identity/access controls; COBIT managed security services. |
| Database or cloud downtime during a peak crisis | Loss of visibility and delayed response. | Availability SLOs, backups, tested restore, multi-zone/provider resilience where justified, health monitoring, incident runbooks, cached maps, and paper/radio fallback. | ITIL availability/incident/continuity management; ISO 27001 continuity controls. |
| Evacuee privacy breach | Harm, discrimination, legal exposure, and loss of public trust. | Data minimization, purpose limitation, encryption, retention schedule, consent/notice where applicable, masked reporting, privacy impact assessment, breach response, and controlled exports. | ISO 27001 information protection; applicable Philippine privacy requirements; COBIT compliance. |
| Routing provider failure or wrong route | Unsafe deployment or inability to reach affected areas. | Provider health checks, cached/alternate routes, road-hazard overrides, route freshness indicators, human validation, and no autonomous dispatch. | ITIL service continuity; COBIT managed vendors and risk. |
| AI hallucination or biased recommendation | Misleading summaries, unfair prioritization, or false confidence. | Human-in-the-loop, source traceability, confidence/uncertainty display, restricted data input, prompt/output logs, model-change review, and manual override. | COBIT risk optimization; ISO 27001 secure use of information assets. |
| Connectivity and power disruption | Field teams cannot synchronize or receive assignments. | Offline forms/queues, local caches, power banks, radio/phone fallback, synchronization conflict rules, and drills. | ITIL continuity and incident management. |
| Vendor lock-in or cost escalation | Reduced negotiating power and inability to migrate. | Open schemas, data export, API documentation, usage budgets, SLA/credits, exit assistance, and secondary-provider evaluation. | COBIT supplier and portfolio governance. |
| Poor data quality or duplicate records | Misleading occupancy, inventory, or incident decisions. | Required fields, validation, deduplication, stewardship, reconciliation, data-quality dashboards, and post-event correction workflow. | COBIT managed data; ISO 27001 integrity controls. |

### 5.3 Framework operating practices

- **ISO 27001:** maintain an information-security risk register, statement of applicability, access reviews, asset inventory, incident response, supplier controls, backup evidence, and continual improvement records.
- **ITIL:** operate service desk and incident categories, availability and continuity plans, change enablement, problem management, service-level reporting, and post-incident reviews.
- **COBIT:** map strategic objectives to governance and management objectives, define accountable owners, measure capability and risk, and ensure benefits realization and supplier oversight.

## 6. IS Planning

### 6.1 SWOT analysis

| Strengths | Weaknesses |
|---|---|
| Integrated view of incidents, hazards, routes, assets, centers, evacuees, and inventory. | Dependence on connectivity, external maps/routing, and disciplined data entry. |
| Localized workflows aligned with LGU and barangay operations. | Requires sustained training, data stewardship, and operational ownership. |
| Existing web, mobile, backend, spatial, real-time, and audit foundations. | Maturity, security, availability, and performance still require formal acceptance testing. |
| Role-based coordination and auditable actions. | Legacy records and partner systems may be inconsistent or difficult to integrate. |
| Extensible architecture for analytics and future sensors. | Budget and procurement cycles may delay improvements. |

| Opportunities | Threats |
|---|---|
| Inter-agency data sharing and standardized emergency operating picture. | Typhoons, floods, earthquakes, fire, epidemics, and compound hazards can exceed planned capacity. |
| Cloud elasticity, open mapping, and declining cost of digital services. | Cyberattack, ransomware, misinformation, and data tampering during crisis. |
| Evidence-based budgeting and performance reporting. | Vendor outages, API quota changes, price increases, or service withdrawal. |
| Community reporting and volunteer participation. | Privacy violations or public mistrust could reduce adoption. |
| Predictive models, sensors, and offline/edge capability. | Power, telecom, device, and GPS failures in affected areas. |

### 6.2 PESTLE analysis

| Dimension | External condition | Planning response |
|---|---|---|
| Political | Local mandates, executive priorities, inter-agency authority, and barangay coordination affect adoption. | Secure an executive charter, define roles, align with DRRM plans, and formalize data-sharing and escalation agreements. |
| Economic | Disasters impose high direct and indirect costs; public budgets and procurement timelines are constrained. | Use phased investment, total-cost-of-ownership analysis, reuse open standards, and measure avoided delay/waste. |
| Social | Community trust, digital literacy, language, accessibility, and willingness to share information affect reporting and check-in. | Provide inclusive channels, clear notices, assisted registration, accessibility testing, and community exercises. |
| Technological | Connectivity, power, device age, cloud dependency, interoperability, AI limitations, and map freshness constrain outcomes. | Design for degradation, use APIs and exportable data, test offline procedures, and govern AI as assistive. |
| Legal | Privacy, records retention, procurement, public accountability, cybersecurity, and emergency authority requirements apply. | Involve legal/privacy officers, document purpose and retention, use contract controls, and maintain audit evidence. |
| Environmental | Flooding, heat, terrain, storm intensity, debris, and changing road conditions affect routes and facilities. | Maintain current hazard layers, validate routes in the field, use sensor/data quality plans, and review climate-risk assumptions. |

### 6.3 Gap analysis

| Capability | Current baseline | Target state | Gap-closing initiative | Success measure |
|---|---|---|---|---|
| Incident intake | Multi-channel, manually consolidated. | Single governed intake with validation and priority. | Standard incident taxonomy and triage workflow. | Median report-to-acknowledgement time. |
| Dispatch | Phone/chat and separate rosters. | Role-based assignment with availability and status. | Responder/vehicle registry, assignment rules, audit trail. | Report-to-assignment time; unacknowledged assignments. |
| Spatial routing | Static knowledge or generic navigation. | Hazard-aware, reviewable routes with fallback. | Spatial layers, routing integration, route freshness and override policy. | Route exception rate; documented route validation. |
| Evacuee tracking | Paper/spreadsheet or center-specific lists. | Center-scoped, privacy-controlled check-in and occupancy view. | Household/evacuee data model, QR/check-in workflow, retention policy. | Reconciliation accuracy; center reporting timeliness. |
| Relief logistics | Fragmented stock and shipment records. | Center-level stock, transfers, shipments, and exceptions. | Inventory master data and receiving/dispatch controls. | Stock-out frequency; shipment confirmation time. |
| Data governance | Informal ownership and correction. | Named data stewards, quality rules, audit, and retention. | Data governance charter and quality dashboard. | Completeness, duplicate, and stale-record rates. |
| Service continuity | Manual fallbacks without regular exercises. | Tested continuity with offline, radio, restore, and recovery procedures. | BCP/DR plan, drills, restore tests, service SLOs. | Recovery time/objective evidence; drill pass rate. |
| Security and privacy | Controls vary by tool and role. | Consistent RBAC, logging, review, privacy-by-design. | Security baseline, PIA, access recertification, incident playbooks. | Critical findings closed; access-review completion. |
| Performance management | Post-event reporting is labor intensive. | Near-real-time operational KPIs and after-action analytics. | Executive dashboard and review cadence. | KPI adoption; after-action closure rate. |

### 6.4 Strategic roadmap

| Phase | Timing | Priority activities | Exit criteria |
|---|---:|---|---|
| 0. Mobilize and govern | Months 0–3 | Approve charter, assign owners, confirm scope, inventory data/vendors, conduct privacy/security assessment, define KPIs and baseline. | Signed governance charter, risk register, data owners, approved product backlog. |
| 1. Stabilize the core | Months 4–9 | Harden authentication/RBAC, incident and hazard workflows, responder/vehicle registry, core spatial layers, audit logs, backups, and service monitoring. | Operational acceptance for controlled pilot; restore and access tests pass. |
| 2. Integrate logistics and evacuation | Months 10–18 | Deploy center occupancy, household/evacuee check-in, inventory, shipments, dispatch, routing fallback, WebSocket status, and field training. | Multi-barangay exercise demonstrates measurable improvement against baseline. |
| 3. Scale and institutionalize | Months 19–27 | Expand partners and centers, formalize SLAs, improve analytics, integrate external feeds, conduct procurement review, and embed ITIL routines. | Service report, supplier review, continuity drill, and benefits review accepted. |
| 4. Optimize and innovate | Months 28–36 | Evaluate sensors, predictive models, offline edge sync, imagery, and advanced automation based on evidence and risk. | Investment cases approved individually; no innovation bypasses governance. |

Benefits should be reviewed quarterly by the steering committee and after every major incident or exercise. Roadmap changes should be justified by operational evidence, not only by technical availability.

---

# Part B: Acquisition

## 7. IS Acquisition Strategy

### 7.1 Option evaluation

| Option | Benefits | Limitations | Assessment for RESQ-ROUTE |
|---|---|---|---|
| Build in-house/custom | Maximum local fit, ownership, and control. | Requires scarce skills, delivery discipline, security capability, and long-term support. | Necessary for distinctive workflows and data model, but not sufficient alone. |
| Buy commercial off-the-shelf | Faster procurement and mature commodity functions. | May not fit barangay/LGU processes, local hazard logic, or data ownership needs. | Suitable for commodity components, not the complete operating model. |
| Customize/package | Balances fit and speed. | Customization can create upgrade and vendor-dependence risk. | Viable if interfaces, source/configuration ownership, and exit terms are protected. |
| Lease/subscription | Predictable initial cost and managed updates. | Recurring cost, availability and pricing dependence, possible data lock-in. | Appropriate for selected cloud/API services under strong SLA and exit controls. |
| Cloud | Elasticity, managed operations, backup, and faster scaling. | Connectivity, sovereignty/privacy, outage, and supplier risks. | Recommended hosting model with continuity and portability requirements. |
| Outsource/managed service | Access to specialists and 24/7 capability. | Reduced direct control and institutional knowledge if poorly governed. | Use selectively for hosting, support, security monitoring, or specialized APIs. |

### 7.2 Recommended hybrid custom-built approach

RESQ-ROUTE should be acquired and governed as a hybrid custom-built system:

- **Custom-owned core:** business rules, workflows, role model, operational data model, spatial hazard logic, dashboards, mobile processes, audit requirements, and reporting remain controlled by the organization.
- **Managed commodity services:** cloud infrastructure, managed database capabilities, identity support, map tiles, routing engines, messaging, and selected analytics are procured where they reduce cost and operational risk.
- **Agile delivery:** work is released in small increments with dispatcher, responder, center, citizen, ICT, legal/privacy, and procurement representatives participating in discovery, demonstration, acceptance, and retrospective review.
- **Security and continuity by increment:** no feature is considered complete without access control, audit, data retention, error handling, monitoring, backup impact, and fallback procedures.
- **Open and portable foundation:** the LGU receives documented APIs, schemas, configuration, data exports, runbooks, test evidence, and transition assistance.

This approach balances cost efficiency with localization. A full COTS suite would likely require expensive adaptation to local disaster workflows, while a fully in-house stack would duplicate commodity capabilities and increase operational burden. The hybrid model concentrates custom investment on the organization's differentiating capability—localized, spatially informed disaster coordination—and uses vendors for scalable services under contractual control.

### 7.3 Acquisition governance and decision gates

1. **Needs and feasibility gate:** validate outcomes, baseline pain points, users, data, and legal/privacy constraints.
2. **Architecture and security gate:** approve target architecture, integrations, data classification, threat model, continuity requirements, and portability.
3. **Market and procurement gate:** compare build, buy, customize, cloud, and managed options using total cost, risk, capability, and exit criteria.
4. **Pilot gate:** accept a controlled multi-role pilot with realistic incident, routing, inventory, and check-in scenarios.
5. **Production gate:** require operational runbooks, training, support coverage, restore test, access review, and signed acceptance.
6. **Benefits and renewal gate:** assess service levels, security, costs, adoption, outcomes, and vendor performance before renewal or expansion.

## 8. Procurement and Request for Proposal (RFP) / Terms of Reference (TOR)

### 8.1 Procurement objective

The procuring entity seeks a qualified supplier or consortium to provide implementation, cloud-enabled hosting, integration, deployment, training, and support services for RESQ-ROUTE. The procurement shall preserve LGU ownership of operational requirements and data while ensuring reliable delivery of managed services and specialized components.

### 8.2 Scope of work

The selected provider shall:

1. Validate requirements with LDRRMO, ICT, barangays, evacuation centers, responders, and data/privacy stakeholders.
2. Configure, develop, integrate, test, document, and deploy the RESQ-ROUTE platform using the approved architecture.
3. Provide secure cloud hosting and managed database operations.
4. Integrate routing, mapping, notification, and approved external data services.
5. Support web dashboard and mobile field deployment, including device enrollment and updates.
6. Implement monitoring, backup, recovery, incident response, and service reporting.
7. Deliver training, exercises, administrator enablement, user guides, and knowledge transfer.
8. Provide post-implementation warranty and ongoing support under measurable service levels.

### 8.3 Minimum functional requirements

| Capability | Minimum requirement |
|---|---|
| Identity and access | Named accounts, role-based permissions, least privilege, strong authentication options, access review, and controlled administrator actions. |
| Incident and alert management | Intake, validation, severity, assignment, status, escalation, attachments/evidence, timestamps, and closure review. |
| Hazard and spatial intelligence | Managed hazard layers, road/center/asset geometries, geometry validation, versioning, map display, and change audit. |
| Routing | GraphHopper or approved equivalent, hazard-aware constraints, route freshness, provider failure handling, and dispatcher override/confirmation. |
| Dispatch and assets | Responder/vehicle roster, availability/presence, assignment, acknowledgement, status, reassignment, and accountability. |
| Evacuation centers | Center registry, capacity, occupancy, services, coordinator access, household/evacuee check-in, and reconciliation. |
| Inventory and shipments | Item master, center stocks, thresholds, receiving, transfers, shipments, confirmation, and exception reports. |
| Real-time operations | WebSocket or equivalent status/event updates with reconnection and event/audit behavior. |
| Mobile field use | GPS-assisted field workflows, secure local queue or offline procedure, sync/conflict handling, device control, and battery/connectivity guidance. |
| Reporting and audit | Executive and operational dashboards, exportable reports, immutable/protected audit events, and after-action evidence. |
| AI-assisted functions | Optional, bounded decision support with human approval, source traceability, confidence/limitations, and no autonomous life-safety decisions. |

### 8.4 Technical and service requirements

**Cloud hosting and infrastructure**

- Production, staging, and development environments must be logically separated.
- Hosting must support encrypted transport and encrypted storage, secure secrets management, monitored compute, managed PostgreSQL-compatible storage, backup, restoration, and scalable capacity.
- Supplier shall state data-center/region options, subcontractors, certifications or independent assurance, maintenance windows, and incident-notification commitments.
- Supplier shall provide infrastructure diagrams, asset inventories, configuration baselines, monitoring dashboards, and recovery runbooks.
- The service must support data export in documented, machine-readable formats and transition assistance at contract end.

**API and integration services**

- Routing and map APIs shall provide documented quotas, rate limits, pricing, service availability, attribution/licensing, and failure behavior.
- APIs must use versioned contracts, authentication, authorization, input validation, rate limiting, observability, and documented error responses.
- External data feeds must identify source, update frequency, quality status, ownership, and retention.
- The solution shall support approved alternatives or degraded manual operation when a provider is unavailable.

**Hardware and mobile deployment devices**

- Devices shall be suitable for field operations, with protective cases, GPS, camera where needed for evidence, adequate battery, charging/power-bank support, and secure update capability.
- Supplier shall specify supported operating systems, minimum specifications, mobile-device management options, device encryption, screen-lock policy, remote disable/wipe where lawful, and replacement/repair process.
- Procurement should include a device pilot in representative connectivity, weather, and user conditions.

**Support and managed operations**

- Supplier shall provide a service desk, severity definitions, escalation contacts, maintenance notices, incident communications, problem management, and post-incident reports.
- Support must cover critical operational periods according to the agreed service tier, including an emergency escalation path.
- Supplier shall conduct regular service reviews covering availability, incidents, response times, backups, security events, capacity, costs, and open risks.

### 8.5 Indicative service levels

Final values shall be confirmed during procurement and risk assessment, but proposals should address:

| Service measure | Indicative requirement |
|---|---|
| Production availability | At least 99.5% monthly excluding agreed maintenance, with higher target evaluated for critical periods. |
| Critical incident acknowledgement | Within 15 minutes during contracted coverage; escalation to named incident lead. |
| Critical incident communications | Initial status within 30 minutes and regular updates until service is restored. |
| Backup | Daily minimum for operational data, with recovery-point and retention requirements defined by data classification. |
| Restore testing | At least quarterly for production-critical data and after material architecture changes. |
| Security notification | Prompt notification of suspected compromise, subject to legal requirements and agreed time limits. |
| Support reporting | Monthly dashboard plus quarterly service review and improvement plan. |

### 8.6 Security, privacy, and compliance clauses

The bidder shall submit:

- Information-security policy and relevant assurance/certification evidence.
- Data-flow diagram, data classification, access-control model, encryption approach, logging, vulnerability management, and incident response plan.
- Privacy impact assessment support, retention/deletion controls, data-subject request process, breach cooperation, and subcontractor list.
- Secure development and change-management practices, including testing evidence for releases.
- Personnel screening/training appropriate to privileged access.
- Business continuity and disaster-recovery plans, including dependencies on routing, maps, cloud, telecom, and identity providers.

The contract shall state that operational data, metadata, configurations, audit evidence, and derived reports created for the LGU are owned or controlled by the procuring entity subject to law. The supplier may process them only for authorized purposes.

### 8.7 Deliverables and acceptance

Minimum deliverables are:

1. Inception report, validated requirements, stakeholder map, and implementation plan.
2. Target architecture, security/privacy design, data dictionary, integration catalogue, and continuity plan.
3. Configured/developed platform, mobile package, environments, deployment scripts or equivalent operational procedures.
4. Test strategy, test cases, security test results, performance evidence, accessibility checks, and defect register.
5. Data migration and reconciliation plan with migration results and sign-off.
6. User, administrator, support, backup/restore, and incident runbooks.
7. Training materials, train-the-trainer sessions, drills, and attendance/evaluation records.
8. Pilot report, production readiness assessment, and signed acceptance certificate.
9. Warranty, support, service-level, and transition/exit documentation.

Acceptance shall be scenario-based. At minimum, the supplier must demonstrate: a validated flood incident; hazard-aware route selection; responder and vehicle assignment; center check-in; inventory transfer; provider outage fallback; loss of connectivity; restoration from backup; unauthorized access rejection; audit reconstruction; and executive after-action reporting.

### 8.8 Bidder qualification and evaluation criteria

The procuring entity may evaluate proposals using a weighted, transparent rubric such as:

| Criterion | Indicative weight |
|---|---:|
| Functional and local disaster-response fit | 25% |
| Architecture, security, privacy, continuity, and interoperability | 25% |
| Delivery team, methodology, training, and knowledge transfer | 15% |
| Cloud/API/device/support service quality and SLA | 15% |
| Total cost of ownership and price reasonableness | 15% |
| Relevant experience and references | 5% |

The exact weighting shall follow applicable procurement rules. Price must not be assessed independently of lifecycle cost, resilience, security, portability, and evidence of delivery capability.

### 8.9 Required bidder response

Each proposal should include: company profile; relevant LGU/DRRM references; proposed architecture; compliance matrix; implementation schedule; staffing and governance; security/privacy response; cloud and supplier dependencies; SLA; pricing by phase and recurring service; assumptions; risks; warranty; data ownership; exit plan; and deviations from this TOR.

### 8.10 Procurement conclusion

The RFP/TOR should procure a sustainable operational capability rather than a one-time application delivery. The successful provider must leave the organization more capable of governing its data, operating its services, measuring its outcomes, and changing suppliers when necessary. RESQ-ROUTE is strategically successful when the LDRRMO can make faster, safer, more accountable decisions during an actual emergency and can demonstrate how those decisions were supported by trusted information.

---

## Conclusion

RESQ-ROUTE provides a coherent ISSP response to a real organizational problem: disaster resources and decisions are distributed across people, places, agencies, and time, while legacy coordination methods do not consistently provide a shared, current, and auditable picture. Its value lies in the alignment of business process, spatial data, enterprise architecture, governance, acquisition, and measurable operational outcomes.

The recommended three-year program begins with governance and stabilization, expands into integrated evacuation and logistics operations, and only then evaluates advanced sensors, predictive analytics, and automation. This sequence protects public trust and scarce resources while creating a practical path from fragmented manual coordination to resilient, locally governed digital disaster operations.

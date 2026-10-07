# Fraud Detection & Future Group Integration Specification

## 1. Overview
The Land Registration Hyperledger Fabric chaincode now includes an automated **14-Rule Fraud Detection Engine** (`fraud-detector.js`). 

Whenever a land registration or transfer application is submitted, the engine evaluates all 14 rules simultaneously against the proposed transaction payload and authoritative ledger master records, producing a numeric **Fraud Score (0-100)** and Risk Level (`LOW`, `HIGH`, `CRITICAL`). Applications with Critical frauds are automatically prevented from moving forward into official revenue workflows and are flagged on-chain as `flagged_fraud`.

---

## 2. 14 Fraud Rules Matrix

| Rule # | Fraud Name | On-Chain Key Fields | Decision Rule | Status |
|---|---|---|---|---|
| **1** | **Double / Multiple Sale** | `surveyNumber`, `activeTransactionId`, `transactionStatus` | Conflicting active transaction already in progress for survey → CRITICAL | Complete On-Chain |
| **2** | **Sale Beyond Available Extent** | `requestedArea`, `totalVerifiedArea`, `committedArea` | `requestedArea > (verifiedArea - committedArea)` → CRITICAL | **Uses Mock Extent Adapter** *(Dependent on Extent Team)* |
| **3** | **Unauthorized Ownership / Impersonation** | `sellerId`, `currentOwnerId`, `transferAuthorityType`, `authorizationId` | `sellerId != ownerId` AND no valid PoA/Legal Heir auth → CRITICAL | **Uses Mock Auth Adapter** *(Dependent on Identity/PoA Team)* |
| **4** | **Title-Chain Inconsistency** | `titleChain`, `titleChainBroken` | Gaps or broken lineage in prior transaction history → HIGH/CRITICAL | Complete On-Chain |
| **5** | **Unauthorized Mutation** | `transactionType`, `sourceTransactionId`, `authorizedBy` | Mutation without registered deed reference or revenue official signature → CRITICAL | Complete On-Chain |
| **6** | **Forged / Fake Land Document** | `documentContentHash`, `authoritativeDocumentHash` | Document SHA-256 hash != official digital deed hash → CRITICAL | Complete On-Chain |
| **7** | **Document–Official Record Mismatch** | `documentExtractedSurveyNumber`, `documentExtractedOwnerId`, `documentExtractedArea` | Parameters extracted from deed conflict with authoritative ledger → HIGH | Complete On-Chain |
| **8** | **Joint Ownership / Share Violation** | `owners`, `areaShare`, `consentingOwnerIds` | Area > co-owner's individual share OR missing mandatory co-owner consent → CRITICAL | **Uses Mock Consent Adapter** *(Dependent on Multi-owner Team)* |
| **9** | **Restricted / Prohibited Land Transfer** | `isRestricted`, `restrictionType` | Land marked prohibited (e.g., Section 22-A Gazette list) → CRITICAL | Complete On-Chain |
| **10** | **Government / Assigned Land Transfer** | `landOwnershipCategory`, `specialGovernmentNOC` | Category is `ASSIGNED`/`GOVERNMENT`/`WAQF` without statutory NOC → CRITICAL | Complete On-Chain |
| **11** | **Acquisition Conflict** | `acquisitionStatus`, `acquisitionReferenceId` | Ongoing statutory land acquisition without transfer exemption → CRITICAL | Complete On-Chain |
| **12** | **Active Dispute / Litigation Conflict** | `disputeStatus`, `disputeId` | Active court injunction or stay order on parcel → HIGH | Complete On-Chain |
| **13** | **Duplicate / Reused Document** | `documentContentHash`, `doc_usage` composite key | Same deed hash already consumed and bound to an earlier finalized sale → CRITICAL | Complete On-Chain |
| **14** | **Parcel / Survey / Boundary Identity Fraud** | `submittedBoundaryGeometry`, `authoritativeBoundaryGeometry` | GIS spatial polygon mismatch, encroachment, or altered coordinates → CRITICAL | **Uses Mock GIS Adapter** *(Dependent on GIS/Cadastral Team)* |

---

## 3. Mock Adapters (Future Group Integration Points)

Located inside: [`chaincode/land-registration/lib/fraud-detector.js`](file:///e:/PBL/Project/25CSMR09/New%20folder/chaincode/land-registration/lib/fraud-detector.js)

When the other project groups finalize their modules, replace only the adapter bodies inside `MockAdapters`:

### Adapter 1: Extent Ledger (`MockAdapters.getExtentBalance`)
* **Purpose:** Queries the authoritative subdivision/extent balance ledger.
* **Current Mock:** Derives available area from `totalVerifiedArea - committedArea` or defaults to baseline.
* **Future Replacement:** Call subdivision ledger API / chaincode cross-contract invoke.

### Adapter 2: Identity & Authorization Registry (`MockAdapters.verifySellerAuthorization`)
* **Purpose:** Verifies Power of Attorney (PoA) and Legal Heirship validity.
* **Current Mock:** Accepts `AUTH-VALID*` tokens; checks non-empty authorization ID.
* **Future Replacement:** Call Aadhaar biometric auth + Sub-Registrar PoA registry.

### Adapter 3: Joint Ownership Consent Registry (`MockAdapters.verifyJointOwnershipAndConsent`)
* **Purpose:** Multi-signature / consent collection from all co-owners.
* **Current Mock:** Verifies `requestedArea <= owner.areaShare` and checks `consentingOwnerIds` matches other co-owners.
* **Future Replacement:** Call multi-signatory wallet / mobile OTP consent microservice.

### Adapter 4: GIS / Cadastral Boundary Engine (`MockAdapters.verifyBoundaryGeometry`)
* **Purpose:** Spatial intersection check of proposed boundary GeoJSON vs Bhu-Naksha / RoR Cadastral maps.
* **Current Mock:** Validates `submittedGeometry.tampered !== true` and bounding coordinates match.
* **Future Replacement:** Off-chain Turf.js / PostGIS geometry intersection service returning cryptographic spatial verification proof.

---

## 4. API Reference (`fabric-api`)

### Register Official Parcel Master Record
* **Route:** `POST /api/land/parcels`
* **Payload:**
```json
{
  "surveyNumber": "SY-100/A",
  "currentOwnerId": "AADHAAR-9988-7766",
  "totalVerifiedArea": 1000,
  "committedArea": 200,
  "landOwnershipCategory": "PRIVATE",
  "isRestricted": false,
  "disputeStatus": "NONE",
  "acquisitionStatus": "NONE",
  "titleChain": ["TXN-1", "TXN-2"],
  "authoritativeDocumentHash": "SHA256:e3b0c442...",
  "authoritativeBoundaryGeometry": { "coordinates": [...] }
}
```

### On-Demand Fraud Evaluation
* **Route:** `GET /api/land/applications/:id/fraud-check`
* **Response:**
```json
{
  "success": true,
  "applicationId": "APP-2026-001",
  "fraudReport": {
    "isClean": false,
    "fraudScore": 100,
    "overallRisk": "CRITICAL",
    "fraudCount": 4,
    "detectedFrauds": [
      {
        "ruleId": 2,
        "fraudType": "Sale Beyond Available Extent",
        "severity": "CRITICAL",
        "reason": "..."
      }
    ]
  }
}
```

---

## 5. Verification Commands
To execute the automated fraud detection test suite:
```bash
cd "chaincode/land-registration"
npm test
```
All 15 tests (14 rules + clean application validation) run deterministically.

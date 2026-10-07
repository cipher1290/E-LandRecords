'use strict';

/**
 * Unit Test / Verification Script for 14 Fraud Detection Rules
 * Demonstrates:
 * 1. Clean Application (Input vs Output Report)
 * 2. Fraudulent Application (Input vs Output Report with Fraud Score)
 * 3. Individual rule-by-rule unit tests
 */

const { FraudDetector } = require('./lib/fraud-detector');

const createMockContext = (compositeState = {}) => {
    return {
        stub: {
            getTxTimestamp: () => ({ seconds: Math.floor(Date.now() / 1000).toString() }),
            createCompositeKey: (prefix, attrs) => `${prefix}_${attrs.join('_')}`,
            getState: async (key) => compositeState[key] || null,
            putState: async (key, val) => { compositeState[key] = val; }
        }
    };
};

async function runTests() {
    console.log('========================================================================');
    console.log('            SMART CONTRACT FRAUD DETECTION ENGINE DEMO & TESTS          ');
    console.log('========================================================================\n');

    const ctx = createMockContext();

    // =====================================================================
    // DEMO 1: GENUINE / CLEAN APPLICATION
    // =====================================================================
    console.log('------------------------------------------------------------------------');
    console.log(' [DEMO 1] GENUINE APPLICATION EVALUATION (Clean Transaction)');
    console.log('------------------------------------------------------------------------');

    const genuineParcel = {
        surveyNumber: 'SY-100/A',
        currentOwnerId: 'AADHAAR-9988-7766',
        totalVerifiedArea: 1000,
        committedArea: 200,
        landOwnershipCategory: 'PRIVATE',
        isRestricted: false,
        disputeStatus: 'NONE',
        acquisitionStatus: 'NONE',
        titleChain: ['TXN-REG-2020-001', 'TXN-REG-2022-045'],
        authoritativeDocumentHash: 'SHA256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        authoritativeBoundaryGeometry: { coordinates: [[17.3850, 78.4867], [17.3855, 78.4870]] }
    };

    const genuineApplication = {
        applicationId: 'APP-CLEAN-2026',
        surveyNumber: 'SY-100/A',
        sellerId: 'AADHAAR-9988-7766',
        area: 300,
        transferAuthorityType: 'SELF',
        documentContentHash: 'SHA256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        documentExtractedSurveyNumber: 'SY-100/A',
        documentExtractedOwnerId: 'AADHAAR-9988-7766',
        documentExtractedArea: 1000,
        submittedBoundaryGeometry: { coordinates: [[17.3850, 78.4867], [17.3855, 78.4870]] }
    };

    console.log('>>> APPLICATION INPUT:');
    console.log(JSON.stringify(genuineApplication, null, 2));

    const cleanReport = await FraudDetector.evaluateAll(ctx, genuineApplication, genuineParcel);

    console.log('\n>>> FRAUD DETECTION OUTPUT REPORT:');
    console.log(JSON.stringify(cleanReport, null, 2));
    console.log(`\nRESULT: Status = ${cleanReport.isClean ? 'APPROVED / SUBMITTED' : 'FLAGGED_FRAUD'} | Fraud Score = ${cleanReport.fraudScore}/100 | Risk = ${cleanReport.overallRisk}`);


    // =====================================================================
    // DEMO 2: FRAUDULENT APPLICATION (MULTIPLE VIOLATIONS)
    // =====================================================================
    console.log('\n\n------------------------------------------------------------------------');
    console.log(' [DEMO 2] HIGH-RISK FRAUDULENT APPLICATION EVALUATION');
    console.log('------------------------------------------------------------------------');

    const officialGovtDisputedParcel = {
        surveyNumber: 'SY-404/B',
        currentOwnerId: 'LEGAL-OWNER-REAL',
        totalVerifiedArea: 500,
        committedArea: 400, // Available is only 100
        landOwnershipCategory: 'ASSIGNED', // Government / Assigned Land!
        isRestricted: true,
        restrictionType: 'Section 22-A Prohibited Waqf/Govt Roster',
        disputeStatus: 'STAY_ORDER',
        disputeId: 'HIGH-COURT-WP-1049/2025',
        transferAllowedDuringDispute: false,
        acquisitionStatus: 'ACTIVE',
        acquisitionReferenceId: 'NATIONAL-HIGHWAY-NH44-EXPANSION',
        transferAllowedDuringAcquisition: false,
        titleChainBroken: true,
        authoritativeDocumentHash: 'SHA256:OFFICIAL_GENUINE_DEED_HASH_9999',
        authoritativeBoundaryGeometry: { coordinates: [[12.9716, 77.5946], [12.9720, 77.5950]] }
    };

    const fraudulentApplication = {
        applicationId: 'APP-FRAUD-ATTEMPT-01',
        surveyNumber: 'SY-404/B',
        sellerId: 'IMPOSTER-SELLER-99', // Impersonation! Not legal owner
        area: 450, // Available is only 100, requesting 450!
        transferAuthorityType: 'SELF',
        documentContentHash: 'SHA256:FORGED_FAKE_PDF_HASH_0000', // Forged hash!
        documentExtractedSurveyNumber: 'SY-404/TAMPERED', // Survey mismatch!
        documentExtractedOwnerId: 'IMPOSTER-SELLER-99', // Owner mismatch!
        documentExtractedArea: 900,
        submittedBoundaryGeometry: { coordinates: [[99, 99], [99, 100]], tampered: true } // Boundary fraud!
    };

    console.log('>>> FRAUDULENT INPUT:');
    console.log(JSON.stringify(fraudulentApplication, null, 2));

    const fraudReport = await FraudDetector.evaluateAll(ctx, fraudulentApplication, officialGovtDisputedParcel);

    console.log('\n>>> FRAUD DETECTION OUTPUT REPORT:');
    console.log(JSON.stringify(fraudReport, null, 2));
    console.log(`\nRESULT: Status = ${fraudReport.isClean ? 'APPROVED / SUBMITTED' : 'FLAGGED_FRAUD'} | Fraud Score = ${fraudReport.fraudScore}/100 | Risk = ${fraudReport.overallRisk}`);
    console.log(`TOTAL FRAUD RULES TRIGGERED: ${fraudReport.fraudCount}`);


    // =====================================================================
    // STEP 3: INDIVIDUAL 14 UNIT TESTS
    // =====================================================================
    console.log('\n\n========================================================================');
    console.log('                INDIVIDUAL 14 RULE-BY-RULE VERIFICATION                 ');
    console.log('========================================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(testName, condition, details = '') {
        if (condition) {
            console.log(`[PASS] ${testName}`);
            passed++;
        } else {
            console.error(`[FAIL] ${testName} - ${details}`);
            failed++;
        }
    }

    // Rule 1: Double / Multiple Sale
    const parcelWithActiveTx = { surveyNumber: 'SY-101', activeTransactionId: 'APP-OTHER-ACTIVE', transactionStatus: 'PENDING_REGISTRATION' };
    const f1 = await FraudDetector.checkDoubleSale(ctx, { applicationId: 'APP-NEW-CONFLICT', surveyNumber: 'SY-101' }, parcelWithActiveTx);
    assert('Rule 1: Double / Multiple Sale triggers on pending conflicting transaction', f1 && f1.ruleId === 1);

    // Rule 2: Sale Beyond Available Extent
    const parcel2 = { surveyNumber: 'SY-102', totalVerifiedArea: 1000, committedArea: 800 };
    const f2 = await FraudDetector.checkSaleBeyondAvailableExtent(ctx, { applicationId: 'APP-2', surveyNumber: 'SY-102', area: 350 }, parcel2);
    assert('Rule 2: Sale Beyond Available Extent triggers when requested > remaining', f2 && f2.ruleId === 2);

    // Rule 3: Unauthorized Ownership
    const parcel3 = { surveyNumber: 'SY-103', currentOwnerId: 'LEGAL-OWNER-99' };
    const f3 = await FraudDetector.checkUnauthorizedOwnership(ctx, { applicationId: 'APP-3', surveyNumber: 'SY-103', sellerId: 'FRAUD-SELLER-1', transferAuthorityType: 'SELF' }, parcel3);
    assert('Rule 3: Unauthorized Ownership triggers when seller is not owner and lacks PoA', f3 && f3.ruleId === 3);

    // Rule 4: Title-Chain Inconsistency
    const parcel4 = { surveyNumber: 'SY-104', titleChain: [], titleChainBroken: true };
    const f4 = await FraudDetector.checkTitleChainInconsistency(ctx, { applicationId: 'APP-4', surveyNumber: 'SY-104' }, parcel4);
    assert('Rule 4: Title-Chain Inconsistency triggers on broken/empty lineage', f4 && f4.ruleId === 4);

    // Rule 5: Unauthorized Mutation
    const f5 = await FraudDetector.checkUnauthorizedMutation(ctx, { applicationId: 'APP-5', transactionType: 'MUTATION', sourceTransactionId: '', authorizedBy: '' }, null);
    assert('Rule 5: Unauthorized Mutation triggers on missing source deed/officer ID', f5 && f5.ruleId === 5);

    // Rule 6: Forged Land Document
    const parcel6 = { authoritativeDocumentHash: 'OFFICIAL_GENUINE_HASH_XYZ' };
    const f6 = await FraudDetector.checkForgedLandDocument(ctx, { applicationId: 'APP-6', documentContentHash: 'FORGED_HASH_999' }, parcel6);
    assert('Rule 6: Forged Land Document triggers when submitted hash != official hash', f6 && f6.ruleId === 6);

    // Rule 7: Document-Official Record Mismatch
    const parcel7 = { surveyNumber: 'SY-200/A', currentOwnerId: 'RAMESH_KUMAR', totalVerifiedArea: 450 };
    const f7 = await FraudDetector.checkDocumentRecordMismatch(ctx, { applicationId: 'APP-7', documentExtractedSurveyNumber: 'SY-200/B', documentExtractedOwnerId: 'RAMESH_KUMAR', documentExtractedArea: 900 }, parcel7);
    assert('Rule 7: Document-Record Mismatch triggers on altered survey or area', f7 && f7.ruleId === 7);

    // Rule 8: Joint Ownership Violation
    const parcel8 = {
        surveyNumber: 'SY-300',
        owners: [
            { ownerId: 'BROTHER_A', sharePercentage: 50, areaShare: 200 },
            { ownerId: 'BROTHER_B', sharePercentage: 50, areaShare: 200 }
        ]
    };
    const f8 = await FraudDetector.checkJointOwnershipViolation(ctx, { applicationId: 'APP-8', surveyNumber: 'SY-300', sellerId: 'BROTHER_A', area: 300, consentingOwnerIds: [] }, parcel8);
    assert('Rule 8: Joint Ownership Violation triggers on share excess / missing consent', f8 && f8.ruleId === 8);

    // Rule 9: Restricted Land Transfer
    const parcel9 = { surveyNumber: 'SY-400', isRestricted: true, restrictionType: 'Sec 22-A Prohibited List' };
    const f9 = await FraudDetector.checkRestrictedLandTransfer(ctx, { applicationId: 'APP-9', surveyNumber: 'SY-400' }, parcel9);
    assert('Rule 9: Restricted Land Transfer triggers on Section 22-A prohibited flag', f9 && f9.ruleId === 9);

    // Rule 10: Government/Assigned Land Transfer
    const parcel10 = { surveyNumber: 'SY-500', landOwnershipCategory: 'ASSIGNED', transferAllowed: false };
    const f10 = await FraudDetector.checkGovernmentLandTransfer(ctx, { applicationId: 'APP-10', surveyNumber: 'SY-500', specialGovernmentNOC: false }, parcel10);
    assert('Rule 10: Government/Assigned Land Transfer triggers without official NOC', f10 && f10.ruleId === 10);

    // Rule 11: Acquisition Conflict
    const parcel11 = { surveyNumber: 'SY-600', acquisitionStatus: 'ACTIVE', transferAllowedDuringAcquisition: false, acquisitionReferenceId: 'METRO-PHASE-2' };
    const f11 = await FraudDetector.checkAcquisitionConflict(ctx, { applicationId: 'APP-11', surveyNumber: 'SY-600' }, parcel11);
    assert('Rule 11: Acquisition Conflict triggers on active notified acquisition', f11 && f11.ruleId === 11);

    // Rule 12: Active Dispute / Litigation Conflict
    const parcel12 = { surveyNumber: 'SY-700', disputeStatus: 'STAY_ORDER', transferAllowedDuringDispute: false, disputeId: 'OS-99/2024' };
    const f12 = await FraudDetector.checkActiveDisputeConflict(ctx, { applicationId: 'APP-12', surveyNumber: 'SY-700' }, parcel12);
    assert('Rule 12: Dispute Conflict triggers on court injunction or stay order', f12 && f12.ruleId === 12);

    // Rule 13: Duplicate / Reused Document
    const ctxWithDoc = createMockContext({
        'doc_usage_HASH_ALREADY_USED_888': Buffer.from(JSON.stringify({ applicationId: 'APP-PRIOR-SALE-10', status: 'CONSUMED' }))
    });
    const f13 = await FraudDetector.checkDuplicateReusedDocument(ctxWithDoc, { applicationId: 'APP-13', documentContentHash: 'HASH_ALREADY_USED_888' }, null);
    assert('Rule 13: Duplicate Document triggers on previously consumed document hash', f13 && f13.ruleId === 13);

    // Rule 14: Boundary Identity Fraud
    const parcel14 = { surveyNumber: 'SY-800', authoritativeBoundaryGeometry: { coordinates: [[10, 20], [10, 21]] } };
    const f14 = await FraudDetector.checkBoundaryIdentityFraud(ctx, { applicationId: 'APP-14', surveyNumber: 'SY-800', submittedBoundaryGeometry: { coordinates: [[99, 99], [99, 100]], tampered: true } }, parcel14);
    assert('Rule 14: Boundary Identity Fraud triggers on tampered / mismatched GIS polygon', f14 && f14.ruleId === 14);

    console.log('\n------------------------------------------------------------------------');
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('------------------------------------------------------------------------');
}

runTests().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});

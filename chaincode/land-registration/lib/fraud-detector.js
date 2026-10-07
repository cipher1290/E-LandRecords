'use strict';

/**
 * Fraud Detector Module for Land Registration Smart Contract
 * 
 * Implements 14 Fraud Rules:
 * 1. Double / Multiple Sale
 * 2. Sale Beyond Available Extent (Uses Mock Extent Adapter - Future Group Dependency)
 * 3. Unauthorized Ownership Transfer / Impersonation (Uses Mock Auth Adapter - Future Group Dependency)
 * 4. Ownership / Title-Chain Inconsistency
 * 5. Unauthorized / Fraudulent Mutation
 * 6. Forged / Fake Land Document
 * 7. Document-Official Record Mismatch
 * 8. Joint Ownership / Share Violation (Uses Mock Consent Adapter - Future Group Dependency)
 * 9. Restricted / Prohibited Land Transfer
 * 10. Government / Assigned Land Transfer
 * 11. Acquisition Conflict
 * 12. Active Dispute / Litigation Conflict
 * 13. Duplicate / Reused Document
 * 14. Parcel / Survey / Boundary Identity Fraud (Uses Mock GIS Adapter - Future Group Dependency)
 */

// =========================================================================
// MOCK ADAPTERS (For features depending on other groups / future integrations)
// =========================================================================

const MockAdapters = {
    /**
     * Mock Adapter for Rule 2: Sale Beyond Available Extent
     * Provides verified extent and reserved areas for parcels when authoritative ledger extent is not yet fully linked.
     */
    getExtentBalance: async (surveyNumber, authoritativeParcel) => {
        if (authoritativeParcel && typeof authoritativeParcel.totalVerifiedArea === 'number') {
            const verified = authoritativeParcel.totalVerifiedArea;
            const committed = authoritativeParcel.committedArea || 0;
            return {
                verifiedTransferableArea: verified,
                alreadyTransferredArea: committed,
                availableArea: Math.max(0, verified - committed)
            };
        }
        // Default Mock Baseline
        return {
            verifiedTransferableArea: 1000,
            alreadyTransferredArea: 200,
            availableArea: 800
        };
    },

    /**
     * Mock Adapter for Rule 3: Unauthorized Ownership Transfer / Seller Impersonation
     * Verifies PoA / Authorization certificates with external identity/registry systems.
     */
    verifySellerAuthorization: async (sellerId, verifiedOwnerId, transferAuthorityType, authorizationId) => {
        if (sellerId === verifiedOwnerId) {
            return { isAuthorized: true, reason: 'Direct owner transfer' };
        }
        // If Power of Attorney or Legal Heir, check authorization status
        if (transferAuthorityType === 'POA' || transferAuthorityType === 'LEGAL_HEIR') {
            if (authorizationId && authorizationId.startsWith('AUTH-VALID')) {
                return { isAuthorized: true, reason: 'Valid authorization verified via PoA registry' };
            }
            if (authorizationId && authorizationId.startsWith('AUTH-EXPIRED')) {
                return { isAuthorized: false, reason: 'Authorization has expired or been revoked' };
            }
            // Default mock logic: require authorizationId to be non-empty and not flagged
            if (authorizationId && authorizationId.length > 5) {
                return { isAuthorized: true, reason: 'Mock authorization accepted' };
            }
            return { isAuthorized: false, reason: 'Authorization ID missing or invalid' };
        }
        return { isAuthorized: false, reason: 'Seller is neither verified owner nor authorized representative' };
    },

    /**
     * Mock Adapter for Rule 8: Joint Ownership / Share Violation
     * Verifies co-owners, share percentages, and mandatory consents from external multi-owner registry.
     */
    verifyJointOwnershipAndConsent: async (surveyNumber, sellerId, requestedArea, consentingOwnerIds, authoritativeParcel) => {
        let owners = [];
        if (authoritativeParcel && Array.isArray(authoritativeParcel.owners) && authoritativeParcel.owners.length > 0) {
            owners = authoritativeParcel.owners;
        } else {
            // Mock co-owners baseline
            owners = [
                { ownerId: sellerId, sharePercentage: 50, areaShare: 500 },
                { ownerId: 'CO_OWNER_1', sharePercentage: 50, areaShare: 500 }
            ];
        }

        const currentOwner = owners.find(o => o.ownerId === sellerId);
        if (!currentOwner) {
            return { valid: false, reason: 'Seller is not listed in joint owners roster' };
        }

        if (requestedArea > currentOwner.areaShare) {
            return {
                valid: false,
                reason: `Requested area (${requestedArea}) exceeds seller's individual share (${currentOwner.areaShare})`
            };
        }

        // If other co-owners exist, check if required consent IDs are provided
        const otherOwners = owners.filter(o => o.ownerId !== sellerId);
        if (otherOwners.length > 0) {
            const consents = consentingOwnerIds || [];
            const missingConsents = otherOwners.filter(o => !consents.includes(o.ownerId));
            if (missingConsents.length > 0) {
                return {
                    valid: false,
                    reason: `Missing mandatory co-owner consent from: ${missingConsents.map(o => o.ownerId).join(', ')}`
                };
            }
        }

        return { valid: true, reason: 'Joint ownership share and consents verified' };
    },

    /**
     * Mock Adapter for Rule 14: Parcel / Survey / Boundary Identity Fraud
     * GIS Engine adapter to verify polygon boundary coordinates against authoritative Cadastral maps.
     */
    verifyBoundaryGeometry: async (submittedGeometry, authoritativeParcel) => {
        if (!submittedGeometry) {
            return { match: false, reason: 'Submitted boundary geometry coordinates are missing' };
        }

        // If authoritative parcel has geometry, compare bounding box / coordinate signature
        if (authoritativeParcel && authoritativeParcel.authoritativeBoundaryGeometry) {
            const authGeo = authoritativeParcel.authoritativeBoundaryGeometry;
            if (submittedGeometry.coordinates && authGeo.coordinates) {
                const isExact = JSON.stringify(submittedGeometry.coordinates) === JSON.stringify(authGeo.coordinates);
                if (!isExact && submittedGeometry.tampered === true) {
                    return { match: false, reason: 'Boundary coordinates conflict with authoritative GIS cadastral polygon' };
                }
            }
        }

        // Check mock tampering flag
        if (submittedGeometry.tampered === true || submittedGeometry.surveyMismatch === true) {
            return { match: false, reason: 'GIS spatial boundary intersection reveals encroachment or boundary shift' };
        }

        return { match: true, reason: 'Boundary polygon matches official GIS cadastral parcel' };
    }
};

// =========================================================================
// 14 INDIVIDUAL FRAUD DETECTION RULES
// =========================================================================

class FraudDetector {

    /**
     * Rule 1: Double / Multiple Sale
     * Detects if an active or approved transfer already claims the same transferable land or survey portion.
     */
    static async checkDoubleSale(ctx, applicationData, authoritativeParcel) {
        const surveyNumber = applicationData.surveyNumber || (applicationData.userData && applicationData.userData.surveyNumber);
        if (!surveyNumber) return null;

        // Check if authoritative parcel has an active conflicting transaction in progress
        if (authoritativeParcel) {
            if (authoritativeParcel.activeTransactionId && 
                authoritativeParcel.activeTransactionId !== applicationData.applicationId &&
                authoritativeParcel.transactionStatus === 'PENDING_REGISTRATION') {
                return {
                    ruleId: 1,
                    fraudType: 'Double / Multiple Sale',
                    severity: 'CRITICAL',
                    reason: `Conflicting active transaction ${authoritativeParcel.activeTransactionId} already in progress for survey ${surveyNumber}`
                };
            }
        }

        return null;
    }

    /**
     * Rule 2: Sale Beyond Available Extent (Uses Mock Extent Adapter)
     * Checks if requested area exceeds remaining transferable extent.
     */
    static async checkSaleBeyondAvailableExtent(ctx, applicationData, authoritativeParcel) {
        const surveyNumber = applicationData.surveyNumber || (applicationData.userData && applicationData.userData.surveyNumber);
        const requestedArea = parseFloat(applicationData.area || (applicationData.userData && applicationData.userData.area) || 0);

        if (requestedArea <= 0) return null;

        const extentInfo = await MockAdapters.getExtentBalance(surveyNumber, authoritativeParcel);
        if (requestedArea > extentInfo.availableArea) {
            return {
                ruleId: 2,
                fraudType: 'Sale Beyond Available Extent',
                severity: 'CRITICAL',
                reason: `Requested area (${requestedArea} sq.m/acres) exceeds available extent (${extentInfo.availableArea}). Total: ${extentInfo.verifiedTransferableArea}, Already Transferred: ${extentInfo.alreadyTransferredArea}`
            };
        }

        return null;
    }

    /**
     * Rule 3: Unauthorized Ownership Transfer / Seller Impersonation (Uses Mock Auth Adapter)
     * Seller is neither verified legal owner nor holds valid authorization (PoA/Legal heir).
     */
    static async checkUnauthorizedOwnership(ctx, applicationData, authoritativeParcel) {
        const sellerId = applicationData.sellerId || (applicationData.userData && (applicationData.userData.sellerAadhar || applicationData.userData.sellerId));
        const verifiedOwnerId = authoritativeParcel ? authoritativeParcel.currentOwnerId : null;

        if (!sellerId || !verifiedOwnerId) return null;

        const transferAuthorityType = applicationData.transferAuthorityType || 'SELF';
        const authorizationId = applicationData.authorizationId;

        const authResult = await MockAdapters.verifySellerAuthorization(sellerId, verifiedOwnerId, transferAuthorityType, authorizationId);
        if (!authResult.isAuthorized) {
            return {
                ruleId: 3,
                fraudType: 'Unauthorized Ownership Transfer / Seller Impersonation',
                severity: 'CRITICAL',
                reason: `Seller (${sellerId}) is not verified owner (${verifiedOwnerId}). Authorization check failed: ${authResult.reason}`
            };
        }

        return null;
    }

    /**
     * Rule 4: Ownership / Title-Chain Inconsistency
     * Current owner cannot be traced through unbroken historical title transactions.
     */
    static async checkTitleChainInconsistency(ctx, applicationData, authoritativeParcel) {
        if (!authoritativeParcel) return null;

        const titleChain = authoritativeParcel.titleChain;
        if (Array.isArray(titleChain)) {
            if (titleChain.length === 0) {
                return {
                    ruleId: 4,
                    fraudType: 'Ownership / Title-Chain Inconsistency',
                    severity: 'HIGH',
                    reason: 'No prior title deeds or genesis allocation recorded in authoritative title chain.'
                };
            }
            if (authoritativeParcel.titleChainBroken === true) {
                return {
                    ruleId: 4,
                    fraudType: 'Ownership / Title-Chain Inconsistency',
                    severity: 'CRITICAL',
                    reason: 'Break or gap detected in title deeds lineage leading up to current owner.'
                };
            }
        }
        return null;
    }

    /**
     * Rule 5: Unauthorized / Fraudulent Mutation
     * Ownership record modification without valid supporting deed/order.
     */
    static async checkUnauthorizedMutation(ctx, applicationData, authoritativeParcel) {
        if (applicationData.transactionType === 'MUTATION') {
            const sourceTransactionId = applicationData.sourceTransactionId;
            const authorizedBy = applicationData.authorizedBy;

            if (!sourceTransactionId || !authorizedBy) {
                return {
                    ruleId: 5,
                    fraudType: 'Unauthorized / Fraudulent Mutation',
                    severity: 'CRITICAL',
                    reason: 'Mutation request lacks supporting registered deed transaction ID or authorized revenue official signature.'
                };
            }
        }
        return null;
    }

    /**
     * Rule 6: Forged / Fake Land Document
     * Document hash does not match genuine authoritative document hash or fails verification.
     */
    static async checkForgedLandDocument(ctx, applicationData, authoritativeParcel) {
        const submittedDocHash = applicationData.documentContentHash || applicationData.docHash;
        const authoritativeDocHash = applicationData.authoritativeDocumentHash || (authoritativeParcel ? authoritativeParcel.authoritativeDocumentHash : null);

        if (submittedDocHash && authoritativeDocHash) {
            if (submittedDocHash.toLowerCase() !== authoritativeDocHash.toLowerCase()) {
                return {
                    ruleId: 6,
                    fraudType: 'Forged / Fake Land Document',
                    severity: 'CRITICAL',
                    reason: `Submitted document hash (${submittedDocHash.substring(0, 10)}...) does not match authoritative digital deed hash (${authoritativeDocHash.substring(0, 10)}...)`
                };
            }
        }

        if (applicationData.documentVerificationStatus === 'FORGED' || applicationData.documentVerificationStatus === 'INVALID') {
            return {
                ruleId: 6,
                fraudType: 'Forged / Fake Land Document',
                severity: 'CRITICAL',
                reason: 'Document authenticity certificate rejected by revenue verification service.'
            };
        }

        return null;
    }

    /**
     * Rule 7: Document-Official Record Mismatch
     * Important details extracted from document conflict with official land ledger records.
     */
    static async checkDocumentRecordMismatch(ctx, applicationData, authoritativeParcel) {
        if (!authoritativeParcel) return null;

        const mismatches = [];

        // Check Survey Number Match
        if (applicationData.documentExtractedSurveyNumber && authoritativeParcel.surveyNumber) {
            if (applicationData.documentExtractedSurveyNumber.trim().toUpperCase() !== authoritativeParcel.surveyNumber.trim().toUpperCase()) {
                mismatches.push(`Survey No (Extracted: ${applicationData.documentExtractedSurveyNumber} vs Official: ${authoritativeParcel.surveyNumber})`);
            }
        }

        // Check Owner ID Match
        if (applicationData.documentExtractedOwnerId && authoritativeParcel.currentOwnerId) {
            if (applicationData.documentExtractedOwnerId.trim() !== authoritativeParcel.currentOwnerId.trim()) {
                mismatches.push(`Owner (Extracted: ${applicationData.documentExtractedOwnerId} vs Official: ${authoritativeParcel.currentOwnerId})`);
            }
        }

        // Check Area Match (allow small rounding tolerance e.g. 0.01)
        if (applicationData.documentExtractedArea && authoritativeParcel.totalVerifiedArea) {
            const extArea = parseFloat(applicationData.documentExtractedArea);
            const offArea = parseFloat(authoritativeParcel.totalVerifiedArea);
            if (Math.abs(extArea - offArea) > 0.05) {
                mismatches.push(`Area (Extracted: ${extArea} vs Official: ${offArea})`);
            }
        }

        if (mismatches.length > 0) {
            return {
                ruleId: 7,
                fraudType: 'Document–Official Record Mismatch',
                severity: 'HIGH',
                reason: `Extracted deed parameters conflict with official ledger: ${mismatches.join(', ')}`
            };
        }

        return null;
    }

    /**
     * Rule 8: Joint Ownership / Share Violation (Uses Mock Consent Adapter)
     * Co-owner sells beyond their legal share or required co-owner consents are missing.
     */
    static async checkJointOwnershipViolation(ctx, applicationData, authoritativeParcel) {
        // Only run joint ownership check if parcel explicitly has multiple owners or is declared joint
        const isJointProperty = (authoritativeParcel && Array.isArray(authoritativeParcel.owners) && authoritativeParcel.owners.length > 1) ||
                                (applicationData.isJointOwnership === true);
        if (!isJointProperty) {
            return null;
        }

        const surveyNumber = applicationData.surveyNumber || (applicationData.userData && applicationData.userData.surveyNumber);
        const sellerId = applicationData.sellerId || (applicationData.userData && applicationData.userData.sellerId);
        const requestedArea = parseFloat(applicationData.area || (applicationData.userData && applicationData.userData.area) || 0);
        const consentingOwnerIds = applicationData.consentingOwnerIds;

        const jointResult = await MockAdapters.verifyJointOwnershipAndConsent(surveyNumber, sellerId, requestedArea, consentingOwnerIds, authoritativeParcel);
        if (!jointResult.valid) {
            return {
                ruleId: 8,
                fraudType: 'Joint Ownership / Share Violation',
                severity: 'CRITICAL',
                reason: jointResult.reason
            };
        }

        return null;
    }

    /**
     * Rule 9: Restricted / Prohibited Land Transfer
     * Attempting to transfer legally restricted / gazette prohibited land.
     */
    static async checkRestrictedLandTransfer(ctx, applicationData, authoritativeParcel) {
        if (authoritativeParcel) {
            if (authoritativeParcel.isRestricted === true || authoritativeParcel.landRestrictionStatus === 'RESTRICTED') {
                const reason = authoritativeParcel.restrictionType || 'Prohibited under Registration Act Section 22-A';
                return {
                    ruleId: 9,
                    fraudType: 'Restricted / Prohibited Land Transfer',
                    severity: 'CRITICAL',
                    reason: `Land is prohibited from transfer: ${reason}`
                };
            }
        }
        return null;
    }

    /**
     * Rule 10: Government / Assigned Land Transfer
     * Private sale of Government / Assigned / Poramboke land without statutory permission.
     */
    static async checkGovernmentLandTransfer(ctx, applicationData, authoritativeParcel) {
        if (authoritativeParcel) {
            const category = (authoritativeParcel.landOwnershipCategory || '').toUpperCase();
            if (category === 'GOVERNMENT' || category === 'ASSIGNED' || category === 'COMMUNAL' || category === 'WAQF') {
                if (authoritativeParcel.transferAllowed !== true && !applicationData.specialGovernmentNOC) {
                    return {
                        ruleId: 10,
                        fraudType: 'Government / Assigned Land Transfer',
                        severity: 'CRITICAL',
                        reason: `Cannot transfer public/assigned land (Category: ${category}) without statutory Govt NOC.`
                    };
                }
            }
        }
        return null;
    }

    /**
     * Rule 11: Acquisition Conflict
     * Attempted transfer of land currently under active Land Acquisition.
     */
    static async checkAcquisitionConflict(ctx, applicationData, authoritativeParcel) {
        if (authoritativeParcel) {
            if (authoritativeParcel.acquisitionStatus === 'ACTIVE' || authoritativeParcel.acquisitionStatus === 'NOTIFIED') {
                if (authoritativeParcel.transferAllowedDuringAcquisition !== true) {
                    return {
                        ruleId: 11,
                        fraudType: 'Acquisition Conflict',
                        severity: 'CRITICAL',
                        reason: `Land is subject to ongoing statutory acquisition (Ref: ${authoritativeParcel.acquisitionReferenceId || 'ACQ-NOTICE'})`
                    };
                }
            }
        }
        return null;
    }

    /**
     * Rule 12: Active Dispute / Litigation Conflict
     * Transfer attempted on parcel with active court injunction, stay order, or dispute.
     */
    static async checkActiveDisputeConflict(ctx, applicationData, authoritativeParcel) {
        if (authoritativeParcel) {
            const dispute = (authoritativeParcel.disputeStatus || '').toUpperCase();
            if (dispute === 'ACTIVE_LITIGATION' || dispute === 'STAY_ORDER' || dispute === 'INJUNCTION') {
                if (authoritativeParcel.transferAllowedDuringDispute !== true) {
                    return {
                        ruleId: 12,
                        fraudType: 'Active Dispute / Litigation Conflict',
                        severity: 'HIGH',
                        reason: `Parcel is under court dispute / injunction (${authoritativeParcel.disputeId || 'SUIT-PENDING'}). Alienation prohibited.`
                    };
                }
            }
        }
        return null;
    }

    /**
     * Rule 13: Duplicate / Reused Document
     * Same document hash or ID reused in an unrelated or already finalized transaction.
     */
    static async checkDuplicateReusedDocument(ctx, applicationData, authoritativeParcel) {
        const docHash = applicationData.documentContentHash || applicationData.docHash;
        if (!docHash) return null;

        // Check index key on ledger for document hash reuse
        try {
            const indexKey = ctx.stub.createCompositeKey('doc_usage', [docHash]);
            const existingBytes = await ctx.stub.getState(indexKey);
            if (existingBytes && existingBytes.length > 0) {
                const existingUsage = JSON.parse(existingBytes.toString());
                if (existingUsage.applicationId !== applicationData.applicationId && existingUsage.status === 'CONSUMED') {
                    return {
                        ruleId: 13,
                        fraudType: 'Duplicate / Reused Document',
                        severity: 'CRITICAL',
                        reason: `Document hash already consumed and bound to completed transaction ${existingUsage.applicationId}`
                    };
                }
            }
        } catch (e) {
            // If composite key lookup fails, gracefully proceed
        }

        return null;
    }

    /**
     * Rule 14: Parcel / Survey / Boundary Identity Fraud (Uses Mock GIS Adapter)
     * Spatial GIS boundary polygon or coordinates conflict with authoritative survey boundary.
     */
    static async checkBoundaryIdentityFraud(ctx, applicationData, authoritativeParcel) {
        const submittedGeometry = applicationData.submittedBoundaryGeometry;
        const result = await MockAdapters.verifyBoundaryGeometry(submittedGeometry, authoritativeParcel);

        if (!result.match) {
            return {
                ruleId: 14,
                fraudType: 'Parcel / Survey / Boundary Identity Fraud',
                severity: 'CRITICAL',
                reason: result.reason
            };
        }

        return null;
    }

    /**
     * Master Orchestrator: Evaluate all 14 fraud rules
     */
    static async evaluateAll(ctx, applicationData, authoritativeParcel) {
        const detectedFrauds = [];

        const ruleCheckers = [
            this.checkDoubleSale,
            this.checkSaleBeyondAvailableExtent,
            this.checkUnauthorizedOwnership,
            this.checkTitleChainInconsistency,
            this.checkUnauthorizedMutation,
            this.checkForgedLandDocument,
            this.checkDocumentRecordMismatch,
            this.checkJointOwnershipViolation,
            this.checkRestrictedLandTransfer,
            this.checkGovernmentLandTransfer,
            this.checkAcquisitionConflict,
            this.checkActiveDisputeConflict,
            this.checkDuplicateReusedDocument,
            this.checkBoundaryIdentityFraud
        ];

        for (const checker of ruleCheckers) {
            try {
                const fraud = await checker.call(this, ctx, applicationData, authoritativeParcel);
                if (fraud) {
                    detectedFrauds.push(fraud);
                }
            } catch (err) {
                console.error(`Error executing rule checker ${checker.name}:`, err);
            }
        }

        const isClean = detectedFrauds.length === 0;
        const hasCritical = detectedFrauds.some(f => f.severity === 'CRITICAL');
        const overallRisk = isClean ? 'LOW' : (hasCritical ? 'CRITICAL' : 'HIGH');

        // Calculate numeric Fraud Score (0 = Clean, up to 100 = Severe Fraud)
        let fraudScore = 0;
        if (!isClean) {
            for (const fraud of detectedFrauds) {
                if (fraud.severity === 'CRITICAL') {
                    fraudScore += 25; // 25 points per critical fraud
                } else if (fraud.severity === 'HIGH') {
                    fraudScore += 15; // 15 points per high risk fraud
                } else {
                    fraudScore += 10;
                }
            }
            fraudScore = Math.min(100, fraudScore);
        }

        return {
            isClean,
            fraudScore,
            overallRisk,
            fraudCount: detectedFrauds.length,
            detectedFrauds,
            evaluatedAt: ctx.stub.getTxTimestamp().seconds.toString()
        };
    }
}

module.exports = {
    FraudDetector,
    MockAdapters
};

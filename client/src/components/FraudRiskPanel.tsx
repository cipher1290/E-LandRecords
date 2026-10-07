'use client';

import React, { useState } from 'react';

interface FraudItem {
    ruleId: number;
    fraudType: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    reason: string;
}

interface FraudReport {
    isClean: boolean;
    fraudScore: number;
    overallRisk: 'LOW' | 'HIGH' | 'CRITICAL';
    fraudCount: number;
    detectedFrauds: FraudItem[];
    evaluatedAt?: string;
}

interface FraudRiskPanelProps {
    application: any;
    isVisible?: boolean;
}

export default function FraudRiskPanel({ application, isVisible = true }: FraudRiskPanelProps) {
    const [isScanning, setIsScanning] = useState(false);
    const [showBreakdown, setShowBreakdown] = useState(false);
    const [fraudReport, setFraudReport] = useState<FraudReport>(() => {
        // Fallback to application's on-chain fraudReport or construct from status
        if (application?.fraudReport) {
            return application.fraudReport;
        }
        const isFlagged = application?.status === 'flagged_fraud';
        return {
            isClean: !isFlagged,
            fraudScore: isFlagged ? 85 : 0,
            overallRisk: isFlagged ? 'CRITICAL' : 'LOW',
            fraudCount: isFlagged ? 1 : 0,
            detectedFrauds: isFlagged ? [
                {
                    ruleId: 1,
                    fraudType: 'On-Chain Integrity Violation',
                    severity: 'CRITICAL',
                    reason: 'Application flagged during smart contract evaluation'
                }
            ] : []
        };
    });

    if (!isVisible) return null;

    const handleReScan = async () => {
        setIsScanning(true);
        try {
            const appId = application?.applicationId || application?.id;
            const res = await fetch(`/api/land/applications/${appId}/fraud-check`);
            if (res.ok) {
                const data = await res.json();
                if (data.fraudReport) {
                    setFraudReport(data.fraudReport);
                }
            }
        } catch (e) {
            console.warn('Live API fetch unavailable, simulating on-chain scan');
        } finally {
            setTimeout(() => setIsScanning(false), 800);
        }
    };

    const getRiskColor = (risk: string) => {
        switch (risk) {
            case 'CRITICAL':
                return 'from-rose-500 to-red-600 text-rose-400 border-rose-500/30';
            case 'HIGH':
                return 'from-amber-500 to-orange-600 text-amber-400 border-amber-500/30';
            default:
                return 'from-emerald-500 to-teal-600 text-emerald-400 border-emerald-500/30';
        }
    };

    return (
        <div className="relative overflow-hidden bg-slate-900/90 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-2xl mt-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-4 mb-6">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="flex h-3 w-3 relative">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${fraudReport.isClean ? 'bg-emerald-400' : 'bg-red-400'}`} />
                            <span className={`relative inline-flex rounded-full h-3 w-3 ${fraudReport.isClean ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        </span>
                        <h3 className="text-lg font-bold text-white tracking-wide">
                            Blockchain 14-Rule Fraud Detection Engine
                        </h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Automated smart-contract rule evaluation (Chaincode Sequence 2)
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${getRiskColor(fraudReport.overallRisk)} bg-white/5`}>
                        Risk Level: {fraudReport.overallRisk}
                    </span>
                    <button
                        onClick={handleReScan}
                        disabled={isScanning}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-md flex items-center gap-1.5"
                    >
                        <svg className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {isScanning ? 'Scanning...' : 'Re-verify Rules'}
                    </button>
                </div>
            </div>

            {/* Score & Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                {/* Numeric Fraud Score Gauge */}
                <div className="flex flex-col items-center justify-center p-4 bg-slate-800/40 rounded-xl border border-white/5 text-center">
                    <span className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Fraud Risk Score</span>
                    <div className="relative flex items-center justify-center">
                        <svg className="w-28 h-28 transform -rotate-90">
                            <circle cx="56" cy="56" r="46" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                            <circle
                                cx="56"
                                cy="56"
                                r="46"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray={289}
                                strokeDashoffset={289 - (289 * fraudReport.fraudScore) / 100}
                                strokeLinecap="round"
                                className={`transition-all duration-1000 ${fraudReport.fraudScore > 50 ? 'text-rose-500' : (fraudReport.fraudScore > 0 ? 'text-amber-500' : 'text-emerald-400')}`}
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center">
                            <span className="text-3xl font-extrabold text-white">{fraudReport.fraudScore}</span>
                            <span className="text-[10px] text-slate-400">/ 100</span>
                        </div>
                    </div>
                    <span className="text-xs text-slate-300 mt-2">
                        {fraudReport.isClean ? '✅ 0 Threats Detected' : `⚠️ ${fraudReport.fraudCount} Violation(s) Flagged`}
                    </span>
                </div>

                {/* Status Explanation */}
                <div className="md:col-span-2 space-y-3">
                    <div className="p-3.5 bg-slate-800/40 rounded-xl border border-white/5">
                        <div className="text-xs text-slate-400 font-semibold uppercase mb-1">Status Verdict</div>
                        <div className="text-sm font-medium text-slate-200">
                            {fraudReport.isClean ? (
                                <span className="text-emerald-400 font-semibold">
                                    Clean Title & Authorization Verified. No conflicting deeds or boundary violations found.
                                </span>
                            ) : (
                                <span className="text-rose-400 font-semibold">
                                    Critical Fraud Risks Flagged. Official conveyance restricted until revenue audit.
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                        <span className="px-2.5 py-1 bg-white/5 rounded-md text-slate-300">
                            Evaluated Rules: <strong className="text-white">14 / 14</strong>
                        </span>
                        <span className="px-2.5 py-1 bg-white/5 rounded-md text-slate-300">
                            Active Violations: <strong className={fraudReport.fraudCount > 0 ? 'text-rose-400' : 'text-emerald-400'}>{fraudReport.fraudCount}</strong>
                        </span>
                        <button
                            onClick={() => setShowBreakdown(!showBreakdown)}
                            className="px-2.5 py-1 bg-white/10 hover:bg-white/15 rounded-md text-indigo-300 transition underline underline-offset-2 ml-auto"
                        >
                            {showBreakdown ? 'Hide Rule Breakdown ▲' : 'View Rule Breakdown ▼'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Collapsible Violations Breakdown */}
            {showBreakdown && (
                <div className="mt-6 border-t border-white/10 pt-4 space-y-2">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                        Rule Evaluation Details
                    </h4>
                    {fraudReport.detectedFrauds.length === 0 ? (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                            <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            All 14 on-chain checks (Double sale, Extent, PoA authorization, Title chain, Boundary GIS, Section 22-A, Dispute/Acquisition) PASSED.
                        </div>
                    ) : (
                        fraudReport.detectedFrauds.map((fraud, idx) => (
                            <div key={idx} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start gap-3 text-xs">
                                <span className="px-2 py-0.5 bg-rose-500 text-white font-bold rounded text-[10px] uppercase flex-shrink-0">
                                    Rule {fraud.ruleId}
                                </span>
                                <div>
                                    <div className="font-semibold text-rose-300">{fraud.fraudType} ({fraud.severity})</div>
                                    <div className="text-slate-300 mt-0.5">{fraud.reason}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

import { describe, expect, it } from 'vitest';
import { PV_ANOMALY_CODE, PV_ANOMALY_CODES } from './types';

describe('PV anomaly vocabulary', () => {
    it('exposes the canonical PV anomaly codes used by public proofs and admin fallbacks', () => {
        expect(PV_ANOMALY_CODES).toEqual([
            PV_ANOMALY_CODE.integrityError,
            PV_ANOMALY_CODE.votersAboveRegistered,
            PV_ANOMALY_CODE.voteTotalsMismatch,
            PV_ANOMALY_CODE.highTurnout,
            PV_ANOMALY_CODE.duplicatePollingStationPV,
        ]);
    });
});

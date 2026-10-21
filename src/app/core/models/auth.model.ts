export interface StaffScope {
  all: boolean;
  zoneIds: string[];
  hubIds: string[];
}

export interface StaffMfaStatus {
  enabled: boolean;
  required: boolean;
  recoveryCodesLeft: number;
}

/** Profile returned by `GET /v1/auth/staff/me`. */
export interface StaffProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: 'ACTIVE' | 'BLOCKED';
  roles: string[];
  permissions: string[];
  scope: StaffScope;
  mfa: StaffMfaStatus;
}

export interface StaffTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  mfaSetupRequired?: boolean;
}

export interface StaffMfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

export type StaffLoginResponse = StaffTokenPair | StaffMfaChallenge;

export function isMfaChallenge(response: StaffLoginResponse): response is StaffMfaChallenge {
  return 'mfaRequired' in response && response.mfaRequired === true;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: {
      reason?:
        | 'NOT_A_POLYGON'
        | 'TOO_MANY_POINTS'
        | 'OUTSIDE_EGYPT'
        | 'SELF_INTERSECTING'
        | 'OUTSIDE_PARENT_ZONE'
        | 'SUB_ZONES_OUTSIDE';
      conflicts?: Array<{
        id?: string;
        name?: string;
        zoneId?: string;
        overlap?: {
          type: 'Polygon';
          coordinates: number[][][];
        };
      }>;
      index?: number;
    };
  };
}

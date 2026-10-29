import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/auth';
import { Role, InstitutionType } from '@/types/enums';
import { apiClient } from '@/api/client';
import { ApiEnvelope } from '@/types/api';

export interface EnrichedInstitutionOption {
  id: string;
  code: string;
  name: string;
  type?: InstitutionType;
  state?: string;
  isDemo?: boolean;
}

// Seeded institutions catalogue as canonical fallback
export const SEEDED_INSTITUTIONS_MAP: Record<string, { code: string; name: string; type: InstitutionType; state: string }> = {
  'SIT-DEMO-01': {
    code: 'SIT-DEMO-01',
    name: 'Apex Institute of Technology (Demo)',
    type: InstitutionType.ENGINEERING,
    state: 'Maharashtra',
  },
  'SIT-DEMO-02': {
    code: 'SIT-DEMO-02',
    name: 'Beacon National Engineering College (Demo)',
    type: InstitutionType.ENGINEERING,
    state: 'Karnataka',
  },
  'SIT-DEMO-03': {
    code: 'SIT-DEMO-03',
    name: 'Crestview School of Management (Demo)',
    type: InstitutionType.MANAGEMENT,
    state: 'Delhi',
  },
  'SIT-DEMO-04': {
    code: 'SIT-DEMO-04',
    name: 'Delta Technical Institute (Demo)',
    type: InstitutionType.POLYTECHNIC,
    state: 'Tamil Nadu',
  },
  'SIT-DEMO-05': {
    code: 'SIT-DEMO-05',
    name: 'Everest Institute of Technology (Demo)',
    type: InstitutionType.ENGINEERING,
    state: 'Telangana',
  },
  'SIT-DEMO-TINY': {
    code: 'SIT-DEMO-TINY',
    name: 'Horizon Micro Institute (Demo Tiny)',
    type: InstitutionType.POLYTECHNIC,
    state: 'Goa',
  },
};

const SEEDED_LIST: EnrichedInstitutionOption[] = Object.values(SEEDED_INSTITUTIONS_MAP).map((inst) => ({
  id: inst.code,
  code: inst.code,
  name: inst.name,
  type: inst.type,
  state: inst.state,
  isDemo: true,
}));

const ACTIVE_INSTITUTION_STORAGE_KEY = 'apaar_selected_institution_id';

export function useInstitutions() {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState<EnrichedInstitutionOption[]>(SEEDED_LIST);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_INSTITUTION_STORAGE_KEY) || '';
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const currentUser = user;
    if (!currentUser) return;

    let isMounted = true;

    async function resolveInstitutions() {
      if (!currentUser) return;
      setIsLoading(true);

      try {
        // First try the dedicated /institutions endpoint which works for all roles
        try {
          const res = await apiClient.get<ApiEnvelope<Array<{ id?: string; _id?: string; code: string; name: string; type?: InstitutionType; state?: string }>>>('/institutions');
          const instList = Array.isArray(res.data?.data) ? res.data.data : [];
          if (instList.length > 0) {
            const options: EnrichedInstitutionOption[] = instList.map((inst) => ({
              id: String(inst.id || inst._id || inst.code),
              code: inst.code,
              name: inst.name,
              type: inst.type,
              state: inst.state,
              isDemo: true,
            }));
            if (isMounted) {
              setInstitutions(options);
              const validIds = options.map((o) => o.id);
              const myId = currentUser.institutionId ? String(currentUser.institutionId) : null;
              if (myId && validIds.includes(myId)) {
                setSelectedInstitutionId(myId);
                localStorage.setItem(ACTIVE_INSTITUTION_STORAGE_KEY, myId);
              } else if (!selectedInstitutionId || !validIds.includes(selectedInstitutionId)) {
                const defaultId = options[0].id;
                setSelectedInstitutionId(defaultId);
                localStorage.setItem(ACTIVE_INSTITUTION_STORAGE_KEY, defaultId);
              }
            }
            return;
          }
        } catch {
          // Fall back to role-specific resolution
        }

        const isInstitutionRole =
          currentUser.role === Role.INSTITUTION_ADMIN || currentUser.role === Role.INSTITUTION_OPERATOR;
        const isOfficer = currentUser.role === Role.AUTHORITY_OFFICER;
        const isAdmin =
          currentUser.role === Role.PLATFORM_ADMIN ||
          currentUser.role === Role.AUTHORITY_ADMIN ||
          currentUser.role === Role.AUDITOR;

        if (isInstitutionRole && currentUser.institutionId) {
          const myInstId = String(currentUser.institutionId);
          const option: EnrichedInstitutionOption = {
            id: myInstId,
            code: 'MY-INSTITUTION',
            name: currentUser.name.includes('Demo') ? 'Apex Institute of Technology (Demo)' : 'My Assigned Institution',
            type: InstitutionType.ENGINEERING,
          };
          if (isMounted) {
            setInstitutions([option]);
            setSelectedInstitutionId(myInstId);
            localStorage.setItem(ACTIVE_INSTITUTION_STORAGE_KEY, myInstId);
          }
        } else if (isOfficer && currentUser.assignedInstitutionIds?.length) {
          const officerList: EnrichedInstitutionOption[] = currentUser.assignedInstitutionIds.map((id: string, index: number) => {
            const fallbackSeeded = Object.values(SEEDED_INSTITUTIONS_MAP)[index % Object.values(SEEDED_INSTITUTIONS_MAP).length];
            return {
              id: String(id),
              code: fallbackSeeded?.code || `INST-${String(id).slice(-4).toUpperCase()}`,
              name: fallbackSeeded?.name || `Assigned Institution (${String(id).slice(-6)})`,
              type: fallbackSeeded?.type || InstitutionType.ENGINEERING,
              state: fallbackSeeded?.state,
              isDemo: true,
            };
          });

          if (isMounted) {
            setInstitutions(officerList);
            if (!selectedInstitutionId || !currentUser.assignedInstitutionIds.map(String).includes(selectedInstitutionId)) {
              const defaultId = String(currentUser.assignedInstitutionIds[0]);
              setSelectedInstitutionId(defaultId);
              localStorage.setItem(ACTIVE_INSTITUTION_STORAGE_KEY, defaultId);
            }
          }
        } else if (isAdmin) {
          try {
            const res = await apiClient.get<ApiEnvelope<{ items: Array<{ institutionId?: string; name?: string }> }>>(
              '/users?role=INSTITUTION_ADMIN&limit=50'
            );
            const userItems = res.data?.data?.items || [];
            const realIds = Array.from(new Set(userItems.map((u) => u.institutionId).filter(Boolean))) as string[];

            if (realIds.length > 0) {
              const gathered: EnrichedInstitutionOption[] = realIds.map((id, idx) => {
                const seeded = Object.values(SEEDED_INSTITUTIONS_MAP)[idx % Object.values(SEEDED_INSTITUTIONS_MAP).length];
                return {
                  id: String(id),
                  code: seeded ? seeded.code : `INST-${String(id).slice(-4).toUpperCase()}`,
                  name: seeded ? seeded.name : `Higher Education Institution (${String(id).slice(-6)})`,
                  type: seeded?.type || InstitutionType.ENGINEERING,
                  state: seeded?.state,
                  isDemo: true,
                };
              });

              if (isMounted) {
                setInstitutions(gathered);
                if (!selectedInstitutionId || !realIds.map(String).includes(selectedInstitutionId)) {
                  setSelectedInstitutionId(String(realIds[0]));
                  localStorage.setItem(ACTIVE_INSTITUTION_STORAGE_KEY, String(realIds[0]));
                }
              }
            } else {
              if (isMounted) {
                setInstitutions(SEEDED_LIST);
                if (!selectedInstitutionId) {
                  setSelectedInstitutionId(SEEDED_LIST[0].id);
                }
              }
            }
          } catch {
            if (isMounted) {
              setInstitutions(SEEDED_LIST);
              if (!selectedInstitutionId) {
                setSelectedInstitutionId(SEEDED_LIST[0].id);
              }
            }
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    resolveInstitutions();

    return () => {
      isMounted = false;
    };
  }, [user, selectedInstitutionId]);

  const selectInstitution = (id: string) => {
    setSelectedInstitutionId(id);
    localStorage.setItem(ACTIVE_INSTITUTION_STORAGE_KEY, id);
  };

  const currentInstitution = useMemo(() => {
    return institutions.find((inst) => inst.id === selectedInstitutionId) || institutions[0] || null;
  }, [institutions, selectedInstitutionId]);

  const hasMultipleInstitutions = institutions.length > 1;

  return {
    institutions,
    currentInstitution,
    selectedInstitutionId,
    selectInstitution,
    hasMultipleInstitutions,
    isLoading,
  };
}

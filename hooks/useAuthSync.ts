import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { profileService } from '../services/profileService';
import { investorService } from '../services/investorService';
import { clientService } from '../services/clientService';
import { supplierService } from '../services/supplierService';
import { projectService } from '../services/projectService';
import { ProfileGroup, UserProfile } from '../types';

interface UseAuthSyncProps {
  session: any;
  setSession: (session: any) => void;
  setLoadingSession: (loading: boolean) => void;
  selectedLoginGroup: ProfileGroup | null;
  setSelectedLoginGroup: (group: ProfileGroup | null) => void;
  setAuthError: (error: string | null) => void;
  setIsResettingPassword: (val: boolean) => void;
  profileSynchronized: boolean;
  setProfileSynchronized: (val: boolean) => void;
  currentProfile: any;
  setCurrentProfile: (profile: any) => void;
  setIsValidating: (val: boolean) => void;
  setInvestorProfile: (profile: any) => void;
  setClientProfile: (profile: any) => void;
  setSupplierProfile: (profile: any) => void;
  fetchProjects: (orgs: any[]) => void;
  fetchClients: () => void;
  fetchOrganizations: () => void;
  projectId: string | null;
  clientProfile: any;
  investorProfile: any;
  handleLoadProject: (id: string) => Promise<any>;
}

export const useAuthSync = ({
  session, setSession, setLoadingSession, selectedLoginGroup, setSelectedLoginGroup,
  setAuthError, setIsResettingPassword, profileSynchronized, setProfileSynchronized,
  currentProfile, setCurrentProfile, setIsValidating, setInvestorProfile, setClientProfile,
  setSupplierProfile, fetchProjects, fetchClients, fetchOrganizations,
  projectId, clientProfile, investorProfile, handleLoadProject
}: UseAuthSyncProps) => {
  const signOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs para valores lidos dentro do effect de profile-sync mas que NÃO devem
  // re-disparar o effect — evita o ciclo: setCurrentProfile → re-run → setCurrentProfile.
  const profileSynchronizedRef = useRef(profileSynchronized);
  const currentProfileRef = useRef(currentProfile);
  useEffect(() => { profileSynchronizedRef.current = profileSynchronized; }, [profileSynchronized]);
  useEffect(() => { currentProfileRef.current = currentProfile; }, [currentProfile]);

  // ── 1. Auth state listener ────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setSelectedLoginGroup(null);
        setAuthError(null);
        setProfileSynchronized(false);
      }
      setLoadingSession(false);
      if (event === 'PASSWORD_RECOVERY') setIsResettingPassword(true);
    });

    return () => subscription.unsubscribe();
  // Setters são estáveis (useState) — sem risco de re-run desnecessário
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. Profile sync — dispara apenas quando usuário ou grupo muda ─────────
  useEffect(() => {
    if (!session?.user?.id || !selectedLoginGroup) return;

    // Guard via ref: não re-sincroniza se já está sincronizado para este user+grupo
    const prof = currentProfileRef.current;
    if (
      profileSynchronizedRef.current &&
      prof.email === session.user.email &&
      prof.group === selectedLoginGroup
    ) return;

    let cancelled = false;

    const validate = async () => {
      setIsValidating(true);
      setAuthError(null);

      const result = await profileService.validateAccess(session.user.email!, selectedLoginGroup);

      if (cancelled) return;

      if (!result.isValid) {
        setAuthError(result.error || 'Acesso negado.');
        setProfileSynchronized(false);
        if (signOutTimeoutRef.current) clearTimeout(signOutTimeoutRef.current);
        signOutTimeoutRef.current = setTimeout(() => {
          setSelectedLoginGroup(null);
          setSession(null);
          supabase.auth.signOut();
        }, 3000);
      } else {
        // Carregar perfil específico por tipo de grupo
        if (selectedLoginGroup === ProfileGroup.INVESTOR && session.user.email) {
          const profile = await investorService.getByEmail(session.user.email);
          if (!cancelled && profile) setInvestorProfile(profile);
        }
        if (selectedLoginGroup === ProfileGroup.CLIENT && session.user.email) {
          const profile = await clientService.getByEmail(session.user.email);
          if (!cancelled && profile) setClientProfile(profile);
        }
        if (selectedLoginGroup === ProfileGroup.SUPPLIER && session.user.email) {
          const profile = await supplierService.getByEmail(session.user.email);
          if (!cancelled && profile) setSupplierProfile(profile);
        }

        if (cancelled) return;

        let role = UserProfile.USER;
        if (selectedLoginGroup === ProfileGroup.DEVELOPER) role = UserProfile.DEVELOPER;
        else if (selectedLoginGroup === ProfileGroup.INVESTOR) role = UserProfile.INVESTOR;
        else if (selectedLoginGroup === ProfileGroup.CLIENT) role = UserProfile.CLIENT_BUYER;
        else if (selectedLoginGroup === ProfileGroup.SUPPLIER) role = UserProfile.SUPPLIER;

        setCurrentProfile({ group: selectedLoginGroup, role, email: session.user.email });
        setProfileSynchronized(true);
      }

      if (!cancelled) setIsValidating(false);
    };

    validate();

    return () => {
      cancelled = true;
      if (signOutTimeoutRef.current) clearTimeout(signOutTimeoutRef.current);
    };
  // Deps mínimas: só re-dispara quando o usuário autenticado ou grupo escolhido mudam
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, session?.user?.email, selectedLoginGroup]);

  // ── 3. Fetch inicial de dados após sincronização ──────────────────────────
  useEffect(() => {
    if (profileSynchronized) {
      fetchOrganizations();
      fetchClients();
    }
  }, [profileSynchronized, fetchOrganizations, fetchClients]);

  // ── 4. Auto-load de obra para clientes ao logar ───────────────────────────
  useEffect(() => {
    if (profileSynchronized && !projectId) {
      if (currentProfile.group === ProfileGroup.CLIENT && clientProfile?.id) {
        projectService.listProjects(clientProfile.id).then(projects => {
          if (projects && projects.length > 0) handleLoadProject(projects[0].id);
        });
      }
    }
  }, [profileSynchronized, currentProfile.group, clientProfile?.id, investorProfile?.id, projectId, handleLoadProject]);
};

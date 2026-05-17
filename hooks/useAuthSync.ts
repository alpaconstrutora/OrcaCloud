import { useEffect } from 'react';
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

  // Auth Listeners
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
  }, [setSession, setLoadingSession, setAuthError, setProfileSynchronized, setSelectedLoginGroup, setIsResettingPassword]);

  // Profile Sync Logic
  useEffect(() => {
    if (session?.user?.id && selectedLoginGroup) {
      if (profileSynchronized && currentProfile.email === session.user.email && currentProfile.group === selectedLoginGroup) {
        return;
      }

      const validate = async () => {
        setIsValidating(true);
        setAuthError(null);
        const result = await profileService.validateAccess(session.user.email!, selectedLoginGroup);
        if (!result.isValid) {
          setAuthError(result.error || 'Acesso negado.');
          setProfileSynchronized(false);
          setTimeout(() => {
            setSelectedLoginGroup(null);
            setSession(null);
            supabase.auth.signOut();
          }, 3000);
        } else {
          if (selectedLoginGroup === ProfileGroup.INVESTOR && session.user.email) {
            const profile = await investorService.getByEmail(session.user.email);
            if (profile) setInvestorProfile(profile);
          }
          if (selectedLoginGroup === ProfileGroup.CLIENT && session.user.email) {
            const profile = await clientService.getByEmail(session.user.email);
            if (profile) setClientProfile(profile);
          }
          if (selectedLoginGroup === ProfileGroup.SUPPLIER && session.user.email) {
            const profile = await supplierService.getByEmail(session.user.email);
            if (profile) setSupplierProfile(profile);
          }
          let role = UserProfile.USER;
          if (selectedLoginGroup === ProfileGroup.DEVELOPER) role = UserProfile.DEVELOPER;
          else if (selectedLoginGroup === ProfileGroup.INVESTOR) role = UserProfile.INVESTOR;
          else if (selectedLoginGroup === ProfileGroup.CLIENT) role = UserProfile.CLIENT_BUYER;
          else if (selectedLoginGroup === ProfileGroup.SUPPLIER) role = UserProfile.SUPPLIER;
          setCurrentProfile({ group: selectedLoginGroup, role, email: session.user.email });
          setProfileSynchronized(true);
        }
        setIsValidating(false);
      };
      validate();
    }
  }, [
    session?.user?.id, session?.user?.email, selectedLoginGroup,
    fetchProjects, fetchClients, fetchOrganizations,
    setCurrentProfile, setProfileSynchronized, setIsValidating,
    setAuthError, setInvestorProfile, setClientProfile, setSupplierProfile,
    setSelectedLoginGroup, setSession, profileSynchronized,
    currentProfile.email, currentProfile.group
  ]);

  // Initial Data Fetch
  useEffect(() => {
    if (profileSynchronized) {
      fetchOrganizations();
      fetchClients();
    }
  }, [profileSynchronized, fetchOrganizations, fetchClients]);

  // Carregamento automático de obra para Clientes/Investidores ao logar
  useEffect(() => {
    if (profileSynchronized && !projectId) {
      if (currentProfile.group === ProfileGroup.CLIENT && clientProfile?.id) {
        projectService.listProjects(clientProfile.id).then(projects => {
          if (projects && projects.length > 0) {
            handleLoadProject(projects[0].id);
          }
        });
      } else if (currentProfile.group === ProfileGroup.INVESTOR && investorProfile?.id) {
        // Reservado para auto-load de investidor
      }
    }
  }, [profileSynchronized, currentProfile.group, clientProfile?.id, investorProfile?.id, projectId, handleLoadProject]);

};

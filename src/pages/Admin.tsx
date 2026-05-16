/**
 * Admin.tsx — MPL AUTH V2
 * Auth : Supabase signInWithPassword (email + mot de passe)
 * Rôle : lu depuis public.profiles après login
 */

import { useState, useEffect } from 'react';
import {
  Lock, LayoutDashboard, Users, Trophy,
  Settings, Zap, FileText, Eye, ShieldCheck, Loader,
} from 'lucide-react';
import { Layout, GlassCard, MPLLogo } from '@/components/Layout';
import { useI18n } from '@/hooks/useI18n';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';
import { fetchUserProfile, adminSignOut, type UserProfile } from '@/lib/adminAuth';
import AdminDashboard from '@/pages/AdminDashboard';

export default function Admin() {
  const { t } = useI18n();

  const [profile,  setProfile]  = useState<UserProfile | null>(null);
  const [checking, setChecking] = useState(true);

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [loginError, setLoginError] = useState('');

  const supabaseReady = isSupabaseConnected();
  const client        = getSupabaseClient();

  // ── Vérifier session existante au montage ─────────────────────────────────
  useEffect(() => {
    // Si Supabase non configuré → afficher le login directement, sans attendre
    if (!supabaseReady || !client) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    // Timeout de sécurité : si getSession ne répond pas en 4s → afficher le login
    const safetyTimer = setTimeout(() => {
      if (!cancelled) setChecking(false);
    }, 4000);

    const checkSession = async () => {
      try {
        const { data } = await client.auth.getSession();
        const session  = data.session;

        if (!session || cancelled) {
          setChecking(false);
          clearTimeout(safetyTimer);
          return;
        }

        const p = await fetchUserProfile(client, session.user.id, session.user.email ?? '');
        if (cancelled) return;

        if (p) {
          setProfile(p);
        } else {
          await adminSignOut(client);
        }
      } catch {
        // Erreur réseau / Supabase injoignable → afficher le login
      } finally {
        if (!cancelled) {
          setChecking(false);
          clearTimeout(safetyTimer);
        }
      }
    };

    checkSession();

    let unsubFn: (() => void) | null = null;
    const { data } = client.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      if (!session) { setProfile(null); setChecking(false); return; }
      const p = await fetchUserProfile(client, session.user.id, session.user.email ?? '');
      if (!cancelled) { setProfile(p ?? null); setChecking(false); }
    });
    unsubFn = () => data.subscription.unsubscribe();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      unsubFn?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Login email + mot de passe ────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) {
      setLoginError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env.local');
      return;
    }

    setLoading(true);
    setLoginError('');

    const { data: authData, error: authErr } =
      await client.auth.signInWithPassword({ email: email.trim(), password });

    if (authErr || !authData.user) {
      setLoginError(
        authErr?.message === 'Invalid login credentials'
          ? 'Email ou mot de passe incorrect.'
          : authErr?.message ?? 'Erreur de connexion.'
      );
      setLoading(false);
      return;
    }

    const p = await fetchUserProfile(client, authData.user.id, email.trim());
    if (!p) {
      await client.auth.signOut();
      setLoginError('Accès refusé : aucun profil administrateur trouvé pour ce compte.');
      setLoading(false);
      return;
    }

    setProfile(p);
    setLoading(false);
  };

  // ── Déconnexion ───────────────────────────────────────────────────────────
  const handleLogout = async () => {
    if (client) await adminSignOut(client);
    setProfile(null);
    setEmail('');
    setPassword('');
  };

  // ── Spinner vérification session ──────────────────────────────────────────
  if (checking) {
    return (
      <Layout>
        <section style={{ padding: '80px 24px', minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <Loader size={32} color="#4ad569" style={{ animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#a0a0a0', fontSize: '14px' }}>Vérification de la session…</p>
          </div>
          <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
        </section>
      </Layout>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  if (profile) {
    return (
      <AdminDashboard
        onLogout={handleLogout}
        role={profile.uiRole}
        userName={profile.full_name || profile.email}
      />
    );
  }

  // ── Page de login ─────────────────────────────────────────────────────────
  const icons = [LayoutDashboard, Users, Trophy, Settings, FileText, Zap];

  return (
    <Layout>
      <section style={{ padding: '80px 24px', minHeight: '80vh' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span style={{
              background: 'rgba(239,68,68,0.12)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '20px', padding: '4px 14px', fontSize: '13px', fontWeight: 700,
            }}>
              <Lock size={12} style={{ display: 'inline', marginRight: '4px' }} />
              {t.admin.badge}
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(28px,4vw,48px)', fontWeight: 900, color: 'white', margin: '0 0 40px' }}>
            {t.admin.title}
          </h1>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'start' }}>

            {/* ── Formulaire ───────────────────────────────────────────────── */}
            <GlassCard style={{ padding: '40px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
                <MPLLogo size={40} />
              </div>

              {/* Config manquante */}
              {!supabaseReady && (
                <div style={{
                  marginBottom: '20px', padding: '14px 16px',
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: '10px', color: '#ef4444', fontSize: '13px', lineHeight: 1.7,
                }}>
                  ⚠️ <strong>Configuration manquante</strong><br />
                  <span style={{ color: '#a0a0a0', fontSize: '12px' }}>
                    Ajoutez <code style={{ color: '#f59e0b' }}>VITE_SUPABASE_URL</code> et{' '}
                    <code style={{ color: '#f59e0b' }}>VITE_SUPABASE_ANON_KEY</code> dans{' '}
                    <code style={{ color: '#f59e0b' }}>.env.local</code>.
                  </span>
                </div>
              )}

              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Email */}
                <div>
                  <label style={{ color: '#a0a0a0', fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                    {t.admin.email}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@mpl.mu"
                    required
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                      padding: '12px 14px', color: 'white', fontSize: '14px',
                      outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s',
                    }}
                    onFocus={e => (e.target.style.border = '1px solid #4ad569')}
                    onBlur={e  => (e.target.style.border  = '1px solid rgba(255,255,255,0.1)')}
                  />
                </div>

                {/* Mot de passe */}
                <div>
                  <label style={{ color: '#a0a0a0', fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                    {t.admin.password}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                      padding: '12px 14px', color: 'white', fontSize: '14px',
                      outline: 'none', boxSizing: 'border-box', transition: 'border 0.2s',
                    }}
                    onFocus={e => (e.target.style.border = '1px solid #4ad569')}
                    onBlur={e  => (e.target.style.border  = '1px solid rgba(255,255,255,0.1)')}
                  />
                </div>

                {/* Erreur */}
                {loginError && (
                  <div style={{
                    color: '#ef4444', fontSize: '13px',
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                    borderRadius: '8px', padding: '10px 12px', lineHeight: 1.5,
                  }}>
                    {loginError}
                  </div>
                )}

                {/* Bouton */}
                <button
                  type="submit"
                  disabled={loading || !supabaseReady}
                  style={{
                    background: (loading || !supabaseReady) ? '#1e4d2b' : '#4ad569',
                    color: '#0a0a0a', border: 'none', borderRadius: '10px',
                    padding: '14px', fontSize: '15px', fontWeight: 700,
                    cursor: (loading || !supabaseReady) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s', opacity: supabaseReady ? 1 : 0.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}
                >
                  {loading
                    ? <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Connexion…</>
                    : t.admin.login
                  }
                </button>
              </form>

              {/* Légende rôles */}
              <div style={{ marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(74,213,105,0.06)', borderRadius: '8px', border: '1px solid rgba(74,213,105,0.15)' }}>
                  <ShieldCheck size={15} color="#4ad569" />
                  <span style={{ color: '#a0a0a0', fontSize: '12px' }}>
                    <strong style={{ color: '#4ad569' }}>Admin complet</strong>
                    {' '}— rôle <code style={{ color: '#4ad569', background: 'rgba(74,213,105,0.1)', borderRadius: '4px', padding: '0 4px' }}>admin</code> ou <code style={{ color: '#4ad569', background: 'rgba(74,213,105,0.1)', borderRadius: '4px', padding: '0 4px' }}>superadmin</code>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(99,179,237,0.06)', borderRadius: '8px', border: '1px solid rgba(99,179,237,0.15)' }}>
                  <Eye size={15} color="#63b3ed" />
                  <span style={{ color: '#a0a0a0', fontSize: '12px' }}>
                    <strong style={{ color: '#63b3ed' }}>Lecture seule</strong>
                    {' '}— rôle <code style={{ color: '#63b3ed', background: 'rgba(99,179,237,0.1)', borderRadius: '4px', padding: '0 4px' }}>readonly</code>
                  </span>
                </div>
              </div>
            </GlassCard>

            {/* ── Feature cards ────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {t.admin.features.map((f, i) => {
                const Icon = icons[i] ?? Settings;
                return (
                  <GlassCard key={i} style={{ padding: '20px' }}>
                    <Icon size={24} color="#4ad569" style={{ marginBottom: '10px' }} />
                    <h3 style={{ color: 'white', fontWeight: 700, margin: '0 0 6px', fontSize: '15px' }}>{f.title}</h3>
                    <p style={{ color: '#a0a0a0', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
                  </GlassCard>
                );
              })}
            </div>

          </div>
        </div>
      </section>
      <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
    </Layout>
  );
}

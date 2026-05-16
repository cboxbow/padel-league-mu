/**
 * AdminCallback.tsx — MPL AUTH V2
 * ─────────────────────────────────────────────────────────────────────────────
 * Route : /#/admin/callback
 *
 * Supabase redirige ici après que l'admin clique le magic link.
 * L'URL contient un fragment (#access_token=...&type=magiclink ou #access_token=...&type=recovery).
 * Supabase JS détecte automatiquement le token via detectSessionInUrl=true.
 *
 * Ce composant :
 *  1. Attend que Supabase établisse la session depuis l'URL
 *  2. Récupère le profil admin
 *  3. Redirige vers /admin si OK, affiche une erreur sinon
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader, CheckCircle, XCircle } from 'lucide-react';
import { Layout, GlassCard, MPLLogo } from '@/components/Layout';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchUserProfile } from '@/lib/adminAuth';

type Status = 'processing' | 'success' | 'error';

export default function AdminCallback() {
  const navigate = useNavigate();
  const [status,  setStatus]  = useState<Status>('processing');
  const [message, setMessage] = useState('Établissement de la session…');

  useEffect(() => {
    let cancelled = false;

    const handleCallback = async () => {
      const client = getSupabaseClient();
      if (!client) {
        setStatus('error');
        setMessage('Supabase non configuré — vérifiez les variables d\'environnement.');
        return;
      }

      // Attendre que Supabase traite le token dans l'URL
      // onAuthStateChange se déclenche une fois la session établie
      const unsubscribe = client.auth.onAuthStateChange(async (event, session) => {
        if (cancelled) return;

        if (event === 'SIGNED_IN' && session) {
          setMessage('Session établie — vérification du profil…');

          const profile = await fetchUserProfile(
            client,
            session.user.id,
            session.user.email ?? ''
          );

          if (cancelled) return;

          if (!profile) {
            await client.auth.signOut();
            setStatus('error');
            setMessage('Accès refusé : aucun profil administrateur trouvé pour ce compte.');
            return;
          }

          setStatus('success');
          setMessage(`Bienvenue ${profile.full_name || profile.email} — redirection…`);

          setTimeout(() => {
            if (!cancelled) navigate('/admin', { replace: true });
          }, 1200);
        } else if (event === 'TOKEN_REFRESHED') {
          // Peut arriver en premier, ignorer
        } else if (!session && event !== 'INITIAL_SESSION') {
          setStatus('error');
          setMessage('Lien invalide ou expiré. Demandez un nouveau lien de connexion.');
        }
      });

      // Timeout de sécurité si aucun événement
      const timeout = setTimeout(() => {
        if (cancelled) return;
        setStatus('error');
        setMessage('Délai dépassé. Le lien est peut-être expiré — demandez-en un nouveau.');
        unsubscribe.data.subscription.unsubscribe();
      }, 15000);

      return () => {
        clearTimeout(timeout);
        unsubscribe.data.subscription.unsubscribe();
      };
    };

    const cleanup = handleCallback();

    return () => {
      cancelled = true;
      cleanup.then(fn => fn?.());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icon = {
    processing: <Loader size={40} color="#4ad569" style={{ animation: 'spin 1s linear infinite' }} />,
    success:    <CheckCircle size={40} color="#4ad569" />,
    error:      <XCircle size={40} color="#ef4444" />,
  }[status];

  return (
    <Layout>
      <section style={{ padding: '80px 24px', minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <GlassCard style={{ padding: '48px 40px', maxWidth: '460px', width: '100%', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <MPLLogo size={36} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            {icon}
          </div>

          <h2 style={{ color: 'white', fontWeight: 700, margin: '0 0 12px', fontSize: '20px' }}>
            {status === 'processing' && 'Connexion en cours'}
            {status === 'success'    && 'Connexion réussie'}
            {status === 'error'      && 'Erreur de connexion'}
          </h2>

          <p style={{ color: '#a0a0a0', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
            {message}
          </p>

          {status === 'error' && (
            <button
              onClick={() => navigate('/admin', { replace: true })}
              style={{
                background: '#4ad569', color: '#0a0a0a', border: 'none',
                borderRadius: '10px', padding: '12px 28px', fontWeight: 700,
                fontSize: '14px', cursor: 'pointer',
              }}
            >
              Retour à la connexion
            </button>
          )}
        </GlassCard>
      </section>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Layout>
  );
}

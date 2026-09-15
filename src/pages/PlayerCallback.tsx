/**
 * PlayerCallback.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Route : /#/joueur/callback
 *
 * Supabase redirige ici apres qu'un joueur clique son lien de connexion
 * (magic link). Le fragment d'URL contient le token ; supabase-js le
 * detecte automatiquement (detectSessionInUrl=true) et emet SIGNED_IN.
 *
 * Ce composant attend simplement l'etablissement de la session puis
 * redirige vers l'Espace Joueur, qui se charge d'associer le compte a la
 * fiche joueur (RPC link_player_account) et d'afficher le profil connecte.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader, CheckCircle, XCircle } from 'lucide-react';
import { Layout, GlassCard, MPLLogo } from '@/components/Layout';
import { getSupabaseClient } from '@/lib/supabase';
import { ROUTE_PATHS } from '@/lib/index';

type Status = 'processing' | 'success' | 'error';

export default function PlayerCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('processing');
  const [message, setMessage] = useState('Etablissement de la session...');

  useEffect(() => {
    let cancelled = false;

    const handleCallback = async () => {
      const client = getSupabaseClient();
      if (!client) {
        setStatus('error');
        setMessage('Connexion indisponible pour le moment.');
        return;
      }

      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (cancelled) return;

        if (event === 'SIGNED_IN' && session) {
          setStatus('success');
          setMessage('Connexion reussie - redirection...');
          setTimeout(() => {
            if (!cancelled) navigate(ROUTE_PATHS.PLAYER_SPACE, { replace: true });
          }, 900);
        } else if (!session && event !== 'INITIAL_SESSION') {
          setStatus('error');
          setMessage('Lien invalide ou expire. Demande un nouveau lien de connexion.');
        }
      });

      const timeout = setTimeout(() => {
        if (cancelled) return;
        setStatus('error');
        setMessage('Delai depasse. Le lien est peut-etre expire - demande-en un nouveau.');
        data.subscription.unsubscribe();
      }, 15000);

      return () => {
        clearTimeout(timeout);
        data.subscription.unsubscribe();
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
    success: <CheckCircle size={40} color="#4ad569" />,
    error: <XCircle size={40} color="#ef4444" />,
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
            {status === 'success' && 'Connexion reussie'}
            {status === 'error' && 'Erreur de connexion'}
          </h2>
          <p style={{ color: '#a0a0a0', fontSize: '14px', lineHeight: 1.6, margin: '0 0 24px' }}>
            {message}
          </p>
          {status === 'error' && (
            <button
              onClick={() => navigate(ROUTE_PATHS.PLAYER_SPACE, { replace: true })}
              style={{
                background: '#4ad569', color: '#0a0a0a', border: 'none',
                borderRadius: '10px', padding: '12px 28px', fontWeight: 700,
                fontSize: '14px', cursor: 'pointer',
              }}
            >
              Retour a l espace joueur
            </button>
          )}
        </GlassCard>
      </section>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Layout>
  );
}

/**
 * GalerieAdminPage.tsx — Admin Gallery Management
 * Full CRUD for tournament_photos + Supabase Storage upload
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, Save, X, Upload,
  RefreshCw, Eye, EyeOff, Camera, CheckCircle2,
  AlertTriangle, ChevronUp, ChevronDown,
} from 'lucide-react';
import { GlassCard } from '@/components/Layout';
import { MPL_TOURNAMENTS, type Tournament } from '@/data/mpl2026';
import { getSupabaseClient, isSupabaseConnected } from '@/lib/supabase';
import { normalizeJuniorCategory, normalizeTournamentDisplayName } from '@/lib/tournamentNames';
import type { TournamentPhoto } from '@/pages/Galerie';

// ── Constants ────────────────────────────────────────────────────────────────
const DIVISIONS = [
  { val: 'men',    label: 'Hommes' },
  { val: 'women',  label: 'Dames'  },
  { val: 'mixed',  label: 'Mixte'  },
  { val: 'junior', label: 'Junior' },
];
const CATEGORIES = ['M500', 'M1000', 'Mixed', 'Junior'];
const REGIONS    = ['Nord', 'Ouest', 'Centre', 'Est', 'Sud'];
const STORAGE_BUCKET = 'tournament-photos';
const GALLERY_TOURNAMENT_CATEGORIES = new Set(['M500', 'M1000']);

interface GalleryTournamentResult {
  tournament_id: string;
  tournament_name: string;
  tournament_date: string;
  category: string;
  division: string;
  rank: number;
  player1_name: string;
  player2_name: string;
  team_name?: string;
  club_name?: string;
}

function formatTournamentOption(tournament: Tournament): string {
  const date = new Date(tournament.date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return `${normalizeTournamentDisplayName(tournament.name, tournament.club_name)} - ${date} - ${tournament.club_name}`;
}

function getWinnerNames(result: GalleryTournamentResult | undefined): string[] {
  if (!result) return ['', ''];
  return [result.player1_name, result.player2_name].map(name => name?.trim() ?? '');
}

// ── Empty form ────────────────────────────────────────────────────────────────
const emptyForm = (): Omit<TournamentPhoto, 'id' | 'created_at'> => ({
  tournament_name: '',
  category: 'M500',
  division: 'men',
  winner_names: ['', ''],
  photo_date: new Date().toISOString().slice(0, 10),
  caption: '',
  image_url: '',
  storage_path: '',
  region: '',
  club_name: '',
  is_published: true,
  display_order: 0,
});

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: 'ok' | 'err' }) {
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: type === 'ok' ? 'rgba(74,213,105,0.15)' : 'rgba(239,68,68,0.15)',
      border: `1px solid ${type === 'ok' ? 'rgba(74,213,105,0.4)' : 'rgba(239,68,68,0.4)'}`,
      color: type === 'ok' ? '#4ade80' : '#ef4444',
      borderRadius: '10px', padding: '12px 18px', fontSize: '13px', fontWeight: 600,
      display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '320px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      {type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {msg}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GalerieAdminPage() {
  const [photos,   setPhotos]   = useState<TournamentPhoto[]>([]);
  const [results,  setResults]  = useState<GalleryTournamentResult[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [form,     setForm]     = useState(emptyForm());
  const [delId,    setDelId]    = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadProg, setUploadProg] = useState(0);
  const [uploading,  setUploading]  = useState(false);
  const [source,   setSource]   = useState<'supabase' | 'fallback'>('fallback');
  const fileRef = useRef<HTMLInputElement>(null);
  const sb = isSupabaseConnected() ? getSupabaseClient() : null;
  const galleryTournaments = useMemo(
    () => MPL_TOURNAMENTS
      .filter(t => GALLERY_TOURNAMENT_CATEGORIES.has(t.category))
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
    []
  );
  const selectedTournamentId = useMemo(() => {
    const match = galleryTournaments.find(t =>
      t.name === form.tournament_name &&
      t.category === form.category &&
      t.division === form.division &&
      t.date === form.photo_date
    );
    return match?.id ?? '';
  }, [form.category, form.division, form.photo_date, form.tournament_name, galleryTournaments]);
  const winnerResultByTournament = useMemo(() => {
    const map = new Map<string, GalleryTournamentResult>();

    for (const result of results) {
      if (result.rank !== 1) continue;
      const exactKey = `${result.tournament_id}|${result.division}`;
      if (!map.has(exactKey)) map.set(exactKey, result);

      const looseKey = `${result.tournament_name}|${result.tournament_date}|${result.category}|${result.division}`;
      if (!map.has(looseKey)) map.set(looseKey, result);
    }

    return map;
  }, [results]);
  const selectedWinnerResult = useMemo(() => {
    const tournament = galleryTournaments.find(t => t.id === selectedTournamentId);
    if (!tournament) return undefined;

    return winnerResultByTournament.get(`${tournament.id}|${tournament.division}`) ??
      winnerResultByTournament.get(`${tournament.name}|${tournament.date}|${tournament.category}|${tournament.division}`);
  }, [galleryTournaments, selectedTournamentId, winnerResultByTournament]);

  const notify = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleTournamentSelect = (tournamentId: string) => {
    const tournament = galleryTournaments.find(t => t.id === tournamentId);
    if (!tournament) return;
    const winnerResult =
      winnerResultByTournament.get(`${tournament.id}|${tournament.division}`) ??
      winnerResultByTournament.get(`${tournament.name}|${tournament.date}|${tournament.category}|${tournament.division}`);
    const winnerNames = getWinnerNames(winnerResult);

    setForm(f => ({
      ...f,
      tournament_name: normalizeTournamentDisplayName(tournament.name, tournament.club_name),
      category: normalizeJuniorCategory(tournament.category),
      division: tournament.division,
      photo_date: tournament.date,
      region: tournament.region,
      club_name: tournament.club_name,
      winner_names: winnerNames.some(Boolean) ? winnerNames : f.winner_names,
      caption: winnerNames.some(Boolean)
        ? `Vainqueurs ${tournament.category} ${DIVISIONS.find(d => d.val === tournament.division)?.label ?? tournament.division}`
        : f.caption,
    }));

    if (!winnerNames.some(Boolean)) {
      notify('Tournoi sélectionné, mais aucun vainqueur trouvé dans les résultats', 'err');
    }
  };

  // ── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    if (!sb) { setLoading(false); return; }
    try {
      const [photoRes, resultRes] = await Promise.all([
        sb
          .from('tournament_photos')
          .select('*')
          .order('display_order', { ascending: true })
          .order('photo_date',    { ascending: false }),
        sb
          .from('tournament_results')
          .select('tournament_id,tournament_name,tournament_date,category,division,rank,player1_name,player2_name,team_name,club_name')
          .in('category', ['M500', 'M1000'])
          .eq('rank', 1)
          .limit(500),
      ]);

      if (!photoRes.error && photoRes.data) {
        setPhotos((photoRes.data as TournamentPhoto[]).map(photo => ({
          ...photo,
          category: normalizeJuniorCategory(photo.category),
          tournament_name: normalizeTournamentDisplayName(photo.tournament_name, photo.club_name),
        })));
        setSource('supabase');
      } else {
        notify('Erreur de chargement des photos', 'err');
      }

      if (!resultRes.error && resultRes.data) {
        setResults((resultRes.data as GalleryTournamentResult[]).map(result => ({
          ...result,
          category: normalizeJuniorCategory(result.category),
          tournament_name: normalizeTournamentDisplayName(result.tournament_name, result.club_name),
        })));
      } else {
        setResults([]);
        notify('Résultats indisponibles pour les vainqueurs automatiques', 'err');
      }
    } catch { notify('Erreur Supabase', 'err'); }
    setLoading(false);
  }, [sb]);

  useEffect(() => { load(); }, [load]);

  // ── Upload to Supabase Storage ────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    if (!sb) { notify('Supabase non connecté', 'err'); return; }
    setUploading(true); setUploadProg(10);

    const ext  = file.name.split('.').pop() ?? 'jpg';
    const slug = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `photos/${slug}`;

    try {
      setUploadProg(40);
      const { error: upErr } = await sb.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (upErr) throw upErr;
      setUploadProg(80);

      const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      const publicUrl = urlData?.publicUrl ?? '';
      setForm(f => ({ ...f, image_url: publicUrl, storage_path: path }));
      setPreviewUrl(publicUrl);
      setUploadProg(100);
      notify('Image uploadée avec succès');
    } catch (e: unknown) {
      notify(`Upload échoué : ${(e as Error).message ?? 'erreur inconnue'}`, 'err');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProg(0), 800);
    }
  };

  // ── Save (insert or update) ───────────────────────────────────────────────
  const handleSave = async () => {
    if (!sb) { notify('Supabase non connecté', 'err'); return; }
    if (!form.tournament_name.trim()) { notify('Nom du tournoi requis', 'err'); return; }
    if (!form.image_url.trim())       { notify('URL image ou upload requis', 'err'); return; }
    if (!form.photo_date)             { notify('Date requise', 'err'); return; }

    setSaving(true);
    const payload = {
      ...form,
      winner_names: form.winner_names.filter(n => n.trim() !== ''),
    };

    try {
      if (editId) {
        const { error } = await sb.from('tournament_photos').update(payload).eq('id', editId);
        if (error) throw error;
        notify('Photo mise à jour');
      } else {
        const { error } = await sb.from('tournament_photos').insert(payload);
        if (error) throw error;
        notify('Photo ajoutée');
      }
      setShowForm(false); setEditId(null); setForm(emptyForm()); setPreviewUrl('');
      await load();
    } catch (e: unknown) {
      notify(`Erreur : ${(e as Error).message}`, 'err');
    }
    setSaving(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (photo: TournamentPhoto) => {
    if (!sb) return;
    try {
      // Remove from storage if path exists
      if (photo.storage_path) {
        await sb.storage.from(STORAGE_BUCKET).remove([photo.storage_path]);
      }
      const { error } = await sb.from('tournament_photos').delete().eq('id', photo.id);
      if (error) throw error;
      notify('Photo supprimée');
      setDelId(null);
      await load();
    } catch (e: unknown) {
      notify(`Erreur : ${(e as Error).message}`, 'err');
    }
  };

  // ── Toggle publish ────────────────────────────────────────────────────────
  const togglePublish = async (photo: TournamentPhoto) => {
    if (!sb) return;
    const { error } = await sb.from('tournament_photos')
      .update({ is_published: !photo.is_published }).eq('id', photo.id);
    if (!error) {
      setPhotos(ps => ps.map(p => p.id === photo.id ? { ...p, is_published: !p.is_published } : p));
      notify(photo.is_published ? 'Photo masquée' : 'Photo publiée');
    }
  };

  // ── Move order ────────────────────────────────────────────────────────────
  const moveOrder = async (photo: TournamentPhoto, dir: 'up' | 'down') => {
    if (!sb) return;
    const sorted = [...photos].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex(p => p.id === photo.id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const swap = sorted[swapIdx];
    const [oa, ob] = [photo.display_order, swap.display_order];
    await sb.from('tournament_photos').update({ display_order: ob }).eq('id', photo.id);
    await sb.from('tournament_photos').update({ display_order: oa }).eq('id', swap.id);
    setPhotos(ps => ps.map(p => {
      if (p.id === photo.id) return { ...p, display_order: ob };
      if (p.id === swap.id)  return { ...p, display_order: oa };
      return p;
    }));
  };

  // ── Open edit form ────────────────────────────────────────────────────────
  const openEdit = (photo: TournamentPhoto) => {
    setForm({
      tournament_name: photo.tournament_name,
      category:        normalizeJuniorCategory(photo.category),
      division:        photo.division,
      winner_names:    photo.winner_names.length >= 2 ? photo.winner_names : [...photo.winner_names, ''],
      photo_date:      photo.photo_date,
      caption:         photo.caption ?? '',
      image_url:       photo.image_url,
      storage_path:    photo.storage_path ?? '',
      region:          photo.region ?? '',
      club_name:       photo.club_name ?? '',
      is_published:    photo.is_published,
      display_order:   photo.display_order,
    });
    setPreviewUrl(photo.image_url);
    setEditId(photo.id);
    setShowForm(true);
  };

  // ── Division badge ────────────────────────────────────────────────────────
  const divColor: Record<string, string> = { men:'#60a5fa', women:'#f472b6', mixed:'#a78bfa', junior:'#4ade80' };
  const divLabel: Record<string, string> = { men:'Hommes', women:'Dames', mixed:'Mixte', junior:'Junior' };

  const sorted = [...photos].sort((a, b) => a.display_order - b.display_order || a.photo_date.localeCompare(b.photo_date) * -1);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 24px', maxWidth: '1100px', margin: '0 auto' }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: 'white', fontWeight: 900, fontSize: '22px', margin: 0 }}>
            📸 Galerie — Gestion des Photos
          </h2>
          <div style={{ color: '#444', fontSize: '12px', marginTop: '4px' }}>
            {photos.length} photo(s) · {photos.filter(p => p.is_published).length} publiée(s) ·{' '}
            <span style={{ color: source === 'supabase' ? '#4ade80' : '#f59e0b' }}>
              {source === 'supabase' ? '🟢 Supabase' : '⚠️ Non connecté'}
            </span>
            {!sb && <span style={{ color:'#ef4444', marginLeft:'6px' }}>— configurez VITE_SUPABASE_URL</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', color: '#a0a0a0',
            borderRadius: '8px', padding: '8px 14px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button onClick={() => { setForm(emptyForm()); setEditId(null); setPreviewUrl(''); setShowForm(true); }}
            style={{ background: 'rgba(74,213,105,0.12)', border: '1px solid rgba(74,213,105,0.3)',
              color: '#4ade80', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
            <Plus size={15} /> Ajouter une photo
          </button>
        </div>
      </div>

      {/* ── Form ── */}
      {showForm && (
        <GlassCard style={{ padding: '24px', marginBottom: '24px',
          border: '1px solid rgba(74,213,105,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '20px' }}>
            <h3 style={{ color: 'white', fontWeight: 800, fontSize: '16px', margin: 0 }}>
              {editId ? '✏️ Modifier la photo' : '➕ Nouvelle photo'}
            </h3>
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '16px', marginBottom: '16px' }}>

            {/* Tournament name */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ display: 'block', color: '#666', fontSize: '11px',
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
                Nom du tournoi *
              </label>
              <select value={selectedTournamentId}
                onChange={e => handleTournamentSelect(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                  color: 'white', padding: '9px 12px', fontSize: '13px',
                  outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                <option value="">— Sélectionner un tournoi M500 ou M1000 du calendrier</option>
                {form.tournament_name && !selectedTournamentId && (
                  <option value="" disabled>{form.tournament_name}</option>
                )}
                {galleryTournaments.map(tournament => (
                  <option key={tournament.id} value={tournament.id}>
                    {formatTournamentOption(tournament)}
                  </option>
                ))}
              </select>
              <div style={{ color: '#444', fontSize: '11px', marginTop: '6px', lineHeight: 1.5 }}>
                Le choix remplit automatiquement la catégorie, la division, la date, la région et le club.
                {selectedTournamentId && (
                  <span style={{ color: selectedWinnerResult ? '#4ade80' : '#f59e0b', marginLeft: '8px' }}>
                    {selectedWinnerResult ? 'Vainqueurs trouvés dans les résultats.' : 'Aucun vainqueur trouvé dans les résultats.'}
                  </span>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <label style={{ display:'block', color:'#666', fontSize:'11px',
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }}>Catégorie *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:'8px', color:'white', padding:'9px 12px', fontSize:'13px', cursor:'pointer' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Division */}
            <div>
              <label style={{ display:'block', color:'#666', fontSize:'11px',
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }}>Division *</label>
              <select value={form.division} onChange={e => setForm(f => ({ ...f, division: e.target.value }))}
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:'8px', color:'white', padding:'9px 12px', fontSize:'13px', cursor:'pointer' }}>
                {DIVISIONS.map(d => <option key={d.val} value={d.val}>{d.label}</option>)}
              </select>
            </div>

            {/* Date */}
            <div>
              <label style={{ display:'block', color:'#666', fontSize:'11px',
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }}>Date *</label>
              <input type="date" value={form.photo_date}
                onChange={e => setForm(f => ({ ...f, photo_date: e.target.value }))}
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:'8px', color:'white', padding:'9px 12px', fontSize:'13px', cursor:'pointer',
                  outline:'none', boxSizing:'border-box', colorScheme:'dark' }} />
            </div>

            {/* Region */}
            <div>
              <label style={{ display:'block', color:'#666', fontSize:'11px',
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }}>Région</label>
              <select value={form.region ?? ''} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:'8px', color:'white', padding:'9px 12px', fontSize:'13px', cursor:'pointer' }}>
                <option value="">— Sélectionner</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Club */}
            <div>
              <label style={{ display:'block', color:'#666', fontSize:'11px',
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }}>Club organisateur</label>
              <input value={form.club_name ?? ''}
                onChange={e => setForm(f => ({ ...f, club_name: e.target.value }))}
                placeholder="RN1 Grand Baie"
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:'8px', color:'white', padding:'9px 12px', fontSize:'13px',
                  outline:'none', boxSizing:'border-box' }} />
            </div>

            {/* Winner 1 */}
            <div>
              <label style={{ display:'block', color:'#666', fontSize:'11px',
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }}>Vainqueur 1 *</label>
              <input value={form.winner_names[0] ?? ''}
                onChange={e => setForm(f => { const w = [...f.winner_names]; w[0] = e.target.value; return { ...f, winner_names: w }; })}
                placeholder="Prénom Nom"
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:'8px', color:'white', padding:'9px 12px', fontSize:'13px',
                  outline:'none', boxSizing:'border-box' }} />
            </div>

            {/* Winner 2 */}
            <div>
              <label style={{ display:'block', color:'#666', fontSize:'11px',
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }}>Vainqueur 2</label>
              <input value={form.winner_names[1] ?? ''}
                onChange={e => setForm(f => { const w = [...f.winner_names]; w[1] = e.target.value; return { ...f, winner_names: w }; })}
                placeholder="Prénom Nom"
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:'8px', color:'white', padding:'9px 12px', fontSize:'13px',
                  outline:'none', boxSizing:'border-box' }} />
            </div>

            {/* Caption */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ display:'block', color:'#666', fontSize:'11px',
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }}>Légende</label>
              <input value={form.caption ?? ''}
                onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                placeholder="Description optionnelle..."
                style={{ width:'100%', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:'8px', color:'white', padding:'9px 12px', fontSize:'13px',
                  outline:'none', boxSizing:'border-box' }} />
            </div>

            {/* Image upload + URL */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ display:'block', color:'#666', fontSize:'11px',
                textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'8px' }}>
                Image *
              </label>
              <div style={{ display:'flex', gap:'10px', alignItems:'flex-start', flexWrap:'wrap' }}>
                {/* Upload button */}
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  style={{ background:'rgba(201,168,76,0.1)', border:'1px solid rgba(201,168,76,0.3)',
                    color:'#C9A84C', borderRadius:'8px', padding:'9px 16px', cursor:'pointer',
                    display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', fontWeight:600,
                    opacity: uploading ? 0.6 : 1 }}>
                  <Upload size={14} />
                  {uploading ? `Upload… ${uploadProg}%` : 'Uploader'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value=''; }} />

                {/* Or URL */}
                <input value={form.image_url}
                  onChange={e => { setForm(f => ({ ...f, image_url: e.target.value })); setPreviewUrl(e.target.value); }}
                  placeholder="https://... ou utiliser l'upload ci-dessus"
                  style={{ flex:1, minWidth:'200px', background:'rgba(255,255,255,0.05)',
                    border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px',
                    color:'white', padding:'9px 12px', fontSize:'13px',
                    outline:'none', boxSizing:'border-box' }} />
              </div>

              {/* Progress bar */}
              {uploading && (
                <div style={{ height:'3px', background:'rgba(255,255,255,0.05)',
                  borderRadius:'2px', marginTop:'8px', overflow:'hidden' }}>
                  <div style={{ height:'100%', background:'#C9A84C',
                    width:`${uploadProg}%`, transition:'width 0.3s' }} />
                </div>
              )}

              {/* Preview */}
              {previewUrl && (
                <div style={{ marginTop:'12px', borderRadius:'8px', overflow:'hidden',
                  border:'1px solid rgba(255,255,255,0.08)', maxWidth:'200px' }}>
                  <img src={previewUrl} alt="preview"
                    style={{ width:'100%', display:'block', objectFit:'cover', aspectRatio:'4/3' }}
                    onError={() => setPreviewUrl('')} />
                </div>
              )}
            </div>

            {/* Display order + Published */}
            <div style={{ display:'flex', gap:'16px', alignItems:'center', gridColumn:'1/-1' }}>
              <div>
                <label style={{ display:'block', color:'#666', fontSize:'11px',
                  textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }}>Ordre d'affichage</label>
                <input type="number" min={0} value={form.display_order}
                  onChange={e => setForm(f => ({ ...f, display_order: Number(e.target.value) }))}
                  style={{ width:'80px', background:'rgba(255,255,255,0.05)',
                    border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px',
                    color:'white', padding:'9px 12px', fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'14px' }}>
                <button onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
                  style={{ background: form.is_published ? 'rgba(74,213,105,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${form.is_published ? 'rgba(74,213,105,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    color: form.is_published ? '#4ade80' : '#555',
                    borderRadius:'8px', padding:'8px 14px', cursor:'pointer',
                    display:'flex', alignItems:'center', gap:'6px', fontSize:'13px' }}>
                  {form.is_published ? <><Eye size={13}/> Publiée</> : <><EyeOff size={13}/> Brouillon</>}
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end',
            borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'16px' }}>
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                color:'#a0a0a0', borderRadius:'8px', padding:'9px 18px', cursor:'pointer', fontSize:'13px' }}>
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ background:'rgba(74,213,105,0.15)', border:'1px solid rgba(74,213,105,0.3)',
                color:'#4ade80', borderRadius:'8px', padding:'9px 20px', cursor:'pointer',
                display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', fontWeight:700,
                opacity: saving ? 0.7 : 1 }}>
              <Save size={14} /> {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
        </GlassCard>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'#555' }}>
          <RefreshCw size={24} style={{ animation:'spin 1s linear infinite', marginBottom:'12px' }} />
          <div>Chargement…</div>
        </div>
      ) : photos.length === 0 ? (
        <GlassCard style={{ padding:'60px', textAlign:'center' }}>
          <Camera size={40} color="#333" style={{ marginBottom:'16px' }} />
          <div style={{ color:'#555', fontSize:'16px', marginBottom:'8px' }}>Aucune photo</div>
          <div style={{ color:'#333', fontSize:'13px' }}>
            {sb ? 'Ajoutez votre première photo via le bouton ci-dessus.' : 'Connectez Supabase pour gérer les photos.'}
          </div>
        </GlassCard>
      ) : (
        <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Ordre', 'Photo', 'Tournoi', 'Catégorie', 'Division', 'Vainqueurs', 'Date', 'Statut', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#444',
                      fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((photo, i) => (
                  <tr key={photo.id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      opacity: photo.is_published ? 1 : 0.5 }}>

                    {/* Order */}
                    <td style={{ padding: '10px 14px', whiteSpace:'nowrap' }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                        <button onClick={() => moveOrder(photo, 'up')} disabled={i === 0}
                          style={{ background:'none', border:'none', color: i===0 ? '#333':'#666',
                            cursor: i===0 ? 'default':'pointer', padding:'1px' }}>
                          <ChevronUp size={13} />
                        </button>
                        <span style={{ color:'#555', textAlign:'center', fontSize:'11px' }}>{photo.display_order}</span>
                        <button onClick={() => moveOrder(photo, 'down')} disabled={i === sorted.length - 1}
                          style={{ background:'none', border:'none', color: i===sorted.length-1 ? '#333':'#666',
                            cursor: i===sorted.length-1 ? 'default':'pointer', padding:'1px' }}>
                          <ChevronDown size={13} />
                        </button>
                      </div>
                    </td>

                    {/* Thumbnail */}
                    <td style={{ padding: '8px 14px' }}>
                      <div style={{ width:'56px', height:'42px', borderRadius:'6px',
                        overflow:'hidden', background:'#1a1a1a', flexShrink:0 }}>
                        <img src={photo.image_url} alt=""
                          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                          onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                      </div>
                    </td>

                    {/* Name */}
                    <td style={{ padding:'10px 14px', maxWidth:'200px' }}>
                      <div style={{ color:'white', fontWeight:700, fontSize:'12px',
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {photo.tournament_name}
                      </div>
                      {photo.club_name && <div style={{ color:'#444', fontSize:'11px' }}>{photo.club_name}</div>}
                    </td>

                    {/* Category */}
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ background:'rgba(139,92,246,0.15)', color:'#a78bfa',
                        borderRadius:'5px', padding:'2px 8px', fontSize:'11px', fontWeight:700 }}>
                        {photo.category}
                      </span>
                    </td>

                    {/* Division */}
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ background:`${divColor[photo.division] ?? '#888'}20`,
                        color: divColor[photo.division] ?? '#888',
                        borderRadius:'5px', padding:'2px 8px', fontSize:'11px', fontWeight:700 }}>
                        {divLabel[photo.division] ?? photo.division}
                      </span>
                    </td>

                    {/* Winners */}
                    <td style={{ padding:'10px 14px', maxWidth:'160px' }}>
                      <div style={{ color:'#C9A84C', fontSize:'12px', fontWeight:700,
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {photo.winner_names.join(' · ')}
                      </div>
                    </td>

                    {/* Date */}
                    <td style={{ padding:'10px 14px', color:'#555', fontSize:'12px', whiteSpace:'nowrap' }}>
                      {new Date(photo.photo_date).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })}
                    </td>

                    {/* Status */}
                    <td style={{ padding:'10px 14px' }}>
                      <button onClick={() => togglePublish(photo)}
                        style={{ background: photo.is_published ? 'rgba(74,213,105,0.1)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${photo.is_published ? 'rgba(74,213,105,0.25)' : 'rgba(255,255,255,0.08)'}`,
                          color: photo.is_published ? '#4ade80' : '#555',
                          borderRadius:'6px', padding:'4px 10px', cursor:'pointer', fontSize:'11px',
                          display:'flex', alignItems:'center', gap:'4px', fontWeight:600, whiteSpace:'nowrap' }}>
                        {photo.is_published ? <><Eye size={11}/> Publiée</> : <><EyeOff size={11}/> Brouillon</>}
                      </button>
                    </td>

                    {/* Actions */}
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button onClick={() => openEdit(photo)}
                          style={{ background:'rgba(59,130,246,0.1)', border:'1px solid rgba(59,130,246,0.2)',
                            color:'#60a5fa', borderRadius:'6px', padding:'5px 9px', cursor:'pointer' }}>
                          <Pencil size={12} />
                        </button>
                        {delId === photo.id ? (
                          <>
                            <button onClick={() => handleDelete(photo)}
                              style={{ background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)',
                                color:'#ef4444', borderRadius:'6px', padding:'5px 9px', cursor:'pointer', fontSize:'11px', fontWeight:700 }}>
                              Confirmer
                            </button>
                            <button onClick={() => setDelId(null)}
                              style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
                                color:'#555', borderRadius:'6px', padding:'5px 9px', cursor:'pointer' }}>
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setDelId(photo.id)}
                            style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.15)',
                              color:'#ef4444', borderRadius:'6px', padding:'5px 9px', cursor:'pointer' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Supabase setup hint */}
      {!sb && (
        <GlassCard style={{ padding:'16px 20px', marginTop:'20px',
          border:'1px solid rgba(245,158,11,0.2)', background:'rgba(245,158,11,0.04)' }}>
          <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
            <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink:0, marginTop:'1px' }} />
            <div>
              <div style={{ color:'#f59e0b', fontWeight:700, fontSize:'13px', marginBottom:'4px' }}>
                Supabase Storage non configuré
              </div>
              <div style={{ color:'#666', fontSize:'12px', lineHeight:1.6 }}>
                Pour activer l'upload et la persistance des photos :<br/>
                1. Configurez <code style={{ color:'#a0a0a0' }}>VITE_SUPABASE_URL</code> et{' '}
                <code style={{ color:'#a0a0a0' }}>VITE_SUPABASE_ANON_KEY</code> dans votre <code style={{ color:'#a0a0a0' }}>.env</code><br/>
                2. Exécutez <code style={{ color:'#a0a0a0' }}>gallery_migration.sql</code> dans Supabase SQL Editor<br/>
                3. Créez le bucket <code style={{ color:'#a0a0a0' }}>tournament-photos</code> (public) dans Supabase Storage
              </div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

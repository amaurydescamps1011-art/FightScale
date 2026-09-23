/* Ce que les deux fonctions de paiement partagent.

   Aucune dependance : ni SDK Stripe, ni supabase-js. Le reste du projet est un
   site sans build ni paquet, et une fonction qui tire une bibliotheque depuis
   un CDN a chaque deploiement casse le jour ou la version epinglee disparait.
   L'API Stripe est du POST en formulaire et du JSON en retour, PostgREST est du
   HTTP : il n'y a rien a abstraire. */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(corps: unknown, code = 200): Response {
  return new Response(JSON.stringify(corps),
    { status: code, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** Une variable d'environnement obligatoire, ou une erreur qui la nomme. */
export function env(nom: string): string {
  const v = Deno.env.get(nom);
  if (!v) throw new Error('variable d\'environnement absente : ' + nom);
  return v;
}

/* ------------------------------------------------------------------ Stripe */

/* L'API Stripe prend des formulaires, avec les objets imbriques entre crochets :
   `line_items[0][price]=price_123`. On aplatit donc l'objet plutot que d'ecrire
   ces cles a la main, ou la moindre faute de frappe passe inapercue. */
function aplatit(o: unknown, prefixe = '', sortie = new URLSearchParams()): URLSearchParams {
  if (o === null || o === undefined) return sortie;
  if (Array.isArray(o)) {
    o.forEach((v, i) => aplatit(v, prefixe + '[' + i + ']', sortie));
  } else if (typeof o === 'object') {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      aplatit(v, prefixe ? prefixe + '[' + k + ']' : k, sortie);
    }
  } else {
    sortie.append(prefixe, String(o));
  }
  return sortie;
}

export async function stripe(chemin: string, corps?: unknown): Promise<any> {
  const r = await fetch('https://api.stripe.com/v1/' + chemin, {
    method: corps ? 'POST' : 'GET',
    headers: {
      'Authorization': 'Bearer ' + env('STRIPE_CLE'),
      'Content-Type': 'application/x-www-form-urlencoded',
      /* Epinglee : sans ca, Stripe sert la version du compte, qui change le
         jour ou quelqu'un clique « mettre a jour » dans le tableau de bord. */
      'Stripe-Version': '2024-06-20',
    },
    body: corps ? aplatit(corps).toString() : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error('Stripe ' + r.status + ' : ' + (d?.error?.message || chemin));
  return d;
}

/* --------------------------------------------------------------- PostgREST */

/* Ecrire avec la cle service_role, c'est passer a cote du RLS. Elle ne vit que
   dans les secrets de la fonction et ne doit jamais partir vers une page. */
export async function base(
  chemin: string,
  init: RequestInit & { cle?: string; jeton?: string } = {},
): Promise<any> {
  const cle = init.cle || env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(env('SUPABASE_URL') + '/rest/v1/' + chemin, {
    ...init,
    headers: {
      'apikey': cle,
      'Authorization': 'Bearer ' + (init.jeton || cle),
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates',
      ...(init.headers || {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error('base ' + r.status + ' : ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

/* ------------------------------------------------------------------ le club */

/** L'identifiant du club que ce compte gere, ou null. */
export async function clubDuGerant(uid: string): Promise<string | null> {
  const l = await base('club_membre?select=club_id&membre_id=eq.' + uid + '&limit=1');
  return l?.[0]?.club_id ?? null;
}

/** Le `sub` du jeton. La plateforme a deja verifie la signature (verify_jwt),
 *  donc on se contente de lire la charge utile -- la verifier une seconde fois
 *  demanderait le secret JWT du projet dans les secrets de la fonction. */
export function gerantDuJeton(req: Request): string | null {
  const h = req.headers.get('Authorization') || '';
  const jwt = h.replace(/^Bearer\s+/i, '');
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const p = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return p.sub || null;
  } catch { return null; }
}
